// node --test — engine 2b (gh#323): the script code, the half-cut refusal, the exact cut under both candidate
// scripts x both polarities, phone == host at every step, golden vectors. Runs on the fixture banks of
// scripted-fixtures.mjs, never the live bank (still pending, and grown concurrently).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostDealCuts, parseCode, dammCheck, CUT_CODE_LENGTH, DEAL_CODE_LENGTH, FINAL_CODE_LENGTH } from '../prize-draw/round-code.ts';
import { hostWordRound, parseWordCode, phoneWordRound, phoneWordVerdict, wordCode, WORD_CODE_LENGTH } from './round.ts';
import {
  SCRIPT_CODE_LENGTH,
  hostScriptRound,
  parseScriptCode,
  phoneScriptDeal,
  phoneScriptStep,
  phoneScriptTrace,
  phoneScriptVerdict,
  scriptCode,
  scriptInfeasible,
} from './scripted.ts';
import {
  allScriptSetups,
  feasibleScriptSetups,
  halfCutConfigs,
  prng,
  reorderedScriptBanks,
  roster,
  scriptFixtureBanks,
  scriptSweep,
  TAPS,
} from './scripted-fixtures.mjs';

const banks = scriptFixtureBanks();
const NO_BAD = { cut: 0, phone: 0, step: 0, suspense: 0, cross: 0, script: 0, gap: 0 };

// ---- the code -------------------------------------------------------------------------------------------------

test("a script code is a 14-digit word-family code in engine 2b's kind block; each parser refuses the others", () => {
  assert.equal(SCRIPT_CODE_LENGTH, 14);
  assert.equal(SCRIPT_CODE_LENGTH, WORD_CODE_LENGTH);
  for (const len of [CUT_CODE_LENGTH, DEAL_CODE_LENGTH, FINAL_CODE_LENGTH]) assert.ok(Math.abs(SCRIPT_CODE_LENGTH - len) >= 2, `phase-1 length ${len}`);
  const code = scriptCode(2, '12345', 512, { game: 4, lang: 'en', pool: 'food' }, 1);
  assert.equal(code.length, 14);
  for (let r = 1; r <= 4; r++) {
    assert.equal(parseCode(code, r), null, `phase-1 parseCode must refuse a script code in round ${r}`);
    assert.equal(parseWordCode(code, r), null, `parseWordCode must refuse a script code in round ${r}`);
  }
  assert.deepEqual(parseScriptCode(code, 2), { seed: '12345', cut: 512, revision: 1, setup: { game: 4, lang: 'en', pool: 'food' } });
  const random = prng(7);
  const ids = roster(40, random);
  const half = hostDealCuts('123456', 1, ids, 20, random);
  assert.equal(parseScriptCode(half.code, 1), null, 'a half-cut deal code');
  assert.equal(parseScriptCode(hostDealCuts('123456', 1, ids, 15, random).code, 1), null, 'a non-half-cut deal code');
  assert.equal(parseScriptCode(half.code.slice(0, CUT_CODE_LENGTH), 1), null, 'a cut-length code');
  assert.equal(parseScriptCode(wordCode(1, '12345', 512, 3, 'food', 1), 1), null, 'an engine 2a word code');
});

test('typos, adjacent swaps, the wrong round, junk, unknown digits are refused; Thai numerals and spacing are read', () => {
  const code = scriptCode(3, '90817', 455, { game: 2, lang: 'th', pool: 'office' }, 1);
  assert.ok(parseScriptCode(code, 3));
  let typos = 0;
  for (let i = 0; i < code.length; i++) {
    for (let d = 0; d < 10; d++) {
      if (String(d) === code[i]) continue;
      typos++;
      assert.equal(parseScriptCode(code.slice(0, i) + d + code.slice(i + 1), 3), null, `typo at ${i} -> ${d}`);
    }
  }
  assert.equal(typos, 126);
  for (let i = 0; i + 1 < code.length; i++) {
    if (code[i] === code[i + 1]) continue;
    assert.equal(parseScriptCode(code.slice(0, i) + code[i + 1] + code[i] + code.slice(i + 2), 3), null, `swap at ${i}`);
  }
  for (const r of [0, 1, 2, 4, 5]) assert.equal(parseScriptCode(code, r), null, `round ${r}`);
  assert.equal(parseScriptCode(code + '0', 3), null);
  assert.equal(parseScriptCode('abc', 3), null);
  const thai = [...code].map((c) => String.fromCodePoint(0x0e50 + Number(c))).join('');
  assert.deepEqual(parseScriptCode(thai, 3), parseScriptCode(code, 3));
  assert.deepEqual(parseScriptCode(`${code.slice(0, 4)} ${code.slice(4, 8)}-${code.slice(8)}`, 3), parseScriptCode(code, 3));
  // Payloads no host emits, each with a valid check digit: cut + revision + kind + pool + format.
  const minted = (tail) => '12345' + tail + dammCheck('3' + '12345' + tail);
  assert.ok(parseScriptCode(minted('500' + '1' + '54' + '2' + '0'), 3), 'control: game 4 th food parses');
  for (const [tail, why] of [
    ['500' + '1' + '03' + '2' + '0', "kind 03: engine 2a's block"],
    ['500' + '1' + '56' + '2' + '0', 'kind 56: past SCRIPT_KINDS'],
    ['500' + '1' + '52' + '1' + '0', 'game 3 off pool 0'],
    ['500' + '1' + '54' + '2' + '1', 'format 1'],
    ['000' + '1' + '54' + '2' + '0', 'cut 000: no half-cut host mints it'],
  ]) {
    assert.equal(parseScriptCode(minted(tail), 3), null, why);
  }
});

// ---- the half-cut rule and feasibility -------------------------------------------------------------------------

test('the host refuses any round that is not a half-cut, and a setup it cannot play', () => {
  const random = prng(11);
  const setup = { game: 2, lang: 'en', pool: 'general' };
  for (const [live, keep] of [[50, 20], [20, 5], [21, 10], [10, 6]]) {
    assert.throws(() => hostScriptRound('123456', 1, roster(live, random), keep, random, setup, banks), (e) => e instanceof RangeError && /live = 2 x keep/.test(e.message));
  }
  assert.ok(hostScriptRound('123456', 1, roster(40, random), 20, random, setup, banks));
  assert.throws(() => hostScriptRound('123456', 1, roster(40, random), 20, random, { game: 4, lang: 'th', pool: 'animal' }, banks), /no feasible script.*two word-disjoint chains/);
  assert.throws(() => hostScriptRound('123456', 1, roster(40, random), 20, random, { game: 3, lang: 'th', pool: 'food' }, banks), /game 3 reads no word pool/);
  assert.throws(() => hostScriptRound('123456', 1, roster(40, random), 20, random, { game: 5, lang: 'th', pool: 'general' }, banks), /not a scripted game/);
});

test('the fixture banks play every scripted setup except game 4 on the thin animal pools', () => {
  const missing = allScriptSetups().filter((s) => scriptInfeasible(banks, s) !== null).map((s) => `${s.game}|${s.lang}|${s.pool}`);
  assert.deepEqual(missing, ['4|th|animal', '4|en|animal']);
  assert.equal(feasibleScriptSetups(banks).length, 16);
});

// ---- exact cut and phone == host at every step -----------------------------------------------------------------

test('every half-cut configuration from proposeSchedule for N in 9..300: exact cut, every step phone == host', (t) => {
  const configs = halfCutConfigs();
  const setups = feasibleScriptSetups(banks);
  assert.equal(configs.length, 396);
  const keys = 2;
  const r = scriptSweep({ banks, configs, keys, setupsFor: (ci, k) => [setups[(ci * keys + k) % setups.length]] });
  t.diagnostic(`rounds ${r.rounds}, identities ${r.identities}, cut checks ${r.cutChecks}, step checks ${r.stepChecks}, by game ${JSON.stringify(r.byGame)}`);
  assert.deepEqual(r.bad, NO_BAD);
  assert.equal(r.rounds, 792);
  assert.deepEqual(Object.keys(r.byGame).sort(), ['2', '3', '4'], 'every game is dealt');
  assert.ok(r.stepChecks > r.identities * 4 * 3, 'steps were compared, not only verdicts');
});

test('N = 200, 100 and 40: every half-cut step, every feasible setup, both scripts x both polarities', (t) => {
  const configs = halfCutConfigs(9, 300).filter((c) => [40, 100, 200].includes(c.n));
  assert.deepEqual(configs.map((c) => `${c.n}:${c.round}`), ['40:1', '40:2', '100:1', '100:3', '100:4', '200:1', '200:2']);
  const setups = feasibleScriptSetups(banks);
  const r = scriptSweep({ banks, configs, keys: 1, setupsFor: () => setups, seedBase: 2 });
  t.diagnostic(`rounds ${r.rounds}, identities ${r.identities}, step checks ${r.stepChecks}, bingo gap ${JSON.stringify(r.bingoGap)}`);
  assert.equal(r.rounds, configs.length * setups.length);
  assert.deepEqual(r.bad, NO_BAD);
  assert.ok(r.bingoGap.minSurvivor > r.bingoGap.maxOut);
});

test('a phone with the wrong code reads nothing; a step past the end is null; a verdict needs the tap', () => {
  const random = prng(3);
  const ids = roster(20, random);
  const r = hostScriptRound('654321', 2, ids, 10, random, { game: 3, lang: 'en', pool: 'general' }, banks);
  assert.deepEqual(phoneScriptDeal('654321', ids[0], 3, r.code, banks), { refused: 'bad-code' }, 'typed into the wrong round');
  assert.deepEqual(phoneScriptTrace('654321', ids[0], 2, r.code.slice(0, 11), TAPS[0], banks), { refused: 'bad-code' });
  assert.equal(phoneScriptStep('654321', ids[0], 2, r.code, TAPS[0], 13, banks), null);
  assert.equal(phoneScriptStep('654321', ids[0], 2, r.code, TAPS[0], 12, banks).verdict !== null, true);
  assert.equal(phoneScriptStep('654321', ids[0], 2, r.code, TAPS[0], 11, banks).verdict, null, 'no verdict before the last step');
  for (const tap of TAPS) {
    const v = ids.map((id) => phoneScriptVerdict('654321', id, 2, r.code, tap, banks));
    assert.equal(v.filter((x) => x === 'in').length, 10);
  }
});

test('pending and retired words are never in a script or a holding', () => {
  const planted = new Set(['th', 'en'].flatMap((l) => banks[l].general.filter((w) => w.review !== 'reviewed' || w.retired).map((w) => w.id)));
  assert.equal(planted.size, 4, 'precondition: the fixture plants a pending and a retired word per language');
  const random = prng(5);
  let rounds = 0;
  for (const lang of ['th', 'en']) {
    for (const game of [2, 4]) {
      for (let k = 0; k < 40; k++) {
        const ids = roster(20, random);
        const r = hostScriptRound(String(100000 + k), 1 + (k % 4), ids, 10, random, { game, lang, pool: 'general' }, banks);
        rounds++;
        const seen = [...(r.detail.words ?? []), ...r.scripts.flat(), ...[...r.holdings.values()].flat()];
        for (const x of seen) assert.ok(!planted.has(x), `game ${game} dealt ${x}`);
      }
    }
  }
  assert.equal(rounds, 160);
});

// ---- golden vectors -------------------------------------------------------------------------------------------

const IDS = ['AAAAAAAAAAAAAAAAAAAAAA', 'guest-0000000000000001', 'Zz9_-Zz9_-Zz9_-Zz9_-Zz', 'q1w2e3r4t5y6u7i8o9p0as'];
const GOLDEN = [
  {
    eventKey: '482913', round: 2, seed: '03141', cut: 500, setup: { game: 2, lang: 'th', pool: 'general' }, code: '03141500150008',
    scripts: [['ส', 'ม', 'ุ', 'ด'], ['เ', 'ง', 'ิ', 'น']],
    held: [['ม'], ['ิ'], ['น'], ['ุ']],
  },
  {
    eventKey: '482913', round: 3, seed: '27182', cut: 480, setup: { game: 2, lang: 'en', pool: 'food' }, code: '27182480151209',
    scripts: [['s', 'a', 'l', 't', 'y'], ['o', 'r', 'a', 'n', 'g', 'e']],
    held: [['o'], ['e'], ['t'], ['t']],
  },
  {
    eventKey: '100200', round: 1, seed: '99999', cut: 520, setup: { game: 3, lang: 'th', pool: 'general' }, code: '99999520152006',
    scripts: [
      ['ศ', 'ต', 'ซ', 'ฎ', 'ส', 'อ', 'ม', 'ฑ', 'ฐ', 'ญ', 'ฉ', 'ล'],
      ['ฝ', 'ด', 'ฬ', 'ฏ', 'ซ', 'ญ', 'ต', 'ฉ', 'ฐ', 'ง', 'ฑ', 'ป'],
    ],
    held: [
      ['ฆ', 'ค', 'ล', 'ม', 'อ', 'ฎ', 'น', 'ส', 'ข'],
      ['ร', 'ว', 'จ', 'ต', 'ญ', 'ด', 'ง', 'บ', 'ฮ'],
      ['ฏ', 'ว', 'ฝ', 'ด', 'ฒ', 'ร', 'ภ', 'ก', 'ฬ'],
      ['บ', 'ศ', 'อ', 'ล', 'ฐ', 'ษ', 'พ', 'ม', 'ฎ'],
    ],
  },
  {
    eventKey: '100200', round: 4, seed: '00042', cut: 700, setup: { game: 3, lang: 'en', pool: 'general' }, code: '00042700153008',
    scripts: [['e', 'r', 'a', 't', 'k', 'f', 'p', 'g', 'n', 'y', 'x', 'j'], ['v', 'h', 'p', 'e', 'm', 'z', 'i', 'k', 't', 'g', 'x', 'l']],
    held: [['g', 'd', 'b', 'y', 'o', 'j', 'c', 'n', 'q'], ['m', 'd', 'o', 'l', 'u', 'k', 'i', 'q', 't'], ['c', 'd', 'x', 'n', 'b', 'j', 'f', 'q', 'u'], ['r', 'w', 'j', 'a', 'd', 'e', 'c', 'x', 'y']],
  },
  {
    eventKey: '777001', round: 2, seed: '16180', cut: 450, setup: { game: 4, lang: 'th', pool: 'food' }, code: '16180450154200',
    scripts: [['th-food-002', 'th-food-007', 'th-food-013', 'th-food-021', 'th-food-022'], ['th-food-005', 'th-food-019', 'th-food-020', 'th-food-017', 'th-food-018']],
    held: [['th-food-007'], ['th-food-013'], ['th-food-002'], ['th-food-021']],
  },
  {
    eventKey: '777001', round: 1, seed: '14142', cut: 610, setup: { game: 4, lang: 'en', pool: 'office' }, code: '14142610155104',
    scripts: [['en-office-017', 'en-office-022', 'en-office-004', 'en-office-023', 'en-office-011'], ['en-office-024', 'en-office-018', 'en-office-005', 'en-office-015', 'en-office-019']],
    held: [['en-office-011'], ['en-office-024'], ['en-office-022'], ['en-office-011']],
  },
];

function vector(v, banksIn) {
  // Revision pinned to 1 on both sides, so a later BANK_REVISION bump does not move the vectors.
  const b = { ...banksIn, revision: 1 };
  const code = scriptCode(v.round, v.seed, v.cut, v.setup, 1);
  const scripts = [0, 1].map((rule) => phoneScriptTrace(v.eventKey, IDS[0], v.round, code, { rule, polarity: 'survive' }, b).slice(1).map((s) => s.item));
  return { code, decoded: parseScriptCode(code, v.round), scripts, held: IDS.map((id) => [...phoneScriptDeal(v.eventKey, id, v.round, code, b).holding]) };
}

test('golden vectors: (event key, round, seed, identity) -> code, both scripts and the dealt items, on the fixture banks', () => {
  for (const v of GOLDEN) {
    const got = vector(v, banks);
    assert.equal(got.code, v.code);
    assert.deepEqual(got.decoded, { seed: v.seed, cut: v.cut, revision: 1, setup: v.setup });
    assert.deepEqual(got.scripts, v.scripts);
    assert.deepEqual(got.held, v.held);
  }
});

test('the golden vectors of the bank-reading games see a reordered pool', () => {
  for (const v of GOLDEN.filter((x) => x.setup.game !== 3)) {
    const got = vector(v, reorderedScriptBanks(v.setup.lang, v.setup.pool));
    assert.notDeepEqual({ s: got.scripts, h: got.held }, { s: v.scripts, h: v.held }, `${v.code} must change under a reorder`);
  }
});

// ---- bank revision ----------------------------------------------------------------------------------------------

/** A later build: one reviewed word appended to the English general pool, and the revision bumped. */
function laterBuild() {
  const b = scriptFixtureBanks();
  const w = b.en.general[0];
  const id = `en-general-${String(b.en.general.length + 1).padStart(3, '0')}`;
  b.en.general.push({ ...w, id, text: 'zebra', firstChar: 'z', lastChar: 'a', letters: ['a', 'b', 'e', 'r', 'z'], length: 5, doubleLetter: false, syllables: 2, wordType: 'noun' });
  return { ...b, revision: 2 };
}

test('two builds on different bank revisions disagree, and the stale phone refuses with stale-bank instead of dealing', () => {
  const host = laterBuild();
  const stale = { ...scriptFixtureBanks(), revision: 1 };
  const staleIgnoringRevision = { ...stale, revision: 2 };
  const random = prng(17);
  let identities = 0;
  let wouldDiffer = 0;
  for (let k = 0; k < 20; k++) {
    const ids = roster(20, random);
    const s2 = hostScriptRound(String(400000 + k), 1 + (k % 4), ids, 10, random, { game: 2, lang: 'en', pool: 'general' }, host);
    const w1 = hostWordRound(String(500000 + k), 1 + (k % 4), ids, 10, random, { game: 1, lang: 'en', pool: 'general', family: 'letters' }, host);
    for (const id of ids) {
      identities++;
      assert.deepEqual(phoneScriptDeal(String(400000 + k), id, 1 + (k % 4), s2.code, stale), { refused: 'stale-bank' });
      assert.equal(phoneScriptVerdict(String(400000 + k), id, 1 + (k % 4), s2.code, TAPS[0], stale), 'stale-bank');
      assert.deepEqual(phoneWordRound(String(500000 + k), id, 1 + (k % 4), w1.code, stale), { refused: 'stale-bank' });
      assert.equal(phoneWordVerdict(String(500000 + k), id, 1 + (k % 4), w1.code, TAPS[0], stale), 'stale-bank');
      // Same-revision phones deal, and match the host.
      assert.deepEqual(phoneScriptDeal(String(400000 + k), id, 1 + (k % 4), s2.code, host).holding, s2.holdings.get(id));
      // Why the refusal matters: the stale content, had it ignored the revision, deals something else.
      const a = phoneScriptDeal(String(400000 + k), id, 1 + (k % 4), s2.code, staleIgnoringRevision);
      const b = phoneWordRound(String(500000 + k), id, 1 + (k % 4), w1.code, staleIgnoringRevision);
      if (a.holding.join() !== s2.holdings.get(id).join() || b.holding.words.map((x) => x.id).join() !== w1.holdings.get(id).words.map((x) => x.id).join()) wouldDiffer++;
    }
  }
  assert.equal(identities, 400);
  assert.ok(wouldDiffer > 0, 'precondition: the two builds really disagree');
});
