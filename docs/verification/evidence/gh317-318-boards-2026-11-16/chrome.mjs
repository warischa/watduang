// The board chrome. lib.mjs (gh#303, read-only) stamps PICKED / COPY APPROVED and hardcodes the gh#303 generator
// path and the 2026-11-11 approval; this module owns these boards' own chrome (SRC, tag, copyRow, rulesRow,
// boardDoc). Every helper that does not change (header, ORDER_LINE, the tables, nameFitRow, notesRow, FONTS,
// ANNOT_CSS, FIT_SCRIPT, the copy registry) is imported read-only from lib.mjs. Post-pick (2026-11-18, gh#319):
// the frame copy is APPROVED (E1 / C1, owner popups 2026-11-16), the header is the Gh305AuditFrames picks banner
// (picksBanner), and the 2026-11-18 audit picks are stamped in the rows and drawn in the new frames.
import { header, ORDER_LINE, valuesTable, contrastTable, beatTable, nameFitRow, notesRow, FONTS, ANNOT_CSS, FIT_SCRIPT, reg, esc, CAP_NAME } from '../gh303-boards-2026-11-11/lib.mjs';

export { header, ORDER_LINE, valuesTable, contrastTable, beatTable, nameFitRow, notesRow, FONTS, ANNOT_CSS, FIT_SCRIPT };

// Where each Thai string on these boards comes from. 'new' was proposed on this board and approved 2026-11-16.
export const SRC = {
  new: 'APPROVED 2026-11-16 (owner popup: E1 / C1) · new on this board',
  g302: 'gh#302 picked board copy (B NIGHT STAGE, approved 2026-11-11) · verbatim',
  g303: 'gh#303 picked board copy (approved 2026-11-11; L2 no-prize ruling, the final label) · verbatim',
  sample: 'sample data · not copy (stands in for what an MC or a player types)',
  ticket: 'gh#299 / gh#317 / gh#318 body · owner wording, verbatim (the game names)',
  demo: 'src/play/_prize-reveal/demo.ts COPY · owner-approved 2026-11-13, verbatim (the demo bar)',
};

// An option tag, post-pick: the frame copy is approved (E1 / C1, 2026-11-16); the banner records the picks.
export const tag = (opt, label, text) => `<div class="tag"><span class="d">${opt} · ${label}</span>${text}<span class="pc">COPY APPROVED</span></div>`;
export const sharedTag = (label, text) => `<div class="tag"><span class="d">${label}</span>${text}<span class="pc">COPY APPROVED</span></div>`;

// The order line, post-pick: gh303's ORDER_LINE still says PROPOSED COPY, which these boards no longer are.
export const ORDER_LINE_PICKED = 'Order (ADR-0033): owner picks, canvas, code. Code takes its design values only from the option picked here and the values ratified as built. Every Thai string inside a frame is approved copy (the 2026-11-16 E1 / C1 approval) or verbatim from a picked board, the ticket or the shipped demo copy (COPY SOURCES); the wording follows gh#299 (Constraints: Gambling wording). Tags, the hatched stubs and these rows are annotation, not design.';

export function copyRow() {
  const rows = [...reg.REG.entries()].map(([text, { role, src }]) => `<tr><td>${esc(role)}</td><td class="thc">${esc(text)}</td><td>${esc(SRC[src] ?? src)}</td></tr>`).join('');
  const names = [...reg.NAMES];
  const sample = names.length ? `<tr><td>sample names (${names.length})</td><td class="thc">${names.slice(0, 8).map(esc).join(' · ')} …</td><td>${esc(SRC.sample)}; the gh#302 roster, one name at the 12-cluster limit (${esc(CAP_NAME)}), plus the NAME FIT worst cases</td></tr>` : '';
  return `
  <div class="brow">
    <h2>COPY SOURCES · every Thai string on this board, and where it comes from</h2>
    <p class="why">Strings in a frame: ${reg.REG.size} distinct${names.length ? `, plus ${names.length} distinct sample names` : ''}. New strings were proposed copy and are <b>APPROVED 2026-11-16</b> (owner popups E1 / C1, recorded on gh#317 / gh#318); the gh#302 / gh#303 picked copy and the shipped demo copy are reused verbatim and marked. The 2026-11-18 audit picks are quoted in the header banner. None of the words gh#299 bars appears (the board's Thai scan checks it, raw and rendered).</p>
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

    /* ${comment} Generated by docs/verification/evidence/gh317-318-boards-2026-11-16/make-boards.mjs;
       edit the generator, not this file. Annotations are English and monospace. Every Thai string in a frame is approved
       copy (COPY SOURCES: the 2026-11-16 E1 / C1 approval, a picked board verbatim, the ticket's own wording, or the
       shipped demo copy). Frame values are literals (VALUES row: token, gh#302 / gh#303 pick, PROPOSAL, or RATIFIED
       as built 2026-11-18). The libs are imported read-only from gh303 at commit 1f57574. */${ANNOT_CSS}
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
