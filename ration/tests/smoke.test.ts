import { describe, it, expect } from "vitest";

const T = 120_000;
import data from "../src/data/products.json";
import { DISH_MAP, cookingPlan, generatePlan, getSolver, weekAverage, compliance, type PlanResult, type Product, type Profile } from "../src/core";

const products = data.products as unknown as Product[];

const base: Profile = {
  sex: "female", age: 34, heightCm: 168, weightKg: 78, activity: "low", strength: false, goal: "lose", tier: "econom", mealsPerDay: 4,
  pregnancy: "none", lactation: "none", ckd: "none", hyperkalemia: false, diabetes: "none", exclusions: [], dislikes: [], season: "winter", treats: "some", favTreats: [],
};

/** Меню из блюд: каждый приём каждый день — блюдо, не больше двух блюд на приём, блюдо идёт дни подряд;
 *  по плану готовки в холодильнике порция лежит не дольше срока, а что нельзя заморозить — не в морозилке. */
function checkMenu(r: PlanResult, label: string) {
  const menu = r.menu!;
  for (const d of r.days) for (const m of d.meals) expect(m.dish, `${label}: ${d.index} ${m.title}`).toBeTruthy();
  const slots = new Set(menu.dishes.map((d) => d.slot));
  for (const k of slots) {
    const ds = menu.dishes.filter((d) => d.slot === k);
    expect(ds.length, `${label}: блюд в приёме ${k}`).toBeLessThanOrEqual(2);
    expect(ds.reduce((a, d) => a + d.days.length, 0), label).toBe(7);
    for (const d of ds) expect(d.days[d.days.length - 1] - d.days[0] + 1, `${label}: ${d.name} подряд`).toBe(d.days.length);
  }
  for (const mode of ["once", "twice"] as const) {
    const cp = cookingPlan(menu, mode);
    for (const s of cp.sessions) for (const b of s.dishes) {
      const def = DISH_MAP.get(b.dish)!;
      for (const p of b.portions) {
        if (p.where === "fridge") expect(p.day - s.day, `${label} ${mode}: ${b.name} ${p.day}`).toBeLessThanOrEqual(def.fridge);
        else expect(def.freeze, `${label} ${mode}: ${b.name} в морозилке`).toBe(true);
      }
    }
    // каждая порция где-то есть: холодильник, морозилка, готовить в тот же день или без готовки
    for (const d of r.days) d.meals.forEach((_, k) => expect(cp.where[`${k}:${d.index}`], `${label} ${mode}: ${k}:${d.index}`).toBeTruthy());
  }
}

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
    // простое меню из блюд, у него план готовки
    expect(r.menu).toBeTruthy();
    checkMenu(r, "econom");
    expect(Object.keys(r.basket).length).toBeLessThanOrEqual(28);
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
      // при ХБП с 3-й стадии — продукты без блюд (калий, фосфор, белок), остальные — меню из блюд
      if (c.ckd && c.ckd !== "s1_2") { expect(r.menu).toBeUndefined(); expect(r.warnings.some((w) => w.text.includes("отдельных продуктов"))).toBe(true); }
      else { expect(r.menu, JSON.stringify(c)).toBeTruthy(); checkMenu(r, JSON.stringify(c)); }
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
