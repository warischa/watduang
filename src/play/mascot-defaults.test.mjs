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
import { fileURLToPath } from 'node:url';
import { FakeElement, makeDocument } from '../games/_fake-dom.mjs';
import { MASCOTS, applyMascotDefaults } from './_mascots.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
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

test('power-meter opens with the animal cast, not the numbered default', () => {
  const source = fs.readFileSync(path.join(here, 'power-meter', 'main.js'), 'utf8');
  const doc = makeDocument();
  const viewRoot = new FakeElement('div', doc);
  doc.body = viewRoot;
  doc.querySelectorAll = (sel) => viewRoot.querySelectorAll(sel);

  const game = { players: [], playerCount: 4 };
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

  // Positive control: without it, a run where the mockup rendered blanks would "pass" on nothing.
  assert.deepEqual(
    inputs.map((el) => el.value),
    ['ผู้เล่น 1', 'ผู้เล่น 2', 'ผู้เล่น 3', 'ผู้เล่น 4'],
  );

  const saved = globalThis.document;
  globalThis.document = doc;
  try {
    applyMascotDefaults('.name-input');
  } finally {
    globalThis.document = saved;
  }

  assert.equal(inputs[0].value, 'แมวส้ม');
  assert.deepEqual(inputs.map((el) => el.value), MASCOTS.slice(0, 4).map((m) => m.name));
  for (const el of inputs) assert.ok(!NUMBERED.test(el.value), `still numbered: ${el.value}`);
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
