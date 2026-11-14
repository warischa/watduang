// The cards reveal's pure timeline (gh#306): beats in order for a deal and for a round; the cards shown
// passing are exactly outcome.survivors; a deal shows no survivor and no rule; an outcome the module could
// only draw by inventing or contradicting something is refused, never repaired.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as plan from './plan.ts';
import { fitName, graphemes } from '../../prize-fireworks/renderer/text-fit.ts';
import { dealInput, people, roundInput } from './fixtures.mjs';

const label = (e) => (e.type === 'beat' ? `${e.beat}:${e.index}` : e.type);

test('deal: one deal beat when the last card lands, then complete; nothing is ever judged or flipped', () => {
  const input = dealInput(people(200), 100);
  const p = plan.planFor(input);
  assert.equal(p.kind, 'deal');
  assert.deepEqual(plan.beatsIn(p, -1, p.total).map(label), ['deal:0', 'complete']);
  assert.equal(p.total, 199 * plan.T.dealStep + plan.T.dealSlide);
  for (const s of p.slots) {
    assert.equal(s.pass, null, `${s.id} has a verdict on a deal`);
    assert.equal(s.judgeAt, null);
  }
  assert.deepEqual(plan.shownPassing(p), []);
  for (let t = 0; t <= p.total + 100; t += 25) {
    assert.equal(plan.flipAt(p, t), 0, 'a deal turned a card face up');
    assert.equal(plan.veilAt(p, t), 0);
    assert.equal(plan.ruleCardAt(p, t, 372).visible, false, 'a deal showed a rule card');
    const band = plan.bandAt(p, t);
    assert.equal(band.centre.kind, 'count');
    assert.equal(band.centre.gold, false);
    assert.equal(band.right.kind, 'text');
    assert.equal(band.right.text, 'ไพ่ของใครของมัน กติกายังไม่ได้สุ่ม');
  }
  assert.equal(plan.bandAt(p, 0).left, 'แจกไพ่แล้ว 0 ใบ');
  assert.equal(plan.bandAt(p, p.total).left, 'แจกไพ่แล้ว 200 ใบ');
  assert.equal(plan.dealtBy(p, p.total), 200);
});

test('round: rule, cut, complete in time order, on the board timings (option B)', () => {
  const p = plan.planFor(roundInput(people(100), 50, 0));
  assert.equal(p.kind, 'round');
  assert.deepEqual(plan.beatsIn(p, -1, p.total).map(label), ['rule:0', 'cut:0', 'complete']);
  const ats = p.beats.map((b) => b.at);
  assert.deepEqual(ats, [...ats].sort((a, b) => a - b));
  assert.equal(p.ruleShownAt, 800);
  assert.equal(p.revealAt, 2000, 'the rule draw is not 2000ms');
  assert.equal(p.flipAt, 3500, 'the drumroll is not 1500ms');
  assert.equal(p.judgeAt, 3500 + 600 + 1200, 'flip then the hold to read');
  assert.equal(p.total, p.judgeAt + 500 + 800);
});

test('round: the cards shown passing are exactly outcome.survivors, for every rule and size tried', () => {
  let checked = 0;
  for (const n of [9, 10, 37, 52, 100, 101, 200]) {
    for (const keep of [5, 6, Math.floor(n / 2), n - 1].filter((k) => k >= 5 && k < n)) {
      for (const rule of [0, 1]) {
        const input = roundInput(people(n), keep, rule);
        const p = plan.planFor(input);
        assert.deepEqual(plan.shownPassing(p), input.outcome.survivors, `n ${n} keep ${keep} rule ${rule}`);
        assert.equal(p.kept, keep);
        checked++;
      }
    }
  }
  assert.ok(checked > 40);
});

test('round: a survivor list with one survivor swapped for a non-survivor is refused, not redrawn', () => {
  const input = roundInput(people(52), 20, 1);
  const out = input.people.map((x) => x.id).find((id) => !input.outcome.survivors.includes(id));
  const swapped = [out, ...input.outcome.survivors.slice(1)];
  assert.throws(() => plan.planFor({ ...input, outcome: { ...input.outcome, survivors: swapped } }), /survivor/);
});

test('round: passing rings come up at the cut; fails dim inside the judge window, from the edges in', () => {
  const p = plan.planFor(roundInput(people(200), 5, 0));
  const fails = p.slots.filter((s) => !s.pass);
  assert.equal(fails.length, 195);
  for (const s of p.slots.filter((x) => x.pass)) assert.equal(s.judgeAt, p.judgeAt);
  for (const s of fails) {
    assert.ok(s.judgeAt >= p.judgeAt, 'a card failed before the cut');
    assert.ok(s.judgeAt + plan.T.failDim <= p.judgeAt + plan.T.judge + 1e-9, 'a fail was still dimming after the judging');
  }
  const d = (s) => Math.hypot(s.cx - plan.STACK.x, s.cy - plan.STACK.y);
  const byTime = [...fails].sort((a, b) => a.judgeAt - b.judgeAt || a.index - b.index).map(d);
  assert.deepEqual(byTime, [...byTime].sort((a, b) => b - a), 'fails are not edges first');
});

test('round: the band names the rule, then the round passed, and the count rolls to the kept number', () => {
  const p = plan.planFor(roundInput(people(100), 50, 0, { round: 2 }));
  assert.equal(plan.bandAt(p, 100), null, 'the band shows while the rule card is up');
  const reveal = plan.bandAt(p, p.revealAt);
  assert.equal(reveal.left, 'เปิดพร้อมกันทั้งห้อง');
  assert.deepEqual(reveal.centre, { kind: 'rule', label: 'กติการอบนี้', rule: plan.COPY.rule[p.rule] });
  const end = plan.bandAt(p, p.total);
  assert.equal(end.left, 'ผ่านรอบที่ 2');
  assert.deepEqual(end.centre, { kind: 'count', value: 50, gold: true });
  assert.deepEqual(end.right, { kind: 'legend' });
  assert.equal(plan.bandAt(p, p.judgeAt).centre.value, 100, 'the count started below the field');
  assert.equal(plan.topLabel(p), 'รอบที่ 2 จาก 4');
  assert.deepEqual(plan.topDots(p), ['done', 'on', 'todo', 'todo', 'todo']);
});

test('the rule card turns face up by the rule beat and is gone when the band takes over', () => {
  const p = plan.planFor(roundInput(people(40), 20, 1));
  assert.equal(plan.ruleCardAt(p, 0, 372).turn, 0);
  assert.equal(plan.ruleCardAt(p, p.ruleShownAt, 372).turn, 1);
  assert.equal(plan.ruleCardAt(p, p.revealAt, 372).visible, false);
  assert.ok(Math.abs(plan.veilAt(p, p.ruleShownAt) - 0.78) < 1e-9);
  assert.equal(plan.veilAt(p, p.revealAt), 0);
  assert.equal(plan.flipAt(p, p.flipAt - 1), 0);
  assert.equal(plan.flipAt(p, p.flipAt + plan.T.flip), 1);
});

test('an outcome the module cannot draw faithfully is refused, never repaired', () => {
  const r = roundInput(people(20), 10, 0);
  const o = r.outcome;
  assert.throws(() => plan.planFor({ ...r, outcome: { ...o, game: 'fireworks' } }), /fireworks/);
  assert.throws(() => plan.planFor({ ...r, outcome: { ...o, kind: 'final' } }), /final/);
  assert.throws(() => plan.planFor({ ...r, outcome: { ...o, survivors: [...o.survivors, 'nobody'] } }), /survivor/);
  assert.throws(() => plan.planFor({ ...r, outcome: { ...o, survivors: [o.survivors[0], ...o.survivors] } }), /survivor/);
  assert.throws(() => plan.planFor({ ...r, outcome: { ...o, rule: 2 } }), /rule/);
  assert.throws(() => plan.planFor({ ...r, people: r.people.slice(1) }), /cards for/);
  assert.throws(() => plan.planFor({ ...r, people: [...r.people].reverse() }), /card 0 is for/);
  assert.throws(() => plan.planFor({ ...r, outcome: { ...o, round: 5 } }), /round/);
});

test('layout: the board metrics hold to 102 cards, then the grid changes and every card stays inside the field', () => {
  const hundred = plan.fieldLayout(100);
  assert.deepEqual([hundred.cols, hundred.s, hundred.cardW, hundred.rowH[0]], [6, 1, plan.CARD.w, plan.CARD.h]);
  for (const n of [9, 52, 102, 103, 150, 200]) {
    const l = plan.fieldLayout(n);
    l.cells.forEach((c, i) => {
      const w = l.cardW * l.s;
      const h = l.rowH[Math.floor(i / l.cols)] * l.s;
      assert.ok(c.cx - w / 2 >= plan.FIELD.left - 1e-6 && c.cx + w / 2 <= plan.FIELD.right + 1e-6, `n ${n}: a card leaves the field sideways`);
      assert.ok(c.cy - h / 2 >= plan.FIELD.top - 1e-6 && c.cy + h / 2 <= plan.FIELD.top + plan.FIELD.height + 1e-6, `n ${n}: a card leaves the field`);
    });
    const keys = new Set(l.cells.map((c) => `${Math.round(c.cx)},${Math.round(c.cy)}`));
    assert.equal(keys.size, n, `n ${n}: two cards share a slot`);
  }
});

// PD-306-01: above 102 names the cards keep the board's sizes (no scaled field) and only the grid changes:
// 32px rows (two name lines at the 16px floor), the fewest columns from 6 that fit the field. The numbers
// are the audit canvas's (docs/verification/evidence/gh305-audit-frames-2026-11-14, frames cards-103/150/200).
test('layout above 102: 6x18, 8x19, 10x20 at the canvas card sizes, never scaled', () => {
  for (const [n, cols, rows, w] of [
    [103, 6, 18, 293],
    [150, 8, 19, 217.3],
    [200, 10, 20, 171.8],
  ]) {
    const l = plan.fieldLayout(n);
    assert.deepEqual([l.cols, l.rows], [cols, rows], `n ${n}`);
    assert.equal(l.s, 1, `n ${n}: the field is scaled`);
    assert.ok(Math.abs(l.cardW - w) < 0.06, `n ${n}: card width ${l.cardW}, the canvas has ${w}`);
    assert.deepEqual(l.rowH, new Array(rows).fill(32), `n ${n}`);
  }
  assert.equal(plan.fieldLayout(102).rows, 17, 'at 102 the board layout is unchanged');
  assert.equal(plan.fieldLayout(102).rowH[0], plan.CARD.h);
});

test('layout above 102: a row grows with its longest name (up to 4 lines at 16px) and the field still holds', () => {
  const cardWs = [];
  const lines = (n, at) => (cardW) => {
    cardWs.push(cardW);
    return Array.from({ length: n }, (_, i) => at[i] ?? 1);
  };
  // The canvas's two grown states: one 3-line name (field used 732) and one 4-line name (748).
  const three = plan.fieldLayout(200, lines(200, { 3: 3 }));
  assert.deepEqual([three.cols, three.s, three.rowH[0], three.rowH[1]], [10, 1, 48, 32], 'the row of a 3-line name is 3 x 16');
  const l = plan.fieldLayout(200, lines(200, { 13: 4, 3: 2 }));
  assert.deepEqual([l.cols, l.s, l.rowH[0], l.rowH[1], l.rowH[2]], [10, 1, 32, 64, 32], 'the row of a 4-line name is 4 x 16');
  assert.ok(cardWs.length > 0, 'the measured line counts were never asked for');
  // Cells follow the grown rows: a row starts below the one above it, rowGap apart.
  const top = (r) => l.cells[r * l.cols].cy - l.rowH[r] / 2;
  assert.ok(Math.abs(top(1) - (top(0) + 32 + plan.CARD.rowGap)) < 1e-9);
  assert.ok(Math.abs(top(2) - (top(1) + 64 + plan.CARD.rowGap)) < 1e-9);
  const used = l.cells.at(-1).cy + 16 - top(0);
  assert.ok(Math.abs(used - 748) < 1e-9, `field used ${used}, the canvas has 748`);
  // Names so long every row needs 4 lines cannot all keep 16px inside the field: the field scales as one
  // (the honest fallback), and still no card leaves it.
  const worst = plan.fieldLayout(200, lines(200, Object.fromEntries(Array.from({ length: 200 }, (_, i) => [i, 4]))));
  assert.ok(worst.s < 1);
  worst.cells.forEach((c, i) => {
    const h = worst.rowH[Math.floor(i / worst.cols)] * worst.s;
    assert.ok(c.cy - h / 2 >= plan.FIELD.top - 1e-6 && c.cy + h / 2 <= plan.FIELD.top + plan.FIELD.height + 1e-6);
  });
});

// The painted size of a name is its card-unit size times the field's scale. At 200 names the old layout
// scaled the field to 0.69, so a name fitted to its 16px floor painted at 11.1px.
test('layout at 200: the widest names on the canvas paint no smaller than the 16px floor', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const measured = JSON.parse(readFileSync(path.join(here, '../../../../docs/verification/evidence/gh305-audit-frames-2026-11-14/measurements.json'), 'utf8'));
  const wide = measured.frames['cards-200'].wide.map((w) => w.name);
  assert.ok(wide.length >= 4);
  const l = plan.fieldLayout(200);
  const { up } = plan.nameBoxes(l.cardW);
  // A fixed-advance stand-in for the font: this proves the scale arithmetic, not the font's widths.
  const measure = (text, size) => graphemes(text).length * size * 0.55;
  for (const name of wide) {
    const fit = fitName(name, measure, plan.NAME_FIT.size, plan.NAME_FIT.floor, up);
    assert.ok(fit.size * l.s >= 16 - 1e-9, `${name}: paints at ${fit.size * l.s}px`);
  }
  assert.ok(Math.abs(up - 87.8) < 0.06, `the name box is ${up}px, the canvas has 87.8`);
});

test('beatsIn is half open: each beat is reported once across consecutive ticks', () => {
  const p = plan.planFor(roundInput(people(30), 10, 0));
  const seen = [];
  let prev = -1;
  for (let t = 0; t <= p.total + 50; t += 17) {
    seen.push(...plan.beatsIn(p, prev, t));
    prev = t;
  }
  assert.deepEqual(seen.map(label), ['rule:0', 'cut:0', 'complete']);
});

// PD-306-03: the cards scene's top bar and round dots sat ~26px left of where the fireworks scene puts them,
// because the drumroll's 3% camera dolly magnifies the plane the bar is drawn on. The fireworks move no
// camera, so its bar lands at the frame's own coordinates; the cards bar must land on the same screen points
// at every moment of the timeline and every viewport. Both sides are computed, never read off a shot.
test('the cards top bar and dots land where the fireworks scene puts them, at every dolly and viewport', () => {
  const TOP = { x: 0, y: 0, w: plan.FRAME_W, h: 96 };
  // The event name's origin, the round dots' right edge, and the bar's four corners.
  const ANCHORS = [[56, 48], [1864, 48], [0, 0], [plan.FRAME_W, 0], [0, 96], [plan.FRAME_W, 96]];
  const p = plan.planFor(roundInput(people(20), 10, 0));
  const dollies = [0, plan.drumroll(p, p.revealAt + plan.T.drumroll / 2).dolly, plan.drumroll(p, p.total).dolly];
  assert.equal(dollies[2], 0.03, 'the drumroll no longer ends on a 3% dolly, so this test no longer drives the shifted state');
  assert.ok(dollies[1] > 0 && dollies[1] < 0.03);
  for (const vp of [{ cssWidth: 1920, cssHeight: 1080 }, { cssWidth: 1366, cssHeight: 768 }, { cssWidth: 1280, cssHeight: 720 }, { cssWidth: 390, cssHeight: 844 }]) {
    for (const dolly of dollies) {
      const b = plan.chromeBox(TOP, dolly);
      const k = b.w / TOP.w;
      for (const [ax, ay] of ANCHORS) {
        // The panel's own point (ax, ay) on the frame plane, then through the dollied camera.
        const [cx, cy] = plan.frameToViewport(b.x + (ax - TOP.x) * k, b.y + (ay - TOP.y) * k, vp, dolly);
        const [fx, fy] = plan.frameToViewport(ax, ay, vp, 0);
        assert.ok(Math.abs(cx - fx) < 0.01 && Math.abs(cy - fy) < 0.01,
          `${vp.cssWidth}x${vp.cssHeight} dolly ${dolly}: anchor ${ax},${ay} is at ${cx.toFixed(2)},${cy.toFixed(2)}, the fireworks put it at ${fx.toFixed(2)},${fy.toFixed(2)}`);
      }
    }
  }
});

test('the dolly really moves a point of the frame plane (the test above can fail)', () => {
  const vp = { cssWidth: 1920, cssHeight: 1080 };
  const [x0] = plan.frameToViewport(56, 48, vp, 0);
  const [x3] = plan.frameToViewport(56, 48, vp, 0.03);
  assert.ok(x0 - x3 > 20, `a 3% dolly moved the event name only ${(x0 - x3).toFixed(1)}px`);
});
