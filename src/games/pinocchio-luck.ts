// The round rule for the pinocchio-luck party game, plus its crawlable landing page.
//
// TWO THINGS LIVE HERE ON PURPOSE. The default export is the landing module, exactly like
// cannon-flag.ts: the game itself runs full screen at `playRoute`, in the lifted mockup under
// src/play/pinocchio-luck/. The NAMED exports above it are the round rule, and they are here rather
// than inside that lift so the rule has one implementation that a test can reach —
// src/play/pinocchio-luck/main.js imports these same functions and defines none of its own. The
// alternative was a second copy of the rule behind a green test, which cannon-flag.ts calls a debt
// paid at every future edit.
//
// Everything below is pure: no DOM, no timers, no Math.random. Every draw comes from an injected
// `Rng`, which is what makes the round reproducible in a test and, incidentally, replayable.
import type { GameContext, GameModule } from './types.ts';
import { el } from './_el.ts';

/** A number source in [0, 1). The page passes Math.random; a test passes a fixed sequence. */
export interface Rng {
  next(): number;
}

/** The assigned answer is drawn, not known — that is the whole joke of the game. Which of the three
 *  options is "right" is luck, so a wrong answer is bad dice rather than ignorance. */
export type Choice = 'A' | 'B' | 'C';

type QuestionRow = readonly [string, string, string, string, string];

export interface Question {
  id: string;
  prompt: string;
  optionA: string;
  optionB: string;
  optionC: string;
}

export interface Player {
  id: string;
  name: string;
  /** 0 until this player answers wrong; then one value from the 1..10 pool. Never accumulates —
   *  a player answers at most once per round. */
  nose: number;
  answered: boolean;
  lastQuestionId: string | null;
  assignedQuestionId: string;
  assignedCorrectChoice: Choice;
  selectedChoice: Choice | null;
  wasCorrect: boolean;
}

export interface Match {
  phase: string;
  players: Player[];
  turnOrder: string[];
  currentTurnIndex: number;
  remainingGrowthValues: number[];
  usedQuestionIds: string[];
  rerollRound: number;
  rng: Rng;
}

export const PHASE = Object.freeze({
  SETUP: 'setup',
  PASS: 'pass',
  QUESTION: 'question',
  REVEAL: 'reveal',
  TURN_RESULT: 'turn-result',
  ALL_SAFE: 'all-correct-reset',
  RESULTS: 'results',
});

const RAW: readonly QuestionRow[] = [
['q01','ถ้าฉลามต้องไปสัมภาษณ์งาน มันจะใส่อะไร?','เนกไท','ห่วงยาง','แว่นกันแดด'],
['q02','อะไรน่าสงสัยกว่ากันตอนตีสาม?','เป็ดเคาะประตู','ตู้เย็นหัวเราะ','พัดลมเต้นระบำ'],
['q03','ถ้าเอเลี่ยนมาเมืองไทย มันจะลองกินอะไรก่อน?','ข้าวเหนียวหมูปิ้ง','สายชาร์จ','ชานมไข่มุก'],
['q04','ถ้ากล้วยพูดได้ คำแรกที่มันจะพูดคืออะไร?','อย่าปอกนะ','ขอยืมเงินหน่อย','ร้อนจังเลย'],
['q05','ถ้าผีต้องเลี้ยงสัตว์ มันจะเลือกอะไร?','ปลาทอง','ไก่ย่าง','แมวสองมิติ'],
['q06','อะไรน่าจะชนะในการต่อสู้มากกว่า?','คุณยายถือไม้กวาด','เพนกวินใส่นวม','แมวถือแตงกวา'],
['q07','ถ้าหมูได้เป็นนายกหมู่บ้าน สิ่งแรกที่จะทำคืออะไร?','แจกแตงโม','ห้ามกินหมูกระทะ','สั่งห้ามลดน้ำหนัก'],
['q08','ถ้าแมวเปิดบริษัท ตำแหน่งแรกที่มันจะรับคืออะไร?','พนักงานเปิดกระป๋อง','คนเฝ้ากล่อง','นักเกาคางมืออาชีพ'],
['q09','ถ้าดวงจันทร์หิวตอนกลางคืน มันจะกินอะไร?','ดาวทอด','เมฆปิ้ง','แสงไฟนีออน'],
['q10','อะไรดูน่าไว้ใจกว่ากัน?','ฉลามใส่แว่น','ลิงถือใบเสร็จ','ไดโนเสาร์ถือร่ม'],
['q11','ถ้าจระเข้เปิดคาเฟ่ เมนูขายดีจะเป็นอะไร?','ลาเต้น้ำบึง','ครัวซองต์รูปปลา','ชาเขียวสาหร่าย'],
['q12','ถ้าหุ่นยนต์อกหัก มันจะทำอะไรก่อน?','รีสตาร์ตตัวเอง','กินไอศกรีม','ลบโฟลเดอร์รูปแฟน'],
['q13','ถ้าไก่เป็นตำรวจ มันจะพกอะไรแทนกุญแจมือ?','หนังยาง','เส้นหมี่','เปลือกกล้วย'],
['q14','ถ้าปลาทองต้องสอบขับรถ มันจะตกเพราะอะไร?','ลืมเปิดไฟเลี้ยว','ว่ายออกนอกถนน','จำทางได้แค่ 3 วินาที'],
['q15','ถ้าต้นไม้มีโทรศัพท์ มันจะโทรหาใครบ่อยที่สุด?','ฝน','ช่างตัดผม','กระรอกข้างบ้าน'],
['q16','อะไรเหมาะเป็นบอดี้การ์ดมากกว่า?','เต่าตัวใหญ่','กระรอกใส่สูท','นกพิราบมองแรง'],
['q17','ถ้าก้อนหินไปเที่ยวทะเล มันจะเอาอะไรไป?','ครีมกันแดด','หมอน','แว่นดำ'],
['q18','ถ้าช้างต้องปลอมตัว มันจะปลอมเป็นอะไร?','โคมไฟ','แมว','ตู้เย็นสองประตู'],
['q19','ถ้าขนมปังมีความฝัน มันอยากเป็นอะไร?','นักบิน','โต๊ะกินข้าว','ฟูกที่นอน'],
['q20','ถ้าปูต้องเข้าออฟฟิศ มันจะมาสายเพราะอะไร?','เดินข้างผิดทาง','หาที่จอดรถไม่เจอ','ก้ามหนีบกระดุมเสื้อ'],
['q21','ถ้ามังกรเลิกพ่นไฟ มันจะทำอาชีพอะไร?','ช่างทำผม','พนักงานดับเพลิง','พ่อค้าปิ้งย่าง'],
['q22','อะไรควรเป็นหัวหน้าทีมมากกว่า?','แพนด้าง่วงนอน','กบถือคลิปบอร์ด','ยีราฟคอยาว'],
['q23','ถ้าแตงโมมีวันหยุด มันจะไปไหน?','สวนน้ำ','ร้านขายหมวก','ห้องแอร์เย็นเจี๊ยบ'],
['q24','ถ้านาฬิกาโกหก มันจะโกหกเรื่องอะไร?','ตอนนี้กี่โมง','เมื่อคืนกินอะไร','พรุ่งนี้วันจันทร์'],
['q25','ถ้ารองเท้าสองข้างทะเลาะกัน จะทะเลาะเรื่องอะไร?','ใครเหม็นกว่า','ใครเดินมากกว่า','ใครเหยียบโคลนก่อน'],
['q26','ถ้าปลาหมึกเล่นดนตรี มันจะเลือกเครื่องอะไร?','กลองแปดใบ','ขลุ่ยหนึ่งอัน','เปียโนสามหลัง'],
['q27','ถ้าหิมะมาเที่ยวกรุงเทพ สิ่งแรกที่จะซื้อคืออะไร?','พัดลม','น้ำแข็ง','เสื้อกันฝน'],
['q28','ถ้าหมอนหนีออกจากบ้าน มันจะไปซ่อนที่ไหน?','โรงหนัง','ร้านกาแฟ','ห้องสมุด'],
['q29','ถ้ากบถูกหวย มันจะซื้ออะไรก่อน?','สระว่ายน้ำส่วนตัว','รองเท้ากันฝน','ใบบัวติดแอร์'],
['q30','ถ้าตู้เย็นไปงานแต่ง มันจะเอาอะไรเป็นของขวัญ?','น้ำแข็งหนึ่งถุง','ไมโครเวฟ','แม่เหล็กติดประตู'],
['q31','ถ้าไดโนเสาร์หลุดมาในเมือง มันจะสมัครงานอะไร?','รถยกของ','ยามเฝ้าตึก','พนักงานต้อนรับ'],
['q32','ถ้าสมุดบันทึกมีความลับ มันจะบอกใคร?','ยางลบ','ดินสอ','กระเป๋าเป้'],
['q33','อะไรน่ากลัวที่สุดในตู้กับข้าว?','น้ำปลาที่จ้องตาคุณ','ถุงขนมที่พองลมเอง','ขวดซอสร้องเพลง'],
['q34','ถ้ากระบองเพชรเหงา มันจะทำอะไร?','กอดบอลลูน','ส่งไลน์หาดวงอาทิตย์','ปลูกดอกไม้บนหัว'],
['q35','ถ้าคอมพิวเตอร์งอน มันจะแกล้งคุณยังไง?','เปลี่ยนภาษาเป็นเอเลี่ยน','เปิดเพลงลูกทุ่งตอนประชุม','พิมพ์คำว่าอิอิทุกประโยค'],
['q36','ถ้ายีราฟนั่งเครื่องบิน มันจะเลือกที่นั่งตรงไหน?','เปิดหน้าต่างโผล่หัวออกไป','แถวหน้าสุดติดห้องน้ำ','ใต้ท้องเครื่องบิน'],
['q37','อะไรควรได้รับรางวัลพนักงานดีเด่น?','ปลั๊กสามตาที่เสียบสิบอย่าง','เก้าอี้หมุนที่ไม่เคยหยุด','แก้วกาแฟที่ไม่มีวันหมด'],
['q38','ถ้ากระจกมองเห็นอนาคต มันจะโชว์อะไรให้คุณดู?','หน้าคุณตอนหาว','ทรงผมตอนตื่นนอน','เมนูมื้อเย็น'],
['q39','ถ้ากาน้ำร้อนโมโห มันจะทำอะไร?','หวีดร้องเสียงแหลม','พ่นไอน้ำเป็นรูปหัวใจ','ปิดสวิตช์ตัวเอง'],
['q40','ถ้าชานมไข่มุกอยากไปเที่ยวอวกาศ มันจะพกอะไรไป?','หลอดดูดยักษ์','น้ำแข็งแก้วใหญ่','บราวน์ชูการ์กันรังสี']
];

export const QUESTIONS: readonly Question[] = RAW.map(
  ([id, prompt, optionA, optionB, optionC]) => ({ id, prompt, optionA, optionB, optionC }),
);

/** The live source. Kept out of the pure functions' defaults so a test never reaches it by accident. */
export const liveRng: Rng = { next: () => Math.random() };

/** Walks `values` once, then answers `fallback` forever. A test that only cares about a couple of
 *  draws does not have to predict how many the shuffles will take. */
export function makeSeq(values: readonly number[], fallback = 0.37): Rng {
  let i = 0;
  return { next: () => (i < values.length ? values[i++]! : fallback) };
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function randomChoice(rng: Rng): Choice {
  const v = rng.next();
  return v < 1 / 3 ? 'A' : v < 2 / 3 ? 'B' : 'C';
}

export function sanitizeName(value: unknown, i: number): string {
  const v = String(value ?? '').trim();
  return v || `ผู้เล่น ${i + 1}`;
}

export function playerById(state: Match, id: string): Player | undefined {
  return state.players.find((p) => p.id === id);
}

export function currentPlayer(state: Match): Player | undefined {
  return playerById(state, state.turnOrder[state.currentTurnIndex]!);
}

/** Deals one question per player and a fresh 1..10 growth pool. Called at the start of a round and
 *  again after an all-safe reroll, which is why it resets the turn cursor and the answered flags. */
export function assignRound(state: Match): void {
  const available = shuffle(QUESTIONS, state.rng);
  state.remainingGrowthValues = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], state.rng);
  state.usedQuestionIds = [];
  state.currentTurnIndex = 0;
  for (const id of state.turnOrder) {
    const p = playerById(state, id);
    if (!p) continue;
    // Skip the question this player was just asked. findIndex can only miss when one question is
    // left and it is theirs, which needs a 40-player round; falling back to 0 keeps the round moving.
    let idx = available.findIndex((q) => q.id !== p.lastQuestionId);
    if (idx < 0) idx = 0;
    const q = available.splice(idx, 1)[0]!;
    p.lastQuestionId = q.id;
    p.assignedQuestionId = q.id;
    p.assignedCorrectChoice = randomChoice(state.rng);
    p.selectedChoice = null;
    p.answered = false;
    p.wasCorrect = false;
    state.usedQuestionIds.push(q.id);
  }
}

export function makeMatch(names: readonly string[], rng: Rng = liveRng): Match {
  const players: Player[] = names.map((name, i) => ({
    id: `p${i + 1}`,
    name: sanitizeName(name, i),
    nose: 0,
    answered: false,
    lastQuestionId: null,
    assignedQuestionId: '',
    assignedCorrectChoice: 'A',
    selectedChoice: null,
    wasCorrect: false,
  }));
  const state: Match = {
    phase: PHASE.PASS,
    players,
    turnOrder: shuffle(players.map((p) => p.id), rng),
    currentTurnIndex: 0,
    remainingGrowthValues: [],
    usedQuestionIds: [],
    rerollRound: 1,
    rng,
  };
  assignRound(state);
  return state;
}

/** Records one player's pick. Returns false — changing nothing — when the tap was not a legal answer,
 *  which is what makes a double-tap on the same button harmless. */
export function resolveChoice(state: Match, choice: string): boolean {
  if (state.phase !== PHASE.QUESTION || !['A', 'B', 'C'].includes(choice)) return false;
  const p = currentPlayer(state);
  if (!p || p.answered) return false;
  p.answered = true;
  p.selectedChoice = choice as Choice;
  p.wasCorrect = choice === p.assignedCorrectChoice;
  if (!p.wasCorrect) {
    const growth = state.remainingGrowthValues.shift();
    if (!Number.isInteger(growth)) throw new Error('Growth pool exhausted');
    p.nose = growth as number;
  }
  state.phase = PHASE.REVEAL;
  return true;
}

/** The one maximum, and the FIRST of them on a tie. The pool deals distinct values so a tie needs a
 *  caller to set the noses, but the comparison stays strict rather than relying on that. */
export function getLoser(state: Match): Player | null {
  return state.players.reduce<Player | null>(
    (worst, p) => (!worst || p.nose > worst.nose ? p : worst),
    null,
  );
}

/** Ends the round. Null is not "no answer yet" — it is the real outcome where every nose stayed 0 and
 *  the group has to play again, which is why the phase is ALL_SAFE rather than RESULTS. */
export function finishRound(state: Match): Player | null {
  if (state.players.every((p) => p.nose === 0)) {
    state.phase = PHASE.ALL_SAFE;
    return null;
  }
  state.phase = PHASE.RESULTS;
  return getLoser(state);
}

/** Hands the phone on, or ends the round when the last player has answered. Returns the loser only
 *  in the second case, so a null covers both "still playing" and "nobody lost" — the caller reads
 *  `state.phase` to tell them apart. */
export function advanceTurn(state: Match): Player | null {
  if (state.phase !== PHASE.TURN_RESULT) return null;
  if (state.currentTurnIndex < state.turnOrder.length - 1) {
    state.currentTurnIndex++;
    state.phase = PHASE.PASS;
    return null;
  }
  return finishRound(state);
}

/** The reroll every-nose-is-0 rounds offer. Deals a new round without clearing noses, which is safe
 *  precisely because ALL_SAFE means they are all 0 already. */
export function rerollAllSafe(state: Match): void {
  if (state.phase !== PHASE.ALL_SAFE) return;
  state.rerollRound++;
  assignRound(state);
  state.phase = PHASE.PASS;
}

let stageEl: HTMLElement | null = null;

// Named render* so scripts/arm-gate-coverage-check.mjs can see it. It builds no <button>, so there is
// nothing for armAllButtons to gate — the one control here is the chrome link GameLayout.astro puts
// above the stage, which is where ADR-0014 allows a navigation target.
function renderLanding(stage: HTMLElement): void {
  stage.replaceChildren();
  const card = el('div', '');
  card.className = 'stage-screen';
  card.appendChild(el('p', 'เกมนี้เล่นเต็มจอ กดปุ่ม "เล่นเต็มจอ" ด้านบนเพื่อเริ่ม'));
  card.appendChild(el('p', 'ชื่อคนในวงที่ใส่ไว้จะถูกส่งไปให้อัตโนมัติ ไม่ต้องพิมพ์ใหม่'));
  stage.appendChild(card);
}

function mountInto(stage: HTMLElement, _ctx: GameContext): void {
  stageEl = stage;
  renderLanding(stage);
}

function teardown(): void {
  stageEl?.replaceChildren();
  stageEl = null;
}

const game: GameModule = {
  id: 'pinocchio-luck',
  names: { th: 'พิน็อคคิอวย', en: 'Pinocchio Luck' },
  category: 'party',
  players: [2, 10],
  startsRound: true,
  keywords: [
    'พิน็อคคิอวย',
    'เกมจมูกยาว',
    'เกมตอบคำถาม',
    'เกมส่งมือถือ',
    'เกมปาร์ตี้',
    'เกมกลุ่มเล่นฟรี',
    'เกมเล่นบนเครื่องเดียว',
  ],
  tagline: 'ตอบคำถามคนละข้อ ตอบผิดจมูกยาว ใครยาวสุดคนนั้นโดน',
  seo: {
    title: 'พิน็อคคิอวย — เกมตอบคำถามจมูกยาวสายดวง เล่นฟรีบนเครื่องเดียว',
    description:
      'ส่งมือถือวนทีละคน แต่ละคนตอบคำถามฮา ๆ คนละข้อ เลือกถูกรอด เลือกผิดจมูกยาวขึ้น พอครบทุกคนใครจมูกยาวสุดคนนั้นโดน เล่นได้ 2-10 คน ไม่ต้องโหลดแอป ไม่ต้องสมัคร',
    steps: [
      'ใส่ชื่อผู้เล่นทุกคน (2–10 คน)',
      'ส่งมือถือวนทีละคน แต่ละคนได้คำถามคนละข้อ เลือกคำตอบ 1 ใน 3',
      'เลือกถูกจมูกเท่าเดิม เลือกผิดจมูกยาวขึ้น',
      'ครบทุกคนแล้ว ใครจมูกยาวสุดคนนั้นโดน ถ้ารอดหมดทั้งวงสุ่มคำถามใหม่',
    ],
  },
  og: 'pinocchio-luck.png',
  ads: true,
  // The full-screen route this page hands off to. GameLayout.astro turns it into the chrome link.
  playRoute: '/game/pinocchio-luck/play/',

  mount(stage: HTMLElement, ctx: GameContext) {
    mountInto(stage, ctx);
  },

  dispose() {
    teardown();
  },
};

export default game;
