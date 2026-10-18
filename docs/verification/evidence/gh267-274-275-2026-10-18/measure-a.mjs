// A: shared player screen painted faces. usage: node measure-a.mjs  (needs serve 4461 + chrome 9461)
import { session } from './cdp-lib.mjs';
import fs from 'node:fs';
const E = new URL('.', import.meta.url).pathname;
const B = 'http://localhost:4461';
const out = {};
const COLLECT = (root) => `(()=>{document.querySelectorAll('[data-probe]').forEach(e=>e.removeAttribute('data-probe'));const ROOT=document.querySelector(${JSON.stringify(root)});if(!ROOT)return '[]';
  const all=[...ROOT.querySelectorAll('*')].filter(e=>/(^|\\s)ps-/.test(e.getAttribute('class')||''));
  const rows=[];let n=0;
  for(const e of all){
    const r=e.getBoundingClientRect(); const vis=r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden';
    const own=[...e.childNodes].some(c=>c.nodeType===3&&c.textContent.trim());
    const isInput=e.tagName==='INPUT';
    if(!vis||!(own||isInput))continue;
    e.setAttribute('data-probe',String(n));
    rows.push({n,tag:e.tagName,cls:e.getAttribute('class'),text:(e.value??e.textContent).trim().slice(0,24),ff:getComputedStyle(e).fontFamily,fw:getComputedStyle(e).fontWeight});n++;
  }
  return JSON.stringify(rows);})()`;
async function collect(s, label, bag, root = 'body') {
  const rows = JSON.parse(await s.ev(COLLECT(root)));
  for (const r of rows) r.painted = await s.fonts(`[data-probe="${r.n}"]`);
  bag[label] = rows;
}
async function run(route, vp, opener) {
  const s = await session();
  const bag = {};
  await s.nav(`${B}/game/${route}/play/`); await s.ev('localStorage.clear();sessionStorage.clear()'); await s.nav(`${B}/game/${route}/play/`); await s.setVp(vp[0], vp[1]); await s.sleep(900);
  if (opener) { await s.click(opener); await s.sleep(700); }
  await s.shot(`${E}A-${route}-${vp[0]}-screen.png`);
  bag.innerWidth = await s.ev('innerWidth');
  await collect(s, 'screen', bag, '.ps-go' && 'body');
  if (route === 'short-stick' && vp[0] === 390) {
    const goFonts = async () => JSON.stringify(await s.fonts('.ps-go'));
    await s.ev(`(()=>{const e=document.querySelector('.ps-go');e.setAttribute('data-probe','go');return 1})()`);
    bag.mustRed = { before: await s.fonts('.ps-go'), beforeFF: await s.ev(`getComputedStyle(document.querySelector('.ps-go')).fontFamily`) };
    await s.ev(`(()=>{const st=document.createElement('style');st.id='mustred';st.textContent=':root{--font-display:Georgia,serif}';document.head.appendChild(st);return 1})()`);
    await s.sleep(300);
    bag.mustRed.after = await s.fonts('.ps-go');
    bag.mustRed.afterFF = await s.ev(`getComputedStyle(document.querySelector('.ps-go')).fontFamily`);
    bag.mustRed.controlFlipsOnGeorgia = await s.ev(`(()=>{const p=document.createElement('p');p.style.cssText='font-family:var(--font-display);position:fixed;top:0';p.textContent='พร้อมเล่น';p.id='ctl';document.body.appendChild(p);return getComputedStyle(p).fontFamily})()`);
    bag.mustRed.controlPainted = await s.fonts('#ctl');
    await s.ev(`document.getElementById('ctl').remove();document.getElementById('mustred').remove()`);
  }
  // reset dialog
  await s.click('.ps-sec[data-ps="reset"]'); await s.sleep(500);
  bag.resetOpen = await s.ev(`document.getElementById('ps-reset-dialog').open`);
  await s.shot(`${E}A-${route}-${vp[0]}-reset.png`);
  await collect(s, 'resetDialog', bag, '#ps-reset-dialog');
  await s.click('#ps-reset-cancel'); await s.sleep(600);
  // start a round, then ask to edit players -> edit dialog
  await s.sleep(500);
  bag.goClick = await s.click('.ps-go'); await s.sleep(2500);
  await s.ev(`document.dispatchEvent(new CustomEvent('watduang:edit-players'))`); await s.sleep(600);
  bag.editOpen = await s.ev(`document.getElementById('ps-edit-dialog').open`);
  if (!bag.editOpen) { await s.ev(`document.getElementById('ps-edit-dialog').showModal()`); bag.editForced = true; await s.sleep(300); }
  await s.shot(`${E}A-${route}-${vp[0]}-edit.png`);
  await collect(s, 'editDialog', bag, '#ps-edit-dialog');
  await s.close();
  return bag;
}
for (const [route, opener] of [['short-stick', '#btn-start-setup'], ['one-bomb', null]])
  for (const vp of [[390, 844], [320, 568]]) out[`${route}@${vp[0]}`] = await run(route, vp, opener);
fs.writeFileSync(E + 'A.json', JSON.stringify(out, null, 1));
const sum = {};
for (const [k, v] of Object.entries(out)) {
  const pairs = new Set();
  for (const part of ['screen', 'resetDialog', 'editDialog']) for (const r of v[part] || []) pairs.add(`${part}|${r.cls}|${r.ff.split(',')[0]}|${(r.painted || []).map(x=>x.split('|')[1]).join('+')}`);
  sum[k] = { iw: v.innerWidth, resetOpen: v.resetOpen, editOpen: v.editOpen, editForced: v.editForced, goClick: v.goClick, mustRed: v.mustRed, faces: [...pairs] };
}
fs.writeFileSync(E + 'A-summary.json', JSON.stringify(sum, null, 1));
console.log(JSON.stringify(sum['short-stick@390'], null, 1));
