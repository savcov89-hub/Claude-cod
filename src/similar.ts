// Replacements for an exercise, the closest first: what the trainer picks when a machine is busy or a movement does
// not suit today. The same movement role (src/templates.ts ROLES) comes first, in its usual order; then exercises
// that load the same muscle parts (src/volume.ts). With a client restriction, the kinds that stand in for a role that
// does not suit (src/restrictions.ts `instead`: flies for presses with the elbow) count as close too.
import { roleOf } from './templates';
import { exerciseLoad, type Load } from './volume';
import { groupMuscles } from './trainingRules';
import { restrictionsOf, suits } from './restrictions';

export interface SimilarCandidate {
  id: string;
  muscleGroup?: string;
  /** Own exercises: their muscles (built-in ones are known by id). */
  muscles?: string[];
}

const loadOf = (e: SimilarCandidate): Load => exerciseLoad(e.id, e.muscles?.length ? e.muscles : groupMuscles(e.muscleGroup));

function cosine(a: Load, b: Load) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [k, v] of Object.entries(a)) {
    na += v * v;
    if (b[k]) dot += v * b[k];
  }
  for (const v of Object.values(b)) nb += v * v;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** How well `b` stands in for `a`: the muscles they share (0…1), +2 for the same movement, +1.5 for a stand-in kind. */
export function closeness(a: SimilarCandidate, b: SimilarCandidate, restrictions: string[] = []) {
  const ra = roleOf(a.id);
  const rb = roleOf(b.id);
  let score = cosine(loadOf(a), loadOf(b));
  if (ra && ra === rb) score += 2;
  else if (ra && rb && restrictionsOf(restrictions).some((r) => r.instead[ra]?.includes(rb))) score += 1.5;
  return score;
}

/** Below this, an exercise of another movement is not offered as a close one (e.g. a press for a lateral raise). */
const CLOSE = 0.75;
export const SIMILAR_LIMIT = 6;

/**
 * The closest replacements for `target` among `list` (what may be picked), best first. `recent` — what was picked
 * for this exercise before, newest first — goes on top. Exercises that do not suit the client's restrictions are
 * left out unless picked before.
 */
export function similarExercises<T extends SimilarCandidate>(
  target: SimilarCandidate,
  list: T[],
  opts: { restrictions?: string[]; recent?: string[]; limit?: number } = {},
): T[] {
  const { restrictions = [], recent = [], limit = SIMILAR_LIMIT } = opts;
  const pool = list.filter((e) => e.id !== target.id);
  const first = recent.map((id) => pool.find((e) => e.id === id)).filter((e): e is T => !!e);
  const scored = pool
    .filter((e) => !first.includes(e) && suits(e.id, restrictions))
    .map((e, i) => ({ e, i, s: closeness(target, e, restrictions) }))
    .filter((x) => x.s >= CLOSE)
    // Equal scores keep the order of the list (the base lists the usual choice first).
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.e);
  return [...first, ...scored].slice(0, limit);
}

/** What was picked to replace an exercise (on this phone), newest first: a busy machine is often busy again. */
export function withRecent(store: Record<string, string[]>, from: string, to: string, keep = 3, maxKeys = 80) {
  const next: Record<string, string[]> = { [from]: [to, ...(store[from] || []).filter((x) => x !== to)].slice(0, keep) };
  for (const [k, v] of Object.entries(store)) {
    if (k === from || Object.keys(next).length >= maxKeys) continue;
    next[k] = v;
  }
  return next;
}
