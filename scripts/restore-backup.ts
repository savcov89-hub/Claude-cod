// Turns a decrypted weekly backup (rows of kv_rows, see .github/workflows/backup.yml) into SQL that puts
// every row back: rows present in the backup are restored as they were (same id, data and order),
// rows added later are left alone. Run the SQL in the Supabase SQL Editor or through the API.
//   openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in 2026-10-04.json.gz.enc -out rows.json.gz && gunzip rows.json.gz
//   npx tsx scripts/restore-backup.ts rows.json > restore.sql
import { readFileSync } from 'node:fs';

interface Row {
  tbl: string;
  id: string;
  data: string;
  seq: number | string;
}

const file = process.argv[2];
if (!file) {
  console.error('Usage: npx tsx scripts/restore-backup.ts rows.json > restore.sql');
  process.exit(1);
}
const rows = JSON.parse(readFileSync(file, 'utf8')) as Row[];
if (!Array.isArray(rows) || !rows.length) throw new Error('No rows in ' + file);

// Dollar quoting with a tag that never occurs in the text keeps the JSON exactly as stored.
const quote = (text: string) => {
  let tag = 'r';
  while (text.includes('$' + tag + '$')) tag += 'r';
  return `$${tag}$${text}$${tag}$`;
};

const out: string[] = ['begin;'];
for (let i = 0; i < rows.length; i += 200) {
  const values = rows
    .slice(i, i + 200)
    .map((r) => `(${quote(r.tbl)}, ${quote(r.id)}, ${quote(typeof r.data === 'string' ? r.data : JSON.stringify(r.data))}::json, ${Number(r.seq)})`)
    .join(',\n  ');
  out.push(
    `insert into public.kv_rows (tbl, id, data, seq) overriding system value values\n  ${values}\n` +
      `on conflict (tbl, id) do update set data = excluded.data;`,
  );
}
out.push(`select setval(pg_get_serial_sequence('public.kv_rows', 'seq'), (select max(seq) from public.kv_rows));`);
out.push('commit;');
console.log(out.join('\n'));
console.error(`${rows.length} rows`);
