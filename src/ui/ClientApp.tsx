import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, Play } from 'lucide-react';
import { api, inGym, isLocal, readError } from '../transport';
import { onRemoteChange } from '../local/runtime';
import { localDate } from '../clock';
import type { Coach, Profile, Program, Session } from '../types';
import { Journal } from './Journal';
import { ProgressView } from './Progress';
import { HistoryList } from './History';
import { BodyView } from './Body';
import { Avatar, Empty, VisitGrid, fmtDate } from './common';
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
  const [justDone, setJustDone] = useState(false);
  const [newRecords, setNewRecords] = useState<PersonalRecord[] | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, h] = await Promise.all([api.get('/api/my-programs'), api.get('/api/my-history')]);
      setCoaches(p.data.coaches);
      setPrograms(p.data.programs);
      setSessions(h.data.sessions);
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

  if (journal)
    return (
      <div className="app">
        <main className="main narrow">
          <Journal
            source={{ trainerId: journal.program.trainerId, programId: journal.program.id, dayId: journal.dayId }}
            onBack={() => setJournal(null)}
            onDayChange={(dayId) => setJournal({ ...journal, dayId })}
            onCompleted={async ({ records }) => {
              setJournal(null);
              setJustDone(true);
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
                {justDone && <div className="success">Тренировка записана. Тренер увидит результат.</div>}
                {programs.length === 0 ? (
                  <Empty title="Программа ещё не назначена" text={'Тренер: ' + coaches.map((c) => c.trainerName).join(', ')} />
                ) : (
                  programs.map((p) => {
                    const next = p.days.find((d) => d.id === p.nextDayId) || p.days[0];
                    return (
                      <article className="program next-card" key={p.id}>
                        <span className="eyebrow">
                          {p.trainerName} · {p.name}
                        </span>
                        <h3>Следующая: {next.name}</h3>
                        <p className="muted small">
                          {next.exercises.length} упражнений · {next.exercises.reduce((n, e) => n + e.sets, 0)} подходов
                          {p.lastCompletedAt ? ' · прошлая ' + fmtDate(p.lastCompletedAt) : ''}
                        </p>
                        <button className="btn btn-primary btn-block btn-lg" onClick={() => { setJustDone(false); setJournal({ program: p, dayId: next.id }); }}>
                          <Play size={18} /> Начать тренировку
                        </button>
                        <div className="day-links">
                          {p.days.map((d) => (
                            <button key={d.id} className="day-link" onClick={() => setJournal({ program: p, dayId: d.id })}>
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
