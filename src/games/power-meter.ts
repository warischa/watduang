// The power-meter landing page. The game itself is NOT here — it runs full screen at the route named in
// `playRoute` below, where the original mockup's own engine, art and controls run unmodified
// (src/play/power-meter/, extracted by scripts/extract-mockup.mjs).
//
// WHY THE GAME LEFT THIS FILE. The ported module never shipped: it sat UNWIRED with three must-fix
// defects and seven surviving mutants (docs/verification/power-meter-build-findings.md). Two of the
// three defects were structural — the painted bar and the recorded score ran on two different code
// paths and disagreed by up to 0.41, and the spark canvas drew into a detached context after the
// first attempt. Fixing them meant rebuilding the scoring path that the mockup already gets right by
// construction. 1056 lines of engine, 1060 of its tests and 422 of its stylesheet are deleted with
// this change, not archived: the mockup they were ported from is the artifact now, and two
// implementations of one game is a debt paid at every future edit. gh#136.
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
  id: 'power-meter',
  names: { th: 'วัดพลัง', en: 'Power Meter' },
  category: 'party',
  players: [2, 10],
  startsRound: true,
  keywords: ['วัดพลัง', 'เกมส่งมือถือ', 'เกมปาร์ตี้', 'เกมกลุ่มเล่นฟรี', 'เกมเล่นบนเครื่องเดียว'],
  tagline: 'แตะหยุดเกจพลังคนละ 3 ครั้ง ใครคะแนนรวมน้อยที่สุดคนนั้นโดน',
  seo: {
    title: 'วัดพลัง — เกมส่งมือถือแตะหยุดเกจพลัง เล่นฟรีบนเครื่องเดียว',
    description:
      'ส่งมือถือวนทีละคน แตะปล่อยเกจพลังแล้วแตะหยุดให้ใกล้ 10.00 ที่สุด คนละ 3 ครั้ง รวมเต็ม 30.00 ใครคะแนนรวมน้อยที่สุดคนนั้นโดน เล่นได้ 2-10 คน ไม่ต้องโหลดแอป ไม่ต้องสมัคร',
    steps: [
      'ใส่ชื่อผู้เล่นทุกคน (2–10 คน) แล้วส่งมือถือวนทีละคน',
      'แตะปล่อยเกจแล้วแตะหยุด ยิ่งใกล้ 10.00 ยิ่งได้คะแนนสูง เลย 10.00 เกจจะร่วงลงมาอย่างรวดเร็ว',
      'คนละ 3 ครั้ง รวมเต็ม 30.00 ใครคะแนนรวมน้อยที่สุดคนนั้นโดน เสมอกันแข่งใหม่เฉพาะคนที่เสมอกัน',
    ],
  },
  og: 'power-meter.png',
  // The how-to-play prose below the stage is ad inventory: the decision was no slot on the PLAY
  // SCREEN, never no slot on the page.
  ads: true,
  // The full-screen route this page hands off to. GameLayout.astro turns it into the chrome link.
  playRoute: '/game/power-meter/play/',

  mount(stage: HTMLElement, ctx: GameContext) {
    mountInto(stage, ctx);
  },

  dispose() {
    teardown();
  },
};

export default game;
