// gh#303 board helpers, shared by every board this directory writes. Copied from the gh#302 generator
// (its make-boards.mjs is never imported or run from here: it writes the gh#302 boards at top level).
// Every Thai string in a frame passes through th() or nm(), which feed the board's COPY SOURCES row.

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---- copy registry (reset per board) ----
export const SRC = {
  new: 'APPROVED 2026-11-11 (owner popup) · new on this board',
  g302: 'gh#302 board copy · approved by the owner 2026-11-11 (the gh#302 pick), verbatim',
  sample: 'sample data · not copy (stands in for what an MC or a player types)',
  ticket: 'gh#299 body · owner wording, verbatim (game names, the three card rules)',
  page: 'src/pages/c/[category].astro or categories.ts · live copy, verbatim',
  home: 'src/pages/index.astro · live copy, verbatim',
  cat304: 'src/games/categories.ts company-party entry (gh#304, uncommitted on 2026-11-11, not yet approved): verbatim, so the owner sees one proposal',
  g302setup: 'gh#302 setup board lead, approved 2026-11-11 (gh#304 uses it as the category intro), verbatim',
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

// ---- seeded PRNG (the gh#302 one, so the sample roster is the same 200 names) ----
export function rng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle(arr, r) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ---- sample roster: the gh#302 roster, 200 names, one at the 12-grapheme-cluster limit; three names replaced by the NAME FIT worst cases ----
const NICK = ['ต้น', 'แบม', 'ปอ', 'มิว', 'ฟ้า', 'บีม', 'เจน', 'แนน', 'ปาล์ม', 'กอล์ฟ', 'เบล', 'ต่าย', 'หนิง', 'บอส', 'ฝน', 'ออม', 'เก่ง', 'นุ่น', 'พลอย', 'อาร์ม',
  'ตาล', 'ภูมิ', 'จูน', 'กิ๊ฟ', 'ปุ๊ก', 'โอ๊ต', 'มายด์', 'แพร', 'ไผ่', 'น้ำ', 'เฟิร์น', 'หมิว', 'เอ็ม', 'โบ๊ท', 'ปู', 'แป้ง', 'ตั้ม', 'ขวัญ', 'เต้ย', 'อุ้ม'];
const INIT = ['ส.', 'ก.', 'พ.', 'ท.', 'ว.'];
export const ME = 'ต้น ส.';
export const CAP_NAME = 'มะปรางหวานใจ';
export const ROSTER = (() => {
  const all = []; for (const n of NICK) for (const i of INIT) all.push(`${n} ${i}`);
  const out = shuffle(all, rng(302));
  const k = out.findIndex((x, i) => i > 30 && x !== ME); out[k] = CAP_NAME;
  return out;
})();
// Three worst cases for the name-fit rule (the cap is 12 grapheme clusters), measured 2026-11-11 in the self-hosted
// faces: 12 x W (the widest Latin letter, 209.8px in Sarabun 700 at 20px), 12 x U+0E12 (the widest Thai letter, 210px)
// and 12 x U+0E12 U+0E33 (12 clusters; SARA AM takes width inside its cluster: 333px). The first two must stay on one
// line at every floor; the third is the case that wraps.
export const WIDE_LATIN = 'W'.repeat(12);
export const WIDE_THAI = '\u0e12'.repeat(12);
export const WIDE_AM = '\u0e12\u0e33'.repeat(12);
// gh#302's round-1 survivors of the original roster (the same seed), used only to order the event below.
const SURVIVORS0 = (() => {
  const r = rng(2570); const pool = shuffle(ROSTER.filter((x) => x !== ME && x !== CAP_NAME), r);
  return new Set([ME, CAP_NAME, ...pool.slice(0, 98)]);
})();
// ---- the one event every picked frame shows: the gh#302 fixture (its make-boards.mjs, EV), copied ----
// 200 invited, 196 joined; round 1 cuts 196 to 100, round 2 (the card deal) cuts 100 to 50, then 20, then 5 finalists.
const W_SLOTS = ROSTER.map((n, i) => i).filter((i) => ROSTER[i] !== ME && ROSTER[i] !== CAP_NAME).slice(5, 8);
const ROSTER_W = ROSTER.map((n, i) => (i === W_SLOTS[0] ? WIDE_LATIN : i === W_SLOTS[1] ? WIDE_THAI : i === W_SLOTS[2] ? WIDE_AM : n));
export const MAX_HEADS = 200;
export const SCHEDULE = [196, 100, 50, 20, 5];
const SCHEDULE_FIXTURE = SCHEDULE;
export const EV = (() => {
  const keep = new Set([WIDE_LATIN, WIDE_THAI, WIDE_AM, ME, CAP_NAME]);
  const others = ROSTER_W.filter((n) => !keep.has(n)).slice(0, 196 - keep.size);
  const joined = new Set([...keep, ...others]);
  const field1 = ROSTER_W.filter((n) => joined.has(n));
  const surv1 = [WIDE_LATIN, WIDE_THAI, WIDE_AM, ME, CAP_NAME];
  for (const n of [...SURVIVORS0, ...field1]) { if (surv1.length === 100) break; if (joined.has(n) && !surv1.includes(n)) surv1.push(n); }
  const winners = [WIDE_AM, WIDE_LATIN, WIDE_THAI, ME, CAP_NAME]; // prize 1 to prize 5, as gh#302
  const pass1 = new Set(surv1);
  const field2 = field1.filter((n) => pass1.has(n)); // round 2 deals to the 100 who passed, in field order
  const pass2 = new Set([...winners, ...field2.filter((n) => !winners.includes(n)).slice(0, 50 - winners.length)]);
  return { invited: 200, field1, pass1, field2, pass2, winners };
})();
const EVENT_FIXTURE = EV;
// The generator refuses an impossible event: strictly decreasing rounds within MAX_HEADS, no more joined than
// invited, each round's participants exactly the previous round's survivors, and every field and cut the frames
// draw agreeing with the schedule. Pure in its arguments, so a must-red can hand it a broken event.
const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
export function assertEvent(EV = EVENT_FIXTURE, SCHEDULE = SCHEDULE_FIXTURE) {
  const bad = (m) => { throw new Error(`event fixture: ${m}`); };
  if (SCHEDULE[0] > MAX_HEADS || EV.invited > MAX_HEADS) bad('more heads than MAX_HEADS');
  if (EV.field1.length > EV.invited) bad(`${EV.field1.length} joined but only ${EV.invited} invited`);
  if (!sameSet(new Set(EV.field2), EV.pass1) || new Set(EV.field2).size !== EV.field2.length) bad('round 2 participants are not exactly the round 1 survivors');
  for (const n of EV.pass1) if (!EV.field1.includes(n)) bad(`${n} survives round 1 without joining`);
  for (const n of EV.pass2) if (!EV.field2.includes(n)) bad(`${n} survives round 2 without playing it`);
  for (let i = 1; i < SCHEDULE.length; i++) if (!(SCHEDULE[i] < SCHEDULE[i - 1])) bad(`round ${i + 1} does not decrease`);
  if (SCHEDULE.at(-1) !== 5) bad('the final is not 5');
  if (EV.field1.length !== SCHEDULE[0] || new Set(EV.field1).size !== SCHEDULE[0]) bad('round 1 field is not 196 unique');
  if (EV.pass1.size !== SCHEDULE[1]) bad('round 1 does not pass 100');
  if (EV.field2.length !== SCHEDULE[1]) bad('round 2 field is not the 100 who passed');
  if (EV.pass2.size !== SCHEDULE[2]) bad('round 2 does not pass 50');
  for (const n of EV.pass2) if (!EV.pass1.has(n)) bad(`${n} passes round 2 without round 1`);
  for (const n of EV.winners) if (!EV.pass2.has(n)) bad(`winner ${n} did not pass round 2`);
  if (new Set(EV.winners).size !== 5) bad('a name wins twice');
  for (const w of [WIDE_LATIN, WIDE_THAI, WIDE_AM]) if (!EV.field1.includes(w) || !EV.field2.includes(w)) bad('a worst-case name is missing from a field');
}
assertEvent();
export const PRIZES = ['ทีวี 55 นิ้ว', 'จักรยานไฟฟ้า', 'หม้อทอดไร้น้ำมัน', 'ลำโพงไร้สาย', 'หูฟังไร้สาย'];
export const FINALISTS = EV.winners;
export const EVENT = 'ปาร์ตี้ปีใหม่ 2570';

// ---- colour maths (WCAG 2.x relative luminance) ----
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); };
export const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// ---- inline SVG (the self-hosted subsets carry no arrows, ticks or suits, so none is typed as a glyph) ----
export const svg = {
  arrow: (w = 28, c = 'currentColor', sw = 3) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h16M13 5.5l6.5 6.5-6.5 6.5" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  check: (w = 24, c = 'currentColor', sw = 3) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12.5l5 5L19.5 7" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  // Suits, drawn: club is the gh#302 path; the other three are new paths on the same 24-unit grid.
  suit: (s, w, c) => {
    const p = {
      C: '<circle cx="12" cy="11" r="3"/><circle cx="12" cy="6.6" r="4.4"/><circle cx="6.9" cy="13.2" r="4.4"/><circle cx="17.1" cy="13.2" r="4.4"/><path d="M10.6 11.5h2.8c.1 4.3.9 7.3 2.9 10H7.7c2-2.7 2.8-5.7 2.9-10z"/>',
      S: '<path d="M12 2C9 6.5 3 9.5 3 14c0 2.8 2.2 4.6 4.6 4.6 1.6 0 2.9-.8 3.6-1.9-.2 2.2-1.1 3.9-2.7 5.3h7c-1.6-1.4-2.5-3.1-2.7-5.3.7 1.1 2 1.9 3.6 1.9 2.4 0 4.6-1.8 4.6-4.6 0-4.5-6-7.5-9-12z"/>',
      H: '<path d="M12 21.5s-7.6-4.7-9.6-9.4C1 8.6 3.1 4.5 6.9 4.5c2.1 0 3.7 1.2 5.1 3 1.4-1.8 3-3 5.1-3 3.8 0 5.9 4.1 4.5 7.6-2 4.7-9.6 9.4-9.6 9.4z"/>',
      D: '<path d="M12 2l8.2 10L12 22 3.8 12z"/>',
    }[s];
    return `<svg width="${w}" height="${w}" viewBox="0 0 24 24" aria-hidden="true"><g fill="${c}">${p}</g></svg>`;
  },
};

// A paint drawn "at opacity o" is written pre-composited, as the solid colour o of it over the night ground's
// midpoint (#1c1b3c, halfway down the #14142b to #23214d gradient): the boards' grammar admits no opacity, so a
// faded paint is a named solid value a role row can list (REFUTE round 2).
export const GROUND_MID = '#1c1b3c';
export const faded = (c, o) => {
  if (o === 1) return c;
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [f, g] = [p(c), p(GROUND_MID)];
  return '#' + f.map((x, i) => Math.round(x * o + g[i] * (1 - o)).toString(16).padStart(2, '0')).join('');
};

// A firework burst, drawn: rays and sparks around a centre, in token colours only; op fades it (pre-composited).
export function burst(cx, cy, r, seed, { colors = ['#ffcc00', '#ffffff', '#ff3d7f'], rays = 22, op = 1 } = {}) {
  const rr = rng(seed); let s = '';
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2 + rr() * 0.12; const r0 = r * (0.22 + rr() * 0.12); const r1 = r * (0.78 + rr() * 0.22);
    const c = colors[i % colors.length];
    s += `<line x1="${(cx + Math.cos(a) * r0).toFixed(1)}" y1="${(cy + Math.sin(a) * r0).toFixed(1)}" x2="${(cx + Math.cos(a) * r1).toFixed(1)}" y2="${(cy + Math.sin(a) * r1).toFixed(1)}" stroke="${faded(c, op)}" stroke-width="${(3 + rr() * 3).toFixed(1)}" stroke-linecap="round"/>`;
    s += `<circle cx="${(cx + Math.cos(a) * (r1 + 10)).toFixed(1)}" cy="${(cy + Math.sin(a) * (r1 + 10)).toFixed(1)}" r="${(3 + rr() * 4).toFixed(1)}" fill="${faded(c, op)}"/>`;
  }
  return `<g class="burst">${s}<circle cx="${cx}" cy="${cy}" r="${(r * 0.12).toFixed(1)}" fill="${faded('#ffffff', op)}"/></g>`;
}

// ---------------------------------------------------------------------------------------------
// Board chrome (annotation; its colours are not design values)
// ---------------------------------------------------------------------------------------------
export const FONTS = `
    @font-face { font-family: 'Sarabun'; font-style: normal; font-weight: 400; src: url('../public/fonts/sarabun-regular-subset.woff2') format('woff2'); }
    @font-face { font-family: 'Sarabun'; font-style: normal; font-weight: 700; src: url('../public/fonts/sarabun-bold-subset.woff2') format('woff2'); }
    @font-face { font-family: 'Mitr'; font-style: normal; font-weight: 500; src: url('../public/fonts/mitr-medium-subset.woff2') format('woff2'); }
    @font-face { font-family: 'Mitr'; font-style: normal; font-weight: 600; src: url('../public/fonts/mitr-semibold-subset.woff2') format('woff2'); }
    @font-face { font-family: 'Mitr'; font-style: normal; font-weight: 700; src: url('../public/fonts/mitr-bold-subset.woff2') format('woff2'); }`;

export const ANNOT_CSS = `
    body { margin: 0; font-family: system-ui, sans-serif; }
    .brow { padding: 34px 34px; border-bottom: 3px dashed #14142b; }
    .brow h2 { margin: 0 0 6px; font: 700 20px/1.3 ui-monospace, Menlo, monospace; }
    .brow h3 { margin: 18px 0 6px; font: 700 15px/1.3 ui-monospace, Menlo, monospace; }
    .brow .why { margin: 0 0 16px; font: 13px/1.55 ui-monospace, Menlo, monospace; color: #3d3b5c; max-width: 1420px; }
    .brow .why b { color: #14142b; }
    .tbl { border-collapse: collapse; font: 12px/1.5 ui-monospace, Menlo, monospace; margin: 0 0 18px; max-width: 1450px; }
    .tbl th, .tbl td { border: 1px solid #14142b; padding: 5px 9px; text-align: left; vertical-align: top; }
    .tbl th { background: #14142b; color: #ffcc00; }
    .tbl td.thc { font-family: 'Sarabun', system-ui, sans-serif; font-size: 14px; }
    .cands { display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start; }
    .cands.col { flex-direction: column; gap: 34px; }
    .cand { display: flex; flex-direction: column; gap: 8px; }
    .cand:has(> [data-frame], > .scaler) { width: min-content; }
    .tag { font: 600 12px/1.45 ui-monospace, Menlo, monospace; color: #14142b; max-width: 1450px; }
    .tag .d { display: inline-block; background: #14142b; color: #ffcc00; border-radius: 999px; padding: 0 8px; margin-right: 4px; font: 700 11px/1.6 ui-monospace, Menlo, monospace; }
    .tag .res { display: inline-block; background: #ffcc00; color: #14142b; border: 1.5px solid #14142b; border-radius: 999px; padding: 0 8px; margin-right: 4px; font: 700 11px/1.5 ui-monospace, Menlo, monospace; }
    .tag .res.no { background: #ffffff; text-decoration: line-through; }
    .tag .pc { display: inline-block; background: #ffffff; color: #14142b; border: 1.5px solid #14142b; border-radius: 999px; padding: 0 7px; margin-left: 4px; font: 700 10px/1.5 ui-monospace, Menlo, monospace; }
    .pin { font: 12px/1.6 ui-monospace, Menlo, monospace; color: #14142b; background: #ffffff; border: 2px solid #14142b; border-radius: 8px; padding: 10px 14px; max-width: 1420px; margin: 0 0 14px; }
    .pin.q { border-width: 4px; font-size: 13px; }
    .pin ul { margin: 4px 0 0; padding-left: 18px; }
    .scaler { position: relative; overflow: hidden; box-shadow: 0 0 0 1px #14142b; }
    .scaler > * { transform-origin: 0 0; }
    .stub { display: flex; align-items: center; justify-content: center; text-align: center; padding: 0 12px; font: 600 12px/1.4 ui-monospace, Menlo, monospace; color: #14142b;
            background: repeating-linear-gradient(135deg, #e9e3cf 0 10px, #f5f1e3 10px 20px); }`;

export function header(title, lines, status = 'AWAITING OWNER') {
  return `
  <div style="padding: 30px 34px; background: #14142b; color: #ffcc00;">
    <div style="font: 700 26px/1.3 ui-monospace, Menlo, monospace;">${title} · proposal board · ${status}</div>
    ${lines.map((l) => `<div style="margin-top: 8px; font: 13px/1.55 ui-monospace, Menlo, monospace; color: #fff6e0;">${l}</div>`).join('\n    ')}
  </div>`;
}

// opt is the option letter of this board ('A' / 'B'); label is its short name.
// picked: the option letter the owner picked for this decision (2026-11-11); the other option is stamped NOT PICKED.
export const res = (opt, picked) => (picked ? (opt === picked ? '<span class="res">PICKED 2026-11-11</span>' : '<span class="res no">NOT PICKED 2026-11-11</span>') : '');
export const tag = (opt, label, text, picked) => `<div class="tag"><span class="d">${opt} · ${label}</span>${res(opt, picked)}${text}<span class="pc">COPY APPROVED</span></div>`;

export const ORDER_LINE = 'Order (ADR-0033): owner picks, canvas, code. Code takes its design values only from the option picked here. Every Thai string inside a frame is PROPOSED COPY unless the COPY SOURCES row marks it verbatim; the wording follows gh#299 (Constraints: Gambling wording). Tags, the hatched stubs and these rows are annotation, not design.';

export function contrastTable(pairs) {
  return `<table class="tbl"><tr><th>text / mark</th><th>on</th><th>ratio</th><th>use</th></tr>${pairs.map(([f, b, u]) => `<tr><td>${f}</td><td>${b}</td><td>${ratio(f, b).toFixed(2)}:1</td><td>${esc(u)}</td></tr>`).join('')}</table>`;
}
export function valuesTable(rows) {
  return `<table class="tbl values"><tr><th>value</th><th>where</th><th>source</th></tr>${rows.map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('')}</table>`;
}
export function beatTable(beats) {
  return `<table class="tbl"><tr><th>#</th><th>beat</th><th>time</th><th>what moves (3D intent)</th><th>reduced motion (ADR-0046: reduce, not remove)</th></tr>${beats.map((b, i) => `<tr><td>${i + 1}</td><td>${esc(b[0])}</td><td>${esc(b[1])}</td><td>${esc(b[2])}</td><td>${esc(b[3])}</td></tr>`).join('')}</table>`;
}

export function copyRow() {
  const rows = [...reg.REG.entries()].map(([text, { role, src }]) => `<tr><td>${esc(role)}</td><td class="thc">${esc(text)}</td><td>${esc(SRC[src])}</td></tr>`).join('');
  const names = [...reg.NAMES];
  const sample = names.length ? `<tr><td>sample names (${names.length})</td><td class="thc">${names.slice(0, 8).map(esc).join(' · ')} …</td><td>${esc(SRC.sample)}; the gh#302 roster, one name at the 12-cluster limit (${esc(CAP_NAME)}), plus the NAME FIT worst cases</td></tr>` : '';
  return `
  <div class="brow">
    <h2>COPY SOURCES · every Thai string on this board, and where it comes from</h2>
    <p class="why">Strings in a frame: ${reg.REG.size} distinct${names.length ? `, plus ${names.length} distinct sample names` : ''}. New strings were proposed copy and are <b>APPROVED 2026-11-11</b> by owner popup, as they stand. None of the words gh#299 bars appears (the board's Thai scan checks it).</p>
    <table class="tbl"><tr><th>role</th><th>string</th><th>source</th></tr>${rows}${sample}</table>
  </div>`;
}

// The NAME FIT row: the gh#302 rule (picked boards), and this board's surfaces with their sizes and floors.
export function nameFitRow(surfaces) {
  return `
  <div class="brow">
    <h2>NAME FIT · the gh#302 rule, on this board's surfaces</h2>
    <p class="why"><b>Rule</b> (the gh#302 picked boards' NAME FIT row, followed here): the limit is 12 grapheme clusters. A name is never clipped and never truncated. It renders at its surface's size; if the name plus 2% slack does not fit its box, it shrinks in 1px steps; at the floor it wraps onto a second line (overflow-wrap: anywhere), and every surface holds two lines at its floor (in the name fields the row that holds a wrapped name grows, and the render fails if the field overflows its box). Each floor is the smallest size at which the widest 12-base-letter names, ${esc(WIDE_LATIN)} and ${esc(WIDE_THAI)} (U+0E12, the widest Thai letter), stay on one line, measured on this board's own frames. ${esc(WIDE_AM)} (U+0E12 U+0E33 x12: 12 clusters, SARA AM takes width, 58% wider) is drawn and is the case that wraps. All three are drawn among the joined names, the names dealt and the finalists. The render fails on a clip, a name that wraps above its floor or onto a third line, a one-line name without its slack, a name below its floor, or a field whose rows overflow it.</p>
    <table class="tbl"><tr><th>surface</th><th>face</th><th>size</th><th>floor</th><th>box for the name</th><th>worst case lands at</th></tr>${surfaces.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>
  </div>`;
}

export function notesRow(lines) {
  return `
  <div class="brow">
    <h2>NOTES · decisions it rests on, what is not covered, what was not drawn</h2>
    ${lines.map((l) => `<p class="why">${l}</p>`).join('\n    ')}
  </div>`;
}

export function rulesRow(queries, items) {
  return `
  <div class="brow">
    <h2>RULES CHECKED · ui-ux-pro-max 2.13.0 (design input, gh#299 owner ruling 2026-11-11)</h2>
    <p class="why">Queried 2026-11-11, one intent per query, rules taken and never its palette or fonts; no --persist, no --design-system. ${queries}</p>
    <div class="pin"><ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul></div>
  </div>`;
}

// The name-fit rule, the gh#302 NAME FIT rule (picked boards, 2026-11-11), executable so the render can prove it:
// an element with class "fit" renders at its data-max px; if its text plus 2% slack is wider than its box, it
// steps down 1px at a time, never below data-min px; still too wide at the floor, it wraps onto a second line
// (overflow-wrap: anywhere) rather than clip, and every surface holds two lines at its floor. Each floor is set so
// the widest 12-base-letter names (12 x W, 12 x U+0E12) stay on one line; 12 x U+0E12 U+0E33 is the case that wraps.
export const FIT_SCRIPT = `<script>
  // Text width from a Range, box width from the content box: overflow-x: clip keeps Thai marks unclipped
  // vertically, and a clipped box reports no scroll overflow, so scrollWidth cannot be the measure.
  const tw = (e) => { const g = document.createRange(); g.selectNodeContents(e); const rs = [...g.getClientRects()].filter((x) => x.width > 0); return rs.length ? Math.max(...rs.map((x) => x.right)) - Math.min(...rs.map((x) => x.left)) : 0; };
  const cw = (e) => { const cs = getComputedStyle(e); return (e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) * (e.getBoundingClientRect().width / e.offsetWidth); };
  document.fonts.ready.then(() => {
    for (const e of document.querySelectorAll('.fit')) {
      let px = parseFloat(e.dataset.max); const min = parseFloat(e.dataset.min);
      e.style.fontSize = px + 'px';
      while (tw(e) * 1.02 > cw(e) && px > min) { px -= 1; e.style.fontSize = px + 'px'; }
      if (tw(e) * 1.02 > cw(e)) { e.style.whiteSpace = 'normal'; e.style.overflowWrap = 'anywhere'; }
    }
    document.documentElement.dataset.fitDone = '1';
  });
</script>`;
export const fit = (min, max) => `fit" data-min="${min}" data-max="${max}`;

export function boardDoc(title, comment, headLines, frameCss, rows, { width = 1520, extraHelmet = '', status, pick = '' } = {}) {
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
    /* Self-hosted faces, relative paths, the same files src/styles/fonts.css declares (Sarabun 400/700, Mitr 600/700).
       The board is design source and is never referenced at runtime. */${FONTS}

    /* ${comment} Generated by docs/verification/evidence/gh303-boards-2026-11-11/make-boards.mjs;
       edit the generator, not this file. Annotations are English and monospace. Every Thai string in a frame is PROPOSED COPY
       unless COPY SOURCES says verbatim. Frame values are literals (VALUES row: token, gh#302 pick, or PROPOSAL). */${ANNOT_CSS}
${frameCss}${extraHelmet}
  </style>
</helmet>

<div data-pick="${pick}" style="width: ${width}px; background: #ffffff; color: #14142b;">
${header(title, headLines, status)}
${rows.join('\n')}
</div>
</x-dc>
${FIT_SCRIPT}
</body>
</html>
`;
}
