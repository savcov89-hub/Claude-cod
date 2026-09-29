// Body measurements: US Navy body-fat estimate and calorie needs.

export interface BodyEntry {
  date: string;
  weight?: number | null;
  waist?: number | null;
  neck?: number | null;
  hips?: number | null;
  updatedAt?: string;
  recordedByRole?: 'trainer' | 'client';
}
export interface BodyProfile {
  sex: 'm' | 'f';
  heightCm: number;
  birthYear: number;
  activity: string;
}

export const ACTIVITY: Array<{ id: string; label: string; factor: number }> = [
  { id: 'low', label: 'Мало движения, без тренировок', factor: 1.2 },
  { id: 'light', label: 'Тренировки 1–3 раза в неделю', factor: 1.375 },
  { id: 'moderate', label: 'Тренировки 3–5 раз в неделю', factor: 1.55 },
  { id: 'high', label: 'Тренировки 6–7 раз в неделю', factor: 1.725 },
  { id: 'extreme', label: 'Тяжёлая физическая работа + тренировки', factor: 1.9 },
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

/** Average weight over the 7 days ending at `end` (yyyy-mm-dd), and over the 7 days before that. */
export function weeklyWeights(entries: BodyEntry[], end: string) {
  const day = 86400000;
  const endMs = Date.parse(end + 'T12:00:00');
  const avg = (from: number, to: number) => {
    const list = entries
      .filter((e) => typeof e.weight === 'number')
      .filter((e) => {
        const t = Date.parse(e.date + 'T12:00:00');
        return t > from && t <= to;
      })
      .map((e) => e.weight as number);
    return list.length ? Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10 : null;
  };
  return { current: avg(endMs - 7 * day, endMs), previous: avg(endMs - 14 * day, endMs - 7 * day) };
}

/**
 * Daily energy: Katch–McArdle from lean mass when body fat is known (more exact for trained people),
 * otherwise Mifflin–St Jeor. Maintenance = BMR × activity.
 */
export function calories(profile: BodyProfile, weight: number, bodyFat: number | null, year = new Date().getFullYear()) {
  const age = year - profile.birthYear;
  const bmr =
    bodyFat !== null
      ? 370 + 21.6 * weight * (1 - bodyFat / 100)
      : 10 * weight + 6.25 * profile.heightCm - 5 * age + (profile.sex === 'm' ? 5 : -161);
  const factor = ACTIVITY.find((a) => a.id === profile.activity)?.factor || 1.375;
  const maintain = Math.round((bmr * factor) / 10) * 10;
  return {
    method: bodyFat !== null ? 'по сухой массе (Кэтч — Макардл)' : 'по формуле Миффлина — Сан Жеора',
    bmr: Math.round(bmr),
    maintain,
    cut: Math.round((maintain * 0.8) / 10) * 10,
    gain: Math.round((maintain * 1.1) / 10) * 10,
    protein: [Math.round(weight * 1.6), Math.round(weight * 2.2)] as [number, number],
  };
}
