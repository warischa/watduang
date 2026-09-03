# gh#182 — dev-machine re-check that licensed three FITS_ROWS promotions

Recorded 2026-09-03 on the dev Mac, in a clean worktree cut from `167a5f7`, against a real `dist/`
served on port 4592 with headless Chrome on CDP 9592 (the fit probe's own port pair, distinct from
`ci-probes.sh`'s).

**This file exists because the run logs do not survive.** They were written to
`docs/verification/182-dev-recheck/*.log`, and `.gitignore:8` ignores `*.log`. The project's own
rule is that for a CDP probe **the pixel counts are the artifact** — a screenshot regenerates, a
number does not. So the numbers are transcribed here, in a committed file, and the logs are not
evidence once the worktree is gone.

## Why a dev-machine run was needed at all

The promotion contract is stated verbatim inside `scripts/play-screen-fit-probe.mjs`, in the
`::warning::` that rule (iii) emits for a row measuring zero:

> — if that holds on both the CI runner and a dev machine, move the row to `FITS_ROWS`; an exception
> nobody deletes is a licence to regress.

and the recording protocol in the header comment above `KNOWN_OVERFLOW` records both sets from
*"three consecutive full runs against a real `dist/`"*. CI run `33740125366` supplied the runner half (three `::warning::` lines, one per
row, each reading `this run measured 0px`). The dev half did not exist in the repo — only pre-fix
baselines of 73 / 81 / 119px. A first attempt to promote from the CI half alone was correctly
refused for exactly this reason.

## The three promoted rows — three consecutive dev runs

| row | run 1 | run 2 | run 3 | CI `33740125366` | recorded value being retired |
|---|---|---|---|---|---|
| `short-stick 390x844` | 0px | 0px | 0px | 0px | `gh#182 open: 73px on press 0` |
| `short-stick 1440x900` | 0px | 0px | 0px | 0px | `gh#182 open: 81px on press 0` |
| `timebomb 320x568` | 0px | 0px | 0px | 0px | `gh#182 open: 119px on press 2` |

Both machines, four runs total, zero disagreement. All three moved to `FITS_ROWS` and deleted from
`KNOWN_OVERFLOW`.

## Calibration — the pin was proven able to go red

A promotion whose regression cannot fire is the failure this rule exists to prevent, so the red leg
used a row that genuinely overflows. `short-stick 320x568` was temporarily promoted into
`FITS_ROWS`, and the run exited 1 with:

> `::error::/game/short-stick/play/ at 320x568 no longer fits: 156px to scroll and 0px clipped away
> on a play screen (press 0).`

Reverting to the correct three-row promotion returned exit 0 with every row classified. Red first,
then green, on the real instrument.

## A stale pin this run exposed, deliberately left alone

`short-stick 320x568` measured **156px** on all three dev runs (`scrolls YES`, `width-fill 89.6%`,
worst at press 0). Its `KNOWN_OVERFLOW` pin still reads **191px** — a 35px gap, well outside
`OVERFLOW_TOLERANCE_PX` (8).

The probe does not red on this, and correctly so: rule (iii) triggers only at **zero** overflow, and
reading *less* than the pin is the improving direction.

⚠ **Do not read the baseline as licensing this gap.** `docs/verification/evidence/182-baseline/README.md`
records exactly this row as `156px | 191px | -35 | drift >8px, not pre-documented as a band` — it
flags the spread as undocumented drift, it does not bless it as run-to-run variance. (For contrast,
the same table *does* document `pinocchio-luck 320x568` as "inside the documented 107-136px band,
15-run history, NOT new drift". This row has no such band.) `280790a` shipped a real `short-stick`
height fix, so a genuine page change is the likelier explanation than noise.

**Consequence, and its real size.** The stale-pin check fires only when a row exceeds
`recorded + OVERFLOW_TOLERANCE_PX`. With the pin at 191 and a tolerance of 8, this row can grow from
its measured 156px all the way to 199px before anything fires — **43px of headroom instead of 8.**
Bounded, though: that check emits `console.warn`, not `console.error`, so what the headroom
suppresses is a *warning*, not a gate. Nothing goes red either way.

**Why the pin was still not re-recorded downward.** One reason only, and it is the standing rule: a
downward re-record needs one CI run to agree, and no CI reading for this row at 156px is in hand.

⚠ An earlier draft of this file gave a second reason — that the CI runner reads 4–28% wider than
this Mac, so 156 here is not evidence of 156 there. **That reasoning is wrong and is retracted.**
The 191 pin was itself recorded on *this* Mac, in `3c7cd4f` on 2026-09-02; cross-machine width
cannot explain a shift between two readings from the same machine. The likelier explanation is the
one this file already gives: `280790a` shipped a real `short-stick` height fix between the two
readings. Caught by adversarial review, round 2.

## Rows deliberately not touched

- `short-stick 320x568` — 156px, not 0. Stays in `KNOWN_OVERFLOW`; closes with gh#182.
- `zero-trigger 320x568` — 131px, and its own row text says promotion is not owed there.
- `cursed-number 320x568` — carries an owner ruling and is never moved by an agent.
