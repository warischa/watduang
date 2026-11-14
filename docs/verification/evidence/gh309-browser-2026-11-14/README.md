# gh#309 browser measure, 2026-11-14 (phone result screens, projector code card)

Build: the rebuilt repo `dist/` (not rebuilt here), served on two ports so the projector and the phones have separate origins and separate
storage (A: setup page and projector; B: phones). Chrome 157, `--headless=new --use-angle=metal --enable-gpu`, `mobile:false`, `innerWidth`
read equal to the requested width in every shot. No backend runs: the join API is STUBBED through CDP `Fetch` (every `*/api/draw/*` request
is fulfilled by the harness from the protocol doc's Contract table: `POST events` 201, `GET names` list, `POST start` roster, phone
`POST join` 201 with the id the scenario chose, `GET status/<id>` `started` with `member` true or false, 503 for the provisional case).
One fake event: 16 names, 3 prizes, schedule 16 / 8 / 7 / 6 / 5 (the QR mode setup page was driven with real taps: open QR, the stubbed list of 16
filled, prizes, start). Round 1 is the cards game (needs an exact half, which is why 16 names rather than 12). The projector walked every
step through the MC's own buttons; each phone then joined as a roster member (id and name from the same roster) and typed the codes the
projector showed. Probes: `probe/*.txt`. Raw numbers: `walk309.json`, `phones309.json`, `result309.json`.

Event drawn: round 1 (cards, rule index 1) kept 8, then 7, 6, 5; final order Fah, Tae, Oak, ใบเตย, ฝน ก.; prizes 3. Codes shown:
round 1 `4671 9292 2925`, round 2 `687 869 266`, round 3 `464 659 992`, round 4 `633 319 256`, final `0057 238`.

## Row 1: phone screens (each at 320 and 375; scroll = requested width, boxes past the viewport 0, smallest text 16px on every screen)

| Screen | How reached | 320 / 375 | Tap targets | Shot |
|---|---|---|---|---|
| code entry | member, status `started` | 320 = 320 / 375 = 375 | code field 288 x 64 (343 x 64), button 288 x 52 (343 x 52) | `row1-codeEntry-<w>` |
| wrong code | `111111111` typed | same; the error row `รหัสนี้ไม่ใช่ของรอบที่ 1 ...` shown, field outlined | same, field 64, button 52 | `row1-wrongCode-<w>` |
| card, before the rule | round 1 code typed | same | the two rule buttons 288 x 52 (343 x 52) | `row1-card-<w>` |
| in + next code form | survivor, the drawn rule tapped (button 2) | same; badge, `ผ่านรอบที่ 1`, name card, next form | field 64, button 52 | `row1-in-<w>` |
| out | non-survivor, drawn rule tapped | same; `รอบที่ 1 ไม่ผ่าน` | no control on the screen | `row1-out-<w>` |
| provisional | status answers 503 (no answer) | same; passes, with the note `ยังไม่ยืนยันชื่อ ผลจริงดูที่จอใหญ่` | field 64, button 52 | `row1-provisional-<w>` |
| removed | status `started`, `member:false` | same; `ผู้จัดนำชื่อนี้ออกจากรายชื่อแล้ว` | none | `row1-removed-<w>` |
| claim, place 1 / 2 / 3 | finalist 1 / 2 / 3, all codes typed | same; `คุณได้รางวัล`, `รางวัลที่ N`, name, claim note | none | `row1-slot0-<w>` (all widths), `row1-slot1-320`, `row1-slot2-320` |
| place 4 and 5 (3 prizes) | finalist 4 / 5 | same; `รอบชิง ไม่ผ่าน` out frame, no prize | none | `row1-slot3-<w>`, `row1-slot4-<w>` |

Result: **PASS**, 22 screens (7 states plus places 1, 4 and 5 at both widths, places 2 and 3 at 320 only), every one `scrollWidth == innerWidth == requested`, 0 painted boxes outside
the viewport (sr-only nodes excluded), smallest computed text 16px, every control at least 52px tall (the 44px floor). Places 4 and 5 read
the out frame, not a prize, at both widths.

## Row 2: no call at reveal: PASS

Place-1 finalist, 320 and 375. Requests before the cut: `POST .../join`, `GET .../status/<id>` (2 in all). Then the network was cut
(`Fetch` pausing every request and failing it) and the phone played all four round codes, the card rule tap and the final code to the claim screen:
**0 requests attempted** after the cut (the cut log is empty, the API log did not grow), and the claim screen came up. Positive control
(`probe/cutctl.mjs.txt`): with the same cut, a page `fetch` of the status route is paused and failed, so the log does record an attempt
(`rejected Failed to fetch`, 1 cut-log entry).

## Row 3: claim name equals the winner on the projector: PASS

Projector result (code card closed with `ตกลง`) at 1920 and 320: places 1, 2, 3 = `Fah`, `Tae`, `Oak`, prizes `ทีวี`, `พัดลม`, `บัตรกำนัล`, claim line
`ผู้ได้รางวัล เปิดหน้าผลในมือถือให้ทีมงานดู ชื่อต้องตรงกับบนจอนี้`. Phone claim screens read `Fah` (place 1, 320 and 375), `Tae` (place 2), `Oak` (place 3):
equal for every place. Shots: `row3-projector-result-1920`, `row3-projector-result-320`, `row1-slot0-320`, `row1-slot1-320`, `row1-slot2-320`.

## Row 4: projector code card against frame 4 of `design/Gh305AuditFrames.dc.html`: PASS

Measured on the live projector (page reloaded at each width, card open): a card deal (round 1, 12 digits), cut reveals (rounds 2, 3, 4), the final (7 digits).

| Value (frame 4 VALUES table) | Frame | 1920 | 320 |
|---|---|---|---|
| label | 600 44px Mitr #d9d6f0 / 22px | 44px, rgb(217,214,240) | 22px |
| digits | 180px (12 digits 150px) #ffcc00 / 32px (12 digits 26px) | 9-digit and 7-digit 180px, 12-digit 150px, rgb(255,204,0) | 32px, 12-digit 26px |
| hint | 34px / 18px | 34px | 18px |
| earlier label, round label, code | 30 / 30 / 44px, letter-spacing 2px / 18 / 16 / 18px, 1px | 30 / 30 / 44px, 2px | 18 / 16 / 18px, 1px |
| card box | centred card / left 16, right 16, top 16 under the band | x 249..1671 (frame 210..1710 at scale 0.948) | x 16..304, top 72 (56 band + 16) |

- Round code shown, grouped 4-4-4 (12 digits), 3-3-3 (9 digits), 4-3 (final `0057 238`).
- Earlier codes under the label `รหัสรอบก่อนหน้า`: round 1 card 0 earlier, round 2 card 1, round 3 card 2, round 4 card 3, final card 4 (`รอบที่ 1 4671 9292 2925`, `รอบที่ 2 687 869 266`, `รอบที่ 3 464 659 992`, `รอบที่ 4 633 319 256`).
- Overflow: at 1920 and 320, every card, scrollWidth = requested width and 0 boxes past the viewport.
- The MC's `ตกลง` (disabled until armed, then enabled) closes the card: the next screen shows the step's own button (`รอบต่อไป` / `เปิดผล`) and, on the final, the result with the card gone (`code:false`).
- Shots: `row4-c1-<w>` deal, `row4-c2..c4-<w>` cut reveals, `row4-c5-<w>` final.

Thai: opened `row1-card-320`, `row1-slot0-320`, `row1-provisional-320`, `row1-wrongCode-320`, `row1-slot4-320`, `row4-c5-320`, `row3-projector-result-1920`: no dotted circles.
Not covered: a real backend (the answers are the harness's reading of the Contract table), real phones, the 3D deal and reveal frames of the cards round, the 12-name case from the brief (16 used).
