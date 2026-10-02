// Shoulders (side view): overhead presses, rear-delt flies, face pull. Lateral raises are in figure/front.tsx.
import { ANKLE_Y, FLOOR, G, add, at, feetAt, lever, onTrunk, seat, SEAT_HIP_Y, tower, type Move, type Pose, type V } from './kit';

/** Standing barbell overhead press: from the front of the shoulders to straight arms over the head. */
export const overheadPress: Move = (() => {
  const base = { anchor: { at: 'ankle' as const, to: [46, ANKLE_Y] as V }, trunk: 0, leg: { a: 0, b: 0, foot: 90 } };
  return {
    frames: [
      { ...base, head: -14, arm: { reach: { from: 'shoulder', to: [1.5, 4.4], bend: [0.6, 1], shorten: 0.86 } } },
      { ...base, head: 4, arm: { reach: { from: 'shoulder', to: [21.6, 1.2], bend: [0.6, 1], shorten: 0.92 } } },
    ],
    work: ['delts', 'triceps'],
    wideArms: true,
    standing: true,
    handGear: 6.5,
    balance: (j) => j.hand,
    gear: (j) => [
      { layer: 'back', node: G.floor() },
      { layer: 'back', node: G.plate(j.hand, 6.5) },
    ],
  };
})();

/**
 * Seated overhead press: dumbbells (`free`) or a machine (stack / plates) — from the hands at the ears to
 * straight arms over the head, the back on the rest.
 */
function seatedPress(kind: 'dumbbells' | 'stack' | 'plates'): Move {
  const hip: V = [42, SEAT_HIP_Y];
  const trunk = -6;
  const base = { anchor: { at: 'hip' as const, to: hip }, trunk, head: -2, leg: feetAt(hip[0] + 19) };
  const j0 = at({ ...base, arm: { a: 0 } } as Pose);
  const low: V = kind === 'dumbbells' ? [3.2, 1.6] : [2.6, 4.2];
  const high: V = kind === 'dumbbells' ? [21.5, 1] : [21, 4.8];
  const pivot: V = [j0.shoulder[0] - 12, j0.shoulder[1] - 4];
  return {
    frames: [
      { ...base, arm: { reach: { from: 'shoulder', to: low, bend: [0.2, 1], shorten: 0.6 } } },
      { ...base, arm: { reach: { from: 'shoulder', to: high, bend: [0.4, 1], shorten: 0.9 } } },
    ],
    work: ['delts', 'triceps'],
    wideArms: true,
    standing: true,
    handGear: kind === 'dumbbells' ? 3.3 : 2,
    show: kind === 'dumbbells' ? [] : [pivot, [hip[0] - 18, 30]],
    gear: (j) => [
      { layer: 'back', node: G.floor() },
      ...seat(hip, trunk, { rest: 30 }),
      ...(kind === 'dumbbells'
        ? [{ layer: 'front' as const, node: G.dumbbell(j.hand) }]
        : [
            ...(kind === 'stack' ? tower(hip[0] - 14, pivot[1] - 10, { stackX: hip[0] - 19 }) : [{ layer: 'back' as const, node: G.bar([hip[0] - 14, FLOOR], [hip[0] - 14, pivot[1]], 2.4) }]),
            { layer: 'back' as const, node: G.bar([hip[0] - 14, pivot[1]], pivot, 2.2) },
            ...lever(pivot, j.hand, kind === 'plates' ? { plate: 0.45, plateR: 5.6 } : {}),
            { layer: 'front' as const, node: G.bar(add(j.hand, [-1.6, 0]), add(j.hand, [1.6, 0]), 1.6) },
          ]),
    ],
  };
}
export const dumbbellShoulderPress = seatedPress('dumbbells');
export const machineShoulderPress = seatedPress('stack');
export const plateShoulderPress = seatedPress('plates');

/** Reverse pec deck: chest on the pad, arms from together in front to wide out and back. */
export const reverseFly: Move = (() => {
  const hip: V = [38, SEAT_HIP_Y];
  const trunk = 6;
  const base = { anchor: { at: 'hip' as const, to: hip }, trunk, head: -4, leg: feetAt(hip[0] + 16) };
  const j0 = at({ ...base, arm: { a: 0 } } as Pose);
  const pivot: V = [j0.shoulder[0] + 1, j0.shoulder[1] - 16];
  const padA = onTrunk(j0, 'shoulder', -3, 6.6);
  return {
    frames: [
      { ...base, arm: { reach: { from: 'shoulder', to: [-1.5, 21.6], bend: [0, 1], shorten: 0.94 } } },
      { ...base, arm: { reach: { from: 'shoulder', to: [-1, 9], bend: [0, 1], shorten: 0.7 } } },
      { ...base, arm: { reach: { from: 'shoulder', to: [0.2, 0.6], bend: [0, 1], shorten: 0.1 } } },
      { ...base, arm: { reach: { from: 'shoulder', to: [2, -12.5], bend: [0, 1], shorten: 0.62 } } },
    ],
    work: ['delts', 'upperBack'],
    wideArms: true,
    standing: true,
    show: [pivot, [j0.shoulder[0] + 24, FLOOR]],
    gear: (j) => [
      { layer: 'back', node: G.floor() },
      ...seat(hip, trunk, { front: 7 }),
      { layer: 'back', node: G.bar([j0.shoulder[0] + 18, FLOOR], [j0.shoulder[0] + 18, pivot[1] - 3], 2.4) },
      { layer: 'back', node: G.bar([j0.shoulder[0] + 18, pivot[1] - 3], [pivot[0], pivot[1] - 3], 2.4) },
      { layer: 'back', node: G.stack(j0.shoulder[0] + 23, 74, 6, 8) },
      { layer: 'mid', node: G.pad(add(padA, [2.6, -5]), add(padA, [2.6, 10]), 3) },
      { layer: 'back', node: G.bar([pivot[0], pivot[1] - 3], add(j.hand, [0, -2.2]), 1.8) },
      { layer: 'front', node: G.bar(add(j.hand, [0, -2.2]), add(j.hand, [0, 2.2]), 1.6) },
    ],
  };
})();

/** Face pull: standing, a rope from a high pulley; from long arms to the hands beside the face, elbows high. */
export const facePull: Move = (() => {
  const base = { anchor: { at: 'ankle' as const, to: [40, ANKLE_Y] as V }, trunk: -6, head: -4, leg: { a: 4, b: -4, foot: 90 } };
  const j0 = at({ ...base, arm: { a: 0 } } as Pose);
  const pulley: V = [j0.shoulder[0] + 34, j0.shoulder[1] - 6];
  return {
    frames: [
      // Elbows high and back.
      { ...base, arm: { reach: { from: 'shoulder', to: [3.5, 22.5], bend: [0.4, -1], bendTrunk: true, shorten: 0.97 } } },
      { ...base, arm: { reach: { from: 'shoulder', to: [6, 3], bend: [0.4, -1], bendTrunk: true, shorten: 0.8 } } },
    ],
    work: ['delts', 'upperBack'],
    wideArms: true,
    standing: true,
    show: [pulley, [pulley[0] + 4, FLOOR]],
    gear: (j) => [
      { layer: 'back', node: G.floor() },
      { layer: 'back', node: G.bar([pulley[0] + 3, FLOOR], [pulley[0] + 3, pulley[1] - 8], 2.4) },
      { layer: 'back', node: G.stack(pulley[0] + 8, 74, 6, 8) },
      { layer: 'back', node: G.wheel(pulley) },
      { layer: 'back', node: G.cable(pulley, j.hand) },
    ],
  };
})();
