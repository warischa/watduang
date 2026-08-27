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
