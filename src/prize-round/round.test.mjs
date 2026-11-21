// node --test — engine 2a for the word games (gh#322): the word-round code, the half-cut refusal, the exact cut
// under both candidates x both polarities, phone == host, golden vectors and the feasibility report. Runs on the
// fixture banks in fixtures.mjs, never the live bank (still pending, and grown concurrently).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POOLS, THAI_FAMILIES, ENGLISH_FAMILIES } from '../prize-words/schema.ts';
import { hostDealCuts, parseCode, dammCheck, CUT_CODE_LENGTH, DEAL_CODE_LENGTH, FINAL_CODE_LENGTH } from '../prize-draw/round-code.ts';
import {
  DEAL_REVISION,
  KINDS,
  POOL_ORDER,
  SCRIPT_KIND_BASE,
  WORD_CODE_LENGTH,
  feasibilityReport,
  hostWordRound,
  kindIndexOf,
  parseWordCode,
  phoneWordRound,
  phoneWordVerdict,
  wordCode,
} from './round.ts';
import { fixtureBanks, reorderedBanks, prng, roster, halfCutConfigs, feasibleSetups, sweep, TAPS } from './fixtures.mjs';

const banks = fixtureBanks();

// ---- the code -------------------------------------------------------------------------------------------------

test('a word code is 14 digits, 2 or more from every phase-1 length, and the phase-1 parser refuses it', () => {
  assert.equal(WORD_CODE_LENGTH, 14);
  for (const len of [CUT_CODE_LENGTH, DEAL_CODE_LENGTH, FINAL_CODE_LENGTH]) assert.ok(Math.abs(WORD_CODE_LENGTH - len) >= 2, `phase-1 length ${len}`);
  const code = wordCode(2, '12345', 512, kindIndexOf({ game: 1, lang: 'th', family: 'letters' }), 'food');
  assert.equal(code.length, 14);
  for (let r = 1; r <= 5; r++) assert.equal(parseCode(code, r), null, `phase-1 parseCode must refuse a word code in round ${r}`);
  assert.deepEqual(parseWordCode(code, 2), { seed: '12345', cut: 512, revision: DEAL_REVISION % 10, kindIndex: 3, kind: KINDS[3], pool: 'food' });
});

test('the decoder refuses every phase-1 code: a cut code, a NON-half-cut deal code, a half-cut deal code', () => {
  const random = prng(7);
  const ids = roster(50, random);
  const notHalf = hostDealCuts('123456', 1, ids, 20, random);
  const parsed = parseCode(notHalf.code, 1);
  assert.notEqual(parsed.low, parsed.high, 'precondition: a 50 -> 20 deal carries two different cuts');
  assert.equal(parseWordCode(notHalf.code, 1), null);
  const half = hostDealCuts('123456', 1, ids, 25, random);
  assert.equal(parseWordCode(half.code, 1), null);
  assert.equal(parseWordCode(notHalf.code.slice(0, CUT_CODE_LENGTH), 1), null);
});

test('typos, adjacent swaps, the wrong round, junk and unknown modes are refused; Thai numerals and spacing are read', () => {
  const code = wordCode(3, '90817', 455, 20, 'office');
  assert.ok(parseWordCode(code, 3));
  let typos = 0;
  for (let i = 0; i < code.length; i++) {
    for (let d = 0; d < 10; d++) {
      if (String(d) === code[i]) continue;
      typos++;
      assert.equal(parseWordCode(code.slice(0, i) + d + code.slice(i + 1), 3), null, `typo at ${i} -> ${d}`);
    }
  }
  assert.equal(typos, 126);
  for (let i = 0; i + 1 < code.length; i++) {
    if (code[i] === code[i + 1]) continue;
    assert.equal(parseWordCode(code.slice(0, i) + code[i + 1] + code[i] + code.slice(i + 2), 3), null, `swap at ${i}`);
  }
  for (const r of [0, 1, 2, 4, 5, 10]) assert.equal(parseWordCode(code, r), null, `round ${r}`);
  assert.equal(parseWordCode(code + '0', 3), null);
  assert.equal(parseWordCode('abc', 3), null);
  const thai = [...code].map((c) => String.fromCodePoint(0x0e50 + Number(c))).join('');
  assert.deepEqual(parseWordCode(thai, 3), parseWordCode(code, 3));
  assert.deepEqual(parseWordCode(`${code.slice(0, 4)} ${code.slice(4, 8)}-${code.slice(8)}`, 3), parseWordCode(code, 3));
  // Payloads no host emits, each with a valid check digit: [cut, revision, kind, pool, format].
  const minted = (cut, rev, kind, pool, format) => {
    const payload = '12345' + cut + rev + kind + pool + format;
    return payload + dammCheck('3' + payload);
  };
  assert.ok(parseWordCode(minted('500', '1', '03', '2', '0'), 3), 'control: a well-formed payload parses');
  assert.equal(parseWordCode(minted('500', '1', '22', '0', '0'), 3), null, 'kind 22: past the KINDS table');
  assert.equal(parseWordCode(minted('500', '1', '50', '0', '0'), 3), null, "kind 50: engine 2b's block");
  assert.equal(parseWordCode(minted('500', '1', '03', '4', '0'), 3), null, 'pool 4');
  assert.equal(parseWordCode(minted('500', '1', '03', '2', '1'), 3), null, 'format 1');
  assert.equal(parseWordCode(minted('000', '1', '03', '2', '0'), 3), null, 'cut 000: no half-cut host mints it');
  assert.ok(parseWordCode(minted('001', '1', '03', '2', '0'), 3), 'cut 001 can be minted');
  assert.ok(KINDS.length < SCRIPT_KIND_BASE);
});

test('the KINDS table: each language family once for game 1, the fixed game-5 and game-7 families, no duplicates', () => {
  const keys = KINDS.map((k) => `${k.game}|${k.lang}|${k.family}`);
  assert.equal(new Set(keys).size, KINDS.length);
  assert.deepEqual(KINDS.filter((k) => k.game === 1 && k.lang === 'th').map((k) => k.family), [...THAI_FAMILIES]);
  assert.deepEqual(KINDS.filter((k) => k.game === 1 && k.lang === 'en').map((k) => k.family), [...ENGLISH_FAMILIES]);
  assert.deepEqual(KINDS.filter((k) => k.game !== 1).map((k) => `${k.game}|${k.lang}|${k.family}`), [
    '5|th|consonantClass', '5|en|wordType', '7|th|syllables', '7|en|syllables',
  ]);
  assert.deepEqual([...POOL_ORDER].sort(), [...POOLS].sort());
});

test('the fixture banks give every KINDS entry at least one feasible setup, so the sweeps deal every kind', () => {
  const setups = feasibleSetups(banks);
  const missing = KINDS.filter((k) => !setups.some((s) => s.game === k.game && s.lang === k.lang && s.family === k.family));
  assert.deepEqual(missing, []);
});

// ---- the half-cut rule ----------------------------------------------------------------------------------------

test('the host refuses any round that is not a half-cut, and a setup it cannot play', () => {
  const random = prng(11);
  const setup = { game: 1, lang: 'en', pool: 'general', family: 'syllables' };
  for (const [live, keep] of [[50, 20], [20, 5], [21, 10], [10, 6]]) {
    assert.throws(() => hostWordRound('123456', 1, roster(live, random), keep, random, setup, banks), (e) => e instanceof RangeError && /live = 2 x keep/.test(e.message));
  }
  assert.ok(hostWordRound('123456', 1, roster(40, random), 20, random, setup, banks));
  assert.throws(() => hostWordRound('123456', 1, roster(40, random), 20, random, { ...setup, pool: 'animal' }, banks), /no feasible pair/);
  assert.throws(() => hostWordRound('123456', 1, roster(40, random), 20, random, { game: 5, lang: 'th', pool: 'general', family: 'syllables' }, banks), /does not play/);
  assert.throws(() => hostWordRound('123456', 1, roster(40, random), 20, random, { game: 1, lang: 'en', pool: 'general', family: 'karan' }, banks), /carry no karan/);
});

// ---- exact cut and phone == host ------------------------------------------------------------------------------

test('every half-cut configuration from proposeSchedule for N in 9..300: exact cut, suspense, phone == host', (t) => {
  const configs = halfCutConfigs();
  const setups = feasibleSetups(banks);
  assert.equal(configs.length, 396);
  assert.ok(setups.length >= 40, `fixture setups: ${setups.length}`);
  const keys = 2;
  const r = sweep({ banks, configs, keys, setupsFor: (ci, k) => [setups[(ci * keys + k) % setups.length]] });
  t.diagnostic(`configs ${configs.length}, rounds ${r.rounds}, identities ${r.identities}, cut checks ${r.cutChecks}, phone checks ${r.phoneChecks}, by live>keep ${JSON.stringify(r.byLive)}`);
  assert.deepEqual(r.bad, { cut: 0, phone: 0, suspense: 0, unplayable: 0, hand: 0 });
  assert.equal(r.rounds, 792);
  assert.equal(r.identities, 34960);
});

test('N = 200, 100 and 40: every half-cut step, every feasible setup, both candidates x both polarities', (t) => {
  const configs = halfCutConfigs(9, 300).filter((c) => [40, 100, 200].includes(c.n));
  assert.deepEqual(configs.map((c) => `${c.n}:${c.round}`), ['40:1', '40:2', '100:1', '100:3', '100:4', '200:1', '200:2']);
  const setups = feasibleSetups(banks);
  const r = sweep({ banks, configs, keys: 1, setupsFor: () => setups, seedBase: 2 });
  t.diagnostic(`rounds ${r.rounds}, identities ${r.identities}, cut checks ${r.cutChecks}`);
  assert.equal(r.rounds, configs.length * setups.length);
  assert.deepEqual(r.bad, { cut: 0, phone: 0, suspense: 0, unplayable: 0, hand: 0 });
});

test('a phone with the wrong code reads nothing; a verdict needs the tap', () => {
  const random = prng(3);
  const ids = roster(20, random);
  const r = hostWordRound('654321', 2, ids, 10, random, { game: 7, lang: 'th', pool: 'food', family: 'syllables' }, banks);
  assert.deepEqual(phoneWordRound('654321', ids[0], 3, r.code, banks), { refused: 'bad-code' }, 'typed into the wrong round');
  assert.equal(phoneWordVerdict('654321', ids[0], 2, r.code.slice(0, 10), TAPS[0], banks), 'bad-code');
  const v = ids.map((id) => phoneWordVerdict('654321', id, 2, r.code, TAPS[0], banks));
  assert.equal(v.filter((x) => x === 'in').length, 10);
});

// ---- golden vectors -------------------------------------------------------------------------------------------

const IDS = ['AAAAAAAAAAAAAAAAAAAAAA', 'guest-0000000000000001', 'Zz9_-Zz9_-Zz9_-Zz9_-Zz', 'q1w2e3r4t5y6u7i8o9p0as'];
const GOLDEN = [
  {
    eventKey: '482913', round: 2, seed: '03141', cut: 500, setup: { game: 1, lang: 'th', pool: 'general', family: 'firstConsonant' },
    code: '03141500101006', kindIndex: 1,
    candidates: ['firstConsonant=ก', 'firstConsonant=ป'],
    held: [
      ['th-general-024', 'th-general-005', 'th-general-001'],
      ['th-general-012', 'th-general-009', 'th-general-004'],
      ['th-general-004', 'th-general-009', 'th-general-012'],
      ['th-general-005', 'th-general-001', 'th-general-024'],
    ],
  },
  {
    eventKey: '482913', round: 3, seed: '27182', cut: 480, setup: { game: 1, lang: 'en', pool: 'food', family: 'letters' },
    code: '27182480113205', kindIndex: 13,
    candidates: ['letters=c', 'letters=s'],
    held: [
      ['en-food-006', 'en-food-005', 'en-food-002'],
      ['en-food-005', 'en-food-006', 'en-food-002'],
      ['en-food-014', 'en-food-003', 'en-food-016'],
      ['en-food-001', 'en-food-010', 'en-food-008'],
    ],
  },
  {
    eventKey: '100200', round: 1, seed: '99999', cut: 520, setup: { game: 5, lang: 'th', pool: 'general', family: 'consonantClass' },
    code: '99999520118003', kindIndex: 18,
    candidates: ['th-general-021', 'th-general-011'],
    held: ['high', 'mid', 'mid', 'high'],
  },
  {
    eventKey: '100200', round: 4, seed: '00042', cut: 700, setup: { game: 7, lang: 'en', pool: 'general', family: 'syllables' },
    code: '00042700121000', kindIndex: 21,
    candidates: ['en-general-009', 'en-general-012'],
    held: [2, 3, 2, 2],
  },
];

function vector(v, b) {
  // Revision pinned to 1 on both sides, so a later DEAL_REVISION bump does not move the vectors.
  const code = wordCode(v.round, v.seed, v.cut, kindIndexOf(v.setup), v.setup.pool, 1);
  const parsed = parseWordCode(code, v.round);
  const rows = IDS.map((id) => phoneWordRound(v.eventKey, id, v.round, code, { ...b, revision: 1 }));
  const c = rows[0].candidates;
  return {
    code,
    kindIndex: parsed.kindIndex,
    decoded: { ...parsed.kind, pool: parsed.pool, seed: parsed.seed, cut: parsed.cut },
    candidates: c.kind === 'conditions' ? c.pair.map((x) => `${x.family}=${String(x.value)}`) : c.pair.map((w) => w.id),
    held: rows.map((r) => (r.holding.kind === 'hand' ? r.holding.words.map((w) => w.id) : r.holding.value)),
  };
}

test('golden vectors: (event key, round, seed, identity) -> code, decoded mode and dealt word ids, on the fixture banks', () => {
  for (const v of GOLDEN) {
    const got = vector(v, banks);
    assert.equal(got.code, v.code);
    assert.equal(got.kindIndex, v.kindIndex);
    assert.deepEqual(got.decoded, { ...v.setup, seed: v.seed, cut: v.cut });
    assert.deepEqual(got.candidates, v.candidates);
    assert.deepEqual(got.held, v.held);
  }
});

test('the golden vectors see a reordered pool (a stale or reordered bundle cannot pass them)', () => {
  for (const v of GOLDEN) {
    const got = vector(v, reorderedBanks(v.setup.lang, v.setup.pool));
    assert.notDeepEqual({ c: got.candidates, h: got.held }, { c: v.candidates, h: v.held }, `${v.code} must change under a reorder`);
  }
});

// ---- feasibility ----------------------------------------------------------------------------------------------

test('feasibility report: one row per kind x pool, excluded pairs carry their reason, thin pools play nothing', () => {
  const rows = feasibilityReport(banks);
  assert.equal(rows.length, KINDS.length * POOL_ORDER.length);
  for (const r of rows.filter((x) => x.pool === 'animal' && x.game === 1)) assert.equal(r.feasible.length, 0, `${r.lang} animal ${r.family}`);
  // Games 5 and 7 need one word per held value, so a thin pool can still play them where two values are present.
  const thAnimal5 = rows.find((r) => r.lang === 'th' && r.pool === 'animal' && r.game === 5);
  assert.deepEqual(thAnimal5.feasible, ['consonantClass=high | consonantClass=low']);
  assert.deepEqual(thAnimal5.excluded.map((e) => e.pair), ['consonantClass=high | consonantClass=mid', 'consonantClass=mid | consonantClass=low']);
  const g5 = rows.find((r) => r.lang === 'en' && r.pool === 'general' && r.game === 5);
  assert.deepEqual(g5.feasible, ['wordType=noun | wordType=verb', 'wordType=noun | wordType=adjective', 'wordType=verb | wordType=adjective']);
  const g7 = rows.find((r) => r.lang === 'en' && r.pool === 'animal' && r.game === 7);
  assert.equal(g7.excluded.length, 6);
  assert.match(g7.excluded.find((e) => e.pair === 'syllables=1 | syllables=2').reason, /second has 0/);
  for (const r of rows) for (const e of r.excluded) assert.ok(e.reason.length > 0);
});

function tinyBank(aWords, bWords) {
  const w = (text, i) => ({
    id: `en-general-${String(i + 1).padStart(3, '0')}`, text, firstChar: text[0], lastChar: text.at(-1), letters: [...new Set(text)].sort(),
    length: text.length, syllables: 1, workplaceSafe: true, review: 'reviewed', doubleLetter: false, wordType: 'noun',
    eligible: ['firstChar', 'lastChar', 'letters', 'length', 'doubleLetter', 'syllables', 'wordType'],
  });
  const general = [...aWords, ...bWords].map(w);
  return { th: { general: [], office: [], food: [], animal: [] }, en: { general, office: [], food: [], animal: [] } };
}

test('a quadrant needs 3 words: 3 + 2 is excluded with its counts, 3 + 3 is feasible', () => {
  const row = (b) => feasibilityReport(b).find((r) => r.lang === 'en' && r.pool === 'general' && r.game === 1 && r.family === 'firstChar');
  const thin = row(tinyBank(['ant', 'arm', 'axe'], ['bat', 'bee']));
  assert.deepEqual(thin.feasible, []);
  assert.deepEqual(thin.excluded, [{ pair: 'firstChar=a | firstChar=b', reason: 'A-not-B holds 3, B-not-A holds 2; each needs 3' }]);
  const enough = row(tinyBank(['ant', 'arm', 'axe'], ['bat', 'bee', 'bus']));
  assert.deepEqual(enough.feasible, ['firstChar=a | firstChar=b']);
});

test('pending and retired words are never dealt, and feasibility counts only playable words', () => {
  const pend = banks.en.general.find((w) => w.review === 'pending');
  const ret = banks.en.general.find((w) => w.retired);
  assert.ok(pend && ret, 'precondition: the fixture plants a pending and a retired word');
  const rows = feasibilityReport(banks).filter((r) => r.lang === 'en' && r.pool === 'general');
  const all = banks.en.general.filter((w) => w.review === 'reviewed' && !w.retired).length;
  for (const r of rows.filter((x) => x.game === 1 && x.family === 'firstChar')) assert.equal(r.playableWords, all);
  const random = prng(5);
  const ids = roster(200, random);
  for (const family of ['firstChar', 'lastChar', 'letters', 'length', 'doubleLetter', 'syllables', 'wordType']) {
    const r = hostWordRound('777777', 1, ids, 100, random, { game: 1, lang: 'en', pool: 'general', family }, banks);
    for (const h of r.holdings.values()) for (const w of h.words) assert.ok(w.id !== pend.id && w.id !== ret.id, `${family} dealt ${w.id}`);
  }
});
