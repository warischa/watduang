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

**Status:** the panel component this entry describes (`PlayerSetup`) was deleted in gh#273 and every party
route now collects players on the shared player screen (ADR-0071). What follows is the record of how that
panel behaved; the pure helpers it called (`resolveStart` in `src/shell/player-select.ts`) remain, with tests.

For the #22 button (`startNumberedBtn` in that panel) this was unremarkable — the
player actively chose numbered mode. The named เริ่มรอบ button (`startBtn` in that panel)
took the same fallback silently: with 0 ticked names it substituted the synthesized
"คนที่ N" set for the player's actual (empty) selection *before* `resolveStart`
ever ran, so the below-min guard evaluated the substitute, never the
real selection. That was a deliberate design decision, not a nonevent — worth stating plainly, not waving
off.

Reconciled against [ADR-0007](docs/adr/0007-party-size-rule-constrains-the-set-not-the-location.md): its
invariant is "a guard must enumerate the full party, never a partial or remaining pool." The substitute
`fullSelection` there was a complete synthesized set, not a partial pool, so it did not violate that
invariant on its literal terms. It did share the enabling condition ADR-0007's scoring flagged for the
`saveGroup([])` defect — an empty `selected` set being read as meaningful rather than "nothing chosen
yet" — but `saveGroup` itself was separately guarded (`if (selected.size > 0) saveGroup(...)`, same file,
a few lines below `startBtn`'s substitution), so the stored group was never at risk there; only the
below-min refusal's reach was. Judged intended given #7 (an empty roster was that panel's normal starting
state, not an error state, and the count field is a companion input, not a leftover) — but the practical
consequence, that the refusal gate could never fire while the panel was untouched beyond its `min`-defaulted
count field, is the fact this entry exists to surface.
_Avoid_: treating an empty tick-set as an error state — it is the count-only path, not a broken one

**เกม**:
What a วง plays together: has rounds, has turn order, ends in an outcome shared by the วง. One เกม is one file and one URL.
Since ADR-0075, เกม exist in the ปาร์ตี้ and เกมงานเลี้ยงบริษัท หมวด alone — a page in วัดดวง is a การดูดวง, not a เกม. In เกมงานเลี้ยงบริษัท the MC's cut schedule stands in for turn order and the room, not a วง, shares the outcome.
_Avoid_: มินิเกม, โหมด (a โหมด is something that lives inside a เกม)

**การดูดวง**:
What one person does alone on their own phone: sets their intent, gets one คำทำนาย, reads it themselves. No วง, no turn order, no shared outcome — the whole page serves one reader. Every page in the วัดดวง หมวด is one of these. Naming still open: the owner may rename this term, but it may never be เกม (ADR-0040).
_Avoid_: เกมดูดวง, เสี่ยงโชค (reads as gambling — the AdSense risk), and never call it a เครื่องมือ (a เครื่องมือ decides something for a วง; this answers a question about one person)

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
A การดูดวง whose result is a คำทำนาย carrying meaning to interpret. People who come to this หมวด type "ดูดวง" or "เซียมซี" — they came for an answer about themselves, one person on one phone. No เกม lives here (ADR-0040); ดวงวันนี้ and ดวงความรัก are still built as เกม until their own tickets convert them, and that is a known gap, not the rule.
_Avoid_: random, ดวงชะตา, and calling anything in this หมวด a เกม

**ปาร์ตี้ (`party`)**:
A เกม whose result is "ใครโดน". People who come to this หมวด are searching for a เครื่องมือ that decides for their วง, even though the mechanism inside is the same drawing of chance as the วัดดวง หมวด.
_Avoid_: เกมกลุ่ม (a search query, not a หมวด name), สันทนาการ

**เกมงานเลี้ยงบริษัท (company party games)**:
A หมวด of เกม that an organiser runs for a room on one projected screen — an **event**. People who come here type "จับรางวัล", "จับฉลากรางวัลปีใหม่" or "เกมงานเลี้ยงบริษัท". Not the ปาร์ตี้ หมวด: the 2–10 range and phone-passing are true of ปาร์ตี้ only (ADR-0075, amending ADR-0040). Its terms are the six below. Copy avoids the words that read as gambling (the AdSense risk), and card visuals avoid casino styling (felt table, chips, money).
_Avoid_: ปาร์ตี้บริษัท (reads as the ปาร์ตี้ หมวด), เกมกลุ่ม, and หวย · ลอตเตอรี่ · เสี่ยงโชค · ไพ่ป๊อก · แทง · เดิมพัน · ไฮโล

Player-facing Thai wording for the terms below is not fixed — the canvas tickets set it. Until then code, issues and comments use the English term.

**event**:
One run of the หมวด: setup → elimination rounds → final → result, driven by one MC on a projected screen. Holds one roster of present people, one event name, one cut schedule and 1–5 prizes.
_Avoid_: วง (a วง is people sharing one phone, an event's audience is a room), session, game (an event runs เกม, it is not one), draw, lottery

**elimination round**:
One round that cuts the remaining names down to the next number on the cut schedule. Every remaining name has equal odds; any choice handed to a player (a lane, a card) is theatre and never changes them (gh#299). The MC picks the เกม per round.
_Avoid_: heat, stage (`#stage` is the play surface), knockout

**final**:
The one เกม after the last elimination round, played by the finalists, whose result is the prize holders. Not a numbered elimination round.
_Avoid_: last round, round 5, grand round

**finalist**:
One of the 5 names left after the last elimination round. A finalist is not yet a winner: the final decides who holds which prize.
_Avoid_: winner (a name that took a prize), survivor (any name still in during elimination), contestant

**cut schedule**:
The list of head counts the elimination rounds step through, e.g. 200 → 100 → 50 → 20 → 5. Proposed from the head count, editable by the MC before the start, 4 rounds, ending at 5.
_Avoid_: bracket (implies seeding and pairing), tournament, ladder (the ทางแยกเลือกเส้น เกม has one)

**round code**:
The code the main screen shows at each reveal in QR mode; a phone works out its own fate from it and its join identity, with no server call at reveal time (gh#299 decision 5, unproven).
_Avoid_: PIN (the event PIN in the join QR is a different thing, used at join), OTP, lottery number, เลขรางวัล
