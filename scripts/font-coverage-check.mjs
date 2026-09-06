#!/usr/bin/env node
// Thai subset-coverage gate (gh#202). The owner ruled 2026-09-05 that a self-hosted Thai face lands
// as a SUBSET, not the full family, and named the downside in the same breath: a subset can miss a
// glyph no page uses today but tomorrow's copy does, and a missing Thai glyph does not throw — it
// renders as a dotted circle or a box, with every exit code still 0. That is the same silent class
// docs/agents/assets.md records for OG cards. This gate is the check that ruling requires: every
// Thai codepoint reachable in what this site SHIPS must be present in the shipped font's cmap.
//
// THE CORPUS IS dist/, NOT src/. The obligation was phrased as "user-facing strings in src/**", and
// that set is not ownable here: deciding which string literal a player sees is a parser's
// judgement, and it loses to a new component shape, a value composed at runtime, a string that
// reaches the DOM through a helper. Every one of those slips past silently and the gate goes green
// on an uncovered glyph — the exact failure it exists to stop. dist/ is a repo-owned SUPERSET
// instead: whatever ships is in there, no classification step, and over-coverage only ever demands
// MORE of the subset, which is the safe direction. The cost is that it needs a current build, which
// is why this gate is chained after `npm run build`, alongside the other dist-reading gates. Like
// its siblings it never runs a build itself — a rebuild here would invalidate the artifact the rest
// of CI grades.
//
// THE PARTITION KEY is the codepoint, split three ways, because "every codepoint in the corpus"
// would demand glyphs no font owes:
//   REQUIRED   U+0E00..U+0E7F, the Thai block. Every one must be in the cmap. This range is what
//              composes a Thai cluster: a base consonant, a vowel that sits above or below, and a
//              tone mark are SEPARATE codepoints, and the marks are precisely the ones that render
//              as a dotted circle when absent. Enumeration is per codepoint (for..of), never per
//              cluster, and the text is never normalized: U+0E33 has a compatibility decomposition
//              and normalizing would invent a demand for codepoints the copy never contained.
//   IGNORABLE  U+200B/200C/200D/00AD/2060/FEFF — the zero-width and format characters Thai copy
//              uses for word-break hints. A shaper drops these; a font owes them no glyph, so
//              demanding them would be a false red. Reported, never required.
//   OUT OF     everything else — Latin, digits, punctuation, emoji. The subset is a Thai face; the
//   SCOPE      CSS fallback stack in src/styles/tokens.css renders these.
//
// PLAYER NAMES ARE ATTACKER-OWNED AND THIS GATE DOES NOT COVER THEM. A player types any Unicode
// they like, so no subset can ever enumerate that input and no green here says otherwise. What
// actually handles it is the per-glyph fallback in `--font-sans` / `--font-display`: a codepoint
// the subset lacks falls through to the next family in the stack and finally to the system face.
// That line is printed on EVERY run, pass or fail, so the boundary is never inferred from silence.
//
// CEILING, and the input it cannot see: a static corpus reads text that EXISTS in the build. Thai
// composed at runtime — an Intl formatter asked for `th-TH-u-nu-thai` digits, a string assembled
// from parts none of which spell the result — is invisible to this and to any static scan.
// ponytail: no runtime instrumentation for that; add a headless pass only if a real miss appears.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FONT_EXT = new Set(['.ttf', '.otf', '.ttc', '.woff', '.woff2']);
const READABLE_EXT = new Set(['.ttf', '.otf']);
export const IGNORABLE = new Set([0x00ad, 0x200b, 0x200c, 0x200d, 0x2060, 0xfeff]);

export const isThai = (cp) => cp >= 0x0e00 && cp <= 0x0e7f;
export const fmt = (cp) => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;

// THE SEAM: pure set difference. Everything else in this file feeds it.
export function missing(fontCodepoints, corpusCodepoints) {
  const out = [];
  for (const cp of corpusCodepoints) if (!fontCodepoints.has(cp)) out.push(cp);
  return out.sort((a, b) => a - b);
}

const toChar = (digits, radix) => {
  const cp = Number.parseInt(digits, radix);
  return Number.isInteger(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
};

// Built bundles do not necessarily carry Thai as raw UTF-8: measured in this repo's own dist/,
// chunks emitted from some game modules spell it as backslash-u escapes. A scan that reads the bytes
// only would report zero Thai for those files and pass a font that covers nothing.
export function decodeEscapes(text) {
  return text
    .replace(/\\u\{([0-9a-fA-F]{1,6})\}/g, (_, h) => toChar(h, 16))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => toChar(h, 16))
    .replace(/&#[xX]([0-9a-fA-F]{1,6});/g, (_, h) => toChar(h, 16))
    .replace(/&#([0-9]{1,7});/g, (_, d) => toChar(d, 10));
}

export function classify(text) {
  const required = new Set();
  const ignorable = new Set();
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (isThai(cp)) required.add(cp);
    else if (IGNORABLE.has(cp)) ignorable.add(cp);
  }
  return { required, ignorable };
}

// cmap reader. Formats 4 (what a BMP-only Thai subset gets) and 12 are parsed; any other format is
// NAMED in the caller's output rather than skipped quietly, because an unread subtable would look
// exactly like a font with no coverage. Only Unicode encodings are unioned — a legacy Mac subtable
// maps the same byte values to different characters and would fabricate coverage.
export function cmapCodepoints(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (buffer.byteLength < 12) throw new Error('not a font: file is too short to hold an sfnt header');
  const version = view.getUint32(0);
  if (version === 0x74746366) throw new Error('not a readable font: sfnt collection (ttc) is unsupported');
  if (version !== 0x00010000 && version !== 0x4f54544f) {
    throw new Error(`not a readable font: sfnt version 0x${version.toString(16)} (a compressed woff/woff2 cannot be parsed here)`);
  }
  const numTables = view.getUint16(4);
  let cmapOffset = -1;
  for (let i = 0; i < numTables; i += 1) {
    const rec = 12 + i * 16;
    if (rec + 16 > buffer.byteLength) break;
    if (buffer.toString('ascii', rec, rec + 4) === 'cmap') cmapOffset = view.getUint32(rec + 8);
  }
  if (cmapOffset < 0) throw new Error('font has no cmap table: its coverage cannot be read');

  const codepoints = new Set();
  const unsupported = new Set();
  const subtables = view.getUint16(cmapOffset + 2);
  for (let i = 0; i < subtables; i += 1) {
    const rec = cmapOffset + 4 + i * 8;
    const platform = view.getUint16(rec);
    const encoding = view.getUint16(rec + 2);
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (!unicode) continue;
    const at = cmapOffset + view.getUint32(rec + 4);
    const format = view.getUint16(at);
    if (format === 4) readFormat4(view, at, codepoints);
    else if (format === 12) readFormat12(view, at, codepoints);
    else unsupported.add(format);
  }
  codepoints.unsupportedFormats = [...unsupported];
  return codepoints;
}

function readFormat4(view, at, out) {
  const segCount = view.getUint16(at + 6) / 2;
  const endAt = at + 14;
  const startAt = endAt + segCount * 2 + 2;
  const deltaAt = startAt + segCount * 2;
  const rangeAt = deltaAt + segCount * 2;
  for (let s = 0; s < segCount; s += 1) {
    const end = view.getUint16(endAt + s * 2);
    const start = view.getUint16(startAt + s * 2);
    if (start === 0xffff && end === 0xffff) continue;
    const delta = view.getInt16(deltaAt + s * 2);
    const rangeOffset = view.getUint16(rangeAt + s * 2);
    for (let cp = start; cp <= end; cp += 1) {
      let glyph;
      if (rangeOffset === 0) glyph = (cp + delta) & 0xffff;
      else {
        const gAt = rangeAt + s * 2 + rangeOffset + (cp - start) * 2;
        if (gAt + 2 > view.byteLength) continue;
        glyph = view.getUint16(gAt);
        if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
      }
      if (glyph !== 0) out.add(cp);
    }
  }
}

function readFormat12(view, at, out) {
  const groups = view.getUint32(at + 12);
  for (let g = 0; g < groups; g += 1) {
    const rec = at + 16 + g * 12;
    if (rec + 12 > view.byteLength) break;
    const start = view.getUint32(rec);
    const end = view.getUint32(rec + 4);
    const startGlyph = view.getUint32(rec + 8);
    for (let cp = start; cp <= end && cp <= 0x10ffff; cp += 1) {
      if (startGlyph + (cp - start) !== 0) out.add(cp);
    }
  }
}

function walk(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else if (entry.isFile()) found.push(full);
  }
  return found;
}

// The excluded set is not a list of extensions someone has to keep current — a file is excluded
// only by FAILING a strict UTF-8 decode, proven per file, and the count of those is printed. A new
// text format is therefore included by default rather than forgotten.
export function readCorpus(distRoot) {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const required = new Set();
  const ignorable = new Set();
  const fonts = [];
  let textFiles = 0;
  let binaryFiles = 0;
  for (const file of walk(distRoot)) {
    if (FONT_EXT.has(path.extname(file).toLowerCase())) {
      fonts.push(file);
      continue;
    }
    let text;
    try {
      text = decoder.decode(fs.readFileSync(file));
    } catch {
      binaryFiles += 1;
      continue;
    }
    textFiles += 1;
    const seen = classify(decodeEscapes(text));
    for (const cp of seen.required) required.add(cp);
    for (const cp of seen.ignorable) ignorable.add(cp);
  }
  return { required, ignorable, fonts, textFiles, binaryFiles };
}

function selftest() {
  assert.deepEqual(missing(new Set([0x0e01]), new Set([0x0e01, 0x0e31])), [0x0e31], 'an uncovered mark is reported');
  assert.deepEqual(missing(new Set([0x0e01, 0x0e31]), new Set([0x0e01])), [], 'a superset covers');
  const marks = classify(decodeEscapes('\\u0e01\\u0e31\\u200b'));
  assert.equal(marks.required.size, 2, 'escaped text decodes and a combining mark counts on its own');
  assert.ok(marks.ignorable.has(0x200b), 'a zero-width character is reported, not demanded');
  assert.equal(fmt(0x0e31), 'U+0E31');
  assert.throws(() => cmapCodepoints(Buffer.from('wOF2xxxxxxxx')), /not a readable font/, 'an unparseable font must throw, never read as empty coverage');
  console.log('font-coverage-check --selftest ok');
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--selftest')) return selftest();
  const distArg = argv.indexOf('--dist');
  const distRoot = distArg >= 0 ? path.resolve(argv[distArg + 1]) : path.join(ROOT, 'dist');
  const corpusOnly = argv.includes('--corpus');

  if (!fs.existsSync(distRoot)) {
    console.error(`::error::${distRoot} does not exist — this gate reads a built dist/ and never runs a build itself (that would invalidate the artifact the rest of CI grades). Run \`npm run build\` first.`);
    process.exit(1);
  }
  const corpus = readCorpus(distRoot);
  console.log(`corpus: ${corpus.required.size} distinct Thai codepoints (U+0E00..U+0E7F) reachable across ${corpus.textFiles} text file(s) under ${path.relative(ROOT, distRoot) || distRoot}`);
  console.log(`reported, not required: ${[...corpus.ignorable].sort((a, b) => a - b).map(fmt).join(' ') || 'none'} — zero-width and format characters a shaper drops`);
  console.log(`coverage gap, always: player names are ATTACKER-OWNED — a player can type any Unicode and no subset can enumerate that. The per-glyph CSS fallback stack (--font-sans / --font-display in src/styles/tokens.css) is what renders those, not this gate. Text composed at runtime is outside a static corpus too.`);
  console.log(`not read as text: ${corpus.binaryFiles} file(s) failed a strict UTF-8 decode`);

  // An empty corpus on a Thai-first site is a broken reader, not a covered subset. It reds.
  if (corpus.required.size === 0) {
    console.error('::error::no Thai codepoint was found anywhere in the build. On a Thai-first site that is a broken corpus reader, not a font that covers everything — refusing to report success.');
    process.exit(1);
  }
  if (corpusOnly) return;

  if (corpus.fonts.length === 0) {
    console.log('SKIP: this build ships no self-hosted font, so there is no subset that can rot. Every glyph is the system fallback stack today. This gate becomes live by itself the moment a font file appears under dist/.');
    return;
  }
  const readable = corpus.fonts.filter((f) => READABLE_EXT.has(path.extname(f).toLowerCase()));
  if (readable.length === 0) {
    console.error(`::error::this build ships ${corpus.fonts.length} font file(s) and this gate can read none of them (${corpus.fonts.map((f) => path.relative(distRoot, f)).join(', ')}). A compressed woff/woff2 and an sfnt collection cannot be parsed here, so the subset would ship UNCHECKED. Two honest ways out, and a twin is NOT one of them: (1) ship the uncompressed .ttf/.otf as the REAL, referenced face and accept its transfer size — then this gate reads the same bytes the browser downloads; (2) teach this gate to read woff2 (its body is brotli, which node ships, and cmap is not one of the two tables woff2 transforms) so it reads the shipped file directly. A side-by-side .ttf twin measures a file no player ever fetches: the moment the two are subset differently this gate goes green on coverage the page does not have, and an UNREFERENCED twin under public/ also reds scripts/public-orphan-check.mjs, whose green requires every shipped file's basename to appear as a bound token somewhere in src/.`);
    process.exit(1);
  }
  const font = new Set();
  const unsupported = new Set();
  for (const file of readable) {
    let cps;
    try {
      cps = cmapCodepoints(fs.readFileSync(file));
    } catch (err) {
      console.error(`::error::${path.relative(distRoot, file)}: ${err.message}`);
      process.exit(1);
    }
    for (const cp of cps) font.add(cp);
    for (const f of cps.unsupportedFormats) unsupported.add(f);
  }
  console.log(`font: ${font.size} codepoint(s) mapped across ${readable.map((f) => path.relative(distRoot, f)).join(', ')}`);
  if (unsupported.size > 0) console.log(`coverage gap: cmap subtable format(s) ${[...unsupported].join(', ')} were not read`);
  // Disclosed, never inferred from silence: which shipped font files this run did NOT open. A
  // @font-face listing a woff2 first and a .ttf as fallback references both, so the orphan gate is
  // green, the browser fetches the woff2, and everything below is measured on the .ttf. That is a
  // real reading of the wrong file, and it is invisible unless the unread ones are named.
  // ponytail: printed, not red -- escalating would gate a font nobody has landed yet, and the
  // ruling on whether an unread shipped face should FAIL belongs to whoever lands it.
  const unread = corpus.fonts.filter((f) => !readable.includes(f)).map((f) => path.relative(distRoot, f));
  if (unread.length > 0) {
    console.log(`coverage gap: ${unread.length} shipped font file(s) were NOT read by this gate — ${unread.join(', ')}. If the browser loads one of those instead of what was read above, this run measured a file that is not the product.`);
  }

  const gaps = missing(font, corpus.required);
  if (gaps.length > 0) {
    console.error(`::error::the shipped subset is missing ${gaps.length} Thai codepoint(s) this build's own text contains: ${gaps.map(fmt).join(' ')} — each renders as a dotted circle or a box with no error anywhere.`);
    process.exit(1);
  }
  console.log(`OK: all ${corpus.required.size} reachable Thai codepoint(s) are present in the shipped subset`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
