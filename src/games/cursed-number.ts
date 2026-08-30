// The round rule for the cursed-number party game.
//
// TWO THINGS LIVE HERE ON PURPOSE, exactly as pinocchio-luck.ts and how-close-is-near.ts do it. The
// default export is the game module the manifest reads. The named exports above it are the round
// rule, hoisted OUT of the lifted mockup under src/play/cursed-number/ so the rule has one
// implementation a node test can reach: src/play/cursed-number/main.js imports this class and
// defines none of its own. The mockup shipped the same logic inside its inline <script> together
// with an in-page assertion runner; that runner is a developer tool players must never reach, and a
// rule only a browser can execute is a rule no gate can pin.
//
// Everything above the landing section is pure: no DOM, no timers, no Math.random except through
// getRandomInteger, which setCustomRandom replaces so a test can drive a fixed cursed number.
import type { GameContext, GameModule } from './types.ts';
import { el } from './_el.ts';

/** The inclusive range a round opens on. The cursed number is drawn from it and never leaves it. */
export const MIN_RANGE = 0;
export const MAX_RANGE = 100;

/** ADR-0054 ruling 5: the count is this game's own number, and the site-wide ceiling is 20. The
 *  mockup already offered 2 to 20 and needed no change. Written as a literal on purpose -- gh#140
 *  keeps the shared cast out of src/games entirely, so deriving this from the cast's length would
 *  be a dependency this file is not allowed to have. */
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 20;

/** One seat's identity, supplied BY THE CALLER. gh#140: no module under src/games knows a cast
 *  exists -- identity reaches a game as plain data, and the shared animal list lives on the play
 *  side, which is what src/play/cursed-number/main.js hands in. This engine only knows it was given
 *  some labels — and the shared list is deliberately not NAMED here either, because the pin that
 *  enforces gh#140 is a text scan and cannot tell a mention from an import. */
export interface Seat {
  emoji: string;
  name: string;
}

/** The seat a caller that supplied nothing gets: numbered, no icon. Not a fallback cast — it is the
 *  same numbered label the rest of the site treats as "unnamed", so nothing here can be mistaken for
 *  a second roster of characters. */
function defaultSeat(index: number): Seat {
  return { emoji: '', name: `ผู้เล่น ${index + 1}` };
}

/** The seat colour, as a CSS custom property REFERENCE rather than a value. ADR-0048/ADR-0054 put
 *  colour in a stylesheet as a named token; the MAX_PLAYERS tokens are declared in
 *  src/play/cursed-number/overrides.css and this only ever names one. A var() reference is legal
 *  anywhere the mockup puts this string -- style.setProperty and a style attribute both resolve it.
 *  It is deliberately never handed to a canvas fillStyle, which does not resolve var(). */
export function seatColorVar(index: number): string {
  return `var(--mascot-${(index % MAX_PLAYERS) + 1})`;
}

export type Direction = 'HIGHER' | 'LOWER' | 'LOSE' | 'FORCED_LOSE';

export interface CursedPlayer {
  id: string;
  index: number;
  /** What the screen shows: the typed name if there is one, otherwise the mascot default. */
  name: string;
  /** Exactly what the player typed, kept so a count change can restore it. Empty means untouched. */
  rawName: string;
  defaultName: string;
  avatar: string;
  color: string;
}

export interface HistoryRow {
  player: CursedPlayer | null;
  guess: number;
  direction: Direction;
  minBefore: number;
  maxBefore: number;
  minAfter: number;
  maxAfter: number;
}

export interface Odds {
  remaining: number;
  fraction: string;
  percent: string;
  isCritical: boolean;
  isWarning: boolean;
  isSafe: boolean;
}

export type GuessOutcome =
  | { valid: false; error: 'BUSY' | 'INVALID_INTEGER' | 'OUT_OF_BOUNDS' }
  | { valid: true; result: 'LOSE'; cursedNumber: number; loser: CursedPlayer | null; guess: number }
  | {
      valid: true;
      result: 'SAFE';
      direction: Direction;
      guess: number;
      min: number;
      max: number;
      /** The range has collapsed to a single number, so the NEXT player has no safe move left. */
      isCollapsedToOne: boolean;
      activePlayer: CursedPlayer | null;
      nextPlayer: CursedPlayer | null;
    };

/** The rule, whole. Two ways to lose and no third:
 *   1. A guess that equals the cursed number.
 *   2. Taking a turn when the range has already collapsed to one number -- resolveForcedReveal.
 *  Every other guess is safe and narrows the range by moving the bound PAST the guess, which is why
 *  a guess can never be offered twice. */
export class CursedNumberGameModel {
  minRange = MIN_RANGE;
  maxRange = MAX_RANGE;
  cursedNumber = 0;
  min = MIN_RANGE;
  max = MAX_RANGE;
  playerCount = 4;
  players: CursedPlayer[] = [];
  activePlayerIndex = 0;
  startingPlayerIndex = 0;
  selectedNumber = 50;
  history: HistoryRow[] = [];
  loserPlayer: CursedPlayer | null = null;
  isSubmitting = false;
  customRandomFn: ((min: number, max: number) => number) | null = null;
  penalty = '\u{1F4B8} เลี้ยงน้ำ/ขนมเพื่อนทั้งวง';
  /** Read only through seat(), so a short list or none at all is a supported call. */
  readonly seats: readonly Seat[];

  constructor(seats: readonly Seat[] = []) {
    this.seats = seats;
    this.setPlayerCount(4);
  }

  seat(index: number): Seat {
    return this.seats.length > 0
      ? this.seats[index % this.seats.length]!
      : defaultSeat(index);
  }

  setCustomRandom(fn: ((min: number, max: number) => number) | null): void {
    this.customRandomFn = fn;
  }

  getRandomInteger(min: number, max: number): number {
    if (this.customRandomFn) return this.customRandomFn(min, max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /** Resizes the table, keeping every name a player actually typed. Growing past MAX_PLAYERS is
   *  clamped rather than rejected, so a roster longer than the ceiling seats the first twenty. */
  setPlayerCount(count: number): void {
    const clamped = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, count));
    this.playerCount = clamped;
    const oldPlayers = [...this.players];
    this.players = [];

    for (let i = 0; i < clamped; i++) {
      const existing = oldPlayers[i];
      const seat = this.seat(i);
      this.players.push({
        id: `player_${i}`,
        index: i,
        name: existing && existing.rawName ? existing.rawName.trim() : seat.name,
        rawName: existing ? existing.rawName : '',
        defaultName: seat.name,
        avatar: seat.emoji,
        color: seatColorVar(i),
      });
    }
  }

  updatePlayerName(index: number, rawName: string): void {
    const player = this.players[index];
    if (!player) return;
    player.rawName = rawName;
    const trimmed = (rawName || '').trim();
    player.name = trimmed.length > 0 ? trimmed.slice(0, 20) : this.seat(index).name;
  }

  setCursedNumber(num: number): void {
    this.cursedNumber = Math.max(this.minRange, Math.min(this.maxRange, num));
  }

  startNewGame(): { min: number; max: number; activePlayer: CursedPlayer | null; isGameOver: boolean } {
    this.min = this.minRange;
    this.max = this.maxRange;
    this.cursedNumber = this.getRandomInteger(this.minRange, this.maxRange);
    this.history = [];
    this.loserPlayer = null;
    this.isSubmitting = false;

    const count = Math.max(1, this.players.length);
    const randStart = this.getRandomInteger(0, count - 1);
    this.startingPlayerIndex = ((randStart % count) + count) % count;
    this.activePlayerIndex = this.startingPlayerIndex;
    this.selectedNumber = Math.floor((this.min + this.max) / 2);

    return { min: this.min, max: this.max, activePlayer: this.getActivePlayer(), isGameOver: false };
  }

  getActivePlayer(): CursedPlayer | null {
    if (!this.players.length) return null;
    return this.players[this.activePlayerIndex % this.players.length] ?? null;
  }

  getNextPlayer(): CursedPlayer | null {
    if (!this.players.length) return null;
    const nextIdx = (this.activePlayerIndex + 1) % this.players.length;
    return this.players[nextIdx] ?? null;
  }

  calculateOdds(): Odds {
    const remainingCount = Math.max(1, this.max - this.min + 1);
    const percent = Number(((1 / remainingCount) * 100).toFixed(1));
    return {
      remaining: remainingCount,
      fraction: `1 ใน ${remainingCount}`,
      percent: `${percent}%`,
      isCritical: remainingCount <= 3,
      isWarning: remainingCount > 3 && remainingCount <= 10,
      isSafe: remainingCount > 10,
    };
  }

  /** One turn. `isSubmitting` is the double-tap guard: a second submit before advanceTurn changes
   *  nothing and reports BUSY. */
  resolveGuess(guess: number): GuessOutcome {
    if (this.isSubmitting) return { valid: false, error: 'BUSY' };
    if (typeof guess !== 'number' || Number.isNaN(guess) || !Number.isInteger(guess)) {
      return { valid: false, error: 'INVALID_INTEGER' };
    }
    if (guess < this.min || guess > this.max) return { valid: false, error: 'OUT_OF_BOUNDS' };
    this.isSubmitting = true;

    const activePlayer = this.getActivePlayer();

    if (guess === this.cursedNumber) {
      this.loserPlayer = activePlayer;
      this.history.push({
        player: activePlayer,
        guess,
        direction: 'LOSE',
        minBefore: this.min,
        maxBefore: this.max,
        minAfter: this.min,
        maxAfter: this.max,
      });
      return { valid: true, result: 'LOSE', cursedNumber: this.cursedNumber, loser: activePlayer, guess };
    }

    const prevMin = this.min;
    const prevMax = this.max;
    let direction: Direction;

    // The bound moves PAST the guess, never to it: the guess itself is now known not to be the
    // cursed number, so leaving it in range would let a later turn offer it again as a free move.
    if (guess < this.cursedNumber) {
      direction = 'HIGHER';
      this.min = guess + 1;
    } else {
      direction = 'LOWER';
      this.max = guess - 1;
    }

    this.history.push({
      player: activePlayer,
      guess,
      direction,
      minBefore: prevMin,
      maxBefore: prevMax,
      minAfter: this.min,
      maxAfter: this.max,
    });

    return {
      valid: true,
      result: 'SAFE',
      direction,
      guess,
      min: this.min,
      max: this.max,
      isCollapsedToOne: this.min === this.max,
      activePlayer,
      nextPlayer: this.getNextPlayer(),
    };
  }

  advanceTurn(): CursedPlayer | null {
    this.activePlayerIndex = (this.activePlayerIndex + 1) % this.players.length;
    this.selectedNumber = Math.floor((this.min + this.max) / 2);
    this.isSubmitting = false;
    return this.getActivePlayer();
  }

  /** The second losing path. Reached only when the range has collapsed to one number, so the player
   *  whose turn it is has no safe move: the remaining number IS the cursed one. */
  resolveForcedReveal(): { result: 'LOSE'; cursedNumber: number; loser: CursedPlayer | null; guess: number } {
    const activePlayer = this.getActivePlayer();
    this.loserPlayer = activePlayer;
    this.history.push({
      player: activePlayer,
      guess: this.cursedNumber,
      direction: 'FORCED_LOSE',
      minBefore: this.min,
      maxBefore: this.max,
      minAfter: this.min,
      maxAfter: this.max,
    });
    return { result: 'LOSE', cursedNumber: this.cursedNumber, loser: activePlayer, guess: this.cursedNumber };
  }
}

// ---- The landing module ----
//
// getStaticPaths() in src/pages/game/[id].astro builds a landing page only for a game with NO
// playRoute, so nothing below renders on this site today (ADR-0050 ruling 2 deleted the party
// landings). It stays because GameModule requires mount/dispose and because the manifest entry --
// which is what puts the card on the hub and what scripts/make-og.mjs resolves -- needs the object.

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
  id: 'cursed-number',
  names: { th: 'เลขอาถรรพ์', en: 'Cursed Number' },
  category: 'party',
  // Per-game count with the site-wide ceiling of 20 (ADR-0054 ruling 5). The mockup's own stepper
  // already ran 2-20 and the cast is exactly 20 animals long.
  players: [MIN_PLAYERS, MAX_PLAYERS],
  startsRound: true,
  keywords: [
    'เลขอาถรรพ์',
    'เกมทายเลข',
    'เกมส่งมือถือ',
    'เกมปาร์ตี้',
    'เกมกลุ่มเล่นฟรี',
    'เกมเล่นบนเครื่องเดียว',
  ],
  tagline: 'ผลัดกันทายเลข ช่วงแคบลงทุกตา ใครทายโดนเลขอาถรรพ์คนนั้นแพ้',
  seo: {
    title: 'เลขอาถรรพ์ — เกมทายเลขส่งมือถือ ยิ่งเล่นยิ่งลุ้น เล่นฟรีบนเครื่องเดียว',
    description:
      'เกมทายเลข 0-100 ส่งมือถือวนทีละคน มีเลขอาถรรพ์ซ่อนอยู่ 1 ตัว ทายไม่โดนช่วงตัวเลขจะแคบลงเรื่อย ๆ ใครทายโดนเลขอาถรรพ์ หรือเหลือเลขสุดท้ายตัวเดียวในตาตัวเอง คนนั้นแพ้ เล่นได้ 2-20 คน ไม่ต้องโหลดแอป ไม่ต้องสมัคร',
    steps: [
      'เลือกจำนวนผู้เล่น 2-20 คน ตั้งชื่อได้ หรือใช้ชื่อสัตว์ประจำตัวที่ให้มา',
      'ส่งมือถือวนทีละคน แต่ละคนเลือกเลข 1 ตัวจากช่วงที่เหลืออยู่',
      'ทายไม่โดน ช่วงตัวเลขจะแคบลง แล้วส่งเครื่องให้คนถัดไป',
      'ใครทายโดนเลขอาถรรพ์ หรือถึงตาแล้วเหลือเลขให้เลือกแค่ตัวเดียว คนนั้นแพ้',
    ],
  },
  og: 'cursed-number.png',
  ads: true,
  playRoute: '/game/cursed-number/play/',

  mount(stage: HTMLElement, ctx: GameContext) {
    mountInto(stage, ctx);
  },

  dispose() {
    teardown();
  },
};

export default game;
