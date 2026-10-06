# gh#263 item 2: love-match heading boards, renders for the owner

Captured 2026-10-06 from `file://` with headless Chrome 154 over raw CDP (port 9362, own profile, killed by pid
afterwards). Method copied from `../../gh262-canvas/README.md`: `mobile:false`, deviceScaleFactor 1,
`prefers-reduced-motion: reduce`, animations disabled, `document.fonts.ready` awaited, full height cropped to the
board root, JPEG q70. All three captures are under 150KB, so none was sliced. Script: `capture.mjs`. Per-board output:
`capture-result.json` (scrollWidth = clientWidth = 390 on all 3; the heading element's computed size, box, line count
and painted face from `CSS.getPlatformFontsForNode`).

`support.js` is absent, so the script swaps `{{accent}}` for the boards' default accent `#ffd27f` in the DOM before
capture. That is why the ground is filled here and was not in the gh#262 renders. The board files are unchanged by
this. `ReferenceError: DCLogic is not defined` is the known missing-`support.js` error and does not block the paint.

Every image was opened and read by eye. Thai renders as glyphs with no dotted circles, and no heading is clipped
(heading scrollWidth = clientWidth on all 3).

## One heading per state

| Image | Board | Game state | Heading (verbatim, `src/games/love-match.ts`) | Drawn value | Painted face |
|---|---|---|---|---|---|
| `SoulmateStart.jpg` | `design/SoulmateStart.dc.html` | ask screen | `เนื้อคู่ของคุณ` | Mitr 500 30px / 1.2, 1 line | Mitr-Medium |
| `SoulmateResult.jpg` | `design/SoulmateResult.dc.html` | reading, `kind: 'meet'` | `คุณจะได้เจอเขา` | Mitr 500 26px / 1.35, 1 line | Mitr-Medium |
| `SoulmateSolo.jpg` | `design/SoulmateSolo.dc.html` | reading, the self branch | `เนื้อคู่ของคุณคือตัวคุณเอง` (`SELF_VARIANTS` entry 0) | Mitr 500 26px / 1.35, 1 line | Mitr-Medium |

## What changed on the boards

- Both result boards ALREADY drew a heading at Mitr 500 26px / 1.35, but with copy the game does not render.
  Result had `คุณจะเจอเขา` plus `ตอนอายุ 31` in one element. Solo had `ชาตินี้ดวงให้คุณ` plus `เป็นของตัวเอง`, which is in no
  variant. Only the copy was replaced. The 26px / 1.35 value is the canvas's own and was kept.
- Result: the heading and the when line are now two elements, as the game renders them. The when line uses the game's
  template with the sample age 31 and keeps the board's existing style for that line. **Unruled:** the when line's 26px / 1.35 is only the board's existing style. The owner's 2026-10-06 approval names `.lm-heading` only. Live `.lm-when` is 20px, so the when line is not an approved value until the owner rules on it.
- Solo variant pick: rendered width at Mitr 500 26px, measured in the same Chrome. `เนื้อคู่ของคุณคือตัวคุณเอง` 287px,
  `ดวงบอกว่าคุณเต็มอยู่แล้ว` 281, `รอบนี้ดวงไม่ได้พาใครมา` 258, `รอบนี้ยังไม่มีชื่อใคร` 206. String length was not used. These four widths were measured once (n=1) and not saved: `capture.mjs` and `capture-result.json` carry only the 287px.
- A `data-lm-heading` marker was added to the heading element on all three boards. It is the capture script's hook and
  carries no style.

## Why the result value differs from the ask screen's 30 / 1.2

The widest self heading is 287px at 26px and 331px at 30px. The board column at 390 is 350px, so neither size wraps
here. At 320 with the same 20px padding the column is 280px, and the 26px heading wraps to two lines (by
arithmetic from the measured width; no 320 board was drawn). A 1.35 line height is the value that keeps that second
line apart, where 1.2 is sized for the ask screen's one short line. The live class is 24px / 1.4, which matches neither
board, so the shared class needs a value per state.

## Copy drift left in place (out of scope, for a later ticket)

Result: the kicker `ดวงบอกว่า` has no counterpart in the game. Solo: the body and closing lines differ from the game's
`SELF_VARIANTS[0].body` and closing line. Start: the subtitle, question labels and button text differ from `renderAsk`.

## Not covered

No board was compared with the built page. Google Fonts came from the CDN at capture time. No 320 board was drawn.

## Owner approval

APPROVED 2026-10-06 by owner popup on these renders: `.lm-heading` takes 30px / 1.2 on the ask screen (SoulmateStart) and Mitr 500 26px / 1.35 on the meet reading (SoulmateResult) and the self reading (SoulmateSolo). Code follows in the next src batch (ADR-0033).
