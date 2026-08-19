# gh#44 — run-level calibration of the three ceiling pins

Companion to `prose-separated-scan.md` (the census that decided the fork). This file records that
the selftest cases pinning `check-citations.mjs`'s three disclosed ceilings actually **run in CI and
actually block**, which local runs cannot prove — a `|| true`, a bad indent, or a devDependency that
never reaches CI all pass locally.

Protocol: `docs/agents/ci-verification.md`, section on calibrating a gate when per-step verdicts are
unreadable. Branch `calibrate/gh44-ceiling-pins`, deleted local and remote after the readings.

## The pair — one variable

| head | tree | run id | conclusion |
|---|---|---|---|
| `c281ca1` | the fix | 32210088554 | **success** |
| `86bf4a4` | the fix + one broken line | 32210186617 | **failure** |

The only difference between the two trees, proven by `git diff c281ca1 86bf4a4`:

```
-const headingQuotedRe = new RegExp(`${PATH_ALT}\s*§\s*"([^"]+)"`, 'g');
+const headingQuotedRe = new RegExp(`${PATH_ALT}[^\n§]*§\s*"([^"]+)"`, 'g');
```

One file, one line. Widening the quoted heading regex makes the prose-separated citation planted in
the ceiling-1 fixture visible, so the pin counts 2 findings where it demands exactly 1.

The break is runtime-inert for the site: `check-citations.mjs` is a dev script and never enters
`dist/`, so had the gate turned out to be dead, the green commit would still have deployed something
harmless. `gh api .../actions/secrets` returned `total_count: 0` immediately before each push, so no
run on this branch had a deploy path.

## What this proves, and what it does not

**Proves:** the `Check doc citations` step is wired, reachable, and fails the build. CI invokes
`--selftest` before the live scan, so the ceiling pins are inside the path CI runs, not beside it.

**Does not prove:** which step went red. `/actions/runs/<id>/jobs` 404s on this repo, so per-step
conclusions are unreadable — the run-level `failure` is the whole of the observed signal. The
identification of the failing assertion is a *local* observation, run before the push:

```
AssertionError [ERR_ASSERTION]: ceiling 1: expected exactly one finding
(the planted ordinary dead citation) — the prose-separated one must stay invisible
  actual: 2, expected: 1
```

Run-level red plus that local assertion identity is the strongest claim available here. Recorded as
such rather than letting the red imply a per-step verdict it did not earn (ADR-0019).

## Both widening directions were calibrated, not just one

The ceiling-1 header claims **both** heading regexes require whitespace-only separation. A pin that
only catches one of them would leave that claim able to go false silently, so each was widened by
hand locally and each was confirmed to turn the selftest red:

- `headingUnquotedRe` widened → red (`actual 2, expected 1`)
- `headingQuotedRe` widened → red (`actual 2, expected 1`) — this is the one carried to CI above

Ceilings 2 and 3 assert positive findings and self-prove: a green run reports the exact dead citation
each expects, named in the PASS line.
