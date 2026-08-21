# gh#13 real-device script — Time Bomb, one phone

Closes this checkbox from GitHub issue #13 (quoted verbatim, do not translate):

> `- [ ] เล่นจริงบนมือถือ 1 เครื่อง: start → ส่งวน → boom → เล่นอีกรอบ — จอไม่ดับกลางรอบ (wake lock) และเสียงออกบน iOS (unlock จากปุ่ม start)`

You do not need to read any code to run this. Every claim this script makes about
app behaviour is anchored to a `file:line` in this repo, for whoever verifies it later.

**Live URL:** `https://white-plant-05ad7c600.7.azurestaticapps.net/game/timebomb/`
(This is the real deployment. `watduang.com` does not resolve yet — do not use it.)

## Before you start

1. **Check your phone's own screen-sleep timeout** (iOS: Settings → Display & Brightness →
   Auto-Lock). A Time Bomb round lasts a random 15–45 seconds
   (`FUSE_MIN_MS`/`FUSE_MAX_MS`, `src/games/timebomb.ts:16-17`) — **shorten Auto-Lock to
   its minimum (30 seconds on iOS)** for this test, and set it back afterwards. Note that
   30 seconds is still not guaranteed to be shorter than any given round: since the fuse
   is random within 15–45s, roughly half of all rounds will run under 30 seconds and
   cannot test the wake lock even with Auto-Lock at its shortest. See Invariant 1 below
   for how this script handles that.
2. **Check the phone is not on silent/mute** (the physical ringer switch on iOS). This is
   a device setting, not something this codebase controls — Safari's Web Audio output can
   be silenced by it, and a muted phone would look identical to a broken audio unlock.
3. Use one phone, one browser (note which — Safari on iOS is the case gh#13 asks about).
4. Open the live URL above and get to the point where you can pick players and land on
   the Time Bomb game screen (via the normal player-setup flow).

## The four stages

### Stage 1 — start

1. **DO:** Tap the button labelled "เริ่มจับเวลา" (start the fuse).
   This tap is what unlocks iOS audio (`src/games/timebomb.ts:91` binds this exact
   click to `arm()`, which calls `unlockAudio()` on the very same gesture —
   `src/games/timebomb.ts:165`, implementation in `src/shell/audio.ts:3-12`). It is
   also the same gesture that requests the wake lock
   (`src/games/timebomb.ts:168-176`, implementation in `src/shell/wake-lock.ts:14-40`).
   **OBSERVE:** The screen changes to a "ฟิวส์กำลังเดิน" (fuse running) screen with a
   pulsing label and a "ส่งต่อ" (pass) button.

### Stage 2 — pass it around ("ส่งวน")

2. **DO:** Tap "ส่งต่อ" to pass the phone to the next player, then physically hand the
   phone to them. Repeat around the group, doing nothing else with the phone in between
   (don't tap anything else, don't lock it, don't switch apps).
   **OBSERVE:** Each tap updates "ตอนนี้อยู่ที่ …" (now with …) to the next player's name,
   and you should start hearing a ticking sound that gets faster as time passes
   (`tick()` calls at `src/games/timebomb.ts:213` inside the render/frame loop, sound
   itself from `src/shell/audio.ts:35-40`).
   **Repeat this stage for at least 3 full rounds** to confirm passing and audio work
   reliably across players. **This tap-every-few-seconds pattern proves nothing about the
   wake lock** — every "ส่งต่อ" tap resets iOS's idle timer, so Auto-Lock never gets a
   real chance to fire regardless of whether the wake lock actually works. The wake lock
   has its own separate, untouched-phone procedure — see Invariant 1 below.

### Stage 3 — boom

3. **DO:** Nothing — just keep holding/passing the phone until the fuse runs out on its
   own. Do not try to time it.
   **OBSERVE:** The screen switches to "ตูม!" with the current holder's name shown as
   having lost, you should hear a low boom sound
   (`boom(audioCtx)` at `src/games/timebomb.ts:237`, sound from `src/shell/audio.ts:42-44`),
   and — if your device supports it — a vibration
   (`src/games/timebomb.ts:238`, iOS has no Vibration API so no vibration on iOS is
   expected and not a failure).

### Stage 4 — play again ("เล่นอีกรอบ")

4. **DO:** Tap the button labelled "เล่นอีกรอบ" (play again).
   **OBSERVE:** The screen returns straight to the start screen, and it shows a line
   naming who lost last round (`src/games/timebomb.ts:86`, "รอบที่แล้ว … แพ้ …"). Confirm
   you can tap "เริ่มจับเวลา" again and a new round starts normally (this is the loop you
   repeat 3+ times in Stage 2/3 to confirm the functional flow; the wake-lock test itself
   is the separate untouched-round procedure in Invariant 1 below).

## Invariant 1 — screen does not sleep mid-round (wake lock)

**This is a different run from Stage 2's "pass it around" walkthrough — do not reuse
those rounds as evidence.** Every "ส่งต่อ" tap resets iOS Auto-Lock's idle timer, so a
round where the phone is tapped every few seconds can never trigger Auto-Lock, even if
the wake lock is completely broken. **A round with any tap after Start proves nothing
about the wake lock — that is the trap to not fall into.** The only thing that tests it
is a round the phone is never touched during, timed against Auto-Lock by a clock this
script does not control.

**Procedure — one player, untouched phone:**

1. Set Auto-Lock to 30 seconds (iOS's shortest option; see "before you start").
2. Tap "เริ่มจับเวลา" to start the fuse, and **at the same moment, start an independent
   timer** — a stopwatch, another phone/watch, or a second person counting — that this
   app does not control. Do not use anything on the test phone itself as the clock.
3. From that tap onward, **do not touch the test phone at all** — no "ส่งต่อ" taps, no
   waking it, nothing — until it detonates ("ตูม!" / boom sound / vibration).
4. Stop your independent timer at boom and read off the untouched duration.
5. **The fuse is random between 15–45 seconds** (`FUSE_MIN_MS`/`FUSE_MAX_MS`,
   `src/games/timebomb.ts:16-17`), so roughly half of untouched rounds will land under
   30 seconds — those are **inconclusive, not fail**: discard and run another untouched
   round. Repeat until one round's independently-timed untouched span exceeds 30
   seconds before boom. Budget up to 5 attempts (the odds of needing more than 5 are
   under 5%, since each attempt is roughly a coin flip).

**Pass/fail — only on a qualifying round** (independently timed at over 30 seconds
untouched before boom):

- **PASS** = the screen never goes black and the lock screen never appears at any
  point from the Start tap to boom, and no on-screen warning appears (see below).
- **FAIL** = the screen goes dark or the lock screen appears at any point before boom,
  or you have to wake the screen yourself to see it detonate.
- This is the concrete observation that distinguishes pass from fail: on a round timed
  at more than 30 seconds untouched, does the screen ever go dark before boom — yes is
  FAIL, no is PASS. A round timed at 30 seconds or under tells you nothing either way.

- **If the wake lock request fails or the API is unsupported**, the app does not fail
  silently at the UI level: it shows an on-screen warning line reading exactly
  "อย่าปล่อยให้จอดับ" (don't let the screen go dark) during the ticking screen
  (element painted by `paintWakeWarning()`, `src/games/timebomb.ts:72-75`, the text
  itself at `src/games/timebomb.ts:111-114`, triggered when the wake-lock promise
  resolves to `null` at `src/games/timebomb.ts:174-175`). **If you see this warning
  text appear, the wake lock did not engage on your device** — that alone is useful
  evidence to report, distinct from "wake lock engaged but the phone slept anyway."

## Invariant 2 — sound comes out on iOS (unlocked from Start)

**Pass/fail you can judge with your eyes (ears):** you must actually hear the ticking
sound during Stage 2 and the boom sound during Stage 3, on the very first round you
play after loading the page (i.e. audio must not require a second tap or a page reload
to start working).

- Audio is only unlocked by the exact tap on "เริ่มจับเวลา" — `src/games/timebomb.ts:91`
  binds `arm()` to that click, and `arm()` calls `unlockAudio()` synchronously in the
  same handler (`src/games/timebomb.ts:165`). The comment at that line states this must
  be a real user gesture because iOS only allows the audio unlock there.
- **If that first tap is skipped or intercepted** (e.g. a double-tap lands on something
  else first, or the button is tapped via anything that isn't a direct touch), the
  underlying `AudioContext` can stay `suspended`: `ctx.resume()` is called but its
  rejection is swallowed with no user-visible error (`src/shell/audio.ts:8-10`) — this
  fails **silently**, there is no on-screen warning for audio the way there is for the
  wake lock.
- Pass = you hear both the ticking sound and the boom on the very first round. Fail =
  silence on either, on a phone that is confirmed not muted (see precondition 2).

## Known failure modes

| Symptom you'd see | Where it lives |
|---|---|
| "อย่าปล่อยให้จอดับ" warning shown during ticking | Painted at `src/games/timebomb.ts:72-75`/`111-114` when `requestWakeLock()` resolves `null` — `src/games/timebomb.ts:174-175`, `src/shell/wake-lock.ts:16` (API absent) or `:21-23` (request rejected) |
| Screen sleeps despite no warning shown | Wake lock was granted but never re-acquired after backgrounding — reacquire path is `src/games/timebomb.ts:254`, called from `handleVisibility()` at `src/games/timebomb.ts:246-261`; a failure there returns `false` silently (`src/shell/wake-lock.ts:34-37`) with no separate on-screen signal from a reacquire failure |
| No sound on any round, phone confirmed unmuted | Audio unlock either never ran (Start button not actually the first real gesture) or `resume()` was rejected and swallowed — `src/shell/audio.ts:8-10`; nothing in the UI reports this |
| Sound works but wake lock never seems to engage at all | Per `src/shell/wake-lock.ts:1`, unsupported on iOS below 16.4 and in a non-secure (non-HTTPS) context — check the iOS version and confirm the URL is `https://` |

## What this does NOT cover

- Only one physical device, one iOS version, one browser (Safari) is tested here — it
  says nothing about other iOS versions, Android, or non-Safari browsers on iOS (which
  all use the same WebKit engine under Apple's rules, but this script does not test them).
- Does not distinguish "wake lock API present but OS silently declines it" from "wake
  lock API entirely absent" — both look the same from the warning text alone; only the
  known-failure-modes table above gives you the code paths to mention if you want to
  narrow it down later.
- Does not test what happens if the phone is manually locked mid-round (screen lock
  button pressed on purpose) — that is a different, deliberate action, not a wake-lock
  failure, and the app's own visibility-change handling (`src/games/timebomb.ts:246-261`)
  is designed to resume correctly from it, but this script does not separately verify that.
- Does not cover backgrounding the browser (switching apps) mid-round, only screen sleep.
- A single run of this script is not a statistical guarantee — timer/wake-lock bugs can
  be intermittent; if anything looks borderline, repeat once more before reporting fail.

## Result line to report back

Copy this, fill it in, and paste it into gh#13 as a comment (do not tick the box
yourself — this script only gathers the evidence for someone else, or you, to tick it):

```
Device: <e.g. iPhone 13>
OS version: <e.g. iOS 17.5>
Browser: <e.g. Safari>
Date tested: <YYYY-MM-DD>
Stage 2/3/4 functional rounds played: <n, ≥3>
Auto-Lock timeout used: <seconds, e.g. 30>
Untouched rounds attempted before one exceeded Auto-Lock: <n>
Qualifying round's independently-timed untouched duration: <seconds, must be >Auto-Lock>
Wake lock (screen never slept during the qualifying round, no "อย่าปล่อยให้จอดับ" warning): PASS / FAIL
Audio unlocked from Start (heard ticking + boom on first round): PASS / FAIL
Notes: <anything from "known failure modes" that matched what you saw, if any>
```
