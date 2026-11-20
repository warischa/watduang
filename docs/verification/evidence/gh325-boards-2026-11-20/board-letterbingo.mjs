// gh#328 proposal board: game 3 of the prize draw (letter bingo), on the gh#325 kit. Writes
// design/Gh328LetterBingo.dc.html through make-boards.mjs. Owns the board decisions G328-D4 (the draw on the main
// screen), G328-D5 (the admin-mode field during the draws) and G328-D6 (what a mini-event player picks); draws the
// SHARED kit decisions D1 and D3 at their kit value and says so (pickNote), never their options.
//
// The event fixture follows the engine 2b composition for game 3 (src/prize-round/bingo.ts at the source commit,
// read once, copied as literals, nothing imported): 42 Thai consonants split into SHARED 6, OWN_0 6, OWN_1 6 and a
// REST of 24; script g draws SHARED + OWN_g, 12 letters; a group-g card holds m marks (4 to 6) from SHARED + OWN_g,
// at most 3 of them from SHARED, plus REST filler. assertBingoCut re-checks the exact cut on the fixture itself.
import {
  th, nm, fit, esc, rng, shuffle, resetCopy, contrastTable, valuesTable, beatTable, nameFitRow, notesRow,
  OPTIONS, KIT_OPT, KIT_VALUE, pickNote, WORD_ROUND, ME, CAP_NAME, WIDE_AM, wordCode, wordCol, boardDoc, ORDER_LINE,
  decisionsRow, rolesRow, copyRow, sec, cand, cands, tag, stage, phone, topBar, hud, lowBand, count, floorLayer,
  codeCard, codeField, phoneHead, ruleTap, goButton, verdict, poolButtons, timer, winners,
  KIT_ROLES, KIT_VALUES, KIT_PAIRS,
} from './kit.mjs';

const NAME = 'Gh328LetterBingo';
const SRC_GAME = 'gh#328 body and gh#311 (title kept, 2026-11-11) · owner wording, verbatim (the game name)';
const SRC_2B = 'Gh326PickRule kit preview of the engine 2b phone (PROPOSED there) · verbatim, so games 2-4 read alike';
const GAME = () => th('บิงโกอักษร', 'game name', SRC_GAME);

// ---- the event fixture (engine 2b, game 3) ----
export const ALPHABET = [...'กขคฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ'];
export const DRAWS = 12, SHARED_N = 6, THRESHOLD = 4, MAX_OWN = 6, CARD = 9;
// The three consonants of a word gh#299 bars, held as escapes (the raw Thai scan reads this file). A card holding all
// three could print it along a row, or in the page text; no card here holds them together.
const BARRED_TRIO = ['ห', 'ว', 'ย'];
const holdsTrio = (card) => BARRED_TRIO.every((l) => card.includes(l));
const pick = (arr, k, r) => shuffle(arr, r).slice(0, k);
export const scoreAt = (script, card, k) => { const drawn = new Set(script.slice(0, k)); return card.filter((l) => drawn.has(l)).length; };

const SPLIT = (() => { const o = shuffle(ALPHABET, rng(328)); return { shared: o.slice(0, SHARED_N), own: [o.slice(SHARED_N, 12), o.slice(12, 18)], rest: o.slice(18) }; })();
export const SCRIPTS = (() => { const r = rng(3280); return [shuffle([...SPLIT.shared, ...SPLIT.own[0]], r), shuffle([...SPLIT.shared, ...SPLIT.own[1]], r)]; })();
export const CARDS = (() => {
  const r = rng(3281); const m = new Map();
  for (const n of WORD_ROUND.names) {
    const g = WORD_ROUND.group.get(n);
    for (;;) {
      const marks = THRESHOLD + Math.floor(r() * (MAX_OWN - THRESHOLD + 1));
      const zLow = Math.max(0, marks - SPLIT.own[g].length); const zHigh = Math.min(THRESHOLD - 1, marks, SHARED_N);
      const z = zLow + Math.floor(r() * (zHigh - zLow + 1));
      const card = shuffle([...pick(SPLIT.shared, z, r), ...pick(SPLIT.own[g], marks - z, r), ...pick(SPLIT.rest, CARD - marks, r)], r);
      if (!holdsTrio(card)) { m.set(n, card); break; }
    }
  }
  return m;
})();
// The exact cut: under either candidate script, the cards reaching THRESHOLD are exactly one group of `keep`, and a
// card reaches it under its own script only. Throws on any break, so a broken fixture never writes a board.
export function assertBingoCut(cards = CARDS, scripts = SCRIPTS, ev = WORD_ROUND) {
  const bad = (msg) => { throw new Error(`bingo cut: ${msg}`); };
  for (const [n, card] of cards) {
    if (card.length !== CARD || new Set(card).size !== CARD) bad(`${n} holds ${new Set(card).size} distinct letters, not ${CARD}`);
    if (holdsTrio(card)) bad(`${n} holds the three letters of a barred word`);
    const g = ev.group.get(n); const own = scoreAt(scripts[g], card, DRAWS), other = scoreAt(scripts[1 - g], card, DRAWS);
    if (own < THRESHOLD) bad(`${n} (group ${g}) scores ${own} under its own script, below the threshold ${THRESHOLD}`);
    if (other >= THRESHOLD) bad(`${n} (group ${g}) scores ${other} under the other script, at or above the threshold ${THRESHOLD}`);
  }
  for (const s of [0, 1]) { const n = [...cards.values()].filter((c) => scoreAt(scripts[s], c, DRAWS) >= THRESHOLD).length; if (n !== ev.keep) bad(`under script ${s}, ${n} cards reach the threshold, not keep ${ev.keep}`); }
}
assertBingoCut();
// Must-red helpers (run by BOARD.extra through node -e): a copy of the fixture with one fault each.
export const plantCut = () => { const c = new Map(CARDS); const n = WORD_ROUND.names.find((x) => WORD_ROUND.group.get(x) === 0); const other = SCRIPTS[1].filter((l) => !c.get(n).includes(l)); c.set(n, [...c.get(n).filter((l) => SCRIPTS[1].includes(l)), ...other].slice(0, CARD)); return c; };
export const plantTrio = () => { const c = new Map(CARDS); c.set(ME, [...BARRED_TRIO, ...c.get(ME).filter((l) => !BARRED_TRIO.includes(l))].slice(0, CARD)); return c; };

const STEP = 7; // the draws drawn mid-reveal
const DRAWN = SCRIPTS[0].slice(0, STEP);
const isDrawn = (l, k = STEP) => SCRIPTS[0].slice(0, k).includes(l);
const OUT_NAME = WORD_ROUND.names.find((n) => WORD_ROUND.group.get(n) === 1);
const CODE = wordCode(1, { seed: '30418', cut: WORD_ROUND.keep, revision: 1, kind: 52, pool: 'general' });
const POL = () => [th('ครบ 4 ตัว รอด', 'polarity: 4 marks or more = survive'), th('ครบ 4 ตัว ตก', 'polarity: 4 marks or more = out')];
const SCRIPT_LABELS = () => [th('ชุด ก', 'kit 2b phone: script 1', SRC_2B), th('ชุด ข', 'kit 2b phone: script 2', SRC_2B)];
const drawnLine = () => `${SCRIPT_LABELS()[0]} · ${POL()[0]}`;
const stepLabel = (k) => th(`ตัวที่ ${k} จาก ${DRAWS}`, 'draw: step label');

// ---- the dense field (admin mode). The kit's denseField escapes its word, so the per-letter marks of G328-D5 B
// need this copy of its markup: the same classes, the D1 kit option's floor, columns and rows. ----
function bingoField(cells, wdOf, width, cls = '') {
  const o = OPTIONS.D1[KIT_OPT('D1')];
  const judged = cells.every(([, s]) => s === 'in' || s === 'out');
  const ex = judged ? ` data-expect="${cells.length}/${cells.filter(([, s]) => s === 'in').length}"` : '';
  const style = `grid-template-columns: repeat(${o.cols}, minmax(0, 1fr)); grid-auto-rows: minmax(${o.rowMin}px, auto); column-gap: ${o.gapX}px;`;
  return `<div class="dense" style="${style}"${ex}>${cells.map(([n, s]) => `<div class="wc${s ? ' ' + s : ''}"><span class="wd${cls}" data-min="${o.floor}" style="width: ${width}px; font-size: ${o.floor}px;">${wdOf(n)}</span><span class="${fit(o.floor, o.nameMax)}">${nm(n)}</span></div>`).join('')}</div>`;
}
const LETTERS_W = () => wordCol(OPTIONS.D1[KIT_OPT('D1')].floor);
const COUNT_W = () => Math.ceil(OPTIONS.D1[KIT_OPT('D1')].floor * 1.5) + 4;
const plainLetters = (n) => esc(CARDS.get(n).join(''));
const litLetters = (n) => CARDS.get(n).map((l) => `<span class="lm${isDrawn(l) ? ' mk' : ''}">${esc(l)}</span>`).join('');
const markCount = (k) => (n) => String(scoreAt(SCRIPTS[0], CARDS.get(n), k));
const judged = (n) => (scoreAt(SCRIPTS[0], CARDS.get(n), DRAWS) >= THRESHOLD ? 'in' : 'out');

// ---- G328-D4: the draw on the main screen (QR mode, draw 7 of 12) ----
const D4 = { A: 'ONE TILE AND A RAIL', B: 'ALPHABET CHART' };
const drawBand = () => lowBand(`<div class="lk">${drawnLine()}</div>`, '<div></div>', `<div class="lk">${th('ออกแล้ว', 'draw: drawn so far')}</div>${count(STEP, th('ตัว', 'unit: letters'), 'sm')}`, 'slim');
function drawFrame(opt) {
  const head = `${topBar(1)}${hud(GAME(), stepLabel(STEP))}`;
  if (opt === 'A') {
    const rail = SCRIPTS[0].map((l, i) => (i < STEP ? `<div class="rs mk${i === STEP - 1 ? ' new' : ''}">${esc(l)}</div>` : '<div class="rs"></div>')).join('');
    return stage('draw', 'A', `${head}<div class="dt">${esc(DRAWN[STEP - 1])}</div><div class="rail">${rail}</div>${drawBand()}`);
  }
  const chart = ALPHABET.map((l) => `<div class="ac${isDrawn(l) ? ' mk' : ''}${l === DRAWN[STEP - 1] ? ' new' : ''}">${esc(l)}</div>`).join('');
  return stage('draw', 'B', `${head}<div class="ach">${chart}</div>${drawBand()}`);
}

// ---- G328-D5: the admin-mode field during the draws (no phones; draw 7 of 12) ----
const D5 = { A: 'MARK COUNT', B: 'LIT LETTERS' };
const drawnRail = () => `<div class="lk">${th('ออกแล้ว', 'draw: drawn so far')} ${DRAWN.map(esc).join(' ')}</div>`;
function fieldFrame(opt) {
  const cells = WORD_ROUND.names.map((n) => [n, '']);
  const field = opt === 'A' ? bingoField(cells, markCount(STEP), COUNT_W()) : bingoField(cells, litLetters, LETTERS_W(), ' ls');
  const band = lowBand(`<div class="gname">${GAME()}</div>`, drawnRail(), `<div class="lk">${drawnLine()}</div><div class="lk">${stepLabel(STEP)}</div>`, 'slim');
  return stage('field', opt, `${topBar(1)}${field}${band}`);
}
const dealFrame = () => stage('deal', 'F', `${topBar(1)}${bingoField(WORD_ROUND.names.map((n) => [n, '']), plainLetters, LETTERS_W(), ' ls')}${lowBand(`<div class="gname">${GAME()}</div>`, `<div class="lk">${th('จำตัวอักษร 9 ตัวข้างชื่อของคุณ', 'deal (admin mode): instruction')}</div>`, count(WORD_ROUND.live, th('คน', 'unit: people', 'g302')), 'slim')}`);
function resultFrame(id, withFloor) {
  const legend = `<div class="legend"><div class="wc in"><span class="lg">${th('ผ่าน', 'legend: passed', 'g302')}</span></div><div class="wc out"><span class="lg">${th('ไม่ผ่าน', 'legend: did not pass', 'g302')}</span></div></div>`;
  const band = lowBand(`<div class="gname">${GAME()}</div>`, legend, `<div class="lk">${th('ผ่านรอบที่ 1', 'reveal: passed heading', 'g302')}</div>${count(WORD_ROUND.keep, th('คน', 'unit: people', 'g302'))}`, 'slim');
  return stage(id, 'F', `${withFloor ? floorLayer() : ''}${topBar(1)}${bingoField(WORD_ROUND.names.map((n) => [n, judged(n)]), markCount(DRAWS), COUNT_W())}${band}`);
}
const codeFrame = () => stage('code', 'F', `${topBar(1)}${hud(GAME())}${codeCard(CODE, 1, KIT_VALUE('D3').groups, th('รหัสรอบที่ 1', 'round code: label (round 1)'), th('ใส่รหัสนี้ในมือถือ เพื่อดูการ์ดของคุณ', 'round code: instruction'))}`);

// ---- the phone (QR mode, engine 2b): the card from the code, the rule tap, then the draws ----
const pcard = (card, k = 0, cls = '') => `<div class="bc${cls}">${card.map((l) => `<div class="bx${k && isDrawn(l, k) ? ' mk' : ''}">${esc(l)}</div>`).join('')}</div>`;
const phCode = () => phone('ph-code', 'F', `${phoneHead(th('ใส่รหัสรอบ', 'phone: code entry heading'), th('รหัส 14 หลักที่ขึ้นบนจอใหญ่', 'phone: code entry hint'))}${codeField(CODE, 1, KIT_VALUE('D3').groups)}${goButton(th('ดูการ์ดของฉัน', 'phone: see my card'))}`);
const phCard = () => phone('ph-card', 'F', `${phoneHead(th('การ์ดตัวอักษรของคุณ', 'phone: card heading'), th('ยังไม่มีตัวไหนออก', 'phone: card, nothing drawn yet'))}${pcard(CARDS.get(ME))}<p class="msg">${th('รอพิธีกรเริ่มจับตัวอักษร', 'phone: waiting for the draws')}</p>`);
const phTap = () => phone('ph-tap', 'F', `${phoneHead(th('แตะชุดที่ขึ้นบนจอ', 'kit 2b phone: rule tap heading', SRC_2B))}${ruleTap(th('ชุดตัวอักษรบนจอ', 'phone: rule tap, which letter set'), SCRIPT_LABELS(), 0, th('บนจอขึ้นว่า', 'phone: rule tap, which polarity', SRC_2B), POL(), 0)}${goButton(th('เริ่มตามจอ', 'phone: follow the screen'))}`);
const meAt = (k) => scoreAt(SCRIPTS[0], CARDS.get(ME), k);
const phDraw = () => phone('ph-draw', 'F', `${phoneHead(stepLabel(STEP), drawnLine())}${pcard(CARDS.get(ME), STEP)}<p class="msg">${th(`ได้ ${meAt(STEP)} ตัว ต้องครบ 4 ตัว`, 'phone: marks so far')}</p>${goButton(th('ตัวถัดไป', 'phone: next letter'))}`);
const phIn = () => phone('ph-in', 'F', `${phoneHead(th('ผลรอบที่ 1', 'phone: result heading'))}${verdict(th('ผ่าน', 'legend: passed', 'g302'), '', th(`ได้ ${meAt(DRAWS)} ตัว ครบ 4 ตัว`, 'phone: result, reached the threshold'))}${pcard(CARDS.get(ME), DRAWS)}`);
const outAt = scoreAt(SCRIPTS[0], CARDS.get(OUT_NAME), DRAWS);
const phOut = () => phone('ph-out', 'F', `${phoneHead(th('ผลรอบที่ 1', 'phone: result heading'))}${verdict(th('ไม่ผ่าน', 'legend: did not pass', 'g302'), 'out', th(`ได้ ${outAt} ตัว ไม่ถึง 4 ตัว`, 'phone: result, under the threshold'))}${pcard(CARDS.get(OUT_NAME), DRAWS)}`);

// ---- G328-D6: the mini-event page (real picks, one integer pick of 2-16 options per round) ----
const D6 = { A: 'ONE CARD OF 16', B: 'ONE LINE OF 8 ON A SHARED CARD' };
export const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const done = (card, drawn) => LINES.findIndex((ln) => ln.every((i) => drawn.includes(card[i])));
export const MINI_B = { card: ['ม', 'ก', 'ต', 'ส', 'น', 'พ', 'ร', 'ช', 'ด'], draws: ['บ', 'ก', 'ร', 'น', 'ล', 'ช'], line: 4 };
export const MINI_A = (() => {
  const r = rng(3282); const cards = [];
  while (cards.length < 16) { const c = pick(ALPHABET, CARD, r); if (!holdsTrio(c)) cards.push(c); }
  const win = 6; const row = LINES[1].map((i) => cards[win][i]);
  const others = ALPHABET.filter((l) => !cards[win].includes(l));
  const draws = [others[0], row[0], others[1], row[1], others[2], row[2]];
  return { cards, draws, win, line: 1 };
})();
// The first full line is the claimed one, at the last draw shown, and nothing completes before it.
export function assertMini(b = MINI_B, a = MINI_A) {
  const bad = (m) => { throw new Error(`mini-event: ${m}`); };
  for (let k = 1; k < b.draws.length; k++) if (done(b.card, b.draws.slice(0, k)) >= 0) bad(`the shared card completes a line at draw ${k}`);
  if (done(b.card, b.draws) !== b.line) bad(`the shared card completes line ${done(b.card, b.draws) + 1}, not ${b.line + 1}`);
  a.cards.forEach((c, i) => { for (let k = 1; k <= a.draws.length; k++) { const d = done(c, a.draws.slice(0, k)); if (d >= 0 && !(i === a.win && k === a.draws.length && d === a.line)) bad(`card ${i + 1} completes line ${d + 1} at draw ${k}`); } });
  if (done(a.cards[a.win], a.draws) !== a.line) bad(`card ${a.win + 1} does not complete its line`);
  for (const c of [b.card, ...a.cards]) if (holdsTrio(c)) bad('a card holds the three letters of a barred word');
}
assertMini();
// Must-red helper: the shared card with its draws reordered so its line completes at draw 3.
export const plantMiniEarly = () => ({ ...MINI_B, draws: ["ก", "น", "ช", "บ", "ร", "ล"] });

const MINI_EV = () => GAME();
const miniTop = (round) => `<div class="top"><span class="ev">${GAME()}</span><span class="lk">${th(`รอบที่ ${round}`, 'mini-event: round label')}</span></div>`;
const cellsOf = (card, drawn, line = -1) => card.map((l, i) => `<div class="bx${drawn.includes(l) ? ' mk' : ''}${line >= 0 && LINES[line].includes(i) ? ' ln' : ''}">${esc(l)}</div>`).join('');
const cardLabel = (i) => th(`การ์ด ${i + 1}`, 'mini-event: card label (A)');
function miniCards(drawn, withLine) {
  return `<div class="mcards">${MINI_A.cards.map((c, i) => `<div class="mc${withLine && i === MINI_A.win ? ' won' : ''}"><div class="lk">${cardLabel(i)}</div><div class="bg">${cellsOf(c, drawn, withLine && i === MINI_A.win ? MINI_A.line : -1)}</div></div>`).join('')}</div>`;
}
function miniLines(drawn, withLine) {
  const c = cellsOf(MINI_B.card, drawn, withLine ? MINI_B.line : -1).split('</div>').filter(Boolean).map((x) => x + '</div>');
  const num = (i) => `<div class="lnum">${i + 1}</div>`;
  const cells = ['<div></div>', c[0], c[1], c[2], num(0), '<div></div>', c[3], c[4], c[5], num(1), '<div></div>', c[6], c[7], c[8], num(2), num(7), num(3), num(4), num(5), num(6)];
  return `<div class="lgrid">${cells.join('')}</div>`;
}
const pickBand = () => lowBand(`<div class="lk">${th('เลือกแล้ว', 'mini-event: picked so far')}</div>${count(37, th('จาก 52 คน', 'mini-event: of N people'), 'sm')}`, timer('0:24'), `<div class="lk">${th('ใครไม่เลือก ระบบสุ่มให้', 'mini-event: random fill')}</div>`);
const CHANGE = () => th('เปลี่ยนได้จนกว่าพิธีกรจะปิดรับ', 'mini-event: picks change until close');
function mnPick(opt) {
  const head = opt === 'A' ? th('เลือกการ์ด 1 ใบในมือถือของคุณ', 'mini-event: pick instruction (A)') : th('เลือกเส้น 1 เส้นในมือถือของคุณ', 'mini-event: pick instruction (B)');
  return stage('mn-pick', opt, `${miniTop(1)}${hud(head, CHANGE())}${opt === 'A' ? miniCards([], false) : miniLines([], false)}${pickBand()}`);
}
function mnLine(opt) {
  const draws = opt === 'A' ? MINI_A.draws : MINI_B.draws;
  const which = opt === 'A' ? th(`การ์ด ${MINI_A.win + 1} ครบเส้นก่อน`, 'mini-event: first full line (A)') : th(`เส้น ${MINI_B.line + 1} ครบก่อน`, 'mini-event: first full line (B)');
  const band = lowBand(`<div class="lk">${th('ออกแล้ว', 'draw: drawn so far')} ${draws.map(esc).join(' ')}</div>`, '<div></div>', `<div class="lk">${th('เหลือ', 'mini-event: still in')}</div>${count(9, th('คน', 'unit: people', 'g302'), 'sm')}`, 'slim');
  return stage('mn-line', opt, `${miniTop(1)}${hud(th('เส้นแรกที่ครบ รอด', 'mini-event: polarity, first full line = survive'), which)}${opt === 'A' ? miniCards(draws, true) : miniLines(draws, true)}${band}`);
}
function mnPhPick(opt) {
  const labels = opt === 'A' ? MINI_A.cards.map((c, i) => `การ์ด ${i + 1}`) : LINES.map((l, i) => `เส้น ${i + 1}`);
  labels.forEach((l) => th(l, opt === 'A' ? 'mini-event: card label (A)' : 'mini-event: line label (B)'));
  const on = opt === 'A' ? MINI_A.win : MINI_B.line;
  const head = opt === 'A' ? th('เลือกการ์ด 1 ใบ', 'mini-event phone: pick heading (A)') : th('เลือกเส้น 1 เส้น', 'mini-event phone: pick heading (B)');
  const preview = opt === 'A' ? `<p class="msg">${th('การ์ดที่เลือก', 'mini-event phone: the picked card (A)')}</p>${pcard(MINI_A.cards[MINI_A.win], 0, ' sm')}` : `<p class="msg">${th('การ์ดกลางบนจอ', 'mini-event phone: the shared card (B)')}</p>${pcard(MINI_B.card, 0, ' sm')}`;
  return phone('mn-ph-pick', opt, `${phoneHead(head, CHANGE(), MINI_EV())}<div class="ptime"><span class="msg">${th('เหลือเวลา', 'mini-event phone: time left')}</span><span class="pt-n">0:24</span></div>${poolButtons(labels, on)}${preview}`);
}
const mnWin = () => stage('mn-win', 'F', `${miniTop(3)}${hud(th('ผู้ชนะ', 'mini-event: winners heading'), th('3 คน', 'mini-event: winner count'))}${winners([ME, CAP_NAME, WIDE_AM])}`);
const mnPhResult = () => phone('mn-ph-result', 'F', `${phoneHead(th('ผลรอบที่ 1', 'phone: result heading'), '', MINI_EV())}${verdict(th('ผ่าน', 'legend: passed', 'g302'), '', th('ของคุณครบเส้นแรก', 'mini-event phone: yours completed first'))}<p class="msg">${th('รอรอบที่ 2', 'mini-event phone: waiting for round 2')}</p>`);

// ---- board-only CSS, roles, values ----
const BOARD_CSS = `
    /* ---- Gh328LetterBingo frames (sizes PROPOSAL; colours from the kit, tokens.css and the gh#302 / gh#303 picks) ---- */
    .pj .wc .wd.ls { letter-spacing: 1px; }
    .pj .dt { position: absolute; left: 780px; top: 236px; width: 360px; height: 400px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; border-radius: 24px; background: #23214d; box-shadow: inset 0 0 0 3px #ffcc00; font: 700 260px/1.3 'Mitr', sans-serif; color: #ffcc00; white-space: nowrap; overflow-x: clip; overflow-y: visible; z-index: 1; }
    .pj .rail { position: absolute; left: 56px; right: 56px; top: 676px; display: flex; justify-content: center; column-gap: 16px; z-index: 1; }
    .pj .rs { box-sizing: border-box; width: 112px; height: 128px; display: flex; align-items: center; justify-content: center; border-radius: 16px; font: 600 72px/1.3 'Mitr', sans-serif; white-space: nowrap; overflow-x: clip; overflow-y: visible; }
    .pj .rs:not(.mk) { box-shadow: inset 0 0 0 3px #2e2b63; }
    .pj .rs.mk { background: #23214d; color: #ffffff; }
    .pj .rs.new { box-shadow: inset 0 0 0 3px #ffcc00; color: #ffcc00; }
    .pj .ach { position: absolute; left: 112px; right: 112px; top: 330px; display: grid; grid-template-columns: repeat(14, minmax(0, 1fr)); grid-auto-rows: 112px; gap: 12px; z-index: 1; }
    .pj .ac { box-sizing: border-box; display: flex; align-items: center; justify-content: center; border-radius: 16px; font: 600 64px/1.3 'Mitr', sans-serif; white-space: nowrap; overflow-x: clip; overflow-y: visible; }
    .pj .ac:not(.mk) { background: #23214d; color: #ffffff; }
    .pj .ac.mk { background: #ffcc00; color: #14142b; box-shadow: 0 0 16px rgba(255,204,0,0.45); }
    .pj .ac.new { box-shadow: inset 0 0 0 4px #ffffff, 0 0 60px rgba(255,204,0,0.45); }
    .pj .mcards { position: absolute; left: 112px; right: 112px; top: 270px; display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 24px; z-index: 1; }
    .pj .mc { box-sizing: border-box; padding: 8px; border-radius: 24px; background: #23214d; text-align: center; }
    .pj .mc.won { box-shadow: inset 0 0 0 3px #ffcc00; }
    .pj .bg { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; margin-top: 4px; }
    .pj .bx { box-sizing: border-box; height: 52px; display: flex; align-items: center; justify-content: center; border-radius: 16px; font: 600 30px/1.3 'Mitr', sans-serif; white-space: nowrap; overflow-x: clip; overflow-y: visible; }
    .pj .bx:not(.mk) { background: #14142b; color: #ffffff; }
    .pj .bx.mk { background: #ffcc00; color: #14142b; }
    .pj .bx.ln { box-shadow: 0 0 16px rgba(255,204,0,0.45); }
    .pj .lgrid { position: absolute; left: 631px; top: 240px; display: grid; grid-template-columns: 80px 150px 150px 150px 80px; grid-auto-rows: 150px 150px 150px 70px; gap: 12px; z-index: 1; }
    .pj .lgrid .bx { height: 150px; font-size: 96px; }
    .pj .lnum { display: flex; align-items: center; justify-content: center; font: 600 44px/1.3 'Mitr', sans-serif; color: #d9d6f0; }
    .pj .wd .lm.mk { color: #ffcc00; }
    .pj .wd .lm:not(.mk) { color: #9a97c0; }
    .pr .bc { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 16px; }
    .pr .bx { box-sizing: border-box; height: 84px; display: flex; align-items: center; justify-content: center; border-radius: 16px; font: 700 44px/1.3 'Mitr', sans-serif; white-space: nowrap; overflow-x: clip; overflow-y: visible; }
    .pr .bc.sm .bx { height: 56px; font-size: 28px; }
    .pr .bx:not(.mk) { background: #23214d; color: #ffffff; }
    .pr .bx.mk { background: #ffcc00; color: #14142b; box-shadow: 0 0 16px rgba(255,204,0,0.45); }`;
const GLOW = (px) => `rgba(255,204,0,0.45) 0px 0px ${px}px 0px`;
const T = 'tokens.css';
const BOARD_ROLES = [
  ['G328-D4 A drawn tile', '.pj .dt', ['background-color:#23214d', 'radius:24px', 'box-shadow:#ffcc00 0px 0px 0px 3px inset', 'color:#ffcc00'], `PROPOSAL; #23214d, ${T} --accent-gold ring (the kit phone letter tile)`],
  ['G328-D4 A rail slot shape', '.pj .rs', ['radius:16px'], 'the kit phone letter-tile radius'],
  ['G328-D4 A rail slot not yet drawn', '.pj .rs:not(.mk)', ['box-shadow:#2e2b63 0px 0px 0px 3px inset'], 'gh#303 PICKED hatch #2e2b63'],
  ['G328-D4 A rail slot drawn', '.pj .rs.mk', ['background-color:#23214d', 'color:#ffffff', 'color:#ffcc00'], `#23214d; ${T} --ink-light, the latest in --accent-gold`],
  ['G328-D4 A latest rail slot', '.pj .rs.new', ['box-shadow:#ffcc00 0px 0px 0px 3px inset'], `${T} --accent-gold ring`],
  ['G328-D4 B chart cell shape', '.pj .ac', ['radius:16px'], 'the kit phone letter-tile radius'],
  ['G328-D4 B chart letter not drawn', '.pj .ac:not(.mk)', ['background-color:#23214d', 'color:#ffffff'], `#23214d; ${T} --ink-light`],
  ['G328-D4 B chart letter drawn', '.pj .ac.mk', ['background-color:#ffcc00', 'color:#14142b', `box-shadow:${GLOW(16)}`, `box-shadow:#ffffff 0px 0px 0px 4px inset, ${GLOW(60)}`], `${T} --accent-gold, ink on gold; the latest ringed in --ink-light`],
  ['G328-D5 B lit letter', '.pj .wd .lm.mk', ['color:#ffcc00'], `${T} --accent-gold`],
  ['G328-D5 B unlit letter', '.pj .wd .lm:not(.mk)', ['color:#9a97c0'], '#9a97c0 (gh#302 B PICKED)'],
  ['G328-D6 mini card', '.pj .mc', ['background-color:#23214d', 'radius:24px'], 'gh#302 B PICKED winner-card surface and radius'],
  ['G328-D6 A card whose line came first', '.pj .mc.won', ['box-shadow:#ffcc00 0px 0px 0px 3px inset'], 'the kit winner-card gold edge'],
  ['letter cell shape', '.pj .bx, .pr .bx', ['radius:16px'], 'the kit phone letter-tile radius'],
  ['letter cell (projector)', '.pj .bx:not(.mk)', ['background-color:#14142b', 'color:#ffffff'], `${T} --color-line-strong; --ink-light`],
  ['letter cell marked (projector)', '.pj .bx.mk', ['background-color:#ffcc00', 'color:#14142b'], `${T} --accent-gold, ink on gold`],
  ['G328-D6 completed line', '.pj .bx.ln', [`box-shadow:${GLOW(16)}`], 'gold glow (gh#302 B)'],
  ['G328-D6 B line number', '.pj .lnum', ['color:#d9d6f0'], `${T} --ink-on-band-soft`],
  ['phone card cell', '.pr .bx:not(.mk)', ['background-color:#23214d', 'color:#ffffff'], 'the kit phone word card'],
  ['phone card cell marked', '.pr .bx.mk', ['background-color:#ffcc00', 'color:#14142b', `box-shadow:${GLOW(16)}`], 'the kit phone word card picked'],
];
const BOARD_VALUES = [
  ['3x3 letter card: phone cells 84px, Mitr 700 44px; mini-event cells 52px, Mitr 600 30px (the projector floor)', 'the card on the phone and on the mini-event screen', 'PROPOSAL (this board)'],
  ['square letter cells, 16px / 24px radius', 'every letter cell: a square letter tile, as in a word game', 'kit radii; PROPOSAL'],
  ['marked cell: #ffcc00 fill, ink #14142b', 'a drawn letter on a card (the whole square fills gold)', 'the kit passed paint'],
  ['260px Mitr 700 drawn tile; 112x128px rail slots, 72px', 'G328-D4 A', 'PROPOSAL'],
  ['42-cell chart, 14 x 3, 64px Mitr 600', 'G328-D4 B (the 42 consonants the engine draws from, in alphabet order)', 'PROPOSAL'],
  ['count column 25px; letter column = the kit word column', 'G328-D5 A / B at the D1 floor', 'PROPOSAL'],
];
const BOARD_PAIRS = [['#ffffff', '#14142b', 'a letter cell on the projector'], ['#9a97c0', '#23214d', 'an unlit letter (G328-D5 B)'], ['#ffcc00', '#23214d', 'a lit letter, the drawn tile']];

export const EXPECT = {
  A: ['draw', 'field', 'mn-pick', 'mn-line', 'mn-ph-pick'],
  B: ['draw', 'field', 'mn-pick', 'mn-line', 'mn-ph-pick'],
  F: ['deal', 'code', 'result', 'fallback', 'ph-code', 'ph-card', 'ph-tap', 'ph-draw', 'ph-in', 'ph-out', 'mn-win', 'mn-ph-result'],
};

export function build() {
  resetCopy();
  th('คน', 'unit: people', 'g302'); th('ผ่าน', 'legend: passed', 'g302'); th('ไม่ผ่าน', 'legend: did not pass', 'g302'); th('ผ่านรอบที่ 1', 'reveal: passed heading', 'g302');
  GAME(); SCRIPT_LABELS();
  const g0 = WORD_ROUND.keep;
  const rows = [
    decisionsRow([
      ['<b>D1</b> glyph floor on the densest projector screen', 'SHARED (kit) · drawn on Gh326PickRule, not here', 'see Gh326PickRule', 'see Gh326PickRule', pickNote('D1')],
      ['<b>D3</b> grouping of the 14-digit round code', 'SHARED (kit) · drawn on Gh326PickRule, not here', 'see Gh326PickRule', 'see Gh326PickRule', pickNote('D3')],
      ['<b>G328-D4</b> the draw on the main screen (QR mode)', 'BOARD · gh#328', `<b>A ${D4.A}</b>: the drawn letter turns in on one big square tile; the ${DRAWS} draws fill a rail of square slots below it, the newest ringed in gold (default)`, `<b>B ${D4.B}</b>: the ${ALPHABET.length} consonants the game draws from stand in alphabet order, 14 x 3; a drawn letter fills gold, the newest ringed in white`, 'awaiting the owner'],
      ['<b>G328-D5</b> the admin-mode field during the draws (no phones, 200 heads)', 'BOARD · gh#328', `<b>A ${D5.A}</b>: the deal screen shows each card's 9 letters; once the draws start each cell shows only its mark count, one digit at the D1 floor (default)`, `<b>B ${D5.B}</b>: each cell keeps its 9 letters at the D1 floor; a drawn letter lights gold, the rest stay dim`, 'awaiting the owner'],
      ['<b>G328-D6</b> what a mini-event player picks (a MECHANIC as well as a look: gh#328 says only "the first full line wins (or loses)")', 'BOARD · gh#328', `<b>A ${D6.A}</b>: 16 printed 3x3 cards on the screen; each player picks one; the first card to complete a line decides (default)`, `<b>B ${D6.B}</b>: one 3x3 card on the screen, its 8 lines numbered; each player picks a line; the first line to complete decides`, 'awaiting the owner'],
    ]),
    sec('G328-D4 · THE DRAW · QR mode, draw 7 of 12, 1920x1080 at scale 1', `The MC draws ${DRAWS} letters one at a time (engine 2b, game 3). The screen first names the drawn letter set and the polarity, so every phone can make the rule tap before the first letter; it carries both for the whole draw. Both options draw letters as square tiles that read as a word game, on square tiles only; a mark fills the whole square. A: one tile at the centre, then a rail; the room reads one letter at a time and can count what is left. B: the alphabet chart of a Thai classroom; the room sees which letters are still out, and that ${ALPHABET.length - DRAWS} of the ${ALPHABET.length} will never come. Drawn here: set ก, polarity “ครบ 4 ตัว รอด”, the 7th letter.`,
      cands([cand(tag('A', D4.A, ' (default)'), drawFrame('A')), cand(tag('B', D4.B, ''), drawFrame('B'))], true)),
    sec('G328-D5 · THE ADMIN-MODE FIELD · no phones, 200 heads, draw 7 of 12', `Admin mode puts every card beside its name, at the D1 floor (${pickNote('D1')}). A 3x3 card cannot stand as a grid in a cell that size (three rows of glyphs against the ${OPTIONS.D1[KIT_OPT('D1')].rowMin}px row), so the deal screen (below, shared) prints the 9 letters in a row. During the draws: A turns each cell into its mark count, one digit; B keeps the letters and lights the drawn ones. The drawn letters run along the band in both.`,
      cands([cand(tag('A', D5.A, ' (default)'), fieldFrame('A')), cand(tag('B', D5.B, ''), fieldFrame('B'))], true)),
    sec('SHARED · THE DEAL, THE CODE AND THE RESULT · main screen', `The deal (admin mode): each name with its card's 9 letters, before the first draw. The code (QR mode): ${CODE.length} digits, seed 30418, cut ${g0}, bank revision 1, kind 52 (engine 2b base 50 + game 3 Thai), pool digit 0 (game 3 reads no pool), format 0, Damm check over the round and the payload; grouped by the kit value (${pickNote('D3')}). The result: drawn with G328-D5 A, each cell's final count. The exact cut is re-checked on this fixture at generate time (assertBingoCut): under set ก, the ${g0} cards of group 0 score 4 to 6 and pass; the ${g0} of group 1 score 0 to 3; under set ข it is the reverse. The never-blank frame (ADR-0051) is the same judged field without the stage floor.`,
      cands([cand(tag('F', 'DEAL', ' admin mode'), dealFrame()), cand(tag('F', 'CODE', ' QR mode'), codeFrame()), cand(tag('F', 'RESULT', ' 3D intent'), resultFrame('result', true)), cand(tag('F', 'NEVER-BLANK 2D', ' ADR-0051; also the reduced-motion end state'), resultFrame('fallback', false))], true)),
    sec('SHARED · THE PHONE · engine 2b, QR mode, real pixels at 320px', 'The phone rebuilds its own 3x3 card from the code; the card alone cannot tell its owner the ending, because it matches one letter set and not the other. The rule tap (which set the screen named, and the polarity) comes before the first draw; the phone then marks its own card at every draw, as the screen draws. The set names ชุด ก / ชุด ข are the kit preview\'s, verbatim, so games 2-4 read alike. How the phone keeps step with the screen is not ruled; drawn here as a next-letter tap (PROPOSED). A drawn letter fills its whole square gold.',
      cands([cand(tag('F', 'CODE', ''), phCode()), cand(tag('F', 'CARD', ' before the tap'), phCard()), cand(tag('F', 'RULE TAP', ' set + polarity'), phTap()), cand(tag('F', 'DRAW 7', ''), phDraw())])
      + cands([cand(tag('F', 'PASSED', ''), phIn()), cand(tag('F', 'DID NOT PASS', ''), phOut())])),
    sec('G328-D6 · THE MINI-EVENT PAGE · real picks on players\' own phones', 'A pick is one integer index of 2 to 16 options per round (the picks design doc); gh#328 names only "the first full line wins (or loses)". A uses the cap: 16 printed cards, duplicates allowed, so players on one card share its fate. B: one shared card, 8 lines (3 rows, 3 columns, 2 diagonals; a diagonal\'s number stands at its lower end). Both: picks change until the MC closes picking, the random fill at close, letters drawn after the picks are stored, and the rule (here “เส้นแรกที่ครบ รอด”) redrawn when it would leave nobody, everybody or fewer than the winner count. The first full line is re-checked on the fixture (assertMini).',
      cands([cand(tag('A', D6.A, ' pick (default)'), mnPick('A')), cand(tag('A', D6.A, ' first full line, draw 6'), mnLine('A'))], true)
      + cands([cand(tag('B', D6.B, ' pick'), mnPick('B')), cand(tag('B', D6.B, ' first full line, draw 6'), mnLine('B'))], true)
      + cands([cand(tag('A', D6.A, ' phone pick'), mnPhPick('A')), cand(tag('B', D6.B, ' phone pick'), mnPhPick('B')), cand(tag('F', 'PHONE · RESULT', ''), mnPhResult())])
      + cands([cand(tag('F', 'WINNERS', ''), mnWin())], true)),
    sec('VALUES · kit values, this board\'s, and their sources', 'Every frame value is a literal from tokens.css, a gh#302 / gh#303 pick, the kit, or a PROPOSAL named here.', valuesTable([...KIT_VALUES, ...BOARD_VALUES]) + contrastTable([...KIT_PAIRS, ...BOARD_PAIRS])),
    sec('BEATS · the draw on the main screen (3D intent)', 'Every beat has a reduced-motion form (ADR-0046: reduce, not remove).', beatTable([
      ['set and polarity shown', 'held until the MC starts', 'the set name and the polarity pill settle in the band; phones make the rule tap', 'both appear with one 200ms fade'],
      ['a draw', '1.5s per letter', 'A: the tile turns face up at the centre, then slides into its rail slot; B: the chart cell turns over to gold', 'the letter appears in place with one 200ms fade'],
      ['marks', 'with each draw', 'the cells holding the letter fill gold (admin mode: the count steps up, or the letter lights)', 'the change is instant'],
      ['result', 'held', `the ${g0} passing cells glow; the count rolls to the keep`, 'the count is shown at its final value'],
    ])),
    nameFitRow([
      ['field names, letters beside (deal, G328-D5 B)', 'Sarabun 400', `${OPTIONS.D1[KIT_OPT('D1')].nameMax}px`, `${OPTIONS.D1[KIT_OPT('D1')].floor}px`, 'the kit cell less the kit word column', 'measured by the render (fit report)'],
      ['field names, count beside (G328-D5 A, result)', 'Sarabun 400', `${OPTIONS.D1[KIT_OPT('D1')].nameMax}px`, `${OPTIONS.D1[KIT_OPT('D1')].floor}px`, `the kit cell less a ${COUNT_W()}px count column`, 'measured by the render'],
      ['mini-event winners', 'Mitr 700', '64px', '40px', '1100px card less 80px padding', 'measured by the render'],
      ['phone pick buttons (card or line labels)', 'Mitr 600', '20px', '16px', 'half the 288px column', 'measured by the render'],
    ]),
    copyRow(),
    rolesRow([...KIT_ROLES, ...BOARD_ROLES]),
    notesRow([
      '<b>Rests on:</b> gh#328 (game 3), gh#311 (the 2026-11-11 title ruling and the 2026-11-19 rulings: half-cut only, two candidate scripts plus a rule tap for games 2-4, picks change until close), ADR-0080 (half-cut, the 14-digit code), the picks design doc (one pick of 2-16 options), ADR-0051 (never-blank), gh#299 decision 11 and its wording constraint, CONTEXT.md (company-party category, _Avoid_).',
      '<b>Content:</b> the name stays as the owner kept it; every visual is a letter game: square letter tiles, a classroom alphabet chart, a filled square for a mark, and nothing else on the stage. No card here holds the three consonants of the barred word the render scans for (assertBingoCut); the engine itself does not guard that (finding, gh#328).',
      '<b>Not covered:</b> a real projector, room or viewing distance; the 3D motion itself (frames are stills); English rounds (26 letters, same frames); the MC\'s controls; widths other than 320px; how the phone keeps step with the screen (drawn as a next tap, not ruled).',
    ]),
  ];
  const head = [ORDER_LINE,
    `Game 3 of the seven letter and word games (gh#328), on the shared kit docs/verification/evidence/gh325-boards-2026-11-20/kit.mjs (gh#325). SHARED kit decisions, drawn at their kit value: ${pickNote('D1')}; ${pickNote('D3')}. This board's decisions: G328-D4, G328-D5, G328-D6.`,
    `Fixture: the gh#302 roster at the setup cap of 200, the NAME FIT worst cases in it, round 1 of 4, a half-cut round (200 to ${g0}). ${DRAWS} draws per set, 4 marks to reach (engine 2b). Drawn set ก, polarity “ครบ 4 ตัว รอด”.`];
  return boardDoc(NAME, 'gh#328 proposal board (letter bingo) on the gh#325 kit.', head, BOARD_CSS, rows);
}

// Board-specific must-red plants (the kit's generic plants are added by mustred.mjs).
export const PLANTS = [
  ['d4-tile-clip', (s) => s.replace('</style>', '.pj .dt { font-size: 700px !important; }</style>'), /clipped in A\/draw/],
  ['d4-chart-overlap', (s) => s.replace('</style>', '.pj .ach { display: block !important; } .pj .ac { position: absolute !important; left: 0px; top: 0px; width: 110px; height: 112px; }</style>'), /name boxes overlap in B\/draw/],
  ['d5-lit-palette', (s) => s.replace('</style>', '.pj .wd .lm.mk { color: #00ff00 !important; }</style>'), /\(role: G328-D5 B lit letter\) renders color:#00ff00/],
  ['result-count', (s) => s.replace('data-expect="200/100"', 'data-expect="200/101"'), /field count in F\/result: holds 200 with 100 passed, says 200\/101/],
  ['phone-card-clip', (s) => s.replace('</style>', '.pr .bx { font-size: 120px !important; }</style>'), /clipped in F\/ph-card/],
  ['d6-line-number-floor', (s) => s.replace('</style>', '.pj .lnum { font-size: 20px !important; }</style>'), /text under 30px in B\/mn-pick/],
];

// Extra must-red commands: the fixture guards on a planted copy (each must red on its own line), and the clean
// fixture (control).
const EVAL = (expr) => ['--input-type=module', '-e', `import * as m from './board-letterbingo.mjs'; ${expr}`];
export const EXTRA = [
  ['bingo cut control', EVAL('m.assertBingoCut(); m.assertMini();'), {}, null],
  ['bingo cut: a group-0 card reaches the threshold under the other set', EVAL('m.assertBingoCut(m.plantCut());'), {}, /bingo cut: .* under the other script, at or above the threshold 4/],
  ['bingo cut: a card holds the barred trio', EVAL('m.assertBingoCut(m.plantTrio());'), {}, /bingo cut: .* holds the three letters of a barred word/],
  ['mini-event: the shared card completes its line at draw 3', EVAL('m.assertMini(m.plantMiniEarly());'), {}, /mini-event: the shared card completes a line at draw 3/],
];

export const BOARD = { name: NAME, build, expect: EXPECT, plants: PLANTS, extra: EXTRA, sel: { clip: '.dt, .rs, .ac, .bx, .lnum', overlap: '.rs, .ac, .bx', contain: '.dt, .rs, .ac, .bx, .mc, .lnum', field: '.ach, .mcards, .lgrid, .bc' }, floors: {} };
