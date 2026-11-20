# gh#328 Gh328LetterBingo · ui-ux-pro-max audit, proposal board

Board `design/Gh328LetterBingo.dc.html` (AWAITING OWNER). Its own decisions: D4 draw visual · D5 admin field · D6 mini-event pick.
D1/D3 are judged once, on the pilot. Kit elements inherit the pilot's verdicts (`Gh326PickRule.md`; the kit CSS is identical).
The board adds `.wc .wd.ls` and `.wd .lm` inside the kit cell and overrides no kit paint. Slices opened: `Gh328LetterBingo-2.jpg`
(native crop of the A rail) and `Gh328LetterBingo-5.jpg` (native crop of B field cells). Every other frame: HTML only.

## Findings

### UX-328-02 · minor · owner-pick · D5: disfavours B as drawn
- Element: `.pj .wd .lm.mk` vs `.pj .wd .lm:not(.mk)`, a drawn letter vs an undrawn one inside a cell. Frame: B/field.
- Rule: `color-not-only` (P1).
- Evidence: lit and dim are the same 14px weight 600 and differ only in colour: `#ffcc00` on `#9a97c0` 1.84:1. The band lists the drawn letters as text, but which letters in a given cell are lit, which is the per-cell state, is
  carried by colour alone. The native crop of slice 5 confirms it: 9 letters per cell, lit and dim told apart by hue and
  lightness only. A shows one digit per cell (the mark count), which carries no state in colour.
- Class: owner-pick on D5. The rule favours A. B can be fixed inside B by adding weight or an underline to the lit letters,
  the way Gh331 D5 A marks its letter.

## Clean (element · rule · evidence · frames)

| element | rule | evidence | frames |
|---|---|---|---|
| `.pj .dt` drawn tile | color-contrast | `#ffcc00` on `#23214d` 9.95:1, 260px | A/draw |
| `.pj .rs.mk` / `.rs.new` | color-contrast | `#ffffff` on `#23214d` 15.04:1 / `#ffcc00` on `#23214d` 9.95:1 | A/draw |
| `.pj .rs.new` (newest draw) | color-not-only | a 3px gold ring marks it, as well as the glyph colour | A/draw |
| kit `.wc .wd` mark count (D5 A) / 9 letters `.wd.ls` (deal) | color-contrast | `#ffcc00` on `#23214d` 9.95:1 | A/field, F/deal |
| `.pj .ac:not(.mk)` / `.ac.mk` | color-contrast | `#ffffff` on `#23214d` 15.04:1 / `#14142b` on `#ffcc00` 11.93:1 | B/draw |
| `.pj .ac.mk` / `.ac.new` | color-not-only | a fill marks a drawn letter; a 4px `#ffffff` ring marks the newest | B/draw |
| `.pj .wd .lm:not(.mk)` | color-contrast | `#9a97c0` on `#23214d` 5.42:1 (14px, at least 4.5:1) | B/field |
| `.pj .bx:not(.mk)` / `.bx.mk` | color-contrast | `#ffffff` on `#14142b` 18.03:1 / `#14142b` on `#ffcc00` 11.93:1 | A/mn-pick, B/mn-pick, A/mn-line, B/mn-line |
| `.pj .bx.ln` (completed line) | color-not-only | a glow beyond the fill that marks it as drawn | A/mn-line, B/mn-line |
| `.pj .lnum` line numbers (D6 B) | color-contrast | `#d9d6f0` on `#23214d` 10.62:1 | B/mn-pick, B/mn-line |
| `.pj .mc.won` | color-not-only | a 3px gold inset ring on the winning card | A/mn-line |
| `.pr .bx` / `.pr .bx.mk` | color-contrast | `#ffffff` on `#23214d` 15.04:1 / `#14142b` on `#ffcc00` 11.93:1 | F/ph-card, F/ph-draw, F/ph-in, F/ph-out |
| kit `.pb` card/line buttons (D6 A 16, B 8) | touch-target-size | 52px, render-gated (0 problems) | A/mn-ph-pick, B/mn-ph-pick |

## Observations (no P1-6 rule decides them)
- D4 A's empty rail slots `.rs:not(.mk)`: the ring is `#2e2b63` on `#14142b` 1.41:1 and on `#23214d` 1.18:1, and they can barely be
  seen on the slice 2 crop. The count is also printed as text in A/draw ("ตัวที่ 7 จาก 12", and "7 ตัว" in the band), so the slots
  are not required to understand the screen, and the non-text contrast bar does not bind. The board's line that with A "the room
  can count what is left" is carried by that text, not by the slots. Not counted.
- D6 A one card of 16 vs B one line of 8: this changes the mechanic as well as the look. No P1-6 rule decides a mechanic.
  Both options pass the touch rules.
- D5 A vs B also changes what the room can read (a count vs the letters). The rule finding above is only about B's
  lit/dim cue.
