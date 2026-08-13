// เซียมซีปาร์ตี้ — ส่งมือถือวนกัน แต่ละคนจั่วดวงหนึ่งใบ ครบทุกคนแล้วดูสรุป
// นามสกุล .ts ในเส้นทาง import จำเป็นสำหรับ `node --test` (Node ไม่เดานามสกุลให้) — Vite/tsc รับได้ทั้งคู่
import type { GameContext, GameModule } from './types.ts';

// ---- ดวงชะตา + deck: ส่วนที่คำนวณได้ล้วน ทดสอบได้โดยไม่ต้องมี DOM (ดู siamsi.test.mjs) ----

export interface Fortune {
  number: number;
  text: string;
  prompt: string;
}

// deck คงที่ 24 ใบ — ห้ามพาดพิงแอลกอฮอล์/การพนัน/เลขเสี่ยงโชคที่ตีความเป็นตัวเลขทำนายเงินได้
export const FORTUNES: readonly Fortune[] = [
  { number: 1, text: 'วันนี้ดวงเฮง ยิ้มไว้เดี๋ยวโชคตามมาเอง', prompt: 'ให้คนทางซ้ายทายว่าจริงไหม' },
  { number: 2, text: 'มีคนแอบชื่นชมคุณอยู่เงียบๆ', prompt: 'ให้ทุกคนช่วยกันเดาว่าใคร' },
  { number: 3, text: 'วันนี้เหมาะกับการเริ่มอะไรใหม่ๆ', prompt: 'บอกวงว่าอยากเริ่มอะไร' },
  { number: 4, text: 'โชคดีเรื่องเพื่อนฝูง มีคนคอยช่วยเสมอ', prompt: 'ชี้คนในวงที่ช่วยคุณบ่อยที่สุด' },
  { number: 5, text: 'ระวังลืมของ วันนี้ใจลอยหน่อย', prompt: 'เช็กกระเป๋าตัวเองตอนนี้เลย' },
  { number: 6, text: 'พูดอะไรวันนี้มีคนฟังเป็นพิเศษ', prompt: 'พูดประโยคเด็ดให้วงฟังหนึ่งประโยค' },
  { number: 7, text: 'ดวงเรื่องกินดี วันนี้ได้กินของอร่อยแน่นอน', prompt: 'บอกวงว่าอยากกินอะไรที่สุดตอนนี้' },
  { number: 8, text: 'มีเรื่องเซอร์ไพรส์เล็กๆ รอคุณอยู่', prompt: 'ให้คนทางขวาทายว่าเซอร์ไพรส์อะไร' },
  { number: 9, text: 'วันนี้เหมาะกับการขอโทษหรือขอบคุณใครสักคน', prompt: 'พูดขอบคุณคนในวงหนึ่งคนตอนนี้' },
  { number: 10, text: 'ดวงเดินทางดี ไปไหนก็ราบรื่น', prompt: 'บอกที่ที่อยากไปที่สุดตอนนี้' },
  { number: 11, text: 'จะได้ยินข่าวดีในไม่ช้า', prompt: 'ให้วงช่วยกันเดาว่าข่าวดีเรื่องอะไร' },
  { number: 12, text: 'วันนี้ควรพักผ่อนให้เต็มที่ อย่าฝืนตัวเอง', prompt: 'บอกวงว่าจะพักผ่อนยังไงคืนนี้' },
  { number: 13, text: 'มีโอกาสได้เจอเพื่อนเก่า', prompt: 'เอ่ยชื่อเพื่อนเก่าที่คิดถึงที่สุด' },
  { number: 14, text: 'ดวงความคิดสร้างสรรค์พุ่งแรง', prompt: 'เล่าไอเดียล่าสุดที่คิดได้ให้วงฟัง' },
  { number: 15, text: 'วันนี้เหมาะกับการเคลียร์ใจกับใครสักคน', prompt: 'ชี้คนที่อยากเคลียร์ใจด้วยที่สุด' },
  { number: 16, text: 'จะมีคนชวนไปทำกิจกรรมสนุกๆ', prompt: 'บอกกิจกรรมที่อยากชวนวงไปทำ' },
  { number: 17, text: 'ดวงเรื่องงาน/เรียนกำลังไปได้สวย', prompt: 'บอกวงว่ากำลังทำอะไรอยู่ตอนนี้' },
  { number: 18, text: 'วันนี้ใจดีเป็นพิเศษ ใครขออะไรก็ใจอ่อน', prompt: 'ให้คนข้างๆ ขออะไรสักอย่างจากคุณ' },
  { number: 19, text: 'มีเรื่องตลกรอให้เล่าในวันนี้', prompt: 'เล่าเรื่องตลกล่าสุดที่เจอมาให้วงฟัง' },
  { number: 20, text: 'ดวงเฮงเรื่องของหาย จะเจอของที่ตามหาอยู่', prompt: 'บอกของที่หาไม่เจอมานานที่สุด' },
  { number: 21, text: 'วันนี้เหมาะกับการชมคนรอบตัว', prompt: 'ชมคนทางขวามือหนึ่งคำ' },
  { number: 22, text: 'จะได้ทำอะไรที่ไม่เคยทำมาก่อน', prompt: 'บอกวงว่าอยากลองอะไรใหม่' },
  { number: 23, text: 'ดวงความสัมพันธ์กำลังดี รักษาไว้ให้ดี', prompt: 'บอกคนที่อยากดูแลความสัมพันธ์ด้วยมากที่สุด' },
  { number: 24, text: 'วันนี้โชคเข้าข้าง ลองอะไรใหม่ๆ ได้เลย', prompt: 'ให้วงโหวตว่าคุณควรลองอะไรต่อ' },
];

/** สับ index ของ deck ทั้งหมดแล้วตัดมาแค่จำนวนผู้เล่น — รับประกันไม่ซ้ำและหมดพอดีเมื่อจั่วครบทุกคน */
export function buildDeck(playerCount: number, rand: () => number = Math.random): number[] {
  // ถ้าคนเยอะกว่าใบในกอง slice จะเงียบๆ คืนน้อยกว่าที่ขอ แล้วคนท้ายๆ จะจั่วจากกองว่าง
  // ให้ดังตรงนี้แทน — เกมที่ประกาศ players.max > จำนวนใบ ต้องรู้ตอน build ไม่ใช่ตอนผู้เล่นกด
  if (playerCount > FORTUNES.length) {
    throw new Error(`siamsi: ผู้เล่น ${playerCount} คน มากกว่าใบเซียมซี ${FORTUNES.length} ใบ`);
  }
  const order = FORTUNES.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order.slice(0, playerCount);
}

/** จั่วใบบนสุดของ deck — คืนดวงที่จั่วได้และ deck ที่เหลือ (ไม่แก้ไข array เดิม) */
export function draw(deck: readonly number[]): { fortune: Fortune; remaining: number[] } {
  if (deck.length === 0) throw new Error('deck is empty — reshuffle before drawing');
  const [next, ...remaining] = deck;
  return { fortune: FORTUNES[next], remaining };
}

/** ผู้เล่นคนที่ current เพิ่งจั่วเสร็จ — คืนคนถัดไปและบอกว่ารอบจบหรือยัง */
export function nextTurn(current: number, playerCount: number): { index: number; roundOver: boolean } {
  const next = current + 1;
  if (next >= playerCount) return { index: 0, roundOver: true };
  return { index: next, roundOver: false };
}

// ---- สถานะรอบปัจจุบัน (มีเกมเดียวต่อหนึ่งหน้า) ----

type Phase = 'idle' | 'turn' | 'drawn' | 'summary';

let cleanup: Array<() => void> = [];
let phase: Phase = 'idle';
let stageEl: HTMLElement | null = null;
let gameCtx: GameContext | null = null;
let players: string[] = [];
let deck: number[] = [];
let holder = 0;
let drawnThisTurn: Fortune | null = null;
let results: { player: string; fortune: Fortune }[] = [];

function on(target: EventTarget, type: string, handler: EventListener): void {
  target.addEventListener(type, handler);
  cleanup.push(() => target.removeEventListener(type, handler));
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  style?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (style) node.setAttribute('style', style);
  return node;
}

// ---- หน้าจอ ----

function renderIdle(): void {
  const stage = stageEl;
  if (!stage) return;
  stage.replaceChildren();

  const names = gameCtx?.session.players ?? [];
  stage.appendChild(el('p', `วง ${names.length || '-'} คน — ส่งมือถือวนไปเรื่อยๆ`));
  stage.appendChild(el('p', 'แต่ละคนจั่วดวงคนละหนึ่งใบ ครบทุกคนแล้วดูสรุปท้ายรอบ'));

  const startBtn = el('button', 'เริ่มจั่วดวง');
  startBtn.id = 'ss-start';
  startBtn.type = 'button';
  on(startBtn, 'click', startRound);
  stage.appendChild(startBtn);
}

function renderTurn(): void {
  const stage = stageEl;
  if (!stage) return;
  stage.replaceChildren();

  stage.appendChild(el('p', `ตาของ ${players[holder]}`, 'font-size:1.5rem;font-weight:700'));
  stage.appendChild(el('p', 'ส่งมือถือให้คนนี้ แล้วกดจั่วดวง'));

  const drawBtn = el('button', 'จั่วดวง');
  drawBtn.id = 'ss-draw';
  drawBtn.type = 'button';
  on(drawBtn, 'click', drawForHolder);
  stage.appendChild(drawBtn);
}

function renderDrawn(): void {
  const stage = stageEl;
  if (!stage || !drawnThisTurn) return;
  stage.replaceChildren();

  stage.appendChild(el('p', `ดวงที่ ${drawnThisTurn.number}`, 'font-weight:700'));
  stage.appendChild(el('p', drawnThisTurn.text, 'font-size:1.3rem;font-weight:700'));
  stage.appendChild(el('p', drawnThisTurn.prompt));

  const passBtn = el('button', 'ส่งต่อ');
  passBtn.id = 'ss-pass';
  passBtn.type = 'button';
  on(passBtn, 'click', passToNext);
  stage.appendChild(passBtn);
}

function renderSummary(): void {
  const stage = stageEl;
  if (!stage) return;
  stage.replaceChildren();

  stage.appendChild(el('p', 'ครบทุกคนแล้ว — สรุปดวงวันนี้', 'font-weight:700'));
  for (const r of results) {
    stage.appendChild(el('p', `${r.player}: ดวงที่ ${r.fortune.number} — ${r.fortune.text}`));
  }

  const again = el('button', 'เล่นอีกรอบ');
  again.id = 'ss-again';
  again.type = 'button';
  on(again, 'click', () => {
    const stageRef = stageEl;
    const ctxRef = gameCtx;
    teardown();
    if (stageRef && ctxRef) mountInto(stageRef, ctxRef);
  });
  stage.appendChild(again);

  const hub = el('a', 'กลับไปหน้ารวมเกม');
  hub.href = '/games/';
  stage.appendChild(hub);
}

// ---- วงจรของรอบ ----

function startRound(): void {
  if (phase !== 'idle') return;
  const roster = gameCtx?.session.players ?? [];
  players = roster.length > 0 ? [...roster] : ['คนที่ถือมือถือ'];
  deck = buildDeck(players.length);
  holder = 0;
  results = [];
  phase = 'turn';
  renderTurn();
}

function drawForHolder(): void {
  if (phase !== 'turn') return;
  const { fortune, remaining } = draw(deck);
  deck = remaining;
  drawnThisTurn = fortune;
  results.push({ player: players[holder], fortune });
  phase = 'drawn';
  renderDrawn();
}

function passToNext(): void {
  if (phase !== 'drawn') return;
  const { index, roundOver } = nextTurn(holder, players.length);
  holder = index;
  drawnThisTurn = null;
  if (roundOver) {
    gameCtx?.session.markPlayed('siamsi');
    phase = 'summary';
    renderSummary();
    return;
  }
  phase = 'turn';
  renderTurn();
}

function mountInto(stage: HTMLElement, ctx: GameContext): void {
  stageEl = stage;
  gameCtx = ctx;
  phase = 'idle';
  renderIdle();
}

function teardown(): void {
  phase = 'idle';
  cleanup.forEach((fn) => fn());
  cleanup = [];
  deck = [];
  players = [];
  results = [];
  drawnThisTurn = null;
  stageEl?.replaceChildren();
  stageEl = null;
  gameCtx = null;
}

const game: GameModule = {
  id: 'siamsi',
  names: { th: 'เซียมซีปาร์ตี้', en: 'Fortune Draw Party' },
  category: 'fortune',
  players: [2, 10],
  keywords: ['เซียมซี', 'ดูดวง', 'เกมส่งมือถือ', 'เกมปาร์ตี้', 'เกมกลุ่มเล่นฟรี', 'เกมเล่นบนเครื่องเดียว'],
  needs: [],
  tagline: 'ส่งมือถือวนรอบวง คนละใบ ใครได้ดวงอะไรบ้าง',
  seo: {
    title: 'เซียมซีปาร์ตี้ — เกมส่งมือถือดูดวงกันสนุกๆ เล่นฟรีบนเครื่องเดียว',
    description:
      'ส่งมือถือวนรอบวง แต่ละคนจั่วดวงคนละหนึ่งใบ พร้อมโจทย์สนุกๆ ให้วงเล่นต่อ เล่นได้ 2-10 คน ไม่ต้องโหลดแอป ไม่ต้องสมัคร',
    steps: [
      'นั่งเป็นวง เลือกจำนวนคนเล่นหรือเลือกชื่อจากกลุ่มเดิม แล้วกดเริ่มจั่วดวง',
      'ส่งมือถือให้คนที่ถึงตา กดจั่วดวงแล้วอ่านดวงที่ได้ให้วงฟัง',
      'ทำตามโจทย์ในการ์ดแล้วกด "ส่งต่อ" ให้คนถัดไปจั่วบ้าง',
      'พอครบทุกคนจะเห็นสรุปดวงทั้งวง กด "เล่นอีกรอบ" เพื่อสับดวงใหม่',
    ],
  },
  og: 'siamsi.png',
  ads: false, // จอเล่น = ห้ามมี ad slot เสมอ

  mount(stage: HTMLElement, ctx: GameContext) {
    mountInto(stage, ctx);
  },

  dispose() {
    teardown();
  },
};

export default game;
