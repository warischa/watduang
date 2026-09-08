#!/usr/bin/env node
// Gate: a re-extraction may not silently delete hand-added code a human recorded as deliberate, nor
// silently put back something a human recorded as deliberately gone.
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
//   2. THE FRAGMENT LAYER — lostFragments and introducedFragments, which partition the divergences
//      recorded in src/play/_divergences.json between the two directions a recorded decision can be
//      violated in,
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
//   - An absence entry (absent: true, gh#220) is checked against the file that SHIPS. That the
//     forbidden text is still in the mockup a re-extraction would pull it from is unverifiable from
//     CI at all: the mockups are outside this repo. A green means nobody put the text back, never
//     that the hazard the entry describes still exists.
//   - Only the three extractor-owned basenames can be protected here; everything else in a route
//     folder is hand-authored and no extraction threatens it (docs/agents/src-edit-rules.md).
//   - --enumerate needs the mockups. They are outside this repo and unversioned, so enumeration is a
//     machine-local audit, never a CI gate, and that is why the enforced set is the registry rather
//     than the diff. On a machine without them it does NOT report zero pairs — it says NOTHING
//     MEASURED and exits ROOT_UNREADABLE (gh#223), because "no drift found" and "never looked" are
//     different answers and only one of them is evidence.
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
import { spawnSync } from 'node:child_process';

// The three basenames scripts/extract-mockup.mjs rewrites on every run. They live HERE, and the
// extractor imports them, because the dependency has to point one way: the extractor loads this
// module before it writes, and a static import back would be a cycle around a top-level await —
// which deadlocks the extractor into exit 13 rather than failing visibly. extractFiles is loaded
// dynamically inside --enumerate for the same reason.
export const EXTRACTED_FILES = ['markup.html', 'style.css', 'main.js'];

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const PLAY_DIR = path.join(repoRoot, 'src', 'play');
const REGISTRY = path.join(PLAY_DIR, '_divergences.json');

// --enumerate's exit code is otherwise a COUNT of ambiguous directories, so a run that could not
// look at the root at all needs a value a count will not produce (gh#223). Without it an absent root
// exited 0 and read exactly like a root that was measured and found clean, which is the silent-success
// class gh#221 fixed one layer up.
// ponytail: a sentinel sharing an exit space with a count. A root holding 77 ambiguous mockup
// directories would collide, and only the printed line would separate the two. Upgrade path: return
// { code, reason } from enumerate() and let the CLI branch map it to an exit code.
const ROOT_UNREADABLE = 77;

export function loadRegistry(file = REGISTRY) {
  if (!fs.existsSync(file)) return {};
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  // Underscore keys are prose for whoever opens the file, not routes. src/play uses the same
  // convention for its shared files, so a reader already reads a leading underscore as "not a route".
  return Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith('_')));
}

/**
 * The recorded, deliberate divergences of one file that `text` does not contain. `absent: true`
 * entries are excluded and judged by introducedFragments instead — see the note there for why the
 * two predicates have to partition rather than overlap.
 */
export function lostFragments(registry, id, fileName, text) {
  const entries = registry?.[id]?.[fileName] ?? [];
  return entries.filter((e) => e.deliberate === true && e.absent !== true && !String(text).includes(e.fragment));
}

/**
 * The recorded, deliberate ABSENCES of one file that `text` violates by containing them (gh#220).
 *
 * A decision whose content is that something is NOT in a shipped file has no fragment to assert as
 * present, so it could not be registered at all — unprotected by construction. An `absent: true`
 * entry inverts the predicate for that one entry, keeping the same required fields, the same literal
 * substring match and the same audience, rather than adding a second mechanism with its own gate.
 *
 * The two predicates PARTITION the registry, and that is the load-bearing part: an absence entry is
 * never judged by lostFragments (the clean tree is exactly the state it describes, so judging it
 * there would red the tree the entry was written to protect), and a presence entry is never judged
 * here (it is in the file on purpose, so every protected fragment would violate itself).
 *
 * What it cannot see is the mockup. The forbidden text is asserted absent from what SHIPS, which is
 * in this repo; that it is present at the source a re-extraction would pull from is a claim about a
 * directory outside version control, and no run of this gate checks it.
 */
export function introducedFragments(registry, id, fileName, text) {
  const entries = registry?.[id]?.[fileName] ?? [];
  return entries.filter((e) => e.deliberate === true && e.absent === true && String(text).includes(e.fragment));
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
 * An absence entry inherits that property explicitly: `introduced` is computed without consulting
 * `forcedBy` at all, exactly as `lost` is.
 */
export function preWriteRefusal(registry, id, fresh, shipped, forcedBy = null) {
  const lost = EXTRACTED_FILES.flatMap((name) =>
    lostFragments(registry, id, name, fresh[name] ?? '').map((entry) => ({ name, entry })),
  );
  const introduced = EXTRACTED_FILES.flatMap((name) =>
    introducedFragments(registry, id, name, fresh[name] ?? '').map((entry) => ({ name, entry })),
  );
  const destructive = forcedBy ? [] : destructiveWrites(fresh, shipped);
  return { lost, introduced, destructive, refuses: lost.length > 0 || introduced.length > 0 || destructive.length > 0 };
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
        // `absent` is optional and defaults to a presence entry, but a truthy non-boolean would read
        // as an absence to a human and as a presence to `e.absent === true`, which is the shape that
        // protects nothing while looking like protection.
        if ('absent' in e && typeof e.absent !== 'boolean') problems.push(`${id}/${name}: an entry's "absent" is not a boolean, so it is neither kind`);
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
      for (const e of introducedFragments(registry, id, name, text)) {
        violations.push(`${id}/${name}: the absence owned by ${e.owner} is BACK in the shipped file — ${e.why}\n    must NOT contain: ${e.fragment}`);
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
  const { extractFiles, readMockup, resolveIndexFile } = await import('./extract-mockup.mjs');
  const routes = fs
    .readdirSync(PLAY_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(PLAY_DIR, d.name, 'markup.html')))
    .map((d) => d.name);
  const shippedMarkup = Object.fromEntries(
    routes.map((id) => [id, fs.readFileSync(path.join(PLAY_DIR, id, 'markup.html'), 'utf8')]),
  );
  const registry = loadRegistry();

  // Every entry readdirSync returns — real directory, symlink, or plain file — lands in exactly one
  // of {candidate for pairing, excluded-with-reason}, so the bucket counts always sum to the
  // UNFILTERED entry count. Counting only entries the isDirectory() predicate already kept would make
  // the sum circular: nothing that predicate drops could ever fail it. A symlink to a directory is
  // resolved by following it; a symlink whose target is gone, or is not a directory, is excluded with
  // a reason instead of silently vanishing.
  //
  // One try/catch replaces an existsSync guard: readdirSync throws ENOENT for an absent root and
  // EACCES for an unreadable one, so both reach the same outcome with no window between the check and
  // the read. A caller that measured nothing is told so in words AND in an exit code — never by the
  // silence that a clean run also produces.
  // ponytail: no --selftest leg for the EACCES half. Building one means chmod 000, which does not
  // block a process running as root, so the leg would pass for the wrong reason on some machines.
  // The ENOENT leg pins the branch; the catch is shared, so EACCES reaches the same two lines.
  let rawEntries;
  try {
    rawEntries = fs.readdirSync(mockupsRoot, { withFileTypes: true });
  } catch (err) {
    console.log(
      `mockup-divergence enumerate: NOTHING MEASURED — ${mockupsRoot} is absent or unreadable (${err.code}). ` +
        'This is not a clean run: no pair was compared, so nothing here says anything about drift.',
    );
    return ROOT_UNREADABLE;
  }
  const totalEntries = rawEntries.length;

  const dirCandidates = [];
  const excluded = [];
  for (const entry of rawEntries) {
    if (entry.isDirectory()) {
      dirCandidates.push(entry.name);
      continue;
    }
    if (entry.isSymbolicLink()) {
      let target;
      try {
        target = fs.statSync(path.join(mockupsRoot, entry.name));
      } catch {
        excluded.push(`${entry.name} — dangling symlink`);
        continue;
      }
      if (target.isDirectory()) dirCandidates.push(entry.name);
      else excluded.push(`${entry.name} — symlink to a non-directory, not a mockup directory`);
      continue;
    }
    excluded.push(`${entry.name} — not a directory`);
  }

  const dirs = [];
  let unmeasured = 0;
  for (const name of dirCandidates) {
    const entries = fs.readdirSync(path.join(mockupsRoot, name));
    const { file, reason } = resolveIndexFile(entries);
    if (file) {
      dirs.push(name);
    } else {
      excluded.push(`${name} — ${reason}`);
      // Mockup-shaped (holds at least one .html) but unresolvable is the one case widening cannot fix
      // for free — an ambiguous directory needs a human to pick, not a guess. It is the only
      // PER-ENTRY path to a non-zero --enumerate exit: everything else here is disclosed, not
      // silently dropped. The other non-zero exit is whole-run — ROOT_UNREADABLE, when there was no
      // root to walk (gh#223).
      if (entries.some((e) => e.endsWith('.html'))) unmeasured += 1;
    }
  }

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
    const introduced = EXTRACTED_FILES.flatMap((name) => introducedFragments(registry, id, name, fresh[name] ?? '').map((e) => `${name}: ${e.owner}`));
    pairs.push({ id, dir, destructive, lost, introduced, recorded: Object.values(registry[id] ?? {}).flat().length });
  }

  console.log(`mockup-divergence enumerate: ${totalEntries} entr(y/ies) under ${mockupsRoot}, ${routes.length} play route(s) with a markup.html`);
  console.log(`  paired: ${pairs.length} · unpaired: ${unpaired.length} · excluded: ${excluded.length} · sum ${pairs.length + unpaired.length + excluded.length} of ${totalEntries} entr(y/ies)`);
  console.log(`  of those paired, would lose bytes on re-extraction: ${pairs.filter((p) => p.destructive.length).length}`);
  // One `pair:` line per member, whether it diverges or not, so a caller can drive the real extractor
  // once per pair and get an exit code for each. A gate over a SET is calibrated per member.
  for (const p of pairs) {
    const verdict = p.destructive.length ? `WOULD OVERWRITE ${p.destructive.join(',')}` : 'identical';
    console.log(`  pair: ${p.dir} -> ${p.id} · ${verdict} · recorded divergences: ${p.recorded}${p.lost.length ? ` · would DELETE ${p.lost.length} recorded (${p.lost.join('; ')})` : ''}${p.introduced.length ? ` · would REINTRODUCE ${p.introduced.length} forbidden (${p.introduced.join('; ')})` : ''}`);
  }
  for (const u of unpaired) console.log(`  unpaired, not measured — ${u}`);
  for (const e of excluded) console.log(`  excluded: ${e}`);
  return unmeasured;
}

async function selftest() {
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

  // The absence kind (gh#220), calibrated in BOTH directions on the same fixture. The direction that
  // matters is the second one: a presence entry reds when its fragment vanishes, so a build where the
  // absence kind did nothing at all would still pass the green leg.
  const absReg = {
    r: { 'style.css': [{ fragment: 'min-height: 100dvh;', absent: true, deliberate: true, owner: 'gh#0', why: 'a floor removed on purpose' }] },
  };
  fs.mkdirSync(path.join(dir, 'r'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'r', 'style.css'), '.w {\n  padding: 0;\n}\n');
  assert.deepEqual(auditTree(dir, absReg), [], 'a fragment that is absent as recorded must not be a violation');

  fs.writeFileSync(path.join(dir, 'r', 'style.css'), '.w {\n  min-height: 100dvh;\n}\n');
  const back = auditTree(dir, absReg);
  assert.equal(back.length, 1, 'a reintroduced forbidden fragment must be exactly one violation');
  assert.match(back[0], /must NOT contain/, 'the message must say which direction was violated');

  // The escape hatch is asymmetric for absences too, and it is asserted rather than assumed.
  const absFresh = { 'markup.html': 'a\n', 'style.css': '.w {\n  min-height: 100dvh;\n}\n', 'main.js': 'b\n' };
  const absOnDisk = { 'markup.html': 'a\n', 'style.css': '.w {\n  padding: 0;\n}\n', 'main.js': 'b\n' };
  assert.equal(preWriteRefusal(absReg, 'r', absOnDisk, absOnDisk).refuses, false, 'a recorded absence must not refuse a run that keeps it absent');
  assert.equal(preWriteRefusal(absReg, 'r', absFresh, absOnDisk, 'gh#0').introduced.length, 1, '--force must NOT release a recorded absence');
  assert.equal(preWriteRefusal(absReg, 'r', absFresh, absOnDisk, 'gh#0').refuses, true, 'a forced run that would reintroduce a forbidden fragment still refuses');
  assert.equal(registryProblems({ r: { 'style.css': [{ fragment: 'x', absent: 'yes', deliberate: true, owner: 'o', why: 'w' }] } }).length, 1);

  fs.rmSync(dir, { recursive: true, force: true });

  // Pin 1: the index-file classification the --enumerate widening rests on, over the four shapes a
  // mockup directory actually takes (dynamic import to avoid the cycle noted at EXTRACTED_FILES above).
  // The ambiguous shape matters more than the other three: it is the only PER-ENTRY path to a
  // non-zero --enumerate exit, so an assertion over it is the pin for that whole branch. The
  // whole-run path, an unreadable root, is pinned separately below (gh#223).
  const { resolveIndexFile } = await import('./extract-mockup.mjs');
  assert.equal(resolveIndexFile(['index.html', 'style.css']).file, 'index.html', 'exact index.html must win');
  assert.equal(
    resolveIndexFile(['opendesign_x_index.html']).file,
    'opendesign_x_index.html',
    'the sole suffixed .html file must resolve',
  );
  assert.equal(resolveIndexFile(['INDEX.md']).file, null, 'zero .html files must resolve to nothing');
  assert.equal(resolveIndexFile(['a.html', 'b.html']).file, null, 'two .html files must resolve to nothing — ambiguous');
  assert.match(
    resolveIndexFile(['a.html', 'b.html']).reason,
    /ambiguous/,
    'the ambiguous reason must say why, since it drives the only non-zero --enumerate exit',
  );

  // Pin 2: the wire, not just the pure function. Spawn the real CLI over a fixture with all four
  // shapes — exact, sole-suffixed, no-html, and ambiguous (two .html files) — and assert stdout
  // discloses each exclusion by name, never names the resolvable suffixed directory as excluded, the
  // bucket counts reconcile, and the ambiguous directory alone drives a non-zero process exit.
  const enumRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'enumerate-selftest-'));
  const miniHtml = '<html><body><style>a{}</style><script>1;</script></body></html>';
  fs.mkdirSync(path.join(enumRoot, 'exact'));
  fs.writeFileSync(path.join(enumRoot, 'exact', 'index.html'), miniHtml);
  fs.mkdirSync(path.join(enumRoot, 'suffixed'));
  fs.writeFileSync(path.join(enumRoot, 'suffixed', 'opendesign_x_index.html'), miniHtml);
  fs.mkdirSync(path.join(enumRoot, 'no-html'));
  fs.writeFileSync(path.join(enumRoot, 'no-html', 'INDEX.md'), 'not html');
  fs.mkdirSync(path.join(enumRoot, 'ambiguous'));
  fs.writeFileSync(path.join(enumRoot, 'ambiguous', 'a.html'), miniHtml);
  fs.writeFileSync(path.join(enumRoot, 'ambiguous', 'b.html'), miniHtml);

  const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--enumerate', enumRoot], { encoding: 'utf8' });
  const out = run.stdout;
  assert.ok(out.includes('excluded: no-html —'), `stdout must name the excluded directory with its reason, got:\n${out}`);
  assert.ok(out.includes('excluded: ambiguous —'), `stdout must name the ambiguous directory as excluded, got:\n${out}`);
  assert.ok(!out.includes('excluded: suffixed —'), `a resolvable suffixed directory must never appear on an excluded: line, got:\n${out}`);
  const entryCount = fs.readdirSync(enumRoot, { withFileTypes: true }).length;
  assert.ok(out.includes(`sum ${entryCount} of ${entryCount} entr`), `the bucket counts must reconcile against the unfiltered entry count, got:\n${out}`);
  assert.equal(run.status, 1, 'the ambiguous directory is the only per-entry path to a non-zero exit, and it must take it');
  fs.rmSync(enumRoot, { recursive: true, force: true });

  // Pin 3: a symlink to a directory resolves like a directory, and a dangling symlink lands in a
  // named excluded bucket instead of vanishing from the count. The reconciling sum is taken against
  // readdirSync's UNFILTERED result, never against the isDirectory() predicate that builds the
  // candidate list — that identity is what made the sum circular in the first place.
  const symRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'enumerate-symlink-selftest-'));
  fs.mkdirSync(path.join(symRoot, 'real'));
  fs.writeFileSync(path.join(symRoot, 'real', 'index.html'), miniHtml);
  fs.symlinkSync(path.join(symRoot, 'real'), path.join(symRoot, 'linked-dir'));
  fs.symlinkSync(path.join(symRoot, 'does-not-exist'), path.join(symRoot, 'dangling'));
  const symRun = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--enumerate', symRoot], { encoding: 'utf8' });
  const symOut = symRun.stdout;
  assert.ok(symOut.includes('excluded: dangling — dangling symlink'), `a dangling symlink must land in a named bucket, got:\n${symOut}`);
  const symEntryCount = fs.readdirSync(symRoot, { withFileTypes: true }).length;
  assert.ok(
    symOut.includes(`sum ${symEntryCount} of ${symEntryCount} entr`),
    `a symlinked mockup directory must not silently vanish from the reconciling sum, got:\n${symOut}`,
  );
  fs.rmSync(symRoot, { recursive: true, force: true });

  // Pin 4 (gh#223): "never looked" and "looked and found nothing" must be different answers. Both
  // produce zero pairs and a single line of output, so before this the only thing separating them was
  // a reader's assumption -- and both exited 0.
  //
  // The two legs discriminate BY CONSTRUCTION: they differ in exactly one variable, whether the root
  // exists, and the last assertion compares their exit codes directly. Collapse the fix and that
  // assertion reds. The empty-root leg is also the must-green half -- if a present-but-empty root ever
  // starts exiting non-zero, this pin stops telling the two apart and says so here rather than
  // passing quietly.
  const absentRoot = path.join(os.tmpdir(), `enumerate-absent-selftest-${process.pid}-no-such-dir`);
  assert.ok(!fs.existsSync(absentRoot), 'the absent-root fixture must genuinely not exist, or this pin measures nothing');
  const absentRun = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--enumerate', absentRoot], { encoding: 'utf8' });
  assert.equal(
    absentRun.status,
    ROOT_UNREADABLE,
    `an absent root must exit ROOT_UNREADABLE, not 0 -- exiting 0 is the gh#221 silent-success class, got ${absentRun.status}:\n${absentRun.stdout}`,
  );
  assert.match(absentRun.stdout, /NOTHING MEASURED/, 'an absent root must say so in words, not only in an exit code');

  const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'enumerate-empty-selftest-'));
  const emptyRun = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--enumerate', emptyRoot], { encoding: 'utf8' });
  assert.equal(
    emptyRun.status,
    0,
    `a present but empty root IS a successful empty measurement and must exit 0, got ${emptyRun.status}:\n${emptyRun.stdout}`,
  );
  assert.doesNotMatch(emptyRun.stdout, /NOTHING MEASURED/, 'a real empty measurement must not borrow the absent-root wording');
  assert.notEqual(
    absentRun.status,
    emptyRun.status,
    'an absent root and an empty one must be distinguishable by exit code alone, not only by their text',
  );
  fs.rmSync(emptyRoot, { recursive: true, force: true });

  console.log('mockup-divergence-check --selftest: ok (present -> green, deleted -> red naming the owner, absent -> green, reintroduced -> red, --force releases the file layer only, index-file widening classifies all 4 shapes including ambiguous, --enumerate reconciles against the unfiltered entry count, resolves a symlinked directory, names a dangling one, and separates an absent root from an empty one by exit code)');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--selftest')) {
    // .then rather than `await`: same top-level-await hazard as --enumerate below, since selftest now
    // spawns this same CLI's --enumerate as its second pin.
    selftest().then(
      () => process.exit(0),
      (err) => {
        console.error(err);
        process.exit(1);
      },
    );
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
      console.error('  Each one is a deliberate decision recorded in src/play/_divergences.json: restore what is GONE, delete what is BACK, or remove the entry with a reason.');
      process.exit(1);
    }
    const forbidden = recorded.filter((e) => e.absent === true);
    console.log(
      `mockup-divergence-check: ${recorded.length} recorded divergence(s) across ${Object.keys(registry).length} route(s) — ` +
        `${recorded.length - forbidden.length} still present in the files that ship, ${forbidden.length} still absent from them`,
    );
    console.log('  not covered here: unrecorded drift — that is the file layer\'s job and it runs inside extract-mockup.mjs, which has a mockup to compare against; also anything outside markup.html/style.css/main.js');
  }
}
