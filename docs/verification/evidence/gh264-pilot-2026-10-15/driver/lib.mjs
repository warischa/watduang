// CDP helper: real touch taps, typed text, true viewport emulation.
import { writeFile } from 'node:fs/promises';
export const BASE = 'http://localhost:4391';
const PORT = 9391;
export async function connect() {
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  let id = 0; const pending = new Map(); let loadRes = null; const errors = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); return; }
    if (m.method === 'Page.loadEventFired' && loadRes) { loadRes(); loadRes = null; }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text);
  });
  await new Promise((r) => ws.addEventListener('open', r));
  const send = (method, params = {}) => new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
  await send('Page.enable'); await send('Runtime.enable');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const s = {
    errors, sleep, send,
    async ev(body) {
      const r = await send('Runtime.evaluate', { expression: `(async()=>{${body}})()`, awaitPromise: true, returnByValue: true });
      if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.exception?.description };
      return r.result?.result?.value;
    },
    async nav(path, settle = 900) {
      const p = new Promise((r) => { loadRes = r; });
      await send('Page.navigate', { url: BASE + path }); await p; await sleep(settle);
    },
    async view(w, h) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: true });
      await send('Emulation.setTouchEmulationEnabled', { enabled: true });
      await sleep(300);
      return s.ev('return [innerWidth, innerHeight]');
    },
    async wipe() { await s.ev('localStorage.clear(); sessionStorage.clear(); return 1'); },
    async tapXY(x, y) {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    },
    // scroll into view, locate centre by selector (+ optional text match), real touch tap
    async tap(sel, { text, nth = 0, settle = 350, noScroll = false } = {}) {
      const pos = await s.ev(`
        const els=[...document.querySelectorAll(${JSON.stringify(sel)})].filter(e=>!${JSON.stringify(text ?? null)}||e.textContent.includes(${JSON.stringify(text ?? '')}));
        const e=els[${nth}]; if(!e) return null;
        if(!${noScroll}) e.scrollIntoView({block:'center'});
        await new Promise(r=>setTimeout(r,60));
        const b=e.getBoundingClientRect(); return {x:b.left+b.width/2,y:b.top+b.height/2,dis:!!e.disabled};`);
      if (!pos) return { missing: sel };
      await s.tapXY(pos.x, pos.y); await sleep(settle); return pos;
    },
    async type(sel, nth, text) {
      const pos = await s.ev(`const e=document.querySelectorAll(${JSON.stringify(sel)})[${nth}]; e.scrollIntoView({block:'center'}); await new Promise(r=>setTimeout(r,60)); const b=e.getBoundingClientRect(); return {x:b.left+b.width/2,y:b.top+b.height/2};`);
      await s.tapXY(pos.x, pos.y); await sleep(200);
      await s.ev(`const e=document.activeElement; if(e&&e.select) e.select(); return 1`);
      await send('Input.insertText', { text }); await sleep(150);
    },
    async shot(path) {
      await s.ev('window.scrollTo(0,0); return 1');
      const r = await send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path, Buffer.from(r.result.data, 'base64'));
    },
    async shotFull(path) {
      const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      await writeFile(path, Buffer.from(r.result.data, 'base64'));
    },
    async close() { await fetch(`http://127.0.0.1:${PORT}/json/close/${t.id}`); ws.close(); },
  };
  return s;
}
export const SNAP = `
  const vis=e=>{if(!e)return false;const b=e.getBoundingClientRect();const c=getComputedStyle(e);return b.width>0&&b.height>0&&c.display!=='none'&&c.visibility!=='hidden'};
  const q=s=>document.querySelector(s);
  const root=q('.ps');
  const rows=[...document.querySelectorAll('.ps-p')].map(li=>({n:li.querySelector('.ps-n')?.value,e:li.querySelector('.ps-e')?.textContent,tick:li.querySelector('.ps-tick')?.getAttribute('aria-pressed')??null,sit:!!li.querySelector('.ps-sit')}));
  return {url:location.pathname,rootVisible:vis(root),attr:document.documentElement.getAttribute('data-player-screen'),
   count:q('[data-ps=count]')&&vis(q('[data-ps=count]'))?q('[data-ps=count-num]').textContent:null,
   decDis:q('[data-ps=dec]')?.disabled,incDis:q('[data-ps=inc]')?.disabled,
   limit:vis(q('[data-ps=limit]'))?q('[data-ps=limit]').textContent:null,
   addVis:vis(q('[data-ps=add]')),startDis:q('[data-ps=start]')?.disabled,startVis:vis(q('[data-ps=start]')),
   resetVis:vis(q('[data-ps=reset]')),toast:vis(q('[data-ps=toast]'))?q('[data-ps=toast-text]').textContent:null,
   rows,roster:localStorage.getItem('watduang:roster'),group:localStorage.getItem('watduang:group'),legacy:localStorage.getItem('watduang:timebomb-players'),
   editVis:vis(q('#play-edit-players')),editDis:q('#play-edit-players')?.disabled,
   dlg:[...document.querySelectorAll('dialog')].filter(d=>d.open).map(d=>d.id),
   fuse:!!q('#tb-fuse'),stageVisible:vis(q('#tb-stage')),innerWidth:innerWidth,scrollW:document.documentElement.scrollWidth};`;
