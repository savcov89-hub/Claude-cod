// Exercises as poses (start → end, optionally a middle) with their equipment and working muscles.
// Every pose was checked against photos of the exercise (free-exercise-db) and by scripts/check-figures.ts.
import { G, type Gear, type Muscle } from './draw';
import { FLOOR, add, type Joints, type Pose, type V } from './rig';

export interface Move {
  /** Key poses: start, (middle,) end. The animation goes there and back. */
  frames: Pose[];
  work: Muscle[];
  gear: (j: Joints) => Gear[];
  /** Arms out to the sides (wide grip): their angles are not checked as seen from the side. */
  wideArms?: boolean;
  /** Feet that must stand flat on the floor. */
  standing?: boolean;
  /** Points of the equipment the picture must show (besides the person). */
  show?: V[];
  /** No light outline around the near arm (when it lies over the head, like holding a bar on the back). */
  noHalo?: boolean;
  /** Size of what the hands hold (a plate's radius), kept in the picture. */
  handGear?: number;
  /** The weight must stay over the middle of the foot (the bar's point, ±). */
  balance?: (j: Joints) => V;
}

const ANKLE_Y = FLOOR - 3;
/** A point in the trunk's frame: along the spine from the shoulder (+ up) and towards the front. */
const onTrunk = (j: Joints, base: 'shoulder' | 'hip', along: number, front: number): V =>
  add(add(base === 'shoulder' ? j.shoulder : j.hip, j.up, along), j.front, front);

// ---------- chest ----------
const benchPress: Move = (() => {
  const base = { anchor: { at: 'hip' as const, to: [62, 70.6] as V }, trunk: -90, head: -6, leg: { a: 88, b: -2, foot: 90 } };
  return {
    frames: [
      { ...base, arm: { reach: { from: 'shoulder', to: [-1.5, 22.3], bend: [0.6, 1], shorten: 0.9 } } },
      { ...base, arm: { reach: { from: 'shoulder', to: [-7.5, 7.6], bend: [0.35, 1], shorten: 0.9 } } },
    ],
    work: ['chest', 'triceps', 'delts'],
    wideArms: true,
    handGear: 8.4,
    show: [[22, 76], [68, 76]],
    balance: (j) => j.hand,
    gear: (j) => [
      { layer: 'back', node: G.floor() },
      { layer: 'back', node: G.bar([32, 78.6], [32, FLOOR]) },
      { layer: 'back', node: G.bar([64, 78.6], [64, FLOOR]) },
      { layer: 'back', node: G.bar([26, FLOOR], [38, FLOOR], 2.2) },
      { layer: 'back', node: G.bar([58, FLOOR], [70, FLOOR], 2.2) },
      { layer: 'mid', node: G.pad([22, 75.6], [68, 75.6], 3) },
      { layer: 'back', node: G.plate(j.hand) },
    ],
  };
})();

// ---------- back ----------
const latPulldown: Move = (() => {
  const base = { anchor: { at: 'hip' as const, to: [42, 71.2] as V }, head: -12, leg: { a: 90, b: 2, foot: 90 } };
  const pulley: V = [52, 7];
  return {
    frames: [
      { ...base, trunk: -8, arm: { reach: { from: 'shoulder', to: [22, 4.6], bend: [-0.2, 1], shorten: 0.92 } } },
      { ...base, trunk: -20, arm: { reach: { from: 'shoulder', to: [0.5, 6.8], bend: [-0.5, 1], shorten: 0.78 } } },
    ],
    work: ['lats', 'upperBack', 'biceps'],
    wideArms: true,
    show: [[52, 4], [84, 60]],
    gear: (j) => [
      { layer: 'back', node: G.floor() },
      { layer: 'back', node: G.bar([76, FLOOR], [76, 5], 2.4) },
      { layer: 'back', node: G.bar([76, 5], [pulley[0] - 2, 5], 2.4) },
      { layer: 'back', node: G.stack(82, 74, 7, 8) },
      { layer: 'back', node: G.bar([82, 72.5], [82, 12], 0.9) },
      { layer: 'back', node: G.cable(pulley, j.hand) },
      { layer: 'back', node: G.wheel(pulley) },
      { layer: 'back', node: G.cable([pulley[0], pulley[1] - 1.8], [82, pulley[1] - 1.8]) },
      { layer: 'back', node: G.bar([42, 79], [42, FLOOR], 2) },
      { layer: 'back', node: G.bar([34, FLOOR], [50, FLOOR], 2.2) },
      { layer: 'back', node: G.pad([33, 75.8], [53, 75.8], 3) },
      { layer: 'back', node: G.bar([59, 64.2], [76, 64.2], 1.6) },
      { layer: 'front', node: G.roll([58.5, 64.2], 2.6) },
      { layer: 'front', node: G.bar([j.hand[0] - 0.2, j.hand[1] - 1.4], [j.hand[0] + 0.4, j.hand[1] + 1.4], 1.4) },
    ],
  };
})();

// ---------- legs ----------
const backSquat: Move = (() => {
  const arm = { reach: { from: 'shoulder' as const, to: [-0.6, -3.2] as V, bend: [-0.6, 1] as V, shorten: 0.62 } };
  return {
    frames: [
      { anchor: { at: 'ankle', to: [44, ANKLE_Y] }, trunk: 11, head: -11, leg: { a: 0, b: 0, foot: 90 }, arm },
      { anchor: { at: 'ankle', to: [44, ANKLE_Y] }, trunk: 40, head: -26, leg: { a: 84, b: -37, foot: 90 }, arm },
    ],
    work: ['quads', 'glutes', 'adductors'],
    wideArms: true,
    noHalo: true,
    handGear: 8.4,
    standing: true,
    balance: (j) => onTrunk(j, 'shoulder', -0.6, -3.2),
    gear: (j) => [
      { layer: 'back', node: G.floor() },
      { layer: 'back', node: G.plate(onTrunk(j, 'shoulder', -0.6, -3.2)) },
    ],
  };
})();

const legPress: Move = (() => {
  const hip: V = [30, 73];
  const u: V = [Math.SQRT1_2, -Math.SQRT1_2]; // along the rails, up
  const n: V = [-Math.SQRT1_2, -Math.SQRT1_2]; // across, towards the top of the platform
  const feet = (d: number): V => add(add(hip, u, d), n, 3.6);
  const base = { anchor: { at: 'hip' as const, to: hip }, trunk: -58, head: 22 };
  const legAt = (d: number) => ({ reach: { to: feet(d), bend: [-0.75, -0.6] as V }, foot: -140 });
  const arm = { reach: { from: 'hip' as const, to: [2, 5.5] as V, bend: [-0.3, 1] as V } };
  return {
    frames: [
      { ...base, leg: legAt(35.2), arm },
      { ...base, leg: legAt(22), arm },
    ],
    work: ['quads', 'glutes'],
    show: [add(add(hip, u, 62), n, -9), add(add(hip, u, 44), n, 6)],
    gear: (j) => {
      const plat = add(j.ankle, u, 2.9);
      const railA: V = add(add(hip, u, 4), n, -9);
      const railB: V = add(add(hip, u, 62), n, -9);
      const sled = add(plat, u, 3);
      return [
        { layer: 'back', node: G.floor() },
        { layer: 'back', node: G.bar(railA, railB, 2.4) },
        { layer: 'back', node: G.bar([railB[0], railB[1]], [railB[0], FLOOR], 2.4) },
        { layer: 'back', node: G.bar([railA[0] + 6, FLOOR], [railB[0] + 3, FLOOR], 2.4) },
        { layer: 'back', node: G.bar(add(sled, n, -8.5), add(sled, n, 4), 4) },
        { layer: 'back', node: G.plate(add(add(sled, n, -4), u, 4.8), 7.4) },
        { layer: 'back', node: G.pad(add(hip, [-4.2, 4.6], 1), add(add(hip, [-4.2, 4.6], 1), [-0.82, -0.57], 30), 3.2) },
        { layer: 'back', node: G.pad(add(hip, [-6, 5.4]), add(hip, [9, 5.4]), 3) },
        { layer: 'back', node: G.bar(add(hip, [-1, 8.4]), [hip[0] - 1, FLOOR], 2.2) },
        { layer: 'front', node: G.pad(add(plat, n, -4.5), add(plat, n, 10), 2.4) },
      ];
    },
  };
})();

// ---------- arms ----------
const dumbbellCurl: Move = {
  frames: [
    { anchor: { at: 'ankle', to: [48, ANKLE_Y] }, trunk: 0, leg: { a: 0, b: 0, foot: 90 }, arm: { a: 3, b: 6 } },
    { anchor: { at: 'ankle', to: [48, ANKLE_Y] }, trunk: -2, leg: { a: 0, b: 0, foot: 90 }, arm: { a: 9, b: 146 } },
  ],
  work: ['biceps', 'forearm'],
  standing: true,
  handGear: 3.3,
  gear: (j) => [
    { layer: 'back', node: G.floor() },
    { layer: 'back', node: G.dumbbell(j.hand2) },
    { layer: 'front', node: G.dumbbell(j.hand) },
  ],
};

// ---------- hinge ----------
const romanianDeadlift: Move = {
  frames: [
    { anchor: { at: 'ankle', to: [46, ANKLE_Y] }, trunk: 2, head: 0, leg: { a: 0, b: 0, foot: 90 }, arm: { a: 7, b: 7 } },
    { anchor: { at: 'ankle', to: [46, ANKLE_Y] }, trunk: 38, head: -14, leg: { a: 13, b: 3, foot: 90 }, arm: { a: -15, b: -15 } },
    { anchor: { at: 'ankle', to: [46, ANKLE_Y] }, trunk: 72, head: -30, leg: { a: 24, b: 5, foot: 90 }, arm: { a: -27, b: -27 } },
  ],
  work: ['hams', 'glutes', 'lowerBack'],
  standing: true,
  handGear: 8.4,
  balance: (j) => j.hand,
  gear: (j) => [
    { layer: 'back', node: G.floor() },
    { layer: 'back', node: G.plate(j.hand) },
  ],
};

export const MOVES: Record<string, Move> = {
  'bench-press': benchPress,
  'lat-pulldown': latPulldown,
  'back-squat': backSquat,
  'leg-press': legPress,
  'dumbbell-curl': dumbbellCurl,
  rdl: romanianDeadlift,
};
