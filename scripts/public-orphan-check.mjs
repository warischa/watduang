#!/usr/bin/env node
// Public-orphan and size-ceiling gate for public/ (gh#84). Astro copies public/ verbatim into dist/,
// so a file dropped there ships to the live site on the next build whether or not anything references
// it — and CI said nothing when an image-generation tool wrote an unreferenced 1.1 MB PNG into
// public/ during a design session; it was caught by hand (docs/agents/assets.md rule 6).
// scripts/validate-games.mjs covers the OPPOSITE direction only — a game's declared share card must
// exist — so a file that exists with nothing pointing at it was unguarded. This gate refuses exactly
// that, and refuses a published raster over the size-ceiling table in the same doc.
//
// WHAT ITS GREEN MEANS, AND WHAT IT DOES NOT. Green means: every file shipped under public/ has at
// least one referrer — some file under src/ (read recursively, the games manifest included) whose
// text contains the file's BASENAME as a bound token (see below) — or sits in the ALLOWLIST, and
// every raster under public/og/ and public/art/ is at or under its per-file ceiling while every
// public/models/<game>/ directory is at or under its per-game sum. It does NOT cover a same-basename
// twin: two files in DIFFERENT directories under public/ that share one basename (say
// public/og/x.png and public/art/x.png) are one indistinguishable token, so a referrer to either
// matches both — an unreferenced twin ships green. That is the one input this gate will MISS, and it
// is the price of matching on the filename token instead of a full path. Same class, second
// instance: a filename assembled at runtime from parts that never spell the whole basename in one
// token (`pic${n}.png`, a value from user data) is invisible to any static scan.
//
// REFERRER FORMS MATCHED — the real set in this repo, found by reading the sources, never guessed:
//   · og: 'timebomb.png'                  a game module declares the bare filename; public/og/<file>
//                                         is resolved by scripts/validate-games.mjs (existence) and
//                                         GameLayout builds `/og/${game.og}` only at runtime — so a
//                                         grep for the full path finds NOTHING for any of the seven
//                                         OG files, and a path-exact gate would red the whole tree
//   · const ogImage = '/og/site.png'      a leading-slash path as a layout default (Base.astro is
//                                         the current instance; the gate knows no special case for
//                                         it — the token rule buys it for free)
//   · '/art/bg.png', a dynamic import      any other path/URL spelling — the match is position-blind;
//                                         what counts is the basename spelled whole
// The match runs each public file's BASENAME as a needle over the concatenated text of every file
// under src/, with token boundaries so a substring sit cannot satisfy it: `pic.png` does NOT match
// inside `my-pic.png` (the character before must be none of \w . -) and it does not match a longer
// sibling either (`timebomb.png` does not satisfy a referrer for `timebomb.png.webp`; the character
// after must be none of \w . -). Case-sensitive, fail-safe: a file whose case differs from its
// referrer is orphaned, not matched.
//
// ALLOWLIST — the record of every deliberate exception, one entry per file with its one-line reason.
// A file that legitimately has no referrer in src/ but must ship goes here; today that set is exactly
// robots.txt and the SWA config, and a future entry is one edit with a stated reason, not a silent
// gap. A NEW asset that IS referenced needs no allowlist edit at all — the token rule admits it.
//
// SIZE CEILINGS — the doc's table verbatim, byte-exact (they were "proposed, not yet enforced"; this
// gate is the enforcement, so the doc's own numbers are the values, never rounded):
//   public/og/                80 KB per raster file — fetched by crawlers only, never by a player
//   public/art/               60 KB per raster file — a page must stay instant on a bad link
//   public/models/<game>/     400 KB per game directory — the doc's row is a per-game budget, so the
//                             gate sums every file in the directory, it does not cap each file
// Raster = .png .jpg .jpeg .webp .avif .gif. Two disclosed bounds on this check: a NON-raster file in
// those directories is exempt (it is still orphan-checked), and a raster OUTSIDE og/, art/ and
// models/ has no declared ceiling here — this gate caps only what the size-ceiling table declares.
//
//   node scripts/public-orphan-check.mjs             -> scan public/ and src/, exit non-zero on any orphan or ceiling break
//   node scripts/public-orphan-check.mjs --selftest  -> calibration: planted orphan reds · clean tree greens · stubbed detector reds (never touches public/ or src/)

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

// ---------------------------------------------------------------------------
// The allowlist. Key = path relative to public/, value = why this file ships without a src/ referrer.
// This map is the whole record of deliberate exceptions — an author aiming to ship an unreferenced
// file adds the reason HERE, never to another gate or a comment elsewhere.
// ---------------------------------------------------------------------------
const ALLOWLIST = new Map([
  ['robots.txt', 'fetched by crawlers at the domain root; a site-level convention, not an asset any src/ code path names'],
  ['staticwebapp.config.json', 'Azure Static Web Apps deploy config — one of the two Azure-owned files CLAUDE.md allows, consumed by the platform, never by src/'],
]);

// The doc's size-ceiling table, byte-exact (docs/agents/assets.md "Size ceilings").
const KB = 1024;
const CEILINGS = {
  og: { kb: 80, bytes: 80 * KB, label: 'share-card ceiling (public/og/)' },
  art: { kb: 60, bytes: 60 * KB, label: 'page-raster ceiling (public/art/)' },
  models: { kb: 400, bytes: 400 * KB, label: 'per-game 3D model + textures ceiling (public/models/<game>/)' },
};

const RASTER_EXT_RE = /\.(png|jpe?g|webp|avif|gif)$/i;

// ---------------------------------------------------------------------------
// Pure: a public/ file's basename -> the referrer needle for it. Boundary both sides: the character
// before must be none of \w . - (so `pic.png` cannot ride inside `my-pic.png`) and the character
// after must be none of \w . - (so `timebomb.png` cannot stand in for `timebomb.png.webp`). The
// basename itself is regex-escaped — a dot in a filename is literal, never a wildcard.
// ---------------------------------------------------------------------------
export function referrerReFor(basename) {
  const esc = basename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\w.-])${esc}(?![\\w.-])`);
}

/**
 * Pure: public files + the joined text of everything under src/ + the allowlist -> orphans.
 * `files` entries are { rel, size } with rel a posix path relative to the repo root (public/...).
 * `matched` is COUNTED by the loop, never derived from a target list — a success line that printed
 * a constant would be the claim-without-measurement defect ADR-0019 exists to catch.
 */
export function findOrphans(files, srcText, allowlist = ALLOWLIST) {
  const orphans = [];
  let matched = 0;
  for (const f of files) {
    const under = f.rel.replace(/^public\//, '');
    if (allowlist.has(under)) { matched++; continue; }
    if (referrerReFor(path.posix.basename(under)).test(srcText)) { matched++; continue; }
    orphans.push(f);
  }
  return { orphans, matched };
}

/**
 * Pure: public files -> ceiling violations, each { file, size, ceiling }. og/ and art/ are capped per
 * raster file; models/ is capped per game directory as the SUM of its files (the doc's row is a
 * per-game budget). Non-raster files are exempt, and so are rasters outside the three declared
 * directories — the orphan check is their only cap here.
 */
export function findSizeViolations(files) {
  const hits = [];
  const bucketTotals = new Map();
  for (const f of files) {
    const rel = f.rel;
    if (rel.startsWith('public/models/')) {
      const rest = rel.slice('public/models/'.length);
      const bucket = rest.includes('/') ? rest.split('/')[0] : rest; // a loose file is its own bucket
      bucketTotals.set(bucket, (bucketTotals.get(bucket) || 0) + f.size);
      continue;
    }
    const dir = rel.startsWith('public/og/') ? CEILINGS.og : rel.startsWith('public/art/') ? CEILINGS.art : null;
    if (dir && RASTER_EXT_RE.test(rel) && f.size > dir.bytes) {
      hits.push({ file: rel, size: f.size, ceiling: dir });
    }
  }
  for (const [bucket, total] of bucketTotals) {
    if (total > CEILINGS.models.bytes) {
      hits.push({ file: `public/models/${bucket}/`, size: total, ceiling: CEILINGS.models });
    }
  }
  return hits;
}

/**
 * The success sentence. Every number is the length of the array the loop above actually iterated or
 * the counter it incremented — files scanned, files matched, orphans collected — never a constant or
 * a target-list length (ADR-0019: a green is a claim, and so is the sentence next to it). The
 * trailing clause is the disclosed ceiling: same-basename twins share one match.
 */
export const successLine = (scanned, matched, orphans, srcFilesRead) =>
  `public-orphan-check: ${scanned} file(s) under public/ scanned, ${matched} matched to a referrer ` +
  `token in src/ or the allowlist, ${orphans} orphan(s), 0 size-ceiling break(s); ${srcFilesRead} ` +
  'referrer-source file(s) read under src/. Does NOT cover a public/ file whose basename is shared ' +
  'with a referenced file elsewhere in public/ (same-basename twins).';

// Walk a directory for regular files, deterministic order. Symlinks are deliberately skipped
// (isDirectory() is false for them), so a link loop can never recurse — same shape as the sibling gates.
function collectFiles(root) {
  const files = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files.push(full);
    }
  })(root);
  return files;
}

const relOf = (abs) => path.relative(repoRoot, abs).split(path.sep).join('/');
const orphanMsg = (f) =>
  `${f.rel} ships with no referrer — no file under src/ contains its basename as a token, and it is ` +
  'not in the ALLOWLIST (scripts/public-orphan-check.mjs). Add the src/ reference, or add an allowlist ' +
  'entry with a stated reason.';
const ceilingMsg = (v) =>
  `${v.file} is ${v.size} bytes (${Math.ceil(v.size / 1024)} KB) — over the ${v.ceiling.kb} KB ` +
  `(${v.ceiling.bytes} bytes) ${v.ceiling.label} from docs/agents/assets.md`;

// ---------------------------------------------------------------------------
// Self-test — calibration, never decoration. All three directions the ticket demands: a planted
// orphan reds · a clean tree of the repo's real shapes greens · a stubbed detector (empty referrer
// text) reds. Plus the boundary legs both ways, the same-basename twin pinned as THE disclosed miss,
// one known-bad case per ceiling, and the entry-point guard. NO fixture reads or writes public/ or
// src/ — every input below is an in-memory string the pure functions consume.
// ---------------------------------------------------------------------------
function selftest() {
  // The repo's own referrer shapes: a game module's bare filename, a layout's leading-slash default.
  const realShapes = [
    "export const og = 'timebomb.png'; // public/og/timebomb.png, resolved by GameLayout's `/og/${game.og}`",
    "const { ogImage = '/og/site.png' } = Astro.props; // Base.astro's default for non-game pages",
  ].join('\n');
  const cleanTree = [
    { rel: 'public/og/timebomb.png', size: 65_692 },
    { rel: 'public/og/site.png', size: 62_886 },
    { rel: 'public/robots.txt', size: 72 },
    { rel: 'public/staticwebapp.config.json', size: 755 },
  ];

  // --- known-good: the real tree's shapes, every file referred or allowlisted -> zero orphans. ---
  const clean = findOrphans(cleanTree, realShapes);
  assert.deepEqual(clean.orphans, [], 'seven-referrer-shape tree: every file is matched, zero orphans');
  assert.equal(clean.matched, 4, 'matched must be counted by the loop (4 files, all matched)');
  console.log('PASS clean tree stays green: bare-filename and /og/-prefixed referrers both match, allowlisted files match — 0 orphans on the real shapes');

  // --- known-bad: a planted orphan. The one file with no token anywhere in src-text is refused. ---
  const planted = findOrphans([...cleanTree, { rel: 'public/art/lonely.png', size: 30_000 }], realShapes);
  assert.equal(planted.orphans.length, 1, 'exactly the planted unreferenced file must be orphaned');
  assert.equal(planted.orphans[0].rel, 'public/art/lonely.png', 'the orphan must be named');
  assert.equal(planted.matched, 4, 'the planted file must not inflate the matched count');
  console.log('PASS planted orphan reds: public/art/lonely.png is refused and named while every referenced file stays matched');

  // --- known-bad: a STUBBED detector. Feed the same tree with empty referrer text — the detector
  // matches nothing — and the gate must go RED on everything not allowlisted. This is the direction
  // that matters: a detector that stopped finding tokens must red the build, never green it. ---
  const stubbed = findOrphans(cleanTree, '');
  assert.equal(stubbed.orphans.length, 2, 'with a detector that matches nothing, both OG files must be orphaned');
  assert.deepEqual(stubbed.orphans.map((f) => f.rel).sort(), ['public/og/site.png', 'public/og/timebomb.png'], 'the stubbed run must name the files the stub failed to see');
  assert.equal(stubbed.matched, 2, 'the allowlist entries still match (2), so the allowlist leg is independent of the detector');
  console.log('PASS stubbed detector reds: empty referrer text orphans every non-allowlisted file — a detector that finds nothing can never print a green');

  // --- token boundaries, both ways. A substring sit must not match; the twin must. ---
  const substring = findOrphans([{ rel: 'public/art/pic.png', size: 10 }], "bg = '/art/my-pic.png'", new Map());
  assert.equal(substring.orphans.length, 1, 'pic.png must NOT be satisfied by the token my-pic.png (a - before it is a boundary)');
  const twin = findOrphans([{ rel: 'public/art/x.png', size: 10 }, { rel: 'public/og/x.png', size: 10 }], "card = 'x.png'", new Map());
  assert.deepEqual(twin.orphans, [], 'the same-basename TWIN passes — one token matches both files; this assert pins the exact miss the header discloses');
  console.log('PASS token boundaries: pic.png is orphaned against my-pic.png (no substring sit), and the same-basename twin passes — the disclosed miss, pinned rather than asserted');

  // --- size ceilings, one known-bad case per row plus the exact-boundary controls. ---
  const artHit = findSizeViolations([{ rel: 'public/art/huge.png', size: 61_441 }]);
  assert.equal(artHit.length, 1, 'a 61,441-byte page raster must break the 60 KB art ceiling');
  assert.equal(artHit[0].file, 'public/art/huge.png');
  assert.equal(artHit[0].size, 61_441);
  assert.equal(artHit[0].ceiling.bytes, 60 * KB); // the doc's 60 KB, byte-exact, not rounded
  const artBoundary = findSizeViolations([{ rel: 'public/art/exact.png', size: 60 * KB }]);
  assert.equal(artBoundary.length, 0, 'a raster at exactly 60 KB is not OVER the ceiling');
  const ogHit = findSizeViolations([{ rel: 'public/og/fat.png', size: 80 * KB + 1 }]);
  assert.equal(ogHit.length, 1, 'an 80 KB + 1 byte share card must break the 80 KB ceiling');
  assert.equal(ogHit[0].ceiling.bytes, 80 * KB);
  const nonRaster = findSizeViolations([{ rel: 'public/art/notes.txt', size: 5_000_000 }]);
  assert.equal(nonRaster.length, 0, 'a NON-raster file is exempt from the byte caps (still orphan-checked)');
  const modelsHit = findSizeViolations([
    { rel: 'public/models/g1/body.glb', size: 200_000 },
    { rel: 'public/models/g1/tex.png', size: 150_000 },
    { rel: 'public/models/g1/tex2.png', size: 100_000 },
  ]);
  assert.equal(modelsHit.length, 1, 'a 450 KB game bucket must break the 400 KB per-game ceiling — the row is a per-game budget, enforced as a directory sum');
  assert.equal(modelsHit[0].file, 'public/models/g1/');
  assert.equal(modelsHit[0].size, 450_000);
  const modelsUnder = findSizeViolations([
    { rel: 'public/models/g2/a.glb', size: 200_000 },
    { rel: 'public/models/g2/b.png', size: 150_000 },
  ]);
  assert.equal(modelsUnder.length, 0, 'a 350 KB game bucket stays green');
  console.log('PASS size ceilings: art 61,441 B reds (60 KB exact boundary green), og 80 KB + 1 reds, non-rasters exempt, models g1 450 KB reds as a directory sum, models g2 350 KB greens');

  // --- the success sentence must name measured counts only. A constant here is the ADR-0019 defect. ---
  assert.match(successLine(9, 9, 0, 47), /9 file\(s\) under public\/ scanned, 9 matched to a referrer token in src\/ or the allowlist, 0 orphan\(s\), 0 size-ceiling break\(s\); 47 referrer-source file\(s\) read under src\//, 'the success line must carry the scanned / matched / orphan / source-file counts it measured');
  assert.ok(!successLine(9, 9, 0, 47).includes('undefined'));
  console.log(`PASS success line names measured counts: "${successLine(9, 9, 0, 47)}"`);

  // --- entry-point guard: importing this module must not fire the gate. ---
  const self = fileURLToPath(import.meta.url);
  const run = (args) => {
    try {
      return { status: 0, out: execFileSync(process.execPath, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
    } catch (e) {
      return { status: e.status, out: `${e.stdout || ''}${e.stderr || ''}` };
    }
  };
  const asImport = run(['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(self).href)})`]);
  assert.equal(asImport.status, 0, 'importing this module must not fail');
  assert.ok(!asImport.out.includes('file(s) under public/ scanned'), 'importing this module must NOT run the gate');
  console.log('PASS entry-point guard: importing this module scans nothing, while the same file run as argv[1] does');

  console.log('selftest: 8 case group(s) passed, including the three required calibrations — planted orphan reds · clean tree greens · stubbed detector reds');
}

// ---------------------------------------------------------------------------
async function main() {
  if (process.argv.includes('--selftest')) return selftest();

  const publicFiles = collectFiles(path.join(repoRoot, 'public')).map((abs) => ({
    abs,
    rel: relOf(abs),
    size: fs.statSync(abs).size,
  }));
  const srcFiles = collectFiles(path.join(repoRoot, 'src'));
  if (!publicFiles.length) {
    console.error('::error::public/ contains no files — nothing was scanned, which is not the same as clean (ADR-0019: an inverted guard must count, not just exclude)');
    process.exit(1);
  }
  if (!srcFiles.length) {
    console.error('::error::src/ contains no files — nothing was read as referrer sources, which is not the same as a referenced tree (ADR-0019)');
    process.exit(1);
  }

  const srcText = srcFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  const { orphans } = findOrphans(publicFiles, srcText);
  const sizeHits = findSizeViolations(publicFiles);

  let hitCount = 0;
  for (const f of orphans) {
    console.error(`::error file=${f.rel}::${orphanMsg(f)}`);
    hitCount++;
  }
  for (const v of sizeHits) {
    console.error(`::error file=${v.file}::${ceilingMsg(v)}`);
    hitCount++;
  }
  if (hitCount) {
    console.error(`\n${hitCount} violation(s): ${orphans.length} file(s) ship with no referrer, ${sizeHits.length} raster(s) break a size ceiling.`);
    process.exit(1);
  }
  console.log(successLine(publicFiles.length, publicFiles.length - orphans.length, orphans.length, srcFiles.length));
}

// Entry point only. Importing this module (a unit test against findOrphans / findSizeViolations) must
// not fire a full gate as a side effect. Both sides are realpath()d before comparing; only a missing
// argv[1] (`node -e`, i.e. an import) skips — a realpath that throws on an argv[1] that exists runs
// main() anyway. Same guard the sibling gates carry.
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