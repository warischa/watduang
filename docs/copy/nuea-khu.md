# เนื้อคู่ของคุณ — copy draft (UNREVIEWED)

> **⚠ UNREVIEWED — agent-drafted candidate copy. Nothing here has owner sign-off.**
> Every Thai string below is a starting point for the owner to edit **in the tree**. None of it is
> approved, and none of it may be copied into `src/**` until the owner has edited it here and said so.
> Owner ruling 2026-09-16 (recorded on gh#101): an agent drafts Thai copy as candidates, the owner
> edits them. The copy that ships is whatever the owner signs off.

Ticket: [gh#101](https://github.com/warischa/watduang/issues/101) · replaces ดวงความรัก, whose module,
tests and stylesheet are still on disk while the manifest entry stays delisted.

**Written against the closed top band** — owner ruling 2026-09-18 on gh#101: bands are
`18–24 · 25–29 · 30–34 · 35–39 · 40–49 · 50 ขึ้นไป`, and for the one remaining open band the meeting
age is drawn above the reader's own age rather than above a band top. This draft does not inherit the
untestable-criterion problem the first draft found.

**No pair meter** — dropped by the same ruling. gh#81 stays closed. Nothing below has meter copy, a
percentage, or a second person's name.

**Not in scope here:** the portraits (gh#102, gh#103 — the portrait box ships empty), criterion 2's
restated wording (owner's sentence, separate item), and any OG image. The OG *text* is drafted; the
image itself is a separate spend governed by the assets doc.

## What is drafted and what is assumed

| part | status |
|---|---|
| manifest + SEO + share text | drafted below, unreviewed |
| screen 1 — the three questions | drafted below, unreviewed |
| screen 2 — the eighty-percent result | drafted below, unreviewed |
| screen 3 — the twenty-percent branch, four variants | drafted below, unreviewed |
| ten character cards, five per gender | drafted below, unreviewed |
| meeting-place pool, meeting-age rule | drafted below, unreviewed |

**The open band's form is settled — owner ruling 2026-09-18.** Screen 1 collects an age *band*, not an
age, so at `50 ขึ้นไป` there is no number to draw above. That band's result line therefore stays in
**relative** form (`อีกประมาณ N ปีจากนี้`), which is above the reader's own age by construction and
needs no second question. The alternative — asking for an exact age — was rejected: it adds a fourth
question to a three-question screen.

The consequence for criterion 2 is not closed by that ruling and belongs to its restatement: at this
one band there is no number to assert, so the criterion has to say "above the reader's own age by
construction" rather than name a threshold. Owner's wording, tracked as its own item.

## Manifest, SEO and share text

Field names mirror the existing `GameModule` shape so an edit here drops straight into the module.

- `names.th` — เนื้อคู่ของคุณ
- `names.en` — Your Soulmate
- `tagline` — ตอบสามข้อ แล้วดูว่าเนื้อคู่ของคุณเป็นคนแบบไหน
- `keywords` — `['เนื้อคู่', 'เนื้อคู่ของคุณ', 'ดูดวงเนื้อคู่', 'เนื้อคู่เป็นคนแบบไหน', 'จะเจอเนื้อคู่ตอนอายุเท่าไร']`
- `seo.title` — เนื้อคู่ของคุณ — ตอบสามข้อ รู้ว่าเนื้อคู่เป็นคนแบบไหน และจะเจอตอนอายุเท่าไร
- `seo.description` — ดูดวงเนื้อคู่คนเดียวจบ ตอบสามข้อแล้วเปิดครั้งเดียว ได้รายละเอียดว่าเนื้อคู่เป็นคนแบบไหน ทำงานอะไร นิสัยยังไง และจะเจอกันตอนอายุเท่าไรที่ไหน ไม่ต้องโหลดแอป ไม่ต้องสมัคร ไม่เก็บข้อมูลที่กรอก
- `seo.steps`
  1. บอกว่าคุณเป็นผู้ชายหรือผู้หญิง
  2. เลือกช่วงอายุของคุณ
  3. เลือกว่าอยากให้เนื้อคู่เป็นผู้ชายหรือผู้หญิง
  4. กด "เปิดดูเนื้อคู่" ครั้งเดียว แล้วอ่านผล

**OG card text** (text only — the image is a separate spend, and the OG text registry is the gate that
owns the rendered strings):

- line 1 — เนื้อคู่ของคุณ
- line 2 — ตอบสามข้อ เปิดครั้งเดียว

Checked against criterion 6: no pair score, no second person, no player-count range anywhere above.

## Screen 1 — the three questions

- heading — เนื้อคู่ของคุณ
- sub-heading — ตอบสามข้อ แล้วเปิดดูครั้งเดียว
- question 1 label — คุณเป็น · options — ผู้ชาย · ผู้หญิง
- question 2 label — อายุของคุณ · options — `18–24` · `25–29` · `30–34` · `35–39` · `40–49` · `50 ขึ้นไป`
- question 3 label — อยากให้เนื้อคู่เป็น · options — ผู้ชาย · ผู้หญิง · **pre-set to the opposite of
  question 1's answer, freely changeable**
- privacy line — ที่ตอบไว้อยู่แค่ในหน้านี้รอบเดียว ไม่ได้บันทึก ไม่ได้อยู่ในลิงก์ ไม่ได้ส่งไปไหน
- primary button — เปิดดูเนื้อคู่

Optional micro-copy for the reveal moment, if the build wants one — **not a fourth screen**: กำลังดูให้…

## Screen 2 — the eighty-percent result

- heading — คุณจะได้เจอเขา
- age line, closed bands — ตอนคุณอายุ `{อายุที่เจอ}` ปี
- age line, `50 ขึ้นไป` — อีกประมาณ `{N}` ปีจากนี้
- place line — ที่ `{สถานที่}`
- card fields, as labelled lines in this order — เพศ · อายุ · ส่วนสูง · รูปร่าง · สัญชาติ · อาชีพ ·
  ฐานะ · ท่าที · นิสัยติดตัว · จุดสังเกต
- portrait box — **empty in this draft and in the shipped first version.** Placeholder copy while it
  is empty: ยังไม่มีภาพ
- closing line — ไม่ต้องรีบออกไปหา แค่จำไว้ว่าประมาณนี้
- secondary button — เปิดใหม่อีกที

## Screen 3 — the twenty-percent branch, four variants

Reads as a compliment, never a verdict. No portrait, no generated asset — drawn in SVG like the rest
of the site. One of the four is drawn per result.

**Variant 1**
- heading — เนื้อคู่ของคุณคือตัวคุณเอง
- body — คนที่อยู่กับคุณได้ทุกวันโดยไม่เบื่อ มีอยู่คนเดียว และคุณก็เป็นคนนั้น รอบนี้ดวงบอกว่าให้ใช้เวลากับเขาให้คุ้ม

**Variant 2**
- heading — รอบนี้ดวงไม่ได้พาใครมา
- body — ไม่ใช่เพราะไม่มีใคร แต่เพราะคุณกำลังสนุกกับชีวิตตัวเองมากพอที่จะยังไม่ต้องแบ่งให้ใคร

**Variant 3**
- heading — ดวงบอกว่าคุณเต็มอยู่แล้ว
- body — บางคนต้องมีอีกคนมาเติมให้ครบ บางคนครบมาตั้งแต่แรก คุณอยู่ในกลุ่มหลัง

**Variant 4**
- heading — รอบนี้ยังไม่มีชื่อใคร
- body — ไม่ได้แปลว่าขาด แปลว่าตอนนี้คุณไม่ต้องรอใครก่อนจะมีความสุข

Shared across all four:
- closing line — เปิดใหม่ได้เรื่อยๆ ดวงไม่ได้ผูกไว้กับรอบเดียว
- secondary button — เปิดใหม่อีกที

## Drawn fresh every time, belonging to no card

**Meeting age.** Always above the top of the band the reader chose, so the draw can never predict the
past. Per band: `18–24` → 25–29 · `25–29` → 30–34 · `30–34` → 35–39 · `35–39` → 40–44 ·
`40–49` → 50–55 · `50 ขึ้นไป` → the relative form above, `อีกประมาณ 2–5 ปีจากนี้`.

**Meeting place.** ร้านหนังสือมือสอง · คิวรอรถเมล์ตอนฝนตก · งานวิ่งการกุศล · ห้องสมุดประชาชน ·
ร้านซักผ้าหยอดเหรียญ · ตลาดนัดเช้าวันเสาร์ · งานแต่งของเพื่อนคนเดียวกัน · คลาสเรียนทำอาหาร ·
ร้านตัดผม · สนามบินตอนไฟลต์ดีเลย์

No place here serves alcohol. A bar was drafted for the previous draft and dropped; it stays dropped,
because the content rule is absolute and the portraits ticket would inherit the problem.

## The ten character cards

**Moved to [`nuea-khu/cards.md`](nuea-khu/cards.md)** — this file crossed its 12288-byte budget with
the cards in it, so they live in the same-named subdirectory, which is the convention the tool-copy
provenance doc established for a doc that outgrows its own budget. Same UNREVIEWED status, same
ticket. The fixed-field list, the criterion-3 check and the no-weight / nationality-is-text rules are
restated there.

## What an editor must not break

- No alcohol, no bottles, no bars — in copy, in an occupation, in a habit, in a meeting place, and
  later in any portrait or OG image. This is the Thai Alcohol Act rule, not a style preference.
- No brands and no shop names.
- No player-count range and no phone-passing claim: this page is one person, one draw.
- No pair meter, no percentage, no second person's name.
- Nothing in the play surface may read as a navigation target.
- Every card stays a clear adult, and no distinguishing mark may reference ethnicity.
