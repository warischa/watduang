# 320x568: where one-bomb's primary control actually sits

Measurement only, for gh#182's `one-bomb 320x568` row. Nothing here proposes or applies a layout
change, and no row of the fit probe's overflow map was touched.

**Stamp.** Measured 2026-09-15 on branch `main` at commit `d1216c76e9f0ef0c73d1726aada1ce72ec732cc4`,
against a fresh `npm run build` `dist/` served on port **4390**, headless **Chrome 153.0.8010.36** on
CDP port **9590** with its own throwaway `--user-data-dir`. Flags: `--headless=new --use-gl=angle
--use-angle=swiftshader --enable-unsafe-swiftshader --no-sandbox --remote-debugging-port=9590` — the
WebGL-safe set from `docs/agents/browser-verification.md` (its "Do" section warns `one-bomb` by name:
`--disable-gpu` drops `#gameCanvas`'s context on this route and can leave the probe measuring a
fallback board nobody plays on). Confirmed before trusting any number, via a separate `cdp.mjs` tab
opened against the SAME Chrome process (same port 9590, same flags — not inside the measured
`driver.mjs` load itself): `c.getContext('webgl')` on `#gameCanvas` returns a live context
(`{hasCanvas:true, webgl2:false, webgl:true, experimental-webgl:true}`) — `webgl2` is false, `webgl`
is live, so this Chrome process runs the live-3D code path, not the ADR-0051 fallback, under this
flag set. Viewport by real device-metrics emulation
(`setWidth(320, 568)`); `innerWidth`/`innerHeight` re-asserted as 320/568 on every read (confirmed
320x568 on every load below; no void reads occurred).

## Positive control — REPRODUCED, instrument trusted

`freeze-tap` is owner-reserved for row/screen changes (2026-09-10, reaffirmed 2026-09-11) — nothing
about that row, its screens, or `src/` was touched here. It was measured READ-ONLY, purely as this
run's calibration target, because it is the one route in the brief's named reference doc whose figure
is still current (see the staleness note on `wire-snip-panic` below).

`src/play/freeze-tap/` has had no markup/CSS/`main.ts` change since the `182-320-fold` capture
(`git log 6dbbbb7..HEAD -- src/play/freeze-tap/` touches only a test file), so its recorded figures
in `docs/verification/evidence/182-320-fold/below-fold-primary-controls.md` are still live. My copy
of the probe reproduced BOTH of that route's recorded states exactly, over 6 loads:

| loads | `button#playerReadyBtn` rect.top | rect.bottom | height | visible px | recorded state |
|---|---|---|---|---|---|
| 1–5 (5/6) | 613 | 712 | 99 | 0 | matches the "typical" row exactly |
| 6 (1/6) | 640 | 739 | 99 | 0 | matches the "worst" row exactly |

Exact match on both documented states. The probe is trusted for the measurement below.

**Note on `wire-snip-panic`, also run this session but NOT the positive control:** its
`182-320-fold` row (rect.top 578, rect.bottom 654) is now stale — commit `8db9bd2` (2026-09-13,
after that capture) moved this route's primary control to fix the gh#182 violation. My run measured
rect.top 540 / rect.bottom 616 / 28px visible, exactly matching the figures `8db9bd2`'s own commit
message cites for its fix. This is a second, independent confirmation the instrument reads real rects
correctly — just against a different (newer) source of truth than the one named in the task, since
the referenced doc predates the fix.

## one-bomb — new measurement, n=3

Seeded with the fit probe's own 3-name roster, `div#menuOverlay.menuOverlay` (the container the fit
probe's recorded row names) reached on **press 0** (no click needed — matching that row's "worst
screen (press 0 in the probe run)"). Primary control confirmed against source, not guessed:
`#startPlayBtn` is the button `src/play/one-bomb/overrides.css` itself names in comment as "the
button that starts the game" (`main.ts` wires it to `startMatch`).

| route | primary control | height | rect.top | rect.bottom | top past 568 | bottom past 568 | visible px |
|---|---|---|---|---|---|---|---|
| `one-bomb` (n=3, identical every load) | `button#startPlayBtn.btnBase.primaryBtn` | 54 | 478.11 | 532.11 | **−89.89** | **−35.89** | **54** (fully visible) |

Both "past 568" figures are negative — the whole control sits above the fold, its bottom edge 35.89px
clear of the line. All three loads identical: top 478.11–478.11, bottom 532.11–532.11, height
53.9997–54.0000 (sub-pixel render noise only).

**A second, independent reproduction of the fit probe's own recorded row.** The container's own
overflow — `scrollHeight 665 − clientHeight 568 = 97px`, on this same 3-name seed — matches the fit
probe's recorded `div#menuOverlay.menuOverlay` row exactly (`97px on the worst screen … 97px to
scroll … 0px clipped`). So this run reproduces that row's own number independently of the freeze-tap
positive control above, on the identical container the row names.

**What this means, stated plainly, not reconciled with the fit probe's map:** the fit probe's
`gh#182 open: 97px … 97px to scroll on div#menuOverlay.menuOverlay, 0px clipped` row is true and
unaffected by this finding — the container really does need 97px of scroll to reach its full content
(`clientHeight 568` vs `scrollHeight 665`, reproduced above). What sets that 97px is measured directly
below, not inferred. `#startPlayBtn` itself — the button that starts the game — sits entirely above
the fold with 54 full px visible. Calibration (forcing `#ob-players` to `min-height: 2000px` and
reverting) moved `#startPlayBtn`'s rect.top by +1852px and returned to the exact baseline on all 3
loads, confirming the read tracks a real, live rect.

## Attribution — which elements consume the 97px (follow-up, `overflow-attribution-probe.mjs`)

**Supersedes** the earlier INFERRED sentence in this README ("that 97px belongs to the two secondary
buttons below the primary, read off `div.menuBtnCol`'s own rect … rather than off
`#howToPlayBtn`/`#menuSettingsBtn` individually") — this is now a direct per-element reading, not an
inference from a wrapper's rect, and **it confirms the earlier inference** rather than contradicting
it.

Method: on the same seeded (3-name) one-bomb load, walked every visible descendant of `#menuOverlay`
and reported every element whose own `rect.bottom > 568`, via `getBoundingClientRect` only. Same
`innerWidth===320 && innerHeight===568` discipline (no void reads occurred), same n=3 loads. Fresh
build, fresh ports (HTTP 4391, CDP 9591), same Chrome 153.0.8010.36 / same WebGL-safe flag set as
above, at commit `d1216c76e9f0ef0c73d1726aada1ce72ec732cc4` (unchanged from the first run in this
directory).

Identical on all 3 loads — nothing varies across loads:

| selector | rect.top | rect.bottom | height | px past 568 | kind |
|---|---|---|---|---|---|
| `div.menuBox` (whole card, wrapper) | 15.5–15.6 | **640.1** (max bottom — sets scrollHeight) | 624.6 | 72.1 | wrapper |
| `div.menuBtnCol` (wrapper, all 3 menu buttons) | 478.1 | 640.1 | 162.0 | 72.1 | wrapper |
| `button#menuSettingsBtn.secondaryBtn` | 596.1 | 640.1 | 44 | **72.1** | leaf, SECONDARY |
| `button#howToPlayBtn.secondaryBtn` | 542.1 | 586.1 | 44 | **18.1** | leaf, SECONDARY |

`button#startPlayBtn.primaryBtn` does **not** appear in this list on any load — its own measured
rect.bottom (532.11, from the section above) is under 568, so 0px past the fold, consistent with the
fully-visible reading already reported.

Residual not attributed to any single element: `div.menuBox`'s own `bottom` (640.1) plus
`#menuOverlay`'s computed `padding-bottom` (20px, read via `getComputedStyle`, identical all 3 loads)
sums to ~660.1, leaving ~4.9px of the 665px `scrollHeight` unaccounted by any selector — small enough
to be a CSS gap/border rounding, not a hidden element, but named here rather than silently absorbed.

**Measured conclusion, stated plainly:** every element whose `rect.bottom` exceeds 568 on this screen
is a **leaf secondary button** (`#howToPlayBtn`, `#menuSettingsBtn`, both `class="secondaryBtn"`) or a
wrapper around them (`div.menuBtnCol`, `div.menuBox`). None carries the primary/start control.
`#startPlayBtn` (`class="primaryBtn"`, wired to `startMatch`) is not ambiguous by selector — it is the
one button in `div.menuBtnCol` whose own rect never crosses 568. Not ambiguous: this is a reading, not
a judgment call.

## What is committed

- `fold-probe.mjs` — copied verbatim from `docs/verification/evidence/182-320-fold/fold-probe.mjs`;
  the only edit is the `ROUTES` constant (added `one-bomb`, kept `freeze-tap` as positive control and
  `wire-snip-panic` for the stale-doc cross-check noted above).
- `fold-probe.json` — full raw log: all 12 loads (6 freeze-tap, 3 wire-snip-panic, 3 one-bomb), every
  rect, press labels, tallest boxes, both calibration halves.
- `overflow-attribution-probe.mjs` — the follow-up per-element attribution probe, reusing the same
  `driver.mjs` session helpers and seed as `fold-probe.mjs`.
- `overflow-attribution.json` — its raw log: 3 loads, every element past the fold per load, the
  max-bottom element, and the container's padding.
- No PNGs are committed — neither run set `SHOT_DIR`.

Reproduce: `npm run build`, serve `dist/` on a free port, launch headless Chrome on a free CDP port
with the WebGL-safe flags above and its own `--user-data-dir`, then
`BASE=http://localhost:<port> CDP_PORT=<port> node scripts/driver.mjs <probe>.mjs`. Tear down by the
pids you started.

## Not measured, and why

- **320x568 only** — 390x844 and desktop were out of scope for this row.
- **One machine** — a Mac reading; no CI figure is quoted here.
- **The ~4.9px residual noted above** was not traced to a specific CSS rule (gap vs. border vs.
  rounding) — named as unattributed rather than guessed at.
