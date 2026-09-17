# gh#204 — the distance fog reaches the obstacles (2026-09-17)

Measured against `~/claude/mockup-games/bangkok-drift/index.html` before and after the draw-order fix,
and against a pristine byte-level backup of the same file as the positive control.

**No PNG is kept here, deliberately.** `.gitignore` excludes every image under this tree because
"probe screenshots regenerate on every evidence run — the JSON logs are the evidence", and its one
carve-out is for a path with no inspector to produce a log. This was a CDP probe, which that carve-out
explicitly never covers: it can always emit JSON. The captures existed on the workstation and are not
the artifact. `fixed.json` and `before.json` are.

## What was measured

Both files driven in headless Chrome at a real emulated 375×812, `dpr=1` verified in-page.
`Math.random` was overridden before load to pin **seed 2935300**, and both files reproduced this
ticket's recorded road — banana / puddle / rock / cone at segments 42 / 50 / 58 / 66. The camera was
frozen at the same position in both and `draw()` called once, with the `SPRITES` table patched to
record each sprite's own paint call, so the sampled pixel is a known obstacle rather than a guess at a
coordinate.

Fog target colour is `rgb(39, 76, 122)`.

| sample | before | after | reading |
|---|---|---|---|
| far obstacle (cone, x97 y330) | `rgb(249, 115, 22)` | `rgb(57, 80, 114)` | before is the cone's raw orange, unblended; after sits ~20 from the fog colour |
| near obstacle (banana, x44 y544) | `rgb(59, 66, 82)` | `rgb(59, 66, 82)` | identical — the near field is untouched |

## The row that carries the verdict

**The positive control.** The unfixed file's far obstacle reads as the cone's own colour with no fog in
it, which is the defect the owner recorded on 2026-09-10 ("the far specks are crisp, not hazy"). An
apparatus that could not show the defect could not be trusted to show the fix, so this row is what
makes the other two admissible rather than decorative.

## Disclosed deviation

The 2026-09-10 ruling records a camera position of 190 m. At 190 the near control sits inside the fog
band, leaving no clean unfogged reference, so the probe used **205 m** — the same position for both
files, so the comparison holds. The seed, the road and the sampled sprites are the ticket's own.

## Re-running it

`fog_probe.mjs` is the probe. It needs a Chrome with a debugging port and the two HTML files; it writes
the JSON beside itself. Give it a port nothing else holds — the default 9222 is shared with other
probes on this machine, and two probes on one port silently measure the wrong page.
