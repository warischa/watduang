# gh#263 item 3: the "วิธีใช้" section on the tool boards, rendered for the owner

Captured 2026-10-06 from `file://` with headless Chrome 154 over raw CDP (port 9363, own profile, killed by pid
afterwards). Same method as `../../gh262-canvas/`: `mobile:false`, deviceScaleFactor 1, reduced motion, animations
off, `document.fonts.ready` awaited, JPEG q70, sliced in half with `magick -crop 100%x50%` when over 150KB.
Script: `capture.mjs`. Per-board output: `capture-result.json` (scrollWidth = clientWidth on all 4 boards; painted
face of the how-to h2 and of one other h2 on the same board, read with `CSS.getPlatformFontsForNode`).

Every image was opened and read by eye. Thai renders as glyphs, with no dotted circles.

## What changed on the boards

- **Wheel boards (edited):** neither drew the section. It is now drawn below the ad slot, where the page places it.
  - `ToolWheel390`: heading copied from the board's "วงล้อ" h2, Mitr 600 19px. Body is 16px / 1.65, the board's own
    body line.
  - `ToolWheelDesktop`: heading copied from the board's "ชื่อในวง" h2, Mitr 600 21px. Body is 16px (the board's
    textarea size) at 1.7, the board's body line height.
  - Ink `#14142b` and the 2px link underline are canvas D (ADR-0069). The block is the same one the number boards
    draw. The surrounding wheel boards still paint the pre-D ink `#1a1a1a`, and that was left alone.
- **Number boards (not edited):** both already draw the section. It was added by the gh#262 canvas commit, so the
  ticket's "no artboard draws it" is stale for them. 390 uses Mitr 600 19px, desktop uses Mitr 600 21px. They are
  rendered here so the owner sees all four side by side.
- Copy: the list items and the link text are byte-identical to the how-to section of each page (checked with a
  diff). Invented Thai: 0.

## Images

| Board | Section crop | Full board |
|---|---|---|
| `design/ToolWheel390.dc.html` | `ToolWheel390-howto.jpg` | `ToolWheel390.jpg` |
| `design/ToolWheelDesktop.dc.html` | `ToolWheelDesktop-howto.jpg` | `ToolWheelDesktop-part0.jpg`, `-part1.jpg` |
| `design/ToolNumber390.dc.html` | `ToolNumber390-howto.jpg` | `ToolNumber390.jpg` |
| `design/ToolNumberDesktop.dc.html` | `ToolNumberDesktop-howto.jpg` | `ToolNumberDesktop-part0.jpg`, `-part1.jpg` |

On all four boards the how-to h2 paints Mitr-SemiBold, the same face as the board's other h2. The face probe was
must-redded: forcing that h2 to `serif` made it read back Thonburi-Bold. The wheel boards throw the known
`ReferenceError: DCLogic is not defined` (no `support.js`), which does not block paint.

## Owner approval

APPROVED 2026-10-06 by owner popup on these renders: the how-to h2 takes Mitr 600, 19px on the 390 boards and 21px on the desktop boards, on both /tool/wheel/ and /tool/number/; the section link stays drawn. Code follows in the next src batch (ADR-0033).
