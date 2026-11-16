// gh#318 board: เปิดไพ่ชิงรางวัล, the turn-a-card final. Five finalists each pick a face-down card; the cards turn
// to the prize slots. The pick is theatre (gh#299 decision 7): the final's uniform order already ranks the five,
// so whichever card a finalist picks turns to THEIR drawn prize. The shared mechanic lives in shared.mjs and is
// identical on the gh#317 envelope board; this file gives it the card's own look. No casino styling: the back is
// the gh#303 picked night hatch with a gold edge and a drawn star (never a suit), the face is a prize slot (never
// a rank); no felt, no chips, no money.
import { th, nm, fit, esc, FINALISTS, PRIZES, N, NFEW, WHO, openSetA, rankList, XS, rowTop, arcTop, widthFor, plate, prizeInner, shadowLayer, hud, lowBand, preRegisterCopy, resetCopy, ratio,
  STAGE_CSS, STAGE_VALUES, STAGE_PAIRS, STAGE_DEVIATIONS, scaled, frame, top, plainResult, SHARED_CSS, SHARED_FIT, RULES_QUERIES, RULES_ITEMS } from './shared.mjs';
import { tag, sharedTag, copyRow, rulesRow, boardDoc, valuesTable, contrastTable, beatTable, nameFitRow, notesRow, ORDER_LINE } from './chrome.mjs';
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
    `Drawn with ${N} prizes set by the MC: the cards are face down, the prizes hidden behind them, the prize count in the lower band. Each finalist's name is on a plate under their card. The picks are theatre (decision 7): the final's order is already drawn, so whichever card a finalist picks turns to their own prize. <b>A ROW</b>: five equal cards on one baseline. <b>B ARC</b>: a shallow arc, the centre nearest (lowest and largest), the edges farther, ground shadows; type stays full size in both. The back is the gh#303 picked night hatch with a gold edge and a drawn gold star — never a suit, no felt, no chips, no money. 3D intent: thin card boxes on a plane, the turn a rotateY about the card's centre; A's camera square to the row, B's 30 degrees above the arc; the face text an HTML overlay tracking each card's projected rect, never scaled by depth.`,
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
    'Under reduced motion, and below 640px, the reveal runs the 2D path the shared host already draws for a final (src/play/_prize-reveal/reveal.ts, view kind "final"): the gh#302 picked result frame, revealed last slot to prize 1 by 200ms fades. The never-blank fallback (WebGL unavailable) draws the SAME frame. The two triggers converge on one view, so both are drawn from plainResult and tagged for their trigger; the round state is still drawn and the round still finishes (ADR-0046 reduce, not remove). Below 640px this view takes the phone layout (gh#314 two-column result); the phone\'s own join/card/claim screens are gh#302 / gh#309\'s boards, not re-proposed here.',
    [[sharedTag('2D PATH', ` · card-rm · reduced motion and below 640px · the gh#302 picked result frame`), cardFrame('A', 'rm')],
     [sharedTag('FALLBACK', ` · card-fallback · WebGL unavailable (ADR-0051) · the same gh#302 picked result frame`), cardFrame('A', 'fallback')]]));

  const beatsOne = [
    ['picks', 'until the MC presses start', 'a name plate drops under each card as the MC places it, 300ms ease-out', 'plates appear in place'],
    ['turn x5', '5 x (600ms turn + 800ms hold) = 7s', 'one card at a time: rotateY 180 degrees in 600ms ease-in-out (a turn, both ends matter); the no-prize cards first, prize 1 last; the MC names each', 'each face fades in 200ms in place, one after another, the order kept'],
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
    <div class="cands"><div class="cand">${valuesTable([...STAGE_VALUES, ['#23214d / #2e2b63 hatch + #ffcc00 edge, 6px radius', 'the card back', 'gh#303 PICKED (C board)'], ['#ffcc00 star', 'the back mark (never a suit)', 'tokens.css --accent-gold'], ['#ffffff face + #c2185b label + #14142b type', 'a prize face', 'tokens.css --ink-light; gh#303 C2 PICKED red; tokens.css --color-line-strong'], ['#23214d face + #9a97c0 type', 'a no-prize face', 'gh#302 PICKED no-prize language'], ['280 x 400px card; arc 260/280/300', 'card geometry (PROPOSAL)', 'new on this board; type never scaled']])}</div><div class="cand">${contrastTable(pairs)}</div></div>
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
  const OWNER = `<div class="pin q"><b>DECISIONS FOR THE OWNER (awaiting the pick; record it on gh#318 before any code, ADR-0033):</b><ul>
  <li><b>D1. Layout</b> (shared with gh#317): A ROW (five equal cards on one baseline) or B ARC (a shallow arc, the centre nearest and largest, ground shadows; type full size in both).</li>
  <li><b>D2. Reveal order</b> (shared with gh#317): A ONE AT A TIME (the no-prize cards first, prize 1 last; the MC names each, about 7s) or B ALL AT ONCE (a drumroll, then all five turn in one beat).</li>
  <li><b>C1. Proposed copy</b>: approve, or mark strings to change (COPY SOURCES row). The no-prize copy is the gh#303 L2 pick, reused verbatim, not re-opened.</li>
</ul></div>`;
  return boardDoc('gh#318 · prize draw phase 2 · เปิดไพ่ชิงรางวัล (turn-a-card final)', 'gh#318: proposal board, ADR-0033. The shared mechanic with gh#317 is designed once (shared.mjs).',
    [ORDER_LINE, 'Visual language: the gh#302 pick (B NIGHT STAGE on the projector, 2026-11-11) and the gh#303 picked card values (back hatch, 6px radius, C2 red). Frames are 2D stills of a 3D scene (three, ADR-0060). Two shared decisions are open: D1 layout (A ROW / B ARC) and D2 reveal order (A ONE AT A TIME / B ALL AT ONCE); the card look is an execution choice from canvas values (VALUES row). No casino styling.', OWNER],
    STAGE_CSS + SHARED_CSS + CSS, rows, { status: 'AWAITING OWNER · D1 layout, D2 order, C1 copy' });
}
export { esc };
