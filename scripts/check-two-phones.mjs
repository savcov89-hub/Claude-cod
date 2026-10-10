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
console.log('0. Тренер не отмечал Ольгу; приложение тренера открыто на «Зале». Ольга пришла и записала первый подход сама');
const T = await phone('trainer', coach);
expect((await T.p.locator('.gym-tab', { hasText: 'Ольга' }).count()) === 0, 'the gym is empty at first');
const C = await phone('client', olga);
await C.p.getByRole('button', { name: 'Начать тренировку' }).click();
await C.p.waitForTimeout(1500);
// Only opening the workout is not coming to the gym; the first set is.
await sleep(1500);
expect((await T.p.locator('.gym-tab', { hasText: 'Ольга' }).count()) === 0, 'opening the workout alone does not put her in the gym');
await tick(C.p, 0, 1, 100);
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
await tick(T.p, 0, 0, 100);
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

console.log('2b. Живая запись: изменения одного телефона у другого за 2–3 с, в том числе добавленный подход');
const rowsOf = (p, ei) => journal(p).locator(`[data-w^="${ei}-"]`).count();
async function within(fn, ms = Number(process.env.WAIT || 6000)) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await fn()) return Date.now() - t0;
    await sleep(100);
  }
  return -1;
}
const addSet = (p, ei) => journal(p).locator(`[data-w="${ei}-0"]`).locator('xpath=ancestor::*[@role="table"][1]').getByRole('button', { name: 'Добавить подход' }).click();
// Lateral raise (exercise 4): 2 of 3 sets done, its third left for step 3.
await addSet(T.p, 3);
let ms = await within(async () => (await rowsOf(C.p, 3)) === 4);
expect(ms >= 0 && ms <= 3000, `the trainer added a 4th set — the client has it (${ms} ms)`, ms);
await tick(C.p, 3, 3, 20);
n++;
ms = await within(async () => (await counter(T.p)) === String(n));
expect(ms >= 0 && ms <= 3000, `the client ticked it — the trainer sees it (${ms} ms)`, ms);
// The trainer is in a field (keyboard open) while the client adds a set and ticks it.
await journal(T.p).locator('[data-w="3-2"]').focus();
await journal(T.p).locator('[data-w="3-2"]').pressSequentially('55');
await addSet(C.p, 3);
ms = await within(async () => (await rowsOf(T.p, 3)) === 5);
expect(ms >= 0 && ms <= 3000, `the client added a 5th set while the trainer types — the trainer has it (${ms} ms)`, ms);
await tick(C.p, 3, 4, 20);
n++;
ms = await within(async () => (await counter(T.p)) === String(n));
expect(ms >= 0 && ms <= 3000, `…and her set ticked there (${ms} ms)`, ms);
expect((await journal(T.p).locator('[data-w="3-2"]').inputValue()) === '55', 'the weight the trainer is typing stays in the field');
await journal(T.p).locator('[data-w="3-2"]').blur();
ms = await within(async () => (await journal(C.p).locator('[data-w="3-2"]').inputValue()) === '55');
expect(ms >= 0 && ms <= 3000, `…and reaches the client (${ms} ms)`, ms);
expect((await noConflict(T.p)) && (await noConflict(C.p)), 'no conflict banner');

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

console.log('5. Тренер в зале меняет упражнение «насовсем», а клиентка в эти секунды отмечает подходы');
await T.p.reload();
await T.p.waitForTimeout(3000);
await T.p.locator('.gym-tab', { hasText: 'Ольга' }).first().click().catch(() => {});
await T.p.waitForTimeout(1000);
const wk = await api(s.ct, 'GET', `/api/programs`);
const prog = wk.programs.find((x) => x.id === s.programId);
const dayNow = prog.days.find((d) => d.id === prog.nextDayId) || prog.days[0];
// The client's phone: saves her ticks on the third exercise every few hundred ms.
let stop = false;
let clientSaves = 0;
const clientLoop = (async () => {
  let k = 0;
  while (!stop) {
    try {
      const w = await api(s.ot, 'GET', `/api/workout/${prog.trainerId}/${prog.id}/${dayNow.id}`);
      const list = w.draft?.exercises || w.day.exercises.map((e) => ({ exerciseId: e.exerciseId, exerciseName: e.exerciseName, sets: Array.from({ length: e.sets }, () => ({ weight: 0, reps: 0, rir: null })) }));
      const next = list.map((e, i) => (i === 2 ? { ...e, sets: e.sets.map((x, j) => (j === k % e.sets.length ? { ...x, weight: 30, reps: 10 } : x)) } : e));
      await api(s.ot, 'POST', '/api/draft', { trainerId: prog.trainerId, programId: prog.id, dayId: dayNow.id, exercises: next, baseRevision: w.revision, base: list, feedback: '', localDate: today });
      clientSaves++;
      k++;
    } catch {
      /* the program changed under her: reads again */
    }
    await sleep(250);
  }
})();
await sleep(1500);
const firstEx = dayNow.exercises[0];
await journal(T.p).locator('[aria-label^="Действия с упражнением: "]').first().click();
await T.p.waitForTimeout(400);
await T.p.locator('.menu-item', { hasText: 'Заменить' }).first().click();
await T.p.waitForTimeout(400);
const ok = T.p.getByRole('button', { name: 'Выбрать замену' });
if (await ok.count()) await ok.click();
await T.p.waitForTimeout(800);
const pick = T.p.locator('.sheet').last();
const used = new Set(dayNow.exercises.map((e) => e.exerciseId));
const replName = used.has('hack-squat') ? 'Маятниковый' : 'Гакк';
await pick.locator('input').first().fill(replName);
await T.p.waitForTimeout(500);
await pick.locator('.pick').first().click();
await T.p.waitForTimeout(400);
await T.p.getByRole('button', { name: 'В программе насовсем' }).click();
await sleep(3000);
stop = true;
await clientLoop;
const after = (await api(s.ct, 'GET', `/api/programs`)).programs.find((x) => x.id === s.programId);
const saved = after.days.find((d) => d.id === dayNow.id).exercises[0];
expect(saved.exerciseId !== firstEx.exerciseId, `replaced in the program for good while she was ticking (${firstEx.exerciseId} → ${saved.exerciseId}; her saves: ${clientSaves})`, saved.exerciseId);
expect(!(await T.p.getByText('Не сохранилось в программе').count()), 'no «not saved» on the trainer phone');
const w2 = await api(s.ct, 'GET', `/api/workout/${prog.trainerId}/${prog.id}/${dayNow.id}`);
const herSets = w2.draft?.exercises?.[2]?.sets?.filter((x) => x.reps > 0).length || 0;
expect(herSets > 0, `her ticked sets are still there (${herSets})`, w2.draft?.exercises?.[2]);
expect(w2.draft?.exercises?.[0]?.exerciseId === saved.exerciseId, 'and the open workout already has the new exercise', w2.draft?.exercises?.[0]);

console.log('6. Клиентка на главном экране, тренер завершает — у неё сразу следующая тренировка; новое имя от тренера');
await C.p.goto(APP);
await C.p.waitForTimeout(3000);
const homeBefore = (await C.p.innerText('.main')).replace(/\s+/g, ' ');
expect(/Тренировка идёт/.test(homeBefore) && homeBefore.includes('Следующая: ' + dayNow.name), 'her home: the workout under way, «Следующая: ' + dayNow.name + '»', homeBefore.slice(0, 200));
await journal(T.p).getByRole('button', { name: /Завершить тренировку/ }).click();
await T.p.getByRole('button', { name: 'Завершить', exact: true }).click();
await sleep(2500);
await api(s.ct, 'POST', `/api/client/${s.clientId}/update`, { clientName: 'Ольга Новикова' });
// She comes back to the app (it was in the background).
await C.p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
const nextDay = prog.days[(prog.days.findIndex((d) => d.id === dayNow.id) + 1) % prog.days.length];
ms = await within(async () => {
  const t = (await C.p.innerText('.main')).replace(/\s+/g, ' ');
  return !/Тренировка идёт/.test(t) && t.includes('Следующая: ' + nextDay.name) && t.includes('Ольга Новикова');
}, 8000);
expect(ms >= 0, `at once: no «Тренировка идёт», «Следующая: ${nextDay.name}», her new name (${ms} ms)`, (await C.p.innerText('.main')).replace(/\s+/g, ' ').slice(0, 200));

console.log(errs.length ? 'Замечания:\n  ' + errs.join('\n  ') : 'Ошибок страницы нет');
console.log(`\n${checks} проверок, ошибок: ${failures}`);
await browser.close();
process.exit(failures ? 1 : 0);
