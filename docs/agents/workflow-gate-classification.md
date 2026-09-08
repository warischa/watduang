# How run-workflow-gates.sh classifies a step

Split out of `docs/agents/ci-verification.md` 2026-09-08 at an ADR-0012 task seam (owner ruling).
That file keeps the exit-code meaning, because reading a verdict is the common task; this file is
the rarer one -- auditing WHY a step landed in the class it did, or debugging a NORUN. The seam was
tested the way ADR-0012 tests one: `NORUN`, `DENY`, `REQUIRE`, `GITHUB_OUTPUT` and `not-runnable` all
have ZERO occurrences in what stayed behind. `CLASSIFY_ONLY`, `EXPENSIVE`, `98` and `96` each keep one
hit there -- the exit-code paragraph -- which is the connective, not a shared task.

**What a local green does and does not prove.** It proves every step classified runnable ran and
passed, in the workflow's own order, single-line and `run: |` block alike. It proves nothing about
the not-runnable set, which the script names each run with the marker that caught it. Three rules can
catch a step, and they are checked in this order: a DENY (see below), then a body holding `${{`, then
a body writing `$GITHUB_OUTPUT`. Today that is `Decide whether the browser probes can add anything`,
caught by `${{`, and `Fetch SWA deployment token`, caught by `[DENY cloud CLI: az]` — plus the
`npm ci` deliberate skip. For those, read the run's per-step conclusions below — never this script's
exit code.

**What the `$GITHUB_OUTPUT` half of that rule catches today: nothing.** Both current NORUN steps are
caught by an earlier rule. `Fetch SWA deployment token` is caught by DENY — its body runs
`az staticwebapp secrets list` against the production resource group, emits `::add-mask::`, and
carries credential-shaped text. It does also write `$GITHUB_OUTPUT`, so it would be caught twice
over, but DENY is what the banner prints. `Decide whether the browser probes can add anything` is
caught by `${{`. So `$GITHUB_OUTPUT` is a backstop with no instance today, and the SWA token step is
not evidence that this half of the rule is load-bearing — DENY is what protects that step.

**Two guards this repo owns, checked before every marker rule.** `${{` and `$GITHUB_OUTPUT` are
GitHub's vocabulary, so the set they enumerate is not one this repo controls and an ordinary
workflow edit moves a step across the boundary in either direction. Both directions were
demonstrated on doctored copies of `ci.yml`. **Rationale, the demonstrations, and the rejected
alternative live in ADR-0056 — read it there, it is not restated here.** Operationally:

- **DENY wins over every other rule.** A run body invoking a cloud CLI at a command position
  (`az`, `aws`, `gcloud`, `kubectl` and siblings), emitting `::add-mask::`, or carrying
  credential-shaped text is `NORUN` whatever its markers say. The banner prints the rule that caught
  it, e.g. `[DENY cloud CLI: az]`. Deliberately over-broad: a false deny costs one locally-skipped
  gate, printed with its reason; a false allow runs a production credential fetch on a laptop.
- **REQUIRE aborts rather than discloses.** A body line starting `node --test` or `npm test` must
  land in a runnable class, and at least one such step must exist. Otherwise the script prints
  `ABORT: the workflow moved the unit tests out of local reach` and **exits 96** — before the
  banner, before `CLASSIFY_ONLY` can exit 0. A banner disclosure is what let a reader trust
  `TOTAL=30 FAILS=0`, so this is not a footnote.

Both are re-derived from the workflow text every run — no pinned name, index or title, because a
pinned list is what rotted the original extractor. They bound the damage; they do not prove the
partition complete (ADR-0056 § What this does not prove).

**Why unexecuted steps count as failures.** gh#171: the extractor read single-line `run:` commands
only, so all five `run: |` blocks — `Unit tests` among them — sat outside the work-set, and it
printed `TOTAL=30 FAILS=0` on a red tree. A runnable step that did not run is now arithmetic in the
exit code, and the summary ends in a verdict stating its own scope rather than a bare `FAILS=0`.
