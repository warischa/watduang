# วัดดวง

This domain's vocabulary — use the same word in code, in issues, and in the text players see.
Glossary only. Not a spec, not where decisions are kept (rationale lives in `docs/adr/` · state lives in `SESSION-HANDOFF.md`)

## Language

**ดวงตัดสิน**:
The axis of the whole site — a round's outcome comes from chance, not from skill or negotiation. Everything here is one form of letting ดวงตัดสิน, whether it surfaces as "ใครโดน" or "ดวงวันนี้เป็นยังไง". **The axis of content and wording, not an SEO target** — #4 already killed the "วัดดวง is the front door" hypothesis, and #11 placed the brand on เกมกลุ่ม.
_Avoid_: สุ่ม (too broad — a mechanism, not the axis), เสี่ยงทาย

**วง**:
People sitting together sharing one phone. The real unit of users on this site — one วง is one device, not one person.
_Avoid_: กลุ่ม, ห้อง, room, party (party is a หมวด name, not people)

**คนที่ N** (unnamed วง · English alias for code comments: **numbered-players group**): a วง that ticked nobody still starts — the count input's number fills in as
"คนที่ 1, 2, 3…" (#22), clamped into the page's `[min, max]` the same way a ticked roster is. Since that
clamp always yields at least `min` names, an empty tick-set never reaches the below-min refusal; only a
*partial* tick (more than 0 but fewer than min) does.

For the #22 button (`src/shell/PlayerSetup.astro:216-218`, `startNumberedBtn`) this is unremarkable — the
player actively chose numbered mode. The named เริ่มรอบ button (`src/shell/PlayerSetup.astro:224-232`,
`startBtn`) takes the same fallback silently: with 0 ticked names it substitutes the synthesized
"คนที่ N" set for the player's actual (empty) selection *before* `resolveStart`
(`src/shell/player-select.ts:66-82`) ever runs, so the below-min guard evaluates the substitute, never the
real selection. That is a deliberate design decision, not a nonevent — worth stating plainly, not waving
off.

Reconciled against [ADR-0007](docs/adr/0007-party-size-rule-constrains-the-set-not-the-location.md): its
invariant is "a guard must enumerate the full party, never a partial or remaining pool." The substitute
`fullSelection` here is a complete synthesized set, not a partial pool, so it does not violate that
invariant on its literal terms. It does share the enabling condition ADR-0007's scoring flagged for the
`saveGroup([])` defect — an empty `selected` set being read as meaningful rather than "nothing chosen
yet" — but `saveGroup` itself is separately guarded (`if (selected.size > 0) saveGroup(...)`, same file,
a few lines below `startBtn`'s substitution), so the stored group is never at risk here; only the
below-min refusal's reach is. Judged intended given #7 (an empty roster is this panel's normal starting
state, not an error state, and the count field is a companion input, not a leftover) — but the practical
consequence, that the refusal gate can never fire while the panel is untouched beyond its `min`-defaulted
count field, is the fact this entry exists to surface.
_Avoid_: treating an empty tick-set as an error state — it is the count-only path, not a broken one

**เกม**:
What a วง plays together: has rounds, has turn order, ends in an outcome shared by the วง. One เกม is one file and one URL.
_Avoid_: มินิเกม, โหมด (a โหมด is something that lives inside a เกม)

**เครื่องมือ**:
Gives an answer at once, with no rounds and no turn order — such as วงล้อสุ่ม, สุ่มเลข, สุ่มชื่อ. One person alone can use it, at any time, with no วง.
_Avoid_: เกมสุ่ม, ยูทิลิตี้ — and never call a เครื่องมือ a เกม: whoever searched for it was not looking for a เกม

**โดน**:
The person that round picked, whatever the เกม calls that result — losing, being the one who does it, or whose turn it is. This site's job ends at saying who โดน; it never says what that person must do next.
_Avoid_: ผู้แพ้ (usable in the text of a เกม that really has winning and losing, but never as the central concept name), เหยื่อ, คนถูกลงโทษ

**คำทำนาย**:
One slip of text in a เกม of the วัดดวง หมวด. Content we write entirely ourselves and review slip by slip — never text a player typed.
_Avoid_: การ์ด (a การ์ด is the shape that displays it, not the content itself), ดวง (ดวง is what decides, not the text)

## หมวด (category)

หมวด on this site are split by **searcher intent**, not by เกม mechanics. Rationale: [ADR-0001](docs/adr/0001-category-means-search-intent.md)

**วัดดวง (`fortune`)**:
A เกม whose result is a คำทำนาย carrying meaning to interpret. People who come to this หมวด type "ดูดวง" or "เซียมซี" — they came for an answer about themselves.
_Avoid_: random, ดวงชะตา

**ปาร์ตี้ (`party`)**:
A เกม whose result is "ใครโดน". People who come to this หมวด are searching for a เครื่องมือ that decides for their วง, even though the mechanism inside is the same drawing of chance as the วัดดวง หมวด.
_Avoid_: เกมกลุ่ม (a search query, not a หมวด name), สันทนาการ
