# gh#141 real-device script — the whole queue in one sitting

One script, ordered by route, that lets the owner close every open row of gh#141 in a single
sitting, plus the device rows that gh#204, gh#205 and gh#219 carry: gh#204 boxes 7 and 9,
gh#205 box 1 and gh#219 box 1. Every row is a human walk — it needs a real phone in a real
hand, and no headless browser stands in for it. gh#204, gh#205 and gh#219 carry no agent slice
(their 2026-09-21 triage comments record that), and no code work is described here: each step
below is a thing a hand does and a thing an eye or an ear judges.

**Live site.** The origin is `https://white-plant-05ad7c600.7.azurestaticapps.net`. Each route
below gives its path; the full URL is the origin plus that path. Do not use `watduang.com` —
the sitemap points there but it does not resolve yet.

## What to bring

The device classes the rows ask for:

- **An iPhone (iOS 16.4 or later for the wake-lock row).** ระเบิดเวลา, ยิงธง and วัดพลัง all ask
  about iOS specifically: a wake lock that holds the screen on, audio that unlocks from a real
  touch, and a real iOS touch firing click. One iPhone covers all three routes. Check its
  Auto-Lock setting before you start (Settings → Display & Brightness → Auto-Lock): shorten it
  to 30 seconds for the wake-lock row, set it back afterwards. And check the ringer switch is
  not on silent — a muted iPhone looks identical to a broken audio unlock.
- **A mid-range Android phone.** The frame-rate row on บางกอกดริฟต์ (gh#204 boxes 7 and 9, plus
  gh#141 บางกอกดริฟต์ row) names a mid-range Android specifically; a desktop or emulator number
  is not an answer to it.
- **A narrow phone — the 320px class.** ไกลแค่ไหนคือใกล้ (X exit at 320px), แตะหยุดเวลา (the
  140px button, measured clipped at 320×640) and กับระเบิด (a nine-column board that cannot be
  full width at 320px) all name a narrow viewport a probe can only estimate. An iPhone SE or any
  320–375px-wide device covers these.
- **One phone to hand around a group of 4+ people.** เต๋าชี้คนแพ้ ties only matter with a real
  group, and the pass-the-phone games (จับไม้สั้น, พิน็อคคิอวย, ตัดสายกู้ชีพ, จระเข้งับ) are empty
  without people. Any of the phones above works for these.
- **An independent timer** — a second phone, a watch, or another pair of hands counting — for the
  wake-lock row. The wake lock cannot be judged by anything on the test phone itself.
- **A computer and a USB cable** for reading the Android frame rate (remote debugging), or accept
  that the frame-rate number needs one — the game ships no on-device FPS readout.

### Order of the walk

The walk below is ordered by route to minimise switching. iOS rows first (ระเบิดเวลา, ยิงธง,
วัดพลัง), then the one-any-phone games, then the narrow-phone and rotate rows, then บางกอกดริฟต์
and the frame-rate measurement last (it wants the computer plugged in). Within a route, the
rows run top to bottom and reuse the same setup where the route is shared.

## How to report back

- **One comment per ticket** — gh#141, gh#204, gh#205, gh#219 — not one per row. Each row's
  record slot below asks for device, OS version, and pass/fail; copy those into the comment of
  the ticket the row belongs to.
- **Device and OS version per row**, even when the same phone walks several rows in a row.
- **Do not tick a box yourself.** The comment is the record; the checkboxes stay unticked as the
  definition of done.
- **A failure becomes its own ticket, not a note.** gh#141's own acceptance criteria say a
  failure becomes a new ticket rather than a stuffing of this queue. Record the failure in the
  comment and open the ticket.

## The walk


### ระเบิดเวลา — `/game/timebomb/play/`

**gh#141** — carried from #13

> **ระเบิดเวลา** (carried from #13, closed): one phone, start → pass around → boom → play again. The screen must not sleep mid-round (wake lock) and sound must come out on iOS, unlocked from the start button **Updated 2026-08-30:** it now has a full-screen play route with a 2D canvas bomb (perspective, ground shadow, fuse (see the 2026-08-30 update below — it no longer shortens)). Walk the canvas specifically: does it read as three-dimensional on a real screen, is the fuse legible outdoors, and does the round still feel right with the extra พร้อมเล่น tap before เริ่มจับเวลา. Reduced motion draws the canvas without animating it — walk that too.

1. Set Auto-Lock to 30 seconds (see *what to bring*). A round runs a random 30–90 seconds, so a
   screen that sleeps has failed with no short-round excuse left.
2. Open the route, pick or add players, reach the bomb screen. The route now asks for a พร้อมเล่น
   tap before เริ่มจับเวลา — the ready tap is part of what this row walks.
3. Tap พร้อมเล่น, then เริ่มจับเวลา. The 2D canvas bomb draws: perspective, a ground shadow, and a
   lit fuse.
4. Judge the canvas on the real screen: does the bomb read as three-dimensional, and is the fuse
   legible outdoors in daylight (not in a dim room)?
5. Tap ส่งต่อ around the group for at least three full rounds, doing nothing else between taps.
   You must hear the tick on the very first round — that is audio unlocked from the start button,
   not from a later tap.
6. For the wake lock, run one wholly-untouched round (see the wake-lock note below): tap
   เริ่มจับเวลา, start the independent timer, and do not touch the phone again until it detonates.
7. Tap เล่นอีกรอบ and confirm a new round starts.
8. Turn on reduced motion (iOS: Settings → Accessibility → Motion → Reduce Motion), reopen, and
   start a round: the canvas must still draw, but not animate.

**Wake-lock note — do not let the ส่งต่อ passes count as the wake-lock test.** Every ส่งต่อ tap
resets the auto-lock idle timer, so a round the phone is tapped every few seconds can never
sleep, even with the wake lock broken. The only thing that tests the wake lock is a round the
phone is never touched during, independently timed at more than 30 seconds before it detonates.

**Pass:** the screen never goes dark and no lock screen appears before the boom on the untouched
round; tick and boom are heard on the first round; the canvas reads three-dimensional; the fuse
is legible outdoors; reduced motion still draws the canvas without animating it.
**Fail:** the screen sleeps or the lock screen appears mid-round; silence on the first round; the
bomb reads flat; the fuse is invisible outdoors; reduced motion blanks or freezes the canvas.

Record: device — OS version — PASS / FAIL — note.


**gh#141** — re-walk after gh#151

> **ระเบิดเวลา, re-walk after gh#151 (2026-08-30)** — the fuse is now a random 30-90 seconds and NOTHING on screen, in the live region, or on the canvas reveals how much is left. The bar shimmers to say "lit", it does not shorten. The tick SOUND still carries urgency and was kept deliberately. The question for a real group: with the time hidden, is the round still tense or just confusing, and does the sound alone carry it? Under reduced motion the shimmer swing is cut to a quarter — check it still reads as "running" without being a distracting pulse.

1. Play a round and watch for any reveal of time: nothing on screen, in the live region, or on
   the canvas may tell how much is left. The bar shimmers to say "lit" — it does not shorten.
2. Hand it around a real group and ask: with the time hidden, is the round tense or just
   confusing, and does the tick sound alone carry the urgency?
3. Under reduced motion the shimmer swing is cut to a quarter. Check it still reads as "running"
   rather than stopped, and that it is not a distracting pulse.

**Pass:** the hidden time reads tense rather than confusing, the sound carries it, and the
reduced-motion shimmer still reads as "running".
**Fail:** hidden time reads as confusion; sound alone does not carry the round; the
reduced-motion shimmer reads as stopped or as a distracting pulse.

Record: device — OS version — PASS / FAIL — note.


### ยิงธง — `/game/cannon-flag/play/`

**gh#141**

> **ยิงธง** — the full-screen play route added 2026-08-29. Never touched by a real hand: hold-to-charge, the aim timer, and audio on iOS

1. Open the route, set players, reach the charge screen.
2. Press and hold to charge: a real hold must fill the charge, and the aim timer must be visible
   and moving.
3. Release to fire and finish a full round.
4. Listen: audio must come out on iOS, unlocked from the first real touch — no second tap, no
   reload.

**Pass:** hold-to-charge tracks a real hold, the aim timer reads clearly, and audio plays on iOS
from the first touch.
**Fail:** the charge does not follow the hold, the timer is unclear, or there is silence on iOS.

Record: device — OS version — PASS / FAIL — note.


### วัดพลัง — `/game/power-meter/play/`

**gh#141**

> **วัดพลัง** — live for the first time 2026-08-29 (landing + play route). Never touched by a real hand: tap-to-stop meter timing, the X and edit-players chrome, and whether a real iOS touch fires click where Chrome synthetic did not (PlayExit uses pointerup for exactly that reason)

1. Open the route, set players, reach the tap-to-stop meter.
2. Tap to stop: confirm the meter stops at the moment you tapped, not lazily after it.
3. Check the X exit and the edit-players control respond to a real touch.
4. Confirm a real iOS touch fires click the way a normal tap would here — a synthetic Chrome
   touch did not, which is the exact thing this row asks you to settle on a real iPhone.

**Pass:** the meter stops at the tap-moment, the X and edit-players respond to a real touch, and
a genuine iOS tap behaves as a click.
**Fail:** stopped timing is off, the X or edit-players is dead on a real touch, or iOS taps do
not fire click.

Record: device — OS version — PASS / FAIL — note.


### มือลั่น — `/game/freeze-tap/play/`

**gh#141**

> **มือลั่น** — full-screen play route + X exit + edit-players, all shipped 2026-08-29, never touched by a real hand. Also check: dispatchTouchEvent took 500-600ms to ack post-load in headless (busy main thread) — does a real phone feel a laggy first tap?

1. Load the route fresh — the thing this row names is the first tap after a cold load, when the
   main thread is still settling.
2. Tap immediately to start or play, and judge whether that first tap feels laggy. Headless saw
   dispatchTouchEvent take 500–600ms to acknowledge after load; a real phone is what decides
   whether that is felt.
3. Play a round and check the X exit and edit-players on a real phone.

**Pass:** the first tap after load feels immediate — no perceptible half-second stall.
**Fail:** there is a feelable stall on the first tap after load.

Record: device — OS version — PASS / FAIL — note.


### จับไม้สั้น — `/game/short-stick/play/`

**gh#141**

> **จับไม้สั้น** — full-screen play route shipped 2026-08-30, run as-is from its mockup. Never touched by a real hand: does drawing a stick read clearly at arm’s length, is the short-stick reveal obvious, and do ten seats still fit without horizontal scroll. Its mockup carried an alcohol penalty preset and an ice-in-mouth dare which were removed before shipping — check nothing of either survived in the art or copy.

1. Set up ten players and reach the stick-drawing screen.
2. Draw a stick at arm's length — does the drawn stick read clearly, and is the short-stick
   reveal obvious when it happens?
3. With ten seats, confirm they still fit without horizontal scroll.
4. Scan the art and copy for residue: the mockup's alcohol penalty and the ice-in-mouth dare were
   removed before shipping — confirm neither survived in any image or line of text.

**Pass:** the stick reads clearly at arm's length, the reveal is obvious, ten seats fit without
scroll, and no alcohol or ice-in-mouth dare residue remains.
**Fail:** the stick is hard to read, the reveal is unclear, ten seats scroll, or removed content
resurfaced.

Record: device — OS version — PASS / FAIL — note.


### เต๋าชี้คนแพ้ — `/game/dice-loser/play/`

**gh#141**

> **เต๋าชี้คนแพ้** — new play route, shipped 2026-08-30 (#156). Three dice each, the group picks whether high or low loses, ties go to a tiebreak round. Walk a real tiebreak with 4+ people: is it obvious WHO is still in it, and does the mode choice read clearly before the first roll? No canvas on this one.

1. With 4+ people, choose whether high or low loses before the first roll — confirm that mode
   choice reads clearly at that point.
2. Play until the dice tie, and walk the tiebreak round: is it obvious who is still in it?

**Pass:** the high/low choice is clear before the first roll, and a real tiebreak makes who is
still in obvious.
**Fail:** the mode choice is ambiguous, or the tiebreak does not make the survivors obvious.

Record: device — OS version — PASS / FAIL — note.


### ไกลแค่ไหนคือใกล้ — `/game/how-close-is-near/play/`

**gh#141**

> **ไกลแค่ไหนคือใกล้** — new play route, shipped 2026-08-30 (#157). Everyone secretly picks a number; nearest or farthest loses, chosen before the round. Walk the secret-pick step passing one phone: can a player see the previous player's number? That is the whole game if they can. Also check the X exit does not sit on the title at 320px — measured clear by 65px in a capture, but a real thumb is the test.

1. Reach the secret-pick step and hand the one phone around so each player secretly picks a
   number.
2. Watch each hand-off: can a player see the previous player's number? That is the whole game if
   they can.
3. On a 320px device, check the X exit does not sit on top of the title. A capture measured it
   clear by 65px, but a real thumb is the test.

**Pass:** the previous player's number is hidden during the pass, and the X exit stays clear of
the title at 320px.
**Fail:** the previous number is visible to the next player, or the X overlaps the title.

Record: device — OS version — PASS / FAIL — note.


### พิน็อคคิอวย — `/game/pinocchio-luck/play/`

**gh#141**

> **พิน็อคคิอวย** — new play route, shipped 2026-08-30 (#158). Answer a question each; a wrong pick grows the nose. Note the game is luck, not lying — the "correct" option is assigned at random, which is worth confirming reads that way to a real group. Reduced motion grows the nose gently rather than snapping it; walk that.

1. Answer the question each round. A wrong pick grows the nose — the correct option is assigned
   at random, so confirm the game reads as luck, not as lying, to a real group.
2. Turn on reduced motion: the nose must grow gently rather than snapping.

**Pass:** the game reads as luck to a real group, and reduced motion grows the nose gently.
**Fail:** it reads as a lying/truth skill, or reduced motion snaps the nose.

Record: device — OS version — PASS / FAIL — note.


### ตัดสายกู้ชีพ — `/game/wire-snip-panic/play/`

**gh#141** — full round

> A full round on a real phone: the wire-cut taps register on a touchscreen, and the round-end scoreboard is readable without zooming

1. Play a full round, cutting wires with real taps on the touchscreen — confirm the wire-cut
   taps register.
2. At round end, read the scoreboard — is it readable without zooming?

**Pass:** wire-cut taps register on the touchscreen, and the round-end scoreboard reads without
zoom.
**Fail:** taps go unregistered, or the scoreboard needs zooming to read.

Record: device — OS version — PASS / FAIL — note.


**gh#141** — X exit

> The X exit control is reachable one-handed and a double-tap on a transition does not leave the round

1. Reach for the X exit control one-handed, the way a player would mid-round — is it within a
   thumb's reach?
2. Double-tap a transition — does the double-tap leave the round? It must not.

**Pass:** the X exit is reachable one-handed, and a double-tap on a transition stays in the
round.
**Fail:** the X needs a second hand, or a double-tap on a transition exits the round.

Record: device — OS version — PASS / FAIL — note.


### แตะหยุดเวลา — `/game/zero-trigger/play/`

**gh#141** — 140px round button

> A full round on a real phone, with attention to the 140px round button: measured clipped 15px at 320x640 and 0px at 375x667 inside a scrollable pane, so a real narrow device is the only thing that settles whether that is felt or merely measured

1. On a 320×640-class device, open the round. The 140px round button was measured clipped 15px
   at 320×640 and 0px at 375×667 inside a scrollable pane.
2. Judge with a real thumb whether that clip is felt or merely measured — does the full button
   stay comfortably tappable, or does the missing edge matter?

**Pass:** the clip is merely measured — the button stays comfortably tappable.
**Fail:** the clip is felt — taps miss, or the button looks broken.

Record: device — OS version — PASS / FAIL — note.


**gh#141** — stop-tap timing

> The stop-tap registers with the timing the game expects on a touchscreen rather than a synthetic click

1. Play the timing round and stop-tap on the touchscreen.
2. Confirm the stop registers with the timing the game expects — a real finger tap, not merely a
   synthetic click.

**Pass:** the stop-tap registers at the timing the game expects on a touchscreen.
**Fail:** the timing is off or taps get dropped.

Record: device — OS version — PASS / FAIL — note.


**gh#219** — rotate

> Reproduce it on a real device with a real rotate, both directions, and record which way the counter is wrong. A synthetic viewport change reproduces the mechanism, not the user's experience.

1. With a player roster whose strip shows a `+N` counter, rotate the phone one direction.
2. Let a turn render, then read the counter against what is actually shown. Rotate back the
   other direction and read again.
3. Record which way the counter is wrong, if it is: claiming players are hidden when they are all
   visible, or hiding itself while players really are cut off.

**Pass:** the counter follows the rotate — correct for each orientation.
**Fail:** the counter is stale after a rotate — record which direction it is wrong in.

Record: device — OS version — PASS / FAIL — note.


### กับระเบิด — `/game/one-bomb/play/`

**gh#141**

> **กับระเบิด** — new play route, shipped 2026-09-06 (#150). Players take turns lifting tiles on a shared board; one tile hides the bomb. Never touched by a real hand. Three things to walk: does a real thumb reliably hit the intended tile on the nine-column board at 320px (the width floor is geometrically impossible there, so this is a judgement call a probe cannot make), does the 3D board survive the phone locking and unlocking mid-round, and if the WebGL context is lost does the DOM fallback board read as the same game with the round intact.

1. On a 320px device, use the nine-column board: does a real thumb reliably hit the intended
   tile rather than its neighbour? The width floor is geometrically impossible there, so this is
   a judgement call a probe cannot make.
2. Lock the phone mid-round, unlock it, and resume: does the 3D board survive?
3. If the WebGL context is lost, does the DOM fallback board read as the same game with the
   round intact? This clause is conditional — if a loss never happens under your hand, record
   "not observed" rather than a pass.

**Pass:** intended tiles are hit reliably (or the occasional miss is tolerated), the board
survives lock/unlock, and the fallback reads as the same game.
**Fail:** tiles are too small to hit, the board corrupts after lock/unlock, or the fallback
reads as a different game.

Record: device — OS version — PASS / FAIL — note.


### บางกอกดริฟต์ — `/game/bangkok-drift/play/`

**gh#141** — four things to walk

> **บางกอกดริฟต์** — new play route, shipped 2026-09-06 (#205). Players take turns driving the same course; the shortest run loses. Never touched by a real hand. **Four** things to walk: does steering answer a real finger drag the way it answers a synthetic one, is the crash moment obvious enough that the next player knows the phone is coming to them, does the course still read at arm length outdoors, and **what frame rate does it hold on a mid-range Android phone**. This is 2D canvas, not WebGL — so the context-loss questions above do not apply to it. ⚠ The frame-rate item was added 2026-09-06 and is not optional polish: #204's acceptance criteria 7 and 9 both require it, its concept note records the measurement as "(not yet)", and until 2026-09-06 **no row anywhere covered it** — checked by grepping this ticket for "frame rate", "frame-rate" and "fps", with a positive control confirming the grep fires. #204 cannot close until this row does.

1. Drive the course with a real finger drag — does steering answer a real drag the way it answers
   a synthetic one?
2. Crash deliberately — is the crash moment obvious enough that the next player knows the phone
   is coming to them?
3. Take it outdoors and hold it at arm's length — does the course still read?
4. Frame rate on a mid-range Android — this is the same single measurement as gh#204 boxes 7 and
   9, so do it once, in the step below.

**Pass:** steering answers a real drag, the crash moment is obvious, the course reads at arm's
length outdoors, and the frame rate is measured (see next step).
**Fail:** steering feels off from a real drag, the crash is not obvious, the course does not read
outdoors, or the frame rate is never measured.

Record: device — OS version — PASS / FAIL — note.


**gh#204 boxes 7 and 9 — one step, one measurement: the frame rate**

> Played at a real 320×568 and 375×812: the setup screen with ten players scrolls to its last input, the drive screen fills the viewport, and the frame rate on a mid-range Android phone is written into the concept note
> `bangkok-drift-concept.md` records the final obstacle numbers and the measured frame rate

Box 9's residual is box 7's frame rate, and the concept note still reads `Measured: (not yet)`.
The other clauses of box 7 — the setup screen scrolling to its last input and the drive screen
filling the viewport at 320×568 and 375×812 — are already recorded in the concept note from
emulation, and box 9's obstacle numbers are recorded too. The one number still owed is the frame
rate on a mid-range Android, which is the whole of this step:

1. On the mid-range Android, open the route in Chrome, reach the drive screen, and drive a
   sustained run of 20–30 seconds.
2. Read the frame rate. The reliable path: enable USB debugging on the phone, plug into a
   computer, open `chrome://inspect` on the computer, attach to the phone's tab, and either tick
   Rendering → "Frame Rendering Stats" for the live FPS meter, or record a Performance trace and
   read the median FPS over the drive. (The game ships no on-device FPS readout, so this is the
   way to read it.)
3. Write the number into the concept note's frame-rate line — the `Measured: (not yet)` entry in
   `~/claude/mockup-games/bangkok-drift/bangkok-drift-concept.md` — replacing `(not yet)` with the
   measured number and the device and OS version it was measured on.

**Pass:** a frame rate is measured on a mid-range Android and written into the concept note in
place of `(not yet)`.
**Fail:** no frame rate is measured, or the number recorded is not from a mid-range Android.

Record: device — OS version — frame rate — PASS / FAIL — note.


**gh#205 box 1 — full screen, mockup art and controls, no chrome**

> บางกอกดริฟต์ plays full screen with the mockup's own art and controls, and no page chrome inside the play surface (ADR-0014, ADR-0055)

1. Open `/game/bangkok-drift/play/` on a phone, full screen.
2. Confirm the mockup's own art and controls are what is on screen.
3. Confirm no page chrome — site header, navigation, footer, ad — sits inside the play surface.

**Pass:** full screen with the mockup's art and controls, and no page chrome inside the play
surface.
**Fail:** page chrome appears inside the play surface.

Record: device — OS version — PASS / FAIL — note.


### จระเข้งับ — `/game/croc-bite/play/`

**gh#141**

> **จระเข้งับ** — new play route, shipped 2026-09-11 (#213). Players take turns pressing the crocodile's teeth; one tooth bites. Never touched by a real hand. Three things to walk: does a real thumb reliably hit the intended tooth rather than its neighbour, does the 3D crocodile survive the phone locking and unlocking mid-round, and if the WebGL context is lost does the fallback read as the same game with the round intact. ⚠ Also walk the FIRST tap specifically: this route's play-exit row on CI run 34555085370 recorded a largest **handled** pointer gap of 1976.1ms against roughly 80ms on every other route in the same run, with its remaining handled gaps at 0.1-0.3ms. It passed correctly — ADR-0059 gates on the input stamp, which read 83.4ms with 0 over the window — but nothing has explained that shape, so whether a real first tap feels laggy is an open question a probe did not answer.

1. Press a tooth: does a real thumb reliably hit the intended tooth rather than its neighbour?
2. Lock the phone mid-round, unlock, resume: does the 3D crocodile survive?
3. If the WebGL context is lost, does the fallback read as the same game with the round intact?
   Conditional — record "not observed" if it never happens under your hand.
4. Walk the FIRST tap specifically: on a fresh load, tap immediately — does the first tap feel
   laggy? A CI run once recorded a biggest handled pointer gap of 1976.1ms on this route against
   roughly 80ms elsewhere, and nothing has explained that shape.

**Pass:** the intended tooth is hit reliably, the crocodile survives lock/unlock, the fallback
reads the same, and the first tap feels immediate.
**Fail:** the neighbour tooth is hit, the crocodile corrupts over lock/unlock, the fallback
differs, or the first tap feels laggy.

Record: device — OS version — PASS / FAIL — note.

### เนื้อคู่ของคุณ — `/game/love-match/`

**gh#141** — added 2026-09-26 when the page shipped (#101). This is a solo fortune page, so one person walks it; there is no phone to pass.

> **เนื้อคู่ของคุณ** — rebuilt fortune page, shipped 2026-09-26 (#101). One reader answers three questions and opens one draw. Never touched by a real hand. Three things to walk: do the answer toggles and the open button take a real thumb tap without a second contact firing past the arm window, does the card portrait load and sit correctly on a real 320px-class screen, and do the ten labelled result lines read without horizontal scroll.

1. Tap the three answers, then `เปิดดูเนื้อคู่`. Does each tap register once, and does a quick double-tap on the open button fail to skip past the result?
2. On the result, does the portrait load and sit cleanly above the ten labelled lines on a narrow phone?
3. Does the result page read with no horizontal scroll?

**Pass:** each tap registers once, the portrait loads and sits cleanly, and nothing scrolls sideways.
**Fail:** a tap doubles or is missed, the portrait is missing or clipped, or the page scrolls sideways.

Record: device — OS version — PASS / FAIL — note.
