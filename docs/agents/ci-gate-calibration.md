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
