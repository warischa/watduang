# gh#181 box 7 — disclosures

Each entry below was a wrong or missing claim in an earlier pass on the 1440x900 readings and
per-route verdicts recorded in [README.md](./README.md). Moved out of that file to stay under the
doc budget.

**`zero-trigger`'s frame reads 1408, not 1440, and that is real geometry.** Its `body` sets
`padding-left` and `padding-right` to `max(16px, env(safe-area-inset-*))` at top level with no
enclosing media query, and its `overrides.css` never touches `body`, so the value is never zeroed for
desktop — unlike `cannon-flag`, which resets padding to 0. 1440 − 32 = 1408. A first reading was taken
with the result modal open and was suspected to be `.modal-backdrop`'s content box; re-measured with
`#modal-result` at `display: none` and the backdrop's rect at 0, the root still reads 1408. **The
suspicion was wrong** and is recorded so it is not re-raised.

**`zero-trigger` departs from the standard's rule-2 template, and the verdict names why that is
allowed.** `#screen-game.active` uses
`grid-template-columns: minmax(0, var(--zt-board-max-inline)) var(--zt-rail-inline)` with
`justify-content: center`, not the standard's `minmax(0, 1fr)`. The declared tokens match their
values, but a token match is a consistency check, not a rule. With `--zt-desktop-gap` at 28px the grid
spans 320 + 28 + 380 = **728px**, centred in 1408, leaving about **340px** each side.

The basis for the verdict is **rule 3**, which the 2026-09-06 delegation is the ruling that assigns to
an agent: the layout is uniform, centred and consistent across the screen, with no non-uniform
stretch. Rule 2 is departed from deliberately. That is not new on this ticket — the 2026-09-06 table
already recorded `timebomb` as "Rule 2 declined as a layout choice, not a sizing one" and `short-stick`
as "Rules 1 and 2 unmet and it still reads as designed". This row follows that precedent rather than
inventing an allowance, and the departure is disclosed rather than absorbed, because the owner's box-8
look is what decides whether it reads as designed.

**`zero-trigger`'s result modal: the row does not wrap, the label does.** `#btn-next-round` measures
179.5x126.1px and `#btn-result-menu` 165.4x126.1px, identical top and bottom, so the pair sits on one
row at 1440 — the handoff's wrap hypothesis is measured **false for the row**. But `#btn-next-round`'s
Thai label runs **three lines** inside it, beside a one-line label in its neighbour. Instrument note:
`span.getClientRects().length` read 1 for that label; a `Range` over the trailing text node read 3.
The rect count is the wrong instrument for a line count.

**`pinocchio-luck` needs software WebGL to render truthfully.** Default headless Chrome has no WebGL,
and the first capture was the fallback: a notice reading
`อุปกรณ์นี้ไม่รองรับ WebGL — เกมยังเล่นได้ด้วยภาพหุ่นแบบเรียบง่าย` over a flat puppet, overlapping
`#panel`. Recaptured with `--use-gl=swiftshader --enable-unsafe-swiftshader --use-angle=swiftshader`,
confirmed in-page (`webgl2` and `webgl1` both present, the route's own canvas holding a live context
with a 780x468 backing store), the real 3D render appears and the notice's overlap of `#panel`
disappears with it. **So that overlap is a fallback-only artifact, not a layout defect** — and any
future capture of this route without those flags judges a render players never see.

**Re-confirmed on the 2026-09-08 driven pass, with the fallback-notice check corrected.** The same
`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` recipe was used; a first version
of this pass's own check read the fallback notice by `document.body.textContent.includes(...)`, which
is a false-positive trap — `.webgl-error` is static markup present on every load regardless of state,
so a text-presence check always reads true whether or not the notice is showing. Corrected to read
`getComputedStyle(notice).display` and its `getBoundingClientRect()`: `display: none`, zero-size,
confirming the notice is genuinely hidden. `WEBGL_debug_renderer_info` on the live context reports
`ANGLE (..., SwiftShader Device ..., SwiftShader driver)` — software 3D actually rendered, not the
puppet fallback.

**`freeze-tap`: the 2026-09-06 verdict is re-examined and upheld, and a separate observation is new.**
That comment adjudicated this route's uncapped sixth container as reads-as-designed — "the tap target
**is** that full-bleed surface", the 260px circle carrying `pointer-events: none` as a colour readout.
Re-examined here on the post-`d2e2dcc` capture at `7f654f7`, that reasoning still holds. Stating it
that way matters, because the ticket's own last comment records that prior visual verdicts are stale
as statements about the present; this is a fresh look reaching the same conclusion, not a carryover.

For the record, `d2e2dcc` did **not** land only type raises on this route: it also raised
`.btn-primary`'s block padding from 16px to 20px. An earlier version of this file said otherwise.

An earlier pass here proposed flipping the verdict to needs-edit, citing the route's "all five screen
containers take one measure" comment. That was the wrong reason: the file **enumerates** its five
containers — setup, rule-reveal, pass, result, leaderboard — so the round screen is deliberately
outside that list, not omitted by oversight.

The observation that is genuinely new, and which the 2026-09-06 comment did not consider: at 1440 the
two top readouts sit pinned to opposite frame edges, roughly 1200px apart, around a centred 260px
circle. The mechanism is `.game-hud-top` at `width: 100%` with `justify-content: space-between`. The
same Thai string is echoed in a centred bar at the bottom, so the information is available near
centre. Whether this reads as designed is what `docs/agents/desktop-sizing-decisions.md` reserves for
the owner in its "what this scheme does NOT decide" section, and the screenshot is the artifact for
that judgment. The block a change would edit is headed **gh#183**, not this ticket.

**`cannon-flag`'s cap wording, corrected.** An earlier version said "no cap declared". A cap **is**
declared — `style.css` caps `#app-container` at 900px — and the desktop override removes it with
`max-width: none`, with the full-bleed reason written in that override's own block header. The verdict
is unchanged; the description was wrong.
