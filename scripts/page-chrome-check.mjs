#!/usr/bin/env node
// Static regression tripwire for #86: the shared page chrome — the site top bar (brand + four
// nav links) and the footer nav from src/components/PageChrome.astro — is opt-in. gh#105 widened
// the scan (docs/adr/0019-a-tripwires-green-must-not-imply-coverage-it-has-not-earned.md): the
// gate now walks EVERY built .html page, recursively, where it used to read dist/game/*/index.html
// one level deep. Two false greens forced the widening, both measured against the real artifact
// before this header was written:
//   - chrome markup carrying the real marker appended to a built /tools/, /c/<category>/, or
//     404.html page exited 0 — only game pages were enumerated;
//   - the marker on a nested dist/game/x/y/index.html exited 0 — the page-listing helper read one
//     directory level, and the real build is flat, so nothing else would ever have caught it.
//
// It reads the BUILT artifact, not source: "renders" is a property of the served HTML, and a
// source scan cannot see chrome slipping in through a layout or an include chain. The marker the
// component stamps — the bare attribute data-page-chrome, once on the top bar, once on the footer
// nav — is owned by PageChrome.astro, so the check recognises the thing it polices by
// construction rather than by look-alike signals.
//
// Three legs, three sets — and who owns each set is the reason a naive widen was wrong. A plain
// "no page may carry the marker" is false: the chrome legitimately renders on the home page, and
// possibly on other non-game pages by later owner decision. So the gate is inverted instead of
// blanket-banned (docs/adr/0019: an inverted guard must count, not just exclude):
//
//   game leg —    every built page under dist/game/** (recursive) must NOT carry the marker. The
//                 set's owner is the BUILD (the games manifest + getStaticPaths); it is enumerated
//                 by walking the artifact, never from an id list, and the smoke test crosses its
//                 size against the manifest. This set can never be allowlisted: chrome here is the
//                 ADR-0014/0015 tap hazard itself (docs/adr/0014-no-navigation-target-inside-the-
//                 stage.md), not a design drift.
//   opt-in leg —  every built page NOT under dist/game/** must NOT carry the marker unless it has
//                 an ALLOWED_CHROME entry. Owner of the allowed pages: the chrome opt-in — each
//                 entry cites the owner decision that admits it, and the set stays closed
//                 (the docs/adr/0016 pattern this repo keeps for exception sets). Chrome landing on
//                 a page with no entry goes red until a decision is cited, so the list grows only
//                 through decisions, never by drift. An id list over "pages that may render chrome"
//                 would be guessed and rot; the two-state split (provably-allowed few vs
//                 everything else) is the one that converges.
//   render leg —  every page in ALLOWED_CHROME MUST carry the marker at least once. Without this,
//                 a marker rename in the component (or the chrome silently dropped from an opted-in
//                 page) leaves the two negative legs green on nothing — a detector returning
//                 nothing looks exactly like a clean tree.
//
// ponytail: raw artifact scan. It proves the SERVED legend — a chrome that renders only behind a
// runtime condition this scan cannot evaluate would pass; nothing in this repo does that, and the
// real rendered-DOM proof is the browser walk that accompanies every ticket here, never this gate.
// ponytail: an ALLOWED_CHROME entry asserts PERMISSION AND PRESENCE — an entry whose chrome never
// renders reds the render leg. An opted-in page whose marker count drops to zero is caught; what
// this gate does not cover is a _rebuilt_ page that stops being built at all — that page vanishes
// from the artifact walk and no leg sees it. Page presence is the smoke test's count against the
// manifest, not this gate's.
//
//   node scripts/page-chrome-check.mjs             -> scan dist/, exit non-zero if the chrome
//                                                     renders on a page outside the opt-in set,
//                                                     or an opt-in page stops rendering it
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

// The chrome opt-in set: each entry is a built page path relative to the scanned dist root, and each
// entry cites the owner decision that admits it. The set is closed — growing it is a decision, not an
// edit; a page carrying the marker without an entry here goes red (docs/adr/0019). Game pages
// (dist/game/**) can never be admitted: chrome there is the tap hazard this gate and ADR-0014/0015
// exist to prevent, so the game leg bans them below the allowlist entirely. Pinned by the selftest
// (deepEqual), so an entry appearing or disappearing without updating the pin and this comment is
// loud, never silent.
const ALLOWED_CHROME = new Set([
  'index.html', // the home page — #86 shipped the chrome as home-only, and the owner ruled 2026-08-26 to keep it that way while gh#105 widened the scan
]);

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

// Pure-ish: root -> absolute paths of every built .html page, RECURSIVE. gh#105: the pre-widening
// helper read dist/game/*/index.html one directory level deep, so a marker on dist/game/x/y/
// index.html exited 0 (false green), and it never enumerated tool/, tools/, c/, games/, or
// 404.html at all (the other false green). The recursion is the point. Dot-entries are skipped; a
// missing root yields [] — main() fails closed on the empty set, so a vanished dist/ can never
// read as clean. A game directory whose index.html is missing is not a built page and is skipped:
// the built-vs-manifest count is the smoke test's job, not this gate's.
function listHtmlPages(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile() && entry.name.endsWith('.html')) out.push(abs);
    }
  };
  walk(root);
  return out.sort();
}

// ---------------------------------------------------------------------------
// Self-test: temp fixtures under os.tmpdir(), never repo content. Spawns the real script (no
// --selftest) against fixture trees so main()'s exit paths are exercised for real, the same
// idiom no-nav-in-stage-check.mjs uses — reverting a pure-function assertion out of main() still
// shows up here. Calibrated PER MEMBER, not once: each page kind a marker can land on has its own
// red fixture (docs/agents/ci-verification.md — the sitemap gate that passed both ways on one tool
// page while covering 1 of 4).
// ---------------------------------------------------------------------------
function write(root, relPath, content) {
  const abs = path.join(root, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
}

// The planted chrome fixture every red case below uses: the REAL top-bar shape plus the marker,
// so a look-alike detector could never be satisfied by it. Marker lands on line 2.
const PLANTED_CHROME = [
  '<!doctype html>',
  '<header class="chrome-bar" data-page-chrome>',
  '  <a href="/games/">เกมทั้งหมด</a>',
  '</header>',
].join('\n');

// Every red fixture tree needs the other legs clean, or the planted member is not what went red:
// a marked home page (satisfies the render leg) and, where the planted member is not itself a game
// page, one clean game page (satisfies the game leg).
function baseTree(root, withGame = true) {
  write(root, 'index.html', '<header data-page-chrome>bar</header>');
  if (withGame) write(root, 'game/a/index.html', '<!doctype html><title>a</title>');
}

function spawnAgainst(fixtureDir, env = {}) {
  return spawnSync(process.execPath, [scriptPath], {
    env: { ...process.env, CI: '', PAGE_CHROME_DIST_OVERRIDE: fixtureDir, ...env },
    encoding: 'utf8',
  });
}

function selftest() {
  // Detector, firing direction: the marker must be found wherever it lands, and the line number
  // must come from the match. Without this the legs below are guards that cannot fail.
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

  // Allowlist pin: the opt-in set is exactly what the owner has decided through gh#105. An entry
  // appears without its decision cited (or a decision lands without the entry) and this selftest
  // goes red — a set change is loud, never silent (docs/adr/0019).
  assert.deepEqual(
    [...ALLOWED_CHROME],
    ['index.html'],
    'ALLOWED_CHROME changed without this pin being updated — every entry must cite the owner decision that admits it; update the header comment, the pin, and the red fixtures together',
  );
  console.log('PASS allowlist pin: the opt-in set is exactly [index.html] (the #86 home-only owner decision)');

  // Green direction, EVERY member clean: two flat game pages, one NESTED game page (the recursion
  // must not invent reds the old one-level helper never saw), the tools hub, a tool page, a
  // category page, the games hub, 404 — plus a marked home page. Spawns the real script; the
  // success line must name the real counts, not hardcoded sizees (gh#46).
  const good = fs.mkdtempSync(path.join(os.tmpdir(), 'page-chrome-good-'));
  try {
    baseTree(good);
    write(good, 'game/b/index.html', '<!doctype html><title>b</title>');
    write(good, 'game/x/y/index.html', '<!doctype html><title>nested</title>');
    write(good, 'tools/index.html', '<!doctype html><title>tools</title>');
    write(good, 'tool/wheel/index.html', '<!doctype html><title>wheel</title>');
    write(good, 'c/fortune/index.html', '<!doctype html><title>fortune</title>');
    write(good, 'games/index.html', '<!doctype html><title>games</title>');
    write(good, '404.html', '<!doctype html><title>404</title>');
    const run = spawnAgainst(good);
    assert.equal(run.status, 0, `clean fixture must exit 0 — stderr: ${run.stderr}`);
    assert.match(
      run.stdout,
      /3 game page\(s\) and 5 other page\(s\) outside the opt-in set clean of data-page-chrome in .+; opt-in set \[index\.html\] renders it \(1 hit\(s\)\)/,
      'the success line must name the measured counts of both negative legs and the render leg',
    );
    console.log(`PASS negative legs + render leg, green direction: spawned against ${good} — flat and nested game pages, tools hub, tool, category, games hub and 404 all clean; home renders the chrome`);
  } finally {
    fs.rmSync(good, { recursive: true, force: true });
  }

  // Red direction, PER MEMBER: the planted chrome on exactly one page, everything else clean, so
  // the error that follows cannot be any other leg's. The three classes the widened gate must own:
  // a flat game page, a NESTED game page (gh#105 false green 2), and the non-game pages the old
  // scan never enumerated — the tools hub, a tool page, a category page, and 404 (gh#105 false
  // green 1, all three of its named landing sites plus one level deeper). The message must name
  // the file, the line, and which leg fired.
  const GAME_PHRASE = 'game pages must never render it';
  const OPTIN_PHRASE = 'not in the chrome opt-in set';
  for (const [label, member, phrase] of [
    ['a flat game page', 'game/a/index.html', GAME_PHRASE],
    ['a NESTED game page — gh#105 false green 2', 'game/x/y/index.html', GAME_PHRASE],
    ['the /tools/ hub — gh#105 false green 1', 'tools/index.html', OPTIN_PHRASE],
    ['a tool page', 'tool/wheel/index.html', OPTIN_PHRASE],
    ['a category page', 'c/fortune/index.html', OPTIN_PHRASE],
    ['the 404 page', '404.html', OPTIN_PHRASE],
  ]) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'page-chrome-bad-'));
    try {
      baseTree(dir, !member.startsWith('game/'));
      write(dir, member, PLANTED_CHROME);
      const run = spawnAgainst(dir);
      assert.notEqual(run.status, 0, `${label}: a marker on ${member} must exit non-zero`);
      assert.ok(run.stderr.includes(`${member}:2 · ${MARKER}`), `${label}: the failure must name the file, the line and the marker — got: ${JSON.stringify(run.stderr.split('\n')[0])}`);
      assert.ok(run.stderr.includes(phrase), `${label}: the failure must name the leg that fired (${phrase})`);
      console.log(`PASS game/opt-in leg, red direction (${label}): planted chrome on ${member} flagged at line 2 with the ${phrase} message`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  // Render leg, RED directions: the opt-in set is what keeps a marker rename loud. Three shapes —
  // the entry missing entirely, the entry built but unmarked, and (covered below in the empty-set
  // cases) the tree with no non-game pages at all. All three must fail, never read as clean.
  for (const [label, makeTree] of [
    ['opt-in page missing', (root) => { write(root, 'game/a/index.html', '<!doctype html><title>a</title>'); write(root, '404.html', '<!doctype html><title>404</title>'); }],
    ['opt-in page present but unmarked', (root) => { write(root, 'index.html', '<title>x</title>'); write(root, 'game/a/index.html', '<!doctype html><title>a</title>'); write(root, '404.html', '<!doctype html><title>404</title>'); }],
  ]) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'page-chrome-render-'));
    try {
      makeTree(dir);
      const run = spawnAgainst(dir);
      assert.notEqual(run.status, 0, `${label}: the render leg must exit non-zero, or a marker rename goes green on nothing`);
      assert.match(run.stderr, /index\.html (not found under|carries data-page-chrome 0 times)/, `${label}: the failure message must name the opt-in entry`);
      console.log(`PASS render leg, red direction: ${label} exits non-zero and names index.html`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  // Empty-set guards, all three legs: a green zero would claim coverage of a set that was never
  // scanned (docs/adr/0019 rule 1).
  const emptyCases = [
    ['the artifact walk enumerates nothing', (root) => write(root, 'stray.txt', 'not a built page'), /the walk matched zero built \.html pages under/],
    ['no built game pages', (root) => { baseTree(root, false); fs.mkdirSync(path.join(root, 'game')); fs.writeFileSync(path.join(root, 'game', 'stray.txt'), 'not a built page'); }, /zero built pages under dist\/game\/\*\* matched/],
    ['no non-game pages at all', (root) => write(root, 'game/a/index.html', '<!doctype html><title>a</title>'), /zero non-game pages matched under/],
  ];
  for (const [label, makeTree, re] of emptyCases) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'page-chrome-empty-'));
    try {
      makeTree(dir);
      const run = spawnAgainst(dir);
      assert.notEqual(run.status, 0, `${label}: must exit non-zero, never pass by scanning nothing`);
      assert.match(run.stderr, re, `${label}: the failure message must say which set was empty`);
      console.log(`PASS empty-set guard (${label}): exits non-zero and says which set was empty`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  // CI guard: PAGE_CHROME_DIST_OVERRIDE must never narrow the scanned set in CI (coverage it has
  // not earned). Spawns the real script with CI=1 and the override set; it must refuse first.
  const ciDir = fs.mkdtempSync(path.join(os.tmpdir(), 'page-chrome-ci-guard-'));
  try {
    baseTree(ciDir);
    const run = spawnAgainst(ciDir, { CI: '1' });
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
    baseTree(noteDir);
    const run = spawnAgainst(noteDir);
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

  const allPages = listHtmlPages(distRoot);
  const relOf = (abs) => path.relative(distRoot, abs);
  const underGame = (abs) => relOf(abs).startsWith(`game${path.sep}`);

  let anyFail = false;
  const fail = (msg) => {
    console.error(msg);
    anyFail = true;
  };
  const readHits = (abs) => markerHits(fs.readFileSync(abs, 'utf8'));

  if (allPages.length === 0) {
    fail(`page-chrome-check: the walk matched zero built .html pages under ${distRoot} — the target set must never be empty (docs/adr/0019).`);
  }
  const gamePages = allPages.filter(underGame);
  const otherPages = allPages.filter((a) => !underGame(a));
  if (allPages.length > 0 && gamePages.length === 0) {
    fail(`page-chrome-check: zero built pages under dist/game/** matched under ${distRoot} — the target set must never be empty (docs/adr/0019).`);
  }
  if (allPages.length > 0 && otherPages.length === 0) {
    fail(`page-chrome-check: zero non-game pages matched under ${distRoot} — the opt-in leg would report green on nothing, so the set must never be empty (docs/adr/0019).`);
  }

  // Game leg: no built game page may carry the marker — unconditional and below the allowlist.
  // Paths print relative to the scanned root, so a narrowed PAGE_CHROME_DIST_OVERRIDE run names
  // its fixture files, never a made-up dist/ path.
  for (const abs of gamePages) {
    for (const hit of readHits(abs)) {
      fail(`${relOf(abs)}:${hit.line} · ${MARKER} · game pages must never render it · ${hit.snippet}`);
    }
  }

  // Opt-in leg: a non-game page may carry the marker only with an entry in ALLOWED_CHROME. Game
  // pages never reach this branch — the game leg owns that message outright.
  for (const abs of otherPages) {
    if (ALLOWED_CHROME.has(relOf(abs))) continue;
    for (const hit of readHits(abs)) {
      fail(`${relOf(abs)}:${hit.line} · ${MARKER} · not in the chrome opt-in set · ${hit.snippet}`);
    }
  }

  // Render leg: every allowlisted page MUST carry the marker — the positive control (see the
  // header). Counts across the whole set, not just the first entry (docs/adr/0019).
  let optInHits = 0;
  for (const rel of [...ALLOWED_CHROME].sort()) {
    const abs = path.join(distRoot, rel);
    if (!fs.existsSync(abs)) {
      fail(`page-chrome-check: ${rel} not found under ${distRoot} — every page in the chrome opt-in set must exist and render the chrome; without it the two negative legs are detectors that returned nothing, and that is not the same as nothing existing (docs/adr/0019).`);
      continue;
    }
    const hits = readHits(abs).length;
    if (hits === 0) {
      fail(`page-chrome-check: ${rel} carries ${MARKER} 0 times — every page in the chrome opt-in set must render it; without it the two negative legs are detectors that returned nothing, and that is not the same as nothing existing (docs/adr/0019).`);
    }
    optInHits += hits;
  }

  if (anyFail) {
    console.error('\n#86: the page chrome is opt-in. #105: this gate walks every built .html page, recursively — the chrome renders on every page in the opt-in set and on NO other page, game or not. A game page carrying the top bar puts tap targets above #stage (docs/adr/0014-no-navigation-target-inside-the-stage.md).');
    process.exit(1);
  }
  console.log(
    `page-chrome-check: ${gamePages.length} game page(s) and ${otherPages.length - ALLOWED_CHROME.size} other page(s) outside the opt-in set clean of ${MARKER} in ${distRoot}; opt-in set [${[...ALLOWED_CHROME].join(', ')}] renders it (${optInHits} hit(s))${process.env.PAGE_CHROME_DIST_OVERRIDE ? ' (PAGE_CHROME_DIST_OVERRIDE active)' : ''}`
  );
}

await main();