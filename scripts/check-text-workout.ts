// A workout written or spoken as text (src/workoutText.ts) and gym names → exercises of the base (src/exerciseMatch.ts).
//   npx tsx scripts/check-text-workout.ts
import { parseWorkoutText, planOf } from '../src/workoutText';
import { matchExercise } from '../src/exerciseMatch';
import { catalog } from '../src/catalog';
import type { Exercise } from '../src/types';
import { AI_MODEL, AI_SCHEMA, aiEditSystem, aiSelfCheck, aiSystem, cleanAiEdit, cleanAiWorkout, openRouter } from '../backend/aiWorkout';

let failures = 0;
let checks = 0;
const expect = (ok: boolean, what: string, detail?: unknown) => {
  checks++;
  if (ok) return console.log('  ✓ ' + what);
  failures++;
  console.log('  ✗ ' + what + (detail === undefined ? '' : '\n    ' + JSON.stringify(detail).slice(0, 400)));
};
const today = new Date(2026, 10, 2);
const base = catalog as unknown as Exercise[];
const sets = (text: string) =>
  parseWorkoutText(text, today).workouts.flatMap((w) => w.exercises.map((e) => e.name + ': ' + e.sets.map((s) => s.weight + '×' + s.reps).join(' ')));
const name = (written: string, heading?: string) => matchExercise(written, base, heading).exercise?.name || '—';

console.log('1. Строки тренера: вес, подходы×повторы, повторы через запятую');
const quick = sets('Жим ногами 45 3х15\nРумынская тяга 20 3х12,10,8\nОтжимания от пола 30,27,16');
expect(
  JSON.stringify(quick) === JSON.stringify(['Жим ногами: 45×15 45×15 45×15', 'Румынская тяга: 20×12 20×10 20×8', 'Отжимания от пола: 0×30 0×27 0×16']),
  '«45 3х15», «20 3х12,10,8», «30,27,16»',
  quick,
);
expect(sets('Жим лёжа 12,5 3х10')[0] === 'Жим лёжа: 12.5×10 12.5×10 12.5×10', 'дробный вес «12,5»', sets('Жим лёжа 12,5 3х10'));
expect(sets('Гакк 60 кг 12 раз')[0] === 'Гакк: 60×12', '«60 кг 12 раз»', sets('Гакк 60 кг 12 раз'));
expect(sets('Жим 45х3х10')[0] === 'Жим: 45×10 45×10 45×10', '«45х3х10»');
const amb = parseWorkoutText('Подтягивания 3х8', today).workouts[0].exercises[0];
expect(amb.sets.length === 3 && amb.ambiguous?.a === 3, '«3х8» без веса — 3 подхода, с кнопкой «3 — это вес»', amb);

console.log('2. Голос: всё одной фразой, числа словами, «на» и «по»');
const voice = sets('жим ногами 45 кг 3 подхода по 15 румынская тяга двадцать три на 12 10 8 отжимания от пола 30 27 16');
expect(
  JSON.stringify(voice) === JSON.stringify(['Жим ногами: 45×15 45×15 45×15', 'Румынская тяга: 20×12 20×10 20×8', 'Отжимания от пола: 0×30 0×27 0×16']),
  'фраза делится на упражнения, «3 на 12 10 8» — повторы подходов',
  voice,
);
const noted = parseWorkoutText('пендулум 70 на 20 не глубоко', today).workouts[0].exercises;
expect(noted.length === 1 && noted[0].note === 'не глубоко' && noted[0].sets[0].reps === 20, '«не глубоко» после чисел — комментарий', noted);

console.log('3. Заметки с телефона: дата, вес тела, группы, «вес×повторы; …»');
const notes = `Денис Вагнер
24 августа 44,6;

Спина
Подтягивания 10; 10,7,
Жираф 5x15;
Вертикальная блочная тяга 38x17;

Грудь
Жим в тренажёре красный 25x15; 32x10;
32x13,12,10;
Брусья 8,

Плечи
Жим сидя в тренажере 18x10; 18x10,10,20;
25x10,
Отведение стоя с гантелями 3x15; 4x15;

Ноги
Приседания на блине
Пендулум 70x20(не глубоко)

1 сентября
Подтягивания 11; 10,8`;
const n = parseWorkoutText(notes, today);
expect(n.title === 'Денис Вагнер' && n.notes, 'имя сверху — заголовок, не упражнение', n.title);
expect(n.workouts.length === 2 && n.workouts[0].date === '2026-08-24' && n.workouts[0].bodyWeight === 44.6, 'две даты, вес тела 44,6', n.workouts.map((w) => [w.date, w.bodyWeight]));
const got = sets(notes);
const want = [
  'Подтягивания: 0×10 0×10 0×7',
  'Жираф: 5×15',
  'Вертикальная блочная тяга: 38×17',
  'Жим в тренажёре красный: 25×15 32×10 32×13 32×12 32×10',
  'Брусья: 0×8',
  'Жим сидя в тренажере: 18×10 18×10 18×10 18×20 25×10',
  'Отведение стоя с гантелями: 3×15 4×15',
  'Приседания на блине: ',
  'Пендулум: 70×20',
  'Подтягивания: 0×11 0×10 0×8',
];
expect(JSON.stringify(got) === JSON.stringify(want), 'подходы каждого упражнения (в заметках «5x15» — 5 кг × 15)', got);
expect(n.workouts[0].exercises[0].group === 'Спина' && n.workouts[0].exercises.at(-1)?.note === 'не глубоко', 'группа из заголовка, «(не глубоко)» — комментарий');
expect(parseWorkoutText('15 декабря\nЖим 50x10', today).workouts[0].date === '2025-12-15', 'дата впереди сегодняшней — прошлого года');
expect(parseWorkoutText('24.08\nЖим 50x10', today).workouts[0].date === '2026-08-24', 'дата «24.08»');

console.log('4. Названия зала → упражнения базы');
const pairs: Array<[string, string | undefined, string]> = [
  ['Жим ногами', undefined, 'Жим ногами'],
  ['Румынская тяга', undefined, 'Румынская тяга'],
  ['Вертикальная блочная тяга', 'Спина', 'Вертикальная тяга'],
  ['Горизонтальная блочная тяга', 'Спина', 'Горизонтальная тяга'],
  ['Жим в тренажёре красный', 'Грудь', 'Жим в тренажёре'],
  ['Брусья', 'Грудь', 'Отжимания на брусьях'],
  ['Разводка в бабочке', 'Грудь', 'Сведение рук в тренажёре (бабочка)'],
  ['Жим сидя в тренажере', 'Плечи', 'Жим вверх в тренажёре'],
  ['Отведение стоя с гантелями', 'Плечи', 'Отведение гантелей в стороны'],
  ['Пендулум', 'Ноги', 'Маятниковый присед'],
  ['Подтягивания', 'Спина', 'Подтягивания'],
  ['Отжимания от пола', undefined, '—'],
  ['Жираф', 'Спина', '—'],
];
for (const [w, h, e] of pairs) expect(name(w, h) === e, `«${w}» → ${e === '—' ? 'новое упражнение' : '«' + e + '»'}`, name(w, h));
const remembered = matchExercise('Жираф', base, 'Спина', { жираф: 'lat-pulldown' }).exercise?.id;
expect(remembered === 'lat-pulldown', 'выбранное руками запоминается', remembered);

console.log('5. План программы из сделанного');
const plan = (t: string) => {
  const p = planOf(parseWorkoutText(t, today).workouts[0].exercises[0].sets);
  return `${p.sets}×${p.repMin}–${p.repMax}`;
};
expect(plan('Жим ногами 45 3х15') === '3×12–15' && plan('Тяга 20 3х12,10,8') === '3×8–12' && plan('Жим 50х10') === '1×8–10', '«3х15» → 3×12–15, «12,10,8» → 3×8–12');

console.log('6. Нейросеть: запрос к OpenRouter и проверка ответа');
const known = new Set(base.map((e) => e.id));
const answer = JSON.stringify({
  title: null,
  days: [
    { name: 'Грудь и спина', date: null, bodyWeight: null, exercises: [
      { written: 'Жим штанги лёжа', exerciseId: 'bench-press', done: [], plan: { sets: 3, repMin: 12, repMax: 8 }, note: null },
      { written: 'Жираф', exerciseId: 'made-up-id', done: [{ weight: '5', reps: 15 }, { weight: 2000, reps: 3 }], plan: null, note: '' },
    ] },
    { name: '', date: '2026-08-24', bodyWeight: 44.6, exercises: [{ written: 'Пресс', exerciseId: 'crunch', done: [], plan: null, note: null }] },
    { name: 'Пустой', date: null, bodyWeight: null, exercises: [] },
  ],
});
const clean = cleanAiWorkout('```json\n' + answer + '\n```', known);
expect(clean?.days.length === 2, 'пустой день убран, ответ в ```json``` читается', clean?.days.map((d) => d.name));
const d0 = clean?.days[0].exercises;
expect(d0?.[0].exerciseId === 'bench-press' && d0?.[0].plan?.repMin === 8 && d0?.[0].plan?.repMax === 12, 'id из базы остаётся, диапазон повторов упорядочен', d0?.[0]);
expect(d0?.[1].exerciseId === null && d0?.[1].done.length === 1 && d0?.[1].done[0].weight === 5, 'выдуманный id — null, вес вне 0–1500 отброшен', d0?.[1]);
expect(clean?.days[1].name === 'День 2' && clean?.days[1].bodyWeight === 44.6, 'день без названия — «День 2»; вес тела при дате', clean?.days[1]);
expect(cleanAiWorkout('не JSON', known) === null && cleanAiWorkout('{"days":[]}', known) === null, 'не JSON или без упражнений — нет ответа');
const sys = aiSystem(base, '2026-11-05');
expect(sys.includes('bench-press | Жим штанги лёжа | Грудь') && sys.includes('2026-11-05'), 'нейросети даны упражнения базы и сегодняшняя дата');
let sent: any = null;
const call = openRouter('sk-test', (async (url: string, init: any) => {
  sent = { url, headers: init.headers, body: JSON.parse(init.body) };
  return new Response(JSON.stringify({ choices: [{ message: { content: answer } }] }), { status: 200 });
}) as unknown as typeof fetch);
const got2 = await call({ system: 'x', content: [{ type: 'text', text: 'y' }], schema: AI_SCHEMA as any });
expect(
  sent.url === 'https://openrouter.ai/api/v1/chat/completions' && sent.headers.Authorization === 'Bearer sk-test' && sent.body.model === AI_MODEL &&
    sent.body.response_format.type === 'json_schema' && got2 === answer,
  'запрос: ключ в заголовке, модель, ответ по схеме',
  sent?.body?.model,
);
const fail = openRouter('bad', (async () => new Response('{}', { status: 402 })) as unknown as typeof fetch);
const why = await fail({ system: '', content: [], schema: {} }).catch((e) => e.why);
expect(why === 'money', 'закончились деньги — понятная причина', why);

console.log('7. Одна тренировка несколько раз, подходы словами, упражнения клиента первыми');
const once = cleanAiWorkout(
  JSON.stringify({ title: '', perWeek: 3, days: [{ name: 'Всё тело', date: '', bodyWeight: 0, exercises: [{ written: 'Жим ногами', exerciseId: 'leg-press', done: [], plan: { sets: 1, repMin: 0, repMax: 0 }, note: '' }] }] }),
  known,
);
expect(once?.perWeek === 3 && once.days[0].exercises[0].plan?.sets === 1 && once.days[0].exercises[0].plan?.repMin === 0, '«по одному подходу» без повторов — 1 подход, повторы подставит приложение', once);
const sys2 = aiSystem({ client: [{ id: 'custom:red', name: 'Жим в тренажёре красный', muscleGroup: 'Грудь' }], own: [], common: base }, '2026-11-05');
expect(sys2.indexOf('custom:red') < sys2.indexOf('bench-press') && /в первую очередь/.test(sys2) && /ОДНА тренировка/.test(sys2), 'упражнения программ клиента — первыми; «три раза в неделю» — одна тренировка');

console.log('8. Правка программы словами');
const prog = [{ id: 'day-1', name: 'Всё тело', exercises: ['leg-press', 'rdl', 'bench-press'].map((id) => ({ exerciseId: id, exerciseName: id, sets: 2, repMin: 10, repMax: 12, targetRir: 2 })) }];
const editSys = aiEditSystem({ client: [], own: [], common: base }, prog, 3);
expect(/id=day-1 «Всё тело»/.test(editSys) && /1\. leg-press \| leg-press \| 2 подх\. × 10–12, RIR 2/.test(editSys) && /3 раз в неделю/.test(editSys), 'нейросеть видит программу с номерами упражнений');
const edited = cleanAiEdit(
  JSON.stringify({
    summary: 'Первые два по 3 подхода, третье — 1.',
    perWeek: 0,
    days: [
      { id: 'day-1', name: 'Всё тело', exercises: [
        { exerciseId: 'leg-press', exerciseName: 'Жим ногами', sets: 3, repMin: 10, repMax: 12, targetRir: 2 },
        { exerciseId: 'deadlift', exerciseName: 'Становая тяга', sets: 3, repMin: 0, repMax: 0, targetRir: 9 },
        { exerciseId: 'bench-press', exerciseName: '', sets: 1, repMin: 10, repMax: 12, targetRir: 2 },
        { exerciseId: '', exerciseName: 'Жираф', sets: 0, repMin: 0, repMax: 0, targetRir: 2 },
      ] },
      { id: 'day-1', name: 'Копия', exercises: [{ exerciseId: 'made-up', exerciseName: '', sets: 1, repMin: 1, repMax: 1, targetRir: 1 }] },
      { id: 'zzz', name: 'Новая', exercises: [{ exerciseId: 'crunch', exerciseName: 'Скручивание', sets: 2, repMin: 15, repMax: 20, targetRir: 1 }] },
    ],
  }),
  known,
  prog,
);
const e0 = edited?.days[0].exercises;
expect(e0?.map((x) => x.sets).join(',') === '3,3,1,3', 'подходы по словам; неверное число — как было или 3', e0);
expect(e0?.[1].repMin === 8 && e0?.[1].targetRir === 2 && e0?.[2].exerciseName === 'bench-press', 'неверные повторы и RIR — по умолчанию; пустое название — прежнее', e0);
expect(e0?.[3].exerciseId === '' && e0?.[3].exerciseName === 'Жираф', 'нет в базе — новое упражнение по названию', e0?.[3]);
expect(edited?.days.length === 2 && edited.days[1].id === '' && edited.perWeek === null, 'тренировка без упражнений убрана, новая — без id, perWeek 0 — как было', edited?.days.map((d) => d.id));

console.log('9. Проверка нейросети после публикации (на образцовых ответах)');
const ideal = async ({ system, content }: { system: string; content: any[] }) => {
  const t = content[0].text as string;
  if (system.startsWith('Ты помощник фитнес-тренера. Ниже программа'))
    return JSON.stringify({ summary: 'ok', perWeek: 0, days: [{ id: 'day-1', name: 'Всё тело', exercises: ['leg-press', 'deadlift', 'bench-press', 'lat-pulldown', 'lateral-raise', 'dumbbell-curl'].map((id, i) => ({ exerciseId: id, exerciseName: id, sets: i < 4 ? 3 : 1, repMin: 10, repMax: 12, targetRir: 2 })) }] });
  if (/Жим ногами 45/.test(t)) return JSON.stringify({ title: '', perWeek: 0, days: [{ name: 'A', date: '', bodyWeight: 0, exercises: [{ written: 'Жим ногами', exerciseId: 'leg-press', done: [1, 2, 3].map(() => ({ weight: 45, reps: 15 })), plan: { sets: 0, repMin: 0, repMax: 0 }, note: '' }] }] });
  if (/три раза в неделю/.test(t))
    return JSON.stringify({ title: '', perWeek: 3, days: [{ name: 'Всё тело', date: '', bodyWeight: 0, exercises: ['leg-press', 'rdl', 'bench-press', 'lat-pulldown', 'lateral-raise', 'dumbbell-curl'].map((id, i) => ({ written: id, exerciseId: id, done: [], plan: { sets: i < 4 ? 3 : 1, repMin: 0, repMax: 0 }, note: '' })) }] });
  return JSON.stringify({ title: '', perWeek: 0, days: ['bench-press', 'leg-press', 'dumbbell-curl'].map((id, i) => ({ name: 'Д' + i, date: '', bodyWeight: 0, exercises: [{ written: id, exerciseId: id, done: [], plan: { sets: 0, repMin: 0, repMax: 0 }, note: '' }] })) });
};
const cases = await aiSelfCheck(ideal as any, base, '2026-11-05');
expect(cases.length === 4 && cases.every((c) => c.ok), 'все 4 образца проходят', cases);
const bad = await aiSelfCheck((async () => '{"days":[]}') as any, base, '2026-11-05');
expect(bad.every((c) => !c.ok), 'плохие ответы не проходят', bad.map((c) => c.got));

console.log(`\n${checks} проверок, ошибок: ${failures}`);
process.exit(failures ? 1 : 0);
