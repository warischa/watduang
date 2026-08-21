# gh#54 — a game mount that throws left the panel gone and the group one tap from being wiped

**Verdict: CONFIRMED, then fixed and re-driven.** With the catch body absent the panel is gone after a
failed mount (`startRects 0`) and Clear group is the only control left. With the catch body present
the panel comes back on the first failure (`startRects 1`) — but the fix worked **exactly once**: on a
retry the same page threw synchronously and the panel was hidden again. Both halves are driven here,
each with a control that can fail.

## What was run

`scripts/driver.mjs` + headless Chromium over CDP, against `npx serve` on a **real `npm run build`**
of this tree. Nothing in the shell is stubbed: the real `#start-round` button, the real
`watduang:start` dispatch, the real dynamic import, the real `saveGroup`/`root.hidden` flow.

The only thing changed is the served game chunk, per page:

| Page | Chunk | Failure it drives |
|---|---|---|
| `short-stick` | replaced with `throw new Error(...)` at module top level | `await load()` rejects → catch resumes in a microtask |
| `love-match` | replaced with a module whose `default.mount()` throws | `game.mount()` throws → **caches `game`**, so the retry throws synchronously |
| `pick-loser` | **untouched** | calibration control — a real mount must happen |

Only `love-match` can reach the synchronous path. `short-stick`'s chunk fails to evaluate, so `game`
stays `null` and every press re-enters `await load()` — its retry is still the async path. That is why
the retry scenario is driven on `love-match` and `short-stick` is driven as the unchanged-first-failure
case.

Three roots were served, differing from the built `dist/` by **one expression each**, so no run has
more than one variable against the run it is compared with:

| Root | `[id].astro` catch body, as served (minified) | Port |
|---|---|---|
| fixed (ships) | `const e=…;e&&queueMicrotask(()=>{e.hidden=!1})` | 4322 |
| pre-fix control | `const e=…;e&&(e.hidden=!1)` | 4323 |
| no-catch control | `catch{}` | 4324 |

## 1. The first failure — the panel comes back

`gh54-mount-failure-probe.mjs` → `result-mount-failure.json`, and `gh54-usable-panel-probe.mjs` →
`result-usable-panel.json`. Both against the shipping build.

| | pick-loser (control) | short-stick | love-match |
|---|---|---|---|
| `panelHidden` after start | **true** | false | false |
| `stageKids` after start | **3** | 0 | 0 |
| `startRects` | — (panel gone, round running) | **1** | **1** |
| `elementFromPoint` at the start button | — | `start-round` | `start-round` |
| `stillTicked` | 2 | **2** | **2** |
| `group` | `["สมชาย","ปูเป้"]` | `["สมชาย","ปูเป้"]` | `["สมชาย","ปูเป้"]` |

The control is what makes this readable: `pick-loser` hides the panel and puts 3 nodes in `#stage`, so
"panel visible" is not the only outcome this apparatus can report.

## 2. Negative calibration — the detector can fail

`result-usable-panel-nocatch.json`: the same build, same probe, catch body stripped to `catch{}`.

| | short-stick | love-match |
|---|---|---|
| `startRects` | **0** | **0** |
| `onlyControlIsClearGroup` | **true** | **true** |
| `stillTicked` | 2 | 2 |

`startRects 0` with `onlyControlIsClearGroup true` is gh#54 as reported: no round on screen, no panel,
and the one remaining button empties the group. `startHitByAPoint` reads `""` rather than `null` here —
a hidden element's `getBoundingClientRect()` is all zeros, so the probe resolved point (0,0) and got
`<html>`, which has no id. `startRects` is the load-bearing number in that file, not that string.

## 3. The retry — the first fix worked exactly once

`gh54-retry-probe.mjs`. Presses `#start-round`, lets the failure land, then presses it **again**.
It reads `#player-setup.hidden` at two instants on each press: the moment `click()` returns (microtasks
have not drained) and again after they have. The gap between those two readings *is* the deferral.

`result-retry-prefix-control.json` — **pre-fix, the positive control** (`e.hidden=!1`, no deferral):

| love-match | press 1 (async throw) | press 2 (sync throw) |
|---|---|---|
| `hiddenAtClickReturn` | true | true |
| `hiddenAfterMicrotasks` | true | **true** |
| `rootHidden` settled | false | **true** |
| `startRects` | 1 | **0** |
| `elementFromPoint` | `start-round` | **null** |
| `stageKids` | 0 | **0** |

`rootHidden true` with `stageKids 0` is the defect exactly: `PlayerSetup.astro` hands
`root.hidden` to `planClear` as `roundLive`, so Clear group asks about a round that does not exist and
on confirm runs `saveGroup([])`. Verdict string in the file: `RETRY_PANEL_LOST`.

`result-retry.json` — **post-fix** (`queueMicrotask`):

| love-match | press 1 (async throw) | press 2 (sync throw) |
|---|---|---|
| `hiddenAtClickReturn` | true | **true** |
| `hiddenAfterMicrotasks` | true | **false** ← the deferral landing |
| `rootHidden` settled | false | **false** |
| `startRects` | 1 | **1** |
| `elementFromPoint` | `start-round` | **`start-round`** |
| `stillTicked` | 2 | **2** |
| `group` | `["สมชาย","ปูเป้"]` | **`["สมชาย","ปูเป้"]`** |

Verdict string: `RETRY_PANEL_SURVIVES`. Press 2's `true → false` pair is the mechanism caught in the
act — `root.hidden = true` had already been applied when `click()` returned, and the microtask undid it
afterwards. Press 1 shows `true` at both instants because the async path takes an import round-trip,
far longer than three microtask ticks; its settled `rootHidden false` is where that path is read.

`short-stick` is unchanged across both roots on both presses (`startRects 1`, `rootHidden false`) —
the fix did not move the path it was not aimed at.

## Why the "0" and the "true" here are not vacuous

- **The control mounts, it does not merely hide.** A first cut of `gh54-retry-probe.mjs` accepted
  `rootHidden === true` as proof that `pick-loser` had mounted. It has not: `requestStart` sets
  `root.hidden = true` before dispatching, whatever happens next. That version passed against a control
  root whose handler chunk had been broken into a `SyntaxError` and never ran at all — reported as a
  hidden panel with `stageKids: 0`. The verdict now requires `stageKids > 0` and emits
  `VOID_CONTROL_DID_NOT_MOUNT` otherwise. The broken root was thrown away and both runs re-driven.
- **The pre-fix control is one token from the shipping build**, produced by editing the served chunk,
  not by a second build — so nothing but the deferral differs between the red and the green.
- **Three distinct verdict strings** (`RETRY_PANEL_SURVIVES` / `RETRY_PANEL_LOST` /
  `VOID_CONTROL_DID_NOT_MOUNT`) so a grep never conflates "the bug is gone" with "the apparatus
  worked".
- Preconditions are recorded, not assumed: `setup.rosterCheck` reads the seeded roster back on-origin
  (an unverified wipe looks exactly like no wipe — trap 4 in `docs/agents/browser-verification.md`),
  and `setup.ticked` records `{found: 3, checked: 2}` before any press.
- `consoleErrors` is `[]` in both runs. The throws are caught, so a non-empty array would mean
  something *else* broke.

## Screenshots are deliberately not committed

`.gitignore` excludes `docs/verification/evidence/**/*.png`: the JSON log is the evidence when an
inspector produced one, and CDP always can. No frames were kept from these runs.

## What this does NOT cover

- **The `saveGroup([])` wipe itself was never driven.** No run here presses "Clear group" or confirms
  it. What is proved is that the *state which forces* the wipe — a hidden panel with no round, so
  `roundLive` is true and the confirm names a round that does not exist — is gone. It is **not** proved
  that the wipe call cannot fire; that needs a run that goes on to press Clear group and confirm.
- Only two failure shapes: a chunk that throws on evaluation and a `mount()` that throws. A chunk that
  hangs, resolves to a module with no `default`, or fails to fetch at all is untested — a rejected
  `load()` is stubbed by a throwing module, not by a real network failure.
- Only `love-match` exercises the synchronous path. Every other game reaches it too (any game whose
  chunk loads and whose `mount()` later throws), but none was driven.
- Only one retry deep. A third and fourth press are not driven; they take the same synchronous path as
  the second.
- Desktop headless Chromium at the default viewport. No 320px run and no iOS WebKit run — this
  measurement is about `hidden` and element identity, not layout, but nothing here rules out a
  device-specific difference.
- `dispose()` is a no-op in the `love-match` stub, so this says nothing about whether a partially
  mounted game leaves an AudioContext or wake lock behind when `mount()` throws midway.
