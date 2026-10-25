# gh#288 Phase 3 — reload-from-mid-page CLS on `/`, pre-Phase-3 vs HEAD

Question: is the 0.0531 (320px) in `../browser/README.md` failure 4 introduced by Phase 3?
Legs: base = b91a52b (what production serves), head = deb8766; each `npm run build` in its own detached worktree
(shared node_modules), `npx serve dist` on 4344 / 4345, one Chrome 155.0.8059.85 `--headless --disable-gpu`, CDP 9555, fresh profile.
Sequence = `../browser/probe.mjs` scrollReveal(): load `/`, scroll to first `.reveal-pending` (900 ms), scroll to
(scrollHeight-innerHeight)/2, `Page.reload`, wait 900 ms, read CLS (layout-shift, not hadRecentInput). `run.mjs` is the driver
(own CDP client; same emulation, mobile:false, 320x640 / 390x844, reduced via setEmulatedMedia, asserted per run: 40/40).
n=5 per cell per leg, interleaved base/head, results in `results.json` (every run, with LayoutShift sources).
Base has no reveal-pending, so its first scroll is a no-op; the mid-page scroll and reload are identical on both legs.

| cell | base median (range) | head median (range) |
|---|---|---|
| 320 normal  | 0.0531 (0.0531-0.0531) | 0.0531 (0-0.0531; 1 run 0) |
| 320 reduced | 0.0531 (0.0531-0.0531) | 0.0531 (0.0531-0.0531) |
| 390 normal  | 0.0047 (0.0047-0.0047) | 0.0047 (0-0.0047; 1 run 0) |
| 390 reduced | 0.0047 (0.0047-0.0047) | 0.0047 (0.0047-0.0047) |

Attribution (worst base run and worst head run are the same shape): one shift at t=21-23 ms after navigation start,
source `div.band`, previous rect = current rect = [0,0,320,640] (viewport-clipped; the band is a tall block, its clipped
rect cannot show the move). So the shift lands at first render, before any script or Phase 3 effect could act; consistent
with scroll restoration on reload landing against a not-yet-final layout. The 0-valued runs (1 per leg-lane, head only)
show the shift is a timing race on first paint, not a head-specific fix.

Verdict: PRE-EXISTING, not a Phase 3 regression. Base reproduces 0.0531 at 320 in 10/10 runs, head 9/10 (+1 zero).
Not covered: why the band shifts (no band-internal rect available; cause inferred, not proven), real devices, touch, Safari/Firefox.
