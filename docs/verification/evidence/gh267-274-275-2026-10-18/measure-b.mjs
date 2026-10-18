// B: cursed-number .ps-go fill + accent text ratios. usage: node measure-b.mjs
import { session } from './cdp-lib.mjs';
import fs from 'node:fs';
const E = new URL('.', import.meta.url).pathname;
const B = 'http://localhost:4461';
const URL_ = `${B}/game/cursed-number/play/`;
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const L = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
export const ratio = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const over = (fg, a, bg) => fg.map((v, i) => v * a + bg[i] * (1 - a));
const hex = (r) => '#' + r.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const MEASURE = (sel) => `(()=>{
  const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null;
  const cs=getComputedStyle(e);
  const chain=[];let n=e.parentElement;let effOp=parseFloat(cs.opacity);
  let p=e.parentElement; while(p){effOp*=parseFloat(getComputedStyle(p).opacity);p=p.parentElement}
  while(n){const c=getComputedStyle(n);chain.push({tag:n.tagName+(n.id?'#'+n.id:'')+(n.className&&typeof n.className==='string'?'.'+n.className.split(' ')[0]:''),bg:c.backgroundColor,img:c.backgroundImage});n=n.parentElement}
  const r=e.getBoundingClientRect();
  return {text:e.textContent.trim().slice(0,20),disabled:e.disabled===true,bg:cs.backgroundColor,color:cs.color,opacity:cs.opacity,effOpacity:effOp,fs:cs.fontSize,fw:cs.fontWeight,chain,rect:{x:r.x,y:r.y,w:r.width,h:r.height},inDialog:!!e.closest('dialog')};})()`;
const parse = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) throw new Error('color ' + s); const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { rgb: p.slice(0, 3), a: p[3] ?? 1 }; };
import { execFileSync } from 'node:child_process';
export function analyse(m, label, px) {
  // px: sampled painted pixels BEHIND the element (element hidden), grid over its rect
  const bg = parse(m.bg), tx = parse(m.color), a = m.effOpacity;
  const rows = px.map((bd) => {
    const fillOnBd = over(bg.rgb, bg.a, bd);
    const textOnFill = over(tx.rgb, tx.a, fillOnBd);
    const fillF = over(fillOnBd, a, bd), textF = over(textOnFill, a, bd);
    const hasFill = bg.a > 0;
    return { bd, fillF, textF, rFill: ratio(textF, fillF), rBd: ratio(over(tx.rgb, a * tx.a, bd), bd) };
  });
  const mm = (f) => { const v = rows.map(f); return [+Math.min(...v).toFixed(2), +Math.max(...v).toFixed(2)]; };
  return { label, text: m.text, disabled: m.disabled, bg: m.bg, color: m.color, opacity: m.opacity, effOpacity: a, fs: m.fs, fw: m.fw,
    backdropSampleN: px.length, backdropFirst: hex(px[0]), backdropMid: hex(px[Math.floor(px.length / 2)]),
    fillFinalMid: hex(rows[Math.floor(rows.length / 2)].fillF), textFinalMid: hex(rows[Math.floor(rows.length / 2)].textF),
    ratioTextVsFill: mm((r) => r.rFill), ratioTextVsBackdrop: mm((r) => r.rBd), rect: m.rect, inDialog: m.inDialog };
}
let shotN = 0;
async function behind(s, sel, dsf = 2) {
  // hide the element, screenshot, sample a grid over its rect
  await s.ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.scrollIntoView({block:'center'});e.style.visibility='hidden';return 1})()`);
  await s.sleep(250);
  const r = await s.ev(`(()=>{const q=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return [q.x,q.y,q.width,q.height,devicePixelRatio]})()`);
  const f = `${E}.bd-${process.pid}-${shotN++}.png`;
  await s.shot(f);
  const res = JSON.parse(execFileSync('python3', ['-I', E + 'sample.py', f, JSON.stringify(r)]).toString());
  fs.unlinkSync(f);
  await s.ev(`document.querySelector(${JSON.stringify(sel)}).style.visibility=''`);
  return res.pts;
}
async function meas(s, sel, label) {
  const m = await s.ev(MEASURE(sel));
  if (!m) return null;
  return analyse(m, label, await behind(s, sel));
}
const out = { rows: [], accents: {} };
async function fresh(s, vp, dsf = 1) { await s.nav(URL_); await s.ev('localStorage.clear();sessionStorage.clear()'); await s.nav(URL_); await s.setVp(vp[0], vp[1], dsf); await s.sleep(900); }
const setVal = (sel, idx, val) => `(()=>{const e=document.querySelectorAll(${JSON.stringify(sel)})[${idx}];const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(e,${JSON.stringify(val)});e.dispatchEvent(new Event('input',{bubbles:true}));return e.value})()`;
const s = await session();
for (const vp of [[390, 844], [320, 568]]) {
  const reps = vp[0] === 390 ? 3 : 1;
  for (let i = 0; i < reps; i++) {
    await fresh(s, vp, 2);
    out.rows.push({ vp: vp[0], rep: i + 1, iw: await s.ev('innerWidth'), ...(await meas(s, '.ps-go', 'enabled')) });
    if (i === 0) await s.shot(`${E}B-${vp[0]}-enabled.png`);
  }
  // disabled through the real UI: type the first row's name into the second row -> duplicate -> start refused
  await fresh(s, vp, 2);
  const first = await s.ev(`document.querySelectorAll('.ps-n')[0].value`);
  await s.ev(setVal('.ps-n', 1, first)); await s.sleep(500);
  out.rows.push({ vp: vp[0], rep: 1, via: 'real UI (duplicate name typed into row 2)', ...(await meas(s, '.ps-go', 'disabled')) });
  out.accents[`dupLimit@${vp[0]}`] = await meas(s, '.ps-limit', 'dup-limit-line');
  await s.shot(`${E}B-${vp[0]}-disabled.png`);
  // reset dialog -> danger button
  await fresh(s, vp, 2); await s.sleep(500);
  await s.click('.ps-sec[data-ps="reset"]'); await s.sleep(600);
  out.accents[`danger@${vp[0]}`] = await meas(s, '.ps-danger', 'danger');
  await s.shot(`${E}B-${vp[0]}-resetdialog.png`);
  await s.click('#ps-reset-cancel'); await s.sleep(500);
  // saved mode: start once (seats stored), reload, screen opens with ticks
  await fresh(s, vp, 2); await s.sleep(500);
  await s.click('.ps-go'); await s.sleep(1500);
  await s.nav(URL_); await s.setVp(vp[0], vp[1], 2); await s.sleep(1000);
  out.accents[`ticksPresent@${vp[0]}`] = await s.ev(`document.querySelectorAll('.ps-tick').length`);
  out.accents[`tick-i@${vp[0]}`] = await meas(s, ".ps-tick[aria-pressed='true'] i", 'tick-i');
  out.accents[`limitB-count@${vp[0]}`] = await meas(s, '.ps-limit b', 'limit-b (saved, enough ticked)');
  out.rows.push({ vp: vp[0], rep: 1, via: 'saved mode, enough ticked', ...(await meas(s, '.ps-go', 'enabled-saved')) });
  // untick down below the minimum through the real ticks: start goes disabled by a second path
  for (let k = 0; k < 10; k++) { const dis = await s.ev(`document.querySelector('.ps-go').disabled`); if (dis) break; await s.click(".ps-tick[aria-pressed='true']"); await s.sleep(250); }
  out.accents[`limitB-under@${vp[0]}`] = await meas(s, '.ps-limit b', 'limit-b (under minimum)');
  out.rows.push({ vp: vp[0], rep: 1, via: 'saved mode, unticked below min', ...(await meas(s, '.ps-go', 'disabled-under-min')) });
  await s.click('.ps-tick:not([aria-pressed="true"])'); await s.sleep(300);
  await s.click('.ps-rm'); await s.sleep(600);
  out.accents[`undo@${vp[0]}`] = await meas(s, '.ps-undo', 'undo');
  await s.shot(`${E}B-${vp[0]}-saved-undo.png`);
}
await s.close();
fs.writeFileSync(E + 'B.json', JSON.stringify(out, null, 1));
const line = (r) => `${r.vp ?? ''} ${r.rep ?? ''} ${r.via ?? ''} ${r.label} dis=${r.disabled} bg=${r.bg} color=${r.color} op=${r.opacity}/${r.effOpacity} fs=${r.fs}/${r.fw} fillMid=${r.fillFinalMid} textMid=${r.textFinalMid} bdMid=${r.backdropMid} rFill=${r.ratioTextVsFill} rBd=${r.ratioTextVsBackdrop}`;
for (const r of out.rows) console.log(line(r));
for (const [k, r] of Object.entries(out.accents)) console.log(k, typeof r === 'object' && r ? line(r) : r);
