#!/usr/bin/env node
// gh#39 verify item 3, narrowed by gh#94, widened by gh#115 — proves GameNav still renders a crawlable
// /game/*/ link to every game the page's own category should offer (the whole reason #35's exclude-self
// GameNav exists), and never a self-link. gh#115: the same GameNav component also renders on the four
// /tool/*/ pages under a per-page navClass (wheel-next, draw-next, team-next, number-next), which this
// script never read before — scanned below too, enumerated from src/tools/manifest.ts so a fifth tool
// cannot silently fall out of coverage.
// Wired into CI: .github/workflows/ci.yml runs the real scan after Build. --selftest is NOT
// run there — it rebuilds dist/ and would desync the artifact later steps ship. Run it by hand.
//
//   node scripts/crawl-check-gamenav.mjs             -> scan dist/, exit non-zero on mismatch
//   node scripts/crawl-check-gamenav.mjs --selftest  -> calibrates red TWICE, once per property:
//                                                        drop a sibling (count goes red), then put the
//                                                        page's own game back into GameNav's list so a
//                                                        self-link ships (self-link goes red, count
//                                                        does not). Rebuilds and restores after each.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const distDir = path.join(repoRoot, 'dist', 'game');

// gh#94 made the expectation category-dependent, so it can no longer be a count parsed out of the
// manifest text: it has to be the same DATA the page renders from. Imported the way
// scripts/validate-games.mjs imports these two files — every relative import inside them is either
// `import type` (node erases it) or spells its full .ts extension, so plain node resolves them with
// no loader hook. This is what keeps a fourth category from needing an edit in this script.
const { games } = await import(path.join(repoRoot, 'src/games/manifest.ts'));
const { categories } = await import(path.join(repoRoot, 'src/games/categories.ts'));
const { tools } = await import(path.join(repoRoot, 'src/tools/manifest.ts'));

// gh#115: tool pages have no category/carriesGroup entry of their own (ADR-0032 — tools are not a
// category), so the expectation can't be read off a manifest the way expectedSiblings() reads it for
// games. It's read off the same place GameNav itself reads it: the literal navClass/category props each
// /tool/*/ page passes to <GameNav ... />. No category literal or count is written here — both fall out
// of the page's own source plus the games manifest, same as the game-page path above.
const toolPages = tools.map((t) => {
  const slug = t.href.match(/^\/tool\/([^/]+)\/$/)[1];
  const srcFile = path.join(repoRoot, 'src/pages/tool', `${slug}.astro`);
  const source = fs.readFileSync(srcFile, 'utf8');
  const tag = source.match(/<GameNav\b[\s\S]*?\/>/);
  if (!tag) throw new Error(`scripts/crawl-check-gamenav.mjs: ${srcFile} has no <GameNav ... /> call to read expectations from`);
  const navClass = tag[0].match(/navClass="([^"]+)"/)?.[1];
  const category = tag[0].match(/category="([^"]+)"/)?.[1];
  if (!navClass) throw new Error(`scripts/crawl-check-gamenav.mjs: ${srcFile}'s <GameNav> has no literal navClass="..." to scope the nav block to`);
  const expected = games.filter((g) => !category || g.category === category).length;
  return { slug, navClass, category, expected };
});

// The page's own rule, restated over the same two manifests GameLayout and GameNav read: a game in a
// category that carries the group onward lists only that category; one in a category that does
// not keeps every link (ADR-0014 wants the crawlable chrome links). Neither a slug nor a link count is written here —
// both fall out of the data, which is acceptance criterion 5 of gh#94 applied to the gate itself.
const expectedSiblings = (game) =>
  games.filter(
    (g) => (!categories[game.category].carriesGroup || g.category === game.category) && g.id !== game.id,
  ).length;

// TWO properties, scored separately, because #35 created two ways to be wrong and a single count
// catches only one of them. The count alone was blind by construction: it deleted the self-link
// before counting, so a page linking to its OWN game still counted 5 siblings and passed — which is
// precisely the regression (a dropped `excludeId` filter) this check exists to catch. The
// `shown.pop()` calibration only ever proved the undercount half.
//
// Scoped to the GameNav block, not the page: /games/ hub cards and any future related-games strip
// would otherwise be counted as siblings here, and the self-link rule would fire on a page that is
// legitimately allowed to name itself somewhere else in its own chrome.
const NAV_BLOCK = /<nav class="game-next"[\s\S]*?<\/nav>/;

// `root` is a parameter only so the page-count calibration below can point it at an empty temp dir
// without rebuilding dist/. Every real caller uses the default.
function scan(root = distDir) {
  const dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
  const problems = [];
  // ADR-0019: every problem below is per-page, so an EMPTY dist/game/ satisfies all of them
  // vacuously — measured by moving the six page dirs aside: exit 0, printing the full-coverage OK
  // line over zero pages. The set is not a guess:
  // CLAUDE.md pins 1 game = 1 static URL, so the manifest's own length is what dist/game/ must hold.
  if (dirs.length !== games.length) {
    problems.push({
      page: '(all)',
      kind: 'page-count',
      text: `dist/game/: ${dirs.length} game page(s) built, manifest declares ${games.length} — the scanned set must match the manifest (1 game = 1 static URL), or a per-page scan reports clean over pages that were never built`,
    });
  }
  for (const d of dirs) {
    // The dir name IS the game id (1 game = 1 static URL), and the expectation is per-game now, so a
    // page with no manifest entry has no expectation to check rather than a wrong one.
    const game = games.find((g) => g.id === d.name);
    if (!game) {
      problems.push({ page: d.name, kind: 'unknown-page', text: `dist/game/${d.name}/: built page has no matching game in the manifest` });
      continue;
    }
    const want = expectedSiblings(game);
    const html = fs.readFileSync(path.join(root, d.name, 'index.html'), 'utf8');
    const nav = html.match(NAV_BLOCK);
    if (!nav) {
      problems.push({ page: d.name, kind: 'missing-nav', text: `dist/game/${d.name}/: no <nav class="game-next"> block` });
      continue;
    }
    const hrefs = new Set([...nav[0].matchAll(/href="(\/game\/[^"/]+\/)"/g)].map((m) => m[1]));
    const self = `/game/${d.name}/`;
    if (hrefs.has(self)) {
      problems.push({ page: d.name, kind: 'self-link', text: `dist/game/${d.name}/: GameNav links to its own game (${self})` });
    }
    hrefs.delete(self);
    if (hrefs.size !== want) {
      problems.push({ page: d.name, kind: 'count', text: `dist/game/${d.name}/: found ${hrefs.size} sibling /game/*/ links in GameNav, expected ${want} (category=${game.category}, carriesGroup=${categories[game.category].carriesGroup})` });
    }
  }
  // pageCount is what was actually read, not the manifest length — the success line quotes it, so a
  // narrowed run is visible in the log rather than inferred from the absence of a failure.
  return { problems, pageCount: dirs.length };
}

// gh#115 — same shape as scan() above (page-count guard, then per-page nav-block + sibling-count
// checks), applied to the four /tool/*/ pages instead of the six /game/*/ ones. `toolRoot` is a
// parameter for the same reason `root` is on scan(): so a calibration can point it at an empty dir.
function scanTools(toolRoot = path.join(repoRoot, 'dist', 'tool')) {
  const dirCount = fs.existsSync(toolRoot)
    ? fs.readdirSync(toolRoot, { withFileTypes: true }).filter((d) => d.isDirectory()).length
    : 0;
  const problems = [];
  if (dirCount !== toolPages.length) {
    problems.push({
      page: '(all tools)',
      kind: 'tool-page-count',
      text: `dist/tool/: ${dirCount} tool page(s) built, manifest declares ${toolPages.length} (src/tools/manifest.ts) — the scanned set must match the manifest, or a per-page scan reports clean over pages that were never built`,
    });
  }
  let scanned = 0;
  for (const t of toolPages) {
    const htmlPath = path.join(toolRoot, t.slug, 'index.html');
    if (!fs.existsSync(htmlPath)) {
      problems.push({ page: `tool/${t.slug}`, kind: 'missing-page', text: `dist/tool/${t.slug}/: no index.html built` });
      continue;
    }
    scanned += 1;
    const html = fs.readFileSync(htmlPath, 'utf8');
    const navBlock = new RegExp(`<nav class="${t.navClass}"[\\s\\S]*?</nav>`);
    const nav = html.match(navBlock);
    if (!nav) {
      problems.push({ page: `tool/${t.slug}`, kind: 'missing-nav', text: `dist/tool/${t.slug}/: no <nav class="${t.navClass}"> block` });
      continue;
    }
    const hrefs = new Set([...nav[0].matchAll(/href="(\/game\/[^"/]+\/)"/g)].map((m) => m[1]));
    if (hrefs.size !== t.expected) {
      problems.push({
        page: `tool/${t.slug}`,
        kind: 'count',
        text: `dist/tool/${t.slug}/: found ${hrefs.size} sibling /game/*/ links in GameNav, expected ${t.expected} (category=${t.category})`,
      });
    }
  }
  // scanned, not toolPages.length: the same ADR-0019 rule scan()'s pageCount follows above.
  return { problems, pageCount: scanned };
}

// Merges the two scans everywhere both need to run together. `toolRoot` stays default outside the
// selftest's own empty-dir calibration, which only ever re-points the game half.
function scanAll(root = distDir, toolRoot = path.join(repoRoot, 'dist', 'tool')) {
  const g = scan(root);
  const t = scanTools(toolRoot);
  return { problems: [...g.problems, ...t.problems], gamePageCount: g.pageCount, toolPageCount: t.pageCount };
}

// The needle both calibrations splice against. A raw string-splice removing the <li>...</li> markup
// breaks the surrounding {shown.map(...)} JS expression (a build syntax error, not "one fewer link" —
// tried, esbuild rejected it), so both calibrations edit `shown` after it is built instead.
//
// Anchored to the DURABLE symbol — the `shown` binding GameNav's markup maps over — and not to the
// filter expression's text. The previous needle quoted that expression verbatim and went stale the
// moment gh#94 rewrote it; a needle that no longer matches plants no mutant, and a selftest that
// plants no mutant still exits 0 while proving nothing. Both patches now APPEND a statement after
// whatever `shown = …;` currently says, so a future rewrite of the filter leaves them working.
const SHOWN_RE = /^const shown = .+;$/m;
const after = (stmt) => (src) => src.replace(SHOWN_RE, (m) => `${m}\n${stmt}`);

// One calibration per property, because each property is blind to the other's break — that asymmetry
// IS the finding. Dropping a sibling leaves the exclude-self filter intact, so only `count` fires;
// putting the page's own game back ships a self-link while the sibling count is unchanged (the scan
// deletes the self-link before counting), so only `self-link` fires — and the old count-only check
// stayed green straight through it.
const CALIBRATIONS = [
  {
    name: 'one sibling missing',
    // Same real-world effect as deleting a rendered <li>, without touching the expression's syntax.
    patch: after('shown.pop(); // #39 crawl-check calibration only'),
    mustFire: 'count',
    mustNotFire: 'self-link',
  },
  {
    name: 'exclude-self dropped (self-link ships)',
    // Re-adds exactly the one entry excludeId removes, and nothing else — so the sibling count stays
    // right and ONLY the self-link property can catch this. On a page with no excludeId (the tool
    // pages) this matches nothing and changes nothing.
    patch: after('shown.push(...games.filter((g) => g.id === excludeId)); // #39 crawl-check calibration only'),
    mustFire: 'self-link',
    mustNotFire: 'count',
  },
];

function selftest() {
  const navPath = path.join(repoRoot, 'src', 'components', 'GameNav.astro');
  const before = fs.readFileSync(navPath, 'utf8');
  const render = (problems) => problems.map((p) => p.text).join('\n');
  // baseline: current tree must be green before we can trust a red result from breaking it
  execFileSync('npm', ['run', 'build'], { cwd: repoRoot, stdio: 'inherit' });
  const baseline = scanAll();
  if (baseline.problems.length > 0) throw new Error(`selftest needs a green baseline first:\n${render(baseline.problems)}`);
  console.log(`PASS baseline is green over ${baseline.gamePageCount} game page(s) and ${baseline.toolPageCount} tool page(s)`);

  // page-count calibration, no rebuild: an empty dist/game/ used to satisfy every per-page rule
  // vacuously and print the full-coverage green — measured by moving the six page dirs aside, exit 0.
  // Proven here against an empty temp dir, so dist/ is never touched by this case.
  const emptyTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-check-empty-'));
  try {
    const emptied = scanAll(emptyTmp);
    if (emptied.gamePageCount !== 0) throw new Error('page-count calibration setup failed: the re-pointed scan still saw pages');
    const fired = emptied.problems.filter((p) => p.kind === 'page-count');
    if (fired.length !== 1) {
      throw new Error(`calibration FAILED (zero pages built): expected a \`page-count\` problem, got:\n${render(emptied.problems)}`);
    }
    console.log(`PASS calibrated red — zero pages built: ${fired[0].text}`);
  } finally {
    fs.rmSync(emptyTmp, { recursive: true, force: true });
  }

  // Counted, not inferred: "planted" is the number of mutants that actually reached a rebuild, and it
  // is printed even on the happy path. A stale needle plants zero and every per-mutant PASS line
  // simply never runs — which reads identically to a clean run unless the tally is on screen.
  let planted = 0;
  let caught = 0;
  try {
    for (const c of CALIBRATIONS) {
      const broken = c.patch(before);
      if (broken === before) throw new Error(`could not splice the \`shown\` assignment for: ${c.name}`);
      planted += 1;
      fs.writeFileSync(navPath, broken);
      execFileSync('npm', ['run', 'build'], { cwd: repoRoot, stdio: 'inherit' });
      const { problems } = scanAll();
      const fired = problems.filter((p) => p.kind === c.mustFire);
      if (fired.length === 0) {
        throw new Error(`calibration FAILED (${c.name}): no \`${c.mustFire}\` problem was reported.\n${render(problems)}`);
      }
      caught += 1;
      const other = problems.filter((p) => p.kind === c.mustNotFire).length;
      console.log(
        `PASS calibrated red — ${c.name}: ${fired.length} page(s) flagged \`${c.mustFire}\`` +
          ` (\`${c.mustNotFire}\` fired on ${other}, and would have let this through alone)`,
      );
    }
  } finally {
    fs.writeFileSync(navPath, before);
    execFileSync('npm', ['run', 'build'], { cwd: repoRoot, stdio: 'inherit' });
    const restored = scanAll();
    console.log(`MUTANTS planted ${planted}/${CALIBRATIONS.length}, caught ${caught}/${planted}`);
    if (restored.problems.length > 0) throw new Error(`restore FAILED:\n${render(restored.problems)}`);
    console.log('PASS restored to green');
  }
}

if (process.argv.includes('--selftest')) {
  selftest();
} else {
  const { problems, gamePageCount, toolPageCount } = scanAll();
  if (problems.length > 0) {
    console.error(problems.map((p) => p.text).join('\n'));
    console.error(`\n${problems.length} GameNav problem(s) across dist/game/*/ and dist/tool/*/.`);
    process.exit(1);
  }
  // Both counts are what was read, not what the manifests claim (ADR-0019: the sentence next to a
  // green is a claim too). Zero pages of either kind can no longer reach this line — the page-count
  // guards in scan()/scanTools() fire above.
  // ponytail: scores the LINKS only, not the nav's Thai heading — the link set already discriminates
  // both gh#94 regressions (narrowed when the category does not carry the group, and not narrowed when it
  // does). If the heading claim ever needs pinning, that is a third property here, not a wider count.
  console.log(
    `OK — all ${gamePageCount} dist/game/*/ page(s) and ${toolPageCount} dist/tool/*/ page(s): ` +
      'GameNav links every game its own category should offer, and never itself.',
  );
}
