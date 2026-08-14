# สคริปต์ของหน้าต้องไม่ถูก inline — แก้ที่ build config ไม่ใช่ที่ CSP และไม่ใช่ทีละหน้า

`staticwebapp.config.json` ตั้ง `script-src 'self' …` โดย **ไม่มี `'unsafe-inline'`** ส่วน Astro จะ inline สคริปต์ของหน้าเมื่อหน้านั้นไม่มี `import`, ไม่มี dynamic import, และเล็กกว่า `vite.build.assetsInlineLimit` (ค่าเริ่มต้น 4096)

สองอย่างนี้ชนกันแบบ**เงียบสนิท**: สคริปต์ถูก inline → CSP บล็อก → หน้าเปิดได้ ดูปกติทุกอย่าง แต่กดอะไรก็ไม่เกิดอะไร ไม่มี error ให้ CI เห็น

เจอตอนทำ [#15](https://github.com/warischa/watduang/issues/15) — `dist/tool/wheel/index.html` เป็นหน้าเดียวในทั้ง build ที่มี src-less `<script type="module">` หน้าเกมรอดมาโดยบังเอิญ เพราะ glob dynamic import ที่ `src/pages/game/[id].astro` ทำให้สคริปต์หลุดเงื่อนไข inline ไปเอง

## การตัดสิน

`astro.config.mjs` ตั้ง `vite.build.assetsInlineLimit` เป็น**ฟังก์ชัน** ที่บังคับเฉพาะ `.js` ให้ออกไปเป็นไฟล์นอกเสมอ และ `ci.yml` มีด่านที่ล้มเมื่อ HTML ไฟล์ไหนใน `dist/` มี `<script>` ที่ไม่มี `src` และมี `type` อยู่ในรายการที่ CSP คุม

## ทางที่ถูกปฏิเสธ

**เติม `'unsafe-inline'` ลง CSP** — ถูกที่สุดและผิดที่สุด CSP ของเว็บนี้ต้องเปิดให้ AdSense ผ่านอยู่แล้ว การเปิดเพิ่มเพื่อความสะดวกของตัวเองทำให้เหลือ CSP ไว้เป็นพิธี

**แก้ทีละหน้า** (ยัด import ปลอมหรือแยกสคริปต์ออกเป็นไฟล์เอง) — ได้ผลกับ `/tool/wheel/` แต่ [#16](https://github.com/warischa/watduang/issues/16) [#17](https://github.com/warischa/watduang/issues/17) [#18](https://github.com/warischa/watduang/issues/18) จะคัดลอกหน้านี้ไปเป็นโครง แล้วต้องจำกฎนี้ใหม่ทุกใบ กฎที่ต้องจำคือกฎที่จะถูกลืม

**`assetsInlineLimit: 0`** แบบแบน — `plugin-css` ใช้เพดานตัวเดียวกัน จะดัน stylesheet ออกไปข้างนอกด้วย ทำให้ `prefers-reduced-motion` หลุดจาก HTML ที่ CI ตรวจ ต้องเป็นฟังก์ชันที่แยกเฉพาะ `.js`

## รายการชนิดในด่าน — allowlist ไม่ใช่ blocklist

ด่านจับตาม `type` ที่ CSP คุม ไม่ใช่ยกเว้น `ld+json` เป็นรายตัว เพราะ blocklist ต้องไล่ตามชนิดใหม่ตลอดไป

**`importmap` และ `speculationrules` อยู่ในรายการที่ต้องจับ** — ทั้งคู่ดูเหมือน data block แต่ `script-src-elem` คุมจริง (spec เพิ่มคีย์เวิร์ด `'inline-speculation-rules'` มาเพราะเหตุนี้ · Chrome ปฏิเสธ inline import map ภายใต้ CSP เข้ม) ถ้าปล่อยผ่าน วันหนึ่งมีคนใส่ import map แล้ว module ทั้งหน้าหยุดโหลดโดยด่านยังเขียว ซึ่งคือความล้มเหลวแบบเดียวกับที่ด่านนี้ตั้งมาเพื่อกัน

`application/ld+json` และ `application/json` ไม่อยู่ในรายการ — CSP ไม่คุม data block จริง และ false positive คือสิ่งที่ทำให้มีคนมาถอดด่านทิ้ง

## ผลที่ตามมา

หน้าใหม่ทุกหน้าได้การป้องกันฟรีโดยไม่ต้องรู้เรื่องนี้ · ด่านถูกพิสูจน์ว่าแดงได้จริงก่อนปล่อย (คืน config เป็นของเดิม build ใหม่ → inline โผล่กลับมา · ฉีด inline import map → แดง · ฉีด `ld+json` → เขียว)

**ยังพิสูจน์ไม่ได้จนกว่าจะมี production:** ว่า CSP ชุดนี้ปล่อย AdSense ผ่านจริง — ด่านนี้พิสูจน์แค่ว่าเราไม่ได้ยิงเท้าตัวเองด้วย inline script
