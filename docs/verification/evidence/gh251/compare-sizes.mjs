// gh#251: compare two body-font-probe captures element by element (key = selector path + text
// snippet) and list every element whose computed font size changed, appeared or vanished.
//   node compare-sizes.mjs before-1440.json after-1440.json
import { readFileSync } from 'node:fs';

const [a, b] = process.argv.slice(2).map((f) => JSON.parse(readFileSync(f, 'utf8')));
const key = (r) => `${r.sel}|${r.text}`;
let total = 0;
const diffs = [];
for (const pa of a.pages) {
  const pb = b.pages.find((p) => p.path === pa.path);
  if (!pb) { diffs.push(`${pa.path}: page missing in second capture`); continue; }
  if (pa.rows.length !== pb.rows.length) diffs.push(`${pa.path}: row count ${pa.rows.length} -> ${pb.rows.length}`);
  const mb = new Map(pb.rows.map((r) => [key(r), r]));
  for (const r of pa.rows) {
    total++;
    const o = mb.get(key(r));
    if (!o) diffs.push(`${pa.path}: missing ${key(r)}`);
    else if (o.fs !== r.fs) diffs.push(`${pa.path}: ${r.fs} -> ${o.fs} ${key(r)}`);
  }
}
console.log(`compared ${total} elements on ${a.pages.length} pages; diffs ${diffs.length}`);
for (const d of diffs) console.log(`  ${d}`);
