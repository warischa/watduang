# UI audit, 2026-10-04 — the ui-ux-pro-max rule set, measured on the built site

Owner request 2026-10-04: use the ui-ux-pro-max skill (plugin v2.13.0, installed at project scope)
to improve the site's design and visuals. The owner ruled audit-first: findings with evidence, and
no `src/` change for a finding that touches a canvas value. The owner picks; the canvas changes
first and the code follows (ADR-0033).

Instrument: `ui-audit-probe.mjs`, driven by `scripts/driver.mjs` against `npm run build`. It ran at
320 (mobile emulation) and 1440, on `/`, `/c/party/`, `/c/fortune/`, `/tools/`, `/tool/wheel/` and
`/game/siamsi/`. The rules are the skill's priority 1-6 (`references/quick-reference.md`). The
probe's header says exactly what each number counts. Raw output: `audit-{320,1440}.json` (first
run) and `audit-after-fix-{320,1440}.json` (after the fixes below).

**Calibration.** Before any measurement, the contrast detector had to find the one failure already
known from arithmetic: white on the tools blue, 3.90:1. It found it, on the home page's tool tiles,
at both widths.

**Not covered**, so none of these is a pass: focus-ring visibility, keyboard order, screen-reader
output, real-device rendering, play routes (ADR-0050), and the network (a local server makes LCP
times meaningless).

## Fixed in this batch, commit `c43d91e` — regressions from gh#246, inside the owner's D-palette ruling

| Finding | Before | After |
|---|---|---|
| Secondary text (`--color-muted #6b7280`) on D's cream ground: category kickers, ad labels, the wheel hint | 4.49:1 (4.75 on the old ground) | `#3d3b5c`, canvas D's own secondary text: 9.86:1 |
| Category breadcrumb "หน้าแรก": never received the canvas's global ink link rule, so it rendered in UA blue | 2.79:1 on D's party pink (4.38 on the old one) | ink: 5.35:1 |

Category pages went from 4-8 contrast failures each to 0, at both widths.

## For the owner — canvas D's own values (change the canvas first)

1. **The tools tiles put white text on `#2b7bff`, 3.90:1.** That fails AA for normal-size text: the
   tool descriptions at desktop and the 17px tool names at 320. Option: ink text on the blue, 4.62:1.
2. **The hero lead puts white on `#ff3d7f`, 3.37:1.** At 22px weight 600 (17px at 320) it does not
   count as large text, so it fails. Options: weight 700 at 22px+ makes it large text (3:1 passes on
   desktop only), or ink text (5.35:1).
3. **The h1 highlight is `#ffcc00` on `#ff3d7f`, 2.23:1**, below even the 3:1 large-text floor. In
   practice the 5px ink text-shadow outlines it. Formally it fails, and visually it is the weakest
   pair on the page.
4. **Body text is below 16px on mobile** (the skill's readable-font-size rule). At 320 the home page
   has 21 such elements and the party page 43. These sizes are the canvas's own (13-15px), so a
   change is a canvas change.

## For the owner — visual quality and speed (no design value involved)

5. **The art is upscaled.** The hero art file is 361×320 but renders at 422×375 on desktop, and at
   242px wide on a 320 phone, which needs 484px on a 2x screen. The popular tiles render at 353px
   from sources 308-448px wide. All of it shows soft on retina screens. The fix is 2x renders served
   with `srcset`. It costs bytes, which the page weight box has to re-measure.
6. **The hero art is the home page's LCP element** and carries no `fetchpriority="high"`. A one-
   attribute fix with no visual change.

## Pre-existing, not from this batch

7. **`/game/siamsi/` has CLS 0.2825 at 1440**, which is "poor" (above 0.25). The how-to section
   jumps 534px at about 49ms, when the game mounts above it. At 320 it is 0, because the section
   starts below the fold. No earlier CLS measurement was found in the text files under
   `docs/verification/evidence/`. "Pre-existing" is inferred, because today's commits touch no
   siamsi markup or script. It was not re-measured on the old build.
8. **Small link targets.** The cross-link lists on the wheel and siamsi pages are 21px-tall links
   inside a paragraph. The breadcrumbs are 18px tall. WCAG 2.2's 24px rule exempts targets inline
   in a sentence, which a link list arguably is not. The skill's 44px rule fails either way.
9. **The wheel's disabled hub label** "หมุน" is 2:1. WCAG exempts inactive controls, so this needs
   no action.

## Passes

On every audited page and width: no sideways scroll (`scripts/home-page-probe.mjs` covers the home
page at five widths), no heading-level skips, every `<img>` carries `alt` (decorative art is
`alt=""`), `lang="th"`, CLS at most 0.003 except siamsi, and reduced motion stops all home
decoration (probe, both legs).
