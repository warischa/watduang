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

### S2026-08-13#3

done: สำเนา `.scratch/` issues+map ลบแล้ว (sync body #8 ขึ้น GitHub ก่อน — answer เดิมอยู่แค่ใน comment) · docs repoint → GitHub · adversarial review = Codex `gpt-5.6-sol` xhigh 12 findings + reconcile → บันทึกครบใน comment: [#1](https://github.com/warischa/watduang/issues/1#issuecomment-5277741890) (full+verdict) #6 #8 #10 #12 + map Decisions-so-far · scaffold spec เต็ม → [#13](https://github.com/warischa/watduang/issues/13) (ticket 12 · sub-issue ของ #1 · ready-for-agent · DoD 4 ข้อ)

dec: **Pause เกม 2–7 + เนื้อหา ~230 ข้อ จนกว่า #12 ตอบ go/no-go** · scaffold+เกม 1 เดินได้ทุกกรณี · ads แก้มติ (แทน "sticky ปิด 2 จังหวะ"): **ห้ามโฆษณาบนจอเล่นทั้งหมด** inventory=hub/กติกา/post-game · จอง slot กัน CLS · สมัคร AdSense หลังมี prose · PDPA เริ่ม NPA → #8 · state แก้มติ (แทน "roster เท่านั้น"): roster (persistent) + session (transient มี expiry) · lifecycle contract · content stable ID · CI validate ต่อเกม · ระเบิดเวลา physics · OG field → #6 · 32/1 ยังไม่ปิด → #10

next:
- [ ] #12 Keyword Planner **= gate** (เจ้าของเว็บ ต้อง Google Ads) — worksheet ตามสเปกใน comment มี volume จริง
- [ ] #9 จด `watduang.com` (เจ้าของเว็บ) — `whois` ขึ้นเจ้าของ
- [ ] scaffold ตามสเปกเต็มใน [#13](https://github.com/warischa/watduang/issues/13) (โครง+contract+CI+เกม 1 — ครบ ไม่ต้องรื้อ) — DoD 4 ข้อในใบนั้น
- [ ] ตัดสิน #10: ทนายรีวิวหน้า "ใครแพ้หมดแก้ว" vs ตัด angle ทิ้ง (เจ้าของเว็บ)
- [ ] ยืนยัน/เปลี่ยน PartyPick — ตัด "รอยืนยัน" ออกจากบรรทัดแบรนด์
- [ ] map #1 Decisions-so-far ลิงก์ relative ชี้ `issues/*.md` ที่ลบแล้ว — กวาดเป็นเลข issue

inflight: tree สะอาด · push ครบถึง origin/main (เช็คแล้ว) · ไม่มี PR เปิด (เช็คแล้ว) · ไม่มี bg task (Codex jobs จบแล้ว)

## Agent skills

### Issue tracker

GitHub Issues ผ่าน `gh` CLI · repo: [`warischa/watduang`](https://github.com/warischa/watduang) (private) · **แผนที่คือ issue #1** พร้อม sub-issue 11 ใบ · เลขใบ + 1 = เลข issue · **GitHub เป็นแหล่งความจริงเดียว** สำเนาใน `.scratch/` ลบแล้ว · ดู `docs/agents/issue-tracker.md`

### Triage labels

ชุดมาตรฐานทั้งห้า ชื่อ label ตรงกับชื่อบทบาท ดู `docs/agents/triage-labels.md`

### Domain docs

single-context — `CONTEXT.md` + `docs/adr/` ที่ราก (ยังไม่มีทั้งคู่ สร้างเมื่อจำเป็นจริง) ดู `docs/agents/domain.md`
