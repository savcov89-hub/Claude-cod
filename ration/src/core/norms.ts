import type { NutrientKey, Profile, Target, Targets } from "./types";
import { proteinReferenceWeight } from "./energy";

type Row = Partial<Record<NutrientKey, number>>;

/** МР 2.3.1.0253-21, взрослые 18–64 (табл. 16–18). Калий для женщин — 2500 мг (табл. 18/20), для мужчин 3500 мг. */
const ADULT_MALE: Row = {
  vit_c: 100, vit_a: 900, vit_e: 15, vit_d: 15, vit_k: 120, vit_b1: 1.5, vit_b2: 1.8, vit_b6: 2.0, niacin: 20, vit_b12: 3.0, folate: 400, vit_b5: 5, choline: 500,
  calcium: 1000, phosphorus: 700, magnesium: 420, potassium: 3500, iron: 10, zinc: 12, iodine: 150, copper: 1.0, manganese: 2.0, selenium: 70,
};
const ADULT_FEMALE: Row = { ...ADULT_MALE, vit_a: 800, iron: 18, selenium: 55, potassium: 2500 };

/** МР 2.3.1.0253-21, табл. 20: беременные по триместрам и кормящие (абсолютные значения). */
const PREG: Record<"t1" | "t2" | "t3" | "lact", Row> = {
  t1: { vit_c: 110, vit_a: 800, vit_e: 15, vit_d: 15, vit_b1: 1.5, vit_b2: 1.8, vit_b6: 2.0, vit_b12: 3.0, folate: 600, vit_b5: 5, calcium: 1000, phosphorus: 700, magnesium: 420, potassium: 2500, iron: 18, zinc: 12, iodine: 150, selenium: 55 },
  t2: { vit_c: 110, vit_a: 900, vit_e: 17, vit_d: 15, vit_b1: 1.7, vit_b2: 2.0, vit_b6: 2.3, vit_b12: 3.5, folate: 600, vit_b5: 6, calcium: 1300, phosphorus: 900, magnesium: 450, potassium: 2500, iron: 33, zinc: 15, iodine: 220, selenium: 55 },
  t3: { vit_c: 110, vit_a: 900, vit_e: 17, vit_d: 15, vit_b1: 1.7, vit_b2: 2.0, vit_b6: 2.3, vit_b12: 3.5, folate: 600, vit_b5: 6, calcium: 1300, phosphorus: 900, magnesium: 450, potassium: 2500, iron: 33, zinc: 15, iodine: 220, selenium: 55 },
  lact: { vit_c: 130, vit_a: 1200, vit_e: 19, vit_d: 15, vit_b1: 1.8, vit_b2: 2.1, vit_b6: 2.5, vit_b12: 3.5, folate: 500, vit_b5: 7, calcium: 1400, phosphorus: 900, magnesium: 450, potassium: 2500, iron: 18, zinc: 15, iodine: 290, selenium: 55 },
};

/** Верхние допустимые уровни (EFSA 2024 / IOM). */
const UL: Row = { vit_a: 3000, vit_d: 100, vit_e: 300, vit_c: 2000, vit_b6: 12, calcium: 2500, phosphorus: 4000, iron: 45, zinc: 25, iodine: 600, copper: 5, manganese: 11, selenium: 255 };

const LOW_PRIORITY = new Set<NutrientKey>(["vit_d", "choline", "vit_k", "vit_e"]);

export interface MacroNotes { proteinPerKg: [number, number]; refWeight: number; fatPct: [number, number]; carbsMinPct: number; addedSugarPct: number; fiberMin: number }

export function buildTargets(p: Profile, energyKcal: number): { targets: Targets; macro: MacroNotes } {
  const t: Targets = {};
  const base = p.sex === "male" ? ADULT_MALE : ADULT_FEMALE;
  const put = (k: NutrientKey, tgt: Target) => { t[k] = tgt; };

  // --- микронутриенты: МР 2021 ---
  for (const [k, v] of Object.entries(base) as [NutrientKey, number][]) {
    put(k, { min: v, priority: LOW_PRIORITY.has(k) ? "low" : "high", sources: ["MR2021"] });
  }
  if (p.age >= 65) {
    t.vit_d = { ...t.vit_d!, min: 20, note: "65+ лет: 20 мкг" };
    t.calcium = { ...t.calcium!, min: 1200, note: "65+ лет: 1200 мг" };
  }
  const preg = p.pregnancy !== "none" ? PREG[p.pregnancy] : p.lactation !== "none" ? PREG.lact : null;
  if (preg) {
    for (const [k, v] of Object.entries(preg) as [NutrientKey, number][]) {
      t[k] = { ...t[k]!, min: v, sources: ["MR2021"], note: p.pregnancy !== "none" ? "беременность" : "лактация" };
    }
  }
  // верхние уровни
  for (const [k, v] of Object.entries(UL) as [NutrientKey, number][]) {
    t[k] = { ...(t[k] ?? { priority: "high", sources: [] }), max: v, sources: [...(t[k]?.sources ?? []), "EFSA_UL"] };
  }

  // --- натрий, холестерин ---
  put("sodium", { max: 2000, priority: "hard", sources: ["WHO_SODIUM_2012", "MR2021"], note: "соль <5 г/сут" });
  put("cholesterol", { max: 300, priority: "hard", sources: ["MR2021"] });

  // --- энергия ---
  put("kcal", { min: energyKcal * 0.97, max: energyKcal * 1.03, priority: "hard", sources: ["MR2021", "RU_OBESITY_2024"] });

  // --- белок ---
  // При ХБП белок считаем на скорректированную массу (KDOQI), иначе — на фактическую
  const refW = p.ckd !== "none" ? proteinReferenceWeight(p) : p.weightKg;
  let perKg: [number, number] = [0.8, 1.5];
  const protSources = ["MR2021", "ADA_2026"];
  if (p.age >= 65) { perKg = [1.0, 1.5]; protSources.push("ESPEN_GERI_2022"); }
  if (p.goal === "lose") { perKg = [1.2, 1.8]; protSources.push("LEIDY_2015", "WYCHERLEY_2012", "PROTEIN_WL_2024"); }
  if (p.goal === "gain") { perKg = [1.4, 2.0]; protSources.push("REFALO_2025"); }
  if (p.strength) {
    // силовые: плато гипертрофии ≈1,6 г/кг (Morton 2018), ISSN 1,4–2,0; при дефиците у тренированных — выше (Refalo 2025, ISSN)
    perKg = p.goal === "lose" ? [1.6, 2.2] : [1.6, 2.0];
    protSources.push("MORTON_2018", "ISSN_2017");
    if (p.goal === "lose") protSources.push("REFALO_2025");
  }
  switch (p.ckd) {
    case "s1_2": perKg = [0.8, 1.2]; protSources.push("KDIGO_2024"); break;
    case "s3a": perKg = [0.7, 0.9]; protSources.push("KDIGO_2024", "RU_ALG_2025"); break;
    case "s3b": case "s4_5": perKg = [0.6, 0.8]; protSources.push("RU_CKD_2024", "KDIGO_2024"); break;
    case "dialysis": perKg = [1.0, 1.2]; protSources.push("KDOQI_2020"); break;
  }
  let protMin = perKg[0] * refW;
  let protMax = perKg[1] * refW;
  // МР: белок не менее 12 % энергии (если ХБП не требует ограничения)
  if (p.ckd === "none" || p.ckd === "s1_2") protMin = Math.max(protMin, (0.12 * energyKcal) / 4);
  const add = p.pregnancy === "t2" ? 10 : p.pregnancy === "t3" ? 30 : p.lactation === "m0_6" ? 40 : p.lactation === "m7_12" ? 30 : 0;
  protMin += add; protMax += add;
  if (protMax < protMin + 10) protMax = protMin + 10;
  put("protein", { min: protMin, max: protMax, priority: "hard", sources: protSources, note: `${perKg[0]}–${perKg[1]} г/кг (расчётная масса ${Math.round(refW)} кг)${add ? `, +${add} г` : ""}` });

  // --- жиры ---
  const fatPct: [number, number] = p.diabetes !== "none" || p.ckd !== "none" ? [0.2, 0.35] : [0.2, 0.3];
  put("fat", { min: (fatPct[0] * energyKcal) / 9, max: (fatPct[1] * energyKcal) / 9, priority: "hard", sources: ["WHO_FAT_2023", "MR2021", ...(p.diabetes !== "none" ? ["RU_ALG_2025"] : [])] });
  put("sat_fat", { max: (0.1 * energyKcal) / 9, priority: "hard", sources: ["WHO_FAT_2023", "MR2021"] });
  put("trans_fat", { max: (0.01 * energyKcal) / 9, priority: "hard", sources: ["WHO_FAT_2023"] });

  // --- углеводы и клетчатка ---
  const carbsMinPct = p.diabetes !== "none" ? 0.4 : 0.45;
  put("carbs", { min: (carbsMinPct * energyKcal) / 4, priority: "hard", sources: ["MR2021", "ADA_2026", "DIETFITS_2018"] });
  let fiberMin = 25;
  if (p.diabetes !== "none") fiberMin = Math.max(25, (14 * energyKcal) / 1000);
  put("fiber", { min: fiberMin, max: 60, priority: "high", sources: ["WHO_CARB_2023", ...(p.diabetes !== "none" ? ["ADA_2026"] : [])] });

  // свободные сахара считаются отдельно в солвере по продуктам с добавленным сахаром
  const overweight = p.weightKg / Math.pow(p.heightCm / 100, 2) >= 25;
  const addedSugarPct = p.diabetes !== "none" || overweight || p.goal === "lose" ? 0.05 : 0.1;

  // --- ХБП: калий и фосфор ---
  if (p.ckd !== "none") {
    const restrictK = p.hyperkalemia || p.ckd === "s3b" || p.ckd === "s4_5" || p.ckd === "dialysis";
    if (restrictK) put("potassium", { min: 2000, max: 3000, priority: "hard", sources: ["RU_CKD_2024"], note: "ограничение калия" });
    else put("potassium", { min: p.sex === "male" ? 3500 : 2500, max: 5000, priority: "high", sources: ["RU_CKD_2024", "MR2021"] });
    if (p.ckd === "s3a" || p.ckd === "s3b") put("phosphorus", { min: 700, max: 1000, priority: "hard", sources: ["RU_CKD_2024"] });
    if (p.ckd === "s4_5" || p.ckd === "dialysis") put("phosphorus", { min: 500, max: 800, priority: "hard", sources: ["RU_CKD_2024", "KDOQI_2020"] });
  }

  return { targets: t, macro: { proteinPerKg: perKg, refWeight: refW, fatPct, carbsMinPct, addedSugarPct, fiberMin } };
}
