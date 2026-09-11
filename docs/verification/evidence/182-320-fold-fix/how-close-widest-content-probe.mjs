const BASE='http://localhost:4173';
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const NAMES=['QQAAX','QQBBY','QQCCZ'];
const SEED=`localStorage.setItem('watduang:roster', ${JSON.stringify(JSON.stringify(NAMES))});localStorage.setItem('watduang:group', ${JSON.stringify(JSON.stringify(NAMES))});return true;`;
const click=(sel)=>`const b=document.querySelector(${JSON.stringify(sel)}); if(!b) return {ok:false,why:'missing'}; if(b.disabled) return {ok:false,why:'disabled'}; b.click(); return {ok:true};`;
const READ=`
 const q=(s)=>document.querySelector(s);
 const rect=(s)=>{const e=q(s); if(!e) return null; const b=e.getBoundingClientRect(); return {top:+b.top.toFixed(1), bot:+b.bottom.toFixed(1), h:+b.height.toFixed(1)};};
 const se=document.scrollingElement;
 return {vp:[innerWidth,innerHeight], submit:rect('#btnSubmitNumber'), disp:rect('#numberDisplay'),
   dispText:(q('#numberDisplay')||{}).textContent, box:rect('.number-display-box'),
   numBtn:rect('.num-btn'), page:{c:se.clientHeight,s:se.scrollHeight},
   visible: (()=>{const b=q('#btnSubmitNumber').getBoundingClientRect(); return +Math.max(0,Math.min(b.bottom,innerHeight)-Math.max(b.top,0)).toFixed(1);})()};`;
async function drive(session,w,h){
  const url=BASE+'/game/how-close-is-near/play/';
  await session.nav(url); await session.setWidth(w,h); await session.wipe();
  await session.evaluate(SEED);
  await session.nav(url); await session.setWidth(w,h); await sleep(1500);
  for (const sel of ['#btnStartGame','#btnAckSecrecy','#btnReadyForTurn']) { await sleep(700); await session.evaluate(click(sel)); }
  await sleep(800);
  const empty=(await session.evaluate(READ)).value;
  // type the widest plausible entry: three digits
  for (const d of ['9','8','7']) { await session.evaluate(`const bs=[...document.querySelectorAll('.num-btn')].filter(b=>b.textContent.trim()===${JSON.stringify(d)}); if(bs[0]) bs[0].click(); return true;`); await sleep(120); }
  await sleep(400);
  const typed=(await session.evaluate(READ)).value;
  return {empty, typed};
}
export default async function main(session){
  return { '320x568': await drive(session,320,568), '390x844': await drive(session,390,844) };
}
