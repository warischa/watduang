#!/usr/bin/env node
// CSP allowlist gate for the deployed artifact (dist/staticwebapp.config.json — Azure SWA only reads
// config from inside app_location, and this also catches the defect where the file fails to ship).
// CLAUDE.md, non-negotiable: the CSP "must let AdSense through, or ads silently fail to render".
//
// What changed and why (gh#47, ADR-0019 rule 1). The previous version of this gate lived inline in
// ci.yml and asserted `csp.includes(src)` for four Google wildcards — a substring test against the
// whole header, with no idea which directive the match landed in. Moving *.googlesyndication.com out
// of script-src and into img-src keeps that string in the header, so the gate stayed green while the
// AdSense loader was blocked and every ad slot rendered empty. A directive-blind check cannot see the
// likeliest edit that breaks ads, which is exactly the tripwire ADR-0019 rule 1 rejects. It is gone.
//
// This gate parses the header into directives and asserts each recorded (directive, source) pair sits
// in the directive that GOVERNS it. Ownership: the set of domains AdSense requires is Google-owned
// and does not converge by prediction, so this bounds the repo-owned thing instead — the pairs that
// are actually in public/staticwebapp.config.json today.
//
// ponytail: the pair list below is a dated snapshot (see PAIRS_AS_OF), not a prediction. Its green
// means "every source expression this repo shipped on that date is still in its own directive" — it
// can never mean "the CSP is sufficient for AdSense". Three things it provably does not cover:
//   1. A domain Google starts requiring after PAIRS_AS_OF is invisible. Ads break, gate stays green.
//   2. ADDITIONS never go red, by design — a new Google domain, or a new directive, is a superset
//      check and passes. That also means adding 'unsafe-inline' to script-src passes here (the
//      inline gate's premise, not this one's, and no ad breaks from it).
//      Pinned by selftest "ceiling 2".
//   3. default-src fallback is NOT honoured: a source consolidated into default-src and removed from
//      script-src reads as red even though browsers would fall back and ads would work. Fail-safe
//      direction, deliberate — the alternative fails open on the gh#47 edit. Pinned by "ceiling 3".
// Upgrade path for 1: none by prediction. Re-derive the list from the live AdSense docs on any ad
// regression and bump PAIRS_AS_OF; that is a human step and there is no gate for it.
//
//   node scripts/csp-allowlist-check.mjs                                  -> check dist/staticwebapp.config.json
//   node scripts/csp-allowlist-check.mjs public/staticwebapp.config.json  -> the source config pre-build, LOCAL ONLY (refused when CI is set)
//   node scripts/csp-allowlist-check.mjs --selftest                       -> both-direction calibration, no file IO on dist/

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

// '' / '0' / 'false' are not CI. GitHub Actions sets CI=true.
const isCi = (env = process.env) => !!env.CI && env.CI !== '0' && env.CI !== 'false';

// Derived from public/staticwebapp.config.json by reading the file, not by retyping it. Every
// (directive, source) pair the repo shipped on this date; a removal or a move goes red.
const PAIRS_AS_OF = '2026-08-19';

// gh#66: sha256 of the exact Content-Security-Policy string in public/staticwebapp.config.json as of
// PAIRS_AS_OF (the source the REQUIRED_PAIRS snapshot above was derived from — dist/'s copy is a
// build output of it, not a second source). main() re-hashes the live file and compares; a mismatch
// means the CSP changed since PAIRS_AS_OF without REQUIRED_PAIRS/PAIRS_AS_OF/PAIRS_HASH being bumped
// alongside it, which is exactly the drift ADR-0019/gh#66 asks to make visible.
//
// Content hash, not mtime: CI runs actions/checkout, which stamps every file with checkout time, so
// an mtime-vs-PAIRS_AS_OF compare would read "newer" on every single run and fire unconditionally —
// a gate that always fires is as useless as one that never does.
const PAIRS_HASH = 'ccfa695ccf2c8fc72f9f2cff0fd786ec828c3eba1e8a9138008f8ba7b5bdc920';
// ponytail: PAIRS_HASH reads public/ only, so a dist/-only CSP widening — a stale or hand-edited build
// artifact — clears both this hash and ceiling 2's addition-blindness. Named rather than closed: dist/ is
// a build output, and hashing it here would pin the gate to whatever the last build produced instead of
// to the source of truth. Upgrade path if it ever matters: verify dist/ is a clean build of public/ in CI
// before this gate runs, rather than widening what this gate reads.
const hashCsp = (csp) => crypto.createHash('sha256').update(csp, 'utf8').digest('hex');
const REQUIRED_PAIRS = new Map([
  ['default-src', ["'self'"]],
  ['script-src', ["'self'", '*.googlesyndication.com', '*.doubleclick.net', '*.google.com', '*.adtrafficquality.google', '*.googleadservices.com']],
  ['style-src', ["'self'", "'unsafe-inline'"]],
  ['frame-src', ["'self'", '*.googlesyndication.com', '*.doubleclick.net', '*.google.com', '*.adtrafficquality.google']],
  ['img-src', ["'self'", 'data:', '*.googlesyndication.com', '*.doubleclick.net', '*.google.com', '*.adtrafficquality.google', '*.gstatic.com']],
  ['connect-src', ["'self'", '*.googlesyndication.com', '*.doubleclick.net', '*.google.com', '*.adtrafficquality.google']],
  ['object-src', ["'none'"]],
]);

// ---------------------------------------------------------------------------
// Pure: header text -> violations. No file IO, so the selftest feeds it strings.
// ---------------------------------------------------------------------------

/** `default-src 'self'; script-src 'self' *.x.com` -> Map { 'default-src' => Set{"'self'"}, ... }
 *  Directive names are ASCII case-insensitive per CSP3; source expressions are not (host names are
 *  matched case-insensitively by browsers, but this repo writes them lowercase and a case change
 *  would be a real diff worth seeing). */
export function parseCsp(csp) {
  const directives = new Map();
  for (const part of csp.split(';')) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;
    const name = tokens.shift().toLowerCase();
    // A repeated directive is ignored by browsers after the first; mirror that, don't merge.
    if (!directives.has(name)) directives.set(name, new Set(tokens));
  }
  return directives;
}

export function findMisplacedPairs(csp, required = REQUIRED_PAIRS) {
  const directives = parseCsp(csp);
  const violations = [];
  for (const [directive, sources] of required) {
    const present = directives.get(directive);
    for (const source of sources) {
      if (present && present.has(source)) continue;
      // Name where it went, if anywhere — that is the diagnostic the old substring check destroyed.
      const foundIn = [...directives].filter(([, s]) => s.has(source)).map(([d]) => d);
      violations.push({ directive, source, foundIn });
    }
  }
  return violations;
}

function report(violations, label) {
  for (const v of violations) {
    const where = v.foundIn.length
      ? `it is in ${v.foundIn.join(', ')} instead — a source expression only applies to the directive it is listed under`
      : 'it is not in the header at all';
    console.error(`::error::${label}: CSP ${v.directive} is missing ${v.source} — ${where}`);
  }
  if (violations.length) {
    console.error(
      `\n${violations.length} misplaced or missing (directive, source) pair(s) against the ${PAIRS_AS_OF} snapshot ` +
      'of public/staticwebapp.config.json. CLAUDE.md: the CSP must let AdSense through or ads silently fail to ' +
      'render — a blocked loader shows an empty slot, not an error. If this move is deliberate, update ' +
      'REQUIRED_PAIRS and PAIRS_AS_OF in this script in the same commit as the config change.',
    );
  }
}

// ---------------------------------------------------------------------------
// Self-test: strings and a temp-dir fixture only. NOTHING here reads, writes, or rebuilds dist/ —
// this gate runs after Build, and a verification step that rebuilds the artifact voids every earlier
// gate's verdict in the same run (gh#38).
// ---------------------------------------------------------------------------
function selftest() {
  const shipped =
    "default-src 'self'; script-src 'self' *.googlesyndication.com *.doubleclick.net *.google.com " +
    "*.adtrafficquality.google *.googleadservices.com; style-src 'self' 'unsafe-inline'; frame-src 'self' " +
    '*.googlesyndication.com *.doubleclick.net *.google.com *.adtrafficquality.google; img-src ' +
    "'self' data: *.googlesyndication.com *.doubleclick.net *.google.com *.adtrafficquality.google " +
    "*.gstatic.com; connect-src 'self' *.googlesyndication.com *.doubleclick.net *.google.com " +
    "*.adtrafficquality.google; object-src 'none'";

  // --- known-good: the shipped header satisfies every recorded pair. ---
  assert.deepEqual(findMisplacedPairs(shipped), [], 'the shipped CSP header must report zero misplaced pairs');
  const pairCount = [...REQUIRED_PAIRS.values()].reduce((n, s) => n + s.length, 0);
  console.log(`PASS known-good: the shipped header satisfies all ${pairCount} recorded (directive, source) pairs`);

  // --- gh#66: PAIRS_HASH freshness, calibrated both ways on the pure hash function. known-good: the
  // exact string public/staticwebapp.config.json ships today hashes to the committed PAIRS_HASH —
  // this fixture is that string verbatim (see the file header comment above `shipped`), so if this
  // assertion ever goes red it means either the real CSP changed without PAIRS_HASH being bumped, or
  // this fixture drifted from it; either way it is the intended signal, not selftest flake. ---
  assert.equal(hashCsp(shipped), PAIRS_HASH, 'PAIRS_HASH must match the sha256 of the shipped CSP string — bump PAIRS_HASH (and PAIRS_AS_OF) in the same commit as any CSP change');
  console.log(`PASS PAIRS_HASH known-good: hashCsp(shipped) matches the committed PAIRS_HASH (${PAIRS_HASH.slice(0, 12)}…)`);
  // known-bad: a single added byte (a widened script-src, ceiling 2's own case — never flagged by
  // findMisplacedPairs) must still change the hash and therefore trip staleness.
  const hashDrifted = shipped.replace("script-src 'self'", "script-src 'self' *.some-new-google-thing.com");
  assert.deepEqual(findMisplacedPairs(hashDrifted), [], 'calibration precondition: an addition-only CSP change must still pass the pairs check (ceiling 2)');
  assert.notEqual(hashCsp(hashDrifted), PAIRS_HASH, 'a CSP change invisible to findMisplacedPairs (ceiling 2) must still change the hash, so staleness is caught where the pairs check cannot see it');
  console.log('PASS PAIRS_HASH known-bad: an addition-only CSP edit that findMisplacedPairs cannot see (ceiling 2) still changes the hash, so staleness is caught');

  // --- known-bad: THE gh#47 edit. *.googlesyndication.com moved script-src -> img-src. The string is
  // still in the header, so the old `csp.includes(src)` check passed; this one must not. ---
  const moved = shipped
    .replace("script-src 'self' *.googlesyndication.com", "script-src 'self'")
    .replace("img-src 'self' data:", "img-src 'self' data: *.googlesyndication.com");
  assert.ok(moved.includes('*.googlesyndication.com'), 'calibration precondition: the moved domain is still somewhere in the header, so a substring check would pass');
  const movedViolations = findMisplacedPairs(moved);
  assert.equal(movedViolations.length, 1, 'moving one domain to the wrong directive must be flagged exactly once');
  assert.equal(movedViolations[0].directive, 'script-src');
  assert.equal(movedViolations[0].source, '*.googlesyndication.com');
  assert.deepEqual(movedViolations[0].foundIn, ['frame-src', 'img-src', 'connect-src'], 'the report must name where the domain actually went');
  console.log(`PASS known-bad (the gh#47 edit): ${movedViolations[0].source} missing from ${movedViolations[0].directive}, found in ${movedViolations[0].foundIn.join(', ')} — flagged while a substring check stays green`);

  // --- known-bad: an outright deletion, and a whole directive dropped. ---
  const deleted = shipped.replace(' *.googleadservices.com', '');
  const deletedViolations = findMisplacedPairs(deleted);
  assert.equal(deletedViolations.length, 1, 'deleting a source must be flagged exactly once');
  assert.deepEqual(deletedViolations[0].foundIn, [], 'a deleted source must report that it is nowhere in the header');
  const noScriptSrc = shipped.replace(/script-src[^;]*;/, '');
  assert.equal(findMisplacedPairs(noScriptSrc).length, 6, 'dropping script-src entirely must flag all six of its recorded sources');
  console.log('PASS known-bad: a deleted source is flagged with foundIn=[], and dropping script-src flags all 6 of its pairs');

  // --- ceiling 2 pinned: additions never go red. A new Google domain, a new directive, and
  // 'unsafe-inline' added to script-src all pass. Widen this gate into an exact-set check and this
  // case fails first, forcing the header ceiling to be rewritten instead of silently drifting. ---
  const widened = shipped
    .replace("script-src 'self'", "script-src 'self' 'unsafe-inline' *.some-new-google-thing.com")
    .concat("; worker-src 'self'");
  assert.deepEqual(findMisplacedPairs(widened), [], "ceiling 2: additions (a new domain, a new directive, even 'unsafe-inline' on script-src) must stay green — this gate is a subset check, not an exact-set check");
  console.log("PASS ceiling 2 pinned: a new domain, a new directive and 'unsafe-inline' on script-src all stay green — this gate cannot see what Google adds next");

  // --- ceiling 3 pinned: default-src fallback is not honoured. ---
  // Remove from script-src FIRST, then add to default-src — the other order makes the removal's
  // first match land in default-src and quietly reconstructs the shipped header.
  const consolidated = shipped
    .replace(' *.googleadservices.com;', ';')
    .replace("default-src 'self'", "default-src 'self' *.googleadservices.com");
  assert.ok(!/script-src[^;]*googleadservices/.test(consolidated), 'ceiling 3 fixture precondition: the source must actually be out of script-src');
  const consolidatedViolations = findMisplacedPairs(consolidated);
  assert.equal(consolidatedViolations.length, 1, 'ceiling 3: a source living only in default-src is still reported missing from script-src');
  assert.deepEqual(consolidatedViolations[0].foundIn, ['default-src'], 'ceiling 3: the report must show it landed in default-src');
  console.log('PASS ceiling 3 pinned: a source consolidated into default-src is still red for script-src (fail-safe, browsers would fall back)');

  // --- the missing-header path, on a temp fixture. Never dist/. ---
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-allowlist-check-'));
  try {
    const noHeader = path.join(tmpDir, 'staticwebapp.config.json');
    fs.writeFileSync(noHeader, JSON.stringify({ globalHeaders: { 'X-Frame-Options': 'DENY' } }), 'utf8');
    assert.equal(readCsp(noHeader), null, 'a config with no Content-Security-Policy must read as null, which the live path treats as a hard fail');
    const withHeader = path.join(tmpDir, 'good.json');
    fs.writeFileSync(withHeader, JSON.stringify({ globalHeaders: { 'Content-Security-Policy': shipped } }), 'utf8');
    assert.equal(readCsp(withHeader), shipped, 'the reader must round-trip a real header');
    console.log('PASS header reader: a config with no Content-Security-Policy reads null (hard fail), a real one round-trips — proven on a temp fixture, never on dist/');

    // --- The CI refusal, both ways, at run level: same argv, only the CI env differs. A subprocess is
    // the only honest seam for an argv+env guard. Both runs are pointed at the temp config; neither can
    // touch dist/ (the CI run exits before any read, the non-CI run checks the fixture). Same rule and
    // same message shape as scripts/csp-inline-check.mjs — one dialect across both CSP gates. ---
    const self = fileURLToPath(import.meta.url);
    const run = (env, args) => {
      try {
        return { status: 0, out: execFileSync(process.execPath, args, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
      } catch (e) {
        return { status: e.status, out: `${e.stdout || ''}${e.stderr || ''}` };
      }
    };
    const notCi = run({ ...process.env, CI: '' }, [self, withHeader]);
    assert.equal(notCi.status, 0, 'known-good: a positional config path is allowed when CI is unset');
    assert.ok(notCi.out.includes(`${withHeader} — all`), 'known-good: the printed green must name the narrowed path it actually read');
    const underCi = run({ ...process.env, CI: 'true' }, [self, withHeader]);
    assert.equal(underCi.status, 1, 'known-bad: a positional config path must be REFUSED when CI is set — otherwise a hand-written clean config prints a green that reads like a real dist/ check');
    assert.ok(underCi.out.includes('refusing the positional config'), 'the refusal must say what it refused and why');
    assert.ok(!underCi.out.includes('pairs recorded as of'), 'the refusal must happen before any read, so no green sentence is printed at all');
    console.log('PASS CI refusal calibrated both ways: same argv, CI unset -> exit 0 naming the narrowed config; CI=true -> exit 1, refused before any read and no green printed');

    // --- Entry-point guard, the other direction: merely IMPORTING this module must not run the gate.
    // `node -e` leaves process.argv[1] undefined, which is also the branch that would throw if the
    // guard fed it to pathToFileURL unchecked. The run above is this case's positive control: it
    // proves the same code DOES print a green when it is the entry point, so a green here cannot be
    // the silence of a gate that stopped running. ---
    const asImport = run({ ...process.env, CI: '' }, ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(self).href)})`]);
    assert.equal(asImport.status, 0, 'importing this module must not fail');
    assert.ok(!asImport.out.includes('pairs recorded as of'), 'importing this module must NOT run the gate — move `await main()` back to module scope and this goes red');
    console.log('PASS entry-point guard: importing this module runs no gate and prints no green, while the same file run as argv[1] above does — main() fires only as the entry point');

    // --- SYMLINKED CHECKOUT, the third failure direction of this guard and the only silent one. Node
    // hands `import.meta.url` back canonicalised while argv[1] arrives as written, so comparing one
    // canonical path against one cwd-joined path skips main() when the script is reached through a
    // symlink: exit 0, nothing checked, a local green that means nothing. This case must prove the gate
    // DETECTS through the link (the gh#47 header again), not merely that it exits — drop the realpath on
    // either side and it goes red on exit 0 with empty output. ---
    const linkDir = path.join(tmpDir, 'linked-scripts');
    fs.symlinkSync(path.dirname(self), linkDir, 'dir');
    const badCfg = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(badCfg, JSON.stringify({ globalHeaders: { 'Content-Security-Policy': moved } }), 'utf8');
    const viaLink = run({ ...process.env, CI: '' }, [path.join(linkDir, path.basename(self)), badCfg]);
    assert.equal(viaLink.status, 1, 'through a symlinked path the gate must still RUN and flag the misplaced pair — exit 0 here means main() was skipped and nothing was checked at all');
    assert.match(viaLink.out, /script-src is missing \*\.googlesyndication\.com/, 'the symlinked run must produce the real violation, not just a non-zero exit');
    console.log('PASS symlinked checkout: invoked through a symlinked scripts/ dir the gate still ran and flagged the gh#47 misplaced pair — both sides of the entry-point compare are realpath()d');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true }); // ponytail: hermetic — no selftest path touches dist/ or the working tree
  }
}

function readCsp(file) {
  const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
  return (cfg.globalHeaders && cfg.globalHeaders['Content-Security-Policy']) || null;
}

// ---------------------------------------------------------------------------
async function main() {
  if (process.argv.includes('--selftest')) return selftest();

  const arg = process.argv.slice(2).find((a) => a.endsWith('.json'));
  // A positional config path is a local convenience only. Under CI it is a narrowing surface: pointed
  // at any hand-written clean config this gate prints a green that reads exactly like a real
  // dist/ check (gh#46's claim shape, on the argv axis). Refused rather than disclosed, because the
  // disclosure would be the very line a narrowed run is trying to counterfeit. Same rule, same shape as
  // scripts/csp-inline-check.mjs — the two CSP gates must not differ on argv.
  if (arg && isCi()) {
    console.error(`::error::refusing the positional config '${arg}' because CI is set — this gate must check the deployed artifact, and a narrowed path prints a green indistinguishable from a real dist/staticwebapp.config.json check`);
    process.exit(1);
  }
  const rel = arg || 'dist/staticwebapp.config.json';
  const file = path.isAbsolute(rel) ? rel : path.join(repoRoot, rel);
  if (!fs.existsSync(file)) {
    console.error(`::error::${rel} does not exist — Azure SWA reads config only from inside app_location, so a missing file here means the deployed site ships no CSP at all`);
    process.exit(1);
  }
  const csp = readCsp(file);
  if (!csp) {
    console.error(`::error::${rel} has no Content-Security-Policy in globalHeaders`);
    process.exit(1);
  }
  const violations = findMisplacedPairs(csp);
  if (violations.length) {
    report(violations, rel);
    process.exit(1);
  }

  // gh#66: PAIRS_HASH freshness. Always reads public/staticwebapp.config.json — the source
  // REQUIRED_PAIRS was derived from — regardless of which file `rel` checked above, so a CSP edit
  // is caught even on a run against dist/ that never touches public/ otherwise. A mismatch means
  // ceiling 2 (additions never fail the pairs check above) may have let a real CSP change through
  // unnoticed.
  //
  // ponytail: WARNS, it does not fail. The site owner chose warn over fail on 2026-08-23 so that a
  // CSP edit is not blocked on bumping three constants in the same commit (gh#66). The known cost is
  // that a warning can be scrolled past, which is a quieter version of the fail-green shape gh#66
  // closed — so it is emitted as a `::warning::` workflow annotation, which GitHub surfaces on the
  // run summary and on the changed line rather than only in the log body. Upgrade path if one is
  // ever missed in practice: flip this back to `::error::` + exit 1, or gate the failure to pushes
  // that actually touch the CSP source.
  const sourceRel = 'public/staticwebapp.config.json';
  const sourceFile = path.join(repoRoot, sourceRel);
  if (fs.existsSync(sourceFile)) {
    const sourceCsp = readCsp(sourceFile);
    if (sourceCsp && hashCsp(sourceCsp) !== PAIRS_HASH) {
      console.error(
        `::warning file=${sourceRel}::csp-allowlist-check: ${sourceRel}'s Content-Security-Policy no longer ` +
        `matches PAIRS_HASH — the REQUIRED_PAIRS snapshot (stamped PAIRS_AS_OF = '${PAIRS_AS_OF}') is stale. ` +
        'Re-derive REQUIRED_PAIRS from the live header and bump PAIRS_AS_OF and PAIRS_HASH in this script, in ' +
        'the same commit as the CSP change — CLAUDE.md: the CSP must let AdSense through or ads silently fail ' +
        'to render. This is a warning, not a failure: the build continues and the stale snapshot ships.',
      );
    }
  }

  // The number is the size of the checked set and says so — it is not a claim that the CSP is
  // complete for AdSense (ADR-0019: a green is a claim, and so is the sentence next to it).
  const pairCount = [...REQUIRED_PAIRS.values()].reduce((n, s) => n + s.length, 0);
  console.log(
    `csp-allowlist-check: ${rel} — all ${pairCount} (directive, source) pairs recorded as of ${PAIRS_AS_OF} are present ` +
    'in their governing directive. Does NOT check that the allowlist is sufficient for AdSense (see ponytail header).',
  );
}

// Entry point only. Importing this module (a unit test against parseCsp / findMisplacedPairs) must not
// fire a full gate as a side effect. BOTH sides are realpath()d before comparing: Node hands
// `import.meta.url` back canonicalised while argv[1] arrives exactly as written, so comparing one
// canonical path against one cwd-joined path skips main() entirely when this file is reached through a
// symlinked checkout — exit 0, nothing checked, a green that means nothing.
// pathToFileURL, not a raw string compare: percent-encoding makes path equality wrong for any path with
// a space or a `#`.
// ⚠ Every failure direction here must be "run the gate", never "skip it silently". Only a missing
// argv[1] (`node -e`, i.e. an import) skips; a realpath that throws on an argv[1] that does exist runs
// main() anyway. Pinned both ways by the entry-point and symlinked-checkout selftest cases above.
const isEntryPoint = () => {
  if (!process.argv[1]) return false;
  const canonical = (p) => pathToFileURL(fs.realpathSync(p)).href;
  try {
    return canonical(process.argv[1]) === canonical(fileURLToPath(import.meta.url));
  } catch {
    return true; // ponytail: realpath failed on a path that exists as a string — fail toward running the gate
  }
};
if (isEntryPoint()) await main();
