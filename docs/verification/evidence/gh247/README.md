# gh#247 — canvas D's top bar and footer in PageChrome

Owner rulings (2026-10-04): the footer carries the brand only, no links; the nav pill text is ink on all
three pills. Values come from the top-bar and footer blocks of `design/HomeShelfDesktop.dc.html` (the
1440 artboard, base) and `design/HomeShelf320.dc.html` (the 320 artboard, `max-width: 1099px`, ADR-0058).

Instrument: `chrome-geometry-probe.mjs` here, through `scripts/driver.mjs`, against `npm run build`
(port 4331, CDP 9331). It reads getBoundingClientRect and computed styles on `/`, `/c/party/`,
`/c/fortune/`, and the root element's scrollWidth against clientWidth. n = 1 run per page and width
(3 pages x 2 widths); the numbers are layout measurements and were identical on all 3 pages.

```bash
BASE=http://localhost:4331 CDP_PORT=9331 W=<320|1440> node scripts/driver.mjs \
  docs/verification/evidence/gh247/chrome-geometry-probe.mjs > geometry-<w>.json
```

`geometry-before-*.json` = unchanged tree (red), `geometry-*.json` = after.

| Measure | 1440 before | 1440 after | 320 before | 320 after |
|---|---|---|---|---|
| header inner row height | 98 | 84 | 155 | 83 (header 107: 12px padding x2, brand 40, 10 gap, pills 33) |
| footer height | 165 | 96 | 165 | 72 |
| links in header / footer | 4 / 3 | 4 / 0 | 4 / 3 | 4 / 0 |
| brand | 28px 600 cream | 32px 700 gold | 28px 600 cream | 26px 700 gold |
| pills | 10px gap | 12px gap, 17px 600, padding 9/20, ink text | wrapped to 2 rows | 6px gap, 14px 600, padding 6/12, ink text, one row |
| footer brand | 22px 600 cream | 26px 700 gold | 22px 600 cream | 22px 700 gold |
| horizontal scroll (scrollWidth vs clientWidth) | 1440 / 1440 | 1440 / 1440 | 320 / 320 | 320 / 320 |

At 320 the three pills fit one row: 244.2px of the 292px content box, measured with the fallback font.
Mitr is not hosted yet (another track), so the width will move once it loads; the pill row wraps
rather than overflowing if it grows past the box.

Not covered: real Mitr glyph widths, touch-target size of the 320 pills (33px high, the canvas value),
real-device rendering.
