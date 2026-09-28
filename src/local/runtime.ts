import { createHandler } from '../../backend/app';
import { sdk, tables, dirty, type LocalHandler } from './sdk';
import { flush, loadStore, markAllDirty, wipe, storageMode, onRemoteChange } from './store';
import { seed, DEMO_CLIENT_USERS, SEED_VERSION, TRAINER_ID, TRAINER_NAME } from './seed';

const handle = createHandler(sdk) as LocalHandler;
const names: Record<string, string> = {
  [TRAINER_ID]: TRAINER_NAME,
  ...Object.fromEntries(DEMO_CLIENT_USERS.map((u) => [u.userId, u.name])),
};

let queue: Promise<unknown> = Promise.resolve();
let ready: Promise<void> | null = null;
let actorId = TRAINER_ID;

const safeSession = {
  get(key: string) {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      /* per-tab convenience only */
    }
  },
};
actorId = safeSession.get('tl-actor') || TRAINER_ID;

export const localActors = {
  trainer: { userId: TRAINER_ID, name: TRAINER_NAME },
  clients: DEMO_CLIENT_USERS,
};
export const getActor = () => actorId;
export const setActor = (id: string) => {
  actorId = id;
  safeSession.set('tl-actor', id);
};
export { storageMode, onRemoteChange };

async function raw(userId: string, method: string, path: string, body?: unknown) {
  const res = await handle(method, path, body, { userId, name: names[userId], email: '' });
  await flush();
  if (res.status >= 400) {
    const err: any = new Error(res.data?.error || 'Ошибка ' + res.status);
    err.response = { status: res.status, data: res.data };
    throw err;
  }
  return res.data;
}

export function initLocal() {
  ready ||= (async () => {
    const loaded = await loadStore();
    // Sample data from an older test version is replaced automatically.
    const version = tables.get('meta')?.[0]?.r?.version;
    if (!loaded) await reseedInternal();
    else if (version !== SEED_VERSION) {
      await wipe();
      await reseedInternal();
    }
  })();
  return ready;
}

async function reseedInternal() {
  const direct = (actor: string, method: string, path: string, body?: unknown) => {
    return handle(method, path, body, { userId: actor, name: names[actor], email: '' }).then((res) => {
      if (res.status >= 400) throw new Error(path + ': ' + res.data?.error);
      return res.data;
    });
  };
  await seed(direct);
  tables.set('meta', [{ id: 'seed', r: { version: SEED_VERSION } }]);
  dirty.add('meta');
  markAllDirty();
  await flush();
}

export async function resetLocal() {
  await wipe();
  await reseedInternal();
}

export const localApi = {
  get: (path: string) => {
    const run = queue.then(async () => ({ data: await raw(actorId, 'GET', path) }));
    queue = run.catch(() => undefined);
    return run;
  },
  post: (path: string, body: unknown) => {
    const run = queue.then(async () => ({ data: await raw(actorId, 'POST', path, body) }));
    queue = run.catch(() => undefined);
    return run;
  },
};
