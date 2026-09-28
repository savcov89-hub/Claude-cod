import type { Session } from '../types';
import { Empty, fmtDateTime, fmtSets } from './common';

export function HistoryList({ sessions }: { sessions: Session[] }) {
  if (!sessions.length) return <Empty title="Истории пока нет" text="Завершённые тренировки появятся здесь." />;
  return (
    <div className="history">
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
                  <td>{e.exerciseName}</td>
                  <td className="num">{fmtSets(e.sets)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      ))}
    </div>
  );
}
