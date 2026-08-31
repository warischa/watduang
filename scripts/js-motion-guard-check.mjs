#!/usr/bin/env node
// DISCLOSED CEILING -- read before trusting a green.
// This gate is a STATIC scan. It proves a prefers-reduced-motion guard is PRESENT next to a
// JS-driven motion source. It does NOT prove the guard is EFFECTIVE. Verified 2026-08-27: pinning
// timebomb.ts`s `prefersReducedMotion` to a constant false -- guard tokens all still present, motion
// fully restored -- left this gate GREEN while src/games/timebomb.test.mjs went RED (10 pass, 1 fail).
// So: this gate catches a MISSING guard, which is the bug that actually shipped (gh#77 box7, where the
// only guard was a false comment). An INERT guard is caught by the per-module unit test, not here.
// Wiring one without the other leaves half the class uncovered.
// Closing this ceiling would mean executing each module`s motion path under a faked matchMedia and
// asserting the write cadence changes -- behaviour, not text. Not built; the unit tests cover it today.
// SECOND CEILING, same class: a checker cannot tell use from mention, so WHERE the guard text sits
// decides whether this gate is measuring anything. Both patterns below are therefore matched only
// where the match STARTS in code position (see classifySource) -- not in a comment, not inside a
// string literal. Before that, only line-START comments were stripped, so `someCall(); //
// matchMedia('(prefers-reduced-motion: reduce)')` and a string literal holding the same call text
// both read as real guards and turned this gate green on the exact gh#77 shape it was built for.
// Static tripwire for gh#77 box7: every game module that drives motion from JavaScript
// (requestAnimationFrame, or a per-event/per-frame `.style.*` write) must read
// `matchMedia('(prefers-reduced-motion: reduce)')` for real, not just claim to in a comment.
// timebomb.ts shipped exactly that false comment for months (`the canvas has none, so
// prefers-reduced-motion holds trivially`) while three rAF sites wrote fuseFillEl.style.width every
// frame with no query read anywhere in the file — a CSS-only "no @keyframes" check cannot see this
// class of defect, because prefers-reduced-motion is a CSS media feature and script writes to
// element.style are invisible to it.
//
//   node scripts/js-motion-guard-check.mjs             -> scan src/games/*.ts against the real tree
//   node scripts/js-motion-guard-check.mjs --selftest  -> both-direction calibration on temp fixtures
//
// ponytail: a source scan, and these are the things it provably does NOT see. Measured, not guessed:
//   - Whether a flagged `.style.*` write is actually continuous. A module that sets `.style.width`
//     once on render (never touched again) still trips the "motion source" pattern and is required
//     to carry a real guard even though it has nothing to reduce. Over-flagging is the safe
//     direction here (a human reads one extra file); under-flagging is not, so the PROPERTY list
//     stays broad on purpose.
//   - The pattern is broad on PROPERTIES and narrow on MECHANISMS, which is the opposite trade and
//     is not safe in the same way. Out of scope entirely, verified absent from src/games/*.ts as of
//     2026-08-27 and therefore deliberately NOT added speculatively: `element.animate()` / the Web
//     Animations API, a `setInterval`-driven style write (only requestAnimationFrame is matched),
//     `style.setProperty('--x', ...)` and any custom-property-driven animation, and a
//     `classList.add/toggle` that starts a CSS transition or animation declared in a stylesheet.
//     A module introducing any of those five is a motion source this gate reads as motion-free.
//     Widen MOTION_SOURCE_RE the day one lands; a green here does not mean the file has no motion.
//   - A guard read through an alias or a helper (`const mq = window.matchMedia; mq(QUERY)`, or a
//     shared `prefersReducedMotion()` imported from another module). The matcher needs the literal
//     `matchMedia(` call with the literal query string in the SAME file — siamsi.ts and timebomb.ts
//     both already write it that way, so this is not yet a real escape, but a future shared helper
//     would need this gate taught the new shape.
//   - Anything outside the two scanned regions (see REGIONS below). This is a REAL uncovered
//     surface, not a theoretical one: src/pages/tool/wheel.astro spins a wheel from an inline island
//     and is never read by this gate. Nothing here claims site-wide coverage — the success line
//     names what it actually scanned, and the tool pages are unscanned.
//   - A `matchMedia` guard read inside a template-literal expression (`${...}`) — the scan treats
//     everything between the backticks as string content, so a guard hidden there reads as a
//     mention, not a call. Over-flagging, the safe direction. There is also no regex-literal state
//     in the scanner: a bare `//` inside a regex character class would be read as a comment start
//     (an unescaped `/` cannot otherwise appear in a regex literal, so this needs a `[//]` to bite).
//
// --- REGIONS (gh#170) -------------------------------------------------------------------------
// TWO regions, because the party category's live motion is not in src/games at all:
//   1. src/games/*.ts — the metadata/landing layer. Rule unchanged: per FILE, a motion source and a
//      real matchMedia guard in that same file.
//   2. src/play/<id>/ — the play-route DIRECTORY, the surface a player actually taps (ADR-0055 draws
//      the same boundary for no-nav-in-stage-check). The route ids are derived from the manifest's
//      `playRoute` declarations (playRouteIds below), never from a directory listing and never from a
//      hand-list: the manifest is the set this repo owns, so a route whose directory vanished reads as
//      a MISSING directory and reds, instead of silently leaving the set.
// The unit of the rule differs per region ON PURPOSE. A play route is ONE artifact split across
// main.js + style.css + markup.html, and its reduced-motion branch is routinely in a different FILE
// from the rAF loop (measured 2026-08-31: short-stick guards in stick-canvas.ts AND overrides.css,
// timebomb in bomb-canvas.ts AND play.css). Requiring the guard in the same file there would red
// routes for file layout, not for missing a guard.
//
// But the guard must be in the same MECHANISM, and that is not a style choice — it is ADR-0046
// (docs/adr/0046-reduced-motion-does-not-reach-js-driven-motion-and-the-answer-is-reduce-not-remove.md),
// accepted 2026-08-27: prefers-reduced-motion is a CSS media feature, it does not apply itself to
// element.style writes made from script, and the Decision is to read the media query IN SCRIPT. So a
// CSS @media block does not excuse a rAF loop, and a matchMedia read does not excuse a stylesheet
// animation. findUnguardedPlayRoutes enforces the two legs separately; the earlier
// directory-level-presence version of this rule encoded exactly the reading ADR-0046 rejects and is
// gone.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const scriptPath = fileURLToPath(import.meta.url);

// ---------------------------------------------------------------------------
// Pure: text -> a per-character position class (CODE / STRING / COMMENT). A single character scan,
// deliberately NOT a strip-then-match pipeline: the guard this gate looks for HAS a string literal
// as its argument (`matchMedia('(prefers-reduced-motion: reduce)')`), so blanking string contents
// would delete every real guard along with the fake ones. Classifying positions instead lets the
// match itself span a string while its START must sit in code — use and mention separate cleanly.
// Text length is preserved 1:1 so a regex index into the original text indexes this mask directly.
// A `//` inside a string is a URL and stays STRING (that is the mangling a cut-to-end-of-line regex
// does), and an apostrophe inside a comment cannot open a string, because comments are consumed
// first — the pairing that once blanked Thai prose between `don't` and `stage's`.
// ---------------------------------------------------------------------------
const CODE = 0;
const STRING = 1;
const COMMENT = 2;

export function classifySource(text) {
  const mask = new Uint8Array(text.length).fill(CODE);
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') mask[i++] = COMMENT;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : end + 2;
      while (i < stop) mask[i++] = COMMENT;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      mask[i++] = STRING;
      while (i < text.length) {
        if (text[i] === '\\') {
          mask[i++] = STRING;
          if (i < text.length) mask[i++] = STRING;
          continue;
        }
        // An unterminated ' or " ends at the newline rather than swallowing the rest of the file;
        // a template literal really does span lines.
        if (text[i] === '\n' && c !== '`') break;
        const closing = text[i] === c;
        mask[i++] = STRING;
        if (closing) break;
      }
      continue;
    }
    i++;
  }
  return mask;
}

/** Does `re` match at a position the scan classifies as CODE? A match starting in a comment or
 * inside a string literal is a MENTION and must not count as the thing itself. */
export function matchesInCode(re, text, mask = classifySource(text)) {
  const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  for (const m of text.matchAll(global)) {
    if (mask[m.index] === CODE) return true;
  }
  return false;
}

// A motion source: rAF, or a `.style.<visual prop> =` write — the shapes gh#77's survey found
// across timebomb.ts (rAF + style.width) and siamsi.ts (a devicemotion listener + style.transform).
const MOTION_SOURCE_RE = /requestAnimationFrame\s*\(|\.style\.(?:transform|width|height|opacity|left|top)\s*=/;

// A real guard: the literal matchMedia call with the literal query, not a comment mentioning it.
const REDUCED_MOTION_GUARD_RE = /matchMedia\s*\(\s*['"`]\(prefers-reduced-motion:\s*reduce\)['"`]/;

// ---------------------------------------------------------------------------
// Pure: {relPath, text}[] -> relPath[] of files with a motion source and no real guard.
// ---------------------------------------------------------------------------
function findUnguardedMotion(files) {
  const hits = [];
  for (const { relPath, text } of files) {
    const mask = classifySource(text);
    if (matchesInCode(MOTION_SOURCE_RE, text, mask) && !matchesInCode(REDUCED_MOTION_GUARD_RE, text, mask)) hits.push(relPath);
  }
  return hits;
}

// Pure: {relPath}[] -> the reasons this scanned set cannot support the success sentence. Same
// ADR-0019 shape as checkpoint-writer-check.mjs's coverageGap — an empty or short scan must not
// print as a green.
function coverageGap(files) {
  const gaps = [];
  if (files.length === 0) gaps.push('src/games/*.ts matched zero files');
  if (!files.some((f) => f.relPath === 'src/games/timebomb.ts')) gaps.push('src/games/timebomb.ts was not in the scanned set');
  return gaps;
}

function walkGamesFiles(root) {
  const dir = path.join(root, 'src/games');
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.ts')) {
      const abs = path.join(dir, entry.name);
      out.push({ relPath: path.relative(root, abs).split(path.sep).join('/'), text: fs.readFileSync(abs, 'utf8') });
    }
  }
  return out;
}

// --- gh#170: the play-route region -------------------------------------------------------------
// Scanned extensions. `.mjs` is deliberately OUT: the only .mjs files inside a route directory are
// *-probe.mjs harnesses, which drive a browser rather than render one. `.test.` is excluded for the
// same reason no-nav-in-stage-check excludes it — a test is not a route.
const PLAY_EXTS = new Set(['.js', '.ts', '.css', '.html']);
const PLAY_ROUTE_RE = /^\/game\/([^/]+)\/play\/?$/;

/** Route ids from the manifest's own `playRoute` fields. The set is manifest-owned, so a twelfth
 *  port joins it the day its module declares the route — no list here to remember. */
export function playRouteIds(games) {
  return (games ?? [])
    .map((g) => PLAY_ROUTE_RE.exec(g?.playRoute ?? '')?.[1])
    .filter(Boolean)
    .sort();
}

/** [{routeId, relPath, text}] for every scannable file directly inside each route directory, plus
 *  the ids whose directory does not exist. A missing directory is returned, never skipped: a route
 *  the manifest declares and the tree does not have must red, not read as clean (docs/adr/0019). */
function walkPlayRouteFiles(root, ids) {
  const files = [];
  const missingDirs = [];
  for (const id of ids) {
    const dir = path.join(root, 'src/play', id);
    if (!fs.existsSync(dir)) {
      missingDirs.push(id);
      continue;
    }
    for (const name of fs.readdirSync(dir).sort()) {
      if (!PLAY_EXTS.has(path.extname(name)) || name.includes('.test.')) continue;
      const abs = path.join(dir, name);
      if (!fs.statSync(abs).isFile()) continue;
      files.push({ routeId: id, relPath: `src/play/${id}/${name}`, text: fs.readFileSync(abs, 'utf8') });
    }
  }
  return { files, missingDirs };
}

// The CSS half of a guard. `@media(prefers-reduced-motion:reduce)` ships minified in
// src/play/pinocchio-luck/style.css, so no whitespace may be required anywhere in it.
const CSS_REDUCED_MOTION_GUARD_RE = /@media[^{;]*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/;

// CSS-DECLARED motion: an `animation`/`transition` declaration (any vendor prefix, any longhand)
// whose value is not the do-nothing one. `none`/`unset`/`initial`/`0s` are excluded so that a route
// whose ONLY such declaration is the `transition: none` INSIDE its reduced-motion block is not
// counted as a motion source by its own remedy.
const CSS_MOTION_RE = /(?:^|[;{}\s])(?:-\w+-)?(?:animation|transition)(?:-\w+)?\s*:\s*(?!none|unset|initial|0s)[^;}\s]/i;

/** Pure: the play-region files -> [{routeId, mechanism, motionAt}], one hit per unguarded MECHANISM.
 *
 *  PER-MECHANISM, not per-directory (ADR-0046). The ADR's Context is explicit that
 *  prefers-reduced-motion is a CSS media feature which "does not apply itself to element.style writes
 *  made from script", and its Decision is to READ THE MEDIA QUERY IN SCRIPT. So the two legs cannot
 *  substitute for each other:
 *    JS motion  (rAF / a direct `.style.<prop> =` write) needs matchMedia read in a .js/.ts of the
 *               route directory. A CSS @media block does NOT satisfy it — that is the exact
 *               "no @keyframes declared is not no motion" reading ADR-0046 rejects.
 *    CSS motion (an animation/transition declaration) needs an @media (prefers-reduced-motion:
 *               reduce) block in the route's CSS. A JS matchMedia read does NOT satisfy it — script
 *               cannot opt a stylesheet's animation out.
 *  The guard may live in a DIFFERENT FILE of the same route directory (that is the region ADR-0055
 *  draws, and it is how short-stick and timebomb are really written), but never in a different
 *  MECHANISM.
 *
 *  ponytail: the JS motion source is matched RAW (no position mask); the CSS motion source and BOTH
 *  guards go through matchesInCode. Not an inconsistency — the two fail in opposite directions. A raw
 *  motion hit over-flags: it reds CI and a human reads it, so raw is the safe reading for a hazard
 *  (that is ADR-0055's rule, and it is why the JS leg keeps it). The CSS leg is classified only so a
 *  commented-out `animation:` is not called motion; the cost is that it can under-flag one, which the
 *  guard requirement does not depend on. A raw GUARD hit fails OPEN — a comment
 *  saying "prefers-reduced-motion holds trivially" would excuse the route, which is not hypothetical:
 *  it is the shipped bug ADR-0046 exists to remediate, where the only guard was a comment. ADR-0046
 *  records the resolved design this reuses (classify every character as code/string/comment, count a
 *  match only where it begins in code) and its rejection of blanking string contents — the real
 *  guard's own argument IS a string literal. classifySource deletes nothing and preserves offsets, so
 *  its one known failure (a desync on a quote-bearing regex literal) can only push a guard match out
 *  of CODE, i.e. flag a route that is fine. Fail-closed both ways. */
function findUnguardedPlayRoutes(files) {
  const byRoute = new Map();
  for (const f of files) {
    if (!byRoute.has(f.routeId)) byRoute.set(f.routeId, []);
    byRoute.get(f.routeId).push(f);
  }
  const hits = [];
  for (const [routeId, routeFiles] of [...byRoute].sort((a, b) => a[0].localeCompare(b[0]))) {
    const scripts = routeFiles.filter((f) => f.relPath.endsWith('.js') || f.relPath.endsWith('.ts'));
    const sheets = routeFiles.filter((f) => f.relPath.endsWith('.css'));

    const jsMotion = scripts.find((f) => MOTION_SOURCE_RE.test(f.text));
    if (jsMotion && !scripts.some((f) => matchesInCode(REDUCED_MOTION_GUARD_RE, f.text))) {
      hits.push({ routeId, mechanism: 'js', motionAt: jsMotion.relPath });
    }

    const cssMotion = sheets.find((f) => matchesInCode(CSS_MOTION_RE, f.text));
    if (cssMotion && !sheets.some((f) => matchesInCode(CSS_REDUCED_MOTION_GUARD_RE, f.text))) {
      hits.push({ routeId, mechanism: 'css', motionAt: cssMotion.relPath });
    }
  }
  return hits;
}

function write(root, relPath, content) {
  const abs = path.join(root, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
}

// ---------------------------------------------------------------------------
// Self-test: temp fixture tree under os.tmpdir(), never repo content. Calibrated both ways: a
// known-good tree passes, a known-bad tree fails on exactly the planted defect (an unguarded rAF
// style write — this repo's real gh#77 bug, reproduced from scratch).
// ---------------------------------------------------------------------------
function selftest() {
  const good = fs.mkdtempSync(path.join(os.tmpdir(), 'js-motion-guard-good-'));
  const bad = fs.mkdtempSync(path.join(os.tmpdir(), 'js-motion-guard-bad-'));
  try {
    // Known-good: a real matchMedia guard gates the rAF style write; a second module writes
    // .style.transform behind its own real guard; a third has no motion source at all and needs none.
    write(good, 'src/games/timebomb.ts', [
      "let reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;",
      'function frame() {',
      '  fuseFillEl.style.width = `${pct}%`;',
      '  requestAnimationFrame(frame);',
      '}',
    ].join('\n'));
    write(good, 'src/games/siamsi.ts', [
      'function prefersReducedMotion() {',
      "  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;",
      '}',
      'function wobble(el) { el.style.transform = rotated; }',
    ].join('\n'));
    write(good, 'src/games/daily-fortune.ts', ['function render() { stage.textContent = result; }'].join('\n'));

    const goodFiles = walkGamesFiles(good);
    assert.deepEqual(findUnguardedMotion(goodFiles), [], 'known-good fixture (two real guards, one module with no motion) must report zero hits');
    console.log('PASS known-good fixture: real matchMedia guards on both motion-driving modules, and the motion-free module needs none');

    // Known-bad: reproduces this repo's actual gh#77 bug — a real rAF + style write, and the ONLY
    // prefers-reduced-motion text in the file is a comment claim, never a matchMedia call.
    write(bad, 'src/games/timebomb.ts', [
      '// No animation is added on purpose — the canvas has none, so prefers-reduced-motion holds trivially.',
      'function frame() {',
      '  fuseFillEl.style.width = `${pct}%`;',
      '  requestAnimationFrame(frame);',
      '}',
    ].join('\n'));

    const badFiles = walkGamesFiles(bad);
    const unguarded = findUnguardedMotion(badFiles);
    assert.deepEqual(unguarded, ['src/games/timebomb.ts'], 'known-bad fixture must flag the unguarded rAF style write, the same shape gh#77 shipped');
    console.log(`PASS known-bad fixture flags the planted unguarded motion source (${unguarded[0]})`);

    // The use-vs-mention legs. Each one is GREEN under a stripper that only removes line-START
    // comments, which is what shipped: the guard text is present in the residue, so the guard regex
    // matched a comment or a string and the unguarded rAF write passed.
    const mention = fs.mkdtempSync(path.join(os.tmpdir(), 'js-motion-guard-mention-'));
    try {
      write(mention, 'src/games/timebomb.ts', [
        'function frame() {',
        '  fuseFillEl.style.width = `${pct}%`; // matchMedia(\'(prefers-reduced-motion: reduce)\') is handled upstream',
        '  requestAnimationFrame(frame);',
        '}',
      ].join('\n'));
      assert.deepEqual(
        findUnguardedMotion(walkGamesFiles(mention)),
        ['src/games/timebomb.ts'],
        'known-bad: a TRAILING mid-line comment quoting the matchMedia guard is a mention, not a guard — must still flag',
      );

      write(mention, 'src/games/timebomb.ts', [
        "const docs = \"call window.matchMedia('(prefers-reduced-motion: reduce)') before animating\";",
        'function frame() {',
        '  fuseFillEl.style.width = `${pct}%`;',
        '  requestAnimationFrame(frame);',
        '}',
      ].join('\n'));
      assert.deepEqual(
        findUnguardedMotion(walkGamesFiles(mention)),
        ['src/games/timebomb.ts'],
        'known-bad: the guard call quoted inside a STRING literal is a mention too — must still flag',
      );

      // Positive control for the stripper itself: a URL inside a string literal must survive (a
      // cut-from-`//`-to-end-of-line regex eats the rest of that line, taking the real guard with
      // it), and a real guard followed by a trailing comment must still read as a real guard.
      write(mention, 'src/games/timebomb.ts', [
        "const HELP_URL = 'https://watduang.com/help#reduced-motion';",
        "const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; // cached once",
        'function frame() {',
        '  fuseFillEl.style.width = `${pct}%`;',
        '  requestAnimationFrame(frame);',
        '}',
      ].join('\n'));
      assert.deepEqual(
        findUnguardedMotion(walkGamesFiles(mention)),
        [],
        'known-good: a URL in a string literal must not be mistaken for a comment, and a real guard with a trailing comment must still count',
      );
      console.log('PASS use-vs-mention calibrated: a trailing comment and a string literal quoting the guard both still FLAG, while a real guard beside a `https://` string stays clean');
    } finally {
      fs.rmSync(mention, { recursive: true, force: true });
    }

    // --- gh#170: the PLAY-ROUTE region, calibrated both ways on a fixture tree this test owns.
    // `root` is the override: walkPlayRouteFiles takes it, so no env knob and no way for a fixture to
    // narrow a real run. Route ids come from a fixture manifest shape, exactly as main() derives them
    // from the real one. ---
    assert.deepEqual(
      playRouteIds([
        { id: 'freeze-tap', playRoute: '/game/freeze-tap/play/' },
        { id: 'cannon-flag', playRoute: '/game/cannon-flag/play' },
        { id: 'daily-fortune' },
        { id: 'weird', playRoute: '/tool/wheel/' },
      ]),
      ['cannon-flag', 'freeze-tap'],
      'playRouteIds must derive ids from the manifest playRoute field, skip modules with no route, and ignore a non-play route',
    );
    console.log('PASS play-route id derivation: ids come from the manifest playRoute field (trailing slash optional), not a directory listing');

    const playFix = fs.mkdtempSync(path.join(os.tmpdir(), 'js-motion-guard-play-'));
    try {
      // Compliant route A: BOTH mechanisms present, each guarded by its own kind, and the guards sit
      // in different FILES from what they guard — short-stick's and timebomb's real layout, which a
      // per-file rule would red for file layout alone. Also carries a quote-bearing regex literal
      // ahead of the JS guard: the shape that desyncs a comment STRIPPER (ADR-0055). The guard must
      // still read as a guard here, which is why this gate classifies rather than strips.
      write(playFix, 'src/play/route-both-guarded/main.js', [
        "const esc = raw.replace(/['\"]/g, '');",
        'function frame(){ el.style.transform = t; requestAnimationFrame(frame); }',
      ].join('\n'));
      write(playFix, 'src/play/route-both-guarded/reduced.ts', "const mq = window.matchMedia('(prefers-reduced-motion: reduce)');");
      write(playFix, 'src/play/route-both-guarded/style.css', '.x { animation: pulse 1s infinite; }');
      write(playFix, 'src/play/route-both-guarded/overrides.css', '@media(prefers-reduced-motion:reduce){.x{animation:none}}');
      // Compliant route B: no motion of either kind, so it needs no guard.
      write(playFix, 'src/play/route-static/main.js', 'el.textContent = name;');
      // Compliant route C: the CSS mechanism's own remedy must not read as a motion source. The only
      // animation/transition declaration in this sheet is the `transition: none` INSIDE the guard.
      write(playFix, 'src/play/route-only-reset/style.css', '@media (prefers-reduced-motion: reduce) {\n  .bar { transition: none; animation: none; }\n}');

      // ADR-0046 leg 1 — cannon-flag's and power-meter's real shape: a rAF `.style.*` write whose
      // ONLY reduced-motion branch is a CSS @media block. CSS cannot reach an inline style written
      // from script, so this MUST flag on the js mechanism. The previous directory-level-presence
      // version of this rule passed it, which is exactly the reading ADR-0046 rejects.
      write(playFix, 'src/play/route-css-guard-only/main.js', 'function frame(){ bar.style.width = pct + "%"; requestAnimationFrame(frame); }');
      write(playFix, 'src/play/route-css-guard-only/style.css', '@media (prefers-reduced-motion: reduce) {\n  .bar { transition: none; }\n}');
      // ADR-0046 leg 2, the mirror — cursed-number's and how-close-is-near's real shape: a stylesheet
      // animation whose only reduced-motion branch is a matchMedia read in script. Script cannot opt a
      // stylesheet animation out, so this MUST flag on the css mechanism.
      write(playFix, 'src/play/route-js-guard-only/main.js', "const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;\nel.textContent = name;");
      write(playFix, 'src/play/route-js-guard-only/style.css', '.card { transition: all 0.2s ease; }');
      // Violating route: freeze-tap's real shape — rAF + a style write and a CSS animation, with the
      // guard text present ONLY in a comment and in a string, on both sides. This is the gh#77 /
      // ADR-0046 false-comment bug, and it is why guards are counted only where the match begins in
      // CODE. Raw-match the guard token and this fixture goes green while nothing is guarded.
      write(playFix, 'src/play/route-unguarded/main.js', [
        "// prefers-reduced-motion holds trivially here — matchMedia('(prefers-reduced-motion: reduce)') is handled upstream",
        "const docs = \"@media (prefers-reduced-motion: reduce) is in the stylesheet\";",
        'function frame(){ el.style.transform = t; requestAnimationFrame(frame); }',
      ].join('\n'));
      write(playFix, 'src/play/route-unguarded/style.css', '/* @media (prefers-reduced-motion: reduce) — TODO */\n.x { animation: pulse 1s infinite; }');
      // Must never join the scanned set: a probe harness and a test file inside a route directory.
      write(playFix, 'src/play/route-unguarded/canvas-pixels-probe.mjs', "matchMedia('(prefers-reduced-motion: reduce)')");
      write(playFix, 'src/play/route-unguarded/motion.test.mjs', "matchMedia('(prefers-reduced-motion: reduce)')");

      const ids = ['route-both-guarded', 'route-css-guard-only', 'route-js-guard-only', 'route-only-reset', 'route-static', 'route-unguarded'];
      const { files: playFixFiles, missingDirs } = walkPlayRouteFiles(playFix, ids);
      assert.deepEqual(missingDirs, [], 'every fixture route directory must exist');
      assert.ok(
        !playFixFiles.some((f) => f.relPath.includes('probe.mjs') || f.relPath.includes('.test.')),
        'a *-probe.mjs harness and a *.test.* file inside a route directory must never join the scanned set — otherwise a guard mentioned in a test excuses the route',
      );
      const playHits = findUnguardedPlayRoutes(playFixFiles);
      assert.deepEqual(
        playHits.map((h) => `${h.routeId}:${h.mechanism}`),
        ['route-css-guard-only:js', 'route-js-guard-only:css', 'route-unguarded:js', 'route-unguarded:css'],
        'ADR-0046: each mechanism needs its own guard — a CSS @media must not excuse a rAF style write, a matchMedia read must not excuse a stylesheet animation, and a guard that exists only in a comment or a string excuses nothing',
      );
      assert.equal(playHits[0].motionAt, 'src/play/route-css-guard-only/main.js', 'the hit must name the file the motion source was found in');
      console.log(`PASS play region calibrated both ways (ADR-0046, per mechanism): route-both-guarded (guards in sibling files, one behind a quote-bearing regex literal), route-static and route-only-reset (its only declaration is the reduced-motion reset) are clean; flagged ${playHits.map((h) => `${h.routeId}:${h.mechanism}`).join(', ')}`);

      assert.deepEqual(
        walkPlayRouteFiles(playFix, [...ids, 'gone']).missingDirs,
        ['gone'],
        'a manifest route with no src/play/<id>/ directory must be reported as missing, never silently dropped from the set',
      );
      console.log('PASS play region, empty/missing guard: a declared route with no directory is reported, not skipped');
    } finally {
      fs.rmSync(playFix, { recursive: true, force: true });
    }

    // --- The entry guard must not have turned this into a gate that cannot fail. main() now runs
    // behind isEntryPoint() so round-start-announce-check.mjs can import the classifier without
    // firing a full scan; if that predicate is ever wrong, `node scripts/js-motion-guard-check.mjs`
    // exits 0 having done NOTHING, which reads exactly like a clean tree (docs/adr/0019). Spawns the
    // real script with no flags and asserts it actually produced this gate's own output. Deleting the
    // `if (isEntryPoint()) await main();` line makes this red.
    const entryRun = spawnSync(process.execPath, [scriptPath], { encoding: 'utf8' });
    assert.match(
      `${entryRun.stdout}${entryRun.stderr}`,
      /js-motion-guard-check|drives motion|JS-driven motion|CSS-declared motion/,
      'running this script directly must execute main() — the entry-point guard must not silence the gate',
    );
    console.log(`PASS entry-point guard: spawning the script with no flags still runs the full scan (exit ${entryRun.status}), so importing the classifier elsewhere cannot silence it`);

    assert.deepEqual(coverageGap(walkGamesFiles(good)), [], 'a real scanned set containing timebomb.ts must report no coverage gap');
    assert.deepEqual(
      coverageGap([]),
      ['src/games/*.ts matched zero files', 'src/games/timebomb.ts was not in the scanned set'],
      'an empty scanned set must report both gaps, never pass vacuously',
    );
    console.log('PASS coverage guard calibrated both ways: a real set is clean, an empty set reports both gaps');
  } finally {
    fs.rmSync(good, { recursive: true, force: true });
    fs.rmSync(bad, { recursive: true, force: true });
  }
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest();

  const files = walkGamesFiles(repoRoot);
  const gaps = coverageGap(files);

  // gh#170: region 2. The set is the manifest's own playRoute declarations, so an empty set means the
  // manifest stopped declaring routes, not that this repo has none — either way nothing was scanned.
  const { games } = await import(new URL('../src/games/manifest.ts', import.meta.url).href);
  const routeIds = playRouteIds(games);
  if (routeIds.length === 0) gaps.push('the manifest declares zero playRoute games, so the play-route region scanned nothing');
  const { files: playFiles, missingDirs } = walkPlayRouteFiles(repoRoot, routeIds);
  if (missingDirs.length) gaps.push(`the manifest declares playRoute games with no src/play/<id>/ directory: ${missingDirs.join(', ')}`);

  if (gaps.length) {
    console.error(`js-motion-guard-check: ${gaps.join(' and ')} — nothing was checked.`);
    process.exit(1);
  }

  const unguardedRoutes = findUnguardedPlayRoutes(playFiles);
  const unguarded = findUnguardedMotion(files);
  if (unguarded.length > 0 || unguardedRoutes.length > 0) {
    console.error(
      [
        ...unguarded.map((relPath) => `${relPath}: drives motion (rAF or a .style write) with no real prefers-reduced-motion guard in the same file`),
        ...unguardedRoutes.map(({ routeId, mechanism, motionAt }) =>
          mechanism === 'js'
            ? `src/play/${routeId}/: JS-driven motion (rAF or a direct .style write, in ${motionAt}) with no ` +
              "matchMedia('(prefers-reduced-motion: reduce)') read in any script of the route directory. A CSS " +
              '@media block does not satisfy this: prefers-reduced-motion is a CSS media feature and it does not ' +
              'reach an inline style written from script (ADR-0046) — the script has to read the query itself.'
            : `src/play/${routeId}/: CSS-declared motion (an animation/transition declaration in ${motionAt}) with ` +
              'no @media (prefers-reduced-motion: reduce) block in the route CSS. A matchMedia read in the route ' +
              'scripts does not satisfy this: script cannot opt a stylesheet animation out (ADR-0046).',
        ),
        '',
        'gh#77 box7: a game module that writes element.style from a rAF loop or an event listener is JS-driven ' +
          'motion, which prefers-reduced-motion does not reach on its own — the module has to read ' +
          "matchMedia('(prefers-reduced-motion: reduce)') itself and act on it. A comment claiming the query " +
          '"holds trivially" is not a guard; see timebomb.ts (gh#77 box7) for the shape a real one takes.',
      ].join('\n'),
    );
    process.exit(1);
  }
  // Every number below is the length of the set it describes, computed here from what was actually
  // read — never a candidate list. `scannedRoutes` counts route directories that yielded at least one
  // scanned file, so a route whose directory holds nothing scannable cannot inflate it.
  const scannedRoutes = new Set(playFiles.map((f) => f.routeId)).size;
  console.log(
    `js-motion-guard-check: ${scannedRoutes} play-route director(ies) under src/play/ (ids from the manifest's playRoute fields), ` +
      `${playFiles.length} file(s) read, each mechanism guarded by its own kind (ADR-0046): JS motion by a matchMedia read in the route scripts, ` +
      'CSS motion by an @media (prefers-reduced-motion: reduce) block in the route CSS -- neither substitutes for the other; ' +
      `and every JS-driven motion source across ${files.length} file(s) in src/games/*.ts declares a prefers-reduced-motion guard ` +
      '(presence, NOT effectiveness -- see the ceiling in the header). BOUNDS, so this green is not over-read: those two regions are the whole ' +
      'scanned set -- src/pages/**, including the spinning wheel in src/pages/tool/wheel.astro, is unscanned; a guard counts only where the match ' +
      'begins in code, never in a comment or a string; and the JS mechanisms matched are requestAnimationFrame plus direct `.style.<prop> =` writes ' +
      'ONLY -- element.animate(), setInterval-driven writes, style.setProperty and class-toggled transitions are out of scope and read here as no motion.',
  );
}

// Entry point only. scripts/round-start-announce-check.mjs imports classifySource/matchesInCode from
// here (gh#170: one classifier, not two — ADR-0046 records the design and this file owns it), and an
// import must not fire a full gate as a side effect. Same guard the sibling gates carry
// (bundle-freeze-check.mjs, csp-inline-check.mjs). The `catch` returns TRUE on purpose: if the path
// comparison itself throws, the gate RUNS rather than silently becoming a gate that cannot fail.
// Pinned by the spawn leg in selftest() — deleting main()'s invocation here shows up there.
const isEntryPoint = () => {
  if (!process.argv[1]) return false;
  const canonical = (p) => pathToFileURL(fs.realpathSync(p)).href;
  try {
    return canonical(process.argv[1]) === canonical(fileURLToPath(import.meta.url));
  } catch {
    return true;
  }
};
if (isEntryPoint()) await main();
