import { useCallback, useEffect, useState } from 'react';
import { Copy, HeartPulse, Ruler, Trash2 } from 'lucide-react';
import {
  ACTIVITY,
  RANGES,
  actualExpenditure,
  calories,
  ffmi,
  latest,
  navyBodyFat,
  rangeSeries,
  weeklyAverage,
  weeksBack,
  type BodyEntry,
  type BodyProfile,
  type RangeId,
  type SeriesField,
} from '../body';
import { fmtKg } from '../analytics';
import { localDate } from '../clock';
import { api, isLocal, readError, safeStorage } from '../transport';
import { healthUrl } from '../supabase';
import { copyLater } from './programText';
import { Confirm, fmtDate } from './common';

const num = (v: string) => {
  const n = Number(v.replace(',', '.').trim());
  return v.trim() && Number.isFinite(n) ? n : null;
};
const signed = (d: number) => {
  const r = Math.round(d * 10) / 10;
  return (r > 0 ? '+' : r < 0 ? '−' : '') + fmtKg(Math.abs(r));
};
const fmtSteps = (n: number) => Math.round(n).toLocaleString('ru-RU');
/** The day before `date` (yyyy-mm-dd): steps are entered the next morning. */
const dayBefore = (date: string) => {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return localDate(d);
};
const str = (v?: number | null) => (typeof v === 'number' ? String(v).replace('.', ',') : '');

/** Daily weighing, tape measurements, body fat (US Navy) and calories. `clientId` for the trainer, none for the client. */
export function BodyView({ clientId }: { clientId?: string }) {
  const [entries, setEntries] = useState<BodyEntry[]>([]);
  const [profile, setProfile] = useState<BodyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [editProfile, setEditProfile] = useState(false);
  const [measuring, setMeasuring] = useState(false);
  const today = localDate();

  const load = useCallback(async () => {
    try {
      const r = await api.get('/api/body' + (clientId ? '?clientId=' + encodeURIComponent(clientId) : ''));
      setEntries(r.data.entries);
      setProfile(r.data.profile);
      setErr('');
    } catch (e) {
      setErr(readError(e));
    } finally {
      setLoading(false);
    }
  }, [clientId]);
  useEffect(() => {
    void load();
  }, [load]);

  const save = async (patch: Partial<BodyEntry> & { date: string }) => {
    await api.post('/api/body', { ...(clientId ? { clientId } : {}), ...patch });
    await load();
  };

  if (loading) return <div className="loader-block"><span className="loader" /></div>;

  const last = latest(entries);
  const bodyFat = profile ? navyBodyFat(profile, { waist: last.waist?.value, neck: last.neck?.value, hips: last.hips?.value }) : null;
  const measuredAt = [last.waist?.date, last.neck?.date, profile?.sex === 'f' ? last.hips?.date : undefined].filter(Boolean).sort().pop();
  const week = weeklyAverage(entries, today);
  const stepsWeek = weeklyAverage(entries, today, 'steps');
  const weight = week.current ?? last.weight?.value ?? null;
  const level = ACTIVITY.find((a) => a.id === profile?.activity);
  const energy = profile && weight ? calories(profile, weight, bodyFat, stepsWeek.current) : null;
  const weights = entries.filter((e) => typeof e.weight === 'number');
  const steps = entries.filter((e) => typeof e.steps === 'number' && e.steps > 0);
  const eaten = entries.filter((e) => typeof e.kcal === 'number' && e.kcal > 0);
  const kcalWeek = weeklyAverage(entries, today, 'kcal');
  const actual = actualExpenditure(entries, today);
  const index = profile && weight && bodyFat !== null ? ffmi(profile, weight, bodyFat) : null;

  return (
    <div className="body-view">
      {err && <div className="alert">{err}</div>}

      <MorningCard
        entries={entries}
        today={today}
        onSave={async (date, w, yesterday) => {
          if (w !== null) await api.post('/api/body', { ...(clientId ? { clientId } : {}), date, weight: w });
          if (Object.keys(yesterday).length) await api.post('/api/body', { ...(clientId ? { clientId } : {}), date: dayBefore(date), ...yesterday });
          await load();
        }}
      />

      <section className="block">
        <div className="block-head">
          <h4>Вес</h4>
          {week.current !== null && (
            <span className="muted small">
              среднее за 7 дней <b className="num">{fmtKg(week.current)} кг</b>
              {week.previous !== null && (
                <span className={'num ' + (week.current < week.previous ? 'tone-good' : week.current > week.previous ? 'tone-warn' : '')}>
                  {' '}
                  ({signed(week.current - week.previous)} за неделю)
                </span>
              )}
            </span>
          )}
        </div>
        {weights.length > 1 ? (
          <>
            <Trend entries={entries} field="weight" today={today} />
            <WeekTable entries={entries} field="weight" today={today} />
          </>
        ) : (
          <p className="muted small">Взвешивайтесь каждое утро натощак: по среднему за неделю видно настоящую динамику, а не колебания воды.</p>
        )}
      </section>

      <section className="block">
        <div className="block-head">
          <h4>Шаги</h4>
          {stepsWeek.current !== null && (
            <span className="muted small">
              в среднем за 7 дней <b className="num">{fmtSteps(stepsWeek.current)}</b> в день
              {stepsWeek.previous !== null && <span className="num"> (неделей раньше {fmtSteps(stepsWeek.previous)})</span>}
            </span>
          )}
        </div>
        {steps.length > 1 ? (
          <>
            <Trend entries={entries} field="steps" today={today} delay={180} />
            <WeekTable entries={entries} field="steps" today={today} />
          </>
        ) : (
          <p className="muted small">Утром вместе с весом запишите шаги за вчера (из «Здоровья» или часов) — или подключите «Здоровье» внизу, и шаги будут приходить сами. Калорийность будет считаться по реальной активности.</p>
        )}
      </section>

      <section className="block">
        <div className="block-head">
          <h4>Питание</h4>
          {kcalWeek.current !== null && (
            <span className="muted small">
              в среднем за 7 дней <b className="num">{fmtSteps(kcalWeek.current)} ккал</b>
              {kcalWeek.previous !== null && <span className="num"> (неделей раньше {fmtSteps(kcalWeek.previous)})</span>}
            </span>
          )}
        </div>
        {eaten.length > 1 && (
          <>
            <Trend entries={entries} field="kcal" today={today} delay={360} />
            <WeekTable entries={entries} field="kcal" today={today} />
          </>
        )}
        {actual ? (
          <div className="stat-row">
            <div>
              <strong className="big num">{fmtSteps(actual.expenditure)}</strong>
              <span className="muted small">ккал в день — расход по факту</span>
            </div>
            <div>
              <strong className="num">{fmtSteps(actual.intake)} ккал</strong>
              <span className="muted small">съедено в среднем</span>
              <strong className="num">{signed(actual.change)} кг</strong>
              <span className="muted small">вес за неделю</span>
            </div>
          </div>
        ) : null}
        <p className="muted small">
          {actual
            ? 'Расход по факту = средние калории за 2 недели минус изменение веса (≈7700 ккал на кг). Он точнее расчётного' +
              (energy ? ' (' + fmtSteps(energy.maintain) + ')' : '') +
              ', если калории записаны честно.'
            : eaten.length
              ? 'Нужны 2 недели: хотя бы 4 дня с калориями и 3 взвешивания в каждой — тогда появится расход по факту.'
              : 'Утром вместе с весом запишите калории за вчера (из приложения для подсчёта). Через 2 недели появится расход по факту — по съеденному и динамике веса.'}
        </p>
      </section>

      <section className="block">
        <div className="block-head">
          <h4>Процент жира</h4>
          <button className="btn btn-sm" onClick={() => setMeasuring(!measuring)}>
            <Ruler size={15} /> Замеры
          </button>
        </div>
        {!profile ? (
          <p className="muted small">Заполните данные для расчёта ниже.</p>
        ) : bodyFat !== null ? (
          <div className="stat-row">
            <div>
              <strong className="big num">{fmtKg(bodyFat)} %</strong>
              <span className="muted small">по формуле ВМС США{measuredAt ? ' · замеры ' + fmtDate(measuredAt) : ''}</span>
            </div>
            {weight && (
              <div>
                <strong className="num">{fmtKg(Math.round(weight * (1 - bodyFat / 100) * 10) / 10)} кг</strong>
                <span className="muted small">сухая масса</span>
                <strong className="num">{fmtKg(Math.round(((weight * bodyFat) / 100) * 10) / 10)} кг</strong>
                <span className="muted small">жир</span>
              </div>
            )}
          </div>
        ) : null}
        {index && (
          <div className="stat-row">
            <div>
              <strong className="big num">{fmtKg(index.normalized)}</strong>
              <span className="muted small">индекс безжировой массы (FFMI) — {index.level}</span>
            </div>
            {index.value !== index.normalized && (
              <div>
                <strong className="num">{fmtKg(index.value)}</strong>
                <span className="muted small">без поправки на рост</span>
              </div>
            )}
          </div>
        )}
        {profile && bodyFat === null && (
          <p className="muted small">
            Нужны обхваты шеи и талии{profile.sex === 'f' ? ' и бёдер' : ''}. Нажмите «Замеры».
          </p>
        )}
        {measuring && profile && (
          <MeasureForm
            sex={profile.sex}
            initial={last}
            today={today}
            onCancel={() => setMeasuring(false)}
            onSave={async (patch) => {
              await save(patch);
              setMeasuring(false);
            }}
          />
        )}
      </section>

      {energy && weight && (
        <section className="block">
          <div className="block-head">
            <h4>Калорийность в день</h4>
          </div>
          <div className="kcal">
            <div>
              <strong className="num">{energy.cut}</strong>
              <span className="muted small">снижение веса (−{energy.cutPct}&nbsp;%)</span>
            </div>
            <div className="on">
              <strong className="num">{energy.maintain}</strong>
              <span className="muted small">поддержание</span>
            </div>
            <div>
              <strong className="num">{energy.gain}</strong>
              <span className="muted small">набор (+10&nbsp;%)</span>
            </div>
          </div>
          <p className="muted small">
            {stepsWeek.current !== null ? (
              <>
                Расход: обмен в покое {energy.bmr} × 1,2 + шаги ≈{energy.walk} ккал ({fmtSteps(stepsWeek.current)} в день) + тренировки ≈
                {energy.train} ккал ({level?.label.toLowerCase()}). Активность ×{fmtKg(energy.factor)}.
              </>
            ) : (
              <>
                Шаги не записаны, поэтому активность только по тренировкам: ×{fmtKg(energy.factor)} ({level?.label.toLowerCase()}). Запишите шаги —
                расчёт станет точнее.
              </>
            )}{' '}
            Обмен {energy.method}, вес {fmtKg(weight)} кг{week.current !== null ? ' (среднее за неделю)' : ''}. Белок {energy.protein[0]}–
            {energy.protein[1]} г (1,6–2,2 г на кг). Это стартовая точка: сверяйте с динамикой веса за 2–3 недели.
          </p>
        </section>
      )}

      <section className="block">
        <div className="block-head">
          <h4>Данные для расчёта</h4>
          {profile && !editProfile && (
            <button className="btn btn-sm" onClick={() => setEditProfile(true)}>
              Изменить
            </button>
          )}
        </div>
        {profile && !editProfile ? (
          <p className="muted small">
            {profile.sex === 'm' ? 'Мужчина' : 'Женщина'} · {profile.heightCm} см · {new Date().getFullYear() - profile.birthYear} лет ·{' '}
            {ACTIVITY.find((a) => a.id === profile.activity)?.label.toLowerCase()}
          </p>
        ) : (
          <ProfileForm
            initial={profile}
            onCancel={profile ? () => setEditProfile(false) : undefined}
            onSave={async (p) => {
              await api.post('/api/body/profile', { ...(clientId ? { clientId } : {}), ...p });
              setEditProfile(false);
              await load();
            }}
          />
        )}
      </section>

      <HealthLink clientId={clientId} onDone={load} />

      {entries.length > 0 && <EntryList entries={entries} profile={profile} onDelete={(date) => save({ date, weight: null, waist: null, neck: null, hips: null, steps: null, kcal: null })} />}
    </div>
  );
}

const signedInt = (d: number) => (d > 0 ? '+' : d < 0 ? '−' : '') + fmtSteps(Math.abs(d));
/** How each series is written: the value, its change, the scale. */
const SERIES: Record<SeriesField, { title: string; bars: boolean; value: (v: number) => string; change: (d: number) => string; scale: (v: number) => string }> = {
  weight: { title: 'вес', bars: false, value: (v) => fmtKg(v) + ' кг', change: (d) => signed(d), scale: (v) => fmtKg(Math.round(v * 10) / 10) },
  steps: { title: 'шаги', bars: true, value: (v) => fmtSteps(v), change: signedInt, scale: (v) => (v >= 1000 ? fmtKg(Math.round(v / 100) / 10) + ' тыс.' : fmtSteps(v)) },
  kcal: { title: 'калории', bars: true, value: (v) => fmtSteps(v) + ' ккал', change: signedInt, scale: (v) => fmtSteps(v) },
};
const dayMonth = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
const dayMonthYear = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
const noonOf = (date: string) => new Date(date + 'T12:00:00');
/** «22–28 сент.», «29 сент. – 5 окт.» */
const weekLabel = (from: string, to: string) =>
  from.slice(0, 7) === to.slice(0, 7) ? noonOf(from).getDate() + '–' + dayMonth.format(noonOf(to)) : dayMonth.format(noonOf(from)) + ' – ' + dayMonth.format(noonOf(to));
/** «за 7 дней», «за месяц», «за 3 месяца»… */
const periodText = (full: string) => 'за ' + full;

/** The period of a chart, kept on this device for each chart (a month at first). */
function useRange(field: SeriesField) {
  const key = 'tl-body-range:' + field;
  const [range, setRange] = useState<RangeId>(() => {
    const v = safeStorage.get(key);
    return RANGES.some((r) => r.id === v) ? (v as RangeId) : '1m';
  });
  return [
    range,
    (r: RangeId) => {
      setRange(r);
      safeStorage.set(key, r);
    },
  ] as const;
}

/** A chart with its period — 7 days, a month, 3 or 6 months, a year — and what the period comes to. */
function Trend({ entries, field, today, delay = 0 }: { entries: BodyEntry[]; field: SeriesField; today: string; delay?: number }) {
  const cfg = SERIES[field];
  const [range, setRange] = useRange(field);
  const period = RANGES.find((r) => r.id === range)!;
  const s = rangeSeries(entries, field, today, period.days);
  return (
    <div className="trend-block">
      <div className="chips range-chips" role="group" aria-label={'Период: ' + cfg.title}>
        {RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            className={'filter' + (r.id === range ? ' on' : '')}
            aria-pressed={r.id === range}
            aria-label={r.full[0].toUpperCase() + r.full.slice(1)}
            onClick={() => setRange(r.id)}
          >
            {r.label}
          </button>
        ))}
      </div>
      {s.points.length > 1 ? (
        <TrendChart
          key={range}
          points={s.points}
          from={s.from}
          to={s.to}
          bars={cfg.bars}
          byWeek={s.byWeek}
          average={cfg.bars ? s.average : null}
          scale={cfg.scale}
          label={`${cfg.title[0].toUpperCase() + cfg.title.slice(1)} ${periodText(period.full)}${s.average !== null ? ', в среднем ' + cfg.value(s.average) : ''}`}
          delay={delay}
        />
      ) : (
        <p className="muted small">{s.count ? 'За этот период одна запись — выберите период подольше.' : 'За этот период записей нет.'}</p>
      )}
      {s.average !== null && s.points.length > 1 && (
        <p className="small trend-sum">
          {'З' + periodText(period.full).slice(1)}
          {s.byWeek ? ' (по неделям)' : ''}: в среднем <b className="num">{cfg.value(s.average)}</b>
          {field !== 'weight' && ' в день'}
          {s.min !== null && s.max !== null && s.min !== s.max && (
            <span className="muted num">
              {' '}
              · от {cfg.scale(s.min)} до {cfg.scale(s.max)}
            </span>
          )}
          {field === 'weight' && s.change !== null && <span className="num"> · {signed(s.change)} кг</span>}
        </p>
      )}
    </div>
  );
}

/**
 * The chart of a period: the weight as a line, steps and food as bars with the period's average dashed; the full period
 * on the axis (a gap in the records stays a gap), the scale on the right.
 */
function TrendChart({
  points,
  from,
  to,
  bars,
  byWeek,
  average,
  scale,
  label,
  delay,
}: {
  points: Array<{ date: string; value: number }>;
  from: string;
  to: string;
  bars: boolean;
  byWeek: boolean;
  average: number | null;
  scale: (v: number) => string;
  label: string;
  delay: number;
}) {
  const W = 320;
  const H = 120;
  const pad = 6;
  const days = Math.round((noonOf(to).getTime() - noonOf(from).getTime()) / 86400000) + 1;
  const idx = (date: string) => Math.round((noonOf(date).getTime() - noonOf(from).getTime()) / 86400000);
  // A point stands for its day, or its week (from Monday) as far as it is in the period.
  const span = (date: string) => {
    const a = Math.max(0, idx(date));
    return [a, Math.min(days, idx(date) + (byWeek ? 7 : 1))];
  };
  const px = (d: number) => pad + (d / days) * (W - pad * 2);
  const values = points.map((p) => p.value);
  let lo = bars ? 0 : Math.min(...values);
  let hi = Math.max(...values);
  if (!bars) {
    const room = Math.max((hi - lo) * 0.12, 0.3);
    lo -= room;
    hi += room;
  } else hi *= 1.06;
  const py = (v: number) => H - pad - ((v - lo) / (hi - lo || 1)) * (H - pad * 2);
  const xs = points.map((p) => {
    const [a, b] = span(p.date);
    return px((a + b) / 2);
  });
  const line = points.map((p, i) => (i ? 'L' : 'M') + xs[i].toFixed(1) + ' ' + py(p.value).toFixed(1)).join(' ');
  const year = from.slice(0, 4) !== to.slice(0, 4);
  return (
    <div className="trend" role="img" aria-label={label} style={{ ['--spark-delay' as string]: delay + 'ms' }}>
      <svg className="spark" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <line x1={pad} x2={W - pad} y1={py(lo)} y2={py(lo)} className="spark-grid" />
        <line x1={pad} x2={W - pad} y1={py(hi)} y2={py(hi)} className="spark-grid" />
        {bars ? (
          points.map((p) => {
            const [a, b] = span(p.date);
            const x = px(a);
            const w = Math.max(1, px(b) - x - (b - a > 1 ? 3 : days > 14 ? 1 : 3));
            return <rect key={p.date} className="trend-bar" x={x + (b - a > 1 ? 1.5 : days > 14 ? 0.5 : 1.5)} y={py(p.value)} width={w} height={Math.max(0, py(lo) - py(p.value))} rx={Math.min(3, w / 3)} />;
          })
        ) : (
          <>
            <path d={line + ` L${xs[xs.length - 1].toFixed(1)} ${py(lo)} L${xs[0].toFixed(1)} ${py(lo)} Z`} className="spark-area" />
            <path d={line} className="spark-line" pathLength={1} />
            {points.length <= 31 && points.slice(0, -1).map((p, i) => <circle key={p.date} cx={xs[i]} cy={py(p.value)} r="2" className="trend-pt" />)}
            <circle cx={xs[xs.length - 1]} cy={py(values[values.length - 1])} r="3.4" className="spark-dot" />
          </>
        )}
        {average !== null && <line x1={pad} x2={W - pad} y1={py(average)} y2={py(average)} className="trend-avg" />}
      </svg>
      <div className="trend-y num" aria-hidden="true">
        <span>{scale(bars ? Math.max(...values) : hi)}</span>
        <span>{scale(bars ? 0 : lo)}</span>
      </div>
      <div className="trend-x" aria-hidden="true">
        <span>{year ? dayMonthYear.format(noonOf(from)).replace(/\s?г\.$/, '') : dayMonth.format(noonOf(from))}</span>
        <span>{dayMonth.format(noonOf(to))}</span>
      </div>
    </div>
  );
}

/** The last 4 weeks, Monday to Sunday: the average of each, how it changed week to week and over the four. */
function WeekTable({ entries, field, today }: { entries: BodyEntry[]; field: SeriesField; today: string }) {
  const cfg = SERIES[field];
  const { weeks, average, change } = weeksBack(entries, field, today, 4);
  if (!weeks.some((w) => w.average !== null)) return null;
  let prev: number | null = null;
  return (
    <table className="body-weeks" aria-label={'По неделям: ' + cfg.title}>
      <thead>
        <tr>
          <th scope="col">Неделя (пн–вс)</th>
          <th scope="col">{field === 'weight' ? 'Средний вес' : 'В день'}</th>
          <th scope="col">За неделю</th>
        </tr>
      </thead>
      <tbody>
        {weeks.map((w) => {
          const d = w.average !== null && prev !== null ? Math.round((w.average - prev) * 10) / 10 : null;
          if (w.average !== null) prev = w.average;
          return (
            <tr key={w.from} className={w.current ? 'is-now' : undefined}>
              <td>
                {weekLabel(w.from, w.to)}
                {w.current && <span className="muted"> · эта</span>}
              </td>
              <td className="num">{w.average !== null ? cfg.value(w.average) : '—'}</td>
              <td className="num muted">{d !== null ? cfg.change(d) : ''}</td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <td>За 4 недели</td>
          <td className="num">{average !== null ? cfg.value(average) : '—'}</td>
          <td className="num">{change !== null ? cfg.change(change) : ''}</td>
        </tr>
      </tfoot>
    </table>
  );
}

/** Morning entry: today's weight, yesterday's steps and calories together. */
function MorningCard({
  entries,
  today,
  onSave,
}: {
  entries: BodyEntry[];
  today: string;
  onSave: (date: string, weight: number | null, yesterday: { steps?: number; kcal?: number }) => Promise<void>;
}) {
  const [date, setDate] = useState(today);
  const stepsDate = dayBefore(date);
  const hadWeight = entries.find((e) => e.date === date)?.weight;
  const hadSteps = entries.find((e) => e.date === stepsDate)?.steps;
  const hadKcal = entries.find((e) => e.date === stepsDate)?.kcal;
  const [weight, setWeight] = useState(str(hadWeight));
  const [steps, setSteps] = useState(typeof hadSteps === 'number' ? String(hadSteps) : '');
  const [kcal, setKcal] = useState(typeof hadKcal === 'number' ? String(hadKcal) : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setWeight(str(entries.find((e) => e.date === date)?.weight));
    const st = entries.find((e) => e.date === dayBefore(date))?.steps;
    setSteps(typeof st === 'number' ? String(st) : '');
    const kc = entries.find((e) => e.date === dayBefore(date))?.kcal;
    setKcal(typeof kc === 'number' ? String(kc) : '');
  }, [date, entries]);
  const submit = async () => {
    const w = num(weight);
    const st = steps.trim() ? Number(steps.replace(/[\s\u00a0]/g, '')) : null;
    const kc = kcal.trim() ? Number(kcal.replace(/[\s\u00a0]/g, '')) : null;
    if (weight.trim() && (w === null || w < 20 || w > 400)) return setErr('Введите вес в кг, например 82,4.');
    if (st !== null && (!Number.isFinite(st) || st < 0 || st > 100000)) return setErr('Шаги — число до 100 000.');
    if (kc !== null && (!Number.isFinite(kc) || kc < 0 || kc > 15000)) return setErr('Калории — число до 15 000.');
    if (w === null && st === null && kc === null) return setErr('Введите вес, шаги или калории.');
    setBusy(true);
    try {
      await onSave(date, w, { ...(st !== null ? { steps: Math.round(st) } : {}), ...(kc !== null ? { kcal: Math.round(kc) } : {}) });
      setErr('');
      setSaved(true);
      (document.activeElement as HTMLElement | null)?.blur();
    } catch (e) {
      setErr(readError(e));
    } finally {
      setBusy(false);
    }
  };
  const edit = () => setSaved(false);
  return (
    <section className="block weigh">
      <div className="morning-grid">
        <label className="field">
          <span>Вес{date === today ? ' сегодня' : ' ' + fmtDate(date)}, кг</span>
          <input
            id="body-weight"
            inputMode="decimal"
            placeholder="82,4"
            value={weight}
            onChange={(e) => {
              setWeight(e.target.value);
              edit();
            }}
          />
        </label>
        <label className="field">
          <span>Шаги {date === today ? 'вчера' : fmtDate(stepsDate)}</span>
          <input
            id="body-steps"
            inputMode="numeric"
            placeholder="10 000"
            value={steps}
            onChange={(e) => {
              setSteps(e.target.value);
              edit();
            }}
          />
        </label>
        <label className="field">
          <span>Калории {date === today ? 'вчера' : fmtDate(stepsDate)}</span>
          <input
            id="body-kcal"
            inputMode="numeric"
            placeholder="2 100"
            value={kcal}
            onChange={(e) => {
              setKcal(e.target.value);
              edit();
            }}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
          />
        </label>
      </div>
      <div className="weigh-row">
        <label className="weigh-date muted small">
          Дата
          <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
        <button className="btn btn-primary" disabled={busy} onClick={submit}>
          {busy ? 'Сохраняем…' : typeof hadWeight === 'number' || typeof hadSteps === 'number' || typeof hadKcal === 'number' ? 'Обновить' : 'Записать'}
        </button>
      </div>
      {err && <div className="alert">{err}</div>}
      {saved && !err && <p className="tone-good small">Записано.</p>}
    </section>
  );
}

function MeasureForm({
  sex,
  initial,
  today,
  onSave,
  onCancel,
}: {
  sex: 'm' | 'f';
  initial: ReturnType<typeof latest>;
  today: string;
  onSave: (patch: BodyEntry) => Promise<void>;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(today);
  const [waist, setWaist] = useState(str(initial.waist?.value));
  const [neck, setNeck] = useState(str(initial.neck?.value));
  const [hips, setHips] = useState(str(initial.hips?.value));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const w = num(waist);
    const n = num(neck);
    const h = num(hips);
    if (w === null || n === null || (sex === 'f' && h === null)) return setErr('Заполните все обхваты в сантиметрах.');
    setBusy(true);
    try {
      await onSave({ date, waist: w, neck: n, ...(sex === 'f' ? { hips: h } : {}) });
    } catch (e) {
      setErr(readError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="measure-form">
      <div className="measure-grid">
        <label className="field">
          <span>Талия, см</span>
          <input id="body-waist" inputMode="decimal" value={waist} onChange={(e) => setWaist(e.target.value)} placeholder="84" />
        </label>
        <label className="field">
          <span>Шея, см</span>
          <input id="body-neck" inputMode="decimal" value={neck} onChange={(e) => setNeck(e.target.value)} placeholder="38" />
        </label>
        {sex === 'f' && (
          <label className="field">
            <span>Бёдра, см</span>
            <input id="body-hips" inputMode="decimal" value={hips} onChange={(e) => setHips(e.target.value)} placeholder="98" />
          </label>
        )}
        <label className="field">
          <span>Дата</span>
          <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
      </div>
      <p className="muted small">
        Сантиметровой лентой, утром, без втягивания. Шея — чуть ниже кадыка.{' '}
        {sex === 'm' ? 'Талия — на уровне пупка.' : 'Талия — в самом узком месте, бёдра — по самой широкой части ягодиц.'}
      </p>
      {err && <div className="alert">{err}</div>}
      <div className="row gap">
        <button className="btn" onClick={onCancel} disabled={busy}>
          Отмена
        </button>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Сохраняем…' : 'Сохранить замеры'}
        </button>
      </div>
    </div>
  );
}

function ProfileForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: BodyProfile | null;
  onSave: (p: BodyProfile) => Promise<void>;
  onCancel?: () => void;
}) {
  const [sex, setSex] = useState<'m' | 'f' | ''>(initial?.sex || '');
  const [height, setHeight] = useState(str(initial?.heightCm));
  const [birthYear, setBirthYear] = useState(initial ? String(initial.birthYear) : '');
  const [activity, setActivity] = useState(initial?.activity || 'light');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const h = num(height);
    const y = Number(birthYear);
    if (!sex || h === null || !Number.isInteger(y)) return setErr('Укажите пол, рост и год рождения.');
    setBusy(true);
    try {
      await onSave({ sex, heightCm: h, birthYear: y, activity });
    } catch (e) {
      setErr(readError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="measure-form">
      <div className="chips">
        {(
          [
            ['m', 'Мужчина'],
            ['f', 'Женщина'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} className={'filter' + (sex === k ? ' on' : '')} onClick={() => setSex(k)}>
            {label}
          </button>
        ))}
      </div>
      <div className="measure-grid">
        <label className="field">
          <span>Рост, см</span>
          <input id="body-height" inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="178" />
        </label>
        <label className="field">
          <span>Год рождения</span>
          <input id="body-year" inputMode="numeric" value={birthYear} onChange={(e) => setBirthYear(e.target.value)} placeholder="1990" />
        </label>
      </div>
      <label className="field">
        <span>Тренировки</span>
        <select value={activity} onChange={(e) => setActivity(e.target.value)}>
          {ACTIVITY.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </label>
      {err && <div className="alert">{err}</div>}
      <div className="row gap">
        {onCancel && (
          <button className="btn" onClick={onCancel} disabled={busy}>
            Отмена
          </button>
        )}
        <button className="btn btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Сохраняем…' : 'Сохранить'}
        </button>
      </div>
    </div>
  );
}

function EntryList({ entries, profile, onDelete }: { entries: BodyEntry[]; profile: BodyProfile | null; onDelete: (date: string) => Promise<void> }) {
  const [all, setAll] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const list = [...entries].reverse();
  const shown = all ? list : list.slice(0, 10);
  return (
    <section className="block">
      <div className="block-head">
        <h4>Записи</h4>
      </div>
      <table className="session-table body-table">
        <tbody>
          {shown.map((e) => {
            const tape = [e.waist && 'талия ' + str(e.waist), e.neck && 'шея ' + str(e.neck), e.hips && 'бёдра ' + str(e.hips)].filter(Boolean).join(' · ');
            const bf = profile && e.waist && e.neck ? navyBodyFat(profile, e) : null;
            return deleting === e.date ? (
              <tr key={e.date}>
                <td colSpan={3}>
                  <Confirm
                    text={'Удалить запись за ' + fmtDate(e.date) + '?'}
                    confirmLabel="Удалить"
                    onConfirm={async () => {
                      await onDelete(e.date);
                      setDeleting(null);
                    }}
                    onCancel={() => setDeleting(null)}
                  />
                </td>
              </tr>
            ) : (
              <tr key={e.date}>
                <td className="muted">{fmtDate(e.date)}</td>
                <td>
                  {typeof e.weight === 'number' && <b className="num">{fmtKg(e.weight)} кг</b>}
                  {typeof e.steps === 'number' && <span className="small"> {fmtSteps(e.steps)} шаг.</span>}
                  {typeof e.kcal === 'number' && <span className="small"> {fmtSteps(e.kcal)} ккал</span>}
                  {tape && <span className="muted small"> {tape}</span>}
                  {bf !== null && <span className="small"> · {fmtKg(bf)} %</span>}
                </td>
                <td>
                  <button className="icon-btn sm" aria-label={'Удалить запись за ' + fmtDate(e.date)} onClick={() => setDeleting(e.date)}>
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {list.length > 10 && (
        <button className="link-btn" onClick={() => setAll(!all)}>
          {all ? 'Свернуть' : 'Показать все (' + list.length + ')'}
        </button>
      )}
    </section>
  );
}

/**
 * Steps and weight from «Здоровье» on iPhone: a personal key for a shortcut in «Команды» that sends today's steps
 * and weight every evening. The key is shown once; a new one switches the old one off.
 */
function HealthLink({ clientId, onDone }: { clientId?: string; onDone: () => void }) {
  const [state, setState] = useState<{ active: boolean; createdAt: string | null } | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState('');
  const [confirmOff, setConfirmOff] = useState(false);
  const q = clientId ? '?clientId=' + encodeURIComponent(clientId) : '';
  useEffect(() => {
    api
      .get('/api/health-key' + q)
      .then((r) => setState(r.data))
      .catch(() => setState({ active: false, createdAt: null }));
  }, [q]);
  const post = async (revoke = false) => {
    setBusy(true);
    setErr('');
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const r = await api.post('/api/health-key', { ...(clientId ? { clientId } : {}), timeZone, ...(revoke ? { revoke: true } : {}) });
      setState({ active: r.data.active, createdAt: r.data.createdAt || null });
      setKey(r.data.key || '');
      setConfirmOff(false);
      onDone();
    } catch (e) {
      setErr(readError(e));
    } finally {
      setBusy(false);
    }
  };
  const address = isLocal() ? '' : healthUrl();
  // Not copied (an old browser): the text stays on screen to select by hand.
  const copy = (what: string, value: string) =>
    void copyLater(Promise.resolve(value)).then((failed) => {
      if (failed) return;
      setCopied(what);
      setTimeout(() => setCopied(''), 1800);
    });
  return (
    <section className="block health-link">
      <details open={!!key}>
        <summary>
          <h4>
            <HeartPulse size={16} /> Шаги и вес из «Здоровья» (iPhone)
          </h4>
          <span className="muted small">{state?.active ? 'подключено' + (state.createdAt ? ' с ' + fmtDate(state.createdAt.slice(0, 10)) : '') : 'не подключено'}</span>
        </summary>
        <p className="muted small">
          Команда в приложении «Команды» на iPhone каждый вечер берёт из «Здоровья» шаги и вес за день и записывает их сюда.
          Настраивается один раз{clientId ? ' на телефоне клиента: отправьте ему ключ и эту инструкцию' : ''}.
        </p>
        {err && <div className="alert">{err}</div>}
        {key ? (
          <>
            <div className="field">
              <span>Ключ (показывается один раз)</span>
              <div className="row gap">
                <code className="health-key grow">{key}</code>
                <button className="btn btn-sm" onClick={() => copy('key', key)}>
                  <Copy size={15} /> {copied === 'key' ? 'Скопировано' : 'Скопировать'}
                </button>
              </div>
            </div>
            <div className="field">
              <span>Адрес</span>
              <div className="row gap">
                <code className="health-key grow">{address || 'в тестовом режиме адреса нет'}</code>
                {address && (
                  <button className="btn btn-sm" onClick={() => copy('url', address)}>
                    <Copy size={15} /> {copied === 'url' ? 'Скопировано' : 'Скопировать'}
                  </button>
                )}
              </div>
            </div>
            <ol className="small health-steps">
              <li>Откройте «Команды» → «+» (новая команда).</li>
              <li>
                Действие «Найти данные Здоровья» (в старых iOS — «Найти образцы здоровья»): Тип — «Шаги», фильтр «Дата начала» —
                «Сегодня», «Группировать по» — «День».
              </li>
              <li>Действие «Вычислить статистику» — «Сумма».</li>
              <li>
                Ещё «Найти данные Здоровья»: Тип — «Вес», фильтр «Дата начала» — «Сегодня», «Сортировать по» — «Дата начала»,
                «Порядок» — «Сначала новые», «Ограничение» — 1.
              </li>
              <li>
                Действие «Получить содержимое URL»: адрес выше. В «Показать больше»: Метод — POST, Тело запроса — JSON, три поля:
                <b> key</b> (Текст) — ключ; <b>steps</b> (Число) — «Статистика»; <b>weight</b> (Число) — «Данные Здоровья» из шага 4.
              </li>
              <li>Назовите команду «Журнал: шаги и вес» и запустите один раз: разрешите доступ к шагам и весу. Ответ — «Записано в „Замеры“…».</li>
              <li>«Автоматизация» → «+» → «Время суток»: 23:30, ежедневно, «Запускать сразу» → эта команда.</li>
            </ol>
            <p className="muted small">Вес берётся только сегодняшний; шаги — за сегодня на момент запуска. Запустить вручную можно в любое время — данные дня обновятся.</p>
          </>
        ) : null}
        <div className="row gap">
          <button className="btn btn-sm btn-primary" disabled={busy || !state} onClick={() => void post()}>
            {state?.active ? 'Новый ключ' : 'Подключить'}
          </button>
          {state?.active && (
            <button className="btn btn-sm btn-quiet" disabled={busy} onClick={() => setConfirmOff(true)}>
              Отключить
            </button>
          )}
        </div>
        {state?.active && !key && <p className="muted small">Новый ключ отключит старый — команду нужно будет обновить.</p>}
        {confirmOff && (
          <Confirm
            text="Отключить? Команда на iPhone перестанет записывать шаги и вес."
            confirmLabel="Отключить"
            onConfirm={() => void post(true)}
            onCancel={() => setConfirmOff(false)}
          />
        )}
      </details>
    </section>
  );
}
