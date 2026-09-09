# ADR-0065 — the party-size range is per game, not a property of the หมวด

Date: 2026-09-09 · Status: **proposed — awaiting owner acceptance** · Owner decision requested

Narrows [ADR-0040](0040-games-exist-in-one-category-only.md), which completed
[ADR-0039](0039-the-shared-roster-belongs-to-one-category-not-to-the-site.md). Leaves
[ADR-0007](0007-party-size-rule-constrains-the-set-not-the-location.md) untouched.

## Context

ADR-0039 moved the shared roster and the 2–10 range to the สุ่มคนโดน หมวด. ADR-0040 completed that
work and enumerated what its members keep: "rounds, turn order, an outcome the วง shares, the roster,
and the 2–10 range."

จระเข้งับ (`croc-bite`, gh#213) is the first game to arrive with a different range **and be noticed**;
see the correction below, which found `cursed-number` already declaring `[2, 20]`. Its mockup clamps
to six in two places, ships six mascots, and its own how-to copy says "2 ถึง 6 คน". Stretching it to
ten was possible and cheap — four more mascot rows already exist verbatim in `src/play/_mascots.ts`,
and the tooth-count function already returns a valid board for seven to ten seats. The owner chose to
ship the game as it was designed rather than stretch it to fit a number.

That forces the question ADR-0040's sentence left implicit: **is the range a property of the หมวด that
every member must satisfy, or a property of each game that the หมวด happened to share?**

## What was actually enforcing the range — nothing

Measured 2026-09-09. `scripts/validate-games.mjs` constrains `players` in exactly four ways: the field
must be a two-element number array; `players[0]` must be at least 2 unless it is exactly 1; a page
declaring a minimum of 1 must declare `[1, 1]`; and `players[1]` must be at least `players[0]`.
**There is no rule on the value of the maximum.** A party game declaring `[2, 6]` passes the validator
today, and always would have.

So the 2–10 range was never an invariant anything checked — and it was not even a convention every
game honoured. Resolved by reading each module's constants rather than grepping the literal (the
grep-only reading is what an earlier draft of this ADR got wrong): of the thirteen party games that
existed before จระเข้งับ, **twelve declare `[2, 10]` and `cursed-number` already declares `[2, 20]`.**
The three fortune pages declare `[1, 1]`. `src/games/_template.ts` seeds `[2, 10]`, which is how the
majority held without a gate.

**That correction matters to this decision rather than merely tidying it.** จระเข้งับ is not the first
party game off 2–10; `cursed-number` shipped off it already. So this ADR is not opening a door — the
door was open, undocumented, and unnoticed. What is being decided is whether that stays true on
purpose.

## Decision

**The player range is declared per game. Membership of the สุ่มคนโดน หมวด no longer implies 2–10.**

ADR-0040's list of what members keep is narrowed from five items to four: rounds, turn order, an
outcome the วง shares, and the roster. Those four are what make a เกม. The range is a design fact
about one game, not a property of the category.

**`[2, 10]` stays the default.** `_template.ts` keeps it, and a new game with no reason to differ
declares it. This ADR licenses a difference; it does not invite one.

**The minimum is still load-bearing and does not move.** A `players[0]` of 2 or more is what separates
a เกม from a solo ดูดวง page, and every existing validator rule stands — including that only a
fortune page may declare `[1, 1]`, and that a party page may not. ADR-0040's partition survives whole.

**The site-wide promise rule is unchanged, and matters more now.** ADR-0040 forbids claiming 2–10
players, phone-passing, or party play as a fact about the whole site. A per-game range makes a blanket
claim wrong in a second way: not merely over-broad across หมวด, but factually false for a named game.
Checked 2026-09-09: no shared surface makes such a claim. Every occurrence of a player-count range
under `src/` sits inside one game's own `seo` fields or one route's own markup, which is where it
belongs — the site-level copy was removed under gh#192 (a)(i).

**The claim gates need no change, and that is the evidence this decision fits the existing partition.**
`scripts/party-size-claim.mjs`'s `CLAIM` regex already matches any player-count range rather than the
literal 2–10, so `scripts/party-size-claim-check.mjs` and `scripts/og-card-check.mjs` classify a 2–6
claim exactly as they classify a 2–10 one: permitted on a surface whose subject is the party หมวด,
forbidden elsewhere. Nothing was widened to accommodate this ADR.

## What it costs, stated plainly

A reader can no longer learn a game's party size from its หมวด. Wherever copy needs the number it must
read `players` or restate that one game's range, and two games in the same หมวด may now disagree —
which is the point, and also the new way to be wrong.

**No gate compares a declared range against what a game's engine can actually seat.** จระเข้งับ will
declare `[2, 6]` while its own clamps enforce six, and nothing checks that those two agree. That hole
existed before this ADR — the convention hid it, because a wrong maximum and the conventional one were
the same number. It is named here rather than left to be discovered: it is a real gap, it is owed a
gate, and no ticket owns it yet.

**The gap is not hypothetical.** Found 2026-09-09 while threading a page ceiling through every route's
setup write-back: `freeze-tap` and `cannon-flag` seat **twenty**, the clamp their engines actually
enforce, while both manifests declare `[2, 10]`. Two shipped games disagree with their own
declaration, in the direction opposite to จระเข้งับ's, and no gate noticed.

**That is evidence for the gap, and only for the gap** — an adversarial review caught an earlier
version of this paragraph using it to support a second, different claim as well. The claim that the
per-game range is an existing fact rather than a new freedom rests on `cursed-number` declaring
`[2, 20]` in its manifest, which is recorded above; `freeze-tap` and `cannon-flag` say nothing about
it, because their declarations are the conventional `[2, 10]`. The two facts point at different
problems: `cursed-number` is a coherent game whose range simply is not ten, while those two are
incoherent between what they declare and what they seat.

Before that gate is specified, it is worth deciding what a manifest range is actually load-bearing
for — copy, the OG card's count line, and the setup panel's ceiling all consume it differently, and
the write-back ceiling added in this change deliberately does not consume it at all: it uses the
seats a page can show, which is why `freeze-tap` passes twenty rather than ten.

## The prediction this ADR makes

The next defect here is a **surface that hard-codes a range instead of reading `players`** — a listing
card, a category intro, or an OG line for a game whose range is not ten. Each of those is a copy edit
in a known file.

The structural failure would be a game whose declared range and seatable range diverge, and the
unowned gap above is exactly why that one would ship in silence.

## What this does NOT cover

- **The gate for declared-versus-seatable range.** Named above, owed, and unowned. It is not created
  by this ADR because it needs a way to read a seat clamp out of an engine, which is a set this repo
  does not yet own.
- **Whether จระเข้งับ should have been stretched to ten.** The owner decided that on 2026-09-09. This
  ADR records what the decision implies for every other game, not the merits of that one.
- **ADR-0007's invariant.** A party-size guard still enumerates the full party wherever a party
  exists. A smaller party is still a full party.
- **The หมวด partition itself.** ADR-0040 decides which pages are เกม; this narrows only the range
  clause of its membership list.
