# Tool copy provenance — Draw (`src/pages/tool/draw.astro`)

Part of the split doc set; see [`../tool-copy-provenance.md`](../tool-copy-provenance.md) for the
authorship-cannot-be-recovered note, the source legend, the shared name-entry panel table
(`draw.astro` mounts `ToolNameEntry`), and the rows genuinely shared by all 4 tool pages (back
link, "วิธีใช้", GameNav heading).

## Shared chrome — draw/team only

`wheel.astro`/`number.astro` carry neither of these rows.

| String | Source |
|---|---|
| tool-eyebrow "ไม่ใช่เกม ตอบทันทีในกดเดียว ใครจ่าย ใครไปก่อน แบ่งทีมยังไง" | **agent-authored**, page-local — `toolsGroup.body` briefly held this exact string, then gh#87 removed the field while draw and team kept their own hardcoded copy. Flagged for the owner |
| Mobile pill "เครื่องมือ" | artboard draws it in `ToolWheel390.dc.html`, `ToolDraw390.dc.html`, `ToolTeam390.dc.html` — `wheel.astro` renders none though its own 390 artboard draws it (pre-existing drift, out of scope here); `number.astro` has no artboard and renders none |
| "ช่องโฆษณา" + "728 × 90 · ใต้เครื่องมือ · ตาม ADR-0004" (desktop) / "ช่องโฆษณา — ใต้เครื่องมือ (ADR-0004)" (mobile) | artboard (all six `Tool*.dc.html` ad blocks) — `wheel.astro`/`number.astro` ship an empty `.ad-slot` div, no Thai text |

## SEO metadata

| String | Source |
|---|---|
| `title`: "จับฉลาก — วัดดวง" (`draw.astro:8`) | **agent-authored** — no artboard carries a `<title>`; `{manifest name} — วัดดวง`, not a byte-copy of the manifest `name` field |
| `description`: one sentence (`draw.astro:9`) | **agent-authored** — reads similarly to the page's own tagline/intro but is a separately typed string, not byte-identical to `manifest.ts`'s `desc` field |

## Page copy

| String | Source |
|---|---|
| H1 "จับฉลาก", tagline, "จับกี่คน" label, "ยังอยู่ในกล่อง" heading | artboard (`ToolDrawDesktop.dc.html`) |
| Module heading "กล่องฉลาก" (`draw.astro:52`, distinct from the H1 above) | artboard (`ToolDrawDesktop.dc.html`, `ToolDraw390.dc.html`) — missed by the prior pass of this table |
| Buttons "จับฉลาก" / "เริ่มรอบใหม่" | artboard (`ToolDrawDesktop.dc.html`) |
| 'ยังจับไม่ได้ — ใส่ชื่ออย่างน้อย 2 ชื่อ แล้วกด "ใส่ชื่อลงกล่อง"' (×2: `draw.astro:75`, `:595`) | **agent-authored** — brief-named, flagged for owner override |
| All other runtime templates ("จับได้: X", box-count, invalid-count, error fallback) | **agent-authored** — no canvas source |
