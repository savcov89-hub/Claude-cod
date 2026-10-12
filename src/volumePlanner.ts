import { catalog } from './catalog';
import { ROLES, roleOf } from './templates';
import { EXERCISE_LOAD, PARTS, cleanTargets, type Load } from './volume';
import type { ProgramDay } from './types';

/**
 * A program from weekly volume: the trainer sets sets a week for every muscle part, the planner picks exercises.
 * 1. Each part is given days of the week (twice a week when there is enough of it, no more than ~6 sets a day).
 * 2. Exercises are added one by one where they cover most of what is missing — big movements first by themselves,
 *    because they cover several parts, halves included (a press gives the front delt and the triceps half a set).
 * 3. Sets (2–5) are tuned so the week comes as close to the targets as it can.
 */
export type SplitKind = 'full' | 'upperLower' | 'ppl' | 'hybrid';
export const SPLITS: Array<{ id: SplitKind; label: string }> = [
  { id: 'full', label: 'Всё тело' },
  { id: 'upperLower', label: 'Верх / низ' },
  { id: 'ppl', label: 'Толкай / тяни / ноги' },
  { id: 'hybrid', label: 'Верх / низ + толкай / тяни / ноги' },
];
/** 2–3 workouts — the whole body each time, 4 — upper and lower, 5 — upper/lower + push/pull/legs, 6–7 — push/pull/legs. */
export const autoSplit = (n: number): SplitKind => (n <= 3 ? 'full' : n === 4 ? 'upperLower' : n === 5 ? 'hybrid' : 'ppl');

type DayKind = 'full' | 'upper' | 'lower' | 'push' | 'pull' | 'legs';
const SEQUENCE: Record<SplitKind, DayKind[]> = {
  full: ['full'],
  upperLower: ['upper', 'lower'],
  ppl: ['push', 'pull', 'legs'],
  hybrid: ['upper', 'lower', 'push', 'pull', 'legs'],
};
const DAY_NAME: Record<DayKind, string> = { full: 'Всё тело', upper: 'Верх', lower: 'Низ', push: 'Толкай', pull: 'Тяни', legs: 'Ноги' };
const UPPER = ['chest', 'lats', 'upperBack', 'deltFront', 'deltSide', 'deltRear', 'bicepsBrachii', 'brachialis', 'tricepsLong', 'tricepsShort'];
const LOWER = ['rectusFemoris', 'vasti', 'hamsLong', 'hamsShort', 'glutes', 'abductors', 'adductors', 'gastrocnemius', 'soleus', 'erectors'];
/** Parts a day may work as main work (abs any day). */
const ALLOWED: Record<DayKind, Set<string>> = {
  full: new Set(PARTS.map((p) => p.id)),
  upper: new Set([...UPPER, 'abs']),
  lower: new Set([...LOWER, 'abs']),
  push: new Set(['chest', 'deltFront', 'deltSide', 'tricepsLong', 'tricepsShort', 'abs']),
  pull: new Set(['lats', 'upperBack', 'deltRear', 'bicepsBrachii', 'brachialis', 'erectors', 'abs']),
  legs: new Set([...LOWER, 'abs']),
};

/**
 * Ready-made weekly targets, sets per part. They are kept reachable: presses give the front delt and the short heads
 * of the triceps half a set each, so those targets are lower or higher than the muscle's isolation alone would ask.
 */
export const TARGET_PRESETS: Array<{ id: string; label: string; targets: Record<string, number> }> = [
  {
    id: 'novice',
    label: 'Новичок',
    targets: {
      chest: 8, lats: 8, upperBack: 8, deltFront: 5, deltSide: 8, deltRear: 6, bicepsBrachii: 6, brachialis: 6, tricepsLong: 5,
      tricepsShort: 8, rectusFemoris: 3, vasti: 8, hamsLong: 8, hamsShort: 4, glutes: 8, adductors: 3, gastrocnemius: 4, soleus: 4,
      abs: 6,
    },
  },
  {
    id: 'middle',
    label: 'Средний',
    targets: {
      chest: 12, lats: 12, upperBack: 12, deltFront: 7, deltSide: 12, deltRear: 8, bicepsBrachii: 9, brachialis: 9, tricepsLong: 8,
      tricepsShort: 12, rectusFemoris: 4, vasti: 12, hamsLong: 12, hamsShort: 6, glutes: 12, abductors: 4, adductors: 5,
      gastrocnemius: 6, soleus: 6, abs: 8, erectors: 3,
    },
  },
  {
    id: 'advanced',
    label: 'Продвинутый',
    targets: {
      chest: 16, lats: 16, upperBack: 16, deltFront: 9, deltSide: 16, deltRear: 12, bicepsBrachii: 12, brachialis: 12,
      tricepsLong: 10, tricepsShort: 15, rectusFemoris: 6, vasti: 16, hamsLong: 14, hamsShort: 8, glutes: 14, abductors: 6,
      adductors: 7, gastrocnemius: 8, soleus: 8, abs: 10, erectors: 4,
    },
  },
  {
    id: 'glutes',
    label: 'Акцент на ягодицы',
    targets: {
      chest: 6, lats: 9, upperBack: 10, deltFront: 5, deltSide: 9, deltRear: 6, bicepsBrachii: 5, brachialis: 5, tricepsLong: 4,
      tricepsShort: 7, rectusFemoris: 2, vasti: 10, hamsLong: 12, hamsShort: 6, glutes: 18, abductors: 9, adductors: 6,
      gastrocnemius: 4, soleus: 4, abs: 8, erectors: 5,
    },
  },
];

const COMPOUND = new Set(['squat', 'hinge', 'singleLeg', 'chestPress', 'inclinePress', 'dip', 'shoulderPress', 'verticalPull', 'row', 'bridge', 'hipExtension']);
const HEAVY = new Set(['bench-press', 'back-squat', 'front-squat', 'deadlift', 'barbell-row', 'overhead-press', 'rdl']);
const LONG_RANGE = new Set(['lateralRaise', 'rearDelt', 'calves']);
/** Reps and RIR as in the templates: big movements 8–12 (heavy barbell ones 6–10) at RIR 2, the rest 10–15 or 12–20 at RIR 1. */
function targetsOf(id: string, role: string): [number, number, number] {
  if (HEAVY.has(id)) return [6, 10, 2];
  if (COMPOUND.has(role)) return [8, 12, 2];
  if (LONG_RANGE.has(role)) return [12, 20, 1];
  return [10, 15, 1];
}

interface Candidate {
  id: string;
  name: string;
  role: string;
  load: Load;
  /** Parts doing the main work: decide which day it fits. */
  main: string[];
  /** The usual choice of its role goes first (0–0.5). */
  pref: number;
}
/** Not picked by the planner (the trainer adds them by hand): dips load the front of the shoulder more than a press. */
const HAND_PICKED = new Set(['dip']);
/** The only kind of exercise that may come twice in one workout (two lateral raises, cable and dumbbell). */
const TWICE = new Set(['lateralRaise']);
const CANDIDATES: Candidate[] = catalog
  .filter((c) => EXERCISE_LOAD[c.id] && !HAND_PICKED.has(roleOf(c.id) || ''))
  .map((c) => {
    // The conventional deadlift is a hinge too: never with a Romanian deadlift the same day.
    const role = roleOf(c.id) || (c.id === 'deadlift' ? 'hinge' : c.id);
    const list = ROLES[role];
    const load = EXERCISE_LOAD[c.id];
    return {
      id: c.id,
      name: c.name,
      role,
      load,
      main: Object.keys(load).filter((p) => load[p] === 1),
      pref: list ? 0.5 * (1 - list.indexOf(c.id) / list.length) : 0,
    };
  });

/** A small seeded random: the same variant — the same program. */
function seeded(seed: number) {
  let x = (seed * 2654435761) >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

const MIN_SETS = 2;
const MAX_SETS = 5;
/** 3 sets is the usual: 2, 4 and 5 are taken when they fit the targets clearly better. */
const shape = (sets: number) => 0.3 * Math.abs(sets - 3);
/** Small leanings between kinds of exercise (none for now: dips are left to the trainer, see HAND_PICKED). */
const ROLE_PREF: Record<string, number> = {};
/** A part gets no more than this a workout. */
const DAY_CAP = 9;

export interface PlanOptions {
  /** Workouts a week. */
  days: number;
  split?: SplitKind;
  /** Exercises a workout at most. */
  perDay?: number;
  /** 0 — the usual exercises; other numbers — other picks of the same kind. */
  variant?: number;
}
export interface PlanResult {
  days: ProgramDay[];
  split: SplitKind;
  /** Sets a week per part as planned. */
  total: Record<string, number>;
}

export function planByVolume(targetsIn: Record<string, number>, o: PlanOptions): PlanResult {
  const targets = cleanTargets(targetsIn);
  const n = Math.max(1, Math.min(7, Math.round(o.days)));
  const split = o.split || autoSplit(n);
  const perDay = Math.max(2, Math.min(12, o.perDay || 7));
  const kinds = Array.from({ length: n }, (_, i) => SEQUENCE[split][i % SEQUENCE[split].length]);

  // 1. Days of each part: biggest targets first, onto the least loaded days, spread evenly over the week.
  const dayTarget: Array<Record<string, number>> = kinds.map(() => ({}));
  const dayLoad = kinds.map(() => 0);
  for (const [p, t] of Object.entries(targets).sort((a, b) => b[1] - a[1])) {
    const eligible = kinds.map((_, i) => i).filter((i) => ALLOWED[kinds[i]].has(p));
    if (!eligible.length) continue;
    const k = Math.min(eligible.length, Math.max(Math.ceil(t / 6), t >= 4 ? 2 : 1));
    let best: number[] = [];
    let bestLoad = Infinity;
    for (let off = 0; off < eligible.length; off++) {
      const pick = Array.from({ length: k }, (_, j) => eligible[(off + Math.round((j * eligible.length) / k)) % eligible.length]);
      if (new Set(pick).size < k) continue;
      const l = pick.reduce((s, d) => s + dayLoad[d], 0);
      if (l < bestLoad) {
        bestLoad = l;
        best = pick;
      }
    }
    for (const d of best) {
      dayTarget[d][p] = t / k;
      dayLoad[d] += t / k;
    }
  }

  // 2. Exercises, one at a time: the one (on whichever day) that covers most of what that day still needs,
  // with the least going over the week's targets.
  const random = seeded((o.variant || 0) * 7919 + n * 31 + perDay);
  const noise = new Map(CANDIDATES.map((c) => [c.id, o.variant ? random() : 0]));
  const days: Array<Array<{ c: Candidate; sets: number }>> = kinds.map(() => []);
  const dayGot: Array<Record<string, number>> = kinds.map(() => ({}));
  const total: Record<string, number> = {};
  const used = new Set<string>();
  for (let guard = 0; guard < 120; guard++) {
    let best: { d: number; c: Candidate; sets: number; score: number; gain: number } | null = null;
    for (let d = 0; d < n; d++) {
      if (days[d].length >= perDay) continue;
      const roles = new Set(days[d].map((x) => x.c.role));
      for (const c of CANDIDATES) {
        if (used.has(c.id) || !c.main.length || !c.main.every((p) => ALLOWED[kinds[d]].has(p))) continue;
        // A second exercise of the same kind the same day — only lateral raises (cable and dumbbell).
        const again = roles.has(c.role);
        if (again && !TWICE.has(c.role)) continue;
        // Added with 2 or 3 sets: the volume goes to more exercises; step 3 tunes the sets afterwards.
        for (let sets = MIN_SETS; sets <= 3; sets++) {
          let gain = 0;
          let waste = 0;
          let capped = false;
          for (const [p, f] of Object.entries(c.load)) {
            const add = f * sets;
            if ((dayGot[d][p] || 0) + add > DAY_CAP) capped = true;
            const week = Math.max(0, (targets[p] || 0) - (total[p] || 0));
            const day = Math.max(0, (dayTarget[d][p] || 0) - (dayGot[d][p] || 0));
            // A part far from its target goes first: a muscle with nothing yet beats one almost done.
            gain += Math.min(add, day, week) * (1 + (targets[p] ? (0.5 * week) / targets[p] : 0));
            waste += Math.max(0, add - week);
          }
          if (capped) continue;
          const score =
            gain - 0.7 * waste - shape(sets) - 0.2 * days[d].length - (again ? 0.8 : 0) + c.pref + (ROLE_PREF[c.role] || 0) + 1.2 * (noise.get(c.id) || 0);
          if (!best || score > best.score) best = { d, c, sets, score, gain };
        }
      }
    }
    if (!best || best.gain < 1.5) break;
    days[best.d].push({ c: best.c, sets: best.sets });
    used.add(best.c.id);
    for (const [p, f] of Object.entries(best.c.load)) {
      dayGot[best.d][p] = (dayGot[best.d][p] || 0) + f * best.sets;
      total[p] = (total[p] || 0) + f * best.sets;
    }
  }

  // 3. Small changes while the week comes closer to the targets: sets ±1 (2–5), dropping an exercise, putting another one
  // in its place (sides delts squeezed out by big movements come back this way), adding one where there is room.
  // Short of a target counts more the further it is (a muscle left with nothing is the worst), over it — half
  // (over a part with no target — a little).
  const miss = (p: string, v: number) => {
    const t = targets[p] || 0;
    return v < t ? (t - v) * (1 + (t - v) / t) : (v - t) * (t ? 0.5 : 0.15);
  };
  /** How much closer to the targets: `changes` are [load, sets added (negative — taken away)] on day `d`. */
  const better = (d: number, changes: Array<[Load, number]>) => {
    const delta: Record<string, number> = {};
    for (const [load, sets] of changes) for (const [p, f] of Object.entries(load)) delta[p] = (delta[p] || 0) + f * sets;
    let gain = 0;
    for (const [p, v] of Object.entries(delta)) {
      if (v > 0 && (dayGot[d][p] || 0) + v > DAY_CAP) return -Infinity;
      gain += miss(p, total[p] || 0) - miss(p, (total[p] || 0) + v);
    }
    return gain;
  };
  const fits = (c: Candidate, d: number, skip = -1) =>
    !used.has(c.id) &&
    c.main.length > 0 &&
    c.main.every((p) => ALLOWED[kinds[d]].has(p)) &&
    !(!TWICE.has(c.role) && days[d].some((x, j) => j !== skip && x.c.role === c.role));
  const apply = (d: number, c: Candidate, sets: number) => {
    for (const [p, f] of Object.entries(c.load)) {
      total[p] = (total[p] || 0) + f * sets;
      dayGot[d][p] = (dayGot[d][p] || 0) + f * sets;
    }
  };
  type Move = { gain: number; d: number; i: number; to: number; c?: Candidate };
  for (let guard = 0; guard < 300; guard++) {
    let best: Move | null = null;
    // Only exercises that give something still missing can help by coming in.
    const short = new Set(Object.keys(targets).filter((p) => (total[p] || 0) < targets[p] - 0.5));
    const helpful = CANDIDATES.filter((c) => Object.keys(c.load).some((p) => short.has(p)));
    const offer = (m: Move) => {
      if (m.gain > 1e-6 && (!best || m.gain > best.gain)) best = m;
    };
    for (let d = 0; d < n; d++) {
      for (let i = 0; i < days[d].length; i++) {
        const x = days[d][i];
        for (const to of [x.sets - 1, x.sets + 1]) if (to >= MIN_SETS && to <= MAX_SETS) offer({ gain: better(d, [[x.c.load, to - x.sets]]) - shape(to) + shape(x.sets), d, i, to });
        // Dropping or replacing a whole exercise needs a clear reason.
        if (days[d].length > 1) offer({ gain: better(d, [[x.c.load, -x.sets]]) - 0.5 + shape(x.sets), d, i, to: 0 });
        for (const c of helpful) {
          if (!fits(c, d, i)) continue;
          for (let sets = MIN_SETS; sets <= 4; sets++)
            offer({ gain: better(d, [[x.c.load, -x.sets], [c.load, sets]]) - 0.4 - shape(sets) + shape(x.sets) + c.pref - x.c.pref + (ROLE_PREF[c.role] || 0) - (ROLE_PREF[x.c.role] || 0), d, i, to: sets, c });
        }
      }
      if (days[d].length < perDay)
        for (const c of helpful) {
          if (!fits(c, d)) continue;
          for (let sets = MIN_SETS; sets <= 3; sets++) offer({ gain: better(d, [[c.load, sets]]) - 0.6 - shape(sets) + (ROLE_PREF[c.role] || 0), d, i: days[d].length, to: sets, c });
        }
    }
    const m = best as Move | null;
    if (!m) break;
    const x = days[m.d][m.i];
    if (x) apply(m.d, x.c, -x.sets);
    if (m.c) {
      if (x) used.delete(x.c.id);
      used.add(m.c.id);
      days[m.d][m.i] = { c: m.c, sets: m.to };
      apply(m.d, m.c, m.to);
    } else if (m.to === 0) {
      used.delete(x.c.id);
      days[m.d].splice(m.i, 1);
    } else {
      x.sets = m.to;
      apply(m.d, x.c, m.to);
    }
  }

  // 4. Big movements first, then the rest by how much they load, abs last; empty days are left out.
  const weight = (x: { c: Candidate }) =>
    (x.c.role === 'abs' ? -100 : 0) + (COMPOUND.has(x.c.role) ? 10 : 0) + Object.values(x.c.load).reduce((s, f) => s + f, 0);
  const count: Record<string, number> = {};
  kinds.forEach((k) => (count[k] = (count[k] || 0) + 1));
  const seen: Record<string, number> = {};
  const out: ProgramDay[] = [];
  kinds.forEach((k, d) => {
    if (!days[d].length) return;
    const letter = count[k] > 1 ? ' ' + 'ABCDEFG'[(seen[k] = (seen[k] ?? -1) + 1)] : '';
    out.push({
      id: 'day-' + (out.length + 1),
      name: DAY_NAME[k] + letter,
      exercises: [...days[d]]
        .sort((a, b) => weight(b) - weight(a))
        .map(({ c, sets }) => {
          const [repMin, repMax, targetRir] = targetsOf(c.id, c.role);
          return { exerciseId: c.id, exerciseName: c.name, sets, repMin, repMax, targetRir };
        }),
    });
  });
  for (const p of Object.keys(total)) if (Math.abs(total[p]) < 1e-9) delete total[p];
  return { days: out, split, total };
}
