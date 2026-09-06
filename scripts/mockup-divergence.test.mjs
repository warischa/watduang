// The enumeration and the loss judgement, tested as pure functions — no extraction is run and no
// file is written here. The gate (scripts/mockup-divergence-check.mjs) and the extractor's pre-write
// refusal both route through these two functions, so this is the seam where a wrong answer would
// reach both at once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lostFragments, divergingFiles, destructiveWrites, preWriteRefusal, registryProblems } from './mockup-divergence-check.mjs';

const REG = {
  'how-close-is-near': {
    'markup.html': [
      {
        fragment: '<p id="hc-live" class="hc-visually-hidden" role="status" aria-live="polite"></p>',
        deliberate: true,
        owner: 'gh#170',
        why: 'announcement channel for a screen reader; the mockup has none',
      },
    ],
  },
  'some-route': {
    'main.js': [{ fragment: 'notYetJudged()', deliberate: false, owner: 'gh#212', why: 'drift nobody has ruled on' }],
  },
};

test('a deliberate fragment missing from the text is reported as lost', () => {
  const lost = lostFragments(REG, 'how-close-is-near', 'markup.html', '<div id="hc-stage"></div>');
  assert.equal(lost.length, 1);
  assert.equal(lost[0].owner, 'gh#170');
});

test('a deliberate fragment still present is not lost', () => {
  const kept = '<div id="hc-stage"></div>\n<p id="hc-live" class="hc-visually-hidden" role="status" aria-live="polite"></p>\n';
  assert.deepEqual(lostFragments(REG, 'how-close-is-near', 'markup.html', kept), []);
});

test('a divergence recorded as not deliberate is never enforced', () => {
  assert.deepEqual(lostFragments(REG, 'some-route', 'main.js', 'nothing here'), []);
});

test('a route or file with nothing recorded reports nothing', () => {
  assert.deepEqual(lostFragments(REG, 'no-such-route', 'markup.html', ''), []);
  assert.deepEqual(lostFragments(REG, 'how-close-is-near', 'style.css', ''), []);
});

test('enumeration names the files that differ, and only those', () => {
  const fresh = { 'markup.html': 'a\n', 'style.css': 'b\n', 'main.js': 'c\n' };
  const shipped = { 'markup.html': 'a\n', 'style.css': 'B\n', 'main.js': null };
  assert.deepEqual(divergingFiles(fresh, shipped), ['style.css', 'main.js']);
  assert.deepEqual(divergingFiles(fresh, fresh), []);
});

// The file layer. This is the half the fragment registry could never cover: it protects hand-added
// code in a file nobody wrote an entry for, which is how ~25 lines of a route's main.js sat exposed
// behind a green gate.
test('only an existing file whose bytes change counts as destructive', () => {
  const fresh = { 'markup.html': 'a\n', 'style.css': 'b\n', 'main.js': 'c\n' };
  const shipped = { 'markup.html': 'a\n', 'style.css': 'B\n', 'main.js': null };
  assert.deepEqual(divergingFiles(fresh, shipped), ['style.css', 'main.js']);
  assert.deepEqual(destructiveWrites(fresh, shipped), ['style.css']);
});

test('a route with nothing on disk yet destroys nothing — the first extraction of a new game', () => {
  const fresh = { 'markup.html': 'a\n', 'style.css': 'b\n', 'main.js': 'c\n' };
  const empty = { 'markup.html': null, 'style.css': null, 'main.js': null };
  assert.deepEqual(destructiveWrites(fresh, empty), []);
  assert.equal(preWriteRefusal(REG, 'brand-new', fresh, empty).refuses, false);
});

test('a file the registry never mentions is still refused', () => {
  // No entry exists for some-route/main.js that is deliberate, yet the overwrite must not go through.
  const fresh = { 'markup.html': 'a\n', 'style.css': 'b\n', 'main.js': 'fresh\n' };
  const shipped = { 'markup.html': 'a\n', 'style.css': 'b\n', 'main.js': 'hand-added\n' };
  const { lost, destructive, refuses } = preWriteRefusal(REG, 'some-route', fresh, shipped);
  assert.deepEqual(lost, [], 'nothing recorded is lost — the old gate would have passed here');
  assert.deepEqual(destructive, ['main.js']);
  assert.equal(refuses, true);
});

test('--force releases the file layer and never the fragment layer', () => {
  const kept = '<p id="hc-live" class="hc-visually-hidden" role="status" aria-live="polite"></p>\n';
  const fresh = { 'markup.html': 'flattened\n', 'style.css': 'b\n', 'main.js': 'c\n' };
  const shipped = { 'markup.html': kept, 'style.css': 'B\n', 'main.js': 'C\n' };

  const unforced = preWriteRefusal(REG, 'how-close-is-near', fresh, shipped);
  assert.deepEqual(unforced.destructive, ['markup.html', 'style.css', 'main.js']);
  assert.equal(unforced.lost.length, 1);

  const forced = preWriteRefusal(REG, 'how-close-is-near', fresh, shipped, 'gh#212');
  assert.deepEqual(forced.destructive, [], 'the owner took responsibility for the file layer');
  assert.equal(forced.lost.length, 1, 'a recorded divergence is released by editing the registry, not by a flag');
  assert.equal(forced.lost[0].entry.owner, 'gh#170');
  assert.equal(forced.refuses, true, 'a forced run that would delete a recorded divergence still refuses');
});

test('a forced run over a route with nothing recorded goes through', () => {
  const fresh = { 'markup.html': 'a\n', 'style.css': 'b\n', 'main.js': 'c\n' };
  const shipped = { 'markup.html': 'A\n', 'style.css': 'B\n', 'main.js': 'C\n' };
  assert.equal(preWriteRefusal(REG, 'no-such-route', fresh, shipped, 'gh#212').refuses, false);
});

test('a registry entry that cannot be enforced is a problem, not a silent pass', () => {
  // An empty fragment matches every string, so it would be permanently green and enforce nothing.
  const bad = { r: { 'markup.html': [{ fragment: '', deliberate: true, owner: 'x', why: 'y' }] } };
  assert.equal(registryProblems(bad).length, 1);
  // A file the extractor does not own cannot be destroyed by an extraction — recording it there
  // reads as protection that no re-extraction was ever going to threaten.
  const wrongFile = { r: { 'overrides.css': [{ fragment: 'x', deliberate: true, owner: 'x', why: 'y' }] } };
  assert.equal(registryProblems(wrongFile).length, 1);
  const missingOwner = { r: { 'main.js': [{ fragment: 'x', deliberate: true, why: 'y' }] } };
  assert.equal(registryProblems(missingOwner).length, 1);
  assert.deepEqual(registryProblems(REG), []);
});
