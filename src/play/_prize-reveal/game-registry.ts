// The prize-draw game registry (gh#305): which 3D game may play which step, which games are integrated,
// and how each one is loaded. Each loader is a literal lazy import, so a game -- and three with it -- is
// fetched only when a reveal actually mounts it, never on the page's first load (ADR-0068: the cost of
// three is per visitor).
//
// The stage and the host read this file; game builders never edit it. A game becomes available here when
// it is integrated, not when its module exists.

import type { GameId, RevealModule } from './game-contract.ts';

export type StepKind = 'round' | 'final';

type Entry<G extends GameId> = {
  /** Steps this game can play: an elimination round, the final, or both. */
  steps: readonly StepKind[];
  /** Integrated and allowed to mount. An unavailable game reveals in 2D. */
  available: boolean;
  load: () => Promise<RevealModule<G>>;
};

export const GAMES: { [G in GameId]: Entry<G> } = {
  fireworks: {
    steps: ['round', 'final'],
    available: true,
    load: () => import('../prize-fireworks/renderer/index.ts').then((m) => m.reveal),
  },
  cards: {
    steps: ['round'],
    available: true,
    load: () => import('../prize-cards/renderer/index.ts').then((m) => m.reveal),
  },
  ladder: {
    steps: ['final'],
    available: true,
    load: () => import('../prize-ladder/renderer/index.ts').then((m) => m.reveal),
  },
  zones: {
    steps: ['round'],
    available: true,
    load: () => import('../prize-zones/renderer/index.ts').then((m) => m.reveal),
  },
  marbles: {
    steps: ['round'],
    available: true,
    load: () => import('../prize-marbles/renderer/index.ts').then((m) => m.reveal),
  },
  envelopes: {
    steps: ['final'],
    available: true,
    load: () => import('../prize-envelopes/renderer/index.ts').then((m) => m.reveal),
  },
  flipcards: {
    steps: ['final'],
    available: true,
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
