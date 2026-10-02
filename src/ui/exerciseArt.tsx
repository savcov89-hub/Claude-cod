// Exercise pictures: a jointed figure in the start and the end position of each exercise, with its equipment.
// Poses are given by where the hips, hands and feet are (the elbows and knees are found by themselves),
// so a pose reads like a description: «lying on the bench, the bar above the chest».
import { memo, useEffect, useState } from 'react';
import { exerciseRules, muscleNames } from '../trainingRules';
import { Sheet } from './common';

type V = [number, number];
const rad = (a: number) => (a * Math.PI) / 180;
const dir = (o: V, a: number, l: number): V => [o[0] + Math.cos(rad(a)) * l, o[1] + Math.sin(rad(a)) * l];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpV = (a: V, b: V, t: number): V => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
const dist = (a: V, b: V) => Math.hypot(b[0] - a[0], b[1] - a[1]);

// Body proportions (the picture is 100 × 100; the floor is at y = 94).
const TORSO = 23;
const NECK = 2.5;
const HEAD = 5.6;
const UPPER = 13.5;
const FORE = 12.5;
const THIGH = 18;
const SHIN = 17.5;
const FOOT = 6.5;
export const FLOOR = 94;

/** Middle joint of a two-part limb from `root` to `end`; `bend` picks the side the joint goes to. */
function ik(root: V, end: V, a: number, b: number, bend: 1 | -1): { mid: V; end: V } {
  const d = Math.min(Math.max(dist(root, end), Math.abs(a - b) + 0.01), a + b - 0.01);
  const base = Math.atan2(end[1] - root[1], end[0] - root[0]);
  const cos = (a * a + d * d - b * b) / (2 * a * d);
  const ang = base + bend * Math.acos(Math.max(-1, Math.min(1, cos)));
  const mid: V = [root[0] + Math.cos(ang) * a, root[1] + Math.sin(ang) * a];
  // An end out of reach: the limb points straight at it.
  const realEnd = dist(root, end) > a + b ? dir(mid, (Math.atan2(end[1] - mid[1], end[0] - mid[0]) * 180) / Math.PI, b) : end;
  return { mid, end: realEnd };
}

/** A pose seen from the side (facing right). */
export interface Pose {
  hip: V;
  /** Angle of the back, hip → shoulders: -90 upright, 180 lying with the head to the left, 0 head to the right. */
  torso: number;
  /** Head tilt from the line of the back. */
  head?: number;
  hand: V;
  /** Elbow side: 1 or -1 (whichever looks right). */
  elbow?: 1 | -1;
  hand2?: V;
  elbow2?: 1 | -1;
  /** Ankle position. */
  foot: V;
  knee?: 1 | -1;
  foot2?: V;
  knee2?: 1 | -1;
  /** Direction the toes point (default: forward, along the floor). */
  toe?: number;
  toe2?: number;
  /** Shoulders raised (shrugs), in picture units. */
  shrug?: number;
  /** Arms pointing at the viewer look shorter (1: full length). */
  reach?: number;
}
/** A pose seen from the front: arms and legs mirror each other. */
export interface FrontPose {
  front: true;
  hip: V;
  /** Right hand (on the picture's right) and left hand. */
  hand: V;
  hand2?: V;
  /** Knee and ankle on the right; the left mirrors them unless given. */
  knee: V;
  foot: V;
  knee2?: V;
  foot2?: V;
  shrug?: number;
  /** Elbows bend outward (1) or inward (-1). */
  elbow?: 1 | -1;
  /** Seated: the thighs come towards the viewer (drawn short). */
  seated?: boolean;
  /** Arms pointing at the viewer look shorter (1: full length). */
  reach?: number;
}
type AnyPose = Pose | FrontPose;
const isFront = (p: AnyPose): p is FrontPose => 'front' in p;

export interface Joints {
  hip: V;
  shoulder: V;
  head: V;
  elbow: V;
  hand: V;
  elbow2: V;
  hand2: V;
  knee: V;
  ankle: V;
  toe: V;
  knee2: V;
  ankle2: V;
  toe2: V;
  /** Front view: the two shoulders and hips. */
  shoulderL?: V;
  shoulderR?: V;
  hipL?: V;
  hipR?: V;
  front?: boolean;
  seated?: boolean;
}

function sideJoints(p: Pose): Joints {
  const shoulder = dir(p.hip, p.torso, TORSO);
  const lifted: V = [shoulder[0], shoulder[1] - (p.shrug || 0)];
  const head = dir(lifted, p.torso + (p.head || 0), NECK + HEAD);
  const r = p.reach ?? 1;
  const arm = ik(lifted, p.hand, UPPER * r, FORE * r, p.elbow ?? 1);
  const arm2 = ik(lifted, p.hand2 || p.hand, UPPER * r, FORE * r, p.elbow2 ?? p.elbow ?? 1);
  const leg = ik(p.hip, p.foot, THIGH, SHIN, p.knee ?? -1);
  const leg2 = ik(p.hip, p.foot2 || p.foot, THIGH, SHIN, p.knee2 ?? p.knee ?? -1);
  return {
    hip: p.hip,
    shoulder: lifted,
    head,
    elbow: arm.mid,
    hand: arm.end,
    elbow2: arm2.mid,
    hand2: arm2.end,
    knee: leg.mid,
    ankle: leg.end,
    toe: dir(leg.end, p.toe ?? 0, FOOT),
    knee2: leg2.mid,
    ankle2: leg2.end,
    toe2: dir(leg2.end, p.toe2 ?? p.toe ?? 0, FOOT),
  };
}

const SH_W = 8.5;
const HIP_W = 4.6;
function frontJoints(p: FrontPose): Joints {
  const center: V = [p.hip[0], p.hip[1] - TORSO];
  const lift = p.shrug || 0;
  const shoulderR: V = [center[0] + SH_W, center[1] - lift];
  const shoulderL: V = [center[0] - SH_W, center[1] - lift];
  const mirror = (v: V): V => [2 * p.hip[0] - v[0], v[1]];
  const hand2 = p.hand2 || mirror(p.hand);
  const r = p.reach ?? 1;
  const armR = ik(shoulderR, p.hand, UPPER * r, FORE * r, p.elbow === -1 ? 1 : -1);
  const armL = ik(shoulderL, hand2, UPPER * r, FORE * r, p.elbow === -1 ? -1 : 1);
  const hipR: V = [p.hip[0] + HIP_W, p.hip[1]];
  const hipL: V = [p.hip[0] - HIP_W, p.hip[1]];
  const knee2 = p.knee2 || mirror(p.knee);
  const foot2 = p.foot2 || mirror(p.foot);
  return {
    front: true,
    seated: p.seated,
    hip: p.hip,
    shoulder: center,
    shoulderL,
    shoulderR,
    hipL,
    hipR,
    head: [center[0], center[1] - lift * 0.3 - NECK - HEAD],
    elbow: armR.mid,
    hand: armR.end,
    elbow2: armL.mid,
    hand2: armL.end,
    knee: p.knee,
    ankle: p.foot,
    toe: [p.foot[0] + 4, p.foot[1] + 1.5],
    knee2,
    ankle2: foot2,
    toe2: [foot2[0] - 4, foot2[1] + 1.5],
  };
}

const jointsOf = (p: AnyPose) => (isFront(p) ? frontJoints(p) : sideJoints(p));

function mixPose(a: AnyPose, b: AnyPose, t: number): AnyPose {
  const out: Record<string, unknown> = { ...a };
  for (const k of Object.keys(b) as Array<keyof typeof b>) {
    const x = (a as any)[k];
    const y = (b as any)[k];
    if (Array.isArray(x) && Array.isArray(y)) out[k] = lerpV(x as V, y as V, t);
    else if (typeof x === 'number' && typeof y === 'number') out[k] = lerp(x, y, t);
    else if (x === undefined && Array.isArray(y)) out[k] = t < 0.5 ? undefined : y;
    else out[k] = t < 0.5 ? x ?? y : y;
  }
  return out as unknown as AnyPose;
}

// ---------- drawing ----------
type Seg = 'thigh' | 'shin' | 'upper' | 'fore' | 'torso' | 'shoulder' | 'glute' | 'chest' | 'lats' | 'abs';
type Shape =
  | { k: 'line'; a: V; b: V; w: number; c: string }
  | { k: 'circle'; at: V; r: number; c: string; stroke?: string; sw?: number }
  | { k: 'rect'; x: number; y: number; w: number; h: number; rx?: number; c: string }
  | { k: 'path'; d: string; w: number; c: string; fill?: string };

const line = (a: V, b: V, w = 2.2, c = 'gear'): Shape => ({ k: 'line', a, b, w, c });
const circle = (at: V, r: number, c = 'gear', stroke?: string, sw?: number): Shape => ({ k: 'circle', at, r, c, stroke, sw });
const rect = (x: number, y: number, w: number, h: number, c = 'gear', rx = 1.5): Shape => ({ k: 'rect', x, y, w, h, c, rx });

// Equipment pieces.
const floor = (): Shape[] => [line([4, FLOOR], [96, FLOOR], 1.2, 'floor')];
/** A padded bench from `a` to `b` with legs to the floor. */
const bench = (a: V, b: V, legs = true): Shape[] => [
  ...(legs ? [line([a[0] + 3, a[1] + 2], [a[0] + 3, FLOOR], 2, 'gear'), line([b[0] - 3, b[1] + 2], [b[0] - 3, FLOOR], 2, 'gear')] : []),
  line(a, b, 4.6, 'pad'),
];
const pad = (a: V, b: V, w = 4.6): Shape => line(a, b, w, 'pad');
/** A barbell seen end-on: a plate with the bar's end. */
const barbell = (at: V, r = 7.5): Shape[] => [circle(at, r, 'load'), circle(at, r * 0.28, 'loadHub')];
const dumbbell = (at: V): Shape[] => [circle(at, 3.4, 'load'), circle(at, 1.1, 'loadHub')];
/** A bar seen from the front, with plates. */
const barFront = (a: V, b: V): Shape[] => [line([a[0] - 9, a[1]], [b[0] + 9, b[1]], 1.8, 'load'), rect(a[0] - 10, a[1] - 7, 3.2, 14, 'load', 1), rect(b[0] + 6.8, b[1] - 7, 3.2, 14, 'load', 1)];
const dumbbellFront = (at: V): Shape[] => [line([at[0] - 4, at[1]], [at[0] + 4, at[1]], 1.8, 'load'), rect(at[0] - 5, at[1] - 2.6, 2.2, 5.2, 'load', 0.8), rect(at[0] + 2.8, at[1] - 2.6, 2.2, 5.2, 'load', 0.8)];
/** A cable from a pulley to the hand, with a handle. */
const cable = (pulley: V, to: V): Shape[] => [line(pulley, to, 0.9, 'cable'), circle(pulley, 2.2, 'gear'), circle(to, 1.6, 'load')];
/** A weight stack with its frame. */
const stack = (x: number, top = 30): Shape[] => [line([x, top - 6], [x, FLOOR], 1.6, 'gear'), rect(x - 4.5, FLOOR - 26, 9, 24, 'stack', 1.2), line([x - 4.5, FLOOR - 20], [x + 4.5, FLOOR - 20], 0.6, 'stackLine'), line([x - 4.5, FLOOR - 14], [x + 4.5, FLOOR - 14], 0.6, 'stackLine'), line([x - 4.5, FLOOR - 8], [x + 4.5, FLOOR - 8], 0.6, 'stackLine')];
/** A lever from its pivot to the handle, with plates on it. */
const lever = (pivot: V, hand: V, plateAt = 0.62): Shape[] => {
  const p = lerpV(pivot, hand, plateAt);
  return [line(pivot, hand, 2.4, 'gear'), circle(pivot, 2, 'gear'), circle(p, 6.2, 'load'), circle(p, 1.6, 'loadHub')];
};
const roller = (at: V, r = 2.8): Shape => circle(at, r, 'pad');
const post = (x: number, y: number): Shape => line([x, y], [x, FLOOR], 2, 'gear');

/** How each kind of machine is drawn: a stack behind with a cable to the handle, or a lever with plates. */
function machine(kind: 'stack' | 'plate', hand: V, pivot: V, stackX = 10): Shape[] {
  if (kind === 'plate') return lever(pivot, hand);
  return [...stack(stackX, 22), line([stackX, 16], pivot, 0.9, 'cable'), line(pivot, hand, 0.9, 'cable'), circle(pivot, 2.2, 'gear'), circle(hand, 1.7, 'load')];
}

export interface Art {
  start: AnyPose;
  end: AnyPose;
  /** Behind the body (benches, frames); the joints are those of the moment drawn. */
  gear?: (j: Joints) => Shape[];
  /** In front of the body (bars, dumbbells, cables in the hands). */
  load?: (j: Joints) => Shape[];
  work?: Seg[];
}

// ---------- poses ----------
const STAND_HIP: V = [50, 56.8];
const FEET: V = [50, 91.6];
const standing = (over: Partial<Pose> = {}): Pose => ({ hip: STAND_HIP, torso: -90, hand: [52, 80], elbow: 1, foot: FEET, ...over });
const seated = (over: Partial<Pose> = {}): Pose => {
  const hip = over.hip || [44, 74];
  return { hip, torso: -90, hand: [hip[0] + 16, hip[1] - 4], elbow: 1, foot: [hip[0] + 19, 91.6], ...over };
};
/** A seat under the hips and a back pad along the back, with a post to the floor. */
const seatFor = (hip: V, torso = -90, back = true): Shape[] => [
  post(hip[0] + 1, hip[1] + 5),
  pad([hip[0] - 10, hip[1] + 3.8], [hip[0] + 9, hip[1] + 3.8]),
  ...(back ? [pad(dir(dir(hip, torso + 90, 4.2), torso, -3), dir(dir(hip, torso + 90, 4.2), torso, TORSO + 1))] : []),
];

/** Squat with the load on the back (`front`: on the front of the shoulders). */
function squat(kind: 'bar' | 'front' | 'smith' | 'hack' | 'belt' | 'pendulum'): Art {
  const barOn = (j: Joints): V => (kind === 'front' ? [j.shoulder[0] + 3.5, j.shoulder[1] - 0.5] : [j.shoulder[0] - 3, j.shoulder[1] + 0.5]);
  const top: Pose = standing({ hip: [48, 56.8], hand: [44, 33], elbow: -1, ...(kind === 'front' ? { hand: [55, 33], elbow: 1 } : {}), foot: [52, 91.6] });
  const bottom: Pose = { ...top, hip: [36, 73], torso: kind === 'hack' || kind === 'pendulum' ? -78 : -62, hand: kind === 'front' ? [52, 51] : [32, 51] };
  if (kind === 'hack' || kind === 'pendulum') {
    top.torso = -100;
    top.hip = [46, 57.5];
    top.hand = [40, 34];
    bottom.hip = [33, 72];
    bottom.torso = -102;
    bottom.hand = [26, 50];
  }
  if (kind === 'belt') {
    top.hand = [62, 58];
    top.elbow = 1;
    bottom.hand = [58, 70];
  }
  return {
    start: top,
    end: bottom,
    work: ['thigh', 'glute'],
    gear: (j) => [
      ...floor(),
      ...(kind === 'smith' ? [post(20, 6), post(80, 6)] : []),
      ...(kind === 'hack' || kind === 'pendulum' ? [pad(dir(j.hip, -100, -4), dir(j.hip, -100, TORSO + 3), 4.2), line([22, FLOOR], [56, 26], 2, 'gear'), pad([44, 92.5], [64, 92.5], 3.4)] : []),
    ],
    load: (j) =>
      kind === 'belt'
        ? [line(j.hip, [j.hip[0] + 2, FLOOR - 10], 0.9, 'cable'), circle([j.hip[0] + 2, FLOOR - 6], 5.5, 'load'), circle([j.hip[0] + 2, FLOOR - 6], 1.4, 'loadHub')]
        : kind === 'hack' || kind === 'pendulum'
          ? [roller([j.shoulder[0] + 1, j.shoulder[1] - 2.5], 3)]
          : barbell(barOn(j)),
  };
}

/** Lying on a flat or inclined bench, pressing up (`db`: dumbbells). */
function benchPress(opts: { incline?: number; db?: boolean; smith?: boolean; triceps?: boolean } = {}): Art {
  const angle = 180 + (opts.incline || 0); // torso pointing left, raised by the incline
  const hip: V = opts.incline ? [60, 70] : [62, 66.5];
  const sh = dir(hip, angle, TORSO);
  const up: V = [sh[0] + 1, sh[1] - 24.5];
  const down: V = [sh[0] + (opts.incline ? 3 : 2), sh[1] - 5];
  const start: Pose = { hip, torso: angle, head: opts.incline ? 8 : 4, hand: up, elbow: -1, foot: [79, 91.6], knee: -1 };
  const end: Pose = { ...start, hand: opts.triceps ? [sh[0] - 9, sh[1] - 10] : down, elbow: opts.triceps ? -1 : 1 };
  if (opts.triceps) {
    start.hand = [sh[0] + 0.5, sh[1] - 25];
  }
  const tilt = opts.incline || 0;
  return {
    start: opts.triceps ? end : start,
    end: opts.triceps ? start : end,
    work: opts.triceps ? ['upper'] : ['chest', 'upper'],
    gear: () => [
      ...floor(),
      ...bench(dir(hip, angle, -9), dir(hip, angle, TORSO + 4), !tilt),
      ...(tilt ? [line(dir(hip, angle, -9), [dir(hip, angle, -9)[0], FLOOR], 2, 'gear'), line(dir(hip, angle, TORSO), [dir(hip, angle, TORSO)[0] + 2, FLOOR], 2, 'gear')] : []),
      ...(opts.smith ? [post(18, 6), post(84, 6)] : []),
    ],
    load: (j) => (opts.db || opts.triceps ? dumbbell(j.hand) : barbell(j.hand, 7)),
  };
}

/** Seated machine press forward (chest) or up (shoulders). */
function machinePress(kind: 'stack' | 'plate', up: boolean): Art {
  const s = seated({ hip: [40, 74], torso: up ? -92 : -95 });
  const sh = dir(s.hip, s.torso, TORSO);
  const start: Pose = { ...s, hand: up ? [sh[0] + 3, sh[1] - 4] : [sh[0] + 6, sh[1] + 3], elbow: up ? 1 : 1 };
  const end: Pose = { ...s, hand: up ? [sh[0] + 3, sh[1] - 25] : [sh[0] + 26, sh[1] + 2] };
  return {
    start,
    end,
    work: up ? ['shoulder', 'upper'] : ['chest', 'upper'],
    gear: (j) => [...floor(), ...seatFor(s.hip, s.torso), ...machine(kind, j.hand, up ? [70, 24] : [74, 48], 88)],
  };
}

/** Pulling down from above while seated (lat pulldown). */
function pulldown(kind: 'cable' | 'stack' | 'plate'): Art {
  const s = seated({ hip: [44, 74], torso: -98 });
  const sh = dir(s.hip, s.torso, TORSO);
  const start: Pose = { ...s, hand: [sh[0] + 4, sh[1] - 25], elbow: -1 };
  const end: Pose = { ...s, torso: -106, hand: [sh[0] + 3, sh[1] + 1], elbow: 1 };
  return {
    start,
    end,
    work: ['lats', 'upper'],
    gear: (j) => [
      ...floor(),
      ...seatFor(s.hip, -90, false),
      roller([s.hip[0] + 15, s.hip[1] - 7], 2.6),
      ...(kind === 'plate' ? lever([72, 10], j.hand, 0.5) : [line([j.hand[0], 6], j.hand, 0.9, 'cable'), circle([j.hand[0], 6], 2.2, 'gear'), line([j.hand[0] - 9, j.hand[1]], [j.hand[0] + 9, j.hand[1]], 1.8, 'load')]),
    ],
  };
}

/** Seated row: arms forward, then the handle to the belly. */
function seatedRow(kind: 'cable' | 'stack' | 'plate', low = false): Art {
  const s: Pose = { hip: [36, 76], torso: -82, hand: [70, 70], elbow: 1, foot: [70, 88], knee: -1 };
  const start: Pose = { ...s, torso: -68, hand: [72, low ? 76 : 68] };
  const end: Pose = { ...s, torso: -96, hand: [42, low ? 70 : 64] };
  return {
    start,
    end,
    work: ['lats', 'upper'],
    gear: (j) => [
      ...floor(),
      pad([26, 79], [46, 79]),
      pad([72, 84], [76, 94], 3.4),
      ...(kind === 'plate' ? lever([88, 92], j.hand, 0.45) : [line([88, j.hand[1]], j.hand, 0.9, 'cable'), circle([88, j.hand[1]], 2.2, 'gear'), ...stack(92, 40)]),
    ],
  };
}

/** Seated, chest on a pad: arms forward, then the handles back. */
function chestRow(): Art {
  const s = seated({ hip: [36, 74], torso: -66 });
  const sh = dir(s.hip, s.torso, TORSO);
  return {
    start: { ...s, hand: [sh[0] + 22, sh[1] + 9], elbow: 1 },
    end: { ...s, hand: [sh[0] + 4, sh[1] + 10], elbow: -1 },
    work: ['lats', 'upper'],
    gear: (j) => [...floor(), ...seatFor(s.hip, -90, false), pad(dir(dir(s.hip, -66, 14), 24, 5), dir(dir(s.hip, -66, 24), 24, 5), 4.2), post(dir(s.hip, -66, 14)[0] + 6, 70), ...lever([84, 86], j.hand, 0.45)],
  };
}

/** Bent-over row with a bar (or a lever / one dumbbell). */
function bentRow(kind: 'bar' | 'lever' | 'one'): Art {
  const s: Pose = { hip: [40, 58], torso: -28, hand: [56, 84], elbow: 1, foot: [46, 91.6], knee: -1 };
  if (kind === 'one') {
    return {
      start: { ...s, hip: [44, 60], torso: -12, hand: [62, 84], hand2: [64, 74], elbow2: 1, foot: [36, 91.6], foot2: [50, 91.6], knee2: -1 },
      end: { ...s, hip: [44, 60], torso: -12, hand: [50, 66], elbow: -1, hand2: [64, 74], elbow2: 1, foot: [36, 91.6], foot2: [50, 91.6], knee2: -1 },
      work: ['lats', 'upper'],
      gear: () => [...floor(), ...bench([52, 76], [82, 76])],
      load: (j) => dumbbell(j.hand),
    };
  }
  return {
    start: s,
    end: { ...s, hand: [46, 68], elbow: -1 },
    work: ['lats', 'upper'],
    gear: (j) => [...floor(), ...(kind === 'lever' ? [line([12, FLOOR - 1], j.hand, 2.4, 'gear'), circle([12, FLOOR - 1], 2, 'gear')] : [])],
    load: (j) => (kind === 'lever' ? [circle(lerpV([12, FLOOR - 1], j.hand, 0.7), 6, 'load'), circle(lerpV([12, FLOOR - 1], j.hand, 0.7), 1.5, 'loadHub')] : barbell(j.hand)),
  };
}

/** Curl: the forearm comes up (`kind` decides the support and the load). */
function curl(kind: 'bar' | 'db' | 'hammer' | 'cable' | 'preacher' | 'incline' | 'bayesian' | 'machine'): Art {
  if (kind === 'incline') {
    const hip: V = [58, 74];
    const angle = -130;
    const sh = dir(hip, angle, TORSO);
    const base: Pose = { hip, torso: angle, head: 10, hand: [sh[0] - 2, sh[1] + 25], elbow: 1, foot: [76, 91.6] };
    return {
      start: base,
      end: { ...base, hand: [sh[0] + 6, sh[1] + 3], elbow: 1 },
      work: ['upper'],
      gear: () => [...floor(), line(dir(hip, angle, -7), dir(hip, angle, TORSO + 3), 4.6, 'pad'), line(dir(hip, angle, -6), [dir(hip, angle, -6)[0], FLOOR], 2, 'gear'), line(dir(hip, angle, TORSO), [dir(hip, angle, TORSO)[0], FLOOR], 2, 'gear')],
      load: (j) => dumbbell(j.hand),
    };
  }
  if (kind === 'preacher' || kind === 'machine') {
    const s = seated({ hip: [40, 74], torso: -86 });
    const sh = dir(s.hip, s.torso, TORSO);
    const elbowAt: V = [sh[0] + 9, sh[1] + 9];
    return {
      start: { ...s, hand: [elbowAt[0] + 11, elbowAt[1] + 7], elbow: 1 },
      end: { ...s, hand: [sh[0] + 9, sh[1] - 3], elbow: 1 },
      work: ['upper'],
      gear: (j) => [...floor(), ...seatFor(s.hip, -90, false), line([sh[0] + 3, sh[1] + 2], [elbowAt[0] + 6, elbowAt[1] + 8], 4.6, 'pad'), post(elbowAt[0] + 4, elbowAt[1] + 8), ...(kind === 'machine' ? machine('stack', j.hand, [74, 52], 88) : [])],
      load: (j) => (kind === 'preacher' ? barbell(j.hand, 6) : []),
    };
  }
  const base = standing({ hand: [53, 80], elbow: 1 });
  const sh = dir(base.hip, -90, TORSO);
  const bayes = kind === 'bayesian';
  const start: Pose = bayes ? { ...base, hip: [54, 57], torso: -84, hand: [36, 76], elbow: 1, foot2: [40, 91.6], knee2: -1, foot: [58, 91.6] } : base;
  const end: Pose = bayes ? { ...start, hand: [44, 52], elbow: 1 } : { ...base, hand: [sh[0] + 6, sh[1] + 4], elbow: 1 };
  return {
    start,
    end,
    work: kind === 'hammer' ? ['upper', 'fore'] : ['upper'],
    gear: () => [...floor(), ...(kind === 'cable' ? [circle([70, 90], 2.2, 'gear'), ...stack(76, 70)] : []), ...(bayes ? [circle([12, 86], 2.2, 'gear'), ...stack(8, 70)] : [])],
    load: (j) =>
      kind === 'bar'
        ? barbell(j.hand, 6.5)
        : kind === 'cable'
          ? [line([70, 90], j.hand, 0.9, 'cable'), circle(j.hand, 1.6, 'load')]
          : bayes
            ? [line([12, 86], j.hand, 0.9, 'cable'), circle(j.hand, 1.6, 'load')]
            : kind === 'hammer'
              ? [line([j.hand[0], j.hand[1] - 3.5], [j.hand[0], j.hand[1] + 3.5], 2, 'load'), circle([j.hand[0], j.hand[1] - 3.8], 1.8, 'load'), circle([j.hand[0], j.hand[1] + 3.8], 1.8, 'load')]
              : dumbbell(j.hand),
  };
}

/** Triceps: the forearm straightens. */
function triceps(kind: 'pushdown' | 'overhead' | 'press' | 'machine'): Art {
  if (kind === 'pushdown') {
    const base = standing({ hip: [46, 56.8], torso: -84 });
    const sh = dir(base.hip, base.torso, TORSO);
    return {
      start: { ...base, hand: [sh[0] + 13, sh[1] + 12], elbow: 1 },
      end: { ...base, hand: [sh[0] + 4, sh[1] + 25], elbow: 1 },
      work: ['upper'],
      gear: () => [...floor(), circle([72, 10], 2.2, 'gear'), ...stack(80, 14)],
      load: (j) => [line([72, 10], j.hand, 0.9, 'cable'), line([j.hand[0] - 2, j.hand[1]], [j.hand[0] + 3, j.hand[1]], 2, 'load')],
    };
  }
  if (kind === 'overhead') {
    const base = standing({ hip: [52, 56.8], torso: -72, foot: [44, 91.6], foot2: [62, 91.6], knee2: -1 });
    const sh = dir(base.hip, base.torso, TORSO);
    return {
      start: { ...base, hand: [sh[0] - 6, sh[1] - 3], elbow: -1 },
      end: { ...base, hand: [sh[0] + 20, sh[1] - 15], elbow: -1 },
      work: ['upper'],
      gear: () => [...floor(), circle([12, 84], 2.2, 'gear'), ...stack(6, 70)],
      load: (j) => [line([12, 84], j.hand, 0.9, 'cable'), circle(j.hand, 1.6, 'load')],
    };
  }
  // Seated: hands at the sides push down (dip machine) or forearms push forward (arm pad).
  const s = seated({ hip: [42, 74], torso: -90 });
  const sh = dir(s.hip, s.torso, TORSO);
  if (kind === 'press')
    return {
      start: { ...s, hand: [sh[0] + 2, sh[1] + 10], elbow: -1 },
      end: { ...s, hand: [sh[0] + 3, sh[1] + 25.5], elbow: -1 },
      work: ['upper'],
      gear: (j) => [...floor(), ...seatFor(s.hip), ...machine('stack', j.hand, [62, 64], 86)],
    };
  return {
    start: { ...s, hand: [sh[0] + 13, sh[1] - 2], elbow: 1 },
    end: { ...s, hand: [sh[0] + 25, sh[1] + 9], elbow: 1 },
    work: ['upper'],
    gear: (j) => [...floor(), ...seatFor(s.hip), line([sh[0] + 4, sh[1] + 10], [sh[0] + 14, sh[1] + 14], 4.2, 'pad'), ...lever([sh[0] + 13, sh[1] + 14], j.hand, 1.25)],
  };
}

/** Leg press: reclined, the sled moves with the feet. */
function legPress(kind: 'plate' | 'stack', calf = false): Art {
  const hip: V = [34, 74];
  const torso = -150;
  const start: Pose = { hip, torso, head: 14, hand: [38, 78], elbow: 1, foot: calf ? [72, 50] : [58, 54], knee: 1, toe: -55 };
  const end: Pose = { ...start, foot: calf ? [73, 49] : [70, 48], toe: calf ? -20 : -55 };
  return {
    start,
    end,
    work: calf ? ['shin'] : ['thigh', 'glute'],
    gear: (j) => {
      const plateC: V = [j.ankle[0] + 2.5, j.ankle[1] - 4];
      return [...floor(), pad(dir(hip, torso, -6), dir(hip, torso, TORSO + 3)), line([20, FLOOR], [40, 78], 2, 'gear'), line([36, FLOOR], [92, 26], 1.6, 'gear'), line([plateC[0] - 5, plateC[1] - 6], [plateC[0] + 6, plateC[1] + 7], 3.4, 'pad'), ...(kind === 'plate' ? [circle([plateC[0] + 9, plateC[1] - 2], 6, 'load'), circle([plateC[0] + 9, plateC[1] - 2], 1.5, 'loadHub')] : [line([plateC[0] + 3, plateC[1]], [92, 74], 0.9, 'cable'), ...stack(94, 66)])];
    },
  };
}

/** Seated leg extension: the shin comes up to straight. */
function legExtension(kind: 'stack' | 'plate'): Art {
  const s = seated({ hip: [40, 72], torso: -98, hand: [40, 78], elbow: 1 });
  const start: Pose = { ...s, foot: [60, 89], knee: -1, toe: 0 };
  const end: Pose = { ...s, foot: [75, 72], knee: -1, toe: -80 };
  return {
    start,
    end,
    work: ['thigh'],
    gear: (j) => [...floor(), ...seatFor(s.hip, -98), ...(kind === 'plate' ? lever([58, 72], [j.ankle[0] + 1, j.ankle[1] - 1], 1.6) : [line([58, 72], [j.ankle[0], j.ankle[1] - 1], 2.2, 'gear'), ...stack(90, 60), line([90, 36], [58, 72], 0.9, 'cable')]), roller([j.ankle[0] + 1.5, j.ankle[1] - 1.5], 2.6)],
  };
}

/** Leg curl seated (legs forward, the heels pull under) or lying face down. */
function legCurl(kind: 'seated' | 'lying' | 'standing', machineKind: 'stack' | 'plate' = 'stack'): Art {
  if (kind === 'lying') {
    const hip: V = [52, 66];
    const base: Pose = { hip, torso: 180, head: -12, hand: [24, 70], elbow: 1, foot: [86, 66], knee: 1, toe: 90 };
    return {
      start: base,
      end: { ...base, foot: [64, 46], knee: 1, toe: 0 },
      work: ['thigh'],
      gear: (j) => [...floor(), ...bench([18, 70], [74, 70]), roller([j.ankle[0], j.ankle[1] - 3], 2.6), ...(machineKind === 'stack' ? [line([j.ankle[0], j.ankle[1] - 3], [88, 80], 0.9, 'cable'), ...stack(92, 60)] : [])],
    };
  }
  if (kind === 'standing') {
    const base = standing({ hip: [46, 56.8], torso: -80, hand: [62, 46], elbow: 1, foot: [50, 91.6], foot2: [50, 91.6] });
    return {
      start: { ...base, foot2: [44, 89], knee2: -1 },
      end: { ...base, foot2: [28, 64], knee2: -1, toe2: -100 },
      work: ['thigh'],
      gear: (j) => [...floor(), line([66, 40], [66, FLOOR], 2, 'gear'), pad([62, 40], [70, 40], 3), ...lever([54, 74], [j.ankle2[0] - 1, j.ankle2[1] - 1], 1.5), roller(j.ankle2, 2.6)],
    };
  }
  const s = seated({ hip: [38, 72], torso: -100, hand: [44, 68], elbow: 1 });
  return {
    start: { ...s, foot: [74, 74], knee: -1, toe: -80 },
    end: { ...s, foot: [56, 89], knee: -1, toe: 10 },
    work: ['thigh'],
    gear: (j) => [...floor(), ...seatFor(s.hip, -100), pad([s.hip[0] + 8, s.hip[1] - 7], [s.hip[0] + 20, s.hip[1] - 7], 3.4), roller([j.ankle[0] + 1, j.ankle[1] + 2.5], 2.6), ...stack(90, 60), line([90, 36], [j.ankle[0] + 1, j.ankle[1] + 2.5], 0.9, 'cable')],
  };
}

/** Hinge: Romanian deadlift (from standing) or deadlift (from the floor). */
function hinge(kind: 'rdl' | 'deadlift' | 'lever' | 'back-ext' | 'machine-ext'): Art {
  if (kind === 'back-ext') {
    const hip: V = [50, 58];
    const legs: Partial<Pose> = { foot: [70, 82], knee: -1, toe: 20 };
    const end: Pose = { hip, torso: -146, head: 0, hand: [44, 40], elbow: 1, ...legs } as Pose;
    end.hand = dir(dir(hip, -146, TORSO), -60, 6);
    const start: Pose = { ...end, torso: -260 + 180, head: 0 };
    start.torso = 100;
    start.hand = dir(dir(hip, 100, TORSO), 60, 8);
    return {
      start,
      end,
      work: ['torso', 'glute'],
      gear: () => [...floor(), pad([44, 62], [58, 70], 4.4), line([58, 70], [74, 84], 2, 'gear'), roller([72, 79], 2.4), line([50, 66], [44, FLOOR], 2, 'gear'), line([74, 84], [84, FLOOR], 2, 'gear')],
    };
  }
  if (kind === 'machine-ext') {
    const s = seated({ hip: [44, 74], torso: -60, hand: [52, 58], elbow: 1 });
    return {
      start: s,
      end: { ...s, torso: -104, hand: [42, 60] },
      work: ['torso'],
      gear: (j) => [...floor(), ...seatFor(s.hip, -90, false), pad([j.shoulder[0] - 7, j.shoulder[1] + 5], [j.shoulder[0] - 3, j.shoulder[1] - 1], 3.6), ...stack(10, 50), line([10, 30], [j.shoulder[0] - 6, j.shoulder[1] + 2], 0.9, 'cable')],
    };
  }
  const top: Pose = standing({ hip: [50, 56.8], hand: [54, 76], elbow: 1, foot: [52, 91.6] });
  const rdlBottom: Pose = { ...top, hip: [40, 60], torso: -28, hand: [56, 85], knee: -1 };
  const dlBottom: Pose = { ...top, hip: [38, 70], torso: -40, hand: [55, 85] };
  const start = kind === 'rdl' ? top : dlBottom;
  const end = kind === 'rdl' ? rdlBottom : top;
  return {
    start,
    end,
    work: ['glute', 'thigh', 'torso'],
    gear: (j) => [...floor(), ...(kind === 'lever' ? [line([88, FLOOR - 1], j.hand, 2.4, 'gear'), circle([88, FLOOR - 1], 2, 'gear')] : [])],
    load: (j) => (kind === 'lever' ? [circle(lerpV([88, FLOOR - 1], j.hand, 0.6), 6, 'load'), circle(lerpV([88, FLOOR - 1], j.hand, 0.6), 1.5, 'loadHub')] : barbell([j.hand[0], Math.min(j.hand[1], FLOOR - 7.5)])),
  };
}

/** Hip thrust: shoulders on the bench, the hips go up. */
function hipThrust(lever = false): Art {
  const start: Pose = { hip: [44, 82], torso: -168, head: -20, hand: [46, 78], elbow: 1, foot: [68, 91.6], knee: -1 };
  const end: Pose = { ...start, hip: [44, 66], torso: -178, head: -38, hand: [46, 64] };
  return {
    start,
    end,
    work: ['glute'],
    gear: () => [...floor(), ...bench([10, 72], [28, 72])],
    load: (j) => (lever ? [line([88, 78], [j.hip[0] + 1, j.hip[1] - 4], 2.4, 'gear'), circle([88, 78], 2, 'gear'), circle(lerpV([88, 78], j.hip, 0.45), 6, 'load')] : barbell([j.hip[0] + 1, j.hip[1] - 7], 7)),
  };
}

/** Lunge / split squat: one leg forward, the other back. */
function lunge(kind: 'reverse' | 'bulgarian' | 'lever'): Art {
  if (kind === 'bulgarian') {
    const top: Pose = { hip: [48, 56], torso: -86, hand: [50, 80], elbow: 1, foot: [60, 91.6], knee: -1, foot2: [24, 64], knee2: -1, toe2: -160 };
    return {
      start: top,
      end: { ...top, hip: [44, 70], hand: [46, 92 - 12] },
      work: ['thigh', 'glute'],
      gear: () => [...floor(), ...bench([12, 68], [30, 68])],
      load: (j) => dumbbell(j.hand),
    };
  }
  const top: Pose = standing({ hand: [51, 80], foot: [52, 91.6], foot2: [50, 91.6] });
  const down: Pose = { ...top, hip: [44, 70], foot: [62, 91.6], foot2: [24, 91.6], knee2: -1, toe2: -15, hand: [46, 82] };
  return {
    start: top,
    end: down,
    work: ['thigh', 'glute'],
    gear: (j) => [...floor(), ...(kind === 'lever' ? [line([88, FLOOR - 1], j.shoulder, 2.4, 'gear'), circle([88, FLOOR - 1], 2, 'gear')] : [])],
    load: (j) => (kind === 'lever' ? [circle(lerpV([88, FLOOR - 1], j.shoulder, 0.55), 6, 'load'), circle(lerpV([88, FLOOR - 1], j.shoulder, 0.55), 1.5, 'loadHub')] : dumbbell(j.hand)),
  };
}

/** Calf raise: up on the toes. */
function calfRaise(kind: 'standing' | 'seated' | 'generic'): Art {
  if (kind === 'seated') {
    const s = seated({ hip: [40, 69], torso: -92, hand: [56, 62], elbow: 1, foot: [59, 86], knee: -1, toe: 0 });
    return {
      start: { ...s, foot: [59, 87], toe: 18 },
      end: { ...s, foot: [60, 83], toe: -22 },
      work: ['shin'],
      gear: (j) => [...floor(), ...seatFor(s.hip, -90, false), pad([j.knee[0] - 6, j.knee[1] - 3.5], [j.knee[0] + 4, j.knee[1] - 3.5], 3.4), rect(55, 88, 15, 6, 'pad', 1), ...lever([24, 62], [j.knee[0] + 2, j.knee[1] - 4.5], 0.3)],
    };
  }
  const base = standing({ hip: [48, 55], foot: [50, 88.5], toe: 14, hand: [44, 33], elbow: -1 });
  return {
    start: base,
    end: { ...base, hip: [48, 49], foot: [50, 82.5], toe: 48 },
    work: ['shin'],
    gear: (j) => [...floor(), rect(46, 88.5, 14, 5.5, 'pad', 1), ...(kind === 'standing' ? [pad([j.shoulder[0] - 5, j.shoulder[1] - 1.5], [j.shoulder[0] + 4, j.shoulder[1] - 1.5], 3.2), ...lever([18, 30], [j.shoulder[0] - 4, j.shoulder[1] - 2], 0.3)] : [])],
  };
}

// Front-view moves (arms out to the sides, legs apart / together).
const frontStand = (over: Partial<FrontPose> = {}): FrontPose => ({ front: true, hip: [50, 57], hand: [61, 80], knee: [55, 74], foot: [56, 91.6], ...over });
const frontSeat = (over: Partial<FrontPose> = {}): FrontPose => ({ front: true, seated: true, hip: [50, 73], hand: [62, 76], knee: [58, 76], foot: [58, 91.6], ...over });

function lateralRaise(kind: 'db' | 'cable' | 'machine'): Art {
  if (kind === 'machine') {
    const s = frontSeat({ hand: [64, 62], elbow: 1 });
    return {
      start: s,
      end: { ...s, hand: [76, 44] },
      work: ['shoulder'],
      gear: (j) => [...floor(), rect(36, 73.5, 28, 4, 'pad', 1.5), line([50, 77.5], [50, FLOOR], 2, 'gear'), pad([j.elbow[0] + 1, j.elbow[1] - 2], [j.elbow[0] - 3, j.elbow[1] + 4], 3), pad([j.elbow2[0] - 1, j.elbow2[1] - 2], [j.elbow2[0] + 3, j.elbow2[1] + 4], 3)],
    };
  }
  const s = frontStand({ hand: [62, 80] });
  return {
    start: s,
    end: { ...s, hand: [84, 37] },
    work: ['shoulder'],
    gear: () => [...floor(), ...(kind === 'cable' ? [circle([20, 90], 2.2, 'gear'), ...stack(12, 70)] : [])],
    load: (j) => (kind === 'cable' ? [line([20, 90], j.hand, 0.9, 'cable'), circle(j.hand, 1.6, 'load')] : [...dumbbellFront(j.hand), ...dumbbellFront(j.hand2)]),
  };
}

/** Fly: arms open, then together in front (`reverse`: the other way round, rear delts). */
function fly(kind: 'cable' | 'machine', reverse = false): Art {
  const machineSeat = kind === 'machine';
  // Pec deck: upper arms out, forearms up; rear delts: straight arms out to the sides.
  const open: FrontPose = reverse
    ? frontSeat({ hand: [84, 48], elbow: 1, reach: 1 })
    : machineSeat
      ? frontSeat({ hand: [70, 34], elbow: 1, reach: 1 })
      : frontStand({ hand: [83, 44], elbow: 1, reach: 1 });
  // Together in front: the arms point at the viewer, so they look short.
  const shut: FrontPose = { ...open, hand: reverse ? [55, 50] : machineSeat ? [54, 38] : [54, 52], elbow: 1, reach: reverse ? 0.42 : 0.6 };
  return {
    start: reverse ? shut : open,
    end: reverse ? open : shut,
    work: reverse ? ['shoulder'] : ['chest'],
    gear: (j) => [
      ...floor(),
      ...(machineSeat ? [rect(36, 73.5, 28, 4, 'pad', 1.5), line([50, 77.5], [50, FLOOR], 2, 'gear'), ...(reverse ? [] : [line(j.hand, [j.hand[0], j.hand[1] - 6], 2.4, 'gear'), line(j.hand2, [j.hand2[0], j.hand2[1] - 6], 2.4, 'gear')])] : [circle([6, 22], 2.2, 'gear'), circle([94, 22], 2.2, 'gear'), line([6, 22], j.hand2, 0.9, 'cable'), line([94, 22], j.hand, 0.9, 'cable'), post(4, 14), post(96, 14)]),
    ],
  };
}

function abduction(kind: 'out' | 'in'): Art {
  const together = frontSeat({ hand: [60, 74], knee: [55, 74], foot: [55, 91.6] });
  const apart: FrontPose = { ...together, knee: [72, 72], foot: [70, 91.6] };
  return {
    start: kind === 'out' ? together : apart,
    end: kind === 'out' ? apart : together,
    work: ['glute', 'thigh'],
    gear: (j) => [...floor(), rect(34, 73.5, 32, 4, 'pad', 1.5), line([50, 77.5], [50, FLOOR], 2, 'gear'), pad([j.knee[0] + (kind === 'out' ? 3 : -3), j.knee[1] - 4], [j.knee[0] + (kind === 'out' ? 3 : -3), j.knee[1] + 8], 3), pad([j.knee2[0] - (kind === 'out' ? 3 : -3), j.knee2[1] - 4], [j.knee2[0] - (kind === 'out' ? 3 : -3), j.knee2[1] + 8], 3)],
  };
}

function shrug(): Art {
  const s = frontStand({ hand: [61, 80] });
  return {
    start: s,
    end: { ...s, shrug: 4, hand: [61, 76] },
    work: ['shoulder'],
    gear: (j) => [...floor(), line([86, FLOOR - 1], j.hand, 2.2, 'gear'), line([14, FLOOR - 1], j.hand2, 2.2, 'gear'), circle([78, 86], 5.5, 'load'), circle([22, 86], 5.5, 'load')],
  };
}

/** Overhead press standing (bar or dumbbells) or seated on a bench. */
function overheadPress(kind: 'bar' | 'db'): Art {
  const base = kind === 'bar' ? standing({ hip: [48, 56.8], foot: [50, 91.6] }) : seated({ hip: [44, 74], torso: -90 });
  const sh = dir(base.hip, base.torso, TORSO);
  const start: Pose = { ...base, hand: [sh[0] + 5, sh[1] - 1], elbow: 1 };
  const end: Pose = { ...base, hand: [sh[0] + 2, sh[1] - 25.5], elbow: 1 };
  return {
    start,
    end,
    work: ['shoulder', 'upper'],
    gear: () => [...floor(), ...(kind === 'db' ? seatFor(base.hip) : [])],
    load: (j) => (kind === 'bar' ? barbell(j.hand, 7) : dumbbell(j.hand)),
  };
}

function facePull(): Art {
  const base = standing({ hip: [46, 56.8], torso: -96, foot: [50, 91.6], foot2: [40, 91.6], knee2: -1 });
  const sh = dir(base.hip, base.torso, TORSO);
  return {
    start: { ...base, hand: [sh[0] + 25, sh[1] - 3], elbow: 1 },
    end: { ...base, hand: [sh[0] + 7, sh[1] - 6], elbow: -1 },
    work: ['shoulder'],
    gear: () => [...floor(), circle([88, 30], 2.2, 'gear'), ...stack(92, 24)],
    load: (j) => [line([88, 30], j.hand, 0.9, 'cable'), circle(j.hand, 1.6, 'load')],
  };
}

function pullover(): Art {
  const base = standing({ hip: [44, 57], torso: -76, foot: [50, 91.6] });
  const sh = dir(base.hip, base.torso, TORSO);
  return {
    start: { ...base, hand: [sh[0] + 20, sh[1] - 18], elbow: -1 },
    end: { ...base, hand: [sh[0] + 6, sh[1] + 24], elbow: 1 },
    work: ['lats'],
    gear: () => [...floor(), circle([84, 10], 2.2, 'gear'), ...stack(90, 14)],
    load: (j) => [line([84, 10], j.hand, 0.9, 'cable'), line([j.hand[0] - 2, j.hand[1]], [j.hand[0] + 3, j.hand[1]], 2, 'load')],
  };
}

function kickback(): Art {
  const base = standing({ hip: [48, 56.8], torso: -76, hand: [70, 40], elbow: 1, foot2: [50, 91.6] });
  return {
    start: { ...base, foot: [54, 88], knee: -1 },
    end: { ...base, foot: [22, 78], knee: -1, toe: 70 },
    work: ['glute'],
    gear: (j) => [...floor(), line([74, 36], [74, FLOOR], 2, 'gear'), circle([80, 90], 2.2, 'gear'), line([80, 90], j.ankle, 0.9, 'cable'), ...stack(88, 70)],
  };
}

/** Hanging from a bar: pull up (`assist`: on a knee pad), or raise the legs. */
function hang(kind: 'pullup' | 'assisted' | 'legs' | 'dip' | 'assisted-dip'): Art {
  if (kind === 'dip' || kind === 'assisted-dip') {
    // The bars run along the body: a level bar at the hands, on two posts; the shins go back.
    const up: Pose = { hip: [51, 50], torso: -90, hand: [53, 52], elbow: 1, foot: [39, 72], knee: -1, toe: 100 };
    const down: Pose = { hip: [47, 62], torso: -75, hand: [54, 52], elbow: 1, foot: [34, 82], knee: -1, toe: 100 };
    return {
      start: up,
      end: down,
      work: ['chest', 'upper'],
      gear: (j) => [
        ...floor(),
        line([40, 54], [68, 54], 2.6, 'gear'),
        post(42, 54),
        post(66, 54),
        ...(kind === 'assisted-dip' ? [pad([j.knee[0] - 6, j.knee[1] + 3], [j.knee[0] + 5, j.knee[1] + 3], 3.4), line([j.knee[0], j.knee[1] + 4.5], [j.knee[0], FLOOR], 1.4, 'gear')] : []),
      ],
    };
  }
  const bar: V = [52, 10];
  if (kind === 'legs') {
    const hangPose: Pose = { hip: [50, 56], torso: -90, hand: [52, 12], elbow: -1, foot: [50, 91], knee: -1 };
    return {
      start: hangPose,
      end: { ...hangPose, hip: [48, 54], torso: -96, foot: [82, 50], knee: -1, toe: -60 },
      work: ['abs'],
      gear: () => [...floor(), circle(bar, 2.2, 'gear'), post(20, 6), line([20, 10], [84, 10], 1.6, 'gear')],
    };
  }
  const low: Pose = { hip: [50, 62], torso: -90, hand: [52, 12], elbow: -1, foot: [44, 92], knee: 1, toe: 60 };
  const high: Pose = { ...low, hip: [50, 44], hand: [52, 12], elbow: 1, foot: [42, 74], knee: 1 };
  return {
    start: low,
    end: high,
    work: ['lats', 'upper'],
    gear: (j) => [
      ...floor(),
      circle(bar, 2.2, 'gear'),
      post(20, 6),
      line([20, 10], [84, 10], 1.6, 'gear'),
      ...(kind === 'assisted' ? [pad([j.knee[0] - 7, j.knee[1] + 2.5], [j.knee[0] + 5, j.knee[1] + 2.5], 3.4), line([j.knee[0] - 1, j.knee[1] + 4], [j.knee[0] - 1, FLOOR], 1.4, 'gear')] : []),
    ],
  };
}

/** Crunch on the floor / on a machine / at a cable; reverse crunch. */
function crunch(kind: 'floor' | 'reverse' | 'cable' | 'machine'): Art {
  if (kind === 'cable') {
    // Kneeling: knees on the floor under the hips, shins along the floor behind.
    const kneel: Pose = { hip: [48, 73], torso: -84, head: 10, hand: [52, 46], elbow: -1, foot: [31.5, 91.6], knee: -1, toe: 180 };
    return {
      start: kneel,
      end: { ...kneel, torso: -22, head: 26, hand: [68, 66] },
      work: ['abs'],
      gear: () => [...floor(), circle([56, 8], 2.2, 'gear'), ...stack(64, 12)],
      load: (j) => [line([56, 8], j.hand, 0.9, 'cable'), circle(j.hand, 1.6, 'load')],
    };
  }
  if (kind === 'machine') {
    const s = seated({ hip: [44, 74], torso: -92, hand: [48, 48], elbow: -1 });
    return {
      start: s,
      end: { ...s, torso: -48, head: 16, hand: [62, 58] },
      work: ['abs'],
      gear: (j) => [...floor(), ...seatFor(s.hip, -90, false), pad([j.shoulder[0] - 3, j.shoulder[1] - 2], [j.shoulder[0] + 6, j.shoulder[1] + 1], 3.4), ...stack(12, 50), line([12, 30], [j.shoulder[0] - 3, j.shoulder[1] - 2], 0.9, 'cable')],
    };
  }
  const lying: Pose = { hip: [56, 90], torso: 180, head: 0, hand: [44, 84], elbow: 1, foot: [74, 91.2], knee: -1 };
  if (kind === 'reverse') {
    const legsUp: Pose = { ...lying, hand: [42, 91], foot: [72, 74], knee: -1, toe: 0 };
    return {
      start: legsUp,
      end: { ...legsUp, hip: [56, 84], torso: 172, foot: [52, 64], knee: -1 },
      work: ['abs'],
      gear: () => [...floor()],
    };
  }
  return {
    start: lying,
    end: { ...lying, torso: -150, head: -6, hand: [52, 74] },
    work: ['abs'],
    gear: () => [...floor()],
  };
}

// ---------- the catalog ----------
export const ARTS: Record<string, Art> = {
  'bench-press': benchPress(),
  'incline-dumbbell-press': benchPress({ incline: 32, db: true }),
  'smith-incline-press': benchPress({ incline: 30, smith: true }),
  'machine-chest-press': machinePress('stack', false),
  'stack-chest-press': machinePress('stack', false),
  'plate-chest-press': machinePress('plate', false),
  'plate-incline-press': machinePress('plate', true),
  'cable-fly': fly('cable'),
  'pec-deck': fly('machine'),
  'stack-pec-fly': fly('machine'),
  dips: hang('dip'),
  'stack-assisted-dip': hang('assisted-dip'),
  'pull-up': hang('pullup'),
  'assisted-pull-up': hang('assisted'),
  'hanging-leg-raise': hang('legs'),
  'lat-pulldown': pulldown('cable'),
  'stack-lat-pulldown': pulldown('stack'),
  'plate-lat-pulldown': pulldown('plate'),
  'seated-row': seatedRow('cable'),
  'stack-seated-row': seatedRow('stack'),
  'plate-seated-row': seatedRow('plate'),
  'plate-low-row': seatedRow('plate', true),
  'chest-supported-row': chestRow(),
  'barbell-row': bentRow('bar'),
  't-bar-row': bentRow('lever'),
  'plate-dorian-row': bentRow('lever'),
  'one-arm-row': bentRow('one'),
  'cable-pullover': pullover(),
  'back-extension': hinge('back-ext'),
  'stack-back-extension': hinge('machine-ext'),
  'back-squat': squat('bar'),
  'front-squat': squat('front'),
  'smith-squat': squat('smith'),
  'hack-squat': squat('hack'),
  'pendulum-squat': squat('pendulum'),
  'plate-belt-squat': squat('belt'),
  'leg-press': legPress('plate'),
  'plate-leg-press': legPress('plate'),
  'stack-leg-press': legPress('stack'),
  'leg-press-calf': legPress('plate', true),
  'leg-extension': legExtension('stack'),
  'stack-leg-extension': legExtension('stack'),
  'plate-leg-extension': legExtension('plate'),
  'leg-curl': legCurl('lying'),
  'lying-leg-curl': legCurl('lying'),
  'stack-lying-leg-curl': legCurl('lying'),
  'seated-leg-curl': legCurl('seated'),
  'stack-seated-leg-curl': legCurl('seated'),
  'plate-standing-leg-curl': legCurl('standing', 'plate'),
  rdl: hinge('rdl'),
  deadlift: hinge('deadlift'),
  'plate-deadlift': hinge('lever'),
  'hip-thrust': hipThrust(),
  'plate-hip-thrust': hipThrust(true),
  'bulgarian-split-squat': lunge('bulgarian'),
  'reverse-lunge': lunge('reverse'),
  'plate-lunge': lunge('lever'),
  'cable-kickback': kickback(),
  'hip-abduction': abduction('out'),
  'stack-hip-abduction': abduction('out'),
  'hip-adduction': abduction('in'),
  'stack-hip-adduction': abduction('in'),
  'calf-raise': calfRaise('standing'),
  'standing-calf-raise': calfRaise('standing'),
  'seated-calf-raise': calfRaise('seated'),
  'overhead-press': overheadPress('bar'),
  'dumbbell-shoulder-press': overheadPress('db'),
  'machine-shoulder-press': machinePress('stack', true),
  'stack-shoulder-press': machinePress('stack', true),
  'plate-shoulder-press': machinePress('plate', true),
  'lateral-raise': lateralRaise('db'),
  'cable-lateral-raise': lateralRaise('cable'),
  'machine-lateral-raise': lateralRaise('machine'),
  'stack-lateral-raise': lateralRaise('machine'),
  'rear-delt-fly': fly('machine', true),
  'reverse-pec-deck': fly('machine', true),
  'stack-rear-delt': fly('machine', true),
  'face-pull': facePull(),
  'plate-shrug': shrug(),
  'barbell-curl': curl('bar'),
  'dumbbell-curl': curl('db'),
  'hammer-curl': curl('hammer'),
  'cable-curl': curl('cable'),
  'preacher-curl': curl('preacher'),
  'incline-curl': curl('incline'),
  'bayesian-curl': curl('bayesian'),
  'stack-biceps-curl': curl('machine'),
  'triceps-pushdown': triceps('pushdown'),
  'overhead-triceps': triceps('overhead'),
  'lying-triceps-extension': benchPress({ triceps: true }),
  'stack-triceps-press': triceps('press'),
  'plate-triceps': triceps('machine'),
  crunch: crunch('floor'),
  'reverse-crunch': crunch('reverse'),
  'cable-crunch': crunch('cable'),
  'stack-ab-crunch': crunch('machine'),
  'plate-ab-crunch': crunch('machine'),
};

/** Muscle group of an own exercise from its first muscle (when the group is not known). */
const GROUP_OF: Record<string, string> = {
  chest: 'Грудь',
  lats: 'Спина',
  upperBack: 'Спина',
  delts: 'Плечи',
  biceps: 'Бицепс',
  triceps: 'Трицепс',
  quads: 'Квадрицепс',
  hamstrings: 'Бицепс бедра',
  glutes: 'Ягодицы',
  abductors: 'Ягодицы',
  adductors: 'Приводящие',
  calves: 'Икры',
  abs: 'Пресс',
  erectors: 'Разгибатели',
};
export interface ArtSubject {
  exerciseId?: string;
  id?: string;
  muscleGroup?: string;
  equipment?: string;
  muscles?: string[];
}

/** A picture for any exercise: its own, or one of its muscle group (the trainer's own exercises). */
export function artFor(e: ArtSubject): Art {
  const id = e.exerciseId || e.id || '';
  if (ARTS[id]) return ARTS[id];
  const g = e.muscleGroup || GROUP_OF[e.muscles?.[0] || ''] || '';
  const eq = e.equipment || '';
  const machineKind = /блин/i.test(eq) ? 'plate' : 'stack';
  if (/Грудь/.test(g)) return /Гантел/.test(eq) ? ARTS['incline-dumbbell-press'] : /Тренаж|Смит/.test(eq) ? machinePress(machineKind, false) : ARTS['bench-press'];
  if (/Спина|Широч/.test(g)) return /Блок/.test(eq) ? ARTS['lat-pulldown'] : /Тренаж/.test(eq) ? seatedRow(machineKind) : ARTS['barbell-row'];
  if (/Разгибатели/.test(g)) return ARTS['back-extension'];
  if (/Квадрицепс/.test(g)) return /Тренаж/.test(eq) ? legPress(machineKind) : ARTS['back-squat'];
  if (/Бицепс бедра|Задняя/.test(g)) return /Тренаж/.test(eq) ? ARTS['lying-leg-curl'] : ARTS.rdl;
  if (/Ягодиц/.test(g)) return ARTS['hip-thrust'];
  if (/Приводящ/.test(g)) return ARTS['hip-adduction'];
  if (/Икр/.test(g)) return ARTS['standing-calf-raise'];
  if (/Плеч/.test(g)) return ARTS['lateral-raise'];
  if (/Бицепс/.test(g)) return /Блок/.test(eq) ? ARTS['cable-curl'] : ARTS['dumbbell-curl'];
  if (/Трицепс/.test(g)) return ARTS['triceps-pushdown'];
  if (/Пресс|Кор/.test(g)) return ARTS.crunch;
  return ARTS['back-squat'];
}

// ---------- rendering ----------
const SEG_W = { torso: 9.5, upper: 5.6, fore: 4.6, thigh: 7.4, shin: 5.8, foot: 3.2 };

function Body({ j, work, ghost }: { j: Joints; work: Seg[]; ghost?: boolean }) {
  const w = (s: Seg) => !ghost && work.includes(s);
  const cls = (s: Seg | null, far = false) => 'xa-' + (ghost ? 'ghost' : s && w(s) ? 'work' : far ? 'far' : 'body');
  const L = (a: V, b: V, width: number, c: string, key: string) => (
    <line key={key} x1={a[0].toFixed(2)} y1={a[1].toFixed(2)} x2={b[0].toFixed(2)} y2={b[1].toFixed(2)} strokeWidth={width} className={c} />
  );
  const torsoWork = w('torso') || w('chest') || w('lats') || w('abs');
  if (j.front) {
    const sR = j.shoulderR!;
    const sL = j.shoulderL!;
    const hR = j.hipR!;
    const hL = j.hipL!;
    const thighW = j.seated ? 8.2 : SEG_W.thigh;
    return (
      <g>
        {L(hL, j.knee2, thighW, cls('thigh'), 'tl')}
        {L(j.knee2, j.ankle2, SEG_W.shin, cls('shin'), 'sl')}
        {L(j.ankle2, j.toe2, SEG_W.foot, cls(null), 'fl')}
        {L(hR, j.knee, thighW, cls('thigh'), 'tr')}
        {L(j.knee, j.ankle, SEG_W.shin, cls('shin'), 'sr')}
        {L(j.ankle, j.toe, SEG_W.foot, cls(null), 'fr')}
        <path
          d={`M${hL[0] - 1} ${hL[1] + 2} L${sL[0] + 0.5} ${sL[1] + 1} L${sR[0] - 0.5} ${sR[1] + 1} L${hR[0] + 1} ${hR[1] + 2} Z`}
          className={(ghost ? 'xa-ghost' : torsoWork ? 'xa-work' : 'xa-body') + ' xa-fill'}
          strokeWidth={5}
        />
        {w('shoulder') && <circle cx={sR[0]} cy={sR[1] + 1} r={3.6} className="xa-work xa-fill" />}
        {w('shoulder') && <circle cx={sL[0]} cy={sL[1] + 1} r={3.6} className="xa-work xa-fill" />}
        {L(sL, j.elbow2, SEG_W.upper, cls('upper'), 'ul')}
        {L(j.elbow2, j.hand2, SEG_W.fore, cls('fore'), 'al')}
        {L(sR, j.elbow, SEG_W.upper, cls('upper'), 'ur')}
        {L(j.elbow, j.hand, SEG_W.fore, cls('fore'), 'ar')}
        <circle cx={j.head[0]} cy={j.head[1]} r={HEAD} className={(ghost ? 'xa-ghost' : 'xa-body') + ' xa-fill'} />
      </g>
    );
  }
  return (
    <g>
      {L(j.shoulder, j.elbow2, SEG_W.upper, cls('upper', true), 'u2')}
      {L(j.elbow2, j.hand2, SEG_W.fore, cls('fore', true), 'a2')}
      {L(j.hip, j.knee2, SEG_W.thigh, cls('thigh', true), 't2')}
      {L(j.knee2, j.ankle2, SEG_W.shin, cls('shin', true), 's2')}
      {L(j.ankle2, j.toe2, SEG_W.foot, cls(null, true), 'f2')}
      {L(j.hip, j.shoulder, SEG_W.torso, torsoWork ? cls('torso') : ghost ? 'xa-ghost' : 'xa-body', 'torso')}
      {w('glute') && <circle cx={j.hip[0]} cy={j.hip[1]} r={5.2} className="xa-work xa-fill" />}
      {w('shoulder') && <circle cx={j.shoulder[0]} cy={j.shoulder[1]} r={4} className="xa-work xa-fill" />}
      {L(j.hip, j.knee, SEG_W.thigh, cls('thigh'), 't')}
      {L(j.knee, j.ankle, SEG_W.shin, cls('shin'), 's')}
      {L(j.ankle, j.toe, SEG_W.foot, cls(null), 'f')}
      <circle cx={j.head[0]} cy={j.head[1]} r={HEAD} className={(ghost ? 'xa-ghost' : 'xa-body') + ' xa-fill'} />
      {L(j.shoulder, j.elbow, SEG_W.upper, cls('upper'), 'u')}
      {L(j.elbow, j.hand, SEG_W.fore, cls('fore'), 'a')}
    </g>
  );
}

function Shapes({ list }: { list: Shape[] }) {
  return (
    <>
      {list.map((s, i) => {
        if (s.k === 'line')
          return <line key={i} x1={s.a[0].toFixed(2)} y1={s.a[1].toFixed(2)} x2={s.b[0].toFixed(2)} y2={s.b[1].toFixed(2)} strokeWidth={s.w} className={'xg-' + s.c} />;
        if (s.k === 'circle') return <circle key={i} cx={s.at[0].toFixed(2)} cy={s.at[1].toFixed(2)} r={s.r} className={'xg-' + s.c + ' xa-fill'} />;
        if (s.k === 'rect') return <rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.rx} className={'xg-' + s.c + ' xa-fill'} />;
        return <path key={i} d={s.d} strokeWidth={s.w} className={'xg-' + s.c} fill={s.fill || 'none'} />;
      })}
    </>
  );
}

function Scene({ art, pose, ghost }: { art: Art; pose: AnyPose; ghost?: AnyPose }) {
  const j = jointsOf(pose);
  return (
    <>
      <Shapes list={art.gear ? art.gear(j) : floor()} />
      {ghost && <Body j={jointsOf(ghost)} work={[]} ghost />}
      <Body j={j} work={art.work || []} />
      {art.load && <Shapes list={art.load(j)} />}
    </>
  );
}

type Phase = 'start' | 'end';

/** The part of the picture with the figure and its equipment (both positions), as a square viewBox. */
const boundsCache = new WeakMap<Art, string>();
function cropOf(art: Art) {
  const hit = boundsCache.get(art);
  if (hit) return hit;
  let x0 = 100;
  let y0 = 100;
  let x1 = 0;
  let y1 = 0;
  const add = (v: V, r = 0) => {
    x0 = Math.min(x0, v[0] - r);
    y0 = Math.min(y0, v[1] - r);
    x1 = Math.max(x1, v[0] + r);
    y1 = Math.max(y1, v[1] + r);
  };
  for (const pose of [art.start, art.end]) {
    const j = jointsOf(pose);
    for (const v of Object.values(j)) if (Array.isArray(v)) add(v as V, 4);
    add(j.head, HEAD + 0.5);
    for (const sh of [...(art.gear ? art.gear(j) : []), ...(art.load ? art.load(j) : [])]) {
      if (sh.k === 'line') {
        if (sh.c === 'floor') continue;
        add(sh.a, sh.w / 2);
        add(sh.b, sh.w / 2);
      } else if (sh.k === 'circle') add(sh.at, sh.r);
      else if (sh.k === 'rect') {
        add([sh.x, sh.y]);
        add([sh.x + sh.w, sh.y + sh.h]);
      }
    }
  }
  y1 = Math.max(y1, FLOOR + 1);
  const side = Math.max(56, x1 - x0 + 6, y1 - y0 + 6);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const box = `${(cx - side / 2).toFixed(1)} ${(cy - side / 2).toFixed(1)} ${side.toFixed(1)} ${side.toFixed(1)}`;
  boundsCache.set(art, box);
  return box;
}

/** One position of an exercise; `ghost` shows the other position faintly behind; `crop` zooms to the figure. */
export function ExercisePose({ art, phase, size = 96, ghost = false, crop = false, title }: { art: Art; phase: Phase; size?: number; ghost?: boolean; crop?: boolean; title?: string }) {
  const pose = phase === 'start' ? art.start : art.end;
  const other = phase === 'start' ? art.end : art.start;
  return (
    <svg className="xa" viewBox={crop ? cropOf(art) : '0 0 100 100'} width={size} height={size} role="img" aria-label={title}>
      <Scene art={art} pose={pose} ghost={ghost ? other : undefined} />
    </svg>
  );
}

/** The exercise moving from the start to the end and back (still with «reduce motion»). */
export function ExerciseMotion({ art, size = 200 }: { art: Art; size?: number }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      // 2.8 s a repetition: there, a short hold, back, a short pause.
      const p = ((now - t0) / 2800) % 1;
      const k = p < 0.4 ? p / 0.4 : p < 0.5 ? 1 : p < 0.9 ? 1 - (p - 0.5) / 0.4 : 0;
      setT(k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <svg className="xa" viewBox={cropOf(art)} width={size} height={size} role="img" aria-label="Движение">
      <Scene art={art} pose={mixPose(art.start, art.end, t)} />
    </svg>
  );
}

/** Small picture for lists: the end position over a faint start, zoomed to the figure. Drawn again only for another exercise. */
export const ExerciseThumb = memo(
  function ExerciseThumb({ exercise, size = 40 }: { exercise: ArtSubject; size?: number }) {
    return (
      <span className="xa-thumb" style={{ width: size, height: size }} aria-hidden="true">
        <ExercisePose art={artFor(exercise)} phase="end" size={size} ghost crop />
      </span>
    );
  },
  (a, b) =>
    a.size === b.size &&
    (a.exercise.exerciseId || a.exercise.id) === (b.exercise.exerciseId || b.exercise.id) &&
    a.exercise.equipment === b.exercise.equipment &&
    a.exercise.muscleGroup === b.exercise.muscleGroup &&
    (a.exercise.muscles || []).join() === (b.exercise.muscles || []).join(),
);

/** The movement, then the start and the end side by side. */
export function ExerciseFigures({ exercise }: { exercise: ArtSubject }) {
  const art = artFor(exercise);
  return (
    <div className="xa-figures">
      <div className="xa-motion">
        <ExerciseMotion art={art} size={190} />
      </div>
      <div className="xa-pair">
        <figure>
          <ExercisePose art={art} phase="start" size={132} crop />
          <figcaption>Начало</figcaption>
        </figure>
        <figure>
          <ExercisePose art={art} phase="end" size={132} crop />
          <figcaption>Конец</figcaption>
        </figure>
      </div>
    </div>
  );
}

/** How an exercise is done: the pictures, the body position and the muscles it works. */
export function ExerciseInfoSheet({ exercise, name, onClose }: { exercise: ArtSubject; name: string; onClose: () => void }) {
  const rule = exerciseRules[exercise.exerciseId || exercise.id || ''];
  return (
    <Sheet title={name} onClose={onClose}>
      <ExerciseFigures exercise={exercise} />
      {rule ? (
        <p className="small xa-note">
          <b>{rule.position}.</b> {rule.note}
          <br />
          <span className="muted">
            Основные: {rule.primary.map((m) => muscleNames[m]).join(', ')}
            {rule.secondary.length ? ' · косвенно: ' + rule.secondary.map((m) => muscleNames[m]).join(', ') : ''}
          </span>
        </p>
      ) : (
        (exercise.muscleGroup || exercise.equipment) && (
          <p className="small muted xa-note">{[exercise.muscleGroup, exercise.equipment].filter(Boolean).join(' · ')}</p>
        )
      )}
    </Sheet>
  );
}
