# gh#268 box 2: the board paints the reserved top band (2026-10-20)

Board: `design/PlayTopBand.dc.html`, one proposal sheet (same convention as `design/Gh263TargetProposals.dc.html`, static markup, not registered in `design/canvas.json` because that precedent is not). PNGs here are gitignored and exist for owner review; the board file is the committed artifact. Pending owner approval; no `src/**` touched.

**Band height and new values.** The band is 106px tall (variant B, optional, 56px), full width, in flow, route content starts below it. 106 = the measured bottom of the edit-players control (100) plus a 6px gutter equal to the controls' own 6px top inset. Height is the only new value; code time must express it as `max(6px, env(safe-area-inset-top)) + 100px` to track the controls' own safe-area offset. The band ground `#14142b` is already on the canvas (chrome-bar ink of `HomeShelf320`/`HomeShelfDesktop`, ADR-0069 palette). Control fills, rings, sizes, radii and offsets are copied from `src/shell/PlayExit.astro`. The grey dashed wireframe is the `.pending` look from `HomeShelf320` (mockup-only, not a design value); block heights below the band are schematic, so the vertical fit cost is not drawn and stays a box 3 measurement. Variant B moves the pill beside the X (left 56, top 6), a new placement the owner may refuse. Invented Thai: 0 (only the control label, verbatim).

**Coverage, measured.** Box 1's `results.json` (14 routes, 320x568, all states): the close X is the identical box on every record (left 6, top 6, right 50, bottom 50), the edit control starts at top 56 and ends at bottom 100 on every route, widest right edge 81.31 (pinocchio-luck). A 106px band therefore covers both boxes on all 14 routes, with the full width making the horizontal axis trivial. `board-check.json` (browser-measured from the board DOM, 8 frames) confirms: control boxes on the board equal the box 1 boxes for the frame's route (right edge within 0.01px), the band contains both, no content block starts above y = 106 or intersects either control. The same check on the unbanded `cannon-flag-today` frame reports `bandCoversBoth: false`, content top 6, and 1 block under each control, so it can fail.

| artboard (frame) | viewport | PNG | px |
|---|---|---|---|
| sheet | 1440 wide | `sheet.png` | 1440x2721 |
| cannon-flag today (no band) | 320x568 | `cannon-flag-today.png` | 640x1136 |
| cannon-flag banded | 320x568 | `cannon-flag.png` | 640x1136 |
| croc-bite banded | 320x568 | `croc-bite.png` | 640x1136 |
| pinocchio-luck banded | 320x568 | `pinocchio-luck.png` | 640x1136 |
| one-bomb banded | 320x568 | `one-bomb.png` | 640x1136 |
| bangkok-drift banded | 320x568 | `bangkok-drift.png` | 640x1136 |
| cannon-flag variant B (56px) | 320x568 | `cannon-flag-B.png` | 640x1136 |
| cannon-flag desktop | 1280x640 | `cannon-flag-desktop.png` | 2560x1280 |

Frame PNGs are deviceScaleFactor 2. Rendered headless from `file://` with Chrome on port 9302 and its own profile. The only console message is `net::ERR_FILE_NOT_FOUND` for `./support.js`, which every board references and the repo does not contain; it does not affect this static board.
