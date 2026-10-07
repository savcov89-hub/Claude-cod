import { catalog } from './catalog';
import { programIssue } from './trainingRules';

// A slot is a movement role. Alternatives keep the role when "Другой вариант" is pressed.
interface Slot {
  ids: string[];
  sets: number;
  repMin: number;
  repMax: number;
  rir: number;
}
/** Sets of every exercise of a new program, unless a slot asks for more (the trainer's rule: 3 by default). */
export const DEFAULT_SETS = 3;
const s = (ids: string, sets: number, reps: string, rir: number): Slot => {
  const [repMin, repMax] = reps.split('-').map(Number);
  return { ids: ids.split('|'), sets: Math.max(sets, DEFAULT_SETS), repMin, repMax, rir };
};

const plans: Record<string, { name: string; slots: Slot[] }> = {
  // --- Всё тело 3× ---
  fbA: {
    name: 'Всё тело A',
    slots: [
      s('leg-press|hack-squat', 3, '8-12', 2),
      s('incline-dumbbell-press|machine-chest-press', 3, '8-12', 2),
      s('lat-pulldown|assisted-pull-up', 3, '8-12', 2),
      s('seated-leg-curl', 2, '10-15', 1),
      s('lateral-raise|cable-lateral-raise', 2, '12-20', 1),
      s('overhead-triceps', 2, '10-15', 1),
    ],
  },
  fbB: {
    name: 'Всё тело B',
    slots: [
      s('rdl', 3, '8-10', 2),
      s('bench-press|smith-incline-press', 3, '6-10', 2),
      s('chest-supported-row|t-bar-row', 3, '8-12', 2),
      s('leg-extension', 2, '12-15', 1),
      s('incline-curl|bayesian-curl', 2, '10-15', 1),
      s('standing-calf-raise', 2, '10-15', 1),
    ],
  },
  fbC: {
    name: 'Всё тело C',
    slots: [
      s('bulgarian-split-squat|reverse-lunge', 3, '8-12', 2),
      s('machine-shoulder-press|dumbbell-shoulder-press', 3, '8-12', 2),
      s('seated-row|one-arm-row', 3, '8-12', 2),
      s('pec-deck|cable-fly', 2, '12-15', 1),
      s('lying-leg-curl|seated-leg-curl', 2, '10-15', 1),
      s('face-pull|reverse-pec-deck', 2, '12-20', 1),
    ],
  },
  // --- Всё тело 2× ---
  fb2A: {
    name: 'Всё тело A',
    slots: [
      s('leg-press|hack-squat', 3, '8-12', 2),
      s('bench-press|machine-chest-press', 3, '6-10', 2),
      s('lat-pulldown|assisted-pull-up', 3, '8-12', 2),
      s('seated-leg-curl', 3, '10-15', 1),
      s('lateral-raise|cable-lateral-raise', 2, '12-20', 1),
      s('incline-curl|cable-curl', 2, '10-15', 1),
    ],
  },
  fb2B: {
    name: 'Всё тело B',
    slots: [
      s('rdl', 3, '8-10', 2),
      s('incline-dumbbell-press|smith-incline-press', 3, '8-12', 2),
      s('chest-supported-row|t-bar-row', 3, '8-12', 2),
      s('leg-extension', 2, '12-15', 1),
      s('overhead-triceps|triceps-pushdown', 2, '10-15', 1),
      s('standing-calf-raise', 2, '10-15', 1),
    ],
  },
  // --- Верх / низ 4× ---
  upA: {
    name: 'Верх A',
    slots: [
      s('bench-press|machine-chest-press', 3, '6-10', 2),
      s('chest-supported-row|t-bar-row', 3, '8-12', 2),
      s('lat-pulldown|assisted-pull-up', 2, '8-12', 2),
      s('cable-fly|pec-deck', 2, '12-15', 1),
      s('lateral-raise|cable-lateral-raise', 3, '12-20', 1),
      s('overhead-triceps', 2, '10-15', 1),
    ],
  },
  loA: {
    name: 'Низ A',
    slots: [
      s('hack-squat|pendulum-squat|back-squat', 3, '6-10', 2),
      s('rdl', 3, '8-10', 2),
      s('seated-leg-curl', 3, '10-15', 1),
      s('leg-extension', 2, '12-15', 1),
      s('standing-calf-raise', 3, '10-15', 1),
      s('hip-adduction', 2, '12-15', 1),
    ],
  },
  upB: {
    name: 'Верх B',
    slots: [
      s('incline-dumbbell-press|smith-incline-press', 3, '8-12', 2),
      s('pull-up|assisted-pull-up', 3, '6-10', 2),
      s('seated-row|one-arm-row', 3, '8-12', 2),
      s('machine-shoulder-press|dumbbell-shoulder-press', 2, '8-12', 2),
      s('incline-curl|bayesian-curl', 3, '10-15', 1),
      s('triceps-pushdown', 2, '10-15', 1),
    ],
  },
  loB: {
    name: 'Низ B',
    slots: [
      s('leg-press|smith-squat', 3, '10-15', 2),
      s('hip-thrust', 3, '8-12', 2),
      s('lying-leg-curl|seated-leg-curl', 3, '10-15', 1),
      s('bulgarian-split-squat|reverse-lunge', 2, '10-12', 2),
      s('seated-calf-raise|leg-press-calf', 3, '12-20', 1),
      s('back-extension', 2, '10-15', 2),
    ],
  },
  // --- Верх / низ + толкай / тяни / ноги 5× ---
  hUp: {
    name: 'Верх',
    slots: [
      s('bench-press|machine-chest-press', 3, '6-10', 2),
      s('chest-supported-row|t-bar-row', 3, '8-12', 2),
      s('lat-pulldown|assisted-pull-up', 2, '8-12', 2),
      s('lateral-raise|cable-lateral-raise', 2, '12-20', 1),
      s('incline-curl|cable-curl', 2, '10-15', 1),
      s('triceps-pushdown', 2, '10-15', 1),
    ],
  },
  hLo: {
    name: 'Низ',
    slots: [
      s('hack-squat|back-squat|pendulum-squat', 3, '6-10', 2),
      s('rdl', 3, '8-10', 2),
      s('seated-leg-curl', 3, '10-15', 1),
      s('leg-extension', 2, '12-15', 1),
      s('standing-calf-raise', 3, '10-15', 1),
    ],
  },
  hPush: {
    name: 'Толкай',
    slots: [
      s('incline-dumbbell-press|smith-incline-press', 3, '8-12', 2),
      s('machine-shoulder-press|dumbbell-shoulder-press', 2, '8-12', 2),
      s('pec-deck|cable-fly', 2, '12-15', 1),
      s('cable-lateral-raise|lateral-raise', 3, '12-20', 1),
      s('overhead-triceps', 3, '10-15', 1),
    ],
  },
  hPull: {
    name: 'Тяни',
    slots: [
      s('pull-up|assisted-pull-up|lat-pulldown', 3, '6-10', 2),
      s('t-bar-row|seated-row', 3, '8-12', 2),
      s('cable-pullover', 2, '12-15', 1),
      s('reverse-pec-deck|face-pull', 2, '12-20', 1),
      s('bayesian-curl|incline-curl', 3, '10-15', 1),
      s('hammer-curl', 2, '10-15', 1),
    ],
  },
  hLegs: {
    name: 'Ноги',
    slots: [
      s('leg-press|pendulum-squat', 3, '10-15', 2),
      s('hip-thrust', 2, '8-12', 2),
      s('lying-leg-curl', 3, '10-15', 1),
      s('bulgarian-split-squat', 2, '10-12', 2),
      s('seated-calf-raise', 3, '12-20', 1),
      s('hip-adduction', 2, '12-15', 1),
    ],
  },
  // --- Толкай / тяни / ноги ×2, 6× ---
  pushA: {
    name: 'Толкай A',
    slots: [
      s('bench-press|machine-chest-press', 3, '6-10', 2),
      s('machine-shoulder-press|dumbbell-shoulder-press', 2, '8-12', 2),
      s('cable-fly|pec-deck', 2, '12-15', 1),
      s('lateral-raise|cable-lateral-raise', 3, '12-20', 1),
      s('overhead-triceps', 2, '10-15', 1),
      s('triceps-pushdown', 2, '10-15', 1),
    ],
  },
  pullA: {
    name: 'Тяни A',
    slots: [
      s('lat-pulldown|assisted-pull-up', 3, '8-12', 2),
      s('chest-supported-row|t-bar-row', 3, '8-12', 2),
      s('cable-pullover', 2, '12-15', 1),
      s('face-pull|reverse-pec-deck', 2, '12-20', 1),
      s('incline-curl|bayesian-curl', 2, '10-15', 1),
      s('hammer-curl', 2, '10-15', 1),
    ],
  },
  legsA: {
    name: 'Ноги A',
    slots: [
      s('hack-squat|back-squat', 3, '6-10', 2),
      s('rdl', 3, '8-10', 2),
      s('leg-extension', 2, '12-15', 1),
      s('seated-leg-curl', 3, '10-15', 1),
      s('standing-calf-raise', 3, '10-15', 1),
    ],
  },
  pushB: {
    name: 'Толкай B',
    slots: [
      s('incline-dumbbell-press|smith-incline-press', 3, '8-12', 2),
      s('dips|machine-chest-press', 2, '8-12', 2),
      s('pec-deck|cable-fly', 2, '12-15', 1),
      s('cable-lateral-raise|machine-lateral-raise', 3, '12-20', 1),
      s('lying-triceps-extension|overhead-triceps', 2, '10-15', 1),
    ],
  },
  pullB: {
    name: 'Тяни B',
    slots: [
      s('pull-up|assisted-pull-up', 3, '6-10', 2),
      s('t-bar-row|seated-row', 3, '8-12', 2),
      s('one-arm-row', 2, '10-12', 2),
      s('reverse-pec-deck|face-pull', 2, '12-20', 1),
      s('bayesian-curl|cable-curl', 2, '10-15', 1),
      s('preacher-curl', 2, '10-15', 1),
    ],
  },
  legsB: {
    name: 'Ноги B',
    slots: [
      s('leg-press|pendulum-squat', 3, '10-15', 2),
      s('hip-thrust', 3, '8-12', 2),
      s('lying-leg-curl', 3, '10-15', 1),
      s('bulgarian-split-squat|reverse-lunge', 2, '10-12', 2),
      s('seated-calf-raise', 3, '12-20', 1),
      s('hip-adduction', 2, '12-15', 1),
    ],
  },
  // --- Акцент на ягодицы 4× ---
  gLoA: {
    name: 'Низ A · ягодицы',
    slots: [
      s('hip-thrust', 3, '8-12', 2),
      s('bulgarian-split-squat|reverse-lunge', 3, '8-12', 2),
      s('rdl', 3, '8-12', 2),
      s('hip-abduction', 3, '12-20', 1),
      s('seated-leg-curl', 2, '10-15', 1),
      s('cable-kickback', 2, '12-15', 1),
    ],
  },
  gUpA: {
    name: 'Верх A',
    slots: [
      s('lat-pulldown|assisted-pull-up', 3, '8-12', 2),
      s('incline-dumbbell-press|machine-chest-press', 3, '8-12', 2),
      s('seated-row|chest-supported-row', 2, '10-12', 2),
      s('lateral-raise|cable-lateral-raise', 3, '12-20', 1),
      s('triceps-pushdown', 2, '10-15', 1),
      s('cable-curl|incline-curl', 2, '10-15', 1),
    ],
  },
  gLoB: {
    name: 'Низ B · ягодицы',
    slots: [
      s('hack-squat|smith-squat|leg-press', 3, '8-12', 2),
      s('back-extension', 3, '10-15', 2),
      s('lying-leg-curl', 3, '10-15', 1),
      s('reverse-lunge|bulgarian-split-squat', 2, '10-12', 2),
      s('hip-abduction', 3, '12-20', 1),
      s('standing-calf-raise', 2, '10-15', 1),
    ],
  },
  gUpB: {
    name: 'Верх B',
    slots: [
      s('chest-supported-row|t-bar-row', 3, '8-12', 2),
      s('machine-shoulder-press|dumbbell-shoulder-press', 3, '8-12', 2),
      s('pec-deck|cable-fly', 2, '12-15', 1),
      s('cable-lateral-raise|lateral-raise', 2, '12-20', 1),
      s('face-pull|reverse-pec-deck', 2, '12-20', 1),
      s('overhead-triceps', 2, '10-15', 1),
    ],
  },
  // --- Классические сплиты (прежние шаблоны) ---
  pull: {
    name: 'Тяни',
    slots: [
      s('lat-pulldown', 3, '8-12', 2),
      s('chest-supported-row|seated-row', 3, '8-12', 2),
      s('cable-pullover', 2, '10-15', 1),
      s('incline-curl', 2, '8-12', 1),
      s('rear-delt-fly', 2, '10-15', 1),
      s('hammer-curl|barbell-curl', 2, '8-12', 1),
    ],
  },
  push: {
    name: 'Толкай',
    slots: [
      s('bench-press|machine-chest-press', 3, '8-12', 2),
      s('cable-fly', 2, '10-15', 1),
      s('dumbbell-shoulder-press', 2, '8-12', 2),
      s('lateral-raise', 3, '10-15', 1),
      s('overhead-triceps', 2, '8-12', 1),
      s('triceps-pushdown', 2, '8-12', 1),
    ],
  },
  legs: {
    name: 'Ноги',
    slots: [
      s('leg-press|hack-squat', 3, '8-12', 2),
      s('rdl', 3, '8-12', 2),
      s('seated-leg-curl', 2, '8-12', 1),
      s('leg-extension', 2, '8-12', 1),
      s('standing-calf-raise', 3, '10-15', 1),
      s('hip-abduction', 2, '10-15', 1),
    ],
  },
  glutesA: {
    name: 'Ягодицы A',
    slots: [
      s('reverse-lunge|bulgarian-split-squat', 3, '8-12', 2),
      s('hip-thrust', 3, '8-12', 2),
      s('hip-abduction', 3, '10-15', 1),
      s('seated-leg-curl', 2, '8-12', 1),
      s('leg-extension', 2, '8-12', 1),
      s('standing-calf-raise', 2, '10-15', 1),
    ],
  },
  upper: {
    name: 'Верх тела',
    slots: [
      s('incline-dumbbell-press|bench-press', 3, '8-12', 2),
      s('chest-supported-row|seated-row', 3, '8-12', 2),
      s('lat-pulldown', 2, '8-12', 2),
      s('lateral-raise', 3, '10-15', 1),
      s('overhead-triceps', 2, '8-12', 1),
      s('incline-curl|barbell-curl', 2, '8-12', 1),
    ],
  },
  glutesB: {
    name: 'Ягодицы B',
    slots: [
      s('rdl', 3, '8-12', 2),
      s('hip-thrust', 3, '8-12', 2),
      s('hip-abduction', 3, '10-15', 1),
      s('bulgarian-split-squat|reverse-lunge', 2, '8-12', 2),
      s('seated-leg-curl', 2, '8-12', 1),
      s('standing-calf-raise', 2, '10-15', 1),
    ],
  },
  chestTri: {
    name: 'Грудь · трицепс',
    slots: [
      s('incline-dumbbell-press', 3, '8-12', 2),
      s('machine-chest-press|bench-press', 3, '8-12', 2),
      s('cable-fly', 2, '10-15', 1),
      s('overhead-triceps', 2, '8-12', 1),
      s('triceps-pushdown', 2, '8-12', 1),
      s('lying-triceps-extension', 2, '8-12', 1),
    ],
  },
  backBi: {
    name: 'Спина · бицепс',
    slots: [
      s('lat-pulldown', 3, '8-12', 2),
      s('chest-supported-row|seated-row', 3, '8-12', 2),
      s('cable-pullover', 2, '10-15', 1),
      s('incline-curl', 2, '8-12', 1),
      s('hammer-curl', 2, '8-12', 1),
      s('preacher-curl', 2, '8-12', 1),
    ],
  },
  legsShoulders: {
    name: 'Ноги · плечи',
    slots: [
      s('leg-press|hack-squat', 3, '8-12', 2),
      s('rdl', 3, '8-12', 2),
      s('seated-leg-curl', 2, '8-12', 1),
      s('dumbbell-shoulder-press', 2, '8-12', 2),
      s('lateral-raise', 3, '10-15', 1),
      s('standing-calf-raise', 2, '10-15', 1),
    ],
  },
  chestBack: {
    name: 'Грудь · спина',
    slots: [
      s('incline-dumbbell-press', 3, '8-12', 2),
      s('lat-pulldown', 3, '8-12', 2),
      s('bench-press|machine-chest-press', 2, '8-12', 2),
      s('chest-supported-row|seated-row', 2, '8-12', 2),
      s('cable-fly', 2, '10-15', 1),
      s('cable-pullover', 2, '10-15', 1),
    ],
  },
  arms: {
    name: 'Руки',
    slots: [
      s('incline-curl', 3, '8-12', 1),
      s('overhead-triceps', 3, '8-12', 1),
      s('hammer-curl', 2, '8-12', 1),
      s('triceps-pushdown', 2, '8-12', 1),
      s('preacher-curl|barbell-curl', 2, '8-12', 1),
      s('lying-triceps-extension', 2, '8-12', 1),
    ],
  },
};

// Extra single workouts for the per-day focus picker.
Object.assign(plans, {
  shouldersArms: {
    name: 'Плечи · руки',
    slots: [
      s('machine-shoulder-press|dumbbell-shoulder-press', 3, '8-12', 2),
      s('lateral-raise|cable-lateral-raise', 3, '12-20', 1),
      s('reverse-pec-deck|face-pull', 2, '12-20', 1),
      s('incline-curl|bayesian-curl', 3, '10-15', 1),
      s('overhead-triceps|triceps-pushdown', 3, '10-15', 1),
      s('hammer-curl', 2, '10-15', 1),
    ],
  },
  glutesQuads: {
    name: 'Ягодицы · квадрицепс',
    slots: [
      s('hack-squat|pendulum-squat|leg-press', 3, '8-12', 2),
      s('hip-thrust|plate-hip-thrust', 3, '8-12', 2),
      s('reverse-lunge|bulgarian-split-squat', 2, '10-12', 2),
      s('leg-extension', 2, '12-15', 1),
      s('hip-abduction', 3, '12-20', 1),
      s('cable-kickback', 2, '12-15', 1),
    ],
  },
  glutesBack: {
    name: 'Ягодицы · спина',
    slots: [
      s('hip-thrust', 3, '8-12', 2),
      s('lat-pulldown|assisted-pull-up', 3, '8-12', 2),
      s('bulgarian-split-squat|reverse-lunge', 3, '8-12', 2),
      s('chest-supported-row|seated-row', 3, '8-12', 2),
      s('hip-abduction', 2, '12-20', 1),
      s('face-pull|reverse-pec-deck', 2, '12-20', 1),
    ],
  },
});

/**
 * Movement roles: the exercises of the base that do the same job in a workout (the same pattern and target muscles).
 * «Обновить упражнения» swaps each exercise for another of its role — the order (big movements first), sets,
 * rep ranges and RIR stay, so the logic of the workout is kept. The first of a list is the usual choice.
 */
export const ROLES: Record<string, string[]> = {
  // legs and glutes
  squat: ['leg-press', 'hack-squat', 'pendulum-squat', 'smith-squat', 'back-squat', 'stack-leg-press', 'plate-leg-press', 'plate-belt-squat', 'front-squat'],
  hinge: ['rdl', 'plate-deadlift'],
  hipExtension: ['back-extension', 'stack-back-extension'],
  bridge: ['hip-thrust', 'plate-hip-thrust'],
  singleLeg: ['bulgarian-split-squat', 'reverse-lunge', 'plate-lunge'],
  abduction: ['hip-abduction', 'stack-hip-abduction'],
  adduction: ['hip-adduction', 'stack-hip-adduction'],
  kickback: ['cable-kickback'],
  legCurl: ['seated-leg-curl', 'lying-leg-curl', 'stack-seated-leg-curl', 'stack-lying-leg-curl', 'plate-standing-leg-curl', 'leg-curl'],
  legExtension: ['leg-extension', 'stack-leg-extension', 'plate-leg-extension'],
  calves: ['standing-calf-raise', 'seated-calf-raise', 'leg-press-calf', 'calf-raise'],
  // chest and shoulders
  chestPress: ['bench-press', 'machine-chest-press', 'stack-chest-press', 'plate-chest-press'],
  dip: ['dips', 'stack-assisted-dip'],
  inclinePress: ['incline-dumbbell-press', 'smith-incline-press', 'plate-incline-press'],
  fly: ['pec-deck', 'cable-fly', 'stack-pec-fly'],
  shoulderPress: ['machine-shoulder-press', 'dumbbell-shoulder-press', 'overhead-press', 'stack-shoulder-press', 'plate-shoulder-press'],
  lateralRaise: ['lateral-raise', 'cable-lateral-raise', 'machine-lateral-raise', 'stack-lateral-raise'],
  rearDelt: ['reverse-pec-deck', 'face-pull', 'rear-delt-fly', 'stack-rear-delt'],
  // back
  verticalPull: ['lat-pulldown', 'assisted-pull-up', 'pull-up', 'stack-lat-pulldown', 'plate-lat-pulldown'],
  row: ['chest-supported-row', 't-bar-row', 'seated-row', 'one-arm-row', 'barbell-row', 'stack-seated-row', 'plate-seated-row', 'plate-low-row', 'plate-dorian-row'],
  pullover: ['cable-pullover'],
  shrug: ['plate-shrug'],
  // arms
  curl: ['incline-curl', 'bayesian-curl', 'cable-curl', 'dumbbell-curl', 'barbell-curl', 'preacher-curl', 'stack-biceps-curl'],
  hammerCurl: ['hammer-curl'],
  overheadTriceps: ['overhead-triceps', 'lying-triceps-extension'],
  pushdown: ['triceps-pushdown', 'stack-triceps-press', 'plate-triceps'],
  // abs
  abs: ['crunch', 'reverse-crunch', 'cable-crunch', 'hanging-leg-raise', 'stack-ab-crunch', 'plate-ab-crunch'],
};
const ROLE_OF: Record<string, string> = Object.fromEntries(Object.entries(ROLES).flatMap(([role, ids]) => ids.map((id) => [id, role])));
export const roleOf = (exerciseId: string): string | undefined => ROLE_OF[exerciseId];

/** A small seeded random (the same seed — the same choice), so a template variant is the same each time. */
function seeded(seed: number) {
  let x = (seed * 2654435761) >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

/**
 * The same workout with other exercises: each one with a known role becomes another of that role, not already in
 * this workout, preferably not in the program's other workouts (`elsewhere`). Order, sets, reps and RIR stay;
 * the trainer's own exercises (no role) stay as they are.
 */
export function refreshExercises<T extends { exerciseId: string; exerciseName: string; muscles?: string[] }>(
  list: T[],
  elsewhere: string[] = [],
  random: () => number = Math.random,
): T[] {
  const used = new Set(list.map((e) => e.exerciseId));
  const other = new Set(elsewhere);
  return list.map((e) => {
    const role = roleOf(e.exerciseId);
    if (!role) return e;
    const free = ROLES[role].filter((id) => !used.has(id) && catalog.some((c) => c.id === id));
    if (!free.length) return e;
    const fresh = free.filter((id) => !other.has(id));
    const pool = fresh.length ? fresh : free;
    const id = pool[Math.floor(random() * pool.length)];
    used.add(id);
    const { muscles: _own, ...rest } = e;
    return { ...rest, exerciseId: id, exerciseName: catalog.find((c) => c.id === id)!.name } as T;
  });
}

/** What one workout is for: picking it fills the day with fitting exercises. */
export const DAY_FOCUS: Array<{ key: string; label: string }> = [
  { key: 'glutesA', label: 'Ягодицы' },
  { key: 'glutesB', label: 'Ягодицы · задняя поверхность' },
  { key: 'glutesQuads', label: 'Ягодицы · квадрицепс' },
  { key: 'glutesBack', label: 'Ягодицы · спина' },
  { key: 'legs', label: 'Ноги' },
  { key: 'legsShoulders', label: 'Ноги · плечи' },
  { key: 'loA', label: 'Низ тела' },
  { key: 'chestBack', label: 'Грудь · спина' },
  { key: 'chestTri', label: 'Грудь · трицепс' },
  { key: 'backBi', label: 'Спина · бицепс' },
  { key: 'pushA', label: 'Грудь · плечи · трицепс' },
  { key: 'shouldersArms', label: 'Плечи · руки' },
  { key: 'arms', label: 'Руки' },
  { key: 'upper', label: 'Верх тела' },
  { key: 'fbA', label: 'Всё тело' },
];

/** Exercises for one workout of the given focus; `variant` picks the alternatives of each slot. */
export function focusDay(key: string, variant = 0) {
  const plan = plans[key];
  if (!plan) throw new Error('Нет такого варианта тренировки.');
  return plan.slots.map((slot) => {
    const id = slot.ids[variant % slot.ids.length];
    const e = catalog.find((c) => c.id === id);
    if (!e) throw new Error('Упражнение не найдено: ' + id);
    return { exerciseId: id, exerciseName: e.name, sets: slot.sets, repMin: slot.repMin, repMax: slot.repMax, targetRir: slot.rir };
  });
}

export interface Template {
  name: string;
  keys: string[];
  kind: 'Сплит' | 'Одна тренировка';
  group: 'Доказательный подход' | 'Классические' | 'Одна тренировка';
  perWeek: string;
  level: string;
  note: string;
}

export const templates: Template[] = [
  {
    name: 'Всё тело 3×',
    keys: ['fbA', 'fbB', 'fbC'],
    kind: 'Сплит',
    group: 'Доказательный подход',
    perWeek: '3 тр./нед',
    level: 'Новичок / средний',
    note: 'Каждая мышца 3 раза в неделю, 7–9 подходов на крупные группы. Лучший старт для новичка.',
  },
  {
    name: 'Всё тело 2×',
    keys: ['fb2A', 'fb2B'],
    kind: 'Сплит',
    group: 'Доказательный подход',
    perWeek: '2 тр./нед',
    level: 'Новичок, мало времени',
    note: 'Минимальный эффективный объём для клиента, который ходит дважды в неделю.',
  },
  {
    name: 'Верх / низ 4×',
    keys: ['upA', 'loA', 'upB', 'loB'],
    kind: 'Сплит',
    group: 'Доказательный подход',
    perWeek: '4 тр./нед',
    level: 'Средний',
    note: 'Частота 2 раза в неделю на каждую мышцу, 8–12 подходов в неделю. Основной вариант для большинства.',
  },
  {
    name: 'Верх / низ + толкай / тяни / ноги 5×',
    keys: ['hUp', 'hLo', 'hPush', 'hPull', 'hLegs'],
    kind: 'Сплит',
    group: 'Доказательный подход',
    perWeek: '5 тр./нед',
    level: 'Средний / продвинутый',
    note: 'Гибрид: силовые верх/низ в начале недели, объёмные толкай/тяни/ноги в конце.',
  },
  {
    name: 'Толкай / тяни / ноги ×2',
    keys: ['pushA', 'pullA', 'legsA', 'pushB', 'pullB', 'legsB'],
    kind: 'Сплит',
    group: 'Доказательный подход',
    perWeek: '6 тр./нед',
    level: 'Продвинутый',
    note: 'Частота 2 раза, 12–18 подходов в неделю. Для тех, кто стабильно ходит 6 раз.',
  },
  {
    name: 'Акцент на ягодицы 4×',
    keys: ['gLoA', 'gUpA', 'gLoB', 'gUpB'],
    kind: 'Сплит',
    group: 'Доказательный подход',
    perWeek: '4 тр./нед',
    level: 'Средний',
    note: 'Два дня низа с упором на ягодичные и отводящие, два дня верха с поддерживающим объёмом.',
  },
  {
    name: 'Тяни / толкай / ноги',
    keys: ['pull', 'push', 'legs'],
    kind: 'Сплит',
    group: 'Классические',
    perWeek: '3 тр./нед',
    level: 'Средний',
    note: 'Каждая мышца раз в неделю.',
  },
  {
    name: 'Ягодицы / верх / ягодицы',
    keys: ['glutesA', 'upper', 'glutesB'],
    kind: 'Сплит',
    group: 'Классические',
    perWeek: '3 тр./нед',
    level: 'Новичок / средний',
    note: 'Два дня низа, один день верха.',
  },
  {
    name: 'Грудь–трицепс / спина–бицепс / ноги–плечи',
    keys: ['chestTri', 'backBi', 'legsShoulders'],
    kind: 'Сплит',
    group: 'Классические',
    perWeek: '3 тр./нед',
    level: 'Средний',
    note: 'Классический сплит, каждая мышца раз в неделю.',
  },
  { name: 'Грудь · спина', keys: ['chestBack'], kind: 'Одна тренировка', group: 'Одна тренировка', perWeek: '1 тр.', level: '', note: '' },
  { name: 'Руки', keys: ['arms'], kind: 'Одна тренировка', group: 'Одна тренировка', perWeek: '1 тр.', level: '', note: '' },
  { name: 'Ноги', keys: ['legs'], kind: 'Одна тренировка', group: 'Одна тренировка', perWeek: '1 тр.', level: '', note: '' },
  { name: 'Ягодицы', keys: ['glutesA'], kind: 'Одна тренировка', group: 'Одна тренировка', perWeek: '1 тр.', level: '', note: '' },
];

const ABS = ['crunch', 'reverse-crunch', 'cable-crunch', 'hanging-leg-raise'];

export function templateDays(
  index: number,
  count: 5 | 6 = 6,
  variant = 0,
  withAbs = true,
) {
  const template = templates[index];
  if (!template) throw new Error('Выберите шаблон.');
  const days = template.keys.map((key, i) => {
    const plan = plans[key];
    const slots = plan.slots.slice(0, count);
    const rows = slots.map((slot) => ({
      id: slot.ids[variant % slot.ids.length],
      sets: slot.sets,
      repMin: slot.repMin,
      repMax: slot.repMax,
      rir: slot.rir,
    }));
    if (withAbs)
      rows.push({ id: ABS[(i + variant) % ABS.length], sets: DEFAULT_SETS, repMin: 10, repMax: 15, rir: 1 });
    const planned = rows.map((row) => {
      const e = catalog.find((c) => c.id === row.id);
      if (!e) throw new Error('Упражнение не найдено: ' + row.id);
      return {
        exerciseId: row.id,
        exerciseName: e.name,
        sets: row.sets,
        repMin: row.repMin,
        repMax: row.repMax,
        targetRir: row.rir,
      };
    });
    return { id: 'day-' + (i + 1), name: plan.name, exercises: planned };
  });
  // «Другой вариант»: the same structure with other exercises of the same roles, the days not repeating each other.
  if (variant > 0) {
    const random = seeded(variant * 7919 + index);
    for (let i = 0; i < days.length; i++) {
      const elsewhere = days.filter((_, j) => j !== i).flatMap((d) => d.exercises.map((e) => e.exerciseId));
      days[i] = { ...days[i], exercises: refreshExercises(days[i].exercises, elsewhere, random) };
    }
  }
  const issue = programIssue(days);
  if (issue) throw new Error(issue);
  return days;
}
