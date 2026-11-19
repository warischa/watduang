// node --test — game 4 composition (gh#323): the owner's link rule read from stored cells, chain feasibility, and
// the seeded chain search agreeing with a brute-force search on every order.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHAIN_LENGTH, chainEligible, findChainPair, linkIn, linkOut, links } from './chain.ts';
import { scriptInfeasible } from './scripted.ts';
import { prng, scriptFixtureBanks } from './scripted-fixtures.mjs';

const banks = scriptFixtureBanks();
const th = (text) => Object.values(banks.th).flat().find((w) => w.text === text);
const en = (text) => Object.values(banks.en).flat().find((w) => w.text === text);

test('Thai link rule: only a consonant last character passes a link on, to the next word first consonant', () => {
  // Ends in a vowel sign, a tone mark, a karan: not chain-eligible.
  for (const text of ['ปู', 'ไก่', 'จันทร์']) assert.equal(linkOut(th(text)), null, text);
  assert.equal(chainEligible(th('ปู')), false);
  assert.equal(chainEligible(th('ไก่')), false);
  assert.equal(chainEligible(th('จันทร์')), false);
  // Ends in a consonant, including the letters that also write vowels.
  assert.equal(linkOut(th('ดินสอ')), 'อ');
  assert.equal(linkOut(th('กล้วย')), 'ย');
  assert.equal(linkOut(th('ข้าว')), 'ว');
  // The next word starts with its first consonant, leading vowel skipped.
  assert.equal(linkIn(th('เงิน')), 'ง');
  assert.ok(links(th('บึง'), th('เงิน')));
  assert.ok(links(th('ดินสอ'), th('อ่าง')));
  assert.ok(!links(th('เงิน'), th('เงิน')), 'a word never follows itself');
  assert.ok(!links(th('นก'), th('บึง')));
});

test('English link rule: last letter to first letter', () => {
  assert.equal(linkOut(en('desk')), 'k');
  assert.equal(linkIn(en('keyboard')), 'k');
  assert.ok(links(en('desk'), en('keyboard')));
  assert.ok(!links(en('desk'), en('paper')));
});

test('pending and retired words take no part in a chain', () => {
  for (const lang of ['th', 'en']) {
    for (const w of banks[lang].general.filter((x) => x.review !== 'reviewed' || x.retired)) assert.equal(chainEligible(w), false, w.id);
  }
  const yellow = banks.en.general.find((w) => w.text === 'yellow');
  assert.ok(yellow && /^[a-z]$/.test(yellow.lastChar), 'precondition: the planted pending word ends in a letter');
});

function tinyEnglish(texts) {
  const general = texts.map((text, i) => ({
    id: `en-general-${String(i + 1).padStart(3, '0')}`, text, firstChar: text[0], lastChar: text.at(-1), letters: [...new Set(text)].sort(),
    length: text.length, syllables: 1, workplaceSafe: true, review: 'reviewed', doubleLetter: false, wordType: 'noun',
    eligible: ['firstChar', 'lastChar', 'letters', 'length', 'doubleLetter', 'syllables', 'wordType'],
  }));
  return { th: { general: [], office: [], food: [], animal: [] }, en: { general, office: [], food: [], animal: [] } };
}

test(`a pool plays game 4 only with two word-disjoint chains of ${CHAIN_LENGTH}`, () => {
  assert.equal(CHAIN_LENGTH, 5);
  const two = ['ab', 'bc', 'cd', 'de', 'ef', 'gh', 'hi', 'ij', 'jk', 'kl'];
  assert.equal(scriptInfeasible(tinyEnglish(two), { game: 4, lang: 'en', pool: 'general' }), null);
  assert.match(scriptInfeasible(tinyEnglish(two.slice(0, 9)), { game: 4, lang: 'en', pool: 'general' }), /9 chain-eligible words hold no two word-disjoint chains of 5/);
  // One long chain of 10 holds two disjoint chains of 5.
  assert.equal(scriptInfeasible(tinyEnglish(['ab', 'bc', 'cd', 'de', 'ef', 'fg', 'gh', 'hi', 'ij', 'jk']), { game: 4, lang: 'en', pool: 'general' }), null);
});

function bruteForceHasPair(words, length) {
  const chains = [];
  const walk = (path) => {
    if (path.length === length) return void chains.push(path);
    for (const w of words) if (!path.includes(w) && links(path.at(-1), w)) walk([...path, w]);
  };
  for (const w of words) walk([w]);
  return chains.some((a) => chains.some((b) => b.every((w) => !a.includes(w))));
}

test('the seeded chain search finds a pair exactly when a brute-force search does, on every order tried', () => {
  const random = prng(99);
  let feasible = 0;
  let infeasible = 0;
  for (let n = 0; n < 300; n++) {
    const texts = new Set();
    while (texts.size < 7) texts.add('abcd'[Math.floor(random() * 4)] + 'xyz'[Math.floor(random() * 3)] + 'abcd'[Math.floor(random() * 4)]);
    const words = tinyEnglish([...texts]).en.general;
    const next = new Map(words.map((a) => [a.id, words.filter((b) => links(a, b))]));
    const want = bruteForceHasPair(words, 3);
    want ? feasible++ : infeasible++;
    for (let o = 0; o < 4; o++) {
      const rank = new Map(words.map((w) => [w.id, random()]));
      const got = findChainPair({ words, next }, 3, rank).pair;
      assert.equal(got !== null, want, `case ${n} order ${o}`);
      if (got) {
        for (const c of got) for (let i = 1; i < c.length; i++) assert.ok(links(c[i - 1], c[i]));
        assert.ok(got[0].every((w) => !got[1].includes(w)));
      }
    }
  }
  assert.ok(feasible > 20 && infeasible > 20, `both outcomes sampled: ${feasible} feasible, ${infeasible} infeasible`);
});

test('a pathological pool where every chain needs one shared word is judged infeasible in under 1 s', () => {
  // 101 rows with link counts s->t 25, t->c 25, c->p 1, p->r 25, r->e 25: every chain of 5 needs the single c->p
  // word, so no two word-disjoint chains exist, and an unbounded search retries 25^4 first chains.
  const mid = (i) => 'abcdefghijklmnopqrstuvwxy'[i];
  const texts = [];
  for (const [a, b, n] of [['s', 't', 25], ['t', 'c', 25], ['c', 'p', 1], ['p', 'r', 25], ['r', 'e', 25]]) for (let i = 0; i < n; i++) texts.push(a + mid(i) + b);
  assert.equal(texts.length, 101);
  const banks = tinyEnglish(texts);
  const t0 = performance.now();
  const why = scriptInfeasible(banks, { game: 4, lang: 'en', pool: 'general' });
  const ms = performance.now() - t0;
  assert.ok(ms < 1000, `feasibility took ${Math.round(ms)} ms`);
  assert.match(why ?? '', /no two word-disjoint chains/, 'infeasible: a pair would have to share the c->p word');
  // Control: give the c->p link a second word and a pair exists; it is found, valid and disjoint, also fast.
  const fixed = tinyEnglish([...texts, 'czp']);
  const t1 = performance.now();
  assert.equal(scriptInfeasible(fixed, { game: 4, lang: 'en', pool: 'general' }), null);
  assert.ok(performance.now() - t1 < 1000);
});

test('a capped search reports exhaustion and returns no pair, never a partial one; uncapped it finds a valid pair', () => {
  const banks = tinyEnglish(['ab', 'bc', 'cd', 'de', 'ef', 'gh', 'hi', 'ij', 'jk', 'kl']);
  const words = banks.en.general;
  const graph = { words, next: new Map(words.map((a) => [a.id, words.filter((b) => links(a, b))])) };
  const rank = new Map(words.map((w, i) => [w.id, i]));
  assert.deepEqual(findChainPair(graph, 5, rank, 3), { pair: null, steps: 3, exhausted: true });
  const r = findChainPair(graph, 5, rank);
  assert.equal(r.exhausted, false);
  assert.deepEqual(r.pair.map((c) => c.map((w) => w.text).join('>')), ['ab>bc>cd>de>ef', 'gh>hi>ij>jk>kl']);
});
