// gh#326 pilot board: เลือกคำ ลุ้นกติกา (game 1), the template for the six sibling boards. Writes
// design/Gh326PickRule.dc.html through make-boards.mjs. Owns: the pilot decision D2 (the vowel-form label) and the
// drawing of the two SHARED decisions (D1 glyph floor, D3 code grouping), whose values live in kit.mjs OPTIONS.
// Every kit frame is drawn here once, so the render and the must-red hold the kit itself to its checks.
import {
  th, nm, esc, resetCopy, contrastTable, valuesTable, beatTable, nameFitRow, notesRow,
  OPTIONS, KIT_OPT, KIT_VALUE, pickNote, WORD_ROUND, ME, CAP_NAME, WIDE_LATIN, WIDE_THAI, WIDE_AM, WIDEST_WORD, wordCol,
  wordCode, boardDoc, ORDER_LINE, decisionsRow, rolesRow, copyRow, sec, cand, cands, tag,
  stage, phone, topBar, hud, lowBand, count, floorLayer, denseField, codeCard, codeField, ruleCard,
  phoneHead, hand, tiles, ruleTap, goButton, verdict, poolTiles, poolButtons, timer, winners,
  KIT_ROLES, KIT_VALUES, KIT_PAIRS, kitPlants,
} from './kit.mjs';

const NAME = 'Gh326PickRule';
const GAME = 'เลือกคำ ลุ้นกติกา';

// ---- the deal: game 1, Thai, family `vowels`, pool food (kind 8, pool digit 2). Candidate pair (round.ts game 1):
// rule 0 = has the written vowel form 'เ-ีย', rule 1 = has '-ัว'. Group 0 holds words with rule 0 and not rule 1,
// group 1 the reverse. Words are the bank's at commit 50f74b7 (food pool, vowels-eligible), frozen literals here.
const FORM = ['เ-ีย', '-ัว'];
const G0 = ['แกงเขียวหวาน', 'ไข่เจียว', 'ข้าวเหนียว', 'เกี๊ยว', 'กระเทียม', 'ทุเรียน', 'ข้าวเกรียบ', 'ชาเขียว', 'ไข่เจียวหมูสับ', 'แกงเขียวหวานไก่', 'ข้าวเหนียวหมูปิ้ง'];
const G1 = ['ถั่ว', 'บัวลอย', 'หัวหอม', 'ครัวซองต์'];
const DEAL = (() => {
  const m = new Map(); let a = 0, b = 0;
  for (const n of WORD_ROUND.names) m.set(n, WORD_ROUND.group.get(n) === 0 ? G0[a++ % G0.length] : G1[b++ % G1.length]);
  // the widest food word sits beside the widest name, so the dense field holds both worst cases in one cell
  m.set(WIDE_LATIN, 'แกงเขียวหวานไก่');
  return m;
})();
const ME_HAND = ['ทุเรียน', 'ไข่เจียว', 'ข้าวเกรียบ'];
const OUT_NAME = WORD_ROUND.names.find((n) => WORD_ROUND.group.get(n) === 1);
const CODE = wordCode(1, { seed: '48215', cut: WORD_ROUND.keep, revision: 1, kind: 8, pool: 'food' });

// ---- D2 (pilot): how a vowel form is spelled in the condition label. The stored form (src/prize-words schema
// VOWEL_FORMS) writes only what is written, a hyphen for the consonant slot.
const SPELL = { A: (f) => f, B: (f) => f.replaceAll('-', 'อ') };
const D2 = { A: 'HYPHEN SLOT, AS STORED', B: 'อ IN THE SLOT' };
const cond = (opt, f) => th(`มีรูปสระ “${SPELL[opt](f)}”`, `condition label, vowel family (${opt})`, opt === 'A' ? 'cond' : 'new');
const POL = () => [th('ตรงกติกา รอด', 'polarity: match = survive'), th('ตรงกติกา ตก', 'polarity: match = out')];

// ---- cells for the dense field ----
const cells = (state) => WORD_ROUND.names.map((n, i) => [n, DEAL.get(n), state(n, i)]);
const judged = (n) => (WORD_ROUND.group.get(n) === 0 ? 'in' : 'out');

function dense(opt) {
  const o = OPTIONS.D1[opt];
  const right = o.perPage < WORD_ROUND.live
    ? `<div class="lk">${th('หน้า 1 จาก 2', 'dense field: page indicator')}</div>${count(WORD_ROUND.live, th('คน', 'unit: people', 'g302'))}`
    : count(WORD_ROUND.live, th('คน', 'unit: people', 'g302'));
  return stage('dense', opt, `${topBar(1)}${denseField(cells(() => ''), opt)}${lowBand(`<div class="gname">${th(GAME, 'game name', 'ticket')}</div>`, `<div class="lk">${th('ดูคำข้างชื่อของคุณ', 'dense field: instruction (admin mode)')}</div>`, right, 'slim')}`);
}
function codeFrame(opt) {
  const g = OPTIONS.D3[opt].groups;
  return stage('code', opt, `${topBar(1)}${hud(th(GAME, 'game name', 'ticket'))}${codeCard(CODE, 1, g, th('รหัสรอบที่ 1', 'round code: label (round 1)'), th('ใส่รหัสนี้ในมือถือ เพื่อดูคำของคุณ', 'round code: instruction'))}`);
}
const ruleFrame = (opt) => stage('rule', opt, `${topBar(1)}${denseField(cells(() => ''), KIT_D1())}${ruleCard(th('กติการอบนี้', 'rule card: heading'), cond(opt, FORM[0]), POL()[0])}`);
const tapFrame = (opt) => phone('ph-tap', opt, `${phoneHead(th('แตะกติกาที่ขึ้นบนจอ', 'phone: rule tap heading'))}${ruleTap(th('กติกาบนจอ', 'phone: rule tap, which rule'), FORM.map((f) => cond(opt, f)), 0, th('บนจอขึ้นว่า', 'phone: rule tap, which polarity'), POL(), 0)}${goButton(th('ดูผล', 'phone: see the result'))}`);
const KIT_D1 = () => KIT_OPT('D1');
const KIT_D3 = () => KIT_VALUE('D3').groups;
const condK = (f) => cond('A', f); // shared frames draw D2's default A until it is picked

function flipFrame() {
  const o = OPTIONS.D1[KIT_D1()]; const front = o.cols * 14;
  const band = lowBand(`<div class="gname">${th(GAME, 'game name', 'ticket')}</div>`, `<div class="lk">${condK(FORM[0])} · ${POL()[0]}</div>`, `<div class="lk">${th('กำลังเปิดผล', 'flip: status')}</div>`, 'slim');
  return stage('flip', 'F', `${floorLayer()}${topBar(1)}${denseField(cells((n, i) => (i < front ? judged(n) : i < front + o.cols ? 'turn' : '')), KIT_D1())}${band}`);
}
function resultFrame(id, withFloor) {
  const legend = `<div class="legend"><div class="wc in"><span class="lg">${th('ผ่าน', 'legend: passed', 'g302')}</span></div><div class="wc out"><span class="lg">${th('ไม่ผ่าน', 'legend: did not pass', 'g302')}</span></div></div>`;
  const band = lowBand(`<div class="gname">${th(GAME, 'game name', 'ticket')}</div>`, legend, `<div class="lk">${th('ผ่านรอบที่ 1', 'reveal: passed heading', 'g302')}</div>${count(WORD_ROUND.keep, th('คน', 'unit: people', 'g302'))}`, 'slim');
  return stage(id, 'F', `${withFloor ? floorLayer() : ''}${topBar(1)}${denseField(cells(judged), KIT_D1())}${band}`);
}

// ---- phone frames (engine 2a, the pilot) ----
const phCode = () => phone('ph-code', 'F', `${phoneHead(th('ใส่รหัสรอบ', 'phone: code entry heading'), th('รหัส 14 หลักที่ขึ้นบนจอใหญ่', 'phone: code entry hint'))}${codeField(CODE, 1, KIT_D3())}${goButton(th('ดูคำของฉัน', 'phone: see my words'))}`);
const phHand = () => phone('ph-hand', 'F', `${phoneHead(th('คำในมือคุณ', 'phone: hand heading'), th('ทั้ง 3 คำมีผลเหมือนกัน เลือกคำที่ชอบ 1 คำ', 'phone: hand, one fate'))}${hand(ME_HAND, 0)}<p class="msg">${th('รอพิธีกรจับกติกา', 'phone: waiting for the rule')}</p>`);
const tapped = () => `${th('กติกาที่คุณแตะ:', 'phone: the rule tapped', 'join')} ${condK(FORM[0])} · ${POL()[0]}`;
const phIn = () => phone('ph-in', 'F', `${phoneHead(th('ผลรอบที่ 1', 'phone: result heading'))}${verdict(th('ผ่าน', 'legend: passed', 'g302'), '', tapped())}${hand([ME_HAND[0]], 0)}`);
const phOut = () => phone('ph-out', 'F', `${phoneHead(th('ผลรอบที่ 1', 'phone: result heading'))}${verdict(th('ไม่ผ่าน', 'legend: did not pass', 'g302'), 'out', tapped())}${hand([DEAL.get(OUT_NAME)])}`);
// ---- kit preview: the engine 2b phone (games 2-4: one hand of letters or words, two scripts, the rule tap) ----
const ph2bHand = () => phone('ph2b-hand', 'F', `${phoneHead(th('ตัวอักษรในมือคุณ', 'kit 2b phone: hand heading'), th('รอคำปริศนาเปิดทีละตัวบนจอ', 'kit 2b phone: waiting for the script'))}${tiles(['ก'])}`);
const ph2bTap = () => phone('ph2b-tap', 'F', `${phoneHead(th('แตะชุดที่ขึ้นบนจอ', 'kit 2b phone: rule tap heading'))}${ruleTap(th('ชุดคำปริศนา', 'kit 2b phone: which script'), [th('ชุด ก', 'kit 2b phone: script 1'), th('ชุด ข', 'kit 2b phone: script 2')], 1, th('บนจอขึ้นว่า', 'phone: rule tap, which polarity'), POL(), 0)}${goButton(th('ดูผล', 'phone: see the result'))}`);

// ---- mini-event page (a projector event the players join by QR; real picks, gh#311 / gh#324) ----
const POOL = ['ส้มตำ', 'ผัดไทย', 'ต้มยำ', 'ไข่เจียว', 'ไก่ทอด', 'หมูปิ้ง', 'ข้าวเหนียว', 'โจ๊ก', 'บะหมี่', 'เกี๊ยว', 'กระเทียม', 'มะนาว', 'แตงโม', 'ทุเรียน', 'ลำไย', 'ถั่ว'];
const MATCH = new Set(['ไข่เจียว', 'ข้าวเหนียว', 'เกี๊ยว', 'กระเทียม', 'ทุเรียน']);
const MY = POOL.indexOf('ทุเรียน');
const miniTop = (round) => `<div class="top"><span class="ev">${th(GAME, 'game name', 'ticket')}</span><span class="lk">${th(`รอบที่ ${round}`, 'mini-event: round label')}</span></div>`;
const mnPick = () => stage('mn-pick', 'F', `${miniTop(1)}${hud(th('เลือก 1 คำในมือถือของคุณ', 'mini-event: pick instruction'), th('เปลี่ยนคำได้จนกว่าพิธีกรจะปิดรับ', 'mini-event: picks change until close'))}${poolTiles(POOL)}${lowBand(`<div class="lk">${th('เลือกแล้ว', 'mini-event: picked so far')}</div>${count(37, th('จาก 52 คน', 'mini-event: of N people'), 'sm')}`, timer('0:24'), `<div class="lk">${th('ใครไม่เลือก ระบบสุ่มคำให้', 'mini-event: random fill')}</div>`)}`);
const mnResult = () => stage('mn-result', 'F', `${miniTop(1)}${hud(condK(FORM[0]), POL()[0])}${poolTiles(POOL, (i) => (MATCH.has(POOL[i]) ? 'in' : 'out'))}${lowBand(`<div class="lk">${th('เหลือ', 'mini-event: still in')}</div>${count(12, th('คน', 'unit: people', 'g302'), 'sm')}`, '', `<div class="lk">${th('เล่นต่อจนเหลือผู้ชนะ 3 คน', 'mini-event: rounds repeat to the winner count')}</div>`)}`);
const mnWin = () => stage('mn-win', 'F', `${miniTop(3)}${hud(th('ผู้ชนะ', 'mini-event: winners heading'), th('3 คน', 'mini-event: winner count'))}${winners([ME, CAP_NAME, WIDE_AM])}`);
const MINI_EV = () => th(GAME, 'game name', 'ticket');
const mnPhPick = () => phone('mn-ph-pick', 'F', `${phoneHead(th('เลือก 1 คำ', 'mini-event phone: pick heading'), th('เปลี่ยนคำได้จนกว่าพิธีกรจะปิดรับ', 'mini-event: picks change until close'), MINI_EV())}<div class="ptime"><span class="msg">${th('เหลือเวลา', 'mini-event phone: time left')}</span><span class="pt-n">0:24</span></div>${poolButtons(POOL, MY)}`);
const mnPhClosed = () => phone('mn-ph-closed', 'F', `${phoneHead(th('ปิดรับแล้ว', 'mini-event phone: picking closed'), th('คำของคุณในรอบนี้', 'mini-event phone: your word this round'), MINI_EV())}${hand([POOL[MY]], 0)}<p class="msg">${th('รอพิธีกรจับกติกา', 'phone: waiting for the rule')}</p>`);
const mnPhFill = () => phone('mn-ph-fill', 'F', `${phoneHead(th('ปิดรับแล้ว', 'mini-event phone: picking closed'), th('คุณไม่ได้เลือกทันเวลา ระบบสุ่มคำให้', 'mini-event phone: random fill'), MINI_EV())}${hand(['ลำไย'])}<p class="msg">${th('รอพิธีกรจับกติกา', 'phone: waiting for the rule')}</p>`);
const mnPhResult = () => phone('mn-ph-result', 'F', `${phoneHead(th('ผลรอบที่ 1', 'phone: result heading'), '', MINI_EV())}${verdict(th('ผ่าน', 'legend: passed', 'g302'), '', `${condK(FORM[0])} · ${POL()[0]}`)}${hand([POOL[MY]], 0)}<p class="msg">${th('รอรอบที่ 2', 'mini-event phone: waiting for round 2')}</p>`);

// ---- board-only CSS and roles ----
const BOARD_CSS = `
    /* ---- Gh326PickRule annotation: the D2 spelling sample (annotation, not a frame) ---- */
    .tbl td.thbig { font-family: 'Mitr', sans-serif; font-weight: 600; font-size: 28px; line-height: 1.4; }`;
const BOARD_ROLES = [];

export const EXPECT = {
  A: ['dense', 'code', 'rule', 'ph-tap'],
  B: ['dense', 'code', 'rule', 'ph-tap'],
  F: ['flip', 'result', 'fallback', 'ph-code', 'ph-hand', 'ph-in', 'ph-out', 'ph2b-hand', 'ph2b-tap', 'mn-pick', 'mn-result', 'mn-win', 'mn-ph-pick', 'mn-ph-closed', 'mn-ph-fill', 'mn-ph-result'],
};

export function build() {
  resetCopy();
  // the copy this board reuses verbatim registers first (th: first registration wins)
  th('คน', 'unit: people', 'g302'); th('ผ่าน', 'legend: passed', 'g302'); th('ไม่ผ่าน', 'legend: did not pass', 'g302'); th('ผ่านรอบที่ 1', 'reveal: passed heading', 'g302');
  const d1 = OPTIONS.D1, d3 = OPTIONS.D3;
  const rows = [
    decisionsRow([
      ['<b>D1</b> glyph floor on the densest projector screen (admin mode, 200 heads, a word beside every name)', 'SHARED (kit) · all seven boards', `<b>A ${d1.A.label}</b>: words and names at ${d1.A.floor}px = ${(d1.A.floor / 10.8).toFixed(2)}% of the screen height, all 200 cells on one screen (${d1.A.cols} columns)`, `<b>B ${d1.B.label}</b>: ${d1.B.floor}px = ${(d1.B.floor / 10.8).toFixed(2)}% of the screen height, 100 cells per screen, two screens in turn (${d1.B.cols} columns)`, pickNote('D1')],
      ['<b>D2</b> vowel-form spelling in the condition label (conditions.ts <code>มีรูปสระ “x”</code>)', 'PILOT · gh#326', `<b>A ${D2.A}</b>: the stored written-only form, a hyphen for the consonant slot: “${esc(SPELL.A('เ-ีย'))}”, “${esc(SPELL.A('-ัว'))}”, “${esc(SPELL.A('-ิ'))}” (default)`, `<b>B ${D2.B}</b>: the same written-only marks with อ in the consonant slot: “${esc(SPELL.B('เ-ีย'))}”, “${esc(SPELL.B('-ัว'))}”, “${esc(SPELL.B('-ิ'))}”`, 'awaiting the owner'],
      ['<b>D3</b> grouping of the 14-digit round code (ADR-0080 decision 2)', 'SHARED (kit) · all seven boards', `<b>A ${d3.A.label}</b>: the picked 12-digit 4-4-4 grouping plus a pair`, `<b>B ${d3.B.label}</b>: three groups, as the 12-digit code has`, pickNote('D3')],
    ]),
    sec('D1 · GLYPH FLOOR · the densest projector screen, 1920x1080 at scale 1', `Admin mode at the setup cap (MAX_HEADS = 200), round 1 of a half-cut word round (200 to 100, ADR-0080): every name with its dealt word beside it. Drawn at real projector pixels, no transform, so the floor is read off the frame as the room sees it. The word column holds the widest bank word (${esc(WIDEST_WORD.text)}, ${WIDEST_WORD.em} em in Mitr 600, measured over all 923 bank words) at the floor: ${wordCol(d1.A.floor)}px in A, ${wordCol(d1.B.floor)}px in B. The widest name (${esc(WIDE_LATIN)}) sits beside the widest food word in one cell. A Thai consonant body is 0.54 em in Mitr 600 (measured): ${(d1.A.floor * 0.54).toFixed(1)}px in A, ${(d1.B.floor * 0.54).toFixed(1)}px in B. Not offered: 30px (the board's own text floor) needs four screens of 50.`,
      cands([cand(tag('A', d1.A.label, ` words and names at ${d1.A.floor}px, one screen of 200.`), dense('A')), cand(tag('B', d1.B.label, ` ${d1.B.floor}px, page 1 of 2 (100 cells); the two screens alternate on a timer until the MC draws the rule.`), dense('B'))], true)),
    sec('D2 · VOWEL-FORM LABEL · the rule card and the phone rule tap', 'The condition label is conditions.ts conditionWording for the `vowels` family, <code>มีรูปสระ “x”</code>, with x the stored form (src/prize-words schema VOWEL_FORMS: written marks only, a hyphen for the consonant slot). A prints x as stored; B puts อ in the slot, the school-book way of naming a vowel form. Both keep to what is written (an unwritten inherent vowel is never named). The drawn rule here: rule 0, “เ-ีย”, match = survive; the other candidate is “-ัว”. Read off this render (2026-11-20, Mitr 600 in Chrome): neither option draws a dotted circle; in A a lone mark sits on the hyphen, so “-ิ” and “-ั” read close to a plain dash or an equals sign (table below), while B attaches every mark to a real consonant.',
      cands([cand(tag('A', D2.A, ' (default)'), ruleFrame('A')), cand(tag('B', D2.B, ''), ruleFrame('B'))], true)
      + cands([cand(tag('A', D2.A, ' phone rule tap'), tapFrame('A')), cand(tag('B', D2.B, ' phone rule tap'), tapFrame('B'))])
      + `<table class="tbl"><tr><th>stored form</th>${['-ิ', '-ั', '-ำ', 'เ-็', '-ัว', 'เ-ีย', 'แ-', '-อ', 'เ-ือ'].map((f) => `<td class="thbig">${esc(f)}</td>`).join('')}</tr><tr><th>A as stored</th>${['-ิ', '-ั', '-ำ', 'เ-็', '-ัว', 'เ-ีย', 'แ-', '-อ', 'เ-ือ'].map((f) => `<td class="thbig">${esc(SPELL.A(f))}</td>`).join('')}</tr><tr><th>B อ in the slot</th>${['-ิ', '-ั', '-ำ', 'เ-็', '-ัว', 'เ-ีย', 'แ-', '-อ', 'เ-ือ'].map((f) => `<td class="thbig">${esc(SPELL.B(f))}</td>`).join('')}</tr></table>`),
    sec('D3 · ROUND CODE GROUPING · QR mode, the 14-digit code over a veil', `The code is real: ${CODE.length} digits, seed 48215, cut ${WORD_ROUND.keep}, bank revision 1, kind 8 (game 1, Thai, vowels), pool food, format 0, Damm check over the round number and the payload (copied from round-code.ts / round.ts; the render re-checks the digits on the frame). 112px Mitr 700 in the gh#302 / gh#303 1500px code card.`,
      cands([cand(tag('A', d3.A.label, ''), codeFrame('A')), cand(tag('B', d3.B.label, ''), codeFrame('B'))], true)),
    sec('SHARED · THE REVEAL · 2D stills of the 3D intent, and the never-blank 2D frame (ADR-0051)', `Drawn with the kit defaults (${pickNote('D1')}; D2 A). The flip: cells turn row by row from the top; the turning row carries a gold edge (the 3D turn itself is motion, beat table). The result: passed cells gold with ink type, the rest dimmed and struck through, in words on the legend (never colour alone). The never-blank frame (WebGL unavailable, ADR-0051) draws the same judged field flat on the night ground, without the receding stage floor; reduced motion reaches the same frame by 200ms fades.`,
      cands([cand(tag('F', 'FLIP', ' mid-wave, 3D intent'), flipFrame()), cand(tag('F', 'RESULT', ' 3D intent'), resultFrame('result', true)), cand(tag('F', 'NEVER-BLANK 2D', ' ADR-0051; also the reduced-motion end state'), resultFrame('fallback', false))], true)),
    sec('SHARED · THE PHONE · engine 2a (games 1, 5, 7) and the kit preview of engine 2b (games 2-4)', 'QR mode. The phone rebuilds its own hand from the 14-digit code before the rule (no server call at reveal, gh#299 decision 5); which rule was drawn, and the polarity, reach it only by the rule tap (round.ts RuleTap). Engine 2b: one hand of letters or words, two candidate scripts plus the same tap (ADR-0080 decision 1), so no phone holds the ending before the reveal. Real pixels at 320px, the site floor.',
      cands([cand(tag('F', 'CODE', ''), phCode()), cand(tag('F', 'HAND', ' theatre choice: all three share one fate'), phHand()), cand(tag('F', 'PASSED', ''), phIn()), cand(tag('F', 'DID NOT PASS', ''), phOut())])
      + cands([cand(tag('F', 'KIT 2B · HAND', ' game 2 shown: one letter tile'), ph2bHand()), cand(tag('F', 'KIT 2B · TAP', ' two scripts plus polarity'), ph2bTap())])),
    sec('SHARED · THE MINI-EVENT PAGE · real picks on players\' own phones (gh#311, gh#324)', 'Players join by QR; each picks one word from a shared pool of up to 16 (the pick route caps options at 16) on a timer. A pick can be changed until the MC closes picking (owner ruling 2026-11-19); at close, whoever has not picked gets a random pick. The rule is drawn after the picks are stored; a rule that would leave nobody, everybody or fewer than the winner count is redrawn automatically. Rounds repeat until the MC-set number of winners (1-5) remains; drawn here with 3.',
      cands([cand(tag('F', 'PICK', ' the pick timer on the main screen'), mnPick()), cand(tag('F', 'ROUND RESULT', ''), mnResult()), cand(tag('F', 'WINNERS', ''), mnWin())], true)
      + cands([cand(tag('F', 'PHONE · PICK', ' changeable until close'), mnPhPick()), cand(tag('F', 'PHONE · CLOSED', ''), mnPhClosed()), cand(tag('F', 'PHONE · RANDOM FILL', ''), mnPhFill()), cand(tag('F', 'PHONE · RESULT', ''), mnPhResult())])),
    `
  <div class="brow">
    <h2>3D STILL · a real three.js frame of a browser-drawn Thai word texture (pilot only)</h2>
    <p class="why">three 0.170.0 (the pinned package), headless Chrome with a live WebGL context asserted in the page. The hand of three words is drawn by the browser into a 2D canvas and applied as a texture on three tilted cards, sized so the untilted on-screen font is 1.06 x the D1 default floor (14px); the check reads the rendered ink of each word against the same word's 2D ink at the floor. Left, at the floor: 16 / 12 / 12px of ink against 15.51 / 11.58 / 11.58px (passes). Right, the must-red still at 0.75 x the floor: 12 / 9 / 9px (fails on every card). 1920x1080 at scale 1; open the files at full size.</p>
    <div class="cands"><img src="../docs/verification/evidence/gh325-boards-2026-11-20/Gh326PickRule-3d-floor.jpg" width="900" alt=""><img src="../docs/verification/evidence/gh325-boards-2026-11-20/Gh326PickRule-3d-below-floor.jpg" width="900" alt=""></div>
  </div>`,
    sec('VALUES · kit values and their sources', 'Every frame value is a literal from tokens.css, a gh#302 / gh#303 pick, or a PROPOSAL named here.', valuesTable(KIT_VALUES) + contrastTable(KIT_PAIRS)),
    sec('BEATS · the reveal on the main screen (3D intent)', 'Beat timing follows the gh#303 picked flip (600ms per turn); every beat has a reduced-motion form (ADR-0046: reduce, not remove).', beatTable([
      ['the deal (admin mode)', 'held', 'the field of word cells settles onto the stage floor, a short drop per row', 'the field appears in place with one 200ms fade'],
      ['polarity drawn', '1.2s', 'a pill spins to "ตรงกติกา รอด" or "ตรงกติกา ตก"; the MC can switch it before the rule draw', 'the pill fades in on its final value'],
      ['rule drawn', '1.5s', 'the white rule card turns in over the veil and settles centre stage', 'the card fades in'],
      ['flip', '600ms per row, rows overlap', 'cells turn row by row from the top; each row is judged as it lands', 'all cells change in place with one 200ms fade, then the judging fades in'],
      ['result', 'held', 'passed cells glow; the count rolls to the keep', 'the count is shown at its final value'],
    ])),
    nameFitRow([
      ['dense field names (D1 A)', 'Sarabun 400', `${d1.A.nameMax}px`, `${d1.A.floor}px`, `a ${d1.A.cols}-column cell less the word column and padding`, 'measured by the render (fit report)'],
      ['dense field names (D1 B)', 'Sarabun 400', `${d1.B.nameMax}px`, `${d1.B.floor}px`, `a ${d1.B.cols}-column cell less the word column and padding`, 'measured by the render (fit report)'],
      ['mini-event winners', 'Mitr 700', '64px', '40px', '1100px card less 80px padding', 'measured by the render'],
      ['phone pool buttons (words, not names)', 'Mitr 600', '20px', '16px', 'half the 288px column less 8px gap and 16px padding', 'measured by the render'],
    ]),
    copyRow(),
    rolesRow([...KIT_ROLES, ...BOARD_ROLES]),
    notesRow([
      '<b>Rests on:</b> gh#311 (the plan and the 2026-11-11 / 2026-11-19 owner rulings), gh#326 (game 1), ADR-0080 (half-cut, the 14-digit code), ADR-0076 and the picks design doc (the pick routes, 2-16 options, picks change until close), ADR-0051 (never-blank), gh#299 decision 11 (3D main screen) and its wording constraint, CONTEXT.md (company-party category).',
      '<b>Words</b> are data from the bank at commit 50f74b7 (review pending, gh#321), frozen as literals on this board; none is read from src at generate time.',
      '<b>Not covered:</b> a real projector, room or viewing distance; the 3D motion itself (frames are stills, beats are described); English rounds (same frames, bank English words; the language is the MC\'s per round); the MC\'s own controls (polarity switch, family pick) on the setup device; the phone pages at widths other than 320px.',
    ]),
  ];
  const head = [ORDER_LINE,
    `Game 1 of the seven letter and word games (gh#326, the template). Shared kit: docs/verification/evidence/gh325-boards-2026-11-20/kit.mjs (gh#325). Decisions: D1 and D3 are SHARED kit parameters (an owner pick regenerates every board); D2 is this game's.`,
    'Fixture: the gh#302 roster at the setup cap of 200, the three NAME FIT worst cases in it, played as round 1 of 4, a half-cut word round (200 to 100). Pool: food. Candidate rules: has the written vowel form “เ-ีย” / “-ัว”.'];
  return boardDoc(NAME, 'gh#326 pilot board (เลือกคำ ลุ้นกติกา) on the gh#325 kit.', head, BOARD_CSS, rows);
}

// Board-specific must-red plants (the kit's generic plants are added by mustred.mjs).
export const PLANTS = [
  ['d1-dense-clip', (s) => s.replace('</style>', '.pj .wc .wd { width: 40px !important; }</style>'), /clipped in A\/dense/],
  ['d2-rule-clip', (s) => s.replace('</style>', '.pj .rc .rv { font-size: 260px !important; }</style>'), /clipped in A\/rule/],
  ['field-count', (s) => s.replace('data-expect="200/100"', 'data-expect="200/101"'), /field count in F\/result: holds 200 with 100 passed, says 200\/101/],
  ['mini-overlap', (s) => s.replace('</style>', '.pj .pool { display: block !important; } .pj .pt { position: absolute !important; left: 0px; top: 0px; width: 300px; }</style>'), /name boxes overlap in F\/mn-pick/],
];

// Extra must-red commands: the 3D still at the floor (control) and below it (must red on its own line).
export const EXTRA = [
  ['three-still at the floor', ['three-still.mjs'], { MODE: 'floor' }, null],
  ['three-still below the floor', ['three-still.mjs'], { MODE: 'below' }, /3D glyph ink under the floor/],
];

export const BOARD = { name: NAME, build, expect: EXPECT, plants: PLANTS, extra: EXTRA, sel: {}, floors: {} };
