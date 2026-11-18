// gh#317 board: ซองของขวัญ, the gift-envelope final. Five finalists each pick a gift envelope; the envelopes open
// to the prize slots. The pick is theatre (gh#299 decision 7): the final's uniform order already ranks the five,
// so whichever envelope a finalist picks opens to THEIR drawn prize. The shared mechanic (pick -> reveal -> prize
// slot, the layout and order decisions, the plates, the no-prize copy, the 2D path) lives in shared.mjs and is
// identical on the gh#318 card board; this file gives it the envelope's own look.
import { th, nm, fit, esc, FINALISTS, PRIZES, N, NFEW, WHO, openSetA, rankList, XS, rowTop, arcTop, widthFor, plate, prizeInner, rr, shadowLayer, hud, lowBand, preRegisterCopy, resetCopy, ratio,
  STAGE_CSS, STAGE_VALUES, STAGE_PAIRS, STAGE_DEVIATIONS, scaled, frame, top, plainResult, SHARED_CSS, SHARED_FIT, RULES_QUERIES, RULES_ITEMS,
  phoneResult, PHONE_CSS, PHONE_W, rowFrame, TW_CSS, ROW_WIDTHS, ROW_THRESHOLD, ROW_GAP, PLATE_Y, NAMES_Y } from './shared.mjs';
import { tag, sharedTag, copyRow, rulesRow, boardDoc, valuesTable, contrastTable, beatTable, nameFitRow, notesRow, ORDER_LINE_PICKED } from './chrome.mjs';
import { rolesRow } from './roles.mjs';

const CSS = `
    /* ---- the gift envelope: a night body with a gold flap, bow and seal (SVG art, no text). The prize slot is
       an HTML overlay over the body, so type is never scaled by depth (the gh#303 ladder's stamped lesson). ---- */
    .pj svg.envart { position: absolute; z-index: 1; }`;

const GNAME = () => th('ซองของขวัญ', 'game name', 'ticket');
// PD-317-02 (a) (owner pick 2026-11-18): the prize line carries the fit rule — 30px shrinking to the slot's own
// 20px floor, then at most two lines (the render fails a third). The floor is the slot name floor already set here.
const SK = { label: 'sk', name: `sp ${fit(20, 30)}`, who: 'sw' };

// One envelope's art: body (night, gold edge), flap (gold; closed dips over the body, open lifts above it),
// a bow and a seal at the flap tip. Open state carries the .open class the field count reads.
function envArt(x, t, W, open) {
  const cx = W / 2, sealY = open ? 24 : 180;
  const flap = open ? `M0,93 L${cx},24 L${W},93 Z` : `M0,93 L${cx},180 L${W},93 Z`;
  return `<svg class="envart${open ? ' open' : ''}" width="${W}" height="300" viewBox="0 0 ${W} 300" style="left:${x - W / 2}px; top:${t}px;" aria-hidden="true"><path class="body" d="${rr(3, 93, W - 6, 204, 12)}" fill="#23214d" stroke="#ffcc00" stroke-width="3" stroke-linejoin="round"/><path class="flap" d="${flap}" fill="#ffcc00"/><circle class="bow" cx="${cx - 20}" cy="${sealY - 4}" r="11" fill="#ffcc00"/><circle class="bow" cx="${cx + 20}" cy="${sealY - 4}" r="11" fill="#ffcc00"/><circle class="seal" cx="${cx}" cy="${sealY}" r="15" fill="#23214d" stroke="#ffcc00" stroke-width="3"/></svg>`;
}
// The prize slot over an opened envelope's body: prize label, prize name, the finalist's name (or the no-prize copy).
const envSlot = (x, t, W, who, n) => { const { cls, html } = prizeInner(who, n, SK); return `<div class="slot ${cls}" style="left:${x - W / 2 + 18}px; top:${t + 107}px; width:${W - 36}px;">${html}</div>`; };

function envScene(layout, n, open) {
  const tops = layout === 'A' ? rowTop(340) : arcTop(340);
  const widths = widthFor(layout, 300);
  const shadows = layout === 'B' ? shadowLayer(XS.map((x, i) => [x, tops[i] + 312, widths[i] * 0.42])) : '';
  const arts = XS.map((x, i) => envArt(x, tops[i], widths[i], open.has(i))).join('');
  const slots = XS.map((x, i) => (open.has(i) ? envSlot(x, tops[i], widths[i], WHO[i], n) : '')).join('');
  const plates = XS.map((x, i) => plate(x, tops[i] + 320, FINALISTS[WHO[i]])).join('');
  return `${shadows}<div class="objs" data-expect="5/${open.size}">${arts}</div>${slots}${plates}`;
}

const ALL = new Set([0, 1, 2, 3, 4]);
function envFrame(layout, kind, order) {
  if (kind === 'rm' || kind === 'fallback') return frame(`env-${kind}`, 'F', '', plainResult(rankList(), PRIZES, N));
  const n = kind === 'few' ? NFEW : N;
  const lay = kind === 'few' ? 'A' : layout;
  const open = kind === 'idle' ? new Set() : kind === 'reveal' ? (order === 'one' ? openSetA(n) : ALL) : ALL;
  const id = kind === 'reveal' ? `env-rv-${order}` : `env-${kind}`;
  const dir = kind === 'few' ? 'F' : layout;
  const claim = `<div class="claim">${th('ผู้ได้รางวัล เปิดหน้าผลในมือถือให้ทีมงานดู ชื่อต้องตรงกับบนจอนี้', 'result: claim line', 'g302')}</div>`;
  let instruction, band;
  if (kind === 'idle') { instruction = th('ผู้เข้ารอบชิง 5 คน เลือกซองของขวัญคนละซอง', 'envelopes idle: the pick'); band = lowBand(th('เลือกแล้ว รอเปิดรอบชิง', 'envelopes idle: picked, waiting to open'), n, th('ซองของขวัญปิดอยู่ รางวัลอยู่ข้างใน', 'envelopes idle: the prizes are inside')); }
  else if (kind === 'reveal' && order === 'one') { instruction = th('เปิดทีละซอง · ซองไม่มีรางวัลก่อน รางวัลที่ 1 เปิดสุดท้าย', 'envelopes reveal: one at a time'); band = lowBand(th(`เปิดแล้ว ${5 - n} จาก 5 ซอง`, 'envelopes reveal: opened count'), n, th('รางวัลที่ 1 เปิดสุดท้าย', 'envelopes: the grand prize opens last')); }
  else if (kind === 'reveal') { instruction = th('เปิดพร้อมกันทั้ง 5 ซอง', 'envelopes reveal: all at once'); band = lowBand(th('เปิดครบ 5 ซอง', 'envelopes reveal: all open'), n, th('ทุกซองเปิดพร้อมกัน', 'envelopes: every envelope opens together')); }
  else if (kind === 'result') { instruction = th('ผู้ได้รับรางวัล', 'result: heading', 'g302'); band = claim; }
  else { instruction = th('รางวัลเดียว · ซองที่เหลือไม่มีรางวัล', 'envelopes few: one prize'); band = lowBand(th('เปิดครบ 5 ซอง', 'envelopes reveal: all open'), n, th('ขอบคุณที่ร่วมลุ้น', 'final: the line under a no-prize slot', 'g303')); }
  return frame(id, dir, '', `${top('fin')}${hud(GNAME(), instruction)}${envScene(lay, n, open)}${band}`);
}

// F2 (PD-317-02 a): the prize line at its cap. The long MC name is the approved sample prizes joined with spaces
// (sample data, not copy); the normal slot beside it is unchanged. A detail of the row layout: two open envelopes,
// authored 900x460, shown at 75%. The capped slot stays inside the 204px body; the plate paints below it.
const LONG_PRIZE = [PRIZES[0], PRIZES[1], PRIZES[2]].join(' ');
function capFrame() {
  const t = 40, W = 300;
  const slotAt = (x, html) => `<div class="slot prize" style="left:${x - W / 2 + 18}px; top:${t + 107}px; width:${W - 36}px;">${html}</div>`;
  const capHtml = `<div class="sk">${th('รางวัลที่ 1', 'prize label', 'g302')}</div><div class="sp ${fit(20, 30)}">${th(LONG_PRIZE, 'prize name (typed by the MC): the joined samples, a long MC name', 'sample')}</div><span class="sw ${fit(20, 36)}">${nm(FINALISTS[0])}</span>`;
  return `<div class="objs" data-expect="2/2">${envArt(250, t, W, true)}${envArt(650, t, W, true)}</div>${slotAt(250, capHtml)}${slotAt(650, prizeInner(1, 5, SK).html)}${plate(250, t + 320, FINALISTS[0])}${plate(650, t + 320, FINALISTS[1])}`;
}

const LAY = { A: 'ROW', B: 'ARC' };
const ORD = { one: 'ONE AT A TIME', all: 'ALL AT ONCE' };

export function buildEnvelopes() {
  resetCopy(); preRegisterCopy();
  const sec = (title, why, frames) => `
  <div class="brow">
    <h2>${title}</h2>
    <p class="why">${why}</p>
    <div class="cands col">${frames.map(([t, f]) => `<div class="cand">${t}${scaled(f)}</div>`).join('')}</div>
  </div>`;
  const rows = [];
  rows.push(sec('IDLE · five finalists have picked their envelopes (decision D1, layout)',
    `Drawn with ${N} prizes set by the MC: the envelopes are closed, the prizes hidden inside, the prize count in the lower band. Each finalist's name is on a plate under their envelope (the pick shown in words). The picks are theatre (decision 7): the final's order is already drawn, so whichever envelope a finalist picks opens to their own prize. <b>A ROW</b>: five equal envelopes on one baseline. <b>B ARC</b>: a shallow arc, the centre nearest (lowest and largest), the edges farther, ground shadows under each; type stays full size in both (no scaled text). 3D intent: thin box geometry on a plane, the flap a hinged quad; A's camera square to the row, B's 30 degrees above the arc, at 2000px (PD-317-08 a, ratified as built 2026-11-18); the prize text is painted on canvas panels lying on the row's plane, so type is never scaled by depth — ratified as built (PD-317-10 a, 2026-11-18), the reveal's words carried in the live region, one line per opened envelope.`,
    ['A', 'B'].map((o) => [tag(o, LAY[o], ` · env-idle · authored 1920x1080, shown at 75%`), envFrame(o, 'idle')])));
  rows.push(sec('REVEAL · the envelopes open (decision D1 layout x decision D2 order)',
    `<b>D2 ONE AT A TIME</b>: the no-prize envelopes open first (left to right), then prize ${N} down to prize 1, so the grand prize opens last and the MC names each (drawn with the ${5 - N} no-prize envelopes open, the ${N} prize envelopes still closed). <b>D2 ALL AT ONCE</b>: a drumroll, then all five flaps lift together and the prizes appear in one beat (drawn all open). Each layout draws both orders. The flap lifts and the prize slot appears over the body: label, prize name, the finalist's name; a no-prize envelope reads "ไม่มีรางวัล" with "ขอบคุณที่ร่วมลุ้น" (the gh#303 L2 pick, verbatim).`,
    [['A', 'one'], ['A', 'all'], ['B', 'one'], ['B', 'all']].map(([o, ord]) => [tag(o, `${LAY[o]} · ${ORD[ord]}`, ` · env-rv-${ord} · authored 1920x1080, shown at 75%`), envFrame(o, 'reveal', ord)])));
  rows.push(sec('ROUND RESULT (decision D1, layout)',
    'Every envelope open, each prize slot naming its finalist; prize 1 gold, the no-prize slots dim with the L2 copy. The claim line (gh#302 picked, QR mode) tells winners to show their phone. A keeps the row, B the arc with its shadows. The game name and the heading sit in the top band.',
    ['A', 'B'].map((o) => [tag(o, LAY[o], ` · env-result · authored 1920x1080, shown at 75%`), envFrame(o, 'result')])));
  rows.push(sec('ONE PRIZE · how the slots read when the MC sets fewer prizes (shared)',
    `Drawn in the row layout with ${NFEW} prize: one gold slot, four that read "ไม่มีรางวัล" with "ขอบคุณที่ร่วมลุ้น" (the gh#303 L2 pick). With 5 prizes every slot is gold. The no-prize copy is NOT re-proposed: it is the picked L2 ruling, reused verbatim.`,
    [[sharedTag('BOTH', ` · env-few · authored 1920x1080, shown at 75%`), envFrame('A', 'few')]]));
  rows.push(sec('REDUCED MOTION = THE 2D PATH, and the NEVER-BLANK FALLBACK (ADR-0051) (shared)',
    'Under reduced motion, and below 640px, the reveal runs the 2D path the shared host already draws for a final (src/play/_prize-reveal/reveal.ts, view kind "final"): the gh#302 picked result frame, revealed last slot to prize 1 by 200ms fades. The never-blank fallback (WebGL unavailable) draws the SAME frame. The two triggers converge on one view, so both are drawn from plainResult and tagged for their trigger; the round state is still drawn and the round still finishes (ADR-0046 reduce, not remove). Below 640px the DEMO result takes the phone layout drawn in the PHONE RESULT row below (Gh305AuditFrames frame 2, PD-305-05; owner pick PD-317-01 a, 2026-11-18); the phone\'s own join/card/claim screens are gh#302 / gh#309\'s boards, not re-proposed here.',
    [[sharedTag('2D PATH', ` · env-rm · reduced motion and below 640px · the gh#302 picked result frame`), envFrame('A', 'rm')],
     [sharedTag('FALLBACK', ` · env-fallback · WebGL unavailable (ADR-0051) · the same gh#302 picked result frame`), envFrame('A', 'fallback')]]));

  // ---- the 2026-11-18 pick frames (gh#319, canvas first) ----
  rows.push(`
  <div class="brow">
    <h2>THE DEMO RESULT ON A PHONE · PD-317-01 (a) · below 640px, the demo bar under the frame</h2>
    <p class="why"><b>Today</b> the demo result below 640px is the whole 1920x1080 frame scaled to the page width (0.167 at 320): the heading and prize line paint 8px glyphs, a winner-card label 5px and its name 6px (the audit's measured pixels). <b>Drawn here:</b> the phone result the projector already has — Gh305AuditFrames frame 2, the PD-305-05 pick — inside the demo page chrome: the play band, one left-aligned column on the night ground (winner on top, prize cards in ONE column at i5-phone B sizes), then the demo bar BELOW the frame (demo.css's base placement; under 640px the band placement is ignored). The pick's wording says "two-column list at i5-phone B's 16px names"; the owner picked it as the same layout as PD-305-05, and frame 2 draws one column at 22px card names — <b>frame 2 wins</b> (gh#319). Sizes, all frame 2's own: event 22px, heading 22px, the prize-1 line 18px, winner 50px to a 24px floor, card label 16px, card name 22px to a 21px floor, claim 16px (the floors derived by the NAME FIT rule at 320). The bar is demo.css's real pixels: the badge 18px, the prize-count chips 1-5 at 52px (the demo's default 3 drawn pressed), the replay button 22px on a 52px pill. Drawn with five prizes, as frame 2; with fewer, the trailing cards take the L2 no-prize copy (env-few). The page scrolls; the fold is the device's, not drawn. Names: the board's five finalists, the NAME FIT worst cases among them.</p>
    <div class="cands">${PHONE_W.map((w) => `<div class="cand">${sharedTag(String(w), ` · env-phone-${w} · real pixels, the ${w}px demo page`)}<div class="pr" data-frame="env-phone-${w}" data-dir="F" style="width:${w}px;">${phoneResult()}</div></div>`).join('')}</div>
  </div>`);
  rows.push(`
  <div class="brow">
    <h2>THE PRIZE LINE AT ITS CAP · PD-317-02 (a) · two lines, 30px to a 20px floor</h2>
    <p class="why"><b>Today</b> the slot's prize line wraps with no cap: the panel grows downward (the audit's arithmetic: slot top 447, body bottom 637, plate top 660 — three lines end about 655, past the body; four about 699, into the plate's box, and the plate paints over the spilled tail). <b>Drawn here:</b> the cap the owner picked — the prize line shrinks 30px to the slot's own 20px floor (the NAME FIT floor this board already sets for slot names), then wraps to at most TWO lines; the render fails a third. The long MC name is the approved sample prizes joined with spaces (sample data, not copy): at the cap it takes two lines at 20px inside the 264px slot, and the slot stays inside the body. The normal slot beside it is unchanged. The cap and the floor are stamped in VALUES and NAME FIT; every prize line on this board carries the fit rule.</p>
    <div class="cands col"><div class="cand">${sharedTag('CAP', ' · env-cap · a detail of the row layout, authored 900x460, shown at 75%')}<div class="scaler" style="width:675px; height:345px;"><div class="pj" data-frame="env-cap" data-dir="F" style="transform: scale(0.75); width:900px; height:460px;">${capFrame()}</div></div></div></div>
  </div>`);
  rows.push(`
  <div class="brow">
    <h2>THE FREE-NAME ROW BELOW THE SCALE THRESHOLD · PD-317-03 (a), PD-317-11 (b) · real pixels at 640 / 720 / 845</h2>
    <p class="why"><b>Today</b> the free-name row sits at frame y ${NAMES_Y.envelopes} (NAMES_Y) while the plate controls are real pixels: top ${PLATE_Y.envelopes} x s, height max(44px, 64px x s). They overlap when ${PLATE_Y.envelopes}s + 44 > ${NAMES_Y.envelopes}s, i.e. s < 0.44 — width-limited viewports 640-845px (the audit's arithmetic; a wrapped row also reaches into the band's empty top). <b>Drawn here:</b> below s = ${ROW_THRESHOLD.envelopes} (viewport width < ${Math.ceil(1920 * ROW_THRESHOLD.envelopes)}px at the 1920 frame width) the row takes real pixels in the plate-to-band gap: row top = the plate control's bottom + ${ROW_GAP}px; the low band yields (its top = the row's bottom + ${ROW_GAP}px, its height 190 x s), so the stage box grows to band top + 210 x s while the width scale s = width/1920 is unchanged. ${ROW_THRESHOLD.envelopes} is the smallest scale at which the frame-y row itself keeps the 8px touch-spacing minimum (100s - 44 >= 8); the audit's overlap band sits inside it. Above the threshold NAMES_Y ${NAMES_Y.envelopes} stands (PD-317-11 b follows the move). The plate controls and the band are drawn as stubs at their exact real-pixel boxes — the scaled frame's type is below any board floor at these scales and is annotation here, not design; the row is drawn for real, the built .pd-name pill (52px, gold ring, white Sarabun 700 22px, gap 16px, centred, wraps). The five free names are the board's worst cases; the row wraps as the width demands and the band follows. The empty/next plates wear the i2-lanes B look (PD-317-12 a, stamped in VALUES).</p>
    <div class="cands">${ROW_WIDTHS.map((w) => { const s = w / 1920; const rowTop = PLATE_Y.envelopes * s + Math.max(44, 64 * s) + ROW_GAP; return `<div class="cand">${sharedTag(String(w), ` · env-row-${w} · s = ${s.toFixed(4)}, row top ${rowTop.toFixed(1)}px`)}<div class="tw" data-frame="env-row-${w}" data-dir="F" style="width:${w}px;">${rowFrame('envelopes', w)}</div></div>`; }).join('')}</div>
  </div>`);

  const beatsOne = [
    ['picks', 'until the MC presses start', 'a name plate drops under each envelope as the MC places it, 300ms ease-out', 'plates appear in place'],
    ['pre-hold', '1500ms', 'the row stands closed after the press before the first flap lifts (T.idle; RATIFIED as built, PD-317-07 a, owner pick 2026-11-18 — inside the 2026-11-17 ruling\'s 36.7s sum)', 'still, no hold'],
    ['open x5', '5 x (600ms turn + 800ms hold) = 7s', 'one envelope at a time: the flap lifts 300ms ease-out, the prize fades in 200ms; the no-prize envelopes first, prize 1 last; the MC names each', 'each prize fades in 200ms in place, one after another, the order kept'],
    ['result', '200ms', 'the claim line fades in; the stage stills', 'same'],
  ];
  const beatsAll = [
    ['picks', 'until start', 'as ONE AT A TIME, on the chosen layout', 'as ONE AT A TIME'],
    ['drumroll', '1500ms', 'the envelopes tremble 2px; the camera dollies in 3%', 'none'],
    ['open all', '600ms', 'all five flaps lift together (one uniform drives every flap), the prizes fade in 200ms', 'all faces fade in place together, 200ms'],
    ['result', '200ms', 'the claim line fades in', 'same'],
  ];
  rows.push(`
  <div class="brow">
    <h2>MOTION · beat by beat (decision D2, order), with the time chosen for each beat</h2>
    <p class="why">Timings are this board's proposal, shaped by the ui-ux-pro-max motion rules (RULES CHECKED). The 600ms turn is a staged game beat, not a UI micro-interaction (the skill's 500ms cap binds UI; the gh#303 picked flip was 600ms too). The layout (D1) changes the camera and the geometry, not the beats.</p>
    <h3>ONE AT A TIME</h3>${beatTable(beatsOne)}<h3>ALL AT ONCE</h3>${beatTable(beatsAll)}
  </div>`);
  rows.push(rulesRow(RULES_QUERIES, RULES_ITEMS));
  const pairs = [...STAGE_PAIRS, ['#ffcc00', '#23214d', 'the gold flap and edge on the night body (non-text, 3:1)'], ['#ffffff', '#23214d', 'a finalist name in a prize slot'], ['#d9d6f0', '#23214d', 'the prize name and the no-prize line'], ['#9a97c0', '#23214d', 'a no-prize slot label and name']];
  rows.push(`
  <div class="brow">
    <h2>VALUES · every frame value, token, gh#302 / gh#303 pick, or PROPOSAL</h2>
    <p class="why">${STAGE_DEVIATIONS} <b>The envelope look (an execution choice, not re-proposed; every colour is a canvas value):</b> the body is #23214d (the gh#302 B picked raised surface) with a #ffcc00 edge (tokens.css --accent-gold); the flap, bow and seal edge are gold; the seal centre is the night surface. A gift reads as a gift by its flap and bow, never by casino styling. <b>New geometry (PROPOSAL):</b> the envelope art box 300px tall (body 204px, flap space above), the row width 300px, the arc widths 280/300/320/300/280px; the prize slot an overlay over the body, width less 36px; name plates 320 x 64px pills (the gh#303 lane plate). <b>Name-fit rule (the gh#302 pick, followed):</b> plate names start 40px, floor 24px; slot names start 36px, floor 20px. The three NAME FIT worst cases are among the five finalists (the fixture guarantees it). No new hue, font or size without a canvas source.</p>
    <div class="cands"><div class="cand">${valuesTable([...STAGE_VALUES, ['#23214d body + #ffcc00 flap/edge/seal', 'the gift envelope art', 'gh#302 B picked surface; tokens.css --accent-gold'], ['300px art box, 204px body; arc 280/300/320', 'envelope geometry (PROPOSAL)', 'new on this board; type never scaled'], ['320 x 64px pill, radius 999px', 'name plate', 'the gh#303 lane plate (PICKED)'], ['2000px', 'camera distance (FOCAL with fitCamera; one world unit per frame px on the row plane)', 'RATIFIED as built 2026-11-18 (PD-317-08 a, owner pick)'], ['212.8° (about 3.714 rad)', 'the solved open flap angle behind the drawn tip (art-box y 24); the lift stays 300ms ease-out', 'RATIFIED as built 2026-11-18 (PD-317-09 a): solveOpenAngle bisects to the drawn tip'], ['two lines, 30px to a 20px floor', 'the MC prize line in a slot (the cap; env-cap)', 'PD-317-02 (a) owner pick 2026-11-18: the floor is the slot name floor this board already sets'], ['empty: transparent, 3px dashed #9a97c0, dim number · next: 3px solid #ffcc00 ring, gold number', 'env-idle placement states (the empty and next plates)', 'RATIFIED as built 2026-11-18 (PD-317-12 a): Gh305GamePick i2-lanes B, the reuse ruled 2026-11-16'], [`s < ${ROW_THRESHOLD.envelopes} (viewport width < ${Math.ceil(1920 * ROW_THRESHOLD.envelopes)}px at the 1920 frame width)`, 'the below-threshold band for the real-pixel free-name row', 'PD-317-03 (a) owner pick 2026-11-18; 100s - 44 >= 8 at s >= 0.52 (the 8px touch-spacing minimum)'], [`row top = PLATE_Y x s + max(44, 64 x s) + ${ROW_GAP}, real px (PLATE_Y ${PLATE_Y.envelopes})`, 'the free-name row below the threshold (env-row-640/720/845)', 'new on this board (PD-317-03 a); the built control geometry (final-picks.ts PLATE_Y, the .pd-lane height floor)'], ['pill: min-height 52px, padding 0 32px, border 3px #ffcc00, radius 999px, #23214d ground, white Sarabun 700 22px/1.35; row gap 16px, centred, wraps', 'the free-name pill and row', 'the built .pd-name / .pd-names (i2-lanes VALUES)'], [`band top = row bottom + ${ROW_GAP}; band height 190 x s; box bottom margin 20 x s; box height = band top + 210 x s`, 'the low band yields below the threshold; the stage box grows, s = width/1920 unchanged', 'new on this board (PD-317-03 a)'], [`NAMES_Y ${NAMES_Y.envelopes} at s >= ${ROW_THRESHOLD.envelopes}`, 'the free-name row above the threshold', 'PD-317-11 (b) follows the PD-317-03 (a) move (owner picks 2026-11-18); the built final-picks.ts NAMES_Y']])}</div><div class="cand">${contrastTable(pairs)}</div></div>
  </div>`);
  rows.push(nameFitRow([...SHARED_FIT, ['envelope prize-slot names', 'Sarabun 700', '36px', '20px', 'the body width less 36px (264px row, 244px arc edge)', 'W x12: 25px; U+0E12 x12: 20px; U+0E12 U+0E33 x12: 20px, two lines'], ['envelope prize line (MC-typed)', 'Sarabun 400', '30px', '20px', 'the body width less 36px (264px row)', 'the joined samples at the cap: two lines at 20px (env-cap); the render fails a third line']]));
  rows.push(rolesRow('Gh317Envelopes'));
  rows.push(copyRow());
  rows.push(notesRow([
    '<b>Rests on gh#299:</b> decisions 7 (the picks are theatre, equal odds), 9 (1 to 5 prizes, set by the MC), 11 (3D on the projector, the phone light 2D, reduced motion fades, ADR-0051), 12 (the two finals share one mechanic; the owner keeps both), the game sketch. <b>On gh#317:</b> the envelope final. <b>On gh#302 (picked):</b> direction B NIGHT STAGE, the result frame, the copy. <b>On gh#303 (picked):</b> the L2 no-prize copy ("ไม่มีรางวัล" / "ขอบคุณที่ร่วมลุ้น"), the lane plate pill, the card-radius and back values reused on the gh#318 board.',
    '<b>The shared mechanic</b> (pick -> reveal -> prize slot, the D1 layout and D2 order decisions, the plates, the no-prize copy, the 2D path and the fallback) is designed once in shared.mjs and is identical on the gh#318 card board; only the object\'s look differs. The README records the shared part and the per-game part.',
    '<b>Not drawn:</b> how the MC places the picks (a setup-page control, gh#302\'s board); the phone\'s own join/card/claim screens (gh#302 / gh#309); the QR-mode final code card (gh#302 / gh#305, already built).',
    '<b>Not covered:</b> a real projector, room or venue frame rate; the 3D motion itself (the frames are 2D stills of the 3D intent).',
  ]));
  const OWNER = `<div class="pin q"><b>DECISIONS PICKED 2026-11-16 (owner popups, recorded on gh#317):</b><ul>
  <li><b>D1. Layout</b> (shared with gh#318): <b>A ROW</b> — five equal envelopes on one baseline.</li>
  <li><b>D2. Reveal order</b> (shared with gh#318): <b>A ONE AT A TIME</b> — the no-prize envelopes first, prize 1 last; the MC names each.</li>
  <li><b>E1. Proposed copy</b>: approved as it stands. The no-prize copy is the gh#303 L2 pick, reused verbatim, not re-opened.</li>
  <li>The 2026-11-18 audit picks are quoted verbatim in the header banner; the stamps land in MOTION (PD-317-07), VALUES (PD-317-02, PD-317-08, PD-317-09, PD-317-12, the row geometry), NAME FIT (the prize line) and the IDLE 3D intent (PD-317-10), and the new frames env-phone-320/390 (PD-317-01), env-cap (PD-317-02), env-row-640/720/845 (PD-317-03, PD-317-11) are drawn to them. Frames drawn to a pick go to code without a separate sign-off (owner ruling); the code picks are built under gh#319.</li>
</ul></div>`;
  return boardDoc('gh#317 · prize draw phase 2 · ซองของขวัญ (gift-envelope final)', 'gh#317: board drawn to the owner\'s picks, ADR-0033. The shared mechanic with gh#318 is designed once (shared.mjs).',
    [ORDER_LINE_PICKED, 'The board decisions were picked 2026-11-16 (D1 A ROW, D2 A ONE AT A TIME, E1 approved); the 2026-11-18 audit picks below are quoted verbatim from the last pick comment on gh#317. Visual language: the gh#302 pick (B NIGHT STAGE on the projector, 2026-11-11) and the gh#303 picked card/ladder values. Frames are 2D stills of a 3D scene (three, ADR-0060); the envelope look is an execution choice from canvas values (VALUES row).', OWNER],
    STAGE_CSS + SHARED_CSS + CSS + PHONE_CSS + TW_CSS, rows, { status: 'DRAWN TO THE OWNER\'S PICKS 2026-11-18', rulings: ENV_RULINGS, picks: PICKS_317 });
}

// The 2026-11-18 rulings that change this canvas (the audit picks, gh#317's last pick comment; gh#319 builds them).
const ENV_RULINGS = 'PD-317-07 — the 1500ms pre-hold stamped on MOTION · PD-317-08 — camera 2000px stamped on VALUES · PD-317-09 — the solved flap angle 212.8° stamped behind the drawn tip (VALUES) · PD-317-10 — canvas panels ratified, the reveal\'s words in the live region (the IDLE 3D intent) · PD-317-12 — the i2-lanes B empty/next look stamped on the placement states (VALUES) · frames drawn: env-phone-320/390 (PD-317-01), env-cap (PD-317-02), env-row-640/720/845 (PD-317-03, PD-317-11)';

// Verbatim from the "Owner picks recorded (decision popups, 2026-11-18)" comment on gh#317.
const PICKS_317 = [
  'PD-317-01 → (a) "Extend the picked phone result layout to the demo route, as the projector already has it"',
  'PD-317-02 → (a) "Cap the prize line at two lines and shrink it to a floor (a new board value)"',
  'PD-317-03 → (a) "Place the row in the plate-to-band gap at real pixels below a scale threshold (needs a board frame)"',
  'PD-317-04 → (a) "The demo idle draws env-idle with the demo\'s five picks placed"',
  'PD-317-05 → (a) "The shared demo fixture takes the board\'s sample prize names (this changes the four phase-1 demos too)"',
  'PD-317-06 → (a) "Hold env-result as the settled result; put the shared 2D frame behind a control"',
  'PD-317-07 → (a) "Stamp 1500ms on the board\'s MOTION row" — ratified as built',
  'PD-317-08 → (a) "Stamp 2000px on VALUES" — ratified as built',
  'PD-317-09 → (a) "Stamp the solved angle as the execution value behind the drawn tip" — ratified as built',
  'PD-317-10 → (a) "Ratify canvas panels and carry the reveal\'s words in the live region" — ratified as built',
  'PD-317-11 → (b) "move the row (PD-317-03)" — follows the PD-317-03 (a) pick',
  'PD-317-12 → (a) "Stamp the i2-lanes B empty/next look on env-idle\'s placement states" — ratified as built',
  'PD-317-13 → (a) "Approve as they stand"',
];
export { esc };
