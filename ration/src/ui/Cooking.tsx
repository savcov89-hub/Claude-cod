import { useMemo } from "react";
import { PANTRY, SOURCE_MAP, UNITS, cookingPlan, type BatchDish, type CookPlan, type Cooking, type MealItem, type PlanResult, type Product, type SessionDay, type Step } from "../core";
import { Card, Segmented } from "./bits";
import { DAYS, fmtG } from "./labels";

const DAY_FULL = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"];
/** «Пн–Ср», «Чт, Сб», «каждый день» */
export function dayRange(days: number[]): string {
  const ds = [...days].sort((a, b) => a - b);
  if (ds.length === 7) return "каждый день";
  const runs: number[][] = [];
  for (const d of ds) { const r = runs[runs.length - 1]; if (r && d === r[r.length - 1] + 1) r.push(d); else runs.push([d]); }
  return runs.map((r) => (r.length >= 3 ? `${DAYS[r[0]]}–${DAYS[r[r.length - 1]]}` : r.map((d) => DAYS[d]).join(", "))).join(", ");
}
/** «Гречка (ядрица)» → «Гречка»: в меню хватает короткого названия */
export const shortName = (p: Product) => p.name.replace(/\s*\([^)]*\)/g, "").replace(/\s*«[^»]*»/g, "").trim();
const frac = (r: number) => { const w = Math.floor(r), h = r - w >= 0.5 ? "½" : ""; return w ? `${w}${h}` : h || "0"; };
/** «110 г · 2 шт.» для штучного, «20 г · ½ шт.» для сладостей по половинке */
export function amount(id: string, grams: number): string {
  const u = UNITS[id];
  if (!u || grams < u[0] * 0.4) return fmtG(grams);
  const n = grams / u[0];
  const r = Math.max(0.5, Math.round(n * 2) / 2);
  return `${fmtG(grams)} · ${Math.abs(r - n) / n > 0.1 ? "≈" : ""}${frac(r)} ${u[1]}`;
}
/** Масло и соль на кухне меряют ложками: столовая ≈ 14 г масла, чайная ≈ 5 г масла или 6 г соли. */
export function spoons(id: string, grams: number): string {
  const q = (v: number) => { const w = Math.floor(v), f = v - w; const t = f < 0.125 ? "" : f < 0.375 ? "¼" : f < 0.625 ? "½" : f < 0.875 ? "¾" : ""; return `${f >= 0.875 ? w + 1 : w || ""}${t}` || "¼"; };
  if (id === "salt_iodized") return grams < 1.5 ? "щепотка" : `${q(grams / 6)} ч. л.`;
  const half = (v: number) => frac(Math.max(0.5, Math.round(v * 2) / 2));
  if (id === "sunflower_oil" || id === "olive_oil" || id === "flax_oil") return grams >= 14 ? `${half(grams / 14)} ст. л.` : `${half(grams / 5)} ч. л.`;
  return "";
}
export const fmtMin = (m: number) => (m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч${m % 60 ? ` ${m % 60} мин` : ""}`);
const SESSION: Record<SessionDay, { title: string; eve: string }> = {
  [-1]: { title: "Воскресенье, перед неделей", eve: "В субботу вечером" },
  2: { title: "Среда, вечер", eve: "Во вторник вечером" },
};
const STEP_KIND: Record<Step["k"], string> = { prep: "руками", stove: "плита", oven: "духовка", wait: "варится само" };
const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};

/** Вечера с одинаковым списком — одной строкой: «Ср–Сб, вечером» */
function thawGroups(thaw: CookPlan["thaw"]) {
  const out: Array<{ evenings: number[]; names: string[] }> = [];
  for (const t of thaw) {
    const names = t.items.map((i) => i.name);
    const same = out.find((g) => g.names.join("|") === names.join("|"));
    if (same) same.evenings.push(t.evening); else out.push({ evenings: [t.evening], names });
  }
  return out;
}

/** «(≈500 мл на порцию)» в шаге → сколько воды на все порции этой готовки */
const scaleWater = (t: string, n: number) => t.replace(/≈(\d+) мл на порцию/g, (_, ml) => {
  const total = Number(ml) * n;
  return `≈${total >= 1000 ? `${String(Math.round(total / 100) / 10).replace(".", ",")} л` : `${total} мл`} на ${n} ${plural(n, "порцию", "порции", "порций")}`;
});

export function useCookPlan(plan: PlanResult): CookPlan | null {
  return useMemo(() => (plan.menu ? cookingPlan(plan.menu) : null), [plan]);
}

export function CookView({ plan, products, onMode }: { plan: PlanResult; products: Product[]; onMode: (m: Cooking) => void }) {
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const cp = useCookPlan(plan);
  if (!plan.menu || !cp) {
    return (
      <Card>
        <h2>Готовка</h2>
        <p className="mt-1 text-sm text-muted">Этот рацион собран из отдельных продуктов, без блюд, — плана готовки у него нет. Пересоберите рацион в опроснике: обычно получается меню из простых блюд.</p>
      </Card>
    );
  }
  const slotTitle = (k: number) => plan.days[0]?.meals[k]?.title ?? "";
  const leftovers = SOURCE_MAP.USDA_LEFTOVERS;
  return (
    <>
      <Card className="grid gap-3">
        <div>
          <h2>Как готовить</h2>
          <p className="mt-1 text-sm text-muted">Обеды и ужины готовятся впрок и раскладываются по контейнерам на одну порцию. Каши, омлеты и перекусы — в тот же день за 5–15 минут.</p>
        </div>
        <Segmented<Cooking> value={cp.mode} onChange={onMode} options={[
          { value: "once", label: "Раз в неделю", hint: "в воскресенье; на Чт–Вс — в морозилку" },
          { value: "twice", label: "Два раза", hint: "в воскресенье и в среду вечером, почти без заморозки" },
        ]} />
      </Card>

      {cp.sessions.map((s) => <SessionCard key={s.day} s={s} byId={byId} slotTitle={slotTitle} />)}

      {cp.daily.length > 0 && (
        <Card className="print-block grid gap-3">
          <h2>В тот же день</h2>
          {cp.daily.map((d) => (
            <div key={`${d.dish}:${d.slot}`} className="rounded-[10px] border border-line p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <h3>{d.name}</h3>
                <span className="text-xs text-muted">{slotTitle(d.slot)} · {dayRange(d.days)} · {fmtMin(d.minutes)}</span>
              </div>
              <Ingredients items={d.serving} byId={byId} note="на порцию" />
              <Steps steps={d.steps} />
              {d.serve && <p className="mt-1 text-xs text-muted">{d.serve}</p>}
            </div>
          ))}
        </Card>
      )}

      {cp.ready.length > 0 && (
        <Card className="print-block">
          <h2>Без готовки</h2>
          <div className="mt-1">
            {cp.ready.map((d) => (
              <div key={`${d.dish}:${d.slot}`} className="rowline text-sm">
                <span className="font-medium">{d.name}</span>
                <span className="text-xs text-muted">{slotTitle(d.slot)} · {dayRange(d.days)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {cp.thaw.length > 0 && (
        <Card className="print-block">
          <h2>Разморозка</h2>
          <p className="mt-1 text-sm text-muted">Вечером переложить контейнеры из морозилки в холодильник — к обеду и ужину следующего дня порция оттает.</p>
          <div className="mt-2">
            {thawGroups(cp.thaw).map((g) => (
              <div key={g.evenings.join()} className="border-t border-line py-2 first:border-t-0">
                <div className="text-sm font-medium">{g.evenings.length === 1 ? DAY_FULL[g.evenings[0]][0].toUpperCase() + DAY_FULL[g.evenings[0]].slice(1) : dayRange(g.evenings)}, вечером</div>
                <div className="text-sm text-muted">{g.names.join("; ")}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="print-block">
        <h2>Хранение</h2>
        <ul className="mt-1 grid list-disc gap-1 pl-5 text-sm">
          <li>Готовое остудить и убрать в холодильник в течение 2 часов, сразу по контейнерам.</li>
          <li>В холодильнике — до 3 дней; порции на дальние дни сразу идут в морозилку.</li>
          <li>В морозилке порции хранятся 3–4 месяца без потери вкуса; подпишите на крышке блюдо и день.</li>
          <li>Размораживать в холодильнике, не на столе; разогревать до горячего (пар идёт из середины). Повторно не замораживать.</li>
        </ul>
        {leftovers?.url && <p className="mt-2 text-xs text-muted">Источник: <a className="hover:underline" href={leftovers.url} target="_blank" rel="noreferrer">{leftovers.org}, «{leftovers.title}»</a></p>}
      </Card>
    </>
  );
}

function SessionCard({ s, byId, slotTitle }: { s: CookPlan["sessions"][number]; byId: Map<string, Product>; slotTitle: (k: number) => string }) {
  const ahead = s.dishes.filter((d) => d.ahead).map((d) => `${d.ahead} (${d.name.toLowerCase()})`);
  // К средней готовке сырое мясо и рыба ждут с выходных в морозилке
  const RAW = ["poultry", "meat", "offal", "fish", "seafood"];
  const raw = s.day === 2 && s.dishes.some((d) => d.total.some((it) => RAW.includes(byId.get(it.productId)?.category ?? "")));
  if (raw) ahead.unshift("мясо, птицу и рыбу для этой готовки переложить из морозилки в холодильник");
  const portions = s.fridge + s.freezer;
  return (
    <Card className="print-block grid gap-3">
      <div>
        <span className="eyebrow">Готовка впрок</span>
        <h2>{SESSION[s.day].title}</h2>
        <p className="mt-1 text-sm text-muted">
          ≈ {fmtMin(s.minutes)}, из них руки заняты ≈ {fmtMin(Math.round(s.active / 5) * 5)} · {s.dishes.length} {plural(s.dishes.length, "блюдо", "блюда", "блюд")},{" "}
          {portions} {plural(portions, "порция", "порции", "порций")}: {s.fridge} в холодильник{s.freezer ? `, ${s.freezer} в морозилку` : ""}. Понадобится {portions} {plural(portions, "контейнер", "контейнера", "контейнеров")} по одной порции.
        </p>
      </div>
      {ahead.length > 0 && (
        <div className="rounded-[10px] bg-info-soft p-3 text-sm">
          <b>{SESSION[s.day].eve}:</b> {ahead.join("; ")}.
        </div>
      )}
      <p className="text-sm">Начните с того, что готовится дольше всего: пока оно варится или стоит в духовке, нарезайте следующее.</p>
      {s.dishes.map((d, i) => <BatchCard key={`${d.dish}:${d.slot}`} n={i + 1} d={d} byId={byId} slotTitle={slotTitle} />)}
    </Card>
  );
}

function BatchCard({ n, d, byId, slotTitle }: { n: number; d: BatchDish; byId: Map<string, Product>; slotTitle: (k: number) => string }) {
  const fridge = d.portions.filter((p) => p.where === "fridge").map((p) => p.day);
  const freezer = d.portions.filter((p) => p.where === "freezer").map((p) => p.day);
  return (
    <div className="rounded-[10px] border border-line p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3>{n}. {d.name}</h3>
        <span className="text-xs text-muted">{slotTitle(d.slot)} · {d.portions.length} {plural(d.portions.length, "порция", "порции", "порций")} · {fmtMin(d.minutes)}</span>
      </div>
      <Ingredients items={d.total} byId={byId} note={`на ${d.portions.length} ${plural(d.portions.length, "порцию", "порции", "порций")}`} />
      <Steps steps={d.steps.map((st) => ({ ...st, t: scaleWater(st.t, d.portions.length) }))} />
      <p className="mt-2 text-sm">
        <b>Разложить:</b> {fridge.length > 0 && `${fridge.length} в холодильник (${dayRange(fridge)})`}{fridge.length > 0 && freezer.length > 0 && ", "}{freezer.length > 0 && `${freezer.length} в морозилку (${dayRange(freezer)})`}.
      </p>
      <p className="text-xs text-muted">{d.serve}</p>
    </div>
  );
}

function Ingredients({ items, byId, note }: { items: MealItem[]; byId: Map<string, Product>; note: string }) {
  const main = items.filter((it) => !PANTRY.has(it.productId));
  const pantry = items.filter((it) => PANTRY.has(it.productId));
  return (
    <div className="mt-2">
      <div className="label !mb-0.5">Продукты {note}</div>
      {main.map((it) => {
        const p = byId.get(it.productId);
        return (
          <div key={it.productId} className="rowline text-sm">
            <span>{p ? shortName(p) : it.productId}</span>
            <span className="num whitespace-nowrap text-xs text-muted">{amount(it.productId, it.grams)}</span>
          </div>
        );
      })}
      {pantry.length > 0 && <div className="mt-1 text-xs text-muted">{pantry.map((it) => {
        const name = byId.get(it.productId) ? shortName(byId.get(it.productId)!).toLowerCase() : it.productId;
        const sp = spoons(it.productId, it.grams);
        return it.productId === "salt_iodized" ? `${name} ${sp}` : `${name} ${fmtG(it.grams)}${sp ? ` (≈${sp})` : ""}`;
      }).join(", ")}</div>}
    </div>
  );
}

function Steps({ steps }: { steps: Step[] }) {
  if (!steps.length) return null;
  return (
    <ol className="mt-2 grid list-decimal gap-1 pl-5 text-sm">
      {steps.map((st, i) => <li key={i}>{st.t} <span className="text-xs text-muted">· {STEP_KIND[st.k]}, {st.min} мин</span></li>)}
    </ol>
  );
}
