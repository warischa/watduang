import { connect, SNAP } from './lib.mjs';
const W = +process.argv[2], H = +process.argv[3], dir = process.argv[4];
const s = await connect(); const out = {}; const t0 = Date.now(); const T = () => Date.now() - t0;
const store = () => s.ev("return [localStorage.getItem('watduang:roster'),localStorage.getItem('watduang:group')]");
const slim = (x) => ({ rows: x.rows.map((r) => `${r.n}|${r.tick}|${r.sit ? 'sit' : ''}`), limit: x.limit, startDis: x.startDis, toast: x.toast, addVis: x.addVis, count: x.count, root: x.rootVisible, edit: x.editVis, dlg: x.dlg, fuse: x.fuse, attr: x.attr });
await s.view(W, H);
await s.nav('/game/timebomb/play/'); await s.wipe();
// seed the saved roster THROUGH the UI: first visit, rename row 2, start
await s.nav('/game/timebomb/play/'); await s.sleep(500);
await s.type('.ps-n', 1, 'ชิบะตัวแสบ'); await s.sleep(450);
await s.tap('[data-ps=start]'); await s.sleep(500);
out.seeded = await store();
// ---- item 2: reload = return visit
await s.nav('/game/timebomb/play/'); await s.sleep(700);
let x = await s.ev(SNAP); out.saved = slim(x); out.savedW = [x.innerWidth, x.scrollW];
await s.shot(`${dir}/tb-saved-${W}.png`);
// start disabled during arm window? (immediately after load it is armed already after 700ms)
// untick to below min
await s.tap('.ps-tick', { nth: 0 }); await s.tap('.ps-tick', { nth: 1 }); await s.tap('.ps-tick', { nth: 2 });
x = await s.ev(SNAP); out.unticked3 = slim(x);
await s.shot(`${dir}/tb-saved-under-${W}.png`);
const startTapDisabled = await s.tap('[data-ps=start]'); await s.sleep(300);
x = await s.ev(SNAP); out.tapStartWhileUnder = { pos: startTapDisabled, root: x.rootVisible, stage: x.stageVisible };
await s.tap('.ps-tick', { nth: 0 }); await s.tap('.ps-tick', { nth: 1 }); await s.tap('.ps-tick', { nth: 2 });
out.reticked = slim(await s.ev(SNAP));
// x a row, record storage + timeline
const stBefore = await store();
let tx = T();
await s.tap('.ps-rm', { nth: 1, settle: 150 });
out.rmAt = { t: T() - tx };
x = await s.ev(SNAP); out.afterRm1 = slim(x); out.storeAfterRm1same = JSON.stringify(await store()) === JSON.stringify(stBefore);
await s.shot(`${dir}/tb-saved-undo-bar-${W}.png`);
// toast geometry
out.toastGeo = await s.ev(`const t=document.querySelector('[data-ps=toast]').getBoundingClientRect();const u=document.querySelector('[data-ps=undo]').getBoundingClientRect();const g=document.querySelector('[data-ps=start]').getBoundingClientRect();return {toast:[t.left,t.top,t.right,t.bottom],undo:[u.width,u.height],startBottom:g.bottom,vh:innerHeight}`);
// undo (wait out the arm window? the undo bar itself is not gated; tap right away)
out.undoDisAtT = await s.ev("return document.querySelector('[data-ps=undo]').disabled");
await s.sleep(1000);
out.undoDisAt1s = await s.ev("return document.querySelector('[data-ps=undo]').disabled");
const up = await s.tap('[data-ps=undo]', { noScroll: true, settle: 250 }); out.undoPos = up;
x = await s.ev(SNAP); out.afterUndo = slim(x); out.storeAfterUndoSame = JSON.stringify(await store()) === JSON.stringify(stBefore);
// fast undo: x then undo within ~100ms
await s.tap('.ps-rm', { nth: 1, settle: 0 });
const up2 = await s.ev("const b=document.querySelector('[data-ps=undo]');const r=b.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,dis:b.disabled}");
await s.tapXY(up2.x, up2.y); await s.sleep(200);
out.fastUndo = { pos: up2, snap: slim(await s.ev(SNAP)) };
await s.sleep(600);
await s.tap('[data-ps=undo]', { noScroll: true, settle: 250 });
out.afterFastUndoRetry = slim(await s.ev(SNAP));
// x again, let it expire; poll
await s.sleep(500);
await s.tap('.ps-rm', { nth: 1, settle: 0 }); const tRm = Date.now();
const poll = []; let rmGone = null;
while (Date.now() - tRm < 5200) {
  const st = await s.ev(`const t=document.querySelector('[data-ps=toast]');return [!t.hidden, localStorage.getItem('watduang:roster'), document.querySelectorAll('.ps-p').length]`);
  poll.push([Date.now() - tRm, st[0], st[2], st[1] === stBefore[0]]);
  if (!st[0] && rmGone === null) rmGone = Date.now() - tRm;
  await s.sleep(150);
}
out.expireMs = rmGone;
out.pollSample = poll.filter((_, i) => i % 6 === 0);
out.storeChangedBeforeStart = poll.some((p) => p[3] === false);
x = await s.ev(SNAP); out.afterExpire = slim(x);
// quick tap at start right when toast leaves (arm): check start disabled right after expiry? measure
out.startDisAfterExpire = x.startDis;
await s.sleep(500);
const rosterBeforeStart = await store();
await s.tap('[data-ps=start]', { settle: 100 });
const tStart = Date.now();
let after = await store();
out.storage = { before: rosterBeforeStart, after: after, changedWithin100msOfStart: JSON.stringify(after) !== JSON.stringify(rosterBeforeStart) };
await s.sleep(600);
out.afterStart = slim(await s.ev(SNAP)); out.storageFinal = await store();
await s.shot(`${dir}/tb-after-saved-start-${W}.png`);
// ---- item 3: mid-round
await s.sleep(500);
// engine start button
x = await s.ev("const b=document.querySelector('#tb-start');return b?{dis:b.disabled}:null"); out.engineStart = x;
await s.tap('#tb-start', { settle: 700 });
out.round = slim(await s.ev(SNAP));
await s.shot(`${dir}/tb-midround-${W}.png`);
await s.sleep(600);
// edit pill tap -> dialog
await s.tap('#play-edit-players', { noScroll: true, settle: 500 });
x = await s.ev(`const d=document.querySelector('#ps-edit-dialog');return {open:d.open,title:d.querySelector('h2').textContent,body:d.querySelector('p').textContent,btns:[...d.querySelectorAll('button')].map(b=>b.textContent),vals:[...d.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect();return [r.left,r.top,r.width,r.height]}),fuse:!!document.querySelector('#tb-fuse')}`);
out.dialog = x;
await s.shot(`${dir}/tb-edit-dialog-${W}.png`);
// cancel; instant second tap on the edit pill (behind the backdrop)
await s.sleep(500);
const pill = await s.ev("const r=document.querySelector('#play-edit-players').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,h:document.querySelector('#play-edit-players').hidden}");
out.pill = pill;
await s.tap('#ps-edit-cancel', { noScroll: true, settle: 0 });
await s.tapXY(pill.x, pill.y); await s.sleep(80);
x = await s.ev(SNAP); out.afterCancelQuickTap = slim(x);
await s.sleep(900);
x = await s.ev(SNAP); out.afterCancelSettled = slim(x);
// positive control: pill works after the window
await s.tap('#play-edit-players', { noScroll: true, settle: 500 });
out.pillControl = slim(await s.ev(SNAP));
// confirm; instant second tap at start button
await s.sleep(500);
await s.tap('#ps-edit-confirm', { noScroll: true, settle: 0 });
const tConfirm = Date.now();
const sp = await s.ev(`const b=document.querySelector('[data-ps=start]');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,dis:b.disabled,root:!document.querySelector('.ps').hidden}`);
const lat = Date.now() - tConfirm;
await s.tapXY(sp.x, sp.y); const lat2 = Date.now() - tConfirm; await s.sleep(100);
x = await s.ev(SNAP); out.afterConfirmQuickTap = { startPos: sp, tapLatencyMs: lat2, snap: slim(x) };
await s.shot(`${dir}/tb-after-confirm-${W}.png`);
await s.sleep(900);
x = await s.ev(SNAP); out.afterConfirmSettled = slim(x);
await s.tap('[data-ps=start]', { settle: 800 });
out.fresh = slim(await s.ev(SNAP));
out.freshEngineStartVisible = await s.ev("return !!document.querySelector('#tb-start')");
out.errors = s.errors;
console.log(JSON.stringify(out)); await s.close();
