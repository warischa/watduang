# gh#263: 44px touch target for the chrome pills, the chrome brand and the siamsi intent chips

Status: **APPROVED 2026-10-13 — variant B for both groups** (see § Owner approval). Board drawn on owner ruling, gh#263 comment 6137191163, 2026-10-13: "board first" for these three groups; ADR-0033, audit, owner picks, canvas, code).

## What is drawn

`design/Gh263TargetProposals.dc.html`, two rows, each in four 320px artboards (each artboard carries `data-variant` and `data-group`):

| Group | Artboards |
|---|---|
| (a) Chrome top bar: brand "วัดดวง" and the three pills | `current`, `A`, `B`, `B-outline` |
| (b) Siamsi intent chips under "เรื่องที่อยากถาม" (wrapped into rows at 320) | `current`, `A`, `B`, `B-outline` |

- **Current**: values as live. **A**: the element itself reaches 44px (`display: inline-flex; align-items: center; min-height: 44px`, plus `box-sizing: border-box`; the brand takes `min-height: 44px` only, keeping its alignment), so the bar or the row grows. **B**: the visible element is unchanged and gets `position: relative` plus an `::after` (`content: ""; position: absolute`) as the hit box. `B-outline` is the same with `outline: 2px dashed #d6336c` on the `::after`.
- B insets: pills `inset: -5px 0` (34 to 44), brand `inset: -2px 0` (41 to 45), chips `inset: -7px -2px`. The chip differs because an absolute box is placed against the padding box and the chip has a 2px border, so `-5px` would reach only 40px; `-7px` puts the box 5px beyond the border edge.
- On the chips, wrapped rows sit 8px apart, so the two 5px extensions overlap by 2px; the outlined chips board shows it.

## Where each value comes from

- Brand, pills, bar padding, pill colours and Thai text: the top bar of `design/HomeShelf320.dc.html`; live values cross-read in `src/components/PageChrome.astro` at max-width 1099px (pill `padding: 6px 12px`, gap 6px, brand 26px). The board bar is a column with items at the start, as live, so the brand is a block-level box.
- Chips, label and Thai text: the chip row of `design/SiamsiIntent.dc.html` (`font-size: 14px; border: 2px solid; border-radius: 999px; padding: 6px 14px`, row `flex-wrap: wrap; gap: 8px; justify-content: center`); live values cross-read in `src/styles/games/siamsi.css`. Panel ground `#ffd27f` is the board's default accent.
- Outline colour `#d6336c`, the variant rules above: the brief for this board. Invented Thai: 0.

## How to run the capture

From the repo root. Start Chrome on port 9364 with its own profile, run the script, then tear down by pid:

```
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CH" --headless=new --remote-debugging-port=9364 --user-data-dir=/tmp/gh263-targets-profile --no-first-run about:blank &
CHROME_PID=$!
sleep 2
node docs/verification/evidence/gh263-canvas/targets/capture.mjs
kill $CHROME_PID
lsof -i :9364   # empty output = port free
```

The script writes `capture-result.json` and one JPEG per artboard (`<group>-<variant>.jpg`) into this directory. Per target it records the border box from `getBoundingClientRect`, the claimed hit box, and the hit box measured with `document.elementFromPoint`: a grid inset 1px from the claimed box (any sample landing on a neighbour is listed) and a 0.5px scan through the centre giving the tappable height and width actually found. Per artboard it records the row count and the claimed-box overlap between wrapped rows.

## Numbers

Captured 2026-10-13 10:02 local, headless Chrome on port 9364 with its own profile, torn down by pid, port confirmed free. Every JPEG was opened and read by eye: Thai renders as glyphs, no dotted circles, nothing clipped. Per target: border box → claimed hit box / tappable height found by the centre scan.

| Group | Current | A, visible 44 | B, invisible hit area |
|---|---|---|---|
| Chrome brand "วัดดวง" | 41 → 41 / 41.5 | 44 → 44 / 44.5 | 41 → 45 / 45.5 |
| Chrome pills (3) | 34 → 34 / 34.5 | 44 → 44 / 44.5 | 34 → 44 / 44.5 |
| siamsi chips (5) | 37 → 37 / 37.5 | 44 → 44 / 44.5 | 37 → 47 / 47.5 (ความรัก 45) |

- The board's chips draw 37px, not the site's 34px: the board face is Noto Sans Thai and the site's is Sarabun, the same content-area gap the game-nav board recorded. On the site, B's `inset: -7px -2px` gives 34 + 10 = 44.
- B on the wrapped chip row: the two rows' hit boxes overlap by 2px (`overlap=2` in `capture-result.json`), which is why "ความรัก" measures 45 instead of 47.
- The `neighbour-samples` counts in `capture-result.json` include the target's own child text nodes, so they are not a collision count. Use `tappable` and `overlap`.

## Owner approval

APPROVED 2026-10-13 by owner popup on these renders, variant **B** for both groups. The visible pill, brand and chip are unchanged, and the hit area reaches 44px through a transparent `::after`: pills `inset: -5px 0`, brand `inset: -2px 0`, chips `inset: -7px -2px`. The 2px chip-row overlap is accepted. The chrome rule applies at max-width 1099px only, since above that the pills and brand already clear 44px (under-44 probe, 1440). The code ships in the same batch.
