// Writes the exercise technique (src/exerciseTechnique.ts) as a document to read: docs/technique.md.
//   npx tsx scripts/technique-doc.ts
import { writeFileSync } from 'fs';
import { catalog } from '../src/catalog';
import { TECHNIQUE } from '../src/exerciseTechnique';

const groups = new Map<string, string[]>();
const missing: string[] = [];
for (const e of catalog as Array<{ id: string; name: string; muscleGroup: string; equipment: string }>) {
  const tq = TECHNIQUE[e.id];
  if (!tq) {
    missing.push(e.id);
    continue;
  }
  const g = e.muscleGroup.split(' / ')[0];
  const text = [
    `### ${e.name}`,
    `*${e.muscleGroup} · ${e.equipment}*`,
    '',
    `**Исходное положение.** ${tq.setup}`,
    '',
    '**Выполнение.**',
    ...tq.steps.map((s, i) => `${i + 1}. ${s}`),
    '',
    '**Важно.**',
    ...tq.cues.map((s) => `- ${s}`),
    '',
    '**Частые ошибки.**',
    ...tq.mistakes.map((s) => `- ${s}`),
    '',
  ].join('\n');
  groups.set(g, [...(groups.get(g) || []), text]);
}
const out = [
  '# Техника упражнений',
  '',
  'Для всех упражнений базы приложения. Написано по современным тренерским стандартам; описания из открытой базы',
  'free-exercise-db использованы как основа и исправлены (например, «колени не должны выходить за носки» в приседе —',
  'устаревший миф). Пока не показывается в приложении: `src/exerciseTechnique.ts`.',
  '',
  ...[...groups].flatMap(([g, list]) => [`## ${g}`, '', ...list]),
].join('\n');
writeFileSync('docs/technique.md', out);
console.log(`упражнений: ${(catalog as unknown[]).length - missing.length}, без описания: ${missing.length ? missing.join(', ') : 'нет'}`);
