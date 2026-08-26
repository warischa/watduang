# Probe triage — gh#122

Every `*-probe.mjs` in `scripts/` run through `scripts/driver.mjs`, once per probe (a couple ran
twice — motion A/B, or a re-run after an infra incident noted below). `ls scripts/*-probe.mjs`
found **15 files**, not the 13 named in gh#122 — the ticket's count was stale; `gamenav-again-grid-probe.mjs`
and `gamenav-start-grid-probe.mjs` exist in the tree but weren't in its tally.

## Environment note — driver.mjs had to be synced from `main`

The brief's premise ("driver.mjs was just fixed to propagate failure") did not hold in this
worktree: `git log` showed the fix landed as `657f192` on `main`, 14 minutes before this session
started, and this worktree's branch was cut before that commit. Running probes through the
unpatched `driver.mjs` would have made every probe exit 0 unconditionally, defeating the whole
triage. I extracted and applied **only** the `scripts/driver.mjs` hunk of `657f192` (not the
`ci.yml`/`package.json`/`smoke-dist.sh` parts of that commit, which are out of scope here) —
applied cleanly, uncommitted. This is the same fix already on `main`; nothing in this triage's
findings depends on any other change.

## Ports used

`PROBE_BASE=http://localhost:4323` (or `BASE=`, per-probe env var name varies), `CDP_PORT=9334`,
Chrome A on `--remote-debugging-port=9334` with its own `--user-data-dir`. A second Chrome (`9335`,
`--force-prefers-reduced-motion`) was launched only for `home-direction-c-probe.mjs`'s reduced-motion
leg, per that probe's own header. Verified with `curl .../json/version` before and after use; never
touched 9222/9333/4321/4322/4399.

**Infra incident, disclosed:** the `npx serve dist/ -l 4323` process died unattended partway through
the sweep (visible in its own access log, last line ~23:18:26, cause not diagnosed — not a probe
finding). `leave-confirm-probe.mjs`'s first run landed mid-death and returned a `SecurityError`
artifact for the pages scanned after the crash. Restarted the server, confirmed `curl` 200, and
**re-ran `leave-confirm-probe.mjs` in full** before recording its row below. No other probe's run
straddled the outage (checked timestamps/response shape; `home-direction-c-probe.mjs`'s rich
numeric output on both sides of the outage window rules it out).

## Table

| Probe | Bucket | Exit | Finding | Wire into CI? |
|---|---|---|---|---|
| `narrow-overflow-probe.mjs` | PASS | 0 | No overflow at 320px across all games/rosters. (Owned elsewhere this session — ran, not edited.) | yes |
| `ad-reflow-first-list-load-probe.mjs` | PASS | 0 | First `watduang:start` list-load causes 0px ad-slot reflow on every tool page (gh#114/gh#120 invariant), real trigger, calibrated. | yes |
| `ad-slot-grid-probe.mjs` | BROKEN PROBE | 0 | **False green.** Seeds `/tool/draw|wheel|team/` via `#roster-list`/`#start-round` (game-only selectors — tools use `ToolNameEntry`/`#name-start`). Seeding silently fails, `adRoseByPx: 0` on every page including the 3 the probe's own comment says should show a real shift — it has never measured a real tap on these pages. | no — needs the tool-page trigger fixed first; author's own STATUS note also says this stays MANUAL by design (ad geometry is Google-owned, no owned set to gate) |
| `adslot-wheel-delay-probe.mjs` | BROKEN PROBE | 0 | Same stale `#roster-list`/`#start-round` seeding against `/tool/wheel/`. All 5 repeats report `"wheel-spin click never fired"` (`#wheel-spin` stays `disabled` because no roster ever loads) — `anyRunErrored: true`, but exit code is 0 because `driver.mjs`'s new check only catches throw/undefined, not a probe's own internal error field. | no — same fix + author's own MANUAL-by-design STATUS note |
| `arm-gate-probe.mjs` | MIXED — see below | 0 | 2/6 game legs (pick-loser) genuinely pass. short-stick and timebomb legs have real selector bugs (below). daily-fortune/love-match/siamsi legs throw immediately — ADR-0040 root cause (see next section). | no — needs the 3 fixes below first |
| `category-pop-probe.mjs` | PASS | 0 | No sideways scroll, rail absence <1100px, rail height reservation at 1440px, accent colours differ per category — all calibrated with a self-test that reds-then-cleans. | yes |
| `daily-fortune-double-tap-probe.mjs` | NEEDS SETUP | 1 | Hardcodes `http://localhost:4321` (no env override — forbidden port this session) and reads `process.env.SP` (undefined) for its screenshot path. Its own header says `STATUS (gh#43): SUPERSEDED` — findings already covered by `no-nav-in-stage-check.mjs` and an accepted exception. | no — dead weight, delete rather than wire |
| `gamenav-again-grid-probe.mjs` | PASS (ran) — caveat | 0 | Needs `ROSTER_JSON`/`GAME_ID` (undocumented default, threw on first attempt). Ran with `GAME_ID=siamsi` and an approximated 7-name roster: 0/611 collisions, diverging from the probe's own committed baseline (25/60). Not the exact pinned fixture — result is not authoritative either way. Probe's own STATUS says "CLOSED EVIDENCE, not a regression suite... green is not the goal." | no — not meant to gate CI by design; regression protection is `stable-exit-markers-check.mjs` |
| `gamenav-start-grid-probe.mjs` | PASS (ran) — caveat | 0 | Same shape, `GAME_ID=pick-loser`, approximated 10-name roster: 0/45 collisions vs documented 8/45 baseline. Same caveat and same "not a regression suite" STATUS note. | no — same as above |
| `home-direction-c-probe.mjs` | PASS | 0 | Ran twice (normal motion + `--force-prefers-reduced-motion`, needs 2 Chrome instances). No sideways scroll at 4 widths, rail absent <1100px/rendered at 1440px, motion present/stopped correctly per mode, all self-calibrated. | yes, but needs 2 browser sessions — a different CI shape than the single-Chrome probes |
| `leave-confirm-probe.mjs` | MIXED — see below | 0 | timebomb/pick-loser/short-stick: full PASS, real geometry (calibrated positive control). siamsi/daily-fortune/love-match: ERROR/VOID (ADR-0040). All 3 `/tool/*` pages: ERROR — `#leave-confirm` only exists inside `PlayerSetup.astro`, which tool pages never mount; the probe's own `TOOL_PAGES` inclusion assumes a dialog that was never built there. | no — needs `TOOL_PAGES` dropped/scoped and the 3 solo-game legs dropped before it can gate cleanly |
| `mount-failed-network-probe.mjs` | PASS | 0 | Real CDP `Fetch.failRequest` on timebomb's chunk: notice shown, panel/roster intact, leave-confirm correctly stays unarmed, on both first failure and a same-page retry. Honestly self-scopes what it didn't cover. | yes |
| `no-nav-in-stage-probe.mjs` | MIXED — see below | 0 | pick-loser/short-stick/timebomb: full PASS, 0 in-stage anchor hits across 2/17/3 real transitions. daily-fortune/siamsi/love-match: FAIL, but `walkUsable: false` and 0 measured hits — same ADR-0040 root cause, not a real anchor regression; the scorer fails closed on an unusable walk rather than passing silently, which is the right default but still needs the walk fixed. | no — needs the 3 solo-game legs dropped/rebuilt before it gates cleanly |
| `stick-tap-target-probe.mjs` | PASS | 0 | All 18 (width × roster-size) combinations ≥44px min edge on short-stick's sticks, 0 failing. | yes |
| `wheel-pointer-name-probe.mjs` | PASS | 0 | Painted wedge under the pointer matches the announced result on every spin, both widths, real hit-testing (no self-check of its own math). | yes |

## The one dominant root cause (not a REAL FAILURE of the site)

**No REAL FAILURE was found in this sweep.** Every non-trivial red or false-green traces to one of
two causes, both confirmed by reading source, not inferred:

1. **ADR-0040 (2026-08-25): daily-fortune, love-match, and siamsi are now solo — no roster, no
   `PlayerSetup`, no `#roster-list`/`#start-round`, no `#leave-confirm`.** Confirmed by reading
   `src/games/daily-fortune.ts`/`love-match.ts`/`siamsi.ts` ("the proving page of the solo class",
   "the solo mount"). Five separate probes independently hit this the same way: `arm-gate-probe.mjs`
   (3 scenarios throw `Cannot read properties of null (reading 'click')` on `#start-round`),
   `leave-confirm-probe.mjs` (3 ERROR rows), `no-nav-in-stage-probe.mjs` (3 FAIL rows with
   `walkUsable: false`). This is a probe-staleness finding, not a product defect — the domain change
   is intentional and documented.

2. **Tool pages (`/tool/draw|wheel|team/`) use `ToolNameEntry`/`#name-start`, never
   `PlayerSetup`/`#roster-list`/`#start-round`.** `ad-slot-grid-probe.mjs`, `adslot-wheel-delay-probe.mjs`,
   and `leave-confirm-probe.mjs`'s `TOOL_PAGES` section all assume the game-page selectors on tool
   pages and get silent no-ops or thrown nulls. `ad-reflow-first-list-load-probe.mjs` and
   `wheel-pointer-name-probe.mjs` use the correct trigger (`#name-start` / real CTA click) and both
   pass genuinely — proof the correct pattern exists in this same file set, it just wasn't used
   everywhere.

Two narrower, independently-confirmed selector bugs inside `arm-gate-probe.mjs`:

- **short-stick leg:** `readShortStickState()` reads `paras[0]`/`paras[1]` from
  `stage.querySelectorAll('p')`, but the current `short-stick.ts` puts the holder name in a
  `<span class="st-holder-name">` (never matched) and the passing/result screens have exactly one
  `<p>` at index 0, not 1. Every `player`/`next`/`expectedNext` value is `null` — the <400ms
  "suppressed" assertions pass vacuously (`null === null`) and the ≥400ms "registered" assertion is
  unpassable by construction (needs a real name to equal a value that is always `null`). This is a
  stale-selector bug in the probe, not a defect in short-stick's arm-gate.
- **timebomb leg:** `readTimebombState()` checks `document.getElementById('tb-pulse')` —
  `grep -rn "tb-pulse" src/games/timebomb.ts` returns nothing; that id does not exist anywhere in the
  current game. The ≥400ms "registered" assertion requires `hasPulse === true`, which can never be
  true, so that leg is unpassable by construction regardless of real behaviour.

## What's actually trustworthy right now

`narrow-overflow-probe.mjs`, `ad-reflow-first-list-load-probe.mjs`, `category-pop-probe.mjs`,
`home-direction-c-probe.mjs`, `mount-failed-network-probe.mjs`, `stick-tap-target-probe.mjs`,
`wheel-pointer-name-probe.mjs` — 7 probes, all self-calibrated (each proves its own detector can go
red before trusting it green), all genuinely exercising the real trigger, all currently green for a
real reason. These are the CI-wiring candidates.
