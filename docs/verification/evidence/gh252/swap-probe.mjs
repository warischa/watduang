// gh#252 swap probe: what the fallback -> Mitr swap does to layout, and (gh#120) whether it moves the
// ad slot on the two tool pages whose comments reason about a font-driven reflow.
//
// Why a second instrument beside ui-audit-probe.mjs: on localhost a woff2 arrives before first paint,
// so the swap never shows as a shift and an audit CLS of 0 proves nothing about a visitor on a real
// network. This probe holds every Mitr request for DELAY ms (CDP Fetch domain), so the page paints in
// the fallback first and the swap lands late -- the case a real visitor gets. FONTS=block aborts the
// requests instead, which is the page as it rendered before Mitr was hosted (the control).
//
//   CDP_PORT=9351 BASE=http://localhost:4351 W=320 FONTS=delay DELAY=1500 PAGE=/tool/wheel/ \
//     INTERACT=wheel node <this file>
//   FONTS = normal | delay | block      INTERACT = none | wheel | number
//
// Reads, per run, from the page itself: layout-shift entries (value, time, hadRecentInput), the
// ad slot's document-y at the first animation frame, after load+settle, and after the interaction,
// and which Mitr faces document.fonts reports loaded. Nothing is inferred from the stylesheet.
const PORT = process.env.CDP_PORT || 9351;
const BASE = process.env.BASE || 'http://localhost:4351';
const W = Number(process.env.W || 320);
const FONTS = process.env.FONTS || 'normal';
const DELAY = Number(process.env.DELAY || 1500);
const PAGE = process.env.PAGE || '/';
const INTERACT = process.env.INTERACT || 'none';
const THROTTLE = process.env.THROTTLE === '1';

const api = async (p, method = 'GET') => (await fetch(`http://127.0.0.1:${PORT}${p}`, { method })).json();
const target = await api('/json/new?about:blank', 'PUT');
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
let loadResolve = null;
const held = [];
const send = (method, params = {}) => new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) pending.get(m.id)(m);
  if (m.method === 'Page.loadEventFired' && loadResolve) { loadResolve(); loadResolve = null; }
  if (m.method === 'Fetch.requestPaused') {
    const { requestId, request } = m.params;
    held.push(request.url.replace(BASE, ''));
    if (FONTS === 'block') send('Fetch.failRequest', { requestId, errorReason: 'Failed' });
    else setTimeout(() => send('Fetch.continueRequest', { requestId }), DELAY);
  }
});
await new Promise((r) => ws.addEventListener('open', r));
await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: W, height: W < 640 ? 640 : 900, deviceScaleFactor: 1, mobile: W < 640 });
// THROTTLE=1: the Lighthouse slow-4G profile (150 ms latency, 1.6 Mbit/s down) on EVERY request, so the
// document, the stylesheet and the fonts race each other the way they do on a phone. This is the
// condition a preload is judged under; the DELAY mode cannot judge one, because it delays the font
// request by a fixed time wherever it starts.
if (THROTTLE) await send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 93750 });
if (FONTS !== 'normal') await send('Fetch.enable', { patterns: [{ urlPattern: '*mitr-*' }] });

// In every document, before the page's own script: record shifts and the slot's y at first frame.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__shifts = []; window.__firstSlotY = null;
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__shifts.push({ v: +e.value.toFixed(5), t: Math.round(e.startTime), input: e.hadRecentInput }); }).observe({ type: 'layout-shift', buffered: true });
  const slotY = () => { const s = document.querySelector('.ad-slot'); return s ? Math.round(s.getBoundingClientRect().top + scrollY) : null; };
  window.__slotY = slotY;
  const tick = () => { if (window.__firstSlotY === null) { const y = slotY(); if (y !== null) window.__firstSlotY = y; } if (window.__firstSlotY === null) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
` });

const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression: `(async () => { ${expression} })()`, awaitPromise: true, returnByValue: true });
  return r.result?.result?.value ?? { error: r.result?.exceptionDetails?.text ?? JSON.stringify(r.error ?? r.result).slice(0, 200) };
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const loaded = new Promise((r) => { loadResolve = r; });
await send('Page.navigate', { url: `${BASE}${PAGE}` });
await loaded;
await wait(THROTTLE ? 6000 : DELAY + 1500);

const mitrFaces = `[...document.fonts].filter(f => f.family.replace(/['"]/g, '') === 'Mitr').map(f => f.weight + ':' + f.status)`;
const settled = await ev(`return { slotY: window.__slotY(), shifts: window.__shifts, firstSlotY: window.__firstSlotY, faces: ${mitrFaces}, innerWidth };`);

let after = null;
if (INTERACT === 'wheel') {
  await ev(`const t = document.getElementById('name-input'); t.value = 'สมชาย\\nสมหญิง\\nวิชัยนามสกุลยาวมากมายเหลือเกินคนนี้\\nมานี'; t.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('name-start').click(); return true;`);
  await wait(500);
  const mid = await ev(`return window.__slotY();`);
  await ev(`document.getElementById('wheel-spin').click(); return true;`);
  await wait(3500);
  after = await ev(`return { slotYNames: ${mid}, slotYResult: window.__slotY(), result: document.getElementById('wheel-result').textContent, resultH: document.getElementById('wheel-result').getBoundingClientRect().height, faces: ${mitrFaces} };`);
}
if (INTERACT === 'number') {
  await ev(`const set = (i, v) => { const e = document.getElementById(i); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }; set('number-min', '1'); set('number-max', '1000'); return true;`);
  await wait(300);
  await ev(`document.getElementById('number-go').click(); return true;`);
  await wait(500);
  after = await ev(`return { slotYResult: window.__slotY(), result: document.getElementById('number-result').textContent, note: document.getElementById('number-note').textContent.slice(0, 60), goDisabled: document.getElementById('number-go').disabled, min: document.getElementById('number-min').value, max: document.getElementById('number-max').value, faces: ${mitrFaces} };`);
}

await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
ws.close();
const sum = (a) => +a.filter((s) => !s.input).reduce((x, s) => x + s.v, 0).toFixed(5);
console.log(JSON.stringify({
  page: PAGE, width: W, fonts: FONTS, throttle: THROTTLE, delay: FONTS === 'delay' ? DELAY : 0, interact: INTERACT,
  mitrRequests: held, innerWidth: settled.innerWidth, mitrFacesLoaded: settled.faces,
  cls: sum(settled.shifts ?? []), shifts: settled.shifts, slotYFirstFrame: settled.firstSlotY, slotYSettled: settled.slotY, after,
}, null, 2));
process.exit(0);
