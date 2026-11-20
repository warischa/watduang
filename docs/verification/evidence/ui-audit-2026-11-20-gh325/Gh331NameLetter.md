# gh#331 Gh331NameLetter · ui-ux-pro-max audit, proposal board

Board `design/Gh331NameLetter.dc.html` (AWAITING OWNER; mini-event only, so no round code and no go button). Its own decisions:
D4 letter card · D5 match on a name · D6 redraw. D1 is judged once, on the pilot (the wall is the kit dense field). Kit elements
inherit the pilot's verdicts (`Gh326PickRule.md`; the kit CSS is identical). The board adds `.rc .ltr`, `.rc .kw` and `.mk`,
and its only kit-adjacent rule, `.wc.out .mk`, paints its own element. Slices opened: none. Audited from the board HTML only.

## Findings

No rule violation on any element this board adds, under any of its options. Every element is listed below as clean.

## Clean (element · rule · evidence · frames)

| element | rule | evidence | frames |
|---|---|---|---|
| `.pj .rc .ltr` drawn letter, 360px | color-contrast | `#14142b` on `#ffffff` 18.03:1 (the kit `.rc .rv` role) | A/letter, B/letter, B/redraw |
| `.pj .rc .kw` alphabet word (D4 B), 96px | color-contrast | `#14142b` on `#ffffff` 18.03:1 | B/letter |
| `.pj .wc.out .mk` matched cluster (D5 A) | color-contrast | `#ffcc00` on `#23214d` 9.95:1 (the worse end of the ground) | A/wall, A/late |
| `.pj .wc.out .mk` | color-not-only | gold, plus bold weight, plus a 3px underline; the cell is also struck | A/wall, A/late |
| kit `.wc .fit` wall names | color-contrast | `#ffffff` on `#23214d` 15.04:1 | F/pre, A/wall, B/wall |
| kit `.wc.out .wd` letter beside an out name (D5 B) | color-contrast | `#9a97c0` on `#23214d` 5.42:1, struck like the cell (kit paint; board NOTES) | B/wall, B/late |
| `.pr .nmc .fit` phone name card, 32px | color-contrast | `#ffffff` on `#23214d` 15.04:1 | F/ph-wait, F/ph-safe, F/ph-out, F/ph-odd |
| `.pr .mk` on the phone name | color-not-only | gold plus a 3px underline: `#ffcc00` on `#23214d` 9.95:1 | F/ph-out |
| `.pr .nmc` ring | color-contrast | `#d9d6f0` on `#23214d` 10.62:1, graphic | F/ph-wait |
| kit winners `.win .fit` | color-contrast | `#ffcc00` on `#23214d` 9.95:1 | F/win |
| `.hud .lk` redraw line (D6 B), over the veiled field | color-contrast | `#d9d6f0` on `#171732` 12.30:1 (the veil `rgba(20,20,43,0.78)` composited over `#23214d`) | B/redraw |

## Observations (no P1-6 rule decides them)
- D4 letter alone vs letter plus word: both pass. The board's own note (ฃ and ฅ leave the draw pool if B is picked) is a
  content rule, not a plugin rule.
- D5 marked in the name vs beside it: both pass color-not-only.
- D6 silent vs shown redraw: what the room is told is a matter of meaning, and no P1-6 rule covers it.
