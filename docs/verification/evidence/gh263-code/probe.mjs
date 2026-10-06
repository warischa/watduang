// gh#263 items 2 and 3 — computed-style probe over raw CDP (recipe: docs/agents/raw-cdp-capture.md).
// Needs a built dist/ served and a Chrome listening. Run from the repo root:
//   node docs/verification/evidence/gh263-code/probe.mjs <out.json> [serve-port=4461] [cdp-port=9361]
// 390 uses mobile emulation, 1440 is desktop emulation; --window-size is never used.
import { writeFileSync } from 'node:fs';

const [OUT, SERVE = '4461', CDP = '9361'] = process.argv.slice(2);
const base = `http://127.0.0.1:${SERVE}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const target = await (await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
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
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
await send('Page.enable'); await send('Runtime.enable'); await send('DOM.enable'); await send('CSS.enable');
// love-match draws with Math.random; window.__r pins it so each outcome is reached on purpose.
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: 'window.__r = null; const __orig = Math.random; Math.random = () => (window.__r === null ? __orig() : window.__r);',
});

async function nav(url, width, mobile) {
  events.length = 0;
  await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile });
  await send('Page.navigate', { url });
  for (let t = 0; t < 100 && !events.some((e) => e.method === 'Page.loadEventFired'); t++) await wait(100);
  await ev('document.fonts.ready.then(() => 1)');
  await wait(600);
}
const platformFonts = async (selector) => {
  const doc = await send('DOM.getDocument', { depth: -1 });
  const q = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector });
  if (!q.nodeId) return null;
  return (await send('CSS.getPlatformFontsForNode', { nodeId: q.nodeId })).fonts.map((f) => `${f.postScriptName || f.familyName} x${f.glyphCount}`).join(', ');
};
const read = (selector) => ev(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null;
  const s = getComputedStyle(e); const r = e.getBoundingClientRect();
  return { text: e.textContent.trim().slice(0, 30), className: e.className, family: s.fontFamily, weight: s.fontWeight, size: s.fontSize,
    lineHeight: s.lineHeight, boxH: Math.round(r.height * 100) / 100, innerWidth, scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth }; })()`);

const out = { builtAt: new Date().toISOString(), runs: [] };
for (const [width, mobile] of [[390, true], [1440, false]]) {
  for (const path of ['/tool/wheel/', '/tool/number/']) {
    await nav(base + path, width, mobile);
    const sel = '#how-to-use h2';
    out.runs.push({ page: path, width, mobile, which: 'how-to-use h2', style: await read(sel), fonts: await platformFonts(sel) });
  }
  await nav(base + '/game/love-match/', width, mobile);
  const sel = '.lm-heading';
  const step = async (which) => out.runs.push({ page: '/game/love-match/', width, mobile, which, style: await read(sel), fonts: await platformFonts(sel) });
  await step('ask');
  await ev(`document.querySelector('#lm-me-f').click(); document.querySelector('#lm-band-1').click(); 1`);
  await wait(700); // out-wait the arm window; the open control stays disabled until it ends
  await ev(`window.__r = 0.1; document.querySelector('#lm-go').click(); window.__r = null; 1`);
  await wait(400); await ev('document.fonts.ready.then(() => 1)'); await step('meet');
  await wait(700);
  await ev(`document.querySelector('#lm-again').click(); 1`);
  await wait(700);
  await ev(`window.__r = 0.9; document.querySelector('#lm-go').click(); window.__r = null; 1`);
  await wait(400); await ev('document.fonts.ready.then(() => 1)'); await step('self');
}
out.exceptions = events.filter((e) => e.method === 'Runtime.exceptionThrown').length;
writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
for (const r of out.runs) console.log(r.page, r.width, r.which, r.style && `${r.style.className}|${r.style.weight}|${r.style.size}|${r.style.lineHeight}|${r.style.family.split(',')[0]}`, '|', r.fonts);
await fetch(`http://127.0.0.1:${CDP}/json/close/${target.id}`);
ws.close();
