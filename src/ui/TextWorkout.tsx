// «Тренировка из текста»: typed or spoken lines («Жим ногами 45 3х15») → a workout of the client's program
// (with what was done recorded), or notes from the phone (dates, «вес×повторы; …») → the client's history.
// The text is read on the phone (src/workoutText.ts), names are matched to the base (src/exerciseMatch.ts).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, ChevronDown, Mic, Search, Sparkles, Square } from 'lucide-react';
import { api, readError } from '../transport';
import { localDate } from '../clock';
import { fmtKg } from '../analytics';
import type { Exercise } from '../types';
import { parseWorkoutText, planOf, type ParsedExercise, type ParsedSet, type ParsedText } from '../workoutText';
import { guessEquipment, guessGroup, matchExercise, normName, rankExercises, SURE } from '../exerciseMatch';
import { Sheet, nextDayName, plural, searchKey } from './common';
import { programsOf, type TrainerData } from './data';

const ALIASES_KEY = 'tl-name-aliases';
function readAliases(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(ALIASES_KEY) || '{}') || {};
  } catch {
    return {};
  }
}
function remember(name: string, exerciseId: string) {
  try {
    const all = readAliases();
    all[normName(name)] = exerciseId;
    localStorage.setItem(ALIASES_KEY, JSON.stringify(all));
  } catch {
    /* the phone does not keep it: matched again next time */
  }
}

/** What a written name became: an exercise of the base, or a new own one. */
type Choice = { kind: 'base'; exercise: Exercise; sure: boolean } | { kind: 'new' };

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const dayText = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}${y !== new Date().getFullYear() ? ' ' + y : ''}`;
};
/** Midday of the date (now, when it is today — it is the last workout of the day then): the history shows the day. */
const atDate = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  const now = new Date();
  if (y === now.getFullYear() && m === now.getMonth() + 1 && d === now.getDate()) return new Date(now.getTime() - 1000).toISOString();
  return new Date(Math.min(new Date(y, m - 1, d, 12).getTime(), now.getTime() - 1000)).toISOString();
};
const setsText = (sets: ParsedSet[]) => {
  if (!sets.length) return 'без подходов';
  const sameW = sets.every((s) => s.weight === sets[0].weight);
  const sameR = sets.every((s) => s.reps === sets[0].reps);
  const kg = (w: number) => (w ? fmtKg(w) + ' кг' : 'свой вес');
  if (sameW && sameR) return `${kg(sets[0].weight)} · ${sets.length}×${sets[0].reps || '?'}`;
  if (sameW) return `${kg(sets[0].weight)} · ${sets.map((s) => s.reps || '?').join(', ')}`;
  return sets.map((s) => (s.weight ? fmtKg(s.weight) + '×' : '') + (s.reps || '?')).join('; ');
};

/** The model's answer (backend/aiWorkout.ts) in the shape the preview shows. */
interface AiAnswer {
  title: string | null;
  days: Array<{
    name: string;
    date: string | null;
    bodyWeight: number | null;
    exercises: Array<{ written: string; exerciseId: string | null; done: ParsedSet[]; plan: ParsedExercise['plan'] | null; note: string | null }>;
  }>;
}
const fromAi = (a: AiAnswer): ParsedText => ({
  ...(a.title ? { title: a.title } : {}),
  notes: false,
  workouts: a.days.map((d, di) => ({
    name: d.name,
    ...(d.date ? { date: d.date } : {}),
    ...(d.bodyWeight ? { bodyWeight: d.bodyWeight } : {}),
    exercises: d.exercises.map((e, ei) => ({
      name: e.written,
      sets: e.done,
      line: `ai:${di}:${ei}:${e.written}`,
      ...(e.exerciseId ? { exerciseId: e.exerciseId } : {}),
      ...(e.plan ? { plan: e.plan } : {}),
      ...(e.note ? { note: e.note } : {}),
    })),
  })),
});

/** A photo made smaller for sending (the long side up to 1600 px, JPEG). */
async function shrinkPhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => fail(new Error('Не удалось открыть фото.'));
      i.src = url;
    });
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

type SpeechRec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
};
const SpeechCtor = (): (new () => SpeechRec) | undefined => {
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  return w.SpeechRecognition || w.webkitSpeechRecognition;
};

/** Dictation into the text: each pause is a new line (one exercise). */
function useDictation(onLine: (line: string) => void) {
  const rec = useRef<SpeechRec | null>(null);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [err, setErr] = useState('');
  const supported = typeof window !== 'undefined' && !!SpeechCtor();
  useEffect(() => () => rec.current?.stop(), []);
  const start = () => {
    const Ctor = SpeechCtor();
    if (!Ctor) return;
    setErr('');
    const r = new Ctor();
    r.lang = 'ru-RU';
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) onLine(res[0].transcript.trim());
        else interim += res[0].transcript;
      }
      setHeard(interim);
    };
    r.onerror = (e) =>
      setErr(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Нет доступа к микрофону — разрешите его для сайта.' : e.error === 'no-speech' ? '' : 'Голос не распознан: ' + e.error);
    r.onend = () => {
      setListening(false);
      setHeard('');
    };
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setErr('Не удалось включить микрофон.');
    }
  };
  const stop = () => rec.current?.stop();
  return { supported, listening, heard, err, start, stop };
}

export function TextWorkout({
  data,
  clientId,
  initialMode = 'program',
  onClose,
  onDone,
}: {
  data: TrainerData;
  clientId: string;
  initialMode?: 'program' | 'history';
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [textValue, setText] = useState('');
  const local = useMemo(() => parseWorkoutText(textValue), [textValue]);
  // «Разобрать нейросетью»: its answer is shown instead of the rules' until «Без нейросети».
  const [ai, setAi] = useState<{ parsed: ParsedText; text: string; photo: boolean } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState('');
  const [photo, setPhoto] = useState<{ data: string; name: string } | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const parsed = ai?.parsed || local;
  const dictation = useDictation((line) => setText((t) => (t.trim() ? t.replace(/\s*$/, '') + '\n' : '') + line));
  const [aliases, setAliases] = useState(readAliases);
  // Names chosen by hand here: normalised name → exercise id or «new».
  const [picked, setPicked] = useState<Record<string, string>>({});
  // «3х15» read the other way (3 кг × 15): by the line.
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  const [choosing, setChoosing] = useState<ParsedExercise | null>(null);
  const dated = parsed.workouts.some((w) => w.date);
  const [mode, setMode] = useState<'program' | 'history'>(initialMode);
  useEffect(() => {
    if (dated) setMode('history');
  }, [dated]);
  const programs = programsOf(data.programs, clientId);
  const [target, setTarget] = useState<string>('');
  const targetProgram = programs.find((p) => p.id === target);
  const [programName, setProgramName] = useState('Программа');
  const [dayName, setDayName] = useState('');
  const [record, setRecord] = useState(true);
  const [date, setDate] = useState(localDate());
  const [bodyWeight, setBodyWeight] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const choiceOf = (e: ParsedExercise): Choice => {
    const key = normName(e.name);
    const p = picked[key];
    if (p === 'new') return { kind: 'new' };
    const byHand = p && data.exercises.find((x) => x.id === p);
    if (byHand) return { kind: 'base', exercise: byHand, sure: true };
    const byModel = e.exerciseId && data.exercises.find((x) => x.id === e.exerciseId);
    if (byModel) return { kind: 'base', exercise: byModel, sure: true };
    const m = matchExercise(e.name, data.exercises, e.group, aliases);
    return m.exercise ? { kind: 'base', exercise: m.exercise, sure: m.score >= SURE } : { kind: 'new' };
  };
  const setsOf = (e: ParsedExercise): ParsedSet[] =>
    e.ambiguous && flipped[e.line] ? [{ weight: e.ambiguous.a, reps: e.ambiguous.reps }] : e.sets;

  const all = parsed.workouts.flatMap((w) => w.exercises);
  const unsure = all.filter((e) => {
    const c = choiceOf(e);
    return c.kind === 'base' && !c.sure;
  }).length;
  const fresh = Array.from(new Set(all.filter((e) => choiceOf(e).kind === 'new').map((e) => e.name)));
  const doneSets = all.reduce((n, e) => n + setsOf(e).filter((s) => s.reps > 0).length, 0);
  const weights = parsed.workouts.filter((w) => w.date && w.bodyWeight);
  const defaultDayName = nextDayName((targetProgram?.days || []).map((d) => d.name));
  const days = parsed.workouts.filter((w) => w.exercises.length);
  // A program told as several workouts: each becomes a day, by its name.
  const dayNames = (() => {
    const taken = (targetProgram?.days || []).map((d) => d.name);
    return days.map((w) => {
      const n = days.length === 1 ? dayName.trim() || w.name || defaultDayName : w.name || nextDayName(taken);
      taken.push(n);
      return n;
    });
  })();

  const askAi = async () => {
    setAiBusy(true);
    setAiErr('');
    try {
      const r = await api.post('/api/ai/workout', { text: textValue, today: localDate(), ...(photo ? { image: photo.data } : {}) });
      setAi({ parsed: fromAi(r.data.workout), text: textValue, photo: !!photo });
      setPicked({});
    } catch (e) {
      setAiErr(readError(e));
    } finally {
      setAiBusy(false);
    }
  };
  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setAiErr('');
    try {
      setPhoto({ data: await shrinkPhoto(file), name: file.name });
    } catch (e) {
      setAiErr(readError(e));
    }
  };

  /** Own exercises for the new names, made once; → name → id. */
  const makeNew = async () => {
    const ids: Record<string, string> = {};
    for (const name of fresh) {
      const sample = all.find((e) => e.name === name)!;
      const r = await api.post('/api/exercises', {
        name,
        muscleGroup: guessGroup(name, sample.group),
        equipment: guessEquipment(name, setsOf(sample).every((s) => !s.weight)),
      });
      ids[normName(name)] = r.data.exercise.id;
      remember(name, r.data.exercise.id);
    }
    return ids;
  };
  const idOf = (e: ParsedExercise, made: Record<string, string>) => {
    const c = choiceOf(e);
    return c.kind === 'base' ? c.exercise.id : made[normName(e.name)];
  };
  /** The exercises of a workout as recorded; the same exercise written twice is one, with all its sets. */
  const entries = (list: ParsedExercise[], made: Record<string, string>) => {
    const out: Array<{
      exerciseId: string;
      exerciseName: string;
      sets: Array<{ weight: number; reps: number; rir: null }>;
      note?: string;
      plan: ReturnType<typeof planOf>;
      repMin: number;
      repMax: number;
      targetRir: number;
    }> = [];
    for (const e of list) {
      const id = idOf(e, made);
      const sets = setsOf(e).map((x) => ({ weight: x.weight, reps: x.reps, rir: null }));
      const same = out.find((x) => x.exerciseId === id);
      if (same) {
        same.sets = [...same.sets, ...sets].slice(0, 10);
        if (e.note) same.note = [same.note, e.note].filter(Boolean).join('; ');
      } else
        out.push({
          exerciseId: id,
          exerciseName: e.name,
          sets,
          ...(e.note ? { note: e.note } : {}),
          plan: e.plan ? { ...e.plan, targetRir: 2 } : planOf([]),
          repMin: 0,
          repMax: 0,
          targetRir: 2,
        });
    }
    // The plan of the program and the targets of a free workout — told, or from all the sets.
    for (const x of out) {
      const told = list.find((e) => e.plan && idOf(e, made) === x.exerciseId);
      x.plan = told?.plan ? { ...told.plan, targetRir: 2 } : planOf(x.sets);
      x.repMin = x.plan.repMin;
      x.repMax = x.plan.repMax;
      x.targetRir = x.plan.targetRir;
    }
    return out;
  };

  const save = async () => {
    setBusy(true);
    setErr('');
    try {
      const made = await makeNew();
      if (mode === 'program') {
        let programId: string | null = target || null;
        let programTitle = '';
        let recordedDays = 0;
        for (const [i, w] of days.entries()) {
          const exercises = entries(w.exercises, made);
          const r = await api.post('/api/free/' + encodeURIComponent(clientId) + '/save', {
            programId,
            programName: programName.trim() || parsed.title || 'Программа',
            dayName: dayNames[i],
            exercises: exercises.map((x) => ({ exerciseId: x.exerciseId, ...x.plan })),
          });
          programId = r.data.programId;
          programTitle = r.data.programName;
          if (record && exercises.some((x) => x.sets.some((s) => s.reps > 0))) {
            await api.post('/api/client/' + encodeURIComponent(clientId) + '/import', {
              programId: r.data.programId,
              dayId: r.data.dayId,
              workouts: [{ completedAt: atDate(w.date || date), exercises: exercises.map(({ plan: _plan, ...x }) => x) }],
            });
            recordedDays++;
          }
        }
        await data.reload();
        const count = all.length;
        const what = days.length === 1 ? `«${dayNames[0]}»` : `${days.length} ${plural(days.length, 'тренировка', 'тренировки', 'тренировок')} (${dayNames.map((n) => '«' + n + '»').join(', ')})`;
        const recorded = recordedDays ? `, сделанное записано за ${dayText(date)}` : '';
        onDone(`Собрано: ${what} в программе «${programTitle}», ${count} упр.${recorded}.`);
      } else {
        const workouts = parsed.workouts
          .filter((w) => w.exercises.length)
          .map((w) => ({
            completedAt: atDate(w.date || date),
            dayName: Array.from(new Set(w.exercises.map((e) => e.group).filter(Boolean))).join(', ') || 'Из заметок',
            exercises: entries(w.exercises, made).map(({ plan: _plan, ...x }) => x),
          }));
        const r = await api.post('/api/client/' + encodeURIComponent(clientId) + '/import', { workouts });
        let kg = 0;
        if (bodyWeight)
          for (const w of weights) {
            await api.post('/api/body', { clientId, date: w.date, weight: w.bodyWeight });
            kg++;
          }
        await data.reload();
        const parts = [
          `В историю ${plural(r.data.added, 'записана', 'записаны', 'записано')} ${r.data.added} ${plural(r.data.added, 'тренировка', 'тренировки', 'тренировок')}`,
          r.data.skipped ? `${r.data.skipped} уже ${plural(r.data.skipped, 'была', 'были', 'было')} — пропущено` : '',
          kg ? `вес тела — в «Замеры» (${kg})` : '',
        ];
        onDone(parts.filter(Boolean).join(', ') + '.');
      }
    } catch (e) {
      setErr(readError(e));
    } finally {
      setBusy(false);
    }
  };

  const tooLong = days.some((w) => w.exercises.length > 30);
  const canSave = all.length > 0 && (mode === 'program' ? !tooLong && (target ? targetProgram!.days.length : 0) + days.length <= 14 : doneSets > 0);

  return (
    <Sheet title="Тренировка из текста" onClose={onClose} wide>
      <div className="text-workout">
        <label className="field">
          <span>По строке на упражнение («Жим ногами 45 3х15») или своими словами — тогда «Разобрать нейросетью»</span>
          <textarea
            id="text-workout-input"
            rows={6}
            value={textValue}
            placeholder={'Жим ногами 45 3х15\nРумынская тяга 20 3х12,10,8\nОтжимания от пола 30,27,16'}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <div className="row gap wrap">
          {dictation.supported ? (
            <button
              type="button"
              className={'btn' + (dictation.listening ? ' btn-primary' : '')}
              onClick={dictation.listening ? dictation.stop : dictation.start}
            >
              {dictation.listening ? <Square size={16} /> : <Mic size={16} />} {dictation.listening ? 'Стоп' : 'Голосом'}
            </button>
          ) : (
            <span className="muted small">Голосом — кнопка микрофона на клавиатуре телефона.</span>
          )}
          <button type="button" className="btn" onClick={() => photoInput.current?.click()}>
            <Camera size={16} /> {photo ? 'Другое фото' : 'Фото заметки'}
          </button>
          <input ref={photoInput} type="file" accept="image/*" hidden onChange={(e) => void pickPhoto(e.target.files?.[0])} />
          {(textValue || photo) && (
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => {
                setText('');
                setPhoto(null);
                setAi(null);
              }}
            >
              Очистить
            </button>
          )}
        </div>
        {photo && (
          <div className="tw-photo">
            <img src={photo.data} alt="Фото заметки" />
            <span className="muted small">Фото прочитает нейросеть. Можно дописать текстом, что на нём важно.</span>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setPhoto(null)}>
              Убрать
            </button>
          </div>
        )}
        {(textValue.trim() || photo) && (
          <div className="tw-ai">
            <button id="text-workout-ai" type="button" className="btn btn-primary" disabled={aiBusy} onClick={() => void askAi()}>
              <Sparkles size={16} /> {aiBusy ? 'Нейросеть разбирает…' : ai ? 'Разобрать нейросетью заново' : 'Разобрать нейросетью'}
            </button>
            {ai && (
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setAi(null)}>
                Без нейросети
              </button>
            )}
            <span className="muted small">
              {ai
                ? ai.text !== textValue || ai.photo !== !!photo
                  ? 'Текст изменился — разберите заново.'
                  : 'Разобрано нейросетью. Проверьте ниже.'
                : 'Для свободного рассказа («три дня: первый — грудь и спина…») и фото заметок.'}
            </span>
          </div>
        )}
        {aiErr && <div className="alert">{aiErr}</div>}
        {dictation.listening && (
          <p className="muted small">
            Слушаю… Говорите по упражнению с паузой: «жим ногами сорок пять, три по пятнадцать». {dictation.heard && <i>«{dictation.heard}»</i>}
          </p>
        )}
        {dictation.err && <div className="alert">{dictation.err}</div>}

        {all.length > 0 && (
          <div className="tw-preview" aria-label="Что получилось">
            {parsed.title && <p className="muted small">{parsed.title}</p>}
            {parsed.workouts.map((w, wi) => (
              <div key={wi} className="tw-workout">
                {w.name && parsed.workouts.length > 1 && !w.date && (
                  <div className="tw-date">
                    <strong>{w.name}</strong>
                  </div>
                )}
                {w.date && (
                  <div className="tw-date">
                    <strong>{dayText(w.date)}</strong>
                    {w.bodyWeight ? <span className="muted"> · вес тела {fmtKg(w.bodyWeight)} кг</span> : null}
                  </div>
                )}
                {w.exercises.map((e, ei) => {
                  const c = choiceOf(e);
                  const sets = setsOf(e);
                  return (
                    <div key={ei} className="tw-row">
                      <button type="button" className="tw-name" onClick={() => setChoosing(e)}>
                        <strong>{c.kind === 'base' ? c.exercise.name : e.name}</strong>
                        <ChevronDown size={14} aria-hidden="true" className="muted" />
                        {c.kind === 'base' && normName(c.exercise.name) !== normName(e.name) && <span className="muted small"> ← {e.name}</span>}
                        {c.kind === 'new' ? (
                          <span className="chip chip-info">новое</span>
                        ) : c.sure ? null : (
                          <span className="chip chip-warn">проверьте</span>
                        )}
                      </button>
                      <span className="tw-sets small">
                        {e.plan && !sets.length ? `план ${e.plan.sets}×${e.plan.repMin === e.plan.repMax ? e.plan.repMin : e.plan.repMin + '–' + e.plan.repMax}` : setsText(sets)}
                        {e.ambiguous && (
                          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setFlipped((f) => ({ ...f, [e.line]: !f[e.line] }))}>
                            {flipped[e.line] ? `${e.ambiguous.a} — это подходы` : `${e.ambiguous.a} — это вес`}
                          </button>
                        )}
                      </span>
                      {e.note && <span className="muted small">«{e.note}»</span>}
                    </div>
                  );
                })}
              </div>
            ))}
            <p className="muted small">
              {all.length} упр., {doneSets} {plural(doneSets, 'подход', 'подхода', 'подходов')}
              {unsure ? ` · проверьте ${unsure} — нажмите на название, чтобы выбрать другое` : ''}
              {fresh.length ? ` · новых в базе: ${fresh.length}` : ''}
            </p>
          </div>
        )}

        {all.length > 0 && (
          <>
            <div className="seg-toggle" role="tablist" aria-label="Что сделать">
              <button type="button" className={mode === 'program' ? 'on' : ''} onClick={() => setMode('program')}>
                Собрать тренировку
              </button>
              <button type="button" className={mode === 'history' ? 'on' : ''} onClick={() => setMode('history')}>
                Только в историю
              </button>
            </div>
            {mode === 'program' ? (
              <>
                <label className="field">
                  <span>В программу</span>
                  <select id="text-workout-program" value={target} onChange={(e) => setTarget(e.target.value)}>
                    <option value="">Новая программа</option>
                    {programs.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.days.length} трен.
                      </option>
                    ))}
                  </select>
                </label>
                {!target && (
                  <label className="field">
                    <span>Название программы</span>
                    <input id="text-workout-program-name" value={programName} onChange={(e) => setProgramName(e.target.value)} />
                  </label>
                )}
                {days.length === 1 ? (
                  <label className="field">
                    <span>Название тренировки</span>
                    <input id="text-workout-day" value={dayName} placeholder={days[0].name || defaultDayName} onChange={(e) => setDayName(e.target.value)} />
                  </label>
                ) : (
                  <p className="small">
                    {days.length} {plural(days.length, 'тренировка', 'тренировки', 'тренировок')} в программе: {dayNames.map((n) => '«' + n + '»').join(', ')}
                  </p>
                )}
                {doneSets > 0 && (
                  <label className="toggle">
                    <input id="text-workout-record" type="checkbox" checked={record} onChange={(e) => setRecord(e.target.checked)} />
                    <span>Записать сделанное в историю — в следующий раз журнал подскажет веса</span>
                  </label>
                )}
                <p className="muted small">
                  Подходы и повторы программы — по записанному: «3х15» → 3 подхода по 12–15, «12,10,8» → 3 подхода по 8–12. Потом
                  их можно изменить в программе.
                </p>
              </>
            ) : (
              <>
                <p className="muted small">
                  {dated
                    ? 'Каждая дата — отдельная тренировка в истории клиента. Последние результаты упражнений журнал покажет, когда вы откроете тренировку с ними.'
                    : 'Тренировка запишется в историю клиента. Программа не меняется.'}
                </p>
                {weights.length > 0 && (
                  <label className="toggle">
                    <input type="checkbox" checked={bodyWeight} onChange={(e) => setBodyWeight(e.target.checked)} />
                    <span>Вес тела — в «Замеры» ({weights.length})</span>
                  </label>
                )}
              </>
            )}
            {(mode === 'program' ? record && doneSets > 0 : parsed.workouts.some((w) => !w.date)) && (
              <label className="field">
                <span>Дата тренировки</span>
                <input id="text-workout-date" type="date" value={date} max={localDate()} onChange={(e) => setDate(e.target.value || localDate())} />
              </label>
            )}
            {mode === 'program' && tooLong && <div className="alert">В одной тренировке — до 30 упражнений.</div>}
            {mode === 'history' && !doneSets && <div className="alert">Нет подходов с повторами — записывать в историю нечего.</div>}
            {err && <div className="alert">{err}</div>}
            <button id="text-workout-save" className="btn btn-primary btn-block" disabled={busy || !canSave} onClick={() => void save()}>
              {busy ? 'Сохраняем…' : mode === 'program' ? 'Собрать тренировку' : 'Записать в историю'}
            </button>
          </>
        )}
      </div>
      {choosing && (
        <ChooseExercise
          name={choosing.name}
          group={choosing.group}
          exercises={data.exercises}
          onClose={() => setChoosing(null)}
          onPick={(id) => {
            setPicked((p) => ({ ...p, [normName(choosing.name)]: id }));
            if (id !== 'new') {
              remember(choosing.name, id);
              setAliases(readAliases());
            }
            setChoosing(null);
          }}
        />
      )}
    </Sheet>
  );
}

/** Another exercise for a written name: the closest ones, the whole base by search, or a new own one. */
function ChooseExercise({
  name,
  group,
  exercises,
  onClose,
  onPick,
}: {
  name: string;
  group?: string;
  exercises: Exercise[];
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const close = rankExercises(name, exercises, group, 6).map((m) => m.exercise);
  const s = searchKey(q.trim());
  const found = s ? exercises.filter((e) => searchKey(e.name + ' ' + e.muscleGroup).includes(s)).slice(0, 30) : close;
  return (
    <Sheet title={'«' + name + '»'} onClose={onClose}>
      <label className="search">
        <Search size={16} />
        <input id="text-workout-search" placeholder="Найти в базе" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="tw-choose">
        {found.map((e) => (
          <button key={e.id} type="button" className="btn btn-block tw-option" onClick={() => onPick(e.id)}>
            {e.name}
            <span className="muted small"> · {e.muscleGroup}</span>
          </button>
        ))}
        {!found.length && <p className="muted small">{s ? 'Ничего не нашлось.' : 'Похожих в базе нет — найдите по названию или добавьте новое.'}</p>}
        <button type="button" className="btn btn-block btn-quiet" onClick={() => onPick('new')}>
          Новое упражнение «{name}»
        </button>
      </div>
      <p className="muted small">Выбор запомнится: в следующий раз «{name}» сразу станет этим упражнением.</p>
    </Sheet>
  );
}
