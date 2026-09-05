#!/usr/bin/env node
// gh#209 -- COVERAGE gate for the setup roster row's identity badge: every play route that builds its
// own per-seat setup row must ship a `setup-badge-icon.test.mjs` beside it, and that test is what
// asserts the badge equals the seat's animal glyph. This script never looks at a badge's value; it
// asks only whether the instrument that does exists for every route in the set.
//
// Why a second instrument at all. gh#140's icon reached the shared shell panel and stopped there --
// the routes that build their OWN setup screen render their own row, and those rows opened with a
// seat NUMBER. Four routes were fixed and each grew a value test. Nothing made the fifth route grow
// one, and a route added next month inherits the bug with nothing to catch it. That is the hole here.
//
// THE SET, and who owns it. Route ids come from the game modules' own `playRoute` declarations,
// read through src/games/manifest.ts -- the same derivation scripts/arm-gate-coverage-check.mjs,
// src/play/reset-control-pin.test.mjs and src/play/name-escaping.test.mjs already use, and the one
// declaration the site itself routes on. PARTITION KEY: one route id = one directory under src/play/.
// The set is NOT a filesystem walk and NOT a hand-typed list: a twelfth port joins the day its
// module declares a route. Reconciliation is FAIL-CLOSED in both directions (reconcileRoutes below):
// a declared route with no directory, or a directory no module declares, is a VIOLATION -- an
// undeclared directory is precisely a route this gate would otherwise never scan, which is the shape
// of hole gh#170 opened against the arm gate.
//
// WHAT FALLS OUTSIDE. The shared shell panel (src/shell/player-select.ts) renders no per-route
// directory and is not in this set; it is covered by its own tests. Anything below src/play/<id>/ in
// a subdirectory is invisible here, the same disclosed bound no-nav-in-stage-check.mjs carries.
//
// DEFAULTS TO CHECKED. There is no opt-in list. Every route in the set owes the test file unless it
// is named in EXEMPT_ROUTES with a reason string, and an exemption is RE-PROVED on every run rather
// than believed: a route claiming exemption whose own source still builds a per-seat name input is a
// violation, not a pass (refutedExemptions). A stale entry naming a route the set no longer holds is
// also a violation (ghostExemptions) -- otherwise it stands as a licence for whatever later takes
// that id.
//
//   node scripts/setup-badge-icon-coverage-check.mjs             -> audit every declared play route
//   node scripts/setup-badge-icon-coverage-check.mjs --selftest  -> calibration on throwaway fixtures

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const REQUIRED_TEST = 'setup-badge-icon.test.mjs';

// Exemptions: explicit, each naming WHY and what ends it. Checked first as "is this the provably-safe
// few", then negated -- an unlisted route defaults to GUARDED. EMPTY TODAY, and that is a measured
// fact, not an aspiration: all 11 declared routes build a per-seat setup row with an emoji badge
// (every one of them creates a name text input from its own row builder), so no route can currently
// hold an exemption that survives buildsPerSeatRow below. A route with no setup roster row of its own
// -- one that takes its whole roster from the shared shell panel and renders no per-seat row -- is
// what this map is for.
const EXEMPT_ROUTES = new Map();

/** Does this route source build a per-seat setup roster row of its own?
 *
 *  The proxy is "it creates a name text input" -- a template-literal `<input` or a
 *  `createElement('input')`. Every route that renders a seat row renders that row's name field, and
 *  a route with no row of its own has no field to create.
 *
 *  ponytail: a raw-text proxy, deliberately over-detecting. The direction is what makes it safe: a
 *  false TRUE only ever REFUTES an exemption (the gate demands a test that may not have been needed);
 *  a false FALSE would let an exemption stand. An `<input` inside a comment or a string counts, and
 *  that is the fail-closed side. It is also not load-bearing while EXEMPT_ROUTES is empty -- nothing
 *  consults it until someone claims an exemption. */
export function buildsPerSeatRow(text) {
  return /<input[\s>]|createElement\(\s*(['"`])input\1/i.test(text);
}

/** The route ids the game modules declare a play route for, sorted. */
async function deriveDeclaredRoutes(manifestUrl = new URL('../src/games/manifest.ts', import.meta.url)) {
  const { games } = await import(manifestUrl.href);
  return games.filter((g) => g.playRoute).map((g) => g.id).sort();
}

/** Every directory directly under `dir`, sorted. Directories only: `_mascots.ts`, `_setup-bridge.ts`
 *  and the shared `*.test.mjs` files sit directly under src/play/ and are not routes. */
export function listRouteDirs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** Fail-closed reconciliation between what the modules declare and what is on disk. Pure, so both
 *  directions calibrate without planting a directory in src/play/, which another owner holds. */
export function reconcileRoutes(declared, onDisk) {
  const disk = new Set(onDisk);
  const decl = new Set(declared);
  return {
    routes: [...new Set([...declared, ...onDisk])].sort(),
    missingDirs: declared.filter((id) => !disk.has(id)),
    undeclaredDirs: onDisk.filter((id) => !decl.has(id)),
  };
}

/** The scannable source files of one route directory -- what buildsPerSeatRow reads. Tests excluded:
 *  a test that builds an input fixture is not a route rendering one. */
function routeSources(dir, id) {
  const abs = path.join(dir, id);
  if (!fs.existsSync(abs)) return '';
  return fs.readdirSync(abs)
    .filter((name) => /\.(html|js|ts)$/.test(name) && !name.includes('.test.'))
    .map((name) => fs.readFileSync(path.join(abs, name), 'utf8'))
    .join('\n');
}

/** Does the route's required test file exist AND assert anything? A file present but empty is the
 *  "gate that cannot fail" shape this repo has already shipped once, so presence alone is not the
 *  requirement -- it must contain at least one `assert.` call. */
export function testFileState(dir, id) {
  const abs = path.join(dir, id, REQUIRED_TEST);
  if (!fs.existsSync(abs)) return 'missing';
  return /\bassert\.\w+\(/.test(fs.readFileSync(abs, 'utf8')) ? 'ok' : 'vacuous';
}

/** The whole audit, pure over its inputs so the selftest drives it on a fixture tree. */
export function audit({ dir, declared, onDisk, exempt = EXEMPT_ROUTES, readSources = routeSources, readTest = testFileState }) {
  const { routes, missingDirs, undeclaredDirs } = reconcileRoutes(declared, onDisk);
  const violations = [];

  for (const id of missingDirs) {
    violations.push(`${id}: declares a play route but has no src/play/${id}/ directory to scan`);
  }
  for (const id of undeclaredDirs) {
    violations.push(`${id}: a play-route directory no game module declares — this gate would never scan it`);
  }
  for (const id of [...exempt.keys()].filter((id) => !routes.includes(id)).sort()) {
    violations.push(`${id}: GHOST exemption — no such route in the set; delete the entry`);
  }

  for (const id of routes) {
    if (missingDirs.includes(id)) continue;
    if (exempt.has(id)) {
      if (buildsPerSeatRow(readSources(dir, id))) {
        violations.push(`${id}: exemption REFUTED — claims "${exempt.get(id)}" but its own source still builds a per-seat setup row`);
      }
      continue;
    }
    const state = readTest(dir, id);
    if (state === 'missing') {
      violations.push(`${id}: no src/play/${id}/${REQUIRED_TEST} — every play route owes one, or an entry in EXEMPT_ROUTES with a reason`);
    } else if (state === 'vacuous') {
      violations.push(`${id}: src/play/${id}/${REQUIRED_TEST} contains no assert.* call — it can never fail`);
    }
  }

  return { routes, violations };
}

// The disclosure printed on EVERY run, green or red. A coverage green must never be read as a
// value green -- that misreading is exactly how this repo's arm gate hid twenty-three ungated
// buttons behind its own passing line.
const DISCLOSURE = [
  'COVERAGE ONLY — this gate proves an instrument EXISTS per route, never that any badge is correct.',
  'It stays GREEN while a route\'s badge is reverted from the animal glyph to a seat number: coverage',
  'cannot see a value regression. The per-route setup-badge-icon.test.mjs files are what red on that,',
  'and `node --test` is the executor that runs them. Two further bounds: only files directly inside',
  'src/play/<id>/ are read, and buildsPerSeatRow is a raw-text proxy that over-detects on purpose.',
];

function selftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-badge-coverage-'));
  const mkRoute = (id, { test: testBody, source = '<input type="text" class="player-input">' } = {}) => {
    fs.mkdirSync(path.join(tmp, id), { recursive: true });
    fs.writeFileSync(path.join(tmp, id, 'main.js'), source);
    if (testBody !== undefined) fs.writeFileSync(path.join(tmp, id, REQUIRED_TEST), testBody);
  };

  // Leg 1 -- the green: a declared route on disk with a real test file passes.
  mkRoute('covered', { test: "import assert from 'node:assert/strict';\nassert.equal(1, 1);\n" });
  let r = audit({ dir: tmp, declared: ['covered'], onDisk: listRouteDirs(tmp) });
  assert.deepEqual(r.violations, [], 'a route with a real test must not violate');

  // Leg 2 -- MUST-RED, the whole point: a route with no test file reds. This is the direction the
  // gate exists for, and a green here means the gate is measuring nothing.
  mkRoute('forgotten');
  r = audit({ dir: tmp, declared: ['covered', 'forgotten'], onDisk: listRouteDirs(tmp) });
  assert.equal(r.violations.length, 1, `an untested route must red: ${JSON.stringify(r.violations)}`);
  assert.match(r.violations[0], /^forgotten: no src\/play\/forgotten\//);

  // Leg 3 -- MUST-RED: a test file that asserts nothing is not coverage.
  mkRoute('vacuous', { test: "import test from 'node:test';\ntest('nothing', () => {});\n" });
  r = audit({ dir: tmp, declared: ['vacuous'], onDisk: ['vacuous'] });
  assert.match(r.violations[0], /contains no assert\.\* call/);

  // Leg 4 -- MUST-RED: an exemption is re-proved, never believed. The route claims it has no setup
  // row while its own source builds one.
  r = audit({ dir: tmp, declared: ['forgotten'], onDisk: ['forgotten'], exempt: new Map([['forgotten', 'no roster row of its own']]) });
  assert.match(r.violations[0], /exemption REFUTED/);

  // Leg 5 -- the exemption that HOLDS: same claim, and a source that really builds no seat field.
  mkRoute('rosterless', { source: '<button id="start">go</button>' });
  r = audit({ dir: tmp, declared: ['rosterless'], onDisk: ['rosterless'], exempt: new Map([['rosterless', 'roster comes from the shared shell panel']]) });
  assert.deepEqual(r.violations, [], 'an exemption whose claim survives re-proof must pass');

  // Leg 6 -- MUST-RED both reconciliation directions, and a ghost entry.
  r = audit({ dir: tmp, declared: ['ghosted'], onDisk: [] });
  assert.match(r.violations[0], /has no src\/play\/ghosted\/ directory/);
  r = audit({ dir: tmp, declared: [], onDisk: ['rosterless'], exempt: new Map() });
  assert.match(r.violations.join('\n'), /no game module declares/);
  r = audit({ dir: tmp, declared: ['covered'], onDisk: ['covered'], exempt: new Map([['deleted-route', 'was rosterless']]) });
  assert.match(r.violations.join('\n'), /GHOST exemption/);

  // Leg 7 -- buildsPerSeatRow both ways, including the createElement idiom two routes use.
  assert.equal(buildsPerSeatRow("const i = document.createElement('input');"), true);
  assert.equal(buildsPerSeatRow('<div class="player-avatar">X</div>'), false);

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('setup-badge-icon-coverage-check selftest: 7 legs pass (5 of them must-red)');
}

if (process.argv.includes('--selftest')) {
  selftest();
} else {
  const dir = path.join(repoRoot, 'src/play');
  const { routes, violations } = audit({ dir, declared: await deriveDeclaredRoutes(), onDisk: listRouteDirs(dir) });

  for (const line of DISCLOSURE) console.log(`  ${line}`);
  if (violations.length > 0) {
    console.error(`\nsetup-badge-icon-coverage-check: ${violations.length} violation(s) across ${routes.length} declared play route(s)\n`);
    for (const v of violations) console.error(`  ✗ ${v}`);
    process.exit(1);
  }
  const exemptNote = EXEMPT_ROUTES.size === 0 ? 'no route is exempt' : `${EXEMPT_ROUTES.size} exemption(s), each re-proved above`;
  console.log(`\nsetup-badge-icon-coverage-check: ${routes.length} play route(s) each ship ${REQUIRED_TEST}; ${exemptNote}.`);
}
