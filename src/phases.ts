import { ACCENTS, cleanFocus, exerciseLoad, inWeek, weekStart, type Level, type Load } from './volume';
import { GROWTH, targetsFor } from './volumePlanner';

/**
 * Specialisation plan of a client: stages one after another — «грудь, 20 подходов в неделю, 8 недель», then
 * «руки, 20 подходов, 8 недель»… Weeks are calendar weeks from Monday, from the plan's start.
 */
export interface Phase {
  /** Accent ids (src/volume.ts ACCENTS), up to 3. */
  accents: string[];
  /** Sets a week for each accent. */
  sets: number;
  weeks: number;
}
export interface PhasePlan {
  /** Monday the first stage starts, YYYY-MM-DD. */
  start: string;
  list: Phase[];
}
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export function cleanPhases(v: unknown): PhasePlan | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const p = v as { start?: unknown; list?: unknown };
  if (typeof p.start !== 'string' || !DATE.test(p.start) || !Array.isArray(p.list)) return undefined;
  const list = p.list
    .slice(0, 12)
    .map((x: any) => {
      const focus = cleanFocus({ level: 'middle', accents: x?.accents });
      const sets = Math.round(Number(x?.sets));
      const weeks = Math.round(Number(x?.weeks));
      return focus?.accents.length && sets >= 1 && sets <= 40 && weeks >= 1 && weeks <= 26 ? { accents: focus.accents, sets, weeks } : null;
    })
    .filter((x): x is Phase => !!x);
  return list.length ? { start: p.start, list } : undefined;
}

const DAY = 86400000;
/** Monday of the week of a YYYY-MM-DD date (local time). */
const mondayOf = (date: string) => weekStart(new Date(date + 'T12:00:00').getTime());
export const localDay = (d: Date) => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
/** Monday of this week, YYYY-MM-DD: where a new plan starts. */
export const thisMonday = (nowMs = Date.now()) => localDay(weekStart(nowMs));

/** Dates of each stage: its first Monday and the Monday after its last week. */
export function stagesOf(plan: PhasePlan) {
  let from = mondayOf(plan.start);
  return plan.list.map((phase) => {
    const to = new Date(from);
    to.setDate(to.getDate() + phase.weeks * 7);
    const stage = { phase, from: new Date(from), to };
    from = to;
    return stage;
  });
}
/** Where the plan is now: the stage under way (or null — not started, or all done) and its week (1-based). */
export function stageNow(plan: PhasePlan, nowMs = Date.now()) {
  const stages = stagesOf(plan);
  const i = stages.findIndex((s) => nowMs >= s.from.getTime() && nowMs < s.to.getTime());
  if (i < 0) return { index: -1, week: 0, stages, before: !!stages.length && nowMs < stages[0].from.getTime() };
  const week = Math.floor((weekStart(nowMs).getTime() - stages[i].from.getTime()) / (7 * DAY)) + 1;
  return { index: i, week, stages, before: false };
}

/**
 * Sets an exercise set gives an accent: the delts are three heads trained apart, so their sets add up; the other
 * accents are counted like a muscle — by the part a set works most (a curl is one set for the biceps, not two).
 */
export function accentShare(load: Load, accentId: string) {
  const a = ACCENTS.find((x) => x.id === accentId);
  if (!a) return 0;
  const values = a.parts.map((p) => load[p] || 0);
  return accentId === 'delts' ? values.reduce((s, v) => s + v, 0) : Math.max(0, ...values);
}

type Resolve = (exerciseId: string, own?: string[]) => string[] | undefined;
interface SessionLike {
  completedAt: string;
  exercises: Array<{ exerciseId: string; muscles?: string[]; sets: Array<{ reps: number }> }>;
}
/** Accent sets done in workouts. */
export function accentDone(sessions: SessionLike[], accentId: string, resolve?: Resolve) {
  let n = 0;
  for (const s of sessions)
    for (const e of s.exercises) {
      const load = exerciseLoad(e.exerciseId, resolve ? resolve(e.exerciseId, e.muscles) : e.muscles);
      n += accentShare(load, accentId) * e.sets.filter((x) => x.reps > 0).length;
    }
  return n;
}

export interface StageProgress {
  phase: Phase;
  from: Date;
  to: Date;
  state: 'done' | 'now' | 'next';
  /** Week under way (1-based) for the current stage; weeks gone for a finished one. */
  week: number;
  /** Per accent: sets done in the stage, planned for all of it and by the end of this week. */
  accents: Array<{ id: string; done: number; planned: number; byNow: number; thisWeek: number }>;
}
export function planProgress(plan: PhasePlan, sessions: SessionLike[], resolve?: Resolve, nowMs = Date.now()): StageProgress[] {
  const now = stageNow(plan, nowMs);
  const monday = weekStart(nowMs);
  return now.stages.map((s, i) => {
    const state = nowMs >= s.to.getTime() ? 'done' : i === now.index ? 'now' : 'next';
    const week = state === 'done' ? s.phase.weeks : state === 'now' ? now.week : 0;
    const within = sessions.filter((x) => {
      const t = new Date(x.completedAt).getTime();
      return t >= s.from.getTime() && t < s.to.getTime() && t <= nowMs;
    });
    const current = state === 'now' ? inWeek(within, monday) : [];
    return {
      phase: s.phase,
      from: s.from,
      to: s.to,
      state,
      week,
      accents: s.phase.accents.map((id) => ({
        id,
        done: accentDone(within, id, resolve),
        planned: s.phase.sets * s.phase.weeks,
        byNow: s.phase.sets * week,
        thisWeek: accentDone(current, id, resolve),
      })),
    };
  });
}

/**
 * Weekly targets for a stage: the accents get the stage's sets (the delts — shared out over their three heads, as
 * they add up), the other muscles stay at maintenance for the client's experience.
 */
export function stageTargets(level: Level, phase: Phase) {
  const out = targetsFor(level, phase.accents);
  const growth = GROWTH[level];
  for (const id of phase.accents) {
    const a = ACCENTS.find((x) => x.id === id)!;
    const base = a.parts.map((p) => growth[p] || 1);
    // The delts: heads add up to the stage's sets; the rest: the muscle's most worked part gets the stage's sets.
    const k = id === 'delts' ? phase.sets / base.reduce((s, v) => s + v, 0) : phase.sets / Math.max(...base);
    a.parts.forEach((p, j) => {
      const n = Math.round(base[j] * k);
      if (n >= 1) out[p] = Math.min(40, n);
    });
  }
  return out;
}
/** «Грудь», «Руки» (biceps and triceps together), «Грудь + Дельты». */
export const phaseLabel = (phase: Phase) => {
  const arms = phase.accents.includes('biceps') && phase.accents.includes('triceps');
  const names = phase.accents.filter((a) => !arms || (a !== 'biceps' && a !== 'triceps')).map((a) => ACCENTS.find((x) => x.id === a)?.label || a);
  return (arms ? ['Руки', ...names] : names).join(' + ');
};
