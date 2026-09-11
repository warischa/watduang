#!/usr/bin/env node
// Presence gate for the ONE crawlable outbound link on every built play page.
//
// ADR-0050 deleted the party landings and accepted that deletion because the landing's job — the
// how-to-play copy and the outbound link — moves INSIDE the game, onto the play route. The link half
// was never delivered: every dist/game/*/play/index.html shipped with zero anchors. Nothing noticed,
// because every gate around it is forbid-only and an absence has no token to grep for.
// scripts/no-nav-in-stage-check.mjs bans anchors inside src/play/, scripts/crawl-check-gamenav.mjs
// walks dist/game/<id>/index.html and filters the play-route games straight out of its set, and
// scripts/stable-exit-markers-check.mjs pins a marker in a layout no play route renders. The play
// pages sat outside all three. SEO is this site's business model, so a page with no outbound link is
// a real regression, not a cosmetic one.
//
// THE SET is derived, never listed: every game in src/games/manifest.ts that declares a `playRoute`,
// imported the way scripts/crawl-check-gamenav.mjs imports the same file. A fifteenth play route is
// covered the day its manifest entry lands, and a built play directory with no manifest entry is
// reported rather than skipped.
//
// THE RULE is exactly one `<a ... href=`, counted on comment-stripped HTML. Exactly one in both
// directions: zero is the regression this gate exists for, and a second anchor means a navigation
// target reached the page from somewhere other than the single static one in page chrome — which is
// the hazard ADR-0014 keeps out of the play surface. Comments are stripped first because a
// commented-out anchor in a lifted markup.html would otherwise satisfy the count while the real link
// is gone.
//
// ponytail: counts anchors, does not locate them. It cannot prove the one anchor sits OUTSIDE the
// play surface — that property is owned by scripts/no-nav-in-stage-check.mjs, which bans anchors
// inside src/play/ at source level, so an anchor that drifted into the surface reds there first.
//
//   node scripts/play-crawl-link-check.mjs             -> scan dist/
//   node scripts/play-crawl-link-check.mjs <dir>       -> scan another build output (a throwaway
//                                                         --outDir build, so dist/ is not touched)
//   node scripts/play-crawl-link-check.mjs --selftest  -> calibrate on temp fixtures. No build, no
//                                                         tracked file is written.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const { games } = await import(path.join(repoRoot, 'src/games/manifest.ts'));

// `/game/<id>/play/` -> `game/<id>/play`. Read off playRoute rather than rebuilt from the id, so a
// route that ever moves is followed instead of silently reported missing.
const playPages = games
  .filter((g) => g.playRoute)
  .map((g) => ({ id: g.id, rel: g.playRoute.replace(/^\/|\/$/g, '') }));

const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const ANCHOR = /<a\s[^>]*\bhref\s*=/gi;

const countAnchors = (html) => (html.replace(HTML_COMMENT, '').match(ANCHOR) ?? []).length;

/** @param root a build output directory (dist/, or a throwaway one) */
function scan(root, pages = playPages) {
  const problems = [];
  let scanned = 0;
  for (const page of pages) {
    const htmlPath = path.join(root, page.rel, 'index.html');
    if (!fs.existsSync(htmlPath)) {
      // ADR-0019: without this, an empty output directory satisfies every per-page rule vacuously
      // and this gate prints a full-coverage green over nothing.
      problems.push({ page: page.rel, kind: 'missing-page', text: `${page.rel}/index.html: not built — the manifest declares a playRoute for ${page.id}` });
      continue;
    }
    scanned += 1;
    const found = countAnchors(fs.readFileSync(htmlPath, 'utf8'));
    if (found === 0) {
      problems.push({ page: page.rel, kind: 'zero', text: `${page.rel}/index.html: no <a href> at all — ADR-0050 moved the landing's outbound link onto this page, and a play page with no crawlable link is a dead end for a crawler` });
    } else if (found > 1) {
      problems.push({ page: page.rel, kind: 'many', text: `${page.rel}/index.html: ${found} <a href> elements, expected exactly 1 — a second navigation target on a play route needs a human decision (ADR-0014)` });
    }
  }
  // A built play directory with no manifest entry has no expectation above, so it is named here
  // rather than passing unread.
  const gameRoot = path.join(root, 'game');
  if (fs.existsSync(gameRoot)) {
    const known = new Set(pages.map((p) => p.rel));
    for (const d of fs.readdirSync(gameRoot, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const rel = path.posix.join('game', d.name, 'play');
      if (fs.existsSync(path.join(root, rel, 'index.html')) && !known.has(rel)) {
        problems.push({ page: rel, kind: 'unknown-page', text: `${rel}/index.html: built, but no manifest game declares this playRoute` });
      }
    }
  }
  return { problems, scanned };
}

// ---------------------------------------------------------------------------
const write = (root, rel, html) => {
  const abs = path.join(root, rel, 'index.html');
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, html, 'utf8');
};

const LINK = '<a class="play-crawl-home" href="/">กลับหน้าแรก</a>';
const PAGE = (body) => `<!doctype html><html lang="th"><body>${body}<div id="app"></div></body></html>`;

function selftest() {
  const pages = [{ id: 'alpha', rel: 'game/alpha/play' }, { id: 'beta', rel: 'game/beta/play' }];
  const cases = [
    { name: 'green — exactly one anchor per page', pages: { alpha: PAGE(LINK), beta: PAGE(LINK) }, mustFire: null },
    { name: 'the link is gone (the state this gate was written for)', pages: { alpha: PAGE(''), beta: PAGE(LINK) }, mustFire: 'zero' },
    { name: 'a second navigation target shipped', pages: { alpha: PAGE(`${LINK}<a href="/games/">อื่น ๆ</a>`), beta: PAGE(LINK) }, mustFire: 'many' },
    { name: 'a page was never built', pages: { beta: PAGE(LINK) }, mustFire: 'missing-page' },
    // The must-red that a token count alone would miss: the anchor is present in the bytes, but only
    // inside an HTML comment, so the page a crawler reads still has no link.
    { name: 'the only anchor is commented out', pages: { alpha: PAGE(`<!-- ${LINK} -->`), beta: PAGE(LINK) }, mustFire: 'zero' },
    { name: 'a built play page no manifest entry claims', pages: { alpha: PAGE(LINK), beta: PAGE(LINK), gamma: PAGE(LINK) }, mustFire: 'unknown-page' },
  ];

  let planted = 0;
  let caught = 0;
  for (const c of cases) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'play-crawl-link-'));
    try {
      for (const [id, html] of Object.entries(c.pages)) write(root, `game/${id}/play`, html);
      const { problems } = scan(root, pages);
      if (c.mustFire === null) {
        assert.deepEqual(problems, [], `the green fixture must produce no problems, got: ${problems.map((p) => p.text).join('; ')}`);
        console.log(`PASS ${c.name}`);
        continue;
      }
      planted += 1;
      const fired = problems.filter((p) => p.kind === c.mustFire);
      if (fired.length === 0) {
        throw new Error(`calibration FAILED (${c.name}): expected a \`${c.mustFire}\` problem, got:\n${problems.map((p) => p.text).join('\n') || '(none — this gate cannot fail)'}`);
      }
      caught += 1;
      console.log(`PASS calibrated red — ${c.name}: ${fired[0].text}`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  // The counter itself, at the two boundaries the fixtures above exercise through the file system.
  assert.equal(countAnchors('<a href="/">x</a>'), 1, 'a plain anchor must count as one');
  assert.equal(countAnchors('<!-- <a href="/">x</a> -->'), 0, 'an anchor inside a comment must count as zero');
  assert.equal(countAnchors('<abbr title="x">a</abbr>'), 0, 'a tag merely starting with "a" must not count');

  // Printed even on the happy path: a stale fixture shape would plant nothing, and zero planted
  // mutants reads exactly like a clean run unless the tally is on screen.
  console.log(`MUTANTS planted ${planted}/${cases.length - 1}, caught ${caught}/${planted}`);
  if (planted !== cases.length - 1) throw new Error('not every calibration case was planted');
  console.log(`PASS the derived set covers ${playPages.length} play route(s) from the manifest, none of them written here`);
}

// ---------------------------------------------------------------------------
if (process.argv.includes('--selftest')) {
  selftest();
} else {
  const arg = process.argv.slice(2).find((a) => !a.startsWith('-'));
  const root = arg ? path.resolve(arg) : path.join(repoRoot, 'dist');
  const { problems, scanned } = scan(root);
  if (problems.length > 0) {
    console.error(problems.map((p) => p.text).join('\n'));
    console.error(`\n${problems.length} problem(s) across the play pages in ${root}.`);
    process.exit(1);
  }
  // `scanned`, not the manifest length: the sentence next to a green is a claim too (ADR-0019).
  console.log(`OK — all ${scanned} play page(s) in ${root} carry exactly one crawlable <a href>.`);
}
