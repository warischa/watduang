// gh#114 — measures the ad slot's absolute top before vs after the FIRST watduang:start event on
// each name-entry tool page (draw/team/wheel), which is the exact moment a submitted name list first
// reaches the tool (ToolNameEntry -> #name-start click -> 'watduang:start'). number.astro carries no
// ToolNameEntry at all (verified by reading the file), so it has no analog to reproduce; it is still
// probed for a sane before/after around its own first action for completeness.
//
// READ-ONLY — makes no src/ changes.
//
// Trap this probe exists to avoid (docs/agents/browser-verification.md, "settle before the baseline
// read"): reading the ad slot's rect while a synchronous DOM mutation is still one animation frame
// from painting reports the WRONG number. measureAdTopStable() only resolves once the ad slot's
// getBoundingClientRect().top has held steady across 5 consecutive rAF ticks, so both the "before"
// and "after" reads are taken on a genuinely settled layout, never mid-flight.
//
// Run:
//   npm run build && npx serve dist/ -l 4321 &
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
//     --no-sandbox --remote-debugging-port=9222 --user-data-dir=/tmp/adreflow-prof &
//   node scripts/driver.mjs scripts/ad-reflow-first-list-load-probe.mjs

const BASE = process.env.PROBE_BASE || 'http://localhost:4321';
const WIDTHS = [320, 390];
const LONG_NAMES = ['ชื่อทดสอบยาวมากหนึ่ง', 'ชื่อทดสอบยาวมากสอง', 'ชื่อทดสอบยาวมากสาม', 'ชื่อทดสอบยาวมากสี่'];

// Evaluated in-page. Resolves the ad slot's rect.top once it has been unchanged (within 0.05px) for
// 5 consecutive requestAnimationFrame ticks — the settle-before-baseline-read discipline the brief
// requires, not a fixed sleep.
const SETTLE_SNIPPET = `
  return await new Promise((resolve) => {
    let last = null, stable = 0;
    function tick() {
      const ad = document.querySelector('.ad-slot');
      if (!ad) { resolve(null); return; }
      const top = ad.getBoundingClientRect().top;
      if (last !== null && Math.abs(top - last) < 0.05) stable++;
      else stable = 0;
      last = top;
      if (stable >= 5) { resolve(top); return; }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
`;

async function settledAdTop(session) {
  const r = await session.evaluate(SETTLE_SNIPPET);
  if (r.error) return { error: r.error };
  return { value: r.value };
}

async function measureNameEntryPage(session, path, width) {
  const url = `${BASE}${path}`;
  await session.nav(url);
  await session.setWidth(width, 1400);
  await session.wipe();
  const storageKey =
    path === '/tool/draw/'
      ? 'watduang:tool:draw-names'
      : path === '/tool/team/'
        ? 'watduang:tool:team-names'
        : 'watduang:tool:wheel-names';
  await session.evaluate(
    `localStorage.setItem(${JSON.stringify(storageKey)}, ${JSON.stringify(JSON.stringify(LONG_NAMES))}); return true;`
  );
  await session.nav(url); // reload same tab so ToolNameEntry reads the seeded list on its own render()
  await session.setWidth(width, 1400);

  const before = await settledAdTop(session);
  if (before.error) return { path, width, verdict: 'FAIL(unmeasurable)', reason: before.error };
  if (before.value === null) return { path, width, verdict: 'FAIL(unmeasurable)', reason: '.ad-slot not found before' };

  const startClick = await session.evaluate(`
    const btn = document.getElementById('name-start');
    if (!btn) return { missing: true };
    btn.click(); // dispatches watduang:start with the seeded players, same as a real tap
    return { missing: false };
  `);
  if (startClick.error) return { path, width, verdict: 'FAIL(unmeasurable)', reason: startClick.error };
  if (startClick.value?.missing) return { path, width, verdict: 'FAIL(unmeasurable)', reason: '#name-start not found' };

  const after = await settledAdTop(session);
  if (after.error) return { path, width, verdict: 'FAIL(unmeasurable)', reason: after.error };
  if (after.value === null) return { path, width, verdict: 'FAIL(unmeasurable)', reason: '.ad-slot not found after' };

  const deltaPx = Math.round((after.value - before.value) * 100) / 100;
  return {
    path, width,
    beforeY: Math.round(before.value * 100) / 100,
    afterY: Math.round(after.value * 100) / 100,
    deltaPx,
    verdict: Math.abs(deltaPx) < 1 ? 'PASS' : 'FAIL',
  };
}

// number.astro has no ToolNameEntry / no name list (verified by reading the file) — this measures its
// own first action (pressing "สุ่ม" after filling min/max) purely so the report has a number for every
// page, not because the ticket's premise applies here.
async function measureNumberPage(session, width) {
  const path = '/tool/number/';
  const url = `${BASE}${path}`;
  await session.nav(url);
  await session.setWidth(width, 1400);
  await session.wipe();

  const before = await settledAdTop(session);
  if (before.error) return { path, width, verdict: 'FAIL(unmeasurable)', reason: before.error };
  if (before.value === null) return { path, width, verdict: 'FAIL(unmeasurable)', reason: '.ad-slot not found before' };

  const setup = await session.evaluate(`
    const min = document.getElementById('number-min');
    const max = document.getElementById('number-max');
    const go = document.getElementById('number-go');
    if (!min || !max || !go) return { missing: true };
    min.value = '1'; min.dispatchEvent(new Event('input', { bubbles: true }));
    max.value = '100'; max.dispatchEvent(new Event('input', { bubbles: true }));
    go.click();
    return { missing: false };
  `);
  if (setup.error) return { path, width, verdict: 'FAIL(unmeasurable)', reason: setup.error };
  if (setup.value?.missing) return { path, width, verdict: 'FAIL(unmeasurable)', reason: 'number controls not found' };

  const after = await settledAdTop(session);
  if (after.error) return { path, width, verdict: 'FAIL(unmeasurable)', reason: after.error };
  if (after.value === null) return { path, width, verdict: 'FAIL(unmeasurable)', reason: '.ad-slot not found after' };

  const deltaPx = Math.round((after.value - before.value) * 100) / 100;
  return {
    path, width,
    beforeY: Math.round(before.value * 100) / 100,
    afterY: Math.round(after.value * 100) / 100,
    deltaPx,
    verdict: Math.abs(deltaPx) < 1 ? 'PASS' : 'FAIL',
    note: 'no ToolNameEntry on this page — measures its own first result reveal, not a name-list load',
  };
}

export default async function (session) {
  const results = [];
  for (const width of WIDTHS) {
    results.push(await measureNameEntryPage(session, '/tool/draw/', width));
    results.push(await measureNameEntryPage(session, '/tool/team/', width));
    results.push(await measureNameEntryPage(session, '/tool/wheel/', width));
    results.push(await measureNumberPage(session, width));
  }
  return { results, allPass: results.every((r) => r.verdict === 'PASS') };
}
