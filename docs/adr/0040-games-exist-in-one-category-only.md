# ADR-0040 — เกม exist in one หมวด only; ดูดวง and เครื่องมือ are not เกม

Date: 2026-08-25 · Status: accepted · Owner decision

Completes [ADR-0039](0039-the-shared-roster-belongs-to-one-category-not-to-the-site.md), which moved
the shared roster and the 2–10 range to the สุ่มคนโดน หมวด. Narrows the premise of
[ADR-0002](0002-siamsi-is-the-eighth-game.md) — เซียมซี stays in the catalogue, but not as a เกม.
Leaves [ADR-0001](0001-category-means-search-intent.md) untouched; that axis is what makes this
decision cheap to enforce.

## Context

ADR-0039 bound the roster and the party-size range to one หมวด, and had to spend a paragraph
arguing around เซียมซีปาร์ตี้: a game that passes the phone around a circle exactly as a สุ่มคนโดน
game does, while sitting in ดูดวง because search intent put it there. It called that an exception it
would rather not have, and predicted the mechanic axis might turn out to be the right one.

On 2026-08-25 the owner resolved it from the other end. เซียมซี is redesigned as a real
single-person เสี่ยงเซียมซี — set your intent, shake until one ไม้ติ้ว falls, read one ใบเซียมซี.
No วง, no turn order, no round summary. With its one phone-passing member gone, the ดูดวง หมวด has
nothing left in it that answers to the CONTEXT.md definition of a เกม.

เครื่องมือ were never เกม — [ADR-0004](0004-tools-come-before-more-games.md) said so and the hub copy
has said "ไม่ใช่เกม" out loud since gh#75.

## Decision

**เกม exist in the สุ่มคนโดน (`party`) หมวด alone.** Its members keep what makes them เกม: rounds,
turn order, an outcome the วง shares, the roster, and the 2–10 range.

**ดูดวง (`fortune`) pages are solo.** One person, one answer, no roster, no turn order, no
end-of-round summary for a group. เซียมซี is redesigned first. ดวงวันนี้ and ดวงความรัก follow in
their own tickets, each one a content rewrite of its own size.

Until those two land they are still built as เกม inside a หมวด that no longer calls itself เกม.
**That gap is named here rather than hidden**, and it is the one inconsistency a reader of this repo
should expect to find.

**The site-wide promise changes.** Nothing may claim 2–10 players, phone-passing, or party play as a
fact about the whole site. The claim is true of one หมวด and may be stated only where that หมวด is
the subject.

**`players: [min, max]` stays the field, and `[1, 1]` becomes legal.** The validator's `min >= 2`
rule opens up; a page declaring `[1, 1]` skips the setup panel. Nothing else about the shell's start
contract moves — [ADR-0008](0008-starting-a-round-never-resumes-or-discards-one-silently.md) still
holds wherever a round exists, and so do
[ADR-0014](0014-no-navigation-target-inside-the-stage.md) and
[ADR-0015](0015-a-leave-confirm-guards-the-links-we-cannot-move.md).

**The `/game/<id>/` URL prefix is unchanged.** A path segment is not a promise to a reader; the H1
and the copy are what a person and a crawler read. Renaming it would cost redirects, the frozen slug
baselines in the CI workflow, and every OG path, in exchange for nothing
[ADR-0003](0003-seo-gate-is-search-console-clicks.md) can measure.

## Why the หมวด axis again, and not the mechanic

Same reason ADR-0039 gave: หมวด is declared by every page, already validated, and already the axis
the listing pages and the SEO work are cut along. Mechanic is owned by nobody and enumerated
nowhere.

The difference is that this time the two axes agree, because the mechanic is what changed to fit.
ADR-0039 bought a checkable rule at the price of one bad fit; this ADR removes the bad fit instead of
adding an exception to the rule.

## What it costs, stated plainly

The ดูดวง หมวด loses the pass-the-phone hook that made three of its pages usable by a group at all.
Fewer people touch one phone per visit. The argument for accepting that is search intent — someone
typing เซียมซี is one person holding one phone, not a circle looking for something to play — and
that argument is **inferred from the query, not measured**. ADR-0003's gate is the thing that will
settle it.

The tool→game handoff copy shrinks a second time, on top of the reduction ADR-0039 already booked.

Two shipped games carry the wrong shape until their tickets land, as stated above.

## The prediction this ADR makes

The next defect in this area will be a **surface still making the old promise** — the home hero's
"2–10 คน" chip, the ดูดวง card's "อ่านให้วงฟัง", `categories.ts` intro copy, or a page's `seo`
fields — not a structural failure. Those are copy edits in known files, and each one is a separate
small ticket.

If instead the solo ดูดวง pages measurably underperform the party ones once Search Console has data,
then the split was not the problem and this ADR should be superseded rather than patched.

## What this does NOT cover

- **The Thai class noun for a ดูดวง page.** CONTEXT.md needs a word that is not เกม and not
  เครื่องมือ. Product vocabulary is the owner's; this ADR only forbids calling it a เกม.
- **The English brand.** ADR-0006 confirmed PartyPick for `/en/`. Whether that name still fits a
  site whose fortune half is solo is ADR-0006's question, not this one.
- **Content authorisation.** [ADR-0011](0011-the-content-library-unlocks-by-risk-class-not-wholesale.md)
  still gates every new slip. A redesign is not a content unlock.
- **The invariant in [ADR-0007](0007-party-size-rule-constrains-the-set-not-the-location.md).** A
  party-size guard still enumerates the full party, wherever a party exists.
- **The เซียมซี design details** the owner settled the same day: no ไม้ปวย confirm step, unlimited
  re-draw, and a slip of กลอน + four headings + a closing thought. Those belong in the ticket, not
  in an ADR.
