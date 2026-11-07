# gh#296 ship evidence: /tool/wheel/ desktop card from 1100px

Owner ruling 2026-11-07 (popup): ship the ToolWheelDesktop board's 940px layout, wheel left and
controls right inside one card; the name panel stays below the card; no ad rail.

## Method
- Base = `npm run build` of the parent commit, copied out of the repo and served on 4401; the change
  served from `dist/` on 4402. Headless Chrome/156.0.8078.80, `--headless=new --disable-gpu`
  (page is not WebGL), CDP 9381, own profile under the session scratchpad. Probes run with
  `scripts/driver.mjs`, one at a time.
- Every rule of the change sits inside `@media (min-width: 1100px)`. No markup changed: the card is
  `section#wheel::before` on a grid, because a wrapper element would itself be a diff below the bound.

## Bound proof (`below-bound-style-diff.mjs`)
Per element under `main` (88 elements), 44 computed properties plus the box rect and `::before` /
`::after` content, keyed by tag/id/classes. Reduced motion, fonts ready.
- `bound-control-head-vs-head.json`: base vs an identical build, 0 diffs at every viewport.
- `bound-after.json`: base vs the change, 0 diffs at 320x568, 390x844, 768x1024, 1099x900.
- `bound-must-red-1000px.json`: the gh#296 query widened to 1000px, 1099x900 = 196 diffs, the other
  three 0. Source restored from a copy, hash compared.

## Desktop layout (`desktop-layout-probe.mjs`, mobile:false)
`layout-before.json` red (21 failures: 576px column, no card). `layout-after.json` green at 1100,
1280, 1440: column 940, disc track 460, disc 400, controls 30px right of it, card drawn, name
panel 940 wide and 36px below the card, then GameNav, ad slot (min-height 250px), how-to.
Controls stack 354px vs disc 400px, midlines within 1px (the board's align-items: center).
scrollWidth == clientWidth and 0 boxes past the edge at all three widths.

`desktop-mode-b-check.mjs` covers the states the layout probe does not reach. In mode B the stop
control shows and the controls grow to 428px (taller than the disc), so the spacers fall to 0.
`mode-b-after.json` is green at 1100/1280/1440: disc and controls midlines are equal, names-in
feedback is in the viewport, no sideways scroll, and after one spin the filled result bar is 393x60
with no dashed border. `mode-b-before.json` is red (6 failures; the base stacks the controls below
the disc).

## gh#295 probes, copied with desktop legs (originals untouched)
- `b3-tool-header-inset-probe.mjs`: already carried the 1100/1280/1440 legs; copied as is. Before and
  after green, 20/20 rows; after run against `b3-before.json` as baseline, no h1 moved.
- `b6-wheel-names-feedback-probe.mjs`: 8 desktop legs added (tap, one-name tap, reduced-motion sync,
  normal-motion control). Before 14/14 and after 14/14 green. After, desktop: disc 0..400, note top 99,
  spin bottom 251 in a 900px viewport; sync control still smooth (972 -> 972 before, 743 -> 743 after).
- `b6-double-tap-ghost-probe.mjs`: 6 desktop legs added. Before 10/10 and after 10/10 green. The
  geometry holds at desktop: first contact on the CTA and the ghost lands on the checkbox (unticked); the
  control tap after the window ticks it.

New finding, checked: on the desktop card the names-in scroll puts the name textarea under the CTA
point (`underControlAfterScroll` = textarea on every desktop leg after; null before). The
`desktop-textarea-ghost-check.mjs` run drives a real double-tap at the CTA's natural position:
6/6 green (`textarea-ghost-after.json`), with the ghost landing on the textarea and focus staying on
body. Its red leg is the control: a deliberate tap at the same point after the window focuses the
textarea. The names-in hold already lists that textarea. No before run, because on the base the
textarea is not under the point, so the leg would measure nothing.

## Renders vs `../gh296/board-wheel-1440-part0.jpg`
`page-wheel-{1100,1280,1440}.jpg` (initial state) and `page-wheel-1280-names.jpg` (eight names, 1.5s
after the CTA). JPEG q70, all under 140KB. Visible differences:
1. No ad rail (ruling), so the card is centred in the page instead of sitting left of a 300px rail.
2. Heading row: the board prints a static mode caption on the right. The page puts the A/B radio pills
   there (24px radios, 44px rows, gh#262). The board draws radios only in its gh#262 review panel.
3. Result: the board shows a filled 30px result with a sub-line. The page keeps the approved dashed
   60px pre-spin slot (gh#262) and the 26px / 60px bound (gh#120, `fitResultFont` caps at 26). Its
   status note (72px reserve) sits under the slot.
4. The entered-names list (fixed 120px, gh#120) spans the card under both tracks. The board draws no
   list, so the bottom of the card is an empty band of about 140px before any names are entered.
5. Palette: the board predates canvas D (raw #1a1a1a, #fffdf7, sky #7fd8e8). The page uses the tokens
   (ADR-0069), the same as draw's card.
6. Title band (breadcrumb, longer tagline) belongs to ToolHeader and was not touched.
7. Already there, not touched: GameNav's 2px top border touches the name panel's bottom edge (0 gap
   in both builds, at every width).

Not run: the two browser lanes of `scripts/run-workflow-gates.sh`. The fast lane ran: 50 executed,
0 failed.

## Follow-up 2026-11-07: the foot band (owner popup: fix before deploy)

The entered-names list keeps its fixed 120px bound. Spanning the card under both tracks, it left an empty band about 100–140px tall at the card's foot. It now closes the controls stack (grid row 9, column 4). The disc track spans rows 4–10, so the board's centring holds, and the card is 46px shorter at desktop.

With the list in the stack, the stack is taller than the disc: 490px in mode A, 564px in mode B. The gh#295 names-in scroll brings the disc's top to the viewport's top, so the note sat 6px above the viewport in mode B.
- **Fix:** `.wheel-disc { scroll-margin-top: 96px }`, inside the same 1100px bound. 96px is not a board value: it is the measured 82px overhang plus slack.
- **Must-red:** `desktop-mode-b-check` against the build without the margin is RED on "names-in feedback outside the viewport in mode B" at 1100, 1280 and 1440.
- **Probe change:** `desktop-layout-probe` gained the assertions "name list in the controls column" and "card foot 28.5px below its content". It is RED at d9e3f31 (6 failures: list not in the column, and a midline that moved).
- **After the fix:** all six probes are green: layout, mode B, textarea ghost, B6 feedback, double-tap ghost, B3 inset. The renders are re-captured.

The below-1100 bound proof was not re-run: every changed rule sits inside the `min-width: 1100px` block, and the only change outside it is a CSS comment.
