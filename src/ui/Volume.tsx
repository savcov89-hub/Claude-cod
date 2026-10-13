import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { fmtKg } from '../analytics';
import { muscleResolver } from '../trainingRules';
import type { Exercise, Program, Session } from '../types';
import {
  GROUPS,
  doneTally,
  inWeek,
  loadKeys,
  muscleNames,
  ownLoad,
  partsOfGroup,
  planTally,
  sumTargets,
  accentParts,
  volumeRows,
  weekPlan,
  weekStart,
  perWeekOf,
  type Load,
  type MusclePart,
  type VolumeRow,
} from '../volume';
import { plural } from './common';

const day = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
/** «6–12 окт.», «29 сент. – 5 окт.». */
function weekLabel(start: Date) {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return start.getMonth() === end.getMonth() ? start.getDate() + '–' + day.format(end) : day.format(start) + ' – ' + day.format(end);
}
const num = (v: number) => fmtKg(Math.round(v * 2) / 2);
const BAND = [10, 20];

/**
 * Sets per muscle in a week, Monday to Sunday: done (recorded workouts) against the plan
 * (the active programs for a week). Taking part counts as half a set.
 */
export function WeekVolume({ sessions, programs = [], exercises = [] }: { sessions: Session[]; programs?: Program[]; exercises?: Exercise[] }) {
  const [offset, setOffset] = useState(0);
  const start = weekStart(Date.now(), offset);
  const active = useMemo(() => programs.filter((p) => !p.archived && p.days.length), [programs]);
  const resolve = useMemo(() => muscleResolver(programs, exercises), [programs, exercises]);
  const week = useMemo(() => inWeek(sessions, start), [sessions, start.getTime()]);
  const planned = useMemo(() => weekPlan(active), [active]);
  const targets = useMemo(() => sumTargets(active.map((p) => p.targets)), [active]);
  const accents = useMemo(() => [...new Set(active.flatMap((p) => p.focus?.accents || []))], [active]);
  const rows = useMemo(() => volumeRows(doneTally(week, resolve), planTally(planned, resolve), targets), [week, planned, resolve, targets]);
  const setsDone = week.reduce((n, s) => n + s.exercises.reduce((k, e) => k + e.sets.filter((x) => x.reps > 0).length, 0), 0);
  const setsPlan = Math.round(planned.reduce((n, e) => n + e.sets, 0));
  const workouts = active.reduce((n, p) => n + perWeekOf(p), 0);
  // The first week shown is the one of the first workout (or this one).
  const first = sessions.reduce((a, s) => (s.completedAt < a ? s.completedAt : a), new Date().toISOString());
  const oldest = Math.round((weekStart(Date.now()).getTime() - weekStart(new Date(first).getTime()).getTime()) / (7 * 86400000));
  if (!rows.length && !sessions.length) return null;
  return (
    <section className="block week-volume">
      <div className="week-head">
        <h4>Объём недели</h4>
        <div className="week-nav">
          <button className="icon-btn sm" aria-label="Прошлая неделя" disabled={-offset >= oldest} onClick={() => setOffset(offset - 1)}>
            <ChevronLeft size={18} />
          </button>
          <span className="num">{offset === 0 ? 'Эта неделя · ' : ''}{weekLabel(start)}</span>
          <button className="icon-btn sm" aria-label="Следующая неделя" disabled={offset >= 0} onClick={() => setOffset(offset + 1)}>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <p className="muted small">
        {week.length} {plural(week.length, 'тренировка', 'тренировки', 'тренировок')}
        {workouts ? ` из ${workouts}` : ''} · {setsDone} {plural(setsDone, 'подход', 'подхода', 'подходов')}
        {workouts ? ` из ${setsPlan} по плану` : ''}
      </p>
      {rows.length ? <VolumeBars rows={rows} plan={workouts > 0} accents={accents} /> : <p className="muted small">На этой неделе тренировок не было.</p>}
      <VolumeLegend plan={workouts > 0} targets={Object.keys(targets).length > 0} />
    </section>
  );
}

/** Planned weekly volume of a program — in the program editor, with how many times a week it is done. */
export function PlanVolume({
  days,
  perWeek,
  onPerWeek,
  targets = {},
  accents = [],
}: {
  days: Program['days'];
  perWeek?: number;
  onPerWeek: (n: number | undefined) => void;
  targets?: Record<string, number>;
  accents?: string[];
}) {
  const times = perWeek || Math.min(days.length, 7);
  const rows = useMemo(
    // Shown as the done bar: there is nothing else to compare with.
    () => volumeRows(planTally(weekPlan([{ days, perWeek }])), { parts: {}, groups: {} }, targets),
    [days, perWeek, targets],
  );
  const hasTargets = Object.keys(targets).length > 0;
  return (
    <section className="block week-volume">
      <h4>Объём за неделю</h4>
      <div className="field">
        <span>Тренировок в неделю</span>
        <div className="chips" role="group" aria-label="Тренировок в неделю">
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <button key={n} type="button" className={'filter' + (times === n ? ' on' : '')} onClick={() => onPerWeek(n === Math.min(days.length, 7) ? undefined : n)}>
              {n}
            </button>
          ))}
        </div>
      </div>
      <p className="muted small">
        {times === days.length
          ? 'Каждая тренировка программы — раз в неделю.'
          : times < days.length
            ? `${days.length} ${plural(days.length, 'тренировка', 'тренировки', 'тренировок')} программы по кругу, ${times} в неделю: в среднем ${Math.round((times / days.length) * 100)}% программы за неделю.`
            : `${times} в неделю при ${days.length} в программе: тренировки повторяются чаще раза в неделю.`}
      </p>
      {rows.length ? <VolumeBars rows={rows} plan={false} accents={accents} /> : <p className="muted small">Добавьте упражнения.</p>}
      <VolumeLegend plan={false} targets={hasTargets} />
    </section>
  );
}

function VolumeLegend({ plan, targets }: { plan: boolean; targets?: boolean }) {
  return (
    <div className="vol-legend small muted">
      <span>
        <i className="sw done" /> {plan ? 'сделано' : 'подходов'}
      </span>
      {plan && (
        <span>
          <i className="sw plan" /> по плану
        </span>
      )}
      {targets && (
        <span>
          <i className="sw target" /> цель тренера
        </span>
      )}
      <span>
        <i className="sw band" /> 10–20 — ориентир для роста
      </span>
      <span className="vol-rule">
        Основная работа — 1 подход, участие — ½. Двусуставные и односуставные части мышцы считаются отдельно: длинная головка трицепса,
        прямая мышца бедра и короткая головка бицепса бедра работают в разных упражнениях.
      </span>
    </div>
  );
}

function VolumeBars({ rows, plan, accents = [] }: { rows: VolumeRow[]; plan: boolean; accents?: string[] }) {
  const marked = accentParts(accents);
  const max = Math.max(BAND[1] + 4, ...rows.flatMap((r) => [r.done, r.plan, r.target || 0, ...r.parts.map((p) => p.target || 0)]));
  const pct = (v: number) => Math.min(100, (v / max) * 100) + '%';
  const line = (r: { done: number; plan: number; target?: number }, cls: string, label: string, band: boolean, joints?: string, accent?: boolean) => {
    // Week: done against the plan. Editor: the plan (shown as done) against the trainer's target, ±1 set.
    const reached = plan ? r.plan > 0 && r.done >= r.plan : !!r.target && Math.abs(r.done - r.target) <= 1;
    const title =
      (plan ? `${label}: сделано ${num(r.done)} из ${num(r.plan)} по плану` : `${label}: ${num(r.done)} в неделю`) +
      (r.target ? `, цель ${r.target}` : '');
    return (
      <div className={'vol-row ' + cls} title={title}>
        <span className="vol-name">
          {label}
          {joints && <span className="vol-joints"> · {joints}</span>}
          {accent && <span className="pv-accent">акцент</span>}
        </span>
        <div className="vol-bar">
          {band && !r.target && <b className="vol-band" style={{ left: pct(BAND[0]), width: `calc(${pct(BAND[1])} - ${pct(BAND[0])})` }} aria-hidden="true" />}
          {plan && r.plan > 0 && <i className="vol-plan" style={{ width: pct(r.plan) }} />}
          {r.done > 0 && <i className="vol-done" style={{ width: pct(r.done) }} />}
          {!!r.target && <b className="vol-target" style={{ left: pct(r.target) }} aria-hidden="true" />}
        </div>
        <span className="vol-num num">
          {num(r.done)}
          {plan && <span className="muted"> / {num(r.plan)}</span>}
          {!plan && !!r.target && <span className="muted"> · цель {r.target}</span>}
          {reached && <span className="vol-ok" aria-label={plan ? 'план выполнен' : 'в цели'}> ✓</span>}
        </span>
      </div>
    );
  };
  return (
    <div className="vol-bars">
      {rows.map((r) => (
        <div className="vol-group" key={r.id}>
          {line(r, 'vol-whole', r.name, true, undefined, partsOfGroup(r.id).some((p) => marked.has(p.id)))}
          {r.parts.map((p) => (
            <div key={p.id}>{line(p, 'vol-part', p.name, false, p.joints)}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Muscles of an own exercise: a tap makes a part the main work (1 set), the next one — taking part (½), the next — off.
 * Older records keep whole groups: they show as all of the group's parts.
 */
export function MuscleChips({ value, onChange }: { value: string[]; onChange: (keys: string[]) => void }) {
  const load = ownLoad(value);
  const toggle = (id: string) => {
    const next: Load = { ...load };
    const f = next[id];
    if (!f) next[id] = 1;
    else if (f === 1) next[id] = 0.5;
    else delete next[id];
    onChange(loadKeys(next));
  };
  const chip = (p: MusclePart, label: string, full: string) => {
    const f = load[p.id];
    return (
      <button
        key={p.id}
        type="button"
        className={'filter' + (f === 1 ? ' on' : f ? ' half' : '')}
        aria-pressed={!!f}
        aria-label={full + (f === 1 ? ', 1 подход' : f ? ', ½ подхода' : '')}
        onClick={() => toggle(p.id)}
      >
        {label}
        {f ? <small>{f === 1 ? '1' : '½'}</small> : null}
      </button>
    );
  };
  // Whole muscles in one row, then the muscles counted by parts, each under its name.
  const whole = GROUPS.filter((g) => partsOfGroup(g).length === 1);
  const split = GROUPS.filter((g) => partsOfGroup(g).length > 1);
  return (
    <div className="muscle-chips">
      <div className="chips">{whole.map((g) => chip(partsOfGroup(g)[0], muscleNames[g], muscleNames[g]))}</div>
      {split.map((g) => (
        <div className="muscle-chip-row" key={g}>
          <span className="muted small">{muscleNames[g]}</span>
          <div className="chips">{partsOfGroup(g).map((p) => chip(p, p.short || p.name, muscleNames[g] + ': ' + p.name))}</div>
        </div>
      ))}
    </div>
  );
}
