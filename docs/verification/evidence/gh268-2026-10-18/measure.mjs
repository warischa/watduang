// gh#268 box 1: how #play-exit and #play-edit-players overlap each party play route's own content at 320x568.
// Usage: BASE=http://localhost:4441 CDP_PORT=9441 OUT=<dir> [IDS=a,b] [CONTROL=1] node measure.mjs
// Own CDP client (not scripts/driver.mjs) because driver.setWidth pins deviceScaleFactor 1 and the brief asks for 2.
import { writeFileSync, mkdirSync } from 'node:fs';
const BASE = process.env.BASE || 'http://localhost:4441';
const PORT = process.env.CDP_PORT || '9441';
const OUT = process.env.OUT;
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map(); let loadRes = null;
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) pending.get(m.id)(m);
  if (m.method === 'Page.loadEventFired' && loadRes) { loadRes(); loadRes = null; } });
const send = (method, params = {}) => new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
await send('Page.enable'); await send('Runtime.enable');
const nav = async (url) => { const p = new Promise((r) => { loadRes = r; }); await send('Page.navigate', { url }); await Promise.race([p, sleep(15000)]); };
const metrics = () => send('Emulation.setDeviceMetricsOverride', { width: 320, height: 568, deviceScaleFactor: 2, mobile: true });
const ev = async (body) => { const r = await send('Runtime.evaluate', { expression: `(async()=>{${body}})()`, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.exception?.description || 'exc' }; return { value: r.result?.result?.value }; };
const shot = async (path) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(path, Buffer.from(r.result.data, 'base64')); };

const MEASURE = `
const VW = innerWidth, VH = innerHeight;
const sel = (e) => { const p = []; for (let n = e; n && n.nodeType === 1 && p.length < 5; n = n.parentElement) { p.unshift(n.tagName.toLowerCase() + (n.id ? '#' + n.id : (n.classList[0] ? '.' + n.classList[0] : ''))); if (n.id) break; } return p.join(' > '); };
const rectOf = (r) => ({ l: +r.left.toFixed(2), t: +r.top.toFixed(2), r: +r.right.toFixed(2), b: +r.bottom.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) });
// rect of e clipped by every ancestor whose overflow is not visible
const clipped = (e) => { let r = e.getBoundingClientRect(); let L = r.left, T = r.top, R = r.right, B = r.bottom;
  for (let a = e.parentElement; a && a !== document.documentElement; a = a.parentElement) { const c = getComputedStyle(a);
    if (c.position === 'fixed' && a !== e.parentElement) { /* fixed ancestors still clip via own overflow */ }
    if (c.overflowX !== 'visible' || c.overflowY !== 'visible') { const q = a.getBoundingClientRect(); L = Math.max(L, q.left); T = Math.max(T, q.top); R = Math.min(R, q.right); B = Math.min(B, q.bottom); } }
  return { L, T, R, B }; };
const isContent = (e) => { if (['BUTTON','INPUT','IMG','SVG','CANVAS','A','SELECT','TEXTAREA','VIDEO'].includes(e.tagName.toUpperCase())) return true;
  if (!e.children.length) return true; return [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()); };
const out = { innerWidth: VW, innerHeight: VH, clientWidth: document.documentElement.clientWidth, url: location.pathname, controls: {} };
const all = [...document.querySelectorAll('body *')].filter((e) => !['SCRIPT','STYLE','TEMPLATE','NOSCRIPT','DEFS','TITLE'].includes(e.tagName.toUpperCase()) && !e.closest('defs'));
for (const cid of ['play-exit', 'play-edit-players']) {
  const c = document.getElementById(cid); const rec = { present: !!c };
  if (!c) { out.controls[cid] = rec; continue; }
  const cs = getComputedStyle(c); const cr = c.getBoundingClientRect();
  rec.rect = rectOf(cr); rec.z = cs.zIndex; rec.position = cs.position; rec.hiddenAttr = c.hidden; rec.display = cs.display;
  rec.shown = cr.width > 0 && cr.height > 0 && cs.visibility === 'visible';
  if (!rec.shown) { out.controls[cid] = rec; continue; }
  const area = cr.width * cr.height; rec.area = +area.toFixed(2);
  let ignored = 0; const hits = [];
  for (const e of all) {
    if (e === c || c.contains(e) || e.contains(c)) continue;
    const r = e.getBoundingClientRect(); if (r.width <= 0 || r.height <= 0) continue;
    const s = getComputedStyle(e); if (s.visibility !== 'visible' || parseFloat(s.opacity) <= 0) continue;
    // effective opacity: a closed overlay hides itself with opacity 0 on an ancestor, which its children's own computed opacity does not show
    let eo = 1; for (let a = e; a; a = a.parentElement) eo *= parseFloat(getComputedStyle(a).opacity); if (eo <= 0.01) continue;
    if (r.width * r.height >= 0.9 * VW * VH) { if (Math.min(r.right, VW) - Math.max(r.left, 0) > 0) ignored++; continue; }
    const k = clipped(e);
    const L = Math.max(k.L, cr.left), T = Math.max(k.T, cr.top), R = Math.min(k.R, cr.right), B = Math.min(k.B, cr.bottom);
    if (R <= L || B <= T) continue;
    const ia = (R - L) * (B - T); if (ia <= 0.01) continue;
    const cx = (L + R) / 2, cy = (T + B) / 2; const w = document.elementFromPoint(cx, cy);
    hits.push({ sel: sel(e), content: isContent(e), text: (e.children.length ? '' : (e.textContent || '').trim().slice(0, 16)), interactive: !!e.closest('button,a,[role=button]'),
      px2: +ia.toFixed(2), share: +(ia / area).toFixed(4), at: [+cx.toFixed(1), +cy.toFixed(1)], winner: w ? sel(w) : null, controlWins: !!w && (w === c || c.contains(w)), z: s.zIndex, pos: s.position });
  }
  hits.sort((a, b) => b.px2 - a.px2);
  rec.ignoredFullScreen = ignored; rec.hits = hits; rec.contentHits = hits.filter((h) => h.content).length;
  // union coverage by content elements: rasterise on a 1px grid
  const g = new Set(); for (const h of hits.filter((x) => x.content)) { /* approximate via per-pixel elementFromPoint-free union is skipped; use max single share */ }
  rec.maxContentShare = Math.max(0, ...hits.filter((h) => h.content).map((h) => h.share));
  out.controls[cid] = rec;
}
return out;`;

const ROUTES = { // route-own control that begins the round after the shared screen's start (data-driven from a probe of each route; ids are the route's own)
  'timebomb': '#tb-start', 'one-bomb': null, 'short-stick': '#btn-begin-game', 'freeze-tap': '#ruleReadyBtn', 'cannon-flag': '#btn-ready-to-aim',
  'power-meter': '#btn-primary-action', 'dice-loser': '#dl-begin', 'how-close-is-near': '#btnStartGame', 'pinocchio-luck': '#ready',
  'cursed-number': '#startGameBtn', 'wire-snip-panic': '#btn-start-match', 'zero-trigger': '#btn-big-action', 'bangkok-drift': '#readyBtn', 'croc-bite': '#btn-start-game' };
// routes whose first screen is their own menu: this click opens the shared player screen (probed per route)
const PRE = { 'short-stick': '#btn-start-setup', 'wire-snip-panic': '#btn-menu-start', 'zero-trigger': '#btn-quick-start' };
// (reserved) per-route click after S2 for a second reading S2b; empty: no route needed one
const POST = {};
const SEED = JSON.stringify(['ต้น', 'มายด์', 'บอส']);
const click = (s) => ev(`const b=document.querySelector(${JSON.stringify(s)});if(!b)return 'absent';const r=b.getBoundingClientRect();if(!r.width)return 'hidden';if(b.disabled)return 'disabled';b.click();return 'clicked'`);
const ids = (process.env.IDS || Object.keys(ROUTES).join(',')).split(',');
const results = {};
for (const rid of ids) {
  const url = `${BASE}/game/${rid}/play/`; const rr = { notes: [] }; results[rid] = rr;
  // S1: first visit, empty storage
  await nav(url); await ev('localStorage.clear();sessionStorage.clear();return 1'); await nav(url); await metrics(); await sleep(1500);
  rr.S1 = (await ev(MEASURE)).value;
  rr.S1.sharedScreenOpen = (await ev(`const b=document.querySelector('[data-ps=start]');return !!b&&b.getBoundingClientRect().width>0`)).value;
  await shot(`${OUT}/${rid}-S1.png`);
  // S2: seeded roster of 3, then drive to the round
  await ev(`localStorage.clear();sessionStorage.clear();localStorage.setItem('watduang:roster',${JSON.stringify(SEED)});localStorage.setItem('watduang:group',${JSON.stringify(SEED)});return 1`);
  await nav(url); await metrics(); await sleep(1800);
  if (PRE[rid]) { rr.notes.push(PRE[rid] + ':' + (await click(PRE[rid])).value); await sleep(1500); }
  rr.S2a = (await ev(MEASURE)).value; rr.S2a.sharedScreenOpen = (await ev(`const b=document.querySelector('[data-ps=start]');return !!b&&b.getBoundingClientRect().width>0`)).value;
  if (rr.S2a.sharedScreenOpen) { rr.notes.push('S2a=shared screen open with saved roster of 3'); rr.notes.push('ps-start:' + (await click('[data-ps=start]')).value); await sleep(1500); }
  else rr.notes.push('S2a: shared screen not open on this route (own setup or roster bridge)');
  if (ROUTES[rid]) { rr.notes.push(ROUTES[rid] + ':' + (await click(ROUTES[rid])).value); await sleep(1500); }
  rr.S2 = (await ev(MEASURE)).value; await shot(`${OUT}/${rid}-S2.png`);
  if (POST[rid]) { rr.notes.push(POST[rid] + ':' + (await click(POST[rid])).value); await sleep(1500); rr.S2b = (await ev(MEASURE)).value; await shot(`${OUT}/${rid}-S2b.png`); }
  rr.S2.visibleButtons = (await ev(`return [...document.querySelectorAll('button')].filter(b=>{const r=b.getBoundingClientRect();return r.width>0&&getComputedStyle(b).visibility=='visible'}).map(b=>(b.id||b.dataset.ps||'btn')+(b.disabled?'(dis)':'')).join(' ')`)).value;
}
writeFileSync(`${OUT}/${process.env.CONTROL ? 'control' : 'results'}.json`, JSON.stringify(results, null, 1));
await send('Target.closeTarget', { targetId: target.id }).catch(() => {});
console.log('done', ids.length);
process.exit(0);
