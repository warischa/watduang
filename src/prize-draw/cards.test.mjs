// node --test — the dealt-card round: a composed hand that lands exactly on the schedule under whichever rule is drawn
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULE_PAIRS, decksNeeded, hostDealRound, phoneCard, satisfies } from './cards.ts';
import { phoneVerdicts } from './round-code.ts';
import { proposeSchedule } from './schedule.ts';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EVENT = '482913';
const guests = (n) => Array.from({ length: n }, (_, i) => `guest-${String(i + 1).padStart(3, '0')}`);
const ALL_CARDS = ['S', 'H', 'D', 'C'].flatMap((suit) => Array.from({ length: 13 }, (_, i) => ({ suit, rank: i + 1 })));

test('every rule pair splits the 52 faces into four non-empty groups (both, first only, second only, neither)', () => {
  assert.ok(RULE_PAIRS.length >= 2);
  for (const [a, b] of RULE_PAIRS) {
    for (const inA of [true, false]) {
      for (const inB of [true, false]) {
        const group = ALL_CARDS.filter((c) => satisfies(a, c) === inA && satisfies(b, c) === inB);
        assert.ok(group.length > 0, `${a}/${b} group ${inA}/${inB} is empty`);
      }
    }
  }
});

test('at N = 200, 52 and 37 every dealt round lands exactly on the schedule under either rule, counted off the card faces', () => {
  let dealt = 0;
  for (const n of [200, 52, 37]) {
    const schedule = proposeSchedule(n);
    const random = rng(n);
    for (let e = 0; e < 5; e++) {
      let alive = guests(n);
      for (let r = 1; r < schedule.length; r++) {
        const keep = schedule[r];
        const deal = hostDealRound(EVENT, r, alive, keep, random);
        assert.equal(deal.cards.size, alive.length, `n=${n} round ${r}`);
        assert.ok(decksNeeded(deal.cards.values()) >= 1);
        deal.pair.forEach((rule, i) => {
          const holders = alive.filter((id) => satisfies(rule, deal.cards.get(id)));
          assert.equal(holders.length, keep, `n=${n} round ${r} rule ${rule}`);
          assert.deepEqual(new Set(holders), new Set(deal.survivors[i]), `n=${n} round ${r} rule ${rule}`);
        });
        const drawn = random() < 0.5 ? 0 : 1;
        alive = deal.survivors[drawn];
        dealt++;
      }
    }
  }
  assert.equal(dealt, 3 * 5 * 4, 'every schedule step must be dealt');
});

test('a phone derives its own card from the deal code and its identity alone, before any rule is drawn, and it matches the host', () => {
  for (const n of [200, 52, 37]) {
    const roster = guests(n);
    const keep = proposeSchedule(n)[1];
    const deal = hostDealRound(EVENT, 1, roster, keep, rng(9 + n));
    assert.match(deal.code, /^\d{12}$/);
    for (const id of roster) {
      assert.deepEqual(phoneCard(EVENT, id, 1, deal.code), deal.cards.get(id), `n=${n} ${id}`);
      assert.deepEqual(phoneVerdicts(EVENT, id, [{ code: deal.code }], 'confirmed').verdicts, ['awaiting-rule'], id);
      for (const rule of [0, 1]) {
        const host = deal.survivors[rule].includes(id) ? 'in' : 'out';
        assert.deepEqual(phoneVerdicts(EVENT, id, [{ code: deal.code, rule }], 'confirmed').verdicts, [host], `${id} rule ${rule}`);
      }
    }
  }
});
