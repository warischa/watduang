# Verifying a page in a real browser

Real iOS WebKit (no CDP path at all): [ios-webkit-verification.md](./ios-webkit-verification.md).

Some Definition-of-done boxes cannot be settled from markup: "works at ~320px wide", "the spin
animation stops when the device asks to reduce motion", "the round survives a refresh". Reading the
CSS and concluding is how those boxes stayed unticked-but-assumed for three sessions.

Two zero-dependency CDP drivers cover this. Playwright is not installed and must not be added —
this project ships 3 packages and that is a feature.

| Tool | Use for |
|---|---|
| `scripts/cdp.mjs` | single URL, one probe, env-flag ergonomics (width, screenshot, reload-and-reprobe) |
| `scripts/driver.mjs` | crossing pages in one tab, or capturing console errors/exceptions |

`cdp.mjs` opens one tab per invocation and cannot navigate it to a second URL or listen for
console/exception events. `driver.mjs` exists for exactly those two gaps — it does not replace
`cdp.mjs`'s env-flag surface (no `CDP_WIDTH`/`CDP_KEEP`/`CDP_STAGE2` equivalents; width and reload
are explicit calls instead, see below).

## Setup

```bash
npm run build
npx serve dist/ -l 4321 &
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --no-sandbox --remote-debugging-port=9222 \
  --user-data-dir=/tmp/cdp-prof &
```

Tear both down when finished (`pkill -f "serve dist"`, `pkill -f remote-debugging-port=9222`) and
confirm with `lsof -ti:4321,9222` that both ports are actually free.

## `cdp.mjs` usage

```bash
node scripts/cdp.mjs <url> <probe.js>
```

`probe.js` is an async function body evaluated in the page; its return value prints as JSON.

| env | effect |
|---|---|
| `CDP_WIDTH` / `CDP_HEIGHT` | real emulated viewport (the page genuinely reflows) |
| `CDP_KEEP=1` | do not wipe storage — ask what a *returning* user sees |
| `CDP_STAGE2=<probe.js>` | **path to a second probe file** (not inline script text — same rule as the positional `<probe.js>` argument); reload in the SAME tab, evaluate that file, print its result |
| `CDP_SHOT=<path.png>` | path to write the screenshot; the screenshot is captured through the emulated viewport |

**What prints, and when.** Normal run (no `CDP_STAGE2`): one JSON line — the probe's return value, or `{ error }` on exception. With `CDP_STAGE2` set: **two** JSON lines from the one invocation — the first probe's result, then (after the same-tab reload) the second probe's result. That is the whole two-stage calibration: seed/measure with `<probe.js>`, reload, measure again with `CDP_STAGE2`, read both lines from stdout. If `CDP_STAGE2` cannot be read as a file, `cdp.mjs` prints `{ error: "CDP_STAGE2 must be a path to a probe file, not inline script text: ..." }` and exits 1 instead of a bare `ENOENT`.

## `driver.mjs` usage

```bash
node scripts/driver.mjs <script.mjs>
```

`<script.mjs>` default-exports an async function that receives a `session` object:

| call | does |
|---|---|
| `session.nav(url)` | `Page.navigate` + wait for load; navigates the SAME tab, so `sessionStorage` survives across calls |
| `session.setWidth(w, h)` | `Emulation.setDeviceMetricsOverride` — verified to genuinely reflow (`innerWidth` matches) |
| `session.evaluate(body)` | `Runtime.evaluate`; returns **`{ value }` on success or `{ error }` on exception** — not the bare value, read `.value` |
| `session.wipe()` | `localStorage.clear(); sessionStorage.clear()` — call explicitly; unlike `cdp.mjs`, storage is **not** wiped by default |
| `session.screenshot(path)` | `Page.captureScreenshot`, written to `path` |
| `session.consoleErrors` | array, appended live — but only from `Runtime.exceptionThrown` and `console.error` calls; `console.log`/`.warn`/`.info` are **not** captured |
| `session.close()` | closes the tab |

The script's return value prints as JSON on stdout.

Known ceilings, both confirmed by a real run in this session, not inferred from the source:

- `nav()` waits on `Page.loadEventFired` with no timeout — a URL that never fires `load` hangs the
  driver forever.
- Storage carries over between `nav()` calls by design (that is the reason this driver exists —
  see Trap 3 below) — call `session.wipe()` yourself when a test needs a clean slate, `driver.mjs`
  will not do it for you.

## Traps that fire while setting up or driving a probe

Each of these passed a plausible-looking check while measuring nothing. Three more — the kind that
fire only once you already have a capture in hand and are judging what it means — moved to
[interpreting-browser-captures.md](./interpreting-browser-captures.md) to stay under the doc budget.

**1. `--window-size` does not resize the layout.** `--dump-dom` renders at `innerWidth=500` no matter
what you pass, in every headless mode. `--screenshot` produces a PNG of the requested width, but it
is a **crop of a wider render** — the page never reflowed. Asserting the PNG width with `sips`
passes and proves nothing, because the width was never the question. This produced three false
"320px FAIL" verdicts against correct code. Use `CDP_WIDTH` (or `driver.mjs`'s `session.setWidth`),
and check the probe reports `innerWidth` equal to what you asked for; if it does not, the run is void.

Measure overflow, do not eyeball it:

```js
const de = document.documentElement;
return { innerWidth, scrollWidth: de.scrollWidth, clientWidth: de.clientWidth,
         over: [...document.querySelectorAll('body *')]
           .filter(e => e.getBoundingClientRect().right > de.clientWidth + 0.5).length };
```
Pass = `innerWidth` is what you asked for, `scrollWidth === clientWidth`, `over === 0`.

**3. `sessionStorage` is per-tab.** Every `cdp.mjs` run opens a new tab, so a game checkpoint written
by one run is invisible to the next — a positive control will come back empty and look like the bug
does not exist. In `cdp.mjs`, anything involving a checkpoint must seed and observe in ONE tab via
`CDP_STAGE2`. In `driver.mjs`, this is the default: `session.nav()` navigates the same tab, so
seed-then-observe is just two `nav()` calls in one script.

**4. A wipe on `about:blank` clears nothing.** `localStorage` is per-origin, so `session.wipe()` issued
before navigating — while the tab still sits on `about:blank` — clears that blank page's storage and
leaves the target origin untouched. The run then starts with a **dirty roster** and every
"fresh device" claim in it is false, while looking perfectly clean. Navigate to
`http://localhost:4321/...` FIRST, then wipe, then reload. Verify the wipe landed by reading the
roster key back on-origin and asserting it is empty — an unverified wipe is indistinguishable from
no wipe at all. Cost the #15 walk its first run.

**5. A capture can straddle a boundary the page itself owns.** `daily-fortune` and `love-match` key
their result to the **Asia/Bangkok date** and store nothing, so at Bangkok midnight — **UTC
17:00:00** — every name's reading legitimately changes. A determinism walk whose samples span that
instant sees one name produce two answers and reports `FAILED` against correct code. This nearly
happened: the #33 walk was running at exactly UTC 17:00:00. Check the clock before driving anything
date-keyed, keep every sample inside one Bangkok day, and record in the evidence **which** Bangkok
day the verdict rests on — a determinism verdict that does not name its day cannot be re-checked
later. Generalises: when a page's output is a function of a clock, a run is only valid inside one
tick of that clock.


**6. A sample taken ON a box edge lands where nothing is painted.** `elementFromPoint(x, rect.bottom)`
and `elementFromPoint(rect.right, y)` sit on a fractional sub-pixel boundary Chrome's paint does not
cover, so the call returns the **parent** — an entire last row and last column read as "not tappable".
A `/tools/` card grid scan on 2026-08-26 reported **196 misses where the true number was about 19**: a
plausible-looking figure, off by an order of magnitude, in the direction that makes a real improvement
look bigger than it was. Inset every sample by at least 1px (`rect.left + 1` … `rect.right - 1`); the
committed probes already do this — `arm-gate-probe.mjs`, `leave-confirm-probe.mjs`, and both
`gamenav-*-grid-probe.mjs` inset their grid loops (grep `left + ` to find them; line numbers in prose
rot, and two cited here were already wrong once). The scan that produced 196 was
ad hoc and never committed, which is exactly why no gate caught it and why classifying the committed
set comes back clean. Corollary: sampling only along the centre line is the same bug rotated — a fixed
centre-x with varying y cannot see an off-axis collision at all. A tap-area or clearance percentage is
trustworthy only if the evidence records which coordinates were sampled.
## Reduced motion

Moved to [reduced-motion-verification.md](./reduced-motion-verification.md) to stay under the doc budget. The
heading stays here so a heading scan still finds it.

## When a committed capture goes stale — and when it does not

Moved to [capture-freshness.md](./capture-freshness.md) to stay under the doc budget. The heading stays
here so a heading scan still finds it, and so ADR-0009's reference resolves in one hop.

<!-- ponytail: headroom reclaimed 2026-08-22 twice — Reduced motion out, then traps 2/6/7 out into
interpreting-browser-captures.md (ADR-0012 seam: driving vs. judging a capture). Run
check-budgets.sh before trusting any number here — it drifts every time a trap or entry is added. -->

## Seed through the trigger, never past it

Dispatching the app's own start event to reach mid-round state skips what that trigger does on the
way — a panel collapsing, a reflow under a descending finger — so the probe measures a state no tap
ever produces. Reproduced 2026-08-22: a draw-page probe seeded that way reported the page clean and
missed a 6/9 tap collision on a sibling tool page (#61). Drive the control a player touches.

## Rule

If a check could not be run, say so. Never infer the result from markup — that inference is the
thing this tooling exists to replace.
