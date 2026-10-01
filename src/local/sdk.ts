// In-browser database so the real request logic (backend/app.ts) runs in the demo build. Tables live in memory and are persisted by ./store.
import type { Db, Sdk } from '../../backend/app';
import { error, json, requireAuth, router, type Handler } from '../../backend/router';

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
  async remove(name: string, ids: string[]) {
    const t = tables.get(name);
    if (!t) return;
    tables.set(name, t.filter((r) => !ids.includes(r.id)));
    dirty.add(name);
  },
};

// The demo has no real sign-in: an account is just a new id (one per email).
const demoAccounts = new Map<string, string>();
const accounts = {
  async createUser(email: string) {
    if (demoAccounts.has(email)) return { exists: true };
    const userId = 'demo-login-' + newId();
    demoAccounts.set(email, userId);
    return { userId };
  },
  async findUser(email: string) {
    return demoAccounts.get(email) || null;
  },
  async setPassword() {},
};
export const sdk = { db, accounts, error, json, requireAuth, router } as unknown as Sdk;
export type LocalHandler = Handler;
