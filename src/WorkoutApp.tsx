import { useEffect, useState, type FormEvent } from 'react';
import { Activity, ChevronRight, ClipboardList, Dumbbell, LogOut, Mail, RotateCcw } from 'lucide-react';
import { api, isArtifactBuild, isLocal, readError } from './transport';
import { auth, type AuthUser } from './supabase';
import { captureInvite, clearInvite, pendingInvite } from './invite';
import { getActor, initLocal, localActors, resetLocal, setActor, storageMode } from './local/runtime';
import type { Profile, Role } from './types';
import { TrainerApp } from './ui/TrainerApp';
import { ClientApp } from './ui/ClientApp';
import { Confirm } from './ui/common';

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

/** Production: Supabase sign-in (Google or emailed link), then roles. */
function RealApp() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [name, setName] = useState('');
  const [googleOn, setGoogleOn] = useState(false);
  const [code, setCode] = useState('');
  const [picked, setPicked] = useState<Role | null>(null);
  // An invite link (?invite=CODE) waits here until the client has signed in.
  const [invite, setInvite] = useState(() => {
    captureInvite();
    return pendingInvite();
  });
  const [connecting, setConnecting] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    void auth.googleEnabled().then(setGoogleOn);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const current = (await auth.getUser()) as AuthUser | null;
        setUser(current);
        setName(current?.name || '');
        if (current) setProfile((await api.get('/api/me')).data.profile || null);
      } catch (e) {
        setErr(readError(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const google = async () => {
    setBusy(true);
    setErr('');
    try {
      await auth.signInWithGoogle();
    } catch (e) {
      setErr(readError(e));
      setBusy(false);
    }
  };
  const sendLink = async (e: FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    if (!address) return;
    setBusy(true);
    setErr('');
    try {
      await auth.sendLink(address);
      setSentTo(address);
    } catch (e) {
      setErr(readError(e));
    } finally {
      setBusy(false);
    }
  };
  const verify = async (e: FormEvent) => {
    e.preventDefault();
    const token = code.replace(/\s/g, '');
    if (!token) return;
    setBusy(true);
    setErr('');
    try {
      const signed = await auth.verifyCode(sentTo, token);
      setUser(signed);
      setName(signed?.name || '');
      if (signed) setProfile((await api.get('/api/me')).data.profile || null);
    } catch {
      setErr('Код не подошёл или устарел. Проверьте письмо или запросите новый.');
    } finally {
      setBusy(false);
    }
  };
  // A client who came by an invite link is connected to the trainer right after signing in.
  useEffect(() => {
    if (profile?.role !== 'client' || !invite) return;
    setConnecting(true);
    api
      .post('/api/connect', { code: invite })
      .then((r) => setNote('Вы подключены к тренеру: ' + r.data.trainerName + '.'))
      .catch((e) => {
        const msg = readError(e);
        if (!/уже подключены/i.test(msg)) setNote('Приглашение не сработало: ' + msg);
      })
      .finally(() => {
        clearInvite();
        setInvite('');
        setConnecting(false);
      });
  }, [profile, invite]);
  const switchRole = async (role: Role) => {
    setBusy(true);
    setErr('');
    try {
      setProfile((await api.post('/api/profile/role', { role })).data.profile);
    } catch (e) {
      setErr(readError(e));
      setNote(readError(e));
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
      setProfile((await api.post('/api/profile', { role, name: name.trim() })).data.profile);
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
        <h1>Дневник тренера и клиента</h1>
        <p className="muted">Вкладки клиентов в зале, запись подходов в одно касание, подсказки прогрессии и сводка по всем клиентам.</p>
        {invite && <div className="success">Вас пригласил тренер. Войдите — подключение к нему произойдёт само.</div>}
        {err && <div className="alert">{err}</div>}
        {googleOn && (
          <>
            <button className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={google}>
              <GoogleMark /> Войти через Google
            </button>
            <p className="muted small center-text">или по ссылке на почту</p>
          </>
        )}
        {sentTo ? (
          <div className="notice">
            <Mail size={18} />
            <p>
              Письмо для входа отправлено на <strong>{sentTo}</strong>. Введите код из письма здесь — так вход останется в этом
              приложении, даже если письмо открылось в браузере почты.
            </p>
            <form className="code-form" onSubmit={verify}>
              <input
                id="login-code"
                className="code-input num"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={10}
                placeholder="Код из письма"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <button className="btn btn-primary btn-block" disabled={busy || code.replace(/\s/g, '').length < 6} type="submit">
                {busy ? 'Проверяем…' : 'Войти'}
              </button>
            </form>
            <p className="muted small">Или нажмите ссылку в письме, открыв его на этом устройстве.</p>
            <button
              className="btn btn-quiet"
              onClick={() => {
                setSentTo('');
                setCode('');
              }}
            >
              Другой адрес
            </button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={sendLink}>
            <label className="field">
              <span>Электронная почта</span>
              <input
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <button className={'btn btn-lg btn-block' + (googleOn ? '' : ' btn-primary')} disabled={busy || !email.trim()} type="submit">
              {busy ? 'Отправляем…' : 'Получить ссылку для входа'} <ChevronRight size={18} />
            </button>
          </form>
        )}
        <a className="btn btn-block" href="?demo=1">
          Попробовать без регистрации
        </a>
      </div>
    );
  if (!profile)
    return (
      <div className="auth">
        <span className="eyebrow">Первый вход</span>
        <h1>{invite ? 'Приглашение от тренера' : 'Кто вы?'}</h1>
        <p className="muted">{invite ? 'Вы входите как клиент — программа и записи тренера появятся сразу.' : 'Роль закрепляется за аккаунтом.'}</p>
        {err && <div className="alert">{err}</div>}
        <label className="field">
          <span>Как вас зовут?</span>
          <input autoComplete="name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя" />
        </label>
        {invite ? (
          <button className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={() => chooseRole('client')}>
            {busy ? 'Сохраняем…' : 'Продолжить как клиент'}
          </button>
        ) : (
          <>
            {/* Pick first, then confirm: a tap that lands on the wrong card as the keyboard closes changes nothing. */}
            <div className="role-grid">
              <button className={'role' + (picked === 'trainer' ? ' on' : '')} aria-pressed={picked === 'trainer'} disabled={busy} onClick={() => setPicked('trainer')}>
                <ClipboardList size={24} />
                <strong>Я тренер</strong>
                <span className="muted small">Клиенты, программы, журнал в зале, сводка</span>
              </button>
              <button className={'role' + (picked === 'client' ? ' on' : '')} aria-pressed={picked === 'client'} disabled={busy} onClick={() => setPicked('client')}>
                <Activity size={24} />
                <strong>Я клиент</strong>
                <span className="muted small">Моя программа, запись подходов, прогресс. Код даст тренер.</span>
              </button>
            </div>
            <button className="btn btn-primary btn-lg btn-block" disabled={busy || !picked} onClick={() => picked && chooseRole(picked)}>
              {busy ? 'Сохраняем…' : picked === 'trainer' ? 'Продолжить как тренер' : picked === 'client' ? 'Продолжить как клиент' : 'Выберите роль'}
            </button>
          </>
        )}
        <button className="btn btn-quiet" onClick={signOut}>
          <LogOut size={16} /> Выйти
        </button>
      </div>
    );
  if (connecting)
    return (
      <div className="center-screen">
        <span className="loader" />
        <p className="muted">Подключаем к тренеру…</p>
      </div>
    );
  // An invite opened in a trainer account: offer to switch while the account is still empty.
  if (profile.role === 'trainer' && invite)
    return (
      <div className="auth">
        <span className="eyebrow">Приглашение</span>
        <h1>Это приглашение для клиента</h1>
        <p className="muted">Вы вошли как тренер ({user.email}). Если роль выбрана по ошибке и клиентов ещё нет, её можно сменить.</p>
        {err && <div className="alert">{err}</div>}
        <button className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={() => void switchRole('client')}>
          {busy ? 'Меняем…' : 'Я клиент — сменить роль'}
        </button>
        <button
          className="btn btn-block"
          onClick={() => {
            clearInvite();
            setInvite('');
          }}
        >
          Остаться тренером
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
  const top = (
    <>
      {header}
      {note && (
        <button className="success note-bar" onClick={() => setNote('')}>
          {note}
        </button>
      )}
    </>
  );
  return profile.role === 'trainer' ? (
    <TrainerApp profile={profile} header={top} onSwitchRole={() => void switchRole('client')} />
  ) : (
    <ClientApp profile={profile} header={top} onSwitchRole={() => void switchRole('trainer')} />
  );
}

function GoogleMark() {
  return (
    <svg className="gmark" width="22" height="22" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
