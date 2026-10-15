// gh#175, the invariant a reader of the diff cannot check by eye: after the reset confirm is
// accepted, the seats hold the animal cast again, there are exactly as many as before, and every
// name a player typed is gone.
//
// Since gh#264 (ADR-0071) the reset control, its confirm and the rows it rewrites belong to the shared
// player screen, mounted into #ob-player-screen. This file runs that real screen over THIS route's
// markup.html and the real dialog markup, clicks through the confirm, and reads the rows back -- no
// slice of a route function any more, because the route no longer has one. The confirm's own 400ms
// gate is arm-reveal-paths.test.mjs's job; neither file substitutes for the other.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MASCOTS } from '../_mascots.ts';
import { resetCases } from '../_player-screen/screen-harness.mjs';
import game from '../../games/one-bomb.ts';

const MARKUP = fs.readFileSync(path.join(import.meta.dirname, 'markup.html'), 'utf8');

resetCases({ test, assert, routeMarkup: MARKUP, rootId: 'ob-player-screen', range: game.players, mascots: MASCOTS, label: 'one-bomb' });
