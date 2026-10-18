// A2: every text-bearing element in the shared screen + both dialogs, painted face. node measure-a2.mjs
import { session } from './cdp-lib.mjs';
import fs from 'node:fs';
const E = new URL('.', import.meta.url).pathname;
const B = 'http://localhost:4461';
const COLLECT = (root) => `(()=>{document.querySelectorAll('[data-probe]').forEach(e=>e.removeAttribute('data-probe'));
 const ROOT=document.querySelector(${JSON.stringify(root)}); if(!ROOT) return '[]';
 const rows=[];let n=0;
 for(const e of [ROOT,...ROOT.querySelectorAll('*')]){
  const r=e.getBoundingClientRect(); const cs=getComputedStyle(e);
  const vis=r.width>0&&r.height>0&&cs.visibility!=='hidden';
  const own=[...e.childNodes].filter(c=>c.nodeType===3).map(c=>c.textContent.trim()).join('');
  const isInput=e.tagName==='INPUT'&&e.value;
  if(!vis||!(own||isInput))continue;
  e.setAttribute('data-probe',String(n));
  rows.push({n,tag:e.tagName,cls:e.getAttribute('class'),text:(own||e.value).slice(0,24),ff:cs.fontFamily,fw:cs.fontWeight});n++;}
 return JSON.stringify(rows);})()`;
const SYMBOL = /[^฀-๿A-Za-z0-9 .,!?:;'"()\-—]/; // anything beyond Thai/Latin/digits/basic punct
async function collect(s, root) {
  const rows = JSON.parse(await s.ev(COLLECT(root)));
  for (const r of rows) {
    r.painted = (await s.fonts(`[data-probe="${r.n}"]`) || []).map((x) => x.split('|')[1]);
    r.symbolChars = SYMBOL.test(r.text);
    const first = r.ff.split(',')[0].replace(/"/g, '').trim();
    const want = first === 'Mitr' ? /^Mitr-/ : first === 'Sarabun' ? /^Sarabun-/ : /^$/;
    r.first = first;
    r.pass = r.painted.length > 0 && r.painted.every((p) => want.test(p));
  }
  return rows;
}
const snap = async (s) => JSON.stringify(['.ps', '#ps-reset-dialog', '#ps-edit-dialog'].length && (await s.ev(`JSON.stringify([...document.querySelectorAll('.ps *, .ps-dialog *')].map(e=>getComputedStyle(e).fontFamily))`)));
async function run(route, vp, opener, mustRed) {
  const s = await session(); const bag = { route, vp: vp[0] };
  await s.nav(`${B}/game/${route}/play/`); await s.ev('localStorage.clear();sessionStorage.clear()'); await s.nav(`${B}/game/${route}/play/`);
  await s.setVp(vp[0], vp[1]); await s.sleep(900);
  if (opener) { await s.click(opener); await s.sleep(700); }
  bag.iw = await s.ev('innerWidth');
  bag.rootClass = await s.ev(`(()=>{const g=document.querySelector('.ps-go');let p=g.parentElement;const c=[];while(p&&p!==document.body){c.push(p.tagName+'.'+p.className);p=p.parentElement}return c.join(' < ')})()`);
  bag.screen = await collect(s, '.ps');
  if (mustRed) {
    const probeAll = async () => JSON.stringify(await Promise.all((await s.ev(`JSON.stringify([...document.querySelectorAll('.ps *')].filter(e=>e.offsetParent&&([...e.childNodes].some(c=>c.nodeType===3&&c.textContent.trim())||e.tagName==='INPUT')).map((e,i)=>(e.setAttribute('data-mr',i),i)))`)).length ? [] : []));
    const painted = async () => { const idx = JSON.parse(await s.ev(`JSON.stringify([...document.querySelectorAll('.ps *')].filter(e=>e.offsetParent&&([...e.childNodes].some(c=>c.nodeType===3&&c.textContent.trim())||e.tagName==='INPUT')).map((e,i)=>(e.setAttribute('data-mr',i),i)))`)); const o = []; for (const i of idx) o.push([await s.ev(`getComputedStyle(document.querySelector('[data-mr="${i}"]')).fontFamily`), await s.fonts(`[data-mr="${i}"]`)]); return o; };
    const before = await painted();
    const inject = async (id, css) => s.ev(`(()=>{const st=document.createElement('style');st.id=${JSON.stringify(id)};st.textContent=${JSON.stringify(css)};document.head.appendChild(st);return 1})()`);
    const ctl = `(()=>{const d=document.createElement('div');d.id='ctl';d.style.cssText='position:fixed;top:0';d.textContent='ทดสอบ abc';document.body.appendChild(d);const p=document.createElement('p');p.id='ctl2';p.style.cssText='position:fixed;top:30px;font-family:var(--font-sans)';p.textContent='ทดสอบ abc';document.body.appendChild(p);return [getComputedStyle(d).fontFamily,getComputedStyle(p).fontFamily]})()`;
    const rm = () => s.ev(`['ctl','ctl2','mr1','mr2','mr3'].forEach(i=>document.getElementById(i)?.remove())`);
    await inject('mr1', ':root{--font-display:Georgia,serif}');
    await inject('mr2', ':root{--font-sans:Georgia,serif}');
    await inject('mr3', 'body{font-family:Georgia,serif}');
    await s.sleep(300);
    bag.mustRed = { controlComputed: await s.ev(ctl) };
    const after = await painted();
    bag.mustRed.elements = before.length;
    bag.mustRed.identical = JSON.stringify(before) === JSON.stringify(after);
    bag.mustRed.flipped = before.map((b, i) => (JSON.stringify(b) !== JSON.stringify(after[i]) ? [b, after[i]] : null)).filter(Boolean);
    await rm();
  }
  // duplicate name typed in row 2 -> the limit line (.ps-limit) shows
  await s.ev(`(()=>{const f=document.querySelectorAll('.ps-n');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(f[1],f[0].value);f[1].dispatchEvent(new Event('input',{bubbles:true}))})()`); await s.sleep(500);
  bag.dupScreen = await collect(s, '.ps');
  await s.nav(`${B}/game/${route}/play/`); await s.sleep(900); await s.setVp(vp[0], vp[1]);
  if (opener) { await s.click(opener); await s.sleep(700); }
  await s.click('.ps-sec[data-ps="reset"]'); await s.sleep(500);
  bag.resetOpen = await s.ev(`document.getElementById('ps-reset-dialog').open`);
  bag.resetDialog = await collect(s, '#ps-reset-dialog');
  await s.click('#ps-reset-cancel'); await s.sleep(600);
  await s.click('.ps-go'); await s.sleep(2500);
  await s.ev(`document.dispatchEvent(new CustomEvent('watduang:edit-players'))`); await s.sleep(600);
  bag.editOpen = await s.ev(`document.getElementById('ps-edit-dialog').open`);
  if (!bag.editOpen) { await s.ev(`document.getElementById('ps-edit-dialog').showModal()`); bag.editForced = true; await s.sleep(300); }
  bag.editDialog = await collect(s, '#ps-edit-dialog');
  // saved mode: ticks, remove, undo toast, add row, count line
  await s.nav(`${B}/game/${route}/play/`); await s.sleep(900); await s.setVp(vp[0], vp[1]);
  if (opener) { await s.click(opener); await s.sleep(700); }
  bag.savedScreen = await collect(s, '.ps');
  await s.click('.ps-rm'); await s.sleep(600);
  bag.savedUndo = await collect(s, '.ps');
  await s.close();
  return bag;
}
const out = {};
for (const [route, opener] of [['short-stick', '#btn-start-setup'], ['one-bomb', null]])
  for (const vp of [[390, 844], [320, 568]]) out[`${route}@${vp[0]}`] = await run(route, vp, opener, route === 'short-stick' && vp[0] === 390);
fs.writeFileSync(E + 'A2.json', JSON.stringify(out, null, 1));
// summary: role -> painted face per class, per route; cross-route identity
const faceMap = {};
for (const [k, v] of Object.entries(out)) {
  const m = {};
  for (const part of ['screen', 'dupScreen', 'savedScreen', 'savedUndo', 'resetDialog', 'editDialog']) for (const r of v[part]) { const key = `${r.tag}.${r.cls}`; const val = `${r.first}=>${[...new Set(r.painted)].join('+')}${r.symbolChars ? ' [symbol:' + r.text + ']' : ''}`; (m[key] ||= new Set()).add(val); }
  faceMap[k] = Object.fromEntries(Object.entries(m).map(([a, b]) => [a, [...b].sort().join(' | ')]));
  const all = ['screen', 'dupScreen', 'savedScreen', 'savedUndo', 'resetDialog', 'editDialog'].flatMap((p) => v[p]);
  console.log(k, 'iw', v.iw, 'elements', all.length, 'fail(non-symbol)', all.filter((r) => !r.pass && !r.symbolChars).length, 'fail(symbol)', all.filter((r) => !r.pass && r.symbolChars).length, 'reset', v.resetOpen, 'edit', v.editOpen, 'forced', !!v.editForced);
  for (const r of all.filter((r) => !r.pass)) console.log('   NOPASS', r.tag, r.cls, JSON.stringify(r.text), r.first, r.painted.join('+'));
}
const keys = Object.keys(faceMap);
const ref = JSON.stringify(faceMap[keys[0]]);
console.log('cross-route/viewport identical class->face map:', keys.every((k) => JSON.stringify(faceMap[k]) === ref));
for (const k of keys.slice(1)) if (JSON.stringify(faceMap[k]) !== ref) { for (const c of new Set([...Object.keys(faceMap[k]), ...Object.keys(faceMap[keys[0]])])) if (faceMap[k][c] !== faceMap[keys[0]][c]) console.log('   DIFF', k, c, '|', faceMap[k][c], '| vs |', faceMap[keys[0]][c]); }
console.log(JSON.stringify(out['short-stick@390'].mustRed));
console.log(JSON.stringify(faceMap['short-stick@390'], null, 0));
