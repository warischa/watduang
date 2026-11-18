// The prize-draw game registry (gh#305): which 3D game may play which step, which games are integrated,
// how each one is loaded, and what becomes of its picture when the reveal settles. Each loader is a
// literal lazy import, so a game -- and three with it -- is fetched only when a reveal actually mounts
// it, never on the page's first load (ADR-0068: the cost of three is per visitor).
//
// The stage and the host read this file; game builders never edit it -- the orchestrator does, when a
// per-game fact is ruled on (gh#319 added `settle`). A game becomes available here when it is integrated,
// not when its module exists.

import type { GameId, RevealModule } from './game-contract.ts';

export type StepKind = 'round' | 'final';

/** What the host does with the game's last frame once the reveal settles (gh#319). */
export type SettleMode = 'hold' | 'handback';

type Entry<G extends GameId> = {
  /** Steps this game can play: an elimination round, the final, or both. */
  steps: readonly StepKind[];
  /** Integrated and allowed to mount. An unavailable game reveals in 2D. */
  available: boolean;
  /** 'hold' keeps the 3D picture on screen over the committed 2D view; 'handback' tears the scene down
   *  and leaves that view alone. An owner pick per game, never a game module's own choice. */
  settle: SettleMode;
  load: () => Promise<RevealModule<G>>;
};

export const GAMES: { [G in GameId]: Entry<G> } = {
  fireworks: {
    steps: ['round', 'final'],
    available: true,
    settle: 'handback',
    load: () => import('../prize-fireworks/renderer/index.ts').then((m) => m.reveal),
  },
  cards: {
    steps: ['round'],
    available: true,
    settle: 'handback',
    load: () => import('../prize-cards/renderer/index.ts').then((m) => m.reveal),
  },
  ladder: {
    steps: ['final'],
    available: true,
    settle: 'handback',
    load: () => import('../prize-ladder/renderer/index.ts').then((m) => m.reveal),
  },
  zones: {
    steps: ['round'],
    available: true,
    settle: 'hold',
    load: () => import('../prize-zones/renderer/index.ts').then((m) => m.reveal),
  },
  marbles: {
    steps: ['round'],
    available: true,
    settle: 'handback',
    load: () => import('../prize-marbles/renderer/index.ts').then((m) => m.reveal),
  },
  envelopes: {
    steps: ['final'],
    available: true,
    settle: 'hold',
    load: () => import('../prize-envelopes/renderer/index.ts').then((m) => m.reveal),
  },
  flipcards: {
    steps: ['final'],
    available: true,
    settle: 'hold',
    load: () => import('../prize-flipcards/renderer/index.ts').then((m) => m.reveal),
  },
};

function isGameId(x: unknown): x is GameId {
  return typeof x === 'string' && Object.prototype.hasOwnProperty.call(GAMES, x);
}

/** May `game` play a step of this kind? */
export function eligible(game: unknown, kind: StepKind): game is GameId {
  return isGameId(game) && GAMES[game].steps.includes(kind);
}

/** Is `game` integrated, so the host may mount it? */
export function isAvailable(game: unknown): game is GameId {
  return isGameId(game) && GAMES[game].available;
}

export function loaderFor<G extends GameId>(game: G): () => Promise<RevealModule<G>> {
  return GAMES[game].load as () => Promise<RevealModule<G>>;
}

/** What becomes of `game`'s picture when the reveal settles. The host reads this itself: a caller passes
 *  no settle option, so no caller can hand a game a picture it was not picked to keep. */
export function settleFor(game: GameId): SettleMode {
  return GAMES[game].settle;
}
