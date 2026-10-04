#!/usr/bin/env node
// gh#127 — three page-level claims on the landing pages that no gate covered before this one:
// the category route's own filter can widen past the manifest, two category pages can ship identical
// copy, and the home page's category links can be a marker with no resolvable target. All three are
// read straight off dist/ (read-only, never rebuilt here) — the artifact the site actually ships.
// Two more claims joined later, both scanned the same way: a declared playRoute must be built
// (scanPlayRoutes), and every category card carries exactly the art its module declares (scanCardArt,
// gh#241).
//
//   node scripts/landing-claims-check.mjs                 -> scan dist/, exit non-zero on violation
//   node scripts/landing-claims-check.mjs --dist DIR       -> scan DIR instead (calibration hook)
//   node scripts/landing-claims-check.mjs --selftest       -> in-memory fixtures, no build, dist/ untouched
//
// Owned sets, read the same way scripts/validate-games.mjs and scripts/crawl-check-gamenav.mjs
// already read them: plain node dynamic-imports these .ts files directly (Node >=22.18 strips
// types), so "which games are in which category" can never drift from what [category].astro's own
// getStaticPaths() reads. categorySlugs is Object.keys(categories) — the same union src/pages/c/
// builds a static path for, so this gate walks exactly the pages that route builds, not a hand list.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const { games } = await import(path.join(repoRoot, 'src/games/manifest.ts'));
const { categories } = await import(path.join(repoRoot, 'src/games/categories.ts'));
const categorySlugs = Object.keys(categories);

const normalizeText = (s) => s.replace(/\s+/g, ' ').trim();

// ---- 1. category route filter widened -----------------------------------------------------------
// Owned expectation: exactly the game ids the manifest assigns to this category
// (games.filter((g) => g.category === slug)) — the same field [category].astro's own
// getStaticPaths() filters on. A widened route filter ships an id this set does not contain; a
// narrowed one drops an id this set does contain. Scoped to the game-listing <section>'s
// cards-grid so cross-links to sibling categories (which legitimately name other games' hub) are
// never read as this page's own games.
function scanCategoryFilter(distDir) {
  const problems = [];
  for (const slug of categorySlugs) {
    const htmlPath = path.join(distDir, 'c', slug, 'index.html');
    if (!fs.existsSync(htmlPath)) {
      problems.push({ page: slug, kind: 'missing-page', text: `dist/c/${slug}/: no index.html built (filter check)` });
      continue;
    }
    const html = fs.readFileSync(htmlPath, 'utf8');
    const grid = html.match(/<div class="cards-grid"[^>]*>([\s\S]*?)<\/div>\s*<\/section>/);
    if (!grid) {
      problems.push({ page: slug, kind: 'missing-grid', text: `dist/c/${slug}/: no <div class="cards-grid"> game listing found` });
      continue;
    }
    // A card may point at the landing (/game/<id>/) or, since the card-to-play flip (owner ruling
    // 2026-08-29, ADR-0050 ruling 2), straight at the play route (/game/<id>/play/). Either one
    // counts as the category listing the game; the capture stays the game id in both shapes.
    const shipped = new Set(
      [...grid[1].matchAll(/class="game-card" href="\/game\/([^"/]+)\/(?:play\/)?"/g)].map((m) => m[1]),
    );
    const expected = new Set(games.filter((g) => g.category === slug).map((g) => g.id));
    const extra = [...shipped].filter((id) => !expected.has(id));
    const missing = [...expected].filter((id) => !shipped.has(id));
    if (extra.length > 0) {
      problems.push({
        page: slug,
        kind: 'filter-widened',
        text: `dist/c/${slug}/: lists game(s) [${extra.join(', ')}] the manifest assigns to a different category — the route filter widened`,
      });
    }
    if (missing.length > 0) {
      problems.push({
        page: slug,
        kind: 'filter-narrowed',
        text: `dist/c/${slug}/: missing manifest game(s) [${missing.join(', ')}] that src/games/manifest.ts assigns to this category`,
      });
    }
  }
  return problems;
}

// ---- 2. two category pages ship the same copy --------------------------------------------------------
// Owned set: categorySlugs itself. Compared field is exactly the category-specific copy — the H1
// label, the lead line, and the intro card — never the pills/breadcrumb/CTA text, which is the same
// PAGE COPY on every category page by design (see [category].astro's own provenance comment) and
// would make every pair "identical" for a reason this gate is not about.
function scanCopy(distDir) {
  const problems = [];
  const sigs = new Map();
  for (const slug of categorySlugs) {
    const htmlPath = path.join(distDir, 'c', slug, 'index.html');
    if (!fs.existsSync(htmlPath)) {
      problems.push({ page: slug, kind: 'missing-page', text: `dist/c/${slug}/: no index.html built (copy check)` });
      continue;
    }
    const html = fs.readFileSync(htmlPath, 'utf8');
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    const lead = html.match(/<p class="lead"[^>]*>([\s\S]*?)<\/p>/);
    const intro = html.match(/<p class="intro-card"[^>]*>([\s\S]*?)<\/p>/);
    if (!h1 || !lead || !intro) {
      problems.push({ page: slug, kind: 'missing-copy-region', text: `dist/c/${slug}/: missing <h1> / .lead / .intro-card — cannot compare copy` });
      continue;
    }
    sigs.set(slug, [h1[1], lead[1], intro[1]].map(normalizeText).join(' | '));
  }
  const entries = [...sigs.entries()];
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const [slugA, sigA] = entries[i];
      const [slugB, sigB] = entries[j];
      if (sigA === sigB) {
        problems.push({
          page: `${slugA}+${slugB}`,
          kind: 'duplicate-copy',
          text: `dist/c/${slugA}/ and dist/c/${slugB}/: identical h1+lead+intro copy — "${sigA}"`,
        });
      }
    }
  }
  return problems;
}

// ---- 3. home page carries a RESOLVABLE built link to every category page ------------------------
// Owned set: categorySlugs. Two-part, on purpose: a <a href="/c/<slug>/"> literally present in the
// built dist/index.html (not a source-level marker attribute), AND the target it points at actually
// exists in dist/ — a link to a page that was never built is exactly a marker with no link behind
// it, which is the failure gh#127 names.
function scanHomeLinks(distDir) {
  const homePath = path.join(distDir, 'index.html');
  if (!fs.existsSync(homePath)) {
    return [{ page: '(home)', kind: 'missing-home', text: 'dist/index.html: not built' }];
  }
  const html = fs.readFileSync(homePath, 'utf8');
  const problems = [];
  for (const slug of categorySlugs) {
    const linked = new RegExp(`<a\\b[^>]*href="/c/${slug}/"`).test(html);
    if (!linked) {
      problems.push({ page: slug, kind: 'unlinked', text: `dist/index.html: no built <a href="/c/${slug}/"> to the ${slug} category page` });
      continue;
    }
    if (!fs.existsSync(path.join(distDir, 'c', slug, 'index.html'))) {
      problems.push({
        page: slug,
        kind: 'unresolvable',
        text: `dist/index.html links to /c/${slug}/ but dist/c/${slug}/index.html was never built — the link resolves nowhere`,
      });
    }
  }
  return problems;
}

// ---- 4. a declared play route must exist in the artifact ----------------------------------------
// Owned expectation: every manifest game carrying `playRoute` has dist/game/<id>/play/index.html.
// The card-to-play flip (ADR-0050 ruling 2) makes home + category cards link this route directly,
// and nothing else proved the page was built: deleting src/pages/game/<id>/play.astro while the
// module keeps its route shipped 404 cards on an otherwise green build (REFUTE finding 2026-08-29).
// The shape check guards the same failure on the home page, which has no href scan of its own.
function scanPlayRoutes(distDir) {
  const problems = [];
  for (const g of games) {
    if (!g.playRoute) continue;
    if (g.playRoute !== `/game/${g.id}/play/`) {
      problems.push({
        page: g.id,
        kind: 'play-route-shape',
        text: `${g.id}: playRoute "${g.playRoute}" is not /game/${g.id}/play/ — cards would ship a link this gate cannot follow`,
      });
      continue;
    }
    if (!fs.existsSync(path.join(distDir, 'game', g.id, 'play', 'index.html'))) {
      problems.push({
        page: g.id,
        kind: 'play-route-missing',
        text: `dist/game/${g.id}/play/index.html missing while the module declares playRoute — home and category cards 404`,
      });
    }
  }
  return problems;
}

// ---- 5. card art matches the manifest's cardArt field, in both directions (gh#241) --------------
// Owned expectation: the manifest's own cardArt field, per game. On every category page, a card whose
// game declares cardArt carries exactly ONE <img class="game-card-art">, as the card's first child
// (above the h3, the artboard's slot), with src "/art/<cardArt>" and loading="lazy" (owner ruling
// 2026-10-01 in gh#241's body), and dist/art/<cardArt> exists; a card whose game declares none
// carries no such img. The expected src is DERIVED from the field, never spelled here:
// scripts/public-orphan-check.mjs treats a basename spelled anywhere under src/ as a referrer, and the
// field must stay the only one. `gameList` is a parameter so the selftest can calibrate this scan
// whether or not the real manifest declares any art today.
const attrOf = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? m[1] : null;
};

function scanCardArt(distDir, gameList = games, stats = { withArt: 0, withoutArt: 0 }) {
  const problems = [];
  const byId = new Map(gameList.map((g) => [g.id, g]));
  for (const slug of categorySlugs) {
    const htmlPath = path.join(distDir, 'c', slug, 'index.html');
    if (!fs.existsSync(htmlPath)) {
      problems.push({ page: slug, kind: 'missing-page', text: `dist/c/${slug}/: no index.html built (card art check)` });
      continue;
    }
    const html = fs.readFileSync(htmlPath, 'utf8');
    const grid = html.match(/<div class="cards-grid"[^>]*>([\s\S]*?)<\/div>\s*<\/section>/);
    if (!grid) {
      problems.push({ page: slug, kind: 'missing-grid', text: `dist/c/${slug}/: no <div class="cards-grid"> game listing found (card art check)` });
      continue;
    }
    // A card holds no nested <a> (its children are the art, h3, p and the CTA span), so the first
    // closing tag after a card's opening tag ends that card.
    for (const card of grid[1].matchAll(/<a\b([^>]*\bclass="game-card"[^>]*)>([\s\S]*?)<\/a>/g)) {
      const id = (attrOf(` ${card[1]}`, 'href') || '').match(/^\/game\/([^"/]+)\/(?:play\/)?$/)?.[1];
      const game = id ? byId.get(id) : undefined;
      if (!game) continue; // a card for no manifest game is scanCategoryFilter's finding, not this one's
      const arts = [...card[2].matchAll(/<img\b[^>]*>/g)]
        .map((m) => m[0])
        .filter((tag) => (attrOf(tag, 'class') || '').split(/\s+/).includes('game-card-art'));
      const where = `dist/c/${slug}/ card ${id}`;
      if (!game.cardArt) {
        stats.withoutArt += 1;
        if (arts.length > 0) {
          problems.push({ page: slug, kind: 'card-art-unexpected', text: `${where}: carries ${arts.length} img.game-card-art but the module declares no cardArt` });
        }
        continue;
      }
      if (arts.length !== 1) {
        problems.push({
          page: slug,
          kind: arts.length === 0 ? 'card-art-missing' : 'card-art-duplicated',
          text: `${where}: the module declares cardArt "${game.cardArt}" and the card carries ${arts.length} img.game-card-art (exactly 1 required)`,
        });
        continue;
      }
      stats.withArt += 1;
      const tag = arts[0];
      const wantSrc = `/art/${game.cardArt}`;
      if (attrOf(tag, 'src') !== wantSrc) {
        problems.push({ page: slug, kind: 'card-art-src', text: `${where}: img.game-card-art src is ${JSON.stringify(attrOf(tag, 'src'))}, the module declares ${wantSrc}` });
      }
      if (attrOf(tag, 'loading') !== 'lazy') {
        problems.push({ page: slug, kind: 'card-art-eager', text: `${where}: img.game-card-art loading is ${JSON.stringify(attrOf(tag, 'loading'))}, must be "lazy" (gh#241 owner ruling)` });
      }
      if (!card[2].trimStart().startsWith(tag)) {
        problems.push({ page: slug, kind: 'card-art-position', text: `${where}: img.game-card-art is not the card's first child, above the h3 (the artboard's slot)` });
      }
      if (!fs.existsSync(path.join(distDir, 'art', game.cardArt))) {
        problems.push({ page: slug, kind: 'card-art-file-missing', text: `${where}: dist/art/${game.cardArt} does not exist — the card ships a broken image` });
      }
    }
  }
  return problems;
}

function scanAll(distDir, stats) {
  return [
    ...scanCategoryFilter(distDir),
    ...scanCopy(distDir),
    ...scanHomeLinks(distDir),
    ...scanPlayRoutes(distDir),
    ...scanCardArt(distDir, games, stats),
  ];
}

// ---------------------------------------------------------------------------------------------
// Selftest: synthetic dist/ trees only, built under os.tmpdir() and torn down after — never a real
// build (this script is read-only against dist/, gh#127's own brief), and never a write into the
// real dist/. Category copy/games come off the real, owned manifest/categories data imported above,
// so "known-good" is checked against the shape those files actually declare today.
// The art tag a correct build renders for a game that declares cardArt (the scan reads attributes in
// any order), and what a correct card holds: that tag first when the game declares art, then the h3.
const artOf = (gameList, id) => gameList.find((g) => g.id === id)?.cardArt;
const artTag = (file, { loading = 'lazy', src = `/art/${file}` } = {}) =>
  `<img class="game-card-art" src="${src}" alt="" loading="${loading}" decoding="async" data-x>`;
const goodCardInner = (gameList) => (id) => (artOf(gameList, id) ? artTag(artOf(gameList, id)) : '') + '<h3 data-x>t</h3>';

function categoryPageHtml({ gameIds, h1, lead, intro }, cardInner) {
  const cards = gameIds.map((id) => `<a class="game-card" href="/game/${id}/" data-x>${cardInner(id)}</a>`).join('');
  return (
    `<html><body><main><header class="cat-head"><div class="cat-head-inner"><div class="cat-head-copy">` +
    `<h1 data-x>${h1}</h1><p class="lead" data-x>${lead}</p></div>` +
    `<p class="intro-card" data-x>${intro}</p></div></header>` +
    `<div class="body-grid"><div class="col"><section><h2 class="kicker">games</h2>` +
    `<div class="cards-grid">${cards}</div></section>` +
    `<section><h2 class="kicker">cross</h2><div class="cross-grid"></div></section>` +
    `</div></div></main></body></html>`
  );
}

function homePageHtml(slugs) {
  const links = slugs.map((s) => `<a href="/c/${s}/" class="chrome-pill">x</a>`).join('');
  return `<html><body>${links}</body></html>`;
}

function buildFixtureDist(root, categoryData, homeSlugs = categorySlugs, { gameList = games, cardInner = goodCardInner(gameList) } = {}) {
  for (const [slug, data] of Object.entries(categoryData)) {
    const dir = path.join(root, 'c', slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), categoryPageHtml(data, cardInner));
  }
  // Every declared card art gets a stub file, so the known-good fixture stays green under
  // scanCardArt — the calibrated file-missing red deletes one of these.
  for (const g of gameList) {
    if (!g.cardArt) continue;
    fs.mkdirSync(path.join(root, 'art'), { recursive: true });
    fs.writeFileSync(path.join(root, 'art', g.cardArt), '');
  }
  fs.writeFileSync(path.join(root, 'index.html'), homePageHtml(homeSlugs));
  // Every declared play route gets a stub page, so the known-good fixture stays green under
  // scanPlayRoutes with the REAL manifest — the calibrated red deletes one of these.
  for (const g of games) {
    if (!g.playRoute) continue;
    const dir = path.join(root, 'game', g.id, 'play');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), '<html></html>');
  }
}

function selftest() {
  if (categorySlugs.length < 2) {
    throw new Error('selftest needs >=2 categories in src/games/categories.ts to exercise the cross-page checks');
  }
  const [slugA, slugB] = categorySlugs;
  const gamesA = games.filter((g) => g.category === slugA).map((g) => g.id);
  const gamesB = games.filter((g) => g.category === slugB).map((g) => g.id);
  if (gamesA.length === 0 || gamesB.length === 0) {
    throw new Error('selftest needs at least one manifest game in each of the first two categories');
  }
  const copyOf = (slug, gameIds) => ({ gameIds, h1: categories[slug].label, lead: categories[slug].whenToUse, intro: categories[slug].intro });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'landing-claims-'));
  const reset = () => {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
  };
  try {
    // known-good: guards against a selftest that always fails.
    buildFixtureDist(tmp, { [slugA]: copyOf(slugA, gamesA), [slugB]: copyOf(slugB, gamesB) });
    const good = scanAll(tmp);
    assert.deepEqual(good, [], `known-good fixture must report zero problems, got:\n${good.map((p) => p.text).join('\n')}`);
    console.log('PASS known-good: two distinct category pages, own manifest games, all home links resolve');
    reset();

    // calibration 1: the route filter widens — slugA's page also lists one of slugB's games.
    buildFixtureDist(tmp, { [slugA]: copyOf(slugA, [...gamesA, gamesB[0]]), [slugB]: copyOf(slugB, gamesB) });
    const widened = scanAll(tmp).filter((p) => p.kind === 'filter-widened');
    assert.equal(widened.length, 1, `expected exactly one filter-widened problem, got ${widened.length}`);
    console.log(`PASS calibrated red — category filter widened: ${widened[0].text}`);
    reset();

    // calibration 2: two category pages ship the same copy.
    buildFixtureDist(tmp, {
      [slugA]: { gameIds: gamesA, h1: 'เหมือนกัน', lead: 'เหมือนกัน', intro: 'เหมือนกัน' },
      [slugB]: { gameIds: gamesB, h1: 'เหมือนกัน', lead: 'เหมือนกัน', intro: 'เหมือนกัน' },
    });
    const duped = scanAll(tmp).filter((p) => p.kind === 'duplicate-copy');
    assert.equal(duped.length, 1, `expected exactly one duplicate-copy problem, got ${duped.length}`);
    console.log(`PASS calibrated red — duplicate copy: ${duped[0].text}`);
    reset();

    // calibration 3: home page carries no link at all to slugB (a marker never even shipped).
    buildFixtureDist(tmp, { [slugA]: copyOf(slugA, gamesA), [slugB]: copyOf(slugB, gamesB) }, [slugA]);
    const unlinked = scanAll(tmp).filter((p) => p.kind === 'unlinked');
    assert.equal(unlinked.length, 1, `expected exactly one unlinked problem, got ${unlinked.length}`);
    console.log(`PASS calibrated red — home page missing a category link: ${unlinked[0].text}`);
    reset();

    // calibration 4: home links to slugB, but slugB's page was never built — a link with no
    // resolvable target, the exact "marker with no link behind it" failure gh#127 names.
    buildFixtureDist(tmp, { [slugA]: copyOf(slugA, gamesA) }, categorySlugs);
    const unresolvable = scanAll(tmp).filter((p) => p.kind === 'unresolvable');
    assert.equal(unresolvable.length, 1, `expected exactly one unresolvable problem, got ${unresolvable.length}`);
    console.log(`PASS calibrated red — home links to an unbuilt category page: ${unresolvable[0].text}`);
    reset();

    // calibration 5: a module declares playRoute but the play page was never built — the exact
    // green-build-404-cards hole the REFUTE named; skipped only while no manifest game has one.
    const withRoute = games.find((g) => g.playRoute);
    if (withRoute) {
      buildFixtureDist(tmp, { [slugA]: copyOf(slugA, gamesA), [slugB]: copyOf(slugB, gamesB) });
      fs.rmSync(path.join(tmp, 'game', withRoute.id, 'play', 'index.html'));
      const missing = scanAll(tmp).filter((p) => p.kind === 'play-route-missing');
      assert.equal(missing.length, 1, `expected exactly one play-route-missing problem, got ${missing.length}`);
      console.log(`PASS calibrated red — declared playRoute with no built page: ${missing[0].text}`);
      reset();
    }

    // calibrations 6-12: card art (gh#241). Run on a game list that declares art on exactly one
    // game — the first real declaring game if the manifest has one, else a stand-in — and strips it
    // from every other game, so this scan is calibrated whatever the manifest holds today (gh#242
    // gave every party game art, which left no bare card to calibrate against). Each red must be the
    // ONLY problem the scan reports, so none can pass by reddening for a different reason.
    const artPick = games.find((g) => g.cardArt) ?? games.find((g) => g.category === slugA);
    const artList = games.map((g) =>
      g.id === artPick.id ? { ...g, cardArt: g.cardArt ?? 'selftest-card-art.webp' } : { ...g, cardArt: undefined },
    );
    const artFile = artList.find((g) => g.id === artPick.id).cardArt;
    const bare = artList.find((g) => !g.cardArt && (g.category === slugA || g.category === slugB));
    if (artList.filter((g) => g.cardArt).length !== 1 || !bare) {
      throw new Error('selftest needs a game list with exactly one cardArt game and one game without, across the first two categories');
    }
    const both = { [slugA]: copyOf(slugA, gamesA), [slugB]: copyOf(slugB, gamesB) };
    const goodArt = goodCardInner(artList);
    const artStats = { withArt: 0, withoutArt: 0 };
    buildFixtureDist(tmp, both, categorySlugs, { gameList: artList });
    const artGood = scanCardArt(tmp, artList, artStats);
    assert.deepEqual(artGood, [], `known-good card art must report zero problems, got:\n${artGood.map((p) => p.text).join('\n')}`);
    assert.equal(artStats.withArt, 1, `known-good card art: the scan must COUNT the one art card it saw, got ${artStats.withArt}`);
    assert.equal(artStats.withoutArt, gamesA.length + gamesB.length - 1, 'known-good card art: every other card must be counted as carrying none');
    console.log(`PASS known-good card art: ${artPick.id} carries its one declared img, ${artStats.withoutArt} other card(s) carry none`);
    reset();

    const artReds = [
      ['card-art-missing', (id) => (id === artPick.id ? '<h3 data-x>t</h3>' : goodArt(id))],
      ['card-art-duplicated', (id) => (id === artPick.id ? artTag(artFile) + goodArt(id) : goodArt(id))],
      ['card-art-unexpected', (id) => (id === bare.id ? artTag('selftest-stray.webp') + goodArt(id) : goodArt(id))],
      ['card-art-src', (id) => (id === artPick.id ? artTag(artFile, { src: '/art/selftest-wrong.webp' }) + '<h3 data-x>t</h3>' : goodArt(id))],
      ['card-art-eager', (id) => (id === artPick.id ? artTag(artFile, { loading: 'eager' }) + '<h3 data-x>t</h3>' : goodArt(id))],
      ['card-art-position', (id) => (id === artPick.id ? '<h3 data-x>t</h3>' + artTag(artFile) : goodArt(id))],
    ];
    for (const [kind, cardInner] of artReds) {
      buildFixtureDist(tmp, both, categorySlugs, { gameList: artList, cardInner });
      const found = scanCardArt(tmp, artList);
      assert.equal(found.length, 1, `${kind}: expected exactly one problem, got ${found.length}:\n${found.map((p) => p.text).join('\n')}`);
      assert.equal(found[0].kind, kind, `${kind}: the one problem must be ${kind}, got ${found[0].kind}`);
      console.log(`PASS calibrated red — ${kind}: ${found[0].text}`);
      reset();
    }

    buildFixtureDist(tmp, both, categorySlugs, { gameList: artList });
    fs.rmSync(path.join(tmp, 'art', artFile));
    const fileGone = scanCardArt(tmp, artList);
    assert.equal(fileGone.length, 1, `card-art-file-missing: expected exactly one problem, got ${fileGone.length}`);
    assert.equal(fileGone[0].kind, 'card-art-file-missing', `card-art-file-missing: got ${fileGone[0].kind}`);
    console.log(`PASS calibrated red — card-art-file-missing: ${fileGone[0].text}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const args = process.argv.slice(2);
if (args.includes('--selftest')) {
  selftest();
} else {
  const distFlagIdx = args.indexOf('--dist');
  const distDir = distFlagIdx !== -1 ? path.resolve(args[distFlagIdx + 1]) : path.join(repoRoot, 'dist');
  if (!fs.existsSync(distDir)) {
    console.error(`::error::scripts/landing-claims-check.mjs: ${distDir} not found — build before running this gate`);
    process.exit(1);
  }
  const stats = { withArt: 0, withoutArt: 0 };
  const problems = scanAll(distDir, stats);
  if (problems.length > 0) {
    console.error(problems.map((p) => p.text).join('\n'));
    console.error(`\n${problems.length} landing-claims problem(s) across dist/c/*/ and dist/index.html.`);
    process.exit(1);
  }
  console.log(
    `OK — all ${categorySlugs.length} dist/c/*/ page(s): route filter scoped to the manifest, copy distinct page-to-page, ` +
      'and dist/index.html carries a resolvable link to every one of them. Card art: ' +
      `${stats.withArt} card(s) carry their declared img.game-card-art, ${stats.withoutArt} card(s) declare none and carry none.`,
  );
}
