# gh#281 follow-up — freeze-tap ready button at 375x667 and 360x640

Question: variant A's layout is bound to `@media (max-width: 359px)` (`src/play/freeze-tap/overrides.css`). The owner approved it at 320 only. Is `#playerReadyBtn` fully on screen at 375x667, which falls outside that bound? Measured 2026-10-20 on the `dist/` built from 8b4665a. No src commit is newer than that build.

Instrument: `measure-ready.mjs` is `../gh281-2026-10-20/measure-ready.mjs` with the viewport read from `VP_W`/`VP_H`.

| Viewport | n (forced draws 0-8) | Button visible / total, min | Centre hit |
|---|---|---|---|
| 320x568 (positive control) | 9 | 60/60 | 9/9 |
| 375x667 | 9 | 60/60 | 9/9 |
| 360x640 | 9 | 60/60 | 9/9 |

- The positive control reproduces `../gh281-2026-10-20/ready-after.json` exactly: top 476.9 and bottom 536.9 on every draw.
- Every row reads the requested `innerWidth`/`innerHeight`.
- "Visible" is the part of the button between the 56px band and the viewport bottom, recomputed from the raw rows.

Verdict: no draw falls short of 60/60 at 375 or 360. Variant A's bound does not need widening for these viewports.

Not covered:
- The button's geometry is identical on every draw at every viewport, and was in the original 320 data. Nobody has tested whether the draw changes this screen at all.
- Headless Chrome only; no real device.
