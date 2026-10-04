// gh#252 per-page font bytes: which font files each built page actually REQUESTS in a real browser,
// and how many bytes came over the wire for each (CDP Network.loadingFinished encodedDataLength).
// The HTTP cache is disabled for the whole run, so a face a previous page already fetched is fetched
// again and never read as free. Every page is enumerated from DIST at run time, never listed by hand.
//
//   CDP_PORT=9351 BASE=http://localhost:4351 DIST=dist W=1440 node <this file>
//
// COUNTS: requests whose URL is under /fonts/ and whose body finished loading, per page, within
// load + a 2 s settle. NOT counted: a face the page would request later (a font a later game state
// first paints with). Each row also carries the paintedWeights the page computes to in its first
// state, so a requested face with no painted weight reads as unused on that page.
import fs from 'node:fs';
import path from 'node:path';

const PORT = process.env.CDP_PORT || 9351;
const BASE = process.env.BASE || 'http://localhost:4351';
const W = Number(process.env.W || 1440);
const DIST = process.env.DIST || 'dist';

function pages(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = path.join(rel, e.name);
    if (e.isDirectory()) out.push(...pages(dir, r));
    else if (e.name.endsWith('.html')) out.push('/' + r.replace(/index\.html$/, '').replace(/\\/g, '/'));
  }
  return out.sort();
}

const api = async (p, method = 'GET') => (await fetch(`http://127.0.0.1:${PORT}${p}`, { method })).json();
const target = await api('/json/new?about:blank', 'PUT');
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
let loadResolve = null;
const reqs = new Map();
const send = (method, params = {}) => new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) pending.get(m.id)(m);
  if (m.method === 'Page.loadEventFired' && loadResolve) { loadResolve(); loadResolve = null; }
  if (m.method === 'Network.requestWillBeSent' && m.params.request.url.includes('/fonts/')) {
    reqs.set(m.params.requestId, { file: m.params.request.url.split('/fonts/')[1], initiator: m.params.initiator.type, bytes: null });
  }
  if (m.method === 'Network.loadingFinished' && reqs.has(m.params.requestId)) reqs.get(m.params.requestId).bytes = m.params.encodedDataLength;
});
await new Promise((r) => ws.addEventListener('open', r));
await send('Page.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: W < 640 ? 640 : 900, deviceScaleFactor: 1, mobile: W < 640 });

const PAINTED = `(() => {
  const w = {};
  for (const el of document.querySelectorAll('body *, body')) {
    const cs = getComputedStyle(el);
    if (!/^\\s*["']?Mitr\\b/i.test(cs.fontFamily)) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const r = el.getBoundingClientRect();
    if (own && cs.display !== 'none' && (r.width > 0 || el instanceof SVGElement)) w[cs.fontWeight] = (w[cs.fontWeight] || 0) + 1;
  }
  return w;
})()`;

const rows = [];
for (const p of pages(DIST)) {
  reqs.clear();
  const loaded = new Promise((r) => { loadResolve = r; });
  await send('Page.navigate', { url: `${BASE}${p}` });
  await loaded;
  await new Promise((r) => setTimeout(r, 2000));
  const painted = await send('Runtime.evaluate', { expression: PAINTED, returnByValue: true });
  const files = [...reqs.values()].map((r) => ({ ...r }));
  rows.push({
    path: p,
    fonts: files.map((f) => f.file).sort(),
    initiators: [...new Set(files.map((f) => f.initiator))],
    fontBytes: files.reduce((a, f) => a + (f.bytes || 0), 0),
    paintedWeights: painted.result?.result?.value ?? null,
  });
}
await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
ws.close();
console.log(JSON.stringify({ width: W, pageCount: rows.length, pages: rows }, null, 2));
process.exit(0);
