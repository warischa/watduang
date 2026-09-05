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
// OVERFLOW_TOLERANCE_PX, the walk leaving the setup screen, and whether the browser-side element scan
// hands the classifier the right arguments. A green here means the bookkeeping is consistent and the
// classification rules do what they say, never that a screen fits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DECLARED_SCROLLER,
  FITS_ROWS,
  KNOWN_OVERFLOW,
  KNOWN_OVERFLOW_X,
  VIEWPORTS,
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
