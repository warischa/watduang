# ADR-0013 — An unprompted exit whose label matches its effect is not the #25 class

Date: 2026-08-17 · Status: accepted · Supersedes nothing · Related:
[ADR-0008](0008-starting-a-round-never-resumes-or-discards-one-silently.md)

## Context

`GameNav` (`GameLayout.astro`) navigates away from a live round without prompting. It sat in the
handoff queue as "Done when owner rules it in or out" — the last unprompted exit remaining after the
`ล้างกลุ่มนี้` data-loss fix closed the others.

The question kept coming back because ADR-0008 does not settle it. ADR-0008 governs *starting* a
round: a start never resumes or discards one silently. `GameNav` is an exit, not a start, so the rule
had nothing to say and each session re-argued it from scratch.

## Decision

**An exit needs no confirm when its label already states its effect. Only a control whose visible
label under-describes what it destroys needs one.** The owner ruled `GameNav` in, unchanged.

## Why

The #25 class is defined by a gap between what a control says and what it does. `ล้างกลุ่มนี้`
destroyed a live round in five of six games while naming only the group — no player could have known
from the label. A nav control that says it navigates, and navigates, has no such gap: the player
asked to leave and left.

Prompting every labelled exit trades a real, recurring cost — friction on the common path, every
round, for every player — against a harm the label already prevents. The confirm-copy rule adopted
the previous session points the same way: over-naming what a control affects is fine, under-naming
never is.

## Consequences

- Do not add a confirm to a control merely because a live round exists. Ask first whether the label
  under-describes the effect.
- A control whose label changes, or whose effect grows past its label, re-enters the #25 class and
  gets re-scored. This decision does not grandfather it.
- The queue item is closed. Re-opening it requires new evidence, not a fresh opinion.

## The fact that would change this

If a player is observed losing a round through `GameNav` and reporting surprise, then the label is
not carrying the weight this decision assigns it and the exit needs a prompt after all. Nothing
instruments that today, so such evidence would arrive as a report, never as a metric — which means
absence of reports is not confirmation.

## 2026-08-17 — contested by measurement, do not read this as settled

The flip-fact above anticipated a *report* about a deliberate tap on a labelled control. The evidence
that arrived is different in kind and did not need a player: `GameNav`'s links can sit under a finger
that never aimed at them. A transition shrinks `#stage`, chrome slides up into the coordinate just
tapped, and the second tap of a double-tap opens another game. Measured at 320px — siamsi `#ss-again`
at roster 7 with 24-character names resolves 25 of 60 sampled points to `/game/pick-loser/` and
`/game/short-stick/`; pick-loser at roster 10 puts `/game/timebomb/` under the start button. Repro:
`scripts/gamenav-again-grid-probe.mjs`, `scripts/gamenav-start-grid-probe.mjs`.

This decision's reasoning rests on a label matching its effect. That reasoning does not reach an
unaimed tap, so the closure above does not cover this case — it is not refuted, it is out of scope.
[ADR-0014](0014-no-navigation-target-inside-the-stage.md) is in direct conflict, and the owner
decision is #39. Re-opening no longer requires new evidence; the evidence exists.
