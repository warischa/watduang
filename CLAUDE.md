# วัดดวง · watduang.com

เว็บรวมเกมกลุ่มเล่นฟรี 2-10 คน บนเครื่องเดียว (ส่งมือถือวนกัน) ภาษาไทยก่อน หารายได้จาก Google AdSense
แบรนด์อังกฤษ: **PartyPick** (เสนอ รอยืนยัน) — อยู่ที่ `/en/` ไม่ซื้อโดเมนที่สอง

**สถานะ:** ยังไม่เริ่มเขียนโค้ด · การตัดสินใจทั้งหมดอยู่ในแผนที่ [#1](https://github.com/warischa/watduang/issues/1)

## Stack

Astro + TypeScript · **ไม่มี framework ตอน runtime** (vanilla TS ใน island) · CSS ธรรมดา + custom properties · Azure Static Web Apps (Standard) · GitHub Actions · Cloudflare Web Analytics

**1 เกม = 1 ไฟล์ + 1 บรรทัดใน manifest → 1 URL static** ผ่าน `getStaticPaths()` · path routing เท่านั้น **ห้ามใช้ hash route** — SEO คือโมเดลธุรกิจของเว็บนี้ ไม่ใช่ฟีเจอร์

รายละเอียดเต็ม: [#6](https://github.com/warischa/watduang/issues/6)

## กฎที่ห้ามละเมิด

**เนื้อหา** — ห้ามภาพขวด กระป๋อง หรือแก้วที่มีโลโก้ **ที่ไหนก็ตาม รวม OG image และ thumbnail** (พลิกเข้ามาตรา 32/1 ทันที) · ห้ามคำท้าที่ชักจูงให้ทำร้ายร่างกายจริง (เสี่ยงถูกปิดบัญชี AdSense จริง) · ไม่มียี่ห้อ ไม่มีลิงก์ร้าน ไม่มี affiliate แอลกอฮอล์ · คุมคำหยาบ · ไม่ต้องมี age gate

**Portability** — build ต้องออกมาเป็น `dist/` static ล้วน และของที่ผูกกับ Azure ต้องอยู่ใน 2 ไฟล์เท่านั้น (`staticwebapp.config.json` + deploy step) · ทดสอบด้วย `npx serve dist/` ใน CI · ห้ามใช้ SWA auth · ห้ามมี Azure SDK ใน build · path เป็น relative ทั้งหมด

**CSP** — ต้องเปิดให้ AdSense ผ่าน ไม่งั้นโฆษณาไม่ขึ้นแบบเงียบๆ (อย่าคัดลอก CSP ของ `admin-tools-dev` มาตรงๆ — เว็บนั้นตั้งใจให้แน่นเพราะจุดขายคือ PDPA)

## Current state

เหตุผลของทุกการตัดสินใจอยู่ใน GitHub issues — **ห้ามเขียนซ้ำที่นี่ อ้างเลขเอา** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

### S2026-08-13#1

done: `.scratch/free-game/` +map +11 ใบ +research 3 ฉบับ +prototype ของทิ้ง · `CLAUDE.md` `docs/agents/` +สร้าง · repo `warischa/watduang` +init +private +push · GitHub +map#1 +sub-issue 11 +label 10 +native deps · ปิดไป 9/11

dec: เหตุผล → issues #2–#12 · สรุปย่อ → #1 Decisions-so-far · ที่เหลืออยู่นอกไฟล์นี้: domain=`watduang.com` **ยังไม่จด** · en=PartyPick *รอยืนยัน* · roster=localStorage เท่านั้น ไม่มีคะแนนข้ามเกม · Azure sub=`edad4930-c46c-4c78-9362-c75e71a91a35` region=`southeastasia` plan=**Standard** · เกม 7 ตัว เรียงตามสิ่งที่แต่ละตัวพิสูจน์ ตัวแรก=ระเบิดเวลา · ads=วางเองล้วน **ไม่ใช้ Auto ads** · sticky ปิดบนหน้าส่งมือถือและจังหวะเฉลย

next:
- [ ] scaffold Astro + เกม 1 ระเบิดเวลา — `npx serve dist/` เสิร์ฟ `/game/timebomb` เป็น HTML ของตัวเอง
- [ ] [#9](https://github.com/warischa/watduang/issues/9) จด `watduang.com` — `whois` ขึ้นเจ้าของ
- [ ] [#12](https://github.com/warischa/watduang/issues/12) Keyword Planner — `research/keyword-planner.md` มี volume จริง
- [ ] ยืนยันหรือเปลี่ยน PartyPick — บรรทัดแบรนด์ข้างบนตัดคำว่า "รอยืนยัน" ออก

inflight: working tree สะอาด · ไม่มี PR เปิด (เช็คแล้ว) · ไม่มี bg task (เช็คแล้ว) · GitHub เปิดค้าง #9 #12

## Agent skills

### Issue tracker

GitHub Issues ผ่าน `gh` CLI · repo: [`warischa/watduang`](https://github.com/warischa/watduang) (private) · **แผนที่คือ issue #1** พร้อม sub-issue 11 ใบ · เลขใบ + 1 = เลข issue · **GitHub เป็นแหล่งความจริงเดียว** สำเนาใน `.scratch/` ลบแล้ว · ดู `docs/agents/issue-tracker.md`

### Triage labels

ชุดมาตรฐานทั้งห้า ชื่อ label ตรงกับชื่อบทบาท ดู `docs/agents/triage-labels.md`

### Domain docs

single-context — `CONTEXT.md` + `docs/adr/` ที่ราก (ยังไม่มีทั้งคู่ สร้างเมื่อจำเป็นจริง) ดู `docs/agents/domain.md`
