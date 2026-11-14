# UI audit, 2026-11-14 — gh#309 (phone result screens, projector code card), the ui-ux-pro-max rule set on the built screens

gh#309's definition of done asks for this audit at the widths the page serves (projector, and 320 where a
phone uses it). This is step 1 (audit) only. Every row is a finding plus a disposition, never a choice.
After the owner picks, the order is canvas first, then code (ADR-0033). Nothing was fixed here: no source
edit, no build, no browser run. Machine-readable rows: `findings.json`. Instrument: `contrast309.py.txt`.
Its output: `readings309.txt`.

## Method

Same method as `../ui-audit-2026-11-13-prize-draw/`.

- **Rules:** the skill's quick reference, plugin 2.13.0, `templates/base/quick-reference.md` (sha1
  `6420ccaf…`, the same file the 2026-11-13 audit used). Priorities 1, 2, 5, 6, 7 and 8. Rules only, never
  its palette or fonts. Design values come from the picked boards and `src/styles/tokens.css` (ADR-0033).
- **Input:** screenshots already taken, nothing new rendered.
  - `../gh309-browser-2026-11-14/shots/`: 22 phone screens at 320x568 and 375x667, the projector code card
    (`row4-c1..c5`) and the result (`row3`) at 1920x1080 and 320x568. Every shot is viewport-only.
  - That directory's `phones309.json` and `walk309.json` give computed sizes, tap boxes and overflow.
  - All 22 phone shots, `row3-*`, `row4-c1-*`, `row4-c5-*`, `row4-c3-1920` and `row4-c4-320` were opened.
  - Not opened, and cited by nothing: `row4-c2-1920`, `row4-c2-320`, `row4-c3-320`, `row4-c4-1920`,
    `seed-after-start`.
  - `../gh310-rehearsal-2026-11-14/shots/` is used once (PD-309-04) and labelled where used. It is a later
    build at 390pt on the iOS Simulator, outside the audited widths.
- **Contrast:** painted pixels, not CSS. The `text_read` in `contrast309.py.txt` takes a crop box. The most
  common pixel is the ground. The text is the 99.5th-percentile pixel by contrast against that ground.
  Ratio is the WCAG 2.x luminance formula. A non-text fill uses `solid_read`: the mode colour of the fill
  against the mode of the ground.
  - **Must-red:** the 2026-11-13 audit's own disabled `+` stepper in
    `../gh305-recheck-2026-11-13/shots/game-prize-draw-1280-picker.png` reads **2.31:1** (`#aaa9af` on
    `#fffefc`), equal to that audit's reading. Two extra reds of my own: the veiled event name under the
    code card reads 1.77, and the veiled count `16` reads 1.97.
  - **Positive control:** the painted reads equal the formula on the token pairs the shots paint.
    - Ink on gold: 11.93.
    - White on `#23214d`: 15.04.
    - `#d9d6f0` on `#23214d`: 10.62.
    - Ink on cream: 16.75.
    - Thin text, `#3d3b5c` on cream at 16px: 9.86. It did not under-read.
- **Type size:** glyph boxes against a known size in the same build.
  - The 1920 card paints at 0.948 and the 320 card is unscaled.
  - **Mitr digits:** the 9-digit code (180px, painted 170.6) is 121px tall, so height / size = 0.709. Every
    other Mitr reading predicts its declared size within 2px: 12-digit 142.4 vs 142.2, earlier codes 43.7 vs
    41.7 (the widest miss, 2.0px, about 1.4 glyph rows), 320 final 32.4 vs 32, 26 → 25.4, 18 → 18.3. On the
    phone, the heading digit reads 25.4 (declared 26) and the field digits 29.6 (declared 30).
  - **Sarabun 400 base band:** two knowns, the hint at 34px x 0.948 and at 18px, give 0.589 and 0.611. The
    phone's 16px notes read a 9px band, which predicts 15.0px. At this size one pixel row is about 1.7px, so
    this agrees with the probe's computed 16px; it is not a fail.
- **Boards:** read as text, never rendered: VALUES, NOTES, caption and COPY rows.
  - `design/Gh302Phone.dc.html` direction A: frames reveal-code, reveal-wrong, reveal-pass, reveal-out,
    reveal-card, claim-320, reveal-code-card.
  - `design/Gh302Projector.dc.html` direction B: proj-code and proj-code-card.
  - `design/Gh305AuditFrames.dc.html` frame 4: `g309-code-earlier-1920` and `-320`.
- **Pick record:**
  - Gh302Phone A and Gh302Projector B carry "PICKED 2026-11-11" stamps.
  - Gh305AuditFrames carries no PICKED stamp.
  - Frame 4 states the owner ruling of 2026-11-14 for the earlier-codes list, but its sizes are NEW VALUE
    rows. It was uncommitted at shot time and is committed in `c09df28`. It is the comparison the ticket
    names, never a `fix-here` source.
- **Tickets read for rulings:**
  - gh#299: body and its three comments.
  - gh#300: body and its one comment.
  - gh#309: body; it has no comments.
- **Disposition rules:**
  - `fix-here` only when a PICKED frame states the value in words.
  - Otherwise `owner-pick` with concrete options. New wording is `[copy: owner]`, never drafted here.
  - Options that need a drawn value are marked `[canvas]`.

## Build under test

- The shot build is **not on disk**. `dist/` was rebuilt at 17:51:33, after the shots (17:50:07 file times),
  from a dirty tree: `5b0c901` plus uncommitted `src/` edits. HEAD at audit time is `c09df28`, which carries
  both fixes below.
- **Fix 1** renders the rule through `pd-eru` in `src/play/_prize-reveal/reveal.ts` and `reveal.css`, both
  dated 17:40:30. The shot cards show no rule, so the shot build predates 17:40.
- **Fix 2**, the polling stop, is in `src/prize-join/join-page.ts`, dated 17:58:26.

**The two fixes after the shots, and what they could change:**

1. **The earlier-codes list now shows each card round's drawn rule; at 320 it wraps under its code.**
   - What frame 4 states: the width fit at 320 (the rule takes its own line) and the height at 1920 ("the
     card still ends above 1080"). Its own note says the frame was never rendered and measured.
   - The 320 height after the new line is my inference. The 4-round card measured 72..404 of 568 before the
     line, and each card round adds at most one 16px line, four at most.
   - The rule text's size, contrast and wrap are not measured (not in this input).
   - It bears on PD-309-02: a latecomer now sees the rule. A live tap is still final.
   - It bears on PD-309-11: the final's code still never reappears.
   - No finding's evidence changes.
2. **Status polling stops at the first typed character.**
   - PD-309-05: more phones stay provisional for the event.
   - PD-309-06: a removed person who typed before the answer never reaches the removed screen.

## Totals

| Ticket | critical | major | minor | fix-here | owner-pick |
|---|---|---|---|---|---|
| gh#309 | 0 | 2 | 11 | 1 | 12 |

Severity (my reading of the rule, not a pick, same scale as 2026-11-13):
- **critical:** a tap lands on something other than what it aimed at, or a task's essential information is
  unreadable at a served width.
- **major:** the rule fails and the task degrades, but a workaround exists.
- **minor:** polish, or a cost no larger than a reload that resumes.

## Findings

Shots are in `../gh309-browser-2026-11-14/shots/` unless named otherwise. Source is cited by symbol.

| id | page | width | sev | rule | disposition | evidence |
|---|---|---|---|---|---|---|
| PD-309-01 | join, card screen | 320 (375 passes) | major | content-priority, touch-density | owner-pick | `row1-card-320`, `row1-card-375` |
| PD-309-02 | join, card screen and result | 320, 375 | major | confirmation-dialogs, undo-support, error-recovery | owner-pick | `row1-card-320`, `row1-in-320`, `row1-out-320/375`; `chooseRule`, `renderFlow` |
| PD-309-03 | join, every screen swap | 320 (375 if scrolled) | minor | continuity, content-priority | owner-pick | `row1-in-320/375`, `row1-provisional-320/375`; probe `phones.mjs.txt`; `frame` |
| PD-309-04 | join, pass screen | 320, 375 | minor | content-priority, whitespace-balance | owner-pick | `row1-in-320/375`; gh310 `phone-4-pass-r4-to-final` |
| PD-309-05 | join, provisional note | 320, 375 | minor | visual-hierarchy, content-priority | owner-pick | `row1-provisional-320/375`, `row1-in-375`; `renderFlow` |
| PD-309-06 | join, removed screen | 320, 375 | minor | error-recovery, error-clarity | owner-pick | `row1-removed-320/375` |
| PD-309-07 | join heading and note; play result claim line | 320 | minor | heading-line-balance, line-length-control | owner-pick | `row1-removed-320`, `row1-slot0/1/2-320`, `row3-projector-result-320` |
| PD-309-08 | join, header band and claim | 320, 375 | minor | content-priority; board deviation | owner-pick | `row1-codeEntry-320`, `row1-slot0-320/375`; `frame`, `REVEAL_COPY.prize` |
| PD-309-09 | join, round-code field | 320, 375 | minor | board deviation (no quick-reference rule) | **fix-here** | `row1-wrongCode-320/375`, `row4-c1-1920`; `codeForm` |
| PD-309-10 | play, code card MC controls | 1920, 320 | minor | escape-routes, confirmation-dialogs, destructive-emphasis | owner-pick | `row4-c1-1920`, `row4-c5-1920`, `row4-c1-320`, `row4-c5-320`; PlayExit |
| PD-309-11 | play, after the card closes | 1920, 320 | minor | error-recovery, escape-routes | owner-pick | `row3-projector-result-1920/320`, `row4-c5-1920`; `codeClosed`, `control` |
| PD-309-12 | join, final out (places past the prizes) | 320, 375 | minor | error-clarity, content-priority | owner-pick | `row1-slot3-320/375`, `row1-slot4-320/375` |
| PD-309-13 | join, every screen swap (source only) | 320, 375 | minor | voiceover-sr, contextual-live-badge-updates, focus-management | owner-pick | `frame`, `renderFlow` |

### PD-309-01 · major · the second rule is below the fold at 320
- Measured down x=40 in `row1-card-320`: button 2's border starts at row 557. Only 11 of its 52px show
  above the 568 fold, and its label is hidden.
- At 375 both buttons fit; button 2 ends at row 613 of 667.
- The person must scroll even to learn that a second rule exists, while the visible first button invites the
  tap. With PD-309-02, a wrong tap is final.
- Board: reveal-card A draws no rule buttons. The owner ruling of 2026-11-14 ("gh#300 condition 4" in the
  source) replaced its note with "แตะกติกาที่จอใหญ่เปิด" and the two buttons, so no board draws this layout.
- Options:
  - (a) The two rule buttons side by side at 320, 52px tall, saving one row `[canvas]`.
  - (b) A smaller playing card at 320 `[canvas]`; the card size is the board's.
  - (c) Keep it, with the 11px edge as the scroll cue.

### PD-309-02 · major · the rule tap is final and never shown again
- `chooseRule` accepts a tap only while the card screen is up. The choice is stored with the round's code in
  localStorage.
- No later screen names the rule tapped, and none offers a change. A wrong tap shows the wrong fate. A wrong
  out ends the phone's flow, because the out screen has no form.
- Degraded task: learning one's own result. Workaround: the main screen, which stays the authority; the
  claim is matched against it.
- Ruling: the tap is decision 13's stated cost, "the person taps which rule came out" (gh#299, last comment).
- No ruling on undo or confirmation was found in the tickets listed under Method, the source comments or the
  ADRs.
- Options:
  - (a) Keep: one tap, final.
  - (b) The result screen names the rule tapped, with a control to change it while the next code is still
    untyped `[copy: owner]` `[canvas]`.
  - (c) A confirm step after the tap that names the rule `[copy: owner]` `[canvas]`.

### PD-309-03 · minor · a screen swap keeps the scroll offset
- `row1-in-320` opens about 69px down: no header band, and the badge's first ink is at row 7 against 76 in
  `row1-in-375`. `row1-provisional-375` shows 39 of the 48px band.
- Attribution: the probe centred the rule button (`scrollIntoView({block:'center'})`) before tapping, so the
  offsets' size is the harness's. The page's part is that nothing under `src/prize-join/` resets scroll;
  `frame` replaces the body in place.
- At 320 a person must scroll to reach the second rule (PD-309-01). The pass or out screen then opens with
  the header band and name pill above the viewport.
- Options:
  - (a) Keep.
  - (b) Every screen swap starts at the page top.
  - (c) Scroll only when the new heading would sit above the viewport.

### PD-309-04 · minor · two lines ask for the same wait
- Under the heading: "ไปต่อรอบที่ 2 รอรหัสรอบถัดไปบนจอใหญ่". This is `REVEAL_COPY.passSub`, owner copy of
  2026-11-14, which replaced the board's head count because no code carries it.
- Under the name card: the board's "รอรหัสรอบถัดไปจากจอใหญ่".
- The gh310 rehearsal shot (390pt, later build) shows the same pair before the final, starting
  "ไปต่อรอบชิง".
- Each line is approved, but the board never drew them together.
- Options:
  - (a) Keep both.
  - (b) passSub keeps only its first clause, the next round's name `[copy: owner]`.
  - (c) Drop the board's wait note on the pass screen; the code form under it already asks for the code.

### PD-309-05 · minor · the provisional caveat comes last
- "ยังไม่ยืนยันชื่อ ผลจริงดูที่จอใหญ่" is appended after the form (`renderFlow`), under the button. It is in
  the same 16px `#3d3b5c` as every note (9.86:1).
- On the unscrolled pass screen (`row1-in-375`, down x=40) the screen's own button starts at row 568.
  `row1-in-320` breaks the same lines, so at 320 at the page top both the button and this note sit below
  the 568 fold.
- The board does not draw it (owner answer of 2026-11-14). Since the polling fix, more phones show it.
- Options:
  - (a) Keep.
  - (b) Move it under the heading, in the sub line's slot.
  - (c) The same move, set in Sarabun 700 (the error row's weight, without its icon).

### PD-309-06 · minor · the removed screen has no next step
- The heading "ผู้จัดนำชื่อนี้ออกจากรายชื่อแล้ว" (owner-approved, gh#308 `ANSWER_COPY.removed`) states the
  removal and stops.
- The card under it is labelled "ชื่อของคุณบนจอ" for a name no longer on the screen.
- Options:
  - (a) Keep.
  - (b) Drop the name card on this screen.
  - (c) Add a next-step line pointing to the organiser `[copy: owner]`.

### PD-309-07 · minor · Thai breaks split compounds at 320
- The removed h1 breaks "…ออกจากราย / ชื่อแล้ว": a long line over a short one.
- The claim note breaks "…บนจอ / ใหญ่", leaving one word on line 2 (`row1-slot0/1/2-320`).
- The projector claim line breaks "…ให้ทีม / งานดู…" (`row3-projector-result-320`).
- Each fits one line at 375 and 1920.
- Options:
  - (a) Keep the browser's breaks.
  - (b) `text-wrap: balance` on the phone heading and `pretty` on notes (progressive; the browser decides).
  - (c) Keep the three named compounds whole with one no-wrap span each. This is targeted, not blanket
    non-breaking spaces.

### PD-309-08 · minor · the phone has no event name and no prize name
- Gh302Phone A draws the event name in the header band and the prize name on the prize card
  ("รางวัลที่ 2 · จักรยานไฟฟ้า").
- The build shows the pill alone and "รางวัลที่ 1". Source says why: `frame` notes the join route returns no
  title, and `REVEAL_COPY.prize` notes the phone knows its place, never the prize's name.
- Both are MC-typed data, so this is a data gap, not copy.
- Options:
  - (a) Keep both absent; the projector shows both.
  - (b) The join or status answer carries the event name and the prize names, which are both set before the
    start. That is a server change, with no new call.
  - (c) The event name only.

### PD-309-09 · minor · fix-here · typed digits are not grouped
- `row1-wrongCode-320` shows "111111111". The board's reveal-wrong draws "482 915 370", and the projector
  groups every code.
- `codeForm` only switches the size class past 9 digits; nothing inserts the group spaces. A mistype is
  caught by the check digit, so the cost is a retype.
- No test, comment, ADR or ticket read gives a reason for the raw field.
- **Value sources:**
  - 12 digits: Gh302Phone reveal-code-card caption (PICKED): "grouped 4-4-4 like the projector… the field
    shows them at 26px with 1px letter spacing so the three groups stay apart". The 26px size is already
    built.
  - 9 digits: the reveal-code and reveal-wrong A field values, and Gh302Projector "grouped 3-3-3".
- The final's 7-digit code has no picked phone value (frame 4's 4-3 is a NEW VALUE row), so it stays
  ungrouped unless the owner extends 4-3.
- `normaliseDigits` skips spaces and hyphens, so a grouped value parses; the fix's own test confirms it.

### PD-309-10 · minor · the exit ✕ sits beside an open code card
- With the card open, the band's ✕ (the play exit, aria "ออกจากเกม") sits at 6/6, where a modal's close
  usually is. The card's real close, `ตกลง`, is at the band's other end.
- The ✕ paints `#ffffff` under the card: full opacity, not its disabled 0.55 look. That is read from paint,
  not from a click. It leaves for the home page with no confirm.
- Owner rulings: one exit in the same corner on every play route (gh#143, gh#144); not a leave-confirm
  (PlayExit's header); the 56px band (gh#268, PlayTopBand B).
- Cost: the room sees the home page, and returning resumes the stored step, so this is minor.
- Options:
  - (a) Keep; the rulings stand.
  - (b) The ✕ takes its existing disabled look while a code card is up.
  - (c) A `ตกลง` inside the card under the hint `[canvas]`.

### PD-309-11 · minor · a closed code card cannot come back
- `codeClosed` is held in memory and nothing reopens the card. `control` returns no button on the final's
  result.
- A round code returns in the next card's earlier list. The final's 7-digit code never does, so a finalist
  who had not typed it gets no claim screen.
- For the final, this falls short of the condition that phones enter every code in order and the main
  screen keeps earlier codes visible (gh#299 last comment; frame 4 calls it gh#300 condition 1).
- A reload reopens the card: **inferred**. The flag is memory-only, and the gh309 pass shows the card open
  after each reload (`row4-c5`). Nobody closed a card and then reloaded.
- Staff still match winners on the projector.
- Cost: a reload that resumes, so this is minor.
- Options:
  - (a) Keep.
  - (b) A control in the band that shows the closed code again `[copy: owner]` `[canvas]`.
  - (c) The result screen keeps the final's code in small type `[canvas]`.

### PD-309-12 · minor · the final's out line says to cheer the ones left
- Places 4 and 5 read "รอบชิง ไม่ผ่าน" and then "ขอบคุณที่ร่วมสนุก เชียร์คนที่เหลือต่อได้เลย". After the last
  round, no one is left to cheer.
- The board approved that line for round 1 and does not draw the final on the phone (Gh302Phone NOTES).
- Options:
  - (a) Keep.
  - (b) A final-only second line `[copy: owner]`.
  - (c) On the final, the heading alone.

### PD-309-13 · minor · a verdict is not announced (read from source, not rendered)
- `frame` replaces the body with no live region, and `renderFlow` moves no focus. A screen-reader user who
  presses `ดูผลของฉัน` or a rule button loses focus with the button and hears no verdict.
- Field errors are announced: role=alert, aria-invalid and aria-describedby.
- Options:
  - (a) Keep.
  - (b) Focus moves to the new heading after each swap (tabindex -1).
  - (c) A polite live region carries the new heading.

## Measured passes

**Contrast, painted (`readings309.txt`):**
- Phone:
  - Ink on cream: 16.75 (headings, labels, error words, caption).
  - `#3d3b5c` on cream: 9.86 (subs, notes, prompt, claim note, provisional).
  - Ink on gold: 11.93 (button, pill, prize card).
  - Ink on white: 18.03 (typed digits, name card).
  - Card red `#c2185b` on white: 5.87 (rank and suit).
- Projector, 1920 and 320:
  - Card label and earlier labels: 10.62.
  - Gold digits and earlier codes: 9.95.
  - Hint: 15.04.
  - `ตกลง`: 11.93.
  - Result claim line: 10.77 / 10.80.
- Non-text: the error outline and icon disc `#ff3d7f` on cream read 3.13, exactly at the 3:1 floor.

**Touch:**
- Phone fields are 64px and buttons 52px (probe).
- The rule buttons are 18px apart box to box, 13px of it visible (measured at 375).
- Projector: `ตกลง` is 120x52 and the ✕ is 44x44, the 44px floor.

**Layout:**
- No sideways scroll and 0 boxes past the viewport on all 22 phone screens and every code card (probe).
- Smallest computed phone text is 16px (probe); the glyph boxes agree within one row.

**Code card against frame 4:**
- Label 44/22, digits 180 (12 digits: 150) / 32 (26), hint 34/18, earlier list 30/30/44 / 18/16/18 (probe
  row 4).
- The Mitr glyph boxes agree within 2px, and the painted colours equal the tokens.

**Forms:**
- The error sits under its field, with icon plus words plus outline, so it is not colour alone.
- role=alert, aria-invalid and aria-describedby are set.
- There is a visible label with `for`, plus `inputmode=numeric` and `enterkeyhint=go` (source).

## Deviations from the picked boards

| Where | Build | Board | Verdict |
|---|---|---|---|
| Header band | the name pill only | event name plus pill | PD-309-08 |
| Card screen | "แตะกติกาที่จอใหญ่เปิด" plus two rule buttons | wait-for-rule note, no buttons | owner ruling 2026-11-14; PD-309-01, PD-309-02 |
| Pass detail | `passSub` | "ไปต่อรอบที่ 2 เหลือ 100 คน" | owner copy 2026-11-14; PD-309-04 |
| Prize card | "รางวัลที่ 1" (place only) | place plus prize name | PD-309-08 |
| Typed code | one run of digits | grouped | PD-309-09 |
| Earlier list (projector) | no rule (shot build) | frame 4 draws the rule | fixed after the shots; not a deviation; unmeasured |
| ✕ and `ตกลง` over the card | band corners | no board draws MC controls | PD-309-10 |

## Not covered (not in this audit's input, so none of these is a pass)

- A 12-digit code typed in the phone field at 320 or 375.
- The worst-case names (W x12, ฒำ x12) on any reveal-flow screen.
- Places 2 and 3 at 375.
- Pass screens for rounds 2–4 and the final-code form at the audited widths. gh310 shows one at 390pt on a
  later build.
- The rule text in the earlier list, at any width. gh310's 1024 JPEG is 400x300, too small for pixel reads.
- Focus-ring rendering, keyboard order, screen-reader output (PD-309-13 is source-read), the reveal's fade
  and reduced motion, hover.
- Real phones, Safari on iOS at 320/375, a real projector, projector widths other than 1920 and 320.
- The cards round's 3D deal and reveal frames.
- Copy against the boards' COPY rows, except where a finding cites it.
