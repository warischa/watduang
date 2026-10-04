# gh#243 — home redesign, three directions (D / E / F)

2026-10-04. Render evidence for the six artboards under `design/` registered on canvas page-7.
Nothing here entered `public/` or `src/`.

| Direction | Artboards | ADR-0058 structure |
|---|---|---|
| D · Toy Shelf | `HomeShelfDesktop`, `HomeShelf320` | changed (full category rows) |
| E · Toy Box | `HomeToyBoxDesktop`, `HomeToyBox320` | kept |
| F · Night Arcade | `HomeNightArcadeDesktop`, `HomeNightArcade320` | kept |

The logs are the evidence: `render-probe.log.txt` (probe `probe-render.js`),
`reduced-motion.log.txt` (probe `probe-reduced-motion.js`), `thai-source.log.txt`
(`node docs/verification/evidence/gh243/thai-source-check.mjs design/Home<Name>.dc.html ...`, run
from the repo root). Full-page screenshots were captured and read in-session; per this repo's
ignore rule for probe PNGs they are not committed, and the canvases themselves are what the owner
picks from. Regenerate with `CDP_SHOT=<path>` on the same command.

## How they were captured

The worktree root served over http (`npx serve . -l 4877`) so that `design/*.dc.html` and their
relative `../public/art/*.webp` paths both resolve. Headless Chrome `--headless=new` with
`--remote-debugging-port`, driven by `scripts/cdp.mjs` with `CDP_WIDTH` (real emulated viewport,
`mobile: true`) and `CDP_HEIGHT` set to the measured document height, so each PNG is the whole page.
Each 320 artboard carries a `width=device-width` viewport meta; without it mobile emulation lays the
page out at 980px.

## Readings (one run each)

| Artboard | innerWidth | scrollWidth | height | croc-bite naturalWidth | pending art (broken, expected) |
|---|---|---|---|---|---|
| HomeShelfDesktop | 1440 | 1440 | 4289 | 361, 361 | 16 |
| HomeShelf320 | 320 | 320 | 4611 | 361, 361 | 16 |
| HomeToyBoxDesktop | 1440 | 1440 | 3398 | 361, 361 | 5 |
| HomeToyBox320 | 320 | 320 | 3130 | 361, 361 | 5 |
| HomeNightArcadeDesktop | 1440 | 1440 | 3339 | 361 x3 | 15 |
| HomeNightArcade320 | 320 | 320 | 3109 | 361 x3 | 9 |

- **No sideways scroll at 320**: `scrollWidth == 320` on all three. Must-red: a throwaway copy of a
  320 artboard with one 400px-wide block injected read `scrollWidth 400`. The roots carry no
  `overflow: hidden`, so the number is not masked. The verdict is `scrollWidth == rootWidth`; the
  log's `overflowingEls` field is informational only — on that same must-red it stayed `[]`,
  because mobile emulation widens `innerWidth` along with the content.
- **Reduced motion**: running animations (`document.getAnimations()`, playState `running`) per
  artboard, normal browser vs one launched with `--force-prefers-reduced-motion`
  (`matchMedia` false vs true): D 8→0 / 6→0, E 9→0 / 7→0, F 4→0 / 4→0 (desktop / 320). The normal
  counts equal the idle element counts each notes block states.
- **Invented Thai = 0**: every Thai text run above each artboard's notes block occurs verbatim in
  the copy sources (game modules' `names.th` / `tagline`, `popularGroup.heading`,
  `src/games/categories.ts`, `src/tools/manifest.ts`, the site chrome, the live home page). The same
  check over the notes blocks flagged the English lines that quote Thai, so it does report misses.

## Not covered

Only `croc-bite.webp` exists; the 13 other party renders are pending, so every other art slot shows
the dashed mockup-only box and no screenshot shows the full art set. Hover states and
real-device rendering were not captured. Motion cost figures (CSS bytes, element counts) are
read from the artboards, not profiled.

## Owner pick 2026-10-04: D · Toy Shelf

Re-captured after gh#242 landed the 13 other party images. The repo root was served over http, and
Chrome `--headless=new` was driven through CDP with prefers-reduced-motion so that every frame is still.
Every image was loaded eagerly before each full-page capture. Readings:

| Artboard | innerWidth | scrollWidth | height | images | broken |
|---|---|---|---|---|---|
| D 1440 | 1440 | 1440 | 4289 | 18 | 0 |
| D 320 | 320 | 320 | 4611 | 18 | 0 |
| E 1440 | 1440 | 1440 | 3398 | 7 | 0 |
| E 320 | 320 | 320 | 3130 | 7 | 0 |
| F 1440 | 1440 | 1440 | 3339 | 18 | 0 |
| F 320 | 320 | 320 | 3109 | 12 | 0 |

The owner picked **D** from `*-art.png` (popup, session 2026-10-04). D's two captures are committed as the
artifact the pick cites; they are quantized to 256 colours. The four E and F captures stay local.

The same popup ruled that copy already live on the home page (hero, badge, the two calls to action, the
how-to step, the FAQ, "ดูทั้งหมด →") counts as approved reuse, not placeholder.

The tiles still show the dashed "pending" frame behind each image. That is mockup-only styling from
before the art landed, not a missing file. Choosing D means amending ADR-0058, done in the same change
as gh#244's build, never left contradicting the page.
