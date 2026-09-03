#!/usr/bin/env node
// gh#89 — the party-size claim may appear only on a surface whose subject is the party category.
//
// The rule, and the reason it is shaped this way, live in docs/agents/src-edit-rules.md
// § "The party-size claim". ADR-0039 and ADR-0040 are the decisions behind it. This script
// enforces one half of it, and its green earns no coverage over the other half (ADR-0019):
//
//   COVERED    — the range form of the claim (a player-count range: "2-10 คน", "2 ถึง 10 คน")
//                in visible copy, over the full enumerated surface set.
//   NOT COVERED — the phone-passing and shared-roster claims. Those are prose, not a shape a
//                regex can bound, and they stay reviewer-owned until #94/#95/#96 land.
//
// A green run of this gate means only the numeric-range form was checked, on the enumerated
// surface set above — it is not a clearance for the two NOT COVERED claims.
//
// ponytail: the shared category page is classified forbidden whole, because no
// `category === 'party'` branch exists in it today. The rule permits copy inside such a branch; if
// one is added, this gate reds on it and a human widens the classifier — it does not fail open.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { stripComments, stripAstro, astroTemplateFixture, legacyTextualStrip, globTemplateFixture } from './strip-comments.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The claim: a player-count RANGE. Not any number of people — "อย่างน้อย 2 คน" is a guard message,
// not the site's party-size promise.
const CLAIM = /\d+\s*(?:-|–|—|ถึง|to)\s*\d+\s*(?:คน|players)/g;

// Outside the rule entirely, by a separate owner decision the same day: a page's <title> and
// <meta name="description">. Blanked before detection so the gate cannot enforce a rule nobody
// agreed to. Spans newlines on purpose — a manifest's `description:` key and its value sit on
// different lines.
const EXEMPT_META = /\b(?:title|description)\s*[:=]\s*(['"`])(?:\\.|(?!\1)[\s\S])*?\1/g;
// The JS/TS comment arms are gone (gh#191, owner decision: one shared stripper, imported everywhere).
// They were two regexes enumerating "text that is a JS comment" — a set owned by the language spec,
// never by this repo (ADR-0031), which is why the `[^:]` arm keeping `https://` from blanking its line
// was a patch and not an approximation. Both rungs it left open are closed by the parser-backed
// scripts/strip-comments.mjs: a `/*` inside a string literal no longer pairs with the next real `*/`
// and blanks every live line between them, and a `//` inside a quoted value is no longer an opener. A
// CLAIM in either span used to stop existing, greening a surface this gate did not read — the
// direction that matters, since the whole point is catching a player-count claim made outside the
// party category.
//
// ponytail: DISCLOSED CEILING — `<!-- … -->` stays textual. It is HTML grammar; the TypeScript parser
// does not own it and the shared stripper does not touch it. It runs FIRST, before the shared strip,
// so a `//` or `/*` inside an HTML comment cannot blank the `-->` and let the span run to the next one
// in the file. Second residue, same shape as accent-single-source-check's: an .astro `<style>` block is
// CSS routed to the JS stripper, so a scheme URL there would blank the rest of its line — zero
// instances today (`url(` appears nowhere in src/, this site ships no images by content rule).
// Trigger to close either: conserve on the hazard this repo owns — run CLAIM over the RAW text as well,
// and if a match is present raw and absent after blanking, abort before printing rather than pass,
// the way accent-single-source-check's conservationFailures does. NOT free, and that is why it is not
// done here: measured on the tree this was written against, a raw-vs-blanked CLAIM diff over the 81
// scanned surfaces found 26 raw matches and exactly 1 lost to comment blanking — and that one is a
// genuine HTML comment in src/pages/index.astro citing the gh#89 / ADR-0040 ruling by quoting the
// claim it forbids. So a conservation abort here would need a use-vs-mention exemption first, which
// is a second unowned set. The accent gate has no such case, which is why it could take the abort.
const COMMENTS = [/<!--[\s\S]*?-->/g];

/** Replace every match with same-shape blanks, so reported line numbers stay true to the file. */
const blank = (text, re) => text.replace(re, (m) => m.replace(/[^\n]/g, ' '));

function collectSurfaces(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) collectSurfaces(abs, out);
    else if (/\.(astro|ts)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) {
      out.push({ relPath: path.relative(repoRoot, abs), text: fs.readFileSync(abs, 'utf8') });
    }
  }
  return out;
}

/** The party block of categories.ts, as a [start, end) char range — the หมวด is its own subject. */
function partyBlockRange(text) {
  const start = text.indexOf('party: {');
  if (start === -1) return null;
  let depth = 0;
  for (let i = text.indexOf('{', start); i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return [start, i + 1];
  }
  return null;
}

/**
 * Permission is decided by the SUBJECT of the copy, not by the URL it renders on: a party game's
 * own strings stay permitted wherever they are syndicated (the home grid renders every tagline).
 */
function classify(surface) {
  if (/\bcategory:\s*'party'/.test(surface.text)) return { permitted: 'whole' };
  if (surface.relPath.endsWith(path.join('src', 'games', 'categories.ts'))) {
    const range = partyBlockRange(surface.text);
    if (range) return { permitted: 'range', range };
  }
  return { permitted: 'none' };
}

function violations(surface, verdict) {
  if (verdict.permitted === 'whole') return [];
  let text = surface.text;
  for (const re of COMMENTS) text = blank(text, re); // HTML comments first — see the COMMENTS block
  // then every real comment, through the shared stripper, routed to the grammar that owns the file
  text = surface.relPath.endsWith('.astro') ? stripAstro(text) : stripComments(text);
  text = blank(text, EXEMPT_META);
  const found = [];
  for (const m of text.matchAll(CLAIM)) {
    if (verdict.permitted === 'range' && m.index >= verdict.range[0] && m.index < verdict.range[1]) continue;
    found.push({ line: text.slice(0, m.index).split('\n').length, text: m[0].trim() });
  }
  return found;
}

// ---------------------------------------------------------------------------
// Self-test: pure, no disk IO — classify()/violations() take plain {relPath, text} objects, so
// synthetic surfaces exercise the real detection logic with no temp fixture tree needed. Calibrated
// both ways: a known-good surface must stay clean, a known-bad one must be flagged, and both
// permission shapes ('whole' and 'range') must still let their own permitted claim through.
// ---------------------------------------------------------------------------
function selftest() {
  const clean = { relPath: 'src/pages/index.astro', text: 'บ้านเรือน ไม่มีคำอ้างสิทธิ์การเล่น' };
  assert.deepEqual(violations(clean, classify(clean)), [], 'known-good: no claim text on a non-permitted surface must not flag');
  console.log('PASS known-good: surface with no party-size claim stays clean');

  const forbidden = { relPath: 'src/pages/index.astro', text: 'เล่นได้ 2-10 คน สนุกแน่นอน' };
  const badFound = violations(forbidden, classify(forbidden));
  assert.equal(badFound.length, 1, 'known-bad: a range-form claim on a non-permitted surface must be flagged exactly once');
  assert.equal(badFound[0].text, '2-10 คน', 'known-bad: the flagged text must be the claim itself');
  console.log(`PASS known-bad: range claim on a forbidden surface is flagged ("${badFound[0].text}")`);

  const wholePermitted = { relPath: 'src/games/foo.astro', text: "category: 'party',\nเล่นได้ 2-10 คน" };
  assert.deepEqual(classify(wholePermitted), { permitted: 'whole' }, 'a party-category surface must classify whole-permitted');
  assert.deepEqual(violations(wholePermitted, classify(wholePermitted)), [], 'a claim on a party-category surface must never be flagged');
  console.log('PASS permitted-whole: party-category surface never flagged');

  const categoriesText = [
    'export const categories = {',
    "  party: {",
    "    tagline: 'เล่นได้ 2-10 คน',",
    '  },',
    "  quiz: {",
    "    tagline: 'เล่นได้ 2-10 คน',",
    '  },',
    '};',
  ].join('\n');
  const categoriesSurface = { relPath: path.join('src', 'games', 'categories.ts'), text: categoriesText };
  const verdict = classify(categoriesSurface);
  assert.equal(verdict.permitted, 'range', 'categories.ts must classify range-permitted, scoped to the party block');
  const rangeFound = violations(categoriesSurface, verdict);
  assert.equal(rangeFound.length, 1, "the party block's own claim must be permitted; only the quiz block's identical claim must be flagged");
  console.log(`PASS permitted-range: party block's own claim is silent, the quiz block's identical claim is still flagged (line ${rangeFound[0].line})`);

  // gh#191 fixture: a forbidden claim sitting after a glob string and a multi-line template. Under the
  // textual stripper this file used to carry, the glob's phantom `/*` paired with the real `*/` below
  // and blanked the claim — the gate greened a surface it never read. The legacy regex is run on the
  // same input and asserted to lose it, so this leg cannot be green by never reaching the hazard.
  const globSurface = {
    relPath: 'src/pages/index.astro',
    text: globTemplateFixture("const copy = 'เล่นได้ 2-10 คน';"),
  };
  assert.ok(!legacyTextualStrip(globSurface.text).includes('2-10 คน'), 'POSITIVE CONTROL: the legacy regex must lose the claim on this fixture, or flagging it proves nothing');
  const globFound = violations(globSurface, classify(globSurface));
  assert.equal(globFound.length, 1, 'gh#191: a claim after a glob and a multi-line template must still be flagged exactly once');
  assert.equal(globFound[0].text, '2-10 คน', 'gh#191: and the flagged text must be the claim itself');
  console.log('PASS gh#191 fixture: a claim hidden behind a glob and a multi-line template is lost by the legacy regex and still flagged by the shared stripper');

  // gh#191 REVIEW FIX: template position. The claim sits after a bare `://` in HTML text, where the
  // TypeScript parser finds no quoted span, so the unrouted stripper blanked the rest of the line and
  // this gate went quiet on a player-count claim outside the party category. That stripper is run on
  // the same input as the positive control.
  const templateSurface = { relPath: 'src/pages/index.astro', text: astroTemplateFixture('เล่นได้ 2-10 คน') };
  assert.ok(!stripComments(templateSurface.text).includes('2-10 คน'), 'POSITIVE CONTROL: the unrouted stripper must lose the template-position claim, or this leg proves nothing');
  const templateFound = violations(templateSurface, classify(templateSurface));
  assert.equal(templateFound.length, 1, 'gh#191 review fix: a claim in .astro template position must be flagged exactly once — the frontmatter and script copies of it are real comments and must not count');
  assert.equal(templateFound[0].text, '2-10 คน', 'gh#191 review fix: and the flagged text must be the claim itself');
  console.log('PASS gh#191 review fix: a claim in .astro template position is flagged, its frontmatter and script-body comment twins are not, where the unrouted stripper lost all three');
}

if (process.argv.includes('--selftest')) {
  selftest();
} else {
  const surfaces = collectSurfaces(path.join(repoRoot, 'src'));
  if (surfaces.length === 0) {
    console.error('party-size-claim-check: enumerated 0 surfaces — the walk is broken, not the tree');
    process.exit(1);
  }

  const classified = surfaces.map((s) => ({ ...s, verdict: classify(s) }));
  const permitted = classified.filter((s) => s.verdict.permitted !== 'none');
  const offences = classified.flatMap((s) =>
    violations(s, s.verdict).map((v) => ({ relPath: s.relPath, ...v })),
  );

  if (offences.length > 0) {
    for (const o of offences) {
      console.error(
        `${o.relPath}:${o.line}: party-size claim "${o.text}" on a surface that is not on the permitted list`,
      );
    }
    console.error(
      `\ngh#89 / ADR-0040: the claim is true of the สุ่มคนโดน หมวด, not of the site. It is permitted only where that หมวด or one of its members is the subject — see docs/agents/src-edit-rules.md § "The party-size claim". ${offences.length} occurrence(s) on ${new Set(offences.map((o) => o.relPath)).size} forbidden surface(s).`,
    );
    process.exit(1);
  }

  console.log(
    `party-size-claim-check: ${surfaces.length} surface(s) enumerated, ${permitted.length} on the permitted list, 0 range-form claims outside it (phone-passing and roster claims NOT covered — ADR-0019)`,
  );
}
