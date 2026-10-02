// Drawing of a posed person (figure/rig.ts) and the equipment around them, as SVG.
import type { ReactNode } from 'react';
import { BODY, add, sub, len, type Joints, type V } from './rig';

/** Muscles that can be lit up on the picture. */
export type Muscle =
  | 'chest'
  | 'lats'
  | 'upperBack'
  | 'lowerBack'
  | 'abs'
  | 'delts'
  | 'biceps'
  | 'triceps'
  | 'forearm'
  | 'glutes'
  | 'quads'
  | 'hams'
  | 'adductors'
  | 'calves';

/** A piece of equipment: `back` behind the person, `mid` between the body and the near arm, `front` over all. */
export interface Gear {
  layer: 'back' | 'mid' | 'front';
  node: ReactNode;
}

const f = (n: number) => n.toFixed(2);
const unit = (v: V): V => {
  const l = len(v) || 1;
  return [v[0] / l, v[1] / l];
};

/** Outline of a tapered limb part: two round ends joined by straight sides, as one path. */
export function capsule(a: V, b: V, ra: number, rb: number) {
  const d = unit(sub(b, a));
  const n: V = [-d[1], d[0]];
  const p1 = add(a, n, ra);
  const p2 = add(b, n, rb);
  const p3 = add(b, n, -rb);
  const p4 = add(a, n, -ra);
  return `M${f(p1[0])} ${f(p1[1])}L${f(p2[0])} ${f(p2[1])}A${rb} ${rb} 0 0 0 ${f(p3[0])} ${f(p3[1])}L${f(p4[0])} ${f(p4[1])}A${ra} ${ra} 0 0 0 ${f(p1[0])} ${f(p1[1])}Z`;
}

/** A tapered limb part: two round ends joined smoothly. */
function Segment({ a, b, ra, rb, cls }: { a: V; b: V; ra: number; rb: number; cls: string }) {
  return <path d={capsule(a, b, ra, rb)} className={cls} />;
}

/** A closed smooth outline through the points (Catmull-Rom). */
function smooth(pts: V[]) {
  const n = pts.length;
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1: V = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: V = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + 'Z';
}

// The trunk's side outline: [along the spine from the hip joint, towards the front].
const TRUNK: V[] = [
  [-3.2, -1.6], // under the buttock
  [-0.6, -5.4], // buttock
  [4.5, -4.3], // small of the back
  [12, -4.4],
  [19.5, -5.2], // upper back
  [24.5, -4.2],
  [26.6, -1.8], // top of the shoulder
  [26.2, 2.0],
  [22.5, 5.5], // chest
  [17, 5.0],
  [12.5, 4.0], // belly
  [6.5, 4.0],
  [1.5, 4.6],
  [-2.2, 3.4], // groin
];

/** Where each muscle sits on the trunk outline (along, front) — a soft patch inside it. */
const TRUNK_MUSCLES: Partial<Record<Muscle, V[]>> = {
  chest: [
    [24.2, 1.6],
    [22.6, 4.6],
    [18, 4.4],
    [17.2, 1.4],
  ],
  abs: [
    [15.8, 3.2],
    [12.5, 3.3],
    [6, 3.2],
    [2.5, 3.6],
    [2.2, 1.6],
    [15.6, 1.4],
  ],
  lats: [
    [21.5, -4.4],
    [19, -4.8],
    [12, -3.9],
    [8.5, -3.3],
    [11, -1.8],
    [20, -2.5],
  ],
  upperBack: [
    [25.6, -3.6],
    [23.8, -4.4],
    [19.5, -4.6],
    [19.8, -2.6],
    [24.5, -1.8],
  ],
  lowerBack: [
    [11, -4.0],
    [4.8, -3.8],
    [3.2, -2.2],
    [11, -2.4],
  ],
  glutes: [
    [3.2, -4.6],
    [-0.4, -4.8],
    [-2.6, -1.8],
    [-0.4, -0.6],
    [3.4, -2.4],
  ],
};

/** Muscles on a limb part: which part, which side (+1 front, -1 back), where along it (0..1). */
const LIMB_MUSCLES: Partial<Record<Muscle, { part: 'upper' | 'fore' | 'thigh' | 'shin'; side: 1 | -1; from: number; to: number }>> = {
  biceps: { part: 'upper', side: 1, from: 0.25, to: 0.85 },
  triceps: { part: 'upper', side: -1, from: 0.15, to: 0.85 },
  forearm: { part: 'fore', side: 1, from: 0.1, to: 0.6 },
  quads: { part: 'thigh', side: 1, from: 0.15, to: 0.88 },
  hams: { part: 'thigh', side: -1, from: 0.15, to: 0.88 },
  adductors: { part: 'thigh', side: 1, from: 0.05, to: 0.45 },
  calves: { part: 'shin', side: -1, from: 0.08, to: 0.55 },
};

const R = { upperA: 2.9, upperB: 2.2, foreA: 2.2, foreB: 1.6, hand: 1.9, thighA: 4.4, thighB: 3.0, shinA: 3.0, shinB: 1.9 };

/** Grows a limb's outline for the gap drawn under a near arm or leg (so it stands apart from the trunk). */
const HALO = 0.9;

function Leg({ j, far, cls, halo = 0 }: { j: Joints; far: boolean; cls: string; halo?: number }) {
  const hip = far ? add(j.hip, j.front, -0.3) : j.hip;
  const knee = far ? j.knee2 : j.knee;
  const ankle = far ? j.ankle2 : j.ankle;
  const toe = far ? j.toe2 : j.toe;
  const heel = far ? j.heel2 : j.heel;
  // The sole is on the side away from the shin.
  const fd = unit(sub(toe, heel));
  let sole: V = [-fd[1], fd[0]];
  if (sole[0] * (knee[0] - ankle[0]) + sole[1] * (knee[1] - ankle[1]) > 0) sole = [-sole[0], -sole[1]];
  return (
    <g>
      <Segment a={hip} b={knee} ra={R.thighA + halo} rb={R.thighB + halo} cls={cls} />
      <Segment a={knee} b={ankle} ra={R.shinA + halo} rb={R.shinB + halo} cls={cls} />
      <Segment a={add(heel, sole, 1.0)} b={add(toe, sole, 1.4)} ra={1.7 + halo} rb={1.1 + halo} cls={cls} />
    </g>
  );
}

function Arm({ j, far, cls, halo = 0 }: { j: Joints; far: boolean; cls: string; halo?: number }) {
  const s = add(j.shoulder, j.front, far ? 0.0 : 0.4);
  const elbow = far ? j.elbow2 : j.elbow;
  const hand = far ? j.hand2 : j.hand;
  return (
    <g>
      <Segment a={s} b={elbow} ra={R.upperA + halo} rb={R.upperB + halo} cls={cls} />
      <Segment a={elbow} b={hand} ra={R.foreA + halo} rb={R.foreB + halo} cls={cls} />
      <circle cx={f(hand[0])} cy={f(hand[1])} r={R.hand + halo} className={cls} />
    </g>
  );
}

function LimbMuscle({ j, m }: { j: Joints; m: Muscle }) {
  const spec = LIMB_MUSCLES[m];
  if (!spec) return null;
  const [a, b, ra, rb]: [V, V, number, number] =
    spec.part === 'upper'
      ? [add(j.shoulder, j.front, 0.4), j.elbow, R.upperA, R.upperB]
      : spec.part === 'fore'
        ? [j.elbow, j.hand, R.foreA, R.foreB]
        : spec.part === 'thigh'
          ? [j.hip, j.knee, R.thighA, R.thighB]
          : [j.knee, j.ankle, R.shinA, R.shinB];
  const d = unit(sub(b, a));
  // "Front" of a limb part: for the leg — where the knee cap looks; for the arm — the palm side of a hanging arm.
  let n: V = [d[1], -d[0]];
  if (spec.part === 'thigh' || spec.part === 'shin') {
    const shinDir = unit(sub(j.ankle, j.knee));
    const thighDir = unit(sub(j.knee, j.hip));
    // The knee bends backwards: the front of the thigh is opposite to where the shin folds.
    const fold = spec.part === 'thigh' ? sub(shinDir, thighDir) : sub(thighDir, shinDir);
    const cross = d[0] * fold[1] - d[1] * fold[0];
    if (Math.abs(cross) > 0.02) n = cross > 0 ? [d[1], -d[0]] : [-d[1], d[0]];
    if (spec.part === 'shin') n = [-n[0], -n[1]];
  } else if (spec.part === 'upper' || spec.part === 'fore') {
    const upperDir = unit(sub(j.elbow, j.shoulder));
    const foreDir = unit(sub(j.hand, j.elbow));
    const cross = upperDir[0] * foreDir[1] - upperDir[1] * foreDir[0];
    // The elbow folds to the front: the biceps side is where the forearm turns.
    if (Math.abs(cross) > 0.05) n = cross < 0 ? [d[1], -d[0]] : [-d[1], d[0]];
    else n = [j.front[0], j.front[1]];
    if (spec.part === 'fore') n = [-n[0], -n[1]];
  }
  const side = spec.side;
  const r0 = (ra + (rb - ra) * spec.from) * 0.55;
  const r1 = (ra + (rb - ra) * spec.to) * 0.5;
  const p0 = add(add(a, d, len(sub(b, a)) * spec.from), n, side * (ra * 0.42));
  const p1 = add(add(a, d, len(sub(b, a)) * spec.to), n, side * (rb * 0.42));
  return <Segment a={p0} b={p1} ra={r0} rb={r1} cls="fg-work" />;
}

/** The person in a pose, with the working muscles lit, between the layers of equipment. */
export function Person({ j, work = [], gear = [], halo = true }: { j: Joints; work?: Muscle[]; gear?: Gear[]; halo?: boolean }) {
  // Raised shoulders (a shrug) lift the top of the trunk outline with them.
  const shrug = len(sub(j.shoulder, j.hip)) - BODY.trunk;
  const at = (o: V): V => add(add(j.hip, j.up, o[0] + (o[0] > 17 ? shrug * Math.min(1, (o[0] - 17) / 7) : 0)), j.front, o[1]);
  const trunk = smooth(TRUNK.map(at));
  const layer = (l: Gear['layer']) => gear.filter((g) => g.layer === l).map((g, i) => <g key={l + i}>{g.node}</g>);
  const headR = BODY.head;
  return (
    <g>
      {layer('back')}
      <Arm j={j} far cls="fg-far" />
      <Leg j={j} far cls="fg-far" />
      <Segment a={j.shoulder} b={j.neck} ra={2.5} rb={2.3} cls="fg-body" />
      <circle cx={f(j.head[0])} cy={f(j.head[1])} r={headR} className="fg-body" />
      <path d={trunk} className="fg-body" />
      {(Object.keys(TRUNK_MUSCLES) as Muscle[])
        .filter((m) => work.includes(m))
        .map((m) => (
          <path key={m} d={smooth(TRUNK_MUSCLES[m]!.map(at))} className="fg-work" />
        ))}
      <Leg j={j} far={false} cls="fg-body" />
      {work.filter((m) => LIMB_MUSCLES[m]?.part === 'thigh' || LIMB_MUSCLES[m]?.part === 'shin').map((m) => (
        <LimbMuscle key={m} j={j} m={m} />
      ))}
      {layer('mid')}
      {halo && <Arm j={j} far={false} cls="fg-halo" halo={HALO} />}
      <Arm j={j} far={false} cls="fg-body" />
      {work.includes('delts') && <circle cx={f(at([24.2, 0.6])[0])} cy={f(at([24.2, 0.6])[1])} r={2.6} className="fg-work" />}
      {work.filter((m) => LIMB_MUSCLES[m]?.part === 'upper' || LIMB_MUSCLES[m]?.part === 'fore').map((m) => (
        <LimbMuscle key={m} j={j} m={m} />
      ))}
      {layer('front')}
    </g>
  );
}

// ---------- equipment ----------
export const G = {
  floor: (x0 = 2, x1 = 98) => <line x1={x0} y1={92} x2={x1} y2={92} className="fg-floor" />,
  /** A barbell seen from its end: the plate (behind the body) and the bar's end. */
  plate: (at: V, r = 8.4) => (
    <g>
      <circle cx={f(at[0])} cy={f(at[1])} r={r} className="fg-plate" />
      <circle cx={f(at[0])} cy={f(at[1])} r={r * 0.62} className="fg-plate-in" />
      <circle cx={f(at[0])} cy={f(at[1])} r={1.3} className="fg-metal" />
    </g>
  ),
  /** A dumbbell seen from its end, in the hand. */
  dumbbell: (at: V) => (
    <g>
      <circle cx={f(at[0])} cy={f(at[1])} r={3.3} className="fg-plate" />
      <circle cx={f(at[0])} cy={f(at[1])} r={1.1} className="fg-metal" />
    </g>
  ),
  /** A dumbbell from the side (a neutral grip): the handle across the fist, a plate at each end. */
  dumbbellSide: (at: V, along: V) => {
    const d = unit(along);
    const a = add(at, d, -3.6);
    const b = add(at, d, 3.6);
    return (
      <g>
        <line x1={f(a[0])} y1={f(a[1])} x2={f(b[0])} y2={f(b[1])} strokeWidth={1.2} className="fg-frame" />
        {[a, b].map((p, i) => (
          <line key={i} x1={f(p[0] - d[1] * 2.6)} y1={f(p[1] + d[0] * 2.6)} x2={f(p[0] + d[1] * 2.6)} y2={f(p[1] - d[0] * 2.6)} strokeWidth={2.6} className="fg-frame" />
        ))}
      </g>
    );
  },
  /** A padded board between two points (bench top, back rest), `t` thick, on the side `side` of the line. */
  pad: (a: V, b: V, t = 3.2) => {
    const d = unit(sub(b, a));
    const n: V = [d[1], -d[0]];
    const p = [add(a, n, 0), add(b, n, 0), add(b, n, -t), add(a, n, -t)];
    return <polygon points={p.map((q) => f(q[0]) + ',' + f(q[1])).join(' ')} className="fg-pad" strokeLinejoin="round" />;
  },
  bar: (a: V, b: V, w = 1.6) => <line x1={f(a[0])} y1={f(a[1])} x2={f(b[0])} y2={f(b[1])} strokeWidth={w} className="fg-frame" />,
  cable: (a: V, b: V) => <line x1={f(a[0])} y1={f(a[1])} x2={f(b[0])} y2={f(b[1])} className="fg-cable" />,
  wheel: (at: V, r = 1.8) => <circle cx={f(at[0])} cy={f(at[1])} r={r} className="fg-wheel" />,
  /** A weight stack: a column of plates from y0 down to the floor. */
  stack: (x: number, y0: number, w = 6, n = 7) => (
    <g>
      {Array.from({ length: n }, (_, i) => (
        <rect key={i} x={f(x - w / 2)} y={f(y0 + i * 2.1)} width={w} height={1.7} rx={0.4} className="fg-stack" />
      ))}
    </g>
  ),
  roll: (at: V, r = 2.4) => <circle cx={f(at[0])} cy={f(at[1])} r={r} className="fg-pad" />,
};
