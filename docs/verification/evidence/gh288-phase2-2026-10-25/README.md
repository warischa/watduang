# gh#288 Phase 2 — canvas boards, rendered and approved (2026-10-25)

There are four boards in `design/`, one per page family. Every motion value is pinned once, on the motion sheet. The other boards draw the static look and cite that sheet.

| Board | Picks (gh#288 comment 6385620006) | Owner's choice (popup 2026-10-25) |
|---|---|---|
| `design/Gh288MotionSheet.dc.html` | 4, 5, 6, 7, plus pick 2's motion | every printed value approved · hover colour **A** (`--color-muted` + 2px underline) |
| `design/Gh288HomeHero.dc.html` | 2 (the static look) | strength **0.12** |
| `design/Gh288ToolPages.dc.html` | 8, 9, 10, 11 | header **A** (the number page's blue band on all four) · rows 8, 9, 11 as drawn |
| `design/Gh288FortunePages.dc.html` | 12, plus the reveal placement from 5 | **A**: drop the repeated heading on siamsi (intent screen) and love-match (ask screen) · daily-fortune unchanged |

## How the renders were made and judged

- **Renders:** the `<Board>-<n>.jpg` slices are cut from the same captures the owner approved from. The owner saw scaled-down copies of the unsliced captures. The captures were made before the approval stamp, so their status lines still read "awaiting owner". The boards in `design/` carry the stamp: PICKED or NOT PICKED on each option, with nothing deleted.
- **Capture:** headless Chrome from `file://`, after `document.fonts.ready`. The page was 1600px wide, or 1800px for the tool board, where `scrollWidth` equals `clientWidth`. Full pages were cut into 2000px slices and re-encoded at JPEG quality 62.
- **Judged by eye:** Thai is shaped correctly, with no ◌. No frame is cut off. This was checked on the sampled slices, and on every slice through `innerText` holding no U+25CC.
- **Fork review:** the approach chose four family boards over one board per pick, so a rejected board re-renders alone. Every motion value lives on one sheet only, so it has no second home.

## Not covered

- The motion was approved from printed numbers and still frames, not from watching it run.
- Real phones, Safari and Firefox were not tested, and neither was real AdSense (gh#29).
- Notes carried into Phase 3:
  - The `@view-transition` rule needs a stylesheet that only web pages load, plus a gate, because `Base.astro` also serves the play routes.
  - `src/pages/index.astro` sets `animation: none !important` under reduced motion, so the hero layer needs an exemption to keep its reduced form.
  - `firstScreenReserve` must be re-measured for siamsi and love-match.
