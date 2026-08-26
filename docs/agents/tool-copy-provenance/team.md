# Tool copy provenance — Team (`src/pages/tool/team.astro`)

Part of the split doc set; see [`../tool-copy-provenance.md`](../tool-copy-provenance.md) for the
authorship-cannot-be-recovered note, the source legend, the shared name-entry panel table
(`team.astro` mounts `ToolNameEntry`), and the rows genuinely shared by all 4 tool pages (back
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
| `title`: "แบ่งทีม — วัดดวง" (`team.astro`) | **agent-authored** — no artboard carries a `<title>`; `{manifest name} — วัดดวง`, not a byte-copy of the manifest `name` field |
| `description`: one sentence (`team.astro`) | **agent-authored** — reads similarly to the page's own tagline/intro but is a separately typed string, not byte-identical to `manifest.ts`'s `desc` field |

## Page copy

| String | Source |
|---|---|
| H1 "แบ่งทีม", tagline, "จำนวนทีม" label | artboard (`ToolTeamDesktop.dc.html`, `ToolTeam390.dc.html`) |
| Button "แบ่งทีม" | artboard (`ToolTeamDesktop.dc.html`) |
| 'ยังแบ่งไม่ได้ — ใส่ชื่ออย่างน้อย 2 ชื่อ แล้วกด "ใส่ชื่อลงสนาม"' (×2: `team.astro`) | **agent-authored** — brief-named, flagged for owner override |
| Result templates "ทีม N — M คน (ได้คนเกิน)", "พร้อมแบ่ง N คน เป็น M ทีม", invalid-count, error fallback | **agent-authored** — no canvas source, though the "ทีม N — M คน" shape is documented (not authored) in `design/canvas.json`'s `copy-tools` note as a byte-exact module string |

## Logic module (`src/tools/team.ts`)

gh#112: thrown `Error` messages surfaced to the player when the roster or team count is invalid.

| String | Source |
|---|---|
| `` `แบ่งทีมต้องมีชื่ออย่างน้อย ${MIN_NAMES} คน (ตอนนี้มี ${names.length} คน)` `` (`splitTeams()` in `team.ts`) | **agent-authored** — no artboard/manifest field, flagged for owner override |
| `'จำนวนทีมต้องมีอย่างน้อย 1 ทีม'` (`splitTeams()` in `team.ts`) | **agent-authored** — no artboard/manifest field, flagged for owner override |
| `` `ขอ ${teamCount} ทีมไม่ได้ เพราะมีคนแค่ ${names.length} คน (ทีมนึงต้องมีอย่างน้อย 1 คน)` `` (`splitTeams()` in `team.ts`) | **agent-authored** — no artboard/manifest field, flagged for owner override |
