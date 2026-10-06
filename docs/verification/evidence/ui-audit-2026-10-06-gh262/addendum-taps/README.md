# gh#262 addendum: canvas positive control + post-interaction states

Captured 2026-10-06 on a clean tree at d2458a0 (`git status --short` empty before the build), after `npm run build` (rc 0).
Served with `npx serve dist/ -l 4421`; headless Chrome 154 (`--headless=new --disable-gpu`, CDP 9321, own profile dir).
n = 1 run per state (one spin, one press). Nothing here measures run-to-run variance.

## Part 1: do the canvas artboards render from file://? (`part1-canvas-control.mjs`, `part1-result.json`)

Verdict: RENDERS, with a script error on one of the two. `design/support.js` does not exist, and the 404 is real.

| artboard | width (innerWidth) | body elements | body text length | h1 painted face (CSS.getPlatformFontsForNode) | console / network |
|---|---|---|---|---|---|
| ToolWheel390 | 390 (390) | 86 | 580 | Mitr-SemiBold (13 glyphs, custom font) | `net::ERR_FILE_NOT_FOUND .../design/support.js`; `ReferenceError: DCLogic is not defined` at ToolWheel390.dc.html:156 |
| HomeShelf320 | 320 (320) | 197 | 2544 | Mitr-Bold (24 glyphs, custom font) | `net::ERR_FILE_NOT_FOUND .../design/support.js` only |

Screenshots (read by eye, both non-blank, correct layout): `part1-ToolWheel390-390.jpg`, `part1-HomeShelf320-320.jpg`.
Static markup paints fully without support.js. Anything support.js (or `DCLogic`) would drive at runtime is NOT shown, so artboard interactivity is broken.
The wheel artboard's script error means its spin logic never ran. Its pre-drawn result bar "โดน: แก้ม" is static markup.
Trap: `Emulation.setDeviceMetricsOverride` with `mobile:true` gave innerWidth 980 on the wheel artboard (no viewport meta). Use `mobile:false` for artboards.
Scope: 2 of 39 `.dc.html` files that reference `./support.js`. The other 37 were not opened.

## Part 2: post-interaction states, reduced-motion on (`part2-taps-driver.mjs`, `part2-result.json`)

Reduced motion set with `Emulation.setEmulatedMedia`; `matchMedia` read back `true` in every row. Interactions are real touch taps via `scripts/driver.mjs` `session.tap`.
Wheel setup: four names (แก้ม บีม นุ่น ต้น) typed into `#name-input`, then tap `#name-start`, then tap `#wheel-spin`. No horizontal overflow in any row (scrollWidth = clientWidth).

| tool | width | state | box (w x h px) | text | color / bg | face painted |
|---|---|---|---|---|---|---|
| wheel `#wheel-result` | 320 | before spin | 288 x 60 | (empty) | rgb(255,246,224) on rgb(20,20,43) | none (no glyphs); computed Mitr 26px/700 |
| wheel `#wheel-result` | 320 | after 1 spin | 288 x 60 | ต้น | same | Mitr-Bold |
| wheel `#wheel-result` | 1440 | before spin | 544 x 60 | (empty) | same | none; computed Mitr 26px/700 |
| wheel `#wheel-result` | 1440 | after 1 spin | 544 x 60 | แก้ม | same | Mitr-Bold |
| number `#number-result` | 320 | before press | 288 x 48 | (empty) | rgb(20,20,43) on transparent | none; computed Sarabun 24px/700 |
| number `#number-result` | 320 | after 1 press | 288 x 48 | ได้: 9 | same | Sarabun-Bold |
| number `#number-result` | 1440 | before press | 544 x 48 | (empty) | same | none; computed Sarabun 24px/700 |
| number `#number-result` | 1440 | after 1 press | 544 x 48 | ได้: 4 | same | Sarabun-Bold |

Observations:
- Both boxes reserve their height while empty (wheel 60px, number 48px). The wheel's is a solid dark bar showing nothing before the first spin.
- The wheel result is the bare name. The canvas artboard's static bar reads "โดน: <name>".
- The result text is Mitr on the wheel and Sarabun on number.
- Result values (ต้น / แก้ม, 9 / 4) are random draws; do not compare them across rows.

Screenshots (clipped to the tool's section, JPEG q70, all under 40KB): `wheel-{before,after}-{320,1440}.jpg`, `number-{before,after}-{320,1440}.jpg`.

## NOT covered
- /tool/draw/ and /tool/team/ (not requested).
- Mode B (press-to-stop) of the wheel; reduced motion collapses it into A anyway. Motion-on states.
- Elimination mode and the all-out round-over message.
- Number no-repeat mode and the range-error states.
- Any viewport other than 320 and 1440. Real iOS WebKit.
- The 37 other artboards.
- Variance: n = 1 per state.
