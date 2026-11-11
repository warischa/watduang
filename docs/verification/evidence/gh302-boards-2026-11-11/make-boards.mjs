#!/usr/bin/env node
// gh#302 board generator. Writes three canvas boards into design/:
//   Gh302Setup.dc.html      setup page (both roster modes, cut schedule, prizes, event name, ad slot)
//   Gh302Projector.dc.html  projected frames at 1920x1080 (lobby, round, plain 2D reveal, round code, result)
//   Gh302Phone.dc.html      QR join page at 320 and 375, phone reveal and prize claim at 320
// Two directions on every board: A POSTER (light, the site's canvas D language) and B NIGHT STAGE (dark).
// Deterministic: a seeded PRNG, so a re-run writes the same bytes. Every Thai string passes through th()
// or nm(), which feed the board's COPY SOURCES row. Frame values are literals on the element that carries
// them (ADR-0047); the VALUES row says which literal is a tokens.css value and which is a PROPOSAL.
// Usage: node make-boards.mjs   (from anywhere; paths resolve from this file)

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const designDir = path.join(root, 'design');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---- copy registry (reset per board) ----
const SRC = {
  new: 'APPROVED COPY 2026-11-11 · new on this board (no src copy existed); approved by the owner as it stands',
  sample: 'sample data · not copy (stands in for what an MC or a player types)',
  home: 'src/pages/index.astro · verbatim',
  ticket: 'gh#299 body · owner wording, verbatim (game names)',
  variant: 'APPROVED COPY 2026-11-11 · an approved string with only its round number changed',
};
let REG = new Map();
let NAMES = new Set();
// Two compounds the browser's Thai breaker may split across lines are kept whole (a no-wrap span, no invisible characters).
const KEEP = /(จอใหญ่|เข้าร่วม)/g;
// The whole string is wrapped once more so a grid or flex parent sees one item, not a text run plus a span.
const th = (text, role, src = 'new') => {
  if (!REG.has(text)) REG.set(text, { role, src });
  const h = esc(text);
  return h.search(KEEP) >= 0 ? `<span>${h.replace(KEEP, '<span style="white-space: nowrap;">$1</span>')}</span>` : h;
};
const nm = (text) => { NAMES.add(text); return esc(text); };

// ---- seeded PRNG ----
function rng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, r) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ---- sample roster: 40 nicknames x 5 initials = 200, one replaced by a name at the proposed cap ----
const NICK = ['ต้น', 'แบม', 'ปอ', 'มิว', 'ฟ้า', 'บีม', 'เจน', 'แนน', 'ปาล์ม', 'กอล์ฟ', 'เบล', 'ต่าย', 'หนิง', 'บอส', 'ฝน', 'ออม', 'เก่ง', 'นุ่น', 'พลอย', 'อาร์ม',
  'ตาล', 'ภูมิ', 'จูน', 'กิ๊ฟ', 'ปุ๊ก', 'โอ๊ต', 'มายด์', 'แพร', 'ไผ่', 'น้ำ', 'เฟิร์น', 'หมิว', 'เอ็ม', 'โบ๊ท', 'ปู', 'แป้ง', 'ตั้ม', 'ขวัญ', 'เต้ย', 'อุ้ม'];
const INIT = ['ส.', 'ก.', 'พ.', 'ท.', 'ว.'];
const ME = 'ต้น ส.';
const CAP_NAME = 'มะปรางหวานใจ'; // 12 grapheme clusters (and 12 code points): a realistic name at the cap, drawn as the worst case
const ROSTER = (() => {
  const all = []; for (const n of NICK) for (const i of INIT) all.push(`${n} ${i}`);
  const out = shuffle(all, rng(302));
  const k = out.findIndex((x, i) => i > 30 && x !== ME); out[k] = CAP_NAME;
  return out;
})();
const SURVIVORS = (() => {
  const r = rng(2570); const pool = shuffle(ROSTER.filter((x) => x !== ME && x !== CAP_NAME), r);
  return new Set([ME, CAP_NAME, ...pool.slice(0, 98)]);
})();
const JOINED = ROSTER.filter((_, i) => i < 196); // QR mode: 196 of 200 joined
const PRIZES = ['ทีวี 55 นิ้ว', 'จักรยานไฟฟ้า', 'หม้อทอดไร้น้ำมัน', 'ลำโพงไร้สาย', 'หูฟังไร้สาย'];
const WINNERS = [ME, CAP_NAME, ...[...SURVIVORS].filter((x) => x !== ME && x !== CAP_NAME).slice(0, 3)];
const EVENT = 'ปาร์ตี้ปีใหม่ 2570';
const PIN = '4821';
const CODE = '482 915'; // the 6-digit placeholder, kept on the frames that were not picked
// Owner pick 2026-11-11: a cut round's code is 9 digits (gh#300), grouped 3-3-3; a card-deal round's is 12, grouped 4-4-4.
const CODE9 = '482 915 307';
const CODE9_WRONG = '482 915 370';
const PICKED_ON = '2026-11-11';
const CODE12 = '4821 5307 6290'; // a card-deal round's 12-digit code, grouped 4-4-4

// ---- name fit (gh#302 REFUTE F2; unit corrected 2026-11-11) ----
// The owner's name limit is 12 GRAPHEME CLUSTERS (UAX #29, as gh#308 enforces it with Intl.Segmenter): a base letter
// plus its marks is one cluster. Measured 2026-11-11 (Intl.Segmenter, then canvas measureText in the self-hosted faces):
//   - Thai above/below marks (U+0E31, U+0E34-U+0E3A, U+0E47-U+0E4E) join their cluster and stack, adding no width.
//   - U+0E33 (SARA AM) also joins its cluster but is a SPACING mark, so it adds width: U+0E12 U+0E33 x12 is 12 clusters
//     and 58% wider than U+0E12 x12 (Sarabun 700 at 20px: 332.6 vs 210.2). It is the widest well-formed Thai case.
//   - Repeated U+0E33 still makes one cluster, so the cluster cap alone bounds no width (PROPOSAL for gh#308 in the
//     NAME FIT row: at most one U+0E33 per cluster, and only after a Thai consonant or tone mark).
//   - Latin W is the widest Latin letter (Sarabun 700, Mitr); in Sarabun 400 'm' is 1% wider, inside the 2% slack.
const LATIN_W = 'W'.repeat(12);
const THAI_W = '\u0e12'.repeat(12); // 12 widest base letters, one line at each surface's floor
const THAI_M = '\u0e12\u0e33'.repeat(12); // 12 clusters with a spacing mark each: wraps at the floor on narrow surfaces
const WORST = new Set([LATIN_W, THAI_W, THAI_M]);
// Each name surface: its size, and its floor. A name renders at the size; if the name plus 2% slack does not fit its
// box, it shrinks in 1px steps; at the floor it wraps onto a second line (the name field instead scrolls, as an input
// does). Each floor is a legibility minimum; a name that does not fit on one line at its floor wraps onto two.
const SURF = { chipB: 20, spotB: 132, wcardB: 52, jrowA: 18, taA: 18, inpA: 20, meA: 16, whoA: 34 };
const FLOOR = { chipB: 14, spotB: 96, wcardB: 35, jrowA: 17, taA: 18, inpA: 20, meA: 16, whoA: 21 };
// Fitted sizes per name instance, measured by render-boards.mjs (its nameFit report) and recorded here.
const fitFile = path.join(here, 'name-fit.json');
const FITS = existsSync(fitFile) ? JSON.parse(readFileSync(fitFile, 'utf8')) : {};
const floorOf = (surf) => FLOOR[surf];
// Attributes for one name element: its floor, its key, and its fitted size when the rule shrinks it.
function nmAttr(surf, name, w = 0) {
  const key = `${surf}|${w}|${name}`;
  let a = ` data-floor="${floorOf(surf)}" data-key="${esc(key)}"`;
  const fit = FITS[key];
  if (fit == null || fit >= SURF[surf]) return a;
  if (surf === 'inpA') return a + ' data-fit="scroll"'; // a typed field scrolls; it never shrinks
  if (fit < FLOOR[surf]) return a + ` data-wrap="2"${FLOOR[surf] < SURF[surf] ? ` style="font-size: ${FLOOR[surf]}px;"` : ''}`;
  return a + ` style="font-size: ${fit}px;"`;
}
// ---- the event every picked frame shows (gh#302 REFUTE round 2, N2 + N4) ----
// QR mode: 200 invited, 196 present and joined (the setup review list, the lobby, the start button), round 1 cuts
// 196 to 100, round 2 (the card deal) is those 100, five prizes. The admin-typed variant of setup types the same 196.
// Every picked frame draws from these sets, and assertEvent() below throws if any frame's fixture disagrees.
// The unpicked frames keep the fixtures they were picked against (200 names, sample identity ME); they are history.
const W_SLOTS = ROSTER.map((n, i) => i).filter((i) => ROSTER[i] !== ME && ROSTER[i] !== CAP_NAME).slice(5, 8);
const ROSTER_W = ROSTER.map((n, i) => (i === W_SLOTS[0] ? LATIN_W : i === W_SLOTS[1] ? THAI_W : i === W_SLOTS[2] ? THAI_M : n));
const EV = (() => {
  const keep = new Set([LATIN_W, THAI_W, THAI_M, ME, CAP_NAME]);
  const others = ROSTER_W.filter((n) => !keep.has(n)).slice(0, 196 - keep.size);
  const joined = new Set([...keep, ...others]);
  const field = ROSTER_W.filter((n) => joined.has(n)); // the projector field, in roster order
  const surv = [LATIN_W, THAI_W, THAI_M, ME, CAP_NAME];
  for (const n of [...SURVIVORS, ...field]) { if (surv.length === 100) break; if (joined.has(n) && !surv.includes(n)) surv.push(n); }
  const winners = [THAI_M, LATIN_W, THAI_W, ME, CAP_NAME]; // prize 1 to prize 5
  const out = field.find((n) => !surv.includes(n)); // the identity on the picked "did not pass" phone frame
  return { invited: 200, field, joinList: [LATIN_W, THAI_W, THAI_M, ...field.filter((n) => !WORST.has(n))], survivors: new Set(surv), winners, out };
})();
const prizeOf = (name) => EV.winners.indexOf(name) + 1; // 0 = no prize
function assertEvent() {
  const bad = (m) => { throw new Error(`event fixture: ${m}`); };
  if (EV.field.length !== 196 || new Set(EV.field).size !== 196) bad(`field holds ${EV.field.length} names, not 196 unique`);
  if (EV.joinList.length !== 196 || new Set(EV.joinList).size !== 196) bad('join list is not the 196 joined');
  if (EV.survivors.size !== 100) bad(`round 1 passes ${EV.survivors.size}, not 100`);
  for (const n of EV.survivors) if (!EV.field.includes(n)) bad(`survivor ${n} is not in the field`);
  for (const n of EV.winners) if (!EV.survivors.has(n)) bad(`winner ${n} did not pass round 1`);
  if (new Set(EV.winners).size !== 5) bad('a name wins twice');
  if (EV.survivors.has(EV.out) || !EV.field.includes(EV.out)) bad('the "did not pass" identity passed, or never joined');
}
assertEvent();
const WINNERS_W = EV.winners;
let PICK = null; // the direction the owner picked for the board being built
let BOARD = null; // 'setup' | 'projector' | 'phone'
const resPill = (dir) => (PICK ? (dir === PICK ? `<span class="res">PICKED ${PICKED_ON}</span>` : `<span class="res no">NOT PICKED ${PICKED_ON}</span>`) : '');

// ---- colour maths (WCAG 2.x relative luminance) ----
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// ---- inline SVG (the self-hosted subsets carry no arrows, ticks or suits, so none is typed as a glyph) ----
const svg = {
  arrow: (w = 28, c = 'currentColor', sw = 3) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h16M13 5.5l6.5 6.5-6.5 6.5" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  check: (w = 24, c = 'currentColor', sw = 3) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12.5l5 5L19.5 7" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  alert: (w = 22, bg = '#ff3d7f', fg = '#14142b') => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="${bg}"/><path d="M12 6v8" fill="none" stroke="${fg}" stroke-width="3" stroke-linecap="round"/><circle cx="12" cy="18" r="1.7" fill="${fg}"/></svg>`,
  minus: (w = 22, c = 'currentColor') => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round"/></svg>`,
  plus: (w = 22, c = 'currentColor') => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M12 5v14" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round"/></svg>`,
  club: (w = 80, c = '#14142b') => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" aria-hidden="true"><g fill="${c}"><circle cx="12" cy="11" r="3"/><circle cx="12" cy="6.6" r="4.4"/><circle cx="6.9" cy="13.2" r="4.4"/><circle cx="17.1" cy="13.2" r="4.4"/><path d="M10.6 11.5h2.8c.1 4.3.9 7.3 2.9 10H7.7c2-2.7 2.8-5.7 2.9-10z"/></g></svg>`,
};

function qr(size, seed, fg = '#14142b') {
  const n = 25, q = 3, r = rng(seed); let rects = '';
  const inFinder = (x, y) => (x < 8 && y < 8) || (x >= n - 8 && y < 8) || (x < 8 && y >= n - 8);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!inFinder(x, y) && r() < 0.48) rects += `<rect x="${x + q}" y="${y + q}" width="1" height="1"/>`;
  const fin = (x, y) => `<rect x="${x + q}" y="${y + q}" width="7" height="7"/><rect x="${x + q + 1}" y="${y + q + 1}" width="5" height="5" fill="#ffffff"/><rect x="${x + q + 2}" y="${y + q + 2}" width="3" height="3"/>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${n + 2 * q} ${n + 2 * q}" shape-rendering="crispEdges" aria-hidden="true"><rect width="${n + 2 * q}" height="${n + 2 * q}" fill="#ffffff"/><g fill="${fg}">${rects}${fin(0, 0)}${fin(n - 7, 0)}${fin(0, n - 7)}</g></svg>`;
}

// ---------------------------------------------------------------------------------------------
// Board chrome (annotation; its colours are not design values)
// ---------------------------------------------------------------------------------------------
const FONTS = `
    @font-face { font-family: 'Sarabun'; font-style: normal; font-weight: 400; src: url('../public/fonts/sarabun-regular-subset.woff2') format('woff2'); }
    @font-face { font-family: 'Sarabun'; font-style: normal; font-weight: 700; src: url('../public/fonts/sarabun-bold-subset.woff2') format('woff2'); }
    @font-face { font-family: 'Mitr'; font-style: normal; font-weight: 600; src: url('../public/fonts/mitr-semibold-subset.woff2') format('woff2'); }
    @font-face { font-family: 'Mitr'; font-style: normal; font-weight: 700; src: url('../public/fonts/mitr-bold-subset.woff2') format('woff2'); }`;

const ANNOT_CSS = `
    body { margin: 0; font-family: system-ui, sans-serif; }
    .brow { padding: 34px 34px; border-bottom: 3px dashed #14142b; }
    .brow h2 { margin: 0 0 6px; font: 700 20px/1.3 ui-monospace, Menlo, monospace; }
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
    .stub { height: 56px; display: flex; align-items: center; padding: 0 28px; font: 600 12px/1.4 ui-monospace, Menlo, monospace; color: #14142b;
            background: repeating-linear-gradient(135deg, #e9e3cf 0 10px, #f5f1e3 10px 20px); }
    .fold { position: absolute; left: 0; right: 0; border-top: 2px dashed #2b7bff; pointer-events: none; }`;

function header(group, lines) {
  return `
  <div style="padding: 30px 34px; background: #14142b; color: #ffcc00;">
    <div style="font: 700 26px/1.3 ui-monospace, Menlo, monospace;">gh#302 · company New Year prize draw · ${group} · proposal board · ${PICK ? `APPROVED ${PICKED_ON}: ${PICK} PICKED` : 'AWAITING OWNER'}</div>
    ${lines.map((l) => `<div style="margin-top: 8px; font: 13px/1.55 ui-monospace, Menlo, monospace; color: #fff6e0;">${l}</div>`).join('\n    ')}
  </div>`;
}

const tag = (dir, text, extra = '') => `<div class="tag"><span class="d">${dir} · ${dir === 'A' ? 'POSTER' : 'NIGHT STAGE'}</span>${resPill(dir)}${text}<span class="pc">COPY APPROVED</span>${extra}</div>`;

const DIRECTIONS_LINE = 'Directions. <b>A POSTER</b>: light cream ground, ink outlines and hard offset shadows, gold for the action, the site\'s own canvas D language carried onto the projector and the phone; no new colour. <b>B NIGHT STAGE</b>: a dark night ground on the projector and the phone, names lit gold as they pass, no outlines; four new values, each labelled PROPOSAL in the VALUES row. The setup page stays a cream site page in both (it carries the ad and the site chrome); B splits it into a form and a dark summary panel.';
const ORDER_LINE = 'Order (ADR-0033): owner picks, canvas, code. Code takes its design values only from the option picked here. Every Thai string inside a frame is new copy, approved by the owner on 2026-11-11 as it stands, unless the COPY SOURCES row marks it verbatim; the wording follows the rules in gh#299 (Constraints: Gambling wording). Tags, rulers, the hatched stub and the blue fold lines are annotation, not design.';

// ---------------------------------------------------------------------------------------------
// VALUES, CONTRAST and RULES rows (shared)
// ---------------------------------------------------------------------------------------------
const VALUES_A = [
  ['#fff6e0', 'ground (page, projector, phone)', 'tokens.css --color-ground-warm'],
  ['#ffffff', 'cards, fields, name chips', 'tokens.css --surface-tile'],
  ['#14142b', 'ink: text, outlines, shadows, top bars', 'tokens.css --color-line-strong'],
  ['#3d3b5c', 'secondary text', 'tokens.css --color-muted'],
  ['#ffcc00', 'action, passed names, step numbers, code band', 'tokens.css --accent-gold'],
  ['#ff3d7f', 'game card, error outline and icon', 'tokens.css --accent-punch'],
  ['#c9c3a8', 'ad slot dashed line (setup only)', 'tokens.css --ad-line'],
  ['2.5px / 3px', 'outline: phone and setup / projector', '2.5px is ToolNameEntry.astro\'s; 3px PROPOSAL for the projector'],
  ['5px 5px 0 / 8px 8px 0', 'hard shadow: phone and setup / projector', '5px is ToolNameEntry.astro\'s; 8px PROPOSAL for the projector'],
  ['#3d3b5c on #fff6e0, dashed outline, line-through', 'a name that did not pass', 'tokens.css values; the combination is a PROPOSAL'],
];
const VALUES_B = [
  ['#14142b', 'night ground, top of the gradient; ink text on gold', 'tokens.css --color-line-strong'],
  ['#23214d', 'raised surface: name pills, fields, cards; bottom of the night gradient', 'PROPOSAL (new colour)'],
  ['#ffffff', 'primary text on the night ground; the QR card', 'tokens.css --ink-light'],
  ['#d9d6f0', 'secondary text, field outlines', 'tokens.css --ink-on-band-soft'],
  ['#ffcc00', 'action, passed names, the round code', 'tokens.css --accent-gold'],
  ['#ff3d7f', 'error outline and icon', 'tokens.css --accent-punch'],
  ['#9a97c0', 'a name that did not pass (plus line-through)', 'PROPOSAL (new colour)'],
  ['0 0 16px..60px rgba(255,204,0,0.45)', 'gold glow on passed names and the code card', 'PROPOSAL (new value)'],
  ['rgba(20,20,43,0.78)', 'veil over the field while the round code shows', 'PROPOSAL (ink at 78%)'],
  ['#fff6e0 / #ffffff / #14142b / #3d3b5c / #c9c3a8', 'the setup page (a cream site page in B too)', 'tokens.css, as in A'],
];
// gh#302 REFUTE F3 (round 2): the picked direction's VALUES table is a list of ROLES. Each role names the elements
// it covers (a CSS selector list) and the only values those elements may render. render-boards.mjs checks every
// rendered element of a picked frame, and its ::before and ::after: each value must be allowed by a role the element
// matches, and an element that renders a design value but matches no role fails. Borders declared 2.5px render 2px in
// Chrome at a device pixel ratio of 1, so their token reads 2px. "*" text roles grant a text colour only.
const T = 'tokens.css';
const INK = '#14142b', GOLD = '#ffcc00', CREAM = '#fff6e0', WHITE = '#ffffff', MUTED = '#3d3b5c', PINK = '#ff3d7f';
const box = (bg, bw, bc, rad, sh) => [bg && `background-color:${bg}`, bw && `border-width:${bw}`, bc && `border-color:${bc}`, rad && `radius:${rad}`, sh && `box-shadow:${sh}`].filter(Boolean);
const HARD5 = `${INK} 5px 5px 0px 0px`;
const PICKED_VALUES = {
  setup: [
    ['page ground', '.su', box(CREAM), `${T} --color-ground-warm`],
    ['step card', '.su .step', box(WHITE, '2px', INK, '20px', HARD5), 'ToolNameEntry.astro (card; 2.5px renders 2px)'],
    ['step number', '.su .num', box(GOLD, '2px', INK, '50%'), `${T} --accent-gold`],
    ['field-like control', '.su :is(.field, .ta, .val, .sb, .btn2, .jrow, .seg > span)', box(WHITE, '2px', INK, '12px'), 'ToolNameEntry.astro (field)'],
    ['selected roster mode', '.su .seg > span.on', [...box(GOLD), `box-shadow:${INK} 3px 3px 0px 0px`], 'PICKED 2026-11-11'],
    ['locked schedule box', '.su .val.lock', [...box(CREAM), 'border-style:dashed'], 'PICKED 2026-11-11'],
    ['invalid schedule box', '.su .val.err', box(null, '3px', PINK), `${T} --accent-punch`],
    ['delete button in a review row', '.su .del', box(CREAM, '2px', INK, '10px'), 'PICKED 2026-11-11'],
    ['start button', '.su .go', box(GOLD, '2px', INK, '16px', HARD5), `${T} --accent-gold`],
    ['ad slot', '.su .ad-slot', [...box(null, '3px', '#c9c3a8', '16px'), 'border-style:dashed'], 'index.astro (ad slot), --ad-line'],
    ['joined bar', '.su .bar', box(WHITE, '2px', INK, '999px'), 'PICKED 2026-11-11'],
    ['joined bar fill', '.su .bar > i', box(GOLD), `${T} --accent-gold`],
    ['text, ink (default)', '*', [`color:${INK}`], `${T} --color-line-strong`],
    ['text, secondary', '.su :is(.lead, .hint, .lab, .count > span, .sx, .ju, .more, .ad-slot), .su :is(.lead, .hint, .count > span) *', [`color:${MUTED}`], `${T} --color-muted`],
    ['error icon', '.su .emsg svg *', [`fill:${PINK}`, `fill:${INK}`, `stroke:${INK}`], `${T} --accent-punch, ink`],
    ['arrows and stepper icons', '.su :is(.arr, .sb) svg *', [`stroke:${INK}`], 'ink'],
  ],
  phone: [
    ['page ground', '.ph', box(CREAM), `${T} --color-ground-warm`],
    ['header bar', '.ph .top', box(INK), `${T} --color-line-strong`],
    ['header text', '.ph .top > span:not(.me), .ph .top > span:not(.me) *', [`color:${WHITE}`], `${T} --ink-light`],
    ['name pill', '.ph .top .me', box(GOLD, null, null, '999px'), `${T} --accent-gold`],
    ['name card', '.ph .box', box(WHITE, '2px', INK, '20px', HARD5), 'ToolNameEntry.astro (card)'],
    ['prize card', '.ph .prize', box(GOLD, '2px', INK, '20px', HARD5), `${T} --accent-gold`],
    ['field, PIN box', '.ph :is(.inp, .pins > span)', box(WHITE, '2px', INK, '12px'), 'ToolNameEntry.astro (field)'],
    ['field in error', '.ph .inp.err', box(null, '3px', PINK), `${T} --accent-punch`],
    ['button', '.ph .btn', box(GOLD, '2px', INK, '16px', HARD5), `${T} --accent-gold`],
    ['passed badge', '.ph .badge.pass', box(GOLD, '3px', INK, '50%', HARD5), `${T} --accent-gold`],
    ['playing card', '.ph .pcard', box(WHITE, '2px', INK, '14px', HARD5), 'PICKED 2026-11-11'],
    ['text, ink (default)', '*', [`color:${INK}`], `${T} --color-line-strong`],
    ['text, secondary', '.ph :is(.sub, .note), .ph :is(.sub, .note) *', [`color:${MUTED}`], `${T} --color-muted`],
    ['error icon', '.ph .emsg svg *', [`fill:${PINK}`, `fill:${INK}`, `stroke:${INK}`], `${T} --accent-punch, ink`],
    ['badge tick, the club', '.ph :is(.badge, .pcard) svg *', [`stroke:${INK}`, `fill:${INK}`], 'ink'],
  ],
  projector: [
    ['night ground', '.pj', ['background-image:linear-gradient(#14142b 0%, #23214d 100%)'], `${T} --color-line-strong to #23214d (PICKED)`],
    ['event name, secondary labels', '.pj :is(.ev, .jh, .pk, .lk, .rt, .flow small, .codebox .ck, .pz, .claim)', ['color:#d9d6f0'], `${T} --ink-on-band-soft`],
    ['round dot', '.pj .dots i', box(null, '3px', '#d9d6f0', '50%'), `${T} --ink-on-band-soft`],
    ['final-round dot', '.pj .dots i.fin', box(null, null, null, '999px'), 'pill'],
    ['completed-round dot', '.pj .dots i.done', box('#d9d6f0'), `${T} --ink-on-band-soft`],
    ['current-round dot', '.pj .dots i.on', [...box(GOLD, null, GOLD), 'box-shadow:rgba(255,204,0,0.45) 0px 0px 18px 0px'], `${T} --accent-gold; glow PICKED`],
    ['name pill', '.pj .chip', ['background-color:#23214d', 'radius:999px', `color:${WHITE}`], '#23214d PICKED 2026-11-11'],
    ['passed name pill', '.pj .chip.in', [`background-color:${GOLD}`, `color:${INK}`, 'box-shadow:rgba(255,204,0,0.45) 0px 0px 16px 0px'], `${T} --accent-gold; glow PICKED`],
    ['name that did not pass', '.pj .chip.out', ['color:#9a97c0', 'box-shadow:#23214d 0px 0px 0px 2px inset'], '#9a97c0 PICKED 2026-11-11'],
    ['gold figures: game name, code, PIN', '.pj :is(.gname, .digits, .pv, .flow .to, .spot .wn)', [`color:${GOLD}`], `${T} --accent-gold`],
    ['glow on gold counts and the PIN', '.pj :is(.flow .to, .pv)', ['text-shadow:rgba(255,204,0,0.45) 0px 0px 24px'], 'PICKED 2026-11-11'],
    ['glow on the prize-1 winner', '.pj .spot .wn', ['text-shadow:rgba(255,204,0,0.45) 0px 0px 30px'], 'PICKED 2026-11-11'],
    ['arrow', '.pj .flow svg *', [`stroke:${GOLD}`], `${T} --accent-gold`],
    ['veil under a code', '.pj .veil', ['background-color:rgba(20,20,43,0.78)'], 'PICKED 2026-11-11'],
    ['code card', '.pj .codebox', [...box('#23214d', '3px', GOLD, '24px'), 'box-shadow:rgba(255,204,0,0.45) 0px 0px 60px 0px'], 'PICKED 2026-11-11'],
    ['QR card', '.pj .qrcard', [...box(WHITE, null, null, '24px'), 'box-shadow:rgba(255,204,0,0.45) 0px 0px 60px 0px'], 'PICKED 2026-11-11'],
    ['QR modules', '.pj .qrcard svg *', [`fill:${WHITE}`, `fill:${INK}`], 'ink on white'],
    ['winner card', '.pj .wcard', box('#23214d', null, null, '24px'), 'PICKED 2026-11-11'],
    ['text, white (default)', '*', [`color:${WHITE}`], `${T} --ink-light`],
  ],
};
function pickedTable(dir) {
  return `<table class="tbl" data-values-dir="${dir}"><tr><th>role</th><th>elements (selector)</th><th>the only values they may render</th><th>source</th></tr>${PICKED_VALUES[BOARD].map(([role, sel, tok, src]) => `<tr data-sel="${esc(sel)}" data-v="${esc(tok.join('|'))}"><td>${esc(role)}</td><td>${esc(sel)}</td><td>${tok.map(esc).join('<br>')}</td><td>${esc(src)}</td></tr>`).join('')}</table>`;
}

function valuesRow() {
  // On a board whose pick is this direction, its PROPOSAL values are now picked values.
  const src = (dir, v) => (PICK === dir && v.startsWith('PROPOSAL') ? `PICKED ${PICKED_ON} (was ${v})` : v);
  const t = (dir, rows) => `<table class="tbl"><tr><th>value</th><th>where</th><th>source</th></tr>${rows.map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(src(dir, r[2]))}</td></tr>`).join('')}</table>`;
  return `
  <div class="brow">
    <h2>VALUES · the picked direction: one row per role, each with its elements and the only values they may render (checked per element by the render); the other: as proposed</h2>
    <p class="why"><b>Fonts, both directions:</b> Mitr 600/700 (headings, numbers, buttons) and Sarabun 400/700 (body, names), the self-hosted files src/styles/fonts.css declares. No new face. <b>Radii:</b> 12px fields and 20px cards on the phone and setup (ToolNameEntry.astro's), 24px projector cards (PROPOSAL), 999px pills in B (PROPOSAL shape${PICK === 'B' ? `, PICKED ${PICKED_ON}` : ''}). <b>Tap sizes:</b> 52px buttons and fields, 64px PIN boxes, 48px steppers, 44px delete buttons (the --tap-min floor).</p>
    <div class="cands"><div class="cand"><div class="tag"><span class="d">A · POSTER</span>${resPill('A')}values</div>${PICK === 'A' ? pickedTable('A') : t('A', VALUES_A)}</div><div class="cand"><div class="tag"><span class="d">B · NIGHT STAGE</span>${resPill('B')}values</div>${PICK === 'B' ? pickedTable('B') : t('B', VALUES_B)}</div></div>
  </div>`;
}
const PAIRS_A = [['#14142b', '#fff6e0', 'ink text on the ground'], ['#14142b', '#ffffff', 'ink on cards and chips'], ['#14142b', '#ffcc00', 'ink on gold (passed names, buttons, code band)'], ['#3d3b5c', '#fff6e0', 'secondary text on the ground'], ['#3d3b5c', '#ffffff', 'secondary text on cards'], ['#ffffff', '#14142b', 'white on the ink top bar'], ['#14142b', '#ff3d7f', 'ink on the pink game card'], ['#ff3d7f', '#fff6e0', 'error outline on the ground (non-text, 3:1)']];
const PAIRS_B = [['#ffffff', '#14142b', 'white on the night ground'], ['#ffffff', '#23214d', 'white on pills and cards'], ['#d9d6f0', '#14142b', 'secondary text on the ground'], ['#d9d6f0', '#23214d', 'secondary text on cards'], ['#ffcc00', '#14142b', 'gold on the ground (round code, numbers)'], ['#ffcc00', '#23214d', 'gold on cards'], ['#14142b', '#ffcc00', 'ink on gold (passed names, buttons)'], ['#9a97c0', '#14142b', 'a name that did not pass (top of the gradient)'], ['#9a97c0', '#23214d', 'a name that did not pass (bottom of the gradient)'], ['#ff3d7f', '#23214d', 'error outline on a field (non-text, 3:1)']];
function contrastTable(pairs) {
  return `<table class="tbl"><tr><th>text</th><th>on</th><th>ratio</th><th>use</th></tr>${pairs.map(([f, b, u]) => `<tr><td>${f}</td><td>${b}</td><td>${ratio(f, b).toFixed(2)}:1</td><td>${esc(u)}</td></tr>`).join('')}</table>`;
}

function rulesRow(group, items) {
  return `
  <div class="brow">
    <h2>RULES CHECKED · ui-ux-pro-max 2.13.0 (design input, gh#299 owner ruling 2026-11-11)</h2>
    <p class="why">Queried 2026-11-11, one intent per query, rules taken and never its palette or fonts: --domain ux "projector legibility contrast large display distance", "touch target size mobile", "reduced motion", "form error validation inline message", "color not only indicator"; --stack threejs "webgl fallback performance mobile", "context lost dispose pixel ratio"; --stack astro "islands client hydration static". No --persist, no --design-system. Contrast ratios below are computed from the hex values (WCAG 2.x luminance), not measured on a projector.</p>
    <div class="pin"><b>${group}, both directions:</b><ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul></div>
    <div class="cands"><div class="cand"><div class="tag"><span class="d">A · POSTER</span>contrast</div>${contrastTable(PAIRS_A)}</div><div class="cand"><div class="tag"><span class="d">B · NIGHT STAGE</span>contrast</div>${contrastTable(PAIRS_B)}</div></div>
  </div>`;
}

function copyRow() {
  const rows = [...REG.entries()].map(([text, { role, src }]) => `<tr><td>${esc(role)}</td><td class="thc">${esc(text)}</td><td>${esc(SRC[src])}</td></tr>`).join('');
  const names = [...NAMES];
  const sampleNames = names.slice(0, 8).map(esc).join(' · ');
  return `
  <div class="brow">
    <h2>COPY SOURCES · every Thai string on this board, and where it comes from</h2>
    <p class="why">No src copy existed for this feature, so almost every string is new. <b>Approved by the owner on 2026-11-11 as it stands.</b> Wording rules: gh#299, Constraints, Gambling wording. Strings in a frame: ${REG.size} distinct, plus ${names.length} distinct sample names (below).</p>
    <table class="tbl"><tr><th>role</th><th>string</th><th>source</th></tr>${rows}<tr><td>sample roster (${names.length} names)</td><td class="thc">${sampleNames} …</td><td>${esc(SRC.sample)}; 40 nicknames x 5 initials, one replaced by ${esc(CAP_NAME)} (12 grapheme clusters, the owner\'s name cap)</td></tr></table>
  </div>`;
}

function notesRow(lines) {
  return `
  <div class="brow">
    <h2>NOTES · decisions it rests on, what is not covered, what was not drawn</h2>
    ${lines.map((l) => `<p class="why">${l}</p>`).join('\n    ')}
  </div>`;
}

const OWNER_PIN = `<div class="pin q"><b>DECISIONS FOR THE OWNER (answered 2026-11-11, see APPROVAL RESULT above; the questions stay as history):</b><ul>
  <li><b>1. Direction</b>: A POSTER or B NIGHT STAGE, whole event; or a mix per surface (questions 2 to 4).</li>
  <li><b>2. Projector ground</b> (Gh302Projector): A light cream with ink outlines, or B dark night with lit names.</li>
  <li><b>3. Round code on the projector</b> (Gh302Projector, frame proj-code): A a gold band across the bottom 300px, the field's upper rows still in view above it; or B a centred card over the whole field, veiled.</li>
  <li><b>4. Setup layout</b> (Gh302Setup): A one column of four numbered steps, the ad under the lead; or B a form beside a dark summary panel holding the start button, the ad under the form.</li>
  <li><b>5. Phone page</b> (Gh302Phone): A light, or B dark (gentler in a dimmed hall).</li>
  <li><b>6. Proposed copy</b>: approve, or mark the strings to change (COPY SOURCES row).</li>
  <li><b>7. Two proposed numbers</b> the frames are drawn at: a name cap of 12 (asked as code points; the owner\'s cap is 12 grapheme clusters, UAX #29, enforced by gh#308), and a round code drawn as 6 digits (its real format is gh#300's to prove).</li>
</ul></div>`;

function nameFitRow(scope, surfaces) {
  const rows = surfaces.map(([k, where]) => {
    const fits = Object.entries(FITS).filter(([key]) => key.startsWith(`${k}|`)).map(([key, v]) => { const [, w, n] = key.split('|'); return `${n === LATIN_W ? 'W x12' : n === THAI_W ? 'U+0E12 x12' : n === THAI_M ? 'U+0E12 U+0E33 x12' : n}${w !== '0' ? ` at ${w}` : ''}: ${k === 'inpA' ? 'scrolls' : v < FLOOR[k] ? `${FLOOR[k]}px, 2 lines` : `${Math.min(v, SURF[k])}px`}`; }).join(', ');
    return `<tr><td>${esc(where)}</td><td>${SURF[k]}px</td><td>${floorOf(k)}px</td><td>${esc(fits || 'fits at its size')}</td></tr>`;
  }).join('');
  return `
  <div class="brow">
    <h2>NAME FIT · ${scope} · the rule, and the widest names drawn</h2>
    <p class="why"><b>Rule.</b> The owner\'s name limit is <b>12 grapheme clusters</b> (UAX #29; gh#308 counts them with Intl.Segmenter, so a letter with its marks is one cluster, as gh#304 does). A name is never clipped and never truncated. Each surface below has a size and a floor. A name renders at the size; if the name plus 2% slack does not fit its box, it shrinks in 1px steps; at the floor it wraps onto a second line, and every surface is sized to hold two lines at its floor (the name field instead scrolls, as a typed input does). <b>Floors:</b> each surface\'s smallest allowed size, a legibility minimum for its viewing distance; a name that does not fit on one line at its floor wraps. The widest names drawn: <b>${esc(LATIN_W)}</b> (W, the widest Latin letter) and <b>${esc(THAI_W)}</b> (U+0E12, the widest Thai letter); the 2% slack covers letters wider in one face only (U+0E13 in Sarabun 700, m in Sarabun 400, both within 1%). <b>Marks:</b> Thai above and below marks stack inside their cluster and add no width, but U+0E33 (SARA AM) is a spacing mark that joins its cluster and adds width: <b>${esc(THAI_M)}</b> is 12 clusters and measures 58% wider than U+0E12 x12 (Sarabun 700 at 20px: 333 vs 210px). It is drawn. Which names wrap where is in the table below. <b>This fit depends on gh#308\'s join rules, enforced by the server:</b> names allow-listed to Thai and ASCII letters and digits, space and <code>. - \' _</code>; at most 3 code points per grapheme cluster; at most one U+0E33 per cluster, and only after a Thai consonant or tone mark. Under those rules the 12-cluster U+0E12 U+0E33 x12 is the widest valid Thai name (U+0E13 U+0E33 x12 is 0.6% wider in Sarabun 700, inside the slack), and a run of repeated U+0E33, which UAX #29 keeps as one cluster, is refused at join, so it is not a fit case. Were the rules loosened, this table would no longer hold. The render fails if any name clips, wraps above its floor or onto a third line, loses its slack while on one line, or renders below its floor.</p>
    <table class="tbl nums"><tr><th>surface</th><th>size</th><th>floor</th><th>names the rule shrinks on this board (size each fits at, or floor + 2 lines)</th></tr>${rows}</table>
  </div>`;
}

function boardDoc(group, headLines, frameCss, rows, tail) {
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

    /* gh#302: proposal board, ADR-0033. Generated by docs/verification/evidence/gh302-boards-2026-11-11/make-boards.mjs;
       edit the generator, not this file. Annotations are English and monospace. Every Thai string in a frame is owner-approved copy (2026-11-11)
       unless COPY SOURCES says verbatim. Frame values are literals (VALUES row: token or PROPOSAL). */${ANNOT_CSS}
${frameCss}
  </style>
</helmet>

<div data-pick="${PICK ?? ''}" style="width: 1520px; background: #ffffff; color: #14142b;">
${header(group, headLines)}
${rows.join('\n')}
${tail}
</div>
</x-dc>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------------------------
// SETUP BOARD
// ---------------------------------------------------------------------------------------------
const SETUP_CSS = `
    /* ---- setup page frames, 1280 wide, both directions on the cream site page ---- */
    .su { position: relative; background: #fff6e0; color: #14142b; font-family: 'Sarabun', system-ui, sans-serif; }
    .su .h1 { margin: 0; font: 700 48px/1.2 'Mitr', 'Sarabun', sans-serif; }
    .su .lead { margin: 12px 0 0; font: 400 20px/1.6 'Sarabun', sans-serif; color: #3d3b5c; }
    .su .ad-slot { height: 250px; display: grid; place-items: center; border: 3px dashed #c9c3a8; border-radius: 16px; color: #3d3b5c; font: 400 16px/1.4 'Sarabun', sans-serif; }
    .su .hint { margin: 0 0 12px; font: 400 16px/1.55 'Sarabun', sans-serif; color: #3d3b5c; }
    .su .row2 { display: flex; gap: 12px; align-items: center; }
    .su .sched { display: flex; align-items: flex-start; gap: 8px; }
    .su .sched .box { width: 118px; text-align: center; }
    .su .sched .val { box-sizing: border-box; height: 64px; display: grid; place-items: center; font: 700 30px/1 'Mitr', sans-serif; background: #ffffff; }
    .su .sched .val.lock { background: #fff6e0; border-style: dashed; }
    .su .sched .lab { margin-top: 6px; font: 400 16px/1.35 'Sarabun', sans-serif; color: #3d3b5c; }
    .su .sched .arr { height: 64px; display: grid; place-items: center; color: #14142b; }
    .su .sched .val.err { border: 3px solid #ff3d7f; }
    .su .emsg { display: flex; gap: 8px; align-items: flex-start; margin-top: 14px; font: 700 16px/1.5 'Sarabun', sans-serif; color: #14142b; }
    .su .emsg svg { flex: none; margin-top: 1px; }
    .su .stepper { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
    .su .stepper .sb { box-sizing: border-box; width: 48px; height: 48px; display: grid; place-items: center; background: #ffffff; }
    .su .stepper .sv { min-width: 48px; text-align: center; font: 700 32px/1 'Mitr', sans-serif; }
    .su .stepper .sx { font: 400 16px/1.4 'Sarabun', sans-serif; color: #3d3b5c; }
    .su .prize { display: grid; grid-template-columns: 116px 1fr; gap: 12px; align-items: center; margin-top: 10px; }
    .su .prize .pl { font: 600 17px/1.3 'Mitr', sans-serif; }
    .su .field { box-sizing: border-box; height: 52px; display: flex; align-items: center; padding: 0 16px; font: 400 18px/1 'Sarabun', sans-serif; background: #ffffff; }
    .su .ta { box-sizing: border-box; height: 290px; padding: 12px 16px; font: 400 18px/1.6 'Sarabun', sans-serif; white-space: pre; overflow: hidden; background: #ffffff; }
    .su .count { margin-top: 8px; display: flex; justify-content: space-between; font: 400 16px/1.4 'Sarabun', sans-serif; color: #3d3b5c; }
    .su .count b { color: #14142b; }
    .su .joined { display: flex; align-items: baseline; gap: 10px; font: 700 40px/1.1 'Mitr', sans-serif; }
    .su .joined .ju { font: 400 18px/1.4 'Sarabun', sans-serif; color: #3d3b5c; }
    .su .bar { height: 14px; border-radius: 999px; overflow: hidden; margin: 12px 0 16px; }
    .su .bar i { display: block; height: 100%; background: #ffcc00; }
    .su .jlist { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px 12px; }
    .su .jrow { box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; gap: 8px; height: 56px; padding: 0 5px 0 14px; font: 400 18px/1 'Sarabun', sans-serif; background: #ffffff; }
    .su .jrow .nm { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; }
    .su .jrow .nm[data-wrap] { white-space: normal; overflow-wrap: anywhere; line-height: 1.3; }
    .su .jrow .del { box-sizing: border-box; height: 44px; min-width: 56px; display: grid; place-items: center; font: 600 16px/1 'Mitr', sans-serif; background: #fff6e0; }
    .su .more { margin-top: 10px; font: 400 16px/1.4 'Sarabun', sans-serif; color: #3d3b5c; }
    .su .btn2 { box-sizing: border-box; height: 52px; padding: 0 20px; display: inline-grid; place-items: center; font: 600 18px/1 'Mitr', sans-serif; background: #ffffff; }

    /* A · POSTER: one column, 880 wide, numbered cards with ink outline and hard shadow (ToolNameEntry.astro's card values) */
    .su.dA .wrap { width: 880px; margin: 0 auto; padding: 48px 0 64px; }
    .su.dA .ad-slot { margin-top: 40px; }
    .su.dA .step { margin-top: 32px; background: #ffffff; border: 2.5px solid #14142b; border-radius: 20px; box-shadow: 5px 5px 0 #14142b; padding: 24px 28px; }
    .su.dA .step-h { display: flex; align-items: center; gap: 14px; margin: 0 0 14px; font: 600 24px/1.3 'Mitr', sans-serif; }
    .su.dA .num { box-sizing: border-box; width: 40px; height: 40px; border-radius: 50%; background: #ffcc00; border: 2.5px solid #14142b; display: grid; place-items: center; font: 700 20px/1 'Mitr', sans-serif; }
    .su.dA .field, .su.dA .ta, .su.dA .sched .val, .su.dA .stepper .sb, .su.dA .jrow, .su.dA .btn2 { border: 2.5px solid #14142b; border-radius: 12px; }
    .su.dA .sched .val.err { border: 3px solid #ff3d7f; }
    .su.dA .jrow .del { border: 2px solid #14142b; border-radius: 10px; }
    .su.dA .bar { border: 2px solid #14142b; background: #ffffff; }
    .su.dA .seg { display: flex; gap: 12px; margin-bottom: 16px; }
    .su.dA .seg > span { box-sizing: border-box; flex: 1; height: 52px; display: grid; place-items: center; border: 2.5px solid #14142b; border-radius: 12px; font: 600 18px/1 'Mitr', sans-serif; background: #ffffff; }
    .su.dA .seg > span.on { background: #ffcc00; box-shadow: 3px 3px 0 #14142b; }
    .su.dA .go { margin-top: 40px; box-sizing: border-box; height: 64px; display: grid; place-items: center; background: #ffcc00; border: 2.5px solid #14142b; border-radius: 16px; box-shadow: 5px 5px 0 #14142b; font: 700 24px/1 'Mitr', sans-serif; }

    /* B · NIGHT STAGE on setup: form (left) + dark summary panel (right) holding the start button; flat cards */
    .su.dB .wrap { width: 1200px; margin: 0 auto; padding: 44px 0 64px; display: grid; grid-template-columns: 1fr 400px; gap: 0 40px; align-items: start; }
    .su.dB .intro { grid-column: 1 / -1; margin-bottom: 8px; }
    .su.dB .ad-slot { margin-top: 32px; }
    .su.dB .step { margin-top: 24px; background: #ffffff; border: 2px solid #d9d6f0; border-radius: 16px; padding: 24px 28px; }
    .su.dB .step-h { display: flex; align-items: center; gap: 12px; margin: 0 0 14px; font: 600 22px/1.3 'Mitr', sans-serif; }
    .su.dB .num { width: 34px; height: 34px; border-radius: 50%; background: #14142b; color: #ffffff; display: grid; place-items: center; font: 700 18px/1 'Mitr', sans-serif; }
    .su.dB .field, .su.dB .ta, .su.dB .sched .val, .su.dB .stepper .sb, .su.dB .jrow, .su.dB .btn2 { border: 2px solid #3d3b5c; border-radius: 10px; }
    .su.dB .sched .val.err { border: 3px solid #ff3d7f; }
    .su.dB .sched .box { width: 100px; }
    .su.dA .sched .val.lock, .su.dB .sched .val.lock { border-style: dashed; }
    .su.dB .jrow .del { border: 2px solid #3d3b5c; border-radius: 999px; }
    .su.dB .bar { background: #d9d6f0; }
    .su.dB .seg { display: flex; padding: 4px; margin-bottom: 16px; border: 2px solid #14142b; border-radius: 999px; }
    .su.dB .seg > span { flex: 1; height: 48px; display: grid; place-items: center; border-radius: 999px; font: 600 18px/1 'Mitr', sans-serif; }
    .su.dB .seg > span.on { background: #14142b; color: #ffffff; }
    .su.dB .panel { position: relative; margin-top: 24px; background: #14142b; color: #ffffff; border-radius: 20px; padding: 24px; }
    .su.dB .panel .ph { font: 600 20px/1.3 'Mitr', sans-serif; margin-bottom: 14px; }
    .su.dB .mini { height: 198px; border-radius: 12px; background: linear-gradient(180deg, #14142b 0%, #23214d 100%); box-shadow: inset 0 0 0 2px #23214d; padding: 14px 16px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; }
    .su.dB .mini .me { font: 600 16px/1.3 'Mitr', sans-serif; color: #d9d6f0; }
    .su.dB .mini .mn { font: 700 54px/1 'Mitr', sans-serif; color: #ffcc00; }
    .su.dB .mini .mk { font: 400 16px/1.3 'Sarabun', sans-serif; color: #d9d6f0; }
    .su.dB .sum { margin: 18px 0 0; display: grid; grid-template-columns: auto 1fr; gap: 8px 14px; font: 400 17px/1.4 'Sarabun', sans-serif; }
    .su.dB .sum dt { color: #d9d6f0; }
    .su.dB .sum dd { margin: 0; font-weight: 700; text-align: right; }
    .su.dB .go { margin-top: 22px; height: 60px; display: grid; place-items: center; background: #ffcc00; color: #14142b; border-radius: 999px; font: 700 22px/1 'Mitr', sans-serif; }
    .su.dB .pn { margin-top: 12px; font: 400 16px/1.5 'Sarabun', sans-serif; color: #d9d6f0; }`;

function schedEditor(dir, { err = false, from = 200 } = {}) {
  const vals = [from, 100, err ? 120 : 50, 20, 5];
  const labs = [th('เริ่ม', 'schedule: first box'), th('หลังรอบ 1', 'schedule: box label'), th('หลังรอบ 2', 'schedule: box label'), th('หลังรอบ 3', 'schedule: box label'), th('รอบชิง', 'schedule: final box')];
  let h = '<div class="sched">';
  vals.forEach((v, i) => {
    const cls = i === 0 || i === 4 ? 'val lock' : err && i === 2 ? 'val err' : 'val';
    h += `<div class="box"><div class="${cls} tap">${v}</div><div class="lab">${labs[i]}<br>${v} ${th('คน', 'unit: people')}</div></div>`;
    if (i < 4) h += `<div class="arr">${svg.arrow(26)}</div>`;
  });
  h += '</div>';
  if (err) h += `<div class="emsg" role="alert">${svg.alert(22)}<span>${th('หลังรอบ 2 ต้องน้อยกว่าหลังรอบ 1 (100 คน)', 'schedule: inline error')}</span></div>`;
  h += `<div class="row2" style="margin-top:16px;"><span class="btn2 tap">${th('ใช้ค่าที่ระบบเสนอ', 'schedule: reset button')}</span><span class="hint" style="margin:0;">${th('ช่องเส้นประแก้ไม่ได้ เริ่มตามจำนวนคน จบที่ 5 คนในรอบชิง', 'schedule: locked boxes hint')}</span></div>`;
  return h;
}

function setupSteps(dir, mode) {
  const num = (n) => `<span class="num">${n}</span>`;
  const s1 = `<section class="step"><h2 class="step-h">${num(1)}${th('ชื่องาน', 'step 1 heading')}</h2><p class="hint">${th('ขึ้นบนจอใหญ่ตลอดงาน', 'step 1 hint')}</p><div class="field tap">${th(EVENT, 'event name (typed by the MC)', 'sample')}</div></section>`;
  const seg = `<div class="seg"><span class="tap${mode === 'admin' ? ' on' : ''}">${th('พิมพ์รายชื่อเอง', 'roster mode: admin types')}</span><span class="tap${mode === 'qr' ? ' on' : ''}">${th('ให้สแกน QR เข้าร่วม', 'roster mode: QR join')}</span></div>`;
  let s2;
  if (mode === 'admin') {
    s2 = `<section class="step"><h2 class="step-h">${num(2)}${th('รายชื่อคนในงาน', 'step 2 heading')}</h2>${seg}<p class="hint">${th('ใส่เฉพาะคนที่มาถึงงานแล้ว ใช้จอใหญ่จอเดียว ไม่ต้องใช้มือถือ', 'admin mode hint')}</p><div class="ta${dir === PICK ? ' nm" data-fit="multi"' + nmAttr('taA', '') : '"'}>${(dir === PICK ? EV.joinList.slice(0, 9) : ROSTER.slice(0, 9)).map(nm).join('\n')}</div><div class="count"><span>${th('ชื่อเล่นหรือชื่อจริงก็ได้ บรรทัดละ 1 ชื่อ', 'admin mode: line rule')}</span><b>${dir === PICK ? EV.field.length : 200} ${th('ชื่อ', 'unit: names')}</b></div></section>`;
  } else {
    const list = (dir === PICK ? EV.joinList : JOINED).slice(0, 15).map((n) => `<div class="jrow"><span class="nm"${dir === PICK ? nmAttr('jrowA', n) : ''}>${nm(n)}</span><span class="del tap">${th('ลบ', 'review: delete button')}</span></div>`).join('');
    s2 = `<section class="step"><h2 class="step-h">${num(2)}${th('รายชื่อคนในงาน', 'step 2 heading')}</h2>${seg}
      <div class="row2" style="margin-bottom:16px;"><span class="hint" style="margin:0;">${th('จำนวนคนในงาน', 'QR mode: head count label')}</span><span class="field tap" style="width:120px;">200</span><span class="btn2 tap">${th('เปิดหน้า QR บนจอใหญ่', 'QR mode: show lobby button')}</span></div>
      <div class="joined">${th('เข้าร่วมแล้ว', 'review: joined label')} 196 / 200 <span class="ju">${th('คน · ยังขาด 4 คน', 'review: joined unit and gap')}</span></div>
      <div class="bar"><i style="width:98%"></i></div>
      <p class="hint">${th('ตรวจรายชื่อก่อนเริ่ม ชื่อไหนไม่ใช่คนในงาน กดลบได้ 1 เครื่องเข้าร่วมได้ 1 ชื่อ', 'review: hint')}</p>
      <div class="jlist">${list}</div><div class="more">${th('เลื่อนดูอีก 181 ชื่อ', 'review: more rows')}</div></section>`;
  }
  const s3 = `<section class="step"><h2 class="step-h">${num(3)}${th('ตารางคัดออก', 'step 3 heading')}</h2><p class="hint">${th('ระบบเสนอให้จากจำนวนคน แก้ตัวเลขได้ก่อนเริ่มงาน 4 รอบคัดออก แล้วรอบชิง 5 คน', 'step 3 hint')}</p>${schedEditor(dir, { from: mode === 'qr' || dir === PICK ? 196 : 200 })}</section>`;
  const prizes = PRIZES.map((p, i) => `<div class="prize"><span class="pl">${th(`รางวัลที่ ${i + 1}`, 'prize label')}</span><span class="field tap">${th(p, 'prize name (typed by the MC)', 'sample')}</span></div>`).join('');
  const s4 = `<section class="step"><h2 class="step-h">${num(4)}${th('รางวัล', 'step 4 heading')}</h2><div class="stepper"><span class="sb tap">${svg.minus()}</span><span class="sv">5</span><span class="sb tap">${svg.plus()}</span><span class="sx">${th('รางวัล (1 ถึง 5)', 'prize count range')}</span></div><p class="hint">${th('ตั้งชื่อรางวัลที่จะขึ้นจอ', 'step 4 hint')}</p>${prizes}</section>`;
  return { s1, s2, s3, s4 };
}

function setupFrame(dir, mode) {
  const intro = `<h1 class="h1">${th('จับรางวัลปีใหม่', 'h1')}</h1><p class="lead">${th('คัดออกทีละรอบจนเหลือ 5 คนสุดท้าย แล้วชิงรางวัลบนจอใหญ่ ทุกคนมีโอกาสเท่ากันทุกรอบ', 'lead')}</p>`;
  const ad = `<div class="ad-slot">${th('ช่องโฆษณา', 'ad slot placeholder', 'home')}</div>`;
  const { s1, s2, s3, s4 } = setupSteps(dir, mode);
  const startLabel = mode === 'qr' ? th('เริ่มด้วย 196 คน', 'start button (QR mode)') : th('เริ่มงาน', 'start button');
  const stub = `<div class="stub">site chrome (PageChrome.astro, unchanged) · not drawn</div>`;
  const id = mode === 'qr' ? 'setup-qr' : 'setup-admin';
  if (dir === 'A') {
    const body = mode === 'qr' ? `${s2}<div class="go tap">${startLabel}</div>` : `${intro}${ad}${s1}${s2}${s3}${s4}<div class="go tap">${startLabel}</div>`;
    return `<div class="su dA" data-frame="${id}" data-dir="A" style="width:1280px;">${mode === 'admin' ? stub : ''}<div class="wrap"${mode === 'qr' ? ' style="padding-top:8px;"' : ''}>${body}</div></div>`;
  }
  const panel = `<aside class="panel"><div class="ph">${th('สรุปงาน', 'summary panel heading')}</div><div class="mini"><span class="me">${th(EVENT, 'event name (typed by the MC)', 'sample')}</span><span class="mn">${mode === 'qr' ? 196 : 200}</span><span class="mk">${th('จอใหญ่จะเห็นแบบนี้', 'summary: preview caption')}</span></div>
      <dl class="sum"><dt>${th('คนในงาน', 'summary: people')}</dt><dd>${mode === 'qr' ? 196 : 200}</dd><dt>${th('รอบคัดออก', 'summary: rounds')}</dt><dd>4</dd><dt>${th('รอบชิง', 'schedule: final box')}</dt><dd>5 ${th('คน', 'unit: people')}</dd><dt>${th('รางวัล', 'step 4 heading')}</dt><dd>5</dd></dl>
      <div class="go tap">${startLabel}</div><p class="pn">${th('จอใหญ่ไม่มีโฆษณา', 'summary: no ads on the projector')}</p></aside>`;
  const left = mode === 'qr' ? `<div>${s2}</div>` : `<div>${s1}${s2}${s3}${s4}${ad}</div>`;
  return `<div class="su dB" data-frame="${id}" data-dir="B" style="width:1280px;">${mode === 'admin' ? stub : ''}<div class="wrap"${mode === 'qr' ? ' style="padding-top:8px;"' : ''}>${mode === 'admin' ? `<div class="intro">${intro}</div>` : ''}${left}<div>${panel}</div></div></div>`;
}

function setupErrFrame(dir) {
  const head = dir === 'A' ? '<span class="num">3</span>' : '<span class="num">3</span>';
  const w = dir === 'A' ? 880 : 760;
  return `<div class="su d${dir}" data-frame="setup-schedule-error" data-dir="${dir}" style="width:${w + 60}px; padding: 4px 30px 30px; box-sizing: border-box;"><section class="step"><h2 class="step-h">${head}${th('ตารางคัดออก', 'step 3 heading')}</h2><p class="hint">${th('ระบบเสนอให้จากจำนวนคน แก้ตัวเลขได้ก่อนเริ่มงาน 4 รอบคัดออก แล้วรอบชิง 5 คน', 'step 3 hint')}</p>${schedEditor(dir, { err: true })}</section>
    <div class="emsg" style="margin-top:18px;">${svg.alert(22)}<span>${th('แก้ตารางคัดออกก่อน แล้วจึงเริ่มงานได้', 'start disabled reason')}</span></div></div>`;
}

function buildSetup() {
  REG = new Map(); NAMES = new Set(); PICK = 'A'; BOARD = 'setup';
  const rows = [];
  rows.push(`
  <div class="brow">
    <h2>SETUP · admin-typed roster · the whole page at 1280 (the MC's laptop)</h2>
    <p class="why">One page runs setup; the projected frames follow it (Gh302Projector). The ad slot sits on this page only (gh#299 decision 10), with the home page's own desktop values. Admin-typed mode uses the big screen alone, no phones (decision 4); the roster holds only people present, so there is no replace control (decision 8). The schedule is proposed from the head count and editable before the start (decision 6); prizes 1 to 5 with names, and the event name (decision 9).</p>
    <div class="cands col">
      <div class="cand">${tag('A', ' · setup-admin · 1280 · one column, ad under the lead, start at the end')}${setupFrame('A', 'admin')}</div>
      <div class="cand">${tag('B', ' · setup-admin · 1280 · form left, summary panel right with the start, ad under the form')}${setupFrame('B', 'admin')}</div>
    </div>
  </div>`);
  rows.push(`
  <div class="brow">
    <h2>SETUP · QR join · the review list before the start (step 2 in QR mode, same page)</h2>
    <p class="why">Joined count against head count, a delete per name, one name per device (decision 4). The start button names the count it starts with, so starting short is a visible choice, not a silent one. Shown: the first 15 of 196 rows; the list scrolls. Steps 1, 3 and 4 and the ad are as in the frame above.</p>
    <div class="cands col">
      <div class="cand">${tag('A', ' · setup-qr · 1280 · roster card and start only')}${setupFrame('A', 'qr')}</div>
      <div class="cand">${tag('B', ' · setup-qr · 1280 · roster card and summary panel')}${setupFrame('B', 'qr')}</div>
    </div>
  </div>`);
  rows.push(`
  <div class="brow">
    <h2>SETUP · cut-schedule editor · an invalid edit</h2>
    <p class="why">The MC typed 120 after round 2, more than the 100 after round 1. The error sits under the row, names the box and the bound, and blocks the start with a stated reason (rules row: error placement, error messages). The first and last boxes are locked: dashed outline plus the hint, not colour alone.</p>
    <div class="cands">
      <div class="cand">${tag('A', ' · setup-schedule-error · step 3 card')}${setupErrFrame('A')}</div>
      <div class="cand">${tag('B', ' · setup-schedule-error · step 3 card')}${setupErrFrame('B')}</div>
    </div>
  </div>`);
  rows.push(nameFitRow('Setup (A, picked)', [['jrowA', 'a review-list row, Sarabun 400, beside its delete button'], ['taA', 'the typed roster, one name a line, Sarabun 400']]));
  const tail = [
    rulesRow('Setup page', [
      'Touch Target Size (44pt iOS / 48dp Android): fields and buttons 52px tall; the roster-mode toggle 52px in A, 48px inside B\'s 4px-padded pill; steppers 48px, start 60 to 64px; the review list\'s delete buttons 44px (the --tap-min floor) inside 56px rows.',
      'Touch Spacing (8px minimum): 8px between review rows, 12px between A\'s two toggle buttons (B\'s is one segmented control, its halves touching), 8px between schedule boxes.',
      'Error Placement + Error Messages: the schedule error sits under the boxes, names the field and the bound, role=alert; code ties it with aria-describedby. Focusable Error Summary: the start\'s disabled reason repeats it at the button.',
      'Inline Validation: validate a schedule box on blur, not only at the start.',
      'Color Only: locked schedule boxes are dashed and explained in words; the active roster mode is filled and also the only one whose section shows.',
      'astro (zero JS by default, client directives, graceful degradation): the page and its ad slot are static markup; the form is the one island. The projected frames do not share this page\'s ad.',
    ]),
    valuesRow(), copyRow(),
    notesRow([
      '<b>Rests on gh#299:</b> decision 4 (two roster modes, review before the start), 6 (schedule), 8 (no replace), 9 (prizes 1 to 5, event name), 10 (ad on setup only). The first schedule box follows the roster (200 typed, or 196 joined).',
      '<b>Open question, not drawn:</b> in QR mode the MC reviews names on the laptop that feeds the projector. If the laptop mirrors its screen, the room watches deletions. A second window for the projector would avoid it; that is a build question for gh#304 and gh#308, raised here so the owner sees it.',
      '<b>Not drawn:</b> the setup page at phone width (it is a laptop task, but search will land phones here; the phone layout follows the picked direction\'s phone frames). The site chrome (stub). Hover and focus states.',
      '<b>Not covered:</b> real browsers other than headless Chrome; real AdSense (no publisher ID, gh#29).',
    ]),
  ].join('\n');
  return boardDoc('setup page', ['<b style="color: #ffcc00;">Approval result 2026-11-11 (owner popup): direction <b>A POSTER</b> is PICKED for the setup page; B NIGHT STAGE was NOT PICKED and its frames stay below as history. The proposed Thai copy is approved as it stands. Name limit: 12. The projector took B and the phone took A (their boards).</b>', ORDER_LINE, DIRECTIONS_LINE, OWNER_PIN], SETUP_CSS, rows, tail);
}

// ---------------------------------------------------------------------------------------------
// PROJECTOR BOARD
// ---------------------------------------------------------------------------------------------
const PROJ_CSS = `
    /* ---- projected frames, authored at 1920x1080 CSS px, shown at 75% (transform) ---- */
    .pj { position: relative; width: 1920px; height: 1080px; overflow: hidden; box-sizing: border-box; font-family: 'Sarabun', system-ui, sans-serif; }
    .pj .chip { display: flex; align-items: center; justify-content: center; white-space: nowrap; overflow: hidden; font: 400 20px/1 'Sarabun', sans-serif; }
    .pj .chip.in { font-weight: 700; }
    .pj .chip.out { text-decoration: line-through; }
    .pj .chip[data-wrap] { white-space: normal; overflow-wrap: anywhere; text-align: center; line-height: 1.05; }
    .pj .wn { overflow-wrap: anywhere; }

    /* A · POSTER */
    .pj.dA { background: #fff6e0; color: #14142b; }
    .pj.dA .top { height: 112px; box-sizing: border-box; background: #14142b; color: #ffffff; display: flex; align-items: center; justify-content: space-between; padding: 0 48px; }
    .pj.dA .ev { font: 700 44px/1.2 'Mitr', sans-serif; }
    .pj.dA .rounds { display: flex; align-items: center; gap: 12px; font: 600 30px/1 'Mitr', sans-serif; }
    .pj.dA .rounds .rl { margin-right: 14px; }
    .pj.dA .rounds .r { box-sizing: border-box; width: 60px; height: 60px; border-radius: 50%; border: 3px solid #ffffff; display: grid; place-items: center; font: 700 30px/1 'Mitr', sans-serif; }
    .pj.dA .rounds .r.on { background: #ffcc00; color: #14142b; border-color: #ffcc00; }
    .pj.dA .rounds .r.fin { width: auto; padding: 0 18px; border-radius: 999px; }
    .pj.dA .body { display: grid; grid-template-columns: 1fr 420px; gap: 32px; padding: 32px 48px 40px; height: 968px; box-sizing: border-box; }
    .pj.dA .stage { box-sizing: border-box; background: #ffffff; border: 3px solid #14142b; border-radius: 24px; box-shadow: 8px 8px 0 #14142b; padding: 20px; display: grid; grid-template-columns: repeat(9, 1fr); grid-auto-rows: 30px; gap: 5px 8px; align-content: start; }
    .pj.dA .chip { border: 2px solid #14142b; border-radius: 10px; background: #ffffff; }
    .pj.dA .chip.in { background: #ffcc00; }
    .pj.dA .chip.out { background: #fff6e0; color: #3d3b5c; border-style: dashed; }
    .pj.dA .side { display: flex; flex-direction: column; gap: 24px; }
    .pj.dA .card { background: #ffffff; border: 3px solid #14142b; border-radius: 24px; box-shadow: 8px 8px 0 #14142b; padding: 24px 28px; }
    .pj.dA .k { font: 600 30px/1.3 'Mitr', sans-serif; color: #3d3b5c; }
    .pj.dA .big { font: 700 150px/1 'Mitr', sans-serif; }
    .pj.dA .big small { font: 600 44px/1 'Mitr', sans-serif; margin-left: 8px; }
    .pj.dA .line { font: 400 30px/1.45 'Sarabun', sans-serif; }
    .pj.dA .line b { font-weight: 700; }
    .pj.dA .card.game { background: #ff3d7f; }
    .pj.dA .gname { font: 700 46px/1.2 'Mitr', sans-serif; }
    .pj.dA .legend { display: flex; flex-direction: column; gap: 12px; }
    .pj.dA .legend .chip { width: 150px; height: 44px; font-size: 30px; }
    .pj.dA .legend div { display: flex; align-items: center; gap: 16px; font: 400 30px/1 'Sarabun', sans-serif; }
    .pj.dA .codeband { position: absolute; left: 0; right: 0; bottom: 0; height: 300px; box-sizing: border-box; background: #ffcc00; border-top: 4px solid #14142b; display: grid; grid-template-columns: 380px 1fr 480px; align-items: center; padding: 0 56px; gap: 32px; }
    .pj.dA .codeband .ck { font: 700 44px/1.25 'Mitr', sans-serif; }
    .pj.dA .codeband .digits { font: 700 170px/1 'Mitr', sans-serif; letter-spacing: 6px; text-align: center; white-space: nowrap; }
    .pj.dA .codeband .ci { font: 400 32px/1.45 'Sarabun', sans-serif; }
    .pj.dA .lobby { display: grid; grid-template-columns: 720px 1fr; gap: 56px; padding: 56px 72px; height: 968px; box-sizing: border-box; align-items: center; }
    .pj.dA .qrcard { background: #ffffff; border: 3px solid #14142b; border-radius: 24px; box-shadow: 8px 8px 0 #14142b; padding: 36px; display: grid; place-items: center; }
    .pj.dA .lh { font: 700 76px/1.2 'Mitr', sans-serif; margin: 0 0 28px; }
    .pj.dA .pincard { display: inline-flex; align-items: center; gap: 28px; background: #ffcc00; border: 3px solid #14142b; border-radius: 24px; box-shadow: 8px 8px 0 #14142b; padding: 12px 36px; }
    .pj.dA .pincard .pk { font: 700 52px/1 'Mitr', sans-serif; }
    .pj.dA .pincard .pv { font: 700 150px/1 'Mitr', sans-serif; letter-spacing: 10px; }
    .pj.dA .jc { margin-top: 40px; font: 700 56px/1.2 'Mitr', sans-serif; }
    .pj.dA .jh { margin-top: 18px; font: 400 32px/1.45 'Sarabun', sans-serif; color: #3d3b5c; }
    .pj.dA .res { padding: 36px 72px 0; }
    .pj.dA .res h2 { margin: 0 0 24px; font: 700 64px/1.2 'Mitr', sans-serif; }
    .pj.dA .wrow { display: grid; grid-template-columns: 96px 520px 1fr; align-items: center; gap: 28px; height: 116px; box-sizing: border-box; margin-bottom: 18px; background: #ffffff; border: 3px solid #14142b; border-radius: 24px; box-shadow: 8px 8px 0 #14142b; padding: 0 32px; }
    .pj.dA .wrow .rk { width: 72px; height: 72px; border-radius: 50%; background: #ffcc00; border: 3px solid #14142b; display: grid; place-items: center; font: 700 36px/1 'Mitr', sans-serif; box-sizing: border-box; }
    .pj.dA .wrow .pz { font: 600 36px/1.2 'Mitr', sans-serif; color: #3d3b5c; }
    .pj.dA .wrow .wn { font: 700 58px/1.1 'Mitr', sans-serif; }
    .pj.dA .claim { position: absolute; left: 0; right: 0; bottom: 0; height: 96px; background: #14142b; color: #ffffff; display: flex; align-items: center; justify-content: center; font: 400 32px/1.3 'Sarabun', sans-serif; }

    /* B · NIGHT STAGE */
    .pj.dB { background: linear-gradient(180deg, #14142b 0%, #23214d 100%); color: #ffffff; }
    .pj.dB .top { height: 96px; display: flex; align-items: center; justify-content: space-between; padding: 0 56px; }
    .pj.dB .ev { font: 600 36px/1.2 'Mitr', sans-serif; color: #d9d6f0; }
    .pj.dB .dots { display: flex; align-items: center; gap: 14px; font: 600 30px/1 'Mitr', sans-serif; }
    .pj.dB .dots .rl { margin-right: 14px; }
    .pj.dB .dots i { box-sizing: border-box; width: 22px; height: 22px; border-radius: 50%; border: 3px solid #d9d6f0; }
    .pj.dB .dots i.done { background: #d9d6f0; }
    .pj.dB .dots i.on { background: #ffcc00; border-color: #ffcc00; box-shadow: 0 0 18px rgba(255,204,0,0.45); }
    .pj.dB .dots i.fin { width: 36px; border-radius: 999px; }
    .pj.dB .stage { position: absolute; left: 56px; right: 56px; top: 96px; height: 724px; display: grid; grid-template-columns: repeat(10, 1fr); grid-auto-rows: 32px; gap: 4px 10px; align-content: center; }
    .pj.dB .chip { border-radius: 999px; background: #23214d; color: #ffffff; padding: 0 8px; }
    .pj.dB .chip.in { background: #ffcc00; color: #14142b; box-shadow: 0 0 16px rgba(255,204,0,0.45); }
    .pj.dB .chip.out { background: transparent; color: #9a97c0; box-shadow: inset 0 0 0 2px #23214d; }
    .pj.dB .low { position: absolute; left: 56px; right: 56px; bottom: 30px; height: 220px; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 40px; }
    .pj.dB .lk { font: 600 30px/1.35 'Mitr', sans-serif; color: #d9d6f0; }
    .pj.dB .gname { font: 700 50px/1.2 'Mitr', sans-serif; color: #ffcc00; }
    .pj.dB .flow { display: flex; align-items: center; gap: 28px; font: 700 150px/1 'Mitr', sans-serif; }
    .pj.dB .flow .to { color: #ffcc00; text-shadow: 0 0 24px rgba(255,204,0,0.45); }
    .pj.dB .flow small { font: 600 44px/1 'Mitr', sans-serif; color: #d9d6f0; }
    .pj.dB .rt { text-align: right; }
    .pj.dB .legend { display: flex; flex-direction: column; align-items: flex-end; gap: 12px; }
    .pj.dB .legend div { display: flex; align-items: center; gap: 16px; font: 400 30px/1 'Sarabun', sans-serif; color: #d9d6f0; }
    .pj.dB .legend .chip { width: 150px; height: 44px; font-size: 30px; }
    .pj.dB .veil { position: absolute; inset: 0; background: rgba(20,20,43,0.78); }
    .pj.dB .codebox { position: absolute; left: 210px; top: 230px; width: 1500px; box-sizing: border-box; background: #23214d; border: 3px solid #ffcc00; border-radius: 24px; padding: 48px 56px; text-align: center; box-shadow: 0 0 60px rgba(255,204,0,0.45); }
    .pj.dB .codebox .ck { font: 600 44px/1.25 'Mitr', sans-serif; color: #d9d6f0; }
    .pj.dB .codebox .digits { margin: 18px 0; font: 700 180px/1 'Mitr', sans-serif; color: #ffcc00; letter-spacing: 8px; white-space: nowrap; word-spacing: 0.15em; }
    .pj.dB .codebox .digits.d12 { font-size: 150px; letter-spacing: 6px; }
    .pj.dB .codebox .ci { font: 400 34px/1.45 'Sarabun', sans-serif; color: #ffffff; }
    .pj.dB .lobby { position: absolute; left: 0; right: 0; top: 96px; bottom: 0; display: grid; grid-template-columns: 1fr 600px 1fr; align-items: center; gap: 64px; padding: 0 72px 40px; }
    .pj.dB .qrcard { background: #ffffff; border-radius: 24px; padding: 32px; display: grid; place-items: center; box-shadow: 0 0 60px rgba(255,204,0,0.45); }
    .pj.dB .lh { font: 700 58px/1.2 'Mitr', sans-serif; margin: 0 0 20px; text-align: right; white-space: nowrap; }
    .pj.dB .jh { font: 400 32px/1.45 'Sarabun', sans-serif; color: #d9d6f0; text-align: right; }
    .pj.dB .pk { font: 600 44px/1 'Mitr', sans-serif; color: #d9d6f0; }
    .pj.dB .pv { font: 700 170px/1 'Mitr', sans-serif; color: #ffcc00; letter-spacing: 12px; text-shadow: 0 0 24px rgba(255,204,0,0.45); }
    .pj.dB .jc { margin-top: 36px; font: 700 56px/1.2 'Mitr', sans-serif; }
    .pj.dB .spot { position: absolute; left: 0; right: 0; top: 120px; text-align: center; }
    .pj.dB .spot .pz { font: 600 44px/1.25 'Mitr', sans-serif; color: #d9d6f0; }
    .pj.dB .spot .wn { margin-top: 10px; font: 700 132px/1.1 'Mitr', sans-serif; color: #ffcc00; text-shadow: 0 0 30px rgba(255,204,0,0.45); }
    .pj.dB .spot h2 { margin: 0 0 18px; font: 600 40px/1.2 'Mitr', sans-serif; color: #ffffff; }
    .pj.dB .wcards { position: absolute; left: 56px; right: 56px; top: 560px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 24px; }
    .pj.dB .wcard { background: #23214d; border-radius: 24px; padding: 28px 28px; }
    .pj.dB .wcard .pz { font: 600 30px/1.3 'Mitr', sans-serif; color: #d9d6f0; }
    .pj.dB .wcard .wn { margin-top: 12px; font: 700 52px/1.15 'Mitr', sans-serif; }
    .pj.dB .claim { position: absolute; left: 0; right: 0; bottom: 56px; text-align: center; font: 400 34px/1.4 'Sarabun', sans-serif; color: #d9d6f0; }`;

const scaled = (inner) => `<div class="scaler" style="width:1440px; height:810px;">${inner}</div>`;

function chips(state, dir) {
  const picked = dir === PICK;
  const roster = picked ? EV.field : ROSTER; const surv = picked ? EV.survivors : SURVIVORS;
  const list = state === 'round2' ? roster.filter((n) => surv.has(n)) : roster;
  return list.map((n) => {
    const cls = state === 'reveal' ? (surv.has(n) ? 'chip in' : 'chip out') : 'chip';
    return `<span class="${cls}"${picked ? nmAttr('chipB', n) : ' data-floor="20"'}>${nm(n)}</span>`;
  }).join('');
}

function topA() {
  const rl = th('รอบที่ 1 จาก 4', 'projector: round label');
  return `<div class="top"><span class="ev">${th(EVENT, 'event name (typed by the MC)', 'sample')}</span><span class="rounds"><span class="rl">${rl}</span><span class="r on">1</span><span class="r">2</span><span class="r">3</span><span class="r">4</span><span class="r fin">${th('ชิง', 'projector: final pill')}</span></span></div>`;
}
function topB(withRound = true, round = 1) {
  const rl = th(`รอบที่ ${round} จาก 4`, 'projector: round label', round === 1 ? 'new' : 'variant');
  const dots = [1, 2, 3, 4].map((i) => `<i${i < round ? ' class="done"' : i === round ? ' class="on"' : ''}></i>`).join('');
  return `<div class="top"><span class="ev">${th(EVENT, 'event name (typed by the MC)', 'sample')}</span>${withRound ? `<span class="dots"><span class="rl">${rl}</span>${dots}<i class="fin"></i></span>` : ''}</div>`;
}

function projFrame(dir, kind) {
  const picked = dir === PICK;
  const total = picked ? EV.field.length : ROSTER.length; const passN = picked ? EV.survivors.size : SURVIVORS.size;
  // what the frame's field must hold, asserted by render-boards.mjs against the chips actually drawn
  const expect = kind === 'reveal' ? ` data-expect-chips="${total}" data-expect-in="${passN}" data-expect-out="${total - passN}"`
    : kind === 'code-card' ? ` data-expect-chips="${passN}"` : ['round', 'code'].includes(kind) ? ` data-expect-chips="${total}"` : '';
  const t = (s) => `<div class="pj d${dir}" data-frame="proj-${kind}" data-dir="${dir}"${expect} style="transform: scale(0.75);">${s}</div>`;
  const gname = th('พลุนับถอยหลัง', 'game name', 'ticket');
  const passLbl = th('ผ่าน', 'legend: passed'); const outLbl = th('ไม่ผ่าน', 'legend: did not pass');
  if (dir === 'A') {
    if (kind === 'lobby') {
      return t(`<div class="top"><span class="ev">${th(EVENT, 'event name (typed by the MC)', 'sample')}</span></div><div class="lobby"><div class="qrcard">${qr(640, 4821)}</div><div><h2 class="lh">${th('สแกนเพื่อเข้าร่วม', 'lobby: heading')}</h2><div class="pincard"><span class="pk">PIN</span><span class="pv">${PIN}</span></div><div class="jc">${th('เข้าร่วมแล้ว 196 คน', 'lobby: joined count')}</div><div class="jh">${th('ใช้ชื่อเล่นหรือชื่อเรียก 1 เครื่อง 1 ชื่อ', 'lobby: hint')}</div></div></div>`);
    }
    if (kind === 'result') {
      const rows = WINNERS.map((w, i) => `<div class="wrow"><span class="rk">${i + 1}</span><span class="pz">${th(`รางวัลที่ ${i + 1}`, 'prize label')} · ${th(PRIZES[i], 'prize name (typed by the MC)', 'sample')}</span><span class="wn">${nm(w)}</span></div>`).join('');
      return t(`<div class="top"><span class="ev">${th(EVENT, 'event name (typed by the MC)', 'sample')}</span></div><div class="res"><h2>${th('ผู้ได้รับรางวัล', 'result: heading')}</h2>${rows}</div><div class="claim">${th('ผู้ได้รางวัล เปิดหน้าผลในมือถือให้ทีมงานดู ชื่อต้องตรงกับบนจอนี้', 'result: claim line')}</div>`);
    }
    const state = kind === 'reveal' ? 'reveal' : 'round';
    let side;
    if (kind === 'reveal') {
      side = `<div class="card"><div class="k">${th('ผ่านรอบที่ 1', 'reveal: passed heading')}</div><div class="big">100<small>${th('คน', 'unit: people')}</small></div></div><div class="card legend"><div><span class="chip in">${passLbl}</span>${passLbl} 100 ${th('คน', 'unit: people')}</div><div><span class="chip out">${outLbl}</span>${outLbl} 100 ${th('คน', 'unit: people')}</div></div>`;
    } else {
      side = `<div class="card"><div class="k">${th('เหลือ', 'counter: remaining')}</div><div class="big">200<small>${th('คน', 'unit: people')}</small></div><div class="line">${th('รอบนี้คัดเหลือ', 'counter: target')} <b>100 ${th('คน', 'unit: people')}</b></div></div><div class="card game"><div class="k" style="color:#14142b;">${th('เกมรอบนี้', 'game card label')}</div><div class="gname">${gname}</div></div>`;
    }
    const band = kind === 'code' ? `<div class="codeband"><div class="ck">${th('รหัสรอบที่ 1', 'round code: label')}</div><div class="digits">${CODE}</div><div class="ci">${th('ใส่รหัสนี้ในมือถือ เพื่อดูผลของคุณ', 'round code: instruction')}</div></div>` : '';
    return t(`${topA()}<div class="body"><div class="stage">${chips(state, dir)}</div><div class="side">${side}</div></div>${band}`);
  }
  // B
  if (kind === 'lobby') {
    return t(`${topB(false)}<div class="lobby"><div><h2 class="lh">${th('สแกนเพื่อเข้าร่วม', 'lobby: heading')}</h2><div class="jh">${th('ใช้ชื่อเล่นหรือชื่อเรียก 1 เครื่อง 1 ชื่อ', 'lobby: hint')}</div></div><div class="qrcard">${qr(536, 4821)}</div><div><div class="pk">PIN</div><div class="pv">${PIN}</div><div class="jc">${th('เข้าร่วมแล้ว 196 คน', 'lobby: joined count')}</div></div></div>`);
  }
  if (kind === 'result') {
    const cards = WINNERS_W.slice(1).map((w, i) => `<div class="wcard"><div class="pz">${th(`รางวัลที่ ${i + 2}`, 'prize label')} · ${th(PRIZES[i + 1], 'prize name (typed by the MC)', 'sample')}</div><div class="wn nm"${nmAttr('wcardB', w)}>${nm(w)}</div></div>`).join('');
    return t(`${topB(false)}<div class="spot"><h2>${th('ผู้ได้รับรางวัล', 'result: heading')}</h2><div class="pz">${th('รางวัลที่ 1', 'prize label')} · ${th(PRIZES[0], 'prize name (typed by the MC)', 'sample')}</div><div class="wn nm"${nmAttr('spotB', WINNERS_W[0])}>${nm(WINNERS_W[0])}</div></div><div class="wcards">${cards}</div><div class="claim">${th('ผู้ได้รางวัล เปิดหน้าผลในมือถือให้ทีมงานดู ชื่อต้องตรงกับบนจอนี้', 'result: claim line')}</div>`);
  }
  if (kind === 'code-card') {
    const gcard = th('ไพ่แจกทั้งห้อง', 'game name', 'ticket');
    const low2 = `<div><div class="lk">${th('เกมรอบนี้', 'game card label')}</div><div class="gname">${gcard}</div></div><div class="flow">${passN}${svg.arrow(110, '#ffcc00', 3)}<span class="to">50</span><small>${th('คน', 'unit: people')}</small></div><div class="rt lk">${th('รอบนี้คัดเหลือ', 'counter: target')}<br>50 ${th('คน', 'unit: people')}</div>`;
    return t(`${topB(true, 2)}<div class="stage">${chips('round2', dir)}</div><div class="low">${low2}</div><div class="veil"></div><div class="codebox"><div class="ck">${th('รหัสรอบที่ 2', 'round code: label', 'variant')}</div><div class="digits d12 fits">${CODE12}</div><div class="ci">${th('ใส่รหัสนี้ในมือถือ เพื่อดูผลของคุณ', 'round code: instruction')}</div></div>`);
  }
  const state = kind === 'reveal' ? 'reveal' : 'round';
  let low;
  if (kind === 'reveal') {
    low = `<div><div class="lk">${th('ผ่านรอบที่ 1', 'reveal: passed heading')}</div><div class="gname">${gname}</div></div><div class="flow"><span class="to">${passN}</span><small>${th('คน', 'unit: people')}</small></div><div class="legend"><div><span class="chip in">${passLbl}</span></div><div><span class="chip out">${outLbl}</span></div></div>`;
  } else {
    low = `<div><div class="lk">${th('เกมรอบนี้', 'game card label')}</div><div class="gname">${gname}</div></div><div class="flow">${total}${svg.arrow(110, '#ffcc00', 3)}<span class="to">${passN}</span><small>${th('คน', 'unit: people')}</small></div><div class="rt lk">${th('รอบนี้คัดเหลือ', 'counter: target')}<br>${passN} ${th('คน', 'unit: people')}</div>`;
  }
  const code = kind === 'code' ? `<div class="veil"></div><div class="codebox"><div class="ck">${th('รหัสรอบที่ 1', 'round code: label')}</div><div class="digits fits">${CODE9}</div><div class="ci">${th('ใส่รหัสนี้ในมือถือ เพื่อดูผลของคุณ', 'round code: instruction')}</div></div>` : '';
  return t(`${topB()}<div class="stage">${chips(state, dir)}</div><div class="low">${low}</div>${code}`);
}

function buildProjector() {
  REG = new Map(); NAMES = new Set(); PICK = 'B'; BOARD = 'projector';
  const KINDS = [
    ['lobby', 'LOBBY · QR mode · the join QR, the event PIN and the joined count', 'Shown while people join, before the review and the start. The QR carries the PIN (gh#299 decision 4); the PIN is also large so a phone that cannot scan can type it. The QR is a placeholder pattern, not a scannable code; a real one keeps dark-on-light modules in both directions.'],
    ['round', 'ROUND IN PROGRESS · the event chrome around the game surface', 'The chrome is this ticket\'s: event name, round of 4, remaining count, this round\'s target, the game\'s name. The game surface (the name field here) is where gh#303 draws each 3D game; drawn here is the plain 2D layer every game falls back to. 200 names; in the picked B frame three of them are the widest 12-cluster names (NAME FIT row); the render fails if any name clips, or wraps above its floor. No ad (decision 10).'],
    ['reveal', 'PLAIN 2D REVEAL · the fallback every 3D game uses (gh#304)', 'ADR-0051: a play route never blanks; with no 3D context, or under reduced motion, this is the reveal. Passed names turn gold and bold; names that did not pass dim, strike through and (A) go dashed: never colour alone. Motion proposal: one wave across the field, then the count; reduced motion swaps the wave for a single 200ms fade to this end state (the --motion-rm-fade token), never removal (ADR-0046).'],
    ['code', 'ROUND CODE · QR mode only · the code phones type to see their own fate', 'gh#299 decision 5: the screen shows a code at the reveal and each phone computes its fate from it and its join identity, with no server call. Drawn at the moment of the reveal, before the wave. Owner pick 2026-11-11: a cut round\'s code is 9 digits (gh#300), grouped 3-3-3, drawn on the picked frame (B); a card-deal round\'s is 12 digits, grouped 4-4-4, drawn in its own picked frame (proj-code-card, next row). The unpicked A frame keeps the 6-digit placeholder it was picked against.'],
    ['result', 'RESULT AND PRIZE CLAIM · the winners, by prize', 'Prize names and winners as large as the room needs to match a phone against (decision 4: the winner shows the name on their own phone and it must match). In admin-typed mode the claim line is not shown (no phones). Prize 1 is drawn first in both; the order prizes are given out is not decided.'],
  ];
  const rows = KINDS.map(([kind, title, why]) => `
  <div class="brow">
    <h2>${title}</h2>
    <p class="why">${why}</p>
    <div class="cands col">
      <div class="cand">${tag('A', ` · proj-${kind} · authored 1920x1080, shown at 75%`)}${scaled(projFrame('A', kind))}</div>
      <div class="cand">${tag('B', ` · proj-${kind} · authored 1920x1080, shown at 75%`)}${scaled(projFrame('B', kind))}</div>
    </div>
  </div>`);
  rows.splice(4, 0, `
  <div class="brow">
    <h2>ROUND CODE · card-deal round · the 12-digit code (picked direction only)</h2>
    <p class="why">Owner pick 2026-11-11: a card-deal round\'s code is 12 digits. Grouped 4-4-4 (three groups, like the 9-digit 3-3-3, so the eye still reads three chunks; 4 digits a chunk is the most a room reads aloud in one breath). Drawn at round 2 (ไพ่แจกทั้งห้อง, 100 left, 100 to 50), so the field holds the 100 names that passed round 1, both worst-case names among them. Digits at 150px so 12 fit the 24px-radius card; the render checks the code fits on one line.</p>
    <div class="cands col">
      <div class="cand">${tag('B', ' · proj-code-card · authored 1920x1080, shown at 75%')}${scaled(projFrame('B', 'code-card'))}</div>
    </div>
  </div>`);
  rows.push(nameFitRow('Projector (B, picked)', [['chipB', 'name chip in the field, all rounds, Sarabun 400/700'], ['spotB', 'prize 1 winner, Mitr 700'], ['wcardB', 'prizes 2 to 5 winners, Mitr 700']]));
  const tail = [
    rulesRow('Projector', [
      'Color Contrast (4.5:1 normal text, 3:1 large): every text pair below clears 4.5:1, the lowest being A\'s ink on the pink game card (5.35:1) and B\'s dimmed name at the bottom of its gradient (5.42:1); the pink error outlines are non-text and clear 3:1. A projector in a lit hall lowers every ratio; inferred, not measured: A\'s light ground washes out first. Settling it needs one real projector.',
      'Size for distance (from Contrast Readability): all text 30px or larger at 1080p, except the 200 name chips (20px, shrinking to the NAME FIT floor for the widest names) the legend labels are 30px; counts and the code at 140 to 210px.',
      'Color Only: passed = gold + bold (+ glow in B); not passed = dimmed + line-through (+ dashed outline in A). The legend says it in words.',
      'Excessive Motion (1 to 2 key elements per view): the reveal animates the name field and the count only; chrome stays still.',
      'Reduced Motion: the end state is reached by a 200ms fade (--motion-rm-fade), and the frame drawn here is that end state.',
      'threejs, for gh#303 to inherit: one WebGLRenderer for the page, reused across rounds (context-loss limit); devicePixelRatio capped at 2; geometry, material and texture disposed when a round\'s scene goes; particles start at 3000 and are profiled before raising. When no context exists, the plain 2D reveal above is the screen (ADR-0051).',
    ]),
    valuesRow(), copyRow(),
    notesRow([
      '<b>Rests on gh#299:</b> decisions 3 (MC-driven projected screen), 5 (round code), 7 (equal odds; nothing on screen implies otherwise), 9 (event name on screen), 10 (no ad here), 11 (3D on the main screen, never-blank fallback).',
      '<b>Not drawn:</b> the four other rounds and the final (same chrome, later numbers); each game\'s own 3D content (gh#303); an admin-typed variant of each frame (identical minus the code and the claim line).',
      '<b>Not covered:</b> a real projector, a real room, viewing distance. All contrast numbers are computed, not measured on the wall.',
    ]),
  ].join('\n');
  return boardDoc('projected screen', ['<b style="color: #ffcc00;">Approval result 2026-11-11 (owner popup): direction <b>B NIGHT STAGE</b> is PICKED for the projected screen, and B\'s four PROPOSAL values are now picked values (VALUES row); A POSTER was NOT PICKED and its frames stay below as history. Round code: 9 digits for a cut round (gh#300), 12 for a card-deal round; the picked code frame carries 9 digits. The proposed Thai copy is approved as it stands. Name limit: 12.</b>', ORDER_LINE, DIRECTIONS_LINE, OWNER_PIN], PROJ_CSS, rows, tail);
}

// ---------------------------------------------------------------------------------------------
// PHONE BOARD
// ---------------------------------------------------------------------------------------------
const PHONE_CSS = `
    /* ---- phone frames: 320 (fold 568) and 375 (fold 667); content sets the height ---- */
    .ph { position: relative; box-sizing: border-box; font-family: 'Sarabun', system-ui, sans-serif; outline: 1px solid #14142b; } /* the outline is annotation: the frame edge */
    .ph .bd { padding: 22px 16px 28px; }
    .ph h3 { margin: 0 0 6px; font: 700 26px/1.3 'Mitr', sans-serif; }
    .ph .sub { margin: 0 0 18px; font: 400 16px/1.55 'Sarabun', sans-serif; }
    .ph .lbl { margin-bottom: 8px; font: 600 17px/1.3 'Mitr', sans-serif; }
    .ph .inp { box-sizing: border-box; height: 52px; padding: 0 14px; display: flex; align-items: center; font: 400 20px/1 'Sarabun', sans-serif; }
    .ph .inp.code { height: 64px; justify-content: center; font: 700 34px/1 'Mitr', sans-serif; letter-spacing: 4px; }
    .ph .pins { display: flex; gap: 10px; }
    .ph .pins span { box-sizing: border-box; flex: 1; height: 64px; display: grid; place-items: center; font: 700 32px/1 'Mitr', sans-serif; }
    .ph .btn { box-sizing: border-box; margin-top: 18px; height: 52px; display: grid; place-items: center; font: 700 20px/1 'Mitr', sans-serif; }
    .ph .note { margin: 14px 0 0; font: 400 16px/1.55 'Sarabun', sans-serif; }
    .ph .emsg { display: flex; gap: 8px; align-items: flex-start; margin-top: 10px; font: 700 16px/1.5 'Sarabun', sans-serif; }
    .ph .emsg svg { flex: none; margin-top: 1px; }
    .ph .who { font: 700 34px/1.2 'Mitr', sans-serif; }
    .ph .badge { width: 112px; height: 112px; border-radius: 50%; display: grid; place-items: center; margin: 6px 0 18px; box-sizing: border-box; }
    .ph .pcard { width: 150px; height: 210px; box-sizing: border-box; border-radius: 14px; position: relative; display: grid; place-items: center; margin: 4px 0 12px; background: #ffffff; }
    .ph .pcard .rk { position: absolute; left: 12px; top: 8px; font: 700 38px/1 'Mitr', sans-serif; color: #14142b; }
    .ph .pcard .rk2 { position: absolute; right: 12px; bottom: 8px; font: 700 38px/1 'Mitr', sans-serif; color: #14142b; transform: rotate(180deg); }
    .ph .cap { font: 700 20px/1.3 'Mitr', sans-serif; }

    /* A · POSTER */
    .ph.dA { background: #fff6e0; color: #14142b; }
    .ph.dA .top { min-height: 48px; box-sizing: border-box; background: #14142b; color: #ffffff; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 12px; padding: 8px 16px; font: 600 16px/1.2 'Mitr', sans-serif; }
    .ph.dA .top .me { background: #ffcc00; color: #14142b; border-radius: 999px; padding: 3px 10px; font: 700 16px/1.2 'Sarabun', sans-serif; max-width: 100%; box-sizing: border-box; white-space: nowrap; overflow: hidden; }
    .ph.dA .sub, .ph.dA .note { color: #3d3b5c; }
    .ph.dA .box { background: #ffffff; border: 2.5px solid #14142b; border-radius: 20px; box-shadow: 5px 5px 0 #14142b; padding: 18px 16px; }
    .ph.dA .inp, .ph.dA .pins span { background: #ffffff; border: 2.5px solid #14142b; border-radius: 12px; }
    .ph.dA .inp.err { border: 3px solid #ff3d7f; }
    .ph.dA .inp.code { font-size: 30px; letter-spacing: 2px; word-spacing: 0.1em; }
    .ph.dA .inp.code.c12 { font-size: 26px; letter-spacing: 1px; }
    .ph .who, .ph .inp { overflow-wrap: anywhere; }
    .ph .top .me[data-wrap] { white-space: normal; overflow-wrap: anywhere; }
    .ph .inp[data-fit="scroll"] { justify-content: flex-end; overflow: hidden; white-space: nowrap; }
    .ph.dA .btn { background: #ffcc00; border: 2.5px solid #14142b; border-radius: 16px; box-shadow: 5px 5px 0 #14142b; }
    .ph.dA .badge.pass { background: #ffcc00; border: 3px solid #14142b; box-shadow: 5px 5px 0 #14142b; color: #14142b; }
    .ph.dA .pcard { border: 2.5px solid #14142b; box-shadow: 5px 5px 0 #14142b; }
    .ph.dA .prize { background: #ffcc00; border: 2.5px solid #14142b; border-radius: 20px; box-shadow: 5px 5px 0 #14142b; padding: 18px 16px; }
    .ph.dA .prize .pz { font: 600 18px/1.35 'Mitr', sans-serif; }

    /* B · NIGHT STAGE */
    .ph.dB { background: #14142b; color: #ffffff; }
    .ph.dB .top { height: 48px; box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; padding: 0 16px; font: 600 16px/1.2 'Mitr', sans-serif; color: #d9d6f0; border-bottom: 2px solid #23214d; }
    .ph.dB .top .me { background: #23214d; color: #ffcc00; border-radius: 999px; padding: 3px 10px; font: 700 16px/1.2 'Sarabun', sans-serif; }
    .ph.dB .sub, .ph.dB .note { color: #d9d6f0; }
    .ph.dB .box { background: #23214d; border-radius: 20px; padding: 18px 16px; }
    .ph.dB .inp, .ph.dB .pins span { background: #23214d; color: #ffffff; border: 2px solid #d9d6f0; border-radius: 12px; }
    .ph.dB .box .inp, .ph.dB .box .pins span { background: #14142b; }
    .ph.dB .inp.err { border: 3px solid #ff3d7f; }
    .ph.dB .btn { background: #ffcc00; color: #14142b; border-radius: 999px; }
    .ph.dB .badge.pass { background: #ffcc00; color: #14142b; box-shadow: 0 0 28px rgba(255,204,0,0.45); }
    .ph.dB .pcard { box-shadow: 0 0 28px rgba(255,204,0,0.45); }
    .ph.dB .prize { background: #23214d; border: 3px solid #ffcc00; border-radius: 20px; box-shadow: 0 0 28px rgba(255,204,0,0.45); padding: 18px 16px; }
    .ph.dB .prize .pz { font: 600 18px/1.35 'Mitr', sans-serif; color: #d9d6f0; }
    .ph.dB .prize .who { color: #ffcc00; }
    .ph .prize .who { margin-top: 8px; }`;

const FOLD = { 320: 568, 375: 667 };
// The identity a phone frame shows: picked A frames carry the worst-case names (Latin at 320, Thai with SARA AM at 375 and
// in the Thai-at-320 row); the unpicked B frames keep the sample name they were picked against.
const who = (dir, w, v) => (dir === PICK ? (v === 'thai' || w === 375 ? THAI_M : LATIN_W) : ME);
const nmA = (dir, surf, name, w) => (dir === PICK ? ` nm"${nmAttr(surf, name, w)}` : '"');
function phone(dir, w, id, inner, { me = false, v = '', as = null } = {}) {
  const name = as ?? who(dir, w, v);
  const top = `<div class="top"><span>${th(EVENT, 'event name (typed by the MC)', 'sample')}</span>${me ? `<span class="me${nmA(dir, 'meA', name, w)}${dir === PICK ? ' data-fit="line"' : ''}>${nm(name)}</span>` : ''}</div>`;
  return `<div class="ph d${dir}" data-frame="${id}" data-dir="${dir}" data-fold="${FOLD[w]}" style="width:${w}px; min-height:${FOLD[w]}px;"><div class="fold" style="top:${FOLD[w] - 2}px;"></div>${top}<div class="bd">${inner}</div></div>`;
}
const alertFor = (dir) => svg.alert(22, '#ff3d7f', dir === 'A' ? '#14142b' : '#14142b');

function joinState(dir, w, state, v = '') {
  const id = `join-${state}-${w}${v ? `-${v}` : ''}`;
  const name = who(dir, w, v);
  if (state === 'pin') {
    return phone(dir, w, id, `<h3>${th('ใส่ PIN ของงาน', 'join: PIN heading')}</h3><p class="sub">${th('ดู PIN บนจอใหญ่ ถ้าสแกน QR มา PIN จะใส่ให้แล้ว', 'join: PIN hint')}</p><div class="pins">${PIN.split('').map((c) => `<span class="tap">${c}</span>`).join('')}</div><div class="btn tap">${th('ถัดไป', 'join: next button')}</div>`);
  }
  if (state === 'name') {
    return phone(dir, w, id, `<h3>${th('ตั้งชื่อที่จะขึ้นจอ', 'join: name heading')}</h3><p class="sub">${th('ชื่อเล่นหรือชื่อเรียกก็ได้ ไม่เกิน 12 ตัว', 'join: name hint')}</p><div class="lbl">${th('ชื่อของคุณ', 'join: name label')}</div><div class="inp tap${nmA(dir, 'inpA', name, w)}>${nm(name)}</div><div class="btn tap">${th('เข้าร่วม', 'join: submit button')}</div><p class="note">${th('รายชื่อทั้งหมดจะถูกลบหลังจบงาน', 'join: deletion note')}</p>`, { v });
  }
  if (state === 'taken') {
    return phone(dir, w, id, `<h3>${th('ตั้งชื่อที่จะขึ้นจอ', 'join: name heading')}</h3><p class="sub">${th('ชื่อเล่นหรือชื่อเรียกก็ได้ ไม่เกิน 12 ตัว', 'join: name hint')}</p><div class="lbl">${th('ชื่อของคุณ', 'join: name label')}</div><div class="inp err tap">${nm('ต้น')}</div><div class="emsg" role="alert">${alertFor(dir)}<span>${th('ชื่อ “ต้น” มีคนใช้แล้ว ลองเติมอักษรย่อ เช่น “ต้น ส.”', 'join: name-taken error')}</span></div><div class="btn tap">${th('เข้าร่วม', 'join: submit button')}</div><p class="note">${th('รายชื่อทั้งหมดจะถูกลบหลังจบงาน', 'join: deletion note')}</p>`);
  }
  return phone(dir, w, id, `<h3>${th('เครื่องนี้เข้าร่วมแล้ว', 'join: device-used heading')}</h3><p class="sub">${th('1 เครื่องเข้าร่วมได้ 1 ชื่อ', 'join: one name per device')}</p><div class="box"><div class="lbl">${th('ชื่อของคุณบนจอ', 'join: your name label')}</div><div class="who${nmA(dir, 'whoA', name, w)}>${nm(name)}</div></div><p class="note">${th('เปิดหน้านี้ค้างไว้ เมื่อจอใหญ่ขึ้นรหัสรอบ ให้ใส่รหัสที่หน้านี้', 'join: keep-open note')}</p>`, { me: true, v });
}

// The prize a claim frame shows: the picked frames read it from the event, so the phone and the projector agree.
function claimPrize(dir, name) {
  if (dir !== PICK) return 1; // history: the unpicked frame was drawn with the sample identity winning prize 1
  const k = prizeOf(name);
  if (!k) throw new Error(`event fixture: claim frame for ${name}, who won nothing`);
  return k;
}
// Phone identities in picked frames must agree with the event (assertEvent covers the sets; these the frames).
function assertPhoneIdentity(state, name) {
  if (['pass', 'card', 'code', 'wrong', 'code-card'].includes(state) && !EV.survivors.has(name)) throw new Error(`event fixture: ${state} frame for ${name}, who did not pass round 1`);
}
function revealState(dir, state, v = '') {
  const id = (state === 'claim' ? 'claim-320' : `reveal-${state}-320`) + (v ? `-${v}` : '');
  const name = who(dir, 320, v);
  if (dir === PICK) assertPhoneIdentity(state, name);
  if (state === 'code-card') {
    return phone(dir, 320, id, `<h3>${th('รอบที่ 2', 'reveal: card round heading')}</h3><p class="sub">${th('ใส่รหัสรอบจากจอใหญ่ เพื่อดูผลของคุณ', 'reveal: code hint')}</p><div class="lbl">${th('รหัสรอบ', 'reveal: code label')}</div><div class="inp code c12 tap fits">${CODE12}</div><div class="btn tap">${th('ดูผลของฉัน', 'reveal: submit button')}</div><p class="note">${th('ผลคำนวณในเครื่องนี้ ไม่ต้องรอเน็ต', 'reveal: offline note')}</p>`, { me: true, v });
  }
  if (state === 'code' || state === 'wrong') {
    const err = state === 'wrong';
    return phone(dir, 320, id, `<h3>${th('รอบที่ 1', 'reveal: round heading')}</h3><p class="sub">${th('ใส่รหัสรอบจากจอใหญ่ เพื่อดูผลของคุณ', 'reveal: code hint')}</p><div class="lbl">${th('รหัสรอบ', 'reveal: code label')}</div><div class="inp code${err ? ' err' : ''} tap fits">${dir === 'A' ? (err ? CODE9_WRONG : CODE9) : (err ? '482 951' : CODE)}</div>${err ? `<div class="emsg" role="alert">${alertFor(dir)}<span>${th('รหัสนี้ไม่ใช่ของรอบที่ 1 ดูรหัสบนจอใหญ่อีกครั้ง', 'reveal: wrong-code error')}</span></div>` : ''}<div class="btn tap">${th('ดูผลของฉัน', 'reveal: submit button')}</div><p class="note">${th('ผลคำนวณในเครื่องนี้ ไม่ต้องรอเน็ต', 'reveal: offline note')}</p>`, { me: true, v });
  }
  if (state === 'pass') {
    return phone(dir, 320, id, `<div class="badge pass">${svg.check(60, 'currentColor', 3.2)}</div><h3>${th('ผ่านรอบที่ 1', 'reveal: passed heading')}</h3><p class="sub">${th('ไปต่อรอบที่ 2 เหลือ 100 คน', 'reveal: passed detail')}</p><div class="box"><div class="lbl">${th('ชื่อของคุณบนจอ', 'join: your name label')}</div><div class="who${nmA(dir, 'whoA', name, 320)}>${nm(name)}</div></div><p class="note">${th('รอรหัสรอบถัดไปจากจอใหญ่', 'reveal: wait note')}</p>`, { me: true, v });
  }
  if (state === 'out') {
    const name = dir === PICK ? EV.out : ME; // the picked "did not pass" frame belongs to someone who did not pass
    return phone(dir, 320, id, `<h3>${th('รอบที่ 1 ไม่ผ่าน', 'reveal: out heading')}</h3><p class="sub">${th('ขอบคุณที่ร่วมสนุก เชียร์คนที่เหลือต่อได้เลย', 'reveal: out detail')}</p><div class="box"><div class="lbl">${th('ชื่อของคุณบนจอ', 'join: your name label')}</div><div class="who${nmA(dir, 'whoA', name, 320)}>${nm(name)}</div></div>`, { me: true, v, as: name });
  }
  if (state === 'card') {
    return phone(dir, 320, id, `<h3>${th('รอบที่ 2', 'reveal: card round heading')}</h3><p class="sub">${th('ไพ่แจกทั้งห้อง', 'game name', 'ticket')}</p><div class="lbl">${th('ไพ่ของคุณ', 'card: label')}</div><div class="pcard"><span class="rk">7</span>${svg.club(84)}<span class="rk2">7</span></div><div class="cap">${th('7 ดอกจิก', 'card: caption')}</div><p class="note">${th('กติกายังไม่ออก รอดูบนจอใหญ่ แล้วใส่รหัสรอบเพื่อดูผล', 'card: wait for the rule')}</p>`, { me: true, v });
  }
  return phone(dir, 320, id, `<h3>${th('คุณได้รางวัล', 'claim: heading')}</h3><div class="prize"><div class="pz">${th(`รางวัลที่ ${claimPrize(dir, name)}`, 'prize label')} · ${th(PRIZES[claimPrize(dir, name) - 1], 'prize name (typed by the MC)', 'sample')}</div><div class="who${nmA(dir, 'whoA', name, 320)} data-mt="8">${nm(name)}</div></div><p class="note">${th('แสดงหน้านี้ให้ทีมงานดู ชื่อต้องตรงกับบนจอใหญ่', 'claim: instruction')}</p>`, { me: true, v });
}

function buildPhone() {
  REG = new Map(); NAMES = new Set(); PICK = 'A'; BOARD = 'phone';
  const JOIN = [
    ['pin', 'JOIN 1 · PIN', 'Scanning the QR fills the PIN; typing it is the fallback for a phone that cannot scan. Four 64px boxes, numeric keypad (inputmode=numeric).'],
    ['name', 'JOIN 2 · nickname', 'A nickname or alias (decision 4). The cap is 12 grapheme clusters (owner, 2026-11-11; gh#308 counts them with Intl.Segmenter, so a letter with its marks is one). The deletion line states the auto-delete (gh#299, PDPA constraint).'],
    ['taken', 'JOIN 3 · name taken', 'The error sits under the field, names the clash and gives a way out, role=alert; the field outline turns pink and the icon carries it too (not colour alone). Checked at submit, because only the server knows the taken names.'],
    ['device', 'JOIN 4 · one name per device', 'A second join from the same phone lands here, not on the form (decision 4). This screen is also the page the phone keeps open for the reveal.'],
  ];
  const rows = JOIN.map(([s, title, why]) => `
  <div class="brow">
    <h2>${title} · 320 and 375, both directions</h2>
    <p class="why">${why} Blue dashed line: the fold (320x568, 375x667).</p>
    <div class="cands">
      <div class="cand">${tag('A', ` · 320`)}${joinState('A', 320, s)}</div>
      <div class="cand">${tag('A', ` · 375`)}${joinState('A', 375, s)}</div>
      <div class="cand">${tag('B', ` · 320`)}${joinState('B', 320, s)}</div>
      <div class="cand">${tag('B', ` · 375`)}${joinState('B', 375, s)}</div>
    </div>
  </div>`);
  const REV = [
    [['code', 'type the round code'], ['wrong', 'a code that is not this round\'s']],
    [['pass', 'your fate: passed'], ['out', 'your fate: did not pass']],
    [['card', 'card game: your card before the rule'], ['claim', 'prize claim']],
  ];
  const revWhy = {
    code: 'The phone computes its fate from the code and its join identity, with no server call (decision 5), so there is no loading or connecting state. Whether a mistyped code can be caught depends on gh#300\'s code format; the wrong-code frame assumes it can.',
    pass: 'Passed: the badge, the words and the name together. Not passed: words only, no alarm; the name stays so the person can still match the screen.',
    card: 'Card game (gh#299 decision 13): in QR mode the phone shows its own card before the rule is drawn. A plain white card and a drawn suit: no felt, no chips, no money. Prize claim: the name the winner shows staff, matched against the projected result.',
  };
  for (const pair of REV) {
    rows.push(`
  <div class="brow">
    <h2>REVEAL · ${pair.map((p) => p[1]).join(' · ')} · 320</h2>
    <p class="why">${revWhy[pair[0][0]]} Blue dashed line: the fold (320x568).</p>
    <div class="cands">
      ${pair.map(([s, t]) => `<div class="cand">${tag('A', ` · ${t}`)}${revealState('A', s)}</div><div class="cand">${tag('B', ` · ${t}`)}${revealState('B', s)}</div>`).join('\n      ')}
    </div>
  </div>`);
  }
  rows.push(`
  <div class="brow">
    <h2>REVEAL · card-deal round · the 12-digit code · 320 (picked direction only)</h2>
    <p class="why">Owner pick 2026-11-11: a card-deal round\'s code is 12 digits, grouped 4-4-4 like the projector. At 320 the field shows them at 26px with 1px letter spacing so the three groups stay apart on one line; the render checks the code fits. Blue dashed line: the fold (320x568).</p>
    <div class="cands">
      <div class="cand">${tag('A', ' · type the 12-digit card-round code')}${revealState('A', 'code-card')}</div>
    </div>
  </div>`);
  rows.push(`
  <div class="brow">
    <h2>WORST CASE · the widest Thai name at 320 (picked direction only)</h2>
    <p class="why">The picked frames above carry the widest Latin name at 320 and the widest Thai name at 375. This row puts the widest Thai name through every 320 surface that shows a name: the name field, the header pill, the name card and the prize card.</p>
    <div class="cands">
      <div class="cand">${tag('A', ' · nickname, Thai worst case')}${joinState('A', 320, 'name', 'thai')}</div>
      <div class="cand">${tag('A', ' · one name per device, Thai worst case')}${joinState('A', 320, 'device', 'thai')}</div>
      <div class="cand">${tag('A', ' · passed, Thai worst case')}${revealState('A', 'pass', 'thai')}</div>
      <div class="cand">${tag('A', ' · prize claim, Thai worst case')}${revealState('A', 'claim', 'thai')}</div>
    </div>
  </div>`);
  rows.push(nameFitRow('Phone (A, picked)', [['inpA', 'the name field, Sarabun 400'], ['meA', 'the header pill, Sarabun 700 (the header wraps the pill to its own line before shrinking it)'], ['whoA', 'the name card and the prize card, Mitr 700']]));
  const tail = [
    rulesRow('Phone pages', [
      'Touch Target Size (44pt iOS / 48dp Android): buttons and fields 52px, PIN boxes 64px, the code field 64px. The render measures every control.',
      'Touch Spacing (8px minimum): 10px between PIN boxes, 18px between a field and its button.',
      'Error Placement + Error Messages: the error sits directly under its field, names what is wrong and how to fix it, role=alert, tied to the field by aria-describedby. Focusable Error Summary: not used, since each form has one field.',
      'Inline Validation: the name clash is checked at submit, not on blur, because only the server knows the taken names (a stated deviation). The round code can be checked as typed if gh#300\'s format allows.',
      'Color Only: errors carry an icon and words as well as the pink outline; passed carries a tick and words.',
      'Reduced Motion: the reveal is a 200ms fade (--motion-rm-fade) or a cut; the phone page is light 2D (decision 11).',
      'astro (zero JS by default, graceful degradation): the join form is the island that talks to the server; the reveal computes on the phone with no network at reveal time (decision 5).',
    ]),
    valuesRow(), copyRow(),
    notesRow([
      '<b>Rests on gh#299:</b> decisions 4 (QR join, PIN, nickname, name clash, one name per device, claim by matching name), 5 (round code, no server at reveal), 11 (light 2D phone page), 13 (own card before the rule).',
      '<b>Not drawn:</b> a closed or expired event (join after the start); the final round on the phone (gh#303\'s games decide what the phone shows there); the reveal at 375 (the 320 layout holds; the join pages show both widths).',
      '<b>Not covered:</b> real phones, Safari and Firefox, a real keyboard over the form, venue Wi-Fi.',
    ]),
  ].join('\n');
  return boardDoc('phone pages (QR join, reveal, prize claim)', ['<b style="color: #ffcc00;">Approval result 2026-11-11 (owner popup): direction <b>A POSTER</b> is PICKED for the phone pages; B NIGHT STAGE was NOT PICKED and its frames stay below as history. Round code: 9 digits for a cut round (gh#300), 12 for a card-deal round; the picked code-entry and wrong-code frames carry 9 digits. The proposed Thai copy is approved as it stands. Name limit: 12.</b>', ORDER_LINE, DIRECTIONS_LINE, OWNER_PIN], PHONE_CSS, rows, tail);
}

// ---------------------------------------------------------------------------------------------
const out = [['Gh302Setup.dc.html', buildSetup()], ['Gh302Projector.dc.html', buildProjector()], ['Gh302Phone.dc.html', buildPhone()]];
for (const [f, html] of out) { writeFileSync(path.join(designDir, f), html); console.log(`${f} ${Buffer.byteLength(html)} bytes`); }
console.log(`roster ${ROSTER.length} unique ${new Set(ROSTER).size} survivors ${SURVIVORS.size} joined ${JOINED.length}`);
