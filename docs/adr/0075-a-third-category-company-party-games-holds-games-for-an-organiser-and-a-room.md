# ADR-0075 — a third หมวด, เกมงานเลี้ยงบริษัท, holds เกม for an organiser and a room

Date: 2026-11-11 · Status: accepted · Owner decision (gh#299 grilling, decision 1) ·
Amends: [ADR-0040](0040-games-exist-in-one-category-only.md) ·
Relates: [ADR-0001](0001-category-means-search-intent.md),
[ADR-0004](0004-tools-come-before-more-games.md),
[ADR-0039](0039-the-shared-roster-belongs-to-one-category-not-to-the-site.md),
[ADR-0074](0074-the-feedback-endpoint-is-a-linked-function-outside-the-build.md), gh#299, gh#301

## Context

The owner wants a company New Year prize draw for 50–200 employees: an MC drives one projected
screen, the room is cut over 4 elimination rounds to 5 finalists, and a final game picks the
prize holders from a list of names (gh#299). A one-click winner gives the room no suspense and no
part to play.

ADR-0040 says เกม exist in the สุ่มคนโดน (`party`) หมวด alone. The event has rounds and an outcome
the whole room shares, so it is a เกม by the CONTEXT.md definition — and it does not belong in
`party`. Its searcher is an organiser typing "จับรางวัล" or "เกมงานเลี้ยงบริษัท", not a วง looking
for who โดน. Its scale (50–200 names), its audience (a room on one projector, not one phone) and
its roster (per event) are different in kind, not degree.

## Decision

**A third หมวด, เกมงานเลี้ยงบริษัท, is admitted, and it holds เกม.** ADR-0040's sentence "เกม exist
in the party หมวด alone" is amended to: เกม exist in the `party` หมวด and the เกมงานเลี้ยงบริษัท
หมวด. ดูดวง pages stay solo and เครื่องมือ stay instant answers; nothing in ADR-0040 about them
moves.

**The 2–10 player range and phone-passing stay true of the `party` หมวด only.** They are not
claims about this หมวด: its events run on a head count the MC types or a QR join fills, and the
phone is not passed around. ADR-0040's site-wide rule stands as written — nothing may claim 2–10
players or phone-passing as a fact about the whole site, and a surface may state them only where
`party` is the subject. A เกม here does not declare a 2–10 range.

**The CONTEXT.md definition of เกม is read with one substitution.** "Has turn order" is met in
this หมวด by the MC's cut schedule and the round the MC picks. Rounds and an outcome the room
shares are unchanged. CONTEXT.md carries the edit; this is named here rather than left for a reader
to find as a quiet mismatch.

**The event's roster is its own.** ADR-0039 binds the shared roster to `party`; this ADR does not
extend it. An event holds only people who are present (gh#299 decision 8). This is an agent
reading of decisions 4 and 8, revisable on request.

## Why this is a หมวด and not a 5th เครื่องมือ

CONTEXT.md defines a เครื่องมือ as an answer at once, with no rounds and no turn order. The tools
hub says "ไม่ใช่เกม ตอบทันทีในกดเดียว". This event is a sequence: setup, 4 elimination rounds,
a final, a result — the opposite of one click. Calling it a tool would break the one definition
that separates a เครื่องมือ from a เกม, and whoever searched for a เครื่องมือ was not looking for
a เกม (the ADR-0004 line).

## Squaring it with ADR-0001

ADR-0001 says a หมวด is a searcher's intent, not a mechanic. The intent here is a third one:
"games for a company party" and "จับรางวัล / จับฉลากรางวัลปีใหม่". It is neither ดูดวง ("an answer
about me") nor สุ่มคนโดน ("who in my วง โดน"). The mechanism inside is the same drawing of chance
as the other two, which is exactly the case ADR-0001 was written for: same code, different
searcher, different page for the SERP to rank. The axis stays enforceable because the หมวด is
declared by every page and validated — a third value is a registry addition, not a new rule.

ADR-0001's `category: 'party' | 'fortune'` union widens by one value. The slug is not fixed here;
the ticket that wires the หมวด registry chooses it.

## What it costs, stated plainly

- **Keyword volume is unmeasured.** Keyword Planner (gh#12) is parked, so "this intent exists in
  worthwhile volume" is inferred from the owner's brief, not measured. A หมวด with no searchers
  is a cost: a hub page, pinned-count gates in `docs/runbook.md`, and a registry entry. If Search
  Console (ADR-0003) shows the หมวด earns nothing, supersede this ADR rather than patch it.
- **A third หมวด trips the pinned-count gates** — the cost is paid once, in the ticket that adds
  the first page.
- **ADR-0007's invariant is untouched.** A party-size guard still enumerates the full party
  wherever a party exists; this หมวด has no 2–10 range for it to guard.

## What this does NOT cover

- **The QR-join backend.** The build is pure static, so QR join needs a server. It extends the
  linked Function App of ADR-0074 and **needs its own ADR** (gh#308), which also squares it with
  the portability rule that names `services/feedback/` as the Azure home. Nothing here admits it.
- **Privacy of joined names** (PDPA, auto-delete, no IP logging): part of the join slice, not
  decided here.
- **Visual and 3D choices.** `three` is already admitted (ADR-0060); each new 3D route re-pins the
  bundle freeze in its own change. Design values come from the canvas first (ADR-0033).
- **The play-surface rules.** ADR-0014, ADR-0041, ADR-0055, ADR-0057 and ADR-0059 bind every game
  surface here as anywhere.
- **Player-facing Thai wording** of the event's terms. CONTEXT.md keys them in English until the
  canvas tickets fix the copy.
- **Gambling wording.** CONTEXT.md bars the words that read as gambling (the AdSense risk) and the
  new หมวด inherits that bar; its entry lists them.
