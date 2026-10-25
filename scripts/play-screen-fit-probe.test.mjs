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
import fs from 'node:fs';
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
  PLAYER_SCREEN_SCROLLS,
  gatedWorstOf,
  KNOWN_OVERFLOW_SCREEN,
  screenClass,
  screenClassMismatches,
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

// Owner ruling 2026-10-20 (popup, batch S2026-10-20) reclassed these six rows out of 'not a defect':
// the reserved top band made 320 read a different px than 390 and 1440, so the viewport invariance that
// class requires no longer holds. Pinned as the NEW final class, each row at the px it was measured at.
test('the six cannon-flag and power-meter rows are owner-ruling rows recorded at their measured px (2026-10-20)', () => {
  const MEASURED = {
    'cannon-flag 320x568': [20, 0],
    'cannon-flag 390x844': [2, 2],
    'cannon-flag 1440x900': [2, 2],
    'power-meter 320x568': [100, 4],
    'power-meter 390x844': [76, 0],
    'power-meter 1440x900': [76, 0],
  };
  for (const route of ['cannon-flag', 'power-meter']) {
    for (const vp of VIEWPORTS) {
      const key = `${route} ${vp.w}x${vp.h}`;
      const reason = KNOWN_OVERFLOW.get(key);
      assert.ok(reason, `${key} left KNOWN_OVERFLOW`);
      const [px, press] = MEASURED[key];
      assert.ok(reason.startsWith(`owner ruling 2026-10-20: ${px}px on press ${press} - `), `${key} reads "${reason.slice(0, 48)}..."`);
      assert.match(reason, /owner ruling 2026-10-20 \(popup, batch S2026-10-20; recorded on gh#182 comment 6292773677\)/, `${key} cites no source for the ruling`);
      assert.match(reason, /Previously: not a defect 2026-09-04: /, `${key} dropped the prior class from its reason`);
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

// A clip printed as px alone could not be judged from a runner log (one-bomb 320x568, 2026-10-20):
// the line names the clipping box and the descendant reaching furthest below it, and only when it clips.
test('the per-screen line names what clips and what is cut off, and only on a screen that clips', () => {
  const [clipped, clean] = fmtScreens({
    screens: [
      { press: 1, overflowPx: 79, scrollPx: 0, clippedPx: 79, clipFrom: 'div#app', clipChild: 'div.hud 0,489,320,158 (+79px)', overflowXPx: 0, widthFillPct: 100, inkCount: 52 },
      { press: 2, overflowPx: 0, scrollPx: 0, clippedPx: 0, clipFrom: 'div#app', clipChild: 'div.hud 0,0,1,1 (+1px)', overflowXPx: 0, widthFillPct: 100, inkCount: 52 },
    ],
  });
  assert.match(clipped, /clipped {4}79px by div#app \[furthest below: div\.hud 0,489,320,158 \(\+79px\)\] {2}sideways/, 'a clipped screen must name its box and the content past it');
  assert.doesNotMatch(clean, /by div#app|furthest/, 'a screen that clips nothing names no box');
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
        // gh#284: a row whose ruling names the shared player screen must measure one, or the class
        // check reds it; the bit is the declared class, as a real walk of such a row reads it.
        screens: [
          { press: 0, overflowPx: 0, scrollPx: 0, clippedPx: 0, overflowXPx: 0, widthFillPct: 90.0, inkCount: 10, playerScreen: KNOWN_OVERFLOW_SCREEN.get(key) === 'player' },
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
        // gh#284: press 0 is the shared player screen, the class freeze-tap 320x568's ruling names.
        { press: 0, overflowPx: 0, scrollPx: 0, clippedPx: 0, overflowXPx: 0, widthFillPct: 85.0, inkCount: 10, playerScreen: true },
        { press: 1, overflowPx: 0, scrollPx: 0, clippedPx: 0, overflowXPx: 0, widthFillPct: 92.0, inkCount: 15 },
        { press: 2, overflowPx: 0, scrollPx: 0, clippedPx: 0, overflowXPx: 0, widthFillPct: 97.0, inkCount: 20 },
      ],
    },
  };

  const EXPECTED_EMISSIONS = [
    '::notice::croc-bite          320x568   scrolls no      0px  clipped     0px  sideways     0px  width-fill    90%  (worst of 1 screen(s): press 0, 8 ink) [pinned fits]',
    '::notice::  screen [press 0]  overflow     0px  scrolls no      0px  clipped     0px  sideways     0px  width-fill    90%  ink 8  class round',
    '::notice::dice-loser         320x568   scrolls no      0px  clipped     0px  sideways     0px  width-fill    88%  (worst of 2 screen(s): press 0, 12 ink) [pinned fits] [player screen excepted]',
    // [player screen excepted]: dice-loser 320x568 joined PLAYER_SCREEN_SCROLLS under the owner
    // ruling of 2026-10-15 (gh#264). The row is still asserted emitted with every screen.
    '::notice::  screen [press 0]  overflow     0px  scrolls no      0px  clipped     0px  sideways     0px  width-fill    88%  ink 12  class round',
    '::notice::  screen [press 1]  overflow     0px  scrolls no      0px  clipped     0px  sideways     0px  width-fill    94%  ink 16  class round',
    '::notice::freeze-tap         320x568   scrolls no      0px  clipped     0px  sideways     0px  width-fill    85%  (worst of 3 screen(s): press 0, 10 ink)',
    // No [pinned fits] suffix: freeze-tap 320x568 left FITS_ROWS for KNOWN_OVERFLOW under the
    // owner ruling of 2026-09-22. The row is still asserted emitted with every screen -- only its
    // classification changed, which is what this line now reflects.
    '::notice::  screen [press 0]  overflow     0px  scrolls no      0px  clipped     0px  sideways     0px  width-fill    85%  ink 10  class player',
    '::notice::  screen [press 1]  overflow     0px  scrolls no      0px  clipped     0px  sideways     0px  width-fill    92%  ink 15  class round',
    '::notice::  screen [press 2]  overflow     0px  scrolls no      0px  clipped     0px  sideways     0px  width-fill    97%  ink 20  class round',
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

// gh#264, owner ruling 2026-10-15: the shared player screen may scroll. The exception is scoped to the
// player-screen STATE of a row that stays pinned as fitting, so it must never license a play screen.
test('the player-screen exception lives only on FITS_ROWS rows, and excepts only player-screen measurements', () => {
  assert.ok(PLAYER_SCREEN_SCROLLS.size > 0);
  for (const key of PLAYER_SCREEN_SCROLLS.keys()) {
    assert.ok(FITS_ROWS.has(key), `${key}: a player-screen exception on a row that is not pinned as fitting excepts nothing`);
    assert.ok(!KNOWN_OVERFLOW.has(key), `${key}: already a whole-row exception`);
  }
  const row = (screens) => ({ route: 'timebomb', vp: '320x568', screens });
  const player = { press: 0, overflowPx: 15, scrollPx: 15, clippedPx: 0, widthFillPct: 90, playerScreen: true };
  const play = (px) => ({ press: 1, overflowPx: px, scrollPx: px, clippedPx: 0, widthFillPct: 90, playerScreen: false });
  assert.equal(gatedWorstOf(row([player, play(0)])).overflowPx, 0, 'the player screen alone overflowing is excepted');
  assert.equal(gatedWorstOf(row([player, play(12)])).overflowPx, 12, 'MUST-RED: a play screen that grows still reaches the gate');
  assert.equal(gatedWorstOf({ ...row([player]), route: 'short-stick' }).overflowPx, 15, 'MUST-RED: a row with no ruling is not excepted');
});

// Owner ruling 2026-10-25: one-bomb 320x568 is pinned as fitting with only its shared player screen
// excepted. REPLAYED readings, both lanes: the player screen at 174px (dev Mac, no-WebGL lane) and 176px
// (CI runner), every round screen 0px on both. Before the move the row sat in KNOWN_OVERFLOW, which
// grades only its worst screen class, so a round screen that overflowed again was not gated at all.
test('one-bomb 320x568: the player screen scrolls, and a round screen that overflows reds the gate', () => {
  const key = 'one-bomb 320x568';
  assert.ok(FITS_ROWS.has(key), `${key} must be pinned as fitting`);
  assert.ok(PLAYER_SCREEN_SCROLLS.has(key), `${key} must carry the player-screen exception`);
  assert.ok(!KNOWN_OVERFLOW.has(key), `${key} must not stay a whole-row exception`);
  assert.ok(!KNOWN_OVERFLOW_SCREEN.has(key), `${key} must leave the class map with KNOWN_OVERFLOW`);
  const row = (screens) => ({ route: 'one-bomb', vp: '320x568', screens });
  const screen = (press, px, playerScreen) => ({ press, overflowPx: px, scrollPx: px, clippedPx: 0, widthFillPct: 90, playerScreen });
  for (const playerPx of [174, 176]) {
    assert.equal(gatedWorstOf(row([screen(0, playerPx, true), screen(1, 0, false)])).overflowPx, 0, `a ${playerPx}px player screen with 0px round screens is excepted`);
  }
  const grown = gatedWorstOf(row([screen(0, 176, true), screen(1, 12, false)]));
  assert.equal(grown.overflowPx, 12, 'MUST-RED: a round screen that grows still reaches the gate');
  assert.ok(grown.overflowPx > OVERFLOW_TOLERANCE_PX, 'the grown round screen is past the tolerance the gate reds on');
});

// gh#284 — a KNOWN_OVERFLOW row must keep grading the screen CLASS its ruling was made on. The real
// case is pinocchio-luck 390x844: its ruling measured a round screen, and once the route opened on the
// shared player screen the row's worst moved there with the run still green. The measurements below
// are REPLAYED from the gh#282 bisect (controls.json), read out of headless Chrome, not invented.
test('gh#284: every KNOWN_OVERFLOW row declares its screen class, and no class row is orphaned', () => {
  assert.deepEqual([...KNOWN_OVERFLOW_SCREEN.keys()].sort(), [...KNOWN_OVERFLOW.keys()].sort(), 'the class map must hold exactly the KNOWN_OVERFLOW keys');
  for (const [key, cls] of KNOWN_OVERFLOW_SCREEN) assert.ok(cls === 'player' || cls === 'round', `${key}: class must be 'player' or 'round', got ${cls}`);
});

const GH282_CONTROLS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../docs/verification/evidence/gh282-2026-10-20/controls.json');
// One recorded 390x844 row from the bisect, wrapped into the shape the gate consumes. Fields the
// digest did not keep are zeroed; worstOf's tie-break reads widthFillPct, so it must be a number.
const gh282Row = (build) => {
  const run = JSON.parse(fs.readFileSync(GH282_CONTROLS, 'utf8')).runs.find((r) => r.build === build && r.probe.startsWith('own probe') && r.run === 1);
  const rec = run.rows.find((x) => x.vp === '390x844');
  return {
    route: 'pinocchio-luck', url: '/game/pinocchio-luck/play/', vp: '390x844', error: null,
    screens: rec.screens.map((s) => ({ press: s.press, overflowPx: s.overflowPx, scrollPx: s.scrollPx, clippedPx: s.clippedPx, playerScreen: s.playerScreen, overflowXPx: 0, widthFillPct: 0, inkCount: 0 })),
  };
};
const withClass = (key, cls) => new Map([...KNOWN_OVERFLOW_SCREEN, [key, cls]]);
const PIN390 = 'pinocchio-luck 390x844';

test('MUST-RED gh#284: pinocchio-luck 390x844 ruled on a round screen reds on the build that moved its worst to the player screen', () => {
  const moved = gh282Row('f9237d4');
  // Precondition, so a changed artifact reds here instead of passing vacuously.
  assert.deepEqual(moved.screens.map((s) => `${s.press}:${s.overflowPx}:${screenClass(s)}`), ['0:114:player', '1:4:round', '2:14:round', '3:4:round']);
  const red = screenClassMismatches([moved], withClass(PIN390, 'round'));
  assert.equal(red.length, 1, 'the pre-re-record class (round) must red on the f9237d4 measurement');
  assert.equal(red[0].key, PIN390);
  // Control leg: the class the row carries now passes the same measurement.
  assert.deepEqual(screenClassMismatches([moved], withClass(PIN390, 'player')), [], 'declared player passes the player-screen worst');
  // Positive control from the build before the move: the ruling's own round screen passes as round.
  const before = gh282Row('00715c8');
  assert.deepEqual(before.screens.map((s) => `${s.press}:${s.overflowPx}:${screenClass(s)}`), ['0:4:round', '1:14:round', '2:4:round']);
  assert.deepEqual(screenClassMismatches([before], withClass(PIN390, 'round')), [], 'the ruling\'s own build passes as round');
});

test('MUST-RED gh#284: the class check is a band within OVERFLOW_TOLERANCE_PX, so a tie never reds and a clear loser does', () => {
  const key = 'power-meter 390x844';
  const row = (screens) => ({ route: 'power-meter', vp: '390x844', url: '/game/power-meter/play/', screens });
  const sc = (press, px, playerScreen) => ({ press, overflowPx: px, scrollPx: 0, clippedPx: px, playerScreen, overflowXPx: 0, widthFillPct: 90, inkCount: 1 });
  const player = withClass(key, 'player');
  assert.deepEqual(screenClassMismatches([row([sc(0, 76, false), sc(1, 76, true)])], player), [], 'an exact tie with the declared class on the non-worst screen passes');
  assert.deepEqual(screenClassMismatches([row([sc(0, 76, false), sc(1, 76 - OVERFLOW_TOLERANCE_PX, true)])], player), [], 'a declared screen exactly OVERFLOW_TOLERANCE_PX below the worst is inside the band');
  assert.equal(screenClassMismatches([row([sc(0, 76, false), sc(1, 76 - OVERFLOW_TOLERANCE_PX - 1, true)])], player).length, 1, 'one px outside the band reds');
  assert.equal(screenClassMismatches([row([sc(0, 76, false)])], player).length, 1, 'a row that never measured its declared class reds');
  // Fail closed: a KNOWN_OVERFLOW row with no declared class reds rather than skipping.
  const none = new Map(KNOWN_OVERFLOW_SCREEN);
  none.delete(key);
  assert.equal(screenClassMismatches([row([sc(0, 76, false), sc(1, 76, true)])], none).length, 1, 'an undeclared row reds');
});

test('MUST-RED gh#284: main() reds through the production fixture channel and prints each screen\'s class', () => {
  const run = (cls) => {
    const saved = KNOWN_OVERFLOW_SCREEN.get(PIN390);
    KNOWN_OVERFLOW_SCREEN.set(PIN390, cls);
    process.env.PROBE_OUT_JSON = JSON.stringify({ rows: makeFixture42({ [PIN390]: gh282Row('f9237d4') }) });
    const errors = [];
    const emitted = [];
    let exitCode = null;
    const origExit = process.exit;
    const origErr = console.error;
    const origWarn = console.warn;
    console.error = (...a) => errors.push(a.join(' '));
    console.warn = () => {};
    process.exit = (code) => { exitCode = code; throw new Error(`PROCESS_EXIT_${code}`); };
    try {
      main({ emit: (l) => emitted.push(l), log: () => {} });
    } catch (err) {
      if (!err.message?.startsWith('PROCESS_EXIT_')) throw err;
    } finally {
      process.exit = origExit;
      console.error = origErr;
      console.warn = origWarn;
      delete process.env.PROBE_OUT_JSON;
      KNOWN_OVERFLOW_SCREEN.set(PIN390, saved);
    }
    return { exitCode, errors, emitted };
  };
  const red = run('round');
  assert.equal(red.exitCode, 1, 'the pre-re-record class must exit 1 through main()');
  assert.ok(red.errors.some((l) => l.startsWith('::error::') && l.includes('/game/pinocchio-luck/play/') && l.includes('390x844')), 'the error must name the row');
  const ok = run('player');
  assert.equal(ok.exitCode, null, `the current class must pass: ${ok.errors.join(' | ')}`);
  // The runner's class must be readable off a CI log: every per-screen line carries it.
  const lines = ok.emitted.filter((l) => l.startsWith('::notice::  screen ') && l.includes('overflow   114px'));
  assert.equal(lines.length, 1);
  assert.match(lines[0], /class player$/);
  assert.ok(ok.emitted.some((l) => l.startsWith('::notice::  screen [press 2]') && l.includes('overflow    14px') && l.endsWith('class round')));
});

// gh#264 — the fresh read waits out an unfinished player-screen open, and that wait can FAIL. The
// page under the wait is faked by its <html> attributes alone, and the probe's own in-page read is
// executed against it, so what is tested is the expression the browser runs, not a stand-in.
const fit = await import('./play-screen-fit-probe.mjs');

function fakePage(script) {
  // script[i] is the <html> attribute set the i-th read sees; the last entry holds forever.
  let reads = 0;
  const clock = { now: 0 };
  const evaluate = async (body) => {
    const attrs = new Set(script[Math.min(reads, script.length - 1)]);
    reads += 1;
    const document = { documentElement: { hasAttribute: (n) => attrs.has(n) } };
    return { value: new Function('document', body)(document) };
  };
  const opts = { wait: async (ms) => { clock.now += ms; }, now: () => clock.now };
  return { evaluate, opts, reads: () => reads, clock };
}

test('gh#264: the settle wait exists and its cap clears the >=5s boot-plus-open a CI runner measured', () => {
  assert.equal(typeof fit.awaitPlayerScreenSettled, 'function', 'the fresh read has no player-screen wait at all');
  assert.ok(fit.PLAYER_SCREEN_SETTLE_CAP_MS > 5000, `cap ${fit.PLAYER_SCREEN_SETTLE_CAP_MS}ms is inside the latency the runner showed`);
});

test('gh#264: a settled page passes on the first read -- the wait costs nothing when nothing is pending', async () => {
  const p = fakePage([[fit.PLAYER_SCREEN_ATTR]]);
  assert.equal(await fit.awaitPlayerScreenSettled(p.evaluate, p.opts), null);
  assert.equal(p.reads(), 1);
  assert.equal(p.clock.now, 0, 'it slept on a page that was already settled');
});

test('gh#264: an open that lands inside the cap is waited for, not read mid-boot', async () => {
  const pending = [fit.PLAYER_SCREEN_ATTR, fit.PLAYER_SCREEN_PENDING_ATTR];
  const p = fakePage([[], pending, pending, [fit.PLAYER_SCREEN_ATTR]]);
  assert.equal(await fit.awaitPlayerScreenSettled(p.evaluate, p.opts), null);
  assert.equal(p.reads(), 4, 'it returned before the pending open had cleared');
});

test('MUST-RED gh#264: a pending that never clears REDS by name at the cap, and never waits past it', async () => {
  const p = fakePage([[fit.PLAYER_SCREEN_ATTR, fit.PLAYER_SCREEN_PENDING_ATTR]]);
  const why = await fit.awaitPlayerScreenSettled(p.evaluate, { ...p.opts, capMs: 1000 });
  assert.match(why ?? '', /the player screen never finished opening/);
  assert.match(why, new RegExp(fit.PLAYER_SCREEN_PENDING_ATTR), 'the reason does not say which half was missing');
  assert.ok(p.reads() > 1, 'it gave up without polling');
  assert.ok(p.clock.now <= 1000 + 200, `it waited ${p.clock.now}ms past a 1000ms cap`);
});

test('MUST-RED gh#264: a page where the shared screen never mounted REDS too -- an absent pending is not a settled page', async () => {
  const p = fakePage([[]]);
  const why = await fit.awaitPlayerScreenSettled(p.evaluate, { ...p.opts, capMs: 500 });
  assert.match(why ?? '', /the player screen never finished opening/);
  assert.match(why, new RegExp(fit.PLAYER_SCREEN_ATTR));
});

test('MUST-RED gh#264: a read that errors REDS with the error, never reads as settled', async () => {
  const clock = { now: 0 };
  const why = await fit.awaitPlayerScreenSettled(async () => ({ error: 'target closed' }), {
    capMs: 300, wait: async (ms) => { clock.now += ms; }, now: () => clock.now,
  });
  assert.match(why ?? '', /target closed/);
});

// gh#264 REFUTE rounds 1-2 — the settle wait moved the fresh read past the window in which a route
// that paints its own screen before the shared player screen is visible, so that order is its own
// check: an in-page sampler records, from navigation until the screen has opened, every visible
// content leaf the route did not declare (data-shows-before-players), and the verdict judges that.
//
// The sampler and the read are the probe's own source, run against a small fake page: just enough
// DOM (ids, classes, attributes, a parent chain, closest, own text, boxes) for the expressions the
// browser runs. Ceiling: computed style is fixed (everything opaque and visible); a browser decides
// what is hidden, and the probe's browser runs carry that half.
class FakeEl {
  constructor(tag, { id = '', cls = [], attrs = {}, text = '', box = true } = {}, kids = []) {
    Object.assign(this, { tagName: tag.toUpperCase(), id, cls, attrs, text, box, kids, parentElement: null });
    for (const k of kids) k.parentElement = this;
  }
  get children() { return this.kids; }
  get childNodes() { return [...(this.text ? [{ nodeType: 3, textContent: this.text }] : []), ...this.kids]; }
  get textContent() { return this.text + this.kids.map((k) => k.textContent).join(''); }
  matches(sel) {
    return sel.split(',').map((s) => s.trim()).some((s) => (s.startsWith('.') ? this.cls.includes(s.slice(1))
      : s.startsWith('#') ? this.id === s.slice(1) : s.startsWith('[') ? s.slice(1, -1) in this.attrs : this.tagName === s.toUpperCase()));
  }
  closest(sel) { for (let n = this; n; n = n.parentElement) if (n.matches(sel)) return n; return null; }
  querySelectorAll(sel) {
    const out = [];
    const walk = (n) => { for (const k of n.kids) { if (sel === '*' || k.matches(sel)) out.push(k); walk(k); } };
    walk(this);
    return out;
  }
  getBoundingClientRect() { return this.box ? { width: 120, height: 24 } : { width: 0, height: 0 }; }
}
const el = (tag, opts, ...kids) => new FakeEl(tag, opts, kids);
const DECL = { [fit.SHOWS_BEFORE_PLAYERS_ATTR]: '' };

/** Runs the real sampler over `root` for 650ms of page time, opens (or closes) the screen, then runs
 *  the real read. `root` is the play-surface root (#app); `outer` optionally wraps it. */
function sampleFixture(root, { final = 'open', outer } = {}) {
  const attrs = new Map();
  const body = el('body', {}, outer ?? root);
  const html = el('html', {}, body);
  Object.assign(html, { hasAttribute: (a) => attrs.has(a), getAttribute: (a) => attrs.get(a) ?? null });
  const document = {
    documentElement: html,
    querySelector: (sel) => html.querySelectorAll(sel)[0] ?? null,
    querySelectorAll: (sel) => (sel.startsWith('link') ? [] : html.querySelectorAll(sel)),
    addEventListener() {},
  };
  const window = {};
  const cb = {};
  let time = 0;
  new Function('window', 'document', 'performance', 'getComputedStyle', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'MutationObserver', fit.FIRST_SCREEN_SAMPLER)(
    window, document, { now: () => time }, () => ({ opacity: '1', visibility: 'visible', display: 'block' }),
    (fn) => { cb.interval = fn; return 1; }, () => {}, (fn) => { cb.frame = fn; },
    class { constructor(fn) { cb.mutation = fn; } observe() {} disconnect() {} });
  attrs.set(fit.PLAYER_SCREEN_ATTR, 'closed');
  attrs.set(fit.PLAYER_SCREEN_PENDING_ATTR, '1');
  for (time = 0; time < 650; time += 50) { cb.interval(); cb.frame?.(); }
  attrs.delete(fit.PLAYER_SCREEN_PENDING_ATTR);
  attrs.set(fit.PLAYER_SCREEN_ATTR, final);
  cb.mutation();
  return { value: new Function('window', 'document', fit.FIRST_SCREEN_READ)(window, document) };
}
const app = (...kids) => el('div', { id: 'app' }, ...kids);
const shared = () => el('section', { id: 'players', cls: ['ps'] }, el('button', { text: 'Start' }));
const header = (attrs = DECL) => el('header', { id: 'top', attrs }, el('h1', { text: 'Brand' }), el('button', { id: 'mute', text: '🔊' }));

test('gh#264 r2: the sampler and the read parse, and the text threshold is gone', () => {
  assert.doesNotThrow(() => new Function(fit.FIRST_SCREEN_SAMPLER), 'the sampler would throw a SyntaxError in every page');
  assert.doesNotThrow(() => new Function(fit.FIRST_SCREEN_READ));
  assert.equal(fit.FIRST_SCREEN_ROUTE_TEXT_MAX, undefined, 'a character threshold is back: an 18-char menu passes one');
  assert.equal(fit.FIRST_SCREEN_UNDECIDED, undefined, 'an exemption list is back: a route measured painting first is fixed, not listed');
});

test('MUST-RED gh#264 r2 (1): an 18-char options menu ("Options / Easy / Start") before the open REDS, naming its leaves', () => {
  const read = sampleFixture(app(el('section', { id: 'options' }, el('h1', { text: 'Options' }), el('button', { text: 'Easy' }), el('button', { id: 'go', text: 'Start' })), shared()));
  const why = fit.firstScreenVerdict(read);
  assert.match(why ?? '', /painted content of its own before the shared player screen opened/);
  assert.match(why, /h1\|Options/);
  assert.match(why, /button#go\|Start/);
});

test('MUST-RED gh#264 r2: an image or svg before the open REDS -- text is not the only content', () => {
  assert.match(fit.firstScreenVerdict(sampleFixture(app(el('svg', { id: 'logo' }), shared()))) ?? '', /svg#logo\|\[svg\]/);
});

test('gh#264 r2 (4): blank (a canvas, empty styled boxes) until the shared screen opens passes', () => {
  const read = sampleFixture(app(el('canvas', { id: 'stage' }), el('div', { id: 'backdrop' }), shared()));
  assert.ok(read.value.samples > 0, 'no sample was taken -- this case measures nothing');
  assert.equal(fit.firstScreenVerdict(read), null);
});

test('MUST-RED gh#264 r2 (5): a declaration on the play-surface root, or on an ancestor of it or of .ps, REDS', () => {
  const onRoot = el('div', { id: 'app', attrs: DECL }, el('section', { id: 'options' }, el('h1', { text: 'Options' })), shared());
  assert.match(fit.firstScreenVerdict(sampleFixture(onRoot)) ?? '', /declares the play-surface root div#app/);
  const inner = app(el('section', { id: 'options' }, el('h1', { text: 'Options' })), shared());
  assert.match(fit.firstScreenVerdict(sampleFixture(inner, { outer: el('main', { id: 'shell', attrs: DECL }, inner) })) ?? '', /declares the play-surface root div#app \(an ancestor\)/);
  const wrapPs = app(el('div', { id: 'menu', attrs: DECL }, el('h1', { text: 'Options' }), shared()));
  assert.match(fit.firstScreenVerdict(sampleFixture(wrapPs)) ?? '', /div#menu encloses the shared screen section#players/);
});

test('MUST-RED gh#264 r2 (6): a declared header passes; the same header without its declaration REDS', () => {
  assert.equal(fit.firstScreenVerdict(sampleFixture(app(header(), shared()))), null, 'a declared header was counted');
  const why = fit.firstScreenVerdict(sampleFixture(app(header({}), shared())));
  assert.match(why ?? '', /h1\|Brand/);
  assert.match(why, /button#mute\|🔊/);
});

test('gh#264 r1: an intro-first route (screen still closed once settled) is not judged -- its own screen IS first', () => {
  assert.equal(fit.firstScreenVerdict(sampleFixture(app(el('h1', { text: 'Intro screen' }), shared()), { final: 'closed' })), null);
});

test('MUST-RED gh#264 r1: a missing sampler, or an opened screen with no styled sample, REDS -- never reads as clean', () => {
  assert.match(fit.firstScreenVerdict({ value: null }) ?? '', /sampler/);
  assert.match(fit.firstScreenVerdict({ error: 'boom' }) ?? '', /boom/);
  assert.match(fit.firstScreenVerdict({ value: { samples: 0, offenders: [], final: 'open', declarationFaults: [] } }) ?? '', /no styled sample/);
});

// gh#264 — the forced-no-WebGL leg (NO_WEBGL=1). Every branch that reds it is driven red here, on the
// probe's own source: the injection and the in-page check run over fake canvas classes, the run-level
// faults over recorded rows, and the every-task sampler over the fake page above.

/** A page whose canvases answer a context for every kind, the way a WebGL-live Chrome does --
 *  OffscreenCanvas included, which throws on 'experimental-webgl' exactly as Chrome measured. */
function canvasPage() {
  const ctx = () => ({ fillRect() {} });
  class HTMLCanvasElement { getContext() { return ctx(); } }
  class OffscreenCanvas {
    getContext(kind) {
      if (kind === 'experimental-webgl') throw new TypeError(`The provided value '${kind}' is not a valid enum value`);
      return ctx();
    }
  }
  const window = { HTMLCanvasElement, OffscreenCanvas };
  const document = { createElement: () => new HTMLCanvasElement() };
  const check = () => ({ value: new Function('window', 'document', fit.NO_WEBGL_CHECK)(window, document) });
  return { window, check, inject: () => new Function('window', fit.NO_WEBGL_INJECTION)(window) };
}

test('MUST-RED gh#264: the no-WebGL check reds a page the injection never reached, and passes once it has', () => {
  const page = canvasPage();
  const before = fit.noWebglInjectionVerdict(page.check());
  assert.match(before ?? '', /forced no-WebGL did not take/, 'a WebGL-live page passed the precondition');
  for (const k of fit.NO_WEBGL_CONTEXTS) assert.match(before, new RegExp(`canvas ${k} `));
  page.inject();
  assert.equal(fit.noWebglInjectionVerdict(page.check()), null, 'the injection took and the check still reds');
});

test('MUST-RED gh#264: an injection that also takes 2d away, or a check that never ran, reds', () => {
  const allNull = Object.fromEntries(fit.NO_WEBGL_CONTEXTS.map((k) => [k, true]));
  const ok = { canvas: allNull, offscreenPresent: true, offscreen: allNull, twoD: true };
  assert.equal(fit.noWebglInjectionVerdict({ value: ok }), null);
  assert.match(fit.noWebglInjectionVerdict({ value: { ...ok, twoD: false } }) ?? '', /2d context away/);
  assert.match(fit.noWebglInjectionVerdict({ value: { ...ok, offscreen: { ...allNull, webgl2: false } } }) ?? '', /OffscreenCanvas webgl2/);
  assert.match(fit.noWebglInjectionVerdict({ value: null }) ?? '', /returned nothing/);
  assert.match(fit.noWebglInjectionVerdict({ error: 'target closed' }) ?? '', /target closed/);
});

/** A complete, clean no-WebGL run over `routes`. */
function noWebglRun(routes) {
  const allNull = Object.fromEntries(fit.NO_WEBGL_CONTEXTS.map((k) => [k, true]));
  return {
    noWebgl: true,
    rows: routes.map((route) => ({
      route, url: `/game/${route}/play/`, vp: '320x568', error: null, firstScreen: { final: 'open', samples: 3 },
      injection: { canvas: allNull, offscreenPresent: true, offscreen: allNull, twoD: true }, screens: [],
    })),
  };
}

test('MUST-RED gh#264: the no-WebGL run reds a missing, doubled or extra route, a row error, an unchecked row, or a run that was not forced', () => {
  const routes = playRoutes();
  assert.deepEqual(fit.noWebglFaults(noWebglRun(routes), routes), [], 'a complete clean run reds');
  const run = () => noWebglRun(routes);
  const missing = run(); missing.rows.pop();
  assert.match(fit.noWebglFaults(missing, routes).join('\n'), new RegExp(`no row for ${routes.at(-1)}`));
  const doubled = run(); doubled.rows.push({ ...doubled.rows[0] });
  assert.match(fit.noWebglFaults(doubled, routes).join('\n'), /more than one row/);
  const extra = run(); extra.rows.push({ ...extra.rows[0], route: 'not-a-route' });
  assert.match(fit.noWebglFaults(extra, routes).join('\n'), /not asked to walk/);
  const broken = run(); broken.rows[0].error = 'painted content of its own';
  assert.match(fit.noWebglFaults(broken, routes).join('\n'), /with WebGL forced off: painted content/);
  const unchecked = run(); unchecked.rows[0].injection = null;
  assert.match(fit.noWebglFaults(unchecked, routes).join('\n'), /returned nothing/);
  const unforced = run(); delete unforced.noWebgl;
  assert.match(fit.noWebglFaults(unforced, routes).join('\n'), /not from a forced-no-WebGL run/);
});

test('MUST-RED gh#264 REFUTE: rows with valid injection and no first-screen measurement RED -- intro-first is observed, never inferred', () => {
  const routes = playRoutes();
  const bare = noWebglRun(routes);
  for (const r of bare.rows) delete r.firstScreen;
  const faults = fit.noWebglFaults(bare, routes);
  assert.equal(faults.length, routes.length, `every unmeasured row must red on its own, got: ${faults.join(' / ')}`);
  assert.match(faults[0], /no first-screen measurement/);
  const unsampled = noWebglRun(routes); unsampled.rows[0].firstScreen.samples = 0;
  assert.match(fit.noWebglFaults(unsampled, routes).join('\n'), /no styled sample on record/);
  const odd = noWebglRun(routes); odd.rows[0].firstScreen.final = null;
  assert.match(fit.noWebglFaults(odd, routes).join('\n'), /neither open nor closed/);
  const intro = noWebglRun(routes); intro.rows[0].firstScreen = { final: 'closed', samples: 0 };
  assert.deepEqual(fit.noWebglFaults(intro, routes), [], 'an observed intro-first row reds');
});

test('MUST-RED gh#264: main() under NO_WEBGL gates on the run-level faults, and refuses to mix with a shard or a control', () => {
  const routes = playRoutes();
  const drive = (out, env = {}) => {
    const logged = [];
    const saved = { ...process.env };
    const origExit = process.exit;
    const origErr = console.error;
    let code = null;
    Object.assign(process.env, { NO_WEBGL: '1' }, env);
    process.exit = (c) => { code = c; throw new Error(`PROCESS_EXIT_${c}`); };
    console.error = () => {};
    try {
      main({ acquireMeasurements: () => out, emit: () => {}, log: (l) => logged.push(l) });
    } catch (err) {
      if (!err.message?.startsWith('PROCESS_EXIT_')) throw err;
    } finally {
      process.exit = origExit;
      console.error = origErr;
      for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
      Object.assign(process.env, saved);
    }
    return { code, logged };
  };
  const clean = drive(noWebglRun(routes));
  assert.equal(clean.code, null, 'a complete clean no-WebGL run exited');
  assert.match(clean.logged.join('\n'), new RegExp(`OK no-WebGL first screen: ${routes.length} route row\\(s\\)`));
  const short = noWebglRun(routes); short.rows.shift();
  assert.equal(drive(short).code, 1, 'a run missing a route passed');
  assert.throws(() => drive(noWebglRun(routes), { FIT_SHARD: '0', FIT_SHARDS: '3' }), /NO_WEBGL is its own leg/);
  assert.throws(() => drive(noWebglRun(routes), { BREAK_WALK: '1' }), /NO_WEBGL is its own leg/);
});

/** The fake page above, driven through an explicit event-loop script. The observer double delivers a
 *  record only to an observer whose options match it, and only at a checkpoint -- as the browser does
 *  -- so a sampler watching the player-screen attributes alone never hears a board go in. A
 *  MessageChannel double queues its message as a later task. `steps` runs in order:
 *    tick      -- one interval sample          frame -- the sampler's own rAF sample
 *    insert    -- a route callback appends the board under the root
 *    remove    -- a route callback removes it  checkpoint -- the microtask checkpoint after a callback
 *    open      -- the open task: pending cleared, screen open, then its checkpoint
 *    tasks     -- every queued later task runs */
function orderFixture(sampler, steps) {
  const attrs = new Map();
  const root = app(shared());
  const html = el('html', {}, el('body', {}, root));
  Object.assign(html, { hasAttribute: (a) => attrs.has(a), getAttribute: (a) => attrs.get(a) ?? null });
  const document = {
    documentElement: html,
    querySelector: (sel) => html.querySelectorAll(sel)[0] ?? null,
    querySelectorAll: (sel) => (sel.startsWith('link') ? [] : html.querySelectorAll(sel)),
    addEventListener() {},
  };
  const window = {};
  const observers = [];
  let records = [];
  const tasks = [];
  const cb = {};
  let time = 0;
  const within = (node, top) => { for (let n = node; n; n = n.parentElement) if (n === top) return true; return false; };
  class MutationObserver {
    constructor(fn) { this.fn = fn; }
    observe(target, o) { observers.push({ fn: this.fn, target, o, self: this }); }
    disconnect() { for (let i = observers.length - 1; i >= 0; i--) if (observers[i].self === this) observers.splice(i, 1); }
  }
  class MessageChannel {
    constructor() {
      this.port1 = { onmessage: null };
      this.port2 = { postMessage: () => tasks.push(() => this.port1.onmessage({})) };
    }
  }
  new Function('window', 'document', 'performance', 'getComputedStyle', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'MutationObserver', 'MessageChannel', sampler)(
    window, document, { now: () => time }, () => ({ opacity: '1', visibility: 'visible', display: 'block' }),
    (fn) => { cb.interval = fn; return 1; }, () => {}, (fn) => { cb.frame = fn; }, MutationObserver, MessageChannel);
  const matches = (r, { target, o }) => (r.target === target || (o.subtree && within(r.target, target)))
    && (r.type === 'attributes' ? (o.attributes || o.attributeFilter) && (!o.attributeFilter || o.attributeFilter.includes(r.name)) : o[r.type]);
  const checkpoint = () => {
    const due = records;
    records = [];
    for (const ob of [...observers]) { const mine = due.filter((r) => matches(r, ob)); if (mine.length) ob.fn(mine); }
  };
  const board = el('h1', { id: 'board', text: 'Board' });
  const run = {
    tick: () => { time += 50; cb.interval(); },
    frame: () => { const f = cb.frame; cb.frame = null; f?.(); },
    insert: () => { board.parentElement = root; root.kids.push(board); records.push({ type: 'childList', target: root }); },
    remove: () => { root.kids.splice(root.kids.indexOf(board), 1); records.push({ type: 'childList', target: root }); },
    checkpoint,
    open: () => {
      attrs.delete(fit.PLAYER_SCREEN_PENDING_ATTR);
      attrs.set(fit.PLAYER_SCREEN_ATTR, 'open');
      records.push({ type: 'attributes', target: html, name: fit.PLAYER_SCREEN_PENDING_ATTR }, { type: 'attributes', target: html, name: fit.PLAYER_SCREEN_ATTR });
      checkpoint();
    },
    tasks: () => { for (const t of tasks.splice(0)) t(); },
  };
  attrs.set(fit.PLAYER_SCREEN_ATTR, 'closed');
  attrs.set(fit.PLAYER_SCREEN_PENDING_ATTR, '1');
  for (const s of steps) run[s]();
  return fit.firstScreenVerdict({ value: new Function('window', 'document', fit.FIRST_SCREEN_READ)(window, document) });
}

test('MUST-RED gh#264 REFUTE: sampler rAF, then a route rAF inserting its board, then the open task -- the board REDS', () => {
  // The judge's ordering: the board goes in during a route's rAF callback, after the sampler's own, so
  // it is painted at that rendering opportunity; the open is a task queued before any later sample.
  const why = orderFixture(fit.FIRST_SCREEN_SAMPLER, ['tick', 'frame', 'insert', 'checkpoint', 'open', 'tasks']);
  assert.match(why ?? '', /h1#board\|Board/, 'a board painted before the open was never sampled');
});

test('MUST-RED gh#264 REFUTE: a board a task leaves standing before the open REDS', () => {
  assert.match(orderFixture(fit.FIRST_SCREEN_SAMPLER, ['tick', 'insert', 'checkpoint', 'open']) ?? '', /h1#board\|Board/);
});

test('gh#264 REFUTE: a board inserted and removed inside one callback is never counted -- no frame can show it', () => {
  assert.equal(orderFixture(fit.FIRST_SCREEN_SAMPLER, ['tick', 'frame', 'insert', 'remove', 'checkpoint', 'open', 'tasks']), null);
});

// gh#287 — the FONT_READ knob's verdict, driven over platform-font reads REPLAYED from headless Chrome
// on a Mac against a served dist/ (one-bomb's how-to-play list, its player-screen hint and name field,
// and a node shaped in two faces). The reading itself stays with the browser leg; what is pinned here is
// what a reading is called once it exists, which is the part a later edit could quietly flatten.
const HOSTED = ['Sarabun', 'Mitr'];
const THONBURI_LI = [
  { familyName: '.ThonburiUI', postScriptName: '.ThonburiUI-Regular', isCustomFont: false, glyphCount: 56 },
  { familyName: '.SF NS', postScriptName: '.SFNS-Regular', isCustomFont: false, glyphCount: 6 },
];
const SARABUN_HINT = [{ familyName: 'Sarabun', postScriptName: 'Sarabun-Regular', isCustomFont: true, glyphCount: 48 }];

test('gh#287 fontVerdict: system-only, custom-only, mixed and empty are four different answers', () => {
  assert.equal(fit.fontVerdict(THONBURI_LI, HOSTED).verdict, 'system');
  assert.equal(fit.fontVerdict(SARABUN_HINT, HOSTED).verdict, 'custom');
  const mixed = fit.fontVerdict([...SARABUN_HINT, { familyName: 'Apple Color Emoji', isCustomFont: false, glyphCount: 1 }], HOSTED);
  assert.equal(mixed.verdict, 'mixed');
  assert.deepEqual(mixed.custom, { Sarabun: 48 });
  assert.deepEqual(mixed.system, { 'Apple Color Emoji': 1 });
  // An empty read is NOT clean: Chrome returns [] for text it never shaped, and calling that custom
  // would grade an unread node as safe.
  assert.equal(fit.fontVerdict([], HOSTED).verdict, 'unread');
});

test('gh#287 fontVerdict: glyphs are summed per family across duplicate fragment entries', () => {
  const v = fit.fontVerdict([
    { familyName: '.ThonburiUI', isCustomFont: false, glyphCount: 30 },
    { familyName: '.ThonburiUI', isCustomFont: false, glyphCount: 76 },
    { familyName: '.SF NS', isCustomFont: false, glyphCount: 11 },
  ], HOSTED);
  assert.deepEqual(v.system, { '.ThonburiUI': 106, '.SF NS': 11 });
});

test('gh#287 fontVerdict: the custom flag decides, never the name -- a system face named like a hosted one is system', () => {
  // Measured on short-stick: a locally installed face whose name contains Sarabun, flagged not custom.
  assert.equal(fit.fontVerdict([{ familyName: 'TH Sarabun New', isCustomFont: false, glyphCount: 14 }], HOSTED).verdict, 'system');
});

test('MUST-RED gh#287 fontVerdict: a custom face the page does not host is an ANOMALY, a hosted one is not', () => {
  assert.deepEqual(fit.fontVerdict(SARABUN_HINT, HOSTED).anomalies, []);
  assert.deepEqual(fit.fontVerdict([{ familyName: 'Webby', isCustomFont: true, glyphCount: 3 }], HOSTED).anomalies, ['Webby']);
  // Chrome reports the file's own family name, weight included: the hosted Mitr 500 face read
  // "Mitr Medium" on one-bomb. That is the hosted face; a name merely STARTING with the letters is not.
  assert.deepEqual(fit.fontVerdict([{ familyName: 'Mitr Medium', isCustomFont: true, glyphCount: 9 }], HOSTED).anomalies, []);
  assert.deepEqual(fit.fontVerdict([{ familyName: 'Mitrx', isCustomFont: true, glyphCount: 9 }], HOSTED).anomalies, ['Mitrx']);
});

test('gh#287 fmtFontRead: elements sharing a name and a reading collapse into one counted item', () => {
  const cell = { sel: 'div.pScore', kind: 'text', inBox: false, fonts: [{ familyName: '.SF NS', isCustomFont: false, glyphCount: 3 }] };
  const line = fit.fmtFontRead('one-bomb', '320x568', fontScreen([cell, cell, cell], { boxes: [] }));
  assert.match(line, /system=3 .*\| system: div\.pScore \.SF NS:3 x3$/);
});

const fontScreen = (entries, over = {}) => ({
  press: 2, draw: null, overflowPx: 40, scrollPx: 0, clippedPx: 40, clipFrom: 'div.modal', scrollFrom: null,
  fontRead: {
    hosted: HOSTED,
    // The box's frozen members are the entries marked inBox, read the same way.
    boxes: [{ slot: 'clip', name: 'div.modal', found: true, members: entries.filter((e) => e.inBox).map((e) => ({ sel: e.sel, kind: e.kind, drift: null, fonts: e.fonts, failed: 0 })) }],
    entries, ...over,
  },
});

test('gh#287 fontReadSummary: at-risk is yes only when a SYSTEM element sits inside the named overflow box', () => {
  const sys = { sel: 'li', kind: 'text', inBox: true, fonts: THONBURI_LI };
  const cus = { sel: 'p.ps-hint', kind: 'text', inBox: true, fonts: SARABUN_HINT };
  assert.equal(fit.fontReadSummary(fontScreen([sys, cus])).atRisk, 'yes');
  assert.equal(fit.fontReadSummary(fontScreen([{ ...sys, inBox: false }, cus])).atRisk, 'no');
  // A custom element inside the box does not make the screen at risk.
  assert.equal(fit.fontReadSummary(fontScreen([cus])).atRisk, 'no');
  // A screen with no overflow names no box, so the question does not arise.
  assert.equal(fit.fontReadSummary(fontScreen([sys], { boxes: [] })).atRisk, 'n/a');
  // A named box the read could not find again is unknown, never no.
  assert.equal(fit.fontReadSummary(fontScreen([{ ...sys, inBox: false }], { boxes: [{ name: 'div.modal', found: false }] })).atRisk, 'unknown');
  const s = fit.fontReadSummary(fontScreen([sys, cus, { sel: 'b', kind: 'text', inBox: false, fonts: [] }]));
  assert.deepEqual([s.system.length, s.custom.length, s.mixed.length, s.unread.length], [1, 1, 0, 1]);
});

test('gh#287 fmtFontRead / fmtFontRoute: every line carries the FONT_READ prefix, the screen identity and the counts', () => {
  const sys = { sel: 'li', kind: 'text', inBox: true, fonts: THONBURI_LI };
  const line = fit.fmtFontRead('one-bomb', '320x568', fontScreen([sys]));
  assert.match(line, /^FONT_READ one-bomb 320x568 press 2 overflow 40px system=1 custom=0 mixed=0 unread=0 at-risk=yes/);
  assert.match(line, /li \.ThonburiUI:56,\.SF NS:6/);
  const route = fit.fmtFontRoute('one-bomb', [
    { vp: '320x568', screen: fontScreen([sys]) },
    { vp: '390x844', screen: fontScreen([{ ...sys, inBox: false }]) },
  ]);
  assert.equal(route, 'FONT_READ ROUTE one-bomb system=1 at-risk-screens=320x568/p2');
});

// gh#287 REFUTE round 1 — the FONT_READ collector and its driver half, run END TO END against a minimal
// fake page and a fake CDP session. The collector string is executed as the browser would execute it,
// and readFonts makes the same protocol calls it makes in Chrome; only the page and the protocol replies
// are fakes. What this cannot cover is whether Chrome answers the way the fake does -- the browser leg
// owns that, and the Mac run's CAL line is its calibration.
const TH = '\u0E44\u0E17\u0E22';
const SYS = [{ familyName: '.ThonburiUI', isCustomFont: false, glyphCount: 3 }];
const CUS = [{ familyName: 'Sarabun', isCustomFont: true, glyphCount: 3 }];
class FText {
  constructor(data, fonts) { this.nodeType = 3; this.data = data; this.fonts = fonts; this.parentElement = null; }
}
class FEl {
  constructor(tag, o = {}, kids = []) {
    this.nodeType = 1; this.tagName = tag.toUpperCase(); this.id = o.id || ''; this.className = o.cls || '';
    this.o = o; this.fonts = o.fonts; this.placeholder = o.placeholder; this.value = o.value;
    this.childNodes = []; this.parentElement = null;
    for (const k of kids) { k.parentElement = this; this.childNodes.push(k); }
  }
  get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
  get clientHeight() { return this.o.clientHeight ?? 100; }
  get scrollHeight() { return this.clientHeight + (this.o.over ?? 0); }
  get clientWidth() { return 100; }
  get scrollWidth() { return 100; }
  getClientRects() { return this.o.hidden ? [] : [{}]; }
  getBoundingClientRect() { return { width: 10, height: 10, left: 0, top: 0, right: 10, bottom: 10 }; }
  contains(n) { for (let x = n; x; x = x.parentElement) if (x === this) return true; return false; }
  simple(sel) {
    if (sel === '*') return true;
    const m = /^([a-z0-9]*)((?:[#.][\w-]+)*)$/i.exec(sel);
    if (!m) throw new Error(`fake page cannot match selector ${sel}`);
    if (m[1] && m[1].toUpperCase() !== this.tagName) return false;
    return (m[2].match(/[#.][\w-]+/g) || []).every((p) => (p[0] === '#' ? this.id === p.slice(1) : this.className.split(/\s+/).includes(p.slice(1))));
  }
  matches(sel) {
    return sel.split(',').some((s) => {
      const parts = s.trim().split(/\s+/);
      if (!this.simple(parts.at(-1))) return false;
      let i = parts.length - 2;
      for (let a = this.parentElement; a && i >= 0; a = a.parentElement) if (a.simple(parts[i])) i -= 1;
      return i < 0;
    });
  }
  closest(sel) { for (let x = this; x; x = x.parentElement) if (x.matches(sel)) return x; return null; }
  all() { const out = []; const w = (e) => { for (const c of e.children) { out.push(c); w(c); } }; w(this); return out; }
  querySelectorAll(sel) { return this.all().filter((e) => e.matches(sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
}
const fel = (tag, o, kids) => new FEl(tag, o, kids);
function fakeFontPage(root, { hosted = ['Sarabun', 'Mitr'] } = {}) {
  const body = fel('body', {}, [root]);
  const html = fel('html', {}, [body]);
  const hidden = (n) => { for (let x = n.nodeType === 3 ? n.parentElement : n; x; x = x.parentElement) if (x.o.hidden) return true; return false; };
  const document = {
    documentElement: html, body,
    querySelector: (sel) => html.querySelector(sel),
    querySelectorAll: (sel) => html.querySelectorAll(sel),
    createTreeWalker: (r) => {
      const list = [];
      const w = (e) => { for (const c of e.childNodes) { if (c.nodeType === 3) list.push(c); else w(c); } };
      w(r);
      let i = 0;
      return { nextNode: () => list[i++] ?? null };
    },
    createRange: () => { let n = null; return { selectNodeContents(x) { n = x; }, getClientRects: () => (hidden(n) ? [] : [{}]) }; },
    fonts: hosted.map((family) => ({ family })),
    createElement: () => ({ getContext: () => null }),
  };
  const getComputedStyle = (e, p) => ({
    content: p ? (e.o.pseudo?.[p.slice(2)] ?? 'none') : 'normal',
    fontFamily: e.o.font ?? 'system-ui', visibility: 'visible', display: 'block', overflowY: 'visible', overflowX: 'visible',
  });
  const window = {};
  const run = (code) => new Function('window', 'document', 'getComputedStyle', 'NodeFilter', 'innerHeight', code)(window, document, getComputedStyle, { SHOW_TEXT: 4 }, 568);
  return { window, document, run };
}
function fakeFontSession(page) {
  const objs = new Map(); const ids = new Map(); const byId = new Map(); const back = new Map();
  let oid = 0; let nid = 0; let bid = 0;
  const reg = (v) => { const k = `o${++oid}`; objs.set(k, v); return k; };
  const nodeId = (n) => { if (!ids.has(n)) { ids.set(n, ++nid); byId.set(nid, n); } return ids.get(n); };
  const backId = (v) => { back.set(++bid, v); return bid; };
  const cdp = async (method, p = {}) => {
    if (method === 'DOM.getDocument') return { result: {} };
    if (method === 'Runtime.evaluate') {
      const v = page.window[JSON.parse(/window\[(".*?")\]/.exec(p.expression)[1])];
      return { result: { result: v ? { objectId: reg(v) } : { type: 'undefined' } } };
    }
    if (method === 'Runtime.getProperties') {
      return { result: { result: [...objs.get(p.objectId).map((v, i) => ({ name: String(i), value: { objectId: reg(v) } })), { name: 'length', value: {} }] } };
    }
    if (method === 'DOM.requestNode') return { result: { nodeId: nodeId(objs.get(p.objectId)) } };
    if (method === 'CSS.getPlatformFontsForNode') {
      const n = byId.get(p.nodeId);
      return n.fonts === 'error' ? { error: { message: 'fake protocol error' } } : { result: { fonts: n.fonts ?? [] } };
    }
    if (method === 'DOM.describeNode') {
      const n = byId.get(p.nodeId);
      return { result: { node: {
        pseudoElements: Object.entries(n.o.pseudoFonts ?? {}).map(([pseudoType, fonts]) => ({ pseudoType, backendNodeId: backId({ fonts }) })),
        shadowRoots: n.o.shadow ? [{ nodeType: 11, children: n.o.shadow.map((s) => ({ nodeType: 1, attributes: s.hidden ? ['style', 'display: none !important;'] : [],
          children: [{ nodeType: 3, nodeValue: s.text, backendNodeId: backId({ fonts: s.fonts }) }] })) }] : [],
      } } };
    }
    if (method === 'DOM.pushNodesByBackendIdsToFrontend') return { result: { nodeIds: p.backendNodeIds.map((b) => nodeId(back.get(b))) } };
    throw new Error(`fake session has no ${method}`);
  };
  const evaluate = async (code) => { try { return { value: page.run(code) }; } catch (err) { return { error: String(err) }; } };
  return { cdp, evaluate };
}
const NO_OVER = { scrollPx: 0, clippedPx: 0, overflowXPx: 0, scrollFrom: null, clipFrom: null, overflowXFrom: null };
async function fontReadOf(root, m = NO_OVER, cal = false, stash = null, { mutate = null } = {}) {
  const page = fakeFontPage(root);
  if (stash) {
    // What MEASURE does under the knob: stash the named boxes, then run the REAL snapshot over them.
    page.window[fit.FONT_BOXES_KEY ?? '__watduangFontBoxes'] = stash;
    page.run(fit.FONT_SNAPSHOT ?? '');
  }
  if (mutate) mutate(page);
  const read = await fit.readFonts(fakeFontSession(page), m, cal);
  const screen = { press: 0, draw: null, overflowPx: Math.max(m.scrollPx, m.clippedPx), ...m, fontRead: read };
  return { read, screen, sum: fit.fontReadSummary(screen) };
}

test('MUST-RED gh#287 R1-1: one Thai fragment that reads empty or errors makes its host unread, never absorbed by a sibling fragment', async () => {
  for (const bad of [[], 'error']) {
    const { sum } = await fontReadOf(fel('div', { id: 'app' }, [fel('p', {}, [new FText(TH, CUS), new FText(TH, bad)])]));
    assert.deepEqual([sum.custom.length, sum.unread.length], [0, 1], `second fragment ${JSON.stringify(bad)}`);
  }
});

test('MUST-RED gh#287 R1-2: at-risk joins to the box MEASURE stashed, not the first element sharing its name', async () => {
  const first = fel('div', { cls: 'same', over: 50 }, [new FText(TH, CUS)]);
  const second = fel('div', { cls: 'same', over: 50 }, [new FText(TH, SYS)]);
  const m = { ...NO_OVER, scrollPx: 50, scrollFrom: 'div.same' };
  const { sum } = await fontReadOf(fel('div', { id: 'app' }, [first, second]), m, false, { scroll: second });
  assert.equal(sum.atRisk, 'yes');
  // No stash (MEASURE ran without the knob, or the box left the document): unknown, never a guess.
  assert.equal((await fontReadOf(fel('div', { id: 'app' }, [first, second]), m, false, null)).sum.atRisk, 'unknown');
});

test('MUST-RED gh#287 R1-3: only a weight or style word may follow a hosted family name', () => {
  assert.deepEqual(fit.fontVerdict([{ familyName: 'Sarabun Unrelated', isCustomFont: true, glyphCount: 3 }], ['Sarabun']).anomalies, ['Sarabun Unrelated']);
  for (const ok of ['Mitr Medium', 'Sarabun SemiBold Italic', 'Sarabun Italic', 'Sarabun ExtraLight', 'Sarabun']) {
    assert.deepEqual(fit.fontVerdict([{ familyName: ok, isCustomFont: true, glyphCount: 3 }], ['Sarabun', 'Mitr']).anomalies, [], ok);
  }
});

const howPage = (liFonts, liFamilies) => fel('div', { id: 'app' }, [
  fel('div', { id: 'howModal' }, [fel('ul', {}, liFonts.map((f, i) => fel('li', { font: liFamilies[i] }, [new FText(TH, f)])))]),
  fel('p', { font: 'Sarabun, system-ui' }, [new FText(TH, CUS)]),
]);

test('MUST-RED gh#287 R1-4: the Sarabun calibration half never takes an entry the how-to-play half owns', async () => {
  // The wrong li is Sarabun-first and reads custom. It must stay in the how half and make CAL WRONG.
  const { screen } = await fontReadOf(howPage([CUS, SYS], ['Sarabun, system-ui', 'system-ui']), NO_OVER, true);
  assert.match(fit.fmtFontCal('one-bomb', '320x568', screen), /howModal-li=system 1\/2 .*calibration=WRONG/);
  // Positive control: every li system and a separate Sarabun element custom reads OK.
  const good = await fontReadOf(howPage([SYS, SYS], ['system-ui', 'system-ui']), NO_OVER, true);
  assert.match(fit.fmtFontCal('one-bomb', '320x568', good.screen), /howModal-li=system 2\/2 sarabun-el=p custom .*calibration=OK/);
});

test('MUST-RED gh#287 R1-5: a sideways-only overflow names its box, so at-risk is answered rather than n/a', async () => {
  const wide = fel('div', { cls: 'wide' }, [new FText(TH, SYS)]);
  const m = { ...NO_OVER, overflowXPx: 30, overflowXFrom: 'div.wide' };
  assert.equal((await fontReadOf(fel('div', { id: 'app' }, [wide]), m, false, { x: wide })).sum.atRisk, 'yes');
});

test('MUST-RED gh#287 R1-6: Thai in the mockup root\'s own pseudo-element is read; its own text already is', async () => {
  const root = fel('div', { id: 'app', pseudo: { after: `"${TH}"` }, pseudoFonts: { after: SYS } }, []);
  const { sum } = await fontReadOf(root);
  assert.deepEqual(sum.system.map((e) => e.sel), ['div#app::after']);
  // Guard, green before the fix too: a text node directly under the root is in the set.
  const own = await fontReadOf(fel('div', { id: 'app' }, [new FText(TH, SYS)]));
  assert.deepEqual(own.sum.system.map((e) => e.sel), ['div#app']);
});

test('MUST-RED gh#287 R1-7: a partial or EAGAIN write is finished, never dropped', () => {
  const text = 'x'.repeat(200011);
  const got = [];
  let calls = 0;
  const write = (fd, buf, off = 0, len = undefined) => {
    calls += 1;
    if (calls === 2) throw Object.assign(new Error('EAGAIN'), { code: 'EAGAIN' });
    const b = typeof buf === 'string' ? Buffer.from(buf) : buf;
    const n = Math.min(len ?? b.length - off, 65536);
    got.push(b.subarray(off, off + n));
    return n;
  };
  const fell = [];
  fit.fontWriteAll(3, text, { write, fallback: (b) => fell.push(Buffer.from(b)), sleep: () => {} });
  assert.equal(Buffer.concat(got).length, 200011);
  assert.equal(fell.length, 0);
  // Any other error hands the REST to the fallback, so no byte is lost.
  const half = [];
  const fell2 = [];
  let n2 = 0;
  fit.fontWriteAll(3, text, {
    write: (fd, buf, off = 0) => { n2 += 1; if (n2 > 1) throw Object.assign(new Error('EBADF'), { code: 'EBADF' }); const b = typeof buf === 'string' ? Buffer.from(buf) : buf; half.push(b.subarray(off, off + 100)); return 100; },
    fallback: (b) => fell2.push(Buffer.from(b)), sleep: () => {},
  });
  assert.equal(Buffer.concat([...half, ...fell2]).length, 200011);
});

// gh#287 REFUTE round 2 — A: the at-risk join is to the members the box held AT MEASURE, frozen by the
// real snapshot MEASURE runs under the knob, then re-checked for drift before they are trusted.
const detachNode = (n) => { const p = n.parentElement; p.childNodes.splice(p.childNodes.indexOf(n), 1); n.parentElement = null; };
const moveNode = (n, to) => { detachNode(n); n.parentElement = to; to.childNodes.push(n); };
const BOX_M = { ...NO_OVER, scrollPx: 40, scrollFrom: 'div.box' };

test('MUST-RED gh#287 R2-A1: system Thai that leaves the box between MEASURE and the read still makes it at-risk', async () => {
  const t = new FText(TH, SYS);
  const box = fel('div', { cls: 'box', over: 40 }, [fel('p', {}, [t])]);
  const out = fel('div', { cls: 'out' }, []);
  const { sum } = await fontReadOf(fel('div', { id: 'app' }, [box, out]), BOX_M, false, { scroll: box }, { mutate: () => moveNode(t, out) });
  assert.equal(sum.atRisk, 'yes');
});

test('gh#287 R2-A2: a frozen member that left the document makes at-risk unknown', async () => {
  const gone = new FText(TH, CUS);
  const box = fel('div', { cls: 'box', over: 40 }, [fel('p', {}, [new FText(TH, CUS)]), fel('p', {}, [gone])]);
  const { sum } = await fontReadOf(fel('div', { id: 'app' }, [box]), BOX_M, false, { scroll: box }, { mutate: () => detachNode(gone) });
  assert.equal(sum.atRisk, 'unknown');
});

test('gh#287 R2-A3: system text added to the box after MEASURE is not a member, so all-custom members read no', async () => {
  const p = fel('p', {}, [new FText(TH, CUS)]);
  const box = fel('div', { cls: 'box', over: 40 }, [p]);
  const { sum } = await fontReadOf(fel('div', { id: 'app' }, [box]), BOX_M, false, { scroll: box }, {
    // In its own element, so it cannot hide as mixed inside a frozen member's host.
    mutate: () => { const late = fel('p', {}, [new FText(TH, SYS)]); late.parentElement = box; box.childNodes.push(late); },
  });
  assert.equal(sum.atRisk, 'no');
});

test('gh#287 R2-A4: a member whose host font changed since MEASURE makes at-risk unknown', async () => {
  const p = fel('p', { font: 'Sarabun, system-ui' }, [new FText(TH, CUS)]);
  const box = fel('div', { cls: 'box', over: 40 }, [p]);
  const { sum } = await fontReadOf(fel('div', { id: 'app' }, [box]), BOX_M, false, { scroll: box }, { mutate: () => { p.o.font = 'system-ui'; } });
  assert.equal(sum.atRisk, 'unknown');
});

test('MUST-RED gh#287 R2-B: a FONT_READ line the child had to send to stderr reaches the parent', async () => {
  const os = await import('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fontread-child-'));
  try {
    const child = path.join(dir, 'child.mjs');
    const probeUrl = new URL('./play-screen-fit-probe.mjs', import.meta.url).href;
    fs.writeFileSync(child, `import fs from 'node:fs';\nconst { fontEmit } = await import(${JSON.stringify(probeUrl)});\nfs.closeSync(3);\nfontEmit('FONT_READ fixture-line');\nprocess.exit(0);\n`);
    const outFd = fs.openSync(path.join(dir, 'out.json'), 'w');
    const fd3 = fs.openSync(path.join(dir, 'fd3.txt'), 'w');
    const forwarded = [];
    let run;
    try {
      run = fit.spawnDriverChild([child], { cwd: dir, outFd, env: process.env, fontRead: true, stdoutFd: fd3, forward: (s) => forwarded.push(s) });
    } finally { fs.closeSync(outFd); fs.closeSync(fd3); }
    assert.equal(run.status, 0, run.stderr);
    assert.match(forwarded.join(''), /^FONT_READ fixture-line$/m);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
