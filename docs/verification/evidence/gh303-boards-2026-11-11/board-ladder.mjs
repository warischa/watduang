// gh#303 board: the lane-picking ladder final. Five finalists pick a lane; the rungs are already random, so every
// pick has the same odds (gh#299 decision 7); the paths are revealed rung by rung down to the prize slots.
import { th, nm, fit, esc, FINALISTS, PRIZES, rng, shuffle, faded, resetCopy, boardDoc, tag, ORDER_LINE, valuesTable, contrastTable, beatTable, copyRow, notesRow, rulesRow, nameFitRow } from './lib.mjs';
import { rolesRow } from './roles.mjs';
import { STAGE_CSS, STAGE_VALUES, STAGE_PAIRS, STAGE_DEVIATIONS, scaled, frame, top, plainResult } from './stage.mjs';

const CSS = `
    /* ---- lane-picking ladder ---- */
    .pj .lplate { position: absolute; margin-left: -160px; box-sizing: border-box; width: 320px; min-height: 64px; padding: 4px 14px 4px 12px; display: flex; align-items: center; gap: 10px;
                  border-radius: 999px; background: #23214d; color: #ffffff; font: 700 40px/1.15 'Sarabun', sans-serif; z-index: 3; }
    .pj .lplate i { flex: none; width: 18px; height: 18px; border-radius: 50%; }
    .pj .lplate .fit { flex: 1 1 auto; min-width: 0; text-align: center; line-height: 1.15; white-space: nowrap; overflow-x: clip; overflow-y: visible; }
    .pj .slot { position: absolute; margin-left: -150px; box-sizing: border-box; width: 300px; padding: 14px 16px; border-radius: 24px; background: #23214d; text-align: center; z-index: 3; }
    .pj .slot.prize { box-shadow: inset 0 0 0 3px #ffcc00; }
    .pj .slot.none { background: transparent; box-shadow: inset 0 0 0 2px #23214d; }
    .pj .slot .sk { font: 600 30px/1.25 'Mitr', sans-serif; color: #ffcc00; }
    .pj .slot.none .sk { color: #9a97c0; }
    .pj .slot .sp { font: 400 26px/1.3 'Sarabun', sans-serif; color: #d9d6f0; white-space: nowrap; }
    .pj .slot .sw { display: block; margin-top: 6px; font: 700 36px/1.2 'Sarabun', sans-serif; color: #ffffff; white-space: nowrap; overflow-x: clip; overflow-y: visible; }
    .pj .slot.prize .sw { color: #ffcc00; }
    .pj .slot.none .sw { color: #9a97c0; }
    .pj .hud2 { position: absolute; left: 56px; top: 330px; z-index: 3; }
    /* B's far prize slots (changed after the pick, stamped): full size in a row above the far lane ends, prize name at 30px. */
    .pj .slot.far .sp { font-size: 30px; }
    .pj .hud2r { position: absolute; right: 56px; top: 104px; z-index: 3; text-align: right; }`;

// Five path styles: colour plus dash, and each path ends in its finalist's plate colour dot (never colour alone:
// the plate and the slot name the finalist in words).
const STY = [['#ffcc00', ''], ['#ffffff', ''], ['#ff3d7f', ''], ['#2b7bff', ''], ['#ffffff', '14 10']];
const LANES = [280, 620, 960, 1300, 1640];
const ROWS = 12;
const RUNGS = (() => { // RUNGS[k] = list of left-lane indices joined to their right neighbour at row k
  const r = rng(303); const out = [];
  for (let k = 0; k < ROWS; k++) { const a = Math.floor(r() * 4); const row = [a]; const b = Math.floor(r() * 4); if (Math.abs(b - a) > 1 && r() < 0.6) row.push(b); out.push(row); }
  return out;
})();
const PICKS = shuffle([0, 1, 2, 3, 4], rng(5)); // FINALISTS[i] picked lane PICKS[i]
const trace = (lane) => { const steps = [lane]; let l = lane; for (let k = 0; k < ROWS; k++) { if (RUNGS[k].includes(l - 1)) l -= 1; else if (RUNGS[k].includes(l)) l += 1; steps.push(l); } return steps; };
const END = FINALISTS.map((_, i) => trace(PICKS[i]).at(-1));
// Prize slots: the MC set N prizes; they sit in a random order across the five slots, the rest read as no prize.
const slotsFor = (n) => { const order = shuffle([0, 1, 2, 3, 4], rng(77)); const s = Array(5).fill(-1); order.slice(0, n).forEach((slot, p) => { s[slot] = p; }); return s; };

// Face-on geometry (A): rows from y 260, 46px apart; lanes from y 236 to 830.
const fy = (k) => 268 + k * 46;
// Depth geometry (B): v 0 (near, bottom) to 1 (far, top).
const dy = (v) => 930 - 640 * Math.pow(v, 0.9);
const dx = (lane, v) => 960 + (lane - 2) * 360 * (1 - 0.45 * v);

// Two paths always cross a rung in opposite directions; the one moving right rides 5px above it and the one
// moving left 5px below, so both stay visible.
const off = (s, k) => (s[k + 1] > s[k] ? -5 : s[k + 1] < s[k] ? 5 : 0);
function pathPts(i, upto, geo) {
  const s = trace(PICKS[i]); const pts = [];
  if (geo === 'A') {
    pts.push([LANES[s[0]], 236]);
    for (let k = 0; k < Math.min(upto, ROWS); k++) { const o = off(s, k); pts.push([LANES[s[k]], fy(k) + o]); pts.push([LANES[s[k + 1]], fy(k) + o]); }
    pts.push([LANES[s[Math.min(upto, ROWS)]], upto >= ROWS ? 830 : fy(upto) - 22]);
  } else {
    const v = (k) => (k + 1) / (ROWS + 1);
    pts.push([dx(s[0], 0), dy(0)]);
    for (let k = 0; k < Math.min(upto, ROWS); k++) { const o = off(s, k); pts.push([dx(s[k], v(k)), dy(v(k)) + o]); pts.push([dx(s[k + 1], v(k)), dy(v(k)) + o]); }
    const last = Math.min(upto, ROWS); const vv = upto >= ROWS ? 1 : v(last) - 0.03;
    pts.push([dx(s[last], vv), dy(vv)]);
  }
  return pts;
}
// The glow band and the line are returned apart: every glow is drawn before any line, so an opaque (pre-composited)
// glow never covers another finalist's path.
const poly = (pts, [c, dash], glow, fade = 1) => [`${glow ? `<polyline points="${pts.map((p) => p.map((x) => x.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="${faded(c, 0.35 * fade)}" stroke-width="18" stroke-linejoin="round" stroke-linecap="round"/>` : ''}`, `<polyline points="${pts.map((p) => p.map((x) => x.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="${faded(c, fade)}" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`];

// fade: the whole drawing at that opacity, pre-composited per paint (the grammar admits no opacity).
function ladderSvg(geo, { rowsShown, upto, glow = true, rungMask = null, fade = 1 }) {
  let s = ''; const LANE = faded('#d9d6f0', 0.35 * fade), RUNG = faded('#d9d6f0', fade);
  for (let l = 0; l < 5; l++) s += geo === 'A' ? `<line x1="${LANES[l]}" y1="236" x2="${LANES[l]}" y2="830" stroke="${LANE}" stroke-width="5"/>` : `<line x1="${dx(l, 0)}" y1="${dy(0)}" x2="${dx(l, 1).toFixed(1)}" y2="${dy(1).toFixed(1)}" stroke="${LANE}" stroke-width="5"/>`;
  if (geo === 'B') for (let l = 0; l < 5; l++) s += `<line x1="${dx(l, 1).toFixed(1)}" y1="${dy(1).toFixed(1)}" x2="${LANES[l]}" y2="226" stroke="${LANE}" stroke-width="5"/>`;
  for (let k = 0; k < ROWS; k++) for (const a of RUNGS[k]) {
    const shown = rungMask ? rungMask(k, a) : k < rowsShown;
    if (!shown) continue;
    if (geo === 'A') s += `<line x1="${LANES[a]}" y1="${fy(k)}" x2="${LANES[a + 1]}" y2="${fy(k)}" stroke="${RUNG}" stroke-width="6" stroke-linecap="round"/>`;
    else { const v = (k + 1) / (ROWS + 1); s += `<line x1="${dx(a, v).toFixed(1)}" y1="${dy(v).toFixed(1)}" x2="${dx(a + 1, v).toFixed(1)}" y2="${dy(v).toFixed(1)}" stroke="${RUNG}" stroke-width="${(6 * (1 - 0.5 * v)).toFixed(1)}" stroke-linecap="round"/>`; }
  }
  if (geo === 'A' && rowsShown < ROWS && !rungMask) s += `<defs><linearGradient id="fog${rowsShown}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1a3c" stop-opacity="0"/><stop offset="0.12" stop-color="#1b1a3c" stop-opacity="0.92"/><stop offset="1" stop-color="#1f1d45" stop-opacity="0.92"/></linearGradient></defs><rect x="120" y="${fy(rowsShown) - 40}" width="1680" height="${830 - fy(rowsShown) + 44}" fill="url(#fog${rowsShown})"/>`;
  let glows = '', lines = '';
  FINALISTS.forEach((_, i) => { const u = typeof upto === 'function' ? upto(i) : upto; if (u < 0) return; const pts = pathPts(i, u, geo); const [gl, ln] = poly(pts, STY[i], glow, fade); glows += gl; lines += ln; const h = pts.at(-1); lines += `<circle cx="${h[0].toFixed(1)}" cy="${h[1].toFixed(1)}" r="13" fill="${faded(STY[i][0], fade)}"/>`; });
  return `<svg class="layer" width="1920" height="1080" viewBox="0 0 1920 1080" style="z-index:1;" aria-hidden="true">${s}${glows}${lines}</svg>`;
}

function plates(geo) {
  return FINALISTS.map((n, i) => {
    const x = geo === 'A' ? LANES[PICKS[i]] : dx(PICKS[i], 0);
    const y = geo === 'A' ? 160 : 950;
    return `<div class="lplate" style="left:${x.toFixed(1)}px; top:${y}px;"><i style="background:${STY[i][0]};${STY[i][1] ? ' box-shadow: inset 0 0 0 4px #23214d;' : ''}"></i><span class="${fit(24, 40)}">${nm(n)}</span></div>`;
  }).join('');
}
function slotRow(nPrizes, { landed = false, geo = 'A' } = {}) {
  const S = slotsFor(nPrizes);
  return S.map((p, slot) => {
    const who = landed ? FINALISTS.find((_, i) => END[i] === slot) : null;
    const x = LANES[slot];
    const head = p >= 0 ? `<div class="sk">${th(`รางวัลที่ ${p + 1}`, 'prize label', 'g302')}</div><div class="sp">${th(PRIZES[p], 'prize name (typed by the MC)', 'sample')}</div>` : `<div class="sk">${th('ไม่มีรางวัล', 'final: a slot with no prize')}</div><div class="sp">${th('ขอบคุณที่ร่วมลุ้น', 'final: the line under a no-prize slot')}</div>`;
    return `<div class="slot ${p >= 0 ? 'prize' : 'none'}${geo === 'B' ? ' far' : ''}" style="left:${x}px; top:${geo === 'A' ? 850 : 112}px;">${head}${who ? `<span class="sw ${fit(20, 36)}">${nm(who)}</span>` : ''}</div>`;
  }).join('');
}
const GNAME = () => th('ทางแยกเลือกเส้น', 'game name', 'ticket');

function ld(opt, kind) {
  const id = `ld-${kind}`;
  const N = 3; // prizes the MC set for this drawing (1 to 5 allowed)
  if (opt === 'A') {
    if (kind === 'idle') return frame(id, opt, '', `${top('fin')}${ladderSvg('A', { rowsShown: 0, upto: -1 })}${plates('A')}${slotRow(N)}`);
    if (kind === 'reveal') return frame(id, opt, '', `${top('fin')}${ladderSvg('A', { rowsShown: 7, upto: 7 })}${plates('A')}${slotRow(N)}`);
    if (kind === 'result') return frame(id, opt, '', `${top('fin')}${ladderSvg('A', { rowsShown: ROWS, upto: ROWS })}${plates('A')}${slotRow(N, { landed: true })}`);
    return frame(id, opt, '', `${top('fin')}${ladderSvg('A', { rowsShown: ROWS, upto: ROWS, glow: false })}${plates('A')}${slotRow(N, { landed: true })}`);
  }
  // B: depth track, one finalist at a time; a rung is revealed only when an orb reaches it.
  const reached = (doneUpTo, current, currentRow) => (k, a) => FINALISTS.some((_, i) => {
    const s = trace(PICKS[i]); const lim = i < doneUpTo ? ROWS : i === current ? currentRow : 0;
    for (let q = 0; q < lim; q++) if (q === k && Math.min(s[q], s[q + 1]) === a && s[q] !== s[q + 1]) return true;
    return false;
  });
  const hud = (txt) => `<div class="hud2"><div class="lk">${txt}</div><div class="gname">${GNAME()}</div></div>`;
  if (kind === 'idle') return frame(id, opt, '', `${top('fin')}${ladderSvg('B', { rowsShown: 0, upto: -1, rungMask: () => false })}${plates('B')}${slotRow(N, { geo: 'B' })}${hud(th('แต่ละคนเลือกเส้นแล้ว', 'ladder idle: lanes picked'))}`);
  if (kind === 'reveal') return frame(id, opt, '', `${top('fin')}${ladderSvg('B', { upto: (i) => (i < 1 ? ROWS : i === 1 ? 6 : 0), rungMask: reached(1, 1, 6) })}${plates('B')}${slotRow(N, { geo: 'B' })}${hud(th('เปิดทางทีละคน', 'ladder reveal B: one finalist at a time'))}`);
  if (kind === 'result') return frame(id, opt, '', `${top('fin')}${ladderSvg('B', { upto: ROWS, rungMask: reached(5, -1, 0), glow: false, fade: 0.25 })}${plainResult(rankList(N), PRIZES, N).replace(top('fin'), '')}`);
  return frame(id, opt, '', `${top('fin')}${ladderSvg('B', { upto: ROWS, rungMask: reached(5, -1, 0), glow: false })}${plates('B')}${slotRow(N, { geo: 'B', landed: false })}${hud(th('เปิดทางทีละคน', 'ladder reveal B: one finalist at a time'))}`);
}
// Finalists in prize order (prize 1 first), then the ones on no-prize slots.
function rankList(n) {
  const S = slotsFor(n);
  const byPrize = [...Array(n)].map((_, p) => FINALISTS[END.findIndex((e) => S[e] === p)]);
  return [...byPrize, ...FINALISTS.filter((f) => !byPrize.includes(f))];
}

const OPT = { A: 'FACE-ON, TOGETHER', B: 'DEPTH, ONE AT A TIME' };

export function buildLadder() {
  resetCopy();
  const sec = (title, why, frames) => `
  <div class="brow">
    <h2>${title}</h2>
    <p class="why">${why}</p>
    <div class="cands col">${frames.map(([t, f]) => `<div class="cand">${t}${scaled(f)}</div>`).join('')}</div>
  </div>`;
  const pair = (kind, label) => ['A', 'B'].map((o) => [tag(o, OPT[o], ` · ${label} · authored 1920x1080, shown at 75%`, 'B'), ld(o, kind)]);
  const one = (id, label, f) => [[`<div class="tag"><span class="d">${label}</span> · ${id}<span class="pc">COPY APPROVED</span></div>`, f]];
  const rows = [];
  rows.push(sec('IDLE · five finalists have picked their lanes', 'Drawn with 3 prizes set by the MC: three prize slots and two that read as no prize, in a random order. The picks are theatre (decision 7): the rungs exist before the picks and every lane has the same odds. <b>A</b> is face-on: names on plates at the top of their lanes, the ladder hidden, the slots along the bottom. <b>B</b> looks down the track from behind the finalists: names near and large, the slots far away and small. 3D intent: lanes and rungs are thin box geometry on one plane; A\'s camera is square to it; B\'s sits behind the start, 35 degrees above the plane, with FogExp2 softening the far end.', pair('idle', 'ld-idle')));
  rows.push(sec('REVEAL · rung by rung', '<b>A FACE-ON, TOGETHER</b>: the fog lifts one row of rungs at a time and all five paths advance together (drawn after row 7 of 12). <b>B DEPTH, ONE AT A TIME</b>: one finalist\'s light travels down its lane and a rung lights only where that light reaches it; the next finalist starts when the last lands (drawn with the first landed and the second half-way). A is about 10s; B about 30s, room for the MC to talk. <b>Changed after the pick (stamped 2026-11-11):</b> B\'s far prize slots were drawn at 62% scale, and measured 18.6px (label) and 16.1px (prize name) at 1920x1080, under the 30px projector minimum; they are now full size in a row above the far lane ends, joined to them by leader lines, with the prize name at 30px. Nothing else in B moved.', pair('reveal', 'ld-reveal')));
  rows.push(sec('ROUND RESULT', 'A: each finalist\'s name appears in the slot it reached; a no-prize slot names its finalist in dim type under "ไม่มีรางวัล". B: the camera reaches the slots and hands over to the gh#302 result frame (B, picked), the track faded behind it.', pair('result', 'ld-result')));
  rows.push(sec('REDUCED MOTION', 'Reduce, not remove: no travelling light, no fog drift, no camera move. A: each row of rungs and the five path steps through it fade in together, 200ms a row. B: each finalist\'s whole path fades in at once, 200ms, one finalist after another. Drawn at the end, without glow.', pair('rm', 'ld-rm')));
  rows.push(sec('ONE PRIZE · how the slots read when the MC sets fewer prizes', 'Drawn in the picked B layout (redrawn after the pick; it was drawn in A) with 1 prize: one gold slot, four that read as no prize. With 5 prizes every slot is gold.', one('ld-few', 'BOTH', frame('ld-few', 'F', '', `${top('fin')}${ladderSvg('B', { rowsShown: 0, upto: -1, rungMask: () => false })}${plates('B')}${slotRow(1, { geo: 'B' })}<div class="hud2"><div class="lk">${th('แต่ละคนเลือกเส้นแล้ว', 'ladder idle: lanes picked')}</div><div class="gname">${GNAME()}</div></div>`))));
  rows.push(sec('NEVER-BLANK FALLBACK (ADR-0051)', 'The plain 2D result the owner picked on gh#302 (B, proj-result), revealed from the last slot to prize 1, one 200ms fade each; no-prize finalists in dim type. Identical for both options.', one('ld-fallback', 'FALLBACK', frame('ld-fallback', 'F', '', plainResult(rankList(3), PRIZES, 3)))));
  const beatsA = [
    ['picks', 'until the MC presses start', 'plates drop onto their lanes, 300ms ease-out each, as the MC places them', 'plates appear in place'],
    ['row reveal x 12', '12 x 650ms = 7.8s', 'the fog edge slides down one row (250ms ease-out), then the five paths draw through it (400ms linear, constant-rate)', 'row and its path steps fade in, 200ms'],
    ['landing', '1200ms', 'each head drops into its slot; prize slots flare gold glow 0 to 60px', 'names fade into the slots, 200ms'],
    ['result hold', 'until the MC moves on', 'glow breathes once, then stills', 'still'],
  ];
  const beatsB = [
    ['picks', 'until start', 'as A, the camera behind the plates', 'as A'],
    ['travel x 5', '5 x (4.8s travel + 1.2s land) = 30s', 'one light runs its lane at a constant rate; a rung lights as it reaches it (200ms); the camera follows 1.5m behind', 'that finalist\'s path fades in whole, 200ms'],
    ['to the slots', '1500ms', 'the camera glides to face the slots, ease-in-out', 'cut, with a 200ms fade'],
    ['result', '600ms', 'the gh#302 result frame fades up, the track to 25%', 'fade 200ms'],
  ];
  rows.push(`
  <div class="brow">
    <h2>MOTION · beat by beat, with the time chosen for each beat</h2>
    <p class="why">Timings are this board's proposal, shaped by the ui-ux-pro-max motion rules (RULES CHECKED). The skill gave no ladder or path timing; the beat lengths are not from it.</p>
    <h3>A FACE-ON, TOGETHER</h3>${beatTable(beatsA)}<h3>B DEPTH, ONE AT A TIME</h3>${beatTable(beatsB)}
  </div>`);
  rows.push(rulesRow('--domain ux "animation duration timing easing", "reduced motion", "excessive motion focal point", "color not only indicator", "projector legibility contrast large display distance"; --stack threejs "camera depth lighting bloom", "webgl fallback context lost", "dispose memory pixel ratio", "text labels sprites canvas texture".', [
    '<b>Color Only</b>: five paths differ in colour AND one is dashed; each plate carries its path\'s dot and its name; the slot names the finalist in words.',
    '<b>Excessive Motion</b>: A animates the fog edge and the path heads; B one travelling light and the camera that follows it.',
    '<b>Reduced Motion</b>: the end state, reached by fades; the order (row by row, or finalist by finalist) is kept.',
    '<b>Easing Functions</b>: path drawing is linear (constant-rate progress); arrivals ease out; the camera glide eases in and out.',
    '<b>Color Contrast</b>: text pairs clear 4.5:1 (computed). <b>Size for distance</b>: B\'s far slots now render their label and prize name at 30px (measured; they were 18.6px and 16.1px at 62% scale before the stamped change).',
    '<b>threejs</b>: FogExp2 for B\'s depth (the skill\'s depth rule); MeshBasicMaterial for lanes, rungs and plates (flat, unlit); Single Renderer Per Page; Pixel Ratio Cap at 2; dispose on the round\'s end; canvas role="img" plus an aria-label, each landing announced in a live region (ADR-0051).',
  ]));
  rows.push(`
  <div class="brow">
    <h2>VALUES · every frame value, token, gh#302 pick, or PROPOSAL</h2>
    <p class="why">${STAGE_DEVIATIONS} <b>Name-fit rule (PICKED 2026-11-11, was PROPOSAL):</b> names on lane plates start at 40px (Sarabun 700) and shrink to fit the 320px plate, never below 24px; names in slots start at 36px, never below 20px. The board draws the three NAME FIT worst cases among the finalists (NAME FIT row). <b>New on this board, PICKED 2026-11-11 (was PROPOSAL) unless marked:</b> path styles (gold, white, pink, blue, white dashed; 7px with an 18px glow at 35%), rails at #d9d6f0 35%, the fog (#1b1a3c to #1f1d45 at 92%; A only, NOT PICKED), plates 320 x 64px, slots 300px wide with a 24px radius; in B the far slots at full size in a row joined to the lane ends by leader lines, prize names at 30px (the stamped change in the REVEAL row, after the pick). No new hue.</p>
    <div class="cands"><div class="cand">${valuesTable([...STAGE_VALUES, ['#1b1a3c / #1f1d45 at 92%', 'fog over unrevealed rungs (A)', 'NOT PICKED (was PROPOSAL; A only)']])}</div><div class="cand">${contrastTable([...STAGE_PAIRS, ['#2b7bff', '#14142b', 'blue path on the ground (non-text, 3:1)'], ['#ff3d7f', '#14142b', 'pink path on the ground (non-text, 3:1)']])}</div></div>
  </div>`);
  rows.push(nameFitRow([['lane plates', 'Sarabun 700', '40px', '24px', '320px plate less the dot and padding', 'W x12: 24 to 25px; U+0E12 x12: 24px; U+0E12 U+0E33 x12: 24px, two lines (the plate grows)'], ['names in slots', 'Sarabun 700', '36px', '20px', '300px slot less padding', 'U+0E12 U+0E33 x12: 20px, two lines; the others one line'], ['result: prize 1 (gh#302 frame)', 'Mitr 700', '132px', '96px', 'frame width less 112px', 'U+0E12 U+0E33 x12: 103px, one line'], ['result cards (gh#302 frame)', 'Mitr 700', '52px', '32px', 'a quarter of the row less 56px', 'W x12: 35px; U+0E12 x12: 32px']]));
  rows.push(rolesRow('Gh303Ladder'));
  rows.push(copyRow());
  rows.push(notesRow([
    '<b>Rests on gh#299:</b> decisions 7 (lane picks are theatre, equal odds), 9 (1 to 5 prizes, set by the MC), the game sketch. <b>On gh#302 (picked):</b> direction B, the result frame, the copy.',
    '<b>Not drawn:</b> how the MC places names on lanes (a setup-page control, gh#302\'s board); the phone\'s view of the final.',
    '<b>Not covered:</b> a real projector, venue frame rate.',
  ]));
  const OWNER = `<div class="pin q"><b>DECISIONS FOR THE OWNER (answered 2026-11-11, see APPROVAL RESULT above; the questions stay as history):</b><ul>
  <li><b>L1. Ladder</b>: A FACE-ON, TOGETHER (the whole ladder in view, all five paths advance row by row, about 10s; ld-reveal A) or B DEPTH, ONE AT A TIME (down the track from behind the finalists, one light at a time, about 30s, room for the MC; ld-reveal B).</li>
  <li><b>L2. A no-prize slot</b>: "ไม่มีรางวัล" with the line "ขอบคุณที่ร่วมลุ้น" under it (ld-idle, ld-few), or "ไม่มีรางวัล" alone.</li>
  <li><b>L3. Proposed copy</b>: approve, or mark strings to change (COPY SOURCES row).</li>
</ul></div>`;
  return boardDoc('gh#303 · prize draw · lane-picking ladder (final)', 'gh#303: proposal board, ADR-0033.', ['<b style="color: #ffcc00;">APPROVAL RESULT 2026-11-11 (owner popups):</b> L1 ladder: <b>B DEPTH, ONE AT A TIME</b> PICKED (A FACE-ON, TOGETHER NOT PICKED, its frames stay below as history). L2: a no-prize slot reads "ไม่มีรางวัล" with the line "ขอบคุณที่ร่วมลุ้น", APPROVED. L3: all proposed Thai copy APPROVED as it stands. <b>One change after the pick, stamped:</b> B\'s far prize slots measured 18.6px (label) and 16.1px (prize name) at 1920x1080, under the 30px projector minimum; they are now drawn at full size in a row above the far lane ends, joined by leader lines, with the prize name at 30px (see the REVEAL row).', ORDER_LINE, 'Visual language: the gh#302 pick (B NIGHT STAGE on the projector, 2026-11-11). Frames are 2D stills of a 3D scene (three, ADR-0060).', OWNER], STAGE_CSS + CSS, rows, { status: 'APPROVED 2026-11-11: L1 B PICKED', pick: 'B' });
}
export { esc };
