// Runs the sample-data scenario against the in-memory database and against local Supabase
// (`npx supabase start`), then checks the API answers match. Wipes kv_rows first — local use only.
// SRK=<local service_role key> npx tsx scripts/supabase-parity.ts
import { createClient } from '@supabase/supabase-js';
import { createHandler } from '../backend/app';
import { createServer, supabaseDb } from '../backend/server';
import { sdk } from '../src/local/sdk';
import { seed, TRAINER_ID, DEMO_CLIENT_USERS } from '../src/local/seed';

if (!process.env.SRK) throw new Error('Set SRK to the local service_role key (npx supabase status).');
const sb = createClient('http://127.0.0.1:54321', process.env.SRK, { auth: { persistSession: false } });
await sb.from('kv_rows').delete().neq('tbl', '');
const user = (id: string) => ({ userId: id, name: id, email: '' });

const mem: any = createHandler(sdk);
const memCall = async (a: string, m: string, p: string, b?: unknown) => {
  const r = await mem(m, p, b, user(a));
  if (r.status >= 400) throw new Error(p + ': ' + r.data?.error);
  return r.data;
};
const server = createServer({ db: supabaseDb(sb), getUser: async (t) => user(t) });
const pgCall = async (a: string, m: string, p: string, b?: unknown) => {
  const res = await server(new Request('http://x/api' + p, { method: m, headers: { authorization: 'Bearer ' + a }, body: b === undefined ? undefined : JSON.stringify(b) }));
  const data = await res.json();
  if (res.status >= 400) throw new Error(p + ': ' + data?.error);
  return data;
};

let t = Date.now(); await seed(memCall); console.log('memory seed ms', Date.now() - t);
t = Date.now(); await seed(pgCall); console.log('postgres seed ms', Date.now() - t);

function norm(v: any) {
  const ids = new Map<string, string>();
  const walk = (x: any): any => {
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, walk(v)]));
    if (typeof x === 'string') {
      if (/^\d{4}-\d\d-\d\dT/.test(x)) return x.slice(0, 13);
      if (/^(c-)?[0-9a-f]{8}-[0-9a-f]{4}-/.test(x) || /^[A-Z0-9]{6,8}$/.test(x)) { if (!ids.has(x)) ids.set(x, 'ID' + ids.size); return ids.get(x); }
    }
    return x;
  };
  return JSON.stringify(walk(v));
}
const checks: Array<[string, string]> = [[TRAINER_ID, '/api/me'], [TRAINER_ID, '/api/clients'], [TRAINER_ID, '/api/programs'], [TRAINER_ID, '/api/exercises']];
for (const u of DEMO_CLIENT_USERS) checks.push([u.userId, '/api/me'], [u.userId, '/api/my-programs'], [u.userId, '/api/my-history']);
let same = 0, diff = 0;
const run = async (a: string, p: string) => {
  const [x, y] = [norm(await memCall(a, 'GET', p)), norm(await pgCall(a, 'GET', p))];
  if (x === y) same++; else { diff++; console.log('DIFF', a, p, '\n mem', x.slice(0, 300), '\n pg ', y.slice(0, 300)); }
};
for (const [a, p] of checks) await run(a, p);
const memClients = (await memCall(TRAINER_ID, 'GET', '/api/clients')).clients;
const pgClients = (await pgCall(TRAINER_ID, 'GET', '/api/clients')).clients;
for (let i = 0; i < pgClients.length; i++) {
  const [x, y] = [norm(await memCall(TRAINER_ID, 'GET', `/api/client/${memClients[i].clientId}/history`)), norm(await pgCall(TRAINER_ID, 'GET', `/api/client/${pgClients[i].clientId}/history`))];
  if (x === y) same++; else { diff++; console.log('DIFF history', i, x.length, y.length); }
}
console.log('clients', pgClients.length, 'responses same', same, 'different', diff);
const progs = (await pgCall(TRAINER_ID, 'GET', '/api/programs')).programs;
const other = progs.find((p: any) => p.clientName === 'Александр');
try { await pgCall('demo-u1', 'GET', `/api/workout/${TRAINER_ID}/${other.id}/${other.days[0].id}`); console.log('LEAK'); } catch (e: any) { console.log('access check ok:', e.message); }
try { await pgCall('stranger', 'GET', `/api/client/${pgClients[0].clientId}/history`); console.log('LEAK2'); } catch (e: any) { console.log('stranger blocked:', e.message); }
const { count } = await sb.from('kv_rows').select('*', { count: 'exact', head: true });
console.log('rows in postgres', count);
