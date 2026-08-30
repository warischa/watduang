// gh#144 PlayExit REWORKED guard walk: hold-through, hold-elsewhere+stray-tap, bfcache, regression.
// Reuses the CDP client shape from play-exit-probe.mjs. A CI leg since gh#149 (ci-probes.sh lane1):
// it judges its own JSON at the bottom and exits non-zero on a red.
// Usage: npx serve dist -l 5052 (or set BASE), then: node scripts/play-exit-guard-probe.mjs <cdpPort> <shotDir>
// Each scenario group runs in its OWN tab (browser-verification.md trap 3: state -- and, it turns out,
// bfcache eligibility itself -- can carry across navigations in one tab; a fresh tab per group is the
// cleanest way to keep scenario 4's "after a round transition" precondition from inheriting scenario
// 3's back/forward history).
const [PORT = '9222', SHOT = '/tmp'] = process.argv.slice(2);
const { writeFile } = await import('node:fs/promises');
const BASE = process.env.BASE ?? 'http://localhost:5052';
// Scenarios 1 and 4 run against EVERY play route, derived rather than listed. This list had drifted
// two routes behind the site (power-meter and short-stick both shipped without being added), and a
// probe that silently skips a route reads exactly like a probe that passed it. Same dynamic-import
// idiom as landing-claims-check.mjs. Set ROUTES_ONLY=a,b to narrow it while debugging one route.
const { fileURLToPath } = await import('node:url');
const { games } = await import(`${fileURLToPath(new URL('..', import.meta.url))}src/games/manifest.ts`);
const only = process.env.ROUTES_ONLY?.split(',').map((s) => s.trim()).filter(Boolean);
const ROUTES_ALL = games
  .filter((g) => g.playRoute)
  .map((g) => g.id)
  .filter((id) => !only?.length || only.includes(id))
  .sort();
if (!ROUTES_ALL.length) throw new Error('no play routes derived from the manifest — refusing to report a vacuous pass');
const ROUTE_ONLY_CANNON = ['cannon-flag']; // scenarios 2 and 3 (cannon-flag is the one named in the brief)
// ponytail: calibration hook for the coverage reconciliation at the bottom of this file. It drops a
// route from the RUN while leaving it in the expected leg set, which is the only way to make a
// required leg genuinely missing on demand without editing the expected value. Same idiom as the
// BREAK_GUARD control legs in ci-probes.sh. Never set in CI.
const DROP_ROUTE = process.env.DROP_ROUTE;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const api = async (p, m = 'GET') => (await fetch(`http://127.0.0.1:${PORT}${p}`, { method: m })).json();

async function openTab() {
  const target = await api('/json/new?about:blank', 'PUT');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const pending = new Map();
  let loadResolve = null;
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); return; }
    if (m.method === 'Page.loadEventFired' && loadResolve) { loadResolve(); loadResolve = null; }
  });
  const send = (method, params = {}) => new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
  await send('Page.enable');
  await send('Runtime.enable');

  const evaluate = async (body) => {
    const res = await send('Runtime.evaluate', { expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true });
    const r = res?.result;
    if (r?.exceptionDetails) return { error: r.exceptionDetails.exception?.description ?? r.exceptionDetails.text };
    return { value: r?.result?.value ?? null };
  };
  const nav = async (url) => { const p = new Promise((r) => { loadResolve = r; }); await send('Page.navigate', { url }); await p; await sleep(900); };
  const setup320 = async () => { await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 1, mobile: true }); };
  const tap = async (x, y) => {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 0 }] });
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const touchDown = async (x, y, tid) => send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: tid }] });
  // Multi-touch add: pass the FULL current set of active points; CDP diffs against the previous call
  // to know which point is new (documented behaviour; also how Puppeteer's multi-touch Touchscreen works).
  const touchAddPoint = async (existing, x, y, tid) => send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [...existing, { x, y, id: tid }] });
  const touchRemovePoint = async (remaining) => send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: remaining });
  const touchReleaseAll = async () => send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const mouseClick = async (x, y) => {
    for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  };
  const shot = async (path) => { const s = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(path, Buffer.from(s.result.data, 'base64')); };
  const pathname = async () => (await evaluate('return location.pathname;')).value;
  const disabledState = async () => (await evaluate("return document.getElementById('play-exit')?.disabled ?? null;")).value;
  const close = async () => { await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`); ws.close(); };

  return { send, evaluate, nav, setup320, tap, touchDown, touchAddPoint, touchRemovePoint, touchReleaseAll, mouseClick, shot, pathname, disabledState, close };
}

const XSTATE = `
  const b = document.getElementById('play-exit');
  if (!b) return { present: false };
  const r = b.getBoundingClientRect();
  return { present: true, disabled: b.disabled, rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } };`;

const gotoIdleArmed = async (s, route) => {
  const url = `${BASE}/game/${route}/play/`;
  await s.nav(url);
  await s.setup320();
  await sleep(800); // > ARM_DELAY_MS (400ms), so the X is armed and idle at the start of each scenario
  const st = (await s.evaluate(XSTATE)).value;
  return { url, rect: st.rect, disabledAtStart: st.disabled };
};

const findTransitionTrigger = async (s) => (await s.evaluate(`
  // #appRoot is how-close-is-near's game root. Measured: without it, root was null there, this
  // expression threw, and the route reported "no transition trigger" on every run -- a permanent skip
  // that reads exactly like a route with nothing to press.
  const root = document.querySelector('#app, #app-container, #appRoot');
  // AREA, not width-and-height. The predicate used to be r.width > 60 && r.height > 30, and that is
  // what made short-stick report "no transition trigger" on every run: with a roster already stored
  // the route boots straight into the round, where the only visible controls are its four 44x180
  // straw buttons -- tall, narrow, and the actual round-transition control on that screen. 44 is not
  // > 60, so the finder returned null and the burst leg was skipped for a reason that was false.
  // Measured on this exact page: #btn-start-setup, the button the skip implied was missing, is 0x0
  // with offsetParent null there because the setup screen is hidden. 44 is also the tap-target floor
  // this site builds to, so it is the right minimum on either axis.
  const cands = [...root.querySelectorAll('button')].filter((b) => {
    const r = b.getBoundingClientRect();
    return r.width >= 44 && r.height >= 30 && r.width * r.height >= 2000 && r.top >= 0 && !b.closest('header') && getComputedStyle(b).visibility !== 'hidden' && b.offsetParent !== null;
  }).sort((a, z) => z.getBoundingClientRect().width * z.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height);
  const b = cands[0];
  if (!b) return null;
  b.scrollIntoView({ block: 'center' });
  await new Promise((r) => setTimeout(r, 200));
  const r = b.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };`)).value;

// A point clearly inside the game area, away from the X (top-left) and away from any header control.
const GAME_X = 160, GAME_Y = 400;

// #play-exit is position:fixed at 6,6 / 44x44 on every play route, so (28,28) is its centre everywhere.
const X_HIT = 28;
const topAtX = async (s) => (await s.evaluate(
  `const e = document.elementFromPoint(${X_HIT}, ${X_HIT}); return e ? (e.id || e.className || e.tagName) : 'NONE';`)).value;

// A tap dispatched at the X's coordinates does NOT mean a tap on the X. Measured on short-stick, 2 of
// 8 runs: its hazard reveal <dialog> (#short-reveal-dialog, opened with showModal() ~750ms after a
// straw is pulled and closed only by its own button -- it never auto-closes) sat over those exact
// coordinates, so the "deliberate tap" landed on the dialog and the leg recorded a non-exit that had
// nothing to do with the guard. Which straw hides the short one is random, so this was a ~25% flake
// that could equally have been a silent vacuous PASS on the burst leg.
// Dismissal goes through HTMLDialogElement.close(), the native API, on every open <dialog> -- no route
// names and no game knowledge. Escape via Input.dispatchKeyEvent was tried first and is NOT usable
// here: measured, one iteration wedged for over ten minutes with the CDP call never answering, and a
// probe that hangs is worse in CI than one that reds. close() is a synchronous DOM call inside an
// evaluate that already has a round trip, and it dispatches no pointer events, so it cannot disarm the
// X either. Whatever is on top AFTER this runs is returned, and the caller judges the leg on it -- a
// non-dialog overlay is not cleared, and must not be, because that would be a real finding.
const clearOverlayAtX = async (s) => {
  const before = await topAtX(s);
  if (before === 'play-exit') return { before, after: before };
  await s.evaluate("for (const d of document.querySelectorAll('dialog[open]')) d.close(); return true;");
  await sleep(400);
  return { before, after: await topAtX(s) };
};

const out = {};

// --- Scenario 1: HOLD-THROUGH --- (a press that STARTS on the X while it is disabled must never
// exit the round, however long it is held.)
//
// This block used to race the clock: navigation resolved on Page.loadEventFired and the touch was
// dispatched blind, hoping to land inside the 400ms window that PlayExit.astro's init disarm() opens.
// But that timer starts when the module script runs, not when `load` fires, so how much of the window
// was left depended on the gap between the two -- which varies per route and per run. Measured over
// five identical runs: 6 of 8 routes flipped between SKIP and PASS, and a route could also land the
// touch just AFTER the arm and report a FAIL on healthy code. That is a flaky instrument, so the
// clock is gone from this scenario entirely.
//
// The deterministic construction: hold a finger in the game area FIRST. Its pointerdown reaches
// PlayExit.astro's document-capture handler, which calls disarm() -- and disarm() only re-schedules
// the arm timer when `active === 0`, so with a contact still down the X is disabled and CANNOT arm,
// for as long as we like. The press under test then goes down on the X as a second finger, with no
// deadline. Finger 1 lifts while finger 2 is still down (still no arm), we outlive ARM_DELAY_MS, and
// finger 2 releases on the X. The guard path exercised is identical to the old one: `pressed` is only
// set for a press that began on an ARMED control, so a press that began disabled must not activate
// on release.
//
// Ceiling, stated because a green here must not be read as more than it is (ADR-0019 rule 1): this no
// longer presses during the initial post-load disabled window. Nothing else in this walk does either.
// It cannot be driven deterministically over CDP -- every route to it goes through a round trip whose
// latency is the thing being raced.
//
// The in-page capture stays (Page.addScriptToEvaluateOnNewDocument, so it registers before
// PlayExit.astro's own capture listener and therefore reads `disabled` before that handler can touch
// it). It now records every contact ON the X rather than the first contact anywhere, since finger 1
// is a contact too. #play-exit's CSS position (top/left: 6px, 44x44) is fixed across play routes.
out.s1 = {};
for (const route of ROUTES_ALL) {
  if (route === DROP_ROUTE) continue;
  const s = await openTab();
  await s.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      window.__s1 = [];
      document.addEventListener('pointerdown', (ev) => {
        const b = document.getElementById('play-exit');
        if (!b) { window.__s1.push('no-btn'); return; }
        if (ev.target instanceof Node && b.contains(ev.target)) window.__s1.push(b.disabled);
      }, true);`,
  });
  const { rect } = await gotoIdleArmed(s, route);
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  await s.touchDown(GAME_X, GAME_Y, 0); // finger 1: pins the X disabled with no timer pending
  await sleep(200);
  const disabledBeforePress = await s.disabledState();
  await s.touchAddPoint([{ x: GAME_X, y: GAME_Y, id: 0 }], cx, cy, 1); // finger 2: the press under test
  await sleep(100);
  await s.touchRemovePoint([{ x: cx, y: cy, id: 1 }]); // lift finger 1; finger 2 still down
  await sleep(700); // outlives ARM_DELAY_MS with the press still down
  await s.touchReleaseAll(); // release finger 2 on the X
  await sleep(900);
  const pathAfter = await s.pathname();
  const capture = (await s.evaluate('return window.__s1 ?? null;')).value;
  const startedDisabled = Array.isArray(capture) && capture[0] === true;
  out.s1[route] = {
    disabledBeforePress, contactsOnX: capture, startedDisabled, pathAfter,
    pass: startedDisabled && pathAfter !== '/',
  };
  if (!out.s1[route].pass) await s.shot(`${SHOT}/s1-${route}-FAIL.png`);
  await s.close();
}

// --- Scenario 2: HOLD-ELSEWHERE + STRAY TAP (cannon-flag) ---
out.s2 = {};
for (const route of ROUTE_ONLY_CANNON) {
  const s = await openTab();
  const { rect } = await gotoIdleArmed(s, route);
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  // finger 1 down in the game area, held
  await s.touchDown(GAME_X, GAME_Y, 0);
  await sleep(600);
  // finger 2: stray tap on the X while finger 1 is still down
  await s.touchAddPoint([{ x: GAME_X, y: GAME_Y, id: 0 }], cx, cy, 1);
  await s.touchRemovePoint([{ x: GAME_X, y: GAME_Y, id: 0 }]);
  await sleep(100);
  const pathDuringHold = await s.pathname();
  // hold a bit more, then release finger 1
  await sleep(200);
  await s.touchReleaseAll();
  await sleep(100);
  const pathAfterRelease = await s.pathname();
  // quiet window, then a real single tap on X -- positive control
  await sleep(600);
  const disabledBeforeControl = await s.disabledState();
  await s.tap(cx, cy);
  await sleep(900);
  const pathAfterControl = await s.pathname();
  out.s2[route] = {
    pathDuringHold, pathAfterRelease, disabledBeforeControl, pathAfterControl,
    passNoNav: pathDuringHold !== '/' && pathAfterRelease !== '/',
    passControlNav: pathAfterControl === '/',
  };
  if (!out.s2[route].passNoNav) await s.shot(`${SHOT}/s2-${route}-noNav-FAIL.png`);
  if (!out.s2[route].passControlNav) await s.shot(`${SHOT}/s2-${route}-control-FAIL.png`);
  await s.close();
}

// --- Scenario 3: BFCACHE (cannon-flag) ---
out.s3 = {};
for (const route of ROUTE_ONLY_CANNON) {
  const s = await openTab();
  const { rect } = await gotoIdleArmed(s, route);
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  // Instrument BEFORE the exit tap: a global that only survives if this exact page object survives
  // (bfcache), and is gone after any fresh script execution (a real reload).
  await s.evaluate(`
    window.__pageshowLog = [];
    window.addEventListener('pageshow', (e) => window.__pageshowLog.push({ persisted: e.persisted }));
    return true;`);
  await s.tap(cx, cy); // real exit, driven through the guard's own control
  await sleep(900);
  const landedOnHome = (await s.pathname()) === '/';
  // Drive back-navigation from inside the page (a real user gesture would be a back-swipe/button, not
  // a CDP-level navigate) so bfcache eligibility is judged the same way a browser would judge it.
  await s.evaluate('history.back(); return true;');
  await sleep(1200);
  const bfState = await s.evaluate("return typeof window.__pageshowLog === 'undefined' ? 'reloaded' : JSON.stringify(window.__pageshowLog);");
  const pathAfterBack = await s.pathname();
  const bfEngaged = bfState.value !== 'reloaded' && bfState.value !== null && bfState.value.includes('true');
  const scenario = { landedOnHome, pathAfterBack, pageshowLog: bfState.value };
  if (!bfEngaged) {
    scenario.exercisable = false;
    scenario.reason = bfState.value === 'reloaded' || bfState.value === null
      ? 'history.back() forced a fresh script execution (bfcache not engaged in this headless run) -- window.__pageshowLog did not survive'
      : `pageshow fired but persisted was never true: ${bfState.value}`;
  } else {
    await sleep(600);
    const disabledBeforeTap = await s.disabledState();
    await s.tap(cx, cy);
    await sleep(900);
    const pathAfterTap = await s.pathname();
    scenario.exercisable = true;
    scenario.disabledBeforeTap = disabledBeforeTap;
    scenario.pass = pathAfterTap === '/';
    scenario.pathAfterTap = pathAfterTap;
    if (!scenario.pass) await s.shot(`${SHOT}/s3-${route}-FAIL.png`);
  }
  out.s3[route] = scenario;
  await s.close();
}

// --- Scenario 4: REGRESSION (5-tap burst after transition, then deliberate tap) ---
out.s4 = {};
for (const route of ROUTES_ALL) {
  if (route === DROP_ROUTE) continue;
  const s = await openTab();
  const { rect } = await gotoIdleArmed(s, route);
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  const startBtn = await findTransitionTrigger(s);
  if (startBtn) await s.mouseClick(startBtn.x, startBtn.y);
  // KNOWN CEILING, named so a later reader does not mistake this for coverage it has not earned:
  // topBeforeBurst is read ONCE, here, before the burst. The burst spans roughly 400-600ms, and
  // short-stick's #short-reveal-dialog opens about 750ms after the straw click (two chained timers in
  // src/play/short-stick/main.js). On a runner slower than this laptop, later taps in the burst can
  // land on that dialog while this single pre-read still says the X was on top, so passNoNav would
  // credit a full five-tap burst on the X when it was not one.
  // Why this is a measurement ceiling and not a hole in the verdict: a tap on the dialog, or on its
  // own close button, routes to the result view and never navigates, so the burst leg cannot go green
  // for the wrong reason -- it can only be weaker than it reads. Tightening it means sampling the top
  // element per tap, which costs a CDP round trip inside the burst and would change the very timing
  // the burst is trying to reproduce. Left deliberately.
  const topBeforeBurst = await topAtX(s);
  for (let i = 0; i < 5; i++) { await sleep(80); await s.tap(cx, cy); }
  await sleep(150);
  const pathAfterBurst = await s.pathname();
  await sleep(600);
  const { before: overlayAtX, after: topBeforeDeliberate } = await clearOverlayAtX(s);
  const disabledBeforeDeliberate = await s.disabledState();
  await s.tap(cx, cy);
  await sleep(900);
  const pathAfterDeliberate = await s.pathname();
  out.s4[route] = {
    transitionTriggered: !!startBtn, topBeforeBurst, pathAfterBurst,
    overlayAtX, topBeforeDeliberate, disabledBeforeDeliberate, pathAfterDeliberate,
    // "the burst did not exit" only means something if the burst was landing ON the X.
    passNoNav: !!startBtn && topBeforeBurst === 'play-exit' && pathAfterBurst !== '/',
    // Gated on the burst NOT having navigated. Measured on short-stick: the burst left the round, so
    // this tap landed on the home page and asserted '/' === '/' -- a leg that passes by measuring the
    // wrong page is worse than a missing leg. A burst that already exited fails BOTH legs, which is
    // correct: nothing here observed a deliberate tap on a play route.
    passDeliberateNav: pathAfterBurst !== '/' && topBeforeDeliberate === 'play-exit' && pathAfterDeliberate === '/',
  };
  if (!out.s4[route].passNoNav) await s.shot(`${SHOT}/s4-${route}-burst-FAIL.png`);
  if (!out.s4[route].passDeliberateNav) await s.shot(`${SHOT}/s4-${route}-deliberate-FAIL.png`);
  await s.close();
}

console.log(JSON.stringify(out, null, 2));

// --- verdict ------------------------------------------------------------------------------------
// The four scenarios above used to end in a bare process.exit(0), so every per-route pass flag they
// compute was thrown away. Since gh#149 deleted the party landing pages, this walk and play-exit-probe
// are the only things in CI measuring ADR-0050 ruling 3's guarded X -- so this one judges itself.
//
// A bare "N failed" verdict is not enough, and that was measured, not feared: five identical runs of
// the pre-fix probe reported 19, 20, 20, 23 and 22 judged legs and ALL FIVE exited 0. A run covering
// four fewer legs than the last one is indistinguishable from a full green if the only number gated is
// the failure count. So the leg set itself is reconciled here, and it is DERIVED from the route set --
// adding a play route raises the floor with no edit to this file.
//
// REQUIRED legs have no exercisability escape hatch: not judging one is a RED, whatever the reason.
// OPTIONAL legs may report a SKIP with a reason -- s3 is the only one, because whether Chrome grants
// bfcache on a headless run is not ours to control -- but a skip must still be RECORDED, so a leg that
// silently disappears from the walk is a red too. Scenario 1 is required because it no longer races a
// clock, and s4's burst is required because its old skip reason ("no transition trigger found") was
// measured FALSE on short-stick: that is a finder bug, and a probe must not launder its own bugs into
// a skip line. See findTransitionTrigger's header.
const fails = [], skips = [];
const judgedIds = new Set(), skippedIds = new Set();
const check = (id, pass, msg) => { judgedIds.add(id); if (!pass) fails.push(msg); };
const skip = (id, reason) => { skippedIds.add(id); skips.push(`${id}: ${reason}`); };
for (const [g, r] of Object.entries(out.s1)) {
  check(`s1/${g}`, r.pass, `s1/${g}: a press that STARTED while the X was disabled still left the round (pathname ${r.pathAfter}, contacts on X ${JSON.stringify(r.contactsOnX)}, disabled before press ${r.disabledBeforePress})`);
}
for (const [g, r] of Object.entries(out.s2)) {
  check(`s2/${g}/no-nav`, r.passNoNav, `s2/${g}: a stray tap on the X during a held touch left the round (during hold ${r.pathDuringHold}, after release ${r.pathAfterRelease})`);
  check(`s2/${g}/control`, r.passControlNav, `s2/${g}: positive control -- a quiet deliberate tap did NOT exit (pathname ${r.pathAfterControl}), so this scenario's green measures a dead control`);
}
for (const [g, r] of Object.entries(out.s3)) {
  if (!r.exercisable) skip(`s3/${g}`, r.reason);
  else check(`s3/${g}`, r.pass, `s3/${g}: after a bfcache restore the X no longer exits (pathname ${r.pathAfterTap})`);
}
for (const [g, r] of Object.entries(out.s4)) {
  check(`s4/${g}/deliberate`, r.passDeliberateNav, r.pathAfterBurst === '/'
    ? `s4/${g}: the burst had already left the round, so this leg tapped the HOME page and its '/' === '/' means nothing`
    : r.topBeforeDeliberate !== 'play-exit'
      ? `s4/${g}: ${r.topBeforeDeliberate} was on top of the X at (${X_HIT},${X_HIT}) and closing every open <dialog> did not clear it, so this tap could not reach the control it claims to test`
      : `s4/${g}: a deliberate tap after the burst did not exit (pathname ${r.pathAfterDeliberate}, X disabled before the tap: ${r.disabledBeforeDeliberate})`);
  // No skip here any more, and that is the point. Every play route has a control big enough to press;
  // "no transition trigger found" was never a property of a route, only of the finder above, and a
  // skip whose stated reason can be false reads as coverage while measuring nothing.
  check(`s4/${g}/burst`, r.passNoNav, !r.transitionTriggered
    ? `s4/${g}: findTransitionTrigger found nothing to press on this route, so no transition disarmed the X and this burst measured nothing -- fix the finder, do not skip the leg`
    : r.topBeforeBurst !== 'play-exit'
      ? `s4/${g}: ${r.topBeforeBurst} was on top of the X at (${X_HIT},${X_HIT}) when the burst started, so "the burst did not exit" measured that overlay, not the guard`
      : `s4/${g}: the 5-tap burst after a transition LEFT THE ROUND (pathname ${r.pathAfterBurst})`);
}

// --- coverage reconciliation ---
const REQUIRED_LEGS = [
  ...ROUTES_ALL.map((r) => `s1/${r}`),
  ...ROUTE_ONLY_CANNON.flatMap((r) => [`s2/${r}/no-nav`, `s2/${r}/control`]),
  ...ROUTES_ALL.flatMap((r) => [`s4/${r}/deliberate`, `s4/${r}/burst`]),
];
// s3 is the only genuinely optional leg left: whether Chrome grants bfcache on a given headless run is
// not ours to control, and its skip reason is read back from the page, not asserted by the probe.
const OPTIONAL_LEGS = ROUTE_ONLY_CANNON.map((r) => `s3/${r}`);
const EXPECTED = new Set([...REQUIRED_LEGS, ...OPTIONAL_LEGS]);
if (!REQUIRED_LEGS.length) fails.push('coverage: the required leg set is empty -- this walk would report a vacuous pass');
for (const id of REQUIRED_LEGS) {
  if (judgedIds.has(id)) continue;
  fails.push(`coverage: required leg ${id} was not judged (${skippedIds.has(id) ? 'reported as a skip, which this leg is not allowed to do' : 'never reached the verdict at all'})`);
}
for (const id of OPTIONAL_LEGS) {
  if (judgedIds.has(id) || skippedIds.has(id)) continue;
  fails.push(`coverage: leg ${id} was neither judged nor skipped -- it vanished from the walk without a reason`);
}
for (const id of [...judgedIds, ...skippedIds]) {
  if (!EXPECTED.has(id)) fails.push(`coverage: leg ${id} is not in this walk's expected set -- the leg id scheme drifted from the reconciliation above`);
}

for (const f of fails) console.log(`  FAIL ${f}`);
for (const s of skips) console.log(`  SKIP ${s}`);
const req = REQUIRED_LEGS.filter((id) => judgedIds.has(id)).length;
console.log(`play-exit-guard: ${ROUTES_ALL.length} route(s) checked, ${judgedIds.size} scenario leg(s) judged (${req}/${REQUIRED_LEGS.length} required, ${judgedIds.size - req}/${OPTIONAL_LEGS.length} optional), ${fails.length} failed, ${skips.length} not exercisable`);
process.exit(fails.length > 0 ? 1 : 0);
