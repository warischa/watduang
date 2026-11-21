#!/usr/bin/env node
// Gate: the prize-words history files are append-only against the published base.
//
// WHY. src/prize-words/revisions.json (bank revision -> content hash),
// src/prize-words/ids-snapshot.json (word id -> word) and src/prize-round/deal-revisions.json (deal
// revision -> fingerprint of what a phone derives from a code) exist so a bank or composition edit
// cannot silently rewrite what an earlier revision meant. But the only thing guarding each file was the file itself:
// a commit that edits the bank can rewrite the matching history entry in the same edit, and every
// self-consistency test stays green. A cross-lineage review found exactly that gap. This gate pins
// the history to something the commit under review cannot touch: the published git base.
//
// THE RULE. Every key either file holds at the BASE TIP must still exist in the working tree with
// the same value. New keys pass (append). A file absent at the base pins 0 keys and passes, printed
// as "0 keys pinned, armed from the next push" -- that is the first push's result by construction.
// Everything else fails: a rewritten or dropped key; a file present at the base but missing or
// unparseable in the tree; a base copy that is unparseable or not a key -> value object; any git
// error while reading the base. Only a clean "the path is not in the base tree" answer counts as
// absent -- an error never reads as absent, or a broken read would pass as "0 keys pinned".
//
// THE BASE is not resolved here. It is resolveRange() imported from added-lineno-citation-check.mjs,
// the gate that already diffs a push against its base, so the two can never disagree about what the
// published base is: explicit argument or CITATION_DIFF_RANGE > PR base sha > github.event.before >
// merge-base with origin/main or main > FAIL CLOSED. The ci.yml step carries the same env block as
// the citation step, and scripts/run-workflow-gates.sh exports the same CITATION_DIFF_RANGE (the
// merge-base with origin/main) to both, when it can derive one.
//
// REJECTED, on purpose: checking every commit in history, or pinning each key's FIRST introduction.
// Both red a correct tree one push after a same-batch fix-up (a key written, corrected before
// publishing, then pushed) -- history that never reached the published base is not history.
//
// KNOWN RESIDUALS, not closed here:
//   * A tamper already AT the base is invisible: the base is the reference, so a rewrite that was
//     published is the new truth to this gate.
//   * When the resolved base equals HEAD (a tag push, or a force-push onto main via the merge-base
//     fallback), the comparison is the tree against its own commit. That is printed on the verdict
//     line, never failed: it proves only that the working tree did not rewrite HEAD.
//   * Locally the base can sit BEHIND the published tip, and an older base pins fewer keys. Run bare,
//     or through run-workflow-gates.sh with HEAD already on origin/main, the resolver's default is
//     HEAD~1, so a key first published in the tip commit is pinned in CI but not here; a stale
//     origin/main moves the merge-base back the same way. A local green is weaker than CI's.
//
//   node scripts/prize-words-history-check.mjs              -> check against the resolved base
//   node scripts/prize-words-history-check.mjs <rev>        -> explicit base, same as the citation gate
//   node scripts/prize-words-history-check.mjs --selftest   -> must-red calibration in a temp repo

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolveRange } from './added-lineno-citation-check.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const PINNED_FILES = ['src/prize-words/revisions.json', 'src/prize-words/ids-snapshot.json', 'src/prize-round/deal-revisions.json'];

function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

const isKeyValueObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Parse one copy of a pinned file. Returns { obj } or { error }.
function parseCopy(text, label) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    return { error: `${label} is not valid JSON (${e.message})` };
  }
  if (!isKeyValueObject(obj)) return { error: `${label} is not a key -> value object` };
  return { obj };
}

// Pure of process state: everything comes from opts, so the selftest can drive it with its own env.
// Returns { error } when no base resolves, else { base, source, baseIsHead, files: [...] }.
function checkHistory({ cwd, argv, env, files }) {
  const r = resolveRange(argv, env, cwd);
  if (r.error) return { error: r.error };
  const base = git(cwd, 'rev-parse', '--verify', `${r.base}^{commit}`).trim();
  const head = git(cwd, 'rev-parse', '--verify', 'HEAD^{commit}').trim();
  const results = [];
  for (const file of files) {
    const res = { file, pinned: 0, added: 0, absentAtBase: false, violations: [] };
    results.push(res);
    // An empty listing is the one answer that means "absent". A git error throws, never "absent".
    const listed = git(cwd, 'ls-tree', '--name-only', base, '--', file).trim();
    if (!listed) {
      res.absentAtBase = true;
      continue;
    }
    const old = parseCopy(git(cwd, 'show', `${base}:${file}`), `the base copy (${base.slice(0, 12)})`);
    if (old.error) {
      res.violations.push(old.error);
      continue;
    }
    res.pinned = Object.keys(old.obj).length;
    const abs = path.join(cwd, file);
    if (!fs.existsSync(abs)) {
      res.violations.push(`present at base with ${res.pinned} key(s), missing from the working tree`);
      continue;
    }
    const now = parseCopy(fs.readFileSync(abs, 'utf8'), 'the working-tree copy');
    if (now.error) {
      res.violations.push(now.error);
      continue;
    }
    for (const [k, v] of Object.entries(old.obj)) {
      if (!Object.hasOwn(now.obj, k)) res.violations.push(`key ${JSON.stringify(k)} dropped since base`);
      else if (!isDeepStrictEqual(now.obj[k], v)) res.violations.push(`key ${JSON.stringify(k)} rewritten since base`);
    }
    res.added = Object.keys(now.obj).filter((k) => !Object.hasOwn(old.obj, k)).length;
  }
  return { base, source: r.source, baseIsHead: base === head, files: results };
}

function report(out) {
  const lines = [];
  let violations = 0;
  let pinned = 0;
  for (const f of out.files) {
    pinned += f.pinned;
    violations += f.violations.length;
    if (f.absentAtBase) lines.push(`  ${f.file}: 0 keys pinned (absent at base), armed from the next push`);
    else if (f.violations.length) for (const v of f.violations) lines.push(`  ${f.file}: ${v}`);
    else lines.push(`  ${f.file}: ${f.pinned} key(s) pinned, all present and unchanged; ${f.added} new key(s) appended`);
  }
  const headNote = out.baseIsHead
    ? ' -- base equals HEAD, so this compares the tree with its own commit and proves only that the working tree did not rewrite HEAD'
    : '';
  lines.push(
    `prize-words-history-check: base ${out.base.slice(0, 12)} (${out.source}); ${out.files.length} file(s), ` +
      `${pinned} key(s) pinned, ${violations} violation(s)${headNote}`,
  );
  return { ok: violations === 0, lines };
}

function selftest() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prize-words-history-'));
  try {
    // A branch that is not main and no remote: the merge-base fallback has nothing to resolve, so
    // the fail-closed case cannot be rescued by it.
    git(root, 'init', '-q', '-b', 'selftest-work');
    git(root, 'config', 'user.email', 'selftest@example.invalid');
    git(root, 'config', 'user.name', 'selftest');
    const REV = 'src/prize-words/revisions.json';
    const IDS = 'src/prize-words/ids-snapshot.json';
    const DEAL = 'src/prize-round/deal-revisions.json';
    // The selftest drives its own file list, so it must name every pinned file or a dropped pin stays green.
    assert.deepEqual([...PINNED_FILES].sort(), [REV, IDS, DEAL].sort(), 'the selftest must cover exactly PINNED_FILES');
    const write = (rel, text) => {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), text);
    };
    const writeJson = (rel, obj) => write(rel, `${JSON.stringify(obj, null, 2)}\n`);
    const commit = (msg) => {
      git(root, 'add', '-A');
      git(root, 'commit', '-q', '--allow-empty', '-m', msg);
      return git(root, 'rev-parse', 'HEAD').trim();
    };
    // Explicit env objects only: the CI step env and an exported CITATION_DIFF_RANGE must never leak in.
    const run = (env, argv = []) => checkHistory({ cwd: root, argv, env, files: [REV, IDS, DEAL] });
    const at = (sha) => ({ CITATION_DIFF_RANGE: sha });
    const baseRev = { 1: 'hash-one' };
    const baseIds = { 'w-001': 'alpha', 'w-002': 'beta' };
    const baseDeal = { 1: { revision: 1, hash: 'deal-one', date: '2026-01-01', note: 'first' }, 2: { revision: 2, hash: 'deal-two', date: '2026-01-02', note: 'second' } };

    // (5) absent at base: the base commit holds neither file.
    write('README', 'x\n');
    const empty = commit('empty base');
    writeJson(REV, baseRev);
    writeJson(IDS, baseIds);
    writeJson(DEAL, baseDeal);
    let out = run(at(empty));
    let rep = report(out);
    assert.equal(rep.ok, true, 'case 5: a file absent at base must pass');
    assert.ok(rep.lines.some((l) => l.includes(`${REV}: 0 keys pinned (absent at base), armed from the next push`)), 'case 5: the 0-keys line must print');
    console.log('PASS case 5  absent at base            -> green, "0 keys pinned ... armed from the next push"');

    const base = commit('published base');

    // (3) append, through the CI precedence path (github.event.before) rather than the explicit one.
    writeJson(REV, { ...baseRev, 2: 'hash-two' });
    writeJson(IDS, { ...baseIds, 'w-003': 'gamma' });
    out = run({ GITHUB_ACTIONS: 'true', GITHUB_EVENT_BEFORE: base });
    rep = report(out);
    assert.equal(rep.ok, true, 'case 3: an append must pass');
    assert.equal(out.source, 'github.event.before', 'case 3: the base must come from the shared resolver');
    assert.equal(out.files[0].pinned + out.files[1].pinned, 3, 'case 3: every base key must be pinned');
    assert.equal(out.files[0].added + out.files[1].added, 2, 'case 3: both appended keys must be counted');
    assert.equal(out.files[2].pinned, 2, 'case 3: every deal-revisions base key must be pinned');
    console.log('PASS case 3  append                    -> green, 3 key(s) pinned, 2 appended');

    // (1) rewriting an existing revisions.json entry.
    writeJson(REV, { 1: 'hash-REWRITTEN', 2: 'hash-two' });
    rep = report(run(at(base)));
    assert.equal(rep.ok, false, 'case 1: a rewritten revisions entry must fail');
    assert.ok(rep.lines.some((l) => l.includes(`${REV}: key "1" rewritten since base`)), 'case 1: the rewritten key must be named');
    console.log('PASS case 1  revisions entry rewritten -> red');
    writeJson(REV, baseRev);

    // (2) shrinking ids-snapshot.json.
    writeJson(IDS, { 'w-001': 'alpha' });
    rep = report(run(at(base)));
    assert.equal(rep.ok, false, 'case 2: a dropped ids-snapshot key must fail');
    assert.ok(rep.lines.some((l) => l.includes(`${IDS}: key "w-002" dropped since base`)), 'case 2: the dropped key must be named');
    console.log('PASS case 2  ids-snapshot key dropped  -> red');
    writeJson(IDS, baseIds);

    // (6) deal-revisions.json: one field rewritten inside a published entry, then an entry dropped. Checked twice:
    // through report(), and through the real CLI process, whose exit code is what CI reads. The CLI runs from a copy
    // of this script inside the temp repo, so its repo root is that repo; a minimal env keeps CI's range out.
    const here = fileURLToPath(import.meta.url);
    for (const f of [here, path.join(path.dirname(here), 'added-lineno-citation-check.mjs')]) {
      write(path.join('scripts', path.basename(f)), fs.readFileSync(f, 'utf8'));
    }
    const cli = () =>
      spawnSync(process.execPath, [path.join(root, 'scripts', path.basename(here)), base], {
        cwd: root,
        encoding: 'utf8',
        env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' },
      });
    let proc = cli();
    assert.equal(proc.status, 0, `case 6: the CLI must exit 0 on an untouched tree (stderr: ${proc.stderr})`);
    writeJson(DEAL, { ...baseDeal, 1: { ...baseDeal[1], hash: 'deal-REWRITTEN' } });
    rep = report(run(at(base)));
    assert.equal(rep.ok, false, 'case 6: a rewritten deal-revisions entry must fail');
    assert.ok(rep.lines.some((l) => l.includes(`${DEAL}: key "1" rewritten since base`)), 'case 6: the rewritten deal entry must be named');
    proc = cli();
    assert.notEqual(proc.status, 0, 'case 6: the CLI must exit non-zero on a rewritten deal entry');
    assert.ok(proc.stderr.includes(`${DEAL}: key "1" rewritten since base`), 'case 6: the CLI must name the rewritten deal entry');
    writeJson(DEAL, { 1: baseDeal[1], 3: { revision: 3, hash: 'deal-three', date: '2026-01-03', note: 'third' } });
    rep = report(run(at(base)));
    assert.equal(rep.ok, false, 'case 6: a dropped deal-revisions entry must fail, even with a new one appended');
    assert.ok(rep.lines.some((l) => l.includes(`${DEAL}: key "2" dropped since base`)), 'case 6: the dropped deal entry must be named');
    proc = cli();
    assert.notEqual(proc.status, 0, 'case 6: the CLI must exit non-zero on a dropped deal entry');
    assert.ok(proc.stderr.includes(`${DEAL}: key "2" dropped since base`), 'case 6: the CLI must name the dropped deal entry');
    console.log('PASS case 6  deal entry rewritten / dropped -> red, in report() and in the CLI exit code');
    writeJson(DEAL, baseDeal);

    // (4) unresolvable base fails closed: an explicit nonexistent rev, and the CI path with an
    // all-zeros before and no main to fall back on.
    out = run(at('f'.repeat(40)));
    assert.ok(out.error && /does not resolve/.test(out.error), 'case 4: an explicit nonexistent base must fail closed');
    out = run({ GITHUB_ACTIONS: 'true', GITHUB_EVENT_BEFORE: '0'.repeat(40) });
    assert.ok(out.error && /no usable base/.test(out.error), 'case 4: an all-zeros before with no fallback must fail closed');
    console.log('PASS case 4  unresolvable base         -> red (fails closed, explicit rev and CI path)');

    // Extra: a git error AFTER the base resolves (here, a path git refuses) throws, which main()
    // turns into a red exit -- it never reads as "absent at base".
    assert.throws(
      () => checkHistory({ cwd: root, argv: [], env: at(base), files: ['../outside-the-repo.json'] }),
      /outside repository/,
      'extra: a git error must throw, not read as absent',
    );
    console.log('PASS extra   git error on the base read -> throws (red), not "absent"');

    // Extra: present at base but missing, or unparseable, in the tree.
    fs.rmSync(path.join(root, REV));
    rep = report(run(at(base)));
    assert.equal(rep.ok, false, 'extra: a pinned file deleted from the tree must fail');
    // Truncated JSON, built rather than typed: an unbalanced brace in a literal would desync the
    // brace-matching the selftest-coverage meta-check uses to find this body.
    write(REV, JSON.stringify(baseRev).slice(0, -1));
    rep = report(run(at(base)));
    assert.equal(rep.ok, false, 'extra: an unparseable working-tree copy must fail');
    write(REV, '["hash-one"]\n');
    rep = report(run(at(base)));
    assert.equal(rep.ok, false, 'extra: a working-tree copy that is not an object must fail');
    console.log('PASS extra   tree copy missing / unparseable / not an object -> red');
    writeJson(REV, baseRev);

    // Extra: a corrupt BASE copy is a failure, never "absent at base".
    write(REV, 'not json at all');
    const corrupt = commit('corrupt base');
    writeJson(REV, baseRev);
    rep = report(run(at(corrupt)));
    assert.equal(rep.ok, false, 'extra: an unparseable base copy must fail, not read as absent');
    assert.ok(rep.lines.some((l) => l.includes(`${REV}: the base copy`)), 'extra: the corrupt base copy must be named');
    console.log('PASS extra   base copy unparseable     -> red, not "absent"');

    // Extra: base equals HEAD is labelled, not failed.
    const head = commit('repair');
    rep = report(run(at(head)));
    assert.equal(rep.ok, true, 'extra: base == HEAD with a clean tree passes');
    assert.ok(rep.lines.at(-1).includes('base equals HEAD'), 'extra: base == HEAD must be labelled on the verdict line');
    console.log('PASS extra   base equals HEAD          -> green, labelled as comparing the tree with itself');

    console.log('prize-words-history-check --selftest: all cases met');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function main() {
  if (process.argv.includes('--selftest')) return selftest();
  let out;
  try {
    out = checkHistory({ cwd: repoRoot, argv: process.argv.slice(2), env: process.env, files: PINNED_FILES });
  } catch (e) {
    console.error(`::error::prize-words-history-check: could not read the base, CHECKED NOTHING -- ${e.message}`);
    process.exit(1);
  }
  if (out.error) {
    console.error(`::error::prize-words-history-check: BASE UNAVAILABLE, CHECKED NOTHING -- ${out.error}`);
    console.error('Fails closed on purpose: no base means no history to pin, and a green would read like a real pass.');
    process.exit(1);
  }
  const { ok, lines } = report(out);
  for (const l of lines) (ok ? console.log : console.error)(l);
  if (!ok) {
    console.error('History entries are append-only: add a new key for a new revision or word, never edit or drop a published one.');
    process.exit(1);
  }
}

main();
