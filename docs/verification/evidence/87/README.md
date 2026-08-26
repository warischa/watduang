# gh#87 evidence — direction C home page, measured in a real browser

Probe: `scripts/home-direction-c-probe.mjs` (committed, `scripts/driver.mjs` is the driver). Both
runs were real Chrome launches against the real `npm run build` served by `npx serve dist/ -l 4321`,
per `docs/agents/browser-verification.md` — every measured width reports `innerWidth` equal to what
was asked, so no run here is void.

| file | what it proves |
|---|---|
| `01-width-rail-normal-motion.json` | no sideways scroll at 320/390/1024/1440 (`scrollWidth === clientWidth`, zero elements past the viewport edge) · rail not rendered below the artboard's 1100px and rendered at 1440 · reserved slot heights measured (billboard 250, in-content 90, rail 600, pre-footer 250, border-inclusive in the rounded numbers) · the overflow detector went red on a deliberately overflowing element and clean again after its removal, on all four widths — the calibration the brief asked for · in the plain launch, decoration animation is genuinely running (positive control). |
| `02-reduced-motion.json` | the same run against Chrome launched with `--force-prefers-reduced-motion`: `matchMedia('(prefers-reduced-motion: reduce)').matches` true at every measured width, every decoration (stripes, badge pop, wheel, card bobs) reports computed `animation-name: none`, and `document.getAnimations()` is empty. |

## Rerun

```bash
npm run build && npx serve dist/ -l 4321 &
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --no-sandbox \
  --remote-debugging-port=9222 --user-data-dir=/tmp/cdp-prof-87 &
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --no-sandbox \
  --force-prefers-reduced-motion --remote-debugging-port=9223 --user-data-dir=/tmp/cdp-prof-87-rm &
node scripts/driver.mjs scripts/home-direction-c-probe.mjs          # normal motion -> 01
CDP_PORT=9223 node scripts/driver.mjs scripts/home-direction-c-probe.mjs  # reduced -> 02
```

The probe fails loud rather than lying: `overflowDetectorCalibration` must say
"red-then-clean on all four widths", and any width whose reported `innerWidth` differs from the
requested width voids that row.