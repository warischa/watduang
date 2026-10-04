# Raw CDP capture recipe

Moved out of `DRIVER-PLAYBOOK.md` 2026-10-04 to keep that file under its 12KB budget. Read it when a run needs full-page captures, the rendered font face, or an overflow check from one script.

## Full-page capture + font family + overflow in one pass (raw CDP, 2026-10-04)

`driver.mjs` exposes no raw `send`, so `CSS.getPlatformFontsForNode` needs a small own WebSocket script
(Node's global `WebSocket`; `Page`/`Runtime`/`DOM`/`CSS.enable`). Recipe that worked:
- `Emulation.setDeviceMetricsOverride` (mobile true at 320, false at 1440) then `Emulation.setEmulatedMedia`
  `prefers-reduced-motion: reduce`, navigate, inject a `*{animation:none!important;transition:none!important}` style.
- SCROLL the whole page in 300px steps before `Page.captureScreenshot` (`captureBeyondViewport:true`):
  `loading="lazy"` art below the fold otherwise captures as blank white tiles at 320. Then assert
  `[...document.images].filter(i=>!i.complete||!i.naturalWidth)` is empty.
- Font: `DOM.querySelector` h1 (fall back h2) then `CSS.getPlatformFontsForNode`; reads the rendered face (Mitr-Bold etc.).
- Overflow: `documentElement.scrollWidth === clientWidth`, plus `innerWidth` echoed per capture.
- Over-150KB tall captures: slice with `magick -crop` into parts rather than dropping JPEG quality below ~60.
- Canvas `.dc.html` files open from `file://` and render fine headless; their pending-art dashed boxes are mockup-only.
