// Legs: squats, presses, hinges, curls, extensions, calves, glutes. Checked against the photos in scripts/figure-refs.json.
import { ANKLE_Y, FLOOR, G, add, at, dirOf, feetAt, lever, onTrunk, seat, SEAT_HIP_Y, sub, tower, trunkFrame, type Gear, type Joints, type Move, type Pose, type V } from './kit';

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

/**
 * Leg press: lying back in the seat, feet on the platform that slides on rails at `angle` (45° — plate-loaded,
 * 0 — a horizontal stack machine). `calf` — legs straight, only the ankles push (calf press).
 */
function legPressOf(o: { angle: number; stack?: boolean; calf?: boolean }): Move {
  const r = (o.angle * Math.PI) / 180;
  const u: V = [Math.cos(r), -Math.sin(r)]; // along the rails, away from the seat
  const n: V = [-Math.sin(r), -Math.cos(r)]; // across, towards the top of the platform
  const hip: V = o.angle ? [30, 73] : [30, 68];
  const trunk = o.angle ? -58 : -42;
  const feet = (d: number): V => add(add(hip, u, d), n, o.angle ? 3.6 : 4.4);
  const perp = (Math.atan2(n[0], n[1]) * 180) / Math.PI; // the foot flat on the platform
  const base = { anchor: { at: 'hip' as const, to: hip }, trunk, head: o.angle ? 22 : 14 };
  const legAt = (d: number, foot = perp - 5) => ({ reach: { to: feet(d), bend: [n[0] - u[0] * 0.2, n[1] - u[1] * 0.2] as V }, foot });
  const arm = { reach: { from: 'hip' as const, to: [2, 5.5] as V, bend: [-0.3, 1] as V } };
  const frames = o.calf
    ? [
        { ...base, leg: legAt(35, perp + 18), arm },
        { ...base, leg: legAt(35, perp - 30), arm },
      ]
    : [
        { ...base, leg: legAt(35.2), arm },
        { ...base, leg: legAt(o.angle ? 22 : 21), arm },
      ];
  const len = o.angle ? 62 : 52;
  return {
    frames,
    work: o.calf ? ['calves'] : ['quads', 'glutes'],
    show: [add(add(hip, u, len), n, -9), add(add(hip, u, 44), n, 6), [hip[0] - 18, 40]],
    gear: (j) => {
      // The platform under the balls of the feet (calf press) or the whole sole.
      const plat = o.calf ? add(add(j.toe, u, 1.6), n, -2) : add(j.ankle, u, 2.9);
      const railA: V = add(add(hip, u, 4), n, -9);
      const railB: V = add(add(hip, u, len), n, -9);
      const sled = add(plat, u, 3);
      const restUp = dirOf(180 - trunk);
      const restBack: V = [restUp[1], -restUp[0]];
      const restA = add(add(hip, restBack, 5.6), restUp, -2);
      return [
        { layer: 'back', node: G.floor() },
        { layer: 'back', node: G.bar(railA, railB, 2.4) },
        { layer: 'back', node: G.bar([railB[0], railB[1]], [railB[0], FLOOR], 2.4) },
        { layer: 'back', node: G.bar([Math.min(railA[0], hip[0] - 8), FLOOR], [railB[0] + 3, FLOOR], 2.4) },
        { layer: 'back', node: G.bar(add(sled, n, -8.5), add(sled, n, 4), 4) },
        ...(o.stack
          ? [
              { layer: 'back' as const, node: G.stack(railB[0] + 6, 74, 6, 8) },
              { layer: 'back' as const, node: G.cable(sled, [railB[0] + 6, railB[1]]) },
            ]
          : [{ layer: 'back' as const, node: G.plate(add(add(sled, n, -4), u, 4.8), 7.4) }]),
        { layer: 'back', node: G.pad(restA, add(restA, restUp, 30), 3.2) },
        { layer: 'back', node: G.pad(add(hip, [-6, 5.4]), add(hip, [9, 5.4]), 3) },
        { layer: 'back', node: G.bar(add(hip, [-1, 8.4]), [hip[0] - 1, FLOOR], 2.2) },
        { layer: 'front', node: G.pad(add(plat, n, -4.5), add(plat, n, 10), 2.4) },
      ];
    },
  };
}
export const legPress = legPressOf({ angle: 45 });
export const stackLegPress = legPressOf({ angle: 0, stack: true });
export const legPressCalf = legPressOf({ angle: 45, calf: true });

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

/** Front squat: the bar on the front of the shoulders, elbows high, the trunk upright. */
export const frontSquat: Move = (() => {
  const bar: V = [-0.8, 4.6];
  const arm = { reach: { from: 'shoulder' as const, to: [-0.6, 3.4] as V, bend: [1, 0.2] as V, shorten: 0.62 } };
  return {
    frames: [
      { anchor: { at: 'ankle', to: [44, ANKLE_Y] }, trunk: 2, head: -2, leg: { a: 0, b: 0, foot: 90 }, arm },
      { anchor: { at: 'ankle', to: [44, ANKLE_Y] }, trunk: 17, head: -12, leg: { a: 92, b: -42, foot: 90 }, arm },
    ],
    work: ['quads', 'glutes'],
    wideArms: true,
    handGear: 8.4,
    standing: true,
    balance: (j) => onTrunk(j, 'shoulder', bar[0], bar[1]),
    gear: (j) => [
      { layer: 'back', node: G.floor() },
      { layer: 'back', node: G.plate(onTrunk(j, 'shoulder', bar[0], bar[1])) },
    ],
  };
})();

/** Squat in a Smith machine: the bar on the back moves straight up and down on its rails; feet a little forward. */
export const smithSquat: Move = (() => {
  const arm = { reach: { from: 'shoulder' as const, to: [-0.6, -3.2] as V, bend: [-0.6, 1] as V, shorten: 0.62 } };
  const a: V = [46, ANKLE_Y];
  const j0 = at({ anchor: { at: 'ankle', to: a }, trunk: 4, leg: { a: -4, b: -6, foot: 90 }, arm } as Pose);
  const railX = onTrunk(j0, 'shoulder', -0.6, -3.2)[0];
  return {
    frames: [
      { anchor: { at: 'ankle', to: a }, trunk: 4, head: -4, leg: { a: -4, b: -6, foot: 90 }, arm },
      { anchor: { at: 'ankle', to: a }, trunk: 18, head: -12, leg: { a: 80, b: -26, foot: 90 }, arm },
    ],
    work: ['quads', 'glutes'],
    wideArms: true,
    noHalo: true,
    handGear: 8.4,
    standing: true,
    show: [[railX, 6]],
    gear: (j) => [
      { layer: 'back', node: G.floor() },
      { layer: 'back', node: G.bar([railX - 2.4, FLOOR], [railX - 2.4, 6], 1.8) },
      { layer: 'back', node: G.bar([railX + 2.4, FLOOR], [railX + 2.4, 6], 1.8) },
      { layer: 'back', node: G.plate(onTrunk(j, 'shoulder', -0.6, -3.2)) },
    ],
  };
})();

/** Hack squat: the back on a sled that slides along its rails, the feet on a tilted platform. */
function hackSquat(): Move {
  const trunk = -30;
  const rail = dirOf(180 - trunk); // up the sled, along the back
  // Feet far forward on the platform: the hip slides down the sled until the knee is a little sharper than 90°.
  const ankle: V = [62, ANKLE_Y - 4];
  const toFeet: V = [-23, -27.1];
  const hipTop: V = add(ankle, toFeet);
  const hipAt = (s: number): V => add(hipTop, rail, -s);
  const kneeAngle = 85;
  const d = Math.sqrt(18.5 ** 2 + 17.5 ** 2 - 2 * 18.5 * 17.5 * Math.cos((kneeAngle * Math.PI) / 180));
  // |ankle - hip(s)| = d: hip(s) = hipTop - rail·s, so (ankle - hipTop) + rail·s has length d.
  const D = sub(ankle, hipTop);
  const bq = 2 * (D[0] * rail[0] + D[1] * rail[1]);
  const cq = D[0] ** 2 + D[1] ** 2 - d * d;
  const bottom = (-bq - Math.sqrt(bq * bq - 4 * cq)) / 2;
  const legTo = { reach: { to: ankle, bend: [1, -0.4] as V }, foot: 70 };
  const arm = { reach: { from: 'shoulder' as const, to: [2, 4.5] as V, bend: [-1, 0.3] as V, bendTrunk: true, shorten: 0.85 } };
  const pose = (s: number): Pose => ({ anchor: { at: 'hip', to: hipAt(s) }, trunk, head: -4, leg: legTo, arm });
  return {
    frames: [pose(0), pose(Math.abs(bottom))],
    work: ['quads', 'glutes'],
    wideArms: true,
    show: [add(hipTop, rail, 30), [ankle[0] + 10, FLOOR]],
    gear: (j) => {
      const back = (along: number, out = 6): V => add(add(j.hip, rail, along), [rail[1], -rail[0]], out);
      const railA = add(add(hipTop, rail, -26), [rail[1], -rail[0]], 10);
      const railB = add(add(hipTop, rail, 34), [rail[1], -rail[0]], 10);
      return [
        { layer: 'back', node: G.floor() },
        { layer: 'back', node: G.bar(railA, railB, 2.4) },
        { layer: 'back', node: G.bar(railA, [railA[0], FLOOR], 2.4) },
        { layer: 'back', node: G.bar([railA[0] - 4, FLOOR], [ankle[0] + 12, FLOOR], 2.4) },
        { layer: 'back', node: G.bar(add(ankle, [-2, 4]), [ankle[0] + 2, FLOOR], 2.2) },
        { layer: 'back', node: G.pad(back(-3), back(28), 3) },
        { layer: 'front', node: G.roll(onTrunk(j, 'shoulder', 1.2, 2.2), 2.2) },
        { layer: 'front', node: G.pad(add(ankle, [-2.5, 2.4]), add(ankle, [10, 0.2]), 2.2) },
      ];
    },
  };
}
export const hackSquatMove = hackSquat();

/**
 * Pendulum squat: the back pad and the shoulder pads hang on the rear end of a swing arm whose axle is high up in
 * front, above the feet; the feet far forward on a steep fixed platform. Going down, the pad swings on an arc down
 * and forward towards the feet and leans back a little; the knees bend deep (about 120°), the back stays on the pad.
 */
export const pendulumSquat: Move = (() => {
  const pivot: V = [67, 21];
  const R = 40; // the axle → the shoulder joint
  const [down0, down1] = [8, 32]; // the arm below level, top and bottom, degrees
  const ankle: V = [67, 67];
  const foot = 132; // the platform rises to the front
  const arm = { reach: { from: 'shoulder' as const, to: [2, 4.5] as V, bend: [-1, 0.3] as V, bendTrunk: true, shorten: 0.85 } };
  const pose = (down: number): Pose => {
    const trunk = -20 - (down - down0); // the pad turns with the arm
    const r = (down * Math.PI) / 180;
    return {
      anchor: { at: 'shoulder', to: [pivot[0] - R * Math.cos(r), pivot[1] + R * Math.sin(r)] },
      trunk,
      head: -4,
      leg: { reach: { to: ankle, bend: [1, -0.6] }, foot },
      arm,
    };
  };
  const post = pivot[0] + 6;
  return {
    // Three frames: the shoulders go along the arc, not straight.
    frames: [pose(down0), pose((down0 + down1) / 2), pose(down1)],
    work: ['quads', 'glutes'],
    wideArms: true,
    show: [[pivot[0] - R - 14, pivot[1]], [post + 4, FLOOR], [pivot[0], pivot[1] - 4]],
    gear: (j) => {
      // The arm: from the axle to the top of the back pad and on behind it to the plate holder.
      const padTop = onTrunk(j, 'shoulder', 3, -6.2);
      const away = sub(padTop, pivot);
      const horn = add(padTop, away, 9 / Math.hypot(away[0], away[1]));
      const sole = dirOf(foot);
      const under: V = [sole[1], -sole[0]]; // from the sole down into the platform
      return [
        { layer: 'back', node: G.floor() },
        { layer: 'back', node: G.bar([post, FLOOR], [post, pivot[1] - 3], 2.6) },
        { layer: 'back', node: G.bar([pivot[0] - 30, FLOOR], [post + 4, FLOOR], 2.4) },
        { layer: 'back', node: G.bar(add(ankle, [0, 4]), [ankle[0] - 6, FLOOR], 2.2) },
        { layer: 'back', node: G.plate(horn, 6.5) },
        { layer: 'back', node: G.bar(pivot, horn, 2.4) },
        { layer: 'back', node: G.bar(padTop, onTrunk(j, 'shoulder', -1, -6.2), 2) },
        { layer: 'back', node: G.wheel(pivot, 1.8) },
        { layer: 'back', node: G.pad(onTrunk(j, 'hip', -3, -6), onTrunk(j, 'shoulder', 2, -6), 3) },
        { layer: 'front', node: G.roll(onTrunk(j, 'shoulder', 1.2, 2.2), 2.2) },
        { layer: 'front', node: G.pad(add(add(ankle, sole, -4), under, 2.2), add(add(ankle, sole, 12), under, 2.2), 2.2) },
      ];
    },
  };
})();

/** Belt squat: standing on two platforms, the belt from the hips down to the lever, hands on the rail in front. */
export const beltSquat: Move = (() => {
  const a: V = [46, ANKLE_Y - 7];
  const frames: Pose[] = [
    { anchor: { at: 'ankle', to: a }, trunk: 6, head: -4, leg: { a: 0, b: 0, foot: 90 }, arm: { a: 62, b: 80 } },
    { anchor: { at: 'ankle', to: a }, trunk: 16, head: -10, leg: { a: 88, b: -36, foot: 90 }, arm: { a: 70, b: 86 } },
  ];
  const pivot: V = [18, FLOOR - 3];
  return {
    frames,
    work: ['quads', 'glutes'],
    show: [pivot],
    gear: (j) => [
      { layer: 'back', node: G.floor() },
      { layer: 'back', node: G.pad([a[0] - 10, ANKLE_Y - 3.6], [a[0] + 12, ANKLE_Y - 3.6], 3.4) },
      { layer: 'back', node: G.bar([a[0] - 6, ANKLE_Y - 1], [a[0] - 6, FLOOR], 2) },
      { layer: 'back', node: G.bar([a[0] + 8, ANKLE_Y - 1], [a[0] + 8, FLOOR], 2) },
      { layer: 'back', node: G.cable(add(j.hip, [1, 4]), [j.hip[0] + 1, FLOOR - 4]) },
      ...lever(pivot, [j.hip[0] + 1, Math.min(FLOOR - 4, j.hip[1] + 14)], { plate: 0.4, plateR: 6 }),
      { layer: 'back', node: G.bar([j.hand[0] + 3, FLOOR], [j.hand[0] + 3, j.hand[1]], 2.2) },
      { layer: 'front', node: G.wheel(j.hand, 1.4) },
    ],
  };
})();

/** Leg extension: seated, the roller in front of the ankles, from the knees bent to the legs straight. */
function legExtension(plates: boolean): Move {
  const hip: V = [40, SEAT_HIP_Y - 1];
  const base = { anchor: { at: 'hip' as const, to: hip }, trunk: -16, head: -2, arm: { a: 30, b: 50 } };
  return {
    frames: [
      { ...base, leg: { a: 90, b: -8, foot: 96 } },
      { ...base, leg: { a: 86, b: 82, foot: 165 } },
    ],
    work: ['quads'],
    show: [[hip[0] - 15, 40], [hip[0] + 40, 70]],
    gear: (j) => {
      const roller = add(j.ankle, dirOf(j.angles.shin + 90), 3.6);
      return [
        { layer: 'back', node: G.floor() },
        ...seat(hip, -16, { rest: 24, front: 14 }),
        ...(plates ? [] : tower(hip[0] - 12, 38, { stackX: hip[0] - 17 })),
        { layer: 'back', node: G.bar(j.knee, roller, 2) },
        { layer: 'back', node: G.wheel(j.knee, 1.8) },
        ...(plates ? [{ layer: 'back' as const, node: G.plate(add(j.knee, [-2, -6]), 5.5) }] : []),
        { layer: 'front', node: G.roll(roller, 2.6) },
      ];
    },
  };
}
export const legExtensionMove = legExtension(false);
export const plateLegExtension = legExtension(true);

/** Seated leg curl: legs out in front on the roller, the thigh pad on top; heels pulled down and under. */
export const seatedLegCurl: Move = (() => {
  const hip: V = [36, SEAT_HIP_Y - 2];
  const base = { anchor: { at: 'hip' as const, to: hip }, trunk: -14, head: -2, arm: { a: 40, b: 70 } };
  return {
    frames: [
      { ...base, leg: { a: 88, b: 84, foot: 168 } },
      { ...base, leg: { a: 90, b: -12, foot: 92 } },
    ],
    work: ['hams'],
    show: [[hip[0] - 14, 40], [hip[0] + 42, 70]],
    gear: (j) => {
      const roller = add(j.ankle, dirOf(j.angles.shin - 90), 3.4);
      return [
        { layer: 'back', node: G.floor() },
        ...seat(hip, -14, { rest: 24, front: 13 }),
        ...tower(hip[0] - 12, 38, { stackX: hip[0] - 17 }),
        { layer: 'back', node: G.bar(j.knee, roller, 2) },
        { layer: 'back', node: G.wheel(j.knee, 1.8) },
        { layer: 'front', node: G.pad(add(hip, [9, -6.2]), add(hip, [19, -6.2]), 2.6) },
        { layer: 'front', node: G.roll(roller, 2.6) },
      ];
    },
  };
})();

/** Lying leg curl: face down on the bench, the roller on top, on the backs of the ankles, heels up towards the buttocks. */
export const lyingLegCurl: Move = (() => {
  const hip: V = [48, 68];
  const base = { anchor: { at: 'hip' as const, to: hip }, trunk: 84, head: -30, arm: { a: 36, b: 40 } };
  return {
    frames: [
      { ...base, leg: { a: -92, b: -92, foot: -6 } },
      { ...base, leg: { a: -94, b: -196, foot: -100 } },
    ],
    work: ['hams'],
    show: [[hip[0] - 34, FLOOR], [hip[0] + 30, FLOOR]],
    gear: (j) => {
      const roller = add(j.ankle, dirOf(j.angles.shin - 90), 3.3);
      return [
        { layer: 'back', node: G.floor() },
        { layer: 'back', node: G.pad(add(hip, [-14, 5.2]), add(hip, [1, 4.4]), 3) },
        { layer: 'back', node: G.pad(add(hip, [1, 4.4]), add(hip, [26, 7.4]), 3) },
        { layer: 'back', node: G.bar(add(hip, [-6, 8]), [hip[0] - 6, FLOOR], 2.2) },
        { layer: 'back', node: G.bar(add(hip, [20, 10]), [hip[0] + 20, FLOOR], 2.2) },
        { layer: 'back', node: G.bar(j.knee, roller, 2) },
        { layer: 'back', node: G.wheel(j.knee, 1.8) },
        { layer: 'front', node: G.roll(roller, 2.6) },
      ];
    },
  };
})();

/** Standing leg curl in a lever machine: chest on the pad, one heel up behind towards the buttock. */
export const standingLegCurl: Move = (() => {
  const a: V = [46, ANKLE_Y];
  const base = { anchor: { at: 'farAnkle' as const, to: a }, trunk: 14, head: -8, farLeg: { a: 0, b: 0, foot: 90 }, arm: { a: 56, b: 76 } };
  return {
    frames: [
      { ...base, leg: { a: 8, b: 4, foot: 96 } },
      { ...base, leg: { a: 14, b: -106, foot: -20 } },
    ],
    work: ['hams'],
    show: [[a[0] + 26, 40]],
    gear: (j) => {
      const roller = add(j.ankle, dirOf(j.angles.shin - 90), 3.2);
      return [
        { layer: 'back', node: G.floor() },
        { layer: 'back', node: G.bar([a[0] + 14, FLOOR], [a[0] + 14, 44], 2.4) },
        { layer: 'mid', node: G.pad(onTrunk(j, 'shoulder', -2, 6.8), onTrunk(j, 'shoulder', -15, 6.8), 3) },
        ...lever(add(j.knee, [0, 0]), roller),
        { layer: 'back', node: G.bar(j.knee, [a[0] + 14, j.knee[1]], 1.8) },
        { layer: 'back', node: G.plate([a[0] + 20, j.knee[1] + 4], 6) },
        { layer: 'front', node: G.roll(roller, 2.4) },
      ];
    },
  };
})();

/** Hip thrust: the upper back on a bench, the bar on the hips; from the hips low to a straight line knees–shoulders. */
function hipThrust(machine: boolean): Move {
  const shoulder: V = [30, 71.5];
  const ankle: V = [68, ANKLE_Y];
  const legs = { reach: { to: ankle, bend: [0.3, -1] as V }, foot: 90 };
  const arm = { reach: { from: 'hip' as const, to: [5, 6.5] as V, bend: [0, -1] as V, bendTrunk: true } };
  return {
    frames: [
      { anchor: { at: 'shoulder', to: shoulder }, trunk: -64, head: 18, leg: legs, arm },
      { anchor: { at: 'shoulder', to: shoulder }, trunk: -92, head: 30, leg: legs, arm },
    ],
    work: ['glutes', 'hams'],
    wideArms: true,
    handGear: machine ? 2 : 8.4,
    show: [[shoulder[0] - 10, FLOOR], [ankle[0] + 8, FLOOR]],
    gear: (j) => {
      const bar = onTrunk(j, 'hip', 2, 6.5);
      return [
        { layer: 'back', node: G.floor() },
        { layer: 'back', node: G.pad([shoulder[0] - 16, shoulder[1] + 4.6], [shoulder[0] + 1, shoulder[1] + 4.6], 3) },
        { layer: 'back', node: G.bar([shoulder[0] - 8, shoulder[1] + 7], [shoulder[0] - 8, FLOOR], 2.2) },
        ...(machine
          ? [
              { layer: 'front' as const, node: G.pad(add(bar, [-5, -1.6]), add(bar, [5, -1.6]), 2.6) },
              ...lever([ankle[0] + 10, FLOOR - 4], add(bar, [0, -2]), { plate: 0.35, plateR: 6 }),
            ]
          : [{ layer: 'back' as const, node: G.plate(bar) }]),
      ];
    },
  };
}
export const hipThrustMove = hipThrust(false);
export const plateHipThrust = hipThrust(true);

/** Bulgarian split squat: the back foot on a bench, dumbbells in the hands, down on the front leg. */
export const bulgarianSplitSquat: Move = (() => {
  const a: V = [56, ANKLE_Y];
  const backFoot = (j: Joints) => j.ankle2;
  const far = (to: V, foot: number) => ({ reach: { to, bend: [0.3, 1] as V }, foot });
  const benchTop = 74.5;
  return {
    frames: [
      { anchor: { at: 'ankle', to: a }, trunk: 4, head: -2, leg: { a: -3, b: -3, foot: 90 }, farLeg: far([a[0] - 26, benchTop - 3], -34), arm: { a: 2, b: 2 } },
      { anchor: { at: 'ankle', to: a }, trunk: 14, head: -10, leg: { a: 76, b: -22, foot: 90 }, farLeg: far([a[0] - 26, benchTop - 3], -100), arm: { a: 4, b: 4 } },
    ],
    work: ['quads', 'glutes'],
    handGear: 3.3,
    show: [[a[0] - 34, FLOOR]],
    gear: (j) => [
      { layer: 'back', node: G.floor() },
      { layer: 'back', node: G.pad([backFoot(j)[0] - 9, benchTop], [backFoot(j)[0] + 4, benchTop], 3) },
      { layer: 'back', node: G.bar([backFoot(j)[0] - 3, benchTop + 3], [backFoot(j)[0] - 3, FLOOR], 2.2) },
      { layer: 'back', node: G.dumbbell(j.hand2) },
      { layer: 'front', node: G.dumbbell(j.hand) },
    ],
  };
})();

/** Reverse lunge: from standing, the back leg steps back and the back knee goes down near the floor. */
function reverseLunge(barbell: boolean): Move {
  const a: V = [54, ANKLE_Y];
  const arm = barbell ? { reach: { from: 'shoulder' as const, to: [-0.6, -3.2] as V, bend: [-0.6, 1] as V, shorten: 0.62 } } : { a: 2, b: 2 };
  return {
    frames: [
      { anchor: { at: 'ankle', to: a }, trunk: 4, head: -2, leg: { a: 0, b: 0, foot: 90 }, farLeg: { reach: { to: [a[0] - 1, ANKLE_Y], bend: [1, 0] }, foot: 90 }, arm },
      { anchor: { at: 'ankle', to: a }, trunk: 8, head: -6, leg: { a: 84, b: -8, foot: 90 }, farLeg: { reach: { to: [a[0] - 34, ANKLE_Y - 3.5], bend: [0, 1] }, foot: 30 }, arm },
    ],
    work: ['quads', 'glutes'],
    wideArms: barbell,
    noHalo: barbell,
    handGear: barbell ? 8.4 : 3.3,
    show: [[a[0] - 40, FLOOR]],
    gear: (j) => [
      { layer: 'back', node: G.floor() },
      ...(barbell
        ? [{ layer: 'back' as const, node: G.plate(onTrunk(j, 'shoulder', -0.6, -3.2)) }]
        : [
            { layer: 'back' as const, node: G.dumbbell(j.hand2) },
            { layer: 'front' as const, node: G.dumbbell(j.hand) },
          ]),
    ],
  };
}
export const reverseLungeMove = reverseLunge(false);
export const plateLunge = reverseLunge(true);

/** Cable kickback: leaning on the machine, the cuffed leg kicks back and up. */
export const cableKickback: Move = (() => {
  const a: V = [48, ANKLE_Y];
  const pulley: V = [66, FLOOR - 4];
  const base = { anchor: { at: 'farAnkle' as const, to: a }, trunk: 26, head: -12, farLeg: { a: 4, b: 2, foot: 90 }, arm: { a: 76, b: 84 } };
  return {
    frames: [
      { ...base, leg: { a: 10, b: 0, foot: 100 } },
      { ...base, leg: { a: -46, b: -58, foot: 60 } },
    ],
    work: ['glutes', 'hams'],
    show: [pulley, [pulley[0] + 3, 30]],
    gear: (j) => [
      { layer: 'back', node: G.floor() },
      { layer: 'back', node: G.bar([pulley[0] + 3, FLOOR], [pulley[0] + 3, 26], 2.4) },
      { layer: 'back', node: G.stack(pulley[0] + 8, 74, 6, 8) },
      { layer: 'back', node: G.wheel(pulley) },
      { layer: 'back', node: G.cable(pulley, j.ankle) },
      { layer: 'back', node: G.bar([j.hand[0] - 1, j.hand[1]], [pulley[0] + 3, j.hand[1]], 1.6) },
    ],
  };
})();

/** Standing calf raise: shoulders under the pads, the balls of the feet on the block; heels from low to high. */
export const standingCalfRaise: Move = (() => {
  const toe: V = [52, ANKLE_Y - 5];
  const base = { anchor: { at: 'toe' as const, to: toe }, trunk: 2, head: -2, arm: { reach: { from: 'shoulder' as const, to: [2.5, 3.5] as V, bend: [0, 1] as V, shorten: 0.6 } } };
  return {
    frames: [
      { ...base, leg: { a: 0, b: 0, foot: 112 } },
      { ...base, leg: { a: 0, b: 0, foot: 52 } },
    ],
    work: ['calves'],
    wideArms: true,
    show: [[toe[0] - 22, 20]],
    gear: (j) => [
      { layer: 'back', node: G.floor() },
      { layer: 'back', node: G.pad([toe[0] - 3, toe[1] + 2.4], [toe[0] + 6, toe[1] + 2.4], 2.6) },
      { layer: 'back', node: G.bar([toe[0] + 2, toe[1] + 5], [toe[0] + 2, FLOOR], 3) },
      { layer: 'back', node: G.bar([j.shoulder[0] - 14, FLOOR], [j.shoulder[0] - 14, 16], 2.4) },
      { layer: 'back', node: G.bar([j.shoulder[0] - 14, j.shoulder[1] - 4.5], add(j.shoulder, [3, -4.5]), 2) },
      { layer: 'front', node: G.roll(add(j.shoulder, [0.5, -3.2]), 2.4) },
    ],
  };
})();

/** Seated calf raise: knees under the pad, the balls of the feet on the block; heels up lifts the knees. */
export const seatedCalfRaise: Move = (() => {
  const hip: V = [38, SEAT_HIP_Y - 1];
  const toe: V = [62, ANKLE_Y - 5];
  const legTo = (foot: number) => {
    const fd = dirOf(foot);
    return { reach: { to: [toe[0] - fd[0] * 7.2, toe[1] - fd[1] * 7.2] as V, bend: [0.4, -1] as V }, foot };
  };
  const base = { anchor: { at: 'hip' as const, to: hip }, trunk: 4, head: -4, arm: { a: 40, b: 60 } };
  return {
    frames: [
      { ...base, leg: legTo(112) },
      { ...base, leg: legTo(58) },
    ],
    work: ['calves'],
    gear: (j) => [
      { layer: 'back', node: G.floor() },
      ...seat(hip, 4, { front: 10 }),
      { layer: 'back', node: G.pad([toe[0] - 3, toe[1] + 2.4], [toe[0] + 6, toe[1] + 2.4], 2.6) },
      { layer: 'back', node: G.bar([toe[0] + 2, toe[1] + 5], [toe[0] + 2, FLOOR], 3) },
      { layer: 'front', node: G.pad(add(j.knee, [-6, -3.6]), add(j.knee, [4, -3.6]), 2.6) },
      ...lever(add(j.knee, [-22, -1]), add(j.knee, [-4, -5]), { plate: 0.2, plateR: 6 }),
    ],
  };
})();
