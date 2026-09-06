# gh#184 row 2 — the strip shots CI does not keep

Row 2 asks for one local run that SAVES screenshots, because CI keeps no artifact on a green run.
This records that run. **No image is committed here, on purpose** — see the policy note at the end.

## What the run was

`scripts/strip-chip-visibility-probe.mjs`, driven through `scripts/driver.mjs` (its documented
contract — running the probe file directly is a silent no-op that produces empty output and exits 0),
against a served `dist/` at HEAD `7dbaa32`, on 2026-09-06. It wrote 36 shots: three routes
(`short-stick`, `wire-snip-panic`, `zero-trigger`) across 320x568, 390x844 and 1440x900, each in
normal and swiped-to-end states, on both legs.

Reproduce with the probe's own usage line, adding `SHOT_DIR`:

```
npm run build
npx serve dist -l 4557 &
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --no-sandbox --remote-debugging-port=9557 --user-data-dir=/tmp/strip-prof about:blank &
BASE=http://localhost:4557 CDP_PORT=9557 SHOT_DIR=/tmp/strip-shots \
  node scripts/driver.mjs scripts/strip-chip-visibility-probe.mjs
CONTROL=1 BASE=http://localhost:4557 CDP_PORT=9557 SHOT_DIR=/tmp/strip-shots \
  node scripts/driver.mjs scripts/strip-chip-visibility-probe.mjs
```

## The numbers, and they match the record

| leg | checked | bad | nakedCutCount per combo |
|---|---|---|---|
| main | 9 | 0 | all zero |
| control (`CONTROL=1`) | 9 | 8 | 8, 7, 3, 8, 8, 0 |

That reproduces the local reading recorded on gh#210 exactly (`checked=9 bad=0` and
`checked=9 bad=8`). Calibrated both ways, so the detector is not inert.

## What was seen in the frames

Both `short-stick` 320x568 frames were opened and read by eye before this note was written, per
`docs/agents/assets.md`.

- Main: the strip ends in a painted `+8` band, and the third chip dissolves under it rather than
  showing a naked partial glyph. This is row 2's "something on screen says more exist", settled by
  looking rather than by reading the CSS.
- Control: the same screen with the mutant stylesheet force-hiding the band. The `+8` is gone and
  that chip is cut hard at the container edge with no signal at all — the hazard this ticket was
  filed about, made real rather than simulated.
- Incidental, and worth having on the record: the Thai copy rendered correctly at 320px in both
  frames, with no dotted-circle breakage, and the edit-players pill did not cover the turn-chip line
  (gh#218's fix, shipped in `d884d9d`).

At 1440x900 the `wire-snip-panic` main and control shots came out byte-identical. That is consistent
rather than broken: at that width the strip does not overflow, so there is no band, so hiding the
band changes nothing. It is the `0` in the control's per-combo list above.

## The exit code is the WRONG observable here

Both legs exit 0. The probe's header only promises that a NORMAL run exits 0; it never promises the
control run reds. The inversion is done by `scripts/ci-probes-verdict.mjs`, not by the probe. So a
must-red check on this probe reads `bad` out of the JSON — reading the exit code makes a working
positive control look broken, which is how it first read here.

## Why no image is committed

`.gitignore` excludes `docs/verification/evidence/**/*.png`, with exactly one negated exception for
`docs/verification/evidence/50/webkit/*.png`. That exception carries its own reason inline: iOS
WebKit has no inspector on that path, so gh#50's fifth box rests on frames a human reads, and an
ignored file would leave a closed ticket citing something absent.

That is a decision, not a gap. A second exception would need its own justification of the same
shape, and row 2 does not need one — the numbers above plus the reproduce command carry the claim,
and the frames can be regenerated in about a minute. Two images were staged here before the ignore
rule was noticed; they were dropped rather than force-added past it.

## Still not met by this run

gh#210's box 3 also wants these numbers as a CI artifact diffed against the local reading. CI keeps
no artifact on green, so that half remains open and belongs to gh#210, which is `needs-triage`.
