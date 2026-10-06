// gh#262 addendum, part 2: post-interaction states of /tool/wheel/ and /tool/number/, 320 + 1440, reduced-motion on.
// run from the repo root: CDP_PORT=9321 BASE=http://localhost:4421 OUT=<dir> node scripts/driver.mjs <this file>
// driver.mjs gives nav/setWidth/evaluate/tap; it has no raw send(), so a SECOND websocket attaches to the SAME tab
// (found via /json/list by url) for Emulation.setEmulatedMedia, CSS.getPlatformFontsForNode and clipped jpeg shots.
import { writeFile } from 'node:fs/promises';
const PORT = process.env.CDP_PORT || 9222, BASE = process.env.BASE, OUT = process.env.OUT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export default async function (s) {
  const rows = []; const notes = [];
  await s.nav(BASE + '/tool/wheel/');
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const tab = list.find((t) => t.type === 'page' && t.url.startsWith(BASE));
  const ws = new WebSocket(tab.webSocketDebuggerUrl); let id = 0; const pend = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) pend.get(m.id)(m); });
  await new Promise((r) => ws.addEventListener('open', r));
  const send = (method, params = {}) => new Promise((r) => { pend.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  for (const d of ['DOM', 'CSS', 'Page']) await send(d + '.enable');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const ev = async (body) => { const r = await s.evaluate(body); if (r.error) throw new Error(JSON.stringify(r.error)); return r.value; };
  const fonts = async (sel) => {
    const doc = await send('DOM.getDocument', { depth: 0 });
    const q = await send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: sel });
    const f = await send('CSS.getPlatformFontsForNode', { nodeId: q.result.nodeId });
    return f.result.fonts.map((x) => `${x.postScriptName} (${x.glyphCount} glyphs)`);
  };
  const measure = (sel) => ev(`const e=document.querySelector('${sel}'); const r=e.getBoundingClientRect(); const cs=getComputedStyle(e);
    const de=document.documentElement;
    return { innerWidth, rm: matchMedia('(prefers-reduced-motion: reduce)').matches, scrollW: de.scrollWidth, clientW: de.clientWidth,
      w: +r.width.toFixed(1), h: +r.height.toFixed(1), text: e.textContent.trim(), color: cs.color, bg: cs.backgroundColor,
      fontFamily: cs.fontFamily.slice(0,60), fontSize: cs.fontSize, fontWeight: cs.fontWeight, display: cs.display, visibility: cs.visibility,
      minH: cs.minHeight, padding: cs.padding };`);
  const shot = async (sel, file) => {
    const box = await ev(`const e=document.querySelector('${sel}'); e.scrollIntoView({block:'center'}); await new Promise(r=>setTimeout(r,300)); const r=e.closest('section')?.getBoundingClientRect() || e.getBoundingClientRect(); return { x:0, y:r.top+scrollY, width:innerWidth, height:Math.min(r.height,900) };`);
    const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70, captureBeyondViewport: true, clip: { ...box, scale: 1 } });
    await writeFile(`${OUT}/${file}`, Buffer.from(r.result.data, 'base64'));
  };
  // tap = real touch at the element's centre, after scrolling it into view; returns the point
  const tapEl = async (sel) => {
    const pt = await ev(`const e=document.querySelector('${sel}'); e.scrollIntoView({block:'center'}); await new Promise(r=>setTimeout(r,300)); const r=e.getBoundingClientRect(); return { x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2), top:document.elementFromPoint(Math.round(r.left+r.width/2), Math.round(r.top+r.height/2))?.closest('#'+e.id)?.id || 'MISS' };`);
    if (pt.top === 'MISS') throw new Error('tap point does not land on ' + sel);
    await s.tap(pt.x, pt.y); await sleep(600); return pt;
  };
  for (const w of [320, 1440]) {
    // ---- wheel
    await s.setWidth(w, w < 640 ? 640 : 900, w < 640);
    await s.nav(BASE + '/tool/wheel/'); await s.wipe(); await s.nav(BASE + '/tool/wheel/');
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await ev(`const t=document.getElementById('name-input'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'แก้ม\\nบีม\\nนุ่น\\nต้น'); t.dispatchEvent(new Event('input',{bubbles:true}));`);
    const tapStart = await tapEl('#name-start');
    const spinEnabled = await ev(`return !document.getElementById('wheel-spin').disabled`);
    const before = await measure('#wheel-result'); before.spinEnabled = spinEnabled; before.fontsPainted = await fonts('#wheel-result');
    await shot('#wheel-result', `wheel-before-${w}.jpg`);
    const tapSpin = await tapEl('#wheel-spin');
    const after = await measure('#wheel-result'); after.fontsPainted = await fonts('#wheel-result');
    after.note = await ev(`return document.getElementById('wheel-note').textContent.trim().slice(0,80)`);
    await shot('#wheel-result', `wheel-after-${w}.jpg`);
    rows.push({ tool: 'wheel', width: w, state: 'before-spin', ...before }, { tool: 'wheel', width: w, state: 'after-1-spin', ...after });
    notes.push({ tool: 'wheel', width: w, tapStart, tapSpin });
    // ---- number
    await s.nav(BASE + '/tool/number/'); await s.wipe(); await s.nav(BASE + '/tool/number/');
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    const nb = await measure('#number-result'); nb.goEnabled = await ev(`return !document.getElementById('number-go').disabled`);
    nb.fontsPainted = await fonts('#number-result');
    await shot('#number-result', `number-before-${w}.jpg`);
    const tapGo = await tapEl('#number-go');
    const na = await measure('#number-result'); na.fontsPainted = await fonts('#number-result');
    na.note = await ev(`return document.getElementById('number-note').textContent.trim().slice(0,80)`);
    await shot('#number-result', `number-after-${w}.jpg`);
    rows.push({ tool: 'number', width: w, state: 'before-press', ...nb }, { tool: 'number', width: w, state: 'after-1-press', ...na });
    notes.push({ tool: 'number', width: w, tapGo });
  }
  await writeFile(`${OUT}/part2-result.json`, JSON.stringify({ n: 1, base: BASE, rows, notes, consoleErrors: s.consoleErrors }, null, 1));
  ws.close();
  return { rows, notes, consoleErrors: s.consoleErrors };
}
