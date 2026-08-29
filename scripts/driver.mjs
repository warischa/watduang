// One-tab CDP driver — needed for two things scripts/cdp.mjs cannot do:
//   1. real Page.navigate to a DIFFERENT url in the SAME tab (sessionStorage is per-tab, per-origin)
//   2. capture Runtime.consoleAPICalled / Runtime.exceptionThrown (cdp.mjs drops non-id messages)
//
// Usage: node scripts/driver.mjs <script.mjs>
// <script.mjs> default-exports an async function(session) that gets:
//   session.nav(url)              -> Page.navigate + wait for load, returns nothing
//   session.setWidth(w,h)         -> Emulation.setDeviceMetricsOverride
//   session.evaluate(exprString)  -> Runtime.evaluate, returns {value, error}
//   session.wipe()                -> localStorage.clear(); sessionStorage.clear()
//   session.hold(x, y, ms)        -> touchstart, wait ms, touchend — for hold-to-charge controls that
//                                     tap() cannot express (it releases immediately)
//   session.tap(x, y)             -> real touchstart+touchend at a point (Input.dispatchTouchEvent) —
//                                     unlike .click()+elementFromPoint, this drives Chrome's real
//                                     touch-to-synthetic-click pipeline, so it proves navigation/guards
//                                     actually fire, not just that an element sits at that point (#39)
//   session.screenshot(path)
//   session.consoleErrors         -> array, appended live from Runtime.exceptionThrown + console.error
//   session.failRequests(urlPattern, { reason }) -> Fetch.enable scoped to urlPattern (CDP glob syntax,
//                                     e.g. '*_astro/timebomb.*.js'); every matching request from then on
//                                     is aborted with `reason` (default 'Failed') instead of reaching the
//                                     network — for driving a REAL rejected dynamic import(), not a fake one
//   session.failedRequests        -> array, appended live with every paused-then-failed request's url
//   session.close()
const [scriptPath] = process.argv.slice(2);
const { pathToFileURL } = await import('node:url');
const { writeFile } = await import('node:fs/promises');
const mod = await import(pathToFileURL(scriptPath).href);

const PORT = process.env.CDP_PORT || 9222;
const api = async (p, method = 'GET') =>
  (await fetch(`http://127.0.0.1:${PORT}${p}`, { method })).json();

const target = await api(`/json/new?about:blank`, 'PUT');
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const consoleErrors = [];
const failedRequests = [];
let failReason = 'Failed';

const send = (method, params = {}) =>
  new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });

let loadResolve = null;
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); return; }
  if (m.method === 'Page.loadEventFired' && loadResolve) { loadResolve(); loadResolve = null; }
  if (m.method === 'Runtime.exceptionThrown') {
    consoleErrors.push({ kind: 'exception', text: m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text });
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    consoleErrors.push({ kind: 'console.error', text: m.params.args?.map((a) => a.value ?? a.description).join(' ') });
  }
  // Fetch.enable was scoped to a urlPattern (session.failRequests), so every pause here is already a
  // match — abort it instead of letting the request through, and record it so a probe can tell whether
  // a retry re-hit the network or the browser served a cached rejection without pausing again at all.
  if (m.method === 'Fetch.requestPaused') {
    failedRequests.push({ url: m.params.request.url, at: Date.now() });
    send('Fetch.failRequest', { requestId: m.params.requestId, errorReason: failReason });
  }
});
await new Promise((r) => ws.addEventListener('open', r));

await send('Page.enable');
await send('Runtime.enable');

const settle = (ms = 900) => new Promise((r) => setTimeout(r, ms));

const session = {
  consoleErrors,
  failedRequests,
  async failRequests(urlPattern, { reason = 'Failed' } = {}) {
    failReason = reason;
    await send('Fetch.enable', { patterns: [{ urlPattern }] });
  },
  async nav(url) {
    const p = new Promise((r) => { loadResolve = r; });
    await send('Page.navigate', { url });
    await p;
    await settle();
  },
  async setWidth(width, height = 900) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
    await settle(300);
  },
  async wipe() {
    await this.evaluate('localStorage.clear(); sessionStorage.clear(); return true;');
  },
  async tap(x, y) {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await settle(400);
  },
  // A press-and-HOLD, which tap() cannot express: it releases immediately. cannon-flag's fire
  // control charges for as long as the finger is down, so tapping it measures the shortest possible
  // shot and never the mechanic. Same Input domain as tap(), so it drives the real touch pipeline.
  async hold(x, y, ms = 600) {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await new Promise((r) => setTimeout(r, ms));
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await settle(400);
  },
  async evaluate(body) {
    const res = await send('Runtime.evaluate', {
      expression: `(async () => { ${body} })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    const r = res?.result;
    if (r?.exceptionDetails) {
      return { error: r.exceptionDetails.exception?.description ?? r.exceptionDetails.text };
    }
    return { value: r?.result?.value ?? null };
  },
  async screenshot(path) {
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    await writeFile(path, Buffer.from(shot.result.data, 'base64'));
  },
  async close() {
    await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
    ws.close();
  },
};

let out;
try {
  out = await mod.default(session);
} catch (err) {
  await session.close().catch(() => {});
  console.error(`driver: probe threw: ${err?.stack ?? err}`);
  process.exit(1);
}
await session.close();

// A probe that forgets to `return` (or returns nothing on purpose) used to fall through to
// `console.log(JSON.stringify(undefined))`, which prints the literal string "undefined" and still
// exits 0 -- a probe with no findings read as a pass. Treat "no output" as a failure instead.
if (out === undefined || out === null) {
  console.error('driver: probe produced no output (default export returned undefined/null) -- treating as failure');
  process.exit(1);
}

console.log(JSON.stringify(out, null, 2));

// The two checks above catch a probe that THREW and a probe that returned nothing. Neither can see a
// probe that ran, failed internally, and reported it in its own output: adslot-wheel-delay-probe.mjs
// sets `anyRunErrored: true` when every one of its runs errored, and that whole sweep exited 0 --
// recorded in docs/verification/probe-triage-2026-08-26.md as the reason a false green was possible.
// The output is printed first on purpose, so a red run still shows which run errored.
if (out.anyRunErrored) {
  console.error('driver: probe reported anyRunErrored:true -- treating as failure');
  process.exit(1);
}

process.exit(0);
