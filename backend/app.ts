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
  remove(table: string, ids: string[]): Promise<void>;
}
export interface Ctx {
  user?: { userId: string; name?: string; email?: string } | null;
  body: any;
  params: Record<string, string>;
  query: Record<string, string | undefined>;
}
/** Creating sign-in accounts: only the server has the rights (the demo fakes it). */
export interface Accounts {
  /** A confirmed email + password account, so nobody waits for an email. */
  createUser(email: string, password: string): Promise<{ userId?: string; exists?: boolean }>;
  /** Owner only, for empty accounts: find an account by email and set its password (confirmed). */
  findUser(email: string): Promise<string | null>;
  setPassword(userId: string, password: string): Promise<void>;
}
/**
 * SHA-256 of the app owner's email (the address itself stays out of the code). The owner may give a password
 * to an existing but empty account, e.g. one made by mistake, since the built-in mail can't be relied on.
 */
const OWNER_EMAIL_HASHES = ['f459ed264a6d68118d4c01417c7fbb8c65c8671eb9765143cd341127c31100b0'];
async function isOwner(email?: string) {
  if (!email || typeof crypto === 'undefined' || !crypto.subtle) return false;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email.trim().toLowerCase()));
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return OWNER_EMAIL_HASHES.includes(hex);
}
export interface Sdk {
  db: Db;
  accounts?: Accounts;
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
  /** Hidden per-client program for workouts made up in the gym ("Свободная тренировка"). */
  free?: boolean;
  /** Free program only: exercises of the last free workout, to start the next one "как в прошлый раз". */
  lastFree?: FreeExercise[];
}
interface FreeExercise extends ExtraPlan {
  exerciseId: string;
  exerciseName: string;
  sets: number;
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
  /** Left out of this workout only; done sets still count. */
  skipped?: boolean;
  /** Added in the gym for this workout only, with its own targets (sets = sets.length). */
  extra?: ExtraPlan;
  /** Short comment on this exercise in this workout, e.g. "seat at 4, knee ok". */
  note?: string;
  /** Own exercise: its muscles at the time, so volume and history do not depend on the program staying. */
  muscles?: string[];
  sets: SetEntry[];
}
interface ExtraPlan {
  repMin: number;
  repMax: number;
  targetRir: number;
  /** Came over from another workout opened by mistake: for this workout only, never joins the program. */
  once?: boolean;
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

/** Body measurements of one client key, one row per date. */
const bodyTable = (clientId: string) => 'body:' + tableKey(clientId);
const bodyProfileTable = (clientId: string) => 'body_profile:' + tableKey(clientId);
const BODY_FIELDS = { weight: [20, 400], waist: [40, 250], neck: [20, 70], hips: [50, 250], steps: [0, 100000], kcal: [0, 15000] } as const;
type BodyField = keyof typeof BODY_FIELDS;
interface BodyEntry {
  date: string;
  weight?: number | null;
  waist?: number | null;
  neck?: number | null;
  hips?: number | null;
  /** Steps walked on that date (usually entered the next morning). */
  steps?: number | null;
  /** Calories eaten on that date. */
  kcal?: number | null;
  updatedAt: string;
  recordedByRole?: Role;
}
const ACTIVITY = ['low', 'light', 'moderate', 'high', 'extreme'];
interface BodyProfile {
  sex: 'm' | 'f';
  heightCm: number;
  birthYear: number;
  activity: string;
  updatedAt?: string;
}

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
/** Targets of an exercise added in the gym; null when they make no sense. */
const cleanExtra = (x: any): ExtraPlan | null => {
  const repMin = Math.round(Number(x?.repMin));
  const repMax = Math.round(Number(x?.repMax));
  const targetRir = Math.round(Number(x?.targetRir));
  if (!(repMin >= 1 && repMax >= repMin && repMax <= 100 && targetRir >= 0 && targetRir <= 6)) return null;
  return { repMin, repMax, targetRir, ...(x?.once === true ? { once: true } : {}) };
};
const randomId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export function createHandler({ db, accounts, error, json, requireAuth, router }: Sdk) {
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
    // The hidden program of free workouts is not assigned to the client; its trainer may use it.
    if (!permitted || (!(program.free && profile.role === 'trainer') && !(await hasAssignment(program.clientId, trainerId, programId)))) return null;
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
    const fromPlan = submitted.filter((e) => !e.extra);
    if (fromPlan.length !== day.exercises.length || submitted.length - fromPlan.length > 20) return null;
    const slots = fromPlan.map((e) => String(e.replaces || e.exerciseId));
    if (new Set(slots).size !== slots.length || slots.some((id) => !day.exercises.some((p) => p.exerciseId === id))) return null;
    const findKnown = knownExercises(trainerId);
    const out: SessionExercise[] = [];
    for (const e of submitted) {
      const id = String(e.exerciseId);
      const skipped = e.skipped === true ? { skipped: true } : {};
      const note = text(e.note, 200) ? { note: text(e.note, 200) } : {};
      if (e.extra) {
        const extra = cleanExtra(e.extra);
        const known = await findKnown(id);
        if (!extra || !known || day.exercises.some((p) => p.exerciseId === id)) return null;
        out.push({ exerciseId: id, exerciseName: known.name, extra, ...note, sets: e.sets });
        continue;
      }
      const planned = day.exercises.find((p) => p.exerciseId === String(e.replaces || e.exerciseId))!;
      if (id === planned.exerciseId) {
        out.push({ exerciseId: planned.exerciseId, exerciseName: planned.exerciseName, ...skipped, ...note, sets: e.sets });
        continue;
      }
      if (day.exercises.some((p) => p.exerciseId === id)) return null;
      const known = await findKnown(id);
      if (!known) return null;
      out.push({ exerciseId: id, exerciseName: known.name, replaces: planned.exerciseId, ...skipped, ...note, sets: e.sets });
    }
    if (new Set(out.map((e) => e.exerciseId)).size !== out.length) return null;
    return out;
  }

  /** Finds a catalog exercise or one of the trainer's own; own exercises are read once per call site. */
  function knownExercises(trainerId: string) {
    let custom: Promise<Exercise[]> | null = null;
    return async (id: string): Promise<Exercise | undefined> => {
      const known = catalog.find((c) => c.id === id);
      if (known || !id.startsWith('custom:')) return known;
      custom ||= customExercises(trainerId);
      return (await custom).find((c) => c.id === id);
    };
  }
  /** Program entry for `known` with the submitted targets; muscles from the rules, the trainer's choice or the group. */
  const toProgramExercise = (e: any, known: Exercise): ProgramExercise => ({
    exerciseId: known.id,
    exerciseName: known.name,
    muscles:
      exerciseRules[known.id]?.primary ||
      (Array.isArray(e.muscles) && e.muscles.length
        ? e.muscles.map(String).slice(0, 6)
        : known.muscles?.length
          ? known.muscles
          : groupMuscles(known.muscleGroup)),
    sets: Math.round(cleanNumber(e.sets, 3)),
    repMin: Math.round(cleanNumber(e.repMin, 8)),
    repMax: Math.round(cleanNumber(e.repMax, 12)),
    targetRir: Math.max(0, Math.min(6, Math.round(cleanNumber(e.targetRir, 2)))),
  });

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
          return toProgramExercise(e, known);
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

  /** True when an account holds nothing: no profile, a trainer without clients or programs, a client without trainers or workouts. */
  async function accountIsEmpty(userId: string) {
    const p = await getProfile(userId);
    if (!p) return true;
    if (p.role === 'trainer')
      return !(await db.list(clientsTable(userId), { limit: 1 })).items.length && !(await db.list(programsTable(userId), { limit: 1 })).items.length;
    return !(await keysOf(userId)).length && !(await db.list(sessionsTable(userId), { limit: 1 })).items.length;
  }

  /** Connects a client account to the trainer of an unused invite; returns an error text on failure. */
  async function connectByInvite(userId: string, profile: Profile, code: string, invite: InviteRecord & { id: string }) {
    if ((await keysOf(userId)).some((k) => k.trainerId === invite.trainerId)) return 'Вы уже подключены к этому тренеру.';
    const connectedAt = nowIso();
    let clientKey = userId;
    if (invite.clientId) {
      const client = await findClient(invite.trainerId, invite.clientId);
      if (!client) return 'Тренер удалил этого клиента.';
      if (client.userId) return 'Этот клиент уже подключён.';
      clientKey = client.clientId;
      await saveClient(invite.trainerId, client, { userId, clientEmail: profile.email, connectedAt });
    } else {
      const [link] = await db.add(clientsTable(invite.trainerId), [
        { clientId: userId, userId, clientName: invite.clientName || profile.name, clientEmail: profile.email, connectedAt } satisfies ClientRecord,
      ]);
      if (!link) return 'Не удалось подключить клиента.';
    }
    const [coachLink] = await db.add(coachesTable(userId), [
      { trainerId: invite.trainerId, trainerName: invite.trainerName, connectedAt, clientId: clientKey } satisfies CoachRecord,
    ]);
    if (!coachLink) return 'Не удалось подключить тренера.';
    const { id, ...record } = invite;
    await db.update(inviteTable(code), [{ id, record: { ...record, usedBy: userId } }]);
    return null;
  }

  const trainerOnly = async (ctx: Ctx) => {
    const profile = await getProfile(ctx.user!.userId);
    return profile?.role === 'trainer' ? profile : null;
  };

  /** Client keys whose measurements the caller may see and edit: the trainer's client, or the client's own keys. */
  async function bodyKeys(ctx: Ctx, clientId: unknown) {
    const userId = ctx.user!.userId;
    const profile = await getProfile(userId);
    if (profile?.role === 'trainer') {
      const id = text(clientId, 200);
      return id && (await findClient(userId, id)) ? { role: profile.role, keys: [id] } : null;
    }
    if (profile?.role !== 'client') return null;
    const keys = (await keysOf(userId)).map((k) => k.clientId);
    return { role: profile.role, keys: keys.length ? Array.from(new Set(keys)) : [userId] };
  }
  const bodyNumber = (v: unknown, [lo, hi]: readonly [number, number]) => {
    if (v === null || v === '') return null;
    const n = Math.round(Number(v) * 10) / 10;
    return Number.isFinite(n) && n >= lo && n <= hi ? n : undefined;
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

    /**
     * A role picked by mistake can be changed while the account is still empty:
     * a trainer without clients or programs, a client without trainers or workouts.
     */
    'POST /api/profile/role': [
      requireAuth(),
      async (ctx: Ctx) => {
        const userId = ctx.user!.userId;
        if (!validRole(ctx.body?.role)) return error('Выберите роль тренера или клиента.', 400);
        const current = await first<Profile>(profileTable(userId));
        if (!current) return error('Сначала создайте профиль.', 400);
        if (current.role === ctx.body.role) return json({ profile: { role: current.role, name: current.name, email: current.email } });
        if (!(await accountIsEmpty(userId))) return error('В аккаунте уже есть данные — роль сменить нельзя. Войдите с другой почтой.', 409);
        const { id, ...record } = current;
        const profile: Profile = { ...record, role: ctx.body.role };
        const [ok] = await db.update(profileTable(userId), [{ id, record: profile }]);
        return ok ? json({ profile }) : error('Не удалось сменить роль.', 500);
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
        if (ok && patch.clientName && patch.clientName !== client.clientName) {
          // Programs carry the client's name (journal header, program lists).
          const programs = (await listAll<ProgramRecord>(programsTable(ctx.user!.userId), 1000)).filter((p) => p.clientId === client.clientId);
          if (programs.length)
            await db.update(
              programsTable(ctx.user!.userId),
              programs.map(({ id, ...record }) => ({ id, record: { ...record, clientName: patch.clientName! } })),
            );
        }
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

    /**
     * The trainer makes a client's sign-in: email + password, confirmed at once, no email sent.
     * The account is created as this client and connected to the trainer; an email already registered is refused.
     */
    'POST /api/client/:clientId/login': [
      requireAuth(),
      async (ctx: Ctx) => {
        const profile = await trainerOnly(ctx);
        if (!profile) return error('Доступ только для тренера.', 403);
        if (!accounts) return error('Создание входа недоступно.', 501);
        const trainerId = ctx.user!.userId;
        const client = await findClient(trainerId, ctx.params.clientId);
        if (!client) return error('Клиент не найден.', 404);
        if (client.userId || client.userId === undefined) return error('Клиент уже подключён к приложению.', 409);
        const email = text(ctx.body?.email, 200).toLowerCase();
        const password = text(ctx.body?.password, 72);
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return error('Проверьте адрес почты.', 400);
        if (password.length < 6) return error('Пароль — не короче 6 символов.', 400);
        const made = await accounts.createUser(email, password);
        let userId = made.userId;
        if (made.exists || !userId) {
          // The owner may take over an existing account only while it holds nothing (e.g. a role picked by mistake).
          const existing = (await isOwner(ctx.user!.email)) ? await accounts.findUser(email) : null;
          if (existing && !(await accountIsEmpty(existing)))
            return error('На этой почте уже есть аккаунт с данными — его пароль знает только владелец. Укажите другую почту.', 409);
          if (!existing)
            return error('Эта почта уже зарегистрирована. Укажите другую — или клиент входит сам и подключается по приглашению.', 409);
          await accounts.setPassword(existing, password);
          userId = existing;
        }
        const connectedAt = nowIso();
        const old = await first<Profile>(profileTable(userId));
        if (old) {
          const { id, ...record } = old;
          await db.update(profileTable(userId), [{ id, record: { ...record, role: 'client', name: client.clientName, email } }]);
        } else await db.add(profileTable(userId), [{ role: 'client', name: client.clientName, email } satisfies Profile]);
        await saveClient(trainerId, client, { userId, clientEmail: email, connectedAt });
        await db.add(coachesTable(userId), [
          { trainerId, trainerName: profile.name, connectedAt, clientId: client.clientId } satisfies CoachRecord,
        ]);
        return json({ email, password }, 201);
      },
    ],

    /**
     * Sign-up by an invite link, no email: the client picks an email and a password, the account is created
     * confirmed, becomes a client and is connected to the trainer who sent the invite. The code works once.
     */
    'POST /api/invite/:code/register': [
      async (ctx: Ctx) => {
        if (!accounts) return error('Регистрация недоступна.', 501);
        const code = text(ctx.params.code, 10).toUpperCase();
        const invite = await first<InviteRecord>(inviteTable(code));
        if (!invite) return error('Приглашение не найдено. Попросите тренера отправить новое.', 404);
        if (invite.usedBy) return error('Это приглашение уже использовано. Войдите по почте и паролю.', 409);
        const email = text(ctx.body?.email, 200).toLowerCase();
        const password = text(ctx.body?.password, 72);
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return error('Проверьте адрес почты.', 400);
        if (password.length < 6) return error('Пароль — не короче 6 символов.', 400);
        const made = await accounts.createUser(email, password);
        if (made.exists || !made.userId)
          return error('Эта почта уже зарегистрирована. Укажите другую — или войдите с ней, если знаете пароль.', 409);
        const userId = made.userId;
        const profile: Profile = { role: 'client', name: text(ctx.body?.name, 60) || invite.clientName || email.split('@')[0], email };
        await db.add(profileTable(userId), [profile]);
        const res = await connectByInvite(userId, profile, code, invite);
        return typeof res === 'string' ? error(res, 409) : json({ registered: true, trainerName: invite.trainerName }, 201);
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
        const res = await connectByInvite(userId, profile, code, invite);
        return typeof res === 'string' ? error(res, 409) : json({ connected: true, trainerName: invite.trainerName });
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
        // A check-in made offline arrives later with its own time (up to 12 hours back).
        const nowMs = Date.parse(nowIso());
        const sent = typeof b.at === 'string' ? Date.parse(b.at) : NaN;
        const at = Number.isFinite(sent) && sent <= nowMs + 60000 && sent >= nowMs - 12 * 3600000 ? new Date(Math.min(sent, nowMs)).toISOString() : nowIso();
        const checkedInAt = b.present ? at : null;
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

    /**
     * A workout recorded by mistake (e.g. the wrong day): gone from history and statistics. The last results
     * behind the weight hints come from the workout before it; the program's next day goes back if it was the latest.
     */
    'POST /api/client/:clientId/sessions/:sessionId/delete': [
      requireAuth(),
      async (ctx: Ctx) => {
        if (!(await trainerOnly(ctx))) return error('Доступ только для тренера.', 403);
        const trainerId = ctx.user!.userId;
        const { clientId, sessionId } = ctx.params;
        if (!(await findClient(trainerId, clientId))) return error('Этот клиент не подключён к вам.', 403);
        const table = sessionsTable(clientId);
        const [session] = await db.get<SessionRecord>(table, [sessionId]);
        if (!session || session.trainerId !== trainerId) return error('Тренировка не найдена.', 404);
        await db.remove(table, [sessionId]);
        const rest = (await listAll<SessionRecord>(table, 400)).sort((a, b) => b.completedAt.localeCompare(a.completedAt));
        for (const e of session.exercises) {
          const resultT = lastResultTable(clientId, e.exerciseId);
          let prev: SessionExercise | undefined;
          const before = rest.find((s) => (prev = s.exercises.find((x) => x.exerciseId === e.exerciseId)));
          if (before && prev)
            await upsertSingle(resultT, { sets: prev.sets, completedAt: before.completedAt, ...(prev.note ? { note: prev.note } : {}) });
          else {
            const rows = (await db.list(resultT, { limit: 10 })).items;
            if (rows.length) await db.remove(resultT, rows.map((r) => r.id));
          }
        }
        const mine = rest.filter((s) => s.trainerId === trainerId);
        const client = await findClient(trainerId, clientId);
        await refreshInsights(trainerId, clientId, {
          latestSessionId: mine[0]?.id,
          latestCompletedAt: mine[0]?.completedAt,
          ...(client?.latestSessionId === sessionId ? { needsReview: false } : {}),
        });
        const [program] = await db.get<ProgramRecord>(programsTable(trainerId), [session.programId]);
        if (program && program.lastCompletedAt === session.completedAt && program.days.some((d) => d.id === session.dayId)) {
          const { id: _drop, ...record } = program as ProgramRecord & { id?: string };
          const last = mine.find((s) => s.programId === session.programId);
          await db.update(programsTable(trainerId), [
            { id: session.programId, record: { ...record, nextDayId: session.dayId, lastCompletedAt: last?.completedAt } },
          ]);
        }
        return json({ deleted: true });
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

    'GET /api/body': [
      requireAuth(),
      async (ctx: Ctx) => {
        const access = await bodyKeys(ctx, ctx.query.clientId);
        if (!access) return error('Нет доступа.', 403);
        // A client with several trainers has a copy per trainer; the latest edit of a date wins.
        const byDate = new Map<string, BodyEntry>();
        for (const key of access.keys)
          for (const e of await listAll<BodyEntry>(bodyTable(key), 2000)) {
            const cur = byDate.get(e.date);
            if (!cur || e.updatedAt > cur.updatedAt) byDate.set(e.date, e);
          }
        const entries = [...byDate.values()]
          .filter((e) => (Object.keys(BODY_FIELDS) as BodyField[]).some((f) => typeof e[f] === 'number'))
          .map(({ id: _id, ...e }: BodyEntry & { id?: string }) => e)
          .sort((a, b) => a.date.localeCompare(b.date));
        let profile: BodyProfile | null = null;
        for (const key of access.keys) {
          const p = await first<BodyProfile>(bodyProfileTable(key));
          if (p && (!profile || (p.updatedAt || '') > (profile.updatedAt || ''))) profile = p;
        }
        if (profile) {
          const { id: _id, ...rest } = profile as BodyProfile & { id?: string };
          profile = rest;
        }
        return json({ profile, entries });
      },
    ],

    'POST /api/body': [
      requireAuth(),
      async (ctx: Ctx) => {
        const b = ctx.body || {};
        const access = await bodyKeys(ctx, b.clientId);
        if (!access) return error('Нет доступа.', 403);
        if (!DATE_RE.test(b.date || '')) return error('Укажите дату.', 400);
        const patch: Partial<Record<BodyField, number | null>> = {};
        for (const f of Object.keys(BODY_FIELDS) as BodyField[]) {
          if (b[f] === undefined) continue;
          const v = bodyNumber(b[f], BODY_FIELDS[f]);
          if (v === undefined)
            return error('Проверьте значения: вес 20–400 кг, талия 40–250, шея 20–70, бёдра 50–250 см, шаги до 100 000, калории до 15 000.', 400);
          patch[f] = (f === 'steps' || f === 'kcal') && v !== null ? Math.round(v) : v;
        }
        const updatedAt = nowIso();
        let entry: BodyEntry | null = null;
        for (const key of access.keys) {
          const table = bodyTable(key);
          const current = (await listAll<BodyEntry>(table, 2000)).find((e) => e.date === b.date);
          if (current) {
            const { id, ...record } = current;
            entry = { ...record, ...patch, updatedAt, recordedByRole: access.role };
            const [ok] = await db.update(table, [{ id, record: entry }]);
            if (!ok) return error('Не удалось сохранить.', 500);
          } else {
            entry = { date: b.date, ...patch, updatedAt, recordedByRole: access.role };
            const [id] = await db.add(table, [entry]);
            if (!id) return error('Не удалось сохранить.', 500);
          }
        }
        return json({ entry });
      },
    ],

    'POST /api/body/profile': [
      requireAuth(),
      async (ctx: Ctx) => {
        const b = ctx.body || {};
        const access = await bodyKeys(ctx, b.clientId);
        if (!access) return error('Нет доступа.', 403);
        const year = Number(nowIso().slice(0, 4));
        const heightCm = bodyNumber(b.heightCm, [100, 250]);
        const birthYear = Number(b.birthYear);
        if ((b.sex !== 'm' && b.sex !== 'f') || !heightCm || !Number.isInteger(birthYear) || birthYear < year - 100 || birthYear > year - 10 || !ACTIVITY.includes(b.activity))
          return error('Укажите пол, рост 100–250 см, год рождения и активность.', 400);
        const profile: BodyProfile = { sex: b.sex, heightCm, birthYear, activity: b.activity, updatedAt: nowIso() };
        for (const key of access.keys) await upsertSingle(bodyProfileTable(key), profile);
        return json({ profile });
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
        // Newest first; for the same moment the one added later (rows come in the order they were added).
        const programs = (await listAll<ProgramRecord>(programsTable(ctx.user!.userId)))
          .map((p, i) => ({ p, i }))
          .filter(({ p }) => !p.free)
          .sort((a, b) => b.p.createdAt.localeCompare(a.p.createdAt) || b.i - a.i)
          .map(({ p }) => p);
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
        let nextDayId = days.some((d) => d.id === program.nextDayId) ? program.nextDayId : days[0].id;
        // The next workout wrapped round to the first day after the last one was done; a workout added
        // right after that last day comes next instead (e.g. a program built one day at a time).
        const lastIdx = days.findIndex((d) => d.id === program.days[program.days.length - 1]?.id);
        const after = lastIdx >= 0 ? days[lastIdx + 1] : undefined;
        if (program.lastCompletedAt && program.nextDayId === program.days[0]?.id && after && !program.days.some((d) => d.id === after.id))
          nextDayId = after.id;
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

    /**
     * Keeps the listed exercises of a day in the given order (a subset removes the rest) and
     * applies the same to the client's open workout, so the gym journal carries on without a conflict.
     */
    'POST /api/programs/:programId/days/:dayId/exercises': [
      requireAuth(),
      async (ctx: Ctx) => {
        if (!(await trainerOnly(ctx))) return error('Доступ только для тренера.', 403);
        const trainerId = ctx.user!.userId;
        const { programId, dayId } = ctx.params;
        const [program] = await db.get<ProgramRecord>(programsTable(trainerId), [programId]);
        if (!program || program.trainerId !== trainerId) return error('Программа не найдена.', 404);
        const day = program.days.find((d) => d.id === dayId);
        if (!day) return error('Тренировка не найдена.', 404);
        const ids: string[] = Array.isArray(ctx.body?.exerciseIds) ? ctx.body.exerciseIds.map(String) : [];
        if (!ids.length) return error('В тренировке должно остаться хотя бы одно упражнение.', 400);
        // Exercises added in the gym can join the program here, with the targets they were done with.
        const findKnown = knownExercises(trainerId);
        const added = new Map<string, ProgramExercise>();
        for (const x of Array.isArray(ctx.body?.added) ? ctx.body.added.slice(0, 20) : []) {
          const known = await findKnown(String(x?.exerciseId));
          const extra = cleanExtra(x);
          const sets = Math.round(Number(x?.sets));
          if (!known || !extra || !(sets >= 1 && sets <= 10)) return error('Проверьте подходы и повторы.', 400);
          added.set(known.id, toProgramExercise({ ...x, ...extra, sets }, known));
        }
        if (new Set(ids).size !== ids.length || ids.some((id) => !day.exercises.some((e) => e.exerciseId === id) && !added.has(id)))
          return error('Упражнения не совпадают с программой. Обновите журнал.', 400);
        if (ids.length > 30) return error('Не больше 30 упражнений в тренировке.', 400);
        const draftT = draftTable(program.clientId, programId, dayId);
        const draft = await first<DraftRecord>(draftT);
        if (draft && !draft.closed && (draft.revision || null) !== (ctx.body?.baseRevision || null))
          return error('Запись уже изменена на другом устройстве. Обновите журнал перед продолжением.', 409);
        const exercises = ids.map((id) => day.exercises.find((e) => e.exerciseId === id) || added.get(id)!);
        const days = program.days.map((d) => (d.id === dayId ? { ...d, exercises } : d));
        const { id: _drop, ...rest } = program as ProgramRecord & { id?: string };
        const [ok] = await db.update(programsTable(trainerId), [{ id: programId, record: { ...rest, days, updatedAt: nowIso() } }]);
        if (!ok) return error('Не удалось сохранить программу.', 500);
        let revision = draft?.revision || null;
        if (draft && !draft.closed) {
          const { id: draftId, ...record } = draft;
          const slot = (e: SessionExercise) => e.replaces || e.exerciseId;
          // Planned entries still in the program stay, added ones that joined it lose their "extra" mark,
          // other added ones stay added; the journal's own order is kept when sent.
          const kept = draft.exercises
            .filter((e) => (e.extra ? true : ids.includes(slot(e))))
            .map(({ extra, ...e }) => (extra && !added.has(e.exerciseId) ? { ...e, extra } : e));
          const order: string[] = Array.isArray(ctx.body?.order) ? ctx.body.order.map(String) : [];
          const rank = (e: SessionExercise) => {
            const i = order.indexOf(e.exerciseId);
            if (i >= 0) return i;
            const j = ids.indexOf(slot(e));
            return order.length + (j >= 0 ? j : ids.length);
          };
          kept.sort((a, b) => rank(a) - rank(b));
          revision = randomId();
          await db.update(draftT, [{ id: draftId, record: { ...record, exercises: kept, revision } }]);
        }
        return json({ saved: true, revision });
      },
    ],

    /**
     * One exercise of a day, from the gym journal: new sets / rep range / reserve, and/or another exercise
     * in its place for good (targets kept). An open workout that already swapped it in today takes it as planned.
     */
    'POST /api/programs/:programId/days/:dayId/exercise': [
      requireAuth(),
      async (ctx: Ctx) => {
        if (!(await trainerOnly(ctx))) return error('Доступ только для тренера.', 403);
        const trainerId = ctx.user!.userId;
        const { programId, dayId } = ctx.params;
        const b = ctx.body || {};
        const [program] = await db.get<ProgramRecord>(programsTable(trainerId), [programId]);
        if (!program || program.trainerId !== trainerId) return error('Программа не найдена.', 404);
        const day = program.days.find((d) => d.id === dayId);
        const current = day?.exercises.find((e) => e.exerciseId === String(b.exerciseId));
        if (!day || !current) return error('Упражнение не найдено в программе. Обновите журнал.', 404);
        let next: ProgramExercise = { ...current };
        if (b.sets !== undefined || b.repMin !== undefined || b.repMax !== undefined || b.targetRir !== undefined) {
          const sets = Math.round(Number(b.sets ?? current.sets));
          const targets = cleanExtra({ repMin: b.repMin ?? current.repMin, repMax: b.repMax ?? current.repMax, targetRir: b.targetRir ?? current.targetRir });
          if (!targets || !(sets >= 1 && sets <= 10)) return error('Подходы 1–10, повторы от 1 до 100 (от меньшего к большему), RIR 0–6.', 400);
          next = { ...next, sets, ...targets };
        }
        const replaceWith = b.replaceWith ? String(b.replaceWith) : '';
        if (replaceWith && replaceWith !== current.exerciseId) {
          if (day.exercises.some((e) => e.exerciseId === replaceWith)) return error('Это упражнение уже есть в тренировке.', 409);
          const known = await knownExercises(trainerId)(replaceWith);
          if (!known) return error('Упражнение не найдено.', 404);
          const { sets, repMin, repMax, targetRir } = next;
          next = toProgramExercise({ sets, repMin, repMax, targetRir }, known);
        }
        const draftT = draftTable(program.clientId, programId, dayId);
        const draft = await first<DraftRecord>(draftT);
        if (draft && !draft.closed && (draft.revision || null) !== (b.baseRevision || null))
          return error('Запись уже изменена на другом устройстве. Обновите журнал перед продолжением.', 409);
        const days = program.days.map((d) =>
          d.id === dayId ? { ...d, exercises: d.exercises.map((e) => (e.exerciseId === current.exerciseId ? next : e)) } : d,
        );
        const { id: _drop, ...rest } = program as ProgramRecord & { id?: string };
        const [ok] = await db.update(programsTable(trainerId), [{ id: programId, record: { ...rest, days, updatedAt: nowIso() } }]);
        if (!ok) return error('Не удалось сохранить программу.', 500);
        let revision = draft?.revision || null;
        if (draft && !draft.closed && next.exerciseId !== current.exerciseId) {
          const { id: draftId, ...record } = draft;
          const exercises = draft.exercises.map((e) => {
            if ((e.replaces || e.exerciseId) !== current.exerciseId) return e;
            // Already swapped in today: now it is the planned one. Still the old one: it becomes the new one, sets kept.
            const { replaces: _r, ...plain } = e;
            return { ...plain, exerciseId: next.exerciseId, exerciseName: next.exerciseName };
          });
          revision = randomId();
          await db.update(draftT, [{ id: draftId, record: { ...record, exercises, revision } }]);
        }
        return json({ saved: true, revision, exercise: next });
      },
    ],

    /** The client's hidden program for a workout made up in the gym; created on first use. */
    'POST /api/free/:clientId': [
      requireAuth(),
      async (ctx: Ctx) => {
        const profile = await trainerOnly(ctx);
        if (!profile) return error('Доступ только для тренера.', 403);
        const trainerId = ctx.user!.userId;
        const client = await findClient(trainerId, ctx.params.clientId);
        if (!client) return error('Клиент не найден.', 404);
        const existing = (await listAll<ProgramRecord>(programsTable(trainerId))).find((p) => p.free && p.clientId === client.clientId);
        if (existing) return json({ trainerId, programId: existing.id, dayId: 'free' });
        const at = nowIso();
        const record: ProgramRecord = {
          trainerId,
          trainerName: profile.name,
          clientId: client.clientId,
          clientName: client.clientName,
          name: 'Без программы',
          days: [{ id: 'free', name: 'Свободная тренировка', exercises: [] }],
          createdAt: at,
          updatedAt: at,
          free: true,
        };
        const [programId] = await db.add(programsTable(trainerId), [record]);
        return programId ? json({ trainerId, programId, dayId: 'free' }, 201) : error('Не удалось начать тренировку.', 500);
      },
    ],

    /**
     * Turns a free workout into a program day: appended to one of the client's programs, or the first day of a new one.
     * The program's next day stays as it was — this workout is already done.
     */
    'POST /api/free/:clientId/save': [
      requireAuth(),
      async (ctx: Ctx) => {
        const profile = await trainerOnly(ctx);
        if (!profile) return error('Доступ только для тренера.', 403);
        const trainerId = ctx.user!.userId;
        const client = await findClient(trainerId, ctx.params.clientId);
        if (!client) return error('Клиент не найден.', 404);
        const b = ctx.body || {};
        const dayName = text(b.dayName, 80);
        if (!dayName) return error('Назовите тренировку.', 400);
        const list: any[] = Array.isArray(b.exercises) ? b.exercises.slice(0, 30) : [];
        if (!list.length) return error('Добавьте упражнения.', 400);
        const findKnown = knownExercises(trainerId);
        const exercises: ProgramExercise[] = [];
        for (const x of list) {
          const known = await findKnown(String(x?.exerciseId));
          const extra = cleanExtra(x);
          const sets = Math.round(Number(x?.sets));
          if (!known || !extra || !(sets >= 1 && sets <= 10)) return error('Проверьте подходы и повторы.', 400);
          if (exercises.some((e) => e.exerciseId === known.id)) continue;
          // Muscles chosen for an own exercise in the source program come along (a copied workout).
          exercises.push(toProgramExercise({ ...extra, sets, muscles: Array.isArray(x?.muscles) ? x.muscles : undefined }, known));
        }
        const at = nowIso();
        const table = programsTable(trainerId);
        if (b.programId) {
          const [program] = await db.get<ProgramRecord>(table, [String(b.programId)]);
          if (!program || program.trainerId !== trainerId || program.clientId !== client.clientId || program.free)
            return error('Программа не найдена.', 404);
          if (program.days.length >= 14) return error('В программе уже 14 тренировок.', 400);
          const used = new Set(program.days.map((d) => d.id));
          let n = program.days.length + 1;
          while (used.has('day-' + n)) n++;
          const day: ProgramDay = { id: 'day-' + n, name: dayName, exercises };
          const { id: _drop, ...rest } = program as ProgramRecord & { id?: string };
          const [ok] = await db.update(table, [{ id: String(b.programId), record: { ...rest, days: [...program.days, day], updatedAt: at } }]);
          return ok ? json({ programId: b.programId, dayId: day.id, programName: program.name }) : error('Не удалось сохранить.', 500);
        }
        const name = text(b.programName, 100) || 'Программа';
        const record: ProgramRecord = {
          trainerId,
          trainerName: profile.name,
          clientId: client.clientId,
          clientName: client.clientName,
          name,
          days: [{ id: 'day-1', name: dayName, exercises }],
          createdAt: at,
          updatedAt: at,
        };
        const [programId] = await db.add(table, [record]);
        if (!programId) return error('Не удалось сохранить.', 500);
        await db.add(assignmentsTable(client.clientId), [
          { trainerId, trainerName: profile.name, programId, programName: name, assignedAt: at } satisfies AssignmentRecord,
        ]);
        return json({ programId, dayId: 'day-1', programName: name }, 201);
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
            if (program && program.clientId === key.clientId && !program.archived && !program.free)
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
            const last = await first<{ sets: SetEntry[]; completedAt?: string; note?: string }>(lastResultTable(ownerId, e.exerciseId));
            return {
              ...e,
              equipment: await equipmentOf(e.exerciseId),
              previousSets: last?.sets || [],
              previousAt: last?.completedAt || null,
              ...(last?.note ? { previousNote: last.note } : {}),
            };
          }),
        );
        const draft = await first<DraftRecord>(draftTable(ownerId, programId, dayId));
        const client = await findClient(trainerId, program.clientId);
        return json({
          draft: draft?.closed ? null : draft || null,
          // When the client was marked «Пришёл»: the journal shows the time spent in the gym.
          checkedInAt: client?.checkedInAt || null,
          // An open workout takes set counts changed in the program after it was started.
          programUpdatedAt: program.updatedAt || program.createdAt,
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
          ...(program.free ? { lastFree: program.lastFree || [] } : {}),
        });
      },
    ],

    'GET /api/previous/:trainerId/:programId/:exerciseId': [
      requireAuth(),
      async (ctx: Ctx) => {
        const { trainerId, programId, exerciseId } = ctx.params;
        const access = await workoutOwner(ctx.user!.userId, trainerId, programId);
        if (!access) return error('Нет доступа к тренировке.', 403);
        const last = await first<{ sets: SetEntry[]; completedAt?: string; note?: string }>(lastResultTable(access.ownerId, exerciseId));
        return json({
          equipment: await equipmentLookup(trainerId)(exerciseId),
          previousSets: last?.sets || [],
          previousAt: last?.completedAt || null,
          ...(last?.note ? { previousNote: last.note } : {}),
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
          .map(({ skipped: _skipped, extra: _extra, ...e }) => ({ ...e, sets: e.sets.filter((s) => s.reps > 0).map(cleanSet) }))
          .filter((e) => e.sets.length > 0);
        if (!performed.length) return error('Нет выполненных подходов. Черновик сохранён — продолжите позже.', 400);
        const findKnown = knownExercises(trainerId);
        for (const e of performed) {
          if (exerciseRules[e.exerciseId]) continue;
          const planned = day.exercises.find((p) => p.exerciseId === e.exerciseId)?.muscles;
          const known = planned?.length ? null : await findKnown(e.exerciseId);
          const muscles = planned?.length ? planned : known?.muscles?.length ? known.muscles : groupMuscles(known?.muscleGroup);
          if (muscles.length) (e as SessionExercise).muscles = muscles.slice(0, 6);
        }
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
          await upsertSingle(lastResultTable(ownerId, e.exerciseId), { sets: e.sets, completedAt, ...(e.note ? { note: e.note } : {}) });
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
        // Exercises the trainer added in the gym and did join the program day, each after the planned
        // exercise it followed in the journal; the planned ones keep their order.
        const joined = program.free || access.role !== 'trainer' ? [] : matched.filter((e) => e.extra && !e.extra.once && performed.some((p) => p.exerciseId === e.exerciseId));
        let days = program.days;
        if (joined.length && day.exercises.length + joined.length <= 30) {
          const findKnown = knownExercises(trainerId);
          const after = new Map<string, ProgramExercise[]>();
          let prev = '';
          for (const e of matched) {
            if (!e.extra) prev = String(e.replaces || e.exerciseId);
            else if (joined.includes(e)) {
              const known = await findKnown(e.exerciseId);
              if (known) after.set(prev, [...(after.get(prev) || []), toProgramExercise({ ...e.extra, sets: e.sets.length }, known)]);
            }
          }
          const exercises = [...(after.get('') || []), ...day.exercises.flatMap((p) => [p, ...(after.get(p.exerciseId) || [])])];
          days = program.days.map((d) => (d.id === dayId ? { ...d, exercises } : d));
        }
        const { id: _drop, ...rest } = program as ProgramRecord & { id?: string };
        const [updated] = await db.update(programsTable(trainerId), [
          {
            id: programId,
            record: {
              ...rest,
              ...(days !== program.days ? { days, updatedAt: completedAt } : {}),
              nextDayId,
              lastCompletedAt: completedAt,
              lastRecordedByRole: access.role,
              // A free workout is remembered as the starting point of the next one.
              ...(program.free
                ? {
                    lastFree: matched
                      .filter((e) => e.extra)
                      .map((e) => ({
                        exerciseId: e.exerciseId,
                        exerciseName: e.exerciseName,
                        sets: e.sets.length,
                        repMin: e.extra!.repMin,
                        repMax: e.extra!.repMax,
                        targetRir: e.extra!.targetRir,
                      })),
                  }
                : {}),
            },
          },
        ]);
        return json(
          updated ? { saved: true, sessionId } : { saved: true, sessionId, warning: 'Результат сохранён. Следующий день выберите вручную.' },
          201,
        );
      },
    ],
  });
}
