# วัดดวง · watduang.com

เว็บรวมเกมกลุ่มเล่นฟรี 2-10 คน บนเครื่องเดียว (ส่งมือถือวนกัน) ภาษาไทยก่อน หารายได้จาก Google AdSense
แบรนด์อังกฤษ: **PartyPick** (เสนอ รอยืนยัน) — อยู่ที่ `/en/` ไม่ซื้อโดเมนที่สอง

สถานะสดอยู่ที่ § Current state ข้างล่าง — ที่นี่ไม่เขียนซ้ำ

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

### S2026-08-14#1

done: **[#15] เครื่องมือ 1 ลง `24fe2c8`** — `/tool/wheel/` · `/tools/` · `src/tools/wheel.ts` + เทส mutation-proven · shell ใช้ร่วมกับเกม · **แก้ CSP ที่ทำให้ page JS โดนบล็อกเงียบ + 3 ด่านใน `ci.yml`** · 20 tests · `/tools/` เลิกกำพร้า `0a485ee` · docs → pointer `bb9c1dc` · tracker: เปิด #19 #20 · #12 เลิกเป็น gate · ผูก #14 #19 #20 เข้า #1 · dep #19←#9

dec: ADR-0005 (page JS ห้าม inline) · ADR-0004 §เพิ่มตอน #15 (session ทางอ้อม · วงที่จำไว้ · baseline ของหน้าหาย) · **gate ตัวจริงคือใบ #19 แล้ว ไม่ใช่ #12** (ADR-0003)

⚠ ก่อนสร้างรูป OG · รัน build · หรือยื่นตัวเลือกให้เจ้าของเว็บตัดสิน → อ่าน `docs/runbook.md` ก่อน

next:
- [ ] **[#16][#17][#18] ทำขนานได้เลย** — โครงใช้ซ้ำได้ตาม ADR-0004 · เพิ่ม slug ใน `EXPECTED_TOOL_SLUGS` ที่ `ci.yml` · เสร็จ = build + `node --test` เขียว และด่าน absence แดงเมื่อ `mv` หน้าออก
- [ ] DoD #13 ข้อ 4 มือถือจริง (เจ้าของเว็บ) — **ปิดข้อนี้ = ปิดใบ #13** · รอบเดียวกันเช็ค #20 ด้วย: siamsi กลางวง → รีเฟรช → ต้องกู้รอบเดิมได้
- [ ] #9 จด `watduang.com` (เจ้าของเว็บ) — `whois` ยังว่าง (เช็ค 2026-08-14) · #19 blocked by ใบนี้
- [ ] Azure SWA เฟส 2 — เจ้าของเว็บตั้ง secret `AZURE_STATIC_WEB_APPS_API_TOKEN` · เสร็จ = Deploy ไม่ขึ้น skipped ใน `gh run view` · **ด่านเดียวที่พิสูจน์ CSP/AdSense**
- [ ] ยังไม่ได้เปิดใบ 2 เรื่องที่ REFUTE เจอ (รออนุญาต) — ทั้งคู่อยู่ใน ADR-0004 §เพิ่มตอน #15: ด้าน `max` ตัดเงียบ · ทางไปโหมด "คนที่ 1..N"
- [ ] ยืนยัน/เปลี่ยน PartyPick

inflight: tree สะอาด · ไม่มี PR เปิด (เช็คแล้ว) · ไม่มี bg task · push แล้วในรอบนี้

## Agent skills

**GitHub Issues คือแหล่งความจริงเดียว** — แผนที่คือ [#1](https://github.com/warischa/watduang/issues/1) · วิธีทำงานกับ tracker และกติกาเลขใบ: `docs/agents/issue-tracker.md`

ก่อนเขียนโค้ด: ใช้คำตาม `CONTEXT.md` และเคารพ `docs/adr/` · label: `docs/agents/triage-labels.md` · โดเมน: `docs/agents/domain.md`

การบันทึกเซสชัน (window · บ้านของข้อมูล · สิ่งที่ห้ามอยู่ในไฟล์นี้): `.claude/commands/save-session.md`
