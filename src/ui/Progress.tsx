import { useMemo, useState } from 'react';
import { allTrends, fmtKg, recentMuscleSets, type ExerciseTrend } from '../analytics';
import { muscleNames, muscleResolver } from '../trainingRules';
import type { Exercise, Program, Session } from '../types';
import { Empty, Sparkline, TrendChip, fmtDate, fmtSets, plural } from './common';
import { PersonalBests } from './Records';

const order: Record<string, number> = { down: 0, stall: 1, pr: 2, up: 3, flat: 4, new: 5 };

export function ProgressView({
  sessions,
  programs = [],
  exercises = [],
}: {
  sessions: Session[];
  /** Muscles of own exercises come from the programs and the exercise base. */
  programs?: Program[];
  exercises?: Exercise[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  const trends = useMemo(
    () =>
      allTrends(sessions).sort(
        (a, b) =>
          order[a.trend] - order[b.trend] ||
          b.series[b.series.length - 1].date.localeCompare(a.series[a.series.length - 1].date),
      ),
    [sessions],
  );
  const muscles = useMemo(
    () => recentMuscleSets(sessions, 7, Date.now(), muscleResolver(programs, exercises)),
    [sessions, programs, exercises],
  );
  if (!sessions.length)
    return <Empty title="Пока нет завершённых тренировок" text="Прогресс появится после первой записанной тренировки." />;

  const month = sessions.filter((s) => Date.now() - new Date(s.completedAt).getTime() < 30 * 86400000).length;
  const count = (t: string) => trends.filter((x) => x.trend === t).length;
  return (
    <div className="progress">
      <div className="kpis">
        <div className="kpi">
          <span>Тренировок за 30 дней</span>
          <strong className="num">{month}</strong>
        </div>
        <div className="kpi">
          <span>Рост / рекорд</span>
          <strong className="num tone-good">{count('up') + count('pr')}</strong>
        </div>
        <div className="kpi">
          <span>Застой</span>
          <strong className="num tone-warn">{count('stall')}</strong>
        </div>
        <div className="kpi">
          <span>Снижение</span>
          <strong className="num tone-bad">{count('down')}</strong>
        </div>
      </div>

      <PersonalBests sessions={sessions} />

      {Object.keys(muscles).length > 0 && (
        <section className="block">
          <h4>Подходов на мышцу за 7 дней</h4>
          <p className="muted small">Косвенное участие считается как половина подхода. Ориентир для роста — 10–20 в неделю.</p>
          <div className="muscle-bars">
            {Object.entries(muscles)
              .sort((a, b) => b[1] - a[1])
              .map(([m, v]) => (
                <div className="muscle-bar" key={m}>
                  <span>{muscleNames[m] || m}</span>
                  <div className="bar">
                    <i className={v < 6 ? 'low' : v <= 20 ? 'ok' : 'high'} style={{ width: Math.min(100, (v / 24) * 100) + '%' }} />
                    <b className="band" aria-hidden="true" />
                  </div>
                  <strong className="num">{fmtKg(Math.round(v * 2) / 2)}</strong>
                </div>
              ))}
          </div>
        </section>
      )}

      <section className="block">
        <h4>Упражнения</h4>
        <p className="muted small">
          Прогресс — больше вес или больше повторов с тем же весом. Застой — 3 выполнения подряд без прибавки. График — расчётный максимум на 1 повтор.
        </p>
        <div className="trend-list">
          {trends.map((t, i) => (
            <TrendRow key={t.exerciseId} t={t} delay={Math.min(i, 8) * 70} open={open === t.exerciseId} onToggle={() => setOpen(open === t.exerciseId ? null : t.exerciseId)} />
          ))}
        </div>
      </section>
    </div>
  );
}

function TrendRow({ t, open, onToggle, delay = 0 }: { t: ExerciseTrend; open: boolean; onToggle: () => void; delay?: number }) {
  const last = t.series[t.series.length - 1];
  const weeks = Math.max(1, Math.round((new Date(last.date).getTime() - new Date(t.series[0].date).getTime()) / (7 * 86400000)));
  return (
    <div className={'trend' + (open ? ' open' : '')}>
      <button className="trend-main" onClick={onToggle} aria-expanded={open}>
        <div className="trend-name">
          <strong>{t.exerciseName}</strong>
          <span className="num">
            {fmtKg(last.best.weight)} × {last.best.reps}
            {t.series.length > 1 && (
              <>
                {' · '}
                <span className={t.totalPct > 0 ? 'tone-good' : t.totalPct < 0 ? 'tone-bad' : ''}>
                  {t.totalPct > 0 ? '+' : ''}
                  {String(t.totalPct).replace('.', ',')}% за {weeks} {plural(weeks, 'неделю', 'недели', 'недель')}
                </span>
              </>
            )}
          </span>
        </div>
        <Sparkline points={t.series} delay={delay} />
        <TrendChip trend={t.trend} extra={t.trend === 'stall' ? t.stallSessions + ' тр.' : undefined} />
      </button>
      {open && (
        <table className="perf-table">
          <tbody>
            {[...t.series].reverse().map((p, i) => (
              <tr key={i}>
                <td>{fmtDate(p.date)}</td>
                <td className="num">{fmtSets(p.sets as any)}</td>
                <td className="num muted">≈{fmtKg(Math.round(p.e1rm))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
