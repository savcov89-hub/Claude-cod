import { TREAT_KCAL, type NutrientKey, type Product, type Profile, type Targets, type Tier } from "./types";
import type { MacroNotes } from "./norms";
import type { Restrictions } from "./rules";

/** reduced — приведённые стоимости переменных (только у непрерывной задачи): насколько дороже станет решение на единицу */
export interface LpSolution { status: string; objective: number; columns: Record<string, number>; reduced?: Record<string, number> }
/** gap — допустимый разрыв до оптимума (доля), timeLimit — секунды; по умолчанию 0,02 и 12. */
export interface SolveOpts { gap?: number; timeLimit?: number }
export type SolveFn = (lp: string, opts?: SolveOpts) => LpSolution;

export interface LpInput {
  products: Product[];
  profile: Profile;
  targets: Targets;
  macro: MacroNotes;
  restrictions: Restrictions;
  energyKcal: number;
  /** продукты, принудительно обнулённые (после пост-обработки) */
  zeroed?: Set<string>;
}

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

export const LIQUID_DAIRY = new Set(["milk_25", "milk_32", "kefir", "yogurt_plain", "yogurt_greek"]);

export function isVegetable(p: Product) { return p.category === "vegetable" && p.group !== "veg_starch"; }
export function isFruit(p: Product) { return p.category === "fruit" && p.group !== "dried_fruit" && p.group !== "fat"; }

/** Строит задачу ЛП в формате CPLEX LP: переменные — граммы продукта за неделю. */
export function buildLp(input: LpInput): { lp: string; vars: string[]; slackKeys: string[] } {
  // slackKeys: ключи нутриентов и групповых ограничений (veg, fruit, fish ...)
  const { products, profile, targets, macro, restrictions, energyKcal } = input;
  const active = products.filter((p) => !restrictions.excluded.has(p.id) && !(input.zeroed?.has(p.id)));
  const v = (p: Product) => `x_${p.id}`;
  const qw = QUALITY_WEIGHT[profile.tier];

  const obj: Array<[number, string]> = active.map((p) => {
    const price = (p.prices[profile.tier] ?? 0) / 1000; // руб/г
    const w = 1 - qw * p.quality;
    return [Math.max(price * w, 0.00001), v(p)];
  });
  const rows: string[] = [];
  const bounds: string[] = [];
  const slackKeys: string[] = [];

  const nutRow = (k: NutrientKey) => active.map((p): [number, string] => [p.per100g[k] / 100, v(p)]);

  for (const [key, tg] of Object.entries(targets) as [NutrientKey, NonNullable<Targets[NutrientKey]>][]) {
    const terms = nutRow(key);
    if (tg.min != null && tg.min > 0) {
      const T = 7 * tg.min;
      if (tg.priority === "hard") rows.push(`min_${key}: ${row(terms)} >= ${fmt(T)}`);
      else {
        const s = `s_${key}`;
        slackKeys.push(key);
        rows.push(`min_${key}: ${row(terms)} + ${fmt(T)} ${s} >= ${fmt(T)}`);
        bounds.push(`0 <= ${s} <= 1`);
        obj.push([PENALTY[tg.priority], s]);
      }
    }
    if (tg.max != null) rows.push(`max_${key}: ${row(terms)} <= ${fmt(7 * tg.max)}`);
  }

  // Свободные (добавленные) сахара: продукты с тегом added_sugar
  const sugarTerms = active.filter((p) => p.tags.includes("added_sugar")).map((p): [number, string] => [p.per100g.sugars / 100, v(p)]);
  if (sugarTerms.length) rows.push(`max_added_sugar: ${row(sugarTerms)} <= ${fmt((7 * energyKcal * macro.addedSugarPct) / 4)}`);

  // Овощи и фрукты (ВОЗ ≥400 г/сут), отдельно овощи ≥250 и фрукты/ягоды ≥150 — мягкие
  const softGroup = (name: string, items: Product[], minWeek: number, priority: "high" | "low") => {
    if (!items.length) return;
    const s = `s_${name}`;
    rows.push(`min_${name}: ${row(items.map((p): [number, string] => [1, v(p)]))} + ${fmt(minWeek)} ${s} >= ${fmt(minWeek)}`);
    bounds.push(`0 <= ${s} <= 1`);
    obj.push([PENALTY[priority], s]);
    slackKeys.push(name);
  };
  const hardGroupMax = (name: string, items: Product[], maxWeek: number) => {
    if (!items.length) return;
    rows.push(`max_${name}: ${row(items.map((p): [number, string] => [1, v(p)]))} <= ${fmt(maxWeek)}`);
  };

  const veg = active.filter(isVegetable);
  const fruit = active.filter(isFruit);
  softGroup("veg_fruit", [...veg, ...fruit], 7 * 400, "high");
  softGroup("veg", veg, 7 * 250, "high");
  softGroup("fruit", fruit, 7 * 150, "high");

  const byGroup = (g: string) => active.filter((p) => p.group === g);
  hardGroupMax("cereal", byGroup("cereal"), 1400);
  hardGroupMax("bread", byGroup("bread"), 1400);
  hardGroupMax("liquid_dairy", active.filter((p) => LIQUID_DAIRY.has(p.id)), 3500);
  hardGroupMax("nuts", byGroup("nuts"), 280);
  hardGroupMax("sweet", byGroup("sweet"), profile.treats === "none" ? 200 : 900);
  // Вкусняшки: калории десертов в коридоре вокруг бюджета (мягкий минимум, жёсткий максимум)
  const treats = active.filter((p) => p.tags.includes("treat"));
  const treatBudget = TREAT_KCAL[profile.treats] * 7;
  if (treats.length && treatBudget > 0) {
    const kcalTerms = treats.map((p): [number, string] => [p.per100g.kcal / 100, v(p)]);
    rows.push(`max_treat_kcal: ${row(kcalTerms)} <= ${fmt(treatBudget * 1.15)}`);
    const sKey = "treats";
    rows.push(`min_treat_kcal: ${row(kcalTerms)} + ${fmt(treatBudget * 0.8)} s_${sKey} >= ${fmt(treatBudget * 0.8)}`);
    bounds.push(`0 <= s_${sKey} <= 1`);
    obj.push([PENALTY.low, `s_${sKey}`]);
    slackKeys.push(sKey);
  }
  hardGroupMax("fat", byGroup("fat"), 600);
  hardGroupMax("offal", active.filter((p) => p.category === "offal"), restrictions.offalCapWeek);
  hardGroupMax("cheese", byGroup("cheese"), 400);
  hardGroupMax("dried_fruit", byGroup("dried_fruit"), 300);

  const animal = active.filter((p) => p.group === "protein_animal");
  const fish = active.filter((p) => p.group === "fish");
  const legumes = active.filter((p) => p.group === "legume" || p.group === "protein_plant");
  const dairy = active.filter((p) => p.category === "dairy");
  // разнообразие источников белка (мягко)
  if (animal.length) softGroup("animal_protein", animal, 600, "low");
  if (fish.length) softGroup("fish", fish, 300, "high");
  if (legumes.length) softGroup("legume", legumes, 150, "low");
  if (dairy.length) softGroup("dairy", dairy, 1000, "low");
  if (veg.length) softGroup("veg_variety_cabbage", veg.filter((p) => ["cabbage", "broccoli", "cauliflower", "sauerkraut"].includes(p.id)), 300, "low");
  const colored = veg.filter((p) => ["tomato", "cucumber", "pepper_red", "broccoli", "cauliflower", "spinach", "lettuce", "pumpkin", "zucchini", "green_beans", "beet", "eggplant"].includes(p.id));
  if (colored.length) softGroup("veg_colored", colored, profile.tier === "econom" ? 350 : 700, "low");

  // Разнообразие: ни один продукт не больше доли своей группы
  const shareCap = (name: string, items: Product[], share: number) => {
    if (items.length < 2) return;
    for (const p of items) {
      const terms: Array<[number, string]> = items.map((q) => [q.id === p.id ? 1 - share : -share, v(q)]);
      rows.push(`share_${name}_${p.id}: ${row(terms)} <= 0`);
    }
  };
  shareCap("veg", veg, 0.35);
  shareCap("fruit", fruit, 0.5);
  shareCap("cereal", byGroup("cereal"), 0.5);
  shareCap("bread", byGroup("bread"), 0.6);
  shareCap("prot", [...animal, ...fish], 0.4);
  shareCap("legume", legumes, 0.6);
  shareCap("dairy", dairy, 0.6);

  // Полунепрерывные объёмы: продукт либо не покупается, либо не меньше min_week_g (иначе «40 г рыбы для селена»)
  const binaries: string[] = [];
  for (const p of active) {
    const cap = Math.min(p.max_week_g ?? 1000, restrictions.caps[p.id] ?? Infinity);
    bounds.push(`0 <= ${v(p)} <= ${fmt(cap)}`);
    const minW = Math.min(p.min_week_g ?? 0, cap);
    if (minW > 0) {
      const y = `y_${p.id}`;
      binaries.push(y);
      rows.push(`sc_hi_${p.id}: ${v(p)} - ${fmt(cap)} ${y} <= 0`);
      rows.push(`sc_lo_${p.id}: ${v(p)} - ${fmt(minW)} ${y} >= 0`);
    }
  }
  bounds.push(`0 <= x__zero <= 0`);

  const lp = ["Minimize", ` obj: ${row(obj)}`, "Subject To", ...rows.map((r) => ` ${r}`), "Bounds", ...bounds.map((b) => ` ${b}`),
    ...(binaries.length ? ["Binary", ` ${binaries.join(" ")}`] : []), "End"].join("\n");
  return { lp, vars: active.map(v), slackKeys };
}

export interface SolveOutcome { basket: Record<string, number>; shortfalls: Array<{ key: string; fraction: number }>; status: string; objective: number }

/** Решает ЛП, затем убирает «пыль» (продукты меньше 40 % порции) и решает повторно. */
export function solveBasket(input: LpInput, solve: SolveFn): SolveOutcome {
  const zeroed = new Set<string>(input.zeroed ?? []);
  let last: SolveOutcome | null = null;
  for (let pass = 0; pass < 3; pass++) {
    const { lp, slackKeys } = buildLp({ ...input, zeroed });
    const sol = solve(lp);
    if (sol.status !== "Optimal") {
      if (last) return last;
      return { basket: {}, shortfalls: [], status: sol.status, objective: 0 };
    }
    const basket: Record<string, number> = {};
    const dust: string[] = [];
    for (const p of input.products) {
      const g = sol.columns[`x_${p.id}`];
      if (g == null || g < 0.5) continue;
      const thr = Math.min(0.4 * (p.portion_g ?? 100), 25);
      if (g < thr) dust.push(p.id);
      else basket[p.id] = g < 20 ? Math.round(g * 10) / 10 : Math.round(g);
    }
    const shortfalls = slackKeys
      .map((k) => ({ key: k, fraction: sol.columns[`s_${k}`] ?? 0 }))
      .filter((s) => s.fraction > 0.005)
      .sort((a, b) => b.fraction - a.fraction);
    last = { basket, shortfalls, status: sol.status, objective: sol.objective };
    if (!dust.length) break;
    dust.forEach((d) => zeroed.add(d));
  }
  return last!;
}
