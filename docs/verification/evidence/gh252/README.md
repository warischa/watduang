# gh#252 evidence: Mitr self-hosted, headings render as the canvases draw them

Date 2026-10-04, base commit `0380a26`, this machine (macOS, Chrome headless, no system Mitr: `fc-list | grep -ic mitr` printed 0).
All browser runs: `npm run build` in the worktree, `npx serve <dist> -l 4351`, Chrome `--remote-debugging-port=9351`,
a fresh `--user-data-dir` per run. Before = the unchanged build copied aside; after = the final build.

## Source files and licence

Downloaded for this ticket only, to a temp directory outside `public/`: `Mitr-Regular.ttf` 222,416 B, `Mitr-Medium.ttf`
222,116 B, `Mitr-SemiBold.ttf` 225,796 B, `Mitr-Bold.ttf` 224,432 B (all four byte sizes match the HEAD sizes), `OFL.txt`.
`OFL.txt` is 4,382 B, not the 1,955 B the HEAD request gave: the HEAD size was the gzip-encoded size (`gzip -c OFL.txt | wc -c`
printed 1,963). It opens "Copyright 2015 The Mitr Project Authors" and carries the OFL 1.1 text; the shipped Sarabun licence is 4,387 B.

## Subset command (verbatim, once per weight and format)

Codepoints = the shipped Sarabun cmap read back with fontTools (191 codepoints: `20-7E, A0, B7, E01-E3A, E3F-E5B, 2013-2014, 2018-2019, 201C-201D, 2026`).

    ~/miniconda3/bin/pyftsubset Mitr-<Weight>.ttf --unicodes='U+0020-007E,U+00A0,U+00B7,U+0E01-0E3A,U+0E3F-0E5B,U+2013-2014,U+2018-2019,U+201C-201D,U+2026' --layout-features='*' --name-IDs='*' --notdef-outline --output-file=public/fonts/mitr-<weight>-subset.ttf
    (same, plus --flavor=woff2 and --output-file=public/fonts/mitr-<weight>-subset.woff2)

Read back after: every one of the 8 files maps exactly the 191 codepoints (no missing, no extra), `OS/2` weight 400/500/600/700,
GSUB and GPOS kept. Shipped: woff2 26,320 / 25,772 / 26,068 / 25,112 B and ttf 70,616 / 68,756 / 70,120 / 70,792 B
(regular / medium / semibold / bold), plus `public/fonts/mitr-OFL.txt` 4,382 B.

## Which weights (box: weights actually used)

`mitr-weight-probe.mjs` via `scripts/driver.mjs`: every element of every built page (26, enumerated from `dist/`) whose COMPUTED
font-family starts with Mitr, grouped by computed font-weight, at 320 and 1440. Painted = own text node, laid out.

| width | 400 | 500 | 600 | 700 | other |
|---|---|---|---|---|---|
| 1440 painted | 7 | 35 | 61 | 46 | 0 |
| 320 painted | 7 | 31 | 63 | 44 | 0 |

Per-page counts are in `weights-before-<w>.json` and `weights-after-<w>.json` (the two unions are identical). No 200/300 and
no 800+, so all four downloaded weights are hosted and nothing maps to 700. Ceiling: the census reads each page once in its
initial state; a weight set only in a later state is not seen. 13 pages (the WebGL play routes, 404) paint no Mitr at all in
the first state; the headless Chrome has no GPU, so those routes show their no-3D fallback.

## Box 2: the browser's own platform-fonts read (`platform-fonts-probe.mjs`, CDP `CSS.getPlatformFontsForNode`)

| page, width | before | after |
|---|---|---|
| `/` h1, 1440 and 320 | Noto Sans Thai, custom=false | Mitr, custom=true |
| `/c/party/` h1, 1440 and 320 | Noto Sans Thai, custom=false | Mitr SemiBold, custom=true |
| `/c/fortune/` h1, 1440 and 320 | Noto Sans Thai, custom=false | Mitr SemiBold, custom=true |

The home h1 computes to weight 700 and the category h1 to 600 (`h1Computed` in `fonts-after-*.json`). The engine reports the font's
name record, and a RIBBI family names its Regular and Bold faces plain "Mitr", so "Mitr" on the home h1 is the Bold face. n=1 per cell, deterministic.

## Gate (box 1)

`node scripts/font-coverage-check.mjs` on the built dist: green, 12 faces read, all 72 reachable Thai codepoints present in each.
Must-red: a scratch copy of dist with `fonts/mitr-semibold-subset.woff2` deleted exits 1 with
`expected font file mitr-semibold-subset.woff2 is missing from shipped fonts`. `node --test scripts/font-coverage.test.mjs`: 32/32 green.
Fixture red: with the Mitr stems removed from `EXPECTED_STEMS`, three tests (the vanished-inventory test, the new Mitr-hole test, the
checkInventory test) go red; restored by file hash.

## Per-page font bytes (box 3), `font-requests-probe.mjs`, cache disabled, all 26 pages, wire bytes of `/fonts/` requests

| page | before | after | delta | faces after |
|---|---|---|---|---|
| `/` | 33,085 | 84,845 | +51,760 | mitr 600+700, sarabun 400+700 |
| `/c/party/`, `/c/fortune/`, `/tools/`, `/game/siamsi/` | 16,466 | 94,288 | +77,822 | mitr 500+600+700, sarabun 400 |
| `/tool/wheel/` | 33,085 | 110,907 | +77,822 | mitr 500+600+700, sarabun 400+700 |
| `/tool/number/` | 33,085 | 84,845 | +51,760 | mitr 600+700, sarabun 400+700 |

Identical at 320 and 1440. Home through `docs/verification/evidence/gh244/run-weight.sh`'s probe (`home-weight-*.json`, whole-page request bytes,
fresh Chrome, n=1 per width): first load 335,787 -> 387,161 B at 1440 and 230,767 -> 282,141 B at 320 (+51,374 B:
the two Mitr faces, 600 and 700, 51,180 B, plus about 194 B of changed CSS and markup); full scroll 335,787 -> 387,161 B. Without the preload the same
home is 387,066 B: the preload adds ~95 B of markup, no font bytes on a page that uses both faces.

## CLS (box 4): `ui-audit-probe.mjs` from the 2026-10-04 audit, one fresh Chrome per run, n=3 per cell (`cls-*.json`)

On localhost the font arrives before first paint, so this probe cannot see a late swap. `swap-probe.mjs` adds the real-network case
(Slow-4G profile: 150 ms, 1.6 Mbit/s, every request throttled; n=1 per cell).

| page, width | audit CLS before | after, no preload | after, preload | slow-4G before | slow-4G no preload | slow-4G preload |
|---|---|---|---|---|---|---|
| `/` 1440 | 0.0008 | 0.0027 | 0.0008 / 0 / 0 | 0.0008 | 0.0015 | 0.0015 |
| `/c/party/` 1440 | 0.0027 | 0.0032 | 0.0027 / 0 / 0 | 0.0027 | 0.0028 | 0.0028 |
| `/c/fortune/` 1440 | 0.0027 | 0.0032 | 0.0027 / 0.0027 / 0 | 0.0027 | 0.0028 | 0.0028 |
| `/game/siamsi/` 1440 | 0.2825 | 0.2841 / 0.2835 / 0.2835 | 0.2825 | 0.2834 | 0.2840 | 0.2838 |
| `/tool/wheel/` 1440 | 0.0030 | 0.0029 | 0.0031 / 0 / 0 | 0.0030 | 0.0030 | 0.0030 |
| `/` 320 | 0 | 0 | 0 | 0.0025 | 0.0036 | 0.0024 |
| `/c/party/` 320 | 0 | 0 | 0 | 0 | 0.0246 | 0 |
| `/c/fortune/` 320 | 0 | 0 | 0 | 0 | 0.0001 | 0 |
| `/game/siamsi/` 320 | 0 | 0 | 0 | 0.6384 | 0.6384 | 0.6384 |
| `/tool/wheel/` 320 | 0 | 0 | 0 | 0 | 0.0282 | 0.0282 |

Reading it: the swap adds shift only when the font lands late, at most 0.028, under the 0.1 "good" line. Preloading the 600 and 700
faces removes it on `/` and `/c/party/`. `/tool/wheel/` at 320 keeps 0.0282: the Mitr text there that shifts is the weight-500
spin and reset buttons (`weights-after-320.json`, sample for 500), and 500 is not preloaded. Siamsi's 0.28 and 0.64 are identical
with and without Mitr: pre-existing, the how-to jump the audit README recorded.

## Decision: preload

`src/layouts/Base.astro` preloads `mitr-semibold-subset.woff2` and `mitr-bold-subset.woff2`, the two faces the home h1, the chrome
and the category headings paint (home 600/700, categories 600/700). Cost, measured with `font-requests-probe.mjs`: `Base.astro` serves all
26 pages, and 13 of them (the play routes and 404) paint no Mitr in their first state, so they now pull 51,760 B of Mitr they do not
paint. That is the trade. To revert: delete the two `<link rel="preload">` lines in `Base.astro`; CLS returns to the "no preload" columns.
A 500 preload was not added: +25,772 B on every page for the one 0.028 residual on one page at one width.

## gh#120 (wheel and number comments)

Both comments said "the site ships no @font-face", false since gh#202. Judged from `swap-probe.mjs`: a Mitr swap does not reopen the
state-driven reflow. Ad slot y, from the same page in two font states (Mitr loaded, Mitr blocked), initial state then after the interaction:

| page, width | Mitr blocked: before / after result | Mitr loaded (1.5 s late): before / after result |
|---|---|---|
| `/tool/wheel/` 1440 | 1873 / 1873 | 1878 / 1878 |
| `/tool/wheel/` 320 | 1652 / 1652 | 1657 / 1657 |
| `/tool/number/` 1440 | 589 / 589 | 591 / 591 |
| `/tool/number/` 320 | 697 / 697 | 699 / 699 |

Within a font state the slot does not move when a result appears; the swap moves it +5 px (wheel) and +2 px (number) once, at load.
The wheel result bar stays 60 px with a long name in the list. Both comments now say it was confirmed while no face was hosted
and give this reading. ADR-0044 carries a dated note (its "ships no fonts" fact is no longer true).

## Fast lane

`SKIP_EXPENSIVE=1 bash scripts/run-workflow-gates.sh` on the final tree: declared=48 executed=44 failed=0 not-executed=2 not-runnable-here=2;
exit 2 by design. The two not-executed steps are the browser-probe lane (gh#122) and the WebGL pixel readback (ADR-0051), both
skipped by `SKIP_EXPENSIVE=1`. Passed: the Thai subset gate, the orphan-binary gate, the live-region bound gate, the thai-comments and
line-citation gates, unit tests, Astro check, build, smoke.

## Files here

`run.sh`, `run-swap.sh` (drivers), `mitr-weight-probe.mjs`, `platform-fonts-probe.mjs`, `swap-probe.mjs`, `font-requests-probe.mjs`
(probes), `*.json` (raw output; `swap-*.json` are arrays of every run).
