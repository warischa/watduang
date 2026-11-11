// Heavy many-event simulation behind the gh300 README. Not collected by any test runner.
// Run from the repo root: node docs/verification/evidence/gh300-round-code-2026-11-11/simulate.mjs [scale]
// scale multiplies every event count (default 1). Seeds come from crypto, as the page would draw them.
// Two narrower modes feed the must-red runs:
//   simulate.mjs sweep <rosters at N=200> <rosters at N=300>   the random-roster sweep alone
//   simulate.mjs roster <file.json>                            one roster file through the same sweep gates
// Every result is also asserted: a failed check prints CHECK FAILED and the script exits 1.
import { readFileSync } from 'node:fs';
import { getRandomValues } from 'node:crypto';
import {
  CUT_SCALE,
  SEED_DIGITS,
  fateValue,
  hostFinalCode,
  hostCutRound,
  hostDealCuts,
  parseCode,
  phoneVerdicts,
} from '../../../../src/prize-draw/round-code.ts';
import { decksNeeded, hostDealRound, phoneCard, satisfies } from '../../../../src/prize-draw/cards.ts';
import { proposeSchedule } from '../../../../src/prize-draw/schedule.ts';

const scale = Number(process.argv[2] ?? 1);
const EVENT = '482913';
const buf = new Uint32Array(1);
const cryptoRandom = () => (getRandomValues(buf), buf[0] / 4294967296);
const guests = (n) => Array.from({ length: n }, (_, i) => `guest-${String(i + 1).padStart(3, '0')}`);
const quantile = (xs, q) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const variance = (xs) => {
  const m = mean(xs);
  return xs.reduce((acc, x) => acc + (x - m) ** 2, 0) / Math.max(1, xs.length - 1);
};
const out = (label, obj) => console.log(`${label} ${JSON.stringify(obj)}`);
let failures = 0;
const check = (ok, what) => {
  if (!ok) {
    failures++;
    console.log(`CHECK FAILED: ${what}`);
  }
};
const TRIES_BOUND = 20;

// 1. Tries per round, cut rounds and deal rounds, walking the proposed schedule; plus a positive control:
//    the same separability test on ideal uniform values (crypto), which the hash must match.
function triesTable(n, events) {
  const schedule = proposeSchedule(n);
  const cut = schedule.slice(1).map(() => []);
  const deal = schedule.slice(1).map(() => []);
  const ideal = schedule.slice(1).map(() => []);
  for (let e = 0; e < events; e++) {
    let alive = guests(n);
    for (let r = 1; r < schedule.length; r++) {
      const keep = schedule[r];
      const c = hostCutRound(EVENT, r, alive, keep, cryptoRandom);
      cut[r - 1].push(c.tries);
      deal[r - 1].push(hostDealCuts(EVENT, r, alive, keep, cryptoRandom).tries);
      // ideal: iid uniform integers on the same scale, cut boundary only
      for (let t = 1; ; t++) {
        const vs = alive.map(() => Math.floor(cryptoRandom() * CUT_SCALE)).sort((a, b) => a - b);
        if (vs[keep - 1] < vs[keep]) { ideal[r - 1].push(t); break; }
      }
      alive = c.survivors;
    }
  }
  const row = (xs) => ({ mean: +mean(xs).toFixed(3), p99: quantile(xs, 0.99), max: Math.max(...xs) });
  for (let i = 0; i < cut.length; i++) {
    check(Math.max(...cut[i], ...deal[i]) <= TRIES_BOUND, `tries n=${n} round ${i + 1} exceeded ${TRIES_BOUND}`);
    // within 6 standard errors of the difference of the two means
    const se = Math.sqrt(variance(cut[i]) / cut[i].length + variance(ideal[i]) / ideal[i].length);
    check(Math.abs(mean(cut[i]) - mean(ideal[i])) <= 6 * se + 1e-9, `tries n=${n} round ${i + 1}: hash mean strays from the ideal control`);
    check(cut[i].length === events && deal[i].length === events, `tries n=${n} round ${i + 1}: rounds missing`);
    out(`tries n=${n} round=${i + 1} ${schedule[i]}->${schedule[i + 1]} events=${events}`, {
      cut: row(cut[i]), idealCut: row(ideal[i]), deal: row(deal[i]),
    });
  }
  const all = cut.flat();
  const allDeal = deal.flat();
  out(`tries n=${n} all-rounds events=${events}`, { cut: row(all), deal: row(allDeal) });
}

// 2. Phone == host for every identity of the roster in every round (cut rounds), counted.
function phoneHost(n, events) {
  const schedule = proposeSchedule(n);
  const roster = guests(n);
  let compared = 0;
  let mismatched = 0;
  for (let e = 0; e < events; e++) {
    let alive = roster;
    const rounds = [];
    for (let r = 1; r < schedule.length; r++) {
      const c = hostCutRound(EVENT, r, alive, schedule[r], cryptoRandom);
      rounds.push(c);
      alive = c.survivors;
    }
    const entries = rounds.map((c) => ({ code: c.code }));
    for (const id of roster) {
      const { verdicts: v } = phoneVerdicts(EVENT, id, entries, 'confirmed');
      rounds.forEach((c, i) => {
        compared++;
        if (v[i] !== (c.survivors.includes(id) ? 'in' : 'out')) mismatched++;
      });
    }
  }
  check(mismatched === 0, `phone==host n=${n}: ${mismatched} mismatches`);
  check(compared === n * events * (schedule.length - 1), `phone==host n=${n}: compared ${compared}`);
  out(`phone==host n=${n} events=${events}`, { compared, mismatched });
}

// 3. Equal frequency: reach-the-final rate per identity over many events; max |z| against the binomial SE.
function reachFinal(n, events, value) {
  const schedule = proposeSchedule(n);
  const roster = guests(n);
  const counts = new Map(roster.map((id) => [id, 0]));
  for (let e = 0; e < events; e++) {
    let alive = roster;
    for (let r = 1; r < schedule.length; r++) {
      alive = (value
        ? hostCutRound(EVENT, r, alive, schedule[r], cryptoRandom, value)
        : hostCutRound(EVENT, r, alive, schedule[r], cryptoRandom)).survivors;
    }
    for (const id of alive) counts.set(id, counts.get(id) + 1);
  }
  const p = 5 / n;
  const se = Math.sqrt(events * p * (1 - p));
  const zs = [...counts.values()].map((c) => (c - events * p) / se);
  const rates = [...counts.values()].map((c) => c / events);
  const maxRel = Math.max(...rates.map((x) => Math.abs(x - p) / p));
  return { p, maxAbsZ: +Math.max(...zs.map(Math.abs)).toFixed(2), maxRelDeviation: +maxRel.toFixed(4), se: +(se / events).toFixed(5) };
}

const favoured = (id) => Number(id.slice(-3)) % 10 === 0;
const biased10 = (e, r, s, id) => { const v = fateValue(e, r, s, id); return favoured(id) ? Math.floor(v * 0.9) : v; };
const biased3 = (e, r, s, id) => { const v = fateValue(e, r, s, id); return favoured(id) ? Math.floor(v * 0.97) : v; };
// Plausible weak variant: the same FNV-1a with no finaliser, scaled from its raw 32-bit state.
function noFinaliser(e, r, s, id) {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(['fate', e, r, s, id.normalize('NFC')].join('\u001f'))) {
    h ^= b; h = Math.imul(h, 0x01000193);
  }
  return Math.floor(((h >>> 0) * CUT_SCALE) / 4294967296);
}

// 4. Conditional spread, the gate. Ex ante the odds are exact by exchangeability; for one fixed event key and
//    roster each identity's chance is a fixed number. This sweep draws random rosters in the production id
//    shape (16 random bytes, base64url) from a seeded PRNG, enumerates EVERY seed of round 1 for each, and
//    gates the pooled spread: z = (chance - keep/N) / sqrt(p (1 - p) / valid seeds).
//    The enumeration calls the production fateValue for every (seed, identity): no hash copy lives here, so
//    whatever production computes is what the gate sees (the prefix-state speed-up is inside round-code.ts).

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}
const randomId = (next) => {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i += 4) new DataView(bytes.buffer).setUint32(i, next());
  return Buffer.from(bytes).toString('base64url');
};
const randomPin = (next) => String(next() % 1000000).padStart(6, '0');
const SWEEP_GATES = { pooledSdZ: [0.97, 1.03], fracAbsZOver3: [0.0017, 0.0037], maxAbsZ: 5, medianWorstDeviation: 0.006 };

function hashParity() {
  const next = mulberry(31337);
  // The enumeration's separability rule must match the host's: forced seeds through hostCutRound.
  const roster = Array.from({ length: 60 }, () => randomId(next));
  const { cutFor } = enumerateRoster('482913', 1, roster, 25, 300);
  let agreed = 0;
  for (let s = 0; s < 300; s++) {
    let used = false;
    const forced = () => {
      if (used) throw new Error('tie');
      used = true;
      return (s + 0.5) / 10 ** SEED_DIGITS;
    };
    let host = null;
    try {
      host = hostCutRound('482913', 1, roster, 25, forced);
    } catch (err) {
      if (err.message !== 'tie') throw err;
    }
    const expected = cutFor[s];
    if (host === null ? expected === -1 : Number(host.code.slice(SEED_DIGITS, SEED_DIGITS + 3)) === expected) agreed++;
  }
  check(agreed === 300, `enumeration separability disagrees with hostCutRound on ${300 - agreed} of 300 seeds`);
  out('enumeration-control', { enumerationVsHostSeeds: `${agreed}/300` });
}

// Every seed of one round for one roster: per-identity wins and the valid-seed count. limit cuts the scan
// short only for the parity control; cutFor records each scanned seed's cut (-1 on a boundary tie).
function enumerateRoster(event, round, roster, keep, limit = 10 ** SEED_DIGITS) {
  const n = roster.length;
  const wins = new Int32Array(n);
  const vals = new Int32Array(n);
  const hist = new Int32Array(CUT_SCALE);
  const cutFor = [];
  let valid = 0;
  for (let s = 0; s < limit; s++) {
    const seed = String(s).padStart(SEED_DIGITS, '0');
    hist.fill(0);
    for (let i = 0; i < n; i++) {
      const v = fateValue(event, round, seed, roster[i]);
      vals[i] = v;
      hist[v]++;
    }
    let below = 0;
    let c = 0;
    while (below + hist[c] <= keep) below += hist[c++];
    if (below !== keep) {
      if (limit < 10 ** SEED_DIGITS) cutFor.push(-1);
      continue;
    }
    if (limit < 10 ** SEED_DIGITS) cutFor.push(c);
    valid++;
    for (let i = 0; i < n; i++) if (vals[i] < c) wins[i]++;
  }
  return { valid, wins, cutFor };
}

function rosterSpread(event, roster, keep) {
  const { valid, wins } = enumerateRoster(event, 1, roster, keep);
  const p = keep / roster.length;
  const sd = Math.sqrt((p * (1 - p)) / valid);
  const zs = Array.from(wins, (w) => (w / valid - p) / sd);
  const maxZ = Math.max(...zs.map(Math.abs));
  return { valid, zs, maxZ, worstDeviation: maxZ * sd };
}

function gateSweep(label, results) {
  const zAll = results.flatMap((r) => r.zs);
  const pooledSdZ = Math.sqrt(zAll.reduce((acc, z) => acc + z * z, 0) / zAll.length);
  const fracAbsZOver3 = zAll.filter((z) => Math.abs(z) > 3).length / zAll.length;
  const maxZ = results.map((r) => r.maxZ);
  const worst = results.map((r) => r.worstDeviation);
  const summary = {
    rosters: results.length, zCount: zAll.length, meanValidSeeds: Math.round(mean(results.map((r) => r.valid))),
    pooledSdZ: +pooledSdZ.toFixed(4), fracAbsZOver3: +fracAbsZOver3.toFixed(5),
    maxAbsZ: { median: +quantile(maxZ, 0.5).toFixed(2), p90: +quantile(maxZ, 0.9).toFixed(2), max: +Math.max(...maxZ).toFixed(2) },
    worstDeviation: { median: +quantile(worst, 0.5).toFixed(5), p90: +quantile(worst, 0.9).toFixed(5), max: +Math.max(...worst).toFixed(5) },
  };
  const g = SWEEP_GATES;
  if (results.length > 1) {
    check(pooledSdZ >= g.pooledSdZ[0] && pooledSdZ <= g.pooledSdZ[1], `${label}: pooled z SD ${pooledSdZ} outside ${g.pooledSdZ}`);
    check(fracAbsZOver3 >= g.fracAbsZOver3[0] && fracAbsZOver3 <= g.fracAbsZOver3[1], `${label}: fraction |z| > 3 ${fracAbsZOver3} outside ${g.fracAbsZOver3}`);
  }
  check(Math.max(...maxZ) <= g.maxAbsZ, `${label}: max |z| ${Math.max(...maxZ)} above ${g.maxAbsZ}`);
  check(quantile(worst, 0.5) <= g.medianWorstDeviation, `${label}: median per-roster worst deviation ${quantile(worst, 0.5)} above ${g.medianWorstDeviation}`);
  out(label, summary);
}

function sweep(n, rosters, prngSeed) {
  const next = mulberry(prngSeed);
  const keep = proposeSchedule(n)[1];
  const t = Date.now();
  const results = [];
  for (let r = 0; r < rosters; r++) {
    const event = randomPin(next);
    results.push(rosterSpread(event, Array.from({ length: n }, () => randomId(next)), keep));
  }
  gateSweep(`sweep n=${n} keep=${keep} rosters=${rosters} prngSeed=${prngSeed} secPerRoster=${((Date.now() - t) / 1000 / rosters).toFixed(2)}`, results);
}

// 4b. Final code: every random order of 5 random finalists is encodable at SEED_DIGITS, scanning from zero.
function finalCodes(orders) {
  const next = mulberry(2718);
  const scanned = [];
  let unencodable = 0;
  for (let k = 0; k < orders; k++) {
    const event = randomPin(next);
    const order = Array.from({ length: 5 }, () => randomId(next));
    const code = hostFinalCode(event, order);
    if (code === null) unencodable++;
    else scanned.push(Number(code.slice(0, SEED_DIGITS)) + 1);
  }
  check(unencodable === 0, `final code: ${unencodable} of ${orders} orders unencodable`);
  out(`final-code orders=${orders}`, { unencodable, seedsScanned: { median: quantile(scanned, 0.5), p99: quantile(scanned, 0.99), max: Math.max(...scanned) } });
}

// 5. Cards: exact count under both rules, phone card == host card, decks needed.
function cards(n, events) {
  const schedule = proposeSchedule(n);
  let rounds = 0;
  let exact = 0;
  let cardMatches = 0;
  let cardCompared = 0;
  const decks = schedule.slice(1).map(() => []);
  for (let e = 0; e < events; e++) {
    let alive = guests(n);
    for (let r = 1; r < schedule.length; r++) {
      const keep = schedule[r];
      const d = hostDealRound(EVENT, r, alive, keep, cryptoRandom);
      rounds++;
      if (d.pair.every((rule) => alive.filter((id) => satisfies(rule, d.cards.get(id))).length === keep)) exact++;
      for (const id of alive) {
        cardCompared++;
        const c = phoneCard(EVENT, id, r, d.code);
        if (c && c.suit === d.cards.get(id).suit && c.rank === d.cards.get(id).rank) cardMatches++;
      }
      decks[r - 1].push(decksNeeded(d.cards.values()));
      alive = d.survivors[cryptoRandom() < 0.5 ? 0 : 1];
    }
  }
  check(exact === rounds && rounds === events * (schedule.length - 1), `cards n=${n}: ${exact} of ${rounds} exact`);
  check(cardMatches === cardCompared && cardCompared > 0, `cards n=${n}: ${cardMatches} of ${cardCompared} cards match`);
  out(`cards n=${n} events=${events}`, {
    rounds, exactUnderBothRules: exact, cardCompared, cardMatches,
    decksNeededPerRound: decks.map((xs, i) => `${schedule[i]}->${schedule[i + 1]}: mean ${mean(xs).toFixed(1)} max ${Math.max(...xs)}`),
  });
}

function finish() {
  console.log(`checks failed: ${failures}`);
  process.exitCode = failures === 0 ? 0 : 1;
}
const t0 = Date.now();
if (process.argv[2] === 'sweep') {
  hashParity();
  sweep(200, Number(process.argv[3]), 200);
  sweep(300, Number(process.argv[4]), 300);
  finish();
  process.exit();
}
if (process.argv[2] === 'roster') {
  hashParity();
  const fixture = JSON.parse(readFileSync(process.argv[3], 'utf8'));
  gateSweep(`roster ${process.argv[3]} event=${fixture.eventKey} keep=${fixture.keep}`, [rosterSpread(fixture.eventKey, fixture.roster, fixture.keep)]);
  finish();
  process.exit();
}
const sample = hostCutRound(EVENT, 1, guests(200), 100, cryptoRandom);
const sampleDeal = hostDealCuts(EVENT, 1, guests(52), 20, cryptoRandom);
check(sample.code.length === 9 && sampleDeal.code.length === 12, 'code lengths are not 9 and 12');
out('code-length', { cut: sample.code.length, cutExample: sample.code, deal: sampleDeal.code.length, dealExample: sampleDeal.code, parsed: parseCode(sample.code, 1) });
for (const n of [50, 52, 200]) out(`schedule n=${n}`, proposeSchedule(n));
for (const n of [50, 52, 200]) triesTable(n, Math.round(20000 * scale));
for (const n of [50, 52, 200]) phoneHost(n, Math.round(2000 * scale));
const E = Math.round(40000 * scale);
// fair runs must stay at max |z| <= 4; the three controls must exceed it (the detector can see them).
for (const [label, n, value, fair] of [
  ['fair', 200, undefined, true], ['biased-x0.90', 200, biased10, false], ['biased-x0.97', 200, biased3, false],
  ['no-finaliser', 200, noFinaliser, false], ['fair', 50, undefined, true],
]) {
  const r = reachFinal(n, E, value);
  check(fair ? r.maxAbsZ <= 4 : r.maxAbsZ > 4, `reach-final ${label} n=${n}: max |z| ${r.maxAbsZ}`);
  out(`reach-final ${label} n=${n} events=${E}`, r);
}
hashParity();
sweep(200, 300, 200);
sweep(300, 150, 300);
finalCodes(Math.round(2000 * scale));
for (const n of [200, 52, 37]) cards(n, Math.round(2000 * scale));
out('elapsed-seconds', (Date.now() - t0) / 1000);
finish();
