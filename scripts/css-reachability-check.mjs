#!/usr/bin/env node
// Build-time gate (gh#134): every per-game stylesheet on disk is imported if and only if its game is
// registered in the manifest.
//
// THE INVARIANT, a biconditional over every `src/styles/games/<id>.css` that exists on disk:
//
//     the sheet is imported somewhere under src/   <=>   <id> is a game in src/games/manifest.ts
//
// Both directions are real defects, and each fails a different way:
//   IMPORTED BUT NOT REGISTERED — the defect this gate was written for. The commit that delisted
//     love-match (601d498) removed the game from the manifest and left its import in
//     src/pages/game/[id].astro. A bare CSS import there is PAGE-GLOBAL, so ~1.1KB of rules shipped
//     to every live game page with no page left to consume them. Nothing was red: the build is
//     happy, the bytes are valid CSS, and no test reads dist for orphan rules.
//   REGISTERED BUT NOT IMPORTED — the mirror, and the reason this gate is a biconditional rather
//     than a one-way orphan scan. Re-register a game without restoring its import and the page
//     builds, mounts, and ships UNSTYLED. src/pages/game/[id].astro's own comment states the rule
//     ("Re-add this import in the same change that puts the game back in the manifest, never before
//     it") — this is the check that makes that sentence enforceable rather than advisory.
//
// NO ALLOWLIST, and none may be added — the domain does the work an allowlist would:
//   - a sheet that is NEITHER registered nor imported PASSES. That is love-match today: delisted,
//     import removed, sheet kept on disk on purpose so gh#101 rebuilds from it. The state is
//     correct, so the gate must be silent about it, and it must go red the moment either half moves
//     without the other.
//   - a registered game with NO sheet on disk is outside the domain entirely (the loop is over
//     sheets, not games). That is pick-loser, whose `.pl-*` rules live in the is:global block of
//     src/pages/game/[id].astro. Adding it to an exemption list would be recording a fact the
//     filesystem already states.
//
// HOW THE REGISTERED SET IS READ: by IMPORTING src/games/manifest.ts with node and reading
// `games.map(g => g.id)`, exactly as scripts/validate-games.mjs does — the manifest spells the full
// `.ts` extension on every game import so node's ESM resolver needs no hook, and the
// check-node-version gate guarantees the Node >= 22 type stripping this relies on. The manifest is
// NOT parsed as text: game modules are full of unrelated `id:` fields (`close`, `far`, `locked`,
// `tring`, `template`), so a regex sweep for `id:` returns garbage, and a regex over the manifest's
// own import list would read the delisted game's comment as a registration.
//
// IMPORTS ARE READ OFF AN AST, NOT MATCHED IN TEXT, and that is load-bearing: a checker cannot tell
// use from mention, and the live tree contains the exact mention that breaks a naive matcher — the
// comment in src/pages/game/[id].astro names love-match.css in prose while explaining why it is
// deliberately not imported. The first version of this gate blanked comments with regexes first, and
// that is the defect this shape removes rather than patches: `/\/\*[\s\S]*?\*\//` is not string-aware,
// so an unclosed `/*` inside a STRING literal blanked every line up to the next `*/` and swallowed
// the real import statements in between. Reproduced at run level in the real tree, and the gate exited
// 0 while an orphaned import sat in it — a false green in the exact direction this gate exists to
// catch. So no text is stripped at all: JS-family files are parsed with the TypeScript compiler and
// only `ImportDeclaration` / dynamic-`import()` module specifiers are read; a parser cannot confuse a
// string with a comment, so the whole class is gone, not narrowed. `.astro` frontmatter and `<script>`
// bodies go through the same AST pass after @astrojs/compiler locates them, the way
// scripts/thai-comments.mjs does for the same reason (its header states it: a regex cannot tell
// comments from strings). Both packages are already dependencies. The ONE path still on a regex is a
// stylesheet's own `@import`, and that is why the two paths differ: CSS has no comparable ambiguity in
// the direction that matters. The swallowing shape needs a string literal that opens a comment and a
// later `*/`, which is JS-specific here; what CSS can still do is name an `@import` inside a comment,
// and that reads as an import — i.e. it can red a correct tree, never green one, and no sheet in
// src/styles/games/ contains an `@import` at all today.
//
// WHAT THIS GATE DOES NOT COVER, stated so a green is not read as more than it is:
//   - CSS inside `<style>` / `<style is:global>` blocks. Those rules are not a file in
//     src/styles/games/, so they are neither a sheet nor an import here — pick-loser's whole
//     visual lives there and is invisible to this check.
//   - any CSS outside src/styles/games/ — src/styles/tokens.css, component-scoped styles, dist.
//   - dead rules INSIDE a sheet that is legitimately imported. This gate proves a sheet has a page
//     that can consume it; it says nothing about whether every selector in it matches anything.
//   - a sheet reached by an import shape the AST pass cannot resolve to a literal specifier — a
//     computed dynamic `import(someVar)`, a specifier built by concatenation, a `<link href>` in
//     markup, a sheet pulled in by a bundler config. Those read as NOT-imported, and that is NOT
//     uniformly safe: on the registered half it reds a correct tree (loud, and someone fixes it), but
//     on the UNregistered half it reads as "dormant on purpose" and passes — so an orphaned import
//     whose specifier is computed would ship silently. An earlier version of this header claimed this
//     direction "fails CLOSED, never open"; that was false in two ways and is not restated here.
//     Every import of a per-game sheet in the tree today is a literal specifier, which is what makes
//     the ceiling narrow rather than absent.
//   - transitive reach: "imported somewhere under src/" is ONE HOP. A sheet reached only by another
//     sheet's `@import` counts as imported even if that second sheet is itself dormant, so a dormant
//     pair could vouch for each other. No `@import` exists in any sheet today, so the set this would
//     mis-grade is empty; transitive resolution is deliberately not built.
//
//   node scripts/css-reachability-check.mjs             -> audit the real tree, exit 1 on violations
//   node scripts/css-reachability-check.mjs --selftest   -> both-direction calibration, fixture text only

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { parse as parseAstro } from '@astrojs/compiler';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const SHEETS_REL = 'src/styles/games';
const SRC_REL = 'src';
const MANIFEST_REL = 'src/games/manifest.ts';

// Every file kind under src/ that can carry a CSS import: .astro frontmatter and its <style> blocks,
// TS/JS islands, and a stylesheet's own @import. Widened deliberately past src/pages/ — a component
// or layout import is page-global too, and scanning only pages would make "component-reached CSS" a
// standing hole this gate could not see.
const SCAN_EXT = new Set(['.astro', '.ts', '.tsx', '.js', '.mjs', '.css']);

// A stylesheet's own `@import`, quoted or url()-wrapped. The one regex left; see the header for why
// this path differs from the AST path.
const CSS_AT_IMPORT_RE = /@import\s+(?:url\(\s*)?['"]([^'"\n]+\.css)['"]/g;

const SCRIPT_KIND = { '.ts': ts.ScriptKind.TS, '.tsx': ts.ScriptKind.TSX, '.js': ts.ScriptKind.JS, '.mjs': ts.ScriptKind.JS };

/**
 * Module specifiers this JS-family text imports, read off the AST: static `ImportDeclaration`s and
 * dynamic `import('...')` calls with a literal argument. A parser cannot mistake a string for a
 * comment or a comment for code, so a prose mention of a sheet yields no node at all, and
 * `readFileSync(new URL('../styles/games/love-match.css', import.meta.url))` yields a plain string
 * argument that is not a module specifier.
 * ts.createSourceFile is error-tolerant by design and never throws, so a file mid-edit degrades to
 * fewer nodes rather than crashing the gate — which is the fail-red direction on the registered half.
 */
function jsSpecifiers(text, scriptKind) {
  const sf = ts.createSourceFile('scan.ts', text, ts.ScriptTarget.Latest, /* setParentNodes */ false, scriptKind);
  const out = [];
  (function walk(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) out.push(node.moduleSpecifier.text);
    else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteralLike(arg)) out.push(arg.text);
    }
    ts.forEachChild(node, walk);
  })(sf);
  return out;
}

const cssSpecifiers = (text) => [...text.matchAll(CSS_AT_IMPORT_RE)].map((m) => m[1]);

/**
 * .astro: @astrojs/compiler locates the two places code can live — frontmatter and a `<script>` body
 * — and each goes through the same AST pass. `<style>` children go through the CSS path. Markup,
 * attributes and HTML comments carry no import and are never scanned, so the live page's prose
 * mention of a delisted sheet is not merely stripped, it is never looked at.
 */
async function astroSpecifiers(text) {
  const { ast } = await parseAstro(text);
  const out = [];
  (function walk(node) {
    if (node.type === 'frontmatter') return void out.push(...jsSpecifiers(node.value ?? '', ts.ScriptKind.TS));
    if (node.type === 'element' && (node.name === 'script' || node.name === 'style')) {
      for (const c of node.children ?? []) {
        if (c.type !== 'text') continue;
        out.push(...(node.name === 'script' ? jsSpecifiers(c.value ?? '', ts.ScriptKind.TS) : cssSpecifiers(c.value ?? '')));
      }
      return;
    }
    for (const c of node.children ?? []) walk(c);
  })(ast);
  return out;
}

// The directory segment a specifier must end with to be one of OUR sheets, mirroring SHEETS_REL.
// Matching on the path segment rather than the bare basename keeps a same-named sheet from some other
// directory out of the domain.
const SHEET_SPEC_RE = /(?:^|\/)styles\/games\/([\w-]+)\.css$/;

/**
 * Sheet ids (`<id>` of `<id>.css`) this ONE file's text imports. `ext` picks the parser, so the
 * caller's filename decides the grammar instead of the text being guessed at.
 * async only because @astrojs/compiler's parse is; the JS and CSS paths are synchronous inside.
 */
export async function importedSheetsIn(text, ext = '.ts') {
  const specs =
    ext === '.astro' ? await astroSpecifiers(text) : ext === '.css' ? cssSpecifiers(text) : jsSpecifiers(text, SCRIPT_KIND[ext] ?? ts.ScriptKind.TS);
  const found = new Set();
  for (const spec of specs) {
    const hit = SHEET_SPEC_RE.exec(spec.replace(/\\/g, '/'));
    if (hit) found.add(hit[1]);
  }
  return found;
}

/**
 * The biconditional, pure: sheet ids on disk x registered ids x imported ids -> violation strings.
 * Sets in, strings out, no IO, so the selftest calibrates the RULE without a fixture tree.
 */
export function audit(sheetIds, registeredIds, importedIds) {
  const sheets = [...sheetIds].sort();
  const errors = [];
  // docs/adr/0019: every rule below is per-sheet, so an empty domain satisfies all of them
  // vacuously and the success line prints a green having checked nothing. Both inputs are guarded:
  // with zero sheets there is nothing to grade, and with zero registered games every sheet reads as
  // legitimately dormant, which turns the whole biconditional into a no-op that cannot fail.
  if (sheets.length === 0) {
    errors.push(
      `${SHEETS_REL}: no .css file found — the checked set must never be empty (docs/adr/0019), or every ` +
        'per-sheet rule passes vacuously and this gate reports clean having graded nothing. A renamed or ' +
        'moved styles directory looks exactly like this.',
    );
  }
  if (registeredIds.size === 0) {
    errors.push(
      `${MANIFEST_REL}: \`games\` yielded no ids — the registered set must never be empty (docs/adr/0019): ` +
        'with no games every sheet on disk reads as deliberately dormant, both directions of the ' +
        'biconditional go silent, and a failed manifest import is indistinguishable from a clean tree.',
    );
  }
  if (errors.length) return { errors, counts: { sheets: 0, live: 0, dormant: 0 } };

  let live = 0;
  let dormant = 0;
  for (const id of sheets) {
    const registered = registeredIds.has(id);
    const imported = importedIds.has(id);
    if (registered && imported) live++;
    else if (!registered && !imported) dormant++;
    else if (imported) {
      errors.push(
        `${SHEETS_REL}/${id}.css is imported under ${SRC_REL}/ but "${id}" is not registered in ${MANIFEST_REL} — ` +
          'a bare CSS import is page-global, so every rule in this sheet ships to every live game page with ' +
          'no page left to consume it (the 601d498 defect). Remove the import in the same change that ' +
          'delists the game, or re-register the game.',
      );
    } else {
      errors.push(
        `"${id}" is registered in ${MANIFEST_REL} but ${SHEETS_REL}/${id}.css is imported nowhere under ${SRC_REL}/ — ` +
          'the page builds and mounts UNSTYLED. Re-add the import in the same change that registers the game, ' +
          'never after it; if the rules genuinely live inline, delete the sheet so it leaves this domain.',
      );
    }
  }
  return { errors, counts: { sheets: sheets.length, live, dormant } };
}

/** Every scannable file under `dir` (never called with repoRoot — the walk root is src/). */
function collectSrc(dir) {
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (SCAN_EXT.has(path.extname(e.name))) out.push(full);
    }
  })(dir);
  return out;
}

function successLine(counts) {
  return (
    `css-reachability-check: ${counts.sheets} per-game stylesheet(s) checked in ${SHEETS_REL} — ` +
    `${counts.live} registered AND imported, ${counts.dormant} registered by nobody and imported by nobody (dormant on purpose), ` +
    `read from ${counts.files} file(s) under ${SRC_REL}/ and ${counts.games} manifest game(s). ` +
    'NOT covered: CSS in <style>/is:global blocks (pick-loser\'s rules live there), any CSS outside ' +
    `${SHEETS_REL}, dead rules inside a sheet that IS imported, an import whose specifier is not a literal ` +
    'string (a computed import() reads as not-imported, which passes silently on the unregistered half), and ' +
    'transitive reach — "imported" is ONE HOP, so a sheet reached only by another dormant sheet\'s @import ' +
    'would count as reached (no sheet contains an @import today).'
  );
}

// ---------------------------------------------------------------------------
// Self-test: fixture SETS for the rule and fixture TEXT for the scanner, plus one read-only pin on
// the live page that carries the prose mention. Writes nothing, rebuilds nothing.
// ---------------------------------------------------------------------------
async function selftest() {
  const S = (...xs) => new Set(xs);

  // --- scanner calibration, both directions. The known-good half matters as much as the known-bad:
  // a matcher that finds nothing would make every "imported" test below vacuous. ---
  const pageText = [
    '---',
    '// love-match.css is deliberately NOT imported while gh#101 keeps the game delisted.',
    "import '../../styles/games/timebomb.css';",
    "await import('../../styles/games/siamsi.css');",
    '/* daily-fortune.css is named in a block comment too */',
    "const raw = readFileSync(new URL('../styles/games/love-match.css', import.meta.url), 'utf8');",
    '---',
    '<!-- and short-stick.css in markup prose -->',
    '<p>pick-loser.css named in template text</p>',
  ].join('\n');
  assert.deepEqual(
    [...await importedSheetsIn(pageText, '.astro')].sort(),
    ['siamsi', 'timebomb'],
    'only the static and dynamic import statements count: a sheet named in a //, /* */ or <!-- --> comment, in template text, or passed to readFileSync, are mentions, not imports',
  );
  assert.deepEqual([...await importedSheetsIn("import s from './styles/games/timebomb.css';", '.ts')], ['timebomb'], 'the default-binding form counts as an import too');
  assert.deepEqual([...await importedSheetsIn("@import url('styles/games/siamsi.css');\n.a { color: red }", '.css')], ['siamsi'], "a stylesheet's own @import url() counts as an import");
  assert.deepEqual([...await importedSheetsIn("import '../styles/tokens.css';", '.ts')], [], 'a CSS import from outside styles/games/ is not one of this domain\'s sheets');
  console.log('PASS calibration: the import scanner finds real imports of a per-game sheet and no prose mention of one — the live page comment that names a delisted sheet must never read as an import');

  // --- the regression that killed the regex version, pinned: an UNCLOSED `/*` inside a string
  // literal. The old scanner blanked from it to the next `*/` and swallowed the import between the
  // two, exiting 0 with an orphaned import in the tree. Reproduced at run level before this leg was
  // written, and this leg was driven RED against that implementation before it was trusted. Parsing
  // instead of stripping is what makes it green; there is nothing left to strip. ---
  const swallowed = ["const a = 'x /* y';", "import '../../styles/games/love-match.css';", "const b = '*/';", 'void a; void b;'].join('\n');
  assert.deepEqual([...await importedSheetsIn(swallowed, '.ts')], ['love-match'], 'an unclosed /* inside a STRING literal must not swallow the real import statement after it');
  assert.deepEqual([...await importedSheetsIn(['---', swallowed, '---'].join('\n'), '.astro')], ['love-match'], 'and the same shape inside .astro frontmatter, which routes through the same AST pass');
  console.log('PASS comment-vs-string: an unclosed /* inside a string literal hides no import, in .ts and in .astro frontmatter — the shape that made the regex version print a green over an orphaned import');

  // --- known-good: the shipped shape. Two registered+imported sheets, one dormant sheet, and a
  // registered game with no sheet at all. ---
  assert.deepEqual(
    audit(S('timebomb', 'siamsi', 'love-match'), S('timebomb', 'siamsi', 'pick-loser'), S('timebomb', 'siamsi')).errors,
    [],
    'the shipped shape must report zero violations: registered+imported sheets, a dormant sheet, and a registered game whose rules are inline',
  );
  console.log('PASS known-good: registered AND imported passes, a sheet that is neither passes, and a registered game with no sheet on disk is outside the domain (no allowlist needed)');

  // --- known-bad, direction 1: imported but not registered (the 601d498 defect). ---
  const orphan = audit(S('timebomb', 'love-match'), S('timebomb'), S('timebomb', 'love-match')).errors;
  assert.equal(orphan.length, 1, `imported-but-unregistered must produce exactly one violation, got: ${JSON.stringify(orphan)}`);
  assert.match(orphan[0], /love-match\.css/, 'the violation must name the sheet');
  assert.match(orphan[0], /not registered/, 'and must say the game is not registered');

  // --- known-bad, direction 2: registered but not imported (ships unstyled). ---
  const unstyled = audit(S('timebomb', 'love-match'), S('timebomb', 'love-match'), S('timebomb')).errors;
  assert.equal(unstyled.length, 1, `registered-but-unimported must produce exactly one violation, got: ${JSON.stringify(unstyled)}`);
  assert.match(unstyled[0], /love-match\.css/, 'the violation must name the sheet');
  assert.match(unstyled[0], /UNSTYLED/, 'and must say the page would ship unstyled');
  console.log('PASS known-bad both directions: an imported sheet whose game is unregistered fails, and a registered game whose sheet is unimported fails — the two halves of the biconditional are checked independently');

  // --- known-bad, EMPTY DOMAIN (docs/adr/0019): every rule above is per-sheet, so zero sheets
  // satisfies all of them vacuously and the success line would print "0 stylesheet(s) checked" as a
  // green. Zero sheets is a broken scan, not a clean tree. Delete the guard and these go green. ---
  const noSheets = audit(S(), S('timebomb'), S('timebomb')).errors;
  assert.equal(noSheets.length, 1, 'an empty sheet set must produce exactly one violation');
  assert.match(noSheets[0], /never be empty/, 'the violation must say the checked set was empty');
  const noGames = audit(S('timebomb'), S(), S()).errors;
  assert.ok(
    noGames.some((e) => /never be empty/.test(e)),
    `an empty registered set must fail too — with no games, every sheet reads as legitimately dormant and the whole biconditional collapses, got: ${JSON.stringify(noGames)}`,
  );
  console.log('PASS known-bad empty sets: zero sheets and zero registered games each fail — a per-sheet rule set is satisfied vacuously by an empty domain, and "0 checked" is a green nothing earned');

  // --- the live trap, pinned read-only: the real page's real comment, through the real scanner. ---
  const livePage = fs.readFileSync(path.join(repoRoot, 'src/pages/game/[id].astro'), 'utf8');
  const liveImports = await importedSheetsIn(livePage, '.astro');
  assert.ok(liveImports.has('timebomb'), 'the scanner must find the real timebomb.css import in the live page — if it finds nothing, every other leg here is measuring nothing');
  // ponytail: there is deliberately NO `!liveImports.has('love-match')` assertion here. It asserted
  // the very condition the gate measures, so it was circular; and because both executors invoke this
  // as `--selftest && <real run>`, it made the required positive control impossible — on a tree where
  // love-match genuinely IS imported (the 601d498 state) the selftest reds first and the real check
  // never runs, so a green could never be shown to come from a working detector. Its stated purpose,
  // "a prose mention is not read as an import", is covered by the fixture leg above, which asserts it
  // on text this gate owns rather than on tree state that is allowed to change.
  console.log('PASS live pin: against the real src/pages/game/[id].astro, a genuine import is found — the apparatus is alive on real repo content');
}

async function main() {
  const sheetsDir = path.join(repoRoot, SHEETS_REL);
  const sheetIds = new Set(
    fs
      .readdirSync(sheetsDir)
      .filter((f) => path.extname(f) === '.css')
      .map((f) => path.basename(f, '.css')),
  );

  let games;
  try {
    ({ games } = await import(path.join(repoRoot, MANIFEST_REL)));
  } catch (err) {
    console.error(`::error::css-reachability-check: failed to import ${MANIFEST_REL} — ${err.message}`);
    process.exit(1);
  }
  const registeredIds = new Set((Array.isArray(games) ? games : []).map((g) => g?.id).filter((id) => typeof id === 'string'));

  const files = collectSrc(path.join(repoRoot, SRC_REL));
  const importedIds = new Set();
  for (const file of files) {
    for (const id of await importedSheetsIn(fs.readFileSync(file, 'utf8'), path.extname(file))) importedIds.add(id);
  }

  const { errors, counts } = audit(sheetIds, registeredIds, importedIds);
  if (errors.length) {
    for (const e of errors) console.error(`::error::${e}`);
    console.error(
      `\n::error::css-reachability-check: ${errors.length} violation(s). A per-game sheet must be imported if and only if its game is registered: ` +
        'an import with no registration ships bytes no page consumes, and a registration with no import ships a page unstyled.',
    );
    process.exit(1);
  }
  console.log(successLine({ ...counts, files: files.length, games: registeredIds.size }));
}

// Entry point only. This module exports importedSheetsIn/audit for reuse, and at module scope the gate
// used to run on import — including its process.exit(1), inside the importer. Same shape as
// scripts/csp-allowlist-check.mjs's isEntryPoint: BOTH sides realpath()d because Node hands
// `import.meta.url` back canonicalised while argv[1] arrives as written, so a symlinked checkout would
// otherwise skip the gate and exit 0 having checked nothing. Only a missing argv[1] (`node -e`, i.e. an
// import) skips; a realpath that throws on an argv[1] that exists runs the gate anyway.
const isEntryPoint = () => {
  if (!process.argv[1]) return false;
  const canonical = (p) => pathToFileURL(fs.realpathSync(p)).href;
  try {
    return canonical(process.argv[1]) === canonical(fileURLToPath(import.meta.url));
  } catch {
    return true; // ponytail: fail toward running the gate
  }
};

if (isEntryPoint()) {
  if (process.argv.includes('--selftest')) await selftest();
  else await main();
}
