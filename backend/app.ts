import { catalog } from '../src/catalog';
import { groupMuscles, exerciseRules, programIssue } from '../src/trainingRules';
import { clientInsights, type ClientInsights } from '../src/analytics';
import { nowIso } from '../src/clock';

// The request logic is written against this small surface so the same code runs
// on Supabase (backend/server.ts) and in the demo build (in-browser database).
export interface Db {
  list<T>(
    table: string,
    opts?: { limit?: number; nextToken?: string },
  ): Promise<{ items: Array<T & { id: string }>; nextToken?: string | null }>;
  get<T>(table: string, ids: string[]): Promise<Array<T | null | undefined>>;
  add<T>(table: string, records: T[]): Promise<Array<string | null | undefined>>;
  update<T>(table: string, rows: Array<{ id: string; record: T }>): Promise<boolean[]>;
}
export interface Ctx {
  user?: { userId: string; name?: string; email?: string } | null;
  body: any;
  params: Record<string, string>;
  query: Record<string, string | undefined>;
}
export interface Sdk {
  db: Db;
  error: (message: string, status?: number) => any;
  json: (data: unknown, status?: number) => any;
  requireAuth: () => any;
  router: (routes: Record<string, any[]>) => any;
}

type Role = 'trainer' | 'client';

interface Profile {
  role: Role;
  name: string;
  email: string;
}
export interface ClientNotes {
  goal?: string;
  limits?: string;
  notes?: string;
}
interface ClientRecord {
  clientId: string;
  clientName: string;
  clientEmail: string;
  /** Account linked to this client; absent for clients without the app. Legacy records use clientId as the account id. */
  userId?: string | null;
  connectedAt: string;
  createdAt?: string;
  checkedInAt?: string | null;
  visits?: string[];
  latestSessionId?: string;
  latestCompletedAt?: string;
  needsReview?: boolean;
  notes?: ClientNotes;
  insights?: ClientInsights;
  archived?: boolean;
}
interface CoachRecord {
  trainerId: string;
  trainerName: string;
  connectedAt: string;
  /** The trainer's client key for this account; legacy records omit it (key = account id). */
  clientId?: string;
}
interface Exercise {
  id: string;
  name: string;
  muscleGroup: string;
  equipment: string;
  muscles?: string[];
  custom?: boolean;
}
interface ProgramExercise {
  muscles?: string[];
  exerciseId: string;
  exerciseName: string;
  sets: number;
  repMin: number;
  repMax: number;
  targetRir: number;
}
interface ProgramDay {
  id: string;
  name: string;
  exercises: ProgramExercise[];
}
interface ProgramRecord {
  nextDayId?: string;
  lastCompletedAt?: string;
  lastRecordedByRole?: Role;
  trainerId: string;
  trainerName: string;
  clientId: string;
  clientName: string;
  name: string;
  days: ProgramDay[];
  createdAt: string;
  updatedAt?: string;
  archived?: boolean;
}
interface AssignmentRecord {
  trainerId: string;
  trainerName: string;
  programId: string;
  programName: string;
  assignedAt: string;
}
interface InviteRecord {
  trainerId: string;
  trainerName: string;
  clientName: string;
  clientId?: string;
  createdAt: string;
  usedBy: string | null;
}
interface SetEntry {
  weight: number;
  reps: number;
  rir: number | null;
}
interface SessionExercise {
  exerciseId: string;
  exerciseName: string;
  /** Planned exercise this one stands in for during a single workout (the program is unchanged). */
  replaces?: string;
  sets: SetEntry[];
}
interface SessionRecord {
  recordedByRole?: Role;
  recordedByName?: string;
  feedback?: string;
  trainerId: string;
  programId: string;
  programName: string;
  dayId: string;
  dayName: string;
  completedAt: string;
  exercises: SessionExercise[];
}
interface DraftRecord {
  revision?: string;
  closed?: boolean;
  feedback?: string;
  updatedByRole?: Role;
  exercises: SessionExercise[];
  updatedAt: string;
}

const tableKey = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '_');
const profileTable = (userId: string) => 'profile:' + tableKey(userId);
const clientsTable = (trainerId: string) => 'clients:' + tableKey(trainerId);
const coachesTable = (userId: string) => 'coaches:' + tableKey(userId);
const programsTable = (trainerId: string) => 'programs:' + tableKey(trainerId);
const assignmentsTable = (clientId: string) => 'assignments:' + tableKey(clientId);
const sessionsTable = (clientId: string) => 'sessions:' + tableKey(clientId);
const customExercisesTable = (trainerId: string) => 'custom_exercises:' + tableKey(trainerId);
const inviteTable = (code: string) => 'invite:' + tableKey(code);
const lastResultTable = (clientId: string, exerciseId: string) =>
  'last:' + tableKey(clientId) + ':' + tableKey(exerciseId);
const draftTable = (clientId: string, programId: string, dayId: string) =>
  'draft:' + tableKey(clientId) + ':' + tableKey(programId) + ':' + tableKey(dayId);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const cleanNumber = (value: unknown, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const text = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);
const validRole = (value: unknown): value is Role => value === 'trainer' || value === 'client';
const validSet = (s: any) =>
  s &&
  Number.isFinite(s.weight) &&
  s.weight >= 0 &&
  s.weight <= 1500 &&
  Number.isInteger(s.reps) &&
  s.reps >= 0 &&
  s.reps <= 1000 &&
  (s.rir === null || s.rir === undefined || (Number.isFinite(s.rir) && s.rir >= 0 && s.rir <= 10));
const cleanSet = (s: any): SetEntry => ({
  weight: Math.max(0, cleanNumber(s.weight)),
  reps: Math.max(0, Math.round(cleanNumber(s.reps))),
  rir: s.rir === null || s.rir === undefined ? null : Math.max(0, Math.min(10, Math.round(cleanNumber(s.rir)))),
});
const randomId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export function createHandler({ db, error, json, requireAuth, router }: Sdk) {
  async function listAll<T>(table: string, max = 1000) {
    const items: Array<T & { id: string }> = [];
    let nextToken: string | undefined;
    do {
      const page = await db.list<T>(table, { limit: 100, nextToken });
      items.push(...page.items);
      nextToken = page.nextToken || undefined;
    } while (nextToken && items.length < max);
    return items;
  }
  async function first<T>(table: string) {
    const { items } = await db.list<T>(table, { limit: 1 });
    return items[0];
  }
  async function upsertSingle<T>(table: string, record: T) {
    const current = await first<T>(table);
    if (current) {
      const [ok] = await db.update(table, [{ id: current.id, record }]);
      if (!ok) throw new Error('Не удалось сохранить');
    } else {
      const [id] = await db.add(table, [record]);
      if (!id) throw new Error('Не удалось сохранить');
    }
  }
  async function getProfile(userId: string): Promise<Profile | null> {
    const p = await first<Profile>(profileTable(userId));
    return p ? { role: p.role, name: p.name, email: p.email } : null;
  }
  const clientsOf = (trainerId: string) => listAll<ClientRecord>(clientsTable(trainerId));
  async function findClient(trainerId: string, clientId: string) {
    return (await clientsOf(trainerId)).find((c) => c.clientId === clientId);
  }
  async function saveClient(trainerId: string, client: ClientRecord & { id: string }, patch: Partial<ClientRecord>) {
    const { id, ...record } = client;
    const [ok] = await db.update(clientsTable(trainerId), [{ id, record: { ...record, ...patch } }]);
    return ok;
  }
  /** Client keys of an account at each of its trainers. */
  async function keysOf(userId: string) {
    const coaches = await listAll<CoachRecord>(coachesTable(userId), 50);
    return coaches.map((c) => ({ ...c, clientId: c.clientId || userId }));
  }
  async function hasAssignment(clientId: string, trainerId: string, programId: string) {
    const items = await listAll<AssignmentRecord>(assignmentsTable(clientId));
    return items.some((i) => i.trainerId === trainerId && i.programId === programId);
  }
  // Ownership comes from the stored program, never from a submitted client ID.
  async function workoutOwner(userId: string, trainerId: string, programId: string) {
    const [program] = await db.get<ProgramRecord>(programsTable(trainerId), [programId]);
    if (!program || program.trainerId !== trainerId) return null;
    const profile = await getProfile(userId);
    if (!profile) return null;
    let permitted = false;
    if (profile.role === 'trainer') {
      permitted = userId === trainerId && !!(await findClient(trainerId, program.clientId));
    } else {
      permitted =
        !program.archived &&
        (await keysOf(userId)).some((k) => k.trainerId === trainerId && k.clientId === program.clientId);
    }
    if (!permitted || !(await hasAssignment(program.clientId, trainerId, programId))) return null;
    return { program, ownerId: program.clientId, role: profile.role, name: profile.name };
  }
  const withVisit = (visits: string[] | undefined, date: string) =>
    Array.from(new Set([...(visits || []), date])).sort().slice(-180);

  const exerciseRecord = (body: any, name: string) => ({
    name,
    muscleGroup: text(body?.muscleGroup, 60) || 'Другое',
    equipment: text(body?.equipment, 60) || 'Другое',
    muscles: Array.isArray(body?.muscles) ? body.muscles.map(String).slice(0, 6) : [],
  });

  async function customExercises(trainerId: string): Promise<Exercise[]> {
    const items = await listAll<Omit<Exercise, 'id'>>(customExercisesTable(trainerId), 500);
    return items.map((item) => ({
      id: 'custom:' + item.id,
      name: item.name,
      muscleGroup: item.muscleGroup,
      equipment: item.equipment,
      muscles: item.muscles,
      custom: true,
    }));
  }

  /**
   * Matches submitted workout exercises to the day's plan, one per planned exercise.
   * An entry may swap in another known exercise via `replaces`; names always come from the server.
   * Returns null when the list does not fit the plan.
   */
  async function matchPlan(trainerId: string, day: ProgramDay, submitted: SessionExercise[]) {
    if (submitted.length !== day.exercises.length) return null;
    const slots = submitted.map((e) => String(e.replaces || e.exerciseId));
    if (new Set(slots).size !== slots.length || slots.some((id) => !day.exercises.some((p) => p.exerciseId === id))) return null;
    let custom: Exercise[] | null = null;
    const out: SessionExercise[] = [];
    for (const e of submitted) {
      const planned = day.exercises.find((p) => p.exerciseId === String(e.replaces || e.exerciseId))!;
      const id = String(e.exerciseId);
      if (id === planned.exerciseId) {
        out.push({ exerciseId: planned.exerciseId, exerciseName: planned.exerciseName, sets: e.sets });
        continue;
      }
      if (day.exercises.some((p) => p.exerciseId === id)) return null;
      let known: { id: string; name: string } | undefined = catalog.find((c) => c.id === id);
      if (!known && id.startsWith('custom:')) {
        custom ||= await customExercises(trainerId);
        known = custom.find((c) => c.id === id);
      }
      if (!known) return null;
      out.push({ exerciseId: id, exerciseName: known.name, replaces: planned.exerciseId, sets: e.sets });
    }
    if (new Set(out.map((e) => e.exerciseId)).size !== out.length) return null;
    return out;
  }

  /** Looks up equipment (plates or kilograms in the journal) for catalog and the trainer's own exercises. */
  function equipmentLookup(trainerId: string) {
    let custom: Promise<Exercise[]> | null = null;
    return async (exerciseId: string) => {
      const known = catalog.find((c) => c.id === exerciseId);
      if (known) return known.equipment;
      if (!exerciseId.startsWith('custom:')) return '';
      custom ||= customExercises(trainerId);
      return (await custom).find((c) => c.id === exerciseId)?.equipment || '';
    };
  }

  /** Validates and normalises submitted program days. Returns an error string or clean days. */
  async function cleanDays(trainerId: string, input: unknown): Promise<string | ProgramDay[]> {
    const days = Array.isArray(input) ? (input as ProgramDay[]) : [];
    if (!days.length || days.length > 14) return 'Добавьте от 1 до 14 тренировок.';
    if (days.some((d) => !d?.name?.trim() || !Array.isArray(d.exercises) || !d.exercises.length))
      return 'Добавьте название и упражнения в каждую тренировку.';
    if (
      days.some(
        (d) =>
          d.exercises.length > 30 ||
          d.exercises.some(
            (e) =>
              !Number.isInteger(e.sets) ||
              e.sets < 1 ||
              e.sets > 10 ||
              !Number.isInteger(e.repMin) ||
              !Number.isInteger(e.repMax) ||
              e.repMin < 1 ||
              e.repMax < e.repMin ||
              e.repMax > 1000 ||
              !Number.isFinite(e.targetRir) ||
              e.targetRir < 0 ||
              e.targetRir > 6,
          ),
      )
    )
      return 'Проверьте подходы (1–10), диапазон повторов и RIR (0–6).';
    const available: Exercise[] = [...catalog, ...(await customExercises(trainerId))];
    if (days.some((d) => d.exercises.some((e) => !available.some((k) => k.id === e.exerciseId))))
      return 'Выберите упражнения из доступной базы.';
    const seen = new Set<string>();
    const cleaned = days.map((day, i) => {
      let id = String(day.id || '').trim().slice(0, 80) || 'day-' + (i + 1);
      if (seen.has(id)) id = 'day-' + randomId();
      seen.add(id);
      return {
        id,
        name: day.name.trim().slice(0, 80),
        exercises: day.exercises.map((e) => {
          const known = available.find((k) => k.id === e.exerciseId)!;
          return {
            exerciseId: String(e.exerciseId),
            exerciseName: known.name,
            muscles:
              exerciseRules[e.exerciseId]?.primary ||
              (Array.isArray(e.muscles) && e.muscles.length
                ? e.muscles.map(String).slice(0, 6)
                : known.muscles?.length
                  ? known.muscles
                  : groupMuscles(known.muscleGroup)),
            sets: Math.round(cleanNumber(e.sets, 3)),
            repMin: Math.round(cleanNumber(e.repMin, 8)),
            repMax: Math.round(cleanNumber(e.repMax, 12)),
            targetRir: Math.max(0, Math.min(6, Math.round(cleanNumber(e.targetRir, 2)))),
          };
        }),
      };
    });
    const issue = programIssue(cleaned);
    return issue || cleaned;
  }

  async function refreshInsights(trainerId: string, clientId: string, patch: Partial<ClientRecord> = {}) {
    const client = await findClient(trainerId, clientId);
    if (!client) return;
    const sessions = (await listAll<SessionRecord>(sessionsTable(clientId), 400)).filter(
      (s) => s.trainerId === trainerId,
    );
    await saveClient(trainerId, client, {
      ...patch,
      visits: patch.visits || client.visits,
      insights: clientInsights(sessions, new Date(nowIso()).getTime()),
    });
  }

  const trainerOnly = async (ctx: Ctx) => {
    const profile = await getProfile(ctx.user!.userId);
    return profile?.role === 'trainer' ? profile : null;
  };

  return router({
    'GET /api/_healthcheck': [async () => json({ message: 'Success' })],

    'GET /api/me': [
      requireAuth(),
      async (ctx: Ctx) => json({ profile: await getProfile(ctx.user!.userId) }),
    ],

    'POST /api/profile': [
      requireAuth(),
      async (ctx: Ctx) => {
        if (!validRole(ctx.body?.role)) return error('Выберите роль тренера или клиента.', 400);
        const existing = await first<Profile>(profileTable(ctx.user!.userId));
        if (existing) return json({ profile: existing });
        const profile: Profile = {
          role: ctx.body.role,
          name:
            text(ctx.body.name, 60) ||
            ctx.user!.name ||
            (ctx.user!.email || '').split('@')[0] ||
            (ctx.body.role === 'trainer' ? 'Тренер' : 'Клиент'),
          email: ctx.user!.email || '',
        };
        const [id] = await db.add(profileTable(ctx.user!.userId), [profile]);
        return id ? json({ profile }) : error('Не удалось создать профиль.', 500);
      },
    ],

    'GET /api/clients': [
      requireAuth(),
      async (ctx: Ctx) => {
        if (!(await trainerOnly(ctx))) return error('Доступ только для тренера.', 403);
        const clients = (await clientsOf(ctx.user!.userId)).map(({ id: _id, ...c }) => ({
          ...c,
          userId: c.userId === undefined ? c.clientId : c.userId,
        }));
        return json({ clients });
      },
    ],

    'POST /api/clients': [
      requireAuth(),
      async (ctx: Ctx) => {
        if (!(await trainerOnly(ctx))) return error('Доступ только для тренера.', 403);
        const clientName = text(ctx.body?.clientName, 80);
        if (!clientName) return error('Введите имя клиента.', 400);
        const at = nowIso();
        const client: ClientRecord = {
          clientId: 'c-' + randomId(),
          clientName,
          clientEmail: '',
          userId: null,
          connectedAt: at,
          createdAt: at,
          visits: [],
          checkedInAt: null,
          notes: { goal: text(ctx.body?.goal, 300) },
        };
        const [id] = await db.add(clientsTable(ctx.user!.userId), [client]);
        return id ? json({ client }, 201) : error('Не удалось добавить клиента.', 500);
      },
    ],

    'POST /api/client/:clientId/update': [
      requireAuth(),
      async (ctx: Ctx) => {
        if (!(await trainerOnly(ctx))) return error('Доступ только для тренера.', 403);
        const client = await findClient(ctx.user!.userId, ctx.params.clientId);
        if (!client) return error('Клиент не найден.', 404);
        const b = ctx.body || {};
        const patch: Partial<ClientRecord> = {};
        if (b.clientName !== undefined) {
          const name = text(b.clientName, 80);
          if (!name) return error('Имя не может быть пустым.', 400);
          patch.clientName = name;
        }
        if (b.notes)
          patch.notes = { goal: text(b.notes.goal, 300), limits: text(b.notes.limits, 500), notes: text(b.notes.notes, 2000) };
        if (typeof b.archived === 'boolean') patch.archived = b.archived;
        const ok = await saveClient(ctx.user!.userId, client, patch);
        return ok ? json({ saved: true }) : error('Не удалось сохранить.', 500);
      },
    ],

    'POST /api/invites': [
      requireAuth(),
      async (ctx: Ctx) => {
        const profile = await trainerOnly(ctx);
        if (!profile) return error('Доступ только для тренера.', 403);
        let clientId = text(ctx.body?.clientId, 100);
        let clientName = text(ctx.body?.clientName, 80);
        if (clientId) {
          const client = await findClient(ctx.user!.userId, clientId);
          if (!client) return error('Клиент не найден.', 404);
          if (client.userId || client.userId === undefined) return error('Клиент уже подключён к приложению.', 409);
          clientName = client.clientName;
        } else {
          if (!clientName) return error('Введите имя клиента.', 400);
          const at = nowIso();
          const client: ClientRecord = {
            clientId: 'c-' + randomId(),
            clientName,
            clientEmail: '',
            userId: null,
            connectedAt: at,
            createdAt: at,
            visits: [],
          };
          const [id] = await db.add(clientsTable(ctx.user!.userId), [client]);
          if (!id) return error('Не удалось добавить клиента.', 500);
          clientId = client.clientId;
        }
        let code = '';
        for (let attempt = 0; attempt < 6 && !code; attempt += 1) {
          const candidate = Math.random().toString(36).slice(2, 8).toUpperCase();
          if (candidate.length === 6 && !(await first(inviteTable(candidate)))) code = candidate;
        }
        if (!code) return error('Не удалось создать код. Попробуйте ещё раз.', 500);
        const [id] = await db.add(inviteTable(code), [
          { trainerId: ctx.user!.userId, trainerName: profile.name, clientName, clientId, createdAt: nowIso(), usedBy: null } satisfies InviteRecord,
        ]);
        return id ? json({ code, clientId }) : error('Не удалось сохранить код.', 500);
      },
    ],

    'POST /api/connect': [
      requireAuth(),
      async (ctx: Ctx) => {
        const userId = ctx.user!.userId;
        const profile = await getProfile(userId);
        if (profile?.role !== 'client') return error('Подключение по коду доступно клиенту.', 403);
        const code = text(ctx.body?.code, 10).toUpperCase();
        if (code.length !== 6) return error('Неверный код.', 400);
        const invite = await first<InviteRecord>(inviteTable(code));
        if (!invite) return error('Код не найден.', 404);
        if (invite.usedBy) return error('Этот код уже использован.', 409);
        if ((await keysOf(userId)).some((k) => k.trainerId === invite.trainerId))
          return error('Вы уже подключены к этому тренеру.', 409);
        const connectedAt = nowIso();
        let clientKey = userId;
        if (invite.clientId) {
          const client = await findClient(invite.trainerId, invite.clientId);
          if (!client) return error('Тренер удалил этого клиента.', 404);
          if (client.userId) return error('Этот клиент уже подключён.', 409);
          clientKey = client.clientId;
          await saveClient(invite.trainerId, client, { userId, clientEmail: profile.email, connectedAt });
        } else {
          const [link] = await db.add(clientsTable(invite.trainerId), [
            { clientId: userId, userId, clientName: invite.clientName || profile.name, clientEmail: profile.email, connectedAt } satisfies ClientRecord,
          ]);
          if (!link) return error('Не удалось подключить клиента.', 500);
        }
        const [coachLink] = await db.add(coachesTable(userId), [
          { trainerId: invite.trainerId, trainerName: invite.trainerName, connectedAt, clientId: clientKey } satisfies CoachRecord,
        ]);
        if (!coachLink) return error('Не удалось подключить тренера.', 500);
        const { id, ...record } = invite;
        await db.update(inviteTable(code), [{ id, record: { ...record, usedBy: userId } }]);
        return json({ connected: true, trainerName: invite.trainerName });
      },
    ],

    'POST /api/attendance': [
      requireAuth(),
      async (ctx: Ctx) => {
        const userId = ctx.user!.userId;
        const profile = await getProfile(userId);
        const b = ctx.body || {};
        if (typeof b.present !== 'boolean') return error('Некорректная отметка', 400);
        let trainerId: string | undefined;
        let clientId: string | undefined;
        if (profile?.role === 'trainer') {
          trainerId = userId;
          clientId = b.clientId;
        } else if (profile?.role === 'client') {
          const key = (await keysOf(userId)).find((k) => k.trainerId === b.trainerId);
          trainerId = key?.trainerId;
          clientId = key?.clientId;
        }
        if (!trainerId || !clientId) return error('Нет доступа', 403);
        const client = await findClient(trainerId, clientId);
        if (!client) return error('Нет доступа', 403);
        const checkedInAt = b.present ? nowIso() : null;
        const date = DATE_RE.test(b.localDate || '') ? b.localDate : nowIso().slice(0, 10);
        const ok = await saveClient(trainerId, client, {
          checkedInAt,
          visits: b.present ? withVisit(client.visits, date) : client.visits || [],
        });
        return ok ? json({ checkedInAt }) : error('Отметка не сохранена', 500);
      },
    ],

    'POST /api/client/:clientId/review': [
      requireAuth(),
      async (ctx: Ctx) => {
        if (!(await trainerOnly(ctx))) return error('Доступ только для тренера.', 403);
        const client = await findClient(ctx.user!.userId, ctx.params.clientId);
        if (!client) return error('Нет доступа.', 403);
        if (!ctx.body?.sessionId || ctx.body.sessionId !== client.latestSessionId)
          return error('Появилась новая тренировка. Обновите историю.', 409);
        const ok = await saveClient(ctx.user!.userId, client, { needsReview: false });
        return ok ? json({ reviewed: true }) : error('Не удалось отметить просмотр.', 500);
      },
    ],

    'GET /api/client/:clientId/history': [
      requireAuth(),
      async (ctx: Ctx) => {
        if (!(await trainerOnly(ctx))) return error('Доступ только для тренера.', 403);
        const clientId = ctx.params.clientId;
        if (!(await findClient(ctx.user!.userId, clientId))) return error('Этот клиент не подключён к вам.', 403);
        const sessions = (await listAll<SessionRecord>(sessionsTable(clientId), 400))
          .filter((s) => s.trainerId === ctx.user!.userId)
          .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
        return json({ sessions });
      },
    ],

    'GET /api/my-history': [
      requireAuth(),
      async (ctx: Ctx) => {
        const keys = await keysOf(ctx.user!.userId);
        const tables = Array.from(new Set([ctx.user!.userId, ...keys.map((k) => k.clientId)]));
        const lists = await Promise.all(tables.map((k) => listAll<SessionRecord>(sessionsTable(k), 400)));
        const sessions = lists.flat().sort((a, b) => b.completedAt.localeCompare(a.completedAt));
        return json({ sessions });
      },
    ],

    'GET /api/exercises': [
      requireAuth(),
      async (ctx: Ctx) => {
        const profile = await getProfile(ctx.user!.userId);
        if (!profile) return error('Сначала создайте профиль.', 400);
        if (profile.role !== 'trainer') return json({ exercises: catalog });
        return json({ exercises: [...catalog, ...(await customExercises(ctx.user!.userId))] });
      },
    ],

    'POST /api/exercises': [
      requireAuth(),
      async (ctx: Ctx) => {
        if (!(await trainerOnly(ctx))) return error('Доступ только для тренера.', 403);
        const name = text(ctx.body?.name, 100);
        if (!name) return error('Введите название упражнения.', 400);
        const record = exerciseRecord(ctx.body, name);
        const [id] = await db.add(customExercisesTable(ctx.user!.userId), [record]);
        return id
          ? json({ exercise: { id: 'custom:' + id, ...record, custom: true } }, 201)
          : error('Не удалось добавить упражнение.', 500);
      },
    ],

    'POST /api/exercises/:id': [
      requireAuth(),
      async (ctx: Ctx) => {
        if (!(await trainerOnly(ctx))) return error('Доступ только для тренера.', 403);
        const id = ctx.params.id.replace(/^custom:/, '');
        const table = customExercisesTable(ctx.user!.userId);
        const [current] = await db.get<Omit<Exercise, 'id'>>(table, [id]);
        if (!current) return error('Упражнение не найдено.', 404);
        const name = text(ctx.body?.name, 100);
        if (!name) return error('Введите название упражнения.', 400);
        const record = exerciseRecord(ctx.body, name);
        const [ok] = await db.update(table, [{ id, record }]);
        return ok
          ? json({ exercise: { id: 'custom:' + id, ...record, custom: true } })
          : error('Не удалось сохранить упражнение.', 500);
      },
    ],

    'GET /api/programs': [
      requireAuth(),
      async (ctx: Ctx) => {
        if (!(await trainerOnly(ctx))) return error('Доступ только для тренера.', 403);
        const programs = (await listAll<ProgramRecord>(programsTable(ctx.user!.userId))).sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt),
        );
        return json({ programs });
      },
    ],

    'POST /api/programs': [
      requireAuth(),
      async (ctx: Ctx) => {
        const profile = await trainerOnly(ctx);
        if (!profile) return error('Доступ только для тренера.', 403);
        const clientId = text(ctx.body?.clientId, 100);
        const name = text(ctx.body?.name, 100);
        if (!clientId || !name) return error('Укажите клиента и название программы.', 400);
        const client = await findClient(ctx.user!.userId, clientId);
        if (!client) return error('Клиент не найден.', 404);
        const days = await cleanDays(ctx.user!.userId, ctx.body?.days);
        if (typeof days === 'string') return error(days, 400);
        const at = nowIso();
        const record: ProgramRecord = {
          trainerId: ctx.user!.userId,
          trainerName: profile.name,
          clientId,
          clientName: client.clientName,
          name,
          days,
          createdAt: at,
          updatedAt: at,
        };
        const [programId] = await db.add(programsTable(ctx.user!.userId), [record]);
        if (!programId) return error('Не удалось сохранить программу.', 500);
        const [assignmentId] = await db.add(assignmentsTable(clientId), [
          { trainerId: ctx.user!.userId, trainerName: profile.name, programId, programName: name, assignedAt: at } satisfies AssignmentRecord,
        ]);
        if (!assignmentId) return error('Программа сохранена, но не назначена клиенту.', 500);
        return json({ program: { id: programId, ...record } }, 201);
      },
    ],

    'POST /api/programs/:programId': [
      requireAuth(),
      async (ctx: Ctx) => {
        if (!(await trainerOnly(ctx))) return error('Доступ только для тренера.', 403);
        const trainerId = ctx.user!.userId;
        const programId = ctx.params.programId;
        const [program] = await db.get<ProgramRecord>(programsTable(trainerId), [programId]);
        if (!program || program.trainerId !== trainerId) return error('Программа не найдена.', 404);
        const name = text(ctx.body?.name, 100);
        if (!name) return error('Введите название программы.', 400);
        const days = await cleanDays(trainerId, ctx.body?.days);
        if (typeof days === 'string') return error(days, 400);
        const nextDayId = days.some((d) => d.id === program.nextDayId) ? program.nextDayId : days[0].id;
        const { id: _drop, ...rest } = program as ProgramRecord & { id?: string };
        const [ok] = await db.update(programsTable(trainerId), [
          { id: programId, record: { ...rest, name, days, nextDayId, updatedAt: nowIso() } },
        ]);
        if (!ok) return error('Не удалось сохранить программу.', 500);
        const assignment = (await listAll<AssignmentRecord>(assignmentsTable(program.clientId))).find(
          (a) => a.programId === programId,
        );
        if (assignment && assignment.programName !== name) {
          const { id, ...record } = assignment;
          await db.update(assignmentsTable(program.clientId), [{ id, record: { ...record, programName: name } }]);
        }
        return json({ program: { id: programId, ...rest, name, days, nextDayId } });
      },
    ],

    'POST /api/programs/:programId/archive': [
      requireAuth(),
      async (ctx: Ctx) => {
        if (!(await trainerOnly(ctx))) return error('Доступ только для тренера.', 403);
        const trainerId = ctx.user!.userId;
        const [program] = await db.get<ProgramRecord>(programsTable(trainerId), [ctx.params.programId]);
        if (!program || program.trainerId !== trainerId) return error('Программа не найдена.', 404);
        const { id: _drop, ...rest } = program as ProgramRecord & { id?: string };
        const [ok] = await db.update(programsTable(trainerId), [
          { id: ctx.params.programId, record: { ...rest, archived: !!ctx.body?.archived } },
        ]);
        return ok ? json({ saved: true }) : error('Не удалось сохранить.', 500);
      },
    ],

    'GET /api/my-programs': [
      requireAuth(),
      async (ctx: Ctx) => {
        const userId = ctx.user!.userId;
        const profile = await getProfile(userId);
        if (profile?.role !== 'client') return error('Доступ только для клиента.', 403);
        const keys = await keysOf(userId);
        const programs: Array<ProgramRecord & { id: string }> = [];
        const coaches = [];
        for (const key of keys) {
          const assignments = await listAll<AssignmentRecord>(assignmentsTable(key.clientId));
          for (const a of assignments) {
            if (a.trainerId !== key.trainerId) continue;
            const [program] = await db.get<ProgramRecord>(programsTable(a.trainerId), [a.programId]);
            if (program && program.clientId === key.clientId && !program.archived)
              programs.push({ ...program, id: a.programId });
          }
          const client = await findClient(key.trainerId, key.clientId);
          coaches.push({
            trainerId: key.trainerId,
            trainerName: key.trainerName,
            checkedInAt: client?.checkedInAt || null,
            visits: client?.visits || [],
          });
        }
        programs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return json({ coaches, programs });
      },
    ],

    'GET /api/workout/:trainerId/:programId/:dayId': [
      requireAuth(),
      async (ctx: Ctx) => {
        const { trainerId, programId, dayId } = ctx.params;
        const access = await workoutOwner(ctx.user!.userId, trainerId, programId);
        if (!access) return error('Нет доступа к тренировке.', 403);
        const { program, ownerId } = access;
        const day = program.days.find((d) => d.id === dayId);
        if (!day) return error('Тренировка не найдена.', 404);
        const equipmentOf = equipmentLookup(trainerId);
        const exercises = await Promise.all(
          day.exercises.map(async (e) => {
            const last = await first<{ sets: SetEntry[]; completedAt?: string }>(lastResultTable(ownerId, e.exerciseId));
            return {
              ...e,
              equipment: await equipmentOf(e.exerciseId),
              previousSets: last?.sets || [],
              previousAt: last?.completedAt || null,
            };
          }),
        );
        const draft = await first<DraftRecord>(draftTable(ownerId, programId, dayId));
        return json({
          draft: draft?.closed ? null : draft || null,
          revision: draft?.revision || null,
          ownerId,
          ownerName: program.clientName,
          actorRole: access.role,
          programId,
          programName: program.name,
          trainerId,
          days: program.days.map((d) => ({ id: d.id, name: d.name })),
          nextDayId: program.nextDayId || program.days[0]?.id,
          day: { ...day, exercises },
        });
      },
    ],

    'GET /api/previous/:trainerId/:programId/:exerciseId': [
      requireAuth(),
      async (ctx: Ctx) => {
        const { trainerId, programId, exerciseId } = ctx.params;
        const access = await workoutOwner(ctx.user!.userId, trainerId, programId);
        if (!access) return error('Нет доступа к тренировке.', 403);
        const last = await first<{ sets: SetEntry[]; completedAt?: string }>(lastResultTable(access.ownerId, exerciseId));
        return json({
          equipment: await equipmentLookup(trainerId)(exerciseId),
          previousSets: last?.sets || [],
          previousAt: last?.completedAt || null,
        });
      },
    ],

    'POST /api/draft': [
      requireAuth(),
      async (ctx: Ctx) => {
        const b = ctx.body || {};
        if (!b.trainerId || !b.programId || !b.dayId || !Array.isArray(b.exercises))
          return error('Некорректный черновик', 400);
        const access = await workoutOwner(ctx.user!.userId, b.trainerId, b.programId);
        if (!access) return error('Нет доступа', 403);
        const day = access.program.days.find((d) => d.id === b.dayId);
        if (!day) return error('Тренировка не найдена', 404);
        const submitted = b.exercises as SessionExercise[];
        if (
          JSON.stringify(b).length > 100000 ||
          submitted.some((e) => !Array.isArray(e?.sets) || e.sets.length > 10 || !e.sets.every(validSet))
        )
          return error('Проверьте вес, повторы и RIR', 400);
        const exercises = await matchPlan(b.trainerId, day, submitted);
        if (!exercises) return error('Состав тренировки не совпадает с программой.', 400);
        const table = draftTable(access.ownerId, b.programId, b.dayId);
        const current = await first<DraftRecord>(table);
        if ((current?.revision || null) !== (b.baseRevision || null))
          return error('Запись уже изменена на другом устройстве. Обновите журнал перед продолжением.', 409);
        const updatedAt = nowIso();
        const revision = randomId();
        await upsertSingle<DraftRecord>(table, {
          exercises: exercises.map((e) => ({ ...e, sets: e.sets.map(cleanSet) })),
          updatedAt,
          revision,
          closed: false,
          feedback: text(b.feedback, 500),
          updatedByRole: access.role,
        });
        return json({ saved: true, updatedAt, revision });
      },
    ],

    'POST /api/sessions': [
      requireAuth(),
      async (ctx: Ctx) => {
        const b = ctx.body || {};
        const trainerId = text(b.trainerId, 200);
        const programId = text(b.programId, 200);
        const dayId = text(b.dayId, 200);
        if (!trainerId || !programId || !dayId || !Array.isArray(b.exercises))
          return error('Некорректные данные тренировки.', 400);
        const access = await workoutOwner(ctx.user!.userId, trainerId, programId);
        if (!access) return error('Нет доступа к тренировке.', 403);
        const { program, ownerId } = access;
        const table = draftTable(ownerId, programId, dayId);
        const current = await first<DraftRecord>(table);
        if (current?.closed || (current?.revision || null) !== (b.baseRevision || null))
          return error('Журнал изменён или уже завершён. Обновите его перед продолжением.', 409);
        const day = program.days.find((d) => d.id === dayId);
        if (!day) return error('Тренировка не найдена.', 404);
        const submitted = b.exercises as SessionExercise[];
        if (submitted.some((e) => !Array.isArray(e?.sets) || e.sets.length > 10 || !e.sets.every(validSet)))
          return error('Заполните корректно вес, повторы и RIR.', 400);
        const matched = await matchPlan(trainerId, day, submitted);
        if (!matched) return error('Состав тренировки не совпадает с программой.', 400);
        const performed = matched
          .map((e) => ({ ...e, sets: e.sets.filter((s) => s.reps > 0).map(cleanSet) }))
          .filter((e) => e.sets.length > 0);
        if (!performed.length) return error('Нет выполненных подходов. Черновик сохранён — продолжите позже.', 400);
        // A workout left unfinished on an earlier day can be recorded with its own date (up to 14 days back).
        const nowMs = new Date(nowIso()).getTime();
        const requested = typeof b.completedAt === 'string' ? Date.parse(b.completedAt) : NaN;
        const completedAt =
          Number.isFinite(requested) && requested <= nowMs + 60000 && requested >= nowMs - 14 * 86400000
            ? new Date(requested).toISOString()
            : nowIso();
        const session: SessionRecord = {
          recordedByRole: access.role,
          recordedByName: access.name,
          feedback: text(b.feedback, 500),
          trainerId,
          programId,
          programName: program.name,
          dayId,
          dayName: day.name,
          completedAt,
          exercises: performed,
        };
        const [sessionId] = await db.add(sessionsTable(ownerId), [session]);
        if (!sessionId) return error('Не удалось сохранить тренировку.', 500);
        for (const e of performed)
          await upsertSingle(lastResultTable(ownerId, e.exerciseId), { sets: e.sets, completedAt });
        await upsertSingle<DraftRecord>(table, { exercises: [], updatedAt: completedAt, closed: true, revision: randomId() });
        const client = await findClient(trainerId, ownerId);
        const date = DATE_RE.test(b.localDate || '') ? b.localDate : completedAt.slice(0, 10);
        await refreshInsights(trainerId, ownerId, {
          latestSessionId: sessionId,
          latestCompletedAt: completedAt,
          needsReview: access.role === 'client',
          visits: withVisit(client?.visits, date),
        });
        const idx = program.days.findIndex((d) => d.id === dayId);
        const nextDayId = program.days[(idx + 1) % program.days.length].id;
        const { id: _drop, ...rest } = program as ProgramRecord & { id?: string };
        const [updated] = await db.update(programsTable(trainerId), [
          { id: programId, record: { ...rest, nextDayId, lastCompletedAt: completedAt, lastRecordedByRole: access.role } },
        ]);
        return json(
          updated ? { saved: true, sessionId } : { saved: true, sessionId, warning: 'Результат сохранён. Следующий день выберите вручную.' },
          201,
        );
      },
    ],
  });
}
