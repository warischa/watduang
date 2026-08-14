# /save-session — override ของ watduang

master คือ `~/.claude/commands/save-session.md` · ทุกอย่างที่ไฟล์นี้ไม่ได้ประกาศ ใช้ของ master
ไฟล์นี้มีเฉพาะสิ่งที่ repo นี้ต่างจาก master หรือที่ master บอกให้ project ประกาศเอง

## บ้านของสถานะสดคือ `SESSION-HANDOFF.md` ที่ราก ไม่ใช่ `CLAUDE.md`

**ข้อนี้ override master โดยตรง** — master ถือว่า `SESSION-HANDOFF.md` เป็นโหมด fallback ของโปรเจกต์
ที่ยังไม่มีโครงสร้าง และสั่งให้ปลดระวางเป็น pointer เมื่อมี state section แล้ว **repo นี้ทำกลับกันโดยตั้งใจ**

เหตุผล: `CLAUDE.md` ถูก inject เข้า context ทุกเซสชัน ส่วนสถานะสดเป็นส่วนเดียวที่เปลี่ยนทุกรอบและโตเร็วที่สุด
(เคยกิน 3023B จาก 6549B และชนเพดานสองครั้งในการ save ครั้งเดียว) แยกออกมาแล้วได้สองอย่าง:
ของนิ่งที่ต้องรู้**ก่อน**ลงมือไม่ต้องแข่งไบต์กับสถานะ และไบต์ของสถานะไม่ถูกจ่ายในเซสชันที่ไม่ได้ resume

**ราคาที่ต้องรู้และต้องกันไว้:** `SESSION-HANDOFF.md` **ไม่ถูก auto-load** เอเจนต์ที่ไม่ได้รัน `/resume-project`
จะไม่เห็นสถานะเลย · ตัวกันคือบรรทัดบนหัว `CLAUDE.md` ที่เขียนชัดว่าไฟล์นั้นคือบ้านของสถานะ
ไม่ใช่ไฟล์ประกอบ — **ห้ามแก้ให้กำกวม** master RH จัด handoff doc เป็น "pointer doc ไม่ใช่ state"
ถ้าบรรทัดนั้นอ่อนลงเมื่อไหร่ RH จะอ่านข้าม

**อะไรที่ไม่ย้ายออกจาก `CLAUDE.md`:** Stack · กฎที่ห้ามละเมิด · Agent skills — ต้องรู้ก่อนลงมือ
ซึ่งเป็นเหตุผลเดียวที่ไฟล์ auto-load มีอยู่ ย้ายกฎ CSP หรือกฎห้ามภาพขวดออกไปไฟล์ที่ไม่ถูก inject
คือถอดตัวกันพลาดทิ้ง

## Window · entry format · archive

- window **N=1** · entry อยู่ใน `SESSION-HANDOFF.md` ใต้หัวข้อ `## Current state`
- entry header เป็น **h3** `### S<YYYY-MM-DD>#<n>` ไม่ใช่ h2
  → `~/.claude/scripts/roll-state-window.sh` รับแต่ `^## S` มันจะ ABORT เสมอบน repo นี้
  **นี่ไม่ใช่ format drift** เป็นรูปแบบที่ประกาศไว้ ให้ตกไป manual sed move แล้วยืนยัน 3 assert
  (บล็อกไปโผล่ในอาร์ไคฟ์แบบ verbatim · source เหลือ 0 copy · archive มี 1 copy)
- roll คือ `SESSION-HANDOFF.md` → `docs/sessions-archive.md` newest-first append-only · resume ไม่อ่านอาร์ไคฟ์

## Budgets

| ไฟล์ | budget | ทำไม |
|---|---|---|
| `CLAUDE.md` ทั้งไฟล์ | **12KB** (ค่า master) | auto-load ทุกเซสชัน |
| `SESSION-HANDOFF.md` ทั้งไฟล์ | **4KB** (ค่า master สำหรับไฟล์ชนิดนี้) | อ่านตอน resume |

**ห้ามขยายเพดานเพื่อให้ ratchet gate ผ่าน** — เคยตึงถึง 98.8% มาแล้ว ทางแก้คือย้ายของออกตามตารางข้างล่าง
ไม่ใช่บีบคำให้สั้นลง และไม่ใช่ตั้งตัวเลขใหม่ · ตัวเลข 4KB ข้างบนเป็นค่าที่ master ประกาศไว้สำหรับ
`SESSION-HANDOFF` อยู่แล้ว ไม่ใช่เลขที่คิดขึ้นเองเพื่อให้ผ่าน

`check-budgets.sh` หา section ชื่อ `## Current state` — ตอนนี้อยู่คนละไฟล์ ให้รันสองรอบ:
`check-budgets.sh CLAUDE.md` สำหรับเพดานไฟล์ และ `check-budgets.sh SESSION-HANDOFF.md` สำหรับสถานะ

## ของแต่ละอย่างอยู่บ้านไหน

| ข้อมูล | บ้าน | เหลืออะไรไว้ใน `CLAUDE.md` |
|---|---|---|
| **สถานะสด + คิวถัดไป + inflight** | **`SESSION-HANDOFF.md`** | pointer 1 บรรทัดบนหัวไฟล์ ที่เขียนชัดว่านั่นคือบ้าน |
| เหตุผลของการตัดสินใจ | `docs/adr/NNNN-*.md` | เลข ADR เท่านั้น |
| คำศัพท์โดเมน | `CONTEXT.md` | ไม่มีเลย |
| gotcha ที่จริงข้ามเซสชัน | `docs/runbook.md` | trigger 1 บรรทัด (อาการ + เงื่อนไข + ตัวชี้) |
| สเปก · ตั๋ว · เหตุผลระดับผลิตภัณฑ์ | GitHub issues | เลขใบ |
| วิธีทำงานกับ tracker · label · domain | `docs/agents/*.md` | pointer 1 บรรทัด |
| entry เก่า | `docs/sessions-archive.md` | ไม่มี |

## ห้ามอยู่ใน CLAUDE.md

- **สถานะสด ทุกรูปแบบ** — รวมบรรทัดสรุปสถานะบนหัวไฟล์ ที่นี่มีได้แค่ pointer ไป `SESSION-HANDOFF.md`
- **เหตุผล** — มี `docs/adr/` แล้ว ที่นี่อ้างเลข
- **ประวัติการแก้มติ** — saga อยู่ใน ADR หรืออาร์ไคฟ์ การแก้ทับ **แทนที่** ข้อความเดิม ไม่ต่อท้าย
- **ตัวเลขที่นับได้จาก `gh`** เช่นจำนวน issue หรือจำนวน sub-issue — มันเน่าเงียบและไม่มีใครไปแก้
  (เคยเขียนว่า "sub-issue 11 ใบ" ค้างไว้จนกลายเป็น 18)

## ห้ามอยู่ใน SESSION-HANDOFF.md

- **narrative** — เป็น entry แบบ telegraphic ตาม master ไม่ใช่เรื่องเล่า
- **เหตุผล** — เหมือนกฎของ `CLAUDE.md` ทุกประการ อ้างเลข ADR
- **กฎที่ต้องรู้ก่อนลงมือ** — ไฟล์นี้ไม่ถูก auto-load ของแบบนั้นต้องอยู่ใน `CLAUDE.md`

## Report

เพิ่มจาก master หนึ่งบรรทัด: `homes touched:` ระบุว่ารอบนี้เขียนลงบ้านไหนบ้างนอก `SESSION-HANDOFF.md`
เพื่อให้เห็นว่า routing ทำงานจริงหรือทุกอย่างกองอยู่ในสถานะเหมือนเดิม
