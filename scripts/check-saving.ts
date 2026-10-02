// Every way a workout gets saved, through the real request logic (backend/app.ts) with two phones on one
// workout: the trainer's and the client's. Each "phone" follows the journal's rules (a save carries the
// version it started from; a merged answer replaces what is on screen; nothing typed is dropped).
//   npx tsx scripts/check-saving.ts
import { createHandler } from '../backend/app';
import { sdk } from '../src/local/sdk';
import { setClockOffset } from '../src/clock';
import { slotKey } from '../src/draftMerge';
import type { SessionExercise, SetEntry } from '../src/types';

const handle: any = createHandler(sdk);
const who = (id: string) => ({ userId: id, name: id, email: id + '@check' });
async function call(actor: string, method: string, path: string, body?: unknown) {
  const r = await handle(method, path, body, who(actor));
  if (r.status >= 400) throw new Error(`${method} ${path}: ${r.status} ${r.data?.error}`);
  return r.data;
}
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
let failures = 0;
let checks = 0;
function expect(ok: boolean, what: string, detail?: unknown) {
  checks++;
  if (ok) return;
  failures++;
  console.log('  ✗ ' + what + (detail === undefined ? '' : '\n    ' + JSON.stringify(detail).slice(0, 600)));
}
const doneOf = (list: SessionExercise[]) =>
  Object.fromEntries(list.map((e) => [e.exerciseId, e.sets.filter((s) => s.reps > 0).map((s) => `${s.weight}x${s.reps}`)]).filter(([, v]) => v.length));

/** One phone's journal for one workout. */
class Phone {
  entries: SessionExercise[] = [];
  base: SessionExercise[] | null = null;
  rev: string | null = null;
  fb = '';
  baseFb: string | null = null;
  pending = false;
  finished = false;
  constructor(
    public user: string,
    public w: { trainerId: string; programId: string; dayId: string },
  ) {}
  get path() {
    return `${this.w.trainerId}/${this.w.programId}/${this.w.dayId}`;
  }
  async open() {
    const p = await call(this.user, 'GET', '/api/workout/' + this.path);
    this.rev = p.revision;
    this.base = p.draft?.exercises ?? null;
    this.fb = p.draft?.feedback || '';
    this.baseFb = p.draft ? p.draft.feedback || '' : null;
    this.entries = clone(
      p.draft?.exercises ??
        p.day.exercises.map((e: any) => ({ exerciseId: e.exerciseId, exerciseName: e.exerciseName, sets: Array.from({ length: e.sets }, () => ({ weight: 0, reps: 0, rir: null })) })),
    );
    this.finished = false;
    this.pending = false;
    return p;
  }
  set(slot: string, i: number, s: Partial<SetEntry>) {
    const e = this.entries.find((x) => slotKey(x) === slot)!;
    while (e.sets.length <= i) e.sets.push({ weight: 0, reps: 0, rir: null });
    e.sets[i] = { ...e.sets[i], ...s };
    this.pending = true;
  }
  addExtra(id: string, name: string, sets: SetEntry[]) {
    this.entries.push({ exerciseId: id, exerciseName: name, extra: { repMin: 8, repMax: 12, targetRir: 2 }, sets });
    this.pending = true;
  }
  body(at?: string, base = true) {
    return {
      ...this.w,
      baseRevision: this.rev,
      ...(base ? { base: this.base || [], baseFeedback: this.baseFb } : {}),
      feedback: this.fb,
      exercises: this.entries,
      localDate: '2026-10-02',
      ...(at ? { completedAt: at } : {}),
    };
  }
  async save(opts: { oldApp?: boolean } = {}) {
    const r = await handle('POST', '/api/draft', this.body(undefined, !opts.oldApp), who(this.user));
    if (r.status >= 400) return { status: r.status, error: r.data?.error };
    const d = r.data;
    if (d.closed) {
      this.finished = true;
      this.pending = false;
      return { status: r.status, closed: true, amended: d.amended };
    }
    this.rev = d.revision;
    if (Array.isArray(d.exercises)) {
      this.entries = clone(d.exercises);
      this.fb = d.feedback ?? this.fb;
    }
    this.base = clone(this.entries);
    this.baseFb = this.fb;
    this.pending = false;
    return { status: r.status, merged: !!d.merged };
  }
  /** The live check: takes the server's version when nothing waits here. */
  async poll() {
    if (this.pending) return 'pending';
    const d = await call(this.user, 'GET', '/api/draft/' + this.path);
    if (!d.revision || d.revision === this.rev) return 'same';
    if (d.closed) {
      this.finished = true;
      return 'closed';
    }
    this.rev = d.revision;
    this.entries = clone(d.exercises);
    this.base = clone(d.exercises);
    this.fb = d.feedback || '';
    this.baseFb = this.fb;
    return 'adopted';
  }
  async finish(at?: string) {
    if (this.pending) {
      const s = await this.save();
      if (s.closed) return { amended: s.amended, viaDraft: true };
      if (s.status >= 400) return { error: s.error, status: s.status };
    }
    const r = await handle('POST', '/api/sessions', this.body(at), who(this.user));
    if (r.status >= 400) return { error: r.data?.error, status: r.status };
    this.finished = true;
    return r.data;
  }
}

async function setup(tag: string, exercises = ['leg-press', 'lat-pulldown', 'seated-leg-curl', 'lateral-raise']) {
  const trainer = 'tr-' + tag;
  const clientUser = 'cl-' + tag;
  await call(trainer, 'POST', '/api/profile', { role: 'trainer', name: 'Тренер ' + tag });
  const { client } = await call(trainer, 'POST', '/api/clients', { clientName: 'Клиент ' + tag });
  await call(clientUser, 'POST', '/api/profile', { role: 'client', name: 'Клиент ' + tag });
  const { code } = await call(trainer, 'POST', '/api/invites', { clientId: client.clientId });
  await call(clientUser, 'POST', '/api/connect', { code });
  const { program } = await call(trainer, 'POST', '/api/programs', {
    clientId: client.clientId,
    name: 'Программа',
    days: [
      { id: 'day-1', name: 'А', exercises: exercises.map((id) => ({ exerciseId: id, sets: 3, repMin: 8, repMax: 12, targetRir: 2 })) },
      { id: 'day-2', name: 'Б', exercises: [{ exerciseId: 'bench-press', sets: 3, repMin: 6, repMax: 10, targetRir: 2 }] },
    ],
  });
  const w = { trainerId: trainer, programId: program.id, dayId: 'day-1' };
  return { trainer, clientUser, clientId: client.clientId, program, w, T: new Phone(trainer, w), C: new Phone(clientUser, w) };
}
const history = async (s: { trainer: string; clientId: string }) =>
  (await call(s.trainer, 'GET', `/api/client/${s.clientId}/history`)) as { sessions: any[]; open: any[] };

async function main() {
  setClockOffset(Date.parse('2026-10-02T07:00:00Z') - Date.now());

  console.log('1. Тренер и клиент отмечают подходы одновременно (разные подходы)');
  {
    const s = await setup('a');
    await s.T.open();
    await s.C.open();
    s.T.set('leg-press', 0, { weight: 100, reps: 10 });
    s.C.set('leg-press', 1, { weight: 100, reps: 9 });
    s.C.set('lat-pulldown', 0, { weight: 50, reps: 12 });
    expect((await s.T.save()).status === 200, 'trainer saves');
    const c = await s.C.save();
    expect(c.status === 200 && c.merged === true, 'client save (made from the older version) is merged, not refused', c);
    expect(doneOf(s.C.entries)['leg-press']?.length === 2, "client sees the trainer's set after merging", doneOf(s.C.entries));
    expect((await s.T.poll()) === 'adopted', "trainer's live check takes the client's sets");
    expect(JSON.stringify(doneOf(s.T.entries)) === JSON.stringify(doneOf(s.C.entries)), 'both phones show the same', [doneOf(s.T.entries), doneOf(s.C.entries)]);
    // Random interleaving: 40 rounds, each phone edits its own sets and saves in random order, sometimes without polling.
    let r = 7;
    const rnd = () => ((r = (r * 48271) % 2147483647) / 2147483647);
    const expected: Record<string, SetEntry> = {};
    for (const [slot, i, sset] of [['leg-press', 0, { weight: 100, reps: 10, rir: null }], ['leg-press', 1, { weight: 100, reps: 9, rir: null }], ['lat-pulldown', 0, { weight: 50, reps: 12, rir: null }]] as const)
      expected[slot + i] = sset;
    for (let round = 0; round < 40; round++) {
      const phone = rnd() < 0.5 ? s.T : s.C;
      const slots = phone === s.T ? ['leg-press', 'seated-leg-curl'] : ['lat-pulldown', 'lateral-raise'];
      const slot = slots[Math.floor(rnd() * 2)];
      const i = Math.floor(rnd() * 3);
      const set = { weight: 10 + Math.floor(rnd() * 10) * 5, reps: 6 + Math.floor(rnd() * 8), rir: null };
      phone.set(slot, i, set);
      expected[slot + i] = set;
      const act = rnd();
      if (act < 0.5) await phone.save();
      else if (act < 0.7) await (phone === s.T ? s.C : s.T).poll();
    }
    await s.C.save();
    const fin = await s.T.finish();
    expect(!!fin.sessionId, 'trainer finishes', fin);
    const h = await history(s);
    expect(h.sessions.length === 1, 'one workout in history', h.sessions.length);
    const got = h.sessions[0]?.exercises || [];
    const missing = Object.entries(expected).filter(([k, v]) => {
      const e = got.find((x: any) => k.startsWith(x.exerciseId) && k.length === x.exerciseId.length + 1);
      return !e?.sets.some((x: SetEntry) => x.weight === v.weight && x.reps === v.reps);
    });
    expect(!missing.length, 'every set entered on either phone is in the record', missing);
    expect(h.open.length === 0, 'nothing left unfinished', h.open);
  }

  console.log('2. Тренер завершил, а у клиента остался неотправленный подход');
  {
    const s = await setup('b');
    await s.T.open();
    await s.C.open();
    s.T.set('leg-press', 0, { weight: 80, reps: 10 });
    await s.T.save();
    await s.C.poll();
    s.C.set('lat-pulldown', 0, { weight: 45, reps: 11 }); // typed, not sent yet
    const fin = await s.T.finish();
    expect(!!fin.sessionId, 'trainer finishes', fin);
    const late = await s.C.save();
    expect(late.status === 200 && late.closed === true && late.amended === true, "the client's late set goes into the finished workout", late);
    const h = await history(s);
    expect(h.sessions.length === 1, 'still one workout', h.sessions.length);
    expect(doneOf(h.sessions[0].exercises)['lat-pulldown']?.[0] === '45x11', 'the late set is in the record', doneOf(h.sessions[0].exercises));
    const w = await call(s.trainer, 'GET', '/api/workout/' + s.T.path);
    const prev = w.day.exercises.find((e: any) => e.exerciseId === 'lat-pulldown').previousSets;
    expect(prev?.[0]?.reps === 11, 'the late set is the last result for the next hints', prev);
  }

  console.log('3. Оба нажали «Завершить» почти одновременно');
  {
    const s = await setup('c');
    await s.T.open();
    await s.C.open();
    s.T.set('leg-press', 0, { weight: 90, reps: 8 });
    s.C.set('lateral-raise', 0, { weight: 8, reps: 15 });
    const a = await s.T.finish();
    const b = await s.C.finish();
    expect(!!a.sessionId, 'first finish records', a);
    expect(!b.error, 'second finish is not refused', b);
    const h = await history(s);
    expect(h.sessions.length === 1, 'one workout, not two', h.sessions.length);
    const d = doneOf(h.sessions[0].exercises);
    expect(d['leg-press']?.length === 1 && d['lateral-raise']?.length === 1, "both phones' sets are in it", d);
  }

  console.log('4. Повторная отправка завершения (ответ потерялся, очередь отправила снова)');
  {
    const s = await setup('d');
    await s.T.open();
    s.T.set('leg-press', 0, { weight: 70, reps: 12 });
    await s.T.save();
    const body = s.T.body();
    const one = await call(s.trainer, 'POST', '/api/sessions', body);
    const two = await handle('POST', '/api/sessions', body, who(s.trainer));
    expect(!!one.sessionId && two.status < 400, 'the repeat is accepted quietly', two.data);
    expect((await history(s)).sessions.length === 1, 'recorded once');
  }

  console.log('5. Клиент без сети завершил после того, как тренер уже записал');
  {
    const s = await setup('e');
    await s.T.open();
    await s.C.open();
    s.T.set('leg-press', 0, { weight: 60, reps: 10 });
    await s.T.save();
    await s.C.poll();
    s.C.set('seated-leg-curl', 0, { weight: 30, reps: 12 });
    s.C.set('seated-leg-curl', 1, { weight: 30, reps: 11 });
    const offlineBody = s.C.body(); // the client's finish waits in the outbox
    await s.T.finish();
    const r = await handle('POST', '/api/sessions', offlineBody, who(s.clientUser));
    expect(r.status < 400 && r.data.amended === true, "the outbox finish adds the client's sets to the record", r.data);
    const h = await history(s);
    expect(h.sessions.length === 1 && doneOf(h.sessions[0].exercises)['seated-leg-curl']?.length === 2, 'one record with both sets', h.sessions.map((x) => doneOf(x.exercises)));
  }

  console.log('6. Старая версия приложения (без базы) получает просьбу обновить, как раньше');
  {
    const s = await setup('f');
    await s.T.open();
    await s.C.open();
    s.T.set('leg-press', 0, { weight: 60, reps: 10 });
    await s.T.save();
    s.C.set('leg-press', 1, { weight: 60, reps: 10 });
    const r = await s.C.save({ oldApp: true });
    expect(r.status === 409, 'old app: 409', r);
  }

  console.log('7. Программу поменяли посреди тренировки');
  {
    const s = await setup('g');
    await s.T.open();
    await s.C.open();
    s.C.set('lateral-raise', 0, { weight: 10, reps: 12 });
    s.C.set('leg-press', 0, { weight: 100, reps: 10 });
    await s.C.save();
    s.C.set('lateral-raise', 1, { weight: 10, reps: 11 }); // typed while the trainer edits the program
    // The trainer removes «lateral-raise» and adds «face-pull» in the program editor.
    const p = s.program;
    const days = p.days.map((d: any) =>
      d.id === 'day-1'
        ? { ...d, exercises: [...d.exercises.filter((e: any) => e.exerciseId !== 'lateral-raise'), { exerciseId: 'face-pull', sets: 3, repMin: 12, repMax: 15, targetRir: 2 }] }
        : d,
    );
    await call(s.trainer, 'POST', '/api/programs/' + p.id, { name: p.name, days });
    const r = await s.C.save();
    expect(r.status === 200, 'the save from the old plan is accepted', r);
    const lat = s.C.entries.find((e) => e.exerciseId === 'lateral-raise');
    expect(!!lat?.extra?.once && lat.sets.filter((x) => x.reps > 0).length === 2, 'removed exercise keeps its done sets as a one-off', lat);
    expect(s.C.entries.some((e) => e.exerciseId === 'face-pull' && !e.extra), 'the new planned exercise is there', s.C.entries.map((e) => e.exerciseId));
    const fin = await s.C.finish();
    expect(!!fin.sessionId, 'finishes', fin);
    const d = doneOf((await history(s)).sessions[0].exercises);
    expect(d['lateral-raise']?.length === 2 && d['leg-press']?.length === 1, 'all done sets recorded', d);
    const prog = (await call(s.trainer, 'GET', '/api/programs')).programs.find((x: any) => x.id === p.id);
    expect(!prog.days[0].exercises.some((e: any) => e.exerciseId === 'lateral-raise'), 'the one-off did not go back into the program');
  }

  console.log('8. Свободная тренировка → «Сохранить как тренировку программы» → «Завершить»');
  {
    const s = await setup('h');
    const free = await call(s.trainer, 'POST', '/api/free/' + s.clientId, {});
    const F = new Phone(s.trainer, { trainerId: free.trainerId, programId: free.programId, dayId: free.dayId });
    await F.open();
    F.addExtra('leg-press', 'Жим ногами', [{ weight: 100, reps: 10, rir: null }, { weight: 100, reps: 9, rir: null }]);
    F.addExtra('lat-pulldown', 'Тяга', [{ weight: 50, reps: 12, rir: null }]);
    await F.save();
    await call(s.trainer, 'POST', '/api/free/' + s.clientId + '/save', { programId: s.program.id, dayName: 'Пятница', exercises: [{ exerciseId: 'leg-press', sets: 2, repMin: 8, repMax: 12, targetRir: 2 }] });
    const cl = (await call(s.trainer, 'GET', '/api/clients')).clients.find((c: any) => c.clientId === s.clientId);
    void cl;
    const open = (await history(s)).open;
    expect(open.length === 1 && open[0].free, 'the free workout is offered as unfinished', open);
    F.addExtra('lateral-raise', 'Махи', [{ weight: 8, reps: 15, rir: null }]);
    const fin = await F.finish();
    expect(!!fin.sessionId, 'free workout recorded', fin);
    const h = await history(s);
    expect(h.sessions.length === 1 && Object.keys(doneOf(h.sessions[0].exercises)).length === 3, 'all three exercises in history', h.sessions.map((x) => doneOf(x.exercises)));
    expect(h.open.length === 0, 'nothing unfinished');
  }

  console.log('9. Через неделю тот же день: новая тренировка, а не дописывание старой');
  {
    const s = await setup('i');
    await s.T.open();
    s.T.set('leg-press', 0, { weight: 100, reps: 10 });
    await s.T.finish();
    setClockOffset(Date.parse('2026-10-09T07:00:00Z') - Date.now());
    await s.T.open();
    await s.C.open();
    expect(s.T.entries.every((e) => e.sets.every((x) => x.reps === 0)), 'next week starts empty');
    s.T.set('leg-press', 0, { weight: 102.5, reps: 10 });
    s.C.set('lat-pulldown', 0, { weight: 50, reps: 10 });
    await s.T.save();
    const c = await s.C.save();
    expect(c.status === 200 && !c.closed, "the client's set goes into this week's workout", c);
    await s.T.poll();
    const fin = await s.T.finish();
    expect(!!fin.sessionId, 'second week recorded', fin);
    const h = await history(s);
    expect(h.sessions.length === 2, 'two workouts', h.sessions.length);
    const last = doneOf(h.sessions[0].exercises);
    expect(last['leg-press']?.[0] === '102.5x10' && last['lat-pulldown']?.[0] === '50x10', "this week's record has both phones' sets", last);
    // A week-old phone that still holds last week's unsent set does not reopen anything.
    setClockOffset(Date.parse('2026-10-02T07:00:00Z') - Date.now());
  }

  console.log('10. Поздние подходы через 13 часов после завершения не дописываются');
  {
    const s = await setup('j');
    await s.T.open();
    await s.C.open();
    s.T.set('leg-press', 0, { weight: 100, reps: 10 });
    await s.T.save();
    await s.C.poll();
    s.C.set('leg-press', 1, { weight: 100, reps: 9 });
    await s.T.finish();
    setClockOffset(Date.parse('2026-10-02T20:30:00Z') - Date.now());
    const r = await s.C.save();
    expect(r.status === 409, 'too late: the phone is asked to reload', r);
    setClockOffset(Date.parse('2026-10-02T07:00:00Z') - Date.now());
  }

  console.log('11. Удалили запись, потом пришёл поздний подход');
  {
    const s = await setup('k');
    await s.T.open();
    await s.C.open();
    s.T.set('leg-press', 0, { weight: 100, reps: 10 });
    await s.T.save();
    await s.C.poll();
    s.C.set('leg-press', 1, { weight: 100, reps: 9 });
    const fin = await s.T.finish();
    await call(s.trainer, 'POST', `/api/client/${s.clientId}/sessions/${fin.sessionId}/delete`, {});
    const r = await s.C.save();
    expect(r.status === 409, 'no record to add to: reload', r);
    expect((await history(s)).sessions.length === 0, 'the deleted workout stays deleted');
  }

  console.log('12. Комментарий к тренировке с двух телефонов');
  {
    const s = await setup('l');
    await s.T.open();
    await s.C.open();
    s.T.set('leg-press', 0, { weight: 100, reps: 10 });
    s.C.fb = 'колено ноет';
    s.C.pending = true;
    await s.T.save();
    await s.C.save();
    await s.T.poll();
    expect(s.T.fb === 'колено ноет', "trainer sees the client's comment", s.T.fb);
    const fin = await s.T.finish();
    const h = await history(s);
    expect(!!fin.sessionId && h.sessions[0].feedback === 'колено ноет', 'comment recorded', h.sessions[0]?.feedback);
  }

  console.log('13. Тренер добавил упражнение, клиент в это время отмечал своё');
  {
    const s = await setup('m');
    await s.T.open();
    await s.C.open();
    s.T.addExtra('face-pull', 'Тяга к лицу', [{ weight: 20, reps: 15, rir: null }]);
    s.C.set('leg-press', 0, { weight: 100, reps: 10 });
    await s.T.save();
    await s.C.save();
    expect(s.C.entries.some((e) => e.exerciseId === 'face-pull'), "client sees the trainer's added exercise", s.C.entries.map((e) => e.exerciseId));
    await s.T.poll();
    const fin = await s.T.finish();
    const d = doneOf((await history(s)).sessions[0].exercises);
    expect(!!fin.sessionId && d['face-pull']?.length === 1 && d['leg-press']?.length === 1, 'both in the record', d);
  }

  console.log('14. Один и тот же подход изменили на обоих телефонах');
  {
    const s = await setup('n');
    await s.T.open();
    await s.C.open();
    s.T.set('leg-press', 0, { weight: 100, reps: 10 });
    s.C.set('leg-press', 0, { weight: 105, reps: 8 });
    await s.T.save();
    await s.C.save();
    const v = s.C.entries.find((e) => e.exerciseId === 'leg-press')!.sets[0];
    expect(v.reps > 0, 'the set stays done (the last phone to save wins)', v);
    await s.T.poll();
    expect(JSON.stringify(s.T.entries) === JSON.stringify(s.C.entries), 'and both phones agree');
  }

  console.log('15. Сохранения с двух телефонов в одну и ту же миллисекунду (20 раз подряд)');
  {
    const s = await setup('o');
    await s.T.open();
    await s.C.open();
    let lost = 0;
    for (let round = 0; round < 20; round++) {
      const i = round % 3;
      const ex = ['leg-press', 'lat-pulldown', 'seated-leg-curl', 'lateral-raise'];
      s.T.set(ex[(round * 2) % 4], i, { weight: 50 + round, reps: 10 });
      s.C.set(ex[(round * 2 + 1) % 4], i, { weight: 70 + round, reps: 8 });
      const [a, b] = await Promise.all([s.T.save(), s.C.save()]);
      if (a.status >= 400 || b.status >= 400) lost++;
      await s.T.poll();
      await s.C.poll();
    }
    expect(!lost, 'no save refused', lost);
    expect(JSON.stringify(s.T.entries) === JSON.stringify(s.C.entries), 'both phones end up with the same entries');
    const d = await call(s.trainer, 'GET', '/api/draft/' + s.T.path);
    const last = (id: string, i: number) => d.exercises.find((e: any) => e.exerciseId === id).sets[i];
    // Round 19 wrote leg-press? (19*2)%4 = 2 → seated-leg-curl by the trainer, lateral-raise by the client, set 19 % 3 = 1.
    expect(last('seated-leg-curl', 1).weight === 69 && last('lateral-raise', 1).weight === 89, "the last round's sets of both phones are on the server", [last('seated-leg-curl', 1), last('lateral-raise', 1)]);
    const fin = await s.T.finish();
    expect(!!fin.sessionId, 'finishes');
  }

  console.log('16. Оба завершают в одну миллисекунду');
  {
    const s = await setup('p');
    await s.T.open();
    await s.C.open();
    s.T.set('leg-press', 0, { weight: 90, reps: 8 });
    s.C.set('lat-pulldown', 0, { weight: 45, reps: 10 });
    await Promise.all([s.T.save(), s.C.save()]);
    await s.T.poll();
    await s.C.poll();
    s.T.set('leg-press', 1, { weight: 90, reps: 7 });
    s.C.set('lat-pulldown', 1, { weight: 45, reps: 9 });
    const [a, b] = await Promise.all([s.T.finish(), s.C.finish()]);
    expect(!a.error && !b.error, 'neither finish is refused', [a, b]);
    const h = await history(s);
    expect(h.sessions.length === 1, 'one workout', h.sessions.length);
    const d = doneOf(h.sessions[0].exercises);
    expect(d['leg-press']?.length === 2 && d['lat-pulldown']?.length === 2, "all four sets in it", d);
  }

  console.log('17. Клиентка пришла и записывает сама, тренер её не отмечал');
  {
    const s = await setup('q');
    const present = async () => (await call(s.trainer, 'GET', '/api/clients')).clients.find((c: any) => c.clientId === s.clientId);
    expect(!(await present()).checkedInAt, 'not in the gym yet');
    await s.C.open();
    s.C.fb = 'разминка';
    s.C.pending = true;
    await s.C.save();
    expect(!(await present()).checkedInAt, 'a comment alone does not mark her in the gym');
    s.C.set('leg-press', 0, { weight: 80, reps: 10 });
    await s.C.save();
    const c = await present();
    expect(!!c.checkedInAt, 'her first set marks her in the gym', c.checkedInAt);
    expect(c.live?.programId === s.program.id && c.live?.dayId === 'day-1', "the trainer's gym opens her workout", c.live);
    expect((c.visits || []).includes('2026-10-02'), 'the visit is counted', c.visits);
    // The trainer pressed «Ушёл» by mistake; her next set brings her back.
    await call(s.trainer, 'POST', '/api/attendance', { clientId: s.clientId, present: false, localDate: '2026-10-02' });
    s.C.set('leg-press', 1, { weight: 80, reps: 9 });
    await s.C.save();
    expect(!!(await present()).checkedInAt, 'a new set marks her in the gym again');
  }

  console.log(`\n${checks} проверок, ошибок: ${failures}`);
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
