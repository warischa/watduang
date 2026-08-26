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

// Astro scopes component styles with a data-astro-cid attribute stamped on TEMPLATE elements only.
// The chips are created at runtime, so the island must copy the attribute onto each one — without it
// the scoped .name-chip rules never match and chips render as bare text (measured on the built page:
// computed background transparent, no border). The build alone cannot catch it: the CSS ships either
// way and tsc/build/tests all stay green on a panel whose chips are invisible.
test('gh#91 the island stamps the scope attribute onto runtime-created chips and their remove marks', () => {
  const component = readFileSync(new URL('../../components/ToolNameEntry.astro', import.meta.url), 'utf8');
  assert.match(component, /scopeAttr = Array\.from\(root\.attributes\)/, 'the island no longer reads the scope attribute off the root');
  assert.match(component, /chip\.setAttribute\(scopeAttr\.name, scopeAttr\.value\)/, 'chips are created without the scope attribute — the scoped chip styles never match');
  assert.match(component, /remove\.setAttribute\(scopeAttr\.name, scopeAttr\.value\)/, 'the remove mark loses its scoped styling');
});