# Driver playbook — per-milestone verify commands

Split out of `DRIVER-PLAYBOOK.md` on 2026-09-13: that file is routed into an agent's context on
demand and has a 12KB ceiling, and this section is the one that grows every session. Commands
proven on this machine, newest sections appended. The playbook itself keeps the durable technique;
this file keeps the per-milestone invocations.

## Per-milestone verify commands proven this session

**gh#181 clean-screen desktop readings for `dice-loser` / `timebomb`:**

```bash
CDP_PORT=9333 BASE=http://localhost:4173 LOADS=6 \
  node scripts/driver.mjs docs/verification/evidence/181-clean-screen/clean-screen-probe.mjs
```

Evidence and full method: `docs/verification/evidence/181-clean-screen/README.md`.

**gh#182 320x568 fold position for `pinocchio-luck` / `short-stick` / `how-close-is-near` /
`zero-trigger`:**

```bash
CDP_PORT=9333 BASE=http://localhost:4173 LOADS=6 \
  node scripts/driver.mjs docs/verification/evidence/182-320-fold-4routes/fold-probe-4routes.mjs \
  > docs/verification/evidence/182-320-fold-4routes/fold-probe-4routes.json
```

Evidence and full method: `docs/verification/evidence/182-320-fold-4routes/README.md`. Run this one
`run_in_background: true` — it took longer than 120s in practice.

**Re-checking the gh#182 fold table at a later HEAD (2026-09-13):** `docs/verification/evidence/
182-320-fold-fix/fold-probe-fix.mjs` supersedes `182-320-fold-4routes/fold-probe-4routes.mjs` — it
covers the SAME four routes plus `wire-snip-panic` in one script (5 of 6 routes; `freeze-tap` stays
on the original `182-320-fold/fold-probe.mjs`, `WSP_LOADS=0` skips wire-snip-panic there so it isn't
double-measured), and adds per-element `setReadings` for the two routes with N equivalent controls
(`.straw-btn`, `.answer`) plus `bottomPastFold`. Both scripts accept an `ONLY=<route>` filter
(`fold-probe-fix.mjs` only) for a narrow re-run. Before trusting a "no change since the last
recorded table" read, check both directions with git log against `src/play/<route>/` AND
`src/games/<route>.ts` (a manifest/copy commit can match a path filter without touching layout —
confirmed harmless once by reading the diff, not assumed from the log line alone).

**Red-calibrating a fold-position probe cheaply:** copy the probe to scratch, `sed` only the `VP`
height constant down (e.g. 568 -> 400), `diff` against the original to confirm the one-line change,
run with `LOADS=1 ONLY=<a route with no vh-based CSS tier>`. `visiblePx` should drop to 0 and
`topPastFold` should flip positive — that's the instrument going red on a real input, distinct from
(and cheaper than) the script's own built-in 2000px-block calibration step. Do this before trusting
any green from a copied-forward probe.

**gh#182 wire-snip-panic overflow enumeration (2026-09-13):** neither `fold-probe-fix.mjs` nor
`scripts/play-screen-fit-probe.mjs` enumerates every element that overflows a container — the
committed probes only report the single worst box (`clipFrom`/`tallestBoxes`). A new small probe was
written for that: `docs/verification/evidence/182-wsp-overflow-2026-09-13/wsp-overflow-probe.mjs`
walks `#screen-game`'s descendants and keeps every one whose `getBoundingClientRect().bottom` exceeds
`containerRect.top + container.clientHeight`. Toggling `overflow:hidden` -> `visible` at runtime via
an injected `<style>` (never edit the source file to test this) is **not a clean A/B on this route** —
forcing `overflow:visible` also grew `#screen-game`'s own `clientHeight` (393px -> 492px, matching
`scrollHeight` exactly), consistent with the flex "automatic minimum size" spec rule (overflow other
than `visible` resolves a flex item's auto min-size to 0; `visible` lets it grow to content). So
"does `overflow:hidden` change `scrollHeight`" needs the caveat that the container's own box also
changed size in the comparison, not just the clipping.

**Two `driver.mjs` invocations against one Chrome, run concurrently on purpose:** `driver.mjs` opens
a fresh tab per run via `PUT /json/new` (grep the script itself) — it does not attach to an existing
tab. Two probes against different routes/output paths can safely share one Chrome + CDP port; this is
different from the two-AGENTS-two-Chromes collision the runbook warns about (that trap is about two
*sessions* each launching their OWN Chrome on the SAME port, not two scripts sharing one Chrome you
control).
