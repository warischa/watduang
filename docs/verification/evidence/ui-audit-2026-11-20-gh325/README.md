# UI audit, 2026-11-20 (gh#325): ui-ux-pro-max on the seven letter and word game proposal boards

This is gh#325 acceptance box 3: "the ui-ux-pro-max audit runs on the boards, and its owner-pick findings are put to the owner".
It is an audit only. Every row is a finding with a class, never a choice. Nothing on a board or in the kit was edited.
Order after the owner picks: canvas first, then code (ADR-0033). The form is element-scoped (ADR-0047): every finding and every
clean entry names its element (a selector), its rule, its evidence and the frames that carry it. A pass that names no element
is not a pass.

## Method

- Rules: priorities 1-6 of the plugin's `references/quick-reference.md`, **ui-ux-pro-max 2.13.0**. Two versions are installed:
  2.5.0 at user scope and 2.13.0 at project scope for this repo, so 2.13.0 is the one this repo resolves to. It matches the
  gh#262 and gh#315-318 audits. The Skill tool was not available in this agent's toolset, so the rule files were read straight
  from the 2.13.0 install (`SKILL.md`, `references/quick-reference.md`, `data/ux-guidelines.csv`). Only the rules were used,
  never the plugin's palette or fonts (CLAUDE.md, ADR-0033). No finding proposes a colour or font value.
- Inputs: `design/Gh326PickRule.dc.html` through `design/Gh332SyllableCount.dc.html`, as found at HEAD `50f74b7` plus the
  untracked boards; the slices in `docs/verification/evidence/gh325-boards-2026-11-20/`; `kit.mjs` and `render-boards.mjs`
  there. No browser, no server, no render. Values were read from each board's CSS and frame HTML.
- Assessable on a static board: P1 `color-contrast`, `color-not-only`, `reduced-motion` (beat tables), `auto-rotation-controls`;
  P2 `touch-target-size`, `touch-spacing`; P4 `primary-action`, `state-clarity`, `elevation-consistent`; P5 `readable-font-size`
  (phone only), `spacing-scale`; P6 `line-height`, `font-scale`, `number-tabular`, `truncation-strategy`.
- Kit vs board: the kit CSS block (from the projector-frames comment through `.pr .ptime .pt-n`) has the same sha256 prefix,
  `f3730ec3a3dd13cf`, in all seven boards. So kit elements are judged once, in `Gh326PickRule.md`, and each sibling judges only
  the selectors it adds. Every sibling's own CSS was read; none of them re-paints a kit selector.
- Gate reuse: `render-boards.mjs` fails any `.tap` under 44px (`smallTaps`) and any phone text under 16px, and the builders
  report 0 problems per board (gh325 README). A touch clean cites that gate. It does NOT check `touch-spacing`, so spacing was
  read from each `gap`.

## Classes and counting

- **owner-pick**: the rule's verdict differs between a decision's options, so it bears on the A/B the owner is choosing. The
  finding names the D-option and says which way the rule leans. If the option could be fixed without changing what it is,
  the finding says that too.
- **fix-on-board**: the rule's verdict is the same under every option (kit or shared frames).
- D1 and D3 findings count only on the pilot. Kit findings count once, on the pilot, never per sibling. A concern no P1-6
  rule decides is an observation and is not counted. Already-ruled items (3D, the 14-digit code, half-cut) are not re-asked.

## Contrast

WCAG 2.x: each channel c/255 becomes c/12.92 if it is at most 0.03928, otherwise ((c+0.055)/1.055)^2.4.
L = 0.2126 R + 0.7152 G + 0.0722 B, and ratio = (L1 + 0.05) / (L2 + 0.05). Every ratio in these files came from one script and
was recomputed from the two cited colours by the verifier. Calibration: the script returns `#ffcc00` on `#ff3d7f` 2.23:1 and
`#ffffff` on `#2b7bff` 3.90:1, the gh#262 audit's readings, and it reproduces every row of the boards' own CONTRAST tables. Text
is held to 4.5:1. A graphic that carries information is held to 3:1 (WCAG 1.4.11; the plugin's wording covers text only).
Where an element sits transparent on the night gradient, the worse end, `#23214d`, is the one cited.

## Owner-pick findings (4)

- `Gh326PickRule.md` UX-326-01 · D1 · `auto-rotation-controls`: B's two pages swap on a timer, with no hold control and no
  reduced-motion form drawn. The rule favours A.
- `Gh327LetterHand.md` UX-327-01 · D6 · `color-not-only`: in B the newest letter changes only colour,
  `#ffffff` on `#ffcc00` 1.51:1. Position helps in the drawn word, but not in the 24 of 109 words that fill a place ahead of an empty one. The rule favours A.
- `Gh328LetterBingo.md` UX-328-02 · D5 · `color-not-only`: in B, lit vs dim letters at 14px differ only in colour,
  `#ffcc00` on `#9a97c0` 1.84:1. The rule favours A.
- `Gh329WordChain.md` UX-329-01 · D5 · `color-not-only`: A's well is `#14142b` on `#23214d` 1.20:1, so the link letter is marked
  only by its colour, `#ffffff` on `#ffcc00` 1.51:1. The rule favours B.

A fifth candidate was withdrawn on review. Gh328 D4 A's empty rail slots are near-invisible, but the draw count is printed as
text in the same frame, so the slots are not required and it is now an observation, not counted.

## Coverage (generated by the verifier from the files; clean rows = element/rule entries)

- Gh326PickRule: owner-pick 1 / fix-on-board 3 / clean rows 17 · frames named 24 of 24
- Gh327LetterHand: owner-pick 1 / fix-on-board 0 / clean rows 18 · frames named 20 of 29
- Gh328LetterBingo: owner-pick 1 / fix-on-board 0 / clean rows 13 · frames named 15 of 22
- Gh329WordChain: owner-pick 1 / fix-on-board 0 / clean rows 9 · frames named 9 of 22
- Gh330ThreeGroups: owner-pick 0 / fix-on-board 0 / clean rows 17 · frames named 17 of 24
- Gh331NameLetter: owner-pick 0 / fix-on-board 0 / clean rows 11 · frames named 13 of 13
- Gh332SyllableCount: owner-pick 0 / fix-on-board 1 / clean rows 12 · frames named 10 of 22
- Total: 7 boards, 156 frames, 108 named in a finding or clean row. For each named frame, the verifier checked that one
  element in it carries every class of the row selector's last compound. That leaves 48 frames that are not named, and a
  script (a class-presence test) found that none of them carries any class the board's own CSS adds. They draw kit
  elements only, so they inherit the pilot's kit verdicts. They were not audited frame by frame.
- Every option frame (dir A or B) on every board is named.
- Slices opened at native size (cropped): `Gh326PickRule-1`, `Gh328LetterBingo-2`, `Gh328LetterBingo-5`, `Gh329WordChain-4`.
  Contact sheets of all slices were built; only the Gh328 and Gh329 sheets were looked at. Every other judgement is from HTML/CSS.
- Boards read (sha256, first 16 hex): Gh326 `30050902ad8c1ea7` (the kit README's determinism hash), Gh327 `65fa8c31c10ac236`,
  Gh328 `e07302a87418aabc`, Gh329 `9fc67feca6b02fe3`, Gh330 `1f6a3f149408bbd5`, Gh331 `475f7d5465e0f2d3`, Gh332 `a61f4e2dc6052ba5`.
- The helper scripts (extractor, contrast, verifier, residual) are session files outside this deliverable and are not part of it.

## Not reachable, so none of these is a pass

- A real projector, room or viewing distance (gh#333 rehearsal); glyph legibility at 200 people. D1 has no plugin rule.
- Motion: every beat, the 3D turn, the D1 B page swap as it actually moves. Beat tables were read as text.
- Rendered values: computed styles, painted contrast and the fit script's runtime sizes (the builders' render reports were cited,
  not re-measured). Mitr's figure widths (`number-tabular`).
- Rules that need a live page: all of P3, focus/keyboard/aria/alt-text/skip-links, `viewport-meta`, `dynamic-type`,
  `horizontal-scroll` (beyond the render gate's sideways check), and P7-P10.
- English rounds, phone widths other than 320px, and the MC setup device (none of them drawn on any board).
