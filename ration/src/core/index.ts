import type { PlanResult, Product, Profile, Tier } from "./types";
import { energyPlan } from "./energy";
import { buildTargets } from "./norms";
import { applyRules } from "./rules";
import { solveBasket, type SolveFn } from "./solver";
import { layoutWeek } from "./planner";
import { basketCost } from "./evaluate";

export function generatePlan(profile: Profile, products: Product[], solve: SolveFn): PlanResult {
  const energy = energyPlan(profile);
  const { targets, macro } = buildTargets(profile, energy.target);
  const restrictions = applyRules(profile, products);
  const outcome = solveBasket({ products, profile, targets, macro, restrictions, energyKcal: energy.target }, solve);
  const byId = new Map(products.map((p) => [p.id, p]));
  const days = outcome.status === "Optimal" ? layoutWeek(outcome.basket, products, profile, energy.target) : [];
  const costByTier = Object.fromEntries((["econom", "business", "premium"] as Tier[]).map((t) => [t, basketCost(outcome.basket, byId, t)])) as Record<Tier, number | null>;
  return {
    profile,
    energy,
    targets,
    warnings: restrictions.warnings,
    basket: outcome.basket,
    days,
    costWeek: costByTier[profile.tier] ?? 0,
    costByTier,
    solverStatus: outcome.status,
    shortfalls: outcome.shortfalls,
  };
}

export * from "./types";
export { energyPlan } from "./energy";
export { buildTargets } from "./norms";
export { applyRules } from "./rules";
export { getSolver } from "./highs";
export * from "./evaluate";
export { SOURCES, SOURCE_MAP } from "./evidence";
