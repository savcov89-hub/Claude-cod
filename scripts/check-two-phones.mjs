// Two real phones on one workout against a local Supabase: the trainer in the gym tab and the client in her app
// record the same workout at the same time; then one finishes while the other still types; then the client
// finishes offline after the trainer already did. Nothing may be lost or recorded twice, and no conflicts shown.
//
//   npx supabase start …; npm run build:api; docker restart supabase_edge_runtime_training-log
//   VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=… APPDEPLOY_VITE_OUT_DIR=/tmp/dist-local npx vite build
//   npx vite preview --outDir /tmp/dist-local --port 4173
//   ANON=… SRK=… node scripts/check-two-phones.mjs
import { chromium } from 'playwright';

const APP = process.env.APP || 'http://127.0.0.1:4173/';
const SB = process.env.SB || 'http://127.0.0.1:54321';
const { ANON, SRK } = process.env;
if (!ANON || !SRK) throw new Error('ANON and SRK are needed');
const SHOTS = process.env.SHOTS || '';

let failures = 0;
let checks = 0;
const expect = (ok, what, detail) => {
  checks++;
  if (ok) return console.log('  ✓ ' + what);
  failures++;
  console.log('  ✗ ' + what + (detail === undefined ? '' : '\n    ' + JSON.stringify(detail).slice(0, 500)));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function createUser(email, password) {
  const r = await fetch(`${SB}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!r.ok) throw new Error('createUser ' + r.status + ' ' + (await r.text()));
}
async function tokenOf(email, password) {
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('token ' + JSON.stringify(j));
  return j.access_token;
}
async function api(token, method, path, body) {
  const r = await fetch(`${SB}/functions/v1/api${path}`, {
    method,
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${j.error}`);
  return j;
}

const stamp = Date.now();
const pass = 'Pass-' + stamp;
const coach = { email: `coach${stamp}@example.com`, password: pass };
const olga = { email: `olga${stamp}@example.com`, password: pass };

const today = new Date().toISOString().slice(0, 10);
async function setup() {
  await createUser(coach.email, coach.password);
  await createUser(olga.email, olga.password);
  const ct = await tokenOf(coach.email, coach.password);
  const ot = await tokenOf(olga.email, olga.password);
  await api(ct, 'POST', '/api/profile', { role: 'trainer', name: 'Михаил' });
  const { client } = await api(ct, 'POST', '/api/clients', { clientName: 'Ольга' });
  const { code } = await api(ct, 'POST', '/api/invites', { clientId: client.clientId });
  await api(ot, 'POST', '/api/profile', { role: 'client', name: 'Ольга' });
  await api(ot, 'POST', '/api/connect', { code });
  const day = (id, name, list) => ({ id, name, exercises: list.map((exerciseId) => ({ exerciseId, sets: 3, repMin: 8, repMax: 12, targetRir: 2 })) });
  const { program } = await api(ct, 'POST', '/api/programs', {
    clientId: client.clientId,
    name: 'Всё тело',
    days: [day('day-1', 'Всё тело A', ['leg-press', 'lat-pulldown', 'seated-leg-curl', 'lateral-raise']), day('day-2', 'Всё тело B', ['bench-press', 'seated-row'])],
  });
  return { ct, ot, clientId: client.clientId, programId: program.id };
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errs = [];
async function phone(who, creds) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(who + ' pageerror: ' + e.message));
  p.on('response', (r) => {
    if (r.status() === 409) errs.push(who + ' 409 ' + r.url());
  });
  await p.goto(APP);
  await p.getByPlaceholder('you@example.com').fill(creds.email);
  await p.locator('input[type=password]').fill(creds.password);
  await p.getByRole('button', { name: 'Войти', exact: true }).click();
  await p.waitForTimeout(2500);
  return { ctx, p };
}
/** Scope of the open journal on a phone. */
const journal = (p) => p.locator('.gym-pane:not([hidden]) .journal, .main .journal').first();
const counter = async (p) => ((await journal(p).innerText()).match(/(\d+)\/(\d+)/) || [])[1];
async function tick(p, ei, si, weight) {
  const j = journal(p);
  const w = j.locator(`[data-w="${ei}-${si}"]`);
  if (weight !== undefined && !(await w.inputValue())) await w.fill(String(weight));
  await w.locator('xpath=ancestor::*[contains(@class,"set-row")][1]').getByRole('button', { name: /^Подход выполнен/ }).click();
}
const noConflict = async (p) => !(await p.getByText('Журнал изменили на другом устройстве').count());

const s = await setup();
console.log('0. Тренер не отмечал Ольгу; приложение тренера открыто на «Зале». Ольга пришла и начала тренировку сама');
const T = await phone('trainer', coach);
expect((await T.p.locator('.gym-tab', { hasText: 'Ольга' }).count()) === 0, 'the gym is empty at first');
const C = await phone('client', olga);
await C.p.getByRole('button', { name: 'Начать тренировку' }).click();
await C.p.waitForTimeout(1500);
let seenAfter = 0;
for (let t = 0; t < 40; t++) {
  if (await T.p.locator('.gym-tab', { hasText: 'Ольга' }).count()) {
    seenAfter = t + 1;
    break;
  }
  await sleep(1000);
}
expect(seenAfter > 0, `the trainer sees Ольга in the gym without touching the app (after ${seenAfter} s)`);

console.log('1. Отмечают одновременно разные подходы');
await Promise.all([tick(T.p, 0, 0, 100), tick(C.p, 0, 1, 100)]);
await Promise.all([tick(T.p, 1, 0, 50), tick(C.p, 2, 0, 30)]);
await sleep(6500);
expect((await counter(T.p)) === '4' && (await counter(C.p)) === '4', 'both phones show 4 done sets', [await counter(T.p), await counter(C.p)]);
expect((await noConflict(T.p)) && (await noConflict(C.p)), 'no «changed on another device» banner');

console.log('2. Быстрое чередование: отметки вперемешку с паузами 0–1,5 с');
let n = 4;
const plan = [
  [T, 0, 2], [C, 1, 1], [T, 1, 2], [C, 2, 1], [T, 2, 2], [C, 3, 0], [T, 3, 1],
];
for (const [ph, ei, si] of plan) {
  await tick(ph.p, ei, si, 20);
  n++;
  await sleep(Math.floor(Math.random() * 1500));
}
await sleep(7000);
const tc = await counter(T.p);
const cc = await counter(C.p);
expect(tc === String(n) && cc === String(n), `both phones show all ${n} sets`, [tc, cc]);
expect((await noConflict(T.p)) && (await noConflict(C.p)), 'still no conflict banner');
if (SHOTS) {
  await T.p.screenshot({ path: SHOTS + '/two-trainer.png' });
  await C.p.screenshot({ path: SHOTS + '/two-client.png' });
}

console.log('3. Тренер завершает, а клиентка в эту секунду отмечает ещё подход');
const cTick = tick(C.p, 3, 2, 20); // not sent yet when the trainer finishes
await journal(T.p).getByRole('button', { name: /Завершить тренировку/ }).click();
await cTick;
await T.p.getByRole('button', { name: 'Завершить', exact: true }).click();
await sleep(8000);
const h1 = await api(s.ct, 'GET', `/api/client/${s.clientId}/history`);
const done1 = h1.sessions[0]?.exercises.reduce((k, e) => k + e.sets.length, 0);
expect(h1.sessions.length === 1, 'one workout recorded', h1.sessions.length);
expect(done1 === n + 1, `all ${n + 1} sets in it, the client's last one too`, done1);
expect(h1.open.length === 0, 'nothing left unfinished', h1.open);
const cText = (await C.p.innerText('.main')).replace(/\s+/g, ' ');
expect(!/Журнал изменили/.test(cText), "client's phone shows no conflict", cText.slice(0, 200));

console.log('4. Следующая тренировка: клиентка без сети, тренер записывает и завершает раньше');
await C.p.goto(APP);
await C.p.waitForTimeout(2500);
await C.p.getByRole('button', { name: 'Начать тренировку' }).click();
await C.p.waitForTimeout(1500);
await T.p.reload();
await T.p.waitForTimeout(3000);
await tick(T.p, 0, 0, 80);
await sleep(5500);
await C.ctx.setOffline(true);
await tick(C.p, 1, 0, 40);
await tick(C.p, 1, 1, 40);
await journal(C.p).getByRole('button', { name: /Завершить тренировку/ }).click();
await C.p.getByRole('button', { name: 'Завершить', exact: true }).click();
await sleep(1500);
await tick(T.p, 0, 1, 80);
await sleep(1500);
await journal(T.p).getByRole('button', { name: /Завершить тренировку/ }).click();
await T.p.getByRole('button', { name: 'Завершить', exact: true }).click();
await sleep(3000);
await C.ctx.setOffline(false);
await C.p.evaluate(() => window.dispatchEvent(new Event('online')));
await sleep(9000);
const h2 = await api(s.ct, 'GET', `/api/client/${s.clientId}/history`);
const last = h2.sessions[0];
const sets2 = last?.exercises.reduce((k, e) => k + e.sets.length, 0);
expect(h2.sessions.length === 2, 'two workouts in total (not three)', h2.sessions.length);
expect(sets2 === 4, "the offline client's 2 sets joined the trainer's 2", last?.exercises.map((e) => e.exerciseId + ':' + e.sets.length));
const failed = await C.p.getByText('Не удалось отправить').count();
expect(!failed, 'no «could not send» on the client phone');

console.log(errs.length ? 'Замечания:\n  ' + errs.join('\n  ') : 'Ошибок страницы нет');
console.log(`\n${checks} проверок, ошибок: ${failures}`);
await browser.close();
process.exit(failures ? 1 : 0);
