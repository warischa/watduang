# ADR-0034 — copy a second surface needs lives in the manifest, not in the page

Date: 2026-08-25 · Status: accepted · Relates: ADR-0032, ADR-0033, gh#74, gh#75

## Context

gh#75 turns the home page into a hub over three groups. Its acceptance criteria say the two game
groups are "sourced from the category manifest" and that each group shows "its when-to-use line".

The manifest already had a when-to-use line per category, but a short one written for the category
page's own H1 area: `'อยากรู้ว่าวันนี้ดวงเป็นยังไง หรือคู่ไหนเข้ากัน'` and
`'ต้องหาคนโดน คนจ่าย หรือคนเริ่มก่อน'`. The approved hub design carries something different and
longer for each group — a keyword-bearing heading plus a body line, e.g. heading
`'ดูดวง ทำนายโชคชะตา'` over `'ไม่มีใครแพ้ ไม่มีใครโดน จั่วได้แล้วอ่านให้วงฟัง เหมาะกับวงที่เพิ่งเจอกัน'`.
The tools group's copy had no home in any manifest at all.

So the hub needed copy that (a) is not what the category page renders, and (b) for one of the three
groups did not exist in a manifest yet. SEO is this site's business model (ADR-0001), and the home
page is its highest-authority page, so dropping the keyword headings was not a free simplification.

## Decision

**When a second surface needs copy the first surface does not render, the copy goes into the
manifest as new named fields — never inline into the consuming page, and never by overwriting the
first surface's fields.**

Concretely: `CategoryMeta` gained `hubHeading` and `hubBody`, and `src/tools/manifest.ts` gained an
exported `toolsGroup` carrying `heading`, `body`, `href` and `accentVar`. `label` and `whenToUse`
are untouched and still belong to the category page.

Two boundaries this decision draws:

- **gh#74's "existing content unchanged" scopes to content, not to schema.** Adding a field renders
  nothing new on the pages that shipped; their output is byte-identical. A reading that banned
  schema growth would freeze the manifest at whatever its first consumer happened to need.
- **The tools group's copy does NOT go in `src/games/categories.ts`.** That record is keyed by the
  hand-written game category union (ADR-0032), so a third key for tools would make every game's
  category check accept a value no game can hold. Tools are not a category; their copy lives with
  the tools.

The precedent is already in the repo, in `src/tools/manifest.ts`'s own header: it exists because
"the home page became a second consumer; two copies of the same pairs drifting apart is the bug this
removes."

## Alternatives rejected

**Render `label` + `whenToUse` on the hub and drop the canvas headings.** Rejected: it removes
`ทำนายโชคชะตา` and the brand term from the site's highest-authority page, and it leaves the tools
group with no copy source whatever.

**Hard-code the three groups' copy in `index.astro`.** Rejected: three groups' worth of copy sitting
against the manifests is the exact drift bug `tools/manifest.ts` was created to remove, and it would
also make the group set enumerable in the page — colliding with gh#75's criterion 8.

## The fact that would change this

A third consumer wanting yet another variant of the same line. At that point the manifest is
accumulating one field per surface, and the shape to reach for is a keyed sub-object
(`copy: { category: …, hub: … }`), not a fifth flat field.
