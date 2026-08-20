# `siamsi` is the eighth game — it does not replace `daily-fortune`

Status: accepted · Amended 2026-08-20, see § Amendment

#5 (closed) picked a 7-game v1 catalogue with `daily-fortune` (วัดดวงวันนี้, ~50 fortunes) as the
main fortune game. But `siamsi` (เซียมซีปาร์ตี้) had already been built and shipped in `aa5a251`
with no ticket and outside those seven — because we never read #5, and assumed the `fortune`
category was still open.

We decided the catalogue **grows to 8 games**, keeping both `siamsi` and `daily-fortune`, separated
by **party size**: `siamsi` is the group game (pass the phone around, one slip each), and
`daily-fortune` is the solo one (check your own, once a day).

## Why

Both games draw a fortune. Without a clear split they would compete for the same keywords, which is
the one thing a site that lives on SEO must not do to itself. But "a group playing together" and
"one person checking alone" are genuinely different search intents, on the same principle as
[ADR-0001](0001-category-means-search-intent.md), so they can stand as two pages without overlapping.

## Consequences

Nothing in the code or the validator enforces this split. It lives entirely in how `seo.title`,
`seo.description` and `keywords` are written for the two games. Write them loosely and the split
disappears immediately, with nothing breaking to show it. This has to be controlled while the content
is being written, not at code review.

`siamsi` will carry a "one slip means you're it" mode inside the existing game rather than as a new
URL, which makes it both a fortune game and a pick-the-loser game in one mechanic — matching the
**ดวงตัดสิน** axis in `CONTEXT.md`.

## Amendment — 2026-08-20: the "8" is not a roster count to build toward

[#52](https://github.com/warischa/watduang/issues/52) was filed because six games are built while this
ADR says eight, and games 7–8 had no ticket. The premise was wrong, and the correction belongs here.

Games 7 and 8 are not unspecified. They are exactly two rows of #5's table:

- row 4 — **ใครในวงนี้น่าจะ…**
- row 5 — **ความจริงหรือท้า**

[ADR-0011](0011-the-content-library-unlocks-by-risk-class-not-wholesale.md) has already ruled on both:
it refuses row 5 outright, and reserves row 4 for the owner's own separate call. So neither is
untracked work waiting for a ticket — both are **blocked on ADR-0011**, which is a content-risk
decision, not a build-order one.

Owner decision, 2026-08-20: **defer both.** Neither game can pay for itself before launch, and the
gate that would justify either is [ADR-0003](0003-seo-gate-is-search-console-clicks.md)'s month-6
organic-clicks threshold — whose month 1 has not started, because the deploy has never run
([#29](https://github.com/warischa/watduang/issues/29), and #9's domain is unregistered).

So read the "8" above as **6 built + 2 blocked on ADR-0011**, never as a count someone should close by
building two more games. Recording it this way is the point of the amendment: left as a bare "8", the
phantom count comes back the next time anyone counts the games.

**What would reopen it:** a decision to launch on party-category search demand
([#3](https://github.com/warischa/watduang/issues/3)). That makes row 4 revenue-relevant before launch,
and its authorization becomes worth spending the content review on.
