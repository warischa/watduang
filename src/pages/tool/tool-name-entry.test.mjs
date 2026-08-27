// node --test — no framework, no dependency. gh#91 source pins, the same bargain as
// player-setup.test.mjs: the island lives inside .astro and cannot be imported, so the structural
// facts are read off the source. Two invariants: each of the three name tools mounts the shared
// ToolNameEntry panel with its own flavour strings and its own storage key, and the game shell's
// setup panel is gone from every tool page — its mount is what used to write the shared roster
// (ADR-0039 moved the roster out of the tools, and a mount quietly back is the regression).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');

// Node 22 strips types on import, so the pure list helpers are exercised directly (same trick as
// src/tools/name-list.test.mjs) instead of being re-implemented in the test.
const nameList = await import('../../tools/name-list.ts');

// Byte-exact flavour strings — the panel heading and CTA label from design/ToolNameEntry.dc.html's
// per-tool artboards, the storage keys after number.astro's "watduang:tool:<tool>-<suffix>" habit.
const flavours = {
  'wheel.astro': { heading: 'ชื่อในวง', cta: 'ใส่ชื่อลงวงล้อ', key: 'watduang:tool:wheel-names' },
  'draw.astro': { heading: 'ชื่อในกล่อง', cta: 'ใส่ชื่อลงกล่อง', key: 'watduang:tool:draw-names' },
  'team.astro': { heading: 'ชื่อในสนาม', cta: 'ใส่ชื่อลงสนาม', key: 'watduang:tool:team-names' },
};

test('gh#91 each name tool mounts ToolNameEntry with its own heading, CTA label and storage key', () => {
  for (const [file, flavour] of Object.entries(flavours)) {
    const source = read(file);
    assert.ok(
      source.includes('<ToolNameEntry '),
      `${file} no longer mounts the shared name panel — the tool has no way to get names`,
    );
    for (const value of [flavour.heading, flavour.cta, flavour.key]) {
      assert.ok(source.includes(value), `${file} is missing the byte-exact flavour ${value}`);
    }
  }
});

test('gh#91 no name tool mounts the game shell setup panel any more — that mount is the shared-roster write', () => {
  for (const file of Object.keys(flavours)) {
    assert.doesNotMatch(
      read(file),
      /PlayerSetup/,
      `${file} still references the shell panel — import or mount, either one re-attaches the tools to the roster (ADR-0039)`,
    );
  }
});

test('positive control: the non-name tool mounts neither panel — the set under guard really is the three name tools', () => {
  const numberPage = read('number.astro');
  assert.doesNotMatch(numberPage, /PlayerSetup/, 'number.astro mounts the shell panel again');
  assert.doesNotMatch(numberPage, /ToolNameEntry/, 'number.astro has no names and must stay panel-less');
});

// The panel is one textarea, one name per line (owner-decided, replacing the add-field + chip row).
// The chip-scope-attribute pins that used to live here are gone with the chips they described; what
// replaces them is the contract the three tool pages actually depend on, read off the source because
// the island lives inside .astro and cannot be imported.
test('gh#91 the panel is a multi-line name box: one textarea, 20 visible rows, no add button, no chips', () => {
  const component = read('../../components/ToolNameEntry.astro');
  assert.match(component, /<textarea id="name-input"[^>]*\brows="20"/, 'the name box is no longer a 20-row textarea — 20 rows is what makes it scroll natively at the 21st name');
  assert.doesNotMatch(component, /name-add-btn|name-chips|name-chip\b/, 'chip/add-button machinery is back — the reader now edits the list in place');
});

// rows= bounds what is VISIBLE, never what fits (ADR-0039: tools carry no ceiling). A slice, a
// length check or a cap constant in the panel would be the regression, and none of them is a type
// error or a build break.
//
// gh#125 converted this: the old `/\.slice\(|MAX_|length\s*[<>]=?\s*\d/` ban was a paraphrase pin —
// `filter((_, i) => i < 50)` caps the list and passes it, while a harmless `.slice()` anywhere in the
// panel reds it. What is asserted instead is the OUTPUT: the CTA's own handler is extracted and run
// against 250 typed lines, and the emitted detail.players must carry all 250. Any cap on the path from
// textarea to event — wherever and however it is spelled — reds this.
//
// CEILING: this runs the click handler alone, not the whole island (the island's top-level lines carry
// TS casts plain node cannot evaluate, and this repo has no .astro harness). The emitted list is what
// the three tool pages consume, so that is the surface under guard; a cap applied only to the
// storage-write listener, or a maxlength on the textarea, is out of this test's scope.
test('gh#91 the name count stays unbounded — 250 typed lines all reach the emitted detail.players', () => {
  const component = read('../../components/ToolNameEntry.astro');
  const { parseNameLines } = nameList;

  const needle = "startBtn.addEventListener('click', () => {";
  const at = component.indexOf(needle);
  assert.ok(at > 0, 'positive control: the CTA click handler is where the panel emits its list');
  const open = component.indexOf('{', at + needle.length - 1);
  const body = component.slice(open + 1, component.indexOf('\n  });', open));
  assert.match(body, /dispatchEvent/, 'positive control: the extracted handler body is the one that emits');

  const many = Array.from({ length: 250 }, (_, i) => `ผู้เล่น${i}`);
  let emitted = null;
  const fakeDocument = { dispatchEvent: (e) => { emitted = e; } };
  // eslint-disable-next-line no-new-func -- the handler body is plain JS; its four free names are injected.
  new Function('document', 'CustomEvent', 'parseNameLines', 'saveToolNames', 'input', 'storageKey', body)(
    fakeDocument,
    CustomEvent,
    parseNameLines,
    () => {},
    { value: many.join('\n') },
    'watduang:tool:test-names',
  );

  assert.ok(emitted, 'the CTA handler emitted no event at all');
  assert.equal(emitted.type, 'watduang:start', 'the emitted channel changed');
  assert.equal(emitted.detail.players.length, 250, 'the panel capped the list it emits');
  assert.deepEqual(emitted.detail.players, many, '250 lines must reach the tool page in order, uncapped');
});

// wheel.astro, draw.astro and team.astro each listen for this one event and read detail.players.
// Changing the panel's input surface must not change the payload — three pages break silently if it does.
test('gh#91 the CTA still dispatches watduang:start carrying detail.players, and no other shape', () => {
  const component = read('../../components/ToolNameEntry.astro');
  assert.match(
    component,
    /new CustomEvent\('watduang:start',\s*\{\s*detail:\s*\{\s*players\s*\}/,
    'the start payload is no longer { detail: { players } } — every tool page reads detail.players',
  );
  assert.match(component, /parseNameLines\(input\.value\)/, 'the payload no longer comes from the textarea lines');
});

// ADR-0039: a tool writes its own key and nothing near the stores the games share. The panel takes
// the key as a prop and holds no storage literal, which is what makes that true by construction.
test('gh#91 storage stays per-tool: the panel holds no storage key literal and reads the prop', () => {
  const component = read('../../components/ToolNameEntry.astro');
  // 'watduang:start' is the event channel, not a store, so the ban is on the tool key namespace and
  // on touching localStorage at all — every storage write goes through name-list.ts with the prop key.
  assert.doesNotMatch(component, /'watduang:tool:/, 'the panel now hard-codes a storage key — the per-tool guarantee stops being structural');
  assert.doesNotMatch(component, /localStorage\s*[.[]/, 'the panel reaches storage directly instead of through the key it was handed');
  assert.match(component, /root\.dataset\.storageKey/, 'the panel no longer reads the key handed to it by the page');
  assert.match(component, /saveToolNames\(storageKey,/, 'the panel writes somewhere other than the key it was handed');
});

// The line splitting is the one piece of real logic the multi-line panel added, and it is pure.
test('gh#91 parseNameLines: names are the non-empty trimmed lines, duplicates kept, no cap', () => {
  const { parseNameLines } = nameList;
  assert.deepEqual(parseNameLines(''), [], 'empty text is an empty list');
  assert.deepEqual(parseNameLines('\n\n   \n\t\n'), [], 'blank and whitespace-only lines are not names');
  assert.deepEqual(parseNameLines('บีม'), ['บีม'], 'a single name with no newline');
  assert.deepEqual(parseNameLines('  บีม  \n\tมายด์\n'), ['บีม', 'มายด์'], 'leading/trailing whitespace is trimmed, trailing newline drops');
  assert.deepEqual(parseNameLines('บีม\n\nมายด์\n   \nปอนด์'), ['บีม', 'มายด์', 'ปอนด์'], 'blank lines between names are dropped, order kept');
  assert.deepEqual(parseNameLines('บีม\r\nมายด์'), ['บีม', 'มายด์'], 'a CRLF paste leaves no stray carriage return');
  // Duplicates are KEPT: the textarea is what the reader sees, two people in a group really can both
  // be "แนน", and the uniqueness rule only ever existed so a chip could be removed by value.
  assert.deepEqual(parseNameLines('แนน\nแนน\nโอ๊ต'), ['แนน', 'แนน', 'โอ๊ต'], 'a repeated name is two players, not one');
  const names = Array.from({ length: 25 }, (_, i) => `ชื่อ${i + 1}`);
  assert.deepEqual(parseNameLines(names.join('\n')), names, '25 names round-trip in order');
});
