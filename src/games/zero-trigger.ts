// The manifest entry for "แตะหยุดเวลา" (ZERO TRIGGER), a full-screen play route.
//
// NO ROUND RULE LIVES HERE. The whole engine is the lifted mockup under src/play/zero-trigger/, and
// this module is the landing shape docs/agents/play-route-recipe.md step 6 prescribes: manifest
// fields, playRoute, and a landing render that nothing on this site currently reaches, because
// getStaticPaths() in src/pages/game/[id].astro builds a landing only for a game with NO playRoute
// (ADR-0050 ruling 2). It stays because GameModule requires mount/dispose and because the manifest
// entry is what puts the card on the hub and what scripts/make-og.mjs resolves.
//
// This module knows nothing about the shared roster or the shared cast (gh#140). Identity and names
// reach the mockup through src/play/zero-trigger/roster-bridge.ts, which imports MAX_PLAYERS from
// here — that direction, and only that direction.
import type { GameContext, GameModule } from './types.ts';
import { el } from './_el.ts';

/** This game's own seat range. The mockup's setup screen adds and removes seats between exactly
 *  these two bounds and its own badge reads "N / 10", so 10 is read off the mockup rather than off
 *  the site-wide ceiling of 20, which this game simply does not use. That ceiling is ruling 5 of gh#142,
 *  cited here by ticket on purpose: gh#142's ADR was written on an unmerged branch and the number it
 *  claims is taken on main by an unrelated ADR, so the ticket is the only address that resolves. */
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
  id: 'zero-trigger',
  names: { th: 'แตะหยุดเวลา', en: 'Zero Trigger' },
  category: 'party',
  players: [MIN_PLAYERS, MAX_PLAYERS],
  startsRound: true,
  keywords: [
    'แตะหยุดเวลา',
    'เกมจับจังหวะ',
    'เกมส่งมือถือ',
    'เกมปาร์ตี้',
    'เกมกลุ่มเล่นฟรี',
    'เกมเล่นบนเครื่องเดียว',
  ],
  tagline: 'ผลัดกันแตะหยุดนาฬิกา ใครหยุดโดนเลขต้องห้ามประจำรอบ คนนั้นแพ้',
  seo: {
    title: 'แตะหยุดเวลา — เกมจับจังหวะส่งมือถือ ลุ้นเลขต้องห้าม เล่นฟรีบนเครื่องเดียว',
    description:
      'เกมจับจังหวะส่งมือถือวนทีละคน ระบบสุ่มเลขต้องห้าม 1 ตัวให้ทั้งวง แต่ละคนแตะหยุดนาฬิกาจับเวลา ถ้าเลขท้ายที่หยุดได้ตรงกับเลขต้องห้าม คนนั้นแพ้ มี 3 ระดับความเร็ว เล่นได้ 2-10 คน ไม่ต้องโหลดแอป ไม่ต้องสมัคร',
    steps: [
      'เลือกจำนวนผู้เล่น 2-10 คน ตั้งชื่อและเลือกตัวการ์ตูนประจำตัวได้',
      'ระบบสุ่มเลขต้องห้าม 1 ตัว (0-9) ให้ทุกคนในวงเหมือนกัน',
      'ส่งมือถือวนทีละคน แต่ละคนแตะหน้าจอเพื่อหยุดนาฬิกา',
      'ใครหยุดแล้วเลขท้ายตรงกับเลขต้องห้าม คนนั้นแพ้และรับบทลงโทษ',
    ],
  },
  og: 'zero-trigger.png',
  ads: true,
  playRoute: '/game/zero-trigger/play/',

  mount(stage: HTMLElement, ctx: GameContext) {
    mountInto(stage, ctx);
  },

  dispose() {
    teardown();
  },
};

export default game;
