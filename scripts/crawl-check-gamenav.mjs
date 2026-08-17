#!/usr/bin/env node
// gh#39 verify item 3 — proves GameNav still renders a crawlable /game/*/ link to every OTHER game on
// every built game page (the whole reason #35's exclude-self GameNav exists). Not wired into CI: the
// owner has not approved a CI change (see .github/workflows/ci.yml — out of scope for #39). Proposed
// step, for the owner to add by hand if they want this in CI:
//
//   - name: crawl-check GameNav
//     run: node scripts/crawl-check-gamenav.mjs
//
//   node scripts/crawl-check-gamenav.mjs             -> scan dist/, exit non-zero on mismatch
//   node scripts/crawl-check-gamenav.mjs --selftest  -> calibrates red TWICE, once per property:
//                                                        drop a sibling (count goes red), then drop
//                                                        GameNav's excludeId filter so a self-link
//                                                        ships (self-link goes red, count does not).
//                                                        Rebuilds and restores after each.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const distDir = path.join(repoRoot, 'dist', 'game');
const manifestPath = path.join(repoRoot, 'src', 'games', 'manifest.ts');

function manifestGameCount() {
  const src = fs.readFileSync(manifestPath, 'utf8');
  const m = src.match(/^export const games: GameModule\[\] = \[(.+)\];$/m);
  if (!m) throw new Error('could not find `games` array in manifest.ts');
  return m[1].split(',').filter((s) => s.trim()).length;
}

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

function scan() {
  const want = manifestGameCount() - 1; // GameNav excludes the current page's own game
  const dirs = fs.readdirSync(distDir, { withFileTypes: true }).filter((d) => d.isDirectory());
  const problems = [];
  for (const d of dirs) {
    const html = fs.readFileSync(path.join(distDir, d.name, 'index.html'), 'utf8');
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
      problems.push({ page: d.name, kind: 'count', text: `dist/game/${d.name}/: found ${hrefs.size} sibling /game/*/ links in GameNav, expected ${want}` });
    }
  }
  return problems;
}

// The needle both calibrations splice against. A raw string-splice removing the <li>...</li> markup
// breaks the surrounding {shown.map(...)} JS expression (a build syntax error, not "one fewer link" —
// tried, esbuild rejected it), so both calibrations edit how `shown` is built instead.
const SHOWN = 'const shown = excludeId ? games.filter((g) => g.id !== excludeId) : games;';

// One calibration per property, because each property is blind to the other's break — that asymmetry
// IS the finding. Dropping a sibling leaves the exclude-self filter intact, so only `count` fires;
// dropping the filter ships a self-link while the sibling count stays at 5, so only `self-link` fires
// and the old count-only check stayed green through it.
const CALIBRATIONS = [
  {
    name: 'one sibling missing',
    // Same real-world effect as deleting a rendered <li>, without touching the expression's syntax.
    patch: (src) => src.replace(SHOWN, `${SHOWN}\nshown.pop(); // #39 crawl-check calibration only`),
    mustFire: 'count',
    mustNotFire: 'self-link',
  },
  {
    name: 'excludeId filter dropped (self-link ships)',
    patch: (src) => src.replace(SHOWN, 'const shown = games; // #39 crawl-check calibration only'),
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
  const baseline = scan();
  if (baseline.length > 0) throw new Error(`selftest needs a green baseline first:\n${render(baseline)}`);
  console.log('PASS baseline is green');

  try {
    for (const c of CALIBRATIONS) {
      const broken = c.patch(before);
      if (broken === before) throw new Error(`could not splice the \`shown\` assignment for: ${c.name}`);
      fs.writeFileSync(navPath, broken);
      execFileSync('npm', ['run', 'build'], { cwd: repoRoot, stdio: 'inherit' });
      const problems = scan();
      const fired = problems.filter((p) => p.kind === c.mustFire);
      if (fired.length === 0) {
        throw new Error(`calibration FAILED (${c.name}): no \`${c.mustFire}\` problem was reported.\n${render(problems)}`);
      }
      const other = problems.filter((p) => p.kind === c.mustNotFire).length;
      console.log(
        `PASS calibrated red — ${c.name}: ${fired.length} page(s) flagged \`${c.mustFire}\`` +
          ` (\`${c.mustNotFire}\` fired on ${other}, and would have let this through alone)`,
      );
    }
  } finally {
    fs.writeFileSync(navPath, before);
    execFileSync('npm', ['run', 'build'], { cwd: repoRoot, stdio: 'inherit' });
    const restored = scan();
    if (restored.length > 0) throw new Error(`restore FAILED:\n${render(restored)}`);
    console.log('PASS restored to green');
  }
}

if (process.argv.includes('--selftest')) {
  selftest();
} else {
  const problems = scan();
  if (problems.length > 0) {
    console.error(problems.map((p) => p.text).join('\n'));
    console.error(`\n${problems.length} GameNav problem(s) across dist/game/*/.`);
    process.exit(1);
  }
  console.log('OK — every dist/game/*/ GameNav links every sibling game and never itself.');
}
