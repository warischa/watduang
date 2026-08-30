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
  // No baked-in settle delay -- scenario 1 must touch down WHILE the X is still `disabled` (inside the
  // 400ms ARM_DELAY_MS window); nav()'s own 900ms wait would already arm it before control returns.
  const navFast = async (url) => { const p = new Promise((r) => { loadResolve = r; }); await send('Page.navigate', { url }); await p; };
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

  return { send, evaluate, nav, navFast, setup320, tap, touchDown, touchAddPoint, touchRemovePoint, touchReleaseAll, mouseClick, shot, pathname, disabledState, close };
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
  const cands = [...root.querySelectorAll('button')].filter((b) => {
    const r = b.getBoundingClientRect();
    return r.width > 60 && r.height > 30 && r.top >= 0 && !b.closest('header') && getComputedStyle(b).visibility !== 'hidden' && b.offsetParent !== null;
  }).sort((a, z) => z.getBoundingClientRect().width * z.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height);
  const b = cands[0];
  if (!b) return null;
  b.scrollIntoView({ block: 'center' });
  await new Promise((r) => setTimeout(r, 200));
  const r = b.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };`)).value;

// A point clearly inside the game area, away from the X (top-left) and away from any header control.
const GAME_X = 160, GAME_Y = 400;

const out = {};

// --- Scenario 1: HOLD-THROUGH --- (press must start WHILE the X is disabled, i.e. right after load,
// before ARM_DELAY_MS/400ms elapses. Measured: reading `disabled` back via a post-hoc Runtime.evaluate
// round trip is itself racy under headless main-thread contention -- a probe evaluate() call was seen
// to take 450ms+ on first contact with a freshly-loaded page, by which point the real 400ms arm timer
// had already fired for real, making a "touched while disabled" claim from that reading false. Fixed
// by an in-page capture installed via Page.addScriptToEvaluateOnNewDocument BEFORE navigation: it
// records `disabled` synchronously in the SAME pointerdown handler dispatch, so what gets read back
// later is unaffected by how late the read happens. #play-exit's CSS position (top/left: 6px, 44x44)
// is fixed across all three play routes, so the touch target (28, 28) needs no DOM query either.
// Also measured: Emulation.setDeviceMetricsOverride(mobile:true) must be set BEFORE navigation, not
// after -- set immediately after a fresh load with near-zero settle, a dispatchTouchEvent silently
// produced zero pointerdown events on the page (touch input wiring for the frame was not ready yet).
// Setting it pre-navigation, as this block now does, is what scenario 2/3/4's own gotoIdleArmed also
// does, just with an 800ms settle after -- here there is no settle to spare, so order is what matters.)
out.s1 = {};
for (const route of ROUTES_ALL) {
  const s = await openTab();
  await s.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      document.addEventListener('pointerdown', (ev) => {
        if (window.__s1seen) return;
        window.__s1seen = true;
        const b = document.getElementById('play-exit');
        window.__s1disabled = b ? b.disabled : 'no-btn';
      }, true);`,
  });
  await s.setup320();
  await s.navFast(`${BASE}/game/${route}/play/`);
  const t0 = Date.now();
  await s.touchDown(28, 28, 0); // dispatched immediately after loadEventFired, well inside 400ms
  const ackMs = Date.now() - t0; // measured: this route's main thread can block long enough that the
  // touch is only PROCESSED once it frees -- if that exceeds ARM_DELAY_MS, no touch can land inside
  // the disabled window at all on this route under headless CDP, and the scenario is not exercisable.
  await sleep(700); // outlives ARM_DELAY_MS while the finger is still down
  await s.touchReleaseAll();
  await sleep(300);
  const path = await s.pathname();
  const capture = (await s.evaluate('return { seen: window.__s1seen, disabled: window.__s1disabled };')).value;
  if (!capture?.seen && ackMs > 380) {
    out.s1[route] = {
      exercisable: false,
      reason: `Input.dispatchTouchEvent ack took ${ackMs}ms (> ARM_DELAY_MS=400ms) -- this route's main thread was busy long enough that no touch could reach the page while #play-exit was still disabled`,
      pathAfter: path,
    };
  } else {
    out.s1[route] = { exercisable: true, pressStartedDisabled: capture, ackMs, pathAfter: path, pass: capture?.disabled === true && path !== '/' };
    if (!out.s1[route].pass) await s.shot(`${SHOT}/s1-${route}-FAIL.png`);
  }
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
  const s = await openTab();
  const { rect } = await gotoIdleArmed(s, route);
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  const startBtn = await findTransitionTrigger(s);
  if (startBtn) await s.mouseClick(startBtn.x, startBtn.y);
  for (let i = 0; i < 5; i++) { await sleep(80); await s.tap(cx, cy); }
  await sleep(150);
  const pathAfterBurst = await s.pathname();
  await sleep(600);
  await s.tap(cx, cy);
  await sleep(900);
  const pathAfterDeliberate = await s.pathname();
  out.s4[route] = {
    transitionTriggered: !!startBtn, pathAfterBurst, pathAfterDeliberate,
    passNoNav: pathAfterBurst !== '/',
    passDeliberateNav: pathAfterDeliberate === '/',
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
// exercisable:false is a SKIP with its reason, never a pass: s1 needs a touch to land inside the 400ms
// disabled window (headless main-thread contention can make that impossible on a given route/run) and
// s3 needs bfcache to actually engage. Every leg that IS judged must pass; zero judged legs, or an
// empty route set (refused by the throw at the top of this file), is a RED.
const fails = [], skips = [];
let judged = 0;
const check = (pass, msg) => { judged++; if (!pass) fails.push(msg); };
for (const [g, r] of Object.entries(out.s1)) {
  if (!r.exercisable) skips.push(`s1/${g}: ${r.reason}`);
  else check(r.pass, `s1/${g}: a press that STARTED while the X was disabled still left the round (pathname ${r.pathAfter}, capture ${JSON.stringify(r.pressStartedDisabled)})`);
}
for (const [g, r] of Object.entries(out.s2)) {
  check(r.passNoNav, `s2/${g}: a stray tap on the X during a held touch left the round (during hold ${r.pathDuringHold}, after release ${r.pathAfterRelease})`);
  check(r.passControlNav, `s2/${g}: positive control -- a quiet deliberate tap did NOT exit (pathname ${r.pathAfterControl}), so this scenario's green measures a dead control`);
}
for (const [g, r] of Object.entries(out.s3)) {
  if (!r.exercisable) skips.push(`s3/${g}: ${r.reason}`);
  else check(r.pass, `s3/${g}: after a bfcache restore the X no longer exits (pathname ${r.pathAfterTap})`);
}
for (const [g, r] of Object.entries(out.s4)) {
  check(r.passDeliberateNav, `s4/${g}: a deliberate tap after the burst did not exit (pathname ${r.pathAfterDeliberate})`);
  if (!r.transitionTriggered) skips.push(`s4/${g}: no transition trigger found, so nothing disarmed the X and the burst is not exercisable`);
  else check(r.passNoNav, `s4/${g}: the 5-tap burst after a transition LEFT THE ROUND (pathname ${r.pathAfterBurst})`);
}
for (const f of fails) console.log(`  FAIL ${f}`);
for (const s of skips) console.log(`  SKIP ${s}`);
console.log(`play-exit-guard: ${ROUTES_ALL.length} route(s) checked, ${judged} scenario leg(s) judged, ${fails.length} failed, ${skips.length} not exercisable`);
process.exit(fails.length > 0 || ROUTES_ALL.length === 0 || judged === 0 ? 1 : 0);
