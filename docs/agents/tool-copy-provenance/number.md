# Tool copy provenance — Number (`src/pages/tool/number.astro`)

Part of the split doc set; see [`../tool-copy-provenance.md`](../tool-copy-provenance.md) for the
authorship-cannot-be-recovered note, the source legend, and the rows genuinely shared by all 4
tool pages (back link, "วิธีใช้", GameNav heading).

No `.dc.html` artboard exists for this tool at all — it is the one tool page with no shared
name-entry panel (it takes a min/max range, not a roster), and it carries none of the
`tool-eyebrow`/`tool-badge`/`tool-breadcrumb`/ad-slot-text markup that `draw.md`/`team.md` cover.

## SEO metadata

| String | Source |
|---|---|
| `title`: "สุ่มเลข — วัดดวง" (`number.astro`) | **agent-authored** — no artboard carries a `<title>`; `{manifest name} — วัดดวง`, not a byte-copy of the manifest `name` field |
| `description`: one sentence (`number.astro`) | **agent-authored** — reads similarly to the page's own tagline/intro but is a separately typed string, not byte-identical to `manifest.ts`'s `desc` field |

## Page copy

| String | Source |
|---|---|
| H1 "สุ่มเลข", intro line, module heading "ช่วงตัวเลข" (`number.astro`), "ต่ำสุด" / "สูงสุด" labels, no-repeat checkbox label | **agent-authored** — no artboard exists to draw from |
| Button "สุ่ม" / "เริ่มรอบใหม่" | **agent-authored** |
| Runtime templates ("ได้: X", range-exhausted, remaining-count, error fallback) | **agent-authored** |

## Logic module (`src/tools/number.ts`)

gh#112: thrown/returned `Error` messages surfaced to the player when the min/max range is invalid
or exhausted.

| String | Source |
|---|---|
| `` `ช่วงตัวเลขผิด: ต่ำสุด (${min}) ต้องไม่มากกว่าสูงสุด (${max})` `` (`rangeError()` in `number.ts`) | **agent-authored** — no artboard/manifest field, flagged for owner override |
| `` `ช่วงตัวเลขต้องมีอย่างน้อย ${MIN_RANGE_SIZE} ค่า (ตอนนี้มี ${rangeSize} ค่า)` `` (`rangeError()` in `number.ts`) | **agent-authored** — no artboard/manifest field, flagged for owner override |
| `` `ช่วงตัวเลขกว้างได้ไม่เกิน ${MAX_RANGE_SIZE} ค่า (ตอนนี้กว้าง ${rangeSize} ค่า)` `` (`rangeError()` in `number.ts`) | **agent-authored** — no artboard/manifest field, flagged for owner override |
| `` `สุ่มครบทุกเลขในช่วง ${min}-${max} แล้ว — เริ่มรอบใหม่เพื่อสุ่มต่อ` `` (`pickNumber()` in `number.ts`) | **agent-authored** — no artboard/manifest field, flagged for owner override |
