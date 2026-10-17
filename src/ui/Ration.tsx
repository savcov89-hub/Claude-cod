import { useEffect, useRef, useState } from 'react';
import { api, readError } from '../transport';
import { ACTIVITY, latest, weeklyAverage, type BodyProfile } from '../body';
import { localDate } from '../clock';

/** A short stable tag of the person: their answers and ration are kept apart from others on a shared phone. */
const tagOf = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return s ? h.toString(36) : '';
};

/**
 * Clients have the «Рацион» tab, and the trainer can assign a ration to them. Off for now (the owner's call): the
 * trainer builds rations in the client's card, clients do not see the tab, and there is no «Назначить клиенту».
 */
export const RATION_FOR_CLIENTS = false;

/** The trainer in the client's card: whose ration is built there (the client's name). */
interface ForClient {
  clientId: string;
  clientName: string;
}

/** The ration's address: who it is for, the theme and the client's own data (after #: never sent anywhere). */
function rationSrc(person: string, profile: BodyProfile, weight: number, forClient?: ForClient) {
  const q = new URLSearchParams({ embed: '1', key: tagOf(person), strength: '1' });
  if (forClient) {
    q.set('role', 'trainer');
    q.set('name', forClient.clientName);
    if (RATION_FOR_CLIENTS) q.set('assign', '1');
  }
  // The app has its own menu at the bottom (the trainer's): the ration's sections go on top, not as a second row.
  if (document.querySelector('.app.has-nav > .nav')) q.set('menu', 'top');
  const theme = document.documentElement.getAttribute('data-theme');
  if (theme) q.set('theme', theme);
  q.set('sex', profile.sex === 'm' ? 'male' : 'female');
  q.set('age', String(new Date().getFullYear() - profile.birthYear));
  q.set('h', String(profile.heightCm));
  q.set('act', profile.activity);
  q.set('w', String(weight));
  return './ration/#' + q.toString();
}

/**
 * «Рацион» — a page of its own (ration/, built to dist/ration): the weekly menu and shopping list by the norms, in a
 * frame under the tabs, so its styles stay apart. Sex, age, height, weight and training come from the client's own
 * data in «Замеры» — asked here once when missing and saved there; the app's theme follows.
 * In the trainer's client card (`forClient`) the ration is built by the client's data and assigned to the client
 * («Назначить клиенту» in the frame); the client's tab shows the assigned one, marked «от тренера».
 */
export function RationTab({ person, active, forClient }: { person: string; active: boolean; forClient?: ForClient }) {
  const [src, setSrc] = useState<string | null>(null);
  // The client's data is not there yet: what is known, to ask for the rest.
  const [missing, setMissing] = useState<{ profile: BodyProfile | null; weight: number | null } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(600);
  const clientId = forClient?.clientId;
  const query = clientId ? '?clientId=' + encodeURIComponent(clientId) : '';

  useEffect(() => {
    let alive = true;
    api
      .get('/api/body' + query)
      .then((r) => {
        if (!alive) return;
        const profile: BodyProfile | null = r.data.profile || null;
        const entries = r.data.entries || [];
        const weight = weeklyAverage(entries, localDate()).current ?? latest(entries).weight?.value ?? null;
        if (profile && weight) setSrc(rationSrc(person, profile, weight, forClient));
        else setMissing({ profile, weight });
      })
      .catch(() => alive && setMissing({ profile: null, weight: null }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person, query]);

  // The frame asks for the assigned ration when it is up, and gets it again each time the tab is opened (the trainer
  // may have assigned one meanwhile); the trainer's «Назначить клиенту» is saved here.
  const post = (msg: unknown) => frame.current?.contentWindow?.postMessage(msg, location.origin);
  const sendAssigned = () =>
    api
      .get('/api/ration' + query)
      .then((r) => post({ type: 'tl-ration:assigned', ration: r.data.ration || null }))
      .catch(() => {});
  const ready = useRef(false);
  useEffect(() => {
    const listen = (e: MessageEvent) => {
      if (e.origin !== location.origin || !frame.current || e.source !== frame.current.contentWindow) return;
      if (e.data?.type === 'tl-ration:ready') {
        ready.current = true;
        void sendAssigned();
      }
      if (e.data?.type === 'tl-ration:assign' && clientId)
        api
          .post('/api/client/' + encodeURIComponent(clientId) + '/ration', { plan: e.data.plan })
          .then((r) => post({ type: 'tl-ration:assign-result', ration: r.data.ration }))
          .catch((err) => post({ type: 'tl-ration:assign-result', error: readError(err) }));
    };
    window.addEventListener('message', listen);
    return () => window.removeEventListener('message', listen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, query]);
  useEffect(() => {
    if (active && ready.current) void sendAssigned();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // The frame takes the screen below the tabs and above the app's own menu at the bottom, if any (the ration has
  // its own menu at the bottom).
  useEffect(() => {
    if (!active) return;
    const fit = () => {
      const top = box.current?.getBoundingClientRect().top ?? 0;
      const nav = document.querySelector('.app.has-nav > .nav')?.getBoundingClientRect();
      const bottom = nav && nav.height && nav.top > top ? nav.top : window.innerHeight;
      setHeight(Math.max(420, bottom - Math.max(0, top) - 4));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [active, src]);

  // The theme switched in the app: the ration too.
  useEffect(() => {
    const sync = () => {
      const root = frame.current?.contentDocument?.documentElement;
      if (!root) return;
      const theme = document.documentElement.getAttribute('data-theme');
      if (theme) root.setAttribute('data-theme', theme);
      else root.removeAttribute('data-theme');
    };
    const watch = new MutationObserver(sync);
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => watch.disconnect();
  }, []);

  if (!src && missing)
    return (
      <AccountData
        known={missing}
        forClient={forClient}
        onDone={(profile, weight) => {
          setMissing(null);
          setSrc(rationSrc(person, profile, weight, forClient));
        }}
      />
    );
  return (
    <div ref={box} className="ration-box" style={{ height }}>
      {src ? (
        <iframe ref={frame} title="Рацион" src={src} />
      ) : (
        <div className="loader-block">
          <span className="loader" />
        </div>
      )}
    </div>
  );
}

/** The client's data the ration needs and «Замеры» has not got yet: asked once, saved to «Замеры». */
function AccountData({
  known,
  forClient,
  onDone,
}: {
  known: { profile: BodyProfile | null; weight: number | null };
  forClient?: ForClient;
  onDone: (p: BodyProfile, weight: number) => void;
}) {
  const p = known.profile;
  const [sex, setSex] = useState<'m' | 'f' | ''>(p?.sex || '');
  const [height, setHeight] = useState(p ? String(p.heightCm) : '');
  const [year, setYear] = useState(p ? String(p.birthYear) : '');
  const [activity, setActivity] = useState(p?.activity || 'light');
  const [weight, setWeight] = useState(known.weight ? String(known.weight) : '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const number = (v: string) => Number(v.replace(',', '.').trim());
  const save = async () => {
    const h = number(height);
    const y = Math.round(number(year));
    const w = number(weight);
    const now = new Date().getFullYear();
    if (!sex || !(h >= 120 && h <= 230) || !(y >= now - 100 && y <= now - 14) || !(w >= 30 && w <= 300))
      return setErr('Укажите пол, рост (см), год рождения и вес (кг).');
    setBusy(true);
    setErr('');
    try {
      const profile: BodyProfile = { sex, heightCm: Math.round(h), birthYear: y, activity };
      const who = forClient ? { clientId: forClient.clientId } : {};
      if (!p || p.sex !== sex || p.heightCm !== profile.heightCm || p.birthYear !== y || p.activity !== activity)
        await api.post('/api/body/profile', { ...profile, ...who });
      if (!known.weight) await api.post('/api/body', { date: localDate(), weight: Math.round(w * 10) / 10, ...who });
      onDone(profile, known.weight || Math.round(w * 10) / 10);
    } catch (e) {
      setErr(readError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="block ration-account">
      <h4>Данные для рациона</h4>
      <p className="muted small">
        {forClient
          ? 'Рацион считается по данным клиента из «Замеров». Их там ещё нет — заполните один раз, они сохранятся в «Замерах» клиента.'
          : 'Рацион считается по вашим данным из «Замеров». Их там ещё нет — заполните один раз, они сохранятся в «Замерах».'}
      </p>
      <div className="chips" role="group" aria-label="Пол">
        {(
          [
            ['m', 'Мужчина'],
            ['f', 'Женщина'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" className={'filter' + (sex === k ? ' on' : '')} aria-pressed={sex === k} onClick={() => setSex(k)}>
            {label}
          </button>
        ))}
      </div>
      <div className="measure-grid">
        <label className="field">
          <span>Рост, см</span>
          <input id="ration-height" inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="178" />
        </label>
        <label className="field">
          <span>Год рождения</span>
          <input id="ration-year" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} placeholder="1990" />
        </label>
        {!known.weight && (
          <label className="field">
            <span>Вес сегодня, кг</span>
            <input id="ration-weight" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="75" />
          </label>
        )}
      </div>
      <label className="field">
        <span>Тренировки</span>
        <select value={activity} onChange={(e) => setActivity(e.target.value)}>
          {ACTIVITY.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </label>
      {err && <div className="alert">{err}</div>}
      <button className="btn btn-primary btn-block" disabled={busy} onClick={() => void save()}>
        {busy ? 'Сохраняем…' : 'Сохранить и открыть рацион'}
      </button>
    </section>
  );
}
