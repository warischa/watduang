// gh#332 board: นับพยางค์ (game 7), on the gh#325 kit. Writes design/Gh332SyllableCount.dc.html through
// make-boards.mjs. Owns three decisions of its own (D4 the face of a held syllable count, D5 how the drawn word's
// count is shown on the projector, D6 the live tally on the mini-event pick screen) and draws the two SHARED kit
// decisions (D1 glyph floor, D3 code grouping) only through KIT_OPT / KIT_VALUE, never their options.
//
// What the game is, read from engine 2a (src/prize-round/round.ts, game 7 held values) and gh#311:
//   event round (half-cut only): each person holds ONE syllable count, and only TWO values are dealt per round (one
//     pair out of 1..4): group 0 holds the first value, group 1 the second. Two candidate words, one per value, are
//     the rule; the MC draws one and a polarity ("match = survive" or "match = out"). The phone rebuilds its own count
//     from the 14-digit code and learns which word was drawn by the rule tap.
//   mini-event: players pick one count, 1 to 4, on their own phone; a word is drawn and its count decides.
// The bank stores a syllable COUNT only (src/prize-words schema); it carries no syllable boundaries. D5 option B shows
// a split the bank cannot back today, and its tag says so.
// "Numbers dealt like the cards on #300" names the composed deal, not the look: the phase-1 cards are rank-and-suit
// playing cards, which this board must not resemble, and no face here carries pips (dice) either.
import {
  th, nm, esc, resetCopy, contrastTable, valuesTable, beatTable, nameFitRow, notesRow,
  OPTIONS, KIT_OPT, KIT_VALUE, pickNote, WORD_ROUND, ME, CAP_NAME, WIDE_AM, wordCode, boardDoc, ORDER_LINE, decisionsRow, rolesRow, copyRow,
  sec, cand, cands, tag, stage, phone, topBar, hud, lowBand, count, floorLayer, denseField, codeCard, codeField,
  phoneHead, tiles, ruleTap, goButton, verdict, timer, winners, wordCol,
  KIT_ROLES, KIT_VALUES, KIT_PAIRS, kitPlants,
} from './kit.mjs';

const NAME = 'Gh332SyllableCount';
const GAME = 'นับพยางค์';
const SRC_GAME = 'gh#311 comment 2026-11-11 · owner wording, verbatim (the game name)';
const SRC_HELD = 'src/prize-round/conditions.ts heldWording (a syllable count), PROVISIONAL (gh#322; final wording is this canvas) · verbatim';

// ---- the deal. Food pool (kind = game 7, Thai, syllables; pool digit 2). One pair out of 1..4 per event round; this
// board draws the pair (3, 4). Both candidates are bank words (src/prize-words at commit 50f74b7, review pending,
// gh#321), frozen as literals here; the 4-syllable one is the longest eligible food word (17 codepoints). The parts are
// annotation for D5 B only: the bank holds the count, never the parts, and assertSplit holds them to it.
const CAND = [
  { text: 'สับปะรด', n: 3, parts: ['สับ', 'ปะ', 'รด'] },
  { text: 'ข้าวเหนียวหมูปิ้ง', n: 4, parts: ['ข้าว', 'เหนียว', 'หมู', 'ปิ้ง'] },
];
const VALUES = [3, 4];
const DRAWN = 1; // the rule the MC drew: the 4-syllable word
const POLARITY = 'out'; // match = out: holders of 4 are out, holders of 3 stay in (group 0, painted gold by the kit)
const KIND = 20; // KINDS index of game 7 / th / syllables (executed against src, not counted)
export function assertSplit(c) {
  const bad = (m) => { throw new Error(`syllable split: ${m}`); };
  if (c.parts.length !== c.n) bad(`${c.text} is split into ${c.parts.length}, its bank count is ${c.n}`);
  if (c.parts.join('') !== c.text) bad(`the parts of ${c.text} do not spell it`);
}
export function assertDeal(f) {
  const bad = (m) => { throw new Error(`syllable deal: ${m}`); };
  const [v0, v1] = f.values;
  if (v0 === v1 || ![v0, v1].every((v) => Number.isInteger(v) && v >= 1 && v <= 4)) bad(`the pair ${v0},${v1} is not two different counts from 1 to 4`);
  f.cands.forEach((c, i) => { if (c.n !== f.values[i]) bad(`candidate ${i} has ${c.n} syllables, its value is ${f.values[i]}`); assertSplit(c); });
  const matched = f.values.map((v) => v === f.cands[f.drawn].n);
  const stays = matched.map((m) => m === (f.polarity === 'survive'));
  const n = stays.filter(Boolean).length;
  if (n !== 1) bad(`${n} of 2 groups stay in under the drawn word and polarity, exactly 1 must (a half-cut)`);
  if (!stays[0]) bad('group 0 must stay in: the judged frames paint group 0 gold');
}
export const DEAL_FIXTURE = { values: VALUES, cands: CAND, drawn: DRAWN, polarity: POLARITY };
assertDeal(DEAL_FIXTURE);

const GROUP_VALUE = (n) => VALUES[WORD_ROUND.group.get(n)];
const ME_HOLD = VALUES[0]; // the reader sits in group 0 (the kit seats ME there)
const OUT_NAME = WORD_ROUND.names.find((n) => WORD_ROUND.group.get(n) === 1);
const OUT_HOLD = GROUP_VALUE(OUT_NAME);
const CODE = wordCode(1, { seed: '60417', cut: WORD_ROUND.keep, revision: 1, kind: KIND, pool: 'food' });

const KIT_D1 = () => KIT_OPT('D1');
const KIT_D3 = () => KIT_VALUE('D3').groups;
const D4_DEFAULT = 'A'; // the shared frames draw D4 A until the owner picks
const POL = () => [th('ตรงกติกา รอด', 'polarity: match = survive'), th('ตรงกติกา ตก', 'polarity: match = out')];
const heldCount = (n, role) => th(`${n} พยางค์`, role, SRC_HELD);
const gameName = () => th(GAME, 'game name', SRC_GAME);

// ---- the dense field: the held count beside every name. A digit needs a narrow column, not the widest bank word's
// (D1's word column), so the names get the room; the digit is still held to the D1 glyph floor (data-min).
const numCol = (floor) => Math.ceil(floor * 1.6);
const cells = (state) => WORD_ROUND.names.map((n, i) => [n, String(GROUP_VALUE(n)), state(n, i)]);
const judged = (n) => (WORD_ROUND.group.get(n) === 0 ? 'in' : 'out');
function numField(state) {
  const o = OPTIONS.D1[KIT_D1()];
  const html = denseField(cells(state), KIT_D1());
  const swapped = html.replaceAll(`width: ${wordCol(o.floor)}px;`, `width: ${numCol(o.floor)}px;`);
  if (swapped === html) throw new Error('the dense field carries no word column to narrow');
  return swapped;
}

// ---- pieces of this board
const beats = (n) => `<div class="nb">${'<i></i>'.repeat(n)}</div>`;
const stageCount = (n, face, st = '', tally = null) => `<div class="nt${st ? ' ' + st : ''}"><span class="nn">${n}</span>${face === 'B' ? beats(n) : ''}<span class="nu">${th('พยางค์', 'unit: syllables')}</span>${tally == null ? '' : `<span class="ntc">${tally} ${th('คน', 'unit: people', 'g302')}</span>`}</div>`;
const numTiles = (face, stateOf, tallies, expect = '') => `<div class="nums"${expect ? ` data-expect="${expect}"` : ''}>${[1, 2, 3, 4].map((n, i) => stageCount(n, face, stateOf(n), tallies ? tallies[i] : null)).join('')}</div>`;
const pickButtons = (face, on) => `<div class="nks">${[1, 2, 3, 4].map((n) => `<div class="nk tap${n === on ? ' on' : ''}"><span class="nn">${n}</span>${face === 'B' ? beats(n) : ''}</div>`).join('')}</div>`;
const ruleCardS = (heading, body, countLine, polarity) => `<div class="veil"></div><div class="rc"><div class="rh">${heading}</div>${body}<div class="rn">${countLine}</div><div class="rp"><span class="pol">${polarity}</span></div></div>`;
const splitCells = (c) => `<div class="rs">${c.parts.map((p, i) => `<div class="sy"><span class="si">${i + 1}</span><span class="st">${esc(p)}</span></div>`).join('')}</div>`;

// ---- D4: the face of a held syllable count (phone hold, phone pick, projector tiles)
const holdFrame = (opt) => phone('ph-hold', opt, `${phoneHead(th('พยางค์ของคุณ', 'phone: hold heading'), th('รอพิธีกรจับคำ แล้วนับพยางค์ของคำนั้น', 'phone: hold, waiting for the word'))}${tiles([String(ME_HOLD)])}${opt === 'B' ? beats(ME_HOLD) : ''}`);
const MINI_EV = () => gameName();
const PICKED = 3;
const pickFrame = (opt) => phone('ph-pick', opt, `${phoneHead(th('เลือกจำนวนพยางค์', 'mini-event phone: pick heading'), th('เปลี่ยนได้จนกว่าพิธีกรจะปิดรับ', 'mini-event: picks change until close'), MINI_EV())}<div class="ptime"><span class="msg">${th('เหลือเวลา', 'mini-event phone: time left')}</span><span class="pt-n">0:24</span></div>${pickButtons(opt, PICKED)}`);
const MINI_WORD = { text: 'มะละกอ', n: 3 }; // the mini-event word: a food word, 3 syllables in the bank (มะ-ละ-กอ)
const MINI_TALLY = [11, 19, 13, 9]; // 52 players by the count each ended up on (picks plus random fills)
const MINI_STAYS = MINI_TALLY[MINI_WORD.n - 1];
const miniTop = (round) => `<div class="top"><span class="ev">${gameName()}</span><span class="lk">${th(`รอบที่ ${round}`, 'mini-event: round label')}</span></div>`;
const miniResult = (face) => stage('mn-result', face, `${miniTop(1)}${hud(esc(MINI_WORD.text), `${heldCount(MINI_WORD.n, 'mini-event: the drawn word count')} · ${POL()[0]}`)}${numTiles(face, (n) => (n === MINI_WORD.n ? 'in' : 'out'), MINI_TALLY, '4/1')}${lowBand(`<div class="lk">${th('เหลือ', 'mini-event: still in')}</div>${count(MINI_STAYS, th('คน', 'unit: people', 'g302'), 'sm')}`, '', `<div class="lk">${th('เล่นต่อจนเหลือผู้ชนะ 3 คน', 'mini-event: rounds repeat to the winner count')}</div>`)}`);

// ---- D5: the drawn word and its count on the rule card
const ruleFrame = (opt) => {
  const c = CAND[DRAWN];
  const body = opt === 'A' ? `<div class="rv">${esc(c.text)}</div>` : splitCells(c);
  return stage('rule', opt, `${topBar(1)}${numField(() => '')}${ruleCardS(th('คำของรอบนี้', 'rule card: heading'), body, heldCount(c.n, 'rule card: the drawn word count'), POL()[1])}`);
};

// ---- D6: the pick screen on the projector, with and without a live tally per count
const PICK_TALLY = [8, 13, 9, 7]; // 37 picked so far
const mnPick = (opt) => stage('mn-pick', opt, `${miniTop(1)}${hud(th('เลือกจำนวนพยางค์ในมือถือของคุณ', 'mini-event: pick instruction'), th('เปลี่ยนได้จนกว่าพิธีกรจะปิดรับ', 'mini-event: picks change until close'))}${numTiles(D4_DEFAULT, () => '', opt === 'B' ? PICK_TALLY : null)}${lowBand(`<div class="lk">${th('เลือกแล้ว', 'mini-event: picked so far')}</div>${count(37, th('จาก 52 คน', 'mini-event: of N people'), 'sm')}`, timer('0:24'), `<div class="lk">${th('ใครไม่เลือก ระบบสุ่มให้', 'mini-event: random fill')}</div>`)}`);

// ---- shared: the event round on the projector
const dealFrame = () => stage('deal', 'F', `${topBar(1)}${numField(() => '')}${lowBand(`<div class="gname">${gameName()}</div>`, `<div class="lk">${th('ดูพยางค์ข้างชื่อของคุณ', 'deal: instruction (admin mode)')}</div>`, count(WORD_ROUND.live, th('คน', 'unit: people', 'g302')), 'slim')}`);
const codeFrame = () => stage('code', 'F', `${topBar(1)}${hud(gameName())}${codeCard(CODE, 1, KIT_D3(), th('รหัสรอบที่ 1', 'round code: label (round 1)'), th('ใส่รหัสนี้ในมือถือ เพื่อดูพยางค์ของคุณ', 'round code: instruction'))}`);
function resultFrame(id, withFloor) {
  const legend = `<div class="legend"><div class="wc in"><span class="lg">${th('ผ่าน', 'legend: passed', 'g302')}</span></div><div class="wc out"><span class="lg">${th('ไม่ผ่าน', 'legend: did not pass', 'g302')}</span></div></div>`;
  const band = lowBand(`<div class="gname">${gameName()}</div>`, legend, `<div class="lk">${th('ผ่านรอบที่ 1', 'reveal: passed heading', 'g302')}</div>${count(WORD_ROUND.keep, th('คน', 'unit: people', 'g302'))}`, 'slim');
  return stage(id, 'F', `${withFloor ? floorLayer() : ''}${topBar(1)}${numField(judged)}${band}`);
}

// ---- shared: the phone, event round
const phCode = () => phone('ph-code', 'F', `${phoneHead(th('ใส่รหัสรอบ', 'phone: code entry heading'), th('รหัส 14 หลักที่ขึ้นบนจอใหญ่', 'phone: code entry hint'))}${codeField(CODE, 1, KIT_D3())}${goButton(th('ดูพยางค์ของฉัน', 'phone: see my syllables'))}`);
const phTap = () => phone('ph-tap', 'F', `${phoneHead(th('แตะคำที่ขึ้นบนจอ', 'phone: word tap heading'))}${ruleTap(th('คำบนจอ', 'phone: word tap, which word'), CAND.map((c) => esc(c.text)), DRAWN, th('บนจอขึ้นว่า', 'phone: rule tap, which polarity'), POL(), 1)}${goButton(th('ดูผล', 'phone: see the result'))}`);
const tapped = () => `${th('กติกาที่คุณแตะ:', 'phone: the rule tapped', 'join')} ${esc(CAND[DRAWN].text)} · ${POL()[1]}`;
const held = () => `<p class="msg">${th('พยางค์ที่คุณถือ', 'phone: result, what you held')}</p>`;
const phIn = () => phone('ph-in', 'F', `${phoneHead(th('ผลรอบที่ 1', 'phone: result heading'))}${verdict(th('ผ่าน', 'legend: passed', 'g302'), '', tapped())}${tiles([String(ME_HOLD)])}${held()}`);
const phOut = () => phone('ph-out', 'F', `${phoneHead(th('ผลรอบที่ 1', 'phone: result heading'))}${verdict(th('ไม่ผ่าน', 'legend: did not pass', 'g302'), 'out', tapped())}${tiles([String(OUT_HOLD)])}${held()}`);

// ---- shared: the mini-event page, the rest
const mnWin = () => stage('mn-win', 'F', `${miniTop(3)}${hud(th('ผู้ชนะ', 'mini-event: winners heading'), th('3 คน', 'mini-event: winner count'))}${winners([ME, CAP_NAME, WIDE_AM])}`);
const mnPhClosed = () => phone('mn-ph-closed', 'F', `${phoneHead(th('ปิดรับแล้ว', 'mini-event phone: picking closed'), th('พยางค์ที่คุณเลือกในรอบนี้', 'mini-event phone: your count this round'), MINI_EV())}${tiles([String(PICKED)])}<p class="msg">${th('รอพิธีกรจับคำ', 'mini-event phone: waiting for the word')}</p>`);
const mnPhFill = () => phone('mn-ph-fill', 'F', `${phoneHead(th('ปิดรับแล้ว', 'mini-event phone: picking closed'), th('คุณไม่ได้เลือกทันเวลา ระบบสุ่มให้', 'mini-event phone: random fill'), MINI_EV())}${tiles(['2'])}<p class="msg">${th('รอพิธีกรจับคำ', 'mini-event phone: waiting for the word')}</p>`);
const mnPhResult = () => phone('mn-ph-result', 'F', `${phoneHead(th('ผลรอบที่ 1', 'phone: result heading'), '', MINI_EV())}${verdict(th('ผ่าน', 'legend: passed', 'g302'), '', `${esc(MINI_WORD.text)} · ${heldCount(MINI_WORD.n, 'mini-event: the drawn word count')} · ${POL()[0]}`)}${tiles([String(PICKED)])}<p class="msg">${th('รอรอบที่ 2', 'mini-event phone: waiting for round 2')}</p>`);

// ---- board-only CSS and roles
const GLOW = (px) => `rgba(255,204,0,0.45) 0px 0px ${px}px 0px`;
const BOARD_CSS = `
    /* ---- Gh332SyllableCount: the held count as a tile (projector), as a phone button, and the syllable cells on the rule card ---- */
    .pj .nums { position: absolute; left: 160px; right: 160px; top: 250px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 28px; z-index: 1; }
    .pj .nt { box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px 16px; border-radius: 24px; background: #23214d; box-shadow: inset 0 0 0 3px #ffcc00; }
    .pj .nt .nn { font: 700 200px/1.1 'Mitr', sans-serif; color: #ffcc00; white-space: nowrap; overflow-x: clip; overflow-y: visible; }
    .pj .nt .nu { font: 600 44px/1.3 'Mitr', sans-serif; color: #d9d6f0; }
    .pj .nt .ntc { margin-top: 8px; font: 700 48px/1.3 'Mitr', sans-serif; color: #ffffff; }
    .pj .nt.in { background: #ffcc00; box-shadow: 0 0 16px rgba(255,204,0,0.45); }
    .pj .nt.in .nn, .pj .nt.in .nu, .pj .nt.in .ntc { color: #14142b; }
    .pj .nt.out { background: transparent; box-shadow: inset 0 0 0 2px #23214d; }
    .pj .nt.out .nn, .pj .nt.out .nu, .pj .nt.out .ntc { color: #9a97c0; text-decoration: line-through; }
    .pj .nb { display: flex; justify-content: center; gap: 14px; margin-top: 12px; }
    .pj .nb i { display: block; width: 60px; height: 16px; border-radius: 999px; background: #ffcc00; }
    .pj .nt.in .nb i { background: #14142b; }
    .pj .nt.out .nb i { background: #9a97c0; }
    .pj .rc .rs { display: flex; justify-content: center; align-items: flex-end; gap: 20px; margin-top: 18px; }
    .pj .rc .sy { box-sizing: border-box; display: flex; flex-direction: column; align-items: center; padding: 6px 28px 2px; border-radius: 24px; background: #14142b; }
    .pj .rc .sy .si { font: 600 40px/1.2 'Mitr', sans-serif; color: #d9d6f0; }
    .pj .rc .sy .st { font: 700 84px/1.35 'Mitr', sans-serif; color: #ffcc00; white-space: nowrap; overflow-x: clip; overflow-y: visible; }
    .pj .rc .rn { margin-top: 10px; font: 700 64px/1.3 'Mitr', sans-serif; color: #14142b; }
    .pr .nb { display: flex; justify-content: center; gap: 6px; margin-top: 12px; }
    .pr .nb i { display: block; width: 22px; height: 8px; border-radius: 999px; background: #ffcc00; }
    .pr .nks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 14px; }
    .pr .nk { box-sizing: border-box; min-block-size: 96px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 8px; border-radius: 16px; box-shadow: inset 0 0 0 2px #d9d6f0; }
    .pr .nk .nn { font: 700 48px/1.2 'Mitr', sans-serif; color: #ffffff; }
    .pr .nk .nb { margin-top: 4px; }
    .pr .nk.on { background: #ffcc00; box-shadow: none; }
    .pr .nk.on .nn { color: #14142b; }
    .pr .nk.on .nb i { background: #14142b; }
    /* ---- annotation only: the D5 forms table ---- */
    .tbl td.thbig { font-family: 'Mitr', sans-serif; font-weight: 600; font-size: 28px; line-height: 1.4; }`;
const T = 'tokens.css';
const PK = 'gh#302 B PICKED 2026-11-11';
const BOARD_ROLES = [
  ['number tile shape', '.pj .nt', ['radius:24px'], `${PK} winner-card radius`],
  ['number tile surface', '.pj .nt:not(.in):not(.out)', ['background-color:#23214d', 'box-shadow:#ffcc00 0px 0px 0px 3px inset'], `PROPOSAL; #23214d (${PK}), ${T} --accent-gold edge (the winner card)`],
  ['number tile that stays in', '.pj .nt.in', ['background-color:#ffcc00', `box-shadow:${GLOW(16)}`], `${T} --accent-gold; glow (the passed cell)`],
  ['number tile that is out', '.pj .nt.out', ['box-shadow:#23214d 0px 0px 0px 2px inset'], `${PK} (the cell that did not pass)`],
  ['number tile numeral', '.pj .nt:not(.in):not(.out) .nn', ['color:#ffcc00'], `${T} --accent-gold`],
  ['number tile unit', '.pj .nt:not(.in):not(.out) .nu', ['color:#d9d6f0'], `${T} --ink-on-band-soft`],
  ['number tile people count', '.pj .nt:not(.in):not(.out) .ntc', ['color:#ffffff'], `${T} --ink-light`],
  ['number tile type, stays in', '.pj .nt.in :is(.nn, .nu, .ntc)', ['color:#14142b'], 'ink on gold'],
  ['number tile type, out', '.pj .nt.out :is(.nn, .nu, .ntc)', ['color:#9a97c0'], `#9a97c0 (${PK})`],
  ['beat bar shape', '.pj .nb i, .pr .nb i', ['radius:999px'], 'pill (PROPOSAL; the same pill as the round dot)'],
  ['beat bar on night (projector)', '.pj .nt:not(.in):not(.out) .nb i', ['background-color:#ffcc00'], `${T} --accent-gold`],
  ['beat bar on gold (projector)', '.pj .nt.in .nb i', ['background-color:#14142b'], 'ink on gold'],
  ['beat bar, out (projector)', '.pj .nt.out .nb i', ['background-color:#9a97c0'], `#9a97c0 (${PK})`],
  ['syllable cell', '.pj .rc .sy', ['background-color:#14142b', 'radius:24px'], `PROPOSAL; ${T} --color-line-strong (the polarity pill ground), the winner-card radius`],
  ['syllable index', '.pj .rc .sy .si', ['color:#d9d6f0'], `${T} --ink-on-band-soft`],
  ['syllable text', '.pj .rc .sy .st', ['color:#ffcc00'], `${T} --accent-gold`],
  ['rule card count line', '.pj .rc .rn', ['color:#14142b'], `${T} --color-line-strong (the rule card condition ink)`],
  ['phone number button', '.pr .nk', ['radius:16px'], 'PROPOSAL (the phone choice shape)'],
  ['phone number button ring', '.pr .nk:not(.on)', ['box-shadow:#d9d6f0 0px 0px 0px 2px inset'], `${T} --ink-on-band-soft ring`],
  ['phone number button numeral', '.pr .nk:not(.on) .nn', ['color:#ffffff'], `${T} --ink-light`],
  ['phone number button picked', '.pr .nk.on', ['background-color:#ffcc00'], `${T} --accent-gold`],
  ['phone number button picked numeral', '.pr .nk.on .nn', ['color:#14142b'], `${T} --color-line-strong`],
  ['beat bar on night (phone)', '.pr :is(.tiles + .nb, .nk:not(.on) .nb) i', ['background-color:#ffcc00'], `${T} --accent-gold`],
  ['beat bar on gold (phone)', '.pr .nk.on .nb i', ['background-color:#14142b'], `${T} --color-line-strong`],
];
const BOARD_VALUES = [
  ['200px Mitr 700, 44px unit', 'the held count on a mini-event tile (projector)', 'PROPOSAL; sizes only, paint from the kit'],
  ['4 tiles, 28px gap, 160px side margins', 'the mini-event count tiles', 'PROPOSAL (the pool grid margins, four columns)'],
  ['60 x 16px pill bars, one per syllable', 'D4 option B beats under a count (projector)', 'PROPOSAL'],
  ['22 x 8px pill bars, one per syllable', 'D4 option B beats under a count (phone)', 'PROPOSAL'],
  ['48px Mitr 700 on a 96px-high button, 2 columns', 'the phone count buttons (taps held to 44px)', 'PROPOSAL'],
  ['84px Mitr 700 gold on #14142b, 40px index', 'D5 option B syllable cells on the rule card', 'PROPOSAL; the polarity pill ground and ink'],
  ['64px Mitr 700 on #ffffff', 'the rule card count line', 'PROPOSAL; the rule card condition ink'],
];
const BOARD_PAIRS = [['#d9d6f0', '#14142b', 'syllable index on its cell'], ['#ffcc00', '#23214d', 'the held count on a night tile'], ['#14142b', '#ffcc00', 'a tile that stays in']];

export const EXPECT = {
  A: ['ph-hold', 'ph-pick', 'mn-result', 'rule', 'mn-pick'],
  B: ['ph-hold', 'ph-pick', 'mn-result', 'rule', 'mn-pick'],
  F: ['deal', 'code', 'result', 'fallback', 'ph-code', 'ph-tap', 'ph-in', 'ph-out', 'mn-win', 'mn-ph-closed', 'mn-ph-fill', 'mn-ph-result'],
};

const D4 = { A: 'G332-NUMERAL ALONE', B: 'G332-NUMERAL + BEATS' };
const D5 = { A: 'G332-WORD, THEN ITS COUNT', B: 'G332-WORD SPLIT INTO SYLLABLES' };
const D6 = { A: 'G332-TALLY HIDDEN', B: 'G332-TALLY LIVE' };
const FORMS = [{ text: 'น้ำ', n: 1, parts: ['น้ำ'] }, { text: 'ทุเรียน', n: 2, parts: ['ทุ', 'เรียน'] }, CAND[0], CAND[1]];
FORMS.forEach(assertSplit);

export function build() {
  resetCopy();
  th('คน', 'unit: people', 'g302'); th('ผ่าน', 'legend: passed', 'g302'); th('ไม่ผ่าน', 'legend: did not pass', 'g302'); th('ผ่านรอบที่ 1', 'reveal: passed heading', 'g302');
  const d1 = OPTIONS.D1, d3 = OPTIONS.D3;
  const D5COST = 'needs a NEW judged attribute: syllable boundaries per word. The bank (src/prize-words schema) stores the count only; the parts shown here are annotation, not data. It would reopen gh#320 (the attribute spec) and gh#321 (review: the model panel and the owner sample would judge every boundary), and a wrong boundary is a wrong word on the room\'s screen. A cheaper form of the same idea is already in D4 B: beats, no boundaries.';
  const rows = [
    decisionsRow([
      ['<b>D1</b> glyph floor on the densest projector screen (admin mode, 200 heads, a value beside every name)', 'SHARED (kit) · drawn on Gh326PickRule, here only used', `<b>A ${d1.A.label}</b>: ${d1.A.floor}px, one screen of 200 (${d1.A.cols} columns)`, `<b>B ${d1.B.label}</b>: ${d1.B.floor}px, two screens of 100 (${d1.B.cols} columns)`, pickNote('D1')],
      ['<b>D3</b> grouping of the 14-digit round code', 'SHARED (kit) · drawn on Gh326PickRule, here only used', `<b>A ${OPTIONS.D3.A.label}</b>`, `<b>B ${OPTIONS.D3.B.label}</b>`, pickNote('D3')],
      ['<b>D4</b> G332-NUMBER FACE: how a held syllable count looks (phone hold, phone pick buttons, projector tiles)', 'THIS GAME · gh#332', `<b>A ${D4.A}</b>: the numeral on its tile, nothing else (default)`, `<b>B ${D4.B}</b>: the numeral with one short bar per syllable under it; bars sit in a row, never as pips`, 'awaiting the owner'],
      ['<b>D5</b> G332-COUNT REVEAL: how the drawn word and its count show on the rule card', 'THIS GAME · gh#332', `<b>A ${D5.A}</b>: the word whole, then “4 พยางค์” under it (the count is a stored number; default)`, `<b>B ${D5.B}</b>: each syllable in its own numbered cell, then the count. COST: ${D5COST}`, 'awaiting the owner'],
      ['<b>D6</b> G332-TALLY: what the projector shows WHILE players pick a count (mini-event)', 'THIS GAME · gh#332', `<b>A ${D6.A}</b>: the four counts, the total picked so far, the timer (default)`, `<b>B ${D6.B}</b>: the same, with how many have picked each count under each tile`, 'awaiting the owner'],
    ]),
    sec('D4 · G332-NUMBER FACE · the held count on a phone (hold and pick) and on the projector (round result)', `Engine 2a deals ONE value per person from a pair of counts (the pair is drawn per round; this board draws 3 and 4), shown as a numeral. A is the kit letter tile with a numeral. B adds one short bar per syllable under it: it says "this many beats" without asking the reader to know what the numeral counts. Bars sit in one row, never as dots in a grid, and the face has no suit or rank: it must not read as a playing card or a die (CONTEXT.md company-party _Avoid_). Phone frames are real pixels at 320px; the projector result is 1920x1080 at scale 1 (here the mini-event, so all four counts 1 to 4 appear). The shared frames below draw A until D4 is picked.`,
      cands([cand(tag('A', D4.A, ' phone hold'), holdFrame('A')), cand(tag('B', D4.B, ' phone hold'), holdFrame('B')), cand(tag('A', D4.A, ' mini-event pick'), pickFrame('A')), cand(tag('B', D4.B, ' mini-event pick'), pickFrame('B'))])
      + cands([cand(tag('A', D4.A, ' mini-event round result: the word มะละกอ has 3 syllables, so 3 stays in'), miniResult('A')), cand(tag('B', D4.B, ' same frame'), miniResult('B'))], true)),
    sec('D5 · G332-COUNT REVEAL · the rule card, event round (the drawn word is the LONGEST eligible food word)', `The rule the MC draws is a word, not a condition: the room counts its syllables and the count decides who stays in (match = ${POLARITY === 'out' ? 'out' : 'survive'} here, so holders of ${CAND[DRAWN].n} are out and holders of ${VALUES[0]} stay in). Drawn at the worst case: ${esc(CAND[DRAWN].text)} is the longest eligible food word (17 codepoints, ${CAND[DRAWN].n} syllables) and the field under the veil shows both held counts, ${VALUES[0]} and ${VALUES[1]}, split 100 / 100. B ${D5COST} Both end on the same count line. The word is a bank sample (review pending, gh#321); the two phone frames of this round (the word tap) are in the shared rows.`,
      cands([cand(tag('A', D5.A, ' the drawn word whole (default)'), ruleFrame('A')), cand(tag('B', D5.B, ' syllable boundaries: not in the bank today'), ruleFrame('B'))], true)
      + `<table class="tbl"><tr><th>bank word</th>${FORMS.map((f) => `<td class="thbig">${esc(f.text)}</td>`).join('')}</tr><tr><th>A count line</th>${FORMS.map((f) => `<td class="thbig">${f.n} พยางค์</td>`).join('')}</tr><tr><th>B split (annotation, needs new data)</th>${FORMS.map((f) => `<td class="thbig">${f.parts.map(esc).join(' · ')}</td>`).join('')}</tr></table>`),
    sec('D6 · G332-TALLY · the projector while players pick (mini-event)', 'The pick is real: the picks are stored before the word is drawn, and a pick can change until the MC closes picking (gh#311 owner ruling 2026-11-19). A shows only the total picked so far. B shows how many have picked each count. The cost of B is strategic, not visual: a live tally lets a player move toward or away from the crowd, and with the polarity drawn at random a crowd can be either the safe side or the out side; A keeps every pick blind. This is the owner\'s call, drawn both ways. The four tiles use D4 A.',
      cands([cand(tag('A', D6.A, ' 37 of 52 picked (default)'), mnPick('A')), cand(tag('B', D6.B, ' counts per tile: 8 + 13 + 9 + 7 = 37'), mnPick('B'))], true)),
    sec('SHARED · THE EVENT ROUND ON THE PROJECTOR · deal, code, result, never-blank', `Drawn with the kit defaults (${pickNote('D1')}; ${pickNote('D3')}; D4 A). The deal: every name carries the count it holds, as a numeral at the D1 floor in a narrow column (a digit does not need the widest bank word's column, so the names get the room); the room can read both held counts, ${VALUES[0]} and ${VALUES[1]}, but not who stays in. The code: 14 real digits, game 7, Thai, syllables, pool food (kind ${KIND}). The result: gold for the holders of ${VALUES[0]} (the drawn word has ${CAND[DRAWN].n} syllables, match = out), dimmed and struck for the rest, with the legend in words. The never-blank 2D frame (ADR-0051) is the same judged field flat on the night ground; reduced motion reaches it by 200ms fades.`,
      cands([cand(tag('F', 'DEAL', ' admin mode, rule not drawn'), dealFrame()), cand(tag('F', 'ROUND CODE', ` QR mode; ${pickNote('D3')}`), codeFrame()), cand(tag('F', 'RESULT', ' 3D intent'), resultFrame('result', true)), cand(tag('F', 'NEVER-BLANK 2D', ' ADR-0051; also the reduced-motion end state'), resultFrame('fallback', false))], true)),
    sec('SHARED · THE PHONE · event round (engine 2a)', 'QR mode. The phone rebuilds its own count from the 14-digit code (no server call at reveal, gh#299 decision 5). Which word was drawn, and the polarity, reach it only by the rule tap: both candidate words are on the phone, the player taps the one on the main screen. The phone never shows either word\'s count: counting is the game. Real pixels at 320px. The held-count face is the one D4 picks (A drawn); frames show the reader in group 0 (holds 3, stays in) and one person from group 1 (holds 4, out).',
      cands([cand(tag('F', 'CODE', ''), phCode()), cand(tag('F', 'WORD TAP', ' the two candidate words, then the polarity'), phTap()), cand(tag('F', 'PASSED', ''), phIn()), cand(tag('F', 'DID NOT PASS', ''), phOut())])),
    sec('SHARED · THE MINI-EVENT PAGE · winners and the phone after picking (gh#311, gh#324)', 'Players join by QR and pick one count, 1 to 4. At close, whoever has not picked gets a random count. The word is drawn after the picks are stored; a word that would leave nobody, everybody or fewer than the winner count is redrawn automatically. Rounds repeat until the MC-set number of winners (1-5) remains; drawn here with 3. The pick frames are D4 and D6 above; the round result is D4.',
      cands([cand(tag('F', 'WINNERS', ''), mnWin())], true)
      + cands([cand(tag('F', 'PHONE · CLOSED', ''), mnPhClosed()), cand(tag('F', 'PHONE · RANDOM FILL', ''), mnPhFill()), cand(tag('F', 'PHONE · RESULT', ''), mnPhResult())])),
    sec('VALUES · kit values and their sources', 'Every frame value is a literal from tokens.css, a gh#302 / gh#303 pick, or a PROPOSAL named here.', valuesTable([...KIT_VALUES, ...BOARD_VALUES]) + contrastTable([...KIT_PAIRS, ...BOARD_PAIRS])),
    sec('BEATS · the round on the main screen (3D intent)', 'Beat timing follows the gh#303 picked flip (600ms per turn); every beat has a reduced-motion form (ADR-0046: reduce, not remove).', beatTable([
      ['the deal (admin mode)', 'held', 'the field of count cells settles onto the stage floor, a short drop per row', 'the field appears in place with one 200ms fade'],
      ['polarity drawn', '1.2s', 'a pill spins to "ตรงกติกา รอด" or "ตรงกติกา ตก"; the MC can switch it before the word draw', 'the pill fades in on its final value'],
      ['word drawn', '1.5s', 'the white card turns in over the veil and settles centre stage with the word (D5 A) or its syllable cells (D5 B)', 'the card fades in'],
      ['count', 'A 1s; B 600ms per syllable', 'A: the count line rolls to its value. B: each syllable cell lights in turn, then the count line', 'the count line is shown at its final value'],
      ['judge', '600ms per row, rows overlap', 'cells turn row by row from the top; each row is judged as it lands', 'all cells change in place with one 200ms fade'],
      ['result', 'held', 'passed cells glow; the count rolls to the keep', 'the count is shown at its final value'],
    ])),
    nameFitRow([
      ['dense field names (D1 A)', 'Sarabun 400', `${d1.A.nameMax}px`, `${d1.A.floor}px`, `a ${d1.A.cols}-column cell less the ${numCol(d1.A.floor)}px count column and padding`, 'measured by the render (fit report)'],
      ['dense field names (D1 B)', 'Sarabun 400', `${d1.B.nameMax}px`, `${d1.B.floor}px`, `a ${d1.B.cols}-column cell less the ${numCol(d1.B.floor)}px count column and padding`, 'measured by the render (fit report)'],
      ['mini-event winners', 'Mitr 700', '64px', '40px', '1100px card less 80px padding', 'measured by the render'],
    ]),
    copyRow(),
    rolesRow([...KIT_ROLES, ...BOARD_ROLES]),
    notesRow([
      '<b>Rests on:</b> gh#311 (the plan; comment 2026-11-11 defines this game, comments 2026-11-19 the half-cut ruling and changeable picks), gh#332 (game 7), ADR-0080 (half-cut, the 14-digit code), ADR-0076 and the picks design doc (the pick routes), ADR-0051 (never-blank), gh#299 decision 11 (3D main screen) and its wording constraint, CONTEXT.md (company-party category).',
      '<b>What the board corrects in the ticket\'s one-liner:</b> "each person holds a number from 1 to 4" is the mini-event. An event round deals only TWO of the four counts, one per candidate word (round.ts analyseHeld: six feasible pairs of 1..4, each value needing a playable eligible word). The phase-1 "cards" the ticket compares itself to are rank-and-suit playing cards; the likeness is the composed deal, not the look, and nothing here resembles a card or a die.',
      '<b>Copy:</b> the word for the held value is พยางค์ ("syllables"), never เลข: a bare เลข leans toward the prize-number reading in Thai, which the company-party category keeps clear of (the round code entry in CONTEXT.md already bars two prize-number words). The Thai scan bars nothing here; this is a wording choice for the owner to confirm. The game name is the owner\'s (gh#311).',
      '<b>Words</b> are data from the bank at commit 50f74b7 (review pending, gh#321), frozen as literals; the 3 / 4 syllable counts are the bank\'s stored values, and the generator refuses a deal whose candidate counts, parts or polarity break the half-cut.',
      '<b>Not covered:</b> a real projector, room or viewing distance; the 3D motion itself (frames are stills, beats are described; no new three.js still: the kit pilot proved Thai word textures); English rounds (syllables exist in English; the language is the MC\'s per round); the MC\'s own controls (pair, polarity switch, pool) on the setup device; phone widths other than 320px; the other five pairs of counts; a 1-syllable or 2-syllable drawn word.',
    ]),
  ];
  const head = [ORDER_LINE,
    'Game 7 of the seven letter and word games (gh#332). Shared kit: docs/verification/evidence/gh325-boards-2026-11-20/kit.mjs (gh#325). Decisions: D1 and D3 are SHARED kit parameters (decided on Gh326PickRule, only used here); D4, D5 and D6 are this game\'s.',
    `Fixture: the gh#302 roster at the setup cap of 200, played as round 1 of 4, a half-cut word round (200 to 100), pool food. Two candidate words, ${CAND[0].text} (${CAND[0].n} syllables) and ${CAND[1].text} (${CAND[1].n}); group 0 holds ${VALUES[0]}, group 1 holds ${VALUES[1]}; the MC drew the second word with match = out.`];
  return boardDoc(NAME, 'gh#332 board (นับพยางค์) on the gh#325 kit.', head, BOARD_CSS, rows);
}

// Board-specific must-red plants (the kit's generic plants are added by mustred.mjs).
export const PLANTS = [
  ['d4-pick-tap', (s) => s.replace('</style>', '.pr .nk { min-block-size: 30px !important; height: 30px; }</style>'), /tap under 44px in A\/ph-pick/, 'class="nk tap'],
  ['d4-tile-narrow', (s) => s.replace('</style>', '.pj .nums { grid-template-columns: repeat(4, 90px) !important; }</style>'), /outside its parent or a clipping ancestor in A\/mn-result/, 'class="nn"'],
  ['d5-rule-clip', (s) => s.replace('</style>', '.pj .rc .rv { font-size: 260px !important; }</style>'), /clipped in A\/rule/],
  ['d5-split-overflow', (s) => s.replace('</style>', '.pj .rc .sy .st { font-size: 200px !important; }</style>'), /outside its parent or a clipping ancestor in B\/rule/],
  ['d6-tiles-overlap', (s) => s.replace('</style>', '.pj .nums { display: block !important; } .pj .nt { position: absolute !important; left: 0px; top: 0px; width: 300px; }</style>'), /name boxes overlap in A\/mn-pick/],
  ['field-count', (s) => s.replace('data-expect="200/100"', 'data-expect="200/101"'), /field count in F\/result: holds 200 with 100 passed, says 200\/101/],
  ['mini-count', (s) => s.replace('data-expect="4/1"', 'data-expect="4/2"'), /field count in A\/mn-result: holds 4 with 1 passed, says 4\/2/],
  ['count-column-clip', (s) => s.replace('</style>', '.pj .wc .wd { font-size: 60px !important; }</style>'), /clipped in F\/deal/, 'class="wd"'],
];

// Extra must-red commands: the generator's own guards, run against a control and a planted deal.
const GUARD = (body) => ['--input-type=module', '-e', `import { assertDeal, assertSplit, DEAL_FIXTURE } from './board-syllables.mjs'; ${body}`];
export const EXTRA = [
  ['deal guard control', GUARD('assertDeal(DEAL_FIXTURE)'), {}, null],
  ['deal guard: polarity survive keeps group 1', GUARD("assertDeal({ ...DEAL_FIXTURE, polarity: 'survive' })"), {}, /syllable deal: group 0 must stay in|syllable deal: 1 of 2/],
  ['deal guard: a candidate whose count is not its value', GUARD('assertDeal({ ...DEAL_FIXTURE, values: [2, 4] })'), {}, /syllable deal: candidate 0 has 3 syllables, its value is 2/],
  ['deal guard: the pair repeats a count', GUARD('assertDeal({ ...DEAL_FIXTURE, cands: DEAL_FIXTURE.cands, values: [4, 4] })'), {}, /syllable deal: the pair 4,4 is not two different counts/],
  ['split guard: one part missing', GUARD("assertSplit({ text: 'ทุเรียน', n: 2, parts: ['ทุเรียน'] })"), {}, /syllable split: ทุเรียน is split into 1, its bank count is 2/],
];

export const BOARD = {
  name: NAME,
  build,
  expect: EXPECT,
  plants: PLANTS,
  extra: EXTRA,
  sel: {
    clip: '.nn, .nu, .ntc, .st, .rn',
    overlap: '.nt, .nk',
    contain: '.nn, .nu, .ntc, .st, .rn, .nt, .nk, .sy',
    field: '.nums, .nks',
  },
  floors: {},
};
