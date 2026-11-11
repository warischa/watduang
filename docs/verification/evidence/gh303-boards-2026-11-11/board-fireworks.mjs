// gh#303 board: the countdown-fireworks game, elimination and its final variant.
import { th, nm, esc, fit, EV, MAX_HEADS, FINALISTS, PRIZES, burst, faded, resetCopy, boardDoc, tag, ORDER_LINE, valuesTable, contrastTable, beatTable, copyRow, notesRow, rulesRow, nameFitRow, rng } from './lib.mjs';
import { rolesRow } from './roles.mjs';
import { STAGE_CSS, STAGE_VALUES, STAGE_PAIRS, STAGE_DEVIATIONS, scaled, frame, top, plainReveal, plainResult } from './stage.mjs';

const CSS = `
    /* ---- countdown fireworks ---- */
    .pj .grid .chip.lan { border-radius: 10px 10px 16px 16px; position: relative; }
    .pj .grid .chip.lan.lit { background: #ffcc00; color: #14142b; font-weight: 700; box-shadow: 0 0 16px rgba(255,204,0,0.45); }
    .pj .grid .chip.lan.out { background: transparent; color: #9a97c0; box-shadow: inset 0 0 0 2px #23214d; }
    .pj .grid.dim .chip.lan.lit { box-shadow: none; }
    .pj .cd { display: flex; flex-direction: column; align-items: center; }
    .pj .cd .num { font: 700 140px/1.25 'Mitr', sans-serif; color: #ffcc00; text-shadow: 0 0 40px rgba(255,204,0,0.45); }
    .pj .bignum { position: absolute; left: 0; right: 0; top: 150px; text-align: center; z-index: 3; }
    .pj .bignum .k { font: 600 52px/1.2 'Mitr', sans-serif; color: #ffffff; }
    .pj .bignum .num { font: 700 560px/1 'Mitr', sans-serif; color: #ffcc00; text-shadow: 0 0 60px rgba(255,204,0,0.45); }
    .pj .sweep { position: absolute; left: 40px; right: 40px; height: 4px; background: #ffcc00; box-shadow: 0 0 24px rgba(255,204,0,0.45); z-index: 2; }
    /* Name plates (final variant): Sarabun 700, 40px, shrink to fit, floor 24px, inside a 310px plate (266px for the name). */
    .pj .plate { position: absolute; margin-left: -155px; box-sizing: border-box; width: 310px; padding: 10px 22px; display: flex; flex-direction: column; align-items: center; gap: 6px;
                 border-radius: 28px; font: 700 40px/1.15 'Sarabun', sans-serif; z-index: 3; }
    .pj .plate > .fit { width: 266px; text-align: center; white-space: nowrap; overflow-x: clip; overflow-y: visible; }
    .pj .plate.up { background: #ffcc00; color: #14142b; box-shadow: 0 0 24px rgba(255,204,0,0.45); }
    .pj .plate.done { background: #23214d; color: #ffffff; }
    .pj .plate .pr { font: 600 30px/1.1 'Mitr', sans-serif; color: #d9d6f0; }
    .pj .hud1 { position: absolute; left: 56px; right: 56px; bottom: 36px; display: flex; justify-content: space-between; align-items: flex-end; z-index: 3; }`;

// Lantern grid geometry: the stage field, 8 columns x 25 rows; centres in frame px.
const COLS = 8;
const pos = (i) => { const c = i % COLS, r = Math.floor(i / COLS); return { c, r, x: 56 + (c + 0.5) * ((1808 + 10) / COLS) - 5, y: 100 + 18.5 + r * 29 + 13.5 }; };
// Option A: five bursts, each eliminated lantern goes dark with the burst nearest it.
const BURSTS_A = [[330, 300], [1560, 250], [960, 470], [520, 690], [1420, 700]];
const groupA = (i) => { const p = pos(i); let b = 0, d = 1e9; BURSTS_A.forEach(([x, y], k) => { const dd = (x - p.x) ** 2 + (y - p.y) ** 2; if (dd < d) { d = dd; b = k; } }); return b; };

function lanterns(state, { done = 0, sweepRow = 99, dim = false } = {}) {
  // state: 'lit' (all lit), 'A' (bursts 0..done-1 resolved), 'B' (rows >= sweepRow resolved), 'end'
  const chips = EV.field1.map((n, i) => {
    const out = !EV.pass1.has(n);
    let resolved = state === 'end';
    if (state === 'A') resolved = groupA(i) < done;
    if (state === 'B') resolved = pos(i).r >= sweepRow;
    return `<span class="chip lan ${resolved && out ? 'out' : 'lit'}"><span class="${fit(18, 20)}">${nm(n)}</span></span>`;
  }).join('');
  const passN = state === 'end' ? EV.pass1.size : null;
  return `<div class="grid${dim ? ' dim' : ''}"${passN ? ` data-expect="${EV.field1.length}/${passN}"` : ''}>${chips}</div>`;
}
const remaining = (pred) => EV.field1.filter((n, i) => EV.pass1.has(n) || !pred(i)).length;

const GNAME = () => th('พลุนับถอยหลัง', 'game name', 'ticket');
const PEOPLE = () => th('คน', 'unit: people', 'g302');
function low(left, mid, right) { return `<div class="low"><div>${left}</div>${mid}<div class="rt">${right}</div></div>`; }
const lowIdle = () => low(`<div class="lk">${th('เกมรอบนี้', 'game card label', 'g302')}</div><div class="gname">${GNAME()}</div>`,
  `<div class="flow">${EV.field1.length}<small>${PEOPLE()}</small></div>`,
  `<div class="lk">${th('พิธีกรกดเริ่ม แล้วนับ 10 ถึง 0 พร้อมกันทั้งห้อง', 'fireworks idle: MC prompt')}</div>`);
const lowLive = (n, k) => low(`<div class="lk">${th(`พลุลูกที่ ${k} จาก 5`, 'fireworks reveal: burst counter')}</div><div class="gname">${GNAME()}</div>`,
  `<div class="flow"><span class="to">${n}</span><small>${PEOPLE()}</small></div>`,
  `<div class="lk">${th('โคมที่ดับ คือชื่อที่ไม่ผ่าน', 'fireworks reveal: legend line')}</div>`);
const lowEnd = () => low(`<div class="lk">${th('ผ่านรอบที่ 1', 'reveal: passed heading', 'g302')}</div><div class="gname">${GNAME()}</div>`,
  `<div class="flow"><span class="to">${EV.pass1.size}</span><small>${PEOPLE()}</small></div>`,
  `<div class="legend"><div><span class="chip in">${th('ผ่าน', 'legend: passed', 'g302')}</span></div><div><span class="chip out">${th('ไม่ผ่าน', 'legend: did not pass', 'g302')}</span></div></div>`);
// Bursts sit behind the lantern plane (z 0): in 3D they burst in the sky behind it, so they never cover a name.
const svgLayer = (inner) => `<svg class="layer" width="1920" height="1080" viewBox="0 0 1920 1080" style="z-index:0;" aria-hidden="true">${inner}</svg>`;

function elim(opt, kind) {
  const id = `fw-${kind}`;
  if (kind === 'idle') return frame(id, opt, '', `${top(1)}${lanterns('lit')}${lowIdle()}`);
  if (kind === 'countdown') {
    if (opt === 'A') return frame(id, opt, '', `${top(1)}${lanterns('lit')}${low(`<div class="lk">${th('ทั้งห้องนับพร้อมกัน', 'fireworks countdown: label')}</div><div class="gname">${GNAME()}</div>`, `<div class="cd"><div class="num">3</div></div>`, `<div class="lk">${th('ถึง 0 แล้วพลุจะขึ้น', 'fireworks countdown: what happens at zero')}</div>`)}`);
    return frame(id, opt, '', `${top(1)}${lanterns('lit', { dim: true })}<div class="veil"></div><div class="bignum"><div class="k">${th('ทั้งห้องนับพร้อมกัน', 'fireworks countdown: label')}</div><div class="num">3</div></div>`);
  }
  if (kind === 'reveal') {
    if (opt === 'A') {
      const n = remaining((i) => groupA(i) < 3);
      const b = BURSTS_A.map(([x, y], k) => (k < 3 ? burst(x, y, 170, 30 + k, { op: k === 2 ? 1 : 0.55 }) : k === 3 ? burst(x, y, 60, 33, { rays: 10 }) : '')).join('');
      return frame(id, opt, '', `${top(1)}${lanterns('A', { done: 3 })}${svgLayer(b)}${lowLive(n, 3)}`);
    }
    const sweepRow = 9; const n = remaining((i) => pos(i).r >= sweepRow);
    const y = 100 + 18.5 + sweepRow * 29 - 2;
    return frame(id, opt, '', `${top(1)}${lanterns('B', { sweepRow })}<div class="sweep" style="top:${y}px;"></div>${svgLayer(burst(960, 300, 330, 41, { colors: ['#ffcc00', '#ffffff', '#ff3d7f', '#2b7bff'], rays: 34, op: 0.85 }))}${lowLive(n, 1).replace(th('พลุลูกที่ 1 จาก 5', 'fireworks reveal: burst counter'), th('พลุลูกใหญ่ลูกเดียว', 'fireworks reveal B: the one burst'))}`);
  }
  if (kind === 'result') {
    const smoke = opt === 'A' ? BURSTS_A.map(([x, y], k) => burst(x, y, 140, 50 + k, { op: 0.22, rays: 14 })).join('') : burst(960, 300, 300, 60, { op: 0.2, rays: 24 });
    return frame(id, opt, '', `${top(1)}${lanterns('end')}${svgLayer(smoke)}${lowEnd()}`);
  }
  // rm: reduced motion. No particles, no flicker, no sweep: the countdown numerals step, one static burst mark fades in
  // over 200ms, then the end state fades in over 200ms (gh#302's --motion-rm-fade). Drawn at the end state.
  const mark = opt === 'A' ? burst(1700, 210, 90, 70, { rays: 12 }) : burst(960, 230, 120, 71, { rays: 16 });
  return frame(id, opt, '', `${top(1)}${lanterns('end')}${svgLayer(mark)}${lowEnd()}`);
}

// ---- final variant: five rockets carry the finalists' names; they burst in order and the last one up wins ----
// Burst order is prize order reversed: the 5th-prize rocket bursts first, the 1st-prize rocket last.
const RANKS = FINALISTS; // RANKS[0] wins prize 1
const COLS_FIN = [RANKS[2], RANKS[0], RANKS[4], RANKS[1], RANKS[3]]; // where each rocket stands, left to right
const rankOf = (n) => RANKS.indexOf(n) + 1;
function rocket(x, y, s, seed, trailTo) {
  // The trail is gold thinning to a point (a taper, not a gradient: the grammar admits no paint server).
  const top = y + 40 * s; const bot = Math.max(top, trailTo);
  const trail = trailTo != null ? `<polygon class="trail" points="${x - 5 * s},${top} ${x + 5 * s},${top} ${x + 0.5},${bot} ${x - 0.5},${bot}" fill="#ffcc00"/>` : '';
  return `${trail}<g class="rocket" transform="translate(${x} ${y}) scale(${s})"><path d="M0 -60 C14 -44 18 -24 18 0 L18 34 L-18 34 L-18 0 C-18 -24 -14 -44 0 -60z" fill="#ffffff"/><path d="M0 -60 C9 -50 13 -40 15 -30 L-15 -30 C-13 -40 -9 -50 0 -60z" fill="#ffcc00"/><path d="M-18 14 L-32 40 L-18 34z M18 14 L32 40 L18 34z" fill="#ff3d7f"/><circle cx="0" cy="-6" r="7" fill="#23214d"/></g>`;
}
function curvePath(x0, y0, x1, y1, bend) { return `M${x0} ${y0} C${x0 + bend} ${(y0 * 2 + y1) / 3} ${x1 - bend} ${(y0 + y1 * 2) / 3} ${x1} ${y1}`; }

function fin(opt, kind) {
  const id = `fwf-${kind}`; const xs = [300, 630, 960, 1290, 1620];
  const prizeLbl = (n) => `${th(`รางวัลที่ ${rankOf(n)}`, 'prize label', 'g302')}`;
  if (kind === 'result') {
    const fx = opt === 'A' ? [burst(330, 280, 240, 80, { colors: ['#ffcc00', '#ffffff', '#ff3d7f', '#2b7bff'], rays: 30, op: 0.5 }), burst(1590, 280, 240, 84, { colors: ['#ffcc00', '#ffffff', '#ff3d7f', '#2b7bff'], rays: 30, op: 0.5 })].join('') : [burst(520, 260, 260, 81, { op: 0.4 }), burst(1400, 230, 300, 82, { op: 0.45 }), burst(960, 180, 200, 83, { op: 0.35 })].join('');
    return frame(id, opt, '', `${svgLayer(fx)}${plainResult(RANKS, PRIZES, 5)}`);
  }
  const plates = []; let art = '';
  const PLATE_Y = 860;
  if (kind === 'idle') {
    COLS_FIN.forEach((n, i) => {
      const x = opt === 'A' ? xs[i] : 960 + (i - 2) * 230;
      const rot = opt === 'B' ? (i - 2) * 9 : 0;
      art += `<g transform="rotate(${rot} ${x} 760)">${rocket(x, 700, 2.2, i, null)}</g>`;
      plates.push(`<div class="plate up" style="left:${x}px; top:${opt === 'A' ? PLATE_Y : PLATE_Y + (i % 2) * 76 - 20}px;"><span class="${fit(24, 40)}">${nm(n)}</span></div>`);
    });
    art += `<rect x="120" y="790" width="1680" height="6" rx="3" fill="#23214d"/>`;
    const hud = `<div class="hud1"><div><div class="lk">${th('5 คนสุดท้าย', 'final: finalists label')}</div><div class="gname">${GNAME()}</div></div><div class="lk rt">${th('พลุลูกสุดท้ายที่ยังลอยอยู่ ได้รางวัลที่ 1', 'final: the rule, said on screen')}</div></div>`;
    return frame(id, opt, '', `${top('fin')}${svgLayer(art)}${plates.join('')}${hud.replace('<div class="hud1">', '<div class="hud1" style="top:120px; bottom:auto;">')}`);
  }
  // reveal (and rm): ranks 5, 4, 3 have burst; ranks 2 and 1 are still climbing.
  const rmMode = kind === 'rm';
  COLS_FIN.forEach((n, i) => {
    const r = rankOf(n); const burstDone = r >= 3;
    const x = opt === 'A' ? xs[i] : [330, 700, 1040, 1380, 1640][i];
    const apexY = opt === 'A' ? 300 + (5 - r) * 40 : [340, 270, 430, 330, 250][i];
    if (rmMode) {
      // no flight: each rocket stays on the pad and its plate flips to its prize, in order
      // the pad keeps fixed columns in both options: with no flight there is nothing to cross
      art += rocket(xs[i], 700, 1.6, 10 + i, null);
      const px = xs[i];
      plates.push(`<div class="plate ${burstDone ? 'done' : 'up'}" style="left:${px}px; top:795px;">${burstDone ? `<span class="pr">${prizeLbl(n)}</span>` : ''}<span class="${fit(24, 40)}">${nm(n)}</span></div>`);
      if (burstDone) art += burst(px, 560, 70, 90 + i, { rays: 10, op: 0.6 });
      return;
    }
    if (burstDone) {
      art += burst(x, apexY, 150, 100 + i, { op: r === 3 ? 1 : 0.5 });
      plates.push(`<div class="plate done" style="left:${x}px; top:${apexY + 170}px;"><span class="pr">${prizeLbl(n)}</span><span class="${fit(24, 40)}">${nm(n)}</span></div>`);
    } else {
      const y = r === 2 ? 470 : 430;
      if (opt === 'A') art += rocket(x, y, 1.3, 20 + i, 790);
      else { art += `<path d="${curvePath(960, 800, x, y + 50, (i % 2 ? 1 : -1) * 260)}" stroke="${faded('#ffcc00', 0.55)}" stroke-width="8" fill="none" stroke-linecap="round"/>`; art += rocket(x, y, 1.3, 20 + i, null); }
      plates.push(`<div class="plate up" style="left:${x}px; top:${y + 70}px;"><span class="${fit(24, 40)}">${nm(n)}</span></div>`);
    }
  });
  const hud = `<div class="hud1"><div><div class="lk">${th('ยังลอยอยู่ 2 ลูก', 'final reveal: rockets still up')}</div><div class="gname">${GNAME()}</div></div><div class="lk rt">${th('พลุลูกสุดท้ายที่ยังลอยอยู่ ได้รางวัลที่ 1', 'final: the rule, said on screen')}</div></div>`;
  return frame(id, opt, '', `${top('fin')}${svgLayer(art)}${plates.join('')}${hud}`);
}

const OPT = { A: 'FIVE BURSTS', B: 'ONE BIG BURST' };
const OPTF = { A: 'SIDE BY SIDE', B: 'CROSSING TRAILS' };

export const EXPECT_FW = { A: ['fw-idle', 'fw-countdown', 'fw-reveal', 'fw-result', 'fw-rm', 'fwf-idle', 'fwf-reveal', 'fwf-result', 'fwf-rm'], B: ['fw-idle', 'fw-countdown', 'fw-reveal', 'fw-result', 'fw-rm', 'fwf-idle', 'fwf-reveal', 'fwf-result', 'fwf-rm'], F: ['fw-fallback', 'fwf-fallback'] };

export function buildFireworks() {
  resetCopy();
  const sec = (title, why, frames) => `
  <div class="brow">
    <h2>${title}</h2>
    <p class="why">${why}</p>
    <div class="cands col">${frames.map(([t, f]) => `<div class="cand">${t}${scaled(f)}</div>`).join('')}</div>
  </div>`;
  const pair = (kind, fn, names, label) => ['A', 'B'].map((o) => [tag(o, names[o], ` · ${label} · authored 1920x1080, shown at 75%`, 'A'), fn(o, kind)]);
  const rows = [];
  rows.push(sec('ELIMINATION · IDLE · every remaining name is a lit lantern', `Same in both options. The event's ${EV.field1.length} joined names (gh#302 fixture: ${EV.invited} invited, ${EV.field1.length} joined, round 1 ${EV.field1.length} to ${EV.pass1.size}), three of them the NAME FIT worst cases; every lantern is lit gold with its name in ink (the room finds its own name before the countdown). 3D intent: the lanterns are one InstancedMesh of rounded quads on a plane facing the camera, names drawn once into a canvas-texture atlas; each lantern bobs 2 to 4px on its own slow phase and its glow flickers ±8%. Camera fixed, 35mm-equivalent, a 2 degree drift at most, so the names stay sharp.`, pair('idle', elim, OPT, 'fw-idle')));
  rows.push(sec('ELIMINATION · COUNTDOWN 10 to 0 · the room shouts it', '<b>A</b> keeps the whole field visible and puts the numeral in the lower band: people watch their own lantern while counting. <b>B</b> veils the field and fills the screen with the numeral: one focal point, the room looks at one thing. Frame drawn at 3.', pair('countdown', elim, OPT, 'fw-countdown')));
  rows.push(sec('ELIMINATION · REVEAL · the burst, and the lanterns that go dark', '<b>A FIVE BURSTS</b>: five rockets go up one after another; each burst darkens the lanterns nearest it that did not pass, so the field resolves in five waves from five points (drawn after burst 3: those three groups are resolved, the rest still lit). <b>B ONE BIG BURST</b>: one large burst over the top centre, then a single gold sweep line climbs from the bottom row to the top and every lantern it passes resolves (drawn with the sweep at row 10). Passed lanterns stay gold with their glow; the others go dark, dim and struck through: never colour alone.', pair('reveal', elim, OPT, 'fw-reveal')));
  rows.push(sec('ELIMINATION · ROUND RESULT', `The end state is the gh#302 reveal end state on lanterns: ${EV.pass1.size} passed, gold and bold with glow; ${EV.field1.length - EV.pass1.size} dark, dim, struck through. The smoke of the bursts hangs at 20% and clears over 3s.`, pair('result', elim, OPT, 'fw-result')));
  rows.push(sec('ELIMINATION · REDUCED MOTION', 'Reduce, not remove (ADR-0046, ADR-0051). The countdown numerals still step once a second (no scale pulse); at 0 one static burst mark fades in over 200ms, then the field fades to its end state over 200ms (gh#302\'s --motion-rm-fade). No particles, no flicker, no bob, no sweep. Drawn at the end state, with the burst mark.', pair('rm', elim, OPT, 'fw-rm')));
  rows.push(sec('ELIMINATION · NEVER-BLANK FALLBACK (ADR-0051)', 'No WebGL context, a lost context that does not restore, or a renderer error: the page shows the plain 2D reveal the owner picked on gh#302 (B, proj-reveal) and the round still finishes. Identical for both options.', [[`<div class="tag"><span class="d">FALLBACK</span> · fw-fallback · gh#302 proj-reveal B, picked<span class="pc">COPY APPROVED</span></div>`, frame('fw-fallback', 'F', '', plainReveal(GNAME()))]]));
  rows.push(sec('FINAL VARIANT · IDLE · five rockets carry the finalists\' names', '<b>A SIDE BY SIDE</b>: five rockets in five fixed columns, names on plates under them; they rise straight, so each name stays in its own column the whole time. <b>B CROSSING TRAILS</b>: the rockets stand fanned on one pad and rise on curved trails that cross, the plates following their rockets; more spectacle, harder to follow one name.', pair('idle', fin, OPTF, 'fwf-idle')));
  rows.push(sec('FINAL VARIANT · REVEAL · they burst in order, the last one up wins', 'Burst order is prize order reversed: the 5th-prize rocket bursts first, the 1st-prize rocket last. Drawn after three bursts: each burst rocket\'s plate hangs under its burst with its prize; two rockets are still climbing. With fewer than 5 prizes the first bursts read as no prize.', pair('reveal', fin, OPTF, 'fwf-reveal')));
  rows.push(sec('FINAL VARIANT · RESULT', 'The last rocket bursts biggest; the result is the gh#302 result frame (B, picked) under the fading burst.', pair('result', fin, OPTF, 'fwf-result')));
  rows.push(sec('FINAL VARIANT · REDUCED MOTION', 'No flight: the rockets stay on the pad and each plate turns to its prize in burst order, one 200ms fade each, with a small static burst mark. Drawn after three.', pair('rm', fin, OPTF, 'fwf-rm')));
  rows.push(sec('FINAL VARIANT · NEVER-BLANK FALLBACK (ADR-0051)', 'The plain 2D result (gh#302 proj-result, B, picked), revealed from prize 5 up to prize 1, one 200ms fade each.', [[`<div class="tag"><span class="d">FALLBACK</span> · fwf-fallback · gh#302 proj-result B, picked<span class="pc">COPY APPROVED</span></div>`, frame('fwf-fallback', 'F', '', plainResult(RANKS, PRIZES, 5))]]));

  const beatsA = [
    ['idle', 'until the MC presses start', 'lanterns bob 2-4px, glow flickers ±8% on a 2.4-3.6s phase per lantern (one InstancedMesh, per-instance phase)', 'still lanterns, no flicker'],
    ['countdown 10 to 0', '10 x 1000ms (the room shouts it, so the beat is the room\'s)', 'numeral scales 1.15 to 1.0 over 300ms ease-out each second; lanterns hold still', 'numeral steps once a second, no scale'],
    ['launch', '600ms', 'rocket 1 rises from below the frame on a gold trail (Points, 300 particles), ease-in', 'none'],
    ['burst 1..5', '5 x 1100ms: burst 400ms ease-out, wave 700ms', 'burst = Points, 1200 particles max per burst, additive blend, gravity fall; its group\'s non-passing lanterns dim, nearest first, 0.02s per lantern stagger', 'one static burst mark fades in 200ms once, then the whole field 200ms'],
    ['count', '800ms', `counter rolls ${EV.field1.length} to ${EV.pass1.size} linear (a constant-rate count)`, `counter jumps to ${EV.pass1.size}`],
    ['settle', '3000ms', 'smoke fades to 0; passed lanterns rise 6px and keep glowing', 'none'],
  ];
  const beatsB = [
    ['idle', 'until start', 'as A', 'as A'],
    ['countdown 10 to 0', '10 x 1000ms', 'veil fades in 300ms; numeral 560px scales 1.15 to 1.0 per second', 'veil in 200ms, numeral steps'],
    ['launch', '900ms', 'one rocket rises centre, trail 500 particles, camera tilts up 4 degrees and back', 'none'],
    ['burst', '700ms', 'one big burst, 3000 particles (the ceiling the rule starts at), veil lifts with it', 'static burst mark, 200ms fade'],
    ['sweep', '2400ms', 'gold sweep line climbs 19 rows linear, 126ms a row; each lantern it crosses resolves', 'whole field resolves in one 200ms fade'],
    ['count + settle', '800ms + 3000ms', 'as A', 'counter jumps'],
  ];
  const beatsFA = [
    ['idle', 'until start', 'rockets idle on the pad, a 1px wobble', 'still'],
    ['launch', '1200ms', 'all five rise together, ease-out, trails 300 particles each', 'none'],
    ['burst 5,4,3,2', '4 x 2400ms', 'each burst 1200 particles; its plate drops under it and turns to its prize', 'plate turns to its prize, 200ms fade each'],
    ['last burst', '1800ms', 'the 1st-prize rocket climbs on alone for 1200ms, bursts biggest (3000)', 'static burst mark, 200ms'],
    ['result', '600ms', 'the gh#302 result frame fades up under the burst', 'result fades 200ms'],
  ];
  const beatsFB = [
    ['idle', 'until start', 'rockets fanned on one pad', 'still'],
    ['launch', '1600ms', 'five curved trails rise and cross (CatmullRomCurve3 paths), plates follow their rockets', 'none'],
    ['burst 5,4,3,2', '4 x 2400ms', 'as A, at scattered heights', 'as A'],
    ['last burst + result', '1800ms + 600ms', 'as A', 'as A'],
  ];
  rows.push(`
  <div class="brow">
    <h2>MOTION · beat by beat, with the time chosen for each beat</h2>
    <p class="why">Timings are this board's proposal. The ui-ux-pro-max motion rules shaped them (see RULES CHECKED); none of its queries returned a countdown or a firework timing, so the beat lengths themselves are not from the skill. Totals: A about 17s from 0 to settled, B about 14s; the final about 15s (A) and 16s (B).</p>
    <h3>A FIVE BURSTS</h3>${beatTable(beatsA)}<h3>B ONE BIG BURST</h3>${beatTable(beatsB)}<h3>FINAL · A SIDE BY SIDE</h3>${beatTable(beatsFA)}<h3>FINAL · B CROSSING TRAILS</h3>${beatTable(beatsFB)}
  </div>`);
  rows.push(rulesRow('--domain ux "animation duration timing easing", "reduced motion", "excessive motion focal point", "projector legibility contrast large display distance", "color not only indicator", "flashing seizure flash" (returned nothing on flashing); --domain gsap "stagger timeline sequence", "countdown reveal timing" (scroll-reveal results only, not used); --stack threejs "particles performance instanced", "instanced mesh many objects draw calls", "webgl fallback context lost", "dispose memory pixel ratio", "camera depth lighting bloom", "text labels sprites canvas texture".', [
    '<b>Excessive Motion</b> (1 to 2 key elements per view): A animates the burst and its wave; B the burst, then the sweep. The chrome never moves. Checked on both.',
    '<b>Reduced Motion / Motion Sensitivity</b> (present the final readable state): the RM frames are those end states; the countdown still steps (reduce, not remove).',
    '<b>Easing Functions</b>: ease-out on arrivals (numeral, burst), linear on the count and the sweep (constant-rate progress).',
    '<b>Duration Timing</b> (no one duration for everything): beats run 300ms to 3000ms by what each one carries; the countdown second belongs to the room.',
    '<b>Stagger List</b> (gsap, 0.02 to 0.04s per item past 10 items): the dark wave staggers 0.02s per lantern.',
    '<b>Color Only</b>: a name that did not pass goes dark AND dim AND struck through; the legend says it in words.',
    '<b>Color Contrast</b> (4.5:1): every text pair below clears it; computed, not measured on a projector.',
    `<b>threejs</b>: Particle Count Ceiling (start at 3000, profile before raising: B's one burst is drawn at 3000, A's at 1200 each); Points plus BufferGeometry for every burst and trail; InstancedMesh for the lanterns (up to ${MAX_HEADS}; 50+ repeated meshes); Single Renderer Per Page; Pixel Ratio Cap at 2; dispose geometry, material and the name atlas texture when the round's scene goes; canvas role="img" with an aria-label, the round announced in a live region outside the canvas (ADR-0051).`,
    '<b>Not from the skill</b>: flashing. Its flash query returned nothing; WCAG 2.3.1 (no more than three flashes in any one second) is applied here from outside it: bursts are at least 400ms apart and no burst flashes the whole frame white.',
  ]));
  rows.push(`
  <div class="brow">
    <h2>VALUES · every frame value, token, gh#302 pick, or PROPOSAL</h2>
    <p class="why">${STAGE_DEVIATIONS} <b>Fonts:</b> Mitr 600/700 (numbers, labels, plates) and Sarabun 400/700 (names), the self-hosted files. <b>New on this board, PICKED 2026-11-11 (was PROPOSAL):</b> the lantern shape (radius 10px top, 16px bottom), the rocket drawing (white body, gold nose, pink fins), name plates 310px wide, 28px radius, names in Sarabun 700 40px (NAME FIT row), the countdown numeral at 140px (A, PICKED); 560px (B) was NOT PICKED. No new colour.</p>
    <div class="cands"><div class="cand">${valuesTable(STAGE_VALUES)}</div><div class="cand">${contrastTable(STAGE_PAIRS)}</div></div>
  </div>`);
  rows.push(nameFitRow([['lanterns (196 names)', 'Sarabun 700', '20px', '18px', '1 of 8 columns, 6px side padding', 'W x12 and U+0E12 x12: 19px, one line; U+0E12 U+0E33 x12: 18px, two lines (its row grows)'], ['fallback field (gh#302 picked)', 'Sarabun 700 / 400', '20px', '14px', '1 of 10 columns, 8px side padding', 'W x12 and U+0E12 x12: 14px, one line; U+0E12 U+0E33 x12: 14px, two lines (as on the gh#302 board)'], ['rocket plates (final)', 'Sarabun 700', '40px', '24px', '266px', 'W x12 and U+0E12 x12: 24px; U+0E12 U+0E33 x12: 24px, two lines'], ['result: prize 1 (gh#302 frame)', 'Mitr 700', '132px', '96px', 'frame width less 112px', 'drawn with a short name here (see the ladder board)'], ['result: prize 2 to 5 cards (gh#302 frame)', 'Mitr 700', '52px', '32px', 'a quarter of the row less 56px', 'W x12: 35px; U+0E12 x12: 32px; U+0E12 U+0E33 x12: 32px, two lines']]));
  rows.push(rolesRow('Gh303Fireworks'));
  rows.push(copyRow());
  rows.push(notesRow([
    '<b>Rests on gh#299:</b> decision 3 (the room counts aloud), 7 (equal odds: the burst order and which group a lantern falls in are drawn after the outcome, never before), 11 (3D on the main screen, never-blank fallback), the game sketch for the countdown fireworks game. <b>On gh#302 (picked 2026-11-11):</b> direction B for the projector, its copy, the 12-grapheme-cluster name limit and its NAME FIT rule.',
    '<b>Not drawn:</b> the round-code frame (gh#302\'s, shown before the countdown in QR mode); rounds 2 to 4 (same frames, fewer lanterns: a smaller field gets larger lanterns, never smaller than these); the 3D camera move itself (frames are 2D stills of the 3D intent).',
    '<b>Not covered:</b> a real projector, a real room, frame rate on the venue laptop. The particle counts are starting points to profile, not measurements.',
  ]));
  const OWNER = `<div class="pin q"><b>DECISIONS FOR THE OWNER (answered 2026-11-11, see APPROVAL RESULT above; the questions stay as history):</b><ul>
  <li><b>F1. Elimination reveal</b>: A FIVE BURSTS (five waves from five points, numeral in the lower band, field visible while counting; frames fw-countdown A, fw-reveal A) or B ONE BIG BURST (full-screen numeral over a veiled field, one burst then a sweep from the bottom up; frames fw-countdown B, fw-reveal B). The countdown placement and the reveal can be mixed: say so.</li>
  <li><b>F2. Final variant</b>: A SIDE BY SIDE (five fixed columns, every name easy to follow; fwf-idle A, fwf-reveal A) or B CROSSING TRAILS (fanned pad, crossing curved trails; fwf-idle B, fwf-reveal B).</li>
  <li><b>F3. Proposed copy</b>: approve, or mark strings to change (COPY SOURCES row).</li>
</ul></div>`;
  return boardDoc('gh#303 · prize draw · countdown fireworks', 'gh#303: proposal board, ADR-0033.', ['<b style="color: #ffcc00;">APPROVAL RESULT 2026-11-11 (owner popups):</b> F1 elimination reveal: <b>A FIVE BURSTS</b> PICKED (B ONE BIG BURST NOT PICKED, its frames stay below as history). F2 final variant: <b>A SIDE BY SIDE</b> PICKED (B CROSSING TRAILS NOT PICKED). F3: all proposed Thai copy APPROVED as it stands. The PROPOSAL values of the picked options are now picked values (VALUES row). Code takes its values only from the PICKED frames.', ORDER_LINE, 'Visual language: the gh#302 pick (B NIGHT STAGE on the projector, 2026-11-11). Each game is drawn in two options, A and B, where a real choice exists; idle, reveal, round result, reduced motion and the never-blank fallback are drawn for each. Frames are 2D stills of a 3D scene (three, ADR-0060); the 3D intent is written under each frame.', OWNER], STAGE_CSS + CSS, rows, { status: 'APPROVED 2026-11-11: F1 A, F2 A PICKED', pick: 'A' });
}
