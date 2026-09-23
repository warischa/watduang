# gh#104 box 2 — the 2026-09-23 refresh of the group-directed-copy enumeration

Measured 2026-09-23 against the working tree at `849683b` plus the untracked evidence directory this
file lives in. **Read-only: no repo file outside this directory was changed, no build was run, no
tracker comment was posted.** This is the 2026-09-23 re-run of the 2026-09-09 instrument; the 09-09
original and its report stay the record of that day, outside the repo. The question this refresh
answers: which reader-reachable strings on the fortune (ดูดวง) surfaces still tell the reader to
gather a group, pass the phone, or read aloud to anyone — and therefore whether gh#104 item 1 (the
deck rewrite) is still owed, or was absorbed when gh#97 and gh#98 rebuilt the deck.

## Reproduce

```
node docs/verification/evidence/104-2026-09-23/enumerate.mjs            # counts + calibration
node docs/verification/evidence/104-2026-09-23/enumerate.mjs --flagged  # the work list below, as TSV
node docs/verification/evidence/104-2026-09-23/enumerate.mjs --rows     # every examined string
node docs/verification/evidence/104-2026-09-23/enumerate.mjs --extra    # borderline + เกม-noun hits
```

Exits non-zero if its own calibration fails, if `make-og.mjs` stops taking its card text from
`og-card-text.mjs` (which would blind layer 6), or if any of the three OG PNGs changes hash (which
voids the transcribed pixel layer). The script reads the repo by absolute path and writes nothing.

## How the ดูดวง set is derived (as the script prints it, never a hand list)

- **Games:** the runtime `games` array of the games manifest module, filtered on
  `category === 'fortune'` -> `siamsi [1,1] | daily-fortune [1,1]`. `love-match.ts` is on disk but
  NOT in the runtime manifest, so its copy reaches no reader and stays out (unchanged from 09-09).
- **Category surface:** the runtime `categories.fortune` record of the categories module.
- **Deck content:** imported, not greped. Every exported runtime value of each fortune module is
  deep-walked. Since gh#98 the siamsi deck lives in a data module the game module re-exports, so
  this refresh adds one derivation step: every module a fortune game re-exports from is walked too,
  deduped against what the game module's own namespace already yielded. Without it the deck's
  reader-visible chip and row labels (`ASPECT_LABEL`, `INTENT_LABEL` of the deck module) would
  silently leave the set — they are not in the game module's namespace. The literal-presence
  cross-check now spans the game module and its re-exported data modules for the same reason, and
  prints `0 of them absent ... as a literal` for both games, so the decks remain plain literals.
- **Templates:** the same twelve `.astro` files as 09-09 (all still present): the two game routes'
  layout/shell/nav/chrome chain as tiers A+B, the setup panel and the home hub as tier C.
- **Render verdicts:** every shared-template string carries `yes` / `dom-hidden` / `unreachable` /
  `no`, re-resolved against the current tree: the pass-phone panel still ships `hidden` on every
  game page with no fortune module opening it; the roster pill still ships `hidden` and
  `showRosterCount` still has no reachable caller on a `[1, 1]` page (the seed call is behind the
  solo guard, the other caller serves the setup panel's start event, and the panel never mounts on
  a fortune page); the group-carry-on heading still passes only when the category declares
  `carriesGroup`, which fortune does not.
- **OG:** two layers as before — what the generator stamps today, now obtained by calling
  `cardLines` from the OG text module (the generator and the OG gate both import it), and what the
  three PNGs actually show, re-opened and re-transcribed by eye on 2026-09-23 and pinned by the new
  sha256 hashes. On this tree the two layers AGREE for all three cards; on 09-09 they disagreed.

## Numbers (printed by the command, never counted by hand)

```
=== gh#104 box 2 - ดูดวง (fortune) surface enumeration ===
fortune games, runtime manifest filtered on category === 'fortune': siamsi [1,1] | daily-fortune [1,1]
game modules on disk but NOT in the runtime manifest (not shipped, out of scope): love-match.ts
siamsi: 303 exported runtime strings, 0 of them absent from the module and its re-exported data modules as a literal
daily-fortune: 15 exported runtime strings, 0 of them absent from the module and its re-exported data modules as a literal

EXAMINED (unique Thai-bearing strings reachable on a ดูดวง surface, tiers A+B): 440
FLAGGED (gather a group / pass a phone / read aloud): 39
  by condition: group=25 phone=2 aloud=14
  by layer: runtime=34 static-read=5 og-generator=0 pixel-read=0
  by slot: directive=0 prediction=32 meta=0 other=7
  by render verdict: yes=35 dom-hidden=2 unreachable=1 no=1
BORDERLINE (implies a shared device, instructs nothing - owner call, NOT counted in M): 3
BOX 5 (a fortune surface using the noun เกม - separate rule, NOT counted in M): 1

tier C, checked and NOT counted: 44 strings across 2 surfaces; of those, 7 would flag if they reached a ดูดวง reader
```

Per surface (examined / flagged), as printed: the siamsi deck surface carries 303 / 32; the game
layout 4 / 2; the pass-phone panel 1 / 1; the game template and page script 2 / 1; the game nav on a
fortune page 18 / 2; the page chrome of the /c/fortune/ listing page 4 / 1; every other surface,
including all three OG surfaces in both layers, 0 flagged.

### 09-09 against now

| set | 2026-09-09 | 2026-09-23 | why it moved |
|---|---|---|---|
| EXAMINED | 214 | 440 | the rebuilt deck is 28 slips of ten string fields each, against 24 slips of two fields; the re-export walk adds the deck's labels |
| FLAGGED | 50 | 39 | see the rows below |
| condition group / phone / aloud | 39 / 4 / 30 | 25 / 2 / 14 | the 23 instruction prompts are gone; the OG phone-passing lines are gone; the recruit register (ชวน / ใครสักคน / คนใกล้ตัว) was added to the group vocabulary on the REFUTE review, which is what raises group against 09-09's smaller deck |
| layer runtime / static-read / og-generator / pixel-read | 35 / 5 / 4 / 6 | 27 / 5 / 0 / 0 | gh#104 item 2 regenerated all three cards; generator and pixels now agree and neither flags |
| slot directive / prediction / meta / other | 23 / 10 / 0 / 17 | 0 / 32 / 0 / 7 | the rebuilt deck has no instruction slot at all; every deck flag now sits in a prediction field |
| render yes / dom-hidden / unreachable / no | 46 / 2 / 1 / 1 | 35 / 2 / 1 / 1 | the four non-rendering chrome strings are unchanged; nothing new went dark |
| BORDERLINE | 6 | 3 | two `เครื่องเดียว` seo titles dropped the phrase when gh#97/gh#99 rewrote them |
| BOX 5 (noun เกม on a fortune surface) | 3 | 1 | the site OG tagline and the shipped siamsi card no longer say เกม; only the non-rendering layout heading does |
| siamsi deck flagged | 33 (23 prompt + 10 text) | 32 (all prediction fields) | the prompt class vanished; the prediction class grew with the deck and with the recruit vocabulary |

## Work list — the 39 flagged strings

### 1. The siamsi deck, prediction fields (32 rows)

Every row renders (`yes`): the slip prints these strings to the single reader. The rows fall into
three registers, listed and not judged: fortunes that mention other people or speech as an event
(คนอื่น, เพื่อน, คนรอบตัว, พูด, เล่า, ประกาศ); generic urging (ช่วยกัน, ด้วยกัน); and — visible only
since the recruit vocabulary was added on the REFUTE review — lines that invite the reader to fetch
or involve another person (ชวน, ใครสักคน, คนใกล้ตัว), the register of `SLIPS[23].readings.health` and
`SLIPS[23].verse[1]`. Three rows are vocabulary matches on a term used in another sense:
`SLIPS[5].verse[3]` uses ส่งต่อ for passing on kindness, not a phone; `SLIPS[21].readings.work` uses
อ่านให้ครบ in the sense of reading thoroughly, not reading aloud to someone; `SLIPS[12].readings.money`
names คำชวน as the thing to be wary of, not as an invitation to follow. One string the REFUTE review
expected to flag stays clean: `SLIPS[18].readings.love` — ไม่มีเวลาให้คนใกล้ตัวมาหลายวันแล้ว
แบ่งมาสักช่วงเย็น — because its คนใกล้ตัว sits inside a negated clause, and the calibrated negation
rule blanks negated clauses before matching, the same rule that keeps `categories.fortune.hubBody`
clean; its second clause names no person. Widening the negation window to reach it would red the
hubBody leg, so it is reported here instead. All rows are reported, not filtered: this instrument
is a recall query over an owner-owned vocabulary, and the 09-09 stoplist is kept exactly as
calibrated.

| durable symbol | Thai string (verbatim, not translated) | condition | matched term | renders |
|---|---|---|---|---|
| `siamsi.ts -> SLIPS[0].readings.love` | คนรอบตัวเปิดใจกับคุณมากขึ้น พูดตรงๆ ได้เลยในช่วงนี้ | group + aloud | คนรอบตัว, พูด/เล่า/ประกาศ/เอ่ยชื่อ | yes |
| `siamsi.ts -> SLIPS[1].readings.love` | ความสัมพันธ์นิ่งๆ ไม่ได้แปลว่าจืด ลองชวนคุยให้บ่อยขึ้น | group | ชวน/ใครสักคน/คนใกล้ตัว (recruit a person) | yes |
| `siamsi.ts -> SLIPS[2].readings.work` | สิ่งที่ลงแรงไว้เริ่มมีคนเห็น พูดเสนอได้ในช่วงนี้ | aloud | พูด/เล่า/ประกาศ/เอ่ยชื่อ | yes |
| `siamsi.ts -> SLIPS[3].readings.love` | คำพูดช่วงนี้ออกไปแรงกว่าที่ตั้งใจ หายใจลึกก่อนตอบ | aloud | พูด/เล่า/ประกาศ/เอ่ยชื่อ | yes |
| `siamsi.ts -> SLIPS[5].verse[3]` | รับไว้แล้วอย่าลืม วันหนึ่งได้ส่งต่อ | phone | ส่งเครื่อง/ส่งมือถือ/ส่งต่อ | yes |
| `siamsi.ts -> SLIPS[5].readings.love` | คนใกล้ตัวกำลังใจดีกับคุณเป็นพิเศษ ตอบกลับไปบ้าง | group | ชวน/ใครสักคน/คนใกล้ตัว (recruit a person) | yes |
| `siamsi.ts -> SLIPS[6].readings.love` | ความน้อยใจเล็กๆ ที่ไม่พูด กำลังโตขึ้นทุกวัน พูดเสียตอนยังเล็ก | aloud | พูด/เล่า/ประกาศ/เอ่ยชื่อ | yes |
| `siamsi.ts -> SLIPS[8].readings.love` | คนเก่าหรือเพื่อนเก่าจะกลับมาทัก คุยดีๆ ไม่ต้องรีบสรุป | group | เพื่อน | yes |
| `siamsi.ts -> SLIPS[9].readings.work` | อย่ารับปากแทนคนอื่น ช่วงนี้ความรับผิดชอบจะย้อนกลับมาที่คุณ | group | คนอื่น | yes |
| `siamsi.ts -> SLIPS[9].readings.money` | เรื่องเงินกับคนสนิทให้พูดให้ชัดตั้งแต่ต้น จะได้ไม่เสียใจกันทีหลัง | aloud | พูด/เล่า/ประกาศ/เอ่ยชื่อ | yes |
| `siamsi.ts -> SLIPS[9].readings.love` | อย่าเอาเรื่องของคนอื่นมาเป็นเรื่องของเรา ระยะห่างพอดีทำให้ไปกันได้ยาว | group | คนอื่น | yes |
| `siamsi.ts -> SLIPS[11].verse[1]` | สิ่งที่เคยเข้าใจผิด วันนี้พูดกันรู้เรื่อง | aloud | พูด/เล่า/ประกาศ/เอ่ยชื่อ | yes |
| `siamsi.ts -> SLIPS[11].readings.love` | พูดก่อนได้เปรียบ อีกฝ่ายรออยู่นานกว่าที่คิด | aloud | พูด/เล่า/ประกาศ/เอ่ยชื่อ | yes |
| `siamsi.ts -> SLIPS[12].readings.money` | อย่ารีบตัดสินใจเรื่องเงินตามคำชวน ขอเวลาคิดสักคืน | group | ชวน/ใครสักคน/คนใกล้ตัว (recruit a person) | yes |
| `siamsi.ts -> SLIPS[12].readings.love` | คำพูดที่ได้ยินต่อกันมา อย่าเพิ่งเชื่อจนกว่าจะถามเจ้าตัว | aloud | พูด/เล่า/ประกาศ/เอ่ยชื่อ | yes |
| `siamsi.ts -> SLIPS[14].verse[3]` | รับไว้ด้วยใจนิ่ง แล้วแบ่งต่อให้คนอื่น | group | คนอื่น | yes |
| `siamsi.ts -> SLIPS[14].readings.love` | คนที่ใช่อยู่ใกล้กว่าที่คิด เปิดตาดูคนรอบตัวอีกครั้ง | group | คนรอบตัว | yes |
| `siamsi.ts -> SLIPS[14].closing` | วันที่ทุกอย่างเข้าทาง คือวันที่ควรเผื่อแผ่ให้คนอื่นด้วย | group | คนอื่น | yes |
| `siamsi.ts -> SLIPS[15].readings.work` | แผนที่เพิ่งคิดได้ ยังไม่ถึงเวลาประกาศ ทำให้เห็นก่อนค่อยพูด | aloud | พูด/เล่า/ประกาศ/เอ่ยชื่อ | yes |
| `siamsi.ts -> SLIPS[15].readings.love` | เรื่องของเราสองคน อย่าเพิ่งเอาไปเล่าให้คนนอกตัดสิน | aloud | พูด/เล่า/ประกาศ/เอ่ยชื่อ | yes |
| `siamsi.ts -> SLIPS[15].closing` | ดูแลไฟให้ติดดีเสียก่อน แล้วค่อยเปิดให้คนอื่นเห็น ไม่ต้องดับทิ้ง | group | คนอื่น | yes |
| `siamsi.ts -> SLIPS[20].verse[2]` | เก็บไว้กินให้พอ แบ่งให้เพื่อนบ้านบ้าง | group | เพื่อน | yes |
| `siamsi.ts -> SLIPS[21].readings.work` | งานที่ดูง่ายมีรายละเอียดซ่อนอยู่ อ่านให้ครบก่อนรับปาก | aloud | ให้…ฟัง/อ่านให้ | yes |
| `siamsi.ts -> SLIPS[22].readings.work` | มีเรื่องที่ต้องแจ้งใครสักคนค้างอยู่ บอกเสียวันนี้ | group | ชวน/ใครสักคน/คนใกล้ตัว (recruit a person) | yes |
| `siamsi.ts -> SLIPS[22].readings.love` | คำที่อยากพูดค้างไว้นาน พูดออกไปแล้วจะเบาขึ้น | aloud | พูด/เล่า/ประกาศ/เอ่ยชื่อ | yes |
| `siamsi.ts -> SLIPS[23].verse[0]` | มือสองข้างช่วยกัน ยกของที่หนักได้ | group | ช่วยกัน/ด้วยกัน | yes |
| `siamsi.ts -> SLIPS[23].verse[1]` | งานที่ทำคนเดียว ลองชวนใครสักคน | group | ชวน/ใครสักคน/คนใกล้ตัว (recruit a person) | yes |
| `siamsi.ts -> SLIPS[23].verse[3]` | เริ่มจากคำชวนสั้นๆ แล้วที่เหลือจะง่ายเอง | group | ชวน/ใครสักคน/คนใกล้ตัว (recruit a person) | yes |
| `siamsi.ts -> SLIPS[23].readings.love` | ช่วงนี้ทำอะไรด้วยกันดีกว่าต่างคนต่างทำ | group | ช่วยกัน/ด้วยกัน | yes |
| `siamsi.ts -> SLIPS[23].readings.health` | ชวนใครสักคนไปเดินด้วย จะทำได้ต่อเนื่องกว่าไปคนเดียว | group | ชวน/ใครสักคน/คนใกล้ตัว (recruit a person) | yes |
| `siamsi.ts -> SLIPS[25].readings.money` | อย่าให้เรื่องเล็กเรื่องเงินกลายเป็นเรื่องใหญ่ พูดกันตอนยังเล็ก | aloud | พูด/เล่า/ประกาศ/เอ่ยชื่อ | yes |
| `siamsi.ts -> SLIPS[27].readings.love` | อย่ารอให้ดวงตัดสินแทน เรื่องนี้ต้องคุยกันเอง | group | ช่วยกัน/ด้วยกัน | yes |

### 2. Shared template and chrome text on a fortune page (5 rows)

Unchanged as a set from 09-09, and unchanged in verdict: four of the five do not reach a fortune
reader's eye, and the fifth is the other category's name in static chrome — on the listing page
only, not on the game pages (see the last row's reason).

| durable symbol | Thai string (verbatim) | condition | renders | verdict reason |
|---|---|---|---|---|
| `[id].astro -> <script> showRosterCount()` | วง | group | unreachable | template head of the roster pill; no reachable caller on a `[1, 1]` page |
| `GameLayout.astro -> markup` | วง 6 คน | group | dom-hidden | the pill ships with the hidden attribute |
| `GameLayout.astro -> markup` | เล่นเกมต่อด้วยวงเดิม | group | no | passed to the nav only when the category declares carriesGroup; fortune declares false |
| `PassPhone.astro -> markup` | ส่งมือถือให้คนถัดไป | phone | dom-hidden | the panel ships hidden on every game page and no fortune module opens it |
| `PageChrome.astro -> frontmatter SITE_LINKS` | สุ่มคนโดน | group | yes | the party category's nav label in static chrome. PageChrome is mounted by the /c/fortune/ listing page and the home hub (tier C) only: GameLayout never mounts it and passes no `chrome` to Base, so the game pages get Base's brand-only footer. Surface label corrected on the REFUTE review; 09-09 claimed all three fortune surfaces |

### 3. Game nav on a fortune page — the other category's names (2 rows)

| durable symbol | Thai string (verbatim) | condition | renders |
|---|---|---|---|
| `GameNav.astro -> categories.party.label` | สุ่มคนโดน | group | yes |
| `GameNav.astro -> dice-loser.names.th` | เต๋าชี้คนแพ้ | group + aloud | yes |

Cross-navigation labels, not instructions to the fortune reader; reported so they are visibly
checked rather than silently dropped (same ruling as 09-09).

### 4. OG cards, both layers (0 rows — was 10 on 09-09)

The generator layer (`cardLines` of the OG text module) and the pixel layer (the three PNGs
re-opened on 2026-09-23) produce the same six Thai logical lines, and none of them flags:

| card | title line | tagline line (as transcribed from the pixels) |
|---|---|---|
| `public/og/site.png` | วัดดวง | ไม่ต้องโหลดแอป ไม่ต้องสมัคร |
| `public/og/siamsi.png` | เสี่ยงเซียมซี | เขย่ามือถือเสี่ยงเซียมซี เปิดดูใบทำนายของคุณ |
| `public/og/daily-fortune.png` | ดวงวันนี้ | กดครั้งเดียว รู้เลยว่าวันนี้จะเจอเรื่องจิ๊บจ๊อยอะไร อ่านขำๆ ไม่ต้องเชื่อ |

The taglines wrap across visual lines on the cards (two lines on siamsi, three on daily-fortune);
each transcription joins the visual lines at their wrap points and reproduces the manifest and
generator tagline byte for byte, which is the transcription's own cross-check. The old shipped
lines that flagged — the party tagline, the phone-passing instruction, the `2-10 คน` count and the
pre-rename siamsi title — are gone from the pixels. The player-count line now exists only on
party-category cards, so no fortune card and no site card carries a number at all.

## Not counted in the 32

**Borderline — implies a shared device, instructs nothing (3):** `categories.fortune.intro` —
รวมคำทำนายดูดวงฟรีบนมือถือเครื่องเดียว เสี่ยงเซียมซี หรือเปิดดวงประจำวัน ไม่ต้องโหลดแอป ไม่ต้องสมัคร ·
`daily-fortune.keywords[4]` — ดูดวงบนเครื่องเดียว · `[category].astro -> markup` — มือถือเครื่องเดียว.

**Box 5 — the noun เกม on a fortune surface (1):** `GameLayout.astro -> markup` —
เล่นเกมต่อด้วยวงเดิม, verdict `no` (it never renders on a fortune page). The category manifest's
fortune fields and both OG taglines are now free of the noun.

**Tier C — checked and excluded:** 44 strings across the setup panel and the home hub, 7 of which
would flag if they reached a ดูดวง reader; same set and same ruling as 09-09.

## Calibration — thirteen legs, all PASS

```
  PASS  clean       / categories.fortune.hubBody -> flagged=false {}
  PASS  clean       / categories.fortune.intro -> flagged=false {}
  PASS  clean       / siamsi SLIPS[0].verse[0] (a solo line: the sky, nobody in the room) -> flagged=false {}
  PASS  group+aloud / siamsi SLIPS[0].readings.love (คนรอบตัว + พูด, ช่วง in the tail stays blanked) -> flagged=true {"group":["คนรอบตัว"],"aloud":["พูด/เล่า/ประกาศ/เอ่ยชื่อ"]}
  PASS  group       / categories.party.intro (external positive control) -> flagged=true {"group":["วง (token-initial or group context)","เพื่อน","ใครโดน/ใครจ่าย"]}
  PASS  phone       / the retired 2026-08-28 fortune intro clause -> flagged=true {"group":["วง (token-initial or group context)"],"phone":["ส่งเครื่อง/ส่งมือถือ/ส่งต่อ","วนกัน/ผลัดกัน"]}
  PASS  must-red A: categories.fortune.hubBody under the NAIVE query -> flagged=true (a detector that never fires on this input would prove nothing)
  PASS  must-red B: categories.fortune.intro under the NAIVE query -> flagged=true
  PASS  borderline control: categories.fortune.intro carries ["เครื่องเดียว (one shared phone - implies sharing, instructs nothing)"] - reported, not counted in M
  PASS  must-red C / SLIPS-shaped fixture carrying อ่านให้วงฟัง through the walker -> flagged=true {"group":["วง (token-initial or group context)"],"aloud":["ให้…ฟัง/อ่านให้"]} (ให้วง survives the stoplist: trap 1b on the deck shape)
  PASS  clean D / SLIPS-shaped fixture carrying ในช่วงนี้ through the walker -> flagged=false {}, naive=true (ช่วง blanked; the naive query still fires, so clean is a verdict, not silence)
  PASS  must-red E / SLIPS-shaped fixture carrying ชวนใครสักคนไปเดินด้วย through the walker -> flagged=true {"group":["ชวน/ใครสักคน/คนใกล้ตัว (recruit a person)"]} (recruit-a-person imperative: the vocabulary gap the REFUTE review found)
  PASS  walker seam / an in-memory slip yields all ten string fields in deck order -> 10 strings
  overall: PASS
```

The two 09-09 deck fixtures pointed at `FORTUNES[].prompt`, which no longer exists; they are
repointed at real SLIPS strings playing the same roles, and three in-memory SLIPS-shaped fixtures
carry the Thai substring traps onto the new deck shape: อ่านให้วงฟัง must stay flagged (a stoplist
entry like the 09-09 ห้วง mistake would swallow ให้วง); ในช่วงนี้ must stay clean while still firing
under the naive query; and ชวนใครสักคนไปเดินด้วย — the counter-example of the REFUTE review's
vocabulary gap — must flag through the same walker the deck is enumerated by. The walker seam
asserts that one in-memory slip yields all ten of its string fields, so a walker that skipped the
readings or the closing line could not report a deck it only half read.

**Cross-check against the 2026-09-08 comment:** its regex ran on the old deck's prompt and text
fields; that deck is gone, so the same comparison now runs over all 252 prediction strings of the
28 slips: its regex hits 33, this query hits 32; 22 strings only its regex hits (the ดวง trap it
does not guard), 21 only this query hits (vocabulary its regex lacks, including the recruit
register added on the REFUTE review).

## What changed in the script, and why

1. **Deck shape.** The calibration fixtures and the cross-check referenced `FORTUNES[].prompt` and
   `FORTUNES[].text`; gh#97/gh#98 replaced that deck with `SLIPS` (number, grade, four verse lines,
   four readings, closing). Fixtures repointed at real SLIPS strings and at in-memory SLIPS-shaped
   fixtures; the cross-check runs over the slip fields. The slot predicate now reads the new
   prediction paths; the directive slot has nothing left to match, which is itself the finding.
2. **The re-export walk.** The deck module's own exported labels are reader-visible but absent from
   the game module's namespace, so every module a fortune game re-exports from is now walked,
   deduped by value, and the literal-presence line spans those modules too.
3. **OG generator pins.** The 09-09 regexes scraped `SITE` and the sub-line template out of
   `make-og.mjs`; both moved to the OG text module's `cardLines`, which the generator and the gate
   import. Layer 6 now calls `cardLines` for each fortune game and for `SITE`, and pins with one
   regex each that `make-og.mjs` still imports and calls it — if the text ever moves back into the
   renderer, layer 6 fails loudly instead of reporting a smaller N.
4. **OG pixel layer.** All three PNGs were re-opened and re-transcribed on 2026-09-23 and the
   sha256 pins updated to the hashes of the cards regenerated as gh#104 item 2. The transcription
   now records two logical Thai lines per card, with the wrap of the tagline noted.
5. **Render-verdict reasons.** The roster-pill reason now names both callers of the count function
   (the solo-guarded seed and the setup panel's start event) instead of "the only call".
6. **Header and usage.** The usage lines point at this directory; the header records that this is
   the refresh of the 09-09 instrument and that the 09-09 original stays the record of that day.
7. **The recruit register in the group vocabulary (REFUTE finding 1, spot-fix).** The group
   vocabulary gained one entry — ชวน / ใครสักคน / คนใกล้ตัว — because imperatives that tell the
   reader to fetch a person passed clean without it, a false green the REFUTE review demonstrated
   with five deck strings. A thirteenth calibration leg (must-red E) carries the counter-example
   ชวนใครสักคนไปเดินด้วย through the SLIPS walker and requires it to flag; before the fix that
   string classified clean. Seven rows newly flag; the one string the review expected that still
   does not, `SLIPS[18].readings.love`, stays clean under the negation rule and is disclosed in
   set 1 rather than worked around.
8. **PageChrome surface label (REFUTE finding 2, spot-fix).** The tier-B surface label said "all
   three fortune surfaces"; PageChrome is mounted only by the /c/fortune/ listing page and the
   home hub, never by GameLayout, so the label now says where the component actually renders.
9. **REFUTE finding 3 is disclosed, not fixed:** the TEMPLATES set is a hand list. See Ceilings.

Nothing else changed: the stoplist, the negation blanking, the group-context rule for วง, the
naive query, the tiering and the borderline and box-5 rules are byte-identical to 09-09; the group
vocabulary gained exactly the one entry of item 7.

## Ceilings — what this instrument asserts rather than checks

- **TEMPLATES is a hand list.** The header's claim that the template set is "the ones those routes
  actually render" is asserted, never checked: the only machine check on any entry is
  `fs.existsSync`. The mount graph was walked by hand on 2026-09-23 and equals the list today:
  `[category].astro` mounts Base and PageChrome; `[id].astro` mounts GameLayout, which mounts
  Base, PlayerSetup, LeaveConfirm, PassPhone and GameNav; `index.astro` mounts Base, PageChrome,
  Section and Card; the play routes mount Base with the chrome flag. Since 2026-09-09 exactly one
  page entered the repo — the croc-bite play route, a party page — so no fortune surface gained an
  unlisted component in that window. **A component entering that graph later escapes the
  enumeration silently:** nothing diffs the hand list against the import graph, so the ceiling on
  this instrument's completeness claim is the day someone last walked the graph by hand.
- **Function bodies of re-exported data modules are not walked.** The re-export walk enumerates
  runtime namespace values, and layer 4 statically reads only the game module's own file. Literals
  inside functions of a re-exported data module — the Thai digit table in the deck module's
  `thaiNumeral` — are neither, so they are not in N even though they render, as the slip numerals.

## The answer this refresh was run for

On 09-09 the deck owed a rewrite: 23 of 24 prompts were instructions to perform an act on the
people in the room, in a dedicated instruction slot. **That slot is gone — the directive count is
0 — and with it the 23 instruction prompts; the OG half of the 09-09 work list is absorbed too
(generator and pixels agree, and neither flags). Both halves were absorbed by the gh#97/gh#98
rebuild and the gh#104 item 2 regeneration.** What remains on the fortune surfaces is 32
prediction-slot strings that mention or invite other people — the 32 rows of set 1 above, listed
in full with their symbols and render verdicts — plus four shared-chrome strings whose render
verdicts keep them off a fortune reader's screen and two party-category names in cross-navigation
chrome. Among the 32 are lines that invite the reader to involve another person (the ชวน /
ใครสักคน / คนใกล้ตัว rows) and lines that merely mention people or speech; this report does not
sort one from the other, because whether any given row falls under gh#104 box 1 is the owner's
call under the standing ruling that the wording is the owner's. No replacement wording is proposed
here, and no argument is made either way.

## What this query cannot see

Unchanged from 09-09: sentences assembled at runtime from fragments are enumerated as fragments
(one such fragment is the `unreachable` roster-pill head); copy that names no listed term passes;
the instrument is a recall query over an owner-owned vocabulary, not a proof of absence — which is
why set 1 is reported rather than filtered. New since 09-09 and checked: no `content:` declaration
injects text from CSS, and the `keywords` field still has no consumer outside the game modules, so
those strings are counted in EXAMINED while rendering nowhere today.
