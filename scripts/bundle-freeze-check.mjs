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
// SECOND SET LEG (gh#168), because the basename set alone cannot see a new play route: eleven
// distinct hashed chunks are all named play.astro_astro_type_script_index_0_lang.*.js, so they fold
// into ONE baseline entry and a twelfth route adds no new basename — only the byte band could see
// it. The pair set fixes that without touching the basename leg: every dist page that loads an
// entry chunk contributes "<page-path-relative-to-dist> <hash-stripped-chunk-basename>", and that
// set must equal BASELINE_PAGE_ENTRIES exactly. A new route adds a page path nothing has pinned; a
// route that swaps which chunk it loads changes the right half of its own pair. A hash-only rebuild
// changes neither, so the leg does not flap. This set is repo-owned — derived from the same dist/
// walk the gate already does, with nothing for an author to register by hand.
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
// Measured on real dist/ (2026-08-29, `npm run build` after the cannon-flag play route AND the
// deletion of the ported module it replaces): 25 reachable chunks, 159812 total bytes.
// TWO MOVES, ONE NET NUMBER, and the net is the one that matters:
//   153460  before either change
//   191312  after the play route landed          (+37852, the mockup's engine arriving)
//   159812  after src/games/cannon-flag.ts shrank 2086 lines -> 87  (-31500, the port leaving)
// So replacing a ported module with the mockup it came from costs +6352 bytes, +4%, not the +25%
// the intermediate number showed. Reading the middle figure as the price of this approach would
// have been wrong by a factor of six.
// The chunk SET is unchanged across both moves: cannon-flag.js still exists, now carrying an 87-line
// landing module instead of an engine.
// Attributed additions vs the 153460 baseline:
// - play.astro_astro_type_script_index_0_lang.js — the play route's bundled module. This is the
//   mockup's own 73KB inline <script>, lifted verbatim by scripts/extract-mockup.mjs and emitted as a
//   file because `script-src 'self'` executes zero lines of an inline block (ADR-0005).
// - roster.js — src/shell/roster.ts becomes a shared chunk the moment a second entry point imports it.
//   The play route reads the group through loadGroup()/loadRoster() rather than touching the storage
//   key, which is what ADR-0010's sole-writer rule requires.
// THE COST IS REAL AND NAMING IT IS THIS GATE'S JOB: one play route is +25% on the site's reachable
// JS. Three of them roughly double it. That number belongs in the decision about whether every game
// gets this treatment, not buried inside a re-baseline.
// Attributed changes (re-baseline 2026-08-29, gh#135 + gh#136 play routes, measured from npm run build):
// - audio.js REMOVED: freeze-tap and power-meter engine deletions left timebomb the sole consumer
//   of src/shell/audio.ts, so the bundler inlines it into timebomb.js — verified: AudioContext code
//   present in the built timebomb chunk, absent as a standalone chunk. Sound still ships.
// - play.astro_astro_type_script_index_0_lang.js now covers THREE chunks (cannon-flag, freeze-tap,
//   power-meter play routes) — membership is a deduped set, so one entry stands for all three.
// - Delta of reachable bytes (+44547, 159812 -> 204359): two lifted mockup bundles (~38KB + ~32KB)
//   minus the two deleted ported engines and their shared-chunk shrinkage.
// gh#144: PlayExit.astro_... added — the shared exit X on every play route ships one small chunk.
// Edit-players (owner decision 2026-08-29): _setup-bridge.js added — the shared roster<->mockup-setup
// contract (edit request flag + save-on-setup-complete) used by all three play routes, ~731B.
// 2026-08-30 batch (gh#146 short-stick + gh#145 timebomb play routes): session.js added --
//   session.ts went from one consumer to two (the page route plus the new timebomb play island), so
//   Rollup split it out of its former parent into its own chunk. Bytes 204359 -> 232716 (+28357):
//   two more lifted/authored play bundles, minus nothing -- no engine was deleted this batch, because
//   the stage modules stay until gh#149 removes the landing pages that still render them.
const BASELINE_BASENAMES = [
  '_setup-bridge.js',
  'LeaveConfirm.astro_astro_type_script_index_0_lang.js',
  'PlayExit.astro_astro_type_script_index_0_lang.js',
  // gh#149 — PlayerSetup.astro_astro_type_script_index_0_lang.js is NOT in this inventory. The setup
  // island only mounts for a party player range (GameLayout guards it), and the party landing pages
  // are deleted (ADR-0050 ruling 2), so the only pages this route still builds are the two solo
  // fortune ones and nothing seeds the chunk. The component and its island are untouched on disk.
  'ToolNameEntry.astro_astro_type_script_index_0_lang.js',
  '_arm-gate.js',
  '_el.js',
  '_id_.astro_astro_type_script_index_0_lang.js',
  // gh#152 — the single-sourced animal cast, previously copied per play route.
  '_mascots.js',
  // gh#154 — _pick-index.js is NOT in this inventory. pickLoser() was split into its own chunk as
  // prep for deleting the party game that shared it; with that game gone short-stick is its only
  // importer, so Rollup inlines the helper back into short-stick.js and no separate chunk ships.
  // Adding it back here would pin a chunk the bundler has no reason to emit.
  '_round-start.js',
  // gh#184 — the shared `+N` seat counter for a scrolling player strip. Three play routes import it
  // (short-stick, wire-snip-panic, zero-trigger), so Rollup emits it as its own chunk rather than
  // inlining it into any one of them.
  '_strip-overflow.js',
  'cannon-flag.js',
  'daily-fortune.js',
  // gh#139 ports 1-3, in the owner's recorded ship order.
  'dice-loser.js',
  'how-close-is-near.js',
  'pinocchio-luck.js',
  // gh#161 — port 4, same ship order. Added, not substituted: the SET leg fired on this basename
  // alone and no basename left the inventory, so this is one new game shipping and nothing else
  // moved. Kept in the ports block rather than in alphabetical position, because the block records
  // the order the owner shipped them in and that is the more useful thing to read here.
  'cursed-number.js',
  // gh#162 and gh#163 — ports 5 and 6, same ship order, added in one batch. The SET leg fired on
  // these two basenames alone and none left the inventory, so this is two games shipping and
  // nothing else moving.
  //
  // WORTH KNOWING, because it limits what the SET leg can prove: every play route's inline script
  // compiles to a chunk whose hash-stripped basename is the SAME string,
  // play.astro_astro_type_script_index_0_lang.js — one entry covering all eleven routes. A new play
  // route therefore adds NO new basename for its own script, and the SET leg cannot see it. Only
  // the BYTES leg can. Measured this session: the two new scripts are 26022 and 22903 bytes and the
  // set gained only the two game-module basenames below.
  'wire-snip-panic.js',
  'zero-trigger.js',
  'draw.astro_astro_type_script_index_0_lang.js',
  'freeze-tap.js',
  'love-match.js',
  'name-list.js',
  'number.astro_astro_type_script_index_0_lang.js',
  'player-select.js',
  'power-meter.js',
  'short-stick.js',
  'siamsi.js',
  'team.astro_astro_type_script_index_0_lang.js',
  'timebomb.js',
  'play.astro_astro_type_script_index_0_lang.js',
  'roster.js',
  'session.js',
  'wheel.astro_astro_type_script_index_0_lang.js',
].sort();
// Re-baselined 2026-08-30, 232716 -> 323013 (+90297, +38.8%). Attribution, one cause per group:
// gh#139 ports 1-3 (dice-loser, how-close-is-near, pinocchio-luck) add three whole game engines
// plus their lifted route bundles — that is nearly all of the growth and it is a deliberate
// three-game addition, not drift. gh#152 adds _mascots.js; gh#154 prep adds _pick-index.js, and
// that one is a MOVE, not new weight — pick-loser.js shrinks by the same function.
// Measured by `node scripts/bundle-freeze-check.mjs` against a fresh `npm run build` this session,
// not carried over from any earlier run.
// Re-baselined 2026-08-30 (gh#154), 323013 -> 318560 (-4453, -1.4%). One cause: the party game's
// chunk and its route bundle stopped shipping. Attributed, not assumed — the deleting change touches
// no other game module and none of the shell, and the pinned set above lost exactly that chunk plus
// _pick-index.js (inlined back into short-stick.js, its only importer left). Measured by
// `node scripts/bundle-freeze-check.mjs` against a fresh `npm run build` this session.
// Re-baselined 2026-08-30 (gh#149), 318560 -> 314326 (-4234, -1.3%) — inside the +/-5% band, so the
// SET leg is what fired and the byte number is re-pinned deliberately rather than left to drift up to
// the bound. One cause: deleting the eight party landing pages leaves no page whose player range
// mounts the setup island, so its chunk stops shipping. Attributed, not assumed — the set lost exactly
// that one basename and gained none, and no game module or shell file changed in this ticket.
// Measured by `node scripts/bundle-freeze-check.mjs` against a fresh `npm run build` this session.
// Re-baselined 2026-08-30 (gh#161), 314326 -> 342419 (+28093, +8.9%) — outside the +/-5% band, so
// the BYTES leg fired on top of the SET leg and both are re-pinned in the same change. Attributed,
// not assumed: the set gained exactly one basename (cursed-number.js) and lost none, no existing
// game module or shell file changed in this ticket, and the growth is one lifted mockup — its
// markup, its own stylesheet and its engine — arriving whole. A port adds a game's entire client
// bundle at once, so a single port is expected to clear a 5% band; that is the band doing its job,
// not a signal to widen it.
// Re-pinned twice more in the same session as gh#161 settled: 342419 -> 342499 (+80) when the port's
// cast dependency moved out of the game module into the play route to satisfy the gh#140 pin, then
// -> 342492 (-7) when its root element's id was shortened from "appWrapper" to "app". Both deltas
// are noise against the band and would have passed unpinned. They are written down anyway, because
// this file's convention is to re-pin deliberately rather than leave a known number drifting toward
// the bound, and because a baseline that no longer names the tree it ships with is a baseline nobody
// can attribute later.
// Measured by `node scripts/bundle-freeze-check.mjs` against a fresh `npm run build` this session,
// and the number here is that command's output rather than a figure carried over from a brief.
// Re-baselined 2026-08-30 (gh#162 + gh#163), 342492 -> 397772 (+55280, +16.1%) — far outside the
// +/-5% band, so the BYTES leg fired alongside the SET leg and both are re-pinned together. Two
// ports land at once here, and the gh#161 note above already records that ONE port is expected to
// clear a 5% band; two clearing it by 16% is the same phenomenon, not a new one.
//
// Attributed, not assumed. Measured against a fresh build this session, per route, by reading each
// built page's own script src rather than by guessing which chunk belongs to which game:
//   wire-snip-panic play script  26022
//   zero-trigger play script     22903
//   the two new game modules      6074  (wire-snip-panic.js 3262 + zero-trigger.js 2812)
//   sum                          54999
//   observed growth              55280
//   residual                        281  — the party hub and the sitemap gaining two entries
// A residual of 281 bytes against a 55280-byte growth is 0.5%, and no existing game module or
// shell file changed in this batch. The one src edit outside the two new ports was two rewritten
// comments in src/play/timebomb/main.ts, which do not survive minification.
// Re-baselined 2026-09-04 (gh#184), SET leg only — BASELINE_TOTAL_BYTES is deliberately UNCHANGED.
// What fired: the set gained exactly one basename, _strip-overflow.js, and lost none. That is the
// shared `+N` seat counter arriving as its own chunk because three play routes import it; the gate
// went red for exactly the reason the header says it should, and the one-line set edit above is the
// intended fix.
// What did NOT fire: the BYTES leg. The gate's own run this session reports 413736 total reachable
// bytes against the pinned 397772 — inside the +/-5% band, so it passed and the number is not a
// measurement of this ticket. The counter chunk itself is 613 bytes on disk; the rest of that delta
// belongs to the other work in the same batch, which this change did not measure. Re-pinning a
// number whose growth cannot be attributed is the one thing the header forbids, so it is left alone
// for whoever ships the change that actually moves it. The band is NOT widened and no leg is
// relaxed; the gate is now closer to its upper bound than it was, and the next byte-moving change
// is expected to red on it and re-pin with attribution.
const BASELINE_TOTAL_BYTES = 397772;
const BAND = 0.05; // +/-5%

// gh#168 — the pair leg's pinned set: every dist page that loads an entry chunk, as
// "<page-path-relative-to-dist> <hash-stripped-chunk-basename>". Measured from a fresh
// `npm run build` this session: 33 pairs across 17 pages, generated by this file's own
// pageEntries() rather than typed by hand.
// WHY IT EXISTS, measured rather than assumed: dist/_astro/ holds ELEVEN distinct hashed chunks
// named play.astro_astro_type_script_index_0_lang.*.js (one per play route). stripHash() folds all
// eleven into the single BASELINE_BASENAMES entry, so a twelfth play route adds no new basename and
// the exact-set leg stays green on it — only the byte band could ever have caught it, and a small
// enough route would slip under 5%. The pair set catches it on its own, by page path.
// WHAT IT IS NOT: not the collapse story for every route. _id_.astro_... and the tool routes emit
// exactly ONE chunk each, shared by their pages; nothing about them collapses. What the pair set
// adds for them is per-page coverage — a new fortune page under the _id_ route reuses the existing
// chunk and adds no basename either, and this leg still sees the new page.
// RE-BASELINE, like the other two constants, is the intended signal and a deliberate edit: a new
// game adds its own pairs here.
const BASELINE_PAGE_ENTRIES = [
  'game/cannon-flag/play/index.html PlayExit.astro_astro_type_script_index_0_lang.js',
  'game/cannon-flag/play/index.html play.astro_astro_type_script_index_0_lang.js',
  'game/cursed-number/play/index.html PlayExit.astro_astro_type_script_index_0_lang.js',
  'game/cursed-number/play/index.html play.astro_astro_type_script_index_0_lang.js',
  'game/daily-fortune/index.html LeaveConfirm.astro_astro_type_script_index_0_lang.js',
  'game/daily-fortune/index.html _id_.astro_astro_type_script_index_0_lang.js',
  'game/dice-loser/play/index.html PlayExit.astro_astro_type_script_index_0_lang.js',
  'game/dice-loser/play/index.html play.astro_astro_type_script_index_0_lang.js',
  'game/freeze-tap/play/index.html PlayExit.astro_astro_type_script_index_0_lang.js',
  'game/freeze-tap/play/index.html play.astro_astro_type_script_index_0_lang.js',
  'game/how-close-is-near/play/index.html PlayExit.astro_astro_type_script_index_0_lang.js',
  'game/how-close-is-near/play/index.html play.astro_astro_type_script_index_0_lang.js',
  'game/pinocchio-luck/play/index.html PlayExit.astro_astro_type_script_index_0_lang.js',
  'game/pinocchio-luck/play/index.html play.astro_astro_type_script_index_0_lang.js',
  'game/power-meter/play/index.html PlayExit.astro_astro_type_script_index_0_lang.js',
  'game/power-meter/play/index.html play.astro_astro_type_script_index_0_lang.js',
  'game/short-stick/play/index.html PlayExit.astro_astro_type_script_index_0_lang.js',
  'game/short-stick/play/index.html play.astro_astro_type_script_index_0_lang.js',
  'game/siamsi/index.html LeaveConfirm.astro_astro_type_script_index_0_lang.js',
  'game/siamsi/index.html _id_.astro_astro_type_script_index_0_lang.js',
  'game/timebomb/play/index.html PlayExit.astro_astro_type_script_index_0_lang.js',
  'game/timebomb/play/index.html play.astro_astro_type_script_index_0_lang.js',
  'game/wire-snip-panic/play/index.html PlayExit.astro_astro_type_script_index_0_lang.js',
  'game/wire-snip-panic/play/index.html play.astro_astro_type_script_index_0_lang.js',
  'game/zero-trigger/play/index.html PlayExit.astro_astro_type_script_index_0_lang.js',
  'game/zero-trigger/play/index.html play.astro_astro_type_script_index_0_lang.js',
  'tool/draw/index.html ToolNameEntry.astro_astro_type_script_index_0_lang.js',
  'tool/draw/index.html draw.astro_astro_type_script_index_0_lang.js',
  'tool/number/index.html number.astro_astro_type_script_index_0_lang.js',
  'tool/team/index.html ToolNameEntry.astro_astro_type_script_index_0_lang.js',
  'tool/team/index.html team.astro_astro_type_script_index_0_lang.js',
  'tool/wheel/index.html ToolNameEntry.astro_astro_type_script_index_0_lang.js',
  'tool/wheel/index.html wheel.astro_astro_type_script_index_0_lang.js',
].sort();

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
 * Pure: [{ page, text }] -> sorted, deduped `"<page> <hash-stripped chunk basename>"` strings, one
 * per (page, entry chunk) pair found by HTML_SCRIPT_RE. Deliberately does NOT follow imports —
 * reachableChunks owns closure, and this leg only needs the entry each page names, which is the
 * thing a new route changes. Two pages loading hash-differing builds of the same stripped basename
 * stay two distinct entries here, which is the whole point (gh#168).
 */
export function pageEntries(pages) {
  const entries = new Set();
  for (const { page, text } of pages) {
    let m;
    HTML_SCRIPT_RE.lastIndex = 0;
    while ((m = HTML_SCRIPT_RE.exec(text))) entries.add(`${page} ${stripHash(path.basename(m[1]))}`);
  }
  return [...entries].sort();
}

// Pure: exact-set diff, shared by both set legs so they cannot drift apart.
function diffSets(measured, baseline) {
  const baseSet = new Set(baseline);
  const measSet = new Set(measured);
  return { added: measured.filter((b) => !baseSet.has(b)), removed: baseline.filter((b) => !measSet.has(b)) };
}

/**
 * Pure: compares a measured { basenames, totalBytes } against a pinned baseline. Returns
 * { setOk, added, removed, byteOk, lowBound, highBound }. Both directions of the byte band are
 * red: below lowBound (something shrank/stopped shipping) and above highBound (something grew)
 * are equally violations.
 */
export function evaluate(measured, baselineBasenames, baselineTotalBytes, band = BAND) {
  const { added, removed } = diffSets(measured.basenames, baselineBasenames);
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
// Plus the gh#168 pair leg, which is calibrated by the same rule and against the same fixture in
// both directions: a new play route reds the pair leg WHILE the old basename leg stays green on
// that exact fixture (leg 6 asserts both — the green half is what proves the pair leg is not just
// the basename leg wearing a hat), a page swapping entry chunks reds (so the key cannot be page
// path alone), and a re-hashed rebuild with identical pairs does not (anti-flap).
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

  // --- 6. gh#168 pair leg. Fixtures only, never dist/ (header rule). ---
  const PLAY = 'play.astro_astro_type_script_index_0_lang';
  const twoRoutes = [
    { page: 'game/a/play/index.html', text: `<script type="module" src="/_astro/${PLAY}.AAA11111.js"></script>` },
    { page: 'game/b/play/index.html', text: `<script type="module" src="/_astro/${PLAY}.BBB22222.js"></script>` },
  ];
  const pinnedPairs = [`game/a/play/index.html ${PLAY}.js`];

  // Red A — the new route. Page b is a second play route whose chunk differs from page a's ONLY by
  // build hash, which is exactly what Astro emits for route number twelve. The first assertion is
  // the load-bearing one: the OLD basename leg is GREEN on this same fixture, because stripHash
  // folds both chunks to one name. An implementation that kept keying on basename alone would pass
  // every other leg in this file and must fail here.
  const bothPlay = summarize([`${PLAY}.AAA11111.js`, `${PLAY}.BBB22222.js`], () => 500);
  const bothPlayEval = evaluate(bothPlay, [`${PLAY}.js`], 1000);
  assert.deepEqual(bothPlay.basenames, [`${PLAY}.js`], 'two hash-differing play chunks must collapse to one basename -- this is the blind spot being fixed');
  assert.equal(bothPlayEval.setOk, true, 'the OLD basename leg must be GREEN on the new-route fixture -- if it reds, this leg is proving nothing');
  const redA = diffSets(pageEntries(twoRoutes), pinnedPairs);
  assert.equal(redA.added.length, 1, 'a play route absent from the pinned pair set must red the pair leg');
  assert.deepEqual(redA.added, [`game/b/play/index.html ${PLAY}.js`], 'the red must name the unpinned page');
  assert.equal(redA.removed.length, 0);
  console.log(`PASS new play route (gh#168): old basename leg green (${bothPlay.basenames.length} basename for 2 chunks), pair leg reds naming ${redA.added[0]}`);

  // Red B — keeps the key honest. Same two pages, both pinned, but page a now loads a different
  // entry basename. An implementation keying on page path alone passes Red A and would go green
  // here, so this leg is what forces the chunk half of the pair to matter.
  const swapped = [
    { page: 'game/a/play/index.html', text: '<script type="module" src="/_astro/other-entry.CCC33333.js"></script>' },
    twoRoutes[1],
  ];
  const bothPinned = [`game/a/play/index.html ${PLAY}.js`, `game/b/play/index.html ${PLAY}.js`];
  const redB = diffSets(pageEntries(swapped), bothPinned);
  assert.deepEqual(redB.added, ['game/a/play/index.html other-entry.js'], 'a page swapping to a different entry basename must red as an added pair');
  assert.deepEqual(redB.removed, [`game/a/play/index.html ${PLAY}.js`], 'and its pinned pair must red as removed');
  console.log('PASS entry swap (gh#168): a page changing which chunk it loads reds both directions, so the pair key is not page-path-only');

  // Green, anti-flap — both play chunks re-hashed, page paths and stripped basenames identical.
  const rehashed = twoRoutes.map((p) => ({ page: p.page, text: p.text.replace(/\.[A-Z0-9]+\.js/, '.ZZZ99999.js') }));
  const flap = diffSets(pageEntries(rehashed), bothPinned);
  assert.deepEqual([flap.added, flap.removed], [[], []], 'a hash-only rebuild must NOT red the pair leg -- anti-flap');
  console.log('PASS pair anti-flap (gh#168): both entry chunks re-hashed, pairs identical, no red');

  console.log('selftest: 8 case group(s) passed — known-good, added-chunk (set red), inflated-bytes (byte red), hash-only-rename (anti-flap pass), closure sanity, and the gh#168 pair leg: new-route red (old leg green on the same fixture), entry-swap red, pair anti-flap pass');
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
  const entries = pageEntries(htmlFiles.map((f, i) => ({ page: path.relative(distRoot, f), text: htmlTexts[i] })));
  const pairDiff = diffSets(entries, BASELINE_PAGE_ENTRIES);
  const pairOk = pairDiff.added.length === 0 && pairDiff.removed.length === 0;

  if (!result.setOk) {
    for (const b of result.added) console.error(`::error::bundle-freeze-check: NEW chunk basename not in the pinned baseline: ${b} — deliberate change? re-baseline BASELINE_BASENAMES in scripts/bundle-freeze-check.mjs`);
    for (const b of result.removed) console.error(`::error::bundle-freeze-check: baseline chunk basename no longer reachable: ${b} — a module stopped shipping, or re-baseline if deliberate`);
  }
  if (!result.byteOk) {
    console.error(`::error::bundle-freeze-check: total reachable bytes ${measured.totalBytes} is outside the +/-5% band [${Math.round(result.lowBound)}, ${Math.round(result.highBound)}] around the pinned baseline ${BASELINE_TOTAL_BYTES} — re-baseline BASELINE_TOTAL_BYTES if this growth/shrink is deliberate`);
  }
  if (!pairOk) {
    for (const e of pairDiff.added) console.error(`::error::bundle-freeze-check: page loads an entry chunk no baseline pair covers: ${e} — a new route, or a page that changed which chunk it loads? re-baseline BASELINE_PAGE_ENTRIES in scripts/bundle-freeze-check.mjs`);
    for (const e of pairDiff.removed) console.error(`::error::bundle-freeze-check: baseline page-entry pair no longer present: ${e} — a page stopped loading that chunk, or the page is gone; re-baseline if deliberate`);
  }
  if (!result.setOk || !result.byteOk || !pairOk) {
    process.exit(1);
  }
  // ADR-0019: every number here is the length of the thing actually compared, never a literal and
  // never the size of a hardcoded list. entryPages is derived from the measured pairs, so it cannot
  // claim coverage of a page the walk did not read.
  const entryPages = new Set(entries.map((e) => e.slice(0, e.lastIndexOf(' ')))).size;
  console.log(`bundle-freeze-check: ${htmlFiles.length} HTML file(s) walked, ${measured.basenames.length} reachable chunk(s) (hash-stripped) match the pinned set exactly, ${entries.length} page-entry pair(s) across ${entryPages} page(s) that load an entry chunk match the pinned pair set exactly, ${measured.totalBytes} total bytes within +/-5% of baseline ${BASELINE_TOTAL_BYTES}.`);
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
