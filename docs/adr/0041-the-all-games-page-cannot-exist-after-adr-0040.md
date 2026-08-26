# ADR-0041 — the เกมทั้งหมด page cannot exist after ADR-0040

Date: 2026-08-26 · Status: accepted · Supersedes nothing · Retargets
[ADR-0014](0014-no-navigation-target-inside-the-stage.md) · Related:
[ADR-0040](0040-games-exist-in-one-category-only.md),
[ADR-0039](0039-the-shared-roster-belongs-to-one-category-not-to-the-site.md), issues #89, #107

## Context

`/games/` rendered `<h1>เกมทั้งหมด</h1>` over every entry in the games manifest — all six, including
`daily-fortune`, `love-match` and `siamsi`.

ADR-0040, accepted the day before, says those three are **not เกม**. They live in the ดูดวง หมวด, they
are solo, they have no roster and no turn order. So the page asserted, in an indexed `<h1>` and an
indexed `<title>`, the exact proposition ADR-0040 had just denied. It was not stale copy on a correct
page; the page's whole premise was the contradiction.

Nothing had noticed because no gate reads page titles for category claims, and #107 had been filed
about the *label* on links pointing at this page — the narrower symptom of the same thing.

## Decision

**The `/games/` page is deleted.** There is no all-games listing.

Its three jobs are reassigned to pages that can hold them honestly:

- **Browsing เกม** goes to `/c/party/`. Under ADR-0040 that page *is* the set of เกม, so a link
  labelled "choose a game" arriving there is correct rather than approximately correct.
- **Browsing ดูดวง** was never this page's job and goes to `/c/fortune/`, where it already was.
- **Leaving a game screen** goes to `/`. See below.

**ADR-0014's invariant is retargeted, not weakened.** That ADR requires one static crawlable link in
page chrome above `#stage`, exempt from the leave-confirm because it provably never moves under a
finger. Every one of those properties is a property of *where the link sits*, not of *where it goes*.
The link now points at `/` and reads กลับหน้าแรก, a string already in the tree. `data-stable-exit`,
its position as the first thing in `<main>`, and its exemption in `PlayerSetup.astro` are unchanged.

**The top bar loses its fourth entry rather than gaining a new target.** `PageChrome.astro` already
links สุ่มคนโดน to `/c/party/`; a second entry pointing at the same set would have been the same claim
twice under two names.

**`/games/` returns 301 to `/`**, declared in `public/staticwebapp.config.json` — the one file this
project allows to carry Azure routing (the portability rule keeps Azure specifics to two files).

## Why deletion rather than a corrected listing

A listing headed "all games" is only wrong because the set it enumerates is the whole manifest. The
obvious repair — filter it to the party category — produces a page identical in content to
`/c/party/`, competing with it for the same query and splitting its own link equity. Two URLs for one
set is worse for the one thing this project sells than having no listing at all.

The alternative of keeping the URL as a redirect-only stub was weighed and rejected as strictly more
machinery for the same outcome: the sitemap entry has to be suppressed either way, and a page that
exists only to redirect is a page a future session will try to render.

## Consequences

- **An indexed URL is removed.** That is the real cost, and it is paid now deliberately because the
  custom domain is not live yet (#9 is open), so there is nothing accumulating authority at
  `/games/` to lose. The same change in six months would cost measurably more.
- ADR-0014's own Consequences section records that this link's crawlability mattered "more than the
  bug fix does". It still does: every game page still carries exactly one static outbound link. It
  now points at the strongest page on the site instead of a leaf listing.
- **#107 is closed by this, not answered by it.** Its question — what the label on a link to
  `/games/` should say — stops existing along with the target.
- The stale `/games/` references in `scripts/stable-exit-markers-check.mjs` were documentary
  comments and synthetic fixtures, not assertions about the real href, so the gate never went red.
  They were corrected anyway: a fixture that mirrors production is the only kind worth reading.
- `sitemap()` derives from built pages, so deleting the page removed the entry with no config change.

## Still owed, and deliberately not decided here

The home page's game grid is headed **เกมทั้งหมด** and lists all six, which is the same claim this ADR
just deleted a whole page for. Its "see as a list" link now points at `/c/party/`, so the heading and
the link disagree about what the section contains.

Fixing it needs Thai copy, and copy is the owner's. It is recorded on **#89** with the other
party-size and scope wording, because #89 owns the rule that decides all of them at once rather than
one string at a time.

## The fact that would change this

Evidence from Search Console that a flat all-games listing earns traffic the two category pages do
not — a query pattern that wants the union rather than either half. That would argue for one listing
page whose title claims only what ADR-0040 permits, and it would need a name that is not เกมทั้งหมด.
