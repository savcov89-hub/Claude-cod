import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import type { Program } from '../types';
import type { TrainerData } from './data';
import { Empty } from './common';
import { ProgramCard } from './ClientCard';

export function Programs({
  data,
  openBuilder,
}: {
  data: TrainerData;
  openBuilder: (opts: { clientId?: string; program?: Program; copy?: boolean }) => void;
}) {
  const [q, setQ] = useState('');
  const [archived, setArchived] = useState(false);
  const list = data.programs
    .filter((p) => !!p.archived === archived)
    .filter((p) => (p.name + ' ' + p.clientName).toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="programs">
      <div className="section-head">
        <div>
          <h2>Программы</h2>
          <p className="muted">Изменяйте, копируйте другому клиенту, убирайте в архив.</p>
        </div>
        <button className="btn btn-primary" disabled={!data.clients.some((c) => !c.archived)} onClick={() => openBuilder({})}>
          <Plus size={18} /> Программа
        </button>
      </div>
      <label className="search">
        <Search size={16} />
        <input id="program-search" placeholder="Программа или клиент" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="filters">
        <button className={'filter' + (!archived ? ' on' : '')} onClick={() => setArchived(false)}>
          Активные
        </button>
        <button className={'filter' + (archived ? ' on' : '')} onClick={() => setArchived(true)}>
          Архив
        </button>
      </div>
      {list.length === 0 ? (
        <Empty title={archived ? 'Архив пуст' : 'Программ пока нет'} text={archived ? undefined : 'Создайте программу из шаблона или с нуля.'} />
      ) : (
        <div className="program-list">
          {list.map((p) => (
            <ProgramCard key={p.id} program={p} data={data} openBuilder={openBuilder} showClient />
          ))}
        </div>
      )}
    </div>
  );
}
