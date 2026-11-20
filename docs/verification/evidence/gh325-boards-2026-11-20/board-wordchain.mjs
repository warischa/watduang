// gh#329 board: the word-chain game (game 4 of the seven letter and word games), on the gh#325 kit. Writes
// design/Gh329WordChain.dc.html through make-boards.mjs. Owns three questions of its own (G329-D4 a chain word nobody
// holds, G329-D5 the link letter, G329-D6 the rule tap) and draws the two SHARED kit decisions (D1 glyph floor,
// D3 code grouping) only as KIT_OPT / KIT_VALUE with pickNote, never their options.
//
// Data, read ONCE from src at commit 50f74b7 with review ignored (the bank is review-pending, gh#321) and frozen as
// literals here; nothing is read from src at generate time: the chain pair is chain.ts's seeded pair for event key
// 'gh329-board', round 1, seed 48215, Thai food; every holding is chain.ts's per-identity hash for that round.
import {
  th, nm, esc, resetCopy, contrastTable, valuesTable, beatTable, nameFitRow, notesRow,
  OPTIONS, KIT_OPT, KIT_VALUE, pickNote, WORD_ROUND, assertHalfCut, ME, CAP_NAME, WIDE_AM, wordCode, boardDoc, ORDER_LINE,
  rolesRow, copyRow, sec, cand, cands, tag, stage, phone, topBar, hud, lowBand, count, floorLayer, denseField, codeCard,
  codeField, phoneHead, hand, ruleTap, goButton, verdict, poolTiles, poolButtons, timer, winners,
  KIT_ROLES, KIT_VALUES, KIT_PAIRS,
} from './kit.mjs';

const NAME = 'Gh329WordChain';
const GAME_TEXT = 'คำต่อคำ';
const GAME_SRC = 'gh#329 body · owner wording, verbatim (the game name)';
const GAME = () => th(GAME_TEXT, 'game name', GAME_SRC);

// ---- the round: game 4, Thai, pool food. Two word-disjoint chains of CHAIN_LENGTH 5 (chain.ts). ----
const CHAINS = [
  ['กระเทียม', 'มะละกอ', 'องุ่น', 'น้ำส้ม', 'มะนาว'],
  ['ขนมจีน', 'น้ำพริก', 'เกลือ', 'แอปเปิล', 'ลูกชิ้น'],
];
// Each name's chain position, in WORD_ROUND.names order; the word is CHAINS[group][digit].
const POS = '44021433311441010333040441200211431103231411423332431414210102043014303032023220240043442112343200111010041032010324021011343444134000443203414301333032013242400021113204120421120004221140133004330043';
const HOLD = new Map(WORD_ROUND.names.map((n, i) => [n, CHAINS[WORD_ROUND.group.get(n)][Number(POS[i])]]));
const holders = (g) => CHAINS[g].map((w) => WORD_ROUND.names.filter((n) => WORD_ROUND.group.get(n) === g && HOLD.get(n) === w).length);
const H0 = holders(0);
// Guard: the frozen holdings are the ones measured (25, 17, 17, 15, 26 | 23, 25, 13, 25, 14), and sum to the keep.
if (H0.join() !== '25,17,17,15,26' || holders(1).join() !== '23,25,13,25,14' || H0.reduce((a, b) => a + b) !== WORD_ROUND.keep) throw new Error(`chain holdings drifted: ${H0} | ${holders(1)}`);
const ME_WORD = HOLD.get(ME); // chain 0, step 4
const OUT_NAME = WORD_ROUND.names.find((n) => WORD_ROUND.group.get(n) === 1);
// Kind 54 = engine 2b's block (50) + the SCRIPT_KINDS index of (game 4, Thai); the same code as scripted.ts scriptCode.
const CODE = wordCode(1, { seed: '48215', cut: WORD_ROUND.keep, revision: 1, kind: 54, pool: 'food' });

// ---- G329-D4 fixture: the same round at 10 heads, a half-cut 10 -> 5. Holdings from the same hash: group 0 holds
// 1, 0, 1, 1, 2 of chain 0, so its second word is held by nobody. ----
const SMALL = (() => {
  const g0 = [[ME, 3], ['ออม ท.', 4], ['พลอย ส.', 4], ['บีม ก.', 0], ['นุ่น ท.', 2]];
  const g1 = [['โอ๊ต ท.', 1], ['ปาล์ม ก.', 3], ['บีม ท.', 1], ['หมิว พ.', 1], ['พลอย ท.', 4]];
  const names = [...g0, ...g1].map(([n]) => n);
  const group = new Map([...g0.map(([n]) => [n, 0]), ...g1.map(([n]) => [n, 1])]);
  const ev = { live: 10, keep: 5, names, group };
  assertHalfCut(ev);
  const held = CHAINS[0].map((w, i) => g0.filter(([, p]) => p === i).length);
  if (held.join() !== '1,0,1,1,2') throw new Error(`small fixture drifted: ${held}`);
  return { ...ev, held };
})();

// ---- the link letter (G329-D5). Thai: the last written character (a consonant, by the ruling) and the next
// word's first consonant, leading vowels skipped. Highlighting takes the WHOLE grapheme cluster that carries the
// letter, so a consonant is never split from its marks. ----
const SEG = new Intl.Segmenter('th', { granularity: 'grapheme' });
const LEADING = /[เ-ไ]/;
const firstConsonant = (w) => [...w].find((c) => !LEADING.test(c));
const lastChar = (w) => [...w].pop();
function marked(w, first, last) {
  const segs = [...SEG.segment(w)].map((s) => s.segment);
  const fi = segs.findIndex((s) => !LEADING.test(s));
  return segs.map((s, i) => ((first && i === fi) || (last && i === segs.length - 1) ? `<span class="lc">${esc(s)}</span>` : esc(s))).join('');
}
for (const c of CHAINS) for (let i = 0; i + 1 < c.length; i++) if (lastChar(c[i]) !== firstConsonant(c[i + 1])) throw new Error(`no link ${c[i]} -> ${c[i + 1]}`);

// The chain: one .st per word (so data-expect counts words), a link mark before every word but the first.
// opts: counts (holders per word), mark 'A' (letter in the word) | 'B' (letter tile), showCounts (G329-D4 A).
function chain(words, { counts, mark = 'A', showCounts = true, sm = false }) {
  const held = counts.filter((n) => n > 0).length;
  const steps = words.map((w, i) => {
    const link = i === 0 ? '' : mark === 'A' ? '<div class="ln"></div>' : `<div class="lb">${esc(lastChar(words[i - 1]))}</div>`;
    const word = mark === 'A' ? marked(w, i > 0, i < words.length - 1) : esc(w);
    const n = counts[i];
    const line = !showCounts ? '' : n > 0 ? `<span class="cn">${n} ${th('คน', 'unit: people', 'g302')}</span>` : `<span class="cn">${th('ไม่มีใครถือคำนี้', 'chain: a word nobody holds (G329-D4 A)')}</span>`;
    return `<div class="st${n > 0 ? ' lit' : ''}">${link}<div class="cl${n > 0 || !showCounts ? '' : ' nb'}"><span class="cw">${word}</span>${line}</div></div>`;
  });
  return `<div class="chn${sm ? ' sm' : ''}" data-expect="${words.length}/${held}">${steps.join('')}</div>`;
}

const POL = () => [th('ต่อติด รอด', 'polarity: linked = survive'), th('ต่อติด ตก', 'polarity: linked = out')];
const stepLine = (k) => `${th(`คำที่ ${k} จาก 5`, 'chain: step label')} · ${th('พยัญชนะตัวท้าย ต่อเป็นพยัญชนะตัวแรกของคำถัดไป', 'chain: the link rule shown to the room')}`;
const pill = (p) => `<span class="pp">${p}</span>`;
const linkedBand = (n, label = th('ต่อติด', 'chain: linked count label')) => lowBand(pill(POL()[0]), '', `<div class="lk">${label}</div>${count(n, th('คน', 'unit: people', 'g302'), 'sm')}`);
const KIT_D1 = () => KIT_OPT('D1');
const KIT_D3 = () => KIT_VALUE('D3').groups;

// ---- G329-D4 · a word nobody holds (10 -> 5, the whole chain) ----
const unheldFrame = (opt) => stage('unheld', opt, `${topBar(1)}${hud(GAME(), stepLine(5))}${chain(CHAINS[0], { counts: SMALL.held, showCounts: opt === 'A' })}${linkedBand(SMALL.keep)}`);
// ---- G329-D5 · the link letter (200 -> 100, the whole chain) ----
const chainFrame = (opt) => stage('chain', opt, `${topBar(1)}${hud(GAME(), stepLine(5))}${chain(CHAINS[0], { counts: H0, mark: opt })}${linkedBand(WORD_ROUND.keep)}`);
// ---- G329-D6 · the rule tap ----
const TAP = {
  A: () => [th('แตะคำแรกที่ขึ้นบนจอ', 'phone: rule tap heading (G329-D6 A)'), th('คำแรกบนจอ', 'phone: which chain, by its first word (G329-D6 A)'), CHAINS.map((c) => esc(c[0]))],
  B: () => [th('แตะชุดที่ขึ้นบนจอ', 'phone: rule tap heading (G329-D6 B)'), th('ชุดคำบนจอ', 'phone: which chain, by its set name (G329-D6 B)'), [th('ชุด ก', 'set name 1 (G329-D6 B)'), th('ชุด ข', 'set name 2 (G329-D6 B)')]],
};
const tapFrame = (opt) => { const [h, which, labels] = TAP[opt](); return phone('ph-tap', opt, `${phoneHead(h)}${ruleTap(which, labels, 0, th('บนจอขึ้นว่า', 'phone: rule tap, which polarity'), POL(), 0)}${goButton(th('ดูผล', 'phone: see the result'))}`); };

// ---- shared: the deal, the code, the reveal ----
const cells = (state) => WORD_ROUND.names.map((n, i) => [n, HOLD.get(n), state(n, i)]);
function dealFrame() {
  const o = OPTIONS.D1[KIT_D1()];
  const people = count(WORD_ROUND.live, th('คน', 'unit: people', 'g302'));
  const right = o.perPage < WORD_ROUND.live ? `<div class="lk">${th('หน้า 1 จาก 2', 'dense field: page indicator')}</div>${people}` : people;
  return stage('deal', 'F', `${topBar(1)}${denseField(cells(() => ''), KIT_D1())}${lowBand(`<div class="gname">${GAME()}</div>`, `<div class="lk">${th('ดูคำข้างชื่อของคุณ', 'dense field: instruction (admin mode)')}</div>`, right, 'slim')}`);
}
const codeFrame = () => stage('code', 'F', `${topBar(1)}${hud(GAME())}${codeCard(CODE, 1, KIT_D3(), th('รหัสรอบที่ 1', 'round code: label (round 1)'), th('ใส่รหัสนี้ในมือถือ เพื่อดูคำของคุณ', 'round code: instruction'))}`);
const STEP = 3; // the shared reveal frames stop after the third word
const linkedSoFar = H0.slice(0, STEP).reduce((a, b) => a + b);
const stepFrame = () => stage('step', 'F', `${topBar(1)}${hud(GAME(), stepLine(STEP))}${chain(CHAINS[0].slice(0, STEP), { counts: H0.slice(0, STEP) })}${linkedBand(linkedSoFar, th('ต่อติดแล้ว', 'chain: linked so far'))}`);
const adWordFrame = () => stage('ad-word', 'F', `${topBar(1)}${denseField(cells(() => ''), KIT_D1())}<div class="veil"></div>${hud(GAME(), stepLine(STEP))}${chain(CHAINS[0].slice(0, STEP), { counts: H0.slice(0, STEP) })}`);
function adLitFrame() {
  const lit = new Set(CHAINS[0].slice(0, STEP));
  const band = lowBand(`<div class="gname">${GAME()}</div>`, `<div class="lk">${th(`คำที่ ${STEP}:`, 'admin: the word just landed')} ${esc(CHAINS[0][STEP - 1])}</div>`, `<div class="lk">${th('ต่อติดแล้ว', 'chain: linked so far')}</div>${count(linkedSoFar, th('คน', 'unit: people', 'g302'))}`, 'slim');
  return stage('ad-lit', 'F', `${topBar(1)}${denseField(cells((n) => (WORD_ROUND.group.get(n) === 0 && lit.has(HOLD.get(n)) ? 'in' : '')), KIT_D1())}${band}`);
}
function resultFrame() {
  const legend = `<div class="legend"><div class="wc in"><span class="lg">${th('ผ่าน', 'legend: passed', 'g302')}</span></div><div class="wc out"><span class="lg">${th('ไม่ผ่าน', 'legend: did not pass', 'g302')}</span></div></div>`;
  const band = lowBand(`<div class="gname">${GAME()}</div>`, legend, `<div class="lk">${th('ผ่านรอบที่ 1', 'reveal: passed heading', 'g302')}</div>${count(WORD_ROUND.keep, th('คน', 'unit: people', 'g302'))}`, 'slim');
  return stage('result', 'F', `${floorLayer()}${topBar(1)}${denseField(cells((n) => (WORD_ROUND.group.get(n) === 0 ? 'in' : 'out')), KIT_D1())}${band}`);
}

// ---- shared: the phone (engine 2b: one word, the rule tap, then every step on its own) ----
const tappedLine = (line) => `${line} · ${POL()[0]}`;
const phCode = () => phone('ph-code', 'F', `${phoneHead(th('ใส่รหัสรอบ', 'phone: code entry heading'), th('รหัส 14 หลักที่ขึ้นบนจอใหญ่', 'phone: code entry hint'))}${codeField(CODE, 1, KIT_D3())}${goButton(th('ดูคำของฉัน', 'phone: see my word'))}`);
const phHand = () => phone('ph-hand', 'F', `${phoneHead(th('คำในมือคุณ', 'phone: hand heading'), th('คำของคุณจะต่อติดหรือไม่ รู้ได้ตอนคำขึ้นบนจอ', 'phone: hand, the fate is open'))}${hand([ME_WORD], 0)}`);
const meStep = CHAINS[0].indexOf(ME_WORD) + 1;
const phStep = () => phone('ph-step', 'F', `${phoneHead(th(`คำที่ ${meStep} จาก 5`, 'chain: step label'), th('คำของคุณต่อติดแล้ว', 'phone: your word is linked'))}${hand(CHAINS[0].slice(0, meStep), meStep - 1)}`);
const phIn = () => phone('ph-in', 'F', `${phoneHead(th('ผลรอบที่ 1', 'phone: result heading'))}${verdict(th('ผ่าน', 'legend: passed', 'g302'), '', tappedLine(th('คำของคุณต่อติดในสาย', 'phone: linked')))}${hand([ME_WORD], 0)}`);
const phOut = () => phone('ph-out', 'F', `${phoneHead(th('ผลรอบที่ 1', 'phone: result heading'))}${verdict(th('ไม่ผ่าน', 'legend: did not pass', 'g302'), 'out', tappedLine(th('คำของคุณไม่อยู่ในสายที่ขึ้น', 'phone: not in the drawn chain')))}${hand([HOLD.get(OUT_NAME)])}`);

// ---- mini-event page (real picks, gh#311 / gh#324). Reading drawn, not ruled: the screen grows the longest chain
// the PICKED words allow, and whoever picked a word in it passes. Sample picks (not the engine): 52 players, 13 of
// the 16 words picked (pool indices 4, 8 and 15 by nobody); the longest chain over the picked words is 6 (searched
// exhaustively with chain.ts links over the stored cells, 2026-11-20). ----
const POOL = ['กระเทียม', 'มะละกอ', 'องุ่น', 'น้ำส้ม', 'มะนาว', 'ขนมจีน', 'น้ำพริก', 'เกลือ', 'แอปเปิล', 'ลูกชิ้น', 'ผัดไทย', 'ต้มยำ', 'ไข่เจียว', 'ทุเรียน', 'ข้าวเหนียว', 'ไก่ทอด'];
const MINI_CHAIN = ['ขนมจีน', 'น้ำส้ม', 'มะละกอ', 'องุ่น', 'น้ำพริก', 'กระเทียม'];
const MINI_PICKS = [4, 5, 3, 6, 2, 3];
for (let i = 0; i + 1 < MINI_CHAIN.length; i++) if (lastChar(MINI_CHAIN[i]) !== firstConsonant(MINI_CHAIN[i + 1])) throw new Error(`no link ${MINI_CHAIN[i]} -> ${MINI_CHAIN[i + 1]}`);
const MINI_PASS = MINI_PICKS.reduce((a, b) => a + b);
const MY = POOL.indexOf('น้ำส้ม');
const MINI_EV = () => GAME();
const miniTop = (round) => `<div class="top"><span class="ev">${GAME()}</span><span class="lk">${th(`รอบที่ ${round}`, 'mini-event: round label')}</span></div>`;
const mnPick = () => stage('mn-pick', 'F', `${miniTop(1)}${hud(th('เลือก 1 คำในมือถือของคุณ', 'mini-event: pick instruction'), th('เปลี่ยนคำได้จนกว่าพิธีกรจะปิดรับ', 'mini-event: picks change until close'))}${poolTiles(POOL)}${lowBand(`<div class="lk">${th('เลือกแล้ว', 'mini-event: picked so far')}</div>${count(37, th('จาก 52 คน', 'mini-event: of N people'), 'sm')}`, timer('0:24'), `<div class="lk">${th('ใครไม่เลือก ระบบสุ่มคำให้', 'mini-event: random fill')}</div>`)}`);
const mnChain = () => stage('mn-chain', 'F', `${miniTop(1)}${hud(th('สายที่ยาวที่สุดจากคำที่เลือก', 'mini-event: the longest chain from the picks'), th('ใครเลือกคำในสาย ผ่าน', 'mini-event: picked a word in the chain = pass'))}${chain(MINI_CHAIN, { counts: MINI_PICKS, sm: true })}${lowBand(`<div class="lk">${th('เหลือ', 'mini-event: still in')}</div>${count(MINI_PASS, th('คน', 'unit: people', 'g302'), 'sm')}`, '', `<div class="lk">${th('เล่นต่อจนเหลือผู้ชนะ 3 คน', 'mini-event: rounds repeat to the winner count')}</div>`)}`);
const mnWin = () => stage('mn-win', 'F', `${miniTop(3)}${hud(th('ผู้ชนะ', 'mini-event: winners heading'), th('3 คน', 'mini-event: winner count'))}${winners([ME, CAP_NAME, WIDE_AM])}`);
const mnPhPick = () => phone('mn-ph-pick', 'F', `${phoneHead(th('เลือก 1 คำ', 'mini-event phone: pick heading'), th('เปลี่ยนคำได้จนกว่าพิธีกรจะปิดรับ', 'mini-event: picks change until close'), MINI_EV())}<div class="ptime"><span class="msg">${th('เหลือเวลา', 'mini-event phone: time left')}</span><span class="pt-n">0:24</span></div>${poolButtons(POOL, MY)}`);
const mnPhResult = () => phone('mn-ph-result', 'F', `${phoneHead(th('ผลรอบที่ 1', 'phone: result heading'), '', MINI_EV())}${verdict(th('ผ่าน', 'legend: passed', 'g302'), '', th('คำของคุณอยู่ในสายที่ยาวที่สุด', 'mini-event phone: your word is in the longest chain'))}${hand([POOL[MY]], 0)}<p class="msg">${th('รอรอบที่ 2', 'mini-event phone: waiting for round 2')}</p>`);

// ---- board-only CSS, roles, values ----
const GLOW16 = 'rgba(255,204,0,0.45) 0px 0px 16px 0px';
const BOARD_CSS = `
    /* ---- Gh329WordChain: the chain on the main screen (2D still of the 3D intent) ---- */
    .pj .chn { position: absolute; left: 56px; right: 56px; top: 330px; display: flex; flex-wrap: wrap; justify-content: center; align-items: center; row-gap: 28px; z-index: 3; }
    .pj .st { display: flex; align-items: center; }
    .pj .cl { box-sizing: border-box; display: flex; flex-direction: column; align-items: center; padding: 10px 32px 14px; border-radius: 24px; background-color: #23214d; box-shadow: inset 0 0 0 3px #ffcc00; }
    .pj .cl.nb { background-color: transparent; box-shadow: inset 0 0 0 2px #9a97c0; }
    .pj .cl .cw { font: 700 64px/1.3 'Mitr', sans-serif; color: #ffcc00; white-space: nowrap; overflow-x: clip; overflow-y: visible; }
    .pj .chn.sm .cl .cw { font-size: 56px; }
    .pj .cl .cn { font: 600 30px/1.35 'Mitr', sans-serif; color: #d9d6f0; white-space: nowrap; overflow-x: clip; overflow-y: visible; }
    .pj .cl.nb .cw, .pj .cl.nb .cn { color: #9a97c0; }
    /* G329-D5 A: the link letter's grapheme cluster, white in a dark well, whole; a bar between the words */
    .pj .lc { display: inline-block; line-height: 1; padding: 0 4px; border-radius: 16px; background-color: #14142b; color: #ffffff; }
    .pj .ln { width: 44px; height: 8px; margin: 0 10px; border-radius: 999px; background-color: #ffcc00; }
    /* G329-D5 B: the link consonant alone on a tile between the words */
    .pj .lb { box-sizing: border-box; width: 76px; height: 76px; margin: 0 14px; display: flex; align-items: center; justify-content: center; border-radius: 50%; background-color: #ffcc00; color: #14142b; font: 700 44px/1 'Mitr', sans-serif; box-shadow: 0 0 16px rgba(255,204,0,0.45); }
    /* the drawn polarity on the chain screen (the kit polarity pill values) */
    .pj .pp { display: inline-flex; align-items: center; padding: 6px 36px; border-radius: 999px; background-color: #14142b; color: #ffcc00; font: 700 52px/1.3 'Mitr', sans-serif; white-space: nowrap; }`;
const BOARD_ROLES = [
  ['chain card shape', '.pj .cl', ['radius:24px'], 'gh#302 B PICKED winner-card radius'],
  ['chain card, held', '.pj .cl:not(.nb)', ['background-color:#23214d', 'box-shadow:#ffcc00 0px 0px 0px 3px inset'], 'gh#302 B PICKED winner card (#23214d, gold edge)'],
  ['chain card held by nobody (G329-D4 A)', '.pj .cl.nb', ['box-shadow:#9a97c0 0px 0px 0px 2px inset'], 'PROPOSAL; #9a97c0 (gh#302 B PICKED)'],
  ['chain word', '.pj .cl:not(.nb) .cw', ['color:#ffcc00'], 'tokens.css --accent-gold'],
  ['holder count under a word', '.pj .cl:not(.nb) .cn', ['color:#d9d6f0'], 'tokens.css --ink-on-band-soft'],
  ['word and line held by nobody (G329-D4 A)', '.pj .cl.nb :is(.cw, .cn)', ['color:#9a97c0'], '#9a97c0 (gh#302 B PICKED)'],
  ['link letter in the word (G329-D5 A)', '.pj .lc', ['background-color:#14142b', 'color:#ffffff', 'radius:16px'], 'PROPOSAL; tokens.css --ink-light on --color-line-strong'],
  ['link bar (G329-D5 A)', '.pj .ln', ['background-color:#ffcc00', 'radius:999px'], 'PROPOSAL; tokens.css --accent-gold'],
  ['link tile (G329-D5 B)', '.pj .lb', ['background-color:#ffcc00', 'color:#14142b', 'radius:50%', `box-shadow:${GLOW16}`], 'PROPOSAL; ink on gold, gold glow'],
  ['polarity pill on the chain screen', '.pj .pp', ['background-color:#14142b', 'color:#ffcc00', 'radius:999px'], 'the kit polarity pill values'],
];
const BOARD_VALUES = [
  ['64px Mitr 700 #ffcc00 on #23214d, 24px radius, 3px gold inset edge', 'a chain word card (56px on the mini-event chain, which holds 6)', 'gh#302 B winner card values; size PROPOSAL'],
  ['30px Mitr 600 #d9d6f0', 'the holder count under a word', 'the kit secondary label'],
  ['#9a97c0 type, 2px #9a97c0 inset ring, no fill', 'a chain word nobody holds (G329-D4 A)', 'PROPOSAL; #9a97c0 (gh#302 B)'],
  ['#ffffff in a #14142b well, 16px radius, one em tall', 'the link letter cluster inside a gold word (G329-D5 A); marks above the well stay white on the card (a gold pill was tried first and left them in dark ink on the dark card)', 'PROPOSAL; tokens.css --ink-light, --color-line-strong'],
  ['44 x 8px #ffcc00 bar', 'between two words (G329-D5 A)', 'PROPOSAL'],
  ['76px #ffcc00 circle, 44px Mitr 700 #14142b, 16px gold glow', 'the link consonant tile between two words (G329-D5 B)', 'PROPOSAL'],
];

export const EXPECT = {
  A: ['unheld', 'chain', 'ph-tap'],
  B: ['unheld', 'chain', 'ph-tap'],
  F: ['deal', 'code', 'step', 'ad-word', 'ad-lit', 'result', 'ph-code', 'ph-hand', 'ph-step', 'ph-in', 'ph-out', 'mn-pick', 'mn-chain', 'mn-win', 'mn-ph-pick', 'mn-ph-result'],
};

function decisions() {
  const d1 = OPTIONS.D1, d3 = OPTIONS.D3;
  const rows = [
    ['<b>D1</b> glyph floor on the densest projector screen', 'SHARED (kit) · drawn and picked on Gh326PickRule', `A ${d1.A.label}`, `B ${d1.B.label}`, pickNote('D1')],
    ['<b>D3</b> grouping of the 14-digit round code', 'SHARED (kit) · drawn and picked on Gh326PickRule', `A ${d3.A.label}`, `B ${d3.B.label}`, pickNote('D3')],
    ['<b>G329-D4</b> a chain word nobody holds (the open call of gh#329)', 'gh#329', '<b>A SAID ON SCREEN</b>: every word carries its holder count; a word nobody holds lands in a dim ring with “ไม่มีใครถือคำนี้” (default)', '<b>B EVERY WORD THE SAME</b>: no count under any word; a word nobody holds lands like every other; only the running total moves', 'awaiting the owner'],
    ['<b>G329-D5</b> how the link letter is shown', 'gh#329', '<b>A LETTER IN THE WORD</b>: the letter is white in a dark well in both words, its whole grapheme cluster, with a bar between the words (default)', '<b>B LETTER TILE</b>: the consonant alone on a gold tile between the two words; the words stay untouched', 'awaiting the owner'],
    ['<b>G329-D6</b> how the phone names the drawn chain in the rule tap', 'gh#329', '<b>A TAP THE FIRST WORD</b>: the two candidate chains by their first words (default)', '<b>B TAP THE SET NAME</b>: “ชุด ก” / “ชุด ข”, which the main screen then shows above the chain', 'awaiting the owner'],
  ];
  return sec('DECISIONS FOR THE OWNER · one pick per row',
    'Shared rows (kit parameters) are drawn and picked on Gh326PickRule; a pick there regenerates this board. G329 rows bind gh#329 only. Already ruled, not re-asked: 3D on the main screen (gh#299 decision 11), the never-blank 2D fallback (ADR-0051), half-cut event rounds with two candidate scripts plus the rule tap, random switchable polarity, and the 14-digit code (ADR-0080), the Thai link-letter rule (owner ruling 2026-11-19, recorded on gh#329), picks changeable until the MC closes picking (gh#311, 2026-11-19).',
    `<table class="tbl"><tr><th>decision</th><th>scope</th><th>A</th><th>B</th><th>status</th></tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`);
}

export function build() {
  resetCopy();
  // the copy this board reuses verbatim registers first (th: first registration wins)
  th('คน', 'unit: people', 'g302'); th('ผ่าน', 'legend: passed', 'g302'); th('ไม่ผ่าน', 'legend: did not pass', 'g302'); th('ผ่านรอบที่ 1', 'reveal: passed heading', 'g302');
  GAME();
  const rows = [
    decisions(),
    sec('G329-D4 · A CHAIN WORD NOBODY HOLDS · the same round at 10 heads, a half-cut 10 to 5',
      `Holders are hashed over the chain's 5 positions (chain.ts: a phone knows neither the roster nor the group size), so at small cuts a chain word can be held by nobody. gh#323 evidence (sweep A): chains with a word nobody holds, 3,870 of 4,032 at 10 to 5; 2,527 of 5,436 at 20 to 10; about 0 from 40 to 20 up. Drawn: the same round as the 200-head fixture, at 10 heads; group 0 holds 1, 0, 1, 1, 2 of the drawn chain (the hash, read 2026-11-20), so ${esc(CHAINS[0][1])}, the second word, is held by nobody. It still carries the link (its last letter starts ${esc(CHAINS[0][2])}), so the chain cannot skip it. The phone cannot tell either (it has no roster), so both options change the main screen only. Not offered: a chain that shortens with the cut, an engine change (gh#323 open risk), not a canvas option.`,
      cands([cand(tag('A', 'SAID ON SCREEN', ' (default) every word carries its count; the word nobody holds lands in a dim ring and says so.'), unheldFrame('A')), cand(tag('B', 'EVERY WORD THE SAME', ' no per-word count; the room sees only the running total.'), unheldFrame('B'))], true)),
    sec('G329-D5 · THE LINK LETTER · 200 to 100, the whole drawn chain',
      `The link rule (owner ruling 2026-11-19, gh#329): a Thai word joins only when its last written character is a consonant of the 44-consonant table; the next word starts with that consonant, leading vowels skipped (${esc(CHAINS[1][2])} to ${esc(CHAINS[1][3])} links on อ, the leading แ skipped). A highlights the letter in both words; the highlight takes the whole grapheme cluster (${esc('น้ำ')} in ${esc(CHAINS[0][3])}, ${esc('ลู')} in ${esc(CHAINS[1][4])}), never a consonant split from its marks. B sets the consonant alone on a tile between the words and leaves the words untouched. Holders per word from the hash: ${H0.join(', ')} = ${WORD_ROUND.keep}. The chains are chain.ts's seeded pair for this round (food, seed 48215); the other candidate is ${CHAINS[1].map(esc).join(' · ')}.`,
      cands([cand(tag('A', 'LETTER IN THE WORD', ' (default)'), chainFrame('A')), cand(tag('B', 'LETTER TILE', ''), chainFrame('B'))], true)),
    sec('G329-D6 · THE RULE TAP · how the phone learns which chain the screen drew',
      'The phone rebuilds both candidate chains and its own word from the 14-digit code; which chain the screen drew, and the polarity, reach it only by the tap (round.ts RuleTap, as the kit preview of engine 2b), then it follows every step on its own. A names each chain by its first word, the word the room has just seen land. B names them ชุด ก / ชุด ข, so the main screen must also show the set name above the chain (not drawn on the shared frames, which draw A). Real pixels at 320px.',
      cands([cand(tag('A', 'TAP THE FIRST WORD', ' (default)'), tapFrame('A')), cand(tag('B', 'TAP THE SET NAME', ''), tapFrame('B'))])),
    sec('SHARED · THE DEAL AND THE CODE · kit values (D1, D3)',
      `Admin mode, the deal: the gh#302 roster at the setup cap of 200, every name with its dealt chain word (10 words, 5 per candidate chain; ${pickNote('D1')}). QR mode, the code: ${CODE.length} digits, seed 48215, cut ${WORD_ROUND.keep}, bank revision 1, kind 54 (engine 2b, game 4, Thai), pool food, format 0, Damm check; the src parser reads it back as game 4, Thai, food (checked once, 2026-11-20); the render re-checks the digits on the frame (${pickNote('D3')}).`,
      cands([cand(tag('F', 'THE DEAL', ' admin mode'), dealFrame()), cand(tag('F', 'THE CODE', ' QR mode'), codeFrame())], true)),
    sec('SHARED · THE REVEAL · the chain grows one word per step (2D stills of the 3D intent)',
      `Drawn with this board's defaults (G329-D4 A, G329-D5 A) and the kit's (${pickNote('D1')}). QR mode: the chain after its third word, holders counted under each word. Admin mode: each word lands over a veil, then the cells that hold it turn gold. The result: the drawn chain's holders gold, the rest dimmed and struck through, in words on the legend. Polarity: ADR-0080 decision 1 keeps it random and switchable for every letter and word event round, while the gh#329 body states only that linked words survive; drawn here “ต่อติด รอด”, the other value “ต่อติด ตก”.`,
      cands([cand(tag('F', 'QR MODE · STEP 3', ''), stepFrame()), cand(tag('F', 'ADMIN · THE WORD LANDS', ' step 3'), adWordFrame()), cand(tag('F', 'ADMIN · ITS HOLDERS LIGHT', ' after step 3'), adLitFrame()), cand(tag('F', 'RESULT', ' 3D intent'), resultFrame())], true)),
    sec('SHARED · THE PHONE · engine 2b: one word, the rule tap, every step on its own',
      `QR mode, real pixels at 320px. The reader (${esc(ME)}) holds ${esc(ME_WORD)}, the fourth word of the drawn chain; a holder of the other chain (${esc(HOLD.get(OUT_NAME))}) does not pass under “linked = survive”.`,
      cands([cand(tag('F', 'CODE', ''), phCode()), cand(tag('F', 'HAND', ' one word'), phHand()), cand(tag('F', 'STEP', ' after the tap'), phStep()), cand(tag('F', 'PASSED', ''), phIn()), cand(tag('F', 'DID NOT PASS', ''), phOut())])),
    sec('SHARED · THE MINI-EVENT PAGE · real picks on players\' own phones (gh#311, gh#324)',
      `Players join by QR and pick one word from a pool of 16 (the pick route caps options at 16), changeable until the MC closes picking; at close, whoever has not picked gets a random pick. Rounds repeat until the MC-set number of winners (1-5) remains. <b>Reading drawn, not ruled</b> (the gh#329 body says only "the longest chain wins"): the screen grows the longest chain the picked words allow, and whoever picked a word in it passes. gh#311's automatic redraw (a rule that leaves nobody, everybody or fewer than the winner count) has no plain counterpart for a longest chain, and a tie between two longest chains is unspecified: both are the owner's. Sample picks: 52 players, 13 of the 16 words picked; the longest chain over them is ${MINI_CHAIN.length} words (searched with the chain.ts link rule over the stored cells), and ${MINI_PASS} players picked a word in it.`,
      cands([cand(tag('F', 'PICK', ' the pick timer on the main screen'), mnPick()), cand(tag('F', 'THE LONGEST CHAIN', ' round 1'), mnChain()), cand(tag('F', 'WINNERS', ''), mnWin())], true)
      + cands([cand(tag('F', 'PHONE · PICK', ' changeable until close'), mnPhPick()), cand(tag('F', 'PHONE · RESULT', ''), mnPhResult())])),
    sec('VALUES · kit values, this board\'s, and their sources', 'Every frame value is a literal from tokens.css, a gh#302 / gh#303 pick, or a PROPOSAL named here.', valuesTable([...KIT_VALUES, ...BOARD_VALUES]) + contrastTable([...KIT_PAIRS, ['#9a97c0', '#14142b', 'a word nobody holds (G329-D4 A)'], ['#ffffff', '#14142b', 'the link letter in its well (G329-D5 A)'], ['#14142b', '#ffcc00', 'the link tile (G329-D5 B)']])),
    sec('BEATS · the chain on the main screen (3D intent)', 'Every beat has a reduced-motion form (ADR-0046: reduce, not remove).', beatTable([
      ['the deal (admin mode)', 'held', 'the field of word cells settles onto the stage floor, a short drop per row', 'the field appears in place with one 200ms fade'],
      ['polarity drawn', '1.2s', 'a pill spins to "ต่อติด รอด" or "ต่อติด ตก"; the MC can switch it until the first word lands', 'the pill fades in on its final value'],
      ['a word lands', '1.5s per word', 'the card drops onto the end of the chain and the link letter lights between the two words (G329-D5)', 'the card fades in; the link letter is shown at once'],
      ['its holders light (admin mode)', '600ms per row', 'the cells holding the word turn gold row by row (the gh#303 flip)', 'one 200ms fade'],
      ['a word nobody holds (G329-D4)', 'the same beat', 'A: lands in a dim ring and its line says nobody holds it; B: lands like every word', 'as the beat above'],
      ['result', 'held', 'the linked holders glow and the count rolls to the keep; under "ต่อติด ตก" the linked cells dim instead', 'the count is shown at its final value'],
    ])),
    nameFitRow([
      [`dense field names (kit D1 ${KIT_D1()})`, 'Sarabun 400', `${OPTIONS.D1[KIT_D1()].nameMax}px`, `${OPTIONS.D1[KIT_D1()].floor}px`, 'a dense-field cell less the word column and padding', 'measured by the render (fit report)'],
      ['mini-event winners', 'Mitr 700', '64px', '40px', '1100px card less 80px padding', 'measured by the render'],
      ['phone pool buttons (words, not names)', 'Mitr 600', '20px', '16px', 'half the 288px column less 8px gap and 16px padding', 'measured by the render'],
    ]),
    copyRow(),
    rolesRow([...KIT_ROLES, ...BOARD_ROLES]),
    notesRow([
      '<b>Rests on:</b> gh#329 (body, and the 2026-11-19 comment: the link-letter ruling, and the call on chain words nobody holds), ADR-0080 (decision 1: half-cut, two candidate scripts plus the rule tap; decision 2: the 14-digit code), gh#311 (comments 2026-11-11 and 2026-11-19), chain.ts (engine 2b, gh#323) and the gh#323 evidence (the rates of words nobody holds), the gh#325 kit.',
      '<b>Words</b> are data from the bank at commit 50f74b7 (review pending, gh#321), with the chains and holdings computed once from src with review ignored, as the gh#323 sizing does, and frozen as literals on this board.',
      '<b>Not covered:</b> English rounds (last letter to first letter, same frames); a real projector, room or viewing distance; the 3D motion itself (frames are stills, beats are described); the never-blank 2D frame (the pilot draws it for the same field); the MC\'s own controls; the phone pages at widths other than 320px.',
    ]),
  ];
  const head = [ORDER_LINE,
    'Game 4 of the seven letter and word games (gh#329). Shared kit: docs/verification/evidence/gh325-boards-2026-11-20/kit.mjs (gh#325). Decisions: D1 and D3 are SHARED kit parameters (drawn and picked on Gh326PickRule); G329-D4 to G329-D6 are this game\'s.',
    `Fixture: the gh#302 roster at the setup cap of 200, the three NAME FIT worst cases in it, played as round 1 of 4, a half-cut (200 to 100), Thai, pool food; and the same round at 10 heads for G329-D4. Drawn chain: ${CHAINS[0].map(esc).join(' · ')}.`];
  return boardDoc(NAME, 'gh#329 board (word chain) on the gh#325 kit.', head, BOARD_CSS, rows);
}

// Board-specific must-red plants (the kit's generic plants are added by mustred.mjs).
export const PLANTS = [
  ['chain-word-clip', (s) => s.replace('</style>', '.pj .cl .cw { width: 60px !important; }</style>'), /clipped in A\/unheld/],
  ['chain-count', (s) => s.replace('data-expect="5/4"', 'data-expect="5/5"'), /field count in A\/unheld: holds 5 with 4 passed, says 5\/5/],
  ['link-tile-palette', (s) => s.replace('</style>', '.pj .lb { background-color: #00ff00 !important; }</style>'), /\(role: link tile \(G329-D5 B\)\) renders background-color:#00ff00/],
  ['field-count', (s) => s.replace('data-expect="200/100"', 'data-expect="200/101"'), /field count in F\/result: holds 200 with 100 passed, says 200\/101/],
];

export const BOARD = {
  name: NAME, build, expect: EXPECT, plants: PLANTS, extra: [],
  sel: { clip: '.cw, .cn, .lb, .pp', contain: '.cl, .cw, .lb, .pp' },
  floors: {},
};
