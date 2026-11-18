// gh#316 board: the marble-race elimination game. Every count is the gh#303 fixture (EV): 200 invited, 196 joined,
// round 1 cuts 196 to 100. The race only stages the draw (decision 7): crossing order is the draw's order, never a
// new chance. Frames are 2D stills of the 3D intent (three, ADR-0060), authored 1920x1080, shown at 75%.
import { th, nm, fit, EV, rng, fadedOver, ZC, resetCopy, boardDoc, tag, ORDER_LINE_PICKED, valuesTable, contrastTable, beatTable, copyRow, notesRow, rulesRow, nameFitRow } from './lib.mjs';
import { rolesRow } from './roles.mjs';
import { STAGE_CSS, STAGE_VALUES, STAGE_PAIRS, scaled, frame, top, plainReveal } from './stage.mjs';

const GNAME = () => th('แข่งลูกแก้ว', 'game name', 'ticket');
const PEOPLE = () => th('คน', 'unit: people', 'g302');
const MB = ['punch', 'sky', 'lilac', 'white']; // decoration only: marble colour carries no zone or fate meaning
const TRACK = '#14142b'; // the track ground: tokens.css --color-line-strong, the gh#302 night ground's top stop
const tFaded = (c, o) => fadedOver(c, o, TRACK);
const FINISH_X = 1740;

const CSS = `
    /* ---- marble race. A: a 770px track of 20 lanes. B: a 280px race strip over the full roster grid. ---- */
    .pj .low { height: 170px; }
    .pj .track { position: absolute; left: 56px; right: 56px; top: 100px; height: 770px; background-color: #14142b; border-radius: 24px; z-index: 1; }
    .pj .track.strip { height: 280px; }
    /* Frame coordinates: the track panel sits at 56,100; the plate column 16px inside it, below its 40px header. */
    .pj .lanes { position: absolute; left: 72px; top: 140px; width: 340px; height: 730px; display: grid; grid-auto-rows: 32px; row-gap: 4.5px; z-index: 3; }
    .pj .lanes .chip { width: 340px; height: 32px; font-size: 28px; font-weight: 700; justify-content: flex-start; padding: 0 12px; }
    .pj .tlabel { position: absolute; font: 600 30px/1 'Mitr', sans-serif; color: #d9d6f0; z-index: 3; white-space: nowrap; }
    .pj .tlabel.fin { color: #ffcc00; }
    .pj .grid.mgrid { top: 400px; height: 470px; grid-template-columns: repeat(10, minmax(0, 1fr)); grid-auto-rows: minmax(21px, auto); gap: 2px 10px; }
    .pj .grid.mgrid .chip { font-weight: 700; padding: 0 6px; }`;

// ---- the fixture's heats (layout A): 20 names a heat, 10 heats, the last 16 ----
const HEATS = (() => { const h = []; for (let i = 0; i < EV.field1.length; i += 20) h.push(EV.field1.slice(i, i + 20)); return h; })();
const heatSurv = HEATS.map((h) => h.filter((n) => EV.pass1.has(n)));
const heatOf = (n) => HEATS.findIndex((h) => h.includes(n));
// The crossing order is the draw's, staged heat-major: heats run one after another, so every survivor of heat n
// crosses before any survivor of heat n+1, each heat in its own drawn order. The draw still decides WHO survives
// (decision 7: the race stages a fixed result, it never draws one); only the staging is the race's.
const drawOrder = [...EV.pass1]; // the draw's survivor order (the fixture's insertion order)
const drawIdx = new Map(drawOrder.map((n, i) => [n, i]));
const crossOrder = HEATS.flatMap((h) => h.filter((n) => EV.pass1.has(n)).sort((a, b) => drawIdx.get(a) - drawIdx.get(b)));
// Heat-major is load-bearing: the freeze heat and the photo counts are read off this order, so an order that lets a
// later heat cross before an earlier one puts the cut in the wrong heat. It fails the build instead.
if (crossOrder.length !== EV.pass1.size || crossOrder.some((n, i) => i > 0 && heatOf(crossOrder[i - 1]) > heatOf(n))) {
  throw new Error('crossOrder is not the draw, heat-major: a heat crosses out of order');
}
// M2-A (picked 2026-11-16): time stops the instant the drawn 100th survivor crosses. Heats run in sequence, so that
// marble is crossOrder's last entry, and the still freezes in the last heat holding a survivor.
const drawCut = crossOrder[crossOrder.length - 1];
const freezeHeat = heatOf(drawCut);
const acrossAtCut = crossOrder.length; // the 100th crossing puts every survivor across
const PHOTO_N = 87; // the photo-finish still is drawn with this many across the line
// M2-B is NOT picked, and under heat lanes it is not a coherent option: with heats crossing in sequence, "the first
// 100 across stay in" would let heat order decide who crosses first, breaking the draw's equal odds. The still is
// drawn mid-race by the same staged order (the draw's first PHOTO_N crossings) and the board marks it incoherent.
const photoAcross = crossOrder.slice(0, PHOTO_N);
const crossedPhoto = new Set(photoAcross);
const photoHeat = heatOf(photoAcross[photoAcross.length - 1]);
const photoK = photoAcross.filter((n) => HEATS[photoHeat].includes(n)).length; // that heat's survivors already across
const photoCount = photoAcross.length; // the band: how many the draw has put across so far

// ---- svg helpers (frame coordinates; glows draw before any path, the gh#303 rule) ----
const svgLayer = (inner, z = 2) => `<svg class="layer" width="1920" height="1080" viewBox="0 0 1920 1080" style="z-index:${z};" aria-hidden="true">${inner}</svg>`;
function marble(cx, cy, r, colour, state, streak) {
  const body = state === 'in' ? '#ffcc00' : state === 'out' ? tFaded(ZC[colour], 0.4) : ZC[colour];
  const glow = state === 'in' ? `<circle class="glow" cx="${cx}" cy="${cy}" r="${r + 5}" fill="${tFaded('#ffcc00', 0.35)}"/>` : '';
  const st = streak && state === 'plain' ? `<polygon class="streak" points="${cx - r - 34},${cy - 2} ${cx - r + 2},${cy - 3} ${cx - r + 2},${cy + 3} ${cx - r - 34},${cy + 2}" fill="${tFaded(ZC[colour], 0.35)}"/>` : '';
  const hl = `<circle class="hl" cx="${cx - r * 0.3}" cy="${cy - r * 0.3}" r="${(r * 0.3).toFixed(1)}" fill="#ffffff"/>`;
  return { glow, st, body: `<circle class="mb${state === 'in' ? ' in' : state === 'out' ? ' out' : ''}" cx="${cx}" cy="${cy}" r="${r}" fill="${body}"/>`, hl };
}
// Draw order: every glow, then every streak, then every body, then every highlight (no glow covers a path).
function marbleLayer(list) {
  return list.map((m) => m.glow).join('') + list.map((m) => m.st).join('') + list.map((m) => m.body).join('') + list.map((m) => m.hl).join('');
}
// Separators sit midway in the gap between two plate rows (plateH tall, dy pitch).
const laneLines = (y0, dy, n, x0, x1, plateH) => Array.from({ length: n - 1 }, (_, i) => { const y = (y0 + dy * i + plateH + (dy - plateH) / 2).toFixed(2); return `<line class="lane" x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${tFaded('#d9d6f0', 0.25)}" stroke-width="2"/>`; }).join('');
const finish = (y, h) => `<rect class="finishglow" x="${FINISH_X - 12}" y="${y}" width="24" height="${h}" fill="${tFaded('#ffcc00', 0.35)}"/><rect class="finish" x="${FINISH_X - 2}" y="${y}" width="4" height="${h}" fill="#ffcc00"/>`;
const finLabel = (top) => `<div class="tlabel fin" style="left: 1620px; top: ${top}px;">${th('เส้นชัย', 'track: finish line label')}</div>`;

// ---- lower band ----
function low(left, mid, right) { return `<div class="low"><div>${left}</div>${mid}<div class="rt">${right}</div></div>`; }
const lowIdle = () => low(`<div class="lk">${th('เกมรอบนี้', 'game card label', 'g302')}</div><div class="gname">${GNAME()}</div>`,
  `<div class="flow">${EV.field1.length}<small>${PEOPLE()}</small></div>`,
  `<div class="lk">${th('พิธีกรกดเริ่ม แล้วลูกแก้วจะวิ่งเข้าเส้นชัย', 'marbles idle: MC prompt')}</div>`);
const lowLive = (n, label, line) => low(`<div class="lk">${label}</div><div class="gname">${GNAME()}</div>`,
  `<div class="flow"><span class="to">${n}</span><small>${PEOPLE()}</small></div>`,
  `<div class="lk">${line}</div>`);
const lowEnd = () => low(`<div class="lk">${th('ผ่านรอบที่ 1', 'reveal: passed heading', 'g302')}</div><div class="gname">${GNAME()}</div>`,
  `<div class="flow"><span class="to">${EV.pass1.size}</span><small>${PEOPLE()}</small></div>`,
  `<div class="legend"><div><span class="chip in">${th('ผ่าน', 'legend: passed', 'g302')}</span></div><div><span class="chip out">${th('ไม่ผ่าน', 'legend: did not pass', 'g302')}</span></div></div>`);
// PD-316-09 (c) (owner pick 2026-11-18): the denominator counts only the heats that run. M2-A ends at the freeze
// heat (the last heat holding a survivor); trailing heats with no survivor never load, so the counter never promises
// one. M2-B runs every heat. The fixture's freeze is heat 10 of 10, so the drawn counter reads the same either way.
const heatLabel = (h, total) => th(`ชุดที่ ${h + 1} จาก ${total}`, 'marbles: heat counter');
const FREEZE_LINE = () => th('ครบ 100 คน ลูกแก้วที่ข้ามเส้นชัย อยู่ต่อ', 'marbles freeze: the rule, said on screen');
const PHOTO_LINE = () => th('ข้ามเส้นก่อน 100 ลูกแรก อยู่ต่อ', 'marbles photo: the rule, said on screen');

// ---- layout A: heat lanes ----
const LANE_Y0 = 140, LANE_DY = 36.5;
// Judged invariants, read off the still's own content: the cut stills must show the heat and the across set the draw
// order (crossOrder) gives, and count what it gives. A still that disagrees reds the build instead of shipping.
function assertCutStill(kind, names, crossed, count) {
  const drawn = kind === 'photo' ? photoAcross : kind === 'reveal' ? crossOrder : null;
  if (!drawn) return;
  if (kind === 'reveal' && (freezeHeat < 0 || !names.includes(drawCut))) throw new Error(`mb-reveal A draws heat ${freezeHeat + 1}, which does not hold the drawn ${crossOrder.length}th survivor`);
  const owed = new Set(drawn.filter((n) => names.includes(n)));
  if (crossed.size !== owed.size || [...crossed].some((n) => !owed.has(n))) throw new Error(`mb-${kind} A draws an across set the draw order does not give`);
  if (count !== drawn.length) throw new Error(`mb-${kind} A counts ${count}, the draw has ${drawn.length} across`);
}
function lanesFrame(kind) {
  const heat = kind === 'idle' ? 0 : kind === 'photo' ? photoHeat : freezeHeat;
  const names = HEATS[heat];
  const r = rng(3160 + heat);
  const settled = kind === 'reveal' || kind === 'result' || kind === 'rm';
  // Idle must not leak the draw: nobody is across yet, every plate and marble is plain.
  const crossed = kind === 'photo' ? new Set(photoAcross.filter((n) => names.includes(n))) : kind === 'idle' ? new Set() : new Set(heatSurv[heat]);
  assertCutStill(kind, names, crossed, kind === 'photo' ? photoCount : acrossAtCut);
  const stateOf = (n) => settled ? (EV.pass1.has(n) ? 'in' : 'out') : crossed.has(n) ? 'in' : 'plain';
  const plates = names.map((n) => `<span class="chip${stateOf(n) === 'in' ? ' in' : stateOf(n) === 'out' ? ' out' : ''}"><span class="${fit(18, 28)}">${nm(n)}</span></span>`).join('');
  const ms = names.map((n, i) => {
    const cy = LANE_Y0 + LANE_DY * i + 16;
    const st = stateOf(n);
    const cx = kind === 'idle' ? 453 : st === 'in' ? 1758 + (i % 5) * 18 : 500 + Math.floor(r() * 1150);
    return marble(cx, cy.toFixed(1), 13, MB[i % 4], st, kind === 'photo');
  });
  // Idle is judged too: zero across, so a frame that leaks the draw at idle fails the count check.
  const expect = ` data-expect="${names.length}/${names.filter((n) => stateOf(n) === 'in').length}"`;
  const art = laneLines(LANE_Y0, LANE_DY, names.length, 72, 1848, 32) + finish(LANE_Y0, 730) + marbleLayer(ms);
  const band = kind === 'idle' ? lowIdle()
    : kind === 'photo' ? lowLive(photoCount, heatLabel(heat, HEATS.length), PHOTO_LINE())
    : kind === 'reveal' ? lowLive(acrossAtCut, heatLabel(heat, freezeHeat + 1), FREEZE_LINE())
    : lowEnd();
  return `${top(1)}<div class="track"></div>${svgLayer(art)}<div class="lanes"${expect}>${plates}</div>${finLabel(106)}${band}`;
}

// ---- layout B: the pack race over the full roster ----
function packFrame(kind) {
  const r = rng(3170);
  const settled = kind === 'reveal' || kind === 'result' || kind === 'rm';
  // Idle must not leak the draw: no marble is across yet, the whole grid is plain.
  const inSet = kind === 'idle' ? new Set() : kind === 'photo' ? crossedPhoto : EV.pass1;
  const stateOf = (n) => inSet.has(n) ? 'in' : settled ? 'out' : 'plain';
  const ms = EV.field1.map((n, i) => {
    const st = stateOf(n);
    const cy = 150 + Math.floor(r() * 200);
    const cx = kind === 'idle' ? 90 + Math.floor(r() * 120)
      : st === 'in' ? 1755 + Math.floor(r() * 80)
      : 90 + Math.floor(Math.pow(r(), 0.6) * 1600);
    return marble(cx, cy, 7, MB[i % 4], st, kind === 'photo');
  });
  const chips = EV.field1.map((n) => `<span class="chip${stateOf(n) === 'in' ? ' in' : stateOf(n) === 'out' ? ' out' : ''}"><span class="${fit(14, 18)}">${nm(n)}</span></span>`).join('');
  const passN = EV.field1.filter((n) => stateOf(n) === 'in').length;
  // Judged invariant: the grid lights exactly the draw's first PHOTO_N, and the band says that same number.
  if (kind === 'photo' && (passN !== photoCount || photoCount !== crossedPhoto.size)) throw new Error(`mb-photo B lights ${passN} and counts ${photoCount}, the draw has ${crossedPhoto.size} across`);
  // Idle is judged too: zero across, so a frame that leaks the draw at idle fails the count check.
  const expect = ` data-expect="${EV.field1.length}/${passN}"`;
  const art = finish(110, 260) + marbleLayer(ms);
  const band = kind === 'idle' ? lowIdle()
    : kind === 'photo' ? lowLive(photoCount, th('ลูกแก้วข้ามเส้นแล้ว', 'marbles photo: across counter'), PHOTO_LINE())
    : kind === 'reveal' ? lowLive(EV.pass1.size, th('ครบจำนวนแล้ว หยุดเวลา', 'marbles freeze: label'), FREEZE_LINE())
    : lowEnd();
  return `${top(1)}<div class="track strip"></div>${svgLayer(art)}${finLabel(106)}<div class="grid mgrid"${expect}>${chips}</div>${band}`;
}

const OPT1 = { A: 'HEAT LANES', B: 'PACK + FULL ROSTER' };
const OPT2 = { A: 'FREEZE AT THE CUT', B: 'PHOTO FINISH' };
export const EXPECT_MARBLES = {
  A: ['mb-idle', 'mb-reveal', 'mb-photo', 'mb-result', 'mb-rm'],
  B: ['mb-idle', 'mb-reveal', 'mb-photo', 'mb-result', 'mb-rm'],
  F: ['mb-fallback'],
};

export function buildMarbles() {
  resetCopy();
  const sec = (title, why, frames) => `
  <div class="brow">
    <h2>${title}</h2>
    <p class="why">${why}</p>
    <div class="cands col">${frames.map(([t, f]) => `<div class="cand">${t}${scaled(f)}</div>`).join('')}</div>
  </div>`;
  const rows = [];
  const f2 = (kind, fn, note = {}) => ['A', 'B'].map((o) => [tag(o, OPT1[o], ` · mb-${kind} · authored 1920x1080, shown at 75%${note[o] ? ` · ${note[o]}` : ''}`), frame(`mb-${kind}`, o, '', fn(o))]);
  rows.push(sec('M1 · IDLE · the field at the start line', `The event's ${EV.field1.length} joined names (gh#302 fixture: ${EV.invited} invited, ${EV.field1.length} joined, round 1 ${EV.field1.length} to ${EV.pass1.size}), three of them the NAME FIT worst cases. <b>A HEAT LANES</b>: the field runs in ${HEATS.length} heats of 20 (the last ${HEATS.at(-1).length}); each lane carries its name on a 340px plate, names 28px shrinking to an 18px floor — 20 names read big at a time, the whole field over the round. <b>B PACK + FULL ROSTER</b>: all ${EV.field1.length} names read at once in a 10-column grid (names 18px to a 14px floor) under a 280px race strip; the pack is spectacle, the grid is the readable truth. Marble colour is decoration (four canvas accents cycling); it carries no zone or fate meaning — fate is gold or dim. 3D intent: marbles are one InstancedMesh of glass spheres (a spec highlight, no transmission pass), the track a plane; layout B's grid is DOM over the canvas, so names stay crisp at any pixel ratio.`, f2('idle', (o) => (o === 'A' ? lanesFrame('idle') : packFrame('idle')))));
  rows.push(sec('M2-A · FREEZE AT THE CUT · the race stops when the drawn count crosses', `The race runs; the instant the ${EV.pass1.size}th survivor crosses the line, time freezes. Across the line: gold with the glow (the gh#302 passed state). Stopped short: dim, the marble colour at 40%. <b>A</b> freezes in heat ${freezeHeat + 1} of ${HEATS.length} (the heat holding the last survivor in the draw's order); its ${heatSurv[freezeHeat].length} survivors are across, the rest stopped mid-track. <b>B</b> freezes the whole pack: ${EV.pass1.size} across, ${EV.field1.length - EV.pass1.size} stopped, and the grid resolves with them. The freeze is theatre: the draw fixed the survivors before the race started (decision 7).`, f2('reveal', (o) => (o === 'A' ? lanesFrame('reveal') : packFrame('reveal')))));
  rows.push(sec('M2-B · PHOTO FINISH · crossing order is the draw order', `No freeze: every marble runs to the line, and the first ${EV.pass1.size} across are the survivors — the crossing order IS the draw's uniform order, so the odds are the draw's, never the race's. Drawn mid-race with ${photoCount} across: <b>A</b> in heat ${photoHeat + 1} (the heat holding the ${photoCount}th crossing), ${photoK} of its survivors across, the band counting ${photoCount} of ${EV.pass1.size} overall; <b>B</b> with ${photoCount} marbles across and the grid lighting name by name. The marbles still rolling are not yet judged; once the ${EV.pass1.size}th crosses, the rest dim as they finish. <b>A is NOT a coherent staging of M2-B under heat lanes:</b> with heats crossing in sequence, "the first ${EV.pass1.size} across stay in" would let heat order decide who crosses first, which breaks the draw's equal odds. The frame is drawn only to complete the option pair; M2-B was not picked.`, f2('photo', (o) => (o === 'A' ? lanesFrame('photo') : packFrame('photo')), { A: 'NOT COHERENT WITH HEAT LANES (M2-B unpicked)' })));
  rows.push(sec('M1 · ROUND RESULT · who stayed in', `The end state: ${EV.pass1.size} passed, gold; ${EV.field1.length - EV.pass1.size} dim. <b>A</b> shows the freeze heat's lanes settled (the cut landed in the last heat, so the round ended there) with the cumulative count; <b>B</b> shows the whole grid resolved, every name's fate readable at once. The lower band is the gh#302 picked result band.`, f2('result', (o) => (o === 'A' ? lanesFrame('result') : packFrame('result')))));
  rows.push(sec('M1 · REDUCED MOTION · the 2D path (also what below 640px shows)', 'Reduce, not remove (ADR-0046, ADR-0051). No rolling, no streaks: the marbles are drawn at their final positions and the field resolves in one 200ms fade (gh#302 --motion-rm-fade); counts jump. Drawn at the end state, identical to the result still. Below 640px the shared reveal host serves this same 2D path; the plain field of the fallback frame is what a phone renders.', f2('rm', (o) => (o === 'A' ? lanesFrame('rm') : packFrame('rm')))));
  rows.push(sec('NEVER-BLANK FALLBACK (ADR-0051)', 'No WebGL context, a lost context that does not restore, or a renderer error: the page shows the plain 2D reveal the owner picked on gh#302 (B, proj-reveal) and the round still finishes. Identical for every option.', [[`<div class="tag"><span class="d">FALLBACK</span> · mb-fallback · gh#302 proj-reveal B, picked<span class="pc">COPY APPROVED</span></div>`, frame('mb-fallback', 'F', '', plainReveal(GNAME()))]]));

  const beatsA = [
    ['idle', 'until the MC presses start', 'marbles hold at the start line, a 1px spec shimmer on a 3s phase; plates still', 'still marbles, no shimmer'],
    ['heat launch', '600ms', 'the heat\'s 20 marbles ease-out from the gate (ease-in on the first 100ms, then ease-out)', 'marbles appear at their final positions, no launch'],
    ['the race', '6000ms a heat', 'marbles roll left to right, seeded speed curves that cross and re-cross (the draw\'s order fixed before launch); crossings spread over the back 40% of the race (from 0.6) with a per-heat jitter, the last crossing exactly at the heat\'s end (RATIFIED as built, PD-316-07, owner pick 2026-11-18); streaks at 35% behind each; the band count rolls as survivors cross', 'no rolling: the heat resolves in one 200ms fade'],
    ['coast', '400ms', 'across-marbles roll past the line to their resting places (T.coast, the pulse length reused; RATIFIED as built, PD-316-05, owner pick 2026-11-18)', 'the resting places are drawn, no roll'],
    ['the cut', '1200ms hold', 'M2-A: time freezes the instant the last survivor crosses, a gold pulse once on the finish line (400ms, a 48px-wide quad at 0.35 x sin, no flash; RATIFIED as built, PD-316-06, owner pick 2026-11-18); M2-B: the first 100 across light gold, the rest dim as they finish (0.02s stagger)', 'the end state fades in 200ms, counts jump'],
    ['settle', '3000ms', 'streaks fade to 0; across-marbles keep the glow; the next heat loads (M2-B) or the round ends (M2-A)', 'none'],
  ];
  const beatsB = [
    ['idle', 'until start', 'the pack holds at the start, the grid plain; a 1px spec shimmer', 'still, no shimmer'],
    ['the race', '8000ms', 'all 196 marbles roll as one pack (one InstancedMesh, per-instance phase); the grid lights each name gold as its marble crosses, 0.02s stagger', 'the grid resolves in one 200ms fade'],
    ['the cut', '1200ms hold', 'as A: freeze with one gold pulse, or the first 100 across light and the rest dim', 'one 200ms fade, counts jump'],
    ['settle', '3000ms', 'streaks fade; the grid holds the resolved field', 'none'],
  ];
  rows.push(`
  <div class="brow">
    <h2>MOTION · beat by beat, with the time chosen for each beat</h2>
    <p class="why">Timings are this board's proposal; the ui-ux-pro-max motion rules shaped them (RULES CHECKED). No query returned a marble-race timing, so the beat lengths themselves are not from the skill. The coast, the pulse strength and the crossing spread are RATIFIED as built (owner picks 2026-11-18: PD-316-05, PD-316-06, PD-316-07). Totals: A about ${(0.6 + 6 + 0.4 + 1.2 + 3).toFixed(1)}s a heat x ${HEATS.length} heats (M2-B) or one freeze (M2-A, about ${(0.6 + 6 * (freezeHeat + 1) + 1.2 + 3).toFixed(0)}s); B about ${(8 + 1.2 + 3).toFixed(1)}s. The built round's own 77.4s was accepted as built by the owner ruling of 2026-11-17 (the rest between heats and the launch are not beats this sheet draws). The MC conducts the room's cheering; nothing here rushes it.</p>
    <h3>A HEAT LANES</h3>${beatTable(beatsA)}<h3>B PACK + FULL ROSTER</h3>${beatTable(beatsB)}
  </div>`);
  rows.push(rulesRow('--domain ux "animation reveal duration easing stagger", "readability large display distance contrast font size", "reduced motion vestibular sensitivity", "color only indicator meaning accessibility", "flashing seizure blink" (returned nothing); --stack threejs "instanced mesh many objects performance", "webgl context lost fallback".', [
    '<b>Excessive Motion</b> (1 to 2 key elements per view): the race is the one moving element (the pack, or one heat); the grid resolves as its readout, the chrome never moves.',
    '<b>Reduced Motion / Motion Sensitivity</b> (respect prefers-reduced-motion, present the final readable state): the RM frames are those end states; the round still finishes (ADR-0051: reduce, not remove).',
    '<b>Easing Functions</b>: ease-out on arrivals (the launch, the gold pulse); the roll itself is a seeded speed curve, not a UI transition; linear on the count (constant-rate progress, the gh#303 carve-out).',
    '<b>Duration Timing</b> (150-300ms micro, never one duration for everything): the launch 600ms, the cut pulse 400ms, fades 200ms, the count 800ms; the race beat is 6-8s because the room cheers through it, and it is the MC\'s to conduct.',
    '<b>Continuous Animation</b> (loading only, never decorative): the idle spec shimmer is the one ambient loop, 1px, and it stops under reduced motion.',
    '<b>Color Only</b>: fate is gold AND the glow AND the grid\'s struck-through dim state AND the legend in words; marble colour is decoration and the board says so, so no meaning rests on it.',
    '<b>Color Contrast</b> (4.5:1 normal text): every text pair below clears it, computed 2026-11-16. The dim marble bodies are graphics, held to 3:1 against the track.',
    '<b>Readable Font Size</b> (16px minimum body on mobile): the phone path is the plain 2D field (fallback frame), names to a 14px floor as the gh#302 pick set it; layout A reads 20 names at 28px, layout B all 196 at 18px to a 14px floor — the tradeoff the owner picks.',
    '<b>threejs</b>: InstancedMesh for the marbles (196, 50+ identical spheres, one draw call); Points plus BufferGeometry for any spark effect, ceiling 3000, profile before raising; Single Renderer Per Page; Pixel Ratio Cap at 2; dispose geometry and material when the round scene goes; canvas role="img" with an aria-label, the round announced in a live region outside the canvas (ADR-0051). Layout B\'s name grid is DOM, not a texture: 196 names stay crisp and selectable by assistive tech.',
    '<b>Not from the skill</b>: flashing. Its flash query returned nothing; WCAG 2.3.1 (no more than three flashes in any one second) is applied from outside it: the cut pulse is one 400ms event, never a strobe.',
  ]));
  rows.push(`
  <div class="brow">
    <h2>VALUES · every frame value, token, gh#302/gh#303 pick, or PROPOSAL</h2>
    <p class="why"><b>Departures from the gh#302 picked values (B), each a PROPOSAL for the game frames only; the fallback frame carries the gh#302 picked values unchanged:</b> the lower band is 170px tall (from gh#303's 190px). Layout A: a 770px ink track (#14142b, the gh#302 night ground's top stop; 24px radius, the winner-card radius), 20 lanes of 36.5px, name plates 340x32px with names 28px to an 18px floor, marbles 26px across, the finish line 4px gold with a 24px glow at 35%. Every fade on the track is pre-composited over #14142b (fadedOver), not over the frame's ground midpoint. Layout B: a 280px race strip over a 10-column grid of 21px rows (names 18px to a 14px floor, from the gh#302 fallback's 32px rows and 20px), marbles 14px across. <b>Fonts:</b> Mitr 600 (labels) and Sarabun 700 (names), the self-hosted files. <b>New on this board, PROPOSAL:</b> the marble drawing (body, spec highlight, streak, glow), the track and finish line, the heat wording. No new colour: every value below is in the canvas. Gold is the passed state (the gh#302 pick); marble identity colours are the four non-gold accents, decoration only.</p>
    <div class="cands"><div class="cand">${valuesTable([...STAGE_VALUES, ['#ffcc00', 'finish line, across-marbles, the cut pulse', 'tokens.css --accent-gold; gh#302 B picked'], ...MB.map((k) => [ZC[k], `marble body (${k}), decoration only`, 'tokens.css / the gh#302-gh#303 picks (see the zone board VALUES for each source)']), [tFaded('#ffcc00', 0.35), 'finish glow, marble glow (35% over #14142b, the track, pre-composited)', 'PROPOSAL: --accent-gold, fadedOver() as gh#303'], [tFaded('#d9d6f0', 0.25), 'lane separators (25% over the track, pre-composited)', 'RATIFIED as built 2026-11-18 (PD-316-03 (a), owner pick): kept at 25% — context once the marbles paint again (PD-316-01, fixed); --ink-on-band-soft, the gh#303 ladder mechanism'], ['48px-wide quad at 0.35 x sin over 400ms (peak: the 35% gold above)', 'the cut pulse on the finish line', 'RATIFIED as built 2026-11-18 (PD-316-06, owner pick); the finish line keeps its 4px gold + 24px glow'], ...MB.map((k) => [tFaded(ZC[k], 0.4), `a stopped marble (${k}, 40% over the track, pre-composited)`, 'PROPOSAL: the dim state on a marble']), ...MB.map((k) => [tFaded(ZC[k], 0.35), `a rolling streak (${k}, 35% over the track, pre-composited)`, 'PROPOSAL'])])}</div><div class="cand">${contrastTable([...STAGE_PAIRS, ['#ffffff', '#23214d', 'plate names on the night pill'], ['#ffcc00', '#14142b', 'the finish label on the track'], ['#d9d6f0', '#14142b', 'track labels on the track']])}</div></div>
  </div>`);
  rows.push(nameFitRow([
    ['A lane plates (20 a heat)', 'Sarabun 700', '28px', '18px', '340px plate less 24px padding (316px)', 'W x12 and U+0E12 x12: 18px, one line; U+0E12 U+0E33 x12: 18px, one line (the wide plate takes it)'],
    ['B roster grid (196 names)', 'Sarabun 700', '18px', '14px', '1 of 10 columns, 6px chip side padding', 'W x12 and U+0E12 x12: 14px, one line; U+0E12 U+0E33 x12: 14px, two lines (its row grows)'],
    ['fallback field (gh#302 picked)', 'Sarabun 700 / 400', '20px', '14px', '1 of 10 columns, 8px side padding', 'W x12 and U+0E12 x12: 14px, one line; U+0E12 U+0E33 x12: 14px, two lines (as on the gh#302 board)'],
  ]));
  rows.push(rolesRow('Gh316Marbles'));
  rows.push(copyRow());
  rows.push(notesRow([
    '<b>Rests on gh#299:</b> decision 3 (the room cheers the race), 7 (equal odds: the crossing order is the draw\'s order, fixed before launch; the race stages it, never draws it), 11 (3D on the main screen, never-blank fallback), 12 (the phase-2 library). <b>On gh#302 (picked 2026-11-11):</b> direction B, its copy, the 12-cluster name limit and NAME FIT. <b>On gh#303 (picked 2026-11-11):</b> the gold passed / dim struck out states, the pre-composited fade mechanism, the 190px band this board proposes at 170px.',
    '<b>The 200-name tradeoff (M1):</b> A reads 20 names big (28px) heat by heat — every name reads over the round, never all at once; B reads all 196 at once, smaller (18px to a 14px floor). The ticket asks that 200 names read on a projector; both answer it, differently. The owner picks.',
    '<b>Not drawn:</b> the round-code frame (gh#302\'s, QR mode); rounds 2 to 4 (fewer names: A\'s heats shrink, B\'s grid keeps its floors); the phone verdict screen (gh#309\'s); the 3D camera and the glass material itself (frames are 2D stills of the 3D intent).',
    '<b>Ratified as built (owner picks 2026-11-18, gh#316):</b> PD-316-08 heats are cut in roster order (the next 20 names, never shuffled; only the pace inside a heat is seeded, and it is never stored); PD-316-09 (c) trailing heats with no survivor are skipped, and the heat counter\'s denominator is the heats that run, so the counter never promises a heat that will not load (the fixture freezes in heat 10 of 10, so the drawn counter is unchanged); PD-316-04 (a) the shared centred field stays where it still shows (the 40-name projector field, the gh#302 fallback behaviour).',
    '<b>Not covered:</b> a real projector, a real room, frame rate on the venue laptop with 196 instanced marbles; the seeded speed curves are a proposal to profile, not a measurement.',
  ]));
  const OWNER = `<div class="pin q"><b>DECISIONS PICKED 2026-11-16 (owner popups, recorded on gh#316):</b><ul>
  <li><b>M1. Track and how 200 names read: A HEAT LANES</b> — 10 heats of 20 (the last 16), names 28px on plates, 20 read big at a time.</li>
  <li><b>M2. The cut moment: A FREEZE AT THE CUT</b> — time stops the instant the drawn count crosses.</li>
  <li><b>M3. Proposed copy:</b> approved as it stands.</li>
  <li>The 2026-11-18 audit picks are quoted verbatim in the header banner; the stamps land in MOTION (PD-316-05, PD-316-06, PD-316-07), VALUES (PD-316-03, PD-316-06), NOTES (PD-316-04, PD-316-08, PD-316-09) and the heat counter itself (PD-316-09 (c): the denominator is the heats that run). Frames drawn to a pick go to code without a separate sign-off (owner ruling); the code picks are built under gh#319.</li>
</ul></div>`;
  return boardDoc('gh#316 · prize draw · marble race', 'gh#316: board drawn to the owner\'s picks, ADR-0033.', [ORDER_LINE_PICKED, 'The board decisions were picked 2026-11-16 (M1 A, M2 A, M3 approved); the 2026-11-18 audit picks below are quoted verbatim from the last pick comment on gh#316. Visual language: the gh#302 pick (B NIGHT STAGE on the projector, 2026-11-11) and the gh#303 picks. Each decision is drawn in options A/B; idle, reveal (both cut moments), round result, reduced motion (the 2D path, also what below 640px shows) and the never-blank fallback are drawn for each. Frames are 2D stills of a 3D scene (three, ADR-0060); the 3D intent is written under each frame.', OWNER], STAGE_CSS + CSS, rows, { status: 'DRAWN TO THE OWNER\'S PICKS 2026-11-18', pick: '', rulings: MARBLES_RULINGS, picks: PICKS_316 });
}

// The 2026-11-18 rulings that change this canvas (the audit picks, gh#316's last pick comment; gh#319 builds them).
const MARBLES_RULINGS = 'PD-316-03 — separators stay at 25% (VALUES) · PD-316-05 — the 400ms coast stamped on MOTION · PD-316-06 — the cut pulse 0.35 / 48px stamped (MOTION, VALUES) · PD-316-07 — the crossing spread stamped on MOTION (back 40% of the race, per-heat jitter, last crossing at the heat\'s end) · PD-316-08 — heats cut in roster order ratified (NOTES) · PD-316-09 — the heat counter\'s denominator is the heats that run (the counter itself, NOTES) · PD-316-04 — the shared centred field accepted where it still shows (NOTES)';

// Verbatim from the "Owner picks recorded (decision popups, 2026-11-18)" comment on gh#316.
const PICKS_316 = [
  'PD-316-02 → (a) "Draw mb-idle A as the stage\'s idle for this game (20 plates at the gate, the hint line), keeping the shared field for the other games"',
  'PD-316-03 → (a) "Keep 25%: the separators are context once the marbles paint again (PD-316-01)"',
  'PD-316-04 → (a) "Accept the shared centred field (it is the gh#302 fallback behaviour)"',
  'PD-316-05 → "accept the 400 ms coast" — ratified as built',
  'PD-316-06 → "accept 0.35 / 48px" — ratified as built',
  'PD-316-07 → "accept the spread as staging" — ratified as built',
  'PD-316-08 → "ratify as built (accept)" — ratified as built',
  'PD-316-09 → (c) "Keep the skip but change the denominator to the heats that run, so the counter never promises a heat that will not load (`[copy: owner]`)"',
  'PD-316-10 → "approve as written"',
];
