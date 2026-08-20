# Four-leg calibration of the site-owner wizard's arm-check

`scripts/site-owner-wizard.sh` §2 prints the verdict the site owner uses to decide whether the
deploy is armed. Arming is irreversible in effect: once all three `AZURE_*` secrets exist, every
push to `main` is a production deploy, and so is *Re-run all jobs* on an older main run. This
print is the owner's only signal, and it is the one load-bearing check in the repo that CI never
runs — so nothing re-proves it. That is why the calibration is committed here rather than left in
a session scratchpad.

No issue number yet: this directory is named for the artifact, following the precedent of
`evidence/adslot/`. Move it under the issue number once one is filed.

## The defect

The check used to read:

```sh
if command -v gh >/dev/null 2>&1; then
  found=0
  for n in AZURE_CLIENT_ID AZURE_TENANT_ID AZURE_SUBSCRIPTION_ID; do
    if gh secret list --repo warischa/watduang 2>/dev/null | awk '{print $1}' | grep -qx "$n"; then
      ...found+1
    else
      echo "  MISSING: $n"
    fi
  done
```

`command -v gh` succeeds whenever the binary exists, so a **failing** `gh` — expired auth, offline,
rate-limited — still enters this branch. Its stderr is discarded by `2>/dev/null`, its stdout is
empty, every name reports `MISSING`, and the script prints `NOT ARMED`.

The root cause is that **`grep -qx` exiting 1 is indistinguishable from `gh` exiting 1**, and no
exit status is ever inspected. `set -o pipefail` is in effect (`:25`) and does not help: a legitimately
absent secret must also make the pipeline non-zero, so the two cases are the same signal by
construction.

Direction of error: **unsafe.** The comment immediately above the check claimed it "errs toward
'treat a push as a deploy', which is the safe direction to be wrong in." That was true of the
`total_count` hint it was written about, and false of this failure mode — this one says *not armed*
about a repo that may be armed.

Concrete harm: the owner arms the deploy, later re-runs the wizard to confirm, `gh`'s token has
expired, the wizard says `NOT ARMED`, and the owner pushes believing it is safe. That push deploys.

## The fix

Capture the listing once, branch on `gh`'s own exit status, and emit a distinct third verdict when
the answer is unknown. The unknown case now tells the owner to **assume armed** — the cautious
direction:

```sh
if ! command -v gh >/dev/null 2>&1; then          # leg 1: no gh at all
elif ! listing=$(gh secret list ... 2>&1); then   # leg 2: gh present but broken
else                                              # legs 3 and 4: real count
```

## Calibration — four states, four distinct outputs

A check with two verdicts covering three realities cannot be honest. Each leg below was driven
through the real `scripts/site-owner-wizard.sh`, not a re-implementation of its logic.

| Leg | Condition | How it was produced | Output |
|---|---|---|---|
| 1 | `gh` binary absent | `PATH=/usr/bin:/bin` | web-instructions branch (unchanged by the fix) |
| 2 | `gh` present, exits 1 | stub `gh` on `PATH` printing to stderr, `exit 1` | `CANNOT TELL -- gh could not read the secret list. This is NOT the same as "not armed":` + the real error + `treat main as ARMED` |
| 3 | real `gh`, real unarmed repo | no stub — the live repository | `0 of 3 present` / `NOT ARMED -- CI will skip the deploy steps` |
| 4 | `gh` reports all three | stub `gh` printing the three exact names | `3 of 3 present` / `ARMED -- ... and so is Re-run all jobs on an OLDER main run` |

Leg 3 is the **negative control** and it was free: the repository genuinely had zero secrets and
zero variables at the time of the run, with all three names returning 404 individually. A fix that
had broken the ordinary path would have shown up here as a changed verdict. It did not.

Leg 2 is the leg that failed before the fix. Its pre-fix behaviour was reproduced first — the same
stub against the unfixed script printed `0 of 3 present` / `NOT ARMED` — so this is a
demonstrated repair, not an assumed one.

No secret or variable was created, modified, or deleted to produce any leg. Legs 2 and 4 used a
stub `gh` earlier on `PATH`, removed afterwards.

## What this calibration does NOT cover

- **Secret values.** `ARMED` means "the `if:` gate that runs Deploy will evaluate true", not
  "Deploy will succeed". A typo'd GUID still prints `ARMED` and then fails at `azure/login@v2`.
  That failure is loud, so it is left uncovered deliberately.
- **OIDC trust validity.** The federated credential on the app registration can be deleted
  independently of the secrets; the check cannot see that. Also fails loud.
- **`--check` mode.** `maybe_verify` returns early when `CHECK_MODE=1` (`:80-82`), so
  `site-owner-wizard.sh --check` prints no arm verdict at all. That is existing intended
  behaviour, not covered here, but worth knowing if a DoD box ever cites `--check` output.
- **A stale-but-successful `gh`.** If `gh` exits 0 while returning a cached or partial list, all
  four legs above are blind to it. Bounding that would mean enumerating `gh`'s caching behaviour,
  a set owned by the GitHub CLI rather than by this repo.

## Harness note

The first calibration attempt returned four empty legs and looked like a total failure. The cause
was the harness, not the script: **macOS has no `timeout`**, so the wrapper command failed and the
wizard never ran. Worth recording because the same mistake inside a grep-for-absence check would
have read as a clean pass instead of an obvious blank.
