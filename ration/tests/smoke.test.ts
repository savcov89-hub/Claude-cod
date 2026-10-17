import { describe, it, expect } from "vitest";

const T = 120_000;
import data from "../src/data/products.json";
import { generatePlan, getSolver, weekAverage, compliance, type Product, type Profile } from "../src/core";

const products = data.products as unknown as Product[];

const base: Profile = {
  sex: "female", age: 34, heightCm: 168, weightKg: 78, activity: "low", strength: false, goal: "lose", tier: "econom", mealsPerDay: 4,
  pregnancy: "none", lactation: "none", ckd: "none", hyperkalemia: false, diabetes: "none", exclusions: [], dislikes: [], season: "winter", treats: "some", favTreats: [],
};

describe("generatePlan", () => {
  it("solves econom weight-loss plan and meets hard norms", async () => {
    const solve = await getSolver();
    const r = generatePlan(base, products, solve);
    expect(r.solverStatus).toBe("Optimal");
    const byId = new Map(products.map((p) => [p.id, p]));
    const avg = weekAverage(r.days, byId);
    expect(Math.abs(avg.kcal - r.energy.target) / r.energy.target).toBeLessThan(0.035);
    expect(avg.protein).toBeGreaterThanOrEqual(1.2 * 78 * 0.97);
    expect(r.targets.protein!.min).toBeCloseTo(1.2 * 78, 0);
    expect(avg.sodium).toBeLessThanOrEqual(2000 * 1.03);
    expect(avg.sat_fat * 9).toBeLessThanOrEqual(0.1 * r.energy.target * 1.03);
    const c = compliance(avg, r.targets);
    const highs = c.filter((x) => x.status === "high").map((x) => x.key);
    expect(highs).toEqual([]);
    console.log("econom cost/week", r.costWeek, "items", Object.keys(r.basket).length, "shortfalls", r.shortfalls.map((s) => `${s.key}:${(s.fraction * 100).toFixed(0)}%`).join(", "));
    console.log(Object.entries(r.basket).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(" "));
    // минимальные закупочные объёмы соблюдены
    for (const [id, g] of Object.entries(r.basket)) { const p = byId.get(id)!; expect(g, id).toBeGreaterThanOrEqual(Math.min(p.min_week_g, p.max_week_g ?? 1e9) - 0.6); }
  }, T);

  it("handles pregnancy t3, CKD s3b, diabetes t1, vegan", async () => {
    const solve = await getSolver();
    const cases: Array<Partial<Profile>> = [
      { pregnancy: "t3", goal: "maintain", tier: "business" },
      { ckd: "s3b", hyperkalemia: true, goal: "maintain", tier: "business", sex: "male", weightKg: 90, age: 61 },
      { diabetes: "t1", goal: "maintain", tier: "premium", mealsPerDay: 5 },
      { exclusions: ["vegan"], goal: "maintain", tier: "business" },
      { lactation: "m0_6", goal: "lose", tier: "econom" },
      { exclusions: ["lactose", "gluten", "fish"], goal: "lose", tier: "econom", sex: "male" },
      { treats: "more", favTreats: ["zefir", "ice_cream"], goal: "lose", tier: "business" },
      { treats: "none", goal: "maintain", tier: "econom" },
      { strength: true, goal: "lose", tier: "business", sex: "male", weightKg: 85, activity: "moderate" },
      { strength: true, goal: "maintain", tier: "econom" },
    ];
    for (const c of cases) {
      const r = generatePlan({ ...base, ...c }, products, solve);
      expect(r.solverStatus, JSON.stringify(c)).toBe("Optimal");
      const byId = new Map(products.map((p) => [p.id, p]));
      const avg = weekAverage(r.days, byId);
      const comp = compliance(avg, r.targets);
      const highs = comp.filter((x) => x.status === "high").map((x) => `${x.key}=${x.value.toFixed(1)}>${x.max}`);
      expect(highs, JSON.stringify(c)).toEqual([]);
      const treatKcal = Object.entries(r.basket).reduce((a, [id, g]) => { const p = byId.get(id)!; return p.tags.includes("treat") ? a + (p.per100g.kcal * g) / 100 : a; }, 0) / 7;
      const budget = { none: 0, some: 120, more: 220 }[(c.treats ?? "some") as "none" | "some" | "more"];
      expect(treatKcal, `treats ${JSON.stringify(c)}`).toBeLessThanOrEqual(budget * 1.16 + 1);
      if (c.treats === "more") { expect(treatKcal).toBeGreaterThan(100); for (const id of Object.keys(r.basket)) if (byId.get(id)!.tags.includes("treat")) expect(["zefir", "ice_cream"]).toContain(id); }
      if (c.strength) expect(avg.protein, `strength ${JSON.stringify(c)}`).toBeGreaterThanOrEqual(1.6 * (c.weightKg ?? base.weightKg) * 0.97);
      const sugarE = Object.entries(r.basket).reduce((a, [id, g]) => { const p = byId.get(id)!; return p.tags.includes("added_sugar") ? a + (p.per100g.sugars * g * 4) / 100 : a; }, 0) / 7 / r.energy.target;
      expect(sugarE, `sugar ${JSON.stringify(c)}`).toBeLessThanOrEqual(0.101);
      console.log(JSON.stringify(c), "kcal", Math.round(avg.kcal), "prot", Math.round(avg.protein), "K", Math.round(avg.potassium), "P", Math.round(avg.phosphorus), "cost", r.costWeek, "short:", r.shortfalls.map((s) => `${s.key}:${(s.fraction * 100).toFixed(0)}%`).join(", "));
    }
  }, T);
});
