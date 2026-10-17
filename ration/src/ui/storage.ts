import type { PlanResult, Product, Profile } from "../core";
import { usablePlan } from "./host";

// Внутри Training Log ответы и последний рацион хранятся у каждого человека отдельно (на общем телефоне не смешиваются).
let scope = "";
export function setStorageScope(s: string) { scope = s; }
const key = (name: string) => `tl-ration.${name}${scope ? ":" + scope : ""}`;

export function defaultProfile(): Profile {
  const m = new Date().getMonth() + 1;
  return {
    sex: "female", age: 32, heightCm: 168, weightKg: 70, activity: "low", strength: false, goal: "maintain", tier: "business", mealsPerDay: 4,
    pregnancy: "none", lactation: "none", ckd: "none", hyperkalemia: false, diabetes: "none", exclusions: [], dislikes: [],
    season: m >= 6 && m <= 9 ? "summer" : "winter",
    treats: "some", favTreats: [],
  };
}

/** Сохранённые ответы или null, если опросник ещё не заполняли. */
export function loadSavedProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(key("profile.v1"));
    if (raw) return { ...defaultProfile(), ...JSON.parse(raw) };
  } catch { /* приватный режим и т.п. */ }
  return null;
}
export function loadProfile(): Profile {
  return loadSavedProfile() ?? defaultProfile();
}

export function saveProfile(p: Profile) {
  try { localStorage.setItem(key("profile.v1"), JSON.stringify(p)); } catch { /* ignore */ }
}

/** Последний рассчитанный рацион: открыв приложение в магазине, человек сразу видит меню и покупки. */
export function loadPlan(products: Product[]): PlanResult | null {
  try {
    const raw = localStorage.getItem(key("plan.v1"));
    if (!raw) return null;
    const plan = JSON.parse(raw) as PlanResult;
    // Продукт убрали из каталога в новой версии: такой рацион не показать — считаем заново.
    return usablePlan(plan, products) ? plan : null;
  } catch {
    return null;
  }
}
export function savePlan(plan: PlanResult | null) {
  try {
    if (plan) localStorage.setItem(key("plan.v1"), JSON.stringify(plan));
    else localStorage.removeItem(key("plan.v1"));
  } catch { /* места нет: рацион просто не запомнится */ }
}

/**
 * Чей последний рацион (во вкладке Training Log): `assignedAt` и `trainerName` — это рацион, назначенный тренером;
 * `seen` — последнее назначение, которое клиент уже получил (свой пересобранный рацион оно больше не заменит).
 */
export interface PlanInfo { assignedAt?: string; trainerName?: string; seen?: string }
export function loadPlanInfo(): PlanInfo {
  try { return JSON.parse(localStorage.getItem(key("plan-info.v1")) || "{}") || {}; } catch { return {}; }
}
export function savePlanInfo(info: PlanInfo) {
  try { localStorage.setItem(key("plan-info.v1"), JSON.stringify(info)); } catch { /* ignore */ }
}

export function loadTheme(): "light" | "dark" | null {
  try { return (localStorage.getItem("tl-ration.theme") as "light" | "dark") || null; } catch { return null; }
}
export function saveTheme(t: "light" | "dark" | null) {
  try { t ? localStorage.setItem("tl-ration.theme", t) : localStorage.removeItem("tl-ration.theme"); } catch { /* ignore */ }
}
