// Realistic sample data for the test build: five clients, 2–6 weeks of history
// generated through the same request logic the real app uses.
import { setClockOffset, localDate } from '../clock';
import { isStack, suggestNext, weightStep } from '../analytics';
import { templateDays, templates } from '../templates';
import { musclesOf } from '../trainingRules';

type Call = (actor: string, method: string, path: string, body?: unknown) => Promise<any>;

export const TRAINER_ID = 'demo-trainer';
export const TRAINER_NAME = 'Михаил · тренер';
export const DEMO_CLIENT_USERS = [
  { userId: 'demo-u0', name: 'Александр' },
  { userId: 'demo-u1', name: 'Мария' },
  { userId: 'demo-u2', name: 'Дмитрий' },
  { userId: 'demo-u3', name: 'Анна' },
];

const base: Record<string, number> = {
  'leg-press': 120, 'hack-squat': 60, 'back-squat': 70, 'pendulum-squat': 50, 'smith-squat': 60,
  rdl: 60, 'seated-leg-curl': 40, 'lying-leg-curl': 35, 'leg-extension': 45, 'standing-calf-raise': 60,
  'seated-calf-raise': 40, 'leg-press-calf': 100, 'hip-adduction': 40, 'hip-abduction': 45,
  'hip-thrust': 70, 'bulgarian-split-squat': 12, 'reverse-lunge': 14, 'back-extension': 10,
  'cable-kickback': 10, 'lat-pulldown': 55, 'chest-supported-row': 50, 't-bar-row': 40,
  'seated-row': 55, 'one-arm-row': 26, 'cable-pullover': 25, 'face-pull': 20, 'reverse-pec-deck': 30,
  'rear-delt-fly': 25, 'machine-shoulder-press': 40, 'dumbbell-shoulder-press': 18, 'lateral-raise': 8,
  'cable-lateral-raise': 5, 'machine-lateral-raise': 25, 'incline-curl': 10, 'bayesian-curl': 7.5,
  'cable-curl': 20, 'hammer-curl': 14, 'preacher-curl': 20, 'barbell-curl': 25, 'overhead-triceps': 20,
  'triceps-pushdown': 25, 'lying-triceps-extension': 12, 'bench-press': 60,
  'incline-dumbbell-press': 24, 'machine-chest-press': 50, 'cable-fly': 15, 'pec-deck': 40,
  'smith-incline-press': 50, 'cable-crunch': 30,
};
const LOWER = ['quads', 'glutes', 'hamstrings', 'calves', 'abductors', 'adductors'];
const isLower = (id: string) => musclesOf(id).primary.some((m) => LOWER.includes(m));

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Plan {
  name: string;
  userIdx: number | null;
  template: string;
  upper: number;
  lowerMult: number;
  weekdays: number[];
  fromDaysAgo: number;
  toDaysAgo: number;
  actor: (i: number, total: number) => 'trainer' | 'client';
  stall?: { ids: string[]; after: number };
  drop?: boolean;
  notes: { goal: string; limits: string; notes: string };
  inGym?: boolean;
  openDraft?: boolean;
}

const PLANS: Plan[] = [
  {
    name: 'Александр', userIdx: 0, template: 'Верх / низ 4×', upper: 1, lowerMult: 1,
    weekdays: [1, 2, 4, 5], fromDaysAgo: 43, toDaysAgo: 1, actor: () => 'trainer',
    stall: { ids: ['bench-press', 'machine-chest-press'], after: 12 },
    notes: { goal: 'Набор мышечной массы, +4 кг за полгода', limits: 'Правое плечо: без глубокого жима лёжа', notes: 'Любит базовые упражнения, пропускает пресс.' },
  },
  {
    name: 'Мария', userIdx: 1, template: 'Акцент на ягодицы 4×', upper: 0.45, lowerMult: 0.7,
    weekdays: [1, 3, 5, 6], fromDaysAgo: 36, toDaysAgo: 0,
    actor: (i, total) => (i >= total - 3 ? 'client' : 'trainer'),
    notes: { goal: 'Ягодицы и осанка', limits: '', notes: 'Ведёт журнал сама по выходным.' },
  },
  {
    name: 'Дмитрий', userIdx: 2, template: 'Всё тело 3×', upper: 0.9, lowerMult: 0.9,
    weekdays: [1, 3, 5], fromDaysAgo: 40, toDaysAgo: 12, actor: () => 'trainer', drop: true,
    notes: { goal: 'Сила и общая форма', limits: 'Поясница: осторожно с наклонами', notes: '' },
  },
  {
    name: 'Анна', userIdx: 3, template: 'Толкай / тяни / ноги ×2', upper: 0.5, lowerMult: 0.7,
    weekdays: [0, 1, 2, 3, 4, 5, 6], fromDaysAgo: 3, toDaysAgo: 1, actor: () => 'client',
    notes: { goal: 'Рельеф', limits: '', notes: 'Новый клиент, пробная неделя.' },
  },
  {
    name: 'Ольга', userIdx: null, template: 'Всё тело 2×', upper: 0.45, lowerMult: 0.6,
    weekdays: [2, 5], fromDaysAgo: 30, toDaysAgo: 2, actor: () => 'trainer',
    notes: { goal: 'Здоровая спина, общий тонус', limits: 'Без осевой нагрузки на позвоночник', notes: 'Приложением не пользуется — записываю сам.' },
  },
  {
    name: 'Сергей', userIdx: null, template: 'Всё тело 3×', upper: 0.85, lowerMult: 0.85,
    weekdays: [1, 3, 5], fromDaysAgo: 24, toDaysAgo: 2, actor: () => 'trainer',
    notes: { goal: 'Вернуться в форму после перерыва', limits: '', notes: '' },
  },
  {
    name: 'Екатерина', userIdx: null, template: 'Верх / низ 4×', upper: 0.5, lowerMult: 0.7,
    weekdays: [1, 2, 4, 5], fromDaysAgo: 30, toDaysAgo: 1, actor: () => 'trainer',
    notes: { goal: 'Сила и рельеф', limits: 'Левое колено: без глубоких выпадов', notes: '' },
  },
  {
    name: 'Иван', userIdx: null, template: 'Верх / низ + толкай / тяни / ноги 5×', upper: 1.1, lowerMult: 1.1,
    weekdays: [1, 2, 3, 4, 5], fromDaysAgo: 20, toDaysAgo: 1, actor: () => 'trainer',
    notes: { goal: 'Масса', limits: '', notes: 'Опытный, тренируется 5 лет.' },
  },
  {
    name: 'Павел', userIdx: null, template: 'Всё тело 3×', upper: 0.8, lowerMult: 0.8,
    weekdays: [], fromDaysAgo: -1, toDaysAgo: 0, actor: () => 'trainer',
    notes: { goal: 'Похудеть, укрепить спину', limits: 'Сидячая работа, болит поясница', notes: 'Первая тренировка.' },
  },
  {
    name: 'Юлия', userIdx: null, template: 'Акцент на ягодицы 4×', upper: 0.45, lowerMult: 0.65,
    weekdays: [], fromDaysAgo: -1, toDaysAgo: 0, actor: () => 'trainer',
    notes: { goal: 'Ягодицы, тонус', limits: '', notes: 'Первая тренировка, раньше занималась дома.' },
  },
];
export const SEED_VERSION = 2;

const roundW = (w: number) => {
  const step = weightStep(w);
  return Math.max(0, Math.round(w / step) * step);
};

export async function seed(call: Call) {
  const rand = rng(20260926);
  await call(TRAINER_ID, 'POST', '/api/profile', { role: 'trainer' });
  for (const u of DEMO_CLIENT_USERS) await call(u.userId, 'POST', '/api/profile', { role: 'client' });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const plan of PLANS) {
    const { client } = await call(TRAINER_ID, 'POST', '/api/clients', { clientName: plan.name });
    await call(TRAINER_ID, 'POST', '/api/client/' + client.clientId + '/update', { notes: plan.notes });
    if (plan.userIdx !== null) {
      const { code } = await call(TRAINER_ID, 'POST', '/api/invites', { clientId: client.clientId });
      await call(DEMO_CLIENT_USERS[plan.userIdx].userId, 'POST', '/api/connect', { code });
    }
    const tIndex = templates.findIndex((t) => t.name === plan.template);
    // Program created a little before the first session.
    setClockOffset(-(plan.fromDaysAgo + 1) * 86400000);
    const { program } = await call(TRAINER_ID, 'POST', '/api/programs', {
      clientId: client.clientId,
      name: templates[tIndex].name,
      days: templateDays(tIndex, 6, 0, true),
    });

    const dates: Date[] = [];
    for (let d = plan.fromDaysAgo; d >= plan.toDaysAgo; d -= 1) {
      const date = new Date(today.getTime() - d * 86400000);
      if (!plan.weekdays.includes(date.getDay())) continue;
      if (dates.length > 2 && rand() < 0.1) continue; // a missed workout now and then
      date.setHours(18, Math.floor(rand() * 50), 0, 0);
      if (d === 0 && date.getTime() > Date.now()) date.setTime(Date.now() - 3600000);
      dates.push(date);
    }

    for (let i = 0; i < dates.length; i += 1) {
      setClockOffset(dates[i].getTime() - Date.now());
      const role = plan.actor(i, dates.length);
      const actor = role === 'client' && plan.userIdx !== null ? DEMO_CLIENT_USERS[plan.userIdx].userId : TRAINER_ID;
      const { programs } = await call(TRAINER_ID, 'GET', '/api/programs');
      const p = programs.find((x: any) => x.id === program.id);
      const dayId = p.nextDayId || p.days[0].id;
      const w = await call(actor, 'GET', '/api/workout/' + TRAINER_ID + '/' + program.id + '/' + dayId);
      const last = i === dates.length - 1;
      const exercises = w.day.exercises.map((e: any, exIdx: number) => {
        const mult = isLower(e.exerciseId) ? plan.lowerMult : plan.upper;
        const stalled = plan.stall && plan.stall.ids.includes(e.exerciseId) && i >= plan.stall.after;
        let sets;
        if (stalled && e.previousSets.length) {
          sets = e.previousSets.map((s: any) => ({ ...s, rir: null }));
        } else if (!e.previousSets.length) {
          // Stacks and cables are logged in plates (about 6,5 kg each).
          const kg = e.exerciseId in base ? base[e.exerciseId] * mult : 0;
          const wt = !kg ? 0 : isStack(e) ? Math.max(1, Math.round(kg / 6.5)) : roundW(kg);
          sets = Array.from({ length: e.sets }, () => ({ weight: wt, reps: e.repMin + 1 + Math.floor(rand() * 2), rir: null }));
        } else {
          const sug = suggestNext(e, e.previousSets);
          sets = sug.reps.map((target) => {
            const miss = rand() < (sug.kind === 'increase' ? 0.35 : 0.2);
            return { weight: sug.weight, reps: Math.max(1, target - (miss ? 1 : 0)), rir: rand() < 0.2 ? e.targetRir : null };
          });
        }
        if (last && plan.drop && exIdx === 0)
          sets = sets.map((s: any) => ({ ...s, reps: Math.max(1, s.reps - 3) }));
        return { exerciseId: e.exerciseId, exerciseName: e.exerciseName, sets };
      });
      const draft = await call(actor, 'POST', '/api/draft', {
        trainerId: TRAINER_ID,
        programId: program.id,
        dayId,
        baseRevision: w.revision,
        exercises,
      });
      await call(actor, 'POST', '/api/sessions', {
        trainerId: TRAINER_ID,
        programId: program.id,
        dayId,
        baseRevision: draft.revision,
        feedback: i === dates.length - 1 && role === 'client' ? 'Ягодичный мост шёл тяжело, в остальном хорошо.' : '',
        localDate: localDate(dates[i]),
        exercises,
      });
    }

    setClockOffset(0);
    if (plan.inGym)
      await call(TRAINER_ID, 'POST', '/api/attendance', { clientId: client.clientId, present: true, localDate: localDate() });
    if (plan.openDraft) {
      const { programs } = await call(TRAINER_ID, 'GET', '/api/programs');
      const p = programs.find((x: any) => x.id === program.id);
      const w = await call(TRAINER_ID, 'GET', '/api/workout/' + TRAINER_ID + '/' + program.id + '/' + p.nextDayId);
      const exercises = w.day.exercises.map((e: any, idx: number) => {
        const sug = suggestNext(e, e.previousSets);
        return {
          exerciseId: e.exerciseId,
          exerciseName: e.exerciseName,
          sets: Array.from({ length: e.sets }, (_, si) => ({
            weight: sug.weight,
            reps: idx < 2 && si < (idx === 0 ? e.sets : 1) ? sug.reps[si] : 0,
            rir: null,
          })),
        };
      });
      await call(TRAINER_ID, 'POST', '/api/draft', {
        trainerId: TRAINER_ID,
        programId: program.id,
        dayId: p.nextDayId,
        baseRevision: w.revision,
        exercises,
      });
    }
  }
  setClockOffset(0);
}
