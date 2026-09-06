// The hole scripts/arm-gate-coverage-check.mjs cannot see, pinned here.
//
// That gate asks ONE question of a play route: does it import armAllButtons and call it at least
// once? A route can answer yes from a single screen and leave every other reveal ungated -- the gate
// counts calls per DIRECTORY, not per reveal. The real rule (ADR-0017, ADR-0057) is per reveal: the
// second contact of a double-tap must never land on a control the first contact just put under the
// finger, and CLOSING THE RESET CONFIRM IS A REVEAL -- the setup controls behind it come back live
// with their own arm window long expired, which is exactly why a second contact fires one of them.
//
// Two legs, and they answer different questions.
//
//   BEHAVIOURAL -- the reveal functions are sliced out of the shipped main.js and executed with a
//   spy in place of armAllButtons, so what is asserted is that the call really happens and really
//   receives the element that just became visible. A call that moved into an unreachable branch, or
//   that arms the wrong element, fails here.
//
//   STATIC -- the SET of reveal sites. A third visibility write (a new modal, a panel toggled by
//   display) fails on the day it lands and whoever adds it decides whether it needs arming and
//   records that decision here. A recorded receiver that no longer exists fails too: a stale list is
//   how a pinning test keeps passing while the code it describes moves on.
//
// ponytail: the static leg matches source text, not a parsed AST, and it proves the call SITE exists
// beside the reveal -- never that the arm window really disables anything in a browser. Only a real
// browser proves that, and nothing here claims it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeDocumentStub, sliceBlock } from '../_dom-stub.mjs';

const MAIN = path.join(import.meta.dirname, 'main.js');
const raw = fs.readFileSync(MAIN, 'utf8');
// Whole-line comments are dropped for the static leg: main.js documents its own reveal seams in
// prose, and a checker cannot tell use from mention. Only FULL-line comments go -- a trailing `//`
// inside a string would take real code with it, and nothing here needs that.
const source = raw
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('//'))
  .join('\n');

function slice(header) {
  const found = sliceBlock(raw, header);
  assert.ok(found, `main.js no longer declares ${header} — this test is measuring nothing`);
  return found;
}

/** The route's four reveal-side functions, wired to a spy instead of the real arm gate. */
function build() {
  const stub = makeDocumentStub();
  const armed = [];
  const factory = new Function(
    'document', '$', 'armAllButtons', 'SCREENS',
    `const show = ${slice('function show(name)')};
     const armSetup = ${slice('function armSetup()')};
     const openResetNames = ${slice('function openResetNames()')};
     const closeResetNames = ${slice('function closeResetNames()')};
     return { show, armSetup, openResetNames, closeResetNames };`,
  );
  const parts = factory(
    stub.document,
    stub.el,
    (el) => armed.push(el.id),
    ['setup', 'turn', 'drive', 'result', 'final'],
  );
  return { ...parts, armed, el: stub.el };
}

test('every screen this route reveals is armed as it is revealed', () => {
  const screens = ['setup', 'turn', 'drive', 'result', 'final'];
  for (const name of screens) {
    const route = build();
    route.show(name);
    assert.deepEqual(route.armed, [`screen-${name}`],
      `show('${name}') armed ${route.armed.join(', ') || 'nothing'}`);
  }
});

test('opening the reset confirm arms the confirm itself', () => {
  const route = build();
  route.openResetNames();
  assert.deepEqual(route.armed, ['bd-modal-reset-names']);
});

// THE CLOSE PATH. Three routes shipped a comment arguing the opposite -- "nothing is rebuilt, so
// there is nothing to re-arm" -- and the control behind a closing dialog is precisely the one a
// second contact fires. Cancel and confirm are separate paths and both are driven here.
test('closing the reset confirm arms the setup screen behind it, on BOTH close paths', () => {
  const cancel = build();
  cancel.closeResetNames();
  assert.deepEqual(cancel.armed, ['screen-setup'],
    'the cancel path left the setup controls live with no arm window');

  // The confirm path is the same function reached from the other button, and the handler that calls
  // it is pinned by source so a confirm that closed the dialog its own way could not pass on this.
  assert.match(source, /\$\('bd-confirm-reset-names'\)\.addEventListener\('click',[\s\S]*?closeResetNames\(\)/,
    'the reset confirm button no longer closes through closeResetNames() — its close path is unpinned');
});

test('RED CALIBRATION: the spy really records, so an empty list means an absent call', () => {
  const route = build();
  assert.deepEqual(route.armed, [], 'the spy started dirty — every assertion above is unreadable');
  route.armSetup();
  assert.deepEqual(route.armed, ['screen-setup']);
});

// receiver -> why it is or is not armed. Every entry is a decision, not an observation.
const EXPECTED = new Map([
  [
    'screen',
    "show(): the single seam every screen change on this route passes through -- setup, turn, drive, " +
      'result and final. Armed on the screen it just revealed.',
  ],
  [
    'modal',
    'openResetNames(): the reset confirm, the one element this route reveals that is not a screen. ' +
      'Armed on its own slot; closeResetNames() arms the setup screen behind it on the way out.',
  ],
]);

test('every reveal receiver in bangkok-drift/main.js is a known one', () => {
  // Every write that can make a control visible: the `.active` class this route's CSS uses for both
  // screens and the confirm, added or toggled, plus a direct display write.
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
