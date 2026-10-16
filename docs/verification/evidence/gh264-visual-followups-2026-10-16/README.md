# gh#264 visual notes V1-V4, measured at TIP and BASE (2026-10-16)

TIP = worktree integrate, branch gh264-integrate @ 95f9834. BASE = main tree @ 9e80516 (src/, public/, astro.config.mjs, package.json byte-identical to aabffea, the last commit before gh#264 src work). Each tree built with `npm run build` in its own tree (rc 0) and served with `npx serve dist/` (TIP :4331, BASE :4332). Headless Chrome 155 (`--headless=new`, swiftshader; CDP 9333 for TIP, 9334 for BASE), one Chrome at a time, torn down by recorded pids; no listener left on 4331/4332/9333/9334.

Method: `scripts/driver.mjs`, Emulation.setDeviceMetricsOverride (390x844 for V1, 320x568 for V2-V4); every record carries innerWidth and `document.documentElement.clientWidth` and both equal the target in all runs. Storage wiped on the origin, then the page reloaded. V1 = first visit (empty roster). V2-V4 = saved roster of 3 (ต้น, มายด์, บอส) seeded on-origin before the load. n = 3 fresh runs per measurement per tree (V4 BASE: 3 seeded + 3 empty). Flows are programmatic `.click()` on the route's own named controls (navigation only; no tap-timing claim). WebGL asserted live in-page on pinocchio-luck (`glContextInPage: true`, `.no-webgl` absent). Raw numbers: `results-tip.json`, `results-base.json`; V1 cause: `results-v1-cause-tip.json` (CSS.getMatchedStylesForNode), `results-v1-fontdisplay-decls-tip.json` (every `--font-display` declaration). Screenshots (one per note per tree, all opened): `~/claude/evidence-archive/watduang/gh264-visual-followups-2026-10-16/{tip,base}-V*.png`.

## V1 short-stick shared screen type (390x844)
Computed font-size / weight / family, TIP, n=3 identical:

| element | short-stick | one-bomb | timebomb | board PlayerSetup.dc.html |
|---|---|---|---|---|
| reset label | 16px / 400 / Noto Serif Thai stack | 16px / 400 / Mitr stack | 16px / 400 / Mitr stack | 16px / 400 / Mitr |
| stepper count | 22px / 400 / serif stack | 22px / 400 / Mitr | 22px / 400 / Mitr | 22px / 400 / Mitr |
| start label | 21px / 500 / serif stack | 21px / 500 / Mitr | 21px / 500 / Mitr | 21px / 500 / Mitr |
| edit dialog buttons (open) | 16px/400 and 16px/500, serif stack | same sizes, Mitr | same sizes, Mitr | 16px/400 and 16px/500, Mitr |

Serif stack = `"Noto Serif Thai", "Th Sarabun New", "Iowan Old Style", Georgia, serif`; Mitr stack = `Mitr, "Noto Sans Thai", Sarabun, system-ui, sans-serif`. Size and weight match the board on every route; only font-family differs on short-stick, which is the "smaller/thinner" look in the screenshot (a serif face in place of Mitr).
Cause line: the shared screen styles `.ps-sec`, `.ps-danger`, `.ps-count-read` (and the other `.ps-*` text) set `font-family: var(--font-display)` (stylesheet `/_astro/play.DrLQdqXf.css`, from `src/play/_player-screen/PlayerScreen.astro`), and short-stick's own route stylesheet (`/_astro/play.CNta0IUI.css`, from `src/play/short-stick/style.css`) redeclares `:root { --font-display: <serif stack> }` after the site token (`src/styles/tokens.css`, Mitr stack), so the variable resolves to serif only on this route. Matched-styles confirmed for the reset label and stepper count; start/dialog buttons are the same `var(--font-display)` consumers (computed values agree).
BASE (no shared screen; equivalent first-visit setup screens): short-stick setup screen reset and start 15px / 600 / Noto Sans Thai (no stepper count on that screen); one-bomb reset 13px/800, count 24px/1000, start 16px/800, system-ui; timebomb reset 16/400, count 22/400, start 21/500, Mitr. BASE has no edit dialog (the edit control reopens the setup screen); the reset-names dialog buttons were measured as nearest equivalent (short-stick 15px/600 sans; timebomb 16/400 and 16/500 Mitr).
Verdict: introduced by gh#264. The serif `--font-display` override on short-stick predates it, but nothing on short-stick's own setup screen read it at that size/weight; the new shared screen is the first consumer that exposes it.

## V2 edit-players control vs HUD (320x568, in-round)
Edit control `#play-edit-players`: position fixed, z 300, rect l6 t56 r80.78 b100 (74.78x44) on one-bomb; l6 t56 r80.27 b100 on croc-bite. TIP and BASE numbers identical, n=3 each.
- one-bomb overlaps (px²): homeBtn 44, audioToggleBtn 18.78, turnBanner 2194.18 (turnAvatarEmoji 270, turnPlayerName 81.18); other HUD chips 0 (newRoundBtn, settingsBtn, tension pill, player strip, round badge). elementFromPoint at the overlap centre: edit control wins on homeBtn (32,56.5), turnBanner (45.4,84.5), avatar (32.5,91); the chip wins on audioToggleBtn (71.4,56.5) and turnPlayerName (78.3,91.8) (the control's rounded corner / text edge).
- croc-bite overlaps: first player card 2810.8 (card-avatar 676, card-info 878.1, card-name 439.05, card-score 439.05, a `strong` 73.58) inside player strip 2951.34; the four top buttons (home, sound, restart, settings) 0. Edit control wins at every overlap centre.
Verdict: pre-existing (control and numbers identical on main before gh#264; BASE has the control when a roster is saved). BASE croc-bite with a saved roster skips setup and opens the HUD directly.

## V3 wire-snip-panic badge row (320x568, round screen)
TIP = BASE, n=3 each: badge right edges 112.37, 226.17, 335.39 against innerWidth 320 (third badge +15.39 over); `document.documentElement.scrollWidth` 320 = innerWidth. Clipping ancestor: `#hud-player-strip` (overflow auto, right edge 306, flex nowrap, so the row scrolls sideways and the third badge is cut at 306, 29.39px hidden); next `#screen-game` auto, then `#app`/`body` overflow hidden at 320. No page-level horizontal overflow.
Verdict: pre-existing.

## V4 pinocchio-luck close X vs title badge (320x568)
TIP = BASE, n=3 each (BASE also 3 empty-roster runs, same numbers): `#play-exit` rect 6,6-50,50 (44x44); `.brand-mark` rect 8.02,14.02-51.98,57.98; intersection 1510.44 px² (78% of the X); X vs the `.brand` row 1360 px². elementFromPoint at the X centre (28,28) = `button#play-exit` (the X wins); stack beneath: `.brand-mark`, `.brand`, `header.topbar`. Note BASE first screen with a saved roster is the pass-the-device screen; TIP's is the shared screen; the header geometry is the same.
Verdict: pre-existing.

## Judgment (orchestrator, after opening the TIP screenshots)
- V1: real, introduced by gh#264 — filed.
- V2 and V4: real, pre-existing, one mechanism (the fixed site controls `#play-exit` and `#play-edit-players` sit at top-left over each route's own header at 320) — filed as one issue.
- V3: not a defect. The strip is the designed horizontal-scroll strip, and its `+N` overflow counter is visible in `tip-V3-wire-snip-panic-round-320.png` ("+1"). The third chip is meant to be cut at the strip edge. Counter staleness is already tracked separately as gh#219.

## Not covered
Real iOS WebKit; real touch (taps not driven). Whether Noto Serif Thai is installed on this Mac was not checked, so V1 reports the computed family stack, not the face actually painted.
