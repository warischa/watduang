// gh#177, the invariant a reader of the diff cannot check by eye: after the reset confirm is accepted,
// every seat shows its animal name again, the party is exactly as big as it was, and every name a
// player typed is gone.
//
// Since gh#264 (ADR-0071) the mockup's reset-cast control, its modal and resetPlayerCast are gone with
// the rest of the mockup's setup -- the avatar picker included, so there is no hand-picked glyph left
// for a reset to undo: a seat's glyph is its mascot's, fixed by the shared screen. The reset lives in
// the shared player screen, mounted into #zt-players. This file runs that real screen over THIS
// route's markup.html and the real dialog markup, clicks through the confirm and reads the rows back.
// The confirm's gate is arm-reveal-paths.test.mjs's job; neither file substitutes for the other.
//
// The filename stays reset-cast.test.mjs on purpose: src/play/mascot-defaults.test.mjs warns against
// counting the per-route reset tests by one filename, and this is the file it names.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MASCOTS } from '../_mascots.ts';
import { resetCases } from '../_player-screen/screen-harness.mjs';
import game from '../../games/zero-trigger.ts';

const MARKUP = fs.readFileSync(path.join(import.meta.dirname, 'markup.html'), 'utf8');
const MAIN = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');

resetCases({ test, assert, routeMarkup: MARKUP, rootId: 'zt-players', range: game.players, mascots: MASCOTS, label: 'zero-trigger' });

// The mockup's own wipe -- and the picker whose choice it undid -- must not come back beside the
// shared reset: two resets over two name stores is the drift gh#177 was about.
test('zero-trigger: no route-local reset or avatar picker survives beside the shared screen', () => {
  assert.doesNotMatch(MAIN, /resetPlayerCast|randomizeAllAvatars|selectAvatar/);
  assert.doesNotMatch(MARKUP, /id="modal-reset-cast"|id="btn-open-reset-cast"|id="modal-avatar-picker"/);
});
