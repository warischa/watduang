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

### S2026-08-13#7

done: **เกม 2 `siamsi` ลง CI เขียว 11 step** `aa5a251` · การ์ดแชร์ `/` `/games/` `/404` `d254a8d` · siamsi กู้รอบค้างตอนรีเฟรช `e3fd74f` · 14 tests · **grilling รอบใหญ่ → `CONTEXT.md` + ADR 0001-0004 + spec [#14] แตกเป็นตั๋ว [#15] → [#16][#17][#18]**

dec: why อยู่ใน `docs/adr/` — 0001 หมวด · 0002 siamsi=เกม 8 · 0004 เครื่องมือ 4 ตัว `/tool/<slug>` ต้องใช้ roster ร่วม · **0003 คือเกณฑ์ที่ยังมีชีวิต: organic clicks <300/เดือน ที่เดือน 6 นับจาก tool+3 เกมขึ้น prod → ไม่ถึง = ดัน `/en/`**

⚠ ก่อนสร้างรูป OG · รัน build · หรือยื่นตัวเลือกให้เจ้าของเว็บตัดสิน → อ่าน `docs/runbook.md` ก่อน

next:
- [ ] **[#15] วงล้อสุ่ม + โครงหน้าเครื่องมือ — เริ่มได้เลย** จบแล้วปลด [#16][#17][#18] ทำขนานได้
- [ ] DoD #13 ข้อ 4 มือถือจริง (เจ้าของเว็บ) — **ปิดข้อนี้ = ปิดใบ #13** · เช็คสายไฟ checkpoint ของ siamsi ไปด้วย (เทสคลุมไม่ถึง)
- [ ] #9 จด `watduang.com` (เจ้าของเว็บ) — `whois` ยังว่าง
- [ ] Azure SWA เฟส 2 — เจ้าของเว็บตั้ง secret `AZURE_STATIC_WEB_APPS_API_TOKEN` · Deploy ต้องไม่ขึ้น skipped ใน `gh run view` · **ด่านเดียวที่พิสูจน์ CSP/AdSense**
- [ ] GitHub ค้างรออนุญาต: ผูก #14 เข้า #1 · แก้ #12 ให้เลิกอ้างเป็น gate (ADR-0003) · เปิดใบ gate ใหม่ · เปิดใบให้ `siamsi`
- [ ] ยืนยัน/เปลี่ยน PartyPick

inflight: tree สะอาด · push ครบถึง `origin/main` · ไม่มี PR เปิด (เช็คแล้ว) · ไม่มี bg task

## Agent skills

**GitHub Issues คือแหล่งความจริงเดียว** — แผนที่คือ [#1](https://github.com/warischa/watduang/issues/1) · วิธีทำงานกับ tracker และกติกาเลขใบ: `docs/agents/issue-tracker.md`

ก่อนเขียนโค้ด: ใช้คำตาม `CONTEXT.md` และเคารพ `docs/adr/` · label: `docs/agents/triage-labels.md` · โดเมน: `docs/agents/domain.md`

การบันทึกเซสชัน (window · บ้านของข้อมูล · สิ่งที่ห้ามอยู่ในไฟล์นี้): `.claude/commands/save-session.md`
