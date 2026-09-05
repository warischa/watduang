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
import {
  DECLARED_SCROLLER,
  FITS_ROWS,
  KNOWN_OVERFLOW,
  KNOWN_OVERFLOW_X,
  OVERFLOW_TOLERANCE_PX,
  UNCLASSIFIED_ADVICE,
  VIEWPORTS,
  assertRecordedReasons,
  compositionGaps,
  countsAsHorizontalOverflow,
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
  // Real, measured, and silent for the OTHER reason — the one this fixture exists to pin. The shipped
  // classifier COUNTS this box: div#screen-game.screen.active computes overflow-x:auto purely as the
  // CSS Overflow 3 coercion from the overflow-y beside it, no author rule declares the horizontal axis,
  // and it is taller than the screen bound, so all three exemption conditions miss. The px below is what
  // a narrowed walk of this route measured against a served dist/. The row is silent because
  // KNOWN_OVERFLOW_X holds it, NOT because the classifier clears it — and the loop at the end of this
  // test is what asserts that. An earlier revision pinned 0px here with a chip-strip explanation; that
  // number came from the classifier as it stood before declaredX existed, so the fixture could not have
  // failed for the reason its own comment gave.
  { route: 'wire-snip-panic', vp: '320x568', screens: [{ press: 0, overflowPx: 111, overflowXPx: 43, overflowXFrom: 'div#screen-game.screen.active' }] },
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
