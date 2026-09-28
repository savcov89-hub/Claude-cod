// Platform-neutral request plumbing for backend/app.ts, shared by the Supabase function and the demo build.
import type { Ctx } from './app';

export interface Resp {
  __resp: true;
  status: number;
  data: any;
}
export type Handler = (method: string, url: string, body: unknown, user: Ctx['user']) => Promise<Resp>;

const clone = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

export const json = (data: unknown, status = 200): Resp => ({ __resp: true, status, data });
export const error = (message: string, status = 400): Resp => ({ __resp: true, status, data: { error: message } });
export const requireAuth = () => (ctx: Ctx) => (ctx.user ? undefined : error('Требуется вход', 401));

type Step = (ctx: Ctx) => Promise<Resp | undefined> | Resp | undefined;
export const router = (routes: Record<string, Step[]>): Handler => {
  const compiled = Object.entries(routes).map(([key, chain]) => {
    const [method, path] = key.split(' ');
    const names: string[] = [];
    const re = new RegExp(
      '^' +
        path.replace(/:[a-zA-Z]+/g, (m) => {
          names.push(m.slice(1));
          return '([^/]+)';
        }) +
        '$',
    );
    return { method, re, names, chain };
  });
  return async (method, url, body, user) => {
    const [path, qs] = url.split('?');
    const query = Object.fromEntries(new URLSearchParams(qs || ''));
    for (const route of compiled) {
      if (route.method !== method) continue;
      const m = path.match(route.re);
      if (!m) continue;
      const params = Object.fromEntries(route.names.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
      const ctx: Ctx = { user, body: clone(body), params, query };
      for (const step of route.chain) {
        const out = await step(ctx);
        if (out) return out;
      }
      return error('Пустой ответ', 500);
    }
    return error('Раздел не найден', 404);
  };
};
