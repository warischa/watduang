// gh#331 board: ชื่อใครมีตัวนี้ (game 6), a mini-event page ONLY (gh#311, owner design grilling 2026-11-11 06:34:
// "mini-event only"; the issue body says the same). Writes design/Gh331NameLetter.dc.html through make-boards.mjs.
// Owns three decisions, G331-D4 (the drawn-letter card), G331-D5 (how a match shows on a name) and G331-D6 (a
// redraw shown or silent). The shared D1 (glyph floor) is read off the kit; D3 (round code grouping) is not drawn:
// a mini-event page has no round code. Every Thai string on the board is PROPOSED copy.
//
// What is real here: the 200 names are the kit roster at the setup cap plus seven odd names that stay inside the
// join allow-list (docs/design/prize-draw-qr-join-names.md); every mark on a name, every in / out state and every
// count is COMPUTED from the drawn letter by `hits`, then re-read from the generated HTML by `assertWallHtml`.
import {
  th, nm, esc, fit, shuffle, rng, resetCopy, valuesTable, beatTable, nameFitRow, notesRow, contrastTable,
  OPTIONS, KIT_OPT, pickNote, ROSTER_200, ME, CAP_NAME, WIDE_LATIN, WIDE_THAI, WIDE_AM,
  boardDoc, ORDER_LINE, decisionsRow, rolesRow, copyRow, sec, cand, cands, tag,
  stage, phone, hud, lowBand, count, denseField, ruleCard, phoneHead, verdict, winners,
  KIT_ROLES, KIT_VALUES, KIT_PAIRS,
} from './kit.mjs';

const NAME = 'Gh331NameLetter';
const GAME = 'ชื่อใครมีตัวนี้';
const WINNERS = 3; // the MC-set winner count, drawn as 3 on every mini-event board (1 to 5 allowed)

// ---- names: the join allow-list and the cluster rule (copied from the names doc; nothing is imported from src) ----
const MARKS = (cp) => cp === 0x0e31 || cp === 0x0e33 || (cp >= 0x0e34 && cp <= 0x0e3a) || (cp >= 0x0e47 && cp <= 0x0e4e);
export function clusters(name) { const out = []; for (const ch of name) { if (out.length && MARKS(ch.codePointAt(0))) out[out.length - 1] += ch; else out.push(ch); } return out; }
const LATIN = /^[A-Za-z]$/;
const sameLetter = (cluster, letter) => { const b = String.fromCodePoint(cluster.codePointAt(0)); return b === letter || (LATIN.test(b) && LATIN.test(letter) && b.toLowerCase() === letter.toLowerCase()); };
// how many clusters of a name carry the drawn letter (a Latin letter ignores case; a Thai one is exact)
export const hits = (name, letter) => clusters(name).filter((c) => sameLetter(c, letter)).length;
const ALLOWED = /^[ก-ฺเ-๎๐-๙A-Za-z0-9 .'_-]+$/;
export function assertName(n) {
  const bad = (m) => { throw new Error(`name ${JSON.stringify(n)}: ${m}`); };
  if (!ALLOWED.test(n)) bad('outside the join allow-list');
  if (n.length > 64) bad('more than 64 UTF-16 code units');
  if (clusters(n).length > 12) bad('more than 12 clusters');
  if (n !== n.trim() || /  /.test(n)) bad('whitespace is not collapsed');
}
// odd names that a real join admits: one bare letter, 12 of one letter, an apostrophe and digits, mixed scripts,
// Thai digits, stacked marks, a Latin name wrapped in underscores
const ODD = ['ก', 'กกกกกกกกกกกก', "O'Neil_99", 'Kanok-wan ก.', '๑๒๓ ก.', 'กิ๊ก ก๊ก ก้ก', 'xX_ก_Xx', 'นนนนนนนนนนนน'];
export const NAMES = (() => {
  const base = ROSTER_200.slice(); const keep = new Set([ME, CAP_NAME, WIDE_LATIN, WIDE_THAI, WIDE_AM]);
  const slots = base.map((n, i) => i).filter((i) => !keep.has(base[i])).slice(10, 10 + ODD.length);
  slots.forEach((s, k) => { base[s] = ODD[k]; });
  if (new Set(base).size !== 200) throw new Error(`the field is not 200 unique names (${new Set(base).size})`);
  base.forEach(assertName);
  return base;
})();

// ---- the redraw rule (gh#311: a letter that would leave nobody, everybody or fewer than the winner count) ----
export function assertRedraw(letter, names, winners, polarity = 'out') {
  const h = names.filter((n) => hits(n, letter) > 0).length;
  const left = polarity === 'out' ? names.length - h : h;
  const bad = (m) => { throw new Error(`redraw: ${letter} ${m}`); };
  if (left === names.length) bad(`leaves everybody (${left} of ${names.length})`);
  if (left === 0) bad('leaves nobody');
  if (left < winners) bad(`leaves ${left}, fewer than the ${winners} winners`);
  return left;
}

// ---- the deal: round 1 draws LETTER (skipping SKIP, which nobody has), a late round draws L2 ----
export const LETTER = 'ก';
export const WORD_OF_LETTER = 'ไก่'; // the alphabet word every Thai child learns for the letter (G331-D4 B)
const SKIP = 'ฬ';
const L2 = 'น';
assertRedraw(LETTER, NAMES, WINNERS);
let skipRejected = false; try { assertRedraw(SKIP, NAMES, WINNERS); } catch (e) { skipRejected = /leaves everybody/.test(e.message); }
if (!skipRejected) throw new Error(`the skipped letter ${SKIP} must be one the redraw rule rejects`);
const IN1 = NAMES.filter((n) => hits(n, LETTER) === 0);
const state1 = (n) => (hits(n, LETTER) > 0 ? 'out' : 'in'); // polarity: a name that holds the letter is out
const REST = shuffle(NAMES.filter((n) => ![ME, CAP_NAME, WIDE_LATIN, WIDE_THAI, WIDE_AM, 'นนนนนนนนนนนน'].includes(n) && hits(n, LETTER) === 0 && hits(n, L2) === 0), rng(331)).slice(0, 3);
export const LATE = [ME, WIDE_LATIN, 'นนนนนนนนนนนน', REST[0], CAP_NAME, WIDE_THAI, REST[1], WIDE_AM, REST[2]];
if (LATE.some((n) => hits(n, LETTER) > 0 || !NAMES.includes(n))) throw new Error('a late-round name did not survive round 1');
assertRedraw(L2, LATE, WINNERS);
const LATE_IN = LATE.filter((n) => hits(n, L2) === 0);
const W3 = [WIDE_AM, REST[0], WIDE_LATIN];
if (W3.some((n) => !LATE_IN.includes(n))) throw new Error('a winner is not a survivor of the late round');

const POL_OUT = 'ชื่อมีตัวนี้ ตก';
const G = () => th(GAME, 'game name', 'ticket');
const FL = () => OPTIONS.D1[KIT_OPT('D1')];
const topLine = (txt) => `<div class="top"><span class="ev">${G()}</span><span class="lk">${txt}</span></div>`;
const regRound = (n) => th(`รอบที่ ${n}`, 'mini-event: round label');

// a name with its marked clusters: a cluster is a consonant with its own marks, never split from them
function markName(name, letter) {
  nm(name);
  if (!letter) return esc(name);
  let out = '', run = '';
  for (const c of clusters(name)) { if (sameLetter(c, letter)) { out += esc(run) + `<span class="mk">${esc(c)}</span>`; run = ''; } else run += c; }
  return out + esc(run);
}

// ---- the name wall (the dense field of the kit, names only, G331-D5 A) and the letter beside the name (D5 B) ----
function nameWall(cells, opt, page = 1) {
  const o = OPTIONS.D1[opt]; const shown = cells.slice((page - 1) * o.perPage, page * o.perPage);
  const judged = shown.every(([, s]) => s === 'in' || s === 'out');
  const ex = judged ? ` data-expect="${shown.length}/${shown.filter(([, s]) => s === 'in').length}"` : '';
  const style = `grid-template-columns: repeat(${o.cols}, minmax(0, 1fr)); grid-auto-rows: minmax(${o.rowMin}px, auto); column-gap: ${o.gapX}px;`;
  return `<div class="dense" style="${style}"${ex}>${shown.map(([n, s]) => `<div class="wc${s ? ' ' + s : ''}"><span class="${fit(o.floor, o.nameMax)}">${markName(n, s ? LETTER : null)}</span></div>`).join('')}</div>`;
}
const wordOf = (n, letter) => { const h = hits(n, letter); return h ? (h > 1 ? `${letter}×${h}` : letter) : ''; };
const plain = () => NAMES.map((n) => [n, '']);
const judged1 = () => NAMES.map((n) => [n, state1(n)]);
export const wallHtml = (opt, d5 = opt) => (d5 === 'A' ? nameWall(judged1(), KIT_OPT('D1')) : denseField(NAMES.map((n) => [n, wordOf(n, LETTER), state1(n)]), KIT_OPT('D1')));

// The generated wall, read back: every cell's state, mark count and beside-letter must follow from the drawn letter.
export function assertWallHtml(html, letter, polarity = 'out') {
  const un = (s) => s.replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
  const bad = (m) => { throw new Error(`wall: ${m}`); };
  let n = 0;
  for (const m of html.matchAll(/<div class="wc(?: (in|out))?">(.*?)<\/div>/g)) {
    n++;
    const wd = (m[2].match(/<span class="wd"[^>]*>(.*?)<\/span>/) ?? [])[1];
    const inner = m[2].replace(/<span class="wd"[^>]*>.*?<\/span>/, '');
    const marks = [...inner.matchAll(/<span class="mk">(.*?)<\/span>/g)].map((x) => un(x[1]));
    const name = un(inner.replace(/<[^>]+>/g, ''));
    const h = hits(name, letter);
    const wantState = m[1] ? ((h > 0) === (polarity === 'out') ? 'out' : 'in') : '';
    if ((m[1] ?? '') !== wantState) bad(`${JSON.stringify(name)} holds the letter ${letter} ${h} times but is marked "${m[1] ?? ''}", not "${wantState}"`);
    if (wd === undefined && m[1] && marks.length !== h) bad(`${JSON.stringify(name)} has ${marks.length} marked clusters, expects ${h}`);
    if (marks.some((c) => !sameLetter(c, letter))) bad(`${JSON.stringify(name)} marks a cluster that is not ${letter}`);
    if (wd !== undefined && un(wd) !== wordOf(name, letter)) bad(`${JSON.stringify(name)} shows "${un(wd)}" beside it, expects "${wordOf(name, letter)}"`);
  }
  if (!n) bad('no cell found');
  return n;
}

// ---- projector frames ----
const letterCard = (opt, letter = LETTER) => ruleCard(th('ตัวอักษรรอบนี้', 'letter card: heading'),
  opt === 'A' ? `<span class="ltr">${esc(letter)}</span>` : `<span class="ltr">${esc(letter)}</span><span class="kw">${th(WORD_OF_LETTER, 'letter card: the alphabet word (G331-D4 B)')}</span>`,
  th(POL_OUT, 'polarity: a name that holds the letter is out'));
const letterFrame = (opt) => stage('letter', opt, `${topLine(regRound(1))}${nameWall(plain(), KIT_OPT('D1'))}${letterCard(opt)}`);
const redrawFrame = () => stage('redraw', 'B', `${topLine(regRound(1))}${nameWall(plain(), KIT_OPT('D1'))}${hud(G(), th(`ไม่มีใครมีตัว ${SKIP} จึงสุ่มตัวใหม่`, 'redraw: the skipped letter and why (G331-D6 B)'))}${letterCard('A')}`);
const legend = () => `<div class="legend"><div class="wc in"><span class="lg">${th('ผ่าน', 'legend: passed', 'g302')}</span></div><div class="wc out"><span class="lg">${th('ไม่ผ่าน', 'legend: did not pass', 'g302')}</span></div></div>`;
function wallFrame(opt) {
  const o = OPTIONS.D1[KIT_OPT('D1')];
  const page = o.perPage < NAMES.length ? `<div class="lk">${th('หน้า 1 จาก 2', 'dense field: page indicator')}</div>` : '';
  const band = lowBand(`<div class="gname">${G()}</div>`, legend(), `${page}<div class="lk">${th('ผ่านรอบที่ 1', 'reveal: passed heading', 'g302')}</div>${count(IN1.length, th('คน', 'unit: people', 'g302'))}`, 'slim');
  return stage('wall', opt, `${topLine(th(`รอบที่ 1 · ตัว ${LETTER} · ${POL_OUT}`, 'round line: round, the letter, the polarity'))}${wallHtml(opt)}${band}`);
}
function lateFrame(opt) {
  const floor = FL().floor;
  const cell = (n) => {
    const s = hits(n, L2) ? 'out' : 'in';
    if (opt === 'A') return `<div class="wc ${s}" style="padding-left: 40px; padding-right: 40px;"><span class="${fit(36, 64)}">${markName(n, L2)}</span></div>`;
    return `<div class="wc ${s}" style="padding-left: 16px; padding-right: 24px; column-gap: 8px;"><span class="wd" data-min="${floor}" style="width: 120px; font-size: 44px;">${esc(wordOf(n, L2))}</span><span class="${fit(36, 64)}">${markName(n, null)}</span></div>`;
  };
  const style = 'grid-template-columns: repeat(3, minmax(0, 1fr)); grid-auto-rows: minmax(130px, auto); column-gap: 28px; row-gap: 28px;';
  const band = lowBand(`<div class="gname">${G()}</div>`, legend(), `<div class="lk">${th('ผ่านรอบที่ 6', 'reveal: passed heading, round 6')}</div>${count(LATE_IN.length, th('คน', 'unit: people', 'g302'))}`, 'slim');
  return stage('late', opt, `${topLine(th(`รอบที่ 6 · ตัว ${L2} · ${POL_OUT}`, 'round line: round, the letter, the polarity'))}<div class="dense" style="${style}" data-expect="${LATE.length}/${LATE_IN.length}">${LATE.map(cell).join('')}</div>${band}`);
}
const preFrame = () => stage('pre', 'F', `${topLine(th('รอพิธีกรจับตัวอักษร', 'waiting for the letter'))}${nameWall(plain(), KIT_OPT('D1'))}${lowBand(`<div class="gname">${G()}</div>`, `<div class="lk">${th('หาชื่อของคุณบนจอ', 'pre: find your name')}</div>`, count(NAMES.length, th('คน', 'unit: people', 'g302')), 'slim')}`);
const winFrame = () => stage('win', 'F', `${topLine(regRound(7))}${hud(th('ผู้ชนะ', 'mini-event: winners heading'), th(`${WINNERS} คน`, 'mini-event: winner count'))}${winners(W3)}`);

// ---- phone frames (real pixels at 320px). No pick screen: the name was typed at the join. ----
const EVP = () => th(GAME, 'game name', 'ticket');
const nameCard = (n, letter) => `<div class="nmc"><span class="${fit(16, 32)}">${markName(n, letter)}</span></div>`;
const roundLine = () => th(`ตัวอักษรรอบนี้ ${LETTER} · ${POL_OUT}`, 'phone: the letter and the polarity');
const phWait = () => phone('ph-wait', 'F', `${phoneHead(th('คุณอยู่ในเกมแล้ว', 'phone: joined heading'), th('นี่คือชื่อของคุณบนจอ', 'phone: your name on the screen'), EVP())}${nameCard(ME, null)}<p class="msg">${th('รอพิธีกรจับตัวอักษร', 'waiting for the letter')}</p>`);
const phSafe = () => phone('ph-safe', 'F', `${phoneHead(th('ผลรอบที่ 1', 'phone: result heading'), '', EVP())}${verdict(th('ผ่าน', 'legend: passed', 'g302'), '', roundLine())}${nameCard(ME, LETTER)}<p class="msg">${th('ชื่อของคุณไม่มีตัวนี้', 'phone: your name does not hold the letter')}</p><p class="msg">${th('รอรอบที่ 2', 'mini-event phone: waiting for round 2')}</p>`);
const phOut = (id, name) => phone(id, 'F', `${phoneHead(th('ผลรอบที่ 1', 'phone: result heading'), '', EVP())}${verdict(th('ไม่ผ่าน', 'legend: did not pass', 'g302'), 'out', roundLine())}${nameCard(name, LETTER)}<p class="msg">${th('ชื่อของคุณมีตัวนี้', 'phone: your name holds the letter')}</p>`);

// ---- board-only CSS and roles ----
const BOARD_CSS = `
    /* ---- Gh331NameLetter: the drawn letter, the marked cluster, the phone name card ---- */
    .pj .rc .ltr { font-size: 360px; line-height: 1.1; }
    .pj .rc .kw { font-size: 96px; margin-left: 28px; }
    .pj .mk { display: inline-block; padding: 0 1px; line-height: 1; font-weight: 700; }
    .pj .wc.out .mk { color: #ffcc00; border-bottom: 3px solid #ffcc00; }
    .pr .nmc { box-sizing: border-box; margin-top: 16px; min-block-size: 64px; display: flex; align-items: center; padding: 8px 16px; border-radius: 16px; background-color: #23214d; box-shadow: inset 0 0 0 2px #d9d6f0; }
    .pr .nmc .fit { flex: 1 1 auto; min-width: 0; text-align: center; font: 700 32px/1.3 'Sarabun', sans-serif; color: #ffffff; white-space: nowrap; overflow-x: clip; overflow-y: visible; }
    .pr .mk { display: inline-block; padding: 0 2px; line-height: 1; font-weight: 700; color: #ffcc00; border-bottom: 3px solid #ffcc00; }`;
const T = 'tokens.css';
const BOARD_ROLES = [
  ['marked cluster, cell that did not pass', '.pj .wc.out .mk', ['color:#ffcc00', 'border-width:3px', 'border-color:#ffcc00'], `PROPOSAL; ${T} --accent-gold letter and underline (the gold figure on the dimmed cell)`],
  ['phone name card', '.pr .nmc', ['background-color:#23214d', 'radius:16px', 'box-shadow:#d9d6f0 0px 0px 0px 2px inset'], `PROPOSAL; #23214d, ${T} --ink-on-band-soft ring (the phone choice ring)`],
  ['phone name', '.pr .nmc .fit', ['color:#ffffff'], `${T} --ink-light`],
  ['phone marked cluster', '.pr .mk', ['color:#ffcc00', 'border-width:3px', 'border-color:#ffcc00'], `PROPOSAL; ${T} --accent-gold letter and underline`],
];

export const EXPECT = {
  A: ['letter', 'wall', 'late'],
  B: ['letter', 'wall', 'late', 'redraw'],
  F: ['pre', 'win', 'ph-wait', 'ph-safe', 'ph-out', 'ph-odd'],
};

const D4 = { A: 'THE LETTER ALONE', B: 'THE LETTER WITH ITS ALPHABET WORD' };
const D5 = { A: 'THE LETTER MARKED INSIDE THE NAME', B: 'THE LETTER BESIDE THE NAME' };
const D6 = { A: 'A SILENT REDRAW', B: 'A SHOWN REDRAW' };

export function build() {
  resetCopy();
  th('คน', 'unit: people', 'g302'); th('ผ่าน', 'legend: passed', 'g302'); th('ไม่ผ่าน', 'legend: did not pass', 'g302'); th('ผ่านรอบที่ 1', 'reveal: passed heading', 'g302');
  const d1 = OPTIONS.D1; const o = FL();
  const frames = {
    letterA: letterFrame('A'), letterB: letterFrame('B'), wallA: wallFrame('A'), wallB: wallFrame('B'), lateA: lateFrame('A'), lateB: lateFrame('B'),
    redraw: redrawFrame(), pre: preFrame(), win: winFrame(), wait: phWait(), safe: phSafe(), out: phOut('ph-out', 'กอล์ฟ ก.'), odd: phOut('ph-odd', 'Kanok-wan ก.'),
  };
  // the generated walls re-read: a state, a mark or a beside-letter that does not follow from the letter stops the build
  assertWallHtml(wallHtml('A'), LETTER); assertWallHtml(wallHtml('B'), LETTER);
  const stub = `<div class="stub" style="width: 1000px; height: 300px;">A · SILENT: the room only ever sees the final letter card (the G331-D4 frame). The skipped letter is never drawn, so there is nothing to read, nothing to explain and no frame for it.</div>`;
  const out1 = NAMES.length - IN1.length; const oddCount = ODD.length;
  const rows = [
    decisionsRow([
      ['<b>G331-D4</b> the drawn-letter card on the main screen', 'THIS GAME · gh#331', `<b>A ${D4.A}</b>: the letter alone, 360px on the white card, the polarity pill under it (default)`, `<b>B ${D4.B}</b>: the letter plus the word a Thai child learns for it (ก ไก่), 360px and 96px, the pill under it`, 'awaiting the owner'],
      ['<b>G331-D5</b> how a match shows on a name (the 200-name wall and the late rounds)', 'THIS GAME · gh#331', `<b>A ${D5.A}</b>: the cluster that holds the letter gets a gold mark inside the name (default); the whole cell is struck when the name is out`, `<b>B ${D5.B}</b>: the name stays plain; the kit word column beside it carries the letter, with × and a count when it appears more than once`, 'awaiting the owner'],
      ['<b>G331-D6</b> a redraw (the rule would leave nobody, everybody or fewer than the winners)', 'THIS GAME · gh#331', `<b>A ${D6.A}</b>: the card turns straight to the final letter; the skipped letter is never drawn (default)`, `<b>B ${D6.B}</b>: one line above the card says which letter was skipped and why, then the card shows the next one`, 'awaiting the owner'],
      ['<b>D1</b> glyph floor on the densest projector screen', 'SHARED (kit) · decided on Gh326PickRule', 'not redrawn here', 'not redrawn here', pickNote('D1')],
      ['<b>D3</b> grouping of the 14-digit round code', 'SHARED (kit) · not shown', 'this page has no round code (a mini-event has no event round)', 'this page has no round code', 'n/a'],
    ]),
    sec('G331-D4 · THE DRAWN LETTER · the main screen, 1920x1080 at scale 1', `The MC draws the letter; the white card from the rule-card pattern (gh#303 picked) shows it over the veiled name wall, with the polarity under it. Round 1 of a mini-event with ${NAMES.length} names; the letter is ${esc(LETTER)}. B adds the word a Thai child learns for the letter. Not offered in B: a Latin letter has no such word, so a Latin round would draw A. If B is picked, the obsolete letters ฃ and ฅ must leave the draw pool (the word of ฃ is a bottle, and the join key folds both letters into ข and ค).`,
      cands([cand(tag('A', D4.A, ' (default)'), frames.letterA), cand(tag('B', D4.B, ''), frames.letterB)], true)),
    sec('G331-D5 · A MATCH ON A NAME · the wall after the draw, and a late round', `The wall is the kit dense field read at the shared D1 (${pickNote('D1')}), names only. Polarity drawn: a name that holds ${esc(LETTER)} is out (${out1} of ${NAMES.length}), ${IN1.length} stay. The names include ${oddCount} odd ones that a real join admits (a bare ${esc(LETTER)}, twelve of it, an apostrophe and digits, mixed scripts, Thai digits, stacked marks) beside the kit's three worst NAME FIT cases. A marks the cluster, a consonant with its own marks, so a mark never leaves its consonant: the cluster turns gold, bold and underlined, and an inline block keeps the strike of an out name from running through it; B keeps the name plain and uses the word column. The late frames are round 6 of the same event, nine survivors at ${esc(L2)}: the name 12 x ${esc(L2)} is marked end to end, and two of the kit's worst-case names stay in.`,
      cands([cand(tag('A', D5.A, ' (default), the wall'), frames.wallA), cand(tag('B', D5.B, ', the wall'), frames.wallB)], true)
      + cands([cand(tag('A', D5.A, ', a late round'), frames.lateA), cand(tag('B', D5.B, ', a late round'), frames.lateB)], true)),
    sec('G331-D6 · A REDRAW · the rule would leave nobody, everybody or fewer than the winners', `Drawn: the first letter was ${esc(SKIP)}, which nobody in this event has, so the draw would leave all ${NAMES.length} in (the redraw rule rejects it: ${esc((() => { try { assertRedraw(SKIP, NAMES, WINNERS); return ''; } catch (e) { return e.message; } })())}). The redraw is automatic (gh#311). A shows the room only the final card; B says what was skipped. The line in B names one reason; the three reasons (nobody, everybody, fewer than the winner count) each need a line, listed in the copy table.`,
      cands([cand(tag('A', D6.A, ' (default)'), stub), cand(tag('B', D6.B, ''), frames.redraw)], true)),
    sec('SHARED · THE MINI-EVENT PAGE · the names are typed at the join; nothing is picked', `Players join by QR and type their name (gh#308); the rule is a letter, so there is no pick screen and no pick timer on this page, and a name cannot change once joined. The screens: the wall before the draw, the winners after the last round, and the phone's four states. The winners frame is round 7 of the same event: ${WINNERS} of the six survivors, one of them a worst-case name. Phones are real pixels at 320px; the marked cluster sits in the name card, never in a message line.`,
      cands([cand(tag('F', 'BEFORE THE DRAW', ' the names that joined'), frames.pre), cand(tag('F', 'WINNERS', ''), frames.win)], true)
      + cands([cand(tag('F', 'PHONE · JOINED', ''), frames.wait), cand(tag('F', 'PHONE · PASSED', ''), frames.safe), cand(tag('F', 'PHONE · DID NOT PASS', ' a name with two marks'), frames.out), cand(tag('F', 'PHONE · AN ODD NAME', ' mixed scripts, 12 clusters'), frames.odd)])),
    sec('VALUES · kit values and this board\'s own', 'Every frame value is a literal from tokens.css, a gh#302 / gh#303 pick, the kit, or a PROPOSAL named here.',
      valuesTable([...KIT_VALUES,
        ['360px Mitr 700 (line 1.1) and 96px Mitr 700', 'the drawn letter and its alphabet word on the white card', 'PROPOSAL (the card is the gh#303 picked rule card)'],
        ['gold bold type with a 3px gold underline', 'the marked cluster (in an out cell on the projector, in the name card on the phone)', 'PROPOSAL, tokens.css --accent-gold'],
        ['Sarabun 700, 16px to 32px NAME FIT, #23214d card, 2px #d9d6f0 ring', 'the phone name card', 'PROPOSAL; the ring is the phone choice ring'],
      ]) + contrastTable(KIT_PAIRS)),
    sec('BEATS · the draw on the main screen (3D intent)', 'Beat timing follows the gh#303 picked flip (600ms per turn); every beat has a reduced-motion form (ADR-0046: reduce, not remove). The letter arrives on the same white card the rule games use, with no prop of any kind.', beatTable([
      ['the letter drawn', '1.5s', 'the white card turns in over the veil with the letter; the polarity pill settles under it', 'the card fades in on its final value (200ms)'],
      ['a redraw (G331-D6 B only)', '1.2s', 'the line naming the skipped letter appears; the card turns out and the next card turns in', 'the line and the next card fade in'],
      ['the sweep', '600ms per row, rows overlap', 'names turn row by row from the top; a marked cluster lights as its row lands', 'every name changes in place with one 200ms fade, marks included'],
      ['the next round', 'held', 'the survivors regroup into larger cells', 'one 200ms fade'],
      ['the winners', 'held', 'the winner cards rise onto the stage floor', 'one 200ms fade'],
    ])),
    nameFitRow([
      ['wall names (D1 A), names only', 'Sarabun 400', `${d1.A.nameMax}px`, `${d1.A.floor}px`, `a ${d1.A.cols}-column cell less padding`, 'measured by the render (fit report)'],
      ['wall names (D1 B), names only', 'Sarabun 400', `${d1.B.nameMax}px`, `${d1.B.floor}px`, `a ${d1.B.cols}-column cell less padding`, 'measured by the render (fit report)'],
      ['wall names with the letter beside (D5 B)', 'Sarabun 400', `${o.nameMax}px`, `${o.floor}px`, 'the kit cell less the word column', 'measured by the render (fit report)'],
      ['late-round names', 'Sarabun 400', '64px', '36px', 'a third of the width less 80px padding', 'measured by the render'],
      ['mini-event winners', 'Mitr 700', '64px', '40px', '1100px card less 80px padding', 'measured by the render'],
      ['phone name card', 'Sarabun 700', '32px', '16px', 'the 288px column less 32px padding', 'measured by the render'],
    ]),
    copyRow(),
    rolesRow([...KIT_ROLES, ...BOARD_ROLES]),
    notesRow([
      '<b>Rests on:</b> gh#311 (the plan, the owner design grilling of 2026-11-11 06:34 that makes this a mini-event page only, and the owner rulings of 2026-11-19), gh#331 (the game), ADR-0076 and the picks design doc (the pick routes: an option index, never free text), the QR join name rules (the allow-list, 12 clusters), ADR-0026 (names are attacker-owned input; escaped at the sink), ADR-0051 (never-blank), gh#299 decision 11 (3D main screen) and its wording constraint, CONTEXT.md (company-party category).',
      '<b>Not drawn, with the reason:</b> the pick screen, the pick timer and "change your pick until the MC closes picking". gh#331 gives players nothing to pick: the typed name is the entry, a name cannot change once joined, and the pick route takes only an option index below the round\'s count, never a name or a letter. The 14-digit round code (D3) is not drawn either: it belongs to event rounds, and this game never runs as one. If the owner wants a real choice on this page, that is a product question for gh#311, not a visual one.',
      '<b>Assumptions, stated not asked:</b> the drawn letter is a Thai consonant or a Latin letter (language per round, gh#311); a Latin letter ignores case; a Thai letter matches the exact consonant, tone marks and vowel signs are never the drawn letter (a lone mark draws as a dash on a hyphen, the D2 finding on Gh326PickRule); a name in one script can never hold a letter of the other, so which script a round draws decides which names can be hit. The board draws the wall at 200 names, the setup cap (MAX_HEADS); the join function holds 300 slots, and its own comment sizes the draw for 50 to 200 people and calls the rest slack for re-joins.',
      '<b>Names:</b> the join allow-list admits Thai letters, vowels, marks and digits, ASCII letters and digits, the space and . - \' _ , so markup characters cannot reach this page through a join; the escape at the sink stays required (ADR-0026) and is the code ticket\'s test, not drawn here. The odd names are drawn inside the allow-list. A scan of the rendered text refuses accented Latin, other scripts and invisible marks, so none is drawn.',
      '<b>Not covered:</b> a real projector, room or viewing distance; the 3D motion itself (frames are stills, beats are described); the never-blank 2D frame and the reveal flip (drawn once on Gh326PickRule; this wall is the same field); the MC\'s own controls; phone widths other than 320px; more than 200 names; English-only rounds; the opposite polarity (a name that holds the letter stays), whose marks would sit on gold passed cells and are not drawn; in G331-D5 B the letter beside an out name is dim and struck like the rest of the cell (the kit paint), where A keeps the marked cluster gold.',
    ]),
  ];
  const head = [ORDER_LINE,
    `Game 6 of the seven letter and word games (gh#331), a mini-event page only: no event round, no round code, no pick. Shared kit: docs/verification/evidence/gh325-boards-2026-11-20/kit.mjs (gh#325). Decisions: G331-D4, G331-D5 and G331-D6 are this game's; ${pickNote('D1')}; D3 does not apply to this page.`,
    `Fixture: the gh#302 roster at the setup cap of 200 with seven odd names that the join admits, plus the three NAME FIT worst cases. Round 1 draws ${LETTER}: a name that holds it is out (${out1} out, ${IN1.length} stay); winners: ${WINNERS}.`];
  return boardDoc(NAME, 'gh#331 board (ชื่อใครมีตัวนี้) on the gh#325 kit.', head, BOARD_CSS, rows);
}

// Board-specific must-red plants (the kit's generic plants are added by mustred.mjs).
export const PLANTS = [
  ['field-count', (s) => s.replace(/data-expect="(\d+)\/(\d+)"/, (m, a, b) => `data-expect="${a}/${Number(b) + 1}"`), /field count in A\/wall: holds/],
  ['mark-ink', (s) => s.replace('</style>', '.pj .wc.out .mk { color: #00ff00 !important; }</style>'), /\(role: marked cluster, cell that did not pass\) renders color:#00ff00/, 'class="mk"'],
  ['letter-clip', (s) => s.replace('</style>', '.pj .rc .ltr { letter-spacing: 1200px !important; }</style>'), /clipped in A\/letter/],
  ['phone-name-clip', (s) => s.replace('</style>', '.pr .nmc .fit { font-size: 90px !important; white-space: nowrap !important; overflow-wrap: normal !important; }</style>'), /clipped in F\/ph-out: กอล์ฟ ก\./],
];

// Extra must-red commands run from the kit dir: the build guards, each with a control that must stay green.
const guardArgs = (code) => ['--input-type=module', '-e', `import * as M from './board-nameletter.mjs'; ${code}`];
export const EXTRA = [
  ['wall guard control', guardArgs("M.assertWallHtml(M.wallHtml('A'), M.LETTER); M.assertWallHtml(M.wallHtml('B'), M.LETTER);"), {}, null],
  ['wall guard: a passed name marked out', guardArgs("M.assertWallHtml(M.wallHtml('A').replace('<div class=\"wc in\">', '<div class=\"wc out\">'), M.LETTER);"), {}, /wall: .* holds the letter .* 0 times but is marked "out", not "in"/],
  ['wall guard: a mark removed', guardArgs("M.assertWallHtml(M.wallHtml('A').replace('<span class=\"mk\">', '<span>'), M.LETTER);"), {}, /wall: .* has \d+ marked clusters, expects \d+/],
  ['wall guard: the wrong beside-letter', guardArgs("M.assertWallHtml(M.wallHtml('B').replace('>ก×2<', '>ก<'), M.LETTER);"), {}, /wall: .* shows "ก" beside it, expects "ก×2"/],
  ['redraw guard: a letter that leaves everybody', guardArgs("M.assertRedraw('ฬ', M.NAMES, 3);"), {}, /redraw: ฬ leaves everybody/],
  ['redraw guard: a letter that leaves nobody', guardArgs("M.assertRedraw('ก', ['ก', 'กข'], 1);"), {}, /redraw: ก leaves nobody/],
  ['redraw guard: fewer than the winners', guardArgs("M.assertRedraw('ก', ['ก', 'ก', 'กข', 'ขข'], 3);"), {}, /redraw: ก leaves 1, fewer than the 3 winners/],
  ['name guard: markup in a name', guardArgs("M.assertName('<b>ก</b>');"), {}, /outside the join allow-list/],
];

export const BOARD = { name: NAME, build, expect: EXPECT, plants: PLANTS, extra: EXTRA, sel: {}, floors: {} };
