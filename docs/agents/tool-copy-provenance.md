# Tool copy provenance — every Thai string, and who put it there

gh#112's fourth box: the deviation/authorship list belongs in a committed file, not a commit
message, so the next rewrite inherits it instead of re-deriving it.

**Split, 2026-08-26:** this file was a single-table growth registry against a fixed 12288-byte
budget, and its own contract ("every new Thai string adds a row") meant an unrelated copy change
elsewhere in the repo would eventually fail that budget gate inside its own commit. Split per tool
page — this file is now the index plus everything genuinely shared across all 4 (or 3 of 4) pages;
per-tool rows moved out:

- [`tool-copy-provenance/wheel.md`](tool-copy-provenance/wheel.md) — `src/pages/tool/wheel.astro` + `src/tools/wheel.ts`
- [`tool-copy-provenance/draw.md`](tool-copy-provenance/draw.md) — `src/pages/tool/draw.astro` + `src/tools/draw.ts`
- [`tool-copy-provenance/team.md`](tool-copy-provenance/team.md) — `src/pages/tool/team.astro` + `src/tools/team.ts`
- [`tool-copy-provenance/number.md`](tool-copy-provenance/number.md) — `src/pages/tool/number.astro` + `src/tools/number.ts`

**gh#112, 2026-08-26:** scope widened to also cover user-facing Thai string literals (thrown
`Error` messages surfaced to the player) in the four `src/tools/*.ts` logic modules — those had
no artboard and no manifest field, so they were agent-authored Thai sitting outside every
disclosure list. Comments in `src/tools/name-list.ts` and `src/tools/draw-round.ts` are Thai but
not user-facing copy, so those two files stay out of scope.

No existing file in `docs/agents/` split into a directory before this; this layout (flat index +
same-named subdirectory) is the new convention for the next doc that outgrows its own budget.

## Read this first — authorship cannot be recovered from the tree

**A diff cannot tell owner-authored Thai from agent-authored Thai.** Both are just UTF-8 bytes;
there is no comment, commit trailer, or blame entry that reliably survives a rebase, a squash, or
a copy-paste between files. A scanner can find where a string *lives* (artboard vs. manifest vs.
nowhere-in-canvas) but it cannot find who *wrote* it. That is why this table exists as a
hand-maintained record, built at authorship time, and why it can never be regenerated from the
repo alone — the day this file goes stale is the day the next session has no way to know which
strings the owner can silently overrule and which strings are a design decision already made.

## Source legend

Applies to every table in this file and in `tool-copy-provenance/*.md`.

- **artboard** — the exact string is drawn in a named `.dc.html` under `design/` (or a
  `design/canvas.json` annotation, which is the canvas's own documentation layer, not code).
- **manifest** — the string is a field in `src/tools/manifest.ts` (`tools[].name`, `.desc`, or
  `toolsGroup`).
- **agent-authored** — no artboard and no manifest field carries this string; an agent typed it
  directly into `src/pages/tool/*.astro`, `src/components/ToolNameEntry.astro`, or one of the
  `src/tools/*.ts` logic modules (thrown `Error` messages the page surfaces to the player).
  Legitimate until overruled — flagged so the owner can overrule it.

## Shared name-entry panel (`src/components/ToolNameEntry.astro`)

Stated once here, not once per tool file, because one component renders it for all three of
wheel/draw/team (`number.astro` has no roster and never mounts this component).

| String | Source |
|---|---|
| Heading "ชื่อในวง" / "ชื่อในกล่อง" / "ชื่อในสนาม" | artboard (`ToolNameEntry.dc.html`, per-tool `Tool*Desktop`/`Tool*390`) |
| Hint "ใส่ได้กี่คนก็ได้" | artboard (`ToolNameEntry.dc.html`) — unchanged this session |
| Placeholder "พิมพ์ชื่อ บรรทัดละ 1 ชื่อ" | artboard (`ToolNameEntry.dc.html`) — owner-decided copy, this session |
| Empty state "ยังไม่มีชื่อในแผง — พิมพ์บรรทัดละ 1 ชื่อ ใส่ได้ไม่มีเพดาน" | artboard (`ToolNameEntry.dc.html`, state 1) — owner-decided, this session; the shipped component renders no separate empty-state text ("an empty box is its own empty state" per its own header comment), so this string exists only as canvas documentation of the empty mockup frame, not as rendered DOM |
| CTA "ใส่ชื่อลงวงล้อ" / "ใส่ชื่อลงกล่อง" / "ใส่ชื่อลงสนาม" | artboard (`ToolNameEntry.dc.html` dashed note; `ToolWheelDesktop.dc.html`/`ToolWheel390.dc.html`/`ToolDrawDesktop.dc.html`/`ToolTeamDesktop.dc.html`) — unchanged this session |

## Manifest (`src/tools/manifest.ts`)

One file, all 4 tools — stays here rather than split 4 ways.

| String | Source |
|---|---|
| 4 tool names: วงล้อสุ่มชื่อ · จับฉลาก · แบ่งทีม · สุ่มเลข | manifest |
| 4 `desc` lines (hub/index card copy) | manifest |
| `toolsGroup.heading` / `.body` | **removed** by gh#87 (ADR-0034) — no longer exists; see the `tool-eyebrow` row in `tool-copy-provenance/draw.md` and `team.md` |

## Shared chrome — genuinely all 4 pages

`wheel.astro`/`number.astro` use plainer `<main>`/`<h1>` markup, no breadcrumb/badge/band/ad-slot
text; `draw.astro`/`team.astro` share a fuller chrome block — those two-page-only rows live in
`tool-copy-provenance/draw.md` and `team.md`, not here. Only rows true for all 4 tool pages stay
in this shared table.

| String | Source |
|---|---|
| Back link / footer link "เครื่องมือสุ่มทั้งหมด" (genuinely all 4 pages) | artboard (`ToolWheelDesktop.dc.html`, `ToolWheel390.dc.html`, `ToolDrawDesktop.dc.html`, `ToolTeamDesktop.dc.html`, `ToolDraw390.dc.html`, `ToolTeam390.dc.html`) |
| "วิธีใช้" heading + its 2–3 how-to `<li>` lines per page (genuinely all 4 pages) | **agent-authored** — no `.dc.html`/`canvas.json` note draws a "วิธีใช้" block; written straight into each `*.astro` page |
| GameNav heading "เล่นเกมต่อ" — identical literal on all 4 tool pages (`wheel.astro`, `draw.astro`, `team.astro`, `number.astro`) | **agent-authored** — `GameNav.astro`'s `heading` prop is required, no default, by design (gh#111): a default would be silently inherited and false wherever a caller's group does not carry on; no artboard/manifest field carries it |

## SEO metadata (`<Base title=… description=…>`, one pair per tool page)

Split per tool — see the "SEO metadata" section in each `tool-copy-provenance/*.md` file.

## Maintenance rule

Whoever writes a new Thai string on a tool page adds its row to that tool's own
`tool-copy-provenance/{wheel,draw,team,number}.md` file **in the same change**, marked by source
at authorship time. A string genuinely shared by all 4 (or all 3 name-entry) pages goes here
instead, so it is written once. A future audit of these files against the tree can confirm a
string's *current location*; it can never confirm who typed it first — that fact only exists here.

## Reconciliation pass, 2026-08-26

A pre-merge review found this file's completeness claim false: representative, not exhaustive.
Re-derived by grepping every Thai string in `src/pages/tool/*.astro` and
`src/components/ToolNameEntry.astro`, checked against the table instead of trusting its prior
list. Fixed: the SEO metadata section and GameNav-heading row (wholly absent before), two missed
module headings ("วงล้อ", "กล่องฉลาก" — now in `wheel.md`/`draw.md`), and three "all 4 tool
pages" claims true for only 2 of 4. Runtime-template rows stay bundled ("all other
`noteEl`/`resultEl` templates") rather than quoting every interpolated variant — pre-existing
pattern, unchanged. Per-category coverage is complete against the current tree; it still cannot
tell you who typed a string first beyond what a row already records. Same pre-merge review's
second finding (this file's own byte budget) is why this file is now an index — see the split
note at the top.

## gh#112 follow-up, 2026-08-26 — the completeness claim above was false

"Per-category coverage is complete against the current tree" was checked only against
`src/pages/tool/*.astro` and `src/components/ToolNameEntry.astro`; this file's own title
("every Thai string, and who put it there") makes no such carve-out, and 8 undisclosed
agent-authored Thai error strings were sitting in `src/tools/wheel.ts`, `draw.ts`, `team.ts`, and
`number.ts` the whole time — a real gap against ADR-0026's rule, not just an incomplete list.
Fixed: scope widened above, and a "Logic module" table added to each of `wheel.md`, `draw.md`,
`team.md`, `number.md` covering every thrown-`Error` Thai string in the matching `src/tools/*.ts`
file. Coverage is now complete against `src/pages/tool/*.astro` + `src/components/ToolNameEntry.astro`
+ `src/tools/*.ts` string literals; Thai inside code *comments* (`name-list.ts`, `draw-round.ts`)
is out of scope by definition — comments are not player-facing copy.
