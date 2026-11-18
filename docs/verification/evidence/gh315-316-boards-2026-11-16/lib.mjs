// gh#315 / gh#316 board helpers. Forked from gh303-boards-2026-11-11/lib.mjs at commit 1f57574 (read-only source).
// The event fixture, the colour maths, the SVG helpers, the name-fit rule and the annotation chrome are IMPORTED
// from that directory unchanged, so every count on these boards is the gh#303 fixture's own. What is redefined here:
// the copy registry's source strings, the COPY SOURCES row, the frame tag, the RULES CHECKED row (ui-ux-pro-max
// 2.5.0, queried 2026-11-16) and boardDoc's generator comment. Post-pick (2026-11-18, gh#319): the frame copy is
// APPROVED (Z3 / M3, 2026-11-16), the header is the Gh305AuditFrames picks banner (picksBanner), and the audit
// picks are stamped in MOTION / VALUES / NOTES / COPY SOURCES. One registry serves the whole board: stage.mjs is
// copied verbatim into this directory so its './lib.mjs' import resolves HERE, not to gh#303's registry.

export {
  esc, rng, shuffle, ROSTER, ME, CAP_NAME, WIDE_LATIN, WIDE_THAI, WIDE_AM,
  MAX_HEADS, SCHEDULE, EV, assertEvent, PRIZES, FINALISTS, EVENT,
  ratio, svg, GROUND_MID, faded, burst,
  FONTS, ANNOT_CSS, header, ORDER_LINE, contrastTable, valuesTable, beatTable, nameFitRow, notesRow,
  FIT_SCRIPT, fit,
} from '../gh303-boards-2026-11-11/lib.mjs';

import { esc, faded, CAP_NAME, FONTS, ANNOT_CSS, FIT_SCRIPT, header } from '../gh303-boards-2026-11-11/lib.mjs';

// ---- copy registry (reset per board) ----
// Post-pick: the frame copy was approved 2026-11-16 (Z3 / M3, owner popups recorded on gh#315 / gh#316);
// the 2026-11-18 audit picks are quoted verbatim in each board's header banner (gh#319, canvas first).
export const SRC = {
  new: 'APPROVED 2026-11-16 (owner popup: Z3 / M3) · new on this board',
  g302: 'gh#302 board copy · approved by the owner 2026-11-11 (the gh#302 pick), verbatim',
  g303: 'gh#303 picked board copy · approved by the owner 2026-11-11, verbatim',
  sample: 'sample data · not copy (stands in for what an MC or a player types)',
  ticket: 'gh#299 body / gh#315 / gh#316 · owner wording, verbatim (the game names)',
  pick315: 'gh#315 owner pick 2026-11-18 (PD-315-08) · approved as the pattern at zero, verbatim',
};
export const reg = { REG: new Map(), NAMES: new Set() };
export const resetCopy = () => { reg.REG = new Map(); reg.NAMES = new Set(); };
const KEEP = /(จอใหญ่|เข้าร่วม|ไม่มีรางวัล)/g;
export const th = (text, role, src = 'new') => {
  if (!reg.REG.has(text)) reg.REG.set(text, { role, src });
  const h = esc(text);
  return h.search(KEEP) >= 0 ? `<span>${h.replace(KEEP, '<span style="white-space: nowrap;">$1</span>')}</span>` : h;
};
export const nm = (text) => { reg.NAMES.add(text); return esc(text); };

// Post-pick: the frame copy is approved (Z3 / M3, 2026-11-16); the header banner records the picks.
export const tag = (opt, label, text) => `<div class="tag"><span class="d">${opt} · ${label}</span>${text}<span class="pc">COPY APPROVED</span></div>`;

export function copyRow() {
  const rows = [...reg.REG.entries()].map(([text, { role, src }]) => `<tr><td>${esc(role)}</td><td class="thc">${esc(text)}</td><td>${esc(SRC[src])}</td></tr>`).join('');
  const names = [...reg.NAMES];
  const sample = names.length ? `<tr><td>sample names (${names.length})</td><td class="thc">${names.slice(0, 8).map(esc).join(' · ')} …</td><td>${esc(SRC.sample)}; the gh#302 roster, one name at the 12-cluster limit (${esc(CAP_NAME)}), plus the NAME FIT worst cases</td></tr>` : '';
  return `
  <div class="brow">
    <h2>COPY SOURCES · every Thai string on this board, and where it comes from</h2>
    <p class="why">Strings in a frame: ${reg.REG.size} distinct${names.length ? `, plus ${names.length} distinct sample names` : ''}. New strings were proposed copy and are <b>APPROVED 2026-11-16</b> (owner popups Z3 / M3, recorded on gh#315 / gh#316); the 2026-11-18 audit picks are quoted in the header banner. None of the words gh#299 bars appears (the board's Thai scan checks it, raw and rendered).</p>
    <table class="tbl"><tr><th>role</th><th>string</th><th>source</th></tr>${rows}${sample}</table>
  </div>`;
}

export function rulesRow(queries, items) {
  return `
  <div class="brow">
    <h2>RULES CHECKED · ui-ux-pro-max 2.5.0 (design input, gh#299 owner ruling 2026-11-11)</h2>
    <p class="why">Queried 2026-11-16, one intent per query, rules taken and never its palette or fonts; no --persist, no --design-system. ${queries}</p>
    <div class="pin"><ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul></div>
  </div>`;
}

// The order line, post-pick: gh303's ORDER_LINE still says PROPOSED COPY, which these boards no longer are.
export const ORDER_LINE_PICKED = 'Order (ADR-0033): owner picks, canvas, code. Code takes its design values only from the option picked here and the values ratified as built. Every Thai string inside a frame is approved copy (the 2026-11-16 Z3 / M3 approval) or verbatim from a picked board or the ticket (COPY SOURCES); the wording follows gh#299 (Constraints: Gambling wording). Tags, the hatched stubs and these rows are annotation, not design.';

// The post-pick banner, the format design/Gh305AuditFrames.dc.html set: dark banner, title with the pick date
// and the no-separate-sign-off ruling, the OWNER RULINGS line for this canvas, the context lines, then the
// PICKS DRAWN list quoted verbatim from the ticket's pick comment. `picks` are the comment's own lines.
export function picksBanner(title, rulings, picks, headLines) {
  return `
  <div style="padding: 30px 34px; background: #14142b; color: #ffcc00;">
    <div style="font: 700 26px/1.3 ui-monospace, Menlo, monospace;">${title} · DRAWN TO THE OWNER'S PICKS 2026-11-18 — NO SEPARATE SIGN-OFF (owner ruling)</div>
    <div style="font: 700 20px/1.4 ui-monospace, Menlo, monospace;">OWNER RULINGS 2026-11-18 on this canvas: ${rulings}</div>
    ${headLines.map((l) => `<div style="margin-top: 8px; font: 13px/1.55 ui-monospace, Menlo, monospace; color: #fff6e0;">${l}</div>`).join('\n    ')}
    <div style="margin-top: 8px; font: 13px/1.55 ui-monospace, Menlo, monospace; color: #fff6e0;"><div class="pin q"><b>PICKS DRAWN (quoted from the ticket comments):</b><ul>
${picks.map((p) => `  <li>${esc(p)}</li>`).join('\n')}
</ul></div></div>
  </div>`;
}

export function boardDoc(title, comment, headLines, frameCss, rows, { width = 1520, extraHelmet = '', status = 'AWAITING OWNER', pick = '', rulings = '', picks = [] } = {}) {
  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <style>
    /* Self-hosted faces, relative paths, the same files src/styles/fonts.css declares (Sarabun 400/700, Mitr 500/600/700).
       The board is design source and is never referenced at runtime. */${FONTS}

    /* ${comment} Generated by docs/verification/evidence/gh315-316-boards-2026-11-16/make-boards.mjs;
       edit the generator, not this file. Annotations are English and monospace. Every Thai string in a frame is approved
       copy (COPY SOURCES: the 2026-11-16 Z3 / M3 approval, a picked board verbatim, or the ticket's own wording).
       Frame values are literals (VALUES row: token, gh#302/gh#303 pick, PROPOSAL, or RATIFIED as built 2026-11-18). */${ANNOT_CSS}
${frameCss}${extraHelmet}
  </style>
</helmet>

<div data-pick="${pick}" data-status="${status}" style="width: ${width}px; background: #ffffff; color: #14142b;">
${picksBanner(title, rulings, picks, headLines)}
${rows.join('\n')}
</div>
</x-dc>
${FIT_SCRIPT}
</body>
</html>
`;
}

// The zone palette both games draw from: every colour already in the canvas, each with its source. Gold is reserved
// for the passed state (the gh#302 pick), so no zone or marble identity colour is gold.
export const ZONE_COLORS = [
  ['punch', '#ff3d7f', 'tokens.css --accent-punch; gh#302 B picked (burst sparks)'],
  ['sky', '#2b7bff', 'tokens.css --accent-sky; gh#302 B picked (burst sparks)'],
  ['lilac', '#c9c2ff', 'tokens.css --accent-lilac; gh#303 K1 PICKED (company-party accent)'],
  ['white', '#ffffff', 'tokens.css --ink-light; gh#302 B picked (primary text)'],
  ['soft', '#d9d6f0', 'tokens.css --ink-on-band-soft; gh#302 B picked (secondary text)'],
  ['cream', '#fff6e0', 'tokens.css --color-ground-warm; canvas D ground (HomeShelfDesktop, gh#246 pick)'],
];
export const ZC = Object.fromEntries(ZONE_COLORS.map(([k, v]) => [k, v]));
// A zone panel's ground: its colour at 14% over the night ground's midpoint, pre-composited (the grammar admits no
// opacity). Measured 2026-11-16: white header text on every tint clears 10.7:1; the zone colour itself as text on its
// own tint fails for punch (4.19) and sky (3.60), so headers are white with a zone dot, never zone-coloured text.
export const tint = (k) => faded(ZC[k], 0.14);

// A fade pre-composited over an arbitrary base (the gh#303 faded() composites over the night ground's midpoint;
// paints that sit on the race track composite over the track's own ground instead).
export const fadedOver = (c, o, base) => {
  if (o === 1) return c;
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [f, g] = [p(c), p(base)];
  return '#' + f.map((x, i) => Math.round(x * o + g[i] * (1 - o)).toString(16).padStart(2, '0')).join('');
};
