import { NUTRIENT_KEYS, type Day, type Nutrients, type NutrientKey, type Product, type Targets, type Tier } from "./types";

export function emptyNutrients(): Nutrients {
  return Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0])) as Nutrients;
}

export function sumItems(items: Array<{ productId: string; grams: number }>, byId: Map<string, Product>): Nutrients {
  const n = emptyNutrients();
  for (const it of items) {
    const p = byId.get(it.productId);
    if (!p) continue;
    for (const k of NUTRIENT_KEYS) n[k] += (p.per100g[k] * it.grams) / 100;
  }
  return n;
}

export function dayNutrients(day: Day, byId: Map<string, Product>): Nutrients {
  return sumItems(day.meals.flatMap((m) => m.items), byId);
}

export function weekAverage(days: Day[], byId: Map<string, Product>): Nutrients {
  const total = emptyNutrients();
  for (const d of days) {
    const n = dayNutrients(d, byId);
    for (const k of NUTRIENT_KEYS) total[k] += n[k];
  }
  for (const k of NUTRIENT_KEYS) total[k] /= 7;
  return total;
}

export type Status = "ok" | "low" | "high" | "na";
export interface Compliance { key: NutrientKey; value: number; min?: number; max?: number; status: Status; pct: number }

export function compliance(avg: Nutrients, targets: Targets): Compliance[] {
  const out: Compliance[] = [];
  for (const k of NUTRIENT_KEYS) {
    const t = targets[k];
    if (!t) continue;
    const v = avg[k];
    let status: Status = "ok";
    let pct = 100;
    if (t.min != null && t.min > 0) { pct = (v / t.min) * 100; if (v < t.min * 0.97) status = "low"; }
    if (t.max != null) { if (v > t.max * 1.03) status = "high"; if (t.min == null) pct = (v / t.max) * 100; }
    out.push({ key: k, value: v, min: t.min, max: t.max, status, pct });
  }
  return out;
}

export function basketCost(basket: Record<string, number>, byId: Map<string, Product>, tier: Tier): number | null {
  let sum = 0;
  for (const [id, g] of Object.entries(basket)) {
    const p = byId.get(id);
    if (!p) continue;
    const price = p.prices[tier];
    if (price == null) return null;
    sum += (price * g) / 1000;
  }
  return Math.round(sum);
}

/** Хлебные единицы: 1 ХЕ = 10 г углеводов (Алгоритмы 2025, прил. 2). */
export const toXE = (carbs: number) => Math.round((carbs / 10) * 2) / 2;
