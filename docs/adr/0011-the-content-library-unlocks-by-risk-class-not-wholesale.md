# ADR-0011 — The content library unlocks per game by risk class, not wholesale

Date: 2026-08-15 · Status: accepted · Issues: [#5](https://github.com/warischa/watduang/issues/5) (the v1 game table), [#30](https://github.com/warischa/watduang/issues/30) (the last zero-content game)

## Context

[ADR-0003](0003-seo-gate-is-search-console-clicks.md) voided #12's go/no-go gate and moved the
SEO decision to [#19](https://github.com/warischa/watduang/issues/19). It did **not** re-authorize
the ~230-item content library — the risk ordering it records is an ordering, not a gate, and no
session since has been allowed to read it as one.

That was survivable while zero-content games remained. It is not survivable now. With
`short-stick` shipped (#30), **every** remaining row of #5's v1 table needs hand-written content:

| # | Game | Content cost | Risk class |
|---|---|---|---|
| 4 | ใครในวงนี้น่าจะ… | ~100 sentences | social exposure of people in the room |
| 5 | ความจริงหรือท้า | ~80 items | **account-termination risk** (#5's 🔴 rule) |
| 6 | วัดดวงวันนี้ | ~50 predictions | none — fortune text about the reader |
| 7 | ดวงความรัก | light | none — fortune text about a chosen pair |

So the library is no longer one line item among many. It is the binding constraint on the entire
remaining game roadmap, and "not re-authorized" had become an unowned block: no gate, no owner
action that would lift it, and no game left to build around it.

## Decision

The library unlocks **per game, by risk class** — not as one ~230-item block.

**Unlocked (2026-08-15):** row 6 วัดดวงวันนี้ and row 7 ดวงความรัก. Both are fortune text written
about the reader or a chosen pair. Neither instructs a player to *do* anything, so neither can
carry the failure mode that makes the library dangerous.

**Not unlocked:** row 5 ความจริงหรือท้า. Its dare library is the one place in this project where a
content mistake risks **AdSense account termination** rather than lost revenue — #1 established
that dares inducing real physical harm are a Google *policy* matter, not a *restriction*. It stays
locked until it is authorized on its own terms, separately from this decision.

**Explicitly undecided:** row 4 ใครในวงนี้น่าจะ…. It was not part of the 2026-08-15 answer and is
not unlocked by this ADR. Its risk is real but different in kind from row 5's — it exposes people
in the room to each other rather than pointing anyone at physical harm — and it deserves its own
call rather than being swept in on the strength of "not as bad as row 5".

## Why risk class rather than wholesale

Wholesale authorization fails in both directions. Approving all ~230 items to unblock two harmless
fortune games would carry the dare library in on their coattails — the one item whose downside is
losing the revenue model outright. Refusing all 230 to hold the dare library back also blocks
~50 prediction lines that cannot hurt anyone, and leaves the roadmap with nothing buildable.

Splitting by risk class is what makes the constraint ownable: each unlock names a game, and the
one dangerous library is refused on its own merits instead of being bundled with safe work.

## What does not change

Every constraint on content that is ever unlocked stays in force, verbatim from #5:

- **ตรวจด้วยมือทุกข้อ ห้ามปล่อยผ่านจาก AI โดยไม่อ่าน** — every item read by a human. Not advice.
- No item involving eating, drinking, holding breath, pain, heights, fire, sharp objects, or
  leaving the venue.
- No item that leads to exposing private information about someone not in the circle.
- No images of bottles, cans, or branded glasses anywhere, including OG images and thumbnails.

These are conditions on writing content at all, not on the dare library specifically. Rows 6 and 7
are unlocked subject to them.

## The fact that would change this

Evidence that fortune text carries a policy risk we have not modelled — for example an AdSense
action against prediction or compatibility content. That would collapse the risk classes back
together and this ADR would be superseded rather than amended, because its whole structure rests
on those two rows being harmless.

The reverse would also change it: [#19](https://github.com/warischa/watduang/issues/19)'s gate
failing at month 6 makes the remaining content cost moot, since the games would not be built.

## Related

- [ADR-0003](0003-seo-gate-is-search-console-clicks.md) — voided the #12 gate; deliberately did not
  re-authorize this library, which is the gap this ADR fills
- [ADR-0004](0004-tools-come-before-more-games.md) — tools before more games; discharged, all four shipped
- [#5](https://github.com/warischa/watduang/issues/5) — the v1 table, the per-game content costs, and the 🔴 dare rule
- [#30](https://github.com/warischa/watduang/issues/30) — จับไม้สั้น, the last game that needed no content
