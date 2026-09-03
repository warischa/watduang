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
// NOT COVERED, and it stays with the browser leg: every measured number. Whether a FITS_ROWS row still
// measures 0px, whether a KNOWN_OVERFLOW row grew past its recorded px, OVERFLOW_TOLERANCE_PX, the
// walk leaving the setup screen. A green here means the bookkeeping is consistent, never that a screen
// fits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FITS_ROWS,
  KNOWN_OVERFLOW,
  VIEWPORTS,
  playRoutes,
  rowKey,
  recordedPx,
} from './play-screen-fit-probe.mjs';

// A narrowed run judges pins it never walked. playRoutes() reads this at call time, so clearing it
// after the (hoisted) import is enough, and it keeps a hand-run `ROUTES_ONLY=x node --test ...` honest.
delete process.env.ROUTES_ONLY;

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

test('no pin is stale — every pinned key is a row the walk produces (probe check ii)', () => {
  const rows = new Set(allRows());
  const stale = [...FITS_ROWS, ...KNOWN_OVERFLOW.keys()].filter((k) => !rows.has(k));
  assert.deepEqual(stale, [], `pinned but never produced: ${stale.join(' | ')}`);
});

test('every KNOWN_OVERFLOW reason parses back to its recorded px', () => {
  for (const [key, reason] of KNOWN_OVERFLOW) {
    const px = recordedPx(reason);
    assert.ok(Number.isInteger(px) && px > 0, `KNOWN_OVERFLOW["${key}"] parsed to ${px} from "${reason}"`);
  }
  // Positive control: the parser must be able to REJECT. Without this, a regex loosened to match
  // anything would leave every assertion above green while parsing nothing.
  assert.throws(() => recordedPx('2px on press 1 - no prefix'), 'recordedPx accepted a reason with no recorded-px prefix');
});
