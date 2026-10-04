// Capture the whole /c/party/ cards grid at a given width via CDP (Chrome on 9222), after scrolling
// every card into view so every lazy image has loaded. usage: node gridshot.mjs <width> <out.png>
import { writeFile } from 'node:fs/promises';
const [w, out] = [Number(process.argv[2]), process.argv[3]];
const t = await (await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pend = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.result.value;
await send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: w < 768 });
await send('Page.enable');
await send('Page.navigate', { url: 'http://localhost:4321/c/party/' });
await new Promise((r) => setTimeout(r, 1500));
const info = await ev(`(async()=>{for(const c of document.querySelectorAll('.game-card')){c.scrollIntoView();await new Promise(r=>setTimeout(r,120));}
  await Promise.all([...document.querySelectorAll('img.game-card-art')].map(i=>i.complete?0:new Promise(r=>i.onload=i.onerror=r)));
  const g=document.querySelector('.cards-grid').getBoundingClientRect(); const imgs=[...document.querySelectorAll('img.game-card-art')];
  return {innerWidth, x:g.x+scrollX, y:g.y+scrollY, w:g.width, h:g.height, loaded:imgs.filter(i=>i.complete&&i.naturalWidth>0).length, n:imgs.length};})()`);
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: info.x, y: info.y, width: info.w, height: info.h, scale: 1 } });
await writeFile(out, Buffer.from(shot.result.data, 'base64'));
console.log(JSON.stringify(info));
await send('Target.closeTarget', { targetId: t.id }).catch(() => {});
process.exit(0);
