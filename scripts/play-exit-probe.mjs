// gh#144 PlayExit walk. Standalone CDP client (driver.mjs has no raw send / no sub-400ms burst).
// A CI leg since gh#149 (scripts/ci-probes.sh lane1) — it judges its own JSON at the bottom and exits
// non-zero on a red. Serve dist first (npx serve dist -l 5051, or set BASE).
// Usage: node scripts/play-exit-probe.mjs <cdpPort> <shotDir> <tag>
const [PORT = '9222', SHOT = '/tmp', TAG = 'normal'] = process.argv.slice(2);
const { writeFile } = await import('node:fs/promises');
const BASE = process.env.BASE ?? 'http://localhost:5051';

// Derived, never listed. A hardcoded list silently drops every new port: short-stick shipped and was
// never added here, and timebomb would have been the next one. The manifest is the declaration of
// record, and landing-claims-check already reds a declared playRoute with no built page, so a route
// that reaches this list is a route that exists. Same dynamic-import idiom as landing-claims-check.mjs
// (plain node strips the TypeScript). Set ROUTES_ONLY=a,b to narrow it while debugging one route.
const { fileURLToPath } = await import('node:url');
const { games } = await import(`${fileURLToPath(new URL('..', import.meta.url))}src/games/manifest.ts`);
const only = process.env.ROUTES_ONLY?.split(',').map((s) => s.trim()).filter(Boolean);
const ROUTES = games
  .filter((g) => g.playRoute)
  .map((g) => g.id)
  .filter((id) => !only?.length || only.includes(id))
  .sort();
if (!ROUTES.length) throw new Error('no play routes derived from the manifest — refusing to report a vacuous pass');

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
const INSTRUMENT = `
  window.__pd = { total: 0, onBtnWhileDisabled: 0 };
  const b = document.getElementById('play-exit');
  document.addEventListener('pointerdown', (ev) => {
    window.__pd.total++;
    if (b && ev.target instanceof Node && b.contains(ev.target) && b.disabled) window.__pd.onBtnWhileDisabled++;
  }, true);
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
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  if (startBtn) await mouseClick(startBtn.x, startBtn.y);
  for (let i = 0; i < 5; i++) { await sleep(80); await touch(cx, cy); }
  await sleep(150);
  // Only means something if the screen actually changed. Also: what does the X cover NOW?
  res.transitioned = (await evaluate('return window.__sig ? window.__sig() !== window.__sigBefore : null;')).value;
  res.postTransition = (await evaluate(XSTATE)).value;
  res.burst = {
    pathname: (await evaluate('return location.pathname;')).value,
    disabledAfterBurst: (await evaluate("return document.getElementById('play-exit')?.disabled ?? null;")).value,
    contacts: (await evaluate('return window.__pd;')).value,
  };
  await shot(`${SHOT}/playexit-${TAG}-${g}-burst.png`);

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
const fails = [], skips = [];
for (const [g, r] of Object.entries(out)) {
  if (!r.idle?.present) { fails.push(`${g}: no #play-exit on the play page at all`); continue; }
  if (r.m1_pathname !== '/') fails.push(`${g}: M1 -- an idle deliberate tap on the X did not leave the round (pathname ${r.m1_pathname})`);
  if (!r.transitionTrigger) { skips.push(`${g} burst: no transition trigger found, so nothing disarmed the X`); continue; }
  // The harm first, liveness second: with the guard broken the burst navigates home, which also wipes
  // the in-page contact counter -- so a liveness-first order reports "measured nothing" for a run that
  // in fact measured the exact regression this leg exists to catch (observed, calibration run).
  if (r.burst?.pathname === '/') fails.push(`${g}: the 5-tap burst continuing a transition tap LEFT THE ROUND (pathname ${r.burst.pathname})`);
  else if (!(r.burst?.contacts?.onBtnWhileDisabled > 0)) fails.push(`${g}: the burst put ${r.burst?.contacts?.onBtnWhileDisabled ?? 'no'} contact(s) on a DISABLED X -- a no-exit result here rests on nothing`);
  if (r.m3_pathname !== '/') fails.push(`${g}: M3 -- after the arm delay a deliberate tap no longer exits (pathname ${r.m3_pathname})`);
}
const checked = Object.keys(out).length;
for (const f of fails) console.log(`  FAIL ${f}`);
for (const s of skips) console.log(`  SKIP ${s}`);
console.log(`play-exit: ${checked} route(s) checked, ${fails.length} failed, ${skips.length} burst leg(s) not exercisable`);
process.exit(fails.length > 0 || checked === 0 || skips.length === checked ? 1 : 0);
