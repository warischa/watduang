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
//  4. A moved line is exempt only as many times as the SAME file's own removed lines gave the
//     identical token back. A COPY is therefore not a move: leave the original in place and the file
//     ends up with more of that token than it started with, so the surplus trips (gh#59, hole 1 —
//     set membership used to launder it and miscount it as moved). A citation moved to a DIFFERENT
//     file also reads as new and trips, `git mv` included: the diff is taken with --no-renames, so a
//     rename is a delete plus an add and the new path's lines are all new there. Stated rather than
//     surprising — the fail direction is the conservative one.
//  5. Unified-diff path parsing assumes plain ASCII paths: no git-quoted ones, and none containing
//     the literal ` b/`, which defeats the `diff --git a/<p> b/<p>` split. Such a file is not
//     harvested into filesInDiff, so a push carrying only that file could still read as empty. True
//     of this repo — and the diff itself is taken with the prefixes pinned, so the assumption the
//     strip makes about `a/` and `b/` is one this script sets rather than one it inherits.
//  6. Two near-miss spellings bypass the pattern, deliberately not covered: a GitHub permalink
//     anchor (a path followed by #L245) and the colon-space form (a path, a colon, a space, then a
//     number). Both rot exactly like the banned form. Widening for them starts matching ordinary
//     prose — "session.ts: 245 of them" is a sentence, not a citation — and a noisy gate gets
//     switched off, after which it protects nothing. Narrow and trusted beats broad and noisy.
//     Revisit only on a measurement showing either form actually being used here.
//  7. Exemption is per LINE, not per file. Unpoliced wholesale: docs/verification/evidence/
//     (verbatim tool output, where the banned shape IS the evidence) and docs/sessions-archive.md (a
//     verbatim record). SESSION-HANDOFF.md is SPLIT (gh#59, hole 2): `done:`/`dec:` are that same
//     record pre-roll and stay exempt, `next:` and its checklist items are live pointers an agent
//     acts on next session and are policed, `inflight:` follows the POLICE_INFLIGHT constant. Any
//     label the vocabulary does not know falls through to policed. See the exclusion comments below.
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

// docs/sessions-archive.md is a verbatim record of what was true at a moment. It is never edited or
// converted by policy (CLAUDE.md, "Write English. Ship Thai.") and holds 69 of the pre-existing
// citations. Re-anchoring it to today's symbols would make the record describe today's code instead
// of the moment it documents, which falsifies it rather than fixing a pointer — the identical reason
// the frozen Supersession paragraph in docs/verification/adr-0010-findings.md cannot be converted. A
// record and a pointer are different artifacts, and only the pointer is supposed to track the code.
const EXCLUDE_FILES = new Set(['docs/sessions-archive.md']);

// SESSION-HANDOFF.md was in that set too, on the ground that it is the archive's pre-roll. Half
// true, and gh#59 is the half that is not: `done:` and `dec:` really are record — they roll into
// docs/sessions-archive.md verbatim at the next save — but `next:` and `inflight:` are LIVE
// POINTERS an agent reads and acts on next session. A rotted line number there is unpoliced rot in
// the one file most likely to be read as current, so the exclusion is per LINE, by the label that
// opens it. Format contract (one label per line, `done: …` / `next:` + `- [ ] …`) is owned by
// .claude/commands/save-session.md; a label this file does not recognise falls through to POLICED,
// which is the safe direction and keeps the vocabulary's owner able to grow it without a code change.
// ponytail: a `done:` entry wrapped onto a second physical line would have its continuation policed.
// The format says one line per label; if that ever changes, carry the label forward instead.
const HANDOFF_FILE = 'SESSION-HANDOFF.md';
const HANDOFF_RECORD_LABELS = new Set(['done', 'dec']);
// Owner's call, deliberately one constant rather than a hard-coded branch. FALSE (exempt) because
// `inflight:` is where a REFUTE finding lands quoted verbatim before anyone fixes it, and a checker
// cannot tell use from mention — policing it reds the first honest save after any review round,
// which is the "gate fires on lines nobody can fix, so it gets switched off" failure ADR-0025 exists
// to avoid. TRUE buys coverage of a genuinely live pointer at that cost. Flip this line, nothing
// else: --selftest derives its expected counts from this constant and passes at either setting, so
// the flip cannot red the `--selftest &&` that ci.yml runs before the gate itself.
const POLICE_INFLIGHT = false;
// docs/verification/evidence/ holds captured TOOL OUTPUT quoted verbatim — tsc diagnostics (a path,
// a line, a column, then the message), `grep -n` pastes, stack traces. Those are the banned shape by pure
// coincidence of format, and they are the evidence itself: an agent cannot re-anchor them without
// destroying what the capture proves. Without this exclusion the next honest evidence capture goes
// red with no in-repo escape, and a gate that blocks honest evidence capture gets deleted — after
// which it protects nothing. dist/, node_modules/ and .astro/ are build output and vendor code, not
// authored here, so nothing in them is a citation this repo owns.
const EXCLUDE_DIR_PREFIXES = ['docs/verification/evidence/', 'node_modules/', 'dist/', '.astro/'];

// Exemption is decided per LINE, never per file. That granularity is load-bearing for ADR-0025's
// null-labelling: `filesInDiff` is built before this runs, so a push that touches only `done:`/`dec:`
// still puts SESSION-HANDOFF.md in the diff while scanning zero policed lines — which is what lets
// "nothing policed was scanned" stay distinct from "this range touched no lines at all". A
// file-level Set cannot express that, and collapsing the two would print "proved nothing" on every
// session save. emptyNote() carries the full list of zeros and the fact that decides each one.
function isExemptLine(file, text, policeInflight = POLICE_INFLIGHT) {
  if (EXCLUDE_DIR_PREFIXES.some((p) => file.startsWith(p))) return true;
  if (EXCLUDE_FILES.has(file)) return true;
  if (file !== HANDOFF_FILE) return false;
  const label = text.match(/^([a-z]+):/)?.[1];
  if (label === 'inflight') return !policeInflight;
  return HANDOFF_RECORD_LABELS.has(label); // no label, or one not in the vocabulary -> policed
}

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

// Parses `git diff --unified=0` output into the lines the range ADDS, the lines it REMOVES, and the
// set of paths it opened a file block for AT ALL. That third one is not derivable from the other
// two: a file can be in the diff with no line on either side (see the `diff --git ` branch). A
// line that is only moved appears in both — the occurrence counting in scan() is what exempts it.
// Removed lines carry no line number on purpose: only how many times a token disappeared matters.
// They are attributed to the `--- ` path, added lines to the `+++ ` one. Those two paths differ only
// for a new file (`--- /dev/null`, and there is nothing removed to attribute), a deletion
// (`+++ /dev/null`, whose removed lines would otherwise be dropped along with the null path, so a
// `git rm` would read as a range that touched nothing at all) and a rename, which --no-renames means
// this parser never sees.
//
// Header vs body is tracked as STATE, not guessed from the previous line. In git's output `--- ` and
// `+++ ` are headers only inside the block that opens with `diff --git ` and closes at that file's
// first `@@`; after that every line is hunk content until the next `diff --git `. A lookbehind
// instead of state is not a near-miss, it is exploitable: a removed line whose content starts `-- `
// renders as `--- `, so the added line after it starting `++ ` renders as `+++ ` and was read as a
// header — its citation never scanned, and every line after it, plus its moved-budget, filed under a
// path spelled by that line's own text. Body lines cannot fake the state machine: added and removed
// content is always prefixed, so a body line can never start with `diff --git `.
function parseDiff(diffText) {
  const added = [];
  const removed = [];
  const files = new Set();
  // `a/` and `b/` are the prefixes scan() PINS with --src-prefix/--dst-prefix rather than inheriting
  // — diff.mnemonicPrefix, diff.noprefix and diff.srcPrefix all change them, and a config that did
  // would leave the strip below intact but wrong. One leading segment is stripped, so a repo path
  // that really begins with `a/` or `b/` survives. Ceiling 5: plain ASCII paths, never git-quoted.
  const headerPath = (raw) => {
    const p = raw.slice(4).trim();
    return p === '/dev/null' ? null : p.replace(/^[ab]\//, '');
  };
  let fromFile = null;
  let toFile = null;
  let inHeader = false;
  let nextLine = 0;
  for (const raw of diffText.split('\n')) {
    if (raw.startsWith('diff --git ')) {
      inHeader = true;
      fromFile = null;
      toFile = null;
      // The file set is harvested HERE, from the one line every file block has. It cannot be taken
      // from `--- `/`+++ ` alone: measured, a binary block is `diff --git `, `new file mode`,
      // `index`, then `Binary files … differ` and carries NO `--- `/`+++ ` pair, while a mode-only
      // block is `diff --git ` plus `old mode`/`new mode` and an empty new file stops at `index`.
      // All three are files the range touched with no line to show for it.
      // The backreference is what makes the split unambiguous: --no-renames guarantees the two
      // paths are identical, so `a/<p> b/<p>` has exactly one reading. Ceiling 5 covers the rest —
      // a git-quoted path, or one containing the literal ` b/`, does not match and is not harvested.
      // Turning rename detection back on would break only this line, not the set: a rename hunk has
      // a `--- `/`+++ ` pair, and both of those add to it below.
      const both = raw.slice('diff --git '.length).match(/^a\/(.+) b\/\1$/);
      if (both) files.add(both[1]);
      continue;
    }
    if (inHeader) {
      if (raw.startsWith('--- ')) {
        fromFile = headerPath(raw);
        if (fromFile) files.add(fromFile);
        continue;
      }
      if (raw.startsWith('+++ ')) {
        toFile = headerPath(raw);
        if (toFile) files.add(toFile);
        continue;
      }
      // index / mode / binary-files lines: still header, and a binary or mode-only change simply
      // never reaches a `@@` at all — which is why the path was already taken above.
      if (!raw.startsWith('@@')) continue;
      inHeader = false;
    }
    if (raw.startsWith('@@')) {
      const m = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
      nextLine = m ? Number(m[1]) : 0;
      continue;
    }
    if (raw.startsWith('+') && toFile) {
      added.push({ file: toFile, line: nextLine, text: raw.slice(1) });
      nextLine++;
      continue;
    }
    if (raw.startsWith('-') && fromFile) removed.push({ file: fromFile, text: raw.slice(1) });
  }
  return { added, removed, files };
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
function scan({ range }, cwd) {
  // --no-renames is not cosmetic, but its stated reason did not survive review (ADR-0025). It was
  // added to stop a rename's removals being read under the NEW path and funding a budget there;
  // parseDiff's state machine now tracks the `--- ` and `+++ ` paths separately, so removals file
  // under the old path on their own and the flag is no longer what closes that. What it still does,
  // measured on real output: with detection ON the move is a single rename hunk carrying only the
  // lines actually reworded, so every citation that crossed unchanged is never re-emitted and never
  // re-examined. Decomposed into a delete plus an add, every line arrives NEW at the new path —
  // which is exactly what ceiling 4 promises a cross-file move does. It also suppresses copy
  // detection, which a user's `diff.renames=copies` would otherwise turn on.
  // --no-ext-diff and the pinned prefixes are the same kind of hazard from local config: an
  // external diff driver replaces this output wholesale, and diff.mnemonicPrefix / diff.noprefix /
  // diff.srcPrefix change the `a/`/`b/` that headerPath strips. CI's config is clean; a developer's
  // need not be, and every one of those failures parses to a green.
  const diff = execFileSync('git', ['diff', '--unified=0', '--no-color', '--no-ext-diff', '--no-renames', '--src-prefix=a/', '--dst-prefix=b/', range, '--'], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  const { added: all, removed, files } = parseDiff(diff);

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
      // A 0-byte file adds no line, and `''.split('\n')` is `['']` rather than `[]` — folding that
      // in counts one added line of empty text. It can never BE a finding, but addedLinesTotal is
      // what tells "added only exempt lines" from "added nothing", so one stray empty file made a
      // worktree run that scanned nothing report itself as a real scan.
      if (buf.length === 0) continue;
      // replace(/\n$/, '') first: splitting a newline-terminated file yields a phantom trailing
      // empty element, which would inflate the added-line count this script reports as measured.
      buf
        .toString('utf8')
        .replace(/\n$/, '')
        .split('\n')
        .forEach((text, i) => all.push({ file, line: i + 1, text }));
    }
  }

  // filesInDiff is every file the range touched, BEFORE any exemption — and "touched" means git
  // opened a block for it, not "it has a changed line". Three sources, and each is load-bearing:
  // every path parseDiff harvested from a `diff --git ` line (the only one a binary, mode-only or
  // empty new file ever produces), plus the paths of added and removed lines (which covers the
  // untracked files folded in above, since those are in no diff at all). ADR-0025's null-labelling
  // reads this Set's SIZE to tell "this range touched nothing at all" from every other zero. Built
  // from added lines only a `git rm` landed in that bucket, and built from hunk lines only a
  // committed PNG did — each printing the force-push marker on a routine push, which is precisely
  // the dilution that makes the marker skimmable.
  const filesInDiff = new Set([...files, ...[...all, ...removed].map((x) => x.file)]);
  const added = all.filter((a) => !isExemptLine(a.file, a.text));

  // Occurrence COUNTS, not set membership (gh#59, hole 1). Membership asked "did this token exist
  // before?", which a duplicate answers yes to while the original is still sitting there: copy a
  // citation into a new paragraph of the same file and the copy was exempted AND miscounted as a
  // move. The question that actually decides it is "did this file end up with MORE of this token
  // than it started with?" — and for a unified diff that is exactly (times it appears on + lines)
  // minus (times it appears on - lines), because post minus pre is added minus removed by
  // construction. So no pre-image read at all, and the arithmetic is exact rather than heuristic.
  //
  // The budget is keyed by (file, token) and filled ONLY from that file's own non-exempt removed
  // lines. Both halves are load-bearing: cross-file would exempt a citation lifted out of the frozen
  // archive into a live doc, and counting exempt removals would let a `done:` line pay for a `next:`
  // line inside SESSION-HANDOFF.md — trading the old hole for a new one either way.
  // (Spelled out in prose rather than shown: this file must never contain the shape it bans.)
  // Nested Map rather than a joined "file<sep>token" string key: every separator character is legal
  // in a path, and a path containing the separator would merge two files' budgets into one.
  const movedBudget = new Map(); // file -> Map(token -> how many times a removed line gave it back)
  for (const rm of removed) {
    if (isExemptLine(rm.file, rm.text)) continue;
    for (const h of findHazards(rm.text, isMd(rm.file))) {
      if (!movedBudget.has(rm.file)) movedBudget.set(rm.file, new Map());
      const perFile = movedBudget.get(rm.file);
      perFile.set(h.token, (perFile.get(h.token) ?? 0) + 1);
    }
  }

  const violations = [];
  let moved = 0;
  for (const a of added) {
    const perFile = movedBudget.get(a.file);
    for (const h of findHazards(a.text, isMd(a.file))) {
      const budget = perFile?.get(h.token) ?? 0;
      if (budget > 0) {
        perFile.set(h.token, budget - 1);
        moved++;
        continue;
      }
      violations.push({ ...a, ...h });
    }
  }
  return {
    filesInDiff,
    filesScanned: new Set(added.map((a) => a.file)).size,
    addedLinesTotal: all.length, // before exemption: what separates "added nothing" from "added only exempt lines"
    removedLinesTotal: removed.length, // and this separates "added nothing" from "no line exists on either side"
    addedLinesScanned: added.length,
    violations,
    moved,
  };
}

// ADR-0025: "an empty scan is never a bare zero." Each cause gets its OWN sentence, and a newly
// found cause gets a new sentence rather than being folded into the nearest existing one. No running
// total is stated here, and none is stated in the ADR either — the set of causes is open, and a count
// kept in two files drifts apart, which is how this gate's prose has already failed once. What each
// branch says, and the fact that decides it:
//   * no NOTE at all — policed lines were actually scanned. The only genuine pass.
//   * "touched no lines at all, so the run proved nothing" — filesInDiff is EMPTY: not one file
//     block, not one untracked file. The tag-push and force-push case in ceiling 8.
//   * "only binary or mode changes" — files were touched, but no hunk exists anywhere in the range,
//     so no line could be added. Routine here: scripts/make-og.mjs commits OG images.
//   * "only removed lines" — lines existed and every one of them was a removal, so nothing could be
//     cited. Fully gated. Keyed on the line counts, so a push mixing a deletion with a PNG lands here.
//   * "nothing policed was scanned" — lines WERE added and every one of them was exempt: the routine
//     session-save commit.
// Collapsing any of the others into the force-push sentence trains readers to skim past the one
// marker ceiling 8 depends on; collapsing them into each other states something the run did not
// check. Compare filesInDiff.size, not the Set itself, which is never equal to a number.
function emptyNote({ addedLinesScanned, addedLinesTotal, removedLinesTotal, filesInDiff }) {
  if (addedLinesScanned !== 0) return '';
  if (filesInDiff.size === 0) return ' — NOTE: this range touched no lines at all, so the run proved nothing';
  if (addedLinesTotal === 0 && removedLinesTotal === 0) {
    return ' — NOTE: this range carries only binary or mode changes, which reach no hunk, so it added no citation to police';
  }
  if (addedLinesTotal === 0) return ' — NOTE: this range only removed lines, so it added no citation to police';
  return ' — NOTE: every added line sat in an excluded path or section, so nothing policed was scanned';
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

  // --- the line classifier, at BOTH settings of POLICE_INFLIGHT (gh#59, hole 2) -----------------
  // Tested directly and at both settings, so flipping the constant can never ship an untested
  // branch — the commit fixture below can only ever exercise whichever value is compiled in.
  const cited = `finding rests on ${at('src/shell/roster.ts', 38)}`;
  for (const police of [false, true]) {
    const exempt = (text) => isExemptLine(HANDOFF_FILE, text, police);
    assert.equal(exempt(`done: ${cited}`), true, 'done: is record, pre-roll for docs/sessions-archive.md — exempt at either setting');
    assert.equal(exempt(`dec: ${cited}`), true, 'dec: is record — exempt at either setting');
    assert.equal(exempt(`next: ${cited}`), false, 'next: is a live pointer an agent acts on — always policed');
    assert.equal(exempt(`- [ ] gh#59 — ${cited}`), false, 'a next: checklist item carries no label of its own and must fall through to policed');
    assert.equal(exempt(`inflight: ${cited}`), !police, `inflight: must follow POLICE_INFLIGHT (${police})`);
    assert.equal(exempt(`spent: queue 5→6 · ${cited}`), false, 'spent: is not in the record vocabulary — unrecognised labels default to policed');
    assert.equal(exempt(`### S2026-08-21#3 ${cited}`), false, 'a heading has no label at all — default policed, the safe direction');
  }
  // The split is scoped to that one file: every other path keeps whole-file semantics.
  assert.equal(isExemptLine('docs/sessions-archive.md', `next: ${cited}`), true, 'the archive is excluded wholesale — a next:-shaped line in it is still record');
  assert.equal(isExemptLine('docs/verification/evidence/99/capture.md', `done: ${cited}`), true, 'the evidence tree is excluded wholesale');
  assert.equal(isExemptLine('docs/runbook.md', `done: ${cited}`), false, 'the label vocabulary means nothing outside SESSION-HANDOFF.md');
  console.log(`PASS handoff line classifier calibrated at BOTH settings: done:/dec: exempt, next: + its checklist items + unrecognised labels + headings policed, inflight: follows POLICE_INFLIGHT (shipping ${POLICE_INFLIGHT})`);

  // --- the null-labelling, ADR-0025 (pure, so every cause is provable without a real push) ------
  // Every field is passed at every call: a case that leans on an absent addedLinesTotal or
  // removedLinesTotal would be testing `undefined === 0`, not the zero it names.
  assert.equal(emptyNote({ addedLinesScanned: 3, addedLinesTotal: 3, removedLinesTotal: 0, filesInDiff: new Set(['a.ts']) }), '', 'a scan that policed real lines gets no NOTE');
  const nothingTouched = emptyNote({ addedLinesScanned: 0, addedLinesTotal: 0, removedLinesTotal: 0, filesInDiff: new Set() });
  const hunkless = emptyNote({ addedLinesScanned: 0, addedLinesTotal: 0, removedLinesTotal: 0, filesInDiff: new Set(['public/og.png']) });
  const onlyRemoved = emptyNote({ addedLinesScanned: 0, addedLinesTotal: 0, removedLinesTotal: 4, filesInDiff: new Set(['gone.ts']) });
  const nothingPoliced = emptyNote({ addedLinesScanned: 0, addedLinesTotal: 2, removedLinesTotal: 0, filesInDiff: new Set([HANDOFF_FILE]) });
  assert.match(nothingTouched, /proved nothing/, 'a range that touched nothing must say the run proved nothing (the tag-push and force-push signal)');
  assert.match(hunkless, /binary or mode/, 'a push whose files carry no hunk at all must name binary/mode, not borrow another sentence');
  assert.match(onlyRemoved, /only removed lines/, 'a removal-only push must name itself — it added nothing, so it is gated, not unproven');
  assert.match(nothingPoliced, /nothing policed was scanned/, 'an all-exempt push must say nothing policed was scanned');
  // The only difference between hunkless and onlyRemoved is removedLinesTotal, so this pair also
  // proves that field is READ rather than merely accepted.
  assert.equal(new Set([nothingTouched, hunkless, onlyRemoved, nothingPoliced]).size, 4, 'each of the four zeros built above must keep its own sentence');
  console.log('PASS the empty-scan messages stay distinct: nothing touched -> "proved nothing"; no hunk anywhere -> "binary or mode"; removal-only -> "only removed lines"; all-exempt push -> "nothing policed was scanned"');

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
    // dupe.md's citation is COPIED verbatim into a second paragraph by the next commit while the
    // original stays exactly where it is. Pre-image set membership called that a move; only an
    // occurrence COUNT can tell a copy from a relocation (gh#59, hole 1).
    w('dupe.md', ['# notes', `Original paragraph — the guard is at ${at('src/shell/roster.ts', 77)}.`]);
    // chained.md's bullet starts with `-- `, so REMOVING it renders as `--- an old bullet…` in the
    // diff body. The next commit replaces it with a line starting `++ `, which renders as `+++ …`.
    // A parser that decides headers by looking one line back reads that pair as a file header.
    w('chained.md', ['# notes', '-- an old bullet, and no citation in it']);
    w('docs/sessions-archive.md', ['# archive', `untouched line — S2025-12-01#2 noted ${at('session.ts', 12)} at the time`]);
    w('SESSION-HANDOFF.md', ['# handoff', '## Current state', '### S2026-08-20#1', 'done: an earlier entry, already rolled', 'next:', '- [ ] nothing yet']);
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
    // dupe.md: the original citation is untouched and a byte-identical copy is added below it. The
    // token IS in the pre-image, so set membership exempted it and inflated the moved count; the
    // count says one occurrence became two, so one of them is new (gh#59, hole 1).
    w('dupe.md', ['# notes', `Original paragraph — the guard is at ${at('src/shell/roster.ts', 77)}.`, '', `Second paragraph — the guard is at ${at('src/shell/roster.ts', 77)}.`]);
    // chained.md: the `-- ` line is replaced by a `++ ` one, so the diff body reads `--- …` then
    // `+++ …` back to back. Both added lines must be attributed to chained.md and scanned: the `++ `
    // line's own citation is the one a lookbehind parser eats, and the line after it is the one that
    // gets re-attributed to the phantom path the eaten line spelled.
    w('chained.md', ['# notes', `++ see ${at('src/shell/session.ts', 99)} for the guard`, `and the roster note at ${at('src/shell/roster.ts', 51)}`]);
    // SESSION-HANDOFF.md: both halves of the split in one commit. `done:`/`dec:` are the record
    // rolling into docs/sessions-archive.md and stay exempt; the `next:` item and `inflight:` are
    // live pointers an agent acts on next session and must be policed (gh#59, hole 2).
    w('SESSION-HANDOFF.md', [
      '# handoff',
      '## Current state',
      '### S2026-08-21#3',
      `done: the finding rests on ${at('src/shell/roster.ts', 38)} — record of a past moment, exempt`,
      `dec: calibration cited ${at('scripts/leave-confirm-check.mjs', '100-102')} — record, exempt`,
      'next:',
      `- [ ] gh#59 — the clearance budget lives at ${at('src/styles/tokens.css', 12)}`,
      `inflight: REFUTE finding quoted verbatim — ${at('scripts/arm-gate-probe.mjs', 41)}`,
    ]);
    // archive-copy.md: the token below is pre-existing IN docs/sessions-archive.md, which is
    // excluded wholesale. Lifting it out of the frozen record into a live doc makes it a live
    // pointer, and it must go RED — an exemption keyed to anything but THIS file's own removed
    // lines would launder it (gh#59, hole 1, second direction).
    w('archive-copy.md', ['# live notes', `Lifted out of the archive: ${at('session.ts', 12)} — a live pointer now.`]);
    // sessions-archive.md: excluded by policy. Its added line carries a hazardous citation, and the
    // assertion below proves the line really reached the diff — otherwise "excluded" and "never
    // scanned" would be indistinguishable (the vacuity trap check-citations documents).
    w('docs/sessions-archive.md', ['# archive', `untouched line — S2025-12-01#2 noted ${at('session.ts', 12)} at the time`, `S2026-01-01#1 — noted ${at('session.ts', 12)} at the time`]);
    git(root, 'add', '-A');
    git(root, 'commit', '--quiet', '-m', 'second');

    const r = scan({ range: `${base}..HEAD` }, root);

    const badFiles = r.violations.map((v) => `${v.file} -> ${v.token}`).sort();
    // Two hand-counted literals, one per setting of the knob — NOT `plantedFiles.length`, which
    // would silently accept two findings in one file and none in another (array length is not
    // coverage — chained.md deliberately carries two of them). The knob's comment promises "flip
    // this line, nothing else", and ci.yml runs --selftest before the gate, so a count hard-coded to
    // one setting would red every CI push the moment anyone took that promise up. Only the inflight:
    // line moves between the two: the FILE list is identical, because SESSION-HANDOFF.md is already
    // red on its next: item at either setting.
    const expectedViolations = POLICE_INFLIGHT ? 12 : 11;
    const plantedFiles = ['SESSION-HANDOFF.md', 'archive-copy.md', 'bad.md', 'bad.mjs', 'bad.ts', 'chained.md', 'dense.ts', 'dupe.md', 'elsewhere.md', 'md-from-src.ts'];
    assert.equal(r.violations.length, expectedViolations, `known-bad commit must report exactly ${expectedViolations} new citations at POLICE_INFLIGHT=${POLICE_INFLIGHT}, got ${r.violations.length}: ${badFiles.join(', ')}`);
    assert.deepEqual(
      [...new Set(r.violations.map((v) => v.file))].sort(),
      plantedFiles,
      'the findings must be the planted files, not something incidental',
    );
    console.log(`PASS known-bad commit flags all ${r.violations.length} planted citations:\n${r.violations.map((v) => `     ${v.file}:${v.line} → ${v.token}`).join('\n')}`);

    // FINDING 1: prefix laundering. The new token must be reported, and — just as important — it
    // must NOT have been silently absorbed into the moved count.
    const dense = r.violations.filter((v) => v.file === 'dense.ts');
    assert.equal(dense.length, 1, 'a new citation that is a strict prefix of a pre-existing one must be caught, not laundered');
    assert.equal(dense[0].token, at('roster.ts', 24), `the reported token must be the NEW one, got ${dense[0].token}`);
    console.log(`PASS prefix laundering closed: new ${dense[0].token} caught under pre-existing ${at('roster.ts', 245)}, and not counted as a move`);

    // A `--- ` then `+++ ` pair in the HUNK BODY is content, not a header. Both halves are asserted:
    // the `++ ` line's citation must be reported (a lookbehind parser consumes that line as a header
    // and never scans it), and the line after it must belong to chained.md rather than to the path
    // the eaten line happened to spell. The second half is the dangerous one — a phantom file also
    // keys its own moved-budget, so the corruption spreads past the one line it started on.
    assert.deepEqual(
      r.violations.filter((v) => v.file === 'chained.md').map((v) => v.token),
      [at('src/shell/session.ts', 99), at('src/shell/roster.ts', 51)],
      'a diff-body line starting `++ ` is added CONTENT: its citation must be scanned, and the line below it must stay attributed to chained.md',
    );
    console.log(`PASS a body-line pair "-- …" / "++ …" is content, not a header: ${at('src/shell/session.ts', 99)} is scanned and ${at('src/shell/roster.ts', 51)} stays attributed to chained.md`);

    // FINDING 3: the same .md target, red from a source file and green from a .md file.
    assert.equal(r.violations.filter((v) => v.file === 'md-from-src.ts').length, 1, 'a .md target cited from a source file is unowned and must be caught');
    assert.ok(r.filesInDiff.has('good.md'), 'good.md must reach the diff — otherwise the assertion below is vacuous');
    assert.equal(r.violations.filter((v) => v.file === 'good.md').length, 0, 'a .md target cited from a .md file belongs to check-citations.mjs and must stay green');
    console.log(`PASS ${at('docs/runbook.md', 12)} is RED from md-from-src.ts and GREEN from good.md — the skip now depends on the citing file, not a false premise about check-citations coverage`);

    // gh#59 HOLE 1: duplicate-token laundering. The original is UNTOUCHED and a byte-identical copy
    // is added below it, so the token is in the pre-image and set membership exempted it. Both
    // halves matter: the copy must be reported, AND it must not have inflated the moved count.
    const dupe = r.violations.filter((v) => v.file === 'dupe.md');
    assert.equal(dupe.length, 1, 'a citation COPIED while the original stays put is new, not moved — set membership laundered it');
    assert.equal(dupe[0].token, at('src/shell/roster.ts', 77), `the reported token must be the copied one, got ${dupe[0].token}`);
    // Second direction: the same token lifted OUT of an excluded record into a live doc. The
    // exemption must be keyed to the citing file's OWN removed lines, never to any wider pre-image.
    const lifted = r.violations.filter((v) => v.file === 'archive-copy.md');
    assert.equal(lifted.length, 1, 'a citation copied out of docs/sessions-archive.md into a live doc is a live pointer and must go RED');
    assert.equal(lifted[0].token, at('session.ts', 12), `the lifted token must be the archive's, got ${lifted[0].token}`);
    assert.equal(r.violations.filter((v) => v.file === 'docs/sessions-archive.md').length, 0, 'the archive itself keeps that same token GREEN — otherwise the pair above proves nothing');
    console.log(`PASS hole 1 closed both directions: ${dupe[0].token} copied within dupe.md is RED (not a move), and ${lifted[0].token} is GREEN in the archive but RED once lifted into archive-copy.md`);

    // FINDING 2 + ADDITION A: the excluded records. Each pairs a "was in the diff" assertion with
    // its exemption, and the evidence case pairs with an identical line elsewhere going red — so
    // "excluded" can never be confused with "the detector never matched it".
    for (const [file, why] of [['docs/verification/evidence/99/capture.md', 'verbatim tool output']]) {
      assert.ok(r.filesInDiff.has(file), `${file} must reach the diff — otherwise its exclusion assertion is vacuous`);
      assert.equal(r.violations.filter((v) => v.file === file).length, 0, `${file} is excluded (${why}) and must never be flagged`);
    }
    const control = r.violations.filter((v) => v.file === 'elsewhere.md');
    assert.equal(control.length, 1, 'the identical tsc-style line OUTSIDE the evidence tree must go red — otherwise the exclusion proves nothing');
    console.log(`PASS exclusions non-vacuous: the tsc line "${control[0].token}" is GREEN under docs/verification/evidence/ and RED in elsewhere.md`);

    // gh#59 HOLE 2: SESSION-HANDOFF.md is a MIXTURE, not a record. One commit carries all four
    // section kinds, so the split is proved per line inside a single file rather than per file.
    const handoff = r.violations.filter((v) => v.file === 'SESSION-HANDOFF.md');
    assert.ok(r.filesInDiff.has('SESSION-HANDOFF.md'), 'SESSION-HANDOFF.md must reach the diff — otherwise every assertion below is vacuous');
    // Derived from the knob for the same reason as expectedViolations above: at POLICE_INFLIGHT=true
    // the inflight: line is a live pointer too, and a list pinned to one setting makes the documented
    // flip red CI. Written out per setting rather than filtered, so the expectation stays a
    // hand-checked statement of which sections are policed, not a restatement of the code.
    const expectedHandoffTokens = POLICE_INFLIGHT
      ? [at('scripts/arm-gate-probe.mjs', 41), at('src/styles/tokens.css', 12)]
      : [at('src/styles/tokens.css', 12)];
    assert.deepEqual(
      handoff.map((v) => v.token).sort(),
      expectedHandoffTokens,
      `the policed handoff sections are exactly the live pointers; got ${handoff.map((v) => v.token).join(', ') || 'nothing'}`,
    );
    for (const token of [at('src/shell/roster.ts', 38), at('scripts/leave-confirm-check.mjs', '100-102')]) {
      assert.equal(handoff.filter((v) => v.token === token).length, 0, `a done:/dec: citation is record pre-roll for docs/sessions-archive.md and must stay exempt: ${token}`);
    }
    assert.equal(
      handoff.filter((v) => v.token === at('scripts/arm-gate-probe.mjs', 41)).length,
      POLICE_INFLIGHT ? 1 : 0,
      `the inflight: citation must follow POLICE_INFLIGHT (${POLICE_INFLIGHT})`,
    );
    console.log(`PASS hole 2 split, per line inside one file: next: item RED, done:/dec: GREEN, inflight: ${POLICE_INFLIGHT ? 'RED' : 'GREEN'} (POLICE_INFLIGHT=${POLICE_INFLIGHT})`);

    assert.equal(r.moved, 1, `the relocated pre-existing citation must be exempted exactly once, got ${r.moved}`);
    assert.equal(r.violations.filter((v) => v.file === 'live.ts').length, 0, 'a citation that only MOVED must not trip the gate');
    assert.ok(r.filesInDiff.has('shifted.ts'), 'shifted.ts must reach the diff — otherwise the assertion below is vacuous');
    assert.equal(r.violations.filter((v) => v.file === 'shifted.ts').length, 0, 'a citation merely SHIFTED by an insertion above must not trip the gate');
    assert.equal(
      // Same config-proofing flags scan() passes: a fixture repo still reads the developer's global
      // gitconfig, and an external diff driver here would yield zero added lines and pass vacuously.
      parseDiff(git(root, 'diff', '--unified=0', '--no-color', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/', `${base}..HEAD`, '--', 'shifted.ts')).added.filter((a) => findHazards(a.text, false).length).length,
      0,
      'a shifted citation must never even reach the detector — git does not re-emit the unchanged line',
    );
    console.log(`PASS relocated citation in live.ts exempted because its removed line gave the token back, counted as ${r.moved} move; shifted citation in shifted.ts never reached the detector at all; good.ts clean on the durable-symbol form`);

    assert.ok(r.filesInDiff.has('docs/sessions-archive.md'), 'sessions-archive.md must actually reach the diff — otherwise this exclusion assertion is vacuous');
    assert.equal(r.violations.filter((v) => v.file === 'docs/sessions-archive.md').length, 0, 'sessions-archive.md is excluded by policy and must never be flagged');
    console.log('PASS docs/sessions-archive.md was in the diff (proved non-vacuous) and correctly excluded');

    // --- every number in the success line must be computed, not a literal ---------------------
    // A third commit adds one more citing file and one more hazardous citation. Same code path,
    // strictly larger input: files, added lines and findings must ALL rise.
    w('bad2.ts', [`// and one more at ${at('siamsi.ts', 376)}`, 'export const e = 5;']);
    git(root, 'add', '-A');
    git(root, 'commit', '--quiet', '-m', 'third');
    const wider = scan({ range: `${base}..HEAD` }, root);
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
    const worktree = scan({ range: 'HEAD' }, root);
    assert.equal(
      worktree.violations.filter((v) => v.file === 'untracked-bad.ts').length,
      1,
      'an untracked file is invisible to git diff — it must be folded in when the range ends at the working tree',
    );
    assert.equal(
      scan({ range: `${base}..HEAD` }, root).violations.filter((v) => v.file === 'untracked-bad.ts').length,
      0,
      'a commit-to-commit range must NOT pick up untracked content',
    );
    fs.rmSync(path.join(root, 'untracked-bad.ts'));
    console.log('PASS untracked new file scanned when the range ends at the working tree, and ignored for a commit-to-commit range');

    // --- a 0-BYTE untracked file adds no line ---------------------------------------------------
    // `''.split('\n')` is `['']`, not `[]`, so a 0-byte file used to fold in as one added line of
    // empty text. Nothing matches the detector in it, so it never showed up as a finding — it
    // inflated addedLinesTotal instead, which is exactly the field that decides whether an empty
    // scan gets labelled. One stray empty file and a worktree run that policed nothing reported
    // itself as a real scan. Only local runs reach this: an A..B range folds in no untracked file.
    fs.writeFileSync(path.join(root, 'empty-untracked.ts'), '');
    const withEmptyFile = scan({ range: 'HEAD' }, root);
    assert.equal(withEmptyFile.addedLinesTotal, 0, 'a 0-byte untracked file must contribute NO added line — the phantom from splitting an empty string');
    assert.match(emptyNote(withEmptyFile), /proved nothing/, 'a worktree holding only a 0-byte untracked file scanned nothing, and must say so instead of reading as a real scan');
    fs.rmSync(path.join(root, 'empty-untracked.ts'));
    console.log('PASS a 0-byte untracked file folds in as zero lines, so it cannot suppress an empty-scan marker');

    // --- a SESSION-HANDOFF.md-ONLY push must still pick the right one of the two zeros -----------
    // The hazard the per-line split creates: once part of the handoff is policed, an all-record push
    // could either lose its "nothing policed" marker or borrow the "proved nothing" one. Both
    // branches are driven through a REAL scan here, because the distinction lives in whether
    // filesInDiff is built before or after exemption — a pure-function test cannot see that.
    const thirdSha = git(root, 'rev-parse', 'HEAD').trim();
    w('SESSION-HANDOFF.md', [
      '# handoff',
      '## Current state',
      '### S2026-08-21#3',
      `done: the finding rests on ${at('src/shell/roster.ts', 38)} — record of a past moment, exempt`,
      `dec: calibration cited ${at('scripts/leave-confirm-check.mjs', '100-102')} — record, exempt`,
      `dec: and one more, ADR-0025 vs ${at('scripts/check-citations.mjs', 3)} — still record`,
      'next:',
      `- [ ] gh#59 — the clearance budget lives at ${at('src/styles/tokens.css', 12)}`,
      `inflight: REFUTE finding quoted verbatim — ${at('scripts/arm-gate-probe.mjs', 41)}`,
    ]);
    git(root, 'add', '-A');
    git(root, 'commit', '--quiet', '-m', 'record-only save');
    const recordOnly = scan({ range: `${thirdSha}..HEAD` }, root);
    assert.equal(recordOnly.addedLinesScanned, 0, 'a push adding only done:/dec: lines must scan zero policed lines');
    assert.ok(recordOnly.filesInDiff.has(HANDOFF_FILE), 'the handoff must still be IN the diff — filesInDiff is built BEFORE exemption, and the marker below depends on it');
    assert.match(emptyNote(recordOnly), /nothing policed was scanned/, 'a record-only handoff push must NOT claim the run proved nothing');
    const trulyEmpty = scan({ range: 'HEAD..HEAD' }, root);
    assert.equal(trulyEmpty.filesInDiff.size, 0, 'an empty range touches no files at all');
    assert.match(emptyNote(trulyEmpty), /proved nothing/, 'an empty range is the tag-push and force-push signal and must say so');
    // And the third zero: a handoff push that DOES touch next: is a real scan with no marker at all.
    assert.equal(emptyNote(r), '', 'a push that policed real lines gets no NOTE — otherwise the marker means nothing');
    console.log(`PASS handoff-only pushes pick the right zero: record-only -> "${emptyNote(recordOnly).trim()}"; empty range -> "${emptyNote(trulyEmpty).trim()}"; a next:-touching push -> no marker`);

    // --- a RENAME re-presents every citation it carries into the new path -----------------------
    // Ceiling 4's promise, made falsifiable: `git mv` out of an excluded record into a live doc must
    // land every citation RED at the new path. This is NOT proving that removals would otherwise be
    // misfiled — parseDiff files them under the `--- ` path by itself. What --no-renames buys is
    // measured on real output: with detection ON the whole move is ONE hunk headed
    // `--- a/<old path>` / `+++ b/<new path>` whose only `+` line is the reworded one, so the two
    // untouched citations are never re-emitted and this deepEqual drops to a single finding.
    // Decomposed into a delete plus an add, all of them arrive new. The padding below is
    // load-bearing for exactly that: git needs most of the file unchanged to call it a rename at
    // all, and without it the fixture degrades into the delete-plus-add case it exists to
    // distinguish from, after which dropping the flag would change nothing here.
    const archiveLines = [
      '# archive',
      `untouched line — S2025-12-01#2 noted ${at('session.ts', 12)} at the time`,
      `S2026-01-01#1 — noted ${at('session.ts', 12)} at the time`,
      'padding, so that rewording one line below still reads as a rename to git and not as a delete',
      'more padding, same reason: similarity is exactly what arms the hazard this fixture proves',
      'and a third line of it, because the majority of the file has to survive the edit unchanged',
    ];
    w('docs/sessions-archive.md', archiveLines);
    git(root, 'add', '-A');
    git(root, 'commit', '--quiet', '-m', 'grow the archive');
    const beforeRename = git(root, 'rev-parse', 'HEAD').trim();
    git(root, 'mv', 'docs/sessions-archive.md', 'docs/live-notes.md');
    w('docs/live-notes.md', [
      archiveLines[0],
      `lifted into a LIVE doc — S2025-12-01#2 noted ${at('session.ts', 12)}, and an agent acts on it now`,
      ...archiveLines.slice(2),
    ]);
    git(root, 'add', '-A');
    git(root, 'commit', '--quiet', '-m', 'rename the frozen archive into a live doc');
    const renamed = scan({ range: `${beforeRename}..HEAD` }, root);
    assert.equal(renamed.moved, 0, `a rename out of an excluded path must exempt nothing — the old path's removals are not the new path's budget, got ${renamed.moved}`);
    assert.deepEqual(
      renamed.violations.map((v) => `${v.file} -> ${v.token}`),
      [`docs/live-notes.md -> ${at('session.ts', 12)}`, `docs/live-notes.md -> ${at('session.ts', 12)}`],
      'a rename is a delete plus an add: every citation the new path receives is new there',
    );
    console.log(`PASS git mv out of docs/sessions-archive.md does not launder its citations: both ${at('session.ts', 12)} lines land RED in docs/live-notes.md, ${renamed.moved} moved`);

    // --- a push with no HUNK at all: binary and mode-only -------------------------------------
    // Measured, not assumed: a binary block is `diff --git `, `new file mode`, `index`, then
    // `Binary files … differ` — it has no `--- `/`+++ ` pair and never reaches a `@@`. A mode-only
    // block is `diff --git ` plus `old mode`/`new mode`, and an empty new file stops after `index`.
    // Harvesting paths from hunk lines left filesInDiff EMPTY for all three, so a commit adding an
    // OG image (scripts/make-og.mjs ships those routinely) printed the force-push marker and claimed
    // the run proved nothing. Same dilution as the removal-only case below, by a different route.
    const beforeBinary = git(root, 'rev-parse', 'HEAD').trim();
    fs.mkdirSync(path.join(root, 'public'), { recursive: true });
    // A real PNG signature plus the head of its IHDR chunk: the NUL bytes are what make git call it
    // binary, so this is a genuine binary blob and not a text file asserted to be one.
    fs.writeFileSync(path.join(root, 'public/og.png'), Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'));
    git(root, 'add', '-A');
    git(root, 'commit', '--quiet', '-m', 'add an OG image');
    const binaryOnly = scan({ range: `${beforeBinary}..HEAD` }, root);
    assert.equal(binaryOnly.addedLinesTotal, 0, 'a binary blob contributes no diff line in either direction');
    assert.ok(binaryOnly.filesInDiff.has('public/og.png'), 'a binary file block reaches no @@ — its path must still be harvested, or the range reads as having touched nothing at all');
    assert.doesNotMatch(emptyNote(binaryOnly), /proved nothing/, 'a binary-only push is fully gated (no line, so no citation) and must not borrow the force-push marker');
    assert.match(emptyNote(binaryOnly), /binary or mode/, 'a binary-only push must name its own cause');

    // Mode-only, driven through the INDEX rather than chmod: core.fileMode is false on some
    // filesystems, where a chmod fixture would quietly produce an empty diff and assert nothing.
    const beforeMode = git(root, 'rev-parse', 'HEAD').trim();
    git(root, 'update-index', '--chmod=+x', 'good.md');
    git(root, 'commit', '--quiet', '-m', 'make a file executable, change no line');
    const modeOnly = scan({ range: `${beforeMode}..HEAD` }, root);
    assert.equal(modeOnly.addedLinesTotal, 0, 'a mode change contributes no diff line either');
    assert.ok(modeOnly.filesInDiff.has('good.md'), 'a mode-only block reaches no @@ either — same harvest, same requirement');
    assert.match(emptyNote(modeOnly), /binary or mode/, 'binary and mode-only are one cause with two routes: no hunk exists, so no line could be added');
    console.log(`PASS a hunkless push still counts as touching files: public/og.png and good.md reach filesInDiff and the run says "${emptyNote(binaryOnly).trim()}"`);

    // --- a removal-only push has its own zero, and must not borrow the force-push marker ---------
    // `git rm` plus a commit adds nothing, so addedLinesScanned is 0 — but the range is not empty
    // and the push IS fully gated, because a push that adds no line cannot add a citation. Printing
    // "the run proved nothing" on a routine deletion is exactly the dilution ADR-0025's Consequences
    // forbid: that sentence is the only signal the force-push hole in ceiling 8 has left.
    const beforeRemoval = git(root, 'rev-parse', 'HEAD').trim();
    git(root, 'rm', '--quiet', 'good.ts');
    git(root, 'commit', '--quiet', '-m', 'delete a file and add nothing');
    const removalOnly = scan({ range: `${beforeRemoval}..HEAD` }, root);
    assert.equal(removalOnly.addedLinesScanned, 0, 'a removal-only push adds no line to police');
    assert.ok(removalOnly.filesInDiff.has('good.ts'), 'a deleted file is a file the range touched — filesInDiff is added AND removed lines, before any exemption');
    assert.doesNotMatch(emptyNote(removalOnly), /proved nothing/, 'a deletion is fully gated and must not read as the tag-push/force-push case');
    assert.match(emptyNote(removalOnly), /only removed lines/, 'a removal-only push must say so in its own words');
    assert.equal(
      new Set([emptyNote(r), emptyNote(recordOnly), emptyNote(trulyEmpty), emptyNote(removalOnly), emptyNote(binaryOnly)]).size,
      5,
      'a real scan, an all-exempt push, an empty range, a removal-only push and a hunkless one must each get their own sentence',
    );
    // Driven through REAL scans, unlike the pure cases above: whether a cause is distinguishable at
    // all depends on fields scan() has to compute correctly, not just on emptyNote's branches.
    assert.equal(emptyNote(modeOnly), emptyNote(binaryOnly), 'binary and mode-only are one cause by two routes and deliberately share a sentence');
    console.log(`PASS a removal-only push keeps its own sentence: "${emptyNote(removalOnly).trim()}" — distinct from the empty-range marker and from the all-exempt one`);

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

  const { filesInDiff, filesScanned, addedLinesTotal, removedLinesTotal, addedLinesScanned, violations, moved } = scan(r, repoRoot);
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
  console.log(
    `added-lineno-citation-check: ${filesScanned} file(s), ${addedLinesScanned} added line(s) scanned over ${r.range} (${r.source}); ` +
      `${violations.length} new line-number citation(s), ${moved} pre-existing citation(s) moved and allowed` +
      emptyNote({ addedLinesScanned, addedLinesTotal, removedLinesTotal, filesInDiff }),
  );
}

await main();
