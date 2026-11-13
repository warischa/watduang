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
//
// FOLLOWS LOCAL IMPORTS (gh#305). A route that draws through shared code -- the prize-draw routes mount
// one reveal host in src/play/_prize-reveal/, and only that host asks for the WebGL context -- read as
// 'dom' when only its own directory was read. So the read starts at the route's own files and follows
// every relative import (static, re-export and literal dynamic import) to a .ts/.js file under src/,
// transitively; a package import (`three`) is not followed, and neither is a test or probe file. Its
// ceiling: an import whose specifier is not a string literal is not followed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync, statSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { games } from '../src/games/manifest.ts';
import { canvas2dRouteIds, RENDERERS } from './canvas-ink-probe.mjs';

const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');

/** A line that is a comment carries prose about getContext, not a call to it. Cheap and exact enough:
 *  every false positive this repo actually has (three of them) is a `//` or ` * ` line. */
const isComment = (line) => /^\s*(\/\/|\*|\/\*)/.test(line);

/** Source files that speak for a game: its play route directory if it has one, else its module.
 *  Probes and tests are excluded -- they contain getContext calls describing the route rather than
 *  making it draw, and reading them would make the reconcile agree with itself. */
function sourcesFor(game) {
  const dir = join(repoRoot, 'src/play', game.id);
  if (game.playRoute && existsSync(dir)) {
    return reachableSources(
      readdirSync(dir)
        .filter((f) => /\.(js|ts|html)$/.test(f))
        .filter((f) => !/probe|\.test\./.test(f))
        .map((f) => join(dir, f)),
    );
  }
  return [join(repoRoot, 'src/games', `${game.id}.ts`)];
}

/** Relative specifiers of every static import, re-export and literal dynamic import, comment lines removed. */
const IMPORT_RE = /\b(?:import|export)\s[^'"`;]*?\bfrom\s*['"](\.{1,2}\/[^'"]+)['"]|\bimport\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)|\bimport\s*['"](\.{1,2}\/[^'"]+)['"]/g;
const isFile = (p) => existsSync(p) && statSync(p).isFile();

/** The entry files plus every .ts/.js/.mjs file under `root`/src they reach through relative imports. */
export function reachableSources(entries, root = repoRoot) {
  const srcDir = join(root, 'src');
  const seen = new Set();
  const queue = [...entries];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file) || !isFile(file)) continue;
    seen.add(file);
    if (!/\.(m?js|ts)$/.test(file)) continue;
    const text = readFileSync(file, 'utf8').split('\n').filter((line) => !isComment(line)).join('\n');
    for (const m of text.matchAll(IMPORT_RE)) {
      const spec = m[1] ?? m[2] ?? m[3];
      const base = resolve(dirname(file), spec);
      const hit = [base, `${base}.ts`, `${base}.js`, join(base, 'index.ts')].find(isFile);
      if (!hit || !/\.(m?js|ts)$/.test(hit) || /probe|\.test\./.test(hit)) continue;
      const rel = relative(srcDir, hit);
      if (rel.startsWith('..') || rel.split(sep)[0] === '..') continue;
      queue.push(hit);
    }
  }
  return [...seen];
}


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

test('the read follows relative imports transitively, and nothing else', () => {
  const root = mkdtempSync(join(tmpdir(), 'renderer-follow-'));
  try {
    const w = (rel, text) => {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), text);
    };
    w('src/play/r/main.ts', "import { go } from '../_shared/host.ts';\n// import '../_shared/commented.ts';\nimport three from 'three';\ngo();");
    w('src/play/_shared/host.ts', "export { draw } from './draw';\nconst lazy = () => import('./lazy.ts');");
    w('src/play/_shared/draw.ts', "canvas.getContext('webgl2');");
    w('src/play/_shared/lazy.ts', 'export const x = 1;');
    w('src/play/_shared/commented.ts', "canvas.getContext('2d');");
    w('src/play/_shared/host.test.ts', 'never followed');
    w('outside.ts', 'never followed');
    const got = reachableSources([join(root, 'src/play/r/main.ts')], root).map((f) => relative(root, f)).sort();
    assert.deepEqual(got, ['src/play/_shared/draw.ts', 'src/play/_shared/host.ts', 'src/play/_shared/lazy.ts', 'src/play/r/main.ts']);
    // MUST-RED direction: without the import chain, the entry alone draws nothing.
    assert.deepEqual(reachableSources([join(root, 'src/play/_shared/lazy.ts')], root).map((f) => relative(root, f)), ['src/play/_shared/lazy.ts']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
