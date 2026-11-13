// node --test — the ladder final's lane picks under 640px (gh#305 recheck, 2026-11-13). At 320x568 the 1920
// lane frame scaled whole drew about 5px type, and the finalist buttons (laid over the empty middle of the
// track) sat on lane controls 2 and 3. No frame draws the picks at phone width, so they take the rule gh#314
// item 5 B set for the projector below 640px: a phone layout, not the frame scaled, in i5-phone B's type
// sizes and grid (two columns, gap 4px 10px), with the existing controls at 44px and over.
//
// Stated ceiling: Node has no layout engine. The CSS legs read the rules, and the height leg is a MODEL of
// the stack from the declared sizes; that the screen fits 320x568 with real fonts, and that no box overlaps,
// is the browser's to measure (play-screen-fit-probe, elementFromPoint).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fakeOrigin, mount, seedRaw, seeded, storedEvent } from './stage-harness.mjs';
import { advance, drawNext, encodeEvent, liveIds, revealDrawn } from '../../prize-event/event.ts';

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
const px = (decls, prop) => {
  const m = decls.match(new RegExp(`(?:^|[;\\s])${prop}:\\s*(\\d+(?:\\.\\d+)?)px`));
  assert.ok(m, `no ${prop} in px`);
  return Number(m[1]);
};
const L = (s) => `.pd-viewport[data-lanes] ${s}`;

test('phone lanes: the frame is not scaled; the track, slots and plates give way to the controls themselves', () => {
  assert.match(rule(L('.pd-scaled')), /transform:\s*none/);
  assert.match(rule(L('.pd-track,\n  .pd-viewport[data-lanes] .pd-slot,\n  .pd-viewport[data-lanes] .pd-plate')), /display:\s*none/);
  // The screen fits: it never scrolls and never clips a control away (play-screen-fit-probe).
  assert.match(rule('.pd-viewport[data-lanes]'), /overflow:\s*hidden/);
});

test('phone lanes: lanes and names are a two-column list in flow, every control 44px or more, none positioned over another', () => {
  const picks = rule(L('.pd-picks'));
  assert.match(picks, /position:\s*static/);
  assert.match(picks, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(picks, /gap:\s*4px 10px/);
  const lane = rule(L('.pd-lane'));
  const names = rule(L('.pd-names'));
  const name = rule(L('.pd-name'));
  for (const [label, decls] of [['lane', lane], ['names', names]]) assert.match(decls, /position:\s*static/, `${label} is not in flow`);
  for (const decls of [lane, names, name]) assert.doesNotMatch(decls, /inset|position:\s*(absolute|fixed)/);
  assert.match(names, /grid-column:\s*1 \/ -1/);
  assert.match(names, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.ok(px(lane, 'min-block-size') >= 44, 'a lane control under the tap floor');
  // The name control keeps the base rule's 52px floor; the phone rule may only change its type and padding.
  assert.doesNotMatch(name, /min-block-size|block-size/);
  assert.match(CSS, /\.pd-name \{[^}]*min-block-size:\s*52px/);
  // A name wraps inside its cell instead of pushing the page sideways.
  assert.match(name, /white-space:\s*normal/);
  assert.match(rule(L('.pd-lane > span')), /position:\s*static/);
});

test('phone lanes: the stack, modelled from the declared sizes, fits the 512px under the band at 320x568', () => {
  const frame = rule(L('.pd-frame'));
  const pad = px(frame, 'padding-block-start');
  const lane = px(rule(L('.pd-lane')), 'min-block-size');
  const nameH = 52;
  const rowGap = 4;
  const picks = rule(L('.pd-picks'));
  const margin = px(picks, 'margin-block-start');
  const bottom = px(picks, 'padding-block-end');
  // Text heights at i5-phone B's sizes and line heights: event 22px x 1.2; dots 12px over 22px dots; the
  // hud line 14px over 16px x 1.35; the game name 22px x 1.2.
  const text = 22 * 1.2 + (12 + 22) + (14 + 16 * 1.35) + 22 * 1.2;
  const lanes = 3 * lane + 2 * rowGap; // five lanes in two columns
  const names = 3 * nameH + 2 * rowGap; // at most five finalists free
  const total = pad + text + margin + lanes + rowGap + names + bottom;
  assert.ok(total <= 568 - 56, `the modelled stack is ${total}px, over the 512px under the band`);
});

/** A stored ladder event at its final, ready. */
function atLadderFinal(origin) {
  let ev = storedEvent(origin, { n: 50, games: { rounds: [null, null, null, null], final: 'ladder' } });
  const rng = seeded(4);
  for (let r = 1; r <= 4; r++) ev = advance(revealDrawn(drawNext(ev, rng)), rng);
  seedRaw(origin, encodeEvent(ev));
  return ev;
}

test('the stage marks the lane-pick screen for the phone layout, and marks each empty lane control', async () => {
  const origin = fakeOrigin();
  const ev = atLadderFinal(origin);
  const s = await mount({ origin });
  const viewport = s.root.querySelector('.pd-viewport');
  assert.equal(viewport.hasAttribute('data-lanes'), true);
  assert.equal(viewport.hasAttribute('data-field'), false);
  assert.deepEqual(s.laneButtons().map((b) => b.classList.contains('empty')), [true, true, true, true, true]);
  const name = ev.setup.people.find((p) => p.id === liveIds(ev)[0]).name;
  const tap = (b) => ((b.disabled = false), b.click());
  tap(s.laneButtons()[2]);
  tap(s.nameButton(name));
  await origin.idle();
  assert.deepEqual(s.laneButtons().map((b) => b.classList.contains('empty')), [true, true, false, true, true]);
  // Any other screen drops the mark.
  const plain = fakeOrigin();
  storedEvent(plain, { n: 50 });
  const r = await mount({ origin: plain });
  assert.equal(r.root.querySelector('.pd-viewport').hasAttribute('data-lanes'), false);
});
