// Exercise pictures: one pose, and the movement there and back.
import { useEffect, useState } from 'react';
import { Person } from './draw';
import { frontJoints, mixFront, PersonFront, type FrontMove, type FrontPose } from './front';
import { MOVES, type AnyMove, type Move } from './moves';
import { FLOOR, BODY, joints, mix, type Pose, type V } from './rig';

export { MOVES };
export type { Move, AnyMove, FrontMove };

const isFront = (m: AnyMove): m is FrontMove => 'view' in m && m.view === 'front';

/** The pose at `t` of the movement (0 — start, 1 — end), through the middle frames if any. */
export function poseAt(m: Move, t: number): Pose {
  const k = Math.max(0, Math.min(1, t)) * (m.frames.length - 1);
  const i = Math.min(m.frames.length - 2, Math.floor(k));
  return mix(m.frames[i], m.frames[i + 1], k - i);
}
export function frontPoseAt(m: FrontMove, t: number): FrontPose {
  const k = Math.max(0, Math.min(1, t)) * (m.frames.length - 1);
  const i = Math.min(m.frames.length - 2, Math.floor(k));
  return mixFront(m.frames[i], m.frames[i + 1], k - i);
}

const views = new WeakMap<AnyMove, string>();
const tight = new WeakMap<AnyMove, string>();
/**
 * The square part of the scene with the person (all along the movement) and the equipment that matters;
 * `close` — only the person at the end of the movement (small pictures in lists).
 */
export function viewOf(m: AnyMove, close = false): string {
  const hit = (close ? tight : views).get(m);
  if (hit) return hit;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const take = (v: V, r: number) => {
    x0 = Math.min(x0, v[0] - r);
    y0 = Math.min(y0, v[1] - r);
    x1 = Math.max(x1, v[0] + r);
    y1 = Math.max(y1, v[1] + r);
  };
  for (let s = close ? 10 : 0; s <= 10; s++) {
    if (isFront(m)) {
      const j = frontJoints(frontPoseAt(m, s / 10));
      take(j.head, BODY.head + 1);
      for (const v of [...j.shoulder, ...j.elbow, ...j.hip, ...j.knee, ...j.ankle]) take(v, 5);
      for (const v of j.hand) take(v, (m.handGear ?? 3.3) + 1.5);
      continue;
    }
    const j = joints(poseAt(m, s / 10));
    take(j.head, BODY.head + 1);
    for (const v of [j.hip, j.shoulder, j.knee, j.ankle, j.toe, j.heel, j.elbow, j.knee2, j.toe2, j.heel2]) take(v, 5);
    for (const v of [j.hand, j.hand2]) take(v, (m.handGear ?? 2) + 1.5);
  }
  if (!close) for (const v of m.show || []) take(v, 2);
  y1 = Math.max(y1, FLOOR + 1.5);
  const side = Math.max(close ? 30 : 48, x1 - x0, y1 - y0) + (close ? 2 : 4);
  const cx = (x0 + x1) / 2;
  // The floor stays at the bottom edge.
  const top = Math.min((y0 + y1) / 2 - side / 2, FLOOR + 2 - side);
  const box = `${(cx - side / 2).toFixed(1)} ${top.toFixed(1)} ${side.toFixed(1)} ${side.toFixed(1)}`;
  (close ? tight : views).set(m, box);
  return box;
}

/** One moment of an exercise (0 — start, 1 — end). */
export function FigurePose({ move, t, size = 120, title, close = false }: { move: AnyMove; t: number; size?: number; title?: string; close?: boolean }) {
  let body;
  if (isFront(move)) {
    const j = frontJoints(frontPoseAt(move, t));
    body = <PersonFront j={j} work={move.work} gear={move.gear(j)} />;
  } else {
    const j = joints(poseAt(move, t));
    body = <Person j={j} work={move.work} gear={move.gear(j)} halo={!move.noHalo} />;
  }
  return (
    <svg className="fg" viewBox={viewOf(move, close)} width={size} height={size} role="img" aria-label={title}>
      {body}
    </svg>
  );
}

/** Easing: slow at both ends, like a controlled repetition. */
const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

/** The repetition: there (1,3 s), a pause, back (1,5 s), a pause. Still for people who asked for less motion. */
export function FigureMotion({ move, size = 200 }: { move: AnyMove; size?: number }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const t0 = performance.now();
    const go = 1300;
    const hold = 300;
    const back = 1500;
    const rest = 500;
    const cycle = go + hold + back + rest;
    const step = (now: number) => {
      const p = (now - t0) % cycle;
      setT(p < go ? ease(p / go) : p < go + hold ? 1 : p < go + hold + back ? 1 - ease((p - go - hold) / back) : 0);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [move]);
  return <FigurePose move={move} t={t} size={size} title="Движение" />;
}
