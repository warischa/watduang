#!/usr/bin/env node
// Dangling CSS custom-property gate for the built HTML (dist/**/*.html), gh#85. Fails the build when a
// page references a custom property via var(--x) that no stylesheet or inline style on THAT SAME page
// defines. This is the hole gh#74 left open: `src/pages/c/[category].astro` interpolated the category
// slug where it needed the manifest accent name, emitting var(--accent-fortune) / var(--accent-party).
// Neither property exists (the tokens are --accent-gold / --accent-punch), both pages rendered the
// accent as currentColor, and — at that exact moment — tsc exit 0, the build completing, 188/188 tests,
// and this page's own membership / cross-link / no-inline-script checks were ALL green. No typecheck,
// build, or test result is evidence about a rendered value.
//
// WHAT ITS GREEN MEANS, AND WHAT IT DOES NOT. Green means: every fallback-less var(--x) in the
// markup this repo SHIPS — style blocks, inline style attributes, other attribute values, linked
// repo-owned stylesheets — names a property something on that same page defines. It does NOT cover
// markup that only exists at runtime: a var() inside a string that JS writes via innerHTML, or a
// property set through element.style.setProperty(). Those are authored in .ts and never appear in
// dist/, so no build-time scan of dist/ can see them (src/games/pick-loser.ts BURST_SVG is one).
// That set is guarded at authorship per ADR-0026, not here — claiming otherwise would be the same
// unearned sentence-next-to-the-code this gate was written to catch.
//
// THE TWO SETS, AND WHO OWNS THEM.
//
// REFERENCES = every var(--name) that appears with NO fallback (see "fallback", below), collected from
// the page's own CSS and from its other attribute values. DEFINITIONS = every `--name:` value assignment
// on the page. A reference is dangling iff its name is not in the definitions of the SAME page. Both sets
// are scoped PER PAGE, never unioned across dist/: a union would false-pass a page that references a
// property only some OTHER page defines, which is exactly the "clean" this gate exists to reject. That
// argument stands on its own and does not need dist/ to be all-inline — which it is not.
//
// WHAT THE ARTIFACT ACTUALLY IS (gh#126, re-derived from the built tree, not assumed). dist/_astro/
// ships BOTH .js and .css. The header used to claim it ships only .js and that every page's CSS is
// inlined into its single <style> block; that was false. Astro externalises the per-route bundles above
// assetsInlineLimit, so a page ships a <style> block AND links one stylesheet from dist/_astro/. The
// shape is measured, never assumed:
//   ls dist/_astro/*.css | wc -l                                        -> the external stylesheet count
//   grep -rl 'rel="stylesheet"' dist --include='*.html' | wc -l         -> pages that link one
//   find dist -name '*.html' | wc -l                                    -> pages this gate walks
// At the time of writing that reads 5 external stylesheets, linked by 11 of the 15 walked pages.
//
// WHICH CASE THE GREEN WAS (gh#126 enumerated three; the answer is 1 on the external-CSS axis and 3 on
// a different one). Case 1 on the definition axis: no page references a property whose only `--x:`
// assignment lives in an external stylesheet — every :root token is still inlined per page, so the
// external files carry references, not the definitions those references need. The external leg is
// nonetheless load-bearing in the OTHER direction: those 11 external stylesheets contain ~10
// fallback-less var() references each (--page-accent, --color-text, --font-sans, …), so a gate that
// skipped them would silently drop ~110 references from the set it claims to check. It does not skip
// them (pageCssText follows each page's own <link>, and only that page's), which is why the corrected
// premise changes no verdict here. Case 3 DID hold on a separate axis and is fixed in this same edit:
// main() built its reference text from the page CSS alone and never passed refOnlyTextsOf(), so every
// non-style attribute value — the SVG stroke="var(--x)" paints the header claims below, on all six built
// game pages — was scanned in the selftest and in no real run. Zero new dangling names appear on the
// current tree once they are scanned, so the corrected scope is calibrated by a planted break, not by
// a change in the verdict.
//
// OWNERSHIP of the definition set, member by member (the brief's seven bullets):
//   · a `--x:` inside @media / @supports / @container    -> DEFINITION. It is a value assignment in the
//     page's own (repo-generated) CSS. Counting it is the fail-safe direction: skipping it would
//     false-red a page whose reference resolves fine when the at-rule matches.
//   · a `--x:` on a selector other than :root (.card {})  -> DEFINITION, same reason. Cascade scope is a
//     runtime concern ("visible on this element"), not "defined anywhere on the page"; this gate answers
//     the latter only.
//   · a `--x:` in an inline style="…" attribute           -> DEFINITION, and load-bearing, not
//     hypothetical: src/pages/c/[category].astro renders style="--page-accent: var(--accent-…);", so
//     every category page (and, after two parallel briefs land this session, the home and game
//     pages too) defines --page-accent ONLY in an inline attribute. A gate that did not count inline attributes as
//     definitions goes red on every one of those pages on its first run.
//   · `@property --x { … }`                               -> NOT a definition (see "the @property edge").
//   · a property a stylesheet this repo does not author might define (UA sheet, a third-party script, a
//     browser extension injecting style): UNOWNED. AdSense loads in a cross-origin iframe — a separate
//     document, and custom properties never cross document boundaries — so the ad case cannot add or
//     remove a member here. A third party INJECTING a definition into our document would only ADD to
//     this page's definitions, which would make the gate PASS (fail-open) on something that is, at that
//     moment, actually defined — not the defect this gate guards. The residual it cannot see is the
//     inverse: a var(--x) that resolves ONLY because a third party injects --x; the gate flags it red
//     even though the property exists at runtime. That is a fail-CLOSED over-flag on correct pages, and
//     today it fires on nothing (dist/ carries no externally-injected style to scan). Bound the gate to
//     the definitions this repo ships; document the injected-definition ceiling rather than enumerate a
//     set we do not own (a gate whose set it does not own never converges).
//   · var() in a <style> block vs in an external .css the page links: BOTH are repo-owned (the build
//     writes both into dist/), and both are followed. Each <link rel="stylesheet" href="*.css"> the page
//     itself carries is resolved and read, and its definitions and references join THAT page's sets
//     only — the per-page scoping above is preserved, because the link list comes from the page. This
//     leg is NOT empty on the real artifact (see "what the artifact actually is"): Astro externalises
//     the route bundles, and the external files are where most of the fallback-less references live. It
//     is pinned in selftest both ways — a definition in a linked file resolves, a reference no linked
//     file defines is still red.
//
// FALLBACK. var(--x, <anything>) is NOT dangling — the fallback makes it valid whether or not --x is
// defined, and a gate that flagged it would train people to ignore the gate. The fallback is detected by
// scanning from the end of the name forward for the FIRST comma at the top level of THIS var() call
// (tracking nested parentheses so a comma inside var(--a, var(--b, 4px))'s inner call is not mistaken
// for the outer call's separator). Consequence, pinned: var(--a, var(--b, 4px)) is green (both
// fallbacked), var(--a, var(--b)) flags --b (fallback-less) and not --a (fallbacked). A reference inside
// an inline style attribute is scanned the same way as one in a <style> block — the attribute value is
// one more text chunk in the same joined page text, so `style="color:var(--x)"` is a reference and
// `style="--page-accent: …"` is a definition, both looked up against the whole page.
//
// THE @property EDGE, pinned but empty. @property --x { … } registers a property; it does not assign a
// value, and a `--x:` value line is the only thing this gate counts as a definition. So var(--x) against
// a property that is @property-registered but never assigned is FLAGGED. That is the fail-safe side and
// is correct for the no-initial-value case (the guaranteed-invalid value, same as unset); it is a
// deliberate over-flag for a registration that carries initial-value (which does give --x a computed
// default). This repo ships zero @property today (asserted in selftest), so the edge is empty; the
// upgrade path, should @property ever land, is a human step to add the registered name to the definition
// set — documented here rather than silently wrong.
//
// PONYTAIL — this is a text scan of the built artifact, not a CSS parser (no parser dependency, same
// bargain as the sibling CSP gates). Disclosed regex limits, all empty on the current tree:
//   1. Custom-property NAMES are matched as --[A-Za-z0-9_-]+. CSS idents are wider (escapes, non-ASCII),
//      but this repo's tokens and every source file use plain ASCII names, and value lines with other
//      names would be a diff worth a human eye.
//   2. A `--x:` or `var(--x)` inside a CSS STRING (content: "var(--x)") or a comment-like spot the
//      blanking below cannot reach would be mis-scanned. HTML comments are blanked, and <script> /
//      <textarea> / <title> raw-text bodies are blanked (never <style>, which is exactly what we scan),
//      so prose and JSON-LD cannot trip the gate.
//   3. The fallback scanner is paren-aware but not quote-aware: a `,` or `)` inside a quoted URL string
//      in a fallback could mis-resolve. dist/ is generated markup and ships none; a real-author case
//      would need quote tracking, the same residue class the sibling gates disclose.
//
//   node scripts/dangling-css-var-check.mjs             -> scan dist/**/*.html, exit non-zero on any dangling property
//   node scripts/dangling-css-var-check.mjs --selftest  -> both-direction calibration on temp fixtures (never dist/, never src/)
//   node scripts/dangling-css-var-check.mjs <dir>       -> local-only narrow (refused when CI is set)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

// '' / '0' / 'false' are not CI. GitHub Actions sets CI=true.
const isCi = (env = process.env) => !!env.CI && env.CI !== '0' && env.CI !== 'false';

const blank = (m) => m.replace(/[^\n]/g, ' ');

// HTML comments blanked (offsets and line numbers preserved) — ADR-0019 rule 2, negative-presence
// direction: a comment that merely mentions var(--x) must trip nothing.
const COMMENT_RE = /<!--(?:>|->|[\s\S]*?(?:--!?>|$))/g;

// Raw-text bodies that are NOT CSS blanked: inside <script> (a JSON-LD string can carry `var(--x)` as
// literal text), <textarea> and <title>, a `<` opens no tag and a `var(--` is prose, not CSS. <style> is
// DELIBERATELY excluded — it is exactly the CSS this gate scans.
const NON_CSS_RAW_TEXT_RE = /(<(script|textarea|title)\b[^>]*>)([\s\S]*?)(<\/\2)/gi;

const STYLE_BLOCK_RE = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
// Inline style attributes, quoted (Astro's output) or unquoted.
// The guard is a NEGATIVE lookbehind, not `\b`. `\b` was wrong and the comment that claimed
// otherwise was written in the same edit that made it false (ADR-0019): in `data-style`, the `-`/`s`
// pair IS a word boundary, so `\bstyle=` matched it. That mattered — a `data-style="--x:red"`
// attribute injected a false DEFINITION and could mask a real dangling reference, turning this gate
// green on a page it exists to reject. `(?<![-\w])` rejects any prefix character, so `data-style`,
// `my-style` and `xstyle` are all excluded while a real ` style=` still matches.
const STYLE_ATTR_RE = /(?<![-\w])style\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

// Every OTHER attribute's value, scanned for REFERENCES only — never for definitions. SVG
// presentation attributes (fill, stroke, stop-color, …) accept var() and both Chrome and WebKit
// resolve it, so `stroke="var(--color-line-strong)"` is a real paint that a token rename can break.
// This diff ships exactly that shape in src/layouts/GameLayout.astro's nav arrow, on all six built
// game pages, and scanning only `style=` left it invisible.
// Deliberately NOT an allowlist of presentation attributes: that set is owned by the SVG and CSS
// specs, not by this repo, so enumerating it never converges. Scanning every attribute value
// over-flags instead — the failure direction that is safe here, because a false red names the page
// and the property and is one edit to resolve, while a false green is the defect gh#85 exists to
// stop. A definition can only come from `style=`, since no other attribute assigns a custom property.
const ANY_ATTR_RE = /=\s*(?:"([^"]*)"|'([^']*)')/g;

const NAME = '[A-Za-z0-9_-]+';
const DEF_RE = new RegExp(`--(${NAME})\\s*:`, 'g');
// The `var(` keyword is a CSS function name and is ASCII case-insensitive — `VAR(--x)` and
// `Var(--x)` are valid references. The custom-property NAME after it is case-SENSITIVE, so the `i`
// flag cannot go on the whole pattern; the keyword is spelled out per-character instead.
const VAR_RE = new RegExp(`[Vv][Aa][Rr]\\(\\s*--(${NAME})`, 'g');

// ---------------------------------------------------------------------------
// Pure-ish: html text -> the CSS text chunks that page ships. No file IO beyond what main() hands in,
// so the selftest feeds it strings. Returns style-block bodies + inline style-attribute VALUES; linked
// <link rel=stylesheet> files are resolved/read by pageCssText() below, not here.
// ---------------------------------------------------------------------------
export function cssTextsOf(rawHtml) {
  const html = scrub(rawHtml);
  const chunks = [];
  for (const m of html.matchAll(STYLE_BLOCK_RE)) chunks.push(m[1]);
  for (const m of html.matchAll(STYLE_ATTR_RE)) chunks.push(m[1] ?? m[2] ?? m[3]);
  return chunks;
}

const scrub = (rawHtml) =>
  rawHtml
    .replace(COMMENT_RE, blank)
    .replace(NON_CSS_RAW_TEXT_RE, (_m, open, _tag, body, close) => open + blank(body) + close);

/**
 * Attribute values that are NOT `style=`, as REFERENCE-only text. SVG presentation attributes
 * (`stroke="var(--x)"`) paint through var() in both Chrome and WebKit, so they are real references;
 * none of them can DEFINE a custom property, which is why this text never feeds the definition set.
 */
export function refOnlyTextsOf(rawHtml) {
  const html = scrub(rawHtml);
  const styleSpans = [];
  for (const m of html.matchAll(STYLE_ATTR_RE)) styleSpans.push([m.index, m.index + m[0].length]);
  const chunks = [];
  for (const m of html.matchAll(ANY_ATTR_RE)) {
    if (styleSpans.some(([a2, b2]) => m.index >= a2 && m.index < b2)) continue;
    chunks.push(m[1] ?? m[2]);
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Pure: one joined CSS text string -> { defs:Set<string>, dangling: Array<{name:string}> }.
// defs = every `--name:` (a value assignment) in the text. dangling = every fallback-less var(--name)
// whose name is not a def. Names are matched/exposed WITHOUT the leading `--`.
// ---------------------------------------------------------------------------
export function classify(cssText, refOnlyText = '') {
  const defs = new Set();
  for (const m of cssText.matchAll(DEF_RE)) defs.add(m[1]);

  // Definitions come from cssText alone; references are hunted across both. Appending refOnlyText
  // AFTER cssText keeps every index in the fallback walk below valid for the combined string.
  const scanText = refOnlyText ? `${cssText}\n${refOnlyText}` : cssText;

  const dangling = [];
  for (const m of scanText.matchAll(VAR_RE)) {
    const name = m[1];
    // From the end of the name, find the first comma at the top level of THIS var() call. Nested
    // parentheses raise the depth; `)` at depth 0 closes this call. A top-level comma = there is a
    // fallback, so this reference is valid whether or not `name` is defined.
    let depth = 0;
    let hasFallback = false;
    for (let j = m.index + m[0].length; j < scanText.length; j++) {
      const c = scanText[j];
      if (c === '(') depth++;
      else if (c === ')') { if (depth === 0) break; depth--; }
      else if (c === ',' && depth === 0) { hasFallback = true; break; }
    }
    if (!hasFallback && !defs.has(name)) dangling.push({ name });
  }
  return { defs, dangling };
}

/** Convenience for the selftest: the sorted, de-duplicated dangling NAMES a full HTML page produced. */
export function findDangling(html) {
  const { dangling } = classify(cssTextsOf(html).join('\n'), refOnlyTextsOf(html).join('\n'));
  return [...new Set(dangling.map((d) => d.name))].sort();
}

const linkedCssHrefs = (html) => {
  const out = [];
  for (const tag of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = tagVal(tag[0], 'rel');
    if (!/\bstylesheet\b/i.test(rel || '')) continue;
    const href = tagVal(tag[0], 'href');
    if (href && /\.css(?:$|[?#])/i.test(href)) out.push(href);
  }
  return out;
};

const tagVal = (tag, name) => {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m && (m[1] ?? m[2] ?? m[3]);
};

// Root the linked stylesheet href at the scanned root for `/…` (Astro's emitted form) or the page's own
// directory for `./…`. Query/hash are stripped. A missing file is not this gate's error — a dead
// stylesheet is a different defect — so it is skipped rather than turned into a definitions-wide false
// negative.
const resolveCssPath = (href, pageFile, scanRoot) => {
  const clean = href.split('?')[0].split('#')[0];
  if (clean.startsWith('/')) return path.join(scanRoot, clean.slice(1));
  return path.resolve(path.dirname(pageFile), clean);
};

// All CSS a page ships: inline style blocks + inline style attributes + linked stylesheet files.
function pageCssText(raw, file, scanRoot) {
  const chunks = cssTextsOf(raw);
  for (const href of linkedCssHrefs(raw)) {
    const p = resolveCssPath(href, file, scanRoot);
    if (fs.existsSync(p)) chunks.push(fs.readFileSync(p, 'utf8'));
  }
  return chunks.join('\n');
}

// The one place the real run and the selftest both go through, so the scope proven in selftest is the
// scope main() runs: definitions from the page's CSS (inline + the stylesheets IT links), references
// from that CSS plus every non-style attribute value.
function pageDangling(raw, file, scanRoot) {
  return classify(pageCssText(raw, file, scanRoot), refOnlyTextsOf(raw).join('\n')).dangling;
}

/** The success sentence. Names the root it scanned and the count it scanned there — the count is the
 *  length of the array the loop really iterated, never the length of a target list (ADR-0019: a green is
 *  a claim, and so is the sentence next to it). */
export const successLine = (rel, pageCount) =>
  `dangling-css-var-check: ${pageCount} HTML page(s) scanned under ${rel}/, 0 references to custom ` +
  "properties that nothing on the same page defines (per-page: each page's own <style> blocks, style " +
  'attributes, other attribute values and the stylesheets that page links — never a dist/-wide union).';

function collectHtml(root) {
  const files = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.html')) files.push(full);
    }
  })(root);
  return files;
}

// ---------------------------------------------------------------------------
// Self-test: fixture HTML strings plus temp-dir file trees. NOTHING here reads, writes, or rebuilds
// dist/ or src/ — this gate runs after Build, and a verification step that regenerates the artifact
// voids every earlier gate's verdict in the same run (gh#38).
// ---------------------------------------------------------------------------
function selftest() {
  const page = (styleCss, body = '') =>
    `<!doctype html><html lang="th"><head><title>x</title><style>${styleCss}</style></head><body>${body}</body></html>`;

  // --- known-good: a real-shaped page. :root tokens, a scoped selector, and an inline style attribute
  // that both defines --page-accent and references --accent-gold (the exact shape the <main> element
  // emits). Everything resolves. ---
  const good = page(
    ':root{--color-bg:#fff;--accent-gold:#ffd27f;--accent-punch:#f89880;--color-text:#1a1a1a}' +
    'main{background:var(--color-bg);color:var(--color-text)}h1{border-color:var(--page-accent)}',
    '<main style="--page-accent: var(--accent-gold);">x</main>',
  );
  assert.deepEqual(findDangling(good), [], 'a real-shaped page (tokens + scoped rules + an inline style attribute defining --page-accent and referencing --accent-gold) reports zero dangling properties');
  console.log('PASS known-good: tokens + scoped rules + inline style attribute define & resolve with zero dangling');

  // --- REFUTE round 1 (2026-08-25) found four ways this gate was wrong. Each of the four fixtures
  // below FAILS on the pre-fix detector, so they are calibration, not decoration. ---

  // (1) SVG presentation attributes paint through var(). The nav arrow in GameLayout.astro emits
  // stroke="var(--color-line-strong)" on all six built game pages; scanning only style= made a token
  // rename invisible here — gate green, arrow unpainted.
  assert.deepEqual(
    findDangling(page(':root{--defined:#1a1a1a}', '<svg><path stroke="var(--color-line-strong)" fill="var(--defined)"/></svg>')),
    ['color-line-strong'],
    'a var() in an SVG presentation attribute is a reference: the undefined one is flagged, the defined one is not',
  );
  console.log('PASS presentation attributes: stroke="var(--undefined)" is flagged, fill="var(--defined)" is not — style= is not the only attribute that paints');

  // (2) A non-style attribute must never inject a DEFINITION. `\b` used to match data-style, so
  // data-style="--x:red" satisfied a real dangling var(--x) and turned the page green.
  assert.deepEqual(
    findDangling(page(':root{--ok:1}', '<div data-style="--masked:red" style="color:var(--masked)">x</div>')),
    ['masked'],
    'a --x: assignment in data-style is NOT a definition; the real reference to it stays dangling',
  );
  console.log('PASS definition source: data-style="--x:red" cannot define --x — the reference to it is still flagged (a `\\b` guard used to let this through)');

  // (3) The var() keyword is ASCII case-insensitive in CSS; the property name is not.
  assert.deepEqual(
    findDangling(page(':root{--ok:1}', '<div style="color:VAR(--shouty); border-color:Var(--mixed)">x</div>')),
    ['mixed', 'shouty'],
    'VAR(--x) and Var(--x) are references and are scanned; the name after them stays case-sensitive',
  );
  console.log('PASS keyword case: VAR(--x) and Var(--x) are scanned as references, while property NAMES stay case-sensitive');

  // (4) Case-sensitivity of the NAME, the other half of (3): --Foo and --foo are different
  // properties, so defining one must not satisfy a reference to the other.
  assert.deepEqual(
    findDangling(page(':root{--Foo:1}', '<div style="color:var(--foo)">x</div>')),
    ['foo'],
    '--Foo does not define --foo: custom-property names are case-sensitive',
  );
  console.log('PASS name case: --Foo does not satisfy var(--foo) — custom-property names stay case-sensitive');

  // --- positive control on THE gh#74 defect: the slug was interpolated where the accent NAME was
  // needed, emitting var(--accent-fortune) (no such token exists). Fallback-less and undefined -> red.
  // This is the exact historical bug; make the detector match it and this goes green. ---
  const planted = page(':root{--accent-gold:#ffd27f}main{border-color:var(--accent-fortune)}');
  assert.deepEqual(findDangling(planted), ['accent-fortune'], 'var(--accent-fortune) with no definition and no fallback must be the one property flagged');
  console.log('PASS positive control (gh#74 defect): var(--accent-fortune) — undefined, fallback-less — is flagged as the lone dangling property');

  // --- the fallback leg. var(--nope, red) must stay green; var(--nope) must go red. Also nested and
  // multi-argument fallbacks: var(--a, var(--b, 4px)) is green (both fallbacked), var(--a, var(--b)) is
  // red for --b only (--a is fallbacked, --b is not). ---
  assert.deepEqual(findDangling(page(':root{}a{color:var(--nope, red)}')), [], 'var(--nope, red) has a fallback and must NOT be dangling');
  assert.deepEqual(findDangling(page(':root{}a{color:var(--nope)}')), ['nope'], 'var(--nope) with no fallback and no definition IS dangling');
  assert.deepEqual(findDangling(page(':root{}a{color:var(--a, var(--b, 4px))}')), [], 'nested fallbacks var(--a, var(--b, 4px)): both names are fallbacked, neither is dangling');
  assert.deepEqual(findDangling(page(':root{}a{color:var(--a, var(--b))}')), ['b'], 'var(--a, var(--b)): --a is fallbacked (green) but --b is a fallback-less reference and is flagged');
  assert.deepEqual(findDangling(page(':root{}a{color:var( --x , 1px )}')), [], 'whitespace inside var() must not break fallback detection');
  console.log('PASS fallback leg: var(--nope, red) green / var(--nope) red / var(--a, var(--b, 4px)) green / var(--a, var(--b)) flags --b only / whitespace-tolerant');

  // --- constrained blocks and non-:root selectors are definitions. A `--x:` inside @media, @supports,
  // @container, or on a plain .card selector assigns a value in the page's own CSS, so a reference
  // anywhere on the page resolves to a DEFINITION, not nothing. ---
  assert.deepEqual(findDangling(page('@media(min-width:1px){.x{--in-media:red}}a{color:var(--in-media)}')), [], 'a --x: inside @media is a definition');
  assert.deepEqual(findDangling(page('@supports(display:grid){.x{--in-supports:red}}a{color:var(--in-supports)}')), [], 'a --x: inside @supports is a definition');
  assert.deepEqual(findDangling(page('@container (min-width:1px){.x{--in-container:red}}a{color:var(--in-container)}')), [], 'a --x: inside @container is a definition');
  assert.deepEqual(findDangling(page('.card{--in-scope:1px}a{color:var(--in-scope)}')), [], 'a --x: on a non-:root selector is a definition');
  console.log('PASS constrained blocks: --x: inside @media / @supports / @container and on a .card selector all count as definitions');

  // --- the @property edge, pinned as the documented decision. Registration is not an assignment, so a
  // fallback-less var(--reg) where --reg is @property-registered but never assigned IS flagged. This
  // repo ships zero @property (asserted next), so the edge is empty; the over-flag is documented in the
  // header as the fail-safe side. ---
  assert.deepEqual(findDangling(page('@property --reg{syntax:\'<color>\'}a{color:var(--reg)}')), ['reg'], '@property registration alone does not assign a value, so var(--reg) is still flagged (documented fail-safe)');
  console.log('PASS @property edge: registration is not a definition — var(--reg) against an @property-registered-but-unassigned property is flagged (documented)');

  // --- comments and non-CSS raw-text bodies must trip nothing (ADR-0019 rule 2), while a live var() in
  // a real <style> block still must. ---
  assert.deepEqual(findDangling('<!doctype html><html><body><!-- var(--nope) and <div style="--wonky"></div> --><style>:root{}a{color:red}</style></body></html>'), [], 'a var(--nope) mentioned only inside an HTML comment must trip nothing');
  assert.deepEqual(findDangling('<!doctype html><html><body><script type="application/ld+json">{"a":"var(--nope)"}</script><style>:root{}a{color:red}</style></body></html>'), [], 'var(--nope) as text inside a <script> raw-text body must trip nothing');
  assert.deepEqual(findDangling(page(':root{}a{color:var(--nope)}')), ['nope'], 'positive control: the same fallback-less var(--nope) inside a real <style> IS flagged');
  console.log('PASS comment/raw-text blanking: var(--nope) in an HTML comment or a <script> body is inert, the same token in a <style> block is flagged');

  // --- the two legs in a temp tree (never dist/, never src/): (a) the file walk finds only .html and
  // skips .txt; (b) the success line names the count === the walked array's length; (c) a linked
  // external .css file is READ and its definition resolves a reference (green), and a reference the
  // file does NOT define is still red — proving the external file is followed, not skipped. ---
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dangling-css-var-check-'));
  try {
    fs.mkdirSync(path.join(tmpDir, 'game', 'x'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'index.html'), good, 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'game', 'x', 'index.html'), planted, 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'notes.txt'), 'var(--nope)', 'utf8');
    const files = collectHtml(tmpDir);
    assert.equal(files.length, 2, 'the walk must find both nested .html files and skip .txt');
    console.log('PASS file walk: 2 nested .html found, .txt skipped — proven on a temp tree, never on dist/');

    assert.match(successLine('dist', 16), /16 HTML page\(s\) scanned under dist\//, 'the success line must name the root and the count');
    assert.ok(!successLine('dist', 16).includes('undefined'));
    console.log(`PASS success line names its root and count: "${successLine('dist', 16).slice(0, 70)}…"`);

    // Linked external stylesheet, both directions.
    const cssDir = path.join(tmpDir, 'linked');
    fs.mkdirSync(cssDir, { recursive: true });
    fs.writeFileSync(path.join(cssDir, 'theme.css'), ':root{--from-file:red}', 'utf8');
    const linkedPage = '<!doctype html><html><head><link rel="stylesheet" href="./theme.css"><style>:root{}a{color:var(--from-file)}</style></head><body></body></html>';
    assert.deepEqual(
      [...new Set(classify(pageCssText(linkedPage, path.join(cssDir, 'index.html'), cssDir)).dangling.map((d) => d.name))],
      [],
      'a definition inside a linked .css file must resolve a reference in the linking page (green proves the file was READ, not skipped)',
    );
    const linkedRed = '<!doctype html><html><head><link rel="stylesheet" href="./theme.css"><style>:root{}a{color:var(--nope-file)}</style></head><body></body></html>';
    assert.deepEqual(
      [...new Set(classify(pageCssText(linkedRed, path.join(cssDir, 'index.html'), cssDir)).dangling.map((d) => d.name))],
      ['nope-file'],
      'a reference no linked .css file defines must still be flagged',
    );
    console.log('PASS linked stylesheet: a .css definition resolves (green), a reference the linked file does not define is still red — the external leg is followed, and is NOT empty on the real artifact (dist/_astro/ ships .css bundles that most pages link)');

    // Real-run reference scope: main() must hunt references in the page CSS *and* in non-style
    // attribute values. It passed only the CSS text until gh#126, so an SVG stroke="var(--x)" was
    // pinned above via findDangling() and scanned in no real run. Same call shape as main()'s.
    const attrOnlyPage = page(':root{--ok:1}', '<svg><path stroke="var(--attr-only-nope)"/></svg>');
    const attrFile = path.join(tmpDir, 'attr', 'index.html');
    fs.mkdirSync(path.dirname(attrFile), { recursive: true });
    fs.writeFileSync(attrFile, attrOnlyPage, 'utf8');
    assert.deepEqual(
      [...new Set(pageDangling(fs.readFileSync(attrFile, 'utf8'), attrFile, tmpDir).map((d) => d.name))],
      ['attr-only-nope'],
      "the real-run path must scan non-style attribute values: a stroke=\"var(--x)\" reference nothing defines is red (it was invisible while main() passed only the page's CSS text)",
    );
    console.log('PASS real-run reference scope: the same helper main() calls flags stroke="var(--attr-only-nope)" — attribute references are scanned in the real run, not only in findDangling()');

    // --- The CI refusal, both ways, at run level (same argv, only CI differs): a positional root is a
    // local convenience and is refused under CI, so a narrowed run cannot counterfeit a real dist/ scan.
    // Both runs point at a temp tree; neither can touch dist/. ---
    const self = fileURLToPath(import.meta.url);
    const run = (env, args = [self, tmpDir]) => {
      try {
        return { status: 0, out: execFileSync(process.execPath, args, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
      } catch (e) {
        return { status: e.status, out: `${e.stdout || ''}${e.stderr || ''}` };
      }
    };
    // The temp tree holds `planted` (one dangling property), so a real scan of it must go RED — the
    // positive control that the argv path actually RUNS the detector, not just prints a green.
    const notCi = run({ ...process.env, CI: '' });
    assert.equal(notCi.status, 1, 'known-bad: the positional root must actually scan and flag the planted --accent-fortune');
    assert.match(notCi.out, /accent-fortune/, 'the narrowed run must name the planted property');
    const cleanRoot = path.join(tmpDir, 'cleanonly');
    fs.mkdirSync(cleanRoot, { recursive: true });
    fs.writeFileSync(path.join(cleanRoot, 'index.html'), good, 'utf8');
    const notCiClean = run({ ...process.env, CI: '' }, [self, cleanRoot]);
    assert.equal(notCiClean.status, 0, 'known-good: a clean positional root is allowed when CI is unset');
    assert.ok(notCiClean.out.includes(`under ${cleanRoot}/`), 'known-good: the printed green must name the narrowed root it actually scanned');
    const underCi = run({ ...process.env, CI: 'true' }, [self, cleanRoot]);
    assert.equal(underCi.status, 1, 'known-bad: a positional root must be REFUSED when CI is set');
    assert.ok(underCi.out.includes('refusing the positional root'), 'the refusal must say what it refused');
    assert.ok(!underCi.out.includes('HTML page(s) scanned'), 'the refusal must happen before any scan, so no green sentence is printed');
    console.log('PASS CI refusal calibrated both ways: CI unset -> narrowed root scanned (red on planted, green naming the clean root); CI=true -> refused before any scan');

    // --- Entry-point guard, the other direction: importing this module must not run the gate. ---
    const asImport = run({ ...process.env, CI: '' }, ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(self).href)})`]);
    assert.equal(asImport.status, 0, 'importing this module must not fail');
    assert.ok(!asImport.out.includes('HTML page(s) scanned'), 'importing this module must NOT run the gate');
    console.log('PASS entry-point guard: importing this module scans nothing, while the same file run as argv[1] above does');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true }); // ponytail: hermetic — no selftest path reads, writes or rebuilds dist/ or src/
  }
}

// ---------------------------------------------------------------------------
async function main() {
  if (process.argv.includes('--selftest')) return selftest();

  const arg = process.argv.slice(2).find((a) => !a.startsWith('--'));
  // A positional root is a local convenience only. Under CI it is a narrowing surface: pointed at any
  // clean directory this gate prints a green that reads exactly like a real dist/ scan (gh#46's claim
  // shape, on the argv axis). Refused rather than disclosed.
  if (arg && isCi()) {
    console.error(`::error::refusing the positional root '${arg}' because CI is set — this gate must scan the built artifact, and a narrowed root prints a green indistinguishable from a real dist/ scan`);
    process.exit(1);
  }
  const rel = arg || 'dist';
  const root = path.isAbsolute(rel) ? rel : path.join(repoRoot, rel);
  const files = collectHtml(root);
  if (!files.length) {
    console.error(`::error::${rel} contains no .html files — nothing was scanned, which is not the same as clean (ADR-0019: an inverted guard must count, not just exclude)`);
    process.exit(1);
  }

  let hitCount = 0;
  for (const file of files) {
    const shown = path.relative(repoRoot, file).split(path.sep).join('/');
    const raw = fs.readFileSync(file, 'utf8');
    const dangling = pageDangling(raw, file, root);
    for (const name of [...new Set(dangling.map((d) => d.name))].sort()) {
      console.error(`::error file=${shown}::${shown}: var(--${name}) references custom property --${name}, which no <style> block, inline style attribute, or linked stylesheet on this page defines`);
      hitCount++;
    }
  }
  if (hitCount) {
    console.error(`\n${hitCount} dangling custom-property reference(s) across ${files.length} page(s). A fallback-less var(--x) with no --x: definition on its own page.`);
    process.exit(1);
  }
  console.log(successLine(rel, files.length));
}

// Entry point only. Importing this module (a unit test against cssTextsOf / classify) must not fire a
// full gate as a side effect. Both sides are realpath()d before comparing; only a missing argv[1]
// (`node -e`, i.e. an import) skips — a realpath that throws on a real argv[1] runs main() anyway.
const isEntryPoint = () => {
  if (!process.argv[1]) return false;
  const canonical = (p) => pathToFileURL(fs.realpathSync(p)).href;
  try {
    return canonical(process.argv[1]) === canonical(fileURLToPath(import.meta.url));
  } catch {
    return true;
  }
};
if (isEntryPoint()) await main();