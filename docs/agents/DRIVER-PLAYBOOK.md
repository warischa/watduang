# Driver playbook — recipes proven in this repo, not reinvented per session

Companion to `docs/agents/browser-verification.md` (read that first — it governs). This file is the
running log of concrete invocations that worked, so the next agent copies rather than rediscovers
them. Extend it with every recipe you prove; do not remove an entry because it looks superseded —
add a dated correction instead.

## Serving `dist/` without a build

Never `npm run build` if any sibling session holds uncommitted `src/**` edits — it bakes their
half-written work in. Confirm the routes you need exist first:

```bash
ls dist/game/<route>/play/index.html
```

If missing, stop and report rather than building. Otherwise serve the existing `dist/` on the port
you were assigned:

```bash
npx serve dist/ -l <PORT> &
```

`npx serve` 301-redirects a bare `.../play/index.html` request to `.../play` — use `curl -sL` or hit
`.../play/` directly, not the bare redirect target, when smoke-testing the server.

## Headless Chrome — pick flags by what the route renders, not by habit

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --no-sandbox --remote-debugging-port=<PORT> \
  --user-data-dir=/tmp/cdp-prof-<tag> &
```

`--disable-gpu` is only safe on a route with **no** WebGL/3D surface. Before using it, grep the
route's own canvas module header — `timebomb`'s `bomb-canvas.ts` states outright "CANVAS 2D, NEVER
WebGL" (owner direction). Don't infer this from the game's *look* (a 2D route can still fake a 3D
look); read the source comment or the `browser-verification.md` warning and use
`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` instead when unsure.

Tear down by the exact pid you started (`kill <pid>`), never `pkill -f` — a shared-prefix match has
killed a sibling session's server on this machine before.

## `scripts/driver.mjs` — the one-tab, cross-navigation CDP driver

Usage: `node scripts/driver.mjs <script.mjs>`, with `CDP_PORT` and `BASE` as env vars the script
reads itself (they are not driver.mjs flags — the script you write decides what env it honours).
The script default-exports `async (session) => {...}`; return value prints as one JSON line.

Gotchas that cost a run each, confirmed this session:
- `session.wipe()` is `async` — `await` it, or the clear races the next `nav()`.
- `session.setWidth(w, h)` sets `mobile: true` in `Emulation.setDeviceMetricsOverride`; not varied
  this session (no `mobile: false` run to compare against), but a 1440x900 read taken this way
  matched prior evidence recorded without it (`docs/verification/evidence/181/
  frame-screen-readings.json`) on every field checked. Re-assert `innerWidth`/`innerHeight` in the
  page after every `setWidth` regardless — never trust the call by itself.
- `session.evaluate(body)` wraps `body` in an async IIFE — a bare expression with no `return` gives
  `{value: null}`, indistinguishable from a real null read.

## Reaching a game's post-setup screen without touching its reset control

Several play routes (`dice-loser`, `timebomb`, and by the same pattern likely others) put a
"reset names" button ahead of "begin" in DOM/visual order. A generic "click the largest visible
button" heuristic hits reset first and opens its confirm `<dialog>` over the setup screen — this is
exactly how gh#181's `dice-loser`/`timebomb` desktop readings got taken over a dialog. **Probe by the
route's own named control, never by position or size:**

```js
const b = document.querySelector('#dl-begin');   // or '#tb-begin', etc — read markup.html per route
b.click();
```

**One click may only reach an interstitial, not the real board.** `timebomb`'s `#tb-begin` reaches a
pass-the-device screen holding `#tb-start`, disabled for `ARM_DELAY_MS` (400ms — a shared reveal-arm
window from `src/games/_arm-gate.ts`, the same one every route's `arm-reveal-paths.test.mjs` covers).
The actual board (`.tb-canvas`) stays `hidden` until `#tb-start` is pressed. Wait past the arm window
before clicking the next control — 700ms was enough — and check `button.disabled` first rather than
assuming the click landed:

```js
await new Promise((r) => setTimeout(r, 700));
const b2 = document.querySelector('#tb-start');
if (b2 && !b2.disabled) b2.click();
```

## Confirming a screen is genuinely clean — absence of a dialog selector is not proof

A `null` for `document.querySelector('#some-dialog')` reads identically whether the dialog was
never mounted or genuinely closed. Confirm on the real DOM node instead, and confirm the screen you
expect is actually showing, not just that the modal is gone:

```js
const dialog = document.querySelector('#route-reset-dialog');
const screen = document.querySelector('#route-play-screen');
const visible = (e) => {
  if (!e) return false;
  const r = e.getBoundingClientRect();
  const cs = getComputedStyle(e);
  return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
};
return {
  dialogOpen: dialog ? dialog.open : null,        // native <dialog>.open — a real boolean, not a guess
  dialogPresentInDOM: !!dialog,                    // proves the selector isn't just missing
  allDialogIds: [...document.querySelectorAll('dialog')].map((d) => d.id || '(no id)'),
  screenVisible: visible(screen),
  screenHidden: screen ? screen.hasAttribute('hidden') : null,
};
```

All fields together are the check — `dialogOpen === false` alone does not prove the *intended* screen
is on top. And "checked X, found it closed" is only true for an X you confirmed EXISTS:
`document.querySelector('#other-dialog-id')` returning `null` because the element was never mounted
reads identically to one that mounted and is closed — `allDialogIds` (every `<dialog>` actually in the
document) is what tells the two apart. Don't write "checked and found closed" for a selector you only
probed with `.open` on a possibly-absent node.

## Seeding roster-bridge.ts to skip a whole setup wizard

Every play route with a `roster-bridge.ts` file self-runs on `DOMContentLoaded` and drives that
route's OWN setup controls (count steppers, name fields, confirm button) if it finds >=2 names in
`localStorage['watduang:group']` (`src/shell/roster.ts` owns both keys — `watduang:roster` and
`watduang:group`). Seed both, on-origin, before the load that should land past setup:

```js
localStorage.setItem('watduang:roster', JSON.stringify(['NAME1','NAME2','NAME3']));
localStorage.setItem('watduang:group', JSON.stringify(['NAME1','NAME2','NAME3']));
```

Then `nav()` again (the bridge runs on the NEXT `DOMContentLoaded`, not on a page already loaded).
**Read the route's own `roster-bridge.ts` before assuming it drives all the way to the round** — some
stop deliberately short by design, not by bug: `how-close-is-near`'s stops at the lose-condition screen
("there is no right default to pick on their behalf... it never auto-starts the match" — its own
comment), leaving one more real click for the walk to make. Grep for the route's own `START` constant
in its `roster-bridge.ts` to find exactly where it stops.

## WebGL routes need swiftshader, not `--disable-gpu`, even for a 320px/fold probe

Not just a desktop-viewport concern: `pinocchio-luck` opens a real `canvas.getContext('webgl', ...)`
and swaps to a `.no-webgl` fallback with none — grep the route's own canvas code for `getContext` before
assuming `--disable-gpu` is safe, the same check the gh#181 clean-screen milestone used for `timebomb`
but in the opposite direction. Use `--headless=new --use-gl=angle --use-angle=swiftshader
--enable-unsafe-swiftshader`, then assert `!element.classList.contains('no-webgl')` (or whatever the
route's own fallback flag is) in the page before trusting any layout reading from it — an absent
fallback notice is not proof by itself.

## macOS has no `timeout`; a multi-route n=6 CDP run is a `run_in_background` job from the start

`timeout 180 node ...` fails with `command not found` on this machine's shell — don't reach for it.
Estimate the run's wall-clock BEFORE launching (routes x loads x steps x ~1s settle each), and if it's
close to or over ~2 minutes, launch with `run_in_background: true` from the very first attempt. A
foreground call that times out gets auto-backgrounded, but if you then re-invoke the SAME command onto
the SAME `>` output path before confirming the first one is actually dead, both processes can share one
Chrome instance and one output file — wasteful, and if both are still writing when you inspect the
file, a stale read mid-write looks like "only ~3 readings" for routes that are actually fully measured.
Check `ps aux | grep driver.mjs` (not the tool's own task-completion notification, which can arrive
late) before deciding a run is stuck, and validate the file with `node -e 'require(path)'` plus an
explicit load-count/`ok:true` check before writing any prose that says how many readings exist.

## Per-milestone verify commands proven this session

**gh#181 clean-screen desktop readings for `dice-loser` / `timebomb`:**

```bash
CDP_PORT=9333 BASE=http://localhost:4173 LOADS=6 \
  node scripts/driver.mjs docs/verification/evidence/181-clean-screen/clean-screen-probe.mjs
```

Evidence and full method: `docs/verification/evidence/181-clean-screen/README.md`.

**gh#182 320x568 fold position for `pinocchio-luck` / `short-stick` / `how-close-is-near` /
`zero-trigger`:**

```bash
CDP_PORT=9333 BASE=http://localhost:4173 LOADS=6 \
  node scripts/driver.mjs docs/verification/evidence/182-320-fold-4routes/fold-probe-4routes.mjs \
  > docs/verification/evidence/182-320-fold-4routes/fold-probe-4routes.json
```

Evidence and full method: `docs/verification/evidence/182-320-fold-4routes/README.md`. Run this one
`run_in_background: true` — it took longer than 120s in practice.
