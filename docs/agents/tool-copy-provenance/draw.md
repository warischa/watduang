# Tool copy provenance — Draw (`src/pages/tool/draw.astro`)

Part of the split doc set; see [`../tool-copy-provenance.md`](../tool-copy-provenance.md) for the
authorship-cannot-be-recovered note, the source legend, the shared name-entry panel table
(`draw.astro` mounts `ToolNameEntry`), and the rows genuinely shared by all 4 tool pages (back
link, "วิธีใช้", GameNav heading).

## Shared chrome — draw/team only

`wheel.astro`/`number.astro` carry neither of these rows. Rows marked removed are kept as history; the
string no longer renders on this page (gh#288 Phase 3 replaced the chrome block with
`src/components/ToolHeader.astro`).

| String | Source |
|---|---|
| tool-eyebrow "ไม่ใช่เกม ตอบทันทีในกดเดียว ใครจ่าย ใครไปก่อน แบ่งทีมยังไง" | **agent-authored**, page-local — `toolsGroup.body` briefly held this exact string, then gh#87 removed the field while draw and team kept their own hardcoded copy. Flagged for the owner. **removed in gh#288 Phase 3 (header A, owner pick 10), commit f5c44fc.** |
| Top back row and breadcrumb "เครื่องมือสุ่มทั้งหมด" (two `<a href="/tools/">` above the title band, `draw.astro`) | artboard (`ToolDrawDesktop.dc.html`, `ToolDraw390.dc.html`) — **removed in gh#288 Phase 3 (header A, owner pick 10), commit f5c44fc**. The footer link with the same text stays; see the shared table in the index |
| Mobile pill "เครื่องมือ" | artboard draws it in `ToolWheel390.dc.html`, `ToolDraw390.dc.html`, `ToolTeam390.dc.html` — `wheel.astro` renders none though its own 390 artboard draws it (pre-existing drift, out of scope here); `number.astro` has no artboard and renders none. **removed in gh#288 Phase 3 (header A, owner pick 10), commit f5c44fc** — the `tool-badge` span is gone. |
| "ช่องโฆษณา" + "728 × 90 · ใต้เครื่องมือ · ตาม ADR-0004" (desktop) / "ช่องโฆษณา — ใต้เครื่องมือ (ADR-0004)" (mobile) | artboard (all six `Tool*.dc.html` ad blocks) — `wheel.astro`/`number.astro` shipped an empty `.ad-slot` div, no Thai text, until the same single label landed there. **Both ad-slot strings removed in gh#288 Phase 3 (header A, owner pick 10), commit f5c44fc**; the page now renders one "ช่องโฆษณา" label in the shared placeholder (see "Page copy"). |

## SEO metadata

| String | Source |
|---|---|
| `title`: "จับฉลาก — วัดดวง" (`draw.astro`) | **agent-authored** — no artboard carries a `<title>`; `{manifest name} — วัดดวง`, not a byte-copy of the manifest `name` field |
| `description`: one sentence (`draw.astro`) | **agent-authored** — reads similarly to the page's own tagline/intro but is a separately typed string, not byte-identical to `manifest.ts`'s `desc` field |

## Page copy

| String | Source |
|---|---|
| H1 "จับฉลาก", tagline, "จับกี่คน" label, "ยังอยู่ในกล่อง" heading | artboard (`ToolDrawDesktop.dc.html`) |
| (H1 and tagline above): "จับฉลาก" / "ใส่ชื่อลงกล่อง เลือกจำนวนที่จะจับ แล้วกดจับ — คนที่จับไปแล้วจะไม่ถูกจับซ้ำในรอบเดียวกัน" | moved, not removed — now passed as the `title` / `tagline` props to `src/components/ToolHeader.astro`; the Thai stays in `draw.astro`, the component carries none (gh#288 Phase 3, commit f5c44fc) |
| Ad-slot label "ช่องโฆษณา" (one label, `draw.astro`) | artboard (the ad-block title string, `ToolDrawDesktop.dc.html`) — kept from the retired two-line form; the single-label placeholder look is gh#288 Phase 3 owner pick 11 |
| Module heading "กล่องฉลาก" (`draw.astro`, distinct from the H1 above) | artboard (`ToolDrawDesktop.dc.html`, `ToolDraw390.dc.html`) — missed by the prior pass of this table |
| Buttons "จับฉลาก" / "เริ่มรอบใหม่" | artboard (`ToolDrawDesktop.dc.html`) |
| 'ยังจับไม่ได้ — ใส่ชื่ออย่างน้อย 2 ชื่อ แล้วกด "ใส่ชื่อลงกล่อง"' (×2: `draw.astro`) | **agent-authored** — brief-named, flagged for owner override |
| All other runtime templates ("จับได้: X", box-count, invalid-count, error fallback) | **agent-authored** — no canvas source |

## Logic module (`src/tools/draw.ts`)

gh#112: thrown `Error` messages surfaced to the player when the draw count is invalid.

| String | Source |
|---|---|
| `'ต้องจับฉลากอย่างน้อย 1 คน'` (`drawNames()` in `draw.ts`) | **agent-authored** — no artboard/manifest field, flagged for owner override |
| `` `เหลือชื่อในกล่องแค่ ${pool.length} คน จับ ${count} คนไม่ได้` `` (`drawNames()` in `draw.ts`) | **agent-authored** — no artboard/manifest field, flagged for owner override |
