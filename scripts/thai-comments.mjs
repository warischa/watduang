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
const EXT = new Set(['.astro', '.ts', '.js', '.mjs', '.css']);
// Every channel that can carry a Thai comment. Self-test asserts each one still fires, so a
// silently broken extractor (e.g. .astro <script>) fails loudly instead of shrinking the count.
const CHANNELS = ['ts', 'mjs', 'css', 'astro:frontmatter', 'astro:html', 'astro:script', 'astro:style'];

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
      '<p>{label}</p>',
    ],
    comment: [2, 5, 9, 13, 16],
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
  let line = 1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') { line++; continue; }
    if (mask[i] && THAI.test(text[i])) (mask[i] === COMMENT ? out.comment : out.string).add(line);
  }
  return out;
}

function thaiLineSet(value) {
  const out = new Set();
  value.split('\n').forEach((l, i) => { if (THAI.test(l)) out.add(i + 1); });
  return out;
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
      mergeInto(res, { comment: thaiLineSet(node.value), string: new Set() }, 'astro:html', line);
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
    // ponytail: template text, attribute values and {expression} text are all string-side —
    // they only matter for flagging ambiguity. Comments inside {} expressions are not modelled.
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
}

// ---------------------------------------------------------------------------
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

  let total = 0;
  const lines = [];
  const ambiguousLines = [];
  for (const f of files) {
    const res = await analyzeFile(f, fs.readFileSync(f, 'utf8'));
    const { counted, ambiguous } = split(res);
    const rel = path.relative(repoRoot, f);
    total += counted.length;
    for (const l of counted) lines.push(`${rel}:${l}\t${res.comment.get(l)}`);
    for (const l of ambiguous) ambiguousLines.push(`${rel}:${l}\t${res.comment.get(l)}`);
  }

  console.log(list ? lines.join('\n') : String(total));
  for (const a of ambiguousLines) process.stderr.write(`ambiguous (Thai in both a comment and a string) ${a}\n`);
  process.stderr.write(`files scanned: ${files.length} · Thai comment lines: ${total} · ambiguous: ${ambiguousLines.length}`);
  process.stderr.write(skipped.size ? ` · skipped (no analyzer): ${[...skipped].map(([e, n]) => `${e} x${n}`).join(', ')}\n` : '\n');
}

await main();
