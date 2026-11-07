import { readFileSync } from 'node:fs';
const [rep, txt] = process.argv.slice(2);
const r = JSON.parse(readFileSync(rep, 'utf8'));
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const t = norm(readFileSync(txt, 'utf8'));
let bad = 0;
for (const k of ['policy1440', 'policy390']) {
  const b = norm(r[k]);
  if (b !== t) { bad++; let i = 0; while (i < b.length && b[i] === t[i]) i++; console.log(k, 'DIFF at char', i, JSON.stringify(b.slice(i - 20, i + 20)), 'vs', JSON.stringify(t.slice(i - 20, i + 20))); }
  else console.log(k, 'EQUAL', b.length, 'chars');
}
process.exit(bad ? 1 : 0);
