import { useEffect, useRef, useState } from "react";
import data from "./data/products.json";
import { generatePlan, getSolver, type PlanResult, type Product, type Profile, type Tier } from "./core";
import Questionnaire from "./ui/Questionnaire";
import { ResultHeader, WeekView, ShopView, NormsView, SolverFailed } from "./ui/Results";
import Evidence from "./ui/Evidence";
import { Icon } from "./ui/bits";
import { defaultProfile, loadPlan, loadPlanInfo, loadSavedProfile, loadTheme, savePlan, savePlanInfo, saveProfile, saveTheme, setStorageScope, type PlanInfo } from "./ui/storage";
import { readEmbed } from "./ui/embed";
import { dayOf, onHost, toHost, usablePlan, type Assigned } from "./ui/host";
import highsWasm from "highs/runtime?url";

const products = (data as { products: Product[] }).products;
// Во вкладке «Рацион» Training Log: данные клиента из «Замеров», свои ответы и рацион у каждого, тема приложения.
const embed = readEmbed();
if (embed) setStorageScope(embed.key);
/** Ответы опросника: сохранённые; во вкладке Training Log — с полом, возрастом, ростом и весом из «Замеров». */
function startProfile(): Profile {
  const saved = loadSavedProfile();
  if (!embed) return saved ?? defaultProfile();
  return { ...(saved ?? { ...defaultProfile(), ...embed.first }), ...embed.always };
}
type View = "form" | "week" | "shop" | "norms" | "sources";
const NAV: Array<{ id: View; label: string; icon: "form" | "menu" | "cart" | "pulse" | "book" }> = [
  { id: "form", label: "Опросник", icon: "form" },
  { id: "week", label: "Меню", icon: "menu" },
  { id: "shop", label: "Покупки", icon: "cart" },
  { id: "norms", label: "Нормы", icon: "pulse" },
  { id: "sources", label: "Источники", icon: "book" },
];

export default function App() {
  const [plan, setPlan] = useState<PlanResult | null>(() => loadPlan(products));
  const [view, setView] = useState<View>(() => (plan ? "week" : "form"));
  const [profile, setProfile] = useState<Profile>(startProfile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark" | null>(() => (embed ? embed.theme : loadTheme()));
  // Во вкладке Training Log: рацион, назначенный тренером (присылает дневник), и чей рацион показан.
  const [info, setInfo] = useState<PlanInfo>(() => (embed ? loadPlanInfo() : {}));
  const [assigned, setAssigned] = useState<Assigned | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState("");
  const latest = useRef({ plan, info });
  latest.current = { plan, info };

  useEffect(() => { saveProfile(profile); }, [profile]);
  useEffect(() => {
    if (theme) document.documentElement.setAttribute("data-theme", theme); else document.documentElement.removeAttribute("data-theme");
    if (!embed) saveTheme(theme);
  }, [theme]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [view]);
  useEffect(() => { if (embed) savePlanInfo(info); }, [info]);

  /** Показать назначенный тренером рацион: меню, покупки и ответы опросника — его (пол, возраст, рост, вес — из «Замеров»). */
  const adopt = (a: Assigned) => {
    setPlan(a.plan); savePlan(a.plan);
    setInfo({ assignedAt: a.assignedAt, trainerName: a.trainerName, seen: a.assignedAt });
    setProfile((p) => ({ ...p, ...a.plan.profile, ...embed?.always }));
    setView("week");
  };
  useEffect(() => {
    if (!embed) return;
    const off = onHost((m) => {
      if (m.type === "tl-ration:assigned") {
        const a = m.ration && usablePlan(m.ration.plan, products) ? m.ration : null;
        setAssigned(a);
        if (!a) return;
        const { plan: mine, info: now } = latest.current;
        // Клиенту новый рацион от тренера сменяет показанный (свой пересобранный — нет, пока не назначат снова);
        // тренеру, если здесь ещё ничего не собирали, — тот, что сейчас у клиента.
        if (embed.role === "client" ? a.assignedAt !== now.seen : !mine) adopt(a);
      } else {
        setAssigning(false);
        if (m.ration && usablePlan(m.ration.plan, products)) {
          setAssigned(m.ration);
          setInfo({ assignedAt: m.ration.assignedAt, trainerName: m.ration.trainerName, seen: m.ration.assignedAt });
          setAssignError("");
        } else setAssignError(m.error || "Не удалось назначить рацион.");
      }
    });
    toHost({ type: "tl-ration:ready" });
    return off;
  }, []);
  const assign = () => {
    if (!plan) return;
    setAssigning(true); setAssignError("");
    toHost({ type: "tl-ration:assign", plan });
  };

  const run = async (p: Profile) => {
    setBusy(true); setError(null);
    try {
      const solve = await getSolver(() => highsWasm);
      await new Promise((r) => setTimeout(r, 30));
      const r = generatePlan(p, products, solve);
      setPlan(r); setView("week");
      savePlan(r.solverStatus === "Optimal" ? r : null);
      // Собран заново — уже не рацион тренера.
      setInfo((i) => ({ seen: i.seen }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  const toggleTheme = () => {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const current = theme ?? (prefersDark ? "dark" : "light");
    setTheme(current === "dark" ? "light" : "dark");
  };
  const retier = (t: Tier) => { const p = { ...profile, tier: t }; setProfile(p); void run(p); };
  const needsPlan = view === "week" || view === "shop" || view === "norms";
  // Во вкладке Training Log пол, возраст, рост и вес — из «Замеров»; вес ушёл на килограмм и больше — рацион пора пересобрать.
  const fromAccount = !!embed && ["sex", "age", "heightCm", "weightKg"].every((k) => k in embed.always);
  const changed = plan && fromAccount
    ? [
        Math.abs(plan.profile.weightKg - profile.weightKg) >= 1 && `вес ${String(plan.profile.weightKg).replace(".", ",")} → ${String(profile.weightKg).replace(".", ",")} кг`,
        plan.profile.age !== profile.age && `возраст ${profile.age}`,
        plan.profile.heightCm !== profile.heightCm && `рост ${profile.heightCm} см`,
        plan.profile.sex !== profile.sex && "пол",
      ].filter(Boolean).join(", ")
    : "";

  return (
    <div className={embed ? "app embedded" : "app"}>
      {!embed && <header className="topbar">
        <button className="brand" onClick={() => setView("form")} aria-label="На главную">
          <span className="brand-mark"><Icon name="menu" size={15} /></span>
          <span>Рацион</span>
        </button>
        <span className="grow" />
        {plan && needsPlan && (
          <button className="btn btn-sm no-print" onClick={() => window.print()} title="Печать"><Icon name="print" size={16} /><span className="hidden sm:inline">Печать</span></button>
        )}
        <button className="btn btn-sm" onClick={toggleTheme} aria-label="Переключить тему" title="Тема"><Icon name="sun" size={16} /></button>
      </header>}

      <main className="main">
        {error && <div className="rounded-[10px] bg-danger-soft p-3 text-sm text-danger">Ошибка: {error}</div>}

        {view === "form" && (
          <Questionnaire profile={profile} onChange={setProfile} onSubmit={() => run(profile)} busy={busy} products={products} fromAccount={fromAccount} client={embed?.role === "trainer" ? embed.name || "клиента" : undefined} />
        )}

        {needsPlan && !plan && (
          <section className="card grid gap-3">
            <h2>Сначала заполните опросник</h2>
            <p className="text-muted">Меню, список покупок и нормы появятся после расчёта. Это пять коротких шагов, расчёт занимает несколько секунд.</p>
            <button className="btn btn-primary" onClick={() => setView("form")}>К опроснику</button>
          </section>
        )}
        {needsPlan && plan && plan.solverStatus !== "Optimal" && <SolverFailed plan={plan} onBack={() => setView("form")} />}
        {needsPlan && plan && plan.solverStatus === "Optimal" && (
          <>
            {changed && (
              <div className="no-print flex flex-wrap items-center justify-between gap-2 rounded-[10px] bg-warn-soft p-3 text-sm">
                <span>С прошлого расчёта изменились данные профиля ({changed}). Рацион собран по старым.</span>
                <button className="btn btn-sm" disabled={busy} onClick={() => void run(profile)}>{busy ? "Считаем…" : "Пересобрать"}</button>
              </div>
            )}
            {embed && (
              <HostBar
                role={embed.role} name={embed.name} info={info} assigned={assigned} assigning={assigning} error={assignError}
                onAssign={assign} onShow={() => assigned && adopt(assigned)}
              />
            )}
            <ResultHeader plan={plan} products={products} onEdit={() => setView("form")} onPrint={embed ? () => window.print() : undefined} compact={view !== "week"} />
            {view === "week" && <WeekView plan={plan} products={products} />}
            {view === "shop" && <ShopView plan={plan} products={products} onRetier={retier} busy={busy} />}
            {view === "norms" && <NormsView plan={plan} products={products} />}
          </>
        )}
        {view === "sources" && <Evidence />}

        <footer className="pt-4 text-xs text-muted">
          <p>Приложение не является медицинской услугой и не заменяет консультацию врача или диетолога. При хронических заболеваниях, беременности и приёме лекарств согласуйте рацион с лечащим врачом.</p>
          <p className="mt-1">Нормы: МР 2.3.1.0253‑21, ВОЗ, KDIGO 2024, КР Минздрава (ХБП 2024, Ожирение 2024, СД2 2022), ADA 2026. Состав продуктов: USDA FoodData Central. {embed?.role === "trainer"
            ? "Расчёты выполняются в браузере. Назначенный рацион вместе с ответами опросника сохраняется в дневнике клиента — его видят только клиент и тренер."
            : "Расчёты выполняются в вашем браузере, данные никуда не отправляются."}</p>
        </footer>
      </main>

      <nav className="nav no-print" aria-label="Разделы">
        {NAV.map((n) => (
          <button key={n.id} className={`nav-item ${view === n.id ? "on" : ""}`} onClick={() => setView(n.id)} aria-current={view === n.id ? "page" : undefined}>
            <Icon name={n.icon} />
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

/** Во вкладке Training Log: чей рацион показан; у тренера — «Назначить клиенту». */
function HostBar({ role, name, info, assigned, assigning, error, onAssign, onShow }: {
  role: "client" | "trainer"; name: string; info: PlanInfo; assigned: Assigned | null; assigning: boolean; error: string;
  onAssign: () => void; onShow: () => void;
}) {
  const box = "no-print flex flex-wrap items-center justify-between gap-2 rounded-[10px] p-3 text-sm";
  if (role === "client") {
    if (info.assignedAt)
      return (
        <div className={`${box} bg-info-soft`} data-testid="from-trainer">
          <span>Рацион от тренера{info.trainerName ? ` ${info.trainerName}` : ""} · назначен {dayOf(info.assignedAt)}</span>
        </div>
      );
    if (!assigned) return null;
    return (
      <div className={`${box} bg-surface-2`}>
        <span>Тренер назначил вам рацион {dayOf(assigned.assignedAt)}.</span>
        <button className="btn btn-sm" onClick={onShow}>Открыть рацион тренера</button>
      </div>
    );
  }
  const current = !!assigned && info.assignedAt === assigned.assignedAt;
  const who = name || "Клиент";
  return (
    <div className={`${box} ${current ? "bg-info-soft" : "bg-surface-2"}`} data-testid="assign-bar">
      {current ? (
        <span>Назначен клиенту {dayOf(assigned!.assignedAt)} — {who} видит его во вкладке «Рацион».</span>
      ) : (
        <>
          <span>
            {assigned ? <>Сейчас у клиента рацион от {dayOf(assigned.assignedAt)}. </> : <>{who} увидит рацион у себя во вкладке «Рацион». </>}
            {assigned && <button className="underline" onClick={onShow}>Показать</button>}
          </span>
          <button className="btn btn-sm btn-primary" disabled={assigning} onClick={onAssign}>{assigning ? "Назначаем…" : "Назначить клиенту"}</button>
        </>
      )}
      {error && <span className="w-full text-danger">{error}</span>}
    </div>
  );
}
