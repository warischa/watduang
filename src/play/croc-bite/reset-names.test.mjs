// gh#175, the invariant a reader of the diff cannot check by eye: after the reset confirm is
// accepted, the seat names hold the animal cast again, the party keeps exactly as many seats as
// before, and every name a player typed is gone.
//
// Since gh#264 (ADR-0071) the reset is no longer this route's. main.ts injected its own trigger and
// confirm beside the engine's seat list and wrote the cast back through the engine's
// updatePlayerName; the seat list, the trigger, the confirm and resetToCast went with the engine's
// own setup when the shared player screen replaced it. This file runs THAT screen, mounted into
// #croc-players over THIS route's markup.html at THIS game's declared 2-6 range, clicks through the
// confirm and reads the rows back. That the confirm's own buttons are inert for their arm window is
// arm-reveal-paths.test.mjs's job, and neither file substitutes for the other.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MASCOTS } from '../_mascots.ts';
import { resetCases } from '../_player-screen/screen-harness.mjs';
import game from '../../games/croc-bite.ts';

const here = import.meta.dirname;
const MARKUP = fs.readFileSync(path.join(here, 'markup.html'), 'utf8');
const MAIN = fs.readFileSync(path.join(here, 'main.js'), 'utf8');
const GLUE = fs.readFileSync(path.join(here, 'main.ts'), 'utf8');

resetCases({ test, assert, routeMarkup: MARKUP, rootId: 'croc-players', range: game.players, mascots: MASCOTS, label: 'croc-bite' });

// The route's own wipe must not come back beside the shared one: two resets over two name stores is
// the drift gh#177 was about.
test('croc-bite: no route-local reset survives beside the shared one', () => {
  assert.doesNotMatch(GLUE, /resetToCast|modal-reset-names|btn-reset-names|resetCastNames/);
  assert.doesNotMatch(MAIN, /renderMascotInputs|mascot-name-input/);
  assert.doesNotMatch(MARKUP, /id="setup-mascots-list"|class="count-pill/);
});
