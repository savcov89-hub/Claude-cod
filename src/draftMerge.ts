// Three-way merge of a workout's entries, so the trainer and the client can record the same workout at once:
// what one phone changed since the version it started from is put on top of what the other phone saved.
// Used by the server (a save made from an older version is merged instead of refused) and by the journal
// (entries typed while its own save was on the way are kept on top of the merged answer).
import type { SessionExercise, SetEntry } from './types';

/** The program exercise an entry stands for (itself, or the one it replaces today). */
export const slotKey = (e: SessionExercise) => e.replaces || e.exerciseId;
const isDone = (s?: SetEntry) => !!s && s.reps > 0;
const sameSet = (a?: SetEntry, b?: SetEntry) =>
  !!a && !!b && a.weight === b.weight && a.reps === b.reps && (a.rir ?? null) === (b.rir ?? null);
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const identity = (e: SessionExercise) => ({ exerciseId: e.exerciseId, exerciseName: e.exerciseName, replaces: e.replaces });

/** A value changed on one side wins; changed on both (or nothing to compare with): the local one. */
function pick<T>(hasBase: boolean, base: T, local: T, remote: T, key: (v: T) => unknown = (v) => v): T {
  if (same(key(local), key(remote))) return local;
  if (hasBase && same(key(local), key(base))) return remote;
  return local;
}
const extraKey = (x?: SessionExercise['extra']) => (x ? [x.repMin, x.repMax, x.targetRir, !!x.once] : null);

function sameEntry(a: SessionExercise, b: SessionExercise) {
  return (
    same(identity(a), identity(b)) &&
    !!a.skipped === !!b.skipped &&
    same(extraKey(a.extra), extraKey(b.extra)) &&
    (a.note || '') === (b.note || '') &&
    a.sets.length === b.sets.length &&
    a.sets.every((s, i) => sameSet(s, b.sets[i]))
  );
}

/**
 * Sets by position (sets are added and removed at the end only). A set changed on one side takes that change;
 * changed on both, a done set beats a not-done one, otherwise this phone's wins.
 */
function mergeSets(base: SetEntry[] | null, local: SetEntry[], remote: SetEntry[]) {
  const out: SetEntry[] = [];
  for (let i = 0; i < Math.max(local.length, remote.length); i++) {
    const b = base?.[i];
    const l = local[i];
    const r = remote[i];
    if (l && r) {
      if (sameSet(l, r) || (b && sameSet(r, b))) out.push(l);
      else if (b && sameSet(l, b)) out.push(r);
      else out.push(isDone(r) && !isDone(l) ? r : l);
    } else if (l) {
      // Added here, or changed here while dropped there.
      if (!b || !sameSet(l, b)) out.push(l);
    } else if (r) {
      if (!b || !sameSet(r, b)) out.push(r);
    }
  }
  return out.slice(0, 10);
}

function mergeEntry(b: SessionExercise | undefined, l: SessionExercise | undefined, r: SessionExercise | undefined) {
  if (l && r) {
    // Untouched on one side: the other side's entry as it is.
    if (sameEntry(l, r) || (b && sameEntry(r, b))) return l;
    if (b && sameEntry(l, b)) return r;
    const has = !!b;
    const id = pick<ReturnType<typeof identity> | undefined>(has, b && identity(b), identity(l), identity(r)) || identity(l);
    const skipped = pick(has, !!b?.skipped, !!l.skipped, !!r.skipped);
    const extra = pick(has, b?.extra, l.extra, r.extra, extraKey);
    const note = pick(has, b?.note || '', l.note || '', r.note || '');
    const muscles = l.muscles || r.muscles;
    const entry: SessionExercise = {
      exerciseId: id.exerciseId,
      exerciseName: id.exerciseName,
      ...(id.replaces ? { replaces: id.replaces } : {}),
      ...(skipped ? { skipped: true } : {}),
      ...(extra ? { extra } : {}),
      ...(note ? { note } : {}),
      ...(muscles ? { muscles } : {}),
      sets: mergeSets(b ? b.sets : null, l.sets, r.sets),
    };
    return entry;
  }
  const only = l || r;
  if (!only) return null;
  // Added on one side — or dropped on the other: then it goes, unless it was changed meanwhile.
  return !b || !sameEntry(only, b) ? only : null;
}

/** Keeps one entry per exercise (e.g. swapped in on one phone and added on the other): the planned one, with done sets. */
function dedupe(list: SessionExercise[]) {
  const out: SessionExercise[] = [];
  for (const e of list) {
    const i = out.findIndex((x) => x.exerciseId === e.exerciseId);
    if (i < 0) {
      out.push(e);
      continue;
    }
    const keep = out[i].extra && !e.extra ? e : out[i];
    const drop = keep === e ? out[i] : e;
    out[i] = { ...keep, sets: keep.sets.some(isDone) || !drop.sets.some(isDone) ? keep.sets : drop.sets };
  }
  return out;
}

/**
 * Merges this phone's entries (`local`, made from `base`) with the entries saved meanwhile (`remote`).
 * Without `base` (not known) nothing done on either side is dropped.
 */
export function mergeEntries(base: SessionExercise[] | null | undefined, local: SessionExercise[], remote: SessionExercise[]) {
  const B = base || null;
  const byKey = (list: SessionExercise[] | null) => new Map((list || []).map((e) => [slotKey(e), e]));
  const bm = byKey(B);
  const lm = byKey(local);
  const rm = byKey(remote);
  const merged = new Map<string, SessionExercise>();
  for (const k of new Set([...lm.keys(), ...rm.keys()])) {
    const e = mergeEntry(bm.get(k), lm.get(k), rm.get(k));
    if (e) merged.set(k, e);
  }
  // Order: the side that moved exercises decides (this phone when both did); the other side's new ones
  // go after the exercise they followed there.
  const keysOf = (list: SessionExercise[]) => list.map(slotKey);
  const L = keysOf(local);
  const R = keysOf(remote);
  const Bk = B ? keysOf(B) : [];
  const common = (a: string[], b: string[]) => a.filter((k) => b.includes(k)).join('|');
  const localMoved = !!B && common(L, Bk) !== common(Bk, L);
  const primary = localMoved ? L : R;
  const secondary = localMoved ? R : L;
  const order = primary.filter((k) => merged.has(k));
  secondary.forEach((k, i) => {
    if (!merged.has(k) || order.includes(k)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const p = order.indexOf(secondary[j]);
      if (p >= 0) {
        at = p + 1;
        break;
      }
    }
    order.splice(at, 0, k);
  });
  return dedupe(order.map((k) => merged.get(k)!));
}

/** The workout's comment: changed on one side wins, on both — this phone's. */
export const mergeText = (base: string | null | undefined, local: string, remote: string) =>
  pick(base !== null && base !== undefined, base || '', local, remote);

/** True when the done sets differ (what a workout record keeps). */
export function doneDiffers(a: SessionExercise[], b: SessionExercise[]) {
  const done = (list: SessionExercise[]) =>
    list
      .map((e) => [e.exerciseId, e.note || '', e.sets.filter(isDone).map((s) => [s.weight, s.reps, s.rir ?? null])])
      .filter((x) => (x[2] as unknown[]).length || x[1]);
  return !same(done(a), done(b));
}

/**
 * Fits entries to the program day: every planned exercise once, in its slot. An exercise no longer planned keeps
 * its done sets as one added for this workout only; a planned one that is missing comes in empty.
 */
export function fitPlan(plan: Array<{ exerciseId: string; exerciseName: string; sets: number }>, entries: SessionExercise[]) {
  const slots = plan.map((p) => p.exerciseId);
  const out: SessionExercise[] = [];
  const placed = new Set<string>();
  const plannedSlots = new Set(entries.filter((e) => !e.extra).map(slotKey));
  for (const e of entries) {
    if (e.extra) {
      if (!slots.includes(e.exerciseId)) out.push(e);
      else if (!placed.has(e.exerciseId) && !plannedSlots.has(e.exerciseId)) {
        // Joined the program meanwhile: now a planned one.
        const { extra: _extra, ...planned } = e;
        out.push(planned);
        placed.add(e.exerciseId);
      }
      continue;
    }
    const slot = slotKey(e);
    if (slots.includes(slot) && !placed.has(slot)) {
      out.push(e);
      placed.add(slot);
      continue;
    }
    const done = e.sets.filter(isDone);
    if (!done.length || slots.includes(e.exerciseId) || out.some((x) => x.exerciseId === e.exerciseId)) continue;
    const reps = done.map((s) => Math.min(100, s.reps));
    out.push({
      exerciseId: e.exerciseId,
      exerciseName: e.exerciseName,
      extra: { repMin: Math.min(...reps), repMax: Math.max(...reps), targetRir: 2, once: true },
      ...(e.note ? { note: e.note } : {}),
      ...(e.muscles ? { muscles: e.muscles } : {}),
      sets: done,
    });
  }
  plan.forEach((p, i) => {
    if (placed.has(p.exerciseId)) return;
    // After the planned exercise that comes before it in the program.
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const k = out.findIndex((x) => !x.extra && slotKey(x) === slots[j]);
      if (k >= 0) {
        at = k + 1;
        break;
      }
    }
    out.splice(at, 0, {
      exerciseId: p.exerciseId,
      exerciseName: p.exerciseName,
      sets: Array.from({ length: Math.max(1, Math.min(10, p.sets)) }, () => ({ weight: 0, reps: 0, rir: null })),
    });
    placed.add(p.exerciseId);
  });
  return out;
}
