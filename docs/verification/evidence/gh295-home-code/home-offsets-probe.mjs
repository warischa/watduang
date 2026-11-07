// gh#295 B4: where the fortune and tools sections start on the home page, before and after the shelf
// de-duplication, at the board's three viewports, n=3 each. Offsets are page y from the offsetTop chain
// (the scroll reveal's 16px translate on below-the-fold sections is not in them). Adapted from the
// board worker's probe beside the boards; BASE and SHOTDIR come from the environment, LABEL names the
// build. Red = the default export throws after the run, listing every failed check, so driver.mjs exits
// non-zero. LABEL=before records the unfixed build as the control: there the de-duplication checks are the
// thing being shown, so they are skipped; every other label asserts them. Run: CDP_PORT=9352 BASE=http://localhost:9362 LABEL=after node scripts/driver.mjs <this file>
const BASE = process.env.BASE;
const LABEL = process.env.LABEL || 'run';
const body = `
await document.fonts.ready;
await new Promise(r => setTimeout(r, 300));
const top = (el) => { if (!el) return null; let y = 0; for (let e = el; e; e = e.offsetParent) y += e.offsetTop; return y; };
const sec = (id) => document.getElementById(id)?.closest('section');
const shelfGrid = document.querySelector('.grid-shelf');
const shelf = [...document.querySelectorAll('.grid-shelf > a')];
const hrefs = [...document.querySelectorAll('main a[href]')].map(a => a.getAttribute('href')).filter(h => h.startsWith('/game/'));
const gameHrefCounts = {};
for (const h of hrefs) gameHrefCounts[h] = (gameHrefCounts[h] || 0) + 1;
const de = document.documentElement;
return {
  innerWidth, innerHeight, scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, docHeight: de.scrollHeight,
  fortuneTop: top(sec('fortune')), toolsTop: top(sec('tools')),
  shelfCount: shelf.length,
  shelfCols: getComputedStyle(shelfGrid).gridTemplateColumns.split(' ').length,
  shelfHeight: shelfGrid.offsetHeight,
  highlightTiles: document.querySelectorAll('.grid-shelf [data-highlight]').length,
  gameHrefsTwice: Object.entries(gameHrefCounts).filter(([, n]) => n > 1).map(([h]) => h),
  distinctGameHrefs: Object.keys(gameHrefCounts).length,
};`;
const finite = (n) => typeof n === 'number' && Number.isFinite(n);

function failures(out) {
  const fails = [];
  for (const row of out) {
    const at = `${row.w}x${row.h}#${row.run}`;
    if (row.error) { fails.push(`${at}: page read failed (${row.error})`); continue; }
    if (row.innerWidth !== row.w) fails.push(`${at}: innerWidth ${row.innerWidth}, run void`);
    if (!(row.scrollWidth <= row.clientWidth)) fails.push(`${at}: horizontal overflow (scrollWidth ${row.scrollWidth} > clientWidth ${row.clientWidth})`);
    if (!finite(row.fortuneTop) || !finite(row.toolsTop)) fails.push(`${at}: section offsets not finite (fortune ${row.fortuneTop}, tools ${row.toolsTop})`);
    if (!(row.shelfCount > 0)) fails.push(`${at}: shelf is empty (${row.shelfCount})`);
    if (LABEL === 'before') continue;
    if (row.gameHrefsTwice?.length !== 0) fails.push(`${at}: game links repeated on the page: ${JSON.stringify(row.gameHrefsTwice)}`);
    if (row.highlightTiles !== 0) fails.push(`${at}: ${row.highlightTiles} highlight tiles still in the shelf`);
  }
  return fails;
}

export default async function (session) {
  const out = [];
  for (const [w, h] of [[390, 844], [320, 568], [1280, 800]]) {
    for (let i = 0; i < 3; i++) {
      await session.setWidth(w, h);
      await session.nav(BASE + '/');
      const r = await session.evaluate(body);
      out.push({ label: LABEL, w, h, run: i + 1, ...(r.value ?? r) });
      if (i === 0 && process.env.SHOTDIR) {
        // The shelf sits below the fold: bring it into view and let the scroll reveal finish first.
        await session.evaluate(`document.querySelector('.grid-shelf').scrollIntoView({ block: 'start' }); await new Promise(r => setTimeout(r, 900)); return true;`);
        await session.screenshot(`${process.env.SHOTDIR}/home-${LABEL}-${w}.png`);
      }
    }
  }
  const fails = failures(out);
  out.push({ consoleErrors: session.consoleErrors });
  if (fails.length) throw new Error(`home offsets probe red (${fails.length}): ${fails.join(' | ')}`);
  return out;
}
