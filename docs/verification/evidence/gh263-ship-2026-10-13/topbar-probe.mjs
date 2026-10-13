const [SERVE, CDP] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const target = await (await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const pending = new Map(); const events = [];
ws.addEventListener('message', (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } else events.push(msg); });
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result.result.value;
await send('Page.enable');
const read = `(() => { const t = document.querySelector('.game-topbar'); const cs = getComputedStyle(t);
  return { H: t.getBoundingClientRect().height, minH: cs.minHeight, pad: cs.padding, display: cs.display, wrap: cs.flexWrap, kids: [...t.children].map((c) => { const r = c.getBoundingClientRect(); const s = getComputedStyle(c); return c.tagName + '.' + c.className + ' h' + Math.round(r.height) + ' top' + Math.round(r.top) + ' disp ' + s.display + ' hidden ' + c.hidden; }) }; })()`;
for (const [w, mob] of [[320, true], [1440, false]]) {
  events.length = 0; await send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: mob });
  await send('Page.navigate', { url: `http://127.0.0.1:${SERVE}/game/love-match/` });
  for (let t = 0; t < 100 && !events.some((e) => e.method === 'Page.loadEventFired'); t++) await wait(100); await wait(800);
  console.log(w, 'NOW', JSON.stringify(await ev(read)));
  await ev(`(() => { const s = document.createElement('style'); s.textContent = '.game-topbar a{min-height:0 !important;min-width:0 !important;min-block-size:24px !important}'; document.head.append(s); return 1; })()`);
  console.log(w, 'OLD-LINK-RULE', JSON.stringify(await ev(read)));
}
await fetch(`http://127.0.0.1:${CDP}/json/close/${target.id}`); ws.close();
