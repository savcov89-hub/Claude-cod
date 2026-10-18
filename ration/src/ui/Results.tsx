import { useMemo, useState } from "react";
import { DISH_MAP, NUTRIENT_LABELS, PANTRY, SOURCE_MAP, compliance, dayNutrients, sumItems, toXE, weekAverage, type Compliance, type CookPlan, type Meal, type NutrientKey, type PlanResult, type Product, type Tier, type Warning } from "../core";
import { amount, fmtMin, shortName, useCookPlan } from "./Cooking";
import { isFruit, isVegetable } from "../core/solver";
import { Badge, Bar, Card, Icon, Stat } from "./bits";
import { CATEGORY_LABEL, CATEGORY_ORDER, DAYS, TIER, fmtG, fmtInt, fmtRub } from "./labels";

const useById = (products: Product[]) => useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

export function SolverFailed({ plan, onBack }: { plan: PlanResult; onBack: () => void }) {
  return (
    <Card className="grid gap-3">
      <h2 className="text-danger">Не удалось собрать рацион</h2>
      <p className="text-sm text-muted">Статус решателя: {plan.solverStatus}. Обычно это слишком жёсткое сочетание исключений (например, веган + без сои + без орехов + без глютена). Снимите часть ограничений и попробуйте снова.</p>
      <button className="btn btn-primary" onClick={onBack}>К опроснику</button>
    </Card>
  );
}

export function ResultHeader({ plan, products, onEdit, onPrint, compact }: { plan: PlanResult; products: Product[]; onEdit: () => void; onPrint?: () => void; compact: boolean }) {
  const byId = useById(products);
  const avg = useMemo(() => weekAverage(plan.days, byId), [plan, byId]);
  const comp = useMemo(() => compliance(avg, plan.targets), [avg, plan]);
  const lowCount = comp.filter((c) => c.status === "low").length;
  const pct = (g: number, kcalPerG: number) => Math.round(((g * kcalPerG) / avg.kcal) * 100);
  const p = plan.profile;
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="eyebrow">{TIER[p.tier].label} · неделя</span>
          <h1>Рацион на неделю</h1>
          <p className="mt-1 text-sm text-muted">
            {p.sex === "female" ? "Женщина" : "Мужчина"}, {p.age} лет, {p.weightKg} кг · ИМТ {plan.energy.bmi} · расход {fmtInt(plan.energy.tdee)} ккал
            {plan.energy.deficit > 0 ? ` · дефицит ${plan.energy.deficit}` : plan.energy.deficit < 0 ? ` · профицит ${-plan.energy.deficit}` : ""}
          </p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          {onPrint && <button className="btn btn-sm" onClick={onPrint}><Icon name="print" size={16} />Печать</button>}
          <button className="btn btn-sm" onClick={onEdit}>Изменить опросник</button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="Калорийность" value={`${fmtInt(avg.kcal)} ккал`} sub={`цель ${fmtInt(plan.energy.target)} · в день`} />
        <Stat label="Б / Ж / У" value={`${fmtInt(avg.protein)}/${fmtInt(avg.fat)}/${fmtInt(avg.carbs)} г`} sub={`${pct(avg.protein, 4)}/${pct(avg.fat, 9)}/${pct(avg.carbs, 4)} % энергии · ${(avg.protein / p.weightKg).toFixed(1)} г/кг`} />
        <Stat label="Стоимость" value={fmtRub(plan.costWeek)} sub={`в неделю · ${fmtRub(plan.costWeek / 7)} в день`} />
        <Stat label="Нормы" value={lowCount === 0 ? "выполнены" : `${lowCount} недобор${lowCount === 1 ? "" : lowCount < 5 ? "а" : "ов"}`} sub={lowCount === 0 ? "в среднем за неделю" : "см. раздел «Нормы»"} />
      </div>
      {!compact && plan.warnings.length > 0 && <div className="grid gap-2">{plan.warnings.map((w, i) => <WarningRow key={i} w={w} />)}</div>}
      {!compact && plan.energy.notes.length > 0 && <p className="text-xs text-muted">{plan.energy.notes.join(" ")}</p>}
    </>
  );
}

function WarningRow({ w }: { w: Warning }) {
  const tone = w.level === "danger" ? "bg-danger-soft" : w.level === "warn" ? "bg-warn-soft" : "bg-info-soft";
  return (
    <div className={`rounded-[10px] p-3 text-sm ${tone}`}>
      <span>{w.text}</span>
      {w.sources.length > 0 && (
        <span className="mt-1 flex flex-wrap gap-1">
          {w.sources.map((s) => SOURCE_MAP[s] && (
            <a key={s} href={SOURCE_MAP[s].url} target="_blank" rel="noreferrer" className="pill bg-surface text-muted hover:text-ink" title={SOURCE_MAP[s].title}>{SOURCE_MAP[s].org} {SOURCE_MAP[s].year}</a>
          ))}
        </span>
      )}
    </div>
  );
}

export function WeekView({ plan, products }: { plan: PlanResult; products: Product[] }) {
  const byId = useById(products);
  const cp = useCookPlan(plan);
  const [day, setDay] = useState(0);
  const [all, setAll] = useState(false);
  const E = plan.energy.target;
  const diabetic = plan.profile.diabetes !== "none";
  const days = all ? plan.days : [plan.days[day]];
  return (
    <>
      <div className="no-print flex flex-wrap items-center gap-2">
        <div className="seg" role="tablist" aria-label="День недели">
          {DAYS.map((d, i) => <button key={d} role="tab" className={!all && day === i ? "on" : ""} aria-selected={!all && day === i} onClick={() => { setAll(false); setDay(i); }}>{d}</button>)}
        </div>
        <button className={`chip ${all ? "" : ""}`} data-on={all} onClick={() => setAll(!all)}>Вся неделя</button>
      </div>
      {days.map((d) => {
        const n = dayNutrients(d, byId);
        return (
          <Card key={d.index} className="print-block">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2>{["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"][d.index]}</h2>
              <span className="num text-sm text-muted">{fmtInt(n.kcal)} ккал · Б {fmtInt(n.protein)} · Ж {fmtInt(n.fat)} · У {fmtInt(n.carbs)}{diabetic ? ` · ${toXE(n.carbs)} ХЕ` : ""}</span>
            </div>
            <div className="mt-2"><Bar pct={(n.kcal / E) * 100} status={Math.abs(n.kcal - E) / E < 0.1 ? "ok" : "low"} /></div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {d.meals.map((m, i) => (cp && m.dish
                ? <DishMeal key={i} m={m} slot={i} day={d.index} cp={cp} byId={byId} diabetic={diabetic} />
                : <ItemsMeal key={i} m={m} byId={byId} diabetic={diabetic} />))}
            </div>
          </Card>
        );
      })}
      <p className="text-xs text-muted">Граммовки для сырых продуктов, крупы — сухие. Нормы оцениваются в среднем за неделю, отдельный день может отличаться на ±10 %.{cp ? " Как готовить блюда и что когда размораживать — в разделе «Готовка»." : ""}</p>
    </>
  );
}

const WHERE: Record<string, { label: string; tone: "info" | "muted" | "ok" }> = {
  fridge: { label: "из холодильника", tone: "ok" },
  freezer: { label: "из морозилки, разморозить с вечера", tone: "info" },
  cook: { label: "приготовить", tone: "muted" },
  ready: { label: "без готовки", tone: "muted" },
};

/** Приём пищи из меню блюд: блюдо, где оно ждёт (холодильник, морозилка, готовить), что в порции и что к нему. */
function DishMeal({ m, slot, day, cp, byId, diabetic }: { m: Meal; slot: number; day: number; cp: CookPlan; byId: Map<string, Product>; diabetic: boolean }) {
  const mn = sumItems(m.items, byId);
  const pd = cp && m.dish ? planDish(cp, m.dish, slot) : null;
  const def = m.dish ? DISH_MAP.get(m.dish) : undefined;
  const w = cp.where[`${slot}:${day}`];
  const extras = new Set(m.extras ?? []);
  const serving = pd?.serving ?? m.items.filter((it) => !extras.has(it.productId));
  const extraItems = m.items.filter((it) => extras.has(it.productId)).map((it) => ({ ...it, grams: it.grams - (serving.find((x) => x.productId === it.productId)?.grams ?? 0) })).filter((it) => it.grams > 0.5);
  const quick = w?.kind === "cook" && def ? ` · ${fmtMin(def.steps.reduce((a, s) => a + s.min, 0))}` : "";
  return (
    <div className="rounded-[10px] border border-line p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3>{m.title}</h3>
        <span className="num text-xs text-muted whitespace-nowrap">{fmtInt(mn.kcal)} ккал{diabetic ? ` · ${toXE(mn.carbs)} ХЕ` : ""}</span>
      </div>
      <div className="mt-1 font-medium">{pd?.name ?? def?.name ?? m.dish}</div>
      {w && <div className="mt-0.5"><Badge tone={WHERE[w.kind].tone}>{WHERE[w.kind].label}{quick}</Badge></div>}
      <div className="mt-1 text-xs text-muted">{serving.filter((it) => !PANTRY.has(it.productId) && byId.has(it.productId)).map((it) => `${shortName(byId.get(it.productId)!)} ${amount(it.productId, it.grams)}`).join(" · ")}</div>
      {extraItems.map((it) => {
        const p = byId.get(it.productId)!;
        return (
          <div key={it.productId} className="rowline text-sm">
            <span>+ {shortName(p)}{p.tags.includes("treat") && <span className="pill ml-1.5 bg-accent-soft text-accent">десерт</span>}</span>
            <span className="num whitespace-nowrap text-xs text-muted">{amount(it.productId, it.grams)}</span>
          </div>
        );
      })}
      <div className="mt-2 text-xs text-muted num">Б {fmtInt(mn.protein)} · Ж {fmtInt(mn.fat)} · У {fmtInt(mn.carbs)} г</div>
    </div>
  );
}
function planDish(cp: CookPlan, dish: string, slot: number) {
  for (const s of cp.sessions) for (const d of s.dishes) if (d.dish === dish && d.slot === slot) return { name: d.name, serving: d.total.map((it) => ({ ...it, grams: it.grams / d.portions.length })) };
  for (const d of [...cp.daily, ...cp.ready]) if (d.dish === dish && d.slot === slot) return { name: d.name, serving: d.serving };
  return null;
}

/** Приём пищи из отдельных продуктов (рацион без блюд). */
function ItemsMeal({ m, byId, diabetic }: { m: Meal; byId: Map<string, Product>; diabetic: boolean }) {
  const mn = sumItems(m.items, byId);
  return (
    <div className="rounded-[10px] border border-line p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3>{m.title}</h3>
        <span className="num text-xs text-muted whitespace-nowrap">{fmtInt(mn.kcal)} ккал{diabetic ? ` · ${toXE(mn.carbs)} ХЕ` : ""}</span>
      </div>
      <div className="mt-1">
        {m.items.map((it) => {
          const p = byId.get(it.productId)!;
          return (
            <div key={it.productId} className="rowline text-sm">
              <span>{p.name}{p.tags.includes("treat") && <span className="pill ml-1.5 bg-accent-soft text-accent">десерт</span>}</span>
              <span className="num whitespace-nowrap text-xs text-muted">{fmtG(it.grams)} · {fmtInt((p.per100g.kcal * it.grams) / 100)} ккал</span>
            </div>
          );
        })}
        {m.items.length === 0 && <div className="text-sm text-muted">— пусто</div>}
      </div>
      <div className="mt-2 text-xs text-muted num">Б {fmtInt(mn.protein)} · Ж {fmtInt(mn.fat)} · У {fmtInt(mn.carbs)} г</div>
    </div>
  );
}

/** Сколько и в чём покупать: упаковки округляются вверх, весовое — до 100 г. */
function purchase(p: Product, needed: number) {
  const loose = p.pack_label === "на развес";
  const n = Math.ceil(needed / p.pack_g - 1e-9);
  const bought = n * p.pack_g;
  const weeks = bought / needed;
  let text: string;
  if (loose) text = `${bought >= 1000 ? (bought / 1000).toFixed(1).replace(".", ",") + " кг" : fmtInt(bought) + " г"} на развес`;
  else text = `${n} × ${p.pack_label}`;
  const extra = !loose && weeks >= 1.8 ? ` · хватит на ${Math.floor(weeks)} нед` : "";
  return { text: text + extra, bought, n };
}

export function ShopView({ plan, products, onRetier, busy }: { plan: PlanResult; products: Product[]; onRetier: (t: Tier) => void; busy: boolean }) {
  const byId = useById(products);
  const tier = plan.profile.tier;
  const groups = useMemo(() => {
    const m = new Map<string, Array<{ p: Product; g: number; sum: number; buy: ReturnType<typeof purchase>; buyCost: number }>>();
    for (const [id, g] of Object.entries(plan.basket)) {
      const p = byId.get(id); if (!p) continue;
      const price = p.prices[tier] ?? 0;
      const buy = purchase(p, g);
      const row = { p, g, sum: (price * g) / 1000, buy, buyCost: (price * buy.bought) / 1000 };
      if (!m.has(p.category)) m.set(p.category, []);
      m.get(p.category)!.push(row);
    }
    for (const list of m.values()) list.sort((a, b) => b.sum - a.sum);
    return CATEGORY_ORDER.filter((c) => m.has(c)).map((c) => ({ cat: c, rows: m.get(c)!, total: m.get(c)!.reduce((a, r) => a + r.sum, 0) }));
  }, [plan, byId, tier]);
  const est = Object.keys(plan.basket).filter((id) => byId.get(id)?.price_estimated).length;
  const buyTotal = groups.reduce((a, g) => a + g.rows.reduce((b, r) => b + r.buyCost, 0), 0);

  return (
    <>
      <Card className="!p-2">
        {(["econom", "business", "premium"] as Tier[]).map((t) => {
          const c = plan.costByTier[t];
          return (
            <div key={t} className={`flex items-center gap-3 rounded-[10px] px-2 py-2 ${t === tier ? "bg-surface-2" : ""}`}>
              <div className="min-w-0 grow">
                <div className="font-semibold">{TIER[t].label}{t === tier && <span className="ml-2 text-xs font-medium text-muted">текущая корзина</span>}</div>
                <div className="text-xs text-muted">{c == null ? "не все продукты есть в этом уровне" : t === tier ? "по ценам этого уровня" : "та же корзина по ценам уровня"}</div>
              </div>
              <div className="num whitespace-nowrap text-base font-bold">{c == null ? "—" : fmtRub(c)}</div>
              {t !== tier && <button className="btn btn-sm no-print whitespace-nowrap" disabled={busy} onClick={() => onRetier(t)}>Пересобрать</button>}
            </div>
          );
        })}
      </Card>
      {plan.menu && (
        <div className="rounded-[10px] bg-info-soft p-3 text-sm">
          Всё на неделю — одним походом перед воскресной готовкой: {Object.keys(plan.basket).length} {Object.keys(plan.basket).length % 10 >= 2 && Object.keys(plan.basket).length % 10 <= 4 && (Object.keys(plan.basket).length % 100 < 12 || Object.keys(plan.basket).length % 100 > 14) ? "продукта" : "продуктов"}, из них соль и масло обычно уже есть дома. {plan.menu.cooking === "twice" ? "Мясо, птицу и рыбу для средней готовки после покупки уберите в морозилку." : "Мясо, птица и рыба в воскресенье сразу идут в блюда, сырыми их не храним."}
        </div>
      )}
      <p className="text-xs text-muted">Нормы считаются по граммам «за неделю», а покупать удобнее упаковками и тушками: ниже для каждого продукта указано, сколько взять. Остаток идёт в морозилку или на следующую неделю.</p>
      {groups.map((g) => (
        <Card key={g.cat} className="print-block">
          <div className="flex items-baseline justify-between gap-2">
            <h3>{CATEGORY_LABEL[g.cat] ?? g.cat}</h3>
            <span className="num text-sm text-muted">{fmtRub(g.total)}</span>
          </div>
          <div className="mt-1">
            {g.rows.map(({ p, g: grams, sum, buy }) => (
              <div key={p.id} className="rowline">
                <div className="min-w-0">
                  <label className="flex items-start gap-2">
                    <input type="checkbox" className="no-print mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]" aria-label={`куплено: ${p.name}`} />
                    <span className="font-medium">{p.name}</span>
                  </label>
                  <div className="num pl-6 text-xs text-muted">нужно {fmtG(grams)} · купить {buy.text} · {p.price_estimated ? "≈" : ""}{fmtInt(p.prices[tier] ?? 0)} ₽/кг</div>
                  {p.buy_hint && <div className="pl-6 text-xs text-muted">{p.buy_hint}</div>}
                </div>
                <div className="num whitespace-nowrap font-semibold">{fmtRub(sum)}</div>
              </div>
            ))}
          </div>
        </Card>
      ))}
      <Card className="grid gap-1">
        <div className="flex items-baseline justify-between gap-2"><span className="font-semibold">Съедается за неделю</span><span className="num text-xl font-bold">{fmtRub(plan.costWeek)}</span></div>
        <div className="flex items-baseline justify-between gap-2 text-sm text-muted"><span>Чек при покупке упаковками</span><span className="num">≈ {fmtRub(buyTotal)}</span></div>
      </Card>
      <p className="text-xs text-muted">Цены примерные (октябрь 2026): в вашем городе и магазине могут отличаться. «≈» — оценка, таких позиций {est} из {Object.keys(plan.basket).length}.</p>
    </>
  );
}

const GROUPS: Array<{ title: string; keys: NutrientKey[] }> = [
  { title: "Энергия и макронутриенты", keys: ["kcal", "protein", "fat", "carbs", "fiber", "sat_fat", "trans_fat", "cholesterol", "sodium"] },
  { title: "Витамины", keys: ["vit_a", "vit_d", "vit_e", "vit_k", "vit_c", "vit_b1", "vit_b2", "niacin", "vit_b5", "vit_b6", "folate", "vit_b12", "choline"] },
  { title: "Минералы", keys: ["calcium", "phosphorus", "magnesium", "potassium", "iron", "zinc", "iodine", "copper", "manganese", "selenium"] },
];
const GROUP_LABEL: Record<string, string> = { veg_fruit: "овощи и фрукты", veg: "овощи", fruit: "фрукты и ягоды", fish: "рыба", legume: "бобовые", dairy: "молочные", animal_protein: "мясо/птица", veg_variety_cabbage: "капустные", veg_colored: "овощи кроме корнеплодов", treats: "вкусняшки (бюджет десерта)" };

export function NormsView({ plan, products }: { plan: PlanResult; products: Product[] }) {
  const byId = useById(products);
  const avg = useMemo(() => weekAverage(plan.days, byId), [plan, byId]);
  const comp = useMemo(() => compliance(avg, plan.targets), [avg, plan]);
  const E = plan.energy.target;
  const vegFruit = Object.entries(plan.basket).reduce((a, [id, g]) => { const p = byId.get(id); return p && (isVegetable(p) || isFruit(p)) ? a + g : a; }, 0) / 7;
  const addedSugar = Object.entries(plan.basket).reduce((a, [id, g]) => { const p = byId.get(id); return p && p.tags.includes("added_sugar") ? a + (p.per100g.sugars * g) / 100 : a; }, 0) / 7;
  const fmt = (v: number, k: NutrientKey) => (v >= 100 ? fmtInt(v) : v >= 10 ? v.toFixed(1) : v.toFixed(2)).replace(".", ",") + " " + NUTRIENT_LABELS[k].unit;
  const low = plan.shortfalls.filter((s) => s.fraction >= 0.1 && s.key !== "treats");
  return (
    <>
      {low.length > 0 && (
        <div className="rounded-[10px] bg-warn-soft p-3 text-sm">
          <b>Что еда не закрывает полностью:</b>{" "}
          {low.map((s) => `${NUTRIENT_LABELS[s.key as NutrientKey]?.label ?? GROUP_LABEL[s.key] ?? s.key} (−${Math.round(s.fraction * 100)} %)`).join(", ")}.
          {low.some((s) => s.key === "vit_d") && " Витамин D из пищи обычно недобирается, особенно осенью и зимой: РАЭ рекомендует профилактические 800–2000 МЕ/сут, обсудите с врачом."}
          {low.some((s) => s.key === "vit_b12") && " Витамин B12 без продуктов животного происхождения требует добавки."}
        </div>
      )}
      <Card>
        <h3>Структура рациона</h3>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <KV k="Овощи и фрукты" v={`${fmtInt(vegFruit)} г/сут`} ok={vegFruit >= 400 * 0.97} hint="ВОЗ: ≥400 г" />
          <KV k="Добавленные сахара" v={`${((addedSugar * 4) / E * 100).toFixed(1).replace(".", ",")} %`} ok={(addedSugar * 4) / E <= 0.1} hint="ВОЗ: <10 %, лучше <5 %" />
          <KV k="Белок" v={`${(avg.protein / plan.profile.weightKg).toFixed(2).replace(".", ",")} г/кг`} ok hint={plan.targets.protein?.note ?? ""} />
          <KV k="Жиры" v={`${Math.round((avg.fat * 9) / avg.kcal * 100)} %`} ok={(avg.fat * 9) / avg.kcal <= 0.36} hint="ВОЗ/МР: ≤30 % (≤35 % при СД, ХБП)" />
          <KV k="Насыщенные жиры" v={`${Math.round((avg.sat_fat * 9) / avg.kcal * 100)} %`} ok={(avg.sat_fat * 9) / avg.kcal <= 0.103} hint="ВОЗ: ≤10 %" />
          <KV k="Соль (по натрию)" v={`${(avg.sodium / 400).toFixed(1).replace(".", ",")} г/сут`} ok={avg.sodium <= 2060} hint="ВОЗ: <5 г" />
        </div>
      </Card>
      {GROUPS.map((g) => (
        <Card key={g.title} className="print-block">
          <h3>{g.title}</h3>
          <div className="mt-1">
            {g.keys.map((k) => {
              const c = comp.find((x) => x.key === k);
              if (!c) return null;
              return <NormRow key={k} k={k} c={c} fmt={fmt} plan={plan} />;
            })}
          </div>
        </Card>
      ))}
      <p className="text-xs text-muted">Состав продуктов: USDA FoodData Central SR Legacy (public domain); йод и облепиха — Скурихин, Тутельян 2002. В USDA почти нет данных по витамину D для многих продуктов, поэтому его «недобор» может быть завышен.</p>
    </>
  );
}

function NormRow({ k, c, fmt, plan }: { k: NutrientKey; c: Compliance; fmt: (v: number, k: NutrientKey) => string; plan: PlanResult }) {
  const t = plan.targets[k]!;
  const tone = c.status === "ok" ? "ok" : c.status === "low" ? "warn" : "danger";
  const limits = `${t.min != null ? `≥${fmt(t.min, k)}` : ""}${t.min != null && t.max != null ? " · " : ""}${t.max != null ? `≤${fmt(t.max, k)}` : ""}`;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-t border-line py-2 first:border-t-0 sm:grid-cols-[170px_minmax(0,1fr)_auto_auto]">
      <div className="font-medium">{NUTRIENT_LABELS[k].label}</div>
      <div className="num text-right text-sm sm:order-3">{fmt(c.value, k)}</div>
      <div className="col-span-2 sm:order-2 sm:col-span-1"><Bar pct={c.pct} status={c.status} /></div>
      <div className="col-span-2 flex items-center justify-between gap-2 sm:order-4 sm:col-span-1 sm:justify-end">
        <span className="num text-xs text-muted">{limits}</span>
        <Badge tone={tone}>{c.status === "ok" ? "норма" : c.status === "low" ? `${Math.round(c.pct)} %` : "выше предела"}</Badge>
      </div>
      <details className="col-span-2 text-xs text-muted sm:order-5 sm:col-span-4">
        <summary className="cursor-pointer select-none">источник{t.note ? ` · ${t.note}` : ""}</summary>
        <ul className="mt-1 list-disc pl-5">
          {t.sources.map((s) => SOURCE_MAP[s] && <li key={s}><a className="hover:underline" href={SOURCE_MAP[s].url} target="_blank" rel="noreferrer">{SOURCE_MAP[s].org}, {SOURCE_MAP[s].year}: {SOURCE_MAP[s].title}</a></li>)}
        </ul>
      </details>
    </div>
  );
}

function KV({ k, v, ok, hint }: { k: string; v: string; ok: boolean; hint: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-[10px] border border-line px-3 py-2">
      <div className="min-w-0">
        <div className="font-medium">{k}</div>
        <div className="text-xs text-muted">{hint}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="num text-sm">{v}</span>
        <Badge tone={ok ? "ok" : "warn"}>{ok ? "✓" : "!"}</Badge>
      </div>
    </div>
  );
}
