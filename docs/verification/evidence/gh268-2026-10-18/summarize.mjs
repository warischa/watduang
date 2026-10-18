// Prints the per-route table (markdown) and aggregate counts from results.json.
import { readFileSync } from 'node:fs';
const j = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const rows = []; const agg = { 'play-exit': {}, 'play-edit-players': {} };
for (const [rid, r] of Object.entries(j)) for (const st of ['S1', 'S2a', 'S2']) for (const cid of ['play-exit', 'play-edit-players']) {
  if (!r[st]) continue; const c = r[st].controls[cid];
  if (!c.shown) { rows.push(`| ${rid} | ${st} | ${cid} | (not shown) | | | | | |`); continue; }
  const ch = c.hits.filter((h) => h.content);
  const top = ch[0];
  const n = ch.length; const anyKey = `${st}`;
  agg[cid][st] = agg[cid][st] || { shown: 0, overlap: 0 }; agg[cid][st].shown++; if (n) agg[cid][st].overlap++;
  rows.push(`| ${rid} | ${st} | ${cid} | ${top ? top.sel.split(' > ').slice(-2).join(' > ') : '-'} | ${top ? top.px2 : 0} | ${top ? (top.share * 100).toFixed(1) + '%' : '0%'} | ${top ? (top.controlWins ? 'control' : top.winner) : '-'} | ${n} | ${c.ignoredFullScreen} |`);
}
console.log('| route | state | control | top overlapped content element | px2 | share of control | tap winner at centre | content elements overlapped | full-screen ignored |\n|---|---|---|---|---|---|---|---|---|');
console.log(rows.join('\n'));
console.log('\nAGG', JSON.stringify(agg));
const worst = []; for (const [rid, r] of Object.entries(j)) for (const st of ['S1', 'S2']) for (const cid of ['play-exit', 'play-edit-players']) { const c = r[st].controls[cid]; if (!c.shown) continue; const t = c.hits.filter((h) => h.content)[0]; if (t) worst.push([t.px2, rid, st, cid, t.sel.split(' > ').pop(), (t.share * 100).toFixed(1), t.controlWins ? 'control' : t.winner]); }
worst.sort((a, b) => b[0] - a[0]); console.log('WORST', JSON.stringify(worst.slice(0, 8)));
for (const [rid, r] of Object.entries(j)) console.log(rid, 'S1open', r.S1.sharedScreenOpen, 'S2a open', r.S2a.sharedScreenOpen, r.notes.join(';'), '| S2 btns:', r.S2.visibleButtons, '| w', r.S1.innerWidth, r.S1.clientWidth, r.S2.innerWidth);
