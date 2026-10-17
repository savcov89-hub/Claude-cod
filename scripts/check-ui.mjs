// The app in a phone-sized browser (test mode, ?demo=1), CPU slowed down like a phone: every way a workout
// is recorded from the screens, and how smooth it is — rows that jump, scroll that moves by itself, typing that
// loses focus, taps that take long to answer.
//   npm run dev  (or APP=…)   then   node scripts/check-ui.mjs [--slow=4] [--shots=dir]
import { chromium } from 'playwright';

const APP = process.env.APP || 'http://127.0.0.1:5173/?demo=1';
const arg = (k, d) => (process.argv.find((a) => a.startsWith('--' + k + '=')) || '').split('=')[1] || d;
const SLOW = Number(arg('slow', 4));
const SHOTS = arg('shots', '');
// --only=30,31: just these numbered scenarios (after the first four, which set the day up).
const ONLY = arg('only', '').split(',').filter(Boolean);

let failures = 0;
let checks = 0;
const notes = [];
const expect = (ok, what, detail) => {
  checks++;
  if (ok) return console.log('  ✓ ' + what);
  failures++;
  console.log('  ✗ ' + what + (detail === undefined ? '' : '\n    ' + JSON.stringify(detail).slice(0, 500)));
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
// Layout shifts (with and without a recent tap), long tasks and slow answers to taps/keys, from the first paint.
await ctx.addInitScript(() => {
  const P = (window.__perf = { shifts: [], long: [], events: [] });
  const name = (n) => {
    if (!n || !n.getAttribute) return n?.nodeName || '';
    return n.getAttribute('aria-label') || n.getAttribute('data-w') || (n.className && String(n.className).split(' ')[0]) || n.nodeName;
  };
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) P.shifts.push({ v: e.value, t: e.startTime, input: e.hadRecentInput, src: (e.sources || []).map((s) => name(s.node)).join(', ') });
    }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) P.long.push({ d: Math.round(e.duration), t: e.startTime });
    }).observe({ type: 'longtask', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (e.interactionId) P.events.push({ name: e.name, d: Math.round(e.duration), t: e.startTime, target: name(e.target) });
    }).observe({ type: 'event', durationThreshold: 16, buffered: true });
  } catch {
    /* older engine */
  }
});
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
p.on('console', (m) => m.type() === 'error' && !/ERR_CERT|ERR_FAILED|favicon/.test(m.text()) && errs.push('console: ' + m.text()));
// Fonts come from Google; the sandbox may block them — not the app's error.
p.on('requestfailed', (r) => !/fonts\.(googleapis|gstatic)/.test(r.url()) && errs.push('request failed: ' + r.url()));
const cdp = await ctx.newCDPSession(p);

const call = (m, path, body) =>
  p.evaluate(async ([m, path, body]) => {
    const api = window.__tlApi || (await import('/src/transport.ts')).api;
    return (m === 'get' ? await api.get(path) : await api.post(path, body)).data;
  }, [m, path, body]);
const now = () => p.evaluate(() => performance.now());
const scrollOf = () => p.evaluate(() => Math.round(window.scrollY + (document.querySelector('.main')?.scrollTop || 0)));
const pane = () => p.locator('.gym-pane:not([hidden])');

/**
 * One interaction, measured: how far `watch` moved on screen, how far the page scrolled by itself, slow answers
 * and long tasks while it ran, shifts not caused by the tap itself.
 */
async function measure(label, watch, action, opts = {}) {
  const box0 = watch ? await watch.boundingBox() : null;
  const s0 = await scrollOf();
  const t0 = await now();
  await action();
  await p.waitForTimeout(opts.wait ?? 900);
  const box1 = watch ? await watch.boundingBox().catch(() => null) : null;
  const s1 = await scrollOf();
  const perf = await p.evaluate((t0) => {
    const P = window.__perf;
    return {
      shifts: P.shifts.filter((x) => x.t >= t0),
      long: P.long.filter((x) => x.t >= t0),
      events: P.events.filter((x) => x.t >= t0),
    };
  }, t0);
  const moved = box0 && box1 ? Math.round(Math.abs(box1.y - box0.y)) : null;
  const slowest = perf.events.reduce((m, e) => Math.max(m, e.d), 0);
  const longest = perf.long.reduce((m, e) => Math.max(m, e.d), 0);
  const shift = perf.shifts.filter((x) => !x.input).reduce((m, x) => m + x.v, 0);
  const row = { label, moved, scrolled: s1 - s0, slowestTap: slowest, longestTask: longest, shift: Math.round(shift * 1000) / 1000, sources: [...new Set(perf.shifts.map((x) => x.src))].filter(Boolean).slice(0, 4) };
  notes.push(row);
  return row;
}

console.log(`Телефон: 390×844, процессор медленнее в ${SLOW} раза`);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: SLOW });
await p.goto(APP);
await p.waitForSelector('.nav', { timeout: 30000 });
await p.waitForTimeout(1500);

// ---------- gym: check-in and record ----------
console.log('1. Зал: пришёл, отметки подходов, ввод веса');
const PAVEL = (await call('get', '/api/clients')).clients.find((c) => c.clientName === 'Павел').clientId;
await p.getByText('Павел').first().click();
await p.getByRole('button', { name: /Пришли: 1/ }).click();
await p.waitForTimeout(2000);
const row00 = pane().locator('[data-w="0-0"]').locator('xpath=ancestor::*[contains(@class,"set-row")][1]');
let m = await measure('ввод веса (3 цифры)', row00, async () => {
  await pane().locator('[data-w="0-0"]').tap();
  await p.keyboard.type('125', { delay: 120 });
});
const focusKept = await p.evaluate(() => document.activeElement?.getAttribute('data-w'));
expect(focusKept === '0-0', 'the field keeps focus while typing', focusKept);
expect(m.moved === 0 && m.scrolled === 0, 'typing does not move the row or scroll', m);
const typed = await pane().locator('[data-w="0-0"]').inputValue();
expect(typed === '125', 'typed value is there', typed);
m = await measure('отметка подхода ✓', row00, () => row00.getByRole('button', { name: /^Подход выполнен|Снять отметку/ }).tap());
expect(m.moved === 0, 'the ticked row stays in place', m);
expect(m.scrolled === 0, 'the page does not scroll by itself', m);
const row01 = pane().locator('[data-w="0-1"]').locator('xpath=ancestor::*[contains(@class,"set-row")][1]');
m = await measure('вторая отметка ✓ (вес подставлен)', row01, () => row01.getByRole('button', { name: /^Подход выполнен/ }).tap());
expect(m.moved === 0 && m.scrolled === 0, 'second tick: nothing jumps', m);
const row02 = pane().locator('[data-w="0-2"]').locator('xpath=ancestor::*[contains(@class,"set-row")][1]');
const next = pane().locator('[data-w="1-0"]');
// Frame by frame: the next exercise must slide up, not jump.
const sampler = p.evaluate(() => new Promise((done) => {
  const el = document.querySelector('.gym-pane:not([hidden]) [data-w="1-0"]');
  const ys = [];
  const t0 = performance.now();
  const step = () => {
    ys.push(el.getBoundingClientRect().top);
    if (performance.now() - t0 < 2200) requestAnimationFrame(step);
    else done(ys);
  };
  requestAnimationFrame(step);
}));
m = await measure('последний подход упражнения ✓ (карточка сворачивается)', next, () => row02.getByRole('button', { name: /^Подход выполнен/ }).tap(), { wait: 1500 });
const ys = await sampler;
let jump = 0;
for (let i = 1; i < ys.length; i++) jump = Math.max(jump, Math.abs(ys[i] - ys[i - 1]));
notes.push({ label: '  ↳ следующее упражнение: всего / за один кадр', moved: m.moved, scrolled: Math.round(jump) });
expect(jump < 100, 'the next exercise slides up instead of jumping (largest step in one frame)', Math.round(jump));
const holdSeen = ys.slice(0, 20).every((y) => Math.abs(y - ys[0]) < 2);
expect(holdSeen, 'the finished exercise stays open a moment before folding');
m = await measure('кнопка «+» подход', pane().locator('[data-w="1-0"]'), () => pane().getByRole('button', { name: 'Добавить подход' }).nth(1).tap());
expect(m.moved === 0 && m.scrolled === 0, 'adding a set does not move the exercise', m);
m = await measure('кнопка «−» подход', pane().locator('[data-w="1-0"]'), () => pane().getByRole('button', { name: 'Убрать подход' }).nth(1).tap());
expect(m.moved === 0 && m.scrolled === 0, 'removing a set does not move the exercise', m);
m = await measure('столбец RIR', pane().locator('[data-w="1-0"]'), () => pane().getByRole('button', { name: /^RIR$/ }).first().tap());
expect(m.scrolled === 0, 'RIR toggle does not scroll', m);
await pane().getByRole('button', { name: /^RIR$/ }).first().tap();
m = await measure('меню упражнения (открыть)', null, () => pane().getByRole('button', { name: /^Действия с упражнением/ }).nth(1).tap(), { wait: 700 });
await p.keyboard.press('Escape');
await p.waitForTimeout(400);
if (await p.locator('.sheet').count()) await p.locator('.sheet-backdrop, .backdrop').first().click({ position: { x: 10, y: 10 } }).catch(() => {});
await p.waitForTimeout(400);

// ---------- live update from the other phone while this one is scrolled ----------
console.log('2. Запись с другого телефона, пока здесь пролистано вниз');
await p.evaluate(() => document.querySelector('.main').scrollTo(0, 400));
await p.waitForTimeout(500);
const prog = (await call('get', '/api/programs')).programs.find((x) => x.clientId === PAVEL);
const d = await call('get', `/api/draft/${prog.trainerId}/${prog.id}/day-1`);
const theirs = d.exercises.map((e, i) => (i === 2 ? { ...e, sets: e.sets.map((s, k) => (k === 0 ? { weight: 30, reps: 12, rir: null } : s)) } : e));
const watchRow = pane().locator('[data-w="1-0"]');
m = await measure('подход с другого телефона приходит (живое обновление)', watchRow, async () => {
  await call('post', '/api/draft', { trainerId: prog.trainerId, programId: prog.id, dayId: 'day-1', baseRevision: d.revision, base: d.exercises, feedback: '', exercises: theirs, localDate: '2026-10-02' });
  await p.waitForTimeout(5000);
});
expect(m.scrolled === 0 && (m.moved ?? 0) <= 2, 'the screen does not jump when the other phone writes', m);
const cnt = (await pane().innerText()).match(/(\d+)\/(\d+)/)?.[1];
expect(cnt === '4', 'the other phone\'s set is shown', cnt);
// Typing while an update comes in: focus and text stay.
await pane().locator('[data-w="1-0"]').tap();
await p.keyboard.type('6', { delay: 80 });
const d2 = await call('get', `/api/draft/${prog.trainerId}/${prog.id}/day-1`);
const theirs2 = d2.exercises.map((e, i) => (i === 3 ? { ...e, sets: e.sets.map((s, k) => (k === 0 ? { weight: 8, reps: 15, rir: null } : s)) } : e));
await call('post', '/api/draft', { trainerId: prog.trainerId, programId: prog.id, dayId: 'day-1', baseRevision: d2.revision, base: d2.exercises, feedback: '', exercises: theirs2, localDate: '2026-10-02' });
await p.waitForTimeout(1500);
await p.keyboard.type('0', { delay: 80 });
await p.waitForTimeout(5500);
const focus2 = await p.evaluate(() => [document.activeElement?.getAttribute('data-w'), document.activeElement?.value]);
expect(focus2[0] === '1-0' && focus2[1] === '60', 'typing is not interrupted by the other phone', focus2);
await p.keyboard.press('Tab');
await p.waitForTimeout(6000);
const cnt2 = (await pane().innerText()).match(/(\d+)\/(\d+)/)?.[1];
expect(cnt2 === '5', 'after typing, the other phone\'s new set is there too', cnt2);
if (SHOTS) await p.screenshot({ path: SHOTS + '/ui-gym.png' });
// Safari keeps no scroll anchor: an exercise folding above the screen must not move what is on screen.
await p.addStyleTag({ content: '* { overflow-anchor: none !important; }' });
await p.evaluate(() => document.activeElement?.blur());
await p.waitForTimeout(2500);
await p.evaluate(() => {
  const el = document.querySelector('.gym-pane:not([hidden]) [data-w="3-0"]');
  document.querySelector('.main').scrollBy(0, el.getBoundingClientRect().top - 220);
});
await p.waitForTimeout(600);
const d3 = await call('get', `/api/draft/${prog.trainerId}/${prog.id}/day-1`);
const done1 = d3.exercises.map((e, i) => (i === 1 ? { ...e, sets: e.sets.map(() => ({ weight: 20, reps: 10, rir: null })) } : e));
m = await measure('другой телефон закончил упражнение выше экрана (как в Safari)', pane().locator('[data-w="3-0"]'), async () => {
  await call('post', '/api/draft', { trainerId: prog.trainerId, programId: prog.id, dayId: 'day-1', baseRevision: d3.revision, base: d3.exercises, feedback: '', exercises: done1, localDate: '2026-10-02' });
  await p.waitForTimeout(5500);
});
expect((m.moved ?? 99) <= 2, 'what is on screen stays put when something above folds (Safari)', m);

// ---------- switching clients, finishing ----------
console.log('3. Завершение, «Ушёл», история');
m = await measure('«Завершить тренировку» → подтверждение', null, async () => {
  await pane().getByRole('button', { name: /Завершить тренировку/ }).tap();
  await p.getByRole('button', { name: 'Завершить', exact: true }).tap();
}, { wait: 2500 });
const h = await call('get', `/api/client/${PAVEL}/history`);
const sets = h.sessions[0]?.exercises.reduce((n, e) => n + e.sets.length, 0);
expect(h.sessions.length === 1 && sets === 8, 'workout recorded with all 8 sets (own and the other phone\'s)', [h.sessions.length, sets]);

// ---------- tabs and screens ----------
console.log('4. Переходы между разделами');
for (const tab of ['Сводка', 'Клиенты', 'Программы', 'База', 'Зал']) {
  m = await measure('раздел «' + tab + '»', null, () => p.locator('.nav').getByRole('button', { name: tab }).tap(), { wait: 1200 });
}
await p.locator('.nav').getByRole('button', { name: 'Клиенты' }).tap();
await p.waitForTimeout(800);
m = await measure('карточка клиента', null, () => p.locator('.client-open:visible', { hasText: 'Павел' }).first().tap(), { wait: 1500 });
for (const tab of ['Программы', 'Замеры', 'История', 'Прогресс', 'Обзор']) {
  m = await measure('карточка → «' + tab + '»', null, () => p.getByRole('tab', { name: tab }).tap(), { wait: 1200 });
}

// ---------- every way to record, from the screens ----------
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
const clients = (await call('get', '/api/clients')).clients;
const idOf = (name) => clients.find((c) => c.clientName === name).clientId;
const historyOf = async (name) => (await call('get', `/api/client/${idOf(name)}/history`)).sessions;
const programOf = async (name) => (await call('get', '/api/programs')).programs.find((x) => x.clientId === idOf(name));
/** Celebration sheets after a workout (new records) are closed like a person would. */
const dismiss = async () => {
  const cool = p.getByRole('button', { name: 'Круто!' });
  if (await cool.count()) await cool.first().click();
  await p.waitForTimeout(200);
};
const goGym = async () => {
  await dismiss();
  // Exactly «Назад»: an exercise name may contain the word («Отведение ноги назад…»).
  const back = p.locator('.main').getByRole('button', { name: 'Назад', exact: true });
  if (await back.count()) await back.first().click();
  await p.locator('.nav').getByRole('button', { name: 'Зал' }).click();
  await p.waitForTimeout(600);
};
async function checkIn(name) {
  await goGym();
  const add = p.getByRole('button', { name: 'Отметить пришедших' });
  if (await add.count()) await add.click();
  await p.locator('.arrival', { hasText: name }).first().click();
  await p.getByRole('button', { name: /Пришли: 1/ }).click();
  await p.waitForTimeout(1200);
  await p.locator('.gym-tab', { hasText: name }).first().click();
  await p.waitForTimeout(600);
}
async function tickNext(scope, w = 40) {
  const row = scope.locator('.set-row:not(.set-labels):not(.is-done)').first();
  const input = row.locator('[data-w]');
  if ((await input.count()) && !(await input.inputValue())) await input.fill(String(w));
  await row.getByRole('button', { name: /^Подход выполнен/ }).click();
  await p.waitForTimeout(300);
}
async function finishHere(scope) {
  await scope.getByRole('button', { name: /Завершить тренировку/ }).click();
  await p.getByRole('button', { name: 'Завершить', exact: true }).click();
  await p.waitForTimeout(1500);
  await dismiss();
}
async function pick(name) {
  await p.locator('#picker-search').fill(name);
  await p.waitForTimeout(300);
  await p.locator('.pick', { hasText: name }).first().click();
  await p.waitForTimeout(400);
}
const scenario = async (title, fn) => {
  if (ONLY.length && !ONLY.includes(title.split('.')[0])) return;
  console.log(title);
  try {
    await fn();
  } catch (err) {
    const lines = String(err.message || err).split('\n');
    expect(false, 'сценарий прошёл без сбоя', lines[0] + ' ' + (lines.find((l) => /waiting for/.test(l)) || ''));
    if (SHOTS) await p.screenshot({ path: SHOTS + '/ui-fail-' + title.split('.')[0] + '.png' }).catch(() => {});
    await p.keyboard.press('Escape').catch(() => {});
  }
};

await scenario('5. «Ушёл» записывает тренировку', async () => {
  await goGym();
  await p.locator('.gym-tab', { hasText: 'Павел' }).first().click();
  await pane().getByRole('button', { name: 'Открыть следующую' }).click();
  await p.waitForTimeout(1000);
  const before = (await historyOf('Павел')).length;
  await tickNext(pane(), 30);
  await tickNext(pane(), 30);
  await pane().getByRole('button', { name: /Ушёл/ }).first().click();
  await p.waitForTimeout(7000);
  const after = await historyOf('Павел');
  expect(after.length === before + 1 && after[0].exercises.reduce((n, e) => n + e.sets.length, 0) === 2, '«Ушёл» recorded the 2 sets', after.length);
});

await scenario('6. Журнал из карточки клиента', async () => {
  const before = (await historyOf('Мария')).length;
  const prog = await programOf('Мария');
  await p.locator('.nav').getByRole('button', { name: 'Клиенты' }).click();
  await p.waitForTimeout(500);
  await p.locator('.client-open:visible', { hasText: 'Мария' }).first().click();
  await p.waitForTimeout(800);
  await p.getByRole('tab', { name: 'Программы' }).click();
  await p.waitForTimeout(500);
  await p.getByRole('button', { name: new RegExp(prog.days[1].name) }).first().click();
  await p.getByRole('button', { name: 'Открыть журнал · ' + prog.days[1].name }).click();
  await p.waitForTimeout(1200);
  const j = p.locator('.main .journal').first();
  await tickNext(j, 20);
  await tickNext(j, 20);
  await tickNext(j, 20);
  await finishHere(j);
  const after = await historyOf('Мария');
  expect(after.length === before + 1 && after[0].dayName === prog.days[1].name, 'recorded from the client card as «' + prog.days[1].name + '»', after[0]?.dayName);
  await p.getByRole('button', { name: 'Назад', exact: true }).first().click().catch(() => {});
});

await scenario('7. Замена упражнения на сегодня', async () => {
  await checkIn('Дмитрий');
  const first = (await pane().locator('.ex h3').first().innerText()).trim();
  await pane().getByRole('button', { name: 'Действия с упражнением: ' + first }).click();
  await p.locator('.menu-item', { hasText: 'Заменить' }).first().click();
  await p.waitForTimeout(500);
  await pick('Тяга каната к лицу');
  await p.getByRole('button', { name: 'Только сегодня' }).click();
  await p.waitForTimeout(800);
  const now = (await pane().locator('.ex h3').first().innerText()).trim();
  expect(now === 'Тяга каната к лицу', 'the swapped exercise is on the card', now);
  await tickNext(pane(), 15);
  await finishHere(pane());
  const h = await historyOf('Дмитрий');
  expect(h[0]?.exercises.some((e) => e.exerciseId === 'face-pull'), 'the record has the replacement', h[0]?.exercises.map((e) => e.exerciseId));
  const prog = await programOf('Дмитрий');
  const dayA = prog.days.find((d) => d.exercises.some((e) => e.exerciseName === first));
  expect(dayA?.exercises[0].exerciseName === first && !dayA.exercises.some((e) => e.exerciseId === 'face-pull'), 'the program day is unchanged (today only)', dayA?.exercises.map((e) => e.exerciseId));
});

await scenario('8. Добавленное в зале упражнение', async () => {
  await pane().getByRole('button', { name: 'Открыть следующую' }).click();
  await p.waitForTimeout(1000);
  const dayName = (await pane().locator('.day-switch').innerText()).split('\n')[0].trim();
  await pane().getByRole('button', { name: /Упражнение/ }).last().click();
  await p.waitForTimeout(500);
  await pick('Шраги в рычажном тренажёре (блины)');
  await p.getByRole('button', { name: 'Добавить в тренировку' }).click();
  await p.waitForTimeout(800);
  const added = pane().locator('.ex', { hasText: 'Шраги' });
  await tickNext(added, 40);
  await tickNext(pane(), 20);
  await finishHere(pane());
  const h = await historyOf('Дмитрий');
  expect(h[0]?.exercises.some((e) => e.exerciseId === 'plate-shrug'), 'the added exercise is in the record', h[0]?.exercises.map((e) => e.exerciseId));
  const prog = await programOf('Дмитрий');
  const day = prog.days.find((d) => dayName.startsWith(d.name) || d.name === dayName);
  expect(!!day?.exercises.some((e) => e.exerciseId === 'plate-shrug'), 'and joined the program day', [dayName, day?.exercises.map((e) => e.exerciseId)]);
});

await scenario('9. Пропуск упражнения и порядок', async () => {
  await checkIn('Сергей');
  const names = (await pane().locator('.ex h3').allInnerTexts()).map((x) => x.trim());
  await pane().getByRole('button', { name: 'Действия с упражнением: ' + names[1] }).click();
  await p.locator('.menu-item', { hasText: 'Пропустить сегодня' }).click();
  await p.waitForTimeout(600);
  await tickNext(pane(), 20);
  await finishHere(pane());
  const h = await historyOf('Сергей');
  const ids = h[0]?.exercises.map((e) => e.exerciseName);
  expect(!!ids && !ids.includes(names[1]), 'the skipped exercise is not in the record', ids);
  await pane().getByRole('button', { name: 'Открыть следующую' }).click();
  await p.waitForTimeout(1000);
  const order0 = (await pane().locator('.ex h3').allInnerTexts()).map((x) => x.trim());
  await pane().getByRole('button', { name: 'Ниже: ' + order0[0] }).click();
  await p.waitForTimeout(500);
  await pane().getByRole('button', { name: 'Сохранить в программе' }).click();
  await p.waitForTimeout(1500);
  const prog = await programOf('Сергей');
  const inProgram = prog.days.map((d) => d.exercises.map((e) => e.exerciseName)).find((list) => list.includes(order0[0]) && list.includes(order0[1]));
  expect(!!inProgram && inProgram.indexOf(order0[1]) < inProgram.indexOf(order0[0]), 'the new order is kept in the program', inProgram);
});

await scenario('10. Не та тренировка: «сменить» с переносом подходов', async () => {
  await checkIn('Екатерина');
  await tickNext(pane(), 25);
  await pane().locator('.day-switch').click();
  await p.waitForTimeout(400);
  const other = p.locator('.sheet .menu-item:not([disabled])').first();
  const otherName = (await other.innerText()).split('\n')[0].trim();
  await other.click();
  await p.getByRole('button', { name: 'Перенести подходы' }).click();
  await p.waitForTimeout(1500);
  const cnt = (await pane().innerText()).match(/(\d+)\/(\d+)/)?.[1];
  expect(cnt === '1', 'the done set came along to «' + otherName + '»', cnt);
  await finishHere(pane());
  const h = await historyOf('Екатерина');
  expect(h[0]?.dayName === otherName && h[0].exercises.reduce((n, e) => n + e.sets.length, 0) === 1, 'recorded as the right workout', h[0]?.dayName);
});

await scenario('11. Свободная тренировка → в программу → приложение перезапустили → «Завершить»', async () => {
  await checkIn('Иван');
  await pane().getByRole('combobox', { name: 'Программа' }).selectOption({ label: 'Свободная тренировка' });
  await p.waitForTimeout(1200);
  await pane().getByRole('button', { name: /Упражнение/ }).last().click();
  await pick('Жим ногами');
  await p.getByRole('button', { name: 'Добавить в тренировку' }).click();
  await p.waitForTimeout(600);
  await tickNext(pane(), 100);
  await tickNext(pane(), 100);
  await pane().getByRole('button', { name: /Сохранить как тренировку программы/ }).click();
  await p.waitForTimeout(800);
  await p.getByRole('button', { name: /Добавить тренировку в программу|Создать программу/ }).click();
  await p.waitForTimeout(1500);
  await p.reload();
  await p.waitForSelector('.nav');
  await p.waitForTimeout(2000);
  await p.locator('.gym-tab', { hasText: 'Иван' }).first().click();
  await p.waitForTimeout(800);
  const text = (await pane().innerText()).replace(/\s+/g, ' ');
  expect(/Свободная тренировка/.test(text) && /2\/\d+/.test(text), 'after the reload the gym opens the free workout with its sets', text.slice(0, 160));
  await finishHere(pane());
  const h = await historyOf('Иван');
  expect(h[0]?.dayName === 'Свободная тренировка' && h[0].exercises[0].sets.length === 2, 'the free workout is in history', h[0]?.dayName);
});

await scenario('12. Удаление записи из истории', async () => {
  const before = (await historyOf('Павел')).length;
  await p.locator('.nav').getByRole('button', { name: 'Клиенты' }).click();
  await p.waitForTimeout(500);
  await p.locator('.client-open:visible', { hasText: 'Павел' }).first().click();
  await p.waitForTimeout(800);
  await p.getByRole('tab', { name: 'История' }).click();
  await p.waitForTimeout(600);
  await p.getByRole('button', { name: /^Удалить тренировку/ }).first().click();
  await p.getByRole('button', { name: 'Удалить', exact: true }).click();
  await p.waitForTimeout(1200);
  expect((await historyOf('Павел')).length === before - 1, 'deleted', before);
  await p.getByRole('button', { name: 'Назад', exact: true }).first().click().catch(() => {});
});

await scenario('13. Клиент записывает сам в своём кабинете', async () => {
  const counts = Object.fromEntries(await Promise.all(clients.map(async (c) => [c.clientName, (await historyOf(c.clientName)).length])));
  await p.locator('.testbar').getByRole('button', { name: 'Клиент' }).click();
  await p.waitForTimeout(1500);
  const who = (await p.locator('#demo-client option:checked').innerText()).trim();
  const before = counts[who];
  await p.getByRole('button', { name: 'Начать тренировку' }).click();
  await p.waitForTimeout(1200);
  const j = p.locator('.main .journal').first();
  await tickNext(j, 30);
  await tickNext(j, 30);
  await finishHere(j);
  const msg = await p.locator('.success').first().innerText().catch(() => '');
  expect(/записана/.test(msg), 'the client sees «Тренировка записана»', msg);
  await p.locator('.testbar').getByRole('button', { name: 'Тренер' }).click();
  await p.waitForTimeout(1500);
  const h = await historyOf(who);
  expect(h.length === before + 1 && h[0].recordedByRole === 'client', 'the trainer sees it in history, recorded by the client', h[0]?.recordedByRole);
});

await scenario('14. Забыли нажать «Ушёл»: через час без подходов тренировка записывается сама', async () => {
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await ctx2.newPage();
  await p2.clock.install({ time: new Date('2026-10-02T10:00:00') });
  await p2.goto(APP);
  await p2.waitForSelector('.nav');
  await p2.waitForTimeout(1500);
  const api2 = (m, path, body) => p2.evaluate(async ([m, path, body]) => { const api = window.__tlApi || (await import('/src/transport.ts')).api; return (m === 'get' ? await api.get(path) : await api.post(path, body)).data; }, [m, path, body]);
  const yid = (await api2('get', '/api/clients')).clients.find((c) => c.clientName === 'Юлия').clientId;
  await p2.locator('.arrival', { hasText: 'Юлия' }).first().click();
  await p2.getByRole('button', { name: /Пришли: 1/ }).click();
  await p2.waitForTimeout(1500);
  const row = p2.locator('.gym-pane:not([hidden]) .set-row:not(.set-labels):not(.is-done)').first();
  if ((await row.locator('[data-w]').count()) && !(await row.locator('[data-w]').inputValue())) await row.locator('[data-w]').fill('20');
  await row.getByRole('button', { name: /^Подход выполнен/ }).click();
  await p2.waitForTimeout(1500);
  await p2.clock.fastForward('01:05:00');
  await p2.waitForTimeout(3000);
  const h = (await api2('get', `/api/client/${yid}/history`)).sessions;
  const c = (await api2('get', '/api/clients')).clients.find((x) => x.clientId === yid);
  expect(h.length === 1 && !c.checkedInAt, 'recorded by itself and the client left the gym', [h.length, c.checkedInAt]);
  await ctx2.close();
});

await scenario('15. Двойное касание ✓, вес с запятой, перезагрузка сразу после отметки', async () => {
  await checkIn('Анна');
  const row = pane().locator('.set-row:not(.set-labels):not(.is-done)').first();
  const w = row.locator('[data-w]');
  await w.fill('');
  await w.type('102,5');
  await row.getByRole('button', { name: /^Подход выполнен/ }).dblclick();
  await p.waitForTimeout(300);
  const after = (await pane().innerText()).match(/(\d+)\/(\d+)/)?.[1];
  expect(after === '1', 'a double tap marks the set once (not marked and cleared)', after);
  await tickNext(pane(), 50);
  await p.reload(); // within the save delay
  await p.waitForSelector('.nav');
  await p.waitForTimeout(2500);
  await p.locator('.gym-tab', { hasText: 'Анна' }).first().click();
  await p.waitForTimeout(800);
  const back = (await pane().innerText()).match(/(\d+)\/(\d+)/)?.[1];
  expect(back === '2', 'both sets are there after an immediate reload', back);
  await finishHere(pane());
  const h = await historyOf('Анна');
  const first = h[0]?.exercises[0]?.sets[0];
  expect(first?.weight === 102.5, 'the weight «102,5» is recorded as 102.5', first);
});

await scenario('18. Клиентка открыла день посмотреть — не в зале; записала подход — у тренера она в зале', async () => {
  // As the trainer: the clients and who is in the gym now.
  const all = (await call('get', '/api/clients')).clients;
  await p.locator('.testbar').getByRole('button', { name: 'Клиент' }).click();
  await p.waitForTimeout(1500);
  const select = p.locator('#demo-client');
  const options = await select.locator('option').allInnerTexts();
  const busy = ['Анна', 'Павел', 'Мария', 'Дмитрий', 'Сергей', 'Екатерина', 'Иван', 'Ольга', 'Юлия'];
  const who = options.find((o) => !all.some((c) => c.clientName === o.trim() && c.checkedInAt) && !busy.includes(o.trim())) || options.find((o) => !busy.includes(o.trim())) || options[options.length - 1];
  // Marked by an earlier scenario: she left first (as the trainer would mark it).
  const her = all.find((c) => c.clientName === who.trim());
  if (her?.checkedInAt) {
    await p.locator('.testbar').getByRole('button', { name: 'Тренер' }).click();
    await p.waitForTimeout(1200);
    await call('post', '/api/attendance', { clientId: her.clientId, present: false, localDate: new Date().toISOString().slice(0, 10), at: new Date().toISOString() });
    await p.locator('.testbar').getByRole('button', { name: 'Клиент' }).click();
    await p.waitForTimeout(1500);
  }
  await select.selectOption({ label: who });
  await p.waitForTimeout(1500);
  // Only looking at a day (no set recorded) is not coming to the gym.
  await p.locator('.day-link').last().click();
  await p.waitForTimeout(1200);
  await p.getByRole('button', { name: 'Назад', exact: true }).first().click();
  await p.waitForTimeout(800);
  // As the client: her coaches and whether she is marked with them.
  const looked = (await call('get', '/api/my-programs')).coaches || [];
  expect(looked.length > 0 && looked.every((c) => !c.checkedInAt), '«' + who.trim() + '» opened a day just to look — not marked in the gym', looked.map((c) => c.checkedInAt));
  expect((await p.getByRole('button', { name: 'Я в зале' }).count()) > 0, 'her button still says «Я в зале»');
  await p.getByRole('button', { name: 'Начать тренировку' }).click();
  await p.waitForTimeout(1200);
  const j = p.locator('.main .journal').first();
  await tickNext(j, 30);
  await p.waitForTimeout(1500);
  await p.getByRole('button', { name: 'Назад', exact: true }).first().click();
  await p.waitForTimeout(500);
  await p.locator('.testbar').getByRole('button', { name: 'Тренер' }).click();
  await p.waitForTimeout(2000);
  await goGym();
  const tab = p.locator('.gym-tab', { hasText: who.trim() });
  expect((await tab.count()) > 0, '«' + who.trim() + '» is in the gym without the trainer marking her');
  await tab.first().click();
  await p.waitForTimeout(800);
  const cnt = (await pane().innerText()).match(/(\d+)\/(\d+)/)?.[1];
  expect(cnt === '1', 'her workout with her set is open in the gym', cnt);
});

await scenario('19. Карточка клиента → «Не завершена… Открыть» → его вкладка в зале, среди всех', async () => {
  await goGym();
  const tabs = p.locator('.gym-tab:not(.add)');
  const names = [];
  for (let i = 0; i < (await tabs.count()); i++) names.push((await tabs.nth(i).locator('.gt-name').innerText()).trim());
  // Someone in the gym with sets done, and another tab shown meanwhile.
  let who = null;
  for (const n of names) {
    await p.locator('.gym-tab', { hasText: n }).first().click();
    await p.waitForTimeout(500);
    const done = Number((await pane().innerText()).match(/(\d+)\/(\d+)/)?.[1] || 0);
    if (done > 0) {
      who = n;
      break;
    }
  }
  if (!who) {
    await checkIn('Иван');
    await tickNext(pane(), 30);
    await p.waitForTimeout(1500);
    who = 'Иван';
  }
  const other = names.find((n) => n !== who);
  if (other) await p.locator('.gym-tab', { hasText: other }).first().click();
  await p.waitForTimeout(400);
  const before = await p.locator('.gym-tab:not(.add)').count();
  await p.locator('.nav').getByRole('button', { name: 'Клиенты' }).click();
  await p.waitForTimeout(600);
  await p.locator('.client-row', { hasText: who }).first().locator('.client-open').click();
  await p.waitForTimeout(1500);
  const bar = p.locator('.review-bar', { hasText: 'Не завершена' }).first();
  expect((await bar.count()) > 0, 'the client card shows «Не завершена…» for ' + who);
  await bar.getByRole('button', { name: 'Открыть' }).click();
  await p.waitForTimeout(1200);
  const onGym = (await p.locator('.nav').getByRole('button', { name: 'Зал' }).getAttribute('aria-current')) === 'page';
  const active = (await p.locator('.gym-tab.active .gt-name').innerText().catch(() => '')).trim();
  const after = await p.locator('.gym-tab:not(.add)').count();
  expect(onGym && active === who, '«Открыть» goes to the gym, to ' + who + "'s tab", [onGym, active]);
  expect(after === before && after > 1, 'all clients in the gym are there to switch between', [before, after]);
  const done = Number((await pane().innerText()).match(/(\d+)\/(\d+)/)?.[1] || 0);
  expect(done > 0, 'the unfinished workout with its sets is the one shown', done);
});

await scenario('20. Брошенная тренировка прошлых дней записывается сама; карточка не отмечает клиента пришедшим', async () => {
  await p.locator('.testbar').getByRole('button', { name: 'Тренер' }).click();
  await p.waitForTimeout(1200);
  const today = await p.evaluate(() => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  });
  const { clients } = await call('get', '/api/clients');
  const { programs } = await call('get', '/api/programs');
  // A client not in the gym, not seen today, with a program of several workouts.
  const c = clients.find((x) => !x.checkedInAt && !(x.visits || []).includes(today) && programs.some((pr) => pr.clientId === x.clientId && !pr.archived && !pr.free && pr.days.length > 1));
  expect(!!c, 'a client away today with a program', clients.map((x) => [x.clientName, !!x.checkedInAt]));
  if (!c) return;
  const pr = programs.find((x) => x.clientId === c.clientId && !x.archived && !x.free && x.days.length > 1);
  const leaveOpen = async (day, ago) => {
    const w = await call('get', '/api/workout/' + pr.trainerId + '/' + pr.id + '/' + day.id);
    const ex = w.day.exercises[0];
    await p.evaluate(async (ms) => (await import('/src/clock.ts')).setClockOffset(-ms), ago);
    await call('post', '/api/draft', {
      trainerId: pr.trainerId,
      programId: pr.id,
      dayId: day.id,
      baseRevision: w.revision ?? null,
      base: w.draft?.exercises || [],
      feedback: '',
      exercises: [{ exerciseId: ex.exerciseId, exerciseName: ex.exerciseName, sets: [{ weight: 20, reps: 10 }] }],
    });
    await p.evaluate(async () => (await import('/src/clock.ts')).setClockOffset(0));
  };
  const openCard = async () => {
    await p.locator('.nav').getByRole('button', { name: 'Сводка' }).click();
    await p.waitForTimeout(300);
    await p.locator('.nav').getByRole('button', { name: 'Клиенты' }).click();
    await p.waitForTimeout(600);
    await p.locator('.client-row', { hasText: c.clientName }).first().locator('.client-open').click();
    await p.waitForTimeout(1500);
  };
  // Two days ago one set was recorded and the workout was never finished: the card records it by itself.
  const old = pr.days[pr.days.length - 1];
  await leaveOpen(old, 2 * 86400000);
  await openCard();
  const auto = p.locator('.review-bar', { hasText: 'Записана в историю' }).first();
  const said = (await auto.innerText().catch(() => '')).replace(/\s+/g, ' ');
  expect(said.includes('«' + old.name + '»') && said.includes('1 подх.'), 'the card says the workout of two days ago was recorded by itself', said);
  expect(!(await p.locator('.review-bar', { hasText: 'Не завершена' }).count()), 'nothing is left hanging in the card');
  const hist = (await call('get', '/api/client/' + c.clientId + '/history')).sessions;
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  const rec = hist.find((x) => x.dayId === old.id && x.completedAt.slice(0, 10) === twoDaysAgo);
  expect(!!rec && rec.autoFinished === true, 'the workout is in history on its own day, marked as finished by itself', hist.slice(0, 2).map((x) => [x.dayName, x.completedAt, x.autoFinished]));
  await p.locator('.subtabs').getByRole('tab', { name: 'История' }).click();
  await p.waitForTimeout(500);
  expect(/завершена сама/.test(await p.innerText('body')), 'the history says it was finished by itself');
  await auto.getByRole('button', { name: 'Понятно' }).click();
  const away = (await call('get', '/api/clients')).clients.find((x) => x.clientId === c.clientId);
  expect(!away.checkedInAt && !(away.visits || []).includes(today), 'not marked in the gym and no visit today', [away.checkedInAt, away.visits?.slice(-3)]);

  // Two hours ago (not abandoned yet): «Открыть» in the card opens it there, not in the gym, the client not marked here.
  const recent = pr.days.find((d) => d.id !== old.id);
  await leaveOpen(recent, 2 * 3600000);
  await openCard();
  const bar = p.locator('.review-bar', { hasText: 'Не завершена' }).first();
  expect((await bar.count()) > 0, 'the card shows the workout left two hours ago');
  await bar.getByRole('button', { name: 'Открыть' }).click();
  await p.waitForTimeout(1500);
  const onGym = (await p.locator('.nav').getByRole('button', { name: 'Зал' }).getAttribute('aria-current')) === 'page';
  expect(!onGym, 'it opens in the card, not in the gym');
  await finishHere(p.locator('.main'));
  await p.waitForTimeout(800);
  await dismiss();
  const after = (await call('get', '/api/clients')).clients.find((x) => x.clientId === c.clientId);
  expect(!after.checkedInAt, 'not marked in the gym', after.checkedInAt);

  // A stray «Пришёл» and «Ушёл» right after, nothing recorded: no visit is left behind.
  await call('post', '/api/attendance', { clientId: c.clientId, present: true, localDate: today, at: new Date().toISOString() });
  await call('post', '/api/attendance', { clientId: c.clientId, present: false, localDate: today, at: new Date().toISOString() });
  const back = (await call('get', '/api/clients')).clients.find((x) => x.clientId === c.clientId);
  expect(!(back.visits || []).includes(today), 'a stray check-in taken back by «Ушёл» leaves no visit', back.visits?.slice(-3));
  await p.locator('.nav').getByRole('button', { name: 'Клиенты' }).click();
  await p.waitForTimeout(400);
});

await scenario('21. Программа: «Ягодицы» → «Обновить упражнения» — другие упражнения, та же схема', async () => {
  await p.locator('.testbar').getByRole('button', { name: 'Тренер' }).click();
  await p.waitForTimeout(1000);
  await p.locator('.nav').getByRole('button', { name: 'Программы' }).click();
  await p.waitForTimeout(500);
  await p.getByRole('button', { name: 'Программа', exact: true }).click();
  await p.waitForTimeout(800);
  await p.locator('.focus-chips').getByRole('button', { name: 'Ягодицы', exact: true }).click();
  await p.waitForTimeout(400);
  const rows = async () =>
    p.evaluate(() =>
      [...document.querySelectorAll('[aria-label^="Заменить: "]')].map((b) => b.getAttribute('aria-label').replace('Заменить: ', '')),
    );
  const before = await rows();
  const setsBefore = await p.locator('[aria-label^="Повторы: "]').count();
  await p.getByRole('button', { name: 'Обновить упражнения' }).click();
  await p.waitForTimeout(400);
  const after = await rows();
  const changed = after.filter((x, i) => x !== before[i]).length;
  expect(before.length === 6 && after.length === 6, 'still 6 exercises', [before.length, after.length]);
  expect(changed >= 4, 'most exercises are new (' + changed + ' of 6)', [before, after]);
  expect(/Ягодичный мост/.test(after[1]), 'the glute bridge stays a glute bridge (its role)', after[1]);
  expect((await p.locator('[aria-label^="Повторы: "]').count()) === setsBefore, 'rep ranges are kept for every exercise');
  await p.getByRole('button', { name: 'Вернуть' }).click();
  await p.waitForTimeout(300);
  expect(JSON.stringify(await rows()) === JSON.stringify(before), '«Вернуть» brings the previous exercises back');
  await p.locator('.nav').getByRole('button', { name: 'Зал' }).click();
  await p.waitForTimeout(400);
});

await scenario('22. «+» подход — только сегодня; «Сохранить в программе» — насовсем', async () => {
  await p.locator('.testbar').getByRole('button', { name: 'Тренер' }).click();
  await p.waitForTimeout(1000);
  await checkIn('Юлия');
  const table = pane().locator('[role="table"]').filter({ has: p.getByRole('button', { name: 'Добавить подход' }) }).first();
  const name = (await table.getAttribute('aria-label')).replace('Подходы: ', '');
  const rows0 = await table.locator('.set-row:not(.set-labels)').count();
  await table.getByRole('button', { name: 'Добавить подход' }).click();
  await p.waitForTimeout(900);
  const diff = pane().locator('.sets-diff').first();
  const said = await diff.innerText().catch(() => '');
  expect(said.includes('Сегодня ' + (rows0 + 1)) && said.includes('в программе ' + rows0), '«+» shows today vs program', said);
  await diff.getByRole('button', { name: 'Сохранить в программе' }).click();
  await p.waitForTimeout(1800);
  const { programs } = await call('get', '/api/programs');
  const ex = programs.flatMap((pr) => pr.days.flatMap((d) => d.exercises)).filter((e) => e.exerciseName === name);
  expect(ex.some((e) => e.sets === rows0 + 1), 'the program now has ' + (rows0 + 1) + ' sets for ' + name, ex.map((e) => e.sets));
  expect((await pane().locator('.sets-diff').count()) === 0, 'the hint is gone once saved');
  const rowsAfter = await pane().locator(`[role="table"][aria-label="Подходы: ${name}"] .set-row:not(.set-labels)`).count();
  expect(rowsAfter === rows0 + 1, 'today keeps the added set', rowsAfter);
});

await scenario('23. Замена «насовсем» из зала не теряется, когда редактор программы был открыт раньше', async () => {
  await p.locator('.testbar').getByRole('button', { name: 'Тренер' }).click();
  await p.waitForTimeout(800);
  await p.locator('.nav').getByRole('button', { name: 'Программы' }).click();
  await p.waitForTimeout(500);
  const { programs } = await call('get', '/api/programs');
  const prog = programs.find((x) => !x.archived && x.days.length > 1);
  const card = p.locator('.program', { hasText: prog.name }).filter({ hasText: prog.clientName }).first();
  await card.getByRole('button', { name: 'Изменить' }).click();
  await p.waitForTimeout(800);
  // Meanwhile, in the gym on the other phone: the first exercise of the first workout replaced for good.
  const day = prog.days[0];
  const old = day.exercises[0].exerciseId;
  const used = new Set(day.exercises.map((e) => e.exerciseId));
  const repl = ['pendulum-squat', 'smith-squat', 'hack-squat', 'leg-press', 'plate-leg-press'].find((x) => !used.has(x));
  await call('post', `/api/programs/${prog.id}/days/${day.id}/exercise`, { exerciseId: old, replaceWith: repl });
  // The editor, opened before, sets 4 sets everywhere and saves.
  await p.locator('.field', { hasText: 'Подходы для всей программы' }).getByRole('button', { name: '4', exact: true }).click();
  await p.getByRole('button', { name: 'Поставить' }).click();
  await p.getByRole('button', { name: 'Сохранить изменения' }).click();
  await p.waitForTimeout(1200);
  const after = (await call('get', '/api/programs')).programs.find((x) => x.id === prog.id);
  const first = after.days[0].exercises[0];
  expect(first.exerciseId === repl, 'the replacement made in the gym stays (' + repl + ')', [old, first.exerciseId]);
  expect(after.days.every((d) => d.exercises.every((e) => e.sets === 4)), 'and the editor\'s 4 sets everywhere, the replacement too', after.days.map((d) => d.exercises.map((e) => e.sets).join('')));
  // Opened now, the editor shows the program as it is.
  await card.getByRole('button', { name: 'Изменить' }).click();
  await p.waitForTimeout(800);
  const shown = await p.evaluate(() => [...document.querySelectorAll('[aria-label^="Заменить: "]')].map((b) => b.getAttribute('aria-label')));
  expect(shown.some((x) => x.includes(first.exerciseName)), 'the editor shows the replacement', shown.slice(0, 3));
  await p.getByRole('button', { name: 'Закрыть конструктор' }).click();
  await p.waitForTimeout(300);
  await p.locator('.nav').getByRole('button', { name: 'Зал' }).click();
  await p.waitForTimeout(300);
});

await scenario('24. «Пришёл» с незавершённой тренировкой прошлого визита: клиент остаётся, открыта следующая', async () => {
  await p.locator('.testbar').getByRole('button', { name: 'Тренер' }).click();
  await p.waitForTimeout(800);
  const today = await p.evaluate(() => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  });
  // A new client with a program of two workouts: her last visit (two days ago) is the latest thing that happened.
  const LEFT_AGO = 2 * 86400000;
  const { client: c } = await call('post', '/api/clients', { clientName: 'Кира' });
  const made = await call('post', '/api/programs', {
    clientId: c.clientId,
    name: 'Две тренировки',
    days: [
      { id: 'k-1', name: 'Кира: ноги', exercises: [{ exerciseId: 'leg-press', sets: 3, repMin: 8, repMax: 12, targetRir: 2 }, { exerciseId: 'seated-leg-curl', sets: 3, repMin: 8, repMax: 12, targetRir: 2 }] },
      { id: 'k-2', name: 'Кира: верх', exercises: [{ exerciseId: 'lat-pulldown', sets: 3, repMin: 8, repMax: 12, targetRir: 2 }] },
    ],
  });
  const pr = made.program;
  // The app sees the new client.
  await p.reload();
  await p.waitForSelector('.nav');
  await p.waitForTimeout(2000);
  await p.locator('.testbar').getByRole('button', { name: 'Тренер' }).click();
  await p.waitForTimeout(1000);
  const day = pr.days.find((d) => d.id === pr.nextDayId) || pr.days[0];
  const w = await call('get', '/api/workout/' + pr.trainerId + '/' + pr.id + '/' + day.id);
  const ex = w.day.exercises[0];
  // Counted first: reading the history records a workout left open long ago.
  const before = (await call('get', '/api/client/' + c.clientId + '/history')).sessions.length;
  // Two days ago: two sets of the program's next workout, never finished.
  const leftAt = Date.now() - LEFT_AGO;
  await p.evaluate(async (ms) => (await import('/src/clock.ts')).setClockOffset(-ms), LEFT_AGO);
  await call('post', '/api/draft', {
    trainerId: pr.trainerId, programId: pr.id, dayId: day.id, baseRevision: w.revision ?? null, base: w.draft?.exercises || [], feedback: '',
    exercises: [{ exerciseId: ex.exerciseId, exerciseName: ex.exerciseName, sets: [{ weight: 20, reps: 10 }, { weight: 20, reps: 10 }] }],
  });
  await p.evaluate(async () => (await import('/src/clock.ts')).setClockOffset(0));
  await checkIn(c.clientName);
  await p.waitForTimeout(4000);
  const stillHere = (await p.locator('.gym-tab', { hasText: c.clientName }).count()) > 0;
  expect(stillHere, '«' + c.clientName + '» stays in the gym');
  const after = (await call('get', '/api/clients')).clients.find((x) => x.clientId === c.clientId);
  expect(!!after.checkedInAt && (after.visits || []).includes(today), 'still marked here, with today\'s visit', [after.checkedInAt, after.visits?.slice(-2)]);
  const hist = (await call('get', '/api/client/' + c.clientId + '/history')).sessions;
  expect(hist.length === before + 1 && hist.some((x) => x.dayId === day.id && Math.abs(Date.parse(x.completedAt) - leftAt) < 60000), 'the leftover workout is in history at its own time', hist.slice(0, 2).map((x) => [x.dayName, x.completedAt]));
  await p.locator('.gym-tab', { hasText: c.clientName }).first().click();
  await p.waitForTimeout(800);
  const text = (await pane().innerText()).replace(/\s+/g, ' ');
  const next = pr.days[(pr.days.findIndex((d) => d.id === day.id) + 1) % pr.days.length];
  expect(text.includes(next.name) && /\b0\/\d+/.test(text), 'the next workout is open, nothing done yet (' + next.name + ')', text.slice(0, 160));
  expect(/Записана в историю: «/.test(await p.innerText('body')), 'a note says the earlier one was recorded');
});

await scenario('25. Клиент в архиве: в приложении только «профиль перенесён в архив», записи не принимаются', async () => {
  await p.locator('.testbar').getByRole('button', { name: 'Тренер' }).click();
  await p.waitForTimeout(800);
  const { clients } = await call('get', '/api/clients');
  const who = clients.find((x) => x.clientName === 'Мария');
  await call('post', '/api/client/' + who.clientId + '/update', { archived: true });
  await p.locator('.testbar').getByRole('button', { name: 'Клиент' }).click();
  await p.waitForTimeout(1200);
  await p.locator('#demo-client').selectOption({ label: 'Мария' });
  await p.waitForTimeout(1500);
  const body = await p.innerText('body');
  expect(/Ваш профиль перенесён в архив/.test(body) && !(await p.getByRole('button', { name: 'Начать тренировку' }).count()), 'the client sees only «профиль перенесён в архив»', body.slice(0, 200));
  const hist = await call('get', '/api/my-history');
  expect(hist.archived === true && hist.sessions.length === 0, 'her history is closed too');
  const refused = await call('post', '/api/body', { date: '2026-01-01', weight: 70 }).then(() => false, () => true);
  expect(refused, 'measurements are not accepted');
  await p.locator('.testbar').getByRole('button', { name: 'Тренер' }).click();
  await p.waitForTimeout(800);
  await call('post', '/api/client/' + who.clientId + '/update', { archived: false });
  await p.locator('.testbar').getByRole('button', { name: 'Клиент' }).click();
  await p.waitForTimeout(1200);
  await p.locator('#demo-client').selectOption({ label: 'Мария' });
  await p.waitForTimeout(1500);
  expect((await p.getByRole('button', { name: 'Начать тренировку' }).count()) > 0, 'back from the archive: everything is there again');
  await p.locator('.testbar').getByRole('button', { name: 'Тренер' }).click();
  await p.waitForTimeout(800);
});

await scenario('26. Повторы: две цифры — курсор сам переходит на следующий подход', async () => {
  await goGym();
  await p.locator('.gym-tab', { hasText: 'Кира' }).first().click();
  await p.waitForTimeout(800);
  const reps = (i, j) => pane().locator('[data-r="' + i + '-' + j + '"]');
  const active = () => p.evaluate(() => document.activeElement?.getAttribute('data-r') || document.activeElement?.tagName);
  await reps(0, 0).click();
  await p.keyboard.type('1');
  expect((await active()) === '0-0', 'one digit: the cursor stays', await active());
  await p.keyboard.type('2');
  await p.waitForTimeout(300);
  expect((await active()) === '0-1', 'two digits: the cursor is on the next set', await active());
  await p.keyboard.type('10');
  await p.waitForTimeout(300);
  expect((await active()) === '0-2', 'and on to the third set', await active());
  await p.keyboard.type('9');
  await p.waitForTimeout(200);
  await p.keyboard.type('8');
  await p.waitForTimeout(300);
  expect((await active()) !== '0-2' && !/^\d/.test(String(await active())), 'the last set: the keyboard closes (nothing left)', await active());
  await p.waitForTimeout(1500);
  // All three done: the exercise folds into one line with its sets.
  const shown = (await pane().locator('.ex').first().innerText()).replace(/\s+/g, ' ');
  expect(/×12\b.*×10\b.*×98\b/.test(shown), 'the typed reps stay in their sets (12, 10, 98)', shown.slice(0, 160));
});

await scenario('27. Приложение тренера открыто двое суток: «Пришёл» без «тренировки прошлого визита»', async () => {
  // A phone of its own, its clock moved on by hand.
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const q = await ctx2.newPage();
  await q.clock.install();
  q.on('pageerror', (e) => errs.push('pageerror (27): ' + e.message));
  await q.goto(APP);
  await q.waitForTimeout(4000);
  await q.locator('.testbar').getByRole('button', { name: 'Тренер' }).click();
  await q.waitForTimeout(1000);
  const NAME = 'Ольга';
  const qpane = () => q.locator('.gym-pane:not([hidden])');
  const arrive = async () => {
    await q.locator('.nav').getByRole('button', { name: 'Зал' }).click();
    await q.waitForTimeout(600);
    const add = q.getByRole('button', { name: 'Отметить пришедших' });
    if (await add.count()) await add.click();
    await q.locator('.arrival', { hasText: NAME }).first().click();
    await q.getByRole('button', { name: /Пришли: 1/ }).click();
    await q.waitForTimeout(1500);
    await q.locator('.gym-tab', { hasText: NAME }).first().click();
    await q.waitForTimeout(800);
  };
  await arrive();
  await qpane().locator('.set-row:not(.set-labels):not(.is-done)').first().getByRole('button', { name: /^Подход выполнен/ }).click();
  await q.waitForTimeout(1500);
  // «Завершить тренировку», but nobody pressed «Ушёл»: 12 hours on she is no longer in the gym.
  await qpane().getByRole('button', { name: /Завершить тренировку/ }).click();
  await q.getByRole('button', { name: 'Завершить', exact: true }).click();
  await q.waitForTimeout(2000);
  const cool = q.getByRole('button', { name: 'Круто!' });
  if (await cool.count()) await cool.first().click();
  await q.clock.fastForward(13 * 3600000);
  await q.waitForTimeout(3000);
  expect(!(await q.locator('.gym-tab', { hasText: NAME }).count()), '12 hours later she is out of the gym by herself');
  // Two days later, the app never reloaded: «Пришёл» again.
  await q.clock.fastForward(36 * 3600000);
  await q.waitForTimeout(2000);
  await arrive();
  const tab = (await q.locator('.gym-tab', { hasText: NAME }).first().innerText()).replace(/\s+/g, ' ');
  expect(/\b1\/\d/.test(tab), 'her tab shows the new workout from its first set', tab);
  expect(!(await qpane().getByText('Тренировка записана').count()), 'not the last visit\'s «Тренировка записана»');
  await q.clock.fastForward(65000);
  await q.waitForTimeout(3000);
  expect((await q.locator('.gym-tab', { hasText: NAME }).count()) > 0, 'a minute later she is still in the gym');
  const notes = (await q.locator('.undo-stack').innerText().catch(() => '')).replace(/\s+/g, ' ');
  expect(!/прошлая тренировка|час без|Записана в историю/.test(notes), 'no note about a workout of the last visit', notes);
  await ctx2.close();
});

await scenario('28. Аватарка тренера: «Сводка» → «Моя аватарка», клиенты видят её', async () => {
  await p.locator('.testbar').getByRole('button', { name: 'Тренер' }).click();
  await p.waitForTimeout(800);
  await p.locator('.nav').getByRole('button', { name: 'Сводка' }).click();
  await p.waitForTimeout(500);
  await p.getByRole('button', { name: 'Моя аватарка' }).click();
  await p.waitForTimeout(400);
  await p.locator('.sheet').getByRole('button', { name: 'Викинг' }).click();
  await p.waitForTimeout(800);
  expect(!(await p.locator('.sheet').count()), 'the picker closes once picked');
  const me = (await call('get', '/api/me')).profile;
  expect(me.avatar === 'viking', 'saved in the trainer\'s profile', me);
  expect((await p.locator('.me .avatar.art').count()) > 0, '«Сводка» shows the picture');
  await p.locator('.testbar').getByRole('button', { name: 'Клиент' }).click();
  await p.waitForTimeout(1000);
  await p.locator('#demo-client').selectOption({ label: 'Анна' });
  await p.waitForTimeout(1500);
  const mine = await call('get', '/api/my-programs');
  expect(mine.coaches?.[0]?.trainerAvatar === 'viking', 'the client gets the trainer\'s picture', mine.coaches?.[0]);
  expect((await p.locator('.coach-pic .avatar.art').count()) > 0, 'shown next to the trainer\'s name on her program');
  await p.locator('.testbar').getByRole('button', { name: 'Тренер' }).click();
  await p.waitForTimeout(800);
});

await scenario('29. Тренер поменял имя клиентки — в её приложении новое имя', async () => {
  await p.locator('.nav').getByRole('button', { name: 'Клиенты' }).click();
  await p.waitForTimeout(600);
  await p.locator('.client-row', { hasText: 'Анна' }).first().locator('.client-open').click();
  await p.waitForTimeout(1000);
  await p.getByRole('button', { name: 'Изменить имя' }).click();
  await p.locator('#client-rename').fill('Анна Петрова');
  await p.locator('.rename-form').getByRole('button', { name: 'Сохранить' }).click();
  await p.waitForTimeout(1200);
  await p.locator('.testbar').getByRole('button', { name: 'Клиент' }).click();
  await p.waitForTimeout(1000);
  await p.locator('#demo-client').selectOption({ label: 'Анна' });
  await p.waitForTimeout(1200);
  const me = (await call('get', '/api/me')).profile;
  expect(me.name === 'Анна Петрова', 'her profile has the new name', me.name);
  await p.locator('.testbar').getByRole('button', { name: 'Тренер' }).click();
  await p.waitForTimeout(800);
  const { clients } = await call('get', '/api/clients');
  const anna = clients.find((x) => x.clientName === 'Анна Петрова');
  if (anna) await call('post', '/api/client/' + anna.clientId + '/update', { clientName: 'Анна' });
});

await scenario('30. Тренер меняет картинку упражнения: в базе, в журнале и у клиента', async () => {
  await p.locator('.testbar').getByRole('button', { name: 'Тренер' }).click();
  await p.waitForTimeout(800);
  await p.locator('.nav').getByRole('button', { name: 'База' }).click();
  await p.waitForTimeout(500);
  await p.locator('#library-search').fill('Жим ногами');
  await p.waitForTimeout(400);
  const item = () => p.locator('.lib-item').filter({ has: p.locator('strong', { hasText: /^Жим ногами$/ }) }).first();
  const before = await item().locator('.xa-thumb svg').innerHTML();
  await item().click();
  await p.waitForTimeout(400);
  await p.getByRole('button', { name: 'Сменить картинку' }).first().click();
  await p.waitForTimeout(500);
  const sheet = p.locator('.sheet').last();
  await sheet.locator('#art-search').fill('Гакк');
  await p.waitForTimeout(300);
  await sheet.getByRole('button', { name: 'Рисунок: Гакк-присед', exact: true }).click();
  await p.waitForTimeout(300);
  const top = (await sheet.locator('.art-preview').innerText()).replace(/\s+/g, ' ');
  expect(/Рисунок: Гакк-присед/.test(top), 'the pick moves at the top before it is saved', top);
  const picked = await sheet.locator('.art-choice.on .xa-thumb svg').innerHTML();
  await sheet.getByRole('button', { name: 'Сохранить' }).click();
  await p.waitForTimeout(1500);
  expect(!(await p.locator('.sheet').count()), 'saved, the window closes');
  const after = await item().locator('.xa-thumb svg').innerHTML();
  expect(after !== before && after === picked, 'the icon in «База» is the new drawing');
  // Her workout with this exercise shows it too.
  const { clients } = await call('get', '/api/clients');
  const { programs } = await call('get', '/api/programs');
  const users = { Александр: 1, Мария: 1, Дмитрий: 1, Анна: 1 };
  const pr = programs.find((x) => !x.archived && users[x.clientName] && x.days.some((d) => d.exercises.some((e) => e.exerciseId === 'leg-press')));
  if (pr) {
    const day = pr.days.find((d) => d.exercises.some((e) => e.exerciseId === 'leg-press'));
    await p.locator('.testbar').getByRole('button', { name: 'Клиент' }).click();
    await p.waitForTimeout(1000);
    await p.locator('#demo-client').selectOption({ label: pr.clientName });
    await p.waitForTimeout(1200);
    const w = await call('get', '/api/workout/' + pr.trainerId + '/' + pr.id + '/' + day.id);
    expect(w.day.exercises.find((e) => e.exerciseId === 'leg-press')?.art === 'hack-squat', 'the client (' + pr.clientName + ') gets the new drawing in her workout');
    await p.locator('.testbar').getByRole('button', { name: 'Тренер' }).click();
    await p.waitForTimeout(800);
  } else expect(false, 'a client with «Жим ногами» in the program', clients.length);
  // In the gym: «Как выполнять» → «Сменить картинку» → the journal shows it at once.
  await goGym();
  await p.locator('.gym-tab').first().click();
  await p.waitForTimeout(800);
  const art = pane().getByRole('button', { name: /^Как выполнять/ }).first();
  const was = await art.locator('svg').innerHTML();
  await art.click();
  await p.waitForTimeout(500);
  await p.locator('.sheet').last().getByRole('button', { name: 'Сменить картинку' }).click();
  await p.waitForTimeout(500);
  const sheet2 = p.locator('.sheet').last();
  await sheet2.locator('#art-search').fill('Становая');
  await p.waitForTimeout(300);
  await sheet2.getByRole('button', { name: 'Рисунок: Становая тяга', exact: true }).click();
  const chosen = await sheet2.locator('.art-choice.on .xa-thumb svg').innerHTML();
  await sheet2.getByRole('button', { name: 'Сохранить' }).click();
  await p.waitForTimeout(1200);
  const now = await pane().getByRole('button', { name: /^Как выполнять/ }).first().locator('svg').innerHTML();
  expect(now !== was && now === chosen, 'the journal shows the new drawing at once');
  // Back on «Как выполнять» with the new drawing; closed.
  const info = p.locator('.sheet').last();
  expect((await info.locator('.xa-motion').count()) > 0 && (await info.getByRole('button', { name: 'Сменить картинку' }).count()) > 0, 'back on «Как выполнять» after saving');
  await info.getByRole('button', { name: 'Закрыть' }).click();
  await p.waitForTimeout(300);
  // «Как было» brings each one's own drawing back.
  for (const e of (await call('get', '/api/exercises')).exercises.filter((x) => x.art)) await call('post', '/api/exercises/' + encodeURIComponent(e.id) + '/art', { art: '' });
  const ex = (await call('get', '/api/exercises')).exercises.filter((e) => e.art);
  expect(!ex.length, 'back to their own drawings', ex.map((e) => e.id));
});

await scenario('31. Объём недели: Пн–Вс, сделано и план; «тренировок в неделю» в программе', async () => {
  await p.locator('.testbar').getByRole('button', { name: 'Тренер' }).click();
  await p.waitForTimeout(800);
  await p.locator('.nav').getByRole('button', { name: 'Клиенты' }).click();
  await p.waitForTimeout(600);
  await p.locator('.client-row', { hasText: 'Павел' }).first().locator('.client-open').click();
  await p.waitForTimeout(1000);
  await p.getByRole('tab', { name: 'Прогресс' }).click();
  await p.waitForTimeout(800);
  const box = p.locator('.week-volume');
  const sessions = (await call('get', `/api/client/${idOf('Павел')}/history`)).sessions;
  const mon = new Date();
  mon.setHours(0, 0, 0, 0);
  mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
  const thisWeek = sessions.filter((x) => new Date(x.completedAt) >= mon);
  const text = await box.innerText();
  expect(/Эта неделя/.test(text) && new RegExp('^' + thisWeek.length + ' тренировк', 'm').test(text), 'this week (from Monday): ' + thisWeek.length + ' workouts', text.slice(0, 160));
  const chest = (await box.locator('.vol-row', { hasText: /^Грудь/ }).first().innerText()).replace(/\s+/g, ' ');
  expect(/Грудь \d+(,5)? \/ \d+(,5)?/.test(chest), 'a muscle row shows done / planned', chest);
  const tri = await box.locator('.vol-row', { hasText: /^Длинная головка/ }).count();
  expect(tri === 1, 'the long head of the triceps is counted apart', tri);
  const back = box.getByRole('button', { name: 'Прошлая неделя' });
  if (sessions.some((x) => new Date(x.completedAt) < mon)) {
    await back.click();
    await p.waitForTimeout(300);
    expect(!/Эта неделя/.test(await box.innerText()), '‹ shows the week before');
  } else expect(await back.isDisabled(), 'no workouts before this week — ‹ is off');
  // Workouts a week: 2 of the 3 workouts of the program.
  await p.getByRole('tab', { name: 'Программы' }).click();
  await p.waitForTimeout(600);
  await p.locator('article.program footer').getByRole('button', { name: 'Изменить' }).first().click();
  await p.waitForTimeout(1000);
  await p.getByRole('group', { name: 'Тренировок в неделю' }).getByRole('button', { name: '2', exact: true }).click();
  expect(/в среднем 67%/.test(await p.locator('.week-volume').innerText()), 'the editor explains: 2 of 3 a week — 67 % of the program');
  await p.getByRole('button', { name: 'Сохранить изменения' }).click();
  await p.waitForTimeout(1200);
  expect((await programOf('Павел')).perWeek === 2, 'the program keeps 2 workouts a week', (await programOf('Павел')).perWeek);
  await p.getByRole('tab', { name: 'Прогресс' }).click();
  await p.waitForTimeout(600);
  expect(/тренировк\S* из 2 /.test(await p.locator('.week-volume').innerText()), 'the weekly plan is for 2 workouts');
  await p.getByRole('tab', { name: 'Программы' }).click();
  await p.waitForTimeout(600);
  await p.locator('article.program footer').getByRole('button', { name: 'Изменить' }).first().click();
  await p.waitForTimeout(1000);
  await p.getByRole('group', { name: 'Тренировок в неделю' }).getByRole('button', { name: '3', exact: true }).click();
  await p.getByRole('button', { name: 'Сохранить изменения' }).click();
  await p.waitForTimeout(1200);
  expect((await programOf('Павел')).perWeek === undefined, 'back to each workout once a week', (await programOf('Павел')).perWeek);
});

await scenario('32. Программа по объёму: подходы на мышцы → тренировки', async () => {
  await p.locator('.testbar').getByRole('button', { name: 'Тренер' }).click();
  await p.waitForTimeout(800);
  await p.locator('.nav').getByRole('button', { name: 'Клиенты' }).click();
  await p.waitForTimeout(600);
  await p.locator('.client-row', { hasText: 'Павел' }).first().locator('.client-open').click();
  await p.waitForTimeout(1000);
  await p.getByRole('tab', { name: 'Программы' }).click();
  await p.waitForTimeout(600);
  await p.getByRole('button', { name: 'Новая программа' }).click();
  await p.waitForTimeout(1000);
  await p.locator('.plan-volume .block-toggle').click();
  await p.getByRole('group', { name: 'Опыт клиента' }).getByRole('button', { name: 'Средний' }).click();
  await p.getByRole('group', { name: 'Тренировок в неделю для составления' }).getByRole('button', { name: '4', exact: true }).click();
  await p.getByRole('button', { name: 'Больше: Задняя дельта' }).click();
  expect((await p.getByRole('textbox', { name: 'Подходов в неделю: Задняя дельта' }).inputValue()) === '9', '«+» adds a set to the target');
  await p.getByRole('button', { name: 'Составить программу' }).click();
  await p.locator('.pv-report').waitFor({ timeout: 5000 });
  const tabs = (await p.locator('.day-tabs [role="tab"]').allInnerTexts()).map((x) => x.trim());
  expect(JSON.stringify(tabs) === JSON.stringify(['Верх A', 'Низ A', 'Верх B', 'Низ B']), 'upper / lower, 4 workouts', tabs);
  const vol = await p.locator('.week-volume').innerText();
  expect(/цель тренера/.test(vol) && /Задняя дельта\s+\S+ · цель 9/.test(vol), 'the weekly volume shows the targets', vol.slice(0, 200));
  expect((await p.locator('#builder-name').inputValue()).startsWith('По объёму'), 'the program is named by how it was made');
  await p.getByRole('button', { name: 'Назначить клиенту' }).click();
  await p.waitForTimeout(1500);
  const made = (await call('get', '/api/programs')).programs.find((x) => x.clientId === idOf('Павел') && x.name.startsWith('По объёму'));
  expect(made?.days.length === 4 && made.targets?.deltRear === 9 && made.targets?.chest === 12, 'saved with its targets', made && { days: made.days.length, t: made.targets });
  if (made) await call('post', '/api/programs/' + made.id + '/archive', { archived: true });
  await p.keyboard.press('Escape').catch(() => {});
});

await scenario('33. Новые тренировки программы называются буквами: A, B, C', async () => {
  await p.locator('.testbar').getByRole('button', { name: 'Тренер' }).click();
  await p.waitForTimeout(800);
  await p.locator('.nav').getByRole('button', { name: 'Программы' }).click();
  await p.waitForTimeout(500);
  await p.getByRole('button', { name: 'Программа', exact: true }).click();
  await p.waitForTimeout(800);
  await p.getByRole('button', { name: 'Добавить тренировку' }).click();
  await p.getByRole('button', { name: 'Добавить тренировку' }).click();
  const tabs = (await p.locator('.day-tabs [role="tab"]').allInnerTexts()).map((x) => x.trim());
  expect(JSON.stringify(tabs) === JSON.stringify(['Тренировка A', 'Тренировка B', 'Тренировка C']), 'A, B, C — not A, 2, 3', tabs);
  await p.getByRole('button', { name: 'Закрыть конструктор' }).click();
  await p.waitForTimeout(400);
});

await scenario('34. По объёму с акцентом на грудь: грудь первой, остальное на поддержании', async () => {
  await p.locator('.testbar').getByRole('button', { name: 'Тренер' }).click();
  await p.waitForTimeout(800);
  await p.locator('.nav').getByRole('button', { name: 'Клиенты' }).click();
  await p.waitForTimeout(600);
  await p.locator('.client-row', { hasText: 'Павел' }).first().locator('.client-open').click();
  await p.waitForTimeout(1000);
  await p.getByRole('tab', { name: 'Программы' }).click();
  await p.waitForTimeout(600);
  await p.getByRole('button', { name: 'Новая программа' }).click();
  await p.waitForTimeout(1000);
  await p.locator('.plan-volume .block-toggle').click();
  await p.getByRole('group', { name: 'Опыт клиента' }).getByRole('button', { name: 'Средний' }).click();
  const before = Number(await p.getByRole('textbox', { name: 'Подходов в неделю: Грудь' }).inputValue());
  const lats0 = Number(await p.getByRole('textbox', { name: 'Подходов в неделю: Широчайшие' }).inputValue());
  await p.getByRole('group', { name: 'Акценты' }).getByRole('button', { name: 'Грудь' }).click();
  const chest = Number(await p.getByRole('textbox', { name: 'Подходов в неделю: Грудь' }).inputValue());
  const lats = Number(await p.getByRole('textbox', { name: 'Подходов в неделю: Широчайшие' }).inputValue());
  expect(chest > before && lats < lats0, 'accent: more for the chest, the rest at maintenance', { before, chest, lats0, lats });
  await p.getByRole('group', { name: 'Тренировок в неделю для составления' }).getByRole('button', { name: '4', exact: true }).click();
  await p.getByRole('button', { name: 'Составить программу' }).click();
  await p.locator('.pv-report').waitFor({ timeout: 5000 });
  await p.getByRole('button', { name: 'Назначить клиенту' }).click();
  await p.waitForTimeout(1500);
  const made = (await call('get', '/api/programs')).programs.find((x) => x.clientId === idOf('Павел') && x.focus?.accents?.[0] === 'chest');
  expect(made?.focus?.level === 'middle', 'saved with the experience and the accent', made?.focus);
  // Chest exercises of the base (main work — the chest).
  const CHEST = /^(Жим штанги лёжа|Жим гантелей на наклонной|Жим в тренажёре|Жим в Смите на наклонной|Жим от груди|Сведение рук|Бабочка)/;
  const wrong = (made?.days || [])
    .filter((d) => d.exercises.some((e) => CHEST.test(e.exerciseName)) && !CHEST.test(d.exercises[0].exerciseName))
    .map((d) => d.name + ': ' + d.exercises.map((e) => e.exerciseName).join(', '));
  expect(made && !wrong.length, 'every workout with chest work starts with it', wrong);
  if (made) await call('post', '/api/programs/' + made.id + '/archive', { archived: true });
});

await scenario('35. Ограничение «Локоть»: в подборе нет жимов и тяг, в списке они помечены', async () => {
  // Presses and pulls of the base (src/restrictions.ts): what the elbow restriction leaves out.
  const PRESS_PULL = new Set([
    'bench-press', 'machine-chest-press', 'stack-chest-press', 'plate-chest-press', 'incline-dumbbell-press', 'smith-incline-press', 'plate-incline-press',
    'dips', 'stack-assisted-dip', 'machine-shoulder-press', 'dumbbell-shoulder-press', 'overhead-press', 'stack-shoulder-press', 'plate-shoulder-press',
    'lat-pulldown', 'assisted-pull-up', 'pull-up', 'stack-lat-pulldown', 'plate-lat-pulldown', 'chest-supported-row', 't-bar-row', 'seated-row',
    'one-arm-row', 'barbell-row', 'stack-seated-row', 'plate-seated-row', 'plate-low-row', 'plate-dorian-row', 'face-pull', 'stack-triceps-press', 'plate-triceps',
  ]);
  await p.locator('.testbar').getByRole('button', { name: 'Тренер' }).click();
  await p.waitForTimeout(800);
  await p.locator('.nav').getByRole('button', { name: 'Клиенты' }).click();
  await p.waitForTimeout(600);
  await p.locator('.client-row', { hasText: 'Павел' }).first().locator('.client-open').click();
  await p.waitForTimeout(1000);
  await p.getByRole('tab', { name: 'Обзор' }).click();
  await p.waitForTimeout(500);
  await p.getByRole('group', { name: 'Ограничения' }).getByRole('button', { name: 'Локоть: движение ограничено' }).click();
  await p.waitForTimeout(1200);
  const notes = (await call('get', '/api/clients')).clients.find((c) => c.clientName === 'Павел').notes;
  expect(JSON.stringify(notes?.restrictions) === '["elbow"]', 'the restriction is saved with the client', notes);
  await p.getByRole('tab', { name: 'Программы' }).click();
  await p.waitForTimeout(600);
  await p.getByRole('button', { name: 'Новая программа' }).click();
  await p.waitForTimeout(1000);
  expect(await p.locator('.restriction-note').isVisible(), 'the editor reminds of the restriction');
  await p.locator('.plan-volume .block-toggle').click();
  await p.getByRole('group', { name: 'Опыт клиента' }).getByRole('button', { name: 'Средний' }).click();
  await p.getByRole('group', { name: 'Акценты' }).getByRole('button', { name: 'Спина' }).click();
  await p.getByRole('group', { name: 'Тренировок в неделю для составления' }).getByRole('button', { name: '4', exact: true }).click();
  await p.getByRole('button', { name: 'Составить программу' }).click();
  await p.locator('.pv-report').waitFor({ timeout: 5000 });
  await p.getByRole('button', { name: 'Добавить упражнение' }).click();
  await p.waitForTimeout(600);
  const sheet = p.locator('.sheet').last();
  expect(await sheet.getByText('Не подходят по ограничениям клиента').count() === 1, 'the list puts presses and pulls last, under their own heading');
  expect(await sheet.locator('.pick', { hasText: 'Жим штанги лёжа' }).getByText('Локоть: движение ограничено').count() === 1, 'the bench press is marked');
  await sheet.getByRole('button', { name: 'Закрыть' }).click();
  await p.waitForTimeout(300);
  await p.getByRole('button', { name: 'Назначить клиенту' }).click();
  await p.waitForTimeout(1500);
  const made = (await call('get', '/api/programs')).programs.find((x) => x.clientId === idOf('Павел') && x.focus?.accents?.[0] === 'back');
  const ids = (made?.days || []).flatMap((d) => d.exercises.map((e) => e.exerciseId));
  expect(ids.length > 0 && !ids.some((id) => PRESS_PULL.has(id)), 'no presses or pulls in the program', ids.filter((id) => PRESS_PULL.has(id)));
  expect(ids.includes('cable-pullover') || ids.includes('side-lying-pullover'), 'the back gets pullovers', ids);
  if (made) await call('post', '/api/programs/' + made.id + '/archive', { archived: true });
  await call('post', '/api/client/' + idOf('Павел') + '/update', { notes: { ...notes, restrictions: [] } });
});

await scenario('36. План акцентов: этапы в карточке, шкала, этап — в «По объёму»', async () => {
  await p.locator('.testbar').getByRole('button', { name: 'Тренер' }).click();
  await p.waitForTimeout(800);
  await p.locator('.nav').getByRole('button', { name: 'Клиенты' }).click();
  await p.waitForTimeout(600);
  await p.locator('.client-row', { hasText: 'Павел' }).first().locator('.client-open').click();
  await p.waitForTimeout(1000);
  await p.getByRole('tab', { name: 'Прогресс' }).click();
  await p.waitForTimeout(800);
  await p.getByRole('button', { name: 'Составить план' }).click();
  await p.waitForTimeout(500);
  await p.getByRole('group', { name: 'Акценты этапа 1' }).getByRole('button', { name: 'Грудь' }).click();
  await p.getByRole('button', { name: 'Добавить этап' }).click();
  await p.getByRole('group', { name: 'Акценты этапа 2' }).getByRole('button', { name: /Руки/ }).click();
  await p.getByRole('button', { name: 'Сохранить план' }).click();
  await p.waitForTimeout(1200);
  const text = (await p.locator('.phases').innerText()).replace(/\s+/g, ' ');
  expect(/Этап 1 из 2: Грудь — 20 подходов в неделю/.test(text) && /Неделя 1 из 8/.test(text) && /из 160/.test(text), 'the card shows the stage, its week and the sets of the stage', text.slice(0, 220));
  expect(/Дальше с .*Руки/.test(text), 'and what comes next');
  const plan = (await call('get', '/api/clients')).clients.find((c) => c.clientName === 'Павел').phases;
  expect(plan?.list?.length === 2 && plan.list[1].accents.join() === 'biceps,triceps', 'the plan is saved with the client', plan);
  await p.getByRole('tab', { name: 'Программы' }).click();
  await p.waitForTimeout(600);
  await p.getByRole('button', { name: 'Новая программа' }).click();
  await p.waitForTimeout(1000);
  await p.locator('.plan-volume .block-toggle').click();
  await p.getByRole('group', { name: 'Этапы плана' }).getByRole('button', { name: /Этап 1 \(сейчас\): Грудь 20/ }).click();
  const chest = await p.getByRole('textbox', { name: 'Подходов в неделю: Грудь' }).inputValue();
  const pressed = await p.getByRole('group', { name: 'Акценты' }).getByRole('button', { name: 'Грудь' }).getAttribute('aria-pressed');
  expect(chest === '20' && pressed === 'true', '«По объёму» takes the stage: chest is the accent with 20 sets', { chest, pressed });
  await p.getByRole('button', { name: 'Закрыть конструктор' }).click();
  await p.waitForTimeout(400);
  await call('post', '/api/client/' + idOf('Павел') + '/update', { phases: null });
});

await scenario('37. Замена «насовсем»: во всех тренировках с этим упражнением, запоминается клиенту', async () => {
  await p.locator('.testbar').getByRole('button', { name: 'Тренер' }).click();
  await p.waitForTimeout(800);
  const ex = (id, sets) => ({ exerciseId: id, sets, repMin: 8, repMax: 12, targetRir: 2 });
  const { program: two } = await call('post', '/api/programs', {
    clientId: idOf('Павел'),
    name: 'Верх и низ',
    days: [
      { id: 'up-a', name: 'Верх A', exercises: [ex('lat-pulldown', 4), ex('pec-deck', 3)] },
      { id: 'up-b', name: 'Верх B', exercises: [ex('cable-fly', 3), ex('lat-pulldown', 2)] },
      { id: 'low', name: 'Низ', exercises: [ex('leg-press', 3)] },
    ],
  });
  // Made elsewhere (another phone): the app is opened again.
  await p.reload();
  await p.waitForSelector('.nav', { timeout: 30000 });
  await p.waitForTimeout(1500);
  await p.locator('.nav').getByRole('button', { name: 'Клиенты' }).click();
  await p.waitForTimeout(600);
  await p.locator('.client-row', { hasText: 'Павел' }).first().locator('.client-open').click();
  await p.waitForTimeout(1000);
  await p.getByRole('tab', { name: 'Программы' }).click();
  await p.waitForTimeout(600);
  await p.getByRole('button', { name: /Верх A/ }).first().click();
  await p.getByRole('button', { name: 'Открыть журнал · Верх A' }).click();
  await p.waitForTimeout(1200);
  // (The gym keeps its own journals, hidden, on the same page.)
  const j = p.locator('.main .journal:visible').first();
  await j.getByRole('button', { name: 'Действия с упражнением: Вертикальная тяга' }).click();
  await p.locator('.menu-item', { hasText: 'Заменить' }).first().click();
  await p.waitForTimeout(500);
  await pick('Пуловер лёжа на боку');
  const sheet = (await p.locator('.sheet').last().innerText()).replace(/\s+/g, ' ');
  expect(/Во всех тренировках с «Вертикальная тяга»: «Верх A» и «Верх B»/.test(sheet), 'the choice says it goes to both workouts with the exercise', sheet.slice(0, 300));
  expect(/Запомнится/.test(sheet) && (await p.getByRole('button', { name: 'Насовсем только в «Верх A»' }).count()) === 1, 'and that it is remembered; «only in this workout» is there too');
  await p.getByRole('button', { name: 'В программе насовсем' }).click();
  await p.waitForTimeout(1500);
  const after = (await call('get', '/api/programs')).programs.find((x) => x.id === two.id);
  const idsIn = (d) => after.days.find((x) => x.id === d).exercises.map((e) => e.exerciseId + ':' + e.sets).join(',');
  expect(idsIn('up-a') === 'side-lying-pullover:4,pec-deck:3' && idsIn('up-b') === 'cable-fly:3,side-lying-pullover:2', 'replaced in «Верх A» and «Верх B», each with its own sets', [idsIn('up-a'), idsIn('up-b')]);
  const title = (await j.locator('.ex h3').first().innerText()).trim();
  expect(title === 'Пуловер лёжа на боку', 'the journal shows the pullover', title);
  await p.locator('.main').getByRole('button', { name: 'Назад', exact: true }).first().click();
  await p.waitForTimeout(800);
  await p.getByRole('tab', { name: 'Обзор' }).click();
  await p.waitForTimeout(500);
  const list = (await p.getByRole('list', { name: 'Замены из зала' }).innerText()).replace(/\s+/g, ' ');
  expect(/«Пуловер лёжа на боку» вместо «Вертикальная тяга»/.test(list), 'the client card shows the remembered replacement', list);
  // A new program for him «По объёму» with the back as the accent: the pullover instead of the pulldown.
  await p.getByRole('tab', { name: 'Программы' }).click();
  await p.waitForTimeout(600);
  await p.getByRole('button', { name: 'Новая программа' }).click();
  await p.waitForTimeout(1000);
  expect(/Замены из зала/.test(await p.locator('.builder').innerText()), 'the editor reminds of it');
  await p.locator('.plan-volume .block-toggle').click();
  await p.getByRole('group', { name: 'Опыт клиента' }).getByRole('button', { name: 'Средний' }).click();
  await p.getByRole('group', { name: 'Акценты' }).getByRole('button', { name: 'Спина' }).click();
  await p.getByRole('group', { name: 'Тренировок в неделю для составления' }).getByRole('button', { name: '4', exact: true }).click();
  await p.getByRole('button', { name: 'Составить программу' }).click();
  await p.locator('.pv-report').waitFor({ timeout: 5000 });
  const made = await p.evaluate(() => [...document.querySelectorAll('[aria-label^="Заменить: "]')].map((b) => b.getAttribute('aria-label')));
  expect(!made.some((x) => /Вертикальная тяга/.test(x)), 'the open workout of the made program has no pulldown', made);
  await p.getByRole('button', { name: 'Закрыть конструктор' }).click();
  await p.waitForTimeout(500);
  await p.getByRole('tab', { name: 'Обзор' }).click();
  await p.waitForTimeout(400);
  await p.getByRole('button', { name: 'Забыть замену: Пуловер лёжа на боку вместо Вертикальная тяга' }).click();
  await p.waitForTimeout(1000);
  expect(!(await call('get', '/api/clients')).clients.find((c) => c.clientName === 'Павел').swaps, '«Забыть замену» removes it');
  await call('post', '/api/programs/' + two.id + '/archive', { archived: true });
  await p.locator('.main').getByRole('button', { name: 'Назад', exact: true }).first().click().catch(() => {});
});

await scenario('38. Замеры: вес по неделям за 4 недели и средний; период графика 7 дней … год — у веса, шагов и калорий', async () => {
  await p.locator('.testbar').getByRole('button', { name: 'Тренер' }).click();
  await p.waitForTimeout(800);
  const id = idOf('Ольга');
  // A year of mornings: weight on most days, yesterday's steps and food on many; the expected weekly averages are
  // counted here on their own, Monday to Sunday.
  const expected = await p.evaluate(async (id) => {
    const api = window.__tlApi || (await import('/src/transport.ts')).api;
    let seed = 11;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const day = (back) => {
      const d = new Date();
      d.setHours(12, 0, 0, 0);
      d.setDate(d.getDate() - back);
      return d;
    };
    const weights = {};
    for (let back = 370; back >= 0; back--) {
      const body = { clientId: id, date: ymd(day(back)) };
      if (rnd() > 0.15) body.weight = weights[body.date] = Math.round((70 + (back / 370) * 4 + (rnd() - 0.5)) * 10) / 10;
      if (back > 0 && rnd() > 0.2) body.steps = Math.round(5000 + rnd() * 9000);
      if (back > 0 && rnd() > 0.25) body.kcal = Math.round((1700 + rnd() * 700) / 10) * 10;
      if (Object.keys(body).length > 2) await api.post('/api/body', body);
    }
    const monday = day(0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const weeks = [3, 2, 1, 0].map((k) => {
      const list = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(d.getDate() - 7 * k + i);
        if (weights[ymd(d)] !== undefined) list.push(weights[ymd(d)]);
      }
      return list.length ? Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10 : null;
    });
    const all = [];
    for (let i = 0; i < 28; i++) {
      const d = new Date(monday);
      d.setDate(d.getDate() - 21 + i);
      if (weights[ymd(d)] !== undefined) all.push(weights[ymd(d)]);
    }
    return { weeks, average: Math.round((all.reduce((a, b) => a + b, 0) / all.length) * 10) / 10 };
  }, id);
  const kg = (v) => String(v).replace('.', ',') + ' кг';
  await p.reload();
  await p.waitForSelector('.nav', { timeout: 30000 });
  await p.waitForTimeout(1500);
  await p.locator('.nav').getByRole('button', { name: 'Клиенты' }).click();
  await p.waitForTimeout(600);
  await p.locator('.client-row', { hasText: 'Ольга' }).first().locator('.client-open').click();
  await p.waitForTimeout(1000);
  await p.getByRole('tab', { name: 'Замеры' }).click();
  await p.waitForTimeout(1500);
  const weight = p.locator('section.block', { has: p.getByRole('heading', { name: 'Вес', exact: true }) });
  const rows = await weight.getByRole('table', { name: 'По неделям: вес' }).locator('tbody tr').allInnerTexts();
  const shown = rows.map((r) => r.split('\t')[1]?.trim());
  expect(rows.length === 4 && /эта/.test(rows[3]), 'four weeks, Monday to Sunday, the last one is this week', rows);
  expect(JSON.stringify(shown) === JSON.stringify(expected.weeks.map((v) => (v === null ? '—' : kg(v)))), 'the average weight of each week', [shown, expected.weeks]);
  const total = await weight.getByRole('table', { name: 'По неделям: вес' }).locator('tfoot').innerText();
  expect(total.includes(kg(expected.average)), 'the average weight over the four weeks', [total, expected.average]);
  const group = weight.getByRole('group', { name: 'Период: вес' });
  const chips = await group.getByRole('button').allInnerTexts();
  expect(chips.join('|') === '7 дней|Месяц|3 мес|6 мес|Год', 'the chart periods: 7 days, a month, 3 and 6 months, a year', chips);
  expect((await group.getByRole('button', { name: 'Месяц', exact: true }).getAttribute('aria-pressed')) === 'true', 'a month at first');
  await group.getByRole('button', { name: 'Год', exact: true }).click();
  await p.waitForTimeout(800);
  const year = (await weight.locator('.trend-sum').innerText()).replace(/\s+/g, ' ');
  expect(/^За год \(по неделям\): в среднем [\d,]+ кг/.test(year), 'a year: by week, with the average', year);
  await group.getByRole('button', { name: '7 дней', exact: true }).click();
  await p.waitForTimeout(800);
  const points = await weight.locator('.trend circle').count();
  expect(points >= 2 && points <= 7, '7 days: a point a day', points);
  for (const [title, group2] of [['Шаги', 'Период: шаги'], ['Питание', 'Период: калории']]) {
    const block = p.locator('section.block', { has: p.getByRole('heading', { name: title, exact: true }) });
    await block.getByRole('group', { name: group2 }).getByRole('button', { name: '3 месяца', exact: true }).click();
    await p.waitForTimeout(800);
    const bars = await block.locator('.trend rect').count();
    const sum = (await block.locator('.trend-sum').innerText()).replace(/\s+/g, ' ');
    expect(bars >= 12 && bars <= 14 && /^За 3 месяца \(по неделям\): в среднем/.test(sum), title + ': 3 months as 13 weekly bars, with the average', [bars, sum]);
    expect((await block.getByRole('table').locator('tbody tr').count()) === 4, title + ': the last four weeks too');
  }
  // The period stays chosen on this phone.
  await p.reload();
  await p.waitForSelector('.nav', { timeout: 30000 });
  await p.waitForTimeout(1500);
  await p.locator('.nav').getByRole('button', { name: 'Клиенты' }).click();
  await p.waitForTimeout(600);
  await p.locator('.client-row', { hasText: 'Ольга' }).first().locator('.client-open').click();
  await p.waitForTimeout(1000);
  await p.getByRole('tab', { name: 'Замеры' }).click();
  await p.waitForTimeout(1200);
  expect((await weight.getByRole('group', { name: 'Период: вес' }).getByRole('button', { name: '7 дней', exact: true }).getAttribute('aria-pressed')) === 'true', 'the chosen period is kept after a reload');
  await p.setViewportSize({ width: 320, height: 700 });
  await p.waitForTimeout(500);
  const over = await p.evaluate(() => {
    const m = document.querySelector('.main');
    return Math.max(document.documentElement.scrollWidth - innerWidth, m ? m.scrollWidth - m.clientWidth : 0);
  });
  expect(over <= 1, '320 px: the measurements fit', over);
  await p.setViewportSize({ width: 390, height: 844 });
  await p.locator('.main').getByRole('button', { name: 'Назад', exact: true }).first().click().catch(() => {});
});

await scenario('39. Рацион во вкладке клиента: данные из «Замеров», меню на неделю, цены без привязки к городу', async () => {
  await p.locator('.testbar').getByRole('button', { name: 'Клиент' }).click();
  await p.waitForTimeout(1500);
  const today = await p.evaluate(() => new Date().toLocaleDateString('sv-SE'));
  // No data in «Замеры» yet: the tab asks once and saves it there.
  await p.getByRole('tab', { name: 'Рацион' }).click();
  await p.locator('.ration-account').waitFor({ timeout: 10000 });
  await p.getByRole('group', { name: 'Пол' }).getByRole('button', { name: 'Мужчина' }).click();
  await p.locator('#ration-height').fill('182');
  await p.locator('#ration-year').fill(String(new Date().getFullYear() - 36));
  await p.locator('#ration-weight').fill('84,6');
  await p.locator('.ration-account select').selectOption('moderate');
  await p.getByRole('button', { name: 'Сохранить и открыть рацион' }).click();
  const f = p.frameLocator('.ration-box iframe');
  await f.getByRole('heading', { name: /Недельный рацион/ }).waitFor({ timeout: 20000 });
  const body = await call('get', '/api/body');
  expect(body.profile?.heightCm === 182 && body.profile?.sex === 'm' && body.entries.some((e) => e.date === today && e.weight === 84.6), 'saved to his «Замеры»', [body.profile, body.entries.slice(-1)]);
  const account = (await f.getByTestId('from-account').innerText()).replace(/\s+/g, ' ');
  expect(/мужчина, 36 лет, рост 182 см, вес 84,6 кг/.test(account) && (await f.locator('input.field').count()) === 0, 'the questionnaire shows his data from the account, not to be typed', account);
  const intro = await f.locator('header').first().innerText();
  expect(!/Новосибирск|Сибир/.test(intro), 'no city in the intro', intro.slice(0, 160));
  for (let i = 0; i < 4; i++) await f.getByRole('button', { name: 'Дальше' }).click();
  const summary = (await f.locator('main').innerText()).replace(/\s+/g, ' ');
  expect(/силовые тренировки/.test(summary), 'strength training is on (the trainer\'s client)', summary.slice(0, 200));
  await f.getByRole('button', { name: 'Собрать рацион на неделю' }).click();
  await f.getByRole('heading', { name: 'Рацион на неделю' }).waitFor({ timeout: 90000 });
  expect(await f.getByText(/84,6 кг|84.6 кг/).count() > 0, 'the week is worked out for 84.6 kg');
  await f.getByRole('button', { name: 'Покупки' }).click();
  await p.waitForTimeout(800);
  const shop = (await f.locator('main').innerText()).replace(/\s+/g, ' ');
  expect(/Цены примерные/.test(shop) && !/Новосибирск|НГС|Сибир/.test(shop), 'shopping list: prices are approximate, no city', shop.match(/Цены[^.]*\./)?.[0]);
  await f.getByRole('button', { name: 'Источники' }).click();
  await p.waitForTimeout(500);
  const sources = await f.locator('main').innerText();
  expect(!/Новосибирск|НГС|Сибир/.test(sources), 'sources: no city either');
  // Another tab and back: the menu is still there; after the app is opened again — too (kept on the phone).
  await f.getByRole('button', { name: 'Меню' }).click();
  await p.getByRole('tab', { name: 'Тренировка' }).click();
  await p.waitForTimeout(500);
  await p.getByRole('tab', { name: 'Рацион' }).click();
  await p.waitForTimeout(500);
  expect(await f.getByRole('heading', { name: 'Рацион на неделю' }).isVisible(), 'back on the tab: the same menu');
  await p.reload();
  await p.waitForSelector('.nav, .subtabs', { timeout: 30000 });
  await p.waitForTimeout(1500);
  await p.getByRole('tab', { name: 'Рацион' }).click();
  await f.getByRole('heading', { name: 'Рацион на неделю' }).waitFor({ timeout: 20000 });
  expect(true, 'the app opened again: the menu shows at once, nothing to work out');
  // The weight in «Замеры» went down by 2 kg: the ration says so and is rebuilt in one tap.
  await call('post', '/api/body', { date: today, weight: 82.4 });
  await p.reload();
  await p.waitForSelector('.subtabs', { timeout: 30000 });
  await p.waitForTimeout(1500);
  await p.getByRole('tab', { name: 'Рацион' }).click();
  await f.getByText(/изменились данные профиля \(вес 84,6 → 82,4 кг\)/).waitFor({ timeout: 20000 });
  await f.getByRole('button', { name: 'Пересобрать' }).click();
  await f.getByText(/изменились данные профиля/).waitFor({ state: 'detached', timeout: 90000 });
  const head = (await f.getByRole('heading', { name: 'Рацион на неделю' }).locator('xpath=..').innerText()).replace(/\s+/g, ' ');
  expect(/82(,|\.)4 кг/.test(head), 'weight changed in «Замеры»: «Пересобрать» — the ration for 82.4 kg', head.slice(0, 120));
  const box = await p.locator('.ration-box').boundingBox();
  const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(box && box.height >= 420 && over <= 1, 'the ration fills the screen under the tabs, nothing sideways', [box?.height, over]);
  await p.locator('.testbar').getByRole('button', { name: 'Тренер' }).click();
  await p.waitForTimeout(800);
});

await scenario('17. Картинка упражнения: начало, конец, движение', async () => {
  await goGym();
  await p.locator('.gym-tab').first().click();
  const pic = pane().getByRole('button', { name: /^Как выполнять/ }).first();
  const name = (await pic.getAttribute('aria-label')).replace('Как выполнять: ', '');
  await pic.click();
  await p.waitForTimeout(700);
  const sheet = p.locator('.sheet').last();
  const text = await sheet.innerText();
  const svgs = await sheet.locator('svg.fg').count();
  expect(text.includes(name) && /Начало/.test(text) && /Конец/.test(text) && svgs >= 3, 'the sheet shows the movement, the start and the end', [name, svgs]);
  const m1 = await sheet.locator('.xa-motion svg').innerHTML();
  await p.waitForTimeout(500);
  const m2 = await sheet.locator('.xa-motion svg').innerHTML();
  expect(m1 !== m2, 'the movement plays');
  await p.keyboard.press('Escape');
  await sheet.getByRole('button', { name: 'Закрыть' }).click().catch(() => {});
  await p.waitForTimeout(300);
});

await scenario('16. Узкие экраны (320, 360, 375 px): ничего не уезжает вбок', async () => {
  await checkIn('Ольга');
  for (const width of [320, 360, 375]) {
    await p.setViewportSize({ width, height: 700 });
    for (const tab of ['Зал', 'Сводка', 'Клиенты', 'Программы', 'База']) {
      await p.locator('.nav').getByRole('button', { name: tab }).click();
      await p.waitForTimeout(400);
      const over = await p.evaluate(() => {
        const m = document.querySelector('.main');
        return Math.max(document.documentElement.scrollWidth - innerWidth, m ? m.scrollWidth - m.clientWidth : 0);
      });
      expect(over <= 1, width + ' px, «' + tab + '»: no sideways scroll', over);
    }
  }
  // The client card's tabs and the client's own app (the tab strips scroll by themselves, the pages must not).
  const sideways = () =>
    p.evaluate(() => {
      const m = document.querySelector('.main');
      return Math.max(document.documentElement.scrollWidth - innerWidth, m ? m.scrollWidth - m.clientWidth : 0);
    });
  for (const width of [320, 360]) {
    await p.setViewportSize({ width, height: 700 });
    await p.locator('.nav').getByRole('button', { name: 'Клиенты' }).click();
    await p.waitForTimeout(500);
    await p.locator('.client-row', { hasText: 'Александр' }).first().locator('.client-open').click();
    await p.waitForTimeout(900);
    for (const tab of ['Обзор', 'Программы', 'Замеры', 'История', 'Прогресс']) {
      await p.getByRole('tab', { name: tab }).click();
      await p.waitForTimeout(700);
      expect((await sideways()) <= 1, width + ' px, карточка → «' + tab + '»: no sideways scroll', await sideways());
    }
    await p.locator('.main').getByRole('button', { name: 'Назад', exact: true }).first().click();
    await p.locator('.testbar').getByRole('button', { name: 'Клиент' }).click();
    await p.waitForTimeout(1200);
    for (const tab of ['Тренировка', 'Прогресс', 'История', 'Замеры']) {
      await p.getByRole('tab', { name: tab }).click();
      await p.waitForTimeout(700);
      expect((await sideways()) <= 1, width + ' px, приложение клиента → «' + tab + '»: no sideways scroll', await sideways());
    }
    await p.locator('.testbar').getByRole('button', { name: 'Тренер' }).click();
    await p.waitForTimeout(1200);
  }
  await p.setViewportSize({ width: 390, height: 844 });
});

// ---------- report ----------
const all = await p.evaluate(() => window.__perf);
const cls = all.shifts.filter((x) => !x.input).reduce((s, x) => s + x.v, 0);
console.log('\nПлавность (медленный телефон):');
console.log('  действие'.padEnd(58) + 'сдвиг  прокр  отклик  задача');
for (const n of notes)
  console.log(
    '  ' + String(n.label).padEnd(56) + String(n.moved ?? '–').padStart(5) + String(n.scrolled ?? '–').padStart(7) + String(n.slowestTap ?? '–').padStart(7) + String(n.longestTask ?? '–').padStart(8) + (n.sources?.length ? '   ← ' + n.sources.join('; ') : ''),
  );
console.log(`  Всего неожиданных сдвигов (CLS): ${cls.toFixed(3)}; длинных задач > 200 мс: ${all.long.filter((x) => x.d > 200).length}; ответов на касание > 200 мс: ${all.events.filter((x) => x.d > 200).length}`);
const slowTaps = all.events.filter((x) => x.d > 200).map((x) => x.name + ' ' + x.target + ' ' + x.d + 'мс');
if (slowTaps.length) console.log('  Медленные ответы: ' + slowTaps.slice(0, 12).join('; '));
const bigShifts = all.shifts.filter((x) => !x.input && x.v > 0.01).map((x) => x.v.toFixed(3) + ' ' + x.src);
if (bigShifts.length) console.log('  Сдвиги без касания: ' + bigShifts.slice(0, 12).join('; '));
console.log(errs.length ? 'Ошибки страницы:\n  ' + errs.join('\n  ') : 'Ошибок страницы нет');
console.log(`\n${checks} проверок, ошибок: ${failures}`);
await browser.close();
process.exit(failures ? 1 : 0);
