#!/usr/bin/env node
// Gate: no TRACKED file may carry a home-directory path that names an account, and no tracked file
// under docs/verification/evidence/ may carry any local machine path or a hyphen-encoded variant of
// one. (The file keeps its evidence-scoped name because package.json and CI call it by that name.)
//
// WHY. The repo is PUBLIC. Evidence files are committed by hand from probe runs, so the paths a
// probe prints (a home-directory checkout, a browser profile under the OS temp root, a scratchpad
// directory) land in the published tree along with the measurement they belong to. The owner ruled
// (2026-11-16): scrub the current files AND keep them scrubbed with this gate. Git history is not
// rewritten. A second ruling the same day widened the identity half to the whole repo: an account
// name in a home path leaks from a prompt log or a doc exactly as it does from evidence.
//
// THE SET, and why it is finite: git owns the list, in two parts.
//   1. Every path `git ls-files` reports (tracked), partitioned by two keys:
//      - Evidence (under docs/verification/evidence/) x every shape below, and NO name is admitted:
//        the reserved placeholder name reds there too, because evidence spells a home as `~`.
//      - Every other tracked file x the IDENTITY shapes only (home directories and their hyphen
//        encodings), and only when the token's account segment is a real name. The reserved
//        placeholder account name and an angle placeholder such as `<name>` are admitted, and a
//        segment with no letter or digit carries no name. Temp-dir and root-home shapes are not
//        policed there: a probe's temp constant or prose about an apex/root domain names nobody.
//   2. Every UNTRACKED, not-gitignored path `git ls-files --others --exclude-standard` reports
//      under docs/verification/evidence/ only. Fresh evidence exists locally before `git add`, and
//      on 2026-11-17 a local path in such a file passed this gate locally, then redded sixteen
//      times once the commit made it tracked. An untracked evidence file gets the evidence rules —
//      every shape, no name admitted — exactly as a tracked one does.
// Untracked files OUTSIDE the evidence directory are deliberately outside the scan: that is where
// in-flight agent output lives (`.scratch/` is not gitignored), and grading it would red on working
// notes the agents are still writing. The untracked half honours .gitignore and is bracketed to the
// evidence directory, so a git worktree under .claude/worktrees/ can never enter the scan — this
// gate does not walk the filesystem at all. A fresh checkout has no untracked files, so a CI run
// sees the set it always did; the untracked half bites in local runs.
// No file is exempt by path — the gate's own source included — so a real name added later to any
// file reds; fixtures pass only by spelling the reserved name. EVERY file in the set is scanned in
// three views — UTF-8 (lossy), UTF-16LE and UTF-16BE, each with its BOM stripped where present —
// and a hit in any view is a finding. Nothing is classified as binary and skipped: the excluded set
// is empty, so a sparse NUL cannot hide a path and a path embedded in image metadata is visible in
// whichever view spells it. A file in the set missing from the working tree throws: never a skip.
//
// THE SHAPES are the tokens this repo's producers actually emit, not every way a machine path can
// be spelled. Identity (repo-wide): `/Users/<name>`, `/home/<name>`, a Windows `C:\Users\` in either
// slash direction (mixed separators too), and the hyphen-encoded `-Users-` and an ANCHORED `-home-`
// (Claude's project-directory encoding, which drops the slashes and dots and so survives a naive
// search for a leading `/`; anchored so a class name that merely contains the segment is not a
// hit). Evidence only: `/root` (the Linux root home, bare or with a trailing path — macOS's
// `/var/root` contains it), `/private/tmp`, `/private/var/folders`, `/var/folders/`, `/tmp/` and
// the hyphen-encoded `-var-folders-`. The allowed placeholders are `<repo>`, `~` and `<tmp>`; a
// placeholder-led token is masked whole for the TEMP-DIR shapes only, so `<repo>/tmp/x` is one
// allowed token, while a home or hyphen-encoded form inside it still matches unmasked. The account
// name itself is deliberately NOT a shape here: the gate source and its selftest ship in the same
// public repo, so writing the name into the detector would republish the very value being removed.
// A verify-time search for the account name covers bare-name hits the shape list cannot express.
//
// NO BASE REF. The gate reads the whole tracked set every run, so it cannot be satisfied by a
// diff-scoped exemption and cannot rot into "only new lines are policed". The scrub left the
// baseline at 0 hits; any hit is a violation.
//
// A HIT IS REPORTED REDACTED. CI logs for this repo are public too, so the finding names the file,
// the line and the shape, and prints the line with the matched token replaced — never the value
// itself.
//
//   node scripts/evidence-local-path-check.mjs            -> scan every tracked file plus every untracked evidence file, three views, scoped by path
//   node scripts/evidence-local-path-check.mjs --selftest -> calibration on a throwaway fixture repo
//
// CEILING, disclosed: this is a shape list over text, not a proof that no machine path exists. A
// producer that spells a path through a variable, a relative path from a home directory, or a
// hostname not listed above is invisible to it; the account-name search in the verification lane is
// the second instrument, and neither substitutes for the other. The three views cover UTF-8 and
// UTF-16; an encoding outside them (UTF-32, a compressed archive's interior) is still not decoded.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const EVIDENCE_DIR = 'docs/verification/evidence';

// Each entry matches the WHOLE encoded token, not just its prefix, so a redacted report cannot leak
// the part that follows the shape (the account name sits inside a hyphen-encoded segment).
//
// `account` marks an IDENTITY shape — one whose token carries an account name — and returns that
// name's segment from the matched token. Identity shapes are policed in every tracked file; the
// rest (temp dirs, the root home) only under the evidence directory.
const slashAccount = (prefix) => (m) => m.replace(prefix, '').replace(/^[\\/]+/, '').split(/[\\/]/)[0];
const hyphenAccount = (prefix) => (m) => m.replace(prefix, '').split('-')[0];
const SHAPES = [
  { name: '/Users/<name>', re: /\/Users\/[^\s"'`]*/g, account: slashAccount(/^\/Users\//) },
  // Same account class as `/Users/`: requiring a leading ASCII letter missed every account that
  // opens with a digit or a non-ASCII letter, in evidence as well as outside it. A bare `/home/`
  // still carries no name and stays green outside evidence.
  { name: '/home/<name>', re: /\/home\/[^\s"'`]*/g, account: slashAccount(/^\/home\//) },
  // The root home is the whole token `root`, bare or followed by `/`. The boundary keeps prose
  // tokens like `saveGroup/root.hidden` green (measured against the tracked set) while `cd /root`,
  // `HOME=/root` and `/var/root` all hit — a trailing-slash-only shape would miss every bare form.
  { name: '/root', re: /\/root(?=[/\s"'`]|$)[^\s"'`]*/g },
  // useMask: ONLY these slash-form temp-dir shapes match the placeholder-masked line (P3). Every
  // other shape — home dirs, Windows homes, and the hyphen-encoded -Users- / -var-folders- forms —
  // matches the UNMASKED line, so a hyphen-encoded home inside `~/.claude/projects/-Users-...` or
  // `<tmp>/claude-501/-Users-...` still reds instead of being masked away.
  { name: '/private/tmp', re: /\/private\/tmp[^\s"'`]*/g, useMask: true },
  { name: '/private/var/folders', re: /\/private\/var\/folders[^\s"'`]*/g, useMask: true },
  { name: '/var/folders/', re: /\/var\/folders\/[^\s"'`]*/g, useMask: true },
  { name: '/tmp/', re: /\/tmp\/[^\s"'`]*/g, useMask: true },
  // Either slash direction, mixed included: `C:/Users\example` is invisible to both the backslash
  // form and the `/Users/` substring, so the separators are a class, not a literal.
  { name: 'C:\\Users\\', re: /[A-Za-z]:[\\/]+Users[\\/][^\s"'`]*/gi, account: slashAccount(/^[A-Za-z]:[\\/]+Users[\\/]+/i) },
  // The account class is any script's letters, marks and digits, not ASCII alone: an ASCII-only
  // class matched only the `-Users-` prefix of a Thai account, which read as "no name" outside
  // evidence and as a truncated token inside it. \p{M} is load-bearing: a combining mark continues
  // the account name, so admitting only letters stopped the token at the mark — `example` followed
  // by a combining accent read as the reserved placeholder and the whole account escaped. KNOWN
  // BLIND SPOT (deliberate): the hyphen encoding has no account/path boundary, so
  // `-Users-example-alice` is indistinguishable from an account named `example-alice`,
  // `example/alice` or `example.alice` — it reads as the reserved `example` and is admitted outside
  // evidence. That case is out of this gate's reach, not green by measurement.
  { name: '-Users-', re: /-Users-[\p{L}\p{M}\p{N}._-]*/gu, account: hyphenAccount(/^-Users-/) },
  // ANCHORED: the segment must open a token (no name character, mark or hyphen before it), so a
  // class name or custom property that merely contains it never matches and a mark that continues
  // a preceding letter is not mistaken for a token boundary. Claude's encoding of a Linux home
  // always opens the directory name with it.
  { name: '-home-', re: /(?<![\p{L}\p{M}\p{N}._-])-home-[\p{L}\p{M}\p{N}._-]*/gu, account: hyphenAccount(/^-home-/) },
  { name: '-var-folders-', re: /-var-folders-[A-Za-z0-9._-]*/g },
];

// The one reserved placeholder account name, plus the `<name>` angle-placeholder form. Fixtures and
// prose outside evidence spell a home path with one of these; any other account segment that
// contains a letter or digit in ANY script is treated as a real name. A segment with neither
// (`-Users-` alone, `...`) carries no name. Evidence admits nothing: every identity token reds
// there, reserved or not.
const RESERVED_ACCOUNT = 'example';
const ANGLE_PLACEHOLDER = /^<[A-Za-z0-9_-]+>$/;

export function carriesAccountName(segment) {
  return /[\p{L}\p{N}]/u.test(segment) && segment !== RESERVED_ACCOUNT && !ANGLE_PLACEHOLDER.test(segment);
}

// P3: a placeholder-led token is allowed WHOLE for the TEMP-DIR shapes only, so `<repo>/tmp/x` and
// `~/tmp/x` must not red on their temp-path suffix. Mask each such token to SAME-LENGTH spaces —
// only the useMask shapes read this masked line; every other shape reads the unmasked line, so a
// home or hyphen-encoded form inside the token still reds. Same-length masking keeps every hit
// index in one coordinate system, so the overlap dedup below stays valid across masked/unmasked.
const PLACEHOLDER_RE = /(?:<repo>|<tmp>|~)[^\s"'`]*/g;

function maskPlaceholders(line) {
  return line.replace(PLACEHOLDER_RE, (m) => ' '.repeat(m.length));
}

/**
 * Every shaped token on one line, as `{ shape, index, match }`, longest first at each position.
 * Only the temp-dir slash shapes (useMask) match the placeholder-masked line; every other shape
 * matches the UNMASKED line, so a home/hyphen form inside a placeholder token still reds (P3).
 * The regexes are stateful (`g`), so each is reset before use; an empty match can never loop.
 *
 * OVERLAP IS DEDUPED, not double-reported: `/private/tmp/x` is one temp path, but it contains the
 * `/tmp/` token as a substring, and `/private/var/folders/...` contains `/var/folders/...`. The
 * more specific (longer, earlier) token wins, so one line yields one finding per real path.
 * Masking is same-length, so masked and unmasked hits share one index space and dedup is valid.
 *
 * SCOPE. `evidence: true` (the default) keeps every shape, unconditionally. `evidence: false` keeps
 * only identity tokens that carry a real account name — and drops the rest BEFORE the overlap
 * dedup, so a temp-dir token wrapping a named hyphen-encoded home cannot swallow it.
 */
export function findHits(line, { evidence = true } = {}) {
  const masked = maskPlaceholders(line);
  const raw = [];
  for (const shape of SHAPES) {
    if (!evidence && !shape.account) continue;
    const target = shape.useMask ? masked : line;
    shape.re.lastIndex = 0;
    let match;
    while ((match = shape.re.exec(target)) !== null) {
      if (evidence || carriesAccountName(shape.account(match[0]))) {
        raw.push({ shape: shape.name, index: match.index, match: match[0] });
      }
      if (match[0] === '') shape.re.lastIndex++;
    }
  }
  raw.sort((a, b) => a.index - b.index || b.match.length - a.match.length);
  const kept = [];
  for (const hit of raw) {
    const end = hit.index + hit.match.length;
    const contained = kept.some((k) => hit.index >= k.index && end <= k.index + k.match.length);
    if (!contained) kept.push(hit);
  }
  return kept;
}

/** The line with every shaped token replaced by `<redacted>`, truncated for a one-line finding.
 * Each found token's range is replaced in the UNMASKED line, last first; allowed placeholder tokens
 * are not hits, so they survive intact. A temp hit never overlaps a masked region (its tail stops
 * at whitespace), so every hit index/match is valid in the unmasked line. */
export function redact(line) {
  const hits = findHits(line);
  let out = line;
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i];
    out = out.slice(0, h.index) + '<redacted>' + out.slice(h.index + h.match.length);
  }
  return out.trim().slice(0, 200);
}

/**
 * Every UNTRACKED, not-gitignored file under the evidence directory, per git — never a filesystem
 * walk. Git still owns the list; this is the second half of it.
 *
 * WHY: a fresh evidence file exists on disk before `git add`, and a local path in it must red at
 * that moment, not only once the commit makes it tracked. On 2026-11-17 such a file passed this
 * gate locally and then redded sixteen times after it was committed.
 *
 * Bracketed to the evidence directory ON PURPOSE. An untracked file elsewhere is in-flight agent
 * output (`.scratch/` is not gitignored), which this gate does not grade. `--exclude-standard`
 * honours .gitignore, so a gitignored path — including a worktree under `.claude/worktrees/` —
 * can never enter the scan. A fresh checkout has no untracked files, so CI sees the same set it
 * always did; this half bites in local runs.
 */
/**
 * Split `git ... -z` output into RAW path BYTES, one Buffer per path. Never decode here: a name
 * that is not valid UTF-8 decodes to U+FFFD, and re-encoding that names a DIFFERENT file — the gate
 * would read a clean sibling and exit 0 while the indexed blob carries a home path. Decode only for
 * display.
 */
function splitNul(buf) {
  const parts = [];
  let start = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0) {
      if (i > start) parts.push(buf.subarray(start, i));
      start = i + 1;
    }
  }
  if (start < buf.length) parts.push(buf.subarray(start));
  return parts;
}

export function listUntrackedEvidence(cwd) {
  const out = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z', '--', EVIDENCE_DIR], {
    cwd,
    encoding: 'buffer',
    maxBuffer: 64 * 1024 * 1024,
  });
  return splitNul(out);
}

/** Every tracked file in the repo, per git's own index — never a filesystem walk. Paths are raw
 * bytes (see splitNul); a non-UTF-8 name must never be re-encoded into a different file. */
export function listTracked(cwd) {
  const out = execFileSync('git', ['ls-files', '-z'], {
    cwd,
    encoding: 'buffer',
    maxBuffer: 64 * 1024 * 1024,
  });
  return splitNul(out);
}

/**
 * Every tracked file is read in THREE views — UTF-8 (lossy), UTF-16LE and UTF-16BE — each with its
 * own BOM stripped where present. Nothing is classified or skipped: a sparse NUL no longer hides
 * text, and a path embedded in binary metadata is visible in whichever view spells it. An odd
 * trailing byte (a truncated write) is dropped from the UTF-16 views; BE is byte-swapped on a COPY,
 * so the caller's buffer is never mutated. The excluded set is empty by construction.
 */
export function textViews(buf) {
  let utf8 = buf;
  let le = buf;
  let be = buf;
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) utf8 = buf.subarray(3);
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) le = buf.subarray(2);
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) be = buf.subarray(2);
  const evenLE = le.subarray(0, le.length - (le.length % 2));
  const evenBE = be.subarray(0, be.length - (be.length % 2));
  return [
    utf8.toString('utf8'),
    evenLE.toString('utf16le'),
    Buffer.from(evenBE).swap16().toString('utf16le'),
  ];
}

const EVIDENCE_DIR_BYTES = Buffer.from(`${EVIDENCE_DIR}/`, 'utf8');

/** True for a repo-relative path under the evidence directory, where every shape is policed.
 * Accepts the raw path Buffer or its display string; a Buffer is compared as bytes. */
export function isEvidence(file) {
  const bytes = Buffer.isBuffer(file) ? file : Buffer.from(file, 'utf8');
  return bytes.length >= EVIDENCE_DIR_BYTES.length && bytes.subarray(0, EVIDENCE_DIR_BYTES.length).equals(EVIDENCE_DIR_BYTES);
}

/** A repo-relative path (raw Buffer or string) as an fs path under `dir`. A Buffer is concatenated
 * as bytes, never decoded, so the file opened is exactly the one git indexed. */
function fullPath(dir, file) {
  if (!Buffer.isBuffer(file)) return path.join(dir, file);
  return Buffer.concat([Buffer.from(dir + path.sep, 'utf8'), file]);
}

/** Scan the listed files in all three views; a hit in ANY view is a finding. Identical findings
 * (same file, line, shape and matched token) are deduped across views. No file is skipped; the
 * scope (every shape, or named identity shapes only) follows the file's path. Paths are raw bytes:
 * a Buffer path reaches fs unchanged, so a non-UTF-8 name is the file git indexed and never a lossy
 * re-encoding of it; decode only for display.
 *
 * A symlink is scanned as its target string — the blob git commits — never the bytes it points at.
 * An entry `lstat` says is a DIRECTORY carries no file content here (a gitlink stores a commit id,
 * and an untracked embedded repo is listed as its directory), so its PATH string is scanned instead
 * and the entry is counted in `pathOnly`; the scan never aborts on it.
 *
 * Returns `{ hits, pathOnly }`. */
export function scanFiles(dir, files) {
  const hits = [];
  const seen = new Set();
  let pathOnly = 0;
  for (const file of files) {
    const full = fullPath(dir, file);
    const display = Buffer.isBuffer(file) ? file.toString('utf8') : file;
    // Internal identity is the raw bytes; a lossy display string cannot tell two non-UTF-8 names apart.
    const identity = Buffer.isBuffer(file) ? file.toString('latin1') : file;
    const st = fs.lstatSync(full);
    let buf;
    if (st.isSymbolicLink()) {
      // Read the link text, exactly what git stores, and never follow it: following would scan a
      // clean target and miss a home path in the committed blob, and a dangling link would throw.
      buf = fs.readlinkSync(full, { encoding: 'buffer' });
    } else if (st.isDirectory()) {
      // No file content to read; the path bytes themselves are what gets scanned.
      pathOnly++;
      buf = Buffer.isBuffer(file) ? file : Buffer.from(file, 'utf8');
    } else {
      buf = fs.readFileSync(full);
    }
    const evidence = isEvidence(file);
    for (const text of textViews(buf)) {
      text.split('\n').forEach((line, i) => {
        for (const hit of findHits(line, { evidence })) {
          const key = `${identity}|${i + 1}|${hit.shape}|${hit.match}`;
          if (seen.has(key)) continue;
          seen.add(key);
          hits.push({ file: display, line: i + 1, shape: hit.shape, sample: redact(line) });
        }
      });
    }
  }
  return { hits, pathOnly };
}

// ---------------------------------------------------------------------------
// Self-test: a throwaway git repo under the OS temp root. One must-red fixture per rejected shape
// AND per encoding a producer emits (UTF-8, UTF-8 BOM, UTF-16LE/BE with and without BOM), including
// the two REFUTE inputs (a Linux root home in UTF-8; a macOS home in BOM-less UTF-16LE), the judge's
// sparse-NUL input, and two binaries whose RAW bytes carry a shaped token — the excluded set is
// empty, so those are must-RED, not must-skip. Each fixture names the shape it must report; hitting
// under the WRONG shape is still a broken detector. Must-green: every allowed placeholder, in plain
// UTF-8 and each UTF-16 encoding, plus placeholder-led tokens whose suffix looks like a temp path
// (P3). Outside evidence: one must-red per identity shape with a real name (the anchored hyphen
// Linux home in UTF-8 and UTF-16LE, a named home nested in a temp token, near misses of the
// reserved name, and a copy of this gate's own source path), and must-greens for a temp constant,
// a class name containing the hyphen segment, and the reserved name in every identity shape.
// Removing the red fixtures must clear the scan.
// ---------------------------------------------------------------------------
function selftest() {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'evidence-local-path-check-'));
  try {
    const evidenceDir = path.join(dir, EVIDENCE_DIR);
    fs.mkdirSync(evidenceDir, { recursive: true });

    // Encoding helpers: the same bytes a real producer writes. Node decodes only utf16le, so BE is
    // byte-swapped LE — the decoder under test has to do the same.
    const utf8 = (s) => Buffer.from(s, 'utf8');
    const utf8bom = (s) => Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), utf8(s)]);
    const utf16le = (s, bom = false) => {
      const b = Buffer.from(s, 'utf16le');
      return bom ? Buffer.concat([Buffer.from([0xff, 0xfe]), b]) : b;
    };
    const utf16be = (s, bom = false) => {
      const b = Buffer.from(s, 'utf16le').swap16();
      return bom ? Buffer.concat([Buffer.from([0xfe, 0xff]), b]) : b;
    };

    // Every value is a generic example, never this machine's account. RESERVED is the placeholder
    // account name the repo-wide scope admits; NAME stands for any other (real) account.
    const RESERVED = 'example';
    const NAME = 'alice';
    const DIGIT_NAME = '7alice'; // an account name that opens with a digit
    const UNAME = 'สมชาย'; // a non-ASCII account name, as escapes only
    // A combining mark CONTINUES the preceding letter: the acute accent below, and a Thai vowel
    // sign sitting between two consonants (U+0E2A U+0E38 U+0E14).
    const COMBINING_ACUTE = String.fromCodePoint(0x0301);
    const THAI_MARK_NAME = String.fromCodePoint(0x0E2A, 0x0E38, 0x0E14);

    const redFixtures = [
      { name: 'home-mac.txt', shape: '/Users/<name>', buf: utf8('shot: /Users/example/copy/shot.png\n') },
      { name: 'home-linux.txt', shape: '/home/<name>', buf: utf8('cd /home/example/repo\n') },
      // REFUTE input 1: the Linux root home, absent from the old home-directory set.
      { name: 'home-root.txt', shape: '/root', buf: utf8('shot: /root/project/shot.png\n') },
      { name: 'private-tmp.txt', shape: '/private/tmp', buf: utf8('out: /private/tmp/example/shot.png\n') },
      { name: 'private-var-folders.txt', shape: '/private/var/folders', buf: utf8('out: /private/var/folders/ab/cdefgh/T/shot.png\n') },
      { name: 'var-folders.txt', shape: '/var/folders/', buf: utf8('out: /var/folders/ab/cdefgh/T/shot.png\n') },
      { name: 'tmp.txt', shape: '/tmp/', buf: utf8('profile: /tmp/cdp-prof\n') },
      { name: 'windows.txt', shape: 'C:\\Users\\', buf: utf8('path: C:\\Users\\example\\shot.png\n') },
      // Either slash direction: forward-only hits under /Users/<name> unless the Windows shape
      // itself widens; mixed separators hit under NOTHING in the old set.
      { name: 'windows-forward.txt', shape: 'C:\\Users\\', buf: utf8('path: C:/Users/example/shot.png\n') },
      { name: 'windows-mixed.txt', shape: 'C:\\Users\\', buf: utf8('path: C:/Users\\example\\shot.png\n') },
      { name: 'hyphen-users.txt', shape: '-Users-', buf: utf8('dir: -Users-example-c-repo\n') },
      { name: 'hyphen-var-folders.txt', shape: '-var-folders-', buf: utf8('dir: -var-folders-ab-\n') },
      { name: 'utf8-bom.txt', shape: '/Users/<name>', buf: utf8bom('shot: /Users/example/shot.png\n') },
      // REFUTE input 2: BOM-less UTF-16LE text, which a NUL-byte check classifies as binary.
      { name: 'utf16le.txt', shape: '/Users/<name>', buf: utf16le('shot: /Users/example/shot.png\n') },
      { name: 'utf16le-bom.txt', shape: '/tmp/', buf: utf16le('profile: /tmp/cdp-prof\n', true) },
      { name: 'utf16be.txt', shape: '/root', buf: utf16be('shot: /root/project/shot.png\n') },
      { name: 'utf16be-bom.txt', shape: '/home/<name>', buf: utf16be('cd /home/example/repo\n', true) },
      // F2: the excluded set is empty. A binary whose RAW bytes carry a shaped token is a HIT, not
      // a skip — both fixtures flipped from must-skip to must-red.
      { name: 'binary.bin', shape: '/Users/<name>', buf: Buffer.from([0x2f, 0x55, 0x73, 0x65, 0x72, 0x73, 0x2f, 0x78, 0x00, 0x01]) },
      { name: 'binary-clustered.bin', shape: '/Users/<name>', buf: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x2f, 0x55, 0x73, 0x65, 0x72, 0x73, 0x2f, 0x78]) },
      // The judge's sparse-NUL input: one NUL early, then a real path on the next line. A
      // NUL-alternation classifier calls this binary and skips it; the three-view scan must not.
      { name: 'sparse-nul.txt', shape: '/Users/<name>', buf: utf8('probe\0\npath: /Users/example/shot.png\n') },
      // P3: a real temp path adjacent to a placeholder on the same line must still red.
      { name: 'placeholder-adjacent.txt', shape: '/tmp/', buf: utf8('~/a /tmp/x\n') },
      { name: 'temp-after-colon.txt', shape: '/tmp/', buf: utf8('path:/tmp/x\n') },
      // Post-ship probe: masking the WHOLE placeholder-led token also hid the hyphen-encoded HOME
      // form inside it — exactly what Claude tooling writes. Home/hyphen shapes match the UNMASKED
      // line, so both of these must red under -Users-.
      { name: 'hyphen-home-in-tilde.txt', shape: '-Users-', buf: utf8('~/.claude/projects/-Users-example-c-proj/x\n') },
      { name: 'hyphen-home-in-tmp.txt', shape: '-Users-', buf: utf8('<tmp>/claude-501/-Users-example-c-proj/x\n') },
      // The anchored Linux hyphen-encoded home, in evidence: strict there, reserved name included.
      { name: 'hyphen-linux-home.txt', shape: '-home-', buf: utf8('dir: ~/.claude/projects/-home-example-proj/x\n') },
      // A Thai account is an account. The Linux-home shape demanded a leading ASCII letter, so this
      // was invisible in evidence too, where every shape is policed and no account name is admitted.
      { name: 'unicode-linux-home.txt', shape: '/home/<name>', buf: utf8('cd /home/' + UNAME + '/project\n') },

      // REPO-WIDE identity shapes, outside evidence. NAME stands for a real account; every literal
      // below is split at the shape so this source never spells a named home path itself, and the
      // gate scanning its own file stays green while the planted copies red.
      { dir: 'docs/notes', name: 'real-mac-home.md', shape: '/Users/<name>', buf: utf8('notes: /Users/' + NAME + '/proj/shot.png\n') },
      { dir: 'docs/notes', name: 'real-linux-home.md', shape: '/home/<name>', buf: utf8('cd /home/' + NAME + '/repo\n') },
      { dir: 'docs/notes', name: 'real-windows-home.md', shape: 'C:\\Users\\', buf: utf8('path: C:\\Users\\' + NAME + '\\shot.png\n') },
      { dir: 'docs/notes', name: 'real-hyphen-users.md', shape: '-Users-', buf: utf8('dir: ~/.claude/projects/-Users-' + NAME + '-c-proj/x\n') },
      { dir: 'docs/notes', name: 'real-hyphen-home.md', shape: '-home-', buf: utf8('dir: ~/.claude/projects/-home-' + NAME + '-proj/x\n') },
      { dir: 'docs/notes', name: 'real-hyphen-home-utf16le.txt', shape: '-home-', buf: utf16le('dir: ~/.claude/projects/-home-' + NAME + '-proj/x\n') },
      // A named home NESTED in a temp-dir token: the temp shape is evidence-only, so it must be
      // dropped BEFORE the overlap dedup, or it swallows the identity token and the name escapes.
      { dir: 'scripts', name: 'real-home-in-temp.mjs', shape: '-Users-', buf: utf8("const out = '/private/tmp/claude-501/-Users-" + NAME + "-c-proj/scratchpad/x';\n") },
      // Near misses of the reserved name are real names: the admission is the exact word only.
      { dir: 'docs/notes', name: 'near-reserved-slash.md', shape: '/Users/<name>', buf: utf8('p: /Users/' + RESERVED + 's/x\n') },
      { dir: 'docs/notes', name: 'near-reserved-hyphen.md', shape: '-Users-', buf: utf8('d: -Users-' + RESERVED + 'x-proj\n') },
      { dir: 'docs/notes', name: 'near-placeholder.md', shape: '/Users/<name>', buf: utf8('p: /Users/<name>' + 'x/y\n') },
      // A name outside ASCII is still a name, and a doubled separator does not empty the segment.
      { dir: 'docs/notes', name: 'non-ascii-mac-home.md', shape: '/Users/<name>', buf: utf8('p: /Users/' + UNAME + '/x\n') },
      { dir: 'docs/notes', name: 'non-ascii-windows-home.md', shape: 'C:\\Users\\', buf: utf8('p: C:\\Users\\' + UNAME + '\\x\n') },
      // An account name need not open with an ASCII letter. The Linux-home shape required one, and
      // both hyphen-encoded matchers admitted only ASCII, so a digit-leading or Thai account in the
      // plain and in the hyphen-encoded form passed every scope — the counterexamples this pins.
      { dir: 'docs/notes', name: 'digit-linux-home.md', shape: '/home/<name>', buf: utf8('cd /home/' + DIGIT_NAME + '/repo\n') },
      { dir: 'docs/notes', name: 'non-ascii-linux-home.md', shape: '/home/<name>', buf: utf8('cd /home/' + UNAME + '/repo\n') },
      { dir: 'docs/notes', name: 'non-ascii-hyphen-users.md', shape: '-Users-', buf: utf8('dir: ~/.claude/projects/-Users-' + UNAME + '-proj/x\n') },
      { dir: 'docs/notes', name: 'digit-hyphen-home.md', shape: '-home-', buf: utf8('dir: ~/.claude/projects/-home-' + DIGIT_NAME + '-proj/x\n') },
      { dir: 'docs/notes', name: 'doubled-separator.md', shape: '/Users/<name>', buf: utf8('p: /Users//' + NAME + '/x\n') },
      // A combining mark continues the account name. The hyphen class used to stop at it, so
      // `example` + mark read as the reserved placeholder and the hyphen form escaped outside
      // evidence; the slash forms already red, and stay red here.
      { dir: 'docs/notes', name: 'combining-mac-home.md', shape: '/Users/<name>', buf: utf8('p: /Users/' + RESERVED + COMBINING_ACUTE + '/x\n') },
      { dir: 'docs/notes', name: 'combining-linux-home.md', shape: '/home/<name>', buf: utf8('cd /home/' + RESERVED + COMBINING_ACUTE + '/repo\n') },
      { dir: 'docs/notes', name: 'combining-hyphen-users.md', shape: '-Users-', buf: utf8('d: ~/.claude/projects/-Users-' + RESERVED + COMBINING_ACUTE + '-proj/x\n') },
      { dir: 'docs/notes', name: 'combining-hyphen-home.md', shape: '-home-', buf: utf8('d: ~/.claude/projects/-home-' + RESERVED + COMBINING_ACUTE + '-proj/x\n') },
      // A Thai account can carry a combining vowel mid-name; the whole token must match, or the
      // redacted report prints the tail of the name.
      { dir: 'docs/notes', name: 'thai-mark-hyphen-users.md', shape: '-Users-', buf: utf8('d: ~/.claude/projects/-Users-' + THAI_MARK_NAME + '-proj/x\n') },
      // No file is exempt: a named home inside a copy of THIS gate's own source path still reds.
      { dir: 'scripts', name: 'evidence-local-path-check.mjs', shape: '/Users/<name>', buf: utf8("const leaked = '/Users/" + NAME + "/x';\n") },
      // A SYMLINK IS ITS TARGET STRING. Git commits the link text, never the bytes it points at, so
      // following the link reads the CLEAN target created below and exits 0 on a home path sitting
      // in the committed blob. The link text is the whole finding.
      { name: 'symlink-home.txt', shape: '/Users/<name>', link: '../../../Users/' + NAME + '/clean.txt' },
      ];
    const greenFixtures = [
      { name: 'green-placeholders.txt', buf: utf8(['repo: <repo>/docs/x', 'home: ~/x', 'temp: <tmp>/x', 'prose: temporary files stay in TMPDIR'].join('\n') + '\n') },
      // The sibling whose name holds the LITERAL U+FFFD (bytes EF BF BD) with clean bytes: a lossy
      // decode collapses the raw-name fixture onto THIS name, which is exactly why the lookup must
      // not decode. Its green is the bug's cover story, not a fixture that could never red.
      { name: 'raw-name-\ufffd.txt', buf: utf8('clean bytes, nothing to report\n') },
      // A UTF-16 file carrying ONLY an allowed placeholder must decode and stay green — the
      // encoding fix must not invent hits.
      { name: 'utf16le-green.txt', buf: utf16le('<repo>/x\n') },
      { name: 'utf16be-green.txt', buf: utf16be('<repo>/x\n') },
      { name: 'utf8-bom-green.txt', buf: utf8bom('<repo>/x\n') },
      // P3: a placeholder-led token is masked WHOLE, so a temp-path suffix inside it is not a hit.
      { name: 'placeholder-tmp.txt', buf: utf8('<repo>/tmp/results.json\n~/tmp/results.json\n') },
      // Outside evidence, temp-dir and root-home shapes are not policed: a probe's temp constant,
      // a workflow scratch path and prose about an apex/root domain all stay green there.
      { dir: 'scripts', name: 'probe-temp.mjs', buf: utf8(["const OUT = '/tmp/probe-shot.png';", "const P = '/private/tmp/x';", "const V = '/var/folders/ab/T/x';", "const H = '-var-folders-ab-';", '// the apex/root domain; cd /root', ''].join('\n')) },
      // A symlink whose target is a clean relative path stays green: the link TEXT is the content,
      // and it carries no home, temp or root-home shape.
      { dir: 'docs/notes', name: 'symlink-clean.md', link: '../../docs/verification/evidence/green-placeholders.txt' },
      // The anchored hyphen form never matches a word that merely contains the segment.
      { dir: 'src/styles', name: 'home-classes.css', buf: utf8('.btn-home-menu { color: red; }\n:root { --home-bg: #000; }\n') },
      { dir: 'src/styles', name: 'home-classes-utf16le.css', buf: utf16le('.btn-home-menu { color: red; }\n') },
      // The reserved account name and the angle placeholder stay green in every identity shape
      // outside evidence, as does a token that carries no name at all.
      {
        dir: 'docs/notes',
        name: 'reserved-names.md',
        buf: utf8(
          [
            'p: /Users/' + RESERVED + '/x',
            'p: /Users/<name>/x',
            'p: /home/' + RESERVED + '/repo',
            'p: C:\\Users\\' + RESERVED + '\\x',
            'p: C:/Users/<name>/x',
            'd: -Users-' + RESERVED + '-c-proj',
            'd: ~/.claude/projects/-home-' + RESERVED + '-proj/x',
            'd: -Users-... and a bare -Users- and a bare /Users/ directory',
            '',
          ].join('\n'),
        ),
      },
    ];
    // A filename with a RAW 0xff byte. Decoding `git ls-files -z` as UTF-8 turns it into U+FFFD, and
    // re-encoding that names the clean sibling below — the gate would read THAT file, exit 0, and
    // never see the home path in the indexed blob. Paths stay raw bytes end to end; only display is
    // decoded. A byte-preserving filesystem (CI's ext4) takes the name, so the fixture is a full
    // must-red there. APFS refuses a non-UTF-8 name at the syscall (EILSEQ), so on such a machine the
    // entry lives in the INDEX only and the fixture pins the invariant that machine can still prove:
    // the path comes back BYTE-EXACT, so it can never silently open the clean sibling.
    const RAW_NAME = Buffer.concat([Buffer.from(`${EVIDENCE_DIR}/raw-name-`), Buffer.from([0xff]), Buffer.from('.txt')]);
    const RAW_HOME = utf8('shot: /Users/' + NAME + '/shot.png\n');
    const RAW_SIBLING = `${EVIDENCE_DIR}/raw-name-\ufffd.txt`;
    let rawNameOnDisk = true;
    try {
      fs.writeFileSync(Buffer.concat([Buffer.from(dir + path.sep, 'utf8'), RAW_NAME]), RAW_HOME);
    } catch (e) {
      if (e.code !== 'EILSEQ') throw e;
      rawNameOnDisk = false;
    }
    if (rawNameOnDisk) redFixtures.push({ relBytes: RAW_NAME, shape: '/Users/<name>', buf: RAW_HOME });

    // `rel` is the DISPLAY path (lossy for a non-UTF-8 name, which is all a report needs); `relBytes`
    // is the raw path git and fs must see. Two fixtures can share a display name while being two
    // different files — that collision is the bug the raw-name fixture pins.
    const rel = (f) => (f.relBytes ? f.relBytes.toString('utf8') : `${f.dir ?? EVIDENCE_DIR}/${f.name}`);
    const fixturePath = (f) =>
      f.relBytes ? Buffer.concat([Buffer.from(dir + path.sep, 'utf8'), f.relBytes]) : path.join(dir, rel(f));
    for (const f of [...redFixtures, ...greenFixtures]) {
      fs.mkdirSync(path.join(dir, path.dirname(rel(f))), { recursive: true });
      // A `link` fixture is a symlink; its CONTENT is the target string, which is what git commits.
      if (f.link) fs.symlinkSync(f.link, fixturePath(f));
      else fs.writeFileSync(fixturePath(f), f.buf);
    }

    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['add', '-A'], { cwd: dir });

    // The clean target the tracked symlink fixture points at: clean bytes under a home-shaped path, so
    // FOLLOWING the link finds nothing and a follow-based scan exits 0 on the counter-example. Written
    // after `git add` so it stays out of the tracked fixture set this assertion pins.
    fs.mkdirSync(path.join(dir, 'Users', NAME), { recursive: true });
    fs.writeFileSync(path.join(dir, 'Users', NAME, 'clean.txt'), 'nothing to see here\n');

    // A tracked GITLINK: `git ls-files` lists it, and the working tree holds a DIRECTORY where a file
    // would be — a gitlink stores a commit id and no content. Reading it aborts with EISDIR, so the
    // scan must count it by path and never read it.
    const GITLINK_PATH = 'docs/notes/gitlink-target';
    fs.mkdirSync(path.join(dir, GITLINK_PATH), { recursive: true });
    execFileSync('git', ['update-index', '--add', '--cacheinfo', `160000,${'1'.repeat(40)},${GITLINK_PATH}`], { cwd: dir });

    // Where the OS forbids the raw name on disk, put the same entry in the INDEX with a real blob:
    // the path and its content are exactly what a committed evidence file would carry.
    if (!rawNameOnDisk) {
      const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: dir, input: RAW_HOME }).toString().trim();
      execFileSync('git', ['update-index', '-z', '--index-info'], {
        cwd: dir,
        input: Buffer.concat([Buffer.from(`100644 ${blob} 0\t`), RAW_NAME, Buffer.from([0])]),
      });
    }

    const asBuf = (p) => (Buffer.isBuffer(p) ? p : Buffer.from(p, 'utf8'));
    const sortedBytes = (arr) => arr.map(asBuf).sort(Buffer.compare);
    const fixturePaths = [...redFixtures, ...greenFixtures]
      .map((f) => f.relBytes ?? rel(f))
      .concat(GITLINK_PATH, ...(rawNameOnDisk ? [] : [RAW_NAME]));
    const tracked = listTracked(dir);
    assert.deepEqual(
      sortedBytes(tracked),
      sortedBytes(fixturePaths),
      'the fixture repo must track every planted file, per-item, BY BYTES — a count alone cannot tell "all" from "the last N", and a display string cannot tell the two raw-name files apart',
    );

    // Where the OS refused the raw name there is no working-tree file to read, so that entry stays out
    // of the scan set — the gate's contract is to throw on a missing file, and the byte-exactness is
    // pinned below. On a byte-preserving filesystem the fixture is an ordinary must-red and IS scanned.
    const scannable = rawNameOnDisk ? tracked : tracked.filter((p) => !(Buffer.isBuffer(p) && p.equals(RAW_NAME)));
    const { hits, pathOnly } = scanFiles(dir, scannable);
    assert.equal(pathOnly, 1, 'the tracked gitlink must be counted as a path-only entry, not read as a file');

    // The raw-name fixture's platform-adaptive half: git hands the path back BYTE-EXACT (never as
    // U+FFFD), the lossy decode is the CLEAN sibling, and a byte-exact path can never silently open
    // that sibling — so the exit-0-on-the-home-path failure is impossible with the fix in place.
    if (!rawNameOnDisk) {
      assert.ok(
        tracked.some((p) => Buffer.isBuffer(p) && p.equals(RAW_NAME)),
        'the indexed raw-byte name must come back BYTE-EXACT from git, never as U+FFFD',
      );
      assert.equal(RAW_NAME.toString('utf8'), RAW_SIBLING, 'the lossy decode of the raw name IS the sibling name — that collision is the bug');
      assert.deepEqual(scanFiles(dir, [RAW_SIBLING]).hits, [], 'the sibling is clean, so a lossy decode exits 0 on the home path');
      assert.throws(() => scanFiles(dir, [RAW_NAME]), (e) => e.code === 'ENOENT', 'a byte-exact path targets the indexed file, never the clean sibling');
    }
    const redPaths = redFixtures.map(rel).sort();
    const hitFiles = [...new Set(hits.map((h) => h.file))].sort();
    assert.deepEqual(hitFiles, redPaths, 'exactly the must-red fixtures must be flagged, and nothing else');
    assert.equal(hits.length, redFixtures.length, `one hit per must-red fixture, got ${hits.length}`);
    for (const f of redFixtures) {
      const fh = hits.filter((h) => h.file === rel(f));
      assert.equal(fh.length, 1, `${rel(f)}: exactly one hit, got ${fh.length}`);
      assert.equal(fh[0].shape, f.shape, `${rel(f)}: must report shape ${f.shape}, got ${fh[0].shape}`);
    }
    const shapesSeen = new Set(hits.map((h) => h.shape));
    assert.equal(
      shapesSeen.size,
      SHAPES.length,
      `every rejected shape must be exercised by a fixture, saw ${[...shapesSeen].join(', ')}`,
    );
    assert.ok(
      hits.every((h) => h.sample.includes('<redacted>') && !h.sample.includes(RESERVED) && !h.sample.includes(NAME) && !h.sample.includes(UNAME)),
      'every finding must print the line redacted, never the matched value',
    );

    // P3 masking controls, per member of the rule: a placeholder-led token is green WHOLE, while a
    // real temp path after whitespace, `=`, `:` or a quote is a separate token and still reds.
    assert.deepEqual(findHits('<repo>/tmp/results.json'), [], 'a placeholder-led token must be masked whole, not matched by its temp-path suffix');
    assert.deepEqual(findHits('~/tmp/results.json'), [], '~/tmp/... is one allowed token, not a temp path');
    assert.deepEqual(findHits('<tmp>/tmp/x'), [], 'a <tmp>-led token is masked whole too');
    assert.equal(findHits('~/a /tmp/x').length, 1, 'a real temp path after whitespace must still red');
    assert.equal(findHits('out=/tmp/x').length, 1, 'a real temp path after = must still red');
    assert.equal(findHits('path:/tmp/x').length, 1, 'a real temp path after : must still red');
    assert.equal(findHits('"/tmp/x"').length, 1, 'a real temp path after a quote must still red');
    // The mask is TEMP-DIR-only: a hyphen-encoded home inside a placeholder-led token still reds.
    assert.deepEqual(findHits('~/.claude/projects/-Users-example-c-proj/x').map((h) => h.shape), ['-Users-'], 'a hyphen-encoded home inside a ~-led token must red under -Users-, not be masked away');
    assert.deepEqual(findHits('<tmp>/claude-501/-Users-example-c-proj/x').map((h) => h.shape), ['-Users-'], 'a hyphen-encoded home inside a <tmp>-led token must red under -Users-, not be masked away');
    // The hyphen-encoded Linux home is anchored at a token boundary in every scope.
    assert.deepEqual(findHits('.btn-home-menu'), [], 'a class name containing the segment is not a hyphen-encoded home');
    assert.deepEqual(findHits('var(--home-bg)'), [], 'a custom property containing the segment is not a hyphen-encoded home');
    // Outside evidence, only an identity shape carrying a real name is a hit.
    assert.deepEqual(findHits('out=/tmp/x', { evidence: false }), [], 'a temp path outside evidence is not policed');
    assert.deepEqual(findHits('/Users/' + RESERVED + '/x', { evidence: false }), [], 'the reserved name is green outside evidence');
    assert.equal(findHits('/Users/' + RESERVED + '/x').length, 1, 'the reserved name still reds in evidence');
    assert.deepEqual(findHits('/tmp/claude-501/-Users-' + NAME + '-c-x', { evidence: false }).map((h) => h.shape), ['-Users-'], 'a named home nested in a temp token reds outside evidence');
    // A combining mark belongs to the account name, so the token continues past it: outside
    // evidence each of these reds as ONE whole token, and the report redacts it whole — a match
    // truncated at the mark would print the name's tail into a public CI log.
    for (const token of [
      '-Users-' + RESERVED + COMBINING_ACUTE + '-proj',
      '-home-' + RESERVED + COMBINING_ACUTE + '-proj',
      '-Users-' + THAI_MARK_NAME + '-proj',
    ]) {
      assert.deepEqual(findHits(token, { evidence: false }).map((h) => h.match), [token], `${JSON.stringify(token)}: a marked account name must red outside evidence as one whole token`);
      assert.equal(redact(token), '<redacted>', `${JSON.stringify(token)}: the report must redact the whole marked token`);
    }

    // Three-view controls: every encoding round-trips in its own view with its BOM stripped, the
    // view list is always three strings (nothing classified away), and each binary's raw bytes
    // carry a shaped token in the UTF-8 view — so flipping them to must-red is load-bearing.
    assert.equal(textViews(utf8('abcd'))[0], 'abcd', 'the UTF-8 view decodes plain UTF-8');
    assert.equal(textViews(utf8bom('abcd'))[0], 'abcd', 'the UTF-8 view strips the UTF-8 BOM');
    assert.equal(textViews(utf16le('abcd'))[1], 'abcd', 'the UTF-16LE view decodes BOM-less LE');
    assert.equal(textViews(utf16le('abcd', true))[1], 'abcd', 'the UTF-16LE view strips the LE BOM');
    assert.equal(textViews(utf16be('abcd'))[2], 'abcd', 'the UTF-16BE view decodes BOM-less BE');
    assert.equal(textViews(utf16be('abcd', true))[2], 'abcd', 'the UTF-16BE view strips the BE BOM');
    for (const f of redFixtures.filter((x) => x.name.endsWith('.bin'))) {
      assert.equal(textViews(f.buf).length, 3, `${f.name}: a binary still yields three views, never a skip`);
      assert.ok(findHits(textViews(f.buf)[0]).length > 0, `${f.name}: the raw bytes carry a shaped token in the UTF-8 view`);
    }
    console.log(`PASS calibration: ${hits.length}/${redFixtures.length} planted fixtures flagged with the right shape; placeholder-led tokens stayed green`);

    // Red -> green round trip: removing the must-red fixtures must clear the scan.
    for (const f of redFixtures) fs.rmSync(fixturePath(f));
    execFileSync('git', ['add', '-A'], { cwd: dir });
    const { hits: cleared } = scanFiles(dir, listTracked(dir));
    assert.deepEqual(cleared, [], 'removing every must-red fixture must return the scan to zero hits');

    // A broken detector (a shape silently dropped) must be caught by the shape-coverage assertion
    // above, not by a vacuous green: prove the fixture set still contains every shape.
    assert.equal(SHAPES.length, 11, 'the rejected-shape set must stay at eleven entries; a dropped shape would pass every fixture');
    console.log('PASS calibration: removing the must-red fixtures clears the scan, and the shape set is complete');

    // THE UNTRACKED HALF (2026-11-17): an evidence file exists on disk before `git add`, and a local
    // path in it passed this gate locally, then redded sixteen times once the commit made it
    // tracked. Git still owns the list — the untracked half is `git ls-files --others
    // --exclude-standard`, bracketed to the evidence directory. Three fixtures pin the boundary:
    //   (a) untracked, not ignored, under evidence     -> must RED under the evidence rules
    //   (b) untracked, outside the evidence directory  -> outside the set, never scanned
    //   (c) untracked, under evidence, but gitignored  -> outside the set, never scanned
    // (b) and (c) each prove their content IS a shaped hit before asserting exclusion, so each green
    // is the SET's doing and not a fixture that could never have redded.
    const UNTRACKED_HOME = 'untracked-home.txt';
    const UNTRACKED_LINK = 'untracked-link.txt';
    const UNTRACKED_DANGLING = 'untracked-dangling.txt';
    const OUTSIDE_HOME = 'docs/notes/untracked-outside-home.md';
    const IGNORED_HOME = 'ignored-home.txt';
    const leakedHome = utf8('shot: /Users/' + NAME + '/shot.png\n');
    fs.writeFileSync(path.join(dir, EVIDENCE_DIR, UNTRACKED_HOME), leakedHome);
    fs.writeFileSync(path.join(dir, OUTSIDE_HOME), leakedHome);
    fs.writeFileSync(path.join(dir, EVIDENCE_DIR, IGNORED_HOME), leakedHome);
    fs.symlinkSync('../../../Users/' + NAME + '/clean.txt', path.join(dir, EVIDENCE_DIR, UNTRACKED_LINK));
    // A dangling link is still scanned: the target string is the content, so a missing target must
    // not throw the gate out of the scan.
    fs.symlinkSync('../missing/Users/' + NAME + '/clean.txt', path.join(dir, EVIDENCE_DIR, UNTRACKED_DANGLING));
    fs.writeFileSync(path.join(dir, '.gitignore'), `${EVIDENCE_DIR}/${IGNORED_HOME}\n`);

    // An untracked EMBEDDED REPO under evidence: git lists it as a DIRECTORY entry with a trailing
    // slash, and reading it as a file aborts the whole gate with EISDIR. Its path is scanned instead
    // and the entry counted, never read.
    const EMBEDDED_REPO = 'embedded-repo';
    fs.mkdirSync(path.join(dir, EVIDENCE_DIR, EMBEDDED_REPO), { recursive: true });
    execFileSync('git', ['init', '-q'], { cwd: path.join(dir, EVIDENCE_DIR, EMBEDDED_REPO) });

    const untracked = listUntrackedEvidence(dir);
    // Paths stay raw bytes; decode only so this assertion can read like the listing.
    const untrackedDisplay = untracked.map((p) => p.toString('utf8'));
    // (a) the set admits exactly the untracked, not-ignored evidence entries — a plain file, a
    // symlink to clean bytes, a dangling symlink, and the embedded-repo directory — and scanning them
    // reds on the three files, each symlink under its TARGET STRING, while the directory is counted
    // by path and never read.
    assert.deepEqual(
      untrackedDisplay,
      [
        `${EVIDENCE_DIR}/${EMBEDDED_REPO}/`,
        `${EVIDENCE_DIR}/${UNTRACKED_DANGLING}`,
        `${EVIDENCE_DIR}/${UNTRACKED_HOME}`,
        `${EVIDENCE_DIR}/${UNTRACKED_LINK}`,
      ],
      '(a) the untracked half must admit exactly the untracked, not-ignored evidence entries',
    );
    const untrackedScan = scanFiles(dir, untracked);
    assert.deepEqual(
      untrackedScan.hits.map((h) => [h.file, h.shape]),
      [
        [`${EVIDENCE_DIR}/${UNTRACKED_DANGLING}`, '/Users/<name>'],
        [`${EVIDENCE_DIR}/${UNTRACKED_HOME}`, '/Users/<name>'],
        [`${EVIDENCE_DIR}/${UNTRACKED_LINK}`, '/Users/<name>'],
      ],
      '(a) an untracked evidence file or symlink, dangling or not, carrying a home path must red under the evidence rules',
    );
    assert.equal(untrackedScan.pathOnly, 1, 'the untracked embedded repo must be counted by path, not read as a file');
    // (b) an untracked file outside the evidence directory stays out — its content is a hit, so the
    // green is the set excluding it.
    assert.ok(!untrackedDisplay.includes(OUTSIDE_HOME), '(b) an untracked file outside the evidence directory must not enter the untracked half');
    assert.equal(
      findHits(leakedHome.toString('utf8'), { evidence: false }).length,
      1,
      '(b) the outside-evidence fixture must carry a real-named identity hit, or its green proves nothing',
    );
    // (c) a gitignored file under the evidence directory stays out, for the same reason.
    assert.ok(
      !untrackedDisplay.includes(`${EVIDENCE_DIR}/${IGNORED_HOME}`),
      '(c) a gitignored file under the evidence directory must not enter the untracked half',
    );
    assert.equal(
      scanFiles(dir, [`${EVIDENCE_DIR}/${IGNORED_HOME}`]).hits.length,
      1,
      '(c) the ignored fixture must red when scanned, or its green proves nothing',
    );

    // THE CLI PATH, end to end: run the same function `main` runs, with the same argument it builds
    // (the repo root), and assert the verdict and the named file the CLI would report. Assertions
    // over the helpers alone stay green if the CLI's own path drops a half of the set.
    const cli = runScan(dir);
    assert.equal(cli.exitCode, 1, 'the CLI path must exit non-zero on an untracked evidence file carrying a home path');
    assert.equal(cli.pathOnly, 2, 'the CLI path must count both directory entries by path (tracked gitlink + untracked embedded repo), never read them');
    assert.deepEqual(
      [...new Set(cli.hits.map((h) => h.file))].sort(),
      [`${EVIDENCE_DIR}/${UNTRACKED_DANGLING}`, `${EVIDENCE_DIR}/${UNTRACKED_HOME}`, `${EVIDENCE_DIR}/${UNTRACKED_LINK}`],
      'the CLI path must name exactly the untracked evidence fixtures it reds on',
    );

    // The same round trip the tracked half proves, now over the CLI's own set: removing the
    // untracked must-red fixtures must return it to exit 0.
    fs.rmSync(path.join(dir, EVIDENCE_DIR, UNTRACKED_HOME));
    fs.rmSync(path.join(dir, EVIDENCE_DIR, UNTRACKED_LINK));
    fs.rmSync(path.join(dir, EVIDENCE_DIR, UNTRACKED_DANGLING));
    assert.equal(runScan(dir).exitCode, 0, 'removing the untracked must-red fixtures must return the CLI path to exit 0');
    assert.deepEqual(
      scanFiles(dir, [...listTracked(dir), ...listUntrackedEvidence(dir)]).hits,
      [],
      'removing the untracked must-red fixtures must return the combined scan to zero hits',
    );
    console.log('PASS calibration: untracked evidence reds through the CLI path, untracked files outside evidence and gitignored files stay unscanned');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
/**
 * THE SCAN the CLI runs: the exact file set `main` builds, the hit list it reports, and the exit
 * code it derives. Split out so the selftest can drive the CLI's own path against a fixture repo —
 * helper-level assertions alone stay green when this path drops a half of the set.
 */
export function runScan(root) {
  const tracked = listTracked(root);
  const untrackedEvidence = listUntrackedEvidence(root);
  const evidenceCount = tracked.filter(isEvidence).length;
  // A missing or empty list must be loud: "scanned nothing" is not "clean". The evidence directory
  // is the strict scope, so an empty evidence subset is loud too. Zero UNTRACKED evidence files is
  // the normal state (and always a fresh checkout's), so it stays quiet.
  const empty = !tracked.length || !evidenceCount;
  const { hits, pathOnly } = scanFiles(root, [...tracked, ...untrackedEvidence]);
  return { tracked, untrackedEvidence, evidenceCount, empty, hits, pathOnly, exitCode: empty || hits.length > 0 ? 1 : 0 };
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest();

  const { tracked, untrackedEvidence, evidenceCount, empty, hits, pathOnly, exitCode } = runScan(repoRoot);
  if (empty) {
    console.error(
      `::error::git ls-files returned ${tracked.length} tracked file(s) (${evidenceCount} under ${EVIDENCE_DIR}) and ${untrackedEvidence.length} untracked evidence file(s) — the gate scanned nothing in at least one scope, which is not the same as clean`,
    );
    process.exit(exitCode);
  }

  if (hits.length) {
    for (const hit of hits) {
      console.error(`::error file=${hit.file}::[evidence-local-path] line ${hit.line}: ${hit.shape} — ${hit.sample}`);
    }
    const files = new Set(hits.map((h) => h.file));
    console.error(
      `\n${hits.length} local-path hit(s) across ${files.size} file(s). ` +
        'Replace the repository root with <repo>, any other home path with ~, and a temp path with <tmp>; ' +
        `outside ${EVIDENCE_DIR}, a fixture or example spells the account as ${RESERVED_ACCOUNT} or <name>.`,
    );
    process.exit(exitCode);
  }

  console.log(
    `evidence-local-path-check: ${tracked.length} tracked + ${untrackedEvidence.length} untracked evidence file(s) scanned in three views (UTF-8, UTF-16LE, UTF-16BE), ${pathOnly} directory entry(ies) scanned by PATH only (gitlink / embedded repo, no file content), 0 local-path hit(s) — ` +
      `home-directory shapes and their hyphen encodings carrying any account name but the reserved placeholders (${RESERVED_ACCOUNT}, <name>) in all ${tracked.length}; ` +
      `every shape, temp-dir and root-home included and no name admitted, in the ${evidenceCount + untrackedEvidence.length} under ${EVIDENCE_DIR} (${evidenceCount} tracked, ${untrackedEvidence.length} untracked). ` +
      `Git owns the list: untracked files outside ${EVIDENCE_DIR} are deliberately not scanned, and a gitignored file is never scanned.`,
  );
}

await main();