// Two invariants for the shared mascot cast (issue #152):
//
//   1. ONE definition. src/play/_mascots.ts is it. One copy still exists outside that file --
//      src/play/freeze-tap/main.js declares MASCOT_PLAYERS inline -- and it stays there because that
//      file is a verbatim mockup lift whose thai-comments exemption is keyed to its basename, so an
//      import in it would weaken the claim that it is unmodified. This file pins the two row for row
//      instead: a drift between them is a red test, not a silent divergence.
//
//   2. A play route that renders the numbered default opens with the cast instead. Driven through
//      power-meter's REAL setup functions, sliced out of its main.js by source text and evaluated
//      (the same idiom as name-escaping.test.mjs and short-stick/fairness.test.mjs), because every
//      main.js is a lifted IIFE with no exports. The numbered default the fix has to displace is
//      therefore the mockup's own bytes, not a string this test invented -- if the mockup ever stops
//      rendering it, the slice or the pre-state assertion fails loudly rather than passing on nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MAX_PLAYERS } from '../games/cursed-number.ts';
import { FakeElement, makeDocument } from '../games/_fake-dom.mjs';
import { MASCOTS, applyMascotDefaults, mascotNames, resetCastNames } from './_mascots.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
// SCOPE (gh#189, owner ruling 2026-09-01): this pattern -- and the sibling one further down that scans
// markup.html -- is about PLAYER IDENTITY only. It matches "ผู้เล่น" (player) followed by a number,
// never a bare digit on its own. A turn-order badge, a shot counter, or any other numbered placeholder
// that is not naming a player (cannon-flag's "position 1 of 4", "shot 1 of 2") is explicitly allowed
// and outside what either scan checks. Do not read a green here as "no numbered placeholder anywhere".
const NUMBERED = /^ผู้เล่น\s*\d+$/;

/** Same brace-walking slice as name-escaping.test.mjs: take a declaration out of a main.js by text. */
function sliceDecl(source, name) {
  for (const decl of [`function ${name}(`, `const ${name} = `]) {
    const start = source.indexOf(decl);
    if (start === -1) continue;
    const open = source.indexOf('{', start);
    if (open === -1) continue;
    let depth = 0;
    for (let i = open; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1;
      else if (source[i] === '}') {
        depth -= 1;
        if (depth === 0) return source.slice(start, i + 1);
      }
    }
  }
  return null;
}

test('the cast in _mascots.ts is row-for-row the freeze-tap mockup array', () => {
  const source = fs.readFileSync(path.join(here, 'freeze-tap', 'main.js'), 'utf8');
  // sliceDecl walks braces, and this declaration is an ARRAY of them -- take it bracket to bracket.
  const start = source.indexOf('const MASCOT_PLAYERS = [');
  assert.notEqual(start, -1, 'freeze-tap/main.js no longer declares MASCOT_PLAYERS -- this test is measuring nothing');
  const block = source.slice(start, source.indexOf('];', start));
  const rows = [...block.matchAll(/defaultName:\s*'([^']+)',\s*emoji:\s*'([^']+)'/g)]
    .map((m) => ({ emoji: m[2], name: m[1] }));
  // A parse that silently matched nothing would deepEqual an empty MASCOTS and read as a pass.
  assert.equal(rows.length, 20, 'parsed the wrong number of mockup rows');
  assert.deepEqual([...MASCOTS], rows);
});

// mascotNames wraps past the end of the cast rather than handing back undefined, so a cast SHORTER
// than the largest seat count a route allows seats two players under the same animal -- silently, and
// only at the top of the range where nobody tests. The row-for-row test above already reds if MASCOTS
// alone shrinks; what it cannot see is the seat cap GROWING past a cast that never moved. Couple the
// two constants here so either side moving is a red, and never re-pin the literal 20 (gh#173, REFUTE).
test('the cast is at least as long as the largest seat count any route allows', () => {
  assert.ok(
    MASCOTS.length >= MAX_PLAYERS,
    `mascotNames would wrap: ${MASCOTS.length} mascots for up to ${MAX_PLAYERS} seats, so the last players open sharing an animal with the first`,
  );
});

test('power-meter opens with the animal cast, not the numbered default', () => {
  const source = fs.readFileSync(path.join(here, 'power-meter', 'main.js'), 'utf8');
  const doc = makeDocument();
  const viewRoot = new FakeElement('div', doc);
  doc.body = viewRoot;
  doc.querySelectorAll = (sel) => viewRoot.querySelectorAll(sel);

  const game = { players: [], playerCount: 4 };
  // gh#175 routed the seat default through `defaultName`. It CANNOT be sliced in: sliceDecl walks
  // braces, and `const defaultName = (i) => ...` is a brace-less arrow, so the walk runs on and
  // swallows the `const game = {` that follows it -- which collides with the `game` stub below.
  // So it is stubbed for execution, and pinned by source separately, immediately after this block.
  // Between them the two cover what one slice would have: the stub uses the REAL `mascotNames`, so
  // what reaches the inputs is the real cast, and the pin proves the route asks the cast for it.
  const parts = ['goToSetupNames', 'escapeHtml', 'renderSetupNamesView'].map((name) => {
    const slice = sliceDecl(source, name);
    assert.ok(slice, `power-meter/main.js no longer declares ${name}`);
    return slice;
  });
  const stubs = {
    game,
    viewRoot,
    document: doc,
    // `const GameState = Object.freeze({...})` does not brace-slice, and its values echo its keys.
    GameState: new Proxy({}, { get: (_t, k) => k }),
    soundSynth: new Proxy({}, { get: () => () => {} }),
    PLAYER_AVATARS: ['A', 'B', 'C', 'D'],
    PLAYER_COLORS: ['#111', '#222', '#333', '#444'],
    // Built on the REAL `mascotNames` imported at the top of this file, never on a literal list, so
    // the names that reach the inputs below are the actual cast. The route's own one-liner is held
    // to this shape by the source pin that follows this test.
    defaultName: (i) => mascotNames(i + 1)[i],
    renderUI: () => {},
    announceSR: () => {},
  };
  const keys = Object.keys(stubs);
  // eslint-disable-next-line no-new-func -- the whole point is to execute the mockup's own text.
  const api = new Function(
    ...keys,
    `${parts.join('\n;\n')}\n;return { goToSetupNames, renderSetupNamesView };`,
  )(...keys.map((k) => stubs[k]));

  api.goToSetupNames();
  api.renderSetupNamesView();

  // The fake parses markup into attributes; a browser exposes those as properties. Map them, so the
  // code under test reads `.value`/`.maxLength` exactly as it does on a real input.
  const inputs = viewRoot.querySelectorAll('.name-input');
  assert.equal(inputs.length, 4, 'the mockup did not render its four name inputs');
  for (const el of inputs) {
    el.value = el.getAttribute('value') ?? '';
    el.maxLength = Number(el.getAttribute('maxlength') ?? 0);
    el.dispatchEvent = () => true;
  }

  // gh#175 INVERTED what this test watches. It used to assert the mockup rendered `ผู้เล่น 1..4` and
  // that applyMascotDefaults then converted them. The route no longer produces a numbered default at
  // all -- it asks the cast directly -- so that old positive control is now false BY DESIGN, and
  // keeping it would have made this test demand the very bug gh#175 removed.
  // What is pinned instead is stronger: the cast arrives with no conversion step at all.
  // Positive control retained in a form that can still fail: a run where the mockup rendered blanks
  // or seat numbers reds on the deepEqual below, because both differ from the cast.
  assert.deepEqual(
    inputs.map((el) => el.value),
    MASCOTS.slice(0, 4).map((m) => m.name),
    'power-meter no longer seeds its own name fields from the cast — check defaultName in main.js',
  );
  for (const el of inputs) assert.ok(!NUMBERED.test(el.value), `still numbered: ${el.value}`);

  // applyMascotDefaults still runs on this route through its roster-bridge, so it is exercised here
  // for the property that now matters: it must be a NO-OP over names that are already the cast.
  // Before gh#175 this call did the work; now it must be able to run and change nothing.
  const before = inputs.map((el) => el.value);
  const saved = globalThis.document;
  globalThis.document = doc;
  try {
    applyMascotDefaults('.name-input');
  } finally {
    globalThis.document = saved;
  }

  assert.equal(inputs[0].value, 'แมวส้ม');
  assert.deepEqual(inputs.map((el) => el.value), before, 'applyMascotDefaults rewrote cast names');
});

// The other half of the test above. `defaultName` is STUBBED there (sliceDecl walks braces and this
// is a brace-less arrow, so slicing it swallows the `const game = {` that follows). A stub can drift
// from the thing it stands for, so this pins the route's own one-liner by source: the stub is only
// honest while main.js really does ask the shared cast. Remove the import or hand-roll a list here
// and this reds, even though every assertion above would still pass.
test('power-meter asks the shared cast for its seat default, rather than carrying its own list', () => {
  const source = fs.readFileSync(path.join(here, 'power-meter', 'main.js'), 'utf8');
  assert.match(
    source,
    // The index must be the SAME identifier the arrow takes, not merely word-shaped: `\[\w+\]` also
    // matches `mascotNames(i + 1)[0]`, which names every seat "แมวส้ม" and would pass both this pin
    // and the exec test above (that one runs the stub, not this arrow). Backreferenced instead.
    /const defaultName = \((\w+)\) => mascotNames\(\1 \+ 1\)\[\1\]/,
    'power-meter/main.js no longer derives defaultName from mascotNames — the stub in the test above ' +
      'now stands for something that does not exist, so that test is measuring its own fixture',
  );
  assert.match(
    source,
    /import \{[^}]*mascotNames[^}]*\} from '\.\.\/_mascots\.ts'/,
    'power-meter/main.js stopped importing mascotNames from the shared cast module',
  );
});

test('a name the roster already seeded is never overwritten', () => {
  const doc = makeDocument();
  const root = new FakeElement('div', doc);
  doc.body = root;
  doc.querySelectorAll = (sel) => root.querySelectorAll(sel);
  root.innerHTML = '<input class="name-input" maxlength="16"><input class="name-input" maxlength="16">';
  const inputs = root.querySelectorAll('.name-input');
  for (const el of inputs) {
    el.maxLength = 16;
    el.dispatchEvent = () => true;
  }
  inputs[0].value = 'ป๋อง';
  inputs[1].value = 'ผู้เล่น 2';

  const saved = globalThis.document;
  globalThis.document = doc;
  try {
    applyMascotDefaults('.name-input');
  } finally {
    globalThis.document = saved;
  }

  assert.equal(inputs[0].value, 'ป๋อง');
  assert.equal(inputs[1].value, MASCOTS[1].name);
});

// The branch that actually runs on two of the three routes: power-meter renders its name fields only
// after the count screen, short-stick only after its hero, so the first synchronous pass finds
// nothing and everything depends on the observer. Node has no MutationObserver, so the test supplies
// one and drives its callback -- what is pinned here is the state machine (fill on every render,
// stop once the fields are gone), not the platform's notification.
test('fields that appear after a later render still open with the cast, and watching then stops', () => {
  const doc = makeDocument();
  const body = new FakeElement('body', doc);
  doc.body = body;
  doc.querySelectorAll = (sel) => body.querySelectorAll(sel);

  let observer = null;
  const savedDoc = globalThis.document;
  const savedObs = globalThis.MutationObserver;
  globalThis.document = doc;
  globalThis.MutationObserver = class {
    constructor(cb) { this.cb = cb; this.disconnected = false; observer = this; }
    observe() {}
    disconnect() { this.disconnected = true; }
  };
  try {
    // The count screen: no name fields yet.
    applyMascotDefaults('.name-input');
    assert.ok(observer, 'nothing is watching, so a later render would never be seen');

    body.innerHTML =
      '<input class="name-input" maxlength="16" value="ผู้เล่น 1">' +
      '<input class="name-input" maxlength="16" value="ผู้เล่น 2">';
    let inputs = body.querySelectorAll('.name-input');
    for (const el of inputs) {
      el.value = el.getAttribute('value');
      el.maxLength = 16;
      el.dispatchEvent = () => true;
    }
    observer.cb();
    assert.deepEqual(inputs.map((el) => el.value), MASCOTS.slice(0, 2).map((m) => m.name));
    assert.equal(observer.disconnected, false, 'a count change re-renders these rows -- keep watching');

    // A seat added later gets the cast too, and the ones already filled are left alone.
    body.innerHTML =
      '<input class="name-input" maxlength="16" value="แมวส้ม">' +
      '<input class="name-input" maxlength="16" value="ชิบะ">' +
      '<input class="name-input" maxlength="16" value="ผู้เล่น 3">';
    inputs = body.querySelectorAll('.name-input');
    for (const el of inputs) {
      el.value = el.getAttribute('value');
      el.maxLength = 16;
      el.dispatchEvent = () => true;
    }
    observer.cb();
    assert.deepEqual(inputs.map((el) => el.value), MASCOTS.slice(0, 3).map((m) => m.name));

    // The match starts: the setup fields are gone and there is nothing left to watch for.
    body.innerHTML = '<div class="hud"></div>';
    observer.cb();
    assert.equal(observer.disconnected, true, 'still watching every mutation of a running game');
  } finally {
    globalThis.document = savedDoc;
    globalThis.MutationObserver = savedObs;
  }
});

// The two shapes the input-filling helper above does not reach (issue #173): a route that holds its
// players as a state array of strings, and a route that has to put an existing cast BACK to defaults.
// Both are pinned against MASCOTS itself plus one hard literal, so an implementation that invented
// its own names -- or fell back to the numbered default -- goes red instead of agreeing with a list
// this test built for it.
test('a route can ask for a default cast of N and gets the mascot names', () => {
  assert.deepEqual(mascotNames(4), ['แมวส้ม', 'ชิบะ', 'บันนี่', 'ฟร็อกกี้']);
  assert.deepEqual(mascotNames(10), MASCOTS.slice(0, 10).map((m) => m.name));
  for (const name of mascotNames(10)) assert.ok(!NUMBERED.test(name), `numbered default leaked: ${name}`);
  // 2-10 is the product's range, but nothing in the module enforces it -- past the end it wraps
  // rather than handing a caller `undefined` to render.
  assert.deepEqual(mascotNames(22).slice(20), MASCOTS.slice(0, 2).map((m) => m.name));
  assert.deepEqual(mascotNames(0), []);
  assert.deepEqual(mascotNames(-3), []);
});

test('reset keeps the player count and overwrites the names a player typed', () => {
  const typed = ['ป๋อง', 'ตูน', 'เอ', 'บี', 'ซี'];
  const reset = resetCastNames(typed);
  assert.equal(reset.length, typed.length, 'reset changed the player count');
  assert.deepEqual(reset, MASCOTS.slice(0, 5).map((m) => m.name));
  // The owner's ruling, stated as a test: not one typed name survives.
  for (const name of typed) assert.ok(!reset.includes(name), `reset preserved a typed name: ${name}`);
  // The caller's array is left alone -- a route that resets still owns its own state.
  assert.deepEqual(typed, ['ป๋อง', 'ตูน', 'เอ', 'บี', 'ซี']);
  // A cast of objects: only the count is read, which is why nothing typed can survive.
  assert.deepEqual(resetCastNames([{ name: 'ป๋อง' }, { name: 'ตูน' }]), ['แมวส้ม', 'ชิบะ']);
  assert.deepEqual(resetCastNames([]), []);
});

// The gap the tests above and every per-route reset test shared: they read main.js, and a
// numbered default shipped as STATIC TEXT in markup.html is never scanned by any of them. Seven of
// them sat in three routes' markup and every name test was green -- the scripts paint over the nodes
// before their screen is shown, so the strings were invisible to a player AND to the suite, which is
// the worst pair: nothing to see and nothing to fail.
//
// The set is derived, never listed: every play route the manifest ships, so the next port is covered
// the day its manifest line lands. The manifest owns the set; a route with no markup.html is a red
// that names it rather than a silent skip.
//
// Ceiling, stated because it is a text scan: it reads the file as bytes, so a numbered default inside
// an HTML comment counts too, and a default assembled at runtime is main.js's business (each route's
// own reset test pins that half). One occurrence is enough to fail, and the message names the route
// and the line.
//
// Do NOT describe those per-route files by a single filename. Ten are reset-names.test.mjs and
// zero-trigger's is reset-cast.test.mjs, deliberately -- that route resets avatars as well as names.
// A count taken by filename glob therefore returns ten of eleven and reads as a real gap. Derive the
// set from the manifest and the route directory, the way this test does.
test('no play route ships a numbered player default in its markup', async () => {
  const repoRoot = path.join(here, '..', '..');
  const { games } = await import(pathToFileURL(path.join(repoRoot, 'src/games/manifest.ts')).href);
  const routes = games.filter((g) => g.playRoute).map((g) => g.id).sort();
  assert.ok(routes.length > 0,
    'no play routes derived from src/games/manifest.ts -- refusing to report a vacuous pass on an empty work set');

  // Same shape as NUMBERED above, unanchored: in markup the default sits inside a text node next to
  // other copy ("ตาของผู้เล่น 1", "ผู้เล่น 1 โดนเลือก!"), so an anchored match would miss every one.
  // Same SCOPE as NUMBERED too (gh#189): requires the literal "ผู้เล่น" before the digit, so a turn
  // counter or a shot counter with no player noun attached is not a hit -- that is allowed, not missed.
  //
  // Both digit systems. U+0E50..U+0E59 are THAI DIGIT ZERO through THAI DIGIT NINE, written as
  // escapes rather than literals so the class survives any future encoding or whitespace sweep of
  // this file, and named by codepoint so a reader can check it without rendering the glyphs.
  // None ship today -- this closes the hole before a Thai-numeral default can walk through it, since
  // a guard that only knows Arabic digits is silent on the numerals this product's own language uses.
  const numbered = /ผู้เล่น\s*[\d\u0E50-\u0E59]/;
  const hits = [];
  for (const id of routes) {
    const file = path.join(here, id, 'markup.html');
    assert.ok(fs.existsSync(file), `no src/play/${id}/markup.html -- the manifest ships a play route with no markup here`);
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (numbered.test(line)) hits.push(`${id}/markup.html:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(hits, [], `numbered player default(s) shipped in markup:\n  ${hits.join('\n  ')}`);
  console.log(`markup numbered-default scan: ${routes.length} play route(s) derived from the manifest`);
});
