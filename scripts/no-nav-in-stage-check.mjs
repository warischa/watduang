#!/usr/bin/env node
// Static regression tripwire for ADR-0014 (docs/adr/0014-no-navigation-target-inside-the-stage.md):
// a game renders no `<a href>` into #stage. This is a cheap source-text check wired into CI —
// it is NOT the proof. scripts/no-nav-in-stage-probe.mjs (build + serve + headless Chrome, reads
// the rendered DOM) is what actually proves the invariant; this script only catches the same
// mistake being reintroduced into source before that heavier probe ever runs.
//
// ponytail: this is a raw source-text scan, not an AST walk — it covers the literal forms this
// codebase's own idiom actually produces: an <a> tag or href=/href: typed directly,
// document.createElement('a'), the local el('a', ...) helper call, and setAttribute('href', ...).
// It cannot see a tag name or
// attribute key assembled from a variable (el(tag) with tag built at runtime, node.setAttribute(key, ...)),
// or `el.innerHTML = someVariable` assembled from a variable — those escape it completely. Treat a
// green run here as "no obvious anchor literal in this codebase's idiom", never as "no navigation
// target reaches the DOM".
//
// Matching is WHOLE-TEXT, not line-by-line. Per-line matching quietly made every pattern single-line:
// a wrapped `document.createElement(\n  'a',\n)` plus its wrapped `setAttribute(\n  'href',\n  …)`
// scanned clean while the anchor was real — that is just what a formatter does to a long call, not an
// exotic spelling. Line numbers are derived from the match offset, so output is unchanged.
//
// It runs on CODE ONLY: comments and TypeScript type space are blanked first (stripComments,
// stripTypeSpace). Whole-text matching without that made prose and types into violations — a comment
// citing ADR-0014 was a violation of ADR-0014, and `interface LinkCfg { href: string }` was one too.
// Neither strip can hide a live hazard sharing the line; each function says why, and both directions
// are pinned by selftest.
//
// ponytail: SCOPE — THREE regions, because ADR-0014's invariant lives in three places and no single
// glob reaches all of them:
//   1. src/games/*.ts — the game modules that fill #stage at runtime;
//   2. src/layouts/GameLayout.astro, between the #stage tags only (STAGE_FILE below);
//   3. src/play/<id>/ — every play route's own directory (gh#167, listPlayFiles below).
// Region 3 was the hole: NO play route renders #stage, so regions 1 and 2 scanned a layer the party
// category's live play surface does not use, and an `<a href>` typed into src/play/<id>/markup.html
// shipped with every gate green. The ceiling this comment used to record — "the globbed set is
// src/games/*.ts" — is lifted, not reworded.
// The element itself is DECLARED IN NEITHER of regions 1 and 2's sources: `<div id="stage" data-game-id={game.id}>` is markup in
// src/layouts/GameLayout.astro, so until gh#68 an `<a href>` typed straight between those tags broke
// ADR-0014 with every gate green. That file is now checked too, but ONLY between the stage's own open
// and close tags (STAGE_FILE below) — a whole-file scan is still refused, because GameLayout.astro's
// CHROME is required by ADR-0014 to carry the crawlable `<a href="/games/">`, so scanning it whole
// would ban the very link the ADR mandates.
//   (This ceiling used to name src/pages/game/[id].astro as the file holding the element and carrying
//   that mandated link. Both halves were false: it declares no #stage and has never had an `href` at
//   all — measured with git log -S. gh#68.)
// src/pages/game/[id].astro is deliberately still unscanned: it only RECEIVES the element, reading
// stage.dataset.gameId and handing it to mount() (measured: zero `href`, zero `<a`, no write into
// #stage), so nothing hides there now. Upgrade path if a stage-writing branch ever lands there: scan
// only that file's <script> block, not its markup.
//
// --- Ceiling: target-set derivation (gh#46, ADR-0019) ----------------------------------
// The target set is a flat `fs.readdirSync(src/games/)` filtered to `*.ts`, so a newly added game
// is scanned automatically — no list to remember. That glob does not recurse: a game shipped as
// src/games/<subdir>/foo.ts is invisible to it and ships unscanned. Pinned by the "flat,
// non-recursive" selftest case below; switching to a recursive glob must update this comment or
// that case goes red.
//
//   node scripts/no-nav-in-stage-check.mjs             -> scan the game modules, exit non-zero if any hit
//   node scripts/no-nav-in-stage-check.mjs --selftest  -> both-direction calibration on a temp fixture

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const scriptPath = fileURLToPath(import.meta.url);
// ponytail: GAMES_DIR_OVERRIDE exists only so the selftest can spawn this script for real
// against a directory it controls, to exercise main()'s actual empty-set exit path. Blocked
// whenever CI is truthy (guard below) so it can never narrow the scanned set in CI. Locally,
// with CI unset, it is still a foot-gun: pointing it at a directory holding one clean file
// gets a green claiming full coverage of a set that was never scanned — that risk is on
// whoever runs it manually, not on this script's default (no env var) invocation.
const gamesDir = process.env.GAMES_DIR_OVERRIDE
  ? path.resolve(process.env.GAMES_DIR_OVERRIDE)
  : path.join(repoRoot, 'src/games');

// ADR-0019: a gate's green must not imply coverage it has not earned. GAMES_DIR_OVERRIDE narrows
// the scanned set by construction, so it must never be usable where a green is actually trusted.
if (process.env.GAMES_DIR_OVERRIDE && process.env.CI) {
  console.error('no-nav-in-stage-check: GAMES_DIR_OVERRIDE must never narrow the scanned set in CI (docs/adr/0019) — unset GAMES_DIR_OVERRIDE or run outside CI.');
  process.exit(1);
}

// Every *.ts file directly under src/games/, minus the non-game files below. _template.ts STAYS
// IN SCOPE: it is the copy-paste seed for every new game (see its own header comment), so an
// anchor literal planted there would propagate into every game created from it.
const EXCLUDED_FILES = new Set([
  'types.ts',     // shared type declarations, not a game module
  'manifest.ts',  // game registry/metadata, not a game module
  '_arm-gate.ts', // shared button-disabling helper the games import, not a module that renders stage content
]);

function listTargetFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.ts') && !EXCLUDED_FILES.has(name))
    .sort();
}

// --- gh#167: the play-route region --------------------------------------------------------
// The party category's play routes do not render #stage at all — the layer both halves of this gate
// scanned above (src/games/*.ts + GameLayout.astro) is not the layer a player taps on /game/<id>/play.
// So the protected region here is a DIRECTORY boundary: everything under src/play/<id>/. That
// boundary is what makes a flat ban safe — the one crawlable exit link ADR-0014 mandates lives in
// page chrome (src/shell/PlayExit.astro, src/pages/game/<id>/play.astro), OUTSIDE src/play/ by
// construction, so nothing in this region is allowed to be an anchor and no allow-list is needed.
// Inverted deliberately: the safe set is empty today (zero real anchors across all 11 routes,
// measured), and the hazardous set grows with every port, so "ban all" converges and "allow these"
// would not.
const playDir = path.join(repoRoot, 'src/play');
const PLAY_EXTS = new Set(['.html', '.js', '.ts']);

/** Every scannable file inside each play-route DIRECTORY under `dir`. Derived from the directories
 *  themselves, never a list of route ids — a twelfth port is scanned the day its directory lands.
 *
 *  ponytail: TWO disclosed ceilings, both fail-open, both cheap to lift if they ever bite.
 *  (1) Only files DIRECTLY inside src/play/<id>/ are scanned, and only .html/.js/.ts — a route
 *      shipping src/play/<id>/parts/foo.js is invisible here, and so is the shared _mascots.ts /
 *      _setup-bridge.ts sitting directly under src/play/ (they are not inside a route directory).
 *      Both are pinned by the derivation selftest, so widening must update that case.
 *  (2) *.test.* files are skipped on purpose: src/play/name-escaping.test.mjs holds a hostile
 *      `<a href>` fixture BY DESIGN, and a test that plants an anchor to prove it gets escaped must
 *      not read as a route rendering one. Tests render nothing. */
function listPlayFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => fs.readdirSync(path.join(dir, entry.name))
      .filter((name) => PLAY_EXTS.has(path.extname(name)) && !name.includes('.test.'))
      .map((name) => `${entry.name}/${name}`))
    .sort();
}

// ---------------------------------------------------------------------------
// Pure: text -> violations. No file IO here, so the selftest can feed it strings directly.
// ---------------------------------------------------------------------------
// Matched against the WHOLE file, not line by line, and every pattern is global. A per-line scan made
// each pattern silently single-line: `document.createElement(\n  'a',\n)` and the `setAttribute(\n
// 'href',\n …)` that arms it both went green while the anchor was real — the formatter's own output for
// a wrapped call is enough to defeat it. Line numbers come from the match offset, so reporting is
// unchanged. An `<a` wrapped onto the next line is caught by its `href` (see the anchor pattern's
// trailing class below for why the newline is deliberately NOT in it).
//
// `href` is matched before `=` OR `:` — the property-literal form `Object.assign(link, { href: url })`
// builds exactly the same navigation target and carried no `=` at all. `href:` appears nowhere in the
// scanned set today, so this costs no false positive — re-measured over the WIDENED set (gh#167), not
// carried over from the src/games-only reading it replaces: across src/games/*.ts plus every
// src/play/<id>/*.{html,js,ts}, zero `href:` and zero `href=` survive the strips. The only raw `href`
// tokens in that whole set are the two ADR-0014 prose sentences inside HTML comments
// (src/play/dice-loser/markup.html, src/play/timebomb/markup.html), which stripHtmlComments blanks.
// Re-measure rather than trusting this paragraph:
//   grep -rn 'href' src/games/*.ts src/play/*/markup.html src/play/*/main.* src/play/*/roster-bridge.ts
//
// The anchor pattern's trailing class is ` \t>` and deliberately NOT `\s`: with whole-text matching a
// `\s` there spans the newline, so any line ENDING in `<a` — a comparison a formatter wrapped after
// the operator — became an anchor tag. Nothing is lost by excluding the newline: an `<a>` broken
// across lines still carries its `href` on one of them, and an `<a>` with no href is not a navigation
// target at all, which is the only thing ADR-0014 bans. Pinned both ways below.
const PATTERNS = [
  { name: 'anchor tag literal (<a )', re: /<a[ \t>]/gi },
  { name: 'href attribute or property literal (href= / href:)', re: /\bhref\s*[:=]/gi },
  { name: "createElement('a') / createElement(\"a\")", re: /createElement\(\s*(['"])a\1\s*,?\s*\)/g },
  { name: "el('a', ...) / el(\"a\", ...) — local helper with an anchor tag", re: /\bel\(\s*(['"])a\1/g },
  { name: "setAttribute('href', ...) / setAttribute(\"href\", ...)", re: /setAttribute\(\s*(['"])href\1/gi },
];

// Comments and TypeScript type space are blanked (to spaces, never deleted, so every offset and line
// number is unchanged) before any pattern runs — the one choke point findViolations reads through.
// Without it, whole-text matching turned prose and types into ADR-0014 violations: `// no href: or <a
// in this module`, a comment that CITES the ADR, was a violation of it, and `interface LinkCfg { href:
// string }` was one too (five of the seven scanned modules already declare an interface or a type
// alias, so that shape is live in this tree today, not hypothetical).
const blank = (m) => m.replace(/[^\n]/g, ' ');

/** Blanks `//` and `/* *\/` comments, walking the text with STRING STATE rather than replacing on a
 *  bare /\/\/[^\n]* \/ regex.
 *
 *  Why the walk, and why blanking here cannot hide a hazard on the same line: the naive regex reads
 *  the `//` inside `'https://games/'` as a comment opener and blanks the REST OF THAT LINE with it —
 *  so `const u = 'https://games/'; link.setAttribute('href', u);` would scan clean while building a
 *  real anchor. That is ADR-0019's recorded hole class (the `'https://schema.org'` one). Skipping
 *  string literals means a comment opener is only ever recognised where the JS parser would recognise
 *  one, so the blanked span is exactly a comment and everything else on the line still scans. Strings
 *  themselves are never blanked — an `<a href>` lives in a template literal, which is precisely where
 *  this gate must keep looking.
 *
 *  ponytail: a regex literal containing an unbalanced quote (`/['"]/`) would desync the string state.
 *  The walk enters string mode at that quote and resumes MID-STRING, where a `/*` sitting inside a
 *  string literal opens a false block comment and blanks live code up to the next `*\/`. That is
 *  fail-OPEN: a real anchor can be blanked out of the scan. Not fixed here, because telling a literal
 *  from division needs the previous significant token. The precondition is PINNED instead —
 *  findRegexLiterals() below, plus the selftest case that runs it over the scanned game modules.
 *  A quote-bearing literal landing there reds CI, and whoever it stops reads this paragraph. That pin
 *  deliberately EXCLUDES STAGE_FILE, which this walk is also fed: markup reads as a regex literal to
 *  that detector, so pinning the layout would red CI on valid HTML. The layout is covered instead by
 *  the exactly-one #stage count. findStageViolations() also slices `inner` out of rawText, not out of
 *  the stripped text, so the empty-pin's CONTENT check cannot be fooled by a desync at all — only the
 *  tag offsets come from stripped text, and a desync that moves them reads as `found 0` and fails.
 *  The literal COUNT is deliberately not written down here — the selftest prints it, so it cannot
 *  rot. Upgrade path when that day comes: skip regex literals in this walk too — but NOT by wiring
 *  findRegexLiterals() in as it stands. Measured, not assumed: that detector reads the `</a></p>` of
 *  GameLayout.astro's ADR-0014 chrome link as a regex literal, so reusing it here would make this walk
 *  skip live markup in the one file gh#68 widened this gate to reach — converging would open the hole
 *  it was meant to close. Teach the detector to stop at markup FIRST, then reuse it here. */
function stripComments(text) {
  const out = [...text];
  let i = 0;
  const blankTo = (end) => { for (let k = i; k < end; k++) if (out[k] !== '\n') out[k] = ' '; };
  while (i < text.length) {
    const c = text[i];
    const two = text.slice(i, i + 2);
    if (two === '//') {
      const nl = text.indexOf('\n', i);
      const end = nl === -1 ? text.length : nl;
      blankTo(end);
      i = end;
    } else if (two === '/*') {
      const close = text.indexOf('*/', i + 2);
      const end = close === -1 ? text.length : close + 2;
      blankTo(end);
      i = end;
    } else if (c === '"' || c === "'" || c === '`') {
      i++;
      while (i < text.length && text[i] !== c) i += text[i] === '\\' ? 2 : 1;
      i++;
    } else {
      i++;
    }
  }
  return out.join('');
}

// Expression-position keywords: they read as word characters, so the "ends an expression" test in
// findRegexLiterals() would call `return /re/` a division without them.
const EXPR_KEYWORD_RE = /\b(?:return|typeof|instanceof|in|of|new|delete|void|throw|do|else|case|yield|await)$/;

/** Every regex literal in `text`, by the classic previous-significant-token heuristic: a `/` opens a
 *  literal unless the token before it can END an expression (a word char, `)`, `]`, or a string —
 *  with the keyword exceptions above, which read as word chars but are expression position).
 *  Exists only to pin stripComments()'s precondition; see that function's header for the hazard.
 *
 *  Why sharing the same comment/string walk is not circular: ONLY a quote-bearing regex literal can
 *  desync that walk, so the walk is still in sync when it reaches the FIRST one. Finding that first
 *  one is all the pin needs — whatever the walk reports after it is already the failure being pinned.
 *
 *  ponytail: DISCLOSED CEILING — what this does NOT cover, stated so a green is not over-read: a literal in statement position
 *  after `)` or `]` (`if (x) /re/.test(y)`) reads as division and is MISSED, and so is one spanning a
 *  newline. Neither shape exists in the pinned set today and neither is an idiom this codebase writes;
 *  a miss costs the pin, not the gate itself. Over-approximating is the deliberate direction — a false
 *  hit reds CI and gets read by a human, a miss is silent. Both directions are pinned by selftest.
 *  Trigger to widen: either shape landing in a scanned module. Widening means giving the token test a
 *  statement-vs-expression distinction — the same work the stripComments() upgrade path needs, so do
 *  both in one go rather than growing this heuristic on its own. */
function findRegexLiterals(text) {
  const found = [];
  let sig = ''; // significant text so far: comments dropped, each string collapsed to one word char
  let i = 0;
  while (i < text.length) {
    const two = text.slice(i, i + 2);
    if (two === '//') {
      const nl = text.indexOf('\n', i);
      i = nl === -1 ? text.length : nl;
      continue;
    }
    if (two === '/*') {
      const close = text.indexOf('*/', i + 2);
      i = close === -1 ? text.length : close + 2;
      continue;
    }
    const c = text[i];
    if (c === '"' || c === "'" || c === '`') {
      i++;
      while (i < text.length && text[i] !== c) i += text[i] === '\\' ? 2 : 1;
      i++;
      sig += 'x'; // a string is a VALUE: the next `/` after it is division, never a literal
      continue;
    }
    if (c === '/') {
      const tail = sig.replace(/\s+$/, '');
      const endsExpression = /[\w$)\]]$/.test(tail) && !EXPR_KEYWORD_RE.test(tail);
      if (!endsExpression) {
        let j = i + 1;
        let inClass = false;
        while (j < text.length && text[j] !== '\n') {
          const d = text[j];
          if (d === '\\') { j += 2; continue; }
          if (d === '[') inClass = true;
          else if (d === ']') inClass = false;
          else if (d === '/' && !inClass) break;
          j++;
        }
        if (text[j] === '/') {
          found.push(text.slice(i, j + 1));
          i = j + 1;
          sig += 'x';
          continue;
        }
      }
    }
    sig += c;
    i++;
  }
  return found;
}

const carriesQuote = (literal) => /['"`]/.test(literal);

const TYPE_DECL_RE = /^(?:export\s+)?(?:declare\s+)?(?:interface\s+\w+|type\s+\w+[^\n=]*=)[^{;\n]*\{/gm;

/** Blanks the BODY of an `interface X { … }` / `type X = { … }` declaration, brace-matched from its
 *  opening `{` — the same brace-counting idiom extractRenderFunctions() uses in
 *  scripts/arm-gate-coverage-check.mjs.
 *
 *  Why this cannot hide a hazard: TypeScript type space is erased at compile time, so nothing inside
 *  a type body can ever construct a DOM node — there is no navigation target in there to hide. And
 *  the blanked span ends at the MATCHING brace, not at end of line, so a statement sharing the line
 *  (`interface X { href: string } const link = el('a');`) is still scanned. Pinned both ways below.
 *  A `}` inside a string literal type ends the match early, which blanks LESS and scans more —
 *  the fail-safe direction. The one fail-OPEN residue is an unclosed brace, which blanks to end of
 *  file; that file does not compile, and `npx astro check` runs ahead of this gate in CI. */
function stripTypeSpace(text) {
  let out = text;
  TYPE_DECL_RE.lastIndex = 0;
  let m;
  while ((m = TYPE_DECL_RE.exec(text))) {
    const bodyStart = m.index + m[0].length;
    let depth = 1;
    let i = bodyStart;
    while (i < text.length && depth > 0) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') depth--;
      i++;
    }
    const end = depth === 0 ? i - 1 : text.length;
    out = out.slice(0, bodyStart) + blank(out.slice(bodyStart, end)) + out.slice(end);
    TYPE_DECL_RE.lastIndex = end;
  }
  return out;
}

/** Blanks `<!-- … -->` comments, the .html analogue of stripComments(). Length-preserving, same as
 *  every other strip here, so offsets and line numbers are unchanged.
 *
 *  Why it is required and not optional: every play route's markup.html states the ADR-0014 rule as
 *  prose — "No <a href> anywhere in here" — inside an HTML comment. Feeding that to the pattern set
 *  unstripped makes the sentence a violation of the rule it states, on two routes, on the first run.
 *  The fix is stripping the comment, never loosening the pattern.
 *
 *  Not the JS walk: these files have no `<script>` and no `//` anywhere (measured), but a URL in an
 *  href-less attribute would give the JS walk a false comment opener that blanks the rest of the
 *  line — including a live anchor after it. A `<!--` with no closing `-->` matches nothing and so
 *  blanks nothing: fail-SAFE, the file scans whole. */
function stripHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, blank);
}

/** `kind` picks how much of the text is blanked before the patterns run, and the three regions do
 *  NOT get the same treatment:
 *    'html' — blank <!-- --> only. Required, not optional: src/play/dice-loser/markup.html and
 *             src/play/timebomb/markup.html both state the ADR-0014 rule as prose ("No <a href>
 *             anywhere in here") inside a comment, and unstripped that sentence violates the rule
 *             it states.
 *    'raw'  — blank NOTHING. This is the play region's .js/.ts (see scanTargetFiles's caller).
 *             stripComments() is fail-OPEN on a quote-bearing regex literal (its header explains
 *             why, and why wiring findRegexLiterals() in is a trap), and 7 files under a play route
 *             directory carry one today — so stripping there can blank a live anchor out of the
 *             scan. Raw has no walk to desync. It is affordable because no play script contains an
 *             `<a` or an `href` in code OR in a comment (measured; re-measure with
 *             `grep -rnE '<a |href' src/play/<id>/main.js src/play/<id>/roster-bridge.ts`, globbing
 *             the id), and it fails CLOSED: the day one does, this reds. That is the correct outcome for a
 *             live anchor and a tolerable one for a commented-out anchor or an `href: string` type
 *             in a play bridge — which is exactly what would start it false-firing. Fix the comment,
 *             or lift the ceiling in stripComments() first and switch this back to 'js'.
 *    'js'   — the game modules and STAGE_FILE: comments and TypeScript type space blanked. Those
 *             files DO carry ADR-0014 prose and `interface { href: string }` declarations, so the
 *             strips are load-bearing there, and their regex literals are pinned quote-free below. */
function findViolations(rawText, kind = 'js') {
  const text =
    kind === 'html' ? stripHtmlComments(rawText) : kind === 'raw' ? rawText : stripTypeSpace(stripComments(rawText));
  const violations = [];
  const lines = rawText.split('\n'); // snippets quote REAL source, which is what blanking (not deleting) buys
  const lineOf = (index) => text.slice(0, index).split('\n').length;
  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    for (const m of text.matchAll(p.re)) {
      const line = lineOf(m.index);
      violations.push({ line, pattern: p.name, snippet: lines[line - 1].trim() });
    }
  }
  return violations.sort((a, b) => a.line - b.line || a.pattern.localeCompare(b.pattern));
}

// ---------------------------------------------------------------------------
// gh#68: the OTHER surface — the #stage element's own declaration, pinned to EMPTY.
// ---------------------------------------------------------------------------
// The hazard set here is "static children of #stage in the layout source". It is small, it is ours,
// and it is currently the empty set — so the assertion is not "no anchors in there", it is "nothing
// in there at all". The runtime set (what a game appends at mount) is already double-covered: the
// glob scan above reads every game module, and scripts/no-nav-in-stage-probe.mjs queries
// stage.querySelectorAll('a[href]') mid-round against the rendered DOM. dist/ is a pure function of
// this same source line, so a built-HTML check would add a build dependency and guard nothing extra.
//
// ponytail: pin-to-EMPTY costs one known false positive — INNOCENT REFORMATTING GOES RED. Splitting
// `<div id="stage" …></div>` across two lines, or leaving a newline or a comment between the tags,
// fails this gate without changing a single thing the browser renders. That is one line in one file
// and the failure message quotes exactly what it found, so the fix is "put the tags back together";
// accepted deliberately, because the alternative (tolerate whitespace, ban only anchors) reopens the
// unbounded set — every other way to reach /games/ from inside the stage. Second known edge, same
// fail-SAFE direction: the open tag is matched on the literal `id="stage"`, so a single-quoted or
// computed id reads as ZERO stage divs and the gate goes red rather than silently scanning nothing.
const STAGE_FILE = 'src/layouts/GameLayout.astro';
const STAGE_OPEN_RE = /<div\b[^>]*\bid="stage"[^>]*>/g;

// Pure: raw layout text -> violation messages. Comments are blanked first (stripComments, the same
// choke point findViolations reads through) so a `{/* <div id="stage">…*/}` example left behind in
// prose can neither be counted as a second stage nor stand in for the real one — exactly the
// commented-out-selector hole scripts/stable-exit-markers-check.mjs pins for its own marker.
// Blanking preserves length, so offsets taken from the blanked text index the RAW text, and the
// snippet in the message quotes real source. That also means the emptiness verdict is identical
// whichever text it slices (all-spaces is not '' either); raw is used only so the message is legible.
function findStageViolations(rawText) {
  const text = stripComments(rawText);
  const opens = text.match(STAGE_OPEN_RE) || [];
  if (opens.length !== 1) {
    return [
      `${STAGE_FILE}: expected exactly one <div id="stage" …>, found ${opens.length}` +
        (opens.length === 0
          ? ' — the element this gate reads is gone, renamed, or no longer spelled id="stage", so it would scan nothing (docs/adr/0019)'
          : ' — a second stage declaration is a second unchecked surface, not a formatting change'),
    ];
  }
  STAGE_OPEN_RE.lastIndex = 0;
  const open = STAGE_OPEN_RE.exec(text);
  const innerStart = open.index + open[0].length;
  const close = text.indexOf('</div>', innerStart);
  const inner = rawText.slice(innerStart, close === -1 ? rawText.length : close);
  if (inner !== '') {
    return [
      `${STAGE_FILE}: #stage must ship EMPTY — the game module fills it at runtime, and anything ` +
        `static in there is a tap target a transition can drop under a finger (ADR-0014). Found ` +
        `between its tags: ${JSON.stringify(inner.length > 160 ? `${inner.slice(0, 160)}…` : inner)}`,
    ];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Self-test: a temp fixture, never repo content, so fixing a game can't retune the check.
// Calibrated both ways — a clean fixture must pass, and each planted pattern must be flagged.
// ---------------------------------------------------------------------------
function selftest() {
  // Known-good: the actual idiom this codebase uses to build non-anchor elements — el(tag) with
  // a variable tag, el('button', ...) with a non-anchor literal tag, no setAttribute('href', ...).
  const cleanText = [
    "function el(tag) { return document.createElement(tag); }",
    "const label = `${players.length} คน`;",
    "el('button', 'ต่อไป');",
  ].join('\n');
  const clean = findViolations(cleanText);
  assert.deepEqual(clean, [], 'known-good fixture must report zero violations');
  console.log('PASS known-good fixture: clean createElement(tag)/template/el() calls report zero violations');

  // Known-bad: one line per pattern, plus the realistic two-line construct this codebase's own
  // el() helper actually forces a regression into — el() takes no attributes parameter, so
  // el('a', ...) followed by setAttribute('href', ...) is the only way to build a link with it.
  const dirtyText = [
    "const html = `<a href=\"/games/\">กลับ</a>`;", //  1  anchor tag + href, both patterns
    "const link = document.createElement('a');", //     2  createElement('a')
    "const link2 = document.createElement(\"a\");", //  3  createElement("a")
    "const link3 = el('a', 'ดูเกมอื่น');", //           4  el('a', ...)
    "link3.setAttribute('href', '/games/');", //         5  setAttribute('href', ...)
  ].join('\n');
  const dirty = findViolations(dirtyText);
  const byLine = (n) => dirty.filter((v) => v.line === n).map((v) => v.pattern);
  assert.deepEqual(byLine(1).sort(), PATTERNS.slice(0, 2).map((p) => p.name).sort(), 'line 1 must flag both anchor-tag and href patterns');
  assert.equal(byLine(2).length, 1, "line 2 must flag createElement('a')");
  assert.equal(byLine(3).length, 1, 'line 3 must flag createElement("a")');
  assert.equal(byLine(4).length, 1, "line 4 must flag el('a', ...)");
  assert.equal(byLine(5).length, 1, "line 5 must flag setAttribute('href', ...)");
  console.log(`PASS known-bad fixture flags all 5 patterns (6 hits across 5 lines, line 1 double-flags):\n${dirty.map((v) => `     line ${v.line} · ${v.pattern} · ${v.snippet}`).join('\n')}`);

  // Known-bad, MULTI-LINE: the same two constructs a formatter wraps when the call gets long. Under
  // the old per-line scan both of these reported ZERO — planted verbatim into a real game module and
  // measured, not reasoned. Revert findViolations to text.split('\n') and this case goes green.
  const wrappedText = [
    "  const link = document.createElement(", //  1
    "    'a',", //                                2  createElement('a') closes here
    "  );", //                                    3
    "  link.setAttribute(", //                    4
    "    'href',", //                             5  setAttribute('href' closes here
    "    '/games/',", //                          6
    "  );", //                                    7
    "  const wrapped = el(", //                   8
    "    'a',", //                                9  el('a' closes here
    "  );", //                                   10
  ].join('\n');
  const wrapped = findViolations(wrappedText);
  const wrappedPatterns = new Set(wrapped.map((v) => v.pattern));
  assert.ok(wrappedPatterns.has(PATTERNS[2].name), "a createElement( ... 'a' ... ) wrapped across lines must be flagged");
  assert.ok(wrappedPatterns.has(PATTERNS[4].name), "a setAttribute( ... 'href' ... ) wrapped across lines must be flagged");
  assert.ok(wrappedPatterns.has(PATTERNS[3].name), "an el( ... 'a' ... ) wrapped across lines must be flagged");
  console.log(`PASS known-bad multi-line: wrapped createElement/setAttribute/el calls flagged (${wrapped.length} hit(s)) — a per-line scan reported zero on all three`);

  // Known-bad, PROPERTY form: the same navigation target built without a single `=`. Also measured
  // green against the old pattern set.
  const propForm = "Object.assign(link, { href: '/games/' });";
  const prop = findViolations(propForm);
  assert.equal(prop.length, 1, 'an href: property literal must be flagged exactly once');
  assert.equal(prop[0].pattern, PATTERNS[1].name);
  console.log(`PASS known-bad property form: ${prop[0].snippet} flagged as ${prop[0].pattern}`);

  // Other direction for both widenings: the codebase's real non-anchor idiom must stay clean, and a
  // wrapped call that builds a BUTTON must not be dragged in by the whole-text match.
  const wrappedClean = [
    "  const btn = el(",
    "    'button',",
    "    'เล่นอีกรอบ',",
    "  );",
    "  const node = document.createElement(",
    "    tag,",
    "  );",
  ].join('\n');
  assert.deepEqual(findViolations(wrappedClean), [], 'wrapped el(\'button\')/createElement(tag) calls must stay clean under whole-text matching');
  console.log("PASS whole-text matching, other direction: wrapped el('button', …) and createElement(tag) report zero violations");

  // --- NOT CODE: prose and TypeScript type space. Every case here was measured RED against the
  // pre-strip whole-text scan — including a comment that CITES ADR-0014 being a violation of it, and
  // an `interface { href: string }`, a shape five of the seven scanned modules already carry. Delete
  // the stripComments()/stripTypeSpace() calls out of findViolations and every case goes red. ---
  for (const [label, text] of [
    ['line comment citing the ADR', '// this module renders no href: and no <a into #stage (ADR-0014)'],
    ['block comment', '/* renders no <a href="/games/"> inside the stage */'],
    ['JSDoc block comment', '/**\n * Builds the panel. Never an <a href>.\n */\nconst x = 1;'],
    ['interface declaration', 'interface LinkCfg { href: string }'],
    ['exported interface, wrapped', 'export interface LinkCfg {\n  href: string;\n  label: string;\n}'],
    ['type alias object', 'type LinkCfg = {\n  href: string;\n};'],
    ['comparison wrapped after the operator', 'const ok = counts[i] <a\n  .length;'],
  ]) {
    assert.deepEqual(findViolations(text), [], `${label}: not code that can build a navigation target — must not be a violation`);
  }
  console.log('PASS not-code, other direction: a line comment citing ADR-0014, a block comment, a JSDoc block, `interface LinkCfg { href: string }`, a wrapped interface, a `type X = { href }` alias and a comparison wrapped after `<` are all clean');

  // --- and neither strip may become a bypass. These are the two ways blanking could hide a real
  // hazard on the SAME LINE, and both must still be flagged:
  //   1. the `//` inside 'https://games/' is not a comment opener (ADR-0019's recorded hole class) —
  //      a naive /\/\/[^\n]*\/ replace blanks the rest of that line and the anchor with it;
  //   2. a type body is blanked only to its MATCHING brace, never to end of line. ---
  for (const [label, text, expectPattern] of [
    ['url containing // then a real setAttribute', "const u = 'https://games/'; link.setAttribute('href', u);", PATTERNS[4].name],
    ['type declaration then a real el(\'a\') on one line', "interface LinkCfg { href: string } const link = el('a');", PATTERNS[3].name],
    ['trailing comment after a real anchor', "const link = el('a', 'ดูเกมอื่น'); // back to the game list", PATTERNS[3].name],
    ['anchor literal wrapped across lines', "const html = `<a\n  href=\"/games/\">กลับ</a>`;", PATTERNS[1].name],
  ]) {
    const v = findViolations(text);
    assert.ok(v.some((x) => x.pattern === expectPattern), `${label}: the live hazard on this line must still be flagged (${expectPattern})`);
  }
  console.log("PASS no bypass: 'https://games/' does not blank its own line, a type body is blanked only to its matching brace, a trailing comment does not blank the anchor before it, and an `<a` wrapped onto the next line is still caught by its href");

  // --- Target-set derivation (gh#46): glob src/games/*.ts, minus known non-game files, plus the
  // non-recursive ceiling that shape carries. Calibrated: reverting listTargetFiles to a hardcoded
  // list makes this case meaningless (nothing to derive); reverting the exclusion set or the
  // .ts filter makes the assertion below fail. ---
  const globTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-nav-target-set-'));
  try {
    for (const name of ['real-game.ts', '_template.ts', 'types.ts', 'manifest.ts', '_arm-gate.ts', 'notes.md']) {
      fs.writeFileSync(path.join(globTmpDir, name), '');
    }
    fs.mkdirSync(path.join(globTmpDir, 'nested'));
    fs.writeFileSync(path.join(globTmpDir, 'nested', 'hidden-game.ts'), '');
    const listed = listTargetFiles(globTmpDir);
    assert.deepEqual(listed, ['_template.ts', 'real-game.ts'], 'listTargetFiles must include _template.ts and real .ts games, and exclude types.ts/manifest.ts/_arm-gate.ts/non-.ts files/nested files');
    console.log(`PASS target-set derivation: [${listed.join(', ')}] — excludes types.ts, manifest.ts, _arm-gate.ts, notes.md, and nested/hidden-game.ts (flat glob, disclosed ceiling)`);
    assert.deepEqual(listTargetFiles(path.join(globTmpDir, 'does-not-exist')), [], 'a missing games directory must yield an empty list, never throw');
    console.log('PASS target-set derivation: a missing games directory yields [] rather than throwing');
  } finally {
    fs.rmSync(globTmpDir, { recursive: true, force: true });
  }

  // --- gh#167: the PLAY-ROUTE region. src/play/<id>/ is a directory boundary, so the scanned set is
  // derived from the directories themselves — a twelfth port is scanned the day its directory lands.
  // Page chrome (src/shell/PlayExit.astro, src/pages/game/<id>/play.astro) is OUTSIDE src/play/ by
  // construction, so the crawlable exit link ADR-0014 mandates is never in this set and the rule here
  // is a flat ban, not an allow-list. Calibrated: reverting listPlayFiles to a hardcoded list of the
  // route ids makes the derivation case meaningless, and dropping the .html branch out of
  // findViolations makes the HTML-comment cases below go red. ---
  const playTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-nav-play-set-'));
  try {
    fs.mkdirSync(path.join(playTmpDir, 'a-route'));
    for (const name of ['markup.html', 'main.js', 'roster-bridge.ts', 'style.css', 'fairness.test.mjs', 'shape.test.ts']) {
      fs.writeFileSync(path.join(playTmpDir, 'a-route', name), '');
    }
    fs.mkdirSync(path.join(playTmpDir, 'b-route'));
    fs.writeFileSync(path.join(playTmpDir, 'b-route', 'main.ts'), '');
    fs.writeFileSync(path.join(playTmpDir, '_shared.ts'), '');
    assert.deepEqual(
      listPlayFiles(playTmpDir),
      ['a-route/main.js', 'a-route/markup.html', 'a-route/roster-bridge.ts', 'b-route/main.ts'],
      'listPlayFiles must derive every .html/.js/.ts under each play-route DIRECTORY, and exclude .css, test files and the shared files sitting directly under src/play/',
    );
    console.log('PASS play-route set derivation: per-directory glob picks up markup.html/main.js/main.ts/roster-bridge.ts, excludes .css, *.test.*, and files directly under src/play/');
    assert.deepEqual(listPlayFiles(path.join(playTmpDir, 'does-not-exist')), [], 'a missing play directory must yield an empty list, never throw');
  } finally {
    fs.rmSync(playTmpDir, { recursive: true, force: true });
  }

  // Known-bad, PLAY MARKUP: a real anchor in the body of a route's markup.html is the exact hazard
  // gh#167 widened this gate to catch. The old (src/games-only) script exits 0 on this file.
  const playDirty = findViolations('<section class="round">\n  <a href="/">x</a>\n</section>\n', 'html');
  assert.ok(playDirty.some((v) => v.line === 2), 'an <a href> in play markup must be flagged on its own line');
  console.log(`PASS play markup known-bad: ${playDirty.length} hit(s) on a planted <a href="/"> in a route's markup`);

  // Other direction, and the must-NOT-fire control this widening ships with: every play route's
  // markup carries the ADR-0014 rule itself as prose inside an HTML comment (src/play/dice-loser/
  // markup.html and src/play/timebomb/markup.html both say "No <a href> anywhere in here"). Without
  // the .html branch blanking <!-- --> those comments ARE violations of the rule they state — the
  // same trap the JS `stripComments` case above pins. The pattern must not be weakened to dodge it.
  for (const [label, text] of [
    ["the ADR-0014 prose every route's markup carries", '<!--\n  No <a href> anywhere in here: ADR-0014 keeps navigation out of the play surface.\n-->\n<section></section>'],
    ['a commented-out anchor', '<!-- was: <a href="/">back</a> -->'],
  ]) {
    assert.deepEqual(findViolations(text, 'html'), [], `${label}: HTML comment prose must not be a violation`);
  }
  // ...and blanking a comment must not become a bypass: a live anchor sharing the line still reds.
  assert.ok(
    findViolations('<!-- no anchors here --><a href="/">x</a>', 'html').length > 0,
    'an anchor after an HTML comment on the same line must still be flagged',
  );
  console.log('PASS play markup, other direction: HTML-comment prose citing ADR-0014 and a commented-out anchor are clean, while an anchor sharing the line with a comment still reds');

  // Known-bad, PLAY SCRIPT: the reason play .js/.ts is scanned RAW ('raw' kind, no stripComments).
  // Every element of this fixture is real: `.replace(/'/g, '&#039;')` is lifted verbatim from the
  // escapeHtml replace chain in src/play/zero-trigger/main.js — cited by symbol, not by line, because
  // added-lineno-citation-check.mjs rejects a new line-number citation into a non-.md target, and it
  // rejected this very comment once. 7 files under src/play/*/ carry a quote-bearing regex literal. That
  // literal desyncs stripComments()'s string walk (see its header), the walk then reads the `/*`
  // inside an ordinary string as a comment opener, and it blanks live code up to the next `*/` —
  // taking the anchor between them out of the scan. Measured against the pre-fix script: this exact
  // text returned ZERO violations through the 'js' kind while carrying a live <a href>. Route the
  // play walk back through stripComments and this case goes green again, which is the failure.
  const playScriptDirty = findViolations(
    [
      "const esc = raw.replace(/'/g, '&#039;');",
      "const open = '/*';",
      'const planted = `<a href="/">go</a>`;',
      "const close = '*/';",
    ].join('\n'),
    'raw',
  );
  assert.ok(
    playScriptDirty.some((v) => v.line === 3),
    'a live <a href> in a play route script must be flagged even when a quote-bearing regex literal and a string holding /* precede it',
  );
  console.log(`PASS play script known-bad: ${playScriptDirty.length} hit(s) on an <a href> that a stripComments desync blanks out of the scan`);

  // --- gh#68: #stage's own declaration, pinned to EMPTY. Fixture text, never the real file, so
  // fixing GameLayout.astro can never retune this. The chrome here is the real thing the layout
  // ships above the stage — the ADR-0014-MANDATED `<a href="/games/">`, its brace comment (with an
  // apostrophe in the prose), and the schema.org URL from the frontmatter — because the leg that
  // matters most is that none of them is a violation. Calibrated both ways below. ---
  const stageChrome = [
    "const howToJsonLd = { '@context': 'https://schema.org' };",
    "{/* The page's only crawlable link to /games/ — ADR-0014 requires it ABOVE the stage. */}",
    '<p><a href="/games/" data-stable-exit>ดูเกมทั้งหมด</a></p>',
    '<PlayerSetup min={2} max={10} gameId={game.id} />',
  ].join('\n');
  const stageDiv = (inner) => `<div id="stage" data-game-id={game.id}>${inner}</div>`;
  const stageGood = `${stageChrome}\n${stageDiv('')}\n<p id="write-refused" role="alert" hidden></p>`;

  for (const [label, text] of [
    ['the real shape: mandated /games/ link in the chrome, empty stage below it', stageGood],
    // Delete stripComments out of findStageViolations and this one goes red at "found 2".
    ['a commented-out stage example above the live one', `{/* was: ${stageDiv('<a href="/games/">กลับ</a>')} */}\n${stageGood}`],
    // Residue of the string-state walk: an unpaired apostrophe stops comment RECOGNITION from
    // there on, but strings are never blanked, so the live tags stay visible and this stays green.
    ['an unpaired apostrophe in markup above the stage', `<p>don't</p>\n${stageGood}`],
  ]) {
    assert.deepEqual(findStageViolations(text), [], `${label}: must not be a violation`);
  }
  console.log('PASS #stage empty-pin, other direction: the ADR-0014-mandated <a href="/games/"> in the chrome, a commented-out stage example and an unpaired apostrophe are all clean');

  // Known-bad: ANY static child, not just a navigation target. The anchor is the ADR-0014 hazard;
  // the span proves the pin is "empty", not "no anchors"; whitespace proves reformatting is red too.
  for (const [label, inner] of [
    ['an anchor', '<a href="/games/">กลับ</a>'],
    ['a non-anchor element', '<span>x</span>'],
    ['a comment', '{/* placeholder */}'],
    ['a newline and indentation only', '\n      '],
  ]) {
    const v = findStageViolations(`${stageChrome}\n${stageDiv(inner)}`);
    assert.equal(v.length, 1, `${label} between the #stage tags must be exactly one violation`);
    assert.match(v[0], /must ship EMPTY/, `${label}: the message must say the element is pinned to empty`);
    assert.ok(v[0].includes(JSON.stringify(inner)), `${label}: the message must quote what it found, not just say something is there`);
  }
  console.log('PASS #stage empty-pin, known-bad: an anchor, a <span>, a comment and bare whitespace between the tags are each flagged and quoted');

  // Count-exactly-one, both bounds. Zero means the gate would read nothing at all (docs/adr/0019);
  // two means a second stage surface landed without a decision.
  assert.match(findStageViolations(stageChrome)[0], /found 0\b/, 'a layout with no #stage at all must fail, not pass by scanning nothing');
  assert.match(findStageViolations(`${stageGood}\n${stageDiv('')}`)[0], /found 2\b/, 'a second #stage declaration must fail the exactly-one rule');
  assert.match(findStageViolations(stageGood.replace('id="stage"', "id='stage'"))[0], /found 0\b/, 'a stage the open-tag pattern cannot see must read as zero and go red, never as clean');
  console.log('PASS #stage empty-pin, exactly-one: zero, two, and a single-quoted id all fail rather than silently scanning nothing');

  // --- Guard exit path: main() must actually exit non-zero when the derived set is empty, not
  // just that listTargetFiles() returns [] (the case above only pins the derivation). Spawns the
  // real script as a child process against a directory with zero matching files, so deleting the
  // non-empty assert out of main() shows up here, not only in a manual repointing probe. ---
  const emptyGuard = spawnSync(process.execPath, [scriptPath], {
    env: { ...process.env, CI: '', GAMES_DIR_OVERRIDE: path.join(os.tmpdir(), 'no-nav-empty-guard-does-not-exist') },
    encoding: 'utf8',
  });
  assert.notEqual(emptyGuard.status, 0, 'main() must exit non-zero when the derived target set is empty');
  assert.match(emptyGuard.stderr, /target set must never be empty/, 'the failure message must say the set was empty');
  console.log('PASS empty-set guard: spawning the real script against a directory with zero matching .ts files exits non-zero and says the set was empty');

  // --- CI guard: GAMES_DIR_OVERRIDE must never narrow the scanned set in CI. Coordinator finding:
  // pointing the override at a dir holding 1 clean file went green at count 1, having scanned 1 of
  // 7 real modules — ADR-0019 rule 1, a green implying coverage it has not earned. Spawns the real
  // script (no --selftest) with CI=1 and the override set; it must refuse before scanning anything.
  // ---
  const ciGuardTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-nav-in-stage-check-ci-guard-'));
  try {
    fs.writeFileSync(path.join(ciGuardTmpDir, 'one-clean-game.ts'), '');
    const ciGuard = spawnSync(process.execPath, [scriptPath], {
      env: { ...process.env, CI: '1', GAMES_DIR_OVERRIDE: ciGuardTmpDir },
      encoding: 'utf8',
    });
    assert.notEqual(ciGuard.status, 0, 'GAMES_DIR_OVERRIDE + CI must exit non-zero, never scan a narrowed set');
    assert.match(ciGuard.stderr, /GAMES_DIR_OVERRIDE must never narrow the scanned set in CI/, 'the failure message must name the CI hazard');
    console.log('PASS CI guard: GAMES_DIR_OVERRIDE + CI=1 refuses to run instead of scanning a narrowed set');
  } finally {
    fs.rmSync(ciGuardTmpDir, { recursive: true, force: true });
  }

  // --- Printed count reflects files actually scanned, not the length of the target list (gh#46).
  // Calibrated: reverting scanTargetFiles to print files.length instead of scannedCount makes this
  // fail (it would report 3, not 2). ---
  const scanTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-nav-scan-count-'));
  try {
    fs.writeFileSync(path.join(scanTmpDir, 'present-a.ts'), '');
    fs.writeFileSync(path.join(scanTmpDir, 'present-b.ts'), '');
    const { scannedCount, anyFail } = scanTargetFiles(scanTmpDir, ['present-a.ts', 'present-b.ts', 'missing.ts'], () => {});
    assert.equal(scannedCount, 2, 'scannedCount must count only files actually read (2), not the 3-entry target list');
    assert.equal(anyFail, false);
    console.log(`PASS printed count: scanned 2 of 3 listed files (1 missing) — scannedCount is ${scannedCount}, not files.length`);
  } finally {
    fs.rmSync(scanTmpDir, { recursive: true, force: true });
  }

  // --- gh#66: a narrowed GAMES_DIR_OVERRIDE run must be distinguishable from a full run by
  // reading the success line alone. Spawns the real script (no --selftest) with the override set
  // to a fixture dir holding exactly 1 clean game, CI unset, and asserts the printed line names
  // both the resolved fixture directory and the true count (1) — never src/games/ or the real
  // repo's game count. Calibrated: reverting the success line back to the hardcoded 'src/games/'
  // literal (this script's pre-fix shape) makes the directory assertion below fail. ---
  const overrideNoteTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-nav-override-note-'));
  try {
    fs.writeFileSync(path.join(overrideNoteTmpDir, 'one-clean-game.ts'), '');
    const overrideRun = spawnSync(process.execPath, [scriptPath], {
      env: { ...process.env, CI: '', GAMES_DIR_OVERRIDE: overrideNoteTmpDir },
      encoding: 'utf8',
    });
    assert.equal(overrideRun.status, 0, 'a clean fixture under the override must still pass');
    assert.match(overrideRun.stdout, new RegExp(`1 module\\(s\\) in ${overrideNoteTmpDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} clean \\(GAMES_DIR_OVERRIDE active\\)`), 'the success line must name the resolved fixture directory and the real scanned count, not src/games/');
    console.log(`PASS override note: narrowed run's success line names the resolved fixture directory (${overrideNoteTmpDir}) and count (1), distinguishable from a full src/games/ run`);
  } finally {
    fs.rmSync(overrideNoteTmpDir, { recursive: true, force: true });
  }

  // --- stripComments() precondition (see that function's header): NO regex literal in ANY file this
  // script feeds that walk may carry a quote. A quote-bearing literal desyncs the string state, and
  // the desync can blank live code out of the scan — fail-OPEN, the class ADR-0019 exists for. The
  // pinned set is the set main() actually reads: the scanned game modules PLUS STAGE_FILE, because
  // findStageViolations() calls stripComments() too — the hazard belongs to the walk, not to one of
  // its callers. src/games is resolved from repoRoot, NOT from gamesDir, so GAMES_DIR_OVERRIDE
  // cannot narrow what this pin covers. ---

  // Calibration, FIRING direction: the detector must actually find a quote-bearing literal in each
  // position this codebase could write one. Without this the pin below is a guard that cannot fail.
  for (const [label, fixture] of [
    ['character class', "const RE = /['\"]/;"],
    ['plain literal', "const RE = /it's/;"],
    ['after an arrow', "const f = (s) => /\"/.test(s);"],
    ['after return', "function f() { return /'/; }"],
  ]) {
    const hits = findRegexLiterals(fixture).filter(carriesQuote);
    assert.equal(hits.length, 1, `${label}: a quote-bearing regex literal must be found, else the pin below cannot fail`);
  }
  console.log('PASS regex-literal detector, firing direction: a quote-bearing literal is found in a character class, a plain literal, after `=>` and after `return`');

  // Calibration, OTHER direction: the shapes that look like a quote-bearing literal but are not.
  // Any of these red here would make the pin a false alarm on a tree that is fine.
  for (const [label, fixture] of [
    ['division by an identifier', 'const half = total / count;'],
    ['division after a call', 'const r = size() / 2;'],
    ['a URL inside a string', "const u = 'https://watduang.com/games/';"],
    ['a line comment holding slashes and quotes', "// see `!../../games/_*.ts` — the game's own glob"],
    ['a block comment holding slashes and quotes', "/* a path /x/y/ and an apostrophe don't */"],
    ['a quote-free literal', "const t = raw.replace(/\\s+/g, ' ');"],
  ]) {
    assert.deepEqual(findRegexLiterals(fixture).filter(carriesQuote), [], `${label}: must not read as a quote-bearing regex literal`);
  }
  console.log('PASS regex-literal detector, other direction: division, a URL in a string, slashes and apostrophes inside comments, and a quote-free literal are all clean');

  // The pin itself, over the REAL tree. Scope is the .ts game modules ONLY — NOT STAGE_FILE, even
  // though findStageViolations() feeds that file to the same walk. Measured, not assumed: this
  // detector reads the `</a></p>` in markup as a regex literal (asserted just below), and across the
  // 14 .astro files in src/ that shape produced 9 pseudo-literals. All 9 are quote-free today by
  // luck, not by design: any `class="x"` landing between two `</` sequences makes one quote-bearing
  // and reds CI on valid HTML. The layout's own desync path is guarded instead by the exactly-one
  // #stage count above — a walk that loses the stage div reads `found 0` and fails, it does not pass
  // quietly. Add STAGE_FILE back here only after teaching this detector to skip markup.
  assert.ok(
    findRegexLiterals('<p>ping</a></p>').length > 0,
    'markup must still read as a pseudo-literal here — if it stops, re-examine whether STAGE_FILE belongs back in the pinned set',
  );

  // Two things must hold, and the second is the positive control: a detector returning nothing looks
  // exactly like a clean tree (docs/adr/0019).
  const pinnedGames = listTargetFiles(path.join(repoRoot, 'src/games'));
  assert.ok(pinnedGames.length > 0, 'the pin must resolve the real src/games/ modules, never an empty directory');
  let literalCount = 0;
  for (const name of pinnedGames) {
    for (const literal of findRegexLiterals(fs.readFileSync(path.join(repoRoot, 'src/games', name), 'utf8'))) {
      literalCount++;
      assert.ok(
        !carriesQuote(literal),
        `src/games/${name}: the regex literal ${literal} carries a quote character. It desyncs the ` +
          'string walk in stripComments(), and that desync can blank live code out of this scan, so a ' +
          'hazard would go unreported. Either rewrite the quote as an escape (\\x27 / \\x22), or take ' +
          'the upgrade path in the stripComments() header and teach that walk to skip regex literals.',
      );
    }
  }
  assert.ok(
    literalCount > 0,
    'found zero regex literals across the pinned modules — the detector reported nothing, which is not ' +
      'the same as no quote-bearing literal existing (docs/adr/0019). Check findRegexLiterals() before ' +
      'trusting this pin.',
  );
  console.log(`PASS stripComments precondition: ${literalCount} regex literal(s) across ${pinnedGames.length} pinned module(s) in src/games/, none carrying a quote (STAGE_FILE excluded — markup reads as a literal here)`);
}

// ---------------------------------------------------------------------------
// Scans `files` under `dir`, returning how many were actually read (not files.length) and whether
// any carried a violation. `log` is injectable so the selftest can silence real output.
// `prefix` names the region in the failure line, so a play-route hit reads as src/play/<id>/… and is
// attributable to a route by its own message.
// `nonHtmlKind` is what a non-.html file in this region is scanned as — 'js' (comments and type
// space blanked) for src/games, 'raw' (nothing blanked) for src/play. See findViolations's header.
function scanTargetFiles(dir, files, log = console.error, prefix = 'src/games', nonHtmlKind = 'js') {
  let scannedCount = 0;
  let anyFail = false;
  for (const name of files) {
    const abs = path.join(dir, name);
    if (!fs.existsSync(abs)) continue; // ponytail: don't hard-fail if a listed file moves; validate-games.mjs already owns "does every game exist"
    scannedCount++;
    const violations = findViolations(fs.readFileSync(abs, 'utf8'), path.extname(name) === '.html' ? 'html' : nonHtmlKind);
    for (const v of violations) {
      log(`${prefix}/${name}:${v.line} · ${v.pattern} · ${v.snippet}`);
      anyFail = true;
    }
  }
  return { scannedCount, anyFail };
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest();

  const TARGET_FILES = listTargetFiles(gamesDir);
  if (TARGET_FILES.length === 0) {
    console.error(`no-nav-in-stage-check: src/games/*.ts matched zero target files under ${gamesDir} — the target set must never be empty (docs/adr/0019).`);
    process.exit(1);
  }

  const { scannedCount, anyFail: gamesFail } = scanTargetFiles(gamesDir, TARGET_FILES);

  // gh#68: the layout that DECLARES #stage. Not affected by GAMES_DIR_OVERRIDE — that flag narrows
  // the game glob, and this surface is a fixed single file, so it is checked on every run.
  const stageAbs = path.join(repoRoot, STAGE_FILE);
  if (!fs.existsSync(stageAbs)) {
    console.error(`no-nav-in-stage-check: ${STAGE_FILE} not found — the file declaring #stage must exist for this gate to check it, and a missing file must not read as clean (docs/adr/0019).`);
    process.exit(1);
  }
  const stageViolations = findStageViolations(fs.readFileSync(stageAbs, 'utf8'));
  for (const v of stageViolations) console.error(v);

  // gh#167: the play-route region. Not affected by GAMES_DIR_OVERRIDE — that flag narrows the game
  // glob only, so this region is scanned on every run. Empty is a failure for the same reason the
  // game set is: 11 route directories exist today, and a derivation that suddenly matches none is a
  // gate scanning nothing, not a repo with no play routes (docs/adr/0019).
  const PLAY_FILES = listPlayFiles(playDir);
  if (PLAY_FILES.length === 0) {
    console.error(`no-nav-in-stage-check: matched zero files under ${playDir} — the play-route set must never be empty (docs/adr/0019).`);
    process.exit(1);
  }
  const { scannedCount: playScannedCount, anyFail: playFail } = scanTargetFiles(playDir, PLAY_FILES, console.error, 'src/play', 'raw');

  const anyFail = gamesFail || playFail || stageViolations.length > 0;
  if (anyFail) {
    console.error('\nADR-0014: no navigation target inside the play surface — not appended by a game module at runtime, not typed into the layout that declares #stage, and not anywhere under src/play/<id>/ (docs/adr/0014-no-navigation-target-inside-the-stage.md). The one crawlable exit link lives in page chrome, outside all three.');
    process.exit(1);
  }
  const overrideNote = process.env.GAMES_DIR_OVERRIDE ? ' (GAMES_DIR_OVERRIDE active)' : '';
  // "game module(s)" overstated this: scannedCount covers every .ts in src/games/ minus
  // EXCLUDED_FILES, which today means the 6 games PLUS the _-prefixed helpers that are not
  // EXCLUDED (_template.ts, _el.ts, _round-start.ts). Saying
  // "game" implied coverage of 8 games when 6 exist (ADR-0019). The count is real; the noun
  // was not. Excluding the two helpers instead would have traded a label for lost coverage.
  //
  // gh#66: gamesDir is always printed (not only when the override is set), so a narrowed run is
  // readable from the resolved directory alone — a fixture path visibly differs from src/games/,
  // rather than a reader having to infer narrowing from the absence of a failure.
  // gh#68: the stage file is named in the success line too — the two surfaces are checked, so a
  // green must say both, not just the count of modules (docs/adr/0019).
  // gh#167: the play-route count is printed too, and it is playScannedCount (files actually read),
  // never PLAY_FILES.length — a printed number must trace to what was scanned, not to a list length.
  console.log(`no-nav-in-stage-check: ${scannedCount} module(s) in ${gamesDir} clean${overrideNote}; ${STAGE_FILE} declares exactly one #stage and it ships empty; ${playScannedCount} file(s) across ${new Set(PLAY_FILES.map((f) => f.split('/')[0])).size} play-route director(ies) under ${playDir} carry no anchor`);
}

await main();
