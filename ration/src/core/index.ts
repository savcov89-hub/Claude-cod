import type { Day, PlanResult, Product, Profile, Targets, Tier } from "./types";
import { energyPlan } from "./energy";
import { buildTargets } from "./norms";
import { applyRules } from "./rules";
import { solveBasket, type SolveFn } from "./solver";
import { layoutWeek } from "./planner";
import { solveMenu } from "./menu";
import { basketCost } from "./evaluate";
import { humanGrams, repairRounding, type Adjustable } from "./portions";

function humanDays(days: Day[], byId: Map<string, Product>, targets: Targets): Day[] {
  const items: Adjustable[] = [];
  const out = days.map((d) => ({ ...d, meals: d.meals.map((m) => ({ ...m, items: m.items.map((it) => {
    const x = { ...it, grams: humanGrams(byId.get(it.productId)!, it.grams) };
    items.push({ p: byId.get(it.productId)!, grams: x.grams, raw: it.grams, count: 1, set: (g) => { x.grams = g; } });
    return x;
  }).filter((it) => it.grams > 0) })) }));
  repairRounding(items, targets);
  return out;
}
function basketOf(days: Day[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of days) for (const m of d.meals) for (const it of m.items) out[it.productId] = Math.round(((out[it.productId] ?? 0) + it.grams) * 10) / 10;
  return out;
}

export function generatePlan(profile: Profile, products: Product[], solve: SolveFn): PlanResult {
  const energy = energyPlan(profile);
  const { targets, macro } = buildTargets(profile, energy.target);
  const restrictions = applyRules(profile, products);
  const input = { products, profile, targets, macro, restrictions, energyKcal: energy.target };
  // Меню из простых блюд; при ХБП с 3-й стадии (калий, фосфор, белок) и если блюд с ограничениями не сложилось —
  // корзина продуктов, как раньше
  const strictKidney = profile.ckd !== "none" && (profile.ckd !== "s1_2" || profile.hyperkalemia);
  const menu = strictKidney ? null : solveMenu(input, solve);
  const outcome = menu ?? solveBasket(input, solve);
  const warnings = [...restrictions.warnings];
  if (!menu) warnings.push({ level: "info", text: strictKidney
    ? "При ХБП с 3-й стадии и при повышенном калии готовые блюда не проходят по калию, фосфору и белку, поэтому рацион собран из отдельных продуктов, без плана готовки."
    : "С выбранными ограничениями меню из простых блюд не сложилось, поэтому рацион собран из отдельных продуктов, без плана готовки.", sources: [] });
  const byId = new Map(products.map((p) => [p.id, p]));
  // Рацион из продуктов: граммы тоже по-человечески (в меню из блюд они округлены при сборке)
  const days = menu ? menu.days : outcome.status === "Optimal" ? humanDays(layoutWeek(outcome.basket, products, profile, energy.target), byId, targets) : [];
  const basket = menu || outcome.status !== "Optimal" ? outcome.basket : basketOf(days);
  const costByTier = Object.fromEntries((["econom", "business", "premium"] as Tier[]).map((t) => [t, basketCost(basket, byId, t)])) as Record<Tier, number | null>;
  return {
    profile,
    energy,
    targets,
    warnings,
    basket,
    days,
    costWeek: costByTier[profile.tier] ?? 0,
    costByTier,
    solverStatus: outcome.status,
    shortfalls: outcome.shortfalls,
    ...(menu ? { menu: menu.menu } : {}),
  };
}

export * from "./types";
export { energyPlan } from "./energy";
export { buildTargets } from "./norms";
export { applyRules } from "./rules";
export { getSolver } from "./highs";
export * from "./evaluate";
export { SOURCES, SOURCE_MAP } from "./evidence";
export { DISHES, DISH_MAP, PANTRY, UNITS, type Dish, type Step } from "./recipes";
export { humanGrams, humanTotal } from "./portions";
export { cookingPlan, type BatchDish, type CookPlan, type CookSession, type DayDish, type SessionDay } from "./cooking";
