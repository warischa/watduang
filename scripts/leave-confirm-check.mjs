#!/usr/bin/env node
// Static regression tripwire for ADR-0015 (docs/adr/0015-a-leave-confirm-guards-the-links-we-cannot-move.md):
// the closed #leave-confirm dialog must stay inert, its clearance budget must stay within the half of
// the viewport the finger is not in, and pendingHref must clear on every dismissal path, not per-button.
// Since gh#55 it also covers ADR-0024 (docs/adr/0024-the-reflow-is-the-hazard-not-the-clearance.md):
// #clear-choice is the file's second <dialog>, and (e) pins the two properties that make it one — it
// stays out of flow (a <div> here is the reflow hazard itself), and it fails SAFE, the opposite of
// #leave-confirm's deliberate fail-OPEN, because the question it asks guards a destructive clear.
// This is a cheap source-text check, NOT the proof — scripts/leave-confirm-probe.mjs (build + serve +
// headless Chrome, reads real client rects, elementFromPoint, and actual taps) is what proves the
// invariant, and per ADR-0018 it never runs in CI. This script only catches the same four shipped
// defects being reintroduced into source before that heavier probe ever runs by hand.
//
// ponytail: raw source scan over exactly two files (src/styles/tokens.css, src/shell/PlayerSetup.astro).
// It cannot see that the closed dialog has zero client rects or refuses elementFromPoint — only the
// probe measures the rendered DOM. And a `display:` rule for #leave-confirm or a bare `dialog` arriving
// from any OTHER stylesheet reproduces the exact bug this scan exists to catch, invisibly to it.
//
// Every match here runs on comment-stripped text, in BOTH directions at once: a commented-out line
// can no longer SATISFY a "must be present" check (c, d), and a commented-out mention can no longer
// TRIP a "must not appear" check (a). The stripper is textual, so a `//` inside a string literal
// (none in either file today) would be read as a comment. The [open] gate flattens `:not(...)` before
// looking for `[open]`, so `#leave-confirm:not([open]) { display: block }` — which targets precisely
// the CLOSED dialog — now fails; that flattening is one non-nesting `[^)]*` pass, so a nested form
// like `:not(:is([open]))` is past what it can read. (a) grades each compound of a selector LIST
// separately (splitSelectorList below): reading the list as one string let one compound's `[open]`
// vouch for an ungated neighbour across the comma.
//
//   node scripts/leave-confirm-check.mjs             -> scan the two files, exit non-zero if any hit
//   node scripts/leave-confirm-check.mjs --selftest  -> both-direction calibration on temp fixtures

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const CSS_FILE = path.join(repoRoot, 'src/styles/tokens.css');
// gh#106 — two islands since the leave-confirm moved out of PlayerSetup.astro into its own component:
// (c)/(d) live in LeaveConfirm.astro, (e)'s #clear-choice stays with the panel it answers for. Both are
// read on every run and presence is graded over the union — see checkPlayerSetupAstro's header.
const ASTRO_FILES = ['src/shell/LeaveConfirm.astro', 'src/shell/PlayerSetup.astro'];
// The one file stripComments()' precondition pin below walks: it is the file that carries the guard
// conditions (c)/(d) grade, so a `//` inside a quoted value there is what could blank live code.
const ASTRO_FILE = path.join(repoRoot, 'src/shell/LeaveConfirm.astro');

// Every .astro file under src/, relPath -> text. (f) discovers the dialog's owner by reading the tree
// rather than being told which file it is: a list would go stale the moment the island moves again,
// and "found in two files" is itself a finding.
function listAstroFiles(root = path.join(repoRoot, 'src')) {
  const out = new Map();
  for (const entry of fs.readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.astro')) continue;
    const abs = path.join(entry.parentPath ?? entry.path, entry.name);
    out.set(path.relative(repoRoot, abs).split(path.sep).join('/'), fs.readFileSync(abs, 'utf8'));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pure: text -> violations. No file IO here, so the selftest can feed it strings read back from a
// temp fixture, exactly the way main() feeds it text read from the two real files.
// ---------------------------------------------------------------------------
function parseCssRules(text) {
  // ponytail: DISCLOSED CEILING, gh#186 / ADR-0056 — strip comments first, because this file's own
  // header talks about display/dvh in prose. The set enumerated is "text that is a CSS comment", owned
  // by the CSS grammar, not by this repo, so it does not converge: a `/*` inside a string value
  // (content: "/*", a url() with one in it) pairs with the next real `*/` and every declaration
  // between them stops existing, so the confirm-overlay rules go unchecked and the gate greens.
  // Deletes rather than blanks, so offsets shift too — acceptable only because parseCssRules reports
  // selectors, never line numbers. Bounded, not closed: the input is the two authored files main()
  // names, both agent-authored, guarded at authorship per ADR-0026. Trigger to close it: this parser
  // ever fed a file this repo does not author, or a `/*` appearing inside a CSS string here — then
  // conserve on the selector names the checks require (raw-present, stripped-absent) and abort before
  // printing, the way accent-single-source-check's conservationFailures does.
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(clean))) rules.push({ selector: m[1].trim(), body: m[2] });
  return rules;
}

// #clear-choice joined this set in gh#55 (ADR-0024): it is a second <dialog> in the same file, and a
// display: rule that escapes its [open] gate paints it in flow on all 9 pages with a destructive
// confirm button live — the identical defect (a) was written for, one id over.
// Single source of truth for how many dialogs (a) actually polices — main()'s success line counts THIS
// array's length rather than printing a literal, so a dialog silently dropping out of it shows up in
// the printed number instead of the line lying about coverage it no longer has (adversarial review, Hole 2).
const GUARD_DIALOG_IDS = ['#leave-confirm', '#clear-choice'];
const targetsGuardDialog = (sel) =>
  GUARD_DIALOG_IDS.some((id) => new RegExp(`${id}\\b`).test(sel)) || /(^|[^\w-])dialog(?![\w-])/.test(sel);

// A selector LIST is N independent selectors sharing one body, and CSS applies the body to each of
// them separately — so (a) has to grade each one separately too. Reading the whole list as one string
// let `#leave-confirm[open], #clear-choice { display: flex }` pass: the `[open]` from the FIRST
// compound satisfied the gate for the SECOND, which is ungated and paints the closed dialog. That is
// the exact ADR-0015 defect, laundered through a comma. tokens.css already ships a real list
// (`#leave-confirm[open].at-bottom, #leave-confirm[open].at-top`), so splitting is the shape the file
// actually uses, not a hypothetical.
// Depth-aware: a comma inside :is(...) / :not(...) / :where(...) is an argument separator, not a list
// separator, and splitting there would invent compounds that do not exist.
// ponytail: paren depth only. A comma inside an attribute-value string (`[data-x=","]`) would still
// split — no such selector exists here, and the fail direction is an extra ungated-looking compound,
// i.e. red, i.e. a human looks. Upgrade path is a real selector parser, not a wider regex.
function splitSelectorList(sel) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < sel.length; i++) {
    if (sel[i] === '(') depth++;
    else if (sel[i] === ')') depth--;
    else if (sel[i] === ',' && depth === 0) {
      out.push(sel.slice(start, i));
      start = i + 1;
    }
  }
  out.push(sel.slice(start));
  return out.map((s) => s.trim()).filter(Boolean);
}

// Astro/JSX brace comments first, then block, then line — same order (and same reason) as
// scripts/stable-exit-markers-check.mjs's: nothing left inside a multi-line form may be re-read as a
// line comment. Each comment is replaced by spaces rather than deleted, so offsets and line numbers
// are unchanged and a match's position still points at the real source line.
const blank = (m) => m.replace(/[^\n]/g, ' ');
function stripComments(text) {
  return text
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/\/\/[^\n]*/g, blank);
}

/** Every comment opener that stripComments() above would act on textually — one per line, the first
 *  one, because that regex blanks from it and nothing after it is ever re-read. Two kinds:
 *  `kind: '//'` blanks to END OF LINE; `kind: '/*'` blanks to the next textual block-comment terminator, which may be
 *  MANY LINES DOWN. `inString` marks the openers that are not comment openers at all: the stripper is
 *  textual, so a `//` inside a quoted value (`href="https://schema.org/X"`, `'//cdn/x.js'`), inside a
 *  template literal, or inside an `<!-- -->` comment takes the rest of that line with it, and a `/*`
 *  inside any of those takes every live line down to the next block-comment terminator — in both cases the live code is
 *  invisible to (c)/(d)/(e), fail-OPEN, ADR-0019's hole class. Exists only to pin that precondition;
 *  the selftest below runs it over the real scanned file. A genuine block comment is walked as state,
 *  not reported: `kind: '/*'` is only ever emitted from a string or an HTML comment, so it is always
 *  the hazard shape.
 *
 *  In-string test: a per-FILE character walk, not a per-line count. Template-literal depth (with `\``,
 *  and `${ }` holes where a nested template raises the depth again), `<!-- -->` comments, and block
 *  comments are all carried across newlines. `'` and `"` are the exception: they RESET at every line
 *  start. That reset is a deliberate fail-OPEN trade, NOT a language guarantee — ASTRO_FILE is HTML as
 *  well as JS, and HTML permits a multi-line attribute value, so the reset is what leaves that rung
 *  open (see the ceiling below). It buys the far commoner case: an unpaired apostrophe in markup or
 *  comment prose would otherwise poison every following line of the file. A real comment opener ends
 *  the walk for its own line — quotes and backticks inside comment prose are not code and must not
 *  move the state, which is also why `don't` … `stage's` in a comment cannot red.
 *
 *  ponytail: DISCLOSED CEILING — this walk enumerates a LANGUAGE-OWNED set, so it does NOT converge:
 *  every further way JS, HTML, or the Astro grammar can carry a quote character is another rung, and
 *  no number of arms closes a set someone else owns. Two rungs are open today, both MEASURED in the
 *  selftest's ceiling block below rather than reasoned about:
 *
 *  RUNG 1 — a lone backtick that is not a template delimiter: inside a regex literal (the walk has no
 *  regex-vs-division state) or in HTML text / an attribute value the Astro grammar permits. It flips
 *  template parity, and the effect is LOUD **OR** SILENT depending on what follows, never reliably
 *  loud. Loud: a `//` appearing while the spurious template is open reads inString, the pin reds and
 *  (see the `&&` note below) stops the gate. Silent, and this is the one that matters: the NEXT real
 *  template's opening backtick now CLOSES the spurious one instead of opening its own, so that
 *  template's interior is walked as CODE. Measured — `const re = /` + backtick + `/;` then a
 *  multi-line template whose interior line reads `ratio //3 <a data-stable-exit href="/games/">` —
 *  the walk reports that line inString:FALSE, the pin stays GREEN, and stripComments() blanks the
 *  live `data-stable-exit href` behind it. A parity flip has no fail direction of its own; it inverts
 *  whatever the file does next.
 *
 *  RUNG 2 — a multi-line HTML attribute value, which ASTRO_FILE's grammar permits and which the `'`/`"`
 *  per-line reset therefore cannot follow: `<a title="see` on one line, `//games ..." data-stable-exit
 *  href="/games/">` on the next. Measured: the continuation line reads inString:FALSE (the walk
 *  started that line in code context), the pin stays GREEN, and stripComments() blanks the whole live
 *  line from the `//` onward, `href` included. Silent, not loud.
 *
 *  Both rungs stay OPEN BY DESIGN. Closing rung 1 needs regex-vs-division state, closing rung 2 needs
 *  HTML tag-context state to know which quote is an attribute value and which is prose — each is a new
 *  grammar this gate would have to own, and rung 2's cheap version (carry `'`/`"` across newlines
 *  unconditionally) trades a rare silent miss for a common false red on every prose apostrophe, i.e.
 *  a dead gate. The residual is bounded, and that is the whole argument for a walk over a parser here:
 *  stripComments() is fed exactly ONE authored file (ASTRO_FILE), a file no contributor flow adds to,
 *  so the uncovered rungs are guarded at authorship per ADR-0026. That is a bound, NOT convergence —
 *  the set is still language-owned and still growing. Do NOT reach for the sibling gate's route —
 *  scripts/arm-gate-coverage-check.mjs is moving to a real parser because its input set is
 *  contributor-authored and growing; sharing a stripper across the two was refused on ownership
 *  grounds (gh#72, ADR-0030).
 *
 *  CLOSED, was a third rung: a `/*` inside a quoted value. stripComments() blanks block comments
 *  textually too, so an in-string `/*` blanks every live line down to the next textual terminator —
 *  the same hazard as `//`, with a longer blast radius. The walk used to pre-blank block comments with
 *  that same textual regex, so it could not see this at all AND walked corrupted text afterwards.
 *  Block-comment state is now walked (`block` below) and an in-string `/*` is reported as
 *  `kind: '/*'`. Measured both ways in the selftest; the real file's opener count is unchanged by it.
 *
 *  ponytail: KNOWN FALSE-REDS — re-derived against the walk. TWO shapes, neither in the scan set
 *  today. (i) an unpaired `'` in markup prose earlier on the same line as a `//`
 *  (`<p>don't stop</p> // note`) opens a string that stays open to end of line. Bounded to that
 *  single line by the newline reset. (ii) rung 1 above, on its LOUD branch only — a lone backtick
 *  followed by a `//` before any real template opens. Its other branch is a silent miss, not a red,
 *  which is why rung 1 is disclosed as loud-OR-silent and not listed as a false red alone.
 *  The two shapes listed here before the walk — a quote-character constant (`const q = '"';`) and an
 *  escaped quote (`"3\" x"`) — are NO LONGER false reds: the walk reads both correctly (measured
 *  against the new mechanism, not assumed).
 *
 *  A `//` inside an HTML comment is NOT on that list, though it looks like it belongs — the walk
 *  tracks `<!-- -->` on purpose so it stays a red rather than becoming one by accident. Measured:
 *  `<!-- ref: https://x --> <a data-stable-exit href="/games/">` strips to `<!-- ref: https:` —
 *  stripComments() blanks to end of line from inside the HTML comment and eats the real attribute
 *  sharing that line. The red is correct. Whether it is a hazard depends on what follows on the
 *  line, which the detector cannot know, so it flags the opener.
 *
 *  Cost of a false red is NOT just one annoyed commit. CI runs `--selftest && <the real scan>`, so
 *  a red here also short-circuits the scan — the gate does not merely complain, it does not run.
 *  That is the same `&&` trap ADR-0030 records, and it is why this stays a pin over a set that is
 *  measured rather than an assertion that could red on ordinary content.
 *
 *  A third red comes from a different mechanism, not from parity: the zero-openers control. If this
 *  gate's scan set ever legitimately carries no `//` at all — every comment converted to block form —
 *  the control fires, because a detector returning nothing and a genuinely clean set are the same
 *  output. That is the control working as designed, and it is why it is not softened.
 *
 *  Accepted deliberately: a pin that fails closed on an unowned set is the ADR-0019 doctrine, and
 *  the alternative is a detector that fails open on the hazard it was built for. Note what that does
 *  NOT cover: rung 1 and rung 2 fail OPEN, silently, and no doctrine makes them safe — only the
 *  one-authored-file bound does. Trigger to revisit: either open rung, or either false-red shape,
 *  landing in this gate's scan set, OR an owner ruling that a precondition violation
 *  should warn rather than fail — that second one moves the pin out from behind the `&&` and is a
 *  different change from widening the detector. The state walk WAS the upgrade path and it is built;
 *  the next rung is another state arm (regex literals) in this same walk, never a per-shape
 *  exemption, which grows the detector in the fail-open direction. */
function findLineCommentOpeners(text) {
  const src = text;
  const found = [];
  // Template-literal state, and ONLY that, survives a newline among the STRING forms. `'` and `"` are
  // reset at every line start — see the header: that is a deliberate fail-OPEN trade against prose
  // apostrophes, not a language guarantee, and it is what leaves the multi-line HTML attribute rung open.
  const stack = []; // 'tpl' = inside a template literal · a number = brace depth inside a ${ } hole
  let html = false; // inside an <!-- --> comment, which also spans lines and which stripComments() does NOT blank
  // Block-comment state is walked here rather than pre-blanked textually. A textual pre-pass could not
  // tell `/*` in code from `/*` inside a quoted value, so it blanked from an in-string `/*` to the next
  // real `*/` — silently, across lines, exactly like stripComments() does — and the walk then read
  // already-corrupted text. Walking it means an in-string `/*` is REPORTED (kind '/*') instead.
  let block = false;
  for (const [i, line] of src.split('\n').entries()) {
    let quote = null;
    let kind = null;
    let c = 0;
    for (; c < line.length; c++) {
      const ch = line[c];
      if (block) {
        if (ch === '*' && line[c + 1] === '/') { block = false; c++; }
        continue;
      }
      if (html) {
        // No escapes in HTML, and no strings: nothing in here may move the template stack. A `//` in
        // here is still a hazard — stripComments() blanks from it past the `-->` and eats live markup
        // that shares the line — so it is reported the same way an in-string one is.
        if (ch === '-' && line.startsWith('-->', c)) { html = false; c += 2; }
        else if (ch === '/' && line[c + 1] === '/') { kind = '//'; break; }
        else if (ch === '/' && line[c + 1] === '*') { kind = '/*'; break; }
        continue;
      }
      if (ch === '\\') { c++; continue; } // one escape, one skip — this is what keeps \` from closing a template
      const top = stack.at(-1);
      if (quote) {
        if (ch === quote) quote = null;
        else if (ch === '/' && line[c + 1] === '/') { kind = '//'; break; }
        else if (ch === '/' && line[c + 1] === '*') { kind = '/*'; break; }
        continue;
      }
      if (top === 'tpl') {
        if (ch === '`') stack.pop();
        else if (ch === '$' && line[c + 1] === '{') { stack.push(0); c++; }
        else if (ch === '/' && line[c + 1] === '/') { kind = '//'; break; }
        else if (ch === '/' && line[c + 1] === '*') { kind = '/*'; break; }
        continue;
      }
      // Code context: file top level, or inside a ${ } hole (where a nested template raises depth again).
      if (ch === '<' && line.startsWith('<!--', c)) { html = true; c += 3; }
      else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '`') stack.push('tpl');
      else if (ch === '{' && typeof top === 'number') stack[stack.length - 1] = top + 1;
      else if (ch === '}' && typeof top === 'number') { if (top === 0) stack.pop(); else stack[stack.length - 1] = top - 1; }
      else if (ch === '/' && line[c + 1] === '*') { block = true; c++; } // a REAL block comment: skip it, do not report
      else if (ch === '/' && line[c + 1] === '/') { kind = '//'; break; }
    }
    // Reported at most once per line, at the first opener, because stripComments() blanks from a `//`
    // to EOL (and from an in-string `/*` to the next textual `*/`, past the newline) and nothing after
    // it is ever re-read. A real comment opener also ends the walk for this line: quotes and backticks
    // inside comment prose are not code and must not move the state. `kind === '/*'` is only ever set
    // in a string/HTML-comment context, so it is always a hazard, never an ordinary block comment.
    if (kind) found.push({ line: i + 1, kind, inString: kind === '/*' || html || quote !== null || stack.at(-1) === 'tpl', text: line.trim() });
  }
  return found;
}

// A selector is gated on [open] only if `[open]` survives flattening every `:not(...)` group away.
// `#leave-confirm:not([open])` contains the string `[open]` while targeting the exact opposite set —
// the closed dialog, which is the bug ADR-0015 exists to prevent.
const gatedOnOpen = (sel) => /\[open\]/.test(sel.replace(/:not\([^)]*\)/g, ' '));

// (a) + (b): src/styles/tokens.css
// `checked`, when passed, is an out-param main() uses to size the success line — pushed to only as each
// condition actually runs, never a hardcoded count (adversarial review, Hole 2). selftest never passes
// it, so every existing assertion on the return value (violations only) is untouched.
function checkTokensCss(text, checked) {
  const violations = [];
  const rules = parseCssRules(text);

  // (a) a rule targeting #leave-confirm (or a bare `dialog`) that sets display: must be gated on
  // [open], or it beats the UA's `dialog:not([open]) { display: none }` and the closed dialog paints.
  checked?.push('a');
  for (const { selector, body } of rules) {
    if (!/\bdisplay\s*:/.test(body)) continue;
    for (const one of splitSelectorList(selector)) {
      if (targetsGuardDialog(one) && !gatedOnOpen(one)) {
        violations.push(`(a) selector "${one}" sets display: without [open] gating — closed <dialog> becomes hit-testable`);
      }
    }
  }

  // (b) the open-gated block's max-block-size is the clearance budget: 0.45H + 16 < 0.5H only holds
  // at <= 45dvh. Missing entirely is as broken as too large — the invariant would be unenforced.
  checked?.push('b');
  const base = rules.find((r) => r.selector === '#leave-confirm[open]');
  if (!base) {
    violations.push('(b) no #leave-confirm[open] rule found to check max-block-size against');
  } else {
    const m = base.body.match(/max-block-size\s*:\s*([\d.]+)dvh/);
    if (!m) {
      violations.push('(b) #leave-confirm[open] has no max-block-size — the half-viewport clearance invariant is unenforced');
    } else if (Number(m[1]) > 45) {
      violations.push(`(b) #leave-confirm[open] max-block-size is ${m[1]}dvh, must stay <= 45dvh (0.45H + 16 < 0.5H)`);
    }
  }

  return violations;
}

// (c) + (d) + (e): src/shell/PlayerSetup.astro. `checked` is the same optional out-param as
// checkTokensCss's — see its comment.
// `rawText` may be ONE file's text (every selftest fixture below) or an ARRAY of them (main() passes
// two since gh#106 split the leave-confirm out of PlayerSetup.astro into its own island: the two
// dialogs now live in two files, and (c)/(d) grade one of them while (e) grades the other). Presence
// is graded over the UNION, so a single-text call behaves exactly as before. The looseness that buys
// is real and bounded: (c)'s close listener could be satisfied from either file rather than from the
// file that declares #leave-confirm. It is accepted because the alternative — one required file per
// condition — would need every fixture below rewritten, and because the file that OWNS each dialog is
// what condition (f) resolves and pins by render path, which is the stronger statement.
function checkPlayerSetupAstro(rawText, checked) {
  const violations = [];
  // (c) and (d) all assert something MUST be present, so they must never see a comment: these files
  // document their own guards in prose right above them, and an old line left commented out while the
  // live one is weakened is exactly the bypass this strip closes. Stripped per file, never on a
  // concatenation: stripComments() carries block-comment state across newlines, so joining first would
  // let one file's unterminated `/*` blank the next file's live code.
  const texts = (Array.isArray(rawText) ? rawText : [rawText]).map(stripComments);
  const text = texts.join('\n');
  const firstMatch = (re) => {
    for (const t of texts) {
      const m = t.match(re);
      if (m) return m;
    }
    return null;
  };

  // (c) pendingHref must clear on the dialog's own `close` event (fires for every dismissal path),
  // not per-button — clearing per-button was the shipped defect: a later #leave-go press could still
  // navigate on a pendingHref left over from an answer already given the other way.
  // Bound to leaveDlg by name since gh#55: the file now holds a SECOND <dialog> with its own `close`
  // listener. The old pattern matched on the event name alone, so it graded whichever `close` listener
  // came FIRST in source, whatever element it belonged to — measured: against today's order it reads
  // clearChoiceEl's body, finds no pendingHref, and reports leave-confirm's guard broken while the
  // guard is right there and correct. Flip the source order and the same regex grades leave-confirm by
  // clear-choice's listener instead, which checks nothing. Either way the verdict tracks line order
  // rather than the element under test. Narrowing to the element is the converging fix (ADR-0020 rule 3);
  // the known-good fixture below is what pins it, and it fails against the un-narrowed pattern.
  checked?.push('c');
  // firstMatch, not a match against the joined text: `[^}]*` matches newlines, so a listener opened in
  // one file could otherwise be closed by a brace in the next one.
  const closeMatch = firstMatch(/leaveDlg\.addEventListener\(\s*(['"])close\1\s*,\s*\(\)\s*=>\s*\{([^}]*)\}\s*\)/);
  if (!closeMatch) {
    violations.push("(c) no dialog 'close' event listener found — pendingHref must be cleared there, not per-button");
  } else if (!/pendingHref\s*=\s*null/.test(closeMatch[2])) {
    violations.push("(c) the dialog's 'close' event listener no longer clears pendingHref = null");
  }

  // (d) a modified or non-primary click is the round-PRESERVING gesture (opens a sibling game in a new
  // tab) and must pass through untouched, or the guard turns the safe action into the destructive one.
  checked?.push('d');
  if (!/e\.metaKey\s*\|\|\s*e\.ctrlKey\s*\|\|\s*e\.shiftKey\s*\|\|\s*e\.altKey\s*\|\|\s*e\.button\s*!==\s*0/.test(text)) {
    violations.push('(d) modified/non-primary click passthrough (metaKey/ctrlKey/shiftKey/altKey/button check) is missing');
  }
  // (d) GameLayout's stable back-to-home link must stay excluded, or the guard intercepts the one link that
  // never moves and does not need asking about.
  if (!text.includes("a[href]:not([data-stable-exit])")) {
    violations.push("(d) the a[href]:not([data-stable-exit]) selector is missing — the stable exit link must stay excluded");
  }

  // (e) gh#55 / ADR-0024: #clear-choice is the same <dialog> shape as #leave-confirm with the OPPOSITE
  // fallback, and both halves are load-bearing.
  checked?.push('e');
  //   the element type is the fix — as a <div> in flow, [hidden]{display:none} on dismissal reflowed
  //   every control below it upward, which is how a stage control arrives under a descending finger;
  //   the fallback fails SAFE — the question drops `hidden` unconditionally and only the RAISING is
  //   capability-gated, because a browser with no showModal must still be asked before a destructive
  //   clear. leave-confirm's fail-OPEN early return (line ~419) copied here is a silent data-loss path.
  if (!/<dialog id="clear-choice"/.test(text)) {
    violations.push('(e) #clear-choice is not a <dialog> — in normal flow, dismissing it reflows the stage under the finger (ADR-0024)');
  }
  const askShown = text.indexOf('clearChoiceEl.hidden = false');
  // Hole 1 (adversarial review, S2026-08-21): a bare `indexOf('clearChoiceEl.showModal')` is satisfied
  // by the CAPABILITY TEST alone (`typeof clearChoiceEl.showModal === 'function'`) even if the real
  // showModal() call is deleted or swapped for setAttribute('open', '') — the exact reflow hazard
  // ADR-0024 exists to catch, and all five conditions would stay green while it shipped. Require the
  // actual invocation, parens and all, not a mention of the identifier.
  const showModalCall = text.match(/clearChoiceEl\.showModal\s*\(\s*\)/);
  const askRaised = showModalCall ? showModalCall.index : -1;
  if (askShown < 0) {
    violations.push('(e) the clear question no longer drops hidden unconditionally — a browser without showModal could not be asked at all');
  }
  if (askRaised < 0) {
    violations.push('(e) #clear-choice is never raised with a real showModal() call — a bare mention of showModal (e.g. inside the capability test) is not enough');
  } else if (askShown >= 0 && askRaised < askShown) {
    violations.push('(e) showModal runs before hidden drops — showModal on a display:none box raises nothing');
  }
  // Fail-OPEN detector: covers three shapes — `typeof X !== 'function') return`, its Yoda-order twin
  // (`'function' !== typeof X) return`), and the bare falsy check `!clearChoiceEl.showModal) return`.
  // It provably does NOT catch the capability hoisted into an intermediate variable first
  // (`const ok = typeof clearChoiceEl.showModal === 'function'; if (!ok) return;`), a comparison against
  // `'undefined'` / `== null`, or a `return` several lines below the condition rather than on the same
  // `if (...)`. Only scripts/leave-confirm-probe.mjs proves the rendered behavior; this stays a
  // source-text tripwire, not the proof.
  const failOpenPatterns = [
    /clearChoiceEl\.showModal\s*!==\s*(['"])function\1\s*\)\s*\{?\s*return/,
    /(['"])function\1\s*!==\s*typeof\s*clearChoiceEl\.showModal\s*\)\s*\{?\s*return/,
    /!\s*clearChoiceEl\.showModal\s*\)\s*\{?\s*return/,
  ];
  if (failOpenPatterns.some((re) => re.test(text))) {
    violations.push('(e) #clear-choice must never fail OPEN on a showModal capability test — that path clears the group and discards the rounds without asking');
  }
  // (e) dropping `hidden` is NOT enough on its own, and this one was measured, not reasoned: a UA that
  // styles <dialog> at all ships `dialog:not([open]) { display: none }`, which survives showModal being
  // missing. With showModal deleted the question read hidden=false with ZERO client rects and focus on
  // <body> — Clear group became a control that visibly did nothing. Only setting [open] by hand renders
  // it, so that line is the fallback, not a nicety.
  if (!/clearChoiceEl\.setAttribute\(\s*(['"])open\1/.test(text)) {
    violations.push("(e) the no-showModal branch never sets [open] — dialog:not([open]){display:none} keeps the question at zero client rects, so the player is never asked");
  }

  return violations;
}

// ---------------------------------------------------------------------------
// (f) gh#106 — PER-PAGE presence. (a)-(e) grade the MECHANISM; not one of them asks whether any given
// page mounts it. That is how three pages shipped with no leave-confirm at all while this gate stayed
// green: GameLayout rendered the dialog's owner component behind
// `game.players[0] !== 1 || game.players[1] !== 1`, false for every [1, 1] page, so siamsi,
// daily-fortune and love-match carried the guard on no page while every condition above passed.
// ADR-0040 says the opposite in as many words: "a page declaring [1, 1] skips the setup panel. Nothing
// else about the shell's start contract moves — ... and so do ADR-0014 and ADR-0015."
//
// The guarded set is the games MANIFEST, never a list of page names: every /game/<id>/ URL is
// generated by getStaticPaths() over `games` in the one dynamic route, so a game added tomorrow joins
// the guarded set by existing. The exempt set is INVERTED, the same shape ADR-0015 gives the guard
// itself — enumerate the pages proven to have no round to lose and negate the rest. Per ADR-0015 that
// set is the tool pages ("Tool pages are unguarded, gated on the absence of gameId. The reason is that
// there is no round to lose there"), and no tool page appears in this manifest, so the list below is
// empty. Empty is not vacuous: growth lands on the guarded side, which is the whole point of the
// inversion, and a name left here after its game is gone is reported rather than ignored.
//
// ponytail: this reads the render path from source, so it proves "the mount is reached", not "the
// dialog painted" — scripts/leave-confirm-probe.mjs is still the only thing that reads a real DOM
// (ADR-0018). The path itself is the two hardcoded links below rather than a general Astro resolver,
// because those two files ARE the whole path from a game URL to the dialog and a resolver would be a
// second grammar this gate has to own. Upgrade path if a third layer ever appears: read the chain from
// the imports instead of listing it.
const GAME_PAGE = 'src/pages/game/[id].astro';
const GAME_LAYOUT = 'src/layouts/GameLayout.astro';
const EXEMPT_GAME_IDS = [];

// Astro frontmatter is JS, not template — its braces are not JSX expression openers, and reading them
// as guards would invent conditions no element sits inside.
function templateOf(text) {
  const m = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return m ? text.slice(m[0].length) : text;
}

// Which local name does `fileRel` import `targetRel` as? Astro renders the LOCAL name, so that is how
// the mount site is spelled — reading it from the import means a rename cannot make this check blind.
function importedAs(text, fileRel, targetRel) {
  for (const m of text.matchAll(/import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g)) {
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(fileRel), m[2]));
    if (resolved === targetRel) return m[1];
  }
  return null;
}

// Every JSX expression still OPEN at `tagIndex` — i.e. every condition the element at that index is
// rendered behind. `{cond && <Tag/>}` and `{cond && (\n <Tag/>\n)}` are the two shapes this repo
// writes; anything else is returned with `cond: null` and reported rather than assumed satisfied
// (docs/adr/0019 — a guard this gate cannot read is not a guard it may wave through).
// ponytail: brace counting over comment-stripped template text. A `{` inside a quoted attribute value
// or a text node would be read as an expression opener; the fail direction is an unreadable guard,
// i.e. red, i.e. a human looks. Upgrade path is a real JSX parser, not a wider regex.
function mountGuards(template, tagIndex) {
  const before = template.slice(0, tagIndex);
  const open = [];
  for (let i = 0; i < before.length; i++) {
    if (before[i] === '{') open.push(i);
    else if (before[i] === '}') open.pop();
  }
  return open.map((i) => {
    const inner = before.slice(i + 1);
    const m = inner.match(/^([\s\S]*?)&&\s*\(?\s*$/);
    return m ? { cond: m[1].trim(), raw: inner.trim() } : { cond: null, raw: inner.trim().slice(0, 80) };
  });
}

// A guard is evaluated against the real manifest entry, which is what makes the verdict PER PAGE: an
// unconditional mount holds for every game, and `game.players[0] !== 1 || …` names exactly the [1, 1]
// pages it excludes. A throw (the guard reads a frontmatter local this gate cannot see) returns null
// and is reported — never read as satisfied.
function guardHolds(cond, game) {
  try {
    return Boolean(new Function('game', `"use strict"; return (${cond});`)(game));
  } catch {
    return null;
  }
}

function checkPerPageMount(games, astroFiles, checked, exempt = EXEMPT_GAME_IDS) {
  checked?.push('f');
  const violations = [];
  // docs/adr/0019: every rule below is per-game, so an empty manifest satisfies all of them vacuously
  // and this condition would report OK having checked no page at all.
  if (!Array.isArray(games) || games.length === 0) {
    return [
      `(f) the games manifest is ${Array.isArray(games) ? 'an empty array' : JSON.stringify(games)} — ` +
        'the per-page rule is per-game, so an empty set passes it vacuously (docs/adr/0019)',
    ];
  }
  for (const id of exempt) {
    if (!games.some((g) => g.id === id)) {
      violations.push(`(f) the exempt list names "${id}", which is not in the manifest — a stale exemption is a page-shaped hole nothing checks`);
    }
  }

  const owners = [...astroFiles].filter(([, t]) => /<dialog\s+id="leave-confirm"/.test(stripComments(t))).map(([rel]) => rel);
  if (owners.length !== 1) {
    violations.push(
      `(f) expected exactly one .astro file to declare <dialog id="leave-confirm">, found ${owners.length}` +
        (owners.length ? ` (${owners.join(', ')})` : '') +
        ' — with none there is no guard on any page, and with two the ids collide and showModal() raises whichever the parser kept'
    );
    return violations;
  }
  const owner = owners[0];

  // The render path: game URL -> the one dynamic route -> the layout -> the file declaring the dialog.
  // The last step is the dialog's own position inside its owner, so wrapping the markup in a
  // conditional is caught by the same evaluation as wrapping the component.
  const steps = [];
  for (const [file, target] of [[GAME_PAGE, GAME_LAYOUT], [GAME_LAYOUT, owner]]) {
    if (file === target) continue; // the dialog inlined into the layout: that link is trivially walked
    const raw = astroFiles.get(file);
    if (raw === undefined) {
      violations.push(`(f) ${file} does not exist — the render path from a game URL to #leave-confirm cannot be resolved`);
      return violations;
    }
    const stripped = stripComments(raw);
    const template = templateOf(stripped);
    const local = importedAs(stripped, file, target);
    if (!local) {
      violations.push(`(f) ${file} does not import ${target} — the render path to #leave-confirm is broken`);
      return violations;
    }
    // Component-name BOUNDARY, not a prefix: `template.indexOf('<' + local)` matched `<LeaveConfirmX`
    // too, so a differently-named component mounted ABOVE the real one decided this step's verdict —
    // its (possibly unguarded) position passed while the real, guarded mount below was never read
    // (adversarial review, gh#106). Astro spells a mount `<Name>`, `<Name />` or `<Name attr…>`, so
    // the character after the name is always whitespace, `/` or `>`.
    const at = template.search(new RegExp(`<${local}(?=[\\s/>])`));
    if (at < 0) {
      violations.push(`(f) ${file} imports ${local} (${target}) but never renders <${local}> — no page can reach #leave-confirm`);
      return violations;
    }
    steps.push({ file, local, guards: mountGuards(template, at) });
  }
  const ownerTemplate = templateOf(stripComments(astroFiles.get(owner)));
  steps.push({
    file: owner,
    local: 'dialog id="leave-confirm"',
    guards: mountGuards(ownerTemplate, ownerTemplate.search(/<dialog\s+id="leave-confirm"/)),
  });

  for (const game of games) {
    if (exempt.includes(game.id)) continue;
    for (const { file, local, guards } of steps) {
      for (const g of guards) {
        if (g.cond === null) {
          violations.push(
            `(f) /game/${game.id}/: <${local}> in ${file} sits inside an expression this gate cannot read ` +
              `("${g.raw}") — an unreadable guard is reported, never assumed satisfied (docs/adr/0019)`
          );
          continue;
        }
        const holds = guardHolds(g.cond, game);
        if (holds === null) {
          violations.push(
            `(f) /game/${game.id}/: the guard \`${g.cond}\` on <${local}> in ${file} could not be evaluated ` +
              'against this manifest entry, so the mount cannot be proven'
          );
        } else if (!holds) {
          violations.push(
            `(f) /game/${game.id}/ never mounts #leave-confirm: <${local}> in ${file} renders only when ` +
              `\`${g.cond}\`, which is false for this game (players [${game.players}]). ADR-0015 guards every page ` +
              'that starts a round, and ADR-0040 leaves it in place for a [1, 1] page'
          );
        }
      }
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Self-test: fixtures live under a temp dir (os.tmpdir()), read back through the same fs.readFileSync
// path main() uses, then the temp dir is removed. Nothing under src/, dist/, or the repo tree is ever
// touched. Calibrated both ways per condition — a clean fixture must pass, and each planted defect,
// shaped like the real idiom in tokens.css / PlayerSetup.astro, must be flagged.
// ---------------------------------------------------------------------------
function withTempFixture(name, content, run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leave-confirm-check-'));
  const file = path.join(dir, name);
  try {
    fs.writeFileSync(file, content);
    return run(fs.readFileSync(file, 'utf8'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function selftest() {
  // -- (a)/(b): tokens.css --------------------------------------------------
  const cssGood = [
    '#leave-confirm[open] {',
    '  max-block-size: 45dvh;',
    '  overflow: auto;',
    '  display: flex;',
    '}',
    '#leave-confirm[open].at-bottom {',
    '  position: fixed;',
    '  inset-block-end: var(--space-md);',
    '}',
  ].join('\n');
  withTempFixture('tokens.css', cssGood, (text) => {
    assert.deepEqual(checkTokensCss(text), [], 'clean tokens.css fixture must report zero violations');
  });
  console.log('PASS (a)+(b) known-good tokens.css fixture: display gated on [open], max-block-size 45dvh — clean');

  // (a) known-bad: display escapes the [open] gate — the exact shipped defect (unconditional display:flex
  // on the bare #leave-confirm id beat the UA's dialog:not([open]){display:none}).
  const cssBadOpenGate = [
    '#leave-confirm {',
    '  display: flex;',
    '}',
    '#leave-confirm[open] {',
    '  max-block-size: 45dvh;',
    '  overflow: auto;',
    '}',
  ].join('\n');
  withTempFixture('tokens.css', cssBadOpenGate, (text) => {
    const v = checkTokensCss(text);
    assert.ok(v.some((x) => x.startsWith('(a)')), '(a) must flag display: outside an [open]-gated selector');
  });
  console.log('PASS (a) known-bad fixture (display on bare #leave-confirm) is flagged');

  // (a) known-bad: a SELECTOR LIST where one compound is gated and the other is not. Reading the list
  // as one string let the first compound's `[open]` vouch for the second — the ADR-0015 defect
  // laundered through a comma, green on every condition. Both orders, so the fix cannot be "grade the
  // last one"; and the ungated compound must be the one NAMED in the message, not the whole list.
  for (const [label, sel, culprit] of [
    ['gated first', '#leave-confirm[open], #clear-choice', '#clear-choice'],
    ['gated last', '#clear-choice, #leave-confirm[open]', '#clear-choice'],
    ['bare dialog smuggled in', '#leave-confirm[open], dialog', 'dialog'],
    ['newline-separated list, the shape tokens.css ships', '#leave-confirm[open].at-bottom,\n#leave-confirm:not([open])', '#leave-confirm:not([open])'],
  ]) {
    const cssBadList = [`${sel} {`, '  display: flex;', '}', '#leave-confirm[open] {', '  max-block-size: 45dvh;', '}'].join('\n');
    withTempFixture('tokens.css', cssBadList, (text) => {
      const v = checkTokensCss(text);
      const hit = v.find((x) => x.startsWith('(a)'));
      assert.ok(hit, `(a) must flag the ungated compound in "${sel}" (${label})`);
      assert.ok(hit.includes(`"${culprit}"`), `(a) must name the ungated compound ${culprit}, not the whole list — got: ${hit}`);
    });
    console.log(`PASS (a) known-bad fixture (selector list, ${label}): the ungated compound ${culprit} is flagged, not vouched for by its neighbour`);
  }

  // (a) calibration the other way: tokens.css's REAL list — every compound genuinely [open]-gated —
  // must stay clean, or the split traded a fail-open for a fail-closed on the shipped file.
  const cssGoodList = [
    '#leave-confirm[open].at-bottom,',
    '#leave-confirm[open].at-top {',
    '  display: flex;',
    '}',
    '#leave-confirm[open] {',
    '  max-block-size: 45dvh;',
    '}',
  ].join('\n');
  withTempFixture('tokens.css', cssGoodList, (text) => {
    assert.deepEqual(checkTokensCss(text), [], '(a) a list whose every compound is [open]-gated must stay clean');
  });
  console.log('PASS (a) known-good fixture (the real #leave-confirm[open].at-bottom, .at-top list) still passes after the split');

  // (a) and a comma INSIDE :is()/:not() is an argument separator, not a list separator — splitting
  // there would invent a compound like `.at-top` that no rule targets.
  const cssGoodNotList = ['#leave-confirm[open]:not(.at-top, .at-bottom) {', '  display: flex;', '}', '#leave-confirm[open] {', '  max-block-size: 45dvh;', '}'].join('\n');
  withTempFixture('tokens.css', cssGoodNotList, (text) => {
    assert.deepEqual(checkTokensCss(text), [], '(a) a comma inside :not(...) must not be read as a selector-list separator');
  });
  console.log('PASS (a) known-good fixture (#leave-confirm[open]:not(.at-top, .at-bottom)): a comma inside :not() is an argument separator, not a list split');

  // (a) known-bad: a bare `dialog` element selector with display:, same hazard for any future <dialog>.
  const cssBadBareDialog = ['dialog {', '  display: flex;', '}'].join('\n');
  withTempFixture('tokens.css', cssBadBareDialog, (text) => {
    const v = checkTokensCss(text);
    assert.ok(v.some((x) => x.startsWith('(a)')), '(a) must flag display: on a bare `dialog` selector');
  });
  console.log('PASS (a) known-bad fixture (display on bare `dialog`) is flagged');

  // (a) known-bad: `:not([open])` targets precisely the CLOSED dialog — the exact bug ADR-0015
  // guards — while the substring "[open]" is present. Both spacings, since :not( [open] ) is legal CSS.
  for (const sel of ['#leave-confirm:not([open])', '#leave-confirm:not( [open] )']) {
    const cssBadNotOpen = [`${sel} {`, '  display: block;', '}', '#leave-confirm[open] {', '  max-block-size: 45dvh;', '}'].join('\n');
    withTempFixture('tokens.css', cssBadNotOpen, (text) => {
      const v = checkTokensCss(text);
      assert.ok(v.some((x) => x.startsWith('(a)')), `(a) must flag "${sel}" — it paints the closed dialog`);
    });
    console.log(`PASS (a) known-bad fixture (${sel} sets display) is flagged`);
  }

  // (a) calibration the other way: a genuine [open] gate keeps passing even when the selector also
  // carries an unrelated :not(...), so the fix above rejects the bypass and not the real idiom.
  const cssGoodOpenPlusNot = [
    '#leave-confirm[open]:not(.at-top) {',
    '  display: flex;',
    '  max-block-size: 45dvh;',
    '}',
    '#leave-confirm[open] {',
    '  max-block-size: 45dvh;',
    '}',
  ].join('\n');
  withTempFixture('tokens.css', cssGoodOpenPlusNot, (text) => {
    assert.deepEqual(checkTokensCss(text), [], '(a) must still accept #leave-confirm[open]:not(.at-top)');
  });
  console.log('PASS (a) known-good fixture (#leave-confirm[open]:not(.at-top) sets display) still passes');

  // (a) negative direction: a commented-out bad rule must NOT trip the check. This is the mirror of
  // the (c)/(d) cases below — comments neither satisfy a positive check nor trip a negative one.
  const cssCommentedBadRule = [
    '/* was: #leave-confirm { display: flex; } — removed, it painted the closed dialog */',
    '#leave-confirm[open] {',
    '  max-block-size: 45dvh;',
    '  display: flex;',
    '}',
  ].join('\n');
  withTempFixture('tokens.css', cssCommentedBadRule, (text) => {
    assert.deepEqual(checkTokensCss(text), [], '(a) must not be tripped by a commented-out rule');
  });
  console.log('PASS (a) negative direction: a commented-out #leave-confirm display rule does not trip the check');

  // (b) known-bad: max-block-size widened past the 45dvh ceiling the 0.45H + 16 < 0.5H proof rests on.
  const cssBadTooTall = [
    '#leave-confirm[open] {',
    '  max-block-size: 60dvh;',
    '  display: flex;',
    '}',
  ].join('\n');
  withTempFixture('tokens.css', cssBadTooTall, (text) => {
    const v = checkTokensCss(text);
    assert.ok(v.some((x) => x.startsWith('(b)')), '(b) must flag max-block-size > 45dvh');
  });
  console.log('PASS (b) known-bad fixture (max-block-size: 60dvh) is flagged');

  // -- (c)/(d)/(e): PlayerSetup.astro ---------------------------------------
  // (e)'s satisfied lines, shared by every fixture that must read clean: the four checks are
  // independent, so a fixture written for (c) or (d) would otherwise fail on (e) for unrelated reasons.
  const clearChoiceGood = [
    '<dialog id="clear-choice" hidden>',
    "  clearChoiceEl.hidden = false;",
    "  if (typeof clearChoiceEl.showModal === 'function') clearChoiceEl.showModal();",
    "  else clearChoiceEl.setAttribute('open', '');",
  ].join('\n');
  const astroGood = [
    "  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;",
    "  const link = (e.target as Element).closest?.('a[href]:not([data-stable-exit])') as HTMLAnchorElement | null;",
    "  clearChoiceEl.addEventListener('close', () => { clearChoiceEl.hidden = true; });",
    "  leaveDlg.addEventListener('close', () => { pendingHref = null; });",
    "  leaveStayBtn.addEventListener('click', () => leaveDlg.close());",
    clearChoiceGood,
  ].join('\n');
  withTempFixture('PlayerSetup.astro', astroGood, (text) => {
    assert.deepEqual(checkPlayerSetupAstro(text), [], 'clean PlayerSetup.astro fixture must report zero violations');
  });
  console.log('PASS (c)+(d) known-good PlayerSetup.astro fixture: close clears pendingHref, both guards present — clean');

  // (c) known-bad: pendingHref cleared per-button instead of on close — the shipped defect, where a
  // later #leave-go press could still navigate on an answer already given the other way.
  const astroBadPerButton = [
    "  leaveStayBtn.addEventListener('click', () => { pendingHref = null; leaveDlg.close(); });",
    "  leaveGoBtn.addEventListener('click', () => { pendingHref = null; leaveDlg.close(); });",
  ].join('\n');
  withTempFixture('PlayerSetup.astro', astroBadPerButton, (text) => {
    const v = checkPlayerSetupAstro(text);
    assert.ok(v.some((x) => x.startsWith('(c)')), '(c) must flag a missing close-clears-pendingHref listener');
  });
  console.log('PASS (c) known-bad fixture (pendingHref cleared per-button, no close listener) is flagged');

  // (d) known-bad: modified-click passthrough guard removed — a cmd/ctrl/shift/middle click on a
  // sibling game would then be intercepted and answered with location.href, killing the new-tab intent.
  const astroBadNoPassthrough = [
    "  const link = (e.target as Element).closest?.('a[href]:not([data-stable-exit])') as HTMLAnchorElement | null;",
  ].join('\n');
  withTempFixture('PlayerSetup.astro', astroBadNoPassthrough, (text) => {
    const v = checkPlayerSetupAstro(text);
    assert.ok(v.some((x) => x.startsWith('(d)') && x.includes('passthrough')), '(d) must flag a missing modified-click passthrough guard');
  });
  console.log('PASS (d) known-bad fixture (no modified-click passthrough) is flagged');

  // (d) known-bad: the stable-exit exclusion widened away, so the GameLayout back-to-home link that never
  // moves gets intercepted and asked about too.
  const astroBadNoStableExit = [
    "  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;",
    "  const link = (e.target as Element).closest?.('a[href]') as HTMLAnchorElement | null;",
  ].join('\n');
  withTempFixture('PlayerSetup.astro', astroBadNoStableExit, (text) => {
    const v = checkPlayerSetupAstro(text);
    assert.ok(v.some((x) => x.startsWith('(d)') && x.includes('stable-exit')), '(d) must flag a missing data-stable-exit exclusion');
  });
  console.log('PASS (d) known-bad fixture (a[href] without :not([data-stable-exit])) is flagged');

  // -- comment bypass: a positive-presence check must not be satisfied by a COMMENT ---------------
  // Every one of these keeps the required text in the file, but only inside a comment, while the
  // live line is the weakened one. Before comments were stripped, all three read as clean.
  const astroCommentedOut = [
    "  // if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;",
    "  /* was: closest?.('a[href]:not([data-stable-exit])') */",
    "  const link = (e.target as Element).closest?.('a[href]') as HTMLAnchorElement | null;",
    "  {/* leaveDlg.addEventListener('close', () => { pendingHref = null; }); */}",
    "  leaveStayBtn.addEventListener('click', () => { pendingHref = null; leaveDlg.close(); });",
  ].join('\n');
  withTempFixture('PlayerSetup.astro', astroCommentedOut, (text) => {
    const v = checkPlayerSetupAstro(text);
    assert.ok(v.some((x) => x.startsWith('(c)')), '(c) must not be satisfied by a commented-out close listener');
    assert.ok(v.some((x) => x.startsWith('(d)') && x.includes('passthrough')), '(d) passthrough must not be satisfied by a commented-out guard');
    assert.ok(v.some((x) => x.startsWith('(d)') && x.includes('stable-exit')), '(d) stable-exit must not be satisfied by a commented-out selector');
  });
  console.log('PASS comment bypass: commented-out close listener / passthrough guard / stable-exit selector satisfy nothing');

  // Calibration the other way: the same prose comments alongside LIVE lines must still read clean —
  // stripping comments must not break the real file, which documents each guard right above it.
  const astroGoodWithComments = [
    "  // A modified or non-primary click is the round-PRESERVING gesture: e.metaKey || e.ctrlKey.",
    "  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;",
    "  {/* Only data-stable-exit (GameLayout's back-to-home link) opts out of a[href]:not([data-stable-exit]). */}",
    "  const link = (e.target as Element).closest?.('a[href]:not([data-stable-exit])') as HTMLAnchorElement | null;",
    "  /* pendingHref = null must live on close, not per-button. */",
    "  leaveDlg.addEventListener('close', () => { pendingHref = null; });",
    clearChoiceGood,
  ].join('\n');
  withTempFixture('PlayerSetup.astro', astroGoodWithComments, (text) => {
    assert.deepEqual(checkPlayerSetupAstro(text), [], 'live guards next to prose comments must still report zero violations');
  });
  console.log('PASS comment bypass, calibration: live guards documented by comments above them still report clean');

  // -- (c) new surface, gh#55: a SECOND dialog's close listener must not stand in for leaveDlg's -----
  // Narrowing (c) to leaveDlg could have introduced a blind spot — a file with no leaveDlg close
  // listener at all, only another dialog's. It does not: the miss is still caught. The other half of
  // this pair is astroGood above, which carries both listeners in the real file's order (clear-choice
  // first) and reads clean only because of the narrowing — it fails against the un-narrowed pattern.
  const astroBadOtherDialogsClose = [
    "  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;",
    "  const link = (e.target as Element).closest?.('a[href]:not([data-stable-exit])') as HTMLAnchorElement | null;",
    "  clearChoiceEl.addEventListener('close', () => { clearChoiceEl.hidden = true; });",
    "  leaveStayBtn.addEventListener('click', () => { pendingHref = null; leaveDlg.close(); });",
    clearChoiceGood,
  ].join('\n');
  withTempFixture('PlayerSetup.astro', astroBadOtherDialogsClose, (text) => {
    const v = checkPlayerSetupAstro(text);
    assert.ok(v.some((x) => x.startsWith('(c)')), "(c) another dialog's close listener must not satisfy leave-confirm's");
  });
  console.log("PASS (c) known-bad fixture (a second dialog's close listener standing in for leaveDlg's) is flagged");

  // -- (e): #clear-choice is a non-reflowing dialog that fails SAFE (gh#55, ADR-0024) ----------------
  // (e) known-bad: reverted to a <div>. In flow, dismissing it reflows every control below it upward —
  // the whole hazard ADR-0024 removed, back verbatim.
  const astroBadClearChoiceDiv = [
    astroGood.replace('<dialog id="clear-choice" hidden>', '<div id="clear-choice" hidden>'),
  ].join('\n');
  withTempFixture('PlayerSetup.astro', astroBadClearChoiceDiv, (text) => {
    const v = checkPlayerSetupAstro(text);
    assert.ok(v.some((x) => x.startsWith('(e)') && x.includes('not a <dialog>')), '(e) must flag #clear-choice reverted to a div');
  });
  console.log('PASS (e) known-bad fixture (#clear-choice back to a <div>) is flagged');

  // (e) known-bad: leave-confirm's fail-OPEN early return copied onto the clear path. leave-confirm may
  // do this — eating a navigation click it cannot ask about is worse than letting it through. Here the
  // same line skips the only question in front of a destructive clear.
  const astroBadClearChoiceFailsOpen = [
    astroGood,
    "  if (typeof clearChoiceEl.showModal !== 'function') return;",
  ].join('\n');
  withTempFixture('PlayerSetup.astro', astroBadClearChoiceFailsOpen, (text) => {
    const v = checkPlayerSetupAstro(text);
    assert.ok(v.some((x) => x.startsWith('(e)') && x.includes('fail OPEN')), '(e) must flag a fail-OPEN early return on the clear path');
  });
  console.log('PASS (e) known-bad fixture (fail-OPEN early return on #clear-choice) is flagged');

  // (e) known-bad: the braced form of the same early return, since `) return;` is not the only spelling.
  const astroBadClearChoiceFailsOpenBraced = [
    astroGood,
    "  if (typeof clearChoiceEl.showModal !== 'function') { return; }",
  ].join('\n');
  withTempFixture('PlayerSetup.astro', astroBadClearChoiceFailsOpenBraced, (text) => {
    const v = checkPlayerSetupAstro(text);
    assert.ok(v.some((x) => x.startsWith('(e)') && x.includes('fail OPEN')), '(e) must flag the braced fail-OPEN early return too');
  });
  console.log('PASS (e) known-bad fixture (braced fail-OPEN early return) is flagged');

  // (e) known-bad, Hole 1 widening: Yoda-order comparison — `'function' !== typeof X`. Named in the
  // adversarial review as one of the two spellings the old single regex let slip past.
  const astroBadClearChoiceFailsOpenYoda = [
    astroGood,
    "  if ('function' !== typeof clearChoiceEl.showModal) return;",
  ].join('\n');
  withTempFixture('PlayerSetup.astro', astroBadClearChoiceFailsOpenYoda, (text) => {
    const v = checkPlayerSetupAstro(text);
    assert.ok(v.some((x) => x.startsWith('(e)') && x.includes('fail OPEN')), '(e) must flag the Yoda-order fail-OPEN comparison');
  });
  console.log('PASS (e) known-bad fixture (Yoda-order fail-OPEN comparison) is flagged');

  // (e) known-bad, Hole 1 widening: bare falsy check — `!clearChoiceEl.showModal`. The second spelling
  // named in the review.
  const astroBadClearChoiceFailsOpenBang = [
    astroGood,
    "  if (!clearChoiceEl.showModal) return;",
  ].join('\n');
  withTempFixture('PlayerSetup.astro', astroBadClearChoiceFailsOpenBang, (text) => {
    const v = checkPlayerSetupAstro(text);
    assert.ok(v.some((x) => x.startsWith('(e)') && x.includes('fail OPEN')), '(e) must flag the bare `!clearChoiceEl.showModal` fail-OPEN check');
  });
  console.log('PASS (e) known-bad fixture (bare `!clearChoiceEl.showModal` fail-OPEN check) is flagged');

  // (e) known-bad, Hole 1: the real showModal() call gutted and replaced with setAttribute('open', ''),
  // while the capability test survives untouched. Before the fix, `indexOf('clearChoiceEl.showModal')`
  // still found the identifier inside the surviving `typeof ... === 'function'` test, so this fixture
  // read clean with all five conditions green while the reflow hazard shipped (adversarial review).
  const clearChoiceCallGutted = clearChoiceGood.replace(
    "clearChoiceEl.showModal();",
    "clearChoiceEl.setAttribute('open', '');"
  );
  const astroBadClearChoiceCallGutted = astroGood.replace(clearChoiceGood, clearChoiceCallGutted);
  assert.notEqual(astroBadClearChoiceCallGutted, astroGood, 'fixture setup: the replace must actually apply');
  withTempFixture('PlayerSetup.astro', astroBadClearChoiceCallGutted, (text) => {
    const v = checkPlayerSetupAstro(text);
    assert.ok(v.some((x) => x.startsWith('(e)') && x.includes('never raised')), '(e) must flag showModal() gutted while the capability test survives');
  });
  console.log('PASS (e) known-bad fixture (showModal() call gutted, capability test intact) is flagged — Hole 1');

  // (e) known-bad: the unconditional `hidden` drop gone, so the fallback browser is never asked — the
  // question would exist and stay display:none, and the clear would run on a press nobody answered.
  const astroBadClearChoiceNoFallback = astroGood.replace('  clearChoiceEl.hidden = false;\n', '');
  withTempFixture('PlayerSetup.astro', astroBadClearChoiceNoFallback, (text) => {
    const v = checkPlayerSetupAstro(text);
    assert.ok(v.some((x) => x.startsWith('(e)') && x.includes('unconditionally')), '(e) must flag the missing no-showModal fallback');
  });
  console.log('PASS (e) known-bad fixture (no unconditional hidden drop — fallback cannot ask) is flagged');

  // (e) known-bad: raised before it is rendered. showModal() on a display:none box raises nothing, so
  // the modern browser shows no question at all while every other check here still reads green.
  const astroBadClearChoiceOrder = [
    '<dialog id="clear-choice" hidden>',
    "  if (typeof clearChoiceEl.showModal === 'function') clearChoiceEl.showModal();",
    "  clearChoiceEl.hidden = false;",
    "  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;",
    "  const link = (e.target as Element).closest?.('a[href]:not([data-stable-exit])') as HTMLAnchorElement | null;",
    "  leaveDlg.addEventListener('close', () => { pendingHref = null; });",
  ].join('\n');
  withTempFixture('PlayerSetup.astro', astroBadClearChoiceOrder, (text) => {
    const v = checkPlayerSetupAstro(text);
    assert.ok(v.some((x) => x.startsWith('(e)') && x.includes('before hidden drops')), '(e) must flag showModal running before hidden drops');
  });
  console.log('PASS (e) known-bad fixture (showModal before the hidden drop) is flagged');

  // (e) known-bad: showModal capability-gated correctly, but with no else branch — the shape this
  // shipped as until the fail-safe path was actually driven with showModal deleted. Every other check
  // here reads green on it, and the player is never asked.
  const astroBadClearChoiceNoOpenFallback = astroGood.replace("  else clearChoiceEl.setAttribute('open', '');\n", '')
    .replace("\n  else clearChoiceEl.setAttribute('open', '');", '');
  withTempFixture('PlayerSetup.astro', astroBadClearChoiceNoOpenFallback, (text) => {
    const v = checkPlayerSetupAstro(text);
    assert.ok(v.some((x) => x.startsWith('(e)') && x.includes('never sets [open]')), '(e) must flag a no-showModal branch that only drops hidden');
  });
  console.log('PASS (e) known-bad fixture (fallback drops hidden but never sets [open]) is flagged');

  // (e) negative direction: the same lines inside comments satisfy nothing — a <dialog> quoted in prose
  // above a live <div> is exactly how this file documents its own guards.
  const astroClearChoiceCommentedOut = [
    "  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;",
    "  const link = (e.target as Element).closest?.('a[href]:not([data-stable-exit])') as HTMLAnchorElement | null;",
    "  leaveDlg.addEventListener('close', () => { pendingHref = null; });",
    '  {/* was: <dialog id="clear-choice" hidden> — reverted, it broke the layout */}',
    '  <div id="clear-choice" hidden>',
    "  // clearChoiceEl.hidden = false;",
    "  /* if (typeof clearChoiceEl.showModal === 'function') clearChoiceEl.showModal(); */",
  ].join('\n');
  withTempFixture('PlayerSetup.astro', astroClearChoiceCommentedOut, (text) => {
    const v = checkPlayerSetupAstro(text);
    assert.ok(v.some((x) => x.includes('not a <dialog>')), '(e) a commented-out <dialog> must not satisfy the element-type check');
    assert.ok(v.some((x) => x.includes('unconditionally')), '(e) a commented-out hidden drop must not satisfy the fallback check');
    assert.ok(v.some((x) => x.includes('never raised')), '(e) a commented-out showModal must not satisfy the raise check');
  });
  console.log('PASS (e) negative direction: commented-out <dialog> / hidden drop / showModal satisfy nothing');

  // -- (a): the new dialog joins the display-gating set ---------------------------------------------
  const cssBadClearChoice = ['#clear-choice {', '  display: flex;', '}', '#leave-confirm[open] {', '  max-block-size: 45dvh;', '}'].join('\n');
  withTempFixture('tokens.css', cssBadClearChoice, (text) => {
    const v = checkTokensCss(text);
    assert.ok(v.some((x) => x.startsWith('(a)')), '(a) must flag an ungated display: rule on #clear-choice too');
  });
  console.log('PASS (a) known-bad fixture (display on bare #clear-choice) is flagged');

  // --- stripComments() precondition (see findLineCommentOpeners' header): no `//` inside a quoted
  // value in the file this script feeds that stripper. The pinned set is ASTRO_FILE alone — the set
  // stripComments() is actually called on. CSS_FILE is deliberately EXCLUDED: checkTokensCss() runs
  // its own block-comment-only strip and never sees this one, so a `url(https://…)` landing in
  // tokens.css would red CI over a stripper that never touches it. ---

  // Calibration, FIRING direction: without this the pin below is a guard that cannot fail.
  for (const [label, fixture] of [
    ['a URL in a markup attribute', '<a itemtype="https://schema.org/X" data-stable-exit href="/games/">'],
    ['a protocol-relative path in a single-quoted string', "const s = '//cdn.example.com/x.js';"],
    ['a double slash inside a double-quoted string', 'const p = "a//b"; const q = 1;'],
    ['a URL inside an HTML comment sharing a line with live markup', '<!-- ref: https://x --> <a data-stable-exit href="/games/">'],
  ]) {
    const hits = findLineCommentOpeners(fixture).filter((o) => o.inString);
    assert.equal(hits.length, 1, `${label}: must read as a `+'`//`'+` inside a string, else the pin below cannot fail`);
  }
  console.log('PASS line-comment-opener detector, firing direction: a URL in an attribute, a protocol-relative path, a double slash inside a string, and a URL inside an HTML comment all read as in-string');

  // Calibration, ACROSS LINES: the three shapes a per-line parity count cannot see, each routed
  // through the same temp-file read main() uses. Every one of these has a `//` on a line whose own
  // backtick count is ZERO or misleading, so the line in isolation says "code" while the file says
  // "inside a template literal". The `zero backticks on the hit line` assertion is what proves the
  // fixture actually reaches the cross-line branch rather than passing for some other reason
  // (docs/adr/0030 — a fixture that never reaches the branch it is cited to pin).
  for (const [label, lines, hitLine, alsoClean] of [
    [
      'a `//` on an interior line of a multi-line template literal',
      ['const html = `', '  <a href="/games/">x</a>', '  //cdn.example.com/x.js', '`;'],
      3,
      null,
    ],
    [
      'an escaped backtick must not close the template',
      ['const t = `tick \\` still open', '  //still inside the template', '`;'],
      2,
      null,
    ],
    [
      'a template nested inside a ${} interpolation',
      ['const a = `outer ${ wrap(`nested', '  //deep inside the nested template', '`) } tail`;', '// an ordinary comment, every template closed'],
      2,
      4,
    ],
  ]) {
    withTempFixture('PlayerSetup.astro', lines.join('\n'), (text) => {
      const openers = findLineCommentOpeners(text);
      const hit = openers.find((o) => o.line === hitLine);
      assert.ok(hit, `${label}: no \`//\` opener reported on line ${hitLine} at all`);
      assert.equal((lines[hitLine - 1].match(/`/g) || []).length, 0, `${label}: the hit line must carry zero backticks of its own, or it does not exercise the cross-line walk`);
      assert.equal(hit.inString, true, `${label}: line ${hitLine} must read as inside a template literal`);
      if (alsoClean !== null) {
        const clean = openers.find((o) => o.line === alsoClean);
        assert.ok(clean && clean.inString === false, `${label}: line ${alsoClean} must read as an ordinary comment — template depth has to unwind`);
      }
    });
  }
  console.log('PASS line-comment-opener detector, across lines: an interior template line, an escaped backtick, and a ${}-nested template all carry template state past the newline');

  // Calibration, OTHER direction: the ordinary comment shapes this file writes constantly. Any of
  // these reading as in-string would make the pin a false alarm on a tree that is fine.
  for (const [label, fixture] of [
    ['a line-start comment', '  // pendingHref must clear on close, not per-button'],
    ['a line-start comment that quotes a URL', '  // see https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog'],
    ['a trailing comment after code — the shape PlayerSetup.astro really ships', '  resumeBtn.focus(); // take eyes and screen readers to the panel foot'],
    ['a trailing comment after a string holding an apostrophe', 'const t = "don\'t stop"; // apostrophes must never be counted as quotes'],
    ['a comment after a block comment on the same line', '/* was: showModal() */ // now capability-gated'],
  ]) {
    assert.deepEqual(findLineCommentOpeners(fixture).filter((o) => o.inString), [], `${label}: must NOT read as a \`//\` inside a string`);
  }
  console.log('PASS line-comment-opener detector, other direction: line-start comments, a URL quoted inside a comment, trailing comments, and an apostrophe in prose are all clean');

  // Calibration, BLOCK-COMMENT direction (the rung closed this round): stripComments() blanks
  // `/*` ... terminator textually, so a `/*` inside a quoted value eats every live line down to the
  // next terminator anywhere in the file. Firing direction first — the fixture's middle line is the
  // live (d) selector, and it must be provably blanked, or this fixture pins nothing (ADR-0030).
  const blockInString = [
    'const tip = "ratio /* 2";',
    "  const link = (e.target as Element).closest?.('a[href]:not([data-stable-exit])');",
    '/* an ordinary block comment */',
  ].join('\n');
  withTempFixture('PlayerSetup.astro', blockInString, (text) => {
    const hits = findLineCommentOpeners(text).filter((o) => o.inString);
    assert.equal(hits.length, 1, 'a `/*` inside a quoted value must be reported as an in-string opener');
    assert.equal(hits[0].kind, '/*', 'the reported opener must be the block-comment kind');
    assert.equal(hits[0].line, 1, 'the report must point at the line carrying the in-string `/*`');
    assert.ok(
      !stripComments(text).includes('data-stable-exit'),
      'fixture must actually reach the hazard: stripComments() has to blank the live (d) selector on line 2',
    );
  });
  console.log('PASS block-comment opener, firing direction: a `/*` inside a quoted value is reported (kind /*), and stripComments() is measured blanking the live line below it');

  // Calibration, OTHER direction: the block-comment forms this file and PlayerSetup.astro really
  // write must stay silent, or walking block state instead of pre-blanking traded a fail-open for a
  // gate that cannot run. A `//` INSIDE a real block comment is the one that used to be pre-blanked.
  for (const [label, fixture] of [
    ['a single-line block comment', '/* pendingHref clears on close */'],
    ['a `//` inside a real block comment', '/* see https://example.com/x */ const q = 1;'],
    ['a multi-line block comment carrying a `//`', '/* was:\n   //cdn.example.com/x.js\n */\nconst q = 1;'],
    ['an Astro brace comment', "  {/* was: closest?.('a[href]:not([data-stable-exit])') */}"],
    ['a block comment then a line comment on one line', '/* was: showModal() */ // now capability-gated'],
  ]) {
    assert.deepEqual(findLineCommentOpeners(fixture).filter((o) => o.inString), [], `${label}: must NOT be reported as an in-string opener`);
  }
  console.log('PASS block-comment opener, other direction: single-line, multi-line, Astro-brace and mixed block comments all stay clean');

  // -- DISCLOSED CEILING, measured. These two rungs are OPEN BY DESIGN (see findLineCommentOpeners'
  // header). The assertions pin the WRONG-BUT-KNOWN behaviour on purpose: if a later change closes
  // either rung, these fail and the header's disclosure has to be rewritten in the same commit
  // rather than quietly becoming false — which is exactly how the previous "loud, not silent"
  // sentence survived being measurably wrong.
  for (const [label, lines, hitLine] of [
    [
      'rung 1: a lone backtick in a regex literal flips template parity, so the NEXT real template reads as CODE',
      ['const re = /`/;', 'const html = `', '  ratio //3 <a data-stable-exit href="/games/">x</a>', '`;'],
      3,
    ],
    [
      'rung 1: same flip from a lone backtick in HTML text',
      ['<p>press ` then go</p>', 'const html = `', '  ratio //3 <a data-stable-exit href="/games/">x</a>', '`;'],
      3,
    ],
    [
      'rung 2: a multi-line HTML attribute value — the `\'`/`"` per-line reset cannot follow it',
      ['<a title="see', '//games ..." data-stable-exit href="/games/">x</a>'],
      2,
    ],
  ]) {
    withTempFixture('PlayerSetup.astro', lines.join('\n'), (text) => {
      const hit = findLineCommentOpeners(text).find((o) => o.line === hitLine);
      assert.ok(hit, `${label}: no opener reported on line ${hitLine} at all`);
      assert.equal(hit.inString, false, `${label}: DISCLOSED — the pin reads this line as ordinary code and stays GREEN`);
      assert.ok(
        !stripComments(text).split('\n')[hitLine - 1].includes('data-stable-exit'),
        `${label}: DISCLOSED — stripComments() blanks the live data-stable-exit href behind that green`,
      );
    });
  }
  console.log('PASS disclosed ceiling, measured: rung 1 (parity flip, both backtick sources) and rung 2 (multi-line HTML attribute) each read inString:false while stripComments() blanks live code — silent, not loud');

  // The pin itself, over the REAL files. Every file (c)/(d)/(e) read is walked, not just one: since
  // gh#106 the stripper is fed TWO authored islands, and pinning only one of them would leave the
  // other's quoted values able to blank live code behind a green. Two things must hold per file, and
  // the second is the positive control: a detector returning nothing looks exactly like a clean file
  // (docs/adr/0019).
  for (const rel of ASTRO_FILES) {
    const openers = findLineCommentOpeners(fs.readFileSync(path.join(repoRoot, rel), 'utf8'));
    for (const o of openers) {
      assert.ok(
        !o.inString,
        `${rel}:${o.line}: this \`${o.kind}\` sits inside a quoted value, not in a comment. ` +
          (o.kind === '/*'
            ? 'stripComments() blanks from it to the next textual block-comment terminator, which may be many lines down, so every live line in between '
            : 'stripComments() blanks from it to END OF LINE, so every live character after it on that line ') +
          'is invisible to conditions (c)/(d)/(e) — this gate may now be going green on code it never ' +
          `read. Move the value onto its own line away from the guards, or take the upgrade path in ` +
          `findLineCommentOpeners' header and give stripComments() a real string-state walk. Line: ${o.text}`,
      );
    }
    assert.ok(
      openers.length > 0,
      `found zero \`//\` openers in ${rel} — the detector reported nothing, which is not the ` +
        'same as none existing (docs/adr/0019). Check findLineCommentOpeners() before trusting this pin.',
    );
    console.log(`PASS stripComments precondition: ${openers.length} \`//\` opener(s) in ${rel}, none inside a quoted value (tokens.css excluded — stripComments() is never run on it)`);
  }

  selftestPerPageMount();
}

// ---------------------------------------------------------------------------
// (f) calibration. Fixtures are in-memory file maps in the same shape listAstroFiles() returns, so the
// pure function is exercised exactly as main() exercises it. Both directions per shape, and the
// known-bad legs assert WHICH pages are named: a gate that reds on all-or-nothing but cannot say
// "these three" is still blind to the failure gh#106 was opened on — the mount excluded a SUBSET.
// ---------------------------------------------------------------------------
const FIXTURE_GAMES = [
  { id: 'timebomb', players: [2, 10] },
  { id: 'siamsi', players: [1, 1] },
  { id: 'love-match', players: [1, 1] },
];
const fixtureTree = (layoutMount, ownerBody = '<dialog id="leave-confirm"></dialog>') =>
  new Map([
    [GAME_PAGE, "---\nimport GameLayout from '../../layouts/GameLayout.astro';\n---\n<GameLayout game={game} />"],
    [GAME_LAYOUT, `---\nimport LeaveConfirm from '../shell/LeaveConfirm.astro';\n---\n${layoutMount}`],
    ['src/shell/LeaveConfirm.astro', ownerBody],
  ]);
const namedPages = (violations) =>
  [...new Set(violations.flatMap((v) => [...v.matchAll(/\/game\/([\w-]+)\//g)].map((m) => m[1])))].sort();

function selftestPerPageMount() {
  // known-good: unconditional mount, in both spellings the repo writes.
  for (const mount of ['<LeaveConfirm gameId={game.id} />', '<div>{game.ads && <span/>}</div>\n<LeaveConfirm gameId={game.id} />']) {
    assert.deepEqual(
      checkPerPageMount(FIXTURE_GAMES, fixtureTree(mount)),
      [],
      '(f) an unconditional mount must report zero violations, and a sibling expression must not be read as its guard',
    );
  }
  console.log('PASS (f) known-good fixture: an unconditional <LeaveConfirm> mount covers every manifest page');

  // known-bad, the SHIPPED defect verbatim: the guard that renders the setup panel, inherited by the
  // dialog that used to live inside it. Only the [1, 1] pages must be named.
  const shipped = checkPerPageMount(
    FIXTURE_GAMES,
    fixtureTree('{(game.players[0] !== 1 || game.players[1] !== 1) && (\n  <LeaveConfirm gameId={game.id} />\n)}'),
  );
  assert.deepEqual(namedPages(shipped), ['love-match', 'siamsi'], '(f) must name exactly the [1, 1] pages the panel guard excludes');
  assert.ok(shipped.every((v) => v.startsWith('(f)')), '(f) the shipped-defect fixture must only produce (f) violations');
  console.log('PASS (f) known-bad fixture (the shipped panel guard on the mount): names exactly the [1, 1] pages, not the party page');

  // known-bad, ONE page: the failure a gate that only reds all-or-nothing cannot see.
  const onePage = checkPerPageMount(FIXTURE_GAMES, fixtureTree("{game.id !== 'siamsi' && <LeaveConfirm gameId={game.id} />}"));
  assert.deepEqual(namedPages(onePage), ['siamsi'], '(f) must name the single excluded page and no other');
  console.log('PASS (f) known-bad fixture (one page excluded by id): names siamsi alone');

  // known-bad: a component whose name merely STARTS with the real one, mounted unguarded ABOVE the
  // real mount. `indexOf('<' + local)` stopped at `<LeaveConfirmX`, read its (empty) guard list and
  // reported every page covered, while the real mount below it excluded the [1, 1] pages — the exact
  // false pass gh#106 exists to make impossible. The boundary match must grade the real mount.
  const prefix = checkPerPageMount(
    FIXTURE_GAMES,
    fixtureTree('<LeaveConfirmX />\n{(game.players[0] !== 1 || game.players[1] !== 1) && <LeaveConfirm gameId={game.id} />}'),
  );
  assert.deepEqual(
    namedPages(prefix),
    ['love-match', 'siamsi'],
    '(f) a prefix-named component must not stand in for the real mount — the guarded mount below it is what decides the verdict',
  );
  console.log('PASS (f) known-bad fixture (<LeaveConfirmX> above a guarded <LeaveConfirm>): the prefix mount is not read as the real one');

  // known-bad: the guard moved onto the DIALOG itself rather than the component — same hole, one layer in.
  const ownerGuarded = checkPerPageMount(
    FIXTURE_GAMES,
    fixtureTree('<LeaveConfirm gameId={game.id} />', '{game.players[0] !== 1 && (<dialog id="leave-confirm"></dialog>)}'),
  );
  assert.deepEqual(namedPages(ownerGuarded), ['love-match', 'siamsi'], '(f) a guard on the dialog markup must be graded like a guard on the component');
  console.log('PASS (f) known-bad fixture (guard moved onto the <dialog> inside its own file) is flagged per page');

  // known-bad: a shape this gate cannot read must be REPORTED, never assumed satisfied (docs/adr/0019).
  const ternary = checkPerPageMount(FIXTURE_GAMES, fixtureTree('{game.ads ? <LeaveConfirm gameId={game.id} /> : null}'));
  assert.deepEqual(namedPages(ternary), ['love-match', 'siamsi', 'timebomb'], '(f) an unreadable guard must be reported for every page');
  assert.ok(ternary.every((v) => v.includes('cannot read')), '(f) the unreadable-guard message must say so');
  console.log('PASS (f) known-bad fixture (ternary mount): an unreadable guard fails CLOSED for every page');

  // known-bad: a guard that reads a frontmatter local this gate cannot see — evaluation throws, and a
  // throw must not read as satisfied either.
  const opaque = checkPerPageMount(FIXTURE_GAMES, fixtureTree('{carriesGroup && <LeaveConfirm gameId={game.id} />}'));
  assert.deepEqual(namedPages(opaque), ['love-match', 'siamsi', 'timebomb'], '(f) a guard that cannot be evaluated must be reported for every page');
  assert.ok(opaque.every((v) => v.includes('could not be evaluated')), '(f) an unevaluable guard must say so');
  console.log('PASS (f) known-bad fixture (guard on an invisible frontmatter local): an unevaluable guard fails CLOSED');

  // known-bad: nobody declares the dialog · two files declare it · the layout imports but never renders it.
  const noOwner = new Map([...fixtureTree('<LeaveConfirm gameId={game.id} />')].filter(([rel]) => rel !== 'src/shell/LeaveConfirm.astro'));
  assert.ok(
    checkPerPageMount(FIXTURE_GAMES, noOwner).some((v) => v.includes('found 0')),
    '(f) zero declarations of the dialog must be flagged',
  );
  const twoOwners = fixtureTree('<LeaveConfirm gameId={game.id} />');
  twoOwners.set('src/shell/PlayerSetup.astro', '<dialog id="leave-confirm"></dialog>');
  assert.ok(
    checkPerPageMount(FIXTURE_GAMES, twoOwners).some((v) => v.includes('found 2')),
    '(f) two files declaring the dialog must be flagged — duplicate ids collide',
  );
  assert.ok(
    checkPerPageMount(FIXTURE_GAMES, fixtureTree('<p>no mount here</p>')).some((v) => v.includes('never renders')),
    '(f) an import with no mount must be flagged',
  );
  console.log('PASS (f) known-bad fixtures (no owner · two owners · imported but never rendered) are each flagged');

  // ADR-0019: the rule is per-game, so an empty manifest would satisfy it vacuously.
  assert.ok(
    checkPerPageMount([], fixtureTree('<LeaveConfirm gameId={game.id} />')).some((v) => v.includes('vacuously')),
    '(f) an empty manifest must fail, not pass by having nothing to check',
  );
  console.log('PASS (f) empty-manifest control: zero games fails instead of passing vacuously');

  // The exempt list, both directions: it must actually exempt, and a name that no longer matches a
  // manifest entry must be reported rather than silently covering nothing.
  const broken = fixtureTree("{game.id !== 'siamsi' && <LeaveConfirm gameId={game.id} />}");
  assert.deepEqual(checkPerPageMount(FIXTURE_GAMES, broken, undefined, ['siamsi']), [], '(f) an exempt page must be skipped');
  assert.ok(
    checkPerPageMount(FIXTURE_GAMES, fixtureTree('<LeaveConfirm gameId={game.id} />'), undefined, ['gone-game'])
      .some((v) => v.includes('stale exemption')),
    '(f) an exempt id that is not in the manifest must be reported',
  );
  assert.deepEqual(EXEMPT_GAME_IDS, [], '(f) the real exempt list is empty by design — ADR-0015 exempts tool pages, which are not in this manifest');
  console.log('PASS (f) exempt list, both directions: it exempts what it names, and a stale name is reported');
}

// ---------------------------------------------------------------------------
async function main() {
  if (process.argv.includes('--selftest')) return selftest();

  let anyFail = false;
  // Hole 2 (adversarial review, S2026-08-21): the success line below used to print literal "2 dialogs"
  // / "5 conditions" — constants, not a measurement. `checked` is filled only as each condition below
  // actually runs, so a dialog or condition silently dropping out of the checked set shows up as a
  // smaller printed number instead of a line that keeps claiming full coverage.
  const checked = [];

  const cssViolations = checkTokensCss(fs.readFileSync(CSS_FILE, 'utf8'), checked);
  for (const v of cssViolations) {
    console.error(`src/styles/tokens.css · ${v}`);
    anyFail = true;
  }

  // Both files are read unconditionally: an "only if it exists" read would let deleting the island
  // satisfy (c)/(d) from the other file's text instead of failing loudly.
  const astroTexts = ASTRO_FILES.map((rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8'));
  const astroViolations = checkPlayerSetupAstro(astroTexts, checked);
  for (const v of astroViolations) {
    console.error(`${ASTRO_FILES.join(' + ')} · ${v}`);
    anyFail = true;
  }

  // (f) needs the manifest itself, not a page list — see its header. manifest.ts writes the full .ts
  // extension on every game import, so node resolves it with no loader hook (same as validate-games.mjs).
  const { games } = await import(path.join(repoRoot, 'src/games/manifest.ts'));
  const perPageViolations = checkPerPageMount(games, listAstroFiles(), checked);
  for (const v of perPageViolations) {
    console.error(`${GAME_LAYOUT} · ${v}`);
    anyFail = true;
  }

  if (anyFail) {
    console.error('\nADR-0015: the leave-confirm dialog must stay inert while closed and clear pendingHref on every dismissal (docs/adr/0015-a-leave-confirm-guards-the-links-we-cannot-move.md).');
    console.error('ADR-0015 + ADR-0040 (gh#106): every page that starts a round must MOUNT it — "a page declaring [1, 1] skips the setup panel. Nothing else about the shell\'s start contract moves ... and so do ADR-0014 and ADR-0015" (docs/adr/0040-games-exist-in-one-category-only.md).');
    console.error('ADR-0024: #clear-choice must stay a non-reflowing <dialog> and must still ask when showModal is unavailable (docs/adr/0024-the-reflow-is-the-hazard-not-the-clearance.md).');
    process.exit(1);
  }
  console.log(
    // Every number here is measured, never a literal (Hole 2): the game count comes from the manifest
    // array (f) actually walked, so a manifest that stopped being read prints 0 instead of a line
    // claiming per-page coverage it no longer has.
    `leave-confirm-check: tokens.css + ${ASTRO_FILES.join(' + ')} clean — ${GUARD_DIALOG_IDS.length} dialogs ` +
      `(${GUARD_DIALOG_IDS.join(', ')}), ${checked.length} conditions (${checked.join(', ')}), ` +
      `${games.length - EXEMPT_GAME_IDS.length} of ${games.length} manifest game page(s) proven to mount #leave-confirm`
  );
}

await main();
