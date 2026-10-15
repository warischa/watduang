// Two invariants for the shared mascot cast (issue #152):
//
//   1. ONE definition. src/play/_mascots.ts is it. One copy still exists outside that file --
//      src/play/freeze-tap/main.js declares MASCOT_PLAYERS inline -- and it stays there because that
//      file is a verbatim mockup lift whose thai-comments exemption is keyed to its basename, so an
//      import in it would weaken the claim that it is unmodified. This file pins the two row for row
//      instead: a drift between them is a red test, not a silent divergence.
//
//   2. A play route that renders the numbered default opens with the cast instead. Driven through
//      power-meter since gh#264 by the shared player screen over its real markup, then through the
//      route's REAL startWithPlayers, sliced out of its main.js by source text and evaluated (the
//      same idiom as name-escaping.test.mjs and short-stick/fairness.test.mjs), because every
//      main.js is a lifted module with no exports.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MAX_PLAYERS } from '../games/cursed-number.ts';
import powerMeter from '../games/power-meter.ts';
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

// gh#264 / ADR-0071 replaced the two power-meter cases that stood here. They sliced the route's own
// setup (goToSetupNames, renderSetupNamesView) and pinned its `defaultName` one-liner by source;
// all three are gone, with the count and names views they served. The names now come from the shared
// player screen, so this is driven for real instead: the screen over power-meter's own markup at its
// declared range, started untouched, and the players it hands over run through the route's own
// startWithPlayers. A numbered default reaching a seat -- from either side -- reds on the deepEqual,
// and so does a route that seats anything but the cast's names in the cast's order.
test('power-meter opens with the animal cast, not the numbered default', async () => {
  const { mountOnPage, settle } = await import('./_player-screen/screen-harness.mjs');
  const markup = fs.readFileSync(path.join(here, 'power-meter', 'markup.html'), 'utf8');
  const source = fs.readFileSync(path.join(here, 'power-meter', 'main.js'), 'utf8');
  const before = { document: globalThis.document, localStorage: globalThis.localStorage, window: globalThis.window };
  try {
    const page = await mountOnPage({ routeMarkup: markup, rootId: 'pmPlayers', range: powerMeter.players });
    page.screen.open();
    await settle();
    // Past the arm window the opening put on start, so the click below is a player's.
    await new Promise((resolve) => setTimeout(resolve, 450));
    page.part('start').click();
    await settle();
    assert.equal(page.calls.started.length, 1, 'start handed nobody over');

    const parts = ['startWithPlayers', 'startNewMatch'].map((name) => {
      const slice = sliceDecl(source, name);
      assert.ok(slice, `power-meter/main.js no longer declares ${name}`);
      return slice;
    });
    const colorsAt = source.indexOf('const PLAYER_COLORS = [');
    assert.notEqual(colorsAt, -1, 'power-meter/main.js no longer declares PLAYER_COLORS');
    const colors = source.slice(colorsAt, source.indexOf('];', colorsAt) + 2);
    const game = { players: [] };
    // eslint-disable-next-line no-new-func -- the whole point is to execute the route's own text.
    new Function('game', 'viewRoot', 'soundSynth', 'GameState', 'renderUI', `${colors}\n${parts.join('\n')}\nreturn startWithPlayers;`)(
      game, {}, { playClick() {} }, {}, () => {},
    )(page.calls.started[0]);

    const count = game.players.length;
    assert.ok(count >= powerMeter.players[0], `the route seated ${count} players`);
    assert.deepEqual(game.players.map((p) => p.name), MASCOTS.slice(0, count).map((m) => m.name),
      'power-meter no longer seats a first visit as the animal cast');
    for (const p of game.players) assert.ok(!NUMBERED.test(p.name), `still numbered: ${p.name}`);
  } finally {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  }
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

// gh#152 box 1 -- "the animal names and icons are defined in exactly one file, and a command shows
// only one definition exists". The row-for-row test at the top of this file pins the ONE copy we
// knowingly keep (freeze-tap's inline MASCOT_PLAYERS). This test closes the other half: no play route
// may declare a fresh bare-emoji list of its own. power-meter shipped one for months -- a ten-emoji
// PLAYER_AVATARS that diverged from the cast, so seat 1 rendered a fox beside a default name whose
// cast emoji is a cat. It now derives from MASCOTS, and this test is what stops the next one landing.
//
// THIS IS A HINT, NOT A BOUND, and an earlier version of this comment claimed otherwise. It said the
// only invisible shapes were objects, helper-built lists and single constants. That sentence was
// false, and it was written by the same session that wrote the scan -- which is exactly how a guard
// comes to be trusted for more than it does.
//
// WHAT IT ACTUALLY CATCHES: one shape -- `const NAME = ['X', 'Y', ...]` where every element is a
// quoted string holding one or two pictographic characters and nothing else, in a route's OWN main
// module. That is the shape power-meter shipped, and it is the shape a copy-paste most often takes.
//
// WHAT IT MISSES, none of it hypothetical: a trailing line comment inside the array; template-literal
// items; skin-tone modifiers (U+1F3FB..U+1F3FF are NOT Extended_Pictographic, so a toned emoji fails
// the element test); ZWJ sequences, flags and keycaps; a single non-emoji sentinel mixed into the
// list; the list written as an object property (`avatars: [...]`), which is power-meter's own `const
// game = {` shape; a bare reassignment; nested arrays; and any sibling module in the route directory,
// since only `main.js`/`main.ts` is read. freeze-tap's deliberate cast is invisible for the same
// reason -- it is objects, not bare emoji -- which is convenient here but is NOT a designed exemption.
//
// SO WHAT ACTUALLY BOUNDS THIS. The set is JS syntax times Unicode, and we own neither. The guard that
// converges is the BEHAVIOURAL one: each route's own setup-badge test asserts the rendered badge equals
// the cast's emoji for that seat, and the row-for-row test above pins freeze-tap. Those fail on a wrong
// icon however the list was written. This scan only shortens the distance to the diagnosis.
//
// CALIBRATED BOTH WAYS before it was committed: restoring power-meter's old literal flags it, and the
// penalty-preset arrays in short-stick and zero-trigger -- sentences that happen to contain an emoji
// -- are NOT flagged, which is the false positive an earlier draft of this scan produced.
test('no play route declares its own bare-emoji icon list', async () => {
  const repoRoot = path.join(here, '..', '..');
  const { games } = await import(pathToFileURL(path.join(repoRoot, 'src/games/manifest.ts')).href);
  const routes = games.filter((g) => g.playRoute).map((g) => g.id).sort();
  assert.ok(routes.length > 0,
    'no play routes derived from src/games/manifest.ts -- refusing to report a vacuous pass on an empty work set');

  // An element that is essentially just an emoji: a quoted string holding one or two pictographic
  // characters and nothing else. The optional trailing character is U+FE0F, VARIATION SELECTOR-16,
  // written as an escape and named by codepoint rather than pasted as a glyph -- it is invisible in a
  // diff, and any whitespace or encoding sweep of this file would silently eat a literal one.
  const ICONISH = /^['"]\s*(?:\p{Extended_Pictographic}\uFE0F?){1,2}\s*['"]$/u;
  const DECL = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\[([^\]]*)\]/gs;

  /** Names of the declarations in `source` that look like a hand-written icon list. */
  const iconListDecls = (source) => {
    const found = [];
    for (const m of source.matchAll(DECL)) {
      const items = m[2].split(',').map((s) => s.trim()).filter(Boolean);
      const iconish = items.filter((s) => ICONISH.test(s)).length;
      if (iconish >= 2 && iconish === items.length) found.push({ name: m[1], count: items.length });
    }
    return found;
  };

  // CALIBRATION, run every time rather than claimed once in a commit message. A scan whose regex has
  // been edited into uselessness returns an empty list, and an empty list is exactly what a clean tree
  // returns -- the two are indistinguishable from the outside. These two fixtures go through the SAME
  // iconListDecls the routes go through, so an edit that stops the detector firing fails here first.
  // Emoji are written as codepoint escapes: pasted glyphs are what a whitespace or encoding sweep eats.
  const FIXTURE_BAD = "const AVATARS = ['\u{1F98A}', '\u{1F43C}', '\u{1F42F}'];";
  const FIXTURE_GOOD = "const PRESETS = ['\u{1F3A4} sing the chorus', '\u{1F9CB} buy a round'];";
  assert.equal(iconListDecls(FIXTURE_BAD).length, 1,
    'the icon-list detector no longer fires on a plain three-emoji list -- it is inert, and its green below means nothing');
  assert.equal(iconListDecls(FIXTURE_GOOD).length, 0,
    'the icon-list detector fires on sentences that merely contain an emoji -- it would red the penalty-preset arrays, which are not icon lists');

  const hits = [];
  let scanned = 0;
  for (const id of routes) {
    const dir = path.join(here, id);
    const file = ['main.js', 'main.ts'].map((n) => path.join(dir, n)).find((p) => fs.existsSync(p));
    assert.ok(file, `no main module in src/play/${id} -- the manifest ships a play route with nothing to scan here`);
    scanned += 1;
    const source = fs.readFileSync(file, 'utf8');
    for (const d of iconListDecls(source)) {
      hits.push(`${id}/${path.basename(file)}: ${d.name} (${d.count} entries) -- import from _mascots.ts instead`);
    }
  }
  assert.equal(scanned, routes.length, 'a route was skipped -- this scan must cover every route the manifest ships');
  assert.deepEqual(hits, [], `play route(s) declaring their own icon list:\n  ${hits.join('\n  ')}`);
  console.log(`icon-list scan: ${scanned} play route(s) derived from the manifest, 0 own icon lists`);
});
