// node --test — no framework, no dependency. gh#87 seams, pinned at the source-text level (no
// build/dist involved, same bargain as noindex.test.mjs). Two invariants:
//
//   1. The home page renders every manifest-held string by interpolation. A game name, tagline,
//      tool name or tool description retyped as a literal in the page is the drift gh#87
//      acceptance criterion 1 forbids, and typecheck, build and CI are all green on it — so a
//      source-text tripwire is the only thing standing there. Category LABELS are exempt from the
//      literal scan: the owner-approved lead and metadata contain "ดูดวง" / "สุ่มคนโดน" as
//      substrings of longer copy ("เกมดูดวงสำหรับวงเพื่อน"), and the pills render labels through
//      {label} which is asserted directly instead. The <Base …> opening tag is stripped for the
//      same reason — its owner-mandated description enumerates tool names as prose.
//   2. The four hub-copy fields gh#87 removed — CategoryMeta.hubHeading / hubBody and
//      toolsGroup.heading / body — stay removed. Their only reader was the three group cards,
//      which went in the same change; a field that regrows with zero readers is the dead-schema
//      hole that removal closed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { games } from '../games/manifest.ts';
import { tools } from '../tools/manifest.ts';

const here = dirname(fileURLToPath(import.meta.url));
const pageSrc = readFileSync(join(here, 'index.astro'), 'utf8');
const categoriesSrc = readFileSync(join(here, '..', 'games', 'categories.ts'), 'utf8');
const toolsManifestSrc = readFileSync(join(here, '..', 'tools', 'manifest.ts'), 'utf8');

// Comments and metadata are exempt from the literal scan: the frontmatter cites canvas copy in
// quotes and the <Base …> tag carries the owner-mandated title/description that enumerates tool
// names as prose (decision, 2026-08-25: metadata keeps its old wording).
const pageBody = pageSrc
  .replace(/^---[\s\S]*?^---$/m, '')
  .replace(/<Base[\s\S]*?chrome\n>/m, '');

const manifestCopy = [
  ...games.map((g) => g.names.th),
  ...games.map((g) => g.tagline),
  ...tools.map((t) => t.name),
  ...tools.map((t) => t.desc),
];

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A "literal" is a standalone occurrence: not glued to neighbouring Thai letters. The owner-approved
// lead contains the game name "สุ่มคนโดน" inside "เกมสุ่มคนโดนกับเกมดูดวง…" — a substring, not a
// retyped card — so the scan requires a non-Thai boundary on both sides (a real retype sits between
// tags like ">ชื่อ<").
const THAI = '[\\u0e00-\\u0e7f]';
const standalone = (s) => new RegExp(`(?<!${THAI})${escapeRegExp(s)}(?!${THAI})`);

test('no manifest-held game/tool copy is retyped as a literal in the home page', () => {
  const offenders = [...new Set(manifestCopy)].filter((s) => standalone(s).test(pageBody));
  assert.deepEqual(offenders, [], 'game names, taglines, tool names and tool descriptions must render from the manifests');
});

test('the home page reads game names and taglines from the games manifest', () => {
  assert.match(pageSrc, /from '\.\.\/games\/manifest'/, 'must import the games manifest, not a copy of it');
  assert.match(pageSrc, /\{[^}]*\.names\.th[^}]*\}/, 'a card must render names.th by interpolation');
  assert.match(pageSrc, /\{[^}]*tagline[^}]*\}/, 'a card must render the tagline by interpolation');
});

test('the home page reads tool names and descriptions from the tools manifest', () => {
  assert.match(pageSrc, /from '\.\.\/tools\/manifest'/, 'must import the tools manifest, not a copy of it');
  assert.match(pageSrc, /\{tool\.name\}/, 'a tool card must render the name by interpolation');
  assert.match(pageSrc, /\{tool\.desc\}/, 'a tool card must render the description by interpolation');
});

test('category labels render through the manifest, never as page literals', () => {
  assert.match(pageSrc, /from '\.\.\/games\/categories'/, 'must import the categories record');
  assert.match(pageSrc, /\{[^}]*label[^}]*\}/, 'a game pill must render categories[label] by interpolation');
  assert.doesNotMatch(pageBody, />\s*ดูดวง\s*</, 'the literal label must not sit in markup as bare copy');
  assert.doesNotMatch(pageBody, />\s*สุ่มคนโดน\s*</, 'the literal label must not sit in markup as bare copy');
});

test('CategoryMeta no longer declares the hub-copy fields gh#87 removed', () => {
  assert.doesNotMatch(categoriesSrc, /\bhubHeading\s*[:?]/, 'hubHeading must be gone, not commented out');
  assert.doesNotMatch(categoriesSrc, /\bhubBody\s*[:?]/, 'hubBody must be gone, not commented out');
});

test('toolsGroup no longer declares the heading and body gh#87 removed', () => {
  assert.doesNotMatch(toolsManifestSrc, /\bheading\s*:\s*'/, 'toolsGroup.heading must be gone, not commented out');
  assert.doesNotMatch(toolsManifestSrc, /\bbody\s*:\s*'/, 'toolsGroup.body must be gone, not commented out');
});