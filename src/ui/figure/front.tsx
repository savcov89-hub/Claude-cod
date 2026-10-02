// A person seen from the front, for movements out to the sides (lateral raises, hip abduction and adduction),
// which the side view cannot show. Same scale as figure/rig.ts; both sides mirror each other.
import { G, capsule, type Gear, type Muscle } from './draw';
import { FLOOR, add, lerp, type V } from './rig';

const ANKLE_Y = FLOOR - 3;
const DEG = Math.PI / 180;

export interface FrontPose {
  /** Middle of the pelvis at the height of the hip joints. */
  center: V;
  /** Sitting: thighs come towards the viewer (seen short), shins hang down to the floor. */
  seated?: boolean;
  /**
   * Arms: angle out from hanging down (0) to straight up (180); the forearm turns on by `bend` more. Or, for arms
   * that come forward towards the viewer (flies), where the hand and the elbow are seen — from the shoulder, for the
   * arm on the viewer's right (the left one mirrors it); negative x is towards the middle.
   */
  arm: FrontArm;
  /** The other arm (on the viewer's left) when it does something else. */
  arm2?: FrontArm;
  /** Shoulders raised (a shrug), in units; the head stays. */
  shrug?: number;
  /** Legs: angle out from straight down (standing) or from straight ahead (sitting). */
  leg: { out: number };
}

export interface FrontJoints {
  center: V;
  shoulder: [V, V];
  elbow: [V, V];
  hand: [V, V];
  hip: [V, V];
  knee: [V, V];
  ankle: [V, V];
  head: V;
  neck: V;
  seated: boolean;
  shrug: number;
}

export interface FrontArm {
  out: number;
  bend?: number;
  foreK?: number;
  hand?: V;
  elbow?: V;
}

const dirOut = (out: number, side: number): V => [side * Math.sin(out * DEG), Math.cos(out * DEG)];
const mirror = (v: V, side: number): V => [v[0] * side, v[1]];

export function frontJoints(p: FrontPose): FrontJoints {
  const c = p.center;
  const sides = [-1, 1] as const;
  const shoulder = sides.map((s) => add(c, [s * 8.4, -23.6 - (p.shrug ?? 0)])) as [V, V];
  const armOf = (i: number) => (i === 0 && p.arm2 ? p.arm2 : p.arm);
  const elbow = sides.map((s, i) => {
    const a = armOf(i);
    return a.elbow ? add(shoulder[i], mirror(a.elbow, s)) : add(shoulder[i], dirOut(a.out, s), 13.5);
  }) as [V, V];
  const hand = sides.map((s, i) => {
    const a = armOf(i);
    return a.hand ? add(shoulder[i], mirror(a.hand, s)) : add(elbow[i], dirOut(a.out + (a.bend ?? 0), s), 12 * (a.foreK ?? 1));
  }) as [V, V];
  const hip = sides.map((s) => add(c, [s * 4.4, 0])) as [V, V];
  const knee = sides.map((s, i) =>
    p.seated ? add(hip[i], [s * 18.5 * Math.sin(p.leg.out * DEG), 2.2]) : add(hip[i], dirOut(p.leg.out, s), 18.5),
  ) as [V, V];
  const ankle = sides.map((s, i) => (p.seated ? ([knee[i][0], ANKLE_Y] as V) : add(knee[i], dirOut(p.leg.out, s), 17.5))) as [V, V];
  return { center: c, shoulder, elbow, hand, hip, knee, ankle, neck: add(c, [0, -26.2]), head: add(c, [0, -31.6]), seated: !!p.seated, shrug: p.shrug ?? 0 };
}

const lerpV = (a: V, b: V, t: number): V => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
function mixArm(a: FrontArm, b: FrontArm, t: number): FrontArm {
  return {
    out: lerp(a.out, b.out, t),
    bend: lerp(a.bend ?? 0, b.bend ?? 0, t),
    foreK: lerp(a.foreK ?? 1, b.foreK ?? 1, t),
    hand: a.hand && b.hand ? lerpV(a.hand, b.hand, t) : b.hand,
    elbow: a.elbow && b.elbow ? lerpV(a.elbow, b.elbow, t) : b.elbow,
  };
}

export function mixFront(a: FrontPose, b: FrontPose, t: number): FrontPose {
  return {
    center: [lerp(a.center[0], b.center[0], t), lerp(a.center[1], b.center[1], t)],
    seated: b.seated,
    arm: mixArm(a.arm, b.arm, t),
    leg: { out: lerp(a.leg.out, b.leg.out, t) },
    arm2: a.arm2 && b.arm2 ? mixArm(a.arm2, b.arm2, t) : b.arm2,
    shrug: lerp(a.shrug ?? 0, b.shrug ?? 0, t),
  };
}

const f = (n: number) => n.toFixed(2);
function Seg({ a, b, ra, rb, cls }: { a: V; b: V; ra: number; rb: number; cls: string }) {
  return <path d={capsule(a, b, ra, rb)} className={cls} />;
}

/** The person from the front with the working muscles lit (delts, adductors, abductors). */
export function PersonFront({ j, work = [], gear = [] }: { j: FrontJoints; work?: Muscle[]; gear?: Gear[] }) {
  const c = j.center;
  const layer = (l: Gear['layer']) => gear.filter((g) => g.layer === l).map((g, i) => <g key={l + i}>{g.node}</g>);
  // Trunk outline: shoulders, chest, waist, hips (half-widths), from the shoulders down.
  const half = [
    [-24.6, 7.2],
    [-23.2, 10.2],
    [-17, 9.6],
    [-10, 7.2],
    [-4, 7.6],
    [1.5, 8.4],
    [3.2, 6],
  ];
  // A shrug lifts the top of the trunk (the shoulders and the trapezius) with the shoulders.
  const lift = (y: number) => (y < -20 ? j.shrug : 0);
  const right = half.map(([y, x]) => [c[0] + x, c[1] + y - lift(y)] as V);
  const left = half.map(([y, x]) => [c[0] - x, c[1] + y - lift(y)] as V).reverse();
  const trunk = [...right, ...left].map((q) => f(q[0]) + ',' + f(q[1])).join(' ');
  const delts = work.includes('delts');
  return (
    <g>
      {layer('back')}
      {[0, 1].map((i) => (
        <g key={'leg' + i}>
          <Seg a={j.hip[i]} b={j.knee[i]} ra={4.6} rb={3.6} cls="fg-body" />
          <Seg a={j.knee[i]} b={j.ankle[i]} ra={3.2} rb={2.1} cls="fg-body" />
          <ellipse cx={f(j.ankle[i][0])} cy={f(j.ankle[i][1] + 1.6)} rx={2.4} ry={1.8} className="fg-body" />
          {work.includes('adductors') && (
            <circle cx={f(j.knee[i][0] - (i ? 1 : -1) * 2)} cy={f(j.knee[i][1] - 1)} r={1.9} className="fg-work" />
          )}
          {work.includes('glutes') && <circle cx={f(j.hip[i][0] + (i ? 1 : -1) * 3.6)} cy={f(j.hip[i][1] - 1.5)} r={2.4} className="fg-work" />}
        </g>
      ))}
      <polygon points={trunk} className="fg-body" strokeLinejoin="round" />
      {work.includes('chest') &&
        [-1, 1].map((sd) => <ellipse key={'ch' + sd} cx={f(c[0] + sd * 4.3)} cy={f(c[1] - 18.6)} rx={3.7} ry={2.7} className="fg-work" />)}
      <Seg a={j.neck} b={[j.neck[0], j.neck[1] - 3]} ra={2.6} rb={2.4} cls="fg-body" />
      <circle cx={f(j.head[0])} cy={f(j.head[1])} r={5.3} className="fg-body" />
      {layer('mid')}
      {[0, 1].map((i) => (
        <g key={'arm' + i}>
          <Seg a={j.shoulder[i]} b={j.elbow[i]} ra={3.0 + 0.9} rb={2.3 + 0.9} cls="fg-halo" />
          <Seg a={j.elbow[i]} b={j.hand[i]} ra={2.3 + 0.9} rb={1.7 + 0.9} cls="fg-halo" />
          <Seg a={j.shoulder[i]} b={j.elbow[i]} ra={3.0} rb={2.3} cls="fg-body" />
          <Seg a={j.elbow[i]} b={j.hand[i]} ra={2.3} rb={1.7} cls="fg-body" />
          <circle cx={f(j.hand[i][0])} cy={f(j.hand[i][1])} r={1.9} className="fg-body" />
          {delts && <circle cx={f(j.shoulder[i][0])} cy={f(j.shoulder[i][1] + 0.6)} r={3.1} className="fg-work" />}
          {work.includes('upperBack') && (
            <path d={capsule(add(j.neck, [(i ? 1 : -1) * 2.2, 1.2]), add(j.shoulder[i], [(i ? -1 : 1) * 2.2, -1.6]), 1.8, 1.6)} className="fg-work" />
          )}
        </g>
      ))}
      {layer('front')}
    </g>
  );
}

export interface FrontMove {
  view: 'front';
  frames: FrontPose[];
  work: Muscle[];
  gear: (j: FrontJoints) => Gear[];
  show?: V[];
  /** Size of what the hands hold, kept in the picture. */
  handGear?: number;
}

// ---------- exercises ----------
/** Lateral raise with dumbbells: arms from the sides up to shoulder height, elbows soft. */
export const lateralRaise: FrontMove = {
  view: 'front',
  frames: [
    { center: [50, ANKLE_Y - 36], arm: { out: 8, bend: 4 }, leg: { out: 4 } },
    { center: [50, ANKLE_Y - 36], arm: { out: 88, bend: 8 }, leg: { out: 4 } },
  ],
  work: ['delts'],
  gear: (j) => [
    { layer: 'back', node: G.floor() },
    { layer: 'front', node: G.dumbbell(j.hand[0]) },
    { layer: 'front', node: G.dumbbell(j.hand[1]) },
  ],
};

/** Lateral raise in a machine: seated, the pads on the outside of the elbows push them up to the sides. */
export const machineLateralRaise: FrontMove = {
  view: 'front',
  frames: [
    { center: [50, ANKLE_Y - 19.7], seated: true, arm: { out: 10, bend: 0, foreK: 0.22 }, leg: { out: 12 } },
    { center: [50, ANKLE_Y - 19.7], seated: true, arm: { out: 86, bend: 0, foreK: 0.22 }, leg: { out: 12 } },
  ],
  work: ['delts'],
  show: [[50, 18]],
  gear: (j) => [
    { layer: 'back', node: G.floor() },
    { layer: 'back', node: G.pad([j.center[0] - 13, j.center[1] + 4.6], [j.center[0] + 13, j.center[1] + 4.6], 3) },
    { layer: 'back', node: G.bar([j.center[0], j.center[1] + 7.5], [j.center[0], FLOOR], 2.2) },
    { layer: 'back', node: G.pad([j.center[0] - 9, j.center[1] - 30], [j.center[0] + 9, j.center[1] - 30], 28) },
    { layer: 'front', node: G.bar(j.shoulder[0], j.elbow[0], 1.4) },
    { layer: 'front', node: G.bar(j.shoulder[1], j.elbow[1], 1.4) },
    { layer: 'front', node: G.roll(j.elbow[0], 2.4) },
    { layer: 'front', node: G.roll(j.elbow[1], 2.4) },
  ],
};

/** Lateral raise on a low cable: standing beside the stack, the far arm's cable crosses the body up and out. */
export const cableLateralRaise: FrontMove = {
  view: 'front',
  frames: [
    { center: [52, ANKLE_Y - 36], arm: { out: 6, bend: 2 }, arm2: { out: 4, bend: 2 }, leg: { out: 4 } },
    { center: [52, ANKLE_Y - 36], arm: { out: 86, bend: 6 }, arm2: { out: 4, bend: 2 }, leg: { out: 4 } },
  ],
  work: ['delts'],
  show: [[28, FLOOR]],
  gear: (j) => [
    { layer: 'back', node: G.floor() },
    { layer: 'back', node: G.bar([26, FLOOR], [26, 20], 2.4) },
    { layer: 'back', node: G.wheel([30, FLOOR - 4]) },
    { layer: 'back', node: G.cable([30, FLOOR - 4], j.hand[1]) },
    { layer: 'front', node: G.wheel(j.hand[1], 1.4) },
  ],
};

/** Hip abduction / adduction machine: seated, pads at the knees; knees out (abduction) or in (adduction). */
function hips(out: boolean): FrontMove {
  const center: V = [50, ANKLE_Y - 19.7];
  const wide = 34;
  const narrow = 4;
  return {
    view: 'front',
    frames: [
      { center, seated: true, arm: { out: 2, bend: -14, foreK: 0.75 }, leg: { out: out ? narrow : wide } },
      { center, seated: true, arm: { out: 2, bend: -14, foreK: 0.75 }, leg: { out: out ? wide : narrow } },
    ],
    work: out ? ['glutes'] : ['adductors'],
    show: [[50, 30]],
    gear: (j) => [
      { layer: 'back', node: G.floor() },
      { layer: 'back', node: G.pad([j.center[0] - 13, j.center[1] + 4.6], [j.center[0] + 13, j.center[1] + 4.6], 3) },
      { layer: 'back', node: G.bar([j.center[0], j.center[1] + 7.5], [j.center[0], FLOOR], 2.2) },
      { layer: 'back', node: G.pad([j.center[0] - 9, j.center[1] - 30], [j.center[0] + 9, j.center[1] - 30], 28) },
      ...[0, 1].map((i) => ({
        layer: 'front' as const,
        node: G.pad(add(j.knee[i], [(i ? 1 : -1) * (out ? 4.8 : -4.8), -4]), add(j.knee[i], [(i ? 1 : -1) * (out ? 4.8 : -4.8), 5]), 2.4),
      })),
    ],
  };
}
export const hipAbduction = hips(true);
export const hipAdduction = hips(false);

/** Standing cable crossover from the front: the hands from high and wide down to cross in front of the hips. */
export const cableCrossover: FrontMove = {
  view: 'front',
  frames: [
    { center: [50, ANKLE_Y - 36], arm: { out: 0, hand: [21, -5], elbow: [11.5, -1.5] }, leg: { out: 6 } },
    { center: [50, ANKLE_Y - 36], arm: { out: 0, hand: [14, 12], elbow: [11, 3] }, leg: { out: 6 } },
    { center: [50, ANKLE_Y - 36], arm: { out: 0, hand: [-9.6, 19], elbow: [1.5, 10.5] }, leg: { out: 6 } },
  ],
  work: ['chest', 'delts'],
  show: [[14, 10], [86, 10]],
  gear: (j) => [
    { layer: 'back', node: G.floor() },
    { layer: 'back', node: G.bar([16, FLOOR], [16, 8], 2.4) },
    { layer: 'back', node: G.bar([84, FLOOR], [84, 8], 2.4) },
    { layer: 'back', node: G.wheel([18, 12]) },
    { layer: 'back', node: G.wheel([82, 12]) },
    { layer: 'back', node: G.cable([18, 12], j.hand[0]) },
    { layer: 'back', node: G.cable([82, 12], j.hand[1]) },
    { layer: 'front', node: G.wheel(j.hand[0], 1.4) },
    { layer: 'front', node: G.wheel(j.hand[1], 1.4) },
  ],
};

/** A seated machine with the arms moving round to the front and back (pec deck, reverse pec deck), from the front. */
function seatedFly(together: 'end' | 'start'): FrontMove {
  const center: V = [50, ANKLE_Y - 19.7];
  const wide: FrontArm = { out: 0, hand: [21.5, 2.5], elbow: [11.5, 2.5] };
  const mid: FrontArm = { out: 0, hand: [11, 3.5], elbow: [7, 3.5] };
  const close: FrontArm = { out: 0, hand: [-6.8, 3.5], elbow: [1.6, 5.5] };
  const arms = together === 'end' ? [wide, mid, close] : [close, mid, wide];
  return {
    view: 'front',
    frames: arms.map((arm) => ({ center, seated: true, arm, leg: { out: 12 } })),
    work: together === 'end' ? ['chest', 'delts'] : ['delts', 'upperBack'],
    show: [[50, 14], [24, FLOOR], [76, FLOOR]],
    gear: (j) => [
      { layer: 'back', node: G.floor() },
      { layer: 'back', node: G.pad([j.center[0] - 13, j.center[1] + 4.6], [j.center[0] + 13, j.center[1] + 4.6], 3) },
      { layer: 'back', node: G.bar([j.center[0], j.center[1] + 7.5], [j.center[0], FLOOR], 2.2) },
      { layer: 'back', node: G.pad([j.center[0] - 9, j.center[1] - 30], [j.center[0] + 9, j.center[1] - 30], 28) },
      { layer: 'back', node: G.bar([j.center[0] - 16, 14], [j.center[0] + 16, 14], 2.4) },
      ...[0, 1].map((i) => ({ layer: 'back' as const, node: G.bar([j.shoulder[i][0], 14], add(j.hand[i], [0, -2.2]), 1.8) })),
      ...[0, 1].map((i) => ({ layer: 'front' as const, node: G.bar(add(j.hand[i], [0, -2.2]), add(j.hand[i], [0, 2.2]), 1.6) })),
    ],
  };
}
export const pecDeckFront = seatedFly('end');
export const reverseFlyFront = seatedFly('start');

/** Shrugs from the front: arms hanging with the handles, the shoulders up towards the ears. */
export const shrugFront: FrontMove = {
  view: 'front',
  frames: [
    { center: [50, ANKLE_Y - 36], arm: { out: 7, bend: 0 }, leg: { out: 5 } },
    { center: [50, ANKLE_Y - 36], arm: { out: 7, bend: 0 }, leg: { out: 5 }, shrug: 3.4 },
  ],
  work: ['upperBack'],
  gear: (j) => [
    { layer: 'back', node: G.floor() },
    { layer: 'front', node: G.dumbbell(j.hand[0]) },
    { layer: 'front', node: G.dumbbell(j.hand[1]) },
  ],
};
