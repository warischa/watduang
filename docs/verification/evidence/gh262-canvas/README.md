# gh#262 canvas boards: renders for the owner's pick

Captured 2026-10-06 from `file://` with headless Chrome 154 over raw CDP (port 9341, own profile, killed by pid
afterwards). Emulation: `mobile:false`, deviceScaleFactor 1, `prefers-reduced-motion: reduce`, animations disabled
by an injected style, and `document.fonts.ready` awaited before each capture. Captures are full height, cropped to
the board root, JPEG q70, and sliced in half with `magick -crop 100%x50%` when a capture was over 150KB.
Script: `capture.mjs`, per-board output: `capture-result.json` (innerWidth = board width and scrollWidth = clientWidth
on all 7 boards; painted h1 face read with `CSS.getPlatformFontsForNode`).

Every image was opened and read by eye. Thai renders as glyphs throughout, with no dotted circles.

## Images

| Image | Board | Finding |
|---|---|---|
| `ToolNumber390.jpg` | `design/ToolNumber390.dc.html` (new) | 1, 3, 8: number page buttons, h1, controls |
| `ToolNumberDesktop-part0.jpg`, `-part1.jpg` | `design/ToolNumberDesktop.dc.html` (new) | 1, 3, 8 |
| `NotFound320.jpg` | `design/NotFound320.dc.html` (new) | 6: the 404 page |
| `NotFoundDesktop.jpg` | `design/NotFoundDesktop.dc.html` (new) | 6 |
| `ToolWheel390.jpg` | `design/ToolWheel390.dc.html` (edited) | 2, 8: pre-spin result slot, 24px controls |
| `ToolWheelDesktop-part0.jpg`, `-part1.jpg` | `design/ToolWheelDesktop.dc.html` (edited) | 2, 8 |
| `Gh262Proposals-part0.jpg`, `-part1.jpg` | `design/Gh262Proposals.dc.html` (new) | proposals (a), (b), (c) |

The painted h1 face is Mitr-SemiBold on the 390 boards and Mitr-Bold on the desktop, 320 and proposal boards. The
two wheel boards throw `ReferenceError: DCLogic is not defined` because `support.js` is absent. That is a known
error and it does not block the static paint.

## Decisions taken while drawing

- **Palette.** Every new board, and the new block on the wheel boards, uses canvas D values (ADR-0069): ink
  `#14142b`, ground `#fff6e0`, tools `#2b7bff`, secondary `#3d3b5c`. The older tool boards still paint the
  pre-D trio. Only the structure and sizes are copied from them: h1 Mitr 600 26px at 390 or 700 38px on desktop,
  60/52px buttons at 390 and 64/56px on desktop, and the dark result block.
- **Chrome.** The number and 404 pages render the gh#255 page chrome, so these boards draw the HomeShelf top bar
  and footer, not the old tool back-link bar.
- **Literal colours, not `{{accent}}`.** That placeholder cannot resolve without `support.js`. The existing wheel
  boards' title band therefore renders with no accent fill. This is pre-existing and was left untouched.
- **Number desktop structure.** The board follows the sibling desktop tool boards: a band and a 940px column. The
  build today is one 34rem column with no band. This is a structural change for the owner to accept or refuse.
- **Proposed values with no sibling source:** disabled go button = opacity 0.4 with no shadow (number STATE 3).
  In the wheel (ii) variant, the content shift is 70px at 390 and 72px on desktop. These are the slot plus the gap,
  read from the board's own values.
- Wheel boards: the existing 18px checkbox was raised to 24px, so the board no longer contradicts its own
  controls row.

## Contrast table

Command (run from the repo root): `node docs/verification/evidence/gh262-canvas/contrast.mjs`. It applies the WCAG
2.x relative-luminance formula. Its output is saved in `contrast-output.txt`. Positive controls: black on white prints
21.00, and ink on gold prints 11.93 (the ADR-0069 figure). The two audit failures reproduce: 2.23 and 2.83.

| Row | Candidate | Pair | Ratio | Needs |
|---|---|---|---|---|
| (a) mark | current | `#ffcc00` on `#ff3d7f` | 2.23 FAIL | 3.0 (large) |
| (a) | **A rec**: ink text on a gold chip with a 3px ink border. It keeps the gold emphasis with the widest margin; at 320 the chip takes its own line | `#14142b` on `#ffcc00` (border `#14142b` vs `#ff3d7f` 5.35) | 11.93 | 3.0 |
| (a) | B: ink text on pink | `#14142b` on `#ff3d7f` | 5.35 | 3.0 |
| (a) | C: white text on pink, gold underline | `#ffffff` on `#ff3d7f` | 3.37 | 3.0 |
| (b) ad label | current | `#9a947a` on `#fff6e0` | 2.83 FAIL | 4.5 |
| (b) | **A rec**: canvas D secondary text, already a D value | `#3d3b5c` on `#fff6e0` | 9.86 | 4.5 |
| (b) | B: same hue, darkened (`#9a947a` scaled until it reached at least 4.6) | `#75705d` on `#fff6e0` | 4.61 | 4.5 |
| (b) | C: ink | `#14142b` on `#fff6e0` | 16.75 | 4.5 |
| (c) fortune h2 | current 15px / A 16px / **B 18px rec**: the only size that reads above the 16px body | `#3d3b5c` on `#fff6e0` | 9.86 (all three) | 4.5 |

## [NEW COPY]

None. Every Thai string on the new boards is verbatim from `src/pages/tool/number.astro`, `src/tools/number.ts`,
`src/pages/404.astro`, `src/pages/tool/wheel.astro`, the HomeShelf boards, the fortune category's `listHeading`, or
the daily-fortune module. "ได้: 7", "เหลือ 9 จาก 10 ค่าในรอบนี้" and the range-error note are the page's own
templates with sample values. All variant and state labels are English design annotations.

## Not covered

- No board was compared with the built pages pixel for pixel. The built references are the gh#262 audit and its `addendum-taps`.
- Google Fonts came from the CDN at capture time, while the site self-hosts only Mitr and Sarabun.
- The proposal row (a) is drawn at 320 only. The ratio does not depend on size, but the desktop layout of the chip
  was not drawn.
