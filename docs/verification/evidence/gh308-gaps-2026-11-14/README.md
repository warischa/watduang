# gh#308 gaps: PIN entry and the QR review list below 640px, rendered and measured (2026-11-14)

Canvas: `design/Gh308Gaps.dc.html`, AWAITING THE OWNER'S PICKS (ADR-0033: picks, then canvas, then code). Nothing under `src/` changed.

| Gap | Options (each drawn at 320 and 375) | rec |
|---|---|---|
| 1. Phone PIN entry, six digits (the board draws four boxes) | A six cells on the board's own rule · B one 64px field, AS BUILT · C two groups of three cells | B |
| 2. Setup page QR review list below 640px | A one column, 952px window (15 rows), AS BUILT · B one column, the board's 312px window (5 rows) · C two columns, the remove button under the name | B |

Not options: `pin-ref` draws the board's four boxes unchanged, and `pin-ctl` (the CONTROL) draws six boxes at the board's 64px width.

## How it was made

- `make-gaps.mjs.txt` generates the canvas and renders it. It carries a `.txt` suffix so repo tooling never treats it as code. It was run from a copy at `<tmp>/gh308-gaps/make-gaps.mjs`.
- The browser was headless Chrome 157 (`--headless=new`) on its own CDP port, 9335, with a profile under `/tmp`. Teardown went by pid: pid 27214 was killed, and port 9335 was confirmed free.
- The page loaded from `file://`, so the canvas's relative font paths resolve. The viewport was set to 1600 with `Emulation.setDeviceMetricsOverride`, and the probe read `innerWidth` back as 1600.
- Each frame is a fixed-width box (320 or 375) with no media queries. Its layout does not depend on the page viewport, so the frame box stands in for the phone viewport.
- PNGs are clipped to each frame at 2x. The control's PNG keeps 150px past its right edge, so the overflow shows.

```
node make-gaps.mjs <repo> write                    # captions show "?"
CDP_PORT=9335 SHOT_TMP=<tmp>/gh308-gaps node make-gaps.mjs <repo> render
node make-gaps.mjs <repo> write measurements.json  # captions take the measured numbers
CDP_PORT=9335 SHOT_TMP=<tmp>/gh308-gaps node make-gaps.mjs <repo> render   # asserts every caption number equals a fresh measurement
```

What `render` measures:
- **Containment.** Every PIN box, PIN group, field, list row, name and remove button must sit inside its parent and inside the frame, on both axes. A row that the scroll window hides is judged on y against the window's scroll extent only.
- **Width.** Any element that extends past the frame's width is counted. This is the horizontal-scroll check.
- **Taps and text.** The smallest tap target, the smallest gap between tap targets, and the smallest text size.
- **Names.** Font size, line count, and clipping. A one-line name is judged horizontally only; a wrapped name is judged on both axes.

The run exits 1 when any of these is true:
- the control does NOT overflow at 320
- any option overflows
- a used face is not `loaded`
- U+25CC appears in the rendered text
- a caption number differs from the fresh measurement

## Result (final run, n=5 renders; the last two produced identical tables)

Units:
- **past parent or frame**: the largest distance, in px, that a measured box lies outside its parent or the frame.
- **past frame**: the same distance, against the frame (the screen) only.
- **boxes past frame edge**: a count of elements that extend past the frame's width.

| frame | width | past parent or frame px | past frame px | boxes past frame edge | cell w x h | min tap w x h | min tap gap | min font | rows in view | name lines | start top |
|---|---|---|---|---|---|---|---|---|---|---|---|
| pin-ref-320 | 320 | 0 | 0 | 0 | 64.5 x 64 | 64.5 x 64 | 10 | 16 | - | - | - |
| pin-ref-375 | 375 | 0 | 0 | 0 | 78.3 x 64 | 78.3 x 64 | 10 | 16 | - | - | - |
| pin-ctl-320 | 320 | 146 | 130 | 2 | 64 x 64 | 64 x 64 | 10 | 16 | - | - | - |
| pin-ctl-375 | 375 | 91 | 75 | 2 | 64 x 64 | 64 x 64 | 10 | 16 | - | - | - |
| pin-A-320 | 320 | 0 | 0 | 0 | 39.7 x 64 | 288 x 64 | - | 16 | - | - | - |
| pin-A-375 | 375 | 0 | 0 | 0 | 48.8 x 64 | 343 x 64 | - | 16 | - | - | - |
| pin-B-320 | 320 | 0 | 0 | 0 | - x - | 288 x 64 | - | 16 | - | - | - |
| pin-B-375 | 375 | 0 | 0 | 0 | - x - | 343 x 64 | - | 16 | - | - | - |
| pin-C-320 | 320 | 0 | 0 | 0 | 43.7 x 60 | 288 x 64 | - | 16 | - | - | - |
| pin-C-375 | 375 | 0 | 0 | 0 | 52.8 x 60 | 343 x 64 | - | 16 | - | - | - |
| list-A-320 | 320 | 0 | 0 | 0 | - x - | 56 x 44 | 20 | 16 | 15 | 2 | 1482.7 |
| list-A-375 | 375 | 0 | 0 | 0 | - x - | 56 x 44 | 20 | 16 | 15 | 2 | 1448 |
| list-B-320 | 320 | 0 | 0 | 0 | - x - | 56 x 44 | 20 | 16 | 5 | 2 | 842.7 |
| list-B-375 | 375 | 0 | 0 | 0 | - x - | 56 x 44 | 20 | 16 | 5 | 2 | 808 |
| list-C-320 | 320 | 0.5 | 0 | 0 | - x - | 96 x 44 | 32 | 16 | 4 | 3 | 842.7 |
| list-C-375 | 375 | 0.5 | 0 | 0 | - x - | 123.5 x 44 | 32 | 16 | 4 | 3 | 808 |

Reading the table:
- **PIN tap targets.** In pin A, B and C the tap target is the whole row (one input), so the cell widths of 39.7 and 43.7 are drawing, not targets. Six separate targets cannot fit at 320: 6 x 44 + 5 x 8 touch spacing = 304px, and the content box is 288px.
- **Rounding.** list-C's 0.5px sits at the instrument's sub-pixel tolerance. It is not counted as overflow.
- **List C** breaks the board's NAME FIT rule (at most two lines at the 17px floor): the widest name takes 3 lines at both widths.
- **List A**'s start button starts 1482.7px down at 320, about 2.6 screens.
- **Fonts.** Sarabun 400, Mitr 600 and Mitr 700 are `loaded`. Sarabun 700 is declared but unused, so it stays `unloaded`.
- **Console.** No errors. The pattern filter drops the inherited `support.js` load failure that every `design/` board logs when opened alone.

## Must-red

| Check | Input | Result |
|---|---|---|
| PIN overflow (the required control) | `pin-ctl-320`, six boxes at 64px | Red, as it must be: 146px past its parent, 130px past the 320 edge, 2 boxes past the frame edge. The reference frame (`pin-ref`, the board's 4 boxes) measures 0, so the instrument tells the two apart. |
| List overflow (extra) | The generated canvas with the remove button's `min-width` mutated to 400px | rc 1. The output reads `overflow in option list-A-320: excess 180px, 15 boxes past the frame edge` (and likewise for every list frame). The canvas was regenerated clean afterwards. |
| Caption numbers | First render, captions showing `?` | rc 1, with 30 caption mismatches. Clean after the fill. |

Run 1 also exposed three instrument faults, which were fixed before the numbers above were taken:
- an unused face was flagged as a failure;
- one-line names were judged vertically, against the board renderer's rule;
- rows hidden by the scroll window were judged against the frame.

## Thai rendering

These PNGs were opened and checked by eye:
- `pin-ctl-320.png`: ใส่, ให้แล้ว, ปาร์ตี้ปีใหม่
- `list-C-320.png`: เข้าร่วมแล้ว, ชื่อ, เลื่อนดูอีก
- `list-B-375.png`
- `pin-C-320.png`

The tone marks and upper vowels are composed, and there are no dotted circles. The probe also asserts no U+25CC anywhere in the rendered text.

## Seen in passing (not part of either gap)

The setup board's joined line (40px Mitr, `เข้าร่วมแล้ว 196 / 200` plus `คน · ยังขาด 4 คน`) stacks into a narrow column at both 320 and 375 in every list option. It does not overflow. The canvas flags it; it does not propose a fix.
