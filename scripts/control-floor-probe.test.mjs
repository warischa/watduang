// The pure half of scripts/control-floor-probe.mjs: claimsFor(), the pass/fail classifier for ONE
// measured control. Node-only, no browser, no dist/ — a classification table is pure, so it is tested
// here in seconds rather than by driving eleven mockups (gh#214).
//
// WHAT THE FOURTH KEY IS FOR. atLeastTapWidth is REPORTED by the probe, never gated: the owner ruled
// 2026-09-06 that a nine-column board cannot give every cell the tap minimum on a 320px screen, so a
// width red would block every push on a geometry the product has not ruled on yet. This file pins the
// classifier's answers, which is the half that has to be right whichever way that ruling goes; that
// the probe does not exit non-zero on it is pinned by the probe's own gating expression, not here.
//
// The four cases are the whole 2x2: a control can fail on width only, on height only, on both, or on
// neither, and the two axes are read from independent fields, so a classifier that folded them
// together would still pass three of these.
import test from 'node:test';
import assert from 'node:assert/strict';
import { claimsFor, EXEMPT_CELL_ROLE, MIN_TAP_PX, widthExempt } from './control-floor-probe.mjs';

// A landing .game-btn that clears everything: it owns a floor, resolves one, and both rendered
// dimensions clear the tap minimum with room to spare.
const ok = { floorOwned: true, floorPx: 44, rectHeight: 48, rectWidth: 120 };
const c = (over) => ({ ...ok, ...over });

test('a control clearing both axes fails no claim', () => {
  const k = claimsFor(ok);
  assert.deepEqual(k, { hasFloor: true, atLeastFloor: true, atLeastTap: true, atLeastTapWidth: true });
});

test('width only: a control that is tall enough and too narrow fails the width claim alone', () => {
  // The shape the ruling is about: a board cell measured at 29.8 x 44 on a 320px screen.
  const k = claimsFor(c({ rectWidth: 29.8 }));
  assert.equal(k.atLeastTapWidth, false);
  assert.equal(k.atLeastTap, true, 'the height axis must not move when only the width fails');
  assert.equal(k.hasFloor && k.atLeastFloor, true);
});

test('height only: the pre-existing tap claim still reds on its own, and width stays green', () => {
  const k = claimsFor(c({ rectHeight: 30 }));
  assert.equal(k.atLeastTap, false);
  assert.equal(k.atLeastTapWidth, true);
});

test('both axes: a control under the minimum in each direction reds both claims independently', () => {
  const k = claimsFor(c({ rectHeight: 30, rectWidth: 29.8 }));
  assert.equal(k.atLeastTap, false);
  assert.equal(k.atLeastTapWidth, false);
});

test('the width claim is asserted on a play-route control too, which owns no floor', () => {
  // floorOwned false switches claims 1 and 2 to not-applicable. The tap minimum belongs to a thumb,
  // not to a stylesheet, so neither axis of it may be waived with them.
  const k = claimsFor({ floorOwned: false, floorPx: NaN, rectHeight: 48, rectWidth: 29.8 });
  assert.deepEqual(k, { hasFloor: true, atLeastFloor: true, atLeastTap: true, atLeastTapWidth: false });
});

test('the width claim carries the same subpixel tolerance as the height claim', () => {
  // A rect and a spec constant can disagree in the last fraction of a device pixel; a control one
  // hundredth under the minimum is a rounding artefact, not a finding worth reporting.
  assert.equal(claimsFor(c({ rectWidth: MIN_TAP_PX - 0.01 })).atLeastTapWidth, true);
  assert.equal(claimsFor(c({ rectWidth: MIN_TAP_PX - 1 })).atLeastTapWidth, false);
});

// gh#214 — THE EXEMPTION CLASS, and the two things it must NOT do. The 2026-09-10 ruling exempts a
// game board's cells from the 44px rule, keyed on the ARIA role the cell declares in the DOM. Pinned
// here rather than only in the browser walk because the predicate is pure, and because both of its
// failure modes are silent: an exemption that also waived the HEIGHT claim would quietly retire the
// one axis this repo has always gated, and an exemption that matched on anything other than the role
// would waive the ordinary narrow controls the owner declined to fix.
test('a board cell declaring the exempt role is exempt from the width claim only', () => {
  const cell = { floorOwned: false, floorPx: NaN, rectHeight: 44, rectWidth: 29.8, role: EXEMPT_CELL_ROLE };
  assert.equal(widthExempt(cell), true);
  // The classifier itself stays pure geometry: it still says the cell is under the width minimum.
  // The exemption lives at the one place that consumes that answer, so nothing here is softened.
  assert.equal(claimsFor(cell).atLeastTapWidth, false);
  // The height axis keeps its existing gating behaviour, exempt role or not.
  assert.equal(claimsFor({ ...cell, rectHeight: 30 }).atLeastTap, false);
});

test('an ordinary narrow control is not exempt, whatever else it declares', () => {
  // short-stick's .icon-btn.remove-p-btn, measured 27.203125 x 44 in this session's walk — the
  // control the owner declined to fix. It must stay in the reported set: the exemption may never
  // grow to cover it.
  assert.equal(widthExempt({ floorOwned: false, rectHeight: 44, rectWidth: 27.203125, role: null }), false);
  assert.equal(widthExempt({ floorOwned: false, rectHeight: 44, rectWidth: 27.203125, role: 'button' }), false);
  assert.equal(widthExempt({ floorOwned: false, rectHeight: 44, rectWidth: 27.203125, role: 'grid' }), false);
});
