import { connect, SNAP } from './lib.mjs';
const W = +process.argv[2], H = +process.argv[3], dir = process.argv[4];
const s = await connect(); const out = {};
const store = () => s.ev("return [localStorage.getItem('watduang:roster'),localStorage.getItem('watduang:group')]");
const slim = (x) => ({ rows: x.rows.map((r) => `${r.n}|${r.tick}|${r.sit ? 'sit' : ''}`), limit: x.limit, startDis: x.startDis, toast: x.toast, addVis: x.addVis, count: x.count, root: x.rootVisible, edit: x.editVis, dlg: x.dlg, attr: x.attr, w: [x.innerWidth, x.scrollW] });
await s.view(W, H);
// timebomb first, saved roster via UI
await s.nav('/game/timebomb/play/'); await s.wipe();
await s.nav('/game/timebomb/play/'); await s.sleep(500);
await s.type('.ps-n', 0, 'ไก่ชน'); await s.sleep(450);
await s.tap('[data-ps=start]'); await s.sleep(500);
out.afterTimebomb = await store();
// ---- item 4: cursed-number
await s.nav('/game/cursed-number/play/'); await s.sleep(600);
let x = await s.ev(SNAP); out.cnCarry = slim(x); out.cnDisplay = x;
delete out.cnDisplay;
await s.shot(`${dir}/cn-saved-${W}.png`);
// contrast of start button (enabled)
out.contrast = await s.ev(`
  const lin=c=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4)};
  const parse=s=>{const m=s.match(/[\\d.]+/g).map(Number);return m};
  const L=a=>0.2126*lin(a[0])+0.7152*lin(a[1])+0.0722*lin(a[2]);
  const b=document.querySelector('[data-ps=start]'); const cs=getComputedStyle(b);
  const fg=parse(cs.color), bg=parse(cs.backgroundColor);
  const ratio=(a,c)=>{const x=L(a),y=L(c);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)};
  return {color:cs.color,bg:cs.backgroundColor,bgImage:cs.backgroundImage,opacity:cs.opacity,fontSize:cs.fontSize,fontWeight:cs.fontWeight,ratio:ratio(fg,bg.slice(0,3)),bgAlpha:bg[3]}`);
// toggle untick one, add players up to 20
await s.tap('.ps-tick', { nth: 0 }); await s.tap('.ps-tick', { nth: 1 }); await s.tap('.ps-tick', { nth: 2 });
out.cnUnder = slim(await s.ev(SNAP));
await s.shot(`${dir}/cn-saved-under-${W}.png`);
await s.tap('.ps-tick', { nth: 0 }); await s.tap('.ps-tick', { nth: 1 }); await s.tap('.ps-tick', { nth: 2 });
out.contrastDisabled = null;
for (let i = 0; i < 20; i++) { const r = await s.tap('[data-ps=add]', { settle: 80 }); if (r.dis) break; }
x = await s.ev(SNAP); out.cn20 = slim(x); out.cn20.addDis = await s.ev("return document.querySelector('[data-ps=add]').disabled");
out.cn20.tickedCount = x.rows.filter((r) => r.tick === 'true').length;
await s.shot(`${dir}/cn-saved-20-${W}.png`);
await s.sleep(500);
await s.tap('[data-ps=start]', { settle: 900 });
out.cn20Start = { storage: await store() };
out.cn20StartParsed = JSON.parse(out.cn20Start.storage[0]).length + '/' + JSON.parse(out.cn20Start.storage[1]).length;
delete out.cn20Start;
out.cnAfterStart = await s.ev(`const v=e=>{if(!e)return null;const b=e.getBoundingClientRect();return b.width>0&&getComputedStyle(e).display!=='none'};return {setupRoot:v(document.querySelector('.ps')),handoff:v(document.querySelector('#screenHandoff')),selection:v(document.querySelector('#screenSelection')),name:document.querySelector('#handoffPlayerName')?.textContent,strip:document.querySelectorAll('#handoffPlayerStrip > *').length}`);
await s.shot(`${dir}/cn-options-${W}.png`);
await s.sleep(500);
await s.tap('#startGameBtn', { settle: 1200 });
out.cnAfterGameStart = await s.ev(`const v=e=>{if(!e)return null;const b=e.getBoundingClientRect();return b.width>0&&getComputedStyle(e).display!=='none'};return {options:v(document.querySelector('#screenSetup')),handoff:v(document.querySelector('#screenHandoff')),name:document.querySelector('#handoffPlayerName')?.textContent,strip:document.querySelectorAll('#handoffPlayerStrip > *').length}`);
await s.shot(`${dir}/cn-round-${W}.png`);
// mid-round edit on cursed-number
await s.sleep(500);
out.cnEdit = await s.ev("const b=document.querySelector('#play-edit-players');return b?{hidden:b.hidden,dis:b.disabled}:null");
await s.tap('#play-edit-players', { noScroll: true, settle: 500 });
out.cnDialog = await s.ev("const d=document.querySelector('#ps-edit-dialog');return {open:d.open,title:d.querySelector('h2').textContent}");
await s.shot(`${dir}/cn-edit-dialog-${W}.png`);
await s.sleep(500);
await s.tap('#ps-edit-confirm', { noScroll: true, settle: 900 });
out.cnAfterConfirm = slim(await s.ev(SNAP));
await s.shot(`${dir}/cn-saved-after-confirm-${W}.png`);
// first-visit cursed-number
await s.wipe(); await s.nav('/game/cursed-number/play/'); await s.sleep(600);
x = await s.ev(SNAP); out.cnFirst = slim(x);
await s.shot(`${dir}/cn-first-${W}.png`);
for (let i = 0; i < 20; i++) await s.tap('[data-ps=inc]', { settle: 60 });
out.cnFirstMax = await s.ev("return [document.querySelector('[data-ps=count-num]').textContent,document.querySelector('[data-ps=inc]').disabled,document.querySelectorAll('.ps-p').length]");
await s.shot(`${dir}/cn-first-max-${W}.png`);
for (let i = 0; i < 20; i++) await s.tap('[data-ps=dec]', { settle: 60 });
out.cnFirstMin = await s.ev("return [document.querySelector('[data-ps=count-num]').textContent,document.querySelector('[data-ps=dec]').disabled,document.querySelectorAll('.ps-p').length]");
// ---- over-max state on timebomb: roster of 12
await s.ev(`localStorage.setItem('watduang:roster', JSON.stringify(${JSON.stringify(Array.from({ length: 12 }, (_, i) => 'ผู้เล่น' + (i + 1)))})); return 1`);
await s.nav('/game/timebomb/play/'); await s.sleep(700);
out.over = slim(await s.ev(SNAP));
await s.shot(`${dir}/tb-saved-over-${W}.png`);
out.errors = s.errors;
console.log(JSON.stringify(out)); await s.close();
