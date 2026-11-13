// Test-only fixtures for the cards reveal (gh#306). Not a *.test.mjs file, so the runner does not collect it.
// Every deal here is a real one: hostDealRound from the gh#300 domain code, never a hand-built card list,
// so a test that passes on these inputs passes on what the event actually commits.
import { hostDealRound } from '../../../prize-draw/cards.ts';

/** A small seeded source in [0, 1): mulberry32. */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** n people with opaque ids; one name is the board's two-line worst case. */
export function people(n, prefix = 'p') {
  return Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i.toString(36)}x`, name: i === 3 ? 'ฒำฒำฒำฒำฒำฒำฒำฒำฒำฒำฒำฒำ' : `นาม ${i}` }));
}

/** A committed deal for `ps` keeping `keep`, as the event persists it (cards in roster order). */
export function dealFor(ps, keep, { round = 1, seed = 7, eventKey = 'ev-key' } = {}) {
  const ids = ps.map((p) => p.id);
  const host = hostDealRound(eventKey, round, ids, keep, seeded(seed + ps.length * 1000 + keep));
  return {
    host,
    deal: { pair: host.pair, cards: ids.map((id) => ({ id, card: host.cards.get(id) })) },
    code: host.code,
    round,
  };
}

export function dealInput(ps, keep, opts = {}) {
  const d = dealFor(ps, keep, opts);
  return {
    key: `ev|r${d.round}|${d.code}`,
    eventName: 'งานเลี้ยง',
    people: ps,
    outcome: { kind: 'deal', game: 'cards', round: d.round, code: d.code, deal: d.deal },
    host: d.host,
  };
}

/** The committed round after the deal: the drawn rule and its survivors, in roster order. */
export function roundInput(ps, keep, rule, opts = {}) {
  const d = dealFor(ps, keep, opts);
  const kept = new Set(d.host.survivors[rule]);
  const survivors = ps.map((p) => p.id).filter((id) => kept.has(id));
  return {
    key: `ev|r${d.round}|${d.code}|${rule}`,
    eventName: 'งานเลี้ยง',
    people: ps,
    outcome: { kind: 'round', game: 'cards', round: d.round, code: d.code, deal: d.deal, rule, survivors },
    host: d.host,
  };
}
