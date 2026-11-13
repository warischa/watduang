// The gh#306 criterion "survivors equal the schedule's target", proven on the gh#300 domain code as it
// stands (read only here): for every live count N and keep K that an accepted cut schedule can ask a round
// for, a real deal (hostDealRound) leaves exactly K cards meeting EACH of its two rules, and those K are the
// two cuts the code committed. Two parts make it structural rather than sampled:
//   1. The lemma: every rule pair on offer leaves all four groups of the deck non-empty (in under both
//      rules, first only, second only, neither). hostDealRound deals each identity a face from the group
//      of its own membership, so "meets rule j" holds exactly for the members of cut j, for ANY seed.
//   2. The cuts: for every reachable (N, K), the deal's two cuts are K identities each -- run on every
//      pair, not a sample of them.
// The (N, K) set is taken from the setup's own predicate (scheduleIssues), with a witness schedule per
// pair, so a custom target the MC may type is covered, not only proposeSchedule's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULE_PAIRS, hostDealRound, satisfies } from '../../../prize-draw/cards.ts';
import { ELIMINATION_ROUNDS, FINAL_SIZE, proposeSchedule } from '../../../prize-draw/schedule.ts';
import { MAX_HEADS, MIN_HEADS, scheduleIssues } from '../../../prize-event/event.ts';
import { seeded } from './fixtures.mjs';

const DECK = ['S', 'H', 'D', 'C'].flatMap((suit) => Array.from({ length: 13 }, (_, i) => ({ suit, rank: i + 1 })));

/** The four membership groups of a rule pair, as the deck splits them. */
function groups(pair) {
  const out = new Map();
  for (const first of [true, false]) {
    for (const second of [true, false]) {
      out.set(`${first}/${second}`, DECK.filter((c) => satisfies(pair[0], c) === first && satisfies(pair[1], c) === second));
    }
  }
  return out;
}

/**
 * The tightest schedule holding live count N then keep K at round r (1-based), or null when even that one
 * breaks the setup's bounds: heads count up from N one per earlier round, later rounds step down to 5.
 */
function witness(r, n, k) {
  const s = new Array(ELIMINATION_ROUNDS + 1);
  for (let i = 0; i <= r - 1; i++) s[i] = n + (r - 1 - i);
  s[r] = k;
  for (let i = r + 1; i <= ELIMINATION_ROUNDS; i++) s[i] = FINAL_SIZE + (ELIMINATION_ROUNDS - i);
  return s[0] >= MIN_HEADS && s[0] <= MAX_HEADS ? s : null;
}

/** Every (N, K) some accepted schedule asks a round for, with the first round that asks it. */
function reachablePairs() {
  const pairs = new Map();
  for (let r = 1; r <= ELIMINATION_ROUNDS; r++) {
    for (let n = 2; n <= MAX_HEADS; n++) {
      for (let k = 1; k < n; k++) {
        const s = witness(r, n, k);
        if (!s || scheduleIssues(s, s[0]).length) continue;
        const key = `${n}/${k}`;
        if (!pairs.has(key)) pairs.set(key, { n, k, round: r });
      }
    }
  }
  return [...pairs.values()];
}

const ids = (n, salt) => Array.from({ length: n }, (_, i) => `${salt}-${(i * 2654435761) >>> 0}`);

/** One real deal; returns the per-rule counts and asserts each equals its committed cut. */
function dealCounts(n, k, round, seed) {
  const roster = ids(n, `n${n}k${k}`);
  const { pair, cards, survivors } = hostDealRound('ev-gh306', round, roster, k, seeded(seed));
  assert.equal(cards.size, n, `N ${n} K ${k}: a card short`);
  const counts = [0, 1].map((j) => {
    const meeting = roster.filter((id) => satisfies(pair[j], cards.get(id)));
    assert.deepEqual(new Set(meeting), new Set(survivors[j]), `N ${n} K ${k} rule ${pair[j]}: the cards meeting it are not the committed cut`);
    return meeting.length;
  });
  return { pair, counts };
}

test('lemma: every rule pair on offer leaves all four groups of the deck non-empty', () => {
  for (const pair of RULE_PAIRS) {
    for (const [name, cards] of groups(pair)) assert.ok(cards.length > 0, `${pair.join('+')}: group ${name} is empty`);
  }
});

test('the lemma check bites: a nested pair (clubs inside black) has an empty group', () => {
  const empty = [...groups(['black', 'clubs']).entries()].filter(([, cards]) => cards.length === 0).map(([name]) => name);
  assert.deepEqual(empty, ['false/true'], 'the lemma check would pass a pair that cannot deal every membership');
});

test('the schedule predicate bites: a pair no accepted schedule asks for is left out', () => {
  const pairs = new Set(reachablePairs().map((p) => `${p.n}/${p.k}`));
  assert.ok(!pairs.has('200/5'), '200 to 5 in one round is not a schedule the setup accepts');
  assert.ok(!pairs.has('200/7'), 'round 1 must leave room for three more distinct steps');
  assert.ok(pairs.has('200/8') && pairs.has('6/5') && pairs.has('199/7'));
});

test('every reachable (N, K): each of the two drawn rules selects exactly K', () => {
  const pairs = reachablePairs();
  let checked = 0;
  for (const { n, k, round } of pairs) {
    const { pair, counts } = dealCounts(n, k, round, n * 7919 + k);
    assert.deepEqual(counts, [k, k], `N ${n} K ${k} pair ${pair.join('+')}`);
    checked++;
  }
  assert.equal(checked, pairs.length);
  assert.ok(checked > 18000, `only ${checked} pairs: the enumeration measured little`);
  console.log(`# cardinality: ${checked} (N, K) pairs, N ${Math.min(...pairs.map((p) => p.n))}..${Math.max(...pairs.map((p) => p.n))}`);
});

for (const heads of [200, 52, 37]) {
  test(`N = ${heads} by name: the proposed schedule's every round, and every K the setup accepts at ${heads}`, () => {
    const schedule = proposeSchedule(heads);
    for (let r = 1; r <= ELIMINATION_ROUNDS; r++) {
      const [n, k] = [schedule[r - 1], schedule[r]];
      for (const seed of [1, 2, 3]) assert.deepEqual(dealCounts(n, k, r, seed).counts, [k, k], `proposed ${schedule.join('>')} round ${r}`);
    }
    const ks = reachablePairs().filter((p) => p.n === heads);
    assert.ok(ks.length > 0);
    for (const { n, k, round } of ks) assert.deepEqual(dealCounts(n, k, round, k).counts, [k, k], `N ${n} K ${k}`);
  });
}
