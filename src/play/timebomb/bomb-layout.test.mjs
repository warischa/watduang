// gh#295 A1: the lit end of the fuse must be drawn INSIDE the canvas. It sat above the top edge at
// every size the route renders, so the bomb never looked lit, and every other gate stayed green
// because a clipped spark is still a canvas full of pixels.
//
// This pins the arithmetic: for every box size the route can produce, the spark disc, its glow and
// the worst case of the cosmetic motion all land inside the box. The pixel read of the same thing in a
// real browser is canvas-pixels-probe.mjs beside this file (its `sparkInside`), which is the check
// that was red on the old geometry; this file is what keeps it from coming back on every CI run.
//
// The bounds below are written out from paint()'s own transforms -- translate to the bomb centre
// (cx + sway, groundY - 1.05 r + hover), rotate by the tilt -- not taken from bombLayout(), so a
// layout that mis-reserves its own room reds here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOM_MS, bombLayout, boomMotion, MOTION } from './bomb-canvas.ts';

// The 120px floor at 320x568 (the canvas min-block-size), the phone and desktop boxes measured on the
// built route, and the extremes either side: a tall narrow box and a short wide one.
const BOXES = [
  [288, 120],
  [358, 320],
  [560, 302],
  [560, 414],
  [1408, 320],
  [120, 320],
  [300, 300],
];

function sparkBounds(L) {
  const cy = L.groundY - L.radius * 1.05;
  const reach = L.sparkR + L.glow; // the disc plus its shadowBlur
  let minX = Infinity, maxX = -Infinity, minY = Infinity;
  for (const tilt of [-MOTION.tilt, 0, MOTION.tilt]) {
    const x = L.tipX * Math.cos(tilt) - L.tipY * Math.sin(tilt);
    const y = L.tipX * Math.sin(tilt) + L.tipY * Math.cos(tilt);
    minX = Math.min(minX, L.cx - MOTION.sway + x - reach);
    maxX = Math.max(maxX, L.cx + MOTION.sway + x + reach);
    minY = Math.min(minY, cy - MOTION.hover + y - reach);
  }
  return { minX, maxX, minY };
}

for (const [w, h] of BOXES) {
  test(`gh#295: at ${w}x${h} the lit spark and its glow stay inside the canvas`, () => {
    const L = bombLayout(w, h);
    const b = sparkBounds(L);
    assert.ok(b.minY >= 0, `the spark glow reaches ${b.minY.toFixed(1)}px, above the top edge`);
    assert.ok(b.minX >= 0 && b.maxX <= w, `the spark spans x ${b.minX.toFixed(1)}..${b.maxX.toFixed(1)} in a ${w}px box`);
    // The bottom of the drawing is the ground shadow: centre 0.08 r under the ground line, vertical
    // radius 1.15 r squashed to 0.26.
    const shadowBottom = L.groundY + L.radius * (0.08 + 1.15 * 0.26);
    assert.ok(shadowBottom <= h, `the ground shadow ends at ${shadowBottom.toFixed(1)}px in a ${h}px box`);
    // The cord tip sits above the cap, so a fit that collapsed the cord to nothing would pass the
    // bounds trivially.
    assert.ok(L.tipY < -L.radius - L.capH, 'the cord tip no longer rises above the cap');
  });
}

test('gh#295: the bomb is not shrunk to make it fit -- the 120px floor still draws a usable bomb', () => {
  const L = bombLayout(288, 120);
  assert.ok(L.radius >= 28, `the floor-box bomb radius is ${L.radius.toFixed(1)}px`);
});

test('gh#151: the cord length is a fixed multiple of the radius at every box size', () => {
  const ratios = BOXES.map(([w, h]) => {
    const L = bombLayout(w, h);
    return Number((Math.hypot(L.tipX, L.tipY - L.baseY) / L.radius).toFixed(6));
  });
  assert.equal(new Set(ratios).size, 1, `cord chord / radius differs across boxes: ${ratios.join(', ')}`);
});

// gh#295 A2 (b). The detonation burst settles into a resting frame with nothing left moving: that
// frame is both where the full-motion burst ends and what reduced motion draws straight away, so the
// two cannot drift apart. Before it settles, every term is moving.
test('gh#295: the detonation burst comes to rest -- no shake, full size, no flash -- and is moving before that', () => {
  for (const p of [1, 1.5, 40]) {
    assert.deepEqual(boomMotion(p), { shake: 0, grow: 1, flash: 0 }, `boomMotion(${p}) is not at rest`);
  }
  const start = boomMotion(0);
  assert.ok(start.shake > 0.5 && start.flash > 0.5 && start.grow < 0.5, `the burst starts at rest: ${JSON.stringify(start)}`);
  let last = boomMotion(0);
  for (let p = 0.1; p <= 1.0001; p += 0.1) {
    const m = boomMotion(p);
    assert.ok(m.shake <= last.shake && m.flash <= last.flash && m.grow >= last.grow, `the burst reverses at ${p.toFixed(1)}`);
    last = m;
  }
  assert.ok(BOOM_MS >= 200 && BOOM_MS <= 1000, `a burst of ${BOOM_MS}ms is not "a few hundred ms"`);
});
