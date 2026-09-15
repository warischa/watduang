# freeze-tap rule-reveal (press 0) fold fix — evidence, 2026-09-15

Measured against a real `npm run build` `dist/` served on port 4321, headless Chrome (`--headless
--disable-gpu --no-sandbox`) with CDP on port 9222, `scripts/driver.mjs`. `innerWidth`/`innerHeight`
re-asserted as 320/568 on every read.

## 1. Reproduced the recorded defect before any edit

`rule-reveal-probe.mjs`, 6 loads against the unmodified tree (`before-rule-reveal.json`):
`main#mainContent` `scrollHeight:591` vs `clientHeight:499` (92px overflow), `button#ruleReadyBtn`
`buttonTop:587.4375`, `buttonBottom:644.4375`, `buttonHeight:57`, `visiblePx:0` — byte-identical on
all 6 loads and matching the recorded baseline
(`docs/verification/evidence/182-freeze-tap-fold-2026-09-15/rule-reveal-after-fix.json`).

## 2. Fix: src/play/freeze-tap/overrides.css

New `@media (max-width: 639px)` block appended after the existing gh#182 pass-screen block, scoped
to `.rule-reveal-container` and its own children (`.rule-banner`, `.rule-target-preview`,
`.rule-instruction`) plus a `.rule-reveal-container .glass-card` / `.rule-reveal-container .badge`
descendant selector so the shared `.glass-card`/`.badge` classes used by other screens are untouched.
Reclaims padding/margin/gap only (main padding-block, container gap, banner padding, target-preview
margin, instruction margin-top, glass-card padding) — no text, image or control removed, no font
size changed. `#ruleReadyBtn` needed no `!important`: unlike `playerReadyBtn`, main.js writes no
inline style on it, so it already renders from the shared `.btn-primary` rule.

Also updated the pass-screen block's own "NOT CLOSED BY THIS BLOCK" comment (now closed by the new
block) and `scripts/play-screen-fit-probe.mjs`: moved `freeze-tap 320x568` from `KNOWN_OVERFLOW` to
`FITS_ROWS`.

## 3. After — rule-reveal screen, n=6

`after-rule-reveal.json`: `main#mainContent` `overflow: 0` on all 6 loads, `#ruleReadyBtn`
`visiblePx: 57` (full button height, clears the 44px floor) on all 6 loads, `buttonTop: 488.22`.

## 4. Pass screen unregressed, n=12, both card states

`pass-screen-unregressed-n12.json`, same `docs/verification/evidence/182-320-fold/fold-probe.mjs`
instrument used for the original fix: 12 loads, both recorded card states recur (8/12 `blockH:322`,
4/12 `blockH:349`). Every load: `#playerReadyBtn` `visiblePxInViewport: 60`,
`container.scrollHeight - container.clientHeight === 0`.

## 5. No regression at 390x844 / 1440x900

`ROUTES_ONLY=freeze-tap` run of `scripts/play-screen-fit-probe.mjs` against the fixed build, 3
consecutive runs, all identical:

```
freeze-tap         320x568   scrolls no      0px  clipped     0px  sideways     0px  width-fill   100%
freeze-tap         390x844   scrolls no      0px  clipped     0px  sideways     0px  width-fill   100%  [pinned fits]
freeze-tap         1440x900  scrolls no      0px  clipped     0px  sideways     0px  width-fill   100%  [pinned fits]
```

The fix's `max-width: 639px` scope also reaches 390x844 (already `[pinned fits]` before and after);
1440x900 is untouched by the media query and reads the same as before.

## 6. Full-suite live fit probe (all 14 play routes, not just freeze-tap)

`full-fit-probe.log`: no other route's row changed from its previously recorded number — every row
outside `freeze-tap` matches its pre-existing `KNOWN_OVERFLOW`/`FITS_ROWS` classification. `freeze-tap`
now reads `scrolls no 0px` at all three viewports, `[pinned fits]` at all three.

## 7. Toolchain

`npm run build`: 25 pages built, no errors. `npx astro check`: 0 errors, 0 warnings, 49 pre-existing
hints (none introduced by this change). `node --test scripts/play-screen-fit-probe.test.mjs`: 15/15
pass.

## What was NOT measured

Only freeze-tap's rule-reveal and pass screens, at 320x568/390x844/1440x900. No other route was
touched or re-measured beyond the full-suite fit probe's own walk.
