#!/usr/bin/env node
// Bundle-freeze gate (gh#129): the reachable JS bundle set and its total weight must not drift
// silently. THE INVARIANT: walking every dist/**/*.html for a `<script src="/_astro/...js">` tag,
// then following each chunk's own `from"./X.js"` / `import("./X.js")` references (static and
// dynamic) to closure, the set of REACHABLE chunks — keyed by hash-stripped basename
// (`short-stick.DvGxT-5v.js` -> `short-stick.js`, the build hash stripped so a content-only
// rebuild doesn't false-positive) — must equal BASELINE_BASENAMES exactly, and their summed bytes
// must sit within +/-5% of BASELINE_TOTAL_BYTES. Either direction is a red: a new basename with no
// byte change is still a red (a module started shipping that wasn't before, or the reverse — one
// stopped), and a shrink past -5% is exactly as red as a +5% growth, because a large drop can mean
// a game's code silently stopped bundling.
//
// RE-BASELINE IS THE INTENDED SIGNAL. When a change deliberately adds/removes/renames a shipped
// module or meaningfully grows one (a new game, a new tool, a real feature), this gate is SUPPOSED
// to go red — that is not a bug to route around. The fix is a one-line edit to BASELINE_BASENAMES
// and/or BASELINE_TOTAL_BYTES in this file, done deliberately, in the same PR, with the new numbers
// re-measured from a real build — never widened to make an unrelated red go away.
//
// DISCLOSED CEILING: derivation reads only the HTML <script src> tags and each chunk's own import
// lines. If astro.config.mjs's `assetsInlineLimit` for .js is ever relaxed back to Vite's default
// (currently forced to `false` for every .js file — see astro.config.mjs — specifically so CSP's
// lack of 'unsafe-inline' cannot silently swallow a page script), a small chunk could get INLINED
// into the HTML instead of linked via <script src>. This gate has no view into inlined code; it
// would simply stop seeing that chunk, which reads as a false "removed" red rather than the true
// "still shipping, just relocated" story — a human reading that red must check assetsInlineLimit
// first, not assume the module vanished.
//
// Gate reads dist/ ONLY — it never runs `astro build`. A selftest that rebuilt dist mid-CI-run
// would invalidate the very artifact the rest of the pipeline is grading (this repo has shipped
// that bug before); dist must already exist when this script runs.
//
//   node scripts/bundle-freeze-check.mjs             -> read dist/, exit non-zero on set or byte drift
//   node scripts/bundle-freeze-check.mjs <repoRoot>  -> read <repoRoot>/dist/ instead (calibration use)
//   node scripts/bundle-freeze-check.mjs --selftest  -> calibration on in-memory/tmpdir fixtures only

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

// Measured on the real dist/ (2026-08-28, `npm run build` after registering freeze-tap): 20 reachable
// chunks, 101094 total bytes. Both legs of the previous baseline fired and both were expected: the SET
// leg on the new `freeze-tap.js` basename, and the TOTAL leg because +13719 bytes is far outside a
// +/-4.4KB band. Re-baselined, not widened — the band stays +/-5%.
// Where that growth went: almost all of it is the freeze-tap.js chunk itself (module + canvas effect
// layer, ADR-0046 keeping a reduced-motion path rather than deleting the motion); a small remainder is
// growth inside _id_.astro_astro_type_script_index_0_lang.js, whose import.meta.glob map gained a
// freeze-tap entry. Re-derive the split rather than trusting a number here —
// `ls -l dist/_astro/freeze-tap.*.js` — because an exact byte count written into a comment goes stale
// the moment the module is edited: the first version of this comment attributed the whole delta to the
// game module (wrong, a REFUTE pass caught it), and the corrected version named a chunk size that a
// +4-line fix invalidated 20 minutes later. The pinned constants below are the only numbers here that
// are meant to be exact, and the gate itself is what keeps them honest.
// WHAT THIS NUMBER IS, because it is easy to misread as a user cost: it is the UNION over every page,
// following lazy imports, so it is CDN bytes and not what any visitor downloads. A game page statically
// loads ~13.9 KB (a fortune page ~9.2 KB, which skips the setup panel), and the game's own chunk is
// fetched only when the island's `watduang:start` handler awaits it — one dynamic importer, zero static
// importers, zero modulepreload, verified against this dist/. So registering more games does NOT make
// playing one game heavier.
// SIZING NOTE for whoever adds game 3 onward: nine more ports at this size take this total past 200 KB.
// That is a real number to re-baseline deliberately rather than reflexively, but it is an aggregate —
// do not turn it into a per-visitor data-cost argument, and do not use it on its own to argue for a
// shared harness over independent modules.
// This gate pins the chunk SET exactly and the total loosely; it is not a guard against one specific
// deletion being reverted.
// Re-derive both with the same walk on any deliberate bundle change —
// see "RE-BASELINE IS THE INTENDED SIGNAL" above.
const BASELINE_BASENAMES = [
  'LeaveConfirm.astro_astro_type_script_index_0_lang.js',
  'PlayerSetup.astro_astro_type_script_index_0_lang.js',
  'ToolNameEntry.astro_astro_type_script_index_0_lang.js',
  '_arm-gate.js',
  '_el.js',
  '_id_.astro_astro_type_script_index_0_lang.js',
  '_round-start.js',
  'daily-fortune.js',
  'freeze-tap.js',
  'draw.astro_astro_type_script_index_0_lang.js',
  'love-match.js',
  'name-list.js',
  'number.astro_astro_type_script_index_0_lang.js',
  'pick-loser.js',
  'player-select.js',
  'short-stick.js',
  'siamsi.js',
  'team.astro_astro_type_script_index_0_lang.js',
  'timebomb.js',
  'wheel.astro_astro_type_script_index_0_lang.js',
].sort();
const BASELINE_TOTAL_BYTES = 101094;
const BAND = 0.05; // +/-5%

const HTML_SCRIPT_RE = /<script[^>]+src="\/_astro\/([^"]+\.js)"/g;
const CHUNK_IMPORT_RE = /(?:from\s*"\.\/([^"]+\.js)"|import\(\s*"\.\/([^"]+\.js)"\s*\))/g;

// Hash-stripped basename: the build-hash dot-segment immediately before .js is dropped
// (`short-stick.DvGxT-5v.js` -> `short-stick.js`). A basename with only one dot before .js
// (no hash segment present) is returned unchanged.
export function stripHash(basename) {
  return basename.replace(/\.[^.]+\.js$/, '.js');
}

// Walk a directory for regular files matching one of exts, deterministic order. Symlinks are
// skipped (isDirectory() is false for them) — same shape as the sibling dist-walking gates.
function collectFiles(root, exts) {
  const files = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && exts.some((e) => entry.name.endsWith(e))) files.push(full);
    }
  })(root);
  return files;
}

/**
 * Pure: given the set of HTML file texts and a Map of chunk-basename -> chunk source text,
 * compute the reachable chunk basename set by closure — HTML <script src> tags seed the queue,
 * then each visited chunk's own static `from"./X.js"` and dynamic `import("./X.js")` references
 * are followed. A referenced basename absent from `chunkTexts` is recorded as missing (never
 * silently dropped — a broken reference is exactly the kind of drift this gate exists to catch).
 */
export function reachableChunks(htmlTexts, chunkTexts) {
  const reached = new Set();
  const queue = [];
  const missing = new Set();
  const seed = (name) => {
    if (!reached.has(name)) { reached.add(name); queue.push(name); }
  };
  for (const html of htmlTexts) {
    let m;
    HTML_SCRIPT_RE.lastIndex = 0;
    while ((m = HTML_SCRIPT_RE.exec(html))) seed(m[1]);
  }
  while (queue.length) {
    const cur = queue.pop();
    const text = chunkTexts.get(cur);
    if (text === undefined) { missing.add(cur); continue; }
    let m;
    CHUNK_IMPORT_RE.lastIndex = 0;
    while ((m = CHUNK_IMPORT_RE.exec(text))) seed(m[1] || m[2]);
  }
  return { reached, missing };
}

/**
 * Pure: reachable basenames + a basename -> byte-size Map -> { basenames (hash-stripped, sorted,
 * deduped), totalBytes }. A hash-only rename collapses to the same stripped basename and is
 * counted once, matching how BASELINE_BASENAMES is keyed.
 */
export function summarize(reachedNames, sizeOf) {
  const strippedSet = new Set();
  let totalBytes = 0;
  for (const name of reachedNames) {
    strippedSet.add(stripHash(name));
    totalBytes += sizeOf(name);
  }
  return { basenames: [...strippedSet].sort(), totalBytes };
}

/**
 * Pure: compares a measured { basenames, totalBytes } against a pinned baseline. Returns
 * { setOk, added, removed, byteOk, lowBound, highBound }. Both directions of the byte band are
 * red: below lowBound (something shrank/stopped shipping) and above highBound (something grew)
 * are equally violations.
 */
export function evaluate(measured, baselineBasenames, baselineTotalBytes, band = BAND) {
  const baseSet = new Set(baselineBasenames);
  const measSet = new Set(measured.basenames);
  const added = measured.basenames.filter((b) => !baseSet.has(b));
  const removed = baselineBasenames.filter((b) => !measSet.has(b));
  const setOk = added.length === 0 && removed.length === 0;
  const lowBound = baselineTotalBytes * (1 - band);
  const highBound = baselineTotalBytes * (1 + band);
  const byteOk = measured.totalBytes >= lowBound && measured.totalBytes <= highBound;
  return { setOk, added, removed, byteOk, lowBound, highBound };
}

// ---------------------------------------------------------------------------
// Self-test — 4 real assertion legs on in-memory/tmpdir fixtures only, never dist/.
//   1. known-good: pinned baseline against itself -> passes both the set and the byte band.
//   2. added chunk: a new reachable basename absent from baseline -> exact-set red.
//   3. inflated bytes: same set, weight pushed past +5% -> byte-band red (set stays green).
//   4. hash-only rename: basename's hash segment changes, stripped name identical -> still PASSES
//      (the anti-flap leg — a content-identical rebuild must not false-positive the set).
// ---------------------------------------------------------------------------
function selftest() {
  const fixtureBasenames = ['a.js', 'b.js'];
  const fixtureBytes = 1000;
  const sizeOf = (name) => (name.startsWith('a.') ? 600 : 400);

  // --- 1. known-good: the pinned baseline measured against itself. ---
  const good = summarize(['a.H1abcdef.js', 'b.H2ghijkl.js'], sizeOf);
  const goodEval = evaluate(good, fixtureBasenames, fixtureBytes);
  assert.deepEqual(good.basenames, fixtureBasenames, 'hash-stripped basenames must match the pinned set');
  assert.equal(good.totalBytes, fixtureBytes);
  assert.ok(goodEval.setOk && goodEval.byteOk, 'a clean measurement against its own baseline must pass both legs');
  console.log('PASS known-good: measured set and bytes equal to a pinned baseline of themselves -> both legs pass');

  // --- 2. added chunk: a THIRD reachable chunk with a basename not in the baseline. ---
  const withAdded = summarize(['a.H1abcdef.js', 'b.H2ghijkl.js', 'c.H3mnopqr.js'], (n) => (n.startsWith('c.') ? 50 : sizeOf(n)));
  const addedEval = evaluate(withAdded, fixtureBasenames, fixtureBytes);
  assert.equal(addedEval.setOk, false, 'a new basename absent from the baseline must red the exact-set leg');
  assert.deepEqual(addedEval.added, ['c.js'], 'the added basename must be named');
  console.log('PASS added chunk (new source module -> new basename): exact-set leg reds, byte band uninvolved as the spec requires');

  // --- 3. inflated bytes: same two basenames, weight pushed past the +5% band. ---
  const inflated = summarize(['a.H1abcdef.js', 'b.H2ghijkl.js'], (n) => (n.startsWith('a.') ? 600 + 100 : 400)); // 1100/1000 = +10%
  const inflatedEval = evaluate(inflated, fixtureBasenames, fixtureBytes);
  assert.equal(inflatedEval.setOk, true, 'the set itself is unchanged, so the set leg must stay green');
  assert.equal(inflatedEval.byteOk, false, 'a +10% total must red the +/-5% byte band');
  console.log(`PASS inflated bytes (grown module -> byte red): total ${inflated.totalBytes} exceeds high bound ${inflatedEval.highBound}, set leg stays green`);

  // --- 4. hash-only rename: same modules, hash segment changes, stripped basename identical. ---
  const renamed = summarize(['a.ZZ999999.js', 'b.YY888888.js'], sizeOf);
  const renamedEval = evaluate(renamed, fixtureBasenames, fixtureBytes);
  assert.deepEqual(renamed.basenames, fixtureBasenames, 'a hash-only rename must collapse to the same stripped basenames');
  assert.ok(renamedEval.setOk && renamedEval.byteOk, 'a hash-only rebuild rename must PASS both legs — anti-flap');
  console.log('PASS hash-only rename (anti-flap leg): a rebuilt hash with identical stripped basenames and bytes still passes');

  // --- closure-following sanity: a chunk reached only via a chunk-to-chunk import, both forms. ---
  const html = ['<script type="module" src="/_astro/entry.HASH1.js"></script>'];
  const chunks = new Map([
    ['entry.HASH1.js', 'import{x}from"./static-dep.HASH2.js";const y=()=>import("./dynamic-dep.HASH3.js");'],
    ['static-dep.HASH2.js', 'export const x=1;'],
    ['dynamic-dep.HASH3.js', 'export default 2;'],
  ]);
  const { reached, missing } = reachableChunks(html, chunks);
  assert.deepEqual([...reached].sort(), ['dynamic-dep.HASH3.js', 'entry.HASH1.js', 'static-dep.HASH2.js'], 'closure must follow both static "from" and dynamic import() references from the HTML-seeded entry chunk');
  assert.equal(missing.size, 0);
  console.log('PASS closure sanity: HTML seed + static-import + dynamic-import all reach, missing set stays empty');

  console.log('selftest: 5 case group(s) passed, including the 4 required legs — known-good, added-chunk (set red), inflated-bytes (byte red), hash-only-rename (anti-flap pass)');
}

// ---------------------------------------------------------------------------
async function main() {
  if (process.argv.includes('--selftest')) return selftest();

  // Optional positional arg: a repo root to read dist/ from instead of this file's own repo root
  // (used for red-calibration against a throwaway worktree — see the header's disclosed uses).
  // Defaults to this file's own repo root, unaffected by process.cwd().
  const argRoot = process.argv.slice(2).find((a) => !a.startsWith('--'));
  const distRoot = path.join(argRoot ? path.resolve(argRoot) : repoRoot, 'dist');
  if (!fs.existsSync(distRoot)) {
    console.error('::error::dist/ does not exist — this gate reads a built dist/, it never runs `astro build` itself (a rebuild here would invalidate the artifact the rest of CI grades). Run `npm run build` first.');
    process.exit(1);
  }

  const htmlFiles = collectFiles(distRoot, ['.html']);
  const astroDir = path.join(distRoot, '_astro');
  if (!fs.existsSync(astroDir)) {
    console.error('::error::dist/_astro/ does not exist — no JS chunks were emitted, which is not the same as an empty reachable set (ADR-0019: an inverted guard must count, not just exclude)');
    process.exit(1);
  }
  const chunkFiles = fs.readdirSync(astroDir).filter((f) => f.endsWith('.js'));
  const chunkTexts = new Map(chunkFiles.map((f) => [f, fs.readFileSync(path.join(astroDir, f), 'utf8')]));
  const sizeOf = (name) => fs.statSync(path.join(astroDir, name)).size;

  const htmlTexts = htmlFiles.map((f) => fs.readFileSync(f, 'utf8'));
  const { reached, missing } = reachableChunks(htmlTexts, chunkTexts);
  if (missing.size) {
    console.error(`::error::${missing.size} chunk reference(s) point at a file not present in dist/_astro/: ${[...missing].join(', ')}`);
    process.exit(1);
  }
  const measured = summarize(reached, sizeOf);
  const result = evaluate(measured, BASELINE_BASENAMES, BASELINE_TOTAL_BYTES);

  if (!result.setOk) {
    for (const b of result.added) console.error(`::error::bundle-freeze-check: NEW chunk basename not in the pinned baseline: ${b} — deliberate change? re-baseline BASELINE_BASENAMES in scripts/bundle-freeze-check.mjs`);
    for (const b of result.removed) console.error(`::error::bundle-freeze-check: baseline chunk basename no longer reachable: ${b} — a module stopped shipping, or re-baseline if deliberate`);
  }
  if (!result.byteOk) {
    console.error(`::error::bundle-freeze-check: total reachable bytes ${measured.totalBytes} is outside the +/-5% band [${Math.round(result.lowBound)}, ${Math.round(result.highBound)}] around the pinned baseline ${BASELINE_TOTAL_BYTES} — re-baseline BASELINE_TOTAL_BYTES if this growth/shrink is deliberate`);
  }
  if (!result.setOk || !result.byteOk) {
    process.exit(1);
  }
  console.log(`bundle-freeze-check: ${htmlFiles.length} HTML file(s) walked, ${measured.basenames.length} reachable chunk(s) (hash-stripped) match the pinned set exactly, ${measured.totalBytes} total bytes within +/-5% of baseline ${BASELINE_TOTAL_BYTES}.`);
}

// Entry point only. Importing this module (a unit test against the pure functions) must not fire
// a full gate as a side effect. Same guard the sibling gates carry.
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
