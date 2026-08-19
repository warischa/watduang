#!/usr/bin/env node
// CSP inline-execution gate for the built HTML (dist/**/*.html). CSP script-src is 'self' with no
// 'unsafe-inline' by design — our own bundles are external _astro/*.js — so anything that needs
// inline execution is silently blocked in production: no error a visitor sees, just a page that does
// nothing. ADR-0005 (page scripts must never inline) and CLAUDE.md's CSP rule.
//
// Two things this gate checks, and they are different shapes of the same failure:
//
// A. INLINE <script> ELEMENTS. Astro inlines a page script when it has no imports and is under
//    assetsInlineLimit. Catches every kind of <script> with no src, not just the type="module"
//    spelling: a hand-written <script is:inline> comes out as a bare <script>, blocked the same way,
//    but a single-spelling grep misses it. JS_TYPES is an allowlist of the types CSP governs, not a
//    blocklist of ld+json — a real data block (ld+json, json) is not blocked by CSP, so it must not
//    be a false positive that gets people to rip the gate out.
//    ⚠ importmap and speculationrules are **not** a safe data block — script-src-elem governs both
//    (the spec added the 'inline-speculation-rules' keyword for exactly this reason · Chrome rejects
//    an inline import map under a strict CSP). Miss this and one day someone adds an import map and
//    every module on the page stops loading while the gate stays green.
//    SVG <script> needs no separate rule: SCRIPT_TAG_RE is element-context-blind, so a <script>
//    nested in inline <svg> is matched by the same pass — verified, do not add a second regex for it.
//
// B. INLINE EXECUTION IN ATTRIBUTES (new, gh#47). script-src does not govern these at all —
//    script-src-attr / 'unsafe-hashes' does — so they are blocked under this CSP just as hard, and
//    nothing in CI looked for them. Matched as three syntactic CLASSES, never as a list of members:
//      1. HANDLER_ATTR_RE — /\son\w+\s*=/ , the whole on*= attribute family via its stable
//         syntactic prefix. onclick, onpointerdown, onanimationend, and every handler the HTML spec
//         adds next are covered without editing this file. A member list would have to be guessed;
//         the prefix is fixed by the spec.
//      2. JS_URL_RE — javascript: appearing in href, src or formaction (xlink:href included: the
//         \b sits before `href`, and `:` is a non-word char).
//      3. SRCDOC_RE — an outright ban on srcdoc=. This site has zero legitimate uses, so the
//         hazardous set does not need enumerating: the safe set is empty and the guard converges.
//
// HTML comments are blanked (not deleted, so line numbers survive) before ANY matching. All checks
// here are negative-presence ("this forbidden pattern must not appear"), and ADR-0019 rule 2's body
// governs: a negative-presence check has to keep ignoring comments, or a comment that merely
// mentions onclick trips the build. Same choke-point pattern as
// scripts/arm-gate-coverage-check.mjs:100-102, which is calibrated both ways. gh#47 is rule 2's
// first exercise, so both directions are pinned by selftest cases below.
//
// ponytail: this is a text scan of built HTML. Its green means "no inline-executing script element
// or handler attribute is present in the shipped markup" — never "nothing on this site can execute
// inline". Three disclosed gaps:
//   1. RUNTIME-ASSEMBLED ATTRIBUTES are invisible. el.setAttribute('on' + 'click', fn),
//      el.onclick = fn, or an innerHTML string built in _astro/*.js never appears in the HTML this
//      gate reads. Not a false green about CSP, though: a handler attached from an external
//      'self' script is not CSP-blocked, so the *ad* failure mode this gate exists for cannot hide
//      there. What can hide is an innerHTML assignment injecting an onclick at runtime.
//      Pinned by selftest "ceiling 1".
//   2. EXOTIC EMBEDS are out of scope. <object data=…>, <embed>, <iframe src="data:…">, <base href>
//      and MathML/SVG event attributes that do not start with `on` are not matched. The set of ways
//      markup can start an execution context is spec-owned and does not converge, so this gate
//      bounds the three classes above instead. Pinned by "ceiling 2".
//   3. The comment blanker is textual, not a parser. It DOES handle the three real closers — `-->`,
//      `--!>`, and the abrupt-close empty comments `<!-->` / `<!--->` — which is the third instance of
//      this repo's comment-stripper hole class (ADR-0019 records the `'https://schema.org'` one). Any
//      of those mis-parsed blanks LIVE markup: `<!--><button onclick="pwn()">go</button>-->` scanned
//      clean before the fix while the handler was live in the browser. Two residues left:
//      a `-->` or `--!>` appearing inside an attribute value or a CDATA block ends the comment early,
//      so what follows is scanned as live markup (fail-SAFE, at worst a false positive), and an
//      unterminated `<!--` blanks to end of file (fail-OPEN, the one that could hide a hazard).
//      No quote-state tracking, per ADR-0019's recorded rejection. dist/ ships zero HTML comments
//      today (measured), so the strip is currently a no-op on the real artifact and only the
//      fixtures exercise it. Pinned by "ceiling 3" and by the four abrupt-close cases.
//
//   node scripts/csp-inline-check.mjs             -> scan dist/**/*.html, exit non-zero on any hit
//   node scripts/csp-inline-check.mjs --selftest  -> both-direction calibration on temp fixtures

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

// '' / '0' / 'false' are not CI. GitHub Actions sets CI=true.
const isCi = (env = process.env) => !!env.CI && env.CI !== '0' && env.CI !== 'false';

const JS_TYPES = new Set([
  '', 'module', 'text/javascript', 'application/javascript',
  'text/ecmascript', 'application/ecmascript', 'text/jscript', 'application/x-javascript',
  // Old MIME types browsers still run as JS — CSP blocks these the same way
  'text/x-javascript', 'text/x-ecmascript', 'application/x-ecmascript', 'text/livescript',
  'text/javascript1.0', 'text/javascript1.1', 'text/javascript1.2',
  'text/javascript1.3', 'text/javascript1.4', 'text/javascript1.5',
  // Not JS but script-src-elem governs it — inline gets silently blocked the same way
  'importmap', 'speculationrules',
]);

const SCRIPT_TAG_RE = /<script\b[^>]*>/gi;
const SCRIPT_SRC_RE = /[\s"']src\s*=/i; // word-boundary before src stops data-src from counting as a real src
const SCRIPT_TYPE_RE = /[\s"']type\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i;

// The three attribute classes. Whole-document match on blanked text, deliberately not restricted to
// inside <tag ...> — a `>` inside an attribute value truncates any tag-extraction regex, and a guard
// that misses is worse than one that false-positives. Measured against real dist/: zero hits.
const ATTR_CLASSES = [
  {
    id: 'handler-attribute',
    re: /\son\w+\s*=/gi,
    why: "an on*= handler attribute needs script-src-attr / 'unsafe-hashes', which this CSP does not grant — the handler never runs and the control silently does nothing (ADR-0005)",
  },
  {
    id: 'javascript-url',
    re: /\b(?:href|src|formaction)\s*=\s*["']?\s*javascript:/gi,
    why: "a javascript: URL is inline execution and is blocked by script-src 'self' — the link or submit silently does nothing",
  },
  {
    id: 'srcdoc',
    re: /\ssrcdoc\s*=/gi,
    why: 'srcdoc= creates a nested browsing context with its own inline markup; this site has zero legitimate uses, so it is banned outright rather than analysed',
  },
];

// ---------------------------------------------------------------------------
// Pure: html text -> findings. No file IO, so the selftest can feed it strings.
// ---------------------------------------------------------------------------
const blank = (m) => m.replace(/[^\n]/g, ' ');
/** Blanks HTML comments, preserving every offset and line number. The one choke point every check
 *  below reads through, so a commented-out hazard can never trip any of them (ADR-0019 rule 2).
 *
 *  The three alternatives are the HTML parser's three ways out of a comment, and getting any of them
 *  wrong blanks LIVE markup:
 *    `>`      — abrupt-closing-of-empty-comment: `<!-->` is a COMPLETE empty comment to every browser
 *               (comment start state, `>` closes it). Treating it as an opener made
 *               `<!--><button onclick="pwn()">go</button>-->` scan clean while the handler was live.
 *    `->`     — the same abrupt close one dash later, `<!--->`.
 *    `--!?>`  — `--!>` is a real closer (comment end bang state), not just `-->`.
 *  Both abrupt forms END the comment sooner than a naive lazy match does, so the fix can only ever
 *  expose MORE markup to the checks, never less — it cannot turn a real comment into a false
 *  positive. No quote-state tracking: ADR-0019 records that as rejected, and it is not needed here. */
export const stripHtmlComments = (html) => html.replace(/<!--(?:>|->|[\s\S]*?(?:--!?>|$))/g, blank);

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

export function findInlineHazards(rawHtml) {
  const html = stripHtmlComments(rawHtml);
  const findings = [];

  SCRIPT_TAG_RE.lastIndex = 0;
  let m;
  while ((m = SCRIPT_TAG_RE.exec(html))) {
    const tag = m[0];
    if (SCRIPT_SRC_RE.test(tag)) continue;
    const attr = tag.match(SCRIPT_TYPE_RE);
    const type = (attr ? attr[2] ?? attr[3] ?? attr[4] : '').trim().toLowerCase();
    if (!JS_TYPES.has(type)) continue;
    findings.push({
      id: 'inline-script',
      line: lineOf(html, m.index),
      match: tag,
      why: "an inline script with no src is blocked by script-src 'self' (no 'unsafe-inline'), so the page silently does nothing in production",
    });
  }

  for (const { id, re, why } of ATTR_CLASSES) {
    re.lastIndex = 0;
    for (const hit of html.matchAll(re)) {
      findings.push({ id, line: lineOf(html, hit.index), match: hit[0].trim(), why });
    }
  }

  return findings.sort((a, b) => a.line - b.line || a.id.localeCompare(b.id));
}

/** The success sentence. Names the root it scanned and the count it scanned there — a green that does
 *  not say WHAT it scanned is the same unearned claim as one that overstates coverage (ADR-0019). */
export const successLine = (rel, fileCount) =>
  `csp-inline-check: ${fileCount} HTML file(s) scanned under ${rel}/, 0 inline scripts and ` +
  '0 on*=/javascript:/srcdoc attributes. Does NOT cover runtime-assembled attributes or exotic ' +
  'embeds (see ponytail header).';

function collectHtml(root) {
  const files = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.html')) files.push(full);
    }
  })(root);
  return files;
}

// ---------------------------------------------------------------------------
// Self-test: fixture HTML strings plus one temp-dir file tree. NOTHING here reads, writes, or
// rebuilds dist/ — this gate runs after Build, and a verification step that rebuilds the artifact
// voids every earlier gate's verdict in the same run (gh#38).
// ---------------------------------------------------------------------------
function selftest() {
  const clean = [
    '<!doctype html><html lang="th"><head>',
    '<title>วัดดวง</title>',
    '<script type="module" src="/_astro/page.js"></script>',
    '<script type="application/ld+json">{"@context":"https://schema.org"}</script>',
    '</head><body><div id="stage"></div>',
    '<button type="button" data-src="x" class="btn">เริ่ม</button>',
    '<a href="/games/">เกมทั้งหมด</a>',
    '</body></html>',
  ].join('\n');

  // --- known-good: real-shaped output. An external module script, an ld+json data block, a
  // data-src attribute and a normal href must all report nothing. ---
  assert.deepEqual(findInlineHazards(clean), [], 'clean built HTML must report zero findings');
  console.log('PASS known-good: external module script + ld+json data block + data-src + normal href report zero findings');

  // --- known-bad, class 1: a handler attribute. Revert HANDLER_ATTR and this goes green. ---
  const handler = clean.replace('<button type="button"', '<button type="button" onclick="x()"');
  const handlerFindings = findInlineHazards(handler);
  assert.equal(handlerFindings.length, 1, 'onclick= must be flagged exactly once');
  assert.equal(handlerFindings[0].id, 'handler-attribute');
  assert.equal(handlerFindings[0].line, 6, 'the reported line must point at real source, which is what blanking (not deleting) comments buys');
  console.log(`PASS known-bad class 1: ${handlerFindings[0].match} flagged as ${handlerFindings[0].id} at line ${handlerFindings[0].line}`);

  // --- class 1 covers the FAMILY, not a member list: a handler nobody thought to enumerate, an
  // uppercase spelling, and one with whitespace around the = are all caught by the same prefix. ---
  for (const spelling of ['onpointerdown="a()"', 'ONANIMATIONEND="b()"', 'onbeforetoggle = "c()"', 'onsomethingthespecaddsin2030="d()"']) {
    const f = findInlineHazards(clean.replace('<button type="button"', `<button type="button" ${spelling}`));
    assert.equal(f.length, 1, `${spelling} must be flagged by the on*= class`);
    assert.equal(f[0].id, 'handler-attribute');
  }
  console.log('PASS class 1 is a class: onpointerdown, ONANIMATIONEND, `onbeforetoggle = `, and an invented future handler are all caught by the on*= prefix with no member list');

  // --- known-bad, class 2: javascript: URLs in each governed attribute, including xlink:href. ---
  for (const bad of ['href="javascript:x()"', "href='javascript:x()'", 'formaction="javascript:x()"', 'src="javascript:x()"', 'xlink:href="javascript:x()"']) {
    const f = findInlineHazards(clean.replace('<a href="/games/">', `<a ${bad}>`));
    assert.equal(f.length, 1, `${bad} must be flagged`);
    assert.equal(f[0].id, 'javascript-url');
  }
  console.log('PASS known-bad class 2: javascript: flagged in href, single-quoted href, formaction, src and xlink:href');

  // --- known-bad, class 3: srcdoc banned outright. ---
  const srcdoc = clean.replace('<div id="stage"></div>', '<iframe srcdoc="<b>hi</b>"></iframe>');
  const srcdocFindings = findInlineHazards(srcdoc);
  assert.equal(srcdocFindings.length, 1, 'srcdoc= must be flagged');
  assert.equal(srcdocFindings[0].id, 'srcdoc');
  console.log(`PASS known-bad class 3: ${srcdocFindings[0].match} flagged as ${srcdocFindings[0].id} — inverted guard, the safe set is empty`);

  // --- known-bad, class A: the inline <script> shapes, including the SVG nesting the header claims
  // needs no separate rule. Asserted here so that claim is pinned, not assumed. ---
  for (const [label, tag] of [
    ['bare', '<script>alert(1)</script>'],
    ['is:inline output', '<script>console.log(1)</script>'],
    ['importmap', '<script type="importmap">{}</script>'],
    ['speculationrules', '<script type="speculationrules">{}</script>'],
    ['nested in inline svg', '<svg width="1" height="1"><script>svgThing()</script></svg>'],
  ]) {
    const f = findInlineHazards(clean.replace('<div id="stage"></div>', tag));
    assert.equal(f.length, 1, `an inline script (${label}) must be flagged`);
    assert.equal(f[0].id, 'inline-script', `${label} must be flagged as inline-script`);
  }
  console.log('PASS known-bad class A: bare, is:inline, importmap, speculationrules and an SVG-nested <script> all flagged by the one element-context-blind regex — no second regex needed for SVG');

  // --- ADR-0019 rule 2, the other direction: a hazard that exists ONLY inside an HTML comment must
  // trip nothing. This is what the comment strip buys, and it is the direction that fails open into
  // a build nobody can green without deleting prose. ---
  const commented = clean.replace(
    '<div id="stage"></div>',
    [
      '<!-- do not ship onclick="x()" here -->',
      '<!-- and never <iframe srcdoc="..."></iframe> or href="javascript:void(0)" -->',
      '<!-- nor <script>alert(1)</script> -->',
      '<div id="stage"></div>',
    ].join('\n'),
  );
  assert.deepEqual(findInlineHazards(commented), [], 'a handler, srcdoc, javascript: URL or inline <script> mentioned only inside an HTML comment must trip nothing');
  console.log('PASS ADR-0019 rule 2: onclick, srcdoc, javascript: and <script> mentioned only inside HTML comments trip nothing (negative-presence checks keep ignoring comments)');

  // --- and rule 2 must not become "ignore everything": a live hazard on the same line as a comment
  // is still caught, so the strip cannot be used as a bypass. ---
  const commentBypass = clean.replace('<button type="button"', '<button type="button" onclick="x()" <!-- looks commented, is not -->');
  const bypassFindings = findInlineHazards(commentBypass);
  assert.equal(bypassFindings.length, 1, 'a live handler sharing a line with a comment must still be flagged');
  assert.equal(bypassFindings[0].id, 'handler-attribute');
  console.log('PASS ADR-0019 rule 2, no bypass: a live onclick sharing its line with an HTML comment is still flagged');

  // --- ceiling 1 pinned: runtime-assembled attributes are invisible. Widen this gate to scan JS
  // strings and this case fails first, forcing the header ceiling to be rewritten. ---
  const runtime = clean.replace(
    '<div id="stage"></div>',
    '<div id="stage"></div>\n<script type="module" src="/_astro/runtime.js"></script>',
  );
  assert.deepEqual(findInlineHazards(runtime), [], 'ceiling 1: a handler assembled at runtime inside an external module is invisible to this gate');
  const inlineJsText = '<script type="module" src="/x.js"></script>';
  assert.deepEqual(findInlineHazards(`<html><body>${inlineJsText}</body></html>`), [], 'ceiling 1: this gate reads built markup only, never the bundles it links');
  console.log("PASS ceiling 1 pinned: an on*= handler assembled inside an external _astro module (setAttribute('on'+'click'), el.onclick=, innerHTML) is invisible here — this gate reads markup, not bundles");

  // --- ceiling 2 pinned: exotic embeds are out of scope, by decision. ---
  const exotic = clean.replace(
    '<div id="stage"></div>',
    '<object data="/x.swf"></object><embed src="/y"><iframe src="data:text/html,<b>hi</b>"></iframe><base href="/">',
  );
  assert.deepEqual(findInlineHazards(exotic), [], 'ceiling 2: <object data>, <embed>, an iframe data: URL and <base href> are not matched — spec-owned set, does not converge');
  console.log('PASS ceiling 2 pinned: <object data>, <embed>, iframe src="data:…" and <base href> stay green — the set of markup-started execution contexts is spec-owned and does not converge');

  // --- ceiling 3 pinned: the comment blanker is textual. A `-->` inside an attribute value ends the
  // comment early, so what follows is scanned as live markup. Fail-safe direction, pinned so a
  // future real parser has to update the header. ---
  const earlyClose = '<html><body><!-- a comment with an arrow --> onclick="x()" --></body></html>';
  const earlyFindings = findInlineHazards(earlyClose);
  assert.equal(earlyFindings.length, 1, 'ceiling 3: text after an early --> is scanned as live markup (fail-safe)');
  const unterminated = '<html><body><!-- never closed, onclick="x()" is blanked to EOF';
  assert.deepEqual(findInlineHazards(unterminated), [], 'ceiling 3: an unterminated <!-- blanks to end of file (fail-open, disclosed)');
  console.log('PASS ceiling 3 pinned: an early --> leaves the rest live (fail-safe); an unterminated <!-- blanks to EOF (fail-open, disclosed)');

  // --- ABRUPT-CLOSE COMMENTS. `<!-->` is a complete empty comment to every browser (comment start
  // state, `>` closes it), so a naive /<!--[\s\S]*?-->/ blanked from there to the NEXT `-->` and the
  // markup in between — live in the browser — was never scanned. Measured fail-open, same class as
  // ADR-0019's `'https://schema.org'` line-comment hole. Cases 1-3 must be FLAGGED; case 4 is the one
  // that matters most in the other direction, because it is the entire reason the blanker exists: if
  // closing the hole made ordinary comments false-positive, that would be a worse trade (fail-closed,
  // and unfixable without deleting prose) than the hole it replaced. ---
  for (const [label, html] of [
    ['abrupt <!-->', '<html><body><!--><button onclick="pwn()">go</button>--></body></html>'],
    ['abrupt <!--->', '<html><body><!---><button onclick="pwn()">go</button>--></body></html>'],
    ['--!> closer', '<html><body><!-- x --!><button onclick="pwn()">--></body></html>'],
  ]) {
    const f = findInlineHazards(html);
    assert.equal(f.length, 1, `abrupt-close (${label}): the handler after the comment ends is live in the browser and must be flagged`);
    assert.equal(f[0].id, 'handler-attribute', `abrupt-close (${label}) must be flagged as a handler attribute`);
  }
  assert.deepEqual(
    findInlineHazards('<html><body><!-- this comment merely mentions onclick= and is not a hazard --></body></html>'),
    [],
    'the abrupt-close fix must NOT turn an ordinary comment that mentions onclick= into a false positive — that trade is worse than the hole',
  );
  // `<!---->` is also an empty comment (comment end state reaches `>`); asserted so the fix is pinned
  // across all four empty-comment spellings, not just the two the defect named.
  assert.equal(findInlineHazards('<html><body><!----><button onclick="pwn()"></body></html>').length, 1, '<!----> is an empty comment, so the button after it is live');
  console.log('PASS abrupt-close: <!-->, <!---> and --!> no longer blank live markup (3 flagged), <!----> too, and an ordinary comment mentioning onclick= is still NOT flagged');

  // --- the file walk, on a temp dir. Never dist/. ---
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-inline-check-'));
  try {
    fs.mkdirSync(path.join(tmpDir, 'game', 'x'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'index.html'), clean, 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'game', 'x', 'index.html'), handler, 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'notes.txt'), 'onclick="x()"', 'utf8');
    const files = collectHtml(tmpDir);
    assert.equal(files.length, 2, 'the walk must find both nested .html files and skip .txt');
    const hits = files.flatMap((f) => findInlineHazards(fs.readFileSync(f, 'utf8')).map((h) => ({ f, ...h })));
    assert.equal(hits.length, 1, 'exactly the planted handler must be found across the fixture tree');
    assert.ok(hits[0].f.endsWith(path.join('game', 'x', 'index.html')), 'the finding must name the nested file it came from');
    console.log('PASS file walk: 2 nested .html found, .txt skipped, and the one planted handler is attributed to dist-relative game/x/index.html — proven on a temp tree, never on dist/');

    // --- The success line must name WHAT it scanned. A green that does not say which root it read is
    // indistinguishable from a real dist/ scan, which is gh#46's claim shape on the argv axis. ---
    assert.match(successLine('dist', 14), /14 HTML file\(s\) scanned under dist\//, 'the success line must name the root and the count');
    assert.match(successLine(tmpDir, 2), new RegExp(`under ${tmpDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`), 'the success line must name a narrowed root too, so a narrowed run is visible in the log');
    assert.ok(!successLine('dist', 14).includes('undefined'));
    console.log(`PASS success line names its root: "${successLine('dist', 14).slice(0, 62)}…"`);

    // --- The CI refusal, both ways, at run level: same argv, only the CI env differs. A subprocess is
    // the only honest seam for an argv+env guard. Both runs are pointed at the temp tree; neither can
    // touch dist/ (the CI run exits before any scan, the non-CI run scans the fixtures). ---
    const clean1 = path.join(tmpDir, 'cleanonly');
    fs.mkdirSync(clean1, { recursive: true });
    fs.writeFileSync(path.join(clean1, 'index.html'), clean, 'utf8');
    const self = fileURLToPath(import.meta.url);
    const run = (env, args = [self, clean1]) => {
      try {
        return { status: 0, out: execFileSync(process.execPath, args, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
      } catch (e) {
        return { status: e.status, out: `${e.stdout || ''}${e.stderr || ''}` };
      }
    };
    const notCi = run({ ...process.env, CI: '' });
    assert.equal(notCi.status, 0, 'known-good: a positional root is allowed when CI is unset');
    assert.ok(notCi.out.includes(`under ${clean1}/`), 'known-good: the printed green must name the narrowed root it actually scanned');
    const underCi = run({ ...process.env, CI: 'true' });
    assert.equal(underCi.status, 1, 'known-bad: a positional root must be REFUSED when CI is set — otherwise a clean dir prints a green that reads like a dist/ scan');
    assert.ok(underCi.out.includes('refusing the positional root'), 'the refusal must say what it refused and why');
    assert.ok(!underCi.out.includes('HTML file(s) scanned'), 'the refusal must happen before any scan, so no green sentence is printed at all');
    console.log('PASS CI refusal calibrated both ways: same argv, CI unset -> exit 0 naming the narrowed root; CI=true -> exit 1, refused before any scan and no green printed');

    // --- Entry-point guard, the other direction: merely IMPORTING this module must not run the gate.
    // `node -e` leaves process.argv[1] undefined, which is also the branch that would throw if the
    // guard fed it to pathToFileURL unchecked. The notCi run above is this case's positive control: it
    // proves the same code DOES print a green when it is the entry point, so a green here cannot be the
    // silence of a gate that stopped running. ---
    const asImport = run({ ...process.env, CI: '' }, ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(self).href)})`]);
    assert.equal(asImport.status, 0, 'importing this module must not fail');
    assert.ok(!asImport.out.includes('HTML file(s) scanned'), 'importing this module must NOT run the gate — move `await main()` back to module scope and this goes red');
    console.log('PASS entry-point guard: importing this module scans nothing and prints no green, while the same file run as argv[1] above does — main() fires only as the entry point');

    // --- SYMLINKED CHECKOUT, the third failure direction of this guard and the only silent one. Node
    // hands `import.meta.url` back canonicalised while argv[1] arrives as written, so comparing one
    // canonical path against one cwd-joined path skips main() when the script is reached through a
    // symlink: exit 0, nothing scanned, a local green that means nothing. This case must prove the gate
    // DETECTS through the link, not merely that it exits — drop the realpath on either side and it goes
    // red on exit 0 with empty output. ---
    const linkDir = path.join(tmpDir, 'linked-scripts');
    fs.symlinkSync(path.dirname(self), linkDir, 'dir'); // collectHtml skips symlinks (isDirectory() is false), so this cannot recurse into the real scripts/
    const viaLink = run({ ...process.env, CI: '' }, [path.join(linkDir, path.basename(self)), tmpDir]);
    assert.equal(viaLink.status, 1, 'through a symlinked path the gate must still RUN and flag the planted handler — exit 0 here means main() was skipped and nothing was scanned at all');
    assert.match(viaLink.out, /handler-attribute/, 'the symlinked run must produce the real finding, not just a non-zero exit');
    console.log('PASS symlinked checkout: invoked through a symlinked scripts/ dir the gate still ran and flagged the planted handler — both sides of the entry-point compare are realpath()d');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true }); // ponytail: hermetic — no selftest path reads, writes or rebuilds dist/
  }
}

// ---------------------------------------------------------------------------
async function main() {
  if (process.argv.includes('--selftest')) return selftest();

  const arg = process.argv.slice(2).find((a) => !a.startsWith('--'));
  // A positional root is a local convenience only. Under CI it is a narrowing surface: pointed at any
  // clean directory this gate prints a green that reads exactly like a real dist/ scan (gh#46's claim
  // shape, on the argv axis). Refused rather than disclosed, because the disclosure would be the very
  // line a narrowed run is trying to counterfeit.
  if (arg && isCi()) {
    console.error(`::error::refusing the positional root '${arg}' because CI is set — this gate must scan the built artifact, and a narrowed root prints a green indistinguishable from a real dist/ scan`);
    process.exit(1);
  }
  const rel = arg || 'dist';
  const root = path.isAbsolute(rel) ? rel : path.join(repoRoot, rel);
  const files = collectHtml(root);
  if (!files.length) {
    console.error(`::error::${rel} contains no .html files — nothing was scanned, which is not the same as clean (ADR-0019: an inverted guard must count, not just exclude)`);
    process.exit(1);
  }

  let hitCount = 0;
  for (const file of files) {
    const shown = path.relative(repoRoot, file).split(path.sep).join('/');
    for (const h of findInlineHazards(fs.readFileSync(file, 'utf8'))) {
      console.error(`::error file=${shown},line=${h.line}::${shown}:${h.line} ${h.id} · ${h.match} · ${h.why}`);
      hitCount++;
    }
  }
  if (hitCount) {
    console.error(`\n${hitCount} inline-execution hazard(s) in built HTML. ADR-0005: page scripts must never inline.`);
    process.exit(1);
  }
  // Counts what was actually scanned, not the size of a list this script holds (ADR-0019: a green is
  // a claim, and so is the sentence next to it).
  console.log(successLine(rel, files.length));
}

// Entry point only. Importing this module (a unit test against findInlineHazards / stripHtmlComments) must not
// fire a full gate as a side effect. BOTH sides are realpath()d before comparing: Node hands
// `import.meta.url` back canonicalised while argv[1] arrives exactly as written, so comparing one
// canonical path against one cwd-joined path skips main() entirely when this file is reached through a
// symlinked checkout — exit 0, nothing scanned, a green that means nothing.
// pathToFileURL, not a raw string compare: percent-encoding makes path equality wrong for any path with
// a space or a `#`.
// ⚠ Every failure direction here must be "run the gate", never "skip it silently". Only a missing
// argv[1] (`node -e`, i.e. an import) skips; a realpath that throws on an argv[1] that does exist runs
// main() anyway. Pinned both ways by the entry-point and symlinked-checkout selftest cases above.
const isEntryPoint = () => {
  if (!process.argv[1]) return false;
  const canonical = (p) => pathToFileURL(fs.realpathSync(p)).href;
  try {
    return canonical(process.argv[1]) === canonical(fileURLToPath(import.meta.url));
  } catch {
    return true; // ponytail: realpath failed on a path that exists as a string — fail toward running the gate
  }
};
if (isEntryPoint()) await main();
