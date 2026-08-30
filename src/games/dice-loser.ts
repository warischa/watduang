// The dice-loser landing page, plus the round rule the play route runs on.
//
// TWO THINGS LIVE HERE, and the split is deliberate:
//   1. `rollDice` and `resolveRound` — the whole rule of the game, pure, DOM-free and tested in
//      dice-loser.test.mjs. src/play/dice-loser/main.ts imports THESE; there is exactly one
//      implementation of the losing rule in the repo and it is the one under test.
//   2. `mount` — the crawlable landing card, the cannon-flag shape (ADR-0050). The game itself runs
//      full screen at `playRoute` below; this page carries the how-to-play prose, the HowTo JSON-LD
//      and the ad slot, which is why it is not a redirect. SEO is this site's business model.
//
// PORTED FROM ~/claude/mockup-games/dice-loser (gh#156, owner decision gh#139). The mockup's rule
// engine (its test-logic.js) is reproduced exactly. Its third lose condition — the random cursed
// number — is deliberately NOT ported: gh#139 scopes this game to "group picks whether high or low
// loses" and records "Nothing extra".
//
// The .ts extension in the import path is required for `node --test` (Node does not guess
// extensions) — Vite/tsc accept both.
import type { GameContext, GameModule } from './types.ts';
import { el } from './_el.ts';

// ---- The round: pure and calculable, testable with no DOM (see dice-loser.test.mjs) ----

/** Chosen once, before the first roll, and held for every tiebreak round after it. */
export type LoseCondition = 'HIGH_LOSES' | 'LOW_LOSES';

export interface Roll {
  /** Three faces, each 1..6, in the order they were rolled. */
  readonly dice: readonly [number, number, number];
  /** The sum — 3..18. Stored rather than recomputed so a screen and the rule cannot disagree. */
  readonly total: number;
}

export interface RoundResult {
  /** FINAL_LOSER = exactly one player sits on the losing score. TIEBREAK = two or more do. */
  readonly status: 'FINAL_LOSER' | 'TIEBREAK';
  /** The total that loses this round — the max under HIGH_LOSES, the min under LOW_LOSES. */
  readonly losingScore: number;
  /** Index into the totals handed in, or null when the round ties. */
  readonly loserIndex: number | null;
  /** Indexes into the totals handed in — empty unless status is TIEBREAK. */
  readonly tiedIndexes: readonly number[];
}

const FACES = 6;
const DICE_PER_TURN = 3;

/** One player's turn: three independent fair faces. `rand` is injected so the test can seed it. */
export function rollDice(rand: () => number = Math.random): Roll {
  const roll = (): number => Math.floor(rand() * FACES) + 1;
  const dice: [number, number, number] = [roll(), roll(), roll()];
  return { dice, total: dice[0] + dice[1] + dice[2] };
}

/** Decides the round from the totals of the players STILL IN IT, in seat order.
 *  A tiebreak round calls this again with only the tied players' totals, so the indexes it returns
 *  are always positions in the array just handed in — the caller owns the mapping back to seats. */
export function resolveRound(totals: readonly number[], condition: LoseCondition): RoundResult {
  if (totals.length === 0) {
    throw new Error('dice-loser: ไม่มีผู้เล่นในรอบนี้ — a round needs at least one total');
  }
  if (condition !== 'HIGH_LOSES' && condition !== 'LOW_LOSES') {
    throw new Error(`dice-loser: unknown lose condition ${String(condition)}`);
  }
  // The losing score is one end of the range; a tie ANYWHERE ELSE is not a tie for this purpose.
  const losingScore =
    condition === 'HIGH_LOSES' ? Math.max(...totals) : Math.min(...totals);
  const tied: number[] = [];
  for (let i = 0; i < totals.length; i += 1) {
    if (totals[i] === losingScore) tied.push(i);
  }
  return tied.length === 1
    ? { status: 'FINAL_LOSER', losingScore, loserIndex: tied[0], tiedIndexes: [] }
    : { status: 'TIEBREAK', losingScore, loserIndex: null, tiedIndexes: tied };
}

/** The Thai label for a condition — one spelling, shared by the play route and any summary line. */
export const CONDITION_LABEL: Readonly<Record<LoseCondition, string>> = {
  HIGH_LOSES: 'แต้มสูงแพ้',
  LOW_LOSES: 'แต้มต่ำแพ้',
};

export { DICE_PER_TURN };

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
  id: 'dice-loser',
  names: { th: 'เต๋าชี้คนแพ้', en: 'Dice Loser' },
  category: 'party',
  players: [2, 10],
  startsRound: true,
  keywords: [
    'เต๋าชี้คนแพ้',
    'เกมทอยเต๋า',
    'สุ่มคนโดน',
    'เกมส่งมือถือ',
    'เกมปาร์ตี้',
    'เกมกลุ่มเล่นฟรี',
    'เกมเล่นบนเครื่องเดียว',
  ],
  tagline: 'ผลัดกันทอยเต๋า 3 ลูก ตกลงกันก่อนว่าแต้มสูงหรือแต้มต่ำแพ้',
  seo: {
    title: 'เต๋าชี้คนแพ้ — เกมทอยเต๋าหาคนโดน เล่นฟรีบนเครื่องเดียว',
    description:
      'ตกลงกันก่อนว่าแต้มสูงแพ้หรือแต้มต่ำแพ้ แล้วผลัดกันส่งมือถือทอยเต๋าคนละ 3 ลูก ใครเข้าเงื่อนไขคนนั้นโดน เสมอกันก็ทอยรอบตัดสินเฉพาะคนที่เสมอจนกว่าจะเหลือคนเดียว เล่นได้ 2-10 คน ไม่ต้องโหลดแอป ไม่ต้องสมัคร',
    steps: [
      'เลือกจำนวนคนเล่นในวง 2-10 คน แล้วตั้งชื่อ',
      'ตกลงกติกาก่อนเริ่ม: แต้มสูงแพ้ หรือ แต้มต่ำแพ้',
      'ส่งมือถือวนทีละคน แต่ละคนทอยเต๋า 3 ลูกหนึ่งครั้ง',
      'ใครได้แต้มตรงเงื่อนไขคนนั้นแพ้ ถ้าเสมอกันให้ทอยรอบตัดสินเฉพาะคนที่เสมอ',
    ],
  },
  og: 'dice-loser.png',
  ads: true,
  // The full-screen route this page hands off to. GameLayout.astro turns it into the chrome link.
  playRoute: '/game/dice-loser/play/',

  mount(stage: HTMLElement, ctx: GameContext) {
    mountInto(stage, ctx);
  },

  dispose() {
    teardown();
  },
};

export default game;
