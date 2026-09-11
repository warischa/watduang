// gh#215, as the owner ruling of 2026-09-11 left it: what happens to this route when the browser
// takes the 3D context away mid-round, and what must NOT happen.
//
// The property this file exists to pin is the round SURVIVING the loss. gh#150 option A made the DOM
// tile grid the play surface on both lanes and parked the engine in its menu state with its input
// severed at mount, so a lost context now costs a BACKDROP. The halt this file used to pin took the
// round down with it: its only way forward called startMatch, which zeroes every score and sends the
// party back to round 1 to recover a 3D board nobody was playing on. The halt is retired; the tests
// that pinned it are replaced by the ones that pin what replaced it.
//
// WHAT THE HALT SEVERED, AND WHY NONE OF IT IS OWED ANY MORE. Losing a context changes nothing about
// the engine: GL calls against a lost context do not throw, main.js registers no `webglcontextlost`
// of its own, and its state machine is in MENU with every leaf listener already cloned off at mount
// by severEngineLeafControls. So the leaf severing and the stepper re-assert were a second copy of
// what mount already did, and the HUD id rehoming defended against writes the engine makes exactly
// the same way before and after a loss — writes that sit behind a round state it can no longer
// enter. The halt defended against a delta that does not exist.
//
// ponytail: the real bytes of the route's loss handler and its `$`, resolved from the registration
// rather than by name, run over a small stub. Stated ceilings: (1) the stub models four DOM
// guarantees and nothing else — cloneNode() does not copy listeners, getElementById answers out of a
// live id index, a textContent write is what a MutationObserver sees, and `style` is an object. So
// this proves what main.ts DOES to those nodes, never that Chrome fires `webglcontextlost` when this
// route loses a context. (2) It says nothing about whether the arm window really disables anything;
// scripts/arm-gate-probe.mjs owns that.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sliceBlock } from '../_dom-stub.mjs';

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

/** A MutationObserver that sees exactly what the real one sees on these stubs: a textContent write
 *  to an observed node. announceTurns registers through this, unmodified. */
class StubObserver {
  constructor(callback) {
    this.callback = callback;
  }

  observe(target) {
    target.observers.push(this.callback);
  }
}

// The route's own lookup helper, run as written rather than re-implemented here: a hand-rolled copy
// would prove nothing about the id every other slice below resolves through. Three substitutions,
// each of which must bite, take the TypeScript off it and nothing else.
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

// ---- the announcement channel those writes feed ------------------------------------------------

// The live region is the only place a HUD write becomes something a player HEARS, and it is fed by
// observation rather than by a call: paintHud (and, on a GPU, the engine) writes #turnPlayerName,
// and announceTurns mirrors that write into #ob-live. It is pinned HERE because this is the file
// that models what a MutationObserver sees on these stubs and derives the engine's write surface
// above; it had no other pin, and until gh#215's halt was retired it was only ever exercised as a
// thing the halt had to silence.
const announceSliced = sliceBlock(source, 'function announceTurns(): void');
assert.ok(announceSliced, 'main.ts no longer declares announceTurns — the announcement tests are measuring nothing');
const announceSource = announceSliced.replaceAll('): void', ')');
assert.notEqual(announceSource, announceSliced, 'announceTurns no longer carries the annotations this strips — it may carry others');
assert.doesNotMatch(announceSource, /:\s*(void|string|HTMLElement)\b/, 'annotation left in the announceTurns slice: it will not parse');

/** Registers the real announceTurns over a stub, and hands back the nodes a HUD write lands on. */
function runAnnounce(code = announceSource) {
  const stub = makeStub(['ob-live', 'turnPlayerName', 'roundLabel', 'turnAvatarEmoji']);
  // `rehomed` is dead on this build and the parameter still has to be here: the `$` above is sliced
  // from main.ts, so against the build that still halted it reads that map. Without the parameter
  // these legs die on a ReferenceError, which reds exactly like an assertion and proves nothing.
  const announce = new Function(
    'document',
    'rehomed',
    'MutationObserver',
    `${dollarSource}\n${code}\nreturn announceTurns;`,
  )(stub.document, new Map(), StubObserver);
  announce();
  return stub;
}

test('a turn written to the HUD is announced, naming that player and no other', () => {
  const stub = runAnnounce();
  const live = stub.byId.get('ob-live');
  // POSITIVE CONTROL: the round label alone must say nothing. Without this leg the assertions below
  // could not tell an announcement from a region that had been written to at registration.
  stub.byId.get('roundLabel').textContent = 'รอบที่ 3';
  assert.equal(live.textContent, '', 'the region announced a round with nobody to announce it to');

  stub.byId.get('turnPlayerName').textContent = 'มังกร';
  assert.equal(
    live.textContent,
    'รอบที่ 3 ถึงตาของ มังกร แล้ว',
    'the live region does not carry the turn. A player using a screen reader is told nothing about ' +
      'whose turn it is, on a route whose whole round is a turn order',
  );

  // The turn moves. A region that keeps announcing the first player is worse than a silent one.
  stub.byId.get('turnPlayerName').textContent = 'เสือ';
  assert.equal(live.textContent, 'รอบที่ 3 ถึงตาของ เสือ แล้ว', 'the announcement did not follow the turn to the next player');
});

test('MUST-RED: the announcement assertions go green on a build that says nothing, and on one that reads the wrong node', () => {
  // Both mutants are one substitution off the real source rather than code this file wrote.
  const mute = announceSource.replace('live.textContent = line;', 'void line;');
  assert.notEqual(mute, announceSource, 'the live-region write no longer reads as written — this mutant substituted nothing');
  const muted = runAnnounce(mute);
  muted.byId.get('turnPlayerName').textContent = 'มังกร';
  assert.equal(muted.byId.get('ob-live').textContent, '', 'the assertion above cannot tell an announcing build from a mute one');

  // The wrong player: the observer is pointed at the avatar glyph instead of the name, which is the
  // shape a careless re-extraction of the HUD ids would take.
  const wrong = announceSource.replace("const who = $('turnPlayerName');", "const who = $('turnAvatarEmoji');");
  assert.notEqual(wrong, announceSource, 'the observed node no longer reads as written — this mutant substituted nothing');
  const misread = runAnnounce(wrong);
  misread.byId.get('turnPlayerName').textContent = 'มังกร';
  assert.equal(
    misread.byId.get('ob-live').textContent,
    '',
    'the assertion above cannot tell a build that announces the player from one that watches ' +
      'another node entirely',
  );
});

// ---- the loss handler, resolved from its own registration --------------------------------------

// BY REGISTRATION, NOT BY NAME, and that is what makes the calibration honest: this file has to be
// runnable against the build that still halted, so it reads whichever function main.ts hands the
// event and measures that one. A name typed in here would have failed the old build as "measuring
// nothing" instead of failing it on the assertions.
const registration = source.match(/\$\('gameCanvas'\)\?\.addEventListener\('webglcontextlost',\s*([A-Za-z_$][\w$]*)/);
assert.ok(
  registration,
  'the route no longer registers a webglcontextlost handler on #gameCanvas — the tests below are measuring nothing',
);
const handlerName = registration[1];
const handlerSliced = sliceBlock(source, `function ${handlerName}(): void`);
assert.ok(handlerSliced, `main.ts registers ${handlerName} for the loss but declares no such function`);

// A non-asserting strip, unlike the one above, because the set of annotations differs between the
// build being measured and the build that halted — followed by a check that nothing TypeScript
// survived, so a slice that would fail as a SyntaxError fails as a readable assertion instead.
const handlerSource = handlerSliced
  .replace(`function ${handlerName}(): void`, `function ${handlerName}()`)
  .replaceAll('$<HTMLButtonElement>(', '$(')
  .replaceAll(' as HTMLButtonElement', '');
assert.doesNotMatch(handlerSource, /: void\b|\bas [A-Z]|<HTML/, 'a TypeScript annotation survived the strip: the slice will not parse');

// Supplied only so a build that still inserts a panel can insert it here. Empty against a build that
// has none, which is the state the assertions below expect.
const panelHtml = source.match(/const HALT_HTML = `([\s\S]*?)`;/)?.[1] ?? '';

/** Runs the route's real loss handler over the stub and reports everything it did: what it called
 *  into, what it put on the page, and what a tap on anything it put there then reached. */
function runLoss(code = handlerSource) {
  const stub = makeStub([...SEEDED, ...engineWrites, 'ob-board', 'playerCountVal']);
  const present = new Set(stub.byId.keys());
  const called = [];
  const handler = new Function(
    'document',
    'rehomed',
    'HALT_HTML',
    'armAllButtons',
    'installNoWebglRound',
    'startMatch',
    'setPlayerCount',
    'currentCount',
    `${dollarSource}\n${code}\nreturn ${handlerName};`,
  )(
    stub.document,
    new Map(),
    panelHtml,
    () => {},
    () => called.push('installNoWebglRound'),
    () => called.push('startMatch'),
    () => called.push('setPlayerCount'),
    () => 5,
  );
  handler();
  // THE PRESS IS PART OF THE LOSS, and without it this measures the wrong moment: the build that
  // halted did not reset the round when the context went away, it reset it on the one path it left
  // the player. A panel whose only button costs the party its scores is a round lost at the loss.
  const inserted = [...stub.byId.keys()].filter((id) => !present.has(id));
  for (const id of inserted) stub.byId.get(id).click();
  return { stub, called, inserted };
}

test('a lost context costs the 3D backdrop and nothing else: the round survives it', () => {
  const { stub, called, inserted } = runLoss();
  // THE ROUND FIRST, and the order is deliberate: this is the assertion the ruling is about, so it
  // is the one that has to speak when a build reaches the round — including through a control the
  // loss put under the player, which runLoss has already pressed by now.
  assert.deepEqual(
    called,
    [],
    'the loss path called into the round. startMatch zeroes every score and sends the party back to ' +
      'round 1, which is the cost the owner retired on 2026-09-11: a dropped backdrop must not ' +
      'discard the game being played in front of it',
  );
  assert.deepEqual(
    inserted,
    [],
    'the loss put something on the page. Whatever it is, it stands between the party and a round ' +
      'that is still playable on the DOM board — and if it is ever wanted again it is a reveal, ' +
      'which ADR-0057 and ADR-0059 make an armed one',
  );
  for (const id of engineWrites) {
    assert.ok(
      stub.document.getElementById(id),
      `#${id} stopped answering document.getElementById after the loss. The HUD it paints is the ` +
        'round the party is still playing; severing its ids leaves them looking at a frozen banner',
    );
  }
  assert.ok(stub.document.getElementById('ob-board'), 'the DOM board — the play surface on both lanes — did not survive the loss');
  assert.ok(
    stub.removed.includes('gameCanvas'),
    'the canvas that stopped drawing is left on the page, still carrying its 3D-stage accessible ' +
      'name. ADR-0051 asks the two lanes to end in the same shape, and the no-3D lane has no canvas',
  );
});

test('MUST-RED: the assertions above go green on a loss that does reset the round', () => {
  // Derived from the real handler by one substitution rather than written here: a green that has
  // never seen this harness report a reset proves nothing about the harness.
  const mutant = handlerSource.replace("$('gameCanvas')?.remove();", 'startMatch();');
  assert.notEqual(mutant, handlerSource, 'the canvas line no longer reads as written — this mutant substituted nothing');
  const { called } = runLoss(mutant);
  assert.deepEqual(
    called,
    ['startMatch'],
    'the harness cannot tell a loss that restarts the match from one that does not: the assertion ' +
      'above would pass on both',
  );
});

test('the loss is not contested, and no path out of it reaches the round', () => {
  assert.doesNotMatch(
    handlerSource,
    /startMatch|startRound|advanceRound|round\./,
    'the loss handler reaches the round state. Same players, same turn order, same scores, same ' +
      'bomb: a lost backdrop changes none of them',
  );
  // preventDefault() is what asks the browser for a `webglcontextrestored`. The code that builds the
  // GL programs ran once inside main.js's sealed IIFE, in a file scripts/extract-mockup.mjs owns, so
  // nothing on this side could act on that event — asking for it would leave the route waiting on a
  // recovery that never arrives. The route listens for no restore either, which is the same answer.
  assert.doesNotMatch(handlerSource, /preventDefault/, 'the handler asks for a context restore it has no way to act on');
  // Matched on the REGISTRATION and not on the bare event name: the comment above the handler
  // explains why no restore is asked for, and a name-shaped grep reads its own explanation as a
  // violation.
  assert.doesNotMatch(
    source,
    /addEventListener\('webglcontextrestored'/,
    'the route listens for a restore nothing on this side can rebuild the GL programs for',
  );
});

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
  ['app', 'the route root — the board and the setup rows hang off it, so replacing it would throw the page away'],
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
      'engine still owns keeps answering taps on a route it no longer draws, or a control this ' +
      'file never re-wires is severed for good. Add it to ENGINE_LEAF_CONTROLS, or to NOT_SEVERED ' +
      'with the reason it stays wired to the engine.',
  );
  assert.deepEqual(
    [...NOT_SEVERED.keys()].filter((id) => !referenced.includes(id)).sort(),
    [],
    'NOT_SEVERED names ids installNoWebglRound no longer touches',
  );
});

// ---- the MOUNT sever, which is now the only one ------------------------------------------------

/** severEngineLeafControls runs on EVERY lane at mount, and the `disabled` decision inside it is the
 *  load-bearing one: clear it on the clone, because a deep clone carries a reflected attribute
 *  across and an arm window open at that moment would otherwise re-enable the detached original.
 *  With the loss halt retired this is the only copy of that decision left, and it is the more
 *  frequently executed one — it had no pin at all until gh#215. */
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
  // POSITIVE CONTROL: without a leg where the same click did something, "the click did nothing" is
  // unreadable.
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
