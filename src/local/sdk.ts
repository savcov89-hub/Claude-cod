// In-browser stand-in for @appdeploy/sdk so the real request logic (backend/app.ts)
// runs in the test build. Tables live in memory and are persisted by ./store.
import type { Ctx, Db, Sdk } from '../../backend/app';

export type Row = { id: string; r: any };
export const tables = new Map<string, Row[]>();
export const dirty = new Set<string>();

const clone = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

const table = (name: string) => {
  let t = tables.get(name);
  if (!t) {
    t = [];
    tables.set(name, t);
  }
  return t;
};

export const db: Db = {
  async list<T>(name: string, opts: { limit?: number; nextToken?: string } = {}) {
    const rows = tables.get(name) || [];
    const start = Number(opts.nextToken || 0);
    const limit = opts.limit || 100;
    const page = rows.slice(start, start + limit);
    const end = start + page.length;
    return {
      items: page.map((row) => ({ ...clone(row.r), id: row.id })) as Array<T & { id: string }>,
      nextToken: end < rows.length ? String(end) : null,
    };
  },
  async get<T>(name: string, ids: string[]) {
    const rows = tables.get(name) || [];
    return ids.map((id) => {
      const row = rows.find((r) => r.id === id);
      return row ? ({ ...clone(row.r), id } as T) : null;
    });
  },
  async add<T>(name: string, records: T[]) {
    const t = table(name);
    dirty.add(name);
    return records.map((r) => {
      const id = newId();
      const { id: _ignored, ...rest } = clone(r) as any;
      t.push({ id, r: rest });
      return id;
    });
  },
  async update<T>(name: string, rows: Array<{ id: string; record: T }>) {
    const t = tables.get(name) || [];
    return rows.map(({ id, record }) => {
      const row = t.find((r) => r.id === id);
      if (!row) return false;
      const { id: _ignored, ...rest } = clone(record) as any;
      row.r = rest;
      dirty.add(name);
      return true;
    });
  },
};

interface Resp {
  __resp: true;
  status: number;
  data: any;
}
const json = (data: unknown, status = 200): Resp => ({ __resp: true, status, data });
const error = (message: string, status = 400): Resp => ({ __resp: true, status, data: { error: message } });
const requireAuth = () => (ctx: Ctx) => (ctx.user ? undefined : error('Требуется вход', 401));

type Handler = (ctx: Ctx) => Promise<Resp | undefined> | Resp | undefined;
const router = (routes: Record<string, Handler[]>) => {
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
  return async (method: string, url: string, body: unknown, user: Ctx['user']) => {
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

export const sdk = { db, error, json, requireAuth, router } as unknown as Sdk;
export type LocalHandler = (method: string, url: string, body: unknown, user: Ctx['user']) => Promise<Resp>;
