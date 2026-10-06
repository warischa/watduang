# gh#263 items 2 and 3 in code — computed-style read-back

Approvals recorded 2026-10-06 in `../gh263-canvas/love-match/README.md` and `../gh263-canvas/how-to/README.md` (ADR-0033).

- Time labels below are one source for both rows: the probe start time written into each JSON as `builtAt` (the field name is the probe's; it is not a build time). The dist directory's own mtime was not recorded and later builds overwrote it.
- `before.json`: `npm run build` at commit 5affab1 (no src edit yet), served on 4461, Chrome over CDP 9361; probe start 2026-10-06T09:33:29.028Z.
- `after.json`: same build command on the edited working tree, before the reserve re-measure below; probe start 2026-10-06T09:33:54.359Z.
- `probe.mjs`: the one probe used for both. 390 = mobile emulation, 1440 = desktop emulation; never `--window-size`. n=1 per cell, 0 page exceptions in both runs.
- Love-match outcomes are reached by pinning `Math.random` in the page (0.1 = meet, 0.9 = self), then clicking the open control after the arm window.

| read | before | after |
|---|---|---|
| `#how-to-use h2` family, wheel and number, 390 and 1440 | Sarabun-Bold (UA default) | Mitr-SemiBold (platform font) |
| same, weight / size at 390 | 700 / 24px | 600 / 19px |
| same, size at 1440 | 24px | 21px |
| love-match ask `.lm-heading` (has `lm-heading--ask`) | 24px / 33.6px | 30px / 36px |
| love-match meet and self `.lm-heading` | 24px / 33.6px | 26px / 35.1px |

Not covered: no screenshot comparison against the boards, and no widths between 390 and 1440 (the 1100px breakpoint edge itself was not sampled).

## Reserve re-measure (REFUTE spot-fix: the ask title grew, so the declared first-screen reserve is stale)

Method: `../gh253/stage-heights-probe.mjs`, the same widths as gh#253 (320 to 1440), n=1, Mitr `loaded`. `stage-heights-old.json` is a build with the love-match css and ts at HEAD; `stage-heights-new.json` is the edited tree.

| width class | old (reproduces gh#253: 578.8 / 526.8 / 517.2) | new | delta |
|---|---|---|---|
| 320 to 560 (phone) | 578.8 | 581.2 | 2.4 |
| 639 | 526.8 | 529.2 | 2.4 |
| 640 to 1440 (wide) | 517.2 | 519.6 | 2.4 |

Declared `firstScreenReserve` goes from 579 / 517 to 581 / 520 (same rounding as gh#253). `stage-reserve-probe.json` is `scripts/stage-reserve-probe.mjs` on the final build: pass true, 0 failures; love-match CLS 0.0044 (1440x900), 0.0071 (768x900), 0 (390x844). The probe's deliberate failure leg (aborted chunk) reads 0.2846 by design.
