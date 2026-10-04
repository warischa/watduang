# ADR-0069 — Canvas D's palette replaces the ADR-0033 accents, site-wide

Date: 2026-10-04 · Status: accepted (owner ruling, popup, while gh#244 was being built) ·
Supersedes: the gh#192 (c) ruling of 2026-09-06 · Relates: ADR-0033, gh#243, gh#244, gh#246

## Context

gh#192 (c) kept the ADR-0033 accents: `--accent-gold #ffd27f`, `--accent-punch #f89880` and
`--accent-sky #7fd8e8`. On 2026-10-01 the owner ruled that the live home page's "colours and type are
not bold enough" (gh#243, lack 3). On 2026-10-04 the owner picked direction D, Toy Shelf, for the home
page. D answers lack 3 with its own palette, and D's notes say adopting that palette is the owner's
decision. The pick prompt carried D's structural cost but not its palette cost, so the question was
put separately when gh#244 started.

## Decision

**The whole site takes canvas D's palette** (`design/HomeShelfDesktop.dc.html`,
`design/HomeShelf320.dc.html`):

| Token | Was | Now |
|---|---|---|
| `--accent-gold` (fortune) | `#ffd27f` | `#ffcc00` |
| `--accent-punch` (party) | `#f89880` | `#ff3d7f` |
| `--accent-sky` (tools) | `#7fd8e8` | `#2b7bff` |
| `--color-line-strong`, `--color-text` (ink) | `#1a1a1a` | `#14142b` |
| `--color-ground-warm` (page ground) | `#fffdf7` | `#fff6e0` |
| `--color-muted` (secondary text) | `#6b7280` | `#3d3b5c` |

The secondary-text row was added after a measurement on the same day. The old grey was 4.75:1 on
the old ground but only 4.49:1 on D's cream, below the 4.5:1 AA minimum. So it takes D's own
secondary-text colour, which measures 9.86:1 on the cream.

The category→accent mapping is unchanged, because D uses the same one. Literal copies of the old ink
and ground move with the tokens, so no surface keeps the old palette. Those copies are the alpha
fills, the inline SVG strokes, and `ToolNameEntry`.

**ADR-0033 is not superseded.** Its trigger is a value that is not in the canvas, and these values
are in canvas D. What changes is the tie-break. The canvas holds two palettes: D's, and the older
trio still painted on `CatFortune`, `CatParty`, `HubNeutral` and the tool artboards. The owner's
ruling picks D for every surface, so those artboards are now stale on colour. They are not drift
sources.

## Consequences

- Text contrast, measured 2026-10-04: ink on gold 11.93, ink on punch 5.35, ink on sky 4.62. Every
  token-driven surface puts ink on its accent, so all three pass the 4.5:1 AA minimum. White on punch
  is 3.37 and white on sky is 3.90. Canvas D paints white text on sky in the home page's tool tiles,
  and on both colours in its nav pills (gh#247). That is an owner finding, not a token question.
- A palette change re-measures every text pair on each surface it changes, not just the text on the
  accents. This swap measured the accents and missed the text on the new ground, which `c43d91e`
  then fixed. The instrument is `docs/verification/evidence/ui-audit-2026-10-04/ui-audit-probe.mjs`.
- `accent-single-source-check` CLASS V holds the wheel palette to the new trio, and
  `category-pop-probe` pins the new RGB values.
- The play routes under `src/play/**` keep their own named accents (ADR-0050). The OG images keep the
  palette baked in by `scripts/make-og.mjs`.

## What would flip this

An owner ruling for a different palette. A change to the canvas first, then to the code, is this
ADR working, not an exception to it.
