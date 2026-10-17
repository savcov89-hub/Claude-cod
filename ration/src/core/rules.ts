import type { Product, Profile, Warning } from "./types";

export interface Restrictions {
  /** продукты полностью исключены */
  excluded: Set<string>;
  /** переопределённый недельный максимум, г */
  caps: Record<string, number>;
  /** недельный максимум для субпродуктов (группа) */
  offalCapWeek: number;
  warnings: Warning[];
}

const EXCLUSION_TAGS: Record<string, string[]> = {
  lactose: ["lactose"],
  dairy: ["dairy"],
  gluten: ["gluten"],
  egg: ["egg"],
  fish: ["fish"],
  seafood: ["seafood"],
  nuts: ["nuts"],
  peanut: ["peanut"],
  soy: ["soy"],
  pork: ["pork"],
  red_meat: ["red_meat"],
  meat: ["meat"],
  offal: ["offal"],
  vegan: ["meat", "fish", "seafood", "dairy", "egg"],
  fasting: ["meat", "dairy", "egg"],
};

export function applyRules(p: Profile, products: Product[]): Restrictions {
  const excluded = new Set<string>();
  const caps: Record<string, number> = {};
  const warnings: Warning[] = [];
  let offalCapWeek = 250;

  const tags = new Set<string>();
  for (const e of p.exclusions) for (const t of EXCLUSION_TAGS[e] ?? []) tags.add(t);
  if (p.pregnancy !== "none") tags.add("pregnancy_avoid");

  for (const pr of products) {
    if (pr.prices[p.tier] == null) { excluded.add(pr.id); continue; }
    if (pr.season === "summer" && p.season === "winter") {
      // зимой сезонные овощи/ягоды остаются (тепличные/замороженные), но реже; строго летние — исключаем
      const cap = Math.round((pr.max_week_g ?? 500) * 0.4);
      if (pr.tags.includes("summer_only") || cap < pr.min_week_g) excluded.add(pr.id);
      else caps[pr.id] = cap;
    }
    if (pr.season === "winter" && p.season === "summer") {
      const cap = Math.round((pr.max_week_g ?? 500) * 0.5);
      if (cap < pr.min_week_g) excluded.add(pr.id); else caps[pr.id] = cap;
    }
    if (pr.tags.some((t) => tags.has(t))) excluded.add(pr.id);
    if (p.dislikes.includes(pr.id)) excluded.add(pr.id);

    const treat = pr.tags.includes("treat");
    if (treat) {
      if (p.treats === "none") excluded.add(pr.id);
      else if (p.favTreats.length > 0 && !p.favTreats.includes(pr.id)) excluded.add(pr.id);
    }
    if (p.diabetes !== "none") {
      // при диабете сахаросодержащее исключено; из десертов остаётся горький шоколад в малых дозах (ADA: умеренность, не запрет)
      if (pr.tags.includes("added_sugar") && !(treat && pr.tags.includes("diabetes_ok_treat") && p.treats !== "none")) excluded.add(pr.id);
      else if (pr.tags.includes("diabetes_ok_treat")) caps[pr.id] = Math.min(caps[pr.id] ?? Infinity, 105);
      else if (pr.tags.includes("high_gi")) caps[pr.id] = Math.min(caps[pr.id] ?? Infinity, Math.round((pr.max_week_g ?? 500) * 0.4));
    }
    if (p.goal === "lose" && pr.tags.includes("added_sugar") && !treat) caps[pr.id] = Math.min(caps[pr.id] ?? Infinity, 70);
    if (p.ckd !== "none" && pr.id === "salt_iodized") caps[pr.id] = 20;
  }

  if (p.exclusions.includes("lactose")) {
    warnings.push({ level: "info", text: "Непереносимость лактозы: исключены молоко, кефир, йогурт, творог, сметана. Твёрдые сыры и сливочное масло почти не содержат лактозы и оставлены; большинство людей переносят до 12 г лактозы за приём.", sources: ["EFSA_LACTOSE_2010"] });
  }
  if (p.exclusions.includes("gluten")) {
    warnings.push({ level: "info", text: "Безглютеновый режим: исключены пшеница, рожь, ячмень, овёс (овёс — из-за риска контаминации). Если целиакия подтверждена, выбирайте продукты с маркировкой «без глютена».", sources: [] });
  }
  if (p.exclusions.includes("vegan")) {
    warnings.push({ level: "warn", text: "Веганский рацион: витамин B12 из еды не поступает — нужна добавка; йод закрывается ламинарией и йодированной солью; следите за железом, цинком, кальцием, витамином D и омега‑3 (лён, грецкий орех).", sources: ["MR2021"] });
  }

  if (p.pregnancy !== "none") {
    offalCapWeek = 100;
    caps["tuna_canned"] = Math.min(caps["tuna_canned"] ?? Infinity, 140);
    warnings.push({ level: "warn", text: "Беременность: исключены мягкие рассольные сыры, солёная сельдь, икра (листериоз, соль). Печень ограничена 100 г/нед из-за витамина A. Снижение веса не планируется. Обсудите с врачом добавки: фолиевая кислота 400 мкг и железо 30–60 мг ежедневно, йод.", sources: ["WHO_ANC_2016", "MR2021", "EFSA_UL"] });
    if (p.goal === "lose") warnings.push({ level: "danger", text: "Цель «снижение веса» при беременности не применяется: рацион рассчитан на поддержание с надбавкой по триместру.", sources: ["MR2021"] });
  }
  if (p.lactation !== "none") {
    warnings.push({ level: "info", text: "Грудное вскармливание: нормы увеличены (+500/+450 ккал, +40/+30 г белка, йод 290 мкг, кальций 1400 мг). При цели снизить вес дефицит ограничен 500 ккал и не ниже 1800 ккал/сут.", sources: ["MR2021", "LOVELADY_2000"] });
  }

  if (p.ckd !== "none") {
    const stage: Record<string, string> = { s1_2: "С1–С2", s3a: "С3а", s3b: "С3б", s4_5: "С4–С5", dialysis: "С5Д (гемодиализ)" };
    warnings.push({ level: "danger", text: `ХБП ${stage[p.ckd]}: рацион рассчитан по белку, калию, фосфору и натрию согласно КР «ХБП» 2024 и KDIGO 2024, но при ХБП питание назначает нефролог или диетолог по анализам (калий, фосфор, альбумин). Используйте план как заготовку для обсуждения с врачом.`, sources: ["RU_CKD_2024", "KDIGO_2024", "KDOQI_2020"] });
    if (p.ckd === "s3b" || p.ckd === "s4_5") warnings.push({ level: "warn", text: "Белок ограничен до 0,6–0,8 г/кг/сут. Очень низкобелковые диеты (0,3–0,4 г/кг с кетоаналогами) возможны только под наблюдением врача и в приложении не используются.", sources: ["RU_CKD_2024", "KDIGO_2024"] });
    if (p.ckd === "dialysis") warnings.push({ level: "warn", text: "Гемодиализ: белок повышен до 1,0–1,2 г/кг/сут, фосфор <800 мг, калий 2–3 г. Ограничение жидкости в приложении не учитывается.", sources: ["KDOQI_2020"] });
    if (p.goal === "lose") warnings.push({ level: "warn", text: "При ХБП дефицит ограничен 500 ккал и энергия не ниже 30 ккал/кг. Снижение веса при ХБП — только по согласованию с нефрологом.", sources: ["RU_CKD_2024"] });
  }

  if (p.diabetes === "t1") {
    warnings.push({ level: "warn", text: "СД 1 типа: углеводы распределены равномерно по приёмам, для каждого приёма показаны ХЕ (1 ХЕ = 10 г углеводов). Дозу инсулина на ХЕ определяет эндокринолог. Исключены сахар, мёд, варенье, шоколад; продукты с высоким ГИ ограничены.", sources: ["RU_ALG_2025", "ADA_2026"] });
  }
  if (p.diabetes === "t2") {
    warnings.push({ level: "warn", text: "СД 2 типа: при избыточной массе цель — снижение на 5–10 % (ADA: ≥5–7 %); клетчатка ≥14 г/1000 ккал; добавленные сахара ≤5 % энергии; углеводы из овощей, бобовых, цельных злаков и молочных продуктов; голодание противопоказано.", sources: ["RU_ALG_2025", "RU_T2D_2022", "ADA_2026"] });
  }
  if (p.diabetes !== "none" && p.pregnancy !== "none") {
    warnings.push({ level: "danger", text: "Диабет при беременности ведётся эндокринологом с индивидуальными целями гликемии; этот план — только ориентир по продуктам.", sources: ["RU_ALG_2025"] });
  }

  if (p.strength && p.ckd === "none") {
    warnings.push({ level: "info", text: `Силовые тренировки: белок ${p.goal === "lose" ? "1,6–2,2" : "1,6–2,0"} г/кг/сут. Плато прироста мышц в мета-анализе 49 РКИ — около 1,6 г/кг; при дефиците калорий у тренированных нужно больше, чтобы сохранить мышцы.`, sources: ["MORTON_2018", "ISSN_2017", ...(p.goal === "lose" ? ["REFALO_2025"] : [])] });
  }
  if (p.strength && p.ckd !== "none") {
    warnings.push({ level: "warn", text: "Силовые тренировки при ХБП: белок остаётся ограниченным по стадии ХБП, повышать его до спортивных 1,6–2,0 г/кг нельзя без решения нефролога.", sources: ["KDIGO_2024", "RU_CKD_2024"] });
  }
  if (p.treats !== "none") {
    warnings.push({ level: "info", text: `Вкусняшки: в рационе заложено ≈${p.treats === "some" ? 120 : 220} ккал/сут на десерт в пределах нормы ВОЗ по добавленным сахарам${p.diabetes !== "none" ? " (при диабете — только горький шоколад 70–85 %)" : ""}. Гибкий контроль без полных запретов связан с лучшим удержанием веса, чем жёсткие правила.`, sources: ["WESTENHOEFER_1999", "TEIXEIRA_2010", "WHO_SUGAR_2015"] });
  }

  const bmiV = p.weightKg / Math.pow(p.heightCm / 100, 2);
  if (p.goal === "lose" && bmiV < 18.5) warnings.push({ level: "danger", text: "ИМТ ниже 18,5: снижение веса не рекомендуется. Рацион рассчитан на поддержание.", sources: ["RU_OBESITY_2024"] });
  if (p.goal === "lose" && bmiV >= 25 && p.pregnancy === "none") {
    warnings.push({ level: "info", text: "Снижение веса: дефицит 500–700 ккал/сут, белок 1,2–1,6 г/кг для сохранения мышц, минимально обработанные продукты. Интервальное голодание не даёт преимуществ перед обычным дефицитом, выбирайте удобное число приёмов пищи.", sources: ["RU_OBESITY_2024", "LEIDY_2015", "NATMED_UPF_2025", "BMJ_IF_2025"] });
  }
  if (p.age < 18) warnings.push({ level: "danger", text: "Нормы в приложении рассчитаны для взрослых (18+). Для детей и подростков используйте табл. 21 МР 2.3.1.0253-21 и консультацию педиатра.", sources: ["MR2021"] });

  return { excluded, caps, offalCapWeek, warnings };
}
