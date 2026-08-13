# Runbook

Gotcha ที่ต้องรู้**ก่อน**ลงมือ ไม่ใช่หลังพัง — อยู่ที่นี่เพราะมันจริงข้ามเซสชัน ไม่ใช่สถานะของรอบใดรอบหนึ่ง
`CLAUDE.md` § Current state เก็บแค่บรรทัด trigger ชี้มาที่นี่

## รูป OG — สระไทยแตกแบบเงียบสนิท

**อาการ:** สคริปต์รันสำเร็จ ไม่มี error ไฟล์ PNG ออกมาครบ แต่สระและวรรณยุกต์ไทยกลายเป็นวงกลมจุดไข่ปลา
(dotted circle) — "ระเบิดเวลา" ออกมาเป็น "ระเบ ◌ ิ ดเวลา"

**เงื่อนไข:** เครื่องนี้ไม่มี libraqm ตัว text path ปกติของ Pillow จึงไม่ทำ complex-script shaping ของไทย
เคยหลุดขึ้น `public/og/timebomb.png` มาแล้วครั้งหนึ่ง

**ห้าม:** ใช้ Pillow เรนเดอร์ข้อความไทย · ตัดบรรทัดกลางคำไทย (คั่นระหว่างพยัญชนะกับสระที่ต้องประกอบกัน
ให้ผลเป็น dotted circle แบบเดียวกัน)

**ทางที่พิสูจน์แล้วว่าใช้ได้:** SVG → `rsvg-convert` (pango+fontconfig จัดรูปไทยถูก) → PNG

```bash
node scripts/make-og.mjs <game-id>
node scripts/make-og.mjs site      # การ์ดระดับเว็บ ใช้กับหน้าที่ไม่ใช่เกมทุกหน้า
```

**ตรวจยังไง:** เปิดไฟล์ PNG ดูด้วยตาเสมอ "รันผ่าน" ไม่ใช่หลักฐานอะไรเลยในเคสนี้ ของที่พังกับของที่ถูก
ต่างกันชัดมากด้วยตาเปล่า แต่ไม่มี exit code ไหนบอก

`scripts/make-og.mjs` ไม่ได้ผูกเข้า npm script โดยตั้งใจ — output ต้องผ่านสายตาคนก่อนใช้
ตัวกันพลาดคือ `validate-games.mjs` ที่ hard-fail ถ้า `public/og/<og>` ไม่มีไฟล์อยู่จริง

## build — ต้องเรียกผ่าน `npm run` เท่านั้น

**อาการ:** เกมใหม่ที่ยังไม่มีรูป OG build ผ่านฉลุยบนเครื่อง แล้วไปตกใน CI · หรือโค้ดที่ type ผิด
build ผ่านแล้วไปพังตอนรัน

**เงื่อนไข:** `npm run build` มี `prebuild` ที่รัน `validate-games.mjs` ให้ แต่ `npx astro build`
ข้าม lifecycle นั้นทั้งหมด · และ `astro build` **ไม่ typecheck เลย** ไม่ว่าจะเรียกสะกดแบบไหน

**ทำ:**

```bash
npm run build        # ไม่ใช่ npx astro build
npx tsc --noEmit     # ต้องรันแยก build ไม่ทำให้
```

CI เรียก `npm run build` ที่ `.github/workflows/ci.yml` ด้วยเหตุผลเดียวกัน — ถ้าวันหนึ่งมีคนแก้กลับไป
เป็น `npx astro build` gate จะเงียบทันที
