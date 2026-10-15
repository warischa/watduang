import { connect } from './lib.mjs';
const W = +process.argv[2], H = +process.argv[3], dir = process.argv[4];
const s = await connect(); const out = {};
await s.view(W, H);
const probe = `
  const v=e=>{if(!e)return null;const b=e.getBoundingClientRect();return b.width>0&&b.height>0&&getComputedStyle(e).display!=='none'};
  return {path:location.pathname,ps:!!document.querySelector('.ps, #ps-template, dialog#ps-edit-dialog'),psAttr:document.documentElement.getAttribute('data-player-screen'),
    dlSetup:v(document.querySelector('#dl-setup')),dlNames:[...document.querySelectorAll('.dl-player-name')].map(i=>i.value),dlCount:document.querySelector('#dl-count-num')?.textContent,
    dlPlay:v(document.querySelector('#dl-play')),
    crocSetup:v(document.querySelector('#btn-start-game')),crocNames:[...document.querySelectorAll('input[type=text]')].map(i=>i.value),
    editVis:v(document.querySelector('#play-edit-players')),flag:Object.keys(sessionStorage),
    roster:localStorage.getItem('watduang:roster'),group:localStorage.getItem('watduang:group'),
    bodyText:document.body.innerText.slice(0,160).replace(/\\n/g,' | ')}`;
async function seed() {
  await s.nav('/game/dice-loser/play/'); await s.wipe();
  await s.ev(`localStorage.setItem('watduang:roster', ${JSON.stringify(JSON.stringify(['ก้อง', 'ข้าว', 'ค้อน']))}); localStorage.setItem('watduang:group', ${JSON.stringify(JSON.stringify(['ก้อง', 'ข้าว', 'ค้อน']))}); localStorage.setItem('watduang:timebomb-players', JSON.stringify({count:2,names:['x','y']})); return 1`);
}
await seed();
await s.nav('/game/dice-loser/play/'); await s.sleep(800);
out.dice = await s.ev(probe);
await s.shot(`${dir}/dice-loser-saved-${W}.png`);
// edit control on dice-loser: mid-round? start the round via its own begin then edit
await s.tap('#dl-begin', { settle: 900 });
out.diceAfterBegin = await s.ev(probe);
await s.sleep(500);
const navP = s.ev("return 1");
out.diceEditTap = await s.tap('#play-edit-players', { noScroll: true, settle: 1500 });
out.diceAfterEdit = await s.ev(probe);
await s.shot(`${dir}/dice-loser-after-edit-${W}.png`);
await seed();
await s.nav('/game/croc-bite/play/'); await s.sleep(1500);
out.croc = await s.ev(probe);
await s.shot(`${dir}/croc-bite-saved-${W}.png`);
out.crocEdit = await s.tap('#play-edit-players', { noScroll: true, settle: 1800 });
out.crocAfterEdit = await s.ev(probe);
await s.shot(`${dir}/croc-bite-after-edit-${W}.png`);
// legacy key of dice-loser/timebomb untouched by unconverted routes? timebomb legacy key must survive on dice-loser/croc pages
out.legacyKeyAfterUnconverted = await s.ev("return localStorage.getItem('watduang:timebomb-players')");
out.errors = s.errors;
console.log(JSON.stringify(out)); await s.close();
