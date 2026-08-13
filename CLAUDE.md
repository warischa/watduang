# วัดดวง · watduang.com

เว็บรวมเกมกลุ่มเล่นฟรี 2-10 คน บนเครื่องเดียว (ส่งมือถือวนกัน) ภาษาไทยก่อน หารายได้จาก Google AdSense
แบรนด์อังกฤษ: **PartyPick** (เสนอ รอยืนยัน) — อยู่ที่ `/en/` ไม่ซื้อโดเมนที่สอง

**สถานะ:** ยังไม่เริ่มเขียนโค้ด · การตัดสินใจทั้งหมดอยู่ในแผนที่ [`.scratch/free-game/map.md`](.scratch/free-game/map.md)

## Stack

Astro + TypeScript · **ไม่มี framework ตอน runtime** (vanilla TS ใน island) · CSS ธรรมดา + custom properties · Azure Static Web Apps (Standard) · GitHub Actions · Cloudflare Web Analytics

**1 เกม = 1 ไฟล์ + 1 บรรทัดใน manifest → 1 URL static** ผ่าน `getStaticPaths()` · path routing เท่านั้น **ห้ามใช้ hash route** — SEO คือโมเดลธุรกิจของเว็บนี้ ไม่ใช่ฟีเจอร์

รายละเอียดเต็ม: [`.scratch/free-game/issues/05-stack-and-url-structure.md`](.scratch/free-game/issues/05-stack-and-url-structure.md)

## กฎที่ห้ามละเมิด

**เนื้อหา** — ห้ามภาพขวด กระป๋อง หรือแก้วที่มีโลโก้ **ที่ไหนก็ตาม รวม OG image และ thumbnail** (พลิกเข้ามาตรา 32/1 ทันที) · ห้ามคำท้าที่ชักจูงให้ทำร้ายร่างกายจริง (เสี่ยงถูกปิดบัญชี AdSense จริง) · ไม่มียี่ห้อ ไม่มีลิงก์ร้าน ไม่มี affiliate แอลกอฮอล์ · คุมคำหยาบ · ไม่ต้องมี age gate

**Portability** — build ต้องออกมาเป็น `dist/` static ล้วน และของที่ผูกกับ Azure ต้องอยู่ใน 2 ไฟล์เท่านั้น (`staticwebapp.config.json` + deploy step) · ทดสอบด้วย `npx serve dist/` ใน CI · ห้ามใช้ SWA auth · ห้ามมี Azure SDK ใน build · path เป็น relative ทั้งหมด

**CSP** — ต้องเปิดให้ AdSense ผ่าน ไม่งั้นโฆษณาไม่ขึ้นแบบเงียบๆ (อย่าคัดลอก CSP ของ `admin-tools-dev` มาตรงๆ — เว็บนั้นตั้งใจให้แน่นเพราะจุดขายคือ PDPA)

## Agent skills

### Issue tracker

GitHub Issues ผ่าน `gh` CLI · repo: [`warischa/watduang`](https://github.com/warischa/watduang) (private) · **แผนที่คือ issue #1** พร้อม sub-issue 11 ใบ · เลขใบ + 1 = เลข issue · ไฟล์ใน `.scratch/free-game/issues/` เป็นสำเนาก่อนย้าย **ถือว่าเก่า อ่าน GitHub แทน** ดู `docs/agents/issue-tracker.md`

### Triage labels

ชุดมาตรฐานทั้งห้า ชื่อ label ตรงกับชื่อบทบาท ดู `docs/agents/triage-labels.md`

### Domain docs

single-context — `CONTEXT.md` + `docs/adr/` ที่ราก (ยังไม่มีทั้งคู่ สร้างเมื่อจำเป็นจริง) ดู `docs/agents/domain.md`
