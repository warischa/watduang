#!/usr/bin/env node
// Meta-gate: no new filesystem-walking gate may silently grade a second checkout of this repo.
//
// scripts/check-citations.mjs used to walk from the repo root with no exclusion, and a git
// worktree at .claude/worktrees/<agent>/ (a full second copy of the tree, gitignored) got scanned
// as if it were the repo — see check-citations.mjs's own EXCLUDE_REL_DIRS comment for the incident.
// It was fixed there by excluding '.claude/worktrees' BY RELATIVE PATH (not by directory name,
// so .claude/commands/*.md stays scanned). That fix lives in one file; nothing stops the 13th
// filesystem-walking gate from reintroducing the exact same hazard. This script is the guard: it
// does not fix any existing gate, it makes the NEXT one prove it excluded worktrees before it can
// ship.
//
// THE INVARIANT: for every .mjs file directly under scripts/, if it performs a recursive directory
// walk whose root is the repo root itself (as opposed to a subdirectory such as src/, public/,
// dist/, scripts/), that walk must exclude '.claude/worktrees' by relative path somewhere in the
// same file. A repo-root walk with no such exclusion literal present is a violation.
//
// DETECTION, text-based (this repo has no AST-parser dependency and every other gate here is
// text/regex-based too — see thai-comments.mjs, no-nav-in-stage-check.mjs):
//   1. Find the repo-root variable: the house idiom `const X = fileURLToPath(new URL('..',
//      import.meta.url))`. A file with no such variable cannot walk from "the repo root" in this
//      idiom, so it has zero candidates.
//   2. Find every call site that passes that variable BARE as a call's FIRST argument, e.g.
//      `scanRoot(repoRoot)`, `walkGamesFiles(repoRoot)`, or `walk(repoRoot, opts)`.
//      `path.join(repoRoot, 'src')` never matches this (the comma is inside the join call, not
//      after the bare var) — that is exactly the safe, subdirectory-rooted shape 13 of the 14
//      real gates use today.
//   3. For each such call, look up the callee's OWN function body (`function name(param) { ... }`,
//      brace-matched). Outcomes:
//        - the callee is not found in the file (imported/built-in)  -> fail-closed: UNSAFE
//        - the callee's body never calls fs.readdirSync at all      -> not a walk, ignored
//        - the callee's body calls fs.readdirSync with the bare param itself (readdirSync(param,
//          ...)) -> UNSAFE regardless of any literal join elsewhere in the body — a walk that
//          reaches readdirSync unnarrowed is not made safe by an unrelated narrowed join sitting
//          next to it
//        - the callee's body never hands readdirSync the bare param AND narrows the param to a
//          literal subdirectory somewhere first (`path.join(param, 'literal-string')` appears in
//          the body) -> SAFE
//        - anything else (walks, no bare readdirSync(param), no literal narrow either) -> UNSAFE
//   4. A file with >=1 UNSAFE candidate is a repo-root walker. It passes this gate only if the file
//      also contains the literal '.claude/worktrees' (any quote style) OUTSIDE a comment — a
//      `//` or `/* */` mention of the string does not count as an exclusion.
//
// CEILING, disclosed: this is a heuristic over source text, not a real walk-root prover. It cannot
// see a callee that narrows via something other than a literal `path.join(param, '...')` (a
// template literal, path.resolve, string concatenation) and will fail-closed (flag it) in that
// case — the fix in that situation is to add the exclusion, not to fight the detector. It also
// cannot see a walk root computed through more than one level of indirection (a candidate whose
// callee forwards the bare param to a THIRD function without narrowing first). Both gaps make the
// gate MORE likely to demand an exclusion, never less — it fails closed, never open.
// UNPOLICED, not just a corner case: this gate only reads `.mjs` files directly under scripts/ —
// a `.js` or `.sh` script performing the identical unguarded walk is invisible to it, as is any
// walk rooted at `process.cwd()` rather than the house `fileURLToPath(new URL('..', ...))` idiom.
// Neither shape is covered; a human reviewing a new `.sh`/`.js` walker must check it by hand.
//
//   node scripts/repo-root-walk-check.mjs             -> scan scripts/, exit non-zero on any violation
//   node scripts/repo-root-walk-check.mjs --selftest  -> calibration on a throwaway fixture dir

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

// ---------------------------------------------------------------------------
// Pure: source text -> the house repo-root variable name, or null.
// ---------------------------------------------------------------------------
export function findRepoRootVarName(text) {
  const m = text.match(/\b(?:const|let|var)\s+(\w+)\s*=\s*fileURLToPath\(\s*new URL\(\s*['"]\.\.['"]\s*,\s*import\.meta\.url\s*\)\s*\)/);
  return m ? m[1] : null;
}

// Pure: source text + a function name -> { param, body } of `function name(param, ...) { ... }`,
// brace-matched from the opening `{`, or null if not found / unbalanced.
export function extractFunctionBody(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`function\\s+${escaped}\\s*\\(([^)]*)\\)\\s*\\{`);
  const m = re.exec(text);
  if (!m) return null;
  const param = (m[1].split(',')[0] || '').split('=')[0].trim();
  let i = m.index + m[0].length;
  let depth = 1;
  const start = i;
  while (i < text.length && depth > 0) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') depth--;
    i++;
  }
  if (depth !== 0) return null;
  return { param, body: text.slice(start, i - 1) };
}

// Pure: does `body` narrow `param` to a literal subdirectory before walking?
// Requires the second path.join() argument to START with a quote — `path.join(dir, e.name)` (the
// ordinary recursive-descent glue every walker has) does NOT match; `path.join(root, 'src')` does.
// NOTE: presence alone is not sufficient for safety — see bareReaddirOnParam below, which is what
// actually decides whether `param` reaches fs.readdirSync unnarrowed. An unrelated literal join
// elsewhere in the body must not launder a real bare walk.
function hasLiteralNarrow(body, param) {
  if (!param) return false;
  const escaped = param.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`path\\.join\\(\\s*${escaped}\\s*,\\s*['"\`]`).test(body);
}

// Pure: does `body` call fs.readdirSync with the bare `param` itself (not a derived variable)?
// This is the actual walk-root check: `readdirSync(dir, ...)` where `dir` IS the callee's own
// parameter means the walk starts at whatever the caller passed in, narrow-literal elsewhere in
// the body or not. No identifiable param -> fail closed (treated as bare).
function bareReaddirOnParam(body, param) {
  if (!param) return true;
  const escaped = param.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`readdirSync\\(\\s*${escaped}\\b`).test(body);
}

// Pure: source text + repo-root var name -> every `funcName(rootVar, ...)` call site with rootVar
// as the FIRST argument. rootVar need not be the sole argument (`walk(repoRoot, opts)` counts) —
// only that it isn't itself wrapped in a literal join at the call site, which the extra-arg case
// never is. A leading `.` is excluded (negative lookbehind) so `path.join(repoRoot, 'src')` /
// `path.relative(repoRoot, x)` — narrowing or display calls to a Node builtin method, not a
// user-defined callee this gate can look up — never becomes a false "callee not found" candidate.
function findCandidates(text, rootVar) {
  const re = new RegExp(`(?<!\\.)\\b([A-Za-z_$][\\w$]*)\\(\\s*${rootVar}\\s*(?=[,)])`, 'g');
  return [...text.matchAll(re)].map((m) => ({ funcName: m[1], index: m.index }));
}

/**
 * Pure: one file's source text -> its unguarded-by-construction repo-root walk candidates.
 * Each returned item is a bare `funcName(repoRootVar, ...)` call whose callee performs a
 * fs.readdirSync-based walk and either (a) hands the bare param straight to readdirSync, or
 * (b) never narrows to a literal subdirectory anywhere in its body first (see header). A callee
 * this can't resolve is included too (fail-closed). Safe requires BOTH a literal narrow present
 * AND no bare-param readdirSync call — either condition failing is a violation.
 */
export function findRepoRootWalkers(text) {
  const rootVar = findRepoRootVarName(text);
  if (!rootVar) return [];
  const walkers = [];
  for (const c of findCandidates(text, rootVar)) {
    const fn = extractFunctionBody(text, c.funcName);
    if (!fn) {
      walkers.push({ ...c, rootVar, reason: `callee ${c.funcName}() not found in file (import/built-in) — cannot verify it narrows away from the repo root` });
      continue;
    }
    if (!/readdirSync/.test(fn.body)) continue; // callee doesn't walk the filesystem at all
    const safe = hasLiteralNarrow(fn.body, fn.param) && !bareReaddirOnParam(fn.body, fn.param);
    if (safe) continue; // a derived, literally-narrowed path reaches readdirSync — never the bare param
    walkers.push({ ...c, rootVar, reason: `callee ${c.funcName}(${fn.param}) walks fs.readdirSync from ${fn.param} with no literal-subdirectory narrowing` });
  }
  return walkers;
}

// Naive comment strip (line + block comments) — this is a text heuristic, not a parser, and can
// over-strip inside a string that happens to contain `//` or `/* */`. That is the safe direction:
// over-stripping can only remove a real exclusion literal and make the gate MORE likely to flag,
// never less.
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

// The exclusion literal must appear in live code, not merely be mentioned in a comment (a TODO
// noting the hazard is not a fix for it) — comments are stripped before the literal test.
export function hasWorktreeExclusion(text) {
  return /['"`]\.claude\/worktrees['"`]/.test(stripComments(text));
}

// ---------------------------------------------------------------------------
// IO: scripts/ is flat (no subdirectories today) — list its *.mjs files, deterministic order.
// ---------------------------------------------------------------------------
function listScripts(scriptsDir) {
  return fs.readdirSync(scriptsDir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.mjs'))
    .map((e) => e.name)
    .sort();
}

// This gate's own selftest fixtures write string literals like 'walk(repoRoot);' into throwaway
// files (see selftest() below) — those are DATA describing the hazard, not a real bare call, but
// they are indistinguishable from one by this text scanner. Scanning this file's own source hits
// them and self-flags. Same class of exception as check-citations.mjs's EXCLUDE_FILES for
// docs/sessions-archive.md (a file that legitimately carries the pattern this checker looks for,
// as content rather than as a live hazard). Still counted in the "files examined" total below.
const SELF_FILE = path.basename(fileURLToPath(import.meta.url));

function scan(scriptsDir) {
  const files = listScripts(scriptsDir);
  const walkerFiles = [];
  const violations = [];
  for (const name of files) {
    if (name === SELF_FILE) continue;
    const text = fs.readFileSync(path.join(scriptsDir, name), 'utf8');
    const walkers = findRepoRootWalkers(text);
    if (!walkers.length) continue;
    walkerFiles.push(name);
    if (!hasWorktreeExclusion(text)) violations.push({ file: name, walkers });
  }
  return { files, walkerFiles, violations };
}

// ---------------------------------------------------------------------------
// Self-test: a throwaway fixture directory under os.tmpdir(), never scripts/ itself, so fixing a
// real gate can't retune this check. Calibrated both directions plus the false-positive guard.
// ---------------------------------------------------------------------------
function selftest() {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'repo-root-walk-check-'));
  try {
    const rootDecl = "const repoRoot = fileURLToPath(new URL('..', import.meta.url));\n";

    // known-good: a subdirectory-rooted walker, the real shape 13 of the 14 gates use.
    fs.writeFileSync(
      path.join(dir, 'subdir-walker.mjs'),
      rootDecl +
        [
          'function walkGamesFiles(root) {',
          "  const dir = path.join(root, 'src/games');",
          '  for (const e of fs.readdirSync(dir, { withFileTypes: true })) { /* ... */ }',
          '}',
          'walkGamesFiles(repoRoot);',
        ].join('\n'),
    );

    // known-bad: a repo-root walk with NO exclusion — the exact hazard this gate exists to catch.
    fs.writeFileSync(
      path.join(dir, 'bad-root-walk.mjs'),
      rootDecl +
        [
          'function walk(dir) {',
          '  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {',
          '    if (e.isDirectory()) walk(path.join(dir, e.name));',
          '  }',
          '}',
          'walk(repoRoot);',
        ].join('\n'),
    );

    // known-fixed: the identical walker, with the exclusion literal present in the file.
    fs.writeFileSync(
      path.join(dir, 'good-root-walk.mjs'),
      rootDecl +
        [
          "const EXCLUDE_REL_DIRS = new Set(['.claude/worktrees']);",
          'function walk(dir) {',
          '  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {',
          '    if (e.isDirectory()) walk(path.join(dir, e.name));',
          '  }',
          '}',
          'walk(repoRoot);',
        ].join('\n'),
    );

    const good = scan(dir);
    assert.equal(good.files.length, 3, 'must examine all 3 fixture files');
    assert.deepEqual(good.walkerFiles.sort(), ['bad-root-walk.mjs', 'good-root-walk.mjs'], 'exactly the two root-rooted walkers must be found, not the subdir walker');
    assert.deepEqual(good.violations.map((v) => v.file), ['bad-root-walk.mjs'], 'exactly bad-root-walk.mjs must violate — good-root-walk.mjs carries the exclusion, subdir-walker.mjs never walks from repo root');
    console.log('PASS calibration: subdir walker never flagged, unexcluded repo-root walker reds and is named, excluded repo-root walker greens');

    // Removing the bad file must clear the violation (proves the gate can go green again, not just red).
    fs.rmSync(path.join(dir, 'bad-root-walk.mjs'));
    const afterDelete = scan(dir);
    assert.equal(afterDelete.violations.length, 0, 'deleting the offending file must clear all violations');
    assert.deepEqual(afterDelete.walkerFiles, ['good-root-walk.mjs'], 'the excluded repo-root walker is still counted, just not a violation');
    console.log('PASS calibration: deleting the offending file returns the gate to green');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
async function main() {
  if (process.argv.includes('--selftest')) return selftest();

  const scriptsDir = path.join(repoRoot, 'scripts');
  const { files, walkerFiles, violations } = scan(scriptsDir);
  if (!files.length) {
    console.error('::error::scripts/ contains no .mjs files — nothing was scanned, which is not the same as clean');
    process.exit(1);
  }

  if (violations.length) {
    for (const v of violations) {
      for (const w of v.walkers) {
        console.error(
          `::error file=scripts/${v.file}::repo-root walk via ${w.funcName}(${w.rootVar}) has no '.claude/worktrees' relative-path exclusion (${w.reason}) — a git worktree under .claude/worktrees/ is a second copy of this repo and would be silently graded too. Fix pattern: scripts/check-citations.mjs EXCLUDE_REL_DIRS.`,
        );
      }
    }
    console.error(`\n${violations.length} script(s) with an unguarded repo-root walk.`);
    process.exit(1);
  }

  console.log(
    `repo-root-walk-check: ${files.length} script file(s) examined under scripts/, ${walkerFiles.length} repo-root walker(s) found (all excluding .claude/worktrees), 0 violation(s).`,
  );
}

await main();
