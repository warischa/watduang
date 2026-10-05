# gh#255 footer pin — owner ruling 2026-10-05 (2026-10-05)

The ruling: on a page shorter than the viewport, canvas D's footer sits on the viewport's bottom edge.

**Mechanism.** The rule lives in `src/components/PageChrome.astro` and has three parts:
- `body:has(> .chrome-footer)` becomes a flex column with a minimum height of `100vh` (then `100dvh`).
- A body-child `<main>` grows into the spare height.
- The footer gets `margin-block-start: auto` as a fallback.

It is keyed on the footer element itself, so it applies only to the pages that render that footer. Play routes render none and do not match.

**Rejected alternatives:**
- A Base class tied to the `chrome` prop: play routes pass `chrome` too, so it would have needed a second prop.
- A global `body` rule: it would touch play routes.
- The first version, with only the footer margin: it moved the white band on `/tools/` to sit above the footer. See the measured row below.

Build: `npm run build`, served with `npx serve dist/ -l 4393`, headless Chrome 154 on CDP port 9393. Width comes from
`Emulation.setDeviceMetricsOverride`. The before build is the same tree with the rule block removed. `pin.mjs` is copied here.

## Numbers (from `numbers-before.json` and `numbers-after.json`, n=26 rows: 13 pages x 2 widths)

| Page @ width | Footer bottom, before -> after | Viewport height |
|---|---|---|
| `/404.html` @1440 | 326.9 -> 900 (must-red: the gap before the fix) | 900 |
| `/404.html` @320 | 327.9 -> 640 | 640 |
| `/tools/` @1440 | 764.8 -> 900 | 900 |

The row in between, with only the footer margin and no `<main>` growth, measured on `/tools/` @1440: the footer reached 900, but a white band opened between the cream `<main>` and the footer. That is why `<main>` grows.

On the 3 short rows the only box that changed is the body-child `<main>`, which now holds the spare height. A hash over every other element's rect above the footer is the same before and after. In a same-tab A/B on 404, with the rule switched off by an inline style, `MAIN` was the only element whose rect differed.

On all 20 tall rows (`/`, `/c/party/`, `/c/fortune/`, the 3 solo landings, the 4 `/tool/*` pages at both widths, and `/tools/` at 320), the footer top and bottom, the `scrollHeight`, the rects of every element above the footer, and the `#stage` rect are all identical before and after.

On the play route `/game/timebomb/play/` (control), the rects of every element are identical at both widths.

Every row has `scrollWidth == innerWidth` and exactly one `<footer>` on the pages that have one. On the short rows the bottom pixel row lies inside the footer. There were 0 console errors.

## Probes (driver, same ports): `probes-before.txt`, `probes-after.txt`

| Probe | Result |
|---|---|
| `stage-reserve-probe` | `pass: true` before and after. The 9 measured CLS rows match to 0.0002; love-match 1440 is 0.0045 vs 0.0043. The fail-leg control CLS varied between runs (0.2814, 0.2846, 0) |
| `narrow-overflow-probe` | 12 tool rows checked, 0 bad, before and after |
| `ad-reflow-first-list-load-probe` | `allPass: true`, 8 PASS, raw output identical before and after |
| `ad-slot-grid-probe` | 12 PASS and 5 FAIL both before and after, raw output identical. The FAILs pre-date this change: the calibration control, plus the wheel legs marked unmeasurable because the browser is not in reduced motion |
| `ad-slot-game-probe` | Same verdicts before and after. The 4 unmeasurable rows are stale targets (`short-stick` and `timebomb` have no landing). daily-fortune's transition numbers differ between runs, which I infer comes from its random draw |

On `/404.html` the top of `<main>` moves up (130.4 to 109 at one width, 105.4 to 84 at the other) because the body is now a flex container, so the h1 default margin no longer collapses through `<main>`. The 404 page has no styles of its own and `<main>` is transparent, so nothing visible moves: every rect outside `<main>` is identical before and after.
