# gh#317 / gh#318: the two phase-2 prize-draw FINAL boards (2026-11-16), DRAWN TO THE OWNER'S PICKS 2026-11-18

Two boards in `design/`: `Gh317Envelopes.dc.html` (ซองของขวัญ, the gift-envelope final) and
`Gh318Cards.dc.html` (เปิดไพ่ชิงรางวัล, the turn-a-card final). The board decisions were picked 2026-11-16
(D1 A ROW, D2 A ONE AT A TIME, E1 / C1 copy approved; owner popups recorded on gh#317 / gh#318). The
2026-11-17 audit's owner-pick findings were picked 2026-11-18 (recorded on the same tickets); this directory
stamps the ratified values and draws the pick frames under gh#319 (canvas first, then code, ADR-0033). Each
board's header is the Gh305AuditFrames picks banner: the rulings on this canvas, then the picks quoted verbatim
from the ticket's last pick comment. Every Thai string in a frame is approved copy (E1 / C1) or verbatim from a
picked board, the ticket, or the shipped demo copy (COPY SOURCES).

## The shared mechanic, designed once

The two games SHARE ONE MECHANIC (gh#299 decision 12; the owner keeps both). It is designed once in
`shared.mjs` and is byte-identical in behaviour on both boards; only the object's look differs:

- **pick -> reveal -> prize slot.** Five finalists each pick one object (an envelope / a face-down card). The
  final's uniform order (the draw the event already makes, `hostFinalCode`) ranks the five; prize 1..N go to
  ranks 1..N. Whichever object a finalist picks opens to THEIR drawn prize, so the pick is theatre and never
  changes the odds (decision 7). N is the MC's prize count, 1..5 (decision 9).
- **The pick shown in words:** a name plate under each object (the gh#303 lane-plate pill), never colour alone.
- **The no-prize slot:** "ไม่มีรางวัล" with "ขอบคุณที่ร่วมลุ้น" — the gh#303 L2 PICKED ruling, reused verbatim,
  NOT re-proposed. Drawn in the ONE PRIZE frame (1 prize, 4 no-prize) and in every reveal/result.
- **The 2D path and the never-blank fallback converge.** Under reduced motion, and below 640px, the reveal runs
  the 2D path the shared host already draws for a final (`src/play/_prize-reveal/reveal.ts`, view kind `final`):
  the gh#302 picked result frame, revealed last slot to prize 1 by 200ms fades. The ADR-0051 never-blank fallback
  (WebGL unavailable) draws the SAME frame. Both are drawn from `plainResult` and tagged for their trigger.
  Below 640px the DEMO result takes the phone layout drawn in the PHONE RESULT rows (Gh305AuditFrames frame 2,
  PD-305-05: winner on top, prize cards in one column at i5-phone B sizes, inside the demo bar chrome; owner
  picks PD-317-01 a / PD-318-02 a, 2026-11-18 — frame 2 wins over the pick's "two-column" wording); the phone's
  own join/card/claim screens are gh#302 / gh#309's boards, not re-proposed here.
- **The event fixture:** every count comes from gh#303's `lib.mjs` `EV` / `FINALISTS` / `PRIZES` (200 invited,
  196 joined, rounds 196->100->50->20->5; the five finalists carry the three NAME FIT worst cases). The
  generator refuses an impossible event (`assertEvent`, run at import and must-red'd).

## Decisions for the owner (owner popup 2026-11-16: D1 A ROW, D2 A ONE AT A TIME, E1 and C1 approved)

| Decision | Options (one line each) | Picked |
|---|---|---|
| D1 layout (shared, both boards) | A ROW: five equal objects on one baseline. B ARC: a shallow arc, centre nearest (lowest, largest), edges farther, ground shadows; type full size in both. | A ROW (owner popup 2026-11-16) |
| D2 reveal order (shared, both boards) | A ONE AT A TIME: no-prize objects first, prize 1 last, MC names each (~7s). B ALL AT ONCE: a drumroll then all five open/turn in one 600ms beat. | A ONE AT A TIME (owner popup 2026-11-16) |
| E1 envelope proposed copy (gh#317) | approve as it stands, or mark strings to change (board COPY SOURCES row). | approved as it stands 2026-11-16 |
| C1 card proposed copy (gh#318) | approve as it stands, or mark strings to change (board COPY SOURCES row). | approved as it stands 2026-11-16 |

D1 and D2 are independent: each board draws idle and result per layout (A/B) and reveal per layout x order
(4 frames), so the owner can pick a row with all-at-once or an arc with one-at-a-time. The reveal-order and
layout axes are the genuinely open ones; the rest are settled or execution choices, named here so they are not
silently re-opened:

- **The object's look is an execution choice, not a proposal** (every colour is a canvas value, sources in each
  board's VALUES row): envelope = #23214d body (gh#302 B picked surface) + #ffcc00 flap/bow/seal-edge
  (tokens.css --accent-gold); card back = the gh#303 PICKED hatch (#23214d/#2e2b63) + gold inset edge + 6px
  radius + a drawn gold star (never a suit); prize face = #ffffff + #c2185b label (gh#303 C2 PICKED) + #14142b
  type + gold ring; no-prize face = #23214d + #9a97c0. No new hue, font or size.
- **The turn is given by the tickets** ("the envelopes open", "the cards turn"): envelope flap lifts and the
  prize slot appears over the body; card rotateY to its face. Not re-proposed.
- **No casino styling** (gh#299 constraint): no felt, chips, money; the card back carries a star, never a suit;
  the face is a prize slot, never a rank. None of the seven words gh#299 bars (Constraints: Gambling wording)
  appears anywhere; the Thai scan checks raw and rendered. They are held as escapes in the scanners, never
  written out in a scanned file.

## Fork ruling (what is imported read-only, what is copied and changed)

Source commit: `1f575748a6c39b07a92d3a429fe8e8f8da2a60d3` (`git rev-parse HEAD` at build time).

- **Imported / run read-only from `../gh303-boards-2026-11-11/`:** `lib.mjs` (the event fixture, th/nm, the fit
  script, colour maths, SVG helpers, the tables, FONTS/ANNOT_CSS), `stage.mjs` (STAGE_CSS, top, plainResult,
  scaled/frame, STAGE_VALUES/PAIRS/DEVIATIONS), `grammar.mjs` (the closed authoring grammar, unchanged), and
  `thai-scan.mjs` (run as-is over these files). Nothing is written into that directory.
- **Copied and changed:** `roles.mjs` (the STAGE chrome rows are VERBATIM from gh#303; new rows for the name
  plate, envelope art, prize-slot name, card back/face, ground shadow; ONE table per board,
  `data-values-dir="AB"`, because pre-pick every option is held to the roles), `render-boards.mjs` (CDP port
  9666; these boards' EXPECT/FLOOR; PRE-PICK checks every A/B/F frame and reads every role table while
  `data-pick` is empty; clip/containment/overlap selectors extended for `.pcard/.fk/.fp/.sk/.sp/.slot`; the
  field-count matcher also reads `.open/.up/.prize`), `mustred.mjs` (plants target these boards; the event
  guard is still gh#303's `assertEvent`).
- **New:** `chrome.mjs` (the PRE-PICK board chrome: SRC, tag, copyRow, rulesRow, boardDoc — lib.mjs's versions
  stamp PICKED / COPY APPROVED and the gh#303 path, which an awaiting board must not claim), `shared.mjs` (the
  shared mechanic), `board-envelopes.mjs`, `board-cards318.mjs`, `make-boards.mjs`.

## Boards and render slices

| Board (slices) | Frame: slice |
|---|---|
| `Gh317Envelopes` (12) | banner + idle A 1; idle B + rv-one A 2; rv-all A + rv-one B 3; rv-all B + result A 4; result B + few 5; rm (2D path) + fallback 6; phone-320 + phone-390 + cap 7; row-640 + row-720 + row-845 8; tables 9-12 |
| `Gh318Cards` (13) | banner 1; idle A + B 2; rv-one A + rv-all A 3; rv-one B + rv-all B 4; result A + B 5; few + rm (2D path) 6; fallback 7; phone-320 + phone-390 + row-640 + row-720 8; row-845 9; tables 10-13 |

Renders are `<Board>-<n>.jpg` here, page heights 21624 / 21879 at 1600px wide (measured 2026-11-18). Projector
frames are authored 1920x1080 and shown at 75% (1440x810); the env-cap detail is authored 900x460 at 75%; the
phone and row frames are real pixels at their named widths. 17 frames on Gh317Envelopes (11 + phone-320/390,
cap, row-640/720/845), 16 on Gh318Cards (11 + phone-320/390, row-640/720/845). The rm and fallback frames are the
same gh#302 picked result view (they converge; see above). The pick frames (2026-11-18, gh#319): the phone
result reproduces Gh305AuditFrames frame 2 inside the demo chrome; env-cap draws the prize line at its two-line
cap (30px to the slot's 20px floor, the long name = the approved samples joined); the row frames draw the
free-name row in the plate-to-band gap at real pixels below the per-game scale threshold (0.52 envelopes /
0.65 cards = (44+8)/(NAMES_Y-PLATE_Y)), plate controls and band as stubs at their exact boxes.

## How the renders were made

Headless Chrome on CDP port **9666** (profile under `<tmp>`, torn down by the pid this run started) loaded each
board from `file://` at 1600px; after `document.fonts.ready` and the name-fit script each slice was captured on
its own clip (<=2000px, never cutting a frame) as JPEG q62. The 2026-11-18 re-render (gh#319) used CDP port
**9333** with its own `--user-data-dir`, per that run's brief; same flags otherwise. The slices were viewed: the envelope idle arc and
row, the flap-lift reveal (no-prize open, prize closed) and all-open, the envelope result, the card star backs
and white prize faces / night no-prize faces on both layouts, and the shared 2D result. Thai renders without
dotted circles; the NAME FIT worst cases (12 x W, 12 x U+0E12, 12 x U+0E12 U+0E33) draw on the plates and slots.

```
node make-boards.mjs                       # writes both boards; identical sha256 over two runs
SHOT_TMP=<tmp scratch> node render-boards.mjs ../../../../design/Gh317Envelopes.dc.html ../../../../design/Gh318Cards.dc.html
node ../gh303-boards-2026-11-11/thai-scan.mjs ../../../../design/Gh317Envelopes.dc.html ../../../../design/Gh318Cards.dc.html *.mjs README.md
node mustred.mjs <tmp scratch outside the repo> <repo root> <absolute path of this dir's render-boards.mjs>
```

Edit the generator (`make-boards.mjs`, `shared.mjs`, `chrome.mjs`, `roles.mjs`, `board-*.mjs`), never the boards.

## Verification (this run)

- **Determinism:** `node make-boards.mjs` twice -> identical sha256 (re-measured 2026-11-18 after the pick
  stamps and frames; `git status --porcelain` unchanged across the second run):
  `Gh317Envelopes.dc.html 03f850b3ed7b13ed8441ef8b00c8a83137cc83e90077a3725efb859ba0c7bf97`,
  `Gh318Cards.dc.html ab2810d5666fff12481387c20db5534d705635e436e0e9a96bf99fe702aed1b6`.
- **Render:** 0 problems on each board; 17 frames / 12 slices (Gh317Envelopes), 16 frames / 13 slices
  (Gh318Cards), 25 JPGs on disk matching the slice table. The 2026-11-16 render went RED first (42 problems on
  Gh317Envelopes, 20 on Gh318Cards: missing slot-text colour CSS, the star SVG spanning the card's padding box,
  and the class-less nowrap spans `th('ไม่มีรางวัล')` produces needing a descendant role selector); fixed, then
  green. The 2026-11-18 pick frames exposed a false green: the first render passed while the plate stubs lacked
  `position: absolute` under the `.tw` root (they stacked in flow, so the row could not overlap them) and the
  row-clearance must-red plant stayed GREEN — a plant that never reds proves nothing. Fixed in TW_CSS; the
  plant then reds on its own line (`name boxes overlap in F/env-row-640`) and the unplanted frames clear the
  plates by 8px at all three widths (measured: plate bottom 264, row top 272 at 640). The new slices were
  opened: Thai renders as words, nothing overlaps, the capped prize line takes two lines at 20px, the phone
  result's winner wraps at its 24px floor.
- **Thai scan:** clean (exit 0) on both boards, every `.mjs` here and this README; must-red: a banned word planted
  in a temp copy exits non-zero.
- **Must-red:** 28 plants + 2 controls, 0 unexpected, exit 0 (both controls green; every plant red on its own
  check's line; re-run 2026-11-18). The four new plants: phone-floor (`.pr .msg` 12px: `text under 16px in
  F/env-phone-320`), pill-floor (`.tw .np` 12px: `text under 16px in F/card-row-640`), row-clearance (`.prow`
  margin 0: `name boxes overlap in F/env-row-640`), cap-three-lines (the cap's fit floor raised to 30: `name
  breaks the NAME FIT rule ... in F/env-cap`). Table below.
- **No absolute paths:** `node scripts/evidence-local-path-check.mjs` (run from the repository root, with these files tracked) reports 0 hits for the two boards and this directory.

## Must-red

`mustred.mjs` feeds `assertEvent` two broken events (source side), then copies a board per plant into
`<tmp>/gh317-mr/<plant>-<board>/design/` (with `public/` linked), plants one fault and runs the render
(`CHECK_ONLY=1`). A plant counts only if the render exits 1 AND reports its own check's line.

| Check | Plant: its line |
|---|---|
| Event guard (source) | 1 invited: `196 joined but only 1 invited`; an outsider in round 2: `round 2 participants are not exactly the round 1 survivors` |
| Clip, NAME FIT, fit floor | plate 120px + nowrap: `clipped in A/env-idle`; slot name 10px: `fit below its floor in A/env-result`; plate wrap above floor: `name breaks the NAME FIT rule` |
| Fonts, console, matrix, overflow | broken Sarabun 700: `font Sarabun 700 error`; a `throw`: `console: exception Error: planted`; renamed frame: `frame F/env-few found 0 times`; a 1700px block: `page scrolls sideways` |
| Text floor at rendered size | `.lk` 24px: `@24.0px rendered`; `.gname` 50px at `scale(0.5)`: `25.0px rendered (50px x 0.50)`; the real-pixel `.pr` / `.tw` frames are judged at the 16px mobile minimum (the gh305 audit probe's phone branch), every `.pj` frame at 30px: `.pr .msg` 12px: `text under 16px in F/env-phone-320`; `.tw .np` 12px: `text under 16px in F/card-row-640` |
| The pick frames (2026-11-18) | row margin 0: `name boxes overlap in F/env-row-640` (the row-vs-plate clearance is a judged invariant, `.np` in the overlap/containment selectors); the cap's floor raised to 30px: `name breaks the NAME FIT rule ... in F/env-cap` |
| Field counts | `5/3` on rv-one: `field count in A/env-rv-one`; `5/1` on card idle: `field count in A/card-idle` |
| Values by role, exclusive | `#00ff00` game name: `(role: gold figures)`; card face `#23214d`: `(role: card face with a prize)`; gold label on white: `(role: prize label on a face)` |
| Grammar | a `<use>`: `element <use> is outside the grammar`; `fill-opacity: 0.5`: `computes fill-opacity 0.5`; `::before` content: `carries content`; a `<template>`: `<template> element(s)` |
| Containment, overlap | card 1px tall: `outside its parent or a clipping ancestor`; plates at one x: `name boxes overlap` |
| Rendered text | a barred word split by a `<span>`: `barred word U+E2B U+E27 U+E22`; a hex reference to U+0644: `foreign letter/mark/invisible U+0644` |

**Inherited, not counted:** each board logs one `ERR_FILE_NOT_FOUND` for `design/support.js`, which the canvas
tool supplies. **Design input:** ui-ux-pro-max 2.5.0 (ux), queried 2026-11-16, listed in each board's RULES
CHECKED row (Duration Timing, Easing, Excessive Motion, Reduced Motion, Color Only, Color Contrast / size for
distance); rules taken, never its palette or fonts.

## Not covered

- A real projector, room or venue frame rate; the 3D motion itself (the frames are 2D stills of the 3D intent).
- The phone's own join/card/claim screens and the QR-mode final code card (gh#302 / gh#305 / gh#309, built).
- How the MC places the picks (a setup-page control, gh#302's board).
- Type by role beyond paint: roles own paint; type is held by the floors and the grammar's value shapes.

## `design/canvas.json` entries (orchestrator-owned; not written here)

The page-15 entries exist with APPROVED 2026-11-16 titles (D1 A ROW, D2 A ONE AT A TIME). Their heights predate
the 2026-11-18 pick frames and are stale: the boards now measure 21624 (Gh317Envelopes) and 21879 (Gh318Cards)
at 1600px wide; page-14's Gh315Zones / Gh316Marbles measure 29331 / 21127 after the stamps. The orchestrator
re-measures and updates the artboard boxes; this directory only reports the numbers.
