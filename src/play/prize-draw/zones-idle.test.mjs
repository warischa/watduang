// node --test — the zones round before its draw (gh#315). The projector shows each zones round's zones BEFORE
// the MC's press commits the draw, so the zones cannot come from the round code or the survivors. Proven on the
// real stage over an all-zones QR event at 200, 52 and 37 heads, every round: the zone every name stands in on
// the idle picture is the zone the 3D module draws it in once the round is committed, and the module's zones are
// the same for any survivor set and any code. Names reach the frame as text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fakeHosts, fakeOrigin, mount, press, seedRaw, seeded } from './stage-harness.mjs';
import { createEvent, encodeEvent } from '../../prize-event/event.ts';
import { ELIMINATION_ROUNDS, proposeSchedule } from '../../prize-draw/schedule.ts';
import { makeDoc } from '../../prize-event/fake-dom.mjs';
import { GRID, NAME_BOX, NAME_FIT, gridBox, planFor, zoneAssignment, zoneGrid, zonesFor } from '../prize-zones/renderer/plan.ts';
import { NAME_CAP, graphemeCount } from '../../prize-event/names.ts';
import { fitName, graphemes } from '../prize-fireworks/renderer/text-fit.ts';
import { demoNames } from '../_prize-reveal/demo.ts';
import { idleZones, renderZonesIdle } from './zones-idle.ts';

const PIN = '048213';
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const serverId = (i) => B64[i >> 6] + B64[i & 63] + Array.from({ length: 20 }, (_, k) => B64[(i * 7 + k * 13) % 64]).join('');
const ALL_ZONES = { rounds: ['zones', 'zones', 'zones', 'zones'], final: null };

function storedZonesEvent(origin, n) {
  const people = Array.from({ length: n }, (_, i) => ({ id: serverId(i), name: `P${i + 1}` }));
  const ev = createEvent(
    { eventName: 'Party', names: people.map((p) => p.name), schedule: proposeSchedule(n), prizes: ['TV'], games: ALL_ZONES, qr: { pin: PIN, roster: people } },
    seeded(n),
  );
  seedRaw(origin, encodeEvent(ev));
  return ev;
}

/** Past a settled reveal to the next step: QR mode first shows the round's code card, whose close is the MC's
 *  one control; then the step forward. */
async function stepOn(s, origin) {
  // A held zones round lifts its code card into .pd-over (gh#319), so look across the root, not just the frame.
  if (s.root.querySelector('.pd-codebox')) {
    press(s);
    await origin.idle();
  }
  press(s);
  await origin.idle();
}

/** The idle frame's zones, as the room reads them: per panel, its names in order. */
const shownZones = (frame) => frame.querySelectorAll('.pd-zpanel').map((panel) => panel.querySelectorAll('.nm').map((n) => n.textContent));

test('every round, the zone a name stands in before the draw is the zone the reveal draws it in, at 200, 52 and 37 heads', async () => {
  let rounds = 0;
  for (const n of [200, 52, 37]) {
    const origin = fakeOrigin();
    storedZonesEvent(origin, n);
    const { hosts, start } = fakeHosts();
    const s = await mount({ origin, rng: seeded(n + 1), startReveal: start });
    for (let r = 1; r <= ELIMINATION_ROUNDS; r++) {
      const label = `${n} heads, round ${r}`;
      assert.equal(s.frame.getAttribute('data-screen'), 'zones', `${label}: the zones are not on screen before the draw`);
      const before = shownZones(s.frame);
      assert.equal(before.length, 4, `${label}: not four zones`);
      press(s);
      await origin.idle();
      const h = hosts.at(-1);
      assert.equal(h.options.game, 'zones', `${label}: the reveal is not the zones game`);
      const input = h.options.input;
      assert.equal(before.flat().length, input.people.length, `${label}: the idle picture and the reveal hold different fields`);
      const byId = new Map(input.people.map((p) => [p.id, p.name]));
      const plan = planFor(input);
      const drawn = plan.zones.map((z) => z.ids.map((id) => byId.get(id)));
      assert.deepEqual(drawn, before, `${label}: a name stands in one zone and is revealed in another`);
      // Any other draw of this round leaves every zone where it was.
      const ids = input.people.map((p) => p.id);
      for (const [k, code] of [[3, '000000000'], [ids.length - 1, '999999999'], [0, 'X']]) {
        const other = { ...input, key: input.key.replace(/:[^:]+$/, `:${code}`), outcome: { ...input.outcome, code, survivors: ids.slice(0, k) } };
        assert.deepEqual(zonesFor(other), plan.zones.map((z) => z.ids), `${label}: another draw moved a zone`);
      }
      h.run();
      h.settle();
      await stepOn(s, origin);
      rounds++;
    }
  }
  assert.equal(rounds, 12, 'not every round was walked');
});

test('a round with another game keeps the plain field; only a zones round shows zones', async () => {
  const origin = fakeOrigin();
  const people = Array.from({ length: 50 }, (_, i) => ({ id: serverId(i), name: `P${i + 1}` }));
  const ev = createEvent(
    { eventName: 'Party', names: people.map((p) => p.name), schedule: proposeSchedule(50), prizes: ['TV'], games: { rounds: ['fireworks', 'zones', null, null], final: null }, qr: { pin: PIN, roster: people } },
    seeded(3),
  );
  seedRaw(origin, encodeEvent(ev));
  const { hosts, start } = fakeHosts();
  const s = await mount({ origin, rng: seeded(4), startReveal: start });
  assert.equal(s.frame.getAttribute('data-screen'), 'round');
  press(s);
  await origin.idle();
  hosts.at(-1).settle();
  await stepOn(s, origin);
  assert.equal(s.frame.getAttribute('data-screen'), 'zones');
});

test('the idle frame: four standing zones, the board copy verbatim, and a hostile name as text only', () => {
  const doc = makeDoc();
  const frame = doc.createElement('div');
  const hostile = '<img src=x onerror=alert(1)>';
  const zones = [['ก', hostile], ['ข'], ['ค'], []];
  renderZonesIdle(frame, { eventName: 'งาน', round: 2, rounds: 4, dots: ['done', 'on', 'todo', 'todo', 'todo'], zones }, doc);
  assert.equal(frame.getAttribute('data-screen'), 'zones');
  const text = (sel) => frame.querySelectorAll(sel).map((e) => e.textContent);
  assert.deepEqual(text('.pd-zname'), ['โซนสีชมพู', 'โซนสีฟ้า', 'โซนสีม่วง', 'โซนสีขาว']);
  assert.deepEqual(text('.pd-zbadge'), ['ยืนขึ้น', 'ยืนขึ้น', 'ยืนขึ้น', 'ยืนขึ้น']);
  assert.deepEqual(text('.pd-rl'), ['รอบที่ 2 จาก 4']);
  assert.deepEqual(text('.pd-lk'), ['เกมรอบนี้', 'พิธีกรกดเริ่ม แล้วยืนในโซนสีของตัวเอง']);
  assert.deepEqual(text('.pd-gname'), ['โซนสีลุกยืน']);
  assert.equal(frame.querySelector('.pd-flow').querySelector('span').textContent, '4');
  assert.deepEqual(shownZones(frame), zones);
  assert.equal(frame.querySelectorAll('img').length, 0, 'a name built an element');
  assert.equal(frame.querySelectorAll('a').length, 0, 'the frame holds an anchor');
  assert.equal(frame.querySelectorAll('button').length, 0, 'the frame holds a control');
});

// ---- Capacity of the idle grid for the largest roster the event accepts (round-1 review C1, idle half; owner
// ruling 2026-11-17). The idle view lays its zones out through the reveal's own zoneGrid (plan.ts): grow the
// columns when the board's four cannot hold a zone, else scale the whole grid as one, so no name leaves its
// zone. The geometry is the board's (PANEL/GRID/NAME_FIT), which the idle CSS mirrors. Node has no layout
// engine: the acceptance leg reads the declared geometry and the roster the idle view assigns (idleZones); the
// containment leg measures the shipped font via macOS CoreText and skips elsewhere; the demo leg needs neither.
// What none can see without a browser: real wrapped line counts, the chip's rendered height, and the painted
// grid (play-screen-fit-probe / elementFromPoint).
const WIDE = 'ณำ'; // the widest valid Thai cluster in the shipped Sarabun Bold (measured below)
const FONT = path.join(import.meta.dirname, '../../../public/fonts/sarabun-bold-subset.ttf');

/** 200 unique names, each NAME_CAP clusters of the widest type: the largest, widest roster createEvent takes. */
function worstRoster() {
  return Array.from({ length: 200 }, (_, i) => WIDE.repeat(4) + Array.from({ length: 8 }, (_, b) => ((i >> b) & 1 ? WIDE : 'ฒำ')).join(''));
}

test('idle capacity: the event accepts the largest widest roster, and the grid holds it at one line per name', () => {
  const names = worstRoster();
  assert.ok(names.every((n) => graphemeCount(n) === NAME_CAP), 'a roster name is not at the cluster cap');
  const ev = createEvent(
    { eventName: 'Party', names, schedule: proposeSchedule(200), prizes: ['TV'], games: { rounds: ['zones', 'zones', 'zones', 'zones'], final: null } },
    seeded(73),
  );
  assert.equal(ev.setup.people.length, 200, 'the event refused the largest roster');
  const zones = idleZones(ev.eventKey, 1, ev.setup.people);
  const max = Math.max(...zones.map((z) => z.length));
  assert.equal(max, 50, 'the largest zone does not hold a quarter of the field');
  const rows = Math.ceil(max / GRID.cols);
  const stack = rows * GRID.minRow + (rows - 1) * GRID.rowGap;
  const box = gridBox(0);
  assert.ok(stack <= box.h, `the one-line stack ${stack}px is over the grid box ${box.h}px`);
});

/** Text widths in the shipped bold face at `px`, by process-local CoreText registration (no browser, no install). */
function widthsAt(texts, px) {
  const script = `ObjC.import('AppKit');ObjC.import('CoreText');
$.CTFontManagerRegisterFontsForURL($.NSURL.fileURLWithPath(${JSON.stringify(FONT)}),1,null);
const a=$.NSMutableDictionary.alloc.init;a.setObjectForKey($.NSFont.fontWithNameSize('Sarabun-Bold',${px}),$.NSFontAttributeName);
JSON.stringify(Object.fromEntries(${JSON.stringify(texts)}.map(t=>[t,$(t).sizeWithAttributes(a).width])));`;
  return JSON.parse(execFileSync('osascript', ['-l', 'JavaScript', '-e', script], { encoding: 'utf8' }));
}

/** A text measurer backed by the shipped bold face: each grapheme cluster's CoreText advance at the floor,
 *  scaled to the asked size -- the same per-cluster model the round-1 C probe used. Needs macOS CoreText. */
function clusterMeasure() {
  const adv = widthsAt(['ฒำ', 'ณำ'], NAME_FIT.floor);
  return (text, size) => graphemes(text).reduce((a, g) => a + (adv[g] ?? 0), 0) * (size / NAME_FIT.floor);
}

// The zones idle frame is shared with the demo page (gh#319), so its base rules live in reveal.css; the
// projector's phone zones overrides stay in play.css.
const REVEAL_CSS = fs.readFileSync(path.join(import.meta.dirname, '../_prize-reveal/reveal.css'), 'utf8');
/** The base .pd-zgrid rule body: the selector at line start, not the phone compound selector. */
function zgridRule() {
  const m = REVEAL_CSS.match(/^\.pd-zgrid\s*\{([^}]*)\}/m);
  assert.ok(m, 'no base .pd-zgrid rule');
  return m[1];
}

// The owner's ruling (2026-11-17) carried through the idle view: the worst-case roster no longer overflows.
// zoneGrid grows the columns and, if none fits, scales the whole grid as one; the idle markup must APPLY that
// layout (columns and scale reach the DOM as custom properties the stylesheet consumes), and every cell stays
// inside its grid box. The measure is the shipped font via CoreText, so this leg skips where that is absent
// (CI); the acceptance leg above and the demo leg below still run there. A browser must still confirm the
// painted result with real fonts and the bold face loaded (play-screen-fit-probe / elementFromPoint).
test('idle capacity: the worst-case roster is contained, and the idle markup applies the layout zoneGrid chose', (t) => {
  let measure;
  try {
    measure = clusterMeasure();
  } catch {
    t.skip('name width needs macOS CoreText (osascript); the acceptance and demo legs still ran');
    return;
  }
  const ev = createEvent(
    { eventName: 'Party', names: worstRoster(), schedule: proposeSchedule(200), prizes: ['TV'], games: { rounds: ['zones', 'zones', 'zones', 'zones'], final: null } },
    seeded(73),
  );
  const zones = idleZones(ev.eventKey, 1, ev.setup.people).map((z) => z.map((p) => p.name));
  const doc = makeDoc();
  const frame = doc.createElement('div');
  renderZonesIdle(frame, { eventName: 'Party', round: 1, rounds: 4, dots: ['on', 'todo', 'todo', 'todo', 'todo'], zones }, doc, measure);
  const panels = frame.querySelectorAll('.pd-zpanel');
  assert.equal(panels.length, 4);
  zones.forEach((zoneNames, z) => {
    const grid = panels[z].querySelector('.pd-zgrid');
    // The layout the reveal's own rule chooses for this zone, measured the same way the idle view measures.
    const expected = zoneGrid(z, zoneNames.length, (box) => zoneNames.map((nm) => fitName(nm, measure, NAME_FIT.size, NAME_FIT.floor, box).lines.length));
    assert.equal(Number(grid.style.getPropertyValue('--z-cols')), expected.cols, `zone ${z}: the columns did not reach the DOM`);
    assert.equal(Number(grid.style.getPropertyValue('--z-scale')), expected.scale, `zone ${z}: the scale did not reach the DOM`);
    assert.equal(grid.querySelectorAll('.pd-chip').length, zoneNames.length, `zone ${z}: a name is missing`);
    // The ruling was actually needed here, else this leg measures nothing.
    assert.ok(expected.cols > GRID.cols || expected.scale < 1, `zone ${z}: the worst case did not grow or scale`);
    // Containment: every cell the layout places stays inside its grid box, both axes.
    const g = gridBox(z);
    for (const c of expected.cells) {
      assert.ok(c.cx - c.w / 2 >= g.x - 1e-6 && c.cx + c.w / 2 <= g.x + g.w + 1e-6, `zone ${z}: a cell leaves the grid box sideways`);
      assert.ok(c.cy - c.h / 2 >= g.y - 1e-6 && c.cy + c.h / 2 <= g.y + g.h + 1e-6, `zone ${z}: a cell leaves the grid box vertically`);
    }
  });
  // The stylesheet consumes the custom properties: the wiring is real, not just the function's return.
  assert.match(zgridRule(), /grid-template-columns:\s*repeat\(var\(--z-cols/, 'the columns are not wired to the grid');
  assert.match(zgridRule(), /transform:\s*scale\(var\(--z-scale/, 'the scale is not wired to the grid');
});

test('idle capacity: an ordinary roster (the demo room) keeps the board layout exactly', () => {
  const ev = createEvent(
    { eventName: 'Party', names: demoNames(200), schedule: proposeSchedule(200), prizes: ['TV'], games: { rounds: ['zones', 'zones', 'zones', 'zones'], final: null } },
    seeded(2570),
  );
  const zones = idleZones(ev.eventKey, 1, ev.setup.people).map((z) => z.map((p) => p.name));
  const doc = makeDoc();
  const frame = doc.createElement('div');
  renderZonesIdle(frame, { eventName: 'Party', round: 1, rounds: 4, dots: ['on', 'todo', 'todo', 'todo', 'todo'], zones }, doc);
  frame.querySelectorAll('.pd-zpanel').forEach((panel, z) => {
    const grid = panel.querySelector('.pd-zgrid');
    assert.equal(grid.style.getPropertyValue('--z-cols'), String(GRID.cols), `zone ${z}: an ordinary roster grew the columns`);
    assert.equal(grid.style.getPropertyValue('--z-scale'), '1', `zone ${z}: an ordinary roster was scaled`);
    // One line per name: the board's rows, the board's four columns, no scale -- today's layout.
    const layout = zoneGrid(z, zones[z].length, () => zones[z].map(() => 1));
    assert.equal(layout.cols, GRID.cols);
    assert.equal(layout.scale, 1);
    assert.ok(layout.rowH.every((h) => h === GRID.minRow), `zone ${z}: a row is not the board's minimum`);
  });
});
