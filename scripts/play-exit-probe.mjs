// gh#144 PlayExit walk. Standalone CDP client (driver.mjs has no raw send / no sub-400ms burst).
// A CI leg since gh#149 (scripts/ci-probes.sh lane1) — it judges its own JSON at the bottom and exits
// non-zero on a red. Serve dist first (npx serve dist -l 5051, or set BASE).
// Usage: node scripts/play-exit-probe.mjs <cdpPort> <shotDir> <tag>
//        node scripts/play-exit-probe.mjs --selftest   (classifier only, no browser)
// Calibration knobs, never set by scripts/ci-probes.sh -- both exist to drive the burst classifier
// below to a known outcome on a machine that is not the CI runner (gh#190):
//   PROBE_STALL_MS=700     block the page's main thread for N ms right after the transition tap, so
//                          the burst is HANDLED late while it is still DISPATCHED on time
//   PROBE_BURST_GAP_MS=500 space the five touches N ms apart instead of 80, so the INPUT gaps
//                          themselves outlive the arm window -- the must-red for the VOID rule
const ARGV = process.argv.slice(2);
const [PORT = '9222', SHOT = '/tmp', TAG = 'normal'] = ARGV.filter((a) => !a.startsWith('--'));
const STALL_MS = Number(process.env.PROBE_STALL_MS ?? 0);
const BURST_GAP_MS = Number(process.env.PROBE_BURST_GAP_MS ?? 80);
// How many times the M2 finder may fall through to the next candidate in its own ranking before it
// gives the route the verdict its first candidate earned. Measured: one route needs one advance.
const MAX_CAND_ADVANCE = 3;
const { writeFile } = await import('node:fs/promises');
const BASE = process.env.BASE ?? 'http://localhost:5051';

// Derived, never listed. A hardcoded list silently drops every new port: short-stick shipped and was
// never added here, and timebomb would have been the next one. The manifest is the declaration of
// record, and landing-claims-check already reds a declared playRoute with no built page, so a route
// that reaches this list is a route that exists. Same dynamic-import idiom as landing-claims-check.mjs
// (plain node strips the TypeScript). Set ROUTES_ONLY=a,b to narrow it while debugging one route.
const { fileURLToPath } = await import('node:url');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const { games } = await import(`${ROOT}src/games/manifest.ts`);
// Imported, never retyped: the burst is red exactly when one inter-contact gap outlives the arm
// window, so the failure message has to quote the SAME constant the gate consumes.
const { ARM_DELAY_MS } = await import(`${ROOT}src/games/_arm-gate.ts`);
const only = process.env.ROUTES_ONLY?.split(',').map((s) => s.trim()).filter(Boolean);
const ROUTES = games
  .filter((g) => g.playRoute)
  .map((g) => g.id)
  .filter((id) => !only?.length || only.includes(id))
  .sort();
if (!ROUTES.length) throw new Error('no play routes derived from the manifest — refusing to report a vacuous pass');

// --- burst classifier (pure) ---------------------------------------------------------------------
// gh#190. Every contact carries TWO clocks and only one of them can answer the question this leg
// went red on. `t` is when the page's listener RAN; `ti` is the event's own timeStamp, which the
// browser stamps when the input was DISPATCHED. A long main-thread task (cursed-number's transition
// is the heaviest on the site) queues the arm timer and the next contact behind itself, so a contact
// dispatched inside the arm window is handled after it: the handling gap blows past ARM_DELAY_MS
// while the input gap stays at the ~80ms the burst was driven at.
// So the burst is classified on INPUT gaps only. Any input gap over ARM_DELAY_MS means the runner
// could not deliver a burst at all -- that measurement is VOID, never a pass and never a defect
// report. Every input gap under it and the round still left is a real gate defect and stays a FAIL.
// Fail-closed: without input timestamps nothing can be classified, so the old FAIL stands and says so.
const gapsBy = (log, key) => {
  const gaps = [];
  let lastUp = null, missing = 0;
  for (const e of log) {
    const v = e[key];
    if (typeof v !== 'number') { missing++; continue; }
    if (e.kind === 'down' && lastUp !== null) gaps.push(Math.round((v - lastUp) * 10) / 10);
    if (e.kind === 'up') lastUp = v;
  }
  return { gaps, missing };
};
const classifyBurst = (log, armDelayMs) => {
  const handled = gapsBy(log, 't');
  const input = gapsBy(log, 'ti');
  const inputOver = input.gaps.filter((g) => g > armDelayMs);
  const inputTimesMeasured = input.missing === 0 && input.gaps.length > 0 && input.gaps.length === handled.gaps.length;
  // Per contact, not per burst. The defect this leg exists to catch is ONE `down` handled while the
  // control was already ENABLED whose OWN input gap is inside the window. A burst-wide void test lets
  // a neighbouring contact the runner sent late hide exactly that contact, so the grain is the
  // contact: void is what is left when no single contact carries the defect.
  // ponytail: `disabled` is the X's state at that moment, not proof the contact landed ON the X. In
  // M2 every touch after the transition is dispatched at the X's centre, so the two coincide here;
  // a probe that ever taps elsewhere mid-burst must record the target too.
  const downs = [];
  let lastUpTi = null;
  for (const e of log) {
    if (e.kind === 'down' && lastUpTi !== null && typeof e.ti === 'number') downs.push({ inputGap: Math.round((e.ti - lastUpTi) * 10) / 10, disabled: e.disabled });
    if (e.kind === 'up' && typeof e.ti === 'number') lastUpTi = e.ti;
  }
  const defectContacts = downs.filter((d) => d.disabled === false && d.inputGap <= armDelayMs);
  return {
    downs,
    defectContacts,
    gaps: handled.gaps,
    maxGap: handled.gaps.length ? Math.max(...handled.gaps) : null,
    gapsOverArmDelay: handled.gaps.filter((g) => g > armDelayMs).length,
    inputGaps: input.gaps,
    maxInputGap: input.gaps.length ? Math.max(...input.gaps) : null,
    inputGapsOverArmDelay: inputOver.length,
    inputTimesMeasured,
    isVoid: inputTimesMeasured && defectContacts.length === 0 && inputOver.length > 0,
  };
};

// The leg's exit code, as a function so selftest() can pin it: a VOID that survived its retry is
// fail-closed, exactly like a FAIL. Relaxing a post-retry VOID to a non-blocking outcome (green
// deploy plus the ::warning::) is an owner decision on gh#190, not this file's to take.
// gh#193 re-read of the skip rule: `checked` no longer counts an exempted route, so the old
// `skips + voids === checked` clause is gone -- an all-skipped walk now reds through `checked === 0`,
// and it is the COUNT, not the exit code, that stopped lying.
// gh#199 goes further and OVERTURNS the gh#193 position that a lone skip is non-blocking. Making the
// count honest still left a route the probe could not walk sitting quietly inside a green run, which
// is the same lie one layer out. A skip now splits in two (see the finder at M2):
//   UNMEASURED -- the route has buttons and the finder resolved none of them, even after the retry.
//                 A failed MEASUREMENT. It BLOCKS, exactly like a FAIL or a post-retry VOID.
//   EXEMPT     -- the route's game root contains no <button> at all, re-measured this run. A real
//                 property of the route, so it is outside `checked` and does not block.
// This is a tightening, not a relaxation: every input that exited 1 before still exits 1, and the
// set that exits 0 shrank. The flaky-red worry that kept skips non-blocking is answered by the retry
// plus the split, not by widening the gate.
const legExitCode = ({ fails, voids, unmeasured, checked }) =>
  (fails > 0 || voids > 0 || unmeasured > 0 || checked === 0 ? 1 : 0);

// Runs on EVERY invocation, not only behind the flag: this file is driven by a shell wrapper, so it
// sits outside gate-selftest-coverage-check.mjs's audited set and a flag-only selftest here would be
// a check nothing ever executes. It is pure arithmetic on six objects, so it costs nothing.
const assert = (await import('node:assert')).default;
function selftest() {
  // A burst delivered on time: both clocks agree, nothing is void.
  const clean = classifyBurst([{ kind: 'up', t: 0, ti: 0 }, { kind: 'down', t: 80, ti: 80 }, { kind: 'up', t: 90, ti: 90 }, { kind: 'down', t: 170, ti: 170 }], 400);
  assert.deepStrictEqual(clean.inputGaps, [80, 80]);
  assert.strictEqual(clean.isVoid, false);
  // The runner shape: handled 639ms after the previous release, dispatched 80ms after it.
  const stalled = classifyBurst([{ kind: 'up', t: 0, ti: 0 }, { kind: 'down', t: 639, ti: 80 }], 400);
  assert.strictEqual(stalled.maxGap, 639);
  assert.strictEqual(stalled.maxInputGap, 80);
  assert.strictEqual(stalled.gapsOverArmDelay, 1);
  assert.strictEqual(stalled.isVoid, false, 'a late-HANDLED contact is not a void measurement -- the burst was really delivered');
  // The must-red: the input itself was late, so the burst never existed as a burst.
  const slow = classifyBurst([{ kind: 'up', t: 0, ti: 0 }, { kind: 'down', t: 500, ti: 500 }], 400);
  assert.strictEqual(slow.isVoid, true);
  assert.strictEqual(slow.inputGapsOverArmDelay, 1);
  // Fail-closed: a log with no input clock classifies nothing.
  const blind = classifyBurst([{ kind: 'up', t: 0 }, { kind: 'down', t: 900 }], 400);
  assert.strictEqual(blind.inputTimesMeasured, false);
  assert.strictEqual(blind.isVoid, false);
  // The boundary is exclusive, matching the gapsOverArmDelay the failure line has always printed.
  assert.strictEqual(classifyBurst([{ kind: 'up', t: 0, ti: 0 }, { kind: 'down', t: 0, ti: 400 }], 400).isVoid, false);
  // A slow neighbour must NOT swallow a real exit: contact A was dispatched 500ms late (over the
  // window), contact B 60ms later and handled with the control already enabled. B is the defect.
  const mixed = classifyBurst([
    { kind: 'up', t: 0, ti: 0, disabled: true }, { kind: 'down', t: 500, ti: 500, disabled: true },
    { kind: 'up', t: 510, ti: 510, disabled: true }, { kind: 'down', t: 570, ti: 570, disabled: false },
  ], 400);
  assert.strictEqual(mixed.inputGapsOverArmDelay, 1, 'the slow neighbour is still reported');
  assert.deepStrictEqual(mixed.defectContacts, [{ inputGap: 60, disabled: false }]);
  assert.strictEqual(mixed.isVoid, false, 'a burst carrying an in-window contact handled ENABLED is a defect, never void');
  // The same burst without that contact IS void.
  assert.strictEqual(classifyBurst([{ kind: 'up', t: 0, ti: 0, disabled: true }, { kind: 'down', t: 500, ti: 500, disabled: false }], 400).isVoid, true);
  // A VOID that survived the retry blocks the leg, like a FAIL.
  assert.strictEqual(legExitCode({ fails: 0, voids: 1, unmeasured: 0, checked: 11 }), 1);
  // gh#199 TIGHTENS this case -- read the message it replaced before assuming a check was relaxed.
  // gh#193 asserted exactly this shape exits 0 ("one route exempted out of eleven still leaves ten
  // really checked"). That was the hole: an UNMEASURED route -- one the finder could not resolve a
  // trigger on -- reached this call as a plain uncounted route and rode a green out of CI. The
  // exempt-vs-unmeasured split is now a separate argument, and only the structurally-empty kind may
  // sit outside `checked` without blocking.
  assert.strictEqual(legExitCode({ fails: 0, voids: 0, unmeasured: 1, checked: 10 }), 1, 'gh#199: a route the probe could not walk BLOCKS -- this input exited 0 before, and that was the defect');
  assert.strictEqual(legExitCode({ fails: 0, voids: 0, unmeasured: 0, checked: 10 }), 0, 'a route whose game root really has no button is exempt and does not block the ten that were walked');
  // gh#193: every route exempted means `checked` is 0, and a walk that exercised nothing is a red.
  assert.strictEqual(legExitCode({ fails: 0, voids: 0, unmeasured: 0, checked: 0 }), 1);
}
selftest();
if (ARGV.includes('--selftest')) { console.log('play-exit-probe --selftest: burst classifier calibrated (clean, late-handled, late-input, no-input-clock, slow-neighbour-vs-defect, post-retry VOID blocks, UNMEASURED blocks while a zero-button EXEMPT does not)'); process.exit(0); }

// Calibration knobs are for a hand-driven run only: a CI leg that ran with a stall injected, or with
// the burst spaced wider than the arm window, would report a verdict about the harness and not about
// the site. TAG is 'ci' exactly when scripts/ci-probes.sh invoked this file.
// gh#193 — third knob, same rule. PROBE_OUT_FIXTURE=<path.json> loads a recorded `out` and runs the
// verdict block below on it with no browser at all. It exists because the bookkeeping down there
// (which routes the summary counts vs which ones were exempted from the burst) is pure arithmetic
// that used to be reachable only by driving Chrome, i.e. only by not testing it. Refused under the
// CI tag with the other two: a lane1 verdict computed from a file on disk is not a verdict.
const FIXTURE = process.env.PROBE_OUT_FIXTURE;
if (TAG === 'ci' && (STALL_MS !== 0 || BURST_GAP_MS !== 80 || FIXTURE)) {
  throw new Error(`refusing to run the CI leg with calibration knobs set (PROBE_STALL_MS=${STALL_MS}, PROBE_BURST_GAP_MS=${BURST_GAP_MS}, PROBE_OUT_FIXTURE=${FIXTURE ?? ''}) -- all three exist to drive this probe's own classifier and verdict to a known outcome by hand, and a CI verdict measured through them is about the harness, not the site`);
}
const out = FIXTURE ? JSON.parse(await (await import('node:fs/promises')).readFile(FIXTURE, 'utf8')) : {};
// ponytail: the walk below is guarded, not re-indented -- the diff that matters is this one line.
if (!FIXTURE) {

const api = async (p, m = 'GET') => (await fetch(`http://127.0.0.1:${PORT}${p}`, { method: m })).json();
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await send('Page.enable');
await send('Runtime.enable');

const evaluate = async (body) => {
  const res = await send('Runtime.evaluate', { expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true });
  const r = res?.result;
  if (r?.exceptionDetails) return { error: r.exceptionDetails.exception?.description ?? r.exceptionDetails.text };
  return { value: r?.result?.value ?? null };
};
// Every navigation starts from a DECLARED state -- a first-time device -- never from whatever the
// route walked before it happened to leave behind. Measured: the routes share one origin and write
// `watduang:roster` / `watduang:group` through src/shell/roster.ts, and short-stick's roster-bridge.ts
// then drives #btn-start-setup on load because that mockup opens on a marketing hero rather than on
// its setup screen. So by the time the walk reaches it, the page has auto-advanced into an in-progress
// draw round: 27 buttons in the game root and not one of them satisfying the finder at M2 (wider than
// 60px, taller than 30px, outside the header, with an offsetParent) -> a permanent UNMEASURED red.
// A fresh --user-data-dir does NOT fix this and was measured not to: the writes come from THIS run.
// The clear goes here, in the one place every navigation already goes through, and not into a
// per-route map of post-roster entry points -- six mockups own their own markup, so that map would
// grow with every route and would still be wrong the next time one changes.
// local_storage only: nothing crosses routes in sessionStorage (the setup-edit flag is consumed on
// read, and the contact log is rewritten by INSTRUMENT after every nav).
// COVERAGE GAP, named rather than hidden: a returning player who already has a saved roster is a real
// state, and this walk no longer visits it -- every route below is now measured as a first-time device
// only. Nothing here covers the returning-player entry point of any route.
const nav = async (url) => { await send('Storage.clearDataForOrigin', { origin: BASE, storageTypes: 'local_storage' }); const p = new Promise((r) => { loadResolve = r; }); await send('Page.navigate', { url }); await p; await sleep(900); };
// Both halves of the contact go on the wire together and only the PAIR is awaited. Awaiting the
// touchStart ack before writing the touchEnd put a CDP round trip INSIDE every contact, and a second
// one between contacts in the burst loop below -- so the gap the burst was measured at was the 80ms
// it was driven at plus the harness's own latency, which on a loaded runner is most of the number.
// Serialization is not what makes the input real: the browser stamps every contact with its own input
// clock when it injects it (ADR-0059), and that is the clock the classifier reads. The pair is still
// ordered -- CDP handles one session's messages in the order they arrive -- and still awaited before
// anything reads the page, so a caller that taps and then asserts on the result is unchanged.
const touch = (x, y) => Promise.all([
  send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }),
  send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }),
]);
// The transition trigger is driven with a MOUSE press/release, not a touch: cannon-flag dispatches
// no compat click for synthetic touch (measured), so its own start button never fires under touch and
// the "after a round transition" precondition would be void there. The X burst below is real touch.
const mouseClick = async (x, y) => {
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  }
};
const shot = async (path) => { const s = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(path, Buffer.from(s.result.data, 'base64')); };

// Page-side instrumentation: count contacts that reach the document while the X is disabled. If this
// stays 0 during the burst, the guard rests on nothing and a "no exit" result would be vacuous.
//
// It also records WHEN each contact landed. The arm window restarts on every pointerdown and is only
// scheduled once no pointer is down, so the one number that decides whether a burst red is a real
// regression or a slow runner is the pointerup -> next pointerdown gap: five gaps nominally 80ms
// apart, against ARM_DELAY_MS. Measured in-page, not from Node, because a Node clock reading also
// carries two CDP round trips -- lag the guard never saw.
// Written through sessionStorage on every contact, because the run that most needs these timings is
// the run where the guard let a tap through: that navigates home mid-burst and takes the page's own
// variables with it (the same wipe the contact counter suffers, see the verdict section). Same
// origin, so the timings are still readable from the page it landed on.
const CONTACT_KEY = 'playexit-probe-contacts';
const INSTRUMENT = `
  window.__pd = { total: 0, onBtnWhileDisabled: 0 };
  window.__pdlog = [];
  sessionStorage.removeItem(${JSON.stringify(CONTACT_KEY)});
  const b = document.getElementById('play-exit');
  // timeOrigin-absolute, so a gap that straddles the navigation is still a real interval.
  // Two clocks per contact: t = when this listener ran, ti = the event's own timeStamp, which the
  // browser stamps at dispatch. Both timeOrigin-absolute so they are comparable across the two.
  const mark = (ev, kind) => {
    window.__pdlog.push({ kind, t: Math.round((performance.timeOrigin + performance.now()) * 10) / 10,
                          ti: typeof ev.timeStamp === 'number' ? Math.round((performance.timeOrigin + ev.timeStamp) * 10) / 10 : null,
                          pointerType: ev.pointerType || null,
                          disabled: document.getElementById('play-exit')?.disabled ?? null });
    sessionStorage.setItem(${JSON.stringify(CONTACT_KEY)}, JSON.stringify(window.__pdlog));
  };
  document.addEventListener('pointerdown', (ev) => {
    window.__pd.total++;
    mark(ev, 'down');
    if (b && ev.target instanceof Node && b.contains(ev.target) && b.disabled) window.__pd.onBtnWhileDisabled++;
  }, true);
  document.addEventListener('pointerup', (ev) => mark(ev, 'up'), true);
  return true;`;

const XSTATE = `
  const b = document.getElementById('play-exit');
  if (!b) return { present: false };
  const r = b.getBoundingClientRect();
  const cs = getComputedStyle(b);
  // Grid over the X box, inset 1px (browser-verification trap 6): who is the top element, and what
  // sits directly under the X where it would otherwise be a live control.
  const pts = [];
  for (const fx of [0.15, 0.5, 0.85]) for (const fy of [0.15, 0.5, 0.85]) {
    const x = r.left + Math.max(1, r.width * fx), y = r.top + Math.max(1, r.height * fy);
    const stack = document.elementsFromPoint(x, y);
    pts.push({ top: stack[0] === b, under: (stack[1] && stack[1].tagName + (stack[1].id ? '#' + stack[1].id : '')) || null,
               underInteractive: !!(stack[1] && stack[1].closest('button, a[href], input, select, [role=button]')) });
  }
  return { present: true, disabled: b.disabled, rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
           opacity: cs.opacity, zIndex: cs.zIndex, position: cs.position,
           insideGameRoot: !!b.closest('#app, #app-container'),
           anchorsInGameRoot: document.querySelectorAll('#app a[href], #app-container a[href]').length,
           allTop: pts.every((p) => p.top), coversInteractive: pts.filter((p) => p.underInteractive).length,
           under: [...new Set(pts.map((p) => p.under))],
           innerWidth, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
           scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth };`;

for (const g of ROUTES) {
  const url = `${BASE}/game/${g}/play/`;
  const res = { route: g };

  // --- M1: idle -> visible, armed, clickable, lands on /
  await nav(url);
  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 1, mobile: true });
  await sleep(800);
  const s1 = (await evaluate(XSTATE)).value;
  res.idle = s1;
  await shot(`${SHOT}/playexit-${TAG}-${g}-idle.png`);
  if (s1 && s1.present) {
    await touch(s1.rect.x + s1.rect.w / 2, s1.rect.y + s1.rect.h / 2);
    await sleep(900);
    res.m1_pathname = (await evaluate('return location.pathname;')).value;
  }

  // --- M2: real transition, then a 5-tap burst at the X coordinates
  // gh#190 — at most TWO attempts. A burst one of whose contacts the runner could not dispatch inside
  // the arm window measured nothing, and this block is self-contained (it re-navigates, re-instruments
  // and re-transitions), so one retry costs one route walk and clears a one-off latency spike. A burst
  // still VOID after the retry is fail-closed in the verdict below -- see legExitCode.
  // Which candidate from the finder's ranking this pass drives. NOT a route name and not a per-route
  // map: the ranking is re-derived from the artifact every run, and the cursor only ever moves because
  // THIS run measured the previous candidate to be unusable (see the advance condition at the bottom
  // of the loop). Measured on a declared first-time device: pinocchio-luck's two candidates have
  // IDENTICAL area (13824 each), so `cands[0]` is decided by DOM order alone, and the one DOM order
  // hands over first opens a confirm modal whose overlay sits on top of the X -- the burst then lands
  // on the overlay and measures nothing about the X. An area sort cannot break that tie; only the
  // outcome can.
  // Three budgets, deliberately NOT one shared counter. A shared one spends the flake retry on the
  // candidate advance: attempt 1 VOID, attempt 2 advances, attempt 3 VOID on the new candidate and the
  // loop is out of passes -- a post-retry VOID red on a burst that got no retry on that candidate at
  // all. `retries` is therefore reset on every advance, so the rule is one flake retry PER CANDIDATE.
  //   retries  <= 1                 one re-walk of the SAME candidate for a VOID burst or a finder
  //                                 miss, which is the gh#190/gh#199 behaviour, unchanged.
  //   advances <= MAX_CAND_ADVANCE  moves to the NEXT candidate in the finder's ranking. Capped rather
  //                                 than run to cands.length: how-close-is-near ranks ten, and walking
  //                                 all ten would turn one bad heuristic into a ten-minute leg.
  //   attempt  <  HARD_CAP          arithmetic backstop so no future edit to either rule can spin.
  let cx = 0, cy = 0, candIdx = 0, advances = 0, retries = 0;
  const HARD_CAP = 2 * (1 + MAX_CAND_ADVANCE);
  let attempt = 0;
  while (attempt < HARD_CAP) {
    attempt++;
    await nav(url);
    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 1, mobile: true });
    await sleep(800);
    await evaluate(INSTRUMENT);
    const rect = (await evaluate(XSTATE)).value.rect;
    // Drive the transition through the game's own trigger: the largest visible button inside the game
    // root that is not a header icon button.
    // gh#199 — the finder now reports its DENOMINATOR, not just its answer. A null trigger has two
    // causes that used to be indistinguishable, and collapsing them is what let a route the probe
    // could not walk score EXEMPT inside a green run:
    //   buttonsInRoot > 0 -> the route HAS pressable things and this measurement did not resolve one.
    //                        That is a finder miss (see the verdict block for the measured cause) ->
    //                        retry, then UNMEASURED and RED. Never subtracted from coverage silently.
    //   buttonsInRoot === 0 -> the built page's game root contains no <button> at all. That is a
    //                        structural property of the route, re-derived from the artifact on every
    //                        run, so it self-clears the moment the route grows a button. This is the
    //                        only exemption, and its reason is this measured count.
    // A throwing expression (root null, as how-close-is-near's #appRoot once was) yields no value at
    // all -> triggerScan null -> UNMEASURED, not exempt. Fail-closed: the one shape that buys an
    // exemption is a number this run actually read off the page.
    const scan = (await evaluate(`
      // #appRoot is how-close-is-near's game root. Measured: without it, root was null there, the
      // expression threw, and the route reported "no transition trigger" forever -- a permanent skip
      // that looked exactly like a route with nothing to press.
      const root = document.querySelector('#app, #app-container, #appRoot');
      const all = [...root.querySelectorAll('button')];
      // Evidence, not a gate: how many site keys this route actually loaded with. A finder miss and a
      // route that auto-advanced past its own entry point look identical in the rejected list alone, and
      // number is what tells them apart. Read after load, so a route that writes its own draft on boot
      // legitimately reports >0 -- which is why nothing is judged on it.
      const storageKeysAtLoad = (() => { try { return localStorage.length; } catch { return null; } })();
      const cands = all.filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 60 && r.height > 30 && r.top >= 0 && !b.closest('header') && getComputedStyle(b).visibility !== 'hidden' && b.offsetParent !== null;
      }).sort((a, z) => z.getBoundingClientRect().width * z.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height);
      const b = cands[${candIdx}];
      if (!b) return { buttonsInRoot: all.length, storageKeysAtLoad, candidateCount: cands.length, candIdx: ${candIdx}, trigger: null,
        // Why each candidate was rejected -- an UNMEASURED red that names no cause is a red nobody
        // can act on, and only tail -n 3 of this file reaches the CI log.
        rejected: all.slice(0, 6).map((x) => { const r = x.getBoundingClientRect();
          return { label: (x.textContent || '').trim().slice(0, 16), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top),
                   inHeader: !!x.closest('header'), hidden: getComputedStyle(x).visibility === 'hidden' || x.offsetParent === null }; }) };
      b.scrollIntoView({ block: 'center' });
      await new Promise((r) => setTimeout(r, 200));
      const r = b.getBoundingClientRect();
      window.__sig = () => root.innerText.length + '|' + (document.querySelector('.game-screen.active, .screen.active')?.id ?? '') + '|' + root.innerHTML.length;
      window.__sigBefore = window.__sig();
      return { buttonsInRoot: all.length, storageKeysAtLoad, candidateCount: cands.length, candIdx: ${candIdx}, rejected: [], trigger: {
        label: (b.textContent || '').trim().slice(0, 24), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
        inViewport: r.top > 0 && r.bottom < innerHeight } };`)).value;
    const startBtn = scan?.trigger ?? null;
    res.transitionTrigger = startBtn;
    res.triggerScan = scan ? { buttonsInRoot: scan.buttonsInRoot, storageKeysAtLoad: scan.storageKeysAtLoad ?? null, candidateCount: scan.candidateCount ?? 0, candIdx: scan.candIdx ?? 0, rejected: scan.rejected ?? [] } : null;
    // The burst is the CONTINUATION of the transition tap — no pause in between. A pause longer than
    // ARM_DELAY_MS is by definition not a burst any more: the control has armed, and a contact then is
    // the deliberate tap the ticket wants to work (milestone 3).
    cx = rect.x + rect.w / 2; cy = rect.y + rect.h / 2;
    if (startBtn) await mouseClick(startBtn.x, startBtn.y);
    // Calibration only (PROBE_STALL_MS): a synchronous busy loop scheduled for the next task, which is
    // the CI runner's long transition task reproduced on a machine that does not have one. The five
    // touches below are still dispatched on time; the page cannot handle any of them until it ends.
    if (STALL_MS > 0) await evaluate(`setTimeout(() => { const end = performance.now() + ${STALL_MS}; while (performance.now() < end); }, 0); return true;`);
    // The spacing between contacts is the Node timer alone -- BURST_GAP_MS, unchanged. The
    // acknowledgements are collected and awaited after the burst, never between its contacts: waiting
    // for them in here added a round trip per contact to the very interval the classifier compares
    // against ARM_DELAY_MS, so the burst was measured wider than it was driven and a slow runner
    // voided the leg on the harness's latency rather than on the site's. Nothing is dropped: the
    // whole burst is settled before the page is read, and the classifier is unchanged -- gaps are
    // only ever compared as OVER the window, so contacts landing closer together sit deeper inside it.
    const acks = [];
    for (let i = 0; i < 5; i++) { await sleep(BURST_GAP_MS); acks.push(touch(cx, cy)); }
    await Promise.all(acks);
    await sleep(150);
    // Only means something if the screen actually changed. Also: what does the X cover NOW?
    res.transitioned = (await evaluate('return window.__sig ? window.__sig() !== window.__sigBefore : null;')).value;
    res.postTransition = (await evaluate(XSTATE)).value;
    res.burst = {
      pathname: (await evaluate('return location.pathname;')).value,
      disabledAfterBurst: (await evaluate("return document.getElementById('play-exit')?.disabled ?? null;")).value,
      contacts: (await evaluate('return window.__pd;')).value,
    };
    // Six contacts (the transition mouse press, then the five touches) -> five pointerup->pointerdown
    // gaps. The first one is the transition tap's own release, which is what starts the arm window.
    const contactLog = (await evaluate(`return JSON.parse(sessionStorage.getItem(${JSON.stringify(CONTACT_KEY)}) || '[]');`)).value ?? [];
    res.burst.armDelayMs = ARM_DELAY_MS;
    res.burst.timeline = contactLog;
    res.burst.stallMs = STALL_MS;
    res.burst.burstGapMs = BURST_GAP_MS;
    Object.assign(res.burst, classifyBurst(contactLog, ARM_DELAY_MS));
    res.burst.attempts = attempt;
    await shot(`${SHOT}/playexit-${TAG}-${g}-burst.png`);
    // gh#199 — a finder miss retries on the same terms a VOID burst does. The retry's original
    // justification -- that a finder miss varies with how busy the host's CPU happens to be -- was
    // false. The cause actually measured was persisted `watduang:roster` local storage surviving
    // between scenarios inside one run, which left the page auto-advanced past its own entry point
    // so the finder resolved nothing. That cause is now CURED in this same file: `nav` clears local
    // storage before every navigate, added in the same commit as this retry. So a finder miss today
    // has no measured benign cause, and whether this retry-then-SKIP branch should stay, or a miss
    // should simply be RED, is an open question this comment does not answer. The "ten runs, zero
    // variance" figure behind the storage measurement has no artifact under docs/verification -- it
    // is recorded only in session prose, not as a committed measurement in this repo.
    // `=== 0` and not `!buttonsInRoot`: an absent
    // triggerScan (the finder expression threw) must NOT satisfy this and end the loop early.
    const triggerResolved = !!res.transitionTrigger || res.triggerScan?.buttonsInRoot === 0;
    // One flake retry per candidate: a burst the runner could not deliver, and a finder that resolved
    // nothing. The finder side no longer has a measured benign cause (see the comment on
    // triggerResolved above) -- kept on the same terms pending a decision on whether it should still
    // retry or go straight to RED.
    if ((res.burst.isVoid || !triggerResolved) && retries < 1) { retries++; continue; }
    if (res.burst.isVoid || !triggerResolved) break;

    // What this pass has to have produced for the route to be scored on it. BOTH halves are required:
    //   transitioned   the screen really changed. Without it the burst measured an idle screen, and
    //                  src/shell/PlayExit.astro disarms the X on ANY document pointerdown -- so an
    //                  inert control (a sound toggle, a rules tab) leaves the burst landing on a
    //                  DISABLED X and every check below passing, with the precondition this whole leg
    //                  exists for never having happened. Judging the burst alone would make "walk off
    //                  the real start button onto whatever greens" the designed outcome of the advance.
    //   measuredTheX   contacts really reached the X. pinocchio-luck's first-ranked candidate (tied on
    //                  area with the real start, so DOM order picks it) opens a confirm modal whose
    //                  overlay swallows the whole burst -- transitioned is true and the X was never
    //                  touched, which is exactly as unusable and for the opposite reason.
    const usable = res.transitioned === true && res.burst.contacts?.onBtnWhileDisabled > 0;
    const moreCandidates = candIdx + 1 < (res.triggerScan?.candidateCount ?? 0);
    // Guarded on REACHABILITY, not on a `!==` that is true whenever the value is absent. `send`
    // resolves a CDP protocol error as a plain null (see evaluate), so `pathname !== '/'` reads TRUE
    // for an evaluate that landed mid-navigation -- i.e. for the burst that DID leave the round, the
    // one outcome that must never be retried away. Both of these must be positively present.
    const stillInRound = res.burst.pathname === `/game/${g}/play/`;
    const contactsRead = typeof res.burst.contacts?.onBtnWhileDisabled === 'number';
    if (!usable && stillInRound && contactsRead && moreCandidates && advances < MAX_CAND_ADVANCE) {
      candIdx++; advances++; retries = 0; continue;
    }
    break;
  }

  // --- M3: after the arm delay, one deliberate tap exits (also the positive control for M2:
  // it proves these coordinates + this touch pipeline CAN navigate)
  await sleep(700);
  res.armedBeforeDeliberate = (await evaluate("return document.getElementById('play-exit')?.disabled ?? null;")).value;
  await touch(cx, cy);
  await sleep(1000);
  res.m3_pathname = (await evaluate('return location.pathname;')).value;
  out[g] = res;
}

await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
ws.close();
console.log(JSON.stringify(out, null, 2));
}

// --- verdict ------------------------------------------------------------------------------------
// Every measurement above used to be thrown away by a bare process.exit(0). ADR-0050 ruling 3 promises
// every game a double-tap-guarded X, and since gh#149 deleted the party landing pages this walk is the
// only thing in CI that measures it -- so it judges itself here.
// A scenario that was NOT exercisable is a SKIP with its reason, never a pass: the burst only means
// something after a real transition disarmed the X, and a route whose transition trigger was not found
// was never disarmed at all. What was measured as the cause -- persisted `watduang:roster` local
// storage surviving between scenarios inside one run, not variance in the host's CPU -- is now CURED
// in this same file (`nav` clears local storage before every navigate, added in the same commit as
// this retry), so treating a finder miss as a flaky SKIP rather than an outright RED is no longer
// backed by a live cause; whether it should still SKIP or become RED is open, see the comment on
// triggerResolved. All-skipped is a RED -- so is an empty route set, which the throw at the top of
// this file already refuses.
// Carried into every burst-side message on purpose: only `tail -n 3` of this file's output reaches the
// CI log, so the number that decides the cause has to be IN the failure line. A gap above
// ARM_DELAY_MS means the X had armed before that contact -- a slow runner, not a broken guard; every
// gap under it and the guard itself is the suspect.
// gh#190 — both columns, always: a handling gap over ARM_DELAY_MS with the input gaps under it is a
// runner that handled the burst late, not one that sent it late, and only the second of those makes
// the measurement void. A red that prints one column cannot tell those apart, which is how this leg
// spent two CI runs naming the wrong cause.
const gapNote = (r) => r.burst?.maxGap == null
  ? 'no contact timings captured, so this red names no cause'
  : `largest pointerup->pointerdown gap: handled ${r.burst.maxGap}ms, input ${r.burst.maxInputGap == null ? 'NOT CAPTURED -- a slow dispatch cannot be told from a gate defect here' : r.burst.maxInputGap + 'ms'} vs ARM_DELAY_MS ${ARM_DELAY_MS} (over it: ${r.burst.gapsOverArmDelay} handled, ${r.burst.inputGapsOverArmDelay} input; handled gaps ${r.burst.gaps.join(', ')}; input gaps ${r.burst.inputGaps.join(', ')})`;
const fails = [], skips = [], voids = [], unmeasured = [], bands = [];
// gh#193 — the skipped routes BY NAME, because `checked` used to be `Object.keys(out).length` and a
// route could sit in both sets at once: short-stick skipped on four consecutive runs while the summary
// reported "11 route(s) checked". A count that includes a route nothing exercised is not coverage.
const exempt = new Set();
const unmeasuredSet = new Set();
for (const [g, r] of Object.entries(out)) {
  if (!r.idle?.present) { fails.push(`${g}: no #play-exit on the play page at all`); continue; }
  if (r.m1_pathname !== '/') fails.push(`${g}: M1 -- an idle deliberate tap on the X did not leave the round (pathname ${r.m1_pathname})`);
  // gh#199 — the fork the whole ticket is about. gh#193 sent BOTH halves of this down the skip path,
  // where an unexercised route was subtracted from the count and the run stayed green; the message
  // it printed already admitted it was recording "a finder miss, not a property of the route" and
  // exempted it anyway. play-exit-guard-probe measured a trigger on short-stick after this file
  // reported none -- that is the proof the miss is the FINDER's, and a finder miss is a measurement
  // that did not happen, not coverage.
  // The discriminator is the button count the finder read off the game root THIS run (see M2), never
  // a per-route allowlist: an allowlist here would be owned by nobody, would grow with every new
  // route the finder trips on, and would keep exempting a route long after it grew a trigger.
  if (!r.transitionTrigger) {
    if (r.triggerScan?.buttonsInRoot === 0) {
      exempt.add(g);
      skips.push(`${g} burst: the game root contains no <button> at all (measured this run), so there is no transition to drive -- EXEMPT from the checked count, not covered by it`);
    } else {
      unmeasuredSet.add(g);
      const scan = r.triggerScan;
      const why = scan
        ? `${scan.buttonsInRoot} button(s) in the game root, none resolvable as a trigger, ${scan.storageKeysAtLoad ?? '?'} site storage key(s) present at load [${(scan.rejected ?? []).map((b) => `${b.label || '?'} ${b.w}x${b.h}@${b.top}${b.inHeader ? ' header' : ''}${b.hidden ? ' hidden' : ''}`).join('; ') || 'no detail captured'}]`
        : 'the finder expression returned nothing at all (it threw, or the game root selector matched no element)';
      unmeasured.push(`${g} burst: UNMEASURED after ${r.burst?.attempts ?? '?'} attempt(s) -- ${why}. Nothing disarmed the X, so the burst leg never ran on this route; this is a failed MEASUREMENT and it blocks, it is NOT an exemption`);
    }
    continue;
  }
  // The precondition, judged and no longer merely recorded. `transitioned` was written on every walk
  // since gh#144 and read by nothing, which left the burst leg able to pass on a screen that never
  // changed: src/shell/PlayExit.astro disarms the X on ANY document pointerdown, so pressing an inert
  // control (a sound toggle, a rules tab) disables the X just as a real round transition does, the
  // burst lands on a disabled X, and every check below goes green with the arm-gate behaviour this leg
  // exists to measure never having been exercised. UNMEASURED and RED, for the same reason a finder
  // miss is: the measurement did not happen. It is NOT a FAIL -- nothing about the site was shown to
  // be broken, only that the probe could not set up its own precondition.
  if (r.transitioned !== true) {
    unmeasuredSet.add(g);
    const t = r.transitionTrigger;
    unmeasured.push(`${g} burst: UNMEASURED after ${r.burst?.attempts ?? '?'} attempt(s) -- the trigger the finder drove ("${t?.label ?? '?'}", candidate ${(r.triggerScan?.candIdx ?? 0) + 1} of ${r.triggerScan?.candidateCount ?? '?'}) left the screen unchanged (transitioned=${r.transitioned}), so no round transition ever disarmed the X and the burst measured an idle screen; this is a failed MEASUREMENT and it blocks`);
    continue;
  }
  // The harm first, liveness second: with the guard broken the burst navigates home, which also wipes
  // the in-page contact counter -- so a liveness-first order reports "measured nothing" for a run that
  // in fact measured the exact regression this leg exists to catch (observed, calibration run).
  // The defect check outranks VOID, and both outrank the burst-wide checks: ONE contact dispatched
  // inside the window and handled with the X already enabled is the ticket's defect whatever its
  // neighbours did, and a slow neighbour must not be allowed to void it away. VOID is only the case
  // where no contact carries the defect and the burst was still not delivered as a burst -- neither
  // the harm check nor the liveness check below is reading what it thinks it is then. Judged on the
  // INPUT clock alone -- see classifyBurst.
  // Every walked route prints its band, green or red -- not only the ones that went VOID. A leg whose
  // gaps are recorded only when they already blew the window cannot show how much room the passing
  // runs had, so a drift toward ARM_DELAY_MS is invisible until the first void. Same shape as the
  // failure lines, so both are read the same way.
  bands.push(`${g}: ${gapNote(r)}`);
  const dc = r.burst?.defectContacts ?? [];
  if (dc.length) fails.push(`${g}: ${dc.length} burst contact(s) dispatched INSIDE the arm window were handled with the X ENABLED (input gaps ${dc.map((d) => d.inputGap).join(', ')}ms vs ARM_DELAY_MS ${ARM_DELAY_MS}; pathname ${r.burst?.pathname}) -- ${gapNote(r)}`);
  else if (r.burst?.isVoid) { voids.push(`${g} burst: runner too slow to dispatch the burst inside the arm window (${r.burst.attempts} attempt(s)) -- ${gapNote(r)}`); }
  else if (r.burst?.pathname === '/') fails.push(`${g}: the 5-tap burst continuing a transition tap LEFT THE ROUND (pathname ${r.burst.pathname}) -- ${gapNote(r)}`);
  else if (!(r.burst?.contacts?.onBtnWhileDisabled > 0)) fails.push(`${g}: the burst put ${r.burst?.contacts?.onBtnWhileDisabled ?? 'no'} contact(s) on a DISABLED X -- a no-exit result here rests on nothing -- ${gapNote(r)}`);
  if (r.m3_pathname !== '/') fails.push(`${g}: M3 -- after the arm delay a deliberate tap no longer exits (pathname ${r.m3_pathname})`);
}
// Disjoint by construction: the two sets are filled in mutually exclusive branches of one `if`, and
// `checked` subtracts both -- a route is fully walked, or exempt, or unmeasured, never two of them.
const exemptIds = [...exempt].sort();
const unmeasuredIds = [...unmeasuredSet].sort();
const checked = Object.keys(out).filter((g) => !exempt.has(g) && !unmeasuredSet.has(g)).length;
// Two channels, same as UNMEASURED and VOID below: the indented line is what a hand-run reads, and
// the annotation is the only half that survives a GREEN leg -- the CI wrapper swallows a passing
// leg's log except for its ::warning::/::notice:: lines. A band printed on plain stdout alone would
// measure the margin for whoever ran the probe by hand and stay invisible on the very runner whose
// drift toward ARM_DELAY_MS it exists to catch. ::notice:: because a band is not a defect.
for (const b of bands) {
  console.log(`  GAPS ${b}`);
  console.warn(`::notice::play-exit GAPS ${b}`);
}
for (const f of fails) console.log(`  FAIL ${f}`);
for (const u of unmeasured) {
  console.log(`  UNMEASURED ${u}`);
  console.warn(`::warning::play-exit ${u}`);
}
for (const s of skips) console.log(`  SKIP ${s}`);
// VOID is its own outcome, printed and annotated through the ::warning:: channel ci-probes.sh already
// greps out of a standalone leg -- but it is NOT a pass: scripts/ci-probes.sh judges this leg on its
// exit code alone, so anything short of a non-zero exit writes the label into lane1.pass and lets a
// deploy proceed on a measurement that never happened. It already survived one retry by the time it
// reaches here. Relaxing a post-retry VOID to non-blocking is an owner decision on gh#190.
for (const v of voids) {
  console.log(`  VOID ${v}`);
  console.warn(`::warning::play-exit ${v}`);
}
// Only `tail -n 3` of this reaches the CI log, so both unwalked sets are named IN the summary line.
// Every number here, and what it counts:
//   checked                  routes in `out` that are neither exempt nor unmeasured -- every leg,
//                            burst included, really ran. This is the ONLY number that means coverage.
//   Object.keys(out).length  routes this walk produced a record for (the whole route set on a full
//                            run; under PROBE_OUT_FIXTURE, the fixture's route set).
//   fails.length             FAIL messages, NOT routes -- one route can emit several (M1 and M3 both).
//   voids.length             routes whose burst was still undeliverable after its retry.
//   unmeasuredIds.length     routes the finder could not resolve a trigger on after its retry. RED.
//   exemptIds.length         routes whose game root measured zero buttons this run. Not coverage,
//                            not a red.
// checked + exemptIds.length + unmeasuredIds.length === Object.keys(out).length, minus routes that
// failed out on the first line of the loop (no #play-exit at all) -- those are already FAILs.
console.log(`play-exit: ${checked} of ${Object.keys(out).length} route(s) fully checked, ${fails.length} failure(s), ${voids.length} burst leg(s) VOID after a retry, ${unmeasuredIds.length} route(s) UNMEASURED (finder resolved no trigger -- RED): ${unmeasuredIds.join(', ') || 'none'}, ${exemptIds.length} route(s) EXEMPT from the checked count (no button in the game root): ${exemptIds.join(', ') || 'none'}`);
process.exit(legExitCode({ fails: fails.length, voids: voids.length, unmeasured: unmeasuredIds.length, checked }));
