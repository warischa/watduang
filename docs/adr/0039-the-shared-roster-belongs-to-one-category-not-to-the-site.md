# ADR-0039 — the shared roster belongs to one หมวด, not to the site

Narrows [ADR-0004](0004-tools-come-before-more-games.md) and the party-size invariant
[ADR-0007](0007-party-size-rule-constrains-the-set-not-the-location.md) records. Neither is wrong;
both were written when the roster was a site-wide fact, and it no longer is.

## Context

One roster in localStorage held the names for all six games and all four tools. It was a selling
point: type the group once, carry it from a tool into a game without retyping — the reason the wheel
exists at all, per #11. The shell's setup panel stores the full group with nothing clamped, and
`resolveStart` decides at start time who plays and who sits out, which is what let a group larger
than a game's ceiling degrade sensibly rather than truncate.

The cost showed up when the tools were asked to accept lists far longer than ten. A tool writing
thirty names into a store six games read was not a tool feature; it was a site-wide side effect with
no owner. And the party-size range every game declared was carried by three games whose mechanic
never needed a ceiling.

## Decision

The shared roster, and the 2–10 party-size range, belong to the **สุ่มคนโดน** หมวด alone.

- Games in that หมวด keep the roster, keep the range, keep the tool→game handoff.
- Games in **ดูดวง** and every tool keep their own names, with no ceiling and no shared store.
- The "carry on with the same group" path is offered only into that หมวด.

**เซียมซีปาร์ตี้ takes no exception.** It passes the phone around a circle exactly as a สุ่มคนโดน
game does, and by mechanic it belongs with them. It stays on the ดูดวง side because the หมวด is
decided by search intent ([ADR-0001](0001-category-means-search-intent.md)) and someone searching
เซียมซี is looking to have their fortune told, not to find a party game. A rule with one exception
in it is a rule nobody can check; a rule keyed to the หมวด is checkable by reading the manifest.

## Why the หมวด and not the mechanic

Mechanic is the better predictor of who needs a roster — เซียมซี proves it. It is also unowned: no
field records it, no validator enumerates it, and the next game to arrive would need a human to
classify it. หมวด is already declared by every game, already validated, and already the axis the
listing pages and the SEO work are cut along. Choosing the checkable axis costs one game a slightly
worse fit and buys a rule that cannot silently drift.

## What it costs, stated plainly

The tool copy promising that names flow onward becomes true for three games instead of six, and the
wording has to change with it. That is a real reduction in a feature #11 argued for. The owner made
the call on 2026-08-25 with the เซียมซี case named.

## The prediction this ADR makes

The next defect in this area will be a surface that still assumes one site-wide roster — a nav, a
piece of copy, or a hand-off — rather than a game placed in the wrong หมวด. If instead the pain
turns out to be เซียมซี players retyping their circle every round, the mechanic axis was the right
one and this ADR should be superseded rather than patched.

## What this does NOT cover

It does not say where a page may mention the party size in words — that is #89's rule, and it
deliberately exempts a page's title and meta description. It does not change `resolveStart` or the
invariant ADR-0007 states: a guard still enumerates the full party.
