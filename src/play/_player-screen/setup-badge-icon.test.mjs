// gh#209, for the shared player screen (ADR-0071): every seat row it builds opens with that seat's
// ANIMAL, never a seat number -- on a first visit and on a saved roster alike. The rows are the real
// ones: player-screen.ts mounted over PlayerScreen.astro's real template, read back off the tree.
//
// Equality with the cast, not a digit scan, for the reason the per-route tests give: the field beside
// the badge carries a deliberately numbered positional label, which a digit scan would red on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MASCOTS, mascotEmoji } from '../_mascots.ts';
import { mountOnPage, settle } from './screen-harness.mjs';

const SURFACE = '<div id="app"><header><button id="hdr" type="button">x</button></header>'
  + '<section id="root" hidden></section></div>';

const badges = (page) => page.root.querySelectorAll('.ps-e');

test('gh#209: a first visit -- every row badge equals that seat mascot glyph, in cast order', async () => {
  const page = await mountOnPage({ routeMarkup: SURFACE, rootId: 'root', range: [2, 10] });
  page.screen.open();
  await settle();
  const rows = badges(page);
  assert.equal(rows.length, 4, 'the first visit shows four seats');
  assert.deepEqual(rows.map((b) => b.textContent), MASCOTS.slice(0, 4).map((m) => m.emoji));
  for (const b of rows) assert.equal(b.getAttribute('aria-hidden'), 'true');
});

test('gh#209: a saved roster -- a seat keeps its own glyph even after the row above it is removed', async () => {
  const page = await mountOnPage({ routeMarkup: SURFACE, rootId: 'root', roster: ['ต้น', 'มายด์', 'บอส', 'แนน'] });
  page.screen.open();
  await settle();
  assert.deepEqual(badges(page).map((b) => b.textContent), MASCOTS.slice(0, 4).map((m) => m.emoji));
  // Past the arm window first, or the remove control is still gated and the click is a no-op.
  await new Promise((resolve) => setTimeout(resolve, 450));
  page.root.querySelectorAll('.ps-rm')[1].click();
  assert.deepEqual(badges(page).map((b) => b.textContent), [0, 2, 3].map((i) => MASCOTS[i].emoji));
});

test('gh#209: the name field keeps its POSITIONAL numbered label, which this check must never flag', async () => {
  const page = await mountOnPage({ routeMarkup: SURFACE, rootId: 'root', roster: ['ต้น', 'มายด์', 'บอส'] });
  page.screen.open();
  await settle();
  page.root.querySelectorAll('.ps-n').forEach((field, i) => {
    assert.match(field.getAttribute('aria-label'), new RegExp(`${i + 1}$`));
  });
});

test('RED CALIBRATION: no seat glyph is a digit, so the equality can separate the two', () => {
  const icons = Array.from({ length: 10 }, (_, i) => mascotEmoji(i));
  assert.notDeepEqual(icons, Array.from({ length: 10 }, (_, i) => String(i + 1)));
  for (const icon of icons) assert.doesNotMatch(icon, /\d|#/);
});
