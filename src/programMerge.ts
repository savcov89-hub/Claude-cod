// A program saved from the editor when it was changed meanwhile somewhere else (a replacement or new sets
// «насовсем» from the gym journal, another phone): what the editor did is put on top of the program as it is now,
// so a change made in the gym is not undone by an editor opened on the older version.
//   base   — the program days the editor started from
//   mine   — the days the editor sends
//   theirs — the days saved on the server meanwhile
//   log    — replacements «насовсем» made meanwhile in the gym, in order (which new exercise took whose place)
import type { ProgramDay } from './types';

export interface SwapEntry {
  dayId: string;
  from: string;
  to: string;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
type Exercise = ProgramDay['exercises'][number];
const identityOf = (e: Exercise) => ({ exerciseId: e.exerciseId, exerciseName: e.exerciseName, ...(e.muscles ? { muscles: e.muscles } : {}) });
const targetsOf = (e: Exercise) => ({ sets: e.sets, repMin: e.repMin, repMax: e.repMax, targetRir: e.targetRir });

/**
 * Where each base exercise is on one side (its index there, -1 — gone): the same exercise wherever it moved; the one
 * that replaced it — by the gym's log, or else the new exercise in its place, right after the nearest exercise before
 * it that is still there (a replacement keeps its place); left over, the ones gone and the new ones in order.
 */
function follow(base: Exercise[], side: Exercise[], log: SwapEntry[] = []) {
  const at = base.map((b) => side.findIndex((x) => x.exerciseId === b.exerciseId));
  const known = new Set(base.map((b) => b.exerciseId));
  const taken = new Set(at.filter((j) => j >= 0));
  base.forEach((b, i) => {
    if (at[i] >= 0) return;
    // Replaced, maybe more than once (X → Y, then Y → Z).
    let id = b.exerciseId;
    for (let n = log.findIndex((x) => x.from === id); n >= 0; n = log.findIndex((x, k) => k > n && x.from === id)) {
      id = log[n].to;
      const j = side.findIndex((x) => x.exerciseId === id);
      if (j >= 0 && !taken.has(j) && !known.has(id)) {
        at[i] = j;
        taken.add(j);
        break;
      }
    }
  });
  base.forEach((_, i) => {
    if (at[i] >= 0) return;
    let anchor = -1;
    for (let k = i - 1; k >= 0; k--)
      if (at[k] >= 0) {
        anchor = at[k];
        break;
      }
    // The new exercises that follow the anchor there, in order; this one takes the first not taken yet.
    for (let j = anchor + 1; j < side.length && !known.has(side[j].exerciseId); j++)
      if (!taken.has(j)) {
        at[i] = j;
        taken.add(j);
        break;
      }
  });
  // Moved after being replaced: the ones still gone and the new ones still free are paired in order.
  const free = side.map((_, j) => j).filter((j) => !taken.has(j) && !known.has(side[j].exerciseId));
  base.forEach((_, i) => {
    if (at[i] < 0 && free.length) at[i] = free.shift()!;
  });
  return at;
}

/** The exercises of one workout changed on both sides. */
function mergeExercises(base: Exercise[], mine: Exercise[], theirs: Exercise[], log: SwapEntry[]): Exercise[] {
  const inMine = follow(base, mine);
  const inTheirs = follow(base, theirs, log);
  const changed = (x: Exercise, was: Exercise) => !same(identityOf(x), identityOf(was)) || !same(targetsOf(x), targetsOf(was));
  // m, t: places on each side (-1 — not there); own: which exercise it is was decided by the editor; fallback: the
  // editor's exercise for a place that took the other side's one.
  const items: Array<{ e: Exercise; m: number; t: number; own: boolean; fallback?: Exercise }> = [];
  base.forEach((was, i) => {
    const m = inMine[i];
    const t = inTheirs[i];
    // Taken out in the editor: out (the editor decides).
    if (m < 0) return;
    const e = mine[m];
    // Taken out elsewhere: stays only when the editor changed it.
    if (t < 0) {
      if (changed(e, was)) items.push({ e, m, t, own: true });
      return;
    }
    const other = theirs[t];
    // Which exercise it is and its targets (sets, reps, RIR) separately: a replacement in the gym and new sets in
    // the editor both stay; what both changed — the editor's.
    const identity = same(identityOf(e), identityOf(was)) ? identityOf(other) : identityOf(e);
    const targets = same(targetsOf(e), targetsOf(was)) ? targetsOf(other) : targetsOf(e);
    items.push({ e: { ...identity, ...targets }, m, t, own: identity.exerciseId === e.exerciseId, fallback: { ...identityOf(e), ...targets } });
  });
  const fromMine = new Set(inMine);
  const fromTheirs = new Set(inTheirs);
  mine.forEach((e, m) => !fromMine.has(m) && items.push({ e, m, t: -1, own: true }));
  theirs.forEach((e, t) => !fromTheirs.has(t) && items.push({ e, m: -1, t, own: false }));

  // Order: the side that moved exercises decides (the editor when both did); the other side's new ones go after the
  // exercise they follow there.
  const kept = (side: number[]) => side.filter((j) => j >= 0);
  const moved = (side: number[]) => kept(side).some((j, k, a) => k > 0 && j < a[k - 1]);
  const key: 'm' | 't' = moved(inMine) || !moved(inTheirs) ? 'm' : 't';
  const other: 'm' | 't' = key === 'm' ? 't' : 'm';
  const order = items.filter((x) => x[key] >= 0).sort((a, b) => a[key] - b[key]);
  for (const x of items.filter((y) => y[key] < 0).sort((a, b) => a[other] - b[other])) {
    let at = 0;
    for (let k = order.length - 1; k >= 0; k--)
      if (order[k][other] >= 0 && order[k][other] < x[other]) {
        at = k + 1;
        break;
      }
    order.splice(at, 0, x);
  }
  // Never two of the same exercise in a workout: one taken from the other side gives way to the editor's choice
  // (its place keeps the editor's exercise, when it had one).
  const chosen = new Set(items.filter((x) => x.own).map((x) => x.e.exerciseId));
  const out: Exercise[] = [];
  for (const x of order) {
    let e = x.e;
    if (!x.own && chosen.has(e.exerciseId)) {
      if (!x.fallback) continue;
      e = x.fallback;
    }
    if (out.some((y) => y.exerciseId === e.exerciseId)) continue;
    out.push(e);
  }
  return out;
}

export function mergeProgramDays(base: ProgramDay[], mine: ProgramDay[], theirs: ProgramDay[], log: SwapEntry[] = []): ProgramDay[] {
  const baseById = new Map(base.map((d) => [d.id, d]));
  const theirsById = new Map(theirs.map((d) => [d.id, d]));
  const out = mine.map((m) => {
    const b = baseById.get(m.id);
    const t = theirsById.get(m.id);
    // A workout added in the editor, or removed elsewhere meanwhile: the editor decides.
    if (!b || !t) return m;
    if (same(t, b)) return m; // not changed elsewhere
    if (same(m, b)) return t; // changed only elsewhere
    const name = m.name !== b.name ? m.name : t.name;
    // Exercises changed only elsewhere (the editor renamed the workout): theirs.
    if (same(m.exercises, b.exercises)) return { ...t, name };
    if (same(t.exercises, b.exercises)) return { ...m, name };
    const exercises = mergeExercises(b.exercises, m.exercises, t.exercises, log.filter((x) => x.dayId === m.id));
    return { ...m, name, exercises: exercises.length ? exercises : m.exercises };
  });
  // Workouts added elsewhere after the editor was opened stay.
  for (const t of theirs) if (!baseById.has(t.id) && !out.some((d) => d.id === t.id)) out.push(t);
  return out;
}
