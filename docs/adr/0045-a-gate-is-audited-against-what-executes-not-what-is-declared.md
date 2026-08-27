# ADR-0045 — A gate is audited against what executes, not what is declared

Date: 2026-08-27 · Status: accepted · Related: [ADR-0018](0018-a-static-tripwire-may-stand-in-for-a-probe-that-never-runs.md), [ADR-0019](0019-a-tripwires-green-must-not-imply-coverage-it-has-not-earned.md), [ADR-0020](0020-a-gate-fix-is-itself-a-new-surface.md), [ADR-0025](0025-a-gate-polices-what-a-commit-adds-not-what-the-tree-contains.md), gh#89

## Context

This repo runs its gates from **two independent lists**, and nothing compared them:

- `package.json`'s `ci` entry chains every gate — this is what a developer runs locally.
- `.github/workflows/ci.yml` declares each gate as its own step — **this is the only one that gates the deploy.** The workflow never invokes `npm run ci`.

They had drifted. Six gates were chained bare in the npm aggregate while the workflow chained their `--selftest` correctly, so a developer running the aggregate locally calibrated none of them. One gate, `party-size-claim-check`, had no `--selftest` at all and sat in neither list.

A gate that never runs its own calibration cannot be distinguished from a working one. Both print a success line and exit 0. This repo has already shipped that defect twice — a detector that always exited 0 and ran nowhere, and a success line that printed an array's length instead of measured coverage.

The first attempt at a fix made the failure mode visible in miniature. A meta-check was added to the npm aggregate and nowhere else, so in real CI it did not run at all, while itself asserting reachability against the aggregate string the executor never reads. It was a guard measuring a non-executed artifact — the same defect it existed to remove, one layer up.

## Decision

**The audited set is the union of both executors, and reachability must hold on both sides.**

`gate-selftest-coverage-check` enumerates gate scripts referenced from `package.json`'s `ci` chain *and* from the workflow's `run:` steps, and reports which side a gate is missing from. Three rules:

1. The script implements a real `--selftest`. **No exemption, ever.**
2. It is reachable from both executors, or is on an allowlist with a justified entry.
3. The command actually executed chains `--selftest` before the real run.

**A calibration may be exempted from *running* where running it would invalidate the artifact under test. The *existence* of the calibration never is.** `crawl-check-gamenav` is the one instance: its `--selftest` plants mutants and rebuilds `dist/`, so chaining it into a post-build step would desync the artifact the later steps check and Deploy uploads. This repo has had that incident once already. Its exemption names what ends it — running that calibration where it cannot touch the deployed artifact, in its own job or a step ordered before Build — at which point the entry is deleted, not widened.

**Allowlists are the provably-safe few, negated.** Every entry carries its reason and its end condition inline. A new gate defaults to guarded.

## Honest bounds, printed rather than implied

- The audit follows `node scripts/*.mjs` invocations only. Shell wrappers hand execution to scripts it does not follow, so it **prints a coverage-gap line naming every one of them on every run** — today `smoke-dist` and `ci-probes`. Silence about an unaudited set reads as clean, which is how this class hides. Following shell does not converge: variables, loops, command substitution and wrapper-in-wrapper each add an unparsed branch that would read as clean.
- Rule 1 counts verification statements in the `selftest()` body. That catches a calibration gutted to nothing; it does not catch a vacuous one, where two trivially-true assertions pass. Closing it means executing each selftest against a planted mutant.

## Consequences

A gate cannot be added to one executor and forgotten in the other without a named violation. A gate cannot ship without a calibration. The unaudited remainder is stated in the CI log every run rather than inferred from silence.

The cost is a hand-written reader for the workflow's `run:` steps, which is new machinery in the path that gates deploy. It fails closed: a missing, unreadable, or barely-parsed workflow exits non-zero. An adversarial pass found its remaining gaps latent rather than live — it does not yet understand `if:` or `continue-on-error:`, so a gate step placed behind either would keep the audit green while losing real coverage. Recorded here because that is one edit away, not hypothetical.

## The fact that would change this

If the workflow ever gains a step that runs `npm run ci`, the two sides collapse into one and the union logic should be simplified rather than maintained.

## Latent gaps in this machinery, recorded rather than fixed

An adversarial pass over the new reader found no live green-lie, and every gap below needs a future
edit to bite. All are spot-fixes. They are recorded here, not in session state, because they are
properties of this decision's implementation and outlive any one session.

1. **The workflow reader is condition-blind.** It matches `run:` with no notion of sibling `if:` or
   `continue-on-error:` keys. Put a gate step behind `if: github.ref == 'refs/heads/main'` and pull
   requests stop running it; add `continue-on-error: true` to quiet a flaky gate and it is toothless —
   rules 2 and 3 stay green either way. Highest blast radius of the five. Today 0 of 18 gate steps are
   affected; the only conditional step in the workflow is the deploy token fetch, which is correct.
   Fix: capture those sibling keys while collecting a step and treat such a step as non-reachable, or
   as a named violation.
2. **A gate deleted from BOTH executors vanishes silently.** The scan unions two reference lists with
   no denominator, so removing a gate's npm entry and its workflow step in one refactor drops it from
   the audit with no signal — and its allowlist entry goes stale unnoticed, because nothing asserts
   that exemption keys are still members of the audited set. Fix: glob the gate scripts on disk and
   require each to appear in the audited set or an allowlist, then assert every allowlist key is in
   the set. That set is repo-owned and countable, so it converges.
3. **The coverage-gap line under-reports.** It matches the interpreter word rather than the script
   path, so `run: ./scripts/foo.sh`, an exec-bit script, `bash -c`, or `source` all escape both the
   audit and the gap line. Today's only wrappers are invoked as `bash scripts/*.sh`, so the printed
   set is currently complete. Fix: match the artifact — a `scripts/*.sh` path anywhere in the command —
   not the invoker.
4. **An entry-name lookahead permits a colon**, so an entry named `check` would match inside
   `npm run check:all`. No colon-named entries exist today. One-character fix.
5. **The code/string/comment classifier mis-reads a regex literal containing a quote**, opening a
   string to end of line and misreading the rest of it. Every case constructed failed toward a false
   RED, which is the safe direction.
