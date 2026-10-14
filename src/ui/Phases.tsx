import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Minus, Plus, Trash2 } from 'lucide-react';
import { muscleResolver } from '../trainingRules';
import type { Exercise, Program, Session } from '../types';
import { ACCENTS, MAX_ACCENTS } from '../volume';
import { phaseLabel, planProgress, thisMonday, type Phase, type PhasePlan, type StageProgress } from '../phases';
import { Sheet, plural } from './common';

const day = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
const num = (v: number) => String(Math.round(v * 2) / 2).replace('.', ',');
const accentName = (id: string) => ACCENTS.find((a) => a.id === id)?.label || id;
const weeksText = (n: number) => n + ' ' + plural(n, 'неделя', 'недели', 'недель');

/**
 * Specialisation plan: the stages on one line (done, now, next) and the current stage in detail — the week, the sets
 * done for each accent against the plan, what is left. The trainer edits it; the client sees it.
 */
export function PhasesBlock({
  plan,
  sessions,
  programs = [],
  exercises = [],
  onSave,
}: {
  plan?: PhasePlan;
  sessions: Session[];
  programs?: Program[];
  exercises?: Exercise[];
  /** Trainer only: save the plan (null removes it). */
  onSave?: (plan: PhasePlan | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const resolve = useMemo(() => muscleResolver(programs, exercises), [programs, exercises]);
  const stages = useMemo(() => (plan ? planProgress(plan, sessions, resolve) : []), [plan, sessions, resolve]);
  if (!plan && !onSave) return null;
  const total = stages.reduce((n, s) => n + s.phase.weeks, 0);
  const current = stages.find((s) => s.state === 'now');
  const next = stages.find((s) => s.state === 'next');
  const allDone = stages.length > 0 && stages.every((s) => s.state === 'done');
  return (
    <section className="block phases">
      <div className="week-head">
        <h4>План акцентов</h4>
        {onSave && (
          <button className="btn btn-sm btn-quiet" onClick={() => setEditing(true)}>
            {plan ? 'Изменить план' : 'Составить план'}
          </button>
        )}
      </div>
      {!plan ? (
        <p className="muted small">
          Этапы специализации друг за другом: например, грудь — 20 подходов в неделю 8 недель, потом руки — 20 подходов 8 недель.
          Здесь будет видно, какая идёт неделя, сколько подходов сделано и сколько осталось.
        </p>
      ) : (
        <>
          <div className="ph-line" role="img" aria-label={stages.map((s, i) => `Этап ${i + 1}: ${phaseLabel(s.phase)}, ${weeksText(s.phase.weeks)}`).join('; ')}>
            {stages.map((s, i) => (
              <div key={i} className={'ph-seg is-' + s.state} style={{ flexGrow: s.phase.weeks, flexBasis: 0 }}>
                {s.state === 'now' && <i className="ph-mark" style={{ left: ((s.week - 0.5) / s.phase.weeks) * 100 + '%' }} />}
                <span>{phaseLabel(s.phase)}</span>
              </div>
            ))}
          </div>
          <p className="muted small">
            {stages.length} {plural(stages.length, 'этап', 'этапа', 'этапов')} · {weeksText(total)} · с {day.format(stages[0].from)} по{' '}
            {day.format(new Date(stages[stages.length - 1].to.getTime() - 86400000))}
          </p>
          {current && <StageCard stage={current} index={stages.indexOf(current)} count={stages.length} />}
          {!current && !allDone && next && (
            <p className="small">
              Начнётся {day.format(next.from)}: {phaseLabel(next.phase)}, {next.phase.sets} {plural(next.phase.sets, 'подход', 'подхода', 'подходов')} в неделю,{' '}
              {weeksText(next.phase.weeks)}.
            </p>
          )}
          {allDone && <p className="small tone-good">План пройден. Составьте следующий — «Изменить план».</p>}
          {current && next && (
            <p className="muted small">
              Дальше с {day.format(next.from)}: {phaseLabel(next.phase)} — {next.phase.sets} {plural(next.phase.sets, 'подход', 'подхода', 'подходов')} в неделю,{' '}
              {weeksText(next.phase.weeks)}. Программу под этап составит «По объёму» → «Взять этап из плана».
            </p>
          )}
          <div className="ph-list">
            {stages
              .filter((s) => s.state === 'done')
              .map((s) => (
                <div key={s.from.getTime()} className="ph-past small">
                  ✓ {phaseLabel(s.phase)} · {weeksText(s.phase.weeks)} ·{' '}
                  {s.accents.map((a) => `${accentName(a.id)} ${num(a.done)} из ${a.planned}`).join(', ')}
                </div>
              ))}
          </div>
        </>
      )}
      {editing && onSave && (
        <PlanEditor
          plan={plan}
          onClose={() => setEditing(false)}
          onSave={async (p) => {
            await onSave(p);
            setEditing(false);
          }}
        />
      )}
    </section>
  );
}

function StageCard({ stage: s, index, count }: { stage: StageProgress; index: number; count: number }) {
  const left = s.phase.weeks - s.week;
  return (
    <div className="ph-card">
      <strong>
        Этап {index + 1} из {count}: {phaseLabel(s.phase)} — {s.phase.sets} {plural(s.phase.sets, 'подход', 'подхода', 'подходов')} в неделю
      </strong>
      <span className="muted small">
        Неделя {s.week} из {s.phase.weeks}
        {left > 0 ? ` · осталось ${weeksText(left)} после этой, до ${day.format(new Date(s.to.getTime() - 86400000))}` : ' · последняя неделя этапа'}
      </span>
      {s.accents.map((a) => {
        const pct = (v: number) => Math.min(100, (v / a.planned) * 100) + '%';
        const behind = a.done < a.byNow - s.phase.sets;
        return (
          <div className="ph-acc" key={a.id} title={`${accentName(a.id)}: сделано ${num(a.done)} из ${a.planned}, по плану к концу недели ${a.byNow}`}>
            <div className="ph-acc-head small">
              <span>{accentName(a.id)}</span>
              <span className="num">
                {num(a.done)} <span className="muted">из {a.planned}</span>
              </span>
            </div>
            <div className="vol-bar">
              <i className="vol-plan" style={{ width: pct(a.byNow) }} />
              <i className="vol-done" style={{ width: pct(a.done) }} />
            </div>
            <span className="muted small">
              Эта неделя: {num(a.thisWeek)} из {s.phase.sets} · по плану к концу недели {a.byNow} · осталось {num(Math.max(0, a.planned - a.done))}
              {behind && <span className="tone-warn"> · отстаёт от плана на {num(a.byNow - a.done)}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const emptyStage = (): Phase => ({ accents: [], sets: 20, weeks: 8 });

function PlanEditor({ plan, onClose, onSave }: { plan?: PhasePlan; onClose: () => void; onSave: (p: PhasePlan | null) => Promise<void> }) {
  const [start, setStart] = useState(plan?.start || thisMonday());
  const [list, setList] = useState<Phase[]>(plan?.list.length ? plan.list.map((p) => ({ ...p, accents: [...p.accents] })) : [emptyStage()]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const patch = (i: number, next: Partial<Phase>) => setList((l) => l.map((p, j) => (j === i ? { ...p, ...next } : p)));
  const toggle = (i: number, ids: string[]) => {
    const cur = list[i].accents;
    const on = ids.every((id) => cur.includes(id));
    const next = on ? cur.filter((a) => !ids.includes(a)) : [...cur, ...ids.filter((id) => !cur.includes(id))];
    if (next.length > MAX_ACCENTS) return setErr(`В этапе не больше ${MAX_ACCENTS} акцентов.`);
    setErr('');
    patch(i, { accents: next });
  };
  const move = (i: number, d: -1 | 1) =>
    setList((l) => {
      const j = i + d;
      if (j < 0 || j >= l.length) return l;
      const c = [...l];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  const save = async () => {
    if (list.some((p) => !p.accents.length)) return setErr('Выберите акцент в каждом этапе.');
    setBusy(true);
    try {
      // Stages run Monday to Sunday: the plan starts on the Monday of the chosen day's week.
      await onSave({ start: thisMonday(new Date(start + 'T12:00:00').getTime()), list });
    } catch (e) {
      setErr(String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  };
  const step = (label: string, value: number, min: number, max: number, by: number, onChange: (n: number) => void) => (
    <div className="pv-row">
      <span className="pv-name">{label}</span>
      <div className="pv-step">
        <button type="button" className="icon-btn sm" aria-label={'Меньше: ' + label} disabled={value <= min} onClick={() => onChange(Math.max(min, value - by))}>
          <Minus size={16} />
        </button>
        <input className="num" inputMode="numeric" aria-label={label} value={value} onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value.replace(/\D/g, '')) || min)))} />
        <button type="button" className="icon-btn sm" aria-label={'Больше: ' + label} disabled={value >= max} onClick={() => onChange(Math.min(max, value + by))}>
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
  return (
    <Sheet title="План акцентов" onClose={onClose}>
      {err && <div className="alert">{err}</div>}
      <label className="field">
        <span>Начало — неделя с понедельника</span>
        <input id="phases-start" type="date" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} />
      </label>
      {list.map((p, i) => (
        <div className="ph-edit" key={i}>
          <div className="ph-edit-head">
            <strong>Этап {i + 1}</strong>
            <button className="icon-btn sm" aria-label={'Выше: этап ' + (i + 1)} disabled={i === 0} onClick={() => move(i, -1)}>
              <ArrowUp size={16} />
            </button>
            <button className="icon-btn sm" aria-label={'Ниже: этап ' + (i + 1)} disabled={i === list.length - 1} onClick={() => move(i, 1)}>
              <ArrowDown size={16} />
            </button>
            <button className="icon-btn sm danger" aria-label={'Удалить этап ' + (i + 1)} disabled={list.length === 1} onClick={() => setList((l) => l.filter((_, j) => j !== i))}>
              <Trash2 size={16} />
            </button>
          </div>
          <div className="chips" role="group" aria-label={'Акценты этапа ' + (i + 1)}>
            {ACCENTS.map((a) => (
              <button key={a.id} type="button" className={'filter' + (p.accents.includes(a.id) ? ' on' : '')} aria-pressed={p.accents.includes(a.id)} onClick={() => toggle(i, [a.id])}>
                {a.label}
              </button>
            ))}
            <button type="button" className={'filter' + (p.accents.includes('biceps') && p.accents.includes('triceps') ? ' on' : '')} onClick={() => toggle(i, ['biceps', 'triceps'])}>
              Руки = бицепс + трицепс
            </button>
          </div>
          {step('Подходов в неделю на каждый акцент', p.sets, 4, 40, 2, (n) => patch(i, { sets: n }))}
          {step('Недель', p.weeks, 1, 26, 1, (n) => patch(i, { weeks: n }))}
        </div>
      ))}
      <button className="btn btn-block" onClick={() => setList((l) => [...l, emptyStage()])}>
        <Plus size={16} /> Добавить этап
      </button>
      <p className="muted small">
        Подходы считаются как в «Объёме недели»: основная работа — 1, участие — ½. У дельт складываются три пучка. Остальные мышцы на
        поддержании — их задаёт «По объёму» при составлении программы этапа.
      </p>
      <button className="btn btn-primary btn-block" disabled={busy} onClick={save}>
        {busy ? 'Сохраняем…' : 'Сохранить план'}
      </button>
      {plan && (
        <button className="btn btn-quiet btn-block" disabled={busy} onClick={() => void onSave(null)}>
          Убрать план
        </button>
      )}
    </Sheet>
  );
}
