# gh#305 prize-draw playthrough, real GPU, 2026-11-13

First run of the three 3D game modules (fireworks, cards, ladder) in a real Chrome 157 against the existing `dist/`
(no build, no source edit). Readings are in `results.json`; PNGs are gitignored. Driver: `drive.mjs.txt`
(copy to `drive.mjs` to run).

## Instrument

- Launch: `Chrome --headless=new --no-sandbox --use-angle=metal --enable-gpu --ignore-gpu-blocklist --remote-debugging-port=9611 --user-data-dir=<scratch>/chrome-9611 about:blank`; `npx serve dist -l 4611`.
- Renderer on every 3D page: `ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Pro, Unspecified Version)` (vendor `Google Inc. (Apple)`). Not SwiftShader. 60 rAF/s, `visibilityState=visible` (key `probe`).
- Known values read back: setup `document.title` = `จับรางวัลปีใหม่ — เกมงานเลี้ยงบริษัท คัดชื่อออกทีละรอบบนจอใหญ่`; projector title `จับรางวัลปีใหม่ — จอใหญ่`; stored event `heads=30`, `prizes=3`.
- Must-red: with `getContext('webgl*')` forced to null the same read returns `gl:false` (key `probe.glForcedOff`), and the 3D leg then shows no canvas and no `three` chunk (6b). Chunk detector positive control: the normal run fetches `three.module.BRVBmMrM.js` (identified by name against `dist/_astro`; `WebGLRenderer` content also present).
- How "running" is derived: `game-host.ts` exposes no state on `window` or the DOM (the brief says it does; it does not). Used instead: a canvas under `.pr-host` attached then detached (timeline), the host's own frame sampler (`__watduangRevealFrameTime`, opt-in, frames and phase labels advancing), and `fillText` capture. Fallback reason is therefore inferred, not read.
- Ceiling: names, counts and prizes painted into 3D textures were read from the captured `fillText` calls and screenshots; survivor equality below is DOM chips (the 2D view the host draws on exit) against the stored round. The 3D scene's own survivor lanterns/cards were checked visually, not by pixel assertion.

## Verdicts

| # | Scenario | Verdict | Decisive reading |
|---|---|---|---|
| 1 | Setup, 30 names, picks, 3 prizes | PASS | stored `games = {rounds:[fireworks,cards,null,null], final:ladder}`, 3 prizes, 30 heads, schedule 30/20/10/7; navigated to `/game/prize-draw/play/` |
| 2 | Round 1 fireworks | PASS | canvas mounted 20.0 s, 1193 frames, phases `cut:0..cut:4`, then 2D; chips `.in` set equals stored survivors (20) |
| 3 | Round 2 cards | PASS | deal: canvas ~0.7 s (`deal:0`), stored `prepared.game=cards`, rounds stayed 1 after a double-tap (touches 60 ms apart); reveal: 7.6 s, phases `deal:0`,`rule:0`, rule index 1, survivors equal stored. Early tap: the new `เปิดผล` button was `disabled` inside the arm window and nothing fired (rounds stayed 1); the later tap fired. |
| 4 | Rounds 3-4 plain | PASS | no canvas, no new GL context, `game:null`, chips equal stored (7, 5) |
| 5 | Ladder final | PASS | draw button disabled until 5 picks; 2D lane frame slots equal stored `prepared.slotRanks`; 3D canvas 34.7 s, phases `prize:*` all 5 slots; result DOM = `order[0..2]` with prize names; `ไม่มีรางวัล` painted 6 times in 3D; `order[slotRanks[permutation[lane]]]==picks[lane]` holds |
| 6a | Reduced motion | PASS | `matchMedia` true, no canvas, no GL context, no `three` chunk requested, survivors equal stored |
| 6b | WebGL off | PASS | host `getContext` returned null, no canvas, no `three`, survivors equal stored; setup page showed the no-3D note and kept the picks |
| 6c | `loseContext()` mid-reveal | PASS | lost at frame >=400 (about 7 s in), canvas removed within 7 ms, 2D shown, survivors equal stored, `รอบต่อไป` back |
| 7 | Demo pages | PASS | all three render 3D (200 heads) and replay (`ดูอีกครั้ง`) re-runs 3D: fireworks round 21 s / final 14 s, cards deal 5 s + reveal 7.5 s, ladder 34 s; each run twice |
| 8 | 320 px | PASS | `innerWidth=320`, no horizontal overflow, `.pd-field` 2 columns on round and reveal, MC button (169..296 px) and `#play-exit` (6..50 px) do not overlap. 2D event only. |
| 9 | Join page | PASS | `#event=x&pin=000000` stripped from the URL, page shows `ไม่พบงานนี้ ลองสแกน QR บนจออีกครั้ง`, no console error. `event=x` is probably rejected before any request (no request seen), so the backend path was not exercised. |

## Console and context events

- Errors and warnings across all legs: none from the 3D modules, no shader compile error, no `Log` entries.
- One uncaught exception on the setup-to-play navigation, in every leg that drives setup: `InvalidStateError: Transition was aborted because of invalid state. ViewTransition opt-in disabled`. Not seen on direct navigations (demos, join). Unattributed.
- One warning, only in 6c: `THREE.WebGLRenderer: WEBGL_lose_context extension not supported.` (teardown after the context was already lost).
- `webglcontextlost`: every one is at the host's teardown (canvas already disconnected) except the forced one in 6c; none while a reveal was running. The setup page's capability probe also creates and releases a context.

## Observations that need an owner look

- Ladder reveal, frames `s5-ladder-06.png` and `s5-ladder-12.png`: while the camera follows a runner the slots at the edges are clipped and the hud text (`เปิดทางทีละคน` / `ทางแยกเลือกเส้น`) is drawn over a slot card. Frame 01 clips the plate names at the bottom edge. Could be the intended pan; the board was not compared.
- `dist/` is older than `src/play/prize-draw/play.css` (12:17 vs build 12:14): the css edit is not in what was tested.

## Commands

```
npx serve dist -l 4611 &        # then Chrome as above, CDP_PORT=9611
node drive.mjs probe            # instrument check
node drive.mjs main             # scenarios 1-5 in one tab, one event
node drive.mjs 6a ; node drive.mjs 6b ; node drive.mjs 6c
node drive.mjs 7 ; node drive.mjs 8 ; node drive.mjs 9
```

Not covered: touch devices, a 3D reveal at 320 px, Safari/iOS, long-run context loss, any backend.
