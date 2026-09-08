// The manifest entry for "บางกอกดริฟต์", a full-screen play route.
//
// NO ROUND RULE LIVES HERE. The whole engine is the lifted mockup under src/play/bangkok-drift/, and
// this module is the landing shape docs/agents/play-route-recipe.md step 6 prescribes: manifest
// fields, playRoute, and a landing render that nothing on this site currently reaches, because
// getStaticPaths() in src/pages/game/[id].astro builds a landing only for a game with NO playRoute
// (ADR-0050 ruling 2). It stays because GameModule requires mount/dispose and because the manifest
// entry is what puts the card on the hub and what scripts/make-og.mjs resolves.
//
// This module knows nothing about the shared roster or the shared cast (gh#140). Identity and names
// reach the mockup through src/play/bangkok-drift/roster-bridge.ts, which imports MAX_PLAYERS from
// here — that direction, and only that direction.
import type { GameContext, GameModule } from './types.ts';
import { el } from './_el.ts';

/** This game's own seat range. The mockup's setup screen steps between exactly these two bounds —
 *  its own stepper refuses to go below the first or above the second — so seeding past them would
 *  silently drop names. Read off the mockup rather than off any site-wide ceiling. */
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
  id: 'bangkok-drift',
  names: { th: 'บางกอกดริฟต์', en: 'Bangkok Drift' },
  category: 'party',
  players: [MIN_PLAYERS, MAX_PLAYERS],
  renderer: 'canvas2d',
  startsRound: true,
  keywords: [
    'บางกอกดริฟต์',
    'เกมขับรถ',
    'เกมหลบสิ่งกีดขวาง',
    'เกมส่งมือถือ',
    'เกมปาร์ตี้',
    'เกมกลุ่มเล่นฟรี',
  ],
  tagline: 'ผลัดกันขับรถบนสนามเดียวกัน ใครไปได้สั้นที่สุด คนนั้นโดน',
  seo: {
    title: 'บางกอกดริฟต์ — เกมขับรถหลบสิ่งกีดขวาง ผลัดกันเล่นบนเครื่องเดียว',
    description:
      'เกมขับรถส่งมือถือวนทีละคน ทุกคนได้ถนนเส้นเดียวกันเป๊ะๆ แตะครึ่งจอซ้ายขวาเพื่อหลบก้อนหิน กรวย หนองน้ำ และเปลือกกล้วย ใครขับได้ไกลที่สุดชนะ ใครสั้นที่สุดโดน เล่นได้ 2-10 คน ไม่ต้องโหลดแอป ไม่ต้องสมัคร',
    steps: [
      'เลือกจำนวนผู้เล่น 2-10 คน ตั้งชื่อได้หรือใช้ชื่อสัตว์ประจำตัว',
      'ระบบสุ่มถนนหนึ่งเส้นให้ทั้งวง ทุกคนขับสนามเดียวกัน',
      'ส่งมือถือวนทีละคน แตะครึ่งจอซ้ายหรือขวาเพื่อเลี้ยวหลบสิ่งกีดขวาง',
      'ชนก้อนหิน ชนกรวย หรือหลุดถนนคือจบตา ใครไปได้สั้นที่สุดคนนั้นโดน',
    ],
  },
  og: 'bangkok-drift.png',
  ads: true,
  playRoute: '/game/bangkok-drift/play/',

  mount(stage: HTMLElement, ctx: GameContext) {
    mountInto(stage, ctx);
  },

  dispose() {
    teardown();
  },
};

export default game;
