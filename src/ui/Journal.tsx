import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowLeftRight, ArrowUp, Check, ChevronDown, ListOrdered, Minus, MoreHorizontal, Pencil, Plus, SkipForward, Trash2, Undo2 } from 'lucide-react';
import { api, inGym, isLocal, readError, safeStorage } from '../transport';
import { equipmentOf, fmtKg, isStack, suggestNext, weightUnit, type Suggestion } from '../analytics';
import { localDate } from '../clock';
import { isNetworkError } from '../offline';
import type { Exercise, SessionExercise, SetEntry, WorkoutExercise, WorkoutPayload } from '../types';
import { Confirm, Sheet, clock, elapsed, fmtDate, fmtSets, useNow } from './common';
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
/** The program exercise an entry stands for (itself, or the one it replaces today). */
const slotOf = (e: SessionExercise) => e.replaces || e.exerciseId;
interface Previous {
  equipment?: string;
  previousSets: SetEntry[];
  previousAt: string | null;
  previousNote?: string;
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
/** Records the workout; `at` backdates it (e.g. to the last set of a workout left open). */
export type JournalFinisher = (at?: string) => Promise<boolean>;

/** Loads a workout and renders the set log. */
export function Journal({
  source,
  onBack,
  onCompleted,
  onActivity,
  onDayChange,
  onRegisterFinish,
  onProgramChanged,
  embedded = false,
}: {
  onRegisterFinish?: (f: JournalFinisher | null) => void;
  /** The trainer changed the day's exercises in the program from the journal. */
  onProgramChanged?: () => void;
  source: JournalSource;
  onBack?: () => void;
  onCompleted: (summary: { sets: number }) => void;
  onActivity?: (a: JournalActivity) => void;
  onDayChange?: (dayId: string) => void;
  embedded?: boolean;
}) {
  // Tagged with its request, so a switch of day never renders the new day with the old day's workout.
  const [payload, setPayload] = useState<{ key: string; data: WorkoutPayload } | null>(null);
  const [errorText, setErrorText] = useState('');
  const [nonce, setNonce] = useState(0);
  const key = source.trainerId + '/' + source.programId + '/' + source.dayId;
  useEffect(() => {
    let alive = true;
    setPayload(null);
    setErrorText('');
    api
      .get('/api/workout/' + key)
      .then((r) => alive && setPayload({ key: key + ':' + nonce, data: r.data }))
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
  if (payload?.key !== key + ':' + nonce) return <div className="loader-block"><span className="loader" /></div>;
  return (
    <JournalBody
      key={key + ':' + nonce}
      workout={payload.data}
      embedded={embedded}
      onBack={onBack}
      onCompleted={onCompleted}
      onActivity={onActivity}
      onDayChange={onDayChange}
      onRegisterFinish={onRegisterFinish}
      onProgramChanged={onProgramChanged}
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
  onProgramChanged,
  onReload,
}: {
  onRegisterFinish?: (f: JournalFinisher | null) => void;
  onProgramChanged?: () => void;
  workout: WorkoutPayload;
  embedded: boolean;
  onBack?: () => void;
  onCompleted: (summary: { sets: number }) => void;
  onActivity?: (a: JournalActivity) => void;
  onDayChange?: (dayId: string) => void;
  onReload: () => void;
}) {
  const cacheKey = cacheKeyOf(workout);
  // A workout finished offline waits in the outbox; until the server has it, its old draft is not reopened.
  const doneKey = 'tl-done:' + cacheKey;
  const finishedOffline = useMemo(() => {
    const at = Number(safeStorage.get(doneKey) || 0);
    if (!at) return false;
    if (!workout.draft || Date.parse(workout.draft.updatedAt) > at) {
      safeStorage.remove(doneKey);
      return false;
    }
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workout]);
  const draftOf = finishedOffline ? null : workout.draft;
  const suggestions = useMemo<Suggestion[]>(
    () => workout.day.exercises.map((e) => suggestNext(e, e.previousSets)),
    [workout],
  );
  const initialCache = useMemo(() => readCache(workout), [workout]);
  // Saved entries are reused only when they cover the current plan exercise-for-exercise (in any order).
  // Exercises added in the gym come on top of the plan.
  const matchesPlan = (list?: SessionExercise[]) => {
    if (!list) return false;
    const fromPlan = list.filter((e) => !e.extra);
    return (
      fromPlan.length === workout.day.exercises.length &&
      new Set(fromPlan.map(slotOf)).size === fromPlan.length &&
      fromPlan.every((e) => workout.day.exercises.some((p) => p.exerciseId === slotOf(e)))
    );
  };
  const cacheUsable =
    !!initialCache?.pending &&
    (initialCache.baseRevision || null) === (workout.revision || null) &&
    matchesPlan(initialCache.results);
  const [results, setResults] = useState<SessionExercise[]>(() => {
    if (cacheUsable) return initialCache!.results;
    if (matchesPlan(draftOf?.exercises)) return draftOf!.exercises;
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
  const [feedback, setFeedback] = useState(() => (cacheUsable ? initialCache!.feedback || '' : draftOf?.feedback || ''));
  const [status, setStatus] = useState<SaveStatus>(draftOf ? 'saved' : 'idle');
  const [errorText, setErrorText] = useState('');
  const [conflict, setConflict] = useState(
    () => !!initialCache?.pending && (initialCache.baseRevision || null) !== (workout.revision || null),
  );
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [showNote, setShowNote] = useState(!!feedback);
  const [lastSetAt, setLastSetAt] = useState<number | null>(() =>
    draftOf ? new Date(draftOf.updatedAt).getTime() : null,
  );
  const draftDone = (draftOf?.exercises || []).reduce((n, e) => n + e.sets.filter((x) => x.reps > 0).length, 0);
  const [stale, setStale] = useState(
    () => !!draftOf && draftDone > 0 && Date.now() - new Date(draftOf.updatedAt).getTime() > 8 * 3600000,
  );
  const [nudge, setNudge] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [showRir, setShowRir] = useState(() => safeStorage.get('tl-show-rir') === '1');
  // Open/edited exercises are keyed by plan slot, so they stay right when the order changes.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // A finished exercise stays open while its numbers are being typed, so the field is not unmounted mid-entry.
  const [editing, setEditing] = useState<string | null>(null);
  const editTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startEditing = (slot: string) => {
    if (editTimer.current) clearTimeout(editTimer.current);
    setEditing(slot);
  };
  const stopEditing = () => {
    if (editTimer.current) clearTimeout(editTimer.current);
    editTimer.current = setTimeout(() => setEditing(null), 400);
  };
  // True when ✓ is pressed while a number in the same row is being typed.
  const confirmTap = useRef(false);
  const toggleExpanded = (i: string) =>
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  // Previous results of exercises swapped in for this workout, keyed by exercise id.
  const [swapInfo, setSwapInfo] = useState<Record<string, Previous>>({});
  const [swapping, setSwapping] = useState<{ ei: number; list: Exercise[] } | null>(null);
  const [menu, setMenu] = useState<number | null>(null);
  const [ordering, setOrdering] = useState<SessionExercise[] | null>(null);
  const [programBusy, setProgramBusy] = useState(false);
  // Adding an exercise for today: pick it, then its sets and reps.
  const [adding, setAdding] = useState<{ list: Exercise[]; picked?: Exercise } | null>(null);
  const isFree = !!workout.day.id && workout.day.id === 'free';
  /** The trainer's additions join the program when the workout is finished. */
  const addsJoin = workout.actorRole === 'trainer' && !isFree;
  /** The trainer can change the program from the journal. */
  const canProgram = workout.actorRole === 'trainer' && !isFree;
  const since = inGym(workout.checkedInAt) ? new Date(workout.checkedInAt!).getTime() : null;
  // A replacement picked for a planned exercise: today only, or in the program for good.
  const [swapChoice, setSwapChoice] = useState<{ ei: number; ex: Exercise } | null>(null);
  // Sets / rep range being changed for the exercise at this index.
  const [targetsFor, setTargetsFor] = useState<number | null>(null);
  const [repeating, setRepeating] = useState(false);
  const [savingDay, setSavingDay] = useState(false);
  const [savedDay, setSavedDay] = useState('');
  // Exercise menu confirmations: replacing or restoring drops ticked sets; removal changes the program.
  const [menuConfirm, setMenuConfirm] = useState<MenuConfirm | null>(null);
  const closeMenu = () => {
    setMenu(null);
    setMenuConfirm(null);
  };
  const askRevert = (ei: number) => {
    setSwapping(null);
    if (latest.current[ei].sets.some((x) => x.reps > 0)) {
      setMenu(ei);
      setMenuConfirm('revert');
    } else void swapExercise(ei, null);
  };
  const plannedOf = (r: SessionExercise) => workout.day.exercises.find((p) => p.exerciseId === slotOf(r))!;
  // Entries follow the journal's own order, which may differ from the program for this workout.
  const plan = useMemo<WorkoutExercise[]>(
    () =>
      results.map((r) => {
        const info = swapInfo[r.exerciseId];
        if (r.extra)
          return {
            exerciseId: r.exerciseId,
            exerciseName: r.exerciseName,
            sets: r.sets.length,
            ...r.extra,
            equipment: info?.equipment,
            previousSets: info?.previousSets || [],
            previousAt: info?.previousAt || null,
            previousNote: info?.previousNote,
          };
        const p = plannedOf(r);
        if (!r.replaces || r.exerciseId === p.exerciseId) return p;
        return {
          ...p,
          exerciseId: r.exerciseId,
          exerciseName: r.exerciseName,
          equipment: info?.equipment,
          previousSets: info?.previousSets || [],
          previousAt: info?.previousAt || null,
          previousNote: info?.previousNote,
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
      if ((r.replaces || r.extra) && !swapInfo[r.exerciseId])
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
          if (isNetworkError(err)) {
            // Kept on the device (pending) and sent when the network is back.
            setStatus('offline');
            throw err;
          }
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
    const retry = () => pending.current && !completed.current && void persist().catch(() => undefined);
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [persist]);
  useEffect(() => {
    if (pending.current) void persist().catch(() => undefined);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (pending.current && !completed.current) void persist().catch(() => undefined);
    };
  }, [persist]);

  const countDone = (list: SessionExercise[]) => list.reduce((n, e) => n + e.sets.filter((s) => s.reps > 0).length, 0);
  const done = countDone(results);
  const joinNote = addsJoin && results.some((e) => e.extra && e.sets.some((s) => s.reps > 0)) ? ' Добавленные упражнения войдут в программу.' : '';
  // A skipped exercise only counts the sets already done.
  const total = results.reduce((n, e) => n + (e.skipped ? e.sets.filter((s) => s.reps > 0).length : e.sets.length), 0);
  const currentIdx = results.findIndex((e) => !e.skipped && e.sets.some((x) => x.reps === 0));
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
    const equipment = equipmentOf(plan[ei]);
    return equipment ? equipment === 'Собственный вес' : !plan[ei].previousSets.some((x) => x.weight > 0);
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
    closeMenu();
    const cur = latest.current[ei];
    if (cur.extra) {
      if (next) update(latest.current.map((x, i) => (i === ei ? null : x)).flatMap((x) => (x ? [x] : [])));
      if (next) await addExercise(next, { sets: cur.sets.length, ...cur.extra }, ei);
      return;
    }
    const planned = plannedOf(cur);
    const id = next ? next.id : planned.exerciseId;
    let info: Previous = { previousSets: planned.previousSets, previousAt: planned.previousAt || null };
    if (next) {
      try {
        info = swapInfo[id] || (await fetchPrevious(id));
      } catch {
        info = { previousSets: [], previousAt: null };
      }
      info = { ...info, equipment: next.equipment };
      setSwapInfo((cur) => ({ ...cur, [id]: info }));
    }
    const sug = suggestNext(
      next ? { ...planned, exerciseId: id, exerciseName: next.name, equipment: next.equipment } : planned,
      info.previousSets,
    );
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
    closeMenu();
    try {
      setSwapping({ ei, list: await loadExercises() });
    } catch (err) {
      setErrorText(readError(err));
    }
  };
  /** Adds `ex` for this workout only (at `at`, or at the end), with weights from its last result. */
  const addExercise = async (ex: Exercise, target: { sets: number; repMin: number; repMax: number; targetRir: number }, at?: number) => {
    setAdding(null);
    let info: Previous;
    try {
      info = swapInfo[ex.id] || (await fetchPrevious(ex.id));
    } catch {
      info = { previousSets: [], previousAt: null };
    }
    info = { ...info, equipment: ex.equipment };
    setSwapInfo((cur) => ({ ...cur, [ex.id]: info }));
    const { sets, ...extra } = target;
    const sug = suggestNext({ exerciseId: ex.id, exerciseName: ex.name, equipment: ex.equipment, sets, ...extra }, info.previousSets);
    const entry: SessionExercise = {
      exerciseId: ex.id,
      exerciseName: ex.name,
      extra,
      sets: Array.from({ length: sets }, (_, si) => ({
        weight: sug.weight || info.previousSets[si]?.weight || info.previousSets.at(-1)?.weight || 0,
        reps: 0,
        rir: null,
      })),
    };
    const list = [...latest.current];
    list.splice(at ?? list.length, 0, entry);
    update(list);
  };
  /** Free workout: the same exercises and targets as last time, weights from their last results. */
  const repeatLast = async () => {
    const list = (workout.lastFree || []).filter((x) => !latest.current.some((e) => e.exerciseId === x.exerciseId));
    setRepeating(true);
    try {
      const infos = await Promise.all(
        list.map((x) => (swapInfo[x.exerciseId] ? Promise.resolve(swapInfo[x.exerciseId]) : fetchPrevious(x.exerciseId).catch(() => ({ previousSets: [], previousAt: null }) as Previous))),
      );
      setSwapInfo((cur) => ({ ...cur, ...Object.fromEntries(list.map((x, i) => [x.exerciseId, infos[i]])) }));
      const entries = list.map((x, i): SessionExercise => {
        const info = infos[i];
        const { exerciseId, exerciseName, sets, ...extra } = x;
        const sug = suggestNext({ exerciseId, exerciseName, equipment: info.equipment, sets, ...extra }, info.previousSets);
        return {
          exerciseId,
          exerciseName,
          extra,
          sets: Array.from({ length: sets }, (_, si) => ({
            weight: sug.weight || info.previousSets[si]?.weight || info.previousSets.at(-1)?.weight || 0,
            reps: 0,
            rir: null,
          })),
        };
      });
      update([...latest.current, ...entries]);
    } finally {
      setRepeating(false);
    }
  };
  const removeExtra = (ei: number) => {
    closeMenu();
    update(latest.current.filter((_, i) => i !== ei));
  };
  const openAdd = async () => {
    try {
      setAdding({ list: await loadExercises() });
    } catch (err) {
      setErrorText(readError(err));
    }
  };
  const setSkipped = (ei: number, skipped: boolean) => {
    closeMenu();
    update(latest.current.map((x, i) => (i === ei ? { ...x, skipped } : x)));
  };
  const moveBy = (list: SessionExercise[], ei: number, step: -1 | 1) => {
    const to = ei + step;
    if (to < 0 || to >= list.length) return list;
    const next = [...list];
    [next[ei], next[to]] = [next[to], next[ei]];
    return next;
  };
  /** Trainer only: saves the day's exercises (order, or without removed ones) into the program, then reloads the journal. */
  const saveDayToProgram = async (entries: SessionExercise[], join: SessionExercise[] = []) => {
    setProgramBusy(true);
    try {
      if (timer.current) clearTimeout(timer.current);
      await persist();
      // Program exercises in the journal's order; an added one listed in `join` becomes part of the program.
      await api.post(`/api/programs/${workout.programId}/days/${workout.day.id}/exercises`, {
        exerciseIds: entries.filter((e) => !e.extra || join.includes(e)).map(slotOf),
        added: join.filter((e) => e.extra).map((e) => ({ exerciseId: e.exerciseId, sets: e.sets.length, ...e.extra })),
        order: entries.map((e) => e.exerciseId),
        baseRevision: baseRevision.current,
      });
      completed.current = true;
      safeStorage.remove(cacheKey);
      onProgramChanged?.();
      onReload();
    } catch (err) {
      setErrorText(readError(err));
    } finally {
      setProgramBusy(false);
    }
  };

  /** Trainer: one planned exercise changed in the program (targets, or another exercise for good), then the journal reloads. */
  const saveExerciseToProgram = async (slot: string, change: { replaceWith?: string } & Partial<Targets>) => {
    setProgramBusy(true);
    try {
      if (timer.current) clearTimeout(timer.current);
      await persist();
      await api.post(`/api/programs/${workout.programId}/days/${workout.day.id}/exercise`, {
        exerciseId: slot,
        ...change,
        baseRevision: baseRevision.current,
      });
      completed.current = true;
      safeStorage.remove(cacheKey);
      onProgramChanged?.();
      onReload();
      return true;
    } catch (err) {
      setErrorText(readError(err));
      return false;
    } finally {
      setProgramBusy(false);
    }
  };
  /** Today's sets follow a new set count: empty sets are added or dropped, done ones stay. */
  const resizeSets = (ei: number, count: number) => {
    const e = latest.current[ei];
    let sets = [...e.sets];
    while (sets.length < count) sets.push({ weight: sets.at(-1)?.weight || 0, reps: 0, rir: null });
    while (sets.length > count && sets.at(-1)!.reps === 0) sets = sets.slice(0, -1);
    return sets;
  };
  const applyTargets = async (ei: number, t: Targets) => {
    const e = latest.current[ei];
    const sets = resizeSets(ei, t.sets);
    if (e.extra) {
      const { sets: _n, ...extra } = t;
      update(latest.current.map((x, i) => (i === ei ? { ...x, sets, extra } : x)));
      setTargetsFor(null);
      return;
    }
    update(latest.current.map((x, i) => (i === ei ? { ...x, sets } : x)));
    if (await saveExerciseToProgram(slotOf(e), t)) setTargetsFor(null);
  };
  /** A replacement for good: swapped in today, then put in the program in place of the planned one. */
  const replaceInProgram = async (ei: number, ex: Exercise) => {
    const slot = slotOf(latest.current[ei]);
    if (latest.current[ei].exerciseId !== ex.id) await swapExercise(ei, ex);
    await saveExerciseToProgram(slot, { replaceWith: ex.id });
  };
  const setNote = (ei: number, note: string) =>
    update(latest.current.map((x, i) => (i === ei ? { ...x, note: note || undefined } : x)));

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
      // Offline the draft stays unsaved: the workout itself goes to the outbox with all its sets.
      await persist().catch((err) => {
        if (!isNetworkError(err)) throw err;
      });
      const r = await api.post('/api/sessions', body(latest.current, feedbackRef.current, at));
      completed.current = true;
      safeStorage.remove(cacheKey);
      if (r.data?.queued) safeStorage.set(doneKey, String(Date.now()));
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
    onRegisterFinish((at) => finishRef.current(at));
    return () => onRegisterFinish(null);
  }, [onRegisterFinish]);

  const startOver = () => {
    setStale(false);
    const fresh = plan.map((e, i) => ({
      exerciseId: e.exerciseId,
      exerciseName: e.exerciseName,
      ...(latest.current[i]?.replaces ? { replaces: latest.current[i].replaces } : {}),
      ...(latest.current[i]?.skipped ? { skipped: true } : {}),
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
        ? sug.weight > 0
          ? '▼ ' + fmtKg(sug.weight)
          : '▼ легче'
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
          <SaveState status={status} since={since} lastSetAt={done > 0 && done < total ? lastSetAt : null} />
        </div>
      </div>
      <div className="meter" aria-hidden="true">
        <i style={{ width: (done / Math.max(1, total)) * 100 + '%' }} />
      </div>

      {stale && !conflict && (
        <div className="stale">
          <span>
            Тренировка от {fmtDate(draftOf!.updatedAt)} не завершена: {draftDone} подх. Записать её в историю?
          </span>
          <div className="row gap">
            <button className="btn btn-sm" disabled={finishing} onClick={startOver}>
              Начать заново
            </button>
            <button
              className="btn btn-sm btn-primary"
              disabled={finishing}
              onClick={async () => {
                if (await finish(draftOf!.updatedAt)) setStale(false);
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
          const r = results[ei];
          const slot = slotOf(r);
          const original = r.replaces ? plannedOf(r) : null;
          const exDone = r.sets.filter((s) => s.reps > 0).length;
          const complete = exDone === r.sets.length;
          if (r.skipped)
            return (
              <button key={e.exerciseId} className="ex ex-collapsed ex-skipped" onClick={() => setSkipped(ei, false)}>
                <span className="ex-num num">
                  <SkipForward size={13} />
                </span>
                <span className="ex-c-name">{e.exerciseName}</span>
                <span className="ex-c-sets">
                  {exDone ? fmtSets(r.sets.filter((x) => x.reps > 0)) + ' · ' : ''}пропущено · <u>вернуть</u>
                </span>
              </button>
            );
          if (complete && !expanded.has(slot) && editing !== slot)
            return (
              <button key={e.exerciseId} className="ex ex-collapsed" onClick={() => toggleExpanded(slot)}>
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
              onFocus={(ev) => ev.target instanceof HTMLInputElement && startEditing(slot)}
              onBlur={(ev) => ev.target instanceof HTMLInputElement && stopEditing()}
            >
              <header className="ex-head" onClick={complete ? () => toggleExpanded(slot) : undefined}>
                <span className="ex-num num">{ei + 1}</span>
                <div className="ex-name">
                  <h3>{e.exerciseName}</h3>
                  <span className="ex-plan">
                    {e.sets}×{e.repMin}–{e.repMax} · RIR {e.targetRir}
                    {e.previousAt ? ' · прошл. ' + fmtDate(e.previousAt) : ''}
                    {r.extra && !isFree ? (addsJoin ? ' · войдёт в программу' : ' · добавлено сегодня') : ''}
                  </span>
                  {original && (
                    <span className="ex-swapped">
                      вместо «{original.exerciseName}»
                      <button className="link-btn" onClick={(ev) => { ev.stopPropagation(); askRevert(ei); }}>
                        <Undo2 size={13} /> вернуть
                      </button>
                    </span>
                  )}
                </div>
                <span className={'hint hint-' + sug.kind} title={sug.text}>
                  {shortHint(sug)}
                </span>
                <button
                  className="icon-btn sm ex-menu-btn"
                  aria-label={'Действия с упражнением: ' + e.exerciseName}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setMenu(ei);
                  }}
                >
                  <MoreHorizontal size={18} />
                </button>
              </header>
              <div className="sets" role="table" aria-label={'Подходы: ' + e.exerciseName}>
                <div className="set-row set-labels" role="row">
                  <span>#</span>
                  <span>было</span>
                  <span>{weightUnit(e)}</span>
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
                        placeholder={weightUnit(e)}
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
              <ExerciseNote value={r.note || ''} previous={e.previousNote} onChange={(v) => setNote(ei, v)} />
            </section>
          );
        })}

        {isFree && !results.length && (
          <p className="muted small center-text">Тренировка без программы: набирайте упражнения по ходу — они попадут в историю, прогрессия у каждого своя.</p>
        )}
        {isFree && !results.length && !!workout.lastFree?.length && (
          <button className="btn btn-primary btn-block" disabled={repeating} onClick={() => void repeatLast()}>
            <Undo2 size={16} /> {repeating ? 'Загружаем…' : `Как в прошлый раз · ${workout.lastFree.length} упр.`}
          </button>
        )}
        <button className={'btn btn-block add-ex' + (isFree && !results.length ? ' btn-primary' : '')} onClick={() => void openAdd()}>
          <Plus size={16} /> Упражнение
        </button>

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
            (swapping.list.find((x) => x.id === slotOf(results[swapping.ei]))?.muscleGroup || '').split(' / ')[0]
          }
          top={
            results[swapping.ei]?.replaces ? (
              <button className="pick pick-original" onClick={() => askRevert(swapping.ei)}>
                <span className="grow">
                  <strong>{plannedOf(results[swapping.ei]).exerciseName}</strong>
                  <span className="muted small">было в программе · вернуть</span>
                </span>
                <Undo2 size={18} />
              </button>
            ) : undefined
          }
          autoFocusSearch={false}
          allowCreate={workout.actorRole === 'trainer'}
          onCreated={() => {
            exerciseList = null;
          }}
          onPick={(x) => {
            if (canProgram && !results[swapping.ei].extra) {
              setSwapping(null);
              setSwapChoice({ ei: swapping.ei, ex: x });
            } else void swapExercise(swapping.ei, x);
          }}
          onClose={() => setSwapping(null)}
        />
      )}

      {menu !== null && results[menu] && (
        <ExerciseMenu
          entry={results[menu]}
          name={plan[menu].exerciseName}
          planned={results[menu].extra ? plan[menu] : plannedOf(results[menu])}
          confirm={menuConfirm}
          canProgram={canProgram}
          removeBlocked={!results[menu].extra && latest.current.length === 1}
          canEditTargets={canProgram || !!results[menu].extra}
          canJoin={canProgram}
          canSaveOrder={canProgram}
          busy={programBusy}
          onConfirm={setMenuConfirm}
          onSwap={() => void openSwap(menu)}
          onRevert={() => void swapExercise(menu, null)}
          onSkip={() => setSkipped(menu, true)}
          onDrop={() => removeExtra(menu)}
          onJoin={async () => {
            const entry = latest.current[menu];
            await saveDayToProgram(latest.current, [entry]);
            closeMenu();
          }}
          onTargets={() => {
            setTargetsFor(menu);
            closeMenu();
          }}
          onKeepSwap={async () => {
            const entry = latest.current[menu];
            if (entry.replaces && (await saveExerciseToProgram(entry.replaces, { replaceWith: entry.exerciseId }))) closeMenu();
          }}
          onOrder={() => {
            closeMenu();
            setOrdering(latest.current);
          }}
          onRemove={async () => {
            const keep = latest.current.filter((_, i) => i !== menu);
            // The last planned exercise can go when exercises added today stay: they become the program day.
            await saveDayToProgram(keep, keep.every((e) => e.extra) ? keep : []);
            closeMenu();
          }}
          onClose={closeMenu}
        />
      )}

      {adding && !adding.picked && (
        <ExercisePicker
          title="Добавить упражнение"
          exercises={adding.list}
          exclude={[...workout.day.exercises.map((x) => x.exerciseId), ...results.map((x) => x.exerciseId)]}
          autoFocusSearch={false}
          allowCreate={workout.actorRole === 'trainer'}
          onCreated={() => {
            exerciseList = null;
          }}
          onPick={(x) => setAdding({ ...adding, picked: x })}
          onClose={() => setAdding(null)}
        />
      )}
      {savingDay && (
        <SaveAsDay
          clientId={workout.ownerId}
          entries={latest.current}
          onClose={() => setSavingDay(false)}
          onSaved={(text) => {
            setSavingDay(false);
            setSavedDay(text);
            onProgramChanged?.();
          }}
        />
      )}
      {adding?.picked && (
        <AddTargets exercise={adding.picked} onBack={() => setAdding({ list: adding.list })} onAdd={(t) => void addExercise(adding.picked!, t)} />
      )}
      {targetsFor !== null && results[targetsFor] && (
        <TargetsSheet
          title={plan[targetsFor].exerciseName}
          initial={{
            sets: results[targetsFor].sets.length,
            repMin: plan[targetsFor].repMin,
            repMax: plan[targetsFor].repMax,
            targetRir: plan[targetsFor].targetRir,
          }}
          note={
            results[targetsFor].extra
              ? addsJoin
                ? 'Для этой тренировки; при завершении упражнение войдёт в программу с этими цифрами.'
                : 'Для этой тренировки.'
              : 'Сохранится в программе: в следующий раз будет так же. Отмеченные подходы останутся.'
          }
          submitLabel={results[targetsFor].extra ? 'Применить' : 'Сохранить в программе'}
          busy={programBusy}
          onSubmit={(t) => void applyTargets(targetsFor, t)}
          onBack={() => setTargetsFor(null)}
        />
      )}
      {swapChoice && (
        <Sheet title={'Замена: ' + swapChoice.ex.name} onClose={() => setSwapChoice(null)}>
          <p className="muted small">
            Вместо «{plan[swapChoice.ei]?.exerciseName}». Подходы, повторы и RIR останутся прежними.
          </p>
          <div className="order-actions">
            <button
              className="btn btn-block"
              disabled={programBusy}
              onClick={() => {
                void swapExercise(swapChoice.ei, swapChoice.ex);
                setSwapChoice(null);
              }}
            >
              Только сегодня
            </button>
            <button
              className="btn btn-primary btn-block"
              disabled={programBusy}
              onClick={async () => {
                await replaceInProgram(swapChoice.ei, swapChoice.ex);
                setSwapChoice(null);
              }}
            >
              {programBusy ? 'Сохраняем…' : 'В программе насовсем'}
            </button>
          </div>
        </Sheet>
      )}

      {ordering && (
        <Sheet title="Порядок упражнений" onClose={() => setOrdering(null)}>
          <ol className="order-list">
            {ordering.map((x, i) => (
              <li key={slotOf(x)} className={x.skipped ? 'muted' : ''}>
                <span className="ex-num num">{i + 1}</span>
                <span className="grow">{x.exerciseName}</span>
                <button className="icon-btn sm" aria-label={'Выше: ' + x.exerciseName} disabled={i === 0} onClick={() => setOrdering(moveBy(ordering, i, -1))}>
                  <ArrowUp size={16} />
                </button>
                <button
                  className="icon-btn sm"
                  aria-label={'Ниже: ' + x.exerciseName}
                  disabled={i === ordering.length - 1}
                  onClick={() => setOrdering(moveBy(ordering, i, 1))}
                >
                  <ArrowDown size={16} />
                </button>
              </li>
            ))}
          </ol>
          <div className="order-actions">
            <button
              className="btn btn-block"
              disabled={programBusy}
              onClick={() => {
                update(ordering);
                setOrdering(null);
              }}
            >
              Только в этой тренировке
            </button>
            {workout.actorRole === 'trainer' && !isFree && (
              <button
                className="btn btn-primary btn-block"
                disabled={programBusy}
                onClick={async () => {
                  await saveDayToProgram(ordering);
                  setOrdering(null);
                }}
              >
                {programBusy ? 'Сохраняем…' : 'Сохранить в программе'}
              </button>
            )}
          </div>
        </Sheet>
      )}

      <div className="j-foot">
        {confirmFinish ? (
          <Confirm
            text={
              done < total
                ? `Выполнено ${done} из ${total} подходов. Пустые подходы не попадут в историю${isFree ? '.' : ', дальше откроется следующая тренировка программы.'}${joinNote}`
                : `Все ${total} подходов выполнены. Записать тренировку в историю?${joinNote}`
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
            {isFree && workout.actorRole === 'trainer' && results.length > 0 && (
              <button className="btn btn-block" onClick={() => setSavingDay(true)}>
                <ListOrdered size={16} /> Сохранить как тренировку программы
              </button>
            )}
            {savedDay && <p className="tone-good small center-text">{savedDay}</p>}
            <p className="muted small center-text">
              Каждый подход сохраняется сразу — переключайтесь между клиентами свободно. «Ушёл» тоже записывает тренировку в историю.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

type MenuConfirm = 'swap' | 'revert' | 'remove' | 'drop';
/**
 * Actions for one exercise of the workout: replace (today or for good), sets and reps, skip, order, delete;
 * for one added today — delete or add to the program.
 */
function ExerciseMenu({
  entry,
  name,
  planned,
  confirm,
  canProgram,
  removeBlocked,
  canEditTargets,
  canJoin,
  canSaveOrder,
  busy,
  onConfirm,
  onSwap,
  onRevert,
  onSkip,
  onDrop,
  onJoin,
  onTargets,
  onKeepSwap,
  onOrder,
  onRemove,
  onClose,
}: {
  entry: SessionExercise;
  name: string;
  planned: WorkoutExercise;
  confirm: MenuConfirm | null;
  canProgram: boolean;
  /** The only exercise of the workout: deleting it would leave the program day empty. */
  removeBlocked: boolean;
  canEditTargets: boolean;
  canJoin: boolean;
  canSaveOrder: boolean;
  busy: boolean;
  onConfirm: (c: MenuConfirm | null) => void;
  onSwap: () => void;
  onRevert: () => void;
  onSkip: () => void;
  onDrop: () => void;
  onJoin: () => void;
  onTargets: () => void;
  onKeepSwap: () => void;
  onOrder: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const ticked = entry.sets.filter((x) => x.reps > 0).length;
  const lost = ticked ? ` Отмеченные подходы (${ticked}) не сохранятся.` : '';
  const extra = entry.extra;
  const targets = extra || planned;
  return (
    <Sheet title={name} onClose={onClose}>
      {confirm === 'swap' ? (
        <Confirm text={'Заменить упражнение?' + lost} confirmLabel="Выбрать замену" onConfirm={onSwap} onCancel={() => onConfirm(null)} />
      ) : confirm === 'revert' ? (
        <Confirm
          text={`Вернуть «${planned.exerciseName}»?` + lost}
          confirmLabel="Вернуть"
          onConfirm={onRevert}
          onCancel={() => onConfirm(null)}
        />
      ) : confirm === 'drop' ? (
        <Confirm text={`Удалить «${name}» из этой тренировки?` + lost} confirmLabel="Удалить" onConfirm={onDrop} onCancel={() => onConfirm(null)} />
      ) : confirm === 'remove' ? (
        <Confirm
          text={`Удалить «${planned.exerciseName}» из программы? В следующих тренировках его не будет.` + lost}
          confirmLabel="Удалить"
          busy={busy}
          onConfirm={onRemove}
          onCancel={() => onConfirm(null)}
        />
      ) : (
        <div className="ex-menu">
          <button className="menu-item" onClick={() => (ticked ? onConfirm('swap') : onSwap())}>
            <ArrowLeftRight size={18} />
            <span className="grow">
              {extra ? 'Заменить другим' : 'Заменить'}
              <small>
                {extra ? 'с теми же подходами и повторами' : canProgram ? 'на сегодня или в программе насовсем' : `в программе останется «${planned.exerciseName}»`}
              </small>
            </span>
          </button>
          {entry.replaces && (
            <button className="menu-item" onClick={() => (ticked ? onConfirm('revert') : onRevert())}>
              <Undo2 size={18} />
              <span className="grow">
                Вернуть «{planned.exerciseName}»
                <small>как в программе</small>
              </span>
            </button>
          )}
          {entry.replaces && canProgram && (
            <button className="menu-item" onClick={onKeepSwap} disabled={busy}>
              <Check size={18} />
              <span className="grow">
                {busy ? 'Сохраняем…' : `Оставить «${name}» в программе`}
                <small>вместо «{planned.exerciseName}» насовсем</small>
              </span>
            </button>
          )}
          {canEditTargets && (
            <button className="menu-item" onClick={onTargets}>
              <Pencil size={18} />
              <span className="grow">
                Подходы и повторы
                <small>
                  {entry.sets.length}×{targets.repMin}–{targets.repMax}, RIR {targets.targetRir}
                  {extra ? ' · на эту тренировку' : ' · сохранится в программе'}
                </small>
              </span>
            </button>
          )}
          {!extra && (
            <button className="menu-item" onClick={onSkip}>
              <SkipForward size={18} />
              <span className="grow">
                Пропустить сегодня
                <small>{ticked ? 'отмеченные подходы сохранятся' : 'в следующий раз будет по плану'}</small>
              </span>
            </button>
          )}
          {extra && canJoin && (
            <button className="menu-item" onClick={onJoin} disabled={busy}>
              <Plus size={18} />
              <span className="grow">
                {busy ? 'Сохраняем…' : 'Добавить в программу сейчас'}
                <small>
                  {entry.sets.length}×{extra.repMin}–{extra.repMax}, RIR {extra.targetRir} — иначе войдёт при завершении, если сделан подход
                </small>
              </span>
            </button>
          )}
          <button className="menu-item" onClick={onOrder}>
            <ListOrdered size={18} />
            <span className="grow">
              Изменить порядок
              <small>{canSaveOrder ? 'сегодня или в программе' : 'в этой тренировке'}</small>
            </span>
          </button>
          {extra ? (
            <button className="menu-item danger" onClick={() => (ticked ? onConfirm('drop') : onDrop())}>
              <Trash2 size={18} />
              <span className="grow">
                Удалить упражнение
                <small>добавлено сегодня{canJoin ? ' — в программу не попадёт' : ''}</small>
              </span>
            </button>
          ) : canProgram ? (
            <button className="menu-item danger" onClick={() => onConfirm('remove')} disabled={removeBlocked}>
              <Trash2 size={18} />
              <span className="grow">
                Удалить из программы
                <small>{removeBlocked ? 'единственное упражнение — сначала добавьте другое' : 'насовсем, из этой тренировки программы'}</small>
              </span>
            </button>
          ) : null}
        </div>
      )}
    </Sheet>
  );
}

/** Free workout → a day of one of the client's programs, or the first day of a new program. */
function SaveAsDay({
  clientId,
  entries,
  onClose,
  onSaved,
}: {
  clientId: string;
  entries: SessionExercise[];
  onClose: () => void;
  onSaved: (text: string) => void;
}) {
  const [programs, setPrograms] = useState<Array<{ id: string; name: string; days: Array<{ id: string }> }> | null>(null);
  const [target, setTarget] = useState('');
  const [programName, setProgramName] = useState('Программа');
  const [dayName, setDayName] = useState('Тренировка 1');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    api
      .get('/api/programs')
      .then((r) => {
        const list = (r.data.programs as any[]).filter((p) => p.clientId === clientId && !p.archived);
        setPrograms(list);
        if (list[0]) {
          setTarget(list[0].id);
          setDayName('Тренировка ' + (list[0].days.length + 1));
        }
      })
      .catch((e) => setErr(readError(e)));
  }, [clientId]);
  const pickTarget = (id: string) => {
    setTarget(id);
    const p = programs?.find((x) => x.id === id);
    setDayName('Тренировка ' + ((p?.days.length || 0) + 1));
  };
  const save = async () => {
    setBusy(true);
    try {
      const r = await api.post('/api/free/' + encodeURIComponent(clientId) + '/save', {
        programId: target || null,
        programName,
        dayName,
        exercises: entries.filter((e) => e.extra).map((e) => ({ exerciseId: e.exerciseId, sets: e.sets.length, ...e.extra })),
      });
      onSaved(`Сохранено: «${dayName}» в программе «${r.data.programName}».`);
    } catch (e) {
      setErr(readError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet title="Сохранить в программу" onClose={onClose}>
      {err && <div className="alert">{err}</div>}
      {!programs ? (
        <div className="loader-block">
          <span className="loader" />
        </div>
      ) : (
        <>
          <label className="field">
            <span>Программа</span>
            <select value={target} onChange={(e) => pickTarget(e.target.value)}>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.days.length} трен.
                </option>
              ))}
              <option value="">Новая программа</option>
            </select>
          </label>
          {!target && (
            <label className="field">
              <span>Название программы</span>
              <input id="free-program-name" value={programName} onChange={(e) => setProgramName(e.target.value)} />
            </label>
          )}
          <label className="field">
            <span>Название тренировки</span>
            <input id="free-day-name" value={dayName} onChange={(e) => setDayName(e.target.value)} />
          </label>
          <p className="muted small">
            {entries.filter((e) => e.extra).length} упражнений с теми же подходами и повторами. Сегодняшние результаты останутся в истории, прогрессия продолжится.
          </p>
          <button className="btn btn-primary btn-block" disabled={busy || !dayName.trim()} onClick={() => void save()}>
            {busy ? 'Сохраняем…' : target ? 'Добавить тренировку в программу' : 'Создать программу'}
          </button>
        </>
      )}
    </Sheet>
  );
}

type Targets = { sets: number; repMin: number; repMax: number; targetRir: number };
const RANGES: Array<[number, number]> = [
  [5, 8],
  [6, 10],
  [8, 12],
  [10, 15],
  [12, 20],
];
/** Sets, rep range and reserve: for an exercise added in the gym, or to change one in the workout. */
function TargetsSheet({
  title,
  initial,
  note,
  submitLabel,
  busy = false,
  onSubmit,
  onBack,
}: {
  title: string;
  initial: Targets;
  note?: string;
  submitLabel: string;
  busy?: boolean;
  onSubmit: (t: Targets) => void;
  onBack: () => void;
}) {
  const [sets, setSets] = useState(initial.sets);
  const [repMin, setRepMin] = useState(String(initial.repMin));
  const [repMax, setRepMax] = useState(String(initial.repMax));
  const [rir, setRir] = useState(initial.targetRir);
  const lo = Number(repMin);
  const hi = Number(repMax);
  const valid = Number.isInteger(lo) && Number.isInteger(hi) && lo >= 1 && hi >= lo && hi <= 100;
  return (
    <Sheet title={title} onClose={onBack}>
      <div className="field">
        <span>Подходы</span>
        <div className="chips">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <button key={n} className={'filter' + (sets === n ? ' on' : '')} onClick={() => setSets(n)}>
              {n}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Повторы</span>
        <div className="chips">
          {RANGES.map(([a, b]) => (
            <button
              key={a + '-' + b}
              className={'filter' + (lo === a && hi === b ? ' on' : '')}
              onClick={() => {
                setRepMin(String(a));
                setRepMax(String(b));
              }}
            >
              {a}–{b}
            </button>
          ))}
        </div>
        <div className="range-inputs">
          <input id="targets-min" inputMode="numeric" aria-label="Повторов от" value={repMin} onChange={(e) => setRepMin(e.target.value.replace(/\D/g, ''))} />
          <span>–</span>
          <input id="targets-max" inputMode="numeric" aria-label="Повторов до" value={repMax} onChange={(e) => setRepMax(e.target.value.replace(/\D/g, ''))} />
          <span className="muted small">свой диапазон</span>
        </div>
      </div>
      <div className="field">
        <span>Запас повторов (RIR)</span>
        <div className="chips">
          {[0, 1, 2, 3, 4].map((n) => (
            <button key={n} className={'filter' + (rir === n ? ' on' : '')} onClick={() => setRir(n)}>
              {n}
            </button>
          ))}
        </div>
      </div>
      {note && <p className="muted small">{note}</p>}
      {!valid && <p className="tone-warn small">Повторы: от 1 до 100, первое число не больше второго.</p>}
      <button className="btn btn-primary btn-block" disabled={!valid || busy} onClick={() => onSubmit({ sets, repMin: lo, repMax: hi, targetRir: rir })}>
        {busy ? 'Сохраняем…' : submitLabel}
      </button>
    </Sheet>
  );
}

/** Starting targets for an exercise added in the gym. */
function AddTargets({ exercise, onAdd, onBack }: { exercise: Exercise; onAdd: (t: Targets) => void; onBack: () => void }) {
  // Isolation and cable work: more reps, closer to failure; big lifts: fewer reps, more in reserve.
  const light = isStack({ exerciseId: exercise.id, equipment: exercise.equipment }) || /Бицепс|Трицепс|Плечи|Икры|Пресс/.test(exercise.muscleGroup);
  return (
    <TargetsSheet
      title={exercise.name}
      initial={{ sets: 3, repMin: light ? 10 : 8, repMax: light ? 15 : 12, targetRir: light ? 1 : 2 }}
      submitLabel="Добавить в тренировку"
      onSubmit={onAdd}
      onBack={onBack}
    />
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
/**
 * Time in the gym since «Пришёл» (keeps running, never resets); without a check-in, time since the last set.
 * The colour tells whether the entries are saved.
 */
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'offline';
function SaveState({ status, since, lastSetAt }: { status: SaveStatus; since: number | null; lastSetAt: number | null }) {
  const now = useNow(1000);
  if (status === 'error') return <span className="save-dot error">не сохр.</span>;
  if (status === 'offline' && !since) return <span className="save-dot offline" title="Нет сети: подходы на телефоне, отправятся сами">офлайн</span>;
  if (since)
    return (
      <span className={'save-dot session ' + status} title="Время на тренировке с отметки «Пришёл»">
        {elapsed(now - since)}
      </span>
    );
  return <span className={'save-dot ' + status}>{status === 'saving' ? 'сохр…' : lastSetAt ? clock(now - lastSetAt) : 'сохр.'}</span>;
}

/** A small comment line at the bottom of an exercise; last time's comment is shown above it. */
function ExerciseNote({ value, previous, onChange }: { value: string; previous?: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(!!value);
  return (
    <div className="ex-note">
      {previous && <span className="ex-note-prev">в прошлый раз: «{previous}»</span>}
      {open || value ? (
        <input
          className="ex-note-input"
          maxLength={200}
          placeholder="Комментарий: настройки, самочувствие…"
          value={value}
          autoFocus={open && !value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => !value && setOpen(false)}
        />
      ) : (
        <button className="link-btn ex-note-add" onClick={() => setOpen(true)}>
          <Plus size={12} /> комментарий
        </button>
      )}
    </div>
  );
}
