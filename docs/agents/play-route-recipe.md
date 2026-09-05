# Play-route recipe — mockup to shipped game (gh#138)

Written after three games walked it end to end (ยิงธง daab4da's predecessor b69cda5, มือลั่น + วัดพลัง daab4da, chrome 7360cfc + 0f7cb2a). Product rulings live in ADR-0050; this doc is the HOW.
The two-track rule: a game WITH a standalone mockup follows THIS doc (run-as-is, then full assess — ADR-0050 ruling 4). A game WITHOUT one is an owner decision and routes to gh#139. `docs/agents/porting-a-mockup-game.md` is the older stage-module approach — retired for party games; it names this doc as the current target.

## Answer these TWO before anything else — both cost minutes, and getting them late costs a rebuild

**1. Is this mockup actually this game?** A directory whose name resembles the game is not evidence. Read the mechanic. `Bomb` looked like ระเบิดเวลา and is a 5×5 tile-reveal board with no clock and no name inputs; `dice-loser` looked like สุ่มคนโดน and is เต๋าชี้คนแพ้, three dice with tiebreak rounds. Both were caught only after a brief had been written on them (2026-08-30). Every port that has succeeded had a mockup directory named **exactly** the game id. Grep the mockup for the mechanic the shipped module's `tagline` promises; if they disagree, there is no mockup and this doc does not apply.

**2. Does this game need a drawn canvas, or is the lift enough?** Ask the owner BEFORE step 1, and record the answer in the ticket. จับไม้สั้น was ported (20.5 min) and then rebuilt with a canvas (18.3 min) because the visual bar arrived after the port — one agent briefed with the answer does both in about 25. A game that needs drawn depth follows [ADR-0051](../adr/0051-canvas-2d-is-the-default-and-a-play-route-never-blanks-the-page.md): Canvas 2D is the starting point, WebGL is allowed where a game genuinely needs it, and either way the route must never blank the page when the context is unavailable. A drawing route also owes a calibrated pixel-readback check, because a canvas that draws nothing passes every other gate.

## What a mockup must satisfy first

- One self-contained `~/claude/mockup-games/<dir>/index.html` — `scripts/extract-mockup.mjs` REFUSES external resources (script/style/img URLs) by design; fix the mockup upstream, never patch the lifted copy.
- Its own setup screen (player count + name inputs) — the roster bridge drives it; a mockup without setup has nothing to seed.
- Inline handlers (`onclick=` etc.) are allowed IN but must be rewritten before ship (step 2) — the extractor counts and reports them, deliberately never rewrites.
- Not satisfied → the game is not liftable: fix the mockup upstream, or route the game to gh#139 (the owner decides; gh#137 is closed and unrelated).

## Steps

1. **Extract**: `node scripts/extract-mockup.mjs <mockup-dir> <game-id>` → `src/play/<id>/{markup.html,style.css,main.js}`. Note the inline-handler count it prints, and the Thai-aria-label count beside it.
   - **Icon-only controls need a Thai `aria-label`, and it does NOT go in the lifted files** — put it in `src/play/_aria-labels.json`, keyed by route then `#id` / `[attr="value"]` / `.class`, and the extractor re-applies it to everything it writes (gh#211). A mockup can ship English ones: ZERO_TRIGGER's did, over three correct Thai `title`s. `scripts/play-icon-label-check.mjs` reds on any icon-only control with no Thai `aria-label`, and it reads the route list from the `src/play` directory, so your new route is checked the moment the folder exists.
2. **Handlers**: count > 0 → rewrite every one as delegated listeners on `document` (`data-act`/`data-arg` dispatch — the shipped pattern is in `src/play/power-meter/main.js`). CSP blocks ALL inline (ADR-0005). Verify: grep for `on*=` returns 0 real attributes in markup + built HTML, and every data-act key has a dispatcher entry (probe both directions).
3. **Bridge**: copy `roster-bridge.ts` from a shipped game; adapt only the selectors (START control, name inputs, count buttons). Read the roster through `src/shell/roster` imports ONLY (ADR-0010 single-writer; a text gate reds the key spelled anywhere else — including in a comment). Keep the `_setup-bridge` wiring (`saveOnSetupComplete`, `takeSetupEditRequest`): edit-players and group persistence come free with it. Enforce `maxLength` when seeding — direct `.value` skips the attribute.
4. **Page**: copy a shipped `src/pages/game/<id>/play.astro` (one file per game, never dynamic). Import order is load-bearing: `style.css` then `overrides.css`. `<PlayExit />` gives the X and แก้ผู้เล่น chrome free. Import the game module directly, not `byId()`.
5. **Overrides**: every site-side adjustment lives in `overrides.css` (or the bridge), NEVER in the lifted files — that is what keeps the extraction reproducible and the gate exemption honest. Typical: hide the mockup's test-runner UI, raise sub-44px tap targets. Accessible names are the third home, not an exception to this rule: they live in `src/play/_aria-labels.json` (step 1) and the extractor writes them into the lifted files for you, so you still never type one there by hand.
   - **The one exception (owner ruling 2026-09-03, gh#184): a fault that `scripts/css-brace-balance-check.mjs` reds on is fixed in place, in the lifted file.** That gate is the bound, deliberately — "a syntax error" is not, because esbuild labels many lifted-mockup quirks `[css-syntax-error]` and none of those are licence to edit a lift. A stray brace is not a site-side adjustment and no `overrides.css` rule can undo it — `src/play/short-stick/style.css` shipped one stray top-level `}`, esbuild called it a warning and the rule immediately after it was dropped, so a whole player strip laid out as `display: block`. Scope measured, not assumed: `.strip-chip` further down the same file still applied (ten stacked chips measured 335px of styled height), so the loss was one rule, not the remainder of the file. `scripts/css-brace-balance-check.mjs` is what keeps this exception honest: it reds on any unbalanced `.css` under `src/`, so the class cannot come back through a re-extraction unnoticed.
6. **Delete the engine**: the game module shrinks to a landing (~80 lines — keep manifest fields, `playRoute`, landing render). Delete `src/games/<id>.test.mjs` and `src/styles/games/<id>.css`; sweep the dead import in `src/pages/game/[id].astro`.
7. **Wire the gates** (integrator's job when work was parallel — these files are shared):
   - Build with `npm run build`, NEVER `npx astro build` — prebuild owns `validate-games.mjs`, which is the only thing that notices a missing OG image. Missing → `node scripts/make-og.mjs <id>` and LOOK at the png.
   - `bundle-freeze-check`: run it, read its red, add the new basenames, re-measure `BASELINE_TOTAL_BYTES` from THIS build's output. A shared chunk can legitimately vanish when deletions leave one consumer (it inlines) — prove where the code went before re-baselining.
   - `control-floor-probe`: engine rendered `.game-btn`? Re-record `CONTROL_COUNT` ATTRIBUTED (old vs new grep counts per module; the file's comment block shows the required form), never bumped to green.
   - `thai-comments`: lifted files are auto-exempt (`isVerbatimLift`, scoped to the extractor's filenames per game folder — covers what the mockup brought; agent-written files in the same folder stay policed). Nothing to wire, but confirm the success line NAMES your files as not-scanned.
8. **Verify**: `npm run ci` · `npx astro check` · `npm run ci-probes` (all legs) · browser proofs per `docs/agents/browser-verification.md`: roster continuity (seeded / first-time / refresh-resume at 375px) and chrome guard (`scripts/play-exit-probe.mjs`, `scripts/play-exit-guard-probe.mjs` — serve dist first, port via `BASE` env; manual tools, not CI legs).
9. **Ticket hygiene**: the new game adds a ROW to gh#141 (real-device queue), never a device box of its own.

## Cost, honestly

One game ≈ one agent-session including browser proof; the chrome and bridges are shared so each next game is cheaper than the last. Bundle delta: re-measure from `bundle-freeze-check`'s own output AFTER the final build — a stored number was once quoted mid-change and was wrong by a factor of six. Numbers in this repo come from a command run now, not from a doc.

## Traps that already cost a session time

- `npx astro build` in a worktree skips prebuild → the OG gate cannot fire there; the miss surfaces only at integration.
- Literal invisible bytes: a real NUL landed in a source file (as a join separator) and made git treat it as binary — write `\u0000`-style escapes, verify raw bytes on anything agent-generated.
- Exit codes read through a pipe lie (`… | tail; echo $?` reads tail's). Capture to a file, echo `$?` directly.
- A comment can be made false by the very commit that lands it (one justified a workaround by "unregistered" while the same change registered it) — re-read comments against the final diff.
- Chrome synthetic touch fires no `click` on some routes — activation code and probes use `pointerup` (measured on cannon-flag; the real-iOS answer rides gh#141).
