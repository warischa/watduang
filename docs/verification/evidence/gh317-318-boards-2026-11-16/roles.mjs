// VALUES as ROLES for the two phase-2 final boards (the gh#302 / gh#303 mechanism). COPIED from gh#303's
// roles.mjs and changed: the STAGE chrome rows below are VERBATIM from gh#303 (the gh#302 B picked projector
// chrome); the per-board rows are new for this board's elements (name plate, envelope art, prize-slot name,
// card back/face, ground shadow); PHONE_ROLES / TW_ROLES (shared.mjs) own the 2026-11-18 pick frames (the demo
// phone result, the free-name row below the scale threshold) on BOTH boards. ONE table per board,
// data-values-dir="AB": every option's frames are held to the roles (data-pick stays empty, so the render keeps
// checking A, B and F alike). Ownership is EXCLUSIVE: each property an element renders is listed by exactly
// one matching row. A faded paint is its pre-composited solid (lib.mjs faded(); the grammar admits no opacity).
import { esc, faded } from '../gh303-boards-2026-11-11/lib.mjs';
import { PHONE_ROLES, TW_ROLES } from './shared.mjs';

const T = 'tokens.css';
const INK = '#14142b', GOLD = '#ffcc00', CREAM = '#fff6e0', WHITE = '#ffffff', MUTED = '#3d3b5c', PINK = '#ff3d7f', SKY = '#2b7bff';
const NIGHT = '#23214d', SOFT = '#d9d6f0', DIM = '#9a97c0', LILAC = '#c9c2ff', RED = '#c2185b', HATCH = '#2e2b63';
const GLOW = (px) => `rgba(255,204,0,0.45) 0px 0px ${px}px 0px`;
const box = (bg, bw, bc, rad, sh) => [bg && `background-color:${bg}`, bw && `border-width:${bw}`, bc && `border-color:${bc}`, rad && `radius:${rad}`, sh && `box-shadow:${sh}`].filter(Boolean);
const PK = 'PICKED 2026-11-11';
const PAINTS = [GOLD, WHITE, PINK, SKY];
const paints = (cols, ops, kinds = ['stroke', 'fill']) => [...new Set(ops.flatMap((o) => cols.flatMap((c) => kinds.map((k) => `${k}:${faded(c, o)}`))))];

// The projector chrome every game board shares (gh#302 B, picked). VERBATIM from gh#303 roles.mjs.
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

// The name plate under each object (new on these boards; the gh#303 lane plate's pill, without the path dot).
const PLATE = [
  ['name plate shape', '.pj .plate', ['radius:999px'], 'PROPOSAL (the gh#303 lane plate pill)'],
  ['name plate', '.pj .plate', [`background-color:${NIGHT}`], `${NIGHT} (gh#302 PICKED surface)`],
  ['name on a plate', '.pj .plate .fit', [`color:${WHITE}`], `${T} --ink-light`],
];
// The arc's ground shadow (B only): a squashed circle, pre-composited over the ground midpoint.
const SHADOW = [
  ['ground shadow', '.pj svg.layer g.shadow circle', [`fill:${faded(INK, 0.5)}`], `PROPOSAL; ${INK} at 0.5 over the ground midpoint (pre-composited, no opacity)`],
];
// The envelope's prize-slot name (the .sk label and .sp prize name are STAGE roles; the name is new).
const SLOT_NAME = [
  ['name in a prize slot', '.pj .slot.prize .sw', [`color:${WHITE}`], `${T} --ink-light`],
  ['name in a no-prize slot', '.pj .slot.none .sw', [`color:${DIM}`], `${DIM} (gh#302 PICKED; L2 PICKED)`],
];

export const ROLES = {
  Gh317Envelopes: { pick: 'AB', rows: [
    ...STAGE, ...PLATE, ...SHADOW, ...SLOT_NAME, ...PHONE_ROLES, ...TW_ROLES,
    ['envelope body', '.pj svg.envart path.body', [`fill:${NIGHT}`, `stroke:${GOLD}`], `${NIGHT} (gh#302 PICKED surface), ${T} --accent-gold edge`],
    ['envelope flap', '.pj svg.envart path.flap', [`fill:${GOLD}`], `${T} --accent-gold (the gift flap)`],
    ['envelope seal', '.pj svg.envart circle.seal', [`fill:${NIGHT}`, `stroke:${GOLD}`], `${NIGHT} (gh#302 PICKED), ${T} --accent-gold edge`],
    ['envelope bow', '.pj svg.envart circle.bow', [`fill:${GOLD}`], `${T} --accent-gold`],
  ] },
  Gh318Cards: { pick: 'AB', rows: [
    ...STAGE, ...PLATE, ...SHADOW, ...PHONE_ROLES, ...TW_ROLES,
    ['card shape', '.pj .pcard', ['radius:6px'], `${PK} (gh#303 card radius)`],
    ['card back', '.pj .pcard.down', ['background-image:repeating-linear-gradient(45deg, #23214d 0px, #23214d 6px, #2e2b63 6px, #2e2b63 7px)', `box-shadow:${GOLD} 0px 0px 0px 2px inset`], `${NIGHT}, ${HATCH} (gh#303 PICKED back), gold edge`],
    ['card back mark', '.pj .pcard.down svg polygon', [`fill:${GOLD}`], `${T} --accent-gold; a drawn star, never a suit (no casino styling)`],
    ['card face with a prize', '.pj .pcard.up.prize', [`background-color:${WHITE}`, `box-shadow:${GOLD} 0px 0px 0px 3px, ${GLOW(16)}`], `${T} --ink-light face; ${T} --accent-gold ring and glow (gh#303 passing card)`],
    ['card face with no prize', '.pj .pcard.up.none', [`background-color:${NIGHT}`, `box-shadow:${DIM} 0px 0px 0px 2px inset`], `${NIGHT} face, ${DIM} ring and type (gh#302 PICKED no-prize language)`],
    ['prize label on a face', '.pj .pcard.up.prize .fk', [`color:${RED}`], `${RED} (gh#303 C2 PICKED; gold on white misses 4.5:1)`],
    ['prize name on a face', '.pj .pcard.up.prize .fp', [`color:${INK}`], `${T} --color-line-strong`],
    ['name on a prize face', '.pj .pcard.up.prize .fw', [`color:${INK}`], `${T} --color-line-strong`],
    ['no-prize label on a face', '.pj .pcard.up.none .fk, .pj .pcard.up.none .fk *', [`color:${DIM}`], `${DIM} (gh#302 PICKED; L2 PICKED); the descendant covers th()'s nowrap spans`],
    ['no-prize line on a face', '.pj .pcard.up.none .fp', [`color:${DIM}`], `${DIM} (gh#302 PICKED; L2 PICKED)`],
    ['name on a no-prize face', '.pj .pcard.up.none .fw', [`color:${DIM}`], `${DIM} (gh#302 PICKED; L2 PICKED)`],
  ] },
};

// The role table, written into the VALUES row; the render reads data-sel and data-v. data-values-dir="AB":
// pre-pick, both options' frames are held to these rows (the render reads every table while data-pick is empty).
export function rolesTable(board) {
  const r = ROLES[board];
  return `<table class="tbl" data-values-dir="${r.pick}"><tr><th>role (both options, pre-pick)</th><th>elements (selector)</th><th>the only values they may render</th><th>source</th></tr>${r.rows.map(([role, sel, tok, src]) => `<tr data-sel="${esc(sel)}" data-v="${esc(tok.join('|'))}"><td>${esc(role)}</td><td>${esc(sel)}</td><td>${tok.map(esc).join('<br>')}</td><td>${esc(src)}</td></tr>`).join('')}</table>`;
}
export const rolesRow = (board) => `
  <div class="brow">
    <h2>VALUES BY ROLE · every option's values, enforced by the render (the gh#302 / gh#303 mechanism)</h2>
    <p class="why">These boards AWAIT the owner, so EVERY option's frames (A, B and the shared F) are held to the roles, not only a picked one: any option may be picked, and code may only draw what the grammar and these rows admit. Every element of a checked frame, and its ::before and ::after, renders each property only as the ONE role row that owns that property for it: a property no row owns fails, a property two rows claim fails, and a value its row does not list fails. A pseudo-element with any content other than "" fails, and a &lt;template&gt; on the board fails. A faded paint is listed as its solid pre-composited over the ground: the grammar admits no opacity, no gradient paint and no symbol. The STAGE chrome rows are verbatim from gh#303 (the gh#302 B pick).</p>
    ${rolesTable(board)}
  </div>`;
