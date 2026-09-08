# gh#181 box 7 — 1440x900 readings and per-route verdicts

Captured 2026-09-07 at commit `7f654f7`. `git rev-list --count d2e2dcc..HEAD -- src public` is 0, so
`src` and `public` at that commit are what is deployed — these are readings of the live site.

**The numbers in this file are the record. The PNGs beside it are not.** `.gitignore` ignores
`docs/verification/evidence/**/*.png` and its own comment states the reason: probe screenshots
regenerate on every evidence run, the JSON logs are the evidence, and a CDP probe never qualifies for
the single carve-out (gh#50's iOS WebKit frames) precisely because it can always emit JSON. The PNGs
here are working artifacts for the owner's own look under box 8.

**How these numbers were produced, stated plainly.** The board/rail/verdict columns and every prose
disclosure below were a driven CDP session transcribed by hand. **The frame and screen-read columns
are the exception**: as of 2026-09-08 those two are sourced from `frame-screen-readings.json` beside
this file, emitted by a probe script (scratch, not committed — the regeneration path is still a
driven pass at the same viewport, not a repo-tracked command). `scripts/play-screen-fit-probe.mjs`
did not produce them and does not measure what box 7 asks for. The rest of this file's numbers are
still hand-transcribed with no JSON log, unlike siblings such as `77-81` — if you need the PNGs back,
they have to be re-driven.

`frame-screen-readings.json`'s own `meta.commit` is `a44d276`, one commit later than this file's
`7f654f7` header. The two are consistent only because `git diff --stat 7f654f7 a44d276 -- src/play`
touches none of the eight routes this file measures — it touches `bangkok-drift`, `one-bomb` and
`_divergences.json` only.

## Route set

The eight routes commit `d2e2dcc` touched, enumerated by
`git show --stat --format= d2e2dcc | grep -oE 'src/play/[a-z-]+' | sort -u`, per the owner ruling of
2026-09-05 that this ticket covers all eight routes the instrument measures.

Note the wording gap: the restated box 7 still says "all four routes", carried over from the ticket's
title. The 2026-09-05 ruling says eight. Eight were measured. The owner is asked to state "eight" once.

## Method

`npm run build`, then `npx serve dist/` and headless Chrome over CDP. Before **every** measurement,
`window.innerWidth === 1440 && window.innerHeight === 900` was asserted **in the page**, because a
`--window-size` flag sets the window without reflowing the layout and a screenshot of that lies.
Every screen was reached through the route's own player controls, never by calling past the trigger.

**Frame selector, corrected.** `docs/agents/desktop-sizing-decisions.md` says the root is "`#app`, or
`#app-container` on the routes that use that id", and `scripts/play-screen-fit-probe.mjs` carries
`ROOT_SEL` as `'#app, #app-container, #appRoot'`. Read from each route's `markup.html`, the split is:
`#app-container` on `cannon-flag`, `power-meter` and `zero-trigger`; `#app` on `dice-loser`,
`freeze-tap`, `pinocchio-luck`, `short-stick` and `timebomb`. An earlier version of this file claimed
`#app-container` on all eight. That was wrong.

**Now pinned by a driven pass with a JSON log** (`frame-screen-readings.json`, 2026-09-08): all eight
routes read `document.querySelector('#app, #app-container, #appRoot')`, recorded which alternative
actually matched and its live `getBoundingClientRect().width`, at `innerWidth === 1440` asserted in
page. The five `#app` routes all matched `#app` (not `#appRoot`) and all measured 1440 — confirming,
rather than assuming, that these five roots carry no desktop cap and read the bare viewport width.

`widthFillPct` from `scripts/play-screen-fit-probe.mjs` is **not** an input to any verdict here. The
probe's own header declares it deliberately unpinned: it moved 89.2 to 100 across two consecutive runs
on `cannon-flag`, because these games advance on their own clock.

## Readings

**Frame and screen are now sourced from a driven CDP session with a JSON log**,
`frame-screen-readings.json` beside this file — every value in these two columns is read from that
log, not transcribed by hand. Method: `docs/verification/evidence/181/frame-screen-readings.json`'s
own `meta` block. Frame is which of `#app` / `#app-container` the mockup root actually matched, plus
its live `getBoundingClientRect().width`. Screen read is the screen the walk (route's own transition
controls, largest non-header button, same idiom `scripts/play-screen-fit-probe.mjs` uses) landed on
after leaving the fresh screen, named by its own id/class — **true for seven of the eight routes.**
`short-stick` is the exception: its JSON row records `pressesToReachScreen: 0` and
`leftFreshScreen: false`, because (per `meta.caveats.short-stick`) gh#184's roster-bridge auto-seeds
and auto-presses this route's own start control on load, so the walk's fresh-screen read already
landed on the draw screen before any click — not a failure to reach the screen, and `screenDesc`
(`.draw-layout`) still matches the route's own board name already in this file. `zero-trigger`'s and
`pinocchio-luck`'s screen labels below are unchanged from the earlier hand pass and are now cited to
a live selector;
`freeze-tap`'s driven read first landed one screen short (the pass-the-device interstitial, not the
round screen its own Disclosures analyse) and was corrected by pressing further — see the JSON
entry's `note` field and the Residuals item below.

| route | screen read | frame | board | rail | verdict |
|---|---|---|---|---|---|
| `cannon-flag` | gameplay screen (`#screen-gameplay`) | 1440 (`#app-container`) | canvas 1440, full-bleed | none, reason in file | reads-as-designed |
| `dice-loser` | play/roll screen (`#dl-play`, the same element the board column measures) | 1440 (`#app`) | `.dl-play` 662, cap match | none, `NO RAIL TOKEN` in file | reads-as-designed |
| `freeze-tap` | round screen (`#gameTargetSurface`, reached after 2 presses past the pass-the-device interstitial — see JSON `note`) | 1440 (`#app`) | surface 1440, full-bleed | none, reason in file | reads-as-designed — **see the readouts observation below** |
| `pinocchio-luck` | question screen, 3D stage — the driven read lands on the frame root itself (`main#app`, see Residuals item 2) | 1440 (`#app`) | `#stageFrame` 780, cap match | none, reason in file | reads-as-designed |
| `power-meter` | glass-card screen (`.glass-card`, nested one level inside the board column's `#view-root`) | 1440 (`#app-container`) | `#view-root` 744, cap match | none, reason in file | reads-as-designed |
| `short-stick` | draw screen (`.draw-layout`, the same element the board column measures) | 1440 (`#app`) | `.draw-layout` 800, cap match | none, reason in file | reads-as-designed |
| `timebomb` | stage screen (`.tb-main`, the container the board column's `.tb-canvas` sits inside) | 1440 (`#app`) | `.tb-canvas` 560, margins 440/440 | none, reason in file | reads-as-designed |
| `zero-trigger` | board-and-rail play grid (`#screen-game`) | 1408 (`#app-container`) | 320 + gap 28 + rail 380 | 380, token match | reads-as-designed — **see the template departure below** |

All seven no-rail reasons were checked as genuinely written in that route's own file — `overrides.css`
on five, the `NO RAIL TOKEN` paragraphs in `play.css` for `dice-loser` and `timebomb`. None is an
inference presented as the file's words.

## Disclosures — each was a wrong or missing claim in an earlier pass

Moved to [disclosures.md](./disclosures.md) to stay under the doc budget. The heading stays here so a heading scan still finds it.

## Residuals a future pass should tighten

1. ~~The frame element is unpinned on the five `#app` routes.~~ Closed 2026-09-08: pinned by a driven
   session with a JSON log (`frame-screen-readings.json`), all eight rows.
2. ~~The screen read is named for only three of eight rows.~~ Closed 2026-09-08 for the same five: see
   the Readings table. `pinocchio-luck`'s driven read this pass landed on `main#app` itself (root has
   2+ visible top-level units — stage and panel — so the sole-wrapper descent stops there rather than
   naming a deeper child), matching a prior gh#203 composition run's own reading for this route
   byte-for-byte; the existing "question screen, 3D stage" label is kept and the row now cites
   `main#app` beside it rather than silently disagreeing with the JSON. `freeze-tap`'s first driven
   read this pass (1 press) landed short, on the pass-the-device interstitial rather than the round
   screen its own Disclosures analyse — caught before writing the row, and corrected by pressing
   through both transition screens to `#gameTargetSurface`, confirmed present by `.game-hud-top` being
   visible there (the same element the Disclosures' readouts observation is about).
3. ~~There is no JSON log.~~ Closed 2026-09-08: `frame-screen-readings.json` beside this file. The
   regeneration path is still a driven pass, not a single committed command — that part is unchanged.
4. `dice-loser`'s largest-button-first heuristic (used by this pass's walk and by
   `scripts/play-screen-fit-probe.mjs`'s own gh#203 walk) presses `#dl-reset-names` first, which opens
   a confirm dialog over the setup screen rather than transitioning to the round — this pass overrode
   that one route with an explicit `#dl-begin` click. The heuristic itself is unfixed; a future pass
   touching that shared walk logic should carry the same override.

## What this did not cover

Box 2's 320px width fill: not measured. The 2026-09-04 ruling records that box as answered, the
2026-09-06 comment re-lists it as unverified, and `cursed-number` — one of its two subjects — is
outside these eight routes. That conflict is the owner's to settle in one place, and a 320px reading
would close nothing until they do.

Box 1: unevaluable as written, awaiting an owner restatement, so "fills the window" was not available
as a criterion. Only `zero-trigger`'s frame reading touches that question, and its departure is
disclosed above rather than scored.

Box 8: the owner's own look. These PNGs exist for it; they are not committed, per the reason at the
top of this file.

No route's source was edited. No fix was applied. Nothing was measured at any viewport other than
1440x900.
