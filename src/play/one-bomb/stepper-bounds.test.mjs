// The player-count stepper's bounds on this route, at this route's declared range.
//
// Since gh#264 (ADR-0071) the stepper is the shared player screen's, not this route's: the mockup's
// own −/+ card and the clamp main.ts applied to it are gone, and the count is admitted by the shared
// screen against `game.players`. So the real thing is driven: the shared screen's code over THIS
// route's markup.html, at THIS route's declared range, tapped past both ends. What a player sees is
// what is read -- the count the screen paints and the `disabled` state of its two steppers -- never a
// value read back through a second clamp that could hide a broken first one.
//
// The ENGINE's own seat limit is a different question and lives in scripts/seat-cap-check.mjs, which
// runs main.js's count setter; the handoff that seats the chosen players is measured there too.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { mountOnPage, settle } from '../_player-screen/screen-harness.mjs';
import game from '../../games/one-bomb.ts';

const MARKUP = fs.readFileSync(path.join(import.meta.dirname, 'markup.html'), 'utf8');
const [MIN, MAX] = game.players;

async function firstVisit() {
  const page = await mountOnPage({ routeMarkup: MARKUP, rootId: 'ob-player-screen', range: game.players });
  page.screen.open();
  await settle();
  const shown = () => Number(page.part('count-num').textContent);
  const rows = () => page.root.querySelectorAll('.ps-p').length;
  return { page, shown, rows };
}

test('the floor: stepping down to the declared minimum disables −, and stepping back up re-enables it', async () => {
  const { page, shown, rows } = await firstVisit();
  for (let i = 0; i < 30; i += 1) page.part('dec').click();
  assert.equal(shown(), MIN, 'the count stops at the declared minimum');
  assert.equal(rows(), MIN, 'one row per seat at the floor');
  assert.equal(page.part('dec').disabled, true, '− is disabled at the floor');
  page.part('inc').click();
  assert.equal(shown(), MIN + 1);
  assert.equal(page.part('dec').disabled, false, '− is live again one above the floor');
});

test('the ceiling: stepping up to the declared maximum disables +, and stepping back down re-enables it', async () => {
  const { page, shown, rows } = await firstVisit();
  for (let i = 0; i < 30; i += 1) page.part('inc').click();
  assert.equal(shown(), MAX, 'the count stops at the declared maximum');
  assert.equal(rows(), MAX, 'one row per seat at the ceiling');
  assert.equal(page.part('inc').disabled, true, '+ is disabled at the ceiling');
  page.part('dec').click();
  assert.equal(shown(), MAX - 1);
  assert.equal(page.part('inc').disabled, false, '+ is live again one below the ceiling');
});

test('the shown count never leaves the declared range across a sweep well past both ends', async () => {
  const { page, shown } = await firstVisit();
  const seen = new Set([shown()]);
  for (const part of ['inc', 'dec', 'inc']) {
    for (let i = 0; i < 30; i += 1) {
      // The disabled steppers swallow the tap the way a browser does, so force the handler too: the
      // clamp, not the attribute, is the invariant.
      const button = page.part(part);
      const was = button.disabled;
      button.disabled = false;
      button.click();
      button.disabled = was;
      seen.add(shown());
    }
  }
  // CALIBRATION: the sweep really reached both ends, so the range check below is not vacuous on a
  // stepper that never moved.
  assert.ok(seen.has(MIN) && seen.has(MAX), `the sweep never reached both bounds: ${[...seen].join(', ')}`);
  for (const n of seen) assert.ok(n >= MIN && n <= MAX, `the stepper showed ${n}, outside [${MIN}, ${MAX}]`);
});

test("the route ships no count control of its own beside the shared one", () => {
  // The mockup's own stepper would be a second statement of the count (ADR-0071 ruling 2).
  for (const id of ['playerMinus', 'playerPlus', 'playerCountVal']) {
    assert.doesNotMatch(MARKUP, new RegExp(`id="${id}"`), `markup.html still ships #${id}`);
  }
});
