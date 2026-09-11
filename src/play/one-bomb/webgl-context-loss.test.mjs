// gh#215. What happens to this route when the browser takes the 3D context away mid-round.
//
// The failure this pins is not "the panel is missing" — it is that the engine SURVIVES the loss.
// main.js drives its state machine from a requestAnimationFrame loop on accumulated time (a resolving
// state settles at ~0.42s, a detonating one finishes at ~1.3s) and GL calls against a lost context do
// not throw. So without severing, the engine keeps opening tiles and pushes its result card up
// underneath the halt panel, with "รอบต่อไป" live under the player's finger.
//
// The severing therefore has to happen at LOSS time, and it has to be surgical: clone-replacing a
// node drops its listeners, which is the point, but watchEngineReveals holds a MutationObserver on
// #hud, #menuOverlay, #resultCard and the two modals and finishRound depends on it. A container
// swapped for a clone kills that observer silently — nothing throws, the result card just stops being
// armed. Both halves are asserted below and each reds on its own.
//
// ponytail: the real bytes of haltOnContextLoss, announceTurns, the route's `$` and the engine's own
// updateUI, run over a small stub, rather than a browser walk. Stated ceilings: (1) the stub models
// four DOM guarantees and nothing else — cloneNode() does not copy listeners, getElementById answers
// out of a live id index, a textContent write is what a MutationObserver sees, and `style` is an
// object. So this proves what main.ts DOES to those nodes, never that Chrome fires
// `webglcontextlost` when this route loses a context, nor that a null dereference really ends the
// engine's rAF loop, nor that any reader voices the live region; only a browser shows those.
// (2) renderPlayerStrip is a spy in the behavioural leg — the strip is covered by the id set, which
// is derived from that function's real source, not by a run of it. (3) It says nothing about whether
// the arm window really disables anything; scripts/arm-gate-probe.mjs owns that.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sliceBlock } from '../_dom-stub.mjs';
// The real bounds, from the module the route itself imports them from: a retyped 2 and 10 here would
// go on agreeing with a route that had moved.
import { MAX_PLAYERS, MIN_PLAYERS } from '../../games/one-bomb.ts';

const source = fs.readFileSync(path.join(import.meta.dirname, 'main.ts'), 'utf8');

/** Takes the TypeScript off a slice, one token at a time, asserting that each one bit. A substitution
 *  that silently stripped nothing is how a slice reaches `new Function` still carrying a type and
 *  fails as a SyntaxError somewhere unrelated. */
const strip = (text, tokens, label) =>
  tokens.reduce((out, [from, to]) => {
    const next = out.replace(from, to);
    assert.notEqual(next, out, `${label} no longer contains ${from} — this substitution stripped nothing`);
    return next;
  }, text);

const HEADER = 'function haltOnContextLoss(): void';
const sliced = sliceBlock(source, HEADER);
assert.ok(sliced, `main.ts no longer declares ${HEADER} — this test is measuring nothing`);
// The TypeScript tokens in the slice. The body itself is untouched.
const haltSource = strip(
  sliced,
  [
    [HEADER, 'function haltOnContextLoss()'],
    ['$<HTMLButtonElement>(id)', '$(id)'],
    ['control.cloneNode(true) as HTMLButtonElement', 'control.cloneNode(true)'],
  ],
  HEADER,
);

const HALT_HTML = source.match(/const HALT_HTML = `([\s\S]*?)`;/)?.[1];
assert.ok(HALT_HTML, 'HALT_HTML no longer parses out of main.ts');

const announceSliced = sliceBlock(source, 'function announceTurns(): void');
assert.ok(announceSliced, 'main.ts no longer declares announceTurns — the announcement tests are measuring nothing');
// The only TypeScript in that slice is a pair of `: void` returns. The body itself is untouched.
const announceSource = announceSliced.replaceAll('): void', ')');
assert.notEqual(announceSource, announceSliced, 'announceTurns no longer carries the annotations this strips — it may carry others');
assert.doesNotMatch(announceSource, /:\s*(void|string|HTMLElement)\b/, 'annotation left in the announceTurns slice: it will not parse');

const installSource = sliceBlock(source, 'function installNoWebglRound(): void');
assert.ok(installSource, 'main.ts no longer declares installNoWebglRound — the drift pin below is measuring nothing');

// ---- the stub ------------------------------------------------------------------------------------

/** cloneNode() returns a node with the SAME id, NO listeners, and the SAME `disabled` state. The
 *  first two are the guarantees the severing rests on; the third is a guarantee it has to survive,
 *  because `disabled` is a reflected attribute and a deep clone carries attributes across. Modelled
 *  here rather than assumed away: without it a control cloned mid arm window comes back enabled in
 *  this stub and inert in a browser, which is the difference between the two tests below passing and
 *  meaning anything.
 *
 *  Three more DOM guarantees, added for the HUD half: getElementById answers out of a live id index
 *  (so removeAttribute('id') takes a node out of it while every held reference keeps working), a
 *  textContent write is what a MutationObserver on that node sees, and `style` is a real object on
 *  every element. Nothing else about the DOM is modelled. */
function makeStub(ids) {
  const byId = new Map();
  const removed = [];
  const make = (id) => {
    const node = {
      id,
      disabled: false,
      fired: 0,
      listeners: [],
      observers: [],
      text: '',
      style: { setProperty() {}, width: '' },
      get textContent() {
        return node.text;
      },
      set textContent(value) {
        node.text = String(value);
        for (const fn of node.observers) fn();
      },
      set innerHTML(value) {
        node.text = String(value);
      },
      removeAttribute(name) {
        if (name !== 'id') return;
        if (byId.get(node.id) === node) byId.delete(node.id);
        node.id = '';
      },
      addEventListener(type, fn) {
        node.listeners.push([type, fn]);
      },
      remove() {
        removed.push(node.id);
        if (byId.get(node.id) === node) byId.delete(node.id);
      },
      replaceWith(next) {
        byId.set(node.id, next);
      },
      cloneNode() {
        const clone = make(node.id);
        clone.disabled = node.disabled;
        return clone;
      },
      click() {
        for (const [type, fn] of node.listeners) if (type === 'click') fn({ target: node });
      },
      insertAdjacentHTML(_where, html) {
        for (const [, id] of html.matchAll(/id="([\w-]+)"/g)) byId.set(id, make(id));
      },
    };
    return node;
  };
  for (const id of ids) byId.set(id, make(id));
  const document = { getElementById: (id) => byId.get(id) ?? null };
  return { document, byId, removed };
}

/** A MutationObserver that sees exactly what the real one sees on these stubs: a textContent write to
 *  an observed node. announceTurns registers through this, unmodified. */
class StubObserver {
  constructor(callback) {
    this.callback = callback;
  }

  observe(target) {
    target.observers.push(this.callback);
  }
}

// The route's own lookup helper, run as written rather than re-implemented here: whether it consults
// the rehome map before the document IS the fix, so a hand-rolled copy would prove nothing. Three
// substitutions, each of which must bite, take the TypeScript off it and nothing else.
const dollarTs = source.match(/const \$ = [\s\S]*?;$/m)?.[0];
assert.ok(dollarTs, 'main.ts no longer declares the `$` lookup helper — every test below is measuring nothing');
const dollarSource = ['<T extends HTMLElement>', '(id: string): T | null =>', ' as T | null'].reduce(
  (text, token, at) => {
    const next = text.replace(token, ['', '(id) =>', ''][at]);
    assert.notEqual(next, text, `the \`$\` helper no longer contains ${token} — this substitution stripped nothing`);
    return next;
  },
  dollarTs,
);

// The stepper, as its real bytes. setPlayerCount is the ONLY owner of a `disabled` write on this
// route outside the shared arm gate, so it is also the only state the halt can wrongly drop when it
// hands the severed clones back enabled — a stub of it would prove nothing about the bound. Sliced
// with currentCount (which is where the count is read back from) and BOARD_GRID (which setPlayerCount
// reads), each type strip asserted to bite the same way the `$` helper's are above.
const STEPPER_BLOCKS = [
  ['function currentCount(): number', [['(): number', '()']]],
  [
    'function setPlayerCount(next: number): void',
    [
      ['(next: number): void', '(next)'],
      ["$<HTMLButtonElement>('playerMinus')", "$('playerMinus')"],
      ["$<HTMLButtonElement>('playerPlus')", "$('playerPlus')"],
    ],
  ],
  ['const BOARD_GRID: Record<number, readonly [number, number]> =', [[': Record<number, readonly [number, number]>', '']]],
];
const stepperSource = STEPPER_BLOCKS.map(([header, tokens]) => {
  const block = sliceBlock(source, header);
  assert.ok(block, `main.ts no longer declares ${header} — the stepper leg below is measuring nothing`);
  return strip(block, tokens, header);
}).join('\n');

// Every id the ZOMBIE can still reach after the loss, derived from main.js rather than retyped: its
// state machine runs on accumulated time off a requestAnimationFrame loop, so a loss during a
// resolving state still lands on resolveSelectedTile -> updateUI at ~0.42s, and a loss during a
// detonation still lands on finishDetonation (which calls updateUI BEFORE it fills the result card)
// at ~1.3s after that. Those three functions are the whole reachable write surface; every other
// writer in main.js is behind a control ENGINE_LEAF_CONTROLS severs.
const engineSource = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');
const ENGINE_WRITERS = ['function updateUI()', 'function renderPlayerStrip()', 'function finishDetonation()'];
const engineWrites = new Set();
for (const header of ENGINE_WRITERS) {
  const block = sliceBlock(engineSource, header);
  assert.ok(block, `main.js no longer declares ${header} — the reachable write set is derived from nothing`);
  for (const hit of block.matchAll(/getElementById\('([\w-]+)'\)/g)) engineWrites.add(hit[1]);
}
assert.ok(engineWrites.size > 0, 'no getElementById target parsed out of the engine writers — the tests below would pass vacuously');

const ENGINE_CONTAINERS = ['hud', 'menuOverlay', 'resultCard', 'howModal', 'settingsModal', 'ob-board-wrap'];
const SEEDED = ['app', 'gameCanvas', 'ob-live', ...ENGINE_CONTAINERS];

/** The engine's OWN updateUI, run as written over a minimal game state — the zombie's first DOM
 *  touch after the loss, and the one finishDetonation makes before it fills the result card.
 *
 *  Ceiling: renderPlayerStrip is a spy here rather than a second slice, so this leg says nothing
 *  about the strip; the strip's id is covered by the reachability test, which derives its set from
 *  that function's real source. */
function makeEngineUpdateUI(document, player) {
  const updateUiSource = sliceBlock(engineSource, 'function updateUI()');
  assert.ok(updateUiSource, 'main.js no longer declares updateUI — the write this file blocks does not exist');
  return new Function(
    'document',
    'game',
    'MASCOT_CONFIG',
    'GameState',
    'sounds',
    'renderPlayerStrip',
    `${updateUiSource}; return updateUI;`,
  )(
    document,
    { currentPlayer: player, round: 2, totalRounds: 5, rows: 5, cols: 5, revealed: new Set(), state: 'ROUND_OVER' },
    [{ color: '#3d5b7d', name: 'มังกร', emoji: '🐉' }],
    { TURN_WAIT: 'TURN_WAIT' },
    { playHeartbeat() {} },
    () => {},
  );
}

/** Runs the real haltOnContextLoss over the stub, with every id it severs pre-wired to a click
 *  counter, and reports what the run did. */
function runHalt(severed, code = haltSource) {
  const stub = makeStub([...SEEDED, ...severed, ...engineWrites]);
  const hudBefore = new Map([...engineWrites].map((id) => [id, stub.byId.get(id)]));
  for (const id of severed) {
    const node = stub.byId.get(id);
    node.addEventListener('click', () => {
      node.fired += 1;
    });
  }
  // POSITIVE CONTROL, and it is not optional: "the click did nothing" is unreadable without a leg
  // where the same click did something. Every control fires exactly once here, BEFORE the loss.
  for (const id of severed) stub.byId.get(id).click();
  const before = severed.map((id) => stub.byId.get(id).fired);
  assert.deepEqual(
    before,
    severed.map(() => 1),
    'the pre-loss control leg did not fire: this stub cannot dispatch a click, so the post-loss ' +
      'assertion below would pass on a harness that severs nothing',
  );

  const containersBefore = new Map(ENGINE_CONTAINERS.map((id) => [id, stub.byId.get(id)]));
  const { runtime, armed, called } = makeRuntime(stub, code);
  // announceTurns runs at mount, i.e. BEFORE the loss: it holds the nodes it found then, which is
  // exactly why silencing it has to happen at the engine's end of the write and not at the observer.
  runtime.announceTurns();
  runtime.haltOnContextLoss();
  return { stub, containersBefore, armed, called, hudBefore, $: runtime.$ };
}

/** main.ts's `$`, announceTurns and haltOnContextLoss, as written, sharing one document and one
 *  rehome map — the three have to be built together because the map is what joins them. */
function makeRuntime(stub, code = haltSource) {
  const armed = [];
  const called = [];
  const rehomed = new Map();
  const runtime = new Function(
    'document',
    'rehomed',
    'MutationObserver',
    'HALT_HTML',
    'armAllButtons',
    'installNoWebglRound',
    'startMatch',
    'MIN_PLAYERS',
    'MAX_PLAYERS',
    `${dollarSource}\n${stepperSource}\n${announceSource}\n${code}\nreturn { $, announceTurns, haltOnContextLoss };`,
  )(
    stub.document,
    rehomed,
    StubObserver,
    HALT_HTML,
    (el) => armed.push(el.id),
    () => called.push('installNoWebglRound'),
    () => called.push('startMatch'),
    MIN_PLAYERS,
    MAX_PLAYERS,
  );
  return { runtime, armed, called, rehomed };
}

// ---- the sever list, derived rather than retyped ---------------------------------------------------

// Every id installNoWebglRound reaches for. Single-quoted words only: the event names and the two
// class selectors in that function are excluded by shape, the emoji strings by the leading [a-zA-Z].
// `on` and `open` are CLASS names written by that function, not ids; the rest are event names and an
// insertAdjacentHTML position.
const NOT_AN_ID = new Set(['click', 'pointerdown', 'afterbegin', 'on', 'open']);
const referenced = [
  ...new Set([...installSource.matchAll(/'([a-zA-Z][\w-]*)'/g)].map((m) => m[1])),
].filter((id) => !NOT_AN_ID.has(id));

// Ids installNoWebglRound touches that are deliberately NOT severed, each with the reason it is safe
// to leave wired through a loss. A new entry here is a decision; a new entry NOWHERE fails the
// equality below on the day a re-extraction adds a control.
const NOT_SEVERED = new Map([
  ['app', 'the route root — the halt panel is appended to it, so replacing it would throw the panel away'],
  ['webglUnsupportedNotice', 'not a control — the engine\'s bail notice, which this path removes'],
  // Owner ruling 2026-09-10 retired the second half of this reason, which used to read "on the loss
  // path it does not exist yet": installNoWebglRound now runs at mount on BOTH lanes, so the board
  // is on the page long before any loss.
  ['ob-board', "a CONTAINER carrying only this file's delegated tap listener, which no loss can hand to the engine; installNoWebglRound's once-guard reuses it on restart rather than rebuilding it"],
  ['howModal', 'a modal container, only ever a target of a class write'],
  ['settingsModal', 'a modal container, only ever a target of a class write'],
  ['howToPlayBtn', "opens a modal with add('open') — genuinely idempotent when wired twice"],
  ['settingsBtn', "opens a modal with add('open') — genuinely idempotent when wired twice"],
  ['menuSettingsBtn', "opens a modal with add('open') — genuinely idempotent when wired twice"],
]);

const severList = source
  .match(/const ENGINE_LEAF_CONTROLS = \[([\s\S]*?)\];/)?.[1]
  ?.match(/'([\w-]+)'/g)
  ?.map((q) => q.slice(1, -1));
assert.ok(severList?.length, 'ENGINE_LEAF_CONTROLS no longer parses out of main.ts');

test('the severed set is exactly installNoWebglRound\'s controls, minus a documented exemption', () => {
  assert.ok(referenced.length > 0, 'the id pattern matched nothing in installNoWebglRound — this test would pass vacuously');
  assert.deepEqual(
    [...severList].sort(),
    referenced.filter((id) => !NOT_SEVERED.has(id)).sort(),
    'the sever list and the controls installNoWebglRound wires have drifted apart: a control the ' +
      'engine still owns keeps answering taps after the context is lost, or a control the restart ' +
      'never re-wires is severed for good. Add it to ENGINE_LEAF_CONTROLS, or to NOT_SEVERED with ' +
      'the reason it survives a loss.',
  );
  assert.deepEqual(
    [...NOT_SEVERED.keys()].filter((id) => !referenced.includes(id)).sort(),
    [],
    'NOT_SEVERED names ids installNoWebglRound no longer touches',
  );
});

test('after the loss every severed control is dead, and the canvas is gone', () => {
  const { stub, $ } = runHalt(severList);
  for (const id of severList) {
    // Through the route's OWN lookup, because that is what the restart uses: #nextRoundBtn is also a
    // node the halt rehomes, so the document no longer answers for it while `$` still does.
    const now = $(id);
    assert.ok(now, `${id} was removed rather than replaced — the restart re-wires it by id and would find nothing`);
    now.click();
    assert.equal(
      now.fired,
      0,
      `${id} still answers a click after the context was lost: the engine's listener survived, so a ` +
        'tap on it reaches a round that can no longer be drawn',
    );
  }
  assert.ok(
    stub.removed.includes('gameCanvas'),
    'the canvas survives the loss: every pointer listener the engine opens a tile with sits on it, ' +
      'so the tile input path is still live under the halt panel',
  );
});

/** A loss that lands while controls are DISABLED, which is the state an open arm window puts them in.
 *  Three windows can be open when it happens — the HUD reveal at match start, a modal close, and the
 *  setup arm at page load — so a control disabled at loss time is an ordinary case, not a corner. */
function haltWithDisabled(disabledIds, shownCount, code = haltSource) {
  const stub = makeStub([...SEEDED, ...severList, ...engineWrites, 'playerCountVal', 'boardDimensionDesc']);
  stub.byId.get('playerCountVal').textContent = String(shownCount);
  for (const id of disabledIds) stub.byId.get(id).disabled = true;
  // POSITIVE CONTROL: a control that was already enabled going in was never at risk, so both
  // assertions below would read a node the severing could not have harmed.
  for (const id of disabledIds) {
    assert.equal(stub.byId.get(id).disabled, true, `${id} was not disabled before the loss — this leg proves nothing`);
  }
  const { runtime } = makeRuntime(stub, code);
  runtime.haltOnContextLoss();
  return { stub, $: runtime.$ };
}

test('a control severed inside an arm window comes back live, not stranded', () => {
  // The stepper is excluded because its disabled state is OWNED (the next test), not gate residue.
  const gated = severList.filter((id) => id !== 'playerMinus' && id !== 'playerPlus');
  assert.ok(gated.length > 0, 'no gated control left to check — this test would pass vacuously');
  const { $ } = haltWithDisabled(gated, 5);
  for (const id of gated) {
    assert.equal(
      $(id).disabled,
      false,
      `#${id} was cloned while an arm window had it disabled and stayed that way: the gate's own ` +
        're-enable lands on the detached original, and _arm-gate reads an already-disabled control it ' +
        'does not own as caller intent — so the clone is handed back disabled on every later arm and ' +
        'nothing in the session recovers it. The halt panel would open over a dead home button.',
    );
  }
});

test('the stepper parked at its bound is still parked after the halt', () => {
  // #playerMinus is disabled here because the roster cannot go below MIN_PLAYERS — the route's own
  // state, which has to survive. #playerPlus is disabled only as arm-gate residue at the same moment,
  // and must not. Blanket-enabling every clone gets the second one right and the first one wrong.
  const { $ } = haltWithDisabled(['playerMinus', 'playerPlus'], MIN_PLAYERS);
  assert.equal(
    $('playerMinus').disabled,
    true,
    'the halt handed back a live #playerMinus at MIN_PLAYERS: the whole halt window now offers a ' +
      'stepper that can be pushed below the smallest roster the board has a grid for, and the bound ' +
      'is not re-applied until the restart.',
  );
  assert.equal(
    $('playerPlus').disabled,
    false,
    `#playerPlus is nowhere near MAX_PLAYERS (${MAX_PLAYERS}) and was disabled only by an open arm ` +
      'window, so the halt stranded it exactly as it strands any other gated control',
  );
});

test('MUST-RED: the bound assertion above goes green on a build that only enables the clones', () => {
  // On the UNFIXED source #playerMinus arrived disabled because cloneNode copied the attribute, so
  // that assertion passed for the wrong reason and had never fired. The mutant below is the fix that
  // was proposed instead of this one — enable every clone, drop the re-assert — and it is derived from
  // the real source by one substitution rather than written here.
  const noReassert = haltSource.replace('setPlayerCount(currentCount());', 'void 0;');
  assert.notEqual(noReassert, haltSource, 'the re-assert line no longer reads as written — this mutant substituted nothing');
  const { $ } = haltWithDisabled(['playerMinus', 'playerPlus'], MIN_PLAYERS, noReassert);
  assert.equal(
    $('playerMinus').disabled,
    false,
    'the bound assertion cannot tell a build that re-asserts the stepper from one that just enables ' +
      'every clone — it would pass on both, which is what it did before the re-assert existed',
  );
});

test('the containers survive: watchEngineReveals keeps observing the nodes it attached to', () => {
  const { $, containersBefore } = runHalt(severList);
  for (const id of ENGINE_CONTAINERS) {
    assert.equal(
      $(id),
      containersBefore.get(id),
      `#${id} was replaced by a clone: watchEngineReveals' MutationObserver is attached to the ` +
        'ORIGINAL node, so it goes on watching a node no longer in the document and finishRound ' +
        'stops arming the result card. Nothing throws — it just silently stops gating.',
    );
  }
});

test('the panel goes in last, is armed, and its one button restarts the match', () => {
  const { stub, armed, called } = runHalt(severList);
  assert.deepEqual(armed, ['ob-halt'], 'the halt panel was not armed at insertion, or something else was');
  assert.ok(stub.byId.get('ob-halt-restart'), 'the panel carries no restart button');
  assert.deepEqual(called, [], 'the restart ran without anybody pressing the button — ADR-0008 forbids a silent discard');

  stub.byId.get('ob-halt-restart').click();
  assert.deepEqual(
    called,
    ['installNoWebglRound', 'startMatch'],
    'the restart must rebuild the no-3D board BEFORE starting the match: startMatch un-hides ' +
      '#ob-board-wrap, which does not exist until installNoWebglRound has run',
  );
  assert.ok(stub.removed.includes('ob-halt'), 'the panel stays up over the round it just started');
});

test('MUST-RED: the two assertions above go green on a build that severs nothing', () => {
  // A green neither of these ever saw go red proves nothing about the harness. Both mutants are
  // derived from the REAL source by one substitution each, so neither is a stand-in this file wrote.

  // MUTANT ONE — the clone-replace becomes a no-op. Every engine listener survives the loss, which is
  // exactly the zombie this whole file exists to stop.
  const noSever = haltSource.replace('control.replaceWith(clone)', 'void clone');
  assert.notEqual(noSever, haltSource, 'the clone-replace line no longer reads as written — this mutant substituted nothing');
  const dead = runHalt(severList, noSever);
  const survivors = severList.filter((id) => {
    const node = dead.$(id);
    node.click();
    return node.fired > 1;
  });
  assert.deepEqual(survivors.sort(), [...severList].sort(), 'the sever assertion cannot tell a severing build from a non-severing one');

  // MUTANT TWO — a container is put in the sever list. Nothing throws and no click misbehaves; the
  // only observable is the node identity watchEngineReveals' observer is holding.
  const clobbered = haltSource.replace("'homeBtn',", "'homeBtn', 'resultCard',");
  assert.notEqual(clobbered, haltSource, 'the sever list no longer reads as written — this mutant substituted nothing');
  const swapped = runHalt([...severList, 'resultCard'], clobbered);
  assert.notEqual(
    swapped.$('resultCard'),
    swapped.containersBefore.get('resultCard'),
    'the container assertion cannot see a container being clone-replaced',
  );
});

test('the loss is not contested: no preventDefault, and one <button> with no <a href>', () => {
  // preventDefault() is what asks the browser for a `webglcontextrestored`. The code that builds the
  // GL programs ran once inside main.js's sealed IIFE, in a file scripts/extract-mockup.mjs owns, so
  // nothing on this side could act on that event — asking for it would leave the route waiting on a
  // recovery that never arrives.
  assert.doesNotMatch(
    haltSource,
    /preventDefault/,
    'the halt handler asks for a context restore it has no way to act on',
  );
  assert.doesNotMatch(HALT_HTML, /<a\b/, 'an anchor inside the play surface — a double-tap on the halt panel would leave the round');
  assert.equal((HALT_HTML.match(/<button\b/g) ?? []).length, 1, 'the halt panel is one labelled button, per ADR-0008');
});

// ---- the HUD, which the severing above cannot reach --------------------------------------------

test('after the loss no id the zombie writes still answers document.getElementById', () => {
  const { stub, $, hudBefore } = runHalt(severList);
  for (const id of engineWrites) {
    assert.equal(
      stub.document.getElementById(id),
      null,
      `#${id} still answers document.getElementById after the loss. That call is how the engine gets ` +
        'every node it writes — updateUI, renderPlayerStrip and finishDetonation resolve their ' +
        'targets at write time, not from a captured reference — so the dying round can still repaint ' +
        'the live HUD over the round that replaced it.',
    );
    assert.ok(
      $(id),
      `the repo side lost #${id}: it is unreachable through the route's own lookup, so the fresh ` +
        'round after the restart paints nothing there',
    );
    if (!severList.includes(id)) {
      assert.equal(
        $(id),
        hudBefore.get(id),
        `#${id} is a DIFFERENT node than the one that was there before the loss: announceTurns and ` +
          'watchEngineReveals hold the original, so they would be observing a node nobody writes to',
      );
    }
  }
});

test('the zombie cannot speak over the halt it caused', () => {
  const stub = makeStub([...SEEDED, ...severList, ...engineWrites]);
  const { runtime, called } = makeRuntime(stub);
  runtime.announceTurns();
  const live = stub.byId.get('ob-live');
  const who = stub.byId.get('turnPlayerName');

  // POSITIVE CONTROL: the same engine function, before the loss, really does reach the live region.
  // Without this leg a silent post-loss run is indistinguishable from a harness that announces
  // nothing at all.
  makeEngineUpdateUI(stub.document, 1)();
  const saidBeforeLoss = live.textContent;
  assert.notEqual(saidBeforeLoss, '', 'the engine write never reached the live region: this harness cannot announce, so the silence below would be free');

  runtime.haltOnContextLoss();
  const bannerAtLoss = who.textContent;
  // The zombie's next tick. A null dereference ends its rAF loop (the reschedule sits after
  // update()); a defensive re-extraction would write to no node at all. The invariant holds either
  // way, so the throw is caught rather than depended on.
  try {
    makeEngineUpdateUI(stub.document, 5)();
  } catch {
    /* see above */
  }
  // The live region FIRST: the banner write and the announcement fail together on an unprotected
  // build, and whichever assertion runs first is the only one anybody reads. The assistive path is
  // the one with no visual tell, so it is the one that gets to report.
  assert.equal(
    live.textContent,
    saidBeforeLoss,
    'the dying engine was announced: a screen-reader user is told it is a stale player\'s turn, on a ' +
      'round the halt panel says is over',
  );
  assert.equal(who.textContent, bannerAtLoss, 'the dying engine repainted the banner over the halted round');

});

// ACROSS THE RESTART, which is where the residual actually bites: the panel is gone by then, so
// nothing is covering the HUD and nothing is muting the live region. Its own test, not a tail on the
// one above: a failure there would abort before these assertions ever ran, and a leg that cannot
// report is a leg nobody calibrated.
test('after the restart the zombie still cannot reach the round that replaced it', () => {
  const stub = makeStub([...SEEDED, ...severList, ...engineWrites]);
  const { runtime, called } = makeRuntime(stub);
  runtime.announceTurns();
  const live = stub.byId.get('ob-live');
  const who = stub.byId.get('turnPlayerName');
  runtime.haltOnContextLoss();
  stub.byId.get('ob-halt-restart').click();
  assert.deepEqual(called, ['installNoWebglRound', 'startMatch'], 'the restart did not run');
  runtime.$('turnPlayerName').textContent = 'ผู้เล่น 3 (ยักษ์)';
  assert.match(
    live.textContent,
    /ผู้เล่น 3/,
    'the fresh round is not announced: the protection outlived the observer it was supposed to keep',
  );
  const saidAfterRestart = live.textContent;
  try {
    makeEngineUpdateUI(stub.document, 7)();
  } catch {
    /* the same two outcomes */
  }
  assert.equal(live.textContent, saidAfterRestart, 'the zombie reaches the live region of the round that replaced it');
  assert.match(who.textContent, /ผู้เล่น 3/, 'the zombie repainted the banner of the round that replaced it');
});

test('the rehomed set is exactly what the engine can still write, derived from main.js', () => {
  const declared = source
    .match(/const ENGINE_HUD_WRITES = \[([\s\S]*?)\];/)?.[1]
    ?.match(/'([\w-]+)'/g)
    ?.map((quoted) => quoted.slice(1, -1));
  assert.ok(declared?.length, 'ENGINE_HUD_WRITES no longer parses out of main.ts');
  assert.deepEqual(
    [...declared].sort(),
    [...engineWrites].sort(),
    'the rehomed set and the ids the engine can still write have drifted apart: a re-extraction that ' +
      'adds a getElementById to updateUI, renderPlayerStrip or finishDetonation gives the zombie a ' +
      'node the halt never took away from it.',
  );

  // The rehoming only holds while this file asks through `$`. One raw document lookup for a rehomed
  // id reads the DOCUMENT, which after a loss no longer answers for it — a silently dead write.
  // POSITIVE CONTROL on the same pattern, against a lookup main.ts really does make: without it a
  // pattern that matches nothing would report no bypass forever.
  assert.ok(
    source.includes("document.getElementById('app')"),
    'the bypass pattern matches nothing in main.ts — it could not see a bypass either',
  );
  assert.deepEqual(
    [...engineWrites].filter((id) => source.includes(`document.getElementById('${id}')`)),
    [],
    'main.ts reaches a rehomed id through the document instead of `$`: after a loss that lookup finds ' +
      'nothing and the write goes nowhere',
  );
});

test('MUST-RED: the two assertions above go green on a build that rehomes nothing', () => {
  const noRehome = haltSource.replace("node.removeAttribute('id')", 'void node');
  assert.notEqual(noRehome, haltSource, 'the id strip no longer reads as written — this mutant substituted nothing');

  const { stub } = runHalt(severList, noRehome);
  const reachable = [...engineWrites].filter((id) => stub.document.getElementById(id) !== null);
  assert.deepEqual(
    reachable.sort(),
    [...engineWrites].sort(),
    'the reachability assertion cannot tell a build that strips the ids from one that leaves them',
  );

  const loud = makeStub([...SEEDED, ...severList, ...engineWrites]);
  const { runtime } = makeRuntime(loud, noRehome);
  runtime.announceTurns();
  const live = loud.byId.get('ob-live');
  makeEngineUpdateUI(loud.document, 1)();
  const saidBeforeLoss = live.textContent;
  runtime.haltOnContextLoss();
  makeEngineUpdateUI(loud.document, 5)();
  assert.notEqual(live.textContent, saidBeforeLoss, 'the announcement assertion cannot hear the zombie speaking');
});

// ---- the MOUNT sever, which the halt above only mirrors ----------------------------------------

/** severEngineLeafControls runs on EVERY lane at mount, not only after a loss, and it makes the same
 *  `disabled` decision the halt's loop makes — clear it on the clone, because a deep clone carries a
 *  reflected attribute across and an arm window open at that moment would otherwise re-enable the
 *  detached original. The halt's copy of that decision is pinned above; the mount's copy had no pin
 *  at all, which left the more frequently executed of the two untested. */
const severFnSliced = sliceBlock(source, 'function severEngineLeafControls(): void');
assert.ok(severFnSliced, 'main.ts no longer declares severEngineLeafControls — the mount pin below is measuring nothing');
const severFnSource = strip(
  severFnSliced,
  [
    ['function severEngineLeafControls(): void', 'function severEngineLeafControls()'],
    ['$<HTMLButtonElement>(id)', '$(id)'],
    ['control.cloneNode(true) as HTMLButtonElement', 'control.cloneNode(true)'],
  ],
  'severEngineLeafControls',
);

/** Runs the real severEngineLeafControls over the stub with the named controls already inert, the
 *  way an open arm window leaves them. applyReducedMotion is a no-op here: its own chain is pinned in
 *  src/play/one-bomb/reduced-motion.test.mjs, and running it would only prove this stub has no
 *  classList. */
function runMountSever(disabledIds, code = severFnSource) {
  const stub = makeStub([...SEEDED, ...severList]);
  for (const id of severList) {
    const node = stub.byId.get(id);
    node.addEventListener('click', () => {
      node.fired += 1;
    });
  }
  // POSITIVE CONTROL, same reason as the halt's: without a leg where the click did something, "the
  // click did nothing" is unreadable.
  for (const id of severList) stub.byId.get(id).click();
  assert.deepEqual(
    severList.map((id) => stub.byId.get(id).fired),
    severList.map(() => 1),
    'the pre-sever control leg did not fire: this stub cannot dispatch a click, so the assertions ' +
      'below would pass on a harness that severs nothing',
  );
  for (const id of disabledIds) stub.byId.get(id).disabled = true;
  const rehomed = new Map();
  const runtime = new Function(
    'document',
    'rehomed',
    'ENGINE_LEAF_CONTROLS',
    'applyReducedMotion',
    `${dollarSource}\n${code}\nreturn { $, severEngineLeafControls };`,
  )(stub.document, rehomed, severList, () => {});
  runtime.severEngineLeafControls();
  return { stub, $: runtime.$ };
}

test('the mount sever hands every control back live, whatever the arm gate left behind', () => {
  const { $ } = runMountSever(severList);
  for (const id of severList) {
    assert.equal(
      $(id).disabled,
      false,
      `#${id} was cloned at mount while an arm window had it disabled and stayed inert: the gate's ` +
        're-enable lands on the detached original, _arm-gate reads the clone as caller-disabled from ' +
        'then on, and the route boots with a control no later arm gives back. The stepper bound is ' +
        're-applied right after this by installNoWebglRound.',
    );
  }
  const survivors = severList.filter((id) => {
    const node = $(id);
    node.click();
    return node.fired > 1;
  });
  assert.deepEqual(survivors, [], 'an engine listener survived the mount sever: the engine still answers taps on that control');
});

test('MUST-RED: the mount assertion above goes green on a build that keeps the cloned disabled state', () => {
  // The mutant is the code as it would read if the clearing decision were dropped, derived from the
  // real source by one substitution rather than written here.
  const keepsDisabled = severFnSource.replace('clone.disabled = false;', 'void clone;');
  assert.notEqual(keepsDisabled, severFnSource, 'the clearing line no longer reads as written — this mutant substituted nothing');
  const { $ } = runMountSever(severList, keepsDisabled);
  assert.deepEqual(
    severList.filter((id) => $(id).disabled === false),
    [],
    'the mount assertion cannot tell a build that clears the cloned `disabled` from one that carries ' +
      'it across — it would pass on both',
  );
});
