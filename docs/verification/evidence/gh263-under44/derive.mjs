// Derives control.json and groups.md from the probe outputs. No browser, no page access.
//   OLD_DIR=<dir holding old-320.json and old-1440.json: raw stdout of the UNMODIFIED gh#262 probe> \
//     node docs/verification/evidence/gh263-under44/derive.mjs
// Reads under44-320.json / under44-1440.json from its own directory.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const HERE = dirname(fileURLToPath(import.meta.url));
const OLD_DIR = process.env.OLD_DIR;
if (!OLD_DIR) throw new Error('OLD_DIR is required');
const WIDTHS = [320, 1440];
const load = (p) => JSON.parse(readFileSync(p, 'utf8'));

// One cell = one page at one width. True only when the old probe's count equals the new list length AND the
// old first-8 sample deep-equals the first 8 new rows projected to the old fields {el, w, h}. The new
// probe's own under44Sample is held to the same standard, so the label function is compared too.
const project = (r) => ({ el: r.el, w: r.w, h: r.h });
function compare(oldPage, newPage) {
  const rows = newPage.under44Rows;
  const first8 = rows.slice(0, 8).map(project);
  const countEq = oldPage.under44 === rows.length;
  const newCountEq = newPage.under44 === rows.length;
  const sampleEq = isDeepStrictEqual(oldPage.under44Sample, first8);
  const ownSampleEq = isDeepStrictEqual(oldPage.under44Sample, newPage.under44Sample.map(project));
  return { path: oldPage.path, oldCount: oldPage.under44, newListLength: rows.length, countEq, newCountEq, sampleEq, ownSampleEq, ok: countEq && newCountEq && sampleEq && ownSampleEq };
}

const cells = [];
const data = {};
for (const w of WIDTHS) {
  const o = load(join(OLD_DIR, `old-${w}.json`));
  const n = load(join(HERE, `under44-${w}.json`));
  data[w] = n;
  if (o.pages.length !== n.pages.length) throw new Error(`page count differs at ${w}`);
  o.pages.forEach((op, i) => {
    if (op.path !== n.pages[i].path) throw new Error(`page order differs at ${w} #${i}`);
    cells.push({ width: w, ...compare(op, n.pages[i]) });
  });
}

// Must-red: the comparator has to go red on a list that is wrong in each way it claims to catch.
const o320 = load(join(OLD_DIR, 'old-320.json'));
const pick = o320.pages.findIndex((p) => p.under44 >= 8);
const base = structuredClone(data[320].pages[pick]);
const dropped = structuredClone(base); dropped.under44Rows.pop(); dropped.under44 = dropped.under44Rows.length;
const edited = structuredClone(base); edited.under44Rows[0].h += 1;
const swapped = structuredClone(base); [swapped.under44Rows[0], swapped.under44Rows[1]] = [swapped.under44Rows[1], swapped.under44Rows[0]];
const mustRed = {
  page: base.path,
  unmodified: compare(o320.pages[pick], base).ok,
  droppedRowGoesRed: !compare(o320.pages[pick], dropped).ok,
  editedHeightGoesRed: !compare(o320.pages[pick], edited).ok,
  swappedOrderGoesRed: !compare(o320.pages[pick], swapped).ok,
};
mustRed.allRed = mustRed.droppedRowGoesRed && mustRed.editedHeightGoesRed && mustRed.swappedOrderGoesRed && mustRed.unmodified;

const control = { cells: cells.length, allTrue: cells.every((c) => c.ok), mustRed, detail: cells };
writeFileSync(join(HERE, 'control.json'), JSON.stringify(control, null, 1) + '\n');

// groups.md
const rng = (a) => { const lo = Math.min(...a), hi = Math.max(...a); return lo === hi ? `${lo}` : `${lo}-${hi}`; };
const target = (r) => r.tag + (r.classes ? '.' + r.classes.split(' ').join('.') : '');
let md = '# Under-44 touch targets by group\n\n';
md += 'Group key: viewport x component x target (tag + own classes) x raw height x effective height. Width is a range\n';
md += 'inside the group (text-driven). Component and effective-box rules: README. Sorted by rows desc within a viewport.\n';
const totals = {};
const roll = {};
for (const w of WIDTHS) {
  const rows = data[w].pages.flatMap((p) => p.under44Rows);
  const sumLists = data[w].pages.reduce((s, p) => s + p.under44Rows.length, 0);
  if (rows.length !== sumLists) throw new Error('rows != sum of lists');
  const groups = new Map();
  for (const r of rows) {
    const k = [r.component, target(r), r.h, r.effH].join('|');
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const list = [...groups.values()].sort((a, b) => b.length - a.length || a[0].component.localeCompare(b[0].component));
  const sumG = list.reduce((s, g) => s + g.length, 0);
  if (sumG !== sumLists) throw new Error('groups do not partition the rows');
  totals[w] = { rows: sumLists, groups: list.length, underByEffective: rows.filter((r) => r.underByEffective).length, perPage: data[w].pages.map((p) => `${p.path}=${p.under44Rows.length}`).join(' ') };
  md += `\n## ${w}px\n\n| component | target | w | h | effective w x h | pages | rows | underByEffective |\n|---|---|---|---|---|---|---|---|\n`;
  for (const g of list) {
    const r = g[0];
    md += `| ${r.component} | ${target(r)} | ${rng(g.map((x) => x.w))} | ${r.h} | ${rng(g.map((x) => x.effW))} x ${r.effH} | ${new Set(g.map((x) => x.path)).size} | ${g.length} | ${g.filter((x) => x.underByEffective).length} |\n`;
  }
  md += `\nTotal ${w}px: ${sumG} rows in ${list.length} groups = sum of per-page list lengths (${totals[w].perPage}). underByEffective: ${totals[w].underByEffective}.\n`;
  // Roll-up per component, all sizes, for one-ruling-per-component reading.
  const byComp = new Map();
  for (const r of rows) { if (!byComp.has(r.component)) byComp.set(r.component, []); byComp.get(r.component).push(r); }
  roll[w] = [...byComp.entries()].sort((a, b) => b[1].length - a[1].length);
  md += `\n### ${w}px roll-up by component\n\n| component | rows | pages | heights | underByEffective |\n|---|---|---|---|---|\n`;
  for (const [c, g] of roll[w]) md += `| ${c} | ${g.length} | ${new Set(g.map((x) => x.path)).size} | ${[...new Set(g.map((x) => x.h))].sort((a, b) => a - b).join(',')} | ${g.filter((x) => x.underByEffective).length} |\n`;
}
writeFileSync(join(HERE, 'groups.md'), md);
console.log(JSON.stringify({ controlAllTrue: control.allTrue, cells: control.cells, mustRed, totals }, null, 1));
