// Renders design/Gh295Privacy.dc.html from file:// at 1600 wide on CDP 9333, after document.fonts.ready.
// Writes the full-page PNG and a JSON report (console/log errors, font statuses, overflow, U+25CC count, policy text).
import { writeFile } from 'node:fs/promises';
const [boardPath, pngOut, jsonOut] = process.argv.slice(2);
const PORT = 9333;
const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const errors = [];
let loaded = null;
const send = (method, params = {}) => new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Page.loadEventFired' && loaded) { loaded(); loaded = null; }
  if (m.method === 'Runtime.exceptionThrown') errors.push({ ch: 'exception', text: m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text });
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push({ ch: 'console.error', text: JSON.stringify(m.params.args?.map((a) => a.value)) });
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push({ ch: 'log', source: m.params.entry.source, text: m.params.entry.text, url: m.params.entry.url });
});
await new Promise((r) => ws.addEventListener('open', r));
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
const p = new Promise((r) => { loaded = r; });
await send('Page.navigate', { url: 'file://' + boardPath });
await p;
const ev = async (body) => (await send('Runtime.evaluate', { expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true })).result?.result?.value;
const report = await ev(`
  await document.fonts.ready;
  const faces = [...document.fonts].map(f => f.family + ' ' + f.weight + ' ' + f.status);
  const de = document.documentElement;
  const txt = document.body.innerText;
  const dotted = (txt.match(/\\u25CC/g) || []).length;
  const pol = (id) => document.getElementById(id).innerText;
  return { innerWidth, scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, scrollHeight: de.scrollHeight, faces, dotted,
           policy1440: pol('policy-1440'), policy390: pol('policy-390') };
`);
await new Promise((r) => setTimeout(r, 500));
const h = report.scrollHeight;
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: h, deviceScaleFactor: 1, mobile: false });
await new Promise((r) => setTimeout(r, 500));
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: 1600, height: h, scale: 1 } });
await writeFile(pngOut, Buffer.from(shot.result.data, 'base64'));
report.errors = errors;
await writeFile(jsonOut, JSON.stringify(report, null, 2));
await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
ws.close();
console.log(JSON.stringify({ ...report, policy1440: report.policy1440.length, policy390: report.policy390.length }, null, 1));
