// Exercise pictures (src/ui/figure): joint limits, feet on the floor, the weight over the foot, through the whole
// movement; and a sheet to look at — the reference photos next to the drawing (start, middle, end).
//   npx tsx scripts/check-figures.tsx [sheet.html] [photos dir]
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { MOVES } from '../src/ui/figure/moves';
import { FigurePose } from '../src/ui/figure';
import { FLOOR, joints, jointProblems, mix, type Pose } from '../src/ui/figure/rig';

const out = process.argv[2];
const photos = process.argv[3];
/** Photos to compare with (free-exercise-db names); the photos themselves are fetched by the person checking. */
const REF: Record<string, string> = JSON.parse(readFileSync('scripts/figure-refs.json', 'utf8'));
/** ONLY=id,id — just these exercises on the sheet. */
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;

const at = (frames: Pose[], t: number) => {
  const k = t * (frames.length - 1);
  const i = Math.min(frames.length - 2, Math.floor(k));
  return mix(frames[i], frames[i + 1], k - i);
};

let failures = 0;
const rows: string[] = [];
for (const [id, m] of Object.entries(MOVES)) {
  if (only && !only.has(id)) continue;
  const problems = new Set<string>();
  for (let s = 0; s <= 40; s++) {
    const t = s / 40;
    const j = joints(at(m.frames, t));
    const tag = `t=${t.toFixed(2)}: `;
    for (const p of jointProblems(j, { wideArms: m.wideArms })) problems.add(tag + p);
    // Nothing under the floor; standing feet flat on it.
    for (const [name, v] of Object.entries({ head: j.head, hand: j.hand, knee: j.knee, toe: j.toe, heel: j.heel }))
      if (v[1] > FLOOR - 0.6) problems.add(tag + name + ' под полом');
    if (m.standing)
      for (const v of [j.toe, j.heel, j.toe2, j.heel2]) if (Math.abs(v[1] - (FLOOR - 3)) > 0.3) problems.add(tag + 'стопа не на полу');
    if (m.balance && m.standing) {
      const w = m.balance(j);
      const mid = (j.heel[0] + j.toe[0]) / 2;
      if (Math.abs(w[0] - mid) > 3.5) problems.add(tag + `вес не над стопой (${(w[0] - mid).toFixed(1)})`);
    }
  }
  const list = [...problems];
  if (list.length) failures++;
  console.log(`${list.length ? '✗' : '✓'} ${id}${list.length ? '\n    ' + list.slice(0, 12).join('\n    ') : ''}`);
  if (out) {
    const svg = (t: number, size: number) => renderToString(h(FigurePose, { move: m, t, size }));
    const ref = REF[id] && photos && existsSync(`${photos}/${REF[id]}-0.jpg`)
      ? [0, 1].map((i) => `<img src="file://${photos}/${REF[id]}-${i}.jpg" height="150">`).join('')
      : '';
    rows.push(
      `<div class="row"><b>${id}</b><div class="pics">${ref}</div><div class="pics">${[0, 0.5, 1].map((t) => svg(t, Number(process.env.SIZE || 210))).join('')}${renderToString(h(FigurePose, { move: m, t: 1, size: 44, close: true }))}</div><div class="pics">${Array.from({ length: 9 }, (_, i) => renderToString(h(FigurePose, { move: m, t: i / 8, size: 96 }))).join('')}</div></div>`,
    );
  }
}
if (out) {
  const css = readFileSync('src/app.css', 'utf8') + readFileSync('src/ui/figure/figure.css', 'utf8');
  writeFileSync(
    out,
    `<!doctype html><meta charset=utf-8><style>${css}</style><style>body{background:var(--bg);padding:10px;font:13px sans-serif}.row{background:var(--surface);border-radius:10px;padding:8px;margin-bottom:8px;display:grid;gap:6px}.pics{display:flex;gap:6px;align-items:center}svg{background:var(--surface)}</style>${rows.join('')}`,
  );
}
console.log(failures ? `\nупражнений с ошибками: ${failures}` : '\nвсе позы в пределах');
process.exit(failures ? 1 : 0);
