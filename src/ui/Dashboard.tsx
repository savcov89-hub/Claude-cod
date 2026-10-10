import { ChevronRight } from 'lucide-react';
import { daysSince } from '../analytics';
import type { ClientItem } from '../types';
import { activeClients, lastVisit, presentClients, programsOf, visits30, type TrainerData } from './data';
import { useState } from 'react';
import { Avatar, AvatarPicker, Empty, ago, plural } from './common';

interface Flag {
  tone: 'good' | 'warn' | 'bad' | 'info';
  text: string;
}
function flagsOf(c: ClientItem, hasProgram: boolean): Flag[] {
  const out: Flag[] = [];
  const ins = c.insights;
  if (c.needsReview) out.push({ tone: 'info', text: 'Новый результат от клиента' });
  for (const d of ins?.drops || []) out.push({ tone: 'bad', text: '↓ ' + d.name + ' ' + d.pct + '%' });
  for (const s of ins?.stalls || []) out.push({ tone: 'warn', text: '■ Застой: ' + s.name + ' · ' + s.sessions + ' тр.' });
  const gap = daysSince(lastVisit(c));
  if (gap !== null && gap >= 7) out.push({ tone: 'warn', text: 'Не был ' + gap + ' ' + plural(gap, 'день', 'дня', 'дней') });
  if (!hasProgram) out.push({ tone: 'warn', text: 'Нет программы' });
  return out;
}

export function Dashboard({
  data,
  openClient,
  me,
  onPickAvatar,
}: {
  data: TrainerData;
  openClient: (id: string, tab?: string) => void;
  /** The trainer: own name and picture (tap to change it). */
  me?: { name: string; avatar?: string };
  onPickAvatar?: (avatar: string) => Promise<boolean>;
}) {
  const [picking, setPicking] = useState(false);
  const clients = activeClients(data.clients);
  if (!clients.length)
    return <Empty title="Пока нет клиентов" text="Добавьте первого клиента во вкладке «Клиенты»." />;
  const present = presentClients(data.clients);
  const week = clients.reduce(
    (n, c) => n + (c.visits || []).filter((d) => d >= new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)).length,
    0,
  );
  const reviews = clients.filter((c) => c.needsReview).length;
  const rows = clients
    .map((c) => ({ c, flags: flagsOf(c, programsOf(data.programs, c.clientId).length > 0) }))
    .filter((r) => r.flags.length)
    .sort((a, b) => {
      const w = (f: Flag[]) => f.reduce((n, x) => n + (x.tone === 'bad' ? 4 : x.tone === 'info' ? 3 : 1), 0);
      return w(b.flags) - w(a.flags);
    });
  const records = clients
    .flatMap((c) => (c.insights?.prs || []).map((p) => ({ c, p, at: c.insights?.lastSessionAt || '' })))
    .filter((r) => daysSince(r.at) !== null && daysSince(r.at)! <= 7)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8);

  return (
    <div className="dash">
      <div className="section-head">
        <div className="me">
          {me && (
            <button className="avatar-btn" aria-label="Моя аватарка" onClick={() => setPicking(true)}>
              <Avatar name={me.name} avatar={me.avatar} />
            </button>
          )}
          <div>
            <h2>Сводка</h2>
            <p className="muted">Что происходит с клиентами и на что обратить внимание.</p>
          </div>
        </div>
      </div>
      {picking && me && onPickAvatar && (
        <AvatarPicker
          title="Моя аватарка — её видят клиенты"
          name={me.name}
          current={me.avatar}
          onPick={async (a) => {
            if (await onPickAvatar(a)) setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
      <div className="kpis">
        <div className="kpi">
          <span>Сейчас в зале</span>
          <strong className="num tone-good">{present.length}</strong>
        </div>
        <div className="kpi">
          <span>Посещений за 7 дней</span>
          <strong className="num">{week}</strong>
        </div>
        <div className="kpi">
          <span>Новых результатов</span>
          <strong className="num tone-info">{reviews}</strong>
        </div>
        <div className="kpi">
          <span>Активных клиентов</span>
          <strong className="num">{clients.length}</strong>
        </div>
      </div>

      <section className="block">
        <h4>Требуют внимания</h4>
        {rows.length === 0 ? (
          <p className="muted">Всё спокойно: у всех рост, никто не пропадает.</p>
        ) : (
          <div className="attention">
            {rows.map(({ c, flags }) => (
              <button key={c.clientId} className="attention-row" onClick={() => openClient(c.clientId, c.needsReview ? 'history' : 'progress')}>
                <Avatar name={c.clientName} avatar={c.avatar} />
                <span className="grow">
                  <strong>{c.clientName}</strong>
                  <span className="flags">
                    {flags.map((f, i) => (
                      <span key={i} className={'chip chip-' + (f.tone === 'info' ? 'info' : f.tone)}>
                        {f.text}
                      </span>
                    ))}
                  </span>
                </span>
                <ChevronRight size={18} className="muted" />
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="block">
        <h4>Рекорды за неделю</h4>
        {records.length === 0 ? (
          <p className="muted">Рекордов пока нет.</p>
        ) : (
          <div className="records">
            {records.map(({ c, p }, i) => (
              <button key={i} className="record" onClick={() => openClient(c.clientId, 'progress')}>
                <span className="chip chip-good">★</span>
                <span className="grow">
                  <strong>{p.name}</strong>
                  <span className="muted small">{c.clientName}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="block">
        <h4>Посещаемость за 30 дней</h4>
        <div className="attendance-table">
          {[...clients]
            .sort((a, b) => visits30(b) - visits30(a))
            .map((c) => (
              <button key={c.clientId} className="att-row" onClick={() => openClient(c.clientId)}>
                <span className="grow">{c.clientName}</span>
                <span className="att-bar" aria-hidden="true">
                  <i style={{ width: Math.min(100, (visits30(c) / 16) * 100) + '%' }} />
                </span>
                <strong className="num">{visits30(c)}</strong>
                <span className="muted small att-ago">{ago(lastVisit(c))}</span>
              </button>
            ))}
        </div>
      </section>
    </div>
  );
}
