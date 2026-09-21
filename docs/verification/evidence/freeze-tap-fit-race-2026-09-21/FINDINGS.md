# freeze-tap's intermittent fit failure: the screen it grades draws its own text at random

Investigated 2026-09-21 against CI run 35577195693 on commit `fdb9367`.

## Verdict

The fit probe's press-1 screen on freeze-tap is `div.pass-container`, the pass-the-device screen. It
renders `cond.prompt`, and the condition is chosen by an **unseeded `Math.random()`** in
`src/play/freeze-tap/main.js` (the `TRIGGER_CONDITIONS` pick). The nine prompts do not all occupy the
same height, so the screen the probe measures is a different height on different runs of the same
commit. **CONFIRMED by measurement** below.

Whether that swing is what crossed the fold on the CI runner is **INFERRED**, not measured -- see
"What this does not establish".

## Measured: a 27px swing from a random draw

Driven at a real emulated 320x568 via `scripts/cdp.mjs` (`CDP_WIDTH=320 CDP_HEIGHT=568`, confirmed
`innerWidth: 320`), roster seeded on-origin, Chrome `--headless --disable-gpu --no-sandbox`. The walk
reached `.pass-container` via `ruleReadyBtn` -- the same press the fit probe makes. Fonts were
settled before reading: `fontsStatus: "loaded"`, `sarabunLoaded: true`. One variable changed between
reads: the prompt text.

| prompt | chars | prompt height | pass-screen height |
|---|---|---|---|
| ...สีแดง (RED) | 39 | 54px | 456px |
| ...สีเขียว (GREEN) | 43 | 54px | 456px |
| ...สีน้ำเงิน (BLUE) | 44 | 54px | 456px |
| ...สีเหลือง (YELLOW) | 45 | 54px | 456px |
| ...กด (TAP) | 35 | 54px | 456px |
| ...เดี๋ยวนี้ (NOW) | 42 | 54px | 456px |
| ...ลุย (GO) | 35 | 54px | 456px |
| **...รูปดาว ★** | 38 | **81px** | **483px** |
| **...วงกลม ●** | 37 | **81px** | **483px** |

**456 vs 483 -- a 27px swing, decided by a coin the page flips itself.** Note it is not driven by
character count: the two tallest prompts are shorter than four of the seven short ones. They wrap to
three lines where the others wrap to two.

Element count is identical across all nine, which is why both CI attempts reported `ink 11` while
disagreeing about the height.

## What this explains

- **Identical screen sets, different verdicts.** Both attempts of run 35577195693 graded the same
  three screens with the same ink counts (9 / 11 / 6). Only press 1's overflow moved.
- **Only the 320x568 row ever differs.** It is the narrowest viewport and the first in `VIEWPORTS`,
  so it is the only one close enough to the fold for a 27px swing to matter. 390x844 and 1440x900
  were byte-identical across both attempts.
- **Why a re-run "fixed" it.** The re-run drew a short prompt. Nothing was repaired.

## Two hypotheses this refutes, both mine

- **"The walk grades different screens."** Refuted. The summary field `worst at press N, M ink` names
  the worst-scoring screen, not the set visited: red had press 1 worst (ink 11), green had press 0
  worst (ink 9), and both visited all three. The adaptive-press-walk mechanism is not involved.
- **"A font-swap race."** Refuted as the primary cause. The probe does lack any `document.fonts.ready`
  wait (only `sleep(1200)` and `sleep(700)`), and Sarabun is self-hosted with `font-display: swap` --
  both true. But running the real fit probe twice with `ROUTES_ONLY=freeze-tap`, once against stock
  `dist/` and once against a copy with `dist/fonts` removed (control proven by HTTP 200 vs 404),
  reported **0px overflow on every row in both legs**. The face changes layout slightly (press 2's ink
  went 6 to 7) but does not cross the fold on this machine.

## Why the greens cannot be trusted

A green means the page drew a short prompt, not that the screen fits. The gate's verdict is currently
decided by the route's own RNG. Roughly 2 of 9 draws produce the tall screen, so a green is the
likely outcome either way -- which is what let this sit until now.

## What this does not establish

- **That the 27px swing is what produced CI's 12px.** Not measured on the runner. Locally the tall
  draw reaches 483px against a 568px viewport and overflows by nothing.
  `docs/agents/ci-gate-calibration.md` records CI measuring non-zero rows 4-28% above this Mac, which
  would put the tall draw over the fold -- but that note predates gh#202 self-hosting the Thai face
  and its stated reason ("the workflow installs no font") is now stale. The amplification is real and
  dated; its cause is not re-established here.
- **Whether the tall screen genuinely overflows on a real 320px phone.** That is the question gh#182
  ("no play screen scrolls at 320px or 390px") exists to answer, and it is an owner call.
- **Sibling exposure.** Only freeze-tap carries the pick-from-a-content-array shape among the four
  one-container routes; `how-close-is-near`, `power-meter` and `pinocchio-luck` use `Math.random` for
  particles and physics, not for choosing text. That grep rules out this shape, not every way a route
  could vary its own text height.

## What was deliberately not done

- **No `FITS_ROWS` pin moved.** Forbidden by the probe's failure message and by CLAUDE.md.
- **No `OVERFLOW_TOLERANCE_PX` widened.** `ci-gate-calibration.md` forbids it by name.
- **No fix applied.** The right one depends on a decision this investigation cannot make: seeding the
  page's RNG in the probe (the gh#204 precedent, which pins whichever draw the seed yields and can
  therefore pin the fitting one) versus measuring the worst draw versus changing the screen so its
  height does not depend on the draw. The first is the probe's problem, the third is the route's, and
  only the owner can say whether the tall screen is acceptable at 320px.
