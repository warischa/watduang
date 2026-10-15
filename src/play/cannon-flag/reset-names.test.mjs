// gh#175, the invariant a reader of the diff cannot check by eye: after the reset confirm is accepted,
// every seat shows its animal name again, the party is exactly as big as it was, and every name a
// player typed is gone.
//
// Since gh#264 (ADR-0071) the mockup's reset control, its overlay, resetPlayerNames and the setup rows
// they rewrote are gone with the rest of the mockup's setup; the reset lives in the shared player
// screen, mounted into #cf-players. This file runs that real screen over THIS route's markup.html and
// the real dialog markup, clicks through the confirm and reads the rows back (resetCases). The
// confirm's gate is arm-reveal-paths.test.mjs's job; neither file substitutes for the other.
//
// The gh#175 boxes about removing and renaming a seat ("does not re-number or rename the players who
// remain", "renaming still persists") are the shared screen's now too: resetCases' count-change case
// and src/play/_player-screen/player-screen.test.mjs own them.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MASCOTS } from '../_mascots.ts';
import { resetCases } from '../_player-screen/screen-harness.mjs';
import game from '../../games/cannon-flag.ts';

const MARKUP = fs.readFileSync(path.join(import.meta.dirname, 'markup.html'), 'utf8');
const source = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');

resetCases({ test, assert, routeMarkup: MARKUP, rootId: 'cf-players', range: game.players, mascots: MASCOTS, label: 'cannon-flag' });

// The mockup's own wipe must not come back beside the shared one: two resets over two name stores is
// the drift gh#175 was about.
test('cannon-flag: no route-local reset survives beside the shared one', () => {
  assert.doesNotMatch(source, /resetPlayerNames|resetNamesConfirm|resetCastNames/);
  assert.doesNotMatch(MARKUP, /id="btn-reset-names"|id="reset-names-confirm"/);
});

// main.js must have no numbered default left on the one visible-name path it still owns: the
// blank-field fallback in MatchEngine.setupMatch. Pinned by absence, which is fragile on its own, so
// the positive half is pinned too: the cast import has to still be there.
test('no numbered default remains in main.js', () => {
  const numbered = source
    .split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => /ผู้เล่น\s*(\$\{|\d)/.test(line))
    .filter(([, line]) => !line.trimStart().startsWith('//'));
  assert.deepEqual(numbered, [], `numbered default(s) left in main.js: ${JSON.stringify(numbered)}`);
  assert.match(source, /import \{[^}]*mascotNames[^}]*\} from '\.\.\/_mascots\.ts'/);
});

// gh#175 box: "All three open with animal names, and a search for the numbered default returns
// nothing a player can see" — the test above already covers main.js; markup.html is a second surface
// a player reads and gets the same absence check.
test('gh#175 box: no numbered default remains in markup.html', () => {
  const numbered = MARKUP
    .split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => /ผู้เล่น\s*(\$\{|\d)/.test(line));
  assert.deepEqual(numbered, [], `numbered default(s) left in markup.html: ${JSON.stringify(numbered)}`);
});
