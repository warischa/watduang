# Calibrating a new gate at run level

Split out of `docs/agents/ci-verification.md` at a further ADR-0012 task seam: proving a **brand-new**
gate actually fires on `main` is read only when someone is standing up that gate, not on every routine
verify-locally or read-a-verdict pass — a different task, at a different moment, than the rest of that
file.

A run-level `conclusion` cannot tell a passing step from a silently no-oping one on its own. **This
section's premise was wrong** — see `docs/agents/ci-verification.md` § "Reading CI's verdict on this repo";
`/actions/runs/<id>/jobs` does not 404, and per-step conclusions are readable directly. Prefer
reading the specific step's conclusion from the jobs endpoint over the run-level trick below when it
matters which step went red; the run-level one-variable diff still earns its keep for proving the yaml
runs and blocks at all, on a throwaway branch:

1. `on: push` in `ci.yml` carries **no branch filter**, so any branch produces a real run. `main` never
   has to go red.
2. Push two commits whose trees are byte-identical except the deliberate break. Prove it — `git diff`
   between the two trees, excluding the break, must be empty. More than one variable and the result
   isolates nothing.
3. The break must be **type-only and runtime-inert** (a wrong annotation, never a broken call or import
   path), so that if the gate turns out to be dead, the green commit deploys something harmless.
4. Read both conclusions from the workflow-scoped runs endpoint above, then delete the branch local and
   remote.
5. **Build the second leg by editing the file back, never by `git revert` into `git commit --amend`.**
   A revert that produces no commit leaves `--amend` pointing at the FIRST leg, which it then rewrites
   in place: the result is a commit whose message says one thing and whose tree is the other leg,
   parented at the branch point. On 2026-08-24 only the non-fast-forward push rejection caught this,
   and `--force` would have destroyed the first leg's run. Before pushing leg two, assert the shape:
   `git log --oneline -2` shows leg two parented on leg one, and the file carrying the variable diffs
   against the base as the label claims — empty for a restore leg, non-empty for a break leg.
6. **When both legs exit 0 by design, the conclusion is not the measurement.** A calibration whose
   signal is an annotation rather than a status has no red to look at, so a mislabelled leg reads as a
   confirmation. Read annotations from the check-runs annotations endpoint, not the run summary, and
   name in the evidence which leg each run proved.

Red on the broken head and green on the restored head proves the yaml actually runs and actually blocks
— which local calibration cannot, because a `|| true`, a bad indent, or a devDependency that never
reaches CI all pass locally. The run-level conclusion alone does **not** prove which step went red —
read the jobs endpoint (see `docs/agents/ci-verification.md` § "Reading CI's verdict on this repo") for
that. Record which of the two you actually checked in the evidence rather than letting a run-level green
imply more than it earned.

Worked example: the `astro check` gate from gh#38, evidence
`docs/verification/evidence/38/06-box3-calibration.json`.

Second worked example — `validate-games`, 2026-08-20, run `32342190249`. It had been wired into
`ci.yml` the day before with 21 known-bad fixtures behind `--selftest`, so its step had never been
observed doing anything but pass. One commit on a throwaway branch disabled the `ads` rule, and the
jobs endpoint returned exactly what a live gate should: `Validate games` **failure**, every step before
it success, every step after it skipped by fail-fast — and `Deploy to Azure Static Web Apps` **skipped**,
which is also the run-level proof that the deploy gate holds on a non-`main` branch. Branch deleted
unmerged; `main` never contained the break.

Two honest deviations from the recipe above, both worth copying:

- **One commit, not two.** The green leg was already on record — `main` was green at `f18514e` with this
  step wired — so pushing a restored head would have re-proven a known fact. Read the step conclusion
  from the jobs endpoint instead, per `docs/agents/ci-verification.md` § "Reading CI's verdict on this repo".
- **The break was not type-only.** Point 3 asks for a wrong annotation; this disabled a rule
  (`if (false && …)`) in a gate script. That is still runtime-inert *for the site*: the script is
  build-tooling that never reaches `dist/`, and the plain run still exited 0, so the only thing capable
  of going red was the intended `--selftest`. Confirm both exit codes locally before pushing — plain 0,
  selftest non-zero — or you have not isolated one variable.

Third worked example — `play-crawl-link-check`, 2026-09-11, break run `34562916043` against a green
`main` at `eca92a8`. The gate had been wired that same day, so its step had never been observed doing
anything but pass — the `validate-games` situation exactly. One commit on a throwaway branch removed
the single anchor line from `src/shell/PlayExit.astro` (`git diff --numstat` read `0 1`, one file).
The jobs endpoint returned the shape a live gate should: **`play pages carry the one crawlable link
(dist artifact)` failure** and the only one, every step before it success — including the sibling
`crawl-check GameNav`, which proves the break was scoped — every step after it skipped by fail-fast,
and `Deploy to Azure Static Web Apps` **skipped**, which is again the run-level proof that the deploy
gate holds off a non-`main` branch. Branch deleted unmerged, local and remote; `main` never contained
the break.

**A fourth deviation, and this one is a trap rather than a shortcut: do not push two legs to the same
branch.** `ci.yml`'s `concurrency` block sets `cancel-in-progress` for any ref that is not `main`
(search for `cancel-in-progress`; it sits under the workflow's `concurrency` key). A restore leg
pushed to the same branch therefore **cancels the break leg's run and
destroys the verdict you spent the push to get** — the failure would read as "cancelled", not as the
gate blocking. Use the one-commit form above whenever `main` is already green with the step wired,
which is the normal case for a gate you have just added. If you genuinely need two legs, they need
two branches.

Also worth copying from that run: the deploy condition was read out of `ci.yml` **before** pushing,
not assumed from the doc. A break that can reach production is a different kind of mistake from a
break that cannot, and the check costs one grep. Read the whole condition — it is three terms, not
one: `github.event_name == 'push'` **and** `github.ref == 'refs/heads/main'` **and**
`env.HAS_DEPLOY_IDENTITY == 'true'`. Quoting only the `github.ref` term, as the first draft of this
section did, would have let a reader conclude that a `pull_request` event on a main-named ref
deploys. Find it by searching for the deploy step's name rather than by line number; the three steps
that carry this condition move whenever the workflow grows.

## A pixel the fit probe records is one machine's number

Moved from `docs/agents/ci-verification.md` (a further ADR-0012 task seam) — this is a dated
gate-calibration post-mortem, read when standing up or re-checking the fit-probe gate, not on every
routine verify.

`scripts/play-screen-fit-probe.mjs` records overflow px per route x viewport. On 2026-09-02 the CI
runner measured every non-zero row 4-28% above this Mac's numbers on the same commit (power-meter
76 -> 268 clipped) and read 0px on three rows the Mac records at 2-17px — the workflow installs no
font, so Thai text wraps under a fallback face (inferred). Zero held on both machines.

**Do:** gate only what both machines agree on — a row is classified, no key is stale, a `FITS_ROWS`
row stays within `OVERFLOW_TOLERANCE_PX` of zero. Growth or a 0px reading on a `KNOWN_OVERFLOW` row
prints a `::warning::`, which `scripts/ci-probes.sh` surfaces on a green leg. Before pinning any
new measured number, download the last `browser-probe-output-*` artifact and `diff` its rows
against a local run first — two text files, no new run.

**Don't:** widen `OVERFLOW_TOLERANCE_PX` to cover a machine difference; it hides the same regression
on both. The converging fix is a self-hosted Thai webfont on play routes (owner decision).

**Cheaper proof:** the probe's set checks (union = manifest x viewports, no stale key, reason prefix)
are pure functions of two files — prove them with `node --test`, never with a browser walk; re-measure
only when src or the measurement code changed.

## The probe's own dispatch latency sits inside the number it gates (2026-09-09, gh#122)

Moved from `docs/agents/ci-verification.md` (a further ADR-0012 task seam) — this is a dated
gate-calibration post-mortem, read when calibrating the `play-exit` probe's timing, not on every
routine verify.

**A working route can read UNMEASURED because the runner is slow, and it reproduces.** CI's runner has
2 vCPU and runs five Chrome instances plus `serve` at once. The `play-exit` probe drives a burst that
must land inside the arm window; on that hardware the burst arrived **704 ms** after being driven at
**80 ms**. By then the exit control had legitimately armed and enabled, so the out-of-window burst hit
it, navigated to the site root, and destroyed the JS context holding the probe's own signal variables.
The post-burst read came back null, which the probe reports as "the trigger left the screen unchanged"
— when the screen had in fact already changed.

**Two traps in reading that.** First, the message names the route, so it reads like a route defect;
the discriminating evidence is in the run artifact's timeline, via `gh run download`, where the
disabled flags before and after the burst show the transition did happen. Second, an identical second
failure does **not** refute a slow-harness explanation — a reliably under-resourced runner fails the
same way every time, so "it failed twice identically" is what this cause predicts, not evidence
against it. Before blaming a route, reproduce under the lane's literal flags and check whether the
burst landed in the window at all.
