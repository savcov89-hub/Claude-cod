// A month in the gym for 30 simulated clients, run through the real request logic (backend/app.ts)
// and the real progression hints (suggestNext). Each client has a "true" strength per exercise that
// grows at a rate set by training level, response, nutrition and how hard they actually train; the
// report compares the app's hints with what the client could really do.
//   npx tsx scripts/simulate-month.ts [report.md]
import { writeFileSync } from 'node:fs';
import { createHandler } from '../backend/app';
import { sdk } from '../src/local/sdk';
import { setClockOffset, localDate } from '../src/clock';
import { ASSISTED, exerciseTrend, isStack, suggestNext, weightStep, type Suggestion } from '../src/analytics';
import { calories, latest, navyBodyFat, weeklyAverage, type BodyEntry, type BodyProfile } from '../src/body';
import { catalog } from '../src/catalog';
import { templateDays, templates } from '../src/templates';

// ---------- plumbing ----------
const handle: any = createHandler(sdk);
const TRAINER = 'sim-trainer';
const who = (id: string) => ({ userId: id, name: id, email: id + '@sim' });
async function call(actor: string, method: string, path: string, body?: unknown) {
  const r = await handle(method, path, body, who(actor));
  if (r.status >= 400) throw new Error(`${method} ${path}: ${r.status} ${r.data?.error}`);
  return r.data;
}
async function tryCall(actor: string, method: string, path: string, body?: unknown) {
  return handle(method, path, body, who(actor));
}
let seed = 20260929;
const rand = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(2 * Math.PI * rand());
const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)];

// ---------- equipment ----------
const equipmentOf = (id: string) => catalog.find((c) => c.id === id)?.equipment || '';
const BODYWEIGHT = (id: string) => ['Собственный вес', 'Скамья'].includes(equipmentOf(id));
const SMALL_STACK = new Set([
  'stack-biceps-curl', 'stack-seated-leg-curl', 'stack-lying-leg-curl', 'stack-hip-adduction', 'stack-hip-abduction',
  'stack-ab-crunch', 'stack-assisted-dip', 'stack-lateral-raise', 'stack-triceps-press', 'leg-curl', 'seated-leg-curl',
  'lying-leg-curl', 'hip-adduction', 'hip-abduction', 'assisted-pull-up', 'machine-lateral-raise',
]);
/** Kilograms moved at `plates` holes of the stack (gym photos: 25/40/55… lb big, 20/30/40… lb small). */
const stackKg = (id: string, plates: number) => {
  if (plates <= 0) return 0;
  const small = SMALL_STACK.has(id) || equipmentOf(id) === 'Блок';
  return small ? 9 + (plates - 1) * 4.5 : 11 + (plates - 1) * 6.8;
};
const platesFor = (id: string, kg: number) => {
  let best = 1;
  for (let n = 1; n <= 20; n++) if (Math.abs(stackKg(id, n) - kg) < Math.abs(stackKg(id, best) - kg)) best = n;
  return best;
};
/** Weight the trainer can actually set: dumbbells 1 kg under 10, then 2,5; bars and plate machines 2,5; stacks whole plates. */
const roundLoad = (id: string, kg: number) => {
  if (isStack({ exerciseId: id })) return platesFor(id, kg);
  const step = weightStep(kg);
  return Math.max(step, Math.round(kg / step) * step);
};

// ---------- true strength ----------
/** Typical 1RM (kg of load) of an average intermediate man; others scale from it. */
const BASE_1RM: Record<string, number> = {
  'bench-press': 85, 'incline-dumbbell-press': 32, 'machine-chest-press': 80, 'cable-fly': 22, 'pec-deck': 60,
  'smith-incline-press': 70, 'lat-pulldown': 75, 'chest-supported-row': 70, 't-bar-row': 60, 'seated-row': 75,
  'one-arm-row': 38, 'cable-pullover': 35, 'face-pull': 30, 'reverse-pec-deck': 45, 'rear-delt-fly': 40,
  'machine-shoulder-press': 60, 'dumbbell-shoulder-press': 26, 'lateral-raise': 12, 'cable-lateral-raise': 10,
  'machine-lateral-raise': 38, 'incline-curl': 15, 'bayesian-curl': 12, 'cable-curl': 30, 'hammer-curl': 20,
  'preacher-curl': 30, 'barbell-curl': 40, 'overhead-triceps': 30, 'triceps-pushdown': 38, 'lying-triceps-extension': 18,
  'back-squat': 100, 'front-squat': 80, 'leg-press': 180, 'hack-squat': 90, 'pendulum-squat': 75, 'smith-squat': 90,
  rdl: 90, deadlift: 120, 'seated-leg-curl': 60, 'lying-leg-curl': 50, 'leg-curl': 55, 'leg-extension': 65,
  'standing-calf-raise': 90, 'seated-calf-raise': 60, 'leg-press-calf': 150, 'calf-raise': 80, 'hip-adduction': 60,
  'hip-abduction': 65, 'hip-thrust': 110, 'bulgarian-split-squat': 22, 'reverse-lunge': 24, 'cable-kickback': 16,
  'cable-crunch': 45, 'overhead-press': 50, 'barbell-row': 75, 'machine-lateral-raise ': 38,
};
const LOWER_GROUPS = /Квадрицепс|Ягодиц|Бицепс бедра|Икры|Приводящие|Задняя цепь/;
const isLower = (id: string) => LOWER_GROUPS.test(catalog.find((c) => c.id === id)?.muscleGroup || '');
/** Load of a bodyweight movement as a share of body weight. */
const BW_SHARE: Record<string, number> = { 'pull-up': 0.95, dips: 0.9, 'assisted-pull-up': 0.95, 'stack-assisted-dip': 0.9 };

type Level = 'новичок' | 'средний' | 'продвинутый';
type Food = 'дефицит' | 'поддержание' | 'профицит';
interface SimClient {
  name: string;
  clientId: string;
  userId: string | null;
  sex: 'm' | 'f';
  level: Level;
  response: number;
  food: Food;
  upper: number;
  lower: number;
  missRate: number;
  lateRate: number;
  forgetLeave: number;
  logging: 'точно' | 'галочка';
  template: number;
  bodyWeight: number;
  heightCm: number;
  birthYear: number;
  steps: number;
  waist: number;
  neck: number;
  hips: number;
  programId: string;
  /** True 1RM (kg of load) per exercise, or max reps for loadless abs. */
  e1rm: Record<string, number>;
  start: Record<string, number>;
  lastTrained: Record<string, number>;
  switchedAt?: number;
}
const LEVEL_RATE: Record<Level, number> = { новичок: 0.025, средний: 0.01, продвинутый: 0.004 };
const LEVEL_STRENGTH: Record<Level, number> = { новичок: 0.62, средний: 1, продвинутый: 1.35 };
const FOOD_RATE: Record<Food, number> = { дефицит: 0.45, поддержание: 0.85, профицит: 1.15 };

function trueStart(c: SimClient, id: string) {
  if (!BODYWEIGHT(id) && !ASSISTED.has(id) && !(id in BASE_1RM)) BASE_1RM[id] = isLower(id) ? 70 : 35;
  const aptitude = isLower(id) ? c.lower : c.upper;
  const sexK = c.sex === 'f' ? (isLower(id) ? 0.72 : 0.55) : 1;
  if (id in BW_SHARE) return c.bodyWeight * BW_SHARE[id] * (0.85 + 0.35 * LEVEL_STRENGTH[c.level] * aptitude * sexK);
  if (BODYWEIGHT(id)) return 12 + 14 * LEVEL_STRENGTH[c.level]; // max reps
  return BASE_1RM[id] * LEVEL_STRENGTH[c.level] * aptitude * sexK * (0.9 + rand() * 0.2);
}
/** Load in kg the client moves at weight `w` as logged in the app. */
function loadKg(c: SimClient, id: string, w: number) {
  if (ASSISTED.has(id)) return Math.max(5, c.bodyWeight * (BW_SHARE[id] || 0.95) - stackKg(id, w));
  if (id in BW_SHARE) return c.bodyWeight * BW_SHARE[id] + w;
  if (isStack({ exerciseId: id })) return stackKg(id, w);
  return w;
}
/** Reps possible to failure with load `kg` (Epley inverse); loadless abs use the max-reps capacity. */
function repsToFailure(c: SimClient, id: string, w: number, readiness: number) {
  const E = c.e1rm[id] * readiness;
  if (BODYWEIGHT(id) && !(id in BW_SHARE)) return E;
  const L = loadKg(c, id, w);
  return 30 * (E / L - 1);
}
/** Weight (as logged) that gives `reps` at `rir`. */
function idealWeight(c: SimClient, id: string, reps: number, rir: number) {
  if (BODYWEIGHT(id) && !(id in BW_SHARE)) return 0;
  const L = c.e1rm[id] / (1 + (reps + rir) / 30);
  if (ASSISTED.has(id)) return platesFor(id, Math.max(0, c.bodyWeight * (BW_SHARE[id] || 0.95) - L));
  if (id in BW_SHARE) return Math.max(0, L - c.bodyWeight * BW_SHARE[id]);
  return roundLoad(id, L);
}

// ---------- findings ----------
const findings: Array<{ area: string; text: string }> = [];
const note = (area: string, text: string) => {
  if (findings.filter((f) => f.area === area && f.text === text).length === 0) findings.push({ area, text });
};
interface Sample {
  client: string;
  level: Level;
  week: number;
  id: string;
  kind: Suggestion['kind'];
  zone: 'лёгкий' | 'в диапазоне' | 'тяжёлый' | 'свой вес';
  logging: string;
  prev: string;
  sug: string;
  plan: string;
  ideal: number;
  weight: number;
  logged?: string;
  day: number;
}
const samples: Sample[] = [];
const oscillations: string[] = [];
const downs: string[] = [];

// ---------- the month ----------
const NAMES_M = ['Артём', 'Иван', 'Дмитрий', 'Максим', 'Егор', 'Никита', 'Павел', 'Роман', 'Сергей', 'Олег', 'Кирилл', 'Антон', 'Глеб', 'Тимур', 'Лев'];
const NAMES_F = ['Анна', 'Мария', 'Елена', 'Ольга', 'Дарья', 'Ксения', 'Алина', 'Вера', 'Софья', 'Полина', 'Юлия', 'Ирина', 'Катя', 'Лиза', 'Нина'];
const THREE_DAY = [0, 6, 7, 8, 2]; // full body 3×, pull/push/legs, glutes/upper/glutes, bro split, upper/lower 4× (on 3 visits)

async function main() {
  const report = process.argv[2] || 'simulation-report.md';
  const START = new Date('2026-08-31T00:00:00'); // Monday
  setClockOffset(START.getTime() - 3 * 86400000 - Date.now());
  await call(TRAINER, 'POST', '/api/profile', { role: 'trainer', name: 'Тренер' });

  const clients: SimClient[] = [];
  for (let i = 0; i < 30; i++) {
    const sex: 'm' | 'f' = i % 2 ? 'f' : 'm';
    const level: Level = i < 12 ? 'новичок' : i < 24 ? 'средний' : 'продвинутый';
    const food: Food = pick(['дефицит', 'поддержание', 'поддержание', 'профицит']);
    const name = (sex === 'm' ? NAMES_M : NAMES_F)[Math.floor(i / 2)] + ' ' + (i + 1);
    const { client } = await call(TRAINER, 'POST', '/api/clients', { clientName: name });
    let userId: string | null = null;
    if (i % 3 === 0) {
      userId = 'sim-u' + i;
      await call(userId, 'POST', '/api/profile', { role: 'client', name });
      const { code } = await call(TRAINER, 'POST', '/api/invites', { clientId: client.clientId });
      await call(userId, 'POST', '/api/connect', { code });
    }
    const template = sex === 'f' && rand() < 0.5 ? 7 : THREE_DAY[i % THREE_DAY.length];
    const bw = sex === 'm' ? 70 + rand() * 30 : 52 + rand() * 25;
    const c: SimClient = {
      name,
      clientId: client.clientId,
      userId,
      sex,
      level,
      response: pick([0.5, 0.8, 1, 1, 1.2, 1.5]),
      food,
      upper: 0.75 + rand() * 0.6,
      lower: 0.75 + rand() * 0.6,
      missRate: pick([0, 0.05, 0.1, 0.2, 0.3]),
      lateRate: pick([0, 0.2, 0.4, 0.6]),
      forgetLeave: pick([0, 0.1, 0.3]),
      logging: rand() < 0.6 ? 'точно' : 'галочка',
      template,
      bodyWeight: Math.round(bw * 10) / 10,
      heightCm: Math.round(sex === 'm' ? 170 + rand() * 20 : 158 + rand() * 16),
      birthYear: 1970 + Math.floor(rand() * 35),
      steps: Math.round(3000 + rand() * 13000),
      waist: 0,
      neck: sex === 'm' ? 37 + rand() * 5 : 31 + rand() * 4,
      hips: sex === 'f' ? 92 + rand() * 18 : 0,
      programId: '',
      e1rm: {},
      start: {},
      lastTrained: {},
    };
    c.waist = sex === 'm' ? 75 + (bw - 70) * 0.7 + rand() * 8 : 64 + (bw - 52) * 0.6 + rand() * 8;
    const { program } = await call(TRAINER, 'POST', '/api/programs', {
      clientId: c.clientId,
      name: templates[template].name,
      days: templateDays(template, 6, i % 2, true),
    });
    c.programId = program.id;
    // Body profile once.
    await call(userId || TRAINER, 'POST', '/api/body/profile', {
      ...(userId ? {} : { clientId: c.clientId }),
      sex,
      heightCm: c.heightCm,
      birthYear: c.birthYear,
      activity: 'light',
    });
    clients.push(c);
  }

  const DAYS = 28;
  for (let d = 0; d < DAYS; d++) {
    const date = new Date(START.getTime() + d * 86400000);
    const week = Math.floor(d / 7) + 1;
    // Mornings: weight and yesterday's steps (not every day).
    for (const c of clients) {
      const trend = c.food === 'дефицит' ? -0.5 : c.food === 'профицит' ? 0.3 : 0;
      c.bodyWeight = Math.round((c.bodyWeight + trend / 7) * 100) / 100;
      if (rand() < 0.75) {
        setClockOffset(new Date(date).setHours(7, 30) - Date.now());
        const today = localDate(date);
        const actor = c.userId || TRAINER;
        const who2 = c.userId ? {} : { clientId: c.clientId };
        await call(actor, 'POST', '/api/body', { ...who2, date: today, weight: Math.round((c.bodyWeight + gauss() * 0.4) * 10) / 10 });
        const y = new Date(date.getTime() - 86400000);
        await call(actor, 'POST', '/api/body', { ...who2, date: localDate(y), steps: Math.max(500, Math.round(c.steps + gauss() * 2500)) });
        if (date.getDay() === 1) {
          c.waist += c.food === 'дефицит' ? -0.4 : c.food === 'профицит' ? 0.15 : 0;
          await call(actor, 'POST', '/api/body', {
            ...who2,
            date: today,
            waist: Math.round(c.waist * 10) / 10,
            neck: Math.round(c.neck * 10) / 10,
            ...(c.sex === 'f' ? { hips: Math.round(c.hips * 10) / 10 } : {}),
          });
        }
      }
    }
    // Strength grows every day for exercises trained within the last week, by how hard they were trained.
    for (const c of clients)
      for (const id of Object.keys(c.e1rm)) {
        const effort = c.lastTrained[id];
        if (effort === undefined || d - Math.floor(effort) > 7) continue;
        const quality = (effort % 1) * 10; // stimulus stored in the fraction
        const rate = (LEVEL_RATE[c.level] * c.response * FOOD_RATE[c.food] * quality) / 7;
        c.e1rm[id] *= 1 + rate;
      }

    if (![1, 3, 5].includes(date.getDay())) continue;

    // Three clients get a new program with other rep ranges in week 3 (same exercises).
    if (d === 14)
      for (const c of clients.slice(0, 3)) {
        const { programs } = await call(TRAINER, 'GET', '/api/programs');
        const p = programs.find((x: any) => x.id === c.programId);
        const days = p.days.map((day: any) => ({
          ...day,
          exercises: day.exercises.map((e: any) => (e.repMax <= 10 ? { ...e, repMin: 12, repMax: 15 } : { ...e, repMin: 5, repMax: 8 })),
        }));
        await call(TRAINER, 'POST', '/api/programs/' + c.programId, { name: p.name + ' (новый блок)', days });
        c.switchedAt = d;
      }

    for (const c of clients) {
      if (rand() < c.missRate) continue;
      const late = rand() < c.lateRate;
      const arrive = new Date(date).setHours(8 + Math.floor(rand() * 12), Math.floor(rand() * 60));
      setClockOffset(arrive - Date.now());
      await call(TRAINER, 'POST', '/api/attendance', { clientId: c.clientId, present: true, localDate: localDate(date) });
      const actor = c.userId && rand() < 0.4 ? c.userId : TRAINER;
      const { programs } = await call(TRAINER, 'GET', '/api/programs');
      const p = programs.find((x: any) => x.id === c.programId);
      const dayId = p.nextDayId || p.days[0].id;
      const w = await call(actor, 'GET', `/api/workout/${TRAINER}/${c.programId}/${dayId}`);
      if (w.day.exercises.some((e: any) => e.equipment === undefined)) note('Сервер', 'В тренировке нет поля equipment у упражнения.');
      const readiness = 1 + gauss() * 0.035 - (c.food === 'дефицит' ? 0.02 : 0);
      // Late: no time for the last one or two exercises.
      const cut = late ? w.day.exercises.length - 1 - Math.floor(rand() * 2) : w.day.exercises.length;
      let minutes = 0;
      const exercises: any[] = [];
      for (let ei = 0; ei < w.day.exercises.length; ei++) {
        let e = w.day.exercises[ei];
        let replaces: string | undefined;
        // Machine busy: swap for another exercise of the same group now and then.
        if (rand() < 0.06) {
          const group = catalog.find((x) => x.id === e.exerciseId)?.muscleGroup;
          const alt = catalog.filter(
            (x) => x.muscleGroup === group && !w.day.exercises.some((y: any) => y.exerciseId === x.id) && !exercises.some((y) => y.exerciseId === x.id),
          );
          if (alt.length) {
            const a = pick(alt);
            const prev = await call(actor, 'GET', `/api/previous/${TRAINER}/${c.programId}/${a.id}`);
            replaces = e.exerciseId;
            e = { ...e, exerciseId: a.id, exerciseName: a.name, equipment: prev.equipment, previousSets: prev.previousSets };
          }
        }
        if (ei >= cut) {
          exercises.push({ exerciseId: e.exerciseId, exerciseName: e.exerciseName, ...(replaces ? { replaces } : {}), skipped: true, sets: Array.from({ length: e.sets }, () => ({ weight: 0, reps: 0, rir: null })) });
          continue;
        }
        const id = e.exerciseId;
        if (!(id in c.e1rm)) {
          c.e1rm[id] = trueStart(c, id);
          c.start[id] = c.e1rm[id];
        }
        const sug = suggestNext(e, e.previousSets);
        const mid = Math.round((e.repMin + e.repMax) / 2);
        let weight = sug.weight || e.previousSets[0]?.weight || 0;
        if (sug.kind === 'first' || (!weight && !BODYWEIGHT(id))) {
          const ideal = idealWeight(c, id, mid, e.targetRir);
          const guess = ideal * (1 + gauss() * 0.12);
          weight = BODYWEIGHT(id) && !ASSISTED.has(id) ? 0 : isStack({ exerciseId: id }) ? Math.max(1, Math.round(guess)) : roundLoad(id, guess);
          if (ASSISTED.has(id)) weight = Math.max(1, Math.round(ideal * (1 + gauss() * 0.15)));
        }
        // Where the suggested load sits against what the client can really do today.
        const lo = e.repMin;
        const hi = e.repMax;
        const cap0 = repsToFailure(c, id, weight, 1) - e.targetRir;
        const zone: Sample['zone'] = BODYWEIGHT(id) && !(id in BW_SHARE) ? 'свой вес' : cap0 > hi + 2 ? 'лёгкий' : cap0 < lo - 2 ? 'тяжёлый' : 'в диапазоне';
        const sample: Sample = {
          client: c.name,
          level: c.level,
          week,
          id,
          kind: sug.kind,
          zone,
          logging: c.logging,
          prev: e.previousSets.map((x: any) => x.weight + '×' + x.reps).join(' '),
          sug: sug.weight + ' ' + sug.reps.join('/'),
          plan: e.repMin + '–' + e.repMax + ' RIR' + e.targetRir,
          ideal: idealWeight(c, id, mid, e.targetRir),
          weight,
          day: d,
        };
        samples.push(sample);
        if (sug.kind === 'first' && e.previousSets.length) note('Прогрессия', `«Первое выполнение» при наличии истории (${id}).`);

        const sets: any[] = [];
        let efforts = 0;
        for (let si = 0; si < e.sets; si++) {
          const target = sug.reps[si] ?? sug.reps.at(-1) ?? e.repMin;
          const fatigue = si * (isLower(id) ? 1 : 0.8);
          let cap = Math.floor(repsToFailure(c, id, weight, readiness) - fatigue + gauss() * 0.6);
          // Far too heavy: the trainer takes a step off for this and the next sets.
          if (cap < lo - 3 && weight > 0) {
            const down = isStack({ exerciseId: id }) ? 1 : weightStep(weight);
            weight = ASSISTED.has(id) ? weight + 1 : Math.max(0, weight - down);
            cap = Math.floor(repsToFailure(c, id, weight, readiness) - fatigue + gauss() * 0.6);
          }
          const withRir = cap - e.targetRir;
          let reps: number;
          if (withRir >= target) reps = c.logging === 'галочка' ? target : Math.min(withRir, hi + 2);
          else reps = Math.max(1, withRir);
          efforts += Math.max(0, cap - reps);
          sets.push({ weight, reps, rir: null });
          minutes += 2.5;
        }
        sample.logged = sets.map((x) => x.weight + '×' + x.reps).join(' ');
        const avgLeft = efforts / e.sets;
        const quality = avgLeft <= 3 ? 1 : avgLeft <= 6 ? 0.6 : 0.3;
        c.lastTrained[id] = d + quality / 10;
        exercises.push({ exerciseId: id, exerciseName: e.exerciseName, ...(replaces ? { replaces } : {}), sets });
      }
      // Saved as the sets go, then finished; a forgotten «Ушёл» is closed later, dated to the last set.
      const draftRes = await tryCall(actor, 'POST', '/api/draft', { trainerId: TRAINER, programId: c.programId, dayId, baseRevision: w.revision, exercises });
      if (draftRes.status >= 400) {
        note('Сервер', `Черновик не сохранился: ${draftRes.data?.error}`);
        continue;
      }
      const draft = draftRes.data;
      const forgot = rand() < c.forgetLeave;
      const lastSet = arrive + minutes * 60000;
      setClockOffset((forgot ? lastSet + 65 * 60000 : lastSet + 5 * 60000) - Date.now());
      const done = exercises.some((x) => x.sets.some((s: any) => s.reps > 0));
      if (done) {
        const res = await tryCall(actor, 'POST', '/api/sessions', {
          trainerId: TRAINER,
          programId: c.programId,
          dayId,
          baseRevision: draft.revision,
          exercises,
          feedback: '',
          localDate: localDate(new Date(lastSet)),
          ...(forgot ? { completedAt: new Date(lastSet).toISOString() } : {}),
        });
        if (res.status >= 400) note('Сервер', `Не записалась тренировка: ${res.data?.error}`);
      }
      await call(TRAINER, 'POST', '/api/attendance', { clientId: c.clientId, present: false, localDate: localDate(date) });
    }
  }

  // ---------- oscillation: increase followed by decrease on the same exercise ----------
  const byKey = new Map<string, Sample[]>();
  for (const s of samples) {
    const k = s.client + '|' + s.id;
    byKey.set(k, [...(byKey.get(k) || []), s]);
  }
  for (const [k, list] of byKey)
    for (let i = 1; i < list.length; i++) if (list[i - 1].kind === 'increase' && list[i].kind === 'decrease') oscillations.push(k);

  // ---------- after the month ----------
  setClockOffset(START.getTime() + DAYS * 86400000 + 10 * 3600000 - Date.now());
  const { clients: listed } = await call(TRAINER, 'GET', '/api/clients');
  const rows: string[] = [];
  let falseDown = 0;
  let falseStall = 0;
  let trendChecked = 0;
  for (const c of clients) {
    const { sessions } = await call(TRAINER, 'GET', `/api/client/${c.clientId}/history`);
    const ids = Object.keys(c.start);
    const gains = ids.map((id) => c.e1rm[id] / c.start[id] - 1);
    const meanGain = gains.reduce((a, b) => a + b, 0) / Math.max(1, gains.length);
    for (const id of ids) {
      const t = exerciseTrend(sessions, id);
      if (!t || t.series.length < 3) continue;
      trendChecked++;
      const realGain = c.e1rm[id] / c.start[id] - 1;
      if (t.trend === 'down' && realGain > 0.02) {
        falseDown++;
        const [a2, b2] = t.series.slice(-2);
        downs.push(`${c.name} ${id}: ${a2.sets.map((x) => x.weight + '×' + x.reps).join(' ')} → ${b2.sets.map((x) => x.weight + '×' + x.reps).join(' ')} (реально +${(realGain * 100).toFixed(1)} %)`);
      }
      if (t.trend === 'stall' && realGain > 0.05) falseStall++;
    }
    const info = listed.find((x: any) => x.clientId === c.clientId);
    // App-side gain: e1RM of the last vs the first logged performance, loaded exercises only.
    const appGains = ids
      .map((id) => exerciseTrend(sessions, id))
      .filter((t): t is NonNullable<typeof t> => !!t && t.series.length >= 3 && !BODYWEIGHT(t.exerciseId))
      .map((t) => t.totalPct / 100);
    const appGain = appGains.reduce((a, b) => a + b, 0) / Math.max(1, appGains.length);
    // Body.
    const body = await call(TRAINER, 'GET', '/api/body?clientId=' + c.clientId);
    const entries: BodyEntry[] = body.entries;
    const profile: BodyProfile = body.profile;
    const today = localDate(new Date(START.getTime() + DAYS * 86400000));
    const wk = weeklyAverage(entries, today);
    const st = weeklyAverage(entries, today, 'steps');
    const last = latest(entries);
    const bf = navyBodyFat(profile, { waist: last.waist?.value, neck: last.neck?.value, hips: last.hips?.value });
    const kcal = wk.current ? calories(profile, wk.current, bf, st.current) : null;
    if (bf === null) note('Замеры', `${c.name}: процент жира не посчитался (талия ${last.waist?.value}, шея ${last.neck?.value}, бёдра ${last.hips?.value}).`);
    if (kcal && kcal.cut < kcal.bmr) note('Калории', `${c.name}: «снижение» ${kcal.cut} ккал ниже обмена в покое ${kcal.bmr}.`);
    const weekly = wk.current !== null && wk.previous !== null ? wk.current - wk.previous : null;
    if (weekly !== null && c.food === 'дефицит' && weekly > 0.1) note('Замеры', `${c.name}: при дефиците среднее за неделю выросло (${weekly.toFixed(1)} кг).`);
    rows.push(
      `| ${c.name} | ${c.level} | ${c.food} | ×${c.response} | ${c.logging} | ${templates[c.template].name} | ${sessions.length} | ${(meanGain * 100).toFixed(1)} % | ${(appGain * 100).toFixed(1)} % | ${info?.insights?.stalls?.length || 0}/${info?.insights?.drops?.length || 0} | ${bf ?? '—'} | ${kcal ? kcal.maintain + ' (×' + kcal.factor + ')' : '—'} |`,
    );
  }

  // ---------- aggregate ----------
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) + ' %' : '—');
  const zoneTable = (filter: (s: Sample) => boolean) => {
    const list = samples.filter((s) => filter(s) && s.zone !== 'свой вес');
    return `${pct(list.filter((s) => s.zone === 'в диапазоне').length, list.length)} в диапазоне, ${pct(list.filter((s) => s.zone === 'лёгкий').length, list.length)} слишком легко, ${pct(list.filter((s) => s.zone === 'тяжёлый').length, list.length)} слишком тяжело (n=${list.length})`;
  };
  const kinds = ['first', 'increase', 'reps', 'decrease'].map((k) => `${k}: ${samples.filter((s) => s.kind === k).length}`).join(', ');
  const out = [
    '# Симуляция: 30 клиентов, 4 недели, Пн/Ср/Пт',
    '',
    `Подсказок: ${samples.length} (${kinds}). Колебаний «прибавь → сбрось» подряд: ${oscillations.length}.`,
    '',
    '## Где подсказанный вес относительно реальных возможностей',
    ...[1, 2, 3, 4].map((wk) => `- Неделя ${wk}: ${zoneTable((s) => s.week === wk)}`),
    ...(['новичок', 'средний', 'продвинутый'] as Level[]).map((l) => `- ${l}, неделя 4: ${zoneTable((s) => s.level === l && s.week === 4)}`),
    `- Тренер вводит точно, неделя 4: ${zoneTable((s) => s.logging === 'точно' && s.week === 4)}`,
    `- Тренер ставит галочку, неделя 4: ${zoneTable((s) => s.logging === 'галочка' && s.week === 4)}`,
    '',
    `Тренды приложения: проверено ${trendChecked}, ложное «Снижение» ${falseDown}, ложный «Застой» ${falseStall}.`,
    '',
    '## Ложное «Снижение»',
    ...downs.map((x) => '- ' + x),
    '',
    '## Клиенты',
    '| Клиент | Уровень | Питание | Отклик | Ввод | Программа | Трен. | Реальный рост силы | Рост по приложению | Застой/снижение | Жир % | Поддержание |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows,
    '',
    '## Замечания',
    ...findings.map((f) => `- **${f.area}.** ${f.text}`),
  ].join('\n');
  writeFileSync(report, out);
  writeFileSync(report.replace(/\.md$/, '') + '-samples.json', JSON.stringify(samples));
  console.log(out.split('\n## Клиенты')[0]);
  console.log('\nЗамечаний:', findings.length, '→', report);
  setClockOffset(0);
}

void main();
