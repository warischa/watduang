# UI audit, 2026-10-06 (gh#262) — the ui-ux-pro-max rule set, measured on the built site

Step 1 of gh#262 (audit). Step 2 (the owner's picks) is not made here: every row below is a finding
plus options, never a choice. Order after the owner picks: canvas first, then code (ADR-0033).
Scope widened 2026-10-06 by the owner: gh#257, gh#258 and the `/404.html` styling are folded into
gh#262, so `/` and the 404 are main findings below.

Method as `../ui-audit-2026-10-04/README.md`: rules = priority 1-6 of the skill's
`references/quick-reference.md` (plugin 2.13.0), `npm run build` output served from `dist/`, real
Chrome (154.0.8037.98) over CDP, 320 under mobile emulation and 1440 desktop (`--window-size` is not
used, it does not reflow).

Built commit (measured, not inferred): `git rev-parse HEAD` = `146f578829935e15823de2f0402085390c904593`;
`dist/` built 09:10:07 on 2026-10-06 by one `npm run build` (26 pages). `git status --short` taken after
the runs shows only ` M .github/workflows/ci.yml` (the orchestrator's concurrent edit, which cannot
change `dist/`) and this evidence dir; no `src/` or `design/` change. It was not captured at build time
itself: the session-start snapshot read clean.

Files: `ui-audit-probe.mjs` (copy of the 10-04 probe; AUDIT block unchanged, new EXTRAS block),
`ui-audit-cdp-probe.mjs` (raw CDP: painted font, line-break meter, canvas D, clipped crops),
`ui-audit-detail-probe.mjs` (drill-downs). Raw output: `audit-320.json`, `audit-1440.json`,
`audit-cdp.json`, `audit-detail-320.json`, `audit-detail-1440.json`. Evidence images:
`crop-built-fortune-{320,1440}.png`, `crop-canvas-fortune-320.png`, `shot-404-{320,1440}.png`.

Coverage: 11 pages x {320, 1440} = 22 measurements, 0 with `error` (checked in the JSON: `pages[].error`
and `pages[].extras.error` absent), `consoleErrors` empty at both widths. The 404 row is the real 404
document, navigated as `/404.html` (the server served it at pathname `/404`).

## Calibration (a count is reported only after its detector fired on a known input)

| Detector | red@ (found) | Note |
|---|---|---|
| contrast | `/` `span.mark` "ใครโดน", #ffcc00 on #ff3d7f, **2.23:1** at 320 (44px) and 1440 (84px); `audit-320.json` `pages[/].contrastFails[0]` | present in both the 2026-10-04 run and this one |
| default-style button (new) | synthetic unstyled `<button>` injected in-page on every page: `extras.buttonControlUnstyled.uaDefault = true` (all 22); live red: `/tool/number/` 2 of 2 | |
| h1 font (new) | wheel and number h1 resolve to Sarabun-Bold, `/tool/draw/` h1 to Mitr: the in-page computed family differs, and CDP `CSS.getPlatformFontsForNode` agrees with it | draw is the Mitr control |
| Thai line-break meter (new) | synthetic 40px box with `overflow-wrap:anywhere`: meter reports mid-word splits ["กิจกรรม","สันทนาการ"] at both widths, `audit-cdp.json` `built["320Control"]` | what it can and cannot see is stated under gh#257 |
| empty result bar (new) | gh#260's own state (text length 0, 288x60) is the red; no separate synthetic | |

**The 3.90:1 white-on-#2b7bff pair from 2026-10-04 is gone at HEAD**: the home tools tiles now use ink
`rgb(20, 20, 43)` text on `#2b7bff` (`audit-detail-320.json` `homeToolTiles`), and the pair appears 0 times
in this run (it appears 4 times per file in each of the four 10-04 JSONs, 16 in total). It is not used as calibration.

## Findings for the owner (severity is my reading of the rule, not a pick)

### Already-filed, each measured directly

| Sev | Page | Width | Measured | JSON key |
|---|---|---|---|---|
| High | gh#259 `/tool/number/` buttons | 320, 1440 | `#number-go` 32x24 and `#number-reset` 82x24: Arial, bg `rgb(239, 239, 239)`, border `2px outset`, radius 0px, appearance auto; both enabled, both below the 44px target and not larger than the 24px floor | `pages[/tool/number/].extras.buttons`, `buttonsUaDefault = 2` |
| Med | gh#260 `/tool/wheel/` `#wheel-result` before the first spin | 320 | empty text, 288x60, display flex, visible, bg `rgb(20, 20, 43)`, padding 14px 16px, `role=status` | `pages[/tool/wheel/].extras.wheelResult` |
| Med | gh#260 | 1440 | the same, 544x60 | same key in `audit-1440.json` |
| Med | gh#261 `/tool/wheel/` h1 | 320, 1440 | computed `Sarabun` 700, painted `Sarabun-Bold` (13 glyphs); the page's own `--font-display` is Mitr | `audit-cdp.json` `platformFonts["/tool/wheel/@320"]`, `@1440` |
| Med | gh#261 `/tool/number/` h1 | 320, 1440 | computed `Sarabun` 700, painted `Sarabun-Bold` (7 glyphs). The wheel page's h2 "วิธีใช้" and all number h2s are also Sarabun, while the wheel's other h2s are Mitr | `platformFonts["/tool/number/@320"]`, `pages[].extras.headings` |
| control | `/tool/draw/` h1 | 320, 1440 | `Mitr SemiBold` (600) at 320 and `Mitr-Bold` at 1440 | `platformFonts["/tool/draw/@*"]` |

### gh#258 — `/` tile body line height (method: computed value AND measured pitch)

Method: for each tile body, `getComputedStyle().lineHeight`, plus the vertical pitch between line tops
from per-character Range rects (`linePitchPx`), plus `box height / lines`. Canvas D
(`design/HomeShelf320.dc.html`) was opened from `file://` in the same Chrome at 320; its Google fonts
loaded (Mitr 600/700, Noto Sans Thai 400/600, `audit-cdp.json` `canvasFonts`).

| Subject | Width | font | computed `line-height` | line pitch | box h / lines |
|---|---|---|---|---|---|
| Built `/` fortune and popular tile bodies (6 `.tile .desc`, 16px) | 320, 1440 | Sarabun | `normal` | **21px** | 21 |
| Built `/` tool-tile bodies (4 `.tile .desc`, 15px; `display:none` at 320, so measured at 1440 only) | 1440 | Sarabun | `normal` | 19px | 19 |
| Canvas D fortune tile bodies (3, 16px) and popular bodies (3) | 320 | Noto Sans Thai | `normal` | **24px** | 24 |

So the canvas renders the body at 24px, which matches the session note. The cause is not a declared
line height: the canvas declares none either (both compute `normal`). It is the body font: canvas D's
body is `'Noto Sans Thai'` (measured pitch 24px = 1.5 em), the built tile body is Sarabun first in `--font-sans`
(measured pitch 21px = 1.31 em). Options: (a) give `.desc` an explicit line height of 1.5 to reproduce the
canvas's 24px; (b) put Noto Sans Thai first in the body stack, which also changes widths and every other
body text, and adds a new font binary: `public/fonts/` holds only Mitr and Sarabun, Noto Sans Thai is not shipped, so it
falls under `docs/agents/assets.md` and the font coverage gate; (c) keep 21px and amend the canvas. Keys: `audit-cdp.json` `built["320"][]`, `built["1440"][]`,
`canvas["320"][]`, `canvas.popularDescs320[]`; also `tileBodyLineHeightNormal = 10` (all 10 tile bodies, 6 at 16px and 4 at 15px) in `audit-320.json`.

### gh#257 — `/` tile bodies and `overflow-wrap: anywhere`

- Built: every one of the 10 tile bodies (6 at 16px, 4 tool-tile bodies at 15px) computes `overflow-wrap: anywhere` at 320 and 1440
  (`tileBodyOverflowWrapAnywhere = 10`), set on `.tile` in `TextTile.astro`.
- Canvas D: the only elements with `overflow-wrap: anywhere` are the mockup's own **DESIGN NOTES** footer
  (an 11px monospace annotation `div`, inline style, headed "DESIGN NOTES - D · Toy Shelf (320)") and its `div`/`b`
  children. **No tile body carries it**; canvas tile bodies compute `normal`
  (`canvas.overflowWrapAnywhere`, `canvas["320"][].overflowWrap`). The built page's `anywhere` has no canvas source.
- Does a word break mid-word? The meter flags a break inside a Chrome (ICU) dictionary word, which is what
  `anywhere` adds. On the 6 visible 16px built bodies at 320 and 1440 (the 4 tool-tile bodies only at 1440) it reports **0** (and the 40px control reports 2,
  so it can fire). It does not reproduce gh#257's mechanism on these bodies. What a Thai reader sees is
  different, and it is in both renders: built 1440 `daily-fortune` breaks "อ่า|นขำๆ", canvas 320
  `daily-fortune` breaks "จิ๊บจ๊อ|ยอะไร". Both break points are Chrome's own dictionary boundaries (ICU
  segments those runs as "อ่า|นขำๆ" and "จิ๊บจ๊อ|ยอะ|ไร"), so `anywhere` is not what causes them and removing it
  would not fix them. Crops: `crop-built-fortune-320.png`, `crop-built-fortune-1440.png`,
  `crop-canvas-fortune-320.png`; line texts in `audit-cdp.json` `lineTexts`.
- Limit: the meter's definition of a word is ICU's. It cannot call "อ่า|นขำๆ" a defect, and a human
  reader may. Options for the owner: (a) accept `anywhere` as the gh#109 overflow guard. Line breaks do differ from
  the canvas at 320 on 3 of 6 bodies, because the fonts differ in width (Sarabun vs Noto Sans Thai): daily-fortune built
  `เรื่อง | จิ๊บจ๊อยอะไร` vs canvas `จิ๊บจ๊อ | ยอะไร`; love-match built `เป็น | คน` vs canvas `คน | แบบ`; how-close-is-near built
  `หรือ | ไกล` vs canvas `ไกล | แพ้`. Built 320 is cleaner than the canvas on daily-fortune. Canvas 1440 was never opened, so
  the 1440 comparison is unmeasured; (b) scope the guard to `.name` only; (c) the owner rules on
  the "อ่า|นขำๆ" class separately (it needs a dictionary fix or a hand-placed `<wbr>`, not CSS).

### Folded: the 404 (no ticket number — "404, folded 2026-10-06")

Header, nav pills and footer are the gh#255 chrome (Mitr); **the body content has no canvas styling**
(`audit-detail-320.json` `p404`; images `shot-404-320.png`, `shot-404-1440.png`):

- `h1` "ไม่พบหน้านี้" and the paragraph are **Times** 32px / 16px, black on a transparent body (no cream
  ground: `body` bg `rgba(0, 0, 0, 0)`), left-aligned flush at x=0 (no page padding).
- The recovery link "กลับหน้าแรก" is the browser default: `rgb(0, 0, 238)` underlined, Times, **84x18** px
  (under the 24px WCAG 2.2 floor at both widths and the 44px rule). It is the only way back besides the nav.
- No linked stylesheet; one inline `<style>` tag. Contrast of the existing pairs passes (black on white), 0 failures.

Option: draw a 404 artboard on canvas D; reuse the category page's ground and `h1`/link pattern.

### New, in scope pages

| Sev | Page | Width | Measured | JSON key |
|---|---|---|---|---|
| Med | `/tool/draw/`, `/tool/team/` eyebrow "ไม่ใช่เกม ตอบทันทีในกดเดียว..." | 320 only | `#3d3b5c` 13px on the tool band `#2b7bff`: **2.72:1** (needs 4.5). At 1440 the eyebrow is `display:none`, so it is not measured there. Option: ink text (`#14142b`, 4.62:1 on that blue), the pair the tools tiles now use | `pages[/tool/draw/].contrastFails[0]`, `audit-detail-320.json` `eyebrow` |
| Low-Med | `/tool/wheel/` 3 radio and checkbox inputs | 320, 1440 | native control 13x13 (under the WCAG 2.2 24px floor); the labels around them are 210x38, 242x38, 219x21, so the hit area is the label, not the control | `pages[/tool/wheel/].under24`, `audit-detail-320.json` `checkboxes` |
| Low-Med | `/tool/number/` one 13x13 input | 320, 1440 | same class as the wheel's | `pages[/tool/number/].under24` |
| Low | `/c/fortune/` section `h2`s "คำทำนายในหมวดนี้", "ไปที่อื่นต่อ" | 320, 1440 | 15px, smaller than the 16px body of the same page, so the h2 reads below the paragraph size | `pages[/c/fortune/].extras.headings` |
| Low | `/c/fortune/` text below 16px | 320 / 1440 | 15 / 18 elements (the skill's readable-font rule; canvas sizes, so a canvas change) | `textElements16` |
| Low | `/game/love-match/` `p.lm-heading` "เนื้อคู่ของคุณ" | 320, 1440 | line height 1.40 of the font size (under 1.5) | `tightLineSample` |
| Low | Touch targets under 44px, every page | 320, 1440 | 320: tools 4/9, wheel 22/26, draw 20/24, team 20/23, number 24/24, fortune 5/10, siamsi 22/23, daily-fortune 17/18, love-match 17/28, 404 5/5, `/` 4/33. 1440: 0, 18, 16, 16, 20, 1, 22, 17, 17, 1, 0. Gets worse on game pages: siamsi category chips are 34px tall, nav pills 34px, cross-link anchors 24-25px | `under44` / `targets` per page |
| Detector limit | `/tool/wheel/` hub label "หมุน" flagged 2:1 | 320, 1440 | One element, `#wheel-disc`, at two widths (`#wheel-spin` has no entry). The detector reads CSS `color`, which for the disabled button is Chrome's UA `button:disabled` colour. The label is an SVG `<text>` that paints `fill="#14142b"` (`src/pages/tool/wheel.astro`), so the 2:1 is not what is painted. **Not an exemption claim and not a finding to pick: the paint is unmeasured by the probe.** One-off arithmetic, not a render measurement: `#14142b` against the hub circle's `fill="#fff6e0"` (read from the same source) is 16.75:1 (WCAG luminance formula). The disc's rendered pixels were not sampled. | `pages[/tool/wheel/].contrastFails`, `extras.buttons[].disabled` |

### Home `/` (context for the picks above, already in the 10-04 list)

`span.mark` 2.23:1 (large text, needs 3) at 320 and 1440, and the ad slot label "ช่องโฆษณา" 2.83:1 (14px /
16px, needs 4.5) at both widths: `audit-320.json` `pages[/].contrastFails`. The mark was item 3 of the
10-04 README and is still open. The ad-slot label is new in this list (not in the 10-04 README; the slot
label colour `rgb(154, 148, 122)` is canvas D's `#9a947a`).

## Passes (on all 11 pages x 2 widths unless noted)

No sideways scroll (`extras.hOverflowPx = 0`), no heading-level skips, every `<img>` has `alt`, `lang="th"`,
CLS at most 0.0045 (love-match at 1440), no sampled h1/h2 under 16px except fortune's h2 above (`extras.headings` samples only the first 6 h1/h2 per page; h3-h6 were never sized, and `/` has 27 h3), nothing under 12px,
`viewport` meta present. Contrast failures are only the ones listed (the wheel hub label entry is a detector limit, see its row).

## Not covered, so none of these is a pass

- **Every post-interaction state**: the probe makes no taps or clicks. Not measured: the wheel result bar
  after a spin (gh#260's "after the first spin" state), draw/team/number results, the siamsi drawn slip,
  daily-fortune and love-match result screens, disabled-to-enabled button states, the wheel hint states,
  and the number page's enabled/disabled button states beyond `#number-go` as rendered at idle.
- Focus-ring visibility, keyboard order, screen-reader output (the `role=status` live region's announcement
  was not exercised), real-device rendering, hover states, reduced motion.
- Play routes (ADR-0050) and `/c/party/`; the network (a local server makes LCP times meaningless).
- The rest of the 40+ tile bodies that are not on `/`; the `/en/` tree.
- SVG `<text>` fill is not measured by the contrast detector (it reads CSS `color`); there is one SVG `<text>` across the 11 pages (the wheel hub label).
- Line-break defects the ICU dictionary itself produces (it is the meter's definition of a word).
- The canvas was measured at 320 only (`HomeShelf320`); `HomeShelfDesktop` was not opened, so the 1440
  canvas line pitch and wrap behaviour are unmeasured.
- Canvas fonts come from Google's CDN at run time, while the built site self-hosts only Mitr and Sarabun (Noto Sans Thai is not
  shipped); the canvas run assumes the CDN files.
