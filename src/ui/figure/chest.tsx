// Chest: presses, flies, dips. Checked against the photos in scripts/figure-refs.json.
import { ANKLE_Y, FLOOR, G, add, at, feetAt, lever, onTrunk, seat, SEAT_HIP_Y, tower, trunkFrame, type Move, type Pose, type V } from './kit';

export const benchPress: Move = (() => {
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

/** An incline bench: the back pad along the trunk, a seat under the hip, legs to the floor. */
function inclineBench(hip: V, trunk: number, length = 30) {
  return [
    ...seat(hip, trunk, { rest: length, back: 4, front: 8 }),
  ];
}

/** Incline press: lying back on an incline bench, hands from the chest up over the shoulders. */
function inclinePress(o: { trunk: number; smith?: boolean; dumbbells?: boolean }): Move {
  const hip: V = [46, SEAT_HIP_Y];
  const base = { anchor: { at: 'hip' as const, to: hip }, trunk: o.trunk, head: -10, leg: feetAt(hip[0] + 21) };
  const j0 = at({ ...base, arm: { a: 0 } } as Pose);
  // The bottom: just above the upper chest; the top: straight up over the shoulder (a Smith bar goes straight up).
  const low = onTrunk(j0, 'shoulder', -2.5, 6.8);
  const high: V = o.smith ? [low[0], j0.shoulder[1] - 21.5] : [j0.shoulder[0] + 1.5, j0.shoulder[1] - 21.5];
  const arm = (p: V, bend: V) => ({ reach: { to: trunkFrame(j0, p), from: 'shoulder' as const, bend, shorten: 0.9 } });
  return {
    frames: [
      { ...base, arm: arm(low, [0.2, 1]) },
      { ...base, arm: arm(high, [0.3, 1]) },
    ],
    work: ['chest', 'delts', 'triceps'],
    wideArms: true,
    standing: true,
    handGear: o.dumbbells ? 3.3 : 8.4,
    show: o.smith ? [[low[0], 8]] : [],
    gear: (j) => [
      { layer: 'back', node: G.floor() },
      ...(o.smith
        ? [
            { layer: 'back' as const, node: G.bar([low[0] - 2.4, FLOOR], [low[0] - 2.4, 8], 1.8) },
            { layer: 'back' as const, node: G.bar([low[0] + 2.4, FLOOR], [low[0] + 2.4, 8], 1.8) },
          ]
        : []),
      ...inclineBench(hip, o.trunk, 31),
      o.dumbbells
        ? { layer: 'front' as const, node: G.dumbbell(j.hand) }
        : { layer: 'back' as const, node: G.plate(j.hand, 8) },
    ],
  };
}

export const inclineDumbbellPress = inclinePress({ trunk: -58, dumbbells: true });
export const smithInclinePress = inclinePress({ trunk: -55, smith: true });

/**
 * Seated chest press in a machine: handles from beside the chest straight forward.
 * `incline` — pressing up and forward (incline machine); `plates` — a plate-loaded lever, otherwise a stack.
 */
function machinePress(o: { plates?: boolean; incline?: number }): Move {
  const hip: V = [40, SEAT_HIP_Y];
  const trunk = -8;
  const base = { anchor: { at: 'hip' as const, to: hip }, trunk, head: -2, leg: feetAt(hip[0] + 19) };
  const j0 = at({ ...base, arm: { a: 0 } } as Pose);
  const incline = o.incline ?? 0;
  const near = onTrunk(j0, 'shoulder', -3.5 + incline * 0.05, 4.2);
  const reach = 21.5;
  const dir = [Math.sin(((90 - incline) * Math.PI) / 180), -Math.cos(((90 - incline) * Math.PI) / 180)] as V;
  const far = add(add(j0.shoulder, [0, 2.5 - incline * 0.08]), dir, reach);
  const arm = (p: V, bend: V, shorten = 0.92) => ({ reach: { to: trunkFrame(j0, p), from: 'shoulder' as const, bend, shorten } });
  // The lever turns about a pivot above and behind the shoulder (stack) or low behind (plates).
  const pivot: V = o.plates ? [j0.shoulder[0] - 4, j0.shoulder[1] - 15] : [j0.shoulder[0] - 2, j0.shoulder[1] - 16];
  return {
    frames: [
      { ...base, arm: arm(near, [-1, 0.25], 0.8) },
      { ...base, arm: arm(far, [-0.2, 1]) },
    ],
    work: ['chest', 'delts', 'triceps'],
    wideArms: true,
    standing: true,
    show: [pivot, [hip[0] - 14, 30]],
    gear: (j) => [
      { layer: 'back', node: G.floor() },
      ...(o.plates ? [] : tower(hip[0] - 13, j0.shoulder[1] - 18, { stackX: hip[0] - 18 })),
      ...(o.plates ? [] : [{ layer: 'back' as const, node: G.bar([hip[0] - 13, j0.shoulder[1] - 18], pivot, 2.2) }]),
      ...(o.plates
        ? [
            { layer: 'back' as const, node: G.bar([hip[0] - 13, FLOOR], [hip[0] - 13, pivot[1]], 2.4) },
            { layer: 'back' as const, node: G.bar([hip[0] - 13, pivot[1]], pivot, 2.4) },
          ]
        : []),
      ...seat(hip, trunk, { rest: 26 }),
      ...lever(pivot, add(j.hand, [0, -0.5]), o.plates ? { plate: 0.9, plateR: 5.6 } : {}),
      { layer: 'front', node: G.bar(add(j.hand, [0, -1.8]), add(j.hand, [0, 1.8]), 1.6) },
    ],
  };
}

export const machineChestPress = machinePress({});
export const plateChestPress = machinePress({ plates: true });
export const plateInclinePress = machinePress({ plates: true, incline: 32 });

/** Standing cable crossover: from wide and high to the hands together in front of the hips. */
export const cableFly: Move = (() => {
  const base = { anchor: { at: 'ankle' as const, to: [50, ANKLE_Y] as V }, trunk: 16, head: -14, leg: { a: 4, b: 2, foot: 90 } };
  const j0 = at({ ...base, arm: { a: 0 } } as Pose);
  const pulley: V = [j0.shoulder[0] - 3.5, 12];
  return {
    frames: [
      { ...base, arm: { reach: { from: 'shoulder', to: [-1, -7.5], bend: [0, 1], shorten: 0.5 } } },
      { ...base, arm: { reach: { from: 'shoulder', to: [-4, 9], bend: [-0.1, 1], shorten: 0.7 } } },
      { ...base, arm: { reach: { from: 'shoulder', to: [-14, 16.5], bend: [-0.2, 1], shorten: 0.95 } } },
    ],
    work: ['chest', 'delts'],
    wideArms: true,
    standing: true,
    balance: (j) => [(j.hip[0] + j.shoulder[0]) / 2, 0],
    show: [pulley],
    gear: (j) => [
      { layer: 'back', node: G.floor() },
      { layer: 'back', node: G.bar([pulley[0] - 2, FLOOR], [pulley[0] - 2, 8], 2.4) },
      { layer: 'back', node: G.wheel(pulley) },
      { layer: 'back', node: G.cable(pulley, j.hand) },
    ],
  };
})();

/** Pec deck with handles: arms almost straight, from out to the sides to together in front of the chest. */
function pecDeck(): Move {
  const hip: V = [42, SEAT_HIP_Y];
  const trunk = -4;
  const base = { anchor: { at: 'hip' as const, to: hip }, trunk, head: -2, leg: feetAt(hip[0] + 19) };
  const j0 = at({ ...base, arm: { a: 0 } } as Pose);
  const pivot: V = [j0.shoulder[0] + 0.5, j0.shoulder[1] - 15];
  return {
    frames: [
      { ...base, arm: { reach: { from: 'shoulder', to: [-0.5, -7.2], bend: [0, 1], shorten: 0.5 } } },
      { ...base, arm: { reach: { from: 'shoulder', to: [-6, 9], bend: [-0.2, 1], shorten: 0.6 } } },
      { ...base, arm: { reach: { from: 'shoulder', to: [-1.5, 21.6], bend: [0, 1], shorten: 0.94 } } },
    ],
    work: ['chest', 'delts'],
    wideArms: true,
    standing: true,
    show: [pivot, [hip[0] - 16, 40]],
    gear: (j) => [
      { layer: 'back', node: G.floor() },
      ...tower(hip[0] - 13, pivot[1] - 3, { stackX: hip[0] - 18 }),
      { layer: 'back', node: G.bar([hip[0] - 13, pivot[1] - 3], [pivot[0], pivot[1] - 3], 2.4) },
      ...seat(hip, trunk, { rest: 26 }),
      { layer: 'back', node: G.bar([pivot[0], pivot[1] - 3], add(j.hand, [0, -2.2]), 1.8) },
      { layer: 'front', node: G.bar(add(j.hand, [0, -2.2]), add(j.hand, [0, 2.2]), 1.6) },
    ],
  };
}
export const pecDeckMove = pecDeck();

/** Dips on parallel bars, leaning forward for the chest; `assisted` — kneeling on the pad of an assist machine. */
function dips(assisted: boolean): Move {
  const hand: V = [52, 47];
  const legs = assisted ? { a: 6, b: -86, foot: 30 } : { a: 18, b: -66, foot: 44 };
  const legsLow = assisted ? { a: 10, b: -84, foot: 32 } : { a: 22, b: -64, foot: 46 };
  return {
    frames: [
      { anchor: { at: 'hand', to: hand }, trunk: 14, head: -6, leg: legs, arm: { a: -4, b: 0 } },
      { anchor: { at: 'hand', to: hand }, trunk: 32, head: -16, leg: legsLow, arm: { a: -98, b: 14 } },
    ],
    work: ['chest', 'triceps', 'delts'],
    show: [[hand[0], FLOOR]],
    gear: (j) => [
      { layer: 'back', node: G.floor() },
      { layer: 'back', node: G.bar([hand[0] + 6, FLOOR], [hand[0] + 6, hand[1] - 2], 2.4) },
      { layer: 'back', node: G.bar([hand[0] + 6, hand[1]], [hand[0] - 4, hand[1]], 1.4) },
      { layer: 'front', node: G.wheel(hand, 1.5) },
      ...(assisted
        ? [
            { layer: 'back' as const, node: G.pad(add(j.knee, [-9, 3.2]), add(j.knee, [2.5, 3.2]), 2.6) },
            { layer: 'back' as const, node: G.bar(add(j.knee, [-3, 5.8]), [j.knee[0] + 9, j.knee[1] + 5.8], 1.6) },
            { layer: 'back' as const, node: G.bar([j.knee[0] + 9, j.knee[1] + 5.8], [hand[0] + 6, j.knee[1] + 5.8], 1.6) },
          ]
        : []),
    ],
  };
}
export const dipsMove = dips(false);
export const assistedDips = dips(true);
