// gh#322 proof script: the heavy exact-cut sweep on the fixture banks, and the feasibility report of the live
// bank with review ignored. Run from the repo root:
//   node docs/verification/evidence/gh322-word-round-2026-11-19/proof.mjs sweep
//   node docs/verification/evidence/gh322-word-round-2026-11-19/proof.mjs bank
// Each mode prints its numbers and `checks failed: K`, and exits 1 on any miss.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fixtureBanks, halfCutConfigs, feasibleSetups, sweep } from '../../../../src/prize-round/fixtures.mjs';
import { feasibilityReport, KINDS } from '../../../../src/prize-round/round.ts';
import { BANK_TH } from '../../../../src/prize-words/bank-th.ts';
import { BANK_EN } from '../../../../src/prize-words/bank-en.ts';

const mode = process.argv[2];
// The coverage this evidence advertises, pinned: a run that covers less exits 1, whatever the input was cut to.
const ADVERTISED = { configs: 396, shapes: 5, setups: 57, named: ['40:1', '40:2', '100:1', '100:3', '100:4', '200:1', '200:2'] };
let failed = 0;
const check = (ok, what) => {
  if (!ok) {
    failed++;
    console.log(`FAIL ${what}`);
  }
};

if (mode === 'sweep') {
  const banks = fixtureBanks();
  const setups = feasibleSetups(banks);
  const all = halfCutConfigs();
  console.log(`half-cut configurations for N in 9..300: ${all.length}; distinct live>keep shapes: ${new Set(all.map((c) => `${c.live}>${c.keep}`)).size}`);
  console.log(`feasible fixture setups (game, lang, pool, family): ${setups.length}`);
  // Coverage: an empty or partial setup list must not pass as "0 mismatches".
  const undealt = KINDS.filter((k) => !setups.some((s) => s.game === k.game && s.lang === k.lang && s.family === k.family));
  check(undealt.length === 0, `kinds with no setup: ${undealt.map((k) => `${k.game}|${k.lang}|${k.family}`).join(' ') || 'none'}`);
  check(all.length === ADVERTISED.configs, `configurations ${all.length}, advertised ${ADVERTISED.configs}`);
  check(new Set(all.map((c) => `${c.live}>${c.keep}`)).size === ADVERTISED.shapes, 'live>keep shapes below the advertised 5');
  check(setups.length === ADVERTISED.setups, `setups ${setups.length}, advertised ${ADVERTISED.setups}`);
  const covered = (r, nConfigs, keys, label) => {
    check(r.rounds > 0 && r.identities > 0, `${label} dealt nothing`);
    check(r.rounds === nConfigs * ADVERTISED.setups * keys, `${label} rounds ${r.rounds} != ${nConfigs} configs x ${ADVERTISED.setups} setups x ${keys} keys`);
  };
  const t0 = Date.now();
  const a = sweep({ banks, configs: all, keys: 3, setupsFor: () => setups, seedBase: 101 });
  console.log(`A. every config x every setup x 3 event keys: rounds ${a.rounds}, identities ${a.identities}, cut checks ${a.cutChecks}, phone checks ${a.phoneChecks}, bad ${JSON.stringify(a.bad)} (${Date.now() - t0} ms)`);
  console.log(`   rounds by live>keep: ${JSON.stringify(a.byLive)}`);
  check(Object.values(a.bad).every((x) => x === 0), 'A has a mismatch');
  covered(a, ADVERTISED.configs, 3, 'A');
  const named = all.filter((c) => [40, 100, 200].includes(c.n));
  const t1 = Date.now();
  const b = sweep({ banks, configs: named, keys: 20, setupsFor: () => setups, seedBase: 202 });
  console.log(`B. N = 40, 100, 200 (${named.map((c) => `${c.n}:r${c.round}`).join(' ')}) x every setup x 20 event keys: rounds ${b.rounds}, identities ${b.identities}, cut checks ${b.cutChecks}, phone checks ${b.phoneChecks}, bad ${JSON.stringify(b.bad)} (${Date.now() - t1} ms)`);
  check(Object.values(b.bad).every((x) => x === 0), 'B has a mismatch');
  check(named.map((c) => `${c.n}:${c.round}`).join(' ') === ADVERTISED.named.join(' '), 'B configurations differ from the advertised seven');
  covered(b, ADVERTISED.named.length, 20, 'B');
} else if (mode === 'bank') {
  // Review ignored ON PURPOSE, for sizing only: every word is stamped reviewed in a copy. No player path does this.
  const stamp = (bank) => Object.fromEntries(Object.entries(bank).map(([pool, words]) => [pool, words.map((w) => ({ ...w, review: 'reviewed' }))]));
  const live = { th: BANK_TH, en: BANK_EN };
  for (const [lang, bank] of Object.entries(live)) {
    const words = Object.values(bank).flat();
    const by = (pred) => words.filter(pred).length;
    console.log(`${lang} review as stored: reviewed ${by((w) => w.review === 'reviewed')}, pending ${by((w) => w.review === 'pending')}, retired ${by((w) => w.retired === true)}`);
  }
  // Control: the report on the bank AS STORED. With no reviewed word, no row may offer a pair.
  const asStored = feasibilityReport(live).filter((r) => r.feasible.length > 0).length;
  console.log(`rows with a feasible pair on the bank as stored: ${asStored} of 88`);
  check(asStored === 0 || Object.values(live).some((b) => Object.values(b).flat().some((w) => w.review === 'reviewed')), 'a pending-only bank offered a pair');
  const banks = { th: stamp(BANK_TH), en: stamp(BANK_EN) };
  for (const f of ['bank-th.ts', 'bank-en.ts']) {
    const src = readFileSync(new URL(`../../../../src/prize-words/${f}`, import.meta.url));
    console.log(`${f}: sha256 ${createHash('sha256').update(src).digest('hex').slice(0, 16)}`);
  }
  for (const [lang, bank] of Object.entries(banks)) {
    console.log(`${lang} words per pool: ${Object.entries(bank).map(([p, ws]) => `${p} ${ws.length}`).join(', ')}`);
  }
  const rows = feasibilityReport(banks);
  check(rows.length === 88, 'expected 22 kinds x 4 pools');
  console.log('lang pool game family | playable values feasible excluded | first feasible pairs');
  for (const r of rows) {
    const first = r.feasible.slice(0, 3).join(' ; ');
    console.log(`${r.lang} ${r.pool} g${r.game} ${r.family} | ${r.playableWords} ${r.values} ${r.feasible.length} ${r.excluded.length} | ${first}`);
  }
  const playable = rows.filter((r) => r.feasible.length > 0).length;
  console.log(`rows with at least one feasible pair: ${playable} of ${rows.length}`);
} else {
  console.log('usage: proof.mjs sweep | bank');
  process.exit(2);
}
console.log(`checks failed: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
