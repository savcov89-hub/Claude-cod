// Weekly volume: what one set of an exercise counts for, the week from Monday to Sunday, the plan of a program
// done fewer times a week than it has workouts, own exercises with halves and older records with whole groups.
//   npx tsx scripts/check-volume.ts
import { catalog } from '../src/catalog';
import { muscleLoad, programIssue } from '../src/trainingRules';
import { EXERCISE_LOAD, PARTS, cleanMuscles, doneTally, inWeek, loadKeys, ownLoad, planTally, volumeRows, weekPlan, weekStart } from '../src/volume';
import { createHandler } from '../backend/app';
import { GROWTH, autoSplit, planByVolume, targetsFor } from '../src/volumePlanner';
import { ACCENTS, LEVELS, accentParts, cleanFocus } from '../src/volume';
import { sdk } from '../src/local/sdk';

let failures = 0;
let checks = 0;
const expect = (ok: boolean, what: string, detail?: unknown) => {
  checks++;
  if (ok) return console.log('  ✓ ' + what);
  failures++;
  console.log('  ✗ ' + what + (detail === undefined ? '' : '\n    ' + JSON.stringify(detail).slice(0, 400)));
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const set = (n: number) => Array.from({ length: n }, () => ({ weight: 50, reps: 10, rir: 2 }));
const done = (list: Array<[string, number, string[]?]>) =>
  doneTally([{ exercises: list.map(([exerciseId, n, muscles]) => ({ exerciseId, muscles, sets: set(n) })) }]);

console.log('1. Каждое упражнение базы расписано по частям мышц');
const parts = new Set(PARTS.map((p) => p.id));
expect(catalog.every((c) => EXERCISE_LOAD[c.id]), 'у всех упражнений базы есть строка объёма', catalog.filter((c) => !EXERCISE_LOAD[c.id]).map((c) => c.id));
const bad = Object.entries(EXERCISE_LOAD).filter(([, l]) => Object.entries(l).some(([k, f]) => !parts.has(k) || (f !== 1 && f !== 0.5)));
expect(!bad.length, 'только известные части и доли 1 или ½', bad.map(([k]) => k));
expect(Object.values(EXERCISE_LOAD).every((l) => Object.values(l).includes(1)), 'у каждого упражнения есть основная работа (1)');

console.log('2. Половинки и неочевидный объём');
let t = done([['bench-press', 4]]);
expect(t.groups.chest === 4 && t.parts.deltFront === 2 && t.parts.tricepsShort === 2, 'жим лёжа 4 подхода: грудь 4, передняя дельта 2, трицепс 2', t);
expect(!t.parts.tricepsLong, 'жим лёжа не даёт объёма длинной головке трицепса', t.parts);
t = done([['cable-pullover', 4]]);
expect(t.parts.tricepsLong === 2 && !t.parts.tricepsShort && t.groups.triceps === 2, 'пулловер: длинная головка трицепса ½', t);
t = done([['rdl', 3]]);
expect(t.parts.hamsLong === 3 && !t.parts.hamsShort, 'румынская тяга: двусуставные задней поверхности 3, короткая головка 0', t.parts);
t = done([['seated-leg-curl', 3]]);
expect(t.parts.hamsLong === 3 && t.parts.hamsShort === 3 && t.parts.gastrocnemius === 1.5, 'сгибание голени: обе части по 3, икроножная ½', t.parts);
t = done([['back-squat', 4], ['leg-extension', 3]]);
expect(t.parts.rectusFemoris === 3 && t.parts.vasti === 7 && t.groups.quads === 7, 'присед + разгибание: прямая мышца только от разгибания (3), широкие 7', t.parts);
t = done([['seated-row', 3]]);
expect(t.groups.biceps === 1.5 && t.parts.bicepsBrachii === 1.5 && t.parts.brachialis === 1.5, 'тяга: сгибатели локтя ½ — группа считается один раз, а не дважды', t);
t = done([['seated-calf-raise', 4], ['standing-calf-raise', 2]]);
expect(t.parts.soleus === 6 && t.parts.gastrocnemius === 2, 'икры: сидя — только камбаловидная', t.parts);
t = doneTally([{ exercises: [{ exerciseId: 'bench-press', sets: [...set(2), { weight: 50, reps: 0, rir: null }] }] }]);
expect(t.groups.chest === 2, 'подход без повторов не считается', t.groups);

console.log('3. Свои упражнения');
expect(same(ownLoad(['delts']), { deltFront: 1, deltSide: 1, deltRear: 1 }), 'старая запись «Дельты» — все три пучка');
expect(same(ownLoad(['deltFront', 'triceps:0.5']), { deltFront: 1, tricepsLong: 0.5, tricepsShort: 0.5 }), 'части и половинки читаются');
expect(same(loadKeys({ tricepsLong: 1, tricepsShort: 1, deltSide: 0.5 }), ['deltSide:0.5', 'triceps']), 'запись своего упражнения: «deltSide:0.5», «triceps»', loadKeys({ tricepsLong: 1, tricepsShort: 1, deltSide: 0.5 }));
expect(same(cleanMuscles(['chest', 'x', 'triceps:0.5', 'tricepsLong:2', '<b>', 'chest']), ['chest', 'triceps:0.5']), 'сервер принимает только известные ключи', cleanMuscles(['chest', 'x', 'triceps:0.5', 'tricepsLong:2', '<b>', 'chest']));
t = done([['custom:abc', 3, ['deltFront', 'triceps:0.5']]]);
expect(t.parts.deltFront === 3 && t.parts.tricepsLong === 1.5 && t.groups.triceps === 1.5, 'своё упражнение с половинками считается', t);
const day = muscleLoad([{ exerciseId: 'bench-press', exerciseName: 'Жим', sets: 4 }, { exerciseId: 'custom:z', exerciseName: 'Своё', sets: 3 }]);
expect(day.load.chest.total === 4 && day.unknown.includes('Своё'), 'день программы: без мышц — подсказка «не указаны мышцы»', day);

console.log('4. Неделя с понедельника по воскресенье');
const wed = new Date(2026, 9, 14, 12).getTime(); // Wednesday, 14 Oct 2026
const mon = weekStart(wed);
expect(mon.getDay() === 1 && mon.getDate() === 12 && mon.getHours() === 0, 'неделя начинается в понедельник 00:00', mon.toString());
expect(weekStart(new Date(2026, 9, 18, 23, 59).getTime()).getDate() === 12, 'воскресенье 23:59 — та же неделя');
expect(weekStart(new Date(2026, 9, 19, 0, 0).getTime()).getDate() === 19, 'понедельник 00:00 — новая неделя');
expect(weekStart(wed, -1).getDate() === 5, 'прошлая неделя — с 5 октября');
const at = (y: number, m: number, d: number, h: number) => ({ completedAt: new Date(y, m, d, h).toISOString(), exercises: [] });
const sessions = [at(2026, 9, 11, 22), at(2026, 9, 12, 7), at(2026, 9, 18, 23), at(2026, 9, 19, 6)];
expect(inWeek(sessions, mon).length === 2, 'в неделю 12–18 окт. попадают тренировки пн 07:00 и вс 23:00', inWeek(sessions, mon));

console.log('5. План: программа за неделю');
const program = (perWeek?: number) => ({
  days: ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, exercises: [{ exerciseId: 'bench-press', sets: 3 }] })),
  perWeek,
});
const week = (p: ReturnType<typeof program>) => planTally(weekPlan([p]));
expect(week(program()).groups.chest === 18, '6 тренировок без частоты — каждая раз в неделю: грудь 18');
expect(week(program(3)).groups.chest === 9, '6 тренировок по кругу, 3 в неделю — половина: грудь 9');
const rows = volumeRows(done([['bench-press', 3]]), week(program(3)));
const chest = rows.find((r) => r.id === 'chest');
const tri = rows.find((r) => r.id === 'triceps');
expect(chest?.done === 3 && chest.plan === 9, 'строка «Грудь»: 3 из 9', chest);
expect(tri?.parts.length === 2 && tri.parts[0].id === 'tricepsLong' && tri.parts[1].plan === 4.5, 'трицепс разбит на длинную и остальные головки', tri);

console.log('6. Сервер хранит «тренировок в неделю»');
const handle: any = createHandler(sdk);
const T = 'vol-trainer';
const call = async (method: string, path: string, body?: unknown) => {
  const res = await handle(method, path, body, { userId: T, name: 'Тренер', email: '' });
  if (res.status >= 400) throw new Error(path + ': ' + res.data?.error);
  return res.data;
};
await call('POST', '/api/profile', { role: 'trainer', name: 'Тренер' });
const { client } = await call('POST', '/api/clients', { clientName: 'Вера' });
const days = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: 'Тренировка ' + id, exercises: [{ exerciseId: 'bench-press', sets: 3, repMin: 8, repMax: 12, targetRir: 2 }] }));
const created = (await call('POST', '/api/programs', { clientId: client.clientId, name: 'Верх / низ', days, perWeek: 3 })).program;
expect(created.perWeek === 3, 'новая программа: 3 в неделю при 4 тренировках', created.perWeek);
let saved = (await call('POST', '/api/programs/' + created.id, { name: 'Верх / низ', days })).program;
expect(saved.perWeek === 3, 'изменение без поля не сбрасывает частоту', saved.perWeek);
saved = (await call('POST', '/api/programs/' + created.id, { name: 'Верх / низ', days, perWeek: null })).program;
expect(saved.perWeek === undefined, '«как в программе» убирает частоту', saved.perWeek);
saved = (await call('POST', '/api/programs/' + created.id, { name: 'Верх / низ', days, perWeek: 4 })).program;
expect(saved.perWeek === undefined, 'частота, равная числу тренировок, не хранится', saved.perWeek);
saved = (await call('POST', '/api/programs/' + created.id, { name: 'Верх / низ', days, perWeek: 9 })).program;
expect(saved.perWeek === undefined, 'больше 7 — не принимается', saved.perWeek);
const own = await call('POST', '/api/exercises', { name: 'Жим Арнольда', muscleGroup: 'Плечи', equipment: 'Штанга / гантели', muscles: ['deltFront', 'deltSide:0.5', 'triceps:0.5', 'bogus'] });
expect(same(own.exercise?.muscles, ['deltFront', 'deltSide:0.5', 'triceps:0.5']), 'своё упражнение сохраняет части и половинки', own.exercise);

saved = (await call('POST', '/api/programs/' + created.id, { name: 'Верх / низ', days, targets: { chest: 12, deltSide: 10.4, bogus: 5, lats: 0 } })).program;
expect(same(saved.targets, { chest: 12, deltSide: 10 }), 'цели программы: известные части, целые подходы', saved.targets);
saved = (await call('POST', '/api/programs/' + created.id, { name: 'Верх / низ', days })).program;
expect(same(saved.targets, { chest: 12, deltSide: 10 }), 'изменение без целей их не сбрасывает', saved.targets);
saved = (await call('POST', '/api/programs/' + created.id, { name: 'Верх / низ', days, targets: {} })).program;
expect(saved.targets === undefined, 'пустые цели убираются', saved.targets);
saved = (await call('POST', '/api/programs/' + created.id, { name: 'Верх / низ', days, focus: { level: 'advanced', accents: ['glutes', 'x'] } })).program;
expect(same(saved.focus, { level: 'advanced', accents: ['glutes'] }), 'опыт и акценты сохраняются в программе', saved.focus);
saved = (await call('POST', '/api/programs/' + created.id, { name: 'Верх / низ', days })).program;
expect(same(saved.focus, { level: 'advanced', accents: ['glutes'] }), 'изменение без них их не сбрасывает', saved.focus);
saved = (await call('POST', '/api/programs/' + created.id, { name: 'Верх / низ', days, focus: null })).program;
expect(saved.focus === undefined, '«Очистить» убирает их', saved.focus);

console.log('7. Программа по объёму');
const DAY_KIND: Array<[RegExp, string[]]> = [
  [/^Верх/, ['chest', 'lats', 'upperBack', 'deltFront', 'deltSide', 'deltRear', 'bicepsBrachii', 'brachialis', 'tricepsLong', 'tricepsShort', 'abs']],
  [/^(Низ|Ноги)/, ['rectusFemoris', 'vasti', 'hamsLong', 'hamsShort', 'glutes', 'abductors', 'adductors', 'gastrocnemius', 'soleus', 'erectors', 'abs']],
  [/^Толкай/, ['chest', 'deltFront', 'deltSide', 'tricepsLong', 'tricepsShort', 'abs']],
  [/^Тяни/, ['lats', 'upperBack', 'deltRear', 'bicepsBrachii', 'brachialis', 'erectors', 'abs']],
];
const { roleOf } = await import('../src/templates');
let slowest = 0;
const PRESETS = LEVELS.map((l) => ({ id: l.id, label: l.label, targets: targetsFor(l.id) }));
for (const preset of PRESETS)
  for (const n of [2, 3, 4, 5, 6]) {
    // «Продвинутый» needs 8 exercises a workout to fit; the rest — the usual 7.
    const perDay = preset.id === 'advanced' ? 8 : 7;
    const t0 = performance.now();
    const r = planByVolume(preset.targets, { days: n, perDay });
    slowest = Math.max(slowest, performance.now() - t0);
    const label = preset.label + ', ' + n + ' в неделю';
    const all = r.days.flatMap((d) => d.exercises);
    const bad: string[] = [];
    if (programIssue(r.days)) bad.push(programIssue(r.days));
    if (r.days.length !== n) bad.push('дней ' + r.days.length);
    if (all.some((e) => e.sets < 2 || e.sets > 5)) bad.push('подходы вне 2–5');
    if (r.days.some((d) => d.exercises.length > perDay)) bad.push('больше ' + perDay + ' упражнений');
    if (new Set(all.map((e) => e.exerciseId)).size !== all.length) bad.push('упражнение повторяется за неделю');
    for (const d of r.days) {
      const roles = d.exercises.map((e) => roleOf(e.exerciseId)).filter((x) => x && x !== 'lateralRaise');
      if (new Set(roles).size !== roles.length) bad.push(d.name + ': два упражнения одного типа');
      if (d.exercises.some((e) => roleOf(e.exerciseId) === 'dip')) bad.push(d.name + ': брусья (их ставит тренер)');
      const kind = DAY_KIND.find(([re]) => re.test(d.name));
      if (kind) for (const e of d.exercises) for (const [p, f] of Object.entries(EXERCISE_LOAD[e.exerciseId])) if (f === 1 && !kind[1].includes(p)) bad.push(d.name + ': ' + e.exerciseName);
      const tally = planTally(d.exercises);
      for (const [p, v] of Object.entries(tally.parts)) if (v > 9) bad.push(d.name + ': ' + p + ' ' + v + ' за тренировку');
    }
    expect(!bad.length, label + ': программа по правилам', bad);
    // Enough room (4+ workouts, «Продвинутый» 5+): short of a target by 2 sets at most; over it — by 3 or by the
    // target itself for small ones (halves from big movements: hinges give the erectors half a set wanted or not).
    const off = Object.entries(preset.targets).map(([p, t]) => [p, (r.total[p] || 0) - t, t] as const);
    if (n >= (preset.id === 'advanced' ? 5 : 4)) {
      const far = off.filter(([, d, t]) => d < -2 || d > Math.max(3, t));
      expect(!far.length, label + ': недобор не больше 2 подходов, перебор не больше 3 (у малых целей — не больше чем вдвое)', far);
    }
  }
expect(slowest < 1500, 'составляется быстро (самое долгое ' + Math.round(slowest) + ' мс)');
const once = planByVolume(PRESETS[1].targets, { days: 4 });
const again = planByVolume(PRESETS[1].targets, { days: 4 });
const other = planByVolume(PRESETS[1].targets, { days: 4, variant: 1 });
expect(same(once.days, again.days), 'те же цели — та же программа');
const ids = (r: typeof once) => r.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)).sort().join();
expect(ids(once) !== ids(other), '«Другой вариант» — другие упражнения');
expect(planByVolume({}, { days: 3 }).days.length === 0, 'без целей — пусто');
const upperOnly = planByVolume({ chest: 9, lats: 9, deltSide: 6 }, { days: 4 });
expect(upperOnly.days.length === 2 && upperOnly.days.every((d) => /^Верх/.test(d.name)), 'цели только на верх: дни низа не появляются', upperOnly.days.map((d) => d.name));
const hinge = planByVolume({ hamsLong: 6, glutes: 6 }, { days: 2 });
expect((hinge.total.hamsShort || 0) <= 1 && hinge.total.hamsLong >= 5, 'двусуставные задней поверхности — наклоны, без сгибаний голени', hinge.days.map((d) => d.exercises.map((e) => e.exerciseId)));
const curlOnly = planByVolume({ hamsShort: 6, hamsLong: 6 }, { days: 2 });
expect(curlOnly.total.hamsShort >= 5, 'короткая головка — сгибания голени', curlOnly.total);
const longHead = planByVolume({ tricepsLong: 6 }, { days: 2 });
expect(longHead.total.tricepsLong >= 5, 'длинная головка трицепса закрывается разгибаниями', longHead.days.map((d) => d.exercises.map((e) => e.exerciseId)));
expect(planByVolume(PRESETS[1].targets, { days: 3, split: 'ppl' }).split === 'ppl' && autoSplit(4) === 'upperLower', 'схема: выбранная или по числу тренировок');
expect(autoSplit(5, ['glutes', 'quads']) === 'lowerUpper' && autoSplit(5, ['chest']) === 'hybrid' && autoSplit(3, ['glutes']) === 'full', 'акценты на ноги: схема низ / верх с низа');

console.log('8. Акценты: специализация и поддержание');
const mid = targetsFor('middle', ['chest']);
expect(mid.chest === Math.round(GROWTH.middle.chest * 1.4) && mid.lats === Math.round(GROWTH.middle.lats * 0.5), 'акцент — ×1,4 от объёма роста, остальные — половина', { chest: mid.chest, lats: mid.lats });
expect(targetsFor('novice', ['chest']).chest < mid.chest && mid.chest < targetsFor('advanced', ['chest']).chest, 'подходов больше с опытом: новичок < средний < продвинутый');
expect(same(targetsFor('middle', []), targetsFor('middle')), 'без акцентов — всё на рост');
expect(same(cleanFocus({ level: 'middle', accents: ['chest', 'chest', 'back', 'x', 'delts', 'abs'] }), { level: 'middle', accents: ['chest', 'back', 'delts'] }), 'не больше 3 акцентов, только известные');
expect(cleanFocus({ level: 'pro', accents: [] }) === undefined, 'неизвестный опыт не принимается');
const isFor = (id: string, marked: Map<string, number>) => Object.entries(EXERCISE_LOAD[id]).some(([p, f]) => f === 1 && marked.has(p));
const cases: Array<[any, string[], number]> = [
  ['middle', ['chest'], 4], ['middle', ['chest'], 3], ['novice', ['glutes'], 3], ['middle', ['glutes', 'hamstrings'], 4],
  ['advanced', ['delts'], 6], ['middle', ['back', 'biceps'], 4], ['advanced', ['quads', 'glutes', 'calves'], 5], ['novice', ['triceps', 'chest'], 2],
];
for (const [level, acc, n] of cases) {
  const t = targetsFor(level, acc);
  const r = planByVolume(t, { days: n, accents: acc });
  const marked = accentParts(acc);
  const label = level + ', ' + acc.map((a) => ACCENTS.find((x) => x.id === a)!.label).join(' + ') + ', ' + n + ' в неделю';
  const order: string[] = [];
  for (const d of r.days) {
    const ranks = d.exercises.map((e) => Math.min(...Object.entries(EXERCISE_LOAD[e.exerciseId]).filter(([, f]) => f === 1).map(([p]) => marked.get(p) ?? 9)));
    if (ranks.some((x, i) => i && x < ranks[i - 1])) order.push(d.name + ': ' + d.exercises.map((e) => e.exerciseName).join(', '));
  }
  expect(!order.length, label + ': упражнения акцентов первыми (первый акцент — раньше второго)', order);
  const short = [...marked.keys()].filter((p) => t[p] && (r.total[p] || 0) < t[p] - 2).map((p) => p + ' ' + (r.total[p] || 0) + '/' + t[p]);
  if (n >= 3) expect(!short.length, label + ': акценты закрыты (недобор не больше 2)', short);
  expect(r.days.some((d) => d.exercises.length && isFor(d.exercises[0].exerciseId, marked)), label + ': есть тренировки, которые начинаются с акцента');
}
// No room for everything: maintenance gives way, not the accent.
const tight = planByVolume(targetsFor('middle', ['chest']), { days: 2, perDay: 5, accents: ['chest'] });
const tightPlain = planByVolume(targetsFor('middle', ['chest']), { days: 2, perDay: 5 });
expect((tight.total.chest || 0) >= (tightPlain.total.chest || 0), 'когда места мало, акцент получает не меньше, чем без приоритета', [tight.total.chest, tightPlain.total.chest]);

console.log(`\n${checks} проверок, ошибок: ${failures}`);
process.exit(failures ? 1 : 0);
