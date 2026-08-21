// gh#54, one retry deep — after a mount that threw, is the panel still there on the SECOND press?
//
// Run: node scripts/driver.mjs docs/verification/evidence/54/gh54-retry-probe.mjs
// Env: PROBE_BASE (default http://localhost:4322), PROBE_LABEL (recorded in the output).
//
// Why a second press is its own scenario. The handler under test
// (src/pages/game/[id].astro's watduang:start listener) caches the module in `game`. First press:
// `await load()` suspends, so a throw is caught in a MICROTASK, after requestStart already ran its
// `root.hidden = true`. Second press: `game` is cached, nothing in the try block awaits, so the throw
// is caught SYNCHRONOUSLY inside dispatchEvent — the stack is still inside requestStart, whose
// `root.hidden = true` then runs afterwards and re-hides the panel the catch just restored. That is
// gh#54's exact data-loss state (no round + root.hidden true → planClear reads roundLive → Clear group
// wipes the group), reachable only on a retry.
//
// Only love-match reaches the sync path: its chunk loads fine and `default.mount()` throws, so `game`
// is cached by the failed first press. short-stick's chunk throws on evaluation, so `await load()`
// rejects every time and `game` stays null — its retry is still the async path, which is why it is
// driven here as the unchanged-first-failure case rather than as a second retry sample.
//
// Detector calibrated both ways in one run: pick-loser's chunk is untouched, so its panel MUST end up
// hidden (a real mount happened). A run where pick-loser leaves the panel visible is void — the probe
// would be reporting "panel visible" for every page regardless of the code under test.
const BASE = process.env.PROBE_BASE || 'http://localhost:4322';
const LABEL = process.env.PROBE_LABEL || 'unlabelled';
const NAMES = ['สมชาย', 'ปูเป้', 'ก้อง'];

// #player-setup IS the `root` whose .hidden PlayerSetup.astro hands planClear as roundLive, so one
// read answers both "is the panel usable" and "would Clear group think a round is live".
const READ = `
  const p = document.getElementById('player-setup');
  const s = document.getElementById('start-round');
  const stage = document.getElementById('stage');
  if (s) s.scrollIntoView(); // elementFromPoint resolves against the VIEWPORT, not the document
  const r = s ? s.getBoundingClientRect() : null;
  const rects = s ? s.getClientRects().length : -1;
  const at = rects > 0 ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
  return {
    rootHidden: p ? p.hidden : null,
    roundLive: p ? p.hidden : null,
    startRects: rects,
    elementFromPoint: at ? (at.id || at.tagName) : null,
    startDisabled: s ? s.disabled : null,
    stillTicked: [...document.querySelectorAll('#roster-list input[type=checkbox]')].filter((b) => b.checked).length,
    group: localStorage.getItem('watduang:group'),
    stageKids: stage ? stage.children.length : -1,
  };
`;

async function seed(session, id) {
  await session.nav(`${BASE}/game/${id}/`);
  await session.wipe();
  await session.evaluate(
    `localStorage.setItem('watduang:roster', JSON.stringify(${JSON.stringify(NAMES)})); return true;`,
  );
  await session.nav(`${BASE}/game/${id}/`); // reload on-origin so loadRoster() picks the seeded roster up
  // Trap 4 in docs/agents/browser-verification.md: an unverified wipe looks exactly like no wipe.
  const rosterCheck = await session.evaluate(`return localStorage.getItem('watduang:roster');`);
  const ticked = await session.evaluate(`
    const boxes = [...document.querySelectorAll('#roster-list input[type=checkbox]')];
    boxes[0].click(); boxes[1].click();
    return { found: boxes.length, checked: boxes.filter((b) => b.checked).length };
  `);
  return { rosterCheck: rosterCheck.value, ticked: ticked.value };
}

// Presses #start-round and reads .hidden at two instants: the moment click() returns (microtasks have
// NOT drained — this is where root.hidden = true has just been applied), and again after they have.
// The gap between the two readings is the deferral itself, measured rather than argued.
async function press(session) {
  const timing = await session.evaluate(`
    const p = document.getElementById('player-setup');
    const s = document.getElementById('start-round');
    if (!s || s.getClientRects().length === 0) return { pressed: false };
    s.click();
    const atClickReturn = p.hidden;
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    return { pressed: true, hiddenAtClickReturn: atClickReturn, hiddenAfterMicrotasks: p.hidden };
  `);
  await new Promise((r) => setTimeout(r, 1800)); // the dynamic import is async on the first press
  const state = await session.evaluate(READ);
  return { timing: timing.value ?? timing, state: state.value ?? state };
}

export default async function run(session) {
  const out = { label: LABEL, base: BASE, when: new Date().toISOString(), scenarios: {} };

  // 1. THE RETRY CASE (T1). love-match caches the module on press 1, so press 2 throws synchronously.
  {
    const setup = await seed(session, 'love-match');
    const first = await press(session);
    const second = await press(session);
    out.scenarios['love-match-retry'] = { chunk: 'default.mount() throws', setup, first, second };
  }

  // 2. FIRST-FAILURE UNCHANGED. short-stick's `await load()` rejects, so both presses take the async
  //    path — this is the original gh#54 scenario, re-driven to show the fix did not move it.
  {
    const setup = await seed(session, 'short-stick');
    const first = await press(session);
    const second = await press(session);
    out.scenarios['short-stick-load-throws'] = { chunk: 'throws on evaluation', setup, first, second };
  }

  // 3. CALIBRATION CONTROL. Untouched chunk: a real mount runs, so the panel must END UP HIDDEN.
  //    Without this the whole run is unfalsifiable — "panel visible" would be the only outcome possible.
  {
    const setup = await seed(session, 'pick-loser');
    const first = await press(session);
    out.scenarios['pick-loser-control'] = { chunk: 'untouched', setup, first };
  }

  const lm = out.scenarios['love-match-retry'];
  const ctl = out.scenarios['pick-loser-control'];
  // The control must have MOUNTED, not merely hidden the panel. `rootHidden === true` alone does not
  // separate "a real mount ran" from "the handler chunk never evaluated at all" — requestStart sets
  // root.hidden = true before dispatching either way. A first cut of this probe checked only
  // rootHidden, and a control root whose chunk had been broken into a SyntaxError passed it while
  // measuring nothing: pick-loser reported a hidden panel with `stageKids: 0`. stageKids > 0 is the bit
  // that would have failed.
  const controlMounted = ctl.first.state.rootHidden === true && ctl.first.state.stageKids > 0;
  out.verdict = !controlMounted
    ? 'VOID_CONTROL_DID_NOT_MOUNT' // apparatus broken: the untouched game did not put a round on screen
    : lm.second.state.startRects > 0 && lm.second.state.rootHidden === false
      ? 'RETRY_PANEL_SURVIVES'
      : 'RETRY_PANEL_LOST';
  out.consoleErrors = session.consoleErrors;
  return out;
}
