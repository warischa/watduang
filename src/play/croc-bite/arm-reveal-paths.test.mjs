// The hole scripts/arm-gate-coverage-check.mjs cannot see, pinned here for croc-bite.
//
// That gate asks ONE question of a play route: does it import armAllButtons and call it at least
// once? This route does — and the gate would stay green with every call but one deleted, because it
// counts calls per DIRECTORY, not per reveal. The real rule (ADR-0014, ADR-0057) is per reveal: the
// second contact of a double-tap must not land on a control the first contact just put under the
// finger.
//
// THIS ROUTE'S SHAPE. The screens belong to a lifted engine (main.js) whose UIManager reveals them by
// flipping a class on a cached element inside a closure with no hook, and the reveal that matters most
// — the result card, which puts "รอบถัดไป ➔" under the finger that just pressed the losing tooth —
// lands two and a half seconds of choreography after that press. No arming call can be written next
// to those reveals without editing a file scripts/extract-mockup.mjs owns. So main.ts OBSERVES them,
// and the pin below is a SET EQUALITY between the screens the engine reveals and the screens main.ts
// watches. An eighth screen added by a re-extraction therefore fails this test on the day it lands,
// which is the property a hand-typed list of receivers could not give this route.
//
// THE REVEAL SPELLING IS NOT THE SIBLING ROUTES'. This engine reveals nothing through
// `getElementById(...).classList` — the three screens are `classList.toggle('hidden', …)` on elements
// cached in initDOM, and the modals go through one `openModal()`. So the derivation below reads
// initDOM's id map first and then resolves each receiver through it; a pattern copied from another
// route would match nothing here and pass vacuously, which is why every derived set is asserted
// non-empty before it is compared.
//
// ponytail: matched on source text for the SET, executed for the BEHAVIOUR. Three stated ceilings:
// (1) a receiver renamed later still surfaces as unexpected and still fails — it does not slip
// through, it just reads worse; (2) this proves the observer, the close-path listeners and the call
// sites exist and fire, never that the 400ms window really disables anything in a browser — only
// scripts/arm-gate-probe.mjs proves that, and this test claims nothing about it; (3) the arm window's
// CLOCK is ADR-0059's business and lives in _arm-gate.ts, not here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { sliceBlock } from '../_dom-stub.mjs';

const here = import.meta.dirname;

/** Whole-line comments are dropped: both files document their own reveal seams in prose, and a
 *  checker cannot tell use from mention. Only full-line comments go — a trailing `//` inside a string
 *  would take real code with it, and nothing here needs that. */
function readCode(name) {
  return fs
    .readFileSync(path.join(here, name), 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}

const engine = readCode('main.js');
const glue = readCode('main.ts');
const markup = fs.readFileSync(path.join(here, 'markup.html'), 'utf8');

// ---- the engine's reveal set --------------------------------------------------------------------

/** initDOM's id map: `this.elResult = this.root.querySelector('#screen-result')`. Every reveal
 *  receiver below is one of these names, so the map is what turns a receiver into an element id. */
const CACHED_IDS = new Map(
  [...engine.matchAll(/this\.(el[A-Za-z]+) = this\.root\.querySelector\('#([\w-]+)'\)/g)]
    .map((m) => [m[1], m[2]]),
);

/** The receiver names of a reveal, in the two spellings this engine uses. A screen carries `hidden`
 *  while it is away, so `classList.toggle('hidden', …)` is the only thing that can bring it back; a
 *  modal is present-when-open and arrives through the single openModal() helper.
 *  `classList.add('hidden')` is a HIDE and matches neither. */
const revealReceivers = (re) => [...new Set([...engine.matchAll(re)].map((m) => m[1]))];

const screenReceivers = revealReceivers(/this\.(el[A-Za-z]+)\.classList\.toggle\('hidden'/g);
const modalReceivers = revealReceivers(/this\.openModal\(this\.(el[A-Za-z]+)\)/g);

// The no-3D notice is deliberately NOT a screen, and this is the one exclusion in the file. It is
// revealed by showWebGLError with `classList.remove('hidden')` — a spelling neither pattern above
// matches, so it would be invisible here anyway — and it is a dead-end panel: markup.html gives it a
// heading and a paragraph and NO control at all (no reload trigger, per ADR-0005 and ADR-0014). A
// reveal with no button under the finger has nothing to arm. Recorded so a reader does not go looking
// for a missing entry, and asserted below rather than trusted.
const NOT_A_SCREEN = new Map([['webglUnsupportedNotice', 'the no-3D notice: revealed once, and it carries no control']]);

/** The route's own reveal, which no pattern over main.js can see: the reset-to-cast confirm is
 *  injected by main.ts and opened by main.ts, so the engine's source never mentions it. */
const ROUTE_OWNED = new Map([['modal-reset-names', 'the reset-to-cast confirm, injected and opened by main.ts']]);

test('the reveal patterns match something — otherwise every set below is empty and agrees', () => {
  assert.ok(CACHED_IDS.size > 0, 'initDOM no longer caches screens through this.root.querySelector — the id map is empty');
  assert.ok(screenReceivers.length > 0, 'no screen reveal matched in main.js: the engine changed how it shows a screen');
  assert.ok(modalReceivers.length > 0, 'no modal reveal matched in main.js: the engine changed how it opens a modal');
  for (const name of [...screenReceivers, ...modalReceivers]) {
    assert.ok(CACHED_IDS.has(name), `${name} is revealed but never cached in initDOM — its element id cannot be resolved`);
  }
});

test("main.ts arms every screen the lifted engine reveals, and nothing it does not", () => {
  const revealed = [...screenReceivers, ...modalReceivers]
    .map((name) => CACHED_IDS.get(name))
    .filter((id) => !NOT_A_SCREEN.has(id));

  // The watched set, read out of REVEAL_CONTAINERS in main.ts rather than retyped here: a list typed
  // in a test is a second copy that can agree with nothing.
  const watched = [...new Set([...glue.matchAll(/\{\s*id:\s*'([\w-]+)',\s*cls:/g)].map((m) => m[1]))];
  assert.ok(watched.length > 0, 'REVEAL_CONTAINERS no longer parses out of main.ts — this test is measuring nothing');

  assert.deepEqual(
    watched.slice().sort(),
    [...revealed, ...ROUTE_OWNED.keys()].sort(),
    'the screens main.ts arms and the screens the engine reveals have drifted apart: an engine screen ' +
      'nobody watches comes back on screen with its buttons already enabled, and a watched id nothing ' +
      'reveals arms nothing. The arm-gate CI check will not tell you — it is already green.',
  );
});

test('the one excluded reveal really carries no control, so excluding it is not a hole', () => {
  // The exclusion above is the only place this file lets a reveal through, so its reason is checked
  // rather than written down. A notice that grows a button reds here and has to be armed.
  for (const id of NOT_A_SCREEN.keys()) {
    const at = markup.indexOf(`id="${id}"`);
    assert.notEqual(at, -1, `${id} is excluded from the reveal set but is no longer in markup.html`);
    const panel = markup.slice(at, markup.indexOf('\n      </div>', at));
    assert.doesNotMatch(panel, /<button|<a\s/, `${id} now carries a control and can no longer be excluded from the reveal set`);
  }
});

// ---- the observer, executed --------------------------------------------------------------------

/** The source text between two markers, asserted present so a moved marker reds loudly. */
function region(source, from, to) {
  const start = source.indexOf(from);
  assert.notEqual(start, -1, `main.ts no longer contains ${from} — this test is measuring nothing`);
  const end = source.indexOf(to, start + from.length);
  assert.notEqual(end, -1, `main.ts no longer contains ${to} after ${from}`);
  return source.slice(start, end);
}

const raw = fs.readFileSync(path.join(here, 'main.ts'), 'utf8');
const CONTAINERS_SRC = region(raw, 'const REVEAL_CONTAINERS', '/** ADR-0014');
const CLOSE_CONTROLS_SRC = region(raw, 'const CLOSE_CONTROLS', '// ---- the reset-to-cast');

function sliceOf(header) {
  const found = sliceBlock(raw, header);
  assert.ok(found, `main.ts no longer declares ${header} — this test is measuring nothing`);
  return found;
}

const WATCH_SRC = sliceOf('function watchEngineReveals(): void');
const COVERED_SRC = sliceOf('function armWhatTheModalCovered(): void');
const BEHIND_SRC = sliceOf('const armBehindModal = (ev: Event): void =>');

/** One fake element whose classList is a real set, because a reveal on this route IS a class flip
 *  and a classList that answered `false` to everything would make the observer's rising edge
 *  unobservable. Nothing else about the DOM is modelled. */
function makeEl(id, classes = []) {
  const set = new Set(classes);
  return {
    id,
    classList: {
      add: (c) => set.add(c),
      remove: (c) => set.delete(c),
      contains: (c) => set.has(c),
    },
  };
}

/** Runs the shipped glue over a page of fake elements. Returns the elements the route armed, in
 *  order, plus the observers it installed. */
function loadGlue() {
  const armed = [];
  const observers = [];
  const els = new Map();
  const $ = (id) => {
    if (!els.has(id)) els.set(id, makeEl(id, id.startsWith('screen-') ? ['hidden'] : []));
    return els.get(id);
  };
  class FakeObserver {
    constructor(fn) { this.fn = fn; }
    observe(el, options) { observers.push({ el, options, fire: this.fn }); }
  }
  const code = stripTypeScriptTypes(
    `${CONTAINERS_SRC}${CLOSE_CONTROLS_SRC}${WATCH_SRC}\n${COVERED_SRC}\n${BEHIND_SRC};`,
    { mode: 'strip' },
  );
  // eslint-disable-next-line no-new-func -- executing main.ts's own text is the whole point.
  const api = new Function(
    '$', 'armAllButtons', 'BOARD_ID', 'MutationObserver',
    `${code}\n;return { REVEAL_CONTAINERS, CLOSE_CONTROLS, watchEngineReveals, armWhatTheModalCovered, armBehindModal };`,
  )((id) => $(id), (el) => armed.push(el.id), 'croc-fallback-board', FakeObserver);
  return { api, armed, observers, $ };
}

test('one observer per screen, watching the only signal the sealed engine emits', () => {
  const { api, observers } = loadGlue();
  api.watchEngineReveals();
  assert.deepEqual(
    observers.map((o) => o.el.id).sort(),
    api.REVEAL_CONTAINERS.map((c) => c.id).sort(),
    'a screen in REVEAL_CONTAINERS got no observer — nothing arms it when the engine reveals it',
  );
  for (const o of observers) {
    assert.deepEqual(o.options, { attributes: true, attributeFilter: ['class'] },
      `${o.el.id} is observed on something other than its class attribute, which is the only signal the engine emits`);
  }
});

test('the observer arms on the rising edge only, and it arms the screen that appeared', () => {
  // Both halves are executed rather than pattern-matched, because both are what makes the observer a
  // reveal gate rather than a mutation counter: arming on every mutation would re-arm a screen that
  // merely restyled, and arming without the was/now comparison would re-arm on the HIDE too,
  // disabling the screen a player has just arrived on.
  const { api, armed, observers } = loadGlue();
  api.watchEngineReveals();
  assert.deepEqual(armed, [], 'installing the observers armed something before any reveal happened');

  for (const { el, options, fire } of observers) {
    const container = api.REVEAL_CONTAINERS.find((c) => c.id === el.id);
    assert.ok(options.attributeFilter, 'the observer lost its attribute filter');
    const before = armed.length;

    // The reveal, in this screen's own spelling.
    if (container.visibleWhenPresent) el.classList.add(container.cls);
    else el.classList.remove(container.cls);
    fire();
    assert.deepEqual(armed.slice(before), [el.id], `revealing ${el.id} did not arm ${el.id}`);

    // A second mutation with the screen still up — a restyle, not a reveal.
    fire();
    assert.equal(armed.length, before + 1, `${el.id} was re-armed by a mutation that revealed nothing`);

    // The HIDE. Arming here would disable the screen the player is being sent TO.
    if (container.visibleWhenPresent) el.classList.remove(container.cls);
    else el.classList.add(container.cls);
    fire();
    assert.equal(armed.length, before + 1, `hiding ${el.id} armed it — the falling edge is being treated as a reveal`);
  }
});

// ---- ADR-0057: closing a modal is itself a reveal ------------------------------------------------

test('ADR-0057: closing a modal arms the screen behind it and the no-3D board, never the modals', () => {
  // No class on the screen BEHIND a modal changes when the modal closes, so the observer above is
  // blind to this reveal and it needs its own path. This is the case three routes in this repo
  // shipped a comment arguing AGAINST ("nothing is rebuilt, so nothing to re-arm") — the control
  // behind the modal is enabled and its arm window expired long ago, which is exactly why the second
  // contact of the double-tap that closed the modal fires it.
  const { api, armed, $ } = loadGlue();
  // The HUD is up behind the modal, the other two screens are away, and the modal is still open —
  // which is the state at pointerdown, before the engine's own close runs.
  $('screen-hud').classList.remove('hidden');
  $('modal-settings').classList.add('open');

  api.armWhatTheModalCovered();

  assert.ok(armed.includes('screen-hud'), 'the screen the modal was covering was not armed');
  assert.ok(armed.includes('croc-fallback-board'),
    'the no-3D board was not armed: it is armed on rebuild and on nothing else, so every tooth a modal ' +
    'was covering is still enabled with its arm window long expired');
  assert.ok(!armed.includes('screen-setup'), 'a screen that is not on display was armed');
  for (const modal of api.REVEAL_CONTAINERS.filter((c) => c.modal)) {
    assert.ok(!armed.includes(modal.id),
      `${modal.id} was armed by its own close path: at pointerdown it is still open, and disabling its ` +
      'close button there would eat the contact that closes it');
  }
});

test('ADR-0057: every close, cancel and confirm control on this route is a close path', () => {
  const { api } = loadGlue();
  // Derived from the markup rather than retyped: every control whose id says it closes, cancels or
  // confirms, out of the engine's own screens AND out of the confirm main.ts injects. A seventh such
  // control added later is not in CLOSE_CONTROLS, and this reds.
  const injected = region(raw, 'const RESET_MODAL_HTML', '/** Owner ruling');
  const ids = [...new Set(
    [...`${markup}${injected}`.matchAll(/id="(btn-[\w-]*(?:close|cancel|confirm)[\w-]*)"/g)].map((m) => m[1]),
  )].sort();
  assert.ok(ids.length > 0, 'no close control found in the markup — this test is measuring nothing');

  const listed = [...new Set([...api.CLOSE_CONTROLS.matchAll(/#([\w-]+)/g)].map((m) => m[1]))].sort();
  assert.deepEqual(listed, ids,
    'CLOSE_CONTROLS and the route\'s close/cancel/confirm controls have drifted apart: a control that ' +
    'closes a modal without arming what it covered leaves the second contact of that double-tap live');
});

test('ADR-0057: each close control, pressed, actually reaches the arming', () => {
  // Set equality above proves the SELECTOR names every control. This proves the handler answers to
  // each one: the shipped listener body is executed once per control, against a target that resolves
  // `closest` by real selector membership.
  const { api } = loadGlue();
  const ids = [...api.CLOSE_CONTROLS.matchAll(/#([\w-]+)/g)].map((m) => m[1]);
  const selectors = api.CLOSE_CONTROLS.split(',').map((s) => s.trim());

  for (const id of ids) {
    let reached = 0;
    const target = {
      id,
      closest: (sel) => (sel.split(',').map((s) => s.trim()).includes(`#${id}`) ? target : null),
    };
    // The handler is re-created per control so its own armWhatTheModalCovered can be counted.
    const handler = new Function(
      'CLOSE_CONTROLS', 'armWhatTheModalCovered',
      `${stripTypeScriptTypes(BEHIND_SRC, { mode: 'strip' })}\n;return armBehindModal;`,
    )(api.CLOSE_CONTROLS, () => { reached += 1; });
    handler({ target });
    assert.equal(reached, 1, `pressing #${id} did not arm what the modal was covering`);
    assert.ok(selectors.includes(`#${id}`));
  }

  // The complement: a press that is not on a close control must arm nothing, or every tap on the
  // page would re-disable the screen under the player's finger.
  let reached = 0;
  const handler = new Function(
    'CLOSE_CONTROLS', 'armWhatTheModalCovered',
    `${stripTypeScriptTypes(BEHIND_SRC, { mode: 'strip' })}\n;return armBehindModal;`,
  )(api.CLOSE_CONTROLS, () => { reached += 1; });
  handler({ target: { closest: () => null } });
  assert.equal(reached, 0, 'a press that closed no modal armed the screen anyway');
});

// ---- ADR-0059: the close path is gated at the PRESS as well as at the release ---------------------

test('ADR-0059: the close path is registered on a document-capture pointerdown', () => {
  // THE HALF THAT REDS ALONE, and the reason it is its own test. The engine closes a modal from a
  // button on CLICK, so a gate registered only on click anchors its window to the RELEASE — and on a
  // long press that window is already over by the time the finger lifts, which is precisely the
  // contact that then lands on the board underneath. Capture is what puts this ahead of the engine's
  // own close, the last moment anything can still disable what is behind the modal before that click
  // is dispatched.
  const registration = glue.match(
    /document\.addEventListener\(\s*'pointerdown',\s*([A-Za-z_$][\w$]*)\s*,\s*true\s*\)/,
  );
  assert.ok(
    registration,
    'the close path is no longer gated on a document-capture pointerdown: by the time any click runs ' +
      'the modal is already closed, so the release of the press that closed it is hit-tested against ' +
      'the screen behind and fires a control there',
  );
  assert.equal(registration[1], 'armBehindModal', 'the document-capture pointerdown no longer runs the close-path arming');
});

test('ADR-0059: the click leg is registered too — one window per clock', () => {
  // The other half, kept as a separate assertion because the two anchor to different clocks and a
  // long press needs both: a click-built window anchors to the release, a pointerdown-built one to
  // the press. Neither substitutes for the other.
  assert.match(
    glue,
    /document\.addEventListener\('click', armBehindModal\);/,
    'the close path lost its click registration — the release of an ordinary tap is no longer gated',
  );
});

test("the route's own reveals are armed at their call sites", () => {
  // Two reveals belong to main.ts rather than to the engine. The confirm overlay is one of the
  // observed containers (set equality above covers it). The other is the setup screen, which is
  // already on display when the route boots, so no reveal will ever be observed for it and it arms
  // itself once at mount.
  assert.match(
    glue,
    /if \(app\.state\.phase === PHASE_SETUP\) \{[\s\S]{0,200}armAllButtons\(setup\)/,
    'the setup screen is no longer armed at mount: it is up before any observer exists, so nothing ' +
      'else on this route will ever arm it',
  );
  // And the no-3D board, which is main.ts's own DOM and is armed on every rebuild.
  const board = sliceOf('function renderBoard(app: KhengApp): void');
  assert.match(board, /disarmBoard\?\.\(\);\s*\n\s*disarmBoard = armAllButtons\(host\);/,
    'the no-3D board is rebuilt without arming it, or without disarming the gate the previous build ' +
      'left holding a set of detached nodes');
});

test('every reveal receiver in main.ts is a known one', () => {
  // The same shape the sibling routes use, kept so a reveal written into main.ts in some OTHER form
  // than a container class flip — a `hidden = false`, a showModal — cannot land unnoticed.
  const REVEAL_RE = /([\w.?'"()\-]+?)\.(?:hidden\s*=\s*false\b|showModal\(\))/g;
  const found = [...new Set([...glue.matchAll(REVEAL_RE)].map((m) => m[1]))];
  assert.deepEqual(
    found,
    [],
    'new reveal path(s) in main.ts: decide whether each one puts a <button> under the finger, arm the ' +
      'revealed element if it does, and record it here with the reason.',
  );
});
