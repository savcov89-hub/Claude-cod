// HTTP entry for backend/app.ts on Supabase: web-standard Request/Response, rows kept in one Postgres table.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHandler, type Accounts, type Ctx, type Db, type Sdk } from './app';
import { error, json, requireAuth, router, type Handler } from './router';

const ROWS = 'kv_rows';

type Row = { id: string; data: Record<string, unknown>; seq: number };

const withoutId = (record: unknown) => {
  const { id: _ignored, ...rest } = (record ?? {}) as Record<string, unknown>;
  return rest;
};

function check<T>(op: string, res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(`db.${op}: ${res.error.message}`);
  return res.data as T;
}

export function supabaseDb(sb: SupabaseClient): Db {
  return {
    async list<T>(table: string, opts: { limit?: number; nextToken?: string } = {}) {
      const limit = Math.min(Math.max(opts.limit || 100, 1), 1000);
      let q = sb.from(ROWS).select('id,data,seq').eq('tbl', table).order('seq').limit(limit);
      if (opts.nextToken) q = q.gt('seq', Number(opts.nextToken));
      const rows = check<Row[]>('list', await q) ?? [];
      return {
        items: rows.map((r) => ({ ...r.data, id: r.id }) as T & { id: string }),
        nextToken: rows.length === limit ? String(rows[rows.length - 1].seq) : null,
      };
    },
    async get<T>(table: string, ids: string[]) {
      if (!ids.length) return [];
      const rows = check<Array<Pick<Row, 'id' | 'data'>>>('get', await sb.from(ROWS).select('id,data').eq('tbl', table).in('id', ids)) ?? [];
      const byId = new Map(rows.map((r) => [r.id, r]));
      return ids.map((id) => {
        const row = byId.get(id);
        return row ? ({ ...row.data, id } as T) : null;
      });
    },
    async add<T>(table: string, records: T[], ids?: string[]) {
      if (!records.length) return [];
      // Ids are made here so the returned order always matches the input order.
      const rows = records.map((r, i) => ({ tbl: table, id: ids?.[i] || crypto.randomUUID(), data: withoutId(r) }));
      check('add', await sb.from(ROWS).insert(rows));
      return rows.map((r) => r.id);
    },
    async update<T>(table: string, rows: Array<{ id: string; record: T }>) {
      return Promise.all(
        rows.map(async ({ id, record }) => {
          const res = await sb.from(ROWS).update({ data: withoutId(record) }).eq('tbl', table).eq('id', id).select('id');
          return (check<Array<{ id: string }>>('update', res) ?? []).length > 0;
        }),
      );
    },
    async remove(table: string, ids: string[]) {
      if (!ids.length) return;
      check('remove', await sb.from(ROWS).delete().eq('tbl', table).in('id', ids));
    },
    async swap<T>(table: string, rowId: string | null, record: T, expected: string | null) {
      const data = withoutId(record);
      if (rowId === null) {
        // The first row of the table has a fixed id, so of two first writes only one gets in.
        const res = await sb.from(ROWS).insert({ tbl: table, id: 'one', data });
        if (res.error && (res.error as { code?: string }).code === '23505') return false;
        check('swap', res);
        return true;
      }
      // One statement: the row is changed only if it still has the expected revision.
      const q = sb.from(ROWS).update({ data }).eq('tbl', table).eq('id', rowId);
      const res = await (expected === null ? q.is('data->>revision', null) : q.eq('data->>revision', expected)).select('id');
      return (check<Array<{ id: string }>>('swap', res) ?? []).length > 0;
    },
  };
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const reply = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });

/** Supabase serves the function under /api (its name) and sometimes /functions/v1; routes themselves start with /api. */
export function routePath(pathname: string) {
  const p = pathname.replace(/^\/functions\/v1(?=\/)/, '');
  return p === '/api/api' || p.startsWith('/api/api/') ? p.slice(4) : p;
}

export function createServer(deps: { db: Db; getUser: (token: string) => Promise<Ctx['user']>; accounts?: Accounts }) {
  const handle = createHandler({ db: deps.db, accounts: deps.accounts, error, json, requireAuth, router } as unknown as Sdk) as Handler;
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    try {
      const url = new URL(req.url);
      const token = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
      const user = token ? await deps.getUser(token) : null;
      let body: unknown;
      if (req.method === 'POST') {
        try {
          body = await req.json();
        } catch {
          return reply(400, { error: 'Неверный формат запроса.' });
        }
      }
      const res = await handle(req.method, routePath(url.pathname) + url.search, body, user);
      return reply(res.status, res.data);
    } catch (e) {
      console.error(e);
      return reply(500, { error: 'Ошибка сервера. Попробуйте ещё раз.' });
    }
  };
}

/** Production wiring: service-role client for rows and for checking the caller's token. */
export function createSupabaseServer(supabaseUrl: string, serviceRoleKey: string) {
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return createServer({
    db: supabaseDb(admin),
    accounts: {
      async createUser(email, password) {
        const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
        if (error) {
          if (/already|exists|registered/i.test(error.message)) return { exists: true };
          throw error;
        }
        return { userId: data.user.id };
      },
      async findUser(email) {
        for (let page = 1; page <= 50; page++) {
          const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
          if (error) throw error;
          const found = data.users.find((u) => (u.email || '').toLowerCase() === email);
          if (found) return found.id;
          if (data.users.length < 200) return null;
        }
        return null;
      },
      async setPassword(userId, password) {
        const { error } = await admin.auth.admin.updateUserById(userId, { password, email_confirm: true });
        if (error) throw error;
      },
    },
    async getUser(token) {
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data.user) return null;
      const u = data.user;
      const meta = u.user_metadata || {};
      return { userId: u.id, email: u.email || '', name: meta.full_name || meta.name || '' };
    },
  });
}
