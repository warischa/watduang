# no-nav-in-stage probe: a real re-render with identical markup — 2026-10-05

Owner ruling 2026-10-05: ticket and fix this run. Ticket: gh#256.

## The defect and the fix

`scripts/no-nav-in-stage-probe.mjs` computed `changed` as `stage.innerHTML !== htmlBefore`. daily-fortune's
`#df-again` redraws at random through `stage.replaceChildren()`, so a draw that repeats the same lines
(with the controls already enabled) is a real re-render with identical markup, read as "nothing changed".
`walkUsable` then went false and `scripts/ci-probes-verdict.mjs` failed `gamesWithUsableWalk !== 3`.
The fix is the pattern from `docs/verification/evidence/gamenav-grid-2026-10-04/`: snapshot
`[...stage.children]` before the tap and also count an old child that is no longer connected. The tap
label `#df-again -> ask` was stale and is now `#df-again -> redraw`; nothing keys on it (the verdict
reads `summary` fields only; the only other hits are two historical JSONs under
`docs/verification/evidence/236-inconclusive-2026-09-13/`).

## Setup

`npm run build` at `ebdf9e0` (clean tree), `npx serve@14` on port 4391, headless Chrome on CDP 9391 with a
fresh `--user-data-dir` per leg (the mutants keep the real bundles' file names, so a reused browser cache
could serve the wrong bytes). One leg at a time, every pid torn down after the leg.
`mutants.mjs <dist> <outdir>` builds both mutants. OLD probe = `git show HEAD:scripts/no-nav-in-stage-probe.mjs`.

## Legs (all legs: 320x900, `gamesWithUsableWalk` is the summary field)

| Leg | Tree | Probe | n | Result |
|---|---|---|---|---|
| 1 positive control | `same-draw` | OLD | 3 | `old-probe-same-draw-{1..3}.json`: usable=2, daily-fortune `#df-again` changed=false |
| 1 positive control | `same-draw` | NEW | 3 | `new-probe-same-draw-{1..3}.json`: usable=3, changed=true |
| 2 must-red | `noop-again` | NEW | 3 | `new-probe-noop-again-{1..3}.json`: usable=2, changed=false (still red) |
| 2 baseline | `noop-again` | OLD | 1 | `old-probe-noop-again-1.json`: usable=2, changed=false |
| 3 unmutated | `dist/` | NEW | 3 | `new-probe-clean-{1..3}.json`: usable=3 |
| 3 baseline | `dist/` | OLD | 3 | `old-probe-clean-{1..3}.json`: usable=3 |

Mutants (each edit asserted to match exactly once):

- `same-draw`: `drawFortune`'s default random source becomes constant 0, AND the shared arm gate's
  `setTimeout(f,400)` becomes `setTimeout(f,1)`. The second edit is needed: inside the 400ms arm window a
  re-rendered screen carries `disabled` attributes the old screen lacked, and the probe reads 250ms after
  the tap, so markup differs for that reason alone (the draft mutant with only the first edit stayed
  green on the OLD probe, 3 of 3 runs, which is why it is not a control). With both edits the re-render is
  real and byte-identical.
- `noop-again`: `#df-again`'s click handler becomes an empty function.

`node scripts/ci-probes-verdict.mjs no-nav-in-stage <json> 0 <empty-stderr>`: prints `ok` for
`new-probe-clean-1` and `new-probe-same-draw-1`; prints "2 game(s) had a usable walk, expected 3" for
`old-probe-same-draw-1` and `new-probe-noop-again-1`. `node scripts/ci-probes-verdict.test.mjs`: 7 pass.

## Not covered

On the unmutated local build the OLD probe was already green 3 of 3: the markup difference from the arm
window's `disabled` attributes hides the repeat draw at a 250ms read. The failure needs a repeat draw AND
controls already enabled at the read (a stalled runner), so the CI red was reproduced only through the
mutant, not on a real build. Siamsi's `#ss-hold` custom trigger is covered by the same `changed` line but
was not mutated.
