#!/usr/bin/env node
// Accent single-source gate over the SOURCE tree (src/**), gh#128. Fails when the accent colour is not
// the same value on every surface that carries it.
//
// WHAT THIS COVERS, AND WHAT ITS SIBLING COVERS. dangling-css-var-check answers one question about the
// built pages: does a referenced custom property resolve to ANYTHING. It cannot see this defect, because
// this defect resolves fine: someone points one surface at a DIFFERENT BUT VALID token, or pastes a
// DIFFERENT BUT VALID hex, and every name still exists, every value still paints, tsc is happy and the
// tests pass — the accent is simply two colours now. So:
//   · reference to an UNDEFINED property   -> dangling-css-var-check (built artifact). Not this gate.
//   · reference/copy of a DIFFERENT VALID  -> THIS gate (source tree). The gh#128 gap.
// The ADR-0033 class reached from the other side: the value IS in the canvas, it is just not the same
// value on all the surfaces.
//
// THE SOURCE OF TRUTH is the --accent-* block in src/styles/tokens.css. Every other surface either NAMES
// one of those tokens or COPIES its hex, and this gate checks both directions against that block.
//
// THE SURFACE SET IS DERIVED, NEVER LISTED (the gh#128 DoD box that kills a hand-written trio). Nothing
// below names a consuming file. The three classes are each a query over the owned src tree, so a fourth
// surface is covered the moment it appears — or flagged as unmapped, never silently uncovered:
//
//   CLASS V — VALUE COPIES. Any src file (tokens.css excepted) containing at least one accent hex is a
//   value copy: it duplicates the token's value instead of referencing the token. Today that query
//   returns the wheel's segment palette, the test that pins it, and the home page's hero-wheel <path>
//   fills — the third of which is exactly the surface a hand-written list of three would have missed.
//   Rule: a value copy must carry the WHOLE canonical accent set. Swap one member for another valid
//   token's value and that member's hex goes missing from the file -> red, naming the token whose value
//   was pasted instead. The known ceiling, stated because it is a real over-flag: a NEW surface that
//   legitimately copies only ONE accent hex reds here. That is fail-closed and the resolution is the one
//   this repo wants anyway — reference var(--accent-x) instead of pasting a hex. No file needs one hex
//   of a trio today.
//
//   CLASS N — NAMED PAIRS. Any object literal in the owned tree that pairs an `href` with an
//   `accent: 'var(--x)'`. The EXPECTED name per href is derived too: src/games/categories.ts maps each
//   category slug to an accent NAME (`accent: 'gold'` -> --accent-gold at /c/<slug>/), and
//   src/tools/manifest.ts gives the tools group its own href + accentVar. Point one nav pill at a
//   different valid token and the pair disagrees with the registry -> red. An href the registry does not
//   know is ALSO red (unmapped surface), which is what makes a fourth destination visible instead of
//   assumed.
//
//   CLASS M — MENTIONS. Every --accent-* name mentioned anywhere in the owned tree must be one the
//   tokens.css block defines. A new slot invented at a consumer, or a typo, reds here rather than
//   waiting for a build.
//
// ANTI-VOID. A query that returns nothing reads exactly like a pass (ADR-0019). This gate refuses a
// green unless it actually enumerated: >= 2 accent tokens, >= 1 value copy, >= 1 named pair. The counts
// it prints are the lengths of the arrays it really walked.
//
// ANTI-VOID, SECOND DIRECTION (gh#186, ADR-0056). The counts above are honest about what the queries
// found, and say nothing about whether the TEXT they ran on still contained the evidence. Comment
// stripping is textual and fails open, so a canonical accent hex could vanish before any query saw it
// and the gate would print its success line for a file it never audited — observed, both shapes. So
// conservationFailures() runs first, over the raw text, and a lost hex ABORTS the run (exit 2) before
// anything a reader could take as a verdict is printed. Not a banner note: a banner is what lets a
// reader trust a green. Its header names the set it enumerates and why this repo owns that one.
//
// PONYTAIL — text scan, no CSS/TS parser (same bargain as the sibling gates). Hex literals are matched
// as #[0-9a-fA-F]{3,8}; an accent expressed as rgb()/hsl() or split across template pieces would be
// invisible to CLASS V. Every accent in this repo is a plain hex in both the canvas and the tokens file,
// and a non-hex accent would be a diff worth a human eye.
//
//   node scripts/accent-single-source-check.mjs             -> audit src/**, exit non-zero on divergence
//   node scripts/accent-single-source-check.mjs --selftest  -> both-direction calibration on fixture text

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const SRC = path.join(repoRoot, 'src');
const TOKENS_REL = 'src/styles/tokens.css';
const EXT = new Set(['.ts', '.astro', '.mjs', '.css']);

const VERBATIM_LIFT_BASENAMES = new Set(['markup.html', 'style.css', 'main.js']);
/** src/play/<game-id>/<extractor output> — see the block at the files= call for why this exists. */
function isVerbatimLift(absPath) {
  const parts = absPath.split(path.sep);
  const i = parts.lastIndexOf('play');
  if (i < 1 || parts[i - 1] !== 'src') return false;
  if (parts.length !== i + 3) return false;
  return VERBATIM_LIFT_BASENAMES.has(parts[parts.length - 1]);
}

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
const ACCENT_TOKEN_RE = /--accent-([A-Za-z0-9_-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\b/g;
const ACCENT_MENTION_RE = /--accent-([A-Za-z0-9_-]+)/g;
const ANY_TOKEN_RE = /(--[A-Za-z0-9_-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\b/g;
// Single-level object literals only — a category entry (nested `seo: {}`) cannot match, and does not
// need to: it declares an accent NAME, and is read as the registry below, not as a consumer.
const OBJ_RE = /\{[^{}]*\}/g;

// COMMENTS ARE BLANKED BEFORE ANY QUERY RUNS, and this is load-bearing, not tidiness: a checker cannot
// tell use from mention, and this repo's comments discuss the gh#74/gh#85 defect by name
// (var(--accent-fortune), --accent-party — properties that deliberately do not exist) and cite token
// hexes in prose. Scanning prose made three comments look like three divergences on the first real run.
// Blanked: /* … */, <!-- … -->, and `//` to end of line — the last only where `//` is not preceded by
// `:`, so a `https://` URL does not blank the rest of its line. Offsets and line counts are preserved.
//
// THIS STRIPPER IS TEXTUAL AND IT FAILS OPEN, AND NO AMOUNT OF REGEX MAKES IT NOT (gh#186, ADR-0056).
// It is trying to enumerate "text that is a JS/CSS/HTML comment". That set belongs to the language
// grammars and to whoever writes the next file — not to this repo — so it cannot converge: a `/*` inside
// a string literal (`'src/*'`, a glob, a regex source) pairs with the next real `*/` ANYWHERE LATER and
// every live line between them is blanked. A canonical accent hex in that span stops existing, CLASS V
// never sees the file, and the gate prints its success line. Both shapes were observed greening.
// The answer is NOT another marker rule. It is the conservation check below, keyed on a set this repo
// really does own.
const blank = (m) => m.replace(/[^\n]/g, ' ');
export const stripComments = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/(^|[^:\w])\/\/[^\n]*/g, (m, pre) => pre + blank(m.slice(pre.length)));

/**
 * CONSERVATION — the gate asserts it actually audited the file, gh#186 / ADR-0056.
 *
 * THE SET IT ENUMERATES: the canonical `--accent-*` hex VALUES, parsed from src/styles/tokens.css on
 * every run. That set is owned by this repository — one file, in the tree, that this gate already reads
 * as its source of truth. It is not owned by a language grammar, so unlike "text that is a comment" it
 * converges, and it is derived rather than listed, so a fourth accent is covered the moment it lands.
 *
 * THE RULE: a canonical hex present in the RAW text and absent after stripComments() is hazard evidence
 * the gate silently lost. There is no exemption for "but it was a real comment" — a green printed for a
 * file whose accent evidence vanished is exactly the verdict gh#186 exists to forbid, and a canonical
 * hex sitting in prose is itself the value copy this gate wants moved to var(--accent-x). Fail-closed:
 * the caller aborts non-zero BEFORE printing anything a reader could take as a verdict (ADR-0056's
 * hard-require shape — an abort, never a banner note).
 *
 * Measured on the tree this landed against: 0 of 165 src files lose a canonical hex, so the rule costs
 * nothing today and only ever fires on new text.
 *
 * @param {{rel: string, text: string}[]} files raw, UNSTRIPPED text
 * @param {string[]} canonicalHexes lowercase `#rrggbb` values from the tokens block
 * @returns {string[]} one message per file that lost evidence; empty means the audit is trustworthy
 */
export function conservationFailures(files, canonicalHexes) {
  const out = [];
  for (const { rel, text } of files) {
    const raw = text.toLowerCase();
    const stripped = stripComments(text).toLowerCase();
    const lost = canonicalHexes.filter((h) => raw.includes(h) && !stripped.includes(h));
    if (lost.length) {
      out.push(
        `${rel}: ${lost.join(', ')} is present in this file and gone after comment-stripping, so every ` +
          `query below ran on text this gate cannot prove it read. Either the hex sits in prose (move it ` +
          `to var(--accent-x) — a hex in a comment is a value copy that no gate can single-source), or a ` +
          `\`/*\`, \`<!--\` or \`//\` inside a string literal is blanking live lines. This gate will not ` +
          `print a verdict for a file whose accent evidence it lost.`,
      );
    }
  }
  return out;
}

/** tokens.css text -> { accents: Map<name,hex>, byHex: Map<hex, name[]> } (names carry the `--`). */
export function parseTokens(css) {
  const accents = new Map();
  for (const m of css.matchAll(ACCENT_TOKEN_RE)) accents.set(`--accent-${m[1]}`, m[2].toLowerCase());
  const byHex = new Map();
  for (const m of css.matchAll(ANY_TOKEN_RE)) {
    const hex = m[2].toLowerCase();
    byHex.set(hex, [...(byHex.get(hex) || []), m[1]]);
  }
  return { accents, byHex };
}

/** categories.ts + manifest.ts text -> Map<href, expected accent token name>. */
export function parseRegistry(categoriesTs, manifestTs) {
  const reg = new Map();
  // `slug: {` … `accent: 'name'` — the slug is the nearest key opening a block above the accent line.
  const slugs = [...categoriesTs.matchAll(/^\s*([a-z][a-z0-9-]*):\s*\{/gim)].map((m) => ({ slug: m[1], at: m.index }));
  for (const m of categoriesTs.matchAll(/accent:\s*'([^']+)'/g)) {
    const owner = slugs.filter((s) => s.at < m.index).pop();
    if (owner) reg.set(`/c/${owner.slug}/`, `--accent-${m[1]}`);
  }
  const href = manifestTs.match(/href:\s*'([^']+)'\s*,\s*\n\s*accentVar:\s*'(--[A-Za-z0-9_-]+)'/);
  if (href) reg.set(href[1], href[2]);
  return reg;
}

/**
 * The audit. `files` = [{ rel, text }] for the owned src tree WITHOUT tokens.css.
 * Returns { errors: string[], counts: {tokens, valueCopies, namedPairs, mentions} }.
 */
export function audit(files, { accents, byHex }, registry) {
  const errors = [];
  const canonicalHexes = [...new Set(accents.values())];
  const hexOwner = new Map([...accents].map(([n, h]) => [h, n]));
  let valueCopies = 0;
  let namedPairs = 0;
  let mentions = 0;

  for (const { rel, text: raw } of files) {
    const text = stripComments(raw);
    const hexes = new Set([...text.matchAll(HEX_RE)].map((m) => m[0].toLowerCase()));

    // CLASS V
    if (canonicalHexes.some((h) => hexes.has(h))) {
      valueCopies++;
      const missing = canonicalHexes.filter((h) => !hexes.has(h));
      if (missing.length) {
        const strangers = [...hexes]
          .filter((h) => !canonicalHexes.includes(h) && byHex.has(h))
          .map((h) => `${h} (${byHex.get(h).join('/')})`);
        errors.push(
          `${rel}: copies accent values but is missing ${missing.map((h) => `${h} (${hexOwner.get(h)})`).join(', ')}. ` +
            `A surface that duplicates the accent trio must carry all of it — one member swapped for a different ` +
            `token's value ships two accents.` +
            (strangers.length ? ` Other tokens.css values present here: ${strangers.join(', ')}.` : ''),
        );
      }
    }

    // CLASS N
    for (const obj of text.matchAll(OBJ_RE)) {
      const body = obj[0];
      const hrefM = body.match(/href:\s*'([^']+)'/);
      const accentM = body.match(/accent\??:\s*'var\((--[A-Za-z0-9_-]+)\)'/);
      if (!hrefM || !accentM) continue;
      namedPairs++;
      const expected = registry.get(hrefM[1]);
      if (!expected) {
        errors.push(
          `${rel}: an accent pill for href '${hrefM[1]}' uses var(${accentM[1]}), but no registry entry ` +
            `(a category accent in src/games/categories.ts, or the tools group in src/tools/manifest.ts) owns that ` +
            `href — an unmapped surface cannot be proven single-sourced.`,
        );
      } else if (expected !== accentM[1]) {
        errors.push(
          `${rel}: href '${hrefM[1]}' paints var(${accentM[1]}) while its registry entry declares ${expected}. ` +
            `Both names exist, so no dangling-property gate can see this — the accent is simply two colours now.`,
        );
      }
    }

    // CLASS M
    for (const m of text.matchAll(ACCENT_MENTION_RE)) {
      mentions++;
      const name = `--accent-${m[1]}`;
      if (!accents.has(name)) {
        errors.push(`${rel}: mentions ${name}, which the ${TOKENS_REL} accent block does not define.`);
      }
    }
  }

  if (accents.size < 2) errors.push(`${TOKENS_REL}: fewer than 2 --accent-* tokens parsed (${accents.size}) — this gate enumerated nothing, which is not the same as clean.`);
  if (!valueCopies) errors.push('no value-copy surface found — the CLASS V query returned nothing, so its green proves nothing (ADR-0019).');
  if (!namedPairs) errors.push('no href+accent pair found — the CLASS N query returned nothing, so its green proves nothing (ADR-0019).');

  return { errors, counts: { tokens: accents.size, valueCopies, namedPairs, mentions } };
}

export const successLine = ({ tokens, valueCopies, namedPairs, mentions }) =>
  `accent-single-source-check: ${tokens} --accent-* token(s) in ${TOKENS_REL}, ${valueCopies} value-copy ` +
  `surface(s) carrying the whole set, ${namedPairs} href+accent pair(s) agreeing with the derived registry, ` +
  `${mentions} --accent-* mention(s) all defined. 0 divergence(s). Undefined properties are the built-artifact ` +
  "gate's job, not this one's.";

function collectSrc(root) {
  const out = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (EXT.has(path.extname(e.name))) out.push(full);
    }
  })(root);
  return out;
}

// ---------------------------------------------------------------------------
// Self-test: fixture TEXT only. Reads nothing under src/ or dist/, writes nothing, rebuilds nothing.
// ---------------------------------------------------------------------------
function selftest() {
  const tokensCss = ':root{--color-accent:#ffb703;--accent-gold:#ffd27f;--accent-punch:#f89880;--accent-sky:#7fd8e8;--color-text:#1a1a1a}';
  const parsed = parseTokens(tokensCss);
  assert.deepEqual([...parsed.accents], [['--accent-gold', '#ffd27f'], ['--accent-punch', '#f89880'], ['--accent-sky', '#7fd8e8']], 'the accent block is parsed as name -> hex, and --color-accent (a non-accent-* token) is not one of them');
  console.log('PASS token parse: the --accent-* trio is read from the tokens text, --color-accent is excluded');

  const categoriesTs = "export const categories = {\n  fortune: {\n    label: 'x',\n    accent: 'gold',\n    seo: { title: 't' },\n  },\n  party: {\n    label: 'y',\n    accent: 'punch',\n    seo: { title: 't' },\n  },\n};\n";
  const manifestTs = "export const toolsGroup = {\n  href: '/tools/',\n  accentVar: '--accent-sky',\n};\n";
  const registry = parseRegistry(categoriesTs, manifestTs);
  assert.deepEqual([...registry], [['/c/fortune/', '--accent-gold'], ['/c/party/', '--accent-punch'], ['/tools/', '--accent-sky']], 'the expected accent per href is DERIVED from the category record and the tools manifest — not listed here');
  console.log('PASS registry derivation: 3 href -> accent expectations derived from the category record + tools manifest');

  const palette = { rel: 'palette.ts', text: "export const P = ['#ffd27f', '#f89880', '#7fd8e8'] as const;" };
  const pills = {
    rel: 'chrome.astro',
    text:
      "const L = [\n  { label: 'a', href: '/c/fortune/', accent: 'var(--accent-gold)' },\n" +
      "  { label: 'b', href: '/c/party/', accent: 'var(--accent-punch)' },\n" +
      "  { label: 'c', href: '/tools/', accent: 'var(--accent-sky)' },\n];",
  };
  const good = audit([palette, pills], parsed, registry);
  assert.deepEqual(good.errors, [], 'known-good: a full value copy plus three pills that match the registry is clean');
  assert.equal(good.counts.valueCopies, 1, 'the value-copy count is the number of files the query really matched');
  assert.equal(good.counts.namedPairs, 3, 'the pair count is the number of href+accent objects really walked');
  console.log('PASS known-good: a complete value copy + 3 registry-matching pills -> 0 divergences, counts come from the walked arrays');

  // --- THE gh#128 DEFECT, both shapes. Each surface is pointed at a DIFFERENT BUT VALID value: every
  // name exists, every hex paints, and the undefined-property gate stays green on both. ---
  const divergedPill = { rel: 'chrome.astro', text: pills.text.replace('var(--accent-gold)', 'var(--accent-sky)') };
  const redN = audit([palette, divergedPill], parsed, registry);
  assert.equal(redN.errors.length, 1, 'exactly one divergence: the fortune pill now paints a valid token that is not its own');
  assert.match(redN.errors[0], /\/c\/fortune\/.*--accent-sky.*--accent-gold/, 'the red must name the href, the token it uses and the token the registry declares');
  console.log('PASS CLASS N red: a nav pill repointed at --accent-sky (a VALID token) is flagged against the derived registry');

  const divergedValue = { rel: 'palette.ts', text: palette.text.replace('#ffd27f', '#ffb703') };
  const redV = audit([divergedValue, pills], parsed, registry);
  assert.equal(redV.errors.length, 1, 'exactly one divergence: the palette lost the gold accent value');
  assert.match(redV.errors[0], /#ffd27f.*--accent-gold/, 'the red must name the missing accent value and its token');
  assert.match(redV.errors[0], /#ffb703 \(--color-accent\)/, 'the red must name the different-but-valid token value pasted in its place');
  console.log('PASS CLASS V red: one palette member swapped for #ffb703 (--color-accent, a VALID token value) is flagged, and the red names the substitute');

  const invented = { rel: 'x.astro', text: 'a{color:var(--accent-lime)}' };
  assert.match(audit([palette, pills, invented], parsed, registry).errors.join('\n'), /--accent-lime/, 'an --accent-* name the tokens block does not define is flagged');
  const unmapped = { rel: 'y.astro', text: "const L = [{ label: 'z', href: '/c/lucky/', accent: 'var(--accent-gold)' }];" };
  assert.match(audit([palette, pills, unmapped].concat(), parsed, registry).errors.join('\n'), /\/c\/lucky\/.*unmapped surface/, 'a fourth destination no registry entry owns is flagged, not silently accepted');
  console.log('PASS unmapped/invented: --accent-lime and an href no registry entry owns both red — a new surface is visible, never assumed covered');

  // --- USE vs MENTION. The comments in this repo name the historical undefined accents on purpose;
  // treating prose as code produced three divergences on this gate's first real run. Both directions
  // are pinned: the same token is inert in a comment and live one line down in code. ---
  const mentionOnly = { rel: 'prose.astro', text: '// emitting var(--accent-fortune), which nothing defines\n/* --accent-nope: #123456 */\n<!-- var(--accent-ghost) -->\n' };
  assert.deepEqual(audit([palette, pills, mentionOnly], parsed, registry).errors, [], 'an --accent-* name that appears only inside //, /* */ or <!-- --> prose must trip nothing');
  const mentionAndUse = { rel: 'prose.astro', text: `${mentionOnly.text}a{color:var(--accent-ghost)}\n` };
  assert.match(audit([palette, pills, mentionAndUse], parsed, registry).errors.join('\n'), /--accent-ghost/, 'positive control: the same name in real code, one line below the prose, IS flagged');
  assert.match(stripComments('a{color:url(https://x/y)}b{--accent-gold:1}'), /--accent-gold/, 'a `//` inside a URL must not blank the rest of the line');
  console.log('PASS use vs mention: --accent-* inside //, /* */ and <!-- --> prose is inert, the same name in code is flagged, and a https:// URL does not blank its line');

  // --- ANTI-VOID: the queries returning nothing must NOT read as a pass. ---
  const void1 = audit([{ rel: 'empty.ts', text: 'export const x = 1;' }], parsed, registry);
  assert.equal(void1.errors.length, 2, 'zero value copies and zero pairs must produce two refusals, not a green');
  assert.match(void1.errors.join('\n'), /CLASS V query returned nothing/, 'the refusal must say which query enumerated nothing');
  const noTokens = audit([palette, pills], parseTokens(':root{--color-text:#1a1a1a}'), registry);
  assert.match(noTokens.errors.join('\n'), /fewer than 2 --accent-\* tokens/, 'a tokens block with no accents must refuse rather than pass on an empty canonical set');
  console.log('PASS anti-void: empty CLASS V / CLASS N queries and an accent-less tokens block all refuse instead of printing a green');

  // --- CONSERVATION (gh#186). Both directions, because a guard that has never been observed failing is
  // measuring nothing. The hazard is a canonical hex that stripComments() blanks: audit() then walks a
  // file with no accent evidence in it, finds nothing to complain about, and the run greens. Pinned here
  // as the pre-fix behaviour it replaces, so a later "simplification" of the stripper cannot restore it. ---
  const canonical = [...new Set(parsed.accents.values())];
  const inBlockComment = { rel: 'hazard.css', text: '.x{\n/* the hero fill is\n   #ffd27f today */\n  color: red;\n}\n' };
  // The stripper's OTHER direction: `/*` inside a string literal pairs with the next real `*/` further
  // down the file, so the live line between them — hex and all — is blanked. Nothing in the text is a
  // comment; the regex only thinks so.
  const inStringGlob = { rel: 'hazard.ts', text: "const glob = 'src/*';\nexport const HERO = '#ffd27f';\n/* note */\n" };
  for (const hz of [inBlockComment, inStringGlob]) {
    assert.ok(hz.text.toLowerCase().includes('#ffd27f'), `${hz.rel}: the fixture must really carry the canonical hex, or this pin proves nothing`);
    assert.ok(!stripComments(hz.text).toLowerCase().includes('#ffd27f'), `${hz.rel}: positive control — stripComments() must really lose the hex here, else the pin below is unfailable by construction`);
    assert.deepEqual(audit([palette, pills, hz], parsed, registry).errors, [], `${hz.rel}: pre-fix behaviour, pinned: audit() alone reports ZERO divergences on a file whose accent evidence it never saw — that green is the gh#186 defect`);
    assert.equal(conservationFailures([hz], canonical).length, 1, `${hz.rel}: the conservation check must refuse the run — a hex present in raw and gone after stripping means the gate did not audit this file`);
    assert.match(conservationFailures([hz], canonical)[0], /#ffd27f.*gone after comment-stripping/, 'the refusal must name the hex it lost, not just say something went wrong');
  }
  console.log('PASS conservation red, both shapes: a canonical hex lost to a cross-line /* */ AND to a string-borne `/*` each refuse the run, where audit() alone printed a green');

  // The other direction — the check must not fire on ordinary text, or it is a gate nobody can keep green.
  assert.deepEqual(conservationFailures([palette, pills, mentionOnly], canonical), [], 'a full value copy, registry-matching pills, and comments that mention --accent-* names but no canonical hex must all conserve');
  const urlLine = { rel: 'url.css', text: '/* docs: https://example.test/x */\n.hero{color:#ffd27f;border-color:#f89880;outline-color:#7fd8e8}\n' };
  assert.deepEqual(conservationFailures([urlLine], canonical), [], 'a `//` inside a https:// URL must not blank the hexes on the lines after it');
  assert.match(stripComments(urlLine.text), /#ffd27f/, 'same input from the stripper side: the URL line is not treated as a line comment');
  console.log('PASS conservation green: clean files, prose that mentions --accent-* names, and a https:// URL beside real hexes all conserve — the check is not simply always-red');

  assert.ok(!successLine(good.counts).includes('undefined,'), 'the success line must not interpolate an undefined count');
  assert.match(successLine(good.counts), /1 value-copy surface\(s\).*3 href\+accent pair\(s\)/, 'the success line must name the counts it actually walked');
  console.log('PASS success line names the counts it walked and distinguishes itself from the undefined-property gate');
}

// ---------------------------------------------------------------------------
function main() {
  if (process.argv.includes('--selftest')) return selftest();

  const tokensPath = path.join(repoRoot, TOKENS_REL);
  const read = (rel) => stripComments(fs.readFileSync(path.join(repoRoot, rel), 'utf8'));
  const parsed = parseTokens(stripComments(fs.readFileSync(tokensPath, 'utf8')));
  const registry = parseRegistry(read('src/games/categories.ts'), read('src/tools/manifest.ts'));
  // VERBATIM LIFTS. ADR-0048 exempts a ported game from ADR-0033's design canvas, and these files ARE
  // the port: scripts/extract-mockup.mjs writes them byte-for-byte out of a standalone mockup that
  // carries its own palette (--accent-cyan, --accent-amber, --accent-crimson and their glows — 44
  // mentions this gate has no definition for, because it never had one to single-source FROM).
  // Rewriting them to this site's three accents would be exactly the invention ADR-0048 forbids, and
  // would break the diff against the mockup that makes re-extraction meaningful.
  // Scoped to the three filenames the extractor writes, NOT to the directory: roster-bridge.ts and
  // overrides.css live beside them, are agent-authored, and stay audited. Same predicate and same
  // reasoning as scripts/thai-comments.mjs.
  const all = collectSrc(SRC).filter((f) => f !== tokensPath);
  const liftedRel = all.filter(isVerbatimLift).map((f) => path.relative(repoRoot, f).split(path.sep).join('/'));
  const files = all
    .filter((f) => !isVerbatimLift(f))
    .map((f) => ({ rel: path.relative(repoRoot, f).split(path.sep).join('/'), text: fs.readFileSync(f, 'utf8') }));

  // ABORT BEFORE ANY VERDICT. conservationFailures() answers "did this gate actually read these files",
  // which is a different question from "are they clean" — so it exits on its own code and never reaches
  // the divergence report below. See the function's header for the set it enumerates and who owns it.
  const lostEvidence = conservationFailures(files, [...new Set(parsed.accents.values())]);
  if (lostEvidence.length) {
    for (const e of lostEvidence) console.error(`::error::${e}`);
    console.error(
      `\n${lostEvidence.length} file(s) lost accent evidence to comment-stripping. This gate did NOT audit them ` +
        'and is refusing to print a pass or a fail for the run (gh#186, docs/adr/0056). Fix the FILE — move the ' +
        'canonical hex out of the comment, or out of the string that pairs with a later comment closer. Do NOT ' +
        '"fix" stripComments() to be smarter: ADR-0056 rejected bounding a set the language grammar owns, and ' +
        "this file's own selftest pins the stripper losing the hex as its positive control, so a parser-backed " +
        'rewrite would red the pin that proves this abort can fire.',
    );
    process.exit(2);
  }

  const { errors, counts } = audit(files, parsed, registry);
  if (errors.length) {
    for (const e of errors) console.error(`::error::${e}`);
    console.error(`\n${errors.length} accent divergence(s) across ${files.length} src file(s). The accent is single-sourced from ${TOKENS_REL}; a different-but-valid token or hex on one surface is the defect this gate exists to reject.`);
    process.exit(1);
  }
  // A green that does not name its exemptions reads as coverage it did not earn (ADR-0019), and this
  // one now skips whole files rather than lines. Paths, not a count, so a reader can check each is
  // really an extractor output rather than something that drifted in beside them.
  console.log(
    successLine(counts) +
      (liftedRel.length
        ? ` NOT AUDITED, verbatim third-party lifts under ADR-0048: ${liftedRel.join(', ')}.`
        : ''),
  );
}

main();
