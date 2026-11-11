// gh#303 REFUTE rounds 1 and 2: the picked option's VALUES as ROLES (the gh#302 mechanism). Each role names the
// elements it covers (a CSS selector list) and the only values they may render; render-boards.mjs checks every
// element of a picked frame (data-dir = the board's pick, or F for a shared frame) and its ::before / ::after
// against them. Ownership is EXCLUSIVE (round 2): each property an element renders must be listed by exactly one row
// among the rows matching that element, so no row is a wildcard and no row can lend a value to another's element.
// Tokens are computed values: 2.5px borders render 2px at a device pixel ratio of 1, so they read 2px. A faded paint is
// listed as its pre-composited solid (lib.mjs faded(): the grammar admits no opacity).
import { esc, faded } from './lib.mjs';

const T = 'tokens.css';
const INK = '#14142b', GOLD = '#ffcc00', CREAM = '#fff6e0', WHITE = '#ffffff', MUTED = '#3d3b5c', PINK = '#ff3d7f', SKY = '#2b7bff';
const NIGHT = '#23214d', SOFT = '#d9d6f0', DIM = '#9a97c0', LILAC = '#c9c2ff', RED = '#c2185b', HATCH = '#2e2b63';
const GLOW = (px) => `rgba(255,204,0,0.45) 0px 0px ${px}px 0px`;
const box = (bg, bw, bc, rad, sh) => [bg && `background-color:${bg}`, bw && `border-width:${bw}`, bc && `border-color:${bc}`, rad && `radius:${rad}`, sh && `box-shadow:${sh}`].filter(Boolean);
const PK = 'PICKED 2026-11-11';
const PAINTS = [GOLD, WHITE, PINK, SKY];
// stroke and fill tokens for these colours at each of these opacities (pre-composited)
const paints = (cols, ops, kinds = ['stroke', 'fill']) => [...new Set(ops.flatMap((o) => cols.flatMap((c) => kinds.map((k) => `${k}:${faded(c, o)}`))))];

// The projector chrome every game board shares (gh#302 B, picked).
const STAGE = [
  ['night ground', '.pj', ['background-image:linear-gradient(#14142b 0%, #23214d 100%)'], `${T} --color-line-strong to ${NIGHT} (gh#302 PICKED)`],
  ['white labels', '.pj :is(.dots .rl, .low > .flow, .spot h2, .wcard:not(.none) .wn, .plate.done .fit, .codebox .ci, .lplate .fit, .card.down .face, .card.down .fit)', [`color:${WHITE}`], `${T} --ink-light`],
  ['secondary labels', '.pj :is(.ev, .lk, .flow small, .codebox .ck, .pz, .claim, .plate .pr, .slot .sp), .pj :is(.ev, .lk, .codebox .ck, .pz, .claim, .plate .pr, .slot .sp) *', [`color:${SOFT}`], `${T} --ink-on-band-soft`],
  ['gold figures', '.pj :is(.gname, .digits, .flow .to, .spot .wn, .cd .num, .bignum .num, .rule, .slot.prize .sk)', [`color:${GOLD}`], `${T} --accent-gold`],
  ['ink on gold', '.pj :is(.chip.in, .chip.in *, .chip.lit, .chip.lit *, .plate.up .fit)', [`color:${INK}`], 'ink on gold'],
  ['a name that did not pass', '.pj :is(.chip.out, .chip.out *, .wcard.none .wn, .slot.none .sk, .slot.none .sk *)', [`color:${DIM}`], `${DIM} (gh#302 PICKED; L2 PICKED for the no-prize label)`],
  ['round dot ring', '.pj .dots i:not(.on)', ['border-width:3px', `border-color:${SOFT}`], `${T} --ink-on-band-soft`],
  ['completed-round dot', '.pj .dots i.done', [`background-color:${SOFT}`], `${T} --ink-on-band-soft`],
  ['current-round dot', '.pj .dots i.on', [...box(GOLD, '3px', GOLD), `box-shadow:${GLOW(18)}`], `${T} --accent-gold; glow (gh#302 PICKED)`],
  ['round dot shape', '.pj .dots i:not(.fin)', ['radius:50%'], 'circle'],
  ['final-round dot shape', '.pj .dots i.fin', ['radius:999px'], 'pill'],
  ['name pill shape', '.pj .chip:not(.lan)', ['radius:999px'], 'pill (gh#302 PICKED)'],
  ['name pill', '.pj .chip:not(.in):not(.out):not(.lit)', [`background-color:${NIGHT}`], `${NIGHT} (gh#302 PICKED)`],
  ['passed name pill', '.pj .chip.in', [`background-color:${GOLD}`, `box-shadow:${GLOW(16)}`], `${T} --accent-gold; glow`],
  ['name pill that did not pass', '.pj .chip.out', [`box-shadow:${NIGHT} 0px 0px 0px 2px inset`], `${DIM} text (gh#302 PICKED)`],
  ['glow on the count', '.pj .flow .to', ['text-shadow:rgba(255,204,0,0.45) 0px 0px 24px'], PK],
  ['glow on the prize-1 winner', '.pj .spot .wn', ['text-shadow:rgba(255,204,0,0.45) 0px 0px 30px'], PK],
  ['veil', '.pj .veil', ['background-color:rgba(20,20,43,0.78)'], 'gh#302 PICKED'],
  ['winner card', '.pj .wcard', box(NIGHT, null, null, '24px'), 'gh#302 PICKED'],
];

export const ROLES = {
  Gh303Fireworks: { pick: 'A', rows: [
    ...STAGE,
    ['lantern shape', '.pj .grid .chip.lan', ['radius:10px', 'radius:16px'], `${PK} (was PROPOSAL)`],
    ['lit lantern', '.pj .grid .chip.lan.lit', [`background-color:${GOLD}`, `box-shadow:${GLOW(16)}`], `${T} --accent-gold; glow`],
    ['glow on the countdown numeral', '.pj .cd .num', ['text-shadow:rgba(255,204,0,0.45) 0px 0px 40px'], PK],
    ['burst rays and sparks', '.pj svg.layer g.burst :is(line, circle)', paints(PAINTS, [1, 0.6, 0.55, 0.5, 0.22]), `${T} gold, white, punch, sky; a past burst or the smoke at 0.6, 0.55, 0.5 or 0.22 of them over the ground (${PK})`],
    ['rocket body, nose and fins', '.pj svg.layer g.rocket path', [`fill:${WHITE}`, `fill:${GOLD}`, `fill:${PINK}`], `${PK} (was PROPOSAL: white body, gold nose, pink fins)`],
    ['rocket window', '.pj svg.layer g.rocket circle', [`fill:${NIGHT}`], PK],
    ['rocket trail', '.pj svg.layer polygon.trail', [`fill:${GOLD}`], `${PK}; a gold taper (was a gradient)`],
    ['launch rail', '.pj svg.layer > rect', [`fill:${NIGHT}`], PK],
    ['name plate shape', '.pj .plate', ['radius:28px'], `${PK} (was PROPOSAL)`],
    ['name plate, rising', '.pj .plate.up', [`background-color:${GOLD}`, `box-shadow:${GLOW(24)}`], `${PK} (was PROPOSAL)`],
    ['name plate, burst', '.pj .plate.done', [`background-color:${NIGHT}`], `${PK} (was PROPOSAL)`],
  ] },
  Gh303Cards: { pick: 'B', rows: [
    ...STAGE,
    ['card shape', '.pj .grid .card', ['radius:6px'], PK],
    ['card back', '.pj .grid .card.down', ['background-image:repeating-linear-gradient(45deg, #23214d 0px, #23214d 6px, #2e2b63 6px, #2e2b63 7px)', `box-shadow:${GOLD} 0px 0px 0px 2px inset`], `${NIGHT}, ${HATCH} (${PK}), gold edge`],
    ['card face', '.pj .grid .card.up:not(.fail)', [`background-color:${WHITE}`], `${T} --ink-light`],
    ['card that meets the rule', '.pj .grid .card.pass', [`box-shadow:${GOLD} 0px 0px 0px 3px, ${GLOW(16)}`], `${T} --accent-gold; glow`],
    ['card that does not', '.pj .grid .card.fail', [`box-shadow:${NIGHT} 0px 0px 0px 2px inset`], 'gh#302 PICKED (a name that did not pass)'],
    ['name on a face', '.pj .grid .card.up:not(.fail) .fit', [`color:${INK}`], 'ink'],
    ['rank on a black card', '.pj .grid .card.up:not(.red):not(.fail) .face', [`color:${INK}`], 'ink'],
    ['rank on a red card', '.pj .grid .card.up.red:not(.fail) .face', [`color:${RED}`], `${PK} (C2, was PROPOSAL)`],
    ['suit on a black card', '.pj .grid .card.up:not(.red):not(.fail) .face svg *', [`fill:${INK}`], 'ink'],
    ['suit on a red card', '.pj .grid .card.up.red:not(.fail) .face svg *', [`fill:${RED}`], `${PK} (C2)`],
    ['suit on a face-down card (not shown)', '.pj .grid .card.down .face svg *', [`fill:${INK}`, `fill:${RED}`], 'ink, C2 red'],
    ['rank, suit and name of a card that does not meet the rule', '.pj .grid .card.fail :is(.face, .fit), .pj .grid .card.fail .face svg *', [`color:${DIM}`, `fill:${DIM}`], 'gh#302 PICKED'],
    ['rule card', '.pj .rulecard', [...box(WHITE, null, null, '32px'), `box-shadow:${GLOW(60)}`], `${PK} (B ALL AT ONCE)`],
    ['rule card label', '.pj .rulecard .rk', [`color:${MUTED}`], `${T} --color-muted`],
    ['rule card text and suits', '.pj .rulecard .rv, .pj .rulecard svg *', [`color:${INK}`, `fill:${INK}`], 'ink'],
    ['glow on the rule', '.pj .rule', ['text-shadow:rgba(255,204,0,0.45) 0px 0px 24px'], PK],
    ['code card', '.pj .codebox', [...box(NIGHT, '3px', GOLD, '24px'), `box-shadow:${GLOW(60)}`], 'gh#302 PICKED'],
  ] },
  Gh303Ladder: { pick: 'B', rows: [
    ...STAGE,
    ['lanes, rungs and leader lines', '.pj svg.layer line', [SOFT, faded(SOFT, 0.35), faded(SOFT, 0.25), faded(SOFT, 0.35 * 0.25)].map((c) => `stroke:${c}`), `${T} --ink-on-band-soft; lanes at 0.35, the result's track at 0.25 (pre-composited)`],
    ['paths and their heads', '.pj svg.layer :is(polyline, circle)', paints(PAINTS, [1, 0.35, 0.25]), `${PK} (was PROPOSAL); the glow at 0.35, the result's track at 0.25 (pre-composited)`],
    ['lane plate', '.pj .lplate', [`background-color:${NIGHT}`, 'radius:999px'], `${PK} (was PROPOSAL)`],
    ['lane plate dot', '.pj .lplate i', ['radius:50%', ...PAINTS.map((c) => `background-color:${c}`), `box-shadow:${NIGHT} 0px 0px 0px 4px inset`], `${PK}; the dashed path's dot is ringed`],
    ['prize slot shape', '.pj .slot', ['radius:24px'], `${PK} (was PROPOSAL)`],
    ['prize slot with a prize', '.pj .slot.prize', [`background-color:${NIGHT}`, `box-shadow:${GOLD} 0px 0px 0px 3px inset`], PK],
    ['slot with no prize', '.pj .slot.none', [`box-shadow:${NIGHT} 0px 0px 0px 2px inset`], PK],
  ] },
};

const PAGE = [
  ['page ground', '.cp, .hm', box(CREAM), `${T} --color-ground-warm`],
  ['arrows', '.cp svg path, .hm svg path', [`stroke:${INK}`], 'ink'],
];
ROLES['CatCompany-partyPop'] = { pick: 'A', rows: [
  ...PAGE,
  ['ink text', '.cp :is(.crumb, h1, .lead, .lead *, .pills > span, .intro, .intro *, .gc h3, .gc p, .gc p *, .gc .cta, .gc.event .go, .cc, .pills-nav span)', [`color:${INK}`], `${T} --color-line-strong`],
  ['secondary text', '.cp :is(.kicker, .ad b, .ad span)', [`color:${MUTED}`], `${T} --color-muted`],
  ['brand', '.cp :is(.brand, .foot .row)', [`color:${GOLD}`], `${T} --accent-gold`],
  ['chrome bar, footer', '.cp :is(.chrome, .foot)', box(INK), `${T} --color-line-strong`],
  ['chrome pills', '.cp .pills-nav span', [...[GOLD, PINK, SKY, LILAC].map((c) => `background-color:${c}`), 'radius:999px'], `${T} accents; ${LILAC} PICKED (K1)`],
  ['category header', '.cp .head', [...box(LILAC), 'border-width:2px', `border-color:${INK}`], `${LILAC} PICKED (K1); ink rule`],
  ['pills under the lead', '.cp .pills > span', box(CREAM, '2px', INK, '999px'), 'src/pages/c/[category].astro .pills li (live)'],
  ['intro card', '.cp .intro', box(CREAM, '2px', INK, '16px', `${INK} 4px 4px 0px 0px`), 'src/pages/c/[category].astro .intro-card (live)'],
  ['ad slots', '.cp .ad', [...box(null, '2px', 'rgba(20,20,43,0.35)', '14px'), 'border-style:dashed'], 'src/pages/c/[category].astro .ad-slot (live)'],
  ['game and event cards', '.cp .gc', box(LILAC, '2px', INK, '16px', `${INK} 4px 4px 0px 0px`), `${LILAC} PICKED (K1)`],
  ['card call-to-action rule', '.cp .gc .cta', ['border-width:2px', 'border-color:rgba(20,20,43,0.2)'], 'src/pages/c/[category].astro .card-cta (live)'],
  ['event call to action', '.cp .gc.event .go', box(GOLD, '2px', INK, '999px'), `${T} --accent-gold (K3 PICKED)`],
  ['cross-link cards', '.cp .cc', [...[PINK, GOLD, SKY, WHITE].map((c) => `background-color:${c}`), 'border-width:2px', `border-color:${INK}`, 'radius:16px', `box-shadow:${INK} 4px 4px 0px 0px`], 'each target\'s accent'],
] };
ROLES.Gh303Home = { pick: 'A', rows: [
  ...PAGE,
  ['ink text', '.hm :is(.sec-head h2, .tile .name, .tile .desc, .tile .desc *)', [`color:${INK}`], `${T} --color-line-strong`],
  ['secondary text', '.hm .sec-head p, .hm .sec-head p *', [`color:${MUTED}`], `${T} --color-muted`],
  ['see-all pill', '.hm .see-all', box(INK, null, null, '999px'), 'Section.astro'],
  ['see-all text', '.hm .see-all', [`color:${GOLD}`], `${T} --surface-sun`],
  ['tile, 1440', '.hm.w1440 .tile', box(LILAC, '4px', INK, '22px', `${INK} 6px 6px 0px 0px`), `TextTile.astro; ${LILAC} PICKED (K1)`],
  ['tile, 320', '.hm.w320 .tile', box(LILAC, '3px', INK, '18px', `${INK} 4px 4px 0px 0px`), `TextTile.astro; ${LILAC} PICKED (K1)`],
] };

// The role table, written into the VALUES row; the render reads data-sel and data-v.
export function rolesTable(board) {
  const r = ROLES[board];
  return `<table class="tbl" data-values-dir="${r.pick}"><tr><th>role (picked ${r.pick}, and the shared frames)</th><th>elements (selector)</th><th>the only values they may render</th><th>source</th></tr>${r.rows.map(([role, sel, tok, src]) => `<tr data-sel="${esc(sel)}" data-v="${esc(tok.join('|'))}"><td>${esc(role)}</td><td>${esc(sel)}</td><td>${tok.map(esc).join('<br>')}</td><td>${esc(src)}</td></tr>`).join('')}</table>`;
}
export const rolesRow = (board) => `
  <div class="brow">
    <h2>VALUES BY ROLE · the picked option's values, enforced by the render (gh#303 REFUTE rounds 1 and 2, the gh#302 mechanism)</h2>
    <p class="why">Every element of a picked or shared frame, and its ::before and ::after, renders each property only as the ONE role row that owns that property for it: a property no row owns fails, a property two rows claim fails, and a value its row does not list fails. A pseudo-element with any content other than "" fails, and a &lt;template&gt; on the board fails. Values of the option that was NOT PICKED appear in no role, so they fail in a picked frame. A faded paint is listed as its solid pre-composited over the ground: the board grammar admits no opacity, no gradient paint and no symbol.</p>
    ${rolesTable(board)}
  </div>`;
