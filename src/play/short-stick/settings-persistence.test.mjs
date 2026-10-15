// gh#264, owner ruling 2026-10-15 (ADR-0071 § Data, "Game settings are not players"): this route keeps
// persisting its OWN options -- the stick and short counts, the penalty mode and the chosen penalty --
// under the storage key the mockup used, and never a player. The players are the shared roster's; the
// shared core migrates an old blob's player list out of this key and rewrites the blob without it. So
// the route must neither seed anyone from a blob that still carries one, nor write one back.
//
// Runs the REAL bytes: the game state object, loadDraft, saveDraft, renderSetup (whose preset chips
// save), lockFairCounts, startWithPlayers and the setup controls' own handlers, sliced out of main.js
// over a tolerant document and a Map-backed storage. A "reload" is a second instance over the same
// storage. The one thing NOT executed is the IIFE's own top-level call to loadDraft: that is pinned on
// comment-stripped source text below, which proves the call is written, not that it runs.
//
// ponytail: no browser and no layout. What is measured is what the route reads from and writes to the
// key; nothing it paints.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeDocumentStub, sliceBlock } from '../_dom-stub.mjs';

const MAIN = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');
const KEY = 'short-stick-pro-v2';

function slice(header) {
  const body = sliceBlock(MAIN, header);
  assert.ok(body, `main.js no longer declares ${header} -- this test is measuring nothing`);
  return body;
}
function between(open, close) {
  const at = MAIN.indexOf(open);
  assert.notEqual(at, -1, `main.js no longer declares ${open}`);
  return MAIN.slice(at, MAIN.indexOf(close, at) + close.length);
}
/** A listener registered as `$('<id>').addEventListener('<type>', (...) => { ... })`, as an arrow. */
function handler(header) {
  const s = slice(header);
  return s.slice(header.lastIndexOf('('));
}

const DECLS = [
  between('const GameState = Object.freeze({', '});'),
  between('const PENALTY_PRESETS = [', '];'),
  `${slice('const game =')};`,
  slice('const lockFairCounts = () =>'),
  slice('const renderSetup = () =>'),
  slice('const loadDraft = () =>'),
  slice('const saveDraft = () =>'),
  slice('function startWithPlayers(players)'),
].join('\n');
const HANDLERS = {
  mode: "$('penalty-mode-select').addEventListener('change', (e) =>",
  custom: "$('penalty-custom-input').addEventListener('input', (e) =>",
  fewerSticks: "$('btn-fewer-sticks').addEventListener('click', () =>",
  moreSticks: "$('btn-more-sticks').addEventListener('click', () =>",
  fewerShorts: "$('btn-fewer-shorts').addEventListener('click', () =>",
  moreShorts: "$('btn-more-shorts').addEventListener('click', () =>",
};
const handlerSource = Object.entries(HANDLERS).map(([k, h]) => `${k}: ${handler(h)}`).join(',\n');

function makeStorage(seed = {}, broken = false) {
  const slots = new Map(Object.entries(seed));
  const fail = () => { throw new Error('SecurityError: storage is disabled'); };
  const api = broken
    ? { getItem: fail, setItem: fail, removeItem: fail }
    : {
        getItem: (k) => (slots.has(k) ? slots.get(k) : null),
        setItem: (k, v) => slots.set(k, String(v)),
        removeItem: (k) => slots.delete(k),
      };
  return { slots, api };
}

/** One page load over `storage`: the route's state and functions, then the top-level loadDraft(). */
function load(storage) {
  const { document, created } = makeDocumentStub();
  const sounds = { playClick() {} };
  const route = new Function(
    'document', 'localStorage', 'sounds', 'setView',
    `const $ = (id) => document.getElementById(id);\n${DECLS}\n` +
      `const on = {\n${handlerSource}\n};\nloadDraft();\nreturn { game, PENALTY_PRESETS, startWithPlayers, on };`,
  )(document, storage.api, sounds, () => {});
  const chip = (text) => created.find((n) => n.textContent === text);
  return { ...route, chip };
}

const seat = (names) => names.map((name, i) => ({ name, emoji: `e${i}` }));

test('short-stick: the penalty choice survives a reload', () => {
  const storage = makeStorage();
  const first = load(storage);
  assert.equal(first.game.penaltyMode, 'none', 'positive control: an empty device starts on the default');
  first.startWithPlayers(seat(['a', 'b', 'c']));
  first.on.mode({ target: { value: 'preset' } });
  const pick = first.PENALTY_PRESETS[2];
  for (const fn of first.chip(pick).listeners.click) fn();
  assert.equal(first.game.selectedPenalty, pick);

  const second = load(storage);
  assert.equal(second.game.penaltyMode, 'preset');
  assert.equal(second.game.selectedPenalty, pick, 'a preset chip choice is read back');

  second.on.mode({ target: { value: 'custom' } });
  second.on.custom({ target: { value: 'sing the anthem' } });
  const third = load(storage);
  assert.equal(third.game.penaltyMode, 'custom');
  assert.equal(third.game.selectedPenalty, 'sing the anthem', 'typed penalty text is read back');
});

test('short-stick: stored counts are read, and the stick count is then re-derived from the players at start', () => {
  const blob = { stickCount: 7, shortCount: 2, penaltyMode: 'none', selectedPenalty: '' };
  const route = load(makeStorage({ [KEY]: JSON.stringify(blob) }));
  assert.equal(route.game.stickCount, 7);
  assert.equal(route.game.shortCount, 2);
  route.startWithPlayers(seat(['a', 'b', 'c']));
  assert.equal(route.game.stickCount, 3, 'one stick per player handed over, never a stored number');
  assert.equal(route.game.shortCount, 1);
});

test('short-stick: every setup control writes the settings key', () => {
  for (const name of ['mode', 'custom', 'fewerSticks', 'moreSticks', 'fewerShorts', 'moreShorts']) {
    const storage = makeStorage();
    const route = load(storage);
    route.startWithPlayers(seat(['a', 'b', 'c', 'd']));
    // Room to move both ways, so every stepper's guard lets the tap through.
    route.game.stickCount = 6;
    route.game.shortCount = 2;
    route.on[name]({ target: { value: 'preset' } });
    assert.ok(storage.slots.has(KEY), `${name} changed a setting and wrote nothing`);
  }
});

test('short-stick: a stored blob that still holds players seeds nobody', () => {
  const blob = { players: ['Mallory', 'Trent', 'Eve'], penaltyMode: 'custom', selectedPenalty: 'x' };
  const { game } = load(makeStorage({ [KEY]: JSON.stringify(blob) }));
  assert.equal(game.penaltyMode, 'custom', 'the blob WAS read -- its setting landed');
  assert.deepEqual(game.players, [], 'and not one of its players was seated');
});

test('short-stick: the blob this route writes has no players field', () => {
  const storage = makeStorage();
  const route = load(storage);
  route.startWithPlayers(seat(['Alice', 'Bob']));
  route.on.mode({ target: { value: 'none' } });
  const written = JSON.parse(storage.slots.get(KEY));
  assert.equal(Object.hasOwn(written, 'players'), false, `players written back: ${storage.slots.get(KEY)}`);
  assert.deepEqual(written, { stickCount: 2, shortCount: 1, penaltyMode: 'none', selectedPenalty: '' });
});

test('short-stick: corrupt JSON and a storage that throws are both tolerated', () => {
  const corrupt = load(makeStorage({ [KEY]: '{"penaltyMode": "custom"' }));
  assert.equal(corrupt.game.penaltyMode, 'none', 'corrupt JSON leaves the default in place');

  const locked = load(makeStorage({}, true));
  locked.startWithPlayers(seat(['a', 'b']));
  assert.doesNotThrow(() => locked.on.mode({ target: { value: 'preset' } }), 'a failed write must not break the control');
  assert.equal(locked.game.penaltyMode, 'preset', 'the choice still holds for this visit');
});

// The one leg not executed above (see the header): the IIFE reads the draft on load.
test('short-stick: main.js reads the draft at load (source check)', () => {
  const code = MAIN.split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');
  assert.match(code, /^\s*loadDraft\(\);\s*$/m, 'no top-level loadDraft() call: settings would be saved and never read');
});
