// node --test — no framework, no dependency. gh#87 seams, pinned at the source-text level (no
// build/dist involved, same bargain as noindex.test.mjs). One invariant (gh#125 dropped the second,
// see the note at the bottom of this file):
//
//   1. The home page renders every manifest-held string by interpolation. A game name, tagline,
//      tool name or tool description retyped as a literal in the page is the drift gh#87
//      acceptance criterion 1 forbids, and typecheck, build and CI are all green on it — so a
//      source-text tripwire is the only thing standing there. Category LABELS are exempt from the
//      literal scan: the owner-approved lead and metadata contain "ดูดวง" / "สุ่มคนโดน" as
//      substrings of longer copy ("เกมดูดวงสำหรับวงเพื่อน"), and the pills render labels through
//      {label} which is asserted directly instead. The <Base …> opening tag is stripped for the
//      same reason — its owner-mandated description enumerates tool names as prose.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { games, popularGroup, popularGames, featuredGame, featuredGroup } from '../games/manifest.ts';
import { categories } from '../games/categories.ts';
import { tools, toolsGroup } from '../tools/manifest.ts';

const here = dirname(fileURLToPath(import.meta.url));
const pageSrc = readFileSync(join(here, 'index.astro'), 'utf8');
// Landing components render the hero, tile and section markup the page used to hold inline. They
// are scanned whole: a component has no frontmatter copy exemption, because nothing it renders may
// be a literal (handoff D2 — zero content literals in components). gh#244 split canvas D into these
// five; a sixth landing component the page imports must join this list, and the import check below
// is what makes that a red rather than a quiet gap.
const COMPONENTS = ['HomeHero.astro', 'FeaturedCard.astro', 'Section.astro', 'ArtTile.astro', 'TextTile.astro'];
const componentSrc = COMPONENTS
  .map((name) => readFileSync(join(here, '..', 'components', 'landing', name), 'utf8'))
  .join('\n');

test('every landing component the page renders is in the literal scan', () => {
  const imported = [...pageSrc.matchAll(/from '\.\.\/components\/landing\/([A-Za-z]+\.astro)'/g)].map((m) => m[1]);
  const nested = [...componentSrc.matchAll(/from '\.\/([A-Za-z]+\.astro)'/g)].map((m) => m[1]);
  assert.ok(imported.length > 0, 'positive control: the import scan found no landing component at all');
  const missing = [...new Set([...imported, ...nested])].filter((name) => !COMPONENTS.includes(name));
  assert.deepEqual(missing, [], 'a landing component renders on the home page but is not scanned for retyped copy');
});

// Comments and metadata are exempt from the literal scan: the frontmatter cites canvas copy in
// quotes and the <Base …> tag carries the owner-mandated title/description that enumerates tool
// names as prose (decision, 2026-08-25: metadata keeps its old wording).
const pageBody = pageSrc
  .replace(/^---[\s\S]*?^---$/m, '')
  .replace(/<Base[\s\S]*?chrome\n>/m, '');

// positive control: this file narrows scope (frontmatter + the <Base> tag), it does not strip
// comments — but the retyped-literal scan below asserts ABSENCE, so the same vacuous-green risk
// applies (gh#130) if either replace() ever ate more than intended. <PageChrome> is the first real
// markup after the tag the second replace() removes.
assert.match(pageBody, /<PageChrome>/, 'positive control: the frontmatter/<Base> strip blanked the template');

// The frontmatter with its full-line comments removed — the page MODEL, nothing that merely talks
// about it. gh#192 (i) counts how many times the page renders one manifest field, and a count taken
// over prose would red on the next comment that names the field. Same vacuous-green risk as above,
// same shape of positive control: `const toolsRow` is the last model this slice must still hold.
const pageModel = (pageSrc.match(/^---[\s\S]*?^---$/m) ?? [''])[0].replace(/^[ \t]*\/\/.*$/gm, '');
assert.match(pageModel, /const toolsRow/, 'positive control: the frontmatter slice or the comment strip blanked the model');

const manifestCopy = [
  ...games.map((g) => g.names.th),
  ...games.map((g) => g.tagline),
  ...tools.map((t) => t.name),
  ...tools.map((t) => t.desc),
  // gh#159: the popular-row heading is hub copy, so ADR-0034 puts it in the manifest — the same
  // retyped-literal ban that guards names and taglines guards it.
  popularGroup.heading,
  // Intent panels and section heads render the hub pair (ADR-0034) — same ban, same scan.
  ...Object.values(categories).flatMap((c) => [c.hubHeading, c.hubBody]),
  toolsGroup.heading,
  toolsGroup.body,
];

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A "literal" is a standalone occurrence: not glued to neighbouring Thai letters. The owner-approved
// lead contains the game name "สุ่มคนโดน" inside "เกมสุ่มคนโดนกับเกมดูดวง…" — a substring, not a
// retyped card — so the scan requires a non-Thai boundary on both sides (a real retype sits between
// tags like ">ชื่อ<").
const THAI = '[\\u0e00-\\u0e7f]';
const standalone = (s) => new RegExp(`(?<!${THAI})${escapeRegExp(s)}(?!${THAI})`);

test('no manifest-held game/tool copy is retyped as a literal in the home page', () => {
  const scanned = pageBody + '\n' + componentSrc;
  const offenders = [...new Set(manifestCopy)].filter((s) => standalone(s).test(scanned));
  assert.deepEqual(offenders, [], 'game names, taglines, tool names, tool descriptions and hub copy must render from the manifests');
});

test('the home page reads game names and taglines from the games manifest', () => {
  assert.match(pageSrc, /from '\.\.\/games\/manifest'/, 'must import the games manifest, not a copy of it');
  assert.match(pageSrc, /\{[^}]*\.names\.th[^}]*\}/, 'a card must render names.th by interpolation');
  assert.match(pageSrc, /\{[^}]*tagline[^}]*\}/, 'a card must render the tagline by interpolation');
  // gh#75: the grouped cards feed the same two fields through the model, and the featured card's own
  // interpolation above would otherwise satisfy the two assertions on its own.
  assert.match(pageSrc, /title:\s*game\.names\.th\b/, 'the card model must take its title from the games manifest');
  assert.match(pageSrc, /desc:\s*game\.tagline\b/, 'the card model must take its body from the games manifest');
  // gh#159: the featured card that used to carry `{featured.names.th}` in the markup is gone, so the
  // two loose scans above now match the card model itself. The markup end of the invariant is
  // therefore pinned here explicitly rather than left to those regexes: model field fed by the
  // manifest AND that field rendered by interpolation, the same both-ends shape as the tools test.
  assert.match(pageBody, /\{card\.title\}/, 'a game card must render the title by interpolation');
  assert.match(pageBody, /\{card\.desc\}/, 'a game card must render the tagline by interpolation');
});

// gh#75 moved the manifest read one step up: the page builds a `groups` model in its frontmatter and
// the markup renders `{card.title}` / `{card.desc}` / `{card.pill}` for every group at once. The
// both-ends shape is unchanged and is what this test still holds — the frontmatter field must be fed
// by the manifest expression, and the markup must render that field by interpolation. Pinning only
// the markup would pass on a page whose model retyped the string; pinning only the model would pass
// on a page that never rendered it.
//
// gh#192 (i), owner ruling 2026-09-03, dropped the tools group LIST because it and the tools panel
// rendered the same hub heading twice. gh#244 (canvas D, ADR-0058 as amended) brings per-tool tiles
// back under ONE tools row whose head is that heading — the panel is gone, so the heading still
// renders once. The pin therefore flips on the per-tool model (it must exist again) and keeps the
// count, which is what actually guards the duplicate h2.
test('the tools row renders its hub copy once and every tool from the manifest', () => {
  assert.match(pageSrc, /from '\.\.\/tools\/manifest'/, 'must import the tools manifest, not a copy of it');
  assert.match(pageModel, /title:\s*tool\.name\b/, 'gh#244: a tool tile must take its title from the tools manifest');
  assert.match(pageModel, /desc:\s*tool\.desc\b/, 'gh#244: a tool tile must take its body from the tools manifest');
  assert.match(pageModel, /tools\.map\(/, 'gh#244: the tools row renders every tool the manifest holds, not a picked list');
  assert.equal(
    (pageModel.match(/toolsGroup\.heading\b/g) ?? []).length,
    1,
    'gh#192 (i): the tools hub heading must be rendered exactly once — two renders is the duplicate h2 it closed',
  );
  assert.match(pageModel, /heading:\s*toolsGroup\.heading\b/, 'the tools row head must take its heading from the manifest');
  assert.match(pageModel, /body:\s*toolsGroup\.body\b/, 'the tools row head must take its body from the manifest');
  assert.match(pageBody, /\{card\.title\}/, 'a tile must render the title by interpolation');
  assert.match(pageBody, /\{card\.desc\}/, 'a tile must render the description by interpolation');
});

// gh#244 / ADR-0058 as amended — the party shelf lists every party game again, and which games and
// in what order is the manifest's alone: the page filters the registry by category and names no game.
// The featured hero card is the same bargain as the popular row (ADR-0052): data in the manifest.
test('the party shelf and the featured card are driven by the manifest, not by game ids in the page', () => {
  assert.match(pageModel, /games\.filter\(\(game\) => game\.category === cat\)/, 'a category row must list its games by filtering the registry');
  const named = games.map((g) => g.id).filter((id) => pageSrc.includes(`'${id}'`) || pageSrc.includes(`"${id}"`));
  assert.deepEqual(named, [], 'no game id may be written into the home page');
  assert.match(pageSrc, /\bfeaturedGame\b/, 'the hero card must render the manifest-held featured game');
  assert.ok(games.includes(featuredGame), `featuredGroup.id "${featuredGroup.id}" must be a registered game`);
  assert.equal(featuredGame.category, 'party', 'the featured card promotes a GAME (ADR-0040): a party game');
  assert.ok(featuredGame.cardArt, 'the hero renders the featured game\'s own card art, so it must declare cardArt');
});

// gh#159 / ADR-0052 — the popular row is data. Which games and in what order is one manifest edit;
// the page holds no game id of its own. This is pinned at both ends like the group model above: the
// order is read from the manifest export, and the page must contain no id-picking call at all.
test('the popular row is driven by the manifest, not by a game id in the page', () => {
  assert.ok(
    popularGames.length >= 3 && popularGames.length <= 4,
    `the row is three to four games — the manifest order holds ${popularGames.length}`,
  );
  assert.match(pageSrc, /from '\.\.\/games\/manifest'/, 'must import the games manifest, not a copy of it');
  assert.match(pageSrc, /popularGames\b/, 'the row must render the manifest-held order');
  assert.match(pageSrc, /popularGroup\.heading\b/, 'the heading is manifest copy (ADR-0034)');
  assert.doesNotMatch(
    pageSrc,
    /byId\(/,
    'no card on this page may be picked by a game id written into the page',
  );
  // ADR-0050 ruling 2: a promoted card enters the game directly wherever a play route exists.
  assert.match(pageSrc, /game\.playRoute \?\? `\/game\/\$\{game\.id\}\/`/, 'a card must prefer the play route');
  // CLAUDE.md: games live in the party and fortune categories only, and a fortune page or a
  // randomizer tool is not a game — the row promotes GAMES, so every id resolves through the games
  // manifest and a tool or a non-game page can never enter the row.
  for (const game of popularGames) {
    assert.ok(games.includes(game), `${game.id} must be a registered game`);
  }
});

// gh#244: canvas D's tiles carry no category pill. The pill existed because the popular row mixed
// categories; on D every game sits under its own category's hub heading, and the popular row is party
// games only (popularGroup's own load-bearing comment). ADR-0058's gh#244 amendment records that
// trade. What stays pinned is the half that still applies: no label is retyped as bare markup.
test('category labels render through the manifest, never as page literals', () => {
  assert.match(pageSrc, /from '\.\.\/games\/categories'/, 'must import the categories record');
  for (const game of popularGames) {
    assert.equal(game.category, 'party', `${game.id}: a pill-less popular row must stay party-only, or a reader cannot tell a fortune page from a game`);
  }
  assert.doesNotMatch(pageBody, />\s*ดูดวง\s*</, 'the literal label must not sit in markup as bare copy');
  assert.doesNotMatch(pageBody, />\s*สุ่มคนโดน\s*</, 'the literal label must not sit in markup as bare copy');
});

// gh#192 (a), the rule half — owner ruling 2026-09-03. ADR-0040, restated in CLAUDE.md: a shared
// roster and a phone passed around the group are true of the party category alone, never of the
// whole site. Three page-owned strings stated them site-wide, in two how-to steps and the last FAQ
// answer. They were removed rather than reworded, because replacement copy is the owner's and that
// half of (a) stays parked.
//
// This is a REGRESSION PIN on the strings that were removed, not an enforcement of the rule. It does
// NOT cover: the player-count range form (scripts/party-size-claim-check.mjs owns that half), any new
// phrasing of the same claim, or any surface other than this page. The phone-passing and roster
// halves stay reviewer-owned until #94/#95/#96 land (ADR-0019). pageBody excludes the <Base> tag, so
// the page title and meta description are out of this scan on purpose — gh#192 (g) still owns them.
test('no site-level roster or phone-passing claim is left in the home page how-to and FAQ', () => {
  const claims = ['ใส่ชื่อคนในวง', 'จำชื่อวงเดิม', 'ส่งมือถือวนกัน'];
  const left = claims.filter((claim) => pageBody.includes(claim));
  assert.deepEqual(left, [], 'a party-category fact stated as a site-level one (ADR-0040) — remove it, do not reword it');
});

// gh#125: the two "the field stays removed" bans are gone. A field with no reader is dead schema, not
// broken behaviour, and these two banned a NAME rather than the harm — `\bbody\s*:\s*'` reds any
// legitimate new `body:` field anywhere in the tools manifest, so the pin cost more than it protected.
// The three drift scans above are what actually hold gh#87 criterion 1: if a hub field regrows AND the
// page starts rendering it, the retyped-literal scan is what sees it.