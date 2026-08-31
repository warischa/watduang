# ADR-0046 — Reduced motion does not reach JS-driven motion, and the answer is reduce, not remove

Date: 2026-08-27 · Status: accepted · Related: [ADR-0033](0033-a-design-value-not-in-the-canvas-is-drift.md), [ADR-0045](0045-a-gate-is-audited-against-what-executes-not-what-is-declared.md), gh#77 (box 7), gh#120

## Context

`ระเบิดเวลา` drove its fuse bar with `requestAnimationFrame`, writing the element's width every frame for the whole round. It had no reduced-motion guard.

What stood in for one was a comment, asserting that `prefers-reduced-motion` "holds trivially" because the game declares no CSS animation. **That reasoning is false.** `prefers-reduced-motion` is a CSS media feature. It does not apply itself to `element.style` writes made from script. "No `@keyframes` declared" is not "no motion".

The same claim was asserted a second time, independently, in the game layout's own comment. Two places in the codebase told a reader the guard held, and a visitor who had asked their operating system for reduced motion received the full per-frame animation.

Surveyed as a class rather than as one module: `เซียมซีปาร์ตี้` already guards its `devicemotion`-driven transform write and needed nothing. `จับไม้สั้น`, `ดวงวันนี้`, `ดวงความรัก` and `สุ่มคนโดน` have no motion source at all.

## Decision

**Read the media query in script, and reduce the motion rather than removing it.**

Under `(prefers-reduced-motion: reduce)` the fuse updates on a coarse cadence — a few times a second — instead of once per frame. The query is read at mount and a change listener applies a mid-round switch.

Reduce, not remove, because the fuse *is* this game's mechanic: the player must still see time running out. Freezing or hiding it would answer the accessibility request by removing the game. The round's duration, its deadline, and the moment the bomb fires are untouched; the only cost is a final fuse width up to one cadence step stale, which is cosmetic.

**Both false comments are corrected rather than deleted.** A deleted comment leaves the next reader to re-derive the same wrong conclusion. The corrected text says what actually holds and what does not.

This is a visible change to a game's appearance under a setting the visitor chose, so it is recorded here for owner review by eye. Machine checks cannot judge whether the stepped fuse reads as intentional.

## The guard, and what it does not prove

`js-motion-guard-check` is wired into the workflow per ADR-0045 and asserts that every JS-driven motion source in the game modules sits beside a reduced-motion guard.

**It is a static scan. It proves a guard is PRESENT, never that it is EFFECTIVE.** Measured, not reasoned: pinning the guard's value to a constant false — leaving every token in place — keeps this gate green while the unit test goes red. So the division of labour is deliberate and neither half is optional:

- The **gate** catches a *missing* guard. That is the bug that actually shipped here, where the only guard was a comment.
- The **unit test** catches an *inert* one.

Wiring one without the other covers half the class.

Two further bounds are printed in the gate's own success line rather than left to be discovered. Its scanned set is the game modules only, so the spinning wheel on the tool pages is unscanned. And it matches `requestAnimationFrame` plus direct style writes only — `element.animate()`, interval-driven writes, `style.setProperty`, and transitions toggled by class name are out.

An earlier version of the gate stripped only comments that began a line, so an unguarded animation with a *trailing* comment quoting the guard call passed green — reopening precisely the false-comment-as-guard defect it was built to catch. It now classifies every character as code, string or comment and counts a match only where it begins in code. Blanking string contents was rejected: the real guard's own argument is a string literal, so blanking would delete every genuine guard.

## The fact that would change this

If the owner resolves gh#120 by self-hosting the Thai fonts, text metrics become repo-owned. That does not change this decision, but it removes the excuse that motion and layout behaviour here can only ever be bounded rather than known.

## Amendment 2026-08-31 — the by-eye review is deferred, by owner decision

This ADR requires the owner to review a reduced-motion appearance change by eye, on the ground that
machine checks cannot judge whether the result reads as intentional. gh#170 then added a guard to
five more games at once: cursed-number, how-close-is-near, freeze-tap, cannon-flag and power-meter.

**The owner ruled on 2026-08-31 to ship first and review on the live site.** Recorded here so the
next reader sees a decision rather than a step someone skipped. What was shipped without the review:

- cannon-flag and power-meter keep the mechanic and the outcome; only smoothness changes. The gauge
  runs the same clock and locks the identical score; a shot fired under reduce lands identically.
- cursed-number and how-close-is-near neutralise decorative fades and loops. State is carried by
  colour and position, which survive, so the round stays readable.
- freeze-tap loses screen shake, confetti and haptics. The target still flips colour, word and
  symbol at the same instant.

What the machine checks DID establish, so the by-eye review is about taste and not correctness: every
guard is live rather than pinned to a constant, the swept keyframes have 0% and 100% frames equal to
base style, and neither swept route depends on an animationend or transitionend event that a
zeroed duration would starve.

This amendment does not weaken the rule. The next reduced-motion change earns the same review, and
this one is owed retrospectively.
