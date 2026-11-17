// node --test — the zones round before its draw under 640px (gh#315, round-1 review E1). Opening a ready zones
// round draws data-screen "zones", but the stage only marked round/reveal/final for the phone field layout, so
// the zones idle view kept the fixed projector frame on a phone. This proves the zones screen now carries the
// field mark, that the phone rules really reach the zones markup (the field is .pd-zfield, not .pd-field), and
// that every other screen keeps the marker it had.
//
// Stated ceiling: Node has no layout engine. The CSS legs read the rules and the marker legs read the DOM the
// real stage builds; that the phone stack renders with real fonts and scrolls without clipping is the browser's
// to measure (play-screen-fit-probe), which this run does not start.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fakeOrigin, makeEvent, mount, seedRaw, seeded, storedEvent } from './stage-harness.mjs';
import { advance, drawNext, encodeEvent, revealDrawn } from '../../prize-event/event.ts';

const CSS = fs.readFileSync(path.join(import.meta.dirname, 'play.css'), 'utf8');

/** The body of the phone @media block. */
function phone() {
  const at = CSS.indexOf('@media (max-width: 639px)');
  assert.ok(at > -1, 'no phone block');
  let depth = 0;
  const open = CSS.indexOf('{', at);
  for (let i = open; i < CSS.length; i++) {
    if (CSS[i] === '{') depth++;
    else if (CSS[i] === '}' && --depth === 0) return CSS.slice(open + 1, i);
  }
  throw new Error('unbalanced');
}
/** Declarations of the phone rule whose selector list is exactly `selector`. */
function rule(selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = phone().match(new RegExp(`(?:^|[}\\s])${esc}\\s*\\{([^}]*)\\}`, 'm'));
  assert.ok(m, `no phone rule for ${selector}`);
  return m[1];
}
const F = (s) => `.pd-viewport[data-field] ${s}`;

test('phone zones: the field is in flow, stacked one panel per row, and the page scrolls', () => {
  // The generic field mark already unscales the frame and lets the page scroll; the zones field must join it.
  assert.match(rule('.pd-viewport[data-field]'), /overflow-y:\s*auto/);
  assert.match(rule(F('.pd-scaled')), /transform:\s*none/);
  const zfield = rule(F('.pd-zfield'));
  assert.match(zfield, /position:\s*static/);
  assert.match(zfield, /order:\s*5/);
  assert.match(zfield, /align-self:\s*stretch/);
  // No fixed projector height or row: the panels size to their names and the page scrolls past them.
  assert.match(zfield, /block-size:\s*auto/);
  assert.match(zfield, /grid-auto-rows:\s*auto/);
  assert.match(zfield, /grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.doesNotMatch(zfield, /inset|position:\s*(absolute|fixed)/);
});

test('phone zones: each zone names its people in two columns, rows grow with a wrapped name, at the field size', () => {
  const zgrid = rule(F('.pd-zgrid'));
  assert.match(zgrid, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(zgrid, /gap:\s*4px 10px/);
  // minmax(32px, auto): the field row floor, growing so a wrapped name is never clipped (the page scrolls).
  assert.match(zgrid, /grid-auto-rows:\s*minmax\(32px, auto\)/);
  // The generic phone chip rule sets the fit start size; the zones chip is a .pd-chip, so it takes it.
  assert.match(rule(F('.pd-chip')), /--fit-size:\s*16/);
});

const viewport = (s) => s.root.querySelector('.pd-viewport');
const marks = (s) => {
  const v = viewport(s);
  return {
    screen: s.frame.getAttribute('data-screen'),
    field: v.hasAttribute('data-field'),
    lanes: v.hasAttribute('data-lanes'),
    result: v.hasAttribute('data-result'),
  };
};

/** A stored ladder event at its final, ready (the lane-pick screen). */
function atLadderFinal(origin) {
  let ev = storedEvent(origin, { n: 50, games: { rounds: [null, null, null, null], final: 'ladder' } });
  const rng = seeded(4);
  for (let r = 1; r <= 4; r++) ev = advance(revealDrawn(drawNext(ev, rng)), rng);
  seedRaw(origin, encodeEvent(ev));
  return ev;
}
/** A stored event at its final, ready, with the given final game (null draws the plain final screen). */
function atFinal(origin, game) {
  let ev = storedEvent(origin, { n: 50, games: { rounds: [null, null, null, null], final: game } });
  const rng = seeded(4);
  for (let r = 1; r <= 4; r++) ev = advance(revealDrawn(drawNext(ev, rng)), rng);
  seedRaw(origin, encodeEvent(ev));
  return ev;
}

test('E1: a ready zones round carries the phone field mark', async () => {
  const origin = fakeOrigin();
  storedEvent(origin, { n: 50, games: { rounds: ['zones', null, null, null], final: null } });
  const s = await mount({ origin });
  assert.deepEqual(marks(s), { screen: 'zones', field: true, lanes: false, result: false });
});

test('every other screen keeps the marker it had before the zones mark', async () => {
  // round: a ready plain round.
  const round = fakeOrigin();
  storedEvent(round, { n: 50 });
  assert.deepEqual(marks(await mount({ origin: round })), { screen: 'round', field: true, lanes: false, result: false });
  // reveal: a drawn round.
  const reveal = fakeOrigin();
  seedRaw(reveal, encodeEvent(revealDrawn(drawNext(makeEvent({ n: 50 }), seeded(4)))));
  assert.deepEqual(marks(await mount({ origin: reveal })), { screen: 'reveal', field: true, lanes: false, result: false });
  // final: a ready final with no placement game.
  const final = fakeOrigin();
  atFinal(final, null);
  assert.deepEqual(marks(await mount({ origin: final })), { screen: 'final', field: true, lanes: false, result: false });
  // lanes: the ladder final's picks.
  const lanes = fakeOrigin();
  atLadderFinal(lanes);
  assert.deepEqual(marks(await mount({ origin: lanes })), { screen: 'lanes', field: false, lanes: true, result: false });
  // objects: a pick final's placements.
  const objects = fakeOrigin();
  atFinal(objects, 'envelopes');
  assert.deepEqual(marks(await mount({ origin: objects })), { screen: 'objects', field: false, lanes: true, result: false });
  // result: the final revealed.
  const result = fakeOrigin();
  const ev = atFinal(result, null);
  seedRaw(result, encodeEvent(revealDrawn(drawNext(ev, seeded(5)))));
  assert.deepEqual(marks(await mount({ origin: result })), { screen: 'result', field: false, lanes: false, result: true });
  // cold: no event stored.
  const cold = fakeOrigin();
  assert.deepEqual(marks(await mount({ origin: cold })), { screen: 'cold', field: false, lanes: false, result: false });
});
