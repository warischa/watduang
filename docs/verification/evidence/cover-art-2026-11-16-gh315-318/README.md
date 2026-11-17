# Cover art for the four phase-2 prize-draw games (gh#315 to gh#318)

2026-11-16. Two candidates per game, rendered by the gh#303-art recipe (bare `codex exec` with
`-i images/IMG_02_003.png`, the Direction C template, codex-cli 0.167.0). Registry entries `IMG_05_001` to
`IMG_05_008` in `images/IMAGES.md`, section "Game-card art candidates — the phase-2 prize-draw games".

## The owner's picks (popup, 2026-11-16)

| game | ticket | picked | master | shipped files |
|---|---|---|---|---|
| prize-zones | gh#315 | `IMG_05_001` (a) | `images/IMG_05_001.png` | `public/art/prize-zones.webp`, `prize-zones-2x.webp` |
| prize-marbles | gh#316 | `IMG_05_003` (a) | `images/IMG_05_003.png` | `public/art/prize-marbles.webp`, `prize-marbles-2x.webp` |
| prize-envelopes | gh#317 | `IMG_05_006` (b) | `images/IMG_05_006.png` | `public/art/prize-envelopes.webp`, `prize-envelopes-2x.webp` |
| prize-flipcards | gh#318 | `IMG_05_008` (b) | `images/IMG_05_008.png` | `public/art/prize-flipcards.webp`, `prize-flipcards-2x.webp` |

The other four (`IMG_05_002`, `IMG_05_004`, `IMG_05_005`, `IMG_05_007`) stay `pending`, unpicked, and have no
shipped file.

## What is here

- `ship_scratch.py <master.png> <black_point> <out_dir> <stem>`: 1x by `gh241/make_ship.py` unchanged; 2x by
  gh#250's `level_trim` (imported from `gh250/make_2x.py`), a resize to fit 1004x640 (twice the 502x320 slot box),
  then `cwebp -q <q> -alpha_q 100 -m 6 -sharp_yuv` with q from 88 down to the 61,440 B cap. It writes only into
  `<out_dir>` and prints one JSON line (sizes, bytes, q, sha256). The repo root comes from the file's own location.
  Why a new script and not `make_2x.py ship`: that one writes into `public/art/` and holds a fixed master list.
- `sheet.py <ship_dir> <out_dir> <game> <idA> <idB>`: one contact sheet, candidate A on the top row and B on the
  bottom row, each flattened on `#ff3d7f`, `#c9c2ff`, `#23214d` and `#1a1a1a`, ASCII labels. `<ship_dir>` holds
  `<id>/<id>.webp`.

## Commands, inputs, outputs

    python3 docs/verification/evidence/cover-art-2026-11-16-gh315-318/ship_scratch.py images/IMG_05_001.png 2 <scratch>/zones IMG_05_001
    python3 docs/verification/evidence/cover-art-2026-11-16-gh315-318/ship_scratch.py images/IMG_05_003.png 2 <scratch>/marbles IMG_05_003
    python3 docs/verification/evidence/cover-art-2026-11-16-gh315-318/ship_scratch.py images/IMG_05_006.png 3 <scratch>/envelopes IMG_05_006
    python3 docs/verification/evidence/cover-art-2026-11-16-gh315-318/ship_scratch.py images/IMG_05_008.png 2 <scratch>/flipcards IMG_05_008

The black point is the highest haze alpha outside the dilated solid mask (gh#242's rule), per master: 2, 3, 2, 3, 3, 3,
6 and 2 for `IMG_05_001` to `IMG_05_008`. The `public/art` files are these outputs copied unchanged.

| shipped file | size | bytes | sha256 prefix |
|---|---|---|---|
| `prize-zones.webp` / `-2x` | 334x320 / 669x640 | 19,656 / 48,516 | `b746cb82bda2423e` / `f0199ed211d23514` |
| `prize-marbles.webp` / `-2x` | 369x320 / 738x640 | 16,662 / 41,478 | `7debb4e01f77e95b` / `9799f0737a63babb` |
| `prize-envelopes.webp` / `-2x` | 502x172 / 1004x343 | 24,392 / 60,892 | `805164dd80cca11a` / `5aaf10658e693b3f` |
| `prize-flipcards.webp` / `-2x` | 502x291 / 1004x581 | 25,826 / 60,712 | `0c326ac7a8cc5c05` / `c09dc680190bc935` |

All eight graded by `gh241/grade.py` after copying into `public/art/`: srgba, haze outside the dilated solid mask 0,
corners 0/0/0/0. The envelope and flipcards covers are width-limited (a 640 px height would upscale the trimmed
master), so their 2x is 1004 px wide.

## Proof it reproduces, and that the check can fail

- Positive control, run first: `ship_scratch.py` on `images/IMG_04_005.png` at black point 3 gave a 1x and a 2x webp
  byte-identical to `public/art/prize-cards.webp` and `public/art/prize-cards-2x.webp`; at black point 0 both hashes
  differ.
- This directory's copy of the script, run on the four picked masters at the black points above, gave all eight files
  byte-identical to `public/art/`. At black point 3 instead of 2 on `IMG_05_008`, both of its files differ.

## Not in the repo

- The raw renders' as-sent prompts, the references each image call passed and each master's sha256 are in
  `images/IMG_05-as-sent-prompts.json` (local paths replaced by placeholders). It records only the masters kept.
- The render, grade and as-sent extraction tooling was the gh#303-art scripts (`render.sh`, `build_prompts.py`,
  `post.py`, `extract_as_sent.py`), run from patched scratch copies: the repo-root line read from an environment
  variable, the Codex session-date glob widened, and a per-call `references_at_image_tool` field added to the
  extractor. The patched copies were not saved to the repo.
- Four renders were discarded and re-rendered (`IMG_05_004` once, `IMG_05_007` twice, `IMG_05_008` once): three because
  the image call that produced the file passed no style reference, and one `IMG_05_007` attempt because its star read
  too small. The registry notes name each by raw sha256 prefix.
- The contact sheets were made in the scratch directory and are not tracked.
