import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

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

export const auth = {
  async getUser() {
    const { data, error } = await sb().auth.getSession();
    if (error) throw error;
    return data.session ? toUser(data.session.user) : null;
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
  async signOut() {
    await sb().auth.signOut();
  },
};

async function call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ data: any }> {
  const { data } = await sb().auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`${url}/functions/v1/api${path}`, {
    method,
    headers: {
      apikey: key!,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(payload?.error || 'Ошибка ' + res.status);
    err.response = { status: res.status, data: payload };
    throw err;
  }
  return { data: payload };
}

export const remoteApi = {
  get: (path: string) => call('GET', path),
  post: (path: string, body: unknown) => call('POST', path, body),
};
