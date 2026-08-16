// node --test — no framework, no dependency. Reads the component source instead of a DOM:
// the island script is inside the .astro file and cannot be imported, but the two structural
// invariants it depends on are both visible in the source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveStart, numberedPlayers } from './player-select.ts';

const src = readFileSync(new URL('./PlayerSetup.astro', import.meta.url), 'utf8');
const scriptAt = src.indexOf('<script>');
const template = src.slice(0, scriptAt);
const script = src.slice(scriptAt);

const queried = [...script.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]);

// #23 — every element the handlers reach for must stay in the DOM. hidden is fine, removal is not:
// a null from getElementById throws on the first .addEventListener and kills the whole island script,
// taking the setup panel down with it on every page that renders this component.
test('#23 every id the island script queries exists in the template — a missing one kills the whole island', () => {
  // positive control: a regex that matched nothing would make the loop below vacuously green
  assert.ok(queried.length >= 10, `expected the script to query many ids, found ${queried.length}`);
  for (const id of queried) {
    assert.ok(template.includes(`id="${id}"`), `#${id} is queried by the script but is not in the template`);
  }
});

/** the body of a top-level `function name(...) {...}` in the island script, comments stripped —
 *  these assertions are about what the code does, and this file's comments quote the code they explain */
function fnBody(name) {
  const start = script.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `function ${name} not found in the island script`);
  const open = script.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < script.length; i += 1) {
    if (script[i] === '{') depth += 1;
    else if (script[i] === '}') {
      depth -= 1;
      if (depth === 0) return script.slice(open + 1, i).replace(/\/\/.*$/gm, '');
    }
  }
  return assert.fail(`unbalanced braces after ${name}`);
}

// The island lives inside .astro and cannot be imported, so these three read it. Each one names a
// failure that was live in review, not a shape someone might prefer.

// Found in pre-merge review: the clear question renders OUTSIDE the panel (it has to — the panel hides
// mid-round), so root.hidden = true does not take it away. Left open across a start it sits beside the
// live round with Clear-and-drop-pending-round armed, and that button clears without asking again: one tap kills the
// round the player just chose to keep.
test('#25 starting or resuming a round closes an unanswered clear question first', () => {
  const body = fnBody('requestStart');
  assert.match(body, /planStart\(/, 'positive control: this really is the start path');
  assert.match(body, /clearChoiceEl\.hidden = true/, 'requestStart must close the clear question');
  // presence is not enough: below the 'ask' early return, the hazard comes back on the ask path
  assert.ok(
    body.indexOf('clearChoiceEl.hidden = true') < body.indexOf('planStart('),
    'closing must come before planStart, so the ask branch cannot return past it',
  );
});

// click fires on Enter keydown, so the focused button is under a key the player may still be holding.
test('#25 the clear question focuses the safe branch — Enter auto-repeat must not confirm destruction', () => {
  const body = fnBody('requestClear');
  assert.match(body, /clearCancelBtn\.focus\(\)/, 'ยกเลิก takes focus, as กลับไปเล่นรอบที่ค้าง does at a start');
  assert.doesNotMatch(body, /clearConfirmBtn\.focus\(\)/, 'never focus ล้างและทิ้งรอบที่ค้าง');
});

// planClear's missing gameId parameter blocks misuse OF it; nothing blocks a bypass AROUND it. This
// covers exactly the named bypass — a game-matched test inlined in the island — and nothing wider.
test('#25 the clear path decides through planClear, with no game matching inlined around it', () => {
  const body = fnBody('requestClear');
  assert.match(body, /planClear\(session\.checkpoint/, 'the decision belongs to planClear');
  assert.doesNotMatch(body, /gameId/, 'the clear slot is site-wide — a game-matched test here is the bug');
  const guard = body.indexOf('planClear(');
  const wipe = body.indexOf('session.clear()');
  assert.ok(wipe > 0, 'positive control: this is the function that wipes the session');
  assert.ok(guard < wipe, 'the guard must come before the wipe');
});

/** the body of `elementVar.addEventListener('event', () => {...})` in the island script — same
 *  brace-matching as fnBody above, needed because startBtn's handler is an anonymous arrow function
 *  bound via addEventListener, not a `function name(...)` declaration. */
function listenerBody(elementVar, event) {
  const needle = `${elementVar}.addEventListener('${event}', () => {`;
  const start = script.indexOf(needle);
  assert.ok(start >= 0, `${needle} not found in the island script`);
  const open = script.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < script.length; i += 1) {
    if (script[i] === '{') depth += 1;
    else if (script[i] === '}') {
      depth -= 1;
      if (depth === 0) return script.slice(open + 1, i).replace(/\/\/.*$/gm, '');
    }
  }
  return assert.fail(`unbalanced braces after ${needle}`);
}

// 0 players ticked: startBtn substitutes a synthesized "Player 1..N" set for the empty selection BEFORE
// resolveStart runs (see the long comment on this branch in PlayerSetup.astro). numberedPlayers always
// clamps up to at least min, so belowMin can never fire from this path — the guard is provably dead code
// here (a separate issue tracks removing it; this test only pins the fact, it does not act on it).
test('0 players ticked: startBtn substitutes numberedPlayers before resolveStart runs, so belowMin can never fire from this path', () => {
  const body = listenerBody('startBtn', 'click');
  assert.match(body, /selected\.size > 0/, 'positive control: this really is the zero-selection branch');
  assert.match(
    body,
    /fullSelection = numberedPlayers\(Number\(countInput\.value\), min, max\)/,
    '0 ticked names must fall back to a synthesized "คนที่ 1..N" set',
  );
  assert.ok(
    body.indexOf('numberedPlayers(') < body.indexOf('resolveStart('),
    'the substitution must happen before resolveStart runs, or belowMin would see the real empty selection',
  );

  // The consequence, proven with the real functions rather than trusted from the comment: numberedPlayers
  // clamps to at least min, so feeding its output straight into resolveStart can never trip belowMin —
  // for any min/max the zero-selected branch might run under.
  for (const [min, max] of [[1, 4], [2, 6], [3, 3]]) {
    const r = resolveStart(numberedPlayers(0, min, max), min, max, false);
    assert.equal(r.belowMin, false, `min=${min} max=${max}: belowMin fired from the substituted set`);
  }
});

/** true when the element sits inside #player-setup — i.e. root.hidden = true takes it off screen. */
function insidePanel(id) {
  const start = template.indexOf('<div id="player-setup"');
  // stop at the element's OWN opening tag, not at its id attribute — otherwise a <div> being tested
  // counts itself as one more unclosed div and every div looks nested
  const at = template.lastIndexOf('<', template.indexOf(`id="${id}"`));
  assert.ok(start >= 0 && at > start, `#${id} not found after the panel opens`);
  const between = template.slice(start, at);
  const opens = (between.match(/<div\b/g) || []).length;
  const closes = (between.match(/<\/div>/g) || []).length;
  return opens > closes;
}

// #25 — the clear button is pressable mid-round precisely because it lives outside the panel that
// hides on start. Its question has to live out there with it: inside the panel, root.hidden = true
// would swallow it and pressing Clear group mid-round would look like a dead control.
test('#25 the clear confirmation sits outside #player-setup, next to the button it answers for', () => {
  // calibrates the helper both ways: ADR-0008's start prompt really is inside the panel
  assert.equal(insidePanel('resume-choice'), true, 'the start prompt belongs inside the panel');
  assert.equal(insidePanel('clear-group'), false, 'the clear button must stay pressable mid-round');
  assert.equal(insidePanel('clear-choice'), false, 'the clear question must stay visible mid-round');
});
