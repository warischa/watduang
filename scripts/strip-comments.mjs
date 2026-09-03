// One shared JS/TS comment stripper for the gate scripts under scripts/ (gh#191).
//
// WHY THIS EXISTS: ten gates each hand-rolled a comment stripper — regexes, or a character walk with
// its own quote tracking. ADR-0031: a classifier over a set the project does not own never converges,
// and the set here is the JS/TS comment / string / template / regex-literal grammar, owned by the
// language spec. Every hand-rolled version failed OPEN in the same direction — a `//` inside
// `'https://watduang.com/x'` reads as a comment opener and blanks the REST OF THE LINE, so live code
// after it stops existing for the gate that reads through it. That is ADR-0019's recorded hole class.
//
// HOW: the TypeScript parser (a devDependency already, and already imported by
// arm-gate-coverage-check.mjs, css-reachability-check.mjs and thai-comments.mjs — no dependency is
// added) decides where every quoted value starts and ends. Comment detection is then a linear walk
// that skips those spans: outside a quoted value a `//` or `/*` is a comment opener and nothing else,
// which is why this needs no heuristic of its own. The hard half is delegated to the owner of the
// grammar; the easy half is exhaustive by construction.
//
// WHY NOT the parser's own trivia (ts.forEachLeading/TrailingCommentRange over the tree, the shape
// thai-comments.mjs uses): ts.forEachChild does not visit punctuation tokens, so a comment that is
// leading trivia of a closing `}` is never reached. Measured, not assumed — over the fixture in
// selftest() below, that walk left `function f() { g(); /* inner */ }` and `if (x) { y(); // c` fully
// unblanked. Fail-OPEN for a gate: comment prose would scan as code. The walk here covers every byte.
//
// WHY NOT ts.createScanner: it cannot tell `/` division from a regex literal without the previous
// significant token, so it needs the same heuristic this file is here to delete.
//
// BLANKING, NOT DELETING: every comment character becomes a space, newlines are kept. Length, byte
// offsets, line numbers and column numbers are identical before and after — callers report line
// numbers off the stripped text and a deleting stripper would shift every one of them. Pinned in
// selftest().
//
// Usage:
//   import { stripComments } from './strip-comments.mjs';
//   stripComments(text)                       -> .ts / .astro frontmatter / anything TS-shaped
//   stripComments(text, ts.ScriptKind.JS)     -> .mjs / .js
//   node scripts/strip-comments.mjs --selftest -> both-direction calibration, exit 0

import assert from 'node:assert/strict';
import ts from 'typescript';
import fs from 'node:fs';

/** Re-exported so a caller that scans `.mjs`/`.js` can pick the JS grammar without importing
 *  `typescript` itself for one enum member. */
export const JS = ts.ScriptKind.JS;

/** Every token kind whose TEXT is a quoted value rather than code. A `//` or `/*` landing inside one
 *  of these is not a comment opener, however it looks. The template chunks (head/middle/tail and the
 *  no-substitution form) are what make an interior line of a multi-line template literal correct
 *  without enumerating anything per line; the `${...}` expressions BETWEEN them are deliberately not
 *  in this set, because a `//` there really is a comment. Same set as arm-gate-coverage-check.mjs's
 *  QUOTED_VALUE_KINDS, which is the pin this stripper was built to satisfy. */
const QUOTED_VALUE_KINDS = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.RegularExpressionLiteral,
]);

/** Character spans of every quoted value in `text`, ascending by start. ts.createSourceFile is
 *  error-tolerant by design and never throws, so a fragment or a half-HTML .astro template degrades
 *  to fewer spans rather than an exception — see the DEGRADES paragraph on stripComments(). */
export function quotedValueSpans(text, scriptKind = ts.ScriptKind.TS) {
  const sf = ts.createSourceFile('scan.ts', text, ts.ScriptTarget.Latest, /* setParentNodes */ false, scriptKind);
  const spans = [];
  (function walk(node) {
    if (QUOTED_VALUE_KINDS.has(node.kind)) spans.push([ts.skipTrivia(text, node.pos), node.end]);
    ts.forEachChild(node, walk);
  })(sf);
  return spans.sort((a, b) => a[0] - b[0]);
}

/** Blanks every `//` and block comment in `text` to spaces, preserving newlines and every offset.
 *
 *  DEGRADES, not throws: text the parser cannot read (an .astro template body is HTML, not TS) yields
 *  too few quoted-value spans, and this walk then behaves like the textual strippers it replaces —
 *  fail-OPEN, in exactly the direction they already failed. A caller that needs a guarantee asks the
 *  parser whether the file parsed (arm-gate-coverage-check.mjs's assertParses() is that check) rather
 *  than trusting this function to notice. */
export function stripComments(text, scriptKind = ts.ScriptKind.TS) {
  const spans = quotedValueSpans(text, scriptKind);
  const out = text.split(''); // UTF-16 units, not code points: [...text] would shift offsets on astral chars
  const blankTo = (from, to) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  let s = 0;
  let i = 0;
  while (i < text.length) {
    while (s < spans.length && spans[s][1] <= i) s++;
    if (s < spans.length && i >= spans[s][0]) {
      i = spans[s][1]; // inside a quoted value: no comment can open here
      continue;
    }
    if (text[i] === '/' && (text[i + 1] === '/' || text[i + 1] === '*')) {
      let end;
      if (text[i + 1] === '/') {
        const nl = text.indexOf('\n', i);
        end = nl === -1 ? text.length : nl;
      } else {
        const close = text.indexOf('*/', i + 2);
        end = close === -1 ? text.length : close + 2;
      }
      blankTo(i, end);
      i = end;
    } else {
      i++;
    }
  }
  return out.join('');
}

// --- selftest -----------------------------------------------------------------------------------
// Both directions, because a stripper that only ever blanks more is as broken as one that blanks
// less. Every non-firing case carries its own positive control: the textual regex this module
// replaces is run on the same input and asserted to GET IT WRONG, so a fixture that never reaches the
// hazard cannot pass as a fix (ADR-0030).

const TEXTUAL_LEGACY = (t) => t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));

function selftest() {
  // FIRING: a real comment is blanked, in every position a gate reads through.
  for (const [label, src, gone] of [
    ['line comment', "el('button'); // href=\n", 'href='],
    ['block comment', "el('button'); /* <a  */\n", '<a '],
    ['multi-line block', 'a;\n/* href=\n   still comment */\nb;\n', 'href='],
    ['comment before a closing brace', 'function f() { g(); /* href= */ }\n', 'href='],
    ['comment on the last line, no trailing newline', 'g();\n// href=', 'href='],
    ['comment inside a template expression', 'const t = `x ${ y // href=\n }`;\n', 'href='],
  ]) {
    assert.ok(src.includes(gone), `${label}: fixture must contain the needle it claims to hide`);
    assert.ok(!stripComments(src).includes(gone), `${label}: a real comment must be blanked`);
  }

  // NOT FIRING: a comment opener inside a quoted value is not an opener, and the live code after it
  // on that line must survive. Each case also asserts the legacy textual strip DID eat it.
  for (const [label, src, kept] of [
    ['// inside a string', "const u = 'https://x/y'; el('button');\n", "el('button')"],
    ['/* inside a string, pairing with a real closer later in the FILE', "const n = 'see /* spec';\nel('button');\n/* real */\n", "el('button')"],
    ['// on an interior line of a template literal', 'const t = `a\nb // c ${x}`; el(\'button\');\n', "el('button')"],
    ['// inside a regex literal', "const r = /[//]/; el('button');\n", "el('button')"],
  ]) {
    assert.ok(
      !TEXTUAL_LEGACY(src).includes(kept),
      `${label}: POSITIVE CONTROL FAILED — the textual stripper this module replaces did NOT eat ` +
        `\`${kept}\` on this input, so the fixture never reaches the hazard and proves nothing`,
    );
    assert.ok(stripComments(src).includes(kept), `${label}: live code after a quoted opener must survive`);
  }

  // OFFSETS: blanked, never deleted. Length, newline count and every line's length are unchanged,
  // or every line number a caller reports off the stripped text silently shifts.
  const offsets = "a; // one\nconst u = 'http://x'; /* two\nthree */ b;\n`t ${/* four */ 0}`\n";
  const stripped = stripComments(offsets);
  assert.equal(stripped.length, offsets.length, 'stripping must preserve length');
  assert.deepEqual(
    stripped.split('\n').map((l) => l.length),
    offsets.split('\n').map((l) => l.length),
    'stripping must preserve every line length, not just the total',
  );

  // SCRIPT KIND: .mjs is fed as JS, where `<` is never a type assertion. Both kinds must strip.
  assert.ok(!stripComments("const a = b < c; // href=\n", ts.ScriptKind.JS).includes('href='));

  // UNPARSEABLE INPUT DEGRADES, never throws — the .astro-template case, stated as a ceiling.
  assert.ok(stripComments('<p>hi</p>\n// href=\n').includes('<p>hi</p>'));

  console.log('PASS strip-comments: comments blanked in 6 position(s); 4 quoted-value opener(s) left alone, each with the legacy stripper failing them as the positive control; offsets preserved.');
}

// Guarded on being the ENTRY module, not just on argv: every caller here is a gate run as
// `node <gate>.mjs --selftest`, and an argv-only check made this module's selftest run on import
// inside all of them — measured, it printed its PASS line from inside repo-root-walk-check.
//
// Both sides are realpath'd. `import.meta.filename` already is; `process.argv[1]` is only
// path-resolved, so reached through a symlink the two never matched and `--selftest` printed
// nothing and exited 0 — a check that runs nowhere reads exactly like a check that passes.
// Measured before this fix: `node <symlink-to-this-file> --selftest` -> exit 0, zero output.
// Not reachable on the GitHub runner, whose checkout path holds no symlink, but a local clone
// under one turned `npm run strip-comments` into a green that ran nothing.
function isEntryModule() {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  try {
    return fs.realpathSync(argv1) === import.meta.filename;
  } catch {
    // argv[1] does not resolve (deleted, or a bare specifier). Fail CLOSED: do not claim to be the
    // entry module, so an import inside a gate can never trigger the selftest.
    return false;
  }
}
if (isEntryModule() && process.argv.includes('--selftest')) selftest();
