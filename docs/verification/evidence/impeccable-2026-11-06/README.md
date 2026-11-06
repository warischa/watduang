# impeccable critique + audit, 2026-11-06 — home, fortune หมวด, tools หมวด, one party play route

Step 1 (audit) of the owner ruling 2026-10-04: audit → owner picks → canvas → code (ADR-0033). No row
below is a choice. Party play routes sit outside the canvas (ADR-0050), so their picks may go straight
to code.

Instrument: the impeccable skill (pbakaus/impeccable, plugin 4.8.0, engine 0.1.18, sha256 verified by
its launcher against `engine-checksums.txt`), telemetry off (`.impeccable/config.json`).
Built commit: `44e3138` (clean tree), `npm run build` → 29 pages, served from `dist/` on localhost.

## Method (critique.md provenance line)

`Method: A = 4 isolated sub-agents (one per target, no detector output in their briefs) · B = detector
run in the parent BEFORE synthesis` — B was not isolated in its own sub-agent, so the parent saw the
detector first (anchoring risk in synthesis only; A stayed clean).

- A (design review): screenshots via `scripts/driver.mjs`, headless Chrome with swiftshader (WebGL live,
  read in page), 390x844 and 1280x800, full-page captures taken AFTER a scroll-through. The timebomb
  agent also drove the round (setup, ticking, boom) at 320/390/1280; the fortune agent drove siamsi
  in the browser pane at 375.
- B (detector): `impeccable detect --json` over `src/` (`detect-src.json`), over 6 rendered URLs at
  both widths (`detect-url-*.json`) and over 10 party play routes at 390 (`detect-play-390.json`).
- Audit layer: the gh#262 probe re-run at 320/1440 on the same 6 pages (`audit-320.json`,
  `audit-1440.json`), from `audit-probe-scrolled.mjs` = that probe plus one scroll-through step.

## Instrument calibration (what a number counts)

- **Scroll-reveal hides content from a probe that does not scroll.** Unscrolled, the gh#262 probe saw
  10 targets on `/`, where `dist/index.html` has 34 `<a`. Scrolled: 34. The first screenshots were
  blank below the fold for the same reason. Every count here is from the scrolled run.
- **The probe's Thai mid-word meter reads 0 on `/`, yet the ดวงวันนี้ card renders `อ่า / นขำๆ`**
  (seen at 390 and 1280). The meter has a blind spot; its zero proves nothing about line breaks.
- Under-44 rows (`chrome-pill` 34px, `sm-chip` 34px, wheel checkboxes 24px) are the remainder ruled
  in gh#263 (pseudo `::after` hit areas, a box probe cannot see them). Not findings.
- Contrast "fails" that are not: wheel `หมุน` at 0.3 alpha is the disabled state (WCAG exempt);
  `#play-crawl-home` 1x1 is the deliberately clipped crawl link (PlayExit). The detector's `src/play`
  `markup.html` contrast rows assume a white ground; only 2 of them reproduce rendered (below).
- Detector `content-hidden-at-rest` on croc-bite/one-bomb/cannon-flag = not-yet-shown game phases
  (likely false positive, not verified). `hard-offset-shadow` (43 advisory) = canvas D's chosen
  sticker style. `cream-palette` on the wheel = the ADR-0069 ground. Both are decisions, not drift.

## Findings — confirmed by the parent (screenshot or source read this session)

| # | Pri | Target | Finding | Canvas |
|---|---|---|---|---|
| 1 | P1 | siamsi | Vessel `.sm-barrel` reads as a beer glass (yellow tumbler, foam rim, fill lines) — sits next to the §32/1 no-glasses rule | follows |
| 2 | P1 | siamsi | `#ss-hold` has pointer handlers only: no keyboard path to draw a stick | not painted |
| 3 | P1 | tools | `ToolHeader` ≥1100px has no inline padding: h1 clipped at x=0 at 1280 (all 4 tools share it) | follows (canvas drew 1440 only) |
| 4 | P1 | timebomb | Fuse spark drawn above the canvas top: the bomb never looks lit (`bomb-canvas.ts` geometry) | outside canvas |
| 5 | P1 | home | No privacy / about links, no privacy page (404). AdSense "Required content" (support.google.com/adsense/answer/1348695, read 2026-11-06) says the privacy policy should disclose third-party ad cookies and the opt-out. gh#29 and a tracker search have no privacy ticket | follows |
| 6 | P2 | home | `อ่า / นขำๆ` mid-word break in the ดวงวันนี้ card (TextTile `overflow-wrap:anywhere` suspected) | diverges |

## Findings — agent-reported (A), cited with their evidence label, not re-verified by the parent

Home: 14-tile phone shelf buries fortune/tools (~1,300px), 4 games shown twice (P1, follows) · hero
h1 names no offer and no search term; desktop `ก็มาเลย` box reads as a 2nd button (P1, owner-ruled
2026-11-04, canvas stale) · gold means fortune AND action AND highlight (P2, follows) · tools named
`เครื่องมือสุ่ม` vs `เครื่องมือกิจกรรมสันทนาการ` (P2).

Fortune: "เก็บใบนี้ไว้" removes the slip (P1, follows SiamsiSlip) · slip text centred by the shell rule
`.stage-screen p` (P2, diverges) · `/c/fortune/` first card at ~990px, ad before content (P2, follows) ·
เกม vocabulary ("เล่นเลย", "วิธีเล่น") on a non-เกม หมวด · chips lack `aria-pressed`, meter lacks a role.

Tools: entering names gives no on-screen feedback, the disc is 1–2 screens up (P1) · 14-link GameNav
inside the tool section (P1, diverges) · desktop wheel is the 544px phone column; the desktop canvas
draws 940px two-column (P2, diverges) · hub cards have no per-tool mark, bottom link browser-blue (P2).

Timebomb: boom and round-end screens are the quietest (loser name 16px, static canvas frame) (P1) ·
`#tb-again` unarmed at detonation, a pass tap skips the reveal — a deliberate #37 trade-off pinned in
`src/games/timebomb.test.mjs`, so a revisit, not a bug · edit-players dialog survives the boom (P2,
confirmed by screenshot `tb-390-8-boom-under-dialog.png`, not kept) · pass order never shown (P2).

Party routes (detector, rendered 390): white on `#2ecc71` 2.1:1 (croc-bite) · white on `#05a6d0`
2.8:1 `#btn-menu-start` (wire-snip-panic) · gradient text in 7 routes · `ai-color-palette` purple/cyan
(cursed-number, wire-snip-panic) · 10px functional text `ขั้น 0/2` (wire-snip-panic, source scan).

Not covered: real devices, Safari/WebKit, audio, 320 for the A reviews of home/fortune/tools, focus
states, and every party route except timebomb for design review.
