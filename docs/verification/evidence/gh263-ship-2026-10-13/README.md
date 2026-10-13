# gh#263: touch targets, wheel ground, love-match when line — shipped batch, 2026-10-13

Owner rulings: gh#263 comment 6137191163 (unblock round), and variant B for the chrome and the siamsi
chips as recorded in `../gh263-canvas/targets/README.md` § Owner approval

Every number below comes from a fresh `npm run build` of the working tree, served with `npx serve dist/ -l 4461`. Each was measured in headless Chrome on CDP port 9361 with its own profile, torn down by pid, ports confirmed free. n=1 run each.

## Files

| File | What |
|---|---|
| `run-under44.sh` | build + serve + Chrome + `../gh263-under44/ui-under44-probe.mjs` at 320 and 1440 + teardown (`OUT_DIR` required, outside the repo) |
| `count.js` | groups a probe output dir by component (`node count.js <dir>`) |
| `under44-{320,1440}-before.json` | probe output at `05c2a89` (before), identical in total to the `b8d3bcc` set in `../gh263-under44/groups.md` |
| `under44-{320,1440}-after.json` | probe output on the final tree |
| `lm-when-probe.mjs` / `lm-when-result.json` | `.lm-when` size, line count and overflow on the meet screen; `/tool/wheel/` body ground |
| `hit-area-probe.mjs` / `hit-area-result.json` | tappable height measured with `elementFromPoint` (vertical scans at the centre and 3px in from each side, 0.5px steps; minimum reported), an in-page must-red that switches the `::after` off, GameNav links as a control, game topbar overflow |
| `topbar-probe.mjs` | game topbar height now vs. the old link rule restored in-page |

## Result

- Under-44 rows at 320: 155 → 41. At 1440: 123 → 9. All GameNav rows (`nav.game-next`, `nav.*-next`, 104 per width) and all single-link rows (10 per width) are now 0. The rows left are the chrome pills (24), brand (8) and siamsi chips (5), whose drawn boxes deliberately stay 34 / 41 / 34px (board B). The rest are the 24px checkbox inputs, whose label rows already give an effective 44–48px.
- Hit areas (board B): pills 34px box → 44.5px tappable (must-red with `::after` off: 19.5–20.5); brand 41 → 45.5. siamsi chips at 1440: 44.5. **siamsi chips at 320, top wrapped row: 42**: the lower row's extension paints over the 2px overlap the owner accepted on the board. The bottom row measures 44.5. GameNav control links: 44 → 44.5.
- The minimum-over-columns scan reads a rounded pill's end columns low: desktop chrome pills (45px box, no `::after`, unchanged by this batch) read 23.5. That is the instrument's corner sampling, not a regression. The under-44 probe's box measure is the comparable number there.
- `/tool/wheel/` body: `rgba(0, 0, 0, 0)` → `rgb(255, 246, 224)` at 320 and 1440, the same as the other tool pages.
- `.lm-when` at 26px / 35.1px line height: one line at 320 and 1440. The widest string measured is "อีกประมาณ 2 ปีจากนี้", 233px inside a 280px parent at 320. Other digits were not sampled; they are inferred to be the same width.
- Game topbar: 86px tall at 320 and 1440 both with the new 44px link and with the old rule restored in-page, so the link change moves nothing. No horizontal overflow at 320 on siamsi, love-match or daily-fortune.

## Not covered

Real-device touch (gh#141 standing queue), first-mount CLS beyond what `scripts/stage-reserve-probe.mjs` gates, any page outside the under-44 page set.
