// A program as plain text for a messenger, one line per exercise: «Жим ногами 45 кг 3х15».
// The weight is the next suggestion from the client's last results; without results — the rep range only.
import { fmtKg, suggestNext, weightUnit } from '../analytics';
import { api } from '../transport';
import type { Program, WorkoutExercise } from '../types';

function line(e: WorkoutExercise) {
  const previous = e.previousSets || [];
  const sug = suggestNext(e, previous);
  const bodyweight = e.equipment === 'Собственный вес' || (previous.length > 0 && previous.every((s) => !s.weight));
  if (!previous.length || (!sug.weight && !bodyweight)) return `${e.exerciseName} ${e.sets}х${e.repMin}–${e.repMax}`;
  const reps = sug.reps[0] ?? e.repMin;
  if (bodyweight || !sug.weight) return `${e.exerciseName} ${e.sets}х${reps}`;
  return `${e.exerciseName} ${fmtKg(sug.weight)} ${weightUnit(e)} ${e.sets}х${reps}`;
}

/** The whole program (or the given days) as text; weights come from each day's workout data. */
export async function programText(p: Program, dayIds?: string[]) {
  const days = p.days.filter((d) => !dayIds || dayIds.includes(d.id));
  const blocks = await Promise.all(
    days.map(async (d) => {
      let exercises: WorkoutExercise[] = d.exercises.map((e) => ({ ...e, previousSets: [] }));
      try {
        const r = await api.get(`/api/workout/${encodeURIComponent(p.trainerId)}/${encodeURIComponent(p.id)}/${encodeURIComponent(d.id)}`);
        exercises = r.data.day.exercises;
      } catch {
        /* without results: rep ranges only */
      }
      return [d.name, ...exercises.map(line)].join('\n');
    }),
  );
  const title = (dayIds ? '' : p.name) || '';
  return [title, ...blocks].filter(Boolean).join('\n\n');
}

/**
 * Copies text made asynchronously. Safari allows the clipboard only within the tap, so the text is handed over
 * as a pending item when possible. Returns the text when it could not be copied (to show it for manual copying).
 */
export async function copyLater(make: Promise<string>): Promise<string | null> {
  const C = (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
  if (C && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new C({ 'text/plain': make.then((t) => new Blob([t], { type: 'text/plain' })) })]);
      return null;
    } catch {
      /* try plain text below */
    }
  }
  const text = await make;
  try {
    await navigator.clipboard.writeText(text);
    return null;
  } catch {
    return text;
  }
}
