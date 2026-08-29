# ADR-0033 — a design value not in the canvas is drift, not a choice

Date: 2026-08-25 · Status: accepted · Supersedes: nothing · Relates: ADR-0031, ADR-0032, gh#74, gh#75, gh#76
Narrowed by: [ADR-0050](0050-party-games-go-full-screen-landings-deleted.md) — the canvas stops
governing party-game surfaces (2026-08-29); it still governs the shell, home, category pages, and
tools.

## Context

gh#74 shipped four token values into `src/styles/tokens.css`: `--accent-gold: #e8b317`,
`--accent-punch: #ff5349`, `--color-ground-warm: #fff4dc`, `--color-line-strong: #111111`. A fleet
picked them from the phrase "pop-card" in prose. None of the four appears anywhere under `design/`.

The canvas says something else. `design/CatFortune.dc.html` paints the fortune accent `#ffd27f`,
`design/CatParty.dc.html` paints the party accent `#f89880`, and `design/HubNeutral.dc.html` grounds
its page in `#fffdf7` with `#1a1a1a` rules and a third group accent `#7fd8e8`.

Nothing caught this. A colour value has no type, no test, and no gate — `tsc`, the build, 188 tests
and every gate script were green on all four wrong values. The previous session recorded the gap as
an owner queue item ("review the accent colours before this goes live") rather than a defect,
because at that point nobody had compared the two sources.

gh#76 then made the drift load-bearing: its acceptance criteria require the accent a game uses to be
the same one its card carries on the home page and on its category page. Three surfaces now had to
agree on values that came from prose.

## Decision

**The design canvas under `design/` is the source of truth for every design value — colour, size,
radius, border weight, and copy. A value in the code that is not in the canvas is drift, not a
design choice, and gets replaced by the canvas value.**

Two consequences follow, and they are the operative part of this ADR:

1. **Design values are extracted by the orchestrator, before any implementation brief goes out, and
   handed to implementers as exact strings.** A brief that describes a design direction in prose
   licenses the implementer to invent, and no Verify line can express what the right value was.
   This is the same rule the repo already applies to Thai copy; the copy was guarded and survived
   byte-exact through gh#74 while the colours, unguarded, did not.
2. **The canvas is not automatically right about structure.** `design/HubNeutral.dc.html`'s lead
   copy enumerates the three current groups, which directly fails gh#75's acceptance criterion 8
   ("adding a fourth group requires no change to the H1 or the lead"). Where the canvas and a
   ticket's acceptance criteria conflict, the criteria win and the deviation is recorded. The canvas
   owns values; the ticket owns structure.

The four values were replaced and `--accent-sky: #7fd8e8` added for the tools group. The site owner
confirmed the swap on 2026-08-25, which closes the queue item rather than deferring it.

## Alternatives rejected

**Keep the committed values and let the owner decide later.** Rejected: gh#75 and gh#76 both build
on the accent, so a later swap re-touches both diffs, and neither could satisfy its own
same-accent-everywhere criterion in the meantime.

**Treat the canvas as advisory and let implementers interpret it.** Rejected — that is exactly what
produced `#e8b317`. The failure was not a bad eye, it was a brief that described instead of
specified.

## The fact that would change this

The owner replacing a canvas value in the code with a value that is not in the canvas — at which
point the canvas is no longer the source of truth and this ADR is superseded, not bent. A value
changed in the canvas first and then in code is this ADR working, not an exception to it.

## Prediction to score later

If this holds, no future session should find a colour or size in `src/**` that is absent from
`design/`. A single such find is evidence the extraction step is being skipped, not that the rule is
wrong.
