import { useMemo, useState } from "react";
import type { Exclusion, Product, Profile } from "../core";
import { energyPlan } from "../core";
import { Card, Chip, Field, Segmented } from "./bits";
import { ACTIVITY, CKD, DIABETES, EXCLUSIONS, GOAL, LACTATION, PREGNANCY, TIER, CATEGORY_LABEL, CATEGORY_ORDER } from "./labels";

interface Props { profile: Profile; onChange: (p: Profile) => void; onSubmit: () => void; busy: boolean; products: Product[] }

const STEPS = ["Профиль", "Цель и бюджет", "Здоровье", "Исключения", "Проверка"];

export default function Questionnaire({ profile: p, onChange, onSubmit, busy, products }: Props) {
  const [step, setStep] = useState(0);
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => onChange({ ...p, [k]: v });
  const toggleEx = (id: Exclusion) => set("exclusions", p.exclusions.includes(id) ? p.exclusions.filter((e) => e !== id) : [...p.exclusions, id]);
  const toggleDislike = (id: string) => set("dislikes", p.dislikes.includes(id) ? p.dislikes.filter((e) => e !== id) : [...p.dislikes, id]);
  const energy = useMemo(() => energyPlan(p), [p]);
  const valid = p.age >= 18 && p.age <= 100 && p.heightCm >= 130 && p.heightCm <= 220 && p.weightKg >= 35 && p.weightKg <= 250;

  const byCat = useMemo(() => {
    const m = new Map<string, Product[]>();
    for (const pr of products) { if (!m.has(pr.category)) m.set(pr.category, []); m.get(pr.category)!.push(pr); }
    return CATEGORY_ORDER.filter((c) => m.has(c)).map((c) => [c, m.get(c)!] as const);
  }, [products]);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <header className="mb-4">
        <span className="eyebrow">Опросник</span>
        <h1>Недельный рацион по нормам, под ваш бюджет</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Ответьте на пять коротких шагов. Приложение рассчитает энергию и белок, подберёт продукты из обычных магазинов
          и соберёт меню на 7 дней так, чтобы в среднем за неделю выполнялись нормы МР 2.3.1.0253‑21 и ВОЗ.
        </p>
      </header>

      <ol className="no-print mb-4 flex flex-wrap gap-1.5 text-xs font-semibold">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button type="button" onClick={() => setStep(i)} className={`pill !h-7 ${i === step ? "pill-dark" : i < step ? "bg-ok-soft text-ok" : "bg-surface-2 text-muted"}`}>
              {i + 1}. {s}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Card className="grid gap-5">
          <Field label="Пол">
            <Segmented value={p.sex} onChange={(v) => set("sex", v)} options={[{ value: "female", label: "Женский" }, { value: "male", label: "Мужской" }]} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field input label="Возраст, лет"><input className="field num" type="number" min={18} max={100} value={p.age} onChange={(e) => set("age", +e.target.value)} /></Field>
            <Field input label="Рост, см"><input className="field num" type="number" min={130} max={220} value={p.heightCm} onChange={(e) => set("heightCm", +e.target.value)} /></Field>
            <Field input label="Вес, кг"><input className="field num" type="number" min={35} max={250} step={0.5} value={p.weightKg} onChange={(e) => set("weightKg", +e.target.value)} /></Field>
          </div>
          <Field label="Физическая активность" hint="Группы по МР 2.3.1.0253‑21. Энергия считается по Миффлину – Сан Жеору × КФА.">
            <Segmented value={p.activity} onChange={(v) => set("activity", v)} options={(Object.keys(ACTIVITY) as Array<keyof typeof ACTIVITY>).map((k) => ({ value: k, ...ACTIVITY[k] }))} />
          </Field>
          <Field label="Силовые тренировки" hint="Два и больше раз в неделю с отягощениями. Поднимает норму белка до 1,6–2,0 г/кг (Morton 2018, ISSN 2017).">
            <Segmented value={p.strength ? "yes" : "no"} onChange={(v) => set("strength", v === "yes")} options={[{ value: "no", label: "Нет" }, { value: "yes", label: "Да, регулярно", hint: "≥2 раз в неделю" }]} />
          </Field>
          {!valid && <p className="text-sm text-danger">Проверьте значения: возраст 18–100, рост 130–220 см, вес 35–250 кг. Нормы приложения рассчитаны для взрослых.</p>}
          <p className="text-sm text-muted">ИМТ <b className="num">{energy.bmi}</b> · {energy.bmiCategory} · базовый обмен ≈ <b className="num">{energy.bmr}</b> ккал</p>
        </Card>
      )}

      {step === 1 && (
        <Card className="grid gap-5">
          <Field label="Цель">
            <Segmented value={p.goal} onChange={(v) => set("goal", v)} options={(Object.keys(GOAL) as Array<keyof typeof GOAL>).map((k) => ({ value: k, label: GOAL[k], hint: k === "lose" ? "дефицит 500–700 ккал, белок 1,2–1,6 г/кг" : k === "gain" ? "профицит ≈12 %, белок 1,4–2,0 г/кг" : "по расходу энергии" }))} />
          </Field>
          <Field label="Уровень корзины" hint="Влияет на набор продуктов и цены. Стоимость для всех трёх уровней покажем в списке покупок.">
            <Segmented value={p.tier} onChange={(v) => set("tier", v)} options={(Object.keys(TIER) as Array<keyof typeof TIER>).map((k) => ({ value: k, ...TIER[k] }))} />
          </Field>
          <Field label="Вкусняшки" hint="Небольшой десерт в пределах нормы ВОЗ по сахару. Гибкий подход без запретов лучше удерживает вес, чем жёсткие правила. При диабете остаётся только горький шоколад.">
            <Segmented cols={3} value={p.treats} onChange={(v) => set("treats", v)} options={[{ value: "none", label: "Без сладкого" }, { value: "some", label: "Немного", hint: "≈120 ккал/день" }, { value: "more", label: "Можно", hint: "≈220 ккал/день" }]} />
          </Field>
          {p.treats !== "none" && (
            <Field label="Любимое" hint="Отметьте, что любите, и солвер будет выбирать из этого. Ничего не отмечено — подберёт сам.">
              <div className="flex flex-wrap gap-1.5">
                {products.filter((pr) => pr.tags.includes("treat") && pr.prices[p.tier] != null).map((pr) => (
                  <Chip key={pr.id} on={p.favTreats.includes(pr.id)} onClick={() => set("favTreats", p.favTreats.includes(pr.id) ? p.favTreats.filter((x) => x !== pr.id) : [...p.favTreats, pr.id])}>{pr.name}</Chip>
                ))}
              </div>
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Приёмов пищи в день" hint="Интервальное голодание не даёт преимуществ перед обычным дефицитом (BMJ 2025), выбирайте удобный режим.">
              <Segmented cols={3} value={String(p.mealsPerDay) as "3" | "4" | "5"} onChange={(v) => set("mealsPerDay", +v as 3 | 4 | 5)} options={[{ value: "3", label: "3" }, { value: "4", label: "4" }, { value: "5", label: "5" }]} />
            </Field>
            <Field label="Сезон" hint="Зимой строго летние продукты исключены, тепличные и замороженные — ограничены.">
              <Segmented value={p.season} onChange={(v) => set("season", v)} options={[{ value: "winter", label: "Осень – зима – весна" }, { value: "summer", label: "Лето (июнь – сентябрь)" }]} />
            </Field>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card className="grid gap-5">
          {p.sex === "female" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field input label="Беременность">
                <select className="field" value={p.pregnancy} onChange={(e) => set("pregnancy", e.target.value as Profile["pregnancy"])}>
                  {Object.entries(PREGNANCY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field input label="Грудное вскармливание">
                <select className="field" value={p.lactation} onChange={(e) => set("lactation", e.target.value as Profile["lactation"])}>
                  {Object.entries(LACTATION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field input label="Сахарный диабет" hint="При СД исключаются добавленные сахара, ограничиваются продукты с высоким ГИ, углеводы распределяются равномерно; для СД1 показываются ХЕ.">
              <select className="field" value={p.diabetes} onChange={(e) => set("diabetes", e.target.value as Profile["diabetes"])}>
                {Object.entries(DIABETES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field input label="Хроническая болезнь почек" hint="Стадия по СКФ из заключения нефролога. Меняет белок, калий, фосфор и натрий.">
              <select className="field" value={p.ckd} onChange={(e) => set("ckd", e.target.value as Profile["ckd"])}>
                {Object.entries(CKD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
          </div>
          {p.ckd !== "none" && (
            <label className="flex items-start gap-3 rounded-[10px] border border-line p-3">
              <input type="checkbox" className="mt-1" checked={p.hyperkalemia} onChange={(e) => set("hyperkalemia", e.target.checked)} />
              <span><b>Калий крови выше 5,0 ммоль/л</b> (гиперкалиемия) — тогда калий в рационе ограничивается до 2–3 г/сут.</span>
            </label>
          )}
          <p className="rounded-[10px] bg-info-soft p-3 text-sm">
            Приложение не заменяет врача. При беременности, диабете и болезнях почек план питания согласуйте с лечащим врачом: он знает ваши анализы.
          </p>
        </Card>
      )}

      {step === 3 && (
        <Card className="grid gap-5">
          <Field label="Непереносимости и ограничения">
            <div className="flex flex-wrap gap-2">
              {EXCLUSIONS.map((e) => <Chip key={e.id} on={p.exclusions.includes(e.id)} onClick={() => toggleEx(e.id)} title={e.hint}>{e.label}</Chip>)}
            </div>
          </Field>
          <details className="rounded-[10px] border border-line p-3">
            <summary className="cursor-pointer text-sm font-semibold">Не люблю конкретные продукты {p.dislikes.length ? `(${p.dislikes.length})` : ""}</summary>
            <div className="mt-3 grid gap-3">
              {byCat.map(([cat, list]) => (
                <div key={cat}>
                  <div className="label">{CATEGORY_LABEL[cat] ?? cat}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {list.map((pr) => <Chip key={pr.id} on={p.dislikes.includes(pr.id)} onClick={() => toggleDislike(pr.id)}>{pr.name}</Chip>)}
                  </div>
                </div>
              ))}
            </div>
          </details>
        </Card>
      )}

      {step === 4 && (
        <Card className="grid gap-4">
          <h2>Проверьте данные</h2>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Row k="Профиль" v={`${p.sex === "female" ? "Женщина" : "Мужчина"}, ${p.age} лет, ${p.heightCm} см, ${p.weightKg} кг`} />
            <Row k="Активность" v={`${ACTIVITY[p.activity].label}${p.strength ? ", силовые тренировки" : ""}`} />
            <Row k="Цель" v={GOAL[p.goal]} />
            <Row k="Корзина" v={TIER[p.tier].label} />
            <Row k="Приёмов пищи" v={String(p.mealsPerDay)} />
            <Row k="Сезон" v={p.season === "summer" ? "лето" : "холодный сезон"} />
            {p.pregnancy !== "none" && <Row k="Беременность" v={PREGNANCY[p.pregnancy]} />}
            {p.lactation !== "none" && <Row k="Лактация" v={LACTATION[p.lactation]} />}
            {p.diabetes !== "none" && <Row k="Диабет" v={DIABETES[p.diabetes]} />}
            {p.ckd !== "none" && <Row k="ХБП" v={`${CKD[p.ckd]}${p.hyperkalemia ? ", гиперкалиемия" : ""}`} />}
            <Row k="Исключения" v={p.exclusions.length ? p.exclusions.map((e) => EXCLUSIONS.find((x) => x.id === e)?.label).join(", ") : "нет"} />
            <Row k="Вкусняшки" v={p.treats === "none" ? "без сладкого" : `${p.treats === "some" ? "≈120" : "≈220"} ккал/день${p.favTreats.length ? ": " + p.favTreats.map((id) => products.find((x) => x.id === id)?.name).filter(Boolean).join(", ") : ""}`} />
            <Row k="Расчёт энергии" v={`${energy.tdee} ккал расход → ${energy.target} ккал цель`} />
          </dl>
          <button type="button" className="btn btn-primary btn-block mt-2 sm:w-auto" disabled={!valid || busy} onClick={onSubmit}>
            {busy ? "Считаем рацион…" : "Собрать рацион на неделю"}
          </button>
        </Card>
      )}

      <div className="no-print mt-4 flex justify-between">
        <button type="button" className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}>Назад</button>
        {step < STEPS.length - 1 ? (
          <button type="button" className="btn btn-primary" disabled={!valid} onClick={() => setStep(step + 1)}>Дальше</button>
        ) : null}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line py-1.5">
      <dt className="text-muted">{k}</dt>
      <dd className="text-right font-medium">{v}</dd>
    </div>
  );
}
