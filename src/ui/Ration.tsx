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

/** The ration's address: who it is for, the theme and the client's own data (after #: never sent anywhere). */
function rationSrc(person: string, profile: BodyProfile, weight: number) {
  const q = new URLSearchParams({ embed: '1', key: tagOf(person), strength: '1' });
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
 */
export function RationTab({ person, active }: { person: string; active: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  // The client's data is not there yet: what is known, to ask for the rest.
  const [missing, setMissing] = useState<{ profile: BodyProfile | null; weight: number | null } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(600);

  useEffect(() => {
    let alive = true;
    api
      .get('/api/body')
      .then((r) => {
        if (!alive) return;
        const profile: BodyProfile | null = r.data.profile || null;
        const entries = r.data.entries || [];
        const weight = weeklyAverage(entries, localDate()).current ?? latest(entries).weight?.value ?? null;
        if (profile && weight) setSrc(rationSrc(person, profile, weight));
        else setMissing({ profile, weight });
      })
      .catch(() => alive && setMissing({ profile: null, weight: null }));
    return () => {
      alive = false;
    };
  }, [person]);

  // The frame takes the screen below the tabs (the ration has its own menu at the bottom).
  useEffect(() => {
    if (!active) return;
    const fit = () => {
      const top = box.current?.getBoundingClientRect().top ?? 0;
      setHeight(Math.max(420, window.innerHeight - Math.max(0, top) - 4));
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
        onDone={(profile, weight) => {
          setMissing(null);
          setSrc(rationSrc(person, profile, weight));
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
function AccountData({ known, onDone }: { known: { profile: BodyProfile | null; weight: number | null }; onDone: (p: BodyProfile, weight: number) => void }) {
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
      if (!p || p.sex !== sex || p.heightCm !== profile.heightCm || p.birthYear !== y || p.activity !== activity) await api.post('/api/body/profile', profile);
      if (!known.weight) await api.post('/api/body', { date: localDate(), weight: Math.round(w * 10) / 10 });
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
      <p className="muted small">Рацион считается по вашим данным из «Замеров». Их там ещё нет — заполните один раз, они сохранятся в «Замерах».</p>
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
