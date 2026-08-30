// node --test src/games/ — no framework, no dependency
// Covers the pure helper in _pick-index.ts. These five tests were src/games/pick-loser.test.mjs's
// helper half; gh#154 deleted that game, but short-stick.ts still imports pickLoser(), so the tests
// moved here rather than going with the page. The DOM half (the pl-* screens) went with the game.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickLoser } from './_pick-index.ts';

test('pick is always a member of the roster, at minimum legal roster size (2)', () => {
  const players = ['เอ', 'บี'];
  for (let i = 0; i < 50; i++) {
    const idx = pickLoser(players);
    assert.ok(players[idx] !== undefined, `index ${idx} is out of set`);
    assert.ok(players.includes(players[idx]));
  }
});

test('pick is always a member of the roster at max size (10)', () => {
  const players = Array.from({ length: 10 }, (_, i) => `คนที่ ${i + 1}`);
  for (let i = 0; i < 50; i++) {
    const idx = pickLoser(players);
    assert.ok(players[idx] !== undefined, `index ${idx} is out of set`);
  }
});

// rand is [0,1) in practice (Math.random never returns 1) — 0.999999 stands in for the top edge
test('injected rand maps deterministically to every index — a stuck picker fails this', () => {
  const players = ['เอ', 'บี', 'ซี', 'ดี', 'อี'];
  for (let i = 0; i < players.length; i++) {
    const idx = pickLoser(players, () => i / players.length);
    assert.equal(idx, i);
  }
  assert.equal(pickLoser(players, () => 0.999999), players.length - 1);
  assert.equal(pickLoser(players, () => 0), 0);
});

test('over enough draws, every roster member is reachable — coverage equals the roster', () => {
  for (const size of [2, 10]) {
    const players = Array.from({ length: size }, (_, i) => `คนที่ ${i + 1}`);
    const seen = new Set();
    for (let i = 0; i < 500; i++) {
      seen.add(pickLoser(players, Math.random));
    }
    assert.equal(seen.size, size, `coverage ${seen.size}/${size} — a stuck picker never reaches every index`);
  }
});

test('an empty roster must throw, not silently return an out-of-set index', () => {
  assert.throws(() => pickLoser([]), /ว่างเปล่า/);
});
