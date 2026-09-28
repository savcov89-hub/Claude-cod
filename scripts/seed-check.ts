import { createHandler } from '../backend/app';
import { sdk, tables } from '../src/local/sdk';
import { seed, TRAINER_ID } from '../src/local/seed';
const handle: any = createHandler(sdk);
const call = async (actor: string, method: string, path: string, body?: unknown) => {
  const res = await handle(method, path, body, { userId: actor, name: actor, email: '' });
  if (res.status >= 400) throw new Error(path + ': ' + res.data?.error);
  return res.data;
};
const t0 = Date.now();
await seed(call);
console.log('seed ms', Date.now() - t0, 'tables', tables.size, 'bytes', JSON.stringify(Object.fromEntries(tables)).length);
const { clients } = await call(TRAINER_ID, 'GET', '/api/clients');
for (const c of clients) console.log(c.clientName, c.userId, 'visits', c.visits?.length, 'inGym', !!c.checkedInAt, 'review', c.needsReview, JSON.stringify(c.insights && { st: c.insights.stalls, dr: c.insights.drops, pr: c.insights.prs.length, s30: c.insights.sessions30 }));
const h = await call(TRAINER_ID, 'GET', '/api/client/' + clients[0].clientId + '/history');
console.log('sessions A', h.sessions.length, h.sessions[0].dayName, JSON.stringify(h.sessions[0].exercises[0]));
const mp = await call('demo-u1', 'GET', '/api/my-programs');
console.log('maria programs', mp.programs.length, mp.coaches[0].trainerName);
const mh = await call('demo-u1', 'GET', '/api/my-history');
console.log('maria history', mh.sessions.length);
// negative: client cannot open other client's workout
const progs = (await call(TRAINER_ID, 'GET', '/api/programs')).programs;
const other = progs.find((p: any) => p.clientName === 'Александр');
try { await call('demo-u1', 'GET', `/api/workout/${TRAINER_ID}/${other.id}/${other.days[0].id}`); console.log('LEAK'); } catch (e: any) { console.log('ok blocked:', e.message); }
