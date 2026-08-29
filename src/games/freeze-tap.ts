// The freeze-tap landing page. The game itself is NOT here — it runs full screen at the route named in
// `playRoute` below, where the original mockup's own engine, art and controls run unmodified
// (src/play/freeze-tap/, extracted by scripts/extract-mockup.mjs).
//
// WHY THE GAME LEFT THIS FILE. cannon-flag's port measured the same gap this game shares: a ported
// module rendered into a fixed-height box inside a scrolling document, against the mockup's own
// full-screen layout — not fixable by colour, because it is a stage drawn on the same ground as the
// page chrome. This file's own ported engine is deleted with this change, not archived: the mockup it
// was ported from is the artifact now, and two implementations of one game is a debt paid at every
// future edit.
//
// WHAT THIS PAGE STILL DOES, and why it is not a redirect: it is the crawlable surface. It carries
// the how-to-play prose, the HowTo JSON-LD and the ad slot, and SEO is this site's business model.
// The play route is the app view; this is the page a search result lands on.
import type { GameContext, GameModule } from './types.ts';
import { el } from './_el.ts';

let stageEl: HTMLElement | null = null;

// Named render* like every other screen builder in src/games/, so
// scripts/arm-gate-coverage-check.mjs can see it. It builds no <button>, so there is nothing for
// armAllButtons to gate — the one control on this page is the chrome link GameLayout.astro renders
// above the stage, which is where ADR-0014 puts a navigation target.
function renderLanding(stage: HTMLElement): void {
  stage.replaceChildren();
  const card = el('div', '');
  card.className = 'stage-screen';
  const line = el('p', 'เกมนี้เล่นเต็มจอ กดปุ่ม "เล่นเต็มจอ" ด้านบนเพื่อเริ่ม');
  card.appendChild(line);
  const hint = el('p', 'ชื่อคนในวงที่ใส่ไว้จะถูกส่งไปให้อัตโนมัติ ไม่ต้องพิมพ์ใหม่');
  card.appendChild(hint);
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
  id: 'freeze-tap',
  names: { th: 'มือลั่น', en: 'Freeze Tap' },
  category: 'party',
  players: [2, 10],
  startsRound: true,
  keywords: [
    'มือลั่น',
    'เกมวัดปฏิกิริยา',
    'เกมส่งมือถือ',
    'เกมปาร์ตี้',
    'เกมกลุ่มเล่นฟรี',
    'เกมเล่นบนเครื่องเดียว',
  ],
  tagline: 'แตะให้ไวที่สุด แตะก่อนสัญญาณคือแพ้ทันที',
  seo: {
    title: 'มือลั่น — เกมวัดปฏิกิริยาส่งมือถือ เล่นฟรีบนเครื่องเดียว',
    description:
      'ส่งมือถือวนกันทีละคน รอสัญญาณจริงแล้วแตะให้ไวที่สุด แตะก่อนสัญญาณคือมือลั่นแพ้ทันที ใครช้าสุดในวงคนนั้นโดน เล่นได้ 2-10 คน ไม่ต้องโหลดแอป ไม่ต้องสมัคร',
    steps: [
      'เลือกจำนวนคนเล่นในวง 2-10 คน',
      'ส่งมือถือวนทีละคน กดพร้อมแล้วก่อนเริ่มตาของตัวเอง',
      'จะมีสัญญาณหลอกโผล่มาก่อน แตะก่อนสัญญาณจริง = มือลั่น แพ้ทันที',
      'ครบทุกคนแล้วดูผล ใครช้าสุดคนนั้นโดน เท่ากันให้ดวลตัดสินอีกรอบ',
    ],
  },
  og: 'freeze-tap.png',
  ads: true,
  // The full-screen route this page hands off to. GameLayout.astro turns it into the chrome link.
  playRoute: '/game/freeze-tap/play/',

  mount(stage: HTMLElement, ctx: GameContext) {
    mountInto(stage, ctx);
  },

  dispose() {
    teardown();
  },
};

export default game;
