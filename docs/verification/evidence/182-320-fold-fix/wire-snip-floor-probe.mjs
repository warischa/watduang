const BASE='http://localhost:4173';
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const NAMES=['QQAAX','QQBBY','QQCCZ'];
const SEED=`localStorage.setItem('watduang:roster', ${JSON.stringify(JSON.stringify(NAMES))});localStorage.setItem('watduang:group', ${JSON.stringify(JSON.stringify(NAMES))});return true;`;
const READ=`
 const q=(s)=>document.querySelector(s);
 const r=(s)=>{const e=q(s); if(!e) return null; const b=e.getBoundingClientRect(); return {top:+b.top.toFixed(1), bot:+b.bottom.toFixed(1), h:+b.height.toFixed(1)};};
 return {btn:r('#btn-trigger-scan'), chassis:r('#bomb-chassis'), bay:r('#wires-bay'), col:r('.wire-column'),
   svg:r('.wire-svg-wrap'), label:r('.wire-label-tag'), lcd:r('.bomb-lcd'), banner:r('#turn-action-banner'),
   hitAtBtnTop: (()=>{const b=q('#btn-trigger-scan').getBoundingClientRect(); const y=Math.min(566,b.top+5);
     const e=document.elementFromPoint(160,y); return e? e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+(e.className&&typeof e.className==='string'?'.'+e.className.trim().split(/\\s+/).join('.'):'') : null;})(),
   hitAt510: (()=>{const e=document.elementFromPoint(160,510); return e? e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+(e.className&&typeof e.className==='string'?'.'+e.className.trim().split(/\\s+/).join('.'):'') : null;})()};`;
const INJECT=(css)=>`
 let st=document.getElementById('floor-inject');
 if(!st){st=document.createElement('style');st.id='floor-inject';document.head.appendChild(st);}
 st.textContent=${JSON.stringify('')} + ${JSON.stringify(css)};
 return true;`;
const TIER=`
 #screen-game{padding-block:6px;gap:6px}
 .hud-player-strip{padding-block-end:4px}
 .hud-status-bar{padding-block:2px}
 .bomb-chassis{min-height:0;padding:8px}
 .bomb-lcd{padding-block:4px;margin-bottom:4px}
 .timer-bar-wrap{margin-bottom:4px}
 .wires-bay{padding-block:4px;min-block-size:0}
 .wire-column{min-block-size:0}
 .wire-svg-wrap{min-block-size:0}
 .turn-action-banner{padding-block:8px}`;
export default async function main(session){
  const url=BASE+'/game/wire-snip-panic/play/';
  await session.nav(url); await session.setWidth(320,568); await session.wipe();
  await session.evaluate(SEED);
  await session.nav(url); await session.setWidth(320,568); await sleep(1500);
  const before=(await session.evaluate(READ)).value;
  await session.evaluate(INJECT(TIER)); await sleep(400);
  const floor=(await session.evaluate(READ)).value;
  await session.evaluate(INJECT('')); await sleep(400);
  const back=(await session.evaluate(READ)).value;
  return {before, floor, back};
}
