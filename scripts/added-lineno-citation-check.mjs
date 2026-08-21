#!/usr/bin/env node
// Regression gate for the durable-symbol citation convention adopted at 9108069.
//
// The hazardous form: a reference that names a source line by NUMBER — a path ending in a
// non-md extension, then a colon, then a digit run. Any edit above that line silently rots it,
// and scripts/check-citations.mjs cannot see it: its lineNoRe requires a .md extension, so a
// citation INTO a source file has never been checked by anything. The <dialog> conversion in
// S2026-08-21 shifted lines and left both an ADR and a unit test pointing at the wrong code, one
// of them at a claim's central symbol. No gate noticed.
//
// The safe form is the durable symbol: `clear() in session.ts`, never the file plus a number.
// This gate detects the hazardous form and bans it from lines a push ADDS. Inverted guard: the
// set of ways a citation can go stale is unbounded, but "does this text contain a non-md path,
// a colon and a digit run" is finite, decidable and cheap.
//
// --- Why diff-scoped and not tree-wide ------------------------------------------------------
// Measured at 9108069: 182 such citations already exist across src/, docs/ and scripts/ — 69 in
// docs/sessions-archive.md, 25 under docs/verification/evidence/, 88 elsewhere. Two are
// unfixable by construction, not merely tedious:
//   * docs/verification/gh13-real-device-script.md declares the form as its own contract — every
//     claim it makes about app behaviour is deliberately anchored to a file-and-line pair, for
//     whoever re-runs the script later. Converting it rewrites a verification record's method.
//   * docs/verification/adr-0010-findings.md freezes a Calibration paragraph under a Supersession
//     heading that says "Stale above — do not reuse these numbers". Re-anchoring the citation
//     inside it to a durable symbol would make a frozen record describe TODAY's code instead of
//     the superseded state it exists to preserve. That falsifies the record, it does not fix it.
// So a tree-wide ban needs an 88-entry grandfather list that decays into noise, or it fires on 88
// pre-existing lines and gets switched off. The set THIS gate owns is "lines this push added" —
// finite, owned by the commit under review, needs no allow-list, converges on day one. The 88
// stay exactly where they are.
//
// --- Usage ----------------------------------------------------------------------------------
//   node scripts/added-lineno-citation-check.mjs             -> default range HEAD~1 -> working tree
//   node scripts/added-lineno-citation-check.mjs HEAD~3      -> explicit rev, or A..B
//   CITATION_DIFF_RANGE=A..B node scripts/added-lineno-citation-check.mjs
//   node scripts/added-lineno-citation-check.mjs --selftest  -> both-direction calibration
//
// --- Range unavailable: FAILS CLOSED, loudly -------------------------------------------------
// github.event.before is all-zeros on a branch's first push and stale after a force-push, and
// actions/checkout is shallow by default (ci.yml sets fetch-depth: 0 for this gate). When the base
// rev cannot be resolved this script EXITS NON-ZERO and names why, rather than diffing an empty
// range and printing a green "0 found". A gate that cannot fail reads exactly like a passing one,
// and this repo has already shipped one of those. The error names the override that unblocks a
// legitimate case.
//
// --- ponytail: what this gate provably CANNOT catch ------------------------------------------
//  1. It cannot tell a CORRECT line number from a wrong one. It bans the FORM, not the fact. A
//     newly added citation pointing at the wrong line is caught only because the form itself is
//     banned; a citation already in the tree that rots later is invisible here forever.
//  2. It only sees the shape. A citation written in prose — "the third branch of clear()", "around
//     line 245 of session.ts" — carries the same rot risk and is never matched. That set is owned
//     by whoever writes the next sentence and does not converge (ADR-0019).
//  3. It only sees the diff range. Anything committed outside it is out of scope BY DESIGN, per
//     the section above: a green run means "this push added none", never "the repo has none".
//  4. A moved line is exempt only when the identical token still exists in the SAME file's
//     pre-image. A citation moved to a DIFFERENT file reads as new and trips. Stated rather than
//     surprising — the fail direction is the conservative one.
//  5. Unified-diff path parsing assumes plain ASCII paths (no git-quoted paths). True of this repo.
//  6. Two near-miss spellings bypass the pattern, deliberately not covered: a GitHub permalink
//     anchor (a path followed by #L245) and the colon-space form (a path, a colon, a space, then a
//     number). Both rot exactly like the banned form. Widening for them starts matching ordinary
//     prose — "session.ts: 245 of them" is a sentence, not a citation — and a noisy gate gets
//     switched off, after which it protects nothing. Narrow and trusted beats broad and noisy.
//     Revisit only on a measurement showing either form actually being used here.
//  7. Excluded paths are unpoliced by construction: docs/verification/evidence/ (verbatim tool
//     output, where the banned shape is the evidence), SESSION-HANDOFF.md and
//     docs/sessions-archive.md (verbatim records). See the exclusion comments below for why each is
//     a record rather than a pointer.
//  8. The merge-base fallback can equal HEAD — on a tag push, and on a force-push to main, where
//     origin/main is re-fetched at the new tip. The range is then empty and the run scans nothing.
//     That is correct for a tag push (those commits were gated when they were pushed) and a real
//     hole for a force-push to main. Not silently green: the success line labels an empty range as
//     proving nothing. Closing it properly needs the pre-force-push SHA, which the job cannot see.
//  9. A red run is never re-examined. CI runs on push, so a red blocks that push's deploy only;
//     the next push diffs itself alone, the offending citation is by then part of the base, and
//     deploy resumes with it in the tree. Diff-scoping buys convergence at this price: the gate
//     stops the ninety-first from landing unnoticed, it does not remove one that was overridden.
//     Read a red as a decision point, not a speed bump.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

// Both excluded files are the same kind of thing: a verbatim record of what was true at a moment.
// docs/sessions-archive.md is never edited or converted by policy (CLAUDE.md, "Write English. Ship
// Thai.") and holds 69 of the pre-existing citations; SESSION-HANDOFF.md is that same content
// pre-roll — entries are written there and later roll into the archive, and a handoff entry's whole
// job is to cite the exact lines a finding rests on. Re-anchoring either to today's symbols would
// make the record describe today's code instead of the moment it documents, which falsifies it
// rather than fixing a pointer — the identical reason the frozen Supersession paragraph in
// docs/verification/adr-0010-findings.md cannot be converted. This is not laziness: a record and a
// pointer are different artifacts, and only the pointer is supposed to track the code.
const EXCLUDE_FILES = new Set(['docs/sessions-archive.md', 'SESSION-HANDOFF.md']);
// docs/verification/evidence/ holds captured TOOL OUTPUT quoted verbatim — tsc diagnostics (a path,
// a line, a column, then the message), `grep -n` pastes, stack traces. Those are the banned shape by pure
// coincidence of format, and they are the evidence itself: an agent cannot re-anchor them without
// destroying what the capture proves. Without this exclusion the next honest evidence capture goes
// red with no in-repo escape, and a gate that blocks honest evidence capture gets deleted — after
// which it protects nothing. dist/, node_modules/ and .astro/ are build output and vendor code, not
// authored here, so nothing in them is a citation this repo owns.
const EXCLUDE_DIR_PREFIXES = ['docs/verification/evidence/', 'node_modules/', 'dist/', '.astro/'];

// ---------------------------------------------------------------------------
// Pure: text -> hazards. No IO, so the selftest can feed it strings directly.
// ---------------------------------------------------------------------------
// Square brackets are in the path class deliberately: Astro dynamic routes are named
// `game/[id].astro`, and without them the leading `[` breaks the path so the whole citation goes
// undetected. That exact form is cited by line throughout src/shell/session.test.mjs — measured,
// it was the first false negative this gate produced against real repo history.
const HAZARD_RE = /\b([A-Za-z0-9_./[\]-]+\.([A-Za-z0-9]+)):(\d+)(?:-(\d+))?\b/g;

// citingIsMd MUST be passed by every caller: it decides whether .md targets are in scope, and the
// safe default is "in scope". scanRoot in scripts/check-citations.mjs walks .md files ONLY, so a
// `.md` target cited FROM a source file is validated by nobody — it is green in both gates and rots
// exactly like the form banned here. Skipping .md unconditionally (the original condition) was
// justified by a false premise about that script's coverage.
function findHazards(text, citingIsMd) {
  const out = [];
  for (const m of text.matchAll(HAZARD_RE)) {
    const ext = m[2].toLowerCase();
    // A .md target cited from a .md file is genuinely check-citations.mjs's: it resolves the target,
    // checks the line exists and matches any quoted content. Flagging it here would double-police a
    // form that gate already validates rather than bans. From any other citing file it is unowned.
    if (ext === 'md' && citingIsMd) continue;
    // A file extension is never all digits: this is a dotted-quad host plus a port, e.g. the CDP
    // endpoint in scripts/roster-lock-two-tab-race.mjs. Two such lines exist today.
    if (/^\d+$/.test(ext)) continue;
    // A URL authority plus a port. Checked as the literal three characters before the match so a
    // repo path that merely starts with a slash is not swept up with it.
    if (text.slice(Math.max(0, m.index - 3), m.index) === '://') continue;
    out.push({ token: m[0], path: m[1], ext });
  }
  return out;
}

// Parses `git diff --unified=0` output into the lines the range ADDS. A line that is only moved
// still appears here as an addition — the pre-image check in scan() is what exempts it, not this.
function addedLines(diffText) {
  const out = [];
  let file = null;
  let nextLine = 0;
  let sawMinusHeader = false;
  for (const raw of diffText.split('\n')) {
    if (raw.startsWith('--- ')) {
      sawMinusHeader = true;
      continue;
    }
    // Only a `+++ ` that FOLLOWS a `--- ` is a header. Added content of the form `++ text` also
    // renders as `+++ text` in a diff body, and treating it as a header would silently re-attribute
    // every following line to a file that does not exist.
    if (sawMinusHeader && raw.startsWith('+++ ')) {
      sawMinusHeader = false;
      const p = raw.slice(4).trim();
      file = p === '/dev/null' ? null : p.replace(/^b\//, '');
      continue;
    }
    sawMinusHeader = false;
    if (raw.startsWith('@@')) {
      const m = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
      nextLine = m ? Number(m[1]) : 0;
      continue;
    }
    if (raw.startsWith('+') && file) {
      out.push({ file, line: nextLine, text: raw.slice(1) });
      nextLine++;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Range resolution. Every failure path returns { error } — never a usable empty range.
// ---------------------------------------------------------------------------
function revExists(rev, cwd) {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`], { cwd, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// The fork point from the default branch. Only a fallback: a real push range is always preferred,
// because a long-lived branch's merge-base re-reads every commit on it as added.
function mergeBaseWithDefault(cwd) {
  for (const ref of ['origin/main', 'main']) {
    if (!revExists(ref, cwd)) continue;
    try {
      const sha = execFileSync('git', ['merge-base', ref, 'HEAD'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (sha) return { sha, ref };
    } catch {
      continue; // no common ancestor with this ref
    }
  }
  return null;
}

const isMd = (file) => file.toLowerCase().endsWith('.md');

function resolveRange(argv, env, cwd) {
  const explicit = argv.find((a) => !a.startsWith('-')) ?? env.CITATION_DIFF_RANGE ?? '';
  if (explicit) {
    const base = explicit.split('..')[0] || explicit;
    if (!revExists(base, cwd)) {
      return { error: `range "${explicit}" was given, but its base rev "${base}" does not resolve in this clone` };
    }
    return { range: explicit, base, source: 'explicit range' };
  }

  if (env.GITHUB_ACTIONS) {
    // pull_request carries no github.event.before; its base is the PR's base sha. This workflow is
    // direct-to-main today, but ci.yml still triggers `on: pull_request`, so handle both.
    const prBase = env.GITHUB_PR_BASE_SHA ?? '';
    if (prBase && revExists(prBase, cwd)) return { range: `${prBase}..HEAD`, base: prBase, source: 'github.event.pull_request.base.sha' };
    const before = env.GITHUB_EVENT_BEFORE ?? '';
    if (before && !/^0+$/.test(before) && revExists(before, cwd)) {
      return { range: `${before}..HEAD`, base: before, source: 'github.event.before' };
    }
    // before is empty, all-zeros (a branch's first push, or a tag push) or missing from the clone
    // (force-push). Those are routine here — this repo calibrates CI on throwaway branches on
    // purpose — so fall back to the fork point from the default branch before failing closed.
    const mb = mergeBaseWithDefault(cwd);
    if (mb) return { range: `${mb.sha}..HEAD`, base: mb.sha, source: `merge-base with ${mb.ref} (github.event.before was ${before || 'empty'})` };
    return {
      error: `under GitHub Actions with no usable base: github.event.before is ${before || 'empty'}, no PR base sha was given, and neither origin/main nor main resolves for a merge-base fallback`,
    };
  }

  if (!revExists('HEAD~1', cwd)) {
    return { error: 'no range given and HEAD~1 does not resolve (shallow clone, or the repo has a single commit)' };
  }
  return { range: 'HEAD~1', base: 'HEAD~1', source: 'local default, HEAD~1 -> working tree' };
}

// ---------------------------------------------------------------------------
function preImageText(base, file, cwd) {
  try {
    // stderr ignored: "path X exists on disk, but not in <rev>" is the expected, normal answer for
    // a file this range creates, and letting git print it would put fatal: noise above a green run.
    return execFileSync('git', ['show', `${base}:${file}`], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null; // file did not exist at base — everything in it is genuinely new
  }
}

function scan({ range, base }, cwd) {
  const diff = execFileSync('git', ['diff', '--unified=0', '--no-color', range, '--'], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  const all = addedLines(diff);

  // A file git does not track yet is invisible to `git diff`, so `node scripts/... ` run before
  // `git add` would miss a brand-new file entirely — the one moment a human most wants this answer.
  // When the range ends at the working tree (no `..`), fold untracked files in as wholly added.
  // A..B ranges are commit-to-commit and can have no untracked content, so this never applies there.
  if (!range.includes('..')) {
    const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
    for (const file of untracked) {
      let buf;
      try {
        buf = fs.readFileSync(path.join(cwd, file));
      } catch {
        continue;
      }
      if (buf.includes(0)) continue; // binary
      // replace(/\n$/, '') first: splitting a newline-terminated file yields a phantom trailing
      // empty element, which would inflate the added-line count this script reports as measured.
      buf
        .toString('utf8')
        .replace(/\n$/, '')
        .split('\n')
        .forEach((text, i) => all.push({ file, line: i + 1, text }));
    }
  }

  const filesInDiff = new Set(all.map((a) => a.file));
  const added = all.filter(
    (a) => !EXCLUDE_FILES.has(a.file) && !EXCLUDE_DIR_PREFIXES.some((p) => a.file.startsWith(p)),
  );

  // Exact-token membership, never substring. A plain `before.includes(token)` launders a genuinely
  // new citation whenever an existing one has it as a PREFIX: a new citation of roster.ts at line 24
  // rides in under an existing one at line 245, and a bare-filename citation of session.ts rides in
  // under a full-path citation of the same file and line. Worst exactly in citation-dense files, and
  // it corrupted the moved count too, so the success line reported a brand-new citation as a move.
  // Tokenising the pre-image with the same detector makes the comparison symmetric and decidable.
  // (Spelled out in prose rather than shown: this file must never contain the shape it bans.)
  const preImageTokens = new Map();
  const violations = [];
  let moved = 0;
  for (const a of added) {
    const citingIsMd = isMd(a.file);
    for (const h of findHazards(a.text, citingIsMd)) {
      if (!preImageTokens.has(a.file)) {
        const before = preImageText(base, a.file, cwd);
        preImageTokens.set(a.file, before === null ? null : new Set(findHazards(before, citingIsMd).map((x) => x.token)));
      }
      const tokens = preImageTokens.get(a.file);
      if (tokens && tokens.has(h.token)) {
        moved++;
        continue;
      }
      violations.push({ ...a, ...h });
    }
  }
  return { filesInDiff, filesScanned: new Set(added.map((a) => a.file)).size, addedLinesScanned: added.length, violations, moved };
}

// ---------------------------------------------------------------------------
// Self-test: a throwaway git repo, never repo content, so fixing a doc can't retune the check.
// Calibrated both ways — a known-good commit must stay clean and a known-bad one must trip.
// ---------------------------------------------------------------------------
function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function selftest() {
  // The hazardous shape is built from parts everywhere below, so this FILE never contains a
  // literal instance of what it bans. check-citations.mjs hit the same wall (its ceiling 3: a
  // checker cannot describe its own subject matter) and had to carve out an exclusion; building
  // the fixtures instead keeps this gate with zero self-exemption.
  const at = (f, n) => `${f}:${n}`;

  // --- pure detector, both directions -------------------------------------------------------
  const fromMd = (t) => findHazards(t, true);
  const fromSrc = (t) => findHazards(t, false);
  assert.equal(fromSrc(`see ${at('src/shell/session.ts', 245)} for the reset`).length, 1, 'a source line-number citation must be detected');
  assert.equal(fromSrc(`spans ${at('src/shell/session.ts', '245-260')} here`).length, 1, 'a line RANGE citation must be detected');
  // Astro dynamic route. Without `[` and `]` in the path class this goes completely undetected,
  // which is what the gate actually did on its first real run against repo history.
  assert.equal(fromSrc(`cited at ${at('src/pages/game/[id].astro', '50-51')} in the suite`).length, 1, 'a bracketed Astro dynamic-route path must be detected');
  assert.equal(fromSrc('see clear() in session.ts for the reset').length, 0, 'the durable-symbol form must stay clean');
  // The .md skip is conditional on the CITING file. check-citations.mjs walks .md files only, so
  // the same citation is owned by it from a .md file and by nobody from a source file.
  const mdTargets = `see ${at('docs/runbook.md', 12)} and ${at('CLAUDE.md', '5-9')}`;
  assert.equal(fromMd(mdTargets).length, 0, 'a .md target cited FROM a .md file belongs to check-citations.mjs — must not be double-policed');
  assert.equal(fromSrc(mdTargets).length, 2, 'a .md target cited FROM a source file is validated by nobody — it must be caught here');
  assert.equal(fromSrc(`curl ${at('http://127.0.0.1', 9222)}/json`).length, 0, 'a dotted-quad host plus port is not a citation');
  assert.equal(fromSrc(`open ${at('https://example.com', 8080)}/x`).length, 0, 'a URL authority plus port is not a citation');
  // Ceiling 6, pinned as CURRENT behaviour so widening the pattern goes red here and forces the
  // header to be updated rather than drifting out of sync with what the gate really does.
  assert.equal(fromSrc(`see ${'src/shell/session.ts'}#L245 for the reset`).length, 0, 'ceiling 6: a GitHub permalink anchor is deliberately not matched');
  assert.equal(fromSrc(`see ${'src/shell/session.ts'}: 245 for the reset`).length, 0, 'ceiling 6: the colon-space form is deliberately not matched');
  console.log('PASS detector calibrated both ways: flags the line-number form (single, range, bracketed route), and the SAME .md citation is skipped from a .md file but caught from a source file; clean on durable symbols, host:port, URL:port; ceiling-6 near-misses pinned as unmatched');

  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'added-lineno-cite-'));
  try {
    git(root, 'init', '--quiet', '--initial-branch=main');
    git(root, 'config', 'user.email', 'selftest@example.invalid');
    git(root, 'config', 'user.name', 'selftest');

    const w = (rel, lines) => {
      const abs = path.join(root, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, lines.join('\n') + '\n');
    };

    // --- base commit: two PRE-EXISTING hazardous citations, so both no-trip paths are testable ---
    w('live.ts', ['export const a = 1;', `// the old note points at ${at('roster.ts', 24)} and predates this gate`, 'export const b = 2;', 'export const z = 9;']);
    w('shifted.ts', ['export const p = 1;', `// another old note at ${at('audio.ts', 8)}, untouched by this commit`, 'export const q = 2;']);
    // dense.ts carries a LONGER pre-existing token, so the second commit's genuinely new, shorter
    // one is a strict PREFIX of it — the exact input the old substring exemption laundered.
    w('dense.ts', [`// pre-existing, cited before this gate: ${at('roster.ts', 245)}`, 'export const m = 1;']);
    w('docs/sessions-archive.md', ['# archive', 'untouched line']);
    w('SESSION-HANDOFF.md', ['# handoff', '## inflight', '(nothing yet)']);
    w('docs/verification/evidence/99/capture.md', ['# capture', 'baseline output follows']);
    git(root, 'add', '-A');
    git(root, 'commit', '--quiet', '-m', 'base');
    const base = git(root, 'rev-parse', 'HEAD').trim();

    // --- second commit -------------------------------------------------------------------
    // live.ts: the pre-existing citation is RELOCATED to the end of the file, byte-identical. git
    // emits it as a real `+` line, so only the pre-image check keeps it green.
    w('live.ts', ['export const a = 1;', 'export const b = 2;', 'export const z = 9;', `// the old note points at ${at('roster.ts', 24)} and predates this gate`]);
    // shifted.ts: a line inserted ABOVE the citation. Measured: git never re-emits the citation
    // line at all in this case, so the dominant real-world "my edit shifted the numbers" case
    // cannot reach the detector even before the pre-image exemption applies.
    w('shifted.ts', ['export const p = 1;', 'export const p2 = 11;', `// another old note at ${at('audio.ts', 8)}, untouched by this commit`, 'export const q = 2;']);
    // good.ts: the durable-symbol form only — must stay green.
    w('good.ts', ['// reset lives in clear() in session.ts, and the rationale is in ADR-0023', 'export const c = 3;']);
    // good.md: a .md target cited FROM a .md file. check-citations.mjs owns and resolves this one,
    // so flagging it here would double-police and contradict that gate.
    w('good.md', ['# doc', `Rationale: ${at('docs/adr/0023-x.md', 40)} — owned by check-citations.mjs.`]);
    // bad.ts / bad.md / bad.mjs: three genuinely new hazardous citations, one per citing-file kind.
    w('bad.ts', [`// see ${at('PlayerSetup.astro', 225)} for the guard`, 'export const d = 4;']);
    w('bad.md', ['# doc', `The stage is armed at ${at('src/games/timebomb.ts', '91-93')}.`]);
    w('bad.mjs', [`// probe target: ${at('wheel.astro', 164)}`]);
    // dense.ts: a brand-new citation that is a strict PREFIX of the pre-existing one above. The
    // substring exemption passed this and counted it as a move; exact-token membership must not.
    w('dense.ts', [`// pre-existing, cited before this gate: ${at('roster.ts', 245)}`, 'export const m = 1;', `// BRAND NEW today: ${at('roster.ts', 24)}`]);
    // md-from-src.ts: a .md target cited from a SOURCE file. check-citations.mjs walks .md files
    // only, so nothing validates this one — it must be caught here.
    w('md-from-src.ts', [`// see ${at('docs/runbook.md', 12)} for the OG steps`, 'export const n = 1;']);
    // evidence capture: verbatim tsc output. Excluded — the banned shape IS the evidence here.
    w('docs/verification/evidence/99/capture.md', ['# capture', 'baseline output follows', `${at('src/shell/session.ts', 245)}:3 - error ts(2339): Property 'x' does not exist.`]);
    // elsewhere.md: the IDENTICAL tsc line outside docs/verification/evidence/. It must go red, or
    // the exclusion above would be indistinguishable from the detector simply not matching it.
    w('elsewhere.md', ['# notes', `${at('src/shell/session.ts', 245)}:3 - error ts(2339): Property 'x' does not exist.`]);
    // SESSION-HANDOFF.md: a handoff entry citing exact lines as evidence — the same verbatim-record
    // content as docs/sessions-archive.md, pre-roll. Excluded for the same stated reason.
    w('SESSION-HANDOFF.md', ['# handoff', '## inflight', `S2026-08-21#3 — finding rests on ${at('src/shell/roster.ts', 38)} and ${at('scripts/leave-confirm-check.mjs', '100-102')}`]);
    // sessions-archive.md: excluded by policy. Its added line carries a hazardous citation, and the
    // assertion below proves the line really reached the diff — otherwise "excluded" and "never
    // scanned" would be indistinguishable (the vacuity trap check-citations documents).
    w('docs/sessions-archive.md', ['# archive', 'untouched line', `S2026-01-01#1 — noted ${at('session.ts', 12)} at the time`]);
    git(root, 'add', '-A');
    git(root, 'commit', '--quiet', '-m', 'second');

    const r = scan({ range: `${base}..HEAD`, base }, root);

    const badFiles = r.violations.map((v) => `${v.file} -> ${v.token}`).sort();
    assert.equal(r.violations.length, 6, `known-bad commit must report exactly 6 new citations, got ${r.violations.length}: ${badFiles.join(', ')}`);
    assert.deepEqual(
      [...new Set(r.violations.map((v) => v.file))].sort(),
      ['bad.md', 'bad.mjs', 'bad.ts', 'dense.ts', 'elsewhere.md', 'md-from-src.ts'],
      'the findings must be the planted files, not something incidental',
    );
    console.log(`PASS known-bad commit flags all 6 planted citations:\n${r.violations.map((v) => `     ${v.file}:${v.line} → ${v.token}`).join('\n')}`);

    // FINDING 1: prefix laundering. The new token must be reported, and — just as important — it
    // must NOT have been silently absorbed into the moved count.
    const dense = r.violations.filter((v) => v.file === 'dense.ts');
    assert.equal(dense.length, 1, 'a new citation that is a strict prefix of a pre-existing one must be caught, not laundered');
    assert.equal(dense[0].token, at('roster.ts', 24), `the reported token must be the NEW one, got ${dense[0].token}`);
    console.log(`PASS prefix laundering closed: new ${dense[0].token} caught under pre-existing ${at('roster.ts', 245)}, and not counted as a move`);

    // FINDING 3: the same .md target, red from a source file and green from a .md file.
    assert.equal(r.violations.filter((v) => v.file === 'md-from-src.ts').length, 1, 'a .md target cited from a source file is unowned and must be caught');
    assert.ok(r.filesInDiff.has('good.md'), 'good.md must reach the diff — otherwise the assertion below is vacuous');
    assert.equal(r.violations.filter((v) => v.file === 'good.md').length, 0, 'a .md target cited from a .md file belongs to check-citations.mjs and must stay green');
    console.log(`PASS ${at('docs/runbook.md', 12)} is RED from md-from-src.ts and GREEN from good.md — the skip now depends on the citing file, not a false premise about check-citations coverage`);

    // FINDING 2 + ADDITION A: the excluded records. Each pairs a "was in the diff" assertion with
    // its exemption, and the evidence case pairs with an identical line elsewhere going red — so
    // "excluded" can never be confused with "the detector never matched it".
    for (const [file, why] of [['docs/verification/evidence/99/capture.md', 'verbatim tool output'], ['SESSION-HANDOFF.md', 'verbatim record, pre-roll']]) {
      assert.ok(r.filesInDiff.has(file), `${file} must reach the diff — otherwise its exclusion assertion is vacuous`);
      assert.equal(r.violations.filter((v) => v.file === file).length, 0, `${file} is excluded (${why}) and must never be flagged`);
    }
    const control = r.violations.filter((v) => v.file === 'elsewhere.md');
    assert.equal(control.length, 1, 'the identical tsc-style line OUTSIDE the evidence tree must go red — otherwise the exclusion proves nothing');
    console.log(`PASS exclusions non-vacuous: the tsc line "${control[0].token}" is GREEN under docs/verification/evidence/ and RED in elsewhere.md; SESSION-HANDOFF.md entry with 2 tokens GREEN`);

    assert.equal(r.moved, 1, `the relocated pre-existing citation must be exempted exactly once, got ${r.moved}`);
    assert.equal(r.violations.filter((v) => v.file === 'live.ts').length, 0, 'a citation that only MOVED must not trip the gate');
    assert.ok(r.filesInDiff.has('shifted.ts'), 'shifted.ts must reach the diff — otherwise the assertion below is vacuous');
    assert.equal(r.violations.filter((v) => v.file === 'shifted.ts').length, 0, 'a citation merely SHIFTED by an insertion above must not trip the gate');
    assert.equal(
      addedLines(git(root, 'diff', '--unified=0', '--no-color', `${base}..HEAD`, '--', 'shifted.ts')).filter((a) => findHazards(a.text, false).length).length,
      0,
      'a shifted citation must never even reach the detector — git does not re-emit the unchanged line',
    );
    console.log(`PASS relocated citation in live.ts exempted via exact-token pre-image match and counted as ${r.moved} move; shifted citation in shifted.ts never reached the detector at all; good.ts clean on the durable-symbol form`);

    assert.ok(r.filesInDiff.has('docs/sessions-archive.md'), 'sessions-archive.md must actually reach the diff — otherwise this exclusion assertion is vacuous');
    assert.equal(r.violations.filter((v) => v.file === 'docs/sessions-archive.md').length, 0, 'sessions-archive.md is excluded by policy and must never be flagged');
    console.log('PASS docs/sessions-archive.md was in the diff (proved non-vacuous) and correctly excluded');

    // --- every number in the success line must be computed, not a literal ---------------------
    // A third commit adds one more citing file and one more hazardous citation. Same code path,
    // strictly larger input: files, added lines and findings must ALL rise.
    w('bad2.ts', [`// and one more at ${at('siamsi.ts', 376)}`, 'export const e = 5;']);
    git(root, 'add', '-A');
    git(root, 'commit', '--quiet', '-m', 'third');
    const wider = scan({ range: `${base}..HEAD`, base }, root);
    assert.ok(wider.filesScanned > r.filesScanned, 'files scanned must rise when the range covers another file');
    assert.ok(wider.addedLinesScanned > r.addedLinesScanned, 'added lines scanned must rise when the range covers more added lines');
    assert.ok(wider.violations.length > r.violations.length, 'findings must rise when the range covers another hazardous citation');
    assert.equal(wider.moved, r.moved, 'the moved count must NOT rise — the third commit relocated nothing');
    console.log(
      `PASS every count tracks the input: 2 commits -> ${r.filesScanned} file(s)/${r.addedLinesScanned} added line(s)/${r.violations.length} finding(s)/${r.moved} moved; ` +
        `3 commits -> ${wider.filesScanned} file(s)/${wider.addedLinesScanned} added line(s)/${wider.violations.length} finding(s)/${wider.moved} moved`,
    );

    // --- an UNTRACKED new file must still be scanned when the range ends at the working tree ---
    w('untracked-bad.ts', [`// brand new, never git-added: ${at('wake-lock.ts', 34)}`]);
    const worktree = scan({ range: 'HEAD', base: 'HEAD' }, root);
    assert.equal(
      worktree.violations.filter((v) => v.file === 'untracked-bad.ts').length,
      1,
      'an untracked file is invisible to git diff — it must be folded in when the range ends at the working tree',
    );
    assert.equal(
      scan({ range: `${base}..HEAD`, base }, root).violations.filter((v) => v.file === 'untracked-bad.ts').length,
      0,
      'a commit-to-commit range must NOT pick up untracked content',
    );
    fs.rmSync(path.join(root, 'untracked-bad.ts'));
    console.log('PASS untracked new file scanned when the range ends at the working tree, and ignored for a commit-to-commit range');

    // --- range resolution -------------------------------------------------------------------
    // Its own repo, on a branch that is NOT main and with no remote, so the merge-base fallback is
    // absent until this test creates it. Run inside the fixture repo it would be untestable: HEAD
    // sits on main there, so a fallback always exists and no case could ever fail closed.
    const rroot = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'added-lineno-range-'));
    try {
      git(rroot, 'init', '--quiet', '--initial-branch=work');
      git(rroot, 'config', 'user.email', 'selftest@example.invalid');
      git(rroot, 'config', 'user.name', 'selftest');
      fs.writeFileSync(path.join(rroot, 'f.txt'), 'one\n');
      git(rroot, 'add', '-A');
      git(rroot, 'commit', '--quiet', '-m', 'one');
      const forkPoint = git(rroot, 'rev-parse', 'HEAD').trim();
      fs.writeFileSync(path.join(rroot, 'f.txt'), 'one\ntwo\n');
      git(rroot, 'add', '-A');
      git(rroot, 'commit', '--quiet', '-m', 'two');

      // No origin/main, no main: nothing to fall back to, so every unusable base must FAIL CLOSED.
      const closed = [
        [{ GITHUB_ACTIONS: 'true', GITHUB_EVENT_BEFORE: '0'.repeat(40) }, "all-zeros before (branch's first push, or a tag push)"],
        [{ GITHUB_ACTIONS: 'true', GITHUB_EVENT_BEFORE: '' }, 'empty before'],
        [{ GITHUB_ACTIONS: 'true', GITHUB_EVENT_BEFORE: 'f'.repeat(40) }, 'before not in this clone (force-push, or a shallow checkout)'],
        [{ GITHUB_ACTIONS: 'true', GITHUB_EVENT_BEFORE: '0'.repeat(40), GITHUB_PR_BASE_SHA: 'f'.repeat(40) }, 'PR base sha not in this clone'],
      ];
      for (const [env, label] of closed) {
        const res = resolveRange([], env, rroot);
        assert.ok(res.error, `range must be unresolvable for: ${label}`);
        assert.ok(!res.range, `an unresolvable range must never yield a diffable range: ${label}`);
      }
      assert.ok(resolveRange(['nosuchref..HEAD'], {}, rroot).error, 'an explicit range with an unresolvable base must error');
      console.log(`PASS with no fallback ref present, range resolution fails closed on all ${closed.length + 1} unusable inputs (never an empty-range green)`);

      // ADDITION B: give it an origin/main and the same all-zeros push now resolves to the fork
      // point instead of reddening. This is the throwaway-branch calibration path this repo relies on.
      git(rroot, 'update-ref', 'refs/remotes/origin/main', forkPoint);
      const viaMergeBase = resolveRange([], { GITHUB_ACTIONS: 'true', GITHUB_EVENT_BEFORE: '0'.repeat(40) }, rroot);
      assert.ok(!viaMergeBase.error, 'with origin/main present, an all-zeros before must resolve rather than fail closed');
      assert.equal(viaMergeBase.base, forkPoint, 'the fallback base must be the merge-base with origin/main');
      assert.match(viaMergeBase.source, /merge-base with origin\/main/, 'the source must name the fallback, so a reader can tell it was not a real push range');
      const prFallback = resolveRange([], { GITHUB_ACTIONS: 'true', GITHUB_EVENT_BEFORE: '0'.repeat(40), GITHUB_PR_BASE_SHA: 'f'.repeat(40) }, rroot);
      assert.equal(prFallback.base, forkPoint, 'an unusable PR base sha must also fall through to the merge-base, not error');
      console.log(`PASS all-zeros before + origin/main -> resolves via ${viaMergeBase.source}, range ${viaMergeBase.range}`);

      // A real push range must still win over the fallback, and the fallback must not be the only
      // thing that ever works — otherwise "fails closed" would just be "always errors".
      assert.equal(resolveRange([], { GITHUB_ACTIONS: 'true', GITHUB_EVENT_BEFORE: forkPoint }, rroot).source, 'github.event.before', 'a usable before must win over the merge-base fallback');
      assert.equal(resolveRange([], { GITHUB_ACTIONS: 'true', GITHUB_PR_BASE_SHA: forkPoint }, rroot).source, 'github.event.pull_request.base.sha', 'a usable PR base sha must win over both');
      console.log('PASS precedence holds: PR base sha > github.event.before > merge-base fallback > fail closed');
    } finally {
      fs.rmSync(rroot, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
async function main() {
  if (process.argv.includes('--selftest')) return selftest();

  const r = resolveRange(process.argv.slice(2), process.env, repoRoot);
  if (r.error) {
    console.error(`::error::added-lineno-citation-check: RANGE UNAVAILABLE, SCANNED NOTHING — ${r.error}`);
    console.error('This gate fails closed on purpose: an empty range would print a green "0 found" and read exactly like a real pass.');
    console.error('Override with an explicit base once you know it, e.g.  CITATION_DIFF_RANGE=<base-sha>..HEAD node scripts/added-lineno-citation-check.mjs');
    process.exit(1);
  }

  const { filesInDiff, filesScanned, addedLinesScanned, violations, moved } = scan(r, repoRoot);
  if (violations.length) {
    for (const v of violations) {
      console.error(`${v.file}:${v.line} · new line-number citation "${v.token}" · cite the durable symbol instead, e.g. "clear() in session.ts"`);
    }
    console.error(
      `\n${violations.length} new line-number citation(s) into non-.md targets. Line numbers rot on the next edit above them and ` +
        'nothing resolves them (check-citations.mjs only validates .md targets) — this is what broke an ADR and a unit test in S2026-08-21.',
    );
    process.exit(1);
  }
  // A zero here can mean three different things and they must not share a sentence. "Clean" is a real
  // pass. "The range added nothing" is the tag-push and force-push case in ceiling 8, where the run
  // proved nothing. "Everything added sat in an excluded path" is the routine session-save commit,
  // which touches only the handoff — saying it proved nothing there is false, and printing that on
  // the most common commit in this repo would train readers to skim past the marker, which is the
  // one signal ceiling 8 depends on. filesInDiff is a Set of the files in the diff BEFORE exclusion,
  // so its size separates them — compare .size, not the Set itself, which is never equal to a number.
  const empty =
    addedLinesScanned !== 0
      ? ''
      : filesInDiff.size === 0
        ? ' — NOTE: this range added no lines, so the run proved nothing'
        : ' — NOTE: every added line sat in an excluded path, so nothing policed was scanned';
  console.log(
    `added-lineno-citation-check: ${filesScanned} file(s), ${addedLinesScanned} added line(s) scanned over ${r.range} (${r.source}); ` +
      `${violations.length} new line-number citation(s), ${moved} pre-existing citation(s) moved and allowed${empty}`,
  );
}

await main();
