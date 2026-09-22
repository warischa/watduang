// gh#182 (cheap half) — the PURE half of the play-screen fit probe's correctness, lifted out of the
// browser leg so a change to either pinned set is proved in seconds instead of a full CI round trip.
//
// WHAT "PURE" MEANS HERE: everything that depends only on the two recorded sets and the classification
// rules, and on NO measured pixel. The probe's checks (i) and (ii) — a row is in exactly one set, and
// no set pins a row nobody produces — are decided entirely by FITS_ROWS, KNOWN_OVERFLOW, playRoutes()
// and VIEWPORTS. Nothing below opens a browser, reads dist/, or compares a px against a threshold.
//
// The row set is DERIVED from the module's own exports, never hand-typed: a hand-typed list cannot
// notice a route joining the manifest, which is the exact regression check (i) exists to catch.
//
// gh#202 ADDS A SECOND KIND OF TEST HERE, and the two are labelled apart because they are not worth the
// same. A TABLE test pins a constant against its own shape and survives the deletion of everything that
// reads it. A BEHAVIOUR test drives the shipped function — countsAsHorizontalOverflow and
// sidewaysOffenders are the exact expressions the browser leg and check (v) run — over MEASUREMENTS
// REPLAYED from a real calibration walk. The replay is what buys behaviour coverage without a browser:
// the numbers below were read out of headless Chrome against a served dist/, not invented to agree with
// the code.
//
// NOT COVERED, and it stays with the browser leg: every measured number, and the measuring itself.
// Whether a FITS_ROWS row still measures 0px, whether a KNOWN_OVERFLOW row grew past its recorded px,
// the walk leaving the setup screen, and whether the browser-side element scan
// hands the classifier the right arguments. OVERFLOW_TOLERANCE_PX is half-covered: its VALUE is pinned
// below because the gh#182 ruling forbids widening it, while comparing a measured px against it stays
// with the browser leg. A green here means the bookkeeping is consistent and the classification rules
// do what they say, never that a screen fits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  DECLARED_SCROLLER,
  DRAW_COUNTS,
  FITS_ROWS,
  KNOWN_OVERFLOW,
  KNOWN_OVERFLOW_X,
  OVERFLOW_TOLERANCE_PX,
  UNCLASSIFIED_ADVICE,
  VIEWPORTS,
  assertRecordedReasons,
  compositionGaps,
  countsAsHorizontalOverflow,
  drawValues,
  fmtRowReport,
  emitRowReports,
  fmtFold,
  foldVisiblePx,
  FOLD_SELECTORS,
  FOLD_VP_W,
  acquireMeasurements,
  fmtScreens,
  main,
  playRoutes,
  rowKey,
  recordedPx,
  sidewaysOffenders,
} from './play-screen-fit-probe.mjs';

// A narrowed OR SHARDED run judges pins it never walked, and the stale-pin check below is now the only
// place that check runs at all — the browser leg dropped it when its walk was split across shards, since
// a leg holding a third of the routes cannot tell a stale pin from one of the other shards'. So the full
// keyset has to be full here. playRoutes() reads all three knobs at call time, so clearing them after the
// (hoisted) import is enough, and it keeps a hand-run `ROUTES_ONLY=x node --test ...` or a stray
// FIT_SHARD left in the environment from debugging honest.
delete process.env.ROUTES_ONLY;
delete process.env.FIT_SHARD;
delete process.env.FIT_SHARDS;

// ponytail: `${w}x${h}` repeats the vp string built by the `const row = {...}` literal inside this
// module's default-exported walker, rather than exporting a formatter for one caller. It fails
// CLOSED — if that literal's shape ever changes, every derived key stops matching both pinned sets
// and the partition test reds loudly. Cited by symbol, not by line: a line number here rots on the
// next edit above it, and the repo's added-lineno-citation-check gate reds on one.
const allRows = () => playRoutes().flatMap((route) => VIEWPORTS.map((vp) => rowKey({ route, vp: `${vp.w}x${vp.h}` })));

test('the walk produces rows and both sets are non-empty (no vacuous pass)', () => {
  const rows = allRows();
  // A rule set over zero rows is satisfied by doing nothing. All three counts are asserted so an
  // emptied FITS_ROWS, an emptied KNOWN_OVERFLOW, or a manifest with no play routes each red here.
  assert.ok(rows.length > 0, 'playRoutes() x VIEWPORTS produced no rows — nothing below asserts anything');
  assert.equal(rows.length, playRoutes().length * VIEWPORTS.length);
  assert.ok(FITS_ROWS.size > 0, 'FITS_ROWS is empty — the fits pin asserts nothing');
  assert.ok(KNOWN_OVERFLOW.size > 0, 'KNOWN_OVERFLOW is empty — the exception list asserts nothing');
  assert.equal(
    FITS_ROWS.size + KNOWN_OVERFLOW.size,
    rows.length,
    `the two sets hold ${FITS_ROWS.size + KNOWN_OVERFLOW.size} rows but the walk produces ${rows.length}`,
  );
});

test('every route x viewport row is classified by exactly one set (probe check i)', () => {
  const unclassified = allRows().filter((k) => !FITS_ROWS.has(k) && !KNOWN_OVERFLOW.has(k));
  const inBoth = allRows().filter((k) => FITS_ROWS.has(k) && KNOWN_OVERFLOW.has(k));
  assert.deepEqual(unclassified, [], `UNCLASSIFIED (in neither set): ${unclassified.join(' | ')}`);
  assert.deepEqual(inBoth, [], `in BOTH FITS_ROWS and KNOWN_OVERFLOW: ${inBoth.join(' | ')}`);
});

test('no pin is stale — every pinned key is a row the walk produces (probe check ii, and its only home)', () => {
  const rows = new Set(allRows());
  // All THREE pinned sets. THIS IS NO LONGER A CHEAP MIRROR of a browser-leg check: the browser leg
  // walks one shard of the routes and deleted its own copy, so a pin left behind by a route leaving the
  // manifest reds HERE or nowhere. The keyset is the whole manifest x VIEWPORTS, derived from the
  // module's exports with the shard knobs cleared above, because a stale pin is a statement about the
  // row set and no single shard holds it.
  const stale = [...FITS_ROWS, ...KNOWN_OVERFLOW.keys(), ...KNOWN_OVERFLOW_X.keys()].filter((k) => !rows.has(k));
  assert.deepEqual(stale, [], `pinned but never produced: ${stale.join(' | ')}`);
});

// gh#202 — A TABLE TEST, and nothing more. It pins the shape of DECLARED_SCROLLER: that the exemption
// list is closed, so a value added to it cannot silently widen the exemption over an element class
// nobody measured. It asserts NOTHING about how a box is classified — deleting the whole horizontal
// measurement leaves this test green, which is why the two BEHAVIOUR tests below exist and why this
// header says so out loud rather than letting a reader take a green here for coverage.
test('DECLARED_SCROLLER is a closed table: every computed overflow-x value is exempt or gated, never neither', () => {
  // The computed values CSS can produce for overflow-x. visible/hidden/clip are the ones a play surface
  // actually carries; overlay is legacy-aliased to auto by Chrome and is listed so the gated side is not
  // quietly assumed to be only three values.
  const COMPUTED = ['visible', 'hidden', 'clip', 'scroll', 'auto', 'overlay'];
  const exempt = COMPUTED.filter((v) => DECLARED_SCROLLER.includes(v));
  const gated = COMPUTED.filter((v) => !DECLARED_SCROLLER.includes(v));
  assert.equal(exempt.length + gated.length, COMPUTED.length, 'a value landed in neither bucket');
  assert.deepEqual(exempt.slice().sort(), ['auto', 'scroll'], 'the exemption set is no longer auto+scroll only');
  // The false-green direction, asserted by name: a box that CLIPS sideways must never read as intended.
  // Without this, widening DECLARED_SCROLLER to include hidden would leave every assertion above green
  // while the axis measured nothing on the exact elements it exists to catch.
  for (const v of ['hidden', 'clip', 'visible']) {
    assert.ok(!DECLARED_SCROLLER.includes(v), `overflow-x:${v} is exempt — it must be gated`);
  }
});

// gh#202 BEHAVIOUR, half 1 — the classifier itself, driven with REPLAYED MEASUREMENTS. Every row of the
// table below is a real box read out of a real browser during this axis's calibration (headless Chrome,
// a served dist/, the seeded walk), so no case here is one this test's author invented to agree with the
// code. Replaying them is what lets the classification be judged in milliseconds instead of a full walk,
// and it is the test that CANNOT stay green when the horizontal measurement is neutered: a classifier
// stubbed to false reds the gated cases, one stubbed to true reds the exempt cases.
const CLASSIFIER_CASES = [
  // [what it is, input, must count as unreachable]
  ['html or body sliding sideways is the page not fitting', { isRoot: true, overflowX: 'visible', declaredX: false, clientHeight: 568, innerHeight: 568 }, true],
  ['overflow-x:hidden cuts content off and the player cannot reach it', { isRoot: false, overflowX: 'hidden', declaredX: true, clientHeight: 46, innerHeight: 568 }, true],
  ['overflow-x:clip is the same cut', { isRoot: false, overflowX: 'clip', declaredX: true, clientHeight: 46, innerHeight: 568 }, true],
  // The vertical axis stopped counting visible-overflow boxes on purpose; the horizontal one mirrors it.
  // Decorative overhang that nothing clips is not unreachable content, and its spill is counted in the
  // ancestor that does clip or scroll. Measured during calibration: counting it invented 36-181px of
  // "unreachable" content on pinocchio-luck's css-puppet, a decoration nothing cuts off.
  ['a visible-overflow box spills into an ancestor and is counted THERE, not here', { isRoot: false, overflowX: 'visible', declaredX: false, clientHeight: 200, innerHeight: 568 }, false],
  // wire-snip-panic #hud-player-strip at 320x568, read from the browser: computed overflow-x auto, an
  // author-written .hud-player-strip{overflow-x:auto} behind it, 46px tall against a 568px viewport.
  // Every chip is reachable with a swipe.
  ['a declared, one-row-tall horizontal scroller is a designed widget', { isRoot: false, overflowX: 'auto', declaredX: true, clientHeight: 46, innerHeight: 568 }, false],
  // THE DEFECT THIS AXIS WAS REDESIGNED FOR. Same box, same computed auto, but nobody declared the
  // horizontal axis: per CSS Overflow 3 a computed overflow-x of visible becomes auto the moment
  // overflow-y is not visible/clip, so a box carrying only overflow-y:auto arrives here looking exactly
  // like a scroller. It must NOT be exempt, or every such box in the lifted route stylesheets excuses
  // itself. Reading the computed value alone cannot tell these two rows apart — only declaredX can.
  ['computed auto with NO horizontal declaration is the overflow-y coercion, not a scroller', { isRoot: false, overflowX: 'auto', declaredX: false, clientHeight: 46, innerHeight: 568 }, true],
  // The bound: a declared scroller that is as tall as the screen is the screen, and its spill is the
  // page's. Same expression the vertical self-scroller rule uses.
  ['a declared scroller filling the viewport height is a page container in disguise', { isRoot: false, overflowX: 'auto', declaredX: true, clientHeight: 568, innerHeight: 568 }, true],
  ['scroll behaves as auto does, on both sides of the bound', { isRoot: false, overflowX: 'scroll', declaredX: true, clientHeight: 46, innerHeight: 568 }, false],
];
test('the horizontal classifier counts unreachable spill and exempts designed scrollers (gh#202 behaviour)', () => {
  for (const [what, input, expected] of CLASSIFIER_CASES) {
    assert.equal(countsAsHorizontalOverflow(input), expected, `${what}: ${JSON.stringify(input)}`);
  }
  // Both verdicts are exercised, so neither a stubbed-false nor a stubbed-true classifier survives.
  assert.ok(CLASSIFIER_CASES.some(([, , e]) => e === true), 'no case expects unreachable — a classifier that never counts would pass');
  assert.ok(CLASSIFIER_CASES.some(([, , e]) => e === false), 'no case expects exempt — a classifier that always counts would pass');
});

// gh#202 BEHAVIOUR, half 2 — the GATE, replayed over a saved run's rows. The px below are what the full
// 11-route walk measured during calibration; sidewaysOffenders is the exact function the probe's check
// (v) calls, so this drives the shipped gate with no browser.
const REPLAYED_ROWS = [
  // The row that carries this whole redesign. cursed-number 320x568 holds the ONE owner ruling in
  // KNOWN_OVERFLOW, granted for 689px of VERTICAL scrolling. Under the rejected first attempt the
  // horizontal number was folded into overflowPx and rowKey carries no axis, so that ruling silently
  // excused sideways clipping on the same screen. It must be flagged here.
  { route: 'cursed-number', vp: '320x568', screens: [{ press: 1, overflowPx: 689, overflowXPx: 240, overflowXFrom: 'div#planted' }] },
  // A row whose worst VERTICAL screen is not its worst HORIZONTAL one. Reading X off worstOf would
  // report 0px and green this row; worstXOf ranks the axes separately.
  { route: 'power-meter', vp: '320x568', screens: [
    { press: 0, overflowPx: 76, overflowXPx: 0, overflowXFrom: null },
    { press: 2, overflowPx: 4, overflowXPx: 300, overflowXFrom: 'div#hidden-by-worstOf' },
  ] },
  // Real, measured, and silent for the OTHER reason — the one this fixture exists to pin: a row can be
  // a genuine sideways clip and still not be flagged, because KNOWN_OVERFLOW_X holds it, NOT because
  // the classifier clears it — the loop at the end of this test is what asserts that. wire-snip-panic
  // 320x568/390x844 carried this fixture until gh#226 fixed the underlying cause and deleted both rows
  // from KNOWN_OVERFLOW_X (see that map's history); pinocchio-luck 390x844 is still open, so it is the
  // current example of an exempted-not-cleared row.
  { route: 'pinocchio-luck', vp: '390x844', screens: [{ press: 2, overflowPx: 0, overflowXPx: 10, overflowXFrom: 'section#stageFrame' }] },
  // Drift room, not an admission rule: 8px is OVERFLOW_TOLERANCE_PX and must not red.
  { route: 'dice-loser', vp: '320x568', screens: [{ press: 1, overflowPx: 0, overflowXPx: 8, overflowXFrom: 'div#within-tolerance' }] },
];
test('the sideways gate reds a clip on a row whose vertical overflow is already excused (gh#202 behaviour)', () => {
  const flagged = sidewaysOffenders(REPLAYED_ROWS).map((o) => o.key).sort();
  assert.deepEqual(flagged, ['cursed-number 320x568', 'power-meter 320x568'],
    'the gate flagged the wrong rows — a vertical exemption must not cover a sideways clip, and the worst horizontal screen must be found even when another screen is worse vertically');
  // Named separately so the failure says WHICH property broke rather than only that a list differs.
  assert.ok(KNOWN_OVERFLOW.has('cursed-number 320x568'), 'the fixture no longer replays a row that IS excused vertically, so it proves nothing about axis separation');
  assert.ok(!KNOWN_OVERFLOW_X.has('cursed-number 320x568'), 'the fixture row was added to KNOWN_OVERFLOW_X, which makes this test unfalsifiable');
  // The exemption map is real and it is what silences a row: a row in it must not be flagged whatever
  // it measures. Driven through a throwaway copy of the gate's own predicate so the assertion holds
  // whether the map is empty today or not.
  for (const key of KNOWN_OVERFLOW_X.keys()) {
    const [route, vp] = [key.slice(0, key.lastIndexOf(' ')), key.slice(key.lastIndexOf(' ') + 1)];
    assert.deepEqual(sidewaysOffenders([{ route, vp, screens: [{ press: 0, overflowXPx: 9999 }] }]), [],
      `KNOWN_OVERFLOW_X pins "${key}" but the gate flagged it anyway`);
  }
});

test('every recorded exception reason parses back to its recorded px, on both axes', () => {
  for (const [which, map] of [['KNOWN_OVERFLOW', KNOWN_OVERFLOW], ['KNOWN_OVERFLOW_X', KNOWN_OVERFLOW_X]]) {
    for (const [key, reason] of map) {
      const px = recordedPx(reason);
      assert.ok(Number.isInteger(px) && px > 0, `${which}["${key}"] parsed to ${px} from "${reason}"`);
    }
  }
  // Positive control: the parser must be able to REJECT. Without this, a regex loosened to match
  // anything would leave every assertion above green while parsing nothing.
  assert.throws(() => recordedPx('2px on press 1 - no prefix'), 'recordedPx accepted a reason with no recorded-px prefix');
});

// gh#203 - THE COMPOSITION ROW'S ONE GATE, driven as behaviour rather than described. compositionGaps
// is the exact expression the probe's own completeness check runs, so this test reds if that check
// stops being able to see a missing reading. The row's VALUES (frameCap, tracks, unitRanges,
// unitSpanFrac) are deliberately unasserted here and everywhere: the owner ruled on 2026-09-04 that
// this ticket family needs a different number or a per-route verdict rather than a threshold, and a
// test pinning one of them would be that threshold under another name.
const DESKTOP_VP = `${Math.max(...VIEWPORTS.map((v) => v.w))}x900`;
const NARROW_VP = `${Math.min(...VIEWPORTS.map((v) => v.w))}x568`;
const A_READING = { ok: true, tracks: 2, unitRanges: 2, unitSpanFrac: 0.97, label: 'first-game-screen' };

test('the composition gate names a desktop route that produced no reading (gh#203 behaviour)', () => {
  assert.deepEqual(compositionGaps([
    { route: 'has-one', vp: DESKTOP_VP, composition: A_READING },
    { route: 'read-nothing', vp: DESKTOP_VP, composition: null },
    { route: 'absent-key', vp: DESKTOP_VP },
  ]), ['absent-key', 'read-nothing'],
  'a desktop row carrying no composition reading is the failure a per-row exit code cannot see: in the table it is indistinguishable from a route nobody asked about');
});

test('the composition gate is scoped to the desktop viewport and passes a complete run', () => {
  // The narrow viewports are never asked for a reading, so their absence must not red - a gate that
  // demanded one there would be unpassable by construction and no edit could ever clear it.
  assert.deepEqual(compositionGaps([
    { route: 'a', vp: NARROW_VP },
    { route: 'a', vp: DESKTOP_VP, composition: A_READING },
  ]), []);
  // The shape a real full walk produces, built from the manifest rather than from a typed route list.
  assert.deepEqual(compositionGaps(playRoutes().flatMap((route) => [
    { route, vp: NARROW_VP },
    { route, vp: DESKTOP_VP, composition: A_READING },
  ])), []);
});

// gh#182 — THE THIRD REASON CLASS, driven as behaviour. assertRecordedReasons is the exact expression
// the module runs over both maps at import, so calling it here with throwaway maps is what proves the
// gate can still REJECT. A map-shaped fixture is used rather than the shipped maps because the shipped
// ones are already valid: a check that has only ever seen valid input has never been shown to fail.
const REASON_CASES = [
  // [what it is, key, reason, must be accepted]
  ['an owner ruling carries its date and its px', 'a 320x568', 'owner ruling 2026-09-01: 689px on press 1 - accepted', true],
  ['an open ticket row is recorded, not blessed', 'a 320x568', 'gh#182 open: 187px on press 1 - 187px to scroll', true],
  // THE RED LEG THAT MATTERS MOST: no prefix at all is the "suppressed failure" shape.
  ['a bare number is not a reason', 'a 320x568', '2px on press 1 - clipped by div.gauge', false],
  ['an invented prefix is not one of the three', 'a 320x568', 'looks fine to me: 2px on press 1', false],
  ['a malformed ruling date is rejected', 'a 320x568', 'owner ruling 2026-9-1: 689px on press 1', false],
  ['a not-a-defect row with no date is rejected', 'a 320x568', 'not a defect: 2px on press 1 - mechanism: half-leading', false],
  ['a not-a-defect row with a malformed px capture is rejected', 'a 320x568', 'not a defect 2026-09-04: 2 px on press 1 - mechanism: half-leading', false],
  // The class asserts there is NO defect, so it must name what produced the pixels. Without this a
  // reader cannot tell the assertion from an unargued dismissal.
  ['a not-a-defect row that names no mechanism is rejected', 'a 320x568', 'not a defect 2026-09-04: 2px on press 1 - it is fine', false],
];
test('the reason gate accepts exactly the three recorded classes and reds on everything else (gh#182)', () => {
  for (const [what, key, reason, accepted] of REASON_CASES) {
    // Every fixture map is viewport-complete for route "a", so only the reason under test can decide
    // the verdict — the invariance rule below is proved separately.
    const map = new Map(VIEWPORTS.map((vp) => [`a ${vp.w}x${vp.h}`, reason]));
    map.set(key, reason);
    if (accepted) {
      assert.doesNotThrow(() => assertRecordedReasons('FIXTURE', map), `${what}: "${reason}"`);
    } else {
      assert.throws(() => assertRecordedReasons('FIXTURE', map), `${what} was ACCEPTED: "${reason}"`);
    }
  }
  assert.ok(REASON_CASES.some(([, , , a]) => a === true), 'no case expects acceptance — a gate that rejects everything would pass');
  assert.ok(REASON_CASES.some(([, , , a]) => a === false), 'no case expects rejection — a gate that accepts everything would pass');
});

// The shape a licensed not-a-defect row has to have: a mechanism clause AND the ruling that proved it.
// Built here once so every fixture below varies exactly one part of it.
const LICENSED = 'not a defect 2026-09-04: 2px on press 1 - mechanism: font half-leading inside a 14px gauge, invariant at all three viewports. Proved by the gh#182 owner ruling of 2026-09-04';
const fixtureMap = (reason) => new Map(VIEWPORTS.map((vp) => [`a ${vp.w}x${vp.h}`, reason]));

test('a not-a-defect claim must hold at EVERY viewport, as the consistency check on its cited ruling (gh#182)', () => {
  const MECHANISM = LICENSED;
  const complete = fixtureMap(MECHANISM);
  assert.doesNotThrow(() => assertRecordedReasons('FIXTURE', complete));
  // Invariance is a CONSISTENCY check on the mechanism the cited ruling named, not the licence itself:
  // a row whose number moves with the viewport is not the row the ruling looked at. (What invariance
  // cannot rule out is a FIXED-SIZE defect, which reads identically at every width — the ruling
  // citation, tested below, is what excludes that case.)
  const varies = new Map(complete);
  varies.set(`a ${VIEWPORTS[0].w}x${VIEWPORTS[0].h}`, MECHANISM.replace('2px', '77px'));
  assert.throws(() => assertRecordedReasons('FIXTURE', varies), 'a not-a-defect row that changes with the viewport was accepted');
  // And the claim must cover every viewport, not just the one that happens to be convenient.
  const partial = new Map(complete);
  partial.set(`a ${VIEWPORTS[0].w}x${VIEWPORTS[0].h}`, 'gh#182 open: 2px on press 1 - clipped by div.gauge');
  assert.throws(() => assertRecordedReasons('FIXTURE', partial), 'a not-a-defect claim on a route not recorded that way at every viewport was accepted');
});

// gh#182 — WHAT THE MECHANISM CLAUSE HAS TO BE, driven as behaviour. A substring test for
// "mechanism: " is a lint, not a gate: it accepts the word inside a longer one and it accepts an empty
// tail, so a row could satisfy it while naming nothing. Each case below varies ONLY the mechanism
// clause of an otherwise licensed reason, so the verdict cannot come from anywhere else.
const MECHANISM_CASES = [
  // [what it is, the clause as it appears in the reason, must be accepted]
  ['a named mechanism is what the class claims to rest on', 'mechanism: font half-leading inside a 14px gauge', true],
  ['the word inside a longer word names nothing', 'biomechanism: x', false],
  ['an empty tail is the substring lint passing on nothing', 'mechanism: ', false],
  ['a one-word non-answer is not a mechanism', 'mechanism: unknown', false],
];
test('a not-a-defect row must NAME a mechanism, not merely contain the substring (gh#182)', () => {
  for (const [what, clause, accepted] of MECHANISM_CASES) {
    const reason = `not a defect 2026-09-04: 2px on press 1 - ${clause}. Proved by the gh#182 owner ruling of 2026-09-04`;
    const map = fixtureMap(reason);
    if (accepted) assert.doesNotThrow(() => assertRecordedReasons('FIXTURE', map), `${what}: "${reason}"`);
    else assert.throws(() => assertRecordedReasons('FIXTURE', map), `${what} was ACCEPTED: "${reason}"`);
  }
});

// gh#182 — THE LICENCE, and the defect this test exists to refuse. Invariance across the viewports is
// NOT a proof that a row is not a defect: a fixed-size defect (a fixed-height overflow:hidden card whose
// text wraps identically at all three widths) clips the SAME px everywhere and would walk through an
// invariance-only gate. What licenses the class is the owner ruling that measured and attributed the
// pixels, so the reason has to cite it in a shape the gate can capture.
test('a not-a-defect row must cite the owner ruling that licenses it, invariance alone is not a proof (gh#182)', () => {
  const unlicensed = 'not a defect 2026-09-04: 40px on press 0 - mechanism: a fixed-height card clipping its own text, invariant at all three viewports';
  // Perfect invariance, a real mechanism clause, and no ruling behind it. This is exactly the shape a
  // fixed-size layout defect would take, and it must not be recordable as "no fix is owed".
  assert.throws(() => assertRecordedReasons('FIXTURE', fixtureMap(unlicensed)),
    'a not-a-defect row with no cited owner ruling was accepted — invariance was treated as the licence');
  assert.doesNotThrow(() => assertRecordedReasons('FIXTURE', fixtureMap(`${unlicensed}. Proved by the gh#182 owner ruling of 2026-09-04`)));
  // A near-miss must not pass either: prose that mentions a ruling without naming the ticket and the
  // date is not a citation the gate can check.
  assert.throws(() => assertRecordedReasons('FIXTURE', fixtureMap(`${unlicensed}. The owner ruled on this`)),
    'a vague nod to a ruling was accepted as a citation');
  // The shipped rows carry it, so the gate is load-bearing on real data and not only on fixtures.
  for (const [key, reason] of KNOWN_OVERFLOW) {
    if (!reason.startsWith('not a defect ')) continue;
    assert.match(reason, /Proved by the gh#\d+ owner ruling of \d{4}-\d{2}-\d{2}/, `${key} cites no ruling`);
  }
});

// gh#182 — the advice an UNCLASSIFIED row prints. It is the only instruction a person meeting a fresh
// red ever reads, so it has to be true about all three classes: two are open to a fresh row, and the
// third is not, because nothing can cite an owner ruling that has not happened yet. A message listing
// only two prefixes and saying nothing about the third reads as an omission a reader may "fix" by
// guessing.
test('the UNCLASSIFIED advice is true about all three reason classes (gh#182)', () => {
  assert.match(UNCLASSIFIED_ADVICE, /"owner ruling <date>:"/);
  assert.match(UNCLASSIFIED_ADVICE, /"gh#182 open:"/);
  // The third class is named AND refused in the same breath. Asserting only that the string mentions it
  // would pass on a message that invited a fresh row into it.
  assert.match(UNCLASSIFIED_ADVICE, /"not a defect <date>:"/);
  assert.match(UNCLASSIFIED_ADVICE, /never|not available/);
});

test('the two rows gh#182 proved are not defects are recorded in that class at every viewport (gh#182)', () => {
  for (const route of ['cannon-flag', 'power-meter']) {
    for (const vp of VIEWPORTS) {
      const key = `${route} ${vp.w}x${vp.h}`;
      const reason = KNOWN_OVERFLOW.get(key);
      assert.ok(reason, `${key} left KNOWN_OVERFLOW`);
      assert.match(reason, /^not a defect \d{4}-\d{2}-\d{2}: /, `${key} still reads "${reason.slice(0, 24)}..."`);
      assert.match(reason, /mechanism: /, `${key} names no mechanism`);
    }
  }
  // The tolerance is what a not-a-defect row must never be used to dodge, so it is pinned by value here
  // rather than left to the browser leg that cannot run in this file.
  assert.equal(OVERFLOW_TOLERANCE_PX, 8, 'OVERFLOW_TOLERANCE_PX moved — the gh#182 ruling forbids widening it');
});

// gh#182 reporting: every measured screen must be formatted, not only the worst one.
// On freeze-tap, the press-0 rule-reveal screen measured 92px overflow on the unmodified stylesheet
// (confirmed by A/B), but was hidden by press 1 measuring 187px because worstOf discarded press 0.
// A worst-only formatter outputs only press 1's 187px; the pure per-screen formatter must emit all screens.
// Variable cardinality: tested across multi-screen (>=3), single-screen, and empty fixtures so a mutant
// that truncates (e.g. slice(-2)) cannot pass by accidental agreement with a two-screen fixture count.
test('the per-screen formatter reports every measured screen with its identity and measurements (variable-cardinality)', () => {
  const threeScreenRow = {
    route: 'freeze-tap',
    vp: '320x568',
    screens: [
      { press: 0, overflowPx: 17, scrollPx: 17, clippedPx: 0, overflowXPx: 0, widthFillPct: 95.0, inkCount: 10 },
      { press: 1, overflowPx: 92, scrollPx: 92, clippedPx: 0, overflowXPx: 0, widthFillPct: 98.5, inkCount: 14 },
      { press: 2, overflowPx: 187, scrollPx: 187, clippedPx: 0, overflowXPx: 0, widthFillPct: 99.1, inkCount: 22 },
    ],
  };
  const lines = fmtScreens(threeScreenRow);
  assert.equal(lines.length, 3, 'the formatter must emit one line per measured screen (3 screens)');
  assert.match(lines[0], /press 0/, 'press 0 identity must appear in output');
  assert.match(lines[0], /\b17px\b|\b17\b/, 'press 0 measurement (17 px) must appear in per-screen output');
  assert.match(lines[1], /press 1/, 'press 1 identity must appear in output');
  assert.match(lines[1], /\b92px\b|\b92\b/, 'press 1 measurement (92 px) must appear in per-screen output');
  assert.match(lines[2], /press 2/, 'press 2 identity must appear in output');
  assert.match(lines[2], /\b187px\b|\b187\b/, 'press 2 measurement (187 px) must appear in per-screen output');

  const singleRow = {
    route: 'croc-bite',
    vp: '320x568',
    screens: [
      { press: 0, overflowPx: 0, scrollPx: 0, clippedPx: 0, overflowXPx: 0, widthFillPct: 90.0, inkCount: 8 },
    ],
  };
  const singleLines = fmtScreens(singleRow);
  assert.equal(singleLines.length, 1, 'the formatter must emit 1 line for a single-screen row');
  assert.match(singleLines[0], /press 0/, 'single-screen identity must appear');
  assert.match(singleLines[0], /\b0px\b|\b0\b/, 'single-screen measurement (0 px) must appear');

  assert.deepEqual(fmtScreens({ screens: [] }), [], 'an empty screen set yields no lines');
});

test('fmtRowReport emits the row summary line followed by every screen line', () => {
  const row = {
    route: 'freeze-tap',
    vp: '320x568',
    screens: [
      { press: 0, overflowPx: 17, scrollPx: 17, clippedPx: 0, overflowXPx: 0, widthFillPct: 95.0, inkCount: 10 },
      { press: 1, overflowPx: 92, scrollPx: 92, clippedPx: 0, overflowXPx: 0, widthFillPct: 98.5, inkCount: 14 },
      { press: 2, overflowPx: 187, scrollPx: 187, clippedPx: 0, overflowXPx: 0, widthFillPct: 99.1, inkCount: 22 },
    ],
  };
  const lines = fmtRowReport(row);
  assert.equal(lines.length, 4, 'must emit 1 summary line plus 3 per-screen lines');
  assert.match(lines[0], /freeze-tap.*320x568/, 'line 0 must be the row summary');
  assert.match(lines[1], /screen \[.*press 0\].*17px/, 'line 1 must be screen 0');
  assert.match(lines[2], /screen \[.*press 1\].*92px/, 'line 2 must be screen 1');
  assert.match(lines[3], /screen \[.*press 2\].*187px/, 'line 3 must be screen 2');
});

// Helper for full-coverage fixtures matching playRoutes() x VIEWPORTS (42 rows).
const makeFixture42 = (overrides = {}) => {
  const routes = playRoutes();
  const rows = [];
  for (const route of routes) {
    for (const vpObj of VIEWPORTS) {
      const vp = `${vpObj.w}x${vpObj.h}`;
      const key = `${route} ${vp}`;
      if (overrides[key]) {
        rows.push(overrides[key]);
        continue;
      }
      const isDesktop = vpObj.w === Math.max(...VIEWPORTS.map((v) => v.w));
      const row = {
        route,
        url: `/game/${route}/play/`,
        vp,
        error: null,
        screens: [
          { press: 0, overflowPx: 0, scrollPx: 0, clippedPx: 0, overflowXPx: 0, widthFillPct: 90.0, inkCount: 10 },
        ],
      };
      if (isDesktop) {
        row.composition = {
          ok: true,
          frameDesc: '1440',
          frameCap: 1440,
          screenDesc: 'screen',
          label: 'play',
          press: 0,
          screenDisplay: 'block',
          tracks: 1,
          gridTemplateColumns: '1fr',
          unitCount: 1,
          unitDescs: ['unit'],
          unitRanges: 1,
          unitSpanFrac: 1,
          frameW: 1440,
          sideBySide: false,
        };
      }
      rows.push(row);
    }
  }
  return rows;
};

test('main does not delete or bypass the per-screen emission', () => {
  // gh#238 — BEHAVIOURAL PROOF that production main() executes row emission in its production configuration.
  // Drives main() with its default measurement-acquisition and default console.log sink,
  // observing what actually reaches the production sink.
  //
  // Variable-cardinality fixture: 3 rows with distinguishable and unequal screen counts (1, 2, 3),
  // with expected emissions specified independently rather than derived from fmtRowReport.
  const threeSpecialRows = {
    'croc-bite 320x568': {
      route: 'croc-bite',
      url: '/game/croc-bite/play/',
      vp: '320x568',
      error: null,
      screens: [
        { press: 0, overflowPx: 0, scrollPx: 0, clippedPx: 0, overflowXPx: 0, widthFillPct: 90.0, inkCount: 8 },
      ],
    },
    'dice-loser 320x568': {
      route: 'dice-loser',
      url: '/game/dice-loser/play/',
      vp: '320x568',
      error: null,
      screens: [
        { press: 0, overflowPx: 0, scrollPx: 0, clippedPx: 0, overflowXPx: 0, widthFillPct: 88.0, inkCount: 12 },
        { press: 1, overflowPx: 0, scrollPx: 0, clippedPx: 0, overflowXPx: 0, widthFillPct: 94.0, inkCount: 16 },
      ],
    },
    'freeze-tap 320x568': {
      route: 'freeze-tap',
      url: '/game/freeze-tap/play/',
      vp: '320x568',
      error: null,
      screens: [
        { press: 0, overflowPx: 0, scrollPx: 0, clippedPx: 0, overflowXPx: 0, widthFillPct: 85.0, inkCount: 10 },
        { press: 1, overflowPx: 0, scrollPx: 0, clippedPx: 0, overflowXPx: 0, widthFillPct: 92.0, inkCount: 15 },
        { press: 2, overflowPx: 0, scrollPx: 0, clippedPx: 0, overflowXPx: 0, widthFillPct: 97.0, inkCount: 20 },
      ],
    },
  };

  const EXPECTED_EMISSIONS = [
    '::notice::croc-bite          320x568   scrolls no      0px  clipped     0px  sideways     0px  width-fill    90%  (worst of 1 screen(s): press 0, 8 ink) [pinned fits]',
    '::notice::  screen [press 0]  overflow     0px  scrolls no      0px  clipped     0px  sideways     0px  width-fill    90%  ink 8',
    '::notice::dice-loser         320x568   scrolls no      0px  clipped     0px  sideways     0px  width-fill    88%  (worst of 2 screen(s): press 0, 12 ink) [pinned fits]',
    '::notice::  screen [press 0]  overflow     0px  scrolls no      0px  clipped     0px  sideways     0px  width-fill    88%  ink 12',
    '::notice::  screen [press 1]  overflow     0px  scrolls no      0px  clipped     0px  sideways     0px  width-fill    94%  ink 16',
    '::notice::freeze-tap         320x568   scrolls no      0px  clipped     0px  sideways     0px  width-fill    85%  (worst of 3 screen(s): press 0, 10 ink)',
    // No [pinned fits] suffix: freeze-tap 320x568 left FITS_ROWS for KNOWN_OVERFLOW under the
    // owner ruling of 2026-09-22. The row is still asserted emitted with every screen -- only its
    // classification changed, which is what this line now reflects.
    '::notice::  screen [press 0]  overflow     0px  scrolls no      0px  clipped     0px  sideways     0px  width-fill    85%  ink 10',
    '::notice::  screen [press 1]  overflow     0px  scrolls no      0px  clipped     0px  sideways     0px  width-fill    92%  ink 15',
    '::notice::  screen [press 2]  overflow     0px  scrolls no      0px  clipped     0px  sideways     0px  width-fill    97%  ink 20',
  ];

  const fixture42 = makeFixture42(threeSpecialRows);
  process.env.PROBE_OUT_JSON = JSON.stringify({ rows: fixture42 });
  const logged = [];
  const origLog = console.log;
  const origWarn = console.warn;
  console.log = (...args) => logged.push(args.join(' '));
  console.warn = () => {};
  try {
    main(); // production configuration: default acquireMeasurements, default console.log sink
  } finally {
    console.log = origLog;
    console.warn = origWarn;
    delete process.env.PROBE_OUT_JSON;
  }

  for (const expectedLine of EXPECTED_EMISSIONS) {
    assert.ok(logged.includes(expectedLine), `expected report line missing from production sink: ${expectedLine}`);
  }
  const noticeLines = logged.filter((l) => l.startsWith('::notice::'));
  // The count below holds ONLY while no fixture row carries a fold reading: fmtFold emits one extra
  // ::notice:: per read screen. Asserted rather than assumed, so adding fold data to this fixture reds
  // HERE, with a message saying why, instead of reding the count assertion under its unrelated name.
  const anyFold = Object.values(fixture42).some((r) => (r.screens || []).some((sc) => 'foldVisiblePx' in sc));
  assert.equal(anyFold, false, 'no fixture row may carry foldVisiblePx — the notice count below is derived without fold lines');
  assert.equal(noticeLines.length, 14 + 39 * 2 + 9, 'all 42 rows must have their reports emitted to production sink');

  // The run above proves the DEFAULT sink is wired. It cannot prove the emission contract, because
  // `logged` also carries composition and OK lines, so it can only be checked by sampling — and
  // sampling plus a total is satisfied by mutations that corrupt identity (every row reported under
  // one viewport), order (rows sorted), or multiplicity (a row repeated in place of its successor).
  // All three were demonstrated against the sampling form of this assertion.
  //
  // So the contract is pinned on a SECOND run through an injected sink, which receives emission lines
  // and nothing else, and is compared whole and in order. Acquisition stays the production function
  // in both runs, so a mutation reachable only under injected acquisition still reds the run above.
  process.env.PROBE_OUT_JSON = JSON.stringify({ rows: makeFixture42(threeSpecialRows) });
  const emitted = [];
  const quietWarn = console.warn;
  console.warn = () => {};
  try {
    main({ emit: (line) => emitted.push(line), log: () => {} });
  } finally {
    console.warn = quietWarn;
    delete process.env.PROBE_OUT_JSON;
  }
  // The expectation is built from the FIXTURE, never from the formatter under test: the fixture says
  // which row/viewport pairs exist and in what order, and the emitted summary lines must spell out
  // exactly that sequence. Parsing the actual output is fine; deriving the expected from it is not.
  const summaries = emitted.filter((l) => !l.startsWith('::notice::  screen '));
  const seenPairs = summaries.map((l) => {
    const m = l.match(/^::notice::(\S+)\s+(\d+x\d+)\s/);
    return m ? `${m[1]}|${m[2]}` : `UNPARSED ${l}`;
  });
  const expectedPairs = fixture42.map((r) => `${r.route}|${r.vp}`);
  // Kills three mutants that sampling plus a total let through, each demonstrated against this diff:
  // every row reported under one viewport (identity), rows sorted by viewport (order), and a row
  // repeated in place of its successor (multiplicity).
  assert.deepEqual(seenPairs, expectedPairs, 'every row must be summarised once, in the fixture order, under its own viewport');
  for (const expectedLine of EXPECTED_EMISSIONS) {
    assert.equal(emitted.filter((l) => l === expectedLine).length, 1, `emitted more than once or not at all: ${expectedLine}`);
  }
  // Counted off the fixture — one summary per row plus one line per screen — never off what a run
  // happened to produce. A total copied from the code under test agrees with that code by definition.
  const expectedEmissionCount = fixture42.length + fixture42.reduce((n, r) => n + r.screens.length, 0);
  assert.equal(emitted.length, expectedEmissionCount, 'the injected sink must receive every emission and nothing else');
});

test('emission precedes process.exit(1) on a failing row', () => {
  const failingRows = makeFixture42({
    'croc-bite 320x568': {
      route: 'croc-bite',
      url: '/game/croc-bite/play/',
      vp: '320x568',
      error: null,
      screens: [
        { press: 0, overflowPx: 99, scrollPx: 99, clippedPx: 0, overflowXPx: 0, widthFillPct: 90.0, inkCount: 8 },
      ],
    },
  });

  const emitted = [];
  let exitCode = null;
  const origExit = process.exit;
  const origErr = console.error;
  const origWarn = console.warn;
  console.error = () => {};
  console.warn = () => {};
  process.exit = (code) => {
    exitCode = code;
    throw new Error(`PROCESS_EXIT_${code}`);
  };
  try {
    main({
      acquireMeasurements: () => ({ rows: failingRows }),
      emit: (line) => emitted.push(line),
      log: () => {},
    });
  } catch (err) {
    if (!err.message?.startsWith('PROCESS_EXIT_')) throw err;
  } finally {
    process.exit = origExit;
    console.error = origErr;
    console.warn = origWarn;
  }

  assert.equal(exitCode, 1, 'failing row must trip process.exit(1)');
  assert.ok(
    emitted.some((l) => l.includes('croc-bite') && l.includes('320x568')),
    'failing row summary must be emitted before exit(1) is called',
  );
  assert.ok(
    emitted.some((l) => l.includes('screen [press 0]') && l.includes('99px')),
    'failing screen measurement must be emitted before exit(1) is called',
  );
});

test('emitRowReports actually emits every row and every screen through its sink', () => {
  // The behavioural half of the pair above. A hollowed-out loop passes the regex and fails here.
  const rows = [
    { route: 'freeze-tap', vp: '320x568', screens: [
      { press: 0, overflowPx: 17, scrollPx: 17, clippedPx: 0, overflowXPx: 0, widthFillPct: 97.0, inkCount: 9 },
      { press: 1, overflowPx: 92, scrollPx: 92, clippedPx: 0, overflowXPx: 0, widthFillPct: 98.5, inkCount: 14 },
      { press: 2, overflowPx: 187, scrollPx: 187, clippedPx: 0, overflowXPx: 0, widthFillPct: 99.1, inkCount: 22 },
    ] },
    { route: 'one-bomb', vp: '390x844', screens: [
      { press: 0, overflowPx: 5, scrollPx: 5, clippedPx: 0, overflowXPx: 0, widthFillPct: 96.2, inkCount: 7 },
    ] },
  ];

  const seen = [];
  const emitted = emitRowReports(rows, (line) => seen.push(line));

  // 2 summary lines + 3 screens + 1 screen. A count the emitter reports but does not perform is the
  // exact failure this test exists for, so the returned count and the sink are cross-checked.
  assert.equal(seen.length, 6, 'every row summary and every screen line must reach the sink');
  assert.equal(emitted, seen.length, 'the reported count must equal what the sink actually received');
  assert.ok(seen.every((l) => l.startsWith('::notice::')), 'every emitted line keeps the ::notice:: prefix');

  // Each screen's own number must be present: dropping any one of them is the defect this reports on.
  for (const px of ['17px', '92px', '187px', '5px']) {
    assert.ok(seen.some((l) => l.includes(px)), `a measured screen at ${px} was never emitted`);
  }

  assert.equal(emitRowReports([], () => {}), 0, 'no rows emits nothing');
});

// gh#238 — the fixture knobs are honoured on IMPORT only, never on a CLI run.
//
// The behavioural emission test above needs main() to run in its production configuration (default
// acquireMeasurements, default console.log sink) while still supplying rows without a browser, and
// PROBE_OUT_JSON is how it does that. That same channel, left ungated, would let any CLI invocation
// hand this deploy-gating probe an arbitrary verdict and skip the dist check, the driver and Chrome.
//
// scripts/play-exit-probe.mjs already answers this for its own calibration knobs by refusing the CI
// leg outright. The same refusal is asserted here.
//
// BOTH channels are exercised separately. An earlier version of this test drove only PROBE_OUT_JSON,
// and narrowing the guard to that one variable left it green while a path-only fixture still reached
// parsing ahead of the build check — the named instance was covered and the set was not.
//
// There is deliberately NO "run it with the knobs unset" case. Asserting merely that the refusal is
// absent is satisfied by a probe that exits 0 having measured nothing, and on a machine where dist/
// exists such a run walks past the build guard and spawns the browser driver from a unit test.
// Conditionality is proved below instead, in-process, where it costs nothing and risks nothing.
test('a CLI run refuses a measurement fixture, through either channel', () => {
  const probe = path.join(path.dirname(fileURLToPath(import.meta.url)), 'play-screen-fit-probe.mjs');
  const REFUSAL = /refusing to run the gate with a measurement fixture set/;

  for (const [channel, value] of [
    ['PROBE_OUT_JSON', JSON.stringify({ rows: [] })],
    // A path that does not exist: the guard must fire BEFORE anything tries to read it.
    ['PROBE_OUT_FIXTURE', path.join(path.dirname(fileURLToPath(import.meta.url)), 'no-such-fixture.json')],
  ]) {
    const run = spawnSync(process.execPath, [probe], {
      env: { ...process.env, PROBE_OUT_JSON: '', PROBE_OUT_FIXTURE: '', [channel]: value },
      encoding: 'utf8',
    });
    assert.notEqual(run.status, 0, `a CLI run with ${channel} set must refuse, not report`);
    assert.match(`${run.stderr}${run.stdout}`, REFUSAL, `${channel} must be refused by name, so a CI log says why the leg stopped`);
  }
});

// The other half of the guard: it is keyed on being the ENTRY POINT, not on the knob alone. Under
// import the knob must still work, or the emission test above could not drive production acquisition.
// This is what stops the guard being "refuse always", which would pass the two assertions above.
test('under import the same knob is honoured, so the refusal is conditional on being the entry point', () => {
  const rows = [{ route: 'x', vp: '320x568', screens: [] }];
  process.env.PROBE_OUT_JSON = JSON.stringify({ rows });
  try {
    assert.deepEqual(acquireMeasurements(), { rows }, 'an imported acquireMeasurements must honour the fixture, not refuse it');
  } finally {
    delete process.env.PROBE_OUT_JSON;
  }
});

// The third thing the guard has to be: a CLI run with NO knob set must still not report success.
// Without this, a probe mutated to `if (no knobs) process.exit(0)` — a gate that measures nothing and
// says everything is fine — passes every other assertion in this file.
//
// Safe to spawn because scripts/driver.mjs CONNECTS to an already-running Chrome rather than starting
// one: pointed at a port nothing listens on, it fails, and the probe exits non-zero at its own browser
// guard. The port is pinned high and unused precisely so a Chrome another session left on the default
// debugging port cannot make this test drive a real browser.
test('a CLI run with no fixture still refuses to report success without measuring', () => {
  const probe = path.join(path.dirname(fileURLToPath(import.meta.url)), 'play-screen-fit-probe.mjs');
  const run = spawnSync(process.execPath, [probe], {
    env: { ...process.env, PROBE_OUT_JSON: '', PROBE_OUT_FIXTURE: '', CDP_PORT: '49997', BASE: 'http://127.0.0.1:49996' },
    encoding: 'utf8',
  });
  assert.notEqual(run.status, 0, 'with no measurements obtainable the gate must fail, never exit 0 having measured nothing');
  // And it must fail for the RIGHT reason — an acquisition failure, not the fixture refusal, which
  // would mean the guard had become unconditional.
  assert.doesNotMatch(`${run.stderr}${run.stdout}`, /refusing to run the gate with a measurement fixture set/, 'no knob was set, so the fixture refusal must not be what stopped it');
});

// gh#239 — the draw enumerator's ARITHMETIC, which is the whole growth detector and the one part of
// it a browser is not needed to judge. The browser leg proves the override reaches the pick; this
// proves that the values it forces cover the declared array and separate when the array grows.
//
// pick(v, len) is the expression the routes themselves run: Math.floor(Math.random() * len).
test('drawValues enumerates every index of the declared array, and its canary separates on growth', () => {
  const pick = (v, len) => Math.floor(v * len);
  const N = DRAW_COUNTS['freeze-tap'];
  assert.equal(N, 9, 'the case this detector was derived against');

  const vs = drawValues(N);
  assert.equal(vs.length, N + 1, 'N enumerating passes plus one growth canary');
  assert.ok(vs.every((v) => v >= 0 && v < 1), 'every forced value has to be a legal Math.random() return');

  // (i) COVERAGE: against an array of exactly N, the N midpoints hit indices 0..N-1 one each. A gap
  // here would mean a draw the gate never measures while reporting a clean green.
  const hit = vs.slice(0, N).map((v) => pick(v, N));
  assert.deepEqual(hit, [...Array(N).keys()], 'the midpoints must enumerate every index exactly once');

  // (ii) CANARY, ARRAY UNCHANGED: it must agree with the last enumerating pass, or every run reds on
  // a growth that has not happened — a gate that cries wolf gets its count raised to silence it.
  assert.equal(pick(vs[N], N), pick(vs[N - 1], N), 'against an unchanged array the canary repeats the last index');

  // (iii) CANARY, ARRAY GROWN: this is the must-red. Add one condition and the pair has to separate,
  // otherwise the declared count can drift under the gate while the assertion stays green.
  assert.notEqual(pick(vs[N], N + 1), pick(vs[N - 1], N + 1), 'one extra element must split the canary from the last midpoint');
  // And it has to keep separating as the array grows further, not just at N+1.
  for (const grown of [N + 2, N + 3, N + 7]) {
    assert.notEqual(pick(vs[N], grown), pick(vs[N - 1], grown), `an array of ${grown} must still split the pair`);
  }

  // (iv) SHORTER array: coverage collapses, which is what the distinct-fingerprint assertion in the
  // walk reds on. Proved here so the two assertions are known to cover opposite directions.
  const shortHits = new Set(vs.slice(0, N).map((v) => pick(v, N - 1)));
  assert.ok(shortHits.size < N, 'against a shorter array two midpoints must collide on one index');
});

// ---------------------------------------------------------------------------
// gh#182 fold read — REPORT ONLY. These prove the arithmetic against the recorded
// Mac baseline and prove the formatter stays silent on the shapes a control leg produces.
// ---------------------------------------------------------------------------

test('foldVisiblePx reproduces every value the Mac baseline recorded', () => {
  // docs/verification/evidence/182-320-fold/below-fold-primary-controls.md, pre-fix rows
  assert.equal(foldVisiblePx(613, 712, 568), 0, 'typical pre-fix load read 0 visible px');
  assert.equal(foldVisiblePx(640, 739, 568), 0, 'worst pre-fix load read 0 visible px');
  // docs/verification/evidence/182-freeze-tap-fold-2026-09-15, post-fix, n=12
  assert.equal(foldVisiblePx(508, 568, 568), 60, 'post-fix load read the full 60px button');
  // the wire-snip-panic re-measurement in the same family: a PARTIAL value, neither 0 nor full
  assert.equal(foldVisiblePx(540, 616, 568), 28, 'a partly visible control reads its overlap');
  // a control above the viewport top is clipped at 0, not negative
  assert.equal(foldVisiblePx(-30, 20, 568), 20, 'overlap is clamped at the viewport top too');
});

test('fmtFold is silent on every shape a control leg can produce', () => {
  assert.deepEqual(fmtFold({ screens: [] }), [], 'no screens measured yields no fold line');
  assert.deepEqual(fmtFold({}), [], 'a row with no screens key yields no fold line');
  assert.deepEqual(fmtFold(null), [], 'no row at all yields no fold line');
  assert.deepEqual(
    fmtFold({ screens: [{ press: 0, overflowPx: 12 }, { press: 1, overflowPx: 0 }] }),
    [],
    'screens without a fold reading yield no fold line — every route outside FOLD_SELECTORS',
  );
});

test('fmtFold reports one line per read screen and names which side of the fold it is on', () => {
  const lines = fmtFold({
    screens: [
      { press: 1, draw: 3, foldSel: '#playerReadyBtn', foldVisiblePx: 60, foldHeight: 60, foldTop: 508, foldBottom: 568 },
      { press: 2, draw: 7, foldSel: '#playerReadyBtn', foldVisiblePx: 0, foldHeight: 99, foldTop: 640, foldBottom: 739 },
      { press: 3, overflowPx: 0 },
    ],
  });
  assert.equal(lines.length, 2, 'only screens carrying a reading are reported');
  assert.ok(lines[0].includes('clears the fold'), 'a visible control is reported as clearing');
  assert.ok(lines[0].includes('visible   60px of   60px'), 'the visible and total px both appear');
  assert.ok(lines[1].includes('BELOW  the fold'), 'a zero-visible control is reported as below');
  assert.ok(lines[1].includes('draw 7'), 'the forced draw is named, so a reading is traceable to its condition');
});

test('the fold read is scoped to the one open route and to the viewport its rule names', () => {
  assert.deepEqual(Object.keys(FOLD_SELECTORS), ['freeze-tap'], 'scope is the route whose ruling is open');
  assert.equal(FOLD_SELECTORS['freeze-tap'], '#playerReadyBtn', 'the selector the Mac baseline read, not a heuristic pick');
  assert.equal(FOLD_VP_W, 320, 'the 2026-09-10 rule is a 320px rule');
});

test('emitRowReports adds fold lines only for rows that carry a reading', () => {
  const without = [];
  emitRowReports([{ route: 'x', vp: '320x568', screens: [{ press: 0, overflowPx: 0, widthFillPct: 90, inkCount: 3 }] }], (l) => without.push(l));
  const with_ = [];
  emitRowReports([{ route: 'x', vp: '320x568', screens: [{ press: 0, overflowPx: 0, widthFillPct: 90, inkCount: 3, foldSel: '#b', foldVisiblePx: 5, foldHeight: 44, foldTop: 500, foldBottom: 544 }] }], (l) => with_.push(l));
  assert.equal(with_.length, without.length + 1, 'exactly one extra line, so no existing emission is displaced');
  assert.ok(with_.some((l) => l.startsWith('::notice::  fold ')), 'the extra line is the fold line and carries the notice prefix');
});
