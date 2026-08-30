#!/usr/bin/env node
// Enumerate Thai-language COMMENT lines under src/ + scripts/ — never string, template,
// attribute or UI-copy content. This is the gate for issue #36: "Write English. Ship Thai."
// means comments migrate to English while Thai user-facing strings stay untouched, so the
// measurement is only trustworthy if it can tell the two apart. A regex cannot; this uses
// the TypeScript parser for JS-family code and @astrojs/compiler for .astro structure.
//
//   node scripts/thai-comments.mjs                 -> total count, alone, on stdout
//   node scripts/thai-comments.mjs --list          -> "file:line  channel" per line
//   node scripts/thai-comments.mjs --selftest      -> both-direction calibration
//   node scripts/thai-comments.mjs src/games       -> scope to paths
//
// A line carrying Thai in BOTH a comment and a string is reported as ambiguous (stderr) and
// excluded from the count — those are the lines a migration worker must hand-check.

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { parse as parseAstro } from '@astrojs/compiler';

const THAI = /\p{Script=Thai}/u;
// A double-quoted or backtick span inside a comment is citation, not prose — CLAUDE.md
// sanctions quoting Thai UI copy verbatim to explain it (e.g. a rejected wording), and this
// repo's citations use double quotes. Blank those spans before the Thai test so only
// unquoted comment prose can trip the gate.
// ponytail: single quotes are deliberately NOT stripped — an apostrophe in English prose
// ("don't", "stage's") pairs with another apostrophe on the same line and would blank real
// Thai prose between them. Ceiling: a Thai comment written entirely inside "..." or `...`
// slips through untouched; narrow further (e.g. require non-quoted prose elsewhere on the
// line) if that shows up in practice. Widen to single quotes only with a fix for the
// apostrophe-pairing hole, not by reverting this.
function stripQuotedSpans(str) {
  return str.replace(/"[^"\n]*"|`[^`]*`/g, (m) => 'x'.repeat(m.length));
}
const EXT = new Set(['.astro', '.ts', '.js', '.mjs', '.css']);
// Every channel that can carry a Thai comment. Self-test asserts each one still fires, so a
// silently broken extractor (e.g. .astro <script>) fails loudly instead of shrinking the count.
const CHANNELS = ['ts', 'mjs', 'css', 'astro:frontmatter', 'astro:html', 'astro:script', 'astro:style', 'astro:template'];
// A `{/* ... */}` brace comment is the whole content of its expression node —
// distinguishes it from `{someExpr}` UI-copy interpolation, which must stay string-side.
const BRACE_COMMENT_ONLY = /^\s*(?:\/\*[\s\S]*?\*\/\s*)+$/;

// ---------------------------------------------------------------------------
// Calibration fixtures — inline on purpose: the self-test must never depend on
// repo content, or fixing a file would silently retune the detector.
// `comment` = lines that MUST be counted. Every other Thai line in the fixture
// is a known-bad and is asserted NOT counted. `ambiguous` = both on one line.
// ---------------------------------------------------------------------------
const FIXTURES = [
  {
    name: 'ts — comments counted; string, template, regex not',
    file: 'f.ts',
    text: [
      '/** ไทย jsdoc */', //                       1  comment
      'export function f(x: string) {',
      "  const s = 'ไทย';", //                     3  string
      '  const t = `ไทย ${x}`;', //                4  template
      '  const r = /ไทย/u;', //                    5  regex literal
      '  const u = 1; // ไทย trailing', //         6  comment (same line as code)
      '  /* ไทย block', //                         7  comment
      '     ไทย line 2 */', //                     8  comment
      '  return s + t + r + u;',
      '  // ไทย before closing brace', //         10  comment
      '}',
      '// ไทย at end of file', //                 12  comment
    ],
    comment: [1, 6, 7, 8, 10, 12],
  },
  {
    name: 'ts — Thai in a comment AND a string on one line is ambiguous, not counted',
    file: 'a.ts',
    text: [
      "const s = 'ไทย'; // ไทย", //                1  ambiguous
      "const t = 'ไทย';", //                       2  string
      '// ไทย', //                                 3  comment
    ],
    comment: [3],
    ambiguous: [1],
  },
  {
    name: 'ts — quoted Thai inside a comment is citation, not prose; unquoted Thai still counts',
    file: 'q.ts',
    text: [
      '// wording "เล่นรอบนี้ต่อ" was rejected', //  1  quoted-only (double quotes), not counted
      '// ไทย reason, wording "เล่นรอบนี้ต่อ" rejected', // 2  unquoted Thai present, counted
    ],
    comment: [2],
  },
  {
    // Regression for the apostrophe-pairing hole a reviewer found: single quotes are NOT
    // stripped, so two English possessives/contractions on one line must never blank real
    // Thai prose sitting between them.
    name: "ts — single quotes are not stripped; don't/stage's apostrophes must not blank Thai between them",
    file: 'apos.ts',
    text: [
      "// don't แตะ stage's children", //          1  comment, must still be counted
    ],
    comment: [1],
  },
  {
    name: 'mjs — comments counted; string and template not',
    file: 'f.mjs',
    text: [
      '// ไทย line comment', //                    1  comment
      "console.log('ไทย');", //                    2  string
      'const t = `ไทย`;', //                       3  template
      '/* ไทย */', //                              4  comment
    ],
    comment: [1, 4],
  },
  {
    name: 'css — block comments counted; a string that looks like a comment is not',
    file: 'f.css',
    text: [
      '/* ไทย', //                                 1  comment
      '   ไทย line 2 */', //                       2  comment
      '.a::after { content: "ไทย"; }', //          3  string
      '.b::after { content: "/* ไทย */"; }', //    4  string that mimics a comment
    ],
    comment: [1, 2],
  },
  {
    name: 'astro — frontmatter, HTML, <script>, <style> comments counted; template text and attributes not',
    file: 'f.astro',
    text: [
      '---',
      '// ไทย frontmatter comment', //             2  comment
      "const label = 'ไทย';", //                   3  string
      '---',
      '<!-- ไทย html comment -->', //              5  comment
      '<p title="ไทย attr">ไทย template text</p>', // 6  attribute + template text
      '<p>ไทย text</p> <!-- ไทย -->', //           7  ambiguous
      '<style>',
      '  /* ไทย css comment */', //                9  comment
      '  .a::after { content: "ไทย"; }', //       10  string
      '</style>',
      '<script>',
      '  // ไทย script comment', //               13  comment
      "  const s = 'ไทย';", //                    14  string
      '</script>',
      '<!-- ไทย', //                              16  comment
      '     second line -->',
      '<p>{label}</p>', //                        18  expression, not a comment
      '<p>{/* ไทย brace comment */}</p>', //      19  comment (brace comment)
      '<p>{/* wording "เล่นรอบนี้ต่อ" was rejected */}</p>', // 20  quoted-only, not counted
      '<p>{/* ไทย reason, wording "เล่นรอบนี้ต่อ" rejected */}</p>', // 21  unquoted Thai present, counted
    ],
    comment: [2, 5, 9, 13, 16, 19, 21],
    ambiguous: [7],
  },
];

// ---------------------------------------------------------------------------
// Analyzers — pure (text) -> { comment: Set<line>, string: Set<line> }, 1-based.
// Everything reads text only; file IO lives in main().
// ---------------------------------------------------------------------------

const COMMENT = 1;
const STRING = 2;

// Walk a char mask, so a line is classified by what the Thai character sits inside,
// not by what else the line happens to contain.
function maskToLines(text, mask) {
  const out = { comment: new Set(), string: new Set() };
  const stripped = stripQuotedSpans(text);
  let line = 1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') { line++; continue; }
    if (!mask[i]) continue;
    const isComment = mask[i] === COMMENT;
    if (THAI.test(isComment ? stripped[i] : text[i])) (isComment ? out.comment : out.string).add(line);
  }
  return out;
}

function thaiLineSet(value) {
  const out = new Set();
  value.split('\n').forEach((l, i) => { if (THAI.test(l)) out.add(i + 1); });
  return out;
}

// Raw-string comment channels (astro:html, astro:template) route through here so the same
// quote-stripping applies as maskToLines gives the AST-mask channels.
function commentThaiLineSet(value) {
  return thaiLineSet(stripQuotedSpans(value));
}

const STRINGY = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.RegularExpressionLiteral,
  ts.SyntaxKind.JsxText,
]);

function analyzeJs(text, scriptKind = ts.ScriptKind.TS) {
  const sf = ts.createSourceFile('f.ts', text, ts.ScriptTarget.Latest, /* setParentNodes */ true, scriptKind);
  const mask = new Uint8Array(text.length);
  const fill = (from, to, v) => { for (let i = from; i < to && i < text.length; i++) mask[i] = v; };
  (function walk(node) {
    const kids = node.getChildren(sf);
    if (kids.length) { kids.forEach(walk); return; }
    // Leading skips comments sharing a line with the previous token; trailing catches exactly
    // those. Both from the same position covers the whole trivia run. Verified, not assumed.
    ts.forEachLeadingCommentRange(text, node.getFullStart(), (pos, end) => fill(pos, end, COMMENT));
    ts.forEachTrailingCommentRange(text, node.getFullStart(), (pos, end) => fill(pos, end, COMMENT));
    if (STRINGY.has(node.kind)) fill(node.getStart(sf), node.getEnd(), STRING);
  })(sf);
  return maskToLines(text, mask);
}

// ponytail: CSS has no line comments and no escapes worth modelling — /* */ and quoted
// strings are the whole grammar that matters here. Swap in a real CSS parser if that changes.
function analyzeCss(text) {
  const mask = new Uint8Array(text.length);
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : end + 2;
      mask.fill(COMMENT, i, stop);
      i = stop;
    } else if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== ch && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
      const stop = Math.min(j + 1, text.length);
      mask.fill(STRING, i, stop);
      i = stop;
    } else i++;
  }
  return maskToLines(text, mask);
}

// ---------------------------------------------------------------------------
// Per-file results carry a channel label so a count can be reconciled by hand.
// ---------------------------------------------------------------------------
const emptyResult = () => ({ comment: new Map(), string: new Set() });

// The compiler's byte-ish offsets/columns are not char offsets; only start.line is trusted,
// and every sub-analysis is remapped by line. Self-test asserts the exact line numbers.
function mergeInto(res, sub, label, startLine) {
  const off = startLine - 1;
  for (const l of sub.comment) res.comment.set(l + off, label);
  for (const l of sub.string) res.string.add(l + off);
}

async function analyzeAstro(text) {
  const res = emptyResult();
  const { ast } = await parseAstro(text);
  const lineOf = (node) => node?.position?.start?.line;
  (function walk(node) {
    const line = lineOf(node);
    if (node.type === 'frontmatter' && line) {
      mergeInto(res, analyzeJs(node.value, ts.ScriptKind.TS), 'astro:frontmatter', line);
      return;
    }
    if (node.type === 'comment' && line) {
      mergeInto(res, { comment: commentThaiLineSet(node.value), string: new Set() }, 'astro:html', line);
      return;
    }
    if (node.type === 'element' && (node.name === 'script' || node.name === 'style')) {
      for (const c of node.children ?? []) {
        if (c.type !== 'text' || !lineOf(c)) continue;
        const sub = node.name === 'script' ? analyzeJs(c.value, ts.ScriptKind.TS) : analyzeCss(c.value);
        mergeInto(res, sub, `astro:${node.name}`, lineOf(c));
      }
      return;
    }
    // A {/* ... */} brace comment parses as an expression node whose only child is a text
    // node holding the raw "/* ... */" source — catch that here, before the generic text
    // branch below sends it down the string channel as if it were UI copy.
    if (node.type === 'expression') {
      for (const c of node.children ?? []) {
        if (c.type !== 'text' || !lineOf(c)) continue;
        if (BRACE_COMMENT_ONLY.test(c.value)) {
          mergeInto(res, { comment: commentThaiLineSet(c.value), string: new Set() }, 'astro:template', lineOf(c));
        } else {
          mergeInto(res, { comment: new Set(), string: thaiLineSet(c.value) }, null, lineOf(c));
        }
      }
      return;
    }
    // ponytail: template text and attribute values are string-side — they only matter for
    // flagging ambiguity. Non-comment {expression} content is not modelled beyond that check.
    if (node.type === 'text' && line) {
      mergeInto(res, { comment: new Set(), string: thaiLineSet(node.value) }, null, line);
      return;
    }
    for (const a of node.attributes ?? []) {
      if (typeof a.value === 'string' && lineOf(a)) {
        mergeInto(res, { comment: new Set(), string: thaiLineSet(a.value) }, null, lineOf(a));
      }
    }
    for (const c of node.children ?? []) walk(c);
  })(ast);
  return res;
}

async function analyzeFile(file, text) {
  const ext = path.extname(file);
  if (ext === '.astro') return analyzeAstro(text);
  const res = emptyResult();
  if (ext === '.css') mergeInto(res, analyzeCss(text), 'css', 1);
  else mergeInto(res, analyzeJs(text, ext === '.ts' ? ts.ScriptKind.TS : ts.ScriptKind.JS), ext.slice(1), 1);
  return res;
}

const split = (res) => ({
  counted: [...res.comment.keys()].filter((l) => !res.string.has(l)).sort((a, b) => a - b),
  ambiguous: [...res.comment.keys()].filter((l) => res.string.has(l)).sort((a, b) => a - b),
});

// ---------------------------------------------------------------------------
async function selftest() {
  const channelsSeen = new Set();
  for (const fx of FIXTURES) {
    const text = fx.text.join('\n');
    const res = await analyzeFile(fx.file, text);
    const { counted, ambiguous } = split(res);
    // known-good: exactly the comment lines, at exactly the right line numbers
    assert.deepEqual(counted, fx.comment, `${fx.name}: counted comment lines`);
    assert.deepEqual(ambiguous, fx.ambiguous ?? [], `${fx.name}: ambiguous lines`);
    // known-bad: no other Thai line in the fixture may be counted
    fx.text.forEach((l, i) => {
      if (!THAI.test(l) || fx.comment.includes(i + 1)) return;
      assert.ok(!counted.includes(i + 1), `${fx.name}: line ${i + 1} carries Thai outside a comment but was counted`);
    });
    for (const l of counted) channelsSeen.add(res.comment.get(l));
    console.log(`PASS ${fx.name}\n     counted ${JSON.stringify(counted)} · ambiguous ${JSON.stringify(ambiguous)} · known-bad Thai lines rejected: ${fx.text.filter((l, i) => THAI.test(l) && !fx.comment.includes(i + 1)).length}`);
  }
  // Positive control on the apparatus itself: a dead extractor returns 0 and looks like success.
  assert.deepEqual([...channelsSeen].sort(), [...CHANNELS].sort(), 'every channel must produce at least one counted Thai comment line');
  console.log(`PASS apparatus alive — channels firing: ${[...channelsSeen].sort().join(', ')}`);

  // The verbatim-lift exemption, calibrated in BOTH directions. An exemption that only ever returns
  // true is indistinguishable from deleting the gate for that path, so every leg that must stay
  // POLICED is asserted here beside the ones that are exempt.
  const sep = path.sep;
  const exempt = [
    `${sep}repo${sep}src${sep}play${sep}cannon-flag${sep}main.js`,
    `${sep}repo${sep}src${sep}play${sep}cannon-flag${sep}style.css`,
    `${sep}repo${sep}src${sep}play${sep}freeze-tap${sep}markup.html`,
  ];
  const policed = [
    // agent-authored, and living in the very directory the ruling named — the reason this predicate is
    // per-filename instead of per-directory
    `${sep}repo${sep}src${sep}play${sep}cannon-flag${sep}roster-bridge.js`,
    `${sep}repo${sep}src${sep}play${sep}cannon-flag${sep}overrides.css`,
    // right basename, wrong depth: no game-id segment, so it is not an extractor output
    `${sep}repo${sep}src${sep}play${sep}main.js`,
    // right basename, wrong tree
    `${sep}repo${sep}src${sep}games${sep}main.js`,
    `${sep}repo${sep}scripts${sep}play${sep}cannon-flag${sep}main.js`,
    // a name the extractor never writes
    `${sep}repo${sep}src${sep}play${sep}cannon-flag${sep}engine.js`,
  ];
  const noImportText = 'const x = 1;\nfunction f() { return x; }';
  for (const f of exempt) assert.equal(isVerbatimLift(f, noImportText), true, `must be exempt: ${f}`);
  for (const f of policed) assert.equal(isVerbatimLift(f, noImportText), false, `must stay policed: ${f}`);

  // Narrowed owner ruling 2026-08-30 (gh#123): an import statement proves the lift file was
  // edited since extraction, so it loses the exemption in BOTH directions — the untouched
  // sibling stays exempt, the one with an import is scanned like any other source file.
  const liftPath = `${sep}repo${sep}src${sep}play${sep}pinocchio-luck${sep}main.js`;
  const importedText = 'import { roll } from "./engine.js";\nconst x = 1;';
  assert.equal(isVerbatimLift(liftPath, noImportText), true, 'lift file with no import stays exempt');
  assert.equal(isVerbatimLift(liftPath, importedText), false, 'lift file WITH an import loses the exemption');

  // End-to-end: once isVerbatimLift says "scanned", the pipeline must actually catch a Thai
  // comment in that file — losing the exemption on paper is worthless if nothing then reads it.
  const importedTextWithThaiComment = 'import { roll } from "./engine.js";\n// ไทย agent-authored comment\nconst x = 1;';
  assert.equal(isVerbatimLift(liftPath, importedTextWithThaiComment), false);
  const { counted: caughtLines } = split(await analyzeFile(liftPath, importedTextWithThaiComment));
  assert.deepEqual(caughtLines, [2], 'Thai comment in a scanned (imported) lift file must be caught');
  console.log(
    `PASS verbatim-lift exemption calibrated both ways: ${exempt.length} exempt, ${policed.length} still policed ` +
      '(agent-authored siblings, wrong depth, wrong tree, unknown basename), plus import-narrows-the-exemption calibrated both ways',
  );
}

// ---------------------------------------------------------------------------
// VERBATIM LIFTS. Owner ruling 2026-08-29, narrowing gh#123's "code comments are pure English with no
// exception": that rule governs what an agent WRITES. These three files are written by
// scripts/extract-mockup.mjs, byte-for-byte out of a standalone mockup this project did not author, and
// the whole point of the extraction is that a diff against the mockup stays meaningful. Rewriting a
// third-party author's comments would break that and buy nothing.
//
// SCOPED TO THE THREE FILENAMES THE EXTRACTOR WRITES, not to the directory the ruling named. A
// directory-wide exemption would also silence roster-bridge.js and overrides.css, which live beside
// them and ARE agent-authored — that is how an exemption written to cover one thing quietly grows to
// cover the next file someone drops in. The extractor is the only writer of these three names.
//
// NARROWED owner ruling 2026-08-30 (gh#123): the exemption's premise is that the file is
// byte-for-byte what the extractor wrote. An `import` statement proves an agent has since
// edited it, so the file keeps the filename/depth shape but loses the exemption.
const VERBATIM_LIFT_BASENAMES = new Set(['markup.html', 'style.css', 'main.js']);
// Keyed on "import" anchored at the start of a (whitespace-trimmed) line — that is where a real
// ES module import statement sits, and it excludes the word appearing mid-line inside a string or
// a `//` comment (which starts the line with `//`, not `import`). Miss: a multi-line `/* ... */`
// block comment or template literal whose OWN line happens to start with "import " would still
// trip this. Acceptable here — these are third-party lift files, not free-form prose.
const IMPORT_STATEMENT = /^[ \t]*import\b/m;
function isVerbatimLift(absPath, text) {
  const parts = absPath.split(path.sep);
  const i = parts.lastIndexOf('play');
  // src/play/<game-id>/<basename> — the id segment must be there, so src/play/main.js is NOT exempt.
  if (i < 1 || parts[i - 1] !== 'src') return false;
  if (parts.length !== i + 3) return false;
  if (!VERBATIM_LIFT_BASENAMES.has(parts[parts.length - 1])) return false;
  return !IMPORT_STATEMENT.test(text);
}

function walkFiles(root, out = [], skipped = new Map()) {
  for (const e of fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(root, e.name);
    if (e.isDirectory()) walkFiles(p, out, skipped);
    else if (EXT.has(path.extname(p))) out.push(p);
    else if (path.extname(p)) skipped.set(path.extname(p), (skipped.get(path.extname(p)) ?? 0) + 1);
  }
  return { files: out, skipped };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) return selftest();

  const list = args.includes('--list');
  const repoRoot = fileURLToPath(new URL('..', import.meta.url));
  const roots = args.filter((a) => !a.startsWith('--'));
  const files = [];
  const skipped = new Map();
  for (const r of (roots.length ? roots : ['src', 'scripts'])) {
    const abs = path.resolve(repoRoot, r);
    if (fs.statSync(abs).isDirectory()) walkFiles(abs, files, skipped);
    else files.push(abs);
  }

  // Read once, up front — isVerbatimLift needs the text to check for an import statement, and
  // analyzeFile needs it again below; the cache avoids reading a scanned file twice.
  const textByFile = new Map(files.map((f) => [f, fs.readFileSync(f, 'utf8')]));
  const lifted = files.filter((f) => isVerbatimLift(f, textByFile.get(f)));
  const scanned = files.filter((f) => !isVerbatimLift(f, textByFile.get(f)));
  files.length = 0;
  files.push(...scanned);

  let total = 0;
  const lines = [];
  const ambiguousLines = [];
  for (const f of files) {
    const res = await analyzeFile(f, textByFile.get(f));
    const { counted, ambiguous } = split(res);
    const rel = path.relative(repoRoot, f);
    total += counted.length;
    for (const l of counted) lines.push(`${rel}:${l}\t${res.comment.get(l)}`);
    for (const l of ambiguous) ambiguousLines.push(`${rel}:${l}\t${res.comment.get(l)}`);
  }

  console.log(list ? lines.join('\n') : String(total));
  for (const a of ambiguousLines) process.stderr.write(`ambiguous (Thai in both a comment and a string) ${a}\n`);
  process.stderr.write(`files scanned: ${files.length} · Thai comment lines: ${total} · ambiguous: ${ambiguousLines.length}`);
  // A green that does not name its exemptions reads as coverage it did not earn (ADR-0019). Printed
  // with the paths, not just a count, so the reader can check each one is really an extractor output.
  if (lifted.length) {
    process.stderr.write(
      ` · NOT SCANNED, verbatim third-party lifts (owner ruling 2026-08-29): ${lifted
        .map((f) => path.relative(repoRoot, f))
        .join(', ')}`,
    );
  }
  process.stderr.write(skipped.size ? ` · skipped (no analyzer): ${[...skipped].map(([e, n]) => `${e} x${n}`).join(', ')}\n` : '\n');

  // The gate: a Thai comment line or an ambiguous (comment+string on one line) hit must fail CI.
  // Ambiguous is not a free pass — it is exactly the channel a real hit could hide behind if it
  // only failed on `total`.
  if (total > 0 || ambiguousLines.length > 0) process.exitCode = 1;
}

await main();
