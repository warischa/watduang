// The how-close-is-near landing page, plus the one rule the whole game turns on.
//
// The screens are NOT here: the game runs full screen at the route named in `playRoute` below, where
// the mockup's own art, sound and controls run (src/play/how-close-is-near/, extracted by
// scripts/extract-mockup.mjs). This page is the crawlable surface — how-to-play prose, HowTo JSON-LD
// and the ad slot — and SEO is this site's business model, so it is a page and not a redirect.
//
// WHY THE RULE LIVES HERE AND NOT IN THE LIFTED main.js. "Who loses" is the entire game and it is the
// one part with a sign and an off-by-one in it. power-meter's ruling (see that module's header) is
// that two implementations of one game is a debt paid at every future edit, so there is exactly one:
// the play route imports these exports. That also gives it a DOM-free seam — every branch below is
// pinned by how-close-is-near.test.mjs, which the lifted engine could not be.
import type { GameContext, GameModule } from './types.ts';
import { el } from './_el.ts';

// ---- The rule: pure and calculable, testable with no DOM (see how-close-is-near.test.mjs) ----

/** Both ends INCLUSIVE. The secret target and every guess live in the same closed range. */
export const MIN_NUMBER = 0;
export const MAX_NUMBER = 100;

/** The player whose guess sits CLOSEST to the secret target loses. */
export const NEAREST_LOSES = 'NEAREST_LOSES';
/** The player whose guess sits FURTHEST from the secret target loses. */
export const FARTHEST_LOSES = 'FARTHEST_LOSES';

export type LoseCondition = typeof NEAREST_LOSES | typeof FARTHEST_LOSES;

/** One committed guess. `distance` is stored rather than recomputed so the results screen and the
 *  conflict check can never disagree about how far a guess was. */
export interface Pick {
  readonly number: number;
  readonly distance: number;
}

/** How far a guess is from the target — a MAGNITUDE, never a signed offset. A guess above the target
 *  and one the same many steps below it are equally close, and dropping the abs() here silently names
 *  the opposite loser in both modes. */
export function distanceTo(guess: number, target: number): number {
  return Math.abs(guess - target);
}

/** A guess is legal only if it is a whole number inside the closed range. Strings, NaN and Infinity
 *  are rejected here rather than coerced — an `<input>` hands over text. */
export function isLegalNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= MIN_NUMBER && value <= MAX_NUMBER;
}

/** Why a guess cannot be committed, or null if it can.
 *
 *  Two guesses at the SAME DISTANCE are refused, not just two guesses at the same number: 45 and 55
 *  against a target of 50 are different numbers and an identical distance, and letting both in
 *  produces a tied results screen with no loser. Refusing at pick time is how this game has no ties.
 *
 *  Membership is tested by comparison, never by truthiness — distance 0 (a guess landing exactly on
 *  the target) is a real, takeable distance, and `if (distance)` would skip it. */
export function pickConflict(
  guess: unknown,
  target: number,
  taken: readonly Pick[],
): 'range' | 'number' | 'distance' | null {
  if (!isLegalNumber(guess)) return 'range';
  const n = guess as number;
  if (taken.some((p) => p.number === n)) return 'number';
  const d = distanceTo(n, target);
  if (taken.some((p) => p.distance === d)) return 'distance';
  return null;
}

/** The loser of the round, under the chosen condition.
 *
 *  Deterministic on a tie by construction: the comparison is STRICT, so the earliest entry in turn
 *  order survives a draw. pickConflict above keeps ties out of a real round, but this stays total in
 *  case one ever reaches it — a coin flip here would be unexplainable to the people holding the phone.
 *  Reads the array without reordering it: the results screen renders its own order. */
export function resolveLoser<T extends Pick>(picks: readonly T[], condition: LoseCondition): T {
  if (picks.length === 0) {
    throw new Error('how-close-is-near: no picks in this round — there is nobody to lose');
  }
  const nearest = condition === NEAREST_LOSES;
  return picks.reduce((worst, p) =>
    (nearest ? p.distance < worst.distance : p.distance > worst.distance) ? p : worst,
  );
}

/** The secret target, drawn from an injected source so a test can pin it. Both ends of the range are
 *  reachable: a rand() of exactly 1 (never produced by Math.random, but cheap to guard) would land one
 *  past MAX without the clamp. */
export function drawTarget(rand: () => number = Math.random): number {
  const span = MAX_NUMBER - MIN_NUMBER + 1;
  return Math.min(MAX_NUMBER, MIN_NUMBER + Math.floor(rand() * span));
}

// ---- The landing page ----

let stageEl: HTMLElement | null = null;

// Named render* like every other screen builder in src/games/, so
// scripts/arm-gate-coverage-check.mjs can see it. It builds no <button>, so there is nothing for
// armAllButtons to gate — the one control on this page is the chrome link GameLayout.astro renders
// above the stage, which is where ADR-0014 puts a navigation target.
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
  id: 'how-close-is-near',
  names: { th: 'ไกลแค่ไหนคือใกล้', en: 'How Close Is Near' },
  category: 'party',
  players: [2, 10],
  startsRound: true,
  keywords: ['ไกลแค่ไหนคือใกล้', 'เกมทายเลข', 'เกมส่งมือถือ', 'เกมปาร์ตี้', 'เกมกลุ่มเล่นฟรี'],
  tagline: 'แอบทายเลขลับคนละ 1 ตัว รอบนี้ใกล้แพ้หรือไกลแพ้ ตกลงกันก่อนเริ่ม',
  seo: {
    title: 'ไกลแค่ไหนคือใกล้ — เกมทายเลขลับส่งมือถือ เล่นฟรีบนเครื่องเดียว',
    description:
      'เกมทายเลข 0-100 ส่งมือถือวนทีละคน แอบเลือกเลขคนละ 1 ตัวห้ามซ้ำกัน เลือกกติกาได้ว่ารอบนี้คนที่ใกล้เลขลับที่สุดแพ้ หรือคนที่ไกลที่สุดแพ้ เล่นได้ 2-10 คน ไม่ต้องโหลดแอป ไม่ต้องสมัคร',
    steps: [
      'ใส่ชื่อผู้เล่นทุกคน (2–10 คน) แล้วเลือกกติกา ใกล้แพ้ หรือ ไกลแพ้',
      'ส่งมือถือวนทีละคน แอบเลือกเลข 0-100 คนละ 1 ตัว ห้ามซ้ำเลขและห้ามห่างจากเลขลับเท่ากับคนอื่น',
      'ครบทุกคนแล้วเปิดเลขลับ ใครเข้ากติกาที่ตกลงกันไว้ คนนั้นโดน',
    ],
  },
  og: 'how-close-is-near.png',
  // The how-to-play prose below the stage is ad inventory: the decision was no slot on the PLAY
  // SCREEN, never no slot on the page.
  ads: true,
  // The full-screen route this page hands off to. GameLayout.astro turns it into the chrome link.
  playRoute: '/game/how-close-is-near/play/',

  mount(stage: HTMLElement, ctx: GameContext) {
    mountInto(stage, ctx);
  },

  dispose() {
    teardown();
  },
};

export default game;
