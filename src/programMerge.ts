// A program saved from the editor when it was changed meanwhile somewhere else (a replacement or new sets
// «насовсем» from the gym journal, another phone): what the editor did is put on top of the program as it is now,
// so a change made in the gym is not undone by an editor opened on the older version.
//   base   — the program days the editor started from
//   mine   — the days the editor sends
//   theirs — the days saved on the server meanwhile
import type { ProgramDay } from './types';

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
type Exercise = ProgramDay['exercises'][number];
const identityOf = (e: Exercise) => ({ exerciseId: e.exerciseId, exerciseName: e.exerciseName, ...(e.muscles ? { muscles: e.muscles } : {}) });
const targetsOf = (e: Exercise) => ({ sets: e.sets, repMin: e.repMin, repMax: e.repMax, targetRir: e.targetRir });

export function mergeProgramDays(base: ProgramDay[], mine: ProgramDay[], theirs: ProgramDay[]): ProgramDay[] {
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
    // Changed on both sides, the same number of exercises elsewhere (replaced, new sets or reps): which exercise it
    // is and its targets (sets, reps, RIR) are taken separately — a replacement in the gym and new sets in the
    // editor both stay; what both changed, the editor's.
    if (t.exercises.length === b.exercises.length) {
      const exercises = m.exercises.map((e, i) => {
        let at = b.exercises.findIndex((x) => x.exerciseId === e.exerciseId);
        // Replaced in the editor in its place: matched by the place.
        if (at < 0 && m.exercises.length === b.exercises.length && !m.exercises.some((x) => x.exerciseId === b.exercises[i].exerciseId)) at = i;
        if (at < 0) return e;
        const was = b.exercises[at];
        const other = t.exercises[at];
        const identity = same(identityOf(e), identityOf(was)) ? identityOf(other) : identityOf(e);
        const targets = same(targetsOf(e), targetsOf(was)) ? targetsOf(other) : targetsOf(e);
        // Never two of the same exercise in a workout.
        const id = identity.exerciseId !== e.exerciseId && m.exercises.some((x) => x.exerciseId === identity.exerciseId) ? identityOf(e) : identity;
        return { ...id, ...targets };
      });
      return { ...m, name, exercises };
    }
    // Exercises added or removed elsewhere while the editor only renamed the workout: theirs, with the new name.
    if (same(m.exercises, b.exercises)) return { ...t, name };
    // Both reshaped the same workout: the editor's version.
    return { ...m, name };
  });
  // Workouts added elsewhere after the editor was opened stay.
  for (const t of theirs) if (!baseById.has(t.id) && !out.some((d) => d.id === t.id)) out.push(t);
  return out;
}
