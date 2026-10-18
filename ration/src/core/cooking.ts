import type { Cooking, MealItem, MenuPlan } from "./types";
import { DISH_MAP, type Step } from "./recipes";

/**
 * План готовки по меню из блюд. Блюда впрок готовятся в воскресенье перед неделей (а в режиме «два раза» то, что идёт
 * с четверга, — в среду вечером). Порция хранится в холодильнике, пока ей не больше `fridge` дней (3 дня — USDA FSIS:
 * 3–4 дня), остальные — сразу в морозилку, а вечером накануне переезжают в холодильник. Быстрые блюда (каша, омлет)
 * делаются утром, перекусы — без готовки.
 */

/** −1 — воскресенье перед неделей, 2 — вечер среды */
export type SessionDay = -1 | 2;
export type Where = "fridge" | "freezer" | "cook" | "ready";

export interface BatchDish {
  dish: string;
  name: string;
  slot: number;
  /** дни недели (0 — понедельник) и где ждёт порция */
  portions: Array<{ day: number; where: "fridge" | "freezer" }>;
  /** продукты на все порции этой готовки */
  total: MealItem[];
  steps: Step[];
  serve: string;
  ahead?: string;
  /** минут: всего по рецепту и «руки заняты» (нарезка и половина времени у плиты) */
  minutes: number;
  active: number;
}
export interface CookSession { day: SessionDay; dishes: BatchDish[]; minutes: number; active: number; fridge: number; freezer: number }
export interface DayDish { dish: string; name: string; slot: number; days: number[]; serving: MealItem[]; steps: Step[]; serve: string; minutes: number }
export interface CookPlan {
  mode: Cooking;
  sessions: CookSession[];
  /** готовятся в тот же день (утром) */
  daily: DayDish[];
  /** без готовки */
  ready: DayDish[];
  /** вечер дня `evening` (0 — понедельник): переложить из морозилки в холодильник */
  thaw: Array<{ evening: number; items: Array<{ name: string; slot: number }> }>;
  /** где ждёт порция: ключ `${slot}:${day}` */
  where: Record<string, { kind: Where; session?: SessionDay }>;
}

const sum = (steps: Step[], kinds: Step["k"][]) => steps.filter((s) => kinds.includes(s.k)).reduce((a, s) => a + s.min, 0);
const round = (g: number) => (g < 20 ? Math.round(g * 10) / 10 : Math.round(g));

export function cookingPlan(menu: MenuPlan, mode: Cooking = menu.cooking ?? "once"): CookPlan {
  const sessions = new Map<SessionDay, BatchDish[]>();
  const daily: DayDish[] = [];
  const ready: DayDish[] = [];
  const where: CookPlan["where"] = {};
  const thaw = new Map<number, Array<{ name: string; slot: number }>>();

  for (const pd of menu.dishes) {
    const def = DISH_MAP.get(pd.dish);
    const steps = def?.steps ?? [];
    if (!def || def.cook === "quick") {
      const row: DayDish = { dish: pd.dish, name: pd.name, slot: pd.slot, days: pd.days, serving: pd.serving, steps, serve: def?.serve ?? "", minutes: sum(steps, ["prep", "stove", "oven", "wait"]) };
      (steps.length ? daily : ready).push(row);
      for (const d of pd.days) where[`${pd.slot}:${d}`] = { kind: steps.length ? "cook" : "ready" };
      continue;
    }
    // «Два раза»: Пн–Ср — из воскресной готовки, Чт–Вс — из средней; «раз в неделю» — всё в воскресенье
    const groups = new Map<SessionDay, number[]>();
    for (const d of pd.days) {
      let s: SessionDay = mode === "twice" && d >= 3 ? 2 : -1;
      // нельзя заморозить и не долежит — готовим ближе (в среду), а если и так не долежит — в тот же день
      if (!def.freeze && d - s > def.fridge) s = 2;
      if (!def.freeze && d - s > def.fridge) { where[`${pd.slot}:${d}`] = { kind: "cook" }; continue; }
      if (!groups.has(s)) groups.set(s, []);
      groups.get(s)!.push(d);
    }
    for (const [s, days] of groups) {
      const portions = days.map((d) => ({ day: d, where: d - s <= def.fridge ? "fridge" as const : "freezer" as const }));
      for (const p of portions) {
        where[`${pd.slot}:${p.day}`] = { kind: p.where, session: s };
        if (p.where === "freezer") {
          if (!thaw.has(p.day - 1)) thaw.set(p.day - 1, []);
          thaw.get(p.day - 1)!.push({ name: pd.name, slot: pd.slot });
        }
      }
      if (!sessions.has(s)) sessions.set(s, []);
      sessions.get(s)!.push({
        dish: pd.dish, name: pd.name, slot: pd.slot, portions,
        total: pd.serving.map((it) => ({ productId: it.productId, grams: round(it.grams * days.length) })),
        steps, serve: def.serve, ahead: def.ahead,
        minutes: sum(steps, ["prep", "stove", "oven", "wait"]), active: sum(steps, ["prep"]) + Math.round(sum(steps, ["stove"]) / 2),
      });
    }
  }

  const out: CookSession[] = [...sessions.entries()].sort((a, b) => a[0] - b[0]).map(([day, dishes]) => {
    // Начинать с самого долгого: бульон и духовка идут сами, пока режется остальное
    dishes.sort((a, b) => b.minutes - a.minutes || a.slot - b.slot);
    // Руки заняты: вся нарезка и половина времени у плиты (на нескольких конфорках сразу); всего — не меньше самого
    // долгого блюда, плюс 10 минут разложить по контейнерам
    const active = dishes.reduce((a, d) => a + d.active, 0);
    const minutes = Math.round((Math.max(...dishes.map((d) => d.minutes), active) + 10) / 5) * 5;
    const count = (w: "fridge" | "freezer") => dishes.reduce((a, d) => a + d.portions.filter((p) => p.where === w).length, 0);
    return { day, dishes, minutes, active, fridge: count("fridge"), freezer: count("freezer") };
  });
  return {
    mode, sessions: out, daily, ready,
    thaw: [...thaw.entries()].sort((a, b) => a[0] - b[0]).map(([evening, items]) => ({ evening, items })),
    where,
  };
}
