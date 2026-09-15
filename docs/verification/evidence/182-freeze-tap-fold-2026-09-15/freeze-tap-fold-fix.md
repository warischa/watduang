# freeze-tap 320x568 fold fix — evidence, 2026-09-15

Measured against a real `npm run build` `dist/` served on port 4324, headless Chrome (`--headless
--disable-gpu --no-sandbox`) with CDP on port 9555, `scripts/driver.mjs`. `innerWidth`/`innerHeight`
re-asserted as 320/568 on every read.

## 1. Reproduced the recorded defect before any edit

`before-fold-probe.json` / `before-summary.json`: 6 loads of `docs/verification/evidence/182-320-fold/fold-probe.mjs`
against the unmodified tree. `button#playerReadyBtn` on the press-1 pass screen: 0 visible px on
every load, both card states present (5/6 typical `blockH:411, top:613, bottom:712`; 1/6 worst
`blockH:438, top:640, bottom:739`) — matches the recorded map (`docs/verification/evidence/182-320-fold/below-fold-primary-controls.md`).

## 2. Fix: src/play/freeze-tap/overrides.css

New block scoped to `@media (max-width: 639px)` (the project's own phone breakpoint). Reclaims
padding/margin/gap already spent around the pass screen's own content (`.pass-container`,
`.pass-player-card`, `.pass-condition-box`, `.player-name-huge`, the badge, `main`'s own padding when
the pass screen is mounted, via `:has()`), and restores `#playerReadyBtn`'s padding/font-size (via
`!important`, needed only there because `main.js` writes them as an inline style) to the same base
`.btn-primary` values this route's other primary buttons already render unmodified. No text or
control removed, no font below the route's own floor.

## 3. After — both states, n=12

`after-fold-probe.json` / `after-summary.json`: 12 loads. Both card states recur (8/12 `blockH:322`,
4/12 `blockH:349` — the two-state split this route always had). Every load: `playerReadyBtn`
`visiblePxInViewport: 60` (the full button height — fully clear of the fold) and
`container.scrollHeight - container.clientHeight === 0` (the pass screen's own overflow is fully
closed, not merely the button's fold position).

## 4. 44px floor and no viewport regression

`btn-size-390-1440-after-fix.json`:

| viewport | height | font-size | padding |
|---|---|---|---|
| 320x568 | 60px | 18.4px | 16px 24px |
| 390x844 | 60px | 18.4px | 16px 24px |
| 1440x900 | 70px | 21.6px | 20px |

1440x900's reading is byte-for-byte the PRE-FIX inline value (`font-size: 1.35rem` = 21.6px,
`padding: 20px`) — the `max-width: 639px` scope keeps this fix off the desktop button entirely, so
`gh#183`'s documented gap (playerReadyBtn not reached by the desktop `.btn-primary` raise) is
unchanged. 390x844 is tightened to the same values as 320, still >=44px.

`ROUTES_ONLY=freeze-tap` run of `scripts/play-screen-fit-probe.mjs` against the fixed build: `390x844`
and `1440x900` both still read `scrolls no 0px clipped 0px sideways 0px` — no regression, both remain
in `FITS_ROWS`.

## 5. NOT closed — a second, pre-existing violation on the same route

`ROUTES_ONLY=freeze-tap` on the fixed build reported `320x568 scrolls YES 92px ... worst at press 0`
— a DIFFERENT screen (rule-reveal, `button#ruleReadyBtn`) is now the route's worst, because it was
already overflowing before this change and was simply masked by the pass screen's larger 187px.

**A/B against the unmodified overrides.css** (`git stash` / `git stash pop`, same build otherwise)
confirms this is pre-existing, not introduced by this fix: `rule-reveal-after-fix.json` records
`main#mainContent` `scrollHeight:591` vs `clientHeight:499` (92px overflow) and `#ruleReadyBtn`
`visiblePx:0` — and the identical numbers were read on the STASHED (pre-fix) build before this change
was applied.

The evidence doc this brief cited (`docs/verification/evidence/182-320-fold/below-fold-primary-controls.md`)
states the press-0 screen "carries no primary control at all" — true only for `#playerReadyBtn`,
which is the one selector `fold-probe.mjs` looks for; the rule-reveal screen has its own primary
control (`#ruleReadyBtn`) that the same probe never checked. So the brief's premise that this was
"the last violation of the owner's general rule" on this route does not hold: box 1's row referred to
the pass screen only, and the rule-reveal screen was never separately assessed against the fold rule.

**Not fixed here** — different screen, different content, and the brief scoped this fix to
`playerReadyBtn`. `scripts/play-screen-fit-probe.mjs`'s `freeze-tap 320x568` row is updated to the
new, real number (`92px on press 0`, not moved to `FITS_ROWS`) rather than left pointing at a number
that no longer describes what actually overflows.

## What was NOT measured

- Only this route, at 320x568/390x844/1440x900. No other route was touched.
- The rule-reveal screen's own fix (if any) is unscoped — no CSS was written for it, and cutting its
  content, if that is what closing it requires, is an owner decision per the brief's own constraint.
