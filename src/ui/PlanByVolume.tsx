import { useState } from 'react';
import { Minus, Plus, RefreshCw, Undo2 } from 'lucide-react';
import type { ProgramDay } from '../types';
import { GROUPS, muscleNames, partsOfGroup, planTally, PARTS } from '../volume';
import { SPLITS, TARGET_PRESETS, autoSplit, planByVolume, type SplitKind } from '../volumePlanner';
import { plural } from './common';

const partName = (id: string) => {
  const p = PARTS.find((x) => x.id === id)!;
  return p.group === p.id || p.group === 'delts' ? p.name : muscleNames[p.group] + ': ' + p.name.toLowerCase();
};
const num = (v: number) => String(Math.round(v * 2) / 2).replace('.', ',');

/**
 * «По объёму»: the trainer sets weekly sets for every muscle part, the app makes the workouts
 * (src/volumePlanner.ts). The result is an ordinary program: everything stays editable below.
 */
export function PlanByVolume({
  days,
  targets,
  onTargets,
  onMake,
  onUndo,
}: {
  days: ProgramDay[];
  targets: Record<string, number>;
  onTargets: (t: Record<string, number>) => void;
  onMake: (days: ProgramDay[], splitLabel: string, times: number) => void;
  onUndo?: () => void;
}) {
  const [open, setOpen] = useState(Object.keys(targets).length > 0);
  const [times, setTimes] = useState(Math.min(7, Math.max(2, days.filter((d) => d.exercises.length).length || 3)));
  const [split, setSplit] = useState<SplitKind | null>(null);
  const [perDay, setPerDay] = useState(7);
  const [variant, setVariant] = useState(0);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{ short: string[]; over: string[] } | null>(null);
  const kind = split || autoSplit(times);
  const total = Object.values(targets).reduce((s, n) => s + n, 0);

  const set = (id: string, n: number) => {
    const next = { ...targets };
    if (n > 0) next[id] = Math.min(40, n);
    else delete next[id];
    onTargets(next);
    setReport(null);
  };
  /** Targets from the program as it is now: to change its volume a little and make it again. */
  const fromProgram = () => {
    const t = planTally(days.flatMap((d) => d.exercises));
    const next: Record<string, number> = {};
    for (const [p, v] of Object.entries(t.parts)) if (Math.round(v) >= 1) next[p] = Math.round(v);
    onTargets(next);
    setReport(null);
  };
  const make = (v: number) => {
    setBusy(true);
    setVariant(v);
    // A moment for «Составляем…» to show: the planner takes a fraction of a second on a phone.
    setTimeout(() => {
      const r = planByVolume(targets, { days: times, split: kind, perDay, variant: v });
      const short: string[] = [];
      const over: string[] = [];
      for (const p of PARTS) {
        const t = targets[p.id] || 0;
        const got = r.total[p.id] || 0;
        if (t && got <= t - 1.5) short.push(`${partName(p.id)} ${num(got)} из ${t}`);
        else if (t && got >= t + 2) over.push(`${partName(p.id)} ${num(got)} при цели ${t}`);
      }
      setReport({ short, over });
      setBusy(false);
      onMake(r.days, SPLITS.find((x) => x.id === r.split)!.label, times);
    }, 30);
  };

  return (
    <section className="block plan-volume">
      <button className="block-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <h4>По объёму</h4>
        <span className="muted small">{total ? `цели: ${total} ${plural(total, 'подход', 'подхода', 'подходов')} в неделю` : 'подходы на мышцы → программа'}</span>
      </button>
      {open && (
        <div className="pv">
          <p className="muted small">
            Задайте подходы в неделю на каждую часть мышц — приложение составит тренировки. Половинки считаются: жим даёт передней дельте
            и трицепсу по ½ подхода, поэтому изоляции добавится ровно на остаток.
          </p>
          <div className="field">
            <span>Тренировок в неделю</span>
            <div className="chips" role="group" aria-label="Тренировок в неделю для составления">
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <button key={n} type="button" className={'filter' + (times === n ? ' on' : '')} onClick={() => (setTimes(n), setReport(null))}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>Схема{split ? '' : ' — выбрана по числу тренировок'}</span>
            <div className="chips" role="group" aria-label="Схема тренировок">
              {SPLITS.map((x) => (
                <button key={x.id} type="button" className={'filter' + (kind === x.id ? ' on' : '')} onClick={() => (setSplit(x.id === autoSplit(times) ? null : x.id), setReport(null))}>
                  {x.label}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>Упражнений в тренировке, не больше</span>
            <div className="chips" role="group" aria-label="Упражнений в тренировке">
              {[4, 5, 6, 7, 8, 9].map((n) => (
                <button key={n} type="button" className={'filter' + (perDay === n ? ' on' : '')} onClick={() => (setPerDay(n), setReport(null))}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>Цели на неделю</span>
            <div className="chips" role="group" aria-label="Готовые цели">
              {TARGET_PRESETS.map((p) => (
                <button key={p.id} type="button" className="filter" onClick={() => (onTargets({ ...p.targets }), setReport(null))}>
                  {p.label}
                </button>
              ))}
              {days.some((d) => d.exercises.length) && (
                <button type="button" className="filter" onClick={fromProgram}>
                  Как в программе
                </button>
              )}
              {total > 0 && (
                <button type="button" className="filter" onClick={() => (onTargets({}), setReport(null))}>
                  Очистить
                </button>
              )}
            </div>
          </div>
          <div className="pv-targets">
            {GROUPS.map((g) => {
              const parts = partsOfGroup(g);
              return (
                <div className="pv-group" key={g}>
                  {parts.length > 1 && <span className="pv-group-name">{muscleNames[g]}</span>}
                  {parts.map((p) => {
                    const n = targets[p.id] || 0;
                    const label = parts.length > 1 ? p.name : muscleNames[g];
                    return (
                      <div className={'pv-row' + (parts.length > 1 ? ' pv-part' : '')} key={p.id}>
                        <span className="pv-name">
                          {label}
                          {p.joints && <span className="vol-joints"> · {p.joints}</span>}
                        </span>
                        <div className="pv-step">
                          <button type="button" className="icon-btn sm" aria-label={'Меньше: ' + partName(p.id)} disabled={!n} onClick={() => set(p.id, n - 1)}>
                            <Minus size={16} />
                          </button>
                          <input
                            className="num"
                            inputMode="numeric"
                            aria-label={'Подходов в неделю: ' + partName(p.id)}
                            value={n || ''}
                            placeholder="0"
                            onChange={(e) => set(p.id, Math.round(Number(e.target.value.replace(/\D/g, '')) || 0))}
                          />
                          <button type="button" className="icon-btn sm" aria-label={'Больше: ' + partName(p.id)} onClick={() => set(p.id, n + 1)}>
                            <Plus size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <div className="row gap wrap">
            <button className="btn btn-primary" disabled={!total || busy} onClick={() => make(0)}>
              {busy ? 'Составляем…' : 'Составить программу'}
            </button>
            {report && (
              <button className="btn btn-sm" disabled={busy} onClick={() => make(variant + 1)}>
                <RefreshCw size={15} /> Другой вариант
              </button>
            )}
            {report && onUndo && (
              <button
                className="btn btn-sm btn-quiet"
                onClick={() => {
                  onUndo();
                  setReport(null);
                }}
              >
                <Undo2 size={15} /> Отменить
              </button>
            )}
          </div>
          {report && (
            <div className="pv-report small">
              {!report.short.length && !report.over.length && <p className="tone-good">Получилось в пределах ±1 подхода от каждой цели.</p>}
              {report.short.length > 0 && (
                <p>
                  <b>Не уместилось:</b> {report.short.join(', ')}. Добавьте тренировку в неделю или упражнений в тренировке — или уменьшите цели.
                </p>
              )}
              {report.over.length > 0 && (
                <p className="muted">
                  <b>Сверх цели</b> (идёт половинками от базовых упражнений): {report.over.join(', ')}.
                </p>
              )}
              <p className="muted">Ниже — обычная программа: любое упражнение можно заменить, убрать или поменять подходы.</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
