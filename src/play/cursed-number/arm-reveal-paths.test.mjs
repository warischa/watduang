// The hole scripts/arm-gate-coverage-check.mjs cannot see, pinned here.
//
// That gate asks ONE question of a play route: does it import armAllButtons and call it at least
// once? cursed-number does, four times -- and the gate would stay green with three of those four
// deleted. It has no way to know that this route reveals controls on more than one path, because it
// counts calls per DIRECTORY, not per reveal. The real rule (ADR-0017) is per reveal: the second
// contact of a double-tap must not land on a control the first contact just put under the finger.
//
// So this test does not re-check the gate. It pins the SET of reveal sites, by the receiver each one
// writes to. A fifth receiver -- a new modal, a new panel toggled by display -- fails this test on
// the day it is added, and whoever adds it decides whether it needs a call and records that here.
//
// ponytail: matched on source text, not on a parsed AST. The ceiling is stated rather than hidden:
// (1) a reveal written as `document.getElementById('x').classList.add('active')` in ONE expression
//     is recorded under the receiver text `document.getElementById('x')`, so it still shows up as an
//     unexpected receiver and still fails -- it does not slip through, it just reads worse;
// (2) this proves the CALL SITE exists next to the reveal, never that the 400ms window really
//     disables anything. Only scripts/arm-gate-probe.mjs in a real browser proves that, and this
//     test claims nothing about it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const MAIN = path.join(import.meta.dirname, 'main.js');
// Whole-line comments are dropped, and this is not a detail: the first run of this test failed on
// `#rulesModal.classList.add('active')` written inside the header comment that DOCUMENTS the four
// reveal paths. A checker cannot tell use from mention, and prose about a reveal is not a reveal.
// Only full-line comments go: a trailing `//` inside a string would take real code with it, and
// nothing here needs that. Block comments carry no reveal text today and are left alone.
const source = fs
  .readFileSync(MAIN, 'utf8')
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('//'))
  .join('\n');

// Every write that can make a control visible or change which control is the live one: the `.active`
// class this route's CSS uses for both screens and the modal, and a direct display write.
const REVEAL_RE = /([\w.'"()\-]+?)\.(?:classList\.add\(\s*['"]active['"]\s*\)|style\.display\s*=\s*['"](?:block|flex)['"])/g;

// receiver -> why it is or is not armed. Every entry is a decision, not an observation.
const EXPECTED = new Map([
  ['target', 'showScreen(): the screen-to-screen path. Armed on the line below the reveal.'],
  ['modal', 'the rulesBtn handler: #rulesModal, 2 buttons, never passes showScreen. Armed.'],
  ['sliderCont', 'setInputMode(): 9 step buttons revealed inside a screen already up. Armed.'],
  ['keypadCont', 'setInputMode(): 12 keys revealed inside a screen already up. Armed.'],
  ['sliderTab', 'NOT a reveal: an .active state class on a tab button that was already visible.'],
  ['keypadTab', 'NOT a reveal: an .active state class on a tab button that was already visible.'],
  ['customInput', 'NOT a button reveal: #customPenaltyInput is a text input, nothing to ghost-tap.'],
  ['penaltyBox', 'NOT a button reveal: #penaltyResultBox holds a label and a text div, no button.'],
]);

test('every reveal receiver in cursed-number/main.js is a known one', () => {
  const found = [...source.matchAll(REVEAL_RE)].map((m) => m[1]);
  assert.ok(found.length > 0, 'the reveal pattern matched nothing — this test would pass vacuously');
  const unknown = [...new Set(found)].filter((r) => !EXPECTED.has(r)).sort();
  assert.deepEqual(
    unknown,
    [],
    `new reveal path(s) ${unknown.join(', ')}: decide whether each one puts a <button> under the ` +
      'finger, call armAllButtons on the revealed element if it does, and add it to EXPECTED with ' +
      'the reason. The arm-gate CI check will not tell you — it is already green.',
  );
  // The other direction: an entry that no longer matches anything is a stale decision, and a stale
  // EXPECTED is how this test would keep passing while the code it describes moved on.
  const stale = [...EXPECTED.keys()].filter((r) => !found.includes(r)).sort();
  assert.deepEqual(stale, [], `EXPECTED names reveal receivers that no longer exist: ${stale.join(', ')}`);
});

test('each armed reveal receiver has an armAllButtons call naming it', () => {
  for (const receiver of ['modal', 'sliderCont', 'keypadCont']) {
    assert.match(
      source,
      new RegExp(`armAllButtons\\([^)]*\\b${receiver}\\b`),
      `${receiver} is revealed but no armAllButtons call names it`,
    );
  }
  // showScreen's is written against `target`, on the line after the class is added.
  assert.match(source, /target\.classList\.add\('active'\);\s*\n\s*armAllButtons\(target\);/);
});
