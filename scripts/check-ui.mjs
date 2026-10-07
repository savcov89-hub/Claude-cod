// The app in a phone-sized browser (test mode, ?demo=1), CPU slowed down like a phone: every way a workout
// is recorded from the screens, and how smooth it is — rows that jump, scroll that moves by itself, typing that
// loses focus, taps that take long to answer.
//   npm run dev  (or APP=…)   then   node scripts/check-ui.mjs [--slow=4] [--shots=dir]
import { chromium } from 'playwright';

const APP = process.env.APP || 'http://127.0.0.1:5173/?demo=1';
const arg = (k, d) => (process.argv.find((a) => a.startsWith('--' + k + '=')) || '').split('=')[1] || d;
const SLOW = Number(arg('slow', 4));
const SHOTS = arg('shots', '');

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

await scenario('20. Забытая тренировка прошлых дней: «Открыть» в карточке не отмечает клиента пришедшим', async () => {
  await p.locator('.testbar').getByRole('button', { name: 'Тренер' }).click();
  await p.waitForTimeout(1200);
  const today = await p.evaluate(() => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  });
  const { clients } = await call('get', '/api/clients');
  const { programs } = await call('get', '/api/programs');
  // A client not in the gym, not seen today, with a program.
  const c = clients.find((x) => !x.checkedInAt && !(x.visits || []).includes(today) && programs.some((pr) => pr.clientId === x.clientId && !pr.archived && !pr.free));
  expect(!!c, 'a client away today with a program', clients.map((x) => [x.clientName, !!x.checkedInAt]));
  if (!c) return;
  const pr = programs.find((x) => x.clientId === c.clientId && !x.archived && !x.free);
  const day = pr.days[pr.days.length - 1];
  // Two days ago one set was recorded and the workout was never finished.
  const w = await call('get', '/api/workout/' + pr.trainerId + '/' + pr.id + '/' + day.id);
  const ex = w.day.exercises[0];
  await p.evaluate(async () => (await import('/src/clock.ts')).setClockOffset(-2 * 86400000));
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
  await p.locator('.nav').getByRole('button', { name: 'Клиенты' }).click();
  await p.waitForTimeout(600);
  await p.locator('.client-row', { hasText: c.clientName }).first().locator('.client-open').click();
  await p.waitForTimeout(1500);
  const bar = p.locator('.review-bar', { hasText: 'Не завершена' }).first();
  expect((await bar.count()) > 0, 'the card shows the workout left two days ago');
  await bar.getByRole('button', { name: 'Открыть' }).click();
  await p.waitForTimeout(1500);
  const onGym = (await p.locator('.nav').getByRole('button', { name: 'Зал' }).getAttribute('aria-current')) === 'page';
  expect(!onGym, 'it opens in the card, not in the gym');
  const stale = p.locator('.stale');
  expect((await stale.count()) > 0, 'the journal offers to write it to history');
  await stale.getByRole('button', { name: 'Записать' }).click();
  await p.waitForTimeout(1800);
  await dismiss();
  const after = (await call('get', '/api/clients')).clients.find((x) => x.clientId === c.clientId);
  expect(!after.checkedInAt && !(after.visits || []).includes(today), 'not marked in the gym and no visit today', [after.checkedInAt, after.visits?.slice(-3)]);
  const hist = (await call('get', '/api/client/' + c.clientId + '/history')).sessions;
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  expect(hist.some((x) => x.completedAt.slice(0, 10) === twoDaysAgo), 'the workout is in history on its own day', hist.slice(0, 2).map((x) => x.completedAt));

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
