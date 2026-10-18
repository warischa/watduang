// gh#276 phase 1: one P1 run (legacy settings list seeded, empty roster) on croc-bite, optionally under a
// CDP performance trace started on the BROWSER target, so every process (renderer, browser, GPU) lands in it.
// Attaches to an already running Chrome (run.sh launches it). env:
//   BASE=http://localhost:4421 CDP_PORT=9421 MODE=plain|trace RAW=<raw trace path> OUT=<diag json>
//   QUERY=1 (navigator.locks.query() snapshot at request and at grant)  HEAVY=1 (harness instruments)  W=1440 H=900 CAP_MS=60000 ROUTE=croc-bite
// The seed, viewport and the pressable predicate are the gh#272 latency harness's (P1), so a plain run here is
// that harness's P1 with the lock window also written into the trace as user-timing marks.
import { createWriteStream, writeFileSync } from 'node:fs';
const BASE = process.env.BASE || 'http://localhost:4421';
const PORT = process.env.CDP_PORT || '9421';
const MODE = process.env.MODE || 'plain';
const RAW = process.env.RAW || '';
const OUT = process.env.OUT || 'diag.json';
const QUERY = process.env.QUERY === '1';
const HEAVY = process.env.HEAVY === '1'; // also install the harness's rAF loop + MessageChannel heartbeat
const W = Number(process.env.W || 1440), H = Number(process.env.H || 900);
const CAP = Number(process.env.CAP_MS || 60000);
const ROUTE = process.env.ROUTE || 'croc-bite';
const url = `${BASE}/game/${ROUTE}/play/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = async (p, method = 'GET') => (await fetch(`http://127.0.0.1:${PORT}${p}`, { method })).json();

const LEGACY_KEY = 'ZERO_TRIGGER_DATA_V1';
const NAMES = ['Ann', 'Bob', 'Cat', 'Dan'];
const LEGACY = JSON.stringify({ players: NAMES.map((name, i) => ({ id: i + 1, name, avatar: 'x', score: 0 })), penaltyMode: 'drink' });

const INSTR = `(() => {
  const T = window.__diag = { ev: [], lt: [] };
  const now = () => performance.now();
  const add = (k, x) => T.ev.push({ k, t: now(), ...(x || {}) });
  const mark = (n) => { try { performance.mark('gh276:' + n); } catch (e) {} };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) T.lt.push({ s: e.startTime, d: e.duration }); }).observe({ type: 'longtask', buffered: true }); } catch (e) { add('lt-unsupported'); }
  const snap = (tag) => { if (!${QUERY}) return; const t0 = now(); navigator.locks.query().then((s) => add('query-' + tag, { askedT: t0, held: s.held.map((h) => h.name + '/' + h.mode), pending: s.pending.map((p) => p.name + '/' + p.mode) })); };
  if (navigator.locks) {
    const orig = navigator.locks.request.bind(navigator.locks);
    navigator.locks.request = function (name, a, b) {
      const fn = typeof a === 'function' ? a : b; const id = T.ev.length;
      mark('lock-req'); add('lock-req', { name, id }); snap('at-req');
      const wrapped = (lock) => { mark('lock-grant'); add('lock-grant', { name, id }); snap('at-grant'); return fn(lock); };
      return typeof a === 'function' ? orig(name, wrapped) : orig(name, a, wrapped);
    };
  } else add('no-locks');
  const pressable = () => { const s = document.querySelector('[data-ps="start"]'); return !!s && !s.disabled && s.getClientRects().length > 0 && !s.closest('[hidden]'); };
  let openSeen = false;
  const check = () => {
    if (document.documentElement.getAttribute('data-player-screen') === 'open') openSeen = true;
    if (T.pressT == null && openSeen && pressable()) { T.pressT = now(); mark('pressable'); }
  };
  new MutationObserver(check).observe(document, { attributes: true, subtree: true, childList: true, attributeFilter: ['disabled', 'hidden', 'data-player-screen', 'data-player-screen-pending'] });
  document.addEventListener('DOMContentLoaded', () => { add('dcl'); check(); });
  window.addEventListener('load', () => add('load'));
  if (${HEAVY}) { // the gh#272 harness's two always-on instruments, copied as they are there
    let last = 0; T.raf = 0; T.rafGaps = []; T.hb = [];
    const f = (ts) => { T.raf++; if (last && ts - last > 100) T.rafGaps.push({ t: last, gap: ts - last }); last = ts; requestAnimationFrame(f); };
    requestAnimationFrame(f);
    const mc = new MessageChannel(); let hbLast = now();
    mc.port1.onmessage = () => { const n = now(); if (n - hbLast > 50) T.hb.push({ t: hbLast, gap: n - hbLast }); hbLast = n; setTimeout(() => mc.port2.postMessage(0), 0); };
    mc.port2.postMessage(0);
  }
  const oc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...r) { const c = oc.call(this, type, ...r); if (/webgl/.test(type)) add('getContext', { type, ok: !!c }); return c; };
})();`;

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0; const pend = new Map(); const listeners = [];
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } else if (m.method) for (const l of listeners) l(m); });
  const opened = new Promise((r) => ws.addEventListener('open', r));
  const send = (method, params = {}) => new Promise((res) => { pend.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
  return { ws, opened, send, on: (f) => listeners.push(f) };
}

// The DevTools performance panel's set, plus toplevel/mojom/ipc so a cross-process wait is visible.
const CATEGORIES = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8.execute', 'v8', 'blink.user_timing',
  'disabled-by-default-v8.cpu_profiler', 'disabled-by-default-v8.gc', 'loading', 'toplevel', 'toplevel.flow', 'mojom', 'ipc', '__metadata'];

const ver = await api('/json/version');
const target = await api('/json/new?about:blank', 'PUT');
const page = connect(target.webSocketDebuggerUrl); await page.opened;
const ev = async (expr) => (await page.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
let loadRes = null; page.on((m) => { if (m.method === 'Page.loadEventFired' && loadRes) { loadRes(); loadRes = null; } });
const nav = async (u, cap) => { const p = new Promise((r) => { loadRes = r; }); await page.send('Page.navigate', { url: u }); await Promise.race([p, sleep(cap)]); };
await page.send('Page.enable'); await page.send('Runtime.enable');
await page.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true });
await nav(`${BASE}/`, 20000);
await ev(`(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('${LEGACY_KEY}', ${JSON.stringify(LEGACY)}); return true; })()`);
const pre = await ev(`({ roster: localStorage.getItem('watduang:roster'), legacy: localStorage.getItem('${LEGACY_KEY}') !== null })`);
await page.send('Page.addScriptToEvaluateOnNewDocument', { source: INSTR });

let browser = null, traceDone = null;
if (MODE === 'trace') {
  browser = connect(ver.webSocketDebuggerUrl); await browser.opened;
  traceDone = new Promise((r) => browser.on((m) => { if (m.method === 'Tracing.tracingComplete') r(m.params); }));
  const st = await browser.send('Tracing.start', { transferMode: 'ReturnAsStream', streamFormat: 'json', traceConfig: { recordMode: 'recordAsMuchAsPossible', includedCategories: CATEGORIES } });
  if (st.error) { console.error('Tracing.start failed', JSON.stringify(st.error)); process.exit(3); }
  await sleep(500);
}
const tNav = Date.now();
await nav(url, 2000); // never wait for load: the in-page observer owns the clock
const t0 = Date.now(); let reached = false;
while (Date.now() - t0 < CAP) {
  const v = await ev(`(() => { const T = window.__diag; return !!T && T.pressT != null && T.ev.some((e) => e.k === 'lock-grant'); })()`);
  if (v) { reached = true; break; }
  await sleep(100);
}
await sleep(QUERY ? 1500 : 300); // let the at-grant query resolve
const d = await ev(`(() => { const T = window.__diag; if (!T) return null; return { ev: T.ev, lt: T.lt, pressT: T.pressT ?? null, now: performance.now(), timeOrigin: performance.timeOrigin, iw: innerWidth, roster: localStorage.getItem('watduang:roster') }; })()`);
let rawBytes = 0;
if (MODE === 'trace') {
  await browser.send('Tracing.end');
  const { stream } = await traceDone;
  const out = createWriteStream(RAW);
  for (;;) {
    const r = (await browser.send('IO.read', { handle: stream, size: 4 << 20 })).result;
    const chunk = r.base64Encoded ? Buffer.from(r.data, 'base64') : Buffer.from(r.data, 'utf8');
    rawBytes += chunk.length; out.write(chunk);
    if (r.eof) break;
  }
  await new Promise((r) => out.end(r));
  await browser.send('IO.close', { handle: stream });
  browser.ws.close();
}
try { await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`); page.ws.close(); } catch {}
const req = d?.ev.find((e) => e.k === 'lock-req'), grant = d?.ev.find((e) => e.k === 'lock-grant');
const imported = (() => { try { return JSON.stringify(JSON.parse(d.roster)) === JSON.stringify(NAMES); } catch { return false; } })();
const row = { mode: MODE, browser: ver.Browser, when: new Date(tNav).toISOString(), url, viewport: `${W}x${H}`, seedPrecondition: pre, reached, migrationLanded: imported, iw: d?.iw,
  lockReqMs: req ? Math.round(req.t) : null, lockGrantMs: grant ? Math.round(grant.t) : null, lockWaitMs: req && grant ? Math.round(grant.t - req.t) : null,
  pressableMs: d?.pressT == null ? null : Math.round(d.pressT), rawTraceBytes: rawBytes, categories: MODE === 'trace' ? CATEGORIES : null, diag: d };
row.void = !d ? 'no instrumentation' : d.iw !== W ? `innerWidth ${d.iw}` : pre.roster !== null || !pre.legacy ? 'seed precondition failed' : !reached ? 'grant/pressable not reached' : !imported ? 'migration did not land' : null;
writeFileSync(OUT, JSON.stringify(row, null, 1));
console.log(JSON.stringify({ mode: MODE, void: row.void, lockReqMs: row.lockReqMs, lockGrantMs: row.lockGrantMs, lockWaitMs: row.lockWaitMs, pressableMs: row.pressableMs, rawTraceBytes: rawBytes }));
