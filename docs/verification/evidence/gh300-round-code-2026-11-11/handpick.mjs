// Builds a hand-picked roster for the must-red of the conditional-spread sweep in simulate.mjs: one target
// identity plus 199 others chosen to make the target survive round 1 more often than keep/N. The REFUTE
// judge's own list was not handed over, so this rebuilds the attack: deterministic, greedy, no randomness.
// Run from the repo root: node docs/verification/evidence/gh300-round-code-2026-11-11/handpick.mjs
// Writes handpicked-roster.json next to this file; then
//   node docs/verification/evidence/gh300-round-code-2026-11-11/simulate.mjs roster <that file>
// must exit 1 on the max |z| gate.
import { writeFileSync } from 'node:fs';
import {
  CUT_SCALE,
  SEED_DIGITS,
  canonicalIdentity,
  fateValue,
  hashFromPrefixBytes,
  hashPrefixState,
} from '../../../../src/prize-draw/round-code.ts';

const EVENT = '482913';
const KEEP = 100;
const OTHERS = 199;
const POOL = 5000;
const TARGET = 'id-target-000';
// The production hash functions themselves (the ones fateValue is built from), driven seed-major so each
// seed's prefix state is computed once. No copy of the hash lives here.
const enc = new TextEncoder();
const prefixState = (seed) => hashPrefixState(['fate', EVENT, 1, seed]);
const fast = (state, bytes) => hashFromPrefixBytes(state, bytes, CUT_SCALE);
const bytesOf = (id) => enc.encode(canonicalIdentity(id));

// Positive control: the same values as fateValue.
for (const id of [TARGET, 'opaque-0', 'opaque-4999']) {
  for (const seed of ['00000', '12345', '99999']) {
    if (fast(prefixState(seed), bytesOf(id)) !== fateValue(EVENT, 1, seed, id)) throw new Error(`hash path differs at ${id}/${seed}`);
  }
}

// Weight each seed by how pivotal the target is there: the chance that exactly KEEP - 1 or KEEP others sit
// below it if the others were fair. A candidate scores where it sits ABOVE the target on pivotal seeds.
const space = 10 ** SEED_DIGITS;
const states = [];
const targetValue = [];
const weight = [];
const logChoose = (n, k) => {
  let s = 0;
  for (let i = 1; i <= k; i++) s += Math.log((n - k + i) / i);
  return s;
};
const pmf = (n, k, q) => (q <= 0 || q >= 1 ? 0 : Math.exp(logChoose(n, k) + k * Math.log(q) + (n - k) * Math.log(1 - q)));
for (let s = 0; s < space; s++) {
  const st = prefixState(String(s).padStart(SEED_DIGITS, '0'));
  const vt = fast(st, bytesOf(TARGET));
  const q = vt / CUT_SCALE;
  const w = pmf(OTHERS, KEEP - 1, q) + pmf(OTHERS, KEEP, q);
  if (w < 1e-4) continue;
  states.push(st);
  targetValue.push(vt);
  weight.push(w);
}
const scores = [];
for (let k = 0; k < POOL; k++) {
  const id = `opaque-${k}`;
  const bytes = bytesOf(id);
  let score = 0;
  for (let i = 0; i < states.length; i++) if (fast(states[i], bytes) > targetValue[i]) score += weight[i];
  scores.push({ id, score });
}
scores.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
const roster = [TARGET, ...scores.slice(0, OTHERS).map((c) => c.id)];
const file = new URL('./handpicked-roster.json', import.meta.url);
writeFileSync(file, `${JSON.stringify({ eventKey: EVENT, keep: KEEP, pivotalSeeds: states.length, pool: POOL, roster }, null, 1)}\n`);
console.log(`wrote ${roster.length} identities; pivotal seeds ${states.length}; pool ${POOL}`);
