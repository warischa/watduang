// Reload-from-mid-page CLS on `/`, base vs head, same sequence as ../browser/probe.mjs scrollReveal().
// Usage: CDP_PORT=9555 OUT=<file> node run.mjs   (legs: base :4344, head :4345)
import { writeFileSync } from 'node:fs';
const PORT = process.env.CDP_PORT || 9555, OUT = process.env.OUT;
const LEGS = { base: 'http://localhost:4344', head: 'http://localhost:4345' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tgt = await (await fetch(`http://localhost:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tgt.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const cdp = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: `(()=>{${expr}})()`, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result.result.value; };
const REC = `window.__cls=0;window.__clsAll=0;window.__src=[];
try{new PerformanceObserver((l)=>{for(const e of l.getEntries()){window.__clsAll+=e.value;if(!e.hadRecentInput)window.__cls+=e.value;
window.__src.push({v:+e.value.toFixed(4),t:Math.round(e.startTime),inp:e.hadRecentInput,s:(e.sources||[]).map(x=>({n:(x.node&&x.node.nodeType===1)?(x.node.tagName.toLowerCase()+(x.node.id?'#'+x.node.id:'')+(typeof x.node.className==='string'&&x.node.className?'.'+x.node.className.trim().split(/\\s+/).join('.'):'')).slice(0,80):String(x.node),p:[x.previousRect.x,x.previousRect.y,x.previousRect.width,x.previousRect.height].map(Math.round),c:[x.currentRect.x,x.currentRect.y,x.currentRect.width,x.currentRect.height].map(Math.round)}))});}}).observe({type:'layout-shift',buffered:true});}catch(e){}`;
await cdp('Page.enable');
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: REC });
const results = [];
async function once(leg, W, lane) {
  const H = W === 320 ? 640 : 844, red = lane === 'reduced';
  const emu = async () => { await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: red ? 'reduce' : 'no-preference' }] });
    await cdp('Emulation.setFocusEmulationEnabled', { enabled: true }); };
  const waitLoad = async () => { for (let i = 0; i < 40; i++) { await sleep(250); if ((await ev('return document.readyState')) === 'complete') break; } };
  await emu(); await cdp('Page.navigate', { url: LEGS[leg] + '/' }); await waitLoad(); await emu(); await sleep(250);
  const first = await ev(`const e=document.querySelector('.reveal-pending'); if(e){const t=e.getBoundingClientRect().top+scrollY; scrollTo(0,Math.max(0,t-innerHeight*0.5));} return {pending:document.querySelectorAll('.reveal-pending').length, cls:+window.__cls.toFixed(4)}`);
  await sleep(900);
  await ev(`scrollTo(0,(document.documentElement.scrollHeight-innerHeight)/2);return 1`); await sleep(300);
  const pre = await ev(`return {scrollY, sh:document.documentElement.scrollHeight, reduce:matchMedia('(prefers-reduced-motion: reduce)').matches, iw:innerWidth}`);
  await cdp('Page.reload'); await waitLoad(); await emu(); await sleep(900);
  const post = await ev(`return {nav:performance.getEntriesByType('navigation')[0].type, scrollY, cls:+window.__cls.toFixed(4), clsAll:+window.__clsAll.toFixed(4), src:window.__src}`);
  return { leg, W, lane, loadPending: first.pending, loadCls: first.cls, pre, ...post };
}
for (let n = 0; n < 5; n++) for (const W of [320, 390]) for (const lane of ['normal', 'reduced']) for (const leg of ['base', 'head']) {
  const r = await once(leg, W, lane); r.n = n; results.push(r);
  writeFileSync(OUT, JSON.stringify(results, null, 1));
}
await cdp('Target.closeTarget', { targetId: tgt.id }); ws.close();
console.log('done', results.length);
