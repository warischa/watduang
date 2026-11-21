// node --test — the deal revision (gh#328). A word-family code carries DEAL_REVISION mod 10, and a phone on
// another deal revision refuses the code with `stale-bank`. That refusal is only as good as the revision: if what
// a phone rebuilds from a code moves while DEAL_REVISION stays put, an older phone accepts a newer host's code and
// deals different cards. So this file hashes everything a phone derives from a code, through the phone entry
// points only, and pins the hash to the latest entry of deal-revisions.json.
//
// Covered: every KINDS and SCRIPT_KINDS member x every pool x the sampled codes x IDENTITIES, through every phone
// entry point: the word round (every stored field of each dealt word, its text included) and its verdict under all
// four rule taps; the scripted deal and the whole trace under all four taps, and each step read one by one under
// all four taps for one identity per code. Refusals are
// hashed too. Three bank sets: the engine-2a fixture banks, the engine-2b fixture banks, and the real banks. A phone
// renders a scripted item id from the bank it holds, so bank content enters each set's header as a digest: the
// fixtures' computed here, the real banks' as the hash revisions.json registers for BANK_REVISION (the bank oracle
// pins that hash to the content). A bank content change therefore moves this fingerprint, so a bank change and a
// composition change share the one wire digit. The revision digit is pinned to 1 on both sides, as the golden
// vectors pin it, so appending an entry never moves the hash it records.
//
// The sample: SEED_COUNT spread seeds plus the edges of every code field (seeds 00000 and 99999, the lowest and
// highest cut, the first and last round). RESIDUAL, accepted: a change that touches only a small fraction of
// rounds, none of them sampled, stays green here. Review owns that case, not this test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fateValue, ROUNDS } from '../prize-draw/round-code.ts';
import { BANK_REVISION } from '../prize-words/schema.ts';
import { BANK_TH } from '../prize-words/bank-th.ts';
import { BANK_EN } from '../prize-words/bank-en.ts';
import {
  DEAL_REVISION,
  KINDS,
  POOL_ORDER,
  SCRIPT_KIND_BASE,
  familyCode,
  hostWordRound,
  parseWordCode,
  phoneWordRound,
  phoneWordVerdict,
  revisionDigit,
  wordCode,
} from './round.ts';
import { SCRIPT_KINDS, hostScriptRound, parseScriptCode, phoneScriptDeal, phoneScriptStep, phoneScriptTrace } from './scripted.ts';
import { fixtureBanks } from './fixtures.mjs';
import { prng, roster, scriptFixtureBanks, TAPS } from './scripted-fixtures.mjs';

const readJson = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const REGISTRY = './deal-revisions.json';

const PINNED_DIGIT = 1;
const SEED_COUNT = 64;
const EVENT_KEYS = ['100200', '777001', '400713'];
const CUTS = [250, 500, 750, 333];
/** Eight identities, Thai ones written as escapes. */
const IDENTITIES = ['Ann', 'bo', 'Chai', '\u0e2a\u0e21\u0e0a\u0e32\u0e22', '\u0e19\u0e34\u0e14', 'Dao 2', 'eve', '\u0e01\u0e49\u0e2d\u0e22'];

const seedOf = (s) => String((s * 15485 + 271) % 100000).padStart(5, '0');
const EDGE_SEEDS = ['00000', '99999'];
const EDGE_CUTS = [1, 999];

/** Every sampled code's fields: the spread seeds, then each edge seed x edge cut x first and last round. */
function samples() {
  const out = [];
  for (let s = 0; s < SEED_COUNT; s++) {
    out.push({ seed: seedOf(s), round: ROUNDS[s % ROUNDS.length], key: EVENT_KEYS[s % EVENT_KEYS.length], cut: CUTS[s % CUTS.length] });
  }
  for (const seed of EDGE_SEEDS) for (const cut of EDGE_CUTS) for (const round of [ROUNDS[0], ROUNDS.at(-1)]) out.push({ seed, round, key: EVENT_KEYS[0], cut });
  return out;
}
const SAMPLES = samples();

function wordKinds() {
  return KINDS.map((k, i) => ({ number: i, label: `word ${i} game ${k.game} ${k.lang} ${k.family}`, engine: 'word' }));
}
function scriptKinds() {
  return SCRIPT_KINDS.map((k, i) => ({ number: SCRIPT_KIND_BASE + i, label: `script ${SCRIPT_KIND_BASE + i} game ${k.game} ${k.lang}`, engine: 'script' }));
}

/** A value with object keys sorted and every `note` dropped: reviewer prose is never shown to a player. */
function shown(v) {
  if (Array.isArray(v)) return v.map(shown);
  if (v !== null && typeof v === 'object') return Object.fromEntries(Object.keys(v).filter((k) => k !== 'note').sort().map((k) => [k, shown(v[k])]));
  return v;
}

/** A word-round result as a phone shows it: each dealt word whole (text and every stored field), values typed. */
function wordView(r) {
  if ('refused' in r) return r;
  const c = r.candidates;
  const cv = (v) => `${typeof v}:${String(v)}`;
  return {
    setup: r.setup,
    candidates: c.kind === 'conditions' ? c.pair.map((x) => `${x.family}=${cv(x.value)}`) : { family: c.family, values: c.values.map(cv), pair: shown(c.pair) },
    holding: r.holding.kind === 'hand' ? shown(r.holding.words) : cv(r.holding.value),
  };
}

/** Digest of a bank set's content as a phone could render it. */
function contentDigest(banks) {
  return createHash('sha256').update(JSON.stringify(shown({ th: banks.th, en: banks.en }))).digest('hex');
}

/** One bank set's phone derivations streamed into `hash`; returns per-kind counts of non-refused deals by group. */
function feed(hash, banks) {
  const dealt = new Map();
  for (const kind of [...wordKinds(), ...scriptKinds()]) {
    const seen = { 0: 0, 1: 0 };
    for (const pool of POOL_ORDER) {
      for (let s = 0; s < SAMPLES.length; s++) {
        const { seed, round, key, cut } = SAMPLES[s];
        const code = familyCode(round, seed, cut, PINNED_DIGIT, kind.number, pool);
        for (const id of IDENTITIES) {
          let row;
          if (kind.engine === 'word') {
            const r = phoneWordRound(key, id, round, code, banks);
            row = [wordView(r), TAPS.map((tap) => phoneWordVerdict(key, id, round, code, tap, banks))];
            if (!('refused' in r)) seen[fateValue(key, round, seed, id) < cut ? 0 : 1]++;
          } else {
            const d = phoneScriptDeal(key, id, round, code, banks);
            row = [d, TAPS.map((tap) => phoneScriptTrace(key, id, round, code, tap, banks))];
            if (!('refused' in d) && id === IDENTITIES[s % IDENTITIES.length]) {
              // The step API read one step at a time, up to one past the end (null there). Each step call rebuilds
              // the round, so it runs for one identity per code, rotating, to keep this file near 5 s.
              const steps = row[1][0].length;
              row.push(TAPS.map((tap) => Array.from({ length: steps + 1 }, (_, k) => phoneScriptStep(key, id, round, code, tap, k, banks))));
            }
            if (!('refused' in d)) seen[fateValue(key, round, seed, id) < cut ? 0 : 1]++;
          }
          hash.update(`${kind.number}|${pool}|${s}|${id}|${JSON.stringify(row)}\n`);
        }
      }
    }
    dealt.set(kind.label, seen);
  }
  return dealt;
}

let memo = null;
/** The fingerprint of this build's deal, and the per-set deal counts behind it. Computed once per run. */
function fingerprint() {
  if (memo) return memo;
  const bankHash = readJson('../prize-words/revisions.json')[String(BANK_REVISION)];
  assert.match(String(bankHash), /^[0-9a-f]{64}$/, `revisions.json holds no hash for BANK_REVISION ${BANK_REVISION}`);
  // One banks object per set, built once: the engine caches its pool analysis per banks object.
  const sets = [
    { name: 'fixture-2a', banks: { ...fixtureBanks(), revision: PINNED_DIGIT } },
    { name: 'fixture-2b', banks: { ...scriptFixtureBanks(), revision: PINNED_DIGIT } },
    { name: 'real bank', banks: { th: BANK_TH, en: BANK_EN, revision: PINNED_DIGIT }, digest: bankHash },
  ];
  const hash = createHash('sha256');
  const dealt = {};
  for (const set of sets) {
    hash.update(`set ${set.name} ${set.digest ?? contentDigest(set.banks)}\n`);
    dealt[set.name] = feed(hash, set.banks);
  }
  memo = { hash: hash.digest('hex'), dealt };
  return memo;
}

test('deal-revisions.json: an append-only registry keyed 1..n whose latest entry is DEAL_REVISION', () => {
  const reg = readJson(REGISTRY);
  const keys = Object.keys(reg);
  assert.ok(keys.length >= 1, 'the registry holds at least one entry');
  assert.deepEqual(keys, keys.map((_, i) => String(i + 1)), 'entries are keyed 1, 2, 3, ... in order, none missing');
  for (const [k, e] of Object.entries(reg)) {
    assert.equal(e.revision, Number(k), `entry ${k} names its own revision`);
    assert.match(e.hash, /^[0-9a-f]{64}$/, `entry ${k} holds a sha256 hex digest`);
    assert.match(e.date, /^\d{4}-\d{2}-\d{2}$/, `entry ${k} holds a date`);
    assert.ok(typeof e.note === 'string' && e.note.length > 0, `entry ${k} says what changed`);
  }
  assert.ok(Number.isInteger(DEAL_REVISION) && DEAL_REVISION >= 1);
  assert.equal(DEAL_REVISION, keys.length, 'DEAL_REVISION in round.ts must be the latest registry entry');
});

test('what a phone derives from a code matches the hash recorded for DEAL_REVISION', () => {
  const reg = readJson(REGISTRY);
  const { hash } = fingerprint();
  const next = Object.keys(reg).length + 1;
  assert.equal(
    hash,
    reg[String(DEAL_REVISION)]?.hash,
    `What a phone rebuilds from a code has moved, so an older phone would accept this build's codes and deal something else. ` +
      `APPEND entry "${next}": { "revision": ${next}, "hash": "${hash}", "date": "<today>", "note": "<what moved>" } to deal-revisions.json ` +
      `and set DEAL_REVISION to ${next} in round.ts. Never re-record an existing entry: a published entry is what older phones were built on.`,
  );
});

test('floor: every kind deals in at least one fixture pool, to both groups, so no kind is fingerprinted on refusals alone', () => {
  const { dealt } = fingerprint();
  const kinds = [...wordKinds(), ...scriptKinds()].map((k) => k.label);
  assert.equal(kinds.length, KINDS.length + SCRIPT_KINDS.length);
  for (const label of kinds) {
    const g0 = dealt['fixture-2a'].get(label)[0] + dealt['fixture-2b'].get(label)[0];
    const g1 = dealt['fixture-2a'].get(label)[1] + dealt['fixture-2b'].get(label)[1];
    assert.ok(g0 > 0 && g1 > 0, `${label}: group 0 dealt ${g0}, group 1 dealt ${g1}; each needs 1`);
  }
});

test('the wire digit is DEAL_REVISION mod 10 at every minting site and at the refusal', () => {
  const digit = DEAL_REVISION % 10;
  const banks = scriptFixtureBanks();
  assert.equal(revisionDigit(banks), digit);
  assert.equal(parseWordCode(wordCode(2, '12345', 512, 3, 'food'), 2).revision, digit, 'wordCode default');
  const random = prng(23);
  const ids = roster(20, random);
  const w = hostWordRound('424242', 1, ids, 10, random, { game: 1, lang: 'en', pool: 'general', family: 'letters' }, banks);
  assert.equal(parseWordCode(w.code, 1).revision, digit, 'hostWordRound');
  const s = hostScriptRound('424242', 2, ids, 10, random, { game: 3, lang: 'th', pool: 'general' }, banks);
  assert.equal(parseScriptCode(s.code, 2).revision, digit, 'hostScriptRound');
  // A phone one deal revision behind or ahead refuses; the same build deals.
  for (const other of [DEAL_REVISION - 1, DEAL_REVISION + 1]) {
    const stale = { ...banks, revision: other };
    assert.deepEqual(phoneWordRound('424242', ids[0], 1, w.code, stale), { refused: 'stale-bank' });
    assert.deepEqual(phoneScriptDeal('424242', ids[0], 2, s.code, stale), { refused: 'stale-bank' });
  }
  assert.ok(!('refused' in phoneWordRound('424242', ids[0], 1, w.code, banks)));
  assert.ok(!('refused' in phoneScriptDeal('424242', ids[0], 2, s.code, banks)));
});
