// A person seen from the side (facing right), posed by joint angles. Lengths are fixed, so arms and legs never
// stretch; joints have human limits (checked by scripts/check-figures.ts). Drawing is in figure/draw.tsx.
//
// Angles are in degrees, measured from straight down, positive towards the front (the right):
//   0 — hanging down, 90 — pointing forward, 180 — straight up, -90 — pointing back.
// The trunk is measured from straight up: 0 — upright, 90 — bent over flat, -90 — lying on the back, head left.

export type V = [number, number];

/** Scene: 0..100 both ways, the floor at y = FLOOR. About 2,4 cm a unit (a person of 178 cm is 73 units). */
export const FLOOR = 92;

export const BODY = {
  trunk: 25, // hip joint → shoulder joint
  neck: 2.6,
  head: 5.3,
  upper: 13.5,
  fore: 12,
  thigh: 18.5,
  shin: 17.5,
  ankle: 3, // ankle above the sole
  toe: 7.2, // ankle → toes along the foot
  heel: 1.8,
};

/** Where a limb's end goes instead of an angle: a grip on a bar, a foot on a platform. */
export interface Reach {
  /** The point to reach (world, or relative to `from`). */
  to: V;
  /** Relative to the shoulder / hip, in the trunk's frame ([along the spine, towards the front]). */
  from?: 'shoulder' | 'hip';
  /** Which way the middle joint (elbow / knee) points, roughly. */
  bend: V;
  /** The limb seen at an angle (a wide grip): shorter on the picture. */
  shorten?: number;
}

export interface Limb {
  /** Upper part (upper arm / thigh) angle, or a point the limb reaches. */
  a?: number;
  /** Lower part (forearm / shin) angle. */
  b?: number;
  reach?: Reach;
  /** Foot angle (legs only); 90 — flat on the floor. */
  foot?: number;
}

export interface Pose {
  /** Which point of the body stays where: the ankle (standing), the hip (sitting, lying) or the hands (hanging). */
  anchor: { at: 'ankle' | 'hip' | 'shoulder'; to: V };
  trunk: number;
  /** Head nod relative to the trunk (+ chin down to the chest). */
  head?: number;
  leg: Limb;
  arm: Limb;
  /** The other side when it differs (one-arm exercises); otherwise it copies the near side. */
  farLeg?: Limb;
  farArm?: Limb;
}

export interface Joints {
  hip: V;
  shoulder: V;
  neck: V;
  head: V;
  /** Unit vectors of the trunk: up the spine and to the front. */
  up: V;
  front: V;
  knee: V;
  ankle: V;
  toe: V;
  heel: V;
  elbow: V;
  hand: V;
  knee2: V;
  ankle2: V;
  toe2: V;
  heel2: V;
  elbow2: V;
  hand2: V;
  /** Angles as drawn (for the joint checks). */
  angles: { trunk: number; thigh: number; shin: number; foot: number; upper: number; fore: number; thigh2: number; shin2: number; upper2: number; fore2: number; head: number };
  /** A limb that could not reach its point. */
  short: string[];
}

const rad = (d: number) => (d * Math.PI) / 180;
/** Direction of an angle measured from straight down, positive to the front (right). */
export const dirOf = (deg: number): V => [Math.sin(rad(deg)), Math.cos(rad(deg))];
export const angleOf = (v: V) => (Math.atan2(v[0], v[1]) * 180) / Math.PI;
export const add = (a: V, b: V, k = 1): V => [a[0] + b[0] * k, a[1] + b[1] * k];
export const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1]];
export const len = (v: V) => Math.hypot(v[0], v[1]);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerpV = (a: V, b: V, t: number): V => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

/** Two-part limb from `root` to `end`; the middle joint goes to the side of `bend`. */
function solve(root: V, end: V, a: number, b: number, bend: V): { mid: V; end: V; ok: boolean } {
  const d0 = len(sub(end, root));
  const d = Math.min(Math.max(d0, Math.abs(a - b) + 0.01), a + b - 0.01);
  const ux: V = [(end[0] - root[0]) / (d0 || 1), (end[1] - root[1]) / (d0 || 1)];
  const along = (a * a - b * b + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, a * a - along * along));
  const n1: V = [-ux[1], ux[0]];
  const side = n1[0] * bend[0] + n1[1] * bend[1] >= 0 ? 1 : -1;
  const mid = add(add(root, ux, along), n1, h * side);
  const realEnd = add(root, ux, d);
  return { mid, end: realEnd, ok: d0 <= a + b + 0.05 && d0 >= Math.abs(a - b) - 0.05 };
}

/** Joint positions of a pose. */
export function joints(p: Pose): Joints {
  const short: string[] = [];
  const up = dirOf(180 - p.trunk);
  const front: V = [-up[1], up[0]];
  const inTrunk = (o: V, base: V): V => add(add(base, up, o[0]), front, o[1]);
  const at0: V = [0, 0];
  const hip0 = at0;
  const shoulder0 = add(hip0, up, BODY.trunk);

  const leg = (l: Limb, name: string) => {
    let knee: V, ankle: V, thigh: number, shin: number;
    if (l.reach) {
      const k = l.reach.shorten ?? 1;
      const target = l.reach.from ? inTrunk(l.reach.to, l.reach.from === 'hip' ? hip0 : shoulder0) : l.reach.to;
      const r = solve(hip0, target, BODY.thigh * k, BODY.shin * k, l.reach.bend);
      if (!r.ok) short.push(name);
      knee = r.mid;
      ankle = r.end;
      thigh = angleOf(sub(knee, hip0));
      shin = angleOf(sub(ankle, knee));
    } else {
      thigh = l.a ?? 0;
      shin = l.b ?? 0;
      knee = add(hip0, dirOf(thigh), BODY.thigh);
      ankle = add(knee, dirOf(shin), BODY.shin);
    }
    const foot = l.foot ?? 90;
    const fd = dirOf(foot);
    return { knee, ankle, toe: add(ankle, fd, BODY.toe), heel: add(ankle, fd, -BODY.heel), thigh, shin, foot };
  };
  const arm = (l: Limb, name: string) => {
    const s = add(shoulder0, front, 0.4);
    let elbow: V, hand: V, upper: number, fore: number;
    if (l.reach) {
      const k = l.reach.shorten ?? 1;
      const target = l.reach.from ? inTrunk(l.reach.to, l.reach.from === 'hip' ? hip0 : shoulder0) : l.reach.to;
      const r = solve(s, target, BODY.upper * k, BODY.fore * k, l.reach.bend);
      if (!r.ok) short.push(name);
      elbow = r.mid;
      hand = r.end;
      upper = angleOf(sub(elbow, s));
      fore = angleOf(sub(hand, elbow));
    } else {
      upper = l.a ?? 0;
      fore = l.b ?? upper;
      elbow = add(s, dirOf(upper), BODY.upper);
      hand = add(elbow, dirOf(fore), BODY.fore);
    }
    return { elbow, hand, upper, fore };
  };

  // Reaches given in world coordinates are solved after the body is placed: place first with angles, then redo.
  const placeOnce = (offset: V) => {
    const shift = (v: V): V => add(v, offset);
    const world = (l: Limb): Limb =>
      l.reach && !l.reach.from ? { ...l, reach: { ...l.reach, to: sub(l.reach.to, offset) } } : l;
    const L = leg(world(p.leg), 'leg');
    const L2 = leg(world(p.farLeg || p.leg), 'farLeg');
    const A = arm(world(p.arm), 'arm');
    const A2 = arm(world(p.farArm || p.arm), 'farArm');
    const headDir = dirOf(180 - p.trunk - (p.head ?? 0));
    const neck = add(shoulder0, headDir, BODY.neck * 0.6);
    const head = add(add(shoulder0, headDir, BODY.neck + BODY.head * 0.92), [-headDir[1], headDir[0]], 0.9);
    return {
      hip: shift(hip0),
      shoulder: shift(shoulder0),
      neck: shift(neck),
      head: shift(head),
      up,
      front,
      knee: shift(L.knee),
      ankle: shift(L.ankle),
      toe: shift(L.toe),
      heel: shift(L.heel),
      elbow: shift(A.elbow),
      hand: shift(A.hand),
      knee2: shift(L2.knee),
      ankle2: shift(L2.ankle),
      toe2: shift(L2.toe),
      heel2: shift(L2.heel),
      elbow2: shift(A2.elbow),
      hand2: shift(A2.hand),
      angles: {
        trunk: p.trunk,
        thigh: L.thigh,
        shin: L.shin,
        foot: L.foot,
        upper: A.upper,
        fore: A.fore,
        thigh2: L2.thigh,
        shin2: L2.shin,
        upper2: A2.upper,
        fore2: A2.fore,
        head: p.head ?? 0,
      },
      short: [] as string[],
    };
  };
  // Where the anchor point is with the hip at 0, then move everything so it lands on `to`.
  const probe = placeOnce([0, 0]);
  const anchorAt = p.anchor.at === 'hip' ? probe.hip : p.anchor.at === 'shoulder' ? probe.shoulder : probe.ankle;
  short.length = 0;
  const j = placeOnce(sub(p.anchor.to, anchorAt));
  j.short = [...new Set(short)];
  return j;
}

/** A pose between two others: every angle and point goes its own way, evenly. */
export function mix(a: Pose, b: Pose, t: number): Pose {
  const n = (x: number | undefined, y: number | undefined) => (x === undefined || y === undefined ? (t < 0.5 ? x : y) : lerp(x, y, t));
  const reach = (x?: Reach, y?: Reach): Reach | undefined =>
    x && y ? { ...y, to: lerpV(x.to, y.to, t), shorten: n(x.shorten ?? 1, y.shorten ?? 1) } : t < 0.5 ? x : y;
  const limb = (x: Limb, y: Limb): Limb => ({ a: n(x.a, y.a), b: n(x.b, y.b), foot: n(x.foot, y.foot), reach: reach(x.reach, y.reach) });
  return {
    anchor: { at: b.anchor.at, to: lerpV(a.anchor.to, b.anchor.to, t) },
    trunk: lerp(a.trunk, b.trunk, t),
    head: n(a.head ?? 0, b.head ?? 0),
    leg: limb(a.leg, b.leg),
    arm: limb(a.arm, b.arm),
    farLeg: a.farLeg || b.farLeg ? limb(a.farLeg || a.leg, b.farLeg || b.leg) : undefined,
    farArm: a.farArm || b.farArm ? limb(a.farArm || a.arm, b.farArm || b.arm) : undefined,
  };
}

/** Human joint limits; what is out of them, in words (for the checks). */
export function jointProblems(j: Joints, opts: { wideArms?: boolean } = {}): string[] {
  const out: string[] = [];
  const g = j.angles;
  const norm = (x: number) => ((((x + 180) % 360) + 360) % 360) - 180;
  const check = (what: string, v: number, lo: number, hi: number) => {
    if (v < lo - 0.5 || v > hi + 0.5) out.push(`${what} ${v.toFixed(0)}° (можно ${lo}…${hi})`);
  };
  for (const [s, th, sh, ft] of [
    ['', g.thigh, g.shin, g.foot],
    [' (дальняя)', g.thigh2, g.shin2, g.foot],
  ] as Array<[string, number, number, number]>) {
    check('колено' + s, norm(th - sh), -2, 155);
    check('таз' + s, norm(th + g.trunk), -35, 150);
    check('голеностоп' + s, norm(ft - sh), 35, 132);
  }
  if (!opts.wideArms)
    for (const [s, up, fo] of [
      ['', g.upper, g.fore],
      [' (дальняя)', g.upper2, g.fore2],
    ] as Array<[string, number, number]>) {
      check('локоть' + s, norm(fo - up), -5, 155);
      const sh = norm(up + g.trunk);
      check('плечо' + s, sh < -120 ? sh + 360 : sh, -70, 190);
    }
  check('шея', g.head, -45, 50);
  for (const s of j.short) out.push('не дотягивается: ' + s);
  return out;
}
