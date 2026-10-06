# gh#262 AC box 4 on the live site: built pages vs the canvas

Measured 2026-10-06 on `https://white-plant-05ad7c600.7.azurestaticapps.net` (commit b68439b deployed; byte-identity with local `dist/` was established by the caller, not re-checked here).
Tools: headless Chrome (`--headless=new`, own profile, port 9361, killed by pid) driven over raw CDP by `probe.mjs` (recipe: `docs/agents/raw-cdp-capture.md`).
Emulation: `mobile:false`, deviceScaleFactor 1, `prefers-reduced-motion: reduce` (read back `true` on all 16 loads), animations disabled by injected style, `document.fonts.ready` awaited, page scrolled in 300px steps before capture. `innerWidth` echoed equal to the requested width on all 16 loads. Raw numbers: `probe-result.json`. n = 1 load per page x width (16 loads); no repeat runs.
Painted face read with `CSS.getPlatformFontsForNode`. Background of text elements is the effective ancestor background where the element itself is transparent (inv. probe, not saved).

## Result table (measured vs expected, 320 | 1440)

| Row | Check | 320 measured | 1440 measured | Expected | Verdict |
|---|---|---|---|---|---|
| 1 | `/` tile `.desc` line-height (A.tile, 7 per width) | 16px tiles 24px; 15px tiles 22.5px (hidden at 320, computed only) | 16px 24px; 15px 22.5px | 1.5 x font-size | match / match |
| 1 | `/` tile pitch, 2-line bodies | 3 bodies rect 48 / 2 = 24 | 16px: 48/2 = 24; 15px: 45/2 = 22.5 | 24 / 22.5 | match / match |
| 1b | `/` NON-tile `.desc` (A.featured span, 3 x `.copy p` in the hero list) | line-height `normal`, 16px, 2 of them wrap to pitch 21 | same, pitch 21 | 1.5 x = 24 if the row covers every `.desc` | MISMATCH x2 (scope question: the brief says "tile `.desc`"; these are not tiles) |
| 2 | `/` `.mark` "ใครโดน" | `#14142b` on `#ffcc00`, 3px solid ink, inline-block chip, radius 12 | identical | same | match / match |
| 2 | `/` scrollWidth = clientWidth | 320 = 320 | 1440 = 1440 | equal | match / match |
| 3 | `/` ad label "ช่องโฆษณา" colour | rgb(61,59,92) = `#3d3b5c` | same | `#3d3b5c` | match / match |
| 4 | `/tool/draw/` `.tool-eyebrow` | `#14142b` on `#2b7bff` (bg from `.tool-band`), display block | display none | as brief | match / match |
| 4 | `/tool/team/` `.tool-eyebrow` | same | display none | as brief | match / match |
| 5 | `/tool/wheel/` h1 | Mitr-SemiBold, 600, 26px | Mitr-SemiBold, 600, 26px | Mitr 600 26px | match / match |
| 5 | `#wheel-result` before spin | 60px, 2px dashed, transparent | 60px, 2px dashed, transparent | 60px dashed transparent | match / match |
| 5 | wheel radios x2 + checkbox | 24x24 each | 24x24 each | 24x24 | match / match |
| 6 | `/tool/number/` h1 | Mitr-SemiBold 600 26px | Mitr-Bold 700 38px | Mitr (face only specified) | match / match |
| 6 | go / reset button height | 60 / 52 | 64 / 56 | 60/52 (320), 64/56 (1440) | match / match |
| 6 | result placeholder | 60px, dashed, transparent | 72px, dashed, transparent | 60 / 72 dashed | match / match |
| 6 | checkbox | 24x24 | 24x24 | 24x24 | match / match |
| 7 | `/404.html` ground (`main`) | rgb(255,246,224) = `#fff6e0` | same | `#fff6e0` | match / match |
| 7 | h1 face | Mitr-Bold 28px | Mitr-Bold 44px | Mitr | match / match |
| 7 | "กลับหน้าแรก" pill | 48px tall, `#ffcc00` text on `#14142b`, radius 999 | 48px, same colours | >= 48px, gold on ink | match / match |
| 8 | `/c/fortune/` every `h2.kicker` (2) | 18px, 18px | 18px, 18px | 18px | match / match |
| 8 | `/c/party/` every `h2.kicker` (2) | 18px, 18px | 18px, 18px | 18px | match / match |

Overflow, all 8 pages x 2 widths: `scrollWidth === clientWidth` in all 16 loads (`/`, number, wheel, draw, team, 404, fortune, party); also zero broken images.

Tally: 52 cells matched (36 row cells + 16 overflow cells), 2 mismatching cells (row 1b, one per width, the same four elements).

## Screenshots (JPEG q70, every file under 150KB)

`home-320-part0/1`, `home-1440-part0..3`, `tool-number-320|1440`, `tool-wheel-320|1440`, `tool-draw-320|1440`, `tool-team-320|1440`, `404-320|1440`, `c-fortune-320|1440`, `c-party-320-part0/1`, `c-party-1440-part0/1`.
Opened and read by eye: home-320-part0, home-1440-part0, 404-320, 404-1440, tool-number-320, tool-number-1440, tool-wheel-1440, tool-draw-320, tool-team-1440, c-fortune-320, c-party-1440-part0. Thai renders as glyphs, no dotted circles, no clipped content in those. NOT opened: the remaining files (wheel-320, draw-1440, team-320, fortune-1440, home second halves, party 320 and second halves); they are covered by the numeric rows only.

## Observations outside the rows

- `/tool/wheel/` at 1440: `body` background is transparent, so the page paints the browser default white behind a narrow (about 425px) column, whereas number/draw/team paint `#fff6e0`. The wheel h1 is 26px/600 at 1440 as the brief expects, while the sibling tools use 38px/700. Not a row mismatch; the owner may want to compare against the wheel desktop board.
- `/tool/draw/` at 320 renders a grey ad placeholder reading "ช่องโฆษณา — ได้เครื่องมือ (ADR-0004)" and a back-link bar; not in the rows.

## NOT covered

- No pixel diff against the canvas boards; expected values come from the brief and `gh262-canvas/README.md`, not from rendering the boards side by side.
- Row 5/6 expectations for 1440 h1 size on wheel (26) come from the brief; the canvas README says desktop tool boards use 38/700.
- Chrome desktop emulation only (`mobile:false`); no real iOS/Android, no 390 width, no pre-spin vs post-spin state beyond the pre-spin slot, no hover/focus states.
- Fonts were the site's self-hosted Mitr/Sarabun; no CDN comparison.
- Single run per cell (n = 1); no timing or flake distribution.
