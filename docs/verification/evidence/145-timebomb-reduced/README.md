# gh#145 row 9 — timebomb boom screen, reduced motion vs normal motion (re-capture)

Re-captured 2026-09-03 after the original screenshots (session scratch dir) were wiped before
commit — see `docs/verification/timebomb-play-route-assess.md` row 9 for the downgrade history.
This directory holds the committed replacement plus the drawn-vs-blank evidence an adversarial
review flagged as missing from the first pass.

## Method

Real fuse walk, not a forced state: build `dist/`, serve on `http://localhost:5063`, drive two
separate headless Chrome instances (152.0.7977.65) sequentially over CDP `9231` — one launched
with `--force-prefers-reduced-motion`, one without — through `/game/timebomb/play/`: click
`#tb-begin` (setup→stage), click `#tb-start` (idle→ticking, arms the fuse), poll for `#tb-again`
every 2s up to 100s. Both button clicks were re-tried with a 900ms settle if the observable effect
(`#tb-start` / `#tb-fuse` presence) didn't land, per the arm-gate trap in the driver playbook.

## Results

| | Reduced-motion Chrome | Normal-motion Chrome |
|---|---|---|
| Fuse duration | 86.1s | 64.1s |
| Both inside `FUSE_MIN_MS`/`FUSE_MAX_MS` (30–90s, `src/games/timebomb.ts`) | yes | yes |
| `matchMedia('(prefers-reduced-motion: reduce)').matches` | `true` | `false` |
| Boom marker | `#tb-again` present, `#tb-stage` first `<p>` = "ตูม!" | same |
| 3x `#tb-canvas.toDataURL()` @700ms apart, all identical? | yes (frozen after one paint) | no (changes every sample) |

## Drawn-vs-blank (the gap the review flagged)

Method used: `getImageData` non-transparent pixel count on the boom-screen canvas, compared
against a freshly-created blank canvas of the same backing-store size (358x320 device px), plus a
direct string compare of `toDataURL()` against that blank canvas's own `toDataURL()`.

| | Reduced-motion Chrome | Normal-motion Chrome |
|---|---|---|
| Canvas backing store | 358 x 320 (114,560px) | 358 x 320 (114,560px) |
| Non-transparent pixels | 73,714 (64.4%) | 73,725 (64.4%) |
| `toDataURL()` equals a same-size blank canvas? | no | no |

Both Chromes paint roughly two-thirds of the backing store with non-transparent pixels and neither
`toDataURL()` matches a blank canvas of the same dimensions — the reduced-motion canvas is not a
cleared buffer, it drew the bomb once and then froze (motion suppressed, ADR-0046: reduce, not
remove). This closes the "painted-once vs never-repainted" gap the byte-identical triple-sample
alone could not.

## Screenshots

Both files below are **untracked by design** — `.gitignore` ignores `docs/verification/evidence/**/*.png`
because probe screenshots regenerate on every evidence run, and its carve-out is explicit that "a CDP
probe never qualifies: it can always emit JSON". They may be absent from a fresh clone; the numbers in
this file are the evidence, and re-running the walk regenerates the images.

- `boom-reduced-motion.png` — 390x844, reduced-motion Chrome (regenerable, not tracked)
- `boom-normal-motion.png` — 390x844, normal-motion Chrome (regenerable, not tracked)
