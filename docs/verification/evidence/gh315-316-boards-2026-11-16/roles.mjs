// Values by role for the gh#315 / gh#316 proposal boards, the gh#303 REFUTE round-2 mechanism (exclusive ownership:
// every painted property of every checked element is listed by exactly ONE matching row, and only that row's values
// may render). The shared projector chrome rows are the gh#303 STAGE rows verbatim (they were proven green on the
// picked gh#303 boards); the game rows are new. These boards have NO pick yet, so every option frame is checked
// against its own dir's table (A/B/C/F). The options differ in geometry, not paint: one canvas-sourced paint set
// serves every option, and each dir's table repeats it so the render can check each frame against its own dir.
// A faded paint is listed as its pre-composited solid (lib.mjs faded(): the grammar admits no opacity).
import { esc, faded, fadedOver, ZC, ZONE_COLORS, tint } from './lib.mjs';
const TRACK = '#14142b'; // the race track ground (tokens.css --color-line-strong)

const T = 'tokens.css';
const INK = '#14142b', GOLD = '#ffcc00', WHITE = '#ffffff', PINK = '#ff3d7f', SKY = '#2b7bff';
const NIGHT = '#23214d', SOFT = '#d9d6f0', DIM = '#9a97c0', LILAC = '#c9c2ff';
const GLOW = (px) => `rgba(255,204,0,0.45) 0px 0px ${px}px 0px`;
const PK302 = 'gh#302 B, PICKED 2026-11-11';

// The projector chrome every game board shares (gh#303 roles.mjs STAGE, verbatim).
const STAGE = [
  ['night ground', '.pj', ['background-image:linear-gradient(#14142b 0%, #23214d 100%)'], `${T} --color-line-strong to ${NIGHT} (gh#302 PICKED)`],
  ['white labels', '.pj :is(.dots .rl, .low > .flow, .spot h2, .wcard:not(.none) .wn, .plate.done .fit, .codebox .ci, .lplate .fit, .card.down .face, .card.down .fit)', [`color:${WHITE}`], `${T} --ink-light`],
  ['secondary labels', '.pj :is(.ev, .lk, .flow small, .codebox .ck, .pz, .claim, .plate .pr, .slot .sp), .pj :is(.ev, .lk, .codebox .ck, .pz, .claim, .plate .pr, .slot .sp) *', [`color:${SOFT}`], `${T} --ink-on-band-soft`],
  ['gold figures', '.pj :is(.gname, .digits, .flow .to, .spot .wn, .cd .num, .bignum .num, .rule, .slot.prize .sk)', [`color:${GOLD}`], `${T} --accent-gold`],
  ['ink on gold', '.pj :is(.chip.in, .chip.in *, .chip.lit, .chip.lit *, .plate.up .fit)', [`color:${INK}`], 'ink on gold'],
  ['a name that did not pass', '.pj :is(.chip.out, .chip.out *, .wcard.none .wn, .slot.none .sk, .slot.none .sk *)', [`color:${DIM}`], `${DIM} (gh#302 PICKED)`],
  ['round dot ring', '.pj .dots i:not(.on)', ['border-width:3px', `border-color:${SOFT}`], `${T} --ink-on-band-soft`],
  ['completed-round dot', '.pj .dots i.done', [`background-color:${SOFT}`], `${T} --ink-on-band-soft`],
  ['current-round dot', '.pj .dots i.on', [`background-color:${GOLD}`, 'border-width:3px', `border-color:${GOLD}`, `box-shadow:${GLOW(18)}`], `${T} --accent-gold; glow (gh#302 PICKED)`],
  ['round dot shape', '.pj .dots i:not(.fin)', ['radius:50%'], 'circle'],
  ['final-round dot shape', '.pj .dots i.fin', ['radius:999px'], 'pill'],
  ['name pill shape', '.pj .chip:not(.lan)', ['radius:999px'], 'pill (gh#302 PICKED)'],
  ['name pill', '.pj .chip:not(.in):not(.out):not(.lit)', [`background-color:${NIGHT}`], `${NIGHT} (gh#302 PICKED)`],
  ['passed name pill', '.pj .chip.in', [`background-color:${GOLD}`, `box-shadow:${GLOW(16)}`], `${T} --accent-gold; glow`],
  ['name pill that did not pass', '.pj .chip.out', [`box-shadow:${NIGHT} 0px 0px 0px 2px inset`], `${DIM} text (gh#302 PICKED)`],
  ['glow on the count', '.pj .flow .to', ['text-shadow:rgba(255,204,0,0.45) 0px 0px 24px'], PK302],
  ['glow on the prize-1 winner', '.pj .spot .wn', ['text-shadow:rgba(255,204,0,0.45) 0px 0px 30px'], PK302],
  ['veil', '.pj .veil', ['background-color:rgba(20,20,43,0.78)'], 'gh#302 PICKED'],
  ['winner card', '.pj .wcard', [`background-color:${NIGHT}`, 'radius:24px'], 'gh#302 PICKED'],
  // New here: gh#303's picked frames never rendered an unresolved night chip with white name text; these boards do.
  ['standing name text', '.pj .chip:not(.in):not(.out) .fit', [`color:${WHITE}`], `${T} --ink-light (PROPOSAL: the unresolved chip keeps the gh#302 pill, white name)`],
];

const ZKEYS = ZONE_COLORS.map(([k]) => k);
const ZONE = [
  ['zone panel shape', '.pj .zpanel', ['radius:24px'], 'PROPOSAL: the gh#302 winner-card radius on a zone panel'],
  ...ZKEYS.map((k) => [`zone ${k} panel`, `.pj .zpanel.z${k}`, [`background-color:${tint(k)}`, `box-shadow:${ZC[k]} 0px 0px 0px 3px inset`], `PROPOSAL: ${ZC[k]} (${ZONE_COLORS.find(([kk]) => kk === k)[2]}) at 14% over #1c1b3c, 3px rim`]),
  ['zone dot shape', '.pj .zdot', ['radius:50%'], 'circle'],
  ...ZKEYS.map((k) => [`zone ${k} dot (header, legend, standing chip)`, `.pj .zhead .zdot.z${k}, .pj .chip:not(.in) .zdot.z${k}`, [`background-color:${ZC[k]}`], ZONE_COLORS.find(([kk]) => kk === k)[2]]),
  ['zone dot on a passed chip', '.pj .chip.in .zdot', [`background-color:${INK}`], 'ink on gold (the zone tag stays readable on the gold pill)'],
  ['zone header text', '.pj .zname', [`color:${WHITE}`], `${T} --ink-light; white measured 10.7:1+ on every tint (zone-coloured text fails: punch 4.19, sky 3.60)`],
  ['zone badge', '.pj .zbadge', [`color:${SOFT}`], `${T} --ink-on-band-soft`],
  ['seated figure', '.pj .zbadge svg :is(circle, path)', [`fill:${SOFT}`, `stroke:${SOFT}`], `${T} --ink-on-band-soft; PROPOSAL: a drawn seated mark`],
  ['zone legend label', '.pj .zlab', [`color:${WHITE}`], `${T} --ink-light`],
];

const MB = [PINK, SKY, LILAC, WHITE];
const MARBLE = [
  ['race track panel', '.pj .track', [`background-color:${TRACK}`, 'radius:24px'], `${TRACK} (tokens.css --color-line-strong, the gh#302 ground's top stop); the winner-card radius`],
  ['track label', '.pj .tlabel:not(.fin)', [`color:${SOFT}`], `${T} --ink-on-band-soft`],
  ['finish label', '.pj .tlabel.fin', [`color:${GOLD}`], `${T} --accent-gold`],
  ['lane separators', '.pj svg.layer line.lane', [`stroke:${fadedOver(SOFT, 0.25, TRACK)}`], `${T} --ink-on-band-soft at 0.25 over ${TRACK} (the track, pre-composited; the gh#303 ladder mechanism)`],
  ['finish glow', '.pj svg.layer rect.finishglow', [`fill:${fadedOver(GOLD, 0.35, TRACK)}`], `${T} --accent-gold at 0.35 over ${TRACK} (pre-composited)`],
  ['finish line', '.pj svg.layer rect.finish', [`fill:${GOLD}`], `${T} --accent-gold`],
  ['marble streak', '.pj svg.layer polygon.streak', MB.map((c) => `fill:${fadedOver(c, 0.35, TRACK)}`), 'PROPOSAL: the marble colour at 0.35 (pre-composited); decoration, no fate meaning'],
  ['marble glow (across the line)', '.pj svg.layer circle.glow', [`fill:${fadedOver(GOLD, 0.35, TRACK)}`], `${T} --accent-gold at 0.35 over ${TRACK} (pre-composited)`],
  ['marble body, rolling', '.pj svg.layer circle.mb:not(.in):not(.out)', MB.map((c) => `fill:${c}`), 'PROPOSAL: tokens.css --accent-punch, --accent-sky, --accent-lilac, --ink-light; decoration, no fate meaning'],
  ['marble across the line (in)', '.pj svg.layer circle.mb.in', [`fill:${GOLD}`], `${T} --accent-gold (the gh#302 passed state)`],
  ['marble out', '.pj svg.layer circle.mb.out', MB.map((c) => `fill:${fadedOver(c, 0.4, TRACK)}`), 'PROPOSAL: the marble colour at 0.4 (pre-composited), the gh#302 dim state on a marble'],
  ['marble highlight', '.pj svg.layer circle.hl', [`fill:${WHITE}`], `${T} --ink-light; the glass spec`],
];

const SETS = {
  Gh315Zones: { dirs: ['A', 'B', 'C', 'F'], rows: [...STAGE, ...ZONE] },
  Gh316Marbles: { dirs: ['A', 'B', 'F'], rows: [...STAGE, ...MARBLE] },
};

function table(board, dir) {
  const { rows } = SETS[board];
  return `<table class="tbl" data-values-dir="${dir}"><tr><th>role (dir ${dir})</th><th>elements (selector)</th><th>the only values they may render</th><th>source</th></tr>${rows.map(([role, sel, tok, src]) => `<tr data-sel="${esc(sel)}" data-v="${esc(tok.join('|'))}"><td>${esc(role)}</td><td>${esc(sel)}</td><td>${tok.map(esc).join('<br>')}</td><td>${esc(src)}</td></tr>`).join('')}</table>`;
}
export const rolesRow = (board) => `
  <div class="brow">
    <h2>VALUES BY ROLE · every option's values, enforced by the render (the gh#303 REFUTE round-2 mechanism)</h2>
    <p class="why">No pick exists yet, so EVERY option frame (A/B/C) and the shared fallback (F) is checked against its own dir's table: each property an element renders is owned by exactly ONE matching row, and only that row's values may render. A property no row owns fails, two owners fail, an unlisted value fails. The options differ in geometry, not paint, so one canvas-sourced paint set serves them all; a faded paint is listed as its pre-composited solid (the grammar admits no opacity). Rows whose selectors match nothing in a frame are inert.</p>
    ${SETS[board].dirs.map((d) => `<h3>dir ${d}</h3>${table(board, d)}`).join('\n    ')}
  </div>`;
