// gh#241 wiring probe: the croc-bite card art on /c/party/, measured in a real browser.
//
//   node docs/verification/evidence/gh241/wiring/probe.mjs <label> <out dir>
//   env: BASE (default http://localhost:4321), CDP_PORT (default 9222), WIDTHS (comma list,
//        replaces the default width set below)
//
// Standalone CDP client (zero dependencies), not scripts/driver.mjs, for one reason: driver.mjs's
// setWidth always emulates a mobile device, and at desktop widths mobile emulation expands the
// layout viewport around overflowing content, so a sideways-scroll reading at 1100-1440px would
// measure a phone that no desktop visitor has. Here widths below 768px emulate mobile and the rest
// do not; every row records innerWidth so a run whose viewport is not the asked width is visibly
// void. Every width is a fresh navigation (no re-measure after a layout change).
//
// Readings per width: innerWidth / clientWidth / scrollWidth, the count of elements whose right
// edge passes clientWidth, and for every img.game-card-art its rendered box, natural size,
// complete flag, object-fit, the card it sits in and whether it is that card's first child above
// the h3. The overflow detector is calibrated per width: a 150vw div is injected, the detector must
// see it, then the page is reloaded before the clean reading.
//
// Lazy-load leg (320px only): Network.requestWillBeSent is recorded from before navigation with the
// cache disabled; after load plus a settle, the art requests and performance entries are read, the
// card is scrolled into view, and both are read again.
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const [label, outDir] = process.argv.slice(2);
if (!label || !outDir) {
  console.error('usage: probe.mjs <label> <out dir>');
  process.exit(2);
}
const BASE = process.env.BASE || 'http://localhost:4321';
const PORT = process.env.CDP_PORT || 9222;
const PAGE = `${BASE}/c/party/`;
const WIDTHS = process.env.WIDTHS
  ? process.env.WIDTHS.split(',').map(Number)
  : [320, 390, 1100, 1200, 1280, 1315, 1316, 1440];
const SHOT_WIDTHS = new Set([320, 390, 1280]);
await mkdir(outDir, { recursive: true });

const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
let loadResolve = null;
const requests = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Page.loadEventFired' && loadResolve) { loadResolve(); loadResolve = null; }
  if (m.method === 'Network.requestWillBeSent') {
    requests.push({ url: m.params.request.url, t: m.params.timestamp, type: m.params.type });
  }
});
await new Promise((r) => ws.addEventListener('open', r));
const send = (method, params = {}) =>
  new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
const settle = (ms) => new Promise((r) => setTimeout(r, ms));

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });

async function setWidth(width) {
  const height = width < 768 ? 844 : 900;
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
  await settle(300);
}
async function nav(url) {
  const p = new Promise((r) => { loadResolve = r; });
  await send('Page.navigate', { url });
  await p;
  await settle(900);
}
async function evaluate(body) {
  const res = await send('Runtime.evaluate', {
    expression: `(async () => { ${body} })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  const r = res?.result;
  if (!r) return { error: res?.error?.message ?? 'no result envelope' };
  if (r.exceptionDetails) return { error: r.exceptionDetails.exception?.description ?? r.exceptionDetails.text };
  return { value: r.result?.value ?? null };
}
async function shot(file, clip) {
  const params = { format: 'png' };
  if (clip) params.clip = clip;
  const res = await send('Page.captureScreenshot', params);
  await writeFile(file, Buffer.from(res.result.data, 'base64'));
}

const MEASURE = `
  const de = document.documentElement;
  const over = [...document.querySelectorAll('body *')]
    .map((el) => ({ tag: el.tagName, cls: String(el.className || '').slice(0, 40), right: el.getBoundingClientRect().right }))
    .filter((e) => e.right > de.clientWidth + 0.5);
  const widest = over.slice().sort((a, b) => b.right - a.right).slice(0, 3);
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y + scrollY, width: r.width, height: r.height }; };
  const cards = [...document.querySelectorAll('.cards-grid a.game-card')];
  const art = [...document.querySelectorAll('img.game-card-art')].map((img) => {
    const card = img.closest('a.game-card');
    const h3 = card ? card.querySelector('h3') : null;
    const cs = getComputedStyle(img);
    return {
      cardHref: card ? card.getAttribute('href') : null,
      firstChild: card ? card.firstElementChild === img : false,
      aboveH3: h3 ? img.getBoundingClientRect().bottom <= h3.getBoundingClientRect().top + 0.5 : false,
      src: img.getAttribute('src'),
      loading: img.getAttribute('loading'),
      attrSize: [img.getAttribute('width'), img.getAttribute('height')],
      box: box(img),
      cardBox: card ? box(card) : null,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      complete: img.complete,
      objectFit: cs.objectFit,
      objectPosition: cs.objectPosition,
      belowFoldBy: img.getBoundingClientRect().top - innerHeight,
    };
  });
  return {
    innerWidth, innerHeight, clientWidth: de.clientWidth, scrollWidth: de.scrollWidth,
    overflowCount: over.length, widest, cardCount: cards.length, art,
  };
`;

const rows = [];
for (const width of WIDTHS) {
  await setWidth(width);
  await nav(PAGE);
  await evaluate(`document.body.insertAdjacentHTML('afterbegin', '<div id="probe-overflow" style="width:150vw;height:1px"></div>'); return true;`);
  const injected = await evaluate(MEASURE);
  await nav(PAGE);
  const clean = await evaluate(MEASURE);
  const row = {
    width,
    mobileEmulation: width < 768,
    detectorSawInjected: !!(injected.value && injected.value.overflowCount > 0 && injected.value.scrollWidth > injected.value.clientWidth),
    ...(clean.value ?? { error: clean.error }),
  };
  if (SHOT_WIDTHS.has(width) && row.art && row.art.length > 0) {
    await evaluate(`document.querySelector('img.game-card-art').closest('a.game-card').scrollIntoView({ block: 'center' }); return true;`);
    const loaded = await evaluate(`
      const img = document.querySelector('img.game-card-art');
      for (let i = 0; i < 40 && !(img.complete && img.naturalWidth > 0); i += 1) await new Promise((r) => setTimeout(r, 100));
      const r = img.closest('a.game-card').getBoundingClientRect();
      return { complete: img.complete, naturalWidth: img.naturalWidth, card: { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height } };
    `);
    await settle(300);
    await shot(path.join(outDir, `${label}-${width}-viewport.png`));
    const c = loaded.value.card;
    await shot(path.join(outDir, `${label}-${width}-card-2x.png`), { x: Math.max(0, c.x - 8), y: Math.max(0, c.y - 8), width: c.width + 16, height: c.height + 16, scale: 2 });
    row.afterScroll = { complete: loaded.value.complete, naturalWidth: loaded.value.naturalWidth };
  }
  rows.push(row);
}

// Lazy-load leg at 320px.
await setWidth(320);
requests.length = 0;
await nav(PAGE);
await settle(1500);
const ART_RE = /\/art\/[^/?#]+$/;
const before = await evaluate(`
  const img = document.querySelector('img.game-card-art');
  const entries = performance.getEntriesByType('resource').filter((e) => /\\/art\\//.test(e.name)).map((e) => e.name);
  return img ? { present: true, complete: img.complete, naturalWidth: img.naturalWidth, belowFoldBy: img.getBoundingClientRect().top - innerHeight, entries } : { present: false, entries };
`);
const requestsBefore = requests.filter((r) => ART_RE.test(new URL(r.url).pathname)).map((r) => r.url);
await evaluate(`const img = document.querySelector('img.game-card-art'); if (img) img.scrollIntoView({ block: 'center' }); return true;`);
await settle(1500);
const after = await evaluate(`
  const img = document.querySelector('img.game-card-art');
  const entries = performance.getEntriesByType('resource').filter((e) => /\\/art\\//.test(e.name)).map((e) => e.name);
  return img ? { present: true, complete: img.complete, naturalWidth: img.naturalWidth, belowFoldBy: img.getBoundingClientRect().top - innerHeight, entries } : { present: false, entries };
`);
const requestsAfter = requests.filter((r) => ART_RE.test(new URL(r.url).pathname)).map((r) => r.url);

const out = {
  label,
  page: PAGE,
  takenAt: new Date().toISOString(),
  userAgent: (await evaluate('return navigator.userAgent')).value,
  rows,
  lazy: { width: 320, before: { ...before.value, networkRequests: requestsBefore }, after: { ...after.value, networkRequests: requestsAfter } },
};
await writeFile(path.join(outDir, `${label}.json`), `${JSON.stringify(out, null, 2)}\n`);
await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
ws.close();
console.log(JSON.stringify({
  label,
  rows: rows.map((r) => ({ w: r.width, iw: r.innerWidth, cw: r.clientWidth, sw: r.scrollWidth, over: r.overflowCount, cal: r.detectorSawInjected, art: (r.art || []).length })),
  lazy: out.lazy,
}));
