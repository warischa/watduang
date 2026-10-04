// gh#253: CLS of one page under the gh#252 slow-4G profile, at a chosen viewport HEIGHT as well as width.
// gh#252's swap-probe.mjs fixes the height at 640 below 640px wide, where everything under #stage is below
// the fold before and after mount; a 390x844 phone has the how-to section inside its first screen, so the
// phone reserve is only judged at a real phone height. Same throttle (150 ms, 1.6 Mbit/s down, every
// request), same cache-disabled fresh tab, same buffered layout-shift recorder installed before the page's
// own script, same 6 s settle.
//   CDP_PORT=9361 BASE=http://localhost:4361 W=390 H=844 PAGE=/game/siamsi/ node <this file>
const PORT = process.env.CDP_PORT || 9361;
const BASE = process.env.BASE || 'http://localhost:4361';
const W = Number(process.env.W || 390);
const H = Number(process.env.H || 844);
const PAGE = process.env.PAGE || '/game/siamsi/';

const api = async (p, method = 'GET') => (await fetch(`http://127.0.0.1:${PORT}${p}`, { method })).json();
const target = await api('/json/new?about:blank', 'PUT');
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
let loadResolve = null;
const send = (method, params = {}) => new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) pending.get(m.id)(m);
  if (m.method === 'Page.loadEventFired' && loadResolve) { loadResolve(); loadResolve = null; }
});
await new Promise((r) => ws.addEventListener('open', r));
await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 640 });
await send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 93750 });
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__shifts = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__shifts.push({ v: +e.value.toFixed(5), t: Math.round(e.startTime), input: e.hadRecentInput }); }).observe({ type: 'layout-shift', buffered: true });
` });
const loaded = new Promise((r) => { loadResolve = r; });
await send('Page.navigate', { url: `${BASE}${PAGE}` });
await loaded;
await new Promise((r) => setTimeout(r, 6000));
const r = await send('Runtime.evaluate', { returnByValue: true, expression: `({ shifts: window.__shifts, state: document.getElementById('stage').dataset.stage ?? null, howY: Math.round(document.getElementById('how-to-play').getBoundingClientRect().top + scrollY), innerWidth, innerHeight })` });
await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
ws.close();
const v = r.result?.result?.value ?? {};
const cls = +((v.shifts ?? []).filter((s) => !s.input).reduce((x, s) => x + s.v, 0)).toFixed(5);
console.log(JSON.stringify({ page: PAGE, width: W, height: H, throttle: 'slow-4G', cls, ...v }));
process.exit(0);
