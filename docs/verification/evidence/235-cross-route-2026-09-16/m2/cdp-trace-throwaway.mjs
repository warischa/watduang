// Throwaway trace probe for gh#235 M2. Lives outside the repo (scratchpad) per
// docs/agents/DRIVER-PLAYBOOK.md "Confirming a no-WebGL lane without running a full probe" pattern --
// a one-off driver, not a forked/instrumented copy of any shipped script. No src/ file touched.
// Uses Profiler.start/stop (CPU sampling profiler) to get a stack-attributed self-time breakdown over
// the interval spanning the transition tap. Node 22 native WebSocket, same primitives as scripts/driver.mjs.

const CDP_PORT = process.env.CDP_PORT || 9522;
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4522';
const ROUTE = process.env.ROUTE; // e.g. 'croc-bite' or 'cursed-number'
const TRIGGER = process.env.TRIGGER; // css selector for the transition control
const WAIT_MS = Number(process.env.WAIT_MS || 3000);
const SAMPLING_INTERVAL_US = Number(process.env.SAMPLING_US || 100);

const api = async (p, method = 'GET') => (await fetch(`http://127.0.0.1:${CDP_PORT}${p}`, { method })).json();
const target = await api('/json/new?about:blank', 'PUT');
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
let loadResolve = null;
const send = (method, params = {}) => new Promise((res) => {
  pending.set(++id, res);
  ws.send(JSON.stringify({ id, method, params }));
});
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); return; }
  if (m.method === 'Page.loadEventFired' && loadResolve) { loadResolve(); loadResolve = null; }
});
await new Promise((r) => ws.addEventListener('open', r));

await send('Page.enable');
await send('Runtime.enable');
await send('Profiler.enable');
await send('Profiler.setSamplingInterval', { interval: SAMPLING_INTERVAL_US });

const settle = (ms) => new Promise((r) => setTimeout(r, ms));
async function nav(url) {
  const p = new Promise((r) => { loadResolve = r; });
  await send('Page.navigate', { url });
  await p;
  await settle(900);
}
async function evaluate(expr) {
  const res = await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
  if (res.result?.exceptionDetails) return { error: res.result.exceptionDetails.exception?.description ?? res.result.exceptionDetails.text };
  return { value: res.result?.result?.value };
}

const url = `${BASE}/game/${ROUTE}/play/`;

// Land on origin, wipe, THEN reload -- a wipe from about:blank clears nothing (playbook: gap-probe header).
await nav(url);
await evaluate('localStorage.clear(); sessionStorage.clear(); return true;');
await nav(url);
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await settle(300);

const calib = await evaluate(`
  const c = document.createElement('canvas');
  return { webgl2: !!c.getContext('webgl2'), webgl: !!c.getContext('webgl'), title: document.title };
`);

const rectRes = await evaluate(`
  const el = document.querySelector(${JSON.stringify(TRIGGER)});
  if (!el) return null;
  el.scrollIntoView({ block: 'center' });
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2), found: true };
`);

if (!rectRes.value) {
  console.log(JSON.stringify({ route: ROUTE, error: 'trigger not found', calib: calib.value, rectRes }, null, 2));
  await send('Profiler.disable');
  await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${target.id}`);
  process.exit(1);
}
const { x, y } = rectRes.value;

await send('Profiler.start');
const tBefore = (await evaluate('return performance.now();')).value;

// Same dispatch method M2's real probe uses for the transition trigger: a mouse press/release, not a
// touch (scripts/play-exit-probe.mjs comment: the burst afterward is touch, the transition tap is mouse).
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });

await settle(WAIT_MS);
const tAfter = (await evaluate('return performance.now();')).value;
const profile = (await send('Profiler.stop')).result.profile;
await send('Profiler.disable');

const postCheck = await evaluate(`
  const app = window.__khengApp;
  const board = document.getElementById('croc-fallback-board');
  const g = window.game;
  return {
    khengPhase: app ? app.state.phase : null,
    khengRoundResetAt: window.__gapProbe ? window.__gapProbe.roundResetAt ?? 'no-probe-attached' : 'no-probe',
    boardChildCount: board ? board.children.length : null,
    screenHandoffVisible: (() => { const el = document.getElementById('screenHandoff'); return el ? !el.hidden && !el.classList.contains('hidden') : null; })(),
    gamePenalty: g ? g.penalty : 'no-game-global',
  };
`);

await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${target.id}`);

console.log(JSON.stringify({
  route: ROUTE,
  trigger: TRIGGER,
  calib: calib.value,
  clickPoint: { x, y },
  tBeforeMs: tBefore,
  tAfterMs: tAfter,
  postCheck: postCheck.value ?? postCheck.error,
  profile,
}));
