# 320x568: where the primary control actually sits on freeze-tap and wire-snip-panic

Measurement only. Nothing here proposes or applies a layout change, and no row of the fit probe's
overflow map was touched.

**Stamp.** Measured 2026-09-10 on this worktree branch at `capturedAtCommit` `6dbbbb7`, against a
fresh `npm run build` `dist/` served on port **4324**, headless **Chrome 152.0.7977.83** on CDP port
**9555** with its own throwaway user-data dir (`--headless --disable-gpu --no-sandbox` — the flag set
the recorded rows were taken with; both these routes use a 2D canvas only, so the WebGL flag warning
in the browser-verification doc does not apply to them). Viewport by real device-metrics emulation
(`setWidth(320, 568)`), and `innerWidth`/`innerHeight` are re-asserted as 320/568 on **every** read —
a read at any other size is discarded as void rather than reported.

**Screens.** Roster and group seeded with the fit probe's own names, then walked with that probe's
own largest-visible-non-header-button press heuristic, so the screens are the same ones its recorded
rows describe. `freeze-tap` is measured on the **press-1** pass screen (its press-0 screen carries no
primary control at all); `wire-snip-panic` on its **press-0** game screen. Both press indices agree
with the recorded block budget.

Every number below is read off the rendered box with `getBoundingClientRect`, never computed from CSS.

## 1. The recorded "99px and 76px below the fold" are the two buttons' HEIGHTS

The 2026-09-05 escalation says the primary button sits 99px below the fold on `freeze-tap` and 76px
below on `wire-snip-panic`. Measured here, 99 and 76 are exactly the **heights** of those two buttons,
on every load, and neither is any distance to the fold. The block budget in the sibling evidence
directory reports both as heights; the escalation restated them as fold distances.

| route | primary control | height | rect.top | rect.bottom | top past 568 | bottom past 568 | visible px |
|---|---|---|---|---|---|---|---|
| `freeze-tap` (typical, 4/6 loads) | `button#playerReadyBtn` | **99** | 613 | 712 | **45** | **144** | 0 |
| `freeze-tap` (worst, 2/6 loads) | `button#playerReadyBtn` | **99** | 640 | 739 | **72** | **171** | 0 |
| `wire-snip-panic` (all 3 loads) | `button#btn-trigger-scan` | **76** | 578 | 654 | **10** | **86** | 0 |

So the defect the escalation describes is real — on both routes the primary control has **zero
visible pixels** at 320x568 — but the two figures attached to it are not the fold distances. Stated
plainly rather than reconciled: my numbers disagree with the recorded ones and the method was not
adjusted to close the gap.

## 2. The fold and the container edge coincide here, and both containers SCROLL

Worth knowing before a redesign decision: the control is unseen, not unreachable.

| route | overflow container | overflow-y | clientHeight | scrollHeight | overflow | container top + clientHeight |
|---|---|---|---|---|---|---|
| `freeze-tap` | `main#mainContent` | `auto` | 499 | 659 / 686 | 160 / 187 | 69 + 499 = **568** |
| `wire-snip-panic` | `div#screen-game` | `auto` | 393 | 504 | 111 | 175 + 393 = **568** |

The clip/scroll edge lands on the 568 line on both routes, so "past the viewport bottom" and "past
the container edge" are the same distance here — which is not something to assume on another route.
`wire-snip-panic`'s 111px reproduces its recorded row exactly.

## 3. `freeze-tap` across six loads: two states, not a continuum

Six seeded loads, same build, same session. The screen has exactly two readings and both recur:

| loads | container overflow | `div.pass-player-card` | primary rect.top | primary bottom past 568 |
|---|---|---|---|---|
| 1, 3, 4, 6 (4 of 6) | 160px | 411px | 613 | 144 |
| 2, 5 (2 of 6) | **187px** | **438px** | 640 | **171** |

**Worst case is the 187px state** — and it is the recorded map value, so 187px is reproducible here,
just not on the majority of loads. The two states differ by 27px of card height: the round-condition
copy inside the card is longer on the 187px state (visible in the two committed first-paint images).
A redesign has to be checked against the 187px state; a run that lands on 160px twice looks 27px
better than the screen is.

## 4. Largest block on each screen

| route | largest content block | measured | recorded | share of 568 |
|---|---|---|---|---|
| `freeze-tap` | `div.pass-player-card` | 411px typical / **438px worst** | 411px | 72% / **77% worst** |
| `wire-snip-panic` | `div#bomb-chassis` | **240px**, identical on all 3 loads | 240px | 42% |

Both recorded figures reproduce. The one correction is that `freeze-tap`'s 411px is the lucky-load
value of a two-state screen whose worst is 438px.

Context read at the same moment, so a reader is not misled by the bare maximum: on `freeze-tap` the
taller boxes above the card are wrappers, not droppable content — `div.pass-container` at 627/654px
holds all four blocks, `main#mainContent` is the 499px scroller, and `div#shakeRoot` plus
`canvas#particleCanvas` are full-viewport (568px) decorative layers. On `wire-snip-panic` the taller
boxes are the same kind of thing (`canvas#particle-canvas` and `div#flash-overlay`, both 568px
overlays) and `div#screen-game` is the 393px scroller. One extra reading that matters for the
decision: inside the chassis, `div#wires-bay` measures 172.8px and its bottom lands at 578.8 — the
bottom row of wire labels is already 10.8px past the fold, before the button is even considered.

## 5. Calibration, both directions, in the same page load

The instrument reported above is a rect read, so the calibration moves a rect rather than only a
scroll height. On each route the recorded largest block was forced to `min-height: 2000px !important`
and all three reported quantities were re-read, then the override was removed and re-read again:

| route | block height | primary rect.top | container scrollHeight | after revert |
|---|---|---|---|---|
| `freeze-tap` | 411 → 2000 | 613 → 2202 (+1589) | 659 → 2248 | 411 / 613 / 659 — **exact** |
| `wire-snip-panic` | 240 → 2000 | 578 → 2338 (+1760) | 504 → 2264 | 240 / 578 / 504 — **exact** |

Both halves, on every load in the JSON log, with `returned: true` recorded per load. The reading
follows a real DOM change and returns to the baseline when it is undone.

## 6. What is committed, and what is not

- `fold-probe.json` — the full log: all nine loads, every rect, the press labels, the twelve tallest
  boxes per load, and both calibration halves. This is the evidence.
- `fold-probe.mjs`, `fullpage-freeze-tap.mjs` — the two probe scripts, so the run is repeatable.
- **The PNGs in this directory are deliberately untracked.** The repo ignores probe screenshots under
  the evidence tree, and the carve-out beside that rule states that a CDP probe never qualifies
  because it can always emit JSON. They sit here on disk for whoever still has this worktree:
  `*-first-paint.png` is what a player sees at 320x568, `*-scrolled-to-control.png` is the same
  layout with the container scrolled to its own bottom (no style touched), and
  `*-fullpage-clip-released.png` is **instrumented** — taken last, after every number was recorded,
  by releasing `overflow`/`height` on the control's own ancestor chain. On `freeze-tap` the release
  left the primary's `rect.top` at 613, unchanged, so the image shows the control where it really
  sits.
- Reproduce with the two scripts above under `scripts/driver.mjs`, with `CDP_PORT` and `BASE` pointing
  at your own Chrome and your own server; set `SHOT_DIR` to write the images.

## 7. Not measured, and why

- **320x568 only.** 390x844 was out of scope for this run, so nothing here says anything about it.
- **One machine.** These are Mac readings; the fit probe's own map records that the CI runner reads
  Thai-heavy rows differently, and no CI figure is quoted here.
- **The wire-cut targets inside `div#bomb-chassis` were not drilled individually** — they are still
  `div`s with click handlers rather than buttons, so a tag-based control scan does not see them.
- **`freeze-tap`'s two states were not traced to a cause.** Six loads show which content differs (the
  condition copy in the card) but not what selects it.
