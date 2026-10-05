#!/usr/bin/env node
// Static regression tripwire for the shared page chrome — canvas D's site top bar and its footer,
// both rendered by src/components/PageChrome.astro. History: #86 shipped the chrome opt-in and
// home-only; gh#105 widened the scan to EVERY built .html page, recursively, after two measured
// false greens (chrome appended to a non-game page, and a marker on a nested game page, both exited
// 0 while the scan read one directory level); gh#247 ruled the chrome belongs on EVERY page; gh#255
// carried that ruling to the pages that still lacked it and replaced this gate's hand list.
//
// It reads the BUILT artifact, not source: "renders" is a property of the served HTML, and a source
// scan cannot see chrome slipping in (or dropping out) through a layout or an include chain. The
// marker is owned by PageChrome.astro, and its VALUE names the landmark: data-page-chrome="topbar"
// on the top bar, data-page-chrome="footer" on the footer. The parser reads the value; a bare
// attribute or any other value is a red, never a silent "neither".
//
// Why the expected set is DERIVED, not listed. The pre-gh#255 header defended an explicit list of
// pages allowed to render chrome — "permission is a per-page owner call, and an explicit list fails
// safe". gh#247 overturned that premise: chrome is now the DEFAULT, so the list would have had to
// enumerate the pages that MUST render it, and a hand list in that direction fails OPEN — a new page
// shipped without chrome is simply unlisted, and the gate reads green on it. So the expectation is
// keyed on page CLASS, with the game manifest (src/games/manifest.ts, imported and executed, never
// text-grepped) as the one owner of which class a game page is in:
//
//   play route   — dist/game/<id>/<playRoute>/index.html, for every manifest game with a playRoute.
//                  ZERO markers and ZERO <footer> tags: the play route is the app view and a tap target
//                  above the game root is the ADR-0014/0015 hazard itself (owner ruling on gh#255:
//                  unchanged). A <footer> here means the page dropped Base's `chrome` prop.
//   solo landing — dist/game/<id>/index.html, for every manifest game with NO playRoute (rendered by
//                  GameLayout). Footer marker x1, top-bar marker x0, and exactly one <footer> tag
//                  (owner ruling on gh#255: canvas D's footer only; the game topbar and its stable
//                  exit stay as they are).
//   every other page — top-bar marker x1, footer marker x1, and exactly one <footer> tag. The tag
//                  count is what catches a page that renders PageChrome but forgets Base's `chrome`
//                  prop, which ships Base's plain footer as a second one.
//
// Fail closed (docs/adr/0019): the walk must find pages, and each class must be non-empty; any page
// under dist/game/ that is not exactly one of the manifest-derived shapes reds, and an id there that
// the manifest does not know reds by name. NO_CHROME is the only way out of the default class: each
// entry must cite the owner ruling that exempts it, an exempted page must carry no marker, and an
// entry whose page is no longer built reds as stale. It is empty today.
//
// ponytail: raw artifact scan. It proves the SERVED markup — a chrome that renders only behind a
// runtime condition this scan cannot evaluate would pass; nothing in this repo does that, and the
// rendered-DOM proof is the browser walk that accompanies every ticket here, never this gate.
// ponytail: a manifest game whose page is not built at all is not this gate's red — page presence
// against the manifest is the smoke test's count. This gate classes what IS built.
//
//   node scripts/page-chrome-check.mjs             -> scan dist/, exit non-zero on any class breach
//   node scripts/page-chrome-check.mjs --selftest  -> both-direction calibration on temp fixtures

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
// Reused, not re-implemented: csp-inline-check.mjs owns the calibrated HTML comment blanker and
// guards its own entry point, so importing it never runs that gate. See markerHits below.
import { stripHtmlComments } from './csp-inline-check.mjs';
// The one owner of which game page is a play route and which a solo landing (precedent:
// scripts/stage-reserve-probe.mjs). Executed, so the class set is the runtime value.
import { games } from '../src/games/manifest.ts';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const scriptPath = fileURLToPath(import.meta.url);

const MARKER = 'data-page-chrome'; // stamped by src/components/PageChrome.astro, value = landmark
const TOPBAR = 'topbar';
const FOOTER = 'footer';

// The exemption set: built page path (relative to the scanned root) -> the owner ruling that exempts
// it from the every-other-page class. Empty today. An entry must cite an owner ruling by ticket or
// ADR, its page must exist in the artifact (a stale entry reds), and that page must carry no marker.
// Game pages cannot be listed here: their class belongs to the manifest.
const NO_CHROME = new Map([]);

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
// Pure: text -> marker hits, each with its VALUE ('' for a bare attribute). No file IO here, so the
// selftest can feed it strings directly. Built HTML is minified, so hits report the (usually single)
// line number plus a capped snippet.
// ---------------------------------------------------------------------------
const MARKER_RE = /(?<![\w-])data-page-chrome(?![\w-])(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
function markerHits(text) {
  // Comments are blanked before ANY matching, through the one choke point every check reads. Both
  // directions need it: a comment that mentions the marker must not red a page that has none, and —
  // the dangerous one — a page whose only surviving marker sits in a comment must not count as
  // rendering the chrome (a false green reproduced against the built home page in gh#105).
  // stripHtmlComments is the calibrated blanker: it handles the abrupt-close forms (`<!-->`,
  // `<!--->`, `--!>`) a naive lazy match gets wrong, and preserves offsets so line numbers stay true.
  const scanned = stripHtmlComments(text);
  const hits = [];
  scanned.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(MARKER_RE)) {
      hits.push({ line: i + 1, value: m[1] ?? m[2] ?? m[3] ?? '', snippet: line.trim().slice(0, 160) });
    }
  });
  return hits;
}

// Pure: text -> number of <footer> start tags outside comments. Astro emits template comments into
// the built page, so a comment mentioning the tag must not count.
function footerTagCount(text) {
  return (stripHtmlComments(text).match(/<footer(?=[\s>/])/gi) || []).length;
}

// Pure-ish: root -> relative paths of every built .html page, RECURSIVE (gh#105: the recursion is
// the point). Dot-entries are skipped; a missing root yields [] — evaluate() fails closed on the
// empty set, so a vanished dist/ can never read as clean.
function listHtmlPages(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile() && entry.name.endsWith('.html')) out.push(path.relative(root, abs).split(path.sep).join('/'));
    }
  };
  walk(root);
  return out.sort();
}

// Pure: manifest -> Map of built game page path -> 'play' | 'solo'. The play page path is derived
// from the playRoute VALUE, never assumed to be <id>/play/.
function gamePageClasses(gameList) {
  const out = new Map();
  for (const g of gameList) {
    if (g.playRoute) out.set(`${g.playRoute.replace(/^\/+|\/+$/g, '')}/index.html`, 'play');
    else out.set(`game/${g.id}/index.html`, 'solo');
  }
  return out;
}

const CITES_OWNER_RULING = (s) => typeof s === 'string' && /owner/i.test(s) && /gh#\d+|ADR-\d{4}/.test(s);

// Pure: (pages, reader, manifest, exemptions) -> { failures, counts }. Every failure starts with a
// bracketed reason code, so the selftest can prove each fixture reds for its OWN reason and no other.
function evaluate({ pages, read, gameList, noChrome }) {
  const failures = [];
  const fail = (code, msg) => failures.push(`[${code}] ${msg}`);
  const counts = { play: 0, solo: 0, chrome: 0, exempt: 0 };
  const knownIds = new Set(gameList.map((g) => g.id));
  const classes = gamePageClasses(gameList);
  const pageSet = new Set(pages);

  if (pages.length === 0) {
    fail('empty-walk', 'the walk matched zero built .html pages — the target set must never be empty (docs/adr/0019).');
  }

  for (const [rel, ruling] of noChrome) {
    if (!CITES_OWNER_RULING(ruling)) fail('uncited-exemption', `NO_CHROME entry ${rel} must cite the owner ruling that exempts it (an owner ruling by gh#N or ADR-NNNN) — got: ${JSON.stringify(ruling)}`);
    if (rel.startsWith('game/')) fail('game-page-exemption', `NO_CHROME entry ${rel} is a game page — its class belongs to the manifest, never to this set.`);
    if (!pageSet.has(rel)) fail('stale-exemption', `NO_CHROME entry ${rel} is not a built page any more — remove the stale entry.`);
  }

  for (const rel of pages) {
    const text = read(rel);
    const hits = markerHits(text);
    for (const h of hits.filter((x) => x.value !== TOPBAR && x.value !== FOOTER)) {
      fail('unknown-marker-value', `${rel}:${h.line} · ${MARKER} carries ${h.value === '' ? 'no value' : `value ${JSON.stringify(h.value)}`} — only "${TOPBAR}" and "${FOOTER}" exist · ${h.snippet}`);
    }
    const nTop = hits.filter((x) => x.value === TOPBAR).length;
    const nFoot = hits.filter((x) => x.value === FOOTER).length;
    const nFooterTags = footerTagCount(text);

    let cls = classes.get(rel);
    if (!cls && rel.startsWith('game/')) {
      const id = rel.split('/')[1];
      if (!knownIds.has(id)) fail('unmapped-game-id', `${rel} · game id ${JSON.stringify(id)} is not in src/games/manifest.ts — a built game page the manifest does not own cannot be classed.`);
      else fail('unexpected-game-page', `${rel} · not a page the manifest derives for ${id} (its play route, or its landing when it has no play route).`);
      continue;
    }
    if (!cls) cls = noChrome.has(rel) ? 'exempt' : 'chrome';
    counts[cls] += 1;

    if (cls === 'play' || cls === 'exempt') {
      for (const h of hits) fail(cls === 'play' ? 'play-route-marker' : 'exempt-page-marker', `${rel}:${h.line} · ${MARKER}="${h.value}" · ${cls === 'play' ? 'a play route renders no page chrome' : 'a NO_CHROME page renders no page chrome'} · ${h.snippet}`);
      if (cls === 'play' && nFooterTags !== 0) fail('play-route-footer', `${rel} · ships ${nFooterTags} <footer> tag(s), expected 0 — a play route passes Base's \`chrome\` prop with no PageChrome, so a footer here means that prop was dropped (Base's plain footer and its link are back).`);
    } else if (cls === 'solo') {
      if (nTop !== 0) fail('solo-topbar', `${rel} · carries the top-bar marker ${nTop} time(s) — a solo landing renders the footer only.`);
      if (nFoot !== 1) fail('missing-footer', `${rel} · carries the footer marker ${nFoot} time(s), expected 1.`);
      if (nFooterTags !== 1) fail('footer-tags', `${rel} · ships ${nFooterTags} <footer> tag(s), expected exactly 1 — a forgotten \`chrome\` prop on Base ships its plain footer as well.`);
    } else {
      if (nTop !== 1) fail('missing-topbar', `${rel} · carries the top-bar marker ${nTop} time(s), expected 1.`);
      if (nFoot !== 1) fail('missing-footer', `${rel} · carries the footer marker ${nFoot} time(s), expected 1.`);
      if (nFooterTags !== 1) fail('footer-tags', `${rel} · ships ${nFooterTags} <footer> tag(s), expected exactly 1 — a forgotten \`chrome\` prop on Base ships its plain footer as well.`);
    }
  }

  if (pages.length > 0) {
    for (const [cls, label] of [['play', 'play route'], ['solo', 'solo landing'], ['chrome', 'every-other-page']]) {
      if (counts[cls] === 0) fail('empty-class', `the ${label} class matched zero built pages — a class that matches nothing checks nothing (docs/adr/0019).`);
    }
  }
  return { failures, counts };
}

// ---------------------------------------------------------------------------
// Self-test: temp fixtures under os.tmpdir(), never repo content. Spawns the real script (no
// --selftest) against fixture trees so main()'s exit paths are exercised for real; the clean tree is
// driven off the imported manifest, so a new game cannot leave the fixtures behind.
// ---------------------------------------------------------------------------
function write(root, relPath, content) {
  const abs = path.join(root, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
}

const TOPBAR_HTML = '<header class="chrome-bar chrome-topbar" data-page-chrome="topbar"><a href="/">x</a></header>';
const FOOTER_HTML = '<footer class="chrome-bar chrome-footer" data-page-chrome="footer"><span>x</span></footer>';
const CHROME_PAGE = `<!doctype html><body>${TOPBAR_HTML}\n<main>x</main>\n${FOOTER_HTML}</body>`;
const SOLO_PAGE = `<!doctype html><body><main><header class="game-topbar"><a href="/c/fortune/" data-stable-exit>x</a></header></main>\n${FOOTER_HTML}</body>`;
const PLAY_PAGE = '<!doctype html><body><main>app</main></body>';
const OTHER_PAGES = ['index.html', 'c/fortune/index.html', 'c/party/index.html', 'tools/index.html', 'tool/wheel/index.html', 'tool/draw/index.html', '404.html'];
const PLAY_GAMES = games.filter((g) => g.playRoute);
const SOLO_GAMES = games.filter((g) => !g.playRoute);
const playRel = (g) => `${g.playRoute.replace(/^\/+|\/+$/g, '')}/index.html`;

function cleanTree(root, { withPlay = true } = {}) {
  if (withPlay) for (const g of PLAY_GAMES) write(root, playRel(g), PLAY_PAGE);
  for (const g of SOLO_GAMES) write(root, `game/${g.id}/index.html`, SOLO_PAGE);
  for (const rel of OTHER_PAGES) write(root, rel, CHROME_PAGE);
}

function spawnAgainst(fixtureDir, env = {}) {
  return spawnSync(process.execPath, [scriptPath], {
    env: { ...process.env, CI: '', PAGE_CHROME_DIST_OVERRIDE: fixtureDir, ...env },
    encoding: 'utf8',
  });
}

const codesOf = (stderr) => new Set([...stderr.matchAll(/^\[([a-z-]+)\]/gm)].map((m) => m[1]));

function selftest() {
  assert.ok(PLAY_GAMES.length > 0 && SOLO_GAMES.length > 0, 'the manifest must yield both a play-route game and a solo landing, or the fixtures below calibrate nothing');

  // Detector: value read, bare attribute and unknown value surfaced, comments blanked.
  assert.deepEqual(
    markerHits(`<!doctype html>\n${TOPBAR_HTML}\n${FOOTER_HTML}\n<div data-page-chrome></div><i data-page-chrome='x'></i>`).map((h) => [h.line, h.value]),
    [[2, TOPBAR], [3, FOOTER], [4, ''], [4, 'x']],
    'each marker must be found at its line with its value — bare reads as "", unquoted values read too',
  );
  assert.deepEqual(markerHits('<a data-page-chrome-ish="topbar" x-data-page-chrome="footer">no page chrome here</a>'), [], 'look-alike attributes and prose must not read as the marker');
  assert.deepEqual(markerHits('<body><!-- data-page-chrome="topbar" --></body>'), [], 'a marker inside an HTML comment must NOT count as rendered chrome');
  assert.deepEqual(markerHits('<body><!--><header data-page-chrome="topbar">live</header></body>').map((h) => h.value), [TOPBAR], 'a marker after an abrupt-close empty comment is LIVE markup');
  assert.equal(footerTagCount('<footer a><!-- <footer> --><footer>\n<footers><FOOTER/>'), 3, 'footer tags count outside comments only, never a longer tag name');
  console.log('PASS detector: values read per landmark, bare and unknown values surfaced, look-alikes and commented markers ignored, <footer> counted outside comments');

  // Exemption rules, through the pure evaluator — NO_CHROME is empty in production, and a fixture
  // channel for it on the production path would be a backdoor, so these call evaluate() directly.
  {
    const pages = ['index.html', 'tools/index.html', ...PLAY_GAMES.map(playRel), ...SOLO_GAMES.map((g) => `game/${g.id}/index.html`)];
    const content = new Map([
      ['index.html', CHROME_PAGE],
      ['tools/index.html', PLAY_PAGE], // bare: the page the exemptions below point at
      ...PLAY_GAMES.map((g) => [playRel(g), PLAY_PAGE]),
      ...SOLO_GAMES.map((g) => [`game/${g.id}/index.html`, SOLO_PAGE]),
    ]);
    const read = (rel) => content.get(rel);
    const cited = evaluate({ pages, read, gameList: games, noChrome: new Map([['tools/index.html', 'owner ruling 2026-10-05 on gh#255']]) });
    assert.deepEqual(cited.failures, [], `a cited exemption on a bare page must pass — got ${cited.failures}`);
    assert.equal(cited.counts.exempt, 1, 'the exempted page must be counted as exempt');
    const cases = [
      ['stale entry', new Map([['tools/index.html', 'owner ruling on gh#255'], ['gone/index.html', 'owner ruling on gh#255']]), 'stale-exemption', read],
      ['uncited entry', new Map([['tools/index.html', 'looked fine']]), 'uncited-exemption', read],
      ['game page listed', new Map([['tools/index.html', 'owner ruling on gh#255'], [`game/${SOLO_GAMES[0].id}/index.html`, 'owner ruling on gh#255']]), 'game-page-exemption', read],
      ['exempt page carrying chrome', new Map([['tools/index.html', 'owner ruling on gh#255']]), 'exempt-page-marker', (rel) => (rel === 'tools/index.html' ? CHROME_PAGE : read(rel))],
    ];
    for (const [label, noChrome, code, reader] of cases) {
      const r = evaluate({ pages, read: reader, gameList: games, noChrome });
      const got = new Set(r.failures.map((f) => f.match(/^\[([a-z-]+)\]/)[1]));
      assert.ok(got.has(code), `${label}: must red with [${code}] — got ${[...got]}`);
      assert.deepEqual([...got], [code], `${label}: must red for its own reason only — got ${[...got]}`);
      console.log(`PASS NO_CHROME red (${label}): [${[...got].join(', ')}] — ${r.failures.find((f) => f.startsWith(`[${code}]`))}`);
    }
  }

  // Green direction: the manifest-driven clean tree — every play route bare, every solo landing
  // footer-only, the hub, tool, category, home and 404 pages with both landmarks.
  const good = fs.mkdtempSync(path.join(os.tmpdir(), 'page-chrome-good-'));
  try {
    cleanTree(good);
    const run = spawnAgainst(good);
    assert.equal(run.status, 0, `clean fixture must exit 0 — stderr: ${run.stderr}`);
    const expect = `play route (no chrome) ${PLAY_GAMES.length} · solo landing (footer only) ${SOLO_GAMES.length} · every other page (top bar + footer) ${OTHER_PAGES.length} · NO_CHROME exempt 0`;
    assert.ok(run.stdout.includes(expect), `the success line must carry the measured per-class counts (${expect}) — got: ${run.stdout}`);
    assert.ok(run.stdout.includes(good), 'the success line must name the resolved fixture directory, never a hardcoded dist/');
    console.log(`PASS green direction: ${run.stdout.trim()}`);
  } finally {
    fs.rmSync(good, { recursive: true, force: true });
  }

  // Red direction, one breach per tree, everything else clean — each must red with EXACTLY its own
  // reason codes, so a fixture can never pass on another check's red.
  const solo0 = `game/${SOLO_GAMES[0].id}/index.html`;
  const play0 = playRel(PLAY_GAMES[0]);
  const redCases = [
    ['play route carrying the top bar', (r) => write(r, play0, `<!doctype html>${TOPBAR_HTML}<main>app</main>`), ['play-route-marker']],
    // PageChrome's real footer is both a marker AND a <footer> tag, so it reds on both; the marker
    // reason alone is isolated by the top-bar case above, the tag reason alone by the plain-footer case.
    ['play route carrying the footer', (r) => write(r, play0, `<!doctype html><main>app</main>${FOOTER_HTML}`), ['play-route-marker', 'play-route-footer']],
    ['solo landing carrying the top bar', (r) => write(r, solo0, `<!doctype html>${TOPBAR_HTML}${SOLO_PAGE}`), ['solo-topbar']],
    ['play route shipping a plain footer (Base without `chrome`)', (r) => write(r, play0, `${PLAY_PAGE}<footer><a href="/">x</a></footer>`), ['play-route-footer']],
    ['solo landing with no footer marker', (r) => write(r, solo0, SOLO_PAGE.replace(' data-page-chrome="footer"', '')), ['missing-footer']],
    ['solo landing shipping two footers', (r) => write(r, solo0, `${SOLO_PAGE}<footer><a href="/">x</a></footer>`), ['footer-tags']],
    ['tools hub bare', (r) => write(r, 'tools/index.html', PLAY_PAGE), ['missing-topbar', 'missing-footer', 'footer-tags']],
    ['tool page with two <footer> tags', (r) => write(r, 'tool/wheel/index.html', `${CHROME_PAGE}<footer><a href="/">x</a></footer>`), ['footer-tags']],
    ['404 carrying the pre-gh#255 bare marker', (r) => write(r, '404.html', CHROME_PAGE.replace('<main>', '<main data-page-chrome>')), ['unknown-marker-value']],
    ['unmapped game id', (r) => write(r, 'game/nope/index.html', SOLO_PAGE), ['unmapped-game-id']],
    ['nested page under a known game', (r) => write(r, `game/${SOLO_GAMES[0].id}/extra/index.html`, PLAY_PAGE), ['unexpected-game-page']],
    ['tree with no play route', null, ['empty-class']],
  ];
  for (const [label, breach, codes] of redCases) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'page-chrome-bad-'));
    try {
      cleanTree(dir, { withPlay: breach !== null });
      if (breach) breach(dir);
      const run = spawnAgainst(dir);
      assert.notEqual(run.status, 0, `${label}: must exit non-zero`);
      assert.deepEqual([...codesOf(run.stderr)].sort(), [...codes].sort(), `${label}: must red for exactly [${codes}] — stderr: ${run.stderr}`);
      console.log(`PASS red (${label}): ${run.stderr.split('\n')[0]}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  // Empty walk: a green zero would claim coverage of a set that was never scanned.
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'page-chrome-empty-'));
  try {
    write(emptyDir, 'stray.txt', 'not a built page');
    const run = spawnAgainst(emptyDir);
    assert.notEqual(run.status, 0, 'an empty walk must exit non-zero');
    assert.deepEqual([...codesOf(run.stderr)], ['empty-walk'], `an empty walk must red for that reason only — stderr: ${run.stderr}`);
    console.log(`PASS red (empty walk): ${run.stderr.split('\n')[0]}`);
  } finally {
    fs.rmSync(emptyDir, { recursive: true, force: true });
  }

  // CI guard: PAGE_CHROME_DIST_OVERRIDE must never narrow the scanned set in CI.
  const ciDir = fs.mkdtempSync(path.join(os.tmpdir(), 'page-chrome-ci-guard-'));
  try {
    cleanTree(ciDir);
    const run = spawnAgainst(ciDir, { CI: '1' });
    assert.notEqual(run.status, 0, 'PAGE_CHROME_DIST_OVERRIDE + CI must exit non-zero, never scan a narrowed set');
    assert.match(run.stderr, /PAGE_CHROME_DIST_OVERRIDE must never narrow the scanned set in CI/, 'the failure message must name the CI hazard');
    console.log('PASS CI guard: PAGE_CHROME_DIST_OVERRIDE + CI=1 refuses to run instead of scanning a narrowed set');
  } finally {
    fs.rmSync(ciDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
function main() {
  if (process.argv.includes('--selftest')) return selftest();

  const pages = listHtmlPages(distRoot);
  const { failures, counts } = evaluate({
    pages,
    read: (rel) => fs.readFileSync(path.join(distRoot, rel), 'utf8'),
    gameList: games,
    noChrome: NO_CHROME,
  });
  if (failures.length > 0) {
    for (const f of failures) console.error(f);
    console.error(`\npage-chrome-check: ${failures.length} breach(es) in ${distRoot}. gh#247/gh#255: canvas D's top bar and footer render on every page; solo landings carry the footer only; play routes carry neither (ADR-0014).`);
    process.exit(1);
  }
  console.log(
    `page-chrome-check: ${pages.length} page(s) in ${distRoot} — play route (no chrome) ${counts.play} · solo landing (footer only) ${counts.solo} · every other page (top bar + footer) ${counts.chrome} · NO_CHROME exempt ${counts.exempt}${process.env.PAGE_CHROME_DIST_OVERRIDE ? ' (PAGE_CHROME_DIST_OVERRIDE active)' : ''}`,
  );
}

main();
