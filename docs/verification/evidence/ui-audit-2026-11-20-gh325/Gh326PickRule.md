# gh#326 Gh326PickRule (pilot + the gh#325 kit) · ui-ux-pro-max audit, proposal board

Board `design/Gh326PickRule.dc.html`: D1 glyph floor and D3 code grouping (shared), D2 vowel-form label (pilot). Kit findings
are written once, here (the kit CSS is identical in all seven boards). Slice opened: `Gh326PickRule-1.jpg` (A dense, native crop).

## Findings

### UX-326-01 · major · owner-pick · D1: disfavours B as drawn
- Element: `.pj .dense` in B/dense, page 1 of 2, which swaps with page 2 on a timer ("until the MC draws the rule", D1 B tag).
- Rule: `auto-rotation-controls` (P1): content that moves on by itself needs pause/stop, and must stop under reduced motion.
- Evidence: no beat in the 5-beat table is a page swap or gives a reduced-motion swap; MC controls not drawn (NOTES). A is static.
- Class: owner-pick on D1, favouring A. If B is picked, the board must also draw an MC hold/advance control and a reduced-motion swap.

### UX-326-02 · minor · fix-on-board · kit, every option
- Element: numbers that change while the room watches: `.pj .flow .to` (beat 5, "the count rolls"), `.pj .timer`, `.pr .ptime .pt-n`.
- Rule: `number-tabular` (P6).
- Evidence: `font-variant-numeric` / `tnum` / `tabular` appear 0 times in each of the seven boards. Mitr 700 figures NOT measured.
- Class: fix-on-board (kit). It counts once, here, for every board that draws these elements.

### UX-326-03 · minor · fix-on-board · kit, every option
- Element: kit `gap` values `.dense` 2px, `.wc` 6px, `.pr .hand` 10px, `.dots` / `.low.slim .flow` 14px, `.flow.sm` 18px, `.pool` 22px.
- Rule: `spacing-scale` (P5, a 4pt/8dp system).
- Evidence: 7 of the 16 `gap:` values in `kit.mjs` are not multiples of 4. The projector chrome is the gh#302 B pick "values
  unchanged" (kit header); which of the 7 are picks was not traced.
- Class: fix-on-board. Any of the 7 that is a gh#302 pick re-opens that pick, so the owner sees it before anyone edits it.

### UX-326-04 · info · fix-on-board · the board's CONTRAST table
- Element: `.pj .wc.out .wd` / `.fit` in F/result and F/fallback, a transparent cell over the gradient.
- Rule: `color-contrast` (P1). The pair passes; this is about which background the table cites.
- Evidence: the table cites `#9a97c0` on `#14142b` 6.49:1 (the top of the gradient). The worse end is `#9a97c0` on `#23214d` 5.42:1.
- Class: fix-on-board. The row should cite the worse end.

## Clean (element · rule · evidence · frames)

| element | rule | evidence | frames |
|---|---|---|---|
| `.wc .fit` / `.wc .wd` / `.wc.in` type | color-contrast | `#ffffff` on `#23214d` 15.04:1 / `#ffcc00` on `#23214d` 9.95:1 / `#14142b` on `#ffcc00` 11.93:1 | A/dense, B/dense, F/flip, F/result, F/fallback |
| `.wc.in` / `.wc.out` / `.wc.turn` | color-not-only | gold fill + bold vs strike + dim, with "ผ่าน" / "ไม่ผ่าน" on the legend; the turning row has a 3px ring | F/result, F/fallback, F/flip |
| `.rc .rv` / `.rc .rh` / `.rc .pol` | color-contrast | `#14142b` on `#ffffff` 18.03:1 / `#3d3b5c` on `#ffffff` 10.61:1 / `#ffcc00` on `#14142b` 11.93:1 | A/rule, B/rule |
| `.codebox .ck` / `.digits` / `.ci` | color-contrast | `#d9d6f0` on `#23214d` 10.62:1 / `#ffcc00` on `#23214d` 9.95:1 / `#ffffff` on `#23214d` 15.04:1 | A/code, B/code |
| `.pj .ev`, `.lk`, `.flow small` | color-contrast | `#d9d6f0` on `#23214d` 10.62:1 (the worse end of the ground) | A/dense, F/mn-pick |
| `.pt .pw` / `.pt.in` / `.win .fit` | color-contrast | `#ffffff` on `#23214d` 15.04:1 / `#14142b` on `#ffcc00` 11.93:1 / `#ffcc00` on `#23214d` 9.95:1 | F/mn-pick, F/mn-result, F/mn-win |
| `.pr .msg`, `.pr .ev`, `.pr .lt` | color-contrast | `#d9d6f0` on `#23214d` 10.62:1; tile `#ffcc00` on `#23214d` 9.95:1 | F/ph-code, F/ph2b-hand |
| `.pr .hw` / `.hw.on` / `.opt.on` / `.go` | color-contrast | `#ffffff` on `#23214d` 15.04:1 / `#14142b` on `#ffcc00` 11.93:1 / `#14142b` on `#ffffff` 18.03:1 / `#14142b` on `#ffcc00` 11.93:1 | F/ph-hand, A/ph-tap, B/ph-tap |
| `.pr .big.out` | color-contrast | `#9a97c0` on `#23214d` 5.42:1, and the word "ไม่ผ่าน" carries the meaning too | F/ph-out |
| `.pr .opt`, `.go`, `.pb` | touch-target-size | `min-block-size: 52px`; the render gate fails any `.tap` under 44px, and reported 0 problems | A/ph-tap, F/ph2b-tap, F/mn-ph-pick |
| `.pr .opts`, `.pols`, `.pbtns` | touch-spacing | `gap: 8px`, exactly at the minimum | A/ph-tap, F/mn-ph-pick |
| `.pr .msg` | readable-font-size / line-height | 16px (the render's phone floor) / 1.55 | F/mn-ph-closed, F/mn-ph-fill, F/mn-ph-result, F/ph-in |
| beat table (5 beats) | reduced-motion | every beat has a reduced form (ADR-0046) | F/flip, F/fallback |
| `.go`, one per frame | primary-action | one primary button per phone frame | F/ph-code, A/ph-tap |
| `.opt.on`, `.pb.on`, `.hw.on` | state-clarity | white fill / gold fill / gold + glow, each against a 2px ring | F/ph2b-tap, F/mn-ph-pick, F/ph-hand |
| gold glow `rgba(255,204,0,0.45)` | elevation-consistent | one colour at 16/18/24/60px by role | F/result, F/mn-win |
| `.wc .fit`, `.win .fit` | truncation-strategy | NAME FIT wraps at the floor and never truncates (the render's fit report, not re-measured here) | A/dense, F/mn-win |

## Observations (no P1-6 rule decides them)
- D1 14px vs 20px: no plugin rule is scoped to a projector. The mobile rule `readable-font-size` is not stretched onto it. Both
  options are above the P6 "Text < 12px" line. The 30px floor is a render gate. Viewing distance was not reachable (gh#333).
- D2 hyphen vs อ in the slot: no P1-6 rule covers it. The board's reading (a lone mark looks like "=") stands. D3 4-4-4-2 vs
  5-5-4: the plugin has no digit-grouping rule (`ux-guidelines.csv` searched). font-scale: 13 projector and 9 phone sizes, set
  per role by the floors and fit, so not raised.
