# gh#269 — can a stylesheet-only reveal paint before the shared player screen's open task?

Date: 2026-10-18 · Chrome/155.0.8059.82, headless, raw CDP · `dist/` built 2026-10-18 09:53 from the working tree (HEAD `552c6d4` plus uncommitted edits by other sessions; the sampler source and `player-screen.ts` had no uncommitted edits).

DoD box 1 of gh#269: a real-browser calibration of the ordering the 2026-10-16 replay simulated.
The ordering is: the first-screen sampler's frame callback runs, a reveal made by stylesheet alone (no DOM
mutation) is applied, and then the open task runs.

**Scope of the answer.** A finite calibration can show that this ordering is REACHABLE. It can never
show that it is unreachable everywhere. What follows is "painted / not painted, in these environments,
k of n". It is nothing wider than that.

## Answer

**Reachable.** The reveal is applied inside a frame callback that runs after the sampler's, with the
open in a later task. In that case the revealed content is painted and presented in its own frame, before
the open, every time:

- synthetic page: 15 of 15 runs per environment (3 mechanisms × 5), 30 of 30 across both
- croc-bite: 10 of 10 runs per environment (2 mechanisms × 5)

The real sampler (`FIRST_SCREEN_SAMPLER`, imported from the probe script, not a copy) gave green on
many of those painted frames. On the synthetic page it was green on 15 of 15 (WebGL-live) and 14 of 15
(no-WebGL), 29 of 30 across both. On croc-bite it was green on 7 of 10 (WebGL-live) and 4 of 10 (no-WebGL).

When the reveal is a task of its own (after the frame) and the open is the next task, nothing was
painted before the open: 0 of 15 per environment. So the hole needs the reveal to land INSIDE a
rendering update, after the sampler's callback.

## Detector, and why it observes paint and not style

`PerformanceObserver({ type: 'element' })` (Element Timing). The leaf carries `elementtiming="leaf"`.
The shared screen's text carries `elementtiming="open"`.

- An Element Timing entry is created by Chrome's paint-timing detector during the Paint step. It is not
  created by style or layout.
- `renderTime` / `presentationTime` is the presentation time of the frame that first painted that
  element.
- The leaf is hidden from the first paint, so its only entry can come from the frame after the reveal.

**Painted before open** = the leaf has an entry, and the leaf's `renderTime` is strictly less than the
first `renderTime` of the open screen. That means a separate, earlier presented frame showed the leaf
without the shared screen.

A second reading confirms the first. Chrome 155 exposes `paintTime`, and the leaf's `paintTime` came
before the open task's own timestamp in every painted run.

**Sampler verdict.** `firstScreenVerdict` on `FIRST_SCREEN_READ`, the same functions the fit probe
uses. A null verdict counts as green here only when the screen's final state is `open`.
`firstScreenVerdict` also returns null for a screen that never opened, and the harness refuses to
count that case as green.

## Mechanisms (all CSSOM, no DOM mutation)

| id | reveal |
|---|---|
| insert | `CSSStyleSheet.insertRule` into an existing sheet |
| adopt | a constructed sheet (`replaceSync`) appended to `document.adoptedStyleSheets` |
| media | an `@media not all` rule flipped to `all` through `CSSMediaRule.media.mediaText` (synthetic only) |
| attr | **control, not stylesheet-only:** the same reveal through a DOM attribute |

The page runs its own MutationObserver, which counts the DOM mutations recorded between the reveal and
the open. The count is ordered by a sequence number, not `performance.now()`. That clock is coarsened,
and a first pass that used it counted the open's own mutations by mistake.

- Every stylesheet mechanism: 0 mutations in every synthetic run. This count covers the synthetic page
  only: `hook-route.js` keeps no mutation log, so on croc-bite "stylesheet-only" holds by the CSSOM API
  used, not by a count (`summary.txt` prints `n/a` there).
- The `attr` control: 5 of 5 runs per environment, and the sampler went red on all 5. That proves both
  the mutation counter and the sampler's mutation path can fire.

## Orderings (synthetic page `calib.html` + `calib.js`, loaded from file://)

The sampler is installed first through `Page.addScriptToEvaluateOnNewDocument`, so its rAF callback is
registered first. The mount sets `data-player-screen="closed"` and the pending marker in one task. The
open does what the shared screen does: un-hide the root, `data-player-screen="open"`, and clear the
pending marker one microtask later.

| order | what runs | role |
|---|---|---|
| pos | reveal in a rAF callback after the sampler's; open 300 ms later | positive control: must report painted |
| neg | open in a task; reveal in the next task | negative control: must report not painted before open |
| real | reveal in a rAF callback after the sampler's; open in a `setTimeout(0)` task posted from it | the replay's ordering |
| task | reveal in a task posted after the frame; open in the next task | contrast |

## Results, n = 5 per cell (`summary.txt` holds every cell)

WebGL-live flags: `--headless=new --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`.
A fresh canvas in the page gave `webgl=live` on every run.

No-WebGL flags: `--headless=new --disable-gpu`. A fresh canvas gave `webgl=null` on every run, and `2d`
stayed live.

Both use `--window-size=390,844` plus a 390×844 device-metrics override. `innerWidth` read 390 on every
run.

| environment × order/mechanism | painted before open | sampler green (hole reached) |
|---|---|---|
| WebGL-live pos × insert/adopt/media | 5/5 · 5/5 · 5/5 | 0/5 · 0/5 · 0/5 |
| WebGL-live neg × insert/adopt/media | 0/5 · 0/5 · 0/5 | n/a |
| WebGL-live **real** × insert/adopt/media | **5/5 · 5/5 · 5/5** | **5/5 · 5/5 · 5/5** |
| WebGL-live real × attr (control) | 5/5 | 0/5 |
| WebGL-live task × insert/adopt/media | 0/5 · 0/5 · 0/5 | n/a |
| no-WebGL pos × insert/adopt/media | 5/5 · 5/5 · 5/5 | 0/5 · 0/5 · 0/5 |
| no-WebGL neg × insert/adopt/media | 0/5 · 0/5 · 0/5 | n/a |
| no-WebGL **real** × insert/adopt/media | **5/5 · 5/5 · 5/5** | **5/5 · 5/5 · 4/5** |
| no-WebGL real × attr (control) | 5/5 | 0/5 |
| no-WebGL task × insert/adopt/media | 0/5 · 0/5 · 0/5 | n/a |

In the real ordering the leaf's frame was presented a median 16 ms before the open's first frame
(range 12–20). The leaf's main-thread paint came a median 0.4–0.5 ms before the open task. The one
red real/media run had one sampler sample land in that gap.

## Real route: croc-bite (`hook-route.js`)

The pages come from `dist/`, served on 127.0.0.1:4451. The injected hook runs after the sampler.

**Why not `Runtime.evaluate`.** A CDP evaluate is a task of its own. It cannot be placed inside a frame
callback that runs after the sampler's, so the reveal goes in through an on-new-document script.

**How the open is placed at the replay's point.**

1. The harness clears storage on the origin and seeds the legacy key `watduang:timebomb-players`. That
   makes the mount's legacy-list migration take the roster lock. With no legacy key, the migration
   returns before taking the lock, and the open lands in the mount task, where no frame can intervene
   (inferred from the source, not measured in this run).
2. The hook takes the `watduang:roster` lock first, at document start.
3. When the pending marker appears, the hook waits two settle frames.
4. In the third frame callback, which runs after the sampler's, it reveals croc-bite's own held setup
   screen (`#screen-setup`, opacity 0 → 1, read back in the page) through insertRule or
   adoptedStyleSheets.
5. It then releases the lock: at once ('real') or 300 ms later ('pos').
6. The route's grant task runs the migration and the open.

The open's timing is controlled by the harness. The reveal is injected. Nothing in this run shows that
croc-bite itself makes such a reveal.

| environment × order/mechanism | painted before open | sampler green (hole reached) |
|---|---|---|
| WebGL-live pos × insert/adopt | 5/5 · 5/5 | 0/5 · 0/5 (offenders: the setup screen's Thai text) |
| WebGL-live **real** × insert/adopt | **5/5 · 5/5** | **3/5 · 4/5** |
| no-WebGL pos × insert/adopt | 5/5 · 5/5 | 0/5 · 0/5 |
| no-WebGL **real** × insert/adopt | **5/5 · 5/5** | **2/5 · 2/5** |

In every red real-route run, exactly one sampler sample landed between the reveal and the open (9 → 10).
The sampler missed the leaf 11 times in 20. Why it catches it more often here than on the synthetic
page is inferred, not measured: more tasks run between the lock release and the route's open.

## The render hold (ADR-0072)

`data-render-hold` read `held` at the reveal and at the open in all 20 real-route runs, and the setup
screen painted anyway. The hold is an application flag that the WebGL routes' draw loops subscribe to.
No stylesheet reads it: in `src/`, the attribute appears only in TS, JSON and tests. So it does not
suspend browser paint, and it does not make this hole unreachable on the routes that carry it.

## Not covered

- Real devices, other browsers, headed Chrome and the CI runner. Headless Chrome on this Mac only.
- Reveals driven by the browser itself (CSS animations or transitions, `:has()`, viewport media flips).
  These apply in style recalc after every rAF callback, so the same window is inferred to apply, but it
  was not measured.
- Whether any shipped route actually reveals content this way. This run shows reachability, not
  occurrence.
- one-bomb, which was not run.

## Reproduce

```bash
# one Chrome at a time; CDP 9451; the harness launches Chrome itself and kills its own pid
node harness.mjs webgl synth synth-webgl.json 5
node harness.mjs nogl  synth synth-nogl.json 5
python3 -m http.server 4451 --bind 127.0.0.1 --directory dist &   # record $!, kill it after
node harness.mjs webgl route route-webgl.json 5
node harness.mjs nogl  route route-nogl.json 5
node summarize.mjs synth-webgl.json synth-nogl.json route-webgl.json route-nogl.json
lsof -nP -ti tcp:4451,9451   # must print nothing
```

Teardown this run: 10 Chrome pids launched and killed by the harness, plus one server pid killed by
pid. Final `lsof -nP -ti tcp:4451,9451` printed nothing (rc 1). The same command printed the pid when a
control listener was up on 4451.
