# ADR-0045 latent gaps — disposition record

Split out of `docs/adr/0045-a-gate-is-audited-against-what-executes-not-what-is-declared.md` at an
ADR-0012 task seam: the per-gap red-then-green evidence below is read when someone is working a gap or
auditing whether one really closed, not on every routine read of the decision itself. The ADR keeps the
decision, its honest bounds, and a one-line outcome per gap; the reproduction detail lives here.

Moving it also took that ADR back under the 12288B doc ceiling it crossed on 2026-08-27.

## Latent gaps — disposition (2026-08-27)

1. **FIXED.** `workflowSteps()` (`scripts/gate-selftest-coverage-check.mjs`) now reads every sibling
   key of a `run:` step and closes over `SAFE_STEP_SIBLING_KEYS` (`name`, `id`, `env`, `shell`,
   `working-directory`) — the provably-safe few, negated, per this ADR's own Decision. Any other
   sibling key (`if:`, `continue-on-error:`, or one GitHub adds later) makes `computeReach()` route
   the step into `workflowGated` instead of `workflowDirect`/`workflowEntryNames`, and `auditRule2()`
   reports it by name. Calibrated both ways in the script's own `--selftest`: a step behind `if:` or
   `continue-on-error:` reds rule 2 by name, clears once the key is removed, and the real
   `.github/workflows/ci.yml` stays green (0 of 18 gate steps affected — confirmed by direct run: the
   only guarded `run:` step found is the deploy-token fetch, which is not a gate).

   **Disclosed bound — the inversion holds at STEP scope only.** `workflowSteps()` flushes on dedent
   and never records keys above step indent, so a guard placed *higher* than the step is invisible to
   it: a job-level `if:` or `needs:`, a `strategy.matrix` that yields no combination, or a
   workflow-level `paths:` filter all leave every gate step inside reading as unconditionally
   reachable, and rule 2 stays green while coverage is gone. Latent today and only today, because
   `.github/workflows/ci.yml` has a single `build` job with no job-level guard — the moment the
   workflow is split into two jobs, this bound becomes live. So the claim "fails closed on keys
   GitHub adds later" is true of step siblings and false of anything above them; extending the
   inversion upward is the fix, and it is not done here.
2. **FIXED.** `globGateCheckFiles()` + `auditGateInventory()` glob every `scripts/*.mjs` file whose
   name contains "check" (verified against the real tree, not just the `*-check.mjs` suffix case: it
   also has to cover the prefix shape `check-citations.mjs` and the mid-name shape
   `crawl-check-gamenav.mjs` — a suffix-only glob false-flagged the latter as a stale RULE3 exemption
   the first time this ran, which is exactly the false-positive gap 2's own fix had to avoid). A gate
   matching that glob but absent from both executors' union and unexempted is reported missing; an
   exemption key no longer matching a real file on disk is reported stale. Calibrated both ways in
   `--selftest`.
3. **FIXED.** `unauditableCommands()`'s wrapper regex now matches the artifact
   (`scripts/[\w.-]+\.(?:sh|bash)`) anywhere in the command, not an invoker prefix. Verified
   `./scripts/foo.sh`, a bare exec-bit `scripts/foo.sh`, `source scripts/foo.sh`, and
   `bash -c "scripts/foo.sh"` all now match, where the old `\b(?:bash|sh|zsh)\s+` prefix missed every
   one of them.
4. **FIXED.** `reachableEntryNames()`'s lookahead is now `(?![\w:-])`. Verified `npm run check:all`
   no longer falsely satisfies an entry named `check`, while `npm run check` (whole token) still
   does.
5. **ACCEPTED as a disclosed ceiling — the quote case does not reproduce, the BRACE case does.** No code/string/comment
   classifier exists anywhere in `gate-selftest-coverage-check.mjs`: `hasSelftestFlag` and
   `countVerificationStatements` are unconditional regex counts over raw source text, and
   `extractSelftestBody` is brace-matching from an anchored declaration — none of the three track
   whether a character sits inside a string, comment, or regex literal. Constructed the exact case
   this gap describes (a `selftest()` body containing `const re = /it's a test/;`, a regex literal
   with a quote inside) and ran it through `extractSelftestBody` + `countVerificationStatements`
   directly: the body extracted correctly and the count matched the same known-good shape
   `goodSelftestSrc()` already uses elsewhere in this file's own `--selftest`, with the regex literal
   having no effect on either.

   **But the quote case was the wrong probe, and an adversarial pass falsified the acceptance as
   originally written.** The breakable mechanism is not quotes, which `extractSelftestBody` never
   tracks and never needs to — it is **braces inside string literals**, which it does track and
   mis-counts. Reproduced directly, twice (once by the reviewer, once independently): a gutted
   `selftest() { console.log('open {'); }` followed by a sibling function containing two `assert`
   calls and a `'close }'` string extracts a body that swallows the sibling, and
   `countVerificationStatements` returns 2 — a **false GREEN**, reporting a selftest as verified on
   assertions belonging to another function. The mirror case, a lone unbalanced `}` inside a string,
   fails closed and merely goes noisily red.

   This stays ACCEPTED rather than fixed because the trigger requires an unbalanced brace inside a
   string literal in the selftest of a gate script in this repo, and no gate has one today. It is
   recorded as a ceiling, not as a non-issue: a gate whose own verification counter can be satisfied
   by a neighbouring function's assertions is precisely the "green that implies coverage it has not
   earned" ADR-0019 forbids, and the honest sentence is that the ceiling exists and is unguarded.

   If a future edit adds a real code/string/comment classifier here (the header's own disclosed
   ceiling — "actually EXECUTING each selftest against a planted mutant" — is the likely trigger),
   this gap becomes live again and should be re-opened against that new code, not against what
   exists now.
