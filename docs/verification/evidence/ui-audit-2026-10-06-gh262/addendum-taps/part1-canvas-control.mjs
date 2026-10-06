// gh#262 addendum, part 1: positive control — do design/*.dc.html artboards still render headless from file://?
// run from the repo root: CDP_PORT=9321 OUT=<dir> node <this file>
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const PORT = process.env.CDP_PORT || 9222, OUT = process.env.OUT || '.';
const CASES = [['design/ToolWheel390.dc.html', 390, 844], ['design/HomeShelf320.dc.html', 320, 640]];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const res = {};
for (const [file, w, h] of CASES) {
  const tgt = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(tgt.webSocketDebuggerUrl); let id = 0; const pend = new Map(); let loadRes; const log = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) pend.get(m.id)(m);
    if (m.method === 'Page.loadEventFired' && loadRes) loadRes();
    if (m.method === 'Runtime.exceptionThrown') log.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 200));
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) log.push('CONSOLE.' + m.params.type + ' ' + m.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 200));
    if (m.method === 'Log.entryAdded') log.push(`LOG.${m.params.entry.level} ${m.params.entry.text} ${m.params.entry.url || ''}`.slice(0, 250));
    if (m.method === 'Network.loadingFailed') log.push('NETFAIL ' + m.params.errorText + ' ' + (m.params.requestId));
    if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) log.push(`HTTP ${m.params.response.status} ${m.params.response.url}`);
    if (m.method === 'Network.requestWillBeSent') (log.reqs ||= {})[m.params.requestId] = m.params.request.url;
  });
  await new Promise((r) => ws.addEventListener('open', r));
  const send = (method, params = {}) => new Promise((r) => { pend.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  for (const d of ['Page', 'DOM', 'CSS', 'Runtime', 'Log', 'Network']) await send(d + '.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  const p = new Promise((r) => { loadRes = r; });
  const url = pathToFileURL(file).href; await send('Page.navigate', { url }); await p; await sleep(2500);
  const ev = async (body) => (await send('Runtime.evaluate', { expression: `(async()=>{${body}})()`, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const meas = await ev(`const b=document.body; const h1=document.querySelector('h1'); const r=b.getBoundingClientRect();
    return { innerWidth, title: document.title, bodyEls: b.querySelectorAll('*').length, allEls: document.querySelectorAll('*').length,
      bodyH: Math.round(r.height), bodyTextLen: b.innerText.length, h1: h1 ? h1.textContent.trim().slice(0,60) : null,
      xdc: !!document.querySelector('x-dc'), supportJsDefined: typeof window.DC !== 'undefined' || !!document.querySelector('x-dc')?.shadowRoot,
      fontsLoaded: [...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family+' '+f.weight), scripts: [...document.scripts].map(s=>s.src) }`);
  let fonts = 'no h1';
  const doc = await send('DOM.getDocument', { depth: 0 });
  const q = await send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: 'h1' });
  if (q.result?.nodeId) { const f = await send('CSS.getPlatformFontsForNode', { nodeId: q.result.nodeId }); fonts = f.result?.fonts?.map((x) => `${x.familyName} / ${x.postScriptName} (${x.glyphCount} glyphs, custom=${x.isCustomFont})`); }
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70 });
  const name = file.split('/').pop().replace('.dc.html', '');
  await writeFile(`${OUT}/part1-${name}-${w}.jpg`, Buffer.from(shot.result.data, 'base64'));
  const named = log.map((l) => l.replace(/NETFAIL (.*) (\S+)$/, (_, e, rid) => `NETFAIL ${e} ${log.reqs?.[rid] || rid}`));
  res[name] = { url, ...meas, h1PlatformFonts: fonts, consoleAndNet: named };
  await fetch(`http://127.0.0.1:${PORT}/json/close/${tgt.id}`); ws.close();
}
await writeFile(`${OUT}/part1-result.json`, JSON.stringify(res, null, 1));
console.log(JSON.stringify(res, null, 1));
