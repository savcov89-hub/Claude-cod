// Offline support for the server API: the last answer of every GET is kept on the device and shown
// when there is no network; workouts, check-ins and measurements made offline wait in an outbox
// and are sent in order as soon as the network is back.

const GET_PREFIX = 'tl-get:';
const OUTBOX_PREFIX = 'tl-outbox:';
const FAILED_PREFIX = 'tl-outbox-failed:';
/** Requests that may wait for the network: the answer is known in advance. */
const QUEUEABLE: Array<[RegExp, (body: any) => Record<string, unknown>]> = [
  [/^\/api\/sessions$/, () => ({ saved: true })],
  [/^\/api\/attendance$/, (b) => ({ checkedInAt: b?.present ? b.at || new Date().toISOString() : null })],
  [/^\/api\/body$/, (b) => ({ entry: b })],
  [/^\/api\/body\/profile$/, (b) => ({ profile: b })],
];

export interface OutboxItem {
  path: string;
  body: unknown;
  at: string;
}

/** True for a request that never reached the server (no network, DNS, timeout). */
export const isNetworkError = (err: unknown) => !!(err as { offline?: boolean } | null)?.offline;
export const networkError = (cause?: unknown) => {
  const err: any = new Error('Нет сети. Запись сохранена на телефоне и отправится, когда появится интернет.');
  err.offline = true;
  err.cause = cause;
  return err;
};

const read = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  const text = JSON.stringify(value);
  try {
    localStorage.setItem(key, text);
    return true;
  } catch {
    // Storage full: saved answers are the first to go (they come back online).
    clearCached();
    try {
      localStorage.setItem(key, text);
      return true;
    } catch {
      return false;
    }
  }
};

// ---------- saved answers ----------
export function saveCached(userId: string, path: string, data: unknown) {
  const text = JSON.stringify(data);
  if (text.length > 400_000) return;
  write(GET_PREFIX + userId + ':' + path, { at: new Date().toISOString(), data });
}
export function loadCached(userId: string, path: string): { at: string; data: any } | null {
  return read(GET_PREFIX + userId + ':' + path, null);
}
/** Removes saved answers (all, or one account's). */
export function clearCached(userId?: string) {
  try {
    const prefix = GET_PREFIX + (userId ? userId + ':' : '');
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(prefix)) localStorage.removeItem(k);
    }
  } catch {
    /* nothing stored */
  }
}

/**
 * Keeps saved answers in step with a check-in made on this device (sent or waiting), so a reload
 * without network still shows who is in the gym.
 */
export function afterPost(userId: string, path: string, body: any, data: any) {
  // A saved draft: the saved workout answer gets it too, so a reload without network opens the latest entries
  // (not the ones from when the journal was first opened).
  if (path === '/api/draft' && data?.revision && body?.trainerId) {
    const key = '/api/workout/' + body.trainerId + '/' + body.programId + '/' + body.dayId;
    const saved = loadCached(userId, key);
    if (!saved?.data) return;
    const draft = { ...(saved.data.draft || {}), exercises: body.exercises, feedback: body.feedback || '', updatedAt: data.updatedAt, revision: data.revision, closed: false };
    saveCached(userId, key, { ...saved.data, draft, revision: data.revision });
    return;
  }
  if (path !== '/api/attendance' || !body?.clientId) return;
  const saved = loadCached(userId, '/api/clients');
  if (!saved?.data?.clients) return;
  const today = typeof body.localDate === 'string' ? body.localDate : null;
  const clients = saved.data.clients.map((c: any) =>
    c.clientId === body.clientId
      ? {
          ...c,
          checkedInAt: data?.checkedInAt ?? null,
          visits: body.present && today ? Array.from(new Set([...(c.visits || []), today])) : c.visits,
        }
      : c,
  );
  saveCached(userId, '/api/clients', { ...saved.data, clients });
}

// ---------- outbox ----------
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());
/** Called when the outbox, the failures or the network state change. */
export function onOfflineChange(f: () => void) {
  listeners.add(f);
  return () => void listeners.delete(f);
}
export const outbox = (userId: string) => read<OutboxItem[]>(OUTBOX_PREFIX + userId, []);
export const outboxFailures = (userId: string) => read<string[]>(FAILED_PREFIX + userId, []);
export function dismissFailures(userId: string) {
  write(FAILED_PREFIX + userId, []);
  notify();
}
/** The answer a queued request gets right away, or null when it cannot wait. */
export function queueIfPossible(userId: string, path: string, body: unknown) {
  const rule = QUEUEABLE.find(([re]) => re.test(path));
  if (!rule) return null;
  if (!write(OUTBOX_PREFIX + userId, [...outbox(userId), { path, body, at: new Date().toISOString() } satisfies OutboxItem])) return null;
  notify();
  return { ...rule[1](body), queued: true };
}

let flushing: Promise<void> | null = null;
/**
 * Sends the outbox in order. A request the server refuses is dropped and reported; a network failure stops
 * the run and keeps the rest for the next time.
 */
export function flushOutbox(userId: string, send: (path: string, body: unknown) => Promise<unknown>) {
  if (flushing) return flushing;
  flushing = (async () => {
    try {
      for (;;) {
        const [item] = outbox(userId);
        if (!item) break;
        try {
          await send(item.path, item.body);
        } catch (err) {
          if (isNetworkError(err)) break;
          const msg = (err as any)?.response?.data?.error || (err as Error)?.message || 'ошибка';
          write(FAILED_PREFIX + userId, [...outboxFailures(userId), `${describe(item.path)} от ${new Date(item.at).toLocaleString('ru-RU')}: ${msg}`]);
        }
        write(OUTBOX_PREFIX + userId, outbox(userId).slice(1));
        notify();
      }
    } finally {
      flushing = null;
      notify();
    }
  })();
  return flushing;
}
const describe = (path: string) =>
  /sessions/.test(path) ? 'Тренировка' : /attendance/.test(path) ? 'Отметка «Пришёл/Ушёл»' : /body/.test(path) ? 'Замеры' : 'Запись';

if (typeof window !== 'undefined') {
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);
}
