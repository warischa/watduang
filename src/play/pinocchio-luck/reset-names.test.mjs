// gh#179, the invariant a reader of the diff cannot check by eye: after the reset confirm is accepted,
// every seat shows its animal name again, the party is exactly as big as it was, and every name a
// player typed is gone.
//
// Since gh#264 (ADR-0071) the route's own reset control, its dialog and resetSetupNames are gone with
// the rest of the route's setup; the reset lives in the shared player screen, mounted into
// #plPlayers. This file runs that real screen over THIS route's markup.html and the real dialog
// markup, clicks through the confirm and reads the rows back. The confirm's gate is
// arm-reveal-paths.test.mjs's job; neither file substitutes for the other.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MASCOTS } from '../_mascots.ts';
import { resetCases } from '../_player-screen/screen-harness.mjs';
import game from '../../games/pinocchio-luck.ts';

const MARKUP = fs.readFileSync(path.join(import.meta.dirname, 'markup.html'), 'utf8');
const MAIN = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');

resetCases({ test, assert, routeMarkup: MARKUP, rootId: 'plPlayers', range: game.players, mascots: MASCOTS, label: 'pinocchio-luck' });

// The route's own wipe must not come back beside the shared one: two resets over two name stores is
// the drift gh#177 was about.
test('pinocchio-luck: no route-local reset survives beside the shared one', () => {
  assert.doesNotMatch(MAIN, /resetSetupNames|reset-names-dialog|data-act="reset-names"/);
  assert.doesNotMatch(MARKUP, /id="reset-names"|id="reset-names-dialog"/);
});
