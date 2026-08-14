# วัดดวง · watduang.com

เว็บรวมเกมกลุ่มเล่นฟรี 2-10 คน บนเครื่องเดียว (ส่งมือถือวนกัน) ภาษาไทยก่อน หารายได้จาก Google AdSense
แบรนด์อังกฤษ: **PartyPick** (เสนอ รอยืนยัน) — อยู่ที่ `/en/` ไม่ซื้อโดเมนที่สอง

**สถานะสด คิวถัดไป และ inflight อยู่ที่ `SESSION-HANDOFF.md` ที่ราก — นั่นคือบ้านของมัน ไม่ใช่ไฟล์ประกอบ**
resume ต้องอ่านไฟล์นั้นเป็นแหล่งสถานะหลัก · ไฟล์นี้เก็บเฉพาะของนิ่งที่ต้องรู้**ก่อน**ลงมือ และไม่เขียนสถานะซ้ำ

## Stack

Astro + TypeScript · **ไม่มี framework ตอน runtime** (vanilla TS ใน island) · CSS ธรรมดา + custom properties · Azure Static Web Apps (Standard) · GitHub Actions · Cloudflare Web Analytics

**1 เกม = 1 ไฟล์ + 1 บรรทัดใน manifest → 1 URL static** ผ่าน `getStaticPaths()` · path routing เท่านั้น **ห้ามใช้ hash route** — SEO คือโมเดลธุรกิจของเว็บนี้ ไม่ใช่ฟีเจอร์

รายละเอียดเต็ม: [#6](https://github.com/warischa/watduang/issues/6)

## กฎที่ห้ามละเมิด

**เนื้อหา** — ห้ามภาพขวด กระป๋อง หรือแก้วที่มีโลโก้ **ที่ไหนก็ตาม รวม OG image และ thumbnail** (พลิกเข้ามาตรา 32/1 ทันที) · ห้ามคำท้าที่ชักจูงให้ทำร้ายร่างกายจริง (เสี่ยงถูกปิดบัญชี AdSense จริง) · ไม่มียี่ห้อ ไม่มีลิงก์ร้าน ไม่มี affiliate แอลกอฮอล์ · คุมคำหยาบ · ไม่ต้องมี age gate

**Portability** — build ต้องออกมาเป็น `dist/` static ล้วน และของที่ผูกกับ Azure ต้องอยู่ใน 2 ไฟล์เท่านั้น (`staticwebapp.config.json` + deploy step) · ทดสอบด้วย `npx serve dist/` ใน CI · ห้ามใช้ SWA auth · ห้ามมี Azure SDK ใน build · path เป็น relative ทั้งหมด

**CSP** — ต้องเปิดให้ AdSense ผ่าน ไม่งั้นโฆษณาไม่ขึ้นแบบเงียบๆ (อย่าคัดลอก CSP ของ `admin-tools-dev` มาตรงๆ — เว็บนั้นตั้งใจให้แน่นเพราะจุดขายคือ PDPA) · สคริปต์ของหน้าห้าม inline: ADR-0005

⚠ ก่อนสร้างรูป OG · รัน build · หรือยื่นตัวเลือกให้เจ้าของเว็บตัดสิน → อ่าน `docs/runbook.md` ก่อน

## Language

**Write English. Ship Thai.** Effective 2026-08-14 — everything an agent reads or writes is English;
everything a player reads is Thai. The two never swap.

| Surface | Language |
|---|---|
| Every `.md` in this repo — `CLAUDE.md`, `SESSION-HANDOFF.md`, `docs/**`, ADRs, runbook, `CONTEXT.md` | **English** |
| Code comments, identifiers, commit messages, PR bodies, GitHub issue bodies | **English** |
| `src/**` user-facing strings, UI copy, game and tool content, `seo.*` fields, OG text | **Thai — never translate.** This is a Thai-first product; the copy IS the product |
| Domain terms that *are* Thai words (`วัดดวง`, `เซียมซี`, `วงล้อสุ่ม`) | keep the Thai term verbatim inside English prose |

Quote Thai UI copy verbatim when a doc needs to cite it — quoting is not translating.

Chat mirrors the reader: English in → English out, ไทย เข้า → ไทย ออก. Chat language never changes
what a file gets written in — a Thai conversation still produces English docs.

Existing Thai docs convert on touch unless a session is told otherwise; a file being edited gets
rewritten in English in that same edit, not left half-converted.

## Agent skills

**GitHub Issues คือแหล่งความจริงเดียว** — แผนที่คือ [#1](https://github.com/warischa/watduang/issues/1) · วิธีทำงานกับ tracker และกติกาเลขใบ: `docs/agents/issue-tracker.md`

ก่อนเขียนโค้ด: ใช้คำตาม `CONTEXT.md` และเคารพ `docs/adr/` · label: `docs/agents/triage-labels.md` · โดเมน: `docs/agents/domain.md`

การบันทึกเซสชัน (window · บ้านของข้อมูล · สิ่งที่ห้ามอยู่ในไฟล์นี้): `.claude/commands/save-session.md`
