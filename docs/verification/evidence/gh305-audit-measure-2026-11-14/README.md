# gh#305-308 / gh#314 audit-pick measure, 2026-11-14

Build under test: `dist/` built from the working tree (uncommitted `src/` edits; HEAD alone does not identify it).
Served by `npx serve dist -l 4791`. Chrome 157 `--headless=new --use-angle=metal --enable-gpu --ignore-gpu-blocklist`
(CDP 9791): real GPU, `ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Pro)`, WebGL2 live in every 3D leg (read in-page by the
`getContext` wrapper, not assumed). Raw CDP, one tab per leg; viewport by `Emulation.setDeviceMetricsOverride`, `innerWidth`
checked equal to the requested width in every leg. Target values come from `design/Gh305AuditFrames.dc.html`
(+ its evidence README), `design/Gh314Frames.dc.html` (frames measured by rendering that canvas in the same Chrome) and
the gh#305-308 picks. Probes: `probe/*.txt` (copy, drop `.txt`, run against a served `dist/`). Numbers live in `results-*.json`.

**Verdict: FAIL.** 9 rows PASS, row 9 has one FAIL value (1b) and one FAIL value (1d), row 7 has a tablet finding (reported, not a PASS).

Instrument traps hit (all fixed before the numbers below): (1) under `mobile:true` a planted overflow GROWS `innerWidth`
(planted 400px box read `scrollWidth 400 = innerWidth 400`), so `scrollWidth == innerWidth` cannot fail; the check is scored
against the REQUESTED width (`innerWidth === W && scrollWidth === W`) and row 2 was re-run with `mobile:false`. (2) `getAnimations()` and
`getComputedStyle` in the probe force a style flush that changes what a wave does; row 9d uses passive transition events only.
(3) `kidsRows` (tops differ because the badge is centred) is not a wrap signal; wrap = bar height > 52.

## Table

| # | Row | Widths | Measured | Result | Shots |
|---|---|---|---|---|---|
| 1 | 3D to 2D under 640 | demo x3 + projector x3 at 320, 639, 640, 1920 | 24 legs. 320/639: canvas never appeared, `three.module` never requested (Network log), 0 GL contexts created. 640/1920: canvas under `.pr-3d`/`.pd-3d`, `three.module` requested, 1 live WebGL2 context. Plus a `mobile:false` 639 leg (2D, no chunk) and 640 leg (3D) so width is the only variable. 4 widths x 3 games x (demo, projector) all as required | PASS | `row1-proj-*`, `row7-*-idle` |
| 2 | Phone result screen | 320, 375 (`mobile:false`, worst-case names: 12 x U+0E12 U+0E33 first, 11 x that + a letter, 11 x W + a letter; 5 prizes) | 320: innerWidth 320, scrollWidth 320, winner painted **24px** (2 lines), card names **21, 21, 21, 22px**. 375: 375 = 375, winner **24px** (2 lines), cards **21px** x4. No painted box past the viewport: the only elements past the right edge are 5 spans inside `#pd-live.pd-sr` (fixed, 1 x 1px, `clip-path: inset(50%)`, paints nothing). Canvas floors 24 / 21 met exactly | PASS | `row2-result-320-top`, `row2-result-375-top` |
| 3 | HUD wrap, lane pick | 1920 (frame scale 0.9481, frame left 49.8) | HUD lines break at the space; longest line right edge 380.5 screen px = 348.8 frame px (canvas 348.8). Rail 1 starts **163.5 screen px = 172.5 frame px** right of that line (nearest row; canvas 170.7). Gap positive | PASS | `row3-lanepick-1920` |
| 4 | Lane pick at 320 | 320 (and 375) | 5 name buttons, 5 lane controls: name x lane intersections **0**, name x name 0, lane x lane 0. Smallest tap box: names 52px, lanes 44px (>= 44) | PASS | `row4-lanepick-320` |
| 5 | Cards field | 1920 | 200 names (demo, and projector with s1=100): **10 x 20**, card 170.9 x 31.6 frame px (canvas 171.8 x 32). 104 names (see note): **6 cols x 18 rows**, card 292.2 x 31.6 (canvas 293 x 32). Painted name glyph vs a known 16px text in the same shot (same overlay, same screenshot): digits 14px tall vs 11px for 16px => ~20px; `W` cap height 11px vs 11px => **16px** (floor held on 12-W names). Resting layout bbox x 103-1817 screen = frame 56.1-1864.0 = exactly the field; y inside (155-867 vs field 150.8-871.3) | PASS (see notes) | `row5-demo200-*`, `row5-proj104-*`, `row5-proj200-*` |
| 6 | Rails | 1920, lane-pick screen | Rail 1 vs ground, brightest-3-px x 5-rows method: y520 **3.93**, y700 **3.81**, y900 **3.68** (>= 3). Canvas 3.93 / 3.90 / 3.84; the painted rail is a constant #7a7897 where the canvas has a slight gradient | PASS | `row3-lanepick-1920` |
| 7 | Demo bar | 1920, 320 (required); 640, 700, 768, 1024 (reported) | 1920: bar left 1301.2 / 952.8 (final mode) .. right 1896, top 2, height 52 (one row), inside the 56px band, right gap 24; lower band game name at y 938-995, no intersection. 320: bar top = frame bottom (3876.4 = 3876.4 fireworks/cards, 358 = 358 ladder), scroll 320 = 320. **Tablet: fireworks final bar** 1024: l 56.8, 52 high, one row, 6.8px right of the exit (fits). 768: l 0, **112 high, 2 rows, the go label wraps to 2 lines, badge sits over the exit** (does not fit). 700: same (112 high). 640: 172 high. Fireworks default bar at 640 (594.8 wide, l 21.2) covers the exit; ladder bar at 640 (616 wide, 112 high) and 700 (l 21.7) covers the exit; cards bar fits at every width | PASS at 1920/320; **tablet FAIL at 640-768 (finding)** | `row7b-*`, `row7-*-idle` |
| 8 | Setup disabled cards | 1280, 320 | Disabled: `dashed` 2px border, ground rgb(255,246,224), text rgb(61,59,92); enabled: `solid`, white, rgb(20,20,43); enabled game button gold rgb(255,204,0). Reason line `เกมไพ่ใช้ได้เฉพาะรอบที่คัดออกครึ่งหนึ่งพอดี` occurs **1** time in `innerText` (node `#pd-game-r1-note`, visible). scroll 320 = 320, 1280 = 1280 | PASS | `row8-setup-cards-disabled-*` |
| 9a-1b | Setup schedule below 640 | 320 | Canvas B: five rows, every `.val` 118 x 64 at **126px from the list's left, flush right**, arrow centred under that column (185px in). Build: single column, 118 x 64 boxes (match) but offsets from `#pd-sched` **34.5, 78.9, 78.9, 78.9, 56.4** (deltas 91.5, 47.1, 47.1, 47.1, 69.6), arrows in a 130px box at the left (centre 65px in, 120px off the column). The values stagger by label width instead of aligning | **FAIL** (element `#pd-sched .box .val` x5, `#pd-sched .arr` x4) | `row9b-schedule-320` |
| 9c-1c | Back link | 320, 1280 | Two links `หน้าแรก` (54.4 x 44, `/`) and `เกมงานเลี้ยงบริษัท` (119.3 x 44, `/c/company-party/`), 16px, 400, underlined, separator margin 6px / 6px: identical to the canvas (54.4 / 119.3 x 44, 6px/6px, 16px) | PASS | `row9c-back-320`, `row9c-back-1280` |
| 9d-1d | Wave step | 1920, 196 names, round 1 plain 2D | Canvas B: 131 of 196 chips started at 300ms, delay step 450/195 = 2.31ms, last settles 730ms. Build: the delay is right (`--wave-last` 195, chip 1 delay 0.00230769s) but the wave **never plays**: on the press all 196 chips get a `transitionrun` at +30.6ms, 1 `transitionstart`, **196 `transitioncancel`, 0 `transitionend`**, and every chip reads its end colour (rgb 255,204,0) from +44ms. Started by 300ms: **1** (canvas 131). Same at 9 names. Controls: the listener sees a transition the probe starts (positive); under reduced motion 0 chip transitions (the fade path), so the instrument separates the cases | **FAIL** | `row9d-wave-after-196` |
| 9e-1e | Refused name row | 320 | Name 700 / 16px / rgb(20,20,43) / `overflow-wrap:anywhere`; reason 400 / 16px / rgb(61,59,92): identical to canvas B. W x 13 row 181.8 x 24, reason 24 high (canvas 181.8 x 24). scroll 320 = 320, 0 boxes past the edge | PASS | `row9e-refused-320` |
| 10 | Join sending state | 320 | `Fetch.enable` on `*/api/*` and never continued: button text `กำลังส่ง…`, `disabled`, computed opacity **0.55**, 288 x 52, scroll 320 = 320; one POST held (`/api/draw/events/<id>/join`) | PASS | `row10-join-sending-320` |

## Must-reds (an instrument shown red on a planted or known-bad input)

- Row 2 scroll check: a 400px box planted in the 320 / 375 `mobile:false` result gives `scrollWidth 400, innerWidth 320` (and 375), `red:true`; removing it returns 320 = 320. Under `mobile:true` the same plant stayed green (`400 = 400`), which is why the check is scored against the requested width. `row2-mustred-planted-320.png`.
- Row 6 rail sampler on the 2026-11-13 build's lane-pick shot (`../gh305-recheck-2026-11-13/shots/game-prize-draw-play-1920-ladder-lane-pick-empty.png`, rail #5e5c7b): 2.61 / 2.53 / 2.44, below 3 and equal to the audit's 2.62 / 2.54 / 2.44.
- Row 3: the as-built one-line HUD (right end 594.4 frame px = 613.3 screen px, canvas `hud-ctl`) against the rail x read in this build (544.0 screen px at that row) = -69 screen px, crossed; the old shot above shows it crossed.
- Row 9d: passive listener control seen; reduced-motion run shows 0 chip transitions.
- Row 1: 320 / 639 legs read 0 `three.module` requests and 0 GL contexts, 640 / 1920 read 1 each, so the request/context detector separates the two branches.

## Notes and what was not covered

- **103 names is not reachable through the UI** (cards play only a round that cuts exactly in half, so the field is even). 104 names, which the plan lays out identically (6 x 18), stands in.
- Row 5 resting layout is exact; during the reveal the 3D camera pushes in and the card bbox reaches 101-1819 screen px (about 2px past the field) at 2.1s and 88-1832 at 2.7s: camera motion, not layout. Glyph heights are integer pixels, so the painted size reads +-1.5px (11 vs 11 px for 16px; a 13.9px name would read 10px).
- Row 5 digits-only names paint at 20px, the 16px floor shows on the W names; the Thai 12-pair name wraps to two lines here (the canvas expects three).
- Row 6 covers the lane-pick screen (2D frame). The 3D ladder track was not sampled.
- Row 2 worst-case cards wrap to 2 lines at 21px (the canvas draws 1 line at 21-22px for its own names); the size criteria hold.
- The harness typed the literal `undefined` into prize 4 and 5 (only 3 names supplied); visible in `row2-result-*`, harness artifact.
- Not measured: a real projector, real phones, iOS WebKit, the 3D renderer on a non-Metal GPU.
- Thai rendering: opened `row2-result-320-top`, `row7b-fireworks-768-final`, `row9e-refused-320`, `row9b-schedule-320`, `row5-proj200-reveal-02` (crop): no dotted circles.

## Base control for the two FAIL rows (1b schedule stagger, 1d wave), 2026-11-14

Base = commit 5e86156 (HEAD before the audit work), extracted with `git archive` to `<scratch>/base-5e86156/`, `node_modules` symlinked
from `<repo>/`, built there with `npm run build` (no install). Served on its own port (4792); the repo's current `dist/` on 4793.
One fresh-profile Chrome 157 (same flags as above, CDP 9793). The same probes (`probe/static.mjs.txt` frames314, `probe/wave2.mjs.txt` 196 names)
ran against both. Order: base first (cold profile), then current (warm profile, fonts cached by the base run). The earlier current run in the table
above was cold.

| Row | Base 5e86156 | Current dist (cold, table above) | Current dist (warm) |
|---|---|---|---|
| 1b `.val` offsets from `#pd-sched` at 320 | 34.5 / 78.9 / 78.9 / 78.9 / 56.4; `.arr` 130px boxes at offset 0 | same | same |
| 1d chip transitions on the press, 196 names | run 196, start 1, end 0, **cancel 196**; started by 300ms: 1 | run 196, start 1, end 0, cancel 196; 1 | run 196, start 1, end 0, cancel 196; 1 |

Both rows fail identically on the base build and on the current build, so neither is a regression from the audit work, and a cold
font refit is not the cause (warm profile reads the same).

**1d positive control (`probe/wavepos.mjs.txt`).** After the press, the probe removes `pd-marked` from `.pd-field`, forces a style flush,
waits 700ms, then adds `pd-marked` back with the same passive listeners. On both builds the wave plays: 196 `transitionrun`, 196 `transitionstart`,
204 `transitionend`, started by 300ms = 123 (canvas B: 131 at 300ms after the press; the probe's clock starts at the class change, not the press),
last start about 463-472ms, last end about 739-745ms (canvas 730). So the instrument sees the wave when it plays, and the chip CSS delay is right.
What fails is the stage's own sequence: it removes `pd-marked` and re-adds it on the next frame, a style flush lands between the two, so the
unmark starts 196 transitions (delay in progress) and the re-mark cancels them all; the chips never leave their end colour. Verdict: real
bug (harness cleared), same on base and current. Inferred, not isolated by edit: the cause is the flush between the remove and the rAF re-add.

## Re-measure after fixes, 2026-11-14

Same harness and flags (Chrome 157, `--headless=new --use-angle=metal --enable-gpu`, real GPU), a fresh profile, the rebuilt repo `dist/` served on its own port,
`mobile:false` everywhere, every scroll check scored against the REQUESTED width. Probes: `probe/*.txt` (new: `row7c`, `rm`; `cards`, `lib` updated).
Screenshots cited here are the `re-*` files in `shots/`.

| Row | Result | Numbers |
|---|---|---|
| 1d wave, 1920, 196 names, no control tricks | **PASS** | Passive listeners, one press: `transitionrun` 196, `transitionstart` 196, `transitionend` 196, `transitioncancel` **0** (before the fix: 196 / 1 / 0 / 196). Started by 300ms: **130** from the first run, 116 from the click (canvas 131 from the press). Last start 450.2ms (canvas 450), last end **716.7ms** (canvas 730). Reduced motion (`matchMedia` true): first reveal sample at +31ms already shows all 101 `in` chips at the end colour rgb(255,204,0), 0 CSS transitions, 0 chip transition events. `re-row9d-wave-after-196.png` |
| 1b schedule, 320 | **PASS** | scrollWidth 320 = 320. All five `#pd-sched .box .val` at **126px** from the list's left (canvas 126, flush right), each 118 x 64. The four `.arr` boxes are 244 x 26 at offset 0 (canvas `varr` 244 x 26); each arrow glyph centre is 185px in, equal to the val column centre (185). `re-row9b-schedule-320.png` |
| 7 demo bar | **PASS** | 3 demo pages x 639, 640, 700, 768, 1024, 1280, 1920, default screen plus the fireworks final screen: 28 states. In all 28: bar x `#play-exit` intersection area **0** (bar box and each of its children), `scrollWidth` = requested width, and when `data-bar="band"` the bar is one row (height 52, top 2, bottom 54), otherwise `data-bar="below"` and the bar's top is at or under the frame's bottom. Fireworks final: band at 1024 (56.8..1000), 1280 (312.8..1256), 1920 (952.8..1896); below at 639, 640, 700, 768 (e.g. 768: 488..672.3, under the frame). Cards: band from 640 up. Ladder: below at 639, 640, 700, band from 768. 639.5 not testable: CDP device metrics take integers (a fractional width was rejected and `innerWidth` read 1920, so 639 and 640 bracket it). `re-row7-fireworks-768-final.png` |
| 5 cards 200 names, deal to round screen | **PASS** | Demo page and projector (s1=100). The deal frames (8 shots from 3.0s) and the round (reveal) frames (8 shots from 0.15s, dim under the rule modal then gold) all read **10 x 20**, card **170.9 x 31.6** frame px (canvas 171.8 x 32), card 001 at screen (103, 172) demo / (103, 157) projector on both screens (no jump; late reveal frames drift to 101-102, the camera push seen before). Shots with the rule modal up are measured with a dim-border mask (rgb about 67,57,34), the rest with the gold mask. 16px reference (overlay text at 15.168 screen px, same screenshot): the `W` names' cap height is 11px against the reference's 11px, painted **16.0px** (3 of 5 cards of row 1; the other two are wrapped Thai or overlap the modal and read taller, not smaller); Guest names 13-14px glyphs (about 20px). `re-row5-proj200-reveal-06.png` |
| 2 phone result | **PASS** | 320: innerWidth 320, scrollWidth 320, winner **24px** (2 lines), card names **21, 21, 21, 21px**. 375: 375 = 375, winner 33px (1 line), cards **22, 22, 21, 21px**. No visible box past the viewport (the only elements past the edge are sr-only spans inside `#pd-live`). Must-red: a planted 400px box reads scrollWidth 400 vs requested 320 / 375, red. Lane pick unchanged: 0 name x lane intersections, smallest tap box 44px. `re-row2-result-320.png`, `re-row2-result-375.png` |

Screenshots in the evidence dir that no README row cites, by name or by the family pattern the README names: **0** files (0 bytes). The `shots/` directory is about 20M in total, mostly the `row1-*`, `row5-*` and `row7*` families; the earlier pre-fix `row5-*`, `row9d-*` shots remain as the base state of the same rows.
Not covered: 639.5 exactly, a real projector, real phones, the 3D ladder track contrast.
