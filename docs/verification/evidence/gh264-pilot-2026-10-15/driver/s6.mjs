import { connect, SNAP } from './lib.mjs';
const dir = process.argv[2];
const s = await connect(); const out = {};
const seed = async (path, names) => {
  await s.nav(path); await s.wipe();
  await s.ev(`localStorage.setItem('watduang:roster', ${JSON.stringify(JSON.stringify(names))}); return 1`);
  await s.nav(path); await s.sleep(700);
};
// (b) 320x568 saved roster, 3 names, timebomb
out.view320 = await s.view(320, 568);
await seed('/game/timebomb/play/', ['ต้น', 'มายด์', 'บอส']);
out.scroll3 = await s.ev(`const g=document.querySelector('[data-ps=start]').getBoundingClientRect();
  const de=document.documentElement; const maxScroll=Math.max(de.scrollHeight,document.body.scrollHeight)-innerHeight;
  return {iw:innerWidth,ih:innerHeight,startTop:g.top,startBottom:g.bottom,scrollY:scrollY,docH:de.scrollHeight,bodyH:document.body.scrollHeight,needScroll:Math.max(0,Math.ceil(g.bottom-innerHeight)),maxScroll,
    scroller:[...document.querySelectorAll('*')].filter(e=>e.scrollHeight>e.clientHeight+1&&['auto','scroll'].includes(getComputedStyle(e).overflowY)).map(e=>e.id||e.className).slice(0,5)}`);
// actually scroll with a touch drag and verify start reachable fully
await s.ev('window.scrollTo(0,0); return 1');
out.scrollTo = await s.ev(`window.scrollTo(0, 1e5); await new Promise(r=>setTimeout(r,100)); const g=document.querySelector('[data-ps=start]').getBoundingClientRect(); return {scrollY, startBottom:g.bottom, ih:innerHeight, fullyVisible:g.bottom<=innerHeight && g.top>=0}`);
await s.ev('window.scrollTo(0,0); return 1');
await s.shot(`${dir}/tb-saved-3names-320x568.png`);
await s.shotFull(`${dir}/tb-saved-3names-320x568-fullpage.png`);
// first-visit 320 scroll for reference
await s.wipe(); await s.nav('/game/timebomb/play/'); await s.sleep(600);
out.scrollFirst320 = await s.ev(`const g=document.querySelector('[data-ps=start]').getBoundingClientRect();return {startBottom:g.bottom,ih:innerHeight,need:Math.max(0,Math.ceil(g.bottom-innerHeight))}`);
// (7) cursed-number dialog rect + contrast + undo bar
for (const [w, h] of [[390, 844], [320, 568]]) {
  await s.view(w, h);
  await seed('/game/cursed-number/play/', ['ต้น', 'มายด์', 'บอส', 'แนน']);
  await s.tap('.ps-rm', { nth: 1, settle: 150 });
  await s.shot(`${dir}/cn-saved-undo-bar-${w}.png`);
  out[`cnToast${w}`] = await s.ev(`const t=document.querySelector('[data-ps=toast]').getBoundingClientRect();return [t.left,t.top,t.right,t.bottom,innerWidth,innerHeight]`);
  await s.sleep(4500);
  await s.tap('[data-ps=start]', { settle: 700 });
  await s.tap('#startGameBtn', { settle: 1200 });
  await s.sleep(600);
  await s.tap('#play-edit-players', { noScroll: true, settle: 600 });
  out[`cnDialogRect${w}`] = await s.ev(`const d=document.querySelector('#ps-edit-dialog');const r=d.getBoundingClientRect();const cs=getComputedStyle(d);return {open:d.open,rect:[r.left,r.top,r.width,r.height],margin:cs.margin,position:cs.position,inset:cs.inset,innerWidth,innerHeight}`);
  // compare: the reset dialog on a first-visit cursed-number (same dialog class)
  await s.sleep(500);
  await s.tap('#ps-edit-cancel', { noScroll: true, settle: 800 });
  // disabled start contrast
  out[`cnDisabledContrast${w}`] = null;
}
await s.view(390, 844);
await seed('/game/cursed-number/play/', ['ต้น', 'มายด์']);
await s.tap('.ps-tick', { nth: 0 }); await s.sleep(450);
out.cnDisabledStart = await s.ev(`
  const lin=c=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4)};
  const L=a=>0.2126*lin(a[0])+0.7152*lin(a[1])+0.0722*lin(a[2]);
  const b=document.querySelector('[data-ps=start]');const cs=getComputedStyle(b);
  const fg=cs.color.match(/[\\d.]+/g).map(Number), bg=cs.backgroundColor.match(/[\\d.]+/g).map(Number);
  // blend at opacity over page bg approximated as #0a0612 for the disabled state
  const o=parseFloat(cs.opacity); const page=[10,6,18];
  const mix=(c)=>c.slice(0,3).map((v,i)=>v*o+page[i]*(1-o));
  const rf=(a,c)=>{const x=L(a),y=L(c);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)};
  return {dis:b.disabled,opacity:o,ratioNominal:rf(fg,bg),ratioBlendedApprox:rf(mix(fg),mix(bg))}`);
// timebomb start contrast too
await seed('/game/timebomb/play/', ['ต้น', 'มายด์']);
out.tbStartContrast = await s.ev(`
  const lin=c=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4)};
  const L=a=>0.2126*lin(a[0])+0.7152*lin(a[1])+0.0722*lin(a[2]);
  const b=document.querySelector('[data-ps=start]');const cs=getComputedStyle(b);
  const fg=cs.color.match(/[\\d.]+/g).map(Number), bg=cs.backgroundColor.match(/[\\d.]+/g).map(Number);
  const rf=(a,c)=>{const x=L(a),y=L(c);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)};
  return {color:cs.color,bg:cs.backgroundColor,ratio:rf(fg,bg)}`);
out.errors = s.errors;
console.log(JSON.stringify(out)); await s.close();
