// gh#252 acceptance box 2: which font the browser ACTUALLY rendered a heading with, read from the
// engine (CDP CSS.getPlatformFontsForNode), never from the stylesheet. Standalone because
// scripts/driver.mjs does not expose raw CDP calls.
//
//   CDP_PORT=9351 BASE=http://localhost:4351 W=320 node <this file>
//
// For each page below it reads the platform fonts of the first h1 and of every element inside it
// that holds its own text, at the width W, in a fresh tab. A font with isCustomFont=true is one the
// page itself loaded (an @font-face); isCustomFont=false is a system face found by name.
const PORT = process.env.CDP_PORT || 9351;
const BASE = process.env.BASE || 'http://localhost:4351';
const W = Number(process.env.W || 1440);
const PAGES = (process.env.PAGES || '/,/c/party/,/c/fortune/').split(',');

const api = async (p, method = 'GET') => (await fetch(`http://127.0.0.1:${PORT}${p}`, { method })).json();
const target = await api('/json/new?about:blank', 'PUT');
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
let loadResolve = null;
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) pending.get(m.id)(m);
  if (m.method === 'Page.loadEventFired' && loadResolve) { loadResolve(); loadResolve = null; }
});
const send = (method, params = {}) => new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
await new Promise((r) => ws.addEventListener('open', r));
await send('Page.enable');
await send('DOM.enable');
await send('CSS.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: W < 640 ? 640 : 900, deviceScaleFactor: 1, mobile: W < 640 });

const out = [];
for (const p of PAGES) {
  const loaded = new Promise((r) => { loadResolve = r; });
  await send('Page.navigate', { url: `${BASE}${p}` });
  await loaded;
  await new Promise((r) => setTimeout(r, 1500));
  const doc = await send('DOM.getDocument', { depth: -1 });
  const q = await send('DOM.querySelectorAll', { nodeId: doc.result.root.nodeId, selector: 'h1, h1 *' });
  const rows = [];
  for (const nodeId of q.result.nodeIds) {
    const f = await send('CSS.getPlatformFontsForNode', { nodeId });
    const fonts = f.result?.fonts ?? [];
    if (fonts.length) rows.push(fonts.map((x) => ({ family: x.familyName, custom: x.isCustomFont, glyphs: x.glyphCount })));
  }
  const iw = await send('Runtime.evaluate', { expression: 'innerWidth', returnByValue: true });
  const fam = await send('Runtime.evaluate', { expression: "getComputedStyle(document.querySelector('h1')).fontFamily + ' | ' + getComputedStyle(document.querySelector('h1')).fontWeight", returnByValue: true });
  out.push({ path: p, innerWidth: iw.result.result.value, h1Computed: fam.result.result.value, nodesWithText: rows.length, fonts: rows.flat() });
}
await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
ws.close();
console.log(JSON.stringify({ width: W, pages: out }, null, 2));
process.exit(0);
