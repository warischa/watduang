// gh#263 item 1: captures of the GameNav link list drawn on the two number boards, from file://, raw CDP
// (recipe: docs/agents/raw-cdp-capture.md; adapted from ../how-to/capture.mjs).
// Needs a headless Chrome already listening: --remote-debugging-port=9362. Run from the repo root:
//   node docs/verification/evidence/gh263-canvas/game-nav/capture.mjs [boardDir] [outJson]
// boardDir defaults to design/; pass a copy of the pre-edit boards to measure the placeholder ("before").
// Per board: full-board JPEG, a crop of the continue-path block, and the box height of every drawn link.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT = 'docs/verification/evidence/gh263-canvas/game-nav';
const PORT = 9362;
const DIR = process.argv[2] || 'design';
const JSON_OUT = process.argv[3] || `${OUT}/capture-result.json`;
const SHOOT = !process.argv[2];
const BOARDS = [['ToolNumber390', 390], ['ToolNumberDesktop', 1440]];
const H_XPATH = "//h2[normalize-space()='เล่นเกมต่อ']";

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
const evalJs = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;

await send('Page.enable'); await send('Runtime.enable'); await send('DOM.enable'); await send('CSS.enable');
const report = [];
for (const [name, width] of BOARDS) {
  events.length = 0;
  await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await send('Page.navigate', { url: 'file://' + resolve(DIR, name + '.dc.html') });
  for (let t = 0; t < 100 && !events.some((e) => e.method === 'Page.loadEventFired'); t++) await new Promise((r) => setTimeout(r, 100));
  await evalJs(`(()=>{const s=document.createElement('style');s.textContent='*{animation:none!important;transition:none!important}';document.head.appendChild(s);return 1})()`);
  await evalJs('document.fonts.ready.then(()=>1)');
  await new Promise((r) => setTimeout(r, 400));
  const m = await evalJs(`(()=>{
    const h = document.evaluate(${JSON.stringify(H_XPATH)}, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    const blockEl = h.parentElement; const block = blockEl.getBoundingClientRect();
    const list = h.nextElementSibling; const lr = list.getBoundingClientRect();
    const links = [...blockEl.querySelectorAll('a')].map((a) => { const r = a.getBoundingClientRect(); const cs = getComputedStyle(a);
      return { label: a.textContent.trim(), height: +r.height.toFixed(2), width: +r.width.toFixed(2), top: +r.top.toFixed(2),
        font: cs.fontFamily + ' ' + cs.fontWeight + ' ' + cs.fontSize + '/' + cs.lineHeight }; });
    const tops = [...new Set(links.map((l) => Math.round(l.top)))];
    return { innerWidth, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth,
      height: Math.ceil(document.querySelector('x-dc > div').getBoundingClientRect().bottom),
      blockHeight: +block.height.toFixed(2), listHeight: +lr.height.toFixed(2), listTag: list.tagName,
      rows: tops.length, linkCount: links.length, minLinkHeight: links.length ? Math.min(...links.map((l) => l.height)) : null,
      blockRect: { x: Math.floor(block.left + scrollX), y: Math.floor(block.top + scrollY), w: Math.ceil(block.width), h: Math.ceil(block.height) },
      links };
  })()`);
  const files = [];
  if (SHOOT) {
    const full = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70, captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: m.height, scale: 1 } });
    files.push(`${OUT}/${name}.jpg`); writeFileSync(files.at(-1), Buffer.from(full.data, 'base64'));
    const b = m.blockRect; const pad = 16;
    const crop = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70, captureBeyondViewport: true,
      clip: { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: Math.min(width, b.w + 2 * pad), height: b.h + 2 * pad, scale: 1 } });
    files.push(`${OUT}/${name}-gamenav.jpg`); writeFileSync(files.at(-1), Buffer.from(crop.data, 'base64'));
  }
  const errors = events.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params.exceptionDetails.exception?.description?.split('\n')[0]);
  report.push({ name, width, dir: DIR, ...m, errors, files });
  const { links, ...rest } = report.at(-1);
  console.log(JSON.stringify(rest));
}
writeFileSync(JSON_OUT, JSON.stringify(report, null, 2) + '\n');
ws.close();
