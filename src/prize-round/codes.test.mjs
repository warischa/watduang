// node --test — code-kind crossover (gh#323 REFUTE round 1): no single-digit edit of a valid code of any kind, and
// no unedited code of another kind, is accepted by the word-code or script-code decoder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crossoverTable, mintSamples, singleEdits } from './code-crossover.mjs';

test('the edit generator covers substitution, insertion, deletion and adjacent transposition', () => {
  const e = singleEdits('123');
  for (const x of ['023', '1203', '13', '213', '1234', '0123']) assert.ok(e.includes(x), x);
  assert.ok(!e.includes('123'));
  // Deduplicated: an insertion next to an equal digit and a substitution can produce the same string.
  assert.equal(e.length, new Set(e).size);
});

test('no single edit of any code kind, and no other kind as is, is accepted by the word or script decoder', (t) => {
  const samples = mintSamples(40, 7);
  const kinds = new Set(samples.map((s) => s.kind));
  assert.deepEqual([...kinds].sort(), ['cut', 'deal', 'final', 'script', 'word']);
  const table = crossoverTable(samples);
  const hits = Object.entries(table).filter(([k, v]) => /-> (word|script)$/.test(k) && v.accepted > 0);
  t.diagnostic(JSON.stringify(Object.fromEntries(Object.entries(table).filter(([k]) => /-> (word|script)$/.test(k)).map(([k, v]) => [k, `${v.accepted}/${v.tried}`]))));
  assert.ok(Object.values(table).reduce((s, v) => s + v.tried, 0) > 100000, 'a real sample');
  assert.deepEqual(hits.map(([k, v]) => `${k}: ${v.accepted}/${v.tried}`), []);
});
