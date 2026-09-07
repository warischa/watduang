// The round rules of this route, driven as the shipped bytes rather than as a copy of them.
//
// main.js keeps the mockup's two logic markers, and everything between them is pure: the constants
// table, the seeded track generator, one simulation step, and the ranking. This file slices that
// block out of the SHIPPED file and evaluates it, so a wrong sign or comparison anywhere in the rules
// goes red here instead of in a browser. Nothing below re-implements a rule — if the slice stops
// exporting one of the four names, the load assertion fails loudly rather than passing on nothing.
//
// The four obstacle kinds get one must-end and one must-survive input each. A check that only ever
// feeds an input the game survives measures nothing about a rule that ends a turn, and the reverse is
// equally true, so both directions are here for every kind.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');
const start = source.indexOf('// @logic-start');
const end = source.indexOf('// @logic-end');
assert.ok(start !== -1 && end > start,
  'main.js no longer carries the two logic markers — this file would be measuring nothing');
const L = new Function(
  `${source.slice(start, end)}\nreturn { RULES, buildTrack, newDrive, stepDrive, rankPlayers };`,
)();
const { RULES, buildTrack, newDrive, stepDrive, rankPlayers } = L;
for (const [name, value] of Object.entries(L)) {
  assert.ok(value, `the logic block no longer defines ${name}`);
}

const DT = 1 / 60;

/** The row index of an obstacle kind, so a case names the kind and never a magic number. */
const kindOf = (id) => {
  const i = RULES.OBSTACLES.findIndex((k) => k.id === id);
  assert.notEqual(i, -1, `no obstacle kind ${id} in the table`);
  return i;
};
const ob = (id, lane, dir = 1) => ({ kind: kindOf(id), lane, dir });
const straight = (n, obs = {}) =>
  Array.from({ length: n }, (_, i) => ({ curve: 0, obstacle: i in obs ? obs[i] : null }));

/** Drives one turn with a fixed steering programme and reports the frame it ended on, if it did. */
function run(track, steerAt, maxFrames, x0 = 0) {
  const d = newDrive();
  d.x = x0;
  for (let f = 0; f < maxFrames; f++) {
    const r = stepDrive(d, track, steerAt(f), DT);
    if (r) return { r, d, f };
  }
  return { r: null, d, f: maxFrames };
}

// STEER is a feel-tuned scalar the owner raised from 1.8 to 2.8 because turning was too slow. It
// lives in main.js, which scripts/extract-mockup.mjs owns and rewrites from the mockup. The gates
// against losing it are the extractor's own pre-write refusal and the fragment recorded in
// src/play/_divergences.json; this test is the third check, and the only one that fails on a WRONG
// value rather than on a rewrite.
//
// BE HONEST ABOUT WHAT THE TWO ASSERTIONS ARE. They are one predicate in two units, not a constant
// check plus an independent outcome check. On a zero-curve track with no obstacle, CENTRIFUGAL
// contributes nothing and no slide starts, so 30 frames of full lock from x = -0.9 land at exactly
// -0.9 + STEER/2 -- which makes `d.x >= 0.3` algebraically identical to `STEER >= 2.4`. The floor is
// the load-bearing line; the travel assertion restates it in the units a reader can picture, and
// would only diverge if the integration itself changed. An earlier version of this comment claimed
// the travel line "measures the outcome rather than the constant". It does not, and saying so made
// the test look better guarded than it is.
//
// The distance deliberately stops well short of OFFROAD_X. A first version drove the full road width
// and went off the edge at frame 41, which reads as a game regression when it is only a badly chosen
// budget. Note the ceiling that leaves: at STEER >= 4.0 the car clears OFFROAD_X inside 30 frames and
// this test reds on "the turn ended" -- the same misread, from the other side. A raise past 4.0 needs
// the budget re-derived, not the message re-read.
test('STEER keeps the raise: full lock travels further than 1.8 could in the same frames', () => {
  assert.ok(RULES.STEER >= 2.4, `STEER is ${RULES.STEER} -- the owner's raise was reverted`);
  const steered = run(straight(400), () => 1, 30, -0.9);
  assert.equal(steered.r, null, `the turn ended at frame ${steered.f} instead of just steering`);
  assert.ok(steered.d.x >= 0.3,
    `full lock reached only ${steered.d.x} half-widths in 30 frames -- steering is back to slow`);
});

test('same seed gives the same road including kinds, lanes and directions', () => {
  const a = JSON.stringify(buildTrack(7, 500));
  const b = JSON.stringify(buildTrack(7, 500));
  const c = JSON.stringify(buildTrack(8, 500));
  assert.equal(a, b);
  assert.notEqual(a, c);
  // The equality above only covers kind/lane/dir if they are really on the emitted shape.
  const first = buildTrack(7, 500).find((s) => s.obstacle !== null).obstacle;
  assert.deepEqual(Object.keys(first).sort(), ['dir', 'kind', 'lane']);
  assert.ok([-1, 1].includes(first.dir) && [-1, 0, 1].includes(first.lane));
});

test('all four kinds appear on one generated road', () => {
  const kinds = new Set(buildTrack(42, 6000).filter((s) => s.obstacle !== null).map((s) => s.obstacle.kind));
  assert.equal(kinds.size, RULES.OBSTACLES.length);
  assert.equal(RULES.OBSTACLES.length, 4);
});

test('no obstacle inside the grace run-up, never two closer than MIN_GAP, and plenty over 30 km', () => {
  const t = buildTrack(42, 6000);
  let last = -Infinity;
  let count = 0;
  t.forEach((s, i) => {
    if (s.obstacle === null) return;
    assert.ok(i >= RULES.GRACE_SEGS, `obstacle at segment ${i}`);
    assert.ok(i - last >= RULES.MIN_GAP, `gap too small at segment ${i}`);
    last = i;
    count++;
  });
  assert.ok(count > 50, `only ${count} obstacles`);
});

test('LETHAL rock: in the car lane ends the turn on entering its segment; one lane over does not', () => {
  const hit = run(straight(100, { 3: ob('rock', 0) }), () => 0, 600);
  assert.equal(hit.r, 'crash');
  assert.equal(hit.d.hitKind, 'rock');
  assert.ok(hit.d.pos >= 3 * RULES.SEG_LEN && hit.d.pos < 4 * RULES.SEG_LEN, `crashed at ${hit.d.pos} m`);
  assert.equal(run(straight(100, { 3: ob('rock', 1) }), () => 0, 600).r, null);
});

test('LETHAL cone: in the car lane ends the turn; one lane over does not', () => {
  const hit = run(straight(100, { 3: ob('cone', 0) }), () => 0, 600);
  assert.equal(hit.r, 'crash');
  assert.equal(hit.d.hitKind, 'cone');
  assert.equal(run(straight(100, { 3: ob('cone', 1) }), () => 0, 600).r, null);
});

test('CONTROL puddle: never ends the turn itself, but the drift it starts can carry the car off the road', () => {
  // must-survive: hands off in the middle of the road, the car lives and is measurably pushed aside.
  const alive = run(straight(100, { 3: ob('puddle', 0, 1) }), () => 0, 200);
  assert.equal(alive.r, null);
  const puddle = RULES.OBSTACLES[kindOf('puddle')];
  const drift = puddle.drift * puddle.slide;
  assert.ok(alive.d.x > drift * 0.9, `puddle moved the car only ${alive.d.x} half-widths`);
  // ...and the same puddle weakens steering while it lasts. Steer only inside the slide window and
  // subtract the drift-only run, so what is compared is the steering gain alone.
  const steerLate = (f) => (f >= 60 && f < 90 ? 1 : 0);
  assert.ok(puddle.steerScale < 1, `puddle steerScale is ${puddle.steerScale} — it changes nothing`);
  const puddleTrack = straight(100, { 3: ob('puddle', 0, 1) });
  const driftOnly = run(puddleTrack, () => 0, 90).d.x;
  const gainOnPuddle = run(puddleTrack, steerLate, 90).d.x - driftOnly;
  const gainOnGrip = run(straight(100), steerLate, 90).d.x;
  assert.ok(gainOnPuddle > 0, `steering died completely on the puddle: ${gainOnPuddle}`);
  assert.ok(gainOnPuddle < gainOnGrip * 0.6, `steering gain ${gainOnPuddle} vs ${gainOnGrip} — not weakened`);
  // must-end: near the edge, the drift alone takes the car out — and the SAME line without the
  // puddle survives, so this pins the puddle and not "0.8 goes off anyway".
  const off = run(straight(100, { 3: ob('puddle', 1, 1) }), () => 0, 200, 0.8);
  assert.equal(off.r, 'offroad');
  assert.equal(run(straight(100), () => 0, 200, 0.8).r, null, 'the control line must survive');
});

test('CONTROL banana: never ends the turn itself, but its sideways kick can put the car off the road', () => {
  // must-survive: kicked in the middle of the road, the car lives and moves by the table's kick.
  const alive = run(straight(100, { 3: ob('banana', 0, 1) }), () => 0, 60);
  assert.equal(alive.r, null);
  const kick = RULES.OBSTACLES[kindOf('banana')].kick;
  assert.ok(kick > 0, `banana kick is ${kick} — it changes nothing`);
  assert.ok(Math.abs(alive.d.x - kick) < 0.02, `banana moved the car ${alive.d.x}, expected ${kick}`);
  // The kick is signed by the seeded direction, so one seed gives every player the same outcome.
  const left = run(straight(100, { 3: ob('banana', 0, -1) }), () => 0, 60);
  assert.ok(Math.abs(left.d.x + kick) < 0.02, `banana ignored its direction: ${left.d.x}`);
  // must-end: near the edge the kick alone crosses OFFROAD_X, while the same line without it lives.
  const off = run(straight(100, { 3: ob('banana', 1, 1) }), () => 0, 200, 0.8);
  assert.equal(off.r, 'offroad');
  assert.equal(run(straight(100), () => 0, 200, 0.8).r, null, 'the control line must survive');
});

test('a control hazard is never lethal and a lethal one never merely nudges', () => {
  for (const k of RULES.OBSTACLES) {
    if (k.lethal) assert.ok(k.kick === 0 && k.slide === 0, `${k.id} is lethal and also nudges`);
    else assert.ok(k.kick !== 0 || k.drift !== 0, `${k.id} is a control kind that changes nothing`);
  }
});

test('holding right leaves the road on the right; hands off on a straight never ends', () => {
  const off = run(straight(400), () => 1, 600);
  assert.equal(off.r, 'offroad');
  assert.ok(off.d.x > RULES.OFFROAD_X, `x = ${off.d.x}`);
  assert.equal(run(straight(400), () => 0, 600).r, null);
});

test('a right-hand bend pushes an unsteered car off the LEFT edge', () => {
  const bend = straight(400).map((s) => ({ ...s, curve: 0.3 }));
  const off = run(bend, () => 0, 3000);
  assert.equal(off.r, 'offroad');
  assert.ok(off.d.x < 0, `x = ${off.d.x}`);
});

test('longest run first, turn order breaks ties, everyone tied on the shortest run is hit', () => {
  const r1 = rankPlayers([{ name: 'A', metres: 120 }, { name: 'B', metres: 80 }, { name: 'C', metres: 80 }]);
  assert.deepEqual(r1.order.map((r) => r.name), ['A', 'B', 'C']);
  assert.deepEqual(r1.losers.map((r) => r.name), ['B', 'C']);
  const r2 = rankPlayers([{ name: 'X', metres: 50 }, { name: 'Y', metres: 90 }, { name: 'Z', metres: 90 }]);
  assert.deepEqual(r2.order.map((r) => r.name), ['Y', 'Z', 'X']);
  assert.deepEqual(r2.losers.map((r) => r.name), ['X']);
});
