// Arms: curls and triceps. Checked against the photos in scripts/figure-refs.json.
import { ANKLE_Y, FLOOR, G, add, at, dirOf, feetAt, lever, onTrunk, seat, SEAT_HIP_Y, tower, type Gear, type Joints, type Move, type Pose, type V } from './kit';

const standing = (x = 48) => ({ anchor: { at: 'ankle' as const, to: [x, ANKLE_Y] as V }, leg: { a: 0, b: 0, foot: 90 } });

/** Standing curl: elbows at the sides, from the arms hanging to the hands at the shoulders. */
function curl(o: { hold: 'dumbbell' | 'hammer' | 'bar' | 'cable'; behind?: boolean }): Move {
  const upper = o.behind ? -26 : o.hold === 'cable' ? 6 : 3;
  const upperEnd = o.behind ? -22 : 9;
  const pulley: V = o.behind ? [26, FLOOR - 4] : [70, FLOOR - 4];
  return {
    frames: [
      { ...standing(), trunk: o.behind ? 6 : 0, arm: { a: upper, b: upper + 4 } },
      { ...standing(), trunk: o.behind ? 4 : -2, arm: { a: upperEnd, b: upperEnd + 140 } },
    ],
    work: ['biceps', 'forearm'],
    standing: true,
    handGear: o.hold === 'bar' ? 5.6 : 3.3,
    show: o.hold === 'cable' ? [pulley] : [],
    gear: (j) => {
      const across = dirOf(j.angles.fore + 90);
      const g: Gear[] = [{ layer: 'back', node: G.floor() }];
      if (o.hold === 'dumbbell') g.push({ layer: 'back', node: G.dumbbell(j.hand2) }, { layer: 'front', node: G.dumbbell(j.hand) });
      if (o.hold === 'hammer') g.push({ layer: 'front', node: G.dumbbellSide(j.hand, across) });
      if (o.hold === 'bar') g.push({ layer: 'back', node: G.plate(j.hand, 5.6) });
      if (o.hold === 'cable')
        g.push(
          { layer: 'back', node: G.bar([pulley[0] + (o.behind ? -3 : 3), FLOOR], [pulley[0] + (o.behind ? -3 : 3), 24], 2.4) },
          { layer: 'back', node: G.wheel(pulley) },
          { layer: 'back', node: G.cable(pulley, j.hand) },
          { layer: 'front', node: G.wheel(j.hand, 1.3) },
        );
      return g;
    },
  };
}
export const dumbbellCurl = curl({ hold: 'dumbbell' });
export const hammerCurl = curl({ hold: 'hammer' });
export const barbellCurl = curl({ hold: 'bar' });
export const cableCurl = curl({ hold: 'cable' });
export const bayesianCurl = curl({ hold: 'cable', behind: true });

/** Incline dumbbell curl: lying back on an incline bench, arms hanging straight down behind the body. */
export const inclineCurl: Move = (() => {
  const hip: V = [46, SEAT_HIP_Y];
  const trunk = -48;
  const base = { anchor: { at: 'hip' as const, to: hip }, trunk, head: -14, leg: feetAt(hip[0] + 20) };
  return {
    frames: [
      { ...base, arm: { a: -2, b: 0 } },
      { ...base, arm: { a: -6, b: 134 } },
    ],
    work: ['biceps'],
    standing: true,
    handGear: 3.3,
    gear: (j) => [
      { layer: 'back', node: G.floor() },
      ...seat(hip, trunk, { rest: 31, back: 4, front: 8 }),
      { layer: 'back', node: G.dumbbell(j.hand2) },
      { layer: 'front', node: G.dumbbell(j.hand) },
    ],
  };
})();

/** Preacher curl: the upper arms on the sloped pad; `machine` — a lever with a stack instead of the bar. */
function preacher(machine: boolean): Move {
  const hip: V = [40, SEAT_HIP_Y - 2];
  const trunk = 16;
  const base = { anchor: { at: 'hip' as const, to: hip }, trunk, head: -12, leg: feetAt(hip[0] + 16) };
  const upper = 52;
  return {
    frames: [
      { ...base, arm: { a: upper, b: upper + 6 } },
      { ...base, arm: { a: upper, b: upper + 128 } },
    ],
    work: ['biceps'],
    standing: true,
    handGear: machine ? 2 : 5.6,
    show: machine ? [[hip[0] + 34, 40]] : [],
    gear: (j) => {
      // The pad under the upper arm, sloping down to the front.
      const pa = add(j.elbow, dirOf(upper + 90), 2.6);
      const pb = add(pa, dirOf(upper + 180), 12);
      return [
        { layer: 'back', node: G.floor() },
        ...seat(hip, trunk, { front: 6 }),
        { layer: 'back', node: G.pad(pb, add(pa, dirOf(upper), 1.5), 3) },
        { layer: 'back', node: G.bar(add(pa, [-2, 3]), [pa[0] - 2, FLOOR], 2.2) },
        ...(machine
          ? [
              ...tower(j.elbow[0] + 14, 36, { stackX: j.elbow[0] + 19 }),
              ...lever(j.elbow, j.hand),
              { layer: 'front' as const, node: G.bar(add(j.hand, [-1.6, 0]), add(j.hand, [1.6, 0]), 1.6) },
            ]
          : [{ layer: 'back' as const, node: G.plate(j.hand, 5.6) }]),
      ];
    },
  };
}
export const preacherCurl = preacher(false);
export const machineCurl = preacher(true);

/** Triceps pushdown: standing at a high pulley, elbows at the sides, the forearms from up to straight down. */
export const tricepsPushdown: Move = (() => {
  const base = { ...standing(44), trunk: 8, head: -8 };
  const pulley: V = [62, 12];
  return {
    frames: [
      { ...base, arm: { a: 4, b: 112 } },
      { ...base, arm: { a: 2, b: 4 } },
    ],
    work: ['triceps'],
    standing: true,
    show: [pulley, [pulley[0] + 4, FLOOR]],
    gear: (j) => [
      { layer: 'back', node: G.floor() },
      { layer: 'back', node: G.bar([pulley[0] + 3, FLOOR], [pulley[0] + 3, pulley[1] - 4], 2.4) },
      { layer: 'back', node: G.stack(pulley[0] + 8, 74, 6, 8) },
      { layer: 'back', node: G.wheel(pulley) },
      { layer: 'back', node: G.cable(pulley, j.hand) },
      { layer: 'front', node: G.bar(add(j.hand, [-1.8, 0.3]), add(j.hand, [1.8, -0.3]), 1.6) },
    ],
  };
})();

/**
 * Overhead rope extension: facing away from the stack, leaning forward; the pulley at the height of the pelvis behind,
 * the rope runs up along the back over the shoulders to the hands; the hands from behind the head to straight.
 */
export const overheadTriceps: Move = (() => {
  const base = { anchor: { at: 'farAnkle' as const, to: [40, ANKLE_Y] as V }, trunk: 34, head: -14, leg: { a: 18, b: -6, foot: 90 }, farLeg: { a: -12, b: -16, foot: 90 } };
  const j0 = at({ ...base, arm: { a: 0 } } as Pose);
  const pulley: V = [12, onTrunk(j0, 'hip', 3, -6.2)[1]];
  return {
    frames: [
      { ...base, arm: { a: 148, b: 148 + 140 } },
      { ...base, arm: { a: 150, b: 150 } },
    ],
    work: ['triceps'],
    show: [pulley, [pulley[0] - 3, FLOOR], [pulley[0] - 3, pulley[1] - 8]],
    gear: (j) => {
      // The rope lies along the back: from the hands over the shoulders down to the pelvis, then straight back to the pulley.
      const onBack = onTrunk(j, 'shoulder', -1, -6.6);
      const atPelvis = onTrunk(j, 'hip', 3, -6.2);
      return [
        { layer: 'back', node: G.floor() },
        { layer: 'back', node: G.bar([pulley[0] - 3, FLOOR], [pulley[0] - 3, pulley[1] - 8], 2.4) },
        { layer: 'back', node: G.stack(pulley[0] - 8, 74, 6, 8) },
        { layer: 'back', node: G.wheel(pulley) },
        { layer: 'back', node: G.cable(pulley, atPelvis) },
        { layer: 'front', node: G.cable(atPelvis, onBack) },
        { layer: 'front', node: G.cable(onBack, j.hand) },
      ];
    },
  };
})();

/** Lying dumbbell extension: on a flat bench, upper arms upright; the forearms from beside the head to straight. */
export const lyingTricepsExtension: Move = (() => {
  const base = { anchor: { at: 'hip' as const, to: [62, 70.6] as V }, trunk: -90, head: -6, leg: { a: 88, b: -2, foot: 90 } };
  return {
    frames: [
      { ...base, arm: { a: 176, b: 176 + 128 } },
      { ...base, arm: { a: 176, b: 178 } },
    ],
    work: ['triceps'],
    handGear: 3.3,
    show: [[22, 76], [68, 76]],
    gear: (j) => [
      { layer: 'back', node: G.floor() },
      { layer: 'back', node: G.bar([32, 78.6], [32, FLOOR]) },
      { layer: 'back', node: G.bar([64, 78.6], [64, FLOOR]) },
      { layer: 'mid', node: G.pad([22, 75.6], [68, 75.6], 3) },
      { layer: 'front', node: G.dumbbell(j.hand) },
    ],
  };
})();

/** Seated dip machine (triceps press): hands on the handles beside the chest, pressed down to straight arms. */
function tricepsPress(plates: boolean): Move {
  const hip: V = [42, SEAT_HIP_Y];
  const trunk = 2;
  const base = { anchor: { at: 'hip' as const, to: hip }, trunk, head: -2, leg: feetAt(hip[0] + 18) };
  const j0 = at({ ...base, arm: { a: 0 } } as Pose);
  const top = onTrunk(j0, 'shoulder', -6, 2.5);
  const bottom = onTrunk(j0, 'shoulder', -24.5, 3);
  const pivot: V = [j0.hip[0] - 14, j0.hip[1] - 10];
  return {
    frames: [
      { ...base, arm: { reach: { to: top, bend: [-1, 0.2] } } },
      { ...base, arm: { reach: { to: bottom, bend: [-1, 0] } } },
    ],
    work: ['triceps', 'chest'],
    standing: true,
    show: [[hip[0] - 20, 40]],
    gear: (j: Joints) => [
      { layer: 'back', node: G.floor() },
      ...seat(hip, trunk, { rest: 26 }),
      ...(plates ? [] : tower(hip[0] - 15, 40, { stackX: hip[0] - 20 })),
      ...lever(pivot, j.hand, plates ? { plate: 0.5, plateR: 5.6 } : {}),
      { layer: 'front', node: G.bar(add(j.hand, [-1.8, 0]), add(j.hand, [1.8, 0]), 1.6) },
    ],
  };
}
export const stackTricepsPress = tricepsPress(false);
export const plateTriceps = tricepsPress(true);
