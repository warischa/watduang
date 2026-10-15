// The hole scripts/arm-gate-coverage-check.mjs cannot see, pinned here.
//
// That gate asks ONE question of a play route: does it import armAllButtons and call it at least
// once? A route can answer yes from a single screen and leave every other reveal ungated -- the gate
// counts calls per DIRECTORY, not per reveal. The real rule (ADR-0017, ADR-0057) is per reveal: the
// second contact of a double-tap must never land on a control the first contact just put under the
// finger, and closing a dialog is a reveal too.
//
// Three legs since gh#264 (ADR-0071), and they answer different questions.
//
//   BEHAVIOURAL, route side -- show() and putAwayRound() are sliced out of the shipped main.js and
//   executed with a spy in place of armAllButtons, so what is asserted is that the call really
//   happens on the element that just became visible, and that putting a round away really ends it.
//
//   STATIC -- the SET of reveal sites in main.js. A new visibility write fails on the day it lands
//   and whoever adds it decides whether it needs arming and records that decision here.
//
//   SHARED SCREEN -- the player screen mounted into #bd-players replaced the mockup's setup screen,
//   its reset confirm and that confirm's close paths. Its reveals (opening, the mid-round dialog's
//   close, cancel and confirm, the undo bar, the 100ms double contact) are driven for real by
//   revealPathCases: the shared code over THIS route's markup.html with the real arm gate. This
//   route has no header bar, so the control read outside the screen's root is #readyBtn, the round
//   control a mid-round dialog sits over; a screen that armed only its own root leaves it live and
//   reds there.
//
// ponytail: the static leg matches source text, not a parsed AST, and it proves the call SITE exists
// beside the reveal -- never that the arm window really disables anything in a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeDocumentStub, sliceBlock } from '../_dom-stub.mjs';
import { revealPathCases } from '../_player-screen/screen-harness.mjs';

const MAIN = path.join(import.meta.dirname, 'main.js');
const MARKUP = fs.readFileSync(path.join(import.meta.dirname, 'markup.html'), 'utf8');
const raw = fs.readFileSync(MAIN, 'utf8');
// Whole-line comments are dropped for the static leg: main.js documents its own reveal seams in
// prose, and a checker cannot tell use from mention.
const source = raw
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('//'))
  .join('\n');

const ROUND_SCREENS = ['turn', 'drive', 'result', 'final'];

function slice(header) {
  const found = sliceBlock(raw, header);
  assert.ok(found, `main.js no longer declares ${header} — this test is measuring nothing`);
  return found;
}

/** show(), wired to a spy instead of the real arm gate. */
function build() {
  const stub = makeDocumentStub();
  const armed = [];
  const show = new Function('document', '$', 'armAllButtons', 'SCREENS', `return ${slice('function show(name)')};`)(
    stub.document, stub.el, (el) => armed.push(el.id), ROUND_SCREENS,
  );
  return { show, armed };
}

test('every screen this route reveals is armed as it is revealed', () => {
  for (const name of ROUND_SCREENS) {
    const route = build();
    route.show(name);
    assert.deepEqual(route.armed, [`screen-${name}`], `show('${name}') armed ${route.armed.join(', ') || 'nothing'}`);
  }
});

test('RED CALIBRATION: the spy really records, so an empty list means an absent call', () => {
  const route = build();
  assert.deepEqual(route.armed, [], 'the spy started dirty — every assertion above is unreadable');
});

test('SCREENS no longer names a setup screen: the player screen is the first screen', () => {
  assert.match(source, /const SCREENS = \['turn', 'drive', 'result', 'final'\];/);
  assert.doesNotMatch(MARKUP, /id="screen-setup"/);
});

// ADR-0071 ruling 6: the mid-round confirm ends the round. On this route a round outlives its screens
// in two places -- the frame loop, and the 700ms timer endDrive() sets before it shows the result.
// Putting the round away must stop both, or the result screen comes up OVER the player screen the
// moment that timer fires.
test('putting a round away cancels the frame loop and the pending result reveal, and hides every screen', () => {
  const timers = new Map();
  let nextTimer = 1;
  const cancelledFrames = [];
  const classes = new Map();
  const el = (id) => {
    if (!classes.has(id)) classes.set(id, new Set());
    const set = classes.get(id);
    return {
      id,
      textContent: '',
      setAttribute() {},
      classList: { add: (c) => set.add(c), remove: (c) => set.delete(c), toggle: (c, on) => (on ? set.add(c) : set.delete(c)) },
    };
  };
  const shown = [];
  const env = {
    $: el,
    setTimeout: (fn) => { const id = nextTimer++; timers.set(id, fn); return id; },
    clearTimeout: (id) => timers.delete(id),
    cancelAnimationFrame: (id) => cancelledFrames.push(id),
    show: (name) => shown.push(name),
    announce() {},
    stage: el('stage'),
    drive: { pos: 123.4, hitKind: 'rock' },
    round: { names: ['A', 'B'], turn: 0, count: 2, results: [] },
    RULES: { OBSTACLES: [{ id: 'rock', th: 'rock' }] },
    SCREENS: ROUND_SCREENS,
    raf: 77,
    steer: 1,
    resultTimer: 0,
  };
  const names = Object.keys(env);
  const run = new Function(...names, `
    ${slice('function endDrive(why)')}
    ${slice('function putAwayRound()')}
    endDrive('crash');
    putAwayRound();
    return { raf, resultTimer };`);
  run(...names.map((k) => env[k]));
  assert.ok(cancelledFrames.includes(77), 'the frame loop was not cancelled');
  assert.equal(timers.size, 0, 'the 700ms result reveal endDrive() scheduled is still pending after the round was put away');
  for (const fn of timers.values()) fn();
  assert.deepEqual(shown, [], 'the result screen came up after the round was put away');
  for (const name of ROUND_SCREENS) {
    assert.equal(classes.get(`screen-${name}`)?.has('active') ?? false, false, `screen-${name} stayed active`);
  }
});

test('a round is live on the turn, drive and result screens, and not on the final one', () => {
  const active = new Set();
  const $ = (id) => ({ classList: { contains: (c) => c === 'active' && active.has(id) } });
  const roundActive = new Function('$', `return ${slice('function roundActive()')};`)($);
  assert.equal(roundActive(), false, 'nothing on screen is not a round');
  for (const name of ['turn', 'drive', 'result']) {
    active.clear();
    active.add(`screen-${name}`);
    assert.equal(roundActive(), true, `screen-${name} is mid-round`);
  }
  active.clear();
  active.add('screen-final');
  assert.equal(roundActive(), false, 'the final ranking is over: editing there loses nothing (ADR-0071 ruling 6)');
});

// receiver -> why it is or is not armed. Every entry is a decision, not an observation.
const EXPECTED = new Map([
  [
    'screen',
    "show(): the single seam every screen change on this route passes through -- turn, drive, " +
      'result and final. Armed on the screen it just revealed.',
  ],
]);

test('every reveal receiver in bangkok-drift/main.js is a known one', () => {
  // Every write that can make a control visible: the `.active` class this route's CSS uses for its
  // screens, added or toggled, plus a direct display write.
  const REVEAL_RE =
    /([\w.'"()$\-]+?)\.(?:classList\.(?:add|toggle)\(\s*['"]active['"]|style\.display\s*=\s*['"](?:block|flex|grid|inline|inline-block|inline-flex)['"])/g;
  const found = [...source.matchAll(REVEAL_RE)].map((m) => m[1].trim());
  assert.ok(found.length > 0, 'the reveal pattern matched nothing — this test would pass vacuously');
  const unknown = [...new Set(found)].filter((r) => !EXPECTED.has(r)).sort();
  assert.deepEqual(unknown, [],
    `new reveal path(s) ${unknown.join(', ')}: decide whether each one puts a <button> under the ` +
      'finger, arm the revealed element if it does, and add it to EXPECTED with the reason. The ' +
      'arm-gate CI check will not tell you — it is already green.');
  const stale = [...EXPECTED.keys()].filter((r) => !found.includes(r)).sort();
  assert.deepEqual(stale, [], `EXPECTED names reveal receivers that no longer exist: ${stale.join(', ')}`);
});

test('the shared player screen is mounted into #bd-players, inside the #app it arms', () => {
  assert.match(source, /const playersRoot = document\.getElementById\('bd-players'\);/);
  assert.match(source, /mountPlayerScreen\(\{\s*root: playersRoot,/);
  assert.ok(MARKUP.indexOf('id="app"') < MARKUP.indexOf('id="bd-players"'), '#bd-players must sit inside #app');
  assert.doesNotMatch(MARKUP, /class="screen active"/, 'no game screen may ship active over the player screen');
});

test('the final screen edit reaches the player screen, never a bare screen swap', () => {
  const edit = source.slice(source.indexOf("$('editBtn')"));
  assert.match(edit.slice(0, edit.indexOf('});')), /playerScreen\.open\(\)/);
});

revealPathCases({ test, assert, routeMarkup: MARKUP, rootId: 'bd-players', headerId: 'readyBtn', label: 'bangkok-drift' });
