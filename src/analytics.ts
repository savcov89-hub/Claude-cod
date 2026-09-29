import { INDIRECT_FACTOR, musclesOf } from './trainingRules';

export interface SetLike {
  weight: number;
  reps: number;
  rir?: number | null;
}
export interface SessionLike {
  id?: string;
  completedAt: string;
  exercises: Array<{ exerciseId: string; exerciseName: string; sets: SetLike[] }>;
}
export interface PlanLike {
  sets: number;
  repMin: number;
  repMax: number;
  targetRir: number;
}

/** Estimated 1RM (Epley), counting reps in reserve as reps the client could still do. */
export const e1rm = (s: SetLike) => {
  const reps = s.reps + Math.max(0, Number(s.rir ?? 0) || 0);
  if (!s.weight) return reps; // bodyweight: compare by reps
  return s.weight * (1 + reps / 30);
};
const round1 = (n: number) => Math.round(n * 10) / 10;

export interface SeriesPoint {
  date: string;
  e1rm: number;
  best: SetLike;
  sets: SetLike[];
  sessionId?: string;
}
/** Performances of one exercise, oldest first. */
export function exerciseSeries(sessions: SessionLike[], exerciseId: string): SeriesPoint[] {
  return sessions
    .map((s): SeriesPoint | null => {
      const e = s.exercises.find((x) => x.exerciseId === exerciseId);
      if (!e || !e.sets.length) return null;
      const best = e.sets.reduce((a, b) => (e1rm(b) > e1rm(a) ? b : a));
      return { date: s.completedAt, e1rm: round1(e1rm(best)), best, sets: e.sets, sessionId: s.id };
    })
    .filter((x): x is SeriesPoint => !!x)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type Trend = 'new' | 'pr' | 'up' | 'flat' | 'stall' | 'down';
export interface ExerciseTrend {
  exerciseId: string;
  exerciseName: string;
  trend: Trend;
  /** Change of the latest e1RM vs the previous performance, %. */
  changePct: number;
  /** Change vs the first recorded performance, %. */
  totalPct: number;
  stallSessions: number;
  series: SeriesPoint[];
}
export const trendLabel: Record<Trend, string> = {
  new: 'Мало данных',
  pr: 'Рекорд',
  up: 'Рост',
  flat: 'Без изменений',
  stall: 'Застой',
  down: 'Снижение',
};

type Step = 'up' | 'flat' | 'down';
/** Progress between two performances in double-progression terms: more weight, or more reps at the same weight. */
export function compareStep(prev: SetLike[], cur: SetLike[]): Step {
  const wP = Math.max(...prev.map((s) => s.weight));
  const wC = Math.max(...cur.map((s) => s.weight));
  if (wC > wP) return 'up';
  const n = Math.min(prev.length, cur.length);
  const reps = (sets: SetLike[], w: number) =>
    sets.slice(0, n).reduce((sum, s) => sum + (s.weight === w ? s.reps : 0), 0);
  if (wC < wP) {
    const drop = (e1rmBest(cur) - e1rmBest(prev)) / e1rmBest(prev);
    return drop <= -0.05 ? 'down' : 'flat';
  }
  const rP = reps(prev, wP);
  const rC = reps(cur, wC);
  if (rC > rP) return 'up';
  if (rP - rC >= Math.max(3, rP * 0.1)) return 'down';
  return 'flat';
}
const e1rmBest = (sets: SetLike[]) => Math.max(...sets.map(e1rm));

export function exerciseTrend(sessions: SessionLike[], exerciseId: string): ExerciseTrend | null {
  const series = exerciseSeries(sessions, exerciseId);
  if (!series.length) return null;
  const name =
    sessions.flatMap((s) => s.exercises).find((e) => e.exerciseId === exerciseId)?.exerciseName || '';
  const last = series[series.length - 1];
  const prev = series[series.length - 2];
  const first = series[0];
  const changePct = prev ? round1(((last.e1rm - prev.e1rm) / prev.e1rm) * 100) : 0;
  const totalPct = round1(((last.e1rm - first.e1rm) / first.e1rm) * 100);
  const steps = series.slice(1).map((p, i) => compareStep(series[i].sets, p.sets));
  let stallSessions = 0;
  for (let i = steps.length - 1; i >= 0 && steps[i] !== 'up'; i -= 1) stallSessions += 1;
  const lastStep = steps[steps.length - 1];
  const isBest = series.length >= 3 && series.slice(0, -1).every((p) => p.e1rm < last.e1rm);
  let trend: Trend;
  if (series.length < 2) trend = 'new';
  else if (lastStep === 'down') trend = 'down';
  else if (stallSessions >= 3) trend = 'stall';
  else if (lastStep === 'up' && isBest) trend = 'pr';
  else if (lastStep === 'up') trend = 'up';
  else trend = 'flat';
  return { exerciseId, exerciseName: name, trend, changePct, totalPct, stallSessions, series };
}

export function allTrends(sessions: SessionLike[]) {
  const ids = Array.from(new Set(sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId))));
  return ids
    .map((id) => exerciseTrend(sessions, id))
    .filter((t): t is ExerciseTrend => !!t);
}

export interface ClientInsights {
  stalls: Array<{ exerciseId: string; name: string; sessions: number }>;
  drops: Array<{ exerciseId: string; name: string; pct: number }>;
  prs: Array<{ exerciseId: string; name: string; e1rm: number }>;
  sessions30: number;
  lastSessionAt?: string;
  computedAt: string;
}
/** Compact summary stored with the client so the dashboard needs no history reads. */
export function clientInsights(sessions: SessionLike[], nowMs = Date.now()): ClientInsights {
  const trends = allTrends(sessions);
  const latest = [...sessions].sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0];
  const inLatest = new Set(latest?.exercises.map((e) => e.exerciseId) || []);
  return {
    stalls: trends
      .filter((t) => t.trend === 'stall')
      .map((t) => ({ exerciseId: t.exerciseId, name: t.exerciseName, sessions: t.stallSessions })),
    drops: trends
      .filter((t) => t.trend === 'down' && inLatest.has(t.exerciseId))
      .map((t) => ({ exerciseId: t.exerciseId, name: t.exerciseName, pct: t.changePct })),
    prs: trends
      .filter((t) => t.trend === 'pr' && inLatest.has(t.exerciseId))
      .map((t) => ({ exerciseId: t.exerciseId, name: t.exerciseName, e1rm: t.series[t.series.length - 1].e1rm })),
    sessions30: sessions.filter((s) => nowMs - new Date(s.completedAt).getTime() < 30 * 86400000).length,
    lastSessionAt: latest?.completedAt,
    computedAt: new Date(nowMs).toISOString(),
  };
}

/** Weight step that a typical gym can load. */
export const weightStep = (w: number) => (w < 10 ? 1 : w < 100 ? 2.5 : 5);
const roundTo = (w: number, step: number) => Math.round(w / step) * step;

export interface Suggestion {
  kind: 'first' | 'increase' | 'reps' | 'hold' | 'decrease';
  weight: number;
  reps: number[];
  text: string;
}
/** Double progression: add reps up to the top of the range, then add weight. */
/** Exercises where the loaded weight assists the client (less weight = harder). */
export const ASSISTED = new Set(['assisted-pull-up', 'stack-assisted-dip']);
export function suggestNext(plan: PlanLike & { exerciseId?: string }, previous: SetLike[]): Suggestion {
  if (plan.exerciseId && ASSISTED.has(plan.exerciseId) && previous.length) {
    const work = previous.slice(0, plan.sets);
    const w = Math.min(...work.map((s) => s.weight));
    if (work.length >= plan.sets && work.every((s) => s.reps >= plan.repMax) && w > 0) {
      const next = Math.max(0, w - weightStep(w));
      return { kind: 'increase', weight: next, reps: Array(plan.sets).fill(plan.repMin), text: 'Верх диапазона → противовес ' + fmtKg(next) + ' кг.' };
    }
    const reps = Array.from({ length: plan.sets }, (_, i) => Math.min(plan.repMax, (work[i] || work[work.length - 1]).reps + 1));
    return { kind: 'reps', weight: w, reps, text: 'Тот же противовес, цель +1 повтор: ' + reps.join(' / ') };
  }
  const n = plan.sets;
  if (!previous.length)
    return {
      kind: 'first',
      weight: 0,
      reps: Array(n).fill(plan.repMin),
      text: 'Первое выполнение: подберите вес на ' + plan.repMin + '–' + plan.repMax + ' повт.',
    };
  const work = previous.slice(0, n);
  const weight = Math.max(...work.map((s) => s.weight));
  const topSets = work.filter((s) => s.weight === weight);
  const allTop =
    work.length >= n && topSets.length === work.length && work.every((s) => s.reps >= plan.repMax);
  if (allTop && weight > 0) {
    const next = roundTo(weight + weightStep(weight), weightStep(weight) === 2.5 ? 1.25 : weightStep(weight));
    return {
      kind: 'increase',
      weight: next,
      reps: Array(n).fill(plan.repMin),
      text: 'Верх диапазона во всех подходах → ' + fmtKg(next) + ' кг на ' + plan.repMin + '+ повт.',
    };
  }
  if (allTop && weight === 0)
    return {
      kind: 'increase',
      weight: 0,
      reps: Array(n).fill(plan.repMax),
      text: 'Верх диапазона: добавьте отягощение или усложните вариант.',
    };
  const low = work.filter((s) => s.reps < plan.repMin).length;
  if (low > work.length / 2 && weight > 0) {
    const next = roundTo(weight * 0.92, weightStep(weight));
    return {
      kind: 'decrease',
      weight: next,
      reps: Array(n).fill(plan.repMin),
      text: 'Ниже диапазона в большинстве подходов → ' + fmtKg(next) + ' кг.',
    };
  }
  const reps = Array.from({ length: n }, (_, i) => {
    const p = work[i] || work[work.length - 1];
    return Math.min(plan.repMax, Math.max(plan.repMin, p.reps + 1));
  });
  return {
    kind: 'reps',
    weight,
    reps,
    text: 'Тот же вес, цель +1 повтор: ' + reps.join(' / '),
  };
}
export const fmtKg = (w: number) =>
  Number.isInteger(w) ? String(w) : String(Math.round(w * 100) / 100).replace('.', ',');

/** Working sets per muscle over the last `days` days; secondary muscles count as half. */
export function recentMuscleSets(sessions: SessionLike[], days = 7, nowMs = Date.now()) {
  const out: Record<string, number> = {};
  for (const s of sessions) {
    if (nowMs - new Date(s.completedAt).getTime() > days * 86400000) continue;
    for (const e of s.exercises) {
      const { primary, secondary } = musclesOf(e.exerciseId);
      const n = e.sets.length;
      for (const m of primary) out[m] = (out[m] || 0) + n;
      for (const m of secondary) if (!primary.includes(m)) out[m] = (out[m] || 0) + n * INDIRECT_FACTOR;
    }
  }
  return out;
}

export const daysSince = (iso?: string | null, nowMs = Date.now()) =>
  iso ? Math.floor((nowMs - new Date(iso).getTime()) / 86400000) : null;
