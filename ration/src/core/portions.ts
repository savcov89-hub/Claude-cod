import type { NutrientKey, Product, Targets } from "./types";
import { UNITS } from "./recipes";

/**
 * Граммы «для человека»: на кухне не взвешивают 217 г или 7,7 г масла. Шаг округления зависит от калорийности:
 * ошибка в полшага — не больше ≈20 ккал. Поэтому масло, орехи, сливочное масло — шагом 5 г, крупы и сыр — 10 г,
 * мясо и птица — 10–25 г, картофель, овощи, фрукты, молоко и кефир — 50 г. Шаг не больше четверти количества
 * (60 г моркови — шагом 10 г, а не 50), не меньше 5 г. Яйца — целыми штуками, штучные сладости — по половинке,
 * соль — до 0,5 г (на кухне — ложками).
 * После округления нормы и калории проверяются заново (`repairRounding`).
 */
const WHOLE = new Set(["egg"]);
const HALVES = new Set(["zefir", "cheesecake_curd", "gingerbread", "oat_cookies"]);
const STEPS = [5, 10, 25, 50];
/** ккал, на которые можно ошибиться в полшага */
const KCAL_ERR = 20;

type P = Pick<Product, "id" | "per100g">;

export function stepOf(p: P, g: number): number {
  if (p.id === "salt_iodized") return 0.5;
  const u = UNITS[p.id];
  if (u && WHOLE.has(p.id)) return u[0];
  if (u && HALVES.has(p.id)) return u[0] / 2;
  const byKcal = (2 * KCAL_ERR * 100) / Math.max(1, p.per100g.kcal);
  return [...STEPS].reverse().find((s) => s <= byKcal && s <= Math.max(5, g / 4)) ?? 5;
}

export function humanGrams(p: P, g: number): number {
  if (!(g > 0.05)) return 0;
  if (p.id === "salt_iodized") return Math.max(0.5, Math.round(g * 2) / 2);
  const s = stepOf(p, g);
  if (WHOLE.has(p.id) && g < s * 0.5) return Math.max(5, Math.round(g / 5) * 5); // яйцо в фарш — граммами
  return Math.max(s, Math.round(g / s) * s);
}

/** Сколько всего на несколько порций: яйца — целыми штуками (в тефтели на 4 порции — 1 яйцо, а не 40 г). */
export function humanTotal(id: string, g: number): number {
  const u = UNITS[id];
  if (u && WHOLE.has(id)) return Math.max(1, Math.round(g / u[0])) * u[0];
  return Math.round(g * 10) / 10;
}

/** Соседнее «человеческое» количество вверх или вниз; null — меньше нельзя. */
function next(p: P, g: number, dir: 1 | -1): number | null {
  for (let k = 1; k <= 3; k++) {
    const v = humanGrams(p, g + dir * k * stepOf(p, g));
    if (v !== g && (dir > 0 ? v > g : v < g)) return v > 0 ? v : null;
  }
  return null;
}

/**
 * Количество, которое можно сдвинуть: `count` — сколько раз за неделю оно съедается (порция блюда × дни, добавка × 7),
 * `raw` — граммы до округления.
 */
export interface Adjustable { p: Product; grams: number; raw: number; count: number; set: (g: number) => void }

/**
 * Округление сдвигает калории и нутриенты. Если какой-то предел нарушен (калории вне ±3 %, жиры, натрий, верхние
 * пределы витаминов, обязательный минимум белка) или витамин из-за округления стал заметно ниже, чем до него,
 * по одному шагу двигаем то количество, которое лучше всего это исправляет и не создаёт новых нарушений.
 * Обычно хватает 0–6 шагов.
 */
export function repairRounding(items: Adjustable[], targets: Targets): void {
  const keys = Object.keys(targets) as NutrientKey[];
  const sum = (g: (it: Adjustable) => number) => {
    const t = Object.fromEntries(keys.map((k) => [k, 0])) as Record<NutrientKey, number>;
    for (const it of items) for (const k of keys) t[k] += (it.p.per100g[k] * g(it) * it.count) / 700;
    return t;
  };
  const before = sum((it) => it.raw);
  const totals = sum((it) => it.grams);
  // hard — нарушенные пределы; lost — сколько мягких минимумов потеряно округлением (больше 2 % от нормы)
  const penalty = (t: Record<NutrientKey, number>) => {
    let hard = 0, lost = 0;
    for (const k of keys) {
      const tg = targets[k]!, v = t[k];
      if (tg.max != null && v > tg.max) hard += (v - tg.max) / tg.max;
      if (tg.min != null && tg.min > 0) {
        if (tg.priority === "hard" && v < tg.min) hard += (tg.min - v) / tg.min;
        else if (tg.priority !== "hard") lost += Math.max(0, Math.min(before[k], tg.min) - v - 0.02 * tg.min) / tg.min;
      }
    }
    return { hard, lost, score: hard + 0.1 * lost };
  };
  for (let iter = 0; iter < 40; iter++) {
    const now = penalty(totals);
    if (now.hard < 1e-9 && now.lost < 1e-9) break;
    let best: { it: Adjustable; g: number; score: number } | null = null;
    for (const it of items) for (const dir of [1, -1] as const) {
      const g = next(it.p, it.grams, dir);
      if (g == null) continue;
      const t = { ...totals };
      for (const k of keys) t[k] += (it.p.per100g[k] * (g - it.grams) * it.count) / 700;
      const pn = penalty(t);
      if (pn.hard > now.hard + 1e-9) continue;
      if (pn.score < now.score - 1e-9 && (!best || pn.score < best.score)) best = { it, g, score: pn.score };
    }
    if (!best) break;
    for (const k of keys) totals[k] += (best.it.p.per100g[k] * (best.g - best.it.grams) * best.it.count) / 700;
    best.it.grams = best.g;
    best.it.set(best.g);
  }
}
