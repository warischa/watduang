# GameNav grid probes, retargeted and pruned — 2026-10-04

No ticket number: the task came straight from the owner in a session, so this directory is named by
date, the way `ui-audit-2026-10-04/` is.

## What was decided, and on what

- **`scripts/gamenav-start-grid-probe.mjs` — deleted.** Its subject is the setup-panel collapse under
  `#start-round`. On the build at `3901965` no page under `dist/` contains `id="start-round"`; only
  the bundled `PlayerSetup` script still names it. Since gh#149 every GameLayout landing is a solo
  page (`daily-fortune`, `love-match`, `siamsi`, all players `[1, 1]`), and GameLayout renders the
  panel only for a range other than `[1, 1]`. gh#153 re-pointed it at "any [2, 10] page" on
  2026-09-03, but that set had already been empty since gh#149 shipped on 2026-08-30.
- **`scripts/gamenav-again-grid-probe.mjs` — retargeted.** GameNav still renders below `#stage` on
  all three landings, and the hazard still has a subject: on siamsi, `#ss-keep` (the slip screen
  giving way to the done screen) shrinks the stage from about 885px to 107px. At 320x900, with the
  control scrolled to the bottom of the viewport, the first scan resolved 231 of 1120 grid points to
  live GameNav anchors (`/game/daily-fortune/`, `/game/love-match/`); later runs read 0 to 735, with the
  random slip (see Runs). With the control centred the count is 0,
  which is the alignment CI's `no-nav-in-stage` probe samples — its claim 2 is ungated by design, but
  this blind spot is now measured. `#ss-again` grows the stage and collided nowhere.

## The verdict grades the consequence, not the geometry

ADR-0015 accepted the collision permanently, and the build has one, so "no collision" could never be
the green. The probe passes only when a collision was found on a page that had announced a round
AND a real touch on it kept the path and opened `#leave-confirm`, third touch included. That is also
why the suggested mutant "GameNav moved under the stage" cannot be the red for a guarded page: it
moves links, it does not break the guard. The red ADR-0015 itself names is the build where the same
tap navigates, so that is mutant 1. The other two red different branches (`mutants.mjs` header).

## Runs (final probe file)

Served with `npx serve@14` on port 4391 (real build) and 4392 (mutants), Chrome on CDP 9391,
`--headless --disable-gpu` (none of the three landings is a WebGL route).

| File | Tree | Verdict | Read |
|---|---|---|---|
| `green-1.json` | `dist/` at `3901965` | PASS | siamsi 320x900 end `#ss-keep`: 66/1120 points on GameNav; real tap at (22, 838) stayed on `/game/siamsi/`, dialog open, third tap stayed; `#leave-go` 783px from the finger |
| `green-2.json` | same | NO-SUBJECT | no collision on any walk: the slip drawn was taller (926px) and the done screen missed the finger |
| `green-3.json` | same | PASS | as green-1 |
| `red-guard-unlatched.json` | mutant 1 | FAIL | 231/1120 points; real tap at (22, 850) went to `/game/daily-fortune/`, dialog never opened |
| `red-nav-under-stage.json` | mutant 2 | UNGUARDED | love-match (announces no round) collides on 6 walks and each real tap leaves the page; siamsi collides on 2 and the guard holds both |
| `red-announce-dropped-1.json` | mutant 3 | NO-SUBJECT | slip missed the finger, nothing exercised |
| `red-announce-dropped-2.json` | mutant 3 | UNGUARDED | 198/1120 points; no round announced, real tap went to `/game/daily-fortune/` |
| `red-announce-dropped-3.json` | mutant 3 | UNGUARDED | as -2 |

`draft-*.json` are the same six legs run with the draft probe (markup-only "screen changed" check):
green PASS, PASS (735/1120 at 320x900 and 165/1328 at 375x667), and FAIL on the `#df-again` false
"nothing changed" described below; mutants FAIL, UNGUARDED, UNGUARDED. They carry the rest of the
10-of-12 count.

**The subject is not guaranteed per run.** Whether `#ss-keep`'s done screen lands under the finger
depends on the random slip's height: 10 of 12 walks to that screen at 320x900 bottom-aligned
collided across every run today, including earlier ones with a draft of the probe that differed only
in its "screen changed" check. A NO-SUBJECT run on a clean build means rerun, never pass. That draft
also produced one false FAIL worth knowing about: `#df-again` redraws at random and once drew the
same lines, so comparing markup alone read a real re-render as "nothing changed"; the final file also
checks whether the old nodes were detached. CI's `no-nav-in-stage` uses markup comparison only.

## How to reproduce

```bash
npm run build
node docs/verification/evidence/gamenav-grid-2026-10-04/mutants.mjs dist <scratch-dir>
PROBE_BASE=http://localhost:4391 CDP_PORT=9391 node scripts/driver.mjs scripts/gamenav-again-grid-probe.mjs
```

Serve `dist/`, then each `<scratch-dir>/<mutant>` in turn, on the port `PROBE_BASE` names. Check the
server is LISTENING before the run (`lsof -ti tcp:<port> -sTCP:LISTEN`): a bare `lsof -ti:<port>`
also matches the browser's leftover CLOSE_WAIT sockets from the previous server, which made one run
here fetch from a port nothing was serving.

## Not covered

Two viewports and three scroll alignments are a sample of finger positions, not an enumeration
(ADR-0016). One real tap per colliding transition. The siamsi tie-away branch is not walked.
