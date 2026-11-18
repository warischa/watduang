// The visual interface every prize-draw 3D game implements (gh#305), shared by the fireworks, cards and
// ladder modules and driven only by game-host.ts. Frozen: a game module plugs into these types and never
// changes them. One additive amendment, authorized under gh#319 (2026-11-18): RevealInput gained `claim`,
// the QR-mode fact the hold finals' claim line reads; every existing field is unchanged.
//
// A module receives committed facts only. It gets no store, no outcome RNG and no event transition, so it
// cannot choose a winner or advance the event; its events steer presentation and validated announcements.
// It mounts synchronously, allocates every GPU resource through `context.own`, uses `context.signal` for
// any asynchronous work, and owns no animation loop: the host calls `advance` with a tick per frame.
// Cosmetic randomness is seeded from `input.key`, so a refresh replays the same picture.

import type { WebGLRenderer } from 'three';
import type { Person } from '../../prize-event/event.ts';
import type { CardsPrepared, FinalRecord, GameId, RoundRecord } from '../../prize-event/game-contract.ts';

export type { GameId };

export type DeepReadonly<T> = T extends (...args: never[]) => unknown ? T : { readonly [K in keyof T]: DeepReadonly<T[K]> };

/** What was committed before the reveal mounts: an elimination round, or the final with its prizes
 *  (first prize first; ranks at or past `prizes.length` win nothing). A card round mounts twice: first
 *  `deal` — the committed deal, face down, before any rule exists (it reveals no survivor) — then
 *  `round` once the rule and survivors are committed. Only the cards module ever receives `deal`. */
export type CommittedOutcome =
  | ({ kind: 'deal' } & CardsPrepared)
  | ({ kind: 'round' } & RoundRecord)
  | ({ kind: 'final'; prizes: readonly string[] } & FinalRecord);

export type Viewport = { cssWidth: number; cssHeight: number; dpr: number };

/**
 * One reveal's input. `key` identifies the committed step (event key, step and code) and seeds cosmetic
 * randomness. `people` are the step's participants by id, in roster order: the round's live field, or the
 * five finalists. `eventName` is the MC's typed event name for the projector chrome. `claim` is the event's
 * mode: true in QR mode, where winners claim on their phones and the claim line is drawn; false in admin
 * mode and on the demo page, which have no phones. Only the hold finals' renderers read it (gh#319).
 */
export type RevealInput<G extends GameId> = DeepReadonly<{
  key: string;
  eventName: string;
  outcome: CommittedOutcome & { game: G };
  people: Person[];
  viewport: Viewport;
  reducedMotion: boolean;
  claim: boolean;
}>;

export type GameCommand =
  | { type: 'tick'; elapsedMs: number; deltaMs: number }
  | { type: 'resize'; viewport: Viewport }
  | { type: 'next' | 'finish' };

export type GameEvent =
  | { type: 'beat'; beat: 'deal' | 'rule' | 'cut' | 'prize'; index: number }
  | { type: 'complete' }
  | { type: 'error'; error: unknown };

export type GameContext = {
  /** The module's own layer: it holds the host's canvas, and may hold the module's DOM overlay. */
  root: HTMLElement;
  /** three's WebGLRenderer (instance type read off the class: see three-shim.d.ts). */
  renderer: InstanceType<typeof WebGLRenderer>;
  /** Aborted on every exit of the reveal, whichever way. */
  signal: AbortSignal;
  /** Register a GPU resource (geometry, material, texture, render target). The host disposes every one
   *  on exit; one registered after the exit is disposed at once. */
  own<T extends { dispose(): void }>(resource: T): T;
};

export type RevealHandle = {
  advance(command: GameCommand): void;
  /** Idempotent. The host also disposes every owned resource and the renderer itself. */
  dispose(): void;
};

export interface RevealModule<G extends GameId> {
  mount(context: GameContext, input: RevealInput<G>, emit: (event: GameEvent) => void): RevealHandle;
}
