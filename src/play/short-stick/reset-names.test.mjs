// gh#174, the invariant a reader of the diff cannot check by eye: after the reset confirm is accepted,
// every seat shows its animal name again, the party is exactly as big as it was, and every name a
// player typed is gone.
//
// Since gh#264 (ADR-0071) the mockup's name rows, its reset control, its reset-names dialog,
// resetPlayerNames and the draft that persisted the names are gone with the rest of the mockup's
// player setup; the reset lives in the shared player screen, mounted into #ssPlayers, and the names
// persist in the shared roster. This file runs that real screen over THIS route's markup.html and the
// real dialog markup, clicks through the confirm and reads the rows back. The confirm's gate is
// arm-reveal-paths.test.mjs's job; neither file substitutes for the other.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MASCOTS } from '../_mascots.ts';
import { resetCases } from '../_player-screen/screen-harness.mjs';
import game from '../../games/short-stick.ts';

const MARKUP = fs.readFileSync(path.join(import.meta.dirname, 'markup.html'), 'utf8');
const MAIN = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');

resetCases({ test, assert, routeMarkup: MARKUP, rootId: 'ssPlayers', range: game.players, mascots: MASCOTS, label: 'short-stick' });

// The mockup's own wipe and its own name store must not come back beside the shared ones: two resets
// over two name stores is the drift gh#174 was about, and a private draft of the names is a second
// roster the next game never sees.
test('short-stick: no route-local reset or name store survives beside the shared one', () => {
  assert.doesNotMatch(MAIN, /resetPlayerNames|reset-names-dialog|btn-reset-names|short-stick-pro-v2|localStorage/);
  assert.doesNotMatch(MARKUP, /id="btn-reset-names"|id="reset-names-dialog"|id="player-inputs-container"|id="btn-add-player"/);
});

// gh#174 box 1 and ADR-0054: no seat ever opens on a numbered default. The names are the shared
// screen's now, so the positive half is that main.js mounts it; the absence half still holds for
// anything main.js renders itself.
test('no numbered default remains in main.js', () => {
  const numbered = MAIN
    .split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => /ผู้เล่น\s*(\$\{|\d)/.test(line))
    .filter(([, line]) => !line.trimStart().startsWith('//'));
  assert.deepEqual(numbered, [], `numbered default(s) left in main.js: ${JSON.stringify(numbered)}`);
  assert.match(MAIN, /mountPlayerScreen\(\{/);
});

// gh#174 box 3: "the route reads the shared cast; it defines no list of its own" is a claim about
// the WHOLE directory, not about main.js alone — a hardcoded name anywhere here (markup.html,
// stick-canvas.ts, canvas-pixels-probe.mjs) falsifies it just as much as one in main.js would.
// Enumerated over the directory's own file list, not a hand-picked subset.
test('gh#174 box 3: no file in the route directory hardcodes a mascot name', () => {
  const dir = import.meta.dirname;
  const names = MASCOTS.map((m) => m.name);
  assert.ok(names.length > 0, 'MASCOTS is empty — this test would pass vacuously');
  const files = fs.readdirSync(dir).filter((f) => !f.endsWith('.test.mjs'));
  assert.ok(files.length > 0, 'the route directory is empty — this test would pass vacuously');
  const offenders = [];
  for (const file of files) {
    const raw = fs.readFileSync(path.join(dir, file), 'utf8');
    // Full-line `//` comments document history in prose and are not a list a caller reads from.
    // Files with a different comment syntax (markup.html, *.css) are checked unstripped.
    const stripped = raw
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('//'))
      .join('\n');
    for (const name of names) {
      if (stripped.includes(name)) offenders.push(`${file}: "${name}"`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `hardcoded mascot name(s) found outside _mascots.ts: ${offenders.join(', ')} — the route must ` +
      'read every name through the shared cast, never spell one out itself',
  );
});
