# ADR-0059 — the arm gate decides from the browser's input clock, and the class is every timer on ARM_DELAY_MS

Status: accepted 2026-09-04 · supersedes nothing · relates to ADR-0016, ADR-0057, ADR-0031

## Context

An arm gate disables controls in a region after a screen transition and re-enables them once the
region has been quiet for `ARM_DELAY_MS`, so a double-tap on a transition cannot land on a newly
revealed control and leave the round.

Arming and measurement read the same clock: the disarm ran inside a pointer listener and scheduled a
`setTimeout`. Both live on the main thread, so under a stall the timer's expiry says nothing about
when the finger touched the glass. Forced red, gh#190: a contact browser-stamped 235.5ms after the
transition tap — inside the 400ms window — was handled with the control enabled and the round left
the play route.

The owner ruled the cure on 2026-09-03 and named `src/games/_arm-gate.ts`. **That file was not the
defect the evidence measured.** The failing probe reads the exit button the shell's PlayExit
component owns, and that component imports only the CONSTANT while running its own timer. Counting
every file with its own timer on that constant found four, not one.

## Decision

**The gate decides from `event.timeStamp` — the clock the browser assigns at input time — never from
when a handler ran.** `ARM_DELAY_MS` stays 400; nothing about the delay was wrong, only which clock
the decision read.

**The rule is the class, not the named instance.** The class is every file carrying its own
`setTimeout` on `ARM_DELAY_MS`. A ruling that names one file does not narrow it; a fix that patches
one leaves the siblings carrying the identical defect. One shared helper owns the comparison and the
sites use it.

Shape: the timer keeps owning the visible `disabled` attribute, so keyboard users get a genuinely
inert control rather than a focusable one that swallows its own activation; the stamp comparison is a
second, independent guard that does not depend on the timer having fired. Comparisons are
stamp-to-stamp only — never mixed with a monotonic or wall clock, and the delay is never derived from
a stamp. The seed records the LATER of each interaction's down and up, because the render fires on
release and a window anchored to the press alone is short by the press duration.

**Membership is unchanged and still route-owned** (ADR-0031): the gate enumerates the buttons under
its stage at call time. This decision changes the MEASUREMENT, not the classification, so the
convergence argument survives.

## The exemption this decision names

A gate whose stamp is assigned by the renderer when it CREATES the event — motion events are the
known case — is outside this decision. During a stall no such events are created, so every stamp that
arrives is handler time and the cure is inert there. Such a path stays timer-governed until measured.
Do not apply the helper there and do not write a comment claiming a protection that cannot fire.

## Consequences

The instrument cannot see part of what this guards. The play-exit probe synthesises its transition
tap as a press and release in the same instant, so the press-duration gap is zero-width in every leg
it can run, and its calibration leg is refused under the CI tag by design. **A node test on a faked
document is the only check that runs on every push**, and it must pin the capture phase, because a
sibling component stops propagation during capture and a bubble-phase seed would go blind exactly
inside the window that matters.

A route the probe cannot walk is scored EXEMPT and still counted in its headline, so one route is
unmeasured behind every green here (gh#199).

## Evidence

Pre-fix and post-fix builds, both served over HTTP, back to back on one machine, with the stall knob
set: pre-fix exits 1 with 10 of 11 routes failing (input gaps 83-243ms inside the 400ms window,
control enabled, navigation away); the shipped tree exits 0 with none failing. Two adversarial review
rounds; round 1 found the press-duration gap that every green had missed. Shipped in `0779a8a`,
deployed as `cee0f53`. Full detail: gh#190, gh#199, gh#200.
