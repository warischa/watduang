# Full-assess checklist — จับไม้สั้น (short-stick) play route (gh#146, ADR-0050 run-as-is recipe)

Date: 2026-08-30 · Run-as-is mockup port (this game has its own mockup, ADR-0050's first recipe
branch), not an engine reskin · Some rows verified this session via `scripts/driver.mjs` against the
dev server at 320x640; other rows reuse this session's earlier real-browser pass at 320px/375px in
both motion modes, marked as reused below rather than re-run.

| # | Check | Result |
|---|---|---|
| 1 | Play route full screen, styled | PASS (reused) — this session's browser pass rendered a styled hero: deliberate `"Noto Serif Thai"`, h1 `rgb(28,25,23)` on bg `rgb(250,247,242)` — not an unstyled fallback — and reached `#view-setup` with mascot defaults and 0 overflow at 320px |
| 2 | ADR-0049 baseline: mascot cast, fixed order, defaults ready to play | PASS — CDP-driven open of the setup screen on a wiped device found `.player-input` rows pre-filled by `applyMascotDefaults` (`src/play/short-stick/roster-bridge.ts` → `src/play/_mascots.ts`) reading `แมวส้ม, ชิบะ, บันนี่, ฟร็อกกี้` — the same fixed cast, same order, timebomb renders |
| 3 | Rename works and stays local to this game | PARTIAL — real finding, not a code bug but in tension with this ticket's literal wording. Editing a name without finishing setup is in-memory only, same as timebomb. But completing setup (clicking `#btn-begin-game`) writes the edited names into the SITE-WIDE `localStorage['watduang:group']` and `['watduang:roster']` (confirmed by CDP: both held the two renamed test names after start) — the exact keys `src/play/_setup-bridge.ts`'s own comment says make "the next game inherit the edited group," matching CLAUDE.md's stated site feature ("a shared roster, 2–10 players"). That is deliberate cross-game sharing, the opposite of "stays local to this game" read literally. Routed to the owner to confirm intent (or correct the ticket wording) rather than changed here |
| 4 | Player range [2, 10] per this game's design, 20-mascot ceiling respected | PASS — `roster-bridge.ts` hardcodes `MAX_PLAYERS = 10`, matching the manifest's `players: [2, 10]`; driving `#btn-add-player` 20 times in a real browser stopped at 10 rows with the control disabled |
| 5 | Dark/mockup reference styling | PASS (reused) — same evidence as row 1; colors are the mockup's own tokens, no new hex literals introduced; one of the four boxes already satisfied per this ticket's own tracking |
| 6 | X exit mounted | PASS — `src/pages/game/short-stick/play.astro` imports and renders `<PlayExit />` |
| 7 | Sound toggle | PASS — `#audio-toggle` exists in the rendered DOM (`src/play/short-stick/markup.html`); a CDP click flipped its `textContent` from `🔊` to `🔇`, matching `main.js`'s own toggle handler |
| 8 | Viewport at 320px | PASS (reused) — same evidence as row 1 (0 overflow at the setup screen) |
| 9 | Reduced motion | NOT DONE — the reused browser pass verified only the hero/setup screen's styling across motion modes; the draw/reveal round itself — this game's actual motion — was not walked under reduced motion, neither by that pass nor by this checklist's own CDP run (which only drove the setup screen) |
| 10 | Gates | PASS (reused) — this session's `REAL_GATES_EXIT=0, TOTAL=30 FAILS=0` run covers this exact tree; not re-run for this checklist |

Known follow-ups routed: the rename-stays-local wording tension with the shared-roster write on setup
completion (row 3) needs an owner call on gh#146; reduced-motion coverage of the short-stick round
itself (row 9) remains open.
