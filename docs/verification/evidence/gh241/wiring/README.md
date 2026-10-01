# gh#241 — the picked art wired onto the croc-bite card

2026-10-01. The owner picked direction C, `IMG_02_003` (gh#241's last comment). This directory is the
wiring half: the values used, and the browser readings at HEAD 27563b2 (before) and the wired tree
(after). The render-and-grade half is `../README.md`.

## Values, as wired

- File: `images/gh241-ship/IMG_02_003.webp` copied to `public/art/croc-bite.webp`. Byte-identical
  (`shasum -a 256`: `96940eba72f7c7a013a2b0da0b7c6c23d17ae5b2d084c37405af0f2c21b55fe1` both, `cmp`
  rc 0), 29,038 bytes (`stat -f %z`; ceiling 61,440), `magick identify`: WEBP 361x320, `srgba`.
  `dist/art/croc-bite.webp` after `npm run build` carries the same hash.
- Artboard first (ADR-0033): `design/CatPartyPop.dc.html`, the artboard the page header names. The
  rule went into its helmet style block, and the img into its first specimen card as the first
  child above the h3 (the three specimen cards predate croc-bite, so the specimen borrows the one
  approved file; which game shows art is the module field, not the artboard):

      .game-card-art { display: block; width: 100%; height: 160px; object-fit: contain; object-position: center; }

- Page: `src/pages/c/[category].astro` carries that rule byte-identical, and renders, as the card's
  first child and only when the module sets `cardArt`:

      <img class="game-card-art" src="/art/croc-bite.webp" width="361" height="320" alt="" loading="lazy" decoding="async">

  (built output; the source derives `src` from `/art/${game.cardArt}`). `cardArt` is a new optional
  field on `GameModule` (`src/games/types.ts`), set on `src/games/croc-bite.ts` only.

## Browser readings

Method: `npm run build`, `npx serve@14 <dist copy> -l 4321`, Chrome 154.0.8037.59 launched with the
doc's flags `--headless --disable-gpu --no-sandbox --remote-debugging-port=9222
--user-data-dir=<scratch>` (no WebGL on this page, so `--disable-gpu` picks no code path here), one
probe at a time, torn down by pid, `lsof -ti:4321,9222` empty after. Instrument: `probe.mjs` here, a
standalone CDP client rather than `scripts/driver.mjs`, because driver.mjs emulates a mobile device
at every width and mobile emulation widens the layout viewport around overflow; this probe emulates
mobile below 768px only. Every width is a fresh navigation; `innerWidth` equals the asked width in
every row. The overflow detector was calibrated per width (a 150vw div injected, seen, page reloaded).

    node docs/verification/evidence/gh241/wiring/probe.mjs <label> <out dir>

Records: `base-27563b2.json` (the 27563b2 build), `wired.json` (this change), `eager-mutant.json`
(the lazy-load must-red below), and `summary.tsv` joining the first two per width.

| width | scrollWidth 27563b2 | scrollWidth wired | clientWidth | art box | card height |
|---|---|---|---|---|---|
| 320 | 320 | 320 | 320 | 236x160 | 331.34 |
| 390 | 390 | 390 | 390 | 306x160 | 331.34 |
| 1100 | 1302 | 1302 | 1100 | 252x160 | 331.34 |
| 1200 | 1302 | 1302 | 1200 | 252x160 | 331.34 |
| 1280 | 1302 | 1302 | 1280 | 252x160 | 331.34 |
| 1315 | 1320 | 1320 | 1315 | 252x160 | 331.34 |
| 1316 | 1320 | 1320 | 1316 | 252x160 | 331.34 |
| 1440 | 1440 | 1440 | 1440 | 252x160 | 331.34 |

The art loads: `naturalWidth` 361, `naturalHeight` 320 at every width (at 320 and 390 only once
scrolled to, see lazy-load). `object-fit` reads `contain`, `object-position` `50% 50%`; it is the
card's first element child and its bottom sits above the h3's top at every width. The arithmetic
in `../README.md` said 235 and 251 wide; the measured boxes are 1px wider (inferred: the 2.5px card
border renders as 2px at device scale 1).

**Sideways scroll from 1100 to 1323px is pre-existing, not this change.** Every scrollWidth above
is identical on 27563b2 and on the wired tree, and so are the edge widths (`edge-base-27563b2.json`,
`edge-wired.json`): 1099 clean (the rail is hidden below 1100), 1320 scrollWidth 1322, 1323
scrollWidth 1324 (a 1px scroll with no element past the edge by more than half a pixel), 1324 clean.
The overflowing element is the ad rail (`.ad-slot.ad-rail-slot`, right edge 1302 at 1100-1280, 1320
at 1316). Arithmetic that matches every reading: the body grid is at most 1280px border-box with 18px
inline padding, so its 1244px content box holds `940px 300px` tracks plus a 40px gap (1280px), and the
slot's 2px-rendered border sits outside its 300px, so the slot's right edge is `(W - 1280) / 2 + 1302`
for W of 1280 and up, past W until 1324. So 1280, one of the widths this ticket shoots, scrolls
sideways by 22px on both builds. Not fixed here; it predates gh#241.

A first attempt at `edge-wired.json` read the 27563b2 page and was discarded: `serve` stops listening
on SIGTERM but keeps answering an open keep-alive connection, so a Chrome left running across a
server swap kept talking to the old build (no art found on the "wired" run, and the old server's log
showed the requests). The kept run restarted Chrome as well; it finds the art at every width and the
wired server's log shows the page requests. The earlier runs are each attributable to their own
build: `wired.json` reads `loading="lazy"` on the img, `eager-mutant.json` reads no `loading`, and
`base-27563b2.json` ran on a fresh Chrome.

**Lazy-load, 320px.** At load the img sits 3195px below the fold: zero requests for it in
`Network.requestWillBeSent` (recorded from before navigation, cache disabled), zero `resource`
performance entries, `complete` false. After `scrollIntoView`: one request, `complete` true,
`naturalWidth` 361; the lazy leg of `edge-wired.json`, a separate Chrome, reads the same. Must-red: a copy of the wired build with only `loading="lazy"` stripped from that
img requests it before any scroll at the same 3195px (`eager-mutant.json`). At 1100px and wider the
card sits 797px below the fold and the image had loaded by the first read: lazy loading defers only
beyond Chrome's own load-in distance (inferred from Chrome's documented threshold, not measured).

**Looked at.** The probe writes a viewport shot and a 2x crop of the card at 320, 390 and 1280
(PNG, gitignored by the repo rule; re-run the probe to regenerate). Opened all six: the croc is
whole, uncropped, not stretched, centred over the title on the coral card. One visible
consequence at 1100px and wider: croc-bite shares its grid row with bangkok-drift, and the grid
stretches that card to the same 331px, leaving an empty band above its call to action. It goes away
once every card carries art (gh#242).

## Gates touched

- `scripts/public-orphan-check.mjs`: green with the field (66 scanned, 66 matched). Must-red: the
  `cardArt` line removed from the croc-bite module reds exactly `public/art/croc-bite.webp` (rc 1);
  restored, rc 0. No other file under `src/` spells that basename, which is what keeps this red live.
- `scripts/landing-claims-check.mjs`: new `scanCardArt`, holding every built category card to its
  module's `cardArt` in both directions (exactly one first-child `img.game-card-art`, the derived
  src, `loading="lazy"`, the file in `dist/art/`; none on a card that declares none). Selftest: a
  counted known-good plus seven calibrated reds, each the only problem reported. Real dist: 1 card
  with art, 16 with none. Must-red: the img block removed from the page, rebuilt, reds `card-art-missing`
  for croc-bite (rc 1); restored and rebuilt, rc 0.
- `src/pages/c/category.test.mjs`: the rule is byte-identical in the page and the artboard, and the
  src derives from the field. Must-red: 160px edited to 161px in the page reds that test alone.

## Not covered

- Real iOS WebKit, and any device scale above 1 (the 2x crops are captures scaled by CDP, not a 2x
  device).
- The pre-existing 1100-1323px sideways scroll is reported, not fixed.
- Whether `width`/`height` should move into the field: they are this one file's size, and the rule
  fixes both box dimensions, so they steer no layout today (gh#242's call when a second width lands).
