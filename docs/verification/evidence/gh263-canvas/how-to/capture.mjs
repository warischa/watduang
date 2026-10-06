// gh#263 item 3: captures of the how-to section on the four tool boards, from file://, raw CDP
// (recipe: docs/agents/raw-cdp-capture.md; adapted from the gh262-canvas capture script).
// Needs a headless Chrome already listening: --remote-debugging-port=9363. Run from the repo root:
//   node docs/verification/evidence/gh263-canvas/how-to/capture.mjs
// Per board: a full-board JPEG and a crop of the how-to block, plus the painted face of the how-to h2
// and of one other h2 on the same board for comparison.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT = 'docs/verification/evidence/gh263-canvas/how-to';
const PORT = 9363;
const BOARDS = [
  ['ToolWheel390', 390], ['ToolWheelDesktop', 1440],
  ['ToolNumber390', 390], ['ToolNumberDesktop', 1440],
];
const HOWTO_XPATH = "//h2[normalize-space()='วิธีใช้']";

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
const fontsOf = async (nodeId) => (await send('CSS.getPlatformFontsForNode', { nodeId })).fonts
  .map((f) => `${f.postScriptName || f.familyName} x${f.glyphCount}`).join(', ');

await send('Page.enable'); await send('Runtime.enable'); await send('DOM.enable'); await send('CSS.enable');
const report = [];
for (const [name, width] of BOARDS) {
  events.length = 0;
  await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await send('Page.navigate', { url: 'file://' + resolve('design', name + '.dc.html') });
  for (let t = 0; t < 100 && !events.some((e) => e.method === 'Page.loadEventFired'); t++) await new Promise((r) => setTimeout(r, 100));
  await evalJs(`(()=>{const s=document.createElement('style');s.textContent='*{animation:none!important;transition:none!important}';document.head.appendChild(s);return 1})()`);
  await evalJs('document.fonts.ready.then(()=>1)');
  await new Promise((r) => setTimeout(r, 400));
  const m = await evalJs(`(()=>{
    const h = document.evaluate(${JSON.stringify(HOWTO_XPATH)}, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    const block = h ? h.parentElement.getBoundingClientRect() : null;
    const cs = h ? getComputedStyle(h) : null;
    return { innerWidth, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth,
      height: Math.ceil(document.querySelector('x-dc > div').getBoundingClientRect().bottom),
      howtoCss: cs ? cs.fontFamily + ' ' + cs.fontWeight + ' ' + cs.fontSize : null,
      howtoBlock: block ? { x: Math.floor(block.left + scrollX), y: Math.floor(block.top + scrollY), w: Math.ceil(block.width), h: Math.ceil(block.height) } : null,
      mitr600: document.fonts.check('600 19px Mitr'), notoThai: document.fonts.check('400 16px "Noto Sans Thai"') };
  })()`);
  const doc = await send('DOM.getDocument', { depth: -1 });
  const s = await send('DOM.performSearch', { query: HOWTO_XPATH });
  let howtoH2Font = null;
  if (s.resultCount) {
    const { nodeIds } = await send('DOM.getSearchResults', { searchId: s.searchId, fromIndex: 0, toIndex: 1 });
    howtoH2Font = await fontsOf(nodeIds[0]);
  }
  await send('DOM.discardSearchResults', { searchId: s.searchId });
  // Comparison: the first h2 on the board that is not the how-to heading.
  const all = await send('DOM.querySelectorAll', { nodeId: doc.root.nodeId, selector: 'h2' });
  let otherH2 = null;
  for (const nid of all.nodeIds) {
    const txt = (await send('DOM.getOuterHTML', { nodeId: nid })).outerHTML.replace(/<[^>]+>/g, '').trim();
    if (txt !== 'วิธีใช้') { otherH2 = { text: txt, font: await fontsOf(nid) }; break; }
  }
  const files = [];
  const full = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70, captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: m.height, scale: 1 } });
  files.push(`${OUT}/${name}.jpg`); writeFileSync(files.at(-1), Buffer.from(full.data, 'base64'));
  if (m.howtoBlock) {
    const b = m.howtoBlock; const pad = 16;
    const crop = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70, captureBeyondViewport: true,
      clip: { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: Math.min(width, b.w + 2 * pad), height: b.h + 2 * pad, scale: 1 } });
    files.push(`${OUT}/${name}-howto.jpg`); writeFileSync(files.at(-1), Buffer.from(crop.data, 'base64'));
  }
  const errors = events.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params.exceptionDetails.exception?.description?.split('\n')[0]);
  report.push({ name, width, ...m, howtoH2Font, otherH2, errors, files });
  console.log(JSON.stringify(report.at(-1)));
}
writeFileSync(`${OUT}/capture-result.json`, JSON.stringify(report, null, 2) + '\n');
ws.close();
