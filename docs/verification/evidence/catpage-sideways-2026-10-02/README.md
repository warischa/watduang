# Category pages scrolled sideways from 1100 to 1323px — fixed 2026-10-02

Found during the gh#241 wiring measurements (`docs/verification/evidence/gh241/wiring/`), fixed in session S2026-10-01#2. There is no ticket number: the fix and its gate shipped in the same batch as the finding.

## Cause

The artboards (`design/CatPartyPop.dc.html`, `design/CatFortunePop.dc.html`) draw each row as a 1280px **content** box. The body row holds `940px 300px` tracks with a 40px gap, which adds up to exactly 1280. The page capped each row at 1280px **border-box** with 18px of inline padding, so it held 1244px. The tracks overflowed by 36px, and the page margins hid that only above about 1324px. The shared chrome (`PageChrome.astro` `.chrome-inner`) already sizes its row as a 1280px content box, so above 1316px the category rows also sat 18px inside the chrome's edges.

## Fix

- `.cat-head-inner`, `.ad-band` and `.body-grid` move to content-box sizing with auto width. The values are unchanged: 1280 and 18.
- The main track becomes `minmax(0, 940px)`, so it shrinks between 1100 and 1316px and is 940px again from 1316px up.
- No canvas value changed.

## Gate

`scripts/category-pop-probe.mjs` gains `noSidewaysScrollDesktopBand`: both pages at 1100, 1280, 1315, 1316, 1323 and 1440px. It runs without mobile emulation, via `driver.mjs`'s new `setWidth(w, h, false)`, and uses the same per-width injected-overflow calibration as the narrow widths. `scripts/ci-probes-verdict.mjs` requires it.

## Readings

Chrome 154 headless, with the CI probe flags `--headless --disable-gpu --no-sandbox`. Each build was served by `serve@14`, one Chrome at a time.

| Build | 1100 | 1280 | 1315 | 1316 | 1323 | 1440 | Band verdict |
|---|---|---|---|---|---|---|---|
| c61a098, unfixed (`probe-unfixed-c61a098.json`) | sw 1302 | sw 1302 | sw 1320 | sw 1320 | sw 1324 | clean | **false** (the probe exits 0 but the verdict reds) |
| fixed (`probe-fixed.json`) | clean | clean | clean | clean | clean | clean | **true** |

Both pages read the same. Calibration saw the injected overflow at every width, on both builds.

Row alignment at 1440px, content-box left and right:

- unfixed: chrome 80/1360; header, ad band and body 98/1342.
- fixed: all four rows 80/1360; main column 940, rail 300.

Main column width on the fixed build: 724 at 1100, 904 at 1280, 939 at 1315, 940 from 1316 up.

The 320 and 390px readings and the ad-slot heights are unchanged (`narrow`, `heightVerdict` in both JSONs).

Screenshots `party-{320,1100,1440}.png` were opened and checked: the rail beside a three-column grid at 1100, nothing clipped. They are gitignored by repo rule.
