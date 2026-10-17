import { readFileSync, readdirSync } from 'node:fs';
const dir = new URL('.', import.meta.url).pathname, tag = process.argv[2] || 'interleave';
const med = (a) => { const x = [...a].sort((p, q) => p - q); return x.length % 2 ? x[(x.length - 1) / 2] : (x[x.length / 2 - 1] + x[x.length / 2]) / 2; };
for (const who of ['B', 'F']) {
  const rows = [], voids = [];
  for (const f of readdirSync(dir).filter((n) => n.startsWith(`il-${tag}-${who}-`) && n.endsWith('.json')).sort((a, b) => parseInt(a.split('-').pop()) - parseInt(b.split('-').pop()))) for (const r of JSON.parse(readFileSync(dir + f)).runs) (r.void ? voids : rows).push(r);
  const p1 = rows.filter((r) => r.path === 'P1'), h = rows.filter((r) => r.path === 'H');
  const s = (a) => a.length ? { each: a, median: med(a), max: Math.max(...a) } : null;
  console.log(who, JSON.stringify({ P1press: s(p1.map((r) => r.pressableMs)), open: p1.map((r) => r.openAtMs), lock: s(p1.map((r) => r.lockWaitMaxMs)), H: s(h.map((r) => r.firstFrameMs)), le1000: p1.filter((r) => r.pressableMs <= 1000).length, voids: voids.map((r) => r.path + ':' + r.void) }));
}
