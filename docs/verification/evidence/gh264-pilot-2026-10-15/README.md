# gh#264 pilot verification, 2026-10-15

Build: `npm run build` in the worktree at 03e0e0d (on 50ee6e8, on aabffea), served by `npx serve dist/`.
Browser: headless Chrome 155, real CDP touch events (`Input.dispatchTouchEvent`), typed text by `Input.insertText`,
true viewport emulation (`Emulation.setDeviceMetricsOverride`, mobile). Every snapshot asserts `innerWidth` and
`scrollWidth`: 390/390 and 320/320 in all runs (no horizontal overflow). Storage wiped on-origin between scenarios.
Drivers: `driver/` (lib.mjs + s1..s7). Raw JSON: `raw/`. (The 390 run of s5 was read from stdout, not saved; the
320 run is in raw/.)

## Results

1. Fresh visit, timebomb, PASS at 390 and 320. Stepper reads 4; rows แมวส้ม, ชิบะ, บันนี่, ฟร็อกกี้ in order.
   Taps on −: stops at 2 (− disabled, 2 rows). Taps on +: stops at 10 (+ disabled, 10 rows). Manifest range is [2,10].
   Renamed row 2 to ชิบะตัวแสบ by typing. Storage before start: roster null, group null. After start (one tap):
   roster = group = ["แมวส้ม","ชิบะตัวแสบ","บันนี่","ฟร็อกกี้"], legacy key absent, stage visible, no console errors.
   Shots: tb-first-*, tb-first-min-*, tb-first-max-*, tb-first-renamed-*, tb-round-*.
2. Return visit, PASS at 390 and 320. Reload gives saved mode: no stepper, ticks, ×, "+ เพิ่มคน", line "เล่นรอบนี้ 4 คน".
   Unticking 3 of 4: start disabled, line "เลือกอย่างน้อย 2 คน", a tap on start does nothing. Start is one tap.
   × on a row: row leaves at once, bar "เอา ชิบะตัวแสบ ออกจากวงแล้ว" + เลิกทำ shows. Undo (tapped after 1 s) restores
   the row at its own index; storage unchanged. × again and wait: bar gone at 4142 ms (390) / 4144 ms (320) after the
   tap (polled every 150 ms), row gone.
   WHEN STORAGE CHANGES: never on ×, undo or expiry (polled every ~150 ms for 5.2 s, roster identical to the
   original throughout). It changes only on the start tap: roster and group became ["แมวส้ม","บันนี่","ฟร็อกกี้"]
   within 100 ms of that tap. So a removed name returns on reload if the player leaves without pressing start.
   Observation (arm gate, not a defect): right after a × or an undo, every button on the surface including the undo
   bar itself and the next × is inert for the ~400 ms window. A fast undo inside it is ignored.
3. Mid-round edit, timebomb, PASS at 390 and 320. Pressed the engine's own start so the fuse burns
   (`#tb-fuse`), then the top-chrome edit pill: dialog open with "เปลี่ยนผู้เล่นตอนนี้?" / "รอบที่เล่นอยู่จะจบลงทันที
   แล้วเริ่มรอบใหม่กับวงที่แก้แล้ว" / "เล่นรอบนี้ต่อ" / "จบรอบ แล้วแก้ผู้เล่น". Cancel: fuse still on, screen closed.
   Confirm: round ends, shared screen opens in place (no reload); start gives a fresh round (engine start button back).
   Quick second tap, measured: after cancel, a touch on the pill 0-80 ms later left no dialog and the round running;
   the same pill tapped 900 ms later opened the dialog (positive control). After confirm, a touch on start 29-47 ms
   later left start disabled and the screen open, no round; start works after the window.
   Observation: pressed during the pass-the-device interstitial (before the fuse, `#tb-start` showing), the pill opens
   the shared screen with NO confirm (roundActive() is fuse-only). Nothing is lost there; flag only if the owner reads
   ADR ruling 6 as covering the interstitial.
4. Carry-over, PASS at 390 and 320. Roster saved by timebomb (ไก่ชน, ชิบะ, บันนี่, ฟร็อกกี้) opens on cursed-number
   pre-filled and ticked, "เล่นรอบนี้ 4 คน". Added to 20 with "+ เพิ่มคน": add disables at 20, 20 ticked, line
   "เล่นรอบนี้ 20 คน". Start: roster 20 and group 20 written, the game's own options screen shows ("20 คน"),
   its start gives the handoff screen with 20 chips in the player strip. First visit on cursed-number: stepper 4,
   + stops at 20, − stops at 2.
5. Migration, PASS (390). Legacy shape read from `git show aabffea:src/play/timebomb/main.ts`: `{count, names[20]}`.
   A: empty roster + `{count:3, names:["พี่ต้น","ชิบะ","น้องมิ้นท์",...]}` -> roster ["พี่ต้น","ชิบะ","น้องมิ้นท์"] right
   after load, legacy key null, saved screen with 3 rows. B: roster ["ก","ข"] + legacy -> roster unchanged, legacy key
   null. Extras: corrupt JSON legacy -> deleted, roster stays empty, first-visit screen. Legacy `{count:4, names:["","x"]}`
   -> roster ["x"], saved screen with 1 row and start disabled ("เลือกอย่างน้อย 2 คน"); minor edge, it recovers
   through "+ เพิ่มคน".
6. Unconverted routes, PASS at 390 and 320. With roster = group = 3 names: dice-loser shows its own `#dl-setup`
   (stepper 3, names prefilled); no `.ps`, no `data-player-screen`. The edit pill after its begin returns to
   `#dl-setup` (old reload path). croc-bite's own bridge skips setup into the round, as before; its edit pill lands on
   its own seat-pill setup. The timebomb legacy key was left alone on both pages. Note: "as before" was judged from the
   code path and own-screen behaviour, not diffed against a build of aabffea.
7. Visual, FAIL on one item, otherwise matches the board.
   - Copy: every shipped string was checked as a substring of design/PlayerSetup.dc.html and of the source
     (19 strings incl. dialog title and body, hint, limit leads, sit-out, undo): all present in both.
   - Layout read against the board frames 1, 2, 3, 5, 6, 8 in sheet-390-* and sheet-320-*: rows, tick, ×, add row,
     hint, 60 px start, limit line, undo bar at the foot all as drawn. Timebomb dialog is centred.
   - DEFECT cursed-number: the edit dialog is pinned to the top-left corner, not centred. Measured: rect
     [0,0,340,258.6] at 390x844 and [0,0,282,258.6] at 320x568, computed margin 0px, position fixed, inset 0. Cause
     (inferred): the route's `src/play/cursed-number/style.css` has `* { margin: 0 }`, which removes the UA auto
     margin that centres a modal dialog. Shots: cn-edit-dialog-390/320, sheet-390-c, sheet-320-c. The shared reset
     dialog uses the same class and is likely affected too (not driven).
   - 320x568 saved roster with 3 names on timebomb: start bottom at 559 px of 568, needs 0 px scroll
     (document is 15 px scrollable; scrolled to the end, start bottom 544). For reference, the first-visit screen at
     320x568 needs 89 px of scroll (start bottom 657).
   - Contrast, cursed-number start button: white on rgb(168,85,247) = 3.96:1 at 21 px weight 500. That passes the 3:1
     large/UI bar only if it counts as large text (needs 24 px, or 18.66 px bold); at weight 500 it is below 4.5:1
     normal text. Disabled state (opacity .5) approx 2.6:1 (blend over assumed page ground, approximate).
     Timebomb start for comparison: rgb(7,12,20) on rgb(245,158,11) = 9.12:1.
   - Cursed-number header title wraps to two lines at 320 ("เลข / อาถรรพ์"); the route's own header, not the shared screen.

## Method notes
- Taps are real touch pipeline taps at element centre after scrollIntoView; quick-tap tests send the second touch
  with no settle delay (latency measured from the confirm tap).
- Evidence PNGs opened and read before citing: tb-first-390, tb-round-390, cn-round-390 and the six sheet-* images
  (which contain tb-saved, tb-saved-under, tb-saved-undo-bar, tb-saved-over, tb-edit-dialog, cn-first, cn-saved,
  cn-saved-under, cn-edit-dialog, cn-saved-20, cn-options at 390 and 320, plus tb-first, tb-saved-*, cn-first at 320).
  Other PNGs were produced by the same runs and not individually opened.
- Not covered: reset dialog on either route, real iOS WebKit, keyboard focus, reduced motion, the board's light host
  frame 7 (no light route exists in the pilot).
