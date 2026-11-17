// The zones grid's capacity (gh#315, owner ruling 2026-11-17): no chip box ever leaves its zone, its header or
// the result band, for any roster the event accepts -- and an ordinary roster keeps the board's boxes exactly.
// The rule is the cards renderer's: the board's four columns first, then column growth, then the whole grid
// scaled as one. Measured with the SHIPPED Sarabun Bold's own advances, not a per-character guess: a Thai
// cluster is a consonant plus a spacing vowel, and a fake that counts code points understates it by a third.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEvent, drawNext } from '../../../prize-event/event.ts';
import { checkName, nameKey } from '../../../prize-event/names.ts';
import { proposeSchedule } from '../../../prize-draw/schedule.ts';
import { demoNames, demoRng } from '../../_prize-reveal/demo.ts';
import { reveal } from './index.ts';
import { chipHeight, fitNames } from './paint.ts';
import * as plan from './plan.ts';

const { BAND, COL_W, FRAME_H, GRID, NAME_FIT, ZONE_COUNT, gridBox, gridLayout, headBox, panelBox, planFor } = plan;

// Advances in em, read from the shipped subset's own cmap and hmtx (public/fonts/sarabun-bold-subset.ttf,
// 1000 units per em) and cross-checked against CoreText at 18px: NDO NEN 15.912px, DDO PHU THAO 15.768px,
// SARA AM 9.18px, space 4.194px, every digit 10.17px. The marks above and below a consonant are zero-advance,
// so a cluster's width is its consonant plus SARA AM when it carries one. NDO NEN + SARA AM is the widest
// cluster checkName accepts, and NAME_CAP of them is the widest name the event stores.
const EM = new Map([
  [0x0e13, 0.884], [0x0e12, 0.876], [0x0e33, 0.51], [0x20, 0.233],
  ...Array.from({ length: 10 }, (_, d) => [0x30 + d, 0.565]),
]);
const em = (text) => [...text].reduce((w, ch) => w + (EM.get(ch.codePointAt(0)) ?? 0), 0);
const measure = (text, size) => em(text) * size;

const WIDE = 'ณำ';
const NARROW = 'ฒำ';
const BAND_TOP = FRAME_H - BAND.bottom - BAND.height;
/** The widest name the event accepts: NAME_CAP clusters of the widest cluster. */
const widestName = WIDE.repeat(12);
/** `count` distinct names of 12 widest-or-next-widest clusters, so uniqueness never shortens the roster. */
const wideRoster = (count) =>
  Array.from({ length: count }, (_, i) => WIDE.repeat(4) + Array.from({ length: 8 }, (_, b) => ((i >> b) & 1 ? WIDE : NARROW)).join(''));
/** The round-1 review's own roster: four NARROW clusters then eight binary choices. */
const judgeRoster = Array.from({ length: 200 }, (_, i) => NARROW.repeat(4) + Array.from({ length: 8 }, (_, b) => ((i >> b) & 1 ? NARROW : WIDE)).join(''));
const bits = (i, from, count) => Array.from({ length: count }, (_, b) => ((i >> (b + from)) & 1 ? WIDE : NARROW)).join('');
/** Spaced widest names: a space ends a line early, so these wrap to more lines than the unspaced ceiling. */
const spacedRoster = Array.from({ length: 200 }, (_, i) => `${WIDE.repeat(2)} ${bits(i, 0, 4)} ${bits(i, 4, 4)}`);

function fakeDoc() {
  const painted = [];
  return {
    painted,
    createElement(tag) {
      assert.equal(tag, 'canvas', 'the module built a DOM element other than a canvas');
      let font = '10px x';
      const ctx = {
        canvas: null,
        get font() { return font; },
        set font(v) { font = v; },
        measureText(text) {
          const px = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 10);
          return { width: measure(text, px) };
        },
        fillText(text) { painted.push(text); },
        getTransform: () => ({ a: 1 }),
      };
      for (const m of ['setTransform', 'translate', 'save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'closePath', 'fill', 'stroke', 'fillRect', 'clearRect']) ctx[m] = () => {};
      const canvas = { width: 0, height: 0, getContext: () => ctx };
      ctx.canvas = canvas;
      return canvas;
    },
  };
}

/** A committed round 1 for `names`, through the real event code, and the reveal input the projector builds. */
function roundFor(names) {
  assert.ok(names.every((n) => checkName(n).ok), 'the roster holds a name checkName refuses');
  assert.equal(new Set(names.map(nameKey)).size, names.length, 'the roster holds a duplicate key');
  const rng = demoRng(73);
  const ev = createEvent({ eventName: 'Party', names, schedule: proposeSchedule(names.length), prizes: ['TV'], games: { rounds: ['zones', 'zones', 'zones', 'zones'], final: null } }, rng);
  assert.equal(ev.setup.people.length, names.length, 'createEvent did not accept the whole roster');
  const rec = drawNext(ev, rng).rounds[0];
  return { key: `${ev.eventKey}:round1:${rec.code}`, eventName: 'Party', people: ev.setup.people, outcome: { kind: 'round', ...rec }, viewport: { cssWidth: 1920, cssHeight: 1080, dpr: 1 }, reducedMotion: false };
}

/** Mount the real module and read every chip box the GPU is handed, in frame px. */
function chipBoxes(input) {
  const doc = fakeDoc();
  let scene;
  const handle = reveal.mount({ root: { ownerDocument: doc }, signal: new AbortController().signal, own: (r) => r, renderer: { render: (s) => { scene = s; } } }, input, () => {});
  const chips = scene.getObjectByName('chips');
  const rect = chips.geometry.getAttribute('aRect').array;
  const fit = chips.geometry.getAttribute('aFit');
  const p = planFor(input);
  const boxes = p.chips.map((c) => ({
    zone: c.zone,
    x: rect[c.index * 4] - rect[c.index * 4 + 2] / 2,
    y: rect[c.index * 4 + 1] - rect[c.index * 4 + 3] / 2,
    w: rect[c.index * 4 + 2],
    h: rect[c.index * 4 + 3],
    scale: fit ? fit.array[c.index] : 1,
  }));
  handle.dispose();
  return boxes;
}

/** Every box inside its own grid and panel, clear of the header strip and the result band, seated pose included. */
function assertContained(boxes, label) {
  for (const b of boxes) {
    const g = gridBox(b.zone);
    const p = panelBox(b.zone);
    const h = headBox(b.zone);
    const at = `${label} zone ${b.zone} chip at ${b.x},${b.y} ${b.w}x${b.h}`;
    assert.ok(b.x >= g.x - 1e-9 && b.x + b.w <= g.x + g.w + 1e-9, `${at} leaves its grid sideways`);
    assert.ok(b.y >= g.y - 1e-9 && b.y + b.h <= g.y + g.h + 1e-9, `${at} leaves its grid vertically`);
    assert.ok(b.y >= p.y && b.y + b.h <= p.y + p.h, `${at} leaves its panel`);
    assert.ok(b.y + b.h <= h.y || b.y >= h.y + h.h, `${at} overlaps the zone header`);
    assert.ok(b.y + b.h <= BAND_TOP, `${at} reaches the result band`);
    assert.ok(b.y + b.h + 6 * b.scale <= p.y + p.h, `${at} sits down outside its panel`);
  }
}

/** The layout's own boxes, the same invariant before the module hands them to the GPU. */
function assertLayoutContained(layout, zone) {
  assertContained(layout.cells.map((c) => ({ zone, x: c.cx - c.w / 2, y: c.cy - c.h / 2, w: c.w, h: c.h, scale: layout.scale })), `zone ${zone}`);
}

/** Today's boxes, written out from the board rule alone: four columns, rows at their measured heights, centred. */
function boardCells(zone, n, rowH) {
  const g = gridBox(zone);
  const total = rowH.reduce((a, b) => a + b, 0) + GRID.rowGap * Math.max(0, rowH.length - 1);
  const tops = [];
  let y = g.y + (g.h - total) / 2;
  for (const h of rowH) { tops.push(y); y += h + GRID.rowGap; }
  return Array.from({ length: n }, (_, i) => {
    const r = Math.floor(i / GRID.cols);
    const c = i % GRID.cols;
    return { cx: g.x + c * (COL_W + GRID.colGap) + COL_W / 2, cy: tops[r] + rowH[r] / 2, w: COL_W, h: rowH[r] };
  });
}

/** Each zone's members in slot order, their names, and the row heights today's fitter gives them. */
function zonesOf(input) {
  const doc = fakeDoc();
  const p = planFor(input);
  return p.zones.map((z) => {
    const members = p.chips.filter((c) => c.zone === z.index).sort((a, b) => a.slot - b.slot);
    const names = members.map((c) => input.people[c.index].name);
    const own = fitNames(doc, names).map(chipHeight);
    const rowH = Array.from({ length: Math.ceil(members.length / GRID.cols) }, (_, r) => Math.max(...own.slice(r * GRID.cols, (r + 1) * GRID.cols)));
    const linesAt = (box) => fitNames(doc, names, box).map((f) => f.lines.length);
    return { zone: z.index, members, names, rowH, linesAt };
  });
}

for (const [label, names] of [['the judge roster', judgeRoster], ['the real worst case', wideRoster(200)], ['spaced widest names', spacedRoster]]) {
  test(`${label}: 200 accepted heads of 12 clusters, every chip box inside its zone, clear of header and band`, () => {
    const input = roundFor(names);
    const boxes = chipBoxes(input);
    assert.equal(boxes.length, 200, `${label}: not every participant was drawn`);
    assertContained(boxes, label);
    // The rule had to leave the board's four columns for this roster, or the fixture proves nothing.
    const scaled = boxes.some((b) => b.scale < 1);
    assert.ok(scaled, `${label}: the roster fits the board grid, so it exercises no growth`);
  });
}

test('the GPU is handed the scale the pure layout chose, per zone, and the boxes it chose', () => {
  const input = roundFor(wideRoster(200));
  const doc = fakeDoc();
  let scene;
  const handle = reveal.mount({ root: { ownerDocument: doc }, signal: new AbortController().signal, own: (r) => r, renderer: { render: (s) => { scene = s; } } }, input, () => {});
  const chips = scene.getObjectByName('chips');
  const fit = chips.geometry.getAttribute('aFit');
  assert.ok(fit, 'the module never tells the GPU the scale each chip was laid out at');
  const rect = chips.geometry.getAttribute('aRect').array;
  for (const z of zonesOf(input)) {
    const layout = plan.zoneGrid(z.zone, z.members.length, z.linesAt);
    assert.ok(layout.scale < 1, 'the fixture does not scale: this check measures nothing');
    z.members.forEach((c, j) => {
      // The attributes are Float32Arrays, so the GPU holds the layout's numbers at float32 precision.
      assert.equal(fit.array[c.index], Math.fround(layout.scale), `${c.id}: the GPU scale is not the layout's`);
      const cell = layout.cells[j];
      assert.deepEqual(
        [rect[c.index * 4], rect[c.index * 4 + 1], rect[c.index * 4 + 2], rect[c.index * 4 + 3]],
        [cell.cx, cell.cy, cell.w, cell.h].map(Math.fround),
        `${c.id}: the GPU box is not the layout's`,
      );
    });
  }
  handle.dispose();
});

test('the demo roster and 128 widest names keep exactly the board boxes: four columns, no scaling', () => {
  for (const [label, names] of [['demo', demoNames()], ['128 widest', wideRoster(128)]]) {
    const input = roundFor(names);
    const mounted = chipBoxes(input);
    for (const z of zonesOf(input)) {
      const layout = plan.zoneGrid(z.zone, z.members.length, z.linesAt);
      assert.equal(layout.cols, GRID.cols, `${label} zone ${z.zone}: the board columns were abandoned`);
      assert.equal(layout.scale, 1, `${label} zone ${z.zone}: an ordinary roster was scaled`);
      assert.deepEqual(layout.rowH, z.rowH, `${label} zone ${z.zone}: row heights moved`);
      const expected = boardCells(z.zone, z.members.length, z.rowH);
      assert.deepEqual(layout.cells, expected, `${label} zone ${z.zone}: a box moved`);
      z.members.forEach((c, j) => {
        const b = mounted[c.index];
        assert.deepEqual({ cx: b.x + b.w / 2, cy: b.y + b.h / 2, w: b.w, h: b.h }, expected[j], `${label}: chip ${c.id} moved`);
        assert.equal(b.scale, 1, `${label}: chip ${c.id} was scaled`);
      });
    }
  }
});

/** The round-2 review's near-capacity roster: 192 accepted heads, the widest names at slots 0, 4 and 8 of every
 *  zone, so three of the twelve rows wrap. The block reaches 328px in a 331px grid: it FITS, so the rule keeps
 *  the board's four columns at full size -- the branch that has to reserve the seated drop as well. */
function nearCapacityRoster() {
  const names = Array.from({ length: 192 }, (_, i) => `P${i}`);
  const before = roundFor(names);
  const zones = plan.zoneAssignment(plan.eventKeyOf(before.key, 1), 1, before.people.map((p) => p.id));
  const wide = wideRoster(12);
  let k = 0;
  for (const z of zones) {
    for (const slot of [0, 4, 8]) {
      const i = before.people.findIndex((p) => p.id === z[slot]);
      names[i] = wide[k++];
    }
  }
  const after = roundFor(names);
  assert.deepEqual(after.people.map((p) => p.id), before.people.map((p) => p.id), 'widening the names moved the identities, so the wide names are not in the slots chosen');
  return names;
}

test('a roster that fits at full size seats every chip inside its panel: the drop is reserved at scale 1 too', () => {
  const input = roundFor(nearCapacityRoster());
  const mounted = chipBoxes(input);
  assert.equal(mounted.length, 192, 'not every participant was drawn');
  assertContained(mounted, 'the near-capacity roster');
  const cos = Math.cos((plan.T.tiltDeg * Math.PI) / 180);
  for (const z of zonesOf(input)) {
    const layout = plan.zoneGrid(z.zone, z.members.length, z.linesAt);
    const total = layout.rowH.reduce((a, b) => a + b, 0) + GRID.rowGap * (layout.rowH.length - 1);
    const g = gridBox(z.zone);
    // The fixture is the fitting branch, before and after the fix: the board's columns, a block inside the grid,
    // and less than the seated drop to spare. A block with room to spare would measure nothing.
    assert.equal(layout.cols, GRID.cols, `zone ${z.zone}: the fixture left the board columns`);
    assert.ok(total <= g.h && total > g.h - plan.T.lowerPx, `zone ${z.zone}: the block is ${total}px in a ${g.h}px grid, not the near-capacity case`);
    const panel = panelBox(z.zone);
    z.members.forEach((c, j) => {
      // The pose a seated chip ends in: it lowers by the drop at its own scale and tilts back about its own
      // horizontal axis, so its box stands shorter by the cosine of the tilt.
      const cell = layout.cells[j];
      const seated = cell.cy + plan.T.lowerPx * layout.scale + (cell.h / 2) * cos;
      assert.ok(seated <= panel.y + panel.h, `zone ${z.zone} slot ${j}: the seated chip reaches ${seated}px, the panel floor is ${panel.y + panel.h}px`);
      const b = mounted[c.index];
      const gpu = b.y + b.h / 2 + plan.T.lowerPx * b.scale + (b.h / 2) * cos;
      assert.ok(gpu <= panel.y + panel.h, `zone ${z.zone} chip ${c.id}: the pose the GPU is handed reaches ${gpu}px, the panel floor is ${panel.y + panel.h}px`);
    });
  }
});

test('the board entry point keeps its signature and its boxes', () => {
  const rowH = new Array(13).fill(GRID.minRow);
  assert.deepEqual(gridLayout(0, 50, rowH), boardCells(0, 50, rowH));
  assert.deepEqual(gridLayout(0, 2, [GRID.minRow]), boardCells(0, 2, [GRID.minRow]));
});

test('growth: the first column count whose rows fit wins, and a fitting roster is never scaled', () => {
  // Two lines for every name at any width: rows of 36px, so 50 names need seven columns to fit 331px.
  const layout = plan.zoneGrid(0, 50, () => new Array(50).fill(2));
  assert.equal(layout.cols, 7);
  assert.equal(layout.scale, 1);
  assert.deepEqual(layout.rowH, new Array(8).fill(2 * NAME_FIT.floor));
  assertLayoutContained(layout, 0);
  // One line each: the board holds it, untouched.
  const board = plan.zoneGrid(0, 50, () => new Array(50).fill(1));
  assert.equal(board.cols, GRID.cols);
  assert.equal(board.scale, 1);
  assert.deepEqual(board.rowH, new Array(13).fill(GRID.minRow));
  assert.deepEqual(board.cells, boardCells(0, 50, board.rowH));
});

test('when no column count fits, the least-scaling one is taken and the whole grid scales as one', () => {
  // Six lines each: every column count overflows, and the shortest block is the widest grid, ten columns.
  const layout = plan.zoneGrid(0, 50, () => new Array(50).fill(6));
  assert.equal(layout.cols, 10);
  const total = layout.rowH.reduce((a, b) => a + b, 0) + GRID.rowGap * (layout.rowH.length - 1);
  assert.ok(total > gridBox(0).h, 'the fixture does not overflow: this check measures nothing');
  assert.equal(layout.scale, (gridBox(0).h - 6) / total);
  assert.ok(layout.scale < 1);
  assertLayoutContained(layout, 0);
  // Both axes scale together, so a chip keeps its shape and the block stays centred in the grid.
  const g = gridBox(0);
  const first = layout.cells[0];
  const last = layout.cells.at(-1);
  assert.ok(Math.abs(first.w / first.h - layout.colW / layout.rowH[0]) < 1e-9, 'a chip was stretched');
  assert.ok(Math.abs((first.cx - first.w / 2 - g.x) - (g.x + g.w - (last.cx + last.w / 2))) < 1e-6, 'the block is not centred');
});

test('the widest name the event accepts: five columns, and the size the rule yields', () => {
  const input = roundFor(wideRoster(200));
  const [z] = zonesOf(input);
  const layout = plan.zoneGrid(z.zone, z.members.length, z.linesAt);
  // Four columns: 13 rows of two 18px lines = 492px in a 331px grid. Five: 10 rows = 378px, the shortest block
  // any column count gives, still over, so the grid scales as one, reserving the 6px a seated chip lowers.
  assert.ok(Math.abs(em(widestName) - 16.728) < 1e-9, 'the fixture is not the widest accepted name');
  assert.equal(layout.cols, 5);
  assert.deepEqual(layout.rowH, new Array(10).fill(2 * NAME_FIT.floor));
  assert.equal(layout.scale, (gridBox(0).h - 6) / 378);
  const painted = fitNames(fakeDoc(), z.names, layout.nameBox)[0].size * layout.scale;
  assert.equal(painted, NAME_FIT.floor * layout.scale);
  assert.ok(painted > 15, `the rule yielded ${painted}px`);
  assertLayoutContained(layout, z.zone);
});

test('the frame the layout fills is the board own', () => {
  assert.equal(ZONE_COUNT, 4);
  assert.equal(gridBox(0).h, 331);
  assert.equal(BAND_TOP, 890);
});
