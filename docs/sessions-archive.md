# Sessions archive

Rolled-out state entries from `SESSION-HANDOFF.md` § Current state, newest first. Append-only.
(เคยอยู่ใน `CLAUDE.md` — ย้ายบ้าน 2026-08-14 ดู `.claude/commands/save-session.md`)

A resume never reads this file — it reads the live entry in `SESSION-HANDOFF.md`. This exists so the
live window stays at one entry without losing history.

Window: **N=1** (one live entry in `SESSION-HANDOFF.md`; older entries roll here at the first save of a new session).

---


<!-- Keep entry ids out of this prose. Roll verification asserts the archive holds exactly one
     copy of a rolled header, and a stray mention here would make that assert lie. -->
### S2026-08-14#5

done: **[#23] shipped `5aec128`** (12 files, +214/−47, **57 → 63 tests**) — the checkpoint now owns its roster, element-wise name gate gone; per-line mechanism in the commit body, DoD evidence in the [#23] comment · ADR-0008 two-button resume prompt · **REFUTE caught 1 real defect** — `#player-count` had no listener, so a stale roster started a 4-player round; fixed, proved both ways · `ci.yml` sitemap gate checked **1 of 4** tools, now all four calibrated per page · **[#22] closed** 5/5 · [#23] 6/6 ticked, **held open** on Thai copy · #15–#18 **13 of 59** ticked (31 UNPROVEN · 7 DEFER · 3 NEEDS-VIEWPORT) · new `docs/site-owner-checklist.md` · filed [#24] [#25]

dec: ADR-0008 (**scoped to round-start**; `ล้างกลุ่มนี้` mid-round = [#25]) · ADR-0007 scored — still untested, `.astro` wiring has no coverage and CI passes either way · #23 DoD box 3 unconstructible as written, body unedited + annotated

next:
- [ ] **Thai copy sign-off** — `ยังมีรอบที่เล่นค้างอยู่ จะกลับไปเล่นต่อ หรือเริ่มรอบใหม่กับวงที่เลือกไว้?` → then `gh issue close 23`; asked, unanswered
- [ ] [#25] `ล้างกลุ่มนี้` mid-round discards a live round, label names only the group — **live round-loss path**, 3 options in the ticket, owner picks
- [ ] [#24] one checkpoint slot site-wide — dormant until a 2nd game writes one; `game` tags, doesn't select
- [ ] #15–#18 **31 UNPROVEN** boxes — evidence-or-leave rule held, don't tick on inference
- [ ] #13 DoD4 real phone + #20 → steps in `docs/site-owner-checklist.md` · **closing DoD4 closes #13**
- [ ] #9 domain · Azure token (**only real CSP/AdSense proof**) — both owner-gated, checklist §1/§2
- [ ] promote scratchpad `driver.mjs` → `scripts/` — `scripts/cdp.mjs` can't do cross-page nav or console listeners, so `docs/agents/browser-verification.md` overstates the shipped instrument
- [ ] `docs/runbook.md` § "ตรวจงานให้เหมือน CI" — "calibrate both ways" is **insufficient**: a gate covering a SET needs calibrating per member (sitemap gate passed both ways on `wheel`, blind to 3 pages) · + 3 new zsh traps (unquoted flag glob · BSD `grep -E` has no PCRE lookahead · heredoc in `bash -c`) · **deferred:** file is Thai, convert-on-touch makes it a full-file conversion

inflight: measured at save — `5aec128` on `fix/23-checkpoint-identity`, this save commits on top, then merge → `main` + push both this turn · open PRs: none (checked `gh pr list`) · no background tasks · headless Chrome + `serve dist` torn down, verified stopped via `pgrep`+`lsof` (ports 4321/9222 free) · orchestrate ledger: session scratchpad, not committed

### S2026-08-14#4

done: **[#21][#22] + 2 unfiled data-loss paths shipped `697b131`** — `src/shell/player-select.ts` (new, pure `resolveStart`/`numberedPlayers`) + `player-select.test.mjs` · `PlayerSetup.astro` · 57 tests, build green · #21 over-max warns naming who sits out, **stored group stays the full ticked set** · #22 button `เริ่มแบบ "คนที่ 1, 2, 3…"` visible on first paint with group pre-ticked, never touches selected/group/session · **data-loss 1** `saveGroup([])` moved inside the `clearsSession` gate · **data-loss 2** untick-all path wiped the group — copy reworded + write guarded by `selected.size > 0` · `#start-numbered` hidden while a checkpoint exists on `setPlayers` pages (one tap orphaned a live siamsi round — reproduced, then fixed) · checkpoint-slot audit: **no collision possible**, all 4 tool modules are pure fns · filed [#23] · #15–#18 got 5 DoD ticks + evidence comments, **none closed** · new `scripts/cdp.mjs` + `docs/agents/browser-verification.md`

dec: ADR-0007 (ADR-0004's party-size rule constrains the SET a guard enumerates, not where it lives — extraction to a testable module is legal · ADR-0004 prediction scored: confirmed in substance, refuted in wording) · browser instrument = CDP device emulation, **never `--window-size`** → `docs/agents/browser-verification.md`

next:
- [ ] [#23] checkpoint identity — 4 symptoms, 1 cause (numbered rounds unresumable · hide-condition game-agnostic · re-ticking reorders the Set · "ล้างกลุ่มนี้" no-op on tool pages) · **do not spot-fix one** · first 2 DoD boxes reproduce headlessly via `scripts/cdp.mjs`
- [ ] #13 DoD item 4, real phone (site owner) — **closing it closes #13** · same pass: #20 siamsi mid-round → refresh → must restore
- [ ] #15–#18 still **5/59** DoD ticked — most of the rest are logic assertions CI likely already satisfies but nobody has confirmed
- [ ] #9 register `watduang.com` (site owner) · #19 blocked by it
- [ ] Azure SWA phase 2 — site owner sets `AZURE_STATIC_WEB_APPS_API_TOKEN` · done = Deploy no longer `skipped` · **the only thing that can prove CSP/AdSense for real**

inflight: measured at save — `697b131` committed, this save commits on top, both pushed this turn · working tree otherwise clean · open PRs: none (checked `gh pr list`) · no background tasks · headless Chrome + `serve dist` torn down and verified stopped

### S2026-08-14#3

done: **[#16][#17][#18] tools 2-4 shipped `94505f6`** — `/tool/draw/` `/tool/team/` `/tool/number/` · `src/tools/{draw,team,number}.ts` + tests · 47 tests · `EXPECTED_TOOL_SLUGS`=`"wheel draw team number"`, **calibrated both ways** (fires on a removed page, passes on a restored one) · `/tools/` lists all 4, "กำลังทำ" section deleted · **CI green `31774307651`, every gate incl. the 3 added in #15** (Deploy still skipped — no secret) · pre-merge REFUTE caught 2 blockers, both fixed before commit · comments → English per § Language · filed [#21][#22] as sub-issues of #14 · PartyPick confirmed

dec: ADR-0006 (PartyPick confirmed — closed, not merely unexamined) · ADR-0004 §เพิ่มตอนทำ#16-#18 (a party-size guard belongs to the page, not the logic module — it was enforced against the *remaining* pool and stranded the last name · `pickNumber` range now capped) · `docs/runbook.md` § ตรวจงานให้เหมือน CI (agent shell is zsh, CI is bash — wrap verification in `bash -c`)

next:
- [ ] #13 DoD item 4, real phone (site owner) — **closing it closes #13** · same pass: #20 siamsi mid-round → refresh → must restore · **and the 3 new tool pages — reduced-motion + 320px were asserted from markup, never seen in a browser**
- [ ] [#21][#22] `ready-for-agent`, sub-issues of #14 — `max`-side silent drop · discoverability of the "คนที่ 1, 2, 3…" mode · #21 carries the *rejected* fix (storing the clamped group) so nobody re-proposes it
- [ ] #9 register `watduang.com` (site owner) — `whois` free (checked 2026-08-14) · #19 blocked by it
- [ ] Azure SWA phase 2 — site owner sets `AZURE_STATIC_WEB_APPS_API_TOKEN` · done = Deploy no longer `skipped` in `gh run view` · **the only thing that can prove CSP/AdSense for real**

inflight: measured at save — working tree clean after this commit · open PRs: none (checked `gh pr list`) · no background tasks · `94505f6` pushed, this save commits on top

### S2026-08-14#2

done: **[#15] tool 1 shipped `24fe2c8`** — `/tool/wheel/` · `/tools/` · `src/tools/wheel.ts` + mutation-proven tests · shell shared with games · **fixed the CSP defect that silently blocked page JS, + 3 new gates in `ci.yml`** · 20 tests · `/tools/` no longer orphaned `0a485ee` · docs → pointers `bb9c1dc` · tracker: opened #19 #20 · #12 is no longer a gate · linked #14 #19 #20 under #1 · dep #19←#9 · **pushed, and CI went green on GitHub with all 3 new gates on their first real run** (`31763743017`, Deploy still skipped — no secret yet) · state moved out of `CLAUDE.md` into this file `2143101` · language policy `d3279d4` · `CLAUDE.md` converted to English this save

dec: ADR-0005 (page JS must never inline) · ADR-0004 §added-during-#15 (indirect session access · remembered group · absence baseline) · **the real gate is now ticket #19, not #12** (ADR-0003) · state home = this file, which **overrides master save-session** — reason recorded in `.claude/commands/save-session.md`, do not move it back without reading that · language = write English, ship Thai (`CLAUDE.md` § Language); Thai docs convert on touch, `docs/sessions-archive.md` never

next:
- [ ] **[#16][#17][#18] can run in parallel now** — frame is reusable per ADR-0004 · add the slug to `EXPECTED_TOOL_SLUGS` in `ci.yml` · done = build + `node --test` green, and the absence gate goes red when the page is `mv`d away
- [ ] #13 DoD item 4, real phone (site owner) — **closing it closes #13** · same session, also check #20: siamsi mid-round → refresh → must restore the round
- [ ] #9 register `watduang.com` (site owner) — `whois` still free (checked 2026-08-14) · #19 is blocked by it
- [ ] Azure SWA phase 2 — site owner sets secret `AZURE_STATIC_WEB_APPS_API_TOKEN` · done = Deploy no longer shows skipped in `gh run view` · **the only thing that can prove CSP/AdSense for real**
- [ ] 2 REFUTE findings still unfiled (awaiting permission) — both written up in ADR-0004 §added-during-#15: silent drop on the `max` side · discoverability of the "คนที่ 1..N" mode
- [ ] confirm or change PartyPick

inflight: tree clean · no open PRs (checked) · no background tasks · pushed this round


### S2026-08-13#7

done: **เกม 2 `siamsi` ลง CI เขียว 11 step** `aa5a251` · การ์ดแชร์ `/` `/games/` `/404` `d254a8d` · siamsi กู้รอบค้างตอนรีเฟรช `e3fd74f` · 14 tests · **grilling รอบใหญ่ → `CONTEXT.md` + ADR 0001-0004 + spec [#14] แตกเป็นตั๋ว [#15] → [#16][#17][#18]**

dec: why อยู่ใน `docs/adr/` — 0001 หมวด · 0002 siamsi=เกม 8 · 0004 เครื่องมือ 4 ตัว `/tool/<slug>` ต้องใช้ roster ร่วม · **0003 คือเกณฑ์ที่ยังมีชีวิต: organic clicks <300/เดือน ที่เดือน 6 นับจาก tool+3 เกมขึ้น prod → ไม่ถึง = ดัน `/en/`**

⚠ ก่อนสร้างรูป OG · รัน build · หรือยื่นตัวเลือกให้เจ้าของเว็บตัดสิน → อ่าน `docs/runbook.md` ก่อน

next:
- [ ] **[#15] วงล้อสุ่ม + โครงหน้าเครื่องมือ — เริ่มได้เลย** จบแล้วปลด [#16][#17][#18] ทำขนานได้
- [ ] DoD #13 ข้อ 4 มือถือจริง (เจ้าของเว็บ) — **ปิดข้อนี้ = ปิดใบ #13** · เช็คสายไฟ checkpoint ของ siamsi ไปด้วย (เทสคลุมไม่ถึง)
- [ ] #9 จด `watduang.com` (เจ้าของเว็บ) — `whois` ยังว่าง
- [ ] Azure SWA เฟส 2 — เจ้าของเว็บตั้ง secret `AZURE_STATIC_WEB_APPS_API_TOKEN` · Deploy ต้องไม่ขึ้น skipped ใน `gh run view` · **ด่านเดียวที่พิสูจน์ CSP/AdSense**
- [ ] GitHub ค้างรออนุญาต: ผูก #14 เข้า #1 · แก้ #12 ให้เลิกอ้างเป็น gate (ADR-0003) · เปิดใบ gate ใหม่ · เปิดใบให้ `siamsi`
- [ ] ยืนยัน/เปลี่ยน PartyPick

inflight: tree สะอาด · push ครบถึง `origin/main` · ไม่มี PR เปิด (เช็คแล้ว) · ไม่มี bg task

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

### S2026-08-13#3

done: สำเนา `.scratch/` issues+map ลบแล้ว (sync body #8 ขึ้น GitHub ก่อน — answer เดิมอยู่แค่ใน comment) · docs repoint → GitHub · adversarial review = Codex `gpt-5.6-sol` xhigh 12 findings + reconcile → บันทึกครบใน comment: [#1](https://github.com/warischa/watduang/issues/1#issuecomment-5277741890) (full+verdict) #6 #8 #10 #12 + map Decisions-so-far · scaffold spec เต็ม → [#13](https://github.com/warischa/watduang/issues/13) (ticket 12 · sub-issue ของ #1 · ready-for-agent · DoD 4 ข้อ)

dec: **Pause เกม 2–7 + เนื้อหา ~230 ข้อ จนกว่า #12 ตอบ go/no-go** · scaffold+เกม 1 เดินได้ทุกกรณี · ads แก้มติ (แทน "sticky ปิด 2 จังหวะ"): **ห้ามโฆษณาบนจอเล่นทั้งหมด** inventory=hub/กติกา/post-game · จอง slot กัน CLS · สมัคร AdSense หลังมี prose · PDPA เริ่ม NPA → #8 · state แก้มติ (แทน "roster เท่านั้น"): roster (persistent) + session (transient มี expiry) · lifecycle contract · content stable ID · CI validate ต่อเกม · ระเบิดเวลา physics · OG field → #6 · 32/1 ยังไม่ปิด → #10

next:
- [ ] #12 Keyword Planner **= gate** (เจ้าของเว็บ ต้อง Google Ads) — worksheet ตามสเปกใน comment มี volume จริง
- [ ] #9 จด `watduang.com` (เจ้าของเว็บ) — `whois` ขึ้นเจ้าของ
- [ ] scaffold ตามสเปกเต็มใน [#13](https://github.com/warischa/watduang/issues/13) (โครง+contract+CI+เกม 1 — ครบ ไม่ต้องรื้อ) — DoD 4 ข้อในใบนั้น
- [ ] ตัดสิน #10: ทนายรีวิวหน้า "ใครแพ้หมดแก้ว" vs ตัด angle ทิ้ง (เจ้าของเว็บ)
- [ ] ยืนยัน/เปลี่ยน PartyPick — ตัด "รอยืนยัน" ออกจากบรรทัดแบรนด์
- [ ] map #1 Decisions-so-far ลิงก์ relative ชี้ `issues/*.md` ที่ลบแล้ว — กวาดเป็นเลข issue

inflight: tree สะอาด · push ครบถึง origin/main (เช็คแล้ว) · ไม่มี PR เปิด (เช็คแล้ว) · ไม่มี bg task (Codex jobs จบแล้ว)

### S2026-08-13#1

done: `.scratch/free-game/` +map +11 ใบ +research 3 ฉบับ +prototype ของทิ้ง · `CLAUDE.md` `docs/agents/` +สร้าง · repo `warischa/watduang` +init +private +push · GitHub +map#1 +sub-issue 11 +label 10 +native deps · ปิดไป 9/11

dec: เหตุผล → issues #2–#12 · สรุปย่อ → #1 Decisions-so-far · ที่เหลืออยู่นอกไฟล์นี้: domain=`watduang.com` **ยังไม่จด** · en=PartyPick *รอยืนยัน* · roster=localStorage เท่านั้น ไม่มีคะแนนข้ามเกม · Azure sub=`edad4930-c46c-4c78-9362-c75e71a91a35` region=`southeastasia` plan=**Standard** · เกม 7 ตัว เรียงตามสิ่งที่แต่ละตัวพิสูจน์ ตัวแรก=ระเบิดเวลา · ads=วางเองล้วน **ไม่ใช้ Auto ads** · sticky ปิดบนหน้าส่งมือถือและจังหวะเฉลย

next:
- [ ] scaffold Astro + เกม 1 ระเบิดเวลา — `npx serve dist/` เสิร์ฟ `/game/timebomb` เป็น HTML ของตัวเอง
- [ ] [#9](https://github.com/warischa/watduang/issues/9) จด `watduang.com` — `whois` ขึ้นเจ้าของ
- [ ] [#12](https://github.com/warischa/watduang/issues/12) Keyword Planner — `research/keyword-planner.md` มี volume จริง
- [ ] ยืนยันหรือเปลี่ยน PartyPick — บรรทัดแบรนด์ข้างบนตัดคำว่า "รอยืนยัน" ออก

inflight: working tree สะอาด · ไม่มี PR เปิด (เช็คแล้ว) · ไม่มี bg task (เช็คแล้ว) · GitHub เปิดค้าง #9 #12
