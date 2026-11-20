# gh#332 Gh332SyllableCount · ui-ux-pro-max audit, proposal board

Board `design/Gh332SyllableCount.dc.html` (AWAITING OWNER). Its own decisions: D4 number face · D5 count reveal · D6 live tally.
D1/D3 are judged once, on the pilot. Kit elements inherit the pilot's verdicts (`Gh326PickRule.md`; the kit CSS is identical).
The board adds `.nums`, `.nt`, `.nb`, `.rc .rs`, `.rc .sy`, `.rc .rn` and `.nk`, and overrides no kit paint. Slices opened: none.
Audited from the board HTML only.

## Findings

### UX-332-01 · minor · fix-on-board · every option (B adds elements)
- Element: `.pj .nt .ntc`, the per-count tally under each tile in B/mn-pick. It updates live while players pick. The kit
  elements that tick on this board (`.timer`, `.flow .to` "37 จาก 52 คน") are covered by UX-326-02 and are not counted again.
- Rule: `number-tabular` (P6).
- Evidence: no `font-variant-numeric` on any of the seven boards (grep count 0). The timer and picked-count tick in both D6
  options, and B adds four more live counts. The figure widths of Mitr 700 were not measured.
- Class: fix-on-board. The rule asks the same thing of whichever option ships, and it does not argue against B.

## Clean (element · rule · evidence · frames)

| element | rule | evidence | frames |
|---|---|---|---|
| `.pj .nt .nn` numeral | color-contrast | `#ffcc00` on `#23214d` 9.95:1, 200px | A/mn-pick, B/mn-pick, A/mn-result, B/mn-result |
| `.pj .nt .nu` / `.ntc` | color-contrast | `#d9d6f0` on `#23214d` 10.62:1 / `#ffffff` on `#23214d` 15.04:1 | B/mn-pick |
| `.pj .nt.in` | color-contrast | `#14142b` on `#ffcc00` 11.93:1 | A/mn-result, B/mn-result |
| `.pj .nt.out` | color-not-only | struck through as well as dimmed: `#9a97c0` on `#23214d` 5.42:1 | A/mn-result, B/mn-result |
| kit `.pr .lt` numeral tile (D4) | color-contrast | `#ffcc00` on `#23214d` 9.95:1, 80px | A/ph-hold, B/ph-hold |
| `.pj .nb i` beats (D4 B) | color-contrast | `#ffcc00` on `#23214d` 9.95:1, graphic; they repeat the numeral rather than replace it | B/ph-hold, B/ph-pick, B/mn-result |
| `.rc .sy .si` / `.rc .sy .st` (D5 B) | color-contrast | `#d9d6f0` on `#14142b` 12.73:1 / `#ffcc00` on `#14142b` 11.93:1 | B/rule |
| `.rc .rn` count line | color-contrast | `#14142b` on `#ffffff` 18.03:1 | A/rule, B/rule |
| `.pr .nk` count buttons | touch-target-size | `min-block-size: 96px`, `.tap`, render-gated (0 problems) | A/ph-pick, B/ph-pick |
| `.pr .nks` | touch-spacing | `gap: 10px`, at least 8px | A/ph-pick, B/ph-pick |
| `.pr .nk .nn` / `.nk.on .nn` | color-contrast | `#ffffff` on `#23214d` 15.04:1 / `#14142b` on `#ffcc00` 11.93:1 | A/ph-pick, B/ph-pick |
| `.pr .nk.on` | state-clarity | gold fill vs a 2px `#d9d6f0` ring | A/ph-pick, B/ph-pick |

## Observations (no P1-6 rule decides them)
- D4 numeral alone vs numeral plus beats: both pass. B's beats repeat the numeral rather than replace it.
- D5 B: the cost the board itself names (a new judged attribute, gh#320 / gh#321) is a data question, not a rule. Both pass.
- D6 tally hidden vs live: whether the room should see the herd is a game-design choice. No P1-6 rule covers it.
