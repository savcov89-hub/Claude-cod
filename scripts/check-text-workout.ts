// A workout written or spoken as text (src/workoutText.ts) and gym names → exercises of the base (src/exerciseMatch.ts).
//   npx tsx scripts/check-text-workout.ts
import { parseWorkoutText, planOf } from '../src/workoutText';
import { matchExercise } from '../src/exerciseMatch';
import { catalog } from '../src/catalog';
import type { Exercise } from '../src/types';

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

console.log(`\n${checks} проверок, ошибок: ${failures}`);
process.exit(failures ? 1 : 0);
