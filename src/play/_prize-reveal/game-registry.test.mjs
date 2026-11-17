// The game registry (gh#305): which game may play which step, which games are integrated, and one literal
// lazy import per game, so the bundler splits each game (and three) out of the page's first load.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as reg from './game-registry.ts';
import { CUT_GAMES, FINAL_GAMES } from '../../prize-event/game-contract.ts';

const REAL = ['fireworks', 'cards', 'ladder', 'zones', 'marbles', 'envelopes', 'flipcards'];
const STUBS = [];

test('eligibility: the registry agrees with the persisted contract about which game plays which step', () => {
  const ids = Object.keys(reg.GAMES);
  assert.deepEqual(ids.filter((g) => reg.eligible(g, 'round')).sort(), [...CUT_GAMES].sort());
  assert.deepEqual(ids.filter((g) => reg.eligible(g, 'final')).sort(), [...FINAL_GAMES].sort());
  assert.deepEqual([...ids].sort(), [...new Set([...CUT_GAMES, ...FINAL_GAMES])].sort(), 'a registry game is in neither contract list');
  assert.equal(reg.eligible('nope', 'round'), false);
});

test('phase 2 steps: zones and marbles are cut games, envelopes and flipcards are finals', () => {
  const phase2 = ['zones', 'marbles', 'envelopes', 'flipcards'];
  assert.deepEqual(phase2.filter((g) => reg.eligible(g, 'round')), ['zones', 'marbles']);
  assert.deepEqual(phase2.filter((g) => reg.eligible(g, 'final')), ['envelopes', 'flipcards']);
});

test('availability: every registry game is integrated, an unknown id is not', () => {
  for (const id of REAL) assert.equal(reg.isAvailable(id), true, id);
  for (const id of STUBS) assert.equal(reg.isAvailable(id), false, id);
  assert.equal(reg.isAvailable('nope'), false);
  assert.deepEqual(Object.keys(reg.GAMES).filter(reg.isAvailable).sort(), [...REAL].sort(), 'an integrated game is not in the named set');
});

test('the setup picker offers only an available game: the page filter, run over the registry, never lists a stub', () => {
  const page = fs.readFileSync(new URL('../../pages/game/prize-draw/index.astro', import.meta.url), 'utf8');
  assert.match(page, /eligible\(g, 'round'\) && isAvailable\(g\)/);
  assert.match(page, /eligible\(g, 'final'\) && isAvailable\(g\)/);
  const offered = (kind) => (kind === 'round' ? CUT_GAMES : FINAL_GAMES).filter((g) => reg.eligible(g, kind) && reg.isAvailable(g));
  assert.deepEqual(offered('round'), ['fireworks', 'cards', 'zones', 'marbles']);
  assert.deepEqual(offered('final'), ['fireworks', 'ladder', 'envelopes', 'flipcards']);
  for (const id of STUBS) assert.ok(!offered('round').includes(id) && !offered('final').includes(id), `${id} is offered`);
});

test('each loader is a literal lazy import, so the bundler can split it', () => {
  const src = fs.readFileSync(new URL('./game-registry.ts', import.meta.url), 'utf8');
  for (const id of [...REAL, ...STUBS]) {
    assert.match(src, new RegExp(`import\\('\\.\\./prize-${id}/renderer/index\\.ts'\\)`), id);
  }
  assert.doesNotMatch(src, /^import [^t].*from '\.\.\/prize-/m, 'a game is imported eagerly');
});

test('every available loader resolves a real module with mount, not a stub', async () => {
  for (const id of REAL) {
    const mod = await reg.loaderFor(id)();
    assert.equal(typeof mod.mount, 'function', id);
    // A stub completed synchronously on an empty input; a real module refuses an input with no outcome.
    assert.throws(() => mod.mount({}, {}, () => {}), undefined, `${id} still mounts an empty input like the stub did`);
  }
});

test('a stub, if one is ever listed, resolves a module with mount and refuses at once: nothing may play it yet', async () => {
  for (const id of STUBS) {
    const mod = await reg.loaderFor(id)();
    assert.equal(typeof mod.mount, 'function', id);
    assert.throws(() => mod.mount({}, {}, () => {}), /not integrated/, `${id} stub mounted`);
    assert.equal(reg.isAvailable(id), false, `${id} is mountable while it is a stub`);
  }
});

test('exactly the ids listed as stubs are marked unavailable in the registry source', () => {
  const src = fs.readFileSync(new URL('./game-registry.ts', import.meta.url), 'utf8');
  const off = [...src.matchAll(/^ {2}(\w+): \{\n(?: {4}.*\n)*? {4}available: false,/gm)].map((m) => m[1]);
  assert.deepEqual(off, STUBS);
});
