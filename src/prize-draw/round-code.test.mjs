// node --test — the QR-mode round code: host and phone must agree on every fate from (code, identity) alone
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CUT_SCALE,
  FINAL_ROUND,
  ROUNDS,
  SEED_DIGITS,
  dammCheck,
  fateValue,
  hostCutRound,
  hostDealCuts,
  hostFinalCode,
  parseCode,
  phoneFinalSlot,
  phoneVerdicts,
} from './round-code.ts';
import { proposeSchedule } from './schedule.ts';

// Deterministic test PRNG (mulberry32): the host takes its randomness injected, so tests replay exactly.
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
// Verdicts of a phone whose membership the post-start status fetch confirmed.
const confirmed = (id, entries) => phoneVerdicts(EVENT, id, entries, 'confirmed').verdicts;

// One whole event on the host: every elimination round down the proposed schedule.
function hostEvent(roster, random, value) {
  const schedule = proposeSchedule(roster.length);
  const rounds = [];
  let alive = roster;
  for (let r = 1; r < schedule.length; r++) {
    const out = value
      ? hostCutRound(EVENT, r, alive, schedule[r], random, value)
      : hostCutRound(EVENT, r, alive, schedule[r], random);
    rounds.push(out);
    alive = out.survivors;
  }
  return rounds;
}

test('a cut code is 9 ASCII digits (5-digit seed), keeps its leading zeros, and parses back on its own round', () => {
  assert.equal(SEED_DIGITS, 5);
  const zero = hostCutRound(EVENT, 1, guests(50), 20, () => 0);
  assert.match(zero.code, /^\d{9}$/);
  assert.ok(zero.code.startsWith('00000'), `seed drawn from random()=0 must print as 00000, got ${zero.code}`);
  const parsed = parseCode(zero.code, 1);
  assert.equal(parsed?.kind, 'cut');
  assert.equal(parsed?.seed, '00000');
});

// Overturned by the gh300 SOLVE verdict D2: round 5 is no longer refused outright. It admits a 6-digit final
// code and nothing else (see the length/round matrix test below); 9- and 12-digit codes stay refused there,
// and both elimination host functions still refuse round 5.
test('elimination round domain: cut and deal codes belong to rounds 1-4; a code drawn for one round never parses in another', () => {
  assert.deepEqual(ROUNDS, [1, 2, 3, 4]);
  const random = rng(11);
  for (const a of ROUNDS) {
    for (let i = 0; i < 25; i++) {
      const codes = [hostCutRound(EVENT, a, guests(52), 20, random).code, hostDealCuts(EVENT, a, guests(52), 20, random).code];
      for (const code of codes) {
        assert.ok(parseCode(code, a), code);
        for (const b of ROUNDS) if (b !== a) assert.equal(parseCode(code, b), null, `round-${a} code ${code} parsed in round ${b}`);
        for (const outside of [0, 5, 10, 11, 12, 13, 14, -1, 1.5]) {
          assert.equal(parseCode(code, outside), null, `round-${a} code ${code} parsed in out-of-domain round ${outside}`);
        }
      }
    }
  }
  for (const outside of [0, 5, 10]) {
    assert.throws(() => hostCutRound(EVENT, outside, guests(50), 20, random), RangeError);
    assert.throws(() => hostDealCuts(EVENT, outside, guests(50), 20, random), RangeError);
  }
});

test('the check digit rejects every single-digit typo, every adjacent swap, and a code typed into the wrong round', () => {
  const random = rng(7);
  for (let i = 0; i < 40; i++) {
    const { code } = hostCutRound(EVENT, 2, guests(52), 20, random);
    assert.ok(parseCode(code, 2), code);
    assert.equal(parseCode(code, 1), null, `round-2 code accepted as round 1: ${code}`);
    assert.equal(parseCode(code, 3), null, `round-2 code accepted as round 3: ${code}`);
    for (let p = 0; p < code.length; p++) {
      for (let d = 0; d <= 9; d++) {
        if (String(d) === code[p]) continue;
        const typo = code.slice(0, p) + d + code.slice(p + 1);
        assert.equal(parseCode(typo, 2), null, `typo ${typo} of ${code} accepted`);
      }
      if (p + 1 < code.length && code[p] !== code[p + 1]) {
        const swap = code.slice(0, p) + code[p + 1] + code[p] + code.slice(p + 2);
        assert.equal(parseCode(swap, 2), null, `swap ${swap} of ${code} accepted`);
      }
    }
  }
  assert.equal(dammCheck('5724'), 0, 'Damm reference vector 572 + check digit 4');
});

test('a code typed with Thai numerals, spaces or a dash reads the same as plain digits', () => {
  const { code } = hostCutRound(EVENT, 1, guests(50), 20, rng(3));
  const thai = [...code].map((c) => String.fromCharCode(0x0e50 + Number(c))).join('');
  const spaced = `${code.slice(0, 4)} ${code.slice(4)}`;
  const dashed = `${code.slice(0, 4)}-${code.slice(4)}`;
  assert.ok(parseCode(code, 1), 'the plain code itself must parse');
  for (const variant of [thai, spaced, dashed]) {
    assert.deepEqual(parseCode(variant, 1), parseCode(code, 1), variant);
  }
  assert.equal(parseCode(`${code.slice(0, 7)}x`, 1), null);
});

test('every drawn code keeps exactly the scheduled count at N = 50, 52 and 200', () => {
  for (const n of [50, 52, 200]) {
    const schedule = proposeSchedule(n);
    const random = rng(n);
    for (let e = 0; e < 20; e++) {
      const rounds = hostEvent(guests(n), random);
      assert.equal(rounds.length, 4, `n=${n}: the walk must cover 4 elimination rounds`);
      rounds.forEach((r, i) => assert.equal(r.survivors.length, schedule[i + 1], `n=${n} round ${i + 1}`));
    }
  }
});

test('phone fate equals host fate for every identity of the roster in every round, eliminated ones included', () => {
  let compared = 0;
  for (const n of [50, 52, 200]) {
    const roster = guests(n);
    const random = rng(1000 + n);
    for (let e = 0; e < 10; e++) {
      const rounds = hostEvent(roster, random);
      const entries = rounds.map((r) => ({ code: r.code }));
      for (const id of roster) {
        const verdicts = confirmed(id, entries);
        assert.equal(verdicts.length, rounds.length);
        rounds.forEach((r, i) => {
          const host = r.survivors.includes(id) ? 'in' : 'out';
          assert.equal(verdicts[i], host, `n=${n} event ${e} round ${i + 1} ${id}`);
          compared++;
        });
      }
    }
  }
  assert.equal(compared, (50 + 52 + 200) * 10 * 4);
});

test('a phone knocked out earlier stays out even when a later code alone would let it through', () => {
  const roster = guests(200);
  const random = rng(42);
  let witnessed = 0;
  for (let e = 0; e < 5 && witnessed === 0; e++) {
    const rounds = hostEvent(roster, random);
    const second = parseCode(rounds[1].code, 2);
    for (const id of roster) {
      if (rounds[0].survivors.includes(id)) continue;
      if (fateValue(EVENT, 2, second.seed, id) >= second.cut) continue;
      witnessed++;
      const verdicts = confirmed(id, rounds.map((r) => ({ code: r.code })));
      assert.deepEqual(verdicts, ['out', 'out', 'out', 'out'], id);
    }
  }
  assert.ok(witnessed > 0, 'no round-1 loser passed round 2 in isolation; the case was never exercised');
});

test('a bad code stops the phone instead of guessing, and later rounds stay unknown', () => {
  const rounds = hostEvent(guests(50), rng(5));
  const entries = rounds.map((r) => ({ code: r.code }));
  const last = entries[1].code.length - 1;
  const typo = entries[1].code.slice(0, last) + ((Number(entries[1].code[last]) + 1) % 10);
  entries[1] = { code: typo };
  const v = confirmed(rounds[0].survivors[0], entries);
  assert.deepEqual(v.slice(1), ['bad-code', 'unknown', 'unknown']);
});

test('identities: sequential ids and one-character-apart Thai nicknames hash apart; NFC and NFD of one nickname hash equal', () => {
  const ids = [...guests(200), 'ต้น', 'ต้อ', 'ต้ม', 'ตั้ม', 'นก', 'นุ่น'];
  const values = ids.map((id) => fateValue(EVENT, 1, '0042', id));
  for (const v of values) assert.ok(Number.isInteger(v) && v >= 0 && v < CUT_SCALE);
  assert.ok(new Set(values).size > ids.length * 0.75, 'values clump: the hash is not spreading identities');
  assert.equal(fateValue(EVENT, 1, '0042', 'Renée'), fateValue(EVENT, 1, '0042', 'Renée'));
  assert.notEqual(fateValue(EVENT, 1, '0042', 'guest-001'), fateValue(EVENT, 2, '0042', 'guest-001'));
});

test('a malformed identity (lone surrogate) is refused by both host paths and by the phone', () => {
  const lone = Array.from({ length: 50 }, (_, i) => String.fromCharCode(0xd800 + i));
  assert.throws(() => hostCutRound(EVENT, 1, lone, 20, rng(1)), { name: 'RangeError', message: /malformed/ });
  assert.throws(() => hostDealCuts(EVENT, 1, lone, 20, rng(1)), { name: 'RangeError', message: /malformed/ });
  const mixed = [...guests(49), '\udc00'];
  assert.throws(() => hostCutRound(EVENT, 1, mixed, 20, rng(1)), { name: 'RangeError', message: /malformed/ });
  const { code } = hostCutRound(EVENT, 1, guests(50), 20, rng(1));
  assert.throws(() => phoneVerdicts(EVENT, '\ud800', [{ code }], 'confirmed'), { name: 'RangeError', message: /malformed/ });
  // A well-formed pair outside the BMP is a normal identity.
  assert.doesNotThrow(() => phoneVerdicts(EVENT, 'a\ud83d\ude00', [{ code }], 'confirmed'));
});

test('membership: a removed identity never reads in; an unconfirmed one is flagged provisional; a confirmed one is not', () => {
  // Counter-example from the REFUTE round: 50 joined, guest-001 removed at review, the host keeps 20 of the other 49.
  const roster = guests(50).slice(1);
  const random = rng(300);
  let witnessed = 0;
  for (let e = 0; e < 40; e++) {
    const { code, survivors } = hostCutRound(EVENT, 1, roster, 20, random);
    const entries = [{ code }];
    const parsed = parseCode(code, 1);
    const wouldPass = fateValue(EVENT, 1, parsed.seed, 'guest-001') < parsed.cut;
    if (wouldPass) witnessed++;
    const removed = phoneVerdicts(EVENT, 'guest-001', entries, 'removed');
    assert.deepEqual(removed.verdicts, ['removed']);
    assert.equal(removed.provisional, false);
    const unconfirmed = phoneVerdicts(EVENT, 'guest-001', entries, 'unconfirmed');
    assert.equal(unconfirmed.provisional, true, 'an unconfirmed phone must tell the UI the main screen decides');
    const member = roster.find((id) => survivors.includes(id));
    const ok = phoneVerdicts(EVENT, member, entries, 'confirmed');
    assert.deepEqual(ok.verdicts, ['in']);
    assert.equal(ok.provisional, false);
  }
  assert.ok(witnessed > 0, 'the removed identity never passed the cut in isolation; the hazard was never exercised');
  assert.throws(() => phoneVerdicts(EVENT, 'guest-001', [], 'maybe'), RangeError);
});

// Conditional fairness: for ONE fixed event key and roster, enumerate every seed, so each identity's exact
// probability of surviving the round is known with no sampling noise. The stated bound is 5 binomial standard
// deviations over the valid seeds this enumeration counted: |P(identity) - keep/N| <= 5 * sqrt(p * (1 - p) / valid).
function exactRoundOdds(n, keep, value) {
  const roster = guests(n);
  const wins = new Map(roster.map((id) => [id, 0]));
  const space = 10 ** SEED_DIGITS;
  let valid = 0;
  for (let s = 0; s < space; s++) {
    let used = false;
    const forced = () => {
      if (used) throw new Error('tie');
      used = true;
      return (s + 0.5) / space;
    };
    let survivors;
    try {
      survivors = (value ? hostCutRound(EVENT, 1, roster, keep, forced, value) : hostCutRound(EVENT, 1, roster, keep, forced)).survivors;
    } catch (err) {
      if (err.message === 'tie') continue;
      throw err;
    }
    valid++;
    for (const id of survivors) wins.set(id, wins.get(id) + 1);
  }
  const p = keep / n;
  const maxDev = Math.max(...[...wins.values()].map((w) => Math.abs(w / valid - p)));
  return { valid, maxDev, bound: 5 * Math.sqrt((p * (1 - p)) / valid) };
}

test('canary: one fixed N = 12 roster, every seed enumerated, stays inside 5 SD (the gate is the random-roster sweep in the gh300 evidence script)', (t) => {
  const { valid, maxDev, bound } = exactRoundOdds(12, 6);
  t.diagnostic(`valid seeds ${valid}, max |deviation| ${maxDev.toFixed(5)}, bound ${bound.toFixed(5)}`);
  assert.ok(valid >= 90000, `only ${valid} valid seeds`);
  assert.ok(maxDev <= bound, `max |deviation| ${maxDev} > bound ${bound}`);
});

test('must-red: the same enumeration with one identity favoured by 3% of the hash range breaks the bound', (t) => {
  const biased = (e, r, s, id) => {
    const v = fateValue(e, r, s, id);
    return id === 'guest-001' ? Math.floor(v * 0.97) : v;
  };
  const { maxDev, bound } = exactRoundOdds(12, 6, biased);
  t.diagnostic(`biased: max |deviation| ${maxDev.toFixed(5)}, bound ${bound.toFixed(5)}`);
  assert.ok(maxDev > bound, `biased variant stayed inside the bound: ${maxDev}`);
});

test('must-red: guest-001 favoured by x0.98275 lands between the valid-seed bound and the old fixed-floor bound, and fails', (t) => {
  const biased = (e, r, s, id) => {
    const v = fateValue(e, r, s, id);
    return id === 'guest-001' ? Math.floor(v * 0.98275) : v;
  };
  const { valid, maxDev, bound } = exactRoundOdds(12, 6, biased);
  t.diagnostic(`x0.98275: valid ${valid}, max |deviation| ${maxDev.toFixed(6)}, bound ${bound.toFixed(6)}`);
  assert.ok(maxDev > bound, `x0.98275 variant stayed inside the bound: ${maxDev} <= ${bound}`);
});

// Equal odds: over many seeded events, how often each identity reaches the final of 5.
// Tolerance: every identity within 4 binomial standard errors of the expected rate.
function reachFinalZ(value) {
  const n = 50;
  const events = 3000;
  const roster = guests(n);
  const random = rng(2026);
  const counts = new Map(roster.map((id) => [id, 0]));
  for (let e = 0; e < events; e++) {
    const rounds = hostEvent(roster, random, value);
    for (const id of rounds[rounds.length - 1].survivors) counts.set(id, counts.get(id) + 1);
  }
  const p = 5 / n;
  const se = Math.sqrt(events * p * (1 - p));
  return Math.max(...[...counts.values()].map((c) => Math.abs(c - events * p) / se));
}

test('every identity reaches the final with equal frequency (max |z| <= 4, n = 3000 events at N = 50)', (t) => {
  const z = reachFinalZ();
  t.diagnostic(`fair: max |z| = ${z.toFixed(2)}`);
  assert.ok(z <= 4, `max |z| = ${z.toFixed(2)}`);
});

test('must-red: a variant favouring every tenth identity by 10% of the hash range fails the same check', (t) => {
  const favoured = (id) => Number(id.slice(-3)) % 10 === 0;
  const biased = (e, r, s, id) => {
    const v = fateValue(e, r, s, id);
    return favoured(id) ? Math.floor(v * 0.9) : v;
  };
  const z = reachFinalZ(biased);
  t.diagnostic(`biased: max |z| = ${z.toFixed(2)}`);
  assert.ok(z > 4, `biased variant passed: max |z| = ${z.toFixed(2)}`);
});

test('must-red: the same hash without its finaliser (raw FNV-1a state) fails the same check', (t) => {
  const encoder = new TextEncoder();
  const raw = (e, r, s, id) => {
    let h = 0x811c9dc5;
    for (const b of encoder.encode(['fate', e, r, s, id.normalize('NFC')].join('\u001f'))) {
      h ^= b;
      h = Math.imul(h, 0x01000193);
    }
    return Math.floor(((h >>> 0) * CUT_SCALE) / 4294967296);
  };
  const z = reachFinalZ(raw);
  t.diagnostic(`no finaliser: max |z| = ${z.toFixed(2)}`);
  assert.ok(z > 4, `unfinalised hash passed: max |z| = ${z.toFixed(2)}`);
});

// Seeded Fisher-Yates shuffle.
function shuffled(list, random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
const sameSet = (a, b) => a.length === b.length && [...a].sort().join('\u001f') === [...b].sort().join('\u001f');

test('roster order never changes the code or the survivor set, for both host functions', () => {
  for (let t = 0; t < 60; t++) {
    const roster = guests(60);
    const reordered = shuffled(roster, rng(500 + t));
    const a = hostCutRound(EVENT, 2, roster, 25, rng(t));
    const b = hostCutRound(EVENT, 2, reordered, 25, rng(t));
    assert.equal(b.code, a.code, `cut ${t}`);
    assert.ok(sameSet(a.survivors, b.survivors), `cut ${t}`);
    const c = hostDealCuts(EVENT, 3, roster, 25, rng(t));
    const d = hostDealCuts(EVENT, 3, reordered, 25, rng(t));
    assert.equal(d.code, c.code, `deal ${t}`);
    assert.ok(sameSet(c.survivors[0], d.survivors[0]) && sameSet(c.survivors[1], d.survivors[1]), `deal ${t}`);
  }
});

// One whole event through round 4, then a final order handed over by the tracer (a plain array).
function finalEvent(seed) {
  const roster = guests(50);
  const rounds = hostEvent(roster, rng(seed));
  const order = shuffled(rounds[3].survivors, rng(seed + 7));
  return { roster, entries: rounds.map((r) => ({ code: r.code })), order, code: hostFinalCode(EVENT, order) };
}

test('final code: 6 digits, encodes the given order, and every finalist phone decodes its own index', () => {
  assert.equal(FINAL_ROUND, 5);
  for (let e = 0; e < 25; e++) {
    const { entries, order, code } = finalEvent(900 + e);
    assert.ok(code !== null, `event ${e}: no seed encodes the order`);
    assert.match(code, /^\d{6}$/);
    assert.equal(hostFinalCode(EVENT, order), code, 'the final code is a function of the order: no new draw');
    order.forEach((id, i) => {
      assert.deepEqual(phoneFinalSlot(EVENT, id, entries, code, 'confirmed'), { verdict: 'in', slot: i, provisional: false }, `event ${e} ${id}`);
    });
  }
});

test('final code: an eliminated phone holding the final code reads out with no slot', () => {
  let eliminated = 0;
  for (let e = 0; e < 5; e++) {
    const { roster, entries, order, code } = finalEvent(1900 + e);
    for (const id of roster) {
      if (order.includes(id)) continue;
      eliminated++;
      assert.deepEqual(phoneFinalSlot(EVENT, id, entries, code, 'confirmed'), { verdict: 'out', slot: null, provisional: false }, id);
    }
  }
  assert.equal(eliminated, 5 * 45);
});

test('final code: removed stays removed, unconfirmed is provisional, a missing round or a typo gives no slot', () => {
  const { entries, order, code } = finalEvent(77);
  const finalist = order[2];
  assert.deepEqual(phoneFinalSlot(EVENT, finalist, entries, code, 'removed'), { verdict: 'removed', slot: null, provisional: false });
  assert.deepEqual(phoneFinalSlot(EVENT, finalist, entries, code, 'unconfirmed'), { verdict: 'in', slot: 2, provisional: true });
  assert.deepEqual(phoneFinalSlot(EVENT, finalist, entries.slice(0, 3), code, 'confirmed'), { verdict: 'unknown', slot: null, provisional: false });
  const typo = code.slice(0, 5) + ((Number(code[5]) + 1) % 10);
  assert.deepEqual(phoneFinalSlot(EVENT, finalist, entries, typo, 'confirmed'), { verdict: 'bad-code', slot: null, provisional: false });
  assert.throws(() => hostFinalCode(EVENT, order.slice(0, 4)), RangeError);
  assert.throws(() => hostFinalCode(EVENT, [order[0], ...order.slice(0, 4)]), RangeError);
});

test('length/round matrix: rounds 1-4 take only 9 or 12 digits, round 5 only 6, whatever the check digit says', () => {
  const withCheckFor = (round, payload) => payload + dammCheck(String(round) + payload);
  const random = rng(4242);
  const digits = (k) => Array.from({ length: k }, () => Math.floor(random() * 10)).join('');
  for (let i = 0; i < 200; i++) {
    for (const round of [1, 2, 3, 4, 5]) {
      for (const length of [6, 9, 12]) {
        const code = withCheckFor(round, digits(length - 1));
        const admitted = round === FINAL_ROUND ? length === 6 : length !== 6;
        if (admitted) assert.ok(parseCode(code, round), `round ${round} refused its own ${length}-digit code ${code}`);
        else assert.equal(parseCode(code, round), null, `round ${round} accepted a ${length}-digit code ${code}`);
      }
    }
  }
  assert.equal(parseCode(withCheckFor(6, digits(5)), 6), null, 'round 6 is outside the domain');
});

test('hostFinalCode refuses a sparse order (array holes are not identities)', () => {
  const sparse = ['a', 'b', 'c', 'd'];
  sparse.length = 5;
  assert.throws(() => hostFinalCode(EVENT, sparse), RangeError);
  const holed = ['a', 'b', , 'd', 'e'];
  assert.throws(() => hostFinalCode(EVENT, holed), RangeError);
  assert.throws(() => hostFinalCode(EVENT, ['a', 'b', 'c', 'd', 5]), RangeError);
});

// Independent from-scratch reference of the documented hash: FNV-1a over the UTF-8 of the joined fields,
// then the MurmurHash3 finaliser, scaled. fateValue keeps per-call caches for speed; they must never change
// a result, whatever order calls arrive in.
function referenceFate(eventKey, round, seed, identity) {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(['fate', eventKey, round, seed, identity.normalize('NFC')].join('\u001f'))) {
    h ^= b;
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return Math.floor(((h >>> 0) * CUT_SCALE) / 4294967296);
}

test('fateValue equals a from-scratch reference under interleaved events, rounds, seeds and identities', () => {
  const random = rng(8080);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const events = ['482913', '482914', '000001'];
  const seeds = ['00000', '00001', '54321', '99999'];
  const ids = [...guests(30), 'Renée', 'Renée', 'ต้น', 'a😀'];
  for (let i = 0; i < 20000; i++) {
    const e = pick(events);
    const r = 1 + Math.floor(random() * 5);
    const s = pick(seeds);
    const id = pick(ids);
    assert.equal(fateValue(e, r, s, id), referenceFate(e, r, s, id), `${e}/${r}/${s}/${id}`);
  }
});
