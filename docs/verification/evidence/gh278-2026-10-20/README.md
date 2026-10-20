# gh#278 zero-trigger `.btn-primary` contrast, 2026-10-20

Method: `npm run build`, `dist/` served by `npx serve -l 4601`; headless Chrome 155, flags `--headless --disable-gpu --no-sandbox --remote-debugging-port=9301`, fresh `--user-data-dir`. Viewports by CDP `Emulation.setDeviceMetricsOverride` (mobile, 390x844 and 320x568, deviceScaleFactor 2; `iw` in the JSON echoes `innerWidth`). localStorage cleared before each viewport. Route `/game/zero-trigger/play/`.

Set: every `.btn-primary` enumerated from the built DOM, n = 4 (`#btn-quick-start` on the menu screen, `#btn-confirm-start-game` on setup, `#btn-next-round` in the result modal, `#btn-close-rules` in the rules modal) x 2 viewports = 8 cells per run. Each button's host screen or modal is forced `.active` (the others cleared); `elementFromPoint` at the button centre is recorded as `topIsButton` (true in all 16 cells, nothing overlays them).

Measure (`measure.mjs`, `sample.py`, `cdp-lib.mjs`): the label's children are hidden (`visibility: hidden`, layout kept, emoji included), a 2x screenshot is taken, and the white label colour is compared with the painted fill pixel. `minWhole` = min over a 7x5 grid across the whole button incl. the 5%/95% edges (35 points); `minUnderGlyphs` = min over a 9x3 grid inside every text line's client rect (27 to 108 points). Not a tint of the glyph pixels: the fill under the glyph box is read with the glyphs hidden.

Raw: `before.json` (build at base, no override), `after.json` (override in `src/play/zero-trigger/overrides.css`).

| button | 390 before (whole / glyphs) | 390 after | 320 before | 320 after |
|---|---|---|---|---|
| btn-quick-start | 2.50 / 2.88 | 6.01 / 6.40 | 2.53 / 2.85 | 6.03 / 6.40 |
| btn-confirm-start-game | 2.50 / 2.94 | 6.01 / 6.50 | 2.53 / 2.88 | 6.03 / 6.49 |
| btn-next-round | 2.55 / 2.79 | 6.11 / 6.31 | 2.55 / 2.74 | 6.11 / 6.30 |
| btn-close-rules | 2.53 / 2.88 | 6.03 / 6.41 | 2.50 / 2.85 | 6.03 / 6.40 |

Before: 8 of 8 cells under 4.5 (bar for 1.15rem / 700 text). After: 8 of 8 at or above 6.01.

Not covered: the `:active` pressed state (transform and shadow only, no fill change); the painted emoji in the labels (not text, hidden for the measure); one run per cell (n = 1), the grid is not every pixel, so the lightest painted point is reported as `lightestFill` (#0468a0 against a computed light stop of #0369a1).
