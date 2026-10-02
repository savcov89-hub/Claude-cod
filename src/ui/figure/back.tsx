// Back: pulldowns, rows, pull-ups, extensions, deadlifts. Checked against the photos in scripts/figure-refs.json.
import { ANKLE_Y, FLOOR, G, add, onTrunk, type Move, type V } from './kit';

export const latPulldown: Move = (() => {
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
