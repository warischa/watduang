// Pure dealt-card logic for the prize draw: never touches DOM, storage or the network.
//
// How a hand lands exactly on the schedule. A deal round offers two rules (a pair), and the main screen draws one
// of them only AFTER every card is face up on the phones. The deal code carries two cuts (round-code.ts,
// hostDealCuts): the lowest `keep` fate values are "in under the first rule", the highest `keep` are "in under
// the second rule". Each identity therefore falls in one of four groups (in under both, first only, second only,
// neither), and it is dealt a card face from exactly that group of the 52. So the count holding a card that
// satisfies the drawn rule is `keep` by construction, whichever rule comes out.
//
// "As many decks as needed": faces are picked per identity with repetition, so a hand of 200 repeats faces and
// decksNeeded reports how many physical decks that hand would take. Nothing about fairness depends on it.
//
// A phone derives its own card from the deal code and its identity alone, before the rule is drawn. Most
// holders cannot read their fate from that card, because the two rules keep different people. The exception
// is inherent to any two-rule deal: two keep-sized subsets of n either overlap or leave a gap, so |n - 2 * keep|
// people hold a card in the "both" group (sure in) or the "neither" group (sure out). Only keep = n / 2 leaves
// everyone in suspense.

import { canonicalIdentity, dealFate, fateValue, hashToScale, hostDealCuts, parseCode } from './round-code.ts';

export type Suit = 'S' | 'H' | 'D' | 'C';
/** rank 1 is the ace, 11 to 13 are jack, queen, king. */
export type Card = { suit: Suit; rank: number };
export type RuleId = 'black' | 'clubs' | 'face';

const RULES: Record<RuleId, (card: Card) => boolean> = {
  black: (c) => c.suit === 'S' || c.suit === 'C',
  clubs: (c) => c.suit === 'C',
  face: (c) => c.rank >= 11,
};

export function satisfies(rule: RuleId, card: Card): boolean {
  return RULES[rule](card);
}

/**
 * Rule pairs a deal round can offer. Every pair must leave all four groups non-empty, because which groups a
 * deal uses depends on the head count (both-rules only when keep > half, neither-rule only when keep < half).
 * A pair such as black with clubs fails: clubs is inside black, so "clubs but not black" has no card.
 */
export const RULE_PAIRS: ReadonlyArray<readonly [RuleId, RuleId]> = [
  ['black', 'face'],
  ['clubs', 'face'],
];

const DECK: readonly Card[] = (['S', 'H', 'D', 'C'] as const).flatMap((suit) =>
  Array.from({ length: 13 }, (_, i) => ({ suit, rank: i + 1 })),
);

/** The pair offered in a deal round follows from the code, so host and phone agree without another digit. */
export function pairFor(eventKey: string, round: number, seed: string): readonly [RuleId, RuleId] {
  return RULE_PAIRS[hashToScale('pair', [eventKey, round, seed], RULE_PAIRS.length)]!;
}

function cardFor(
  eventKey: string,
  round: number,
  seed: string,
  identity: string,
  pair: readonly [RuleId, RuleId],
  inFirst: boolean,
  inSecond: boolean,
): Card {
  const group = DECK.filter((c) => satisfies(pair[0], c) === inFirst && satisfies(pair[1], c) === inSecond);
  return group[hashToScale('card', [eventKey, round, seed, canonicalIdentity(identity)], group.length)]!;
}

/**
 * Host side of a deal round: the code to show, the rule pair, each identity's card, and who is kept under
 * rule 0 and rule 1. The host draws the rule only after the deal, from its own random source.
 */
export function hostDealRound(
  eventKey: string,
  round: number,
  roster: string[],
  keep: number,
  random: () => number,
): {
  code: string;
  pair: readonly [RuleId, RuleId];
  cards: Map<string, Card>;
  survivors: [string[], string[]];
  tries: number;
} {
  const { code, seed, survivors, tries } = hostDealCuts(eventKey, round, roster, keep, random);
  const pair = pairFor(eventKey, round, seed);
  const first = new Set(survivors[0]);
  const second = new Set(survivors[1]);
  const cards = new Map<string, Card>();
  for (const id of roster) {
    cards.set(id, cardFor(eventKey, round, seed, id, pair, first.has(id), second.has(id)));
  }
  return { code, pair, cards, survivors, tries };
}

/** Phone side: this identity's card from the deal code alone; null when the code is not a valid deal code. */
export function phoneCard(eventKey: string, identity: string, round: number, code: string): Card | null {
  const parsed = parseCode(code, round);
  if (!parsed || parsed.kind !== 'deal') return null;
  const v = fateValue(eventKey, round, parsed.seed, identity);
  const pair = pairFor(eventKey, round, parsed.seed);
  return cardFor(eventKey, round, parsed.seed, identity, pair, dealFate(v, parsed, 0), dealFate(v, parsed, 1));
}

/** Physical decks a hand would take: the most copies of any one face. */
export function decksNeeded(cards: Iterable<Card>): number {
  const copies = new Map<string, number>();
  let most = 0;
  for (const c of cards) {
    const key = `${c.suit}${c.rank}`;
    const n = (copies.get(key) ?? 0) + 1;
    copies.set(key, n);
    most = Math.max(most, n);
  }
  return most;
}
