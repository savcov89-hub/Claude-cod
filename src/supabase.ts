import { createClient, type Session, type SupabaseClient, type User } from '@supabase/supabase-js';
import { afterPost, clearCached, flushOutbox, isNetworkError, loadCached, networkError, outbox, queueIfPossible, saveCached } from './offline';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let client: SupabaseClient | null = null;
const sb = () => {
  if (!url || !key) throw new Error('Сервер не настроен: нужны VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY.');
  return (client ||= createClient(url, key));
};

export interface AuthUser {
  userId: string;
  email?: string;
  name?: string;
}
const toUser = (u: User): AuthUser => ({
  userId: u.id,
  email: u.email,
  name: u.user_metadata?.full_name || u.user_metadata?.name,
});

/**
 * The signed-in session. Offline, an expired token cannot be refreshed and supabase-js reports no session;
 * the stored one still says who is signed in, so the app opens with its saved data.
 */
async function currentSession(): Promise<Session | null> {
  const { data, error } = await sb().auth.getSession();
  if (data.session) return data.session;
  if (error && (!navigator.onLine || /fetch|network|load failed/i.test(error.message))) {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && /^sb-.+-auth-token$/.test(k)) {
          const stored = JSON.parse(localStorage.getItem(k) || 'null');
          if (stored?.user?.id) return stored as Session;
        }
      }
    } catch {
      /* no stored session */
    }
  }
  if (error) throw error;
  return null;
}

export const auth = {
  async getUser() {
    const session = await currentSession();
    return session ? toUser(session.user) : null;
  },
  /** Whether Google sign-in is switched on in the Supabase project. */
  async googleEnabled() {
    if (!url || !key) return false;
    try {
      const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
      return !!(await res.json())?.external?.google;
    } catch {
      return false;
    }
  },
  async signInWithGoogle() {
    const { error } = await sb().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin + location.pathname },
    });
    if (error) throw error;
  },
  async sendLink(email: string) {
    const { error } = await sb().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: location.origin + location.pathname },
    });
    if (error) throw error;
  },
  /** Email + password (accounts the trainer creates for clients, or after setting a password). */
  async signInWithPassword(email: string, password: string) {
    const { data, error } = await sb().auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.user ? toUser(data.user) : null;
  },
  /** Email with a link that signs in and asks for a new password (the app sees `type=recovery`). */
  async resetPassword(email: string) {
    const { error } = await sb().auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    if (error) throw error;
  },
  async setPassword(password: string) {
    const { error } = await sb().auth.updateUser({ password });
    if (error) throw error;
  },
  /** The code from the sign-in email: signs in right here, even if the email opened in another app. */
  async verifyCode(email: string, code: string) {
    const { data, error } = await sb().auth.verifyOtp({ email, token: code, type: 'email' });
    if (error) throw error;
    return data.user ? toUser(data.user) : null;
  },
  async signOut() {
    const session = await currentSession().catch(() => null);
    await sb().auth.signOut();
    if (session) clearCached(session.user.id);
  },
};

/** One request to the server; a request that never got an answer throws a network error. */
async function send(method: 'GET' | 'POST', path: string, body: unknown, token?: string): Promise<{ data: any }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw networkError();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), method === 'GET' ? 12000 : 20000);
  let res: Response;
  try {
    res = await fetch(`${url}/functions/v1/api${path}`, {
      method,
      signal: abort.signal,
      headers: {
        apikey: key!,
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    throw networkError(err);
  } finally {
    clearTimeout(timer);
  }
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(payload?.error || 'Ошибка ' + res.status);
    err.response = { status: res.status, data: payload };
    throw err;
  }
  return { data: payload };
}

/**
 * Online: the answer, and a GET is saved on the device. Offline: the saved answer of a GET, or a check-in,
 * workout or measurement put in the outbox (sent in order when the network is back).
 */
async function call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ data: any }> {
  const session = await currentSession().catch(() => null);
  const userId = session?.user.id;
  // Something is still waiting to be sent: new records of the same kind go after it.
  if (method === 'POST' && userId && outbox(userId).length) {
    const queued = queueIfPossible(userId, path, body);
    if (queued) {
      afterPost(userId, path, body, queued);
      void syncOutbox();
      return { data: queued };
    }
  }
  try {
    const res = await send(method, path, body, session?.access_token);
    // The live draft check runs every few seconds; it is not worth keeping offline.
    if (method === 'GET' && userId && !path.startsWith('/api/draft/')) saveCached(userId, path, res.data);
    if (method === 'POST' && userId) afterPost(userId, path, body, res.data);
    return res;
  } catch (err) {
    if (!isNetworkError(err) || !userId) throw err;
    if (method === 'GET') {
      const saved = loadCached(userId, path);
      if (saved) return { data: saved.data };
      throw err;
    }
    const queued = queueIfPossible(userId, path, body);
    if (queued) {
      afterPost(userId, path, body, queued);
      return { data: queued };
    }
    throw err;
  }
}

/** Sends what waited for the network; runs on start, when the network comes back and every half minute. */
export async function syncOutbox() {
  const session = await currentSession().catch(() => null);
  if (!session || !outbox(session.user.id).length) return;
  await flushOutbox(session.user.id, async (path, body) => {
    const fresh = await currentSession();
    return send('POST', path, body, fresh?.access_token);
  });
}
/** Id of the signed-in account, also offline. */
export const currentUserId = async () => (await currentSession().catch(() => null))?.user.id || null;
if (typeof window !== 'undefined' && url && key && !/[?&]demo=1/.test(location.search)) {
  window.addEventListener('online', () => void syncOutbox());
  setInterval(() => navigator.onLine && void syncOutbox(), 30000);
  setTimeout(() => void syncOutbox(), 2000);
}

/**
 * A live signal between the phones open on one workout: «saved, revision …». It carries no entries (only the
 * revision and who saved); the other phone then reads the workout through the API as usual. The channel name
 * holds the program's random id, so only those who have the workout know it. Without Realtime nothing breaks:
 * the journal still checks every few seconds.
 */
export function remoteLive(name: string, onPing: (payload: { rev?: string; by?: string }) => void) {
  if (!url || !key) return null;
  try {
    const channel = sb().channel(name, { config: { broadcast: { self: false, ack: false } } });
    channel.on('broadcast', { event: 'saved' }, (m) => onPing((m.payload || {}) as { rev?: string; by?: string })).subscribe();
    return {
      ping: (payload: { rev?: string; by?: string }) => {
        void channel.send({ type: 'broadcast', event: 'saved', payload }).catch(() => undefined);
      },
      close: () => {
        void sb().removeChannel(channel).catch(() => undefined);
      },
    };
  } catch {
    return null;
  }
}

export const remoteApi = {
  get: (path: string) => call('GET', path),
  post: (path: string, body: unknown) => call('POST', path, body),
};
