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

## The runner's answer: CI run 39536646395, branch head 818f5ff

`runner-39536646395-lines.txt`. The runner reproduces the reading of 39444165152: 79px clipped by
`div#app` on press 0 and press 1, and 6px sideways on press 1.

- Press 1 (round screen): the furthest-below element is `div.glassPanel.modalBox` at 20,76, 294x571,
  reaching **+79px**, exactly the clip. The 79px equals this element's overhang.
- Press 0 (player screen): the furthest-below element is `div.menuBtnCol` (+146px). It sits inside
  `#menuOverlay`, which scrolls, so it is not the 79px. This is the "lead, not cause" case the probe
  line warns about.

Inferred, not yet measured on the runner: the box is the how-to-play dialog (`#howModal`, the first
`.glassPanel.modalBox` in `src/play/one-bomb/markup.html`). Its overlay is `visibility: hidden`
until opened but is always laid out, so its overflow sits inside `#app`'s scrollHeight on every
screen. That explains why the reading is the same on both presses. On the runner's text metrics
the dialog is 571px tall inside a 512px `#app`. Opened at 320x568, its last 79px of rules text
would be unreachable: `#app` is `overflow: hidden` and the dialog does not scroll. On this Mac the
same dialog fits, so the clip reads 0. Written before the run, this falls under the second reading
(content a player reads).

Not measured: the dialog OPEN on the runner, and which font metric makes it taller there.

Not taken: a screenshot of the Mac round screen. It shows nothing clipped, so it would be a
control, not the evidence the question needs.

## gh#286 box 1: the dialog measured OPEN, 2026-10-21

Instrument: `scripts/one-bomb-how-dialog-probe.mjs` (manual, not wired), run through
`scripts/driver.mjs` with the fit lane's flags, `--headless --disable-gpu --no-sandbox`, at 320x568
mobile emulation. It opens `#howModal`, then reads the dialog box and its last rules line against
`#app`, whether anything between them can scroll, and the face Chrome shaped the text with
(`CSS.getPlatformFontsForNode`). The two readings were written into the probe's header before the
runner run.

Calibration, Mac, Chrome 155: the control reads **FITS**, with the box overhang at -27px and the
last rules line at -54px against `#app` (`mac-dialog-open-control.json`). The must-red leg
(`MUSTRED_PAD=1`, 200px of top padding) reads **RULES-UNREACHABLE** at +140px / +113px
(`mac-dialog-open-mustred.json`), so both deltas can go red.

Runner: branch-only workflow `gh286-diag`, run 39622359316, head add3c17, Chrome 155:

- **The dialog is the clipped box: confirmed.** The box is 76,571 with a +79px overhang, the
  exact clip the fit probe reads. The last rules line ends at 620 against `#app`'s 568, so it
  overhangs by **+52px**, with `canScroll false`. The verdict is RULES-UNREACHABLE, and the
  geometry is the same closed and open (`runner-39622359316-dialog-open-control.json`). The
  must-red leg reads +253 / +226 (`runner-39622359316-dialog-open-mustred.json`).
- **But the runner renders no Thai at all.** `fc-list ':lang=th'` lists nothing, and
  `fc-match` resolves both `sans-serif` and `system-ui` for Thai to DejaVu Sans
  (`runner-39622359316-fonts.txt`). Chrome reports every rules glyph as DejaVu Sans, and the
  screenshot shows tofu boxes, not Thai. It is in that run's `gh286-dialog-39622359316` artifact,
  not in the tree, because evidence PNGs are gitignored. The Mac
  shapes the same text in `.ThonburiUI`, with the paragraph at 4 lines and the items at
  [2,3,3,3]. The runner's tofu takes 5 lines and [3,4,4,4].
- So the 79px is a measurement of tofu metrics on a machine that has no Thai face. It is not the
  reading of any device that renders Thai. one-bomb's `--font-ui` is a system stack
  (`system-ui, -apple-system, ...`) with no self-hosted face in it, so on the runner nothing is
  left to fall back to.

Not measured: the dialog on a real Android phone (Noto Sans Thai) or on Windows (Leelawadee UI).
Those decide whether a device that does render Thai can clip it; the Mac's 54px of spare room is
one machine's number. Also not measured: whether other play routes' runner fit rows are tofu
readings too. Any route whose stack reaches no self-hosted face would be one.

## The same dialog with a Thai face installed, 2026-10-21

The branch-only `gh286-diag` workflow, run 39626259353, head 20ad118, Chrome 155, measured one
build twice in the same job. Leg A is the runner as it ships. Leg B installs `fonts-noto-core`,
which brings Noto Sans Thai (the Thai face Android ships: inferred, not measured on a phone), and
measures with a fresh Chrome.

- **Leg A reproduces the tofu reading.** Box +79px, last rules line +52px, in DejaVu Sans
  (`runner-39626259353-runner-control.json`).
- **Leg B: FITS.** The box is 92,440 with a -36px overhang, and the last rules line ends at 505
  against `#app`'s 568, so **-63px**. The rules are shaped in Noto Sans Thai: paragraph 3 lines,
  items [2,3,3,3] (`runner-39626259353-noto-control.json`). Its must-red reads +122 / +95
  (`runner-39626259353-noto-mustred.json`). `fc-match` resolves `sans-serif:lang=th` to Noto Sans
  Thai (`runner-39626259353-noto-fonts.txt`).

So with a Thai face, in Thonburi (Mac) or Noto Sans Thai (runner), the dialog fits at 320x568 with
54 to 63px to spare. The 79px clip exists only where Thai renders as tofu. Not measured: a real
phone's text size and accessibility font scaling, which can grow the text past that margin.
