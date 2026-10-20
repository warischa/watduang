# gh#281 box 1: the board paints freeze-tap's pass screen under the 56px band (2026-10-20)

Board: `design/Gh281FreezeTapReady.dc.html`, one static proposal sheet (same convention as `design/PlayTopBand.dc.html`: not registered in `design/canvas.json`, PNGs gitignored and present for owner review, the board file is the committed artifact). Pending owner approval of ONE of A, B, C; no `src/**` touched. Ticket: gh#281 (title begins "280 --").

**What pushes the button down.** Stack at 320 x 568, all read from route CSS at the phone breakpoint (`style.css` S, `overrides.css` O), not from a build: band 56 (shell) -> `#app` is 512 tall -> header 69 (padding-block 12 x2 + `.icon-btn` 44 floor + 1px border; S/O) -> `main` padding-block 8 (O gh#182) -> turn badge -> `.pass-player-card` (padding-block 12, "ส่งโทรศัพท์ให้", name at 2.8rem, `.pass-condition-box` with title, 54px target badge, prompt, warn pill) -> hint line -> button 60. Content ends 48px past the viewport on the tallest draw, 21px past on the other seven. The tallest draws are SYMBOL_STAR and SYMBOL_CIRCLE (draws 7 and 8): the star and circle glyphs widen the prompt, so it wraps to 3 lines where the 43-45 character Thai-only prompts stay on 2.

**Fidelity.** The frames replay the route's own markup and CSS, with the route's own font: the self-hosted Sarabun subset from `src/styles/fonts.css`, pointed at from the board by relative path (first attempt used the OS font and wrapped three Thai-only draws that the page does not wrap; fixed, because the wrap is the variable). Control vs box 3, all nine draws: button top/bottom match to 0.00px on every draw (529/589 on seven, 556/616 on draws 7 and 8), and the control reads 12 visible px of 60, box 3's 12. Player count 4 and first seat (แมวส้ม) are the route's defaults. Fit is NOT drawn for: the sudden-death turn badge (`⚔️ รอบดวลตัดสิน SUDDEN DEATH`) and long typed names, both wrap more than the defaults; the runner measured the button 76px tall once (text wraps), so slack below is listed.

| frame | what moved / shrank | button top / bottom (tallest draw) | slack below 568 | worst of 9 draws |
|---|---|---|---|---|
| today (control) | nothing | 556 / 616 | -48 (FAILS, 12px visible) | 616 |
| A squeeze | nothing removed or moved; header padding 12 -> 4 (44px icon floor stays); stack gap 8 -> 6; card padding-block 12 -> 8; name 2.8rem -> 2.2rem, emoji 2.4rem -> 2rem; condition box margin-top 4 -> 2, padding-block 8 -> 6, gap 3 -> 2; target badge 54 -> 44, glyph 1.6rem -> 1.3rem, its margin-bottom 4 -> 0; prompt 1.25rem -> 1.1rem, line-height 1.35 -> 1.3 | 476.86 / 536.86 | 31.14 | 536.86 |
| B restructure | sizes as shipped; header padding 12 -> 6; gap 8 -> 6; turn badge moves into the card on the "ส่งโทรศัพท์ให้" line (its own row is gone); target badge (44px) sits left of the prompt, the prompt left-aligned beside it | 474.5 / 534.5 | 33.5 | 548 (COLOR_YELLOW wraps the narrower prompt column; 20px slack) |
| C pin | no size changes; `#playerReadyBtn` is `position: sticky; bottom: 0` in the route's own scrolling `main`, which keeps its 8px bottom padding, so it rests 8px above the viewport bottom | 500 / 560 | 8 | 560 on every draw, by construction |

C's cost, visible in `variant-C.png`: the card scrolls under the button, so the warn pill is partly covered and the hint line is hidden until the player scrolls. That is the one candidate where the player can press ready without having seen the whole card. A is the fragile one: it holds 31px of slack on the Mac, but a longer name or the sudden-death badge eats it. B is the structural middle.

**New values (every one is NEW unless marked).** A: header padding-block 4 (why: header drops 69 -> 53, the icon floor holds), gap 6 (the 6px step the shell controls use; canvas), card padding-block 8 (route: main's own padding-block), name 2.2rem and emoji 2rem (why: the name line was the largest single text block), condition box 2/6/2, target badge 44 (canvas: tap-floor size, though the badge is decorative) and glyph 1.3rem, prompt 1.1rem / line-height 1.3. B: header padding-block 6, gap 6, the 44px badge column and 12px column gap of the condition box (44 canvas; 12 is the route's own badge padding-inline). C: `position: sticky; bottom: 0` only. Band, X, pill, colours, copy are the shipped ones. Invented Thai: 0 (every string is verbatim from `main.js`, `markup.html`, `PlayExit.astro`).

**Board check, browser-measured** (`board-check.json`, from `render-and-check.mjs` in this directory; Chrome on CDP port 9321, own temp profile, killed by pid, port confirmed free). Per frame: the ready button's box in the frame's own coordinates vs band bottom 56 and viewport 568, and the button's centre must be what `elementFromPoint` hits. Pass = top >= 56 and bottom <= 568 and centre hits. Result: A, B, C pass on the painted draw AND on all nine draws (draws read from `main.js`, not copied); today FAILS (bottom 616; 7 of 9 draws at 589, 2 of 9 at 616), which is the must-red. An earlier run read the candidates as failing for the wrong reason: the 900px window made `elementFromPoint` blind below it, so the check now grows the window to the sheet first.

| artboard | viewport | PNG | px |
|---|---|---|---|
| sheet | 1440 wide | `sheet.png` | 2880x2268 |
| today (control) | 320x568 | `today.png` | 640x1136 |
| A squeeze | 320x568 | `variant-A.png` | 640x1136 |
| B restructure | 320x568 | `variant-B.png` | 640x1136 |
| C pin | 320x568 | `variant-C.png` | 640x1136 |

PNGs are deviceScaleFactor 2, rendered headless from `file://`. The only console message is `net::ERR_FILE_NOT_FOUND` for `./support.js`, which every board references and the repo does not contain.
