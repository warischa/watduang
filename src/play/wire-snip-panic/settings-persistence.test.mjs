// gh#264, owner ruling 2026-10-15 (ADR-0071 § Data, "Game settings are not players"): this route keeps
// persisting its OWN options -- the penalty mode and the chosen penalty -- under the storage key the
// mockup used, and never a player. The players are the shared roster's; the shared core migrates an
// old blob's player list out of this key and rewrites the blob without it. So the route must neither
// seed anyone from a blob that still carries one, nor write one that was not already there.
//
// Runs the REAL bytes: the state object, the page-ready handler (which loads, then wires),
// attachEventListeners (whose penalty tabs, chips and text field save), loadSavedSettings,
// saveSettings, renderPenaltyUI and startWithPlayers, sliced out of main.js over a tolerant document
// carrying this route's own penalty tabs and chips (read off markup.html), a stand-in player-screen
// mount, and a Map-backed storage. A "reload" is a second instance over the same storage.
//
// ponytail: no browser and no layout. What is measured is what the route reads from and writes to the
// key, and which tab and chip it marks; nothing it paints.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeDocumentStub, sliceBlock } from '../_dom-stub.mjs';

const MAIN = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');
const MARKUP = fs.readFileSync(path.join(import.meta.dirname, 'markup.html'), 'utf8');
const KEY = 'wire-panic-v1';

function slice(header) {
  const body = sliceBlock(MAIN, header);
  assert.ok(body, `main.js no longer declares ${header} -- this test is measuring nothing`);
  return body;
}
const enumAt = MAIN.indexOf('const GameState = Object.freeze({');
assert.notEqual(enumAt, -1, 'main.js no longer declares GameState');
const READY_HEADER = "window.addEventListener('DOMContentLoaded', () =>";
const ready = slice(READY_HEADER).slice(READY_HEADER.lastIndexOf('('));

const DECLS = [
  MAIN.slice(enumAt, MAIN.indexOf('});', enumAt) + 3),
  `${slice('const game =')};`,
  'let playerScreen = null;',
  slice('function loadSavedSettings()'),
  slice('function saveSettings()'),
  slice('function renderPenaltyUI()'),
  slice('function startWithPlayers(players)'),
  slice('function attachEventListeners()'),
].join('\n');

const MODES = [...MARKUP.matchAll(/class="penalty-tab[^"]*" data-mode="([^"]+)"/g)].map((m) => m[1]);
const CHIPS = [...MARKUP.matchAll(/class="preset-chip[^"]*" data-text="([^"]+)"/g)].map((m) => m[1]);
assert.deepEqual(MODES, ['preset', 'custom', 'none'], 'markup.html penalty tabs moved -- re-read them');
assert.ok(CHIPS.length >= 3, 'markup.html preset chips moved -- re-read them');

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

/** A tab or chip with a working class list, as markup.html ships it. */
function control(dataset, marked) {
  const classes = new Set(marked ? [marked] : []);
  const listeners = {};
  const node = {
    dataset,
    style: {},
    listeners,
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      toggle: (c, on) => (on ?? !classes.has(c) ? classes.add(c) : classes.delete(c)),
      contains: (c) => classes.has(c),
    },
    addEventListener: (type, fn) => (listeners[type] ??= []).push(fn),
    click() { for (const fn of listeners.click ?? []) fn({ currentTarget: node, target: node }); },
  };
  return node;
}

/** One page load over `storage`: the route's declarations, then the page-ready handler. */
function load(storage) {
  const { document } = makeDocumentStub();
  const tabs = MODES.map((mode, i) => control({ mode }, i === 0 ? 'active' : null));
  const chips = CHIPS.map((text, i) => control({ text }, i === 0 ? 'selected' : null));
  document.querySelectorAll = (sel) => (sel === '.penalty-tab' ? tabs : sel === '.preset-chip' ? chips : []);
  const window = { addEventListener() {} };
  const soundSynth = { enabled: true, init() {}, playClick() {} };
  const mountPlayerScreen = () => ({ open() {}, close() {} });
  const route = new Function(
    'document', 'window', 'localStorage', 'soundSynth', 'mountPlayerScreen', 'wireSnipPanic', 'showScreen',
    'roundActive', 'putAwayRound',
    `${DECLS}\nconst onReady = ${ready};\nonReady();\nreturn { game, startWithPlayers };`,
  )(document, window, storage.api, soundSynth, mountPlayerScreen, { players: [2, 10] }, () => {}, () => false, () => {});
  const marked = (list, cls) => list.filter((n) => n.classList.contains(cls));
  return {
    ...route,
    tab: (mode) => tabs.find((t) => t.dataset.mode === mode),
    chip: (text) => chips.find((c) => c.dataset.text === text),
    markedTab: () => marked(tabs, 'active').map((t) => t.dataset.mode),
    markedChip: () => marked(chips, 'selected').map((c) => c.dataset.text),
    customField: () => document.getElementById('input-custom-penalty'),
  };
}

const seat = (names) => names.map((name, i) => ({ name, emoji: `e${i}` }));

test('wire-snip-panic: the penalty choice survives a reload, and the reloaded options screen shows it', () => {
  const storage = makeStorage();
  const first = load(storage);
  assert.equal(first.game.penaltyMode, 'preset', 'positive control: an empty device starts on the default');
  first.chip(CHIPS[2]).click();
  assert.ok(storage.slots.has(KEY), 'choosing a preset writes the settings key');

  const second = load(storage);
  assert.equal(second.game.selectedPenalty, CHIPS[2], 'the reloaded route reads the chosen preset');
  second.startWithPlayers(seat(['a', 'b']));
  assert.deepEqual(second.markedChip(), [CHIPS[2]], 'and the options screen marks it, not the markup default');

  second.tab('custom').click();
  second.customField().listeners.input.forEach((fn) => fn({ target: { value: '  sing the anthem  ' } }));
  const third = load(storage);
  assert.equal(third.game.penaltyMode, 'custom');
  assert.equal(third.game.selectedPenalty, 'sing the anthem', 'typed penalty text is read back');
  third.startWithPlayers(seat(['a', 'b']));
  assert.deepEqual(third.markedTab(), ['custom']);
});

test('wire-snip-panic: a stored blob that still holds players seeds nobody', () => {
  const blob = { players: ['Mallory', 'Trent', 'Eve'], penaltyMode: 'none', selectedPenalty: CHIPS[1] };
  const { game } = load(makeStorage({ [KEY]: JSON.stringify(blob) }));
  assert.equal(game.penaltyMode, 'none', 'the blob WAS read -- its setting landed');
  assert.deepEqual(game.players, [], 'and not one of its players was seated');
  assert.deepEqual(game.scores, [], 'nor a score kept for one');
});

test('wire-snip-panic: the blob this route writes has no players field', () => {
  const storage = makeStorage();
  const route = load(storage);
  route.startWithPlayers(seat(['Alice', 'Bob']));
  route.tab('none').click();
  const written = JSON.parse(storage.slots.get(KEY));
  assert.equal(Object.hasOwn(written, 'players'), false, `players written back: ${storage.slots.get(KEY)}`);
  assert.deepEqual(written, { penaltyMode: 'none', selectedPenalty: CHIPS[0] });
});

/** The shared core's settings-blob migration for this key, run over `api` as a later mount runs it.
 *  Returns the roster it leaves. */
async function migrate(api) {
  globalThis.localStorage = api;
  const { LEGACY_LISTS } = await import('../_player-screen/player-screen.ts');
  const { migrateLegacyList, loadRoster } = await import('../../shell/roster.ts');
  const entry = LEGACY_LISTS.find((l) => l.key === KEY);
  await migrateLegacyList(entry.key, entry.extract, entry.keep);
  return loadRoster().names();
}

/** `storage` with the origin's quota used up: a write that would grow what is stored throws, as a
 *  full browser store does, and one that shrinks it lands. A store that refused EVERY write would
 *  also refuse the core's players-less rewrite and hide a core that drops the field anyway. */
function originFull(storage) {
  const units = () => [...storage.slots].reduce((n, [k, v]) => n + k.length + v.length, 0);
  const cap = units();
  return {
    ...storage.api,
    setItem: (k, v) => {
      const before = storage.slots.get(k);
      storage.slots.set(k, String(v));
      if (units() <= cap) return;
      if (before === undefined) storage.slots.delete(k);
      else storage.slots.set(k, before);
      throw new Error('QuotaExceededError');
    },
  };
}

// gh#264 REFUTE round 4: when the core's import did not land (quota), the blob keeps its players for
// the next mount -- and this route's next settings save used to rewrite the blob without them, so the
// names were gone before any later mount could import them. The save now carries an existing players
// field through untouched; it still never seats from it and never adds one.
test('wire-snip-panic: players the core could not import yet survive a settings save, and a later mount imports them', async () => {
  const blob = { players: ['Alice', 'Bob'], penaltyMode: 'custom', selectedPenalty: 'x' };
  const storage = makeStorage({ [KEY]: JSON.stringify(blob) });
  const full = originFull(storage);
  assert.deepEqual(await migrate(full), [], 'the first mount\'s import did not land');
  assert.deepEqual(JSON.parse(storage.slots.get(KEY)), blob, 'so the core left the blob whole');

  const route = load(storage);
  assert.deepEqual(route.game.players, [], 'the route seats nobody from the pending field');
  route.startWithPlayers(seat(['Carol', 'Dan']));
  route.tab('none').click();
  const written = JSON.parse(storage.slots.get(KEY));
  assert.equal(written.penaltyMode, 'none', 'the setting the save was for landed');
  assert.deepEqual(written.players, blob.players, `the pending players were not carried through: ${storage.slots.get(KEY)}`);

  assert.deepEqual(await migrate(storage.api), ['Alice', 'Bob'], 'a later mount imports them');
  route.tab('preset').click();
  assert.equal(Object.hasOwn(JSON.parse(storage.slots.get(KEY)), 'players'), false, 'once imported, a save never puts the field back');
});

test('wire-snip-panic: corrupt JSON and a storage that throws are both tolerated', () => {
  const corrupt = load(makeStorage({ [KEY]: '{"penaltyMode": "none"' }));
  assert.equal(corrupt.game.penaltyMode, 'preset', 'corrupt JSON leaves the default in place');

  const locked = load(makeStorage({}, true));
  assert.doesNotThrow(() => locked.tab('custom').click(), 'a failed write must not break the tab');
  assert.equal(locked.game.penaltyMode, 'custom', 'the choice still holds for this visit');
});
