// A workout told in free words or a photo of notes → days of exercises, by a language model (OpenRouter).
// The key lives only on the server (Supabase secret OPENROUTER_API_KEY); the browser sends the text or the picture to
// POST /api/ai/workout. Here: the request to the model and the check of its answer, kept apart from the routes so
// scripts/check-text-workout.ts can test them without the network.

/** The model; the Supabase secret OPENROUTER_MODEL (any OpenRouter id) takes its place without a deploy. */
export const AI_MODEL = 'google/gemini-2.5-flash-lite';
/** Requests a trainer may make a day (a guard against a runaway bill). */
export const AI_DAILY_LIMIT = 150;

export interface AiSet {
  weight: number;
  reps: number;
}
export interface AiExercise {
  /** As told: «жим гантелей на наклонной». */
  written: string;
  /** The exercise of the base it is, or null when there is none like it. */
  exerciseId: string | null;
  /** Sets done (from notes or «сделал 45 на 15»). */
  done: AiSet[];
  /** Sets and reps meant for the program («3 по 10–12», «по одному подходу»), when told; reps 0 — not told. */
  plan: { sets: number; repMin: number; repMax: number } | null;
  note: string | null;
}
export interface AiDay {
  /** «Грудь и спина», «День 1». */
  name: string;
  /** yyyy-mm-dd when the text gives the date of a done workout. */
  date: string | null;
  bodyWeight: number | null;
  exercises: AiExercise[];
}
export interface AiWorkout {
  title: string | null;
  /** «Три раза в неделю» of one workout: workouts a week (null — not told). */
  perWeek: number | null;
  days: AiDay[];
}

/** Exercises the model chooses from, closest first: the client's programs, the trainer's own, the common base. */
export interface AiBase {
  client: Array<{ id: string; name: string; muscleGroup: string }>;
  own: Array<{ id: string; name: string; muscleGroup: string }>;
  common: Array<{ id: string; name: string; muscleGroup: string }>;
}
const baseLines = (b: AiBase) => {
  const seen = new Set<string>();
  const part = (title: string, list: AiBase['client']) => {
    const rows = list.filter((e) => !seen.has(e.id) && !!seen.add(e.id)).map((e) => `${e.id} | ${e.name} | ${e.muscleGroup}`);
    return rows.length ? ['', title, ...rows] : [];
  };
  return [
    ...part('Упражнения из программ этого клиента — выбирай их в первую очередь (id | название | группа):', b.client),
    ...part('Свои упражнения тренера — затем их (id | название | группа):', b.own),
    ...part('Общая база (id | название | группа):', b.common),
  ];
};
const SETS_RULES = [
  '- Подходы и повторы, сказанные словами, — это план: «по одному подходу», «все по 3 подхода», «первые четыре по 3',
  '  подхода, остальные по 1», «3 по 10–12», «по 15 повторений». Общее указание относится ко всем упражнениям, о которых',
  '  сказано; «первые четыре», «последние два», «остальные» считай по порядку упражнений в тренировке. Повторы не',
  '  сказаны — repMin и repMax 0 (приложение подставит само). Не придумывай подходы, если тренер их не называл.',
];

export type AiContent = Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
export type AiCall = (req: { system: string; content: AiContent; schema: Record<string, unknown> }) => Promise<string>;

// Plain types only (no null, no anyOf): every model behind OpenRouter takes them. «Nothing» is "" or 0, read as null below.
const nullable = <T,>(schema: T) => schema;

export const AI_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'perWeek', 'days'],
  properties: {
    title: nullable({ type: 'string' }),
    perWeek: { type: 'integer' },
    days: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'date', 'bodyWeight', 'exercises'],
        properties: {
          name: { type: 'string' },
          date: nullable({ type: 'string' }),
          bodyWeight: nullable({ type: 'number' }),
          exercises: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['written', 'exerciseId', 'done', 'plan', 'note'],
              properties: {
                written: { type: 'string' },
                exerciseId: nullable({ type: 'string' }),
                done: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['weight', 'reps'],
                    properties: { weight: { type: 'number' }, reps: { type: 'integer' } },
                  },
                },
                plan: nullable({
                  type: 'object',
                  additionalProperties: false,
                  required: ['sets', 'repMin', 'repMax'],
                  properties: { sets: { type: 'integer' }, repMin: { type: 'integer' }, repMax: { type: 'integer' } },
                }),
                note: nullable({ type: 'string' }),
              },
            },
          },
        },
      },
    },
  },
} as const;

/** What the model is told: the task, the format of notes, and the exercises of the base to choose from. */
export function aiSystem(base: AiBase | Array<{ id: string; name: string; muscleGroup: string }>, today: string) {
  const b: AiBase = Array.isArray(base) ? { client: [], own: [], common: base } : base;
  return [
    'Ты помощник фитнес-тренера. Тренер надиктовал, написал или сфотографировал тренировку или программу из нескольких',
    'тренировок. Разложи её по дням и упражнениям и ответь строго JSON по схеме.',
    '',
    'Правила (если чего-то нет — пустая строка "", для чисел 0, для plan — нули):',
    '- Несколько элементов days — только когда тренер описывает РАЗНЫЕ тренировки: «первый день — грудь и спина, второй —',
    '  ноги», «тренировка А…, тренировка Б…». Один список упражнений, который делают несколько раз («три раза в неделю»,',
    '  «три тренировки в неделю», «три дня по одной и той же») — это ОДНА тренировка (один элемент days), а сколько раз',
    '  в неделю — в perWeek (иначе perWeek 0). name — короткое название по смыслу («Грудь и спина», «Ноги», «Всё тело»);',
    '  если смысла нет — «Тренировка A», «Тренировка B».',
    '- Слова-паразиты и пояснения («значит смотри», «потом», «у нас будет», «просто короче») — не упражнения, выбрось их.',
    '- Упражнение, сказанное «в каждой тренировке» или «в конце каждой», добавь в каждый день.',
    '- written — название упражнения так, как сказал тренер, без цифр и мусора.',
    '- exerciseId — id из списков ниже, если это то же упражнение (синонимы зала: пендулум — маятниковый присед,',
    '  брусья — отжимания на брусьях, бабочка — сведение в тренажёре, гакк — гакк-присед).',
    '  Если в базе такого нет — "". Не выдумывай id.',
    '- done — сделанные подходы: вес в кг (свой вес — 0) и повторы. В заметках «32x13,12,10» — 32 кг на 13, 12 и 10',
    '  повторов (три подхода); «10; 10,7» без веса — подходы по 10, 10 и 7; «5x15» в заметках — 5 кг на 15.',
    '  «Жим ногами 45 3х15» — сделано 45 кг, три подхода по 15: done = три раза {weight: 45, reps: 15}.',
    '  Любые цифры веса и повторов — это сделанные подходы, всегда заполняй done. Если цифр нет — пустой массив.',
    ...SETS_RULES,
    '  Если плана нет — sets, repMin, repMax равны 0.',
    '- date — дата сделанной тренировки в формате ГГГГ-ММ-ДД, если она есть в тексте, иначе "" (сегодня ' + today + ';',
    '  без года — ближайшая прошедшая такая дата). bodyWeight — вес тела клиента, если указан после даты («24 августа 44,6»), иначе 0.',
    '- title — имя клиента или название программы, если оно есть в начале, иначе "".',
    '- note — короткий комментарий тренера к упражнению («не глубоко»), иначе "".',
    ...baseLines(b),
  ].join('\n');
}

const num = (v: unknown, min: number, max: number) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** The model's answer, checked: known ids only, numbers in range, at most 14 days of 30 exercises. */
export function cleanAiWorkout(raw: string, known: Set<string>): AiWorkout | null {
  let data: any;
  try {
    data = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```\s*$/g, ''));
  } catch {
    return null;
  }
  if (!data || !Array.isArray(data.days)) return null;
  const days: AiDay[] = [];
  for (const d of data.days.slice(0, 14)) {
    const exercises: AiExercise[] = [];
    for (const e of Array.isArray(d?.exercises) ? d.exercises.slice(0, 30) : []) {
      const written = str(e?.written, 100);
      if (!written) continue;
      const id = typeof e?.exerciseId === 'string' && known.has(e.exerciseId) ? e.exerciseId : null;
      const done: AiSet[] = [];
      for (const s of Array.isArray(e?.done) ? e.done.slice(0, 10) : []) {
        const reps = num(s?.reps, 0, 1000);
        const weight = num(s?.weight ?? 0, 0, 1500);
        if (reps !== null && weight !== null) done.push({ weight: Math.round(weight * 100) / 100, reps: Math.round(reps) });
      }
      const sets = num(e?.plan?.sets, 1, 10);
      const repMin = num(e?.plan?.repMin, 1, 100);
      const repMax = num(e?.plan?.repMax, 1, 100);
      // Sets told without reps («по одному подходу»): reps 0, the app fills them in.
      const reps = repMin !== null && repMax !== null ? [Math.round(Math.min(repMin, repMax)), Math.round(Math.max(repMin, repMax))] : [0, 0];
      const plan = sets !== null ? { sets: Math.round(sets), repMin: reps[0], repMax: reps[1] } : null;
      const note = str(e?.note, 200);
      exercises.push({ written, exerciseId: id, done, plan, note: note || null });
    }
    if (!exercises.length) continue;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(d?.date)) ? String(d.date) : null;
    days.push({
      name: str(d?.name, 80) || 'День ' + (days.length + 1),
      date,
      bodyWeight: date ? num(d?.bodyWeight, 20, 400) : null,
      exercises,
    });
  }
  if (!days.length) return null;
  const perWeek = num(data.perWeek, 1, 7);
  return { title: str(data.title, 100) || null, perWeek: perWeek === null ? null : Math.round(perWeek), days };
}

// ——— A program changed by words: «первые 4 упражнения по 3 подхода, остальные по 1» ———

export interface AiProgramExercise {
  exerciseId: string;
  exerciseName: string;
  sets: number;
  repMin: number;
  repMax: number;
  targetRir: number;
}
export interface AiProgramDay {
  id: string;
  name: string;
  exercises: AiProgramExercise[];
}
export interface AiEdit {
  /** What changed, in a sentence or two for the trainer. */
  summary: string;
  /** Workouts a week, when told (null — as it was). */
  perWeek: number | null;
  /** A day of the program keeps its id; a new one has id "". An exercise not in the base has exerciseId "". */
  days: AiProgramDay[];
}

export const AI_EDIT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'perWeek', 'days'],
  properties: {
    summary: { type: 'string' },
    perWeek: { type: 'integer' },
    days: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'name', 'exercises'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          exercises: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['exerciseId', 'exerciseName', 'sets', 'repMin', 'repMax', 'targetRir'],
              properties: {
                exerciseId: { type: 'string' },
                exerciseName: { type: 'string' },
                sets: { type: 'integer' },
                repMin: { type: 'integer' },
                repMax: { type: 'integer' },
                targetRir: { type: 'integer' },
              },
            },
          },
        },
      },
    },
  },
} as const;

export function aiEditSystem(base: AiBase, days: AiProgramDay[], perWeek?: number) {
  return [
    'Ты помощник фитнес-тренера. Ниже программа клиента. Тренер голосом или текстом говорит, что в ней изменить.',
    'Измени программу и верни её ЦЕЛИКОМ строго JSON по схеме: все тренировки и все упражнения, и изменённые, и прежние.',
    '',
    'Правила:',
    '- Меняй только то, что сказано. Всё остальное — как было: порядок, названия, подходы, повторы, RIR.',
    '- id тренировки оставляй прежним; новая тренировка — id "". Убрать тренировку — не включай её.',
    '- «Первые четыре упражнения», «последние два», «остальные», «третье» — по порядку упражнений в тренировке.',
    '  Если тренировка одна или не сказано, какая, — правка относится ко всем тренировкам.',
    '- Подходы 1–10, повторы repMin ≤ repMax (1–100), targetRir 0–6. «По одному подходу» — sets 1, повторы как были.',
    '- Заменить или добавить упражнение — exerciseId из списков ниже (сначала упражнения программ клиента, потом свои',
    '  тренера, потом общая база); если такого нет — exerciseId "" и exerciseName как сказал тренер. Новому упражнению без',
    '  указаний — 3 подхода, 8–12 повторов, RIR 2.',
    '- perWeek — сколько раз в неделю, если тренер это сказал, иначе 0.',
    '- summary — одно-два коротких предложения по-русски: что изменено.',
    '',
    `Программа сейчас${perWeek ? ` (${perWeek} раз в неделю)` : ''}:`,
    ...days.flatMap((d) => [
      `Тренировка id=${d.id} «${d.name}»:`,
      ...d.exercises.map((e, i) => `  ${i + 1}. ${e.exerciseId} | ${e.exerciseName} | ${e.sets} подх. × ${e.repMin}–${e.repMax}, RIR ${e.targetRir}`),
    ]),
    ...baseLines(base),
  ].join('\n');
}

/** The changed program, checked; numbers that do not fit keep the old values of that exercise. */
export function cleanAiEdit(raw: string, known: Set<string>, old: AiProgramDay[]): AiEdit | null {
  let data: any;
  try {
    data = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```\s*$/g, ''));
  } catch {
    return null;
  }
  if (!data || !Array.isArray(data.days)) return null;
  const oldIds = new Set(old.map((d) => d.id));
  const days: AiProgramDay[] = [];
  for (const d of data.days.slice(0, 14)) {
    const id = typeof d?.id === 'string' && oldIds.has(d.id) && !days.some((x) => x.id === d.id) ? d.id : '';
    const before = old.find((x) => x.id === id);
    const exercises: AiProgramExercise[] = [];
    for (const e of Array.isArray(d?.exercises) ? d.exercises.slice(0, 30) : []) {
      const exerciseId = typeof e?.exerciseId === 'string' && known.has(e.exerciseId) ? e.exerciseId : '';
      const exerciseName = str(e?.exerciseName, 100);
      if (!exerciseId && !exerciseName) continue;
      const was =
        (before?.exercises || []).find((x) => x.exerciseId === exerciseId) ||
        (exerciseId ? old.flatMap((x) => x.exercises).find((x) => x.exerciseId === exerciseId) : undefined);
      const sets = num(e?.sets, 1, 10);
      let repMin = num(e?.repMin, 1, 100);
      let repMax = num(e?.repMax, 1, 100);
      if (repMin === null || repMax === null || repMin > repMax) [repMin, repMax] = [was?.repMin ?? 8, was?.repMax ?? 12];
      const rir = num(e?.targetRir, 0, 6);
      exercises.push({
        exerciseId,
        exerciseName: exerciseName || was?.exerciseName || '',
        sets: Math.round(sets ?? was?.sets ?? 3),
        repMin: Math.round(repMin),
        repMax: Math.round(repMax),
        targetRir: Math.round(rir ?? was?.targetRir ?? 2),
      });
    }
    if (!exercises.length) continue;
    days.push({ id, name: str(d?.name, 80) || before?.name || 'Тренировка ' + (days.length + 1), exercises });
  }
  if (!days.length) return null;
  const perWeek = num(data.perWeek, 1, 7);
  return { summary: str(data.summary, 400), perWeek: perWeek === null ? null : Math.round(perWeek), days };
}

/** The call to OpenRouter with the server's key (used by backend/server.ts). */
export function openRouter(key: string, fetcher: typeof fetch = fetch, model = AI_MODEL): AiCall {
  return async ({ system, content, schema }) => {
    const res = await fetcher('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://savcov89-hub.github.io/Claude-cod/',
        'X-Title': 'Training Log',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 6000,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content },
        ],
        response_format: { type: 'json_schema', json_schema: { name: 'workout', strict: true, schema } },
        provider: { require_parameters: true },
      }),
      signal: AbortSignal.timeout(90000),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const why = res.status === 401 ? 'key' : res.status === 402 ? 'money' : res.status === 429 ? 'busy' : 'failed';
      throw Object.assign(new Error(body?.error?.message || 'OpenRouter ' + res.status), { why });
    }
    return String(body?.choices?.[0]?.message?.content ?? '');
  };
}

// ——— A check of the model on fixed cases, after each deploy (GET /api/ai/status) ———

export interface AiCase {
  name: string;
  ok: boolean;
  got: string;
}

/** Fixed texts only (nobody can send their own here), so the check costs the same each time — a few cents a month. */
export async function aiSelfCheck(call: AiCall, base: Array<{ id: string; name: string; muscleGroup: string }>, today: string): Promise<AiCase[]> {
  const known = new Set(base.map((e) => e.id));
  const b: AiBase = { client: [], own: [], common: base };
  const make = async (said: string) =>
    cleanAiWorkout(
      await call({ system: aiSystem(b, today), content: [{ type: 'text', text: 'Текст тренера:\n' + said }], schema: AI_SCHEMA as unknown as Record<string, unknown> }),
      known,
    );
  const short = (w: AiWorkout | null) =>
    w
      ? `${w.days.length} дн.${w.perWeek ? `, ${w.perWeek}/нед` : ''}: ` +
        w.days
          .map((d) => d.name + ' [' + d.exercises.map((e) => `${e.exerciseId || e.written} ${e.done.length ? e.done.map((s) => s.weight + 'x' + s.reps).join(',') : ''}${e.plan ? 'p' + e.plan.sets : ''}`).join('; ') + ']')
          .join(' ')
      : 'нет ответа';
  const program: AiProgramDay[] = [
    {
      id: 'day-1',
      name: 'Всё тело',
      exercises: ['leg-press', 'rdl', 'bench-press', 'lat-pulldown', 'lateral-raise', 'dumbbell-curl'].map((id) => ({
        exerciseId: id,
        exerciseName: base.find((e) => e.id === id)?.name || id,
        sets: 2,
        repMin: 10,
        repMax: 12,
        targetRir: 2,
      })),
    },
  ];
  const cases: Array<() => Promise<AiCase>> = [
    async () => {
      const w = await make('Жим ногами 45 3х15');
      const e = w?.days[0]?.exercises[0];
      return { name: 'вес и подходы', ok: e?.exerciseId === 'leg-press' && e.done.length === 3 && e.done.every((s) => s.weight === 45 && s.reps === 15), got: short(w) };
    },
    async () => {
      const w = await make(
        'Значит смотри, одна тренировка на всё тело три раза в неделю. Жим ногами, румынская тяга, жим штанги лёжа, вертикальная тяга, отведение гантелей в стороны, сгибание рук с гантелями. Первые четыре по три подхода, остальные по одному подходу.',
      );
      const sets = w?.days[0]?.exercises.map((e) => e.plan?.sets ?? 0).join(',');
      return { name: 'одна тренировка 3 раза, подходы словами', ok: w?.days.length === 1 && w.perWeek === 3 && sets === '3,3,3,3,1,1', got: short(w) };
    },
    async () => {
      const w = await make(
        'Три дня. Первый день грудь и спина: жим штанги лёжа, вертикальная тяга. Второй день ноги: жим ногами, румынская тяга. Третий день плечи и руки: жим гантелей сидя, сгибание рук с гантелями.',
      );
      return { name: 'три разных дня', ok: w?.days.length === 3 && w.days[1].exercises.some((e) => e.exerciseId === 'leg-press'), got: short(w) };
    },
    async () => {
      const raw = await call({
        system: aiEditSystem(b, program),
        content: [{ type: 'text', text: 'Что изменить:\nПервые четыре упражнения по три подхода, все остальные по одному. Румынскую тягу замени на становую.' }],
        schema: AI_EDIT_SCHEMA as unknown as Record<string, unknown>,
      });
      const e = cleanAiEdit(raw, known, program);
      const ex = e?.days[0]?.exercises || [];
      return {
        name: 'правка программы',
        ok: ex.map((x) => x.sets).join(',') === '3,3,3,3,1,1' && ex[1]?.exerciseId === 'deadlift' && ex[0]?.repMin === 10,
        got: e ? ex.map((x) => `${x.exerciseId} ${x.sets}x${x.repMin}-${x.repMax}`).join('; ') + ' — ' + e.summary : 'нет ответа',
      };
    },
  ];
  return Promise.all(
    cases.map((c) => c().catch((err) => ({ name: 'ошибка', ok: false, got: String((err as Error).message || err).slice(0, 200) }))),
  );
}
