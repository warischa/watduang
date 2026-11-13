## Proposed privacy text: PROPOSED, not shipped

This is a new section for the privacy page, after the section "ข้อมูลที่คุณส่งมาเอง". Owner approval
comes first. The page, `privacy-policy.ts`, the approved-text file and the date line all change
together in the page half, because `src/pages/privacy.test.mjs` pins the text byte for byte.

```
ข้อมูลเมื่อเข้าร่วมจับรางวัลผ่าน QR
ถ้าคุณสแกน QR เพื่อเข้าร่วมกิจกรรมจับรางวัล เราจะได้รับชื่อเล่นที่คุณพิมพ์ เวลาที่เข้าร่วม และรหัสสุ่มที่ใช้จำว่าเครื่องนี้เข้าร่วมแล้ว ชื่อนี้จะขึ้นบนจอของงาน และผู้จัดจะตรวจรายชื่อก่อนเริ่ม เราไม่เก็บหมายเลข IP ของคุณ
ข้อมูลนี้ถูกลบเมื่อผู้จัดกดจบงาน ถ้าไม่ได้กด ระบบจะหยุดใช้ข้อมูล 24 ชั่วโมงหลังผู้จัดเริ่มงาน (หรือ 72 ชั่วโมงหลังสร้างงาน ถ้ายังไม่ได้เริ่ม) และลบทิ้งเองโดยอัตโนมัติภายในไม่กี่วัน
ชื่อเล่นอาจทำให้คนในที่ทำงานรู้ว่าเป็นคุณ จึงควรใช้ชื่อที่คุณยินดีให้ทุกคนในงานเห็น
```

Open for the owner:

- RESOLVED 2026-11-11 (orchestrator): the clause "หลังสร้างงาน 24 ชั่วโมง" contradicted ruling 4's clock,
  so it now states that clock (24 hours after the start, or 72 hours after creation if never started).
  Ruling 5 concerned only the deletion bound "ภายในไม่กี่วัน", which is unchanged. The text is still
  PROPOSED until the privacy page edit (gh#308 page half) ships it.
- "ภายในไม่กี่วัน" is deliberately not a number (kept by ruling 5). Azure's lifecycle runs carry no completion bound
  (ADR-0076). A stated bound needs a mechanism we own: an hourly timer sweep in the same app.
- If the phone page keeps its join id and device token in the browser, the section
  "ข้อมูลที่อยู่ในเครื่องของคุณ" ends "ไม่ถูกส่งออกจากเครื่องของคุณ". The token *is* sent, so that
  list needs its own line.
- Settled by ruling: the expiry clock (ruling 4) and the two abuse budgets (rulings 1-3, both dropped).
