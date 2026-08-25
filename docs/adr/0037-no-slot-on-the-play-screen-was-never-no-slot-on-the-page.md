# ADR-0037 — "no slot on the play screen" was never "no slot on the page"

Status: accepted · 2026-08-25 · gh#82 · implements the decision in issues #5, #10, #13

## Context

Every game module shipped `ads: false`, each carrying the comment "play screen = never an ad slot",
and `scripts/validate-games.mjs` hard-failed any game whose `ads` was not `false`. The site therefore
served **zero ad slots on game pages** — on a site whose only revenue model is AdSense.

The decision record says something narrower. Issue #13's amendment 8 states the rule as no ad slot on
the **play screen**, and in the same line names the how-to-play prose below the game, plus the hub, as
inventory. Issue #5's game table carries a per-game `ads` column: true for six of the seven games in
v1, false for exactly one. Issue #10 gives the reason for that one — it is a page that must generate
no ad request at all, and the reason is content classification, not layout.

The scaffold flattened "never on the play screen" into "never on the page", and the gate then kept
that flattening true for months. `GameLayout.astro` had meanwhile been rendering the slot in the
how-to-play section, after the stage — exactly the position the decision designates — behind a flag
nothing ever set.

## Decision

The blanket rule is gone. `scripts/validate-games.mjs` now enforces:

- `ads` must be a boolean.
- `ads: false` always passes, on any game.
- `ads: true` hard-fails for any id in `NO_AD_REQUEST`, a map keyed by game id and valued by the
  reason, citing the issue that decided it.

Values follow issue #5's table. เซียมซีปาร์ตี้ is the eighth game (ADR-0002), added after that table,
so its value was not in any record; the owner ruled it `true` on 2026-08-25.

## Why a denylist and not an allowlist

The two errors are not equally costly. A wrong `ads: true` on a page in the map is an
account-termination-class risk. A wrong `ads: false` anywhere else only loses revenue. A denylist
fails toward the first and tolerates the second.

A denylist also enumerates "pages this project decided must never request an ad" — a set this repo's
own decision record owns, which grows only by an owner ruling, and which therefore converges
(ADR-0031). An allowlist would enumerate "pages allowed to earn": it would block the build on a
revenue choice and need an edit for every new game.

## Reserved height is 250px, not the canvas's 60px

gh#82 requires that a placeholder never shift the layout when a real unit replaces it. The four tool
pages already reserve 250px for that reason (ADR-0004), and ADR-0015 records that an ad iframe resizes
on Google's schedule rather than ours. A 60px placeholder under a 250px unit is the shift the
criterion forbids. Owner decision, 2026-08-25.

The hub and category pages keep the canvas's 90px — that surface's own artboard value, and a different
question.

## Ownership

`NO_AD_REQUEST` records decisions already taken about specific pages. It deliberately does **not**
enumerate what Google classifies as restricted content: that set belongs to a policy engine, changes
without notice, and never converges by patching. A gate that tried to enumerate it would be the
unowned-set mistake ADR-0009 names.

The slot's *rendered* height is Google-owned too. The ownable part is the reserved height, which is
why that is the only part this decision fixes.

## The prediction this ADR makes

If a later owner ruling bans manual slots from game pages entirely, this ADR is superseded rather than
amended — its whole structure rests on the play-screen/page distinction being real. None was found:
the owner's own artboards draw the strip on every game screen.

## What this does NOT cover

The gate checks a manifest field. It cannot see whether the slot actually renders where the field
implies, and it says nothing about the AdSense console page exclusion the one denylisted page needs —
that is an account action, not a code one, and no gate in this repo can observe it.
