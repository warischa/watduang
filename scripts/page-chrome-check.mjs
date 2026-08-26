#!/usr/bin/env node
// Static regression tripwire for #86: the shared page chrome — the site top bar (brand + four
// nav links) and the footer nav from src/components/PageChrome.astro — is opt-in, and the home
// page is its only consumer. The six game pages must NOT render it: a link rendered above #stage
// there is exactly the tap hazard ADR-0014 and ADR-0015 exist to prevent
// (docs/adr/0014-no-navigation-target-inside-the-stage.md, docs/adr/0015-a-leave-confirm-guards-
// the-links-we-cannot-move.md), and the 44px tap-target measurements were taken against a shell
// with no such links in it.
//
// It reads the BUILT artifact, not source: "renders" is a property of the served HTML, and a
// source scan cannot see chrome slipping in through a layout or an include chain. The marker the
// component stamps — the bare attribute data-page-chrome, once on the top bar, once on the footer
// nav — is owned by PageChrome.astro, so the check recognises the thing it polices by
// construction rather than by look-alike signals.
//
// Two legs, and the second is the positive control that keeps the first honest (docs/adr/0019):
//   game leg —  no dist/game/*/index.html may contain the marker;
//   home leg —  dist/index.html MUST contain it at least once.
// A marker rename in the component (or the chrome silently dropped from the home page) turns the
// home leg red while the game leg would have gone green on nothing — a detector returning nothing
// looks exactly like a clean tree, so the home leg exists to make that reading impossible.
//
// ponytail: raw artifact scan. It proves the SERVED legend — a chrome that renders only behind a
// runtime condition this scan cannot evaluate would pass; nothing in this repo does that, and the
// real rendered-DOM proof is the browser walk that accompanies every ticket here, never this gate.
//
//   node scripts/page-chrome-check.mjs             -> scan dist/, exit non-zero if the chrome
//                                                     renders on a game page, or the home page
//                                                     stops rendering it
//   node scripts/page-chrome-check.mjs --selftest  -> both-direction calibration on temp fixtures

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const scriptPath = fileURLToPath(import.meta.url);

const MARKER = 'data-page-chrome'; // stamped by src/components/PageChrome.astro on bar and footer
const HOME_REL = 'dist/index.html';

// ponytail: PAGE_CHROME_DIST_OVERRIDE exists only so the selftest can spawn this script for real
// against a directory it controls, to exercise main()'s actual exit paths. Blocked whenever CI is
// truthy (guard below) so it can never narrow the scanned set in CI. Locally, with CI unset, it is
// still a foot-gun: pointing it at a directory holding one clean fixture gets a green claiming
// coverage of a set that was never the real artifact — that risk is on whoever runs it manually,
// not on this script's default (no env var) invocation.
const distRoot = process.env.PAGE_CHROME_DIST_OVERRIDE
  ? path.resolve(process.env.PAGE_CHROME_DIST_OVERRIDE)
  : path.join(repoRoot, 'dist');

// ADR-0019: a gate's green must not imply coverage it has not earned. PAGE_CHROME_DIST_OVERRIDE
// narrows the scanned set by construction, so it must never be usable where a green is actually
// trusted (the same guard no-nav-in-stage-check.mjs carries for GAMES_DIR_OVERRIDE).
if (process.env.PAGE_CHROME_DIST_OVERRIDE && process.env.CI) {
  console.error('page-chrome-check: PAGE_CHROME_DIST_OVERRIDE must never narrow the scanned set in CI (docs/adr/0019) — unset PAGE_CHROME_DIST_OVERRIDE or run outside CI.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Pure: text -> marker hits. No file IO here, so the selftest can feed it strings directly.
// Built HTML is minified, so hits report the (usually single) line number plus a capped snippet.
// ---------------------------------------------------------------------------
function markerHits(text) {
  const hits = [];
  text.split('\n').forEach((line, i) => {
    if (line.includes(MARKER)) {
      hits.push({ line: i + 1, snippet: line.trim().slice(0, 160) });
    }
  });
  return hits;
}

// Pure-ish: root -> absolute paths of built game pages. A game directory whose index.html is
// missing is not a built page and is skipped — the built-vs-manifest count is the smoke test's
// job, not this gate's; what this gate must never do is report a verdict over an empty set, which
// is why main() fails closed on zero files.
function listBuiltGamePages(root) {
  const gameDir = path.join(root, 'game');
  if (!fs.existsSync(gameDir)) return [];
  return fs.readdirSync(gameDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(gameDir, d.name, 'index.html'))
    .filter((abs) => fs.existsSync(abs))
    .sort();
}

// ---------------------------------------------------------------------------
// Self-test: temp fixtures under os.tmpdir(), never repo content. Spawns the real script (no
// --selftest) against fixture trees so main()'s exit paths are exercised for real, the same
// idiom no-nav-in-stage-check.mjs uses — reverting a pure-function assertion out of main() still
// shows up here. Every leg calibrated both ways: marker present and marker absent.
// ---------------------------------------------------------------------------
function write(root, relPath, content) {
  const abs = path.join(root, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
}

function selftest() {
  // Detector, firing direction: the marker must be found wherever it lands, and the line number
  // must come from the match. Without this the two legs below are a guard that cannot fail.
  const dirtyLines = [
    '<!doctype html>',
    '<header class="chrome-bar" data-page-chrome>',
    '  <a href="/c/fortune/">ดูดวง</a>',
    '<footer class="chrome-bar" data-page-chrome>',
  ].join('\n');
  const dirty = markerHits(dirtyLines);
  assert.deepEqual(
    dirty.map((h) => h.line),
    [2, 4],
    'both marker-bearing lines must be found, at their line numbers',
  );
  console.log('PASS marker detector, firing direction: top-bar and footer markers found, one hit per line');

  // Detector, other direction: the shapes the built artifact really ships around the marker must
  // not read as one — including a plain mention in text and the substring inside prose.
  const cleanLines = [
    '<!doctype html>',
    '<header class="game-topbar"><a href="/games/" data-stable-exit-ish-no">x</a></header>',
    'no page chrome here',
  ].join('\n');
  assert.deepEqual(markerHits(cleanLines), [], 'fixtures without the exact marker must report zero hits');
  console.log('PASS marker detector, other direction: unrelated attributes and prose stay clean');

  // Game leg, GREEN direction: two built game pages, no marker. Spawns the real script.
  const good = fs.mkdtempSync(path.join(os.tmpdir(), 'page-chrome-good-'));
  try {
    write(good, 'index.html', '<!doctype html><body><header data-page-chrome>bar</header><main>x</main><footer data-page-chrome>foot</footer></body>');
    write(good, 'game/a/index.html', '<!doctype html><title>a</title>');
    write(good, 'game/b/index.html', '<!doctype html><title>b</title>');
    const run = spawnSync(process.execPath, [scriptPath], {
      env: { ...process.env, CI: '', PAGE_CHROME_DIST_OVERRIDE: good },
      encoding: 'utf8',
    });
    assert.equal(run.status, 0, `clean fixture must exit 0 — stderr: ${run.stderr}`);
    assert.match(run.stdout, /2 built game page\(s\) clean of data-page-chrome in .+; dist\/index\.html renders it/, 'the success line must name both legs and their counts');
    console.log(`PASS game leg, green direction: spawned against ${good} — 2 clean game pages + marked home page exit 0`);
  } finally {
    fs.rmSync(good, { recursive: true, force: true });
  }

  // Game leg, RED direction: the deliberately planted defect — the chrome added to one game
  // page, the exact regression this gate exists to catch. The message must name the file.
  const badGame = fs.mkdtempSync(path.join(os.tmpdir(), 'page-chrome-bad-'));
  try {
    write(badGame, 'index.html', '<header data-page-chrome>bar</header>');
    write(badGame, 'game/a/index.html', '<title>a</title>');
    write(badGame, 'game/b/index.html', '<header class="chrome-bar" data-page-chrome>\n  <a href="/games/">เกมทั้งหมด</a>\n</header>');
    const run = spawnSync(process.execPath, [scriptPath], {
      env: { ...process.env, CI: '', PAGE_CHROME_DIST_OVERRIDE: badGame },
      encoding: 'utf8',
    });
    assert.notEqual(run.status, 0, 'a marker on a game page must exit non-zero');
    assert.match(run.stderr, /game\/b\/index\.html:1 · data-page-chrome/, 'the failure must name the file, the line and the marker');
    console.log(`PASS game leg, red direction: planted chrome on game/b/index.html is flagged with file and line — ${JSON.stringify(run.stderr.split('\n')[0])}`);
  } finally {
    fs.rmSync(badGame, { recursive: true, force: true });
  }

  // Home leg, RED directions: the home control is what keeps a marker rename loud. Three shapes —
  // the file missing entirely, the file present but unmarked, and (covered below in the empty-set
  // case) the tree with no home at all. All three must fail, never read as clean.
  for (const [label, makeHome] of [
    ['home file missing', () => {}],
    ['home file present but unmarked', (root) => write(root, 'index.html', '<title>x</title>')],
  ]) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `page-chrome-home-${label === 'home file missing' ? 'missing' : 'unmarked'}-`));
    try {
      write(dir, 'game/a/index.html', '<title>a</title>');
      makeHome(dir);
      const run = spawnSync(process.execPath, [scriptPath], {
        env: { ...process.env, CI: '', PAGE_CHROME_DIST_OVERRIDE: dir },
        encoding: 'utf8',
      });
      assert.notEqual(run.status, 0, `${label}: the home leg must exit non-zero, or a marker rename goes green on nothing`);
      assert.match(run.stderr, /home page|found 0 times/, `${label}: the failure message must name the home leg`);
      console.log(`PASS home leg, red direction: ${label} exits non-zero`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  // Empty-set guard: a game directory with zero built index.html files must fail closed — a green
  // zero would claim coverage of a set that was never scanned (ADR-0019 rule 1).
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'page-chrome-empty-'));
  try {
    write(empty, 'index.html', '<header data-page-chrome>bar</header>');
    fs.mkdirSync(path.join(empty, 'game'));
    fs.writeFileSync(path.join(empty, 'game', 'stray.txt'), 'not a built page');
    const run = spawnSync(process.execPath, [scriptPath], {
      env: { ...process.env, CI: '', PAGE_CHROME_DIST_OVERRIDE: empty },
      encoding: 'utf8',
    });
    assert.notEqual(run.status, 0, 'zero built game pages must exit non-zero, never pass by scanning nothing');
    assert.match(run.stderr, /target set must never be empty/, 'the failure message must say the set was empty');
    console.log('PASS empty-set guard: zero built game pages exits non-zero and says the set was empty');
  } finally {
    fs.rmSync(empty, { recursive: true, force: true });
  }

  // CI guard: PAGE_CHROME_DIST_OVERRIDE must never narrow the scanned set in CI (coverage it has
  // not earned). Spawns the real script with CI=1 and the override set; it must refuse first.
  const ciDir = fs.mkdtempSync(path.join(os.tmpdir(), 'page-chrome-ci-guard-'));
  try {
    write(ciDir, 'index.html', '<header data-page-chrome>bar</header>');
    write(ciDir, 'game/a/index.html', '<title>a</title>');
    const run = spawnSync(process.execPath, [scriptPath], {
      env: { ...process.env, CI: '1', PAGE_CHROME_DIST_OVERRIDE: ciDir },
      encoding: 'utf8',
    });
    assert.notEqual(run.status, 0, 'PAGE_CHROME_DIST_OVERRIDE + CI must exit non-zero, never scan a narrowed set');
    assert.match(run.stderr, /PAGE_CHROME_DIST_OVERRIDE must never narrow the scanned set in CI/, 'the failure message must name the CI hazard');
    console.log('PASS CI guard: PAGE_CHROME_DIST_OVERRIDE + CI=1 refuses to run instead of scanning a narrowed set');
  } finally {
    fs.rmSync(ciDir, { recursive: true, force: true });
  }

  // Override note: a narrowed run's success line names the resolved fixture directory rather than
  // the hardcoded dist/ — a reader of a green line can tell what was actually scanned (the same
  // note no-nav-in-stage-check.mjs prints for GAMES_DIR_OVERRIDE).
  const noteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'page-chrome-note-'));
  try {
    write(noteDir, 'index.html', '<header data-page-chrome>bar</header>');
    write(noteDir, 'game/a/index.html', '<title>a</title>');
    const run = spawnSync(process.execPath, [scriptPath], {
      env: { ...process.env, CI: '', PAGE_CHROME_DIST_OVERRIDE: noteDir },
      encoding: 'utf8',
    });
    assert.equal(run.status, 0, 'a clean fixture under the override must still pass');
    assert.ok(run.stdout.includes(noteDir), 'the success line must name the resolved fixture directory');
    console.log(`PASS override note: success line names the resolved fixture directory (${noteDir})`);
  } finally {
    fs.rmSync(noteDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
async function main() {
  if (process.argv.includes('--selftest')) return selftest();

  const gamePages = listBuiltGamePages(distRoot);
  if (gamePages.length === 0) {
    console.error(`page-chrome-check: dist/game/*/index.html matched zero built game pages under ${distRoot} — the target set must never be empty (docs/adr/0019).`);
    process.exit(1);
  }

  let anyFail = false;

  // Game leg: no built game page may carry the marker. Paths print relative to the scanned root,
  // so a narrowed PAGE_CHROME_DIST_OVERRIDE run names its fixture files, never a made-up dist/ path.
  for (const abs of gamePages) {
    for (const hit of markerHits(fs.readFileSync(abs, 'utf8'))) {
      console.error(`${path.relative(distRoot, abs)}:${hit.line} · ${MARKER} · ${hit.snippet}`);
      anyFail = true;
    }
  }

  // Home leg: the built home page MUST carry it — the positive control (see the header).
  const homeAbs = path.join(distRoot, 'index.html');
  let homeHits = 0;
  if (!fs.existsSync(homeAbs)) {
    console.error(`page-chrome-check: ${HOME_REL} not found under ${distRoot} — without the built home page to check, a marker rename would go green on the game leg alone, so a missing home file must not read as clean (docs/adr/0019).`);
    anyFail = true;
  } else {
    homeHits = markerHits(fs.readFileSync(homeAbs, 'utf8')).length;
    if (homeHits === 0) {
      console.error(`page-chrome-check: ${HOME_REL} carries ${MARKER} 0 times — the home page must render the chrome; without it, the game leg is a detector that returned nothing, and that is not the same as nothing existing (docs/adr/0019).`);
      anyFail = true;
    }
  }

  if (anyFail) {
    console.error('\n#86: the page chrome is opt-in — it renders on the home page and on NO game page. A game page carrying the top bar puts tap targets above #stage (docs/adr/0014-no-navigation-target-inside-the-stage.md).');
    process.exit(1);
  }
  console.log(
    `page-chrome-check: ${gamePages.length} built game page(s) clean of ${MARKER} in ${distRoot}; ${HOME_REL} renders it (${homeHits} hit(s))${process.env.PAGE_CHROME_DIST_OVERRIDE ? ' (PAGE_CHROME_DIST_OVERRIDE active)' : ''}`
  );
}

await main();