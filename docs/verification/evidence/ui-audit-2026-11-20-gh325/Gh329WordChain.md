# gh#329 Gh329WordChain · ui-ux-pro-max audit, proposal board

Board `design/Gh329WordChain.dc.html` (AWAITING OWNER). Its own decisions: D4 a chain word nobody holds · D5 link letter ·
D6 rule tap. D1/D3 are judged once, on the pilot. Kit elements inherit the pilot's verdicts (`Gh326PickRule.md`; the kit CSS is
identical). The board's own CSS adds selectors and overrides no kit paint. Slices opened: `Gh329WordChain-4.jpg` (native crop
of the A chain row). Every other frame: HTML only.

## Findings

### UX-329-01 · minor · owner-pick · D5: disfavours A as drawn
- Element: `.pj .lc`, the link letter's grapheme cluster set in a dark well inside each chain word. Frame: A/chain.
- Rule: `color-not-only` (P1).
- Evidence: the well is `#14142b` on `#23214d` 1.20:1, so the well itself hardly shows. The glyph colour is the cue that is left:
  `#ffffff` on `#ffcc00` 1.51:1. Position helps only partly: the link sits at a word's edge, except after a skipped leading vowel
  (the board's own example is แอปเปิล). On the
  native crop of slice 4 the wells show only faintly; the link letters stand out by hue. B puts the consonant on its own
  `.lb` tile between the words (position and shape, `#14142b` on `#ffcc00` 11.93:1). That is not colour alone.
- Class: owner-pick on D5. The rule favours B. A can be fixed inside A by giving the well a visible edge or underlining
  the cluster.

## Clean (element · rule · evidence · frames)

| element | rule | evidence | frames |
|---|---|---|---|
| `.pj .cl .cw` chain word | color-contrast | `#ffcc00` on `#23214d` 9.95:1 | A/chain, B/chain, F/step, B/unheld, F/ad-word, F/mn-chain |
| `.pj .cl .cn` holder count | color-contrast | `#d9d6f0` on `#23214d` 10.62:1 | A/unheld, A/chain |
| `.pj .cl.nb` (D4 A, a word nobody holds) | color-contrast | `#9a97c0` on `#23214d` 5.42:1 (the worse end of the ground) | A/unheld |
| `.pj .cl.nb` | color-not-only | a 2px ring plus the label "ไม่มีใครถือคำนี้", not only the dim colour | A/unheld |
| `.pj .lc` glyph on its well | color-contrast | `#ffffff` on `#14142b` 18.03:1 (the contrast passes; the cue is UX-329-01) | A/chain |
| `.pj .ln` link bar | color-contrast | `#ffcc00` on `#23214d` 9.95:1, graphic | A/chain |
| `.pj .lb` link tile (D5 B) | color-contrast | `#14142b` on `#ffcc00` 11.93:1 | B/chain |
| `.pj .pp` polarity on the chain screen | color-contrast | `#ffcc00` on `#14142b` 11.93:1 | F/step |
| kit `.opt` chain taps (D6 A first words, B set names) | touch-target-size | 52px, render-gated (0 problems) | A/ph-tap, B/ph-tap |

## Observations (no P1-6 rule decides them)
- D4 A (say it on screen) vs B (every word the same): B takes information away rather than breaking a rule. A's
  treatment is clean (rows above).
- D6 first words vs "ชุด ก / ชุด ข": this is a question of meaning, and no plugin rule covers it. B needs the set name drawn on
  the main screen too, which the board says is not drawn on the shared frames.
