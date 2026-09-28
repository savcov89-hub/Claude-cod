import { useEffect, useState } from 'react';
import { ArrowLeft, Copy, Pencil, Plus, Smartphone, Archive, RotateCcw } from 'lucide-react';
import { api, inGym, readError } from '../transport';
import type { Program, Session } from '../types';
import { lastVisit, programsOf, visits30, type TrainerData } from './data';
import { Avatar, Confirm, Empty, VisitGrid, ago, fmtDate } from './common';
import { ProgressView } from './Progress';
import { HistoryList } from './History';
import { Journal } from './Journal';

type Tab = 'overview' | 'progress' | 'history' | 'programs';

export function ClientCard({
  data,
  clientId,
  initialTab = 'overview',
  onBack,
  openBuilder,
}: {
  data: TrainerData;
  clientId: string;
  initialTab?: string;
  onBack: () => void;
  openBuilder: (opts: { clientId: string; program?: Program; copy?: boolean }) => void;
}) {
  const client = data.clients.find((c) => c.clientId === clientId);
  const [tab, setTab] = useState<Tab>((initialTab as Tab) || 'overview');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [journal, setJournal] = useState<{ program: Program; dayId: string } | null>(null);

  const loadHistory = async () => {
    try {
      const r = await api.get('/api/client/' + clientId + '/history');
      setSessions(r.data.sessions);
    } catch (e) {
      setErr(readError(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, client?.latestSessionId]);

  if (!client) return <Empty title="Клиент не найден" action={<button className="btn" onClick={onBack}>Назад</button>} />;

  if (journal)
    return (
      <Journal
        source={{ trainerId: journal.program.trainerId, programId: journal.program.id, dayId: journal.dayId }}
        onBack={() => setJournal(null)}
        onDayChange={(dayId) => setJournal({ ...journal, dayId })}
        onCompleted={async () => {
          setJournal(null);
          await data.reload();
          await loadHistory();
          setTab('history');
        }}
      />
    );

  const here = inGym(client.checkedInAt);
  const review = async () => {
    try {
      await api.post('/api/client/' + clientId + '/review', { sessionId: client.latestSessionId });
      await data.reloadClients();
    } catch (e) {
      setErr(readError(e));
    }
  };

  return (
    <div className="card-screen">
      <div className="card-head">
        <button className="icon-btn" aria-label="Назад" onClick={onBack}>
          <ArrowLeft size={20} />
        </button>
        <Avatar name={client.clientName} live={here} />
        <div className="grow">
          <h2>{client.clientName}</h2>
          <span className="muted small">
            {here ? 'В зале · ' : ''}последний раз {ago(lastVisit(client))}
          </span>
        </div>
        {!client.archived && (
          <button className={'btn btn-sm presence' + (here ? ' on' : '')} onClick={() => void data.setPresence(client, !here)}>
            {here ? 'Ушёл' : 'Пришёл'}
          </button>
        )}
      </div>
      <nav className="subtabs" role="tablist">
        {(
          [
            ['overview', 'Обзор'],
            ['progress', 'Прогресс'],
            ['history', 'История'],
            ['programs', 'Программы'],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {label}
            {k === 'history' && client.needsReview && <i className="dot" aria-label="новый результат" />}
          </button>
        ))}
      </nav>
      {err && <div className="alert">{err}</div>}

      {tab === 'overview' && <Overview data={data} clientId={clientId} sessionsCount={sessions.length} />}
      {tab === 'progress' && (loading ? <div className="loader-block"><span className="loader" /></div> : <ProgressView sessions={sessions} />)}
      {tab === 'history' && (
        <>
          {client.needsReview && sessions.some((s) => s.id === client.latestSessionId) && (
            <div className="review-bar">
              <span>Клиент записал тренировку сам. Посмотрите результат.</span>
              <button className="btn btn-primary btn-sm" onClick={review}>
                Результаты проверены
              </button>
            </div>
          )}
          {loading ? <div className="loader-block"><span className="loader" /></div> : <HistoryList sessions={sessions} />}
        </>
      )}
      {tab === 'programs' && (
        <ClientPrograms
          data={data}
          clientId={clientId}
          onOpenDay={(program, dayId) => setJournal({ program, dayId })}
          openBuilder={openBuilder}
        />
      )}
    </div>
  );
}

function Overview({ data, clientId, sessionsCount }: { data: TrainerData; clientId: string; sessionsCount: number }) {
  const client = data.clients.find((c) => c.clientId === clientId)!;
  const [notes, setNotes] = useState({ goal: '', limits: '', notes: '', ...client.notes });
  const [saved, setSaved] = useState(true);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [confirmArchive, setConfirmArchive] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api.post('/api/client/' + clientId + '/update', { notes });
      setSaved(true);
      await data.reloadClients();
    } catch (e) {
      setErr(readError(e));
    } finally {
      setBusy(false);
    }
  };
  const invite = async () => {
    try {
      const r = await api.post('/api/invites', { clientId });
      setCode(r.data.code);
    } catch (e) {
      setErr(readError(e));
    }
  };
  const archive = async (archived: boolean) => {
    try {
      await api.post('/api/client/' + clientId + '/update', { archived });
      setConfirmArchive(false);
      await data.reloadClients();
    } catch (e) {
      setErr(readError(e));
    }
  };
  const field = (key: 'goal' | 'limits' | 'notes', label: string, placeholder: string, rows = 1) => (
    <label className="field">
      <span>{label}</span>
      <textarea
        id={'client-' + key}
        rows={rows}
        value={notes[key] || ''}
        placeholder={placeholder}
        onChange={(e) => {
          setNotes({ ...notes, [key]: e.target.value });
          setSaved(false);
        }}
      />
    </label>
  );
  const ins = client.insights;
  return (
    <div className="overview">
      {err && <div className="alert">{err}</div>}
      <div className="kpis">
        <div className="kpi">
          <span>Посещений за 30 дней</span>
          <strong className="num">{visits30(client)}</strong>
        </div>
        <div className="kpi">
          <span>Тренировок записано</span>
          <strong className="num">{sessionsCount}</strong>
        </div>
        <div className="kpi">
          <span>Рекордов в последней</span>
          <strong className="num tone-good">{ins?.prs.length || 0}</strong>
        </div>
        <div className="kpi">
          <span>Упражнений в застое</span>
          <strong className="num tone-warn">{ins?.stalls.length || 0}</strong>
        </div>
      </div>
      <section className="block">
        <h4>Посещения · 8 недель</h4>
        <VisitGrid visits={client.visits || []} />
      </section>
      <section className="block">
        <h4>Заметки тренера</h4>
        {field('goal', 'Цель', 'Масса, рельеф, сила, здоровая спина…')}
        {field('limits', 'Ограничения и травмы', 'Что нельзя или нужно делать осторожно', 2)}
        {field('notes', 'Заметки', 'Предпочтения, режим, питание…', 3)}
        <button className="btn btn-primary" disabled={saved || busy} onClick={save}>
          {saved ? 'Сохранено' : 'Сохранить заметки'}
        </button>
      </section>
      <section className="block">
        <h4>Приложение клиента</h4>
        {client.userId ? (
          <p className="muted">
            <Smartphone size={14} className="inline-icon" /> Подключён{client.clientEmail ? ' · ' + client.clientEmail : ''}. Клиент видит программу и может сам записывать подходы.
          </p>
        ) : code ? (
          <div className="invite">
            <span className="muted small">Код для входа в приложение:</span>
            <strong className="code num">{code}</strong>
            <span className="muted small">Клиент входит в приложение, выбирает «Я клиент» и вводит код. Вся история останется.</span>
          </div>
        ) : (
          <>
            <p className="muted">Клиент без приложения — тренировки записываете вы. Можно выдать код, чтобы он видел программу и прогресс.</p>
            <button className="btn" onClick={invite}>
              Выдать код подключения
            </button>
          </>
        )}
      </section>
      <section className="block">
        {confirmArchive ? (
          <Confirm
            text="Клиент пропадёт из списков и сводки. История и программы сохранятся, вернуть можно из архива."
            confirmLabel="В архив"
            onConfirm={() => archive(true)}
            onCancel={() => setConfirmArchive(false)}
          />
        ) : client.archived ? (
          <button className="btn" onClick={() => archive(false)}>
            <RotateCcw size={16} /> Вернуть из архива
          </button>
        ) : (
          <button className="btn btn-quiet" onClick={() => setConfirmArchive(true)}>
            <Archive size={16} /> Перенести клиента в архив
          </button>
        )}
      </section>
    </div>
  );
}

function ClientPrograms({
  data,
  clientId,
  onOpenDay,
  openBuilder,
}: {
  data: TrainerData;
  clientId: string;
  onOpenDay: (p: Program, dayId: string) => void;
  openBuilder: (opts: { clientId: string; program?: Program; copy?: boolean }) => void;
}) {
  const [showArchived, setShowArchived] = useState(false);
  const all = data.programs.filter((p) => p.clientId === clientId);
  const list = showArchived ? all.filter((p) => p.archived) : programsOf(data.programs, clientId);
  return (
    <div className="client-programs">
      <div className="row gap wrap">
        <button className="btn btn-primary" onClick={() => openBuilder({ clientId })}>
          <Plus size={16} /> Новая программа
        </button>
        {all.some((p) => p.archived) && (
          <button className="btn btn-quiet" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? 'Активные' : 'Архив программ'}
          </button>
        )}
      </div>
      {list.length === 0 && <Empty title={showArchived ? 'Архив пуст' : 'Программа не назначена'} />}
      {list.map((p) => (
        <ProgramCard key={p.id} program={p} data={data} onOpenDay={onOpenDay} openBuilder={openBuilder} />
      ))}
    </div>
  );
}

export function ProgramCard({
  program: p,
  data,
  onOpenDay,
  openBuilder,
  showClient = false,
}: {
  program: Program;
  data: TrainerData;
  onOpenDay?: (p: Program, dayId: string) => void;
  openBuilder: (opts: { clientId: string; program?: Program; copy?: boolean }) => void;
  showClient?: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const archive = async (archived: boolean) => {
    try {
      await api.post('/api/programs/' + p.id + '/archive', { archived });
      await data.reload();
    } catch (e) {
      setErr(readError(e));
    }
  };
  const next = p.days.find((d) => d.id === p.nextDayId) || p.days[0];
  return (
    <article className={'program' + (p.archived ? ' archived' : '')}>
      <header>
        <div className="grow">
          {showClient && <span className="eyebrow">{p.clientName}</span>}
          <h3>{p.name}</h3>
          <span className="muted small">
            {p.days.length} {p.days.length === 1 ? 'тренировка' : p.days.length < 5 ? 'тренировки' : 'тренировок'} · следующая: {next?.name}
            {p.lastCompletedAt ? ' · последняя ' + fmtDate(p.lastCompletedAt) : ''}
          </span>
        </div>
      </header>
      {err && <div className="alert">{err}</div>}
      <div className="days">
        {p.days.map((d) => (
          <div key={d.id} className={'day' + (open === d.id ? ' open' : '')}>
            <button className="day-head" onClick={() => setOpen(open === d.id ? null : d.id)} aria-expanded={open === d.id}>
              <strong>{d.name}</strong>
              {d.id === next?.id && <span className="chip chip-info">по плану</span>}
              <span className="muted small grow-right">{d.exercises.length} упр.</span>
            </button>
            {open === d.id && (
              <div className="day-body">
                <table className="plan-table">
                  <tbody>
                    {d.exercises.map((e) => (
                      <tr key={e.exerciseId}>
                        <td>{e.exerciseName}</td>
                        <td className="num">
                          {e.sets}×{e.repMin}–{e.repMax}
                        </td>
                        <td className="num muted">RIR {e.targetRir}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {onOpenDay && !p.archived && (
                  <button className="btn btn-primary btn-block" onClick={() => onOpenDay(p, d.id)}>
                    Открыть журнал · {d.name}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <footer className="row gap wrap">
        {!p.archived && (
          <button className="btn btn-sm" onClick={() => openBuilder({ clientId: p.clientId, program: p })}>
            <Pencil size={15} /> Изменить
          </button>
        )}
        <button className="btn btn-sm" onClick={() => openBuilder({ clientId: p.clientId, program: p, copy: true })}>
          <Copy size={15} /> Копировать
        </button>
        <button className="btn btn-sm btn-quiet" onClick={() => archive(!p.archived)}>
          {p.archived ? <RotateCcw size={15} /> : <Archive size={15} />} {p.archived ? 'Вернуть' : 'В архив'}
        </button>
      </footer>
    </article>
  );
}
