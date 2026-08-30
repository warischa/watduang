# ADR-0053 — the shared roster is the identity channel for party games

Date: 2026-08-30 · Status: accepted · Owner decision · Reverses: the gh#140 ruling comment of 2026-08-29 (ticket text only, never an ADR) · Relates: [ADR-0010](0010-checkpoint-slot-stays-site-wide-until-a-second-writer-exists.md), [ADR-0050](0050-party-games-go-full-screen-landings-deleted.md), gh#164, gh#140, gh#145, gh#146, gh#152

## Context

Two designs for player identity were both approved by the owner, at different times, and they
contradict each other. That is why this needed a ruling and not a bug fix — no agent can pick between
two owner rulings, and a full-assess checklist is not the place to settle a design question.

**The design that ships today.** `src/play/_setup-bridge.ts` calls `saveGroup(names)`, writing the
names entered on a game's setup screen into the site-wide roster keys owned by `src/shell/roster.ts`.
A rename is in-memory until setup completes; on completion it leaves the game and is what the next
game starts from. This was measured with real DOM events and storage reads through
`scripts/driver.mjs`, not inferred from source.

**The design recorded on gh#140.** The owner's ruling comment of 2026-08-29 on that ticket says, and
this ADR reverses it:

> The central decision this body poses is resolved the third way: renames do not travel between games
> at all — each game owns its player list, and the shared roster stops being the identity channel for
> party games. "The roster is the only channel that reaches every game" is no longer the design; the
> baseline every game matches is data (list, order, ceiling), not a shared runtime channel.

**The count in gh#164's body is stale, and the corrected count strengthens the ruling.** That body was
written before gh#161's port landed and says "seven of the eight play routes". Measured again on
2026-08-30: there are **9** play routes under `src/pages/game/`, and **8 of the 9** reach the shared
setup bridge — seven through their own `roster-bridge.ts` under `src/play/`, and dice-loser through
`src/play/dice-loser/main.ts`. timebomb (ระเบิดเวลา) alone is off it. The shared roster is not an
edge case that leaked into a couple of ports; it is what almost every party game already runs on.

## Decision

**The shared roster is the identity channel for party games.** A player renamed in one game is that
player in the next one. `_setup-bridge.ts` keeps calling `saveGroup`, and no bridge code changes as a
result of this ADR.

The losing text is what gets corrected, not the code.

**This reverses the gh#140 ruling quoted above.** That rule was never recorded in an ADR — checked
both candidates the live source comments name: ADR-0050's ruling 4 is *"The port recipe is run-as-is,
then full assess"*, about porting, and says nothing about player lists or roster ownership;
ADR-0049 is about docs-only pushes and has no ruling 4 at all. The reversed rule existed only as
ticket text. So this ADR is now where the rule lives in **both** directions: what the site does, and
what it no longer does.

What survives from the gh#140 ruling is the part that was never in conflict: the canonical 20-mascot
list (names, emoji, colors, fixed order, ceiling 20) is the data baseline every game matches. Data
baseline and runtime channel are separate questions; only the second one is reversed here.

## The exception: timebomb keeps a local player list

`src/play/timebomb/main.ts` stores its players in its own `localStorage` key and does not import the
setup bridge. It reads `loadRoster()` but never calls `saveGroup`, and its `buildContext` deliberately
mounts a no-op `setPlayers`.

This is a **known, deliberate exception**, recorded as such — not a bug and not work queued for the
next agent to "fix":

- timebomb is an engine-reuse + dark-reskin retrofit (the second branch of ADR-0050's ruling 4, as
  recorded in `docs/verification/timebomb-play-route-assess.md`), so its identity plumbing came from a
  different lineage than the ported mockups'.
- Migrating it would change shipped behaviour and would drop the player lists real users already have
  saved under its local key.
- **The owner has not been asked that second question.** This ADR answers "which design does the site
  keep", not "does timebomb migrate, and at what cost to saved lists". That question is open.

Until it is asked and answered, timebomb is the one route where a rename stays local, and that is
correct rather than tolerated.

## Accepted losses

The acceptance wording on **gh#145** (ระเบิดเวลา) and **gh#146** (จับไม้สั้น) — "rename works and
**stays local to this game**" — becomes false the moment this ADR is accepted. It described the losing
design.

That wording is **owed work on those two tickets**: it must be corrected so the next agent does not
read a false rule and build to it. It stays false until an orchestrator's tracker batch fixes it; this
ADR does not edit tickets. Note the asymmetry that makes the wording worse than merely stale — on
gh#145 (timebomb) the sentence happens to describe what the code does, but for the wrong reason, and
on gh#146 (short-stick) it is simply wrong.

## Consequences

- **Two live source comments cite a rule that does not exist at the address they name.** Both are in
  `src/play/timebomb/main.ts`: the comment above its local `STORE_KEY` constant, and the comment above
  `buildContext` explaining its no-op `setPlayers`. Each attributes "each game owns its player list"
  to *ADR-0049 ruling 4*. ADR-0049 has no ruling 4, and ADR-0050's ruling 4 is about the port recipe.
  Both comments must be re-pointed at this ADR, which is where the rule and its one exception now
  live — the behaviour they guard stays exactly as it is; only the citation is false. That edit is a
  `src/` change and is deliberately not made here.
- **New ports follow `src/play/cursed-number/`, not timebomb.** Copying timebomb's identity plumbing
  would propagate the exception into games that have no reason to carry it.
- **gh#152 is unblocked on the half it was waiting for.** It was waiting to know which half of the
  identity design it owns; the answer is the shared roster, so a shared animal-name identity reaches
  every party game through the roster, with timebomb as the named exception.
- The citation in `docs/verification/timebomb-play-route-assess.md` to ADR-0050's ruling 4 is correct
  as written and is untouched — it cites the port-recipe branch, not a roster rule.

## The fact that would change this

If migrating timebomb onto the shared roster turns out to cost users nothing — no saved list dropped,
no shipped behaviour changed — the exception has no reason to exist and the owner should be asked to
close it. The exception rests on that cost being real, not on timebomb's lineage.
