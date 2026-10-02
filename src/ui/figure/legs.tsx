// Legs: squats, presses, hinges, curls, extensions, calves, glutes. Checked against the photos in scripts/figure-refs.json.
import { ANKLE_Y, FLOOR, G, add, onTrunk, type Move, type V } from './kit';

export const backSquat: Move = (() => {
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

export const legPress: Move = (() => {
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

export const romanianDeadlift: Move = {
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
