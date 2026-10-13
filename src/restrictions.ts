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
 * The exercises of a workout that suit: one that does not is replaced by one of the kinds listed for it (sets, reps
 * and RIR kept), not repeating the workout's other exercises; with nothing to put in its place it is left out.
 */
export function adaptExercises<T extends { exerciseId: string; exerciseName: string; muscles?: string[] }>(list: T[], ids: string[] = []): T[] {
  if (!restrictionsOf(ids).length) return list;
  const used = new Set(list.map((e) => e.exerciseId));
  const out: T[] = [];
  for (const e of list) {
    const r = unsuitable(e.exerciseId, ids);
    if (!r) {
      out.push(e);
      continue;
    }
    const role = roleOf(e.exerciseId) || e.exerciseId;
    const kinds = r.instead[role] || [];
    const pick = kinds.flatMap((k) => ROLES[k] || []).find((id) => !used.has(id) && suits(id, ids) && catalog.some((c) => c.id === id));
    if (!pick) continue;
    used.add(pick);
    const { muscles: _own, ...rest } = e;
    out.push({ ...rest, exerciseId: pick, exerciseName: catalog.find((c) => c.id === pick)!.name } as T);
  }
  return out;
}
