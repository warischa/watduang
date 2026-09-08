// gh#224 — the `renderer` field on every GameModule, reconciled against what the code actually does.
//
// WHY THE FIELD EXISTS. The 2D-ink leg in scripts/ci-probes.sh derives its route list from the
// manifest at run time (owner ruling 2026-09-08) rather than from a hand-maintained list, because a
// hand list is a list someone forgets to update and a 2D route added without an entry would go
// untested behind a green leg. The manifest had no property saying which renderer a route uses, so
// the field came first.
//
// WHY THIS FILE EXISTS, and it is the whole point. The field is HAND-DECLARED per module, so the
// list converges while the field does not: a route declaring 'dom' while actually drawing 2D is
// untested behind the same green leg, one layer down. So the declaration is reconciled here against
// an INDEPENDENT read of the route's own source, and it reds in BOTH directions -- declared 2D but
// nothing in the code draws, and draws 2D but declared otherwise.
//
// It is a `*.test.mjs` rather than a `scripts/*-check.mjs` on purpose: `npm test` already globs
// scripts/**/*.test.mjs and is already a ci.yml step, so this gates with no new wiring.
//
// THE CEILING, named rather than pretended away: the independent read is a regex over source text,
// and its one known blind spot is a `getContext` call assembled at run time (a variable holding
// '2d'). Nothing in src/play does that today. The read DOES skip comment lines -- without that,
// timebomb, short-stick and one-bomb all read as WebGL routes off prose that only mentions
// getContext('webgl') while calling something else.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { games } from '../src/games/manifest.ts';
import { canvas2dRouteIds, RENDERERS } from './canvas-ink-probe.mjs';

const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');

/** Source files that speak for a game: its play route directory if it has one, else its module.
 *  Probes and tests are excluded -- they contain getContext calls describing the route rather than
 *  making it draw, and reading them would make the reconcile agree with itself. */
function sourcesFor(game) {
  const dir = join(repoRoot, 'src/play', game.id);
  if (game.playRoute && existsSync(dir)) {
    return readdirSync(dir)
      .filter((f) => /\.(js|ts|html)$/.test(f))
      .filter((f) => !/probe|\.test\./.test(f))
      .map((f) => join(dir, f));
  }
  return [join(repoRoot, 'src/games', `${game.id}.ts`)];
}

/** A line that is a comment carries prose about getContext, not a call to it. Cheap and exact enough:
 *  every false positive this repo actually has (three of them) is a `//` or ` * ` line. */
const isComment = (line) => /^\s*(\/\/|\*|\/\*)/.test(line);

function observedRenderer(game) {
  let sawGl = false;
  let saw2d = false;
  for (const file of sourcesFor(game)) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (isComment(line)) continue;
      if (/getContext\(\s*['"](webgl|experimental-webgl)/.test(line)) sawGl = true;
      if (/getContext\(\s*['"]2d/.test(line)) saw2d = true;
    }
  }
  // WebGL wins when both appear: pinocchio-luck's fallback chain names two contexts, and a route
  // whose drawing surface is WebGL is not a route this leg's 2D readback can measure.
  if (sawGl) return 'webgl';
  if (saw2d) return 'canvas2d';
  return 'dom';
}

test('every registered game declares a renderer the type allows', () => {
  for (const game of games) {
    assert.ok(
      RENDERERS.includes(game.renderer),
      `${game.id}: renderer is ${JSON.stringify(game.renderer)}, expected one of ${RENDERERS.join(', ')}`,
    );
  }
});

test('the declared renderer matches an independent read of the code, in both directions', () => {
  const mismatches = [];
  for (const game of games) {
    const observed = observedRenderer(game);
    if (observed !== game.renderer) {
      mismatches.push(`${game.id}: declares "${game.renderer}", its source draws "${observed}"`);
    }
  }
  assert.deepEqual(
    mismatches,
    [],
    `renderer declaration is out of step with the code (a route declaring the wrong renderer is a route the 2D-ink leg silently skips or silently cannot measure):\n  ${mismatches.join('\n  ')}`,
  );
});

test('the derived 2D list is complete: the two buckets sum to the unfiltered manifest total', () => {
  const twoD = games.filter((g) => g.renderer === 'canvas2d');
  const notTwoD = games.filter((g) => g.renderer !== 'canvas2d');
  assert.equal(
    twoD.length + notTwoD.length,
    games.length,
    `bucketing lost an entry: ${twoD.length} + ${notTwoD.length} != ${games.length}`,
  );
  // The leg's own derivation, not a re-implementation of it -- a second copy of the filter here
  // could agree with itself while the leg walked a shorter list.
  assert.deepEqual(
    canvas2dRouteIds(games),
    twoD.filter((g) => g.playRoute).map((g) => g.id).sort(),
    'the leg walks a different set from the 2D bucket',
  );
  assert.ok(canvas2dRouteIds(games).length > 0, 'refusing a vacuous 2D list');
});
