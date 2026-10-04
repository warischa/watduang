// gh#253 / ADR-0070 — the solo landings' pre-mount stage reserve, asserted by OUTCOME in a real browser.
//
//   npm run build && npx serve dist/ -l <port>
//   Chrome --headless --remote-debugging-port=<cdp> --user-data-dir=<fresh>
//   BASE=http://localhost:<port> CDP_PORT=<cdp> node scripts/driver.mjs scripts/stage-reserve-probe.mjs
//
// THE SET is read from the manifest at run time: every game with no playRoute, which is exactly the set
// src/pages/game/[id].astro builds a landing for. A literal page list would miss the next solo landing.
//
// Per page, per viewport (VIEWPORTS, default 1440x900, 768x900 and 390x844 — the last is a real phone
// viewport where the how-to section starts inside the first screen):
//   cls       — buffered layout-shift sum (hadRecentInput excluded), the instrument the 2026-10-04 audit
//               used, read after load and settle. Asserted <= MAX_CLS (0.05). Height equality is never
//               asserted: the first screen's height belongs to Thai wrapping and the font, not to us.
//   state     — #stage carries data-stage="mounted" (the page script released the reserve).
//   minBlock  — computed min-block-size of #stage AFTER mount is the initial value: 'auto' (the stage
//               is a flex item of .play-area) or '0px'. Anything else means the reserve outlived mount
//               and became an in-play floor (ADR-0014, ADR-0015).
//   declared  — the stage carries the game's --stage-reserve-* properties (liveness: a page that lost
//               the field would pass the two checks above while reserving nothing).
// Then ONE failure leg, last because the Fetch interception stays on for the tab: the first game's chunk
// is aborted at the network, the page reloads, and the stage must read data-stage="failed" with the
// initial min-block-size — no empty reserved hole over a page whose game never came. failedRequests must be
// non-empty, or the leg was never exercised and is reported as such.
//
// Prints { pass, failures, rows, failLeg }. driver.mjs exits 0 whatever this returns, so a caller reads
// `pass` from the JSON, never the exit code.
import { games } from '../src/games/manifest.ts';

const BASE = process.env.BASE || 'http://localhost:4321';
const MAX_CLS = Number(process.env.MAX_CLS || 0.05);
const VIEWPORTS = (process.env.VIEWPORTS || '1440x900,768x900,390x844').split(',').map((v) => v.split('x').map(Number));
const RELEASED = new Set(['auto', '0px']);
const SOLO = games.filter((g) => !g.playRoute).map((g) => g.id);

const READ = `
  await new Promise((r) => setTimeout(r, 300));
  const shifts = await new Promise((res) => { let sum = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) sum += e.value; }).observe({ type: 'layout-shift', buffered: true }); setTimeout(() => res(sum), 300); });
  const st = document.getElementById('stage');
  return { cls: +shifts.toFixed(4), state: st.dataset.stage ?? null, minBlock: getComputedStyle(st).minBlockSize,
    declared: st.style.getPropertyValue('--stage-reserve-wide') !== '' && st.style.getPropertyValue('--stage-reserve-phone') !== '',
    innerWidth, innerHeight };
`;

export default async function (session) {
  const rows = [];
  const failures = [];
  if (SOLO.length === 0) failures.push('manifest yields no solo landing: the probe would measure nothing');
  for (const [w, h] of VIEWPORTS) {
    await session.setWidth(w, h, w < 640);
    for (const id of SOLO) {
      await session.nav(`${BASE}/game/${id}/`);
      const r = await session.evaluate(READ);
      const row = { id, viewport: `${w}x${h}`, ...(r.value ?? { error: r.error }) };
      rows.push(row);
      if (row.error) { failures.push(`${id} ${row.viewport}: ${row.error}`); continue; }
      if (!(row.cls <= MAX_CLS)) failures.push(`${id} ${row.viewport}: CLS ${row.cls} > ${MAX_CLS}`);
      if (row.state !== 'mounted') failures.push(`${id} ${row.viewport}: data-stage is ${row.state}, expected mounted`);
      if (!RELEASED.has(row.minBlock)) failures.push(`${id} ${row.viewport}: min-block-size after mount is ${row.minBlock}, expected auto or 0px`);
      if (!row.declared) failures.push(`${id} ${row.viewport}: no --stage-reserve-* on #stage`);
    }
  }

  let failLeg = null;
  if (SOLO.length) {
    const id = SOLO[0];
    await session.setWidth(1440, 900, false);
    await session.failRequests(`*_astro/${id}.*.js`, { reason: 'Failed' });
    await session.nav(`${BASE}/game/${id}/`);
    const r = await session.evaluate(READ);
    failLeg = { id, aborted: session.failedRequests.map((f) => f.url), ...(r.value ?? { error: r.error }) };
    if (failLeg.aborted.length === 0) failures.push(`fail leg ${id}: no request was aborted — leg not exercised`);
    else {
      if (failLeg.state !== 'failed') failures.push(`fail leg ${id}: data-stage is ${failLeg.state}, expected failed`);
      if (!RELEASED.has(failLeg.minBlock)) failures.push(`fail leg ${id}: min-block-size is ${failLeg.minBlock}, expected auto or 0px (a reserved hole over a failed page)`);
    }
  }

  await session.close();
  const pass = failures.length === 0;
  return { pass, maxCls: MAX_CLS, failures, rows, failLeg };
}
