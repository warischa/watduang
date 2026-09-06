#!/usr/bin/env node
// Gate: a re-extraction may not silently delete hand-added code a human recorded as deliberate.
//
// THE DEFECT (gh#212, from gh#211). scripts/extract-mockup.mjs rewrites three basenames per route —
// markup.html, style.css, main.js — from a mockup, and no lifted route's markup.html is byte-identical
// to a fresh extraction any more. how-close-is-near carries an #hc-live announcement channel added by
// gh#170 that its mockup does not have: zero occurrences in the mockup source, one in the shipped
// route. A re-extraction deleted it and nothing went red. The owner ruled 2026-09-05 that the mockups
// stay the original design record and are NOT reconciled back, so the divergences get recorded and
// guarded instead.
//
// TWO LAYERS, and they answer different questions.
//
//   1. THE FILE LAYER — destructiveWrites, enforced at the extractor's pre-write seam by
//      preWriteRefusal. The set is "extractor-owned files this repo already ships whose bytes the run
//      would change". The repo owns and can enumerate that set with no human list at all, which is
//      what makes it converge. It is the one that actually stops data loss: a fragment registry can
//      only protect what somebody remembered to write down, and the first version of this gate
//      recorded markup.html fragments exclusively, so a re-extraction of a route whose main.js had
//      been hand-edited destroyed ~25 lines and reported success. A file that does not exist yet is
//      created, not destroyed, so the first extraction of a new game is untouched by this layer.
//
//   2. THE FRAGMENT LAYER — lostFragments over the divergences recorded in src/play/_divergences.json,
//      a file this repo commits and a human maintains. That cost was named and accepted in the ruling.
//      At the pre-write seam this layer is a strict SUBSET of layer 1 (losing a fragment implies the
//      file changed), and it is not there to catch more — it is there to say WHY a divergence exists
//      and WHO owns it, which the ruling asked for by name, and to be the only permanent licence. So
//      layer 1 can be forced past for one run; layer 2 cannot be forced past at all. Releasing a
//      fragment means editing the committed registry, which is a reviewed diff with a reason in it.
//      Layer 2 also runs where layer 1 cannot: this gate's default run has no mockup to extract from,
//      so it re-checks the recorded fragments against the files that actually ship, and an entry that
//      was already destroyed, or that never matched, cannot sit in the registry looking like protection.
//
// Neither layer is "every difference between a mockup and its shipped route". That set has no owner
// and no finishing condition (its other half lives in ~/claude/mockup-games, which is not
// version-controlled with this repo, exists on one machine, and has no directory at all for
// short-stick). Enumeration reports it — see --enumerate — but nothing enforces it.
//
// WHAT IT CANNOT SEE:
//   - A fragment is matched as a literal substring. A reformat that keeps the meaning reads as LOST
//     (fails closed, costs a human one look) and a rewrite that keeps the substring while changing
//     what it does around it reads as kept. Recording behaviour is a route test's job, not this file's.
//   - Only the three extractor-owned basenames can be protected here; everything else in a route
//     folder is hand-authored and no extraction threatens it (docs/agents/src-edit-rules.md).
//   - --enumerate needs the mockups. They are outside this repo and unversioned, so enumeration is a
//     machine-local audit, never a CI gate: on a machine without them it reports zero pairs, and that
//     is why the enforced set is the registry rather than the diff.
//
//   node scripts/mockup-divergence-check.mjs             -> every recorded divergence still ships
//   node scripts/mockup-divergence-check.mjs --selftest  -> calibration on a throwaway fixture
//   node scripts/mockup-divergence-check.mjs --enumerate [mockups-root]
//                                                        -> which routes have drifted from their mockup
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

// The three basenames scripts/extract-mockup.mjs rewrites on every run. They live HERE, and the
// extractor imports them, because the dependency has to point one way: the extractor loads this
// module before it writes, and a static import back would be a cycle around a top-level await —
// which deadlocks the extractor into exit 13 rather than failing visibly. extractFiles is loaded
// dynamically inside --enumerate for the same reason.
export const EXTRACTED_FILES = ['markup.html', 'style.css', 'main.js'];

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const PLAY_DIR = path.join(repoRoot, 'src', 'play');
const REGISTRY = path.join(PLAY_DIR, '_divergences.json');

export function loadRegistry(file = REGISTRY) {
  if (!fs.existsSync(file)) return {};
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  // Underscore keys are prose for whoever opens the file, not routes. src/play uses the same
  // convention for its shared files, so a reader already reads a leading underscore as "not a route".
  return Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith('_')));
}

/** The recorded, deliberate divergences of one file that `text` does not contain. */
export function lostFragments(registry, id, fileName, text) {
  const entries = registry?.[id]?.[fileName] ?? [];
  return entries.filter((e) => e.deliberate === true && !String(text).includes(e.fragment));
}

/** Which of the extractor-owned files a fresh extraction would change. A missing file counts. */
export function divergingFiles(fresh, shipped) {
  return Object.keys(fresh).filter((name) => shipped[name] !== fresh[name]);
}

/**
 * Which of those a fresh extraction would DESTROY: already on disk, and different. `shipped[name]`
 * is null or undefined for a file the route does not have yet — creating it loses nothing, and that
 * is the whole reason a brand-new game still extracts cleanly through this gate.
 */
export function destructiveWrites(fresh, shipped) {
  return divergingFiles(fresh, shipped).filter((name) => shipped[name] != null);
}

/**
 * The entire pre-write decision, as one function over values: no extraction is run and no file is
 * read here, so both refusals are testable without a mockup on the machine.
 *
 * `forcedBy` is an owner token from `--force <owner>`. It releases the file layer for one run and
 * NEVER the fragment layer — a recorded, deliberate divergence is released by editing the registry,
 * not by a flag. That asymmetry is the design: the flag is the escape hatch, the registry is the record.
 */
export function preWriteRefusal(registry, id, fresh, shipped, forcedBy = null) {
  const lost = EXTRACTED_FILES.flatMap((name) =>
    lostFragments(registry, id, name, fresh[name] ?? '').map((entry) => ({ name, entry })),
  );
  const destructive = forcedBy ? [] : destructiveWrites(fresh, shipped);
  return { lost, destructive, refuses: lost.length > 0 || destructive.length > 0 };
}

/**
 * Registry entries that could never do their job. An empty fragment matches everything, and a
 * basename the extractor does not own is not at risk from any extraction — both read as protection
 * while protecting nothing.
 */
export function registryProblems(registry) {
  const problems = [];
  for (const [id, files] of Object.entries(registry)) {
    for (const [name, entries] of Object.entries(files)) {
      if (!EXTRACTED_FILES.includes(name)) {
        problems.push(`${id}/${name}: not a file the extractor writes — no extraction can delete it`);
      }
      for (const e of entries) {
        if (!e.fragment) problems.push(`${id}/${name}: an entry has an empty fragment, which matches every text`);
        if (!e.owner) problems.push(`${id}/${name}: an entry names no owner`);
        if (!e.why) problems.push(`${id}/${name}: an entry gives no reason`);
        if (typeof e.deliberate !== 'boolean') problems.push(`${id}/${name}: an entry does not say whether it is deliberate`);
      }
    }
  }
  return problems;
}

/** The default run: every recorded, deliberate divergence must still be in the file that ships. */
export function auditTree(playDir, registry) {
  const violations = [...registryProblems(registry)];
  for (const [id, files] of Object.entries(registry)) {
    for (const name of Object.keys(files)) {
      const p = path.join(playDir, id, name);
      const text = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
      if (!fs.existsSync(p)) {
        violations.push(`${id}/${name}: recorded here but the file does not exist`);
        continue;
      }
      for (const e of lostFragments(registry, id, name, text)) {
        violations.push(`${id}/${name}: the divergence owned by ${e.owner} is GONE from the shipped file — ${e.why}\n    expected to contain: ${e.fragment}`);
      }
    }
  }
  return violations;
}

/**
 * Pair a mockup with the route it was lifted into by CONTENT, not by directory name: the mockup
 * folders are named in three conventions and two languages, and a hand-written map is the thing the
 * ticket asked not to build.
 */
function matchRoute(freshMarkup, shippedMarkup) {
  const lines = (t) => new Set(t.split('\n').map((l) => l.trim()).filter((l) => l.length > 12));
  const fresh = lines(freshMarkup);
  let best = { id: null, score: 0 };
  for (const [id, text] of Object.entries(shippedMarkup)) {
    const ship = lines(text);
    let hit = 0;
    for (const l of fresh) if (ship.has(l)) hit += 1;
    const score = fresh.size ? hit / fresh.size : 0;
    if (score > best.score) best = { id, score };
  }
  return best.score >= 0.5 ? best : { id: null, score: best.score };
}

async function enumerate(mockupsRoot) {
  const { extractFiles, readMockup } = await import('./extract-mockup.mjs');
  const routes = fs
    .readdirSync(PLAY_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(PLAY_DIR, d.name, 'markup.html')))
    .map((d) => d.name);
  const shippedMarkup = Object.fromEntries(
    routes.map((id) => [id, fs.readFileSync(path.join(PLAY_DIR, id, 'markup.html'), 'utf8')]),
  );
  const registry = loadRegistry();

  if (!fs.existsSync(mockupsRoot)) {
    console.log(`mockup-divergence enumerate: ${mockupsRoot} not present — 0 pairs, nothing measured`);
    return 0;
  }
  const dirs = fs
    .readdirSync(mockupsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(mockupsRoot, d.name, 'index.html')))
    .map((d) => d.name);

  const pairs = [];
  const unpaired = [];
  for (const dir of dirs) {
    let extracted;
    try {
      extracted = extractFiles(readMockup(path.join(mockupsRoot, dir)), 'x');
    } catch (err) {
      unpaired.push(`${dir}: not extractable (${err.message})`);
      continue;
    }
    const { id, score } = matchRoute(extracted.files['markup.html'], shippedMarkup);
    if (!id) {
      unpaired.push(`${dir}: no shipped route matched (best overlap ${(score * 100).toFixed(0)}%)`);
      continue;
    }
    const fresh = extractFiles(readMockup(path.join(mockupsRoot, dir)), id).files;
    const shipped = Object.fromEntries(
      EXTRACTED_FILES.map((name) => {
        const p = path.join(PLAY_DIR, id, name);
        return [name, fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null];
      }),
    );
    const destructive = destructiveWrites(fresh, shipped);
    const lost = EXTRACTED_FILES.flatMap((name) => lostFragments(registry, id, name, fresh[name] ?? '').map((e) => `${name}: ${e.owner}`));
    pairs.push({ id, dir, destructive, lost, recorded: Object.values(registry[id] ?? {}).flat().length });
  }

  console.log(`mockup-divergence enumerate: ${dirs.length} mockup dir(s), ${routes.length} play route(s) with a markup.html`);
  console.log(`  paired: ${pairs.length} · of those, would lose bytes on re-extraction: ${pairs.filter((p) => p.destructive.length).length}`);
  // One `pair:` line per member, whether it diverges or not, so a caller can drive the real extractor
  // once per pair and get an exit code for each. A gate over a SET is calibrated per member.
  for (const p of pairs) {
    const verdict = p.destructive.length ? `WOULD OVERWRITE ${p.destructive.join(',')}` : 'identical';
    console.log(`  pair: ${p.dir} -> ${p.id} · ${verdict} · recorded divergences: ${p.recorded}${p.lost.length ? ` · would DELETE ${p.lost.length} recorded (${p.lost.join('; ')})` : ''}`);
  }
  for (const u of unpaired) console.log(`  unpaired, not measured — ${u}`);
  return 0;
}

function selftest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'divergence-selftest-'));
  const registry = {
    r: { 'markup.html': [{ fragment: '<p id="live"></p>', deliberate: true, owner: 'gh#0', why: 'a live region' }] },
  };
  fs.mkdirSync(path.join(dir, 'r'));

  // Green leg: the recorded fragment is in the file that ships.
  fs.writeFileSync(path.join(dir, 'r', 'markup.html'), '<div></div>\n<p id="live"></p>\n');
  assert.deepEqual(auditTree(dir, registry), [], 'a present divergence must not be a violation');

  // Red leg: the same registry over a file an extraction has flattened back to the mockup.
  fs.writeFileSync(path.join(dir, 'r', 'markup.html'), '<div></div>\n');
  const gone = auditTree(dir, registry);
  assert.equal(gone.length, 1, 'a deleted divergence must be exactly one violation');
  assert.match(gone[0], /gh#0/, 'the message must name the owner');

  // The layering the escape hatch rests on: --force releases the file layer and never the fragment one.
  const fresh = { 'markup.html': '<div></div>\n', 'style.css': 'a\n', 'main.js': 'b\n' };
  const onDisk = { 'markup.html': '<div></div>\n<p id="live"></p>\n', 'style.css': 'a\n', 'main.js': null };
  assert.deepEqual(preWriteRefusal(registry, 'r', fresh, onDisk).destructive, ['markup.html'], 'an existing file whose bytes change is destructive; a missing one is not');
  assert.equal(preWriteRefusal(registry, 'r', fresh, onDisk, 'gh#0').destructive.length, 0, '--force releases the file layer');
  assert.equal(preWriteRefusal(registry, 'r', fresh, onDisk, 'gh#0').refuses, true, '--force must NOT release a recorded fragment');

  // A registry that cannot fail is itself the failure.
  assert.equal(registryProblems({ r: { 'markup.html': [{ fragment: '', deliberate: true, owner: 'o', why: 'w' }] } }).length, 1);
  assert.equal(registryProblems(registry).length, 0);

  fs.rmSync(dir, { recursive: true, force: true });
  console.log('mockup-divergence-check --selftest: ok (present -> green, deleted -> red naming the owner, --force releases the file layer only)');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--selftest')) {
    selftest();
  } else if (process.argv.includes('--enumerate')) {
    const arg = process.argv[process.argv.indexOf('--enumerate') + 1];
    const root = (arg && !arg.startsWith('--') ? arg : '~/claude/mockup-games').replace(/^~/, os.homedir());
    // .then rather than `await`: a top-level await here would still be pending when the dynamic
    // import inside enumerate pulls in extract-mockup.mjs, which imports this module back — the
    // module body would never finish and node would exit 13 with nothing measured.
    enumerate(root).then((code) => process.exit(code));
  } else {
    const registry = loadRegistry();
    const violations = auditTree(PLAY_DIR, registry);
    const recorded = Object.values(registry).flatMap((f) => Object.values(f).flat());
    if (violations.length) {
      console.error(`::error::mockup-divergence-check: ${violations.length} recorded divergence problem(s)`);
      for (const v of violations) console.error(`  ${v}`);
      console.error('  Each one is hand-added code gh#212 recorded as deliberate. Restore it, or remove its entry from src/play/_divergences.json with a reason.');
      process.exit(1);
    }
    console.log(`mockup-divergence-check: ${recorded.length} recorded divergence(s) across ${Object.keys(registry).length} route(s), all present in the files that ship`);
    console.log('  not covered here: unrecorded drift — that is the file layer\'s job and it runs inside extract-mockup.mjs, which has a mockup to compare against; also anything outside markup.html/style.css/main.js');
  }
}
