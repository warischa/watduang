# one-bomb 320x568: the runner-only 79px clip

Question (SESSION-HANDOFF `next:`, S2026-10-20#3): CI run 39444165152 read one-bomb 320x568 as
79px clipped plus 6px sideways by `div#app` on the round screen. The Mac's no-WebGL lane reads
0px. Is the clip a harmless overhang or a layout defect? That call is the owner's. This directory
holds what decides it.

## Measured 2026-10-21, build at 2748c48 plus the probe diagnostic below

- **WebGL is not the variable.** This Mac in a WebGL-live lane (`--headless=new --use-gl=angle
  --use-angle=swiftshader --enable-unsafe-swiftshader`, docs/agents/browser-verification.md) reads
  **0px clipped on every one-bomb screen at every viewport, n=2** (`mac-webgl-fit-r1.txt`,
  `mac-webgl-fit-r2.txt`). The context was confirmed live in the page, not inferred from the
  flags: `#gameCanvas` present, no fallback notice, `getContext('webgl')` live and not lost, at
  innerWidth 320 (`in-page-context.json`). So the 79px comes from the runner machine, not from 3D.
- **On the runner the clip is persistent.** It reads 79px on press 0 (the player screen) and on
  press 1 (the round screen). The 6px sideways appears on press 1 only
  (`runner-39444165152-lines.txt`). Mechanism not identified.
- **`#gameCanvas` reaching above `#app` is by design and is not what the probe counts.** It sits
  56px above `#app` (`canvasBox.top` 0 against `app.top` 56; see the `#gameCanvas` rule in
  `src/play/one-bomb/overrides.css`). That overhang is upward, and scrollHeight never counts it:
  the Mac reads 0px with it present.

## Why the runner log could not answer it, and what now will

The fit probe printed the clip's px only. As of this batch the per-screen line also names the
clipping box and its furthest-below descendant, with that descendant's rect. Positive control:
power-meter, the route that is known to clip (its KNOWN_OVERFLOW reason names a parked toast):
`clipped 76px by div#app-container [furthest below: div#toast-msg 139,622,42,22 (+76px)]`
(`mac-webgl-power-meter-control.txt`). The diagnostic named the recorded cause.

The batch's branch CI run will print the same line for one-bomb 320x568 on the runner.

## The two readings, written before the run

- The descendant is decorative and non-interactive (the canvas, a backdrop layer, or a parked
  element that is meant to be off-screen) → harmless overhang: a note on the one-bomb 320x568
  KNOWN_OVERFLOW reason, no ticket.
- It is a HUD bar, a control, or part of the board a player reads or taps → layout defect: file a
  ticket.
- Not decidable from the line, e.g. a fixed-position descendant that is not the scrollHeight
  contributor → measure on the runner directly before ruling.

Not taken: a screenshot of the Mac round screen. It shows nothing clipped, so it would be a
control, not the evidence the question needs.
