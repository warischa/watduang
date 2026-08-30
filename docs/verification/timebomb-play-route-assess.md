# Full-assess checklist — ระเบิดเวลา (timebomb) play route (gh#145, ADR-0050 ruling 4)

Date: 2026-08-30 · Engine-reuse + dark-reskin retrofit (ADR-0050 ruling 4's second branch — no
original mockup exists for this game, per `src/pages/game/timebomb/play.astro`'s own comment), not a
run-as-is port · Some rows verified this session via `scripts/driver.mjs` against the dev server at
320x640; other rows reuse this session's earlier real-browser pass at 320px/375px in both motion
modes, marked as reused below rather than re-run.

| # | Check | Result |
|---|---|---|
| 1 | Play route full screen, dark theme | PASS (reused) — this session's browser pass rendered the route fully styled: dark theme, bomb canvas, orange fuse from `src/play/timebomb/play.css`; `src/pages/game/timebomb/play.astro` mounts the markup and `<PlayExit />` |
| 2 | ADR-0049 baseline: mascot cast, fixed order, defaults ready to play | PASS — CDP read of a wiped device found `#tb-players` pre-filled from `MASCOTS` with zero typing needed; first row read `"แมวส้ม"`, matching the same fixed cast order `short-stick` renders (`แมวส้ม`, `ชิบะ`, `บันนี่`, `ฟร็อกกี้`, ...) |
| 3 | Rename works and stays local to this game | PASS — CDP-driven rename of the first row (`input` event, matching `src/play/timebomb/main.ts`'s own listener) persisted only to `localStorage['watduang:timebomb-players']`; `localStorage['watduang:group']` and `sessionStorage['watduang:session']` both read `null` immediately after, so the rename never reaches the shared roster or the site session |
| 4 | Player range [2, 10] per this game's design, 20-mascot ceiling respected | PASS — `MAX_PLAYERS = Math.min(game.players[1], MASCOTS.length)` resolves to 10 (`src/play/timebomb/main.ts`); driving the `+` stepper 20 times in a real browser stopped at count 10 with the control disabled and 10 rows rendered — the site's 20-mascot ceiling is never the binding constraint here |
| 5 | Dark reference | PASS (reused) — same evidence as row 1; one of the four boxes already satisfied per this ticket's own tracking |
| 6 | X exit mounted | PASS — `src/pages/game/timebomb/play.astro` imports and renders `<PlayExit />` as page chrome outside `#app`, the shared arm-gated control |
| 7 | Sound toggle | NOT DONE — real defect: a CDP query for `#soundToggleBtn, #audio-toggle, [aria-label*="เสียง"], [title*="เสียง"]` returned 0 matches in the rendered DOM. `src/games/timebomb.ts` schedules tick sound through `src/shell/audio.ts` (an `AudioContext`/`OscillatorNode` synth), but neither `src/play/timebomb/markup.html` nor `main.ts` mounts any mute/unmute control on this route — a player who wants the tick sound off has no in-game way to do it. Routed as a follow-up on gh#145, not fixed here |
| 8 | Viewport at 320px | PASS (reused) — this session's earlier pass drove a full round at 320px normal mode to the boom screen: fully styled, 0 overflow, 0 stray `<a>` anchors |
| 9 | Reduced motion | PARTIAL — reused evidence covers only the ticking state (0 overflow, canvas still draws, shimmer range 2.6% vs 11.8% normal — confirmed not static). The pass extrapolated the boom/terminal screen in reduced mode rather than walking the ~90s fuse a second time, so that screen's reduced-motion rendering is unverified |
| 10 | Gates | PASS (reused) — this session's `REAL_GATES_EXIT=0, TOTAL=30 FAILS=0` run covers this exact tree; not re-run for this checklist |

Known follow-ups routed: no sound toggle on the timebomb play route despite the engine playing tick
sound (row 7) — needs a gh ticket of its own; reduced-motion coverage of the boom/terminal screen
(row 9) remains open.
