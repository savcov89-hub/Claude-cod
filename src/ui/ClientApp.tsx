import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, Play } from 'lucide-react';
import { api, inGym, isLocal, readError } from '../transport';
import { onRemoteChange } from '../local/runtime';
import { localDate } from '../clock';
import type { Coach, Profile, Program, Session } from '../types';
import { Journal } from './Journal';
import { ProgressView } from './Progress';
import { HistoryList } from './History';
import { BodyView } from './Body';
import { Avatar, Empty, VisitGrid, autoFinishedText, fmtDate } from './common';
import { RecordsSheet } from './Records';
import type { PersonalRecord } from '../analytics';

type Tab = 'workout' | 'progress' | 'history' | 'body';

export function ClientApp({ profile, header, onSwitchRole }: { profile: Profile; header: React.ReactNode; onSwitchRole?: () => void }) {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('workout');
  const [journal, setJournal] = useState<{ program: Program; dayId: string } | null>(null);
  const [justDone, setJustDone] = useState<string | null>(null);
  const [newRecords, setNewRecords] = useState<PersonalRecord[] | null>(null);
  // A workout the trainer is recording right now.
  const [live, setLive] = useState<{ programId: string; dayId: string; dayName: string; updatedAt: string; updatedByRole?: string } | null>(null);
  // The trainer moved the profile to the archive: the app shows only that.
  const [archived, setArchived] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, h] = await Promise.all([api.get('/api/my-programs'), api.get('/api/my-history')]);
      setArchived(!!p.data.archived);
      setCoaches(p.data.coaches);
      setPrograms(p.data.programs);
      setLive(p.data.live || null);
      setSessions(h.data.sessions);
      // A workout left open long ago was recorded by the server just now.
      if (p.data.autoFinished?.length) setJustDone(autoFinishedText(p.data.autoFinished));
      setErr('');
    } catch (e) {
      setErr(readError(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    const off = isLocal() ? onRemoteChange(() => void load()) : () => undefined;
    return () => {
      off();
    };
  }, [load]);
  // While the home screen is open (and as soon as the app is opened again): a workout the trainer starts
  // recording shows up, and one the trainer has finished is gone at once — the next workout and the history follow.
  const programsRef = useRef(programs);
  programsRef.current = programs;
  useEffect(() => {
    if (journal) return;
    const progress = (list: Program[]) => list.map((x) => x.id + ':' + x.nextDayId + ':' + (x.lastCompletedAt || '')).join('|');
    let busy = false;
    const refresh = async () => {
      if (document.visibilityState !== 'visible' || busy) return;
      busy = true;
      try {
        const p = await api.get('/api/my-programs');
        setLive(p.data.live || null);
        setArchived(!!p.data.archived);
        if (!p.data.archived) {
          setCoaches(p.data.coaches);
          // A workout recorded meanwhile (by the trainer, or by itself): the history too.
          if (progress(p.data.programs) !== progress(programsRef.current)) setSessions((await api.get('/api/my-history')).data.sessions);
          setPrograms(p.data.programs);
        }
        if (p.data.autoFinished?.length) setJustDone(autoFinishedText(p.data.autoFinished));
      } catch {
        /* offline: keep what is shown */
      } finally {
        busy = false;
      }
    };
    const t = window.setInterval(() => void refresh(), 20000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [journal]);
  const liveProgram = live ? programs.find((p) => p.id === live.programId) : null;

  const connect = async () => {
    if (code.trim().length !== 6) return setErr('Введите шестизначный код тренера.');
    setBusy(true);
    try {
      await api.post('/api/connect', { code: code.trim().toUpperCase() });
      setCode('');
      await load();
    } catch (e) {
      setErr(readError(e));
    } finally {
      setBusy(false);
    }
  };
  const here = coaches.some((c) => inGym(c.checkedInAt));
  /**
   * Opening a workout, also just to look at it: not a visit yet. The client is marked in the gym by the server with
   * her first recorded set (the trainer then sees her in «Зал»).
   */
  const startWorkout = (program: Program, dayId: string) => {
    setJustDone(null);
    setJournal({ program, dayId });
  };
  const toggleGym = async () => {
    setBusy(true);
    try {
      for (const c of coaches) await api.post('/api/attendance', { trainerId: c.trainerId, present: !here, localDate: localDate(), at: new Date().toISOString() });
      await load();
    } catch (e) {
      setErr(readError(e));
    } finally {
      setBusy(false);
    }
  };

  if (archived)
    return (
      <div className="app">
        {header}
        <main className="main narrow">
          <section className="block archived-note">
            <h3>Ваш профиль перенесён в архив</h3>
            <p className="muted">
              Тренер перенёс ваш профиль в архив, поэтому программа, тренировки и замеры сейчас недоступны. Если это
              ошибка или вы возобновляете занятия — напишите тренеру: после возврата из архива всё откроется как было.
            </p>
          </section>
        </main>
      </div>
    );

  if (journal)
    return (
      <div className="app">
        <main className="main narrow">
          <Journal
            source={{ trainerId: journal.program.trainerId, programId: journal.program.id, dayId: journal.dayId }}
            onBack={() => {
              setJournal(null);
              void load(); // a set recorded there has marked her in the gym
            }}
            onDayChange={(dayId) => setJournal({ ...journal, dayId })}
            onAutoFinished={() => void load()}
            onCompleted={async ({ records, by }) => {
              setJournal(null);
              setJustDone(by === 'trainer' ? 'Тренер завершил тренировку — ваши подходы в ней.' : 'Тренировка записана. Тренер увидит результат.');
              if (records?.length) setNewRecords(records);
              await load();
            }}
          />
        </main>
      </div>
    );

  const visits = Array.from(new Set(coaches.flatMap((c) => c.visits || [])));

  return (
    <div className="app">
      {header}
      {newRecords && <RecordsSheet records={newRecords} onClose={() => setNewRecords(null)} />}
      <main className="main narrow">
        <div className="section-head">
          <div className="me">
            <Avatar name={profile.name} avatar={coaches.find((c) => c.avatar)?.avatar} />
            <div>
              <span className="eyebrow">Мои тренировки</span>
              <h2>{profile.name}</h2>
            </div>
          </div>
          {coaches.length > 0 && (
            <button className={'btn presence' + (here ? ' on' : '')} disabled={busy} onClick={toggleGym}>
              {here ? '● В зале · ушёл' : 'Я в зале'}
            </button>
          )}
        </div>
        {err && <div className="alert">{err}</div>}
        {live && liveProgram && (
          <button className="live-banner" onClick={() => startWorkout(liveProgram, live.dayId)}>
            <span className="live-dot" />
            <span className="grow">
              <strong>Тренировка идёт · {live.dayName}</strong>
              <small>{live.updatedByRole === 'trainer' ? 'Тренер записывает подходы — смотрите вживую' : 'Откройте, чтобы продолжить'}</small>
            </span>
            <span className="btn btn-sm btn-primary">Открыть</span>
          </button>
        )}
        {loading ? (
          <div className="loader-block"><span className="loader" /></div>
        ) : coaches.length === 0 ? (
          <section className="block connect">
            <h3>Подключитесь к тренеру</h3>
            <p className="muted">Тренер выдаёт шестизначный код в карточке клиента. После подключения здесь появятся программа и история.</p>
            <input
              id="connect-code"
              className="code-input num"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
            />
            <button className="btn btn-primary btn-block" disabled={busy} onClick={connect}>
              Подключиться
            </button>
            {onSwitchRole && sessions.length === 0 && (
              <p className="muted small center-text">
                Вы тренер?{' '}
                <button className="link-btn" onClick={onSwitchRole}>
                  Сменить роль на тренера
                </button>
              </p>
            )}
          </section>
        ) : (
          <>
            <nav className="subtabs" role="tablist">
              {(
                [
                  ['workout', 'Тренировка'],
                  ['progress', 'Прогресс'],
                  ['history', 'История'],
                  ['body', 'Замеры'],
                ] as [Tab, string][]
              ).map(([k, label]) => (
                <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                  {label}
                </button>
              ))}
            </nav>
            {tab === 'workout' && (
              <>
                {justDone && <div className="success">{justDone}</div>}
                {programs.length === 0 ? (
                  <Empty title="Программа ещё не назначена" text={'Тренер: ' + coaches.map((c) => c.trainerName).join(', ')} />
                ) : (
                  programs.map((p) => {
                    const next = p.days.find((d) => d.id === p.nextDayId) || p.days[0];
                    return (
                      <article className="program next-card" key={p.id}>
                        <span className="eyebrow coach-line">
                          {coaches.some((c) => c.trainerId === p.trainerId && c.trainerAvatar) && (
                            <span className="coach-pic">
                              <Avatar name={p.trainerName || 'Т'} avatar={coaches.find((c) => c.trainerId === p.trainerId)?.trainerAvatar} />
                            </span>
                          )}
                          {p.trainerName} · {p.name}
                        </span>
                        <h3>Следующая: {next.name}</h3>
                        <p className="muted small">
                          {next.exercises.length} упражнений · {next.exercises.reduce((n, e) => n + e.sets, 0)} подходов
                          {p.lastCompletedAt ? ' · прошлая ' + fmtDate(p.lastCompletedAt) : ''}
                        </p>
                        <button className="btn btn-primary btn-block btn-lg" onClick={() => startWorkout(p, next.id)}>
                          <Play size={18} /> Начать тренировку
                        </button>
                        <div className="day-links">
                          {p.days.map((d) => (
                            <button key={d.id} className="day-link" onClick={() => startWorkout(p, d.id)}>
                              <span className="grow">
                                <strong>{d.name}</strong>
                                <span className="muted small">{d.exercises.map((e) => e.exerciseName).slice(0, 3).join(', ')}…</span>
                              </span>
                              <ChevronRight size={18} />
                            </button>
                          ))}
                        </div>
                      </article>
                    );
                  })
                )}
                <section className="block">
                  <h4>Посещения · 8 недель</h4>
                  <VisitGrid visits={visits} />
                </section>
              </>
            )}
            {tab === 'progress' && <ProgressView sessions={sessions} programs={programs} />}
            {tab === 'history' && <HistoryList sessions={sessions} programs={programs} />}
            {tab === 'body' && <BodyView />}
          </>
        )}
      </main>
    </div>
  );
}
