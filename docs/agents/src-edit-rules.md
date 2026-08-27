# Src-edit rules

Moved out of `docs/runbook.md` at the seam `CLAUDE.md`'s "Agent skills" section already names
(ADR-0012). The runbook keeps
build/probe payload; this file keeps the rules a `src/**` edit must obey.

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

## An absent element guards reachability, never an optional-chained comparison

When an element may not be rendered at all, write `if (el) { ... }`, not `el?.dataset.foo !== 'no'` —
optional chaining resolves to `undefined`, and `undefined !== 'no'` is `true`, so a guard written that
way fails OPEN exactly when the element is missing.

## The party-size claim — a list of permitted surfaces, not a list of banned strings

Owner decision, gh#89. The claim is any statement of a **player-count range** — the shipped form is
`เล่นได้ 2-10 คน`, and the range shape is the claim, not that exact wording. Its companion claims are
phone-passing and the shared roster; ADR-0039 and ADR-0040 bind all three to the same หมวด.

The rule is stated as the set of surfaces where the claim is **permitted**. Everything not on the
list is forbidden. A banned-string list was rejected because it has no finishing condition: the next
author phrases the range a new way and the check goes blind. The permitted set is one this repo owns
and can enumerate from the manifests, so it converges and it fails safe.

**What decides permission is the SUBJECT of the sentence, not the URL it renders on.** This is the
part that must not be flattened into "banned on these pages, allowed on those". Per ADR-0040 the
claim is true of the สุ่มคนโดน หมวด and may be stated only where that หมวด, or a member of it, is the
subject.

Permitted surfaces, the whole list:

1. Any string owned by a game module whose manifest declares `category: 'party'` — its manifest
   fields and its own play-screen copy. The game is the subject of its own copy, so the claim travels
   with it: a party game's `tagline` rendered in the home page grid is still permitted, because the
   card names the game.
2. The `party` block of `categories.ts` — `label`, `whenToUse`, `intro`. The หมวด is the subject.
3. Copy inside a `category === 'party'` branch of the shared category page. The page template itself
   is shared by both หมวด, so unbranched copy there is forbidden.

Forbidden, by not being on the list: the home page's own chrome and FAQ, the ดูดวง blocks and pages,
every เครื่องมือ page and the เครื่องมือ manifest, the shared layouts, and the shell.

**Outside the rule entirely:** a page's `<title>` and `<meta name="description">` — so `seo.title`
and `seo.description` in both manifests, and the `title` / `description` props passed to `Base`. A
separate owner decision the same day keeps their current wording. The rule governs what a reader sees
on the page, not what Google is told. A check that flagged them would enforce a rule nobody agreed
to.

`players: [min, max]` is mechanism, not a claim, and is untouched by this rule; ADR-0040 keeps the
field and makes `[1, 1]` legal.

`scripts/party-size-claim-check.mjs` enforces the range-form half over the enumerated surface list.
It does **not** cover the phone-passing or shared-roster halves — its green earns no coverage there
(ADR-0019). Those stay reviewer-owned until #94, #95 and #96 land the mechanism split.
