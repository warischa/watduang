# The clear-round confirm — archived from `docs/agents/src-edit-rules.md`

Moved 2026-10-20: the surface was deleted in gh#273, and the section pushed its source doc over the 12KB budget. Kept verbatim for its origin (ADR-0008) and for any future surface that re-asks this question.

## (archived) The clear-round confirm — approved copy, and why it focused cancel

**Historical:** the component that rendered this confirm (`PlayerSetup`, with its `#clear-choice` question) was
deleted in gh#273; the shared player screen has no clear-round confirm. `clearCopy` survives in
`src/shell/player-select.ts` with its tests only. The rule below is kept for its origin and for any future
surface that re-asks this question.

ADR-0008 is the decision; these are the operational details it relied on. Owner-approved (#25), and the
rule is that the copy names **every** loss the confirm will actually cause — over-naming is acceptable,
under-naming is not. `clearCopy` in `src/shell/player-select.ts` selects; `null` means "leave the
template default alone". Any edit must keep these byte-identical — `PlayerSetup.astro` shipped the first
pair as markup and ADR-0008 quotes them.

| case | question | confirm button |
|---|---|---|
| stranded checkpoint only (template default) | `ยังมีรอบที่เล่นค้างอยู่ ถ้าล้างกลุ่มนี้ รอบที่ค้างจะหายไปด้วย` | `ล้างและทิ้งรอบที่ค้าง` |
| live round on this page | `เริ่มรอบบนหน้านี้ไปแล้ว ถ้าล้างกลุ่มนี้ รอบนี้จะหายไปทั้งรอบ` | `ล้างและทิ้งรอบนี้` |
| both at once | `เริ่มรอบบนหน้านี้ไปแล้ว และยังมีรอบที่เล่นค้างอยู่ด้วย ถ้าล้างกลุ่มนี้ ทั้งรอบนี้และรอบที่ค้างจะหายไป` | `ล้างและทิ้งทุกรอบ` |

`ยกเลิก` takes focus when the question opens, and that is load-bearing, not styling. A click fires on
Enter **keydown**, so focusing the destructive button puts it under a key that may still be held —
auto-repeat, or a habitual second Enter, confirms a question the player never read. Both prompts in
`PlayerSetup.astro` focused their safe branch for this reason; the surviving instance of the same rule is the
stay button in `src/shell/LeaveConfirm.astro`.

