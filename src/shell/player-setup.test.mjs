// node --test — no framework, no dependency. Reads the component source instead of a DOM:
// the island script is inside the .astro file and cannot be imported, but the two structural
// invariants it depends on are both visible in the source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolveStart, numberedPlayers } from './player-select.ts';
// gh#61 — the window this panel arms on a tool page is the games' window, imported rather than retyped:
// ADR-0016 owns the number and the premise under it.
import { ARM_DELAY_MS } from '../games/_arm-gate.ts';

const src = readFileSync(new URL('./PlayerSetup.astro', import.meta.url), 'utf8');
const scriptAt = src.indexOf('<script>');
const template = src.slice(0, scriptAt);
const script = src.slice(scriptAt);
// read once: gh#54 pins a PAIR — the hide lives in the island above, the way back lives on the game page
const gamePage = readFileSync(new URL('../pages/game/[id].astro', import.meta.url), 'utf8');
// gh#62 pins a pair too: the render guard lives in the template above, the clearing mount that has to
// keep taking its true branch lives in the layout every game page renders through
const gameLayout = readFileSync(new URL('../layouts/GameLayout.astro', import.meta.url), 'utf8');
// gh#106 pins a pair too: this component must NOT declare the leave-confirm any more, and the island
// that now owns it must carry the same guard the two assertions below used to find here.
const leaveConfirm = readFileSync(new URL('./LeaveConfirm.astro', import.meta.url), 'utf8');
// gh#65 — the clear button is derived from gameId now, so the mounts that must NOT get it are the ones
// that pass no gameId. Read the directory rather than a list of three: the guarded set is "every tool
// page", and it grows. A hardcoded list would stop covering it the moment a fourth page lands, which is
// the exact failure gh#65 was opened on. recursive: true (Node 20.1+) so a page under a subdirectory of
// src/pages/tool/ is read too — a non-recursive listing would silently skip it.
const toolDir = new URL('../pages/tool/', import.meta.url);
const toolPages = readdirSync(toolDir, { recursive: true })
  .filter((f) => f.endsWith('.astro'))
  .map((f) => [f, readFileSync(new URL(f, toolDir), 'utf8')]);

const queried = [...script.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]);

// #23 — every element the handlers reach for must stay in the DOM. hidden is fine, removal is not:
// a null from getElementById throws on the first .addEventListener and kills the whole island script,
// taking the setup panel down with it on every page that renders this component.
//
// Ceiling, and gh#62 is what opened it: #clear-group is now emitted only where there is a game id
// (gh#65), so on a tool page that one id really is null at runtime. Its null is handled — clearBtn is typed
// nullable and every use sits inside `if (clearBtn)`, pinned by the gh#62 tests below. This test reads
// the template TEXT, so a conditionally rendered id passes it either way: it cannot tell a second
// conditional element apart from an unconditional one, and the next id rendered behind a prop gets no
// warning from here. That set is owned by whoever edits the template next, not by this file.
test('#23 every id the island script queries exists in the template — a missing one kills the whole island', () => {
  // positive control: a regex that matched nothing would make the loop below vacuously green
  assert.ok(queried.length >= 10, `expected the script to query many ids, found ${queried.length}`);
  for (const id of queried) {
    assert.ok(template.includes(`id="${id}"`), `#${id} is queried by the script but is not in the template`);
  }
});

/** index of the `}` that closes the `{` at `open`, depth-counted from `open` — shared by fnBody and
 *  listenerBody below, and unit-tested directly against synthetic input further down this file.
 *  ponytail: handles /* *\/ and // comments and '  "  ` string literals with \ escapes; does not
 *  handle regex literals or template-literal ${} nesting — this is a test helper, not a JS parser. */
function matchBraceEnd(text, open) {
  let depth = 0;
  let inLineComment = false;
  let inBlockComment = false;
  let inString = null;
  for (let i = open; i < text.length; i += 1) {
    const c = text[i];
    if (inLineComment) { if (c === '\n') inLineComment = false; continue; }
    if (inBlockComment) { if (c === '*' && text[i + 1] === '/') { inBlockComment = false; i += 1; } continue; }
    if (inString) {
      if (c === '\\') { i += 1; continue; }
      if (c === inString) inString = null;
      continue;
    }
    if (c === '/' && text[i + 1] === '/') { inLineComment = true; i += 1; continue; }
    if (c === '/' && text[i + 1] === '*') { inBlockComment = true; i += 1; continue; }
    if (c === '"' || c === "'" || c === '`') { inString = c; continue; }
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** the body of a top-level `function name(...) {...}` in the island script, comments stripped —
 *  these assertions are about what the code does, and this file's comments quote the code they explain */
function fnBody(name) {
  const start = script.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `function ${name} not found in the island script`);
  const open = script.indexOf('{', start);
  const close = matchBraceEnd(script, open);
  assert.ok(close >= 0, `unbalanced braces after ${name}`);
  return script.slice(open + 1, close).replace(/\/\/.*$/gm, '');
}

// The island lives inside .astro and cannot be imported, so the tests below read it. Each one names a
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

// #51 F2 — clear() can refuse (a stale write) but this page wires no onWriteRefused, so the refusal is
// silent: session.clear() below is unreachable today only because requestClear binds its own
// `const session = loadSession()`, with no await/.then(/yield before the wipe. This test pins two of the
// three breaks: (1) that exact binding staying inside requestClear — a module-scope hoist fails this even
// if some OTHER loadSession() call is left in the body (e.g. inlined into planClear's argument, with
// session.clear() below resolving to an outer binding instead), and (2) no async escape (await, .then(,
// yield) between that binding and session.clear(). It does NOT cover, and cannot: a synchronous
// re-entrant writer running between the binding and the wipe (an event dispatch that itself calls
// session.write() before session.clear() runs) — that is a set this repo does not own, so no source-text
// assertion converges on it. fnBody() already scopes this search to requestClear alone, so the OTHER
// loadSession() call (line ~169, requestStart's) can never be mistaken for this one — it isn't in this
// body at all.
test(
  "#51 requestClear's `const session = loadSession()` binding stays inside this function, with no " +
    'await/.then(/yield before the wipe (a synchronous re-entrant writer in that span is not covered)',
  () => {
    const body = fnBody('requestClear');
    const bindingRe = /const\s+session\s*=\s*loadSession\(\)/;
    assert.match(
      body,
      bindingRe,
      'requestClear must bind its own `const session = loadSession()` — if this binding moves above/outside ' +
        'requestClear (e.g. a shared module-scope session read once for several handlers), or some OTHER ' +
        'loadSession() call is left in its place while session.clear() below resolves to that outer binding, ' +
        "the session read here goes stale and session.clear()'s refusal (gh#51 F2) becomes a silent no-op " +
        'nobody notices',
    );
    const bindAt = body.match(bindingRe).index;
    const clearAt = body.indexOf('session.clear()');
    assert.ok(clearAt > 0, 'positive control: this is the function that wipes the session');
    assert.ok(
      bindAt < clearAt,
      'the `const session = loadSession()` binding must sit before session.clear() in this function — a ' +
        'binding declared after the wipe cannot be the session that fed it',
    );
    assert.doesNotMatch(
      body.slice(bindAt, clearAt),
      /\bawait\b|\.then\(|\byield\b/,
      'no await, .then(, or yield may sit between the session binding and session.clear() — any of the ' +
        'three yields control, so by the time clear() runs the session may already be stale, turning its ' +
        'refusal into the same silent discard',
    );
  },
);

// #data-loss — planClear can only judge with what it is handed. The island SETS root.hidden itself when
// a round starts and then never read it back here, so with the checkpoint slot empty (every game but
// siamsi never writes one, and siamsi empties it at round end) one tap on \u0e25\u0e49\u0e32\u0e07\u0e01\u0e25\u0e38\u0e48\u0e21\u0e19\u0e35\u0e49 reloaded the page and took
// the live round with it, unasked. Pins the read AND the pass: a bare mention of root.hidden is dead code.
test('#data-loss requestClear feeds the live-round bit it owns into planClear', () => {
  const body = fnBody('requestClear');
  assert.match(body, /planClear\(/, 'positive control: this really is the clear path');
  assert.match(body, /roundLive = root\.hidden/, 'the live-round bit must be read from the panel');
  assert.match(body, /planClear\([^)]*roundLive/, 'and handed to planClear — a read it never passes is dead');
  const read = body.indexOf('root.hidden');
  const wipe = body.indexOf('session.clear()');
  assert.ok(wipe > 0, 'positive control: this is the function that wipes the session');
  assert.ok(read < wipe, 'the bit must be read before the wipe');
});

// The prompt is the only thing standing between the player and the loss, so it has to name what dies.
// WHICH strings say that is clearCopy's job and is pinned by string equality in player-select.test.mjs
// (three cases: stranded checkpoint, live round, both). What can only be checked here is that the island
// hands clearCopy both signals and paints its answer before the question is on screen.
test('#data-loss the question is worded by clearCopy, from both signals, before it is shown', () => {
  const body = fnBody('requestClear');
  assert.match(body, /clearCopy\(session\.checkpoint, roundLive\)/, 'both signals — either one alone picks the wrong case');
  assert.match(body, /clearChoiceMsg\.textContent = copy\.message/, 'the question takes the copy it was given');
  assert.match(body, /clearConfirmBtn\.textContent = copy\.confirmLabel/, "the button names what it destroys — ADR-0008's rule");
  // both swaps have to land before the question is on screen, or role="alert" announces the stale wording
  const open = body.indexOf('clearChoiceEl.hidden = false');
  assert.ok(open > 0, 'positive control: this is where the question is shown');
  assert.ok(body.indexOf('clearChoiceMsg.textContent') < open, 'the question is re-worded before it is shown');
  assert.ok(body.indexOf('clearConfirmBtn.textContent') < open, 'the button is re-labelled before it is shown');
});

// #data-loss — Astro renders <!-- --> straight into the built page, so a template comment here is English
// engineering prose on all nine pages this island renders on, read by a Thai-first player. It shipped:
// a comment block lost its opener and 9 built pages carried "data-loss: the two strings below are…" plus
// a stray arrow. Both the build and the rest of this suite were blind to it. Brace comments compile away.
test('#data-loss no HTML comment in the template — Astro ships those to the player, in English', () => {
  assert.ok(template.includes('{/*'), 'positive control: the template does carry dev prose, in brace comments');
  assert.equal(template.includes('<!--'), false, 'an HTML comment here is English prose on every built page');
  assert.equal(template.includes('-->'), false, 'a stray arrow renders as text — this is how the shipped one showed up');
});

/** the body of `elementVar.addEventListener('event', () => {...})` in the island script — same
 *  brace-matching as fnBody above, needed because startBtn's handler is an anonymous arrow function
 *  bound via addEventListener, not a `function name(...)` declaration. */
function listenerBody(elementVar, event) {
  // `async` is optional in the needle: addBtn's click handler awaits roster.add(), and a fixed
  // "', () => {" string silently failed to find it rather than reporting a wrong body.
  const needle = new RegExp(`${elementVar}\\.addEventListener\\('${event}',\\s*(?:async\\s*)?\\(\\s*\\)\\s*=>\\s*\\{`);
  const start = script.search(needle);
  assert.ok(start >= 0, `${elementVar}.addEventListener('${event}', ...) not found in the island script`);
  const open = script.indexOf('{', start);
  const close = matchBraceEnd(script, open);
  assert.ok(close >= 0, `unbalanced braces after ${needle}`);
  return script.slice(open + 1, close).replace(/\/\/.*$/gm, '');
}

// matchBraceEnd is exercised on the real island script above, but neither known-broken case (a `}`
// inside a /* */ comment, a stray brace inside a string literal) exists in that source today — so this
// pins the algorithm directly against synthetic input where both are present.
test('matchBraceEnd ignores braces inside /* */ comments and string literals', () => {
  const withComment = "function f() {\n  /* a } inside a comment */\n  return 1;\n}";
  const withString = "function g() {\n  const s = '}';\n  return 2;\n}";
  for (const text of [withComment, withString]) {
    const open = text.indexOf('{');
    const close = matchBraceEnd(text, open);
    assert.equal(close, text.lastIndexOf('}'), `must land on the real closing brace, not a stray one: ${text}`);
  }
});

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
  // #39 — root.hidden = true swallows the panel the moment a round starts, which is exactly when a
  // link click needs to be interceptable; inside the panel this dialog would be unreachable mid-round.
  // gh#106 moved it one layer further out for a second reason: riding on this component at all meant
  // inheriting its render condition, and ADR-0040's [1, 1] pages render no panel, so siamsi,
  // daily-fortune and love-match shipped with no leave-confirm anywhere. It is now its own island,
  // mounted by GameLayout unconditionally — outside the panel by construction, on every game page.
  // The invariant is unchanged; only the file that has to satisfy it moved.
  // Not `insidePanel('leave-confirm')` any more: that helper answers "inside or outside the panel" for
  // an element THIS template declares, and the honest answer now is that it declares none — so the
  // three assertions below pin where it went instead of asking a question with no subject here.
  assert.ok(!template.includes('id="leave-confirm"'), 'this component must not declare the dialog any more — a second declaration collides on the id');
  assert.match(leaveConfirm, /<dialog id="leave-confirm" data-game-id=\{gameId\}>/, 'LeaveConfirm.astro owns the dialog and reads its own gameId');
  assert.match(gameLayout, /^\s*<LeaveConfirm gameId=\{game\.id\} \/>\s*$/m, 'GameLayout must mount it with no render condition — a condition is what excluded the [1, 1] pages');
});

// gh#62 — the clear button used to render on every page behind two gates: `hidden` when the page does
// not clear the session, and a data-clears-session flag the click handler read before doing anything
// destructive. Both are gone, because both were gating a class that can simply not exist. The button is
// not emitted at all on a non-clearing mount: nothing left to un-hide (an author `display` rule cannot
// outrank a UA [hidden] rule that has no element to apply to — the failure this repo already measured
// on #leave-confirm), and no else branch that can never be taken sitting in the handler looking like
// protection.
//
// CEILING (ADR-0019): this is a source-text scan of the template, not a render — it pins the shape that
// makes the button unrenderable on a non-clearing mount, it does not execute Astro. The rendered proof
// is grepping dist/ for the button on the three tool pages, against a game page as the control.
// Comments are stripped first and the negative assertions depend on it: the block above the button
// names both removed gates, so unstripped prose would trip exactly the checks that say they are gone.
test('gh#62 the clear button is not rendered at all when the page does not clear the session', () => {
  const tpl = template.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  // positive control: the needle is live and the button does still exist somewhere in this template —
  // a typo here would make every absence asserted below vacuously green
  const btnAt = tpl.indexOf('id="clear-group"');
  assert.ok(btnAt > 0, 'positive control: the template still carries the clear button');
  const guardAt = tpl.indexOf('{gameId !== undefined &&');
  assert.ok(guardAt > 0, 'the clear button is emitted unconditionally again — every mount ships it');
  assert.ok(
    btnAt > guardAt && btnAt < matchBraceEnd(tpl, guardAt),
    'the clear button must sit inside the {gameId !== undefined && …} guard, so a mount with no game emits no #clear-group at all',
  );
  // gh#65 — the comparison is the assertion, not decoration. `{gameId && …}` would drop the button on an
  // empty-string game id: the template would withhold it while every island gate (`gameId === undefined`)
  // still read that page as a game page, and the two halves of the partition would disagree in silence.
  assert.doesNotMatch(
    tpl,
    /\{gameId &&/,
    'truthiness splits the empty-string game id away from the island gates that read the same bit — the comparison must stay explicit',
  );
  assert.equal(
    tpl.includes('data-clears-session'),
    false,
    'the dataset gate is dead once the button cannot exist on a non-clearing page — removed, not left as decoration',
  );
  // attribute-order independent: extract the clear-group tag itself (from its opening `<` to its own
  // closing `>`) and search inside that slice, rather than anchoring a regex on id="clear-group" coming
  // BEFORE hidden — `<button hidden id="clear-group">` means exactly the same thing as
  // `<button id="clear-group" hidden>` and must not pass this needle just because hidden moved first.
  const clearTagStart = tpl.lastIndexOf('<', btnAt);
  const clearTagEnd = tpl.indexOf('>', btnAt);
  assert.ok(clearTagStart >= 0 && clearTagEnd > clearTagStart, 'positive control: the clear-group tag parses');
  assert.doesNotMatch(
    tpl.slice(clearTagStart, clearTagEnd + 1),
    /\bhidden\b/,
    'hidden is not the gate any more — a rendered-but-hidden button is one author CSS rule from being ' +
      'pressable, in any attribute order',
  );
  // the clearing mount, read from the real caller rather than assumed: a game page mounts this component
  // WITH a game id, and under gh#65 that is the whole of what keeps the button and the clear-and-reload
  // path behind it. (VOID-BY-FIX, ADR-0023: the two assertions here used to pin the opposite mechanism —
  // that this mount passes no clearsSession and takes the `= true` default. gh#65 deleted that prop, so
  // both were pinning a shape that no longer exists.)
  const mount = gameLayout.match(/<PlayerSetup\b[^>]*\/>/);
  assert.ok(mount, 'positive control: the game layout still mounts this component');
  assert.match(mount[0], /gameId=/, 'a game page must pass gameId — that is now the only thing that keeps its clear button');
  assert.doesNotMatch(
    tpl,
    /clearsSession/,
    'the prop is gone entirely (gh#65), interface and destructuring included — a mount still passing it must fail astro check loudly, not be ignored in silence',
  );
});

// gh#65 — clearsSession is gone. It defaulted to `true`, so a tool page was protected only for as long
// as its author remembered to pass `false`: a new page copied from team.astro without it shipped a fully
// armed session wipe onto a page ADR-0004 forbids to touch the session, and nothing failed or warned.
// The button is derived from `gameId !== undefined` now — the same bit ADR-0027's collapse window and
// the leave-confirm already key on, and the bit a tool page cannot supply, because it has no game to
// name. Protection by omission instead of protection by remembering.
//
// So THIS is the load-bearing assertion of that shape, and it reads every .astro under src/pages/tool/
// rather than the three that exist today. Calibrated by mutation: a gameId added to draw.astro reds it
// by name, and so does one added under a subdirectory, or split across lines.
//
// The mount regex has to catch four shapes, not one: self-closing (`<PlayerSetup .../>`), paired
// (`<PlayerSetup ...></PlayerSetup>`), and either of those split across multiple lines. `[\s\S]*?>`
// (non-greedy, dot-matches-newline) stops at the FIRST `>` after the tag opens — which is the closing
// `/>` on a self-closing mount and the end of the opening tag on a paired one, on one line or several.
// It cannot tell those two shapes apart, and does not need to: gameId lives in the opening tag either way.
//
// gh#91 flipped the positive control from "some tool page mounts" to "none does": the three name tools
// took their own panel (ToolNameEntry) and left the shared roster (ADR-0039), so an absent mount is the
// truth now, and a training-wheels mount copied back onto a tool page is the regression — the shell
// panel writes the group store on start, which is exactly what the tools must never do again. The
// proof the needle still works moves to the game layout, which mounts the component for real: the zero
// counted below is a zero the same regex measured, not one it stopped seeing.
test('gh#65 no mount under src/pages/tool/ passes a gameId — and no tool page mounts the shell panel at all', () => {
  assert.ok(toolPages.length >= 1, `positive control: the tool pages are readable, found ${toolPages.length}`);
  let mounts = 0;
  for (const [name, source] of toolPages) {
    for (const m of source.matchAll(/<PlayerSetup\b[\s\S]*?>/g)) {
      mounts += 1;
      assert.doesNotMatch(
        m[0],
        /gameId/,
        `${name} mounts PlayerSetup with a gameId — that mount now renders a fully armed clear button ` +
          '(session.clear, saveGroup([]), reload) on a page ADR-0004 forbids to touch the session',
      );
    }
  }
  assert.equal(
    mounts,
    0,
    'gh#91: every name tool mounts its own panel — a PlayerSetup mount on a tool page writes the shared ' +
      'group store again (ADR-0039)',
  );
  const layoutMounts = gameLayout.match(/<PlayerSetup\b[\s\S]*?>/g);
  assert.ok(
    layoutMounts && layoutMounts.length >= 1,
    'positive control: the mount needle still matches the game layout, so the zero above is measured, not vacuous',
  );
});

// gh#96 / ADR-0040 — a page declaring [1, 1] has no "วง", so the whole setup panel is skipped for it.
// The guard must key on the module's own declared range (the validator already closes the shape to
// [1, 1] or a party range), never on a page-id list: an id list grows with every new solo page and
// never converges, which is the failure the ticket rules out by name.
test('gh#96 the setup panel is not rendered for a page declaring a party of one', () => {
  const layout = gameLayout.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  assert.ok(layout.includes('game.players[0]'), 'positive control: the layout still reads the declared range');
  const guardAt = layout.indexOf('{(game.players[0] !== 1 || game.players[1] !== 1)');
  assert.ok(guardAt >= 0, 'the panel mount is rendered unconditionally — a [1, 1] page still gets a setup panel');
  const open = layout.indexOf('{', guardAt);
  const close = matchBraceEnd(layout, open);
  assert.ok(close > open, 'positive control: the guard expression parses');
  const mountAt = layout.indexOf('<PlayerSetup', guardAt);
  assert.ok(
    mountAt > open && mountAt < close,
    'the PlayerSetup mount must sit inside the declared-range guard — a mount left outside it (or a guard keyed on an id list) renders the panel on a solo page',
  );
});

// gh#96 / ADR-0040 — with the panel gone, the one dispatcher of "watduang:start" (requestStart) is
// gone too, so a page declaring [1, 1] never mounts unless it mounts its module itself. That mount
// must be direct: a fake start event carries a fake one-person roster, which routes a non-"เกม" through
// the round machinery (setPlayers, planStart, the roster pill) ADR-0040 just removed it from.
test('gh#96 a solo page mounts its module directly — never through the start event or a round write', () => {
  // No whole-file comment strip here: the import-meta glob strings in this file contain "/*", which a
  // textual block-comment stripper pairs with the CSS block's real "*/" far below and blanks half the
  // script. matchBraceEnd is comment-aware, so the branch extraction below needs no stripper at all,
  // and the branch's own comments carry none of the tokens the negative assertions hunt for.
  const code = gamePage;
  assert.match(
    code,
    /const isSolo = stage\.dataset\.players === '1,1'/,
    'no branch reads the declared range off the stage — every page would mount, or none would',
  );
  const soloAt = code.indexOf('if (isSolo)');
  assert.ok(soloAt >= 0, 'the solo mount branch is gone — the page has no path that does not wait for the panel');
  const open = code.indexOf('{', soloAt);
  const close = matchBraceEnd(code, open);
  assert.ok(close > open, 'positive control: the solo branch parses');
  const branch = code.slice(open + 1, close);
  assert.match(branch, /game\.mount\(stage,/, 'the solo branch must call the module mount itself');
  assert.doesNotMatch(branch, /watduang:start/, 'the solo path must not dispatch the start event — that is the panel\'s exit, and the panel does not exist here');
  assert.doesNotMatch(branch, /setPlayers/, 'the solo path must not write a round roster — ADR-0040 took the round machinery off the ดูดวง หมวด');
  // This page never dispatches "watduang:start" itself — the panel owns the dispatch, and with the
  // panel absent on a solo page there is nothing left to dispatch it. So exactly zero dispatch sites
  // may exist here (the solo branch must not add one), while the party path's listener stays.
  assert.equal(
    code.split("dispatchEvent(new CustomEvent('watduang:start'").length - 1,
    0,
    'this page dispatches the start event — the dispatch belongs to the panel alone, and a dispatch here would synthesize starts the panel never produced',
  );
  assert.match(
    code,
    /document\.addEventListener\('watduang:start'/,
    'positive control: the party-path start listener is gone — สุ่มคนโดน pages still mount through it',
  );
  // The topbar pill counts the "วง" a start event produced; a solo page starts nothing, so it must not
  // seed from the site-wide party session (a persisted party group is not this page's "วง").
  assert.match(
    code,
    /if \(!isSolo\) showRosterCount\(/,
    'the roster pill seed is not gated on the solo bit — a solo page would advertise a party group',
  );
});

// gh#62 — with the button unrendered, every read of it is a null, and the shape of the guard decides
// which way that null falls. `clearBtn?.dataset.clearsSession !== 'no'` evaluates to TRUE through a
// missing button, so keeping the old gate as "defence in depth" would fail OPEN and run the destructive
// path on exactly the pages it was written to protect. The guard is the element itself. requestClear has
// two callers and both are wired inside that check, so an unemitted button makes the whole path
// unreachable — including location.reload(), which sat past the old gate and is the one effect a tool
// page could ever have had (it discards the wheel's eliminated players, the draw pool, a team split).
test('gh#62 the clear path is reachability-guarded on the button existing, never on a flag read off it', () => {
  const code = script.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.match(
    code,
    /const clearBtn = document\.getElementById\('clear-group'\)/,
    'positive control: the island still queries the clear button',
  );
  assert.match(code, /as HTMLButtonElement \| null/, 'clearBtn is typed nullable, so astro check refuses any unguarded use');
  assert.match(code, /if \(clearBtn\) \{/, 'the clear wiring sits behind an existence check');
  assert.doesNotMatch(code, /clearBtn\?\./, 'optional chaining reads true through a missing button — the fail-OPEN trap');
  assert.doesNotMatch(code, /dataset\.clearsSession/, 'a branch whose else can never be taken is not protection');
  const guardOpen = code.indexOf('if (clearBtn) {');
  const guardEnd = matchBraceEnd(code, code.indexOf('{', guardOpen));
  assert.ok(guardEnd > guardOpen, 'positive control: the existence check parses');
  const calls = [...code.matchAll(/requestClear\((?:true|false)\)/g)].map((m) => m.index);
  assert.equal(calls.length, 2, 'positive control: both callers of requestClear are still here (the button, and the confirm)');
  for (const at of calls) {
    assert.ok(
      at > guardOpen && at < guardEnd,
      'every requestClear caller must sit inside the existence check — one left outside keeps the destructive path ' +
        'reachable on a page that never rendered the button that opens it',
    );
  }
});

// gh#54 — requestStart hides the panel unconditionally, and nothing in THIS file ever puts it back:
// root.hidden = true is written once, root.hidden = false never. That is fine while the round mounts
// and a dead end when it does not, because root.hidden is also the liveness bit planClear is handed
// (the test above this one). A failed mount then left an empty stage, no panel, and Clear group as the
// only control on screen — the one whose confirm runs saveGroup([]) and takes the group with it.
// The way back lives in the other file, so this pins the pair: the hide here, the un-hide there.
//
// Structural, and it is worth saying what that does and does not buy. It cannot prove the catch
// actually fires — that was measured in a browser against a real build, with the game chunk replaced
// so that `await load()` rejected on one page and `game.mount()` threw on another: #start-round came
// back with 1 client rect and answered elementFromPoint, against 0 rects on the same build with the
// catch body removed. What this pins is that the pair does not silently come apart at the next edit.
test('gh#54 the panel is hidden on start in this file and put back by the game page when the mount fails', () => {
  // calibration: the hide is real and unconditional, so a missing un-hide is a genuine dead end
  assert.match(script, /root\.hidden = true/, 'requestStart no longer hides the panel — this pair moved');
  assert.ok(!/root\.hidden = false/.test(script), 'the panel now un-hides itself; this test is watching the wrong file');

  const handler = gamePage.slice(gamePage.indexOf("'watduang:start'"));
  assert.ok(handler.includes('catch'), 'the mount path has no catch — a failed mount strands the panel again');
  assert.match(
    handler,
    /getElementById\('player-setup'\)[\s\S]{0,200}?hidden = false/,
    'the failed-mount path no longer puts the setup panel back',
  );
});

// gh#61 — the same hide, measured from below. [hidden] is display:none, so the panel leaves the flow on
// the tap that starts the round and everything under it rises by the panel's own height while the
// finger is still coming down. On /tool/team/ at a real 320px viewport, roster of 4: the CTA's own box
// answered elementFromPoint with a real <a href="/game/timebomb/"> after a real touch, and the nav rose
// 352px.
//
// The first fix held the panel's BOX — visibility:hidden over a display value read back off the element
// — and it did remove the movement: 40 of 75 colliding grid points went to 0. It also left the tool's
// own result under a permanent empty panel-sized gap at 320px, and the site owner ruled that
// unacceptable. So the panel collapses again, and neither half of that hold may come back; this test
// names both halves rather than only the branch, because either one alone would restore the gap.
//
// What replaces it is ADR-0016's window — the shape this repo already ships in src/games/_arm-gate.ts
// for the same class of harm: classify nothing, disable everything for a fixed window we own. Only the
// surface differs, and it differs because the hazard does: an <a href> in page chrome cannot be
// `disabled` the way a stage button can, so the activation is swallowed document-wide in the capture
// phase instead. Shared with the games: the constant, and the restart-on-contact leg that makes the
// window fail closed. Worst case is one swallowed tap and the player taps again; the box-holding fix
// cost every player a screenful of blank space, and the unguarded collapse costs the whole round.
//
// The gate stays `gameId === undefined` — the same bit the leave-confirm listener reads to decide it
// has nothing to guard. That is what makes the two exhaustive rather than merely adjacent: a page WITH
// a game has that dialog in front of every link while root.hidden; a page without one can never reach
// the dialog and gets the window instead. No page falls in neither set.
//
// The polarity is what this test is really for. Inverted, every game page would swallow its own
// post-start taps while the tool pages went back to handing out a free navigation — and gh#61's
// acceptance scan only re-reads the tool pages, so nothing in that ticket would have noticed.
test('gh#61 a page with no game swallows activations for one shared window after it collapses', () => {
  const body = fnBody('requestStart');
  assert.match(body, /root\.hidden = true/, 'positive control: this is still the path that hides the panel');

  const at = body.indexOf('if (gameId === undefined)');
  assert.ok(at >= 0, 'the swallow branch is gone, or is no longer gated on this page having no game');
  const open = body.indexOf('{', at);
  const branch = body.slice(open + 1, matchBraceEnd(body, open));

  // The reverted fix, refused by name in the whole island rather than in this branch: moving those two
  // lines anywhere else in the file would reintroduce the same blank gap and still pass a branch-scoped
  // check. The panel must collapse, so nothing may hold its box.
  assert.doesNotMatch(script, /style\.visibility/, 'the panel must collapse — holding its box left a permanent gap above the tool result');
  assert.doesNotMatch(script, /getComputedStyle\(root\)/, 'reading the display back is half of the box-holding fix; it has no other caller');

  // Both activation events, both in the capture phase, both on document. click is what an anchor
  // navigates on; pointerdown is what restarts the window, and capture on document is the only place
  // that sees a tap on chrome this island does not own (the same reason the leave-confirm listener
  // below is global rather than scoped to a stage).
  for (const type of ['click', 'pointerdown']) {
    assert.match(
      branch,
      new RegExp(`document\\.addEventListener\\('${type}', \\w+, true\\)`),
      `the window must swallow ${type} document-wide in the capture phase`,
    );
    assert.match(
      branch,
      new RegExp(`document\\.removeEventListener\\('${type}', \\w+, true\\)`),
      `the window must release ${type} again — a swallow with no release is a page that never accepts a tap`,
    );
  }

  // The swallow itself: stop the navigation, and stop it reaching anything else. preventDefault alone
  // leaves the tool's own controls firing under the ghost; stopPropagation alone leaves the anchor.
  assert.match(branch, /preventDefault\(\)/, 'the swallowed activation must not perform its default action');
  assert.match(branch, /stopPropagation\(\)/, 'the swallowed activation must not reach a listener either');

  // Restart-on-contact, the leg that makes it fail closed: contact inside the window pushes the release
  // out rather than being counted. Two setTimeout calls — one arms the window, one is inside the
  // handler.
  assert.ok(
    [...branch.matchAll(/setTimeout\(/g)].length >= 2,
    'contact during the window must restart it, not be swallowed while the original release runs on',
  );
  assert.match(branch, /clearTimeout\(/, 'a restart that does not clear the pending release closes the window early');

  // One constant, shared with the games, never a second literal that can drift from it.
  assert.ok(ARM_DELAY_MS > 0, 'positive control: the shared window is a real duration');
  assert.match(script, /import \{ ARM_DELAY_MS \} from '\.\.\/games\/_arm-gate'/, 'the window length comes from the shared module');
  assert.match(branch, /ARM_DELAY_MS/, 'the branch must use the shared constant');
  assert.ok(
    !/setTimeout\([^,]+,\s*\d/.test(branch),
    'a numeric window here would drift from the one the games gate on, and ADR-0016 owns that number',
  );

  // Exactly ONE document click listener in this island — this window — and it is inside this branch.
  // It was two until gh#106 moved #39's leave-confirm into LeaveConfirm.astro; the pair is still
  // counted, one per island, because the hazard is unchanged: a second listener here, or this one
  // outside the branch, is a game page swallowing its own post-start taps.
  assert.equal(
    [...script.matchAll(/document\.addEventListener\('click'/g)].length,
    1,
    'positive control: this island installs exactly one document click listener — the no-game window',
  );
  assert.equal(
    [...leaveConfirm.matchAll(/document\.addEventListener\('click'/g)].length,
    1,
    'positive control: the leave-confirm island installs exactly one document click listener of its own',
  );
  assert.equal(
    [...branch.matchAll(/document\.addEventListener\('click'/g)].length,
    1,
    'the window must be installed inside the no-game branch, nowhere else',
  );

  assert.ok(
    !branch.includes('root.hidden = true'),
    'root.hidden = true moved inside the no-game branch — a game page would stop collapsing at all',
  );
  assert.ok(
    at > body.indexOf('root.hidden = true'),
    'the window must be armed after the collapse — armed before it, the collapse itself has not happened yet',
  );
});

// --- gh#54's last box: a failed mount now says so, in the site owner's words ---------------------
//
// The game page owns the mount, the panel owns showError, and showError is module-scoped inside the
// island — so the notice has to cross the island boundary. The only channel that exists between them
// is a CustomEvent on document, which the panel already dispatches outbound to begin a round; this is
// that same channel run the other way. The string below is the site owner's, chosen under gh#25, and
// is pinned byte for byte on purpose: an agent must not write or edit player-facing copy, and a
// paraphrase here would be doing exactly that.
const MOUNT_FAILED_EVENT = 'watduang:mount-failed';
const MOUNT_FAILED_COPY =
  'รอบนี้ยังไม่ได้เริ่ม — เปิดเกมไม่สำเร็จ ชื่อที่เลือกไว้ยังอยู่ครบ กดเริ่มรอบอีกครั้งได้เลย';

test('gh#54 a failed mount is told to the player in #setup-error, through the panel own showError', () => {
  const listener = listenerBody('document', MOUNT_FAILED_EVENT);
  const call = listener.match(/showError\('([^']*)'\)/);
  assert.ok(call, 'the notice must go through showError — the one function that owns the notice node');
  assert.equal(call[1], MOUNT_FAILED_COPY, 'the owner-chosen string, verbatim — not a paraphrase');
  // The slot is #setup-error, the owner's choice, and showError is what binds the two: a showError that
  // wrote some other node would satisfy the assertion above while painting nothing where it was asked.
  assert.match(
    script,
    /const errorEl = document\.getElementById\('setup-error'\)/,
    'showError writes errorEl, and errorEl must still be #setup-error',
  );
  assert.match(fnBody('showError'), /errorEl\.textContent = text/, 'positive control: showError paints errorEl');
});

// Both unwind paths land in the same catch, at different times, and only one of them has already had
// requestStart's own root.hidden = true applied by the time it does. First load: `await load()`
// suspends, so the catch resumes in a microtask long after requestStart returned. Second start of the
// same page: the module is cached, nothing in the try awaits, and the throw is caught SYNCHRONOUSLY
// inside dispatchEvent — the stack is still inside requestStart, which hides the panel again on the
// way out. So the notice has to be deferred with the un-hide, in the same microtask and after it.
// Dispatched any earlier on that second path it drops the alert node's hidden attribute while the
// panel around it is about to be swallowed, and role="alert" announces into a screen nobody can see —
// gh#54's own state, one retry deep. One dispatch site, inside that callback, is what makes the two
// paths identical; a second site anywhere in this file is the sync-paint bug wearing a deferral.
test('gh#54 the notice is dispatched inside the microtask that puts the panel back, after the un-hide', () => {
  const handler = gamePage.slice(gamePage.indexOf("'watduang:start'"));
  const catchAt = handler.indexOf('catch {');
  assert.ok(catchAt > 0, 'positive control: the mount path still has a catch');
  const catchOpen = handler.indexOf('{', catchAt);
  const catchBody = handler.slice(catchOpen + 1, matchBraceEnd(handler, catchOpen));

  const mtAt = catchBody.indexOf('queueMicrotask(');
  assert.ok(mtAt >= 0, 'the restore is no longer deferred — the synchronous catch re-hides the panel over it');
  const mtOpen = catchBody.indexOf('{', mtAt);
  const mtBody = catchBody.slice(mtOpen + 1, matchBraceEnd(catchBody, mtOpen));

  const unhide = mtBody.indexOf('panel.hidden = false');
  const notify = mtBody.indexOf(MOUNT_FAILED_EVENT);
  assert.ok(unhide >= 0, 'positive control: this is the callback that puts the panel back');
  assert.ok(notify >= 0, 'the notice must be dispatched from inside that same callback, not from the catch body');
  assert.ok(
    unhide < notify,
    'the panel comes back first, then the notice — showError drops hidden to announce, and a hidden panel ' +
      'announces nothing',
  );
  assert.equal(
    gamePage.split(MOUNT_FAILED_EVENT).length - 1,
    1,
    'exactly one dispatch site in this file — a second one outside the microtask is the race back',
  );
});

// A mount that works must leave the panel silent, so the notice has to be unreachable from the success
// path: dispatched from inside the catch and nowhere else, and said by the panel in one place only.
test('gh#54 a successful mount says nothing — the dispatch sits inside the catch, and the panel says it once', () => {
  const catchOpen = gamePage.indexOf('{', gamePage.indexOf('catch {'));
  const catchClose = matchBraceEnd(gamePage, catchOpen);
  assert.ok(catchClose > catchOpen, 'positive control: the catch block parses');
  const notify = gamePage.indexOf(MOUNT_FAILED_EVENT);
  assert.ok(notify > 0, 'positive control: the page does notify the panel');
  assert.ok(
    notify > catchOpen && notify < catchClose,
    'the dispatch must sit inside the catch — anywhere else and a round that started fine reports a failure',
  );
  assert.equal(
    script.split(MOUNT_FAILED_COPY).length - 1,
    1,
    'the panel says the failure string in exactly one place',
  );
  assert.ok(
    listenerBody('document', MOUNT_FAILED_EVENT).includes(MOUNT_FAILED_COPY),
    'and that one place is the listener for the failure event',
  );
});

// Found in pre-merge review of gh#54: the clear sat BELOW the 'ask' early return, so the one route that
// opens a question could not reach it. Mount fails → the notice paints → the player presses "Player N"
// (startNumberedBtn clears nothing of its own) → planStart says 'ask' → #resume-choice opens underneath a
// notice that is still on screen. The over-max warning reaches it by the same route and predates gh#54.
// showError covers the mirror case itself (a warning it paints closes an open question, #23); this is the
// direction it cannot cover, because requestStart is what opens the question.
test('#23 requestStart clears the notice BEFORE the resume question opens — the two never share the screen', () => {
  const body = fnBody('requestStart');
  const clear = body.indexOf("showError('')");
  const ask = body.indexOf('resumeChoiceEl.hidden = false');
  assert.ok(clear >= 0, 'requestStart no longer clears the notice — a stale warning now outlives every start');
  assert.ok(ask > 0, 'positive control: this is the branch that puts the question on screen');
  // calibration: the branch really does return past everything below it, which is what makes order matter
  assert.ok(body.indexOf('return;', ask) > ask, 'positive control: the ask branch returns');
  assert.ok(
    clear < ask,
    'the clear sits below the ask branch, so a failed mount or an over-max warning is still on screen ' +
      'when #resume-choice opens under it',
  );
});

// gh#133 — the island script cannot be imported, so this reads its source the same way the rest of
// this file does. The behaviour is pinned in src/tools/name-list.test.mjs and src/shell/roster.test.mjs;
// what is pinned HERE is that this handler consults the shared predicate itself. roster.add() already
// refuses a blank, but this handler does four more things after awaiting it — selected.add(name),
// clearing the input, clearing the error, re-rendering — so relying on add()'s silent refusal alone
// would tick a player into the group and report success for a name that was never stored.
test('#133 the add button rejects a name with no visible character before anything acts on it', () => {
  const body = listenerBody('addBtn', 'click');
  // positive control: the handler really is the one that adds, so a body that matched nothing below
  // would not be quietly green
  assert.match(body, /roster\.add\(name\)/, 'positive control: this handler is the one that adds to the roster');

  assert.match(body, /hasVisibleChar\(name\)/, 'the add handler must gate on hasVisibleChar, not on a falsy trim() result');
  assert.doesNotMatch(body, /if \(!name\) return/, 'the bare `if (!name)` guard is the defect: trim() leaves U+200B and U+2060 standing');

  const guard = body.indexOf('hasVisibleChar');
  for (const after of ['roster.add(name)', 'selected.add(name)', "addNameInput.value = ''"]) {
    assert.ok(guard < body.indexOf(after), `the guard must run before ${after}`);
  }
  assert.match(
    script,
    /import \{ hasVisibleChar \} from '\.\.\/tools\/name-list(\.ts)?'/,
    'and it must be the ONE shared predicate, imported — not a second copy of the rule',
  );
});
