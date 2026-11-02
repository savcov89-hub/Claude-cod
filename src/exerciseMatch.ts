// A name written or spoken in the gym → an exercise of the base: «Вертикальная блочная тяга» → «Вертикальная тяга»,
// «Брусья» → «Отжимания на брусьях», «Пендулум» → «Маятниковый присед». Crude stems, word overlap both ways,
// a few gym words, the heading of the notes («Плечи») as a hint. Names the trainer matched by hand are remembered
// (`aliases`) and win next time.
import type { Exercise } from './types';

export interface Match {
  exercise: Exercise;
  score: number;
}

const STOP = new Set(['в', 'во', 'на', 'с', 'со', 'для', 'и', 'по', 'к', 'от', 'из', 'за', 'под', 'над', 'у', 'до']);
// Words saying what kind of machine: count a little.
const LIGHT = new Set(['стек', 'блин', 'рычажн', 'тренаж', 'рук', 'ног']);
const ENDINGS = [
  'иями', 'ями', 'ами', 'ого', 'его', 'ому', 'ему', 'ыми', 'ими', 'ией', 'иях', 'ой', 'ей', 'ий', 'ый', 'ая', 'яя',
  'ое', 'ее', 'ые', 'ие', 'ом', 'ем', 'ах', 'ях', 'ов', 'ев', 'ам', 'ям', 'ию', 'ия', 'ья', 'ье', 'ьи', 'ью', 'ии',
  'а', 'я', 'о', 'е', 'ы', 'и', 'у', 'ю', 'ь', 'й',
];

export const normName = (s: string) =>
  s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/g, ' ')
    .trim();

function stem(w: string) {
  for (const e of ENDINGS) if (w.length - e.length >= 3 && w.endsWith(e)) return w.slice(0, w.length - e.length).slice(0, 7);
  return w.slice(0, 7);
}

// Gym words → words of the base names. «*» — any ending; whole words only.
const syn = (pattern: string) => new RegExp('(^|\\s)(?:' + pattern.replace(/\*/g, '[а-я]*') + ')(?=\\s|$)', 'g');
const SYNONYMS: Array<[RegExp, string]> = [
  [syn('пендулум*|маятник*'), 'маятниковый присед'],
  [syn('брусья'), 'отжимания на брусьях'],
  [syn('разводк*|развод*'), 'сведение'],
  [syn('махи'), 'отведение'],
  [syn('гак*'), 'гакк присед'],
  [syn('гиперэкст*'), 'гиперэкстензия'],
  [syn('французск* жим'), 'разгибание рук лежа'],
  [syn('мертв* тяг*'), 'румынская тяга'],
  [syn('становая'), 'становая тяга'],
  [syn('тяга верхнего блока|верхн* блок*'), 'вертикальная тяга'],
  [syn('тяга нижнего блока|тяга к поясу'), 'горизонтальная тяга'],
  [syn('присед'), 'приседание'],
  [syn('разгибани* ног'), 'разгибание голени'],
  [syn('сгибани* ног'), 'сгибание голени'],
  [syn('сидя в тренажере'), 'сидя в тренажере вверх'],
  [syn('гантелями'), 'гантелей'],
  [syn('задн* дельт*'), 'разведение на заднюю дельту'],
];

const words = (s: string) =>
  normName(s)
    .split(' ')
    .filter((w) => w && !STOP.has(w))
    .map(stem);

const same = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a)));
const weight = (w: string) => (LIGHT.has(w) ? 0.3 : 1);

/** How the base group fits a heading of the notes. */
function groupFit(heading: string | undefined, group: string) {
  if (!heading) return 0;
  const h = heading.toLowerCase();
  const g = group.toLowerCase();
  if (h === 'ноги') return /квадр|бицепс бедра|ягод|икры|приводящ|задняя цепь/.test(g) ? 0.08 : -0.2;
  if (h === 'руки') return /бицепс|трицепс/.test(g) && !/бедра/.test(g) ? 0.08 : -0.2;
  if (h === 'спина') return /спина|разгибатели|задняя цепь/.test(g) ? 0.08 : -0.2;
  if (h === 'плечи') return /плеч/.test(g) ? 0.08 : -0.2;
  return g.includes(h) ? 0.08 : -0.2;
}

export function score(input: string, e: Exercise, heading?: string) {
  const a = normName(input);
  const b = normName(e.name);
  if (a === b) return 1.2;
  let expanded = a;
  for (const [re, to] of SYNONYMS) expanded = expanded.replace(re, (_, pre: string) => pre + to);
  const A = words(expanded);
  const B = words(e.name);
  if (!A.length || !B.length) return 0;
  const sumB = B.reduce((s, w) => s + weight(w), 0);
  const gotB = B.filter((w) => A.some((x) => same(x, w))).reduce((s, w) => s + weight(w), 0);
  // A written word that meets only a light word of the base name («на блине» — «(блины)») counts a little.
  const gotA = A.reduce((s, x) => s + Math.max(0, ...B.filter((w) => same(x, w)).map(weight)), 0);
  const sumA = A.length;
  if (!gotB) return 0;
  // The first word is the movement («Жим», «Тяга», «Сгибание»): a different one is another exercise.
  const head = same(A[0], B[0]) || A.some((x) => same(x, B[0])) ? 0 : -0.1;
  return 0.6 * (gotB / sumB) + 0.4 * (gotA / sumA) + head + groupFit(heading, e.muscleGroup);
}

/** Best matches, best first. */
export function rankExercises(input: string, exercises: Exercise[], heading?: string, limit = 6): Match[] {
  return exercises
    .map((exercise) => ({ exercise, score: score(input, exercise, heading) }))
    .filter((m) => m.score > 0.25)
    .sort((x, y) => y.score - x.score || x.exercise.name.length - y.exercise.name.length)
    .slice(0, limit);
}

/** Taken without asking at or above this score; below — a new exercise is offered. */
export const SURE = 0.75;
export const MAYBE = 0.55;

/** The exercise for a name: remembered → exact → best above MAYBE. */
export function matchExercise(
  input: string,
  exercises: Exercise[],
  heading?: string,
  aliases: Record<string, string> = {},
): { exercise: Exercise | null; score: number } {
  const known = aliases[normName(input)];
  const remembered = known && exercises.find((e) => e.id === known);
  if (remembered) return { exercise: remembered, score: 1.2 };
  const [best] = rankExercises(input, exercises, heading, 1);
  return best && best.score >= MAYBE ? best : { exercise: null, score: best?.score || 0 };
}

/** A guess at the equipment of a new exercise from its name. */
export function guessEquipment(name: string, bodyweight: boolean) {
  const n = normName(name);
  if (/гантел/.test(n)) return 'Гантели';
  if (/штанг|гриф/.test(n)) return 'Штанга';
  if (/смит/.test(n)) return 'Смит';
  if (/блок|кроссовер|канат/.test(n)) return 'Блок';
  if (/тренаж|бабочк|рычаж|машин/.test(n)) return 'Тренажёр (стек)';
  if (bodyweight || /отжиман|подтяг|брус|планк|без веса/.test(n)) return 'Собственный вес';
  return 'Другое';
}

/** The muscle group of a new exercise: the heading of the notes or a word of the name. */
export function guessGroup(name: string, heading?: string) {
  if (heading && !['Ноги', 'Руки', 'Разминка', 'Кардио'].includes(heading)) return heading;
  const n = normName(name);
  if (/отжиман|груд|бабочк|сведен/.test(n)) return 'Грудь';
  if (/подтяг|тяга|спин/.test(n)) return 'Спина';
  if (/плеч|дельт|махи|отведен/.test(n)) return 'Плечи';
  if (/бицепс|сгибание рук/.test(n)) return 'Бицепс';
  if (/трицепс|разгибание рук/.test(n)) return 'Трицепс';
  if (/присед|выпад|жим ног|ноги/.test(n) || heading === 'Ноги') return 'Квадрицепс / ягодицы';
  if (/пресс|скруч/.test(n)) return 'Пресс';
  return 'Другое';
}
