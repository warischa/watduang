// The game registry (gh#305): which game may play which step, which games are integrated, and one literal
// lazy import per game, so the bundler splits each game (and three) out of the page's first load.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as reg from './game-registry.ts';

test('eligibility: elimination takes fireworks or cards, the final takes fireworks or ladder', () => {
  assert.deepEqual(['fireworks', 'cards', 'ladder'].filter((g) => reg.eligible(g, 'round')), ['fireworks', 'cards']);
  assert.deepEqual(['fireworks', 'cards', 'ladder'].filter((g) => reg.eligible(g, 'final')), ['fireworks', 'ladder']);
  assert.equal(reg.eligible('nope', 'round'), false);
});

test('availability: all three games are integrated; an unknown id is not', () => {
  assert.equal(reg.isAvailable('fireworks'), true);
  assert.equal(reg.isAvailable('cards'), true);
  assert.equal(reg.isAvailable('ladder'), true);
  assert.equal(reg.isAvailable('nope'), false);
});

test('each loader is a literal lazy import, so the bundler can split it', () => {
  const src = fs.readFileSync(new URL('./game-registry.ts', import.meta.url), 'utf8');
  for (const id of ['fireworks', 'cards', 'ladder']) {
    assert.match(src, new RegExp(`import\\('\\.\\./prize-${id}/renderer/index\\.ts'\\)`), id);
  }
  assert.doesNotMatch(src, /^import [^t].*from '\.\.\/prize-/m, 'a game is imported eagerly');
});

test('every loader resolves a real module with mount, not a stub', async () => {
  for (const id of ['fireworks', 'cards', 'ladder']) {
    const mod = await reg.loaderFor(id)();
    assert.equal(typeof mod.mount, 'function', id);
    // A stub completed synchronously on an empty input; a real module refuses an input with no outcome.
    assert.throws(() => mod.mount({}, {}, () => {}), undefined, `${id} still mounts an empty input like the stub did`);
  }
});
