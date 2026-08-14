# ADR-0004's party-size rule constrains the SET a guard enumerates, not where the guard lives

Clarifies [ADR-0004](0004-tools-come-before-more-games.md) § "กฎขนาดวง บังคับที่หน้า ไม่ใช่ที่ตัวตรรกะ".
Does not supersede it — the decision stands; its wording misled, and this records what it actually constrains.

## The problem the wording caused

Read literally, "enforce at the page, not at the logic module" forbids putting party-size logic in a
`.ts` module. That reading is unworkable, because it collides with how this repo tests: every test
file sits beside a plain `.ts` module and is picked up by CI's `src/**/*.test.mjs` glob, and there is
no harness for `.astro` components. [#21](https://github.com/warischa/watduang/issues/21) requires a
regression test proving the stored group is never written back clamped. Under the literal reading,
that acceptance criterion cannot be satisfied at all.

## What ADR-0004 actually established

Re-reading its own evidence: the bug it was written about was that `drawNames()` enforced the guard
against the **remaining pool** rather than the full party, which stranded the last name. The same
section explicitly blesses `splitTeams()` keeping its `MIN_NAMES` check — because `splitTeams()`
always receives the full party.

So the invariant was never module-versus-page. It is:

> A party-size guard must enumerate the **full party**, never a partial or remaining pool.

Where the code physically lives is free, as long as the function receives the whole set.

## Consequence

`src/shell/player-select.ts` exposes `resolveStart(selected, min, max, warned)`, which takes the
complete selection and returns who plays and who sits out. It is pure and unit-tested. Enforcement —
the message, the two-click confirm, the decision to start — stays in `PlayerSetup.astro`. This
satisfies both ADR-0004's real invariant and #21's testability requirement.

## Scoring ADR-0004's prediction

**Confirmed in substance, refuted in wording.** The failure mode it predicted is real and recurred
this session in a different disguise: `saveGroup([])` on the untick-all path wiped the saved group
because the write ran with an empty selection. Same family — a guard reasoning about the wrong set.
The prescription "put it on the page" would not have prevented it; "enumerate the full party" would.

## The fact that would change this

If an `.astro` component test harness ever exists here, the tension disappears and the guard could
live in either place on its own merits. Until then, extraction is what makes the rule testable.

**Scored S2026-08-14#5 — still untested, and the cost is now measured.** No harness appeared, and the
#23 work paid the price twice over. Extraction worked exactly as this ADR predicted for the pure parts:
`planStart(checkpoint, gameId, choice)` went into `player-select.ts` and its foreign-game guard was
proved non-vacuous by substituting the game-agnostic condition and watching a test fail. But the fix for
the defect an adversarial review found — `#player-count` having no listener, so editing the count after
the resume prompt appeared started a round with the stale roster — is a single `addEventListener` line
inside `PlayerSetup.astro`. There is nothing to extract: the bug *is* the wiring. It ships with zero unit
coverage and passes CI either way.

What stood in for the missing harness was a browser probe calibrated both ways: with the listener patched
out of `dist/`, it reproduced the wrong 4-player round; after a clean rebuild the same click is a no-op.
That is a working substitute, not an equivalent one — it lives in a session scratchpad and CI never runs
it. The honest reading of this ADR today is that extraction covers the logic and nothing covers the
wiring.

## Related

Instrument used to verify the page-level behaviour (and three ways it produced confidently wrong
answers first): `docs/agents/browser-verification.md`. Remaining checkpoint-identity work:
[#23](https://github.com/warischa/watduang/issues/23).
