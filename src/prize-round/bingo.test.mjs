// node --test — game 3 composition (gh#323): the alphabet split, the card shape, and the mark threshold that makes
// the cut exact with no tie: every card scores THRESHOLD..MAX_OWN_MARKS under its own script and below THRESHOLD
// under the other. Plus the barred letter sets: at least one member of each is out of the round's universe (sets that
// overlap can share the excluded letter), so no card, script or row can hold a full set.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BINGO, BINGO_ALPHABET, BINGO_BARRED, CARD_SIZE, DRAWS, MAX_OWN_MARKS, SHARED, THRESHOLD } from './bingo.ts';
import { scoreAt } from './script-kit.ts';
import { prng, roster } from './scripted-fixtures.mjs';

test('alphabets and constants: 42 Thai consonants (no obsolete letters), 26 English letters, room for every set', () => {
  assert.equal(BINGO_ALPHABET.th.length, 42);
  assert.equal(new Set(BINGO_ALPHABET.th).size, 42);
  assert.ok(!BINGO_ALPHABET.th.includes('ฃ') && !BINGO_ALPHABET.th.includes('ฅ'));
  assert.equal(BINGO_ALPHABET.en.length, 26);
  assert.deepEqual([DRAWS, SHARED, THRESHOLD, MAX_OWN_MARKS, CARD_SIZE], [12, 6, 4, 6, 9]);
  for (const [lang, a] of Object.entries(BINGO_ALPHABET)) assert.ok(SHARED + 2 * (DRAWS - SHARED) + (CARD_SIZE - THRESHOLD) <= a.length - BINGO_BARRED[lang].length);
});

test('every card: 9 distinct letters, THRESHOLD..MAX_OWN_MARKS marks under its own script, under THRESHOLD under the other', () => {
  const random = prng(31);
  const seen = { own: new Map(), other: new Map() };
  let cards = 0;
  for (const lang of ['th', 'en']) {
    for (let k = 0; k < 30; k++) {
      const ctx = { eventKey: String(200000 + k), round: 1 + (k % 4), seed: String(10000 + k * 37), setup: { game: 3, lang, pool: 'general' }, banks: null };
      const c = BINGO.compose(ctx);
      const [s0, s1] = c.scripts;
      assert.equal(s0.length, DRAWS);
      assert.equal(new Set(s0).size, DRAWS);
      assert.equal(s0.filter((x) => s1.includes(x)).length, SHARED);
      for (const set of BINGO_BARRED[lang]) for (const s of c.scripts) assert.ok(!set.every((x) => s.includes(x)), `script holds a barred set at ${ctx.eventKey}`);
      for (const id of roster(40, random)) {
        for (const g of [0, 1]) {
          const card = c.holding(id, g);
          cards++;
          assert.equal(card.length, CARD_SIZE);
          assert.equal(new Set(card).size, CARD_SIZE);
          assert.ok(card.every((x) => BINGO_ALPHABET[lang].includes(x)));
          for (const set of BINGO_BARRED[lang]) assert.ok(!set.every((x) => card.includes(x)), `card holds a barred set at ${ctx.eventKey}`);
          const own = scoreAt(c.scripts[g], card, DRAWS);
          const other = scoreAt(c.scripts[1 - g], card, DRAWS);
          assert.ok(own >= THRESHOLD && own <= MAX_OWN_MARKS, `own ${own}`);
          assert.ok(other < THRESHOLD, `other ${other}`);
          seen.own.set(own, (seen.own.get(own) ?? 0) + 1);
          seen.other.set(other, (seen.other.get(other) ?? 0) + 1);
        }
      }
    }
  }
  assert.equal(cards, 4800);
  assert.deepEqual([...seen.own.keys()].sort(), [4, 5, 6], 'every own-mark count in range is dealt');
  assert.deepEqual([...seen.other.keys()].sort(), [0, 1, 2, 3], 'every other-mark count in range is dealt');
});

test('game 3 reads no bank and plays only under the general pool digit', () => {
  assert.equal(BINGO.infeasible(null, { game: 3, lang: 'th', pool: 'general' }), null);
  assert.match(BINGO.infeasible(null, { game: 3, lang: 'th', pool: 'food' }), /no word pool/);
});

// ---- barred letter sets -----------------------------------------------------------------------------------------

/** The barred sets, written out here so the named cases do not depend on the list they check. */
const BARRED_TH = ['\u0e2b', '\u0e27', '\u0e22'];
const BARRED_TH_2 = ['\u0e04', '\u0e27', '\u0e22'];
const BARRED_EN = [['b', 'e', 't'], ['s', 'e', 'x']];
const ctxOf = (lang, eventKey, round, seed) => ({ eventKey, round, seed, setup: { game: 3, lang, pool: 'general' }, banks: null });
const thCtx = (eventKey, round, seed) => ctxOf('th', eventKey, round, seed);
const holdsAll = (items, set) => set.every((x) => items.includes(x));
/** A set named by codepoints, so no failure message spells a barred word. */
const cps = (set) => set.map((x) => `U+${x.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join(' ');

test('connector: every barred set named here is on the list, and every member of every set is a bingo letter', () => {
  for (const [lang, sets] of [['th', [BARRED_TH, BARRED_TH_2]], ['en', BARRED_EN]]) {
    for (const want of sets) assert.ok(BINGO_BARRED[lang].some((set) => set.join() === want.join()), `${lang} set ${cps(want)} is on the list`);
  }
  for (const lang of ['th', 'en']) {
    for (const set of BINGO_BARRED[lang]) {
      assert.ok(set.length >= 2 && new Set(set).size === set.length, `set ${cps(set)}`);
      for (const x of set) assert.ok(BINGO_ALPHABET[lang].includes(x), `U+${x.codePointAt(0).toString(16)} not in the ${lang} alphabet`);
    }
  }
});

test('every round: shared + sides + rest + excluded partitions the alphabet, and every barred set has a member excluded', () => {
  const hit = new Map();
  let rounds = 0;
  for (const lang of ['th', 'en']) {
    for (let k = 0; k < 60; k++) {
      for (const round of [1, 2, 3, 4]) {
        const c = BINGO.compose({ eventKey: String(300000 + k * 13), round, seed: String(10000 + k * 101 + round), setup: { game: 3, lang, pool: 'general' }, banks: null });
        rounds++;
        const { shared, sides, rest, excluded } = c.detail;
        assert.ok(Array.isArray(excluded), 'detail.excluded is a list');
        const all = [...shared, ...sides[0], ...sides[1], ...rest, ...excluded];
        assert.deepEqual([...all].sort(), [...BINGO_ALPHABET[lang]].sort(), 'a partition of the alphabet');
        // Overlapping sets can share one excluded letter, so a round excludes between 1 and one-per-set letters.
        assert.ok(excluded.length >= (BINGO_BARRED[lang].length ? 1 : 0) && excluded.length <= BINGO_BARRED[lang].length, `excluded ${excluded.length}`);
        for (const x of excluded) assert.ok(BINGO_BARRED[lang].some((set) => set.includes(x)), `excluded ${x} belongs to a barred set`);
        assert.equal(rest.length, BINGO_ALPHABET[lang].length - 2 * DRAWS + SHARED - excluded.length);
        for (const set of BINGO_BARRED[lang]) {
          const out = set.filter((x) => excluded.includes(x));
          assert.ok(out.length >= 1, `set ${cps(set)} has a member excluded`);
          for (const x of out) hit.set(`${set.join()}|${x}`, (hit.get(`${set.join()}|${x}`) ?? 0) + 1);
        }
      }
    }
  }
  assert.equal(rounds, 480);
  for (const set of [BARRED_TH, BARRED_TH_2, ...BARRED_EN]) {
    for (const x of set) assert.ok(hit.get(`${set.join()}|${x}`) > 0, `${cps([x])} is the excluded member of ${cps(set)} in some round`);
  }
});

test('a card that held the whole barred set on the unguarded engine no longer does', () => {
  const card = BINGO.compose(thCtx('200003', 4, '10111')).holding('9k9NKS0o6Sj-9o0AH4s77m', 0);
  assert.ok(!holdsAll(card, BARRED_TH));
});

test('a card whose middle row read the barred set on the unguarded engine reads it in no row', () => {
  const card = BINGO.compose(thCtx('200207', 4, '17659')).holding('jR_YX4J6GUUcQMCWiB6oPP', 0);
  for (let r = 0; r < 3; r++) assert.notEqual(card.slice(3 * r, 3 * r + 3).join(''), BARRED_TH.join(''), `row ${r}`);
  assert.ok(!holdsAll(card, BARRED_TH));
});

test('a script that drew the barred set consecutively on the unguarded engine no longer holds it', () => {
  const c = BINGO.compose(thCtx('201677', 2, '72049'));
  assert.notEqual(c.scripts[1].slice(9, 12).join(''), BARRED_TH.join(''));
  for (const s of c.scripts) assert.ok(!holdsAll(s, BARRED_TH));
});

// Each case held its set in full on the engine before these sets were barred: a whole card, one card row, or a
// draw script. Found by search on that engine; each must now hold none of it in full.
const WIDENED_CASES = [
  { set: BARRED_TH_2, lang: 'th', at: ['500203', 2, '31281'], card: ['5jjXCh9v0mP5D-Xh5klhAC', 1] },
  { set: BARRED_TH_2, lang: 'th', at: ['507791', 2, '52962'], card: ['zwhqH2mTULZKJbJJV9CmSK', 0], row: 1 },
  { set: BARRED_TH_2, lang: 'th', at: ['500644', 1, '55788'], script: 0 },
  { set: BARRED_EN[0], lang: 'en', at: ['500000', 1, '20000'], card: ['RDnJZoP4vL4MzfH-SC2QFL', 0] },
  { set: BARRED_EN[0], lang: 'en', at: ['500000', 1, '20000'], card: ['g3lOfxrNokZMtlgl522hoT', 0], row: 2 },
  { set: BARRED_EN[0], lang: 'en', at: ['500021', 4, '21167'], script: 0 },
  { set: BARRED_EN[1], lang: 'en', at: ['500000', 1, '20000'], card: ['QZ1PYSTlzuvz2rl1EsVtpT', 0] },
  { set: BARRED_EN[1], lang: 'en', at: ['500021', 4, '21167'], card: ['h77UHbiXEJwGkbCuBZ_UDm', 0], row: 0 },
  { set: BARRED_EN[1], lang: 'en', at: ['500042', 3, '22334'], script: 0 },
];

test('the widened sets: every card, card row and script that held one in full before they were barred holds none now', () => {
  const full = [];
  for (const k of WIDENED_CASES) {
    const c = BINGO.compose(ctxOf(k.lang, ...k.at));
    const label = `${cps(k.set)} at ${k.at.join('/')}`;
    if (k.script !== undefined) {
      if (holdsAll(c.scripts[k.script], k.set)) full.push(`script ${k.script}: ${label}`);
      continue;
    }
    const card = c.holding(...k.card);
    if (k.row !== undefined && holdsAll(card.slice(3 * k.row, 3 * k.row + 3), k.set)) full.push(`row ${k.row}: ${label}`);
    if (holdsAll(card, k.set)) full.push(`card ${k.card[0]}: ${label}`);
  }
  assert.deepEqual(full, [], 'each case must hold no barred set in full');
});
