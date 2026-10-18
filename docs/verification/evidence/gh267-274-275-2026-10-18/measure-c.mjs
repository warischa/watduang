// C: zero-trigger #btn-big-action gradient pixels + state fills. usage: node measure-c.mjs
import { session } from './cdp-lib.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const E = new URL('.', import.meta.url).pathname;
const U = 'http://localhost:4461/game/zero-trigger/play/';
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const Lm = (p) => 0.2126 * lin(p[0]) + 0.7152 * lin(p[1]) + 0.0722 * lin(p[2]);
const ratio = (a, b) => { const x = Lm(a), y = Lm(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const stat = (v) => ({ n: v.length, min: +Math.min(...v).toFixed(2), max: +Math.max(...v).toFixed(2) });
const STATE = `(()=>{const b=document.getElementById('btn-big-action');const c=getComputedStyle(b);const t=document.getElementById('action-btn-main-text'),u=document.getElementById('action-btn-sub-text');const rr=(e)=>{const q=e.getBoundingClientRect();return [q.x,q.y,q.width,q.height]};return {cls:b.className,bgImage:c.backgroundImage,bgColor:c.backgroundColor,color:c.color,opacity:c.opacity,main:{text:t.textContent,color:getComputedStyle(t).color,fs:getComputedStyle(t).fontSize,fw:getComputedStyle(t).fontWeight},sub:{text:u.textContent,color:getComputedStyle(u).color,fs:getComputedStyle(u).fontSize,fw:getComputedStyle(u).fontWeight},rBtn:rr(b),rMain:rr(t),rSub:rr(u),iw:innerWidth}})()`;
async function pixelsAt(s, rect, dsf, mode = 'grid') {
  const f = `${E}.c-${process.pid}.png`; await s.shot(f);
  const py = `from PIL import Image;import json;im=Image.open('${f}').convert('RGB');x,y,w,h=${JSON.stringify(rect)};d=${dsf};pts=[]
mode='${mode}'
if mode=='diag':
  for i in range(60):
    t=i/59; pts.append(im.getpixel((int((x+w*(0.22+0.56*t))*d),int((y+h*(0.22+0.56*t))*d))))
else:
  for i in range(11):
    for j in range(6):
      pts.append(im.getpixel((min(im.width-1,int((x+w*(0.10+0.80*i/10))*d)),min(im.height-1,int((y+h*(0.25+0.50*j/5))*d)))))
print(json.dumps(pts))`;
  const r = JSON.parse(execFileSync('python3', ['-I', '-c', py]).toString()); fs.unlinkSync(f); return r;
}
const out = {};
const s = await session();
for (const vp of [[390, 844], [320, 568]]) {
  await s.nav(U); await s.ev('localStorage.clear();sessionStorage.clear()'); await s.nav(U); await s.setVp(vp[0], vp[1], 2); await s.sleep(900);
  await s.sleep(500); out.quick = await s.click('#btn-quick-start'); await s.sleep(1500);
  // step through setup screens if the round is not yet on screen
  for (let k = 0; k < 3; k++) { const v = await s.ev(`document.getElementById('btn-big-action').offsetParent!==null`); if (v) break; await s.click('#btn-confirm-start-game'); await s.sleep(1200); }
  const st = await s.ev(STATE);
  await s.ev(`document.getElementById('btn-big-action').scrollIntoView({block:'center'})`); await s.sleep(300);
  const st2 = await s.ev(STATE);
  await s.shot(`${E}C-${vp[0]}-start.png`);
  // hide glyphs (transparent text) to read the pure background, grid over button
  await s.ev(`(()=>{const st=document.createElement('style');st.id='noglyph';st.textContent='#btn-big-action *{color:transparent!important;text-shadow:none!important}';document.head.appendChild(st)})()`); await s.sleep(250);
  const bgPx = await pixelsAt(s, st2.rBtn, 2, 'diag');
  const gridPx = await pixelsAt(s, st2.rBtn, 2, 'grid');
  const mainPx = await pixelsAt(s, st2.rMain, 2);
  const subPx = await pixelsAt(s, st2.rSub, 2);
  await s.ev(`document.getElementById('noglyph').remove()`);
  const white = [255, 255, 255];
  const rec = { vp: vp[0], iw: st2.iw, state: st2, ratios: {
    buttonDiagonal60: stat(bgPx.map((p) => ratio(white, p))), buttonInteriorGrid: stat(gridPx.map((p) => ratio(white, p))),
    startLabelRect: stat(mainPx.map((p) => ratio(white, p))),
    subtextRect: stat(subPx.map((p) => ratio(white, p))) }, bgFirstLast: [bgPx[0], bgPx[bgPx.length - 1]] };
  // drive the round: click START -> locked -> stop
  await s.click('#btn-big-action'); await s.sleep(250);
  rec.locked = await s.ev(STATE); await s.shot(`${E}C-${vp[0]}-locked.png`);
  await s.sleep(1300);
  rec.stop = await s.ev(STATE); await s.shot(`${E}C-${vp[0]}-stop.png`);
  out[vp[0]] = rec;
}
await s.close();
fs.writeFileSync(E + 'C.json', JSON.stringify(out, null, 1));
for (const vp of [390, 320]) { const r = out[vp]; console.log(vp, 'iw', r.iw, 'start', r.state.cls, r.state.bgImage, 'color', r.state.color, 'main', r.state.main.fs + '/' + r.state.main.fw, r.state.main.color, 'sub', r.state.sub.fs + '/' + r.state.sub.fw, r.state.sub.color);
  console.log('  ratios', JSON.stringify(r.ratios), 'ends', JSON.stringify(r.bgFirstLast));
  console.log('  locked', r.locked.cls, r.locked.bgImage, r.locked.bgColor, '| stop', r.stop.cls, r.stop.bgImage, r.stop.bgColor, r.stop.main.text); }
