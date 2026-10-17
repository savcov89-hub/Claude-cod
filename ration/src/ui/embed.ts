import type { Activity, Profile } from "../core";

/**
 * Открыт во вкладке «Рацион» приложения Training Log: в адресе после # — чей это рацион (key), тема и данные из
 * «Замеров» (пол, возраст, рост, вес, активность). Часть после # не уходит на сервер.
 */
export interface Embed {
  key: string;
  /** Кто открыл: клиент у себя или тренер в карточке клиента (`name` — имя клиента). */
  role: "client" | "trainer";
  name: string;
  theme: "light" | "dark" | null;
  /** Каждый раз: пол, возраст, рост, вес — из «Замеров» (вес меняется, там он свежий). */
  always: Partial<Profile>;
  /** Только пока опросник не заполняли: активность и силовые тренировки — дальше человек меняет их сам. */
  first: Partial<Profile>;
}

/** Активность «Замеров» (сколько тренировок в неделю) → группа активности МР. */
const ACTIVITY: Record<string, Activity> = { low: "low", light: "moderate", moderate: "moderate", high: "high", extreme: "very_high" };

export function readEmbed(): Embed | null {
  const q = new URLSearchParams(location.hash.slice(1));
  if (q.get("embed") !== "1") return null;
  const num = (k: string, lo: number, hi: number) => {
    const v = Number(q.get(k));
    return Number.isFinite(v) && v >= lo && v <= hi ? v : undefined;
  };
  const always: Partial<Profile> = {};
  const sex = q.get("sex");
  if (sex === "male" || sex === "female") always.sex = sex;
  const age = num("age", 14, 100);
  if (age) always.age = Math.round(age);
  const h = num("h", 120, 230);
  if (h) always.heightCm = Math.round(h);
  const w = num("w", 30, 300);
  if (w) always.weightKg = Math.round(w * 10) / 10;
  const first: Partial<Profile> = {};
  const act = ACTIVITY[q.get("act") || ""];
  if (act) first.activity = act;
  // Клиент тренера: силовые тренировки — белок 1,6–2,0 г/кг.
  if (q.get("strength") === "1") first.strength = true;
  const theme = q.get("theme");
  return {
    key: (q.get("key") || "").slice(0, 120),
    role: q.get("role") === "trainer" ? "trainer" : "client",
    name: (q.get("name") || "").slice(0, 80),
    theme: theme === "dark" || theme === "light" ? theme : null,
    always,
    first,
  };
}
