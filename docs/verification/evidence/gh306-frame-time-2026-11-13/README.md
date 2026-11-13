# gh#306: frame time of the prize cards (deal, then rule + cut reveal), 200 names, 1920x1080, this Mac's real GPU

Date 2026-11-13. Owner ruling: measure on this Mac only. Demo page `/game/prize-cards/play/` (200 synthetic names, fixed seed), the shared reveal host's own sampler.

## Stated figures (median / p95 / max, ms; n = 5 measured full reveals after 1 discarded warm-up reveal)

| Step / phase | reveals | frames | RAF interval ms | CPU ms per advance |
|---|---|---|---|---|
| deal (all phases) | 5 | 1320 | 16.7 / 16.8 / 16.8 | 0.2 / 0.9 / 17.4 |
| deal `start` | 5 | 1315 | 16.7 / 16.8 / 16.8 | 0.2 / 0.9 / 1.5 |
| deal `deal:0` | 5 | 5 | 16.7 / 16.7 / 16.7 | 6.2 / 17.4 / 17.4 |
| reveal (all phases) | 5 | 1990 | 16.7 / 16.8 / 16.8 | 0.1 / 0.5 / 18.5 |
| reveal `start` | 5 | 244 | 16.7 / 16.8 / 16.8 | 0.1 / 0.4 / 1.3 |
| reveal `rule:0` | 5 | 1351 | 16.7 / 16.8 / 16.8 | 0.1 / 0.4 / 4.5 |
| reveal `cut:0` | 5 | 395 | 16.7 / 16.8 / 16.8 | 0.2 / 1.5 / 18.5 |

Reading: the page holds the display's 60 Hz cadence (16.7 ms median, 16.8 ms max) through every phase. Dropped frames: none seen (no interval near 33 ms; the must-red below shows the instrument would show one). CPU ms is small (median under 1 ms) apart from the occasional single heavy frame (max above); its cost is one-frame spikes, not sustained load. Held/hidden gaps excluded from frames: 0 (the first frame after any such gap has a null RAF interval and is left out of RAF stats; the load gap is recorded in samples.json and is not a frame). `start` is the span before the module's first beat, still animating.

## Machine

- Model Name: MacBook Pro; Model Identifier: Mac16,8; Model Number: Z1FF0004BTH/A; Chip: Apple M4 Pro; CPU string `Apple M4 Pro`; macOS 26.4.1 (Darwin 25.4.0)
- Chrome/157.0.8103.51, headless=new, `--use-angle=metal --enable-gpu --ignore-gpu-blocklist`
- WebGL unmasked renderer: `ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Pro, Unspecified Version)` (read in the page; the probe refuses SwiftShader or any software renderer)
- Viewport 1920x1080 CSS, DPR 1; WebGL canvas backing during the reveal 1920x1024 (the page's bar takes the remaining height)
- dist fingerprint: sha256 of `dist/game/prize-fireworks/play/index.html` = `0c9167db6f6e63a5a2e9137c523afedb9c91ea06e7bc845e719bf00309574278` (existing dist, not rebuilt)

## Method and commands

```bash
npx serve dist -l 4633
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --no-sandbox --use-angle=metal --enable-gpu --ignore-gpu-blocklist --remote-debugging-port=9633 --user-data-dir=<scratch> about:blank
GAME=cards OUT=docs/verification/evidence/gh306-frame-time-2026-11-13 node scripts/prize-reveal-frame-probe.mjs
```

The probe sets the sampler opt-in before the page loads, presses the page's own buttons with real mouse events, waits for the bar to offer the next control, and slices the sampler's frames per reveal. Run 0 is the warm-up (shader compile, lazy module load) and is kept in `samples.json` flagged `warmup`, never summarised. Percentiles are nearest-rank over frames pooled across the measured reveals. `samples.json` holds every frame (phase, rafMs, cpuMs) and gap.

## Must-red: the measurement moves when the machine changes

- `STALL_DRAW_MS=2` (every WebGL draw call spins 2 ms) raised CPU ms from median 0.3 to 8-18 ms per phase on fireworks and from 0.1-0.2 to 10-12 ms on cards, and put RAF p95/max at 33.4 ms on fireworks (dropped frames visible). Runs are in the session scratchpad, not committed.
- CDP `Emulation.setCPUThrottlingRate` 6 was tried first and FAILED as a control: an in-page busy loop slowed 16 -> 103 ms (the throttle works), but per-advance CPU ms did not rise (mean 0.38 -> 0.20 ms, 61% of frames read 0.0). The clock is 0.1 ms grained and the throttle does not slow sub-millisecond tasks measurably. Do not use CPU throttling to calibrate this probe.
- The sampler records frames only after the page opts in (0 otherwise); a software renderer makes the probe exit 2 and write nothing.

## What the numbers do NOT mean

- RAF interval is pacing: it shows frames arrived at the display cadence. It is capped by the 60 Hz display and cannot show headroom: a frame that costs 3 ms and one that costs 15 ms both read 16.7.
- CPU ms is main-thread submission time around `advance(tick)` (including render calls), not GPU execution time. The GPU can be the bottleneck and still show small CPU ms until its queue backs up, which would then appear as RAF intervals above 16.7. None did.
- One Mac (M4 Pro, a strong GPU). It says nothing about the owner's projector laptop, integrated GPUs, or other browsers. DPR 1 only; a projector at DPR 2 is 4x the pixels.
- Headless Chrome, no other page; a real browser with tabs and an extension load may differ. The 1920x1024 canvas is not exactly 1920x1080.
- Demo outcomes at one seed; other seeds change the cards and names, not the scene cost class.
