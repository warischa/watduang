#!/usr/bin/env node
// gh#184 — no stylesheet under src/ may ship unbalanced braces.
//
// Why this gate exists: src/play/short-stick/style.css carried ONE stray top-level `}` above its
// `/* Player Strip Carousel */` block. esbuild does not fail on it — `npm run build` printed
// `Unexpected "}" [css-syntax-error]` as a WARNING and shipped — and the rule immediately after
// the stray brace was dropped on the floor (scope measured, not assumed: `.strip-chip` lower in
// the same file still applied). Measured before/after the one-character fix, one variable, in a
// throwaway worktree: `.player-strip` computed `display` went block -> flex, and documentElement
// vertical overflow at 320x568 went 864px -> 594px. A whole carousel's layout was silently absent
// and no gate in the fleet could see it, because tsc, the tests and the build all stayed green.
//
// The lifted-file exception this gate secures: docs/agents/play-route-recipe.md step 5 sends
// site-side adjustments to overrides.css and forbids editing the lifted style.css. A syntax error
// is not a site-side adjustment (owner ruling 2026-09-03), so it is fixed in place — and this gate
// is what keeps that honest, by making the class impossible to reintroduce anywhere under src/.
//
// HOW IT COUNTS. Naive `{`/`}` counting is wrong: `content: "}"`, an apostrophe inside a comment
// and a brace inside a string all move the count without moving the nesting. So this is a single-
// pass character scanner with four states (top level, comment, '…', "…"), and only braces seen at
// top level count. Backslash escapes inside strings are honoured. The scanner reds on one non-brace
// fault too, because it is the same silent-rule-dropping class and it costs four lines: a `*/` seen
// at TOP level, i.e. with no comment open. CSS comments do not nest, so `/* a */ b */` ends at the
// first close and ` b ` becomes live CSS that swallows the next rule — while the brace count stays
// perfectly balanced. That is not hypothetical: it happened in src/play/short-stick/overrides.css
// while writing the comment that cites this very fix, and the brace half of this gate greened it.
//
// The rule tests the CLOSING token on purpose. A first version tested the opening one — "a `/*`
// inside a comment" — and was wrong in BOTH directions, reproduced through this gate: it RED on
// `/* see src/play/** and scripts/*.mjs */`, because a glob holds a `/` followed by a `*`, and it
// stayed GREEN on the early close above, because that leaves no second opener at all. Globs in
// comments are the recorded desync class in this repo; a gate against it must not be its next
// instance.
//
// FAIL CLOSED, three ways: a `}` that takes depth below zero reds AT ITS LINE (that is the
// short-stick shape); a file that ends inside a comment or a string reds as unparseable rather than
// being counted anyway; and enumerating zero stylesheets reds, because "0 files checked" is a green
// nobody earned.
//
// ponytail: DISCLOSED CEILING — this is a brace/comment/string scanner, NOT a CSS parser, and its
// green is worth exactly one property: every `{` at top level has a matching `}` and never the
// reverse. It does NOT check that the braces enclose valid selectors or declarations, and it has two
// known blind spots, both of which move a count that ends up balanced anyway or not at all:
//   1. an UNQUOTED `url(…)` containing a brace — legal CSS, counted as a real brace here;
//   2. a CSS escape sequence such as `\7B` or a class selector written `.\{` — the brace is escaped
//      at the CSS-token level, which this scanner only tracks inside strings, not in identifiers.
// Neither appears in src/ today (checked: no unquoted url() with a brace, no `\{`). The upgrade path
// if one lands is a real tokenizer (postcss is already a transitive dep of the toolchain) — not a
// third special case here. A balanced file can still be broken CSS; that is the build's job, and
// this gate is deliberately narrower than it.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Scan one stylesheet's text. Returns null when balanced, or a {line, reason} for the FIRST fault —
 * first, not all, because after the first stray brace every later depth reading is fiction.
 */
export function scanBraces(text) {
  let depth = 0;
  let line = 1;
  let openLine = 0; // line of the outermost still-open `{`, for the unclosed report
  let state = 'top'; // 'top' | 'comment' | 'single' | 'double'
  let stateLine = 1; // line the current comment/string opened on

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\n') line++;

    if (state === 'comment') {
      if (c === '*' && text[i + 1] === '/') {
        state = 'top';
        i++;
      }
      continue;
    }

    if (state === 'single' || state === 'double') {
      // A backslash escapes the next character, INCLUDING a newline (CSS line continuation).
      if (c === '\\') {
        if (text[i + 1] === '\n') line++;
        i++;
        continue;
      }
      if (c === '\n') {
        return { line: stateLine, reason: 'unterminated string literal (a raw newline inside it)' };
      }
      if ((state === 'single' && c === "'") || (state === 'double' && c === '"')) state = 'top';
      continue;
    }

    // state === 'top'
    // A `*/` here has no comment open, which is what an EARLY-CLOSED comment leaves behind: CSS
    // comments do not nest, so `/* a */ b */` closes at the first `*/` and ` b ` becomes live CSS
    // that swallows the next rule, with the brace count still balanced. Testing the CLOSING token is
    // what catches that. Testing the opening one does not: it reds on any comment containing a glob
    // (`/* see src/play/** */` holds a `/` followed by `*`) and stays green on the real fault. Both
    // directions reproduced through this gate before the rule was changed.
    if (c === '*' && text[i + 1] === '/') {
      return { line, reason: 'a `*/` with no comment open — an earlier comment closed sooner than intended, so the text between became live CSS' };
    }
    if (c === '/' && text[i + 1] === '*') {
      state = 'comment';
      stateLine = line;
      i++;
    } else if (c === "'") {
      state = 'single';
      stateLine = line;
    } else if (c === '"') {
      state = 'double';
      stateLine = line;
    } else if (c === '{') {
      if (depth === 0) openLine = line;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth < 0) return { line, reason: 'stray closing brace `}` with no block open' };
    }
  }

  if (state === 'comment') return { line: stateLine, reason: 'file ends inside an unclosed /* comment' };
  if (state === 'single' || state === 'double') {
    return { line: stateLine, reason: 'file ends inside an unclosed string literal' };
  }
  if (depth > 0) return { line: openLine, reason: `block opened here is never closed (${depth} brace(s) still open at EOF)` };
  return null;
}

/** Every .css under a directory, recursively. */
function collectStylesheets(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) collectStylesheets(abs, out);
    else if (entry.name.endsWith('.css')) out.push(abs);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Self-test: pure, no disk IO — scanBraces() takes text, so every case is a string literal here.
// Calibrated BOTH ways: balanced shapes (including the three that defeat naive counting) must stay
// silent, and each fault shape must be reported at the right line.
// ---------------------------------------------------------------------------
function selftest() {
  assert.equal(scanBraces('.a { color: red; }\n.b { color: blue; }'), null, 'known-good: balanced rules must pass');
  assert.equal(scanBraces('@media (min-width: 40em) {\n  .a { color: red; }\n}'), null, 'known-good: nested at-rule must pass');
  console.log('PASS known-good: balanced flat and nested stylesheets are silent');

  // The three shapes a naive `{`/`}` count gets wrong. Each is BALANCED and must stay silent.
  assert.equal(scanBraces('.a::after { content: "}"; }'), null, 'a brace inside a double-quoted value must not count');
  assert.equal(scanBraces(".a::after { content: '{'; }"), null, 'a brace inside a single-quoted value must not count');
  assert.equal(scanBraces('/* a } in a comment, and don\'t let the apostrophe open a string */\n.a { color: red; }'), null, 'a brace and an apostrophe inside a comment must not count');
  assert.equal(scanBraces('.a::after { content: "\\"}"; }'), null, 'an escaped quote must not end the string early');
  console.log('PASS naive-counter traps: braces in strings and comments, and an escaped quote, are all ignored');

  // The real bug: one stray top-level `}` — the src/play/short-stick/style.css shape.
  const stray = scanBraces('.a {\n  color: red;\n}\n\n}\n\n.b { color: blue; }');
  assert.equal(stray?.line, 5, 'known-bad: the stray brace must be reported at its own line');
  assert.match(stray.reason, /stray closing brace/, 'known-bad: the stray brace must be named as such');
  console.log(`PASS known-bad: a stray top-level "}" is caught at line ${stray.line}`);

  const unclosed = scanBraces('.a { color: red; }\n\n.b {\n  color: blue;\n');
  assert.equal(unclosed?.line, 3, 'known-bad: an unclosed block must be reported at the line it opened');
  assert.match(unclosed.reason, /never closed/, 'known-bad: an unclosed block must be named as such');
  console.log(`PASS known-bad: an unclosed block is caught at its opening line ${unclosed.line}`);

  const nested = scanBraces('.a { color: red; }\n/* prose citing a /* Player Strip Carousel */ block */\n.b { color: blue; }');
  assert.equal(nested?.line, 2, 'known-bad: a nested comment opener must be reported at its line');
  assert.match(nested.reason, /no comment open/, 'known-bad: the early close must be named by its leftover `*/`');
  // MUST-NOT-RED. This is the case the first version of the rule failed: a comment carrying a glob
  // holds a `/` followed by a `*` and looks exactly like a nested opener to a rule that tests the
  // opening token. Real prose under src/ does this, so a false red here would be a gate nobody trusts.
  assert.equal(
    scanBraces('/* see src/play/** and scripts/*.mjs for the walk */\n.a { color: red; }'),
    null,
    'known-good: a glob inside a comment must not read as a nested opener',
  );
  assert.equal(
    scanBraces('/* a ** b *** c */\n.a { color: red; }'),
    null,
    'known-good: runs of asterisks inside a comment must not red',
  );
  console.log(`PASS known-bad: a "/*" inside a comment is caught at line ${nested.line} even though the braces balance`);

  const openComment = scanBraces('.a { color: red; }\n/* opened and never closed {\n');
  assert.equal(openComment?.line, 2, 'fail-closed: a file ending inside a comment must red, not be counted');
  console.log('PASS fail-closed: a file ending inside an unclosed comment reds instead of being counted');

  const openString = scanBraces('.a::after { content: "oops;\n}\n');
  assert.match(openString?.reason ?? '', /unterminated string/, 'fail-closed: a raw newline inside a string must red');
  console.log('PASS fail-closed: an unterminated string literal reds instead of being counted');
}

if (process.argv.includes('--selftest')) {
  selftest();
} else {
  const files = collectStylesheets(path.join(repoRoot, 'src'));
  if (files.length === 0) {
    console.error('css-brace-balance-check: enumerated 0 stylesheets under src/ — the walk is broken, not the tree');
    process.exit(1);
  }

  const faults = [];
  for (const abs of files) {
    const rel = path.relative(repoRoot, abs);
    let fault;
    try {
      fault = scanBraces(fs.readFileSync(abs, 'utf8'));
    } catch (err) {
      // Unreadable is unparseable: red, never skip.
      fault = { line: 0, reason: `could not be read (${err.message})` };
    }
    if (fault) faults.push({ rel, ...fault });
  }

  if (faults.length > 0) {
    for (const f of faults) console.error(`${f.rel}:${f.line}: ${f.reason}`);
    console.error(
      `\ngh#184: unbalanced braces are a WARNING to esbuild, not an error — the build ships and the rule after the fault is dropped. ${faults.length} stylesheet(s) of ${files.length} are unbalanced. Fix the brace in place, even in a lifted style.css (docs/agents/play-route-recipe.md step 5).`,
    );
    process.exit(1);
  }

  console.log(
    `css-brace-balance-check: ${files.length} stylesheet(s) under src/ scanned, all brace-balanced (valid CSS NOT covered — see the disclosed ceiling in this file's header)`,
  );
}
