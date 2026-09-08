# Tool copy provenance — Wheel (`src/pages/tool/wheel.astro`)

Part of the split doc set; see [`../tool-copy-provenance.md`](../tool-copy-provenance.md) for the
authorship-cannot-be-recovered note, the source legend, the shared name-entry panel table
(`wheel.astro` mounts `ToolNameEntry`), and the rows genuinely shared by all 4 tool pages (back
link, "วิธีใช้", GameNav heading).

`wheel.astro` carries no `tool-eyebrow`/`tool-badge`/`tool-breadcrumb` markup and ships an empty
`.ad-slot` with no Thai text — those rows exist only in `draw.md` and `team.md`.

## SEO metadata

| String | Source |
|---|---|
| `title`: "วงล้อสุ่มชื่อ — วัดดวง" (`wheel.astro`) | **agent-authored** — no artboard carries a `<title>`; `{manifest name} — วัดดวง`, not a byte-copy of the manifest `name` field |
| `description`: one sentence (`wheel.astro`) | **agent-authored** — reads similarly to the page's own tagline/intro but is a separately typed string, not byte-identical to `manifest.ts`'s `desc` field |

## Page copy

| String | Source |
|---|---|
| H1 "วงล้อสุ่มชื่อ", intro "ใส่ชื่อในวง กดหมุน แล้วให้ดวงตัดสินว่าใครโดน" | artboard (`ToolWheelDesktop.dc.html`) — **note:** that artboard still carries the older, longer wording with the clause gh#94 deleted from the manifest desc ("หมุนเสร็จกดต่อเข้าเกมได้เลย รายชื่อไหลต่อไปเอง"); the page dropped the clause, the artboard did not — pre-existing drift, out of this session's scope to fix |
| Module heading "วงล้อ" (`wheel.astro`, distinct from the H1 above) | artboard (`ToolWheelDesktop.dc.html`, `ToolWheel390.dc.html`) — missed by the prior pass of this table |
| Mode labels "A · หมุนแล้วช้าลงจนหยุดเอง" / 'B · หมุนค้างไว้ จนกว่าจะกด "หยุด"' | artboard (`ToolWheelDesktop.dc.html`, `ToolWheel390.dc.html`) |
| Buttons "หมุน" / "หยุด" / "คืนทุกชื่อเข้าวงล้อ" | artboard (both wheel artboards) |
| Checkbox label "เอาคนที่ออกแล้วออกจากวงล้อ" | artboard (both wheel artboards) |
| 'ยังหมุนไม่ได้ — ใส่ชื่ออย่างน้อย 2 ชื่อ แล้วกด "ใส่ชื่อลงวงล้อ"' (×2: `wheel.astro`) | **agent-authored** — brief-named, flagged for owner override |
| All other `noteEl`/`resultEl` runtime templates (spinning, single-name guard, all-eliminated, last-one, error fallback) | **agent-authored** — no canvas source |

## Logic module (`src/tools/wheel.ts`)

gh#112: thrown `Error` message surfaced to the player when the roster is too small to spin.

| String | Source |
|---|---|
| `` `วงล้อสุ่มต้องมีชื่ออย่างน้อย ${MIN_NAMES} คน (ตอนนี้มี ${names.length} คน)` `` (`pickName()` in `wheel.ts`) | **agent-authored** — no artboard/manifest field, flagged for owner override |

## Layout deviations (ADR-0033)

gh#112 box 3, resolved 2026-09-08 as a **recorded deviation**, not a canvas trace.

| Value | Where | Verdict |
|---|---|---|
| `padding: 8px 14px` on `.wheel-mode-option` | `src/pages/tool/wheel.astro` | **deviation** — the pair appears in neither wheel artboard (`ToolWheel390`, `ToolWheelDesktop`, whose padding values are `18px 16px`, `14px 16px`, `12px 16px`, `12px 14px`, `3px 10px`, `24px 20px 22px 20px`, `20px`, `16px`), nor `design/canvas.json`. `tokens.css` holds `8px` and `14px`, but as `--radius-md` and `--text-sm` — a corner radius and a font size. Spending them as a padding pair would be a false trace, not a source, so they are not used. The one place `8px 14px` does appear in the canvas is `design/ToolNameEntry.dc.html`, a different artboard for a different element. |

The mode toggle has no artboard of its own: both wheel artboards draw the disc and the result bar,
not an A/B mode chip. The value is agent-authored and stays until the owner sets one — this row is
the disclosure ADR-0033 asks for, and the class name appears nowhere under `docs/` otherwise.
