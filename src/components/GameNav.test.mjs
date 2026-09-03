// node --test — no framework, no dependency. gh#94 seams, pinned at the source-text level (same
// bargain as index.test.mjs / category.test.mjs: .astro cannot be imported by plain node, so the
// component's own invariants are read off its source). Three invariants:
//
//   1. Whether a category carries the group onward is DATA (CategoryMeta.carriesGroup), not a branch:
//      party carries it, fortune does not. Record<Category, CategoryMeta> makes a fourth category
//      without an entry a tsc error, which is what keeps criterion 5 true.
//   2. GameNav contains no category slug literal — it filters by a prop. That is acceptance
//      criterion 5: adding a fourth category needs no nav edit.
//   3. GameLayout decides from the flag, never from a slug it retypes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { categories } from '../games/categories.ts';
import { games } from '../games/manifest.ts';

const here = dirname(fileURLToPath(import.meta.url));
const read = (...p) => readFileSync(join(here, ...p), 'utf8');
const navSrc = read('GameNav.astro');
const layoutSrc = read('..', 'layouts', 'GameLayout.astro');
const slugs = Object.keys(categories);

// Comments are exempt from the literal scan: they cite the slugs as provenance ("party: true"),
// which is documentation, not a branch. Only executable frontmatter/markup is scanned.
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('gh#94: every หมวด declares whether it carries the group onward', () => {
  for (const [slug, meta] of Object.entries(categories)) {
    assert.equal(typeof meta.carriesGroup, 'boolean', `${slug} must declare carriesGroup`);
  }
  assert.equal(categories.party.carriesGroup, true);
  assert.equal(categories.fortune.carriesGroup, false);
});

test('gh#94: GameNav names no category — a fourth หมวด needs no nav edit', () => {
  const body = stripComments(navSrc);
  // positive control: a strip that eats real code (not just comments) would make every absence
  // check below vacuously green — gh#130. shown = games.filter(...) is the executable line the
  // whole test exists to scan, so it must survive the strip.
  assert.match(body, /g\.category === category/, 'positive control: stripComments blanked the manifest filter');
  for (const slug of slugs) {
    assert.ok(!body.includes(`'${slug}'`) && !body.includes(`"${slug}"`), `GameNav retypes ${slug}`);
  }
  // gh#125 tried to drop the filter pin below as source spelling, and the REFUTE pass caught the
  // replacement claim being false: the data test at the bottom filters the manifest in TEST code and
  // never touches this component, so with the pin gone the component could stop filtering entirely
  // and every test here would stay green. The pin stays until a rendered-output test exists.
  assert.match(navSrc, /g\.category === category/, 'GameNav must filter the manifest on g.category');
  for (const g of games) {
    assert.ok(!body.includes(`'${g.id}'`), `GameNav retypes game id ${g.id}`);
  }
});

test('gh#94: GameLayout branches on the flag, not on a slug', () => {
  const body = stripComments(layoutSrc);
  // positive control: `carriesGroup` alone also matches the frontmatter declaration, which sits
  // before the template's first comment and survives a strip regardless of how greedy it gets — the
  // ternary usage below sits deep in the comment-heavy template and is what a too-greedy strip eats.
  assert.match(body, /carriesGroup\s*\?/, 'positive control: stripComments blanked the flag branch');
  for (const slug of slugs) {
    assert.ok(!body.includes(`'${slug}'`) && !body.includes(`"${slug}"`), `GameLayout retypes ${slug}`);
  }
  assert.match(body, /carriesGroup/);
});

// Criterion 1, at the data level: filtering a nav to the group-carrying category leaves only its games,
// and no fortune game. The built-page proof lives in the acceptance run, not here.
test('gh#94: the group-carrying หมวด yields only its own games', () => {
  const carried = games.filter((g) => categories[g.category].carriesGroup);
  assert.ok(carried.length > 0);
  assert.ok(carried.every((g) => g.category === 'party'));
  assert.ok(games.some((g) => !categories[g.category].carriesGroup), 'fixture needs a non-carrying หมวด');
});

// gh#111 box 3 — a fortune page's nav lists BOTH categories, and the owner ruled on 2026-08-27 that
// no union word exists for them ("Copy should refer to each category by name instead of inventing a
// term"). So a wide list may carry no single heading: each group is labelled with its own category's
// manifest name, and the mixed list is never introduced by a word meaning game (ADR-0040). Pinned at
// the source-text level for the same reason the tests above are — .astro is not node-importable.
test('gh#111 box 3: a mixed nav labels each หมวด by its own name', () => {
  const navBody = stripComments(navSrc);
  // positive control: the filter line the whole file scans must survive the strip (gh#130).
  assert.match(navBody, /g\.category === category/, 'positive control: stripComments blanked the manifest filter');
  assert.match(navBody, /\bmeta\.label\b/, 'GameNav must label a wide list per group from CategoryMeta.label');

  const layoutBody = stripComments(layoutSrc);
  const tag = layoutBody.match(/<GameNav\b[\s\S]*?\/>/);
  assert.ok(tag, 'positive control: GameLayout still renders <GameNav ... />');
  const arm = tag[0].match(/heading=\{\s*carriesGroup\s*\?[^:]*:\s*([^}]*)\}/);
  assert.ok(arm, 'GameLayout must still choose the nav heading from carriesGroup');
  assert.ok(
    !arm[1].includes('เกม'),
    `the heading over a non-carrying (mixed) list must not claim เกม, got: ${arm[1].trim()}`,
  );
  // The owner rejected every name proposed for the mixed list (2026-09-03): the wide arm passes no
  // heading at all, so the nav gets no aria-label and the per-group <h3>s are what name the lists.
  // Stricter than "no game word": ANY expression here is a name synthesised for the mixed list, which
  // is what was rejected. `undefined` is the only value that leaves the naming to the group headings.
  assert.equal(arm[1].trim(), 'undefined', `the wide nav must be given no name, got: ${arm[1].trim()}`);
});

// gh#111 box 2, kept alive under box 3's change. Box 2 made `heading` impossible to omit so no caller
// could inherit a false default. Box 3 needs the wide caller to omit it, so the prop stopped being
// type-required — and a prop type never stopped an .astro caller at runtime anyway. The guarantee now
// rests on ONE runtime throw, which is what this test pins: delete the throw and this goes red.
test('gh#111 box 2: a narrowed list cannot render without an explicit heading', () => {
  const body = stripComments(navSrc);
  // positive control: the filter line must survive the strip, or every scan below is vacuous (gh#130).
  assert.match(body, /g\.category === category/, 'positive control: stripComments blanked the manifest filter');
  assert.match(
    body,
    /if \(Boolean\(category\) !== Boolean\(heading\)\)\s*\{[\s\S]{0,400}?throw new Error\(/,
    'GameNav must throw when `heading` and `category` do not travel together — box 2 has no other enforcement left',
  );
});
