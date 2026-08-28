// node --test — no framework, no dependency. gh#88 seams, pinned at the source-text level (no
// build/dist involved, same bargain as index.test.mjs / noindex.test.mjs). The invariants:
//
//   1. The page renders every manifest-held string by interpolation — category label, whenToUse,
//      intro, and each card body from that game's own tagline — and no manifest string is retyped
//      as a literal in the page. A retype is the drift gh#88 acceptance criterion 1 forbids, and
//      typecheck, build and CI are all green on it.
//   2. The accent is resolved from the manifest accent NAME (meta.accent -> "var(--accent-{name})"),
//      never from the category slug and never from a hex: the page file carries no colour value and
//      no conditional on the slug. This is the gh#85 defect shape (var(--accent-fortune) — a
//      property defined nowhere, silent at every layer), pinned so it cannot regrow.
//   3. The pills, the section labels, the card call to action and the breadcrumb ARE page copy:
//      present as literals on the page, and no manifest field is added to hold them.
//   4. Generality: one page file serves every category — getStaticPaths enumerates the manifest
//      keys and the cross-links derive from the same keys, so a third category needs no edit here.
//      Cross-link card paints come from the sibling manifest entry / toolsGroup.accentVar, not from
//      a per-category map in the page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { categories } from '../../games/categories.ts';
import { games as allGames } from '../../games/manifest.ts';

const here = dirname(fileURLToPath(import.meta.url));
const pageSrc = readFileSync(join(here, '[category].astro'), 'utf8');
const categoriesSrc = readFileSync(join(here, '..', '..', 'games', 'categories.ts'), 'utf8');

// Comments and metadata are exempt from the literal scan: the frontmatter cites provenance in
// prose, and the <Base …> tag renders the category seo fields by interpolation.
const pageBody = pageSrc
  .replace(/^---[\s\S]*?^---$/m, '')
  .replace(/<Base[\s\S]*?>/m, '');

// positive control: a strip that ate more than the frontmatter and the <Base …> tag would make the
// retyped-literal scan below vacuously green (gh#130) — {meta.label} sits right after the tag it
// removes, so it is the first thing to disappear if the strip runs too wide.
assert.match(pageBody, /\{meta\.label\}/, 'positive control: the frontmatter/<Base> strip blanked the template');

// Comments are blanked before the colour scan: the style block's provenance cites which token maps
// to which canvas hex (the same way index.astro's does), and a citation is not a value written into
// the page's CSS.
const pageCode = pageSrc
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|\n)\s*\/\/[^\n]*/g, '\n');

// positive control: the colour-hex scan below asserts ABSENCE, so a strip that ate the whole style
// block (first /* to last */, gh#130) would make it vacuously green — var(--page-accent) is a real
// declaration between the file's first and last comment, not comment text itself.
assert.match(pageCode, /var\(--page-accent\)/, 'positive control: the comment strip blanked the style block');

const manifestCopy = [
  ...Object.values(categories).flatMap((meta) => [meta.label, meta.whenToUse, meta.intro]),
  ...allGames.flatMap((game) => [game.names.th, game.tagline]),
];

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A "literal" is a standalone occurrence: not glued to neighbouring Thai letters. Manifest copy can
// appear verbatim inside other manifest copy ("เกมสุ่มคนโดน…" wraps the label "สุ่มคนโดน"), so the
// scan requires a non-Thai boundary on both sides — a real retype sits between tags like ">ชื่อ<".
const THAI = '[\\u0e00-\\u0e7f]';
const standalone = (s) => new RegExp(`(?<!${THAI})${escapeRegExp(s)}(?!${THAI})`);

test('no manifest-held category/game copy is retyped as a literal in the category page', () => {
  const offenders = [...new Set(manifestCopy)].filter((s) => standalone(s).test(pageBody));
  assert.deepEqual(offenders, [], 'labels, whenToUse, intro, game names and taglines must render from the manifests');
});

test('the page renders label, whenToUse, intro and taglines by interpolation', () => {
  assert.match(pageSrc, /from '\.\.\/\.\.\/games\/categories'/, 'must import the categories record');
  assert.match(pageSrc, /\{meta\.label\}/, 'the H1 must render label by interpolation');
  assert.match(pageSrc, /\{meta\.whenToUse\}/, 'the lead line must render whenToUse by interpolation');
  assert.match(pageSrc, /\{meta\.intro\}/, 'the intro card must render intro by interpolation');
  assert.match(pageSrc, /\{game\.names\.th\}/, 'a card title must render names.th by interpolation');
  assert.match(pageSrc, /\{game\.tagline\}/, 'a card body must render the tagline by interpolation');
});

test('the accent resolves from the manifest accent NAME, never the slug, never a hex', () => {
  assert.match(
    pageSrc,
    /--page-accent:\s*var\(--accent-\$\{meta\.accent\}\)/,
    'the page accent must resolve var(--accent-{meta.accent}), the manifest NAME not the slug',
  );
  assert.doesNotMatch(pageCode, /#{1,2}[0-9a-fA-F]{3,8}\b/, 'no colour hex may be written in the page file, outside comments');
  assert.doesNotMatch(pageSrc, /['"]fortune['"]|['"]party['"]/, 'the page must not name a category by string literal, whose presence is what a slug-conditional colour pick needs');
  assert.doesNotMatch(pageSrc, /category\s*(?:===?|!==?)\s*['"]/, 'no conditional branches on the category to pick a colour');
});

test('the pills, section labels, card call to action and breadcrumb are page copy', () => {
  const pageCopy = ['ไม่ต้องโหลดแอป', 'ไม่ต้องสมัคร', 'มือถือเครื่องเดียว', 'เกมในหมวดนี้', 'ไปที่อื่นต่อ', 'เล่นเลย', 'หน้าแรก'];
  for (const piece of pageCopy) {
    assert.ok(pageSrc.includes(piece), `the page copy piece must sit on the page as a literal: ${piece}`);
  }
  // And the inverse: no manifest field is added to hold any of it (gh#88 criterion 3 — a field
  // added here is a field with one reader).
  assert.doesNotMatch(categoriesSrc, /\b(cta|breadcrumb|pill|sectionLabel|kicker)\s*[:?]/, 'CategoryMeta must not grow a field to hold page copy');
  assert.doesNotMatch(pageSrc, /meta\.(cta|breadcrumb|pill|sectionLabel|kicker)|game\.(cta|breadcrumb)/, 'the page must not read any such field');
});

test('cross-link cards paint the sibling manifest accent and the tools group accent', () => {
  assert.match(pageSrc, /from '\.\.\/\.\.\/tools\/manifest'/, 'must import the tools group for the tools cross-link');
  assert.ok(pageSrc.includes('--cross-accent: var(--accent-${link.accent})'), 'each category cross-card must resolve the sibling manifest accent NAME');
  assert.ok(pageSrc.includes('var(${toolsGroup.accentVar})'), 'the tools cross-card must resolve the tools group accent var');
  assert.ok(pageSrc.includes('{link.label}'), 'the cross-card label must render the sibling manifest label');
});

// gh#125: the PageChrome import/render pin is gone. It asserted that the page's SOURCE names the
// component, which is a mechanism; the top bar's presence in the built page is measured for real by
// scripts/page-chrome-check.mjs against dist/ (wired in `npm run ci` after the build), whose opt-in
// list carries c/fortune/index.html and c/party/index.html by name.

test('a new category builds a page with no edit to this file', () => {
  assert.match(pageSrc, /Object\.keys\(categories\)/, 'getStaticPaths must enumerate the manifest keys');
  assert.match(pageSrc, /\.filter\(\(key\) => key !== category\)/, 'the cross-links must derive from the same keys minus self');
  assert.doesNotMatch(pageSrc, /params:\s*\{\s*category:\s*['"]/, 'no route may be hardcoded with a string literal slug');
});