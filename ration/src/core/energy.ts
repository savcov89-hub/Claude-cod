import type { EnergyPlan, Profile } from "./types";

/** Коэффициенты физической активности по группам МР 2.3.1.0253-21 */
export const PAL: Record<Profile["activity"], number> = { low: 1.4, moderate: 1.6, high: 1.9, very_high: 2.2 };

export function bmi(p: Profile): number {
  const h = p.heightCm / 100;
  return p.weightKg / (h * h);
}

export function bmiCategory(v: number): string {
  if (v < 18.5) return "дефицит массы тела";
  if (v < 25) return "нормальная масса тела";
  if (v < 30) return "избыточная масса тела";
  if (v < 35) return "ожирение I степени";
  if (v < 40) return "ожирение II степени";
  return "ожирение III степени";
}

/** Масса для расчёта белка при ХБП: при ИМТ > 27 берём массу при ИМТ 25 (упрощение KDOQI «идеальная масса»). */
export function proteinReferenceWeight(p: Profile): number {
  const b = bmi(p);
  if (b <= 27) return p.weightKg;
  const h = p.heightCm / 100;
  return 25 * h * h;
}

/** Расход энергии: Миффлин – Сан Жеор × КФА, надбавки МР для беременных и кормящих, цель. */
export function energyPlan(p: Profile): EnergyPlan {
  const notes: string[] = [];
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  const bmr = p.sex === "male" ? base + 5 : base - 161;
  let tdee = bmr * PAL[p.activity];

  if (p.pregnancy === "t2") { tdee += 250; notes.push("+250 ккал/сут, 2-й триместр (МР 2.3.1.0253-21, табл. 19)"); }
  if (p.pregnancy === "t3") { tdee += 350; notes.push("+350 ккал/сут, 3-й триместр (МР 2.3.1.0253-21, табл. 19)"); }
  if (p.lactation === "m0_6") { tdee += 500; notes.push("+500 ккал/сут, кормление 1–6 мес (МР 2.3.1.0253-21, табл. 19)"); }
  if (p.lactation === "m7_12") { tdee += 450; notes.push("+450 ккал/сут, кормление 7–12 мес (МР 2.3.1.0253-21, табл. 19)"); }

  let target = tdee;
  let deficit = 0;
  const b = bmi(p);

  if (p.goal === "lose") {
    if (p.pregnancy !== "none") {
      notes.push("Снижение массы тела во время беременности не планируется: рацион рассчитан на поддержание.");
    } else {
      // КР «Ожирение» 2024: дефицит 500–700 ккал от физиологической потребности; AHA/ACC/TOS 2013: 500–750
      deficit = Math.min(700, Math.max(500, Math.round(tdee * 0.2)));
      if (p.lactation !== "none") deficit = Math.min(deficit, 500);
      if (p.ckd !== "none") deficit = Math.min(deficit, 500);
      target = tdee - deficit;
      // Нижние границы: 1200 ккал женщины / 1500 мужчины (AHA/ACC/TOS 2013); 1800 ккал при лактации (Lovelady 2000)
      const floor = p.lactation !== "none" ? 1800 : p.sex === "female" ? 1200 : 1500;
      if (target < floor) { target = floor; deficit = Math.round(tdee - target); notes.push(`Калорийность не опускается ниже ${floor} ккал/сут.`); }
      if (p.ckd !== "none") {
        const minCkd = 30 * p.weightKg;
        if (target < minCkd) { target = minCkd; deficit = Math.round(tdee - target); }
        notes.push("При ХБП энергия удерживается в коридоре 30–35 ккал/кг/сут (КР ХБП 2024).");
      }
      notes.push(`Дефицит ${Math.round(deficit)} ккал/сут → ориентир снижения 0,5–1 кг в неделю, цель 5–10 % за 3–6 мес (КР «Ожирение» 2024).`);
    }
  } else if (p.goal === "gain") {
    const surplus = Math.min(500, Math.round(tdee * 0.12));
    target = tdee + surplus;
    deficit = -surplus;
    notes.push(`Профицит ${surplus} ккал/сут для набора массы.`);
  }

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    target: Math.round(target),
    bmi: Math.round(b * 10) / 10,
    bmiCategory: bmiCategory(b),
    deficit: Math.round(deficit),
    notes,
  };
}
