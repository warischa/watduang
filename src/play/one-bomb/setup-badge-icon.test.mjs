// gh#209: this route's setup rows open with the seat's ANIMAL, not a seat number.
//
// Since gh#264 (ADR-0071) the rows are the shared player screen's, mounted into #ob-player-screen in
// the menu. So the real thing is run: the shared screen's code over THIS route's markup.html, at THIS
// route's declared range, and the badges read back off the rows it built. A route that stopped
// mounting the screen, or mounted it somewhere this markup does not have, fails here rather than
// testing nothing.
//
// The assertion is POSITIVE and an equality with the shared cast. Nothing scans for digits: the name
// field beside the badge carries a legitimate numbered positional label.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MASCOTS, mascotEmoji } from '../_mascots.ts';
import { badgeCases } from '../_player-screen/screen-harness.mjs';
import game from '../../games/one-bomb.ts';

const MARKUP = fs.readFileSync(path.join(import.meta.dirname, 'markup.html'), 'utf8');

badgeCases({ test, assert, routeMarkup: MARKUP, rootId: 'ob-player-screen', range: game.players, mascots: MASCOTS, label: 'one-bomb' });

// Calibration, in the shape that can fail: a seat number is not a value the cast can produce, so the
// equality above can tell a digit badge from a glyph badge.
test('RED CALIBRATION: no seat glyph is a digit, so the equality can separate the two', () => {
  const icons = Array.from({ length: 10 }, (_, i) => mascotEmoji(i));
  assert.notDeepEqual(icons, Array.from({ length: 10 }, (_, i) => String(i + 1)));
  for (const icon of icons) assert.doesNotMatch(icon, /\d|#/);
});
