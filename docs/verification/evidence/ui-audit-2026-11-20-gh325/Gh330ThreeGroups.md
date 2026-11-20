# gh#330 Gh330ThreeGroups · ui-ux-pro-max audit, proposal board

Board `design/Gh330ThreeGroups.dc.html` (AWAITING OWNER). Its own decisions: D4 group mark · D5 third class · D6 drawn word ·
D7 phone pick. D1/D3 are judged once, on the pilot. Kit elements inherit the pilot's verdicts (`Gh326PickRule.md`; the kit CSS
is identical). The board's own CSS adds selectors and overrides no kit paint. Slices opened: none. Audited from the board HTML
only (the colours were read from its CSS and from the `svg.gm` fills).

## Findings

No rule violation on any element this board adds, under any of its options. Every element is listed below as clean.

## Clean (element · rule · evidence · frames)

| element | rule | evidence | frames |
|---|---|---|---|
| `.grp` names and counts on the tints | color-contrast | `#ffffff` on `#3c2045` 14.14:1, on `#1e2857` 14.03:1, on `#343257` 12.07:1 | A/mn-pick, B/mn-pick, F/en-reveal |
| `.grp-un`, `.grp-st` on the tints | color-contrast | `#d9d6f0` on `#3c2045` 9.99:1, on `#1e2857` 9.91:1, on `#343257` 8.52:1 (not in the board's table; computed here) | A/pair, B/pair, F/mn-result |
| `svg.gm` shapes (D4 A) on their own tint | color-contrast | `#ff3d7f` on `#3c2045` 4.19:1, `#2b7bff` on `#1e2857` 3.60:1, `#c9c2ff` on `#343257` 7.27:1; at least 3:1 for a graphic | A/mn-pick, A/ph-group |
| `svg.gm` shapes on an unpicked phone row (on the ground) | color-contrast | `#ff3d7f` on `#23214d` 4.46:1, `#2b7bff` on `#23214d` 3.85:1, `#c9c2ff` on `#23214d` 9.06:1 | A/mn-ph-pick, B/mn-ph-pick |
| `.gnum` digits (D4 B) | color-contrast | `#14142b` on `#ff3d7f` 5.35:1, on `#2b7bff` 4.62:1, on `#c9c2ff` 10.86:1 | B/mn-pick, B/ph-group |
| the three groups, both D4 options | color-not-only | each tint comes with a shape (A) or a digit (B) and the Thai name. The board's own table shows punch vs sky, `#ff3d7f` on `#2b7bff`, at 1.16:1, so the hue alone could not carry it, and neither option relies on hue alone | A/mn-pick, B/mn-pick |
| `.grp.in` | color-contrast | `#14142b` on `#ffcc00` 11.93:1 | A/reveal, B/reveal |
| `.grp.out` | color-not-only | the name and count are struck through as well as dimmed: `#9a97c0` on `#23214d` 5.42:1 | A/reveal, B/reveal |
| `.grp.empty` (D5 A) | color-not-only | a dashed `#9a97c0` border plus "0 คน" and a not-dealt label | A/pair, A/reveal, F/en-reveal |
| `.dr-pol` / `.dr-lab`, `.dr-line` | color-contrast | `#ffcc00` on `#23214d` 9.95:1 / `#d9d6f0` on `#23214d` 10.62:1 | A/reveal, B/reveal |
| `.dr-tile` (D6 B) | color-contrast | `#14142b` on `#ffffff` 18.03:1 | B/reveal |
| `.pr .pk` pick rows | touch-target-size | `min-block-size: 56px`, `.tap`, render-gated (0 problems) | A/mn-ph-pick, B/mn-ph-pick |
| `.pr .pks` | touch-spacing | `gap: 10px`, at least 8px | A/mn-ph-pick, B/mn-ph-pick |
| `.pr .pk-lt` class letters (D7 B) | readable-font-size / line-height | 16px Sarabun 400, line-height 1.5 | B/mn-ph-pick |
| `.pr .pk-lt` | color-contrast | `#d9d6f0` on `#23214d` 10.62:1; picked row `#14142b` on `#ffffff` 18.03:1 | B/mn-ph-pick |
| `.pr .pk.on svg.gm` mark on the picked row | color-contrast | `#14142b` on `#ffffff` 18.03:1 | A/mn-ph-pick, B/mn-ph-pick |
| `.pr .pgc` group card | color-contrast | the same tint pairs as `.grp` above | A/ph-group, B/ph-group, F/ph-in, F/ph-out, F/mn-ph-closed, F/mn-ph-fill, F/mn-ph-result |

## Observations (no P1-6 rule decides them)
- D4 shape vs number: both pass color-contrast and color-not-only, so no rule separates them.
- D5 three panels vs two: A keeps the positions fixed, and its empty panel is clean (row above). Whether to draw the empty
  panel at all is a layout choice that no rule decides.
- D6 class line vs consonant chain, and D7 name only vs name plus letters: both options of each pass every rule checked.
