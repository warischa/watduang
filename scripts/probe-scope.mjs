#!/usr/bin/env node
// Decides whether a branch push must run the browser lanes (gh#270).
//
// The rule is a project-owned INERT-PATH allowlist, never a derivation of "files the lanes execute":
// parsing shell and JS for that set does not converge (a deleted probe path vanished instead of
// failing closed, a ternary dynamic import waived both branches, a regex literal hid an import).
// A path is inert only if it matches INERT below; the lanes are skipped only when the diff is
// non-empty and EVERY path is inert. Anything else, deletions included, runs them. An empty diff
// changed nothing, so it skips.
//
// Why design/ is inert: the canvas never reaches dist/ and nothing the build or the lanes load reads
// it (astro.config.mjs does not, and src/ mentions it only in comments plus unit tests, which the
// workflow runs on every push regardless).
//
//   node scripts/probe-scope.mjs --changed <file>   one path per line -> `run=...` + a reason line
//   node scripts/probe-scope.mjs --inert            prints the inert patterns
//   node scripts/probe-scope.mjs --selftest
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// A .md under src/ or public/ is NOT inert: Astro builds src/pages/**.md into a page, and a static
// page outranks a dynamic route at the same URL, so one Markdown file can replace a page the probes load.
const INERT = [/^docs\//, /^(?!(?:src|public)\/).*\.md$/, /^\.claude\//, /^design\//];

const isInert = (p) => !p.split('/').includes('..') && INERT.some((re) => re.test(p));

function decide(paths) {
  if (paths.length === 0) return { run: false, reason: 'empty diff: nothing changed' };
  const first = paths.find((p) => !isInert(p));
  if (first === undefined) return { run: false, reason: `all ${paths.length} changed paths are inert` };
  return { run: true, reason: `first non-inert path: ${first}` };
}

// Lines are taken verbatim, never trimmed: git keeps a trailing space in a file name, and trimming
// `src/example.md ` would turn a non-inert path into an inert one. Only empty lines are dropped.
const parse = (text) => text.split('\n').filter((l) => l.length > 0);

function selftest() {
  const run = (...paths) => decide(paths).run;
  const incident = ['canvas-ink-probe', 'control-floor-probe', 'croc-bite-first-handled-gap-probe',
    'play-exit-probe', 'strip-chip-visibility-probe', 'webgl-pixels-probe'].map((n) => `scripts/${n}.mjs`);
  assert.equal(run(...incident), true, 'incident range 6138d43..c74b9bb must run');
  assert.equal(run('docs/a.md', 'SESSION-HANDOFF.md', 'docs/x.json'), false, 'docs-only must skip');
  assert.equal(run('astro.config.mjs'), true, 'astro.config.mjs must run');
  assert.equal(run('scripts/webgl-pixels-probe.mjs'), true, 'a deleted probe path is just a path: run');
  assert.equal(run('src/x.ts'), true, 'src must run');
  assert.equal(run('public/x.png'), true, 'public must run');
  assert.equal(run('.github/workflows/ci.yml'), true, 'workflow must run');
  assert.equal(run('.claude/settings.json'), false, '.claude must skip');
  assert.equal(run('design/X.dc.html'), false, 'design must skip');
  assert.equal(run('docs/a.md', 'src/x.ts'), true, 'one non-inert path among inert ones must run');
  assert.equal(run('scripts/docs/x.mjs'), true, 'docs/ mid-path is not inert');
  assert.equal(run('docs/../src/x.ts'), true, 'a .. segment never rides an inert prefix');
  assert.equal(run('README.md', 'a/b/c.md'), false, '*.md at any depth outside src/ and public/ must skip');
  assert.equal(run('src/pages/game/siamsi.md'), true, 'a .md under src/ can be a page: run');
  assert.equal(run('public/notes.md'), true, 'a .md under public/ ships verbatim: run');
  assert.equal(decide(parse('src/example.md \n')).run, true, 'a trailing space in a file name is kept, so the path is not .md');
  assert.equal(run('scripts/play-exit-probe.mjs', 'docs/archive/play-exit-probe.mjs'), true, 'a rename out of the lanes lists both endpoints (the workflow diffs with --no-renames)');
  assert.equal(run('scripts/build-md', 'scripts/x.cmd'), true, 'only a literal .md suffix is inert');
  assert.equal(decide([]).run, false, 'empty diff must skip');
  assert.equal(decide(parse('\n\n')).run, false, 'empty lines are an empty diff');
  assert.match(decide(['docs/a.md', 'src/x.ts']).reason, /src\/x\.ts$/, 'reason names the first non-inert path');
}

const argv = process.argv;
if (argv.includes('--selftest')) {
  selftest();
  console.log('probe-scope selftest ok');
} else if (argv.includes('--inert')) {
  console.log(INERT.map(String).join('\n'));
} else if (argv.includes('--changed')) {
  const file = argv[argv.indexOf('--changed') + 1];
  if (!file) throw new Error('--changed needs a file of changed paths');
  const { run, reason } = decide(parse(readFileSync(file, 'utf8')));
  console.log(`run=${run}\nreason: ${reason}`);
} else {
  throw new Error('usage: probe-scope.mjs --changed <file> | --inert | --selftest');
}
