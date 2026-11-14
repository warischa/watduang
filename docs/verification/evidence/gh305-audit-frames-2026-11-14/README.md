# gh#305 / gh#306 / gh#307 audit frames, 2026-11-14

The canvas `design/Gh305AuditFrames.dc.html` draws the frames that the owner's 2026-11-14 audit picks need
before code (PD-306-01, PD-305-05, PD-307-04, PD-307-03). The owner ruled that these frames go to code without
a separate sign-off. Every number below comes from the final render, and every caption number on the canvas
is checked against it by the generator.

- Generator: `make-audit-frames.mjs.txt`. Copy it outside the repo, then run `write`, then `render`. The usage
  is in its header.
- Browser: headless Chrome 157 (`--headless=new`) on its own CDP port. The viewport is set with
  `Emulation.setDeviceMetricsOverride`, and `innerWidth` is checked (1600 for the canvas; 320 and 375 for the
  phone viewport runs).
- Fonts: Sarabun 400/700 and Mitr 600/700 all report `loaded`. The rendered text contains no U+25CC.
- Runs: 4 full renders after the last code change. The first 3 checked that the rail samples were stable
  (identical in all 3); the 4th was the final run, exit 0 and `problems: none`. Earlier passes fixed two
  instrument faults: the HUD width read the block's box instead of its text, and the rail sample was a single
  pixel that moved by one level between runs.

## Frame 1 · PD-306-01 · the cards field above 102 names (1920 x 1080 frame px)

Sizes are painted sizes: the computed font size times the on-screen scale, converted to frame px. "Inside the
field" means every card box lies within x 56–1864 and y 100–860, and no two cards overlap.

| frame | layout | card w x h (min; tallest) | smallest / largest painted name | most lines | every card inside the field | field used |
|---|---|---|---|---|---|---|
| cards-ctl-200 (CONTROL, today's fieldLayout) | 8 x 25 at scale 0.6934 | 203.2 x 27.7 | **11.1 / 13.9px** | 2 | yes (0 outside, 0 overlaps) | 760 |
| cards-103 | 6 x 18, 32px rows | 293 x 32; 32 | 16 / 20px | 2 | yes (0, 0) | 644 |
| cards-150 | 8 x 19 | 217.3 x 32; 32 | 16 / 20px | 2 | yes (0, 0) | 680 |
| cards-200 | 10 x 20 | 171.8 x 32; 48 | 16 / 20px | 3 | yes (0, 0) | 732 |
| cards-200-result (bold on passing cards) | 10 x 20 | 171.8 x 32; 64 | 16 / 20px | 4 | yes (0, 0) | 748 |

- **Must-red:** the control, today's geometry at 200 names, measures its smallest painted name at 11.1px and
  its largest at 13.9px. That is under 16, as required, so the instrument reads a scaled card as scaled.
- **The gap left for the owner:** 16px holds at every count, but the board's two-line rule does not hold at
  200 names. U+0E12 U+0E33 x12 takes 3 lines (4 when bold) in the 87.8px name box. Its row grows, and the field
  still fits, with 28px to spare in the reveal state and 12px in the result state. No 200-card geometry keeps
  that name on two lines at 16px beside the 30px rank. The canvas NOTES list the owner's choices.
- One new value: 32px rows above 102 cards (two lines at the 16px floor). The columns are the fewest from 6 up
  whose rows fit 760px.

## Frame 2 · PD-305-05 · the final result on a phone

"Outside parent or frame" measures each marked box (body, event, heading, prize line, winner, card list, each
card, its label and name, claim line) against its parent and against the frame. The viewport columns load each
frame by itself as a page at its own width.

| frame | boxes outside parent or frame | innerWidth | scrollWidth = clientWidth | elements past the right edge | winner | card names | smallest text |
|---|---|---|---|---|---|---|---|
| res-320 | 0 (max excess 0) | 320 | 320 = 320 | 0 | 24px, 2 lines, bottom at 230.1 (fold 568) | 21–22px, 1 line | 16px |
| res-375 | 0 (max excess 0) | 375 | 375 = 375 | 0 | 24px, 2 lines, bottom at 230.1 (fold 667) | 22px, 1 line | 16px |

- **Must-red:** the same page with a 400px box injected gives scrollWidth 400 at both widths. A scroll would
  therefore be seen.
- The page is 676.9px tall at 320 and 678px at 375, so it scrolls past the fold, as i5-phone B does.
- Two new values, both derived with the NAME FIT rule at 320: a winner floor of 24px and a prize-card name floor
  of 21px.

## Frame 3 · PD-307-04 rails and PD-307-03 HUD line (frame px)

Rails are measured from the PNG on rail 1. The rail value is the mean of the brightest 3 pixels per row, across
5 rows at y-2 to y+2. The ground value is the mean of a 5 x 5 patch 40px to the right of the rail.

| frame | y 520 | y 700 | y 900 |
|---|---|---|---|
| rails-ctl (CONTROL, #5e5c7b solid, as built) | #5e5c7b on #1b1a3b, 2.62:1 | #5e5c7b on #1e1c41, 2.54:1 | #5e5c7b on #211f47, 2.44:1 |
| rails-50 (#d9d6f0 at 50% alpha) | #7a7896 on #1b1a3c, 3.93:1 | #7c7a98 on #1e1d41, 3.9:1 | #7d7b9c on #211f47, 3.84:1 |

- **Positive control:** the as-built rail reads 2.44–2.62:1 along its length. The audit's 2.58:1 on #1c1b3e
  falls inside that range. The arithmetic for the pick (#7a7897, 3.89:1) matches the painted value within the
  range of the gradient.

| frame | HUD lines | right end of the longest line | clearance to rail 1's edge (nearest line) | game name clearance |
|---|---|---|---|---|
| hud-ctl (CONTROL, one line, as built) | 1 | x 594.4 | **-74.9 (crossed)** | 61.9 |
| hud-wrap (the line broken at its own space) | 2 | x 348.8 | 170.7 | 41.4 |

- **Must-red:** the as-built line crosses rail 1 (negative clearance). This matches the audit's x≈613 in screen
  px: 50 + 594.4 x 0.948.

## Thai rendering

Checked by eye, with no dotted circles: `res-320.png` (heading, prize lines, the U+0E12 U+0E33 winner on two
lines, claim line), `hud-wrap.png` (both HUD lines and the game name), and `cards-200-result.png` (round label,
names with tone marks, the struck names, the lower band).

## Files

PNGs, one per frame: `cards-ctl-200`, `cards-103`, `cards-150`, `cards-200`, `cards-200-result` (1920 x 1080);
`res-320`, `res-375` (2x); `rails-ctl`, `rails-50` (1920 x 1080); `hud-ctl`, `hud-wrap` (760 x 300, frame x
0–760, y 250–550). The full numbers, including per-name lines and every rail sample, are in
`measurements.json`.

Not covered: a real projector and real phones; the 3D renderer's own text atlas (these frames are DOM, the way
the boards are).
