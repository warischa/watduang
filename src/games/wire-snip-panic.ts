// The wire-snip-panic landing page. The game itself is NOT here — it runs full screen at the route named
// in `playRoute` below, where the original mockup's own engine, art and controls run unmodified
// (src/play/wire-snip-panic/, extracted by scripts/extract-mockup.mjs).
//
// NO ENGINE IN THIS FILE, on purpose. ADR-0050's run-as-is recipe ports the mockup whole: the round
// rule lives inside src/play/wire-snip-panic/main.js and has exactly one implementation. Two of them
// is a debt paid at every future edit, which is the lesson power-meter.ts records at length.
//
// WHAT THIS PAGE STILL DOES, and why it is not a redirect: it is the crawlable surface. It carries
// the how-to-play prose, the HowTo JSON-LD and the ad slot, and SEO is this site's business model.
// The play route is the app view; this is the page a search result lands on.
import type { GameContext, GameModule } from './types.ts';
import { el } from './_el.ts';

/** The seat range, which is this game's own number rather than a site-wide one. Both bounds are the
 *  mockup's: its setup screen is titled for 2-10 and its add-player handler refuses an eleventh seat.
 *  Exported because src/play/wire-snip-panic/roster-bridge.ts clamps the shared roster to the ceiling
 *  the rule states instead of restating it — that direction (play reads games) is the allowed one.
 *  The reverse would not be: gh#140 keeps every module under src/games unaware that a roster or a
 *  shared cast exists at all. */
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;

let stageEl: HTMLElement | null = null;

// Named render* like every other screen builder in src/games/, so
// scripts/arm-gate-coverage-check.mjs can see it. It builds no <button>, so there is nothing for
// armAllButtons to gate — the one navigation target on this page is the chrome link rendered above
// the stage, which is where ADR-0014 puts one.
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
  id: 'wire-snip-panic',
  names: { th: 'ตัดสายกู้ชีพ', en: 'Wire Snip Panic' },
  category: 'party',
  players: [MIN_PLAYERS, MAX_PLAYERS],
  startsRound: true,
  keywords: [
    'ตัดสายกู้ชีพ',
    'เกมกู้ระเบิด',
    'เกมจำลำดับ',
    'เกมส่งมือถือ',
    'เกมปาร์ตี้',
    'เกมกลุ่มเล่นฟรี',
    'เกมเล่นบนเครื่องเดียว',
  ],
  tagline: 'จำลำดับไฟที่กระพริบ แล้วตัดสายให้ถูกลำดับก่อนหมดเวลา ใครพลาดคนนั้นโดน',
  seo: {
    title: 'ตัดสายกู้ชีพ — เกมกู้ระเบิดจำลำดับสายไฟ ส่งมือถือเล่นฟรีบนเครื่องเดียว',
    description:
      'เกมปาร์ตี้กู้ระเบิด 6 สายไฟ ส่งมือถือวนทีละคน จำลำดับสัญญาณไฟที่กระพริบแล้วตัดสายตามลำดับให้ครบก่อนหมดเวลา ยิ่งรอบสูงยิ่งเร็วและเส้นเยอะขึ้น ใครตัดผิดลำดับ ตัดผิดเส้น หรือตัดไม่ทันเวลา คนนั้นโดน เล่นได้ 2-10 คน ไม่ต้องโหลดแอป ไม่ต้องสมัคร',
    steps: [
      'ใส่ชื่อผู้เล่น 2-10 คน แล้วเลือกบทลงโทษของคนแพ้ไว้ก่อนเริ่ม',
      'ถึงตาใคร ให้ดูสัญญาณไฟที่กระพริบบนแผงวงจร แล้วจำลำดับสายไฟให้ได้',
      'ตัดสายไฟตามลำดับที่กระพริบให้ครบทุกเส้นภายในเวลา 5 วินาที และลดลงเหลือ 4 และ 3 วินาทีเมื่อรอบสูงขึ้น',
      'ตัดผิดลำดับ ตัดผิดเส้น หรือตัดไม่ทันเวลา ระเบิดทำงานทันที คนนั้นแพ้ แล้วส่งเครื่องเล่นรอบถัดไป',
    ],
  },
  og: 'wire-snip-panic.png',
  // The how-to-play prose below the stage is ad inventory: the decision was no slot on the PLAY
  // SCREEN, never no slot on the page.
  ads: true,
  // The full-screen route this page hands off to. GameLayout.astro turns it into the chrome link.
  playRoute: '/game/wire-snip-panic/play/',

  mount(stage: HTMLElement, ctx: GameContext) {
    mountInto(stage, ctx);
  },

  dispose() {
    teardown();
  },
};

export default game;
