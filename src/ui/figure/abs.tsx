// Abs: crunches and leg raises. Checked against the photos in scripts/figure-refs.json.
import { FLOOR, G, add, feetAt, onTrunk, seat, SEAT_HIP_Y, tower, type Move, type V } from './kit';

/** Hands at the temples: the elbows out, the hands by the head (in the trunk's frame from the shoulder). */
const handsAtHead = { reach: { from: 'shoulder' as const, to: [4.5, 1.2] as V, bend: [-0.3, 1] as V, bendTrunk: true, shorten: 0.62 } };
const MAT_Y = FLOOR - 0.8;

/** Crunch on the floor: knees bent, feet flat; the shoulders curl up off the floor. */
export const crunch: Move = (() => {
  const hip: V = [52, MAT_Y - 4.6];
  return {
    frames: [
      { anchor: { at: 'hip', to: hip }, trunk: -88, head: -4, leg: feetAt(hip[0] + 24), arm: handsAtHead },
      { anchor: { at: 'hip', to: hip }, trunk: -56, head: 14, leg: feetAt(hip[0] + 24), arm: handsAtHead },
    ],
    work: ['abs'],
    wideArms: true,
    gear: () => [
      { layer: 'back', node: G.floor() },
      { layer: 'back', node: G.bar([18, MAT_Y + 0.3], [70, MAT_Y + 0.3], 1.4) },
    ],
  };
})();

/** Reverse crunch: lying on the back, knees bent up; the hips curl up and the knees come to the chest. */
export const reverseCrunch: Move = (() => {
  const shoulder: V = [30, MAT_Y - 4.6];
  const arm = { a: 90, b: 90 };
  return {
    frames: [
      { anchor: { at: 'shoulder', to: shoulder }, trunk: -90, head: -4, leg: { a: 178, b: 92, foot: 170 }, arm },
      { anchor: { at: 'shoulder', to: shoulder }, trunk: -70, head: -2, leg: { a: 220, b: 124, foot: 206 }, arm },
    ],
    work: ['abs'],
    gear: () => [
      { layer: 'back', node: G.floor() },
      { layer: 'back', node: G.bar([16, MAT_Y + 0.3], [70, MAT_Y + 0.3], 1.4) },
    ],
  };
})();

/** Cable crunch: kneeling below a high pulley, the rope at the head; the trunk curls down to the thighs. */
export const cableCrunch: Move = (() => {
  const knees = { a: 0, b: -90, foot: -52 };
  const ankle: V = [30, FLOOR - 5.5];
  const pulley: V = [62, 10];
  return {
    frames: [
      { anchor: { at: 'ankle', to: ankle }, trunk: 18, head: 18, leg: knees, arm: handsAtHead },
      { anchor: { at: 'ankle', to: ankle }, trunk: 78, head: 34, leg: knees, arm: handsAtHead },
    ],
    work: ['abs'],
    wideArms: true,
    show: [pulley, [pulley[0] + 4, FLOOR]],
    gear: (j) => [
      { layer: 'back', node: G.floor() },
      { layer: 'back', node: G.pad([ankle[0] - 6, FLOOR - 2.6], [ankle[0] + 22, FLOOR - 2.6], 2.4) },
      { layer: 'back', node: G.bar([pulley[0] + 3, FLOOR], [pulley[0] + 3, pulley[1] - 4], 2.4) },
      { layer: 'back', node: G.stack(pulley[0] + 8, 74, 6, 8) },
      { layer: 'back', node: G.wheel(pulley) },
      { layer: 'back', node: G.cable(pulley, j.hand) },
    ],
  };
})();

/** Hanging knee raise: hanging from the bar, the knees come up to the chest. */
export const hangingLegRaise: Move = (() => {
  const bar: V = [50, 4];
  const arm = { a: 178, b: 178 };
  return {
    frames: [
      { anchor: { at: 'hand', to: bar }, trunk: -2, head: -4, leg: { a: 6, b: -40, foot: 76 }, arm },
      { anchor: { at: 'hand', to: bar }, trunk: -14, head: 4, leg: { a: 104, b: 8, foot: 90 }, arm },
    ],
    work: ['abs'],
    show: [[bar[0], FLOOR], [bar[0] + 14, 10]],
    gear: () => [
      { layer: 'back', node: G.floor() },
      { layer: 'back', node: G.bar([bar[0] + 13, FLOOR], [bar[0] + 13, bar[1] - 2], 2.4) },
      { layer: 'back', node: G.bar([bar[0] + 13, bar[1] - 2], [bar[0] - 1.5, bar[1] - 2], 2) },
      { layer: 'front', node: G.wheel(bar, 1.4) },
    ],
  };
})();

/** Ab crunch machine: seated, the pads on the chest / handles by the head; the trunk curls forward. */
function abMachine(plates: boolean): Move {
  const hip: V = [42, SEAT_HIP_Y];
  const base = { anchor: { at: 'hip' as const, to: hip }, leg: feetAt(hip[0] + 15) };
  return {
    frames: [
      { ...base, trunk: -4, head: 0, arm: handsAtHead },
      { ...base, trunk: 38, head: 22, arm: handsAtHead },
    ],
    work: ['abs'],
    wideArms: true,
    standing: true,
    show: [[hip[0] - 20, 30]],
    gear: (j) => {
      const pivot: V = [hip[0] - 4, hip[1] - 26];
      const pad = onTrunk(j, 'shoulder', -2, 6.5);
      return [
        { layer: 'back', node: G.floor() },
        ...seat(hip, 0, { rest: 22 }),
        ...(plates ? [{ layer: 'back' as const, node: G.bar([hip[0] - 15, FLOOR], [hip[0] - 15, pivot[1]], 2.4) }] : tower(hip[0] - 15, pivot[1], { stackX: hip[0] - 20 })),
        { layer: 'back', node: G.bar([hip[0] - 15, pivot[1]], pivot, 2.2) },
        { layer: 'back', node: G.bar(pivot, add(pad, [-1, -2]), 2) },
        ...(plates ? [{ layer: 'back' as const, node: G.plate(add(pivot, [-6, -2]), 5.6) }] : []),
        { layer: 'front', node: G.pad(add(pad, [1.2, -4]), add(pad, [1.2, 5]), 2.4) },
        { layer: 'back', node: G.roll(add(j.ankle, [2.6, -2.8]), 2) },
      ];
    },
  };
}
export const stackAbCrunch = abMachine(false);
export const plateAbCrunch = abMachine(true);

