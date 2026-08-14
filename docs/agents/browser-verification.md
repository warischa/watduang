# Verifying a page in a real browser

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
| `CDP_STAGE2=<probe>` | reload in the SAME tab, then run a second probe and return its result |
| `CDP_SHOT=<path.png>` | screenshot through the emulated viewport |

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

## Three traps that produced wrong answers here

Each of these passed a plausible-looking check while measuring nothing.

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

**2. Calibrate the DETECTOR, not just the feature.** A probe using `#draw-go`'s visibility to mean
"the round started" was **true before a single name was typed** — always-true, measuring nothing, and
it nearly produced a false bug report against working code. Before trusting any boolean probe,
evaluate it at a moment when it MUST be false. On these pages the valid signal is
`!document.querySelector('#start-round')?.offsetParent` — the setup panel hides when a round starts.

**3. `sessionStorage` is per-tab.** Every `cdp.mjs` run opens a new tab, so a game checkpoint written
by one run is invisible to the next — a positive control will come back empty and look like the bug
does not exist. In `cdp.mjs`, anything involving a checkpoint must seed and observe in ONE tab via
`CDP_STAGE2`. In `driver.mjs`, this is the default: `session.nav()` navigates the same tab, so
seed-then-observe is just two `nav()` calls in one script.

## Reduced motion

`--force-prefers-reduced-motion` flips `matchMedia('(prefers-reduced-motion: reduce)')` — verified
both ways (absent → `false`, present → `true`). Run the page with and without it and compare at
runtime; do not conclude from an identical DOM dump, which is equally consistent with "handled
correctly in CSS" and "ignored entirely". A page with no animation at all is **N/A, not pass** —
recording a non-existent animation as a passing accessibility check is a lie in the tracker.

## Rule

If a check could not be run, say so. Never infer the result from markup — that inference is the
thing this tooling exists to replace.
