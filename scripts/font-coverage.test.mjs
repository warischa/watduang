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
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { missing, classify, decodeEscapes, cmapCodepoints, fmt, checkFaceCoverage, woff2Codepoints, pairFaces, checkPairIdentity, checkInventory, EXPECTED_STEMS } from './font-coverage-check.mjs';
import zlib from 'node:zlib';

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

function encodeUIntBase128(val) {
  if (val === 0) return Buffer.from([0]);
  const parts = [];
  let v = val;
  while (v > 0) {
    parts.push(v & 0x7f);
    v = Math.floor(v / 128);
  }
  const bytes = [];
  for (let i = parts.length - 1; i >= 0; i--) {
    bytes.push(parts[i] | (i > 0 ? 0x80 : 0));
  }
  return Buffer.from(bytes);
}

// Disclosed ceiling: woff2WithCodepoints synthesizes a minimal cmap-only woff2 with no glyph tables
// or outlines. It exercises cmap extraction, not full browser font loader conformance.
function woff2WithCodepoints(codepoints) {
  const cmap = ttfWithCodepoints(codepoints).slice(28);
  const compressed = zlib.brotliCompressSync(cmap);
  const origLenEnc = encodeUIntBase128(cmap.length);
  const tableDir = Buffer.concat([Buffer.from([0]), origLenEnc]);
  const header = Buffer.alloc(48);
  header.write('wOF2', 0, 'ascii');
  header.writeUInt32BE(0x00010000, 4);
  const totalLen = 48 + tableDir.length + compressed.length;
  header.writeUInt32BE(totalLen, 8);
  header.writeUInt16BE(1, 12);
  header.writeUInt16BE(0, 14);
  header.writeUInt32BE(28 + cmap.length, 16);
  header.writeUInt32BE(compressed.length, 20);
  header.writeUInt16BE(1, 24);
  header.writeUInt16BE(0, 26);
  return Buffer.concat([header, tableDir, compressed]);
}

function fullFontSet(override = {}) {
  const base = {
    'fonts/sarabun-regular-subset.woff2': woff2WithCodepoints(THAI_BLOCK),
    'fonts/sarabun-regular-subset.ttf': ttfWithCodepoints(THAI_BLOCK),
    'fonts/sarabun-bold-subset.woff2': woff2WithCodepoints(THAI_BLOCK),
    'fonts/sarabun-bold-subset.ttf': ttfWithCodepoints(THAI_BLOCK),
  };
  const res = { ...base, ...override };
  for (const [k, v] of Object.entries(res)) {
    if (v === null || v === undefined) delete res[k];
  }
  return res;
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
  const missingOne = THAI_BLOCK.filter((c) => c !== 0x0e02);
  const r = runOn({
    'index.html': PAGE,
    ...fullFontSet({
      'fonts/sarabun-regular-subset.ttf': ttfWithCodepoints(missingOne),
      'fonts/sarabun-regular-subset.woff2': woff2WithCodepoints(missingOne),
      'fonts/sarabun-bold-subset.ttf': ttfWithCodepoints(missingOne),
      'fonts/sarabun-bold-subset.woff2': woff2WithCodepoints(missingOne),
    }),
  });
  assert.equal(r.status, 1, 'a hole in the subset must fail the build');
  assert.match(r.out, /U\+0E02/, 'the missing codepoint is named in U+XXXX form');
});

test('the gate reds when only a COMBINING mark is missing — the dotted-circle case', () => {
  // Every base consonant is covered, so the page still renders; the mark alone is what breaks, and
  // it breaks without an error anywhere. This is the case the gate exists for.
  const missingMarks = THAI_BLOCK.filter((c) => c !== 0x0e31 && c !== 0x0e48);
  const r = runOn({
    'index.html': PAGE,
    ...fullFontSet({
      'fonts/sarabun-regular-subset.ttf': ttfWithCodepoints(missingMarks),
      'fonts/sarabun-regular-subset.woff2': woff2WithCodepoints(missingMarks),
      'fonts/sarabun-bold-subset.ttf': ttfWithCodepoints(missingMarks),
      'fonts/sarabun-bold-subset.woff2': woff2WithCodepoints(missingMarks),
    }),
  });
  assert.equal(r.status, 1);
  assert.match(r.out, /U\+0E31/, 'an above-vowel reached only through a \\u escape is still demanded');
  assert.match(r.out, /U\+0E48/, 'a tone mark is demanded');
});

test('the gate greens on a superset, and skips loudly when nothing is self-hosted', () => {
  const covered = runOn({ 'index.html': PAGE, ...fullFontSet() });
  assert.equal(covered.status, 0, 'a strict superset passes');
  assert.match(covered.out, /attacker-owned/i, 'the player-name boundary is stated on a passing run too');
  const none = runOn({ 'index.html': PAGE });
  assert.equal(none.status, 0, 'no self-hosted font means no subset that can rot');
  assert.match(none.out, /SKIP/);
});

test('a shipped font this gate could not open is NAMED, not passed over in silence', () => {
  // A shipped font format the gate cannot parse (.woff or .ttc) must be disclosed as unread,
  // never silently passed over.
  const r = runOn({
    'index.html': PAGE,
    ...fullFontSet(),
    'fonts/subset.woff': Buffer.from('wOFF not a readable sfnt'),
  });
  assert.equal(r.status, 0, 'one readable face covering the corpus still passes');
  assert.match(r.out, /coverage gap: 1 shipped font file\(s\) were NOT read/, 'the unread count is stated');
  assert.match(r.out, /subset\.woff/, 'the unread file is named');
  assert.doesNotMatch(r.out, /subset\.woff[^\n]*mapped/, 'the unread file is never counted as coverage');
});

test('with nothing readable the gate refuses to recommend a twin', () => {
  // A build with only an unreadable font format ships an unchecked subset and fails with clear guidance.
  const r = runOn({ 'index.html': PAGE, 'fonts/subset.woff': Buffer.from('wOFF not a readable sfnt') });
  assert.equal(r.status, 1, 'a build whose only font is unreadable ships an UNCHECKED subset');
  assert.doesNotMatch(r.out, /Ship an uncompressed \.ttf\/\.otf twin/, 'the twin recommendation is gone');
  assert.match(r.out, /a twin is NOT one of them/, 'the twin is named as the option it is not');
  assert.match(r.out, /public-orphan-check/, 'the orphan gate the twin would red is named');
});

test('an empty corpus reds instead of reporting a covered subset', () => {
  // Zero Thai anywhere in a Thai-first build is a broken reader, and a broken reader would
  // otherwise report full coverage of nothing.
  const r = runOn({ 'index.html': '<p>PartyPick</p>', ...fullFontSet() });
  assert.equal(r.status, 1);
  assert.match(r.out, /no Thai codepoint/);
});

test('checkFaceCoverage reports failures per face rather than pooling', () => {
  const faceA = new Set([0x0e01, 0x0e02]);
  const faceB = new Set([0x0e01]);
  const req = new Set([0x0e01, 0x0e02]);
  const failures = checkFaceCoverage([
    { file: 'fonts/regular.ttf', codepoints: faceA },
    { file: 'fonts/bold.ttf', codepoints: faceB },
  ], req);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].file, 'fonts/bold.ttf');
  assert.deepEqual(failures[0].gaps, [0x0e02]);
});

test('the gate reds when one face lacks a codepoint covered by another face, naming the failing face', () => {
  // Regular covers full Thai block; Bold lacks U+0E02 which the corpus uses.
  // Under pooled logic this passed because Regular covered it. Under per-face logic it must red and name bold.
  const missingOne = THAI_BLOCK.filter((c) => c !== 0x0e02);
  const files = {
    'index.html': PAGE,
    ...fullFontSet({
      'fonts/sarabun-bold-subset.ttf': ttfWithCodepoints(missingOne),
      'fonts/sarabun-bold-subset.woff2': woff2WithCodepoints(missingOne),
    }),
  };
  const r = runOn(files);
  assert.equal(r.status, 1, 'a hole in one face must fail even if another face covers it');
  assert.match(r.out, /fonts\/sarabun-bold-subset\.ttf/, 'the failing face is named');
  assert.match(r.out, /U\+0E02/, 'the missing codepoint is named');

  // Must-red proof: confirm the exact same fixture passes under the old pooled logic.
  const required = classify(PAGE).required;
  const pooled = new Set([
    ...cmapCodepoints(files['fonts/sarabun-regular-subset.ttf']),
    ...cmapCodepoints(files['fonts/sarabun-bold-subset.ttf']),
  ]);
  assert.deepEqual(missing(pooled, required), [], 'fixture would pass under old pooled logic');
});

test('the gate greens when every readable face covers all required codepoints', () => {
  const r = runOn({
    'index.html': PAGE,
    ...fullFontSet(),
  });
  assert.equal(r.status, 0, 'every face covering required codepoints must pass');
  assert.match(r.out, /font: \d+ codepoint\(s\) mapped across/, 'aggregate reporting is preserved');
  assert.match(r.out, /OK: all \d+ reachable Thai codepoint\(s\) are present/, 'successful check confirms full coverage');
});

test('woff2Codepoints parses a format-4 cmap out of a compressed woff2', () => {
  const cps = [0x0e01, 0x0e02, 0x0e03, 0x0e31, 0x0e48];
  const woff2 = woff2WithCodepoints(cps);
  const got = woff2Codepoints(woff2);
  assert.deepEqual([...got].sort((a, b) => a - b), cps);
});

test('pairFaces groups matching .woff2 and .ttf files', () => {
  const faces = [
    { file: 'fonts/sarabun-regular-subset.woff2', codepoints: new Set([0x0e01]) },
    { file: 'fonts/sarabun-regular-subset.ttf', codepoints: new Set([0x0e01]) },
    { file: 'fonts/sarabun-bold-subset.woff2', codepoints: new Set([0x0e01, 0x0e02]) },
    { file: 'fonts/sarabun-bold-subset.ttf', codepoints: new Set([0x0e01, 0x0e02]) },
  ];
  const pairs = pairFaces(faces);
  assert.equal(pairs.length, 2);
  assert.equal(pairs[0].woff2File, 'fonts/sarabun-regular-subset.woff2');
  assert.equal(pairs[0].ttfFile, 'fonts/sarabun-regular-subset.ttf');
  assert.equal(pairs[1].woff2File, 'fonts/sarabun-bold-subset.woff2');
  assert.equal(pairs[1].ttfFile, 'fonts/sarabun-bold-subset.ttf');
});

test('checkPairIdentity reports mismatches between paired faces in either direction', () => {
  const pairA = {
    woff2File: 'fonts/reg.woff2',
    ttfFile: 'fonts/reg.ttf',
    woff2Codepoints: new Set([0x0e01]),
    ttfCodepoints: new Set([0x0e01, 0x0e04]),
  };
  const diffsA = checkPairIdentity([pairA]);
  assert.equal(diffsA.length, 1);
  assert.deepEqual(diffsA[0].onlyInTtf, [0x0e04]);
  assert.deepEqual(diffsA[0].onlyInWoff2, []);

  const pairB = {
    woff2File: 'fonts/bold.woff2',
    ttfFile: 'fonts/bold.ttf',
    woff2Codepoints: new Set([0x0e01, 0x0e05]),
    ttfCodepoints: new Set([0x0e01]),
  };
  const diffsB = checkPairIdentity([pairB]);
  assert.equal(diffsB.length, 1);
  assert.deepEqual(diffsB[0].onlyInTtf, []);
  assert.deepEqual(diffsB[0].onlyInWoff2, [0x0e05]);
});

test('the gate reds when paired woff2 and ttf map different codepoint sets, naming the differing codepoint', () => {
  // Calibration input: U+0E04 is dropped from the woff2 side while present in the ttf side.
  // U+0E04 is not in PAGE, so per-face required coverage alone would not catch this hole.
  // The pair identity assertion must catch it and name U+0E04 and both paired files.
  const files = {
    'index.html': PAGE,
    ...fullFontSet({
      'fonts/sarabun-regular-subset.woff2': woff2WithCodepoints(THAI_BLOCK.filter((c) => c !== 0x0e04)),
    }),
  };
  const r = runOn(files);
  assert.equal(r.status, 1, 'differing codepoint sets across paired faces must fail the gate');
  assert.match(r.out, /sarabun-regular-subset\.woff2/, 'the woff2 file is named');
  assert.match(r.out, /sarabun-regular-subset\.ttf/, 'the ttf file is named');
  assert.match(r.out, /U\+0E04/, 'the missing codepoint U+0E04 is named');
});

test('must-red: the planted U+0E04 pair-mismatch fixture passes if identity assertion is bypassed', () => {
  // Verifies that without pair identity assertion, checkFaceCoverage alone would pass this fixture
  // because U+0E04 is not present in PAGE. This proves the fixture actually exercises the new check.
  const required = classify(PAGE).required;
  const ttfCps = cmapCodepoints(ttfWithCodepoints(THAI_BLOCK));
  const woff2Cps = woff2Codepoints(woff2WithCodepoints(THAI_BLOCK.filter((c) => c !== 0x0e04)));
  const faceFailures = checkFaceCoverage([
    { file: 'fonts/sarabun-regular-subset.ttf', codepoints: ttfCps },
    { file: 'fonts/sarabun-regular-subset.woff2', codepoints: woff2Cps },
  ], required);
  assert.deepEqual(faceFailures, [], 'per-face coverage alone passes since U+0E04 is not required by PAGE');
});

test('the gate greens when paired woff2 and ttf have identical codepoint sets', () => {
  const r = runOn({
    'index.html': PAGE,
    ...fullFontSet(),
  });
  assert.equal(r.status, 0, 'identical paired faces covering required codepoints must pass');
  assert.match(r.out, /OK: all \d+ reachable Thai codepoint\(s\) are present/, 'full coverage reported');
});

test('checkInventory detects missing expected faces and unexpected readable fonts', () => {
  const invMissing = checkInventory(['fonts/sarabun-regular-subset.ttf']);
  assert.equal(invMissing.missing.length, 3);
  assert.ok(invMissing.missing.includes('sarabun-regular-subset.woff2'));
  assert.ok(invMissing.missing.includes('sarabun-bold-subset.ttf'));
  assert.ok(invMissing.missing.includes('sarabun-bold-subset.woff2'));

  const invUnexpected = checkInventory([
    ...EXPECTED_STEMS.flatMap((s) => [`fonts/${s}.woff2`, `fonts/${s}.ttf`]),
    'fonts/rogue.ttf',
    'fonts/unreadable.woff',
  ]);
  assert.deepEqual(invUnexpected.missing, []);
  assert.deepEqual(invUnexpected.unexpected, ['fonts/rogue.ttf'], 'unreadable .woff is ignored by unexpected check');
});

test('inventory check catches reviewer rename attack when a face is renamed and fails exiting 1 naming the missing face', () => {
  // Reviewer attack: sarabun-regular-subset.woff2 is renamed to sarabun-regular-subset-renamed.woff2
  // With filename-derived pairing, the renamed face simply vanished from pairing and passed with exit 0.
  // With explicit inventory check, it must exit non-zero naming the missing expected member.
  const files = fullFontSet();
  files['fonts/sarabun-regular-subset-renamed.woff2'] = files['fonts/sarabun-regular-subset.woff2'];
  delete files['fonts/sarabun-regular-subset.woff2'];
  const r = runOn({ 'index.html': PAGE, ...files });
  assert.equal(r.status, 1, 'renamed woff2 must fail the gate');
  assert.match(r.out, /expected font file sarabun-regular-subset\.woff2 is missing/, 'the missing expected face is named');
  assert.match(r.out, /sarabun-regular-subset-renamed\.woff2 matches no expected entry/, 'the unexpected renamed file is reported');
});

test('must-red: reviewer rename attack passed under filename-derived pairing when identity check had no matching pair', () => {
  // Under the old filename-derived pairing, pairFaces derived stems from existing filenames on disk.
  // When sarabun-regular-subset.woff2 was renamed, no pair had both .woff2 and .ttf with matching stems.
  // Thus pairFaces produced only the bold pair, checkPairIdentity found 0 diffs,
  // and checkFaceCoverage passed because PAGE requires only U+0E01/U+0E02/U+0E48 which all remaining faces cover.
  const oldDerivedPairFaces = (faces) => {
    const byStem = new Map();
    for (const f of faces) {
      const ext = path.extname(f.file);
      const stem = path.basename(f.file, ext);
      if (!byStem.has(stem)) byStem.set(stem, {});
      if (ext === '.woff2') byStem.get(stem).woff2 = f;
      if (ext === '.ttf') byStem.get(stem).ttf = f;
    }
    const pairs = [];
    for (const [stem, p] of byStem.entries()) {
      if (p.woff2 && p.ttf) {
        pairs.push({
          stem,
          woff2File: p.woff2.file,
          ttfFile: p.ttf.file,
          woff2Codepoints: p.woff2.codepoints,
          ttfCodepoints: p.ttf.codepoints,
        });
      }
    }
    return pairs;
  };

  const faces = [
    { file: 'fonts/sarabun-regular-subset-renamed.woff2', codepoints: new Set(THAI_BLOCK) },
    { file: 'fonts/sarabun-regular-subset.ttf', codepoints: new Set(THAI_BLOCK) },
    { file: 'fonts/sarabun-bold-subset.woff2', codepoints: new Set(THAI_BLOCK) },
    { file: 'fonts/sarabun-bold-subset.ttf', codepoints: new Set(THAI_BLOCK) },
  ];
  const pairs = oldDerivedPairFaces(faces);
  assert.equal(pairs.length, 1, 'only 1 pair formed under old logic');
  assert.equal(pairs[0].stem, 'sarabun-bold-subset');
  const pairFailures = checkPairIdentity(pairs);
  assert.deepEqual(pairFailures, [], 'zero identity failures under old logic');
  const required = classify(PAGE).required;
  const coverageFailures = checkFaceCoverage(faces, required);
  assert.deepEqual(coverageFailures, [], 'zero coverage failures since all faces cover PAGE');
});


