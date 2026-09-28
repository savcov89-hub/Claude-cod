// Persistence for the test build. Order of preference:
// 1) the artifact's shared database (same data on every device that opens the link),
// 2) this browser's localStorage, 3) memory only.
import { dirty, tables, type Row } from './sdk';

const LS_KEY = 'training-log-local-v3';
type Mode = 'shared' | 'browser' | 'memory';
let mode: Mode = 'memory';
let cloudDb: any = null;
const lastWritten = new Map<string, string>();
const queues = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

export const storageMode = () => mode;
export const onRemoteChange = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

const docId = (name: string) => name.replace(/[^a-zA-Z0-9_\-.~:@+]/g, '_').slice(0, 190);

async function useCloud() {
  const c = (window as any).claude;
  if (!c?.use) return null;
  try {
    return await Promise.race([
      c.use('db'),
      new Promise((resolve) => setTimeout(() => resolve(null), 4000)),
    ]);
  } catch {
    return null;
  }
}

function replaceAll(snapshot: Record<string, Row[]>) {
  tables.clear();
  for (const [name, rows] of Object.entries(snapshot)) tables.set(name, rows);
}

/** Loads saved data. Returns true when something was loaded. */
export async function loadStore(): Promise<boolean> {
  cloudDb = await useCloud();
  if (cloudDb) {
    try {
      const snap = await cloudDb.collection('tables').limit(1000).get();
      mode = 'shared';
      const data: Record<string, Row[]> = {};
      for (const d of snap.docs) {
        const body = d.data();
        if (!body?.name) continue;
        // Snapshots from the shared store are frozen; keep a mutable copy.
        const rowsJson = JSON.stringify(body.rows || []);
        data[body.name] = JSON.parse(rowsJson);
        lastWritten.set(body.name, rowsJson);
      }
      replaceAll(data);
      subscribe();
      return snap.size > 0;
    } catch {
      cloudDb = null;
    }
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    mode = 'browser';
    if (raw) {
      replaceAll(JSON.parse(raw));
      return true;
    }
    return false;
  } catch {
    mode = 'memory';
    return false;
  }
}

function subscribe() {
  cloudDb.collection('tables').onSnapshot(
    (snap: any) => {
      let changed = false;
      for (const change of snap.docChanges()) {
        const body = change.doc.data();
        if (!body?.name) continue;
        const rowsJson = JSON.stringify(body.rows || []);
        if (change.type === 'removed') {
          tables.delete(body.name);
          lastWritten.delete(body.name);
          changed = true;
        } else if (lastWritten.get(body.name) !== rowsJson && !dirty.has(body.name)) {
          tables.set(body.name, JSON.parse(rowsJson));
          lastWritten.set(body.name, rowsJson);
          changed = true;
        }
      }
      if (changed) listeners.forEach((fn) => fn());
    },
    () => undefined,
  );
}

/** Writes tables changed by the last request. */
export async function flush() {
  const names = Array.from(dirty);
  dirty.clear();
  if (!names.length) return;
  if (mode === 'shared' && cloudDb) {
    const write = (name: string) => {
      const rowsJson = JSON.stringify(tables.get(name) || []);
      lastWritten.set(name, rowsJson);
      const prev = queues.get(name) || Promise.resolve();
      const next = prev
        .catch(() => undefined)
        .then(() => cloudDb.doc('tables/' + docId(name)).set({ name, rows: JSON.parse(rowsJson) }))
        .catch(async () => {
          // One retry after a short pause, then give up on this write.
          await new Promise((r) => setTimeout(r, 400 + Math.random() * 400));
          await cloudDb.doc('tables/' + docId(name)).set({ name, rows: JSON.parse(rowsJson) });
        });
      queues.set(name, next);
      return next;
    };
    // A few writes at a time keeps the store's rate limits happy.
    for (let i = 0; i < names.length; i += 6)
      await Promise.all(names.slice(i, i + 6).map((n) => write(n).catch(() => undefined)));
  } else if (mode === 'browser') {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(Object.fromEntries(tables)));
    } catch {
      mode = 'memory';
    }
  }
}

/** Removes all saved data (used by "Сбросить тестовые данные"). */
export async function wipe() {
  const names = Array.from(new Set([...tables.keys(), ...lastWritten.keys()]));
  tables.clear();
  dirty.clear();
  if (mode === 'shared' && cloudDb) {
    for (const name of names) {
      lastWritten.delete(name);
      try {
        await cloudDb.doc('tables/' + docId(name)).delete();
      } catch {
        /* next load reseeds anyway */
      }
    }
  } else {
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      /* memory only */
    }
  }
}

export function markAllDirty() {
  for (const name of tables.keys()) dirty.add(name);
}
