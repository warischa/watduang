# gh#267 / gh#274 / gh#275 visual verification, 2026-10-18

Method: `dist/` (newest mtime 1792287338 > newest src 1792287329, not rebuilt) served by `npx serve -l 4461`; headless Chrome 155, flags `--headless --disable-gpu --no-sandbox --remote-debugging-port=9461`, fresh profile. Viewports by CDP `Emulation.setDeviceMetricsOverride` (mobile, 390x844 and 320x568; `innerWidth` echoed in JSON). localStorage cleared before each leg. Scripts: `measure-a.mjs`, `measure-b.mjs`, `crosscheck-b.mjs`, `measure-c.mjs` (+ `cdp-lib.mjs`, `sample.py`). Raw: `A.json`, `B.json`, `B-painted-crosscheck.json`, `C.json`.

## A. painted faces (CSS.getPlatformFontsForNode)
Display text (`.ps-count-read`, `.ps-sec`, `.ps-go`, `.ps-add`, `.ps-dialog-title`, `.ps-danger`): computed Mitr stack, painted Mitr-Regular / Mitr-Medium, on short-stick and one-bomb, both viewports, screen + reset dialog + edit dialog. `.ps-n` name field: Sarabun stack, painted Sarabun-Regular, both routes.
Off-decision observation: elements with no own font-family inherit the route body: `.ps-tagline .ps-hint .ps-limit .ps-dialog-body .ps-step .ps-rm .ps-e`. short-stick: Noto Sans Thai first (painted NotoSansThai-Regular); one-bomb: system-ui (painted .ThonburiUI / .SFNS). `.ps-step` is Arial/ArialMT on one-bomb.
Must-red: injected `:root{--font-display:Georgia,serif}` on short-stick: `.ps-go` painted Mitr-Medium before and after (unchanged). Positive control: a probe `<p style="font-family:var(--font-display)">` computes to `Georgia, serif`, so the injection took effect.
Edit dialog on short-stick was opened with `showModal()` (round not active when the edit event fired); on one-bomb it opened through the real event.

## B. cursed-number `.ps-go` (21px / 500, bar 4.5)
Fill `rgb(147,51,234)` (#9333ea), text white, in every state. Ratio computed per pixel against the painted backdrop (button hidden, 45-point grid), opacity composited.
| state | 390 | 320 |
|---|---|---|
| enabled (n=3 at 390) | 5.38 5.38 5.38 | 5.38 |
| enabled, saved mode | 5.38 | 5.38 |
| disabled (opacity .5, via duplicate name typed in the UI) | 3.10-3.11 | 3.10-3.11 |
Disabled composited fill #4d1c7d / text #838287; painted pixels measured #4d1b7c-#4e1b7d (matches). Below 4.5 (WCAG exempts inactive controls; flagged anyway). The unticked-below-minimum disabled path did not disable the button; not measured.
Accent text stays `rgb(168,85,247)` (#a855f7): `.ps-limit b` 14px/600 4.79-4.83 on the panel, `.ps-undo` 16px/500 4.87-4.88. `.ps-tick[aria-pressed=true] i` white on #9333ea 5.38; `.ps-danger` white on #9333ea 5.38 (both 16px, bar 4.5 passed).

## C. zero-trigger `#btn-big-action`
Start state computed `linear-gradient(135deg, rgb(7,89,133), rgb(3,105,161))`, color white, opacity 1. Glyphs made transparent, 2x screenshot, 60 points on the diagonal (0.22-0.78): white ratio 6.21-7.21. Pixels under the START label rect 6.50-7.00 (22.4px/900, bar 3), under the subtext rect 6.49-6.71 (10.4px/700, bar 4.5). The 4px translucent border and the inset glow lighten the rim: a wider grid including rim pixels reads min 3.67-3.77, none under a glyph.
`.state-locked` computed background `none` + color rgb(51,65,85); `.state-stop` `linear-gradient(135deg, rgb(220,38,38), rgb(239,68,68))`. Neither is the new blue. Same at 320.
Not covered: no contrast gate on the reveal timing; n=1 per cell except B enabled at 390.

## A2. re-run on rebuilt dist (index.html mtime 1792291991 > newest src 1792291943), `scripts: measure-a2.mjs`, raw `A2.json`
Method as A, but every element with its own text (or an input value) inside `.ps` and both dialogs, not only `.ps-*` rules; phases: first-visit screen, duplicate-name screen (shows `.ps-limit`, `<b>`), saved-mode screen (ticks, remove, add), undo toast, reset dialog, edit dialog. short-stick (via `#btn-start-setup`) and one-bomb, 390 and 320; edit dialog on short-stick forced with `showModal()`, real event on one-bomb.
Result: every Thai/Latin text element paints Mitr (display roles: count-read, sec, go, add, undo, dialog titles, danger) or Sarabun (body roles: tagline, hint, limit and its `<b>`, dialog-body, name field); 0 failures on text elements across all four cells. Class-to-face map is identical across the two routes and both viewports; the only difference is `.ps-tagline`, which one-bomb does not render (absent, not a different face).
Symbol glyphs paint a fallback face and are listed, not counted as text: the minus in `.ps-step` (NotoSansThai-Regular; the plus paints Sarabun), animal emoji `.ps-e` (AppleColorEmoji), tick check (.SFNS-Bold), remove cross (ZapfDingbatsITC), the U+21BA arrow in the `.ps-sec` reset label (Mitr + .SFNS for the arrow glyph only), the plus in `.ps-add` (Mitr).
Must-red (short-stick 390, 16 text elements before/after): injected `:root{--font-display:Georgia,serif}`, `:root{--font-sans:Georgia,serif}` and `body{font-family:Georgia,serif}` together: computed family and painted face of every element identical, 0 flipped. Positive control: an appended `<div>` and a `<p style="font-family:var(--font-sans)">` both compute `Georgia, serif`, so the injections took effect.
