# วัดดวง

คำศัพท์ของโดเมนนี้ — ใช้คำเดียวกันทั้งในโค้ด ในใบงาน และในข้อความที่ผู้เล่นเห็น
ไฟล์นี้เป็น glossary อย่างเดียว ไม่ใช่สเปกและไม่ใช่ที่เก็บการตัดสินใจ (เหตุผลอยู่ใน `docs/adr/` · สถานะอยู่ใน `CLAUDE.md`)

## Language

**ดวงตัดสิน**:
แกนกลางของทั้งเว็บ — ผลลัพธ์ของรอบมาจากการสุ่ม ไม่ใช่จากฝีมือหรือการต่อรอง ทุกอย่างบนเว็บนี้เป็นรูปแบบหนึ่งของการให้ดวงตัดสิน ไม่ว่าจะออกมาเป็น "ใครโดน" หรือ "ดวงวันนี้เป็นยังไง" **เป็นแกนของเนื้อหาและถ้อยคำ ไม่ใช่เป้าหมาย SEO** — #4 ฆ่าสมมติฐาน "วัดดวงคือประตูหน้าบ้าน" ไปแล้ว และ #11 วางแบรนด์ไว้ที่เกมกลุ่ม
_Avoid_: สุ่ม (กว้างเกินไป — เป็นกลไก ไม่ใช่แกน), เสี่ยงทาย

**วง**:
กลุ่มคนที่นั่งอยู่ด้วยกันและใช้มือถือเครื่องเดียวร่วมกัน เป็นหน่วยนับของผู้ใช้จริงบนเว็บนี้ — หนึ่งวงคือหนึ่งเครื่อง ไม่ใช่หนึ่งคน
_Avoid_: กลุ่ม, ห้อง, room, party (party เป็นชื่อหมวด ไม่ใช่คน)

**คนที่ N** (unnamed วง): a วง that ticked nobody still starts — the count input's number fills in as
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
สิ่งที่วงเล่นด้วยกัน มีรอบ มีลำดับตา และจบด้วยผลลัพธ์ร่วมของวง หนึ่งเกมคือหนึ่งไฟล์และหนึ่ง URL
_Avoid_: มินิเกม, โหมด (โหมดคือของที่อยู่ข้างในเกม)

**เครื่องมือ**:
สิ่งที่ให้คำตอบทันทีโดยไม่มีรอบและไม่มีลำดับตา เช่น วงล้อสุ่ม สุ่มเลข สุ่มชื่อ คนเดียวก็ใช้ได้ ใช้ตอนไหนก็ได้ ไม่ต้องมีวง
_Avoid_: เกมสุ่ม, ยูทิลิตี้ — และอย่าเรียกเครื่องมือว่าเกม เพราะคนที่ค้นหามันไม่ได้กำลังหาเกม

**โดน**:
คนที่รอบนั้นเลือกได้ ไม่ว่าเกมจะเรียกผลนั้นว่าแพ้ ว่าเป็นคนทำ หรือว่าเป็นตาของใคร เว็บนี้จบหน้าที่ตรงที่บอกว่าใครโดน ไม่ได้บอกว่าคนโดนต้องทำอะไรต่อ
_Avoid_: ผู้แพ้ (ใช้ได้ในข้อความของเกมที่มีแพ้ชนะจริง แต่อย่าใช้เป็นชื่อ concept กลาง), เหยื่อ, คนถูกลงโทษ

**คำทำนาย**:
ข้อความหนึ่งใบในเกมหมวดวัดดวง เป็นเนื้อหาที่เราเขียนเองทั้งหมดและตรวจเองทุกใบ ไม่ใช่ข้อความที่ผู้เล่นพิมพ์
_Avoid_: การ์ด (การ์ดคือรูปทรงที่แสดงผล ไม่ใช่ตัวเนื้อหา), ดวง (ดวงคือสิ่งที่ตัดสิน ไม่ใช่ข้อความ)

## หมวด (category)

หมวดในเว็บนี้แบ่งตาม **เจตนาของคนค้นหา** ไม่ได้แบ่งตามกลไกของเกม เหตุผลอยู่ใน [ADR-0001](docs/adr/0001-category-means-search-intent.md)

**วัดดวง (`fortune`)**:
เกมที่ผลลัพธ์คือคำทำนายที่มีความหมายให้ตีความ คนที่มาหาหมวดนี้พิมพ์คำว่า "ดูดวง" หรือ "เซียมซี" เขามาหาคำตอบเกี่ยวกับตัวเอง
_Avoid_: random, ดวงชะตา

**ปาร์ตี้ (`party`)**:
เกมที่ผลลัพธ์คือ "ใครโดน" คนที่มาหาหมวดนี้กำลังหาเครื่องมือตัดสินให้วง แม้กลไกข้างในจะเป็นการสุ่มเหมือนหมวดวัดดวงก็ตาม
_Avoid_: เกมกลุ่ม (เป็นคำค้น ไม่ใช่ชื่อหมวด), สันทนาการ
