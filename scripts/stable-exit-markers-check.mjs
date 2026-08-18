#!/usr/bin/env node
// Static regression tripwire standing in for scripts/gamenav-again-grid-probe.mjs and
// scripts/gamenav-start-grid-probe.mjs (issue #39), neither of which runs in CI. Per
// ADR-0018 (docs/adr/0018-a-static-tripwire-may-stand-in-for-a-probe-that-never-runs.md),
// this does NOT re-measure the collision geometry those probes checked — ADR-0015 already
// accepted that geometry permanently ("nothing moves; only the consequence changes"), and
// that set is owned by Thai text length, roster size and the layout engine, so scanning for
// it would never converge (docs/adr/0016). What CAN regress is the codebase-owned marker set
// invented in #39: `data-stable-exit` is meant to sit on exactly one link
// (src/layouts/GameLayout.astro's `/games/` link), and PlayerSetup.astro's leave-confirm guard
// is meant to exempt exactly that marker via the selector `a[href]:not([data-stable-exit])`.
// "Exactly one" is enforced as exactly one: the attribute must be ABSENT from every other file AND
// PRESENT once in GameLayout.astro. Zero markers is a real regression — the leave-confirm would then
// intercept the one stable exit ADR-0015 deliberately exempted — so it fails the same as two.
//
// ponytail: this is a raw source scan. It cannot see that a marked link's tap is actually
// intercepted at runtime — a button calling location.href, or the fail-open `showModal` branch
// at PlayerSetup.astro:407, passes clean either way. It also cannot prove that "the panel is
// collapsed" and "the guard should arm" stay the same statement: both currently read
// `root.hidden` (set at PlayerSetup.astro:192, read at :400), but if that bit is ever replaced
// as the live-round flag, this scan has no way to notice the two statements diverged.
//
// Both the presence count and the guard-selector check run on comment-stripped text, the same text
// the absence scan already used: a comment can neither satisfy a "must be present" check (an old
// selector left commented out above a weakened live one used to pass) nor trip a "must not appear"
// one. The stripper is textual, so a `//` inside a string literal would be read as a comment.
//
//   node scripts/stable-exit-markers-check.mjs             -> scan src/**/*.astro,*.ts against the real tree
//   node scripts/stable-exit-markers-check.mjs --selftest  -> both-direction calibration on temp fixtures

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const ATTR = 'data-stable-exit';
const ALLOWED_ATTR_FILE = 'src/layouts/GameLayout.astro'; // the only file the attribute may appear in outside a comment
const SELECTOR_FILE = 'src/shell/PlayerSetup.astro';
const SELECTOR_LITERAL = 'a[href]:not([data-stable-exit])';

// ---------------------------------------------------------------------------
// Pure: text -> text with comments removed. Ordered so multi-line forms are stripped before
// line comments (so nothing left inside a block/brace comment can be mis-read as a line comment).
// This codebase's own idiom (checked in PlayerSetup.astro and GameLayout.astro) uses only
// brace comments ({/* ... */}) in .astro templates and // line comments in script bodies; a
// generic /* ... */ is stripped too, at zero cost, in case a .ts file ever uses one.
// ---------------------------------------------------------------------------
function stripComments(text) {
  return text
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '') // Astro/JSX brace comments
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '') // generic block comments — LINE-START ONLY, same reason as below
    .replace(/^[ \t]*\/\/.*$/gm, ''); // line comments — LINE-START ONLY, see the note below
}

// ponytail: the line-comment rule is deliberately narrow — `//` counts as a comment only at the
// start of a line. A mid-line `//` is far more often a URL than a comment: 'https://schema.org'
// sits in src/layouts/GameLayout.astro, a file this gate scans. Blanking from there to end of line
// let a stray data-stable-exit hide behind a URL on the same line, and the gate went green — a
// fail-OPEN, measured, not theorised. Tracking quote state instead was rejected: an unpaired
// apostrophe in prose ("don't") would open a string that never closes and swallow live markup,
// trading this hole for a worse one.
// The same narrowing applies to bare `/* */`: a mid-line `/*` is a glob or a path far more often
// than a comment. src/pages/game/[id].astro holds '../../games/*.ts', also in this gate's scan set.
// It is benign only because that file has no later `*/` to close the phantom block — add one and the
// span between them blanks, taking any marker with it. Verified across the scanned files: no real
// comment here uses a mid-line `/* */`; the two mid-line hits are that glob and a `src/*` inside a
// line comment. `{/* */}` stays allowed anywhere, being an unambiguous Astro construct.
// Ceiling: a trailing `// ...` comment that MENTIONS data-stable-exit now trips the gate. That is
// a false positive, it fails SAFE (red, a human looks), and no such comment exists today. The
// upgrade path if this stops holding is the TypeScript parser scripts/thai-comments.mjs uses.

// The attribute name is also a legitimate substring of the guard's own selector literal
// ([data-stable-exit], inside a[href]:not([data-stable-exit])) — that is a reference to the
// attribute, not a use of it. Exclude only that bracketed form; a bare "data-stable-exit" (an
// attribute on a tag, or a setAttribute('data-stable-exit', ...) call) still matches.
const ATTR_USE_RE = /(?<!\[)data-stable-exit(?!\])/;
const ATTR_USE_RE_G = /(?<!\[)data-stable-exit(?!\])/g; // same shape, global — counting needs its own instance to keep lastIndex out of the .test() above

// ---------------------------------------------------------------------------
// Pure: {relPath, text}[] -> relPath[] of files where the attribute appears outside a comment
// and outside the guard's own [data-stable-exit] selector reference, in any file other than
// the one allowed location.
// ---------------------------------------------------------------------------
function findAttributeViolations(files) {
  const hits = [];
  for (const { relPath, text } of files) {
    if (relPath === ALLOWED_ATTR_FILE) continue;
    if (ATTR_USE_RE.test(stripComments(text))) hits.push(relPath);
  }
  return hits;
}

// Pure: how many real uses of the attribute does the one allowed file carry? Comments are stripped
// (GameLayout.astro:34 explains the attribute in a brace comment right above the link that uses it),
// so the answer is a count of live attributes. Anything but 1 fails: 0 means the exemption silently
// vanished, 2+ means the closed marker set grew without a decision.
function countAttributeUses(text) {
  return (stripComments(text).match(ATTR_USE_RE_G) || []).length;
}

// Pure: does the guard file still carry the exact exemption selector? Comment-stripped, or the old
// selector left behind in a `// was: ...` line would satisfy this while the live one is weakened.
function selectorPresent(text) {
  return stripComments(text).includes(SELECTOR_LITERAL);
}

// ---------------------------------------------------------------------------
// IO: walk src/ for .astro and .ts files, relative to an arbitrary root (so selftest can point
// this at a temp fixture tree instead of the real repo).
// ---------------------------------------------------------------------------
function walkSrcFiles(root) {
  const srcDir = path.join(root, 'src');
  const out = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
      } else if (entry.isFile() && (abs.endsWith('.astro') || abs.endsWith('.ts'))) {
        out.push({ relPath: path.relative(root, abs).split(path.sep).join('/'), text: fs.readFileSync(abs, 'utf8') });
      }
    }
  })(srcDir);
  return out;
}

// ---------------------------------------------------------------------------
// Self-test: temp fixture tree under os.tmpdir(), never repo content. Both conditions
// calibrated both ways: a known-good tree passes, a known-bad tree fails on the planted defect.
// ---------------------------------------------------------------------------
function selftest() {
  const good = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-exit-good-'));
  const bad = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-exit-bad-'));
  const dup = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-exit-dup-'));
  try {
    // Known-good: the real allowed shape. GameLayout.astro carries the one real attribute use
    // plus its own explanatory brace comment mentioning the attribute (the GameLayout.astro:34
    // case). PlayerSetup.astro carries the real selector, plus a line comment mentioning the
    // attribute (the PlayerSetup.astro:390 case) that must NOT be read as a real attribute use.
    // A third file has a brace-comment mention too, proving the exclusion isn't special-cased
    // to GameLayout.astro's own comment style.
    write(good, 'src/layouts/GameLayout.astro', [
      '{/* data-stable-exit (#39): this link never moves under a tap-transition,',
      '     so it is exempted from the leave-confirm guard. */}',
      '<p><a href="/games/" data-stable-exit>ดูเกมทั้งหมด</a></p>',
    ].join('\n'));
    write(good, 'src/shell/PlayerSetup.astro', [
      '  // Only data-stable-exit (GameLayout\'s /games/ link) opts out.',
      "  const link = (e.target as Element).closest?.('a[href]:not([data-stable-exit])') as HTMLAnchorElement | null;",
    ].join('\n'));
    write(good, 'src/games/timebomb.ts', [
      '{/* mentions data-stable-exit only in a brace comment, no real attribute here */}',
      "el('button', 'ต่อไป');",
    ].join('\n'));

    // The mid-line `//` case. 'https://schema.org' really sits in GameLayout.astro, and a
    // blanket line-comment strip blanked from that `//` to end of line — a stray marker sharing
    // the line went invisible and the gate passed. Measured fail-OPEN, not theorised.
    write(good, 'src/layouts/Base.astro', [
      '<script type="application/ld+json">{"@context":"https://schema.org"}</script>',
      '<p>plain line, no marker</p>',
    ].join('\n'));

    const goodFiles = walkSrcFiles(good);
    assert.deepEqual(findAttributeViolations(goodFiles), [], 'known-good fixture must report zero attribute violations');
    const goodPlayerSetup = goodFiles.find((f) => f.relPath === 'src/shell/PlayerSetup.astro');
    assert.equal(selectorPresent(goodPlayerSetup.text), true, 'known-good fixture must keep the exemption selector');
    const goodLayout = goodFiles.find((f) => f.relPath === 'src/layouts/GameLayout.astro');
    assert.equal(countAttributeUses(goodLayout.text), 1, 'known-good fixture must carry exactly one live attribute use, its own brace comment not counted');
    // Same shape, now WITH a marker hiding behind the URL on the same line: must be caught.
    const urlHole = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-exit-urlhole-'));
    try {
      write(urlHole, 'src/layouts/GameLayout.astro', '<p><a href="/games/" data-stable-exit>x</a></p>');
      write(urlHole, 'src/shell/PlayerSetup.astro', "closest?.('a[href]:not([data-stable-exit])')");
      write(urlHole, 'src/layouts/Base.astro', '<a href="https://ex.com/a" data-stable-exit>hidden</a>');
      assert.deepEqual(
        findAttributeViolations(walkSrcFiles(urlHole)),
        ['src/layouts/Base.astro'],
        'a marker sharing a line with a // URL must still be seen — mid-line // is not a comment',
      );
      console.log('PASS a data-stable-exit hidden behind a mid-line // URL is still caught');

      // Same class, block-comment half: a mid-line `/*` (the '../../games/*.ts' glob really in
      // src/pages/game/[id].astro) plus any later `*/` would blank the span between them.
      write(urlHole, 'src/pages/game/[id].astro', [
        "  const mods = import.meta.glob(['../../games/*.ts']);",
        '  <a href="/y" data-stable-exit>hidden</a>',
        '  /* an ordinary block comment closing the phantom span */',
      ].join('\n'));
      assert.ok(
        findAttributeViolations(walkSrcFiles(urlHole)).includes('src/pages/game/[id].astro'),
        'a marker between a mid-line /* glob and a later */ must still be seen',
      );
      console.log('PASS a data-stable-exit inside a phantom /* ... */ span is still caught');
    } finally {
      fs.rmSync(urlHole, { recursive: true, force: true });
    }

    console.log('PASS known-good fixture: allowed attribute location + both comment styles ignored + selector present + exactly one live marker');

    // Known-bad: a real anchor with the attribute planted in a file that is not the allowed one
    // (this repo's actual idiom for a marked link, not a synthetic string), and the guard's
    // selector literal degraded to drop its :not(...) clause.
    // GameLayout keeps the attribute ONLY in a comment: the refactor that drops the marker while
    // leaving the prose behind. Zero live markers means the guard now intercepts the stable exit.
    write(bad, 'src/layouts/GameLayout.astro', [
      '{/* data-stable-exit used to sit on the /games/ link here. */}',
      '<p><a href="/games/">ดูเกมทั้งหมด</a></p>',
    ].join('\n'));
    write(bad, 'src/layouts/BaseLayout.astro', [
      '<footer><a href="/about/" data-stable-exit>เกี่ยวกับเรา</a></footer>',
    ].join('\n'));
    // The old selector survives as a comment while the live one is weakened — before comments were
    // stripped, that alone kept selectorPresent() true and the gate green.
    write(bad, 'src/shell/PlayerSetup.astro', [
      "  // was: closest?.('a[href]:not([data-stable-exit])')",
      "  const link = (e.target as Element).closest?.('a[href]') as HTMLAnchorElement | null;",
    ].join('\n'));

    const badFiles = walkSrcFiles(bad);
    const attrViolations = findAttributeViolations(badFiles);
    assert.deepEqual(attrViolations, ['src/layouts/BaseLayout.astro'], 'known-bad fixture must flag exactly the planted file');
    const badPlayerSetup = badFiles.find((f) => f.relPath === 'src/shell/PlayerSetup.astro');
    assert.equal(selectorPresent(badPlayerSetup.text), false, 'a commented-out selector must not satisfy the presence check while the live one is weakened');
    const badLayout = badFiles.find((f) => f.relPath === 'src/layouts/GameLayout.astro');
    assert.equal(countAttributeUses(badLayout.text), 0, 'a commented-out marker must not satisfy the presence check — zero live markers must be visible as zero');
    console.log(`PASS known-bad fixture flags planted attribute (${attrViolations[0]}), commented-out selector, and zero live markers`);

    // "Exactly one" also has an upper bound: a second marked link in the allowed file is a silent
    // widening of the closed set, and the absence scan above cannot see it (it skips that file).
    write(dup, 'src/layouts/GameLayout.astro', [
      '<p><a href="/games/" data-stable-exit>ดูเกมทั้งหมด</a></p>',
      '<p><a href="/" data-stable-exit>หน้าแรก</a></p>',
    ].join('\n'));
    const dupLayout = walkSrcFiles(dup).find((f) => f.relPath === 'src/layouts/GameLayout.astro');
    assert.equal(countAttributeUses(dupLayout.text), 2, 'a second marked link in the allowed file must be counted, not swallowed');
    console.log('PASS known-bad fixture: a duplicated marker in the allowed file counts 2, failing the exactly-one rule');
  } finally {
    fs.rmSync(good, { recursive: true, force: true });
    fs.rmSync(bad, { recursive: true, force: true });
    fs.rmSync(dup, { recursive: true, force: true });
  }
}

function write(root, relPath, content) {
  const abs = path.join(root, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
}

// ---------------------------------------------------------------------------
async function main() {
  if (process.argv.includes('--selftest')) return selftest();

  const files = walkSrcFiles(repoRoot);
  let anyFail = false;

  for (const relPath of findAttributeViolations(files)) {
    console.error(`${relPath}: ${ATTR} found outside the one allowed location (${ALLOWED_ATTR_FILE})`);
    anyFail = true;
  }

  const layoutFile = files.find((f) => f.relPath === ALLOWED_ATTR_FILE);
  const attrUses = layoutFile ? countAttributeUses(layoutFile.text) : 0;
  if (attrUses !== 1) {
    console.error(
      `${ALLOWED_ATTR_FILE}: ${ATTR} must appear exactly once outside comments, found ${attrUses}` +
        (attrUses === 0 ? ' — with no marked link, the leave-confirm guard intercepts the one stable exit too' : ' — the marker set is closed at one link'),
    );
    anyFail = true;
  }

  const setupFile = files.find((f) => f.relPath === SELECTOR_FILE);
  if (!setupFile || !selectorPresent(setupFile.text)) {
    console.error(`${SELECTOR_FILE}: exemption selector "${SELECTOR_LITERAL}" is missing or was changed`);
    anyFail = true;
  }

  if (anyFail) {
    console.error('\n#39 / ADR-0018: the stable-exit marker set is closed. A new marked exit, or a weakened guard selector, needs a human decision, not a silent scan pass.');
    process.exit(1);
  }
  console.log('stable-exit-markers-check: marker attribute and guard selector clean');
}

await main();
