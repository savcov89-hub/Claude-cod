import { useEffect, useRef, useState } from 'react';
import { api } from '../transport';
import { latest, weeklyAverage, type BodyEntry, type BodyProfile } from '../body';
import { localDate } from '../clock';

/** A short stable tag of the person: their answers and ration are kept apart from others on a shared phone. */
const tagOf = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return s ? h.toString(36) : '';
};

/**
 * «Рацион» — a page of its own (ration/, built to dist/ration): the weekly menu and shopping list by the norms, in a
 * frame under the tabs, so its styles stay apart. Sex, age, height and weight come from «Замеры» (after # in its
 * address: never sent anywhere), the training as strength training; the app's theme follows.
 */
export function RationTab({ person, active }: { person: string; active: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(600);

  useEffect(() => {
    let alive = true;
    const open = (profile: BodyProfile | null, entries: BodyEntry[]) => {
      const q = new URLSearchParams({ embed: '1', key: tagOf(person), strength: '1' });
      const theme = document.documentElement.getAttribute('data-theme');
      if (theme) q.set('theme', theme);
      if (profile) {
        q.set('sex', profile.sex === 'm' ? 'male' : 'female');
        q.set('age', String(new Date().getFullYear() - profile.birthYear));
        q.set('h', String(profile.heightCm));
        q.set('act', profile.activity);
      }
      const weight = weeklyAverage(entries, localDate()).current ?? latest(entries).weight?.value;
      if (weight) q.set('w', String(weight));
      if (alive) setSrc('./ration/#' + q.toString());
    };
    api
      .get('/api/body')
      .then((r) => open(r.data.profile || null, r.data.entries || []))
      .catch(() => open(null, []));
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
