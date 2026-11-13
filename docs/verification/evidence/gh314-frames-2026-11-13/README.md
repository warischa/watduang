# gh#314 frames: pills and event card, measured in headless Chrome

Date 2026-11-13. Uncommitted working tree, `dist/` as already built (not rebuilt). Chrome 157 headless, real
emulated viewport via `session.setWidth` (each record carries `innerWidth`, checked equal to the requested width).
Height 800. Sampling is by bounding box and computed style of every pill; no point sampling.

## Commands

```
npx serve dist -l 4344 &
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --no-sandbox \
  --remote-debugging-port=9444 --user-data-dir=<session scratchpad>/chrome-9444 &
CDP_PORT=9444 BASE=http://localhost:4344 OUT=<this dir> node scripts/driver.mjs measure.mjs
```
`measure.mjs.txt` is the script (copy it to `measure.mjs` to run). Pids started: serve 80203, Chrome 80204, both killed; ports 4344 and 9444 confirmed free.

## Instrument proof
- Read-back at 375: title `วัดดวง — ดูดวง สุ่มคนโดน และเครื่องมือสุ่ม ฟรีบนมือถือเครื่องเดียว`, innerWidth 375, brand text `วัดดวง`.
- Must-red: `/game/prize-draw/play/` (no top bar; title `จับรางวัลปีใหม่ — จอใหญ่`) reports pillCount 0, so the
  count check reports it missing; the control page `/` reports 4. See `mustRed` in `measurements.json`.

## Result: 28 page x width records, 0 failures

Checks per record (all PASS on all 28): innerWidth equals requested; pill count 4; layout (2 rows x 2 columns
at <=639, 1 row at >=640, from distinct pill box tops/lefts); every label unclipped (`scrollWidth <= clientWidth`);
tap boxes do not overlap; 4th pill href `/c/company-party/` and text byte-equal to `งานเลี้ยงบริษัท`;
no horizontal page overflow (`scrollWidth <= innerWidth`).

| page | 320 | 375 | 639 | 640 | 1098 | 1099 | 1440 |
|---|---|---|---|---|---|---|---|
| `/` | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| `/c/party/` | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| `/c/company-party/` | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| `/game/prize-draw/` | PASS | PASS | PASS | PASS | PASS | PASS | PASS |

Tap-box clearance: at <=639 the `::after` reach (top -5px, height 44px) makes vertically adjacent tap boxes
touch exactly (min gap 0, overlap 0); at 640 to 1099 the min gap is 6px; at 1440 there is no `::after`
(computed position static) and the pill box itself is 45px tall, min gap 12px.

## Event card (`/c/company-party/`)

| width | art vs copy | h3 font-size |
|---|---|---|
| 320, 375, 639, 640, 1098 | art above copy | 22px |
| 1099 | art above copy (still stacked) | 22px |
| 1440 | art beside copy | 30px |

Note: the brief said the stacked layout applies "under 1099px" and 1099 is the unchanged desktop layout. The
code's media query is `max-width: 1099px`, so 1099 is still stacked with a 22px h3. Desktop layout starts at 1100.
This is a boundary-wording discrepancy, not a failure of the picked layout.

## Files
`measurements.json` (per record: every pill box, `::after` geometry, tap boxes, event geometry, per-check
booleans), screenshots `<page>-<width>.png` for 320, 640, 1440 (viewport only; `home-*` is `/`).

## Follow-up: is the event card visibly rendered? (`visibility.json`, `*-card-visible.png`)

Verdict: yes, once scrolled into view. The blank space in the first `c-company-party-320.png` and `-640.png`
is the page's own scroll-reveal, not a layout fault. Those screenshots were taken at the top of the page, while
the card was still below the fold.

Before scrolling, on `/c/company-party/` at 320, 640 and 1440 the card (`.game-card-event`) had computed
`opacity: 0`, `visibility: visible`, `transform: none`, `animation-name: none`, `transition-property: transform, box-shadow`.
The art `img` was loaded (`complete: true`, `naturalWidth: 273`, own opacity 1). The card and its section carry
`reveal-pending`. The responsible rule is `main .reveal-pending { opacity: 0 ... }` in `src/styles/web.css`.
`src/scripts/scroll-reveal.ts` adds the class to below-the-fold elements and adds `is-in` when they scroll in.

After `scrollIntoView` and a `getAnimations()` poll (0 left at once), the card read opacity 1, transform none, at all three widths.
The control `/c/party/` first game card read opacity 0.84 at 320 and 0.81 at 640 (mid-fade, still carrying
`reveal-pending is-in`; 1 at 1440). The poll cannot see this fade, which is not a Web Animation.

What the new screenshots show (the driver captured the full page, not only the viewport):
- `c-company-party-320-card-visible.png`: the lilac card with the lantern art above the copy, title `จับรางวัลปีใหม่`, text, and a yellow `เริ่มจัดงาน` button. Fully visible.
- `c-company-party-640-card-visible.png`: the same stacked card at full width, fully visible.
- `c-company-party-1440-card-visible.png`: the card with the art on the left and copy plus button on the right, fully visible.
- `c-party-320-card-visible.png`: the control; two game cards (the bomb and the fireworks) rendered.
Not opened: the 640 and 1440 control screenshots.
