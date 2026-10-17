import { catalog } from './catalog';
import { ROLES, roleOf } from './templates';

/**
 * Restrictions of a client (the trainer ticks them in the client card): exercises that do not suit are left out
 * of what the app picks — «По объёму», templates, «Обновить упражнения», the workout of a muscle group — and are
 * marked in the exercise lists. The trainer can still add any exercise by hand.
 */
export interface Restriction {
  id: string;
  label: string;
  note: string;
  /** Kinds of exercise that do not suit (src/templates.ts ROLES). */
  roles: string[];
  /** Single exercises that do not suit. */
  ids: string[];
  /** What a kind that does not suit is replaced with, in order of choice. */
  instead: Record<string, string[]>;
  /** Kinds that may come twice in one workout: with the presses gone, two flies carry the chest. */
  twice: string[];
}
export const RESTRICTIONS: Restriction[] = [
  {
    id: 'elbow',
    label: 'Локоть: движение ограничено',
    note:
      'Контрактура локтя: без жимов и тяг. Подбираются движения с зафиксированным полусогнутым локтем — пуловеры, сведения, махи, ' +
      'разведения; бицепс и трицепс — в доступной амплитуде, удобно одной рукой.',
    roles: ['chestPress', 'inclinePress', 'dip', 'shoulderPress', 'verticalPull', 'row'],
    // Elbow travel past the range: the face pull is a row to the face, the triceps machines are presses,
    // the front squat needs the elbows bent far for the rack, hanging needs the arms straight.
    ids: ['face-pull', 'stack-triceps-press', 'plate-triceps', 'front-squat', 'hanging-leg-raise'],
    instead: {
      chestPress: ['fly'],
      inclinePress: ['fly'],
      dip: ['fly'],
      shoulderPress: ['lateralRaise'],
      verticalPull: ['pullover'],
      row: ['rearDelt', 'pullover', 'shrug'],
      rearDelt: ['rearDelt'],
      pushdown: ['pushdown', 'overheadTriceps'],
      squat: ['squat'],
      abs: ['abs'],
    },
    twice: ['fly', 'pullover', 'rearDelt', 'pushdown', 'overheadTriceps'],
  },
];
/** Kinds that may come twice in one workout for these restrictions. */
export const twiceFor = (ids: string[] = []) => new Set(restrictionsOf(ids).flatMap((r) => r.twice));
export const restrictionsOf = (ids: string[] = []) => RESTRICTIONS.filter((r) => ids.includes(r.id));
export const cleanRestrictions = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.map(String))].filter((id) => RESTRICTIONS.some((r) => r.id === id)) : [];

/** The restriction an exercise does not suit, if any. */
export function unsuitable(exerciseId: string, ids: string[] = []): Restriction | undefined {
  const role = roleOf(exerciseId) || (exerciseId === 'deadlift' ? 'hinge' : exerciseId);
  return restrictionsOf(ids).find((r) => r.roles.includes(role) || r.ids.includes(exerciseId));
}
export const suits = (exerciseId: string, ids: string[] = []) => !unsuitable(exerciseId, ids);

/**
 * A replacement the trainer made «насовсем» in the gym, remembered for the client: whatever the app picks for her
 * later («По объёму», templates, «Обновить упражнения», the workout of a muscle group) has `to` instead of `from`.
 */
export interface Swap {
  from: string;
  to: string;
  fromName: string;
  toName: string;
}
export const MAX_SWAPS = 40;
const swapId = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 120) : '');
export function cleanSwaps(v: unknown): Swap[] {
  if (!Array.isArray(v)) return [];
  const out: Swap[] = [];
  for (const x of v.slice(0, 100)) {
    const from = swapId(x?.from);
    const to = swapId(x?.to);
    if (!from || !to || from === to || out.some((s) => s.from === from)) continue;
    out.push({ from, to, fromName: String(x?.fromName || '').slice(0, 120), toName: String(x?.toName || '').slice(0, 120) });
    if (out.length >= MAX_SWAPS) break;
  }
  return out;
}
/**
 * The list with a new replacement on top: an earlier one of the same exercise gives way, the chosen exercise is wanted
 * again (a replacement away from it goes), and chains follow (A → X, then X → Y: A → Y).
 */
export function withSwap(list: Swap[] = [], s: Swap): Swap[] {
  const rest = list
    .filter((x) => x.from !== s.from && x.from !== s.to)
    .map((x) => (x.to === s.from ? { ...x, to: s.to, toName: s.toName } : x))
    .filter((x) => x.from !== x.to);
  return [s, ...rest].slice(0, MAX_SWAPS);
}

/**
 * The exercises of a workout as they suit the client. One the trainer replaced for good is put back as that
 * replacement; one that does not suit a restriction is replaced by one of the kinds listed for it. Sets, reps and RIR
 * are kept, the workout's other exercises are not repeated; with nothing to put in its place an exercise is left out.
 */
export function adaptExercises<T extends { exerciseId: string; exerciseName: string; muscles?: string[] }>(
  list: T[],
  ids: string[] = [],
  swaps: Swap[] = [],
): T[] {
  if (!restrictionsOf(ids).length && !swaps.length) return list;
  const used = new Set(list.map((e) => e.exerciseId));
  const away = new Set(swaps.map((s) => s.from));
  const out: T[] = [];
  for (const e of list) {
    const swap = swaps.find((s) => s.from === e.exerciseId);
    if (swap) {
      // The trainer's choice, whatever the restrictions say; already in the workout — this one goes.
      if (used.has(swap.to)) continue;
      used.add(swap.to);
      const { muscles: _own, ...rest } = e;
      out.push({ ...rest, exerciseId: swap.to, exerciseName: catalog.find((c) => c.id === swap.to)?.name || swap.toName || swap.to } as T);
      continue;
    }
    const r = unsuitable(e.exerciseId, ids);
    if (!r) {
      out.push(e);
      continue;
    }
    const role = roleOf(e.exerciseId) || e.exerciseId;
    const kinds = r.instead[role] || [];
    const pick = kinds
      .flatMap((k) => ROLES[k] || [])
      .find((id) => !used.has(id) && !away.has(id) && suits(id, ids) && catalog.some((c) => c.id === id));
    if (!pick) continue;
    used.add(pick);
    const { muscles: _own, ...rest } = e;
    out.push({ ...rest, exerciseId: pick, exerciseName: catalog.find((c) => c.id === pick)!.name } as T);
  }
  return out;
}
