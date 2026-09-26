# gh#101 / gh#103 — nuea-khu rebuild, evidence 2026-09-26

Commit `788f0b9` (rebuild) on top of `ad5cd7c` (copy sign-off). Local build on one developer machine.

## Gates

- `bash scripts/run-workflow-gates.sh` → `declared=48 executed=46 failed=0 not-executed=0 not-runnable-here=2`,
  `LOCAL GATES PASSED`, exit 0. It includes the browser probes against the built artifact (626s),
  where love-match now appears in the no-nav walk, leave-confirm and control-floor.
- Run on the tree before one comment-only amend to `scripts/bundle-freeze-check.mjs`. After the amend,
  `thai-comments`, `added-lineno-citation-check` and `bundle-freeze-check` were re-run, each exit 0.

## Bundle freeze — re-pinned by owner ruling (chat, 2026-09-26)

Measured on this build: 1,105,063 bytes, against the old pin 1,049,872 (+5.26%, over the +5% band).
Re-pinned to 1,105,063. Attribution is in the pin's own comment: 1,092,277 is the prior session's
recorded figure, not re-measured here.

## Criterion 4 — nothing entered is stored or in the URL (real browser)

The built `dist/` was served locally and the page driven once in the in-app browser. Storage was
cleared, then: reader `ผู้หญิง`, band `50 ขึ้นไป`, wanted gender left at its default, `เปิดดูเนื้อคู่`.
Result: card M13 (age 47, inside the 45+ open-band pool), portrait `IMG_01_018.webp` loaded at 400 px,
age line `อีกประมาณ 3 ปีจากนี้`. After the draw, `localStorage` and `sessionStorage` had no keys and
the URL was unchanged.

**Not browser-driven:** the twenty-percent self branch. It is covered by the unit tests with an
injected `rand` (`src/games/love-match.test.mjs`), not by a real-browser draw.

## Portraits (gh#103 boxes 4 and 6)

- `public/art/nuea-khu/`: 40 WebP files at 400×400, 615,482 bytes in total, the largest 23,334 B.
  Measured here with `cat … | wc -c` and `ls -l`.
- Every published file is referenced by exactly one card. The unit test asserts it, and the
  `public-orphan` gate is green.
- What one reader downloads for one result (agent-measured, not re-measured here): page 11,981, JS
  39,193 (11 chunks), CSS 9,516, plus one portrait averaging 15,387. That is about 76 KB raw, or about
  35 KB gzipped, fonts excluded.

## gh#104 enumeration after registration — owner ruling (chat, 2026-09-26)

`node docs/verification/evidence/104-2026-09-23/enumerate.mjs` exits 0. Prediction slot 32 and
directive slot 0, both unchanged from 2026-09-23. FLAGGED rose from 39 to 73. The 34 new rows are
all love-match, listed in `enumerate-love-match-flags.tsv`. They are character-card descriptions
(`พูดน้อย`, `คุยกับทุกคนที่เจอ`, `เพื่อนบ้าน`), the step `บอกว่าคุณเป็น…` (answered on screen), and
`ดวงบอกให้…` (the fortune is the speaker). **Ruled false positives by the owner.** None of them tells
the reader to gather a group, pass a phone, or read anything aloud.
