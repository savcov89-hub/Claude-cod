import { useEffect, useState } from 'react';
import { auth } from '@appdeploy/client';
import { Activity, ChevronRight, ClipboardList, Dumbbell, LogOut, RotateCcw } from 'lucide-react';
import { api, isArtifactBuild, isLocal, readError } from './transport';
import { getActor, initLocal, localActors, resetLocal, setActor, storageMode } from './local/runtime';
import type { Profile, Role } from './types';
import { TrainerApp } from './ui/TrainerApp';
import { ClientApp } from './ui/ClientApp';
import { Confirm } from './ui/common';

interface AuthUser {
  userId: string;
  email?: string;
  name?: string;
}

export default function WorkoutApp() {
  return isLocal() ? <LocalApp /> : <RealApp />;
}

/** Test build: sample data, role switcher, no sign-in. */
function LocalApp() {
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState('');
  const [actor, setActorState] = useState(getActor());
  const [version, setVersion] = useState(0);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  useEffect(() => {
    initLocal()
      .then(() => setReady(true))
      .catch((e) => setErr(readError(e)));
  }, []);
  if (err) return <div className="center-screen"><div className="alert">{err}</div></div>;
  if (!ready)
    return (
      <div className="center-screen">
        <span className="loader" />
        <p className="muted">Готовим тестовые данные…</p>
      </div>
    );
  const isTrainer = actor === localActors.trainer.userId;
  const client = localActors.clients.find((c) => c.userId === actor);
  const switchTo = (id: string) => {
    setActor(id);
    setActorState(id);
    setVersion((v) => v + 1);
  };
  const mode = storageMode();
  const header = (
    <div className="testbar">
      <div className="testbar-info" title={
        mode === 'shared'
          ? 'Данные общие для всех ваших устройств по этой ссылке'
          : mode === 'browser'
            ? 'Данные хранятся в этом браузере'
            : 'Данные сбросятся после перезагрузки'
      }>
        <strong>Тест</strong>
      </div>
      <div className="testbar-controls">
        <div className="seg" role="group" aria-label="Роль">
          <button className={isTrainer ? 'on' : ''} onClick={() => switchTo(localActors.trainer.userId)}>
            Тренер
          </button>
          <button className={!isTrainer ? 'on' : ''} onClick={() => switchTo(client?.userId || localActors.clients[0].userId)}>
            Клиент
          </button>
        </div>
        {!isTrainer && (
          <select id="demo-client" aria-label="Тестовый клиент" value={actor} onChange={(e) => switchTo(e.target.value)}>
            {localActors.clients.map((c) => (
              <option key={c.userId} value={c.userId}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <button className="icon-btn sm" aria-label="Сбросить тестовые данные" title="Сбросить тестовые данные" onClick={() => setConfirmReset(true)}>
          <RotateCcw size={16} />
        </button>
        {!isArtifactBuild && (
          <a className="btn btn-sm btn-quiet" href={location.pathname}>
            Выйти из теста
          </a>
        )}
      </div>
      {confirmReset && (
        <Confirm
          text="Все тестовые записи удалятся, пример заполнится заново."
          confirmLabel="Сбросить"
          busy={resetting}
          onCancel={() => setConfirmReset(false)}
          onConfirm={async () => {
            setResetting(true);
            await resetLocal();
            setResetting(false);
            setConfirmReset(false);
            setVersion((v) => v + 1);
          }}
        />
      )}
    </div>
  );
  return isTrainer ? (
    <TrainerApp key={'t' + version} profile={{ role: 'trainer', name: localActors.trainer.name, email: '' }} header={header} />
  ) : (
    <ClientApp key={actor + version} profile={{ role: 'client', name: client?.name || 'Клиент', email: '' }} header={header} />
  );
}

/** Production: AppDeploy sign-in and roles. */
function RealApp() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const current = (await auth.getUser()) as AuthUser | null;
        setUser(current);
        if (current) setProfile((await api.get('/api/me')).data.profile || null);
      } catch (e) {
        setErr(readError(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const signIn = async () => {
    setBusy(true);
    setErr('');
    try {
      const result = await auth.signIn();
      setUser(result.user as AuthUser);
      setProfile((await api.get('/api/me')).data.profile || null);
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code !== 'popup_closed') setErr(code === 'popup_blocked' ? 'Разрешите всплывающие окна для входа.' : readError(e));
    } finally {
      setBusy(false);
    }
  };
  const signOut = async () => {
    await auth.signOut();
    setUser(null);
    setProfile(null);
  };
  const chooseRole = async (role: Role) => {
    setBusy(true);
    try {
      setProfile((await api.post('/api/profile', { role })).data.profile);
    } catch (e) {
      setErr(readError(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading)
    return (
      <div className="center-screen">
        <span className="loader" />
        <p className="muted">Загружаем журнал…</p>
      </div>
    );
  if (!user)
    return (
      <div className="auth">
        <span className="brand-mark"><Dumbbell size={28} /></span>
        <span className="eyebrow">Training Log</span>
        <h1>Журнал тренера и клиента</h1>
        <p className="muted">Вкладки клиентов в зале, запись подходов в одно касание, подсказки прогрессии и сводка по всем клиентам.</p>
        {err && <div className="alert">{err}</div>}
        <button className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={signIn}>
          {busy ? 'Входим…' : 'Войти'} <ChevronRight size={18} />
        </button>
        <a className="btn btn-block" href="?demo=1">
          Попробовать без регистрации
        </a>
      </div>
    );
  if (!profile)
    return (
      <div className="auth">
        <span className="eyebrow">Первый вход</span>
        <h1>Кто вы?</h1>
        <p className="muted">Роль закрепляется за аккаунтом.</p>
        {err && <div className="alert">{err}</div>}
        <div className="role-grid">
          <button className="role" disabled={busy} onClick={() => chooseRole('trainer')}>
            <ClipboardList size={24} />
            <strong>Я тренер</strong>
            <span className="muted small">Клиенты, программы, журнал в зале, сводка</span>
          </button>
          <button className="role" disabled={busy} onClick={() => chooseRole('client')}>
            <Activity size={24} />
            <strong>Я клиент</strong>
            <span className="muted small">Моя программа, запись подходов, прогресс</span>
          </button>
        </div>
        <button className="btn btn-quiet" onClick={signOut}>
          <LogOut size={16} /> Выйти
        </button>
      </div>
    );
  const header = (
    <div className="topbar">
      <span className="brand">
        <Dumbbell size={18} /> Training Log
      </span>
      <span className="muted small grow">{profile.name}</span>
      <button className="icon-btn sm" aria-label="Выйти" onClick={signOut}>
        <LogOut size={16} />
      </button>
    </div>
  );
  return profile.role === 'trainer' ? <TrainerApp profile={profile} header={header} /> : <ClientApp profile={profile} header={header} />;
}
