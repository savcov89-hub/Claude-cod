// Property check of the three-way merge (src/draftMerge.ts): random edits by two phones from the same version.
//   npx tsx scripts/check-merge.ts [iterations]
import { doneDiffers, fitPlan, mergeEntries, mergeText, slotKey } from '../src/draftMerge';
import type { SessionExercise, SetEntry } from '../src/types';

const N = Number(process.argv[2] || 20000);
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const int = (n: number) => Math.floor(rnd() * n);
const chance = (p: number) => rnd() < p;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const POOL = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'x1', 'x2', 'x3', 'x4', 's1', 's2', 's3'];
const set = (done: boolean): SetEntry => ({ weight: 10 * (1 + int(8)), reps: done ? 6 + int(10) : 0, rir: chance(0.3) ? int(4) : null });
const eqSet = (a?: SetEntry, b?: SetEntry) => !!a && !!b && a.weight === b.weight && a.reps === b.reps && (a.rir ?? null) === (b.rir ?? null);

function makeBase() {
  const n = 2 + int(5);
  const plan = POOL.slice(0, 8)
    .sort(() => rnd() - 0.5)
    .slice(0, n)
    .map((id) => ({ exerciseId: id, exerciseName: 'Упр ' + id, sets: 2 + int(3) }));
  const entries: SessionExercise[] = plan.map((p) => ({
    exerciseId: p.exerciseId,
    exerciseName: p.exerciseName,
    sets: Array.from({ length: p.sets }, () => set(chance(0.4))),
  }));
  if (chance(0.3)) entries.push({ exerciseId: 'x1', exerciseName: 'Доп x1', extra: { repMin: 8, repMax: 12, targetRir: 2 }, sets: [set(true)] });
  return { plan, entries };
}

/** One phone's random edits; returns what it did to each set (for the checks). */
function edit(list: SessionExercise[], plan: { exerciseId: string }[]) {
  const out = clone(list);
  const ops = 1 + int(6);
  for (let o = 0; o < ops; o++) {
    const k = int(11);
    const e = out[int(out.length)];
    if (!e) continue;
    if (k <= 3) {
      // tick / change a set
      const i = int(e.sets.length);
      e.sets[i] = chance(0.5) ? set(true) : { ...e.sets[i], weight: e.sets[i].weight + 2.5 };
    } else if (k === 4) {
      const i = int(e.sets.length);
      e.sets[i] = { ...e.sets[i], reps: 0, rir: null };
    } else if (k === 5 && e.sets.length < 10) e.sets.push(set(chance(0.5)));
    else if (k === 6 && e.sets.length > 1 && e.sets.at(-1)!.reps === 0) e.sets.pop();
    else if (k === 7) {
      const id = ['x2', 'x3', 'x4'][int(3)];
      if (!out.some((x) => x.exerciseId === id)) out.push({ exerciseId: id, exerciseName: 'Доп ' + id, extra: { repMin: 10, repMax: 15, targetRir: 1 }, sets: [set(chance(0.7))] });
    } else if (k === 8) {
      const i = out.findIndex((x) => x.extra);
      if (i >= 0) out.splice(i, 1);
    } else if (k === 9 && !e.extra) {
      // swap for today / back
      const slot = slotKey(e);
      const to = ['s1', 's2', 's3'][int(3)];
      if (e.replaces) Object.assign(e, { exerciseId: slot, exerciseName: 'Упр ' + slot, replaces: undefined });
      else if (!out.some((x) => x.exerciseId === to)) Object.assign(e, { exerciseId: to, exerciseName: 'Замена ' + to, replaces: slot });
      if (!e.replaces) delete e.replaces;
    } else if (k === 10) {
      if (chance(0.5)) e.skipped = !e.skipped || undefined;
      else e.note = chance(0.5) ? 'заметка ' + int(5) : undefined;
      if (!e.skipped) delete e.skipped;
      if (!e.note) delete e.note;
    }
    if (chance(0.15) && out.length > 1) {
      const i = int(out.length - 1);
      [out[i], out[i + 1]] = [out[i + 1], out[i]];
    }
  }
  void plan;
  return out;
}

const fails: string[] = [];
const fail = (msg: string, ctx: unknown) => {
  if (fails.length < 6) fails.push(msg + '\n' + JSON.stringify(ctx).slice(0, 1500));
};
const canon = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canon)
    : v && typeof v === 'object'
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canon(x)]))
      : v;
const key = (list: SessionExercise[]) => JSON.stringify(canon(list));

for (let it = 0; it < N; it++) {
  const { plan, entries: base } = makeBase();
  const local = edit(base, plan);
  const remote = edit(base, plan);
  const merged = mergeEntries(base, local, remote);

  // Nothing changed on one side: the other side's version as it is.
  if (key(mergeEntries(base, local, clone(base))) !== key(local)) fail('remote unchanged → local', { base, local, got: mergeEntries(base, local, clone(base)) });
  if (key(mergeEntries(base, clone(base), remote)) !== key(remote)) fail('local unchanged → remote', { base, remote, got: mergeEntries(base, clone(base), remote) });
  if (key(mergeEntries(base, local, clone(local))) !== key(local)) fail('same on both → that', { base, local });

  // One entry per exercise and per slot.
  const ids = merged.map((e) => e.exerciseId);
  if (new Set(ids).size !== ids.length) fail('duplicate exercise', { base, local, remote, merged });
  const slots = merged.map(slotKey);
  if (new Set(slots).size !== slots.length) fail('duplicate slot', { base, local, remote, merged });

  // Every planned slot is still there and the result fits the plan as it is.
  if (key(fitPlan(plan, merged)) !== key(merged)) fail('merge broke the plan', { plan, base, local, remote, merged, fitted: fitPlan(plan, merged) });

  // A set changed on one side only keeps that change; changed on both — a done one survives.
  const bm = new Map(base.map((e) => [slotKey(e), e]));
  const lm = new Map(local.map((e) => [slotKey(e), e]));
  const rm = new Map(remote.map((e) => [slotKey(e), e]));
  const mm = new Map(merged.map((e) => [slotKey(e), e]));
  for (const [k, l] of lm) {
    const b = bm.get(k);
    const r = rm.get(k);
    const m = mm.get(k);
    if (!b || !r) continue;
    if (!m) {
      fail('entry on both sides lost', { k, base, local, remote, merged });
      continue;
    }
    // Sets are dropped at the end only, so a set added on one side may move up when the other side dropped one.
    const shifted = m.sets.length < Math.max(l.sets.length, r.sets.length);
    const has = (x: SetEntry, i: number) => (shifted ? m.sets.some((y) => eqSet(x, y)) : eqSet(m.sets[i], x));
    for (let i = 0; i < Math.max(l.sets.length, r.sets.length); i++) {
      const lc = !eqSet(l.sets[i], b.sets[i]);
      const rc = !eqSet(r.sets[i], b.sets[i]);
      const lDone = (l.sets[i]?.reps || 0) > 0;
      const rDone = (r.sets[i]?.reps || 0) > 0;
      if (lc && !rc && l.sets[i] && !has(l.sets[i], i)) fail('local set change lost', { k, i, b: b.sets[i], l: l.sets[i], r: r.sets[i], m: m.sets });
      if (rc && !lc && r.sets[i] && !has(r.sets[i], i)) fail('remote set change lost', { k, i, b: b.sets[i], l: l.sets[i], r: r.sets[i], m: m.sets });
      const keptDone = shifted
        ? [l.sets[i], r.sets[i]].some((x) => x && x.reps > 0 && m.sets.some((y) => eqSet(x, y)))
        : (m.sets[i]?.reps || 0) > 0;
      if (lc && rc && (lDone || rDone) && !keptDone) fail('done set lost in a conflict', { k, i, b: b.sets[i], l: l.sets[i], r: r.sets[i], m: m.sets });
    }
  }
  // An exercise added on one side is there.
  for (const list of [local, remote])
    for (const e of list)
      if (!bm.has(slotKey(e)) && !mm.has(slotKey(e)) && !merged.some((x) => x.exerciseId === e.exerciseId)) fail('added exercise lost', { e, base, local, remote, merged });

  // Without the base nothing done is lost.
  const blind = mergeEntries(null, local, remote);
  for (const list of [local, remote])
    for (const e of list) {
      const m = blind.find((x) => slotKey(x) === slotKey(e)) || blind.find((x) => x.exerciseId === e.exerciseId);
      const doneHere = e.sets.filter((s) => s.reps > 0).length;
      if (doneHere && (!m || m.sets.filter((s) => s.reps > 0).length < Math.min(doneHere, 1))) fail('blind merge lost done sets', { e, local, remote, blind });
    }
}

// Fixed cases worth naming.
{
  const base: SessionExercise[] = [{ exerciseId: 'a', exerciseName: 'A', sets: [{ weight: 50, reps: 0, rir: null }, { weight: 50, reps: 0, rir: null }] }];
  const trainer = clone(base);
  trainer[0].sets[0] = { weight: 50, reps: 10, rir: null };
  const client = clone(base);
  client[0].sets[1] = { weight: 50, reps: 9, rir: 1 };
  const m = mergeEntries(base, client, trainer);
  if (m[0].sets[0].reps !== 10 || m[0].sets[1].reps !== 9) fail('two phones, two sets', m);
  if (doneDiffers(m, m)) fail('doneDiffers same', m);
  if (!doneDiffers(m, base)) fail('doneDiffers differs', m);
  if (mergeText('', 'тяжело', '') !== 'тяжело' || mergeText('a', 'a', 'b') !== 'b' || mergeText(null, 'x', 'y') !== 'x') fail('mergeText', null);
}

console.log(`merge checks: ${N} random pairs of edits, ${fails.length ? 'FAILED' : 'all good'}`);
for (const f of fails) console.log('\n' + f);
process.exit(fails.length ? 1 : 0);
