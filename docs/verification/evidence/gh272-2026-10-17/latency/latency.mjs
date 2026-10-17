// gh#272 lock-bound latency harness (P1 migration open, P2 roster save, C frame-block control).
// Attaches to an ALREADY RUNNING Chrome (run.sh launches it). env:
//   BASE=http://localhost:4411  CDP_PORT=9411  COND=standin|reference  N=3  OUT=<json>  ROUTE=croc-bite
//   W=1440 H=900  CAP_MS=60000  SCEN=P1,P2,C
import { writeFileSync } from 'node:fs';
const BASE = process.env.BASE || 'http://localhost:4411';
const PORT = process.env.CDP_PORT || '9411';
const COND = process.env.COND || 'unlabelled';
const N = Number(process.env.N || 3);
const W = Number(process.env.W || 1440), H = Number(process.env.H || 900);
const CAP = Number(process.env.CAP_MS || 60000);
const ROUTE = process.env.ROUTE || 'croc-bite';
const SCEN = (process.env.SCEN || 'P1,P2,C').split(',');
const OUT = process.env.OUT || `latency-${COND}.json`;
const url = `${BASE}/game/${ROUTE}/play/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = async (p, method = 'GET') => (await fetch(`http://127.0.0.1:${PORT}${p}`, { method })).json();

// Legacy seed: zero-trigger's settings blob (keep:'settings'), typed names, so migrateSettingsPlayers imports it.
const LEGACY_KEY = 'ZERO_TRIGGER_DATA_V1';
const NAMES = ['Ann', 'Bob', 'Cat', 'Dan'];
const LEGACY = JSON.stringify({ players: NAMES.map((name, i) => ({ id: i + 1, name, avatar: 'x', score: 0 })), penaltyMode: 'drink' });
const ROSTER = JSON.stringify(NAMES);

const INSTR = `(() => {
  const T = window.__diag = { ev: [], lt: [], raf: 0, rafGaps: [], hb: [], cb: [], st: [] };
  const now = () => performance.now();
  const add = (k, x) => T.ev.push({ k, t: now(), ...(x || {}) });
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) T.lt.push({ s: e.startTime, d: e.duration }); }).observe({ type: 'longtask', buffered: true }); } catch (e) { add('lt-unsupported'); }
  if (navigator.locks) {
    const orig = navigator.locks.request.bind(navigator.locks);
    navigator.locks.request = function (name, a, b) {
      const fn = typeof a === 'function' ? a : b; const id = T.ev.length;
      add('lock-req', { name, id });
      const wrapped = (lock) => { add('lock-grant', { name, id }); return fn(lock); };
      return typeof a === 'function' ? orig(name, wrapped) : orig(name, a, wrapped);
    };
  } else add('no-locks');
  const si = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) { const r = si.call(this, k, v); if (k === 'watduang:roster') T.st.push({ t: now(), v: String(v) }); return r; };
  const pressable = () => { const s = document.querySelector('[data-ps="start"]'); return !!s && !s.disabled && s.getClientRects().length > 0 && !s.closest('[hidden]'); };
  const attr = () => document.documentElement.getAttribute('data-player-screen');
  const pend = () => document.documentElement.getAttribute('data-player-screen-pending');
  let lastP = null, lastA = null, lastPend = 'init', openSeen = false, pressSeen = false;
  const check = () => {
    const a = attr(), pd = pend();
    if (pd !== lastPend) { lastPend = pd; add('pending', { v: pd }); }
    if (a !== lastA) { lastA = a; add('screen', { v: a }); if (a === 'open') openSeen = true; }
    const p = pressable();
    if (p !== lastP) { lastP = p; add('pressable', { v: p, screen: a }); if (p && openSeen && !pressSeen) { pressSeen = true; T.pressT = now(); requestAnimationFrame((ts) => { T.pressFrameT = now(); }); } }
  };
  new MutationObserver(check).observe(document, { attributes: true, subtree: true, childList: true, attributeFilter: ['disabled', 'hidden', 'data-player-screen', 'data-player-screen-pending'] });
  document.addEventListener('DOMContentLoaded', () => { add('dcl'); check(); });
  let last = 0;
  const f = (ts) => { T.raf++; if (last && ts - last > 100) T.rafGaps.push({ t: last, gap: ts - last }); last = ts; requestAnimationFrame(f); };
  requestAnimationFrame(f);
  const mc = new MessageChannel(); let hbLast = now();
  mc.port1.onmessage = () => { const n = now(); if (n - hbLast > 50) T.hb.push({ t: hbLast, gap: n - hbLast }); hbLast = n; setTimeout(() => mc.port2.postMessage(0), 0); };
  mc.port2.postMessage(0);
  const oc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...r) { const c = oc.call(this, type, ...r); if (/webgl/.test(type)) add('getContext', { type, ok: !!c }); return c; };
})();`;

async function session() {
  const target = await api('/json/new?about:blank', 'PUT');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0; const pend = new Map(); let loadRes = null;
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } if (m.method === 'Page.loadEventFired' && loadRes) { loadRes(); loadRes = null; } });
  await new Promise((r) => ws.addEventListener('open', r));
  const send = (method, params = {}) => new Promise((res) => { pend.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
  const nav = async (u, cap = CAP) => { const p = new Promise((r) => { loadRes = r; }); await send('Page.navigate', { url: u }); await Promise.race([p, sleep(cap)]); };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true });
  const close = async () => { try { await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`); ws.close(); } catch {} await sleep(500); };
  return { send, ev, nav, close };
}

// seed on a cheap same-origin page (the home page: no WebGL, no roster lock), then install INSTR, then open the route.
async function seeded(seed) {
  const s = await session();
  await s.nav(`${BASE}/`, 20000);
  const ok = await s.ev(`(() => { localStorage.clear(); sessionStorage.clear(); ${seed} return true; })()`);
  if (!ok) { await s.close(); return { s, void: 'seed script did not run' }; }
  await s.send('Page.addScriptToEvaluateOnNewDocument', { source: INSTR });
  return { s };
}

const collect = (s) => s.ev(`(() => { const T = window.__diag; if (!T) return null; const glProbe = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })(); return { glProbe, ev: T.ev, lt: T.lt, raf: T.raf, rafGaps: T.rafGaps, hb: T.hb, st: T.st, pressT: T.pressT ?? null, pressFrameT: T.pressFrameT ?? null, now: performance.now(), iw: innerWidth, ih: innerHeight, store: { roster: localStorage.getItem('watduang:roster'), legacy: localStorage.getItem('${LEGACY_KEY}'), retired: localStorage.getItem('watduang:roster-retired-settings'), group: localStorage.getItem('watduang:group') } }; })()`);

const lockStats = (ev) => {
  const reqs = ev.filter((e) => e.k === 'lock-req'), grants = ev.filter((e) => e.k === 'lock-grant');
  return reqs.map((r) => { const g = grants.find((x) => x.id === r.id); return { name: r.name, reqT: Math.round(r.t), grantT: g ? Math.round(g.t) : null, waitMs: g ? Math.round(g.t - r.t) : null }; });
};
const frameStats = (d, from = 0, to = Infinity) => {
  const lt = d.lt.filter((l) => l.s + l.d > from && l.s < to);
  return { longtasks: lt.length, longtaskMaxMs: Math.round(Math.max(0, ...lt.map((l) => l.d))), longtaskSumMs: Math.round(lt.reduce((n, l) => n + l.d, 0)), rafGapsOver100: d.rafGaps.filter((g) => g.t >= from && g.t < to).length, rafGapMaxMs: Math.round(Math.max(0, ...d.rafGaps.filter((g) => g.t >= from && g.t < to).map((g) => g.gap))), hbGapMaxMs: Math.round(Math.max(0, ...d.hb.filter((g) => g.t >= from && g.t < to).map((g) => g.gap))), rafFramesTotal: d.raf };
};
// live = a page context request succeeded OR (builds that defer the 3D boot make none before handover) a fresh probe context can be created in-page; scenario H separately proves the deferred boot lands.
const glOk = (d) => { const g = d.ev.filter((e) => e.k === 'getContext'); return { calls: g.length, live: g.some((x) => x.ok) || d.glProbe === true, probe: d.glProbe }; };
const t = (e) => (e ? Math.round(e.t) : null);
const firstEv = (d, k, f = () => true) => d.ev.find((e) => e.k === k && f(e));

async function waitFor(s, cond, cap) {
  const t0 = Date.now();
  while (Date.now() - t0 < cap) { if (await s.ev(cond)) return true; await sleep(50); }
  return false;
}

async function runP1(i) {
  const { s, void: v } = await seeded(`localStorage.setItem('${LEGACY_KEY}', ${JSON.stringify(LEGACY)});`);
  if (v) return { path: 'P1', run: i, void: v };
  const pre = await s.ev(`({ roster: localStorage.getItem('watduang:roster'), legacy: localStorage.getItem('${LEGACY_KEY}') !== null })`);
  if (pre.roster !== null || !pre.legacy) { await s.close(); return { path: 'P1', run: i, void: `seed precondition failed: ${JSON.stringify(pre)}` }; }
  await s.nav(url, 2000); // do not wait for load: a stalled main thread must not delay the clock; the in-page observer owns the timing
  const reached = await waitFor(s, `window.__diag?.pressT != null && window.__diag.pressFrameT != null`, CAP);
  await sleep(300);
  const d = await collect(s);
  await s.close();
  if (!d) return { path: 'P1', run: i, void: 'no instrumentation in page' };
  if (d.iw !== W) return { path: 'P1', run: i, void: `innerWidth ${d.iw} != ${W}` };
  const imported = (() => { try { return JSON.stringify(JSON.parse(d.store.roster)) === JSON.stringify(NAMES); } catch { return false; } })();
  const pSet = firstEv(d, 'pending', (e) => e.v !== null), pClr = d.ev.find((e) => e.k === 'pending' && e.v === null && (!pSet || e.t > pSet.t));
  const locks = lockStats(d.ev);
  const row = { path: 'P1', run: i, reached, openAtMs: t(firstEv(d, 'screen', (e) => e.v === 'open')), pressableMs: d.pressT == null ? null : Math.round(d.pressT), pressableFrameMs: d.pressFrameT == null ? null : Math.round(d.pressFrameT), pendingSetMs: t(pSet), pendingClearMs: t(pClr), pendingWindowMs: pSet && pClr ? Math.round(pClr.t - pSet.t) : null, locks, lockWaitMaxMs: Math.max(0, ...locks.map((l) => l.waitMs ?? 0)), migrationLanded: imported, legacyPlayersStripped: (() => { try { return !('players' in JSON.parse(d.store.legacy)); } catch { return false; } })(), gl: glOk(d), frames: frameStats(d), iw: d.iw };
  if (!reached) row.void = `start never pressable within ${CAP} ms`;
  else if (!imported) row.void = 'migration did not land (roster != seeded names)';
  else if (!row.gl.live) row.void = 'no live WebGL context seen';
  return row;
}

async function runP2(i) {
  const { s, void: v } = await seeded(`localStorage.setItem('watduang:roster', ${JSON.stringify(ROSTER)}); localStorage.setItem('watduang:group', ${JSON.stringify(ROSTER)});`);
  if (v) return { path: 'P2', run: i, void: v };
  await s.nav(url, 2000);
  const reached = await waitFor(s, `window.__diag?.pressT != null`, CAP);
  if (!reached) { const d = await collect(s); await s.close(); return { path: 'P2', run: i, void: `screen never pressable within ${CAP} ms before the edit`, frames: d && frameStats(d) }; }
  await sleep(700); // past ARM_DELAY_MS, screen settled
  const edit = await s.ev(`(() => { const f = document.querySelector('[data-ps="list"] .ps-n'); if (!f) return 'no .ps-n field'; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(f, 'Renamed'); f.dispatchEvent(new Event('input', { bubbles: true })); return 'ok'; })()`);
  if (edit !== 'ok') { await s.close(); return { path: 'P2', run: i, void: `edit failed: ${edit}` }; }
  const ready = await waitFor(s, `(() => { const b = document.querySelector('[data-ps="start"]'); return !!b && !b.disabled; })()`, 10000);
  if (!ready) { await s.close(); return { path: 'P2', run: i, void: 'start not enabled after the edit' }; }
  const tClick = await s.ev(`(() => { const T = window.__diag; T.tClick = performance.now(); document.querySelector('[data-ps="start"]').click(); return T.tClick; })()`);
  const settled = await waitFor(s, `window.__diag.st.some((x) => x.v.includes('Renamed')) && document.documentElement.getAttribute('data-player-screen') === 'closed'`, CAP);
  await sleep(300);
  const d = await collect(s);
  await s.close();
  if (!d) return { path: 'P2', run: i, void: 'no instrumentation' };
  if (d.iw !== W) return { path: 'P2', run: i, void: `innerWidth ${d.iw} != ${W}` };
  const commit = d.st.find((x) => x.v.includes('Renamed'));
  const closed = d.ev.find((e) => e.k === 'screen' && e.v === 'closed' && e.t >= tClick);
  const durable = (() => { try { return JSON.parse(d.store.roster).includes('Renamed'); } catch { return false; } })();
  const locks = lockStats(d.ev).filter((l) => l.reqT >= tClick - 5);
  const row = { path: 'P2', run: i, openPressableMs: Math.round(d.pressT), clickAtMs: Math.round(tClick), commitMs: commit ? Math.round(commit.t - tClick) : null, settleClosedMs: closed ? Math.round(closed.t - tClick) : null, durableReadBack: durable, locks, lockWaitMaxMs: Math.max(0, ...locks.map((l) => l.waitMs ?? 0)), gl: glOk(d), frames: frameStats(d, tClick), iw: d.iw };
  if (!settled || !durable || commit == null) row.void = `write not durable/settled within ${CAP} ms (settled=${settled} durable=${durable})`;
  else if (!row.gl.live) row.void = 'no live WebGL context seen';
  return row;
}

// Control C: does the condition block frames? croc-bite loaded with an empty store, observed 8 s after load.
async function runC(i) {
  const { s, void: v } = await seeded('');
  if (v) return { path: 'C', run: i, void: v };
  await s.nav(url, 2000);
  await sleep(12000);
  const d = await collect(s);
  await s.close();
  if (!d) return { path: 'C', run: i, void: 'no instrumentation' };
  const fps = d.raf / (d.now / 1000);
  return { path: 'C', run: i, observedMs: Math.round(d.now), rafFrames: d.raf, framesPerSec: +fps.toFixed(2), ...frameStats(d), gl: glOk(d), firstGetContextMs: t(firstEv(d, 'getContext')) };
}

// Scenario H (fix build only): press start on the player screen -> first 3D frame. Needs window.__khengApp.render3D.
async function runH(i) {
  const { s, void: v } = await seeded(`localStorage.setItem('watduang:roster', ${JSON.stringify(ROSTER)}); localStorage.setItem('watduang:group', ${JSON.stringify(ROSTER)});`);
  if (v) return { path: 'H', run: i, void: v };
  await s.nav(url, 2000);
  const reached = await waitFor(s, `window.__diag?.pressT != null`, CAP);
  if (!reached) { await s.close(); return { path: 'H', run: i, void: `screen never pressable within ${CAP} ms` }; }
  await sleep(700);
  const has = await s.ev(`window.__khengApp ? String(window.__khengApp.render3D) : 'no-app'`);
  if (has === 'no-app' || has === 'undefined') { await s.close(); return { path: 'H', run: i, void: `no render3D state on this build (${has})` }; }
  const pre = { render3D: has, ctxBeforeClick: await s.ev(`window.__diag.ev.filter((e) => e.k === 'getContext').length`) };
  const ok = await waitFor(s, `(() => { const b = document.querySelector('[data-ps="start"]'); return !!b && !b.disabled; })()`, 10000);
  if (!ok) { await s.close(); return { path: 'H', run: i, void: 'start not enabled' }; }
  const tClick = await s.ev(`(() => { const T = window.__diag; T.tClick = performance.now(); T.liveT = null; T.frameT = null; const iv = setInterval(() => { const a = window.__khengApp; if (a && a.render3D === 'live' && T.liveT == null) { T.liveT = performance.now(); requestAnimationFrame(() => { T.frameT = performance.now(); }); clearInterval(iv); } else if (a && a.render3D === 'off') { T.liveT = -1; clearInterval(iv); } }, 5); document.querySelector('[data-ps="start"]').click(); return T.tClick; })()`);
  const done = await waitFor(s, `window.__diag.liveT != null && (window.__diag.liveT < 0 || window.__diag.frameT != null)`, CAP);
  await sleep(500);
  const d = await collect(s);
  const dd = await s.ev(`({ liveT: window.__diag.liveT, frameT: window.__diag.frameT, render3D: window.__khengApp.render3D })`);
  await s.close();
  const gc = d.ev.filter((e) => e.k === 'getContext' && e.t >= tClick);
  const row = { path: 'H', run: i, pre, clickAtMs: Math.round(tClick), getContextAfterClickMs: gc[0] ? Math.round(gc[0].t - tClick) : null, liveMs: dd.liveT > 0 ? Math.round(dd.liveT - tClick) : null, firstFrameMs: dd.frameT ? Math.round(dd.frameT - tClick) : null, finalRender3D: dd.render3D, gl: glOk(d), frames: frameStats(d, tClick), iw: d.iw };
  if (!done || row.firstFrameMs == null) row.void = `no 3D frame within ${CAP} ms after start (render3D=${dd.render3D})`;
  else if (pre.ctxBeforeClick > 0) row.void = 'a WebGL context existed before handover (boot not deferred)';
  return row;
}

const med = (a) => { const x = a.filter((n) => typeof n === 'number').sort((p, q) => p - q); return x.length ? (x.length % 2 ? x[(x.length - 1) / 2] : (x[x.length / 2 - 1] + x[x.length / 2]) / 2) : null; };
const mx = (a) => { const x = a.filter((n) => typeof n === 'number'); return x.length ? Math.max(...x) : null; };

const runs = [];
const fns = { P1: runP1, P2: runP2, C: runC, H: runH };
for (const sc of SCEN) for (let i = 1; i <= N; i++) { const r = await fns[sc](i); runs.push(r); console.error(`${COND} ${sc}#${i}: ${r.void ? 'VOID ' + r.void : 'ok'} ${JSON.stringify({ p: r.pressableMs, c: r.commitMs, lw: r.lockWaitMax ?? r.lockWaitMaxMs, fps: r.framesPerSec })}`); }
const ok = (p) => runs.filter((r) => r.path === p && !r.void);
const summary = {
  P1: { n: ok('P1').length, voids: runs.filter((r) => r.path === 'P1' && r.void).length, pressableMs: { each: ok('P1').map((r) => r.pressableMs), median: med(ok('P1').map((r) => r.pressableMs)), max: mx(ok('P1').map((r) => r.pressableMs)) }, pressableFrameMs: { each: ok('P1').map((r) => r.pressableFrameMs), median: med(ok('P1').map((r) => r.pressableFrameMs)), max: mx(ok('P1').map((r) => r.pressableFrameMs)) }, pendingWindowMs: { each: ok('P1').map((r) => r.pendingWindowMs), median: med(ok('P1').map((r) => r.pendingWindowMs)), max: mx(ok('P1').map((r) => r.pendingWindowMs)) }, lockWaitMaxMs: { each: ok('P1').map((r) => r.lockWaitMaxMs), median: med(ok('P1').map((r) => r.lockWaitMaxMs)), max: mx(ok('P1').map((r) => r.lockWaitMaxMs)) } },
  P2: { n: ok('P2').length, voids: runs.filter((r) => r.path === 'P2' && r.void).length, commitMs: { each: ok('P2').map((r) => r.commitMs), median: med(ok('P2').map((r) => r.commitMs)), max: mx(ok('P2').map((r) => r.commitMs)) }, settleClosedMs: { each: ok('P2').map((r) => r.settleClosedMs), median: med(ok('P2').map((r) => r.settleClosedMs)), max: mx(ok('P2').map((r) => r.settleClosedMs)) }, lockWaitMaxMs: { each: ok('P2').map((r) => r.lockWaitMaxMs), median: med(ok('P2').map((r) => r.lockWaitMaxMs)), max: mx(ok('P2').map((r) => r.lockWaitMaxMs)) } },
  H: { n: ok('H').length, voids: runs.filter((r) => r.path === 'H' && r.void).length, getContextMs: { each: ok('H').map((r) => r.getContextAfterClickMs) }, liveMs: { each: ok('H').map((r) => r.liveMs), median: med(ok('H').map((r) => r.liveMs)), max: mx(ok('H').map((r) => r.liveMs)) }, firstFrameMs: { each: ok('H').map((r) => r.firstFrameMs), median: med(ok('H').map((r) => r.firstFrameMs)), max: mx(ok('H').map((r) => r.firstFrameMs)) } },
  C: { n: ok('C').length, framesPerSec: { each: ok('C').map((r) => r.framesPerSec), median: med(ok('C').map((r) => r.framesPerSec)) }, rafGapMaxMs: { each: ok('C').map((r) => r.rafGapMaxMs), max: mx(ok('C').map((r) => r.rafGapMaxMs)) }, longtaskMaxMs: { each: ok('C').map((r) => r.longtaskMaxMs), max: mx(ok('C').map((r) => r.longtaskMaxMs)) }, longtaskSumMs: { each: ok('C').map((r) => r.longtaskSumMs) } },
};
const ver = await api('/json/version').catch(() => ({}));
writeFileSync(OUT, JSON.stringify({ cond: COND, base: BASE, route: ROUTE, viewport: `${W}x${H}`, browser: ver.Browser, when: new Date().toISOString(), summary, runs }, null, 1));
console.log(JSON.stringify({ cond: COND, summary }, null, 1));
