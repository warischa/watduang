# gh#202 — calibration of the two spot fixes to the horizontal overflow gate

Companion to `docs/verification/evidence/202/calibration.md`, which carries the gate's design, its
planted reds and the full 11-route baseline that produced the two `KNOWN_OVERFLOW_X` rows. Split from
it only because every markdown file in this repo is swept at a 12KB budget. Same environment: this Mac,
headless Chrome 152 on `CDP_PORT=9333`, `npx serve dist/ -l 4592` over a real `npm run build`. Every
claim below is a warning or a reading watched FIRING and then watched STOPPING, not a green.

## 8. The two exempted rows are no longer dark — both warnings fired

`KNOWN_OVERFLOW` gets two reporting checks `KNOWN_OVERFLOW_X` did not have: a row that now reads clear,
and a row that grew past its recorded px. Without them the horizontal map is write-only — `standalone()`
in `scripts/ci-probes.sh` discards a passing leg's log except for warning-marked lines, so an excepted
row's table line never reaches CI at all. Both are WARNINGS, like their vertical counterparts: a
recorded px is one machine's number.

**Growth.** `wire-snip-panic 320x568`'s recorded px was temporarily edited 43 -> 5 and the route
walked; the reason string was restored from a `cp` copy, `diff` clean:

```
::warning::/game/wire-snip-panic/play/ at 320x568 measured 43px SIDEWAYS against a recorded 5px (widest offender div#screen-game.screen.active) at press 0. Same machine as the recording? Then the sideways clip GREW ...
```

**Cleared.** This one cannot be fired by editing a record: its trigger reads the MEASUREMENT against
`OVERFLOW_TOLERANCE_PX`, not the recorded number. It was fired from a real measurement instead — the
section 9 plant, whose effect is to make that row read 0px sideways:

```
::warning::/game/wire-snip-panic/play/ at 320x568 measured 0px SIDEWAYS, within the 8px tolerance, against KNOWN_OVERFLOW_X "gh#202 open: 43px on press 0 ..." — this row no longer clips sideways here ... delete the row ...
```

With the plant removed the row reads `sideways 43px by div#screen-game.screen.active` and neither
warning prints. The trigger is the tolerance and not zero on purpose: this axis has no `FITS_ROWS` to
promote into, so a cleared row asks for DELETION, and a zero trigger would never fire on a row recorded
a couple of px above the line — the row most likely to have cleared.

## 9. The declared-scroller reader failed OPEN in two ways, both closed and both watched failing

`declaresX` decides whether an author actually declared horizontal scrolling on a box — the single
signal the `auto`/`scroll` exemption rests on, and it was lenient twice. Neither leniency has a trigger
in today's stylesheets, but each route's `style.css` is lifted byte-for-byte from a mockup, so the next
mockup owns whether one appears.

**(a) A conditional group was recursed into without evaluating its condition.** Planted temporarily at
the end of `src/play/wire-snip-panic/style.css`, then `npm run build`:

```css
@media (min-width: 1200px) { #screen-game { overflow-x: auto; } }
#screen-game { max-height: 200px; }
```

The `max-height` puts the box under the `SCREEN_FRACTION` bound so the declaration is the only thing
left deciding; the `@media` condition is false at every viewport this walk uses. One variable changed
between the runs — the group-condition test in the stylesheet walk — same `dist/`, browser, plant:

```
before  wire-snip-panic 320x568  sideways   0px                                    [exempted by a desktop-only rule]
after   wire-snip-panic 320x568  sideways  43px by div#screen-game.screen.active   [gated]
```

**(b) Any `overflow-x` value counted as a declaration.** The `overflow` shorthand sets both longhands,
so `overflow: hidden` and `overflow: visible` expose an `overflow-x` too, and a selector whose author
asked for the opposite of a scroller marked its boxes as declaring one. Measured on this route's own
shipped rules, no plant, old reader against new in the same page:

```
oldReaderSelectorCount 8   newReaderSelectorCount 2
oldReaderSaysAppDeclaresX true   newReaderSaysAppDeclaresX false
droppedByTheValueTest: html, body | #app | .timer-bar-wrap | .wire-svg | .wsp-visually-hidden
```

`#app` carries `overflow: hidden`; the old reader read that as a declared horizontal scroller. Five
selectors, both page roots among them, declared nothing of the kind. The stylesheet was restored from a
`cp` copy (`diff` clean, hash back to `f69cdbc5…`), `npm run build` re-run, and `git status --short
src/play/` printed nothing.
