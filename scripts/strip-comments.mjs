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
//   legacyTextualStrip(text)                  -> the regex this replaces, for a POSITIVE CONTROL only
//   GLOB_TEMPLATE_FIXTURE                     -> the gh#191 DoD fixture, red under legacy, green here
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

/** Character regions of an .astro file that TypeScript really owns: the frontmatter fence body and
 *  every JS `<script>` body. Everything else is HTML template text, whose grammar TypeScript does not
 *  own — see stripAstro(). A `<script>` carrying a non-JS `type` (application/ld+json is the one this
 *  repo ships) is NOT included: its body is data, and a `//` inside a JSON string is not a comment. */
function astroCodeRegions(text) {
  const regions = [];
  const fence = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (fence) {
    const start = text.indexOf('\n') + 1;
    regions.push([start, start + fence[1].length, ts.ScriptKind.TS]);
  }
  for (const m of text.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    const type = /\btype\s*=\s*['"]?([^'"\s>]+)/.exec(m[1]);
    if (type && !/javascript|module|^ts$/i.test(type[1])) continue; // ld+json and friends are data
    const start = m.index + m[0].indexOf(m[2], m[1].length);
    regions.push([start, start + m[2].length, ts.ScriptKind.JS]);
  }
  return regions;
}

/** Blanks the comments of an .astro FILE, and only where a comment can exist.
 *
 *  WHY THIS IS NOT stripComments(): gh#191 converted six gates to the parser-backed stripper, and an
 *  adversarial review then reproduced a fail-OPEN it introduced one grammar over. In template position
 *  there are no quoted-value spans to find — HTML text and UNQUOTED attribute values are not string
 *  literals to TypeScript — so a bare `://` read as a line comment and blanked the rest of its line.
 *  Reproduced before this fix on the reviewer's input, through both gates on a real tree copy: the
 *  pre-conversion versions of party-size-claim-check and stable-exit-markers-check both reported the
 *  violation, the converted versions both reported clean. Two gates silent on content they exist to
 *  catch. Same class as the bug commit dd4db7e closed, re-opened in HTML rather than in JS.
 *
 *  THE RULE, which is ADR-0031 applied to the second grammar in the file: delegate each region to the
 *  parser that owns it, and claim nothing about the region nobody here owns. Frontmatter and JS script
 *  bodies go to the TypeScript parser. Template text keeps exactly one rule — `{/* … *\/}`, the Astro
 *  brace comment, whose BOTH delimiters are explicit and which is the only comment form this repo's
 *  templates use. A `//` or a bare `/*` in template text is markup, not a comment, and is left alone.
 *
 *  DIRECTION OF THE RESIDUE: a real comment left unblanked makes a gate read prose as code and go RED —
 *  a human looks. That is the safe way to be wrong, and it is the opposite of what this replaces. */
export function stripAstro(text) {
  const out = text.split('');
  for (const [from, to, kind] of astroCodeRegions(text)) {
    const stripped = stripComments(text.slice(from, to), kind);
    for (let k = 0; k < stripped.length; k++) out[from + k] = stripped[k];
  }
  // A <style> body is CSS, a third grammar in the same file. TypeScript does not own it either, but
  // CSS block comments have BOTH delimiters explicit, so blanking them enumerates nothing the CSS spec
  // has an opinion about — and `//` is not a comment in CSS at all, which is the whole hazard, gone.
  // Measured: without this arm the accent gate read 5 lines of CSS comment prose as declarations.
  let joined = out.join('');
  for (const m of [...joined.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/g)]) {
    const from = m.index + m[0].indexOf(m[2], m[1].length);
    const cleaned = m[2].replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
    joined = joined.slice(0, from) + cleaned + joined.slice(from + cleaned.length);
  }

  // Astro brace comments, in template position and anywhere else: both delimiters are explicit, so
  // this enumerates nothing the language spec has an opinion about.
  return joined.replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => m.replace(/[^\n]/g, ' '));
}

// --- selftest -----------------------------------------------------------------------------------
// Both directions, because a stripper that only ever blanks more is as broken as one that blanks
// less. Every non-firing case carries its own positive control: the textual regex this module
// replaces is run on the same input and asserted to GET IT WRONG, so a fixture that never reaches the
// hazard cannot pass as a fix (ADR-0030).

/** The textual stripper this module replaces. EXPORTED FOR CALIBRATION ONLY — never to strip with.
 *  A converted gate uses it the same way selftest() does: assert the old shape gets a fixture WRONG,
 *  so the assertion that the new one gets it right cannot be unfailable by construction (ADR-0030). */
export const legacyTextualStrip = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));

const TEXTUAL_LEGACY = legacyTextualStrip;

/** gh#191 DoD fixture. Two shapes in one file, both of which desync a textual stripper and neither of
 *  which is a comment:
 *    - a glob string holding a slash-star, which a regex pairs with the next REAL block-comment closer
 *      further down the file, blanking every live line between them (openers and closers desync);
 *    - a multi-line template literal whose interior lines carry comment openers, which are template TEXT.
 *  `liveLine` is the caller's own needle — the code a converted gate reads and must survive; each gate
 *  passes the line IT looks for, because a fixture carrying someone else's needle proves nothing about
 *  this gate. The genuine trailing comment is what the glob's phantom opener pairs with under the
 *  legacy regex, and it is the one thing in the fixture that must really be blanked. */
export const globTemplateFixture = (liveLine = "const MARKER = 'data-stable-exit';") =>
  [
    "const globs = ['../../games/*.ts', '!../../games/_*.ts'];",
    'const t = `first line',
    '  // this is template text, not a comment',
    '  /* and so is this opener, which never closes inside the template',
    '  ${globs.length}`;',
    liveLine, // the caller's own needle, INSIDE the span the legacy regex blanks
    '/* real */',
    'void t; void globs;',
  ].join('\n');

export const GLOB_TEMPLATE_FIXTURE = globTemplateFixture();

/** The .astro companion to globTemplateFixture(), and the reason it exists: that fixture is pure
 *  TypeScript, so no converted gate's selftest ever reached TEMPLATE position, and a fixture that
 *  cannot reach a hazard cannot report it. This one puts the caller's needle after a bare `://` in
 *  HTML text and inside an UNQUOTED attribute value — the two positions where the TypeScript parser
 *  finds no quoted-value span to protect, which is what made stripComments() blank the rest of the
 *  line. The frontmatter and script bodies carry real comments that must still be blanked, so the leg
 *  fails if the fix over-corrects into stripping nothing at all. */
export const astroTemplateFixture = (needle = 'data-stable-exit') =>
  [
    '---',
    `const doc = 'https://watduang.com/rules'; // ${needle} — a real comment, in frontmatter`,
    '---',
    `<p>… https://watduang.com/rules ${needle} <a href=https://x rel=noopener>`,
    '<script>',
    `  const u = 'https://watduang.com/x'; // ${needle} — a real comment, in a script body`,
    '</script>',
  ].join('\n');

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

  // gh#191 DoD FIXTURE: glob + multi-line template, red under the legacy regex, green here. Asserted
  // in both directions and for both grammars, because every converted gate scans .ts/.astro and .mjs.
  for (const kind of [ts.ScriptKind.TS, ts.ScriptKind.JS]) {
    assert.ok(
      !legacyTextualStrip(GLOB_TEMPLATE_FIXTURE).includes('data-stable-exit'),
      'POSITIVE CONTROL FAILED — the legacy regex must lose the live MARKER line to the glob/closer desync, ' +
        'or this fixture never reaches the hazard and greening it proves nothing',
    );
    const s = stripComments(GLOB_TEMPLATE_FIXTURE, kind);
    assert.ok(s.includes('data-stable-exit'), 'the live MARKER after a glob and a template must survive');
    assert.ok(s.includes('../../games/*.ts'), 'the glob itself is a string value, not a comment opener');
    assert.ok(s.includes('${globs.length}'), 'a template expression is code and must survive');
    assert.ok(!/\/\* real \*\//.test(s), 'the one genuine comment in the fixture must still be blanked');
    assert.ok(s.includes('this is template text'), 'an interior template line is TEXT, not a comment, and must be kept');
  }

  // gh#191 REVIEW FIX: the .astro TEMPLATE-position fixture. stripComments() is asserted to GET THIS
  // WRONG — it is the pre-fix behaviour, and it is what made two gates go silent — while stripAstro()
  // keeps the template needle and still blanks the two real comments around it.
  const astroFx = astroTemplateFixture('data-stable-exit');
  assert.ok(
    !stripComments(astroFx).includes('rel=noopener'),
    'POSITIVE CONTROL FAILED — stripComments() must still blank template text after a bare `://`, or ' +
      'this fixture no longer reaches the hazard stripAstro() exists to close',
  );
  const astroOut = stripAstro(astroFx);
  assert.ok(astroOut.includes('rel=noopener'), 'template text after a bare `://` must survive: it is markup, not a comment');
  assert.ok(astroOut.includes('https://x'), 'an unquoted attribute value is not a quoted span, and must survive anyway');
  assert.equal(astroOut.match(/a real comment/g), null, 'the real comments in frontmatter and in the script body must both still be blanked');
  assert.equal(astroOut.length, astroFx.length, 'stripAstro must blank, never delete');

  // SCRIPT KIND: .mjs is fed as JS, where `<` is never a type assertion. Both kinds must strip.
  assert.ok(!stripComments("const a = b < c; // href=\n", ts.ScriptKind.JS).includes('href='));

  // UNPARSEABLE INPUT DEGRADES, never throws — the .astro-template case, stated as a ceiling.
  assert.ok(stripComments('<p>hi</p>\n// href=\n').includes('<p>hi</p>'));

  console.log('PASS strip-comments: comments blanked in 6 position(s); 4 quoted-value opener(s) left alone, each with the legacy stripper failing them as the positive control; offsets preserved; the gh#191 glob+multi-line-template fixture greens in both script kinds where the legacy regex loses the live line.');
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
