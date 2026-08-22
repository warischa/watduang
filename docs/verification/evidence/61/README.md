# gh#61 — does the collapse still hand a ghost tap a free navigation, once the panel collapses again?

**Verdict: SUPPRESSED_THEN_RELEASED.** With the window in place, the second contact of a real
double-tap landed on a live `<a href="/game/timebomb/">` and the page stayed on `/tool/team/`. The same
tap on a build differing by one variable — the swallower deleted — **navigated to
`/game/timebomb/`**. A tap after the window closed navigated normally.

## Why this is not a grid probe

The first gh#61 fix held the panel's box, so the link never arrived under the finger, and a 75-point
`elementFromPoint` grid measured it: 40 colliding points went to 0. That fix was reverted — it left a
permanent panel-sized gap above the tool result at 320px, which the site owner refused.

The panel now collapses again, so **the geometry legitimately collides**: `contact2` in every JSON here
resolves to a real anchor. A grid probe would go red while the fix is working. The invariant is
behavioural — `location.pathname` must not change — and that is what is measured.

## What was run

`collapse-double-tap-probe.mjs`, headless Chromium over CDP via `scripts/driver.mjs`, against a real
`npm run build` served by `npx serve dist/`. Real touch (`Input.dispatchTouchEvent`), never
`.click()` + `elementFromPoint`: a synthetic click proves an element sits at a point, never that a tap
there fires anything. `/tool/team/`, roster of 4, device metrics 320x568 with `innerWidth: 320`
asserted in every result file.

Contact 1 is the CTA's own centre (70.17, 526.88). Contact 2 is **measured, not assumed**: after
contact 1 the probe re-scans the CTA's pre-collapse box for the point that now resolves to an
`a[href]`, and taps that. It resolved to (70, 527) — the same pixel, 0.045px from contact 1's centre —
carrying `href=/game/timebomb/`, label "ระเบิดเวลา".

| File | Build | Gap | Contact 2 landed on | Result |
|---|---|---|---|---|
| `result-positive-control.json` | swallower deleted | 120ms | `/game/timebomb/` link | **NAVIGATED** — title became "ระเบิดเวลา — เกมส่งมือถือวนกัน เล่นฟรีบนเครื่องเดียว" |
| `result-fix.json` | shipped tree | 120ms | same link, same pixel | did not navigate; tap at +800ms did |
| `result-fix-gap300.json` | shipped tree | 300ms | same link, same pixel | did not navigate; tap at +800ms did |
| `result-game-page.json` | shipped tree | n/a | n/a | game page unchanged, see below |

## The positive control

`result-positive-control.json` is the arm that makes the rest mean anything: a probe that cannot
produce a navigation proves nothing about one that does not. It was driven against a **second dist**
built from a worktree of the same commit whose `PlayerSetup.astro` was this repo's file with exactly
two things deleted — the `if (gameId === undefined)` swallow branch and the `ARM_DELAY_MS` import.
Nothing else differed (`diff` of the two files, comments excluded, showed those lines and nothing
more). Served on its own port, driven by the identical probe file, same viewport, same roster, same
gap. It navigated.

That worktree is gone with the session; it is reproducible from the committed source by deleting that
one branch, because the branch is the only difference.

## Game pages are untouched

`game-page-unaffected-probe.mjs` / `result-game-page.json`, on `/game/timebomb/`: panel
`display: none`, `offsetParent` null, stage revealed with 3 children. `_arm-gate` behaviour unchanged —
`#tb-start` appeared 11ms after the start click already `disabled: true`, and armed at 416.6ms.

The load-bearing half is the last one: a nav-link tap **21.3ms** after the start click — inside any
400ms window — reached the gh#39 leave-confirm listener. `#leave-confirm` was open, focus on
`#leave-stay`, location still `/game/timebomb/`. Had the tool-page swallower been installed here, that
click would have been eaten and the dialog would have stayed shut — which looks identical to "the
guard worked" if the only thing checked is that nothing navigated.

## Side effect: the round-started detector reads correctly again

`interpreting-browser-captures.md` trap #2 names `!document.querySelector('#start-round')?.offsetParent`
as the "round started" signal and cites a tool page. The box-holding fix broke it — a
`visibility: hidden` panel keeps its `offsetParent`, so the detector read `false` for a round that had
started. Measured on `/tool/team/` in both `result-fix.json` and `result-fix-gap300.json`, calibrated
in both directions: `roundStartedDetector: false` before the start (`seed`), `true` after it
(`afterContact1`), alongside `display: none`, `offsetParentNull: true`, `panelRectHeight: 0`. The
detector is repaired, and that same `panelRectHeight: 0` is the gap the site owner asked to have back.

## What this does NOT cover

- **One tool page, one roster size, one viewport.** `/tool/team/` at 320x568 with 4 names. The window
  is keyed on `gameId === undefined`, not on any page's geometry, so the other three tools take the
  same branch — but they were not driven.
- **One gap pair (120ms, 300ms) and one browser.** Headless Chromium only. No real iOS WebKit run; a
  Safari `touch` -> synthetic-click pipeline is not proven here.
- **Nothing about the boundary.** No sample sits near 400ms on purpose — a run straddling the tick
  reports correct behaviour as a red. What is proven is "inside the window, swallowed" and "well past
  it, released", not where exactly the edge falls.
- **The uncapped-deferral ceiling is inherited, not retested.** ADR-0016 accepts that every contact
  restarts the window; a finger resting on the page keeps activations swallowed. The probe shows one
  restart (contact 2 pushes the release out and the tap at +800ms still works), not the pathological
  case.
- **Not wired into CI.** These are one-off measurement probes, kept because the verdict rests on them.
  The static half — that the branch exists, is gated on `gameId === undefined`, swallows both events in
  the capture phase, releases them, and holds no box — is pinned by the gh#61 test in
  `src/shell/player-setup.test.mjs`, which was written red against the box-holding tree first.

## Reproducing

```bash
npm run build
npx serve dist/ -l 4321 &
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --no-sandbox \
  --remote-debugging-port=9222 --user-data-dir=/tmp/cdp-prof &
PROBE_BASE=http://localhost:4321 CDP_PORT=9222 \
  node scripts/driver.mjs docs/verification/evidence/61/collapse-double-tap-probe.mjs
PROBE_BASE=http://localhost:4321 CDP_PORT=9222 \
  node scripts/driver.mjs docs/verification/evidence/61/game-page-unaffected-probe.mjs
```

Run date 2026-08-22, Chrome 151.0.7922.173.
