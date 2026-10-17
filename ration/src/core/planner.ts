import type { Day, Meal, Product, Profile } from "./types";

type Slot = Meal["slot"];

const LAYOUT: Record<3 | 4 | 5, Array<{ slot: Slot; title: string; share: number }>> = {
  3: [
    { slot: "breakfast", title: "Завтрак", share: 0.3 },
    { slot: "lunch", title: "Обед", share: 0.4 },
    { slot: "dinner", title: "Ужин", share: 0.3 },
  ],
  4: [
    { slot: "breakfast", title: "Завтрак", share: 0.25 },
    { slot: "lunch", title: "Обед", share: 0.35 },
    { slot: "snack", title: "Полдник", share: 0.12 },
    { slot: "dinner", title: "Ужин", share: 0.28 },
  ],
  5: [
    { slot: "breakfast", title: "Завтрак", share: 0.25 },
    { slot: "snack", title: "Второй завтрак", share: 0.1 },
    { slot: "lunch", title: "Обед", share: 0.3 },
    { slot: "snack", title: "Полдник", share: 0.1 },
    { slot: "dinner", title: "Ужин", share: 0.25 },
  ],
};

/** Раскладывает недельную корзину по дням и приёмам пищи, выравнивая калории (и углеводы при диабете). */
export function layoutWeek(basket: Record<string, number>, products: Product[], profile: Profile, dayKcal: number): Day[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const slots = LAYOUT[profile.mealsPerDay];
  const days: Day[] = Array.from({ length: 7 }, (_, i) => ({ index: i, meals: slots.map((s) => ({ slot: s.slot, title: s.title, items: [] })) }));
  const dayK = new Array(7).fill(0);
  const cellK = days.map(() => slots.map(() => 0));
  const cellC = days.map(() => slots.map(() => 0));
  const dayHas = days.map(() => new Set<string>());
  // состав ячейки по ролям: крахмалистый гарнир, белковое блюдо, овощи
  const kind = (p: Product): "starch" | "protein" | "veg" | "other" => {
    if (p.group === "cereal" || p.group === "bread" || p.group === "veg_starch") return "starch";
    if (p.group === "protein_animal" || p.group === "fish" || p.group === "legume" || p.group === "protein_plant" || p.group === "egg") return "protein";
    if (p.category === "vegetable") return "veg";
    return "other";
  };
  const cellKinds = days.map(() => slots.map(() => ({ starch: 0, protein: 0, veg: 0, other: 0 })));
  const weekCarbs = Object.entries(basket).reduce((a, [id, g]) => a + ((byId.get(id)?.per100g.carbs ?? 0) * g) / 100, 0);
  const carbDay = weekCarbs / 7;
  const diabetic = profile.diabetes !== "none";

  type Serving = { p: Product; grams: number; kcal: number; carbs: number };
  const servings: Serving[] = [];
  for (const [id, grams] of Object.entries(basket)) {
    const p = byId.get(id);
    if (!p || grams <= 0) continue;
    const portion = p.portion_g ?? 100;
    const maxN = p.roles.length > 1 ? 14 : 7;
    const n = Math.max(1, Math.min(maxN, Math.round(grams / portion)));
    const size = grams / n;
    for (let i = 0; i < n; i++) servings.push({ p, grams: size, kcal: (p.per100g.kcal * size) / 100, carbs: (p.per100g.carbs * size) / 100 });
  }
  // крупные порции раскладываем первыми
  servings.sort((a, b) => b.kcal - a.kcal || a.p.id.localeCompare(b.p.id));

  for (const s of servings) {
    let best: { d: number; k: number; score: number } | null = null;
    for (let d = 0; d < 7; d++) {
      for (let k = 0; k < slots.length; k++) {
        const role = slots[k].slot;
        if (!s.p.roles.includes(role)) continue;
        let score = (dayK[d] + s.kcal) / dayKcal;
        score += (0.9 * (cellK[d][k] + s.kcal)) / (slots[k].share * dayKcal);
        if (dayHas[d].has(s.p.id)) score += 2.5;
        if (diabetic) score += (1.2 * (cellC[d][k] + s.carbs)) / Math.max(1, slots[k].share * carbDay);
        const kd = kind(s.p);
        const ck = cellKinds[d][k];
        const mainMeal = role === "lunch" || role === "dinner";
        if (kd === "starch" && ck.starch > 0) score += 1.2; // второй гарнир в один приём
        if (kd === "protein" && ck.protein > 0) score += 0.8;
        if (kd === "veg" && mainMeal && ck.veg === 0) score -= 0.6; // овощи к обеду/ужину
        if (kd === "veg" && ck.veg > 1) score += 0.5;
        if (kd === "protein" && mainMeal && ck.protein === 0) score -= 0.4;
        // лёгкая детерминированная «соль», чтобы одинаковые дни не склеивались
        score += d * 1e-4 + k * 1e-5;
        if (!best || score < best.score) best = { d, k, score };
      }
    }
    if (!best) {
      // роль не совпала ни с одним слотом — кладём в обед
      const k = slots.findIndex((x) => x.slot === "lunch");
      const d = dayK.indexOf(Math.min(...dayK));
      best = { d, k, score: 0 };
    }
    const { d, k } = best;
    const meal = days[d].meals[k];
    const existing = meal.items.find((it) => it.productId === s.p.id);
    if (existing) existing.grams += s.grams; else meal.items.push({ productId: s.p.id, grams: s.grams });
    dayK[d] += s.kcal; cellK[d][k] += s.kcal; cellC[d][k] += s.carbs; dayHas[d].add(s.p.id);
    cellKinds[d][k][kind(s.p)] += 1;
  }
  for (const day of days) for (const m of day.meals) {
    m.items.forEach((it) => (it.grams = it.grams < 20 ? Math.round(it.grams * 10) / 10 : Math.round(it.grams)));
    m.items.sort((a, b) => (byId.get(b.productId)!.per100g.kcal * b.grams) - (byId.get(a.productId)!.per100g.kcal * a.grams));
  }
  return days;
}
