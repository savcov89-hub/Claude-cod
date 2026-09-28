import fs from 'fs';
import { createHandler } from '../backend/app';
import { sdk, tables } from '../src/local/sdk';
import { seed } from '../src/local/seed';
const handle: any = createHandler(sdk);
const call = async (actor: string, method: string, path: string, body?: unknown) => {
  const res = await handle(method, path, body, { userId: actor, name: actor === 'demo-trainer' ? 'Михаил · тренер' : ({ 'demo-u0': 'Александр', 'demo-u1': 'Мария', 'demo-u2': 'Дмитрий', 'demo-u3': 'Анна' } as any)[actor], email: '' });
  if (res.status >= 400) throw new Error(path + ': ' + res.data?.error);
  return res.data;
};
await seed(call);
const dir = process.argv[2];
fs.mkdirSync(dir, { recursive: true });
const writes: any[] = [];
for (const [name, rows] of tables) {
  const id = name.replace(/[^a-zA-Z0-9_\-.~:@+]/g, '_').slice(0, 190);
  const file = dir + '/' + id + '.json';
  fs.writeFileSync(file, JSON.stringify({ name, rows }));
  writes.push({ op: 'set', collection: 'tables', doc_id: id, file_path: file });
}
for (let i = 0; i < writes.length; i += 50) fs.writeFileSync(dir + '/../batch-' + i / 50 + '.json', JSON.stringify(writes.slice(i, i + 50)));
console.log(writes.length, 'docs', Math.max(...[...tables.values()].map((r) => JSON.stringify(r).length)), 'max bytes');
