# Session handoff — วัดดวง

**นี่คือบ้านของสถานะสด ไม่ใช่ไฟล์ประกอบ** — `CLAUDE.md` ไม่มี § Current state แล้ว resume อ่านไฟล์นี้เป็นแหล่งหลัก

รูปแบบ · window · budget · roll: `.claude/commands/save-session.md` · เหตุผลของทุกการตัดสินใจอยู่ใน GitHub issues และ `docs/adr/` — **ห้ามเขียนซ้ำที่นี่ อ้างเลขเอา** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state

### S2026-08-14#1

done: **[#15] เครื่องมือ 1 ลง `24fe2c8`** — `/tool/wheel/` · `/tools/` · `src/tools/wheel.ts` + เทส mutation-proven · shell ใช้ร่วมกับเกม · **แก้ CSP ที่ทำให้ page JS โดนบล็อกเงียบ + 3 ด่านใน `ci.yml`** · 20 tests · `/tools/` เลิกกำพร้า `0a485ee` · docs → pointer `bb9c1dc` · tracker: เปิด #19 #20 · #12 เลิกเป็น gate · ผูก #14 #19 #20 เข้า #1 · dep #19←#9

dec: ADR-0005 (page JS ห้าม inline) · ADR-0004 §เพิ่มตอน #15 (session ทางอ้อม · วงที่จำไว้ · baseline ของหน้าหาย) · **gate ตัวจริงคือใบ #19 แล้ว ไม่ใช่ #12** (ADR-0003)

next:
- [ ] **[#16][#17][#18] ทำขนานได้เลย** — โครงใช้ซ้ำได้ตาม ADR-0004 · เพิ่ม slug ใน `EXPECTED_TOOL_SLUGS` ที่ `ci.yml` · เสร็จ = build + `node --test` เขียว และด่าน absence แดงเมื่อ `mv` หน้าออก
- [ ] DoD #13 ข้อ 4 มือถือจริง (เจ้าของเว็บ) — **ปิดข้อนี้ = ปิดใบ #13** · รอบเดียวกันเช็ค #20 ด้วย: siamsi กลางวง → รีเฟรช → ต้องกู้รอบเดิมได้
- [ ] #9 จด `watduang.com` (เจ้าของเว็บ) — `whois` ยังว่าง (เช็ค 2026-08-14) · #19 blocked by ใบนี้
- [ ] Azure SWA เฟส 2 — เจ้าของเว็บตั้ง secret `AZURE_STATIC_WEB_APPS_API_TOKEN` · เสร็จ = Deploy ไม่ขึ้น skipped ใน `gh run view` · **ด่านเดียวที่พิสูจน์ CSP/AdSense**
- [ ] ยังไม่ได้เปิดใบ 2 เรื่องที่ REFUTE เจอ (รออนุญาต) — ทั้งคู่อยู่ใน ADR-0004 §เพิ่มตอน #15: ด้าน `max` ตัดเงียบ · ทางไปโหมด "คนที่ 1..N"
- [ ] ยืนยัน/เปลี่ยน PartyPick

inflight: tree สะอาด · ไม่มี PR เปิด (เช็คแล้ว) · ไม่มี bg task · push แล้วในรอบนี้
