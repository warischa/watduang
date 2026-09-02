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
const legExitCode = ({ fails, voids, skips, checked }) =>
  (fails > 0 || voids > 0 || checked === 0 || skips + voids === checked ? 1 : 0);

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
  // A VOID that survived the retry blocks the leg, like a FAIL; a SKIP alone does not.
  assert.strictEqual(legExitCode({ fails: 0, voids: 1, skips: 0, checked: 11 }), 1);
  assert.strictEqual(legExitCode({ fails: 0, voids: 0, skips: 1, checked: 11 }), 0);
  assert.strictEqual(legExitCode({ fails: 0, voids: 0, skips: 11, checked: 11 }), 1);
}
selftest();
if (ARGV.includes('--selftest')) { console.log('play-exit-probe --selftest: burst classifier calibrated (clean, late-handled, late-input, no-input-clock, slow-neighbour-vs-defect, post-retry VOID blocks)'); process.exit(0); }

// Calibration knobs are for a hand-driven run only: a CI leg that ran with a stall injected, or with
// the burst spaced wider than the arm window, would report a verdict about the harness and not about
// the site. TAG is 'ci' exactly when scripts/ci-probes.sh invoked this file.
if (TAG === 'ci' && (STALL_MS !== 0 || BURST_GAP_MS !== 80)) {
  throw new Error(`refusing to run the CI leg with calibration knobs set (PROBE_STALL_MS=${STALL_MS}, PROBE_BURST_GAP_MS=${BURST_GAP_MS}) -- both exist to drive this probe's own classifier to a known outcome by hand, and a CI verdict measured through them is about the harness, not the site`);
}

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
const nav = async (url) => { const p = new Promise((r) => { loadResolve = r; }); await send('Page.navigate', { url }); await p; await sleep(900); };
const touch = async (x, y) => {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};
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

const out = {};
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
  let cx = 0, cy = 0;
  for (let attempt = 1; attempt <= 2; attempt++) {
    await nav(url);
    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 1, mobile: true });
    await sleep(800);
    await evaluate(INSTRUMENT);
    const rect = (await evaluate(XSTATE)).value.rect;
    // Drive the transition through the game's own trigger: the largest visible button inside the game
    // root that is not a header icon button.
    const startBtn = (await evaluate(`
      // #appRoot is how-close-is-near's game root. Measured: without it, root was null there, the
      // expression threw, and the route reported "no transition trigger" forever -- a permanent skip
      // that looked exactly like a route with nothing to press.
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
      window.__sig = () => root.innerText.length + '|' + (document.querySelector('.game-screen.active, .screen.active')?.id ?? '') + '|' + root.innerHTML.length;
      window.__sigBefore = window.__sig();
      return { label: (b.textContent || '').trim().slice(0, 24), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
               inViewport: r.top > 0 && r.bottom < innerHeight };`)).value;
    res.transitionTrigger = startBtn;
    // The burst is the CONTINUATION of the transition tap — no pause in between. A pause longer than
    // ARM_DELAY_MS is by definition not a burst any more: the control has armed, and a contact then is
    // the deliberate tap the ticket wants to work (milestone 3).
    cx = rect.x + rect.w / 2; cy = rect.y + rect.h / 2;
    if (startBtn) await mouseClick(startBtn.x, startBtn.y);
    // Calibration only (PROBE_STALL_MS): a synchronous busy loop scheduled for the next task, which is
    // the CI runner's long transition task reproduced on a machine that does not have one. The five
    // touches below are still dispatched on time; the page cannot handle any of them until it ends.
    if (STALL_MS > 0) await evaluate(`setTimeout(() => { const end = performance.now() + ${STALL_MS}; while (performance.now() < end); }, 0); return true;`);
    for (let i = 0; i < 5; i++) { await sleep(BURST_GAP_MS); await touch(cx, cy); }
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
    if (!res.burst.isVoid) break;
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

// --- verdict ------------------------------------------------------------------------------------
// Every measurement above used to be thrown away by a bare process.exit(0). ADR-0050 ruling 3 promises
// every game a double-tap-guarded X, and since gh#149 deleted the party landing pages this walk is the
// only thing in CI that measures it -- so it judges itself here.
// A scenario that was NOT exercisable is a SKIP with its reason, never a pass: the burst only means
// something after a real transition disarmed the X, and a route whose transition trigger was not found
// was never disarmed at all (measured: short-stick's trigger is found or missed depending on machine
// load, so gating its burst unconditionally would pin a flaky red). All-skipped is a RED -- so is an
// empty route set, which the throw at the top of this file already refuses.
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
const fails = [], skips = [], voids = [];
for (const [g, r] of Object.entries(out)) {
  if (!r.idle?.present) { fails.push(`${g}: no #play-exit on the play page at all`); continue; }
  if (r.m1_pathname !== '/') fails.push(`${g}: M1 -- an idle deliberate tap on the X did not leave the round (pathname ${r.m1_pathname})`);
  if (!r.transitionTrigger) { skips.push(`${g} burst: no transition trigger found, so nothing disarmed the X`); continue; }
  // The harm first, liveness second: with the guard broken the burst navigates home, which also wipes
  // the in-page contact counter -- so a liveness-first order reports "measured nothing" for a run that
  // in fact measured the exact regression this leg exists to catch (observed, calibration run).
  // The defect check outranks VOID, and both outrank the burst-wide checks: ONE contact dispatched
  // inside the window and handled with the X already enabled is the ticket's defect whatever its
  // neighbours did, and a slow neighbour must not be allowed to void it away. VOID is only the case
  // where no contact carries the defect and the burst was still not delivered as a burst -- neither
  // the harm check nor the liveness check below is reading what it thinks it is then. Judged on the
  // INPUT clock alone -- see classifyBurst.
  const dc = r.burst?.defectContacts ?? [];
  if (dc.length) fails.push(`${g}: ${dc.length} burst contact(s) dispatched INSIDE the arm window were handled with the X ENABLED (input gaps ${dc.map((d) => d.inputGap).join(', ')}ms vs ARM_DELAY_MS ${ARM_DELAY_MS}; pathname ${r.burst?.pathname}) -- ${gapNote(r)}`);
  else if (r.burst?.isVoid) { voids.push(`${g} burst: runner too slow to dispatch the burst inside the arm window (${r.burst.attempts} attempt(s)) -- ${gapNote(r)}`); }
  else if (r.burst?.pathname === '/') fails.push(`${g}: the 5-tap burst continuing a transition tap LEFT THE ROUND (pathname ${r.burst.pathname}) -- ${gapNote(r)}`);
  else if (!(r.burst?.contacts?.onBtnWhileDisabled > 0)) fails.push(`${g}: the burst put ${r.burst?.contacts?.onBtnWhileDisabled ?? 'no'} contact(s) on a DISABLED X -- a no-exit result here rests on nothing -- ${gapNote(r)}`);
  if (r.m3_pathname !== '/') fails.push(`${g}: M3 -- after the arm delay a deliberate tap no longer exits (pathname ${r.m3_pathname})`);
}
const checked = Object.keys(out).length;
for (const f of fails) console.log(`  FAIL ${f}`);
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
console.log(`play-exit: ${checked} route(s) checked, ${fails.length} failed, ${voids.length} burst leg(s) VOID after a retry, ${skips.length} burst leg(s) not exercisable`);
process.exit(legExitCode({ fails: fails.length, voids: voids.length, skips: skips.length, checked }));
