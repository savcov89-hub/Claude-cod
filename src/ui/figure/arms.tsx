// Arms: curls and triceps. Checked against the photos in scripts/figure-refs.json.
import { ANKLE_Y, FLOOR, G, add, onTrunk, type Move, type V } from './kit';

export const dumbbellCurl: Move = {
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
