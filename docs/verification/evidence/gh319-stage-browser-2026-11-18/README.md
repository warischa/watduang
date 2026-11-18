# gh#319 projector stage — real-browser checks (2026-11-18, attempt 4: re-verify on the FINAL tree)

Verifies the held-picture composite on the built projector route and the three hold games' demo pages, in a
real browser, AFTER the cross-lineage review changed the mechanism. n = 1 per check. Paint order, paint
visibility, geometry and the accessibility tree only — NOT frame time.

**History: the attempt-2 shots showed the composite and were re-shot.** In `shots/a-held-zones-codebox-1440.png`
and `shots/b-held-flipcards-claim-1440.png` as first captured, the committed 2D frame painted through the held
canvas's transparent regions (2D chips doubled under the 3D zone chips, the legend doubled, the claim line
doubled) and the lifted code card floated over the picture with no veil and no surface of its own. Attempt 3
fixed that with a hidden frame; attempt 4 (this file) re-verifies on the final tree, where the hiding mechanism,
the release callback, the persistent-code lift and the claim gating all changed again. Every held shot below is
from attempt 4; the raw numbers are in `results.json`.

## How it was run

- `dist/` was ALREADY built from the final tree — **not rebuilt** for this attempt. Served with
  `npx serve dist/ -l 4322`. The built CSS carries the final mechanism
  (`[data-held] .pd-scaled{opacity:0;pointer-events:none}` and the `.pd-over .pd-fcode` lift rule), confirmed by
  reading `dist/_astro/play.*.css` before driving.
- Chrome 157.0.8103.79, `--headless=new --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader
  --no-sandbox --remote-debugging-port=9333`, own `--user-data-dir` under `/tmp`. NOT `--disable-gpu`
  (a WebGL route needs a live context; `docs/agents/browser-verification.md`).
- Probe: `probe/gh319-browser.mjs`, driven over raw CDP by `probe/lib.mjs` (reused verbatim from the archived
  ui-audit harness): real viewport emulation (`innerWidth` read back equal to the asked width in every row),
  real touch taps past the arm window, and the in-page WebGL instrument. Attempt 4 extends the probe with the
  opacity/pointer-events paint reads, the closed-card `.pd-fcode` lift, the admin-mode finals, the resize
  release, and the accessibility-tree check. Full stdout in `probe/run.log` (`PROBE_RC=0`, 16/16).
- QR events are seeded through the event domain (`src/prize-event/event.ts` `createEvent`/`drawNext`/`advance`/
  `pickObject`, `qr: { pin: '048213', roster }` → `eventKey` is the 6-digit pin → `isQrEvent`); admin events omit
  `qr` (hex key → not QR). Written to the route's IndexedDB (`watduang-prize-draw` / `event` / `current`) and
  resumed. The setup page's QR flow needs the join server, which is not run here.
- WebGL2 read LIVE in-page for every held check (`__wd.ctx`): renderer `ANGLE (Google, Vulkan 1.3.0
  (SwiftShader Device (LLVM 10.0.0)), SwiftShader driver)` — a software rasteriser, fine for paint order and
  geometry; this evidence makes no frame-time claim.
- Teardown by the pids started (harness task stop); `lsof -ti:4322,9333` empty at the end.

## The mechanism being verified (final tree)

- `stage.ts` / `demo.ts` `syncHeld` marks the viewport `data-held` while a hold game's picture is up and lifts
  `.pd-veil` then `.pd-codebox` into `.pd-over`. The shared rule in `reveal.css`
  (`:is(.pd-viewport, .pr-viewport)[data-held] .pd-scaled { opacity: 0; pointer-events: none }`) stops the frame's
  PAINT while keeping its DOM, its layout AND its place in the accessibility tree (attempt 3 used
  `visibility: hidden`, which dropped the frame from the a11y tree; the canvas is `aria-hidden`, so the frame must
  stay exposed). `pointer-events: none` keeps the invisible frame from taking taps.
- Once the code card closes, `syncHeld` also lifts the persistent final code `.pd-fcode` into `.pd-over` (never
  over the open card). The frame's picked values are declared for `.pd-scaled` AND `.pd-over` so a lifted node
  keeps its night surface.
- The host (`game-host.ts`) releases a held picture on dispose, reduced motion, narrowing, a lost context, a throw
  AND **any resize while held**, and tells the caller through `onRelease`; the caller clears `data-held` and draws
  the 2D frame back in one render. `pagehide` disposes.
- `RevealInput.claim`: the envelopes/flipcards renderers paint the claim line ONLY in QR mode; admin-mode finals
  and the demo paint none, and the 2D frame draws none either (`screenView` reads the same fact).

## (a) Held zones round, 1440×900 — PASS, card open and closed, then context loss

`elementFromPoint` inset off the edges never returns the canvas: card centre → `div.pd-digits`; close centre →
`button.pd-go`; MC after close → `button.pd-go` (รอบต่อไป). Paint open: `data-held`, `.pd-scaled` computed
`opacity: 0` / `pointer-events: none` / `visibility: visible`, overlay `[pd-veil, pd-codebox]`, no claim node.
Negative control on the paint read: mark removed → `opacity 1 / pointer-events auto`; restored → `0 / none`.
Closed: overlay empty, mark present, frame still `opacity 0`. Forced context loss releases: canvas gone, mark
cleared, `opacity 1`, screen still `reveal`. Held settle 9.0 s. Shots `a-held-zones-codebox-1440`,
`a-held-zones-codeclosed-1440`.

## (b) Held envelopes / flipcards final, QR mode, 1440×900 — PASS, card open and closed

Open: overlay `[pd-veil, pd-codebox]`, one claim (the invisible frame's), `.pd-fcode` still in the frame (not over
the open card); card + close hit-testable. Closed: overlay `[pd-fcode]`, `.pd-fcode` computed `opacity 1 /
visibility visible` and hit-testable (`span.pd-ed`); one claim in the document (frame's), no DOM claim over the
picture; MC bar empty by design (a revealed final has no step-forward control). Envelopes fcode
`รหัสรอบชิง 0042 024` at rect (1103,73,295×72); flipcards `รหัสรอบชิง 0154 820` at (1107,73,291×72). Flipcards then
releases by emulated reduced motion (canvas gone, mark cleared, `opacity 1`). Held settle ~37.5 s each.
The attempt-4 top-right fcode/HUD overlap is FIXED (CSS only, below): the closed-state code now reads cleanly on
an opaque backing with no label/dots through or around it. Shots `b-held-<game>-codebox-1440` (open, unchanged),
`b-held-<game>-claim-1440` (closed, re-shot clean), plus the e-control `e-claim-dom-removed-1440` (frame claim
node removed while held → the picture's single claim line remains).

## (c) Free-name row, pick screen — PASS (both finals × 640/720/845), unchanged by the fix

Row top (frame px, `--names-y`): envelopes 272 / 299.5 / 342.47; flipcards 292 / 322 / 368.875. Every row: 0
plate-control overlaps, row bottom ≤ band top, row right within viewport, band bottom within scroll box.
Shots `c-row-<game>-<width>`.

## (d) Hold games' demo pages, 1440×900 — PASS (zones, envelopes, flipcards)

Each demo held at settle: `data-held`, `.pd-scaled` `opacity 0 / pointer-events none`, overlay present (empty —
demo is not QR), **0 claim nodes**, bar `ดูอีกครั้ง` hit-testable over the picture (`button.pr-go`). Narrowing to
500 px releases on every page (canvas gone, mark cleared, `opacity 1`). Shots `d-held-<game>-1440`.

## (f) Held ADMIN-mode finals (no QR), 1440×900 — PASS (envelopes, flipcards)

No code card, no `.pd-fcode`, overlay empty, **0 claim nodes anywhere** (`claimPoint` absent), MC bar empty. The
claim detector is calibrated both ways across the run: (b) QR sees exactly one frame claim, (f) sees zero.
Shots `f-held-<game>-admin-1440` show no claim line and a clean top-right (no fcode to collide).

## (g) Held zones round resized to 1024×768 — PASS (release to the 2D result)

Held with the card closed (`data-held`, canvas up), then `Emulation.setDeviceMetricsOverride` to 1024×768:
`innerWidth` 1024, canvas DETACHED (no stretched canvas), mark cleared, `.pd-scaled` `opacity 1`, screen `reveal`,
52 chips drawn. Shot `g-resize-release-1024`.

## (h) Accessibility tree while held (flipcards QR final, card closed) — PASS

`.pd-scaled` computed `opacity 0`, no `aria-hidden` on `.pd-scaled` or `.pd-frame`; canvas `aria-hidden="true"` and
ABSENT from `Accessibility.getFullAXTree` (0 canvas nodes). Both winner names the 2D result draws (P42, P21 — one
per prize) are non-ignored `StaticText` AX nodes INSIDE `.pd-frame` (attributed via `DOM.resolveNode` +
`parentElement.closest`, because a StaticText's backend node is a Text node). Instrument must-red: `aria-hidden`
on `.pd-scaled` drops the in-frame name matches to 0; removing it restores 2. 67 AX nodes total. Shot
`h-a11y-held-flipcards-1440`.

## Defect found and FIXED (CSS only, `src/play/_prize-reveal/reveal.css`)

**The defect (attempt 4 first pass):** after `ตกลง`, `syncHeld` lifts `.pd-fcode` to the top bar's right end, but
the envelopes/flipcards renderers (shared `prize-fireworks/renderer/paint.ts` `paintTop`) already paint their own
round label + progress dots in that same band (cy 48, group right edge 1864, dot glow ~18px beyond → painted
region ≈ x1436–1882, y19–77 in frame px). The transparent lifted code double-printed over them into a garbled
smear. Visible then in `b-held-*-claim-1440`, `e-claim-dom-removed-1440`, `h-a11y-held-flipcards-1440`.

**The fix:** scoped to `.pd-over .pd-fcode` only — `background: var(--color-line-strong)` (the frame night
gradient's 0% stop, i.e. the top-bar ground; no new colour/token) plus `padding: 0 56px 0 40px` and
`inset-inline-end: 0` (was 56px). The right 56px padding keeps the glyphs at the bar's own 56px end while the
opaque box runs to the frame edge (1920) to swallow the dot glow; the left 40px reaches past the painted label's
left edge; the existing 96px bar height already spans the painted band (y19–77). Measured backing on screen at
1440: envelopes rect (1075,73,365×72), flipcards (1079,73,361×72) — right edge at the viewport edge, hit test still
`span.pd-ed`. With no `.pd-fcode` lifted (card open, demo, admin) the selector matches nothing, so those screens
are byte-identical in behaviour. Rebuilt once, probe re-run 16/16, re-shot closed states read cleanly.

## Shot verdicts (every shot opened and judged by eye)

- `a-held-zones-codebox-1440`: PASS — card opaque on its veil and readable; one chip set + one top bar (the
  picture's, dimmed under the veil); MC ตกลง + exit visible; no 2D text through.
- `a-held-zones-codeclosed-1440`: PASS — full-brightness picture, one chip set / one legend / one top bar; MC
  รอบต่อไป + exit visible; no doubling.
- `b-held-envelopes-codebox-1440`: PASS — card opaque on veil, readable, earlier-round codes listed; one dimmed
  heading + one dimmed claim under the veil; no 2D through.
- `b-held-envelopes-claim-1440`: PASS (re-shot after the CSS fix) — code `รหัสรอบชิง 0503 225` reads cleanly on its
  opaque backing; no label/dots through or around; one heading / plate row / claim line.
- `b-held-flipcards-codebox-1440`: PASS — card opaque on veil and readable; one dimmed heading + claim; no 2D through.
- `b-held-flipcards-claim-1440`: PASS (re-shot after the CSS fix) — code `รหัสรอบชิง 0358 322` reads cleanly on its
  opaque backing; no label/dots through or around; one heading / plate row / claim line.
- `e-claim-dom-removed-1440`: PASS as control — with the frame claim node removed, exactly one clean claim line
  remains (the picture's); top-right code clean on its backing.
- `c-row-envelopes-640 / 720 / 845`: PASS — name row below the plates, above the band, within the viewport, no
  overlap or clipping at any width.
- `c-row-flipcards-640 / 720 / 845`: PASS — same, card plates instead of envelopes.
- `d-held-zones-1440`: PASS — picture only, one chip set / legend / top bar; demo badge + ดูอีกครั้ง visible; no claim.
- `d-held-envelopes-1440`: PASS — picture only, one plate row, NO claim line; badge + step pills + ดูอีกครั้ง visible;
  top-right picture chrome clean.
- `d-held-flipcards-1440`: PASS — picture only, one plate row, NO claim line; bar + badge visible; top-right clean.
- `f-held-envelopes-admin-1440`: PASS — NO claim line anywhere; top-right clean (no fcode); one plate row.
- `f-held-flipcards-admin-1440`: PASS — NO claim line anywhere; top-right clean; one plate row.
- `g-resize-release-1024`: PASS — the 2D reveal drawn back at 1024×768 (chip grid, top bar, flow, legend), no canvas,
  no stretch, correctly letterboxed.
- `h-a11y-held-flipcards-1440`: PASS (names in a11y tree; re-shot after the CSS fix) — top-right code clean on its
  backing; one heading / plate row / claim line.

## Node suite and gates

`node --test 'src/play/prize-draw/*.test.mjs' 'src/play/_prize-reveal/*.test.mjs'`: **425 pass, 0 fail** (attempt 3
recorded 399; the review added tests). Re-run after the CSS fix: still 425/0. `node scripts/thai-comments.mjs`,
`added-lineno-citation-check.mjs`, `check-citations.mjs`, `evidence-local-path-check.mjs`,
`accent-single-source-check.mjs` all exit 0 (the three required after the fix — accent-single-source,
thai-comments, added-lineno — re-run exit 0). `npx astro check` after the fix: **0 errors, 0 warnings**.
`npm run build` re-run once for the fix (41 pages); the built CSS carries the new `.pd-over .pd-fcode` rule.
