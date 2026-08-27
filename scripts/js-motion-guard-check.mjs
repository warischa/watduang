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
//   - Anything outside the flat `src/games/*.ts` glob (the same boundary checkpoint-writer-check.mjs
//     draws, for the same reason: this is what the ticket's manifest scope actually is). This is a
//     REAL uncovered surface, not a theoretical one: src/pages/tool/wheel.astro spins a wheel from
//     an inline island and is never read by this gate. Nothing here claims site-wide coverage — the
//     success line names the glob it actually scanned, and the tool pages are unscanned.
//   - A `matchMedia` guard read inside a template-literal expression (`${...}`) — the scan treats
//     everything between the backticks as string content, so a guard hidden there reads as a
//     mention, not a call. Over-flagging, the safe direction. There is also no regex-literal state
//     in the scanner: a bare `//` inside a regex character class would be read as a comment start
//     (an unescaped `/` cannot otherwise appear in a regex literal, so this needs a `[//]` to bite).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

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
  if (gaps.length) {
    console.error(`js-motion-guard-check: ${gaps.join(' and ')} — nothing was checked.`);
    process.exit(1);
  }

  const unguarded = findUnguardedMotion(files);
  if (unguarded.length > 0) {
    console.error(
      [
        ...unguarded.map((relPath) => `${relPath}: drives motion (rAF or a .style write) with no real prefers-reduced-motion guard in the same file`),
        '',
        'gh#77 box7: a game module that writes element.style from a rAF loop or an event listener is JS-driven ' +
          'motion, which prefers-reduced-motion does not reach on its own — the module has to read ' +
          "matchMedia('(prefers-reduced-motion: reduce)') itself and act on it. A comment claiming the query " +
          '"holds trivially" is not a guard; see timebomb.ts (gh#77 box7) for the shape a real one takes.',
      ].join('\n'),
    );
    process.exit(1);
  }
  console.log(
    `js-motion-guard-check: every JS-driven motion source across ${files.length} file(s) in src/games/*.ts declares a prefers-reduced-motion guard ` +
      '(presence, NOT effectiveness -- see the ceiling in the header). NOT SITE-WIDE: this glob is the whole scanned set -- src/pages/**, including ' +
      'the spinning wheel in src/pages/tool/wheel.astro, is unscanned; and rAF plus `.style.*` writes are the only mechanisms matched (no element.animate, ' +
      'setInterval, style.setProperty or transition-by-classList).',
  );
}

await main();
