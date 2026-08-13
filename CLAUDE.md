# วัดดวง · watduang.com

เว็บรวมเกมกลุ่มเล่นฟรี 2-10 คน บนเครื่องเดียว (ส่งมือถือวนกัน) ภาษาไทยก่อน หารายได้จาก Google AdSense
แบรนด์อังกฤษ: **PartyPick** (เสนอ รอยืนยัน) — อยู่ที่ `/en/` ไม่ซื้อโดเมนที่สอง

**สถานะ:** scaffold + เกมแรกลงแล้ว (`02708ed`) · การตัดสินใจทั้งหมดอยู่ในแผนที่ [#1](https://github.com/warischa/watduang/issues/1)

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

### S2026-08-13#5

done: scaffold #13 → `02708ed` push แล้ว · **CI เขียวครบรอบแรก** deploy skip ถูกเพราะยังไม่มี secret · **DoD #13 ข้อ 1-3 ปิด เหลือข้อ 4** · REFUTE 1 รอบ 6 findings แก้ครบ · map #1 ลิงก์ตาย 14 → 0 · **ผลรันจริง + แก้มติ 9 ข้อ + ของที่รู้แต่ยังไม่แก้ →** [#13 comment](https://github.com/warischa/watduang/issues/13#issuecomment-5278598792)

dec: why ทุกข้ออยู่ในคอมเมนต์นั้น — `build.format=directory` + `trailingSlash=always` · manifest static import ตอน build ส่วน island รับ `id` ผ่าน `data-game-id` แล้ว `import.meta.glob` · CSP header-only และไฟล์ต้องอยู่ `public/staticwebapp.config.json` (ที่รากไม่ถึง prod) · pin wildcard Google ไม่ไล่ exact host · `script-src` ไม่มี `unsafe-inline` → snippet AdSense ต้อง external · `ads===false` บังคับ · field ใหม่ `tagline` · ไม่อัป astro แม้ audit เตือน

⚠ รูป OG อย่าใช้ Pillow — เครื่องนี้ไม่มี libraqm สระไทยกลายเป็นวงกลมจุดทั้งที่ draw สำเร็จ → `node scripts/make-og.mjs <id>` แล้วเปิดดูด้วยตา

next:
- [ ] DoD #13 ข้อ 4 มือถือจริง (เจ้าของเว็บ) — จอไม่ดับ + เสียงออก iOS · **ปิดข้อนี้ = ปิดใบ #13**
- [ ] #12 Keyword Planner **= gate เกม 2–7** (เจ้าของเว็บ)
- [ ] #9 จด `watduang.com` (เจ้าของเว็บ) — `whois` ขึ้นเจ้าของ
- [ ] ยืนยัน/เปลี่ยน PartyPick — ตัด "รอยืนยัน" ออก
- [ ] Azure SWA เฟส 2 deploy จริง (**ยืนยันก่อน**) — หลัง CI เขียว

inflight: tree สะอาด · push ครบถึง `origin/main` · ไม่มี PR เปิด (เช็คแล้ว) · ไม่มี bg task
## Agent skills

### Issue tracker

GitHub Issues ผ่าน `gh` CLI · repo: [`warischa/watduang`](https://github.com/warischa/watduang) (private) · **แผนที่คือ issue #1** พร้อม sub-issue 11 ใบ · เลขใบ + 1 = เลข issue · **GitHub เป็นแหล่งความจริงเดียว** สำเนา issue+map ใน `.scratch/` ลบแล้ว แต่ `.scratch/free-game/{research,prototypes}/` ยังมีของ track อยู่ 4 ไฟล์ — อย่า gitignore ทั้งโฟลเดอร์ · ดู `docs/agents/issue-tracker.md`

### Triage labels

ชุดมาตรฐานทั้งห้า ชื่อ label ตรงกับชื่อบทบาท ดู `docs/agents/triage-labels.md`

### Domain docs

single-context — `CONTEXT.md` + `docs/adr/` ที่ราก (ยังไม่มีทั้งคู่ สร้างเมื่อจำเป็นจริง) ดู `docs/agents/domain.md`
