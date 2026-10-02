// Exercise pictures in the app: a small one for lists and journal cards, and how an exercise is done (the movement,
// the start and the end, the muscles). The drawings themselves are in src/ui/figure (checked by scripts/check-figures.tsx).
import { memo, useEffect, useRef, useState } from 'react';
import { exerciseRules, muscleNames } from '../trainingRules';
import { Sheet } from './common';
import { FigureMotion, FigurePose, MOVES, type AnyMove } from './figure';

export interface ArtSubject {
  exerciseId?: string;
  id?: string;
  muscleGroup?: string;
  equipment?: string;
  muscles?: string[];
}

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

/** The picture of an exercise: its own, or a typical one of its muscle group and equipment (the trainer's own). */
export function moveFor(e: ArtSubject): AnyMove {
  const id = e.exerciseId || e.id || '';
  if (MOVES[id]) return MOVES[id];
  const g = e.muscleGroup || GROUP_OF[e.muscles?.[0] || ''] || '';
  const eq = e.equipment || '';
  const machine = /Тренаж/.test(eq);
  const plates = /блин/i.test(eq);
  const cable = /Блок/.test(eq);
  const dumbbells = /Гантел/.test(eq);
  const pick = (...ids: string[]) => MOVES[ids.find((x) => MOVES[x]) || 'back-squat'];
  if (/Грудь/.test(g)) return pick(dumbbells ? 'incline-dumbbell-press' : cable ? 'cable-fly' : plates ? 'plate-chest-press' : machine ? 'machine-chest-press' : 'bench-press');
  if (/Разгибатели/.test(g)) return pick(machine ? 'stack-back-extension' : 'back-extension');
  if (/Спина|Широч/.test(g)) return pick(cable ? 'lat-pulldown' : plates ? 'plate-seated-row' : machine ? 'stack-seated-row' : dumbbells ? 'one-arm-row' : 'barbell-row');
  if (/Квадрицепс/.test(g)) return pick(plates ? 'leg-press' : machine ? 'leg-extension' : dumbbells ? 'bulgarian-split-squat' : 'back-squat');
  if (/Бицепс бедра|Задняя/.test(g)) return pick(machine ? 'seated-leg-curl' : 'rdl');
  if (/Приводящ/.test(g)) return pick('hip-adduction');
  if (/Ягодиц/.test(g)) return pick(cable ? 'cable-kickback' : machine && !plates ? 'hip-abduction' : 'hip-thrust');
  if (/Икр/.test(g)) return pick(/сид/i.test(eq) ? 'seated-calf-raise' : 'standing-calf-raise');
  if (/Плеч/.test(g)) return pick(cable ? 'cable-lateral-raise' : machine ? 'machine-shoulder-press' : dumbbells ? 'lateral-raise' : 'overhead-press');
  if (/Бицепс/.test(g)) return pick(cable ? 'cable-curl' : machine ? 'stack-biceps-curl' : dumbbells ? 'dumbbell-curl' : 'barbell-curl');
  if (/Трицепс/.test(g)) return pick(cable ? 'triceps-pushdown' : machine ? 'stack-triceps-press' : 'lying-triceps-extension');
  if (/Пресс|Кор/.test(g)) return pick(cable ? 'cable-crunch' : machine ? 'stack-ab-crunch' : 'crunch');
  return pick('back-squat');
}

/** Becomes true once the element comes near the screen (long lists draw only what is seen). */
function useNearScreen<T extends Element>() {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (near || !ref.current) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), { rootMargin: '300px 0px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [near]);
  return [ref, near] as const;
}

/** Small picture for lists: the end of the movement, close up. Drawn when near the screen, again only for another exercise. */
export const ExerciseThumb = memo(
  function ExerciseThumb({ exercise, size = 40 }: { exercise: ArtSubject; size?: number }) {
    const [ref, near] = useNearScreen<HTMLSpanElement>();
    return (
      <span ref={ref} className="xa-thumb" style={{ width: size, height: size }} aria-hidden="true">
        {near && <FigurePose move={moveFor(exercise)} t={1} size={size} close />}
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
  const move = moveFor(exercise);
  return (
    <div className="xa-figures">
      <div className="xa-motion">
        <FigureMotion move={move} size={200} />
      </div>
      <div className="xa-pair">
        <figure>
          <FigurePose move={move} t={0} size={132} title="Начало" />
          <figcaption>Начало</figcaption>
        </figure>
        <figure>
          <FigurePose move={move} t={1} size={132} title="Конец" />
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
