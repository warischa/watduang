# gh#316 marbles: the race paints again (PD-316-01), 2026-11-17

Finding: `../ui-audit-2026-11-17-gh315-318/gh316.md` § PD-316-01. In the 3D reveal no marble, glow or
streak painted at any width, on the demo page or the projector route.

## Root cause (proven)

three's render list `push` files a material with `transparent === true` into the transparent list and
everything else into the opaque list; the renderer draws the opaque list, then the transparent list,
and sorts `renderOrder` only inside each list. The marble `ShaderMaterial` and the glow and streak
`MeshBasicMaterial`s were opaque; the full-frame background `Panel` (renderOrder 0, an opaque night
ground painted edge to edge) is transparent. So the race drew first and the background overpainted it.
The plates, band, figure and pulse are transparent panels and survived, which is exactly the shots.

Proof is one variable: the fix adds `transparent: true` to those three materials and nothing else, and
the pixel scan goes from 0 to positive on every frame below. The controls stay painted: identical on
the demo mid frames, plates and band identical on the demo freeze frames, and every change explained
under the table.

Runner-up rejected: moving the background into the opaque list instead. The finish pulse (transparent,
renderOrder 5) would then still draw over the opaque race; the guard test reds on that mutant
(`mesh@5(transparent) is drawn after instanced@10(opaque)`).

## Instrument

Chrome 157, `--headless=new --use-angle=metal --enable-gpu --ignore-gpu-blocklist`, real GPU (in-page
renderer read: ANGLE Metal, Apple M4 Pro), own profile dir, viewport by
`Emulation.setDeviceMetricsOverride`, `innerWidth` read equal to the width asked. Drivers: the audit's
`probe/shoot.mjs` and `probe/projector.mjs` (here as `probe/*.txt`), patched only to record the 3D
canvas rect at the mid shot; `lib.mjs` and `ev.mjs` are the audit's, unchanged. `after/manifest.json` lists every shot of
the run, but only the mid and freeze PNGs are kept here; its `rect` field is set only on mid and freeze
rows (the patched driver carried the last rect into later rows, so those were nulled). Same frames as the
audit: demo mid = phase `cut:4` + 2.5 s, projector mid = `cut:0` + 3 s, freeze = last 3D frame of the
last heat with the canvas still up.

`probe/scan.py` maps the 1920x1080 board frame into the canvas rect and counts, in the lane band
(right of the plates to the track edge, lanes 1-20, the finish column excluded with 2 px padding):
lit pink/blue bodies (v > 0.65), the dim pink/blue family (streaks and stopped bodies), the glow
colour `#66541c`, gold (across marbles), light (white and lavender marbles, spec spots). Controls:
gold in the finish line, plate pixels (`#23214d` or gold) in the plates column, gold/light in the band.
`probe/runscans.py` runs it over every frame; all numbers are in `results.json`.

Detector calibration: an injected lit pink disc (board radius) in the unfixed 1440 mid frame counts
308 px; the unfixed frame counts 0. The first scanner counted 691 glow px on the unfixed 1920 frames:
the finish strip's antialiased edge at a non-integer scale. The exclusion was padded and every leg
re-scanned; all unfixed counters now read 0.

## Counts (n = 1 per frame)

Before = `before/` (this build, unfixed) at 1440; the audit's own shots at 1920 and projector.

| Frame | before pink/blue | after pink/blue (lit / dim) | after glow / gold / light | lanes hit | finish, plates, band before -> after |
|---|---|---|---|---|---|
| demo 1440 mid | 0 | 4009 (2755 / 1254) | 0 / 0 / 3038 | 0 -> 20 | identical |
| demo 1440 freeze | 0 | 2240 (0 / 2240) | 1356 / 1429 / 144 | 0 -> 17 | finish 1088 -> 1080, rest identical |
| demo 1920 mid | 0 | 6369 (4468 / 1901) | 0 / 0 / 4869 | 0 -> 20 | identical |
| demo 1920 freeze | 0 | 3581 (0 / 3581) | 2303 / 2352 / 238 | 0 -> 20 | finish 2748 -> 2690, rest identical |
| projector 1920 mid | 0 | 6338 (4412 / 1926) | 0 / 0 / 4867 | 0 -> 20 | finish, plates identical; band 22962 -> 20408 |
| projector 1920 freeze | 0 | 1848 (0 / 1848) | 2409 / 2359 / 356 | 0 -> 20 | finish 2748 -> 2715; plates 86067 -> 78049; band identical |

Control drops, explained (inferred, not counted): at the freeze an across marble sits on the finish
line (lane 2, visible in both demo freeze frames), and its shaded body and glow disc cover line pixels
that then fall outside the gold family. The
projector legs are a separate event each, drawn at random: the band's running count at the mid shot
and the freeze survivor set differ between the audit's run and this one, so the band and plate totals
differ with them. Every after frame was opened and checked by eye: marbles with a spec spot, streaks
trailing rolling marbles at mid, gold across marbles with their glow at the line and dim stopped
marbles short of it at the freeze, plates, finish line, top bar and band all painted above or below
the race as the layer order says.

"Lanes hit" counts lanes with at least 30 counted px. At the 1440 freeze it reads 17: stopped lavender
and white marbles are dim (`#5c5a80`, `#727280`) and no counter takes them, and at that scale the
remaining spec or edge pixels of three such lanes stay under 30 (inferred: 1920 reads 20 for the same
state). All 20 marbles are visible in the frame.

## 2D path unchanged

The 320 leg and the 1440 reduced-motion leg never mount the 3D canvas (`sawCanvas: false` both builds),
and their idle and result PNGs are byte-identical before and after (sha1 prefixes: 320 idle
46a2558c6690, 320 result db879f74ad80, 1440 rm idle 006c0a1cd513, 1440 rm result 90db4b8b44ca). The
after copies are not duplicated here.

## Console

No exceptions and no console errors on any after leg. Each demo 3D leg (1440, 1920) records one
context created and one `webglcontextlost`, as the audit's own `console.json` does for the same legs
(the projector driver records neither field); the shots are taken while
the canvas is up and rendering, so the loss is read as the reveal's teardown (inferred, its time was
not measured here).

## Not covered

The projector route was shot at 1920 only (its driver has no 1440 leg); 1440 is covered on the demo
page. n = 1 per frame. `astro check` was not run (the build passed; the edit adds one documented
material option). The Chrome profile dir lived in the session scratch dir.

## Guard

`src/play/prize-marbles/renderer/mount.test.mjs`, the renderOrder test: it rebuilds three's draw
sequence (opaque list by renderOrder, then transparent list by renderOrder) from the mounted scene and
requires it to be the renderOrder sequence, and requires each race mesh to draw after the background.
Unfixed code: red (`mesh@0(transparent) is drawn after instanced@10(opaque)`). Fixed: green.
