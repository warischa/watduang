// gh#317 board: ซองของขวัญ, the gift-envelope final. Five finalists each pick a gift envelope; the envelopes open
// to the prize slots. The pick is theatre (gh#299 decision 7): the final's uniform order already ranks the five,
// so whichever envelope a finalist picks opens to THEIR drawn prize. The shared mechanic (pick -> reveal -> prize
// slot, the layout and order decisions, the plates, the no-prize copy, the 2D path) lives in shared.mjs and is
// identical on the gh#318 card board; this file gives it the envelope's own look.
import { th, nm, fit, esc, FINALISTS, PRIZES, N, NFEW, WHO, openSetA, rankList, XS, rowTop, arcTop, widthFor, plate, prizeInner, rr, shadowLayer, hud, lowBand, preRegisterCopy, resetCopy, ratio,
  STAGE_CSS, STAGE_VALUES, STAGE_PAIRS, STAGE_DEVIATIONS, scaled, frame, top, plainResult, SHARED_CSS, SHARED_FIT, RULES_QUERIES, RULES_ITEMS } from './shared.mjs';
import { tag, sharedTag, copyRow, rulesRow, boardDoc, valuesTable, contrastTable, beatTable, nameFitRow, notesRow, ORDER_LINE } from './chrome.mjs';
import { rolesRow } from './roles.mjs';

const CSS = `
    /* ---- the gift envelope: a night body with a gold flap, bow and seal (SVG art, no text). The prize slot is
       an HTML overlay over the body, so type is never scaled by depth (the gh#303 ladder's stamped lesson). ---- */
    .pj svg.envart { position: absolute; z-index: 1; }`;

const GNAME = () => th('ซองของขวัญ', 'game name', 'ticket');
const SK = { label: 'sk', name: 'sp', who: 'sw' };

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
    `Drawn with ${N} prizes set by the MC: the envelopes are closed, the prizes hidden inside, the prize count in the lower band. Each finalist's name is on a plate under their envelope (the pick shown in words). The picks are theatre (decision 7): the final's order is already drawn, so whichever envelope a finalist picks opens to their own prize. <b>A ROW</b>: five equal envelopes on one baseline. <b>B ARC</b>: a shallow arc, the centre nearest (lowest and largest), the edges farther, ground shadows under each; type stays full size in both (no scaled text). 3D intent: thin box geometry on a plane, the flap a hinged quad; A's camera square to the row, B's 30 degrees above the arc; the prize text an HTML overlay tracking each object's projected rect, never scaled by depth.`,
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
    'Under reduced motion, and below 640px, the reveal runs the 2D path the shared host already draws for a final (src/play/_prize-reveal/reveal.ts, view kind "final"): the gh#302 picked result frame, revealed last slot to prize 1 by 200ms fades. The never-blank fallback (WebGL unavailable) draws the SAME frame. The two triggers converge on one view, so both are drawn from plainResult and tagged for their trigger; the round state is still drawn and the round still finishes (ADR-0046 reduce, not remove). Below 640px this view takes the phone layout (gh#314 two-column result); the phone\'s own join/card/claim screens are gh#302 / gh#309\'s boards, not re-proposed here.',
    [[sharedTag('2D PATH', ` · env-rm · reduced motion and below 640px · the gh#302 picked result frame`), envFrame('A', 'rm')],
     [sharedTag('FALLBACK', ` · env-fallback · WebGL unavailable (ADR-0051) · the same gh#302 picked result frame`), envFrame('A', 'fallback')]]));

  const beatsOne = [
    ['picks', 'until the MC presses start', 'a name plate drops under each envelope as the MC places it, 300ms ease-out', 'plates appear in place'],
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
    <div class="cands"><div class="cand">${valuesTable([...STAGE_VALUES, ['#23214d body + #ffcc00 flap/edge/seal', 'the gift envelope art', 'gh#302 B picked surface; tokens.css --accent-gold'], ['300px art box, 204px body; arc 280/300/320', 'envelope geometry (PROPOSAL)', 'new on this board; type never scaled'], ['320 x 64px pill, radius 999px', 'name plate', 'the gh#303 lane plate (PICKED)']])}</div><div class="cand">${contrastTable(pairs)}</div></div>
  </div>`);
  rows.push(nameFitRow([...SHARED_FIT, ['envelope prize-slot names', 'Sarabun 700', '36px', '20px', 'the body width less 36px (264px row, 244px arc edge)', 'W x12: 25px; U+0E12 x12: 20px; U+0E12 U+0E33 x12: 20px, two lines']]));
  rows.push(rolesRow('Gh317Envelopes'));
  rows.push(copyRow());
  rows.push(notesRow([
    '<b>Rests on gh#299:</b> decisions 7 (the picks are theatre, equal odds), 9 (1 to 5 prizes, set by the MC), 11 (3D on the projector, the phone light 2D, reduced motion fades, ADR-0051), 12 (the two finals share one mechanic; the owner keeps both), the game sketch. <b>On gh#317:</b> the envelope final. <b>On gh#302 (picked):</b> direction B NIGHT STAGE, the result frame, the copy. <b>On gh#303 (picked):</b> the L2 no-prize copy ("ไม่มีรางวัล" / "ขอบคุณที่ร่วมลุ้น"), the lane plate pill, the card-radius and back values reused on the gh#318 board.',
    '<b>The shared mechanic</b> (pick -> reveal -> prize slot, the D1 layout and D2 order decisions, the plates, the no-prize copy, the 2D path and the fallback) is designed once in shared.mjs and is identical on the gh#318 card board; only the object\'s look differs. The README records the shared part and the per-game part.',
    '<b>Not drawn:</b> how the MC places the picks (a setup-page control, gh#302\'s board); the phone\'s own join/card/claim screens (gh#302 / gh#309); the QR-mode final code card (gh#302 / gh#305, already built).',
    '<b>Not covered:</b> a real projector, room or venue frame rate; the 3D motion itself (the frames are 2D stills of the 3D intent).',
  ]));
  const OWNER = `<div class="pin q"><b>DECISIONS FOR THE OWNER (awaiting the pick; record it on gh#317 before any code, ADR-0033):</b><ul>
  <li><b>D1. Layout</b> (shared with gh#318): A ROW (five equal envelopes on one baseline) or B ARC (a shallow arc, the centre nearest and largest, ground shadows; type full size in both).</li>
  <li><b>D2. Reveal order</b> (shared with gh#318): A ONE AT A TIME (the no-prize envelopes first, prize 1 last; the MC names each, about 7s) or B ALL AT ONCE (a drumroll, then all five open in one beat).</li>
  <li><b>E1. Proposed copy</b>: approve, or mark strings to change (COPY SOURCES row). The no-prize copy is the gh#303 L2 pick, reused verbatim, not re-opened.</li>
</ul></div>`;
  return boardDoc('gh#317 · prize draw phase 2 · ซองของขวัญ (gift-envelope final)', 'gh#317: proposal board, ADR-0033. The shared mechanic with gh#318 is designed once (shared.mjs).',
    [ORDER_LINE, 'Visual language: the gh#302 pick (B NIGHT STAGE on the projector, 2026-11-11) and the gh#303 picked card/ladder values. Frames are 2D stills of a 3D scene (three, ADR-0060). Two shared decisions are open: D1 layout (A ROW / B ARC) and D2 reveal order (A ONE AT A TIME / B ALL AT ONCE); the envelope look is an execution choice from canvas values (VALUES row).', OWNER],
    STAGE_CSS + SHARED_CSS + CSS, rows, { status: 'AWAITING OWNER · D1 layout, D2 order, E1 copy' });
}
export { esc };
