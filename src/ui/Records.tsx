import { useMemo, useState } from 'react';
import { Trophy } from 'lucide-react';
import { fmtKg, personalBests, weightUnit, type PersonalRecord, type SessionLike, type SetLike } from '../analytics';
import { Sheet, fmtDate } from './common';

/** "120 кг × 10", "5 плит. × 12", "12 повт." (bodyweight). */
export function fmtSet(s: SetLike, ex: { exerciseId: string; equipment?: string }) {
  if (!s.weight) return s.reps + ' повт.';
  return fmtKg(s.weight) + ' ' + weightUnit(ex) + ' × ' + s.reps;
}

/** New records of a workout, shown right after it is finished. */
export function RecordList({ records }: { records: PersonalRecord[] }) {
  return (
    <ul className="record-list">
      {records.map((r) => (
        <li key={r.exerciseId}>
          <Trophy size={18} className="record-icon" />
          <span className="grow">
            <strong>{r.exerciseName}</strong>
            <span className="small">
              <b className="num">{fmtSet(r.best, r)}</b> <span className="muted">было {fmtSet(r.previous, r)}</span>
            </span>
          </span>
          <b className="record-pct num">+{fmtKg(r.pct)}&nbsp;%</b>
        </li>
      ))}
    </ul>
  );
}

/** A little burst of confetti (CSS only). */
export function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        left: (i * 37) % 100,
        delay: (i % 7) * 0.08,
        hue: (i * 47) % 360,
        drift: ((i % 5) - 2) * 18,
      })),
    [],
  );
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <i
          key={i}
          style={{
            left: p.left + '%',
            animationDelay: p.delay + 's',
            background: `hsl(${p.hue} 85% 58%)`,
            ['--drift' as string]: p.drift + 'px',
          }}
        />
      ))}
    </div>
  );
}

/** Celebration sheet after a workout with records. */
export function RecordsSheet({ records, onClose }: { records: PersonalRecord[]; onClose: () => void }) {
  return (
    <Sheet title={records.length === 1 ? 'Новый личный рекорд!' : `Новые личные рекорды: ${records.length}`} onClose={onClose}>
      <Confetti />
      <RecordList records={records} />
      <button className="btn btn-primary btn-block" onClick={onClose}>
        Круто!
      </button>
    </Sheet>
  );
}

/** Best result of every exercise, newest records first. */
export function PersonalBests({ sessions }: { sessions: SessionLike[] }) {
  const [all, setAll] = useState(false);
  const list = useMemo(() => personalBests(sessions).filter((x) => x.count > 1 || sessions.length < 3), [sessions]);
  if (!list.length) return null;
  const shown = all ? list : list.slice(0, 8);
  return (
    <section className="block">
      <div className="block-head">
        <h4>
          <Trophy size={15} /> Личные рекорды
        </h4>
      </div>
      <table className="session-table">
        <tbody>
          {shown.map((x) => (
            <tr key={x.exerciseId}>
              <td>
                {x.exerciseName}
                <span className="ex-note-line">{fmtDate(x.date)}</span>
              </td>
              <td className="num">
                <b>{fmtSet(x.best, x)}</b>
                {x.growthPct >= 1 && <span className="ex-note-line tone-good">+{Math.round(x.growthPct)}&nbsp;% с начала</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {list.length > 8 && (
        <button className="link-btn" onClick={() => setAll(!all)}>
          {all ? 'Свернуть' : 'Все рекорды (' + list.length + ')'}
        </button>
      )}
    </section>
  );
}
