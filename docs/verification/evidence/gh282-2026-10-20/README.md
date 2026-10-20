# gh#282: where pinocchio-luck's 390x844 vertical overflow went from 14px to 114px

**Answer.** The play screens did not grow. The first bad commit is `469980e` ("feat(gh#264): pinocchio-luck on the shared player screen"). From that commit on, the seeded walk opens on the shared player screen at press 0. That screen's 112-114px of document scroll became the row's worst screen. The screen the 2026-09-15 ruling measured is still there one press later and still reads 14px.

## Method

- **Lane.** All measurements ran on this Mac on 2026-10-20 with one headless Chrome using the `ci-probes.sh` lane flags (`--headless --disable-gpu --no-sandbox`). Chrome ran on CDP 9611 with its own profile, which was wiped before every bisect step. `npx serve@14` served a byte copy of the commit's own `dist/` on 4611, taken right after that commit's build. The env was `ROUTES_ONLY=pinocchio-luck CI=1`, where `CI=1` stops the probe writing gh#203 shots into the tree.
- **WebGL state.** WebGL was read in the page on every measured screen. All 60 readings at 390 were `null`, and so was every row's worst screen at 320 and 1440. That is the no-WebGL fallback puppet, the same lane the ruling measured, because its reason names `div.css-mouth`.
- **How the probe ran.** Each run called the probe's own driver function through `fit-wrapper.mjs`. The wrapper changes nothing about the walk. After each of the probe's own MEASURE reads, it takes one extra read: in-page WebGL, fallback mouth visibility, document scrollHeight, the top-level boxes, and the visible text. That extra read is how every number below is tied to a screen.
- **Two instruments.**
  - "Own probe" is `scripts/play-screen-fit-probe.mjs` at the measured commit.
  - "Probe from 8cd8d37" is that file, plus its driver and `src/`, extracted with `git archive` into a scratch dir.
- **Bisect.** `git bisect run` over `8354f16..f9237d4` (253 commits) with the own probe. The verdict was the 390x844 vertical worst: good under 64px, bad at 64px or more. It took 8 steps and needed no skips.
- **Boundary.** Measured again with n=2 on each side. The probe and driver are byte-identical between `00715c8` (parent) and `469980e`, so only the build differs.

## Controls (390x844 vertical, n=2 each)

| Build | Own probe | Probe from 8cd8d37 |
|---|---|---|
| `8354f16` (commit that recorded the 2026-09-15 ruling) | 14, 14 px: press 1, a round screen ("รอบ 1 · 1/3"); 14px document scroll, 4px clipped by `div.css-mouth` | cannot walk this build: both runs report "the player screen never finished opening within 15000ms" (it needs gh#264's shared screen) |
| `f9237d4` (last commit before the band) | 114, 114 px: press 0, `playerScreen: true` ("ตั้งวง") | 114, 114 px: press 0, `playerScreen: true` |

At `f9237d4` the screens are p0:114 (player screen), p1:4, p2:14, p3:4. Shift the presses by one and those are the same play screens `8354f16` reads (p0:4, p1:14, p2:4).

## Mechanism (layout of a new screen, scored by the instrument as row growth)

One measurement on each side at 390x844:

- **`00715c8`, parent, n=2: 14px.** The seeded load lands directly on round 1. The worst screen, at press 1, is `main#app` 858px tall: topbar 66 + `section#stageFrame` 388 + `div.panel-wrap` 416.
- **`469980e`, first bad, n=2: 112px.** The seeded load now lands on the shared player screen, pre-filled with three names. `main#app` is 956px tall: topbar 66 + `section#stageFrame` 388 + `div.panel-wrap` 514, which holds `section#plPlayers.panel.ps` (tagline, 3 rows, add, start). Presses 1 to 3 have the parent's exact box heights and px: 4, 14, 4.
- **`f9237d4`: 114px.** The same screen. The extra +2px is `div.panel-wrap` going from 514 to 516. Which later commit added those 2px was not bisected. They sit on the player screen and do not change the verdict.

**Why the row reports this as growth.**
- KNOWN_OVERFLOW rows are compared on `worstOf`, which takes every screen, player screen included.
- PLAYER_SCREEN_SCROLLS removes player-screen states only from FITS_ROWS rows, through `gatedWorstOf`.
- pinocchio-luck is a KNOWN_OVERFLOW row. So its new player screen became the row's worst screen, and only the warn-only "measured X against a recorded 14px" fired.

The same shift explains the other viewports:

| Viewport | Before | After | Player-screen worst |
|---|---|---|---|
| 320 | 107 | 212-214 | yes |
| 1440 | 4-17 | 116-118 | yes |

## Not covered

- The WebGL lane. Every reading here is the no-WebGL fallback, which is the lane CI's `--disable-gpu` gives on this Mac. That is not the runner, where WebGL is live in-page.
- The runner's fonts.
- The sideways axis, which was ignored per the ticket addendum.
- The bisect steps were n=1 each. Only the two ends and the boundary are n=2.

## Files

- `controls.json`: every run digested. For each run it records the build, the instrument and every screen's press, px, source box and playerScreen flag. At 390 it also records in-page WebGL, mouth visibility, document height, top-level boxes and text.
- `bisect-log.txt`: the per-step readings and verdicts, `git bisect log`, and the boundary re-runs.
- `fit-wrapper.mjs`: the read-only wrapper. It is run as `node scripts/driver.mjs fit-wrapper.mjs` with `PROBE_PATH` set to the probe under test.
