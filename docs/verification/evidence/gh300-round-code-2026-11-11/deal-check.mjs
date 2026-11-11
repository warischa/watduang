// Deal-round follow-up to simulate.mjs (which is left as run). Two questions:
// 1. How many people can read their own fate off their card at the deal (same fate under both rules)?
// 2. Exact per-identity odds in a deal round under each rule: every seed enumerated, as in simulate.mjs.
// Run from the repo root: node docs/verification/evidence/gh300-round-code-2026-11-11/deal-check.mjs
// Every result is also asserted: a failed check prints CHECK FAILED and the script exits 1.
import { SEED_DIGITS, dealFate, fateValue, hostDealCuts, parseCode } from '../../../../src/prize-draw/round-code.ts';
import { proposeSchedule } from '../../../../src/prize-draw/schedule.ts';

const EVENT = '482913';
const guests = (n) => Array.from({ length: n }, (_, i) => `guest-${String(i + 1).padStart(3, '0')}`);
const out = (label, obj) => console.log(`${label} ${JSON.stringify(obj)}`);
const SPACE = 10 ** SEED_DIGITS;
let failures = 0;
const check = (ok, what) => {
  if (!ok) {
    failures++;
    console.log(`CHECK FAILED: ${what}`);
  }
};
// A canary on one fixed roster per step, not the fairness gate (that is the random-roster sweep in
// simulate.mjs): 5 binomial SDs of the disclosed spread, over the valid seeds actually counted.
const conditionalBound = (p, valid) => 5 * Math.sqrt((p * (1 - p)) / valid);
let state = 2026;
const prng = () => {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// 1. Fate-known-at-deal count, per schedule step, from the phone's own view (dealFate under rule 0 vs rule 1).
for (const n of [200, 52, 50, 37]) {
  const schedule = proposeSchedule(n);
  const steps = [];
  for (let r = 1; r < schedule.length; r++) {
    const alive = guests(schedule[r - 1]);
    const keep = schedule[r];
    const { code } = hostDealCuts(EVENT, r, alive, keep, prng);
    const parsed = parseCode(code, r);
    let knowIn = 0;
    let knowOut = 0;
    for (const id of alive) {
      const v = fateValue(EVENT, r, parsed.seed, id);
      const a = dealFate(v, parsed, 0);
      const b = dealFate(v, parsed, 1);
      if (a && b) knowIn++;
      if (!a && !b) knowOut++;
    }
    check(knowIn + knowOut === Math.abs(alive.length - 2 * keep), `n=${n} ${alive.length}->${keep}: ${knowIn + knowOut} readable, expected |N - 2 keep|`);
    check(knowIn === 0 || knowOut === 0, `n=${n} ${alive.length}->${keep}: both sure-in and sure-out holders`);
    steps.push(`${alive.length}->${keep}: know-in ${knowIn}, know-out ${knowOut}, in suspense ${alive.length - knowIn - knowOut}`);
  }
  out(`fate-known-at-deal n=${n}`, steps);
}

// 2. Exact per-identity odds under each rule of a deal round, every seed forced in turn.
for (const [n, keep] of [[200, 100], [50, 20], [20, 5]]) {
  const roster = guests(n);
  const wins = [new Map(roster.map((id) => [id, 0])), new Map(roster.map((id) => [id, 0]))];
  let valid = 0;
  for (let s = 0; s < SPACE; s++) {
    let used = false;
    const forced = () => {
      if (used) throw new Error('tie');
      used = true;
      return (s + 0.5) / SPACE;
    };
    let deal;
    try {
      deal = hostDealCuts(EVENT, 1, roster, keep, forced);
    } catch (err) {
      if (err.message === 'tie') continue;
      throw err;
    }
    valid++;
    deal.survivors.forEach((ids, rule) => ids.forEach((id) => wins[rule].set(id, wins[rule].get(id) + 1)));
  }
  const p = keep / n;
  check(valid >= 0.8 * SPACE, `exact-deal n=${n}: only ${valid} valid seeds`);
  const stats = wins.map((m, rule) => {
    const probs = [...m.values()].map((w) => w / valid);
    const maxDev = Math.max(...probs.map((x) => Math.abs(x - p)));
    check(maxDev <= conditionalBound(p, valid), `exact-deal n=${n} rule ${rule}: max deviation ${maxDev} above bound ${conditionalBound(p, valid)}`);
    return {
      maxAbsDeviation: +maxDev.toFixed(5),
      sd: +Math.sqrt(probs.reduce((acc, x) => acc + (x - p) ** 2, 0) / probs.length).toFixed(4),
    };
  });
  out(`exact-deal-round1 n=${n} keep=${keep} seeds=${SPACE}`, {
    validSeeds: valid, rule0: stats[0], rule1: stats[1], theorySd: +Math.sqrt((p * (1 - p)) / valid).toFixed(5),
    bound: +conditionalBound(p, valid).toFixed(5),
  });
}
console.log(`checks failed: ${failures}`);
process.exitCode = failures === 0 ? 0 : 1;
