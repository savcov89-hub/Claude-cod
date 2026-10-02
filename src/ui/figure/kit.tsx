// Shared parts for the exercises: the move description, points on the body, seats, benches, machines.
import { G, type Gear, type Muscle } from './draw';
import { FLOOR, add, dirOf, joints, sub, type Joints, type Pose, type V } from './rig';

export interface Move {
  /** Key poses: start, (middle,) end. The animation goes there and back. */
  frames: Pose[];
  work: Muscle[];
  gear: (j: Joints) => Gear[];
  /** Arms out to the sides (wide grip): their angles are not checked as seen from the side. */
  wideArms?: boolean;
  /** Feet that must stand flat on the floor (standing or sitting). */
  standing?: boolean;
  /** The weight must stay over the middle of the foot (the bar's point, ±). */
  balance?: (j: Joints) => V;
  /** Points of the equipment the picture must show (besides the person). */
  show?: V[];
  /** No light outline around the near arm (when it lies over the head, like holding a bar on the back). */
  noHalo?: boolean;
  /** Size of what the hands hold (a plate's radius), kept in the picture. */
  handGear?: number;
}

export const ANKLE_Y = FLOOR - 3;
export { G, FLOOR, add, sub, dirOf, joints };
export type { Gear, Joints, Pose, V, Muscle };

/** A point in the trunk's frame: along the spine from the shoulder / hip (+ up) and towards the front. */
export const onTrunk = (j: Joints, base: 'shoulder' | 'hip', along: number, front: number): V =>
  add(add(base === 'shoulder' ? j.shoulder : j.hip, j.up, along), j.front, front);

/** World point → the trunk frame of a pose ([along the spine from the shoulder, to the front]). */
export function trunkFrame(j: Joints, p: V, base: 'shoulder' | 'hip' = 'shoulder'): V {
  const d = sub(p, base === 'shoulder' ? j.shoulder : j.hip);
  return [d[0] * j.up[0] + d[1] * j.up[1], d[0] * j.front[0] + d[1] * j.front[1]];
}

/** Sitting on a seat: thighs level, feet flat on the floor in front. */
export const SEAT_HIP_Y = ANKLE_Y - 17.5 - 0.3;
export const seatedLegs = { a: 90, b: 2, foot: 90 };
/** Feet flat on the floor at `x` (the ankle), knees up and forward: whatever the hip does. */
export const feetAt = (x: number, bend: V = [0.6, -1]) => ({ reach: { to: [x, ANKLE_Y] as V, bend }, foot: 90 });

/** A seat under the hip and a back rest along the trunk (angle as the pose's trunk), with a post to the floor. */
export function seat(hip: V, trunk: number, o: { back?: number; front?: number; rest?: number; post?: boolean } = {}): Gear[] {
  const top = hip[1] + 4.6;
  const out: Gear[] = [
    { layer: 'back', node: G.pad([hip[0] - (o.back ?? 6.5), top], [hip[0] + (o.front ?? 9), top], 3) },
  ];
  if (o.post !== false) {
    out.push({ layer: 'back', node: G.bar([hip[0] + 1, top + 3], [hip[0] + 1, FLOOR], 2.2) });
    out.push({ layer: 'back', node: G.bar([hip[0] - 7, FLOOR], [hip[0] + 9, FLOOR], 2.2) });
  }
  if (o.rest) {
    const up = dirOf(180 - trunk);
    const back: V = [up[1], -up[0]];
    const a = add(add(hip, back, 5.6), up, 1);
    out.push({ layer: 'back', node: G.pad(a, add(a, up, o.rest), 3) });
  }
  return out;
}

/** A weight-stack tower: a column from the floor to `top`, plates near the floor, a pulley on top. */
export function tower(x: number, top: number, o: { stackX?: number } = {}): Gear[] {
  const sx = o.stackX ?? x + 5;
  return [
    { layer: 'back', node: G.bar([x, FLOOR], [x, top], 2.4) },
    { layer: 'back', node: G.stack(sx, 74, 6, 8) },
    { layer: 'back', node: G.bar([sx, 72.5], [sx, top + 4], 0.9) },
  ];
}

/** A lever arm from its pivot to the handle, with a plate horn (plate-loaded machines) or a cable to a stack. */
export function lever(pivot: V, handle: V, o: { plate?: number; plateR?: number } = {}): Gear[] {
  const out: Gear[] = [
    { layer: 'back', node: G.bar(pivot, handle, 2.2) },
    { layer: 'back', node: G.wheel(pivot, 1.6) },
  ];
  if (o.plate !== undefined) {
    const at = add(pivot, sub(handle, pivot), o.plate);
    out.unshift({ layer: 'back', node: G.plate(at, o.plateR ?? 6.5) });
  }
  return out;
}

/** The person's joints at a key pose (to place equipment once). */
export const at = (p: Pose) => joints(p);
