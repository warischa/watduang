// painted-pixel cross-check of .ps-go fill (enabled vs disabled) away from glyphs
import { session } from './cdp-lib.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const E = new URL('.', import.meta.url).pathname;
const B = 'http://localhost:4461/game/cursed-number/play/';
const s = await session();
await s.nav(B); await s.ev('localStorage.clear()'); await s.nav(B); await s.setVp(390, 844, 2); await s.sleep(900);
const res = {};
for (const state of ['enabled', 'disabled']) {
  if (state === 'disabled') { await s.ev(`(()=>{const f=document.querySelectorAll('.ps-n');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(f[1],f[0].value);f[1].dispatchEvent(new Event('input',{bubbles:true}))})()`); await s.sleep(500); }
  await s.ev(`document.querySelector('.ps-go').scrollIntoView({block:'center'})`); await s.sleep(250);
  const r = await s.ev(`(()=>{const q=document.querySelector('.ps-go').getBoundingClientRect();return [q.x,q.y,q.width,q.height]})()`);
  const f = `${E}.cc.png`; await s.shot(f);
  const py = `from PIL import Image;import json;im=Image.open('${f}').convert('RGB');x,y,w,h=${JSON.stringify(r)};pts=[im.getpixel((int((x+w*fx)*2),int((y+h*fy)*2))) for fx in (0.06,0.1,0.9,0.94) for fy in (0.25,0.5,0.75)];print(json.dumps(pts))`;
  res[state] = JSON.parse(execFileSync('python3', ['-I', '-c', py]).toString());
  fs.unlinkSync(f);
}
await s.close();
fs.writeFileSync(E + 'B-painted-crosscheck.json', JSON.stringify(res));
const hex = (p) => '#' + p.map((v) => v.toString(16).padStart(2, '0')).join('');
for (const k of Object.keys(res)) console.log(k, [...new Set(res[k].map(hex))].join(' '));
