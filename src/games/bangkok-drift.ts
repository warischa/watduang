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
// reach the route through the shared player screen (ADR-0071), which the route mounts with this
// manifest's `players` range — that direction, and only that direction.
import type { GameContext, GameModule } from './types.ts';
import { el } from './_el.ts';

/** This game's own seat range, the one the shared player screen clamps to (ADR-0071 ruling 2). Read
 *  off the mockup, whose own setup stepper refused to go below the first bound or above the second,
 *  rather than off any site-wide ceiling. */
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
  // gh#242, direction C set (IMG_03_013 in images/IMAGES.md).
  cardArt: 'bangkok-drift.webp',
  cardArt2x: 'bangkok-drift-2x.webp',
  ads: true,
  playRoute: '/game/bangkok-drift/play/',
  // gh#269: every first-screen element of the play route, classified -- gameplay roots are held by
  // the shared hold until the player screen hands over (scripts/first-screen-roots-check.mjs).
  firstScreenRoots: {
    '#app': 'container',
    '#bd-players': 'ps-mount',
    '#screen-turn': 'gameplay',
    '#screen-drive': 'gameplay',
    '#screen-result': 'gameplay',
    '#screen-final': 'gameplay',
    '#live': 'chrome',
  },

  mount(stage: HTMLElement, ctx: GameContext) {
    mountInto(stage, ctx);
  },

  dispose() {
    teardown();
  },
};

export default game;
