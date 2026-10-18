import type { Activity, CkdStage, Diabetes, Exclusion, Goal, Lactation, Pregnancy, Tier } from "../core";

export const CATEGORY_LABEL: Record<string, string> = {
  grain: "Крупы и макароны", bread: "Хлеб", legume: "Бобовые", vegetable: "Овощи и зелень", fruit: "Фрукты и ягоды", nut: "Орехи и семена",
  dairy: "Молочные продукты", egg: "Яйца", poultry: "Птица", meat: "Мясо", offal: "Субпродукты", fish: "Рыба", seafood: "Морепродукты",
  fat: "Масла и жиры", sweet: "Сладкое", other: "Прочее",
};
export const CATEGORY_ORDER = ["vegetable", "fruit", "grain", "bread", "legume", "dairy", "egg", "poultry", "meat", "offal", "fish", "seafood", "nut", "fat", "sweet", "other"];

export const ACTIVITY: Record<Activity, { label: string; hint: string }> = {
  low: { label: "Низкая", hint: "офис, мало ходьбы · КФА 1,4" },
  moderate: { label: "Умеренная", hint: "ходьба, 2–3 тренировки в неделю · КФА 1,6" },
  high: { label: "Высокая", hint: "физический труд или 4–6 тренировок · КФА 1,9" },
  very_high: { label: "Очень высокая", hint: "тяжёлый труд, спорт ежедневно · КФА 2,2" },
};
export const GOAL: Record<Goal, string> = { lose: "Снизить вес", maintain: "Поддерживать", gain: "Набрать массу" };
export const TIER: Record<Tier, { label: string; hint: string }> = {
  econom: { label: "Эконом", hint: "базовые продукты, «первая цена», сезонные овощи" },
  business: { label: "Бизнес", hint: "+ индейка, красная рыба, орехи, ягоды, зелень круглый год" },
  premium: { label: "Премиум", hint: "+ сёмга, кедровый орех, авокадо, оливковое масло, муксун" },
};
export const PREGNANCY: Record<Pregnancy, string> = { none: "Нет", t1: "1-й триместр", t2: "2-й триместр", t3: "3-й триместр" };
export const LACTATION: Record<Lactation, string> = { none: "Нет", m0_6: "Кормлю, ребёнку до 6 мес", m7_12: "Кормлю, ребёнку 7–12 мес" };
export const CKD: Record<CkdStage, string> = { none: "Нет", s1_2: "ХБП С1–С2", s3a: "ХБП С3а", s3b: "ХБП С3б", s4_5: "ХБП С4–С5 (без диализа)", dialysis: "Гемодиализ" };
export const DIABETES: Record<Diabetes, string> = { none: "Нет", t1: "СД 1 типа", t2: "СД 2 типа" };
export const EXCLUSIONS: Array<{ id: Exclusion; label: string; hint?: string }> = [
  { id: "lactose", label: "Лактоза", hint: "без молока, кефира, творога; сыр и масло остаются" },
  { id: "dairy", label: "Все молочные" },
  { id: "gluten", label: "Глютен", hint: "пшеница, рожь, ячмень, овёс" },
  { id: "egg", label: "Яйца" },
  { id: "fish", label: "Рыба и морепродукты" },
  { id: "seafood", label: "Только морепродукты" },
  { id: "nuts", label: "Орехи" },
  { id: "peanut", label: "Арахис" },
  { id: "soy", label: "Соя" },
  { id: "pork", label: "Свинина" },
  { id: "red_meat", label: "Красное мясо" },
  { id: "meat", label: "Любое мясо и птица" },
  { id: "offal", label: "Субпродукты" },
  { id: "vegan", label: "Веган" },
  { id: "fasting", label: "Пост (без мяса, молока, яиц)" },
];
export const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
export const fmtInt = (v: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(v);
export const fmtRub = (v: number) => `${fmtInt(v)} ₽`;
/** 5 г, 17,5 г, 0,5 г — без «,0» */
export const fmtG = (v: number) => (v < 20 ? String(Math.round(v * 10) / 10).replace(".", ",") : fmtInt(v)) + " г";
