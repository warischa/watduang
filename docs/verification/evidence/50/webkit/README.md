# gh#50 — real-WebKit verification of the write-refusal notice

Device: iOS Simulator, iPhone 17 Pro, iOS 26.5 (UDID `10E8F607-B5AB-4B17-A9AA-44A8707CDF87`).
Driven via the simulator-control MCP tool (`tap`/`swipe`/`open_url`/`screenshot`) plus
`xcrun simctl io screenshot` for exact-pixel captures. Served from `scratchpad/serve-probe`
(the calibrated probe copy of the integrated tree) on `http://localhost:4321`.

Game used: **siamsi** (`/game/siamsi/`) — the sole live `saveCheckpoint` caller
(`src/games/siamsi.ts`), so its taps are the shortest path to a real `write()` call.

## Result

- **Leg 1 (diverged closure): PASS.**
  `docs/verification/evidence/50/webkit/leg1-04-diverged-refusal-PASS.png` shows, in one frame:
  `persisted=true`, `refusalShown=true`, and the Thai stale-version notice rendered in
  `#write-refused`: *"รอบนี้ถูกเล่นต่อจากหน้าอื่นแล้ว ที่กดในหน้านี้หลังจากนั้นไม่ได้บันทึก"* —
  the exact string `refusalCopy('stale-version')` returns
  (`src/shell/player-select.ts:144-145`).
  Supporting frames: `leg1-01-docA-midround.png` (document A started, checkpoint written),
  `leg1-02-docB-generation-bumped.png` (document B's `เริ่มรอบใหม่` bumps the generation via
  `setPlayers`), `leg1-03-docA-restored-pretap.png` (back-navigated to document A,
  `persisted=true`, before the forced tap).

- **Leg 2 (innocent restore): PASS.**
  `docs/verification/evidence/50/webkit/leg2-02-posttap-no-notice.png`: immediately after the
  restore, `persisted=true`, `refusalShown=false`, no notice, and the round visibly advances
  (new card revealed) — proving the write path executed without a false-positive refusal.
  `docs/verification/evidence/50/webkit/leg2-03-record-advanced-zoomed-PASS.png` is the stronger
  proof required by the brief: the **raw sessionStorage record itself**, read from the readout,
  visibly advanced from the pre-tap state
  (`leg2-01-docA-restored-pretap.png`: a live mid-round `checkpoint` object under the same id
  `mt15d4sx-1`) to `"played":["siamsi"],"checkpoint":null` — the round completed and the
  checkpoint cleared, still with `refusalShown=false` throughout every intermediate frame.

## Substitutions (declared per `docs/agents/ios-webkit-verification.md:110-114`)

1. **Injected readout.** The served pages carry `scratchpad/probe/persisted.js`'s
   `pageshow`-only readout, which the shipped site does not. It is `pointer-events:none` and
   attaches no `unload`/`beforeunload` listener, so it does not alter the bfcache eligibility
   being measured.
2. **No production CSP.** `npx serve` does not apply `staticwebapp.config.json`. The probe
   script is external and same-origin, so it would pass production's `script-src 'self'`
   regardless.
3. **Safari native page-zoom (Page Settings → smaller "A", tapped 3×) used to reveal the full
   readout line.** The readout is `white-space:pre` and one line wider than the 402pt viewport,
   so at 100% zoom only `persisted=`/`refusalShown=` and the first ~58 characters of the stored
   JSON are visible on-screen; the rest is laid out past the right edge and is not reachable by
   scrolling (the readout is `position:fixed`). Zooming out is a real, user-facing Safari
   rendering feature — it changes visual scale only, not the DOM, storage, or bfcache behaviour
   under test — and was the only way to get `"played"`/`"checkpoint"` on-screen at all. Declaring
   it explicitly per the standing rule.
4. **Device rotation was attempted and found non-functional, and was NOT used.** `osascript`
   driving the Simulator app's Device → Orientation menu reported the click as sent, but the
   framebuffer never changed (`xcrun simctl io screenshot` stayed 1206×2622 portrait every time),
   and a follow-up `System Events` query found `Can't get window 1 of process "Simulator"` — this
   matches this doc's own note that a headless/streamed Simulator setup has no on-screen window
   for the process to act on. No landscape frame was produced or used as evidence; the zoom
   substitution above (#3) is what actually closed the gap.

## Runs discarded

- **1 discarded for wrong browsing context, not for `persisted=false`.** The first Leg 1 attempt
  used the `open_url` action to navigate to the game page a second time (for "document B").
  `open_url` opened a **new Safari tab** rather than navigating the existing one — confirmed by
  the readout showing `(no sessionStorage record)` on load, and a left-edge back-swipe doing
  nothing (no history in the new tab). This was caught immediately, before any forced-write tap,
  and the whole choreography was redone in a single tab using only in-page link taps (the
  `ดูเกมทั้งหมด` chrome link and the game's own list entry) for every navigation from then on.
  Leg 1 then passed on that (second) attempt — within the two-attempt budget.
- **0 runs discarded for `persisted=false`.** Every time the check was actually reached (after a
  genuine bfcache-restore back-swipe), it read `true` on the first try, in both legs.
- Leg 2 passed on its first attempt. The extra taps visible in the evidence trail beyond the
  minimal "one forced write" (`ส่งต่อ` → draw → `ส่งต่อ` again, completing the round) were not a
  second attempt at the leg — they continued the same already-passing, already-`persisted=true`
  session further, purely to reach a point where the readout's truncated line contained a
  human-legible textual difference (`"played"`/`"checkpoint"`) rather than only differing in
  bytes past the visible edge.

## What could not be checked

- The exact `gen` and `stamp` integers never became visible on-screen even after 3 zoom-out
  steps — the `checkpoint` object's `deck`/`results` content is long enough that reaching those
  trailing fields would need a zoom level too small to read reliably in a screenshot. The
  `"played"`/`"checkpoint"` fields are used as the visible proxy for "the record advanced"
  instead; they are values written by the same `write()` chokepoint on the same guarded path.
- Landscape/rotated capture was not available in this environment (see substitution #4), so no
  claim in this report rests on a rotated frame.
