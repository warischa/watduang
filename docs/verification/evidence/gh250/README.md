# gh#250 evidence — card art at 2x, served with a density srcset on the hero and popular row

Measured 2026-10-04 on this machine. Before tree: HEAD `0380a26`. After tree: the same plus this batch
(gh#249 and gh#250 build into one tree). Built with `npm run build`, served with `npx serve dist/ -l 4341`,
headless Chrome on remote-debugging port 9341, one fresh `--user-data-dir` per width. n=1 run per cell
(the page is static and the numbers are layout and file sizes, not timings).

## What shipped

- `cardArt2x: '<id>-2x.webp'` beside `cardArt` in all 14 `src/games/<id>.ts`, typed in `types.ts`.
- 14 files, `public/art/<id>-2x.webp`, flat (a subfolder would pass `public-orphan-check` only through
  its same-basename blind spot).
- `srcset="/art/<id>.webp 1x, /art/<id>-2x.webp 2x"` on the home hero (`FeaturedCard.astro`, its `art2x`
  threaded through `HomeHero.astro`) and the popular row (`ArtTile.astro`, `art2x` passed from the popular
  row in `index.astro`). **The party shelf gets no srcset** (coordinator ruling after the first measurement
  below): every shelf 1x file already clears twice its painted size, so a 2x candidate there only adds
  bytes. All 14 `-2x` files and `cardArt2x` fields stay, because popular membership can change. The
  category page is untouched.
- **Density descriptors, no `sizes`.** No file widths are stored anywhere, so a `w` descriptor would be
  an invented number, and `sizes` is read only together with `w` descriptors, so it would be inert. That
  is why the ticket's word "sizes" is not used.
- `scripts/validate-games.mjs`: `cardArt2x` required beside `cardArt`, equal to `<id>-2x.webp`, file
  exists, and refused without `cardArt`. `scripts/landing-claims-check.mjs`, new `scanHomeArtSrcset`:
  the hero img and every popular-row img carry the srcset their module's two fields give, the 2x file is
  in `dist/art/`, and a scan that judged zero images is itself a finding. Shelf tiles are outside the scan
  (its comment cites this README); a srcset planted on a shelf tile changes no verdict.

## Positive control: regenerate the 1x from its master (`control.tsv`)

`make_2x.py control` runs each master through the recorded recipe (`gh241/make_ship.py`, black points
from `gh242/grade-ship.jsonl`, 3 for `IMG_02_003`). All 14 regenerated 1x files are byte-identical to the
shipped `public/art/<id>.webp`: same dimensions, same bytes, same sha256. So no crop had to be derived.
Must-red for the compare: black point 0 on `IMG_03_001` gives a different sha256 (907c5156… against
3e94c367… for the shipped `timebomb.webp`).

## The 2x files (`q-table.tsv`, `grade-2x.txt`)

Size rule: twice the 1x (height 640), raised where a home slot needs more: file width >= 2 x the widest
rendered img box of any slot the game appears in (hero 423.2 CSS px, popular row 353.3, shelf 133.7,
measured at 1440). `q` is the highest value from 88 down whose output fits 61,440 B, the unchanged cap in
`public-orphan-check.mjs`.

| File | Master | Dims | q | Bytes |
|---|---|---|---|---|
| croc-bite-2x | IMG_02_003 | 847x751 | 71 | 61,436 |
| timebomb-2x | IMG_03_001 | 566x640 | 88 | 34,500 |
| short-stick-2x | IMG_03_002 | 648x640 | 88 | 56,074 |
| freeze-tap-2x | IMG_03_003 | 702x640 | 88 | 53,758 |
| cannon-flag-2x | IMG_03_004 | 763x640 | 88 | 53,604 |
| power-meter-2x | IMG_03_005 | 947x640 | 86 | 60,860 |
| dice-loser-2x | IMG_03_006 | 707x735 | 88 | 53,050 |
| how-close-is-near-2x | IMG_03_007 | 707x729 | 87 | 59,518 |
| pinocchio-luck-2x | IMG_03_008 | 897x640 | 88 | 42,404 |
| cursed-number-2x | IMG_03_009 | 734x640 | 88 | 38,690 |
| wire-snip-panic-2x | IMG_03_010 | 528x640 | 88 | 49,346 |
| zero-trigger-2x | IMG_03_011 | 561x640 | 88 | 44,526 |
| one-bomb-2x | IMG_03_012 | 780x640 | 88 | 50,242 |
| bangkok-drift-2x | IMG_03_013 | 937x640 | 79 | 60,088 |

q range 71 to 88. Largest file 61,436 B (4 B under the cap), total 718,096 B. All 14 grade `srgba`, haze
outside the solid mask 0, four corners alpha 0, 21% to 47% fully transparent. The lowest-q file,
croc-bite at q71, was opened next to its 1x scaled up to the same size
(`compare-croc-bite-1x-up-vs-2x-q71.jpg`, left 1x, right 2x, on the coral card ground): the 2x is visibly
sharper on the teeth and outline, and shows no blocking or ringing at q71.

## Natural width against rendered width at DPR 2 (`dpr-probe.mjs`, `summarize.mjs`)

`scripts/driver.mjs` pins `deviceScaleFactor` to 1, so the probe opens its own tab and sets
`Emulation.setDeviceMetricsOverride` with DPR 2 before navigating, so the browser picks the candidate for
that density. Two readings of "rendered width", both in `summary-*-dpr2.txt`: **box** (the img's box, the
ticket's reading, stricter) and **painted** (where `object-fit: contain` letterboxes the image inside a
taller box).

**`naturalWidth` is not the file width under a density srcset.** For an 847 px file chosen at 2x,
`img.naturalWidth` reads 423 (pixels divided by density). The ticket's "natural width >= 2 x rendered"
read literally off `naturalWidth` could never pass for a 2x file. The probe reads the file's own pixel
width from a plain `Image()` loaded from `currentSrc` (`fileSize`) and compares that. The `dpr2-before-*` rows predate that field (the first probe
version); with no srcset on the before build `naturalWidth` is the file width, and `summarize.mjs` falls
back to it.

Min file width / rendered width, DPR 2, every image after a full scroll (the criterion is >= 2.0). The
shelf column "after" is the 1x file, because the shelf carries no srcset:

| Slot | n | 320 before | 320 after | 1440 before | 1440 after |
|---|---|---|---|---|---|
| hero | 1 | 1.50 (fail) | 3.53 | 0.85 (fail) | 2.00 |
| popular row | 3 | 3.08 | 7.07 | 0.87 (fail 3) | 2.00 |
| party shelf, box / painted | 14 | 2.24 / 3.06 | same, 1x file | 1.97 / 2.70 | same, 1x file |
| category card, box / painted | 14 | 1.12 / 2.00 | 1.12 / 2.00 (untouched) | 1.05 / 2.00 | 1.05 / 2.00 (untouched) |

After the change: hero and popular, 4 of 4 images clear 2.00 at both widths (the `currentSrc` at DPR 2
is the `-2x` file for all 4). The shelf clears 2.00 on the painted reading for all 14 (min 2.70) and on
the box reading for 13 of 14: **wire-snip-panic is 264 px against 267.4 needed at 1440 (1.975)**, a 1.3 %
miss on the box reading only, left as is because its painted width (97.8 px, height-limited) is 2.70 x.
Before: 5 failures on painted, 6 on box (per-image rows in `summary-before-dpr2.txt`). The instrument went
red on the unfixed build, so it can fail. The first measurement, with the shelf on 2x as well, is kept as
`summary-shelf2x-dpr2.txt` and `*-shelf2x-*.json` (shelf min 3.95 box): superseded, only the weight
comparison below uses it.

**The hero's 2.00 at 1440 is a tight fit by arithmetic, not by luck.** The probe reads
`getBoundingClientRect`, which includes the bob animation's rotation (box 422.8 to 423.2 across runs); the
layout width of the `.toy` is 420 CSS px, so the 847 px file is 2.02 x layout. Croc-bite is also the file
at q71 against the cap, so widening it costs quality: left as is.

**Category pages: the claim holds on the painted reading and not on the box reading.** A category card's
img box is 236 x 160 (320) or 252 x 160 (1440) with `object-fit: contain`; the 320 px-tall 1x file is
height-limited and paints at 160 px tall, so its file/painted ratio is exactly 2.000 for all 14 at both
widths (power-meter, the widest at 473x320, is width-limited at 320 and still 2.000). On the box reading
13 of 14 fail at 320 and 14 of 14 at 1440, because the box is wider than the painted image; asking the file
to cover a letterbox would make it larger than the picture, so that reading is not the right one there.
The ratio sits exactly on the threshold by construction (320 = 2 x 160), so any change to that 160 px
height breaks it, and this evidence is what to re-measure then. `[category].astro` was not edited.

## Home weight

Bytes the page requests (Resource Timing `encodedBodySize` plus the document), full scroll. DPR 1 numbers
from the `gh244/run-weight.sh` copy; DPR 2 numbers from `dpr-probe.mjs`. "Shelf on 2x" is the superseded
first build, kept to show what dropping the shelf srcset saves.

| DPR | Width | Before (19 req) | After (hero + popular 2x) | Delta | Shelf on 2x (superseded) |
|---|---|---|---|---|---|
| 1 | 1440 | 335,787 | 335,874 | +87 | 335,957 |
| 1 | 320 | 335,787 | 335,874 | +87 | 335,957 |
| 2 | 1440 | 335,787 | 552,282 (23 req) | +216,495 | 759,145 |
| 2 | 320 | 335,787 | 552,282 (23 req) | +216,495 | 759,145 |

At DPR 1 the 2x candidates are never requested: the delta is the srcset text in the document. At DPR 2
four 2x files are fetched on top of their 1x (croc-bite 61,436 + how-close-is-near 59,518 + dice-loser
53,050 + pinocchio-luck 42,404 = 216,408 B, plus 87 B of document) and the 1x files stay in the page for
the shelf, so the request count goes 19 to 23. Dropping the shelf srcset saves 206,863 B at DPR 2 against the
first build. Every figure is full scroll. The gh#244 after-number the ticket quotes (336,027 B) is from
the earlier build; this table's before is this session's own measurement at `0380a26`.
Raw: `weight-{before,after,shelf2x}-{320,1440}.json` (DPR 1), `dpr2-{before,after,shelf2x}-{320,1440}.json` (DPR 2).

## Gates (red before green)

- `validate-games.mjs --selftest`: five new known-bad cases (`cardArt2x` missing beside `cardArt`, not a
  string, wrong name, file missing, declared without `cardArt`). Written before the rule: the selftest
  failed with `cardArt2x (missing beside cardArt): known-bad fixture must report at least one violation`;
  green after. On the real tree, removing `cardArt2x` from `timebomb.ts` (restored from a copy, diff
  confirmed) gives `validate-games: 1 violation(s) … cardArt2x is required beside cardArt` and
  `public-orphan-check` reports `public/art/timebomb-2x.webp ships with no referrer`.
- `landing-claims-check.mjs`: with the new scans in and the fields not yet declared, the real run failed
  (19 problems, 18 of them `declares cardArt but no cardArt2x`, from the first version of the scan that judged
  every home art img); the selftest's known-good fixture failed
  the same way. After the shelf was dropped, the scan was rewritten to judge the hero and popular imgs
  only (by their `a.featured` and `data-variant="popular"` anchors). Calibrated reds, each the only problem
  its scan reports, run once for a hero img and once for a popular img: srcset dropped, `w` descriptor, 2x
  candidate naming another file; also 2x file missing (hero and popular), and a home page with no hero or
  popular art (a zero-judged scan). A srcset planted on a shelf tile changes no verdict, and the known-good
  fixture's shelf tiles carry none. On scratch copies of the real `dist/`: `art/dice-loser-2x.webp` deleted
  gives `dist/art/dice-loser-2x.webp does not exist — the popular 2x candidate 404s`; the hero's srcset
  stripped gives `hero img /art/croc-bite.webp srcset is null`.
- Real tree green: `validate-games` 17 games OK; `public-orphan-check` 93 files, 0 orphans, 0 size-ceiling
  breaks; `landing-claims-check` 4 hero and popular art imgs carrying their density srcset.

## Not covered

DPR 2 is emulated, not a physical retina panel. DPR 3 phones fetch the same 2x candidate and are not
measured. Only croc-bite was opened, on the coral ground; the other 13 files were graded
numerically (`grade-2x.txt`) and not opened. Ten of the 14 `-2x` files (the shelf-only games) are served
nowhere today and cost deploy bytes only; they are kept so the popular row can change without a re-render.

## Addendum 2026-10-04: two fail-opens closed in `scripts/landing-claims-check.mjs`

An adversarial review reproduced both on a copy of the real `dist/`, each exiting 0 with the normal OK line.

- The hero priority hint could move off the hero. With `fetchpriority="high"` removed from the img inside
  `a.featured` and set on the first popular tile's lazy img, the old scan saw one marked tag, an `/art/` src and
  the value "high", and passed while the LCP image lost its hint. `scanHeroPriority` now requires the one
  marked tag to be the hero img (`hero-priority-target`), and reds when no `a.featured` img exists
  (`hero-priority-no-hero`).
- The srcset scan could skip an img. With the hero `src` changed to its 2x file and no `srcset`, the old scan
  met `if (!game) continue;`, judged 3 imgs instead of 4, and only an all-zero count was red. A hero or popular
  img whose src is no manifest `cardArt` is now `home-art-src`, and judged plus flagged must equal the number
  of hero and popular anchors counted from their opening tags (`home-art-count`).
- Mutations on scratch copies of the real `dist/`: hint moved to the first popular tile gives `the one
  fetchpriority tag is not the hero img inside a.featured`; hero src set to the 2x file gives `hero img src is
  "/art/croc-bite-2x.webp", which is no manifest cardArt`. The unmutated `dist/` stays green (4 imgs judged).
- Self-test must-red: with the hero-binding test forced off the moved-hint case reports 0 problems; with the
  silent skip restored the src cases report `home-art-count` or nothing instead of `home-art-src`; with the
  count check forced off the swallowed-anchor case reports 0 problems.

Addendum 2026-10-04 (round 2): the hero and popular set is bound to the manifest, not to the page's own selectors.
`scanHomeArtSrcset` requires exactly one `a.featured` naming `featuredGame` and popular tiles naming `popularGames`
in order (`home-art-hero-set`, `home-art-popular-set`), resolves each card's game from its anchor href, and requires
the img src to be that game's `cardArt` (`home-art-src`); `scanHeroPriority` reds on more than one `a.featured`
(`hero-priority-multi-hero`). Scratch-copy mutants on the real `dist/`, each rc 1: `data-variant` renamed on all
popular tiles, all popular tiles deleted, a second `a.featured`, and the hero img swapped for another game's
self-consistent src and srcset. The real `dist/` is rc 0. Self-test must-red: each of the hero-set, popular-set,
src and multi-hero tests forced off reds a named case.
