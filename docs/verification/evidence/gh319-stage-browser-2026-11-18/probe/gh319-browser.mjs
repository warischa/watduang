// gh#319 stage browser checks (attempt 4: re-verify on the FINAL tree after the cross-lineage review fixes).
// Reuses the archived ui-audit raw-CDP harness (./lib.mjs, copied verbatim from
// docs/verification/evidence/ui-audit-2026-11-17-gh315-318/probe/lib.mjs.txt) for the tab, the real viewport
// emulation, real touch taps and the in-page WebGL instrument. QR events are seeded through the event domain
// itself (src/prize-event/event.ts), written to the route's IndexedDB and resumed -- the setup page's QR flow
// needs the join server, which is not run here; the stored event is the same shape it commits.
//
//   CDPP=9333 BASEURL=http://localhost:4322 OUTDIR=<this dir> node gh319-browser.mjs
//
// Mechanism under test (changed since attempt 3):
//   - the held frame hides by opacity:0 + pointer-events:none, NOT visibility:hidden -- it stays in the
//     accessibility tree; the canvas is aria-hidden;
//   - the host notifies every release through onRelease (dispose, reduced motion, narrowing, context loss,
//     ANY resize while held); the caller clears data-held and draws the 2D frame back in one render;
//   - the persistent final code (.pd-fcode) lifts into .pd-over once the code card closes (never over the
//     open card);
//   - RevealInput.claim: the envelopes/flipcards renderers paint the claim line ONLY in QR mode; admin-mode
//     finals and the demo paint none, and the 2D frame draws none either (screenView reads the same fact).
//
// (a) held zones round at 1440x900, code card OPEN then closed: elementFromPoint at the card, its close and
//     the MC button; the mark, the frame's computed opacity/pointer-events (with an unmark negative control),
//     the veil-under-card lift order; then a forced context loss releases (e1).
// (b) held envelopes/flipcards final in QR mode at 1440x900, card OPEN then closed: the same hits; after the
//     close .pd-fcode is the overlay's one child, visible and hit-testable; exactly one claim in the document
//     (the invisible frame's copy) and no DOM claim over the picture -- the picture's own line is the one the
//     room reads (shot verdict + the e-control below). Flipcards then releases by emulated reduced motion (e2),
//     and re-takes the e-control: the frame's claim node removed while held, the picture's line still there.
// (c) free-name row at 640/720/845 on both finals' pick screen: row vs plate controls vs band, no clipping.
// (d) the three hold games' demo pages held at 1440x900: mark, opacity-0 frame, NO claim node anywhere, the
//     bar (ดูอีกครั้ง) hit-testable over the picture; then narrowing releases and the frame paints again.
// (f) held ADMIN-mode finals (no QR), both games: no code card, no fcode, no claim line anywhere on screen.
// (g) held zones round, card closed, resize to 1024x768: the host RELEASES (canvas detached, mark cleared,
//     opacity back to 1, the 2D reveal drawn) -- no stretched canvas.
// (h) accessibility tree while held (flipcards QR final, card closed): every winner name of the 2D result is
//     a non-ignored AX node INSIDE the frame; the canvas is aria-hidden and absent/ignored in the tree.
//     Instrument must-red: aria-hidden on the frame drops the names from the tree; removing it brings them back.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openTab, BASE, OUT, sleep } from './lib.mjs';
import { createEvent, encodeEvent, drawNext, advance, revealDrawn, pickObject, liveIds } from '../../../../../src/prize-event/event.ts';
import { proposeSchedule } from '../../../../../src/prize-draw/schedule.ts';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const people = (n) => Array.from({ length: n }, (_, i) => ({ id: B64[i >> 6] + B64[i & 63] + 'x'.repeat(20), name: `P${i + 1}` }));
const rng = (() => { let a = 2570 >>> 0; const float = () => { a |= 0; a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; return { float, int: (n) => Math.floor(float() * n), hex: (b) => Array.from({ length: b }, () => Math.floor(float() * 256).toString(16).padStart(2, '0')).join('') }; })();
const ROSTER = people(50);
const setup = { eventName: 'Gh319', names: ROSTER.map((p) => p.name), schedule: proposeSchedule(50), prizes: ['ทีวี', 'พัดลม'] };
const mk = (games) => createEvent({ ...setup, games, qr: { pin: '048213', roster: ROSTER } }, rng);
const mkAdmin = (games) => createEvent({ ...setup, games }, rng);
const toFinalReady = (game, maker = mk) => { let ev = maker({ rounds: [null, null, null, null], final: game }); for (let r = 1; r <= 4; r++) ev = advance(revealDrawn(drawNext(ev, rng)), rng); return ev; };
const placed = (ev) => { const ids = liveIds(ev); let s = ev; for (let i = 0; i < 5; i++) s = pickObject(s, i, ids[i]); return s; };

const writeEvent = (T, raw) => T.ev(`
  const db = await new Promise((res, rej) => { const q = indexedDB.open('watduang-prize-draw', 1); q.onupgradeneeded = () => { if (!db.objectStoreNames.contains('event')) q.result.createObjectStore('event'); }; q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  await new Promise((res, rej) => { const tx = db.transaction('event', 'readwrite'); tx.objectStore('event').put(${JSON.stringify(raw)}, 'current'); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
  db.close(); return true;`);

async function seed(T, ev, W, H) {
  await T.send('Storage.clearDataForOrigin', { origin: BASE, storageTypes: 'all' });
  await T.nav(`${BASE}/game/prize-draw/play/`);
  await T.view(W, H, false);
  await writeEvent(T, encodeEvent(ev));
  await T.nav(`${BASE}/game/prize-draw/play/`);
  await T.view(W, H, false);
  await sleep(900);
  return T.ev('return innerWidth');
}
const state = (T) => T.ev(`const c = document.querySelector('.pd-3d canvas') || document.querySelector('.pr-3d canvas'); const b = document.querySelector('.pd-mc button') || document.querySelector('.pr-go'); const f = document.getElementById('pd-frame') || document.querySelector('.pd-frame'); return { canvas: !!c, screen: f?.getAttribute('data-screen'), btn: b ? b.textContent.trim() : null };`);
const glLive = (T) => T.ev(`return JSON.parse(JSON.stringify({ ctx: __wd.ctx.map(c => ({ type: c.type, ok: !!c.ok, renderer: c.renderer || null })) }))`);

/** The held composite's paint state: the mark, the frame's computed opacity/pointer-events (visibility stays
 *  'visible' -- the a11y tree keeps the frame), the lift order, claim count, where the fcode sits. */
const paintState = (T) => T.ev(`
  const vp = document.querySelector('.pd-viewport') || document.querySelector('.pr-viewport');
  const sc = document.querySelector('.pd-scaled');
  const cs = getComputedStyle(sc);
  const over = document.querySelector('.pd-over');
  return { mark: vp.hasAttribute('data-held'), opacity: cs.opacity, pe: cs.pointerEvents, vis: cs.visibility,
    overOrder: over ? [...over.children].map((c) => c.className) : null,
    claimCount: document.querySelectorAll('.pd-claim').length,
    frameCodebox: !!document.querySelector('.pd-frame .pd-codebox'),
    frameClaim: !!document.querySelector('.pd-frame .pd-claim'),
    frameFcode: !!document.querySelector('.pd-frame .pd-fcode'),
    overFcode: !!document.querySelector('.pd-over .pd-fcode') };`);

/** The lifted persistent final code: its text, its computed paint, its box. */
const fcodeState = (T) => T.ev(`
  const e = document.querySelector('.pd-over .pd-fcode'); if (!e) return { absent: true };
  const cs = getComputedStyle(e); const r = e.getBoundingClientRect();
  return { text: e.textContent.trim(), opacity: cs.opacity, vis: cs.visibility,
    rect: { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } };`);

/** Press the MC button and wait until the picture is HELD: canvas up AND the settled 2D screen drawn behind it. */
async function pressHeld(T, settledScreen) {
  const label = await T.ev(`const b = document.querySelector('.pd-mc button'); return b ? b.textContent.trim() : null`);
  await T.tapEl('.pd-mc button', label, { settleMs: 500 });
  const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    const s = await state(T);
    if (s.canvas && s.screen === settledScreen) { await sleep(700); return { ...s, held: true, ms: Date.now() - t0 }; }
    await sleep(120);
  }
  return { ...(await state(T)), held: false, ms: Date.now() - t0 };
}

/** elementFromPoint at a node's centre (inset 1px off the edges): does it return the node or a descendant? */
const hit = (T, sel) => T.ev(`
  const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return { absent: true };
  e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect();
  const x = r.left + Math.min(1, r.width / 2) + (r.width - 2) / 2, y = r.top + Math.min(1, r.height / 2) + (r.height - 2) / 2;
  const top = document.elementFromPoint(x, y);
  const d = (n) => n ? n.tagName.toLowerCase() + (n.className && n.className.baseVal === undefined ? '.' + String(n.className).trim().split(/\\s+/).join('.') : '') : null;
  return { sel: ${JSON.stringify(sel)}, x: Math.round(x), y: Math.round(y), rect: { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }, hit: !!top && (top === e || e.contains(top)), top: d(top), topIsCanvas: !!top && top.tagName === 'CANVAS' };`);

/** The claim line's centre: the picture paints its own claim (QR mode only), so no DOM claim may sit over it.
 *  The frame copy is opacity-0 but laid out; the frame takes no input (pointer-events:none) and the 3D layer
 *  takes none either, so the point lands on the veil (card open) or the viewport box (closed) -- never on a
 *  claim node. Readability of the picture's claim is judged from the shot, not from this point. */
const claimPoint = (T) => T.ev(`
  const e = document.querySelector('.pd-frame .pd-claim'); if (!e) return { absent: true };
  const r = e.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const top = document.elementFromPoint(x, y);
  return { x: Math.round(x), y: Math.round(y), top: top ? top.tagName.toLowerCase() : null,
    topIsCanvas: !!top && top.tagName === 'CANVAS', domClaimOver: !!document.querySelector('.pd-over .pd-claim') };`);

const results = { attempt: 4, date: '2026-11-18', checks: [], n: 1 };
const rec = (c) => { results.checks.push(c); console.log(JSON.stringify(c)); };
const glOk = (gl) => gl.ctx.some((c) => c.ok && c.type === 'webgl2');
const renderers = (gl) => [...new Set(gl.ctx.filter((c) => c.renderer).map((c) => c.renderer))];
const ver = await (await fetch(`http://127.0.0.1:${process.env.CDPP || '9333'}/json/version`)).json();
results.browser = ver.Browser;
console.log('BROWSER', ver.Browser);

/** Run one check block; an exception is a recorded FAIL, never a lost run. */
async function block(fn) { try { await fn(); } catch (e) { rec({ check: 'error', error: String(e && e.stack || e).slice(0, 600), pass: false }); } }

// ---- (a) held zones round, code card open then closed, then context loss, 1440x900 ----
await block(async () => {
  const T = await openTab();
  const inner = await seed(T, mk({ rounds: ['zones', 'zones', null, null], final: null }), 1440, 900);
  const held = await pressHeld(T, 'reveal');
  const gl = await glLive(T);
  const open = await paintState(T);
  const codebox = await hit(T, '.pd-over .pd-codebox');
  const close = await hit(T, '.pd-mc button');
  // Negative control for the paint read: with the mark off the frame must paint, with it on it must not.
  const neg = await T.ev(`const vp = document.querySelector('.pd-viewport'); const sc = document.querySelector('.pd-scaled'); vp.removeAttribute('data-held'); const a = getComputedStyle(sc); const off = { opacity: a.opacity, pe: a.pointerEvents }; vp.setAttribute('data-held', ''); const b = getComputedStyle(sc); return { off, on: { opacity: b.opacity, pe: b.pointerEvents } };`);
  await T.shot('a-held-zones-codebox-1440');
  await T.tapEl('.pd-mc button', 'ตกลง', { settleMs: 500 });
  await sleep(500);
  const closed = await paintState(T);
  const mcAfter = await hit(T, '.pd-mc button');
  await T.shot('a-held-zones-codeclosed-1440');
  // (e1) a forced context loss releases the held picture: the mark clears and the frame paints again.
  await T.ev(`const c = document.querySelector('.pd-3d canvas'); c.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext(); return true;`);
  await sleep(800);
  const lostState = await state(T);
  const lostPaint = await paintState(T);
  rec({
    check: 'a', desc: 'held zones round, code card open then closed, then context loss', width: 1440, height: 900, innerWidthRead: inner,
    held: held.held, heldMs: held.ms, screen: held.screen, canvas: held.canvas, webgl2: glOk(gl), renderer: renderers(gl),
    open, codebox, close, neg, closed, mcAfter, lostState, lostPaint,
    pass: held.held && glOk(gl) && open.mark && open.opacity === '0' && open.pe === 'none' && open.vis === 'visible'
      && neg.off.opacity === '1' && neg.on.opacity === '0' && neg.on.pe === 'none'
      && JSON.stringify(open.overOrder) === JSON.stringify(['pd-veil', 'pd-codebox']) && open.claimCount === 0
      && codebox.hit && !codebox.topIsCanvas && close.hit && !close.topIsCanvas
      && closed.mark && closed.opacity === '0' && closed.overOrder.length === 0 && mcAfter.hit && !mcAfter.topIsCanvas
      && !lostState.canvas && lostState.screen === 'reveal' && !lostPaint.mark && lostPaint.opacity === '1',
  });
  await T.close();
});

// ---- (b) held envelopes / flipcards final in QR mode, code card open then closed, 1440x900 ----
for (const game of ['envelopes', 'flipcards']) {
  await block(async () => {
    const T = await openTab();
    const inner = await seed(T, placed(toFinalReady(game)), 1440, 900);
    const held = await pressHeld(T, 'result');
    const gl = await glLive(T);
    const open = await paintState(T);
    const codebox = await hit(T, '.pd-over .pd-codebox');
    const close = await hit(T, '.pd-mc button');
    const claimOpen = await claimPoint(T);
    await T.shot(`b-held-${game}-codebox-1440`);
    await T.tapEl('.pd-mc button', 'ตกลง', { settleMs: 500 });
    await sleep(500);
    const closed = await paintState(T);
    const fcode = await fcodeState(T);
    const fcodeHit = await hit(T, '.pd-over .pd-fcode');
    const claim = await claimPoint(T);
    const mcAfter = await hit(T, '.pd-mc button');
    await T.shot(`b-held-${game}-claim-1440`);
    let eControl = null;
    let rmState = null;
    let rmPaint = null;
    if (game === 'flipcards') {
      // The e-control, re-taken on the final tree: remove the frame's claim NODE while held -- the picture's
      // own line must still be the one clean claim in the shot (the renderer paints it, QR mode only).
      eControl = await T.ev(`const e = document.querySelector('.pd-frame .pd-claim'); if (e) e.remove(); return { removed: !!e, claimCount: document.querySelectorAll('.pd-claim').length };`);
      await T.shot('e-claim-dom-removed-1440');
      // (e2) emulated reduced motion releases the held picture: the mark clears and the frame paints again.
      await T.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      await sleep(800);
      rmState = await state(T);
      rmPaint = await paintState(T);
    }
    rec({
      check: 'b', game, desc: 'held final QR mode, code card open then closed; fcode lifted after the close', width: 1440, height: 900, innerWidthRead: inner,
      held: held.held, heldMs: held.ms, screen: held.screen, canvas: held.canvas, webgl2: glOk(gl), renderer: renderers(gl),
      open, codebox, close, claimOpen, closed, fcode, fcodeHit, claim, mcAfter, eControl, rmState, rmPaint,
      pass: held.held && glOk(gl) && open.mark && open.opacity === '0' && open.pe === 'none'
        && JSON.stringify(open.overOrder) === JSON.stringify(['pd-veil', 'pd-codebox'])
        && open.claimCount === 1 && open.frameClaim && open.frameFcode && !open.overFcode
        && codebox.hit && !codebox.topIsCanvas && close.hit && !close.topIsCanvas
        && !claimOpen.domClaimOver
        && closed.mark && closed.opacity === '0' && JSON.stringify(closed.overOrder) === JSON.stringify(['pd-fcode'])
        && closed.overFcode && !closed.frameFcode && fcode.opacity === '1' && fcode.vis === 'visible' && fcodeHit.hit && !fcodeHit.topIsCanvas
        && closed.claimCount === 1 && closed.frameClaim && !claim.domClaimOver
        // A revealed final has no step-forward control (stage.ts control()): after the close the MC bar is
        // empty by design; the close itself was the MC control while the card was up.
        && (mcAfter.absent === true || (mcAfter.hit && !mcAfter.topIsCanvas))
        && (game !== 'flipcards' || (eControl.removed && eControl.claimCount === 0
          && !rmState.canvas && !rmPaint.mark && rmPaint.opacity === '1')),
    });
    await T.close();
  });
}

// ---- (c) free-name row at 640/720/845 on both finals' pick screen ----
const geometry = (T) => T.ev(`
  const rect = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  const row = document.querySelector('.pd-names'); const band = document.querySelector('.pd-olow');
  const lanes = [...document.querySelectorAll('.pd-lane')].map(rect);
  const vp = document.querySelector('.pd-viewport');
  const inter = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
  const rr = row ? rect(row) : null; const br = band ? rect(band) : null;
  return { innerWidth, real: row?.hasAttribute('data-real'), namesY: row?.style.getPropertyValue('--names-y'), row: rr, band: br, lanes,
    rowOverlapsLane: rr ? lanes.map((l, i) => ({ i, overlap: inter(rr, l) })).filter(x => x.overlap) : null,
    rowBottomLeBandTop: rr && br ? rr.b <= br.t + 0.5 : null,
    rowRightWithinViewport: rr ? rr.r <= vp.clientWidth + 0.5 : null,
    bandBottomWithinScroll: br ? br.b <= vp.scrollHeight + 0.5 : null,
    viewport: { clientW: vp.clientWidth, clientH: vp.clientHeight, scrollH: vp.scrollHeight } };`);
for (const game of ['envelopes', 'flipcards']) {
  for (const W of [640, 720, 845]) {
    await block(async () => {
      const T = await openTab();
      const inner = await seed(T, toFinalReady(game), W, 900);
      await sleep(500);
      const g = await geometry(T);
      await T.shot(`c-row-${game}-${W}`);
      const pass = g.real === true && g.row && g.band && g.rowOverlapsLane.length === 0 && g.rowBottomLeBandTop === true && g.rowRightWithinViewport === true && g.bandBottomWithinScroll === true;
      rec({ check: 'c', game, width: W, height: 900, innerWidthRead: inner, ...g, pass });
      await T.close();
    });
  }
}

// ---- (d) the hold games' demo pages held at 1440x900, then narrowed to release ----
for (const [game, screen] of [['zones', 'reveal'], ['envelopes', 'result'], ['flipcards', 'result']]) {
  await block(async () => {
    const T = await openTab();
    await T.nav(`${BASE}/game/prize-${game}/play/`);
    const inner = await T.view(1440, 900, false).then(() => T.ev('return innerWidth'));
    await T.tapEl('.pr-go', 'เปิดผล', { settleMs: 500 });
    const t0 = Date.now();
    let held = null;
    while (Date.now() - t0 < 120000) {
      const s = await state(T);
      if (s.canvas && s.screen === screen) { await sleep(700); held = { ...s, held: true, ms: Date.now() - t0 }; break; }
      await sleep(120);
    }
    held = held ?? { ...(await state(T)), held: false, ms: Date.now() - t0 };
    const gl = await glLive(T);
    const paint = await paintState(T);
    const bar = await hit(T, '.pr-go');
    await T.shot(`d-held-${game}-1440`);
    // Narrowing past the phone boundary releases the held picture: mark cleared, frame painting again.
    await T.view(500, 900, false);
    await sleep(800);
    const narrowState = await state(T);
    const narrowPaint = await paintState(T);
    rec({
      check: 'd', game, desc: 'demo page held (no claim line), then narrowed to release', width: 1440, height: 900, innerWidthRead: inner,
      held: held.held, heldMs: held.ms, screen: held.screen, canvas: held.canvas, barText: held.btn, webgl2: glOk(gl), renderer: renderers(gl),
      paint, bar, narrowState, narrowPaint,
      pass: held.held && glOk(gl) && paint.mark && paint.opacity === '0' && paint.pe === 'none' && paint.overOrder !== null
        && paint.claimCount === 0 && !paint.frameClaim
        && held.btn === 'ดูอีกครั้ง' && bar.hit && !bar.topIsCanvas
        && !narrowState.canvas && !narrowPaint.mark && narrowPaint.opacity === '1',
    });
    await T.close();
  });
}

// ---- (f) held ADMIN-mode finals (no QR): no claim line anywhere, no card, no fcode ----
for (const game of ['envelopes', 'flipcards']) {
  await block(async () => {
    const T = await openTab();
    const inner = await seed(T, placed(toFinalReady(game, mkAdmin)), 1440, 900);
    const held = await pressHeld(T, 'result');
    const gl = await glLive(T);
    const paint = await paintState(T);
    const claim = await claimPoint(T);
    const mc = await hit(T, '.pd-mc button');
    await T.shot(`f-held-${game}-admin-1440`);
    rec({
      check: 'f', game, desc: 'held ADMIN-mode final: no claim line anywhere on screen', width: 1440, height: 900, innerWidthRead: inner,
      held: held.held, heldMs: held.ms, screen: held.screen, canvas: held.canvas, webgl2: glOk(gl), renderer: renderers(gl),
      paint, claim, mc,
      // The claim detector is calibrated both ways across this run: (b) QR sees exactly one frame claim,
      // here the same instrument must see zero. The picture's own line is judged from the shot.
      pass: held.held && glOk(gl) && paint.mark && paint.opacity === '0' && paint.pe === 'none'
        && JSON.stringify(paint.overOrder) === JSON.stringify([])
        && paint.claimCount === 0 && !paint.frameClaim && !paint.frameCodebox && !paint.frameFcode && !paint.overFcode
        && claim.absent === true && (mc.absent === true || (mc.hit && !mc.topIsCanvas)),
    });
    await T.close();
  });
}

// ---- (g) held zones round, card closed, resize to 1024x768: the host RELEASES to the 2D result ----
await block(async () => {
  const T = await openTab();
  const inner = await seed(T, mk({ rounds: ['zones', 'zones', null, null], final: null }), 1440, 900);
  const held = await pressHeld(T, 'reveal');
  await T.tapEl('.pd-mc button', 'ตกลง', { settleMs: 500 });
  await sleep(500);
  const pre = await paintState(T);
  const preState = await state(T);
  await T.view(1024, 768, false);
  await sleep(900);
  const postState = await state(T);
  const post = await paintState(T);
  const postInner = await T.ev('return innerWidth');
  const chips = await T.ev(`return document.querySelectorAll('.pd-frame .pd-chip').length`);
  await T.shot('g-resize-release-1024');
  rec({
    check: 'g', desc: 'held zones round resized to 1024x768: released to the 2D reveal, no stretched canvas',
    width: 1024, height: 768, innerWidthRead: inner, innerWidthAfter: postInner,
    held: held.held, heldMs: held.ms, pre, preState, postState, post, chips,
    pass: held.held && pre.mark && preState.canvas && postInner === 1024
      && !postState.canvas && postState.screen === 'reveal' && !post.mark && post.opacity === '1' && chips > 0,
  });
  await T.close();
});

// ---- (h) accessibility tree while held: the 2D result's winner names stay exposed; the canvas is hidden ----
await block(async () => {
  const T = await openTab();
  await T.send('DOM.enable');
  const inner = await seed(T, placed(toFinalReady('flipcards')), 1440, 900);
  const held = await pressHeld(T, 'result');
  await T.tapEl('.pd-mc button', 'ตกลง', { settleMs: 500 });
  await sleep(500);
  const dom = await T.ev(`
    const sc = document.querySelector('.pd-scaled'); const fr = document.querySelector('.pd-frame');
    const cv = document.querySelector('.pd-3d canvas');
    return { scOpacity: getComputedStyle(sc).opacity, scAria: sc.getAttribute('aria-hidden'), frAria: fr.getAttribute('aria-hidden'),
      canvasAria: cv ? cv.getAttribute('aria-hidden') : null,
      names: [...document.querySelectorAll('.pd-frame .pd-wn')].map((e) => e.textContent.trim()) };`);
  await T.shot('h-a11y-held-flipcards-1440');

  /** Winner-name AX matches: non-ignored nodes whose name equals a winner name AND that sit inside the frame
   *  (the live region outside it announces names too -- a match there would not prove the frame is exposed). */
  // lib.mjs send() resolves with the FULL CDP message: every payload read goes through .result.
  async function axRead() {
    const ax = (await T.send('Accessibility.getFullAXTree', {})).result;
    const nodes = (ax && ax.nodes) || [];
    const matches = [];
    for (const n of nodes) {
      const name = n.name && n.name.value ? String(n.name.value).trim() : '';
      if (!dom.names.includes(name) || n.ignored) continue;
      let inFrame = null;
      if (n.backendDOMNodeId) {
        const r = (await T.send('DOM.resolveNode', { backendNodeId: n.backendDOMNodeId })).result;
        if (r && r.object && r.object.objectId) {
          // An AX StaticText's backendDOMNodeId resolves to a TEXT node (nodeType 3, measured live): no
          // .closest on it -- attribute through its parentElement, or every in-frame read comes back false.
          const c = (await T.send('Runtime.callFunctionOn', { objectId: r.object.objectId, returnByValue: true, functionDeclaration: 'function(){ const e = this.nodeType === 1 ? this : this.parentElement; return !!(e && e.closest(".pd-frame")); }' })).result;
          inFrame = !!(c && c.result && c.result.value === true);
        }
      }
      matches.push({ name, role: n.role && n.role.value, inFrame });
    }
    const canvasNodes = nodes.filter((n) => n.backendDOMNodeId === canvasBackend).map((n) => ({ ignored: !!n.ignored, role: n.role && n.role.value }));
    return { total: nodes.length, matches, canvasNodes };
  }
  const doc = (await T.send('DOM.getDocument', { depth: -1 })).result;
  const cq = (await T.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '.pd-3d canvas' })).result;
  const canvasBackend = cq.nodeId ? (await T.send('DOM.describeNode', { nodeId: cq.nodeId })).result.node.backendNodeId : null;
  const heldRead = await axRead();
  // Instrument must-red: aria-hidden on the scaled frame must drop the names from the tree; removing it must
  // bring them back. A detector that reads the same both ways is measuring nothing.
  await T.ev(`document.querySelector('.pd-scaled').setAttribute('aria-hidden', 'true'); return true;`);
  const hiddenRead = await axRead();
  await T.ev(`document.querySelector('.pd-scaled').removeAttribute('aria-hidden'); return true;`);
  const restoredRead = await axRead();
  const inFrameNames = (r) => [...new Set(r.matches.filter((m) => m.inFrame).map((m) => m.name))];
  const heldNames = inFrameNames(heldRead);
  const restoredNames = inFrameNames(restoredRead);
  const canvasHidden = dom.canvasAria === 'true' && (heldRead.canvasNodes.length === 0 || heldRead.canvasNodes.every((n) => n.ignored));
  rec({
    check: 'h', desc: 'a11y tree while held: winner names exposed in the frame, canvas aria-hidden', width: 1440, height: 900, innerWidthRead: inner,
    held: held.held, heldMs: held.ms, dom, canvasBackend,
    heldRead: { total: heldRead.total, matches: heldRead.matches, canvasNodes: heldRead.canvasNodes },
    // The live region outside the frame announces names too, so the must-red counts IN-FRAME matches only.
    mustRed: { hiddenMatches: hiddenRead.matches.length, hiddenInFrame: inFrameNames(hiddenRead).length, restoredInFrame: restoredNames.length },
    // The result shows one winner per prize (event.ts winners()): this event has two prizes, so two names.
    // The invariant is that EVERY name the 2D result draws is exposed in-frame, whatever the prize count.
    pass: held.held && dom.scOpacity === '0' && dom.scAria === null && dom.frAria === null && dom.names.length > 0
      && dom.names.every((n) => heldNames.includes(n)) && canvasHidden
      && inFrameNames(hiddenRead).length === 0 && restoredNames.length === dom.names.length,
  });
  await T.close();
});

writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 1) + '\n');
const failed = results.checks.filter((c) => !c.pass);
console.log('SUMMARY', JSON.stringify({ total: results.checks.length, pass: results.checks.length - failed.length, fail: failed.length, failed: failed.map((c) => `${c.check}${c.game ? ':' + c.game : ''}${c.width ? '@' + c.width : ''}`) }));
process.exit(failed.length ? 1 : 0);
