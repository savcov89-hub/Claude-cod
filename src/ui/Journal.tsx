import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowLeftRight, Check, ChevronDown, Minus, Plus, Undo2 } from 'lucide-react';
import { api, isLocal, readError, safeStorage } from '../transport';
import { fmtKg, suggestNext, weightUnit, type Suggestion } from '../analytics';
import { localDate } from '../clock';
import type { Exercise, SessionExercise, SetEntry, WorkoutExercise, WorkoutPayload } from '../types';
import { Confirm, clock, fmtDate, fmtSets, useNow } from './common';
import { catalog } from '../catalog';
import { ExercisePicker } from './ProgramBuilder';

let exerciseList: Promise<Exercise[]> | null = null;
const loadExercises = () =>
  (exerciseList ||= api.get('/api/exercises').then(
    (r) => r.data.exercises as Exercise[],
    (err) => {
      exerciseList = null;
      throw err;
    },
  ));
interface Previous {
  previousSets: SetEntry[];
  previousAt: string | null;
}

export interface JournalSource {
  trainerId: string;
  programId: string;
  dayId: string;
}
export interface JournalActivity {
  done: number;
  total: number;
  lastSetAt: number | null;
  /** Exercise with the next set to do, e.g. "Жим ногами 2/3". */
  current: string | null;
}
export type JournalFinisher = () => Promise<boolean>;

/** Loads a workout and renders the set log. */
export function Journal({
  source,
  onBack,
  onCompleted,
  onActivity,
  onDayChange,
  onRegisterFinish,
  embedded = false,
}: {
  onRegisterFinish?: (f: JournalFinisher | null) => void;
  source: JournalSource;
  onBack?: () => void;
  onCompleted: (summary: { sets: number }) => void;
  onActivity?: (a: JournalActivity) => void;
  onDayChange?: (dayId: string) => void;
  embedded?: boolean;
}) {
  const [payload, setPayload] = useState<WorkoutPayload | null>(null);
  const [errorText, setErrorText] = useState('');
  const [nonce, setNonce] = useState(0);
  const key = source.trainerId + '/' + source.programId + '/' + source.dayId;
  useEffect(() => {
    let alive = true;
    setPayload(null);
    setErrorText('');
    api
      .get('/api/workout/' + key)
      .then((r) => alive && setPayload(r.data))
      .catch((err) => alive && setErrorText(readError(err)));
    return () => {
      alive = false;
    };
  }, [key, nonce]);
  if (errorText)
    return (
      <div className="journal">
        <div className="alert">{errorText}</div>
        <button className="btn" onClick={() => setNonce((n) => n + 1)}>
          Повторить
        </button>
      </div>
    );
  if (!payload) return <div className="loader-block"><span className="loader" /></div>;
  return (
    <JournalBody
      key={key + ':' + nonce}
      workout={payload}
      embedded={embedded}
      onBack={onBack}
      onCompleted={onCompleted}
      onActivity={onActivity}
      onDayChange={onDayChange}
      onRegisterFinish={onRegisterFinish}
      onReload={() => setNonce((n) => n + 1)}
    />
  );
}

const cacheKeyOf = (w: WorkoutPayload) =>
  'tl-draft:' + (isLocal() ? 'local:' : '') + w.ownerId + ':' + (w.actorRole || 'client') + ':' + w.programId + ':' + w.day.id;
const legacyKeyOf = (w: WorkoutPayload) =>
  'training-draft-' + (isLocal() ? 'demo-' : '') + w.ownerId + '-' + (w.actorRole || 'client') + '-' + w.programId + '-' + w.day.id;

interface Cache {
  results: SessionExercise[];
  pending: boolean;
  baseRevision: string | null;
  feedback: string;
}
function readCache(w: WorkoutPayload): Cache | null {
  try {
    const raw = safeStorage.get(cacheKeyOf(w)) || safeStorage.get(legacyKeyOf(w));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function JournalBody({
  workout,
  embedded,
  onBack,
  onCompleted,
  onActivity,
  onDayChange,
  onRegisterFinish,
  onReload,
}: {
  onRegisterFinish?: (f: JournalFinisher | null) => void;
  workout: WorkoutPayload;
  embedded: boolean;
  onBack?: () => void;
  onCompleted: (summary: { sets: number }) => void;
  onActivity?: (a: JournalActivity) => void;
  onDayChange?: (dayId: string) => void;
  onReload: () => void;
}) {
  const cacheKey = cacheKeyOf(workout);
  const suggestions = useMemo<Suggestion[]>(
    () => workout.day.exercises.map((e) => suggestNext(e, e.previousSets)),
    [workout],
  );
  const initialCache = useMemo(() => readCache(workout), [workout]);
  // Saved entries are reused only when they match the current plan exercise-for-exercise.
  const matchesPlan = (list?: SessionExercise[]) =>
    !!list &&
    list.length === workout.day.exercises.length &&
    list.every((e, i) => (e.replaces || e.exerciseId) === workout.day.exercises[i].exerciseId);
  const cacheUsable =
    !!initialCache?.pending &&
    (initialCache.baseRevision || null) === (workout.revision || null) &&
    matchesPlan(initialCache.results);
  const [results, setResults] = useState<SessionExercise[]>(() => {
    if (cacheUsable) return initialCache!.results;
    if (matchesPlan(workout.draft?.exercises)) return workout.draft!.exercises;
    return workout.day.exercises.map((e, i) => ({
      exerciseId: e.exerciseId,
      exerciseName: e.exerciseName,
      sets: Array.from({ length: e.sets }, (_, si) => ({
        weight: suggestions[i].weight || e.previousSets[si]?.weight || e.previousSets.at(-1)?.weight || 0,
        reps: 0,
        rir: null,
      })),
    }));
  });
  const [feedback, setFeedback] = useState(() => (cacheUsable ? initialCache!.feedback || '' : workout.draft?.feedback || ''));
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(workout.draft ? 'saved' : 'idle');
  const [errorText, setErrorText] = useState('');
  const [conflict, setConflict] = useState(
    () => !!initialCache?.pending && (initialCache.baseRevision || null) !== (workout.revision || null),
  );
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [showNote, setShowNote] = useState(!!feedback);
  const [lastSetAt, setLastSetAt] = useState<number | null>(() =>
    workout.draft ? new Date(workout.draft.updatedAt).getTime() : null,
  );
  const draftDone = (workout.draft?.exercises || []).reduce((n, e) => n + e.sets.filter((x) => x.reps > 0).length, 0);
  const [stale, setStale] = useState(
    () => !!workout.draft && draftDone > 0 && Date.now() - new Date(workout.draft.updatedAt).getTime() > 8 * 3600000,
  );
  const [nudge, setNudge] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [showRir, setShowRir] = useState(() => safeStorage.get('tl-show-rir') === '1');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  // A finished exercise stays open while its numbers are being typed, so the field is not unmounted mid-entry.
  const [editing, setEditing] = useState<number | null>(null);
  const editTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startEditing = (ei: number) => {
    if (editTimer.current) clearTimeout(editTimer.current);
    setEditing(ei);
  };
  const stopEditing = () => {
    if (editTimer.current) clearTimeout(editTimer.current);
    editTimer.current = setTimeout(() => setEditing(null), 400);
  };
  // True when ✓ is pressed while a number in the same row is being typed.
  const confirmTap = useRef(false);
  const toggleExpanded = (i: number) =>
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  // Previous results of exercises swapped in for this workout, keyed by exercise id.
  const [swapInfo, setSwapInfo] = useState<Record<string, Previous>>({});
  const [swapping, setSwapping] = useState<{ ei: number; list: Exercise[] } | null>(null);
  const plan = useMemo<WorkoutExercise[]>(
    () =>
      workout.day.exercises.map((p, i) => {
        const r = results[i];
        if (!r?.replaces || r.exerciseId === p.exerciseId) return p;
        const info = swapInfo[r.exerciseId];
        return {
          ...p,
          exerciseId: r.exerciseId,
          exerciseName: r.exerciseName,
          previousSets: info?.previousSets || [],
          previousAt: info?.previousAt || null,
        };
      }),
    [workout, results, swapInfo],
  );
  const planSuggestions = useMemo(() => plan.map((e) => suggestNext(e, e.previousSets)), [plan]);
  const fetchPrevious = (exerciseId: string) =>
    api
      .get('/api/previous/' + workout.trainerId + '/' + workout.programId + '/' + encodeURIComponent(exerciseId))
      .then((r) => r.data as Previous);
  // A restored draft may contain swaps whose previous results are not loaded yet.
  useEffect(() => {
    for (const r of results)
      if (r.replaces && !swapInfo[r.exerciseId])
        fetchPrevious(r.exerciseId)
          .then((info) => setSwapInfo((cur) => ({ ...cur, [r.exerciseId]: info })))
          .catch(() => setSwapInfo((cur) => ({ ...cur, [r.exerciseId]: { previousSets: [], previousAt: null } })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results.map((r) => r.exerciseId).join(',')]);

  const latest = useRef(results);
  const feedbackRef = useRef(feedback);
  const baseRevision = useRef<string | null>(workout.revision || null);
  const pending = useRef(cacheUsable);
  const completed = useRef(false);
  const conflictRef = useRef(conflict);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const writeCache = (isPending: boolean) =>
    safeStorage.set(
      cacheKey,
      JSON.stringify({ results: latest.current, pending: isPending, baseRevision: baseRevision.current, feedback: feedbackRef.current }),
    );

  const body = (exercises: SessionExercise[], fb: string, at?: string) => ({
    trainerId: workout.trainerId,
    programId: workout.programId,
    dayId: workout.day.id,
    baseRevision: baseRevision.current,
    feedback: fb,
    exercises,
    localDate: localDate(at ? new Date(at) : new Date()),
    ...(at ? { completedAt: at } : {}),
  });

  const persist = useCallback((): Promise<void> => {
    if (conflictRef.current) return Promise.reject(new Error('conflict'));
    if (!pending.current || completed.current) return queue.current;
    const snapshot = latest.current;
    const fb = feedbackRef.current;
    const task = queue.current
      .catch(() => undefined)
      .then(async () => {
        setStatus('saving');
        try {
          const saved = await api.post('/api/draft', body(snapshot, fb));
          baseRevision.current = saved.data.revision;
          const settled = snapshot === latest.current && fb === feedbackRef.current;
          if (settled) pending.current = false;
          writeCache(!settled);
          setStatus(settled ? 'saved' : 'saving');
          setErrorText('');
        } catch (err: any) {
          const msg = readError(err);
          if (err?.response?.status === 409 || /обнов/i.test(msg)) {
            conflictRef.current = true;
            setConflict(true);
          }
          setStatus('error');
          setErrorText(msg);
          throw err;
        }
      });
    queue.current = task;
    return task;
    // body() reads refs only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const schedule = () => {
    pending.current = true;
    if (!writeCache(true)) setErrorText('Браузер не сохраняет резервную копию. Дождитесь «Сохранено» перед выходом.');
    setStatus('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void persist().catch(() => undefined), 700);
  };

  useEffect(() => {
    if (pending.current) void persist().catch(() => undefined);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (pending.current && !completed.current) void persist().catch(() => undefined);
    };
  }, [persist]);

  const countDone = (list: SessionExercise[]) => list.reduce((n, e) => n + e.sets.filter((s) => s.reps > 0).length, 0);
  const done = countDone(results);
  const total = results.reduce((n, e) => n + e.sets.length, 0);
  const currentIdx = results.findIndex((e) => e.sets.some((x) => x.reps === 0));
  const current =
    currentIdx < 0
      ? null
      : results[currentIdx].sets.filter((x) => x.reps > 0).length +
        1 +
        '/' +
        results[currentIdx].sets.length +
        ' ' +
        plan[currentIdx].exerciseName;
  useEffect(() => {
    onActivity?.({ done, total, lastSetAt, current });
  }, [done, total, lastSetAt, current, onActivity]);

  const isBodyweight = (ei: number) => {
    const id = plan[ei].exerciseId;
    const known = catalog.find((c) => c.id === id);
    return known ? known.equipment === 'Собственный вес' : !plan[ei].previousSets.some((x) => x.weight > 0);
  };

  const update = (next: SessionExercise[]) => {
    latest.current = next;
    setResults(next);
    schedule();
  };
  const patchSet = (ei: number, si: number, patch: Partial<SetEntry>) => {
    const wasDone = latest.current[ei].sets[si].reps > 0;
    const next = latest.current.map((e, i) =>
      i === ei
        ? {
            ...e,
            sets: e.sets.map((s, j) => {
              if (j === si) return { ...s, ...patch };
              // A new weight carries over to every following set not done yet.
              if (patch.weight !== undefined && j > si && s.reps === 0) return { ...s, weight: patch.weight };
              return s;
            }),
          }
        : e,
    );
    if (!wasDone && next[ei].sets[si].reps > 0) setLastSetAt(Date.now());
    update(next);
  };
  const toggleDone = (ei: number, si: number, confirm = false) => {
    const set = latest.current[ei].sets[si];
    if (set.reps > 0) {
      // ✓ right after typing the reps confirms them instead of clearing the set.
      if (confirm) {
        (document.activeElement as HTMLElement | null)?.blur();
        return;
      }
      return patchSet(ei, si, { reps: 0 });
    }
    const sug = planSuggestions[ei];
    const reps = sug.reps[si] ?? sug.reps.at(-1) ?? plan[ei].repMin;
    const weight = set.weight || sug.weight || 0;
    if (!weight && !isBodyweight(ei)) {
      // No weight yet (first workout): ask for it instead of saving 0 kg.
      setNudge(ei + '-' + si);
      const input = rootRef.current?.querySelector('[data-w="' + ei + '-' + si + '"]') as HTMLInputElement | null;
      input?.focus();
      return;
    }
    setNudge(null);
    patchSet(ei, si, { reps, weight });
  };
  const addSet = (ei: number) => {
    const e = latest.current[ei];
    if (e.sets.length >= 10) return;
    const last = e.sets[e.sets.length - 1];
    update(latest.current.map((x, i) => (i === ei ? { ...x, sets: [...x.sets, { weight: last?.weight || 0, reps: 0, rir: null }] } : x)));
  };
  const removeSet = (ei: number) => {
    const e = latest.current[ei];
    if (e.sets.length <= 1) return;
    update(latest.current.map((x, i) => (i === ei ? { ...x, sets: x.sets.slice(0, -1) } : x)));
  };

  /** Puts `next` in place of the planned exercise at `ei` for this workout only; `null` restores the plan. */
  const swapExercise = async (ei: number, next: Exercise | null) => {
    setSwapping(null);
    const planned = workout.day.exercises[ei];
    const id = next ? next.id : planned.exerciseId;
    let info: Previous = { previousSets: planned.previousSets, previousAt: planned.previousAt || null };
    if (next) {
      try {
        info = swapInfo[id] || (await fetchPrevious(id));
      } catch {
        info = { previousSets: [], previousAt: null };
      }
      setSwapInfo((cur) => ({ ...cur, [id]: info }));
    }
    const sug = suggestNext({ ...planned, exerciseId: id }, info.previousSets);
    const entry: SessionExercise = {
      exerciseId: id,
      exerciseName: next ? next.name : planned.exerciseName,
      ...(next ? { replaces: planned.exerciseId } : {}),
      sets: Array.from({ length: latest.current[ei].sets.length }, (_, si) => ({
        weight: sug.weight || info.previousSets[si]?.weight || info.previousSets.at(-1)?.weight || 0,
        reps: 0,
        rir: null,
      })),
    };
    update(latest.current.map((x, i) => (i === ei ? entry : x)));
  };
  const openSwap = async (ei: number) => {
    try {
      setSwapping({ ei, list: await loadExercises() });
    } catch (err) {
      setErrorText(readError(err));
    }
  };

  const finish = async (at?: string): Promise<boolean> => {
    setConfirmFinish(false);
    const performed = countDone(latest.current);
    if (!performed || completed.current) {
      if (!performed) setErrorText('Нет выполненных подходов. Отметьте хотя бы один подход.');
      return false;
    }
    setFinishing(true);
    if (timer.current) clearTimeout(timer.current);
    try {
      pending.current = true;
      await persist();
      await api.post('/api/sessions', body(latest.current, feedbackRef.current, at));
      completed.current = true;
      safeStorage.remove(cacheKey);
      onCompleted({ sets: performed });
      return true;
    } catch (err) {
      setErrorText(readError(err));
      return false;
    } finally {
      setFinishing(false);
    }
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => {
    if (!onRegisterFinish) return;
    onRegisterFinish(() => finishRef.current());
    return () => onRegisterFinish(null);
  }, [onRegisterFinish]);

  const startOver = () => {
    setStale(false);
    const fresh = plan.map((e, i) => ({
      exerciseId: e.exerciseId,
      exerciseName: e.exerciseName,
      ...(latest.current[i]?.replaces ? { replaces: latest.current[i].replaces } : {}),
      sets: Array.from({ length: e.sets }, (_, si) => ({
        weight: planSuggestions[i].weight || e.previousSets[si]?.weight || 0,
        reps: 0,
        rir: null,
      })),
    }));
    setLastSetAt(null);
    update(fresh);
  };

  const discardLocal = () => {
    safeStorage.remove(cacheKey);
    safeStorage.remove(legacyKeyOf(workout));
    pending.current = false;
    completed.current = true;
    onReload();
  };

  const days = workout.days || [];
  const shortHint = (sug: Suggestion) =>
    sug.kind === 'increase'
      ? sug.weight > 0
        ? '▲ ' + fmtKg(sug.weight)
        : '▲ сложнее'
      : sug.kind === 'decrease'
        ? '▼ ' + fmtKg(sug.weight)
        : sug.kind === 'first'
          ? 'подобрать вес'
          : '+1 повт';

  return (
    <div className={'journal' + (embedded ? ' embedded' : '')} ref={rootRef}>
      <div className="j-head">
        {onBack && (
          <button className="icon-btn sm" aria-label="Назад" onClick={onBack}>
            <ArrowLeft size={18} />
          </button>
        )}
        <div className="j-title">
          {days.length > 1 && onDayChange ? (
            <label className="day-select">
              <select aria-label="Тренировка" value={workout.day.id} onChange={(e) => onDayChange(e.target.value)}>
                {days.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                    {d.id === workout.nextDayId ? ' · по плану' : ''}
                  </option>
                ))}
              </select>
              <ChevronDown size={15} />
            </label>
          ) : (
            <strong>{workout.day.name}</strong>
          )}
          <span className="muted small">
            {!embedded && workout.ownerName ? workout.ownerName + ' · ' : ''}
            {workout.programName}
          </span>
        </div>
        <button
          className={'rir-toggle' + (showRir ? ' on' : '')}
          onClick={() => {
            setShowRir(!showRir);
            safeStorage.set('tl-show-rir', showRir ? '0' : '1');
          }}
          aria-pressed={showRir}
          title="Показать столбец RIR (запас повторов)"
        >
          RIR
        </button>
        <div className="j-meta">
          <strong className="num">
            {done}/{total}
          </strong>
          <SaveState status={status} lastSetAt={done > 0 && done < total ? lastSetAt : null} />
        </div>
      </div>
      <div className="meter" aria-hidden="true">
        <i style={{ width: (done / Math.max(1, total)) * 100 + '%' }} />
      </div>

      {stale && !conflict && (
        <div className="stale">
          <span>
            Тренировка от {fmtDate(workout.draft!.updatedAt)} не завершена: {draftDone} подх. Записать её в историю?
          </span>
          <div className="row gap">
            <button className="btn btn-sm" disabled={finishing} onClick={startOver}>
              Начать заново
            </button>
            <button
              className="btn btn-sm btn-primary"
              disabled={finishing}
              onClick={async () => {
                if (await finish(workout.draft!.updatedAt)) setStale(false);
              }}
            >
              Записать
            </button>
          </div>
        </div>
      )}
      {conflict && (
        <div className="alert">
          Журнал изменили на другом устройстве. Чтобы продолжить, загрузите актуальную запись.
          {confirmDiscard ? (
            <Confirm
              text="Изменения этого устройства, которые не успели сохраниться, будут удалены."
              confirmLabel="Загрузить"
              onConfirm={discardLocal}
              onCancel={() => setConfirmDiscard(false)}
            />
          ) : (
            <button className="btn btn-sm" onClick={() => setConfirmDiscard(true)}>
              Загрузить актуальную запись
            </button>
          )}
        </div>
      )}
      {errorText && !conflict && (
        <div className="alert">
          {errorText}
          {status === 'error' && (
            <button className="btn btn-sm" onClick={() => void persist().catch(() => undefined)}>
              Повторить сохранение
            </button>
          )}
        </div>
      )}

      <fieldset className={'exercise-list' + (showRir ? ' with-rir' : '')} disabled={finishing || conflict}>
        {plan.map((e, ei) => {
          const sug = planSuggestions[ei];
          const original = results[ei]?.replaces ? workout.day.exercises[ei] : null;
          const r = results[ei];
          const exDone = r.sets.filter((s) => s.reps > 0).length;
          const complete = exDone === r.sets.length;
          if (complete && !expanded.has(ei) && editing !== ei)
            return (
              <button key={e.exerciseId} className="ex ex-collapsed" onClick={() => toggleExpanded(ei)}>
                <span className="ex-num num">
                  <Check size={13} strokeWidth={3} />
                </span>
                <span className="ex-c-name">{e.exerciseName}</span>
                <span className="ex-c-sets num">{fmtSets(r.sets)}</span>
              </button>
            );
          return (
            <section
              className={'ex' + (complete ? ' ex-done' : '')}
              key={e.exerciseId}
              onFocus={(ev) => ev.target instanceof HTMLInputElement && startEditing(ei)}
              onBlur={(ev) => ev.target instanceof HTMLInputElement && stopEditing()}
            >
              <header className="ex-head" onClick={complete ? () => toggleExpanded(ei) : undefined}>
                <span className="ex-num num">{ei + 1}</span>
                <div className="ex-name">
                  <h3>{e.exerciseName}</h3>
                  <span className="ex-plan">
                    {e.sets}×{e.repMin}–{e.repMax} · RIR {e.targetRir}
                    {e.previousAt ? ' · прошл. ' + fmtDate(e.previousAt) : ''}
                  </span>
                  {original && (
                    <span className="ex-swapped">
                      вместо «{original.exerciseName}»
                      {exDone === 0 && (
                        <button className="link-btn" onClick={() => void swapExercise(ei, null)}>
                          <Undo2 size={13} /> вернуть
                        </button>
                      )}
                    </span>
                  )}
                </div>
                <span className={'hint hint-' + sug.kind} title={sug.text}>
                  {shortHint(sug)}
                </span>
                {exDone === 0 && (
                  <button
                    className="icon-btn sm swap-btn"
                    aria-label={'Заменить упражнение: ' + e.exerciseName}
                    title="Заменить только в этой тренировке"
                    onClick={() => void openSwap(ei)}
                  >
                    <ArrowLeftRight size={16} />
                  </button>
                )}
              </header>
              <div className="sets" role="table" aria-label={'Подходы: ' + e.exerciseName}>
                <div className="set-row set-labels" role="row">
                  <span>#</span>
                  <span>было</span>
                  <span>{weightUnit(e.exerciseId)}</span>
                  <span>повт</span>
                  {showRir && <span>RIR</span>}
                  <span className="set-tools">
                    <button aria-label="Добавить подход" onClick={() => addSet(ei)} disabled={r.sets.length >= 10}>
                      <Plus size={13} />
                    </button>
                    <button aria-label="Убрать подход" onClick={() => removeSet(ei)} disabled={r.sets.length <= 1}>
                      <Minus size={13} />
                    </button>
                  </span>
                </div>
                {r.sets.map((s, si) => {
                  const target = sug.reps[si] ?? sug.reps.at(-1) ?? e.repMin;
                  const prev = e.previousSets[si];
                  return (
                    <div className={'set-row' + (s.reps > 0 ? ' is-done' : '')} role="row" key={si}>
                      <span className="set-n num">{si + 1}</span>
                      <span className="set-prev num">{prev ? fmtKg(prev.weight) + '×' + prev.reps : '—'}</span>
                      <NumberInput
                        decimal
                        dataW={ei + '-' + si}
                        nudge={nudge === ei + '-' + si}
                        label={e.exerciseName + ', подход ' + (si + 1) + ', вес'}
                        value={s.weight}
                        showZero={isBodyweight(ei)}
                        placeholder={weightUnit(e.exerciseId)}
                        onChange={(v) => {
                          if (nudge) setNudge(null);
                          patchSet(ei, si, { weight: v ?? 0 });
                        }}
                      />
                      <NumberInput
                        label={e.exerciseName + ', подход ' + (si + 1) + ', повторы'}
                        value={s.reps || null}
                        placeholder={String(target)}
                        onChange={(v) => patchSet(ei, si, { reps: v ?? 0 })}
                      />
                      {showRir && (
                        <NumberInput
                          small
                          label={e.exerciseName + ', подход ' + (si + 1) + ', запас повторов'}
                          value={s.rir}
                          placeholder={String(e.targetRir)}
                          onChange={(v) => patchSet(ei, si, { rir: v })}
                        />
                      )}
                      <button
                        className={'tick' + (s.reps > 0 ? ' on' : '')}
                        aria-label={s.reps > 0 ? 'Снять отметку подхода' : 'Подход выполнен: ' + fmtKg(s.weight || sug.weight) + ' × ' + target}
                        onPointerDown={(ev) => {
                          const row = ev.currentTarget.closest('.set-row');
                          confirmTap.current = !!row && row.contains(document.activeElement) && document.activeElement !== ev.currentTarget;
                        }}
                        onClick={() => {
                          toggleDone(ei, si, confirmTap.current);
                          confirmTap.current = false;
                        }}
                      >
                        <Check size={18} strokeWidth={3} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}

        {showNote ? (
          <label className="field">
            <span>Комментарий к тренировке</span>
            <textarea
              id={'note-' + workout.programId + '-' + workout.day.id}
              rows={2}
              maxLength={500}
              placeholder="Самочувствие, что было тяжело, что обсудить"
              value={feedback}
              onChange={(ev) => {
                setFeedback(ev.target.value);
                feedbackRef.current = ev.target.value;
                schedule();
              }}
            />
          </label>
        ) : (
          <button className="link-btn" onClick={() => setShowNote(true)}>
            <Plus size={14} /> комментарий
          </button>
        )}
      </fieldset>

      {swapping && (
        <ExercisePicker
          title={'Замена: ' + plan[swapping.ei].exerciseName}
          exercises={swapping.list}
          exclude={[...workout.day.exercises.map((x) => x.exerciseId), ...plan.map((x) => x.exerciseId)]}
          initialGroup={
            (swapping.list.find((x) => x.id === workout.day.exercises[swapping.ei].exerciseId)?.muscleGroup || '').split(' / ')[0]
          }
          autoFocusSearch={false}
          allowCreate={workout.actorRole === 'trainer'}
          onCreated={() => {
            exerciseList = null;
          }}
          onPick={(x) => void swapExercise(swapping.ei, x)}
          onClose={() => setSwapping(null)}
        />
      )}

      <div className="j-foot">
        {confirmFinish ? (
          <Confirm
            text={
              done < total
                ? `Выполнено ${done} из ${total} подходов. Пустые подходы не попадут в историю, дальше откроется следующая тренировка программы.`
                : `Все ${total} подходов выполнены. Записать тренировку в историю?`
            }
            confirmLabel="Завершить"
            onConfirm={() => void finish()}
            onCancel={() => setConfirmFinish(false)}
            busy={finishing}
          />
        ) : (
          <>
            <button
              className={'btn btn-block ' + (done === total && total > 0 ? 'btn-primary' : '')}
              disabled={finishing || conflict || !done}
              onClick={() => setConfirmFinish(true)}
            >
              <Check size={16} /> {finishing ? 'Сохраняем…' : 'Завершить тренировку'}
            </button>
            <p className="muted small center-text">
              Каждый подход сохраняется сразу — переключайтесь между клиентами свободно. «Ушёл» тоже записывает тренировку в историю.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  label,
  decimal = false,
  small = false,
  showZero = false,
  placeholder = '—',
  dataW,
  nudge = false,
}: {
  dataW?: string;
  nudge?: boolean;
  value: number | null;
  onChange: (n: number | null) => void;
  label: string;
  decimal?: boolean;
  small?: boolean;
  showZero?: boolean;
  placeholder?: string;
}) {
  const show = (v: number | null) => (v === null || (v === 0 && !showZero) ? '' : String(v).replace('.', ','));
  const [textValue, setText] = useState(show(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(show(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      className={'num-input num' + (small ? ' small' : '') + (nudge ? ' nudge' : '')}
      data-w={dataW}
      aria-label={label}
      inputMode={decimal ? 'decimal' : 'numeric'}
      value={textValue}
      placeholder={placeholder}
      onFocus={(e) => {
        focused.current = true;
        e.target.select();
      }}
      onBlur={() => {
        focused.current = false;
        setText(show(value));
      }}
      onChange={(e) => {
        const raw = e.target.value.replace(',', '.');
        if (!(decimal ? /^\d{0,4}(\.\d{0,2})?$/ : /^\d{0,4}$/).test(raw)) return;
        setText(e.target.value);
        onChange(raw === '' ? null : Number(raw));
      }}
    />
  );
}

/** Save status, or time since the last set while the workout is in progress. */
function SaveState({ status, lastSetAt }: { status: 'idle' | 'saving' | 'saved' | 'error'; lastSetAt: number | null }) {
  const now = useNow(1000);
  return (
    <span className={'save-dot ' + status}>
      {status === 'error' ? 'не сохр.' : status === 'saving' ? 'сохр…' : lastSetAt ? clock(now - lastSetAt) : 'сохр.'}
    </span>
  );
}
