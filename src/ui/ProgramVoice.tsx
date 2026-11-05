// «Правка голосом»: a saved program changed by words — «первые 4 упражнения по 3 подхода, остальные по 1».
// The model returns the program changed (POST /api/ai/program, backend/aiWorkout.ts); the trainer sees what changed,
// can say another change on top, and saves it as the editor does (POST /api/programs/:id, merged with the gym's edits).
import { useState } from 'react';
import { Mic, Sparkles, Square } from 'lucide-react';
import { api, readError } from '../transport';
import { localDate } from '../clock';
import type { Program, ProgramDay } from '../types';
import { guessEquipment, guessGroup } from '../exerciseMatch';
import { Sheet, plural } from './common';
import type { TrainerData } from './data';
import { useDictation } from './TextWorkout';

interface Edit {
  summary: string;
  perWeek: number | null;
  days: Array<{
    id: string;
    name: string;
    exercises: Array<{ exerciseId: string; exerciseName: string; sets: number; repMin: number; repMax: number; targetRir: number }>;
  }>;
}

const rx = (e: { sets: number; repMin: number; repMax: number }) => `${e.sets}×${e.repMin === e.repMax ? e.repMin : e.repMin + '–' + e.repMax}`;
const newId = () => 'day-' + (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36));

export function ProgramVoice({
  program,
  data,
  onClose,
  onSaved,
}: {
  program: Program;
  data: TrainerData;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [said, setSaid] = useState('');
  const dictation = useDictation((line) => setSaid((t) => (t.trim() ? t.replace(/\s*$/, '') + ' ' : '') + line));
  // The program as changed so far (each change goes on top of the one before), and what was said.
  const [edit, setEdit] = useState<Edit | null>(null);
  const [told, setTold] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [err, setErr] = useState('');
  const shown: Edit['days'] = edit?.days || program.days;

  const apply = async () => {
    setBusy(true);
    setAsking(true);
    setErr('');
    try {
      const r = await api.post('/api/ai/program', { programId: program.id, text: said, today: localDate(), days: shown });
      setEdit({ ...r.data.edit, perWeek: r.data.edit.perWeek ?? edit?.perWeek ?? null });
      setTold((t) => [...t, said.trim()]);
      setSaid('');
    } catch (e) {
      setErr(readError(e));
    } finally {
      setBusy(false);
      setAsking(false);
    }
  };

  const save = async () => {
    if (!edit) return;
    setBusy(true);
    setErr('');
    try {
      // Names the base does not have become the trainer's own exercises.
      const made: Record<string, string> = {};
      for (const e of edit.days.flatMap((d) => d.exercises).filter((x) => !x.exerciseId)) {
        if (made[e.exerciseName]) continue;
        const r = await api.post('/api/exercises', {
          name: e.exerciseName,
          muscleGroup: guessGroup(e.exerciseName),
          equipment: guessEquipment(e.exerciseName, false),
        });
        made[e.exerciseName] = r.data.exercise.id;
      }
      const musclesOf = (id: string) => program.days.flatMap((d) => d.exercises).find((x) => x.exerciseId === id)?.muscles;
      const days: ProgramDay[] = edit.days.map((d) => ({
        id: d.id || newId(),
        name: d.name,
        exercises: d.exercises.map((e) => {
          const exerciseId = e.exerciseId || made[e.exerciseName];
          const muscles = musclesOf(exerciseId);
          return {
            exerciseId,
            exerciseName: e.exerciseName,
            sets: e.sets,
            repMin: e.repMin,
            repMax: e.repMax,
            targetRir: e.targetRir,
            ...(muscles ? { muscles } : {}),
          };
        }),
      }));
      const r = await api.post('/api/programs/' + encodeURIComponent(program.id), {
        name: program.name,
        days,
        // Changed in the gym meanwhile: these edits go on top of it, as from the editor.
        base: { updatedAt: program.updatedAt || program.createdAt, days: program.days },
        ...(edit.perWeek ? { perWeek: edit.perWeek } : {}),
      });
      await data.reload();
      onSaved(`Программа «${program.name}» изменена${r.data.merged ? ' (с правками из зала)' : ''}: ${edit.summary || told.join('; ')}`);
    } catch (e) {
      setErr(readError(e));
    } finally {
      setBusy(false);
    }
  };

  const oldDay = (id: string) => program.days.find((d) => d.id === id);
  const goneDays = edit ? program.days.filter((d) => !edit.days.some((x) => x.id === d.id)) : [];

  return (
    <Sheet title={'Изменить «' + program.name + '»'} onClose={onClose} wide>
      <div className="text-workout">
        <label className="field">
          <span>Скажите или напишите, что изменить</span>
          <textarea
            id="program-voice-input"
            rows={3}
            value={said}
            placeholder="Первые 4 упражнения по 3 подхода, остальные по 1. Жим ногами заменить на гакк-присед"
            onChange={(e) => setSaid(e.target.value)}
          />
        </label>
        <div className="row gap wrap">
          {dictation.supported && (
            <button type="button" className={'btn' + (dictation.listening ? ' btn-primary' : '')} onClick={dictation.listening ? dictation.stop : dictation.start}>
              {dictation.listening ? <Square size={16} /> : <Mic size={16} />} {dictation.listening ? 'Стоп' : 'Голосом'}
            </button>
          )}
          <button id="program-voice-apply" type="button" className="btn btn-primary" disabled={busy || !said.trim()} onClick={() => void apply()}>
            <Sparkles size={16} /> {asking ? 'Нейросеть меняет…' : edit ? 'Ещё правка' : 'Применить'}
          </button>
          {edit && (
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => {
                setEdit(null);
                setTold([]);
              }}
            >
              Отменить правки
            </button>
          )}
        </div>
        {!dictation.supported && <span className="muted small">Голосом — кнопка микрофона на клавиатуре телефона.</span>}
        {dictation.listening && <p className="muted small">Слушаю… {dictation.heard && <i>«{dictation.heard}»</i>}</p>}
        {(dictation.err || err) && <div className="alert">{dictation.err || err}</div>}

        {edit && (
          <>
            <p className="small">
              <strong>{edit.summary || 'Изменено.'}</strong>
              {edit.perWeek && edit.perWeek !== program.perWeek ? ` ${edit.perWeek} ${plural(edit.perWeek, 'раз', 'раза', 'раз')} в неделю.` : ''}
            </p>
            <div className="tw-preview" aria-label="Программа после правки">
              {edit.days.map((d, di) => {
                const before = oldDay(d.id);
                const gone = (before?.exercises || []).filter((x) => !d.exercises.some((e) => e.exerciseId === x.exerciseId));
                return (
                  <div key={di} className="tw-workout">
                    <div className="tw-date">
                      <strong>{d.name}</strong> {!before && <span className="chip chip-info">новая тренировка</span>}
                    </div>
                    {d.exercises.map((e, ei) => {
                      const was = before?.exercises.find((x) => x.exerciseId === e.exerciseId && !!e.exerciseId);
                      const changed = was && (rx(was) !== rx(e) || was.targetRir !== e.targetRir);
                      return (
                        <div key={ei} className="tw-row">
                          <span className="tw-name">
                            <strong>{e.exerciseName}</strong>
                            {!e.exerciseId ? (
                              <span className="chip chip-info">новое в базе</span>
                            ) : !was && before ? (
                              <span className="chip chip-info">добавлено</span>
                            ) : changed ? (
                              <span className="chip chip-warn">изменено</span>
                            ) : null}
                          </span>
                          <span className="tw-sets small">
                            {changed ? `${rx(was!)} → ` : ''}
                            {rx(e)} · RIR {e.targetRir}
                          </span>
                        </div>
                      );
                    })}
                    {gone.length > 0 && <p className="muted small">Убрано: {gone.map((x) => x.exerciseName).join(', ')}</p>}
                  </div>
                );
              })}
              {goneDays.length > 0 && <p className="muted small">Убраны тренировки: {goneDays.map((d) => '«' + d.name + '»').join(', ')}</p>}
            </div>
            <button id="program-voice-save" className="btn btn-primary btn-block" disabled={busy} onClick={() => void save()}>
              {busy ? 'Сохраняем…' : 'Сохранить программу'}
            </button>
          </>
        )}
        {!edit && (
          <p className="muted small">
            Нейросеть изменит программу и покажет, что поменялось, — сохраните, если всё верно. Можно несколько правок подряд.
          </p>
        )}
      </div>
    </Sheet>
  );
}
