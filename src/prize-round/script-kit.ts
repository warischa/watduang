// Shared types and hash helpers for engine 2b (gh#323): the multi-step "scripted cut" rounds of games 2, 3 and 4.
// Pure: no DOM, storage or network. The engine itself is scripted.ts; each game's composition is its own module
// (letters.ts, bingo.ts, chain.ts), and each imports only this file plus the phase-1 hash machinery.
//
// A script is the list of items the main screen reveals, one per step: the letters of a hidden word (game 2), the
// drawn letters (game 3), the words of a chain (game 4). A holding is the list of items one person holds. After
// step k, a person's score is how many of their held items appear among the first k script items; after the last
// step they "match" when the score reaches the game's threshold. Every game is composed so that, at a half-cut,
// group 0 matches script 0 and not script 1, and group 1 the reverse.

import { canonicalIdentity, hashToScale } from '../prize-draw/round-code.ts';
import type { Lang, Pool } from '../prize-words/schema.ts';
import type { Banks } from './round.ts';

export type ScriptGame = 2 | 3 | 4;
export type ScriptSetup = { readonly game: ScriptGame; readonly lang: Lang; readonly pool: Pool };
/** Items revealed one per step, in order. */
export type Script = readonly string[];
export type Group = 0 | 1;
export type ComposeCtx = { readonly eventKey: string; readonly round: number; readonly seed: string; readonly setup: ScriptSetup; readonly banks: Banks };

/** One round's composition: two candidate scripts (index = rule), and what each identity of a group holds. */
export type Composed = {
  readonly scripts: readonly [Script, Script];
  /** Game-specific detail for the proof (candidate word ids, letter sets, chains); no verdict reads it. */
  readonly detail: Readonly<Record<string, unknown>>;
  holding(identity: string, group: Group): readonly string[];
};

export type Composer = {
  /** Score a holding needs after the last step to match the script. */
  readonly threshold: number;
  /** Null when the setup can be played on these banks; the reason otherwise. Depends on (banks, setup) only. */
  infeasible(banks: Banks, setup: ScriptSetup): string | null;
  compose(ctx: ComposeCtx): Composed;
};

/** `k` distinct items of `list` by a hash-driven partial shuffle (the cards.ts deal pattern). */
export function pickDistinct<T>(tag: string, parts: ReadonlyArray<string | number>, list: readonly T[], k: number): T[] {
  if (k > list.length) throw new RangeError(`cannot pick ${k} of ${list.length}`);
  const idx = list.map((_, i) => i);
  const out: T[] = [];
  for (let n = 0; n < k; n++) {
    const j = n + hashToScale(tag, [...parts, n], idx.length - n);
    [idx[n], idx[j]] = [idx[j]!, idx[n]!];
    out.push(list[idx[n]!]!);
  }
  return out;
}

/** The whole of `list` in a hash-driven order. */
export function hashOrder<T>(tag: string, parts: ReadonlyArray<string | number>, list: readonly T[]): T[] {
  return pickDistinct(tag, parts, list, list.length);
}

/** Identity parts for a per-person hash: canonical form, so host and phone hash the same bytes. */
export function idPart(identity: string): string {
  return canonicalIdentity(identity);
}

/** Score after `step` script items: how many held items have been revealed (each held item counts once). */
export function scoreAt(script: Script, held: readonly string[], step: number): number {
  const seen = new Set(script.slice(0, step));
  let n = 0;
  for (const x of held) if (seen.has(x)) n++;
  return n;
}
