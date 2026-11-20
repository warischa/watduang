# gh#327 Gh327LetterHand · ui-ux-pro-max audit, proposal board

Board `design/Gh327LetterHand.dc.html` (AWAITING OWNER). Its own decisions: D4 mark tile · D5 script labels · D6 hidden word ·
D7 phone pace · D8 pick grid. D1/D3 are drawn at the default A and judged once, on the pilot. Kit elements inherit the pilot's
verdicts (`Gh326PickRule.md`; the kit CSS is identical). The board's own CSS adds selectors and overrides none of the kit's
paint. Slices opened: none. Audited from the board HTML only.

## Findings

### UX-327-01 · minor · owner-pick · D6: disfavours B as drawn
- Element: `.pj .ww.now` in B/reveal, the letter that has just landed in the word written in place.
- Rule: `color-not-only` (P1): don't carry information by colour alone.
- Evidence: `.ww` is `#ffcc00` and `.ww.now` is `#ffffff`, at the same 150px Mitr 700, with no other change. The two colours are
  `#ffffff` on `#ffcc00` 1.51:1 apart. In the drawn word, position also helps: the newest letter sits just before the empty slot.
  But the board's own D6 text counts 24 of the 109 playable words with a step that fills a place ahead of an empty one, and there
  position says nothing, so colour is the only cue. A marks the step with a fill: `.sl.lit.now` is a solid gold tile with a
  glow, against the outlined `.sl.lit`.
- Class: owner-pick on D6. The rule favours A. B can be fixed without changing what B is, by adding a non-colour cue for the
  newest letter (an outline, an underline or a size change).

## Clean (element · rule · evidence · frames)

| element | rule | evidence | frames |
|---|---|---|---|
| `.pj .sl.lit` | color-contrast | `#ffcc00` on `#23214d` 9.95:1 | A/reveal, F/flip, F/flip-save, F/mn-last, F/mn-first |
| `.pj .sl.now` | color-contrast | `#14142b` on `#ffcc00` 11.93:1 | A/reveal |
| `.pj .sl.em` ring (slot still to come) | color-contrast | ring `#d9d6f0` on `#23214d` 10.62:1, well above 3:1 for a graphic | A/reveal, B/reveal |
| `.pj .ww` / `.ww.now` | color-contrast | `#ffcc00` on `#23214d` 9.95:1 / `#ffffff` on `#23214d` 15.04:1 | B/reveal |
| kit `.wc .wd` dealt tile beside each name (D4) | color-contrast | `#ffcc00` on `#23214d` 9.95:1 | A/deal, B/deal |
| kit `.pr .lt` mark tile (D4 A), 80px | color-contrast | `#ffcc00` on `#23214d` 9.95:1 | A/ph-hand, A/ph-wide |
| kit `.rc .rv` script label (D5) | color-contrast | `#14142b` on `#ffffff` 18.03:1 | A/rule, B/rule |
| kit `.opt` script and polarity taps (D5) | touch-target-size | 52px, render-gated (0 problems) | A/ph-tap, B/ph-tap |
| `.pr .pl.lit` (D7 A slot row) | color-contrast | `#ffcc00` on `#23214d` 9.95:1, at 24px | A/ph-follow |
| `.pr .pl.em` | color-contrast | ring `#d9d6f0` on `#23214d` 10.62:1 | A/ph-follow |
| `.pr .lt .ln` (D4 B mark name) | color-contrast | `#d9d6f0` on `#23214d` 10.62:1 | B/ph-hand, B/ph-wide |
| `.pr .lt .ln` | readable-font-size | 18px, above the 16px minimum | B/ph-hand |
| `.pr .pb .lw` (D8 B letters) | color-contrast | `#ffffff` on `#23214d` 15.04:1; `.pb.on .lw` `#14142b` on `#ffcc00` 11.93:1 | B/mn-ph-pick |
| `.pr .pb.g4b` (D8 B) | touch-target-size | `min-block-size: 64px`; the render gate measured every `.tap` at 44px or more (0 problems) | B/mn-ph-pick |
| `.pr .pbtns.g4` (D8 B) | touch-spacing | `gap: 8px`, inherited from `.pbtns` | B/mn-ph-pick |
| kit `.pb` (D8 A) | touch-target-size | 52px, render-gated as on the pilot | A/mn-ph-pick |
| D7 A `.go` "ตัวถัดไป" / D7 B `.go` "ดูผล" | primary-action | one primary button in each option | A/ph-follow, B/ph-follow |
| D6 A slot row vs D6 B | color-not-only | A: the newest step is a fill change; the slot still to come is a ring | A/reveal |

## Observations (no P1-6 rule decides them)
- D4 hyphen slot vs hyphen + name: no rule in P1-6 decides between them. The board's own reading ("-้" looks close to "=")
  stands as written. B's added name passes contrast and size (rows above).
- D5 "ชุด ก / ชุด ข" vs numbered labels: this is a question of meaning (a label that is itself a tile letter), and no plugin
  rule covers it.
- D7 step-with-the-screen vs verdict-after: both options pass touch and primary-action. Which pace to use is a game-flow
  choice that no rule decides.
- D8 kit buttons vs the 4-column grid: both pass touch-target-size, touch-spacing and readable-font-size, so no rule
  separates them.
