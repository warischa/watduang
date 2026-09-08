// The manifest entry for "กับระเบิด" (ONE BOMB), a full-screen play route.
//
// NO ROUND RULE LIVES HERE. The engine is the lifted mockup under src/play/one-bomb/, and this
// module is the landing shape docs/agents/play-route-recipe.md step 6 prescribes: manifest fields,
// playRoute, and a landing render that nothing on this site currently reaches, because
// getStaticPaths() in src/pages/game/[id].astro builds a landing only for a game with NO playRoute
// (ADR-0050 ruling 2). It stays because GameModule requires mount/dispose and because the manifest
// entry is what puts the card on the hub and what scripts/make-og.mjs resolves.
//
// The Thai name is the owner's own wording (2026-09-06) and is verbatim: it is not derived from the
// mockup's English logo or from its subtitle, and it is not a translation of either.
//
// This module knows nothing about the shared roster or the shared cast (gh#140). Identity and names
// reach the route through src/play/one-bomb/main.ts, which imports the seat range from here — that
// direction, and only that direction.
import type { GameContext, GameModule } from './types.ts';
import { el } from './_el.ts';

/** This game's own seat range, read off the mockup's setup stepper rather than off the site-wide
 *  ceiling: the stepper moves between exactly these two bounds. The BOARD is not fixed — it grows
 *  with the party, from the smallest grid at two players to the largest one at ten — so no copy on
 *  this route may name a stone count. The grid itself lives in the play route's own BOARD_GRID. */
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;

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
  id: 'one-bomb',
  names: { th: 'กับระเบิด', en: 'One Bomb' },
  category: 'party',
  players: [MIN_PLAYERS, MAX_PLAYERS],
  renderer: 'webgl',
  startsRound: true,
  keywords: [
    'กับระเบิด',
    'เกมเปิดแผ่นหิน',
    'เกมส่งมือถือ',
    'เกมปาร์ตี้',
    'เกมกลุ่มเล่นฟรี',
    'เกมเล่นบนเครื่องเดียว',
  ],
  tagline: 'ผลัดกันเปิดแผ่นหินบนกระดาน ใต้กระดานมีระเบิดซ่อนอยู่ลูกเดียว ใครเปิดเจอ คนนั้นแพ้',
  seo: {
    title: 'กับระเบิด — เกมเปิดแผ่นหินส่งมือถือ ลุ้นระเบิดลูกเดียว เล่นฟรีบนเครื่องเดียว',
    description:
      'เกมปาร์ตี้ส่งมือถือวนทีละคน กระดานแผ่นหินขยายตามจำนวนคนในวง และมีระเบิดซ่อนอยู่ใต้กระดานเพียง 1 ลูก ผลัดกันแตะเปิดทีละแผ่น ใครเปิดเจอระเบิด คนนั้นแพ้รอบนั้น คนที่รอดได้แต้ม เล่นได้ 2-10 คน ไม่ต้องโหลดแอป ไม่ต้องสมัคร',
    steps: [
      'เลือกจำนวนผู้เล่น 2-10 คน และตั้งชื่อคนในวงได้',
      'ระบบซ่อนระเบิด 1 ลูกไว้ใต้แผ่นหินแผ่นใดแผ่นหนึ่งบนกระดาน ยิ่งคนเยอะกระดานยิ่งกว้าง',
      'ส่งมือถือวนทีละคน แต่ละคนแตะเปิดแผ่นหิน 1 แผ่นในตาของตัวเอง',
      'ใครเปิดเจอระเบิด คนนั้นแพ้ในรอบนั้น คนที่รอดได้แต้มคนละ 1 แต้ม',
    ],
  },
  og: 'one-bomb.png',
  ads: true,
  playRoute: '/game/one-bomb/play/',

  mount(stage: HTMLElement, ctx: GameContext) {
    mountInto(stage, ctx);
  },

  dispose() {
    teardown();
  },
};

export default game;
