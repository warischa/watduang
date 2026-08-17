// Contract every game must satisfy — every file in src/games/ not starting with _ must default-export GameModule
// The reasoning behind each field lives in issue #13 — do not duplicate it here

/** Player list that persists across rounds and games — localStorage (must try/catch every access) */
export interface Roster {
  names(): string[];
  /** Async because the read-modify-write is serialized across tabs by the Web Locks API — await it
   *  before rendering names(), or the list is drawn without whatever another tab just added. */
  add(name: string): Promise<void>;
  // ponytail: remove/clear deleted as dead code — zero callers, verified by grep over src/** plus a
  // local `tsc --noEmit` (exit 0). Ceiling, measured not assumed: tsc's program contains 0 .astro
  // files, so it cannot see PlayerSetup.astro — the roster's actual consumer — and ci.yml runs no
  // typecheck at all. So nothing standing re-checks this: a future `.ts` caller WOULD be caught by
  // a `tsc` step if one existed (CI runs none), but a future `.astro` caller escapes tsc entirely
  // and fails at runtime instead. `astro check` is the upgrade path that covers `.astro`.
  // A naive re-add also ships a cross-tab tombstone race: do union-then-subtract *inside* the
  // navigator.locks critical section (see roster.ts's withLock), or a tab whose write was swallowed
  // by quota (Safari private mode, full storage) deletes names it never saw.
}

/**
 * A mid-round save. The game decides every field except the two the envelope names: `game` says
 * whose blob it is (one slot is shared site-wide) and `players` is the round's own roster, so a
 * round is resumed from the checkpoint instead of from whatever the setup panel currently shows (#23).
 * The shape a game writes is still its own business — validate before trusting it, the blob on disk
 * was written by a past version of the code.
 */
export type Checkpoint = { game: string; players: string[] } & Record<string, unknown>;

/** State for "this group" only — can expire on its own, not tied to the roster */
export interface GameSession {
  /** Players in this group's round — a subset of the roster, or temporary names P1..Pn */
  players: string[];
  /** Sets players and writes to storage in one step — never set players directly, it won't persist */
  setPlayers(names: string[]): void;
  /** ids of games this group already played — used to suggest the next game once there are >= 2 games.
   *  "group" not "round" on purpose: a session spans several games for one sitting, so clearing it at
   *  round end would destroy this list. Matches session.ts:1, which already said "this group". */
  played: string[];
  markPlayed(id: string): void;
  /** Mid-round state, survives a refresh — the game defines its own shape, except game/players which the envelope enforces */
  checkpoint: Checkpoint | null;
  saveCheckpoint(cp: Checkpoint | null): void;
  /** The "clear this group" button — clears the session, never touches the roster */
  clear(): void;
}

export interface GameContext {
  roster: Roster;
  session: GameSession;
}

export interface GameModule {
  /** slug -> /game/<id>/ — must match the filename */
  id: string;
  names: { th: string; en: string };
  category: 'party' | 'fortune';
  players: [min: number, max: number];
  keywords: string[];
  /** ponytail: nothing reads this yet — Vite already splits a chunk per game file on its own.
   *  Kept per the #13 spec in case a game genuinely needs to load a large lib */
  needs: string[];
  /** A short one-line hook for the OG card — seo.title runs too long, seo.description longer still.
   *  Used by scripts/make-og.mjs · without this the card is left with just the game name */
  tagline: string;
  /** steps -> the "how to play" heading + HowTo JSON-LD */
  seo: { title: string; description: string; steps: string[] };
  /** Filename in public/og/, e.g. "timebomb.png" — must never show a bottle, can, or logo'd glass */
  og: string;
  /** false = the whole page has no ad slot — every gameplay screen must be false */
  ads: boolean;
  mount(stage: HTMLElement, ctx: GameContext): void;
  /** Clear timers / listeners / audio on every exit path — required */
  dispose(): void;
  onVisibility?(hidden: boolean): void;
}
