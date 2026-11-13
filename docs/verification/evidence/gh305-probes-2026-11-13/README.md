# gh#305 probe run, 2026-11-13

Machine: this Mac, Chrome 157.0.8103.51, against the existing `dist/` (nothing was built). Serve port 4622, CDP port 9622, profile under the session scratchpad. Every run unset `PROBE_BASE PROBE_WIDTH` (and, where relevant, `ROUTES_ONLY STUB_DRAW BREAK_WALK BREAK_BAND FIT_SHARD FIT_SHARDS`) and set `BASE`/`CDP_PORT` explicitly. Server: `npx serve@14 dist/ -l 4622`.

## 1. play-screen-fit-probe (3 new routes, 9 rows)

Chrome as ci-probes.sh launches the fit lanes: `--headless --disable-gpu --no-sandbox --remote-debugging-port=9622`.

    env BASE=http://localhost:4622 CDP_PORT=9622 ROUTES_ONLY=prize-fireworks,prize-cards,prize-ladder node scripts/play-screen-fit-probe.mjs

`ROUTES_ONLY` is deliberate here: rows are per route, so a narrowed walk measures the same rows; it is iteration-only and attests nothing about the deploy verdict. Three consecutive runs (`fit-run1.txt`, `fit-run2.txt`, `fit-run3.txt`, ~105s each). Exit 1 each time, and the only reds are the 9 UNCLASSIFIED lines (the unregistered rows); the measured rows were byte-identical across the three runs (md5 of the row lines equal).

Measured, every row, every run: scrolls no, overflow 0px, clipped 0px, sideways 0px. Width-fill (report-only, not pinned): cards 90.6/90.9/96.7%, fireworks 94.2/94.2/96.7%, ladder 100/100/100% at 320/390/1440.

Registry edit: `scripts/play-screen-fit-probe.mjs`, `FITS_ROWS` gained the nine rows `prize-{fireworks,cards,ladder} {320x568,390x844,1440x900}` after the `prize-draw` rows (0px class, with the three-run precedent the prize-draw rows used). Before copy: `play-screen-fit-probe.before.mjs`; the after is the file itself (`git diff`). No KNOWN_OVERFLOW row was needed.
Result: `node --test scripts/play-screen-fit-probe.test.mjs` 80 pass, 0 fail (was 9 UNCLASSIFIED).
Not covered: the FITS_ROWS pin is this Mac's number; CI's runner can read differently (see ci-gate-calibration.md); the three new routes have no `ROUTE_SEEDS` entry, so they were walked unseeded.

## 2. webgl-pixels lane

    env WEBGL_PROBE_PORT=4622 WEBGL_PROBE_CDP_PORT=9622 WEBGL_PROBE_OUT_DIR=<scratch> bash scripts/webgl-pixels-lane.sh

The lane launches its own Chrome with `--use-angle=swiftshader --enable-unsafe-swiftshader` (no `--disable-gpu`). Context live: renderer `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device ...))`, so not UNMEASURED. Each of the four routes: one `webgl2` context, `heldDraws` 0, WebGPU 0, workers 0.

Before (`webgl-lane.txt`, `webgl-clean.json`): clean leg FAIL, the only red per route being "requested WebGL extension(s) its policy does not list": the same eight names on all four routes (prize-draw 12 draws, prize-fireworks 24, prize-cards 25, prize-ladder 100). `WEBGL_debug_renderer_info` is the probe's own request, booked apart.

Edit: `src/play/_render-suspension.json`, `extensions` of `prize-draw`, `prize-fireworks`, `prize-cards`, `prize-ladder` set from `[]` to the probe's printed list, verbatim:
`ext_color_buffer_float, ext_color_buffer_half_float, ext_texture_filter_anisotropic, khr_parallel_shader_compile, oes_texture_float_linear, webgl_clip_cull_distance, webgl_multisampled_render_to_texture, webgl_render_shared_exponent` (the same set `croc-bite` carries). Copies: `render-suspension.before.json`, `render-suspension.after.json`.

After (`webgl-lane-after.txt`, `webgl-clean-after.json`): "webgl-pixels clean leg: PASS", stub-control leg FAIL on cue, 2/2 legs matched, lane exit 0. `npm run render-suspension-check` passes (18 routes, every adapter subscribes). `node --test scripts/webgl-pixels-probe.test.mjs scripts/play-top-band-probe.test.mjs`: 36 pass.
Not covered: extension names are what swiftshader accepted on this Mac; the CI runner is the same lane but a different machine.

## 3. play-top-band-probe

Chrome `--headless --disable-gpu --no-sandbox` on 9622.

    env BASE=http://localhost:4622 CDP_PORT=9622 node scripts/play-top-band-probe.mjs          # top-band.txt
    env BASE=... CDP_PORT=9622 BAND_OUT=<path> node scripts/play-top-band-probe.mjs            # top-band-run2.txt, top-band-measure.json

Run 1: `OK 68 screen(s) across 18 route(s) ... (edit control read forced on: prize-cards, prize-draw, prize-fireworks, prize-ladder)`, exit 0. It prints no boxes.
Run 2 (same dist, same Chrome, new tab, BAND_OUT set): exit 1, `prize-draw S3 320x568: declared route control absent (.pd-mc button:absent)` plus "the transition did not happen". So the verdict is NOT stable across two runs; cause not established (not run a third time; the two-attempt cap). Only run 2 has raw boxes (`top-band-measure.json`), all prize-draw rows:

| screen | width | `#play-exit` box (l,t,r,b) | `.pd-mc` box | overlap |
|---|---|---|---|---|
| S1 first screen | 320 | 6,6,50,50 | shown: 143.7,2,296,54 | none (mc.l 143.7 > exit.r 50) |
| D1 desktop | 1280 | 6,6,50,50 | shown: 1103.7,2,1256,54 | none |
| S2 | 320 | 6,6,50,50 | `.pd-mc` present, not shown | n/a |
| S3 | 320 | 6,6,50,50 | `.pd-mc` present, not shown, no `button` | n/a |

`.pd-mc` is therefore visible on the S1 and D1 screens (the carve-out's check runs there, pseudo 0, parts 2), but on S2 and S3 in run 2 it was not shown. Whether it was shown in run 1's S3 is unknown, since run 1 kept no JSON.
