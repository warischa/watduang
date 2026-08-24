# ADR-0030 — A fixture must not be sourced from the artifact it tests

Date: 2026-08-24 · Status: accepted · Issues: [#71](https://github.com/warischa/watduang/issues/71), [#72](https://github.com/warischa/watduang/issues/72) · constrains [ADR-0020](0020-a-gate-fix-is-itself-a-new-surface.md)

## Context

gh#72 asked for an obvious tidiness: the CSP allowlist selftest held a `shipped` constant — the site's
real Content-Security-Policy header, retyped by hand — while the real one lives in
`public/staticwebapp.config.json`. One fact, two homes. The hand-copy is free to drift, and when it
does, the selftest keeps passing against a header the site does not serve.

The fix wrote itself: read the header from the config file. It was implemented, it passed, and its
own probe confirmed the test now follows the file rather than a stale constant.

It was wrong twice, and neither failure showed up as a red.

**It reversed a standing owner ruling.** The selftest carries
`assert.equal(hashCsp(shipped), PAIRS_HASH)`. While `shipped` was a hand-copy, that assertion caught
one thing: someone editing the constant without bumping the hash — an authoring error, correctly hard.
Pointed at the live file, the same line becomes a hard failure on **any real CSP edit**. The owner had
ruled on 2026-08-23 that a stale `PAIRS_HASH` must warn rather than fail, over a recorded objection
that a warn is a quieter fail-green. That ruling was reversed by a change that never mentioned it.

**And `&&` made it worse.** CI runs `node scripts/csp-allowlist-check.mjs --selftest && node
scripts/csp-allowlist-check.mjs`. A selftest that reds on a CSP edit does not merely fail the build —
it short-circuits the real scan, so the gate that was supposed to emit the warning never runs. The
mechanism that enforced the ruling and the mechanism that broke it were the same `&&`.

**It also made six fixtures unfailable.** Every known-bad case in that selftest is derived by
string-replace from `shipped`:

    const moved = shipped.replace("script-src 'self' *.googlesyndication.com", "script-src 'self'")

Those anchors are substrings of the header. Once `shipped` is read live, any CSP edit that touches an
anchor makes the `.replace()` a **no-op** — the fixture stops being the gh#47 edit, the detector
finds nothing, and the assertion fails with a message about a completely unrelated thing. Measured:
adding one domain to `script-src` made `moved` fail with `0 !== 1` on "moving one domain to the wrong
directive must be flagged exactly once". Nothing in that failure names the real cause.

## Decision

**A test fixture is a stable known input. It must not be read from the artifact under test, or from
any artifact that is expected to change.**

The pull toward "one fact, one home" is right about production facts and wrong about fixtures. A
fixture and the production artifact are not two homes for one fact — they are two different facts that
happen to look alike:

- The production artifact is what the system serves. It changes when the product changes.
- The fixture is the input a detector is calibrated against. Its value is that it does **not** change,
  because every derived known-bad case is anchored to its exact bytes.

Sourcing the second from the first couples detector calibration to product churn. The specific harms,
in the order they bite:

1. **Severity inversion.** An assertion written to catch an authoring error silently starts catching
   content change, at whatever severity the assertion already had. If a ruling set that severity
   deliberately, the ruling is reversed with no diff mentioning it.
2. **Fixture decay.** Fixtures derived by string surgery on a live value become no-ops when the value
   drifts. They keep running, keep passing where they should be exercising a branch, and fail — if at
   all — with an unrelated message.
3. **Short-circuit loss.** Under `X --selftest && X`, a selftest that reds on content also deletes the
   real scan from that run.

## What this rests on

**The drift risk the change was meant to close is already covered, and covered at the right severity.**
`main()`'s warn block compares the live header against `PAIRS_HASH` on every run and emits a
`::warning file=` annotation. gh#71 calibrated that path end to end — a spawned copy of the script
against a stale temp config emits the annotation, against a fresh one it does not, and both runs exit
0. So the hand-copy drifting from production is detected by the mechanism that owns that comparison,
at the severity the owner chose. The selftest never needed to do it.

**Reverting is not the same as reverting cleanly.** The revert restored the `shipped` literal verbatim
from the previous commit but left the comment block above it in place — four lines describing the live
read as the shipped design, sitting directly on top of the hand-typed constant. That comment is a
loaded gun: it tells the next editor the code is wrong and names the exact change that reintroduces
both harms. It was caught by review, not by any test, because no test reads comments.

## Consequences

- `shipped` in `scripts/csp-allowlist-check.mjs` stays a hand-typed literal, and its header now says
  why, naming both harms — so the next person who spots "one fact, two homes" finds the answer instead
  of re-deriving it.
- gh#72's third DoD box is withdrawn rather than done, with the reason recorded on the ticket.
- This constrains ADR-0020 rather than contradicting it: a gate fix is a new surface, and this is a
  class of gate fix whose new surface is invisible on a green run — the build passes, the fixtures
  pass, and what changed is which failures are reachable.

## What would change this

A fixture with no derived cases and no assertion comparing it to a snapshot — a value used only as
opaque input — carries none of the three harms and may be read live. The moment a `.replace()` or an
`assert.equal` against a committed constant appears, this ADR applies again.
