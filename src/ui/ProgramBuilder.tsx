import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Plus, RefreshCw, Search, Trash2, Undo2 } from 'lucide-react';
import { api, readError } from '../transport';
import { templateDays, templates } from '../templates';
import {
  SESSION_SOFT_LIMIT,
  cycleLoad,
  exerciseRules,
  groupMuscles,
  muscleLoad,
  muscleNames,
  programIssue,
  programWarnings,
} from '../trainingRules';
import { fmtKg } from '../analytics';
import type { ClientItem, Exercise, Program, ProgramDay, ProgramExercise } from '../types';
import { Sheet, searchKey } from './common';
import { AddExercise } from './Library';

export interface BuilderOptions {
  clientId?: string;
  program?: Program;
  copy?: boolean;
}

const newDayId = () => 'day-' + (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36));

export function ProgramBuilder({
  clients,
  exercises,
  options,
  onClose,
  onSaved,
  onExerciseCreated,
}: {
  clients: ClientItem[];
  exercises: Exercise[];
  options: BuilderOptions;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onExerciseCreated?: () => void;
}) {
  const editing = !!options.program && !options.copy;
  const active = clients.filter((c) => !c.archived);
  const [clientId, setClientId] = useState(options.clientId || active[0]?.clientId || '');
  const [name, setName] = useState(options.program ? options.program.name + (options.copy ? ' (копия)' : '') : 'Новая программа');
  const [days, setDays] = useState<ProgramDay[]>(
    options.program
      ? JSON.parse(JSON.stringify(options.program.days))
      : [{ id: 'day-1', name: 'Тренировка A', exercises: [] }],
  );
  const [activeDay, setActiveDay] = useState(0);
  const [template, setTemplate] = useState<number | null>(null);
  const [count, setCount] = useState<5 | 6>(6);
  const [withAbs, setWithAbs] = useState(true);
  const [variant, setVariant] = useState(0);
  const [undo, setUndo] = useState<{ days: ProgramDay[]; name: string } | null>(null);
  const [picker, setPicker] = useState<{ replace: number | null } | null>(null);
  const [showTemplates, setShowTemplates] = useState(!options.program);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState('');

  const day = days[Math.min(activeDay, days.length - 1)];
  const dayLoad = muscleLoad(day.exercises);
  const cycle = useMemo(() => cycleLoad(days), [days]);
  const warnings = programWarnings(days);
  const issue = programIssue(days);

  const generate = (t: number, c = count, v = variant, abs = withAbs) => {
    setUndo({ days, name });
    setDays(templateDays(t, c, v, abs));
    setName(templates[t].name);
    setTemplate(t);
    setCount(c);
    setVariant(v);
    setWithAbs(abs);
    setActiveDay(0);
    setShowTemplates(false);
  };

  const patchDay = (next: ProgramDay) => setDays((ds) => ds.map((d, i) => (i === activeDay ? next : d)));
  const patchExercise = (i: number, patch: Partial<ProgramExercise>) =>
    patchDay({ ...day, exercises: day.exercises.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= day.exercises.length) return;
    const list = [...day.exercises];
    [list[i], list[j]] = [list[j], list[i]];
    patchDay({ ...day, exercises: list });
  };
  const pick = (ex: Exercise) => {
    const replaceAt = picker?.replace ?? null;
    const prev = replaceAt !== null ? day.exercises[replaceAt] : null;
    const isolation = !exerciseRules[ex.id]?.secondary.length;
    const entry: ProgramExercise = {
      exerciseId: ex.id,
      exerciseName: ex.name,
      sets: prev?.sets ?? (isolation ? 2 : 3),
      repMin: prev?.repMin ?? (isolation ? 10 : 8),
      repMax: prev?.repMax ?? (isolation ? 15 : 12),
      targetRir: prev?.targetRir ?? (isolation ? 1 : 2),
      muscles: exerciseRules[ex.id]?.primary || (ex.muscles?.length ? ex.muscles : groupMuscles(ex.muscleGroup)),
    };
    patchDay({
      ...day,
      exercises: replaceAt === null ? [...day.exercises, entry] : day.exercises.map((e, i) => (i === replaceAt ? entry : e)),
    });
    setPicker(null);
  };

  const save = async () => {
    if (!clientId) return setErrorText('Выберите клиента.');
    if (!name.trim()) return setErrorText('Введите название программы.');
    if (issue) return setErrorText(issue);
    if (days.some((d) => d.exercises.some((e) => e.repMax < e.repMin)))
      return setErrorText('Повторы «до» должны быть не меньше «от».');
    setSaving(true);
    setErrorText('');
    try {
      if (editing) await api.post('/api/programs/' + options.program!.id, { name: name.trim(), days });
      else await api.post('/api/programs', { clientId, name: name.trim(), days });
      await onSaved();
    } catch (e) {
      setErrorText(readError(e));
    } finally {
      setSaving(false);
    }
  };

  const groups = ['Доказательный подход', 'Классические', 'Одна тренировка'] as const;

  return (
    <div className="builder">
      <div className="card-head">
        <button className="icon-btn" aria-label="Закрыть конструктор" onClick={onClose}>
          <ArrowLeft size={20} />
        </button>
        <div className="grow">
          <span className="eyebrow">{editing ? 'Изменение программы' : options.copy ? 'Копия программы' : 'Новая программа'}</span>
          <h2>{name || 'Без названия'}</h2>
        </div>
      </div>

      {errorText && <div className="alert">{errorText}</div>}

      <div className="builder-grid">
        <label className="field">
          <span>Клиент</span>
          <select id="builder-client" value={clientId} disabled={editing} onChange={(e) => setClientId(e.target.value)}>
            {active.map((c) => (
              <option key={c.clientId} value={c.clientId}>
                {c.clientName}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Название</span>
          <input id="builder-name" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      </div>
      {editing && (
        <p className="muted small">
          Изменения увидит клиент. История и начатые записи сохранятся; у дня с новым составом упражнений незавершённый черновик начнётся заново.
        </p>
      )}

      <section className="block">
        <button className="block-toggle" onClick={() => setShowTemplates(!showTemplates)} aria-expanded={showTemplates}>
          <h4>Шаблоны</h4>
          <span className="muted small">{template !== null ? templates[template].name : 'заполнить дни автоматически'}</span>
        </button>
        {template !== null && (
          <div className="gen-controls">
            <label className="toggle">
              <span>Основных упражнений</span>
              <select id="gen-count" value={count} onChange={(e) => generate(template, Number(e.target.value) as 5 | 6)}>
                <option value={5}>5</option>
                <option value={6}>6</option>
              </select>
            </label>
            <label className="toggle">
              <input id="gen-abs" type="checkbox" checked={withAbs} onChange={(e) => generate(template, count, variant, e.target.checked)} />
              <span>+ пресс</span>
            </label>
            <button className="btn btn-sm" onClick={() => generate(template, count, variant + 1)}>
              <RefreshCw size={15} /> Другой вариант
            </button>
            {undo && (
              <button
                className="btn btn-sm btn-quiet"
                onClick={() => {
                  setDays(undo.days);
                  setName(undo.name);
                  setUndo(null);
                  setTemplate(null);
                  setActiveDay(0);
                }}
              >
                <Undo2 size={15} /> Отменить
              </button>
            )}
          </div>
        )}
        {showTemplates && (
          <div className="templates">
            {groups.map((g) => (
              <div key={g} className="template-group">
                <span className="eyebrow">{g}</span>
                <div className="template-grid">
                  {templates.map((t, i) =>
                    t.group !== g ? null : (
                      <button key={t.name} className={'template' + (template === i ? ' on' : '')} onClick={() => generate(i)}>
                        <strong>{t.name}</strong>
                        <span className="muted small">
                          {t.perWeek}
                          {t.level ? ' · ' + t.level : ''}
                        </span>
                        {t.note && <span className="small">{t.note}</span>}
                      </button>
                    ),
                  )}
                </div>
              </div>
            ))}
            <p className="muted small">
              Шаблоны собраны по общим принципам доказательного подхода к гипертрофии: 10–20 подходов на мышцу в неделю, частота 2 раза, 1–3 повтора в запасе, упражнения с нагрузкой в растянутом положении, двойная прогрессия. Это не копии авторских программ.
            </p>
          </div>
        )}
      </section>

      <div className="day-tabs" role="tablist">
        {days.map((d, i) => (
          <button key={d.id} role="tab" aria-selected={i === activeDay} className={i === activeDay ? 'on' : ''} onClick={() => setActiveDay(i)}>
            {d.name || 'День ' + (i + 1)}
          </button>
        ))}
        <button
          className="add"
          aria-label="Добавить тренировку"
          disabled={days.length >= 14}
          onClick={() => {
            setDays([...days, { id: newDayId(), name: 'Тренировка ' + (days.length + 1), exercises: [] }]);
            setActiveDay(days.length);
          }}
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="day-editor">
        <div className="row gap">
          <label className="field grow">
            <span>Название тренировки</span>
            <input id="day-name" value={day.name} onChange={(e) => patchDay({ ...day, name: e.target.value })} />
          </label>
          {days.length > 1 && (
            <button
              className="icon-btn danger"
              aria-label="Удалить тренировку"
              onClick={() => {
                setDays(days.filter((_, i) => i !== activeDay));
                setActiveDay(0);
              }}
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>

        <div className="volume">
          <span className="eyebrow">Объём этой тренировки · мягкий лимит {SESSION_SOFT_LIMIT}</span>
          <div className="chips">
            {Object.entries(dayLoad.load).map(([m, v]) => (
              <span key={m} className={'chip ' + (v.total > SESSION_SOFT_LIMIT ? 'chip-warn' : 'chip-muted')}>
                {muscleNames[m]} {fmtKg(v.total)}
              </span>
            ))}
            {!day.exercises.length && <span className="muted small">Добавьте упражнения</span>}
          </div>
        </div>

        <div className="b-list">
          {day.exercises.map((e, i) => {
            const info = exerciseRules[e.exerciseId];
            return (
              <div className="b-ex" key={e.exerciseId}>
                <div className="b-ex-head">
                  <span className="ex-num num">{i + 1}</span>
                  <div className="grow">
                    <strong>{e.exerciseName}</strong>
                    {info && <span className="muted small">{info.position}</span>}
                  </div>
                  <button className="icon-btn sm" aria-label="Выше" disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp size={16} />
                  </button>
                  <button className="icon-btn sm" aria-label="Ниже" disabled={i === day.exercises.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown size={16} />
                  </button>
                  <button className="icon-btn sm" aria-label={'Заменить: ' + e.exerciseName} onClick={() => setPicker({ replace: i })}>
                    <RefreshCw size={16} />
                  </button>
                  <button
                    className="icon-btn sm danger"
                    aria-label={'Удалить: ' + e.exerciseName}
                    onClick={() => patchDay({ ...day, exercises: day.exercises.filter((_, j) => j !== i) })}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                {info ? (
                  <p className="muted small b-note">{info.note}</p>
                ) : (
                  <label className="field">
                    <span>Мышцы (для подсчёта объёма)</span>
                    <select
                      multiple
                      className="muscle-select"
                      value={e.muscles || []}
                      onChange={(ev) => patchExercise(i, { muscles: Array.from(ev.target.selectedOptions, (o) => o.value) })}
                    >
                      {Object.entries(muscleNames).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="rx">
                  {(
                    [
                      ['sets', 'Подходы', 1, 10],
                      ['repMin', 'Повт. от', 1, 100],
                      ['repMax', 'Повт. до', 1, 100],
                      ['targetRir', 'RIR', 0, 6],
                    ] as const
                  ).map(([k, label, min, max]) => (
                    <label key={k}>
                      <span>{label}</span>
                      <input
                        className="num"
                        type="number"
                        inputMode="numeric"
                        min={min}
                        max={max}
                        value={e[k]}
                        onChange={(ev) => {
                          const n = Math.round(Number(ev.target.value));
                          if (Number.isFinite(n)) patchExercise(i, { [k]: Math.max(min, Math.min(max, n)) });
                        }}
                      />
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <button className="btn btn-block" onClick={() => setPicker({ replace: null })}>
          <Plus size={18} /> Добавить упражнение
        </button>
      </div>

      <section className="block">
        <h4>Объём за цикл ({days.length} {days.length === 1 ? 'тренировка' : days.length < 5 ? 'тренировки' : 'тренировок'})</h4>
        <p className="muted small">Если цикл проходится за неделю — это недельный объём. Косвенное участие считается как 0,5 подхода. Ориентир для роста — 10–20.</p>
        <div className="chips">
          {Object.entries(cycle)
            .sort((a, b) => b[1].total - a[1].total)
            .map(([m, v]) => (
              <span key={m} className={'chip ' + (v.total < 6 ? 'chip-muted' : v.total <= 20 ? 'chip-good' : 'chip-warn')}>
                {muscleNames[m]} {fmtKg(v.total)}
              </span>
            ))}
        </div>
      </section>

      {warnings.length > 0 && (
        <div className="warn-list">
          {warnings.map((w) => (
            <p key={w} className="tone-warn small">
              ⚠ {w}
            </p>
          ))}
          <p className="muted small">Это подсказки — сохранить программу можно.</p>
        </div>
      )}
      {issue && <p className="tone-bad small">{issue}</p>}

      <div className="sticky-foot">
        <button className="btn btn-primary btn-block" disabled={saving || !!issue} onClick={save}>
          {saving ? 'Сохраняем…' : editing ? 'Сохранить изменения' : 'Назначить клиенту'}
        </button>
      </div>

      {picker && (
        <ExercisePicker
          exercises={exercises}
          exclude={day.exercises.filter((_, i) => i !== picker.replace).map((e) => e.exerciseId)}
          title={picker.replace === null ? 'Добавить упражнение' : 'Заменить упражнение'}
          allowCreate
          onCreated={onExerciseCreated}
          onPick={pick}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

export function ExercisePicker({
  exercises,
  exclude,
  title,
  initialGroup = '',
  autoFocusSearch = true,
  allowCreate = false,
  onCreated,
  onPick,
  onClose,
}: {
  exercises: Exercise[];
  exclude: string[];
  title: string;
  /** Muscle group to show first, e.g. the group of the exercise being replaced. */
  initialGroup?: string;
  autoFocusSearch?: boolean;
  /** Trainer only: offer to create an exercise that is not in the list. */
  allowCreate?: boolean;
  onCreated?: (e: Exercise) => void;
  onPick: (e: Exercise) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState(initialGroup);
  const [creating, setCreating] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  // Show the preselected muscle group chip, which may sit far right in the row.
  useEffect(() => {
    filtersRef.current?.querySelector('.filter.on')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, []);
  const groups = Array.from(new Set(exercises.map((e) => e.muscleGroup.split(' / ')[0])));
  const list = exercises.filter(
    (e) =>
      !exclude.includes(e.id) &&
      (!group || e.muscleGroup.startsWith(group)) &&
      searchKey(e.name + ' ' + e.muscleGroup + ' ' + e.equipment).includes(searchKey(q.trim())),
  );
  if (creating)
    return (
      <AddExercise
        initialName={q.trim()}
        initialGroup={group}
        onClose={() => setCreating(false)}
        onCreated={(e) => {
          onCreated?.(e);
          onPick(e);
        }}
      />
    );
  return (
    <Sheet title={title} onClose={onClose}>
      <label className="search">
        <Search size={16} />
        <input id="picker-search" autoFocus={autoFocusSearch} placeholder="Поиск" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="filters" ref={filtersRef}>
        <button className={'filter' + (!group ? ' on' : '')} onClick={() => setGroup('')}>
          Все
        </button>
        {groups.map((g) => (
          <button key={g} className={'filter' + (group === g ? ' on' : '')} onClick={() => setGroup(g)}>
            {g}
          </button>
        ))}
      </div>
      <div className="pick-list">
        {list.map((e) => (
          <button key={e.id} className="pick" onClick={() => onPick(e)}>
            <span className="grow">
              <strong>{e.name}</strong>
              <span className="muted small">
                {e.muscleGroup} · {e.equipment}
                {exerciseRules[e.id] ? ' · ' + exerciseRules[e.id].position : ''}
              </span>
            </span>
            <Plus size={18} />
          </button>
        ))}
        {!list.length && <p className="muted small center-text">Ничего не найдено.</p>}
        {allowCreate && (
          <button className="btn btn-block create-ex" onClick={() => setCreating(true)}>
            <Plus size={16} /> {q.trim() ? `Создать своё упражнение «${q.trim()}»` : 'Создать своё упражнение'}
          </button>
        )}
      </div>
    </Sheet>
  );
}
