// Body measurements: US Navy body-fat estimate and calorie needs.

export interface BodyEntry {
  date: string;
  weight?: number | null;
  waist?: number | null;
  neck?: number | null;
  hips?: number | null;
  /** Steps walked on that date. */
  steps?: number | null;
  updatedAt?: string;
  recordedByRole?: 'trainer' | 'client';
}
export interface BodyProfile {
  sex: 'm' | 'f';
  heightCm: number;
  birthYear: number;
  activity: string;
}

/**
 * Training frequency. `factor` is the classic activity multiplier, used only while no steps are logged;
 * `perWeek` feeds the step-based estimate.
 */
export const ACTIVITY: Array<{ id: string; label: string; factor: number; perWeek: number }> = [
  { id: 'low', label: 'Без тренировок', factor: 1.2, perWeek: 0 },
  { id: 'light', label: '1–3 тренировки в неделю', factor: 1.375, perWeek: 2 },
  { id: 'moderate', label: '3–5 тренировок в неделю', factor: 1.55, perWeek: 4 },
  { id: 'high', label: '6–7 тренировок в неделю', factor: 1.725, perWeek: 6.5 },
  { id: 'extreme', label: 'Тренировки каждый день + физическая работа', factor: 1.9, perWeek: 7 },
];

/** US Navy formula (centimetres). Women need hips too. Null when measurements are missing or implausible. */
export function navyBodyFat(profile: BodyProfile, m: { waist?: number | null; neck?: number | null; hips?: number | null }) {
  const { waist, neck, hips } = m;
  const h = profile.heightCm;
  if (!waist || !neck || !h) return null;
  let bf: number;
  if (profile.sex === 'm') {
    if (waist - neck <= 0) return null;
    bf = 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(h)) - 450;
  } else {
    if (!hips || waist + hips - neck <= 0) return null;
    bf = 495 / (1.29579 - 0.35004 * Math.log10(waist + hips - neck) + 0.221 * Math.log10(h)) - 450;
  }
  return bf > 2 && bf < 70 ? Math.round(bf * 10) / 10 : null;
}

/** Latest value of each measurement up to the last entry, so a weighing without a tape measure still has a body-fat figure. */
export function latest(entries: BodyEntry[]) {
  const pick = (f: 'weight' | 'waist' | 'neck' | 'hips') => {
    for (let i = entries.length - 1; i >= 0; i--) {
      const v = entries[i][f];
      if (typeof v === 'number') return { value: v, date: entries[i].date };
    }
    return null;
  };
  return { weight: pick('weight'), waist: pick('waist'), neck: pick('neck'), hips: pick('hips') };
}

/** Average of `field` over the 7 days ending at `end` (yyyy-mm-dd), and over the 7 days before that. */
export function weeklyAverage(entries: BodyEntry[], end: string, field: 'weight' | 'steps' = 'weight') {
  const day = 86400000;
  const endMs = Date.parse(end + 'T12:00:00');
  const avg = (from: number, to: number) => {
    const list = entries
      .filter((e) => typeof e[field] === 'number')
      .filter((e) => {
        const t = Date.parse(e.date + 'T12:00:00');
        return t > from && t <= to;
      })
      .map((e) => e[field] as number);
    return list.length ? Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10 : null;
  };
  return { current: avg(endMs - 7 * day, endMs), previous: avg(endMs - 14 * day, endMs - 7 * day) };
}

/** Steps already covered by the sedentary multiplier (home, office). */
const BASE_STEPS = 3000;
/** Net walking cost ≈ 0,5 kcal per kg of body weight per 1000 steps. */
export const stepKcal = (steps: number, weight: number) => Math.max(0, steps - BASE_STEPS) * 0.0005 * weight;
/** A strength session of about an hour: ~5 MET, i.e. 4 kcal per kg above rest. */
export const trainingKcal = (perWeek: number, weight: number) => (perWeek * 4 * weight) / 7;

/**
 * Daily energy. BMR: Katch–McArdle from lean mass when body fat is known (more exact for trained people),
 * otherwise Mifflin–St Jeor. With logged steps: BMR × 1,2 + walking + training, so 15 000 steps a day count
 * as the high activity they are; without steps the classic multiplier by training frequency.
 */
export function calories(profile: BodyProfile, weight: number, bodyFat: number | null, steps: number | null = null, year = new Date().getFullYear()) {
  const age = year - profile.birthYear;
  const bmr =
    bodyFat !== null
      ? 370 + 21.6 * weight * (1 - bodyFat / 100)
      : 10 * weight + 6.25 * profile.heightCm - 5 * age + (profile.sex === 'm' ? 5 : -161);
  const level = ACTIVITY.find((a) => a.id === profile.activity) || ACTIVITY[1];
  const walk = steps !== null ? stepKcal(steps, weight) : 0;
  const train = steps !== null ? trainingKcal(level.perWeek, weight) : 0;
  const total = steps !== null ? bmr * 1.2 + walk + train : bmr * level.factor;
  const maintain = Math.round(total / 10) * 10;
  return {
    method: bodyFat !== null ? 'по сухой массе (Кэтч — Макардл)' : 'по формуле Миффлина — Сан Жеора',
    bmr: Math.round(bmr),
    /** Walking and training kcal, only when steps are known. */
    walk: Math.round(walk),
    train: Math.round(train),
    factor: Math.round((total / bmr) * 100) / 100,
    maintain,
    cut: Math.round((maintain * 0.8) / 10) * 10,
    gain: Math.round((maintain * 1.1) / 10) * 10,
    protein: [Math.round(weight * 1.6), Math.round(weight * 2.2)] as [number, number],
  };
}
