// gh#250 — natural width vs rendered width of the card-art images, at a chosen device pixel ratio.
// scripts/driver.mjs pins deviceScaleFactor to 1 and exposes no raw CDP call, so this probe opens its
// own tab and sets Emulation.setDeviceMetricsOverride itself, BEFORE navigating, so the browser picks
// the srcset candidate for the emulated density.
//
//   BASE=http://localhost:4341 CDP_PORT=9341 W=320 DPR=2 PAGES=/,/c/party/ node docs/verification/evidence/gh250/dpr-probe.mjs
//
// Per image: the slot it sits in, the chosen candidate (currentSrc), natural size, the img box's
// rendered size, the width actually painted (object-fit: contain inside the box), the chosen file's own
// pixel size (`fileSize`) and fileSize width / rendered box width (`ratio`). The criterion "natural >= DPR x rendered" is read on the box width, which is
// never smaller than the painted width, so it is the stricter reading. After the scroll, the page's
// total encodedBodySize over Resource Timing is reported as `weight` at this DPR.
const BASE = process.env.BASE || 'http://localhost:4341';
const PORT = process.env.CDP_PORT || 9341;
const W = Number(process.env.W || 1440);
const DPR = Number(process.env.DPR || 2);
const H = W < 640 ? 640 : 900;
const PAGES = (process.env.PAGES || '/').split(',');

const api = async (p, method = 'GET') => (await fetch(`http://127.0.0.1:${PORT}${p}`, { method })).json();
const target = await api('/json/new?about:blank', 'PUT');
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
let loadResolve = null;
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); return; }
  if (m.method === 'Page.loadEventFired' && loadResolve) { loadResolve(); loadResolve = null; }
});
const send = (method, params = {}) => new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
await new Promise((r) => ws.addEventListener('open', r));
await send('Page.enable');
await send('Runtime.enable');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const READ = `
  const slotOf = (img) => {
    if (img.closest('.featured')) return 'hero';
    const tile = img.closest('.tile');
    if (tile) return 'tile-' + (tile.getAttribute('data-variant') || '?');
    if (img.classList.contains('game-card-art')) return 'category-card';
    return 'other';
  };
  for (let y = 0; y <= document.documentElement.scrollHeight; y += innerHeight) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 500)); }
  await new Promise((r) => setTimeout(r, 1200));
  scrollTo(0, 0);
  const imgs = [...document.images].filter((i) => (i.getAttribute('src') || '').startsWith('/art/') && !(i.getAttribute('src') || '').startsWith('/art/nuea-khu/'));
  // naturalWidth of an img with a density srcset is the chosen file's pixels DIVIDED by its density
  // (an 847 px file at 2x reads 423), so it can never show the 2x gain. The file's own pixel size comes
  // from a plain Image() loaded from currentSrc, which has no srcset to divide by.
  const fileSizes = await Promise.all(imgs.map((i) => new Promise((res) => {
    const probe = new Image();
    probe.onload = () => res(probe.naturalWidth + 'x' + probe.naturalHeight);
    probe.onerror = () => res('load-error');
    probe.src = i.currentSrc;
  })));
  const rows = imgs.map((i, k) => {
    const r = i.getBoundingClientRect();
    const nw = i.naturalWidth, nh = i.naturalHeight;
    const painted = Math.min(r.width, nw ? r.height * nw / nh : 0);
    return {
      slot: slotOf(i), src: i.getAttribute('src'), currentSrc: i.currentSrc.replace(location.origin, ''),
      hasSrcset: i.hasAttribute('srcset'), complete: i.complete,
      natural: nw + 'x' + nh, fileSize: fileSizes[k], renderedBox: +r.width.toFixed(1) + 'x' + +r.height.toFixed(1),
      paintedW: +painted.toFixed(1),
      ratio: r.width ? +(Number(fileSizes[k].split('x')[0]) / r.width).toFixed(3) : null,
    };
  });
  const res = performance.getEntriesByType('resource');
  const nav = performance.getEntriesByType('navigation')[0];
  const weight = [nav, ...res].reduce((a, e) => a + (e.encodedBodySize || 0), 0);
  return { dpr: devicePixelRatio, innerWidth, rows, requests: res.length + 1, weight };
`;

const out = { width: W, dprRequested: DPR, pages: {} };
for (const page of PAGES) {
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: W < 640 });
  await wait(300);
  // A fresh about:blank first, so the previous page's decoded images cannot answer this page's loads.
  const blank = new Promise((r) => { loadResolve = r; });
  await send('Page.navigate', { url: 'about:blank' });
  await blank;
  const p = new Promise((r) => { loadResolve = r; });
  await send('Page.navigate', { url: `${BASE}${page}` });
  await p;
  await wait(900);
  const res = await send('Runtime.evaluate', { expression: `(async () => { ${READ} })()`, awaitPromise: true, returnByValue: true });
  out.pages[page] = res.result?.result?.value ?? { error: res.result?.exceptionDetails?.text ?? 'no value' };
}
await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
ws.close();
console.log(JSON.stringify(out, null, 2));
process.exit(0);
