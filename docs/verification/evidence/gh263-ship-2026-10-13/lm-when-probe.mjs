// gh#263 ship 2026-10-13: .lm-when at 26px — line count + overflow on the meet screen, and /tool/wheel/ body ground.
// Adapted from docs/verification/evidence/gh263-code/probe.mjs (raw CDP). Args: <out.json> <serve> <cdp>
import { writeFileSync } from 'node:fs';
const [OUT, SERVE = '4461', CDP = '9361'] = process.argv.slice(2);
const base = `http://127.0.0.1:${SERVE}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const target = await (await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const pending = new Map(); const events = [];
ws.addEventListener('message', (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } else events.push(msg); });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, (msg) => (msg.error ? rej(new Error(method + ': ' + msg.error.message)) : res(msg.result))); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; };
await send('Page.enable'); await send('Runtime.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__r = null; const __orig = Math.random; Math.random = () => (window.__r === null ? __orig() : window.__r);' });
async function nav(url, width, mobile) { events.length = 0; await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile }); await send('Page.navigate', { url }); for (let t = 0; t < 100 && !events.some((e) => e.method === 'Page.loadEventFired'); t++) await wait(100); await ev('document.fonts.ready.then(() => 1)'); await wait(600); }
const readWhen = () => ev(`(() => { const e = document.querySelector('.lm-when'); if (!e) return null; const s = getComputedStyle(e); const r = e.getBoundingClientRect();
  const lh = parseFloat(s.lineHeight); const p = e.parentElement.getBoundingClientRect();
  return { text: e.textContent, size: s.fontSize, lineHeight: s.lineHeight, boxH: Math.round(r.height*100)/100, lines: Math.round(r.height / lh), w: Math.round(r.width), parentW: Math.round(p.width),
    elScroll: e.scrollWidth, elClient: e.clientWidth, innerWidth, docScroll: document.documentElement.scrollWidth, docClient: document.documentElement.clientWidth }; })()`);
const out = { builtAt: new Date().toISOString(), runs: [] };
for (const [width, mobile] of [[320, true], [1440, false]]) {
  await nav(base + '/tool/wheel/', width, mobile);
  out.runs.push({ page: '/tool/wheel/', width, bodyBg: await ev('getComputedStyle(document.body).backgroundColor'), innerWidth: await ev('innerWidth') });
  for (const [band, r] of [[0, 0.1], [4, 0.9], [5, 0.1], [5, 0.9]]) {
    await nav(base + '/game/love-match/', width, mobile);
    await ev(`document.querySelector('#lm-me-f').click(); document.querySelector('#lm-band-${band}').click(); 1`);
    await wait(700);
    await ev(`window.__r = ${r}; document.querySelector('#lm-go').click(); window.__r = null; 1`);
    await wait(400); await ev('document.fonts.ready.then(() => 1)');
    out.runs.push({ page: '/game/love-match/', width, band, r, when: await readWhen() });
  }
}
out.exceptions = events.filter((e) => e.method === 'Runtime.exceptionThrown').length;
writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
for (const x of out.runs) console.log(JSON.stringify(x));
await fetch(`http://127.0.0.1:${CDP}/json/close/${target.id}`); ws.close();
