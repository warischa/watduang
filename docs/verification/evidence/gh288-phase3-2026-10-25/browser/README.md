# gh#288 Phase 3 — web-page effects in real headless Chrome

HEAD 60e2632, fresh `npm run build`, `npx serve dist -l 4333`. Chrome 155.0.8059.85 `--headless --disable-gpu`,
CDP 9444, fresh profile. Bangkok day 2026-10-25 (daytime; far from the UTC 17:00 date-key boundary).
Emulation (CDP, not window-size): `Emulation.setDeviceMetricsOverride` w x h (320x640, 390x844, 1440x900, mobile:false,
so hover is native and an overflow cannot hide behind a grown layout viewport), `Emulation.setEmulatedMedia`
prefers-reduced-motion reduce|no-preference, `setFocusEmulationEnabled`. Real Tab = `Input.dispatchKeyEvent`; real
mouse = `Input.dispatchMouseEvent`. Every run asserts in-page: innerWidth, matchMedia reduce, hover (78/78 ok).
Re-run: `probe.mjs` (one width+lane per run) then `node aggregate.mjs`. Raw: `results-<w>-<lane>.json`,
`assertions.json` (every assertion with its measured value), `summary.json`. Screenshots: 78 JPEG q70
`<page>-<w>-<lane>.jpg`, full page at load (below-fold home/party sections are legitimately hidden-pending there).

## Failures (all reproduce at every width and in both lanes unless noted)
1. `/tool/wheel/` disabled `.wheel-spin`: opacity 0.4 but box-shadow `rgb(20,20,43) 4px 4px 0 0` (want none) and
   cursor `pointer` (want default). No lift on hover (ok). 6/6 combos. The other three tool go buttons pass.
2. web -> play route real link click (`/c/party/` -> `/game/timebomb/play/`): lands and works, but the browser raises
   `InvalidStateError: Transition was aborted because of invalid state. ViewTransition opt-in disabled` as an uncaught
   exception. Reproduced by `vt-error-control.mjs` with NO probe-injected script (web -> web: 0 errors). 6/6 combos.
   Consequence of the opt-in being on web pages only; harmless to the player, noisy in a console-error gate.
3. Brief premise not met: fortune pages (siamsi, love-match, daily-fortune) have no `role=status` node at all
   (0 found); the result text is in `#stage` only. Tool pages do carry it. 9/9 combos x3.
4. Beyond the brief: CLS in the document reloaded from mid-page: `/` at 320 = 0.0531 (>0.05), both lanes. Load +
   first-interaction CLS is within bound everywhere (see 9).

## Assertions (pass/total over 3 widths x 2 lanes)
- 0 lane proof (reduce/hover/innerWidth match) 78/78; no script errors.
- 1 Focus, real Tab: 72/72. 3px solid, offset 3px, ink rgb(20,20,43); gold rgb(255,204,0) inside chrome-bar/band.
  Must-red: play route (no web.css) Tab ring is browser default/2px sky, never the web ring (`focus-must-red.json`).
- 2 Hover/press: enabled go 24/24: hover delta -2,-2 and shadow `6px 6px 0 ink`; press 4,4 and `0 0 0`
  (reduced: delta 0,0, shadows same). Disabled go 18/24 (failure 1; others opacity 0.4, shadow none, cursor default).
  Fortune `.game-btn` no ui-press and no lift 18/18.
- 3 Tool pages 90/90: one `.tool-band`, label "ช่องโฆษณา", no "728", dashed; draw/team idle dashed box visible;
  wheel idle disc drawn (9 sectors); ad box identical idle vs after result. Ad box (x,y,w,h), normal lane:
  320: draw 20,1866,280,250 · team 20,1630,280,250 · number 20,1231,280,250 · wheel 16,1961,288,250;
  390: draw 20,2069,350,250 · team 20,1833,350,250 · number 20,1117,350,250 · wheel 16,2181,358,250;
  1440: draw 250,1846,940,250 · team 250,1747,940,250 · number 250,920,940,250 · wheel 448,2136,544,250.
  (wheel's slot is 4px wider each side at 320/390 than the other three; reduced lane identical.)
- 4 Reveal: tools 24/24 (`wd-reveal` 280 ms / `wd-reveal-rm` 200 ms on the result node, role=status text = result).
  Fortune: animation present 18/18, idle-stage control (0 anims before click) 18/18, reveal ends before arm 18/18 with
  margin 107-111 ms normal, 187-193 ms reduced; live region 0/18 (failure 3).
- 5 Scroll reveal 36/36 (`/`, `/c/party/`): no pending above fold, none on ad/hero/stage, pending at load with translate
  `0px 16px` (reduced `none`), scrolled in -> opacity 1, translate none, classes gone; reload from mid-page: 0 pending.
- 6 Hero 6/6: `.ambient` aria-hidden, opacity 0.12 + running transform animation (reduced 0.06, no animation).
- 7 View transitions 90/96: `@view-transition` rule on all 11 web pages + 404 and absent on the play route (all pass);
  web -> web click lands with `viewTransition` finished 6/6; web -> play lands, play has controls, no VT, no rules, but
  6 console exceptions (failure 2); play route has no ui-press/wd-reveal/reveal-pending 6/6.
- 8 Smoke: every tool yields a result; siamsi (hold -> slip -> keep -> again), love-match, daily-fortune ("again" redraws a
  result; no start screen exists) all complete, 198/198; per-page console errors 0 (failure 2 is only in the click-through); no 4xx
  subresources. 9 Layout: scrollWidth == clientWidth and innerWidth == width 78/78; CLS (load + interaction) 78/78, max 0.0078.

## Not covered
Real devices and touch (mouse emulation only, mobile:false), Safari/Firefox, real AdSense, GPU (software `--disable-gpu`),
play-route WebGL, back/forward navigation, view-transition visual frames (only completion), `/tools/` and `/c/fortune/`
interaction beyond focus, and the 4 tool pages' behaviour with 0-1 names.
