# Red-green DoD claims on #15–#18 — non-vacuity proof

## Provenance disclosure (applies to every claim below)

The literal claim on each box ("test failed first, then made to pass") is read literally about
git history. It is false for all four boxes: in this repo the source fix and its guarding test
were added in the **same commit** (`24fe2c8` for wheel, `94505f6` for draw/team/number). There is
no commit in history where any of these four named tests is red. So the literal, git-history
reading of the claim cannot be ticked as written for any of the four.

What is provable — and is proved below — is the reworded invariant from
`docs/adr/0007-party-size-rule-constrains-the-set-not-the-location.md` (~L50-52): *this test would
fail if the fix it guards were absent.* For each claim, the fix's source hunk was hand-reverted to
its pre-fix shape (not `git revert` — these are single-commit files, so there is no separate parent
commit to revert to), the test command re-run, and the hunk restored. Every restore was confirmed
byte-identical via `git diff --stat` before moving to the next claim.

## #15-14 (issue #15, วงล้อสุ่ม /tool/wheel/)

> เทสถูกพิสูจน์แบบสองทาง — ทำให้ตกก่อนแล้วยืนยันว่าตกด้วยเหตุผลที่ถูก แล้วค่อยทำให้ผ่าน

- Fix commit: `24fe2c8` (feat: เครื่องมือ 1 วงล้อสุ่ม /tool/wheel/ + โครงหน้าเครื่องมือ (#15))
- Guarded file: `src/tools/wheel.ts`
- Guarding tests: `src/tools/wheel.test.mjs`

The box names no single mechanism, so two candidate hunks in `pickName` were checked separately.

**Hunk A — the clamp** (`const index = Math.min(names.length - 1, Math.floor(random() * names.length));`,
reverted to `Math.floor(random() * names.length)`):

- Result: all 6 tests in `wheel.test.mjs` still pass — including
  `random เกือบ 1 ได้ชื่อสุดท้าย ไม่หลุดขอบท้ายลิสต์ (ขอบบน)`, which uses `() => 0.999999`, not
  `() => 1`. `grep -rn "() => 1" src/tools/*.test.mjs` (across wheel/draw/number, which all carry
  the identical clamp+comment) returns no match — no test in the suite injects an exact `1`, the
  only value the clamp guards against.
- Verdict for this hunk: **VACUOUS**. This is a cross-cutting gap, not specific to wheel: the same
  untested clamp exists verbatim in `src/tools/draw.ts:20` and `src/tools/number.ts:38`.

**Hunk B — the `MIN_NAMES` guard** (`if (names.length < MIN_NAMES) throw ...`, removed):

- Result: `ลิสต์ว่างพัง ด้วยเหตุผลภาษาไทยที่อ่านได้ ไม่ใช่คืนค่าว่างเงียบๆ` and
  `ลิสต์มีชื่อเดียวพัง ด้วยเหตุผลภาษาไทยที่อ่านได้ ไม่ใช่คืนค่าว่างเงียบๆ` both fail — `Math.min(-1, 0)`
  / `Math.min(0, 0)` no longer throw, they silently return `undefined` / a name, so `assert.throws`
  fails. Failure line: `not ok 5 - ลิสต์ว่างพัง...`, `not ok 6 - ลิสต์มีชื่อเดียวพัง...`.
- Verdict for this hunk: **NON-VACUOUS**.

**Box-level verdict: MIXED.** The box, read as "the tests in this file guard something", holds
for the `MIN_NAMES` guard but not for the clamp. Recorded here as its own finding rather than
folded into a single pass/fail: **the `() => 1` clamp is an untested defensive guard, shared by
`wheel.ts`, `draw.ts`, and `number.ts`.**

## #16-13 (issue #16, จับฉลาก /tool/draw/)

> ตรรกะการจั่วรับตัวสุ่มเข้าไปได้ มีเทสที่ตรวจผลจริง และถูกพิสูจน์แบบสองทาง — ทำให้ตกก่อนแล้วค่อยทำให้ผ่าน

- Fix commit: `94505f6` (feat: tools 2-4 — จับฉลาก /tool/draw/ · แบ่งทีม /tool/team/ · สุ่มเลข /tool/number/)
- Guarded file: `src/tools/draw.ts`
- Hunk reverted: removed `box.splice(index, 1);` (the line that drops a drawn name from the box so
  one round can never hand out the same name twice), keeping the `push` above it.
- Guarding test: `ผลจับฉลากไม่มีชื่อซ้ำกันเองในรอบเดียว`
- Result: fails — `expected: 3, actual: 1` on `assert.equal(new Set(result).size, result.length)`
  in a different test (`เริ่มรอบใหม่ (เรียกด้วยกล่องเต็ม) คืนสิทธิ์จับได้ครบทุกคนอีกครั้ง`), plus
  `not ok 2 - ผลจับฉลากไม่มีชื่อซ้ำกันเองในรอบเดียว` directly. 2 of 9 tests failed, 7 passed.
- Verdict: **NON-VACUOUS**

## #17-14 (issue #17, แบ่งทีม /tool/team/)

> ตรรกะการแบ่งรับตัวสุ่มเข้าไปได้ มีเทสที่ยืนยันว่าไม่มีใครหายและขนาดทีมต่างกันไม่เกินหนึ่ง และถูกพิสูจน์แบบสองทาง

- Fix commit: `94505f6` (feat: tools 2-4 — จับฉลาก /tool/draw/ · แบ่งทีม /tool/team/ · สุ่มเลข /tool/number/)
- Guarded file: `src/tools/team.ts`
- Two properties are named in the box text; each was checked with its own targeted revert of a
  hand-constructed pre-fix shape (no separate parent commit exists to `git revert` to).

**Property 1 — "ขนาดทีมต่างกันไม่เกินหนึ่ง" (size balance):** reverted the round-robin deal
(`teams[index % teamCount]!.push(name)`) to a naive consecutive-chunk split
(`teams[Math.floor(index / Math.ceil(shuffled.length / teamCount))]!.push(name)`).
- Result: `หารไม่ลงตัว: ขนาดทีมต่างกันไม่เกิน 1 คน` fails (`not ok 3`); 8 of 9 tests still pass,
  including `ทุกคนต้องอยู่ในผลลัพธ์ครบพอดี ไม่หาย ไม่ซ้ำ` — chunking loses nobody, so that property
  alone doesn't discriminate this hunk.
- Verdict: **NON-VACUOUS**

**Property 2 — "ไม่มีใครหาย" (nobody missing):** reverted the deal to drop the last shuffled name
(`shuffled.slice(0, shuffled.length - 1).forEach(...)` in place of `shuffled.forEach(...)`).
- Result: `ทุกคนต้องอยู่ในผลลัพธ์ครบพอดี ไม่หาย ไม่ซ้ำ` fails (`not ok 1`), and
  `หารไม่ลงตัว: ขนาดทีมต่างกันไม่เกิน 1 คน` fails too (`not ok 3`); 7 of 9 pass.
- Verdict: **NON-VACUOUS**

**Box-level verdict: NON-VACUOUS** — both named properties independently discriminate a broken
implementation from the shipped one.

## #18-12 (issue #18, สุ่มเลข /tool/number/)

> ตรรกะการสุ่มเลขรับตัวสุ่มเข้าไปได้ มีเทสครอบโหมดไม่ซ้ำจนหมดช่วง และถูกพิสูจน์แบบสองทาง

- Fix commit: `94505f6` (feat: tools 2-4 — จับฉลาก /tool/draw/ · แบ่งทีม /tool/team/ · สุ่มเลข /tool/number/)
- Guarded file: `src/tools/number.ts`
- Hunk reverted: removed the `if (candidates.length === 0) throw ...` exhaustion guard.
- Guarding test: `โหมดห้ามซ้ำ: ครั้งที่ 6 หลังครบช่วงแล้วต้องพังพร้อมเหตุผล ไม่ใช่คืนค่าว่างหรือวนลูป`
- Result: fails (`not ok 5`) — `assert.throws` finds nothing thrown once the guard is gone;
  8 of 9 tests still pass.
- Verdict: **NON-VACUOUS**

## Summary table

| Box | Test | Verdict |
|---|---|---|
| #15-14 | `MIN_NAMES` guard tests (empty/single-name) | NON-VACUOUS |
| #15-14 | random-exactly-1 clamp (untested by any test in the suite) | VACUOUS (cross-cutting gap: also present untested in `draw.ts`, `number.ts`) |
| #16-13 | `ผลจับฉลากไม่มีชื่อซ้ำกันเองในรอบเดียว` | NON-VACUOUS |
| #17-14 | `หารไม่ลงตัว: ขนาดทีมต่างกันไม่เกิน 1 คน` | NON-VACUOUS |
| #17-14 | `ทุกคนต้องอยู่ในผลลัพธ์ครบพอดี ไม่หาย ไม่ซ้ำ` | NON-VACUOUS |
| #18-12 | `โหมดห้ามซ้ำ: ครั้งที่ 6 หลังครบช่วงแล้วต้องพังพร้อมเหตุผล ไม่ใช่คืนค่าว่างหรือวนลูป` | NON-VACUOUS |

All reverts were restored after observation; the full suite reads 72 passing / 0 failing at rest.
