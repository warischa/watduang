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
// read once: gh#54 pins a PAIR — the hide lives in the island above, the way back lives on the game page
const gamePage = readFileSync(new URL('../pages/game/[id].astro', import.meta.url), 'utf8');

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
// a round starts and then never read it back here, so with the checkpoint slot empty (five of six games
// never write one, and siamsi empties it at round end) one tap on \u0e25\u0e49\u0e32\u0e07\u0e01\u0e25\u0e38\u0e48\u0e21\u0e19\u0e35\u0e49 reloaded the page and took
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
  const needle = `${elementVar}.addEventListener('${event}', () => {`;
  const start = script.indexOf(needle);
  assert.ok(start >= 0, `${needle} not found in the island script`);
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
  assert.equal(insidePanel('leave-confirm'), false, 'the leave-confirm dialog must stay reachable mid-round');
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
