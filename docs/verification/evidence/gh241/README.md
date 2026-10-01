# gh#241 — game-card art style pilot: croc-bite in three directions

2026-10-01. Render-and-grade half, per gh#241's comments (owner ruling: pilot game croc-bite, three
styles, the owner picks one). **Owner pick 2026-10-01: direction C, `IMG_02_003`.** Nothing in this
render-and-grade half entered `public/` or `src/`; the wiring that followed (the picked webp as
`public/art/croc-bite.webp` on the croc-bite card) and its browser readings are in `wiring/README.md`.
Registry entries: `images/IMAGES.md`, section "Game-card art pilot — croc-bite, three styles (gh#241)",
ids `IMG_02_001` (A), `IMG_02_002` (B), `IMG_02_003` (C).

## The sheet to decide on

`compare-abc.png` — each ship derivative composited onto `#f89880` (the party accent,
`--accent-punch`), object-fit contain and centred, in a box the size of the proposed card art slot.
Top row 502x320 (the 251x160 CSS px slot on a 2x screen, the density the derivative is cut for), bottom
row 251x160 (1x). Labels sit below each tile, outside the art. Rebuild: `python3
docs/verification/evidence/gh241/make_compare.py <work dir> docs/verification/evidence/gh241/compare-abc.png`.

## The three directions

| | Direction | What defines it | What came back |
|---|---|---|---|
| A | Flat editorial | the shipped site style: even ink outline, flat areas, at most two flat shade tones, brand palette plus a muted croc green `#4caf6e` | low, lying pose; cream rounded teeth; rose mouth; gold eyes; one hard-edged shade tone |
| B | Bold sticker pop | loud mascot: thick chunky outline, saturated flat fills, exaggerated proportions, big expression | upright pose with tail; square white teeth; huge white eyes; mint and saturated green |
| C | Soft 3D toy | rounded vinyl toy, soft volumetric shading, the live route's material colours (`#27ae60` skin) | glossy vinyl, specular teeth and eyes, no outline, no shadow under the feet |

How far apart A and B are, since both are flat ink-outline art (an uncalibrated proxy, informational
only): the median width of the ink stroke on the outer silhouette is 10.0 px on A's trimmed master
(1.15% of its 872 px height) and 16.1 px on B's (1.57% of 1027 px); over every ink stroke the medians are
8.5 px and 10.0 px, both 0.97% of height. So B's thick line lives on the silhouette; inside, the two draw
alike, and their difference is mostly saturation, proportion and expression. C is a different medium:
ink-coloured pixels are 4.5% of its subject (pupils, nostrils), against 18.4% (A) and 26.3% (B).

## Grading — every number from `grade.py` or `stat -f %z`, run 2026-10-01

`grade.py` fields: `transparent` = fraction of pixels with alpha exactly 0; `haze outside` = pixels with
alpha 1-25 lying outside the alpha >= 26 mask dilated by a radius-4 Euclidean disk (scipy, not
ImageMagick's `Disk:4`; the gh#102 method in `images/IMAGES.md`, whose "solid" threshold was not
recorded — alpha >= 26 is the reading consistent with its 1-25 band). Corners are TL TR BL BR alpha.

| | A `IMG_02_001` | B `IMG_02_002` | C `IMG_02_003` |
|---|---|---|---|
| master sha256 | `6c1183ea…db6272` | `77f6b57b…482e09` | `05d722e0…646ed9` |
| master size, channels | 1254x1254, srgba | 1254x1254, srgba | 1254x1254, srgba |
| transparent, raw | 56.01% | 51.89% | 51.35% |
| haze outside, raw (alpha values) | 1583 (1 x1582, 2 x1) | 407 (1 x405, 2 x2) | 2761 (1 x2632, 2 x120, 3 x9) |
| level-remap black point | 2 | 2 | 3 |
| trimmed size, transparent | 1110x872, 29.06% | 1117x1027, 34.46% | 1118x991, 31.91% |
| trimmed haze outside, corners | 0, 0 0 0 0 | 0, 0 0 0 0 | 0, 0 0 0 0 |
| ship webp size | 407x320 | 348x320 | 361x320 |
| ship bytes (`stat -f %z`) | 34,962 | 31,438 | 29,038 |
| ship (decoded) haze outside, corners | 0, 0 0 0 0 | 0, 0 0 0 0 | 0, 0 0 0 0 |
| ship transparent, channels | 28.65%, srgba | 33.86%, srgba | 31.29%, srgba |

Full master hashes are in the registry (`sha256_master`). Ship webp sha256: A `c543b8b2…f7ff61`, B
`bb820fba…306145`, C `96940eba…b55fe1`. The 60 KB ceiling: `scripts/public-orphan-check.mjs` fails a
raster under `public/art/` when `size > 60 * 1024`, so at most 61,440 bytes passes; all three are under
half of it.

**The instrument, calibrated.** Positive control: `grade.py` on gh#102's ten (`IMG_01_001`-`010`)
returns fully transparent 36.68%-46.51% (registry: 36.7%-46.5%), `IMG_01_002` bottom corners 66 and 76
(registry: 66 and 76), haze outside 0 on all ten (registry: 0). Its band count is 510-1408 against the
registry's 483-1349, so the band definition is not byte-identical to gh#102's; haze outside is.
Must-red: an opaque flatten of `IMG_01_001` reads `srgb`, 0% transparent; the same file with one alpha-10
pixel planted 350 px from the subject reads haze outside 1.

**Every raw render failed haze; none was re-rendered for it.** The haze was alpha 1-3, scattered (A,
up to 189 px out) or a faint ring (C, median 5.4 px outside the silhouette). The fix is the remap
`docs/agents/assets.md` prescribes, never `-threshold`: `make_ship.py` maps alpha <= black point to 0 and
stretches the rest linearly, with the black point at the highest haze alpha found. No render came back
opaque, so the chroma-key fallback was not used. Had it been: `chroma_key.sh`'s despill
(`G = min(G, max(R, B))`) assumes no green-dominant subject colour, and would have turned this green
croc grey-teal; a green subject needs a magenta key and a despill on that channel instead.

**Looked at, not summarised.** Each trimmed master flattened onto `#f89880` and onto `#1a1a1a`, whole
and with edges enlarged 4x, and the three ship webps flattened onto `#1a1a1a`: no fringe or halo, no
painted checkerboard, no text or glyphs, no bottle, can or glass, no human, hand or human face; C has no
contact shadow or floor under the feet. The webp round trip keeps alpha exact (max difference 0 against
the pre-encode PNG, all three).

## How each was made

One separate command per render, from a scratch directory (`cwd` outside the repo, so Codex could not
write into it; `git status --short` and `ls public` showed nothing new after each):

    cd <scratch>/gh241-codex && codex exec --skip-git-repo-check -- "$(cat <scratch>/gh241-codex/prompt-A.txt) Save the final PNG to: <scratch>/gh241-codex/A-r1.png" < /dev/null

codex-cli 0.159.2. Wall clock 4 min 40 s (A), 3 min 01 s (B), 4 min 33 s (C), from `date` before and
after. Bare `codex exec`, not `emit_prompt.py`, because the registry's `brand_block` is
portrait-specific and that script appends it to every prompt. Codex rewrote each prompt and chose to
make more image calls on its own: A 3, B 2, C 2. The file it saved is byte-identical to its last call in
each case (A a fresh generation from Codex's third prompt; B and C edits of the first render).
`as-sent-prompts.json` holds every call's prompt as sent, its arguments and its output sha256, extracted
from the Codex session logs. Every call passed `transparent_background: true` — the gpt-image-2 skill's
line that the built-in tool "exposes no background parameter" is stale on this Codex version.

Masters: `images/IMG_02_00N.png` are the raw model outputs, picked by sha256 (rule 5) against
`~/.codex/generated_images/<session>/`. Ship derivatives: `images/gh241-ship/IMG_02_00N.webp`, made by
`python3 docs/verification/evidence/gh241/make_ship.py images/IMG_02_00N.png <black point> <work dir>
images/gh241-ship/IMG_02_00N.webp`; re-running it on `IMG_02_003` reproduced the webp byte-identical.

## Proposed card slot — as proposed before the pick

Wired 2026-10-01 with exactly these values: the artboard is `design/CatPartyPop.dc.html` (the page
header's), and the measured boxes, which differ from the arithmetic below by 1px, are in
`wiring/README.md`.

ADR-0033: a value not in the canvas is drift, so these enter the artboard before `src/`. The page's own
header names `design/CatPartyPop.dc.html` as its artboard; the brief for this task named
`design/CatParty.dc.html`. Which one carries it is not resolved here.

Geometry, calculated from the CSS in `src/pages/c/[category].astro` — **not measured in a browser**
(no browser was driven in this task). Desktop (>= 1100px): `.cards-grid` is 3 columns with a 20px gap in
the 940px column, so a card is 300px wide border-box and its content box 300 − 2×22 padding − 2×2.5
border = 251px. At 320px: one column, 320 − 2×18 page padding = 284px card, 235px content box.

Markup: the card's first child, above the `h3`, so the existing `gap: 12px` spaces it.

    <img class="game-card-art" src="/art/<file>.webp" width="<w>" height="320" alt="" loading="lazy" decoding="async">

Desktop (>= 1100px), box 251x160:

    .game-card-art { display: block; width: 100%; height: 160px; object-fit: contain; object-position: center; }

320px (<= 1099px), box 235x160 — the same declaration:

    .game-card-art { display: block; width: 100%; height: 160px; object-fit: contain; object-position: center; }

Why: a fixed 160px height with `object-fit: contain` fits any game's art whatever its aspect, so the
next games need no per-card value, and the box is fixed by CSS before the image arrives, so lazy
loading shifts nothing. All three candidates are height-limited in both boxes (aspect 1.09-1.27 against
box ratios 1.47 and 1.57), so they display 160px tall and the 320px-tall derivative is exactly 2x at
both widths. One value at both breakpoints because the derivative already serves both; 160px keeps the
art about the size of the card's own text block (min-height 200px). `alt=""` because the `h3` in the
same link already names the game, and a filled alt would read the name twice. `loading="lazy"` per the
owner's 2026-10-01 ruling in the ticket body. CSP `img-src` already allows `'self'`. Open for the owner:
between roughly 400px and 1099px the one-column card is wide and a centred croc floats away from the
left-aligned title; `object-position: left center` is the alternative.

## Not covered

- No browser render of the card in this half: the slot below was arithmetic. Measured since, in
  `wiring/README.md`.
- Whether a reviewer prefers A, B or C — the owner's pick.
- Re-render reproducibility: Codex rewrites the prompt and iterates on its own, so the registry text
  alone does not reproduce these files; the hashes and `as-sent-prompts.json` are the record.
