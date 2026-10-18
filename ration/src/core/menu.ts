import { TREAT_KCAL, type Day, type MealItem, type MenuPlan, type NutrientKey, type PlanAddon, type PlanDish, type Product, type Targets, type Tier } from "./types";
import { ADDONS, COMP_RANGE, DISHES, type Comp, type Dish, type Slot } from "./recipes";
import { LAYOUT } from "./planner";
import { humanGrams, repairRounding, type Adjustable } from "./portions";
import { isFruit, isVegetable, type LpInput, type LpSolution, type SolveFn } from "./solver";

/**
 * Меню из блюд (смешанно-целочисленная задача HiGHS).
 * На пару «блюдо × приём пищи» — выбор длины b (3 дня Пн–Ср, 4 дня Чт–Вс, 7 дней для завтрака и перекуса) и порции
 * каждой части блюда (белок, гарнир, овощи, остальное) в пределах COMP_RANGE от стандартной, в пропорциях блюда.
 * Обед и ужин — по два разных блюда на неделю, завтрак и перекус — одно или два. Калории Пн–Ср и Чт–Вс отличаются
 * не больше чем на 5 %, при диабете углеводы приёма пищи — не больше чем на 1 ХЕ.
 * Добавки (фрукт, хлеб, кефир …) — одинаковые каждый день, не больше addonCap штук; десерт — один.
 * Нормы — как у корзины продуктов: в среднем за неделю, витамины — мягко со штрафом.
 * Продуктов в неделе выходит 20–25: блюд мало, и у них общая основа (гречка, курица, капуста, морковь, лук).
 */

export interface Level { perSlot: number; addonCap: number }
const LEVELS: Level[] = [
  { perSlot: 2, addonCap: 3 },
  { perSlot: 2, addonCap: 5 },
  { perSlot: 3, addonCap: 6 },
];
const LEGUME_RECIPES = new Set(["pea_soup", "lentil_soup", "bean_stew"]);
const PENALTY: Record<"high" | "low", number> = { high: 6000, low: 1200 };
const QUALITY_WEIGHT: Record<Tier, number> = { econom: 0.1, business: 0.5, premium: 0.8 };

const fmt = (v: number) => (Math.abs(v) < 1e-9 ? "0" : v.toFixed(6).replace(/\.?0+$/, ""));
function row(terms: Array<[number, string]>): string {
  const parts: string[] = [];
  for (const [c, v] of terms) {
    if (Math.abs(c) < 1e-12) continue;
    parts.push(`${c < 0 ? "-" : "+"} ${fmt(Math.abs(c))} ${v}`);
  }
  return parts.length ? parts.join(" ") : "0 x__zero";
}

export interface MenuOutcome {
  status: string;
  basket: Record<string, number>;
  days: Day[];
  menu: MenuPlan;
  shortfalls: Array<{ key: string; fraction: number }>;
}

type Pair = { j: number; k: number; dish: Dish; comps: Comp[] };

/** relax — непрерывная задача (подсказка, какие блюда выгодны); keep — оставить только эти пары «блюдо@приём». */
export interface BuildOpts { relax?: boolean; keep?: Set<string> }
export const pairKey = (dish: string, k: number) => `${dish}@${k}`;

export function buildMenuLp(input: LpInput, level: Level, opts: BuildOpts = {}) {
  const { products, profile, targets, macro, restrictions, energyKcal } = input;
  const byId = new Map(products.map((p) => [p.id, p]));
  const ok = (id: string) => byId.has(id) && !restrictions.excluded.has(id);
  const layout = LAYOUT[profile.mealsPerDay];
  const dishes = DISHES.filter((d) => d.ing.every((i) => ok(i.id)));
  const diabetic = profile.diabetes !== "none";
  const qw = QUALITY_WEIGHT[profile.tier];
  const unitCost = (p: Product) => Math.max(((p.prices[profile.tier] ?? 0) / 1000) * (1 - qw * p.quality), 0.00001);

  const pairs: Pair[] = [];
  dishes.forEach((dish, j) => layout.forEach((s, k) => {
    if (dish.slots.includes(s.slot) && (!opts.keep || opts.keep.has(pairKey(dish.id, k)))) pairs.push({ j, k, dish, comps: [...new Set(dish.ing.map((i) => i.comp))] });
  }));
  const z = (p: Pair) => `z${p.j}_${p.k}`;
  const d = (p: Pair) => `d${p.j}_${p.k}`;
  const q = (p: Pair, c: Comp) => `q${p.j}_${p.k}_${c}`;

  const addons = Object.entries(ADDONS).filter(([id]) => ok(id)).map(([id, a]) => ({ id, ...a, p: byId.get(id)! }));
  const treats = products.filter((p) => ok(p.id) && p.tags.includes("treat"));
  const treatBudget = TREAT_KCAL[profile.treats] * 7;
  const capOf = (p: Product) => Math.min(p.max_week_g ?? 1e6, restrictions.caps[p.id] ?? Infinity);

  const obj: Array<[number, string]> = [];
  const rows: string[] = [];
  const bounds: string[] = [];
  const binaries: string[] = [];
  const slackKeys: string[] = [];

  // Граммы продукта за неделю: линейная форма от q (блюда), a (добавки), t (десерт)
  const usage = new Map<string, Array<[number, string]>>();
  const use = (id: string, c: number, v: string) => { if (!usage.has(id)) usage.set(id, []); usage.get(id)!.push([c, v]); };

  // Сколько дней подряд идёт блюдо: одно на всю неделю (завтрак, перекус) или 3 + 4 дня; запасной уровень — ещё 2 + 2 + 3.
  // Блюда на 3 дня идут в Пн–Ср, на 4 — в Чт–Вс.
  const lengths = level.perSlot >= 3 ? [2, 3, 4, 7] : [3, 4, 7];
  const daily = (k: number) => layout[k].slot === "breakfast" || layout[k].slot === "snack";
  // Что нельзя заморозить, хранится 3 дня — такое блюдо идёт не дольше 3 дней подряд
  const lensOf = (p: Pair) => lengths.filter((n) => (n < 7 || daily(p.k)) && !(n > p.dish.fridge && p.dish.cook === "batch" && !p.dish.freeze));
  const b = (p: Pair, n: number) => `b${p.j}_${p.k}_${n}`;
  const qn = (p: Pair, c: Comp, n: number) => `${q(p, c)}_${n}`;
  // Разница калорий порций Пн–Ср и Чт–Вс (а при диабете — углеводов в каждом приёме пищи): дни выходят ровными
  const balK: Array<[number, string]> = [];
  const balC = layout.map((): Array<[number, string]> => []);
  for (const p of pairs) {
    const ls = lensOf(p);
    for (const n of ls) binaries.push(b(p, n));
    rows.push(`zb_${z(p)}: ${z(p)} ${ls.map((n) => `- ${b(p, n)}`).join(" ")} = 0`);
    rows.push(`db_${d(p)}: ${d(p)} ${ls.map((n) => `- ${n} ${b(p, n)}`).join(" ")} = 0`);
    bounds.push(`0 <= ${z(p)} <= 1`, `0 <= ${d(p)} <= 7`);
    const share = layout[p.k].share;
    const kcalN = new Map<number, Array<[number, string]>>(ls.map((n) => [n, []]));
    for (const c of p.comps) {
      const [lo, hi] = COMP_RANGE[c];
      let k = 0, carbs = 0;
      for (const i of p.dish.ing.filter((x) => x.comp === c)) {
        const pr = byId.get(i.id)!;
        use(i.id, i.g, q(p, c));
        k += (pr.per100g.kcal * i.g) / 100;
        carbs += (pr.per100g.carbs * i.g) / 100;
        obj.push([unitCost(pr) * i.g, q(p, c)]);
      }
      // q — порций этой части за неделю; по каждой длине — от lo до hi стандартной порции в день
      rows.push(`qs_${q(p, c)}: ${q(p, c)} ${ls.map((n) => `- ${qn(p, c, n)}`).join(" ")} = 0`);
      for (const n of ls) {
        rows.push(`lo_${qn(p, c, n)}: ${qn(p, c, n)} - ${fmt(lo * n)} ${b(p, n)} >= 0`);
        rows.push(`hi_${qn(p, c, n)}: ${qn(p, c, n)} - ${fmt(hi * n)} ${b(p, n)} <= 0`);
        kcalN.get(n)!.push([k, qn(p, c, n)]);
        if (n === 3 || n === 4) {
          balK.push([(n === 3 ? 1 : -1) * k / n, qn(p, c, n)]);
          if (diabetic) balC[p.k].push([(n === 3 ? 1 : -1) * carbs / n, qn(p, c, n)]);
        }
      }
    }
    // Пропорции блюда: части меняются вместе (каша не становится супом): не больше чем в 1,6 раза друг от друга,
    // масло и соль — в 2 раза
    for (const c1 of p.comps) for (const c2 of p.comps) {
      if (c1 === c2) continue;
      const r = c1 === "x" || c2 === "x" ? 2 : 1.6;
      rows.push(`r_${q(p, c1)}_${c2}: ${q(p, c1)} - ${fmt(r)} ${q(p, c2)} <= 0`);
    }
    // Порция по калориям близка к доле приёма пищи
    const [klo, khi] = diabetic ? [0.7, 1.2] : [0.6, 1.3];
    for (const n of ls) {
      rows.push(`klo_${b(p, n)}: ${row([...kcalN.get(n)!, [-klo * share * energyKcal * n, b(p, n)]])} >= 0`);
      rows.push(`khi_${b(p, n)}: ${row([...kcalN.get(n)!, [-khi * share * energyKcal * n, b(p, n)]])} <= 0`);
    }
  }
  if (level.perSlot < 3) {
    if (balK.length) {
      rows.push(`bal_lo: ${row(balK)} >= ${fmt(-0.05 * energyKcal)}`);
      rows.push(`bal_hi: ${row(balK)} <= ${fmt(0.05 * energyKcal)}`);
    }
    // при диабете — углеводы приёма пищи в Пн–Ср и Чт–Вс отличаются не больше чем на 1 ХЕ
    balC.forEach((t, k) => {
      if (!t.length) return;
      rows.push(`balc_lo_${k}: ${row(t)} >= -10`);
      rows.push(`balc_hi_${k}: ${row(t)} <= 10`);
    });
  }
  // Каждый приём пищи — все 7 дней; не больше perSlot блюд; обед и ужин — два блюда
  layout.forEach((_, k) => {
    const ps = pairs.filter((p) => p.k === k);
    if (!ps.length) return;
    const bs = (n: number, c = 1) => ps.filter((p) => lensOf(p).includes(n)).map((p): [number, string] => [c, b(p, n)]);
    rows.push(`days_${k}: ${row(ps.map((p) => [1, d(p)]))} = 7`);
    rows.push(`n_${k}: ${row(ps.map((p) => [1, z(p)]))} <= ${level.perSlot}`);
    if (level.perSlot < 3) {
      // ровно одно блюдо на 3 дня и одно на 4 (завтрак и перекус — или одно на всю неделю)
      if (daily(k)) {
        rows.push(`p34_${k}: ${row([...bs(3), ...bs(4, -1)])} = 0`);
        rows.push(`p7_${k}: ${row([...bs(7), ...bs(3)])} = 1`);
      } else {
        rows.push(`p3_${k}: ${row(bs(3))} = 1`);
        rows.push(`p4_${k}: ${row(bs(4))} = 1`);
      }
    } else if (!daily(k)) rows.push(`nmin_${k}: ${row(ps.map((p) => [1, z(p)]))} >= 2`);
    // второй завтрак/перекус — лишняя сложность: небольшой штраф за каждое блюдо сверх первого
    if (daily(k)) for (const p of ps) obj.push([12, z(p)]);
  });
  // Одно блюдо — в одном приёме пищи (одинаковые порции в контейнерах)
  const byDish = new Map<number, Pair[]>();
  for (const p of pairs) { if (!byDish.has(p.j)) byDish.set(p.j, []); byDish.get(p.j)!.push(p); }
  for (const [j, ps] of byDish) if (ps.length > 1) rows.push(`one_${j}: ${row(ps.map((p) => [1, z(p)]))} <= 1`);
  // Бобовые (гороховый, чечевичный суп, рагу из фасоли) — лучше одно блюдо в неделю (веганам — два): каждое следующее
  // со штрафом, без запрета — иначе при непереносимостях не хватает белка
  const legumes = pairs.filter((p) => LEGUME_RECIPES.has(p.dish.recipe));
  if (legumes.length) {
    rows.push(`legumes: ${row([...legumes.map((p): [number, string] => [1, z(p)]), [-1, "s_legumes"]])} <= ${profile.exclusions.includes("vegan") ? 2 : 1}`);
    obj.push([300, "s_legumes"]);
  }
  // Варианты одного рецепта (курица / индейка) — не больше одного в неделю
  const byRecipe = new Map<string, Pair[]>();
  for (const p of pairs) { if (!byRecipe.has(p.dish.recipe)) byRecipe.set(p.dish.recipe, []); byRecipe.get(p.dish.recipe)!.push(p); }
  for (const [r, ps] of byRecipe) if (new Set(ps.map((p) => p.j)).size > 1) rows.push(`rec_${r}: ${row(ps.map((p) => [1, z(p)]))} <= 1`);

  // Добавки: одинаково каждый день, от min до max г/день
  for (const a of addons) {
    const v = `a_${a.id}`, u = `u_${a.id}`;
    binaries.push(u);
    const max = Math.min(7 * a.max, capOf(a.p));
    if (max < 7 * a.min) continue;
    rows.push(`alo_${a.id}: ${v} - ${fmt(7 * a.min)} ${u} >= 0`);
    rows.push(`ahi_${a.id}: ${v} - ${fmt(max)} ${u} <= 0`);
    use(a.id, 1, v);
    obj.push([unitCost(a.p), v]);
  }
  if (addons.length) rows.push(`addons: ${row(addons.map((a) => [1, `u_${a.id}`]))} <= ${level.addonCap}`);

  // Десерт: один продукт, калории — в коридоре бюджета
  if (treats.length && treatBudget > 0) {
    for (const p of treats) {
      const v = `t_${p.id}`, u = `ut_${p.id}`;
      binaries.push(u);
      rows.push(`thi_${p.id}: ${v} - ${fmt(capOf(p))} ${u} <= 0`);
      rows.push(`tlo_${p.id}: ${v} - ${fmt(Math.min(p.min_week_g, capOf(p)))} ${u} >= 0`);
      use(p.id, 1, v);
      obj.push([unitCost(p), v]);
    }
    rows.push(`treat_one: ${row(treats.map((p) => [1, `ut_${p.id}`]))} <= 1`);
    const kcalTerms = treats.map((p): [number, string] => [p.per100g.kcal / 100, `t_${p.id}`]);
    rows.push(`max_treat_kcal: ${row(kcalTerms)} <= ${fmt(treatBudget * 1.15)}`);
    rows.push(`min_treat_kcal: ${row(kcalTerms)} + ${fmt(treatBudget * 0.8)} s_treats >= ${fmt(treatBudget * 0.8)}`);
    bounds.push(`0 <= s_treats <= 1`);
    obj.push([PENALTY.low, "s_treats"]);
    slackKeys.push("treats");
  }

  // Лимиты на продукт за неделю
  const used = [...usage.keys()];
  for (const id of used) {
    const cap = capOf(byId.get(id)!);
    if (cap < 1e6) rows.push(`cap_${id}: ${row(usage.get(id)!)} <= ${fmt(cap)}`);
  }

  // Нутриенты за неделю
  const nutTerms = (key: NutrientKey | ((p: Product) => number)) => {
    const f = typeof key === "function" ? key : (p: Product) => p.per100g[key];
    const out: Array<[number, string]> = [];
    for (const id of used) {
      const p = byId.get(id)!;
      const c = f(p) / 100;
      if (!c) continue;
      for (const [g, v] of usage.get(id)!) out.push([c * g, v]);
    }
    return mergeTerms(out);
  };
  for (const [key, tg] of Object.entries(targets) as [NutrientKey, NonNullable<Targets[NutrientKey]>][]) {
    const terms = nutTerms(key);
    if (tg.min != null && tg.min > 0) {
      const T = 7 * tg.min;
      if (tg.priority === "hard") rows.push(`min_${key}: ${row(terms)} >= ${fmt(T)}`);
      else {
        slackKeys.push(key);
        rows.push(`min_${key}: ${row(terms)} + ${fmt(T)} s_${key} >= ${fmt(T)}`);
        bounds.push(`0 <= s_${key} <= 1`);
        obj.push([PENALTY[tg.priority], `s_${key}`]);
      }
    }
    if (tg.max != null) rows.push(`max_${key}: ${row(terms)} <= ${fmt(7 * tg.max)}`);
  }
  const sugar = nutTerms((p) => (p.tags.includes("added_sugar") ? p.per100g.sugars : 0));
  if (sugar.length) rows.push(`max_added_sugar: ${row(sugar)} <= ${fmt((7 * energyKcal * macro.addedSugarPct) / 4)}`);

  // Группы продуктов (мягко): овощи и фрукты по ВОЗ, рыба, молочные
  const groupTerms = (pred: (p: Product) => boolean) => mergeTerms(used.filter((id) => pred(byId.get(id)!)).flatMap((id) => usage.get(id)!));
  const soft = (name: string, terms: Array<[number, string]>, minWeek: number, pr: "high" | "low") => {
    if (!terms.length) return;
    rows.push(`min_${name}: ${row(terms)} + ${fmt(minWeek)} s_${name} >= ${fmt(minWeek)}`);
    bounds.push(`0 <= s_${name} <= 1`);
    obj.push([PENALTY[pr], `s_${name}`]);
    slackKeys.push(name);
  };
  soft("veg_fruit", groupTerms((p) => isVegetable(p) || isFruit(p)), 7 * 400, "high");
  soft("veg", groupTerms(isVegetable), 7 * 250, "high");
  soft("fruit", groupTerms(isFruit), 7 * 150, "high");
  soft("fish", groupTerms((p) => p.group === "fish"), 300, "high");
  soft("animal_protein", groupTerms((p) => p.group === "protein_animal"), 600, "low");
  soft("dairy", groupTerms((p) => p.category === "dairy"), 1000, "low");

  bounds.push(`0 <= x__zero <= 0`);
  const lp = ["Minimize", ` obj: ${row(mergeTerms(obj))}`, "Subject To", ...rows.map((r) => ` ${r}`), "Bounds", ...bounds.map((b) => ` ${b}`),
    ...(opts.relax ? binaries.map((v) => ` 0 <= ${v} <= 1`) : ["Binary", ` ${binaries.join(" ")}`]), "End"].join("\n");
  return { lp, pairs, addons, treats, slackKeys, layout, byId };
}

function mergeTerms(terms: Array<[number, string]>): Array<[number, string]> {
  const m = new Map<string, number>();
  for (const [c, v] of terms) m.set(v, (m.get(v) ?? 0) + c);
  return [...m.entries()].map(([v, c]) => [c, v]);
}

const round = (g: number) => (g < 20 ? Math.round(g * 10) / 10 : Math.round(g));

/** Меню из блюд; null — не нашлось ни на одном уровне упрощения (тогда рацион собирается по-старому, из продуктов). */
export function solveMenu(input: LpInput, solve: SolveFn): MenuOutcome | null {
  // На всё меню — не дольше 9 секунд; не сложилось — рацион соберётся из продуктов
  const deadline = Date.now() + 9000;
  const usable = (sol: LpSolution) => sol.status === "Optimal" || (sol.status === "Time limit reached" && Number.isFinite(sol.objective) && sol.objective < 1e20);
  for (const level of LEVELS) {
    // Непрерывная задача решается за доли секунды и подсказывает выгодные блюда; целочисленная — только среди лучших
    // кандидатов каждого приёма пищи (иначе 150–200 пар «блюдо × приём» считаются 10–20 секунд). Не вышло — шире.
    const relaxed = buildMenuLp(input, level, { relax: true });
    const lp = solve(relaxed.lp);
    if (lp.status !== "Optimal") continue;
    const zOf = (p: Pair) => lp.columns[`z${p.j}_${p.k}`] ?? 0;
    const rcOf = (p: Pair) => Math.min(...Object.entries(lp.reduced ?? {}).filter(([v]) => v.startsWith(`b${p.j}_${p.k}_`)).map(([, r]) => r), 1e9);
    const ranked = relaxed.layout.map((_, k) => relaxed.pairs.filter((p) => p.k === k)
      .map((p) => ({ p, z: zOf(p), rc: rcOf(p) }))
      .sort((a, b) => b.z - a.z || a.rc - b.rc)
      .map((x) => pairKey(x.p.dish.id, k)));
    for (const top of [8, 16, Infinity]) {
      const keep = new Set(ranked.flatMap((r) => r.slice(0, top)));
      const built = buildMenuLp(input, level, { keep });
      // Разрыв 10 %: на проверочных профилях меню то же, что и с 2 %, а считается за 1–3 секунды вместо 10–20
      const left = (deadline - Date.now()) / 1000;
      if (left < 1) return null;
      const sol = solve(built.lp, { gap: 0.1, timeLimit: Math.min(top === Infinity ? 6 : 4, left) });
      if (!usable(sol)) continue;
      const out = readSolution(input, built, sol.columns);
      if (out) return out;
    }
  }
  return null;
}

function readSolution(input: LpInput, built: ReturnType<typeof buildMenuLp>, col: Record<string, number>): MenuOutcome | null {
  const { pairs, layout, byId } = built;
  const val = (v: string) => col[v] ?? 0;
  const dishes: PlanDish[] = [];
  const raw = new Map<string, number>();
  for (let k = 0; k < layout.length; k++) {
    const chosen = pairs.filter((p) => p.k === k && Math.round(val(`d${p.j}_${p.k}`)) > 0);
    if (chosen.reduce((a, p) => a + Math.round(val(`d${p.j}_${p.k}`)), 0) !== 7) return null;
    // Порядок в неделе: короче — раньше (на 3 дня — Пн–Ср, на 4 — Чт–Вс)
    chosen.sort((a, b) => val(`d${a.j}_${a.k}`) - val(`d${b.j}_${b.k}`) || a.dish.id.localeCompare(b.dish.id));
    let start = 0;
    for (const p of chosen) {
      const n = Math.round(val(`d${p.j}_${p.k}`));
      const serving = new Map<string, number>();
      for (const i of p.dish.ing) serving.set(i.id, (serving.get(i.id) ?? 0) + (val(`q${p.j}_${p.k}_${i.comp}`) / n) * i.g);
      dishes.push({
        dish: p.dish.id, name: p.dish.name, slot: k,
        days: Array.from({ length: n }, (_, i) => start + i),
        serving: [...serving.entries()].map(([productId, g]) => { raw.set(`${k}:${p.dish.id}:${productId}`, g); return { productId, grams: humanGrams(byId.get(productId)!, g) }; }).filter((x) => x.grams > 0),
      });
      start += n;
    }
  }
  const slotOf = (pref: Slot): number => {
    const idx = (s: Slot) => layout.map((l, i) => (l.slot === s ? i : -1)).filter((i) => i >= 0);
    const hit = idx(pref);
    if (hit.length) return pref === "snack" ? hit[hit.length - 1] : hit[0];
    if (pref === "snack") return idx("breakfast")[0];
    return pref === "dinner" ? layout.length - 1 : idx("lunch")[0] ?? 0;
  };
  const addons: PlanAddon[] = [];
  for (const a of built.addons) {
    const g = val(`a_${a.id}`);
    if (g > 1) { addons.push({ productId: a.id, perDay: humanGrams(a.p, g / 7), slot: slotOf(a.slot) }); raw.set(`+${a.id}`, g / 7); }
  }
  for (const t of built.treats) {
    const g = val(`t_${t.id}`);
    if (g > 1) { addons.push({ productId: t.id, perDay: humanGrams(t, g / 7), slot: slotOf("snack"), treat: true }); raw.set(`+${t.id}`, g / 7); }
  }
  // Граммы округлены по-человечески — калории и пределы поправить шагами округления
  repairRounding([
    ...dishes.flatMap((d) => d.serving.map((it): Adjustable => ({ p: byId.get(it.productId)!, grams: it.grams, raw: raw.get(`${d.slot}:${d.dish}:${it.productId}`) ?? it.grams, count: d.days.length, set: (g) => { it.grams = g; } }))),
    ...addons.map((a): Adjustable => ({ p: byId.get(a.productId)!, grams: a.perDay, raw: raw.get(`+${a.productId}`) ?? a.perDay, count: 7, set: (g) => { a.perDay = g; } })),
  ], input.targets);

  const days: Day[] = Array.from({ length: 7 }, (_, i) => ({
    index: i,
    meals: layout.map((s, k) => {
      const pd = dishes.find((x) => x.slot === k && x.days.includes(i));
      const extras = addons.filter((a) => a.slot === k);
      const items: MealItem[] = [...(pd?.serving ?? []).map((x) => ({ ...x }))];
      for (const a of extras) {
        const same = items.find((x) => x.productId === a.productId);
        if (same) same.grams = round(same.grams + a.perDay); else items.push({ productId: a.productId, grams: a.perDay });
      }
      return { slot: s.slot, title: s.title, items, dish: pd?.dish, extras: extras.map((a) => a.productId) };
    }),
  }));
  const basket: Record<string, number> = {};
  for (const day of days) for (const m of day.meals) for (const it of m.items) if (byId.has(it.productId)) basket[it.productId] = (basket[it.productId] ?? 0) + it.grams;
  for (const id of Object.keys(basket)) basket[id] = round(basket[id]);

  const shortfalls = built.slackKeys
    .map((key) => ({ key, fraction: col[`s_${key}`] ?? 0 }))
    .filter((s) => s.fraction > 0.005)
    .sort((a, b) => b.fraction - a.fraction);
  return { status: "Optimal", basket, days, menu: { dishes, addons, cooking: input.profile.cooking ?? "once" }, shortfalls };
}
