# gh#288 Phase 3b — two new canvas frames, rendered (2026-10-26)

| File | Board | Frames |
|---|---|---|
| `Gh288MotionSheet-1.jpg` | `design/Gh288MotionSheet.dc.html`, section 5 | breadcrumb on a band, owner pick 2026-10-26 (ink + underline): gold band rest and hover, punch band rest and hover; contrast caption |
| `Gh288FortunePages-1.jpg` | `design/Gh288FortunePages.dc.html`, row "fortune button hover / press — candidates (owner picks)" | candidates A, B, C; each draws primary and secondary at rest, hover, press, and the reduced-motion press |

- **Contrast** (WCAG 2.x, node, sRGB linearised at the 0.03928 knee): ink on gold 11.93, ink on punch 5.35, muted on punch 3.15 (the rejected value). Positive controls reproduced 2.23, 9.86 and 16.75 first.
- **Capture:** headless Chrome from `file://` at 1600px wide, after `document.fonts.ready`, own profile dir and port 9333. Each image is a crop of the region holding the new frames, not the whole board; JPEG quality 62. Both crops are under 2000px tall, so each is one slice.
- **Judged by eye:** the Thai is shaped (no ◌) and `innerText` holds no U+25CC. The only console error on both boards is the missing `./support.js`, which was already there.
- **Not covered:** the motion is drawn as still frames, not run; the owner has not yet picked A, B or C.
