// The manifest entry for croc-bite, a full-screen play route (party category, gh#213).
//
// Same shape as the other playRoute landing modules: no round rule lives here, the engine is the
// lifted mockup under src/play/croc-bite/, and this module carries only manifest fields, playRoute,
// and a landing render — docs/agents/play-route-recipe.md step 6.
//
// Seat range: this game declares [MIN_PLAYERS, MAX_PLAYERS] = [2, 6], not the party default of
// [2, 10] most other party modules use. That is a deliberate per-game choice, not an omission —
// see docs/adr/0065-the-party-size-range-is-per-game-not-a-property-of-the-category.md before
// changing either bound.
//
// This module knows nothing about the shared roster or the shared cast. Identity and names reach
// the route through src/play/croc-bite/main.ts, which imports the seat range from here.
import type { GameContext, GameModule } from './types.ts';
import { el } from './_el.ts';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

// ---- The landing module ----

let stageEl: HTMLElement | null = null;

// Named render* so scripts/arm-gate-coverage-check.mjs can see it. It builds no <button>, so there
// is nothing for armAllButtons to gate.
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
  id: 'croc-bite',
  names: { th: 'จระเข้งับ', en: 'Croc Bite' },
  category: 'party',
  players: [MIN_PLAYERS, MAX_PLAYERS],
  renderer: 'webgl',
  startsRound: true,
  keywords: [
    'จระเข้งับ',
    'เกมกดฟันจระเข้',
    'เกมส่งมือถือ',
    'เกมปาร์ตี้',
    'เกมกลุ่มเล่นฟรี',
    'เกมเล่นบนเครื่องเดียว',
  ],
  tagline: 'เกมปาร์ตี้ 3D · ผลัดกันกดฟันล่าผู้แพ้!',
  seo: {
    title: 'จระเข้งับ — เกมกดฟันจระเข้ส่งมือถือ ลุ้นซี่ที่งับ เล่นฟรีบนเครื่องเดียว',
    description: 'จระเข้งับ — เกมกดฟันจระเข้ส่งมือถือ ลุ้นซี่ที่งับ เล่นฟรีบนเครื่องเดียว',
    steps: [
      'ฟันปลอดภัย: ฟันจะหัก, จม, หรือหลุดลงน้ำอย่างสนุกสนาน พร้อมส่งตาต่อไปให้เพื่อน',
      'ฟันเข้งับ: จระเข้จะงับมือทันที! คนที่โดนงับจะแพ้ในรอบนั้น',
      'ระบบสะสมแต้ม: ผู้เล่นทุกคนที่รอดชีวิตจะได้ +1 แต้ม แข่งขันกันครบ 5 รอบเพื่อหาแชมป์ปาร์ตี้!',
      'มาตรวัดความเสี่ยง: ยิ่งจิ้มฟันออกไปมาก โอกาสโดนงับจะยิ่งพุ่งสูงขึ้นแบบเรียลไทม์!',
    ],
  },
  og: 'croc-bite.png',
  ads: true,
  playRoute: '/game/croc-bite/play/',

  mount(stage: HTMLElement, ctx: GameContext) {
    mountInto(stage, ctx);
  },

  dispose() {
    teardown();
  },
};

export default game;
