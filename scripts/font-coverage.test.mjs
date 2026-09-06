// The gate's judgement is only as good as three pure pieces: the set difference, the codepoint
// enumeration (Thai composes across SEPARATE codepoints, so a cluster-wise reader under-counts),
// and the cmap reader. This file pins all three against fixtures built here, so the shipped gate is
// never graded only by a selftest it co-authored. Every Thai character below is written as a \uXXXX
// escape on purpose: a whitespace cleaner deletes a pasted combining mark without a trace.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { missing, classify, decodeEscapes, cmapCodepoints, fmt } from './font-coverage-check.mjs';

// A minimal sfnt carrying nothing but a format-4 cmap. Format 4 is what a BMP-only Thai subset
// gets from a subsetter, so it is the format that has to be right.
function ttfWithCodepoints(codepoints) {
  const sorted = [...codepoints].sort((a, b) => a - b);
  const segs = [];
  for (const cp of sorted) {
    const last = segs[segs.length - 1];
    if (last && cp === last.end + 1) last.end = cp;
    else segs.push({ start: cp, end: cp });
  }
  segs.push({ start: 0xffff, end: 0xffff });
  const segCount = segs.length;
  const sub = Buffer.alloc(16 + segCount * 8);
  sub.writeUInt16BE(4, 0);
  sub.writeUInt16BE(sub.length, 2);
  sub.writeUInt16BE(0, 4);
  sub.writeUInt16BE(segCount * 2, 6);
  segs.forEach((s, i) => {
    sub.writeUInt16BE(s.end, 14 + i * 2);
    sub.writeUInt16BE(s.start, 16 + segCount * 2 + i * 2);
    sub.writeInt16BE(1, 16 + segCount * 4 + i * 2); // glyph = cp + 1, never 0
    sub.writeUInt16BE(0, 16 + segCount * 6 + i * 2);
  });
  const cmap = Buffer.alloc(12 + sub.length);
  cmap.writeUInt16BE(0, 0);
  cmap.writeUInt16BE(1, 2);
  cmap.writeUInt16BE(3, 4); // platform 3, Windows
  cmap.writeUInt16BE(1, 6); // encoding 1, BMP Unicode
  cmap.writeUInt32BE(12, 8);
  sub.copy(cmap, 12);
  const font = Buffer.alloc(28 + cmap.length);
  font.writeUInt32BE(0x00010000, 0);
  font.writeUInt16BE(1, 4);
  font.write('cmap', 12, 'ascii');
  font.writeUInt32BE(0, 16);
  font.writeUInt32BE(28, 20);
  font.writeUInt32BE(cmap.length, 24);
  cmap.copy(font, 28);
  return font;
}

test('missing is the corpus minus the font, sorted, and empty when covered', () => {
  const font = new Set([0x0e01, 0x0e02, 0x0e31]);
  assert.deepEqual(missing(font, new Set([0x0e02, 0x0e01])), [], 'a covered corpus reports nothing');
  assert.deepEqual(missing(font, new Set([0x0e33, 0x0e01, 0x0e0a])), [0x0e0a, 0x0e33], 'sorted ascending');
  assert.deepEqual(missing(new Set(), new Set([0x0e01])), [0x0e01], 'an empty font misses everything');
  assert.deepEqual(missing(font, new Set()), [], 'an empty corpus misses nothing \u2014 the caller owns that case');
  assert.equal(fmt(0x0e33), 'U+0E33');
  assert.equal(fmt(0x200b), 'U+200B');
});

test('enumeration counts codepoints, not visible clusters', () => {
  // Two visible clusters, three codepoints: a base consonant, a vowel that sits ABOVE it, and a
  // final consonant. The above-vowel is exactly the codepoint that shows as a dotted circle when
  // the font lacks it, so a reader that iterates clusters would under-count the demand.
  const { required } = classify('\u0e01\u0e31\u0e1a');
  assert.equal(required.size, 3, 'a combining vowel is its own codepoint, not part of its base');
  assert.ok(required.has(0x0e31), 'the combining mark is enumerated');
  const tone = classify('\u0e40\u0e2a\u0e35\u0e48\u0e22\u0e07').required;
  assert.ok(tone.has(0x0e48), 'a tone mark is enumerated');
  assert.equal(tone.size, 6, 'a leading vowel, a tone mark and their bases are six separate demands');
});

test('format characters are reported apart from required glyphs', () => {
  const { required, ignorable } = classify('\u0e01\u200b\u0e02\u200c');
  assert.deepEqual([...required].sort((a, b) => a - b), [0x0e01, 0x0e02]);
  assert.deepEqual([...ignorable].sort((a, b) => a - b), [0x200b, 0x200c], 'zero-width marks are not glyph demands');
  assert.equal(classify('Aa1 ,.-').required.size, 0, 'non-Thai is outside this subset scope');
});

test('escaped source text decodes before enumeration', () => {
  // Measured in this repo: dist/_astro chunks carry Thai as \u0eXX escapes, so a raw scan of the
  // built bundles reads zero Thai and the gate would go green on a font covering nothing.
  assert.equal(classify('\\u0e01\\u0e31').required.size, 0, 'undecoded escapes are invisible');
  assert.equal(classify(decodeEscapes('\\u0e01\\u0e31')).required.size, 2);
  assert.equal(classify(decodeEscapes('&#3585;&#x0e31;')).required.size, 2, 'html entities too');
  assert.equal(classify(decodeEscapes('\\u{0e33}')).required.size, 1, 'the braced form too');
  assert.equal(decodeEscapes('\\u0e01'), '\u0e01');
});

test('the cmap reader returns what a format-4 subtable actually maps', () => {
  const cps = [0x0e01, 0x0e02, 0x0e03, 0x0e31, 0x0e48];
  const got = cmapCodepoints(ttfWithCodepoints(cps));
  assert.deepEqual([...got].sort((a, b) => a - b), cps);
  assert.equal(got.has(0xffff), false, 'the segment sentinel is not coverage');
  const holed = cmapCodepoints(ttfWithCodepoints(cps.filter((c) => c !== 0x0e31)));
  assert.deepEqual(missing(holed, new Set(cps)), [0x0e31], 'a font missing one mark is caught');
});

test('an unreadable font is refused, never read as empty coverage', () => {
  assert.throws(() => cmapCodepoints(Buffer.from('wOF2 not a sfnt')), /sfnt|cmap|font/i);
  assert.throws(() => cmapCodepoints(Buffer.alloc(4)), /sfnt|cmap|font/i);
});

// End to end through the production path: the gate DISCOVERS the font by walking the build, so a
// calibration that only ever hands it a font by hand leaves discovery unmeasured. Fixtures are
// synthesized into a temp dir and removed; no font file is ever added to this repo.
function runOn(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'font-coverage-'));
  for (const [name, body] of Object.entries(files)) {
    fs.mkdirSync(path.join(dir, path.dirname(name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), body);
  }
  const gate = fileURLToPath(new URL('./font-coverage-check.mjs', import.meta.url));
  const run = spawnSync(process.execPath, [gate, '--dist', dir], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  return { status: run.status, out: `${run.stdout}${run.stderr}` };
}

// A base consonant raw, an above-vowel written as a JS escape (the built bundles really do spell it
// that way), a tone mark raw, and a zero-width space as an html entity.
const PAGE = '<p>\u0e01\u0e02\u0e48</p><script>const s="\\u0e31";</script><span>&#8203;</span>';
const THAI_BLOCK = [...Array(0x80).keys()].map((i) => 0x0e00 + i);

test('the gate reds on a subset missing one codepoint, and names it', () => {
  const r = runOn({ 'index.html': PAGE, 'fonts/subset.ttf': ttfWithCodepoints(THAI_BLOCK.filter((c) => c !== 0x0e02)) });
  assert.equal(r.status, 1, 'a hole in the subset must fail the build');
  assert.match(r.out, /U\+0E02/, 'the missing codepoint is named in U+XXXX form');
});

test('the gate reds when only a COMBINING mark is missing — the dotted-circle case', () => {
  // Every base consonant is covered, so the page still renders; the mark alone is what breaks, and
  // it breaks without an error anywhere. This is the case the gate exists for.
  const r = runOn({ 'index.html': PAGE, 'fonts/subset.ttf': ttfWithCodepoints(THAI_BLOCK.filter((c) => c !== 0x0e31 && c !== 0x0e48)) });
  assert.equal(r.status, 1);
  assert.match(r.out, /U\+0E31/, 'an above-vowel reached only through a \\u escape is still demanded');
  assert.match(r.out, /U\+0E48/, 'a tone mark is demanded');
});

test('the gate greens on a superset, and skips loudly when nothing is self-hosted', () => {
  const covered = runOn({ 'index.html': PAGE, 'fonts/subset.ttf': ttfWithCodepoints(THAI_BLOCK) });
  assert.equal(covered.status, 0, 'a strict superset passes');
  assert.match(covered.out, /attacker-owned/i, 'the player-name boundary is stated on a passing run too');
  const none = runOn({ 'index.html': PAGE });
  assert.equal(none.status, 0, 'no self-hosted font means no subset that can rot');
  assert.match(none.out, /SKIP/);
});

test('a shipped font this gate could not open is NAMED, not passed over in silence', () => {
  // The divergence case with no gate on it: a @font-face that lists a woff2 and a .ttf references
  // both, so the orphan gate is green, the browser fetches the woff2, and coverage above was read
  // off the .ttf. The run still greens — the ruling on whether that should red belongs to whoever
  // lands the font — but a green that never names the unread file is a green about the wrong file.
  const r = runOn({
    'index.html': PAGE,
    'fonts/subset.ttf': ttfWithCodepoints(THAI_BLOCK),
    'fonts/subset.woff2': Buffer.from('wOF2 not a readable sfnt'),
  });
  assert.equal(r.status, 0, 'one readable face covering the corpus still passes');
  assert.match(r.out, /coverage gap: 1 shipped font file\(s\) were NOT read/, 'the unread count is stated');
  assert.match(r.out, /subset\.woff2/, 'the unread file is named');
  assert.doesNotMatch(r.out, /subset\.woff2[^\n]*mapped/, 'the unread file is never counted as coverage');
});

test('with nothing readable the gate refuses to recommend a twin', () => {
  // The message used to tell the reader to ship an uncompressed .ttf TWIN. A twin is not the bytes
  // the browser loads, and unreferenced under public/ it also reds the orphan gate — so the advice
  // must name the real face and the woff2 reader, and must not name a twin as a way out.
  const r = runOn({ 'index.html': PAGE, 'fonts/subset.woff2': Buffer.from('wOF2 not a readable sfnt') });
  assert.equal(r.status, 1, 'a build whose only font is unreadable ships an UNCHECKED subset');
  assert.doesNotMatch(r.out, /Ship an uncompressed \.ttf\/\.otf twin/, 'the twin recommendation is gone');
  assert.match(r.out, /a twin is NOT one of them/, 'the twin is named as the option it is not');
  assert.match(r.out, /public-orphan-check/, 'the orphan gate the twin would red is named');
});

test('an empty corpus reds instead of reporting a covered subset', () => {
  // Zero Thai anywhere in a Thai-first build is a broken reader, and a broken reader would
  // otherwise report full coverage of nothing.
  const r = runOn({ 'index.html': '<p>PartyPick</p>', 'fonts/subset.ttf': ttfWithCodepoints(THAI_BLOCK) });
  assert.equal(r.status, 1);
  assert.match(r.out, /no Thai codepoint/);
});
