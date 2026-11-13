# UI audit, 2026-11-13 — prize draw (gh#305, gh#306, gh#307, gh#308), the ui-ux-pro-max rule set on the built screens

Each ticket's definition of done asks for this audit. This is step 1 (audit) only. Every row is a finding
plus a disposition, never a choice. Order after the owner picks: canvas first, then code (ADR-0033).
Nothing was fixed here: no source edit, no build, no browser run.

Per-ticket files: `gh305.md` (fireworks, the shared host and projector route, the setup game picker, the
demo pages), `gh306.md` (cards), `gh307.md` (ladder), `gh308.md` (the phone join page). Machine-readable:
`findings.json`.

## Method

- Rules: the skill's quick reference (plugin 2.13.0, `templates/base/quick-reference.md`), priorities 1, 2,
  5, 6, 7, 8. Rules only, never its palette or fonts: design values come from the picked boards and
  `src/styles/tokens.css` (ADR-0033; the owner's ruling that canvas values win).
- Input: screenshots already taken, nothing new rendered.
  - `../gh305-recheck-2026-11-13/shots/` (144 PNG, real-GPU Chrome, named `<route>-<width>-<state>.png`).
  - `../gh305-playthrough-2026-11-13/` (the earlier playthrough, an older `dist/`; used only where it
    shows something the recheck does not, and labelled as such).
  - Every screenshot a finding cites was opened for this audit.
- Contrast: painted pixels, not CSS. For a crop box, the most common pixel is the ground and the 99.5th
  percentile pixel by contrast against it is the text. Ratio is the WCAG 2.x luminance formula.
  - Positive control: the pixel reads equal the formula on the token pairs they paint. Ink `#14142b` on
    gold `#ffcc00` is 11.93 both ways, white on `#23214d` is 15.04 both ways, and `#d9d6f0` on
    `#23214d` is 10.62 / 10.95 (painted ground `#211f48`).
  - Must-red: the setup page's disabled `+` stepper (opacity 0.4) reads **2.31:1** (painted
    `#aaa9af` on `#fffefc`) in `game-prize-draw-1280-picker.png`. The detector can fail a pair.
- Type size: glyph boxes measured from pixels and compared against a known size in the same build. The 20px
  2D name chip at the 0.948 projector scale paints digits 14px tall. Where code sets the size, the arithmetic
  is shown next to the reading.
- Board comparison: the boards were read as text, never rendered (no browser in this step). Where a board
  value is cited, the board says it in words in its VALUES, NOTES, or caption rows.
- Pick record:
  - Gh302 and Gh303 boards carry their own PICKED stamps.
  - `design/Gh305GamePick.dc.html` and `design/Gh314Frames.dc.html` still open with "AWAITING THE OWNER'S
    PICKS".
  - Their picks are taken from the build's own comments (Gh305GamePick 1a A, 1b A, i2 B, i3 B) and
    from the gh#314 commit message (1a-1e B, 2 B, 3 C, 4 A, 5 B). Neither ticket has a comment that
    records them.

## Build under test

- Measured: `dist/index.html` and `dist/game/prize-draw/play/index.html` are 2026-11-13 14:02:40. The
  recheck shots are 14:29-14:30. HEAD is `1b4fb7530a3754ef7348c83d79cdd1bdcbec1df9`, and the tree
  carried uncommitted `src/` edits at build time, so HEAD alone does not identify the build.
- **After the shots:**
  - `src/play/prize-draw/play.css` and `src/play/prize-draw/stage.ts` changed at 14:36. A new
    `src/play/prize-draw/lanes-phone.test.mjs` was added.
  - The built CSS (`dist/_astro/play.CF_nYhBz.css`) holds 0 `data-lanes` rules. The working tree holds a
    whole `data-lanes` phone layout.
  - So the 320 lane-pick finding (gh307 PD-307-01) is about the built code. The later edit is unbuilt and
    unseen.

## Totals

| Ticket | critical | major | minor | fix-here | owner-pick |
|---|---|---|---|---|---|
| gh#305 | 0 | 5 | 1 | 0 | 6 |
| gh#306 | 0 | 2 | 2 | 1 | 3 |
| gh#307 | 1 | 1 | 2 | 0 | 4 |
| gh#308 | 0 | 1 | 1 | 0 | 2 |
| **All** | **1** | **9** | **6** | **1** | **15** |

Severity (my reading of the rule, not a pick):
- **critical**: a tap lands on something other than what it aimed at, or a task's essential information
  is unreadable at a width the ticket serves.
- **major**: the rule fails and the task degrades, but a workaround exists.
- **minor**: polish.

The single critical: **PD-307-01**. At 320 the ladder's finalist name buttons sit on top of lane controls 2
and 3, so a tap aimed at a lane can assign a name to the wrong lane. The lane plates paint at about 5px.

## Cross-ticket classes (counted once per ticket, on the ticket whose screen it is)

- **Phone width, scaled frame.** i5-phone B (picked) gives the 2D round screens a phone layout. The 3D
  reveals and the result screen still draw the whole 1920 frame scaled to about 0.17 (names 3-5px):
  PD-305-04, PD-305-05, PD-306-02, PD-307-02. No board draws a 3D reveal or a result at phone width.
- **Name field reflows at each 2D/3D handoff.** The column count changes when the scene takes over and
  again when it hands back: PD-305-06 (10→8→10), PD-306-04 (10→6→10). The boards draw it that way, so this
  is owner-pick, not a defect claim.
- **Demo pages (shared `demo.ts`), filed once under gh#305:** the demo bar collides with the game name at
  1920 (PD-305-02), and covers the frame at 320 (PD-305-03). The demo module's own comment says no board
  draws this page.

## Passes (measured on the shots named in the ticket files)

- Contrast, every pair on the projector screens: gold on ink, ink on gold, white on raised night, soft
  text, dim struck names (5.5-6.3:1), red suits `#c2185b` on white 5.87:1 (Gh303Cards C2), setup hint and
  labels (7.9-16.7:1).
- Touch targets: MC button and name buttons 52px, setup game buttons 52px with 8px stacked gap at 320,
  join controls 52px (declared in CSS).
- Reduced motion: the playthrough's scenario 6a, no canvas and no GL context.
- No sideways scroll at 320 (playthrough scenario 8).
- Focus rings are declared on every new control (setup `.segb`, projector `.pd-go`/`.pd-name`/`.pd-lane`,
  join `.pj-inp`/`.pj-btn`). They are declared, not rendered.

## Not covered, so none of these is a pass

- **gh#308:**
  - Every join screen except "event not found": PIN, name, name-taken, joined-device, and the eight
    answer messages were never rendered (no real event was driven).
  - The QR on the main screen is not built yet, so the projector side of QR join has nothing to audit.
- Focus-ring rendering, keyboard order, screen-reader output, hover states.
- Real projector, real phone, Safari/iOS. Widths 375/390 on the projector.
- `game-prize-draw-1920-cards-picker-halving.png` shows empty cream ground (the capture scrolled past the
  picker). The enabled-cards state at 1920 is therefore unseen; the 1280 shot stands in.
- The cards demo was dealt but never revealed at 200 names. The fireworks-final variant was seen only in the
  older playthrough's shots.
- Copy: Thai strings were not checked against the boards' COPY rows except where a finding cites them.
- Carried in from gh#304 and outside these tickets: the cold no-event screen, and the category card
  (`c-company-party-*`).
