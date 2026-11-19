// gh#323 proof script: the heavy exact-cut sweep of engine 2b on the fixture banks, and the game-2 / game-4
// feasibility and chain lengths of the live bank with review ignored. Run from the repo root:
//   node docs/verification/evidence/gh323-scripted-cut-2026-11-19/proof.mjs sweep
//   node docs/verification/evidence/gh323-scripted-cut-2026-11-19/proof.mjs bank
//   node docs/verification/evidence/gh323-scripted-cut-2026-11-19/proof.mjs codes
// Each mode prints its numbers and `checks failed: K`, and exits 1 on any miss.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { scriptFixtureBanks, feasibleScriptSetups, halfCutConfigs, scriptSweep } from '../../../../src/prize-round/scripted-fixtures.mjs';
import { scriptInfeasible, SCRIPT_KINDS } from '../../../../src/prize-round/scripted.ts';
import { crossoverTable, mintSamples } from '../../../../src/prize-round/code-crossover.mjs';
import { analyseLetters } from '../../../../src/prize-round/letters.ts';
import { CHAIN_LENGTH, analyseChain, chainEligible, findChainPair, linkOut } from '../../../../src/prize-round/chain.ts';
import { hashOrder } from '../../../../src/prize-round/script-kit.ts';
import { BANK_TH } from '../../../../src/prize-words/bank-th.ts';
import { BANK_EN } from '../../../../src/prize-words/bank-en.ts';

const mode = process.argv[2];
// The coverage this evidence advertises, pinned: a run that covers less exits 1, whatever the input was cut to.
const ADVERTISED = { configs: 396, shapes: 5, setups: 16, named: ['40:1', '40:2', '100:1', '100:3', '100:4', '200:1', '200:2'] };
let failed = 0;
const check = (ok, what) => {
  if (!ok) {
    failed++;
    console.log(`FAIL ${what}`);
  }
};
const POOLS = ['general', 'office', 'food', 'animal'];

if (mode === 'sweep') {
  const banks = scriptFixtureBanks();
  const setups = feasibleScriptSetups(banks);
  const all = halfCutConfigs();
  console.log(`half-cut configurations for N in 9..300: ${all.length}; distinct live>keep shapes: ${new Set(all.map((c) => `${c.live}>${c.keep}`)).size}`);
  console.log(`feasible fixture setups (game, lang, pool): ${setups.length} = ${setups.map((s) => `${s.game}${s.lang}-${s.pool}`).join(' ')}`);
  // Coverage: an empty or partial setup list must not pass as "0 mismatches".
  const undealt = SCRIPT_KINDS.filter((k) => !setups.some((s) => s.game === k.game && s.lang === k.lang));
  check(undealt.length === 0 && setups.length === ADVERTISED.setups, `setups ${setups.length}; kinds with none: ${undealt.map((k) => `${k.game}|${k.lang}`).join(' ') || 'none'}`);
  check(all.length === ADVERTISED.configs, `configurations ${all.length}, advertised ${ADVERTISED.configs}`);
  check(new Set(all.map((c) => `${c.live}>${c.keep}`)).size === ADVERTISED.shapes, 'live>keep shapes below the advertised 5');
  const run = (label, configs, keys, seedBase, nConfigs) => {
    const t0 = Date.now();
    const r = scriptSweep({ banks, configs, keys, setupsFor: () => setups, seedBase });
    console.log(`${label}: rounds ${r.rounds}, identities ${r.identities}, cut checks ${r.cutChecks}, step checks ${r.stepChecks}, phone checks ${r.phoneChecks}, bad ${JSON.stringify(r.bad)} (${Date.now() - t0} ms)`);
    console.log(`   rounds by game: ${JSON.stringify(r.byGame)}; by live>keep: ${JSON.stringify(r.byLive)}`);
    console.log(`   game 3 marks: lowest survivor ${r.bingoGap.minSurvivor}, highest eliminated ${r.bingoGap.maxOut}`);
    for (const [shape, e] of Object.entries(r.chainEmpty)) {
      console.log(`   game 4 ${shape}: chain words with no holder ${e.emptyWords} of ${e.words}; chains with at least one ${e.roundsWithEmpty} of ${e.rounds}`);
    }
    check(r.rounds > 0 && r.identities > 0 && Object.keys(r.byGame).length === 3, `${label} dealt no round of some game`);
    check(r.rounds === nConfigs * ADVERTISED.setups * keys, `${label} rounds ${r.rounds} != ${nConfigs} configs x ${ADVERTISED.setups} setups x ${keys} keys`);
    check(Object.values(r.bad).every((x) => x === 0), `${label} has a mismatch`);
  };
  run('A. every config x every setup x 3 event keys', all, 3, 101, ADVERTISED.configs);
  const named = all.filter((c) => [40, 100, 200].includes(c.n));
  check(named.map((c) => `${c.n}:${c.round}`).join(' ') === ADVERTISED.named.join(' '), 'B configurations differ from the advertised seven');
  run(`B. N = 40, 100, 200 (${named.map((c) => `${c.n}:r${c.round}`).join(' ')}) x every setup x 20 event keys`, named, 20, 202, ADVERTISED.named.length);
} else if (mode === 'bank') {
  // Review ignored ON PURPOSE, for sizing only: every word is stamped reviewed in a copy. No player path does this.
  const stamp = (bank) => Object.fromEntries(Object.entries(bank).map(([pool, words]) => [pool, words.map((w) => ({ ...w, review: 'reviewed' }))]));
  const live = { th: BANK_TH, en: BANK_EN };
  for (const f of ['bank-th.ts', 'bank-en.ts']) {
    const src = readFileSync(new URL(`../../../../src/prize-words/${f}`, import.meta.url));
    console.log(`${f}: sha256 ${createHash('sha256').update(src).digest('hex').slice(0, 16)}`);
  }
  for (const [lang, bank] of Object.entries(live)) {
    const words = Object.values(bank).flat();
    console.log(`${lang} as stored: words ${words.length}, reviewed ${words.filter((w) => w.review === 'reviewed').length}, retired ${words.filter((w) => w.retired).length}`);
  }
  // Control: with no reviewed word, no bank-reading setup may play.
  const reviewedAny = Object.values(live).some((b) => Object.values(b).flat().some((w) => w.review === 'reviewed'));
  const asStored = ['th', 'en'].flatMap((lang) => POOLS.flatMap((pool) => [2, 4].map((game) => scriptInfeasible(live, { game, lang, pool })))).filter((x) => x === null).length;
  console.log(`bank-reading setups playable on the bank as stored: ${asStored} of 16`);
  check(asStored === 0 || reviewedAny, 'a pending-only bank played a setup');
  const banks = { th: stamp(BANK_TH), en: stamp(BANK_EN) };
  console.log('\nGame 2 (review ignored): lang pool | playable words | candidate pairs | excluded pairs');
  for (const lang of ['th', 'en']) {
    for (const pool of POOLS) {
      const a = analyseLetters(banks, { game: 2, lang, pool });
      console.log(`  ${lang} ${pool} | ${a.playableWords} | ${a.pairs.length} | ${a.excluded}`);
      check(a.pairs.length > 0, `game 2 ${lang} ${pool} has no pair`);
    }
  }
  // Largest L with two word-disjoint chains of L: an exhaustive pair search per L, capped by a node budget. A capped
  // search that found nothing is reported as unknown, so a figure ending in '+' is a lower bound.
  const BUDGET = 5e6;
  const MAX_L = 15;
  console.log(`\nGame 4 (review ignored): link rule as ruled; CHAIN_LENGTH ${CHAIN_LENGTH}; pair search per L up to ${MAX_L}, budget ${BUDGET} nodes`);
  console.log('  lang pool | words | chain-eligible | links | largest L with two disjoint chains | plays at CHAIN_LENGTH | seeded search nodes (median / max over 200 seeds)');
  for (const lang of ['th', 'en']) {
    for (const pool of POOLS) {
      const setup = { game: 4, lang, pool };
      const { graph, feasible } = analyseChain(banks, setup);
      const nLinks = [...graph.next.values()].reduce((s, x) => s + x.length, 0);
      const rank = new Map(graph.words.map((w, i) => [w.id, i]));
      let best = 0;
      let capped = false;
      for (let L = 2; L <= MAX_L; L++) {
        const budgeted = budgetedPair(graph, L, rank, BUDGET);
        if (budgeted === 'yes') best = L;
        else {
          capped = budgeted === 'unknown';
          break;
        }
        if (L === MAX_L) capped = true;
      }
      const steps = [];
      for (let s = 0; s < 200 && feasible; s++) {
        const order = hashOrder('chain-order', ['proof', s, lang, pool], graph.words.map((w) => w.id));
        steps.push(findChainPair(graph, CHAIN_LENGTH, new Map(order.map((id, i) => [id, i]))).steps);
      }
      steps.sort((a, b) => a - b);
      const words = banks[lang][pool].length;
      console.log(`  ${lang} ${pool} | ${words} | ${graph.words.length} | ${nLinks} | ${best}${capped ? '+' : ''} | ${feasible ? 'yes' : 'no'} | ${steps.length ? `${steps[100]} / ${steps.at(-1)}` : '-'}`);
      check(feasible, `game 4 ${lang} ${pool} cannot play at CHAIN_LENGTH`);
    }
  }
  const ending = (chars) => Object.values(banks.th).flat().filter((w) => chainEligible(w) && chars.includes(linkOut(w))).slice(0, 4).map((w) => `${w.id} ends ${linkOut(w)}`);
  console.log(`\nThai words that qualify by ending in a letter that also writes a vowel: ${ending(['อ', 'ว', 'ย']).join('; ')}`);
  for (const [lang, bank] of Object.entries(banks)) {
    const all = Object.values(bank).flat();
    const kept = all.filter((w) => !w.retired);
    const noLink = kept.filter((w) => linkOut(w) === null).length;
    console.log(`${lang}: ${all.length} words, ${all.length - kept.length} retired; of the ${kept.length} unretired, ${noLink} end in no link character and ${kept.filter(chainEligible).length} are chain-eligible`);
  }
} else if (mode === 'codes') {
  // Every single-digit edit of valid codes of every kind, offered to each decoder (code-crossover.mjs).
  const perKind = Number(process.argv[3] ?? 400);
  const t0 = Date.now();
  const samples = mintSamples(perKind, 11);
  const byKind = {};
  for (const s of samples) byKind[s.kind] = (byKind[s.kind] ?? 0) + 1;
  console.log(`valid codes sampled per kind: ${JSON.stringify(byKind)}`);
  check(Object.keys(byKind).length === 5 && Object.values(byKind).every((n) => n > 0), 'a code kind was not sampled');
  const table = crossoverTable(samples);
  console.log('source -> decoder | accepted / tried');
  for (const [k, v] of Object.entries(table)) console.log(`  ${k} | ${v.accepted} / ${v.tried}`);
  const into = Object.entries(table).filter(([k]) => /-> (word|script)$/.test(k));
  check(into.length > 0 && into.every(([, v]) => v.accepted === 0), 'an edit or another kind was accepted by the word or script decoder');
  console.log(`edits and foreign codes tried against word/script decoders: ${into.reduce((n, [, v]) => n + v.tried, 0)}; accepted: ${into.reduce((n, [, v]) => n + v.accepted, 0)} (${Date.now() - t0} ms)`);
} else {
  console.log('usage: proof.mjs sweep | bank | codes');
  process.exit(2);
}
console.log(`checks failed: ${failed}`);
process.exit(failed === 0 ? 0 : 1);

// Same search as findChainPair, with a node budget: 'yes', 'no' (exhausted), or 'unknown' (budget hit).
function budgetedPair(graph, length, rank, budget) {
  let steps = 0;
  const byRank = (ws) => [...ws].sort((x, y) => rank.get(x.id) - rank.get(y.id));
  const starts = byRank(graph.words);
  const next = new Map([...graph.next].map(([id, ws]) => [id, byRank(ws)]));
  function* chains(used) {
    const path = [];
    function* walk(w) {
      if (++steps > budget) return;
      path.push(w);
      used.add(w.id);
      if (path.length === length) yield [...path];
      else for (const n of next.get(w.id)) if (!used.has(n.id)) yield* walk(n);
      path.pop();
      used.delete(w.id);
    }
    for (const s of starts) if (!used.has(s.id)) yield* walk(s);
  }
  for (const first of chains(new Set())) {
    for (const _ of chains(new Set(first.map((w) => w.id)))) return 'yes';
    if (steps > budget) return 'unknown';
  }
  return steps > budget ? 'unknown' : 'no';
}
