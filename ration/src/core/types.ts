export type Sex = "male" | "female";
/** Группы физической активности по МР 2.3.1.0253-21: КФА 1,4 / 1,6 / 1,9 / 2,2 */
export type Activity = "low" | "moderate" | "high" | "very_high";
export type Goal = "lose" | "maintain" | "gain";
export type Tier = "econom" | "business" | "premium";
export type Pregnancy = "none" | "t1" | "t2" | "t3";
export type Lactation = "none" | "m0_6" | "m7_12";
/** Стадии ХБП (KDIGO / КР Минздрава 2024). dialysis — гемодиализ. */
export type CkdStage = "none" | "s1_2" | "s3a" | "s3b" | "s4_5" | "dialysis";
export type Diabetes = "none" | "t1" | "t2";
export type Season = "summer" | "winter";

export type Exclusion =
  | "lactose" | "dairy" | "gluten" | "egg" | "fish" | "seafood" | "nuts" | "peanut" | "soy"
  | "pork" | "red_meat" | "meat" | "vegan" | "fasting" | "offal";

export interface Profile {
  name?: string;
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: Activity;
  /** силовые тренировки ≥2 раз в неделю: белок 1,6–2,0 г/кг (Morton 2018, ISSN 2017) */
  strength: boolean;
  goal: Goal;
  tier: Tier;
  mealsPerDay: 3 | 4 | 5;
  pregnancy: Pregnancy;
  lactation: Lactation;
  ckd: CkdStage;
  hyperkalemia: boolean;
  diabetes: Diabetes;
  exclusions: Exclusion[];
  dislikes: string[];
  season: Season;
  /** вкусняшки: нет / немного (≈120 ккал/сут) / можно (≈220 ккал/сут) */
  treats: Treats;
  /** любимые десерты (id продуктов); пусто — любые */
  favTreats: string[];
}
export type Treats = "none" | "some" | "more";
export const TREAT_KCAL: Record<Treats, number> = { none: 0, some: 120, more: 220 };

export const NUTRIENT_KEYS = [
  "kcal", "protein", "fat", "carbs", "fiber", "sugars", "sat_fat", "trans_fat", "mufa", "pufa", "cholesterol",
  "calcium", "iron", "magnesium", "phosphorus", "potassium", "sodium", "zinc", "copper", "manganese", "selenium", "iodine",
  "vit_c", "vit_b1", "vit_b2", "niacin", "vit_b5", "vit_b6", "folate", "vit_b12", "choline", "vit_a", "vit_e", "vit_d", "vit_k",
] as const;
export type NutrientKey = (typeof NUTRIENT_KEYS)[number];
export type Nutrients = Record<NutrientKey, number>;

export const NUTRIENT_LABELS: Record<NutrientKey, { label: string; unit: string }> = {
  kcal: { label: "Энергия", unit: "ккал" },
  protein: { label: "Белки", unit: "г" },
  fat: { label: "Жиры", unit: "г" },
  carbs: { label: "Углеводы", unit: "г" },
  fiber: { label: "Пищевые волокна", unit: "г" },
  sugars: { label: "Сахара (все)", unit: "г" },
  sat_fat: { label: "Насыщенные жиры", unit: "г" },
  trans_fat: { label: "Трансжиры", unit: "г" },
  mufa: { label: "МНЖК", unit: "г" },
  pufa: { label: "ПНЖК", unit: "г" },
  cholesterol: { label: "Холестерин", unit: "мг" },
  calcium: { label: "Кальций", unit: "мг" },
  iron: { label: "Железо", unit: "мг" },
  magnesium: { label: "Магний", unit: "мг" },
  phosphorus: { label: "Фосфор", unit: "мг" },
  potassium: { label: "Калий", unit: "мг" },
  sodium: { label: "Натрий", unit: "мг" },
  zinc: { label: "Цинк", unit: "мг" },
  copper: { label: "Медь", unit: "мг" },
  manganese: { label: "Марганец", unit: "мг" },
  selenium: { label: "Селен", unit: "мкг" },
  iodine: { label: "Йод", unit: "мкг" },
  vit_c: { label: "Витамин C", unit: "мг" },
  vit_b1: { label: "Витамин B1", unit: "мг" },
  vit_b2: { label: "Витамин B2", unit: "мг" },
  niacin: { label: "Ниацин (B3)", unit: "мг" },
  vit_b5: { label: "Пантотеновая к-та (B5)", unit: "мг" },
  vit_b6: { label: "Витамин B6", unit: "мг" },
  folate: { label: "Фолаты (B9)", unit: "мкг" },
  vit_b12: { label: "Витамин B12", unit: "мкг" },
  choline: { label: "Холин", unit: "мг" },
  vit_a: { label: "Витамин A (РЭ)", unit: "мкг" },
  vit_e: { label: "Витамин E", unit: "мг" },
  vit_d: { label: "Витамин D", unit: "мкг" },
  vit_k: { label: "Витамин K", unit: "мкг" },
};

export interface Product {
  id: string;
  name: string;
  category: string;
  tags: string[];
  prices: Record<Tier, number | null>;
  price_estimated: boolean;
  season: "all" | "summer" | "winter";
  roles: string[];
  max_week_g: number | null;
  portion_g: number | null;
  quality: number;
  group: string | null;
  note: string | null;
  /** единица покупки: граммы и подпись («пачка 800 г», «тушка ≈1,2 кг», «на развес») */
  pack_g: number;
  pack_label: string;
  /** минимальный недельный объём, если продукт попал в корзину */
  min_week_g: number;
  buy_hint: string | null;
  source?: { type: string; fdc_id?: number; description: string; url?: string };
  iodine_source?: string;
  per100g: Nutrients;
}

export type Priority = "hard" | "high" | "low";

export interface Target {
  /** суточный минимум */
  min?: number;
  /** суточный максимум */
  max?: number;
  /** важность минимума для солвера */
  priority: Priority;
  /** ключи источников из evidence.ts */
  sources: string[];
  note?: string;
}
export type Targets = Partial<Record<NutrientKey, Target>>;

export interface EnergyPlan {
  bmr: number;
  tdee: number;
  target: number;
  bmi: number;
  bmiCategory: string;
  deficit: number;
  notes: string[];
}

export interface Warning {
  level: "info" | "warn" | "danger";
  text: string;
  sources: string[];
}

export interface MealItem { productId: string; grams: number }
export interface Meal { slot: "breakfast" | "snack" | "lunch" | "dinner"; title: string; items: MealItem[] }
export interface Day { index: number; meals: Meal[] }

export interface PlanResult {
  profile: Profile;
  energy: EnergyPlan;
  targets: Targets;
  warnings: Warning[];
  /** грамм за неделю по продукту */
  basket: Record<string, number>;
  days: Day[];
  costWeek: number;
  costByTier: Record<Tier, number | null>;
  solverStatus: string;
  /** недобор по «мягким» ограничениям: нутриенты и группы (veg, fruit, fish, legume ...) */
  shortfalls: Array<{ key: string; fraction: number }>;
}
