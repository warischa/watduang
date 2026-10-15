// gh#264, owner ruling 2026-10-15 (ADR-0071 § Data, "Game settings are not players"): this route keeps
// persisting its OWN option, the penalty mode, under the storage key the mockup used -- and never a
// player. The players are the shared roster's; the shared core migrates an old blob's player list out
// of this key and rewrites the blob without it. So the route must neither seed anyone from a blob that
// still carries one, nor write one that was not already there.
//
// Runs the REAL bytes: the GameEngine constructor (which loads), initUIBindings (which wires the
// penalty buttons that save), loadStorage, saveStorage and syncPenaltyButtons, sliced out of main.js
// and run against stand-ins for everything else -- the sound and FX engines, the player-screen mount,
// a tolerant document with the three penalty buttons the markup ships, and a Map-backed storage.
// A "reload" is a second engine constructed over the same storage on a fresh page.
//
// ponytail: no browser and no layout. What is measured is what the engine reads from and writes to
// the key, and which penalty button ends up marked; nothing it paints.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeDocumentStub, sliceBlock } from '../_dom-stub.mjs';

const MAIN = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');
const KEY = 'ZERO_TRIGGER_DATA_V1';

function slice(source, header) {
  const body = sliceBlock(source, header);
  assert.ok(body, `main.js no longer declares ${header} -- this test is measuring nothing`);
  return body;
}

const ENGINE = slice(MAIN, 'class GameEngine');
const METHODS = ['constructor()', 'initUIBindings()', 'loadStorage()', 'saveStorage()', 'syncPenaltyButtons()'];
const bodies = METHODS.map((h) => slice(ENGINE, h));

/** Map-backed web storage. `broken` makes every call throw, the way a locked-down browser does. */
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

/** One penalty button as the markup ships it: `preset` starts marked. */
function penaltyButton(mode) {
  const classes = new Set(mode === 'preset' ? ['active'] : []);
  const listeners = {};
  return {
    dataset: { mode },
    listeners,
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      toggle: (c, on) => (on ?? !classes.has(c) ? classes.add(c) : classes.delete(c)),
      contains: (c) => classes.has(c),
    },
    addEventListener: (type, fn) => (listeners[type] ??= []).push(fn),
    click() { for (const fn of listeners.click ?? []) fn({ target: this }); },
  };
}

/** A fresh page and an engine constructed on it over `storage` -- one page load. */
function load(storage) {
  const { document } = makeDocumentStub();
  const buttons = ['preset', 'custom', 'none'].map(penaltyButton);
  document.querySelectorAll = (sel) => (sel === '.penalty-btn' ? buttons : []);
  document.querySelector = () => null;
  const window = { addEventListener() {} };
  const quiet = { warn() {} };
  class SoundSynth {
    constructor() { this.enabled = true; }
    toggleAudio() { return this.enabled; }
    playClick() {}
    resume() {}
  }
  class FXEngine {}
  const mountPlayerScreen = () => ({ open() {}, close() {} });
  const fns = new Function(
    'document', 'window', 'localStorage', 'console', 'SoundSynth', 'FXEngine', 'mountPlayerScreen',
    'game', 'PRESET_PENALTIES', 'armAllButtons',
    `return [${bodies.map((b) => `function ${b}`).join(',\n')}];`,
  )(document, window, storage.api, quiet, SoundSynth, FXEngine, mountPlayerScreen, { players: [2, 10] }, ['p'], () => {});
  const [ctor, initUIBindings, loadStorage, saveStorage, syncPenaltyButtons] = fns;
  const engine = { initUIBindings, loadStorage, saveStorage, syncPenaltyButtons };
  ctor.call(engine);
  const marked = () => buttons.filter((b) => b.classList.contains('active')).map((b) => b.dataset.mode);
  const press = (mode) => buttons.find((b) => b.dataset.mode === mode).click();
  return { engine, marked, press };
}

test('zero-trigger: the penalty mode survives a reload, and the reloaded page marks it', () => {
  const storage = makeStorage();
  const first = load(storage);
  assert.equal(first.engine.state.penaltyMode, 'preset', 'positive control: an empty device starts on the default');
  first.press('custom');
  assert.ok(storage.slots.has(KEY), 'choosing a penalty mode writes the settings key');

  const second = load(storage);
  assert.equal(second.engine.state.penaltyMode, 'custom', 'the reloaded engine reads the stored mode');
  assert.deepEqual(second.marked(), ['custom'], 'and the setup screen shows that mode chosen, not the markup default');
});

test('zero-trigger: a stored blob that still holds players seeds nobody', () => {
  const blob = {
    players: [
      { id: 1, name: 'Mallory', avatar: 'M', score: 9 },
      { id: 2, name: 'Trent', avatar: 'T', score: 9 },
      { id: 3, name: 'Eve', avatar: 'E', score: 9 },
    ],
    penaltyMode: 'none',
  };
  const { engine } = load(makeStorage({ [KEY]: JSON.stringify(blob) }));
  assert.equal(engine.state.penaltyMode, 'none', 'the blob WAS read -- its setting landed');
  assert.deepEqual(engine.state.players, [], 'and not one of its players was seated');
});

test('zero-trigger: the blob this route writes has no players field', () => {
  const storage = makeStorage();
  const { engine, press } = load(storage);
  // Seated the way startWithPlayers seats them, so a write of the player list would carry them.
  engine.state.players = [
    { id: 1, name: 'Alice', avatar: 'A', score: 0 },
    { id: 2, name: 'Bob', avatar: 'B', score: 0 },
  ];
  press('none');
  const written = JSON.parse(storage.slots.get(KEY));
  assert.equal(Object.hasOwn(written, 'players'), false, `players written back: ${storage.slots.get(KEY)}`);
  assert.deepEqual(written, { penaltyMode: 'none' });
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
test('zero-trigger: players the core could not import yet survive a settings save, and a later mount imports them', async () => {
  const blob = {
    players: [
      { id: 1, name: 'Alice', avatar: 'A', score: 0 },
      { id: 2, name: 'Bob', avatar: 'B', score: 0 },
    ],
    penaltyMode: 'custom',
  };
  const storage = makeStorage({ [KEY]: JSON.stringify(blob) });
  const full = originFull(storage);
  assert.deepEqual(await migrate(full), [], 'the first mount\'s import did not land');
  assert.deepEqual(JSON.parse(storage.slots.get(KEY)), blob, 'so the core left the blob whole');

  const { engine, press } = load(storage);
  assert.deepEqual(engine.state.players, [], 'the route seats nobody from the pending field');
  engine.state.players = [{ id: 1, name: 'Carol', avatar: 'C', score: 0 }];
  press('none');
  const written = JSON.parse(storage.slots.get(KEY));
  assert.equal(written.penaltyMode, 'none', 'the setting the save was for landed');
  assert.deepEqual(written.players, blob.players, `the pending players were not carried through: ${storage.slots.get(KEY)}`);

  assert.deepEqual(await migrate(storage.api), ['Alice', 'Bob'], 'a later mount imports them');
  press('preset');
  assert.equal(Object.hasOwn(JSON.parse(storage.slots.get(KEY)), 'players'), false, 'once imported, a save never puts the field back');
});

test('zero-trigger: corrupt JSON and a storage that throws are both tolerated', () => {
  const corrupt = load(makeStorage({ [KEY]: '{"penaltyMode": "none"' }));
  assert.equal(corrupt.engine.state.penaltyMode, 'preset', 'corrupt JSON leaves the default in place');
  assert.deepEqual(corrupt.marked(), ['preset']);

  const locked = load(makeStorage({}, true));
  assert.equal(locked.engine.state.penaltyMode, 'preset');
  assert.doesNotThrow(() => locked.press('custom'), 'a failed write must not break the button');
  assert.equal(locked.engine.state.penaltyMode, 'custom', 'the choice still holds for this visit');
});
