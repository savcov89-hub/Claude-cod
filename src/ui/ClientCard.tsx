import { useEffect, useState } from 'react';
import { ArrowLeft, Clipboard, Copy, Pencil, Plus, Smartphone, Archive, RotateCcw, Share2 } from 'lucide-react';
import { api, inGym, readError } from '../transport';
import { inviteLink } from '../invite';
import type { OpenWorkout, Program, Session } from '../types';
import { activeClients, lastVisit, programsOf, visits30, type TrainerData } from './data';
import { Avatar, Confirm, Empty, Sheet, VisitGrid, ago, fmtDate, fmtDateTime } from './common';
import { ProgressView } from './Progress';
import { HistoryList } from './History';
import { BodyView } from './Body';
import { AUTO_FINISH_IDLE_MS, Journal } from './Journal';
import { AVATARS, AvatarArt } from './avatars';
import { RecordsSheet } from './Records';
import { copyLater, programText } from './programText';
import type { PersonalRecord } from '../analytics';

type Tab = 'overview' | 'progress' | 'history' | 'body' | 'programs';

export function ClientCard({
  data,
  clientId,
  initialTab = 'overview',
  onBack,
  openBuilder,
  onTabChange,
  openInGym,
}: {
  data: TrainerData;
  clientId: string;
  initialTab?: string;
  onTabChange?: (tab: string) => void;
  onBack: () => void;
  /**
   * An unfinished workout under way goes to the client's tab in the gym (checked in if needed), among everyone there.
   * One left from an earlier visit (no sets for over an hour, the client not here) opens right in the card: it is
   * not a visit today.
   */
  openInGym?: (workout: OpenWorkout) => void;
  openBuilder: (opts: { clientId: string; program?: Program; copy?: boolean }) => void;
}) {
  const client = data.clients.find((c) => c.clientId === clientId);
  const [tab, setTabState] = useState<Tab>((initialTab as Tab) || 'overview');
  const setTab = (t: Tab) => {
    setTabState(t);
    onTabChange?.(t);
  };
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [journal, setJournal] = useState<{ trainerId: string; programId: string; dayId: string } | null>(null);
  // Started and not finished (e.g. a free workout left when the app was closed): offered to open and finish.
  const [open, setOpen] = useState<OpenWorkout[]>([]);
  // Renaming: the new name while the field is open.
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);
  const [pickingAvatar, setPickingAvatar] = useState(false);
  const [newRecords, setNewRecords] = useState<PersonalRecord[] | null>(null);
  const chooseAvatar = async (avatar: string) => {
    try {
      await api.post('/api/client/' + clientId + '/update', { avatar });
      await data.reloadClients();
      setPickingAvatar(false);
    } catch (e) {
      setErr(readError(e));
    }
  };

  const loadHistory = async () => {
    try {
      const r = await api.get('/api/client/' + clientId + '/history');
      setSessions(r.data.sessions);
      setOpen(r.data.open || []);
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

  /** Left from an earlier visit: the client is not here and nothing was recorded for over an hour. */
  const leftBehind = (w: OpenWorkout) => !inGym(client?.checkedInAt) && Date.now() - Date.parse(w.updatedAt) > AUTO_FINISH_IDLE_MS;
  if (journal)
    return (
      <Journal
        source={journal}
        onBack={() => {
          setJournal(null);
          void loadHistory();
        }}
        onDayChange={(dayId) => setJournal({ ...journal, dayId })}
        onProgramChanged={() => void data.reload()}
        onCompleted={async ({ records }) => {
          setJournal(null);
          if (records?.length) setNewRecords(records);
          await data.reload();
          await loadHistory();
          setTab('history');
        }}
      />
    );

  const here = inGym(client.checkedInAt);
  const rename = async () => {
    const name = (renaming || '').trim();
    if (!name) return;
    if (name === client.clientName) return setRenaming(null);
    setRenameBusy(true);
    try {
      await api.post('/api/client/' + clientId + '/update', { clientName: name });
      await data.reload();
      setRenaming(null);
    } catch (e) {
      setErr(readError(e));
    } finally {
      setRenameBusy(false);
    }
  };
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
        <button className="avatar-btn" aria-label="Выбрать аватарку" onClick={() => setPickingAvatar(true)}>
          <Avatar name={client.clientName} live={here} avatar={client.avatar} />
        </button>
        <div className="grow">
          <h2 className="client-name">
            <span className="client-name-text">{client.clientName}</span>
            {renaming === null && (
              <button className="icon-btn sm" aria-label="Изменить имя" onClick={() => setRenaming(client.clientName)}>
                <Pencil size={15} />
              </button>
            )}
          </h2>
          <span className="muted small">
            {here ? 'В зале · ' : ''}последний раз {ago(lastVisit(client))}
          </span>
        </div>
        {!client.archived && renaming === null && (
          <button className={'btn btn-sm presence' + (here ? ' on' : '')} onClick={() => void data.setPresence(client, !here)}>
            {here ? 'Ушёл' : 'Пришёл'}
          </button>
        )}
      </div>
      {newRecords && <RecordsSheet records={newRecords} onClose={() => setNewRecords(null)} />}
      {pickingAvatar && (
        <Sheet title="Аватарка" onClose={() => setPickingAvatar(false)}>
          <div className="avatar-grid">
            <button className={'avatar-choice' + (!client.avatar ? ' on' : '')} aria-label="Буква имени" onClick={() => void chooseAvatar('')}>
              <span className="avatar avatar-letter">{client.clientName.slice(0, 1).toUpperCase()}</span>
            </button>
            {AVATARS.map((a) => (
              <button
                key={a.id}
                className={'avatar-choice' + (client.avatar === a.id ? ' on' : '')}
                aria-label={a.label}
                onClick={() => void chooseAvatar(a.id)}
              >
                <AvatarArt id={a.id} size={60} />
              </button>
            ))}
          </div>
        </Sheet>
      )}
      {renaming !== null && (
        <form
          className="rename-form"
          onSubmit={(e) => {
            e.preventDefault();
            void rename();
          }}
        >
          <label className="field">
            <span>Имя клиента</span>
            <input id="client-rename" autoFocus maxLength={80} value={renaming} onChange={(e) => setRenaming(e.target.value)} />
          </label>
          <div className="rename-actions">
            <button className="btn" type="button" onClick={() => setRenaming(null)}>
              Отмена
            </button>
            <button className="btn btn-primary" disabled={renameBusy || !renaming.trim()} type="submit">
              {renameBusy ? 'Сохраняем…' : 'Сохранить'}
            </button>
          </div>
        </form>
      )}
      <nav className="subtabs" role="tablist">
        {(
          [
            ['overview', 'Обзор'],
            ['programs', 'Программы'],
            ['body', 'Замеры'],
            ['history', 'История'],
            ['progress', 'Прогресс'],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {label}
            {k === 'history' && client.needsReview && <i className="dot" aria-label="новый результат" />}
          </button>
        ))}
      </nav>
      {err && <div className="alert">{err}</div>}
      {open.map((w) => (
        <div className="review-bar" key={w.programId + '/' + w.dayId}>
          <span>
            Не завершена: <strong>{w.free ? 'свободная тренировка' : w.dayName}</strong> от {fmtDateTime(w.updatedAt)}, {w.done} подх.
          </span>
          <button
            className="btn btn-primary btn-sm"
            onClick={() =>
              openInGym && !leftBehind(w) ? openInGym(w) : setJournal({ trainerId: w.trainerId, programId: w.programId, dayId: w.dayId })
            }
          >
            Открыть
          </button>
        </div>
      ))}

      {tab === 'overview' && <Overview data={data} clientId={clientId} sessionsCount={sessions.length} />}
      {tab === 'progress' && (loading ? <div className="loader-block"><span className="loader" /></div> : <ProgressView sessions={sessions} programs={data.programs.filter((p) => p.clientId === clientId)} exercises={data.exercises} />)}
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
          {loading ? <div className="loader-block"><span className="loader" /></div> : <HistoryList
              sessions={sessions}
              programs={data.programs.filter((p) => p.clientId === clientId)}
              exercises={data.exercises}
              onDelete={async (sessionId) => {
                await api.post('/api/client/' + encodeURIComponent(clientId) + '/sessions/' + encodeURIComponent(sessionId) + '/delete', {});
                await loadHistory();
                await data.reload();
              }}
            />}
        </>
      )}
      {tab === 'body' && <BodyView clientId={clientId} />}
      {tab === 'programs' && (
        <ClientPrograms
          data={data}
          clientId={clientId}
          onOpenDay={(program, dayId) => setJournal({ trainerId: program.trainerId, programId: program.id, dayId })}
          openBuilder={openBuilder}
        />
      )}
    </div>
  );
}

/** Easy to read out and type on a phone: no 0/O, 1/l. */
const newPassword = () => {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 8 }, () => abc[Math.floor(Math.random() * abc.length)]).join('');
};

function Overview({ data, clientId, sessionsCount }: { data: TrainerData; clientId: string; sessionsCount: number }) {
  const client = data.clients.find((c) => c.clientId === clientId)!;
  const [notes, setNotes] = useState({ goal: '', limits: '', notes: '', ...client.notes });
  const [saved, setSaved] = useState(true);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [shared, setShared] = useState('');
  // Sign-in made by the trainer: email + password, no email needed.
  const [login, setLogin] = useState<{ email: string; password: string } | null>(null);
  const [made, setMade] = useState<{ email: string; password: string } | null>(null);
  const makeLogin = async () => {
    if (!login) return;
    setBusy(true);
    setErr('');
    try {
      const r = await api.post('/api/client/' + clientId + '/login', login);
      setMade(r.data);
      setLogin(null);
      await data.reloadClients();
    } catch (e) {
      setErr(readError(e));
    } finally {
      setBusy(false);
    }
  };
  const shareLogin = async (m: { email: string; password: string }) => {
    const text = `${client.clientName}, ваш дневник тренировок: ${location.origin + location.pathname}\nПочта: ${m.email}\nПароль: ${m.password}\nПароль можно сменить в приложении (значок ключа).`;
    try {
      if (navigator.share) await navigator.share({ title: 'Вход в дневник тренировок', text });
      else {
        await navigator.clipboard.writeText(text);
        setShared('Скопировано');
      }
    } catch {
      /* closed the share sheet */
    }
  };
  const shareInvite = async (c: string, clientName: string) => {
    const url = inviteLink(c);
    const text = `${clientName}, ваш дневник тренировок: откройте ссылку и войдите по почте — подключение произойдёт само.`;
    try {
      if (navigator.share) await navigator.share({ title: 'Приглашение в дневник тренировок', text, url });
      else {
        await navigator.clipboard.writeText(text + ' ' + url);
        setShared('Ссылка скопирована');
      }
    } catch {
      /* closed the share sheet */
    }
  };
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
        {made ? (
          <div className="invite">
            <span className="muted small">Вход создан — письма не нужны. Отправьте клиенту:</span>
            <strong>{made.email}</strong>
            <strong className="code num">{made.password}</strong>
            <button className="btn btn-primary btn-block" onClick={() => void shareLogin(made)}>
              <Share2 size={16} /> {shared || 'Отправить данные для входа'}
            </button>
          </div>
        ) : client.userId ? (
          <p className="muted">
            <Smartphone size={14} className="inline-icon" /> Подключён{client.clientEmail ? ' · ' + client.clientEmail : ''}. Клиент видит программу и может сам записывать подходы.
          </p>
        ) : code ? (
          <div className="invite">
            <span className="muted small">Отправьте клиенту ссылку-приглашение: он откроет её, войдёт по почте — и сразу подключится как клиент. Вся история останется.</span>
            <button className="btn btn-primary btn-block" onClick={() => void shareInvite(code, client.clientName)}>
              <Share2 size={16} /> {shared || 'Отправить приглашение'}
            </button>
            <span className="muted small">Или код вручную (клиент выбирает «Я клиент» и вводит его):</span>
            <strong className="code num">{code}</strong>
          </div>
        ) : (
          <>
            <p className="muted">Клиент без приложения — тренировки записываете вы. Можно выдать код, чтобы он видел программу и прогресс.</p>
            {login ? (
              <div className="login-form">
                <label className="field">
                  <span>Почта клиента (логин)</span>
                  <input id="client-login-email" type="email" inputMode="email" value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} placeholder="client@mail.ru" />
                </label>
                <label className="field">
                  <span>Пароль</span>
                  <input id="client-login-password" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} />
                </label>
                <div className="row gap">
                  <button className="btn" onClick={() => setLogin(null)} disabled={busy}>
                    Отмена
                  </button>
                  <button className="btn btn-primary" onClick={() => void makeLogin()} disabled={busy || !login.email.trim() || login.password.length < 6}>
                    {busy ? 'Создаём…' : 'Создать вход'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="row gap wrap">
                <button className="btn btn-primary" onClick={() => setLogin({ email: '', password: newPassword() })}>
                  Создать вход по паролю
                </button>
                <button className="btn" onClick={invite}>
                  Выдать код подключения
                </button>
              </div>
            )}
          </>
        )}
      </section>
      <section className="block">
        {confirmArchive ? (
          <Confirm
            text="Клиент пропадёт из списков и сводки, а в его приложении будет только «Ваш профиль перенесён в архив» — записывать тренировки и замеры он не сможет. История и программы сохранятся, вернуть можно из архива."
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
  const [copying, setCopying] = useState<string | null>(null);
  const [copied, setCopied] = useState('');
  // Plain text for a messenger: copied at once; shown to copy by hand when the browser does not allow it.
  const [asText, setAsText] = useState<string | null>(null);
  const [textBusy, setTextBusy] = useState(false);
  const copyAsText = async (dayIds?: string[]) => {
    setTextBusy(true);
    const text = programText(p, dayIds);
    try {
      const failed = await copyLater(text);
      if (failed) setAsText(failed);
      else setCopied('Скопировано текстом — вставьте в сообщение.');
    } finally {
      setTextBusy(false);
    }
  };
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
                <button className="btn btn-block" onClick={() => setCopying(d.id)}>
                  <Copy size={15} /> Копировать тренировку «{d.name}»
                </button>
                <button className="btn btn-block" disabled={textBusy} onClick={() => void copyAsText([d.id])}>
                  <Clipboard size={15} /> Скопировать «{d.name}» текстом
                </button>
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
          <Copy size={15} /> Копировать программу
        </button>
        <button className="btn btn-sm" disabled={textBusy} onClick={() => void copyAsText()}>
          <Clipboard size={15} /> {textBusy ? 'Готовим…' : 'Скопировать текстом'}
        </button>
        <button className="btn btn-sm btn-quiet" onClick={() => archive(!p.archived)}>
          {p.archived ? <RotateCcw size={15} /> : <Archive size={15} />} {p.archived ? 'Вернуть' : 'В архив'}
        </button>
      </footer>
      {copied && <p className="tone-good small">{copied}</p>}
      {asText !== null && (
        <Sheet title="Текст программы" onClose={() => setAsText(null)}>
          <textarea className="program-text" readOnly rows={12} value={asText} onFocus={(e) => e.target.select()} />
          <div className="order-actions">
            <button
              className="btn btn-primary btn-block"
              onClick={() => {
                void navigator.clipboard?.writeText(asText).then(
                  () => {
                    setCopied('Скопировано текстом — вставьте в сообщение.');
                    setAsText(null);
                  },
                  () => undefined,
                );
              }}
            >
              <Clipboard size={15} /> Скопировать
            </button>
            {typeof navigator.share === 'function' && (
              <button className="btn btn-block" onClick={() => void navigator.share({ text: asText }).catch(() => undefined)}>
                <Share2 size={15} /> Отправить…
              </button>
            )}
          </div>
        </Sheet>
      )}
      {copying && (
        <CopyDay
          program={p}
          dayId={copying}
          data={data}
          onClose={() => setCopying(null)}
          onDone={(text) => {
            setCopying(null);
            setCopied(text);
          }}
        />
      )}
    </article>
  );
}

/** One workout of a program into a program of this or another client (a new day), or into a new program. */
function CopyDay({
  program,
  dayId,
  data,
  onClose,
  onDone,
}: {
  program: Program;
  dayId: string;
  data: TrainerData;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const day = program.days.find((d) => d.id === dayId)!;
  const clients = activeClients(data.clients);
  const [clientId, setClientId] = useState(program.clientId);
  const targets = data.programs.filter((x) => x.clientId === clientId && !x.archived);
  const [target, setTarget] = useState<string>(program.id);
  const [dayName, setDayName] = useState(day.name);
  const [programName, setProgramName] = useState(program.name);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pickClient = (id: string) => {
    setClientId(id);
    const list = data.programs.filter((x) => x.clientId === id && !x.archived);
    setTarget(list.some((x) => x.id === program.id) ? program.id : list[0]?.id || '');
  };
  const save = async () => {
    setBusy(true);
    try {
      const r = await api.post('/api/free/' + encodeURIComponent(clientId) + '/save', {
        programId: target || null,
        programName,
        dayName,
        exercises: day.exercises.map((e) => ({
          exerciseId: e.exerciseId,
          sets: e.sets,
          repMin: e.repMin,
          repMax: e.repMax,
          targetRir: e.targetRir,
          muscles: e.muscles,
        })),
      });
      await data.reload();
      const who = clients.find((c) => c.clientId === clientId)?.clientName || '';
      onDone(`Скопировано: «${dayName}» → ${who}, программа «${r.data.programName}».`);
    } catch (e) {
      setErr(readError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet title={'Копировать «' + day.name + '»'} onClose={onClose}>
      {err && <div className="alert">{err}</div>}
      <label className="field">
        <span>Клиент</span>
        <select id="copy-day-client" value={clientId} onChange={(e) => pickClient(e.target.value)}>
          {clients.map((c) => (
            <option key={c.clientId} value={c.clientId}>
              {c.clientName}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>В программу</span>
        <select id="copy-day-program" value={target} onChange={(e) => setTarget(e.target.value)}>
          {targets.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name} · {x.days.length} трен.
            </option>
          ))}
          <option value="">Новая программа</option>
        </select>
      </label>
      {!target && (
        <label className="field">
          <span>Название программы</span>
          <input id="copy-day-program-name" value={programName} onChange={(e) => setProgramName(e.target.value)} />
        </label>
      )}
      <label className="field">
        <span>Название тренировки</span>
        <input id="copy-day-name" value={dayName} onChange={(e) => setDayName(e.target.value)} />
      </label>
      <p className="muted small">
        {day.exercises.length} упр. с теми же подходами, повторами и RIR. Добавится новой тренировкой в конец программы — её можно
        потом изменить.
      </p>
      <button className="btn btn-primary btn-block" disabled={busy || !dayName.trim() || !clientId} onClick={() => void save()}>
        {busy ? 'Копируем…' : 'Копировать'}
      </button>
    </Sheet>
  );
}
