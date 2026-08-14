# /save-session — override ของ watduang

master คือ `~/.claude/commands/save-session.md` · ทุกอย่างที่ไฟล์นี้ไม่ได้ประกาศ ใช้ของ master
ไฟล์นี้มีเฉพาะสิ่งที่ repo นี้ต่างจาก master หรือที่ master บอกให้ project ประกาศเอง

## Window · entry format · archive

- window **N=1**
- entry header เป็น **h3** `### S<YYYY-MM-DD>#<n>` ไม่ใช่ h2
  → `~/.claude/scripts/roll-state-window.sh` รับแต่ `^## S` มันจะ ABORT เสมอบน repo นี้
  **นี่ไม่ใช่ format drift** เป็นรูปแบบที่ประกาศไว้ ให้ตกไป manual sed move แล้วยืนยัน 3 assert
  (บล็อกไปโผล่ในอาร์ไคฟ์แบบ verbatim · source เหลือ 0 copy · archive มี 1 copy)
- archive: `docs/sessions-archive.md` newest-first append-only · resume ไม่อ่านไฟล์นี้

## Budgets

ใช้ค่า master (state 3KB · file 12KB) **ห้ามขยายเพดานเพื่อให้ ratchet gate ผ่าน**
state เคยตึงถึง 98.8% มาแล้ว ทางแก้คือย้ายของออกตามตารางข้างล่าง ไม่ใช่บีบคำให้สั้นลง
และไม่ใช่ตั้งตัวเลขใหม่

## ของแต่ละอย่างอยู่บ้านไหน

| ข้อมูล | บ้าน | เหลืออะไรไว้ใน `CLAUDE.md` |
|---|---|---|
| เหตุผลของการตัดสินใจ | `docs/adr/NNNN-*.md` | เลข ADR เท่านั้น |
| คำศัพท์โดเมน | `CONTEXT.md` | ไม่มีเลย |
| gotcha ที่จริงข้ามเซสชัน | `docs/runbook.md` | trigger 1 บรรทัด (อาการ + เงื่อนไข + ตัวชี้) |
| สเปก · ตั๋ว · เหตุผลระดับผลิตภัณฑ์ | GitHub issues | เลขใบ |
| วิธีทำงานกับ tracker · label · domain | `docs/agents/*.md` | pointer 1 บรรทัด |
| สถานะสด + คิวถัดไป | `CLAUDE.md` § Current state | ทั้งหมด — นี่คือบ้านมัน |
| entry เก่า | `docs/sessions-archive.md` | ไม่มี |

## ห้ามอยู่ใน CLAUDE.md

- **เหตุผล** — มี `docs/adr/` แล้ว ที่นี่อ้างเลข
- **ประวัติการแก้มติ** — saga อยู่ใน ADR หรืออาร์ไคฟ์ การแก้ทับ **แทนที่** ข้อความเดิม ไม่ต่อท้าย
- **ตัวเลขที่นับได้จาก `gh`** เช่นจำนวน issue หรือจำนวน sub-issue — มันเน่าเงียบและไม่มีใครไปแก้
  (เคยเขียนว่า "sub-issue 11 ใบ" ค้างไว้จนกลายเป็น 18)
- **อะไรก็ตามที่ซ้ำกับ § Current state** รวมถึงบรรทัดสถานะบนหัวไฟล์

## Report

เพิ่มจาก master หนึ่งบรรทัด: `homes touched:` ระบุว่ารอบนี้เขียนลงบ้านไหนบ้างนอก `CLAUDE.md`
เพื่อให้เห็นว่า routing ทำงานจริงหรือทุกอย่างกองอยู่ใน state เหมือนเดิม
