// gh#330 board: สามกลุ่มอักษร (game 5 of the seven letter and word games) on the gh#325 kit. Writes
// design/Gh330ThreeGroups.dc.html through make-boards.mjs. Owns the decisions G330-D4 to G330-D7 (how the groups are
// marked and told apart, the third class of an event round, how the drawn word names the group, the phone pick
// cards). The shared decisions D1 (glyph floor) and D3 (code grouping) are drawn here only through KIT_OPT /
// KIT_VALUE; their options live on Gh326PickRule and are never redrawn.
//
// What the engine deals, read from round.ts (analyseHeld, holdingFor): an event round gives each person ONE value of a
// PAIR of the three, group 0 the first value and group 1 the second, 100 and 100 at a half-cut. The third class is
// absent that round, because three non-empty groups cannot all cut exactly under both polarities. Three live groups
// exist only on the mini-event page, where the players pick. The frames below are drawn to that.
import { pathToFileURL } from 'node:url';
import {
  th, nm, esc, ratio, resetCopy, contrastTable, valuesTable, beatTable, nameFitRow, notesRow,
  OPTIONS, KIT_OPT, KIT_VALUE, pickNote, WORD_ROUND, ME, CAP_NAME, WIDE_AM, WIDEST_WORD, wordCol,
  wordCode, boardDoc, ORDER_LINE, decisionsRow, rolesRow, copyRow, sec, cand, cands, tag,
  stage, phone, topBar, hud, lowBand, count, floorLayer, denseField, codeCard, codeField,
  phoneHead, ruleTap, goButton, verdict, timer, winners,
  KIT_ROLES, KIT_VALUES, KIT_PAIRS, kitPlants,
} from './kit.mjs';

const NAME = 'Gh330ThreeGroups';
const GAME = 'สามกลุ่มอักษร';
const SRC_GAME = 'gh#311 body, the game name, owner wording, verbatim';
const SRC_CLS = 'src/prize-round/conditions.ts class and word-type names and the condition template, PROVISIONAL (gh#322; final wording is this canvas) · verbatim';

// ---------------------------------------------------------------------------------------------
// DATA. The consonant table is copied from docs/design/prize-words-spec.md (high 11, mid 9, low 24; the 44
// consonants). A word's class is the class of its first consonant, leading vowels เ แ โ ใ ไ skipped. Every sample
// word is a literal with the class the bank stores, and the generator re-derives the class and refuses a mismatch:
// a wrong class on a drawn word would put the wrong group out.
// ---------------------------------------------------------------------------------------------
const CLASS_LETTERS = { high: 'ขฃฉฐถผฝศษสห', mid: 'กจฎฏดตบปอ', low: 'คฅฆงชซฌญฑฒณทธนพฟภมยรลวฬฮ' };
const LEADING_VOWELS = new Set([...'เแโใไ']);
const CLASS_OF_LETTER = new Map(Object.entries(CLASS_LETTERS).flatMap(([k, s]) => [...s].map((c) => [c, k])));
const bad = (m) => { throw new Error(`threegroups guard: ${m}`); };
if ([...CLASS_LETTERS.high].length !== 11 || [...CLASS_LETTERS.mid].length !== 9 || [...CLASS_LETTERS.low].length !== 24 || CLASS_OF_LETTER.size !== 44) bad('class guard: the consonant table is not 11 + 9 + 24 = 44 distinct letters');
export const firstConsonant = (word) => [...word].find((c) => !LEADING_VOWELS.has(c) && CLASS_OF_LETTER.has(c));
export function assertClass(word, declared) {
  const c = firstConsonant(word);
  if (!c) bad(`class guard: ${word} has no consonant`);
  if (CLASS_OF_LETTER.get(c) !== declared) bad(`class guard: ${word} starts with ${c} (${CLASS_OF_LETTER.get(c)}), declared ${declared}`);
}

// Bank sample (the office pool at commit 50f74b7, review pending, gh#321): word -> stored class / word type.
const TH_WORDS = { 'สมุด': 'high', 'รายงาน': 'low', 'กระดาษ': 'mid' };
const EN_WORDS = { printer: 'noun', approve: 'verb' };
for (const [w, c] of Object.entries(TH_WORDS)) assertClass(w, c);

const TH_GROUPS = [
  { key: 'high', n: 1, tone: 'g1', th: 'อักษรสูง' },
  { key: 'mid', n: 2, tone: 'g2', th: 'อักษรกลาง' },
  { key: 'low', n: 3, tone: 'g3', th: 'อักษรต่ำ' },
];
const EN_GROUPS = [
  { key: 'noun', n: 1, tone: 'g1', th: 'คำนาม' },
  { key: 'verb', n: 2, tone: 'g2', th: 'คำกริยา' },
  { key: 'adjective', n: 3, tone: 'g3', th: 'คำคุณศัพท์' },
];
const grp = (list, key) => list.find((g) => g.key === key);
const CLASS_LINE = (key) => `พยัญชนะตัวแรกเป็น${grp(TH_GROUPS, key).th}`; // conditions.ts template, verbatim
const TYPE_LINE = (key) => `เป็น${grp(EN_GROUPS, key).th}`;

// ---- the event round deal: the pair (high, low); group 0 of the kit's half-cut fixture holds high, group 1 low ----
const PAIR = ['high', 'low'];
const holding = (n) => PAIR[WORD_ROUND.group.get(n)];
const EV_COUNTS = { high: 0, mid: 0, low: 0 };
for (const n of WORD_ROUND.names) EV_COUNTS[holding(n)]++;
const CANDIDATES = ['สมุด', 'รายงาน']; // rule 0 (high) and rule 1 (low): one word per value of the pair
const DRAWN = { word: 'สมุด', rule: 0, polarity: 'survive' };
export function assertSplit(counts, keep, candidates) {
  const live = 2 * keep;
  const sum = Object.values(counts).reduce((a, b) => a + b, 0);
  if (sum !== live) bad(`split guard: the groups hold ${sum} heads, not ${live}`);
  const held = Object.entries(counts).filter(([, v]) => v > 0);
  if (held.length !== 2) bad(`split guard: ${held.length} groups hold heads, a half-cut deals exactly 2`);
  for (const [k, v] of held) if (v !== keep) bad(`split guard: ${k} holds ${v}, not keep ${keep}`);
  for (const w of candidates) {
    const c = TH_WORDS[w];
    if (!counts[c]) bad(`split guard: the candidate ${w} is class ${c}, which nobody holds`);
    if (counts[c] !== keep || live - counts[c] !== keep) bad(`split guard: the candidate ${w} does not cut exactly ${keep} under both polarities`);
  }
}
assertSplit(EV_COUNTS, WORD_ROUND.keep, CANDIDATES);
assertClass(DRAWN.word, PAIR[DRAWN.rule]);
const SURV_GROUP = EV_COUNTS[TH_WORDS[DRAWN.word]]; // the drawn word's own group; kept under survive, out under out

// ---- the mini-event: real picks over all three, the rule drawn after the picks are stored (gh#311, gh#324) ----
const MINI = { players: 52, winners: 3, picks: { high: 21, mid: 14, low: 17 }, word: 'กระดาษ', polarity: 'out', mine: 'high' };
export function assertMini(m) {
  const sum = Object.values(m.picks).reduce((a, b) => a + b, 0);
  if (sum !== m.players) bad(`mini guard: the picks sum to ${sum}, not ${m.players} players`);
  const drawn = m.picks[TH_WORDS[m.word]];
  const survivors = m.polarity === 'survive' ? drawn : m.players - drawn;
  if (survivors === 0) bad('mini guard: the rule leaves nobody (it is redrawn)');
  if (survivors === m.players) bad('mini guard: the rule keeps everybody (it is redrawn)');
  if (survivors < m.winners) bad(`mini guard: ${survivors} survivors, fewer than the ${m.winners} winners (it is redrawn)`);
  return survivors;
}
assertClass(MINI.word, 'mid');
const MINI_LEFT = assertMini(MINI);
const MINI_OUT_KEY = TH_WORDS[MINI.word];

const CODE = wordCode(1, { seed: '48215', cut: WORD_ROUND.keep, revision: 1, kind: 18, pool: 'office' });

export function runSelftest(mode) {
  const modes = {
    ok: () => { assertSplit(EV_COUNTS, WORD_ROUND.keep, CANDIDATES); assertMini(MINI); assertClass('เก้าอี้', 'mid'); assertClass('หมา', 'high'); },
    'wrong-class': () => assertClass('สมุด', 'low'),
    'wrong-class-leading-vowel': () => assertClass('เก้าอี้', 'high'),
    split: () => assertSplit({ high: 99, mid: 0, low: 101 }, 100, CANDIDATES),
    'three-groups': () => assertSplit({ high: 100, mid: 50, low: 50 }, 100, CANDIDATES),
    'mini-few': () => assertMini({ ...MINI, picks: { high: 1, mid: 1, low: 50 }, word: 'สมุด', polarity: 'survive' }),
    'mini-all': () => assertMini({ ...MINI, picks: { high: 52, mid: 0, low: 0 }, word: 'สมุด', polarity: 'survive' }),
  };
  if (!modes[mode]) { console.error(`unknown selftest mode ${mode}`); process.exit(2); }
  modes[mode]();
  console.log(`threegroups selftest ${mode}: accepted`);
}

// ---------------------------------------------------------------------------------------------
// MARKS AND PANELS
// ---------------------------------------------------------------------------------------------
const PAINT = { g1: '#ff3d7f', g2: '#2b7bff', g3: '#c9c2ff' };
const INK = '#14142b';
const DIM = '#9a97c0';
const SHAPES = {
  g1: (c) => `<circle cx="60" cy="60" r="52" fill="${c}"/>`,
  g2: (c) => `<rect x="10" y="10" width="100" height="100" rx="12" fill="${c}"/>`,
  g3: (c) => `<polygon points="60,8 114,108 6,108" fill="${c}"/>`,
};
const paintOf = (tone, state) => (state === 'in' || state === 'on' ? INK : state === 'out' || state === 'empty' ? DIM : PAINT[tone]);
const shape = (tone, state, px) => `<svg class="gm ${tone}" width="${px}" height="${px}" viewBox="0 0 120 120" aria-hidden="true">${SHAPES[tone](paintOf(tone, state))}</svg>`;
const markEl = (style, g, state, px) => (style === 'num' ? `<div class="gnum ${g.tone}">${g.n}</div>` : shape(g.tone, state, px));
const ARROW = '<svg class="dr-ar" width="96" height="40" viewBox="0 0 96 40" aria-hidden="true"><path d="M4 20H88M66 4L90 20L66 36" fill="none" stroke="#d9d6f0" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const gname = (g) => th(g.th, `group name (${g.key})`, SRC_CLS);
const unitPeople = () => th('คน', 'unit: people', 'g302');
const POL = () => [th('กลุ่มของคำ รอด', 'polarity: the word\'s group survives'), th('กลุ่มของคำ ตก', 'polarity: the word\'s group is out')];
const STATUS = { in: () => th('ผ่าน', 'legend: passed', 'g302'), out: () => th('ไม่ผ่าน', 'legend: did not pass', 'g302'), empty: () => th('ไม่มีในรอบนี้', 'panel: class not dealt this round') };

function panel(style, g, state, { n = null, status = true } = {}) {
  const row = n === null ? '' : `<div class="grp-row"><span class="grp-ct">${n}</span><span class="grp-un">${unitPeople()}</span></div>`;
  const st = status && STATUS[state] ? `<span class="grp-st">${STATUS[state]()}</span>` : '';
  return `<div class="grp ${g.tone}${state ? ' ' + state : ''}">${markEl(style, g, state, 140)}<span class="grp-nm">${gname(g)}</span>${row}${st}</div>`;
}
const panels = (items, { top, short = false, expect = '' } = {}) => `<div class="grps${short ? ' short' : ''}"${expect ? ` data-expect="${expect}"` : ''} style="top: ${top}px;">${items.join('')}</div>`;
const expectOf = (states) => `${states.length}/${states.filter((s) => s === 'in').length}`;

const groupCard = (style, g) => `<div class="pgc ${g.tone}">${style === 'num' ? `<div class="gnum ${g.tone}">${g.n}</div>` : shape(g.tone, '', 96)}<span class="pgc-nm">${gname(g)}</span></div>`;
const spaced = (key) => [...CLASS_LETTERS[key]].join(' ');
const pickRow = (style, g, on, letters) => `<div class="pk tap${on ? ' on' : ''}">${style === 'num' ? `<div class="gnum ${g.tone}">${g.n}</div>` : shape(g.tone, on ? 'on' : '', 40)}<span class="pk-tx"><span class="pk-nm">${gname(g)}</span>${letters ? `<span class="pk-lt">${esc(spaced(g.key))}</span>` : ''}</span></div>`;

const DEFAULT_MARK = 'shape';
const KIT_D1 = () => KIT_OPT('D1');
const KIT_D3 = () => KIT_VALUE('D3').groups;

// ---------------------------------------------------------------------------------------------
// FRAMES: event round, projector
// ---------------------------------------------------------------------------------------------
const gameName = () => th(GAME, 'game name', SRC_GAME);
const cells = (state) => WORD_ROUND.names.map((n) => [n, grp(TH_GROUPS, holding(n)).th, state(n)]);
const judged = (n) => (TH_WORDS[DRAWN.word] === holding(n) ? 'in' : 'out');

function dense(id, state) {
  const o = OPTIONS.D1[KIT_D1()];
  const right = o.perPage < WORD_ROUND.live
    ? `<div class="lk">${th('หน้า 1 จาก 2', 'dense field: page indicator')}</div>${count(WORD_ROUND.live, unitPeople())}`
    : count(WORD_ROUND.live, unitPeople());
  return stage(id, 'F', `${topBar(1)}${denseField(cells(state), KIT_D1())}${lowBand(`<div class="gname">${gameName()}</div>`, `<div class="lk">${th('ดูกลุ่มข้างชื่อของคุณ', 'dense field: instruction (admin mode)')}</div>`, right, 'slim')}`);
}
function resultFrame(id, withFloor) {
  const legend = `<div class="legend"><div class="wc in"><span class="lg">${th('ผ่าน', 'legend: passed', 'g302')}</span></div><div class="wc out"><span class="lg">${th('ไม่ผ่าน', 'legend: did not pass', 'g302')}</span></div></div>`;
  const band = lowBand(`<div class="gname">${gameName()}</div>`, legend, `<div class="lk">${th('ผ่านรอบที่ 1', 'reveal: passed heading', 'g302')}</div>${count(WORD_ROUND.keep, unitPeople())}`, 'slim');
  return stage(id, 'F', `${withFloor ? floorLayer() : ''}${topBar(1)}${denseField(cells(judged), KIT_D1())}${band}`);
}
const codeFrame = () => stage('code', 'F', `${topBar(1)}${hud(gameName())}${codeCard(CODE, 1, KIT_D3(), th('รหัสรอบที่ 1', 'round code: label (round 1)'), th('ใส่รหัสนี้ในมือถือ เพื่อดูกลุ่มของคุณ', 'round code: instruction'))}`);

// D5: the QR-mode screen after the code, the groups with their head counts (names live on the phones)
function pairFrame(opt) {
  const items = TH_GROUPS.filter((g) => opt === 'A' || PAIR.includes(g.key)).map((g) => (PAIR.includes(g.key) ? panel(DEFAULT_MARK, g, '', { n: EV_COUNTS[g.key] }) : panel(DEFAULT_MARK, g, 'empty', { n: 0 })));
  const band = lowBand(`<div class="gname">${gameName()}</div>`, '', count(WORD_ROUND.live, unitPeople()), 'slim');
  return stage('pair', opt, `${topBar(1)}${hud(gameName(), th('กลุ่มของคุณอยู่ในมือถือ', 'pair: instruction'))}${panels(items, { top: 290 })}${band}`);
}

// D6: the draw. The strip names the word, why its group, and the polarity; the panels below take the verdict.
const DR_TOP = 410;
function drawStrip(opt, word, g, lang) {
  const polarity = POL()[DRAWN.polarity === 'survive' ? 0 : 1];
  const wordBlock = `<div class="dr-col"><span class="dr-lab">${th('คำที่จับได้', 'draw: the drawn word label')}</span><span class="dr-word">${esc(word)}</span></div>`;
  let row;
  if (opt === 'A') {
    const line = lang === 'th' ? CLASS_LINE(g.key) : TYPE_LINE(g.key);
    row = `${wordBlock}<div class="dr-col"><span class="dr-line">${th(line, lang === 'th' ? 'draw: the first consonant and its class' : 'draw: the word type', SRC_CLS)}</span></div>`;
  } else {
    const letter = `<div class="dr-col"><span class="dr-lab">${th('พยัญชนะตัวแรก', 'draw: first consonant label')}</span><div class="dr-tile"><span class="dr-tl">${esc(firstConsonant(word))}</span></div></div>`;
    const to = `<div class="dr-col"><span class="dr-lab">${th('กลุ่มของคำ', 'draw: the word\'s group label')}</span><div class="dr-gp">${shape(g.tone, '', 80)}<span class="dr-gn">${gname(g)}</span></div></div>`;
    row = `${wordBlock}${ARROW}${letter}${ARROW}${to}`;
  }
  return `<div class="dr"><div class="dr-row">${row}</div><span class="dr-pol">${polarity}</span></div>`;
}
function revealFrame(id, opt, floor) {
  const states = TH_GROUPS.map((g) => (!PAIR.includes(g.key) ? 'empty' : g.key === TH_WORDS[DRAWN.word] ? (DRAWN.polarity === 'survive' ? 'in' : 'out') : (DRAWN.polarity === 'survive' ? 'out' : 'in')));
  const items = TH_GROUPS.map((g, i) => panel(DEFAULT_MARK, g, states[i], { n: states[i] === 'empty' ? 0 : EV_COUNTS[g.key] }));
  const band = lowBand(`<div class="gname">${gameName()}</div>`, '', `<div class="lk">${th('ผ่านรอบที่ 1', 'reveal: passed heading', 'g302')}</div>${count(WORD_ROUND.keep, unitPeople())}`, 'slim');
  return stage(id, opt, `${floor ? floorLayer() : ''}${topBar(1)}${drawStrip(opt, DRAWN.word, grp(TH_GROUPS, TH_WORDS[DRAWN.word]), 'th')}${panels(items, { top: DR_TOP, expect: expectOf(states) })}${band}`);
}
function enReveal() {
  const word = 'approve'; const g = grp(EN_GROUPS, EN_WORDS[word]);
  const pair = ['noun', 'verb'];
  const states = EN_GROUPS.map((x) => (!pair.includes(x.key) ? 'empty' : x.key === g.key ? 'in' : 'out'));
  const items = EN_GROUPS.map((x, i) => panel(DEFAULT_MARK, x, states[i], { n: states[i] === 'empty' ? 0 : WORD_ROUND.keep }));
  const band = lowBand(`<div class="gname">${gameName()}</div>`, '', `<div class="lk">${th('ผ่านรอบที่ 1', 'reveal: passed heading', 'g302')}</div>${count(WORD_ROUND.keep, unitPeople())}`, 'slim');
  return stage('en-reveal', 'F', `${floorLayer()}${topBar(1)}${drawStrip('A', word, g, 'en')}${panels(items, { top: DR_TOP, expect: expectOf(states) })}${band}`);
}

// ---------------------------------------------------------------------------------------------
// FRAMES: event round, phone (engine 2a: the code, the group, the rule tap, the verdict)
// ---------------------------------------------------------------------------------------------
const MY_GROUP = grp(TH_GROUPS, holding(ME));
const OUT_GROUP = grp(TH_GROUPS, PAIR.find((k) => k !== holding(ME)));
const waiting = () => `<p class="msg">${th('รอพิธีกรจับคำ', 'phone: waiting for the word')}</p>`;
const phCode = () => phone('ph-code', 'F', `${phoneHead(th('ใส่รหัสรอบ', 'phone: code entry heading'), th('รหัส 14 หลักที่ขึ้นบนจอใหญ่', 'phone: code entry hint'))}${codeField(CODE, 1, KIT_D3())}${goButton(th('ดูกลุ่มของฉัน', 'phone: see my group'))}`);
const phGroup = (opt) => phone('ph-group', opt, `${phoneHead(th('กลุ่มของคุณ', 'phone: your group heading'))}${groupCard(opt === 'A' ? 'shape' : 'num', MY_GROUP)}${waiting()}`);
const phTap = () => phone('ph-tap', 'F', `${phoneHead(th('แตะคำที่ขึ้นบนจอ', 'phone: word tap heading'))}${ruleTap(th('คำบนจอ', 'phone: word tap, which word'), CANDIDATES.map(esc), DRAWN.rule, th('บนจอขึ้นว่า', 'phone: rule tap, which polarity'), POL(), DRAWN.polarity === 'survive' ? 0 : 1)}${goButton(th('ดูผล', 'phone: see the result'))}`);
const tapped = () => `${th('คำที่คุณแตะ:', 'phone: the word tapped')} ${esc(DRAWN.word)} · ${POL()[DRAWN.polarity === 'survive' ? 0 : 1]}`;
const phIn = () => phone('ph-in', 'F', `${phoneHead(th('ผลรอบที่ 1', 'phone: result heading'))}${verdict(th('ผ่าน', 'legend: passed', 'g302'), '', tapped())}${groupCard(DEFAULT_MARK, MY_GROUP)}`);
const phOut = () => phone('ph-out', 'F', `${phoneHead(th('ผลรอบที่ 1', 'phone: result heading'))}${verdict(th('ไม่ผ่าน', 'legend: did not pass', 'g302'), 'out', tapped())}${groupCard(DEFAULT_MARK, OUT_GROUP)}`);

// ---------------------------------------------------------------------------------------------
// FRAMES: mini-event page (players pick one of the three groups on their own phones)
// ---------------------------------------------------------------------------------------------
const miniTop = (round) => `<div class="top"><span class="ev">${gameName()}</span><span class="lk">${th(`รอบที่ ${round}`, 'mini-event: round label')}</span></div>`;
const MINI_EV = () => gameName();
function mnPick(opt) {
  const style = opt === 'A' ? 'shape' : 'num';
  const items = TH_GROUPS.map((g) => panel(style, g, '', { status: false }));
  return stage('mn-pick', opt, `${miniTop(1)}${hud(th('เลือก 1 กลุ่มในมือถือของคุณ', 'mini-event: pick instruction'), th('เปลี่ยนกลุ่มได้จนกว่าพิธีกรจะปิดรับ', 'mini-event: picks change until close'))}${panels(items, { top: 330, short: true })}${lowBand(`<div class="lk">${th('เลือกแล้ว', 'mini-event: picked so far')}</div>${count(37, th('จาก 52 คน', 'mini-event: of N people'), 'sm')}`, timer('0:24'), `<div class="lk">${th('ใครไม่เลือก ระบบสุ่มกลุ่มให้', 'mini-event: random fill')}</div>`)}`);
}
function mnResult() {
  const states = TH_GROUPS.map((g) => ((g.key === MINI_OUT_KEY) === (MINI.polarity === 'survive') ? 'in' : 'out'));
  const items = TH_GROUPS.map((g, i) => panel(DEFAULT_MARK, g, states[i], { n: MINI.picks[g.key] }));
  const polarity = POL()[MINI.polarity === 'survive' ? 0 : 1];
  return stage('mn-result', 'F', `${miniTop(1)}${hud(esc(MINI.word), `${th(CLASS_LINE(MINI_OUT_KEY), 'draw: the first consonant and its class', SRC_CLS)} · ${polarity}`)}${panels(items, { top: 300, expect: expectOf(states) })}${lowBand(`<div class="lk">${th('เหลือ', 'mini-event: still in')}</div>${count(MINI_LEFT, unitPeople(), 'sm')}`, '', `<div class="lk">${th('เล่นต่อจนเหลือผู้ชนะ 3 คน', 'mini-event: rounds repeat to the winner count')}</div>`)}`);
}
const mnWin = () => stage('mn-win', 'F', `${miniTop(3)}${hud(th('ผู้ชนะ', 'mini-event: winners heading'), th('3 คน', 'mini-event: winner count'))}${winners([ME, CAP_NAME, WIDE_AM])}`);
const mnPhPick = (opt) => phone('mn-ph-pick', opt, `${phoneHead(th('เลือก 1 กลุ่ม', 'mini-event phone: pick heading'), th('เปลี่ยนกลุ่มได้จนกว่าพิธีกรจะปิดรับ', 'mini-event: picks change until close'), MINI_EV())}<div class="ptime"><span class="msg">${th('เหลือเวลา', 'mini-event phone: time left')}</span><span class="pt-n">0:24</span></div><div class="pks">${TH_GROUPS.map((g) => pickRow(DEFAULT_MARK, g, g.key === MINI.mine, opt === 'B')).join('')}</div>`);
const MINE = grp(TH_GROUPS, MINI.mine);
const mnPhClosed = () => phone('mn-ph-closed', 'F', `${phoneHead(th('ปิดรับแล้ว', 'mini-event phone: picking closed'), th('กลุ่มของคุณในรอบนี้', 'mini-event phone: your group this round'), MINI_EV())}${groupCard(DEFAULT_MARK, MINE)}${waiting()}`);
const mnPhFill = () => phone('mn-ph-fill', 'F', `${phoneHead(th('ปิดรับแล้ว', 'mini-event phone: picking closed'), th('คุณไม่ได้เลือกทันเวลา ระบบสุ่มกลุ่มให้', 'mini-event phone: random fill'), MINI_EV())}${groupCard(DEFAULT_MARK, grp(TH_GROUPS, 'low'))}${waiting()}`);
const mnPhResult = () => phone('mn-ph-result', 'F', `${phoneHead(th('ผลรอบที่ 1', 'phone: result heading'), '', MINI_EV())}${verdict(th('ผ่าน', 'legend: passed', 'g302'), '', `${th('คำที่ออก:', 'mini-event phone: the drawn word')} ${esc(MINI.word)} · ${POL()[MINI.polarity === 'survive' ? 0 : 1]}`)}${groupCard(DEFAULT_MARK, MINE)}<p class="msg">${th('รอรอบที่ 2', 'mini-event phone: waiting for round 2')}</p>`);

// ---------------------------------------------------------------------------------------------
// BOARD CSS AND ROLES
// ---------------------------------------------------------------------------------------------
const TINT = { g1: ['#3c2045', '#ff3d7f'], g2: ['#1e2857', '#2b7bff'], g3: ['#343257', '#c9c2ff'] };
const BOARD_CSS = `
    /* ---- Gh330ThreeGroups: group panels, the draw strip (projector), the group card and pick rows (phone) ---- */
    .pj .grps { position: absolute; left: 56px; right: 56px; display: flex; justify-content: center; gap: 40px; z-index: 1; }
    .pj .grp { box-sizing: border-box; flex: none; width: 576px; height: 520px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 24px; border-radius: 24px; }
    .pj .grps.short .grp { height: 400px; }
    .pj .grp svg, .pj .grp .gnum { flex: none; }
    .pj .gnum { box-sizing: border-box; width: 140px; height: 140px; display: flex; align-items: center; justify-content: center; border-radius: 50%; font: 700 96px/1 'Mitr', sans-serif; }
    .pj .grp-nm { display: block; font: 700 56px/1.3 'Mitr', sans-serif; white-space: nowrap; overflow-x: clip; overflow-y: visible; }
    .pj .grp-row { display: flex; align-items: baseline; justify-content: center; gap: 14px; }
    .pj .grp-ct { display: block; font: 700 96px/1.2 'Mitr', sans-serif; white-space: nowrap; overflow-x: clip; overflow-y: visible; }
    .pj .grp-un { display: block; font: 600 36px/1.3 'Mitr', sans-serif; white-space: nowrap; }
    .pj .grp-st { display: block; font: 600 36px/1.3 'Mitr', sans-serif; white-space: nowrap; overflow-x: clip; overflow-y: visible; }
    .pj .grp.out :is(.grp-nm, .grp-ct) { text-decoration: line-through; }
    .pj .grp.empty { border: 3px dashed #9a97c0; }
    .pj .dr { position: absolute; left: 56px; right: 56px; top: 112px; display: flex; flex-direction: column; align-items: center; gap: 16px; z-index: 3; }
    .pj .dr-row { display: flex; align-items: center; justify-content: center; gap: 48px; }
    .pj .dr-col { display: flex; flex-direction: column; align-items: center; gap: 4px; }
    .pj .dr-lab { display: block; font: 600 30px/1.35 'Mitr', sans-serif; white-space: nowrap; }
    .pj .dr-word { display: block; font: 700 110px/1.3 'Mitr', sans-serif; white-space: nowrap; overflow-x: clip; overflow-y: visible; }
    .pj .dr-line { display: block; font: 600 44px/1.3 'Mitr', sans-serif; white-space: nowrap; overflow-x: clip; overflow-y: visible; }
    .pj .dr-pol { display: inline-flex; align-items: center; padding: 6px 36px; border-radius: 999px; font: 700 44px/1.3 'Mitr', sans-serif; white-space: nowrap; }
    .pj .dr-tile { box-sizing: border-box; width: 150px; height: 150px; display: flex; align-items: center; justify-content: center; border-radius: 32px; }
    .pj .dr-tl { display: block; font: 700 100px/1.3 'Mitr', sans-serif; white-space: nowrap; }
    .pj .dr-gp { display: flex; align-items: center; gap: 16px; height: 150px; }
    .pj .dr-gp svg { flex: none; }
    .pj .dr-gn { display: block; font: 700 56px/1.3 'Mitr', sans-serif; white-space: nowrap; overflow-x: clip; overflow-y: visible; }
    .pr .pgc { box-sizing: border-box; margin-top: 16px; display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 20px 16px; border-radius: 16px; }
    .pr .pgc svg, .pr .pgc .gnum { flex: none; }
    .pr .gnum { box-sizing: border-box; display: flex; align-items: center; justify-content: center; border-radius: 50%; font-family: 'Mitr', sans-serif; font-weight: 700; line-height: 1; }
    .pr .pgc .gnum { width: 96px; height: 96px; font-size: 56px; }
    .pr .pgc-nm { display: block; font: 700 36px/1.3 'Mitr', sans-serif; white-space: nowrap; overflow-x: clip; overflow-y: visible; }
    .pr .pks { display: flex; flex-direction: column; gap: 10px; margin-top: 14px; }
    .pr .pk { box-sizing: border-box; min-block-size: 56px; display: flex; align-items: center; gap: 12px; padding: 8px 12px; border-radius: 16px; }
    .pr .pk svg, .pr .pk .gnum { flex: none; }
    .pr .pk .gnum { width: 40px; height: 40px; font-size: 24px; }
    .pr .pk-tx { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .pr .pk-nm { display: block; font: 600 20px/1.35 'Mitr', sans-serif; white-space: nowrap; overflow-x: clip; overflow-y: visible; }
    .pr .pk-lt { display: block; font: 400 16px/1.5 'Sarabun', sans-serif; }
    /* ---- paint: one rule per role row below (the render holds each frame to those rows) ---- */
${['g1', 'g2', 'g3'].map((t) => `    .pj .grp.${t}:not(.in):not(.out):not(.empty), .pr .pgc.${t} { background-color: ${TINT[t][0]}; box-shadow: inset 0 0 0 3px ${TINT[t][1]}; }
    .gnum.${t} { background-color: ${TINT[t][1]}; color: #14142b; }`).join('\n')}
    .pj .grp.in { background-color: #ffcc00; box-shadow: 0 0 16px rgba(255,204,0,0.45); }
    .pj .grp.out { box-shadow: inset 0 0 0 2px #23214d; }
    .pj .grp:not(.in):not(.out):not(.empty) :is(.grp-un, .grp-st) { color: #d9d6f0; }
    .pj .grp.in :is(.grp-nm, .grp-ct, .grp-un, .grp-st) { color: #14142b; }
    .pj .grp:is(.out, .empty) :is(.grp-nm, .grp-ct, .grp-un, .grp-st) { color: #9a97c0; }
    .pj .grp.in .gnum { background-color: #14142b; color: #ffcc00; }
    .pj .grp:is(.out, .empty) .gnum { background-color: #9a97c0; color: #14142b; }
    .pr .pk.on .gnum { background-color: #14142b; color: #ffffff; }
    .pj :is(.dr-lab, .dr-line) { color: #d9d6f0; }
    .pj .dr-pol { color: #ffcc00; box-shadow: inset 0 0 0 3px #ffcc00; }
    .pj .dr-tile { background-color: #ffffff; box-shadow: 0 0 16px rgba(255,204,0,0.45); }
    .pj .dr-tl { color: #14142b; }
    .pr .pk:not(.on) { box-shadow: inset 0 0 0 2px #d9d6f0; }
    .pr .pk:not(.on) .pk-lt { color: #d9d6f0; }
    .pr .pk.on { background-color: #ffffff; }
    .pr .pk.on :is(.pk-nm, .pk-lt) { color: #14142b; }`;

const PK = 'gh#302 B PICKED 2026-11-11';
const T = 'tokens.css';
const GLOW = (px) => `rgba(255,204,0,0.45) 0px 0px ${px}px 0px`;
const TONE_NAME = { g1: 'first group', g2: 'second group', g3: 'third group' };
const NEUTRAL = ':is(.pj .grp:not(.in):not(.out):not(.empty), .pr .pgc, .pr .pk:not(.on))';
const G315 = 'Gh315Zones zone panel tint and ring, ratified 2026-11-18 (gh#315)';
const BOARD_ROLES = [
  ['group panel shape', '.pj .grp', ['radius:24px'], `${PK} winner-card radius`],
  ...Object.entries(TINT).map(([t, [bg, ring]]) => [`group panel, ${TONE_NAME[t]}`, `.pj .grp.${t}:not(.in):not(.out):not(.empty)`, [`background-color:${bg}`, `box-shadow:${ring} 0px 0px 0px 3px inset`], G315]),
  ['group panel, passed', '.pj .grp.in', ['background-color:#ffcc00', `box-shadow:${GLOW(16)}`], `${T} --accent-gold; glow (the kit passed cell)`],
  ['group panel, did not pass', '.pj .grp.out', ['box-shadow:#23214d 0px 0px 0px 2px inset'], `the kit did-not-pass ring (${PK})`],
  ['group panel, class not dealt', '.pj .grp.empty', ['border-width:3px', 'border-color:#9a97c0', 'border-style:dashed'], `PROPOSAL; #9a97c0 (${PK})`],
  ['group panel text, name and count', '.pj .grp:not(.in):not(.out):not(.empty) :is(.grp-nm, .grp-ct)', ['color:#ffffff'], `${T} --ink-light`],
  ['group panel text, unit and status', '.pj .grp:not(.in):not(.out):not(.empty) :is(.grp-un, .grp-st)', ['color:#d9d6f0'], `${T} --ink-on-band-soft`],
  ['group panel text, passed', '.pj .grp.in :is(.grp-nm, .grp-ct, .grp-un, .grp-st)', ['color:#14142b'], 'ink on gold'],
  ['group panel text, did not pass or not dealt', '.pj .grp:is(.out, .empty) :is(.grp-nm, .grp-ct, .grp-un, .grp-st)', ['color:#9a97c0'], `#9a97c0 (${PK})`],
  ...Object.entries(TINT).map(([t, [, ring]], i) => [`group mark paint, ${TONE_NAME[t]}`, `:is(.pj .grp:not(.in):not(.out):not(.empty), .pj .dr-gp, .pr .pgc, .pr .pk:not(.on)) svg.${t} *`, [`fill:${ring}`], `${G315} (${['circle', 'square', 'triangle'][i]})`]),
  ['group mark paint, passed or picked', ':is(.pj .grp.in, .pr .pk.on) svg *', ['fill:#14142b'], 'ink on gold; ink on the white picked row'],
  ['group mark paint, did not pass or not dealt', '.pj .grp:is(.out, .empty) svg *', ['fill:#9a97c0'], `#9a97c0 (${PK})`],
  ...Object.entries(TINT).map(([t, [, ring]]) => [`group number tile, ${TONE_NAME[t]}`, `${NEUTRAL} .gnum.${t}`, [`background-color:${ring}`, 'color:#14142b', 'radius:50%'], `${G315}; ink digit`]),
  ['group number tile, passed', '.pj .grp.in .gnum', ['background-color:#14142b', 'color:#ffcc00', 'radius:50%'], `${T} --color-line-strong, --accent-gold`],
  ['group number tile, picked on the phone', '.pr .pk.on .gnum', ['background-color:#14142b', 'color:#ffffff', 'radius:50%'], `${T} --color-line-strong, --ink-light`],
  ['group number tile, did not pass or not dealt', '.pj .grp:is(.out, .empty) .gnum', ['background-color:#9a97c0', 'color:#14142b', 'radius:50%'], `#9a97c0 (${PK}); ink digit`],
  ['draw strip labels', '.pj :is(.dr-lab, .dr-line)', ['color:#d9d6f0'], `${T} --ink-on-band-soft`],
  ['draw strip word and group name', '.pj :is(.dr-word, .dr-gn)', ['color:#ffffff'], `${T} --ink-light`],
  ['draw strip polarity pill', '.pj .dr-pol', ['color:#ffcc00', 'radius:999px', 'box-shadow:#ffcc00 0px 0px 0px 3px inset'], `PROPOSAL; ${T} --accent-gold (the winner card edge)`],
  ['draw strip consonant tile', '.pj .dr-tile', ['background-color:#ffffff', 'radius:32px', `box-shadow:${GLOW(16)}`], 'gh#303 PICKED rule card (white face, 32px radius), small glow'],
  ['draw strip consonant', '.pj .dr-tl', ['color:#14142b'], `${T} --color-line-strong`],
  ['draw strip arrow', '.pj svg.dr-ar *', ['stroke:#d9d6f0'], `${T} --ink-on-band-soft`],
  ['phone group card shape', '.pr .pgc', ['radius:16px'], 'PROPOSAL (the phone choice shape)'],
  ...Object.entries(TINT).map(([t, [bg, ring]]) => [`phone group card, ${TONE_NAME[t]}`, `.pr .pgc.${t}`, [`background-color:${bg}`, `box-shadow:${ring} 0px 0px 0px 3px inset`], G315]),
  ['phone group card name', '.pr .pgc-nm', ['color:#ffffff'], `${T} --ink-light`],
  ['phone pick row shape', '.pr .pk', ['radius:16px'], 'PROPOSAL (the phone choice shape)'],
  ['phone pick row, unpicked', '.pr .pk:not(.on)', ['box-shadow:#d9d6f0 0px 0px 0px 2px inset'], `${T} --ink-on-band-soft ring (the kit phone choice)`],
  ['phone pick row name, unpicked', '.pr .pk:not(.on) .pk-nm', ['color:#ffffff'], `${T} --ink-light`],
  ['phone pick row letters, unpicked', '.pr .pk:not(.on) .pk-lt', ['color:#d9d6f0'], `${T} --ink-on-band-soft`],
  ['phone pick row, picked', '.pr .pk.on', ['background-color:#ffffff'], 'the demo bar pressed paint (the kit phone choice picked)'],
  ['phone pick row text, picked', '.pr .pk.on :is(.pk-nm, .pk-lt)', ['color:#14142b'], `${T} --color-line-strong`],
];

const BOARD_VALUES = [
  ['#3c2045 + #ff3d7f / #1e2857 + #2b7bff / #343257 + #c9c2ff, 3px ring', 'the three group tints (panel, phone card)', 'Gh315Zones zone panels (punch, sky, lilac), ratified 2026-11-18'],
  ['circle / square / triangle, 140px on the projector, 96px phone card, 40px pick row', 'D4 A: the group mark, drawn as inline SVG', 'PROPOSAL'],
  ['1 / 2 / 3 on a round tint tile (Mitr 700 ink), same sizes', 'D4 B: the group mark as a number', 'PROPOSAL'],
  ['576 x 520px panel, 24px radius, 40px gap; name 56px, count 96px, unit and status 36px', 'projector group panels (400px tall on the pick screen)', 'PROPOSAL; radius is the gh#302 winner card'],
  ['3px dashed #9a97c0, no strike', 'a class nobody holds this round (D5 A)', 'PROPOSAL; #9a97c0 is the gh#302 did-not-pass type'],
  ['word 110px Mitr 700, class line 44px Mitr 600, consonant 100px on a 150px white tile', 'the draw strip (D6)', 'PROPOSAL; tile is the gh#303 rule card face'],
  ['phone card name 36px, pick row name 20px, letters 16px Sarabun', 'phone group card and pick rows', 'PROPOSAL; 16px is the phone floor'],
];

const D = { D4: 'G330-D4', D5: 'G330-D5', D6: 'G330-D6', D7: 'G330-D7' };

export const EXPECT = {
  A: ['mn-pick', 'ph-group', 'pair', 'reveal', 'mn-ph-pick'],
  B: ['mn-pick', 'ph-group', 'pair', 'reveal', 'mn-ph-pick'],
  F: ['dense', 'code', 'result', 'fallback', 'ph-code', 'ph-tap', 'ph-in', 'ph-out', 'en-reveal', 'mn-result', 'mn-win', 'mn-ph-closed', 'mn-ph-fill', 'mn-ph-result'],
};

export function build() {
  resetCopy();
  th('คน', 'unit: people', 'g302'); th('ผ่าน', 'legend: passed', 'g302'); th('ไม่ผ่าน', 'legend: did not pass', 'g302'); th('ผ่านรอบที่ 1', 'reveal: passed heading', 'g302');
  const d1 = OPTIONS.D1, d3 = OPTIONS.D3;
  const lumRows = [
    ['#ff3d7f', '#2b7bff', 'group 1 against group 2 as marks: near the same lightness, so colour alone cannot carry the groups'],
    ['#ff3d7f', '#c9c2ff', 'group 1 against group 3'], ['#2b7bff', '#c9c2ff', 'group 2 against group 3'],
  ];
  const pairs = [
    ...Object.values(TINT).map(([bg, ring]) => [ring, bg, 'the mark and ring on its own tint']),
    ...Object.values(TINT).map(([bg]) => ['#ffffff', bg, 'names and counts on the tint']),
    ['#14142b', '#ff3d7f', 'number digit on the first tint tile'], ['#14142b', '#2b7bff', 'number digit on the second tint tile'], ['#14142b', '#c9c2ff', 'number digit on the third tint tile'],
    ['#14142b', '#9a97c0', 'number digit on a did-not-pass tile'],
  ];
  const rows = [
    decisionsRow([
      ['<b>D1</b> glyph floor on the densest projector screen', 'SHARED (kit) · decided on Gh326PickRule · not redrawn here', `<b>A ${d1.A.label}</b>`, `<b>B ${d1.B.label}</b>`, pickNote('D1')],
      ['<b>D3</b> grouping of the 14-digit round code', 'SHARED (kit) · decided on Gh326PickRule · not redrawn here', `<b>A ${d3.A.label}</b>`, `<b>B ${d3.B.label}</b>`, pickNote('D3')],
      [`<b>${D.D4}</b> how the groups are told apart beyond colour (projector panel, phone group card)`, 'THIS BOARD · gh#330', '<b>A SHAPE</b>: a circle, a square and a triangle in the group\'s tint, the Thai name beside it', '<b>B NUMBER</b>: 1, 2 and 3 on a round tint tile, the Thai name beside it', 'awaiting the owner'],
      [`<b>${D.D5}</b> the class nobody holds in an event round (the deal deals two of the three)`, 'THIS BOARD · gh#330', '<b>A THREE PANELS</b>: the third panel stays, dimmed, dashed, "0 คน", labelled not dealt this round', '<b>B TWO PANELS</b>: only the two groups dealt are drawn', 'awaiting the owner'],
      [`<b>${D.D6}</b> how the drawn word names the group that decides`, 'THIS BOARD · gh#330', '<b>A WORD + CLASS LINE</b>: the word, then one line "พยัญชนะตัวแรกเป็น…" (the conditions.ts template)', '<b>B CONSONANT CHAIN</b>: the word, its first consonant alone on a tile, the group mark and name', 'awaiting the owner'],
      [`<b>${D.D7}</b> what the mini-event phone shows on each group to pick`, 'THIS BOARD · gh#330', '<b>A NAME ONLY</b>: mark and Thai name, three rows', '<b>B NAME + CLASS LETTERS</b>: the same plus the consonants of that class (11, 9, 24 letters)', 'awaiting the owner'],
    ]),
    sec(`${D.D4} · GROUP MARK · the three groups told apart, event round and mini-event`, `A person finds their group by name, by mark and by place; tint is the third cue, never the only one. The three tints are the gh#315 zone tints (punch, sky, lilac); punch and sky differ by only ${ratio('#ff3d7f', '#2b7bff').toFixed(2)}:1 in lightness (CONTRAST table), so two groups can look the same to a person who cannot tell the hues apart. A draws a circle, a square and a triangle; B draws 1, 2 and 3 in a fixed order (the spoken order of สูง กลาง ต่ำ, and noun, verb, adjective in an English round: the marks do not depend on the language). Drawn on the mini-event pick screen (three live groups) and the phone group card (the event round holding). Passed groups take the kit's gold with ink type and the dimmed groups are struck through, so the verdict never rests on colour either.`,
      cands([cand(tag('A', `${D.D4} SHAPE`, ' circle, square, triangle'), mnPick('A')), cand(tag('B', `${D.D4} NUMBER`, ' 1, 2, 3'), mnPick('B'))], true)
      + cands([cand(tag('A', `${D.D4} SHAPE`, ' phone group card'), phGroup('A')), cand(tag('B', `${D.D4} NUMBER`, ' phone group card'), phGroup('B'))])),
    sec(`${D.D5} · THE THIRD CLASS · event round, QR mode, after the code`, `Read from the engine (round.ts analyseHeld and holdingFor): a half-cut deal gives each person ONE value of a PAIR of the three, so the room is 100 and 100 and the third class is empty that round (which pair is hashed from the seed; here high and low). Three non-empty groups could not all cut exactly under both polarities, so a three-way deal is not an option the engine has. A keeps the three panels and positions fixed and shows the empty one as not dealt; B draws only the two groups dealt and centres them (a pair of mid and low then sits in the middle). Names stay on the phones: the screen shows the head counts.`,
      cands([cand(tag('A', `${D.D5} THREE PANELS`, ' the third dimmed'), pairFrame('A')), cand(tag('B', `${D.D5} TWO PANELS`, ' only the pair dealt'), pairFrame('B'))], true)),
    sec(`${D.D6} · THE DRAWN WORD · the draw strip and the verdict on the panels`, `The MC draws a word; the group holding its class is "the word's group", and the polarity pill says whether that group survives or is out (random, the MC can switch it until the draw). Drawn here: the word ${esc(DRAWN.word)}, first consonant ${esc(firstConsonant(DRAWN.word))}, ${grp(TH_GROUPS, TH_WORDS[DRAWN.word]).th}, polarity survive: that group passes, the other dealt group does not, the third was not dealt (D5 A). In B the consonant sits alone on its tile, never marked inside the word, because a lone mark inside a Thai word can detach from its consonant. Under the strip the panels flip at once (the whole group lands together, beat table).`,
      cands([cand(tag('A', `${D.D6} WORD + CLASS LINE`, ' 3D intent'), revealFrame('reveal', 'A', true)), cand(tag('B', `${D.D6} CONSONANT CHAIN`, ' 3D intent'), revealFrame('reveal', 'B', true))], true)),
    sec(`${D.D7} · PHONE PICK CARDS · mini-event, a player picks one of the three`, 'Real picks, changeable until the MC closes picking (gh#311, owner ruling 2026-11-19); anyone who has not picked at close gets a random group. The phone shows nothing about the other players (the pick route answers a phone only its own pick). B adds the consonants of each class under its name: 11 high, 9 mid and 24 low letters, at 16px. Row height stays above the 44px tap floor in both.',
      cands([cand(tag('A', `${D.D7} NAME ONLY`, ' mini-event pick'), mnPhPick('A')), cand(tag('B', `${D.D7} NAME + CLASS LETTERS`, ' mini-event pick'), mnPhPick('B'))])),
    sec('SHARED · THE EVENT ROUND · admin mode, the code, the judged field, the never-blank 2D frame', `Drawn with the kit defaults: ${pickNote('D1')}; ${pickNote('D3')}; ${D.D4} A, ${D.D5} A, ${D.D6} A. Admin mode puts each head's group beside its name on the densest screen (the word column holds the class name; the widest class name is far under the widest bank word, ${esc(WIDEST_WORD.text)}, that sizes the column: ${wordCol(d1[KIT_OPT('D1')].floor)}px). QR mode shows the 14-digit code, real: seed 48215, cut ${WORD_ROUND.keep}, bank revision 1, kind 18 (game 5, Thai, consonant class), pool office, format 0, Damm check (the render re-checks it). The result is the 200 heads judged: ${SURV_GROUP} pass, ${WORD_ROUND.live - SURV_GROUP} do not, whichever polarity the draw shows. The never-blank frame (ADR-0051; also the reduced-motion end state) is the same judged field flat, without the stage floor.`,
      cands([cand(tag('F', 'ADMIN DEAL', ' the group beside every name'), dense('dense', () => '')), cand(tag('F', 'QR CODE', ' D3 as picked or default'), codeFrame()), cand(tag('F', 'RESULT', ' 3D intent'), resultFrame('result', true)), cand(tag('F', 'NEVER-BLANK 2D', ' ADR-0051'), resultFrame('fallback', false))], true)),
    sec('SHARED · THE EVENT ROUND ON THE PHONE · engine 2a, game 5', 'The phone rebuilds its holding from the 14-digit code (no server call at reveal, gh#299 decision 5): one value, the class. Which word was drawn and the polarity reach it only by the rule tap, where the two candidates are the two words (one per class of the pair). The result reads off the same two facts. Real pixels at 320px.',
      cands([cand(tag('F', 'CODE', ''), phCode()), cand(tag('F', 'WORD TAP', ' two words plus polarity'), phTap()), cand(tag('F', 'PASSED', ''), phIn()), cand(tag('F', 'DID NOT PASS', ''), phOut())])),
    sec('SHARED · THE ENGLISH ROUND · word type instead of first consonant', `Same frame, other labels: English splits by word type (noun, verb, adjective), only words with a single type (gh#311 design comment 2026-11-11). Drawn: ${EN_GROUPS.length} groups, the pair noun and verb dealt, adjective not; the drawn word approve is a verb. The marks and their order are the same as in Thai, so a screen is read the same way in both. The Thai UI names the types (คำนาม, คำกริยา, คำคุณศัพท์); the English word is bank data.`,
      cands([cand(tag('F', 'ENGLISH REVEAL', ' 3D intent, D6 A form'), enReveal())], true)),
    sec('SHARED · THE MINI-EVENT PAGE · three live groups, real picks (gh#311, gh#324)', `All three groups are live here: ${MINI.players} players pick on their own phones, the rule is drawn after the picks are stored (the picks are ${MINI.picks.high} / ${MINI.picks.mid} / ${MINI.picks.low}). Drawn: the word ${esc(MINI.word)}, class mid, polarity out: the mid group is out and ${MINI_LEFT} remain. A rule that would leave nobody, everybody or fewer than the winner count (${MINI.winners}) is redrawn automatically (the generator refuses such a fixture). Rounds repeat to the MC-set winner count (1-5); drawn with ${MINI.winners}.`,
      cands([cand(tag('F', 'ROUND RESULT', ''), mnResult()), cand(tag('F', 'WINNERS', ''), mnWin())], true)
      + cands([cand(tag('F', 'PHONE · CLOSED', ' the pick stands'), mnPhClosed()), cand(tag('F', 'PHONE · RANDOM FILL', ''), mnPhFill()), cand(tag('F', 'PHONE · RESULT', ''), mnPhResult())])),
    sec('VALUES · kit values, this board\'s additions and their sources', 'Every frame value is a literal from tokens.css, a gh#302 / gh#303 / gh#315 pick, or a PROPOSAL named here.', valuesTable([...KIT_VALUES, ...BOARD_VALUES]) + contrastTable([...KIT_PAIRS, ...pairs, ...lumRows])),
    sec('BEATS · the reveal on the main screen (3D intent)', 'Beat timing follows the gh#303 picked flip (600ms per turn); every beat has a reduced-motion form (ADR-0046: reduce, not remove). The verdict lands per GROUP, so there is no row-by-row wave as on a name field.', beatTable([
      ['the groups', 'held', 'the panels settle onto the stage floor; the counts roll to the head counts', 'the panels appear in place with one 200ms fade'],
      ['polarity drawn', '1.2s', 'the pill spins to "กลุ่มของคำ รอด" or "กลุ่มของคำ ตก"; the MC can switch it before the draw', 'the pill fades in on its final value'],
      ['word drawn', '1.5s', 'the word card turns in; in the chain form the first consonant lifts onto its tile, then the group mark lights', 'the word and its line (or chain) fade in'],
      ['verdict', '600ms per panel, panels overlap', 'each panel turns once: passed goes gold with ink type, the rest dims and is struck through', 'every panel changes in place with one 200ms fade'],
      ['result', 'held', 'passed panels glow; the count rolls to the keep', 'the count is shown at its final value'],
    ])),
    nameFitRow([
      ['dense field names (D1 A)', 'Sarabun 400', `${d1.A.nameMax}px`, `${d1.A.floor}px`, `a ${d1.A.cols}-column cell less the word column and padding`, 'measured by the render (fit report)'],
      ['dense field names (D1 B)', 'Sarabun 400', `${d1.B.nameMax}px`, `${d1.B.floor}px`, `a ${d1.B.cols}-column cell less the word column and padding`, 'measured by the render (fit report)'],
      ['mini-event winners', 'Mitr 700', '64px', '40px', '1100px card less 80px padding', 'measured by the render'],
      ['group panels, the draw strip, the cards and pick rows', 'Mitr', 'none', 'none', 'no name is typed into them; they carry group names and bank words only', 'checked by the clip and contain probes'],
    ]),
    copyRow(),
    rolesRow([...KIT_ROLES, ...BOARD_ROLES]),
    notesRow([
      '<b>Rests on:</b> gh#311 (the plan, the 2026-11-11 design comment, the 2026-11-19 rulings), gh#330 (game 5), ADR-0080 (half-cut, the 14-digit code), ADR-0076 and the picks design doc (the pick routes, 2-16 options, picks change until close), ADR-0051 (never-blank), gh#299 decision 11 (3D main screen) and its wording constraint, gh#315 (the zone tints), CONTEXT.md (company-party category).',
      '<b>Found while drawing:</b> the issue and the plan speak of the room split into three groups. The engine deals two of the three classes per event round (round.ts analyseHeld, holdingFor), so an event round has two live groups; three live groups exist only on the mini-event page. G330-D5 asks how the empty third class is shown.',
      '<b>Words</b> are bank data at commit 50f74b7 (office pool, review pending, gh#321), frozen as literals; the generator re-derives each class from the first consonant and refuses a mismatch. The bank has no reviewed word yet, so the engine cannot deal this round today; these are samples, not an engine run. The class letters are the table of docs/design/prize-words-spec.md.',
      '<b>Wording:</b> CONTEXT.md bars กลุ่ม as a name for the วง (people sharing one phone). Here it names the three classes only, as the game\'s own title does; the screens never call the room or the players a กลุ่ม.',
      '<b>Not covered:</b> a real projector, room or viewing distance; the 3D motion itself (frames are stills, beats are described); whether people physically gather by group (nothing in the plan asks it); the MC\'s own controls (polarity switch, class pair); an English admin field or English mini-event phone (same frames, other labels); phone widths other than 320px; the dense field sorted by group (it keeps the kit\'s roster order).',
    ]),
  ];
  const head = [ORDER_LINE,
    `Game 5 of the seven letter and word games (gh#330). Shared kit: docs/verification/evidence/gh325-boards-2026-11-20/kit.mjs (gh#325), the template board Gh326PickRule. D1 and D3 are SHARED kit parameters decided there; this board draws them only through the kit (${pickNote('D1')}; ${pickNote('D3')}). Own decisions: ${D.D4} to ${D.D7}.`,
    `Fixture: the gh#302 roster at the setup cap of 200, the three NAME FIT worst cases in it, played as round 1 of 4, a half-cut word round (200 to 100), consonant class, pool office, the pair high and low. Mini-event: ${MINI.players} players, three live groups.`];
  return boardDoc(NAME, 'gh#330 board (สามกลุ่มอักษร) on the gh#325 kit.', head, BOARD_CSS, rows);
}

// Board-specific must-red plants (the kit's generic plants are added by mustred.mjs).
export const PLANTS = [
  ['group-count', (s) => s.replace('data-expect="3/2"', 'data-expect="3/3"'), /field count in F\/mn-result: holds 3 with 2 passed, says 3\/3/],
  ['panel-clip', (s) => s.replace('</style>', '.pj .grp-nm { font-size: 160px !important; }</style>'), /name or code outside its parent or a clipping ancestor in A\/mn-pick/],
  ['pick-tap', (s) => s.replace('</style>', '.pr .pk { min-block-size: 30px !important; height: 30px; }</style>'), /tap under 44px in A\/mn-ph-pick/],
  ['mark-paint', (s) => s.replace('fill="#ff3d7f"', 'fill="#00ff00"'), /renders fill:#00ff00/],
  ['draw-clip', (s) => s.replace('</style>', '.pj .dr-word { font-size: 700px !important; }</style>'), /overflow in [AB]\/reveal/],
];

// Extra must-red commands: the generator's own guards, run as this module (each mode must red on its own line).
export const EXTRA = [
  ['guards accept the real fixture', ['board-threegroups.mjs'], { THREEGROUPS_SELFTEST: 'ok' }, null],
  ['class guard: a high word declared low', ['board-threegroups.mjs'], { THREEGROUPS_SELFTEST: 'wrong-class' }, /class guard: สมุด starts with ส \(high\), declared low/],
  ['class guard: a leading-vowel word declared high', ['board-threegroups.mjs'], { THREEGROUPS_SELFTEST: 'wrong-class-leading-vowel' }, /class guard: เก้าอี้ starts with ก \(mid\), declared high/],
  ['split guard: 99 and 101', ['board-threegroups.mjs'], { THREEGROUPS_SELFTEST: 'split' }, /split guard: high holds 99, not keep 100/],
  ['split guard: three live groups', ['board-threegroups.mjs'], { THREEGROUPS_SELFTEST: 'three-groups' }, /split guard: 3 groups hold heads, a half-cut deals exactly 2/],
  ['mini guard: fewer survivors than winners', ['board-threegroups.mjs'], { THREEGROUPS_SELFTEST: 'mini-few' }, /mini guard: 1 survivors, fewer than the 3 winners/],
  ['mini guard: the rule keeps everybody', ['board-threegroups.mjs'], { THREEGROUPS_SELFTEST: 'mini-all' }, /mini guard: the rule keeps everybody/],
];

export const BOARD = {
  name: NAME, build, expect: EXPECT, plants: PLANTS, extra: EXTRA,
  sel: {
    clip: '.grp-nm, .grp-ct, .grp-un, .grp-st, .dr-word, .dr-line, .dr-lab, .dr-pol, .dr-tl, .dr-gn, .pgc-nm, .pk-nm, .pk-lt',
    overlap: '.grp, .pk',
    contain: '.grp-nm, .grp-ct, .grp-un, .grp-st, .dr-word, .dr-line, .dr-lab, .dr-pol, .dr-tl, .dr-gn, .pgc-nm, .pk-nm, .pk-lt, .grp, .dr-tile, .pgc, .pk',
  },
  floors: {},
};

if (process.env.THREEGROUPS_SELFTEST && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runSelftest(process.env.THREEGROUPS_SELFTEST);
