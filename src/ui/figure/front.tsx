// A person seen from the front, for movements out to the sides (lateral raises, hip abduction and adduction),
// which the side view cannot show. Same scale as figure/rig.ts; both sides mirror each other.
import { G, type Gear, type Muscle } from './draw';
import { FLOOR, add, lerp, type V } from './rig';

const ANKLE_Y = FLOOR - 3;
const DEG = Math.PI / 180;

export interface FrontPose {
  /** Middle of the pelvis at the height of the hip joints. */
  center: V;
  /** Sitting: thighs come towards the viewer (seen short), shins hang down to the floor. */
  seated?: boolean;
  /** Arms: angle out from hanging down (0) to straight up (180); the forearm turns on by `bend` more. */
  arm: { out: number; bend?: number; foreK?: number };
  /** The other arm (on the viewer's left) when it does something else. */
  arm2?: { out: number; bend?: number; foreK?: number };
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
}

const dirOut = (out: number, side: number): V => [side * Math.sin(out * DEG), Math.cos(out * DEG)];

export function frontJoints(p: FrontPose): FrontJoints {
  const c = p.center;
  const sides = [-1, 1] as const;
  const shoulder = sides.map((s) => add(c, [s * 8.4, -23.6])) as [V, V];
  const armOf = (i: number) => (i === 0 && p.arm2 ? p.arm2 : p.arm);
  const elbow = sides.map((s, i) => add(shoulder[i], dirOut(armOf(i).out, s), 13.5)) as [V, V];
  const hand = sides.map((s, i) => add(elbow[i], dirOut(armOf(i).out + (armOf(i).bend ?? 0), s), 12 * (armOf(i).foreK ?? 1))) as [V, V];
  const hip = sides.map((s) => add(c, [s * 4.4, 0])) as [V, V];
  const knee = sides.map((s, i) =>
    p.seated ? add(hip[i], [s * 18.5 * Math.sin(p.leg.out * DEG), 2.2]) : add(hip[i], dirOut(p.leg.out, s), 18.5),
  ) as [V, V];
  const ankle = sides.map((s, i) => (p.seated ? ([knee[i][0], ANKLE_Y] as V) : add(knee[i], dirOut(p.leg.out, s), 17.5))) as [V, V];
  return { center: c, shoulder, elbow, hand, hip, knee, ankle, neck: add(c, [0, -26.2]), head: add(c, [0, -31.6]), seated: !!p.seated };
}

export function mixFront(a: FrontPose, b: FrontPose, t: number): FrontPose {
  return {
    center: [lerp(a.center[0], b.center[0], t), lerp(a.center[1], b.center[1], t)],
    seated: b.seated,
    arm: { out: lerp(a.arm.out, b.arm.out, t), bend: lerp(a.arm.bend ?? 0, b.arm.bend ?? 0, t), foreK: lerp(a.arm.foreK ?? 1, b.arm.foreK ?? 1, t) },
    leg: { out: lerp(a.leg.out, b.leg.out, t) },
    arm2: a.arm2 && b.arm2 ? { out: lerp(a.arm2.out, b.arm2.out, t), bend: lerp(a.arm2.bend ?? 0, b.arm2.bend ?? 0, t) } : b.arm2,
  };
}

const f = (n: number) => n.toFixed(2);
function Seg({ a, b, ra, rb, cls }: { a: V; b: V; ra: number; rb: number; cls: string }) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  const n: V = [-dy / l, dx / l];
  const p = [add(a, n, ra), add(b, n, rb), add(b, n, -rb), add(a, n, -ra)];
  return (
    <g className={cls}>
      <circle cx={f(a[0])} cy={f(a[1])} r={ra} />
      <circle cx={f(b[0])} cy={f(b[1])} r={rb} />
      <polygon points={p.map((q) => f(q[0]) + ',' + f(q[1])).join(' ')} />
    </g>
  );
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
  const right = half.map(([y, x]) => [c[0] + x, c[1] + y] as V);
  const left = half.map(([y, x]) => [c[0] - x, c[1] + y] as V).reverse();
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
