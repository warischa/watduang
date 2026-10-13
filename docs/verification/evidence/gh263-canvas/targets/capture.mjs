// gh#263 proposals board: per-artboard JPEGs and a measured 44px hit box, from file://, raw CDP
// (recipe: docs/agents/raw-cdp-capture.md; adapted from ../game-nav/capture.mjs).
// Needs a headless Chrome already listening: --remote-debugging-port=9364. Run from the repo root:
//   node docs/verification/evidence/gh263-canvas/targets/capture.mjs [boardFile] [outDir]
// Per artboard (.frame[data-variant][data-group]) and per target ([data-t]): the border box from
// getBoundingClientRect, the claimed hit box (the box itself, or the ::after box read from computed style), and the
// hit box MEASURED with document.elementFromPoint: a grid inset 1px from the claimed box (samples landing on a
// neighbour are listed) and a 0.5px scan through the box centre (tappable height / width actually found).
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT = process.argv[3] || 'docs/verification/evidence/gh263-canvas/targets';
const PORT = 9364;
const BOARD = process.argv[2] || 'design/Gh263TargetProposals.dc.html';
const WIDTH = 1440;
mkdirSync(OUT, { recursive: true });

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const pending = new Map(); const events = [];
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } else events.push(msg);
});
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++id; pending.set(i, (msg) => (msg.error ? rej(new Error(method + ': ' + msg.error.message)) : res(msg.result)));
  ws.send(JSON.stringify({ id: i, method, params }));
});
const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'evaluate failed');
  return r.result.value;
};

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: 2400, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'file://' + resolve(BOARD) });
for (let t = 0; t < 100 && !events.some((e) => e.method === 'Page.loadEventFired'); t++) await new Promise((r) => setTimeout(r, 100));
await evalJs(`(()=>{const s=document.createElement('style');s.textContent='*{animation:none!important;transition:none!important}';document.head.appendChild(s);return 1})()`);
await evalJs('document.fonts.ready.then(()=>1)');
await new Promise((r) => setTimeout(r, 400));
const docHeight = await evalJs('Math.ceil(document.documentElement.scrollHeight)');
await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: Math.max(900, docHeight), deviceScaleFactor: 1, mobile: false });
await new Promise((r) => setTimeout(r, 200));

const PAGE_FN = `(()=>{
  const px = (v) => parseFloat(v) || 0;
  const who = (el) => el ? (el.tagName.toLowerCase() + '.' + String(el.className).trim().split(/\\s+/).join('.') + ':' + (el.textContent || '').trim().slice(0, 14)) : 'null';
  const claimedBox = (el) => {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); const pc = getComputedStyle(el, '::after');
    if (pc.content === 'none' || pc.content === 'normal' || pc.position !== 'absolute') return { src: 'element', left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    const pl = r.left + px(cs.borderLeftWidth), pt = r.top + px(cs.borderTopWidth), pr = r.right - px(cs.borderRightWidth), pb = r.bottom - px(cs.borderBottomWidth);
    return { src: '::after', left: pl + px(pc.left), top: pt + px(pc.top), right: pr - px(pc.right), bottom: pb - px(pc.bottom) };
  };
  const owns = (t, hit) => !!hit && (hit === t || t.contains(hit));
  const out = [];
  for (const frame of document.querySelectorAll('.frame[data-variant]')) {
    const group = frame.dataset.group, variant = frame.dataset.variant;
    const items = [...frame.querySelectorAll('[data-t]')].map((t) => {
      const r = t.getBoundingClientRect(); const c = claimedBox(t);
      const cw = c.right - c.left, ch = c.bottom - c.top;
      const nx = Math.max(2, Math.ceil(cw / 4) + 1), ny = Math.max(2, Math.ceil(ch / 4) + 1);
      let samples = 0, onTarget = 0; const neighbours = {};
      for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
        const x = c.left + 1 + (cw - 2) * ix / (nx - 1), y = c.top + 1 + (ch - 2) * iy / (ny - 1);
        const hit = document.elementFromPoint(x, y); samples++;
        if (owns(t, hit)) onTarget++;
        else { const k = who(hit); (neighbours[k] ||= { count: 0, first: [+x.toFixed(1), +y.toFixed(1)] }).count++; }
      }
      const cx = (c.left + c.right) / 2, cy = (c.top + c.bottom) / 2;
      const scan = (fixed, from, to, vertical) => { let lo = null, hi = null;
        for (let v = from; v <= to; v += 0.5) { const hit = vertical ? document.elementFromPoint(fixed, v) : document.elementFromPoint(v, fixed);
          if (owns(t, hit)) { if (lo === null) lo = v; hi = v; } }
        return lo === null ? 0 : +(hi - lo + 0.5).toFixed(1); };
      return { label: t.textContent.trim(), tag: t.tagName.toLowerCase(),
        box: { w: +r.width.toFixed(2), h: +r.height.toFixed(2), top: +r.top.toFixed(2), left: +r.left.toFixed(2) },
        claimed: { src: c.src, w: +cw.toFixed(2), h: +ch.toFixed(2), top: +c.top.toFixed(2), bottom: +c.bottom.toFixed(2), left: +c.left.toFixed(2), right: +c.right.toFixed(2) },
        tappableHeight: scan(cx, c.top - 12, c.bottom + 12, true), tappableWidth: scan(cy, c.left - 12, c.right + 12, false),
        grid: { samples, onTarget, onNeighbour: samples - onTarget, neighbours } };
    });
    const tops = [...new Set(items.map((i) => Math.round(i.box.top)))].sort((a, b) => a - b);
    let rowOverlap = 0;
    for (const a of items) for (const b of items) if (b.box.top > a.box.top + 1 && a.claimed.left < b.claimed.right && b.claimed.left < a.claimed.right) rowOverlap = Math.max(rowOverlap, +(a.claimed.bottom - b.claimed.top).toFixed(2));
    const fr = frame.getBoundingClientRect();
    out.push({ group, variant, frame: { w: +fr.width.toFixed(2), h: +fr.height.toFixed(2) }, rows: tops.length, maxClaimedRowOverlapPx: Math.max(0, rowOverlap),
      scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, items });
  }
  return out;
})()`;
const measured = await evalJs(PAGE_FN);

const rects = await evalJs(`[...document.querySelectorAll('.frame[data-variant]')].map((f) => { const r = f.parentElement.getBoundingClientRect();
  return { group: f.dataset.group, variant: f.dataset.variant, x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; })`);
const files = [];
for (const r of rects) {
  const pad = 4;
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70, captureBeyondViewport: true,
    clip: { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: r.w + 2 * pad, height: r.h + 2 * pad, scale: 1 } });
  const file = `${OUT}/${r.group}-${r.variant}.jpg`;
  writeFileSync(file, Buffer.from(shot.data, 'base64')); files.push(file);
}

const errors = events.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params.exceptionDetails.exception?.description?.split('\n')[0]);
const report = { board: BOARD, width: WIDTH, docHeight, artboards: measured, errors, files };
for (const a of measured) {
  const hs = a.items.map((i) => `${i.label}:${i.box.h}->${i.claimed.h}/${i.tappableHeight}/${i.grid.onNeighbour}`).join(' ');
  console.log(`${a.group} ${a.variant} rows=${a.rows} overlap=${a.maxClaimedRowOverlapPx} (label: box->claimed/tappable/neighbour-samples) ${hs}`);
}
writeFileSync(`${OUT}/capture-result.json`, JSON.stringify(report, null, 2) + '\n');
ws.close();
