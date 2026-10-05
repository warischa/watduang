# gh#255 — canvas D chrome on every non-game page (2026-10-05)

Build: `npm run build` from the working tree carrying the gh#255 change. Served with `npx serve dist/ -l 4393`.
Driven by headless Chrome 154 over CDP on port 9393 through `scripts/driver.mjs` with `walk.mjs` (copied here).
Width comes from `Emulation.setDeviceMetricsOverride` (`session.setWidth`), and `innerWidth` was read back in the page
at every row. The 320 rows use 320x640 and the 1440 rows use 1440x900. Screenshots are full page.

## Result: n=20 (10 pages x 2 widths), 20 PASS, 0 console errors

| Class | Pages | Expected | Measured at both widths |
|---|---|---|---|
| top bar + footer | `/` (control, unchanged), `/tools/`, `/tool/wheel/`, `/tool/draw/`, `/tool/team/`, `/tool/number/`, `/404.html` | 1 `topbar` marker, 1 `footer` marker, 1 `<footer>` | all 1/1/1. The top bar comes before the page's own header in document order. `.tool-back` is still present on draw and team, the only two pages that had it before |
| footer only | `/game/siamsi/`, `/game/daily-fortune/`, `/game/love-match/` | 0 `topbar`, 1 `footer`, 1 `<footer>`. `header.game-topbar` is still the first child of `<main>` and still holds the one `data-stable-exit` link | all as expected |

On every row: `scrollWidth == innerWidth` (no sideways scroll at 320), the footer holds 0 links, and the footer is the last landmark on the page.

Raw rows: `walk.json`. Gate output: `must-red-old-build.txt` (new gate run on the build from the unchanged source, 27 breaches),
`gate-green.txt`, `selftest.txt`.

## Observed, not changed

- `tools-1440.png` and `404-1440.png` show the footer floating above a white band on short pages. Superseded the same day: the owner ruled to pin the footer to the bottom of the viewport, and `footer-pin/` holds the fix and its numbers.
- `404.html` itself is still unstyled: content flush to the left edge and a browser-default blue link. That is unchanged
  by gh#255, but it stands out more under canvas D's bar. Styling it
  needs a design value the canvas does not give (ADR-0033), so it goes to the owner.
- At 320 the tool pages show the top bar above the tool's own back row. `ToolDraw390.dc.html` draws no site bar. The owner ruled the placement on gh#255.
