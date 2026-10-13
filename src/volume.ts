/**
 * Weekly volume: working sets per muscle, Monday to Sunday.
 * Every set of an exercise adds 1 to the muscle parts doing the main work and ½ to the parts that take part.
 * Two-joint and one-joint parts of a muscle are counted apart: they work in different exercises
 * (the long head of the triceps in a pullover but hardly in a bench press, the short head of the biceps femoris
 * in a leg curl but not in a hinge, the rectus femoris in a leg extension but hardly in a squat).
 */
/** Muscle groups: the rows of the weekly volume, the muscles of own exercises. */
export const muscleNames: Record<string, string> = {
  chest: 'Грудь',
  lats: 'Широчайшие',
  upperBack: 'Верх спины',
  delts: 'Дельты',
  biceps: 'Сгибатели локтя',
  triceps: 'Трицепс',
  quads: 'Квадрицепс',
  hamstrings: 'Задняя поверхность бедра',
  glutes: 'Большая ягодичная',
  abductors: 'Отводящие бедра',
  adductors: 'Приводящие бедра',
  calves: 'Икры',
  abs: 'Пресс',
  erectors: 'Разгибатели спины',
};
export interface MusclePart {
  id: string;
  /** Group key of `muscleNames`. */
  group: string;
  name: string;
  /** Name among the other parts of its group (choosing muscles of an own exercise). */
  short?: string;
  /** In the line «один подход считается как…», when the name is long. */
  text?: string;
  /** Crosses two joints or one: shown for groups split this way. */
  joints?: string;
}
export const PARTS: MusclePart[] = [
  { id: 'chest', group: 'chest', name: 'Грудь' },
  { id: 'lats', group: 'lats', name: 'Широчайшие' },
  { id: 'upperBack', group: 'upperBack', name: 'Верх спины' },
  { id: 'deltFront', group: 'delts', name: 'Передняя дельта', short: 'Передняя' },
  { id: 'deltSide', group: 'delts', name: 'Средняя дельта', short: 'Средняя' },
  { id: 'deltRear', group: 'delts', name: 'Задняя дельта', short: 'Задняя' },
  { id: 'bicepsBrachii', group: 'biceps', name: 'Двуглавая (бицепс)', short: 'Бицепс', joints: 'двусуставная' },
  { id: 'brachialis', group: 'biceps', name: 'Плечевая и плечелучевая', short: 'Плечевая', joints: 'односуставные' },
  { id: 'tricepsLong', group: 'triceps', name: 'Длинная головка', short: 'Длинная головка', joints: 'двусуставная' },
  { id: 'tricepsShort', group: 'triceps', name: 'Латеральная и медиальная головки', short: 'Лат. и мед. головки', joints: 'односуставные' },
  { id: 'rectusFemoris', group: 'quads', name: 'Прямая мышца бедра', short: 'Прямая', joints: 'двусуставная' },
  { id: 'vasti', group: 'quads', name: 'Широкие мышцы бедра', short: 'Широкие', joints: 'односуставные' },
  { id: 'hamsLong', group: 'hamstrings', name: 'Полусухожильная, полуперепончатая, длинная головка бицепса бедра', short: 'Двусуставные', text: 'Задняя поверхность бедра без короткой головки', joints: 'двусуставные' },
  { id: 'hamsShort', group: 'hamstrings', name: 'Короткая головка бицепса бедра', short: 'Короткая головка', joints: 'односуставная' },
  { id: 'glutes', group: 'glutes', name: 'Большая ягодичная' },
  { id: 'abductors', group: 'abductors', name: 'Отводящие бедра' },
  { id: 'adductors', group: 'adductors', name: 'Приводящие бедра' },
  { id: 'gastrocnemius', group: 'calves', name: 'Икроножная', short: 'Икроножная', joints: 'двусуставная' },
  { id: 'soleus', group: 'calves', name: 'Камбаловидная', short: 'Камбаловидная', joints: 'односуставная' },
  { id: 'abs', group: 'abs', name: 'Пресс' },
  { id: 'erectors', group: 'erectors', name: 'Разгибатели спины' },
];
const PART = new Map(PARTS.map((p) => [p.id, p]));
export const GROUPS = Object.keys(muscleNames);
export const partsOfGroup = (group: string) => PARTS.filter((p) => p.group === group);
/** Group of a muscle key: a group, a part, or either with «:0.5». */
export const groupOfKey = (key = '') => {
  const id = key.split(':')[0];
  return PART.get(id)?.group || (muscleNames[id] ? id : undefined);
};

/** Sets a muscle part gets from one set of an exercise: 1 — main work, 0.5 — takes part. */
export type Load = Record<string, number>;
const press: Load = { chest: 1, deltFront: 0.5, tricepsShort: 0.5 };
const fly: Load = { chest: 1, deltFront: 0.5 };
const dip: Load = { chest: 1, tricepsShort: 1, tricepsLong: 0.5, deltFront: 0.5 };
const overhead: Load = { deltFront: 1, deltSide: 0.5, tricepsShort: 0.5 };
const raise: Load = { deltSide: 1 };
const rear: Load = { deltRear: 1, upperBack: 0.5 };
const pulldown: Load = { lats: 1, upperBack: 0.5, bicepsBrachii: 0.5, brachialis: 0.5 };
const row: Load = { lats: 1, upperBack: 1, deltRear: 0.5, bicepsBrachii: 0.5, brachialis: 0.5 };
const curl: Load = { bicepsBrachii: 1, brachialis: 1 };
const extension: Load = { tricepsLong: 1, tricepsShort: 1 };
const triPress: Load = { tricepsShort: 1, tricepsLong: 0.5, chest: 0.5 };
const squat: Load = { vasti: 1, glutes: 1, adductors: 0.5 };
const legPress: Load = { vasti: 1, glutes: 0.5, adductors: 0.5 };
const legExt: Load = { vasti: 1, rectusFemoris: 1 };
const legCurl: Load = { hamsLong: 1, hamsShort: 1, gastrocnemius: 0.5 };
const lunge: Load = { glutes: 1, vasti: 1, adductors: 0.5 };
const bridge: Load = { glutes: 1, hamsLong: 0.5 };
const abduction: Load = { abductors: 1, glutes: 0.5 };
const calf: Load = { gastrocnemius: 1, soleus: 1 };
const abs: Load = { abs: 1 };

/** The exercises of the base. Own exercises carry their muscles (see `ownLoad`). */
export const EXERCISE_LOAD: Record<string, Load> = {
  'bench-press': press,
  'incline-dumbbell-press': press,
  'machine-chest-press': press,
  'smith-incline-press': press,
  'stack-chest-press': press,
  'plate-chest-press': press,
  'plate-incline-press': press,
  'cable-fly': fly,
  'pec-deck': fly,
  'stack-pec-fly': fly,
  dips: dip,
  'stack-assisted-dip': dip,
  'pull-up': pulldown,
  'assisted-pull-up': pulldown,
  'lat-pulldown': pulldown,
  'stack-lat-pulldown': pulldown,
  'plate-lat-pulldown': pulldown,
  'seated-row': row,
  'one-arm-row': row,
  'chest-supported-row': row,
  't-bar-row': row,
  'stack-seated-row': row,
  'plate-seated-row': row,
  'plate-low-row': row,
  'plate-dorian-row': row,
  'barbell-row': { ...row, erectors: 0.5 },
  // Shoulder extension with a straight arm: the long head of the triceps extends the shoulder too.
  'cable-pullover': { lats: 1, tricepsLong: 0.5 },
  'side-lying-pullover': { lats: 1, tricepsLong: 0.5 },
  'plate-shrug': { upperBack: 1 },
  'overhead-press': overhead,
  'dumbbell-shoulder-press': overhead,
  'machine-shoulder-press': overhead,
  'stack-shoulder-press': overhead,
  'plate-shoulder-press': overhead,
  'lateral-raise': raise,
  'cable-lateral-raise': raise,
  'machine-lateral-raise': raise,
  'stack-lateral-raise': raise,
  'rear-delt-fly': rear,
  'reverse-pec-deck': rear,
  'stack-rear-delt': rear,
  'cable-rear-delt-fly': rear,
  'face-pull': { deltRear: 1, upperBack: 1 },
  'barbell-curl': curl,
  'dumbbell-curl': curl,
  'cable-curl': curl,
  'stack-biceps-curl': curl,
  'incline-curl': curl,
  'bayesian-curl': curl,
  'preacher-curl': curl,
  // Neutral grip: the brachialis and brachioradialis lead.
  'hammer-curl': { brachialis: 1, bicepsBrachii: 0.5 },
  'triceps-pushdown': extension,
  'overhead-triceps': extension,
  'lying-triceps-extension': extension,
  'stack-triceps-press': triPress,
  'plate-triceps': triPress,
  // Squats and presses hardly grow the rectus femoris: it shortens at the hip while it lengthens at the knee.
  'back-squat': { ...squat, erectors: 0.5 },
  'front-squat': { ...squat, erectors: 0.5 },
  'smith-squat': squat,
  'plate-belt-squat': squat,
  'hack-squat': legPress,
  'pendulum-squat': legPress,
  'leg-press': legPress,
  'stack-leg-press': legPress,
  'plate-leg-press': legPress,
  'leg-extension': legExt,
  'stack-leg-extension': legExt,
  'plate-leg-extension': legExt,
  'bulgarian-split-squat': lunge,
  'reverse-lunge': lunge,
  'plate-lunge': lunge,
  // Knee flexion: all of the hamstrings with the short head, and the gastrocnemius helps.
  'leg-curl': legCurl,
  'seated-leg-curl': legCurl,
  'lying-leg-curl': legCurl,
  'stack-seated-leg-curl': legCurl,
  'stack-lying-leg-curl': legCurl,
  'plate-standing-leg-curl': legCurl,
  // Hip hinges: the two-joint hamstrings only — the short head does not cross the hip.
  rdl: { hamsLong: 1, glutes: 1, adductors: 0.5, erectors: 0.5 },
  deadlift: { glutes: 1, hamsLong: 0.5, vasti: 0.5, adductors: 0.5, erectors: 0.5, upperBack: 0.5 },
  'plate-deadlift': { glutes: 1, hamsLong: 1, vasti: 0.5, erectors: 0.5, upperBack: 0.5 },
  'back-extension': { erectors: 1, glutes: 1, hamsLong: 1 },
  'stack-back-extension': { erectors: 1, glutes: 0.5, hamsLong: 0.5 },
  'hip-thrust': bridge,
  'plate-hip-thrust': bridge,
  'cable-kickback': bridge,
  'hip-abduction': abduction,
  'stack-hip-abduction': abduction,
  'hip-adduction': { adductors: 1 },
  'stack-hip-adduction': { adductors: 1 },
  'calf-raise': calf,
  'standing-calf-raise': calf,
  'leg-press-calf': calf,
  // A bent knee slackens the gastrocnemius: the soleus does the work.
  'seated-calf-raise': { soleus: 1 },
  crunch: abs,
  'reverse-crunch': abs,
  'cable-crunch': abs,
  'hanging-leg-raise': abs,
  'stack-ab-crunch': abs,
  'plate-ab-crunch': abs,
};

/**
 * Muscles of an own exercise as stored: group or part keys, «:0.5» for taking part.
 * A group stands for all of its parts (older records keep groups only).
 */
export function ownLoad(keys: string[] = []): Load {
  const out: Load = {};
  for (const raw of keys) {
    const [key, f] = String(raw).split(':');
    const factor = f === '0.5' ? 0.5 : 1;
    const ids = PART.has(key) ? [key] : partsOfGroup(key).map((p) => p.id);
    for (const id of ids) out[id] = Math.max(out[id] || 0, factor);
  }
  return out;
}
/** The stored form of `ownLoad`: a group when all of its parts are alike, «:0.5» for halves. */
export function loadKeys(load: Load): string[] {
  const out: string[] = [];
  for (const group of GROUPS) {
    const parts = partsOfGroup(group).filter((p) => load[p.id]);
    if (!parts.length) continue;
    const same = parts.length === partsOfGroup(group).length && parts.every((p) => load[p.id] === load[parts[0].id]);
    const items = same ? [[group, load[parts[0].id]] as const] : parts.map((p) => [p.id, load[p.id]] as const);
    for (const [key, f] of items) out.push(f === 1 ? key : key + ':0.5');
  }
  return out;
}
/** Muscle keys as the server keeps them: known groups or parts, «:0.5» for halves. */
export const cleanMuscles = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.map(String).filter((k) => groupOfKey(k) && /^[A-Za-z]+(:0\.5)?$/.test(k)))].slice(0, PARTS.length) : [];
export const exerciseLoad = (exerciseId: string, own?: string[]): Load => EXERCISE_LOAD[exerciseId] || ownLoad(own);

export interface Tally {
  parts: Record<string, number>;
  groups: Record<string, number>;
}
const emptyTally = (): Tally => ({ parts: {}, groups: {} });
/** Adds `sets` sets: each part by its share; a group by its most worked part (one set is one set of the group). */
function add(t: Tally, load: Load, sets: number) {
  if (!sets) return;
  const groups: Record<string, number> = {};
  for (const [id, f] of Object.entries(load)) {
    const part = PART.get(id);
    if (!part) continue;
    t.parts[id] = (t.parts[id] || 0) + f * sets;
    groups[part.group] = Math.max(groups[part.group] || 0, f);
  }
  for (const [g, f] of Object.entries(groups)) t.groups[g] = (t.groups[g] || 0) + f * sets;
}

type Resolve = (exerciseId: string, own?: string[]) => string[] | undefined;
interface ExerciseLike {
  exerciseId: string;
  muscles?: string[];
}
/** Planned sets of a list of program exercises (each once). */
export function planTally(exercises: Array<ExerciseLike & { sets: number }>, resolve?: Resolve): Tally {
  const t = emptyTally();
  for (const e of exercises) add(t, exerciseLoad(e.exerciseId, resolve ? resolve(e.exerciseId, e.muscles) : e.muscles), e.sets);
  return t;
}
/** Sets done in workouts. */
export function doneTally(
  sessions: Array<{ exercises: Array<ExerciseLike & { sets: Array<{ reps: number }> }> }>,
  resolve?: Resolve,
): Tally {
  const t = emptyTally();
  for (const s of sessions)
    for (const e of s.exercises)
      add(t, exerciseLoad(e.exerciseId, resolve ? resolve(e.exerciseId, e.muscles) : e.muscles), e.sets.filter((x) => x.reps > 0).length);
  return t;
}

/** Monday 00:00 (local time) of the week of `ms`, `offset` weeks away. */
export function weekStart(ms: number, offset = 0) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7);
  return d;
}
export function inWeek<T extends { completedAt: string }>(sessions: T[], start: Date) {
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return sessions.filter((s) => {
    const t = new Date(s.completedAt).getTime();
    return t >= start.getTime() && t < end.getTime();
  });
}

/** Workouts a week of a program: as set by the trainer, otherwise each workout once (up to 7). */
export const perWeekOf = (p: { perWeek?: number; days: unknown[] }) => p.perWeek || Math.min(p.days.length, 7);
/** Program exercises with their sets for an average week: a 6-workout program done 3 times a week gives half. */
export const weekPlan = <E extends { sets: number }>(programs: Array<{ perWeek?: number; days: Array<{ exercises: E[] }> }>) =>
  programs.flatMap((p) => {
    const k = p.days.length ? perWeekOf(p) / p.days.length : 0;
    return p.days.flatMap((d) => d.exercises.map((e) => ({ ...e, sets: e.sets * k })));
  });

export interface VolumeRow {
  id: string;
  name: string;
  done: number;
  plan: number;
  /** The trainer's weekly target (a muscle that is not split into parts). */
  target?: number;
  parts: Array<{ id: string; name: string; joints?: string; done: number; plan: number; target?: number }>;
}
/** Rows of the weekly table: groups worked, planned or with a target, their parts when a group is split. */
export function volumeRows(done: Tally, plan: Tally, targets: Record<string, number> = {}): VolumeRow[] {
  return GROUPS.filter((g) => done.groups[g] || plan.groups[g] || partsOfGroup(g).some((p) => targets[p.id])).map((g) => {
    const parts = partsOfGroup(g);
    return {
      id: g,
      name: muscleNames[g],
      done: done.groups[g] || 0,
      plan: plan.groups[g] || 0,
      ...(parts.length === 1 && targets[g] ? { target: targets[g] } : {}),
      parts:
        parts.length > 1
          ? parts.map((p) => ({
              id: p.id,
              name: p.name,
              joints: p.joints,
              done: done.parts[p.id] || 0,
              plan: plan.parts[p.id] || 0,
              ...(targets[p.id] ? { target: targets[p.id] } : {}),
            }))
          : [],
    };
  });
}

/**
 * Muscles a program can specialise on («акценты»), as a trainer names them. Up to 3: they get more volume and come first
 * in every workout they are in; the rest are kept at maintenance.
 */
export const ACCENTS: Array<{ id: string; label: string; parts: string[] }> = [
  { id: 'chest', label: 'Грудь', parts: ['chest'] },
  { id: 'back', label: 'Спина', parts: ['lats', 'upperBack'] },
  { id: 'delts', label: 'Дельты', parts: ['deltFront', 'deltSide', 'deltRear'] },
  { id: 'biceps', label: 'Бицепс', parts: ['bicepsBrachii', 'brachialis'] },
  { id: 'triceps', label: 'Трицепс', parts: ['tricepsLong', 'tricepsShort'] },
  { id: 'quads', label: 'Квадрицепс', parts: ['rectusFemoris', 'vasti'] },
  { id: 'hamstrings', label: 'Задняя поверхность бедра', parts: ['hamsLong', 'hamsShort'] },
  { id: 'glutes', label: 'Ягодицы', parts: ['glutes', 'abductors'] },
  { id: 'calves', label: 'Икры', parts: ['gastrocnemius', 'soleus'] },
  { id: 'abs', label: 'Пресс', parts: ['abs'] },
];
export const MAX_ACCENTS = 3;
export type Level = 'novice' | 'middle' | 'advanced';
export const LEVELS: Array<{ id: Level; label: string }> = [
  { id: 'novice', label: 'Новичок' },
  { id: 'middle', label: 'Средний' },
  { id: 'advanced', label: 'Продвинутый' },
];
/** How the targets of a program were set: the client's experience and the accents in their order (first — first). */
export interface Focus {
  level: Level;
  accents: string[];
}
export function cleanFocus(v: unknown): Focus | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const f = v as { level?: unknown; accents?: unknown };
  if (!LEVELS.some((l) => l.id === f.level)) return undefined;
  const accents = Array.isArray(f.accents) ? [...new Set(f.accents.map(String))].filter((a) => ACCENTS.some((x) => x.id === a)).slice(0, MAX_ACCENTS) : [];
  return { level: f.level as Level, accents };
}
/** Parts of the accents, with the place of their accent (0 — the first one). */
export function accentParts(accents: string[] = []) {
  const out = new Map<string, number>();
  accents.forEach((a, i) => {
    for (const p of ACCENTS.find((x) => x.id === a)?.parts || []) if (!out.has(p)) out.set(p, i);
  });
  return out;
}

/** Weekly targets as stored with a program: known parts, whole sets 1–40. */
export function cleanTargets(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!v || typeof v !== 'object') return out;
  for (const p of PARTS) {
    const n = Math.round(Number((v as Record<string, unknown>)[p.id]));
    if (Number.isFinite(n) && n >= 1) out[p.id] = Math.min(n, 40);
  }
  return out;
}
/** Targets of several programs together. */
export function sumTargets(list: Array<Record<string, number> | undefined>) {
  const out: Record<string, number> = {};
  for (const t of list) for (const [p, n] of Object.entries(t || {})) out[p] = (out[p] || 0) + n;
  return out;
}

/** What one set of an exercise counts for: «Грудь 1 · Передняя дельта ½ · Трицепс: латеральная и медиальная головки ½». */
export function loadText(load: Load) {
  const items: Array<[string, number, number]> = [];
  for (const group of GROUPS) {
    const parts = partsOfGroup(group).filter((p) => load[p.id]);
    if (!parts.length) continue;
    const whole = parts.length === partsOfGroup(group).length && parts.every((p) => load[p.id] === load[parts[0].id]);
    if (whole && (parts.length > 1 || parts[0].id === group)) items.push([muscleNames[group], load[parts[0].id], PARTS.indexOf(parts[0])]);
    else
      for (const p of parts)
        items.push([p.text || (group === 'delts' ? p.name : muscleNames[group] + ': ' + p.name.toLowerCase()), load[p.id], PARTS.indexOf(p)]);
  }
  return items
    .sort((a, b) => b[1] - a[1] || a[2] - b[2])
    .map(([name, f]) => name + ' ' + (f === 1 ? '1' : '½'))
    .join(' · ');
}
