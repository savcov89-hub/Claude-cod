// Back: pulldowns, rows, pull-ups, extensions, deadlifts. Checked against the photos in scripts/figure-refs.json.
import { ANKLE_Y, FLOOR, G, add, at, feetAt, lever, onTrunk, seat, SEAT_HIP_Y, trunkFrame, type Gear, type Joints, type Move, type Pose, type V } from './kit';

/** A wide-grip arm seen from the side: the hand at `hand`, the elbow at `elbow` (both from the shoulder, in the trunk's frame). */
const wideArm = (hand: V, elbow: V) => ({ reach: { from: 'shoulder' as const, to: hand, bend: [0, -1] as V, bendTrunk: true, elbow } });

/** Lat pulldown: a cable from the top pulley (`cable`), or a lever machine with a stack or plates. */
function pulldown(kind: 'cable' | 'stack' | 'plates'): Move {
  const base = { anchor: { at: 'hip' as const, to: [42, 71.2] as V }, head: -12, leg: { a: 90, b: 2, foot: 90 } };
  const pulley: V = [52, 7];
  const pivot: V = [30, 12];
  const machine = (j: Joints): Gear[] =>
    kind === 'cable'
      ? [
          { layer: 'back', node: G.bar([76, FLOOR], [76, 5], 2.4) },
          { layer: 'back', node: G.bar([76, 5], [pulley[0] - 2, 5], 2.4) },
          { layer: 'back', node: G.stack(82, 74, 7, 8) },
          { layer: 'back', node: G.bar([82, 72.5], [82, 12], 0.9) },
          { layer: 'back', node: G.cable(pulley, j.hand) },
          { layer: 'back', node: G.wheel(pulley) },
          { layer: 'back', node: G.cable([pulley[0], pulley[1] - 1.8], [82, pulley[1] - 1.8]) },
          { layer: 'front', node: G.bar([j.hand[0] - 0.2, j.hand[1] - 1.4], [j.hand[0] + 0.4, j.hand[1] + 1.4], 1.4) },
        ]
      : [
          { layer: 'back', node: G.bar([pivot[0] - 4, FLOOR], [pivot[0] - 4, pivot[1] - 3], 2.4) },
          { layer: 'back', node: G.bar([pivot[0] - 4, pivot[1] - 3], [76, pivot[1] - 3], 2.4) },
          { layer: 'back', node: G.bar([76, FLOOR], [76, pivot[1] - 3], 2.4) },
          ...(kind === 'stack' ? [{ layer: 'back' as const, node: G.stack(82, 74, 7, 8) }] : []),
          ...lever(pivot, j.hand, kind === 'plates' ? { plate: 0.35, plateR: 6 } : {}),
          { layer: 'front', node: G.bar(add(j.hand, [0, -1.6]), add(j.hand, [0, 1.6]), 1.6) },
        ];
  return {
    frames: [
      // Seen from the side the forearms stay nearly upright under the bar; the elbows go down along the sides of
      // the body to the ribs, a little behind (never forward to the face).
      { ...base, trunk: -8, arm: wideArm([22.5, 4.6], [11.9, 2.4]) },
      { ...base, trunk: -14, arm: wideArm([12, 6.5], [0.5, -1.5]) },
      { ...base, trunk: -20, arm: wideArm([-1, 5.5], [-10, -3.5]) },
    ],
    work: ['lats', 'upperBack', 'biceps'],
    wideArms: true,
    show: [[52, 4], [84, 60], pivot],
    gear: (j) => [
      { layer: 'back', node: G.floor() },
      ...machine(j),
      { layer: 'back', node: G.bar([42, 79], [42, FLOOR], 2) },
      { layer: 'back', node: G.bar([34, FLOOR], [50, FLOOR], 2.2) },
      { layer: 'back', node: G.pad([33, 75.8], [53, 75.8], 3) },
      { layer: 'back', node: G.bar([59, 64.2], [76, 64.2], 1.6) },
      { layer: 'front', node: G.roll([58.5, 64.2], 2.6) },
    ],
  };
}
export const latPulldown = pulldown('cable');
export const stackPulldown = pulldown('stack');
export const platePulldown = pulldown('plates');

/** Pull-ups: from a dead hang to the chin over the bar; `assisted` — kneeling on the pad of an assist machine. */
function pullUp(assisted: boolean): Move {
  const bar: V = [50, 9];
  const legs = assisted ? { a: 4, b: -86, foot: 30 } : { a: 18, b: -78, foot: 36 };
  return {
    frames: [
      { anchor: { at: 'hand', to: bar }, trunk: -6, head: -8, leg: legs, arm: wideArm([25, 1.5], [13.3, 0.8]) },
      { anchor: { at: 'hand', to: bar }, trunk: -10, head: -10, leg: legs, arm: wideArm([13, 4.5], [1, -1.5]) },
      { anchor: { at: 'hand', to: bar }, trunk: -14, head: -12, leg: legs, arm: wideArm([1.5, 6.5], [-9.5, -3]) },
    ],
    work: ['lats', 'upperBack', 'biceps'],
    wideArms: true,
    show: [[bar[0], FLOOR], [bar[0] + 14, 10]],
    gear: (j) => [
      { layer: 'back', node: G.floor() },
      { layer: 'back', node: G.bar([bar[0] + 13, FLOOR], [bar[0] + 13, bar[1] - 2], 2.4) },
      { layer: 'back', node: G.bar([bar[0] + 13, bar[1] - 2], [bar[0] - 1.5, bar[1] - 2], 2) },
      { layer: 'front', node: G.wheel(bar, 1.4) },
      ...(assisted
        ? [
            { layer: 'back' as const, node: G.pad(add(j.knee, [-9, 3.2]), add(j.knee, [2.5, 3.2]), 2.6) },
            { layer: 'back' as const, node: G.bar(add(j.knee, [-3, 5.8]), [bar[0] + 13, j.knee[1] + 5.8], 1.6) },
          ]
        : []),
    ],
  };
}
export const pullUpMove = pullUp(false);
export const assistedPullUp = pullUp(true);

/** Seated cable row: legs on the foot plate, from leaning forward with long arms to upright, handle to the belly. */
export const seatedRow: Move = (() => {
  const hip: V = [34, 73];
  const feet = { reach: { to: [61, 74] as V, bend: [0.3, -1] as V }, foot: 168 };
  // The cable comes out at the height of the navel (a little higher), so it pulls straight back to the belly.
  const pulley: V = [64, 61.5];
  return {
    frames: [
      { anchor: { at: 'hip', to: hip }, trunk: 22, head: -12, leg: feet, arm: { reach: { from: 'shoulder', to: [-6, 22.5], bend: [-1, 0], bendTrunk: true, shorten: 0.98 } } },
      { anchor: { at: 'hip', to: hip }, trunk: -10, head: -4, leg: feet, arm: { reach: { from: 'shoulder', to: [-14, 7], bend: [0.6, -1], bendTrunk: true } } },
    ],
    work: ['lats', 'upperBack', 'biceps'],
    show: [pulley, [hip[0] - 10, 80]],
    gear: (j) => [
      { layer: 'back', node: G.floor() },
      { layer: 'back', node: G.pad([hip[0] - 12, hip[1] + 4.6], [hip[0] + 14, hip[1] + 4.6], 3) },
      { layer: 'back', node: G.bar([hip[0] - 8, hip[1] + 7.5], [hip[0] - 8, FLOOR], 2) },
      { layer: 'back', node: G.bar([hip[0] + 10, hip[1] + 7.5], [hip[0] + 10, FLOOR], 2) },
      { layer: 'back', node: G.pad([61.5, 66], [61.5, 82], 2.6) },
      { layer: 'back', node: G.bar([66, FLOOR], [66, 50], 2.4) },
      { layer: 'back', node: G.wheel(pulley) },
      { layer: 'back', node: G.cable(pulley, j.hand) },
      { layer: 'front', node: G.bar(add(j.hand, [0, -1.6]), add(j.hand, [0, 1.6]), 1.6) },
    ],
  };
})();

/**
 * Seated machine row with the chest on a pad: from long arms forward to the elbows behind.
 * `low` — handles low (a low row), `plates` — a plate-loaded lever, otherwise a stack.
 */
function machineRow(o: { plates?: boolean; low?: boolean }): Move {
  const hip: V = [36, SEAT_HIP_Y];
  const trunk = o.low ? 8 : 2;
  const base = { anchor: { at: 'hip' as const, to: hip }, trunk, head: -4, leg: feetAt(hip[0] + 17) };
  const j0 = at({ ...base, arm: { a: 0 } } as Pose);
  const along = o.low ? -9 : -4;
  const far = onTrunk(j0, 'shoulder', along, 22);
  const near = onTrunk(j0, 'shoulder', along - 3, 5.5);
  const arm = (p: V, bend: V, shorten = 1) => ({ reach: { to: trunkFrame(j0, p), from: 'shoulder' as const, bend, shorten } });
  const pivot: V = o.plates ? [far[0] + 8, o.low ? FLOOR - 6 : j0.shoulder[1] - 14] : [far[0] + 6, j0.shoulder[1] - 12];
  const padAt = onTrunk(j0, 'shoulder', -6, 6.6);
  return {
    frames: [
      { ...base, arm: arm(far, [0, 1], 0.98) },
      { ...base, arm: arm(near, [-1, 0.3]) },
    ],
    work: ['lats', 'upperBack', 'biceps'],
    standing: true,
    show: [pivot, [far[0] + 14, FLOOR]],
    gear: (j) => [
      { layer: 'back', node: G.floor() },
      ...seat(hip, trunk, { front: 7 }),
      { layer: 'back', node: G.pad(add(padAt, [3.2, -6]), add(padAt, [3.2, 7]), 3) },
      { layer: 'back', node: G.bar(add(padAt, [4.5, 0]), [far[0] + 12, padAt[1]], 2) },
      { layer: 'back', node: G.bar([far[0] + 12, FLOOR], [far[0] + 12, pivot[1] - 2], 2.4) },
      ...(o.plates ? [] : [{ layer: 'back' as const, node: G.stack(far[0] + 17, 74, 6, 8) }]),
      ...lever(pivot, j.hand, o.plates ? { plate: 0.55, plateR: 6 } : {}),
      { layer: 'front', node: G.bar(add(j.hand, [0, -1.6]), add(j.hand, [0, 1.6]), 1.6) },
    ],
  };
}
export const stackSeatedRow = machineRow({});
export const plateSeatedRow = machineRow({ plates: true });
export const plateLowRow = machineRow({ plates: true, low: true });

/** Bent-over barbell row: bent forward, knees soft; the bar from hanging arms to the belly. */
export const barbellRow: Move = (() => {
  const base = { anchor: { at: 'ankle' as const, to: [44, ANKLE_Y] as V }, trunk: 49, head: -24, leg: { a: 43, b: -4, foot: 90 } };
  return {
    frames: [
      { ...base, arm: { a: -10, b: -10 } },
      { ...base, arm: { reach: { from: 'shoulder', to: [-13.5, 7.2], bend: [-0.6, -1], bendTrunk: true, shorten: 0.95 } } },
    ],
    work: ['lats', 'upperBack', 'biceps'],
    standing: true,
    handGear: 8.4,
    balance: (j) => j.hand,
    gear: (j) => [
      { layer: 'back', node: G.floor() },
      { layer: 'back', node: G.plate(j.hand) },
    ],
  };
})();

/** One-arm dumbbell row: knee and hand on the bench, the other foot on the floor; the near arm rows. */
export const oneArmRow: Move = (() => {
  const hip: V = [40, 54];
  const base = {
    anchor: { at: 'hip' as const, to: hip },
    trunk: 80,
    head: -40,
    leg: feetAt(hip[0] + 4, [1, -0.3]),
    farLeg: { a: 2, b: -92, foot: 10 },
    farArm: { a: -8, b: -8 },
  };
  return {
    frames: [
      { ...base, arm: { a: 2, b: 2 } },
      { ...base, arm: { reach: { from: 'shoulder', to: [-15, 5], bend: [-0.6, -1], bendTrunk: true, shorten: 0.95 } } },
    ],
    work: ['lats', 'upperBack', 'biceps'],
    standing: false,
    handGear: 3.3,
    gear: (j) => [
      { layer: 'back', node: G.floor() },
      { layer: 'back', node: G.pad([hip[0] - 12, j.knee2[1] + 3], [j.hand2[0] + 4, j.knee2[1] + 3], 3) },
      { layer: 'back', node: G.bar([hip[0] - 7, j.knee2[1] + 6], [hip[0] - 7, FLOOR], 2) },
      { layer: 'back', node: G.bar([j.hand2[0], j.knee2[1] + 6], [j.hand2[0], FLOOR], 2) },
      { layer: 'front', node: G.dumbbell(j.hand) },
    ],
  };
})();

/** Back extension on a 45° bench: from folded down to the body in one line, arms crossed on the chest. */
function backExtension(machine: boolean): Move {
  if (machine) {
    const hip: V = [42, SEAT_HIP_Y];
    const base = { anchor: { at: 'hip' as const, to: hip }, head: 0, leg: feetAt(hip[0] + 18) };
    const arm = { reach: { from: 'shoulder' as const, to: [-5, 5] as V, bend: [-1, 0.6] as V, bendTrunk: true, shorten: 0.9 } };
    return {
      frames: [
        { ...base, trunk: 38, head: -6, arm },
        { ...base, trunk: -12, arm },
      ],
      work: ['lowerBack', 'glutes'],
      standing: true,
      show: [[hip[0] - 18, 30]],
      gear: (j) => [
        { layer: 'back', node: G.floor() },
        ...seat(hip, 0),
        { layer: 'back', node: G.bar([hip[0] - 12, FLOOR], [hip[0] - 12, 34], 2.4) },
        { layer: 'back', node: G.stack(hip[0] - 18, 74, 6, 8) },
        { layer: 'back', node: G.bar([hip[0] - 12, 52], add(onTrunk(j, 'shoulder', -4, -6), [0, 0]), 2) },
        { layer: 'back', node: G.pad(onTrunk(j, 'shoulder', 0, -6.8), onTrunk(j, 'shoulder', -9, -6.8), 2.8) },
      ],
    };
  }
  const ankle: V = [30, 84];
  const legs = { a: -45, b: -45, foot: 45 };
  const arm = { reach: { from: 'shoulder' as const, to: [-5, 5] as V, bend: [-1, 0.6] as V, bendTrunk: true, shorten: 0.9 } };
  return {
    frames: [
      { anchor: { at: 'ankle', to: ankle }, trunk: 138, head: 10, leg: legs, arm },
      { anchor: { at: 'ankle', to: ankle }, trunk: 42, head: -6, leg: legs, arm },
    ],
    work: ['lowerBack', 'glutes', 'hams'],
    show: [[ankle[0] - 4, FLOOR]],
    gear: (j) => {
      // The pad under the top of the thighs, the roller behind the ankles, the frame between them.
      const padA = add(j.hip, [3.6, 5.2]);
      const padB = add(j.hip, [-4.6, -3.0]);
      return [
        { layer: 'back', node: G.floor() },
        { layer: 'back', node: G.bar([ankle[0] - 8, FLOOR], [j.hip[0] + 14, FLOOR], 2.4) },
        { layer: 'back', node: G.bar(add(ankle, [-1, 4]), add(j.hip, [6, 8]), 2.4) },
        { layer: 'back', node: G.bar(add(j.hip, [6, 8]), [j.hip[0] + 10, FLOOR], 2.4) },
        { layer: 'back', node: G.bar(add(ankle, [-1, 4]), [ankle[0] - 4, FLOOR], 2.4) },
        { layer: 'front', node: G.pad(padA, padB, 3) },
        { layer: 'front', node: G.roll(add(ankle, [-2.6, -2.2]), 2.2) },
      ];
    },
  };
}
export const backExtensionMove = backExtension(false);
export const machineBackExtension = backExtension(true);

/** Straight-arm pulldown with a rope: from the hands at head height to the thighs, arms straight. */
export const cablePullover: Move = (() => {
  const base = { anchor: { at: 'ankle' as const, to: [44, ANKLE_Y] as V }, trunk: 24, head: -16, leg: { a: 12, b: 4, foot: 90 } };
  const pulley: V = [72, 10];
  return {
    frames: [
      { ...base, arm: { a: 128, b: 134 } },
      { ...base, arm: { a: 2, b: 8 } },
    ],
    work: ['lats', 'triceps'],
    standing: true,
    balance: (j) => [(j.hip[0] + j.shoulder[0]) / 2, 0],
    show: [pulley, [pulley[0] + 2, FLOOR]],
    gear: (j) => [
      { layer: 'back', node: G.floor() },
      { layer: 'back', node: G.bar([pulley[0] + 3, FLOOR], [pulley[0] + 3, pulley[1] - 3], 2.4) },
      { layer: 'back', node: G.stack(pulley[0] + 8, 74, 6, 8) },
      { layer: 'back', node: G.wheel(pulley) },
      { layer: 'back', node: G.cable(pulley, j.hand) },
    ],
  };
})();

/** Chest-supported T-bar row: standing on the plate, chest on the pad, the lever from long arms to the chest. */
export const chestSupportedRow: Move = (() => {
  const base = { anchor: { at: 'ankle' as const, to: [34, ANKLE_Y - 4] as V }, trunk: 52, head: -24, leg: { a: 26, b: 12, foot: 90 } };
  const j0 = at({ ...base, arm: { a: 0 } } as Pose);
  const pivot: V = [j0.shoulder[0] + 30, FLOOR - 4];
  const padA = onTrunk(j0, 'shoulder', -2, 7);
  const padB = onTrunk(j0, 'shoulder', -18, 7);
  return {
    frames: [
      { ...base, arm: { a: 2, b: 2 } },
      { ...base, arm: { reach: { from: 'shoulder', to: [-11, 7.5], bend: [-0.6, -1], bendTrunk: true, shorten: 0.9 } } },
    ],
    work: ['upperBack', 'lats', 'biceps'],
    show: [pivot, [j0.ankle[0] - 6, FLOOR]],
    gear: (j) => [
      { layer: 'back', node: G.floor() },
      { layer: 'back', node: G.bar([j0.ankle[0] - 6, ANKLE_Y - 1], [pivot[0], FLOOR - 1], 2.4) },
      { layer: 'back', node: G.pad([j0.ankle[0] - 5, ANKLE_Y - 1], [j0.ankle[0] + 9, ANKLE_Y - 1], 2) },
      { layer: 'mid', node: G.pad(add(padA, [1.2, -1.2]), add(padB, [1.2, -1.2]), 3) },
      { layer: 'back', node: G.bar(add(padB, [3, 1]), [padB[0] + 6, FLOOR], 2) },
      { layer: 'back', node: G.plate(add(pivot, [-3, -7 - (j.hand[1] < 70 ? 4 : 0)]), 6.5) },
      ...lever(pivot, j.hand),
      { layer: 'front', node: G.bar(add(j.hand, [-1.6, 0]), add(j.hand, [1.6, 0]), 1.6) },
    ],
  };
})();

/**
 * Yates row in a lever machine: underhand grip with both hands, the trunk at about 45°, knees soft; the handles
 * from long arms to the lower belly, elbows close to the body.
 */
export const dorianRow: Move = (() => {
  const base = { anchor: { at: 'ankle' as const, to: [46, ANKLE_Y] as V }, trunk: 45, head: -18, leg: { a: 34, b: -4, foot: 90 } };
  const pivot: V = [14, FLOOR - 2];
  return {
    frames: [
      { ...base, arm: { a: -14, b: -14 } },
      { ...base, arm: { reach: { from: 'shoulder', to: [-17, 5.5], bend: [-0.6, -1], bendTrunk: true, shorten: 0.95 } } },
    ],
    work: ['lats', 'upperBack', 'biceps'],
    standing: true,
    balance: (j) => j.hand,
    show: [pivot],
    gear: (j) => [
      { layer: 'back', node: G.floor() },
      { layer: 'back', node: G.bar([pivot[0], FLOOR], pivot, 2.4) },
      // The plates are on the end the hands hold; the far end is fixed.
      ...lever(pivot, j.hand, { plate: 0.9, plateR: 6.5 }),
      { layer: 'front', node: G.bar(add(j.hand, [-1.6, 0]), add(j.hand, [1.6, 0]), 1.6) },
    ],
  };
})();

/** Shrugs in a lever machine: standing, handles at the sides, the shoulders up to the ears. */
export const plateShrug: Move = (() => {
  const base = { anchor: { at: 'ankle' as const, to: [46, ANKLE_Y] as V }, trunk: 4, leg: { a: 0, b: 0, foot: 90 }, arm: { a: 2, b: 2 } };
  const pivot: V = [24, FLOOR - 8];
  return {
    frames: [
      { ...base, head: 0 },
      { ...base, head: 4, shrug: 3.2 },
    ],
    work: ['upperBack'],
    standing: true,
    show: [pivot],
    gear: (j) => [
      { layer: 'back', node: G.floor() },
      { layer: 'back', node: G.bar([pivot[0], FLOOR], pivot, 2.4) },
      ...lever(pivot, j.hand, { plate: 0.55, plateR: 6.5 }),
      { layer: 'front', node: G.bar(add(j.hand, [-1.6, 0]), add(j.hand, [1.6, 0]), 1.6) },
    ],
  };
})();

/** Deadlift: the bar from the floor over the middle of the foot, past the knees, to standing up straight. */
function deadlift(onLever?: boolean): Move {
  const a: V = [46, ANKLE_Y];
  return {
    frames: [
      { anchor: { at: 'ankle', to: a }, trunk: 67.5, head: -36, leg: { a: 77.5, b: -14, foot: 90 }, arm: { a: -14, b: -14 } },
      { anchor: { at: 'ankle', to: a }, trunk: 48, head: -26, leg: { a: 54, b: -8, foot: 90 }, arm: { a: -7, b: -7 } },
      { anchor: { at: 'ankle', to: a }, trunk: 2, head: 0, leg: { a: 0, b: 0, foot: 90 }, arm: { a: 7, b: 7 } },
    ],
    work: ['glutes', 'hams', 'lowerBack', 'quads'],
    standing: true,
    handGear: onLever ? 2 : 8.4,
    balance: (j) => j.hand,
    show: onLever ? [[16, FLOOR - 6]] : [],
    gear: (j) => [
      { layer: 'back', node: G.floor() },
      ...(onLever
        ? [
            { layer: 'back' as const, node: G.bar([16, FLOOR], [16, FLOOR - 6], 2.4) },
            ...leverHandle([16, FLOOR - 6], j.hand),
          ]
        : [{ layer: 'back' as const, node: G.plate(j.hand) }]),
    ],
  };
}
const leverHandle = (pivot: V, hand: V) => [
  // The plates sit next to the handles, on the end the hands lift.
  ...lever(pivot, hand, { plate: 0.88, plateR: 6.5 }),
  { layer: 'front' as const, node: G.bar(add(hand, [-1.6, 0]), add(hand, [1.6, 0]), 1.6) },
];
export const deadliftMove = deadlift();
export const plateDeadlift = deadlift(true);

