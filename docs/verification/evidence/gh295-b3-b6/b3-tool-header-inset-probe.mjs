// gh#295 B3: the ToolHeader h1 must not touch the viewport edge on the desktop form.
// Invariant: on every tool page at every desktop width (1100, 1280, 1440), h1 left >= the phone
// form's inline padding, MEASURED off the phone render (computed padding-left of .tool-band-inner
// at 390), never typed in here. With PROBE_BASELINE set to an earlier result file, every row that
// already held the inset there (phone widths, and 1440) must keep the exact same h1 left.
//
// Run (driver.mjs attaches to an already-running Chrome; ports are per-run, see the runbook):
//   CDP_PORT=9334 PROBE_BASE=http://localhost:9344 PROBE_OUT=<result.json> \
//     [PROBE_BASELINE=<earlier result.json>] node scripts/driver.mjs <this file>
// Red = the probe throws after writing PROBE_OUT, so driver.mjs exits 1.
import { readFileSync, writeFileSync } from 'node:fs';

const PAGES = ['wheel', 'number', 'draw', 'team'];
const WIDTHS = [
  { w: 320, h: 568, mobile: true },
  { w: 390, h: 844, mobile: true },
  { w: 1100, h: 900, mobile: false },
  { w: 1280, h: 900, mobile: false },
  { w: 1440, h: 900, mobile: false },
];

const READ = `
  const inner = document.querySelector('.tool-band-inner');
  const h1 = document.querySelector('.tool-band-inner h1');
  if (!inner || !h1) return { missing: true };
  const cs = getComputedStyle(inner);
  return {
    innerWidth,
    h1Left: h1.getBoundingClientRect().left,
    innerPadLeft: parseFloat(cs.paddingLeft),
    innerPadRight: parseFloat(cs.paddingRight),
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  };
`;

export default async function (session) {
  const base = process.env.PROBE_BASE || 'http://localhost:9344';
  const rows = [];
  for (const page of PAGES) {
    for (const { w, h, mobile } of WIDTHS) {
      await session.setWidth(w, h, mobile);
      await session.nav(`${base}/tool/${page}/`);
      const r = await session.evaluate(READ);
      if (r.error) throw new Error(`${page}@${w}: ${r.error}`);
      rows.push({ page, width: w, ...r.value });
    }
  }

  const fails = [];
  for (const row of rows) {
    if (row.missing) fails.push(`${row.page}@${row.width}: no .tool-band-inner h1`);
    else if (row.innerWidth !== row.width) fails.push(`${row.page}@${row.width}: innerWidth ${row.innerWidth}, run void`);
  }
  // The reference inset is the phone form's own value, read off each page's 390 render.
  const phonePad = {};
  for (const row of rows) if (row.width === 390) phonePad[row.page] = row.innerPadLeft;
  for (const row of rows) {
    if (row.width < 1100) continue;
    const ref = phonePad[row.page];
    if (!(ref > 0)) fails.push(`${row.page}: phone inline padding unreadable (${ref})`);
    else if (row.h1Left < ref) fails.push(`${row.page}@${row.width}: h1 left ${row.h1Left} < phone inline padding ${ref}`);
  }
  if (process.env.PROBE_BASELINE) {
    const baseline = JSON.parse(readFileSync(process.env.PROBE_BASELINE, 'utf8')).rows;
    // A row that already held the inset in the baseline must not move: the phone widths, and 1440,
    // the one width the board draws.
    for (const row of rows) {
      const was = baseline.find((b) => b.page === row.page && b.width === row.width);
      if (!was) { fails.push(`${row.page}@${row.width}: no baseline row`); continue; }
      if (was.h1Left < phonePad[row.page]) continue;
      if (was.h1Left !== row.h1Left) fails.push(`${row.page}@${row.width}: h1 left moved ${was.h1Left} -> ${row.h1Left}`);
    }
  }

  const out = { probe: 'gh295-b3-tool-header-inset', base, n: rows.length, phonePad, pass: fails.length === 0, fails, rows };
  if (process.env.PROBE_OUT) writeFileSync(process.env.PROBE_OUT, JSON.stringify(out, null, 2) + '\n');
  if (fails.length) throw new Error(`B3 red (${fails.length}): ${fails.join(' | ')}`);
  return out;
}
