import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, IdCard, LogOut, Plus, Search } from 'lucide-react';
import type { ClientItem, Program } from '../types';
import { api, readError } from '../transport';
import { Journal, type JournalActivity } from './Journal';
import { activeClients, lastVisit, presentClients, programsOf, type TrainerData } from './data';
import { Avatar, Empty, Sheet, ago, clock, useNow } from './common';

interface Source {
  programId: string;
  dayId: string;
  /** A workout made up in the gym (the client's hidden "Без программы" program). */
  free?: boolean;
  trainerId?: string;
}
type Finisher = (at?: string) => Promise<boolean>;
const UNDO_MS = 5000;
const FREE = '__free';
/** A workout with no new set for this long is recorded by itself (dated to its last set) and the client leaves. */
const IDLE_MS = 60 * 60000;
/** Someone checked in who has not done a single set leaves the gym list after this long. */
const EMPTY_MS = 2 * 3600000;

const defaultProgram = (list: Program[]) =>
  [...list].sort((a, b) => (b.lastCompletedAt || b.createdAt).localeCompare(a.lastCompletedAt || a.createdAt))[0];

export function Gym({
  data,
  openClient,
  openBuilder,
}: {
  data: TrainerData;
  openClient: (clientId: string) => void;
  openBuilder: (clientId: string) => void;
}) {
  const present = presentClients(data.clients);
  const [active, setActive] = useState<string | null>(null);
  const [sources, setSources] = useState<Record<string, Source>>({});
  const [activity, setActivity] = useState<Record<string, JournalActivity>>({});
  const [finished, setFinished] = useState<Record<string, number>>({});
  const [picker, setPicker] = useState(false);
  const [leaving, setLeaving] = useState<string | null>(null);
  const finishers = useRef<Record<string, Finisher | null>>({});
  const swipe = useRef<{ x: number; y: number; t: number; lx: number; ly: number } | null>(null);
  const [slide, setSlide] = useState<{ id: string; from: 'left' | 'right' } | null>(null);
  // Clients who just pressed «Ушёл»: hidden at once, saved after UNDO_MS unless undone.
  const [going, setGoing] = useState<string[]>([]);
  // Workouts closed automatically after a long pause, shown until dismissed.
  const [autoClosed, setAutoClosed] = useState<Array<{ id: string; name: string; text: string }>>([]);
  const autoTried = useRef(new Set<string>());
  const goingClients = useRef<Record<string, { client: ClientItem; timer: ReturnType<typeof setTimeout> }>>({});
  const shown = present.filter((c) => !going.includes(c.clientId));
  const activeId = shown.some((c) => c.clientId === active) ? active : shown[0]?.clientId || null;
  const presentKey = present.map((c) => c.clientId).join(',');

  const sourceOf = (clientId: string): Source | null => {
    const list = programsOf(data.programs, clientId);
    const chosen = sources[clientId];
    if (chosen && (chosen.free || list.some((p) => p.id === chosen.programId))) return chosen;
    const p = defaultProgram(list);
    return p ? { programId: p.id, dayId: p.nextDayId || p.days[0].id } : null;
  };

  const handlers = useMemo(() => {
    const map: Record<string, { activity: (a: JournalActivity) => void; register: (f: Finisher | null) => void }> = {};
    for (const id of presentKey.split(',').filter(Boolean))
      map[id] = {
        activity: (a) =>
          setActivity((cur) => {
            const prev = cur[id];
            if (prev && prev.done === a.done && prev.total === a.total && prev.lastSetAt === a.lastSetAt && prev.current === a.current)
              return cur;
            return { ...cur, [id]: a };
          }),
        register: (f) => {
          finishers.current[id] = f;
        },
      };
    return map;
  }, [presentKey]);

  // Bring the next set to do into view whenever the trainer switches client.
  useEffect(() => {
    if (!activeId) return;
    const t = requestAnimationFrame(() => {
      const pane = document.querySelector('[data-pane="' + activeId + '"]');
      const row = pane?.querySelector('.set-row:not(.set-labels):not(.is-done)') as HTMLElement | null;
      if (row) row.scrollIntoView({ block: 'center', behavior: 'auto' });
      else {
        window.scrollTo({ top: 0 });
        document.querySelector('.main')?.scrollTo({ top: 0 });
      }
    });
    return () => cancelAnimationFrame(t);
  }, [activeId]);

  const [freeBusy, setFreeBusy] = useState<string | null>(null);
  const startFree = async (clientId: string) => {
    setFreeBusy(clientId);
    try {
      const r = await api.post('/api/free/' + encodeURIComponent(clientId), {});
      setSources((s) => ({ ...s, [clientId]: { programId: r.data.programId, dayId: r.data.dayId, trainerId: r.data.trainerId, free: true } }));
    } catch (err) {
      data.setErrorText(readError(err));
    } finally {
      setFreeBusy(null);
    }
  };

  const checkIn = async (ids: string[]) => {
    setPicker(false);
    for (const id of ids) {
      const c = data.clients.find((x) => x.clientId === id);
      autoTried.current.delete(id);
      if (c) await data.setPresence(c, true);
    }
    if (ids.length && !activeId) setActive(ids[0]);
  };
  // "Ушёл" saves the workout to history automatically when sets were done.
  const checkOut = async (c: ClientItem) => {
    setLeaving(c.clientId);
    try {
      const finish = finishers.current[c.clientId];
      if (finish && finished[c.clientId] === undefined) await finish();
      await data.setPresence(c, false);
      setFinished((f) => {
        const { [c.clientId]: _drop, ...rest } = f;
        return rest;
      });
    } finally {
      setLeaving(null);
    }
  };
  const checkOutRef = useRef(checkOut);
  checkOutRef.current = checkOut;
  const commitLeave = async (id: string) => {
    const entry = goingClients.current[id];
    if (!entry) return;
    clearTimeout(entry.timer);
    delete goingClients.current[id];
    try {
      await checkOutRef.current(entry.client);
    } finally {
      setGoing((ids) => ids.filter((x) => x !== id));
    }
  };
  const leave = (c: ClientItem) => {
    if (goingClients.current[c.clientId]) return;
    goingClients.current[c.clientId] = { client: c, timer: setTimeout(() => void commitLeave(c.clientId), UNDO_MS) };
    setGoing((ids) => [...ids, c.clientId]);
  };
  const undoLeave = (id: string) => {
    const entry = goingClients.current[id];
    if (!entry) return;
    clearTimeout(entry.timer);
    delete goingClients.current[id];
    setGoing((ids) => ids.filter((x) => x !== id));
    setActive(id);
  };
  // If the app is put away during the undo window, save right away so nothing is lost.
  const commitAllRef = useRef(() => Object.keys(goingClients.current).forEach((id) => void commitLeave(id)));
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && commitAllRef.current();
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  // Closes workouts left open: nobody pressed «Ушёл», e.g. the client just went home.
  const autoCloseRef = useRef<() => void>(() => undefined);
  autoCloseRef.current = () => {
    const now = Date.now();
    for (const c of shown) {
      const id = c.clientId;
      if (autoTried.current.has(id) || leaving === id) continue;
      const a = activity[id];
      const idle = a?.lastSetAt && a.done > 0 && now - a.lastSetAt > IDLE_MS;
      const empty = !a?.done && !!c.checkedInAt && now - new Date(c.checkedInAt).getTime() > EMPTY_MS;
      if (!idle && !empty) continue;
      autoTried.current.add(id);
      void (async () => {
        const finish = finishers.current[id];
        let recorded = false;
        if (idle && finish && finished[id] === undefined) {
          // Not saved (e.g. changed on another device): leave the client in the gym for the trainer to decide.
          if (!(await finish(new Date(a!.lastSetAt!).toISOString()))) return;
          recorded = true;
        }
        await data.setPresence(c, false);
        setFinished((f) => {
          const { [id]: _drop, ...rest } = f;
          return rest;
        });
        const text = recorded
          ? 'тренировка записана сама: час без новых подходов'
          : idle
            ? 'уход отмечен: час без новых подходов'
            : 'уход отмечен: 2 часа без подходов';
        setAutoClosed((list) => [...list, { id, name: c.clientName, text }]);
      })();
    }
  };
  useEffect(() => {
    autoCloseRef.current();
    const t = window.setInterval(() => autoCloseRef.current(), 60000);
    return () => clearInterval(t);
  }, [activity, presentKey]);

  const nextWorkout = (clientId: string) => {
    setFinished((f) => {
      const { [clientId]: _drop, ...rest } = f;
      return rest;
    });
    setSources((s) => {
      const { [clientId]: _drop, ...rest } = s;
      return rest;
    });
  };
  const onCompleted = useCallback(
    (clientId: string, sets: number) => {
      setFinished((f) => ({ ...f, [clientId]: sets }));
      void data.reload();
    },
    [data.reload],
  );

  const switchBy = (step: 1 | -1) => {
    const i = shown.findIndex((c) => c.clientId === activeId);
    const next = shown[i + step];
    if (!next) return;
    setActive(next.clientId);
    setSlide({ id: next.clientId, from: step > 0 ? 'right' : 'left' });
    document.querySelectorAll('.gym-tabs .gym-tab')[i + step]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    const target = e.target as HTMLElement;
    swipe.current =
      e.touches.length === 1 &&
      // Screen edges belong to the browser's back/forward gesture.
      t.clientX > 24 &&
      t.clientX < window.innerWidth - 24 &&
      target !== document.activeElement &&
      !scrollsSideways(target, e.currentTarget as HTMLElement)
        ? { x: t.clientX, y: t.clientY, t: Date.now(), lx: t.clientX, ly: t.clientY }
        : null;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!swipe.current) return;
    swipe.current.lx = e.touches[0].clientX;
    swipe.current.ly = e.touches[0].clientY;
  };
  // A drag over an input can end in touchcancel, so the last known position decides.
  const onTouchEnd = () => {
    const start = swipe.current;
    swipe.current = null;
    if (!start) return;
    const dx = start.lx - start.x;
    const dy = start.ly - start.y;
    if (Math.abs(dx) >= 60 && Math.abs(dx) > 2 * Math.abs(dy) && Date.now() - start.t < 700) switchBy(dx < 0 ? 1 : -1);
  };

  const notices = (going.length > 0 || autoClosed.length > 0) && (
    <div className="undo-stack" role="status">
      {autoClosed.map((n) => (
        <div className="undo-toast" key={'auto-' + n.id}>
          <span>
            <strong>{n.name}</strong> · {n.text}
          </span>
          <button className="undo-btn" onClick={() => setAutoClosed((list) => list.filter((x) => x !== n))}>
            Ок
          </button>
        </div>
      ))}
      {going.map((id) => (
        <div className="undo-toast" key={id}>
          <span>
            <strong>{present.find((c) => c.clientId === id)?.clientName || 'Клиент'}</strong> · уход из зала
          </span>
          <button className="undo-btn" onClick={() => undoLeave(id)}>
            Отменить
          </button>
        </div>
      ))}
    </div>
  );

  if (!present.length)
    return (
      <div className="gym">
        <div className="section-head">
          <div>
            <h2>Зал</h2>
            <p className="muted">Отметьте всех, кто пришёл, — у каждого откроется вкладка с тренировкой.</p>
          </div>
        </div>
        {activeClients(data.clients).length ? (
          <ArrivalPicker clients={activeClients(data.clients)} onDone={checkIn} />
        ) : (
          <Empty title="Клиентов пока нет" text="Добавьте их в разделе «Клиенты» — они появятся здесь." />
        )}
        {notices}
      </div>
    );

  return (
    <div className="gym">
      <div className="gym-tabs" role="tablist" aria-label="Клиенты в зале">
        {shown.map((c) => (
          <GymTab
            key={c.clientId}
            name={c.clientName}
            active={c.clientId === activeId}
            activity={activity[c.clientId]}
            done={finished[c.clientId] !== undefined}
            onClick={() => setActive(c.clientId)}
          />
        ))}
        <button className="gym-tab add" onClick={() => setPicker(true)} aria-label="Отметить пришедших">
          <Plus size={18} />
        </button>
      </div>

      {present.map((c) => {
        const src = sourceOf(c.clientId);
        const list = programsOf(data.programs, c.clientId);
        const isActive = c.clientId === activeId;
        const program = src ? list.find((p) => p.id === src.programId) : undefined;
        return (
          <div
            key={c.clientId}
            className={'gym-pane' + (slide?.id === c.clientId ? ' slide-from-' + slide.from : '')}
            hidden={!isActive}
            role="tabpanel"
            data-pane={c.clientId}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onTouchCancel={onTouchEnd}
            onAnimationEnd={() => setSlide(null)}
          >
            <div className="gym-toolbar">
              <div className="grow">
                <strong>{c.clientName}</strong>
                {c.notes?.limits ? (
                  <span className="tone-warn small ellipsis" title={c.notes.limits}>
                    ⚠ {c.notes.limits}
                  </span>
                ) : c.notes?.goal ? (
                  <span className="muted small ellipsis">{c.notes.goal}</span>
                ) : null}
              </div>
              {list.length > 0 && src && (
                <select
                  className="select-sm"
                  aria-label="Программа"
                  value={src.free ? FREE : src.programId}
                  disabled={freeBusy === c.clientId}
                  onChange={(e) => {
                    if (e.target.value === FREE) return void startFree(c.clientId);
                    const p = list.find((x) => x.id === e.target.value)!;
                    setSources((s) => ({ ...s, [c.clientId]: { programId: p.id, dayId: p.nextDayId || p.days[0].id } }));
                  }}
                >
                  {list.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                  <option value={FREE}>Свободная тренировка</option>
                </select>
              )}
              <button className="icon-btn sm" aria-label="Карточка клиента" title="Карточка клиента" onClick={() => openClient(c.clientId)}>
                <IdCard size={16} />
              </button>
              <button
                className="btn btn-sm"
                disabled={leaving === c.clientId}
                title="Отметить уход. Выполненные подходы сохранятся в историю."
                onClick={() => leave(c)}
              >
                <LogOut size={15} /> {leaving === c.clientId ? 'Сохраняем…' : 'Ушёл'}
              </button>
            </div>
            {!src || (!program && !src.free) ? (
              <Empty
                title="Нет программы"
                text="Назначьте программу — или проведите тренировку без неё, набирая упражнения по ходу."
                action={
                  <div className="row gap wrap center">
                    <button className="btn btn-primary" onClick={() => openBuilder(c.clientId)}>
                      Назначить программу
                    </button>
                    <button className="btn" disabled={freeBusy === c.clientId} onClick={() => void startFree(c.clientId)}>
                      Свободная тренировка
                    </button>
                  </div>
                }
              />
            ) : finished[c.clientId] !== undefined ? (
              <div className="done-panel">
                <span className="done-mark">
                  <Check size={28} strokeWidth={3} />
                </span>
                <h3>Тренировка записана</h3>
                <p className="muted">{finished[c.clientId]} подходов в истории.</p>
                <div className="row gap wrap center">
                  <button className="btn" onClick={() => nextWorkout(c.clientId)}>
                    Открыть следующую
                  </button>
                  <button className="btn btn-primary" onClick={() => leave(c)}>
                    <LogOut size={16} /> Ушёл
                  </button>
                </div>
              </div>
            ) : (
              <GymJournal
                clientId={c.clientId}
                trainerId={src.trainerId || program!.trainerId}
                programId={src.programId}
                dayId={src.dayId}
                onActivity={handlers[c.clientId]?.activity}
                onRegisterFinish={handlers[c.clientId]?.register}
                onDayChange={(dayId) => setSources((s) => ({ ...s, [c.clientId]: { programId: src.programId, dayId } }))}
                onCompleted={onCompleted}
                onProgramChanged={data.reload}
              />
            )}
          </div>
        );
      })}

      {!shown.length && <Empty title="В зале никого" text="Отметьте пришедших кнопкой «+»." />}

      {notices}

      {picker && (
        <Sheet title="Кто пришёл?" onClose={() => setPicker(false)}>
          <ArrivalPicker clients={activeClients(data.clients).filter((c) => !present.includes(c))} onDone={checkIn} />
        </Sheet>
      )}
    </div>
  );
}

/** True when the touch starts inside something that scrolls sideways itself (e.g. the day picker). */
function scrollsSideways(el: HTMLElement | null, stop: HTMLElement) {
  for (; el && el !== stop; el = el.parentElement) {
    const ox = getComputedStyle(el).overflowX;
    if ((ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth) return true;
  }
  return false;
}

/** Journal wrapper that re-renders only when its workout changes. */
const GymJournal = memo(
  function GymJournal(props: {
    clientId: string;
    trainerId: string;
    programId: string;
    dayId: string;
    onActivity?: (a: JournalActivity) => void;
    onRegisterFinish?: (f: Finisher | null) => void;
    onDayChange: (dayId: string) => void;
    onCompleted: (clientId: string, sets: number) => void;
    onProgramChanged: () => void;
  }) {
    return (
      <Journal
        embedded
        source={{ trainerId: props.trainerId, programId: props.programId, dayId: props.dayId }}
        onActivity={props.onActivity}
        onRegisterFinish={props.onRegisterFinish}
        onDayChange={props.onDayChange}
        onCompleted={({ sets }) => props.onCompleted(props.clientId, sets)}
        onProgramChanged={props.onProgramChanged}
      />
    );
  },
  (a, b) =>
    a.clientId === b.clientId &&
    a.programId === b.programId &&
    a.dayId === b.dayId &&
    a.onActivity === b.onActivity &&
    a.onRegisterFinish === b.onRegisterFinish,
);

function GymTab({
  name,
  active,
  activity: a,
  done,
  onClick,
}: {
  name: string;
  active: boolean;
  activity?: JournalActivity;
  done: boolean;
  onClick: () => void;
}) {
  const now = useNow(1000);
  const rest = a?.lastSetAt && a.done < a.total ? now - a.lastSetAt : null;
  return (
    <button
      role="tab"
      aria-selected={active}
      className={'gym-tab' + (active ? ' active' : '') + (rest && rest > 180000 ? ' waiting' : '') + (done ? ' finished' : '')}
      onClick={onClick}
    >
      <strong className="gt-name">{name}</strong>
      <span className="gt-sub">
        <span className="num" title={rest !== null ? 'С последнего подхода' : 'Подходов сделано'}>
          {done ? <Check size={12} /> : rest !== null ? clock(rest) : a ? a.done + '/' + a.total : ''}
        </span>
        <span className="gt-cur">{done ? 'записано' : a?.current || (a ? 'всё отмечено' : '…')}</span>
      </span>
    </button>
  );
}

/** Tick everyone who came in, then confirm once. */
function ArrivalPicker({ clients, onDone }: { clients: ClientItem[]; onDone: (ids: string[]) => void }) {
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const weekday = new Date().getDay();
  const score = (c: ClientItem) => (c.visits || []).filter((d) => new Date(d + 'T12:00:00').getDay() === weekday).length;
  const list = clients
    .filter((c) => c.clientName.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => score(b) - score(a) || a.clientName.localeCompare(b.clientName));
  if (!clients.length) return <Empty title="Все клиенты уже в зале" />;
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <div className="arrivals">
      <label className="search">
        <Search size={16} />
        <input id="arrival-search" placeholder="Найти клиента" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {list.map((c) => {
        const on = picked.includes(c.clientId);
        return (
          <button key={c.clientId} className={'arrival' + (on ? ' on' : '')} onClick={() => toggle(c.clientId)} aria-pressed={on}>
            <Avatar name={c.clientName} live={on} />
            <span className="grow">
              <strong>{c.clientName}</strong>
              <span className="muted small">
                {score(c) ? 'Обычно в этот день · ' : ''}
                {ago(lastVisit(c))}
              </span>
            </span>
            <span className={'check' + (on ? ' on' : '')}>{on && <Check size={16} strokeWidth={3} />}</span>
          </button>
        );
      })}
      <div className="sticky-foot">
        <button className="btn btn-primary btn-block" disabled={!picked.length} onClick={() => onDone(picked)}>
          {picked.length ? 'Пришли: ' + picked.length : 'Отметьте пришедших'}
        </button>
      </div>
    </div>
  );
}
