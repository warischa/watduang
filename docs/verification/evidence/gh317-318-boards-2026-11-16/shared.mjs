// The SHARED mechanic of the two phase-2 finals (gh#317 gift envelopes, gh#318 turn-a-card), designed once here
// and given each game's own look in board-envelopes.mjs / board-cards318.mjs. pick -> reveal -> prize slot:
// five finalists each pick one object; the final's uniform order (gh#299 decision 7, the draw the event already
// makes) assigns prize 1..N to the finalists in rank order, so whichever object a finalist picks opens to THEIR
// drawn prize. The pick is theatre and never changes the odds. N is the MC's prize count (1..5, decision 9).
// Every count comes from the gh#303 event fixture (lib.mjs EV / FINALISTS / PRIZES), imported read-only.
//
// Fork ruling: lib.mjs, stage.mjs, grammar.mjs and thai-scan.mjs are IMPORTED (or run) read-only from
// ../gh303-boards-2026-11-11 at commit 1f575748a6c39b07a92d3a429fe8e8f8da2a60d3. Only roles.mjs,
// render-boards.mjs and mustred.mjs are copied and changed (each says what); chrome.mjs is new (the pre-pick
// board chrome lib.mjs's post-pick functions cannot serve). See README.md.
import { th, nm, fit, esc, FINALISTS, PRIZES, EVENT, EV, rng, shuffle, faded, GROUND_MID, resetCopy, ratio } from '../gh303-boards-2026-11-11/lib.mjs';
import { STAGE_CSS, scaled, frame, top, plainResult, STAGE_VALUES, STAGE_PAIRS, STAGE_DEVIATIONS } from '../gh303-boards-2026-11-11/stage.mjs';

export { th, nm, fit, esc, FINALISTS, PRIZES, EVENT, EV, rng, shuffle, faded, GROUND_MID, resetCopy, ratio };
export { STAGE_CSS, scaled, frame, top, plainResult, STAGE_VALUES, STAGE_PAIRS, STAGE_DEVIATIONS };

// The prize count the main frames are drawn with (the MC may set 1..5; the ONE PRIZE frame draws 1).
export const N = 3;
export const NFEW = 1;

// Pre-register the copy this board REUSES verbatim from the picked gh#302 / gh#303 boards, so lib.mjs th()
// (first registration wins) records the true source before stage.mjs's plainResult/top register them as 'new'.
export function preRegisterCopy() {
  th('รอบชิงรางวัล', 'projector: final label', 'g303');
  th('ไม่มีรางวัล', 'final: a slot with no prize', 'g303');
  th('ขอบคุณที่ร่วมลุ้น', 'final: the line under a no-prize slot', 'g303');
  th('ผู้ได้รับรางวัล', 'result: heading', 'g302');
  th('ผู้ได้รางวัล เปิดหน้าผลในมือถือให้ทีมงานดู ชื่อต้องตรงกับบนจอนี้', 'result: claim line', 'g302');
  for (let k = 1; k <= 5; k++) th(`รางวัลที่ ${k}`, 'prize label', 'g302');
}

// The pick assignment, one seeded shuffle shared by both games (the same mechanic, the same theatre).
// FINALISTS[i] is the finalist the draw ranks i+1 (prize order). PICKS[i] = the object finalist i picks.
export const PICKS = shuffle([0, 1, 2, 3, 4], rng(317));
export const WHO = (() => { const w = Array(5); PICKS.forEach((p, i) => { w[p] = i; }); return w; })();
// The prize index object p opens to under n prizes: its picker's rank if within n, else -1 (no prize).
export const prizeOf = (p, n) => (WHO[p] < n ? WHO[p] : -1);
// Reveal order A (ONE AT A TIME): the no-prize objects first (left to right), then prize N down to prize 1,
// so the grand prize opens last. The mid-reveal still opens exactly the no-prize objects.
export const revealOrder = (n) => {
  const none = [0, 1, 2, 3, 4].filter((p) => prizeOf(p, n) < 0);
  const prizes = [0, 1, 2, 3, 4].filter((p) => prizeOf(p, n) >= 0).sort((a, b) => prizeOf(b, n) - prizeOf(a, n));
  return [...none, ...prizes];
};
export const openSetA = (n) => new Set(revealOrder(n).slice(0, 5 - n)); // the no-prize objects, opened first
// Finalists in prize order (prize 1 first), then the no-prize ones: FINALISTS already is that order.
export const rankList = () => FINALISTS.slice();

// ---- shared stage geometry (authored 1920x1080, shown at 75%) ----
export const XS = [280, 620, 960, 1300, 1640]; // the five object centres, both layouts
// A ROW: every object the same size on one baseline. B ARC: a shallow arc, the centre nearest (lowest and
// largest), the edges farther (higher and smaller). Type is NEVER scaled: every label, prize name and name is
// authored at its full px size in both layouts (the gh#303 ladder's stamped lesson: far text under 30px fails).
export const ROW_W = 300;
export const ARC_W = [280, 300, 320, 300, 280];
export const arcTop = (baseTop) => [baseTop - 40, baseTop - 20, baseTop, baseTop - 20, baseTop - 40];
export const rowTop = (baseTop) => [baseTop, baseTop, baseTop, baseTop, baseTop];
export const widthFor = (opt, base) => (opt === 'A' ? [base, base, base, base, base] : ARC_W.map((w) => w - (300 - base)));

// The name plate under an object (the pick shown in words, never colour alone). 320px pill, Sarabun 700 40px,
// NAME FIT floor 24px (the gh#303 lane plate's proven floor: 12 x W and 12 x U+0E12 stay on one line).
export const plate = (x, t, name) => `<div class="plate" style="left:${x - 160}px; top:${t}px;"><span class="${fit(24, 40)}">${nm(name)}</span></div>`;

// The prize slot's text. k names the child classes so the envelope (.slot, night surface, STAGE roles) and the
// card face (.pcard, white/dark face, its own roles) reuse one mechanic with their own paint.
export function prizeInner(who, n, k) {
  const p = who < n ? who : -1;
  const head = p >= 0
    ? `<div class="${k.label}">${th(`รางวัลที่ ${p + 1}`, 'prize label', 'g302')}</div><div class="${k.name}">${th(PRIZES[p], 'prize name (typed by the MC)', 'sample')}</div>`
    : `<div class="${k.label}">${th('ไม่มีรางวัล', 'final: a slot with no prize', 'g303')}</div><div class="${k.name}">${th('ขอบคุณที่ร่วมลุ้น', 'final: the line under a no-prize slot', 'g303')}</div>`;
  return { cls: p >= 0 ? 'prize' : 'none', html: `${head}<span class="${k.who} ${fit(20, 36)}">${nm(FINALISTS[who])}</span>` };
}

// A rounded rect as a path (the grammar admits no <rect> stroke and no arc command; Q curves close the corners).
export const rr = (x, y, w, h, r) => `M${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x + r} Q${x},${y + h} ${x},${y + h - r} V${y + r} Q${x},${y} ${x + r},${y} Z`;

// The ground shadow under an arc object: a circle squashed by a g transform (the grammar admits no <ellipse>),
// pre-composited over the night ground's midpoint (no opacity). Drawn before any object so it covers none.
export const shadowLayer = (items) => `<svg class="layer" width="1920" height="1080" viewBox="0 0 1920 1080" style="z-index:1;" aria-hidden="true">${items.map(([x, y, r]) => `<g class="shadow" transform="translate(${x} ${y}) scale(1 0.25)"><circle cx="0" cy="0" r="${r.toFixed(1)}" fill="${faded('#14142b', 0.5)}"/></g>`).join('')}</svg>`;

// The centred heading band: the game name (gold) and the instruction (soft). Both are STAGE-role colours.
export const hud = (gameName, instruction) => `<div class="hud"><div class="gname">${gameName}</div><div class="lk">${instruction}</div></div>`;
// The lower band: status, the prize count, and a note. The count is the fixture's N, never a typed number.
export const lowBand = (status, n, note) => `<div class="low"><div><div class="lk">${status}</div></div><div class="flow"><span class="to">${n}</span><small>${th('รางวัล', 'unit: prizes')}</small></div><div class="rt"><div class="lk">${note}</div></div></div>`;

// The shared CSS both boards add on top of STAGE_CSS: the plate, the heading band, the envelope prize slot.
export const SHARED_CSS = `
    /* ---- shared mechanic chrome: name plates, heading band, the envelope's prize slot ---- */
    .pj .hud { position: absolute; left: 56px; right: 56px; top: 116px; text-align: center; z-index: 3; }
    .pj .hud .lk { margin-top: 6px; }
    .pj .plate { position: absolute; box-sizing: border-box; width: 320px; min-height: 64px; padding: 4px 14px; display: flex; align-items: center; justify-content: center;
                 border-radius: 999px; background: #23214d; color: #ffffff; font: 700 40px/1.15 'Sarabun', sans-serif; z-index: 3; }
    .pj .plate .fit { flex: 1 1 auto; min-width: 0; text-align: center; line-height: 1.15; white-space: nowrap; overflow-x: clip; overflow-y: visible; }
    .pj .objs { position: absolute; top: 0px; right: 0px; bottom: 0px; left: 0px; }
    .pj .slot { position: absolute; box-sizing: border-box; text-align: center; z-index: 3; }
    .pj .slot .sk { font: 600 30px/1.25 'Mitr', sans-serif; white-space: nowrap; color: #ffcc00; }
    .pj .slot.none .sk { color: #9a97c0; }
    .pj .slot .sp { margin-top: 4px; font: 400 30px/1.3 'Sarabun', sans-serif; color: #d9d6f0; }
    .pj .slot .sw { display: block; margin-top: 6px; font: 700 36px/1.2 'Sarabun', sans-serif; white-space: nowrap; overflow-x: clip; overflow-y: visible; color: #ffffff; }
    .pj .slot.none .sw { color: #9a97c0; }`;

// The shared NAME FIT surfaces (the gh#302 rule). Each board adds its own object's name surface.
export const SHARED_FIT = [
  ['name plates', 'Sarabun 700', '40px', '24px', '320px plate less 28px padding', 'W x12: 27px; U+0E12 x12: 24px; U+0E12 U+0E33 x12: 24px, two lines (the plate grows)'],
  ['result: prize 1 (gh#302 frame)', 'Mitr 700', '132px', '96px', 'frame width less 112px', 'U+0E12 U+0E33 x12: 103px, one line'],
  ['result cards (gh#302 frame)', 'Mitr 700', '52px', '32px', 'a quarter of the row less 56px', 'W x12: 35px; U+0E12 x12: 32px'],
];

// The shared rules row (ui-ux-pro-max 2.5.0, queried 2026-11-16; rules taken, never its palette or fonts).
export const RULES_QUERIES = '--domain ux "animation reveal duration timing easing", "reduced motion", "projector legibility contrast large display distance readability", "color not only indicator".';
export const RULES_ITEMS = [
  '<b>Duration Timing</b> (150-300ms micro-interactions, never over 500ms for UI): the plate drop and the claim fade are 200-300ms; the 600ms object turn is a staged game beat, not a UI micro-interaction (the gh#303 picked flip was 600ms too).',
  '<b>Easing Functions</b> (ease-out entering, ease-in-out a turn, never linear for UI): the flap lift and the card turn ease; the prize count does not roll (a final has no elimination count).',
  '<b>Excessive Motion</b> (animate 1-2 key elements per view): A opens ONE object at a time; B one collective turn after a drumroll. The chrome (top bar, plates, band) is still.',
  '<b>Reduced Motion</b> (respect prefers-reduced-motion; ADR-0046 reduce, not remove): the reveal runs the 2D path, the gh#302 picked result frame, reached by 200ms fades last slot to prize 1; the round state is still drawn and the round still finishes.',
  '<b>Color Only</b> (never information by colour alone): a prize slot says "รางวัลที่ k" and a no-prize slot says "ไม่มีรางวัล" with "ขอบคุณที่ร่วมลุ้น" in words; the gold ring / dim type only reinforce it. Each plate names its finalist in words.',
  '<b>Color Contrast</b> (4.5:1 normal text): every text pair in the VALUES contrast table is computed at its own surface, not measured on a projector. <b>Size for distance</b>: non-name text renders at 30px or more (the render reads computed size x the transform chain); names shrink only to their NAME FIT floor.',
];
