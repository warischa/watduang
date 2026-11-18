// gh#318 board: เปิดไพ่ชิงรางวัล, the turn-a-card final. Five finalists each pick a face-down card; the cards turn
// to the prize slots. The pick is theatre (gh#299 decision 7): the final's uniform order already ranks the five,
// so whichever card a finalist picks turns to THEIR drawn prize. The shared mechanic lives in shared.mjs and is
// identical on the gh#317 envelope board; this file gives it the card's own look. No casino styling: the back is
// the gh#303 picked night hatch with a gold edge and a drawn star (never a suit), the face is a prize slot (never
// a rank); no felt, no chips, no money.
import { th, nm, fit, esc, FINALISTS, PRIZES, N, NFEW, WHO, openSetA, rankList, XS, rowTop, arcTop, widthFor, plate, prizeInner, shadowLayer, hud, lowBand, preRegisterCopy, resetCopy, ratio,
  STAGE_CSS, STAGE_VALUES, STAGE_PAIRS, STAGE_DEVIATIONS, scaled, frame, top, plainResult, SHARED_CSS, SHARED_FIT, RULES_QUERIES, RULES_ITEMS,
  phoneResult, PHONE_CSS, PHONE_W, rowFrame, TW_CSS, ROW_WIDTHS, ROW_THRESHOLD, ROW_GAP, PLATE_Y, NAMES_Y } from './shared.mjs';
import { tag, sharedTag, copyRow, rulesRow, boardDoc, valuesTable, contrastTable, beatTable, nameFitRow, notesRow, ORDER_LINE_PICKED } from './chrome.mjs';
import { rolesRow } from './roles.mjs';

const CSS = `
    /* ---- the picker card: gh#303 picked back (night hatch, gold edge, 6px radius) with a drawn gold star;
       the face is a prize slot (white, red label, ink type) or a no-prize slot (night, dim). No suit, no rank. ---- */
    .pj .pcard { position: absolute; box-sizing: border-box; border-radius: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 16px; overflow-x: clip; overflow-y: visible; z-index: 2; }
    .pj .pcard.down { background: repeating-linear-gradient(45deg, #23214d 0 6px, #2e2b63 6px 7px); box-shadow: inset 0 0 0 2px #ffcc00; }
    .pj .pcard.down svg { position: absolute; left: 16px; top: 16px; }
    .pj .pcard.up.prize { background: #ffffff; box-shadow: 0 0 0 3px #ffcc00, 0 0 16px rgba(255,204,0,0.45); }
    .pj .pcard.up.none { background: #23214d; box-shadow: inset 0 0 0 2px #9a97c0; }
    .pj .pcard .fk { font: 600 30px/1.25 'Mitr', sans-serif; white-space: nowrap; }
    .pj .pcard .fp { margin-top: 8px; font: 400 30px/1.3 'Sarabun', sans-serif; text-align: center; }
    .pj .pcard .fw { display: block; width: 100%; margin-top: 12px; font: 700 36px/1.2 'Sarabun', sans-serif; text-align: center; white-space: nowrap; overflow-x: clip; overflow-y: visible; }
    .pj .pcard.up.prize .fk { color: #c2185b; }
    .pj .pcard.up.prize .fp, .pj .pcard.up.prize .fw { color: #14142b; }
    .pj .pcard.up.none .fk, .pj .pcard.up.none .fp, .pj .pcard.up.none .fw { color: #9a97c0; }`;

const GNAME = () => th('เปิดไพ่ชิงรางวัล', 'game name', 'ticket');
const FK = { label: 'fk', name: 'fp', who: 'fw' };
const H = 400;

// A drawn five-point star for the back (festive, never a suit). Polygon points, gold fill. Sized to the card's
// content box (less the 16px padding) so the clip check reads the star inside the card, not over its padding.
function starSvg(W) {
  const IW = W - 32, IH = H - 32, cx = IW / 2, cy = IH / 2, R = 64, r = 26, pts = [];
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r : R; pts.push(`${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)}`); }
  return `<svg width="${IW}" height="${IH}" viewBox="0 0 ${IW} ${IH}" aria-hidden="true"><polygon points="${pts.join(' ')}" fill="#ffcc00"/></svg>`;
}
function cardObj(x, t, W, up, who, n) {
  if (!up) return `<div class="pcard down" style="left:${x - W / 2}px; top:${t}px; width:${W}px; height:${H}px;">${starSvg(W)}</div>`;
  const { cls, html } = prizeInner(who, n, FK);
  return `<div class="pcard up ${cls}" style="left:${x - W / 2}px; top:${t}px; width:${W}px; height:${H}px;">${html}</div>`;
}
function cardScene(layout, n, open) {
  const tops = layout === 'A' ? rowTop(300) : arcTop(300);
  const widths = widthFor(layout, 280);
  const shadows = layout === 'B' ? shadowLayer(XS.map((x, i) => [x, tops[i] + 412, widths[i] * 0.42])) : '';
  const cards = XS.map((x, i) => cardObj(x, tops[i], widths[i], open.has(i), WHO[i], n)).join('');
  const plates = XS.map((x, i) => plate(x, tops[i] + 420, FINALISTS[WHO[i]])).join('');
  return `${shadows}<div class="objs" data-expect="5/${open.size}">${cards}</div>${plates}`;
}

const ALL = new Set([0, 1, 2, 3, 4]);
function cardFrame(layout, kind, order) {
  if (kind === 'rm' || kind === 'fallback') return frame(`card-${kind}`, 'F', '', plainResult(rankList(), PRIZES, N));
  const n = kind === 'few' ? NFEW : N;
  const lay = kind === 'few' ? 'A' : layout;
  const open = kind === 'idle' ? new Set() : kind === 'reveal' ? (order === 'one' ? openSetA(n) : ALL) : ALL;
  const id = kind === 'reveal' ? `card-rv-${order}` : `card-${kind}`;
  const dir = kind === 'few' ? 'F' : layout;
  const claim = `<div class="claim">${th('ผู้ได้รางวัล เปิดหน้าผลในมือถือให้ทีมงานดู ชื่อต้องตรงกับบนจอนี้', 'result: claim line', 'g302')}</div>`;
  let instruction, band;
  if (kind === 'idle') { instruction = th('ผู้เข้ารอบชิง 5 คน เลือกไพ่คว่ำคนละใบ', 'cards idle: the pick'); band = lowBand(th('เลือกไพ่แล้ว รอเปิดรอบชิง', 'cards idle: picked, waiting to open'), n, th('ไพ่คว่ำหน้า รางวัลอยู่ด้านหลัง', 'cards idle: face down, the prize is behind')); }
  else if (kind === 'reveal' && order === 'one') { instruction = th('เปิดทีละใบ · ใบไม่มีรางวัลก่อน รางวัลที่ 1 เปิดสุดท้าย', 'cards reveal: one at a time'); band = lowBand(th(`เปิดแล้ว ${5 - n} จาก 5 ใบ`, 'cards reveal: opened count'), n, th('รางวัลที่ 1 เปิดสุดท้าย', 'cards: the grand prize opens last')); }
  else if (kind === 'reveal') { instruction = th('เปิดพร้อมกันทั้ง 5 ใบ', 'cards reveal: all at once'); band = lowBand(th('เปิดครบ 5 ใบ', 'cards reveal: all open'), n, th('ทุกใบเปิดพร้อมกัน', 'cards: every card opens together')); }
  else if (kind === 'result') { instruction = th('ผู้ได้รับรางวัล', 'result: heading', 'g302'); band = claim; }
  else { instruction = th('รางวัลเดียว · ใบที่เหลือไม่มีรางวัล', 'cards few: one prize'); band = lowBand(th('เปิดครบ 5 ใบ', 'cards reveal: all open'), n, th('ขอบคุณที่ร่วมลุ้น', 'final: the line under a no-prize slot', 'g303')); }
  return frame(id, dir, '', `${top('fin')}${hud(GNAME(), instruction)}${cardScene(lay, n, open)}${band}`);
}

const LAY = { A: 'ROW', B: 'ARC' };
const ORD = { one: 'ONE AT A TIME', all: 'ALL AT ONCE' };

export function buildCards() {
  resetCopy(); preRegisterCopy();
  const sec = (title, why, frames) => `
  <div class="brow">
    <h2>${title}</h2>
    <p class="why">${why}</p>
    <div class="cands col">${frames.map(([t, f]) => `<div class="cand">${t}${scaled(f)}</div>`).join('')}</div>
  </div>`;
  const rows = [];
  rows.push(sec('IDLE · five finalists have picked their face-down cards (decision D1, layout)',
    `Drawn with ${N} prizes set by the MC: the cards are face down, the prizes hidden behind them, the prize count in the lower band. Each finalist's name is on a plate under their card. The picks are theatre (decision 7): the final's order is already drawn, so whichever card a finalist picks turns to their own prize. <b>A ROW</b>: five equal cards on one baseline. <b>B ARC</b>: a shallow arc, the centre nearest (lowest and largest), the edges farther, ground shadows; type stays full size in both. The back is the gh#303 picked night hatch with a gold edge and a drawn gold star — never a suit, no felt, no chips, no money. 3D intent: zero-thickness cards on a plane (two plane quads, no edge at edge-on; RATIFIED as built, PD-318-09 a, owner pick 2026-11-18 — the turn is fast, 600ms), the turn a +rotateY about the card's centre with the face panel mounted half round, so the painted face reads unmirrored (PD-318-08 a, ratified); A's camera square to the row, B's 30 degrees above the arc, at 2000px (PD-318-06 a, ratified); the face text is painted on canvas, never an HTML overlay — a live-region line per turned face carries the words (PD-318-10 a, ratified as built 2026-11-18).`,
    ['A', 'B'].map((o) => [tag(o, LAY[o], ` · card-idle · authored 1920x1080, shown at 75%`), cardFrame(o, 'idle')])));
  rows.push(sec('REVEAL · the cards turn (decision D1 layout x decision D2 order)',
    `<b>D2 ONE AT A TIME</b>: the no-prize cards turn first (left to right), then prize ${N} down to prize 1, so the grand prize turns last and the MC names each (drawn with the ${5 - N} no-prize cards face up, the ${N} prize cards still down). <b>D2 ALL AT ONCE</b>: a drumroll, then all five turn together in one beat (drawn all face up). Each layout draws both orders. A turned card's face is its prize slot: label, prize name, the finalist's name on white with a gold ring; a no-prize card turns to a night face reading "ไม่มีรางวัล" with "ขอบคุณที่ร่วมลุ้น" (the gh#303 L2 pick, verbatim) in dim type. Prize and no-prize are told in WORDS, never colour alone.`,
    [['A', 'one'], ['A', 'all'], ['B', 'one'], ['B', 'all']].map(([o, ord]) => [tag(o, `${LAY[o]} · ${ORD[ord]}`, ` · card-rv-${ord} · authored 1920x1080, shown at 75%`), cardFrame(o, 'reveal', ord)])));
  rows.push(sec('ROUND RESULT (decision D1, layout)',
    'Every card face up, each prize face naming its finalist; prize faces white with a gold ring, no-prize faces night and dim with the L2 copy. The claim line (gh#302 picked, QR mode) tells winners to show their phone. A keeps the row, B the arc with its shadows.',
    ['A', 'B'].map((o) => [tag(o, LAY[o], ` · card-result · authored 1920x1080, shown at 75%`), cardFrame(o, 'result')])));
  rows.push(sec('ONE PRIZE · how the faces read when the MC sets fewer prizes (shared)',
    `Drawn in the row layout with ${NFEW} prize: one white prize face, four night faces reading "ไม่มีรางวัล" with "ขอบคุณที่ร่วมลุ้น" (the gh#303 L2 pick). With 5 prizes every face is a prize. The no-prize copy is NOT re-proposed: it is the picked L2 ruling, reused verbatim.`,
    [[sharedTag('BOTH', ` · card-few · authored 1920x1080, shown at 75%`), cardFrame('A', 'few')]]));
  rows.push(sec('REDUCED MOTION = THE 2D PATH, and the NEVER-BLANK FALLBACK (ADR-0051) (shared)',
    'Under reduced motion, and below 640px, the reveal runs the 2D path the shared host already draws for a final (src/play/_prize-reveal/reveal.ts, view kind "final"): the gh#302 picked result frame, revealed last slot to prize 1 by 200ms fades. The never-blank fallback (WebGL unavailable) draws the SAME frame. The two triggers converge on one view, so both are drawn from plainResult and tagged for their trigger; the round state is still drawn and the round still finishes (ADR-0046 reduce, not remove). Below 640px the DEMO result takes the phone layout drawn in the PHONE RESULT row below (Gh305AuditFrames frame 2, PD-305-05; owner pick PD-318-02 a, 2026-11-18); the phone\'s own join/card/claim screens are gh#302 / gh#309\'s boards, not re-proposed here.',
    [[sharedTag('2D PATH', ` · card-rm · reduced motion and below 640px · the gh#302 picked result frame`), cardFrame('A', 'rm')],
     [sharedTag('FALLBACK', ` · card-fallback · WebGL unavailable (ADR-0051) · the same gh#302 picked result frame`), cardFrame('A', 'fallback')]]));

  // ---- the 2026-11-18 pick frames (gh#319, canvas first) ----
  rows.push(`
  <div class="brow">
    <h2>THE DEMO RESULT ON A PHONE · PD-318-02 (a) · below 640px, the demo bar under the frame</h2>
    <p class="why"><b>Today</b> the demo result below 640px is the whole 1920x1080 frame scaled to the page width (0.167 at 320): the heading and prize line paint 8px glyphs, a winner-card label 5px and its name 6px (the audit's measured pixels) — "who won which prize" is unreadable at a width the ticket serves. <b>Drawn here:</b> the phone result the projector already has — Gh305AuditFrames frame 2, the PD-305-05 pick — inside the demo page chrome: the play band, one left-aligned column on the night ground (winner on top, prize cards in ONE column at i5-phone B sizes), then the demo bar BELOW the frame (demo.css's base placement; under 640px the band placement is ignored). The pick's wording says "two-column list at i5-phone B's 16px names"; the owner picked it as the same layout as PD-305-05, and frame 2 draws one column at 22px card names — <b>frame 2 wins</b> (gh#319). Sizes, all frame 2's own: event 22px, heading 22px, the prize-1 line 18px, winner 50px to a 24px floor, card label 16px, card name 22px to a 21px floor, claim 16px (the floors derived by the NAME FIT rule at 320). The bar is demo.css's real pixels: the badge 18px, the prize-count chips 1-5 at 52px (the demo's default 3 drawn pressed), the replay button 22px on a 52px pill. Drawn with five prizes, as frame 2; with fewer, the trailing cards take the L2 no-prize copy (card-few). The page scrolls; the fold is the device's, not drawn. Names: the board's five finalists, the NAME FIT worst cases among them. The settled projector result keeps the face-up row (PD-318-01 a, built under gh#319); this phone layout is the below-640px / reduced-motion / fallback view.</p>
    <div class="cands">${PHONE_W.map((w) => `<div class="cand">${sharedTag(String(w), ` · card-phone-${w} · real pixels, the ${w}px demo page`)}<div class="pr" data-frame="card-phone-${w}" data-dir="F" style="width:${w}px;">${phoneResult()}</div></div>`).join('')}</div>
  </div>`);
  rows.push(`
  <div class="brow">
    <h2>THE FREE-NAME ROW BELOW THE SCALE THRESHOLD · PD-318-04 (b), following PD-317-03 (a) · real pixels at 640 / 720 / 845</h2>
    <p class="why"><b>Today</b> the free-name row sits at frame y ${NAMES_Y.flipcards} (NAMES_Y; the audit measured the pills at y 815-866 at 0.948, 17px below the plates) while the plate controls are real pixels: top ${PLATE_Y.flipcards} x s, height max(44px, 64px x s). They overlap when ${PLATE_Y.flipcards}s + 44 > ${NAMES_Y.flipcards}s, i.e. s < 0.55 — viewport width < 1056px, a wider band than the envelopes' 640-845px (the cards' plates sit 60px lower while the row sits only 40px lower). <b>Drawn here:</b> the row moves the same way for both finals (PD-318-04 b follows PD-317-03 a): below s = ${ROW_THRESHOLD.flipcards} (viewport width < ${Math.ceil(1920 * ROW_THRESHOLD.flipcards)}px at the 1920 frame width) the row takes real pixels in the plate-to-band gap: row top = the plate control's bottom + ${ROW_GAP}px; the low band yields (its top = the row's bottom + ${ROW_GAP}px, its height 190 x s), so the stage box grows to band top + 210 x s while the width scale s = width/1920 is unchanged. ${ROW_THRESHOLD.flipcards} is the smallest scale at which the frame-y row itself keeps the 8px touch-spacing minimum (80s - 44 >= 8); the overlap band sits inside it. Above the threshold NAMES_Y ${NAMES_Y.flipcards} stands. The plate controls and the band are drawn as stubs at their exact real-pixel boxes — the scaled frame's type is below any board floor at these scales and is annotation here, not design; the row is drawn for real, the built .pd-name pill (52px, gold ring, white Sarabun 700 22px, gap 16px, centred, wraps). The five free names are the board's worst cases; the row wraps as the width demands and the band follows.</p>
    <div class="cands">${ROW_WIDTHS.map((w) => { const s = w / 1920; const rowTop = PLATE_Y.flipcards * s + Math.max(44, 64 * s) + ROW_GAP; return `<div class="cand">${sharedTag(String(w), ` · card-row-${w} · s = ${s.toFixed(4)}, row top ${rowTop.toFixed(1)}px`)}<div class="tw" data-frame="card-row-${w}" data-dir="F" style="width:${w}px;">${rowFrame('flipcards', w)}</div></div>`; }).join('')}</div>
  </div>`);

  const beatsOne = [
    ['picks', 'until the MC presses start', 'a name plate drops under each card as the MC places it, 300ms ease-out', 'plates appear in place'],
    ['idle hold', '1500ms', 'the row stands still after the press before the first card turns (BEATS.idle; RATIFIED as built, PD-318-07 a, owner pick 2026-11-18 — the breath between the 35s ruled and the 36.7s built)', 'still, no hold'],
    ['turn x5', '5 x (600ms turn + 800ms hold) = 7s', 'one card at a time: +rotateY 180 degrees in 600ms cubic ease-in-out (4x^3 below half, 1-(-2x+2)^3/2 above — the built easeInOut polynomial, not CSS ease-in-out; RATIFIED as built, PD-318-05 a, owner pick 2026-11-18); the no-prize cards first, prize 1 last; the MC names each', 'each face fades in 200ms in place, one after another, the order kept'],
    ['result', '200ms', 'the claim line fades in; the stage stills', 'same'],
  ];
  const beatsAll = [
    ['picks', 'until start', 'as ONE AT A TIME, on the chosen layout', 'as ONE AT A TIME'],
    ['drumroll', '1500ms', 'the cards tremble 2px; the camera dollies in 3%', 'none'],
    ['turn all', '600ms', 'all five turn together (one uniform drives every rotateY)', 'all faces fade in place together, 200ms'],
    ['result', '200ms', 'the claim line fades in', 'same'],
  ];
  rows.push(`
  <div class="brow">
    <h2>MOTION · beat by beat (decision D2, order), with the time chosen for each beat</h2>
    <p class="why">Timings are this board's proposal, shaped by the ui-ux-pro-max motion rules (RULES CHECKED). The 600ms turn is a staged game beat, not a UI micro-interaction (the skill's 500ms cap binds UI; the gh#303 picked flip was 600ms too). The layout (D1) changes the camera and the geometry, not the beats.</p>
    <h3>ONE AT A TIME</h3>${beatTable(beatsOne)}<h3>ALL AT ONCE</h3>${beatTable(beatsAll)}
  </div>`);
  rows.push(rulesRow(RULES_QUERIES, RULES_ITEMS));
  const pairs = [...STAGE_PAIRS, ['#c2185b', '#ffffff', 'the prize label on a white face (gh#303 C2 PICKED)'], ['#14142b', '#ffffff', 'the prize name and finalist on a white face'], ['#9a97c0', '#23214d', 'a no-prize face label, line and name'], ['#ffcc00', '#23214d', 'the gold star and edge on the back (non-text, 3:1)']];
  rows.push(`
  <div class="brow">
    <h2>VALUES · every frame value, token, gh#302 / gh#303 pick, or PROPOSAL</h2>
    <p class="why">${STAGE_DEVIATIONS} <b>The card look (an execution choice, not re-proposed; every colour is a canvas value):</b> the back is the gh#303 PICKED hatch (#23214d / #2e2b63) with a #ffcc00 inset edge and the PICKED 6px radius; the star is #ffcc00 (tokens.css --accent-gold), a drawn mark, never a suit. A prize face is #ffffff (tokens.css --ink-light) with a #c2185b label (the gh#303 C2 PICKED red: gold on white misses 4.5:1), #14142b prize name and finalist, a gold ring and glow (the gh#303 passing card). A no-prize face is #23214d with #9a97c0 type and a dim inset ring (the gh#302 no-prize language). <b>New geometry (PROPOSAL):</b> the card 280 x 400px in the row, arc widths 260/280/300/280/260px; name plates 320 x 64px pills (the gh#303 lane plate). <b>Name-fit rule (the gh#302 pick, followed):</b> plate names start 40px, floor 24px; face names start 36px, floor 20px. The three NAME FIT worst cases are among the five finalists. No new hue, font or size without a canvas source; no casino styling.</p>
    <div class="cands"><div class="cand">${valuesTable([...STAGE_VALUES, ['#23214d / #2e2b63 hatch + #ffcc00 edge, 6px radius', 'the card back', 'gh#303 PICKED (C board)'], ['#ffcc00 star', 'the back mark (never a suit)', 'tokens.css --accent-gold'], ['#ffffff face + #c2185b label + #14142b type', 'a prize face', 'tokens.css --ink-light; gh#303 C2 PICKED red; tokens.css --color-line-strong'], ['#23214d face + #9a97c0 type', 'a no-prize face', 'gh#302 PICKED no-prize language'], ['280 x 400px card; arc 260/280/300', 'card geometry (PROPOSAL)', 'new on this board; type never scaled'], ['2000px', 'camera distance (FOCAL; the row shows no depth compression at rest, the perspective reads while a card turns)', 'RATIFIED as built 2026-11-18 (PD-318-06 a, owner pick)'], ['cubic ease-in-out: 4x^3 below half, 1-(-2x+2)^3/2 above', 'the turn curve (the built easeInOut polynomial, not CSS cubic-bezier(0.42,0,0.58,1))', 'RATIFIED as built 2026-11-18 (PD-318-05 a, owner pick); stamped on MOTION'], ['+rotateY, the face panel mounted half round', 'the turn sign (the painted face reads unmirrored and legible)', 'RATIFIED as built 2026-11-18 (PD-318-08 a, owner pick)'], ['zero thickness (two plane quads, no edge)', 'the card geometry at edge-on', 'RATIFIED as built 2026-11-18 (PD-318-09 a): the turn is fast, 600ms; the "thin boxes" wording is corrected'], ['FACE_MARGIN 20 = ring 3 + glow 16 + 1; the face canvas 320px wide on the 280px card, centred, growing taller when its text overflows', 'the face panel margin and the centred overflow', 'RATIFIED as built 2026-11-18 (PD-318-11 a, owner pick)'], ['the back painted once at a fixed scale 2 (one texture, five cards)', 'the back texture cost', 'RATIFIED as built 2026-11-18 (PD-318-12 a, owner pick)'], ['stripes top-left to bottom-right (CSS 45deg; the canvas reaches it by translate(0,h) + rotate(-45deg))', 'the painted hatch direction', 'RATIFIED as built 2026-11-18 (PD-318-13 a, owner pick): the structure tensor reads stripe axis 45°, gradient axis 135°'], [`s < ${ROW_THRESHOLD.flipcards} (viewport width < ${Math.ceil(1920 * ROW_THRESHOLD.flipcards)}px at the 1920 frame width)`, 'the below-threshold band for the real-pixel free-name row', 'PD-318-04 (b) follows PD-317-03 (a) (owner picks 2026-11-18); threshold = (44 + 8) / (NAMES_Y - PLATE_Y), the smallest scale keeping the 8px touch-spacing minimum (80s - 44 >= 8)'], [`row top = PLATE_Y x s + max(44, 64 x s) + ${ROW_GAP}, real px (PLATE_Y ${PLATE_Y.flipcards})`, 'the free-name row below the threshold (card-row-640/720/845)', 'new on this board (PD-317-03 a); the built control geometry (final-picks.ts PLATE_Y, the .pd-lane height floor)'], ['pill: min-height 52px, padding 0 32px, border 3px #ffcc00, radius 999px, #23214d ground, white Sarabun 700 22px/1.35; row gap 16px, centred, wraps', 'the free-name pill and row', 'the built .pd-name / .pd-names (i2-lanes VALUES)'], [`band top = row bottom + ${ROW_GAP}; band height 190 x s; box bottom margin 20 x s; box height = band top + 210 x s`, 'the low band yields below the threshold; the stage box grows, s = width/1920 unchanged', 'new on this board (PD-317-03 a)'], [`NAMES_Y ${NAMES_Y.flipcards} at s >= ${ROW_THRESHOLD.flipcards}`, 'the free-name row above the threshold', 'PD-318-04 (b) follows the PD-317-03 (a) move (owner picks 2026-11-18); the built final-picks.ts NAMES_Y']])}</div><div class="cand">${contrastTable(pairs)}</div></div>
  </div>`);
  rows.push(nameFitRow([...SHARED_FIT, ['card face names', 'Sarabun 700', '36px', '20px', 'the card width less 32px (248px row, 228px arc edge)', 'W x12: 25px; U+0E12 x12: 20px; U+0E12 U+0E33 x12: 20px, two lines']]));
  rows.push(rolesRow('Gh318Cards'));
  rows.push(copyRow());
  rows.push(notesRow([
    '<b>Rests on gh#299:</b> decisions 7 (the picks are theatre, equal odds), 9 (1 to 5 prizes, set by the MC), 11 (3D on the projector, the phone light 2D, reduced motion fades, ADR-0051), 12 (the two finals share one mechanic; the owner keeps both), the game sketch, and the gambling-wording constraint (no casino styling: felt, chips, money). <b>On gh#318:</b> the turn-a-card final. <b>On gh#302 (picked):</b> direction B NIGHT STAGE, the result frame, the copy. <b>On gh#303 (picked):</b> the card back hatch, the 6px radius, the C2 red (#c2185b), the L2 no-prize copy, the lane plate pill.',
    '<b>The shared mechanic</b> (pick -> reveal -> prize slot, the D1 layout and D2 order decisions, the plates, the no-prize copy, the 2D path and the fallback) is designed once in shared.mjs and is identical on the gh#317 envelope board; only the object\'s look differs. The README records the shared part and the per-game part.',
    '<b>No casino styling:</b> the back carries a drawn star, never a suit; the face is a prize slot, never a rank or suit; there is no felt table, no chip, no money. The cards float on the night ground as the gh#303 deal did.',
    '<b>Not drawn:</b> how the MC places the picks (a setup-page control, gh#302\'s board); the phone\'s own join/card/claim screens (gh#302 / gh#309); the QR-mode final code card (gh#302 / gh#305, already built).',
    '<b>Not covered:</b> a real projector, room or venue frame rate; the 3D motion itself (the frames are 2D stills of the 3D intent).',
  ]));
  const OWNER = `<div class="pin q"><b>DECISIONS PICKED 2026-11-16 (owner popups, recorded on gh#318):</b><ul>
  <li><b>D1. Layout</b> (shared with gh#317): <b>A ROW</b> — five equal cards on one baseline.</li>
  <li><b>D2. Reveal order</b> (shared with gh#317): <b>A ONE AT A TIME</b> — the no-prize cards first, prize 1 last; the MC names each.</li>
  <li><b>C1. Proposed copy</b>: approved as it stands. The no-prize copy is the gh#303 L2 pick, reused verbatim, not re-opened.</li>
  <li>The 2026-11-18 audit picks are quoted verbatim in the header banner; the stamps land in MOTION (PD-318-05, PD-318-07), VALUES (PD-318-06, PD-318-08, PD-318-09, PD-318-11, PD-318-12, PD-318-13, the row geometry) and the IDLE 3D intent (PD-318-09, PD-318-10: the overlay sentence is struck, a live-region line per turned face is added), and the new frames card-phone-320/390 (PD-318-02), card-row-640/720/845 (PD-318-04) are drawn to them. Frames drawn to a pick go to code without a separate sign-off (owner ruling); the code picks are built under gh#319.</li>
</ul></div>`;
  return boardDoc('gh#318 · prize draw phase 2 · เปิดไพ่ชิงรางวัล (turn-a-card final)', 'gh#318: board drawn to the owner\'s picks, ADR-0033. The shared mechanic with gh#317 is designed once (shared.mjs).',
    [ORDER_LINE_PICKED, 'The board decisions were picked 2026-11-16 (D1 A ROW, D2 A ONE AT A TIME, C1 approved); the 2026-11-18 audit picks below are quoted verbatim from the last pick comment on gh#318. Visual language: the gh#302 pick (B NIGHT STAGE on the projector, 2026-11-11) and the gh#303 picked card values (back hatch, 6px radius, C2 red). Frames are 2D stills of a 3D scene (three, ADR-0060); the card look is an execution choice from canvas values (VALUES row). No casino styling.', OWNER],
    STAGE_CSS + SHARED_CSS + CSS + PHONE_CSS + TW_CSS, rows, { status: 'DRAWN TO THE OWNER\'S PICKS 2026-11-18', rulings: CARD_RULINGS, picks: PICKS_318 });
}

// The 2026-11-18 rulings that change this canvas (the audit picks, gh#318's last pick comment; gh#319 builds them).
const CARD_RULINGS = 'PD-318-05 — the cubic ease stamped on MOTION · PD-318-06 — camera 2000px stamped on VALUES · PD-318-07 — the 1500ms idle hold stamped on MOTION · PD-318-08 — the +rotateY turn sign stamped (VALUES, the IDLE 3D intent) · PD-318-09 — zero-thickness cards ratified, the "thin boxes" wording corrected · PD-318-10 — canvas face text ratified, the HTML-overlay sentence struck, a live-region line per turned face added · PD-318-11 — face margin 20 and the centred overflow stamped (VALUES) · PD-318-12 — the back at a fixed scale 2 stamped (VALUES) · PD-318-13 — the painted hatch direction stamped (VALUES) · frames drawn: card-phone-320/390 (PD-318-02), card-row-640/720/845 (PD-318-04, following PD-317-03)';

// Verbatim from the "Owner picks recorded (decision popups, 2026-11-18)" comment on gh#318.
const PICKS_318 = [
  'PD-318-01 → (a) "Hold the face-up row as the settled result on the projector (the host keeps the scene at `total` instead of handing back), keeping the 2D frame for reduced motion, below 640px and the fallback"',
  'PD-318-02 → (a) "Draw a phone result frame (gh#314 or this board) and apply it below 640px: winners as the two-column list at i5-phone B\'s 16px names, prize label above each name"',
  'PD-318-03 → (a) "Draw the board\'s card-idle as the demo\'s pre-press view in 2D (five backs, plates, the instruction)"',
  'PD-318-04 → (b) "Move the row under the low band or into a side column, re-drawn on the board" — follows the PD-317-03 (a) pick',
  'PD-318-05 → (a) "Accept the cubic and stamp it on the board\'s MOTION row" — ratified as built',
  'PD-318-06 → (a) "Stamp 2000 on the board" — ratified as built',
  'PD-318-07 → (a) "Accept 1500 ms as the breath before the first turn and stamp it" — ratified as built',
  'PD-318-08 → (a) "Accept the current sign and stamp it" — ratified as built',
  'PD-318-09 → (a) "Accept zero thickness (the turn is fast, 600 ms) and correct the board\'s wording" — ratified as built',
  'PD-318-10 → (a) "Accept canvas text (the envelopes final\'s way) and strike the overlay sentence from the board, adding a live-region line per turned face" — ratified as built',
  'PD-318-11 → (a) "Stamp 20 and the centred overflow on the board" — ratified as built',
  'PD-318-12 → (a) "Accept the fixed 2 (one texture, five cards)" — ratified as built',
  'PD-318-13 → (a) "Stamp the painted direction on the board" — ratified as built',
  'PD-318-14 → (a) "Approve as written"',
];
export { esc };
