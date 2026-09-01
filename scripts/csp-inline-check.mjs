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
//    but a single-spelling grep misses it. The type attribute is matched WHOLE, after trimming and
//    lowercasing — parameters are NOT cut. A type carrying a parameter
//    (`type="text/javascript;charset=utf-8"`, `type="module;x=1"`) is not an essence match for any
//    JavaScript MIME type, so the HTML spec's prepare-the-script-element steps return early and the
//    element is an inert data block. Measured, not reasoned: driven in real headless Chrome 151, none
//    of `text/javascript;charset=utf-8`, `text/javascript; charset=UTF-8`,
//    `application/javascript;charset=utf-8` or `module;x=1` executed, while bare, `text/javascript`
//    and `module` controls on the same page all did. Cutting the parameter before the lookup would
//    make this gate red the build on markup that runs nothing. Pinned by selftest.
//    JS_TYPES is an allowlist of the types CSP governs, not a
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
//    nothing in CI looked for them. Matched as three syntactic CLASSES, never as a list of members,
//    and each class is a predicate on one attribute PARSED OUT by tagAttributes() — never a needle
//    run across the document text. Position is the whole point: `onclick=` is a hazard where the HTML
//    parser would start an attribute name and is inert everywhere else, and only a tokenizer can tell
//    those apart. See tagAttributes() for the two directions that pins.
//      1. handler-attribute — /^on\w+$/ on the attribute NAME: the whole on*= family via its stable
//         syntactic prefix. onclick, onpointerdown, onanimationend, and every handler the HTML spec
//         adds next are covered without editing this file. A member list would have to be guessed;
//         the prefix is fixed by the spec.
//         ⚠ `<button type="button"onclick="pwn()">` is a parse error the HTML tokenizer recovers from
//         by starting a NEW attribute (after-attribute-value-quoted reconsumes in
//         before-attribute-name), so the handler is LIVE in every browser. Whatever replaces this
//         check must still see it — a `/\s/`-prefixed needle did not.
//      2. javascript-url — a value starting `javascript:` under the name href, src, formaction or
//         action (xlink:href included: the namespace prefix is cut before the lookup). `action` is
//         not a fourth guess at a member list: <form action="javascript:…"> submits into the same
//         inline-execution context formaction does, and script-src blocks it identically.
//      3. srcdoc — an outright ban on the srcdoc= attribute. This site has zero legitimate uses, so
//         the hazardous set does not need enumerating: the safe set is empty and the guard converges.
//
// HTML comments are blanked (not deleted, so line numbers survive) before ANY matching. All checks
// here are negative-presence ("this forbidden pattern must not appear"), and ADR-0019 rule 2's body
// governs: a negative-presence check has to keep ignoring comments, or a comment that merely
// mentions onclick trips the build. Same choke-point pattern as stripComments() in
// scripts/arm-gate-coverage-check.mjs, which is calibrated both ways. gh#47 is rule 2's
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
//      Pinned by selftest "ceiling 1". Markup that exists only as TEXT is the same case and is
//      deliberately NOT flagged: inside a quoted attribute value, inside an ENTITY-ESCAPED text node
//      (`&lt;button onclick=…`), and inside a raw-text element body such as a JSON-LD block, which
//      stripRawTextBodies() blanks for exactly this reason. It executes nothing until something
//      injects it, and flagging it reds the build on correct pages (that is what the pre-tokenizer
//      needle did). RAW markup in flow content is NOT this case and IS flagged: `<p>x <button
//      onclick="y()">` is a real element with a live handler. Both legs measured, both pinned.
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

// The three attribute classes, each a predicate on ONE PARSED ATTRIBUTE — a (name, value) pair the
// tokenizer below hands over — never a needle run across the whole document.
//
// A whole-document needle cannot tell a name from a value, and the values this site legitimately
// ships trip it. Measured against the pre-fix `/[\s"'\/]on\w+\s*=/`: `<a href="/tools/once=1">` was
// flagged (`/once=`), `<img src="/img/online=2.png">` and the same URL in a `srcset` were flagged
// (`/online=`), and the literal text `onclick=` inside a quoted attribute value, inside Thai prose in
// a text node, and inside a JSON-LD string value were all flagged. Every one of those reds the build
// on markup that executes nothing — and a gate that fires on correct pages gets ripped out.
const ATTR_CLASSES = [
  {
    id: 'handler-attribute',
    hit: (name) => /^on\w+$/i.test(name),
    why: "an on*= handler attribute needs script-src-attr / 'unsafe-hashes', which this CSP does not grant — the handler never runs and the control silently does nothing (ADR-0005)",
  },
  {
    id: 'javascript-url',
    // The namespace prefix is cut before the lookup, so `xlink:href` is judged as `href` — same
    // coverage the old `\b` before `href` bought, now stated rather than incidental. Leading
    // whitespace is stripped by the URL parser before the scheme is read, so it is stripped here too.
    hit: (name, value) =>
      /^(?:href|src|formaction|action)$/i.test(name.replace(/^[^:]*:/, '')) && /^\s*javascript:/i.test(value),
    why: "a javascript: URL is inline execution and is blocked by script-src 'self' — the link or submit silently does nothing",
  },
  {
    id: 'srcdoc',
    hit: (name) => /^srcdoc$/i.test(name),
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
 *  positive. No quote-state tracking: ADR-0019 records that as rejected, and it is not needed here.
 *
 *  ponytail: DISCLOSED CEILING, gh#186 / ADR-0056 — the set this enumerates is "text that is an HTML
 *  comment", owned by the HTML tokenizer spec and by whatever the build emits next, never by this
 *  repo. It does not converge. The arms above are all in the fail-SAFE direction, but one rung is
 *  open the other way: a literal `<!--` arriving as TEXT rather than as an opener pairs with the next
 *  real closer, and any inline handler or inline <script> between them is blanked before
 *  findInlineHazards ever sees it — a green over markup this gate did not read.
 *  Left open deliberately: the input is generated dist/ markup, so a bare `<!--` in text would have to
 *  survive the escape sink upstream first, and stripRawTextBodies already removes the common carrier
 *  (a JSON-LD string). Trigger to close it: dist/ ever carrying a `<!--` that is not a comment opener
 *  — then conserve on the hazard tokens this repo owns (the `on*` attribute names and `<script`
 *  itself: raw-present, stripped-absent) and abort before printing, the way
 *  accent-single-source-check's conservationFailures does. */
export const stripHtmlComments = (html) => html.replace(/<!--(?:>|->|[\s\S]*?(?:--!?>|$))/g, blank);

/** Blanks the BODY of raw-text and escapable-raw-text elements, preserving every offset and line
 *  number. Inside <script>, <style>, <textarea> and <title> a `<` does NOT open a tag — the HTML
 *  tokenizer switches to a raw-text state and only `</tagname` gets it back out. tagAttributes()
 *  below is that tokenizer's attribute loop and nothing more, so without this it reads
 *  `{"n":"<button onclick=…"}` inside a JSON-LD block as a live handler attribute. Measured against
 *  the pre-fix build: that returned a handler-attribute finding and would red a page that executes
 *  nothing — which is exactly what the ponytail header at the top of this file already claimed was
 *  NOT flagged. The header was wrong; this makes it true.
 *
 *  It cannot blind the inline-script check: that check reads the OPEN TAG only (SCRIPT_TAG_RE plus
 *  src/type) and never the body. Attributes on the raw-text element's own tag survive too, because
 *  only the body is blanked — `<script type="application/ld+json" onload="x()">` still flags onload.
 *  An element with no closing tag does not match at all, so its body stays SCANNED rather than
 *  blanked: the fail-safe direction. All four legs pinned by selftest.
 *
 *  ponytail: the open tag is bounded by `[^>]*>`, so a `>` inside one of ITS OWN quoted attribute
 *  values would end the tag early and blank a few characters more than it should. Same residue class
 *  the tagAttributes() header already discloses for an unclosed quote, and dist/ is generated markup.
 *  Trigger to fix: a raw-text tag ever carrying a `>` inside an attribute value — then bound the open
 *  tag with the quote-aware scan tagAttributes() already implements rather than with `[^>]*`. */
const RAW_TEXT_BODY_RE = /(<(script|style|textarea|title)\b[^>]*>)([\s\S]*?)(<\/\2)/gi;
const stripRawTextBodies = (html) =>
  html.replace(RAW_TEXT_BODY_RE, (_m, open, _tag, body, close) => open + blank(body) + close);


const lineOf = (text, index) => text.slice(0, index).split('\n').length;

const NAME_END = /[\s/>=]/;
const TAG_OPEN_RE = /<[a-zA-Z][^\s/>]*/g;

/** Yields every attribute in ATTRIBUTE-NAME POSITION as `{ name, value, index, hasValue }`.
 *
 *  This is the HTML tokenizer's attribute loop and nothing more, which is exactly what the three
 *  classes above need: a name is a name only where the parser would start one.
 *    · `type="button"onclick="pwn()"` — after-attribute-value-quoted reconsumes in
 *      before-attribute-name, so `onclick` IS a live attribute here and is yielded. That parse error
 *      is the real hole this gate exists to see, and no `/\s/`-prefixed needle can see it.
 *    · `href="/tools/once=1"` — `once=` is inside a quoted VALUE, never in name position, so it is
 *      not yielded at all. Same for `onclick=` sitting in a text node: text is not scanned, because
 *      nothing in a text node is an attribute.
 *  Quote state is tracked, so this is NOT the tag-extraction regex the old comment here rightly
 *  rejected: a `>` inside a quoted value (`<div title="a > b" onclick=…>`) does not end the tag, and
 *  the scan resumes after the value rather than in the middle of it. Pinned both ways by selftest.
 *
 *  ponytail: one fail-open residue, and it is the browser's own behaviour — an unclosed quote
 *  swallows the rest of the document as one attribute value, so nothing after it is scanned. A real
 *  parser would report the same EOF-in-tag; dist/ is generated markup, so it cannot happen from
 *  hand-editing. Upgrade path if it ever does: bound the value scan at the next `<`. */
export function* tagAttributes(html) {
  TAG_OPEN_RE.lastIndex = 0;
  let m;
  while ((m = TAG_OPEN_RE.exec(html))) {
    let i = m.index + m[0].length;
    while (i < html.length) {
      while (i < html.length && (/\s/.test(html[i]) || html[i] === '/')) i++; // before-attribute-name
      if (i >= html.length || html[i] === '>') break;
      const index = i;
      while (i < html.length && !NAME_END.test(html[i])) i++;
      const name = html.slice(index, i);
      while (i < html.length && /\s/.test(html[i])) i++; // after-attribute-name: `onclick = "x()"`
      if (html[i] !== '=') {
        yield { name, value: '', index, hasValue: false };
        continue; // i always advanced above (a bare `=` is consumed below), so this cannot spin
      }
      i++;
      while (i < html.length && /\s/.test(html[i])) i++; // before-attribute-value
      const quote = html[i];
      let value;
      if (quote === '"' || quote === "'") {
        const end = html.indexOf(quote, i + 1);
        value = html.slice(i + 1, end === -1 ? html.length : end);
        i = end === -1 ? html.length : end + 1;
      } else {
        const valueStart = i;
        while (i < html.length && !/[\s>]/.test(html[i])) i++;
        value = html.slice(valueStart, i);
      }
      yield { name, value, index, hasValue: true };
    }
    TAG_OPEN_RE.lastIndex = i;
  }
}

const shownAttr = (name, value) => `${name}="${value.length > 40 ? `${value.slice(0, 40)}…` : value}"`;

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

  // Raw-text bodies blanked for the ATTRIBUTE leg only — the inline-script leg above reads the
  // un-blanked text, and offsets are preserved, so lineOf(html, index) still resolves correctly.
  for (const { name, value, index, hasValue } of tagAttributes(stripRawTextBodies(html))) {
    // A valueless `<button onclick>` / `<iframe srcdoc>` executes nothing and navigates nowhere —
    // same `=`-required shape the three needles this replaced always had.
    if (!hasValue) continue;
    for (const { id, hit, why } of ATTR_CLASSES) {
      if (hit(name, value)) findings.push({ id, line: lineOf(html, index), match: shownAttr(name, value), why });
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

  // --- class 1's leading char is an ATTRIBUTE BOUNDARY, not whitespace. `<button type="button"onclick=
  // "x()">` is a tokenizer parse error the HTML spec recovers from by starting a NEW attribute, so the
  // handler is live in Chrome/Safari/Firefox — and a /\s/ prefix walked straight past it. Same for the
  // `/` boundary after a quoted value. Revert the class to /\s/ and every case here goes green. ---
  for (const [label, spelling] of [
    ['quote-adjacent', '"button"onclick="x()"'],
    ['quote-adjacent, uppercase', '"button"ONCLICK="x()"'],
    ['slash-adjacent', '"button"/onpointerdown="x()"'],
  ]) {
    const f = findInlineHazards(clean.replace('<button type="button"', `<button type=${spelling}`));
    assert.equal(f.length, 1, `${label}: a handler attribute with no whitespace before it is live in the browser and must be flagged`);
    assert.equal(f[0].id, 'handler-attribute');
  }
  const srcdocAdjacent = findInlineHazards(clean.replace('<div id="stage"></div>', '<iframe title="x"srcdoc="<b>hi</b>"></iframe>'));
  assert.equal(srcdocAdjacent.length, 1, 'a quote-adjacent srcdoc= must be flagged too — same boundary class');
  assert.equal(srcdocAdjacent[0].id, 'srcdoc');
  console.log('PASS attribute boundary: `type="button"onclick=`, its uppercase twin, `"button"/onpointerdown=` and `title="x"srcdoc=` are all flagged — the HTML tokenizer starts a new attribute there, so /\\s/ alone scanned past a LIVE handler');

  // --- and the parse must not start flagging ordinary markup. Every case here was measured RED
  // against the whole-document needle this replaced (`/[\s"'\/]on\w+\s*=/`): a URL containing `/on…=`
  // and the literal text `onclick=` in a value, a text node or a JSON-LD string all matched it, so any
  // future page whose copy or URL contains one would have redded the build while executing nothing.
  // Restore that needle and every case here goes red. ---
  for (const [label, html] of [
    ['url path segment', '<html><body><a href="/tools/once=1">x</a></body></html>'],
    ['url in src', '<html><body><img src="/img/online=2.png"></body></html>'],
    ['url in srcset', '<html><body><img srcset="/img/online=2.png 1x, /img/online=4.png 2x"></body></html>'],
    ['quoted attribute value', '<html><body><div data-note="เขียน onclick= ไม่ได้">x</div></body></html>'],
    ['text node', '<html><body><p>ห้ามใส่ onclick= ในหน้า</p></body></html>'],
    ['json-ld string value', '<html><body><script type="application/ld+json">{"note":"onclick="}</script></body></html>'],
    ['json-ld string holding real markup', '<html><body><script type="application/ld+json">{"n":"<button onclick=\\"x()\\">go</button>"}</script></body></html>'],
    ['value starting with on…', '<html><body><a href="/games/" data-note="one two" title="only">x</a></body></html>'],
  ]) {
    assert.deepEqual(findInlineHazards(html), [], `${label}: text that is not in attribute-name position executes nothing and must not be flagged`);
  }
  console.log('PASS attribute-name position, other direction: /tools/once=1, /img/online=2.png (src and srcset), `onclick=` inside a quoted value / a Thai text node / a JSON-LD string, and data-note="one two" are all clean — none of them is an attribute name');

  // --- raw-text bodies. <script>, <style>, <textarea> and <title> are raw text to the HTML
  // tokenizer, so a `<` inside them opens nothing. Before stripRawTextBodies() the JSON-LD case
  // below returned a handler-attribute finding while the ponytail header at the top of this file
  // claimed it did not — and the fixture that was meant to cover that class carried no `<` at all,
  // so it passed for the wrong reason. Delete the stripRawTextBodies() call out of
  // findInlineHazards() and every case here goes red. ---
  for (const [label, html] of [
    ['markup inside a JSON-LD block', '<html><body><script type="application/ld+json">{"n":"<button onclick=\\"x()\\">go</button>"}</script></body></html>'],
    ['markup inside a <style> body', '<html><body><style>/* <button onclick="x()"> */</style></body></html>'],
    ['markup inside a <textarea>', '<html><body><textarea><button onclick="x()"></textarea></body></html>'],
    ['markup inside a <title>', '<html><head><title><button onclick="x()"></title></head></html>'],
  ]) {
    assert.deepEqual(findInlineHazards(html), [], `${label}: a raw-text body opens no tag, so nothing inside it is an attribute`);
  }
  console.log('PASS raw-text bodies: markup inside a JSON-LD block, a <style> body, a <textarea> and a <title> opens no tag and reports zero findings');

  // Other direction, three ways this could have blanked too much: the element's OWN attributes must
  // survive, the inline-script check must stay blind to none of it, and an element that never closes
  // must leave the rest of the document SCANNED rather than swallowed.
  for (const [label, html, want] of [
    ['a handler on the raw-text element itself', '<html><body><script type="application/ld+json" onload="x()">{}</script></body></html>', 'handler-attribute'],
    ['an inline script', '<html><body><script>alert(1)</script></body></html>', 'inline-script'],
    ['an UNCLOSED raw-text element', '<html><body><script type="application/ld+json">{}<button onclick="x()">go</button></body></html>', 'handler-attribute'],
  ]) {
    const ids = findInlineHazards(html).map((v) => v.id);
    assert.ok(ids.includes(want), `${label}: must still report ${want}, got ${JSON.stringify(ids)}`);
  }
  console.log('PASS raw-text bodies, other direction: a handler on the <script> tag itself, an inline script, and an unclosed raw-text element are all still flagged');

  // --- the tokenizer must not become a tag-extraction REGEX, which is what the pre-fix comment here
  // rightly refused: a `>` inside a quoted value does not end a tag, and an unquoted value ends at
  // whitespace. Both shapes still carry a live handler and must still be flagged. ---
  for (const [label, html] of [
    ['`>` inside a quoted value', '<html><body><div title="a > b" onclick="pwn()">x</div></body></html>'],
    ['unquoted preceding value', '<html><body><div class=box onclick="pwn()">x</div></body></html>'],
    ['unquoted handler value', '<html><body><div class="box" onclick=pwn()>x</div></body></html>'],
  ]) {
    const f = findInlineHazards(html);
    assert.equal(f.length, 1, `${label}: the handler is live in the browser and must be flagged`);
    assert.equal(f[0].id, 'handler-attribute');
  }
  console.log('PASS tokenizer, not a tag regex: a handler after a quoted value containing `>`, after an unquoted value, and with an unquoted value of its own are all still flagged');

  // --- known-bad, class 2: javascript: URLs in each governed attribute, including xlink:href, plus
  // <form action=…>, which submits into the same inline-execution context formaction does. ---
  for (const bad of ['href="javascript:x()"', "href='javascript:x()'", 'formaction="javascript:x()"', 'action="javascript:x()"', 'src="javascript:x()"', 'xlink:href="javascript:x()"']) {
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

  // --- class A matches the type attribute WHOLE. A parameter disqualifies it: the spec's lookup is an
  // essence MATCH against the type string, and a string carrying `;charset=…` matches no JavaScript
  // MIME type essence, so the element never executes. MEASURED in real headless Chrome 151 (see
  // docs/agents/browser-verification.md for the driver): none of the four below ran, while bare,
  // text/javascript and module controls on the same page all did. Add a parameter-cutting essence()
  // helper and every case here goes red — which is what it should do, because the gate would then be
  // redding the build on inert data blocks. This direction is only meaningful next to the class A
  // must-flag block above: that block is its positive control, so a gate that flagged nothing could
  // not pass both. ---
  for (const type of ['text/javascript;charset=utf-8', 'text/javascript; charset=UTF-8', 'application/javascript;charset=utf-8', 'module;x=1', 'application/ld+json;charset=utf-8', 'application/json']) {
    assert.deepEqual(
      findInlineHazards(clean.replace('<div id="stage"></div>', `<script type="${type}">alert(1)</script>`)),
      [],
      `an inline script typed "${type}" does not execute (a parameter is not an essence match) and must NOT be flagged`,
    );
  }
  console.log('PASS type is matched whole: text/javascript;charset=utf-8, its siblings and module;x=1 stay clean — measured inert in Chrome 151 — and so do ld+json;charset=utf-8 and application/json');

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
  // The hazard after the early close is real MARKUP, not loose text: a bare `onclick="x()"` in a text
  // node was never live in any browser, so asserting it flags would pin a false positive rather than
  // this ceiling. What the ceiling actually claims is that everything after an early --> is scanned as
  // live markup, and a live <button> is what proves it.
  const earlyClose = '<html><body><!-- a comment with an arrow --> <button onclick="x()">go</button> --></body></html>';
  const earlyFindings = findInlineHazards(earlyClose);
  assert.equal(earlyFindings.length, 1, 'ceiling 3: markup after an early --> is scanned as live markup (fail-safe)');
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
