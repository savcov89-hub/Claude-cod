import { useEffect, useState } from "react";
import data from "./data/products.json";
import { generatePlan, getSolver, type PlanResult, type Product, type Profile, type Tier } from "./core";
import Questionnaire from "./ui/Questionnaire";
import { ResultHeader, WeekView, ShopView, NormsView, SolverFailed } from "./ui/Results";
import Evidence from "./ui/Evidence";
import { Icon } from "./ui/bits";
import { defaultProfile, loadPlan, loadSavedProfile, loadTheme, savePlan, saveProfile, saveTheme, setStorageScope } from "./ui/storage";
import { readEmbed } from "./ui/embed";
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

  useEffect(() => { saveProfile(profile); }, [profile]);
  useEffect(() => {
    if (theme) document.documentElement.setAttribute("data-theme", theme); else document.documentElement.removeAttribute("data-theme");
    if (!embed) saveTheme(theme);
  }, [theme]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [view]);

  const run = async (p: Profile) => {
    setBusy(true); setError(null);
    try {
      const solve = await getSolver(() => highsWasm);
      await new Promise((r) => setTimeout(r, 30));
      const r = generatePlan(p, products, solve);
      setPlan(r); setView("week");
      savePlan(r.solverStatus === "Optimal" ? r : null);
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
          <Questionnaire profile={profile} onChange={setProfile} onSubmit={() => run(profile)} busy={busy} products={products} fromAccount={fromAccount} />
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
            <ResultHeader plan={plan} products={products} onEdit={() => setView("form")} onPrint={embed ? () => window.print() : undefined} compact={view !== "week"} />
            {view === "week" && <WeekView plan={plan} products={products} />}
            {view === "shop" && <ShopView plan={plan} products={products} onRetier={retier} busy={busy} />}
            {view === "norms" && <NormsView plan={plan} products={products} />}
          </>
        )}
        {view === "sources" && <Evidence />}

        <footer className="pt-4 text-xs text-muted">
          <p>Приложение не является медицинской услугой и не заменяет консультацию врача или диетолога. При хронических заболеваниях, беременности и приёме лекарств согласуйте рацион с лечащим врачом.</p>
          <p className="mt-1">Нормы: МР 2.3.1.0253‑21, ВОЗ, KDIGO 2024, КР Минздрава (ХБП 2024, Ожирение 2024, СД2 2022), ADA 2026. Состав продуктов: USDA FoodData Central. Расчёты выполняются в вашем браузере, данные никуда не отправляются.</p>
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
