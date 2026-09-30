import { useMemo, useState } from 'react';
import { weightUnit } from '../analytics';
import { safeStorage } from '../transport';
import { exerciseRules, groupMuscles } from '../trainingRules';
import type { Exercise, Program, Session, SetEntry } from '../types';
import { Empty, fmtDate, fmtDateTime, fmtSets } from './common';

type View = 'sessions' | 'muscles';

/** History segments; an exercise goes to the segment of its main (first primary) muscle. */
const SEGMENTS: Array<[string, string[]]> = [
  ['Грудь', ['chest']],
  ['Спина', ['lats', 'upperBack', 'erectors']],
  ['Дельты', ['delts']],
  ['Руки', ['biceps', 'triceps']],
  ['Квадрицепс', ['quads']],
  ['Бицепс бедра', ['hamstrings']],
  ['Ягодицы', ['glutes', 'abductors', 'adductors']],
  ['Икры', ['calves']],
  ['Пресс', ['abs']],
];
const OTHER = 'Другое';
const segmentOf = (muscle?: string) => SEGMENTS.find(([, list]) => muscle && list.includes(muscle))?.[0] || OTHER;

interface Entry {
  sessionId: string;
  completedAt: string;
  sets: SetEntry[];
  note?: string;
}
interface ExerciseHistory {
  exerciseId: string;
  name: string;
  segment: string;
  entries: Entry[];
}

export function HistoryList({
  sessions,
  programs = [],
  exercises = [],
}: {
  sessions: Session[];
  /** Programs and the exercise base tell the muscles of own exercises, which sessions do not carry. */
  programs?: Program[];
  exercises?: Exercise[];
}) {
  const [view, setView] = useState<View>(() => (safeStorage.get('tl-history-view') === 'muscles' ? 'muscles' : 'sessions'));
  const pick = (v: View) => {
    setView(v);
    safeStorage.set('tl-history-view', v);
  };
  if (!sessions.length) return <Empty title="Истории пока нет" text="Завершённые тренировки появятся здесь." />;
  return (
    <div className="history">
      <div className="seg-toggle" role="tablist" aria-label="Вид истории">
        {(
          [
            ['sessions', 'Тренировки'],
            ['muscles', 'По мышцам'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={view === k} className={view === k ? 'on' : ''} onClick={() => pick(k)}>
            {label}
          </button>
        ))}
      </div>
      {view === 'sessions' ? (
        <SessionList sessions={sessions} />
      ) : (
        <MuscleHistory sessions={sessions} programs={programs} exercises={exercises} />
      )}
    </div>
  );
}

function SessionList({ sessions }: { sessions: Session[] }) {
  return (
    <>
      {sessions.map((s) => (
        <article className="session" key={s.id}>
          <header>
            <div>
              <strong>{s.dayName}</strong>
              <span className="muted small">{s.programName}</span>
            </div>
            <time className="muted small">{fmtDateTime(s.completedAt)}</time>
          </header>
          {s.recordedByRole && (
            <p className="muted small">
              Записал {s.recordedByRole === 'trainer' ? 'тренер' : 'клиент'}
              {s.recordedByName ? ' · ' + s.recordedByName : ''}
            </p>
          )}
          {s.feedback && <p className="session-note">«{s.feedback}»</p>}
          <table className="session-table">
            <tbody>
              {s.exercises.map((e) => (
                <tr key={e.exerciseId}>
                  <td>
                    {e.exerciseName}
                    {e.note && <span className="ex-note-line">«{e.note}»</span>}
                  </td>
                  <td className="num">{fmtSets(e.sets)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      ))}
    </>
  );
}

function MuscleHistory({ sessions, programs, exercises }: { sessions: Session[]; programs: Program[]; exercises: Exercise[] }) {
  const [segment, setSegment] = useState('');
  const list = useMemo(() => {
    const programMuscles = new Map<string, string[]>();
    for (const p of programs) for (const d of p.days) for (const e of d.exercises) if (e.muscles?.length) programMuscles.set(e.exerciseId, e.muscles);
    const mainMuscle = (id: string) =>
      exerciseRules[id]?.primary[0] ||
      programMuscles.get(id)?.[0] ||
      exercises.find((x) => x.id === id)?.muscles?.[0] ||
      groupMuscles(exercises.find((x) => x.id === id)?.muscleGroup)[0];
    const byId = new Map<string, ExerciseHistory>();
    const sorted = [...sessions].sort((a, b) => b.completedAt.localeCompare(a.completedAt));
    for (const s of sorted)
      for (const e of s.exercises) {
        let h = byId.get(e.exerciseId);
        if (!h) {
          h = { exerciseId: e.exerciseId, name: e.exerciseName, segment: segmentOf(mainMuscle(e.exerciseId)), entries: [] };
          byId.set(e.exerciseId, h);
        }
        h.entries.push({ sessionId: s.id, completedAt: s.completedAt, sets: e.sets, note: e.note });
      }
    return [...byId.values()];
  }, [sessions, programs, exercises]);

  const segments = [...SEGMENTS.map(([name]) => name), OTHER]
    .map((name) => ({ name, items: list.filter((h) => h.segment === name) }))
    .filter((g) => g.items.length);
  const shown = segment ? segments.filter((g) => g.name === segment) : segments;
  return (
    <>
      <div className="filters" role="tablist" aria-label="Группа мышц">
        <button className={'filter' + (!segment ? ' on' : '')} onClick={() => setSegment('')}>
          Все
        </button>
        {segments.map((g) => (
          <button key={g.name} className={'filter' + (segment === g.name ? ' on' : '')} onClick={() => setSegment(g.name)}>
            {g.name} <span className="num muted">{g.items.length}</span>
          </button>
        ))}
      </div>
      {shown.map((g) => (
        <section className="muscle-group" key={g.name}>
          <h3>{g.name}</h3>
          {g.items.map((h) => (
            <ExerciseCard key={h.exerciseId} history={h} />
          ))}
        </section>
      ))}
    </>
  );
}

const SHOW = 4;
function ExerciseCard({ history: h }: { history: ExerciseHistory }) {
  const [all, setAll] = useState(false);
  const entries = all ? h.entries : h.entries.slice(0, SHOW);
  return (
    <article className="session ex-history">
      <header>
        <strong>{h.name}</strong>
        <span className="muted small">
          {weightUnit({ exerciseId: h.exerciseId, exerciseName: h.name })} × повт · {h.entries.length} трен.
        </span>
      </header>
      <table className="session-table">
        <tbody>
          {entries.map((e) => (
            <tr key={e.sessionId}>
              <td className="muted">
                {fmtDate(e.completedAt)}
                {e.note && <span className="ex-note-line">«{e.note}»</span>}
              </td>
              <td className="num">{fmtSets(e.sets)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {h.entries.length > SHOW && (
        <button className="link-btn" onClick={() => setAll(!all)}>
          {all ? 'Свернуть' : 'Показать все (' + h.entries.length + ')'}
        </button>
      )}
    </article>
  );
}
