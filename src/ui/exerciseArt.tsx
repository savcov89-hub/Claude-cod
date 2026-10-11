// Exercise pictures in the app: a small one for lists and journal cards, and how an exercise is done (the movement,
// the start and the end, the muscles). The drawings themselves are in src/ui/figure (checked by scripts/check-figures.tsx).
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { catalog } from '../catalog';
import { exerciseRules, muscleNames } from '../trainingRules';
import { TECHNIQUE } from '../exerciseTechnique';
import { api, readError } from '../transport';
import { Sheet, searchKey } from './common';
import { FigureMotion, FigurePose, MOVES, type AnyMove } from './figure';

export interface ArtSubject {
  exerciseId?: string;
  id?: string;
  muscleGroup?: string;
  equipment?: string;
  muscles?: string[];
  /** The drawing the trainer picked (id of the catalog exercise drawn). */
  art?: string;
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
  if (e.art && MOVES[e.art]) return MOVES[e.art];
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
    a.exercise.art === b.exercise.art &&
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

/** How to do it: the start always seen; the movement open; what to watch and the mistakes on a tap. */
function TechniqueText({ id }: { id: string }) {
  const tq = TECHNIQUE[id];
  if (!tq) return null;
  return (
    <div className="tech">
      <p className="small">
        <b>Исходное положение.</b> {tq.setup}
      </p>
      <details open>
        <summary>Выполнение</summary>
        <ol className="small">
          {tq.steps.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ol>
      </details>
      <details>
        <summary>На что обратить внимание</summary>
        <ul className="small">
          {tq.cues.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </details>
      <details>
        <summary>Частые ошибки</summary>
        <ul className="small">
          {tq.mistakes.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

/**
 * How an exercise is done: the pictures, the technique, the body position and the muscles it works.
 * `onChangeArt` (the trainer): a button to pick another drawing.
 */
export function ExerciseInfoSheet({
  exercise,
  name,
  onClose,
  onChangeArt,
}: {
  exercise: ArtSubject;
  name: string;
  onClose: () => void;
  onChangeArt?: () => void;
}) {
  const id = exercise.exerciseId || exercise.id || '';
  const rule = exerciseRules[id];
  return (
    <Sheet title={name} onClose={onClose}>
      <ExerciseFigures exercise={exercise} />
      {onChangeArt && (
        <button className="btn btn-sm btn-quiet art-change" onClick={onChangeArt}>
          Сменить картинку
        </button>
      )}
      <TechniqueText id={id} />
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

/** Saves the drawing picked for an exercise ('' — back to its own); the answer is the drawing now in use. */
export async function saveExerciseArt(exerciseId: string, art: string): Promise<string | undefined> {
  const r = await api.post('/api/exercises/' + encodeURIComponent(exerciseId) + '/art', { art });
  // Lists of exercises loaded before (the journal's) are read again.
  window.dispatchEvent(new Event('tl-exercises-changed'));
  return r.data.art || undefined;
}

/**
 * The trainer picks the drawing of an exercise among all the app's drawings: its icon and the movement change
 * for the trainer and the trainer's clients. The pick is shown moving at the top before it is saved.
 */
export function ArtPicker({
  exercise,
  name,
  onClose,
  onSaved,
}: {
  exercise: ArtSubject;
  name: string;
  onClose: () => void;
  onSaved: (art: string | undefined) => void;
}) {
  const id = exercise.exerciseId || exercise.id || '';
  // A catalog exercise has a drawing of its own; an own one is drawn by its muscle group ('').
  const own = MOVES[id] ? id : '';
  const current = exercise.art || own;
  const [pick, setPick] = useState(current);
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const groups = useMemo(() => Array.from(new Set(catalog.map((c) => c.muscleGroup))), []);
  const list = useMemo(() => {
    const k = searchKey(q.trim());
    return catalog.filter((c) => (!group || c.muscleGroup === group) && (!k || searchKey(c.name + ' ' + c.equipment).includes(k)));
  }, [q, group]);
  const save = async (art: string) => {
    setBusy(true);
    setErr('');
    try {
      onSaved(await saveExerciseArt(id, art));
    } catch (e) {
      setErr(readError(e));
    } finally {
      setBusy(false);
    }
  };
  const pickName = pick ? catalog.find((c) => c.id === pick)?.name || pick : 'по группе мышц';
  return (
    <Sheet title="Картинка упражнения" onClose={onClose}>
      <div className="art-preview">
        <span className="xa-motion">
          <FigureMotion move={moveFor({ ...exercise, art: pick || undefined })} size={128} />
        </span>
        <div className="grow">
          <strong className="art-for">{name}</strong>
          <span className="muted small">
            Рисунок: {pickName}
            {pick === own && own ? ' (свой)' : ''}
          </span>
          <div className="row gap wrap">
            <button className="btn btn-primary btn-sm" disabled={busy || pick === current} onClick={() => void save(pick === own ? '' : pick)}>
              {busy ? 'Сохраняем…' : 'Сохранить'}
            </button>
            {exercise.art && (
              <button className="btn btn-sm" disabled={busy} onClick={() => void save('')}>
                Как было
              </button>
            )}
          </div>
        </div>
      </div>
      {err && <div className="alert">{err}</div>}
      <label className="search">
        <Search size={16} />
        <input id="art-search" placeholder="Найти рисунок: жим, тяга, присед…" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="filters">
        <button className={'filter' + (!group ? ' on' : '')} onClick={() => setGroup('')}>
          Все
        </button>
        {groups.map((g) => (
          <button key={g} className={'filter' + (group === g ? ' on' : '')} onClick={() => setGroup(g)}>
            {g}
          </button>
        ))}
      </div>
      <div className="art-grid">
        {list.map((c) => (
          <button key={c.id} className={'art-choice' + (pick === c.id ? ' on' : '')} aria-pressed={pick === c.id} aria-label={'Рисунок: ' + c.name} onClick={() => setPick(c.id)}>
            <ExerciseThumb exercise={{ id: c.id }} size={56} />
            <small>{c.name}</small>
          </button>
        ))}
        {!list.length && <p className="muted small center-text">Ничего не найдено.</p>}
      </div>
    </Sheet>
  );
}
