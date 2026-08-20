# Src-edit rules

Moved out of `docs/runbook.md` at the seam `CLAUDE.md:55` already names (ADR-0012). The runbook keeps
build/probe payload; this file keeps the two rules a `src/**` edit must obey — the clear-round confirm
copy and the `thai-comments` quoting rule.

## The clear-round confirm — approved copy, and why it focuses cancel

ADR-0008 is the decision; these are the operational details it relies on. Owner-approved (#25), and the
rule is that the copy names **every** loss the confirm will actually cause — over-naming is acceptable,
under-naming is not. `clearCopy` in `src/shell/player-select.ts` selects; `null` means "leave the
template default alone". Any edit must keep these byte-identical — `PlayerSetup.astro` ships the first
pair as markup and ADR-0008 quotes them.

| case | question | confirm button |
|---|---|---|
| stranded checkpoint only (template default) | `ยังมีรอบที่เล่นค้างอยู่ ถ้าล้างกลุ่มนี้ รอบที่ค้างจะหายไปด้วย` | `ล้างและทิ้งรอบที่ค้าง` |
| live round on this page | `เริ่มรอบบนหน้านี้ไปแล้ว ถ้าล้างกลุ่มนี้ รอบนี้จะหายไปทั้งรอบ` | `ล้างและทิ้งรอบนี้` |
| both at once | `เริ่มรอบบนหน้านี้ไปแล้ว และยังมีรอบที่เล่นค้างอยู่ด้วย ถ้าล้างกลุ่มนี้ ทั้งรอบนี้และรอบที่ค้างจะหายไป` | `ล้างและทิ้งทุกรอบ` |

`ยกเลิก` takes focus when the question opens, and that is load-bearing, not styling. A click fires on
Enter **keydown**, so focusing the destructive button puts it under a key that may still be held —
auto-repeat, or a habitual second Enter, confirms a question the player never read. Both prompts in
`src/shell/PlayerSetup.astro` focus their safe branch for this reason.

## `thai-comments` strips double-quoted spans only — cite Thai in quotes

**Symptom:** the gate goes red with `Thai comment lines: 1` on a comment you wrote in English, because
it cites a Thai UI string bare.

`scripts/thai-comments.mjs` blanks **double-quoted** spans and backticks before analysing, and nothing
else. So an English code comment that mentions a button label has to quote it — `"เล่นอีกรอบ"` passes,
the same word bare does not. Every existing comment in `src/games/` already does this; copy them.

Single quotes are deliberately NOT stripped: an earlier version did strip them, and apostrophes in
ordinary English prose (`don't`, `stage's`) paired up across a sentence and blanked the Thai sitting
between them — a gate that quietly stopped measuring. Do not "fix" that by adding `'` back.

**Do:** quote the Thai, and prefer prose without apostrophes near it. Then re-run the gate, and also
`--selftest`, because the strip exemption is exactly the mechanism that can turn the whole gate off.

**Don't** assume a doc is exempt because docs may contain Thai — a checker cannot tell use from
mention, and writing about this gate is how you create an instance of it.
