// gh#327 proposal board: ตัวอักษรในมือ (game 2, engine 2b) on the gh#325 kit. Writes design/Gh327LetterHand.dc.html
// through make-boards.mjs. Owns this game's open visual questions (G327-D4 to G327-D8); draws the two SHARED kit
// decisions (D1 glyph floor, D3 code grouping) only through KIT_OPT / KIT_VALUE and says so with pickNote.
import {
  th, nm, esc, resetCopy, contrastTable, valuesTable, beatTable, nameFitRow, notesRow,
  OPTIONS, KIT_OPT, KIT_VALUE, pickNote, WORD_ROUND, ME, CAP_NAME, WIDE_AM, wordCode,
  boardDoc, ORDER_LINE, decisionsRow, rolesRow, copyRow, sec, cand, cands, tag,
  stage, phone, topBar, hud, lowBand, count, floorLayer, denseField, codeCard, codeField, ruleCard,
  phoneHead, tiles, ruleTap, goButton, verdict, poolTiles, poolButtons, timer, winners,
  KIT_ROLES, KIT_VALUES, KIT_PAIRS,
} from './kit.mjs';

const NAME = 'Gh327LetterHand';
const SRC_GAME = 'gh#311 / gh#327 body · owner wording, verbatim (the game name)';
const SRC_PILOT = 'Gh326PickRule pilot copy (PROPOSED there, awaiting the owner) · reused verbatim';
const SRC_PILOT_MINI = SRC_PILOT;
const GAME = () => th('ตัวอักษรในมือ', 'game name', SRC_GAME);

// ---- the deal: game 2, Thai, pool food (script kind 50 = SCRIPT_KIND_BASE + 0, pool digit 2). The candidate pair
// and both reveal orders are copied as literals from a run of letters.ts analyseLetters / revealOrder over the bank
// at commit 50f74b7 (review pending, gh#321; review read as done for the run). Script 0 = ข้าวผัด, script 1 = ผัดไทย.
// Group 0 holds a tile of letters(0) minus letters(1), group 1 of letters(1) minus letters(0); ผ, the -ั mark and ด
// are in both words, so nobody holds them and their steps hit nobody.
const MARK = /^[ัิ-ฺ็-๎]$/u;
const WORDS = ['ข้าวผัด', 'ผัดไทย'];
const SCRIPTS = [['ข', '้', 'า', 'ว', 'ผ', 'ั', 'ด'], ['ผ', 'ั', 'ด', 'ไ', 'ท', 'ย']];
const SIDES = [['ข', 'ว', 'า', '้'], ['ท', 'ย', 'ไ']];
const DRAWN = 1; // the drawn script in the main fixture; polarity: a revealed letter knocks its holders out
const DEAL = (() => {
  // round-robin over each side for the board (the engine deals by hash, letters.ts holding); the reader holds the mark
  const m = new Map(); const k = [0, 0];
  for (const n of WORD_ROUND.names) { if (n === ME) continue; const g = WORD_ROUND.group.get(n); m.set(n, SIDES[g][k[g]++ % SIDES[g].length]); }
  m.set(ME, '้');
  return m;
})();
const holders = (letters) => WORD_ROUND.names.filter((n) => letters.includes(DEAL.get(n))).length;
const OUT_NAME = WORD_ROUND.names.find((n) => WORD_ROUND.group.get(n) === 1 && DEAL.get(n) === 'ไ');
const CODE = wordCode(1, { seed: '30716', cut: WORD_ROUND.keep, revision: 1, kind: 50, pool: 'food' });

// ---- G327-D4: how a mark tile (a vowel sign or tone mark held alone) is written. Names are the school names.
const MARK_NAME = { 'ั': 'ไม้หันอากาศ', 'ิ': 'สระอิ', 'ี': 'สระอี', 'ึ': 'สระอึ', 'ื': 'สระอือ', 'ุ': 'สระอุ', 'ู': 'สระอู',
  '็': 'ไม้ไต่คู้', '่': 'ไม้เอก', '้': 'ไม้โท', '๊': 'ไม้ตรี', '๋': 'ไม้จัตวา', '์': 'ทัณฑฆาต' };
const D4 = { A: 'HYPHEN SLOT', B: 'HYPHEN SLOT + NAME' };
const markName = (c) => th(MARK_NAME[c], 'mark tile: the mark\'s name (G327-D4 B)');
const glyph = (c) => (MARK.test(c) ? `-${c}` : c);
const cellText = (c, opt) => (MARK.test(c) && opt === 'B' ? `-${c} ${MARK_NAME[c]}` : glyph(c));
const tile = (c, opt) => (MARK.test(c) && opt === 'B'
  ? `<div class="tiles"><div class="lt nm"><span class="lg">${esc(glyph(c))}</span><span class="ln">${markName(c)}</span></div></div>`
  : tiles([glyph(c)]));

// ---- G327-D5: how the two candidate scripts are labelled on the rule card and the phone tap.
const D5 = { A: 'ชุด ก / ชุด ข (KIT PREVIEW)', B: 'คำที่ 1 / คำที่ 2' };
const LABELS = {
  A: () => [th('ชุด ก', 'script label 1 (G327-D5 A)', SRC_PILOT), th('ชุด ข', 'script label 2 (G327-D5 A)', SRC_PILOT)],
  B: () => [th('คำที่ 1', 'script label 1 (G327-D5 B)'), th('คำที่ 2', 'script label 2 (G327-D5 B)')],
};
const POL = () => [th('โดนเปิด ตก', 'polarity: a revealed letter knocks its holders out'), th('โดนเปิด รอด', 'polarity: a revealed letter saves its holders')];
const ruleLine = (rule, pol, opt = 'A') => `${LABELS[opt]()[rule]} · ${POL()[pol]}`;

// ---- the hidden word's slots: one per step (a distinct stored letter), revealed ones lit, the newest marked.
const strip = (script, step, cls = '') => `<div class="strip${cls ? ' ' + cls : ''}" data-expect="${script.length}/${step}">${script.map((c, i) => (i < step
  ? `<div class="sl lit${i === step - 1 ? ' now' : ''}">${esc(glyph(c))}</div>` : '<div class="sl em"></div>')).join('')}</div>`;
// G327-D6 B: the written word, revealed letters in place, the rest as empty slots (one per spacing letter left).
const wordInPlace = (shown, newest, left) => `<div class="wip"><span class="ww">${esc(shown)}</span><span class="ww now">${esc(newest)}</span>${'<span class="sl em"></span>'.repeat(left)}</div>`;
const stepLabel = (k, n) => th(`ตัวที่ ${k} จาก ${n}`, 'reveal: step counter');

// ---- dense field cells (admin mode: the letter beside each name) ----
const cells = (state, opt = 'A') => WORD_ROUND.names.map((n, i) => [n, cellText(DEAL.get(n), opt), state(n, i)]);
const KIT_D1 = () => KIT_OPT('D1');
const KIT_D3 = () => KIT_VALUE('D3').groups;
const REMAIN = () => th('เหลือ', 'reveal: still in', SRC_PILOT);
const PEOPLE = () => th('คน', 'unit: people', 'g302');

function dealFrame(opt) {
  const band = lowBand(`<div class="gname">${GAME()}</div>`, `<div class="lk">${th('ดูตัวอักษรข้างชื่อของคุณ', 'dense field: instruction (admin mode)')}</div>`, count(WORD_ROUND.live, PEOPLE()), 'slim');
  return stage('deal', opt, `${topBar(1)}${denseField(cells(() => '', opt), KIT_D1())}${band}`);
}
const codeFrame = () => stage('code', 'F', `${topBar(1)}${hud(GAME())}${codeCard(CODE, 1, KIT_D3(), th('รหัสรอบที่ 1', 'round code: label (round 1)', SRC_PILOT_MINI), th('ใส่รหัสนี้ในมือถือ เพื่อดูตัวอักษรของคุณ', 'round code: instruction'))}`);
const ruleFrame = (opt) => stage('rule', opt, `${topBar(1)}${ruleCard(th('คำปริศนาที่จับได้', 'rule card: heading'), LABELS[opt]()[DRAWN], POL()[0])}`);
const tapFrame = (opt) => phone('ph-tap', opt, `${phoneHead(th('แตะสิ่งที่ขึ้นบนจอ', 'phone: rule tap heading'))}${ruleTap(th('คำปริศนาบนจอ', 'phone: rule tap, which script'), LABELS[opt](), DRAWN, th('บนจอขึ้นว่า', 'phone: rule tap, which polarity', SRC_PILOT), POL(), 0)}${goButton(th('ยืนยัน', 'phone: confirm the tap'))}`);

// G327-D6: the main screen in QR mode at step 5 of the drawn script (ไ and ท revealed so far hit group 1).
const S5 = 5;
function revealFrame(opt) {
  const sc = SCRIPTS[DRAWN];
  const centre = opt === 'A' ? strip(sc, S5) : wordInPlace('ผัดไ', 'ท', sc.length - S5);
  const band = lowBand(`<div class="lk">${stepLabel(S5, sc.length)}</div>`, '<div></div>', `<div class="lk">${REMAIN()}</div>${count(WORD_ROUND.live - holders(sc.slice(0, S5)), PEOPLE())}`, 'slim');
  return stage('reveal', opt, `${topBar(1)}${hud(GAME(), ruleLine(DRAWN, 0))}${centre}${band}`);
}

// G327-D7: how the phone keeps pace with the screen after the tap (it can compute every step and the verdict alone).
const MY_LINE = () => th('ตัวอักษรของคุณ', 'phone: your letter');
function followFrame(opt) {
  if (opt === 'A') {
    const ps = `<div class="ps">${SCRIPTS[DRAWN].map((c, i) => (i < S5 ? `<div class="pl lit">${esc(glyph(c))}</div>` : '<div class="pl em"></div>')).join('')}</div>`;
    return phone('ph-follow', 'A', `${phoneHead(stepLabel(S5, SCRIPTS[DRAWN].length), th('แตะทุกครั้งที่จอเปิดตัวถัดไป', 'phone: step with the screen'))}${ps}<p class="msg">${MY_LINE()}</p>${tile(DEAL.get(ME), 'A')}<p class="msg">${th('ยังไม่โดน', 'phone: not hit yet')}</p>${goButton(th('ตัวถัดไป', 'phone: next letter'))}`);
  }
  return phone('ph-follow', 'B', `${phoneHead(th('จอกำลังเปิดทีละตัว', 'phone: the screen is revealing'), th('ดูผลได้เมื่อจอเปิดครบทุกตัว', 'phone: verdict after the last letter'))}<p class="msg">${MY_LINE()}</p>${tile(DEAL.get(ME), 'A')}${goButton(th('ดูผล', 'phone: see the result', SRC_PILOT))}`);
}

// ---- shared reveal frames (admin mode, 3D intent), the never-blank frame ----
function flipFrame() {
  const sc = SCRIPTS[DRAWN]; const before = sc.slice(0, S5 - 1); const now = sc[S5 - 1];
  const state = (n) => (before.includes(DEAL.get(n)) ? 'out' : DEAL.get(n) === now ? 'turn' : '');
  const band = lowBand(`<div class="gname">${GAME()}</div>`, strip(sc, S5, 'sm'), `<div class="lk">${REMAIN()}</div>${count(WORD_ROUND.live - holders(sc.slice(0, S5)), PEOPLE())}`, 'slim');
  return stage('flip', 'F', `${floorLayer()}${topBar(1)}${denseField(cells(state), KIT_D1())}${band}`);
}
function flipSaveFrame() {
  const sc = SCRIPTS[0]; const k = 2; const before = sc.slice(0, k - 1); const now = sc[k - 1];
  const state = (n) => (before.includes(DEAL.get(n)) ? 'in' : DEAL.get(n) === now ? 'turn' : '');
  const band = lowBand(`<div class="gname">${GAME()}</div>`, strip(sc, k, 'sm'), `<div class="lk">${th('รอดแล้ว', 'reveal: saved so far')}</div>${count(holders(sc.slice(0, k)), PEOPLE())}`, 'slim');
  return stage('flip-save', 'F', `${floorLayer()}${topBar(1)}${denseField(cells(state), KIT_D1())}${band}`);
}
function resultFrame(id, withFloor) {
  const sc = SCRIPTS[DRAWN];
  const judged = (n) => (sc.includes(DEAL.get(n)) ? 'out' : 'in');
  const legend = `<div class="legend"><div class="wc in"><span class="lg">${th('ผ่าน', 'legend: passed', 'g302')}</span></div><div class="wc out"><span class="lg">${th('ไม่ผ่าน', 'legend: did not pass', 'g302')}</span></div></div>`;
  const band = lowBand(`<div class="gname">${GAME()}</div>`, legend, `<div class="lk">${th('ผ่านรอบที่ 1', 'reveal: passed heading', 'g302')}</div>${count(WORD_ROUND.keep, PEOPLE())}`, 'slim');
  return stage(id, 'F', `${withFloor ? floorLayer() : ''}${topBar(1)}${denseField(cells(judged), KIT_D1())}${band}`);
}

// ---- phone frames ----
const HAND_HEAD = () => phoneHead(th('ตัวอักษรในมือคุณ', 'kit 2b phone: hand heading', SRC_PILOT), th('รอคำปริศนาเปิดทีละตัวบนจอ', 'kit 2b phone: waiting for the script', SRC_PILOT));
const handFrame = (opt) => phone('ph-hand', opt, `${HAND_HEAD()}${tile(DEAL.get(ME), opt)}`);
const wideFrame = (opt) => phone('ph-wide', opt, `${HAND_HEAD()}${tile('ั', opt)}`);
const phCode = () => phone('ph-code', 'F', `${phoneHead(th('ใส่รหัสรอบ', 'phone: code entry heading', SRC_PILOT_MINI), th('รหัส 14 หลักที่ขึ้นบนจอใหญ่', 'phone: code entry hint', SRC_PILOT_MINI))}${codeField(CODE, 1, KIT_D3())}${goButton(th('ดูตัวอักษรของฉัน', 'phone: see my letter'))}`);
const endLine = () => `${th('คำปริศนา:', 'phone: the hidden word was')} ${esc(WORDS[DRAWN])} · ${POL()[0]}`;
const phIn = () => phone('ph-in', 'F', `${phoneHead(th('ผลรอบที่ 1', 'phone: result heading', SRC_PILOT_MINI))}${verdict(th('ผ่าน', 'legend: passed', 'g302'), '', endLine())}${tile(DEAL.get(ME), 'A')}`);
const phOut = () => phone('ph-out', 'F', `${phoneHead(th('ผลรอบที่ 1', 'phone: result heading', SRC_PILOT_MINI))}${verdict(th('ไม่ผ่าน', 'legend: did not pass', 'g302'), 'out', endLine())}${tile(DEAL.get(OUT_NAME), 'A')}`);

// ---- mini-event page (players join by QR and pick real tiles; gh#311, gh#324) ----
const POOL = ['ก', 'ข', 'ค', 'ง', 'จ', 'ด', 'ต', 'น', 'บ', 'ป', 'ม', 'ย', 'ร', 'ล', 'ว', 'ส'];
const MINI_WORD = ['ม', 'ะ', 'น', 'า', 'ว']; // มะนาว, food pool, its reveal order
const MY = POOL.indexOf('ก');
const MODE = () => [th('คนสุดท้ายที่รอด ชนะ', 'mini-event mode: last one standing wins'), th('โดนคนแรก แพ้', 'mini-event mode: first one hit loses')];
const miniTop = (round) => `<div class="top"><span class="ev">${GAME()}</span><span class="lk">${th(`รอบที่ ${round}`, 'mini-event: round label', SRC_PILOT_MINI)}</span></div>`;
const CLOSE = () => th('เปลี่ยนตัวได้จนกว่าพิธีกรจะปิดรับ', 'mini-event: picks change until close');
const mnPick = () => stage('mn-pick', 'F', `${miniTop(1)}${hud(th('เลือก 1 ตัวอักษรในมือถือของคุณ', 'mini-event: pick instruction'), CLOSE())}${poolTiles(POOL)}${lowBand(`<div class="lk">${th('เลือกแล้ว', 'mini-event: picked so far', SRC_PILOT_MINI)}</div>${count(37, th('จาก 52 คน', 'mini-event: of N people', SRC_PILOT_MINI), 'sm')}`, timer('0:24'), `<div class="lk">${MODE()[0]}</div>`)}`);
function mnReveal(id, mode, k, hitState) {
  const hit = MINI_WORD.slice(0, k);
  return stage(id, 'F', `${miniTop(1)}${hud(MODE()[mode], stepLabel(k, MINI_WORD.length))}${strip(MINI_WORD, k, 'mn')}<div class="pool lo">${POOL.map((w) => `<div class="pt${hit.includes(w) ? ' ' + hitState : ''}"><span class="pw">${esc(w)}</span></div>`).join('')}</div>`
    + lowBand(mode === 0 ? `<div class="lk">${th('เล่นต่อจนเหลือผู้ชนะ 3 คน', 'mini-event: rounds repeat to the winner count', SRC_PILOT_MINI)}</div>` : '', '<div></div>', mode === 0 ? `<div class="lk">${REMAIN()}</div>${count(41, PEOPLE())}` : `<div class="lk">${th('โดนคนแรก', 'mini-event: first hit')}</div>${count(4, PEOPLE())}`, 'slim'));
}
const mnWin = () => stage('mn-win', 'F', `${miniTop(3)}${hud(th('ผู้ชนะ', 'mini-event: winners heading', SRC_PILOT_MINI), th('3 คน', 'mini-event: winner count', SRC_PILOT_MINI))}${winners([ME, CAP_NAME, WIDE_AM])}`);
const MINI_EV = () => GAME();
function mnPhPick(opt) {
  const grid = opt === 'A' ? poolButtons(POOL, MY) : `<div class="pbtns g4">${POOL.map((w, i) => `<div class="pb tap g4b${i === MY ? ' on' : ''}"><span class="lw">${esc(w)}</span></div>`).join('')}</div>`;
  return phone('mn-ph-pick', opt, `${phoneHead(th('เลือก 1 ตัว', 'mini-event phone: pick heading'), CLOSE(), MINI_EV())}<div class="ptime"><span class="msg">${th('เหลือเวลา', 'mini-event phone: time left', SRC_PILOT_MINI)}</span><span class="pt-n">0:24</span></div>${grid}`);
}
const mnPhResult = () => phone('mn-ph-result', 'F', `${phoneHead(th('ผลรอบที่ 1', 'phone: result heading', SRC_PILOT_MINI), '', MINI_EV())}${verdict(th('ผ่าน', 'legend: passed', 'g302'), '', `${th('คำปริศนา:', 'phone: the hidden word was')} ${esc('มะนาว')} · ${MODE()[0]}`)}${tile(POOL[MY], 'A')}<p class="msg">${th('รอรอบที่ 2', 'mini-event phone: waiting for round 2', SRC_PILOT_MINI)}</p>`);

// ---- board-only CSS and roles ----
const BOARD_CSS = `
    /* ---- Gh327LetterHand: the hidden word's slots (G327-D6 A, the admin low band, the mini-event) ---- */
    .pj .strip { position: absolute; left: 56px; right: 56px; top: 330px; display: flex; justify-content: center; column-gap: 20px; z-index: 3; }
    .pj .strip.mn { top: 236px; }
    .pj .strip.sm { position: static; column-gap: 10px; }
    .pj .sl { box-sizing: border-box; width: 150px; height: 190px; display: flex; align-items: center; justify-content: center; border-radius: 24px; font: 700 120px/1.3 'Mitr', sans-serif; white-space: nowrap; }
    .pj .strip.sm .sl { width: 64px; height: 76px; border-radius: 16px; font-size: 50px; }
    .pj .sl.lit { background: #23214d; box-shadow: inset 0 0 0 3px #ffcc00; color: #ffcc00; }
    .pj .sl.now { background: #ffcc00; color: #14142b; box-shadow: 0 0 16px rgba(255,204,0,0.45); }
    .pj .sl.em { box-shadow: inset 0 0 0 3px #d9d6f0; }
    /* ---- G327-D6 B: the written word in place ---- */
    .pj .wip { position: absolute; left: 56px; right: 56px; top: 310px; height: 230px; display: flex; justify-content: center; align-items: center; column-gap: 0px; z-index: 3; }
    .pj .ww { font: 700 150px/1.3 'Mitr', sans-serif; color: #ffcc00; white-space: nowrap; }
    .pj .ww.now { color: #ffffff; }
    .pj .wip .sl.em { width: 110px; height: 170px; margin-left: 14px; }
    /* ---- mini-event: the pool sits under the slots ---- */
    .pj .pool.lo { top: 450px; }
    /* ---- phone: the slot row (G327-D7 A), the named mark tile (G327-D4 B), the 4-column pick grid (G327-D8 B) ---- */
    .pr .ps { display: flex; justify-content: center; column-gap: 6px; margin-top: 14px; }
    .pr .pl { box-sizing: border-box; width: 40px; height: 52px; display: flex; align-items: center; justify-content: center; border-radius: 16px; font: 600 24px/1.3 'Mitr', sans-serif; white-space: nowrap; }
    .pr .pl.lit { background: #23214d; box-shadow: inset 0 0 0 2px #ffcc00; color: #ffcc00; }
    .pr .pl.em { box-shadow: inset 0 0 0 2px #d9d6f0; }
    .pr .lt.nm { width: 180px; flex-direction: column; }
    .pr .lt .lg { font: 700 80px/1.2 'Mitr', sans-serif; white-space: nowrap; }
    .pr .lt .ln { font: 600 18px/1.3 'Mitr', sans-serif; color: #d9d6f0; white-space: nowrap; }
    .pr .pbtns.g4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .pr .pb.g4b { min-block-size: 64px; justify-content: center; }
    .pr .pb .lw { font: 600 32px/1.3 'Mitr', sans-serif; color: #ffffff; white-space: nowrap; }
    .pr .pb.on .lw { color: #14142b; }
    /* ---- annotation: the mark-name table ---- */
    .tbl td.thbig { font-family: 'Mitr', sans-serif; font-weight: 600; font-size: 22px; line-height: 1.4; }`;
const GLOW16 = 'rgba(255,204,0,0.45) 0px 0px 16px 0px';
const BOARD_ROLES = [
  ['hidden-word slot shape', '.pj .sl', ['radius:24px', 'radius:16px'], 'PROPOSAL; the gh#302 B winner-card radius (24px) and the phone radius (16px)'],
  ['revealed slot', '.pj .sl.lit:not(.now)', ['background-color:#23214d', 'box-shadow:#ffcc00 0px 0px 0px 3px inset', 'color:#ffcc00'], 'PROPOSAL; #23214d (gh#302 B), tokens.css --accent-gold (the kit letter-tile paint)'],
  ['newest revealed slot', '.pj .sl.now', ['background-color:#ffcc00', 'color:#14142b', `box-shadow:${GLOW16}`], 'PROPOSAL; tokens.css --accent-gold, ink on gold, gold glow (the passed-cell paint)'],
  ['empty slot', '.pj .sl.em', ['box-shadow:#d9d6f0 0px 0px 0px 3px inset'], 'PROPOSAL; tokens.css --ink-on-band-soft ring'],
  ['word in place (G327-D6 B)', '.pj .ww:not(.now)', ['color:#ffcc00'], 'tokens.css --accent-gold'],
  ['word in place: newest letter', '.pj .ww.now', ['color:#ffffff'], 'tokens.css --ink-light'],
  ['phone slot shape', '.pr .pl', ['radius:16px'], 'PROPOSAL (the phone card radius)'],
  ['phone revealed slot', '.pr .pl.lit', ['background-color:#23214d', 'box-shadow:#ffcc00 0px 0px 0px 2px inset', 'color:#ffcc00'], 'PROPOSAL; #23214d, tokens.css --accent-gold'],
  ['phone empty slot', '.pr .pl.em', ['box-shadow:#d9d6f0 0px 0px 0px 2px inset'], 'tokens.css --ink-on-band-soft ring'],
  ['phone mark tile glyph (G327-D4 B)', '.pr .lt .lg', ['color:#ffcc00'], 'tokens.css --accent-gold (the kit letter tile)'],
  ['phone mark tile name (G327-D4 B)', '.pr .lt .ln', ['color:#d9d6f0'], 'tokens.css --ink-on-band-soft'],
  ['phone letter pick (G327-D8 B)', '.pr .pb:not(.on) .lw', ['color:#ffffff'], 'tokens.css --ink-light'],
  ['phone letter pick picked (G327-D8 B)', '.pr .pb.on .lw', ['color:#14142b'], 'tokens.css --color-line-strong'],
];

export const EXPECT = {
  A: ['deal', 'ph-hand', 'ph-wide', 'rule', 'ph-tap', 'reveal', 'ph-follow', 'mn-ph-pick'],
  B: ['deal', 'ph-hand', 'ph-wide', 'rule', 'ph-tap', 'reveal', 'ph-follow', 'mn-ph-pick'],
  F: ['code', 'flip', 'flip-save', 'result', 'fallback', 'ph-code', 'ph-in', 'ph-out', 'mn-pick', 'mn-last', 'mn-first', 'mn-win', 'mn-ph-result'],
};

export function build() {
  resetCopy();
  th('คน', 'unit: people', 'g302'); th('ผ่าน', 'legend: passed', 'g302'); th('ไม่ผ่าน', 'legend: did not pass', 'g302'); th('ผ่านรอบที่ 1', 'reveal: passed heading', 'g302');
  const sc = SCRIPTS[DRAWN];
  const nHit = sc.map((c, i) => holders(sc.slice(0, i + 1)));
  const SHARED = 'SHARED (kit) · all seven boards';
  const shared = (d, what) => [`<b>${d}</b> ${what}`, SHARED, 'options drawn on Gh326PickRule only', 'options drawn on Gh326PickRule only', pickNote(d)];
  const rows = [
    decisionsRow([
      shared('D1', 'glyph floor on the densest projector screen'),
      shared('D3', 'grouping of the 14-digit round code'),
      ['<b>G327-D4</b> how a mark tile is written (a vowel sign or tone mark held alone, e.g. ไม้โท)', 'GAME · gh#327', `<b>A ${D4.A}</b>: the mark on a hyphen, as the bank stores a vowel form: “-้” on the tile and beside the name (default)`, `<b>B ${D4.B}</b>: the same glyph with its school name: “-้ ไม้โท”; on the phone the name sits under the glyph`, 'awaiting the owner'],
      ['<b>G327-D5</b> how the two candidate scripts are labelled (rule card and phone tap)', 'GAME · gh#327', `<b>A ${D5.A}</b>: the kit 2b preview labels, shared by games 2-4 (default)`, `<b>B ${D5.B}</b>: numbered, so no label is itself a Thai letter a player could be holding`, 'awaiting the owner'],
      ['<b>G327-D6</b> the hidden word on the main screen (QR mode) during the reveal', 'GAME · gh#327', '<b>A LETTER SLOTS</b>: one slot per step; each revealed letter fills the next slot in reveal order; the word is read off the full row (default)', '<b>B WORD IN PLACE</b>: the word is written left to right as letters land, empty slots for the letters still to come', 'awaiting the owner'],
      ['<b>G327-D7</b> how the phone keeps pace with the screen after the rule tap', 'GAME · gh#327', '<b>A STEP WITH THE SCREEN</b>: the phone shows the slots and the player taps once per letter the screen reveals; the verdict comes at the last step (default)', '<b>B VERDICT AFTER THE SCREEN</b>: the phone holds the tile and one see-the-result button; the letter-by-letter play lives on the main screen only', 'awaiting the owner'],
      ['<b>G327-D8</b> the mini-event phone pick grid', 'GAME · gh#327', '<b>A KIT POOL BUTTONS</b>: the shared 2-column buttons of games 1, 5 and 7, letters at 20px (default)', '<b>B LETTER GRID</b>: 4 columns of 66px buttons, letters at 32px, all 16 on one screen', 'awaiting the owner'],
    ]),
    sec('G327-D4 · MARK TILES · the dealt letter beside every name (admin mode) and on the phone', `A tile is one codepoint of the stored <code>letters</code> cell, and the cell lists vowel signs and tone marks (letters.ts). Measured on the food pool (letters.ts analyseLetters over the bank at commit 50f74b7, review pending, review read as done for the probe): 5655 candidate pairs, 13287 of the 56616 side tiles summed over the pairs are a mark held alone (23.5%), and 5404 pairs carry at least one. The engine's provisional display puts a mark on U+25CC (conditions.ts), which the kit's Thai scans bar, so that form is not drawable here and is not offered. อ in the slot (D2 B's way on the pilot) is not offered: อ is itself a tile in 1897 of the 5655 pairs, so “อ้” reads as holding อ. A draws the mark on a hyphen, as the bank's vowel forms are stored; B adds the school name. Read off this render (2026-11-20, Mitr 600/700 in Chrome): no dotted circle in either; in A, “-\u0E49” draws as two stacked bars on the tile and at the floor beside a name, close to an equals sign (the pilot's D2 finding, at tile size); B's name says which mark it is. Here the reader (${esc(ME)}) holds “-้”; the field is drawn with ${pickNote('D1')}. The second phone shows the widest name, ไม้หันอากาศ.`,
      cands([cand(tag('A', D4.A, ' (default) the deal, admin mode'), dealFrame('A')), cand(tag('B', D4.B, ' the deal, admin mode'), dealFrame('B'))], true)
      + cands([cand(tag('A', D4.A, ' phone: the reader\'s tile'), handFrame('A')), cand(tag('B', D4.B, ' phone: the reader\'s tile'), handFrame('B')), cand(tag('A', D4.A, ' phone: widest name'), wideFrame('A')), cand(tag('B', D4.B, ' phone: widest name'), wideFrame('B'))])
      + `<table class="tbl"><tr><th>mark</th>${Object.keys(MARK_NAME).map((c) => `<td class="thbig">${esc(glyph(c))}</td>`).join('')}</tr><tr><th>B name</th>${Object.keys(MARK_NAME).map((c) => `<td class="thbig">${markName(c)}</td>`).join('')}</tr></table>`),
    sec('D3 · ROUND CODE · QR mode, the 14-digit code over a veil (SHARED kit value)', `${pickNote('D3')}. The code is real: ${CODE.length} digits, seed 30716, cut ${WORD_ROUND.keep}, bank revision 1, kind 50 (engine 2b: SCRIPT_KIND_BASE 50 + game 2 Thai, scripted.ts SCRIPT_KINDS), pool food, format 0, Damm check (kit wordCode; the same digits as scripted.ts scriptCode for that seed, checked this run).`,
      cands([cand(tag('F', 'CODE', ` ${KIT_VALUE('D3').label}`), codeFrame())], true)),
    sec('G327-D5 · SCRIPT LABELS · the rule card and the phone rule tap', `The main screen draws one of the two candidate scripts and the polarity; the phone learns both only from the tap (round.ts RuleTap), so the label must name a script without showing its word. A keeps the kit 2b preview labels (one set for games 2-4). B numbers them: in this game every tile is a Thai letter, and “ชุด ก” / “ชุด ข” use two of them (ก is a tile in the mini-event pool below). Drawn: script 2 (${esc(WORDS[DRAWN])}), polarity “โดนเปิด ตก”.`,
      cands([cand(tag('A', D5.A, ' (default)'), ruleFrame('A')), cand(tag('B', D5.B, ''), ruleFrame('B'))], true)
      + cands([cand(tag('A', D5.A, ' phone rule tap'), tapFrame('A')), cand(tag('B', D5.B, ' phone rule tap'), tapFrame('B'))])),
    sec('G327-D6 · THE HIDDEN WORD · main screen, QR mode, step 5 of 6', `A step reveals one distinct stored letter, in order of first appearance in the word (letters.ts revealOrder), so a letter written twice lands once. Drawn word ${esc(WORDS[DRAWN])}: ผ, -ั and ด are in both candidates and hit nobody (steps 1-3); ไ (step 4) and ท (step 5) have knocked out ${nHit[S5 - 1]} of the 100 in group 1. A fills slots in reveal order. B writes the word in place; measured on the food pool's 109 playable words, 24 have a step that fills a place ahead of an empty one (a letter written twice), and 6 light a mark over a consonant not yet revealed, which B must draw on an empty slot (not drawn here; this word has neither). ${pickNote('D1')}; D4 A, D5 A in both.`,
      cands([cand(tag('A', 'LETTER SLOTS', ' (default)'), revealFrame('A')), cand(tag('B', 'WORD IN PLACE', ''), revealFrame('B'))], true)),
    sec('G327-D7 · PHONE PACE · after the rule tap, step 5 of 6', 'After the tap the phone rebuilds every step and the verdict from the code alone (scripted.ts phoneScriptTrace, no server call at reveal), so nothing on the phone waits for the screen. A paces the phone by the player\'s taps; B leaves the letter-by-letter play to the main screen. In both, a player can run ahead of the screen: A by tapping early, B by pressing see-the-result early (the same as the game 1 phone).',
      cands([cand(tag('A', 'STEP WITH THE SCREEN', ' (default)'), followFrame('A')), cand(tag('B', 'VERDICT AFTER THE SCREEN', ''), followFrame('B'))])),
    sec('SHARED · THE REVEAL · admin mode, 2D stills of the 3D intent, and the never-blank 2D frame (ADR-0051)', `${pickNote('D1')}; D4 A, D6 A (the slots ride the low band). FLIP: step 5 of ${esc(WORDS[DRAWN])} under “โดนเปิด ตก”: cells of the letters already revealed are struck through, the holders of the newest letter (ท) carry the gold turning edge. THE OTHER DRAW: had script 1 (${esc(WORDS[0])}) been drawn under “โดนเปิด รอด”, step 2 lights the holders of ข and -้ gold, the reader among them (a revealed letter saves). RESULT: group 0 passes, 100 of 200, in words on the legend (never colour alone). NEVER-BLANK: the same judged field flat on the night ground; reduced motion reaches it by 200ms fades.`,
      cands([cand(tag('F', 'FLIP', ' step 5, a revealed letter knocks out'), flipFrame()), cand(tag('F', 'THE OTHER DRAW', ' step 2, a revealed letter saves'), flipSaveFrame()), cand(tag('F', 'RESULT', ' 3D intent'), resultFrame('result', true)), cand(tag('F', 'NEVER-BLANK 2D', ' ADR-0051; also the reduced-motion end state'), resultFrame('fallback', false))], true)),
    sec('SHARED · THE PHONE · engine 2b, QR mode', `The phone rebuilds its own tile from the 14-digit code before the rule (${pickNote('D3')}); its tile matches one candidate and not the other, so it holds no ending before the tap. Real pixels at 320px.`,
      cands([cand(tag('F', 'CODE', ''), phCode()), cand(tag('F', 'PASSED', ' the reader, holding -้'), phIn()), cand(tag('F', 'DID NOT PASS', ' a holder of ไ'), phOut())])),
    sec('SHARED · THE MINI-EVENT PAGE · real picks of letter tiles (gh#311, gh#324)', 'The issue text: players pick tiles; the last one standing wins, or the first one hit loses, as the MC sets. Players join by QR and pick one of up to 16 letters (the pick route caps options at 16) on a timer, changeable until the MC closes picking; at close, whoever has not picked gets a random letter (the pilot draws the closed and random-fill phones; they carry over). A hidden word is then revealed letter by letter. LAST STANDING: every pick of a revealed letter is out; rounds repeat to the MC-set winner count (drawn with 3). FIRST HIT: the frame shows the first letter that hits a pick; duplicate picks are allowed, so it can hit several at once. What follows a first hit (one round or several, how the MC winner count applies) is not settled in gh#311 or gh#327 and is not drawn. Sample counts.',
      cands([cand(tag('F', 'PICK', ' the pick timer, the mode the MC set'), mnPick()), cand(tag('F', 'LAST STANDING', ' step 3 of มะนาว'), mnReveal('mn-last', 0, 3, 'out')), cand(tag('F', 'FIRST HIT', ' step 1 of มะนาว'), mnReveal('mn-first', 1, 1, 'out')), cand(tag('F', 'WINNERS', ''), mnWin())], true)
      + `<p class="why"><b>G327-D8 · PICK GRID.</b> A: the kit pool buttons (2 columns, NAME FIT 16-20px), shared with games 1, 5 and 7. B: a 4-column grid of single letters at 32px, 64px tall, all 16 on one screen without scrolling.</p>`
      + cands([cand(tag('A', 'KIT POOL BUTTONS', ' (default)'), mnPhPick('A')), cand(tag('B', 'LETTER GRID', ''), mnPhPick('B')), cand(tag('F', 'PHONE · RESULT', ''), mnPhResult())])),
    sec('VALUES · kit values and this board\'s additions', 'Every frame value is a literal from tokens.css, a gh#302 / gh#303 pick, the kit, or a PROPOSAL named here. Board additions: slots 150x190px at 120px Mitr 700 on the main screen, 64x76px at 50px in the low band, 40x52px at 24px on the phone; the word in place at 150px; the named mark tile 180px wide with its name at 18px; the letter grid at 32px (all PROPOSAL).', valuesTable(KIT_VALUES) + contrastTable(KIT_PAIRS)),
    sec('BEATS · the reveal on the main screen (3D intent)', 'Beat timing follows the gh#303 picked flip (600ms per turn); every beat has a reduced-motion form (ADR-0046: reduce, not remove).', beatTable([
      ['the deal (admin mode)', 'held', 'the field of letter cells settles onto the stage floor, a short drop per row', 'the field appears in place with one 200ms fade'],
      ['polarity drawn', '1.2s', 'a pill spins to "โดนเปิด ตก" or "โดนเปิด รอด"; the MC can switch it before the script draw', 'the pill fades in on its final value'],
      ['script drawn', '1.5s', 'the white card turns in over the veil with the drawn script label, then leaves; the empty slots settle', 'the card fades in, then out'],
      ['each step', '600ms turn, then held for the MC', 'the letter drops into its slot; the cells of its holders turn (admin mode); a letter nobody holds lands with no cell turning', 'the slot fills and the cells change with one 200ms fade'],
      ['result', 'held', 'passed cells glow; the count rolls to the keep', 'the count is shown at its final value'],
    ])),
    nameFitRow([
      ['dense field names (D1 kit value)', 'Sarabun 400', `${OPTIONS.D1[KIT_D1()].nameMax}px`, `${OPTIONS.D1[KIT_D1()].floor}px`, `a ${OPTIONS.D1[KIT_D1()].cols}-column cell less the letter column and padding`, 'measured by the render (fit report)'],
      ['mini-event winners', 'Mitr 700', '64px', '40px', '1100px card less 80px padding', 'measured by the render'],
      ['phone pool buttons (G327-D8 A; letters, not names)', 'Mitr 600', '20px', '16px', 'half the 288px column less 8px gap and 16px padding', 'measured by the render'],
    ]),
    copyRow(),
    rolesRow([...KIT_ROLES, ...BOARD_ROLES]),
    notesRow([
      '<b>Rests on:</b> gh#327 body (game 2), gh#311 (the game list and the 2026-11-11 / 2026-11-19 owner rulings), ADR-0080 (half-cut, two candidate scripts plus a rule tap, the 14-digit code), letters.ts / scripted.ts / script-kit.ts (engine 2b at commit 50f74b7), ADR-0051 (never-blank), gh#299 decision 11 (3D main screen), CONTEXT.md (company-party category, _Avoid_).',
      `<b>Fixture:</b> the gh#302 roster at 200, round 1 of 4, a half-cut (200 to 100). Candidate pair from the food pool: ${esc(WORDS[0])} / ${esc(WORDS[1])}; group 0 tiles ข, ว, า, -้; group 1 tiles ท, ย, ไ; dealt round-robin for the board (the engine deals by hash). Script 2 drawn: holders hit after each step ${nHit.join(', ')}; the end is exactly group 1, 100.`,
      '<b>Open, not drawn:</b> what follows a first hit on the mini-event page; whether marks join the mini-event pick pool; English rounds (the same frames, bank English letters).',
      '<b>Not covered:</b> a real projector, room or viewing distance; the 3D motion itself (frames are stills, beats are described); the MC\'s own controls (polarity switch, step advance, mode pick) on the setup device; phone widths other than 320px.',
    ]),
  ];
  const head = [ORDER_LINE,
    'Game 2 of the seven letter and word games (gh#327), engine 2b. Shared kit: docs/verification/evidence/gh325-boards-2026-11-20/kit.mjs (gh#325). D1 and D3 are SHARED kit parameters drawn on Gh326PickRule; this board draws their kit values. G327-D4 to G327-D8 are this game\'s.',
    `Fixture: the gh#302 roster at the setup cap of 200, round 1 of 4, a half-cut. Pool: food. Candidate scripts: ${esc(WORDS[0])} / ${esc(WORDS[1])}; drawn: script 2, a revealed letter knocks its holders out.`];
  return boardDoc(NAME, 'gh#327 proposal board (ตัวอักษรในมือ) on the gh#325 kit.', head, BOARD_CSS, rows);
}

// Board-specific must-red plants (the kit's generic plants are added by mustred.mjs).
export const PLANTS = [
  ['slot-clip', (s) => s.replace('</style>', '.pj .strip .sl { width: 40px !important; }</style>'), /clipped in A\/reveal/],
  ['slot-count', (s) => s.replace('data-expect="6/5"', 'data-expect="6/4"'), /field count in A\/reveal: holds 6 with 5 passed, says 6\/4/],
  ['slot-overlap', (s) => s.replace('</style>', '.pj .strip { display: block !important; } .pj .strip .sl { position: absolute !important; left: 0px; top: 0px; }</style>'), /name boxes overlap in A\/reveal/],
  ['field-count', (s) => s.replace('data-expect="200/100"', 'data-expect="200/101"'), /field count in F\/result: holds 200 with 100 passed, says 200\/101/],
  ['mark-name-clip', (s) => s.replace('</style>', '.pr .lt .ln { font-size: 60px !important; }</style>'), /clipped in B\/ph-wide/],
  ['word-in-place-out', (s) => s.replace('</style>', '.pj .wip { left: 800px !important; right: 800px !important; }</style>'), /name or code outside its parent or a clipping ancestor in B\/reveal/],
  ['phone-slot-clip', (s) => s.replace('</style>', '.pr .pl { width: 12px !important; }</style>'), /clipped in A\/ph-follow/],
  ['grid-floor', (s) => s.replace('</style>', '.pr .pb .lw { font-size: 12px !important; }</style>'), /text under 16px in B\/mn-ph-pick/],
];

export const EXTRA = [];

export const BOARD = { name: NAME, build, expect: EXPECT, plants: PLANTS, extra: EXTRA, sel: { clip: '.sl, .ww, .pl, .lg, .ln, .lw', overlap: '.sl, .pl', contain: '.sl, .ww, .pl, .lg, .ln, .lw' }, floors: {} };
