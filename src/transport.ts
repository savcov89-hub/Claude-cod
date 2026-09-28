import { remoteApi as remote } from './supabase';
import { localApi } from './local/runtime';

/** Test build (artifact) or ?demo=1: requests run in the browser against sample data. */
export const isLocal = () => {
  if (import.meta.env.VITE_LOCAL_ONLY === '1') return true;
  try {
    return new URLSearchParams(location.search).get('demo') === '1';
  } catch {
    return false;
  }
};
export const isArtifactBuild = import.meta.env.VITE_LOCAL_ONLY === '1';

export const api = {
  get: (path: string): Promise<{ data: any }> => (isLocal() ? localApi.get(path) : remote.get(path)),
  post: (path: string, body: unknown): Promise<{ data: any }> =>
    isLocal() ? localApi.post(path, body) : remote.post(path, body),
};

/** "In the gym" mark lasts 12 hours. */
export const inGym = (at?: string | null) => !!at && Date.now() - new Date(at).getTime() < 12 * 3600000;

export const readError = (err: unknown) => {
  if (typeof err === 'object' && err !== null) {
    const e = err as { response?: { data?: { error?: string } }; message?: string; code?: string };
    return e.response?.data?.error || e.message || e.code || 'Что-то пошло не так';
  }
  return 'Что-то пошло не так';
};

export const safeStorage = {
  get(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* nothing stored */
    }
  },
};
