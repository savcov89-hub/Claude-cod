import { Fragment, useMemo, useState } from 'react';
import { Image as ImageIcon, Pencil, Plus, Search } from 'lucide-react';
import { EQUIPMENT_TYPES, unitNote } from '../analytics';
import { api, readError } from '../transport';
import { exerciseRules, groupMuscles } from '../trainingRules';
import { exerciseLoad, loadText, ownLoad } from '../volume';
import type { Exercise } from '../types';
import { Sheet, searchKey } from './common';
import { ArtPicker, ExerciseFigures, ExerciseThumb } from './exerciseArt';
import { MuscleChips } from './Volume';

const ownText = (e: Exercise) => loadText(ownLoad(e.muscles?.length ? e.muscles : groupMuscles(e.muscleGroup)));

export function Library({ exercises, onCreated }: { exercises: Exercise[]; onCreated: () => Promise<void> }) {
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  // Picking another drawing (icon and movement) for this exercise.
  const [artFor, setArtFor] = useState<Exercise | null>(null);
  const list = useMemo(() => {
    const s = searchKey(q.trim());
    return exercises.filter((e) => !s || searchKey(e.name + ' ' + e.muscleGroup + ' ' + e.equipment).includes(s));
  }, [exercises, q]);
  return (
    <div className="library">
      <div className="section-head">
        <div>
          <h2>База упражнений</h2>
          <p className="muted">{exercises.length} упражнений · общая база и ваши</p>
        </div>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>
          <Plus size={18} /> Своё
        </button>
      </div>
      <label className="search">
        <Search size={16} />
        <input id="library-search" placeholder="Название, мышца, оборудование" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="lib-list">
        {list.map((e) => {
          const info = exerciseRules[e.id];
          const unit = unitNote({ exerciseId: e.id, exerciseName: e.name, equipment: e.equipment });
          return (
            <Fragment key={e.id}>
              <button className={'lib-item' + (open === e.id ? ' open' : '')} onClick={() => setOpen(open === e.id ? null : e.id)}>
                <ExerciseThumb exercise={e} size={44} />
                <span className="grow">
                  <strong>{e.name}</strong>
                  <span className="muted small">
                    {e.muscleGroup} · {e.equipment}
                    {unit && ' · ' + unit}
                  </span>
                  {open === e.id && info && (
                    <span className="lib-detail small">
                      <b>{info.position}.</b> {info.note}
                      <br />
                      Один подход в объёме недели: {loadText(exerciseLoad(e.id))}
                    </span>
                  )}
                  {open === e.id && !info && (
                    <span className="lib-detail small">
                      {ownText(e) ? 'Один подход в объёме недели: ' + ownText(e) : 'Мышцы не указаны — упражнение не попадёт в объём недели. Укажите их в «Изменить».'}
                    </span>
                  )}
                </span>
                {e.custom && <span className="chip chip-info">моё</span>}
              </button>
              {open === e.id && (
                <div className="lib-figures">
                  <ExerciseFigures exercise={e} />
                </div>
              )}
              {open === e.id && (
                <div className="lib-actions">
                  <button className="btn btn-quiet btn-sm" onClick={() => setArtFor(e)}>
                    <ImageIcon size={14} /> Сменить картинку
                  </button>
                  {e.custom && (
                    <button className="btn btn-quiet btn-sm" onClick={() => setEditing(e)}>
                      <Pencil size={14} /> Изменить
                    </button>
                  )}
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
      {artFor && (
        <ArtPicker
          exercise={artFor}
          name={artFor.name}
          onClose={() => setArtFor(null)}
          onSaved={async () => {
            setArtFor(null);
            await onCreated();
          }}
        />
      )}
      {adding && <AddExercise onClose={() => setAdding(false)} onCreated={async () => { setAdding(false); await onCreated(); }} />}
      {editing && (
        <AddExercise
          exercise={editing}
          onClose={() => setEditing(null)}
          onCreated={async () => {
            setEditing(null);
            await onCreated();
          }}
        />
      )}
    </div>
  );
}

/** Creates an own exercise, or edits one when `exercise` is given. */
export function AddExercise({
  exercise,
  initialName = '',
  initialGroup = '',
  onClose,
  onCreated,
}: {
  exercise?: Exercise;
  initialName?: string;
  initialGroup?: string;
  onClose: () => void;
  onCreated: (exercise: Exercise) => void | Promise<void>;
}) {
  const [name, setName] = useState(exercise?.name ?? initialName);
  const [group, setGroup] = useState(exercise?.muscleGroup ?? initialGroup);
  const [busy, setBusy] = useState(false);
  const [equipment, setEquipment] = useState(
    EQUIPMENT_TYPES.some((t) => t.value === exercise?.equipment) ? exercise!.equipment : '',
  );
  const [muscles, setMuscles] = useState<string[]>(exercise?.muscles || []);
  const [err, setErr] = useState('');
  const add = async () => {
    if (!name.trim()) return setErr('Введите название.');
    if (!equipment) return setErr('Выберите, на чём выполняется: от этого зависит, вес в плитках или в кг.');
    setBusy(true);
    try {
      const body = { name: name.trim(), muscleGroup: group.trim(), equipment, muscles };
      const r = await api.post(exercise ? '/api/exercises/' + encodeURIComponent(exercise.id) : '/api/exercises', body);
      await onCreated(r.data.exercise as Exercise);
    } catch (e) {
      setErr(readError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet title={exercise ? 'Изменить упражнение' : 'Новое упражнение'} onClose={onClose}>
      {err && <div className="alert">{err}</div>}
      <label className="field">
        <span>Название</span>
        <input id="ex-name" autoFocus={!initialName} value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, тяга Хаммера" />
      </label>
      <label className="field">
        <span>Группа</span>
        <input id="ex-group" value={group} onChange={(e) => setGroup(e.target.value)} placeholder="Спина" />
      </label>
      <div className="field">
        <span>На чём выполняется</span>
        <div className="equip-types" id="ex-equipment">
          {EQUIPMENT_TYPES.map((t) => (
            <button key={t.value} className={'filter' + (equipment === t.value ? ' on' : '')} onClick={() => { setEquipment(t.value); setErr(''); }}>
              {t.label}
              <small>{t.unit}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Мышцы для объёма недели: нажатие — основная работа (1 подход), ещё раз — участие (½)</span>
        <MuscleChips value={muscles} onChange={setMuscles} />
      </div>
      <button className="btn btn-primary btn-block" disabled={busy} onClick={add}>
        {busy ? 'Сохраняем…' : exercise ? 'Сохранить' : 'Добавить в базу'}
      </button>
    </Sheet>
  );
}
