import { useState } from 'react';
import { Plus, Search, Smartphone } from 'lucide-react';
import { api, inGym, readError } from '../transport';
import type { ClientItem } from '../types';
import { lastVisit, programsOf, visits30, type TrainerData } from './data';
import { Avatar, Empty, Sheet, ago } from './common';

type Filter = 'all' | 'gym' | 'noprogram' | 'archived';

export function Clients({ data, openClient }: { data: TrainerData; openClient: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [adding, setAdding] = useState(false);
  const list = data.clients
    .filter((c) => (filter === 'archived' ? c.archived : !c.archived))
    .filter((c) => filter !== 'gym' || inGym(c.checkedInAt))
    .filter((c) => filter !== 'noprogram' || programsOf(data.programs, c.clientId).length === 0)
    .filter((c) => c.clientName.toLowerCase().includes(q.trim().toLowerCase()))
    .sort(
      (a, b) =>
        Number(inGym(b.checkedInAt)) - Number(inGym(a.checkedInAt)) ||
        Number(!!b.needsReview) - Number(!!a.needsReview) ||
        a.clientName.localeCompare(b.clientName),
    );
  return (
    <div className="clients">
      <div className="section-head">
        <div>
          <h2>Клиенты</h2>
          <p className="muted">{data.clients.filter((c) => !c.archived).length} активных</p>
        </div>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>
          <Plus size={18} /> Клиент
        </button>
      </div>
      <label className="search">
        <Search size={16} />
        <input id="client-search" placeholder="Найти клиента" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="filters" role="group" aria-label="Фильтр">
        {(
          [
            ['all', 'Все'],
            ['gym', 'В зале'],
            ['noprogram', 'Без программы'],
            ['archived', 'Архив'],
          ] as [Filter, string][]
        ).map(([k, label]) => (
          <button key={k} className={'filter' + (filter === k ? ' on' : '')} onClick={() => setFilter(k)}>
            {label}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <Empty title="Никого не найдено" />
      ) : (
        <div className="client-list">
          {list.map((c) => {
            const here = inGym(c.checkedInAt);
            return (
              <div key={c.clientId} className={'client-row' + (here ? ' here' : '')}>
                <button className="client-open" onClick={() => openClient(c.clientId)}>
                  <Avatar name={c.clientName} live={here} avatar={c.avatar} />
                  <span className="grow">
                    <strong>
                      {c.clientName}
                      {c.userId ? <Smartphone size={13} className="muted inline-icon" aria-label="Пользуется приложением" /> : null}
                    </strong>
                    <span className="muted small">
                      {here ? 'В зале · ' : ''}
                      {ago(lastVisit(c))} · {visits30(c)} за 30 дн.
                    </span>
                  </span>
                  {c.needsReview && <span className="chip chip-info">новый результат</span>}
                  {(c.insights?.stalls.length || 0) > 0 && <span className="chip chip-warn">застой</span>}
                </button>
                {!c.archived && (
                  <button
                    className={'btn btn-sm presence' + (here ? ' on' : '')}
                    onClick={() => void data.setPresence(c, !here)}
                  >
                    {here ? 'Ушёл' : 'Пришёл'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {adding && (
        <AddClient
          onClose={() => setAdding(false)}
          onAdded={async (id) => {
            setAdding(false);
            await data.reload();
            openClient(id);
          }}
        />
      )}
    </div>
  );
}

function AddClient({ onClose, onAdded }: { onClose: () => void; onAdded: (id: string) => void }) {
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const add = async () => {
    if (!name.trim()) return setErr('Введите имя.');
    setBusy(true);
    try {
      const r = await api.post('/api/clients', { clientName: name.trim(), goal });
      onAdded(r.data.client.clientId);
    } catch (e) {
      setErr(readError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet title="Новый клиент" onClose={onClose}>
      <p className="muted small">
        Клиент появится сразу — записывать тренировки можно без приложения. Код для входа в приложение выдаётся в карточке клиента.
      </p>
      {err && <div className="alert">{err}</div>}
      <label className="field">
        <span>Имя</span>
        <input id="new-client-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Ольга" />
      </label>
      <label className="field">
        <span>Цель (необязательно)</span>
        <input id="new-client-goal" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Масса, рельеф, здоровая спина…" />
      </label>
      <button className="btn btn-primary btn-block" disabled={busy} onClick={add}>
        Добавить клиента
      </button>
    </Sheet>
  );
}
