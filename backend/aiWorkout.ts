// A workout told in free words or a photo of notes → days of exercises, by a language model (OpenRouter).
// The key lives only on the server (Supabase secret OPENROUTER_API_KEY); the browser sends the text or the picture to
// POST /api/ai/workout. Here: the request to the model and the check of its answer, kept apart from the routes so
// scripts/check-text-workout.ts can test them without the network.

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
  /** Sets and reps meant for the program («3 по 10–12»), when told. */
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
  days: AiDay[];
}

export type AiContent = Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
export type AiCall = (req: { system: string; content: AiContent; schema: Record<string, unknown> }) => Promise<string>;

// Plain types only (no null, no anyOf): every model behind OpenRouter takes them. «Nothing» is "" or 0, read as null below.
const nullable = <T,>(schema: T) => schema;

export const AI_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'days'],
  properties: {
    title: nullable({ type: 'string' }),
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
export function aiSystem(exercises: Array<{ id: string; name: string; muscleGroup: string }>, today: string) {
  return [
    'Ты помощник фитнес-тренера. Тренер надиктовал, написал или сфотографировал тренировку или программу из нескольких',
    'тренировок. Разложи её по дням и упражнениям и ответь строго JSON по схеме.',
    '',
    'Правила (если чего-то нет — пустая строка "", для чисел 0, для plan — нули):',
    '- Каждая тренировка — отдельный элемент days. «Три дня: первый — грудь, спина…» — три элемента. name — короткое',
    '  название дня по-русски по смыслу («Грудь и спина», «Ноги», «Плечи и руки»); если смысла нет — «День 1», «День 2».',
    '- Слова-паразиты и пояснения («значит смотри», «потом», «у нас будет», «просто короче») — не упражнения, выбрось их.',
    '- Упражнение, сказанное «в каждой тренировке» или «в конце каждой», добавь в каждый день.',
    '- written — название упражнения так, как сказал тренер, без цифр и мусора.',
    '- exerciseId — id из списка базы ниже, если это то же упражнение (синонимы зала: пендулум — маятниковый присед,',
    '  брусья — отжимания на брусьях, бабочка — сведение в тренажёре, гакк — гакк-присед).',
    '  Если в базе такого нет — "". Не выдумывай id.',
    '- done — сделанные подходы: вес в кг (свой вес — 0) и повторы. В заметках «32x13,12,10» — 32 кг на 13, 12 и 10',
    '  повторов (три подхода); «10; 10,7» без веса — подходы по 10, 10 и 7; «5x15» в заметках — 5 кг на 15.',
    '  «Жим ногами 45 3х15» — сделано 45 кг, три подхода по 15: done = три раза {weight: 45, reps: 15}.',
    '  Любые цифры веса и повторов — это сделанные подходы, всегда заполняй done. Если цифр нет — пустой массив.',
    '- plan — сколько подходов и повторов планирует тренер на будущее, если сказан диапазон без веса («3 по 10–12»);',
    '  иначе sets, repMin, repMax равны 0.',
    '- date — дата сделанной тренировки в формате ГГГГ-ММ-ДД, если она есть в тексте, иначе "" (сегодня ' + today + ';',
    '  без года — ближайшая прошедшая такая дата). bodyWeight — вес тела клиента, если указан после даты («24 августа 44,6»), иначе 0.',
    '- title — имя клиента или название программы, если оно есть в начале, иначе "".',
    '- note — короткий комментарий тренера к упражнению («не глубоко»), иначе "".',
    '',
    'Упражнения базы (id | название | группа):',
    ...exercises.map((e) => `${e.id} | ${e.name} | ${e.muscleGroup}`),
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
      const plan =
        sets !== null && repMin !== null && repMax !== null
          ? { sets: Math.round(sets), repMin: Math.round(Math.min(repMin, repMax)), repMax: Math.round(Math.max(repMin, repMax)) }
          : null;
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
  return { title: str(data.title, 100) || null, days };
}

/** The call to OpenRouter with the server's key (used by backend/server.ts). */
export function openRouter(key: string, fetcher: typeof fetch = fetch): AiCall {
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
        model: AI_MODEL,
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
