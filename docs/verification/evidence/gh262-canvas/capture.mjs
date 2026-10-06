// Full-page captures of the gh#262 canvas boards from file://, raw CDP (recipe: docs/agents/raw-cdp-capture.md).
// Needs a headless Chrome already listening: --remote-debugging-port=9341. Run from the repo root:
//   node docs/verification/evidence/gh262-canvas/capture.mjs
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT = 'docs/verification/evidence/gh262-canvas';
const BOARDS = [
  ['ToolNumber390', 390], ['ToolNumberDesktop', 1440],
  ['NotFound320', 320], ['NotFoundDesktop', 1440],
  ['ToolWheel390', 390], ['ToolWheelDesktop', 1440],
  ['Gh262Proposals', 1440],
];

const targets = await (await fetch('http://127.0.0.1:9341/json/list')).json();
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
  await send('Page.navigate', { url: 'file://' + resolve('design', name + '.dc.html') });
  for (let t = 0; t < 100 && !events.some((e) => e.method === 'Page.loadEventFired'); t++) await new Promise((r) => setTimeout(r, 100));
  await evalJs(`(()=>{const s=document.createElement('style');s.textContent='*{animation:none!important;transition:none!important}';document.head.appendChild(s);return 1})()`);
  await evalJs('document.fonts.ready.then(()=>1)');
  await new Promise((r) => setTimeout(r, 400));
  const m = await evalJs(`({innerWidth, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth,
    height: Math.ceil(document.querySelector("x-dc > div").getBoundingClientRect().bottom), elements: document.body.querySelectorAll('*').length,
    mitr600: document.fonts.check('600 26px Mitr'), notoThai: document.fonts.check('400 16px "Noto Sans Thai"')})`);
  const doc = await send('DOM.getDocument', { depth: -1 });
  const q = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'h1' });
  let h1Font = null;
  if (q.nodeId) h1Font = (await send('CSS.getPlatformFontsForNode', { nodeId: q.nodeId })).fonts.map((f) => `${f.postScriptName || f.familyName} x${f.glyphCount}`).join(', ');
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70, captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: m.height, scale: 1 } });
  const file = `${OUT}/${name}.jpg`;
  writeFileSync(file, Buffer.from(shot.data, 'base64'));
  const errors = events.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params.exceptionDetails.exception?.description?.split('\n')[0]);
  report.push({ name, width, ...m, h1Font, errors, file });
  console.log(JSON.stringify(report.at(-1)));
}
writeFileSync(`${OUT}/capture-result.json`, JSON.stringify(report, null, 2) + '\n');
ws.close();
