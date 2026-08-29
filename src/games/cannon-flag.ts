// The cannon-flag landing page. The game itself is NOT here — it runs full screen at the route named in
// `playRoute` below, where the original mockup's own engine, art and controls run unmodified
// (src/play/cannon-flag/, extracted by scripts/extract-mockup.mjs).
//
// WHY THE GAME LEFT THIS FILE. The ported module rendered into a 320px-tall box inside a scrolling
// document: 34% of a 375x812 screen against the mockup's 75.2%, on a page 1.72 screens tall against
// its 1. That gap is what made it not feel like a game, and it was not fixable by colour — it was a
// fixed height and a stage drawn on the same ground as the page chrome. 2086 lines of engine, 462 of
// its tests and 499 of its stylesheet are deleted with this change, not archived: the mockup they
// were ported from is the artifact now, and two implementations of one game is a debt paid at every
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
  id: 'cannon-flag',
  names: { th: 'ยิงธง', en: 'Cannon Flag' },
  category: 'party',
  players: [2, 10],
  startsRound: true,
  keywords: [
    'ยิงธง',
    'เกมยิงปืนใหญ่',
    'เกมส่งมือถือ',
    'เกมปาร์ตี้',
    'เกมกลุ่มเล่นฟรี',
    'เกมเล่นบนเครื่องเดียว',
  ],
  tagline: 'ดวลปืนใหญ่ผลัดกันยิง ใครห่างธงสุดคนนั้นโดน',
  seo: {
    title: 'ยิงธง — เกมปืนใหญ่ประลองความแม่นยำ เล่นฟรีบนเครื่องเดียว',
    description:
      'ผลัดกันส่งมือถือยิงปืนใหญ่ 2 นัดติดต่อกัน ปรับมุม กะแรงลม ชาร์จพลังให้ลงใกล้ฐานธงที่สุด ใครทำผลงานแย่สุดในวงคนนั้นโดน เล่นได้ 2-10 คน ไม่ต้องโหลดแอป ไม่ต้องสมัคร',
    steps: [
      'เลือกจำนวนคนเล่นในวง 2-10 คน',
      'ส่งมือถือวนทีละคน แต่ละคนจะได้ยิง 2 นัดติดต่อกัน',
      'ปรับมุม ชาร์จพลัง และกะแรงลมเพื่อยิงให้ใกล้ฐานธงที่สุด',
      'วัดผลจากนัดที่ใกล้ฐานธงที่สุด ใครห่างสุดคนนั้นโดน เสมอกันดวล Sudden Death',
    ],
  },
  og: 'cannon-flag.png',
  ads: true,
  // The full-screen route this page hands off to. GameLayout.astro turns it into the chrome link.
  playRoute: '/game/cannon-flag/play/',

  mount(stage: HTMLElement, ctx: GameContext) {
    mountInto(stage, ctx);
  },

  dispose() {
    teardown();
  },
};

export default game;
