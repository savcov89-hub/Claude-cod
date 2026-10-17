import type { PlanResult, Product } from "../core";

/**
 * Обмен с Training Log, когда рацион открыт в его вкладке: дневник присылает рацион, назначенный тренером,
 * а тренер из карточки клиента назначает собранный здесь рацион (дневник сохраняет его у клиента).
 */
export interface Assigned {
  plan: PlanResult;
  assignedAt: string;
  trainerName: string;
}
export type ToHost = { type: "tl-ration:ready" } | { type: "tl-ration:assign"; plan: PlanResult };
export type FromHost =
  | { type: "tl-ration:assigned"; ration: Assigned | null }
  | { type: "tl-ration:assign-result"; ration?: Assigned; error?: string };

export function toHost(msg: ToHost) {
  if (window.parent !== window) window.parent.postMessage(msg, location.origin);
}

export function onHost(fn: (msg: FromHost) => void) {
  const listen = (e: MessageEvent) => {
    if (e.source !== window.parent || e.origin !== location.origin) return;
    const t = e.data?.type;
    if (t === "tl-ration:assigned" || t === "tl-ration:assign-result") fn(e.data as FromHost);
  };
  window.addEventListener("message", listen);
  return () => window.removeEventListener("message", listen);
}

/** Рацион можно показать: решён, на 7 дней и все продукты есть в каталоге этой версии. */
export function usablePlan(plan: PlanResult | null | undefined, products: Product[]): plan is PlanResult {
  if (!plan || plan.solverStatus !== "Optimal" || !Array.isArray(plan.days) || plan.days.length !== 7 || !plan.basket || !plan.profile) return false;
  const known = new Set(products.map((p) => p.id));
  return Object.keys(plan.basket).every((id) => known.has(id));
}

/** «17 октября» — дата назначения по-русски. */
export function dayOf(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}
