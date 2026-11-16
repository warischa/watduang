#!/usr/bin/env node
// Gate: no TRACKED file under docs/verification/evidence/ may carry a local machine path or a
// hyphen-encoded variant of one.
//
// WHY. The repo is PUBLIC. Evidence files are committed by hand from probe runs, so the paths a
// probe prints (a home-directory checkout, a browser profile under the OS temp root, a scratchpad
// directory) land in the published tree along with the measurement they belong to. The owner ruled
// (2026-11-16): scrub the current files AND keep them scrubbed with this gate. Git history is not
// rewritten.
//
// THE SET, and why it is finite: every path `git ls-files` reports under docs/verification/evidence/.
// Git owns the list, so an untracked directory being written by another agent, or a git worktree
// under .claude/worktrees/, can never enter the scan — this gate does not walk the filesystem at
// all. EVERY tracked file is scanned in three views — UTF-8 (lossy), UTF-16LE and UTF-16BE, each
// with its BOM stripped where present — and a hit in any view is a finding. Nothing is classified
// as binary and skipped: the excluded set is empty, so a sparse NUL cannot hide a path and a path
// embedded in image metadata is visible in whichever view spells it.
//
// THE SHAPES are the tokens this repo's producers actually emit, not every way a machine path can
// be spelled: `/Users/<name>`, `/home/<name>`, `/root` (the Linux root home, bare or with a
// trailing path — macOS's `/var/root` contains it), `/private/tmp`, `/private/var/folders`,
// `/var/folders/`, `/tmp/`, a Windows `C:\Users\` in either slash direction (mixed separators
// too), and the hyphen-encoded forms `-Users-` and `-var-folders-` (Claude's project-directory
// encoding, which drops the slashes and dots and so survives a naive search for a leading `/`).
// The allowed placeholders are `<repo>`, `~` and `<tmp>`; a placeholder-led token is masked whole
// before matching, so `<repo>/tmp/x` is one allowed token, not a temp path. The account name itself
// is deliberately NOT a shape here: the gate source and its selftest ship in the same public repo,
// so writing the name into the detector would republish the very value being removed. A verify-time
// search for the account name covers bare-name hits the shape list cannot express.
//
// NO BASE REF. The gate reads the whole tracked set every run, so it cannot be satisfied by a
// diff-scoped exemption and cannot rot into "only new lines are policed". The scrub left the
// baseline at 0 hits; any hit is a violation.
//
// A HIT IS REPORTED REDACTED. CI logs for this repo are public too, so the finding names the file,
// the line and the shape, and prints the line with the matched token replaced — never the value
// itself.
//
//   node scripts/evidence-local-path-check.mjs            -> scan every tracked evidence file, three views
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
const SHAPES = [
  { name: '/Users/<name>', re: /\/Users\/[^\s"'`]*/g },
  { name: '/home/<name>', re: /\/home\/[A-Za-z][^\s"'`]*/g },
  // The root home is the whole token `root`, bare or followed by `/`. The boundary keeps prose
  // tokens like `saveGroup/root.hidden` green (measured against the tracked set) while `cd /root`,
  // `HOME=/root` and `/var/root` all hit — a trailing-slash-only shape would miss every bare form.
  { name: '/root', re: /\/root(?=[/\s"'`]|$)[^\s"'`]*/g },
  { name: '/private/tmp', re: /\/private\/tmp[^\s"'`]*/g },
  { name: '/private/var/folders', re: /\/private\/var\/folders[^\s"'`]*/g },
  { name: '/var/folders/', re: /\/var\/folders\/[^\s"'`]*/g },
  { name: '/tmp/', re: /\/tmp\/[^\s"'`]*/g },
  // Either slash direction, mixed included: `C:/Users\example` is invisible to both the backslash
  // form and the `/Users/` substring, so the separators are a class, not a literal.
  { name: 'C:\\Users\\', re: /[A-Za-z]:[\\/]+Users[\\/][^\s"'`]*/gi },
  { name: '-Users-', re: /-Users-[A-Za-z0-9._-]*/g },
  { name: '-var-folders-', re: /-var-folders-[A-Za-z0-9._-]*/g },
];

// P3: a placeholder-led token is allowed WHOLE, so `<repo>/tmp/x` and `~/tmp/x` must not red on
// their temp-path suffix. Mask each such token to a distinct sentinel before matching; a real temp
// path after whitespace, `=`, `:` or a quote is a separate token and still reds. Distinct sentinels
// keep restore aligned even when a shape's tail consumes one.
const PLACEHOLDER_RE = /(?:<repo>|<tmp>|~)[^\s"'`]*/g;

const SENTINEL = String.fromCharCode(1);

function maskPlaceholders(line) {
  const originals = [];
  const masked = line.replace(PLACEHOLDER_RE, (m) => {
    originals.push(m);
    return SENTINEL + (originals.length - 1) + SENTINEL;
  });
  return { masked, originals };
}

/**
 * Every shaped token on one line, as `{ shape, index, match }`, longest first at each position.
 * Placeholder-led tokens are masked whole first (P3), so a shape cannot match their suffix.
 * The regexes are stateful (`g`), so each is reset before use; an empty match can never loop.
 *
 * OVERLAP IS DEDUPED, not double-reported: `/private/tmp/x` is one temp path, but it contains the
 * `/tmp/` token as a substring, and `/private/var/folders/...` contains `/var/folders/...`. The
 * more specific (longer, earlier) token wins, so one line yields one finding per real path.
 */
export function findHits(line) {
  const { masked } = maskPlaceholders(line);
  const raw = [];
  for (const shape of SHAPES) {
    shape.re.lastIndex = 0;
    let match;
    while ((match = shape.re.exec(masked)) !== null) {
      raw.push({ shape: shape.name, index: match.index, match: match[0] });
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
 * Placeholder-led tokens are masked during replacement and restored after, so an allowed token
 * survives intact in the sample. */
export function redact(line) {
  const { masked, originals } = maskPlaceholders(line);
  let out = masked;
  for (const shape of SHAPES) out = out.replace(shape.re, '<redacted>');
  originals.forEach((orig, i) => { out = out.split(SENTINEL + i + SENTINEL).join(orig); });
  return out.trim().slice(0, 200);
}

/** Every tracked file under the evidence directory, per git's own index — never a filesystem walk. */
export function listTrackedEvidence(cwd) {
  const out = execFileSync('git', ['ls-files', '-z', '--', EVIDENCE_DIR], {
    cwd,
    encoding: 'buffer',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.toString('utf8').split('\0').filter(Boolean);
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

/** Scan the listed files in all three views; a hit in ANY view is a finding. Identical findings
 * (same file, line, shape and matched token) are deduped across views. No file is skipped. */
export function scanFiles(dir, files) {
  const hits = [];
  const seen = new Set();
  for (const file of files) {
    const buf = fs.readFileSync(path.join(dir, file));
    for (const text of textViews(buf)) {
      text.split('\n').forEach((line, i) => {
        for (const hit of findHits(line)) {
          const key = `${file}|${i + 1}|${hit.shape}|${hit.match}`;
          if (seen.has(key)) continue;
          seen.add(key);
          hits.push({ file, line: i + 1, shape: hit.shape, sample: redact(line) });
        }
      });
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Self-test: a throwaway git repo under the OS temp root. One must-red fixture per rejected shape
// AND per encoding a producer emits (UTF-8, UTF-8 BOM, UTF-16LE/BE with and without BOM), including
// the two REFUTE inputs (a Linux root home in UTF-8; a macOS home in BOM-less UTF-16LE), the judge's
// sparse-NUL input, and two binaries whose RAW bytes carry a shaped token — the excluded set is
// empty, so those are must-RED, not must-skip. Each fixture names the shape it must report; hitting
// under the WRONG shape is still a broken detector. Must-green: every allowed placeholder, in plain
// UTF-8 and each UTF-16 encoding, plus placeholder-led tokens whose suffix looks like a temp path
// (P3). Removing the red fixtures must clear the scan.
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

    // Every value is a generic example, never this machine's account.
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
    ];
    const greenFixtures = [
      { name: 'green-placeholders.txt', buf: utf8(['repo: <repo>/docs/x', 'home: ~/x', 'temp: <tmp>/x', 'prose: temporary files stay in TMPDIR'].join('\n') + '\n') },
      // A UTF-16 file carrying ONLY an allowed placeholder must decode and stay green — the
      // encoding fix must not invent hits.
      { name: 'utf16le-green.txt', buf: utf16le('<repo>/x\n') },
      { name: 'utf16be-green.txt', buf: utf16be('<repo>/x\n') },
      { name: 'utf8-bom-green.txt', buf: utf8bom('<repo>/x\n') },
      // P3: a placeholder-led token is masked WHOLE, so a temp-path suffix inside it is not a hit.
      { name: 'placeholder-tmp.txt', buf: utf8('<repo>/tmp/results.json\n~/tmp/results.json\n') },
    ];
    for (const f of [...redFixtures, ...greenFixtures]) {
      fs.writeFileSync(path.join(evidenceDir, f.name), f.buf);
    }

    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['add', '-A'], { cwd: dir });

    const allNames = [...redFixtures, ...greenFixtures].map((f) => f.name).sort();
    const tracked = listTrackedEvidence(dir);
    assert.deepEqual(
      tracked.map((f) => path.basename(f)).sort(),
      allNames,
      'the fixture repo must track every planted file, per-item — a count alone cannot tell "all" from "the last N"',
    );

    const hits = scanFiles(dir, tracked);
    const redNames = redFixtures.map((f) => f.name).sort();
    const hitFiles = [...new Set(hits.map((h) => path.basename(h.file)))].sort();
    assert.deepEqual(hitFiles, redNames, 'exactly the must-red fixtures must be flagged, and nothing else');
    assert.equal(hits.length, redFixtures.length, `one hit per must-red fixture, got ${hits.length}`);
    for (const f of redFixtures) {
      const fh = hits.filter((h) => path.basename(h.file) === f.name);
      assert.equal(fh.length, 1, `${f.name}: exactly one hit, got ${fh.length}`);
      assert.equal(fh[0].shape, f.shape, `${f.name}: must report shape ${f.shape}, got ${fh[0].shape}`);
    }
    const shapesSeen = new Set(hits.map((h) => h.shape));
    assert.equal(
      shapesSeen.size,
      SHAPES.length,
      `every rejected shape must be exercised by a fixture, saw ${[...shapesSeen].join(', ')}`,
    );
    assert.ok(
      hits.every((h) => h.sample.includes('<redacted>') && !h.sample.includes('example')),
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
    for (const f of redFixtures) fs.rmSync(path.join(evidenceDir, f.name));
    execFileSync('git', ['add', '-A'], { cwd: dir });
    const cleared = scanFiles(dir, listTrackedEvidence(dir));
    assert.deepEqual(cleared, [], 'removing every must-red fixture must return the scan to zero hits');

    // A broken detector (a shape silently dropped) must be caught by the shape-coverage assertion
    // above, not by a vacuous green: prove the fixture set still contains every shape.
    assert.equal(SHAPES.length, 10, 'the rejected-shape set must stay at ten entries; a dropped shape would pass every fixture');
    console.log('PASS calibration: removing the must-red fixtures clears the scan, and the shape set is complete');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
async function main() {
  if (process.argv.includes('--selftest')) return selftest();

  const tracked = listTrackedEvidence(repoRoot);
  // A missing or empty list must be loud: "scanned nothing" is not "clean".
  if (!tracked.length) {
    console.error(
      '::error::git ls-files returned no tracked files under docs/verification/evidence — the gate scanned nothing, which is not the same as clean',
    );
    process.exit(1);
  }

  const hits = scanFiles(repoRoot, tracked);
  if (hits.length) {
    for (const hit of hits) {
      console.error(`::error file=${hit.file}::[evidence-local-path] line ${hit.line}: ${hit.shape} — ${hit.sample}`);
    }
    const files = new Set(hits.map((h) => h.file));
    console.error(
      `\n${hits.length} local-path hit(s) across ${files.size} tracked evidence file(s). ` +
        'Replace the repository root with <repo>, any other home path with ~, and a temp path with <tmp>.',
    );
    process.exit(1);
  }

  console.log(
    `evidence-local-path-check: ${tracked.length} tracked evidence file(s) scanned in three views (UTF-8, UTF-16LE, UTF-16BE), 0 local-path hit(s). ` +
      'Nothing is skipped; untracked evidence directories are not in git and therefore not scanned.',
  );
}

await main();