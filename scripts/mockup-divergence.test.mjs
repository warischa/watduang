// The enumeration and the loss judgement, tested as pure functions — no extraction is run and no
// file is written here. The gate (scripts/mockup-divergence-check.mjs) and the extractor's pre-write
// refusal both route through these functions, so this is the seam where a wrong answer would
// reach both at once. Two directions are judged here: a recorded fragment that must stay PRESENT,
// and one that must stay ABSENT.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lostFragments, introducedFragments, divergingFiles, destructiveWrites, preWriteRefusal, registryProblems } from './mockup-divergence-check.mjs';

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

// The absence kind (gh#220). A decision whose content is that something is NOT in the shipped file
// has no fragment to assert as present, so the presence predicate cannot express it at all. These
// entries carry the same required fields and one extra boolean, and the two predicates partition the
// registry: an absent entry is never judged by lostFragments and a presence entry is never judged by
// introducedFragments. Both directions are asserted here, because a one-way check would pass on a
// build where the new kind does nothing.
const ABS = {
  r: {
    'style.css': [
      { fragment: 'min-height: 100dvh;', absent: true, deliberate: true, owner: 'gh#0', why: 'a floor removed on purpose' },
      { fragment: '.keep-me {', deliberate: true, owner: 'gh#0', why: 'a hand-added rule' },
    ],
  },
};

test('an absent-kind entry is never reported as lost when the file does not contain it', () => {
  // The crux: the clean tree is exactly the state an absence entry describes. If the presence
  // predicate still judged it, landing the entry would red the tree it was written to protect.
  assert.deepEqual(lostFragments(ABS, 'r', 'style.css', '.keep-me {\n  color: red;\n}\n'), []);
});

test('an absent-kind entry reds when the fragment appears in the file', () => {
  const reintroduced = '.keep-me {\n  min-height: 100dvh;\n}\n';
  const back = introducedFragments(ABS, 'r', 'style.css', reintroduced);
  assert.equal(back.length, 1);
  assert.equal(back[0].owner, 'gh#0');
});

test('introducedFragments judges only the absent kind, and only when deliberate', () => {
  // '.keep-me {' is present in this text and IS a recorded fragment, but it is a presence entry —
  // reporting it here would make every protected fragment a violation of itself.
  assert.deepEqual(introducedFragments(ABS, 'r', 'style.css', '.keep-me {\n'), []);
  const undecided = { r: { 'style.css': [{ fragment: 'x', absent: true, deliberate: false, owner: 'gh#0', why: 'nobody ruled' }] } };
  assert.deepEqual(introducedFragments(undecided, 'r', 'style.css', 'x'), []);
});

test('a re-extraction that reintroduces a forbidden fragment is refused, and --force does not release it', () => {
  const fresh = { 'markup.html': 'a\n', 'style.css': '.keep-me {\n  min-height: 100dvh;\n}\n', 'main.js': 'c\n' };
  const shipped = { 'markup.html': 'a\n', 'style.css': '.keep-me {\n}\n', 'main.js': 'c\n' };

  const unforced = preWriteRefusal(ABS, 'r', fresh, shipped);
  assert.equal(unforced.introduced.length, 1);
  assert.equal(unforced.introduced[0].name, 'style.css');
  assert.equal(unforced.refuses, true);

  const forced = preWriteRefusal(ABS, 'r', fresh, shipped, 'gh#0');
  assert.deepEqual(forced.destructive, [], 'the owner still takes the file layer');
  assert.equal(forced.introduced.length, 1, 'an absence is released by editing the registry, not by a flag');
  assert.equal(forced.refuses, true);
});

test('a clean tree with an absent entry recorded refuses nothing', () => {
  const fresh = { 'markup.html': 'a\n', 'style.css': '.keep-me {\n}\n', 'main.js': 'c\n' };
  assert.equal(preWriteRefusal(ABS, 'r', fresh, fresh).refuses, false);
});

test('absent must be a boolean when it is written at all', () => {
  const bad = { r: { 'style.css': [{ fragment: 'x', absent: 'yes', deliberate: true, owner: 'o', why: 'w' }] } };
  assert.equal(registryProblems(bad).length, 1);
  assert.deepEqual(registryProblems(ABS), []);
});
