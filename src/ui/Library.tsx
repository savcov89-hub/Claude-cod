import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { api, readError } from '../transport';
import { exerciseRules, muscleNames } from '../trainingRules';
import type { Exercise } from '../types';
import { Sheet } from './common';

export function Library({ exercises, onCreated }: { exercises: Exercise[]; onCreated: () => Promise<void> }) {
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return exercises.filter((e) => !s || (e.name + ' ' + e.muscleGroup + ' ' + e.equipment).toLowerCase().includes(s));
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
          return (
            <button key={e.id} className={'lib-item' + (open === e.id ? ' open' : '')} onClick={() => setOpen(open === e.id ? null : e.id)}>
              <span className="grow">
                <strong>{e.name}</strong>
                <span className="muted small">
                  {e.muscleGroup} · {e.equipment}
                </span>
                {open === e.id && info && (
                  <span className="lib-detail small">
                    <b>{info.position}.</b> {info.note}
                    <br />
                    Основные: {info.primary.map((m) => muscleNames[m]).join(', ')}
                    {info.secondary.length ? ' · косвенно: ' + info.secondary.map((m) => muscleNames[m]).join(', ') : ''}
                  </span>
                )}
              </span>
              {e.custom && <span className="chip chip-info">моё</span>}
            </button>
          );
        })}
      </div>
      {adding && <AddExercise onClose={() => setAdding(false)} onCreated={async () => { setAdding(false); await onCreated(); }} />}
    </div>
  );
}

function AddExercise({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [group, setGroup] = useState('');
  const [equipment, setEquipment] = useState('');
  const [muscles, setMuscles] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const add = async () => {
    if (!name.trim()) return setErr('Введите название.');
    try {
      await api.post('/api/exercises', { name, muscleGroup: group, equipment, muscles });
      await onCreated();
    } catch (e) {
      setErr(readError(e));
    }
  };
  return (
    <Sheet title="Новое упражнение" onClose={onClose}>
      {err && <div className="alert">{err}</div>}
      <label className="field">
        <span>Название</span>
        <input id="ex-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, тяга Хаммера" />
      </label>
      <div className="builder-grid">
        <label className="field">
          <span>Группа</span>
          <input id="ex-group" value={group} onChange={(e) => setGroup(e.target.value)} placeholder="Спина" />
        </label>
        <label className="field">
          <span>Оборудование</span>
          <input id="ex-equipment" value={equipment} onChange={(e) => setEquipment(e.target.value)} placeholder="Тренажёр" />
        </label>
      </div>
      <div className="field">
        <span>Основные мышцы — для подсчёта объёма</span>
        <div className="chips">
          {Object.entries(muscleNames).map(([k, label]) => (
            <button
              key={k}
              className={'filter' + (muscles.includes(k) ? ' on' : '')}
              onClick={() => setMuscles(muscles.includes(k) ? muscles.filter((m) => m !== k) : [...muscles, k])}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <button className="btn btn-primary btn-block" onClick={add}>
        Добавить в базу
      </button>
    </Sheet>
  );
}
