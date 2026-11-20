// gh#325 canvas kit for the seven letter and word games of the prize draw. FROZEN for sibling builders: a board
// adds board-<x>.mjs and never edits this file (README "Kit API"). The orchestrator edits only PICKS below, after
// the owner picks on the pilot board; every board then regenerates with the picked shared values.
//
// What is imported read-only (never written): ../gh303-boards-2026-11-11/lib.mjs (copy registry th/nm, NAME FIT
// script, seeded PRNG, colour maths, the 200-name gh#302 roster and its NAME FIT worst cases, board annotation CSS
// and tables) and ../gh303-boards-2026-11-11/grammar.mjs (through render-boards.mjs). Source commit and the fork
// ruling: README. The projector chrome below is COPIED from gh303 stage.mjs and renamed (no class or selector here
// carries a word CONTEXT.md bars for the company-party category), values unchanged (gh#302 B NIGHT STAGE, picked).
import { th, nm, fit, esc, rng, shuffle, faded, ratio, FONTS, ANNOT_CSS, FIT_SCRIPT, contrastTable, valuesTable, beatTable, nameFitRow, notesRow,
  reg, resetCopy, ROSTER, ME, CAP_NAME, WIDE_LATIN, WIDE_THAI, WIDE_AM, EVENT } from '../gh303-boards-2026-11-11/lib.mjs';

export { th, nm, fit, esc, rng, shuffle, faded, ratio, contrastTable, valuesTable, beatTable, nameFitRow, notesRow, resetCopy, ME, CAP_NAME, WIDE_LATIN, WIDE_THAI, WIDE_AM, EVENT };

// ---------------------------------------------------------------------------------------------
// SHARED OPTIONS (kit parameters). Each decision is drawn ONCE, on the pilot board (Gh326PickRule); every other
// board draws KIT_VALUE(decision), the picked option or, pre-pick, the default A, and says so in its header.
// ---------------------------------------------------------------------------------------------
export const PICKS = { D1: '', D3: '' }; // '' = awaiting the owner; 'A' or 'B' once picked (orchestrator edit)
export const OPTIONS = {
  // D1: the glyph floor on the densest projector screen (admin mode, 200 heads, a word beside every name).
  D1: {
    A: { label: 'ONE SCREEN AT 14PX', floor: 14, nameMax: 16, cols: 6, perPage: 200, rowMin: 23, gapX: 10 },
    B: { label: 'TWO SCREENS AT 20PX', floor: 20, nameMax: 22, cols: 4, perPage: 100, rowMin: 33, gapX: 16 },
  },
  // D3: how the 14-digit round code (ADR-0080 decision 2) is grouped on the projector and in the phone field.
  D3: {
    A: { label: '4-4-4-2', groups: [4, 4, 4, 2] },
    B: { label: '5-5-4', groups: [5, 5, 4] },
  },
};
export const KIT_OPT = (d) => PICKS[d] || 'A';
export const KIT_VALUE = (d) => OPTIONS[d][KIT_OPT(d)];
export const pickNote = (d) => (PICKS[d] ? `${d} PICKED ${PICKS[d]} (${OPTIONS[d][PICKS[d]].label})` : `${d} awaiting the owner on Gh326PickRule; drawn with the default A (${OPTIONS[d].A.label})`);

// The widest of the 923 bank words at 50f74b7 (481 Thai, 442 English), measured 2026-11-20 in the self-hosted
// Mitr 600 face in headless Chrome: 7.29 em. The word column on the dense screen holds it at the floor.
export const WIDEST_WORD = { text: 'เครื่องปรับอากาศ', em: 7.29 };
export const wordCol = (floor) => Math.ceil(WIDEST_WORD.em * floor * 1.02) + 4;

// ---------------------------------------------------------------------------------------------
// THE EVENT: the gh#302 roster at the setup cap (MAX_HEADS = 200 in src/prize-event/event.ts, read 2026-11-20),
// three names replaced by the NAME FIT worst cases exactly as gh303 lib.mjs builds its fixture, played as a
// HALF-CUT word round (ADR-0080 decision 1: live = 2 x keep). Group 0 holds the lowest `keep` fate values.
// ---------------------------------------------------------------------------------------------
export const MAX_HEADS = 200;
export const ROSTER_200 = (() => {
  const slots = ROSTER.map((n, i) => i).filter((i) => ROSTER[i] !== ME && ROSTER[i] !== CAP_NAME).slice(5, 8);
  return ROSTER.map((n, i) => (i === slots[0] ? WIDE_LATIN : i === slots[1] ? WIDE_THAI : i === slots[2] ? WIDE_AM : n));
})();
export function assertHalfCut(ev) {
  const bad = (m) => { throw new Error(`word round: ${m}`); };
  if (ev.live > MAX_HEADS) bad(`${ev.live} heads, more than MAX_HEADS ${MAX_HEADS}`);
  if (ev.live !== 2 * ev.keep) bad(`not a half-cut: live ${ev.live}, keep ${ev.keep} (ADR-0080 needs live = 2 x keep)`);
  if (ev.names.length !== ev.live || new Set(ev.names).size !== ev.live) bad(`the field is not ${ev.live} unique names`);
  const g0 = ev.names.filter((n) => ev.group.get(n) === 0).length;
  if (g0 !== ev.keep || ev.names.length - g0 !== ev.keep) bad(`group 0 holds ${g0}, not keep ${ev.keep}`);
}
export const WORD_ROUND = (() => {
  const names = ROSTER_200.slice();
  const order = shuffle(names, rng(325));
  const group = new Map(order.map((n, i) => [n, i < names.length / 2 ? 0 : 1]));
  // the worst cases and the reader sit in group 0, so the judged frames show them passing (the gold paint)
  for (const n of [WIDE_LATIN, WIDE_THAI, WIDE_AM, ME]) { const swap = order.find((x) => group.get(x) === 0 && ![WIDE_LATIN, WIDE_THAI, WIDE_AM, ME].includes(x)); if (group.get(n) === 1) { group.set(n, 0); group.set(swap, 1); } }
  return { round: 1, rounds: 4, live: names.length, keep: names.length / 2, names, group };
})();
assertHalfCut(WORD_ROUND);

// ---------------------------------------------------------------------------------------------
// THE 14-DIGIT ROUND CODE (ADR-0080 decision 2): seed 5, cut 3, bank revision 1, kind 2, pool 1, format 1, Damm 1.
// The Damm table and the check rule (taken over the round number followed by the payload) are copied from
// src/prize-draw/round-code.ts (dammCheck) and src/prize-round/round.ts (familyCode); nothing is imported from src.
// ---------------------------------------------------------------------------------------------
const DAMM = [[0, 3, 1, 7, 5, 9, 8, 6, 4, 2], [7, 0, 9, 2, 1, 5, 4, 8, 6, 3], [4, 2, 0, 6, 8, 7, 1, 3, 5, 9], [1, 7, 5, 0, 9, 8, 3, 4, 2, 6],
  [6, 1, 2, 3, 0, 4, 5, 9, 7, 8], [3, 6, 7, 4, 2, 0, 9, 5, 8, 1], [5, 8, 6, 9, 7, 2, 0, 1, 3, 4], [8, 9, 4, 5, 3, 6, 2, 0, 1, 7],
  [9, 4, 3, 8, 6, 1, 7, 2, 0, 5], [2, 5, 8, 1, 4, 3, 6, 7, 9, 0]];
export const damm = (digits) => { let k = 0; for (const c of digits) k = DAMM[k][c.charCodeAt(0) - 48]; return k; };
export const POOL_ORDER = ['general', 'office', 'food', 'animal'];
export function wordCode(round, { seed, cut, revision, kind, pool, format = 0 }) {
  const payload = seed + String(cut).padStart(3, '0') + String(revision) + String(kind).padStart(2, '0') + String(POOL_ORDER.indexOf(pool)) + String(format);
  const code = payload + damm(String(round) + payload);
  assertCode(code, round);
  return code;
}
export function assertCode(code, round) {
  if (!/^\d{14}$/.test(code)) throw new Error(`round code: ${code.length} digits, not 14`);
  if (damm(String(round) + code) !== 0) throw new Error(`round code: ${code} fails its Damm check for round ${round}`);
}
export const grouped = (code, groups) => { const out = []; let i = 0; for (const g of groups) { out.push(code.slice(i, i + g)); i += g; } if (i !== code.length) throw new Error(`grouping ${groups.join('-')} does not cover ${code.length} digits`); return out.join(' '); };

// ---------------------------------------------------------------------------------------------
// COPY SOURCES (pre-pick: this board's new strings are PROPOSED, never approved).
// ---------------------------------------------------------------------------------------------
export const SRC = {
  new: 'PROPOSED on this board · awaiting the owner',
  g302: 'gh#302 picked board copy (B NIGHT STAGE, approved 2026-11-11) · verbatim',
  sample: 'sample data · not copy (stands in for what an MC or a player types)',
  ticket: 'gh#311 / gh#326 body · owner wording, verbatim (the game name)',
  word: 'word bank sample: src/prize-words at commit 50f74b7, review pending (gh#321) · data, not copy',
  cond: 'src/prize-round/conditions.ts conditionWording, PROVISIONAL (gh#322; final wording is this canvas) · its template, verbatim',
  join: 'src/prize-join/reveal.ts live phone copy (the card round rule tap) · verbatim',
};
export function copyRow() {
  const rows = [...reg.REG.entries()].map(([text, { role, src }]) => `<tr><td>${esc(role)}</td><td class="thc">${esc(text)}</td><td>${esc(SRC[src] ?? src)}</td></tr>`).join('');
  const names = [...reg.NAMES];
  const sample = names.length ? `<tr><td>sample names (${names.length})</td><td class="thc">${names.slice(0, 8).map(esc).join(' · ')} …</td><td>${esc(SRC.sample)}; the gh#302 roster at 200, one name at the 12-cluster limit (${esc(CAP_NAME)}), plus the NAME FIT worst cases</td></tr>` : '';
  return `
  <div class="brow">
    <h2>COPY SOURCES · every Thai string on this board, and where it comes from</h2>
    <p class="why">Strings in a frame: ${reg.REG.size} distinct${names.length ? `, plus ${names.length} distinct sample names` : ''}. Strings marked PROPOSED are new on this board and await the owner; picked gh#302 copy, the live phone copy and the provisional condition template are reused verbatim and marked. Bank words are data, not copy. None of the words gh#299 bars appears (the Thai scan checks the raw file and the rendered text).</p>
    <table class="tbl"><tr><th>role</th><th>string</th><th>source</th></tr>${rows}${sample}</table>
  </div>`;
}

// ---------------------------------------------------------------------------------------------
// BOARD CHROME (annotation; its colours are not design values)
// ---------------------------------------------------------------------------------------------
export const BOARD_WIDTH = 1990; // frames are 1920px at scale 1; render-boards.mjs loads the page at 2000px
export const ORDER_LINE = 'Order (ADR-0033): owner picks, canvas, code. Code takes its design values only from the option picked here. Every Thai string inside a frame is PROPOSED COPY unless COPY SOURCES marks it verbatim; the wording follows the gh#299 wording constraint and CONTEXT.md (company-party category, _Avoid_). Tags, hatched stubs and these rows are annotation, not design.';
export const header = (title, lines) => `
  <div style="padding: 30px 34px; background: #14142b; color: #ffcc00;">
    <div style="font: 700 26px/1.3 ui-monospace, Menlo, monospace;">${title} · proposal board · AWAITING OWNER</div>
    ${lines.map((l) => `<div style="margin-top: 8px; font: 13px/1.55 ui-monospace, Menlo, monospace; color: #fff6e0;">${l}</div>`).join('\n    ')}
  </div>`;
export const tag = (opt, label, text) => `<div class="tag"><span class="d">${opt} · ${label}</span>${text}<span class="pc">PROPOSED</span></div>`;
export const sec = (title, why, inner) => `
  <div class="brow">
    <h2>${title}</h2>
    <p class="why">${why}</p>
    ${inner}
  </div>`;
export const cand = (tagHtml, frameHtml) => `<div class="cand">${tagHtml}${frameHtml}</div>`;
export const cands = (items, col = false) => `<div class="cands${col ? ' col' : ''}">${items.join('')}</div>`;
export function decisionsRow(rows) {
  return `
  <div class="brow">
    <h2>DECISIONS FOR THE OWNER · one pick per row</h2>
    <p class="why">Shared rows (kit parameters) regenerate all seven boards when picked; pilot rows bind gh#326 only. Already ruled, not re-asked: 3D on the main screen (gh#299 decision 11), the never-blank 2D fallback (ADR-0051), half-cut word rounds and the 14-digit code (ADR-0080), picks changeable until the MC closes picking (gh#311, owner ruling 2026-11-19).</p>
    <table class="tbl"><tr><th>decision</th><th>scope</th><th>A</th><th>B</th><th>status</th></tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>
  </div>`;
}

// One table of role rows per board, every option's frames held to it (data-values-dir="AB", pre-pick).
export function rolesRow(rows) {
  return `
  <div class="brow">
    <h2>VALUES BY ROLE · every option's values, enforced by the render (the gh#302 / gh#303 mechanism)</h2>
    <p class="why">The board AWAITS the owner, so EVERY option's frames (A, B and the shared F) are held to these rows. Every element of a checked frame, and its ::before and ::after, renders each property only as the ONE row that owns that property for it: a property no row owns fails, a property two rows claim fails, a value its row does not list fails. The kit rows are shared by all seven boards; a board appends its own.</p>
    <table class="tbl" data-values-dir="AB"><tr><th>role</th><th>elements (selector)</th><th>the only values they may render</th><th>source</th></tr>${rows.map(([role, sel, tok, src]) => `<tr data-sel="${esc(sel)}" data-v="${esc(tok.join('|'))}"><td>${esc(role)}</td><td>${esc(sel)}</td><td>${tok.map(esc).join('<br>')}</td><td>${esc(src)}</td></tr>`).join('')}</table>
  </div>`;
}

export function boardDoc(name, comment, headLines, frameCss, rows) {
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

    /* ${comment} Generated by docs/verification/evidence/gh325-boards-2026-11-20/make-boards.mjs from board-*.mjs and kit.mjs;
       edit the generator, not this file. Annotations are English and monospace. Every Thai string in a frame is PROPOSED copy
       unless COPY SOURCES marks it verbatim. Frame values are literals (VALUES rows: token, gh#302 pick, or PROPOSAL). */${ANNOT_CSS}
${KIT_CSS}
${frameCss}
  </style>
</helmet>

<div data-pick="" data-status="AWAITING OWNER" style="width: ${BOARD_WIDTH}px; background: #ffffff; color: #14142b;">
${header(name, headLines)}
${rows.join('\n')}
</div>
</x-dc>
${FIT_SCRIPT}
</body>
</html>
`;
}

// ---------------------------------------------------------------------------------------------
// FRAMES. Projector frames are 1920x1080 CSS px at scale 1 (no transform): 2D stills of the 3D intent
// (gh#299 decision 11), plus the ADR-0051 never-blank 2D frame. Phone frames are real pixels at 320px.
// ---------------------------------------------------------------------------------------------
export const stage = (id, dir, inner, cls = '') => `<div class="pj${cls ? ' ' + cls : ''}" data-frame="${id}" data-dir="${dir}">${inner}</div>`;
export const phone = (id, dir, inner) => `<div class="pr" data-frame="${id}" data-dir="${dir}">${inner}</div>`;

export function topBar(round, rounds = 4) {
  const label = th(`รอบที่ ${round} จาก ${rounds}`, 'projector: round label', 'g302');
  const dots = Array.from({ length: rounds }, (_, i) => `<i class="${i + 1 < round ? 'done' : i + 1 === round ? 'on' : ''}"></i>`).join('');
  return `<div class="top"><span class="ev">${th(EVENT, 'event name (typed by the MC)', 'sample')}</span><span class="dots"><span class="rl">${label}</span>${dots}<i class="fin"></i></span></div>`;
}
export const hud = (gameName, line) => `<div class="hud"><div class="gname">${gameName}</div>${line ? `<div class="lk">${line}</div>` : ''}</div>`;
export const lowBand = (left, mid, right, cls = '') => `<div class="low${cls ? ' ' + cls : ''}"><div>${left}</div>${mid}<div class="rt">${right}</div></div>`;
export const count = (n, unit, cls = '') => `<div class="flow${cls ? ' ' + cls : ''}"><span class="to">${n}</span><small>${unit}</small></div>`;
// The ground the 3D intent stands on (a receding stage floor, drawn); the never-blank 2D frame omits it.
export const floorLayer = () => {
  const lines = []; for (let i = 0; i <= 12; i++) { const x = 160 * i; lines.push(`<line x1="${960 + (x - 960) * 0.55}" y1="560" x2="${x}" y2="1080" stroke="#2e2b63" stroke-width="2"/>`); }
  for (const y of [600, 660, 740, 850, 990]) lines.push(`<line x1="0" y1="${y}" x2="1920" y2="${y}" stroke="#2e2b63" stroke-width="2"/>`);
  return `<svg class="layer floor" width="1920" height="1080" viewBox="0 0 1920 1080" aria-hidden="true">${lines.join('')}</svg>`;
};

// The dense field: one cell per name, the word beside the name. cells = [[name, word, state]], state in
// '', 'in', 'out', 'turn'. The word renders at the option's glyph floor (.wd, judged by data-min); the name is
// NAME FIT between the floor and nameMax. data-expect is written only when every cell is judged.
export function denseField(cells, opt, { page = 1 } = {}) {
  const o = OPTIONS.D1[opt];
  const shown = cells.slice((page - 1) * o.perPage, page * o.perPage);
  const judged = shown.every(([, , s]) => s === 'in' || s === 'out');
  const ex = judged ? ` data-expect="${shown.length}/${shown.filter(([, , s]) => s === 'in').length}"` : '';
  const style = `grid-template-columns: repeat(${o.cols}, minmax(0, 1fr)); grid-auto-rows: minmax(${o.rowMin}px, auto); column-gap: ${o.gapX}px;`;
  return `<div class="dense" style="${style}"${ex}>${shown.map(([n, w, s]) => `<div class="wc${s ? ' ' + s : ''}"><span class="wd" data-min="${o.floor}" style="width: ${wordCol(o.floor)}px; font-size: ${o.floor}px;">${esc(w)}</span><span class="${fit(o.floor, o.nameMax)}">${nm(n)}</span></div>`).join('')}</div>`;
}

// The 14-digit round code card (QR mode), over a veil.
export function codeCard(code, round, groups, label, instruction) {
  assertCode(code, round);
  return `<div class="veil"></div><div class="codebox"><div class="ck">${label}</div><div class="digits code14 r${round}">${grouped(code, groups)}</div><div class="ci">${instruction}</div></div>`;
}
// The same code in the phone's entry field.
export const codeField = (code, round, groups) => { assertCode(code, round); return `<div class="pfield"><span class="pdig code14 r${round}">${grouped(code, groups)}</span></div>`; };

// The rule card: the drawn condition and the drawn polarity.
export const ruleCard = (heading, condition, polarity) => `<div class="veil"></div><div class="rc"><div class="rh">${heading}</div><div class="rv">${condition}</div><div class="rp"><span class="pol">${polarity}</span></div></div>`;

// Phone pieces (real pixels).
export const phoneHead = (title, msg, ev = th(EVENT, 'event name (typed by the MC)', 'sample')) => `<p class="ev">${ev}</p><h2>${title}</h2>${msg ? `<p class="msg">${msg}</p>` : ''}`;
export const hand = (words, on = -1) => `<div class="hand">${words.map((w, i) => `<div class="hw${i === on ? ' on' : ''}">${esc(w)}</div>`).join('')}</div>`;
export const tiles = (letters) => `<div class="tiles">${letters.map((l) => `<div class="lt">${esc(l)}</div>`).join('')}</div>`;
// The rule tap (round.ts RuleTap): which of the two candidates the main screen drew, and the polarity it showed.
export const ruleTap = (headRule, labels, on, headPol, polarities, pon) => `<p class="msg">${headRule}</p><div class="opts">${labels.map((l, i) => `<div class="opt tap${i === on ? ' on' : ''}">${l}</div>`).join('')}</div><p class="msg">${headPol}</p><div class="pols">${polarities.map((p, i) => `<div class="opt tap${i === pon ? ' on' : ''}">${p}</div>`).join('')}</div>`;
export const goButton = (label) => `<div class="go tap">${label}</div>`;
export const verdict = (word, cls, line) => `<div class="big${cls ? ' ' + cls : ''}">${word}</div><p class="msg">${line}</p>`;

// Mini-event pieces (projector and phone).
export const poolTiles = (words, state = () => '') => `<div class="pool">${words.map((w, i) => `<div class="pt${state(i) ? ' ' + state(i) : ''}"><span class="pw">${esc(w)}</span></div>`).join('')}</div>`;
export const poolButtons = (words, on) => `<div class="pbtns">${words.map((w, i) => `<div class="pb tap${i === on ? ' on' : ''}"><span class="${fit(16, 20)}">${esc(w)}</span></div>`).join('')}</div>`;
export const timer = (t) => `<span class="timer">${t}</span>`;
export const winners = (names) => `<div class="wins">${names.map((n) => `<div class="win"><span class="${fit(40, 64)}">${nm(n)}</span></div>`).join('')}</div>`;

// ---------------------------------------------------------------------------------------------
// KIT CSS. Projector values are the gh#302 B picked night stage (tokens.css + gh#302 picks), copied from gh303
// stage.mjs and renamed; every new size is a PROPOSAL listed in KIT_VALUES.
// ---------------------------------------------------------------------------------------------
export const KIT_CSS = `
    /* ---- projector frames: 1920x1080 CSS px at scale 1 (no transform). gh#302 B values (picked). ---- */
    .pj { position: relative; width: 1920px; height: 1080px; overflow: hidden; box-sizing: border-box; font-family: 'Sarabun', sans-serif;
          background: linear-gradient(180deg, #14142b 0%, #23214d 100%); color: #ffffff; }
    .pj .layer { position: absolute; top: 0px; left: 0px; pointer-events: none; z-index: 0; }
    .pj .top { position: absolute; left: 0; right: 0; top: 0; height: 96px; display: flex; align-items: center; justify-content: space-between; padding: 0 56px; z-index: 3; }
    .pj .ev { font: 600 36px/1.2 'Mitr', sans-serif; color: #d9d6f0; }
    .pj .dots { display: flex; align-items: center; gap: 14px; font: 600 30px/1 'Mitr', sans-serif; }
    .pj .dots .rl { margin-right: 14px; color: #ffffff; }
    .pj .dots i { box-sizing: border-box; width: 22px; height: 22px; border-radius: 50%; border: 3px solid #d9d6f0; }
    .pj .dots i.done { background: #d9d6f0; }
    .pj .dots i.on { background: #ffcc00; border-color: #ffcc00; box-shadow: 0 0 18px rgba(255,204,0,0.45); }
    .pj .dots i.fin { width: 36px; border-radius: 999px; }
    .pj .hud { position: absolute; left: 56px; right: 56px; top: 110px; text-align: center; z-index: 3; }
    .pj .hud .lk { margin-top: 6px; }
    .pj .gname { font: 700 50px/1.2 'Mitr', sans-serif; color: #ffcc00; }
    .pj .lk { font: 600 30px/1.35 'Mitr', sans-serif; color: #d9d6f0; }
    .pj .low { position: absolute; left: 56px; right: 56px; bottom: 20px; height: 190px; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 40px; z-index: 3; }
    .pj .low.slim { bottom: 8px; height: 84px; }
    .pj .low.slim .gname { font-size: 44px; }
    .pj .rt { text-align: right; }
    .pj .flow { display: flex; align-items: center; gap: 28px; font: 700 130px/1 'Mitr', sans-serif; }
    .pj .low.slim .flow { font-size: 60px; gap: 14px; }
    .pj .flow .to { color: #ffcc00; text-shadow: 0 0 24px rgba(255,204,0,0.45); }
    .pj .flow small { font: 600 44px/1 'Mitr', sans-serif; color: #d9d6f0; }
    .pj .flow.sm { font-size: 80px; gap: 18px; }
    .pj .flow.sm small { font-size: 36px; }
    .pj .low.slim .flow small { font-size: 30px; }
    .pj .low.slim .rt { display: flex; justify-content: flex-end; align-items: center; gap: 20px; }
    .pj .low.slim .legend { flex-direction: row; }
    .pj .legend { display: flex; flex-direction: column; align-items: flex-end; gap: 12px; }
    .pj .legend .wc { width: 170px; height: 48px; justify-content: center; }
    .pj .legend .wc .lg { font: 700 30px/1 'Sarabun', sans-serif; }
    .pj .veil { position: absolute; top: 0px; right: 0px; bottom: 0px; left: 0px; background: rgba(20,20,43,0.78); z-index: 2; }
    /* ---- the dense field (D1): 200 cells, a word beside each name ---- */
    .pj .dense { position: absolute; left: 56px; right: 56px; top: 100px; height: 880px; display: grid; row-gap: 2px; align-content: center; z-index: 1; }
    .pj .wc { display: flex; align-items: center; gap: 6px; box-sizing: border-box; padding: 0 10px 0 6px; border-radius: 999px; background: #23214d; }
    .pj .wc .wd { flex: none; box-sizing: border-box; text-align: center; font-family: 'Mitr', sans-serif; font-weight: 600; line-height: 1; color: #ffcc00; white-space: nowrap; overflow-x: clip; overflow-y: visible; }
    .pj .wc .fit { flex: 1 1 auto; min-width: 0; text-align: left; font-family: 'Sarabun', sans-serif; font-weight: 400; line-height: 1; color: #ffffff; white-space: nowrap; overflow-x: clip; overflow-y: visible; }
    .pj .wc.in { background: #ffcc00; box-shadow: 0 0 16px rgba(255,204,0,0.45); }
    .pj .wc.in .wd, .pj .wc.in .fit, .pj .wc.in .lg { color: #14142b; }
    .pj .wc.in .fit { font-weight: 700; }
    .pj .wc.out { background: transparent; box-shadow: inset 0 0 0 2px #23214d; }
    .pj .wc.out .wd, .pj .wc.out .fit, .pj .wc.out .lg { color: #9a97c0; text-decoration: line-through; }
    .pj .wc.turn { box-shadow: inset 0 0 0 3px #ffcc00; }
    /* ---- the round code (ADR-0080 decision 2, 14 digits) over a veil ---- */
    .pj .codebox { position: absolute; left: 210px; top: 250px; width: 1500px; box-sizing: border-box; background: #23214d; border: 3px solid #ffcc00; border-radius: 24px; padding: 48px 56px; text-align: center; box-shadow: 0 0 60px rgba(255,204,0,0.45); z-index: 3; }
    .pj .codebox .ck { font: 600 44px/1.25 'Mitr', sans-serif; color: #d9d6f0; }
    .pj .codebox .digits { margin: 18px 0; font: 700 112px/1.1 'Mitr', sans-serif; color: #ffcc00; letter-spacing: 6px; word-spacing: 0.15em; white-space: nowrap; overflow-x: clip; overflow-y: visible; }
    .pj .codebox .ci { font: 400 34px/1.45 'Sarabun', sans-serif; color: #ffffff; }
    /* ---- the rule card (condition + polarity) ---- */
    .pj .rc { position: absolute; left: 360px; top: 230px; width: 1200px; box-sizing: border-box; padding: 44px 56px; background: #ffffff; border-radius: 32px; text-align: center; box-shadow: 0 0 60px rgba(255,204,0,0.45); z-index: 3; }
    .pj .rc .rh { font: 600 40px/1.25 'Mitr', sans-serif; color: #3d3b5c; }
    .pj .rc .rv { margin-top: 18px; font: 700 96px/1.35 'Mitr', sans-serif; color: #14142b; white-space: nowrap; overflow-x: clip; overflow-y: visible; }
    .pj .rc .rp { display: flex; justify-content: center; margin-top: 22px; }
    .pj .rc .pol { display: inline-flex; align-items: center; padding: 6px 36px; border-radius: 999px; background: #14142b; color: #ffcc00; font: 700 52px/1.3 'Mitr', sans-serif; }
    /* ---- mini-event: the shared pool, the pick timer, the winners ---- */
    .pj .pool { position: absolute; left: 160px; right: 160px; top: 290px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 22px 28px; z-index: 1; }
    .pj .pt { box-sizing: border-box; height: 104px; display: flex; align-items: center; justify-content: center; padding: 0 16px; border-radius: 24px; background: #23214d; }
    .pj .pt .pw { font: 600 44px/1.3 'Mitr', sans-serif; color: #ffffff; white-space: nowrap; overflow-x: clip; overflow-y: visible; }
    .pj .pt.in { background: #ffcc00; box-shadow: 0 0 16px rgba(255,204,0,0.45); }
    .pj .pt.in .pw { color: #14142b; }
    .pj .pt.out { background: transparent; box-shadow: inset 0 0 0 2px #23214d; }
    .pj .pt.out .pw { color: #9a97c0; text-decoration: line-through; }
    .pj .timer { font: 700 130px/1.2 'Mitr', sans-serif; color: #ffcc00; text-shadow: 0 0 24px rgba(255,204,0,0.45); }
    .pj .wins { position: absolute; left: 160px; right: 160px; top: 330px; display: flex; flex-direction: column; align-items: center; gap: 24px; z-index: 3; }
    .pj .win { box-sizing: border-box; width: 1100px; min-height: 120px; display: flex; align-items: center; justify-content: center; padding: 8px 40px; border-radius: 24px; background: #23214d; box-shadow: inset 0 0 0 3px #ffcc00; }
    .pj .win .fit { flex: 1 1 auto; min-width: 0; text-align: center; font: 700 64px/1.2 'Mitr', sans-serif; color: #ffcc00; white-space: nowrap; overflow-x: clip; overflow-y: visible; }
    /* ---- phone frames: real pixels at 320px, judged at the 16px mobile minimum. The 1px edge is annotation. ---- */
    .pr { position: relative; box-sizing: border-box; width: 320px; min-height: 600px; padding: 16px; background: linear-gradient(180deg, #14142b 0%, #23214d 100%); color: #ffffff; font-family: 'Sarabun', sans-serif; box-shadow: 0 0 0 1px #14142b; }
    .pr .ev { margin: 0; font: 600 18px/1.3 'Mitr', sans-serif; color: #d9d6f0; }
    .pr h2 { margin: 12px 0 0; font: 600 24px/1.3 'Mitr', sans-serif; color: #ffffff; }
    .pr .msg { margin: 12px 0 0; font: 400 16px/1.55 'Sarabun', sans-serif; color: #d9d6f0; }
    .pr .hand { display: flex; flex-direction: column; gap: 10px; margin-top: 16px; }
    .pr .hw { box-sizing: border-box; min-height: 64px; display: flex; align-items: center; justify-content: center; padding: 8px 16px; border-radius: 16px; background: #23214d; font: 600 28px/1.3 'Mitr', sans-serif; color: #ffffff; }
    .pr .hw.on { background: #ffcc00; color: #14142b; box-shadow: 0 0 16px rgba(255,204,0,0.45); }
    .pr .tiles { display: flex; justify-content: center; gap: 12px; margin-top: 16px; }
    .pr .lt { box-sizing: border-box; width: 120px; height: 140px; display: flex; align-items: center; justify-content: center; border-radius: 16px; background: #23214d; box-shadow: inset 0 0 0 3px #ffcc00; font: 700 80px/1.3 'Mitr', sans-serif; color: #ffcc00; }
    .pr .opts, .pr .pols { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
    .pr .pols { flex-direction: row; }
    .pr .opt { box-sizing: border-box; min-block-size: 52px; flex: 1 1 0px; display: flex; align-items: center; justify-content: center; padding: 6px 12px; border-radius: 16px; box-shadow: inset 0 0 0 2px #d9d6f0; font: 600 18px/1.35 'Mitr', sans-serif; color: #ffffff; text-align: center; }
    .pr .opt.on { background: #ffffff; color: #14142b; }
    .pr .go { box-sizing: border-box; min-block-size: 52px; margin-top: 18px; display: flex; align-items: center; justify-content: center; border-radius: 999px; background: #ffcc00; color: #14142b; font: 600 22px/1.35 'Mitr', sans-serif; }
    .pr .big { margin-top: 28px; text-align: center; font: 700 64px/1.3 'Mitr', sans-serif; color: #ffcc00; text-shadow: 0 0 24px rgba(255,204,0,0.45); }
    .pr .big.out { color: #9a97c0; text-shadow: none; }
    .pr .pfield { box-sizing: border-box; margin-top: 16px; min-block-size: 64px; display: flex; align-items: center; justify-content: center; border-radius: 16px; background: #23214d; box-shadow: inset 0 0 0 2px #ffcc00; }
    .pr .pdig { font: 700 24px/1.3 'Mitr', sans-serif; color: #ffcc00; letter-spacing: 1px; white-space: nowrap; overflow-x: clip; overflow-y: visible; }
    .pr .pbtns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 14px; }
    .pr .pb { box-sizing: border-box; min-block-size: 52px; display: flex; align-items: center; padding: 4px 8px; border-radius: 16px; box-shadow: inset 0 0 0 2px #d9d6f0; }
    .pr .pb .fit { flex: 1 1 auto; min-width: 0; text-align: center; font: 600 20px/1.35 'Mitr', sans-serif; color: #ffffff; white-space: nowrap; overflow-x: clip; overflow-y: visible; }
    .pr .pb.on { background: #ffcc00; box-shadow: none; }
    .pr .pb.on .fit { color: #14142b; }
    .pr .ptime { margin-top: 14px; display: flex; align-items: center; justify-content: space-between; }
    .pr .ptime .pt-n { font: 700 40px/1.2 'Mitr', sans-serif; color: #ffcc00; }`;

// The kit's role rows (exclusive ownership; see rolesRow). A board appends rows for its own elements.
const GLOW = (px) => `rgba(255,204,0,0.45) 0px 0px ${px}px 0px`;
const T = 'tokens.css';
const PK = 'gh#302 B PICKED 2026-11-11';
export const KIT_ROLES = [
  ['night ground', '.pj', ['background-image:linear-gradient(#14142b 0%, #23214d 100%)'], `${T} --color-line-strong to #23214d (${PK})`],
  ['white labels', '.pj :is(.dots .rl, .wc:not(.in):not(.out) .fit, .codebox .ci, .pt:not(.in):not(.out) .pw)', ['color:#ffffff'], `${T} --ink-light`],
  ['secondary labels', '.pj :is(.ev, .lk, .flow small, .codebox .ck), .pj :is(.lk, .codebox .ck) *', ['color:#d9d6f0'], `${T} --ink-on-band-soft`],
  ['gold figures', '.pj :is(.gname, .digits, .flow .to, .wc:not(.in):not(.out) .wd, .timer, .win .fit)', ['color:#ffcc00'], `${T} --accent-gold`],
  ['glow on the gold counts', '.pj :is(.flow .to, .timer)', ['text-shadow:rgba(255,204,0,0.45) 0px 0px 24px'], PK],
  ['ink on gold', '.pj :is(.wc.in .wd, .wc.in .fit, .wc.in .lg, .pt.in .pw), .pj .wc.in .lg *', ['color:#14142b'], 'ink on gold'],
  ['a cell that did not pass: type', '.pj :is(.wc.out .wd, .wc.out .fit, .wc.out .lg, .pt.out .pw), .pj .wc.out .lg *', ['color:#9a97c0'], `#9a97c0 (${PK})`],
  ['round dot ring', '.pj .dots i:not(.on)', ['border-width:3px', 'border-color:#d9d6f0'], `${T} --ink-on-band-soft`],
  ['completed-round dot', '.pj .dots i.done', ['background-color:#d9d6f0'], `${T} --ink-on-band-soft`],
  ['current-round dot', '.pj .dots i.on', ['background-color:#ffcc00', 'border-width:3px', 'border-color:#ffcc00', `box-shadow:${GLOW(18)}`], `${T} --accent-gold; glow (${PK})`],
  ['round dot shape', '.pj .dots i:not(.fin)', ['radius:50%'], 'circle'],
  ['final-round dot shape', '.pj .dots i.fin', ['radius:999px'], 'pill'],
  ['cell and pool-tile shape', '.pj .wc', ['radius:999px'], `pill (${PK} name pill)`],
  ['cell', '.pj .wc:not(.in):not(.out)', ['background-color:#23214d'], `#23214d (${PK})`],
  ['passed cell or tile', '.pj :is(.wc.in, .pt.in)', ['background-color:#ffcc00', `box-shadow:${GLOW(16)}`], `${T} --accent-gold; glow`],
  ['cell or tile that did not pass', '.pj :is(.wc.out, .pt.out)', ['box-shadow:#23214d 0px 0px 0px 2px inset'], `#9a97c0 type (${PK})`],
  ['cell mid-turn (the 3D flip front)', '.pj .wc.turn', ['box-shadow:#ffcc00 0px 0px 0px 3px inset'], `PROPOSAL; ${T} --accent-gold edge`],
  ['veil', '.pj .veil', ['background-color:rgba(20,20,43,0.78)'], PK],
  ['code card', '.pj .codebox', ['background-color:#23214d', 'border-width:3px', 'border-color:#ffcc00', 'radius:24px', `box-shadow:${GLOW(60)}`], `${PK} code card`],
  ['rule card', '.pj .rc', ['background-color:#ffffff', 'radius:32px', `box-shadow:${GLOW(60)}`], 'gh#303 PICKED rule card (white face, 32px radius, gold glow)'],
  ['rule card heading', '.pj .rc .rh', ['color:#3d3b5c'], `${T} --ink-soft`],
  ['rule card condition', '.pj .rc .rv, .pj .rc .rv *', ['color:#14142b'], `${T} --color-line-strong`],
  ['polarity pill', '.pj .rc .pol', ['background-color:#14142b', 'color:#ffcc00', 'radius:999px'], `PROPOSAL; ${T} --color-line-strong, --accent-gold`],
  ['stage floor (3D intent)', '.pj svg.floor line', ['stroke:#2e2b63'], 'gh#303 PICKED hatch #2e2b63'],
  ['pool tile', '.pj .pt', ['radius:24px'], `${PK} winner-card radius`],
  ['pool tile surface', '.pj .pt:not(.in):not(.out)', ['background-color:#23214d'], `#23214d (${PK})`],
  ['winner card', '.pj .win', ['background-color:#23214d', 'radius:24px', 'box-shadow:#ffcc00 0px 0px 0px 3px inset'], `${PK} winner card; gold edge`],
  // phone
  ['phone ground and edge', '.pr', ['background-image:linear-gradient(#14142b 0%, #23214d 100%)', 'box-shadow:#14142b 0px 0px 0px 1px'], `night ground (${PK}); the 1px edge is annotation`],
  ['phone secondary labels', '.pr :is(.ev, .msg), .pr :is(.ev, .msg) *', ['color:#d9d6f0'], `${T} --ink-on-band-soft`],
  ['phone heading', '.pr h2, .pr h2 *', ['color:#ffffff'], `${T} --ink-light`],
  ['phone word card', '.pr .hw:not(.on)', ['background-color:#23214d', 'color:#ffffff', 'radius:16px'], `#23214d (${PK}); ${T} --ink-light`],
  ['phone word card picked', '.pr .hw.on', ['background-color:#ffcc00', 'color:#14142b', 'radius:16px', `box-shadow:${GLOW(16)}`], `${T} --accent-gold; glow`],
  ['phone letter tile', '.pr .lt', ['background-color:#23214d', 'color:#ffcc00', 'radius:16px', 'box-shadow:#ffcc00 0px 0px 0px 3px inset'], `PROPOSAL; #23214d, ${T} --accent-gold`],
  ['phone choice', '.pr .opt:not(.on), .pr .opt:not(.on) *', ['color:#ffffff'], `${T} --ink-light`],
  ['phone choice ring', '.pr .opt', ['box-shadow:#d9d6f0 0px 0px 0px 2px inset', 'radius:16px'], `${T} --ink-on-band-soft ring (the demo count-button ring)`],
  ['phone choice pressed', '.pr .opt.on', ['background-color:#ffffff'], 'the demo bar pressed paint (demo.css aria-pressed)'],
  ['phone choice pressed type', '.pr .opt.on, .pr .opt.on *', ['color:#14142b'], `${T} --color-line-strong`],
  ['phone go button', '.pr .go', ['background-color:#ffcc00', 'color:#14142b', 'radius:999px'], `the demo go button (demo.css): ${T} --accent-gold`],
  ['phone verdict', '.pr .big:not(.out)', ['color:#ffcc00', 'text-shadow:rgba(255,204,0,0.45) 0px 0px 24px'], `${T} --accent-gold; glow`],
  ['phone verdict out', '.pr .big.out', ['color:#9a97c0'], `#9a97c0 (${PK})`],
  ['phone code field', '.pr .pfield', ['background-color:#23214d', 'radius:16px', 'box-shadow:#ffcc00 0px 0px 0px 2px inset'], `PROPOSAL; #23214d, ${T} --accent-gold ring`],
  ['phone code digits and pick timer', '.pr :is(.pdig, .ptime .pt-n)', ['color:#ffcc00'], `${T} --accent-gold`],
  ['phone pool button', '.pr .pb', ['radius:16px'], 'PROPOSAL (the phone choice shape)'],
  ['phone pool button ring', '.pr .pb:not(.on)', ['box-shadow:#d9d6f0 0px 0px 0px 2px inset'], `${T} --ink-on-band-soft ring`],
  ['phone pool button word', '.pr .pb:not(.on) .fit', ['color:#ffffff'], `${T} --ink-light`],
  ['phone pool button picked', '.pr .pb.on', ['background-color:#ffcc00'], `${T} --accent-gold`],
  ['phone pool button picked word', '.pr .pb.on .fit', ['color:#14142b'], `${T} --color-line-strong`],
];

export const KIT_VALUES = [
  ['#14142b to #23214d, 180deg', 'night ground (projector and phone)', 'gh#302 B, picked 2026-11-11'],
  ['#23214d', 'cells, pool tiles, code card, word cards, winner cards', 'gh#302 B, picked'],
  ['#ffffff / #d9d6f0', 'primary / secondary text', 'tokens.css --ink-light / --ink-on-band-soft'],
  ['#ffcc00 + 0 0 16..60px rgba(255,204,0,0.45)', 'words on the field, passed cells, counts, code digits, timer; gold glow', 'tokens.css --accent-gold; gh#302 B glow'],
  ['#9a97c0 + line-through', 'a cell or tile that did not pass', 'gh#302 B, picked'],
  ['#2e2b63', 'the receding stage floor of the 3D intent (absent from the never-blank 2D frame)', 'gh#303 picked card-back hatch'],
  ['14px / 20px', 'D1: the glyph floor of words and names on the dense field (A one screen / B two screens)', 'PROPOSAL (this board)'],
  ['word column = ceil(7.29 em x floor x 1.02) + 4px', 'holds the widest bank word (เครื่องปรับอากาศ) at the floor', 'PROPOSAL, measured 2026-11-20'],
  ['112px Mitr 700, letter-spacing 6px', 'the 14-digit code (gh#303 drew 12 digits at 150px in the same 1500px card)', 'PROPOSAL'],
  ['96px Mitr 700 on #ffffff, 32px radius', 'the rule card condition', 'gh#303 picked rule card, sizes PROPOSAL'],
  ['320px, 16px floor', 'phone frames, real pixels', 'the gh305 audit probe phone branch (readable-font-size)'],
];
export const KIT_PAIRS = [
  ['#ffffff', '#23214d', 'names on cells; white on pool tiles'], ['#ffcc00', '#23214d', 'words on cells; code digits'], ['#14142b', '#ffcc00', 'ink on passed cells'],
  ['#9a97c0', '#14142b', 'a cell that did not pass (on the ground top)'], ['#14142b', '#ffffff', 'the rule condition'], ['#3d3b5c', '#ffffff', 'the rule card heading'],
  ['#ffcc00', '#14142b', 'the polarity pill'], ['#d9d6f0', '#23214d', 'secondary text on the phone'],
];

// Render conventions every board inherits (render-boards.mjs merges a board's own SEL into these).
export const KIT_SEL = {
  clip: '.fit, .wd, .digits, .pdig, .pw, .rv, .pol, .hw, .opt, .lt',
  overlap: '.wc, .pt, .win, .hw, .opt, .pb',
  contain: '.fit, .wd, .digits, .pdig, .pw, .rv, .pol, .hw, .opt, .lt, .wc, .pt, .codebox, .rc',
  field: '.dense, .pool, .pbtns',
};
export const KIT_FLOORS = { floor: 30, phoneFloor: 16 };

// Generic must-red plants every board inherits: each takes the board's HTML and returns it with one fault.
// [name, plant, the pattern its own check must report, marker]. A plant whose marker is absent from a board (a board
// that draws no dense field, no code, no phone) is reported not applicable by mustred.mjs, never run or counted.
// `firstFrame` is the board's first expected frame key.
export function kitPlants(firstFrame) {
  const [dir, id] = firstFrame.split('/');
  return [
    ['font', (s) => s.replace('sarabun-bold-subset.woff2', 'sarabun-bold-MISSING.woff2'), /^font Sarabun 700 error/],
    ['console', (s) => s.replace('</body>', '<script>throw new Error("planted")</script></body>'), /^console: exception Error: planted/],
    ['matrix', (s) => s.replace(`data-frame="${id}" data-dir="${dir}"`, `data-frame="${id}x" data-dir="${dir}"`), new RegExp(`frame ${dir}/${id} found 0 times`)],
    ['overflow', (s) => s.replace('<div data-pick=', '<div style="width: 2100px; height: 10px;"></div><div data-pick='), /page scrolls sideways/],
    ['template', (s) => s.replace('</x-dc>', '<template><p>hidden</p></template></x-dc>'), /<template> element/],
    ['thai-split', (s) => s.replace('</x-dc>', '<p>ห<span>ว</span>ย</p></x-dc>'), /barred word U\+E2B U\+E27 U\+E22/],
    ['thai-entity', (s) => s.replace('</x-dc>', '<p>' + '&#' + 'x644;</p></x-dc>'), /foreign letter\/mark\/invisible U\+0644/],
    ['glyph-floor', (s) => s.replace('</style>', '.pj .wc .wd { font-size: 12px !important; }</style>'), /glyph under its floor in [ABF]\//, 'class="wd"'],
    ['code14-digit', (s) => s.replace(/(class="digits code14 r\d">)(\d)/, (m, a, d) => a + ((Number(d) + 1) % 10)), /round code fails: .*Damm/, 'code14'],
    ['code14-length', (s) => s.replace(/(class="digits code14 r\d">)(\d)/, '$1'), /round code fails: 13 digits/, 'code14'],
    ['name-clip', (s) => s.replace('</style>', '.pj .wc .fit { white-space: nowrap !important; overflow-wrap: normal !important; max-width: 40px; }</style>'), /clipped in [ABF]\//, 'class="wc'],
    ['grammar-use', (s) => s.replace(`data-frame="${id}" data-dir="${dir}">`, `data-frame="${id}" data-dir="${dir}"><svg width="24" height="24" aria-hidden="true"><symbol id="mr"><path d="M1 1L2 2z"/></symbol><use href="#mr"/></svg>`), new RegExp(`${dir}/${id}: element <use> is outside the grammar`)],
    ['palette', (s) => s.replace('</style>', '.pj .gname { color: #00ff00 !important; }</style>'), /\(role: gold figures\) renders color:#00ff00/, 'class="gname"'],
    ['phone-floor', (s) => s.replace('</style>', '.pr .msg { font-size: 12px !important; }</style>'), /text under 16px in [ABF]\//, 'class="msg"'],
    ['tap-44', (s) => s.replace('</style>', '.pr .go { min-block-size: 30px !important; height: 30px; }</style>'), /tap under 44px in [ABF]\//, 'class="go tap"'],
  ];
}
