# gh#248 — ink text on the tools tiles and the hero lead line

Owner ruling: the home page's tools tiles and the hero lead line take ink `#14142b` instead of white.
The h1 highlight "ใครโดน" stays gold (it is the one remaining formal contrast failure, ruled out of scope).

Instrument: `docs/verification/evidence/ui-audit-2026-10-04/ui-audit-probe.mjs` through
`scripts/driver.mjs`, against `npm run build`, served on 4331, headless Chrome (CDP 9331). The probe's
header says what it counts: every element with its own visible text, computed colour against the first
opaque ancestor background, large text = 24px, or 18.66px at weight 700.

```bash
BASE=http://localhost:4331 CDP_PORT=9331 W=<320|1440> PAGES=/,/c/party/,/c/fortune/ \
  node scripts/driver.mjs docs/verification/evidence/ui-audit-2026-10-04/ui-audit-probe.mjs > <out>.json
```

n = 1 run per cell (3 pages x 2 widths, 6 cells per side); the numbers are deterministic computed styles.
`before-*.json` = unchanged tree (red), `after-*.json` = after the change.

| Page | Width | Contrast failures before | after |
|---|---|---|---|
| `/` | 320 | 7 | 2 |
| `/` | 1440 | 7 | 2 |
| `/c/party/` | 320, 1440 | 0 | 0 |
| `/c/fortune/` | 320, 1440 | 0 | 0 |

Before, `/` at 320: the lead (3.37:1), four tool names `h3.name` (3.90:1), the h1 highlight, the ad label.
Before, `/` at 1440: the lead, four tool descriptions `p.desc` (3.90:1), the h1 highlight, the ad label.
After: only the h1 highlight `span.mark` (2.23:1, gold on pink, out of scope) and the ad placeholder
label `div.wrap.ad-slot` (2.83:1, out of scope) remain, at both widths.

Changes: `TextTile.astro` (`.tile[data-kind='tool']` colour `--ink`), `HomeHero.astro` (`.lead` colour
`--ink`), the `--ink-light` comment in `src/styles/tokens.css` (value untouched, it is shared), and the
canvases `design/HomeShelfDesktop.dc.html` and `design/HomeShelf320.dc.html` (4 tool tiles, the lead
line and the two nav pills each, 7 inline colours per file; the h1 and h2 stay white).
