# gh#244 evidence — the home page built from canvas D

Measured 2026-10-04 on this machine, against `npm run build` served by `npx serve dist/ -l 4321`.
Headless Chrome was driven through `scripts/driver.mjs`. The before build is `b5f5f42`. The after
build is the gh#244 working tree on top of `bc7b0e5` (gh#246, the palette).

## Box 5 — home page weight

Instrument: `home-weight-probe.mjs`, run by `run-weight.sh`, with one fresh Chrome profile per width
so nothing is served from cache (`cached=0` on every row). **It counts the bytes the page requests
in a real browser** (the document plus every Resource Timing entry), as `encodedBodySize`, which is
body bytes on the wire with headers excluded. It does not count bytes in `dist/`. "First load" is
after the load event plus a settle, with no scroll. "Full scroll" is after scrolling to the bottom.

| Width | Moment | Before: requests / bytes | After: requests / bytes | Delta |
|---|---|---|---|---|
| 1440 | first load | 5 / 40,523 | 19 / 336,032 | +295,509 |
| 1440 | full scroll | 5 / 40,523 | 19 / 336,032 | +295,509 |
| 320 | first load | 5 / 40,523 | 14 / 231,012 | +190,489 |
| 320 | full scroll | 5 / 40,523 | 19 / 336,032 | +295,509 |

The increase is the card art: 14 unique webp files, 294,908 bytes at full scroll. The three popular
tiles reuse shelf files, so they add no requests. At 320 the first load fetches 9 of the 14, and
the rest arrive on scroll. That is lazy loading working, and it is also the evidence that the
instrument tells the two moments apart. At 1440 Chrome's lazy-load distance covers the whole page,
so every file loads at once. Raw rows: `weight-before-*.json`, `weight-after-*.json`.

## Box 4 — real browser at 320, reduced motion and desktop

`scripts/home-page-probe.mjs` is the committed CI probe that replaces `home-direction-c-probe.mjs`.
It ran in both legs, and `ci-probes-verdict.mjs` graded both `ok`. Outputs:
`probe-home-page-normal.json` and `probe-home-page-reduced.json`.

- **Widths 320, 390, 768, 1024, 1440.** Each reported the `innerWidth` it was asked for. No width
  scrolls sideways, and the overflow detector went red-then-clean at every width, so it is calibrated.
- **Ad slot.** One slot and no rail at every width. It is 256px border-inclusive at desktop
  (250 + 2×3) and 106px at or below 1099px (100 + 2×3), as the canvas draws it.
- **Shelf columns.** The first row holds 7 at 1440, 4 at 768 and 1024, and 2 at 320 and 390.
- **Art.** 18 images after a full scroll at 320, 0 broken. The shelf carries one image per tile.
- **Motion.** 8 decorated elements matched at every width. Under normal motion, animation is
  running. Under `--force-prefers-reduced-motion`, every one reports `animation-name: none` and
  `getAnimations()` is empty.

**Must-red for the probe** (one build, three mutations): a second ad slot, a 6-column shelf, and
the reduced-motion `animation: none` swapped for a no-op. `oneAdSlotNoRail`, `shelfColumnsAsDrawn`
and the reduced-motion verdict all went false, and both legs exited 1. The page was then restored
and rebuilt.

Captures, full page after every lazy image settled: `home-1440-normal.png`, `home-768-normal.png`,
`home-320-normal.png`. Compared by eye with `../gh243/D-shelf-1440-art.png` and `D-shelf-320-art.png`:

- Layout, colours, sizes and art placement match.
- The top bar and footer are still the shared chrome. Canvas D's chrome is gh#247.
- Headings render in the fallback face, because Mitr is not hosted (`tokens.css`, gh#202). The
  canvas captures loaded Mitr from Google Fonts.

## Box 3 — `landing-claims-check`

Green on the after build. Must-red: rewriting the built home page's `/c/fortune/` link reds it with
"no built `<a href="/c/fortune/">`". The original file restored it to green.

## Box 2 — no unapproved Thai

The page's Thai strings are the hero badge, headline, lead and call to action, "ดูทั้งหมด →",
"ช่องโฆษณา", and the FAQ heading with its three questions and answers. Every one was on the live
page before. Everything else is interpolated from the manifests. Dropped with the canvas: the
secondary call to action and the how-to section.
