# Verifying on iOS WebKit without an inspector

`docs/agents/browser-verification.md` covers headless Chrome via CDP. Every capture there — every
320px reflow claim, every taken-chip opacity claim — was headless Chrome, never a real WebKit engine.
This doc is for the iOS Simulator, where the CDP path does not exist at all: a different seam
(ADR-0012), not an addition to that file.

## What is and is not available

| capability | status |
|---|---|
| iOS Simulator (`xcrun simctl`), booted device | works from Bash — no MCP tool required |
| `simctl openurl <device> <url>` | routes to Safari; this is the "navigate" primitive |
| `simctl io <device> screenshot <path>` | grabs the real device framebuffer at device-pixel resolution, **even with no on-screen Simulator window** — confirmed on a headless/streamed Simulator setup where `System Events` reports 0 windows for the Simulator process |
| `ios_webkit_debug_proxy` / any CDP-equivalent | **ABSENT** — there is no inspector, no `Runtime.evaluate`, no console access |
| Raw touch/tap injection (`idb`, `fbsimctl`, `appium`) | **ABSENT** in a plain Bash-only environment — checked and confirmed missing; do not assume an MCP tap tool is wired into every dispatch context, some subagents get Bash only |

If a dispatch also exposes a dedicated simulator MCP tool (`open_url`/`tap`/`screenshot`), prefer it —
it gives real device-point touch input. Everything below is what remains true when it is **not**
available, using only `xcrun simctl` + Bash + Read (for screenshots).

## Technique 1 — in-page readout replaces the missing inspector

The page renders its own measurements into a `position:fixed` element; you read the numbers off a
screenshot. Keep the readout out of flow so it cannot shift what is being measured.

## Technique 2 — a 320px iframe replaces the missing device-metrics override

There is no simulated-320pt device and no `Emulation.setDeviceMetricsOverride` equivalent. Load the
page under test in `<iframe width=320>` instead. Confirmed on real iOS 26.5 WebKit: the iframe's own
`window.innerWidth` reads `320` while the hosting page's reads `402` — the document genuinely reflows
at 320 CSS px. Any capture using this MUST declare the layout was reached via an iframe, not a 320pt
device.

## Technique 3 — same-origin iframe + `.click()` replaces missing touch injection

With no tap tool, drive the real built page (not a rewrite of it) from a small controller page you
write, served from the **same origin** (so `iframe.contentDocument` is reachable):

```js
const win = frame.contentWindow, doc = frame.contentDocument;
doc.dispatchEvent(new win.CustomEvent('watduang:start', { detail: { players: [...] } }));
// ...wait for the page's own async mount...
doc.querySelector('#stage button').click();
```

This exercises the real click handler in the real WebKit engine and is a faithful way to test
CSS/layout/DOM outcomes (opacity, `aria-pressed`, reflow). **It is not a real touch event** — no
`touchstart`/`touchend`, no tap-to-click translation timing. Declare this substitution explicitly in
any capture that uses it; do not present it as equivalent to a device-point tap.

Put the controller page in the build output (`dist/`, gitignored) so it shares an origin with the
site under `npx serve dist/ -l <port>`, and delete it once the capture is done — it is scratch, not a
site page.

## The detector: track a chip, never the container

Same trap as the Chrome-side doc: a flex row's `getBoundingClientRect().top` is insensitive to
content reflowing inside it. Track one specific chip and the abandoned coordinate instead:

```js
const before = target.getBoundingClientRect();
const wasAt = doc.elementFromPoint(before.left + 4, before.top + 4);
// ... trigger the state change ...
const after = target.getBoundingClientRect();
const nowAt = doc.elementFromPoint(before.left + 4, before.top + 4);
const sameFingerDifferentPerson = wasAt.textContent !== nowAt.textContent;
```

Calibrate this against a probe that deliberately removes a chip before trusting a `moved=no` verdict
on the real page — a detector that cannot show `YES` on a broken case is not measuring anything.
Reusable positive-control probe: `scratchpad/webkit-probe/{frame,inner}.html` (not committed; rebuild
from this description if the scratchpad is gone).

## Checking a capability, not its container

`typeof navigator !== 'undefined'` says nothing about `navigator.locks` — that exact mistake shipped
once already, in a Node-vs-browser context. Render each layer separately:

```js
typeof navigator, typeof navigator.locks, typeof navigator.locks?.request,
await navigator.locks.request('probe', async () => 42)  // must resolve to 42, not just "not throw"
```

`navigator.locks` needs a secure context; `http://localhost` (any port) qualifies without HTTPS.

## Traps

- **Serve with `npx serve`, never `python3 -m http.server`, for a charset-less scratch probe page.**
  The site's own `dist/game/*/index.html` carries `<meta charset="UTF-8">`, which the parser honours
  even with no header — this trap does not apply to those pages. It was observed on a bare probe
  page with no charset meta: `http.server` sends no charset header either, Thai renders as mojibake,
  and mojibake glyphs have different advance widths, so any layout number measured on such a page is
  quietly wrong. Confirm Thai renders as Thai in a screenshot before trusting any width measured on
  a probe page.
- **Page-relative readout, screen-point tap — Safari's chrome shifts them.** An in-page readout
  (Technique 1) reports coordinates relative to the page, but the simulator's `tap` primitive takes
  screen points, and Safari's own chrome offsets the page downward by an amount that must be
  measured, not assumed — ~62 device points on iPhone 17 Pro / iOS 26.5. A tap computed straight off
  a page-relative readout landed one row away, on a checkbox instead of the intended button —
  silently wrong, not a failure. Avoid it by either (a) measuring the target directly off the
  screenshot in screen points, no page-to-screen conversion at all, or (b) calibrating the offset
  against a known landmark first. The offset is device- and chrome-state-dependent (rotation,
  keyboard, URL bar collapsed/expanded) — re-measure it each time, never hardcode it.
- A screenshot proves what a human would see; it does not prove a number unless the number is
  rendered into the page.
- `simctl openurl` routes to `com.apple.mobilesafari`; there is no element-ref addressing on this
  path even when a tap tool is present — coordinates are device points, origin top-left.

## Rule

If a check could not be run — no tap tool, no inspector, whatever the gap — say so. Do not infer
a tap's result from a `.click()` substitute without declaring the substitution, and do not infer any
number from a screenshot you did not actually render the number into.
