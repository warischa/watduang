# gh#254 — link targets under 24px tall

Fix: invisible vertical padding (`padding-block`) on inline links, `min-block-size: 24px` on the two
flex back links. No visible change by construction; measured below. Base `def4563` (Mitr self-hosted).

Environment: `npm run build`, `npx serve dist/ -l 4371`, headless Chrome 154 (`--headless=new`),
CDP 9371, own profile dir. Widths set with the driver (`Emulation.setDeviceMetricsOverride`), so the
layout genuinely reflows; every capture reported `innerWidth` equal to the width asked for.

## 1. Must-red (unchanged build)

`W=320|1440 PAGES=<11 pages> node scripts/driver.mjs docs/verification/evidence/ui-audit-2026-10-04/ui-audit-probe.mjs`
→ `audit-before-320.json`, `audit-before-1440.json`. Pages: `/`, `/c/party/`, `/c/fortune/`, `/tools/`,
`/tool/wheel/`, `/game/siamsi/`, `/tool/number/`, `/tool/draw/`, `/tool/team/`, `/game/daily-fortune/`,
`/game/love-match/` (n=11 pages x 2 widths).

Before: every target group under 24px. After the fix the same probe lists no link under 24px
(`audit-after-*.json`); what remains in `under24` is 3 inputs on `/tool/wheel/` and 1 on
`/tool/number/` (13px, out of scope per the brief), at both widths.

## 2. Height per target group (px, `heights.json`; n = links in the group)

| Target | page(s) | width | before | after |
|---|---|---|---|---|
| GameNav link list (`nav li a`) | wheel, number, draw, team (n=14 each); siamsi, daily-fortune, love-match (n=16 each) | 320, 1440 | 21 | 25 |
| all-tools link (`#how-to-use p a`) | wheel, number, draw, team | 320, 1440 | 21 | 25 |
| category breadcrumb (`.breadcrumb a`) | `/c/party/`, `/c/fortune/` | 320, 1440 | 18 | 26 |
| game topbar back link | siamsi, daily-fortune, love-match | 320, 1440 | 18 | 24 |
| `.tool-back` (draw, team) — found by the audit, not in the brief's list | draw, team | 320 only (hidden at 1440) | 18 | 24 |
| `.tool-breadcrumb a` (draw, team) — found by the audit, not in the brief's list | draw, team | 1440 only (hidden at 320) | 22 | 26 |

`links-before.json` / `links-after.json` hold every sub-24 link per page and width, with its parent
and display. After: none under 24 on any of the 11 pages at either width.

The `.tool-breadcrumb a` carries a 2px border-bottom drawn after a 2px bottom padding, so it takes
top padding only: adding bottom padding would move the rule. The pixel diff below is 0 there.

## 3. No visible change

Full-page screenshots (`captureBeyondViewport`), 11 pages x 2 widths = 22 files, before vs after,
decoded and compared per pixel by `pngdiff.mjs`: **0 differing pixels in 22 of 22**
(`pixeldiff-before-vs-after.txt`). CSS animations are frozen for the screenshot only: unfrozen, two
baseline captures of `/` differ by 21296 px at 320 and 25228 px at 1440 (the home page's own motion),
which is the red that shows the diff tool sees pixels. Frozen, baseline vs baseline is 0
(`pixeldiff-baseline-vs-baseline.txt`). Screenshots are not committed (large).

## 4. Overflow, overlap, mis-tap guards

- Horizontal overflow at 320: `scrollWidth === clientWidth` and `over === 0` on all 11 pages, before and
  after (`links-before.json`, `links-after.json`).
- `overlap-after.json`: no link's box overlaps another interactive element's box on any of the 11 pages
  at either width (0 pairs), so the added padding takes no tap from a neighbour.
- `scripts/gamenav-again-grid-probe.mjs` and `scripts/gamenav-start-grid-probe.mjs`: **could not
  produce evidence, before or after.** Both are marked stale by gh#149 (they drive pages that no
  longer carry their targets). On the unchanged build, `GAME_ID=siamsi`: the again probe threw
  `Cannot read properties of null (reading 'click')`, the start probe found `boxCount: 0` and threw on
  `#start-round`; no built page contains `id="start-round"`. The overlap check above is the stand-in,
  and it is not the same instrument: it covers link-versus-interactive overlap, not a tap-transition.

## 5. Fast lane

`SMOKE_PORT=4371 SKIP_EXPENSIVE=1 bash scripts/run-workflow-gates.sh`: declared=48 executed=44
failed=0 not-executed=2 (the two SKIP_EXPENSIVE steps, by design) not-runnable-here=2; exit 2 by design.

## Instruments (this directory)

`capture.mjs` (link boxes, overflow, screenshots), `heights.mjs`, `overlap.mjs`, `pngdiff.mjs`.
