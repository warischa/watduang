// Game 4 of the prize draw (gh#323, engine 2b): each person holds one word, and a chain of CHAIN_LENGTH words grows
// on the main screen one word per step; the holders of a word are "linked" when it appears. Pure: no DOM, storage
// or network.
//
// Link rule (owner ruling 2026-11-19). Thai: a word can take part in a chain only if its stored last written
// character is a consonant of the 44-consonant table (a word ending in a vowel sign, tone mark or karan is out),
// and the next word's stored first consonant (leading vowels skipped) must be that consonant. English: the stored
// last letter must equal the next word's stored first letter. Every word of a chain must be chain-eligible.
//
// Two candidate chains with no word in common. Group 0 holds a word of chain 0, group 1 a word of chain 1, so
// whichever chain is drawn links exactly one group. Several holders share a word: each person's word is a hash of
// their identity over the chain's positions, because a phone knows neither the roster nor the group size.
// Polarity is mechanically free ("linked = survive" or "linked = out"); gh#311 states only the first.
//
// Chain search: a depth-first search over the link graph, capped at CHAIN_SEARCH_BUDGET visited nodes (a count,
// never wall time, so host and phone reach the same result). A pool is feasible only when the search in bank order
// finds a pair within the cap; a pool whose pairs hide past it is refused, never dealt a wrong chain. A round
// searches in an order hashed from its seed; if that search exhausts the cap it falls back to the bank-order pair.

import type { Bank } from '../prize-words/schema.ts';
import { eligibleFor, playable, type Word } from './conditions.ts';
import type { Banks } from './round.ts';
import { hashToScale } from '../prize-draw/round-code.ts';
import { hashOrder, idPart, type ComposeCtx, type Composed, type Composer, type ScriptSetup } from './script-kit.ts';

export const CHAIN_LENGTH = 5;
/** Most nodes one chain-pair search may visit. The live bank needs under 1,500 (gh#323 evidence). */
export const CHAIN_SEARCH_BUDGET = 100_000;
/** The 44-consonant table, obsolete letters included, as the ruling names it. */
const THAI_CONSONANTS: ReadonlySet<string> = new Set('กขฃคฅฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ');
const ENGLISH_LETTER = /^[a-z]$/;

/** The character the next word must start with; null when the word cannot pass a link on. Stored cells only. */
export function linkOut(w: Word): string | null {
  if ('firstConsonant' in w) return THAI_CONSONANTS.has(w.lastChar) ? w.lastChar : null;
  return ENGLISH_LETTER.test(w.lastChar) ? w.lastChar : null;
}

/** The character a word starts a link with: the first consonant (Thai) or the first letter (English). */
export function linkIn(w: Word): string {
  return 'firstConsonant' in w ? w.firstConsonant : w.firstChar;
}

/** Can `w` take part in a chain at all: playable, both link cells eligible, and a consonant (or letter) at the end. */
export function chainEligible(w: Word): boolean {
  const first = 'firstConsonant' in w ? 'firstConsonant' : 'firstChar';
  return playable(w) && eligibleFor(w, 'lastChar') && eligibleFor(w, first) && linkOut(w) !== null;
}

/** Does `b` follow `a` in a chain? */
export function links(a: Word, b: Word): boolean {
  return a.id !== b.id && linkOut(a) !== null && linkOut(a) === linkIn(b);
}

type Graph = { readonly words: readonly Word[]; readonly next: ReadonlyMap<string, readonly Word[]> };
type ChainAnalysis = { readonly graph: Graph; readonly feasible: boolean; readonly fallback: readonly [readonly Word[], readonly Word[]] | null };

const analysisCache = new WeakMap<Banks, Map<string, ChainAnalysis>>();
const roundCache = new WeakMap<Banks, Map<string, readonly [readonly Word[], readonly Word[]]>>();
const ROUND_CACHE_SIZE = 64;

function graphOf(banks: Banks, setup: ScriptSetup): Graph {
  const words = ((banks[setup.lang] as Bank<Word>)[setup.pool] ?? []).filter(chainEligible);
  const next = new Map<string, Word[]>();
  for (const a of words) next.set(a.id, words.filter((b) => links(a, b)));
  return { words, next };
}

/**
 * Two word-disjoint chains of `length`, searching starts and successors in `rank` order (lower first): every first
 * chain, and for each every second chain, until a pair is found or `budget` nodes have been visited. `steps` counts
 * visited nodes; `exhausted` says the cap stopped the search, so a null pair then means "not found", not "none".
 */
export function findChainPair(
  graph: Graph,
  length: number,
  rank: ReadonlyMap<string, number>,
  budget: number = CHAIN_SEARCH_BUDGET,
): { pair: readonly [Word[], Word[]] | null; steps: number; exhausted: boolean } {
  let steps = 0;
  const byRank = (ws: readonly Word[]) => [...ws].sort((x, y) => rank.get(x.id)! - rank.get(y.id)!);
  const starts = byRank(graph.words);
  const nextRanked = new Map([...graph.next].map(([id, ws]) => [id, byRank(ws)]));
  function* chains(used: Set<string>): Generator<Word[]> {
    const path: Word[] = [];
    function* walk(w: Word): Generator<Word[]> {
      if (steps >= budget) return;
      steps++;
      path.push(w);
      used.add(w.id);
      if (path.length === length) yield [...path];
      else for (const n of nextRanked.get(w.id)!) if (!used.has(n.id)) yield* walk(n);
      path.pop();
      used.delete(w.id);
    }
    for (const s of starts) if (!used.has(s.id)) yield* walk(s);
  }
  for (const first of chains(new Set())) {
    for (const second of chains(new Set(first.map((w) => w.id)))) return { pair: [first, second], steps, exhausted: false };
    if (steps >= budget) break;
  }
  return { pair: null, steps, exhausted: steps >= budget };
}

export function analyseChain(banks: Banks, setup: ScriptSetup): ChainAnalysis {
  let per = analysisCache.get(banks);
  if (!per) analysisCache.set(banks, (per = new Map()));
  const key = `${setup.lang}|${setup.pool}`;
  let a = per.get(key);
  if (!a) {
    const graph = graphOf(banks, setup);
    const rank = new Map(graph.words.map((w, i) => [w.id, i]));
    const fallback = findChainPair(graph, CHAIN_LENGTH, rank).pair;
    a = { graph, feasible: fallback !== null, fallback };
    per.set(key, a);
  }
  return a;
}

function chainsFor(ctx: ComposeCtx): readonly [readonly Word[], readonly Word[]] {
  let per = roundCache.get(ctx.banks);
  if (!per) roundCache.set(ctx.banks, (per = new Map()));
  const key = [ctx.eventKey, ctx.round, ctx.seed, ctx.setup.lang, ctx.setup.pool].join('|');
  let pair = per.get(key);
  if (!pair) {
    const { graph, fallback } = analyseChain(ctx.banks, ctx.setup);
    const order = hashOrder('chain-order', [ctx.eventKey, ctx.round, ctx.seed, ctx.setup.lang, ctx.setup.pool], graph.words.map((w) => w.id));
    const found = findChainPair(graph, CHAIN_LENGTH, new Map(order.map((id, i) => [id, i]))).pair ?? fallback;
    if (!found) throw new Error('no chain pair although the pool is feasible');
    pair = found;
    if (per.size >= ROUND_CACHE_SIZE) per.clear();
    per.set(key, pair);
  }
  return pair;
}

export const CHAIN: Composer = {
  threshold: 1,
  infeasible(banks, setup) {
    const a = analyseChain(banks, setup);
    return a.feasible ? null : `${a.graph.words.length} chain-eligible words hold no two word-disjoint chains of ${CHAIN_LENGTH} within ${CHAIN_SEARCH_BUDGET} search nodes`;
  },
  compose(ctx: ComposeCtx): Composed {
    const chains = chainsFor(ctx);
    const base = [ctx.eventKey, ctx.round, ctx.seed, ctx.setup.lang, ctx.setup.pool];
    return {
      scripts: [chains[0].map((w) => w.id), chains[1].map((w) => w.id)],
      detail: { chains: chains.map((c) => c.map((w) => w.id)) },
      holding: (identity, group) => [chains[group][hashToScale('chain-word', [...base, idPart(identity)], chains[group].length)]!.id],
    };
  },
};
