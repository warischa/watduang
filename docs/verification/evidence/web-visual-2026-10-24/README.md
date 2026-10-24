# gh#288 Phase 0 — web-page visual baseline, 2026-10-24

Phase 0 of `docs/plans/web-visual-2026-10-24.md`: a read-only audit of the in-scope pages plus measured
costs for effect candidates A–E. **Findings and options only, no picks** — the owner picks in Phase 1
(gh#288), then canvas, then code (ADR-0033). Nothing under `src/`, `design/` or `public/` changed.

## Build, lanes, flags

- Built tree: `dd17a72` (`git rev-parse HEAD`), `npm run build` at 20:00:30–20:00:33 Asia/Bangkok
  (13:00 UTC) on 2026-10-24, 26 pages, `BUILD_RC=0`. `git diff --stat ee7dcd7 HEAD -- src public` is empty
  (only `scripts/` and docs moved since prod), so the build is the deployed site's source.
- **Re-measured on a quiet machine.** The first runs (20:00–21:15) overlapped a sibling session's
  deliberate CPU-load experiment in this checkout (gh#289). Every number in the JSONs and tables below
  is from the re-run, 21:56–22:14 Asia/Bangkok, sequential, one Chrome at a time, CPU sampled 87–92%
  idle before it started. Rebuilt once at 21:56:01–21:56:03 with HEAD `9b18782` (src identical to
  `9158580`, so the gh#289 wheel fix is in); `git status --short` at build time listed only this dir's
  `effects-probe.mjs` (the rep-interleave edit; not in `dist/`). Layout, contrast, target, overflow,
  motion-inventory and reduced-motion rows reproduced with **0 differences** across the five audit files.
  Timing rows moved by a few percent (old values: commit `83c5b1f`). Not re-run, because they carry no
  timing claim: `interaction-1440.json`, `detail.json`, `canvas/`, `vt.json` and `shots/visual-*` (layout,
  styles and behaviour only).
- **Measurement window of every file** (Asia/Bangkok; per the coordinating session, the sibling's load
  experiment ran from about 20:00, with lighter single-Chrome tests until about 20:50, and its full gate
  suite ran 21:15:24–21:27:54):

  | Window | Files | Load-sensitive numbers in them? |
  |---|---|---|
  | 21:56:27–21:58:11, quiet | `audit-*.json` | local CLS/LCP: yes, re-measured |
  | 21:58:11–22:01:44, quiet | `states-*.json`, `shots/state-*` | result timings: yes, re-measured |
  | 22:01:44–22:02:53, quiet | `fortune-motion{,-rm}.json` | which animations ran (not timing) |
  | 22:02:53–22:05:47, quiet | `live-perf.json` | LCP/CLS/FCP: yes, re-measured |
  | 22:05:47–22:13:47, quiet | `effects-{nogpu,swiftshader}.{json,txt}` | effect costs: yes, re-measured |
  | 20:21–20:27, under load | `interaction-1440.json`, `detail.json`, `shots/focus-*`, `canvas/` | no: ring, hover, press, disabled styles, contrast arithmetic, screenshots |
  | 21:03–21:05, after the load, before the suite | `vt.json`, `shots/visual-*` | no: whether a transition ran (its 250ms is the UA's declared duration), whether an effect painted |
- **`main` moved during the audit:** another session committed `62d038a` (20:31) and `9158580` (20:47),
  gh#289, after this build. Both touch only `src/pages/tool/wheel.astro` and only *when* the pick is
  announced (on the disc's `transitionend` instead of a timer from the tap); no style changes. Every
  wheel row here is the `dd17a72` tree: F3 and F8 do not depend on it, F9's ~2.1s spin timing may shift.
- Live = build: `bash scripts/live-site-bytes.sh dist https://white-plant-05ad7c600.7.azurestaticapps.net`
  → `same=197 diff=0 miss=0`; must-red, one byte flipped in a copy of `dist/robots.txt` → `diff=1`, rc 1.
- Server `npx serve dist/ -l 4410`. Chrome 155.0.8059.85, two instances, own profiles, torn down by pid:
  - **no-GPU lane** (every audit row): `--headless=new --disable-gpu --no-sandbox --remote-debugging-port=9310`.
    The CI lanes' flags. In-page read: `webgl=false webgl2=false`. No in-scope page draws a `<canvas>`
    (`extras2.canvases` empty on all 12 pages × 3 widths; the one `getContext(` under `src/` outside
    `src/play/` is a comment in `src/games/types.ts`), so this lane is the honest one for the audit.
  - **SwiftShader lane** (shader candidate only): `--headless=new --use-gl=angle --use-angle=swiftshader
    --enable-unsafe-swiftshader --no-sandbox --remote-debugging-port=9311`. In-page read: `webgl=true webgl2=true`.
- Widths via `Emulation.setDeviceMetricsOverride` (never `--window-size`): 320×640 mobile, 390×844 mobile
  (touch emulation on), 1440×900 desktop. Every run's JSON records `innerWidth`; all equal the width asked.
- Reduced motion via `Emulation.setEmulatedMedia`; the in-page `matchMedia('(prefers-reduced-motion: reduce)')`
  read `true` on every RM page and `false` on every other (both directions, `extras2.reducedMotionMatches`).
- Date-keyed pages (daily-fortune, love-match): every sample inside Bangkok day 2026-10-24
  (`states-*.json` `bangkokAtStart`/`bangkokAtEnd`, 20:09–20:13).

## Scope as measured — one plan premise corrected

In scope, 12 pages: `/`, `/c/fortune/`, `/c/party/`, `/tools/`, `/tool/{wheel,draw,team,number}/`,
`/404.html`, `/game/{siamsi,daily-fortune,love-match}/`.

**The plan's "14 `/game/<id>/` chrome pages" do not exist.** `getStaticPaths()` in
`src/pages/game/[id].astro` builds `/game/<id>/` only for a game with no `playRoute` (ADR-0050 ruling 2
deleted the party landings), and `dist/` holds exactly three: siamsi, daily-fortune, love-match. The 14
party games exist only as `/game/<id>/play/`. Their one piece of page chrome outside `src/play/<id>/`
is the shared exit X (`src/shell/PlayExit.astro`). The owner's ruling puts the play routes out of scope,
so that X was **not audited**; whether it belongs to this ticket is a scope question for Phase 1.

## Files

| File | What |
|---|---|
| `cdp-lib.mjs` | raw CDP session (nav with timeout, real Tab/mouse/text input, emulated media, tracing) |
| `audit-probe.mjs` | gh#262's probe; its `AUDIT` and `EXTRAS` blocks verbatim, plus `EXTRAS2` (every under-44 row, canvases, motion inventory, ad slot boxes) |
| `audit-{320,390,1440}.json`, `audit-{390,1440}-rm.json` | 12 pages per file; `-rm` = reduced motion |
| `state-probe.mjs`, `states-{320,390,1440}.json`, `states-390-rm.json`, `shots/state-*.jpg` | 7 post-interaction states reached by real input, re-audited, screenshotted at the result |
| `interaction-probe.mjs`, `interaction-1440.json` | Tab walk with focus ring per stop, hover and press deltas, disabled controls |
| `detail-probe.mjs`, `detail.json`, `shots/focus-ua-ring-*.png` | disabled-vs-enabled look on the same button, the wheel hub's painted fill, focus ring crops, hover colour contrast |
| `canvas-compare.mjs`, `canvas/pair-*.jpg`, `canvas/heights.json` | built (left) vs board (right), first two viewports, 17 pairs |
| `live-perf-probe.mjs`, `live-perf.json` | LCP/CLS on live, throttled, n=3 per page |
| `effects/` + `effects-probe.mjs`, `effects-{nogpu,swiftshader}.{json,txt}` | throwaway prototypes of A–E and their measured cost (`.txt` = the run's printed summary, rc on its last line) |
| `visual-probe.mjs`, `shots/visual-*.png` | do B1, B2 and A2 actually paint: bar crops over scrolled content, hero crops |
| `fortune-motion-probe.mjs`, `fortune-motion{,-rm}.json` | every animation on the three fortune pages, polled from each press to 4s after it |
| `vt-probe.mjs`, `vt.json` | candidate E (cross-document view transitions) behaviour in this Chrome |

## Calibration — a detector's number counts only after it fired on a known input

| Detector | Must-red (fired) | Must-green |
|---|---|---|
| Focus ring | injected `<button style="outline:none!important;box-shadow:none!important">` reached by Tab → `ringVisible=false` | injected `outline:3px solid red` → `true`, `solid 3px rgb(255, 0, 0)` (`interaction-1440.json` `calibration.focus`) |
| Hover delta | injected button with a `:hover` background rule → `backgroundColor: rgb(0, 0, 255) -> rgb(255, 0, 0)` | its twin without the rule → `[]` |
| Reduced motion | `matchMedia` read `true` under the emulation, `false` without, every page | — |
| Fortune motion poll | — | siamsi's shake shows `sm-rattle` and `sm-fall` while pressed (so the poll can see this page's motion); runs on `dist/` rebuilt by the 21:08 gate run from `9158580` (gh#289 touches only the wheel) |
| Focus ring counts any `box-shadow` | — | every stop also had an outline, so no stop's "ring" was a shadow alone; the tool buttons' decorative 4px ink shadow would read as a ring on a page that removed the outline |
| Live CLS | `/tools/` with a 200px block pushed in at top 600ms after load → CLS `0.237` | the same page without it → `0`–`0.0001` |
| Live throttle | unthrottled `/` → LCP 176ms | throttled `/` → LCP 1128–1328ms |
| Effect raster/draw (no-GPU) | `CAL-heavy` (full-viewport 40px backdrop blur + repainting body gradient + box-shadow animations) → RasterTask 1421–1500ms, DrawAndSwap 722–764ms per 3s | home scroll baseline → 24–29 / 99–108ms |
| Effect GPU process (SwiftShader) | `CAL-heavy` → GPU-process `Scheduler::RunTask` (see effects table) | idle baseline |
| **Failed instrument, dropped** | rAF frame intervals read p95 16.7ms on `CAL-heavy` in the no-GPU lane: raster and draw run off the main thread, so rAF cannot see them. rAF figures are kept in the JSON but no claim rests on them. | |
| **Prototype applied?** | first A1-paint run read raster 0 = baseline: Astro's scoped `.hero[data-astro-cid-*]` `background` shorthand beat the injected rule (computed `background-image: none`). Fixed with `!important`, re-verified in-page (`linear-gradient(120deg, rgb(255, 61, 127)…`), all rows re-run. The same check caught B1's translucent ground. | |

## What closed since gh#262 (re-measured, not assumed)

On all 12 pages × 320/390/1440: 0 under-24 targets; 0 default-styled buttons (`buttonsUaDefault`, gh#259);
every h1/h2 sampled computes to Mitr (gh#261, incl. "วิธีใช้"; computed `font-family`, not the painted
face — `extras.fontFaces` lists Mitr as loaded); no sideways scroll; no heading skips; every
`<img>` has `alt`; 0 Thai mid-word breaks over 2,200 dictionary words at 320 (EXTRAS' segmenter; its
40px must-red control lives in gh#262's CDP probe and was not re-run here);
CLS ≤ 0.0044 locally. The 404 now has canvas styling (pair `404-*`). Contrast: the only failure the
detector reports is the wheel hub label, and **its paint is now measured**: the SVG `<text>` computes
`fill: rgb(20, 20, 43)` on a hub circle `fill: rgb(255, 246, 224)` = 16.75:1; the 1.99:1 is CSS `color`
(Chrome's disabled-button UA colour), which paints nothing on SVG text. Detector limit, not a defect.

Under-44 rows: 45 at 320 and 390, 9 at 1440 — every one is a member of the set gh#263 ruled and shipped
on purpose (chrome brand 80×41 and pills ×34 tall with a 44.5px `::after` hit area, siamsi chips 34
tall, 24px checkboxes in 44–48px label rows). `/c/party/` adds only the same chrome rows. No new class.
Text under 16px (any role): 83 elements at 390. gh#251 owns that rule with its own body-role probe
(44 → 0, shipped); this count is a superset (labels, meta, kicker) and was not re-classified here.

## Findings for the owner (severity is my reading, not a pick)

### F1 — Two focus-ring styles; 11 of 12 pages use Chrome's default (Med)
- `/` sets its own ring (`src/pages/index.astro`, `main :global(:focus-visible)`): `solid 3px` ink or gold,
  offset 3px. Every other page shows Chrome's UA ring, `auto 1px rgb(0, 95, 204)` (`interaction-1440.json`
  `ringStyles`). At 1440, no focus stop lacks a ring (`tabNoRing = 0` on all 12) and every stop matched
  `:focus-visible`. The Tab walk ran at 1440 only.
- Chrome paints `auto` as a blue ring with a white halo, so it stays visible on the punch band and the
  ink bar (crops `shots/focus-ua-ring-on-accent-c-party-390.png`, `…-on-cream-390.png`). The
  computed-colour ratios the probe flags (1.53 on sky, 1.77 on punch) are the blue band alone. Safari and
  Firefox paint their own default ring, unmeasured here.
- Tab order: one jump upward on `/` at 1440 — `a.cta` (y 489) → `a.featured` (y 140, the right-hand card)
  → the first tile (y 1129). DOM order vs a two-column hero; not a skip.
- Options: (a) one ring site-wide, drawn on canvas D (Phase 3 step 2, candidate C); (b) keep `/`'s ring
  and leave the UA ring elsewhere; (c) extend `/`'s existing ring values to every page (no new canvas value).

### F2 — No hover or press feedback on any button outside `/` (Med)
- Motion inventory at idle: only `/` has transitions (29 elements: tiles `transform, box-shadow 0.16s`).
  Every other page: 0 elements with a transition or animation.
- Hover at 1440 (2 per component): links and cards on `/tools/`, `/c/*` and the GameNav lists change
  colour; chrome brand/pills, `/`'s CTA, featured card and see-all, and **every button** (`#wheel-spin`,
  `#draw-go`, `#team-split`, `#number-go`, `#name-start`, `.game-btn-primary`, `.lm-choice`, `.sm-chip`)
  change nothing. Press (`:active`): no button changes; only text inputs gain their focus outline.
- The hover colour is `--color-primary #d6336c`: **4.29:1 on the cream ground** (4.62 on white). Text in
  a hover state still needs 4.5:1. `#d6336c` appears in 32 boards (the pre-D ones: CatFortune, Tool*,
  Game*, Siamsi*, Soulmate*…) and in neither canvas D board (`HomeShelf320`, `HomeShelfDesktop`), and
  ADR-0069's token table does not move it.
- Options: (a) candidate C (press/hover on buttons, cards) with a hover colour from canvas D; (b) only
  fix the hover colour — D's punch `#ff3d7f` is 3.13:1 on cream (fails too), ink is 16.75:1, so the
  hover cue would have to be something other than colour alone (underline, lift); (c) leave as is.

### F3 — Disabled go buttons look identical to enabled (Med)
Same element read before and after names were entered (`detail.json` `buttons`): `#wheel-spin`,
`#draw-go`, `#team-split` — disabled and enabled have the same background `#2b7bff`, ink text, border,
shadow, opacity 1 and **`cursor: pointer` while disabled**. `#lm-go` differs only in cursor. The pages do
say why in text ("ยังหมุนไม่ได้ — ใส่ชื่ออย่างน้อย 2 ชื่อ…"), so the state is not hidden, only unstyled.
`armAllButtons` is called from every `src/games/*.ts` module (siamsi, daily-fortune and love-match among
them) and from no file under `src/pages/`, `src/tools/` or `src/components/`. So a disabled style would
not flash on the tool pages, and it would flash on the fortune pages at every arm window (ADR-0057). Options: (a) a
disabled look drawn on canvas (tool pages only, or everywhere with an arm-window exemption); (b) leave.

### F4 — The gh#260 empty-result class is still on `/tool/draw/` and `/tool/team/` (Med)
gh#262 ruled the wheel's empty result bar (variant (i): dashed placeholder) and extended it to
`/tool/number/`. At idle, `/tool/draw/` shows its result area as a solid dark empty block and
`/tool/team/` as a tall empty bordered panel (pairs `draw-390`, `team-390`). The reserved height is
inferred to be deliberate from the titles of gh#110 and gh#120 (the ad below must not walk); their
bodies were not re-read. So the option is about the look, not the space.
Options: (a) apply variant (i) to draw and team; (b) a draw/team-specific idle look, canvas first; (c) leave.

### F5 — Three tool-page header patterns (Low-Med)
At 390 (DOM-measured): `/tool/wheel/` has no band, h1 at y 142; `/tool/number/` has the blue band, h1 at
133; `/tool/draw/` and `/tool/team/` add a row with "เครื่องมือสุ่มทั้งหมด" twice (back link and pill)
plus the eyebrow, then the band, h1 at **251** — the tool starts ~110px lower than on its siblings.
Options: (a) one tool header, drawn once and applied to all four; (b) drop only the duplicate row on
draw/team; (c) leave.

### F6 — Ad placeholders are styled four ways (Low)
Empty grey box with no label (wheel, number, siamsi, daily-fortune, love-match: 358×250–252 at 390);
labelled with a size that is not the box's (draw and team say "728 × 90" on a box that measures 350×250
at 390 and 940×250 at 1440); labelled
billboard (category pages, 970 × 250); a plain "ช่องโฆษณา" strip (`/`). AdSense is not live (gh#29), so
every visitor sees these. Options: (a) one placeholder look until AdSense goes live; (b) leave until gh#29.

### F7 — Fortune pages say their title twice (Low)
`/game/love-match/` renders the band h1 "เนื้อคู่ของคุณ" and, directly below, the stage heading
"เนื้อคู่ของคุณ" again; `/game/siamsi/` renders "เสี่ยงเซียมซี" then "เซียมซี". The boards
(`SoulmateStart`, `SiamsiIntent`) draw only the stage heading, without the shell band. daily-fortune's
two lines differ ("ดวงวันนี้" / "วันนี้คุณจะเจอกับอะไร"). The stage heading is inside `#stage`, which is in
scope for these three (ADR-0040), and gh#263 item 2 already ruled the heading's size. Options: (a) drop
the stage heading where it repeats the h1; (b) keep both.

### F8 — The wheel is blank before names (Low)
`/tool/wheel/` at idle draws the pointer and the hub "หมุน" and no segments (pair `wheel-390`), so the
page's main object reads as missing until names are entered. The board draws a populated wheel.
Options: (a) an idle wheel (neutral segments or sample names) drawn on canvas; (b) leave.

### F9 — Motion today, and what reduced motion does to it (baseline for every candidate)
- Idle motion lives on `/` only: `shelf-twinkle` ×4 sparks (2.4s), `shelf-bob-narrow` (3.2s), `shelf-tilt`
  ×3 tiles (6s); 6 animations running at 390, 8 at 1440. The wheel spin is a `transform` transition of
  ~2.1s (`states-*.json` `msToResult` 2099–2110, on the gh#289 tree).
- Draw, team and number results appear with no transition (result in ~160ms, `moved: []`, final-state
  inventory 0). The fortune pages were sampled through the whole interaction (`fortune-motion-probe.mjs`,
  `getAnimations()` every 100ms from each press to 4s after it, so an animation under 100ms could be
  missed): siamsi runs `sm-rattle` (320ms, on the cup's sticks) while shaking and `sm-fall` (450ms) when
  the stick drops; **the slip, the daily-fortune result and the love-match result reveal with no
  animation**, and no inline transform/opacity is written (`fortune-motion.json`). The state probe's
  150ms sample had predated these results by ~2.5s, so this re-measure replaces it for the fortune rows.
- Under reduced motion every one of those is **removed**, not reduced: `/` drops to 0 animations and
  0 transitions; the wheel lands in 155ms with nothing moving; siamsi's rattle and fall do not run
  (`fortune-motion-rm.json`, nothing seen at any step). ADR-0046's "reduce, not remove" was decided
  for motion that *is* the mechanic (a fuse); it does not say whether ambient or decorative motion may be
  removed. The plan applies "reduced, not removed" to the new layer. Options for the owner: (a) the new
  layer reduces (shorter, opacity-only) under the setting, and today's removals stay; (b) the new layer
  and today's motion both move to "reduce"; (c) decorative motion is removed, mechanic motion is reduced
  — written down as the rule.

### F10 — Several boards are older than the pages they describe (input to Phase 2, not a defect)
`CatPartyPop`/`CatFortunePop` predate the built category pages (built `/c/party/` has a 3D art grid the
board does not); the tool boards and `CatFortune`/`CatParty`/`HubNeutral` still paint the pre-D palette
(ADR-0069 calls them stale on colour); `ToolDraw390`/`ToolTeam390` and `ToolNameEntry` draw a chip-entry
panel where the built pages use a textarea (whether that was ruled was not checked). `/tools/` has no
board. `/`, `/404.html` and `/tool/number/` match their boards closely. Implication: Phase 2 boards for
the category, tool and fortune pages should start from a capture of the built page, not from the old board.

### F11 — A glass top bar is first a sticky bar (input to candidate B)
`header.chrome-bar` is `position: static` and 109px tall at 390 (it holds the brand and three pills).
Glass over scrolling content needs it sticky, which keeps 109px on screen permanently: 13% of a 390×844
viewport, 17% of 320×640. A compact sticky bar would be a new canvas design, not a polish.

## Performance baseline on live (approximation)

`live-perf.json`. Headless Chrome 155 on a Mac, 390×844 mobile, CDP throttle 1.6 Mbps down / 750 Kbps up /
CPU 4×, cache disabled, n=3 cold-cache loads per page, no AdSense. **The emulated 150ms RTT did not show
in TTFB** (61–102ms after the first load of each page run, 298–405ms on a first load): connections were reused, so these
are warm-connection, cold-cache numbers. Bandwidth and CPU throttling did apply (unthrottled `/` LCP 176ms). Live is prod `ee7dcd7`, so its wheel page predates gh#289.

| Page | LCP median (range) ms | CLS max | FCP median | kB transferred | LCP element |
|---|---|---|---|---|---|
| `/` | 1152 (1128–1328) | 0.0041 | 492 | 288 | `croc-bite.webp` (featured card) |
| `/tools/` | 284 (280–292) | 0.0001 | 284 | 95 | `p.lead` |
| `/tool/wheel/` | 460 (460–556) | 0 | 460 | 103 | `p.wheel-note` |
| `/tool/draw/` | 492 (484–500) | 0 | 492 | 101 | `p.tool-tagline` |
| `/tool/team/` | 456 (456–460) | 0 | 456 | 101 | `p.tool-tagline` |
| `/tool/number/` | 452 (448–456) | 0 | 452 | 99 | `p.tool-tagline` |
| `/c/fortune/` | 472 (460–472) | 0 | 472 | 97 | `p.intro-card` |
| `/c/party/` | 464 (456–468) | 0.0017 | 464 | 155 | `p.intro-card` |
| `/game/siamsi/` | 488 (488–492) | 0 | 488 | 118 | `h1.game-title` |
| `/game/daily-fortune/` | 772 (752–772) | 0.0005 | 500 | 108 | `span.df-headline` |
| `/game/love-match/` | 796 (788–796) | 0.0049 | 496 | 129 | `p.lm-note` |
| `/404.html` | 288 (284–544) | 0 | 288 | 69 | `h1` |

The two largest shifts: `/` 0.0041 (featured image + ad slot, ~1.6s) and love-match 0.0049 (`.lm-qbox`
and the go button, ~1.1s). Both are under 0.1 by a factor of 20. Any effect that adds bytes to `/` adds
them to the one page whose LCP already waits on an image.

## Effect candidates A–E — measured cost, fallback, reduced form

Prototypes in `effects/` are throwaway measurement instruments with placeholder values; none is a design
(ADR-0033). Each was injected into the built page over CDP and verified in-page to have applied (see
Calibration). Bytes = `gzip -9` of the prototype file alone (small files carry ~20 bytes of gzip header,
so merged into an existing stylesheet they cost less). Cost = trace time over a 3-second window, median of
3 runs with reps interleaved across variants, 390×844, CPU 4× on the main thread (raster and GPU threads are not throttled by CDP):
**no-GPU lane** = raster workers + the software display compositor's draw; **SwiftShader lane** = the GPU
process's scheduler time (software GL). Both are Mac CPU time: compare a row only with its own baseline.

| Candidate · variant | gzip B | No-GPU: raster / draw ms | SwiftShader: GPU-process ms | Paints? | Without support | Reduced-motion form (prototype) |
|---|---|---|---|---|---|---|
| idle baseline `/` | — | 0 / 29 | 25 | — | — | — |
| **A1** CSS gradient, paint path (animates `background-position`) | 434 | **284** / 69 | **1123** | yes | static gradient | animation off |
| **A1** CSS gradient, compositor path (one layer moved by `transform`) | 497 | 0 / 138 | 28 | yes | static layer | animation off |
| **A2** WebGL fragment shader, half resolution, paused off-screen | 1363 (JS) | = baseline (no context: 0 / 31) | 121 | yes (SwiftShader); no-WebGL lane keeps today's hero, `shots/visual-hero-*` | today's CSS hero, measured | one still frame |
| scroll baseline `/` | — | 26 / 99 | 85 | — | — | — |
| **B0** top bar made sticky, solid (pre-requisite of B, F11) | 179 | 26 / 82 | 85 | — | — | n/a |
| **B1** frosted `backdrop-filter: blur(14px) saturate(1.4)` on B0 | 275 (+B0) | 24 / **238** | **645** | yes, `shots/visual-bar-b1-*` | translucent ink bar, no blur | n/a (static) |
| **B2** SVG displacement glass `backdrop-filter: url(#…)`, B1 underneath | 730 (JS) | 24 / **451** | **1029** | yes in Chrome 155, both lanes (content under the bar visibly warps) | B1 via `@supports` | n/a |
| **C** button hover/press lift, one focus ring, result pop (CSS) | 464 | 56 / 25 (20 presses of 4 buttons in 3s; wheel idle = 0 / 0) | 174 (idle 1) | yes | — (CSS only) | transitions ~0, result fades only |
| **D** reveal on scroll, below the fold only (`IntersectionObserver` + CSS) | 647 (JS) | `/`: 15 / 119; `/c/party/`: 3 / 94 (baseline 7 / 94) | `/`: 174; `/c/party/`: 86 (baseline 41) | yes | no JS → everything visible (class added by script) | opacity only, 200ms |
| **E** cross-document view transitions (`@view-transition` + reduced-motion rule) | 290 | not measured (navigation, not a frame window) | — | yes: 250ms UA cross-fade | normal navigation | needs the author's rule (below) |
| must-red `CAL-heavy` | — | 1494 / 726 | 3000 | — | — | — |

CLS was 0 in every row of both lanes. No row moved the main thread's rAF p95 off 16.7ms except `CAL-heavy` in
SwiftShader (median 33.4); see Calibration for why rAF is not the instrument.

Readings that change a choice:
- **A1's paint path costs ~40× its compositor path** in the GPU lane (1123 vs 28 ms per 3s; first run 1154 vs 24). If A1 is
  picked, only the transform-moved layer is viable.
- **A2 adds ~96ms per 3s of GPU-process time over idle** (121 vs 25) on software GL, ships 1.36 kB of JS (moves
  `BASELINE_TOTAL_BYTES`, gh#129) and would be the first WebGL on a web page. Its fallback is measured: the
  no-WebGL lane renders today's hero unchanged. Real-phone GPU cost and battery are unknown (gh#141).
- **B1 costs ~8× B0** in the GPU lane (645 vs 85) and B2 ~12× (1029), during scroll; and B needs B0 first, a
  109px sticky bar (F11). B2's displacement renders in Chrome only as far as measured; Safari and Firefox
  support was not measured here and is reported absent by secondary sources (researcher note below), and
  an `@supports` test on `url()` may pass where the paint does not, so B2's fallback is unproven.
- The plan's B names "top bar and panels"; **only the bar was measured**. Glass on in-flow panels
  (cards over the cream ground) needs no sticky bar but has nothing behind it to blur except the flat
  ground, so its look and cost are unmeasured.
- **C and D are cheap** (raster tens of ms per 3s, no CLS). D caveat: on `/c/party/` the probe's LCP
  moved to 4468ms because programmatic scrolling is not user input, so revealed cards became LCP
  candidates. With a real scroll Chrome stops LCP at the first input (inferred, not measured); a reveal
  must never fire without input on anything near the fold.

### E — view transitions, measured in Chrome 155 (`vt.json`)

| Case | Old page `pageswap` transition | New page `pagereveal` transition |
|---|---|---|
| 0 neither page opted in (control) | false | false |
| 1 opted → opted (`/` → `/tools/`) | true | true; `::view-transition-*` fade-in/out, 250ms, finished |
| 2 opted → play route not opted (`/c/party/` → `/game/one-bomb/play/`) | true | **false**: aborted, "ViewTransition opt-in disabled"; the play route loaded normally |
| 3 opted → opted under `prefers-reduced-motion: reduce` | true | **true, the same 250ms animations** |
| 4 ad slot box on `/c/fortune/` after a transition vs without | — | identical `{y 650, h 254, w 354}` (placeholder only) |

So: (1) the play routes stay untouched **only if they never carry the opt-in**. `Base.astro` serves them
too, so the rule cannot sit in a sheet every page loads; it needs a home only web pages load, plus a gate.
(2) Chrome does not reduce the transition by itself, so the reduced-motion rule in
`effects/e-view-transition.css` is required, not optional. (3) Real AdSense iframes are unmeasured (gh#29).

External support facts (researcher agent, sources fetched 2026-10-24; secondary, not re-verified here):
cross-document view transitions ship in Chrome/Edge 126+ and Safari/iOS 18.2+ (Apple's 18.2 release
notes), not in Firefox (Bugzilla 1860854 open); caniuse and MDN disagree on Chrome Android's first
version (126 vs 156). StatCounter Thailand mobile, September 2026: Chrome 76.85%, Safari 17.91%,
Samsung Internet 3.99%, Firefox 0.30%. `backdrop-filter` is unprefixed in Safari 18+;
`backdrop-filter: url()` has no browser-compat data, and 2022 reports say Safari and Firefox do not render it.
Paper Shaders (a candidate shader reference) is Apache-2.0; "Radiant" could not be identified.

## Not covered — none of these is a pass

- Real devices: frame rate, battery, heat, Safari and Samsung Internet rendering of every candidate,
  iOS's own focus ring. All queued for gh#141 if a candidate ships.
- Any GPU: both lanes rasterise on the Mac CPU (software compositor, or SwiftShader). Effect costs are
  **relative** to the same lane's baseline; no absolute frame-time claim is made for a phone.
- AdSense: no account (gh#29), so the behaviour of a real ad iframe under any candidate is unmeasured;
  only the placeholder box was measured.
- Tab order and focus rings at 320 and 390, and hover/press at any width but 1440 (the interaction
  probe ran at 1440 only; the two focus crops are 390).
- Screen-reader output (the `role=status` result announcements), keyboard operation beyond Tab order
  (Enter/Space on each control), and hover on touch devices.
- The 14 play routes and their `PlayExit` X (out of scope by ruling; see "Scope as measured").
- `/en/` (not built). The `canvas/` pairs are crops of the first two viewports, judged by eye; the
  `heights.json` board heights include each board's notes and are not comparable to the built pages.
- The interaction probe did not wipe storage first; its runs follow the state probe, so the tool pages'
  name boxes held a draft. Ring, hover and press readings do not depend on it; the go buttons were still
  disabled at idle (`detail.json` re-read the disabled look from a page with no names committed).
- The latency leg of the live throttle (see the performance section).
