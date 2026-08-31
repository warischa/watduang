# ADR-0055 — the play-route directory is the protected region, and the channel is guarded separately

Date: 2026-08-31 · Status: accepted · Owner decision · Re-scopes: [ADR-0014](0014-no-navigation-target-inside-the-stage.md) · Relates: [ADR-0026](0026-a-set-we-do-not-own-is-guarded-at-authorship.md), [ADR-0028](0028-an-invariant-is-enforced-at-the-layer-that-declares-the-element.md), [ADR-0041](0041-the-all-games-page-cannot-exist-after-adr-0040.md), [ADR-0050](0050-party-games-go-full-screen-landings-deleted.md), gh#167, gh#162, gh#163

## Context

ADR-0014 forbids an `<a href>` inside `#stage`, because a double-tap on a transition lands on the
link and leaves the round. The rule was written when games rendered inside a shell layout that
declares `#stage`.

Every party game is now a play route, and **no play route renders `#stage`**. Both instruments that
enforced ADR-0014 were scoped to the layer that has the element: the static check globbed
`src/games/*.ts` plus `src/layouts/GameLayout.astro`, and the runtime probe queried
`document.getElementById('stage')`, which is `null` on every play route. The rule therefore read as
enforced while nothing enforced it for any shipped game.

This was not theoretical. `src/play/wire-snip-panic/main.js` interpolated player names into
`innerHTML` unescaped at three sinks, one of them an attribute, so a name of `"><a href=/>x` — 13
characters, under a `maxlength="15"` — produced a live anchor beside the round's own controls. That
is exactly ADR-0014's harm, in exactly the adjacency it describes, and both gates were structurally
blind to it. The escaping was fixed in `02e2ba2`; the scope gap is what this ADR closes.

## Decision

**1. The protected region on a play route is the directory.** Everything under `src/play/<id>/` is
the play surface. Page chrome — `src/shell/PlayExit.astro` and `src/pages/game/<id>/play.astro` —
lives outside `src/play/**` by construction, so the boundary needs no marker element, and no marker
element should be invented for it. A route is in scope the day its directory lands.

**2. The scanned file set is derived by extension, never by a name list.** Play routes do not share
a file shape: some ship `main.js`, others `main.ts`; some carry a `roster-bridge.ts` and some do
not; `timebomb` and `short-stick` each add their own canvas module. A fixed per-route triple would
have left two routes' entire game logic unscanned. The derivation is every directory under
`src/play/`, then every `.html`, `.js` and `.ts` file inside it, minus `*.test.*`.

**3. The safe set is empty, so the guard is inverted.** No play route has a legitimate anchor today.
The rule is therefore *ban every anchor in the region*, not *allow a listed few* — an allow-list is a
set that grows with each author and never converges (ADR-0016, ADR-0026).

**4. Element and channel are different sets with different owners, and each keeps its own guard.**
The literal bytes an author types into `src/play/**` are author-owned and finite, so a static scan
converges on them: `scripts/no-nav-in-stage-check.mjs`. Player names are attacker-owned and
unbounded, so they are guarded at the escape sink instead, per ADR-0026:
`src/play/name-escaping.test.mjs`. Neither substitutes for the other. A static scan cannot see an
anchor assembled at runtime; an escaping test cannot see an anchor typed into markup.

**5. No new runtime probe.** `scripts/no-nav-in-stage-probe.mjs` keeps its existing shell-layer
scope. A one-moment DOM query enumerates reachable states — a set owned by game logic crossed with
player input, which is unbounded — and a probe over it would repeat the coverage claim ADR-0019
forbids.

## What this ADR does NOT do

It does not widen any other gate. The same `src/games`-era scope ceiling sits on most of this repo's
gate fleet, and that is a separate, larger finding tracked on its own ticket. Reading this ADR as
evidence that the fleet is now correctly scoped would be exactly the unearned coverage claim
ADR-0019 exists to prevent.

## Consequences

- `scripts/no-nav-in-stage-check.mjs` now scans three regions: the game modules, the shell layout,
  and the play-route directories. It blanks HTML comments before matching, because two routes carry
  the sentence "No `<a href>` anywhere in here" as prose inside `<!-- -->`; blanking the comment is
  correct, and weakening the pattern to accommodate the prose would not be.
- The check prints its region counts from the measured sets, never from a literal, so a green cannot
  imply coverage it has not earned. Run `node scripts/no-nav-in-stage-check.mjs` for the current
  numbers rather than citing them from here.
- Calibration, run before this ADR was written: an `<a href="/">x</a>` planted in the body of
  `src/play/freeze-tap/markup.html` makes the widened check exit 1 and name the file; removing it
  returns exit 0. The pre-widening script, run against the same plant from a repo-shaped directory
  and with a positive control proving the detector was alive, exits 0 — so the widening is what
  closes the hole, not a coincidence.
- A game whose mechanic legitimately needs an anchor inside its own directory would break the
  directory-boundary region definition. None exists today. If one is ever proposed, this ADR is what
  it has to argue with.
