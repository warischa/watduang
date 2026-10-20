// gh#278: contrast of every zero-trigger .btn-primary, from painted pixels.
// usage: CDP_PORT=9301 BASE=http://localhost:4601 node measure.mjs <label>   -> <label>.json
// Per button: glyphs hidden (visibility:hidden on the label's children, layout kept), 2x screenshot, white label
// colour compared against the painted fill at (a) a grid over the whole button incl. the lightest corner and
// (b) a grid inside each text line's client rect (= "under its glyphs"). Emoji are painted, not tinted, and hidden too.
import { session } from './cdp-lib.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const E = new URL('.', import.meta.url).pathname;
const label = process.argv[2] || 'run';
const URL_ = `${process.env.BASE || 'http://localhost:4601'}/game/zero-trigger/play/`;
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const L = (p) => 0.2126 * lin(p[0]) + 0.7152 * lin(p[1]) + 0.0722 * lin(p[2]);
const ratio = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const hex = (p) => '#' + p.map((v) => v.toString(16).padStart(2, '0')).join('');
const parse = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return p.slice(0, 3); };
const s = await session();
const out = { label, url: URL_, chrome: await (await fetch(`http://127.0.0.1:${process.env.CDP_PORT || 9301}/json/version`)).json().then((j) => j.Browser), cells: [] };
for (const vp of [[390, 844], [320, 568]]) {
  await s.nav(URL_); await s.ev('localStorage.clear();sessionStorage.clear()'); await s.nav(URL_); await s.setVp(vp[0], vp[1], 2); await s.sleep(900);
  const iw = await s.ev('innerWidth');
  // enumerate from the built DOM, never a hand list
  const btns = await s.ev(`[...document.querySelectorAll('.btn-primary')].map((b,i)=>{b.setAttribute('data-m278',i);const h=b.closest('.screen, .modal-backdrop');return {i,id:b.id,host:h?h.id:null}})`);
  for (const b of btns) {
    // show only this button's host
    await s.ev(`(()=>{document.querySelectorAll('.screen, .modal-backdrop').forEach(e=>e.classList.remove('active'));const b=document.querySelector('[data-m278="${b.i}"]');const h=b.closest('.screen, .modal-backdrop');if(h)h.classList.add('active');b.scrollIntoView({block:'center'});[...b.children].forEach(c=>c.style.visibility='hidden');return 1})()`);
    await s.sleep(450);
    const m = await s.ev(`(()=>{const b=document.querySelector('[data-m278="${b.i}"]');const cs=getComputedStyle(b);const r=b.getBoundingClientRect();
      const lines=[];const w=document.createTreeWalker(b,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode()){if(!n.textContent.trim())continue;const rg=document.createRange();rg.selectNodeContents(n);for(const q of rg.getClientRects())lines.push([q.x,q.y,q.width,q.height])}
      const cx=r.x+r.width/2,cy=r.y+r.height/2;const top=document.elementFromPoint(cx,cy);
      return {text:b.textContent.trim(),bgImg:cs.backgroundImage,bgColor:cs.backgroundColor,color:cs.color,opacity:cs.opacity,fs:cs.fontSize,fw:cs.fontWeight,rect:[r.x,r.y,r.width,r.height],lines,topIsButton:!!top&&b.contains(top),topTag:top?top.tagName+(top.id?'#'+top.id:''):null,inViewport:r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,disabled:b.disabled}})()`);
    const [x, y, w, h] = m.rect;
    const whole = []; for (const fx of [0.05, 0.12, 0.3, 0.5, 0.7, 0.88, 0.95]) for (const fy of [0.15, 0.35, 0.5, 0.65, 0.85]) whole.push([x + w * fx, y + h * fy]);
    const glyph = []; for (const [lx, ly, lw, lh] of m.lines) for (let i = 0; i < 9; i++) for (let j = 0; j < 3; j++) glyph.push([lx + lw * (0.02 + 0.96 * i / 8), ly + lh * (0.2 + 0.6 * j / 2)]);
    const f = `${E}.m-${process.pid}.png`;
    await s.shot(f);
    const px = JSON.parse(execFileSync('python3', ['-I', E + 'sample.py', f, JSON.stringify({ dsf: 2, pts: [...whole, ...glyph] })]).toString()).pix;
    fs.unlinkSync(f);
    const tx = parse(m.color);
    const rw = px.slice(0, whole.length).map((p) => ratio(tx, p)), rg = px.slice(whole.length).map((p) => ratio(tx, p));
    const mn = (a) => (a.length ? +Math.min(...a).toFixed(2) : null);
    out.cells.push({ vp: vp[0], vpH: vp[1], iw, id: b.id, host: b.host, text: m.text, bgImg: m.bgImg, color: m.color, fs: m.fs, fw: m.fw, rect: m.rect.map((v) => +v.toFixed(1)),
      topIsButton: m.topIsButton, topTag: m.topTag, inViewport: m.inViewport, disabled: m.disabled,
      nWhole: rw.length, nGlyph: rg.length, minWhole: mn(rw), minUnderGlyphs: mn(rg),
      lightestFill: hex(px.slice(0, whole.length).reduce((a, p) => (L(p) > L(a) ? p : a))) });
    await s.ev(`[...document.querySelector('[data-m278="${b.i}"]').children].forEach(c=>c.style.visibility='')`);
  }
}
await s.close();
fs.writeFileSync(`${E}${label}.json`, JSON.stringify(out, null, 1));
for (const c of out.cells) console.log(c.vp, c.id, c.host, 'n', c.nWhole + '/' + c.nGlyph, 'whole', c.minWhole, 'glyph', c.minUnderGlyphs, 'topIsBtn', c.topIsButton, c.topTag, 'inVp', c.inViewport, c.lightestFill);
