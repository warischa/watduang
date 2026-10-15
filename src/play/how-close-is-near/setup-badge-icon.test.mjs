// gh#140 / gh#209: the setup roster row opens with the seat's ANIMAL, not a seat number.
//
// Since gh#264 (ADR-0071) the route's own names screen and its .player-badge disc are gone; the setup
// rows are the shared player screen's, mounted into #hcPlayers. This file runs that real screen over
// THIS route's markup.html at THIS route's declared range and reads the badges back off the rows it
// built. The round itself shows names only on this route, so there is no seat glyph past setup to pin.
//
// Equality with the cast throughout, never a digit scan alone: the name field beside the badge
// carries a legitimate numbered positional label.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MASCOTS, mascotEmoji } from '../_mascots.ts';
import { badgeCases } from '../_player-screen/screen-harness.mjs';
import game from '../../games/how-close-is-near.ts';

const MARKUP = fs.readFileSync(path.join(import.meta.dirname, 'markup.html'), 'utf8');

badgeCases({ test, assert, routeMarkup: MARKUP, rootId: 'hcPlayers', range: game.players, mascots: MASCOTS, label: 'how-close-is-near' });

// Calibration, in the shape that can actually fail: the digits a broken badge would render are NOT
// what the cast holds, so the cases above can tell the two apart.
test('RED CALIBRATION: a seat number is not a value the cast can produce', () => {
  const digits = Array.from({ length: 10 }, (_, i) => String(i + 1));
  const icons = Array.from({ length: 10 }, (_, i) => mascotEmoji(i));
  assert.notDeepEqual(icons, digits);
  for (const icon of icons) assert.doesNotMatch(icon, /\d/);
});
