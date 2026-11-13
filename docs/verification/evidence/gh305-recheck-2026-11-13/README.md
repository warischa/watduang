# gh#305 recheck, 2026-11-13: real-Chrome pass over the freshly built dist/

Build under test: `dist/` as found (no build run here; no file under `src/` or `scripts/` newer than `dist/index.html`, checked with `find -newer`). Ports: serve 4644, CDP 9644 only. Every knob each probe reads was unset or set explicitly (`PROBE_BASE PROBE_WIDTH ROUTES_ONLY BASE CDP_PORT BREAK_* NO_* FIT_SHARD*` and the output knobs were `unset` before each probe).

## Renderer strings

- Real-GPU launch (checks B, screenshots C): `Chrome --headless=new --no-sandbox --use-angle=metal --enable-gpu --ignore-gpu-blocklist`: `UNMASKED_RENDERER = ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Pro, Unspecified Version)`, 61 rAF/s in-page (`results.json` key `gpu`).
- Probe lanes use CI's own flags: `webgl-pixels-lane.sh` launches `--headless --no-sandbox --use-angle=swiftshader --enable-unsafe-swiftshader`; top-band and fit ran on `--headless --disable-gpu --no-sandbox` (the `ci-probes.sh` lane flags). Probe verdicts are about those paths, not about the GPU launch.

## Verdict table

| Item | Verdict | Decisive reading |
|---|---|---|
| A1 webgl-pixels | **FAIL (UNMEASURED, exit 2) x2** | Clean leg never PASS. Run 1: `prize-cards UNMEASURED: no live renderer element names its hold instance`. Run 2: the same for `prize-cards` and `prize-draw`, plus `pinocchio-luck UNMEASURED: nothing drew before the hold`. Stub-control leg FAIL as required (lane 1/2 legs matched). Every other route PASS, incl. real hold legs `held>free` (heldDraws 0). Flaky set differs between runs; `prize-cards` unmeasured both times. |
| A2 play-top-band x2 | **PASS** | Run 1 and run 2 identical verdict: `OK 69 screen(s) across 18 route(s): both controls inside the 56px band, no route content intersects it`, exit 0 both. Raw box values differ in 18 of 69 rows between runs (verdict does not). |
| A3 play-screen-fit, prize routes | **FAIL (exit 1)** | The nine `prize-{fireworks,cards,ladder}` rows all read 0px scroll / 0px clip / 0px sideways = the recorded rows. But the pinned row `prize-draw 320x568` now reads **3378px to scroll** (press 1; presses 0-6 read 3342/3378/1542/1578/642/678/102px): `::error::/game/prize-draw/play/ at 320x568 no longer fits VERTICALLY`. `prize-draw 390x844` and `1440x900` read 0px. |
| B1 setup -> projector, no uncaught error | **PASS** | 3 navigations (the 2nd and 3rd replace a saved event, confirm dialog accepted): 0 exceptions, 0 console entries of any type, 0 Log entries, no `InvalidStateError`/ViewTransition text. Must-red: an injected `Promise.reject(new DOMException(..,'InvalidStateError'))` and a `console.error` were both captured by the same instrument. |
| B2 ladder final | **PASS** with two findings below | Lane picks survive a reload after 2 picks and after 5 picks (lanes `1Guest05 2Guest19 3 4 5` then `1Guest05 2Guest19 3Guest20 4Guest25 5Guest38`, identical after reload). A second tab opened at 2 picks showed the same 2; the second tab also updated live to the 5 picks, and after its own reload showed 5. 3D reveal at 1920x1080: 33 frames over 34.9 s (`strips/ladder-reveal-strip-1..6.png`): lanes, rungs, paths drawn; prize slots, plate names and HUD not clipped or overlapping in 32 of 33 frames. Frame 33 (`...ladder-reveal-33-prize-1.png`) is a mid-crossfade into the result: the ghosted winner overlay (about 10% alpha) overlaps the plates for one frame; the settled `ladder-result` and `final-result` shots are clean. |
| B3 cards on exact halves + picker | **PASS** | 40 names, schedule 40/20/10/7/5: cards button enabled on rounds 1 and 2, disabled on 3 and 4 (the default proposal for 40 is the same 40/20/10/7/5). Editing round 1 to 25: all four cards buttons disabled and round 1's cards pick cleared (`aria-pressed=false`). Played: round 1 stored 20 survivors, round 2 stored 10, DOM chips equal the stored survivors, deal and reveal both drew a 3D canvas. |
| C screenshot set | done | 144 PNG in `shots/` (+6 strip sheets in `strips/`); see the list below. |

## Findings for the audit (not fixed here)

1. **`prize-draw 320x568` no longer fits (A3)**: the idle and round projector screens at 320 render the whole field as a long scrolling chip list (3378px at 200 names). The FITS row pinned by gh#304 says "projector frame is scaled whole"; that holds on the reveal screens only. `game-prize-draw-play-320-idle.png` and `...-round-2d-before.png` show it.
2. **Ladder lane-pick at 320x568 (B2 side check)**: the frame is scaled to about 5px type, and the finalist name buttons (`button.pd-name`, 153x52) sit on top of lane controls 2 and 3 (`.pd-lane`, 53x44 at the same y): `elementFromPoint` at their centre hit `button.pd-name`; a free point on the control still existed, so taps worked. `game-prize-draw-play-320-ladder-lane-pick-empty.png`, `-2.png`, `-5.png`. Not seen at 1920.
3. The demo routes (`/game/prize-*/play/`) at 320x568 draw the same tiny scaled frame (`game-prize-*-play-320-idle.png`).
4. webgl-pixels is flaky in the new `prize-draw`/`prize-cards` legs (A1): CI would red on UNMEASURED. Cause not established; two attempts are the cap.

## Console errors

Zero console messages, exceptions or Log errors in every scenario (setup, walks at 1920 and 320, demos, join, category, second tab). Verbatim first line: none to quote. Only Chrome-process noise sits in the launch log (CVDisplayLink, not page output). One `webglcontextlost` was recorded in the 1920 walk with `connected:false`, `parent:null`: the removed canvas of a finished reveal, not a live loss.

## Commands (exact)

```
# A1 (owns its own serve+Chrome; ports 4644/9644 free beforehand)
WEBGL_PROBE_PORT=4644 WEBGL_PROBE_CDP_PORT=9644 WEBGL_PROBE_OUT_DIR=<scratch>/out/webgl bash scripts/webgl-pixels-lane.sh      # twice
# serve + CI-flag Chrome for A2/A3
npx serve@14 dist/ -l 4644
Chrome --headless --disable-gpu --no-sandbox --remote-debugging-port=9644 --user-data-dir=<scratch>/chrome-9644/ci
env BASE=http://localhost:4644 CDP_PORT=9644 BAND_OUT=<json> node scripts/play-top-band-probe.mjs                          # twice
env BASE=http://localhost:4644 CDP_PORT=9644 ROUTES_ONLY=prize-draw,prize-fireworks,prize-cards,prize-ladder node scripts/play-screen-fit-probe.mjs
# B and C: real GPU Chrome on the same port, CI Chrome stopped first
Chrome --headless=new --no-sandbox --use-angle=metal --enable-gpu --ignore-gpu-blocklist --remote-debugging-port=9644 --user-data-dir=<scratch>/chrome-9644/gpu about:blank
node drive.mjs.txt-copy <gpu|b1|b3|walk1920|walk320|demos|setup|join|cat>        # CDP_PORT unset (driver pins 9644)
```

The A3 run is narrowed by `ROUTES_ONLY` (iteration, not the deploy verdict); it covers the prize routes only, as briefed.

## Files

- `webgl-lane-run1.txt`, `webgl-lane-run2.txt`, `webgl-clean-run{1,2}.json`, `webgl-stub-control-run{1,2}.json`: A1 raw output (the `.json` files carry the JSON followed by the lane's stdout lines).
- `top-band-run{1,2}.txt` / `.json`: A2. `fit-prize.txt`: A3.
- `results.json`: B and C readings per scenario (`b1`, `b3`, `walk1920`, `walk320`, `demos`, `setup`, `join`, `cat`, `gpu`, `probes`).
- `drive.mjs.txt`: the driver (raw CDP, instrumented `getContext`/`fillText`, host frame sampler).
- `shots/<route>-<width>-<state>.png`, `strips/`: screenshots. `.gitignore` line 17 ignores `docs/verification/evidence/**/*.png`, so the PNGs are on disk here but never show in `git status`.

## Screenshot set (144)

Setup `game-prize-draw-{1280,320}-{empty,picker,picker-selected,nowebgl-note}` and `-1920-cards-picker-*` (B3). Projector `game-prize-draw-play-{1920,320}-`: `cold-no-event`, `idle`, `fireworks-mid-NN-<phase>`, `fireworks-result`, `cards-before-deal`, `cards-deal-NN`, `cards-dealt`, `cards-reveal-NN-<phase>`, `cards-result`, `round-2d-before`, `round-2d-result`, `round-2d-result-r4`, `ladder-lane-pick-{empty,2,5}`, `ladder-reveal-NN-<phase>` (33 at 1920, 12 at 320), `ladder-result`, `final-result`; 1920 only: `ladder-second-tab-at-{2,5}-picks`, `ladder-after-reload-5`. Demos `game-prize-{fireworks,cards,ladder}-play-{1920,320}-{idle,reveal-NN-<phase>,result}`. Join `game-prize-draw-join-{320,375}-join` (a made-up event id: the page shows "ไม่พบงานนี้ ลองสแกน QR บนจออีกครั้ง"). Category `c-company-party-{1440,320}-cards`. The 1920 walk's `ladder-result` and `final-result` read the same screen (`data-screen=result`, winner Guest20 at 1920).

## Not covered

No GPU check of A1/A2/A3 (CI flags by design); no 375/390 projector shots; the demo cards route was only dealt, not revealed; the join page was not driven with a real event; the no-WebGL picker buttons' disabled state was seen in a screenshot only, not read.
