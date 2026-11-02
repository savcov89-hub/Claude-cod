// A workout written or spoken as plain text → exercises with their sets.
//   «Жим ногами 45 3х15»            — 45 кг, 3 подхода по 15
//   «Румынская тяга 20 3х12,10,8»   — 20 кг, подходы 12, 10, 8
//   «Отжимания от пола 30,27,16»    — свой вес, подходы 30, 27, 16
//   notes from the phone: «24 августа 44,6;», «Спина», «Жим в тренажёре 25x15; 32x13,12,10;» — date, body weight,
//   muscle-group headings, «вес×повторы», sets separated by «;» (in notes «5x15» is 5 кг × 15).
// Pure functions: the screen (src/ui/TextWorkout.tsx) and scripts/check-text-workout.ts use them.

export interface ParsedSet {
  weight: number;
  reps: number;
}
export interface ParsedExercise {
  /** As written: «Жим в тренажёре красный». */
  name: string;
  sets: ParsedSet[];
  /** «(не глубоко)», «легко». */
  note?: string;
  /** The heading it was under: «Спина». */
  group?: string;
  /** «3х15» without a weight: read as 3 sets × 15; may be 3 кг × 15 (the screen lets flip it). */
  ambiguous?: { a: number; reps: number };
  /** The line it came from. */
  line: string;
}
export interface ParsedWorkout {
  /** yyyy-mm-dd when the text has a date line. */
  date?: string;
  bodyWeight?: number;
  exercises: ParsedExercise[];
}
export interface ParsedText {
  /** The first line when it is a name, not an exercise: «Денис Вагнер», «Тренировка ноги:». */
  title?: string;
  /** Notes mode: «5x15» is weight × reps (the text has «;» or dates). */
  notes: boolean;
  workouts: ParsedWorkout[];
}

const MONTHS: Array<[RegExp, number]> = [
  [/^янв/, 1],
  [/^фев/, 2],
  [/^мар/, 3],
  [/^апр/, 4],
  [/^ма[йя]/, 5],
  [/^июн/, 6],
  [/^июл/, 7],
  [/^авг/, 8],
  [/^сен/, 9],
  [/^окт/, 10],
  [/^ноя/, 11],
  [/^дек/, 12],
];
const WEEKDAYS = /^(понедельник|вторник|среда|среду|четверг|пятница|пятницу|суббота|субботу|воскресенье|пн|вт|ср|чт|пт|сб|вс)[,.]?\s+/i;

/** Muscle-group headings of notes → the group a new exercise gets (and a hint for matching names). */
export const HEADINGS: Record<string, string> = {
  спина: 'Спина',
  грудь: 'Грудь',
  плечи: 'Плечи',
  дельты: 'Плечи',
  ноги: 'Ноги',
  руки: 'Руки',
  бицепс: 'Бицепс',
  трицепс: 'Трицепс',
  пресс: 'Пресс',
  ягодицы: 'Ягодицы',
  икры: 'Икры',
  квадрицепс: 'Квадрицепс',
  'бицепс бедра': 'Бицепс бедра',
  'задняя поверхность бедра': 'Бицепс бедра',
  разминка: 'Разминка',
  кардио: 'Кардио',
};

const NUMBER_WORDS: Record<string, number> = {
  один: 1, одна: 1, одно: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9,
  десять: 10, одиннадцать: 11, двенадцать: 12, тринадцать: 13, четырнадцать: 14, пятнадцать: 15, шестнадцать: 16,
  семнадцать: 17, восемнадцать: 18, девятнадцать: 19, двадцать: 20, тридцать: 30, сорок: 40, пятьдесят: 50,
  шестьдесят: 60, семьдесят: 70, восемьдесят: 80, девяносто: 90, сто: 100,
};

/** Spoken numbers to digits: «три на пятнадцать» → «3 на 15», «двадцать пять» → «25». */
function wordsToDigits(s: string): string {
  return s.replace(/[а-яё]+(?:\s+[а-яё]+)?/gi, (m: string, at: number, all: string) => {
    const parts = m.toLowerCase().split(/\s+/);
    const a = NUMBER_WORDS[parts[0]];
    if (a === undefined) {
      if (parts.length === 2 && NUMBER_WORDS[parts[1]] !== undefined) return parts[0] + ' ' + wordsToDigits(m.split(/\s+/)[1]);
      return m;
    }
    if (parts.length === 2) {
      const b = NUMBER_WORDS[parts[1]];
      // «двадцать три на двенадцать»: 20 кг, 3 подхода по 12 — not 23.
      const setsNext = b !== undefined && b <= 6 && /^\s*(на|по|[xх×*])(\s|\d)/i.test(all.slice(at + m.length));
      if (b !== undefined && a >= 20 && a % 10 === 0 && b < 10 && !setsNext) return String(a + b);
      if (b !== undefined) return a + ' ' + b;
      return a + ' ' + m.split(/\s+/)[1];
    }
    return String(a);
  });
}

/** «24 августа», «24.08», «24.08.2026», «пн 24 августа» at the start of a line → yyyy-mm-dd and the rest. */
function dateLine(line: string, today: Date): { date: string; rest: string } | null {
  const s = line.replace(WEEKDAYS, '').trim();
  let day: number, month: number, year: number | undefined, rest: string;
  let m = s.match(/^(\d{1,2})\s+([а-яё]+)\.?(?:\s+(\d{4})(?:\s*г\.?)?)?(.*)$/i);
  if (m) {
    const mon = MONTHS.find(([re]) => re.test(m![2].toLowerCase()));
    if (!mon) return null;
    day = +m[1];
    month = mon[1];
    year = m[3] ? +m[3] : undefined;
    rest = m[4];
  } else {
    m = s.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{2}|\d{4}))?(?![\d,]|\s*[xх×*])(.*)$/i);
    if (!m) return null;
    day = +m[1];
    month = +m[2];
    year = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : undefined;
    rest = m[4];
  }
  if (!(day >= 1 && day <= 31 && month >= 1 && month <= 12)) return null;
  if (year === undefined) {
    // No year: this year, or the last one when the date is ahead of today (notes from December read in January).
    year = today.getFullYear();
    const ahead = new Date(year, month - 1, day).getTime() - today.getTime() > 2 * 86400000;
    if (ahead) year--;
  }
  const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { date, rest: rest.trim() };
}

const hasDigit = (s: string) => /\d/.test(s);
const clean = (s: string) => s.replace(/[\s;,.:—–-]+$/g, '').replace(/^[\s;,.:•*—–-]+/g, '').trim();
const headingOf = (line: string) => HEADINGS[clean(line).toLowerCase().replace(/ё/g, 'е')];

// Words that sit among the numbers and are not the start of the next exercise.
const UNIT = /^(кг|килограмм\S*|кило|раз|раза|разов|повтор\S*|подход\S*|сет\S*|по|на|х|x|и|вес|с|рабочих|рабочий|рабочие|reps?|sets?|kg)$/i;
// A part without numbers that continues the exercise before it as a comment.
const NOTE_START = /^(не|без|легко|тяжело|тяжеловато|отказ|медленно|с паузой|техника|под|плохо|хорошо|норм|болит|больно)(?![а-яё])/i;

/**
 * One line may hold several exercises (spoken in one go): «Жим ногами 45 3 на 15 румынская тяга 20 3 на 12 10 8».
 * Cut at a word that follows numbers.
 */
function splitExercises(line: string): string[] {
  const words = line.split(/\s+/).filter(Boolean);
  const parts: string[][] = [];
  let cur: string[] = [];
  let seenNumber = false;
  let paren = 0;
  for (const w of words) {
    const opens = (w.match(/\(/g) || []).length;
    const closes = (w.match(/\)/g) || []).length;
    const word = w.replace(/[(),;.:]/g, '');
    const isWord = /[a-zа-яё]/i.test(word) && !hasDigit(word) && !UNIT.test(word);
    if (paren === 0 && opens === 0 && seenNumber && isWord) {
      parts.push(cur);
      cur = [];
      seenNumber = false;
    }
    cur.push(w);
    paren += opens - closes;
    if (hasDigit(w)) seenNumber = true;
  }
  if (cur.length) parts.push(cur);
  return parts.map((p) => p.join(' '));
}

type Tok =
  | { k: 'n'; v: number }
  | { k: 'w'; v: number }
  | { k: 'r'; v: number }
  | { k: 'x'; parts: number[]; reps: number[] }
  | { k: 'l'; reps: number[] };

const num = (s: string) => Number(s.replace(',', '.'));

function tokens(group: string): Tok[] {
  let s = ' ' + group.toLowerCase() + ' ';
  // Decimal weights: «12,5x10», «12,5 3х10», «12,5 кг». Elsewhere a comma divides reps: «10,7», «32x13,12,10».
  s = s.replace(/(\d+),(5|25|75)(?=\s*(?:кг\s*)?[xх×*])/g, '$1.$2');
  s = s.replace(/(\d+),(\d{1,2})(?=\s*(?:кг|килограмм)\S*)/g, '$1.$2');
  s = s.replace(/(\d+),(5|25|75)(?=\s+\d+\s*[xх×*]\s*\d)/g, '$1.$2');
  // Units mark what a number is.
  s = s.replace(/(\d+(?:\.\d+)?)\s*(?:кг|килограмм\S*|кило|kg)(?![а-яёa-z])/g, ' w$1 ');
  s = s.replace(/(\d+)\s*(?:подход\S*|сет\S*|sets?)\s*(?:по\s*)?(?=\d)/g, '$1x');
  s = s.replace(/(\d+)\s*(?:раз|раза|разов|повтор\S*|reps?)(?![а-яё])/g, ' r$1 ');
  // «3 на 15», «3 по 15», «3х15», «3 x 15», «3*15».
  s = s.replace(/(\d)\s*(?:[xх×*]|на|по)\s*(?=\d)/g, '$1x');
  s = s.replace(/(\d)\s*,\s*(?=\d)/g, '$1,');
  const out: Tok[] = [];
  for (const raw of s.split(/\s+/)) {
    const t = raw.replace(/^[^\dwr]+|[^\d]+$/g, '');
    if (!t) continue;
    let m: RegExpMatchArray | null;
    if ((m = t.match(/^w(\d+(?:\.\d+)?)$/))) out.push({ k: 'w', v: num(m[1]) });
    else if ((m = t.match(/^r(\d+)$/))) out.push({ k: 'r', v: +m[1] });
    else if (/^\d+(?:\.\d+)?(?:x\d+(?:\.\d+)?)+(?:,\d+)*$/.test(t)) {
      const [head, ...tail] = t.split(',');
      const nums = head.split('x').map(num);
      out.push({ k: 'x', parts: nums.slice(0, -1), reps: [nums[nums.length - 1], ...tail.map(num)] });
    } else if (/^\d+(?:,\d+)+$/.test(t)) out.push({ k: 'l', reps: t.split(',').map(num) });
    else if (/^\d+(?:\.\d+)?$/.test(t)) out.push({ k: 'n', v: num(t) });
  }
  return out;
}

const okReps = (r: number) => Number.isInteger(r) && r >= 0 && r <= 1000;
const okWeight = (w: number) => Number.isFinite(w) && w >= 0 && w <= 1500;

/** The numbers of one exercise → its sets. */
export function parseSets(data: string, notes: boolean): { sets: ParsedSet[]; ambiguous?: { a: number; reps: number } } {
  const sets: ParsedSet[] = [];
  let ambiguous: { a: number; reps: number } | undefined;
  // «3х12 10 8» spoken: the sets after «3х12» take the next bare numbers as their reps.
  let fill: { from: number; filled: number; count: number } | null = null;
  for (const group of data.split(';')) {
    const toks = tokens(group);
    let weight: number | null = null;
    fill = null;
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      const next = toks[i + 1];
      if (t.k === 'w') {
        weight = t.v;
        continue;
      }
      if (t.k === 'r') {
        sets.push({ weight: weight ?? 0, reps: t.v });
        continue;
      }
      if (t.k === 'n') {
        if (next && (next.k === 'x' || next.k === 'l' || next.k === 'r') && weight === null) {
          weight = t.v;
          continue;
        }
        if (fill && fill.filled < fill.count) {
          sets[fill.from + fill.filled].reps = t.v;
          fill.filled++;
          continue;
        }
        // Bare numbers: reps of sets (a weight given before applies to them).
        sets.push({ weight: weight ?? 0, reps: t.v });
        continue;
      }
      if (t.k === 'l') {
        for (const r of t.reps) sets.push({ weight: weight ?? 0, reps: r });
        weight = null;
        continue;
      }
      // x-form
      let w: number;
      let count: number;
      if (t.parts.length >= 2) {
        w = t.parts[0];
        count = t.parts[1];
      } else if (weight !== null) {
        w = weight;
        count = t.parts[0];
      } else if (t.reps.length > 1 || notes || t.parts[0] > 6 || !Number.isInteger(t.parts[0])) {
        // «32x13,12,10», notes «5x15», «50х10»: weight × reps.
        w = t.parts[0];
        count = 1;
      } else {
        // «3х15» typed without a weight: sets × reps.
        w = 0;
        count = t.parts[0];
        ambiguous = { a: t.parts[0], reps: t.reps[0] };
      }
      weight = null;
      if (t.reps.length > 1) {
        for (const r of t.reps) sets.push({ weight: w, reps: r });
        fill = null;
      } else {
        const n = Math.max(1, Math.min(10, Math.round(count)));
        const from = sets.length;
        for (let k = 0; k < n; k++) sets.push({ weight: w, reps: t.reps[0] });
        fill = n > 1 ? { from: from + 1, filled: 0, count: n - 1 } : null;
      }
    }
    // A weight with no reps after it («Жим 45»): one set with the reps left to fill.
    if (weight !== null && !toks.some((x) => x.k !== 'w')) sets.push({ weight, reps: 0 });
  }
  return { sets: sets.filter((s) => okReps(s.reps) && okWeight(s.weight)).slice(0, 10), ambiguous };
}

/** One exercise from its part of a line: name, sets, comment. */
function parseExercise(part: string, notes: boolean, group?: string): ParsedExercise | null {
  const notesIn: string[] = [];
  let s = part.replace(/\(([^)]*)\)?/g, (_, n: string) => {
    if (n.trim()) notesIn.push(n.trim());
    return ' ';
  });
  s = s.replace(/\s+/g, ' ').trim();
  const at = s.search(/\d/);
  let name = clean(at < 0 ? s : s.slice(0, at));
  let data = at < 0 ? '' : s.slice(at);
  // «вес», «кг» before the numbers belong to the numbers.
  name = clean(name.replace(/\s+(вес|с весом|по|на)$/i, ''));
  // Words after the numbers that are not units: a comment («Пендулум 70x20 не глубоко»).
  const tail = data.match(/([a-zа-яё][a-zа-яё\s]*)$/i);
  if (tail && !UNIT.test(tail[1].trim().split(/\s+/)[0])) {
    notesIn.push(tail[1].trim());
    data = data.slice(0, tail.index);
  }
  if (!name) return null;
  const { sets, ambiguous } = parseSets(data, notes);
  return {
    name: name[0].toUpperCase() + name.slice(1),
    sets,
    ...(notesIn.length ? { note: notesIn.join('; ') } : {}),
    ...(group ? { group } : {}),
    ...(ambiguous ? { ambiguous } : {}),
    line: part.trim(),
  };
}

/** The whole text → workouts (one per date; without dates — one). */
export function parseWorkoutText(input: string, today: Date = new Date()): ParsedText {
  const lines = wordsToDigits(input)
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim());
  const notes = /;/.test(input) || lines.some((l) => !!dateLine(l, today));
  const workouts: ParsedWorkout[] = [];
  let cur: ParsedWorkout = { exercises: [] };
  let group: string | undefined;
  let title: string | undefined;
  const push = () => {
    if (cur.exercises.length || cur.date) workouts.push(cur);
  };
  lines.forEach((line, idx) => {
    if (!line) return;
    const d = dateLine(line, today);
    if (d) {
      push();
      cur = { date: d.date, exercises: [] };
      group = undefined;
      const m = d.rest.replace(/^(вес|масса)\s*/i, '').match(/^(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:кг)?\s*[;,.]?\s*$/i);
      if (m && num(m[1]) >= 20 && num(m[1]) <= 400) cur.bodyWeight = num(m[1]);
      return;
    }
    const bw = line.match(/^(?:вес тела|вес|масса тела|масса)\s*[:=-]?\s*(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:кг)?\s*[;,.]?$/i);
    if (bw && num(bw[1]) >= 20 && num(bw[1]) <= 400) {
      cur.bodyWeight = num(bw[1]);
      return;
    }
    const h = headingOf(line);
    if (h) {
      group = h;
      return;
    }
    // Only numbers: the sets of the exercise above, carried to the next line («32x13,12,10;»).
    const onlyNumbers = line.split(' ').every((w) => hasDigit(w) || UNIT.test(w.replace(/[(),;.:]/g, '')) || !/[a-zа-яё]/i.test(w));
    if (onlyNumbers && hasDigit(line)) {
      const last = cur.exercises[cur.exercises.length - 1];
      if (last) {
        const more = parseSets(line, notes);
        last.sets = [...last.sets, ...more.sets].slice(0, 10);
        last.line += ' ' + line;
        return;
      }
    }
    // The first line without numbers is a title when a date or heading follows, or it ends with «:».
    const first = !workouts.length && !cur.exercises.length && !cur.date && !title;
    if (first && !hasDigit(line)) {
      const nextLine = lines.slice(idx + 1).find(Boolean) || '';
      if (/:$/.test(line) || /^(тренировка|день)(?![а-яё])/i.test(line) || dateLine(nextLine, today) || headingOf(nextLine)) {
        title = clean(line);
        return;
      }
    }
    for (const part of splitExercises(line)) {
      const last = cur.exercises[cur.exercises.length - 1];
      // «не глубоко» spoken after the numbers: a comment on the exercise before.
      if (last && !hasDigit(part) && NOTE_START.test(part)) {
        last.note = [last.note, clean(part)].filter(Boolean).join('; ');
        continue;
      }
      const e = parseExercise(part, notes, group);
      if (e) cur.exercises.push(e);
    }
  });
  push();
  return { ...(title ? { title } : {}), notes, workouts };
}

/** Plan of a program exercise from what was done: sets, rep range. «3х15» → 3 × 12–15; «12,10,8» → 3 × 8–12. */
export function planOf(sets: ParsedSet[]): { sets: number; repMin: number; repMax: number; targetRir: number } {
  const reps = sets.map((s) => s.reps).filter((r) => r > 0);
  const count = Math.max(1, Math.min(10, sets.length || 3));
  if (!reps.length) return { sets: sets.length ? count : 3, repMin: 8, repMax: 12, targetRir: 2 };
  let lo = Math.min(...reps);
  const hi = Math.min(100, Math.max(...reps));
  // One number: a range up to it, as in the templates (15 → 12–15, 10 → 8–10).
  if (lo === hi) lo = Math.max(1, hi - Math.max(1, Math.round(hi * 0.2)));
  return { sets: count, repMin: Math.max(1, Math.min(lo, hi)), repMax: hi, targetRir: 2 };
}
