// gh#303 projected-frame chrome, shared by the three game boards: the gh#302 B NIGHT STAGE values the
// owner picked on 2026-11-11 (night ground, gold glow), copied as literals. Frames are authored at
// 1920x1080 CSS px and shown at 75%.
import { th, nm, esc, EVENT, EV, svg, fit } from './lib.mjs';

export const STAGE_CSS = `
    /* ---- projected frames, authored at 1920x1080 CSS px, shown at 75% (transform). gh#302 B values (picked). ---- */
    .pj { position: relative; width: 1920px; height: 1080px; overflow: hidden; box-sizing: border-box; font-family: 'Sarabun', system-ui, sans-serif;
          background: linear-gradient(180deg, #14142b 0%, #23214d 100%); color: #ffffff; }
    .pj .layer { position: absolute; inset: 0; pointer-events: none; }
    .pj .top { position: absolute; left: 0; right: 0; top: 0; height: 96px; display: flex; align-items: center; justify-content: space-between; padding: 0 56px; z-index: 3; }
    .pj .ev { font: 600 36px/1.2 'Mitr', sans-serif; color: #d9d6f0; }
    .pj .dots { display: flex; align-items: center; gap: 14px; font: 600 30px/1 'Mitr', sans-serif; }
    .pj .dots .rl { margin-right: 14px; }
    .pj .dots i { box-sizing: border-box; width: 22px; height: 22px; border-radius: 50%; border: 3px solid #d9d6f0; }
    .pj .dots i.done { background: #d9d6f0; }
    .pj .dots i.on { background: #ffcc00; border-color: #ffcc00; box-shadow: 0 0 18px rgba(255,204,0,0.45); }
    .pj .dots i.fin { width: 36px; border-radius: 999px; }
    .pj .chip { display: flex; align-items: center; justify-content: center; white-space: nowrap; overflow-x: clip; overflow-y: visible; box-sizing: border-box; padding: 0 6px; font: 400 20px/1 'Sarabun', sans-serif; }
    .pj .chip > .fit { display: block; flex: 1 1 auto; min-width: 0; text-align: center; overflow-x: clip; overflow-y: visible; white-space: nowrap; }
    .pj .chip.in { font-weight: 700; }
    .pj .chip.out { text-decoration: line-through; }
    /* The name field: 8 columns x 25 rows (NAME FIT: 20px, floor 18px, then two lines; a row holding a wrapped name grows). */
    .pj .grid { position: absolute; left: 56px; right: 56px; top: 100px; height: 760px; display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); grid-auto-rows: minmax(27px, auto); gap: 2px 10px; align-content: center; z-index: 1; }
    .pj .chip { border-radius: 999px; background: #23214d; color: #ffffff; }
    .pj .chip.in { background: #ffcc00; color: #14142b; box-shadow: 0 0 16px rgba(255,204,0,0.45); }
    .pj .chip.out { background: transparent; color: #9a97c0; box-shadow: inset 0 0 0 2px #23214d; }
    /* The never-blank fallback: the gh#302 picked field as it stands (10 columns, 32px rows, chip padding 8px,
       NAME FIT 20px with a 14px floor, two lines at line-height 1.05) and its 220px lower band. */
    .pj .grid.g302 { top: 96px; height: 724px; grid-template-columns: repeat(10, minmax(0, 1fr)); grid-auto-rows: 32px; gap: 4px 10px; }
    .pj .grid.g302 .chip { padding: 0 8px; }
    .pj .low.g302 { bottom: 30px; height: 220px; }
    .pj .low.g302 .flow { font-size: 150px; }
    .pj .low { position: absolute; left: 56px; right: 56px; bottom: 20px; height: 190px; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 40px; z-index: 3; }
    .pj .lk { font: 600 30px/1.35 'Mitr', sans-serif; color: #d9d6f0; }
    .pj .gname { font: 700 50px/1.2 'Mitr', sans-serif; color: #ffcc00; }
    .pj .flow { display: flex; align-items: center; gap: 28px; font: 700 130px/1 'Mitr', sans-serif; }
    .pj .flow .to { color: #ffcc00; text-shadow: 0 0 24px rgba(255,204,0,0.45); }
    .pj .flow small { font: 600 44px/1 'Mitr', sans-serif; color: #d9d6f0; }
    .pj .rt { text-align: right; }
    .pj .legend { display: flex; flex-direction: column; align-items: flex-end; gap: 12px; }
    /* legend chips at 30px (the projector minimum for non-name text; gh#302's board draws them at 24px) */
    .pj .legend .chip { width: 170px; height: 48px; font-size: 30px; }
    .pj .veil { position: absolute; inset: 0; background: rgba(20,20,43,0.78); z-index: 2; }
    .pj .spot { position: absolute; left: 0; right: 0; top: 120px; text-align: center; z-index: 3; }
    .pj .spot .pz { font: 600 44px/1.25 'Mitr', sans-serif; color: #d9d6f0; }
    .pj .spot .wn { white-space: nowrap; overflow-x: clip; overflow-y: visible; margin-left: 56px; margin-right: 56px; margin-top: 10px; font: 700 132px/1.1 'Mitr', sans-serif; color: #ffcc00; text-shadow: 0 0 30px rgba(255,204,0,0.45); }
    .pj .spot h2 { margin: 0 0 18px; font: 600 40px/1.2 'Mitr', sans-serif; color: #ffffff; }
    .pj .wcards { position: absolute; left: 56px; right: 56px; top: 560px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 24px; z-index: 3; }
    .pj .wcard { background: #23214d; border-radius: 24px; padding: 28px 28px; }
    .pj .wcard .pz { font: 600 30px/1.3 'Mitr', sans-serif; color: #d9d6f0; }
    .pj .wcard .wn { margin-top: 12px; font: 700 52px/1.15 'Mitr', sans-serif; white-space: nowrap; overflow-x: clip; overflow-y: visible; }
    .pj .wcard.none .wn { color: #9a97c0; }
    .pj .claim { position: absolute; left: 0; right: 0; bottom: 56px; text-align: center; font: 400 34px/1.4 'Sarabun', sans-serif; color: #d9d6f0; z-index: 3; }`;

export const scaled = (inner) => `<div class="scaler" style="width:1440px; height:810px;">${inner}</div>`;
export const frame = (id, opt, cls, inner) => `<div class="pj ${cls}" data-frame="${id}" data-dir="${opt}" style="transform: scale(0.75);">${inner}</div>`;

// round: 1..4, or 'fin' for the final.
export function top(round) {
  const label = round === 'fin' ? th('รอบชิงรางวัล', 'projector: final label') : th(`รอบที่ ${round} จาก 4`, 'projector: round label', 'g302');
  const dots = [1, 2, 3, 4].map((n) => `<i class="${round === 'fin' || n < round ? 'done' : n === round ? 'on' : ''}"></i>`).join('');
  return `<div class="top"><span class="ev">${th(EVENT, 'event name (typed by the MC)', 'sample')}</span><span class="dots"><span class="rl">${label}</span>${dots}<i class="fin${round === 'fin' ? ' on' : ''}"></i></span></div>`;
}

// The plain 2D reveal (gh#302 proj-reveal, B, picked): ADR-0051's never-blank frame for an elimination game.
export function plainReveal(gameName, { lowExtra = '', round = 1 } = {}) {
  const field = round === 1 ? EV.field1 : EV.field2; const passSet = round === 1 ? EV.pass1 : EV.pass2;
  const chips = field.map((n) => `<span class="chip ${passSet.has(n) ? 'in' : 'out'}"><span class="${fit(14, 20)}" style="line-height: 1.05;">${nm(n)}</span></span>`).join('');
  const pass = th('ผ่าน', 'legend: passed', 'g302'); const out = th('ไม่ผ่าน', 'legend: did not pass', 'g302');
  return `${top(round)}<div class="grid g302" data-expect="${field.length}/${passSet.size}">${chips}</div><div class="low g302"><div><div class="lk">${round === 1 ? th('ผ่านรอบที่ 1', 'reveal: passed heading', 'g302') : th(`ผ่านรอบที่ ${round}`, `reveal: passed heading (round ${round})`)}</div><div class="gname">${gameName}</div>${lowExtra}</div><div class="flow"><span class="to">${passSet.size}</span><small>${th('คน', 'unit: people', 'g302')}</small></div><div class="legend"><div><span class="chip in">${pass}</span></div><div><span class="chip out">${out}</span></div></div></div>`;
}

// The plain 2D result (gh#302 proj-result, B, picked): the never-blank frame for a final game.
// ranks: finalist names in prize order; nPrizes: how many of them won a prize (1..5).
export function plainResult(ranks, prizes, nPrizes) {
  const cards = ranks.slice(1).map((w, i) => {
    const k = i + 2; const won = k <= nPrizes;
    return `<div class="wcard${won ? '' : ' none'}"><div class="pz">${won ? `${th(`รางวัลที่ ${k}`, 'prize label', 'g302')} · ${th(prizes[k - 1], 'prize name (typed by the MC)', 'sample')}` : th('ไม่มีรางวัล', 'final: a slot with no prize')}</div><div class="wn ${fit(32, 52)}">${nm(w)}</div></div>`;
  }).join('');
  return `${top('fin')}<div class="spot"><h2>${th('ผู้ได้รับรางวัล', 'result: heading', 'g302')}</h2><div class="pz">${th('รางวัลที่ 1', 'prize label', 'g302')} · ${th(prizes[0], 'prize name (typed by the MC)', 'sample')}</div><div class="wn ${fit(96, 132)}">${nm(ranks[0])}</div></div><div class="wcards">${cards}</div><div class="claim">${th('ผู้ได้รางวัล เปิดหน้าผลในมือถือให้ทีมงานดู ชื่อต้องตรงกับบนจอนี้', 'result: claim line', 'g302')}</div>`;
}

export const STAGE_VALUES = [
  ['#14142b to #23214d, 180deg', 'night ground gradient', 'gh#302 B, picked 2026-11-11'],
  ['#23214d', 'raised surface: pills, cards, card backs, dark lanterns', 'gh#302 B, picked'],
  ['#ffffff', 'primary text; card faces', 'tokens.css --ink-light'],
  ['#d9d6f0', 'secondary text', 'tokens.css --ink-on-band-soft'],
  ['#ffcc00', 'lit lanterns, passed names, numbers, rails', 'tokens.css --accent-gold'],
  ['#ff3d7f', 'burst sparks; rocket fins; one path colour (never a suit: suits are #c2185b)', 'tokens.css --accent-punch'],
  ['#2b7bff', 'burst sparks; one path colour', 'tokens.css --accent-sky'],
  ['#9a97c0', 'a name that did not pass (plus line-through)', 'gh#302 B, picked'],
  ['0 0 16px..60px rgba(255,204,0,0.45)', 'gold glow', 'gh#302 B, picked'],
  ['rgba(20,20,43,0.78)', 'veil (countdown, round code)', 'gh#302 B, picked'],
];
// Where the game frames depart from the gh#302 picked values (diffed against design/Gh302Projector.dc.html, B, on
// 2026-11-11). The fallback frames carry the picked values unchanged.
export const STAGE_DEVIATIONS = '<b>Departures from the gh#302 picked values (B), each a PROPOSAL for the game frames only, PICKED 2026-11-11 with the picked options; the fallback frames carry the gh#302 picked values unchanged:</b> the name field is 8 columns of 27px rows (rows grow for a wrapped name) with a 2px row gap, from 100px to 860px, against gh#302\'s 10 columns of 32px rows from 96px; names have an 18px floor (16px on cards) against gh#302\'s 14px, because lanterns and cards are read from further back than a plain list; chip side padding is 6px against 8px; the lower band is 190px tall with the count at 130px against 220px and 150px, to give the field the room. Everything else in the chrome (top bar, round dots, veil, code card, result frame) is the picked value.';
export const STAGE_PAIRS = [
  ['#ffffff', '#14142b', 'white on the night ground'], ['#ffffff', '#23214d', 'white on pills and card backs'],
  ['#d9d6f0', '#23214d', 'secondary text on cards'], ['#ffcc00', '#14142b', 'gold numbers on the ground'],
  ['#14142b', '#ffcc00', 'ink names on lit lanterns and passed chips'], ['#9a97c0', '#23214d', 'a name that did not pass'],
];
export { esc, svg };
