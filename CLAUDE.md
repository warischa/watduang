# วัดดวง · watduang.com

เว็บรวมเกมกลุ่มเล่นฟรี 2-10 คน บนเครื่องเดียว (ส่งมือถือวนกัน) ภาษาไทยก่อน หารายได้จาก Google AdSense
แบรนด์อังกฤษ: **PartyPick** (เสนอ รอยืนยัน) — อยู่ที่ `/en/` ไม่ซื้อโดเมนที่สอง

**สถานะ:** 2 เกมลงแล้ว (`timebomb` · `siamsi`) · การตัดสินใจทั้งหมดอยู่ในแผนที่ [#1](https://github.com/warischa/watduang/issues/1)

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

### S2026-08-13#6

done: **เกม 2 `siamsi` เซียมซีปาร์ตี้ (fortune) ลงแล้ว** `aa5a251` — CI เขียวครบ 11 step, smoke ยิง 2 เกมจริง · การ์ดแชร์ `/` `/games/` `/404` `d254a8d` · siamsi กู้รอบค้างตอนรีเฟรช `e3fd74f` · 14 tests · REFUTE 1 รอบ 6 findings แก้ 5 เลื่อน 1

dec: fork เลือก fortune ก่อน party — ข้าม gate #12 ได้เฉพาะเกมนี้ (เกณฑ์เปลี่ยนเป็น "พื้นถ้าดีมานด์ศูนย์" + ตรง head term) · **เกม 3–7 ยังติด #12** · checkpoint ทำเฉพาะ siamsi (รอบยาวเป็นนาที vs timebomb 30 วิ) เก็บเป็นเลขใบไม่ใช่ index · **ช่อง checkpoint มีช่องเดียวใช้ร่วมทุกเกม ต้องเช็คป้ายชื่อเกมก่อนกู้** · การ์ดแชร์ default ที่ `Base.astro` ที่เดียว · ตัดมติ #10 ทิ้ง

⚠ ก่อนสร้างรูป OG หรือรัน build — สระไทยแตกเงียบ · `npx astro build` ข้าม gate → `docs/runbook.md`

next:
- [ ] DoD #13 ข้อ 4 มือถือจริง (เจ้าของเว็บ) — จอไม่ดับ + เสียงออก iOS · **ปิดข้อนี้ = ปิดใบ #13**
- [ ] #12 Keyword Planner **= gate เกม 3–7** (เจ้าของเว็บ)
- [ ] #9 จด `watduang.com` (เจ้าของเว็บ) — `whois` ยังว่าง ยังไม่มีใครจด
- [ ] ยืนยัน/เปลี่ยน PartyPick — ตัด "รอยืนยัน" ออก
- [ ] Azure SWA เฟส 2 — เจ้าของเว็บตั้ง secret `AZURE_STATIC_WEB_APPS_API_TOKEN` แล้วบอก · push ถัดไป Deploy ต้องไม่ขึ้น skipped ใน `gh run view` · **ด่านเดียวที่พิสูจน์ CSP/AdSense**
- [ ] siamsi ยังไม่มีเทสคลุมสายไฟ DOM (save/resume เรียกถูกจังหวะไหม) — พิสูจน์ตอนเล่นมือถือจริง

inflight: tree สะอาด · push ครบถึง `origin/main` · ไม่มี PR เปิด (เช็คแล้ว) · ไม่มี bg task

## Agent skills

### Issue tracker

GitHub Issues ผ่าน `gh` CLI · repo: [`warischa/watduang`](https://github.com/warischa/watduang) (private) · **แผนที่คือ issue #1** พร้อม sub-issue 11 ใบ · เลขใบ + 1 = เลข issue · **GitHub เป็นแหล่งความจริงเดียว** สำเนา issue+map ใน `.scratch/` ลบแล้ว แต่ `.scratch/free-game/{research,prototypes}/` ยังมีของ track อยู่ 4 ไฟล์ — อย่า gitignore ทั้งโฟลเดอร์ · ดู `docs/agents/issue-tracker.md`

### Triage labels

ชุดมาตรฐานทั้งห้า ชื่อ label ตรงกับชื่อบทบาท ดู `docs/agents/triage-labels.md`

### Domain docs

single-context — `CONTEXT.md` + `docs/adr/` ที่ราก (ยังไม่มีทั้งคู่ สร้างเมื่อจำเป็นจริง) ดู `docs/agents/domain.md`
