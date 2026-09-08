# WebGL pixel readback on iOS Simulator WebKit — one-bomb / pinocchio-luck

## What this proves

On this machine's iPhone 17 Simulator (iOS 26.5, UDID
`721ACACC-7BC9-4079-B57E-974AEFB1BBB0`), Mobile Safari gives the local origin a live WebGL
context (`getContext('webgl')` returns non-null, `isContextLost()` is false) for both routes
that construct one, and — with each route's own round-started DOM observable confirmed true
first (`#menuOverlay`/`#hud` classes for one-bomb, `#roundTag` text for pinocchio-luck; never
inferred from the drive click landing) — a `requestAnimationFrame`-timed `readPixels` over a
12x12 grid spanning the whole canvas region sees more than one distinct colour and non-zero
coverage after that round starts. Viewport: iframe `innerWidth`/`innerHeight` 390x844,
`devicePixelRatio` 3, hosting-page `innerWidth` 980 — Safari's default desktop-shaped layout
viewport for a page with no `<meta name="viewport">` tag (the probe page has none); `inferred`,
not tested by actually adding the meta and re-measuring. The iframe's
own 390x844 comes from its CSS size, not from any viewport meta. `one-bomb`'s drawing buffer is
780x1688 (390x844 x 2), because its own engine caps `devicePixelRatio` at 2
(`Math.min(window.devicePixelRatio || 1, 2)`) rather than using the reported 3 directly.

| route | verdict | roundStarted | renderer (verbatim) | grid colours (of 144 sample points) | coverage |
|---|---|---|---|---|---|
| one-bomb | **PASS** | true | `Apple GPU` | 15 | 0.4519 |
| pinocchio-luck | **PASS** | true | `Apple GPU` | 19 | 0.2131 |

The verdict column above is read straight off `webgl-pixels-ios.json`'s own `verdict` field
per row (three rows: the two routes above, plus the must-red calibration row below) — that
JSON, POSTed by the probe page itself, is the evidence for this table, not a screenshot.
Screenshots exist too (`one-bomb-pass.png`, `pinocchio-luck-pass.png`, `one-bomb-stub-fail.png`)
but are untracked, locally-regenerable corroboration only — see "What's tracked" below.

## What this does NOT prove

- **This says nothing about real iPhone hardware.** iOS Simulator WebKit renders using this
  Mac's own GPU via a software/host-passthrough path, not an actual iPhone's GPU or driver
  stack. The renderer string `Apple GPU` is what Simulator WebKit reports here; a physical
  device may report a different string and different behaviour. This result is `assumed` to
  transfer to real hardware, not `confirmed` for it.
- **It does not speak to ADR-0051's reopen clause.** That clause names what would reopen the ADR:
  "a measurement showing the audience's real devices support WebGL well enough that the blank-page
  path is not reachable in practice, together with a fallback that keeps the page usable when it
  is." A Simulator run is explicitly not a real-device measurement (see the bullet above), so this
  pass does not meet that bar and does not reopen or close the ADR.
- It does not test a real touch event. The routes were driven via a same-origin iframe +
  `.click()` controller page (`docs/agents/ios-webkit-verification.md` Technique 3) — the real
  click handlers ran in the real WebKit engine, but no `touchstart`/`touchend` or tap-translation
  timing was exercised.
- It covers exactly the two routes that construct a WebGL context (`one-bomb`, `pinocchio-luck`).
  `timebomb` and `short-stick` are 2D-canvas routes and are out of scope, unchanged by this pass.
- The repo's existing swiftshader lane (`scripts/webgl-pixels-lane.sh`) already proves "a live
  context draws" on Linux/Chrome; this pass adds only the WebKit dimension on top of that,
  nothing else.

## What's tracked, what's not

`webgl-pixels-ios.json`, `probe-page.html`, and `collector.mjs` are tracked — the JSON is the
evidence for every verdict in this document, and the other two are the instrument that produced
it and regenerates it (see "How to regenerate this" below). The three `.png` files in this
directory are **gitignored** (repo-wide rule: probe screenshots regenerate on every evidence run,
so the JSON log is the evidence, not the image) and stay that way here on purpose: this repo also
carries a narrow carve-out that keeps screenshots for a run where there was no inspector to
produce a log, so the image was the only artifact — but this run's probe page computed its own
record and POSTed it to a local collector before any screenshot was taken, so a log exists and
the carve-out's condition is not met. The screenshots that ship alongside this README are a local
convenience a reader can regenerate with the steps below; nothing in this document depends on
them existing or being readable by anyone who clones the repo without re-running the probe.

## How to regenerate this

1. `npm run build` (produces `dist/`).
2. Copy `probe-page.html` into the build as `dist/_webgl-ios-probe/index.html`.
3. Serve it: `npx serve dist -l 4592`.
4. Start the collector in another terminal: `OUT_FILE=<path-to-json> node collector.mjs` (listens
   on `localhost:9333`; see `collector.mjs`'s own `OUT_FILE`/port).
5. On a booted iOS Simulator device, drive each route: `xcrun simctl openurl <udid>
   http://localhost:4592/_webgl-ios-probe/?route=<one-bomb|pinocchio-luck>[&stub=1]`. The page
   drives the round itself and POSTs its computed record to the collector — the growing
   `OUT_FILE` is the regenerated `webgl-pixels-ios.json`.
6. Optional corroboration screenshot, once the on-screen verdict text is visible: `xcrun simctl io
   <udid> screenshot <path>.png`.

## Method

No CDP/inspector exists on the iOS Simulator path (`docs/agents/ios-webkit-verification.md`).
A throwaway capability page (`dist/_webgl-ios-probe/`, not committed — it is build output) was
served from the same local origin as the built site (`npx serve dist -l 4592`) and opened via
`xcrun simctl openurl <udid> http://localhost:4592/_webgl-ios-probe/?route=<id>`. The page:

1. Loads the real built route in a same-origin `<iframe>` (visible in layout, not
   `display:none`/off-screen — an off-screen iframe was tried first and its
   `requestAnimationFrame` callbacks never fired within the 4s deadline, read as UNMEASURED; an
   on-screen iframe fixed this, see Attempt log below).
2. Drives the round start the way a player would: for `one-bomb`, waits past its 900ms arm-gate
   window and clicks `#startPlayBtn`; for `pinocchio-luck`, seeds `watduang:roster`/
   `watduang:group` in `localStorage` and reloads the iframe so its own `roster-bridge.ts`
   auto-presses `[data-act="start"]` (recipe already in the driver playbook).
3. Reads a real, route-specific round-started observable off the iframe's own DOM — one-bomb:
   `#menuOverlay` carries `hidden` and `#hud` does not (both flip in `startGame()`); pinocchio-luck:
   `#roundTag` text left its initial `ตั้งวง` and `#app` does not carry `no-webgl`. This is gated
   on the observable effect, never assumed from the drive click having been dispatched.
4. Polls for the first `<canvas>` that hands back a WebGL context, reads
   `WEBGL_debug_renderer_info` / `UNMASKED_RENDERER_WEBGL`, and does a `readPixels` over the
   full drawing buffer **inside a `requestAnimationFrame` callback** (an ordinary-task readback
   reads zeros forever — the same timing note `scripts/webgl-pixels-probe.mjs` carries), sampling
   a 12x12 grid across the whole region (never a centre line) plus a full-buffer modal-colour
   coverage number, for 3 frames, keeping the strongest.
5. Classifies PASS / FAIL / UNMEASURED with UNMEASURED never relaxing to PASS (same three-state
   shape as `scripts/webgl-pixels-probe.mjs`'s `classify()`, reimplemented in the page rather than
   imported, since it runs in a browser context here, not Node) — and downgrades a PASS to
   UNMEASURED if the round-started observable (step 3) came back false, since a draw cannot be
   attributed to "after a round starts" without it.
6. Prints the record, including `roundStarted` and the viewport numbers, as large on-screen text
   (this is what the screenshot shows) and also `fetch()`-POSTs the same record to a throwaway
   `localhost:9333` Node collector, so the tracked JSON is the page's own computed value, never
   hand-transcribed off a screenshot.

## Calibration (must-red before the green is trusted)

`?stub=1` monkey-patches `drawArrays`/`drawElements` to no-ops on the live `WebGLRenderingContext`
prototype after the context exists (same technique `scripts/webgl-pixels-probe.mjs`'s
`STUB_DRAW` uses) — the engine keeps running and keeps clearing, but never draws.

- **Must-red (one-bomb, `stub=1`):** `contextLive: true`, `renderer: Apple GPU`, grid colours
  **1/144**, coverage **0** → verdict **FAIL** — the `stub: true` row in `webgl-pixels-ios.json`.
  Untracked corroboration: `one-bomb-stub-fail.png`.
- **Green (one-bomb, no stub):** grid colours 15/144, coverage 0.4519 → verdict **PASS** — the
  `one-bomb`, `stub: false` row in the same JSON.

The classifier told the two apart correctly; the instrument is trusted for the real reads above.

## Attempt log (2 attempts, per the 2-attempt cap)

1. **Attempt 1** — iframe positioned off-screen (`left:-9999px`) to keep the controller page
   clean. Both routes read `contextLive: true`, real renderer string (`Apple GPU`), but
   `nonBlank: null` — `readbackNote: "no animation frame fired within 4000ms"` → UNMEASURED, not a
   pass. Read as a real finding, not a bug in the classifier: Safari appears not to service
   `requestAnimationFrame` for an iframe with no on-screen presence.
2. **Attempt 2** — same page, iframe moved into the visible layout (`position:absolute; top:340px`
   with an in-viewport size, `opacity:0.001` so the controller page's own printed text stays
   legible over it). Both routes then read real frames and passed the grid/coverage check. `inferred`,
   not isolated: this attempt changed both position and opacity together, so which one fixed rAF is
   not separated — only that in-viewport-position-plus-near-zero-opacity works, not off-screen alone.
   This
   is the version the drive itself is based on. The record was then widened once more, with no
   change to the drive (round-started observable, viewport numbers, absolute URL, dropping the
   inert `?stub=` query from the stored route URL) — the JSON and screenshots captured above are
   from that widened run.

## Files

- `webgl-pixels-ios.json` — tracked JSON, 3 rows (one-bomb PASS, pinocchio-luck PASS, one-bomb
  `stub=1` FAIL).
- `one-bomb-pass.png`, `pinocchio-luck-pass.png`, `one-bomb-stub-fail.png` — untracked (gitignored),
  screenshots with the verdict legible on-screen, taken via `xcrun simctl io <udid> screenshot`.
  See "What's tracked, what's not" above.
- `probe-page.html`, `collector.mjs` — the throwaway capability page and its NDJSON collector,
  copied here (rather than left only in `dist/`/scratchpad) so this run can be reproduced; see
  "How to regenerate this" above. `probe-page.html` here differs from the file that produced the
  JSON/PNGs above by one comment line only (Thai text removed from a code comment, per this
  repo's English-comments rule); no functional change.
