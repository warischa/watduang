# gh303-art — candidate card covers for the company-party category, direction C

2026-11-11. Owner request of the same day: the company-party games get cover images like the party games
have. This directory holds eight candidates, two per cover, for the owner to pick a set from. **Nothing
here entered `public/` or `src/`.** No webp exists in `public/art/` for any of them. The registry entries
are `IMG_04_001` to `IMG_04_008` in `images/IMAGES.md`, section "Game-card art candidates — the
company-party category, direction C (gh#303-art)". All of them are `status: pending`, awaiting the owner.

## The sheets to decide on

- `compare-style.png`: one row per cover. Each row is a shipped party card (croc-bite, timebomb,
  dice-loser, bangkok-drift), then the cover's candidates a and b. Every tile sits on the party card
  ground `--accent-punch` `#ff3d7f`, object-fit contain and centred, in the 502x320 box: the 251x160 CSS px
  `.game-card-art` slot at 2x. This is the "does it read as the same set" sheet.
- `compare-grounds.png`: every candidate at 1x (251x160), with croc-bite first as the reference, on the
  two category accents the gh#303 category board puts to the owner as K1: lilac `#c9c2ff` and night
  `#23214d`. gh#304's `sky` accent is a stand-in that awaits K1, so it is not shown.
- Both are quantised to 256 colours to stay small. The masters in `images/` are the true pixels.

Rebuild: `make_compare.py <scratch>/ship <out dir>`. Each scratch ship webp was made by
`docs/verification/evidence/gh241/make_ship.py` from the master, at the black point in the table below.

## The candidates

| cover | a | b |
|---|---|---|
| event (New Year prize draw) | `IMG_04_001` red gift box, lid popping open, gold bow, confetti and curled ribbons bursting out | `IMG_04_002` plain red paper lantern with gold caps and tassel, a teal gift box at its foot, confetti and stars |
| fireworks countdown | `IMG_04_003` red and cream firework rocket on gold fins, two small red lanterns and three gold stars | `IMG_04_004` solid gold-and-red starburst over a teal one, a small red lantern hanging below |
| cards dealt to the room | `IMG_04_005` fan of five teal-backed cards, front card tipping to a cream face with one gold star, gold rivet | `IMG_04_006` red-backed cards flying out of a deck in an arc, confetti between |
| ladder / lanes | `IMG_04_007` four cream rails with rungs on a red base, one gold zigzag path from a teal token to a gift box | `IMG_04_008` a funnel-topped track forking into three lanes, red ball, three gift boxes at the ends |

## Content check, per render — looked at, not summarised

Every master was trimmed, flattened whole onto `#ff3d7f`, `#c9c2ff`, `#23214d` and `#1a1a1a`, and opened.
The style score (1-5) is a judgement of how closely the render matches the shipped party set beside it on
`compare-style.png`: the soft vinyl material, the upper-left key light, one subject, the weight at thumbnail
size.

| id | drink, bottle or glass-free | casino-free | text-free | style match | note |
|---|---|---|---|---|---|
| `IMG_04_001` | yes | yes | yes | 5 | one chunky silhouette, as the party cards have |
| `IMG_04_002` | yes | yes | yes (lantern plain, no character) | 5 | lantern dominates; reads New Year at once |
| `IMG_04_003` | yes | yes | yes | 4 | small parts; the rocket reads more as a firecracker toy |
| `IMG_04_004` | yes | yes | yes | 4 | ball-tipped rays read slightly like a molecule model |
| `IMG_04_005` | yes | yes (no suits, pips, ranks, felt or chips) | yes (stars only) | 5 | strongest silhouette of the eight |
| `IMG_04_006` | yes | yes (no suits, pips, ranks, felt or chips) | yes (stars only) | 4 | busy at 1x: nine separate pieces. Unintended reading: a red field with one centred gold star, repeated, is a national flag layout |
| `IMG_04_007` | yes | yes | yes | 4 | the gold path is its own track, not along the rungs; reads as a path game |
| `IMG_04_008` | borderline: the funnel mouth is bowl-like, though not a drinking vessel | yes (no pegs, so not a pin-drop board) | yes | 3 | the funnel mouth is an odd bowl shape; weakest read of the game |

No render had a human, hand or face, a logo, a painted checkerboard, a halo on the dark grounds, or a
floor or contact shadow. Nothing failed the content rules outright.

**`IMG_04_004` and `IMG_04_008` are not style-anchored at the image tool.** Their call 1 passed no
`referenced_image_paths`, so the image model saw text only; call 2 edited that output. The anchor
reached the Codex session through `-i`, not the model. Both are queued for an anchored re-render after
the Codex usage window resets (17:14 local, 2026-11-11), and neither should be picked as is.

## Grading — every number from a command run 2026-11-11

`grade.py` and the black-point rule are gh#241's and gh#242's, unchanged (see `post.py`). `transparent` is
the fraction of pixels with alpha exactly 0. `haze` is the number of alpha 1-25 pixels outside the alpha >= 26
mask dilated by a radius-4 disk. The black point is the highest haze alpha. The ship webp is a scratch
artefact made only to report the size and the 60 KB cap (61,440 B); it never left the scratch directory.

| id | started (UTC) | wall s | raw channels | raw transparent | raw haze | black point | ship size | ship bytes | ship haze | ship corners | master sha256 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `IMG_04_001` | 2026-11-11T06:47:01Z | 210 | srgba | 69.30% | 4756 | 5 | 235x320 | 20,632 | 0 | 0 0 0 0 | fe672741…a38976 |
| `IMG_04_002` | 2026-11-11T06:54:25Z | 217 | srgba | 72.30% | 7193 | 4 | 273x320 | 19,628 | 0 | 0 0 0 0 | 10cf44b6…a83d87 |
| `IMG_04_003` | 2026-11-11T06:47:01Z | 215 | srgba | 81.37% | 3861 | 4 | 289x320 | 20,486 | 0 | 0 0 0 0 | 4c9c344f…849edf |
| `IMG_04_004` | 2026-11-11T06:42:11Z | 254 | srgba | 68.50% | 10004 | 4 | 264x320 | 20,268 | 0 | 0 0 0 0 | 19eb8739…f1341e |
| `IMG_04_005` | 2026-11-11T06:47:01Z | 265 | srgba | 57.07% | 6871 | 3 | 415x320 | 24,116 | 0 | 0 0 0 0 | 9a352745…93cb04 |
| `IMG_04_006` | 2026-11-11T06:54:25Z | 268 | srgba | 62.15% | 55697 | 4 | 365x320 | 34,540 | 0 | 0 0 0 0 | b4b2c7a2…d18998 |
| `IMG_04_007` | 2026-11-11T06:47:01Z | 437 | srgba | 55.26% | 51925 | 5 | 285x320 | 15,492 | 0 | 0 0 0 0 | 45e7c97d…ffe4e0 |
| `IMG_04_008` | 2026-11-11T06:54:25Z | 259 | srgba | 57.33% | 29014 | 3 | 280x320 | 19,016 | 0 | 0 0 0 0 | 0824b0ab…fa2472 |

Wall clock is from `date` before and after each `codex exec`, which `render.sh` records. `IMG_04_004` ran
alone, as the gate. The other seven ran four, then three, at a time, the gh#242 precedent. All black
points are 3-5. gh#242's ship_all flags anything above 5 as a soft element, so none is flagged.

**The instrument, calibrated.** Positive control, run first: `post.py` on the shipped `IMG_03_001` master
gave black point 2 and a webp byte-identical to `public/art/timebomb.webp` (sha256 `3e94c367cabe84d8…`).
The repo-write detector went red: a file planted in `public/art/` showed in `git status`, in the hash diff
and as 30 entries in `ls public/art`. With the file removed, all three were clean again.
Every subject's interior reads alpha 253 (median), not 255. So do the shipped masters `IMG_02_003`,
`IMG_03_001` and `IMG_03_009`, so it is a property of the tool, not a defect of these renders.

## Nothing entered the repo — proof at three checkpoints

`post.py` ran at three checkpoints, not after each single render (a deviation from the brief): after the
gate render, after batch one, and after batch two. Each checkpoint covered every render finished by then,
compared against a baseline taken before the first. The baseline was the
sha256 of every file under `public/` and `images/` (187 files), plus `git status --short`. After all eight
renders, and before the masters were copied:
- the hash diff was empty for every render, in both directions;
- `ls public/art | wc -l` read 29 every time (entries, not files: 28 webp plus the `nuea-khu` directory);
- the only `public/` line in `git status` was `?? public/og/prize-draw.png`, which was already present
  at the baseline and belongs to another agent.

Other `src/` and `design/` entries did come and go in `git status` during the run (HEAD moved from
`7cefc99` to `3fe3d1f`); none was under `public/` or `images/`. The eight Codex run logs name no repo path except the anchor
image, so the churn is inferred to be other agents' work.

## How each was made

One `codex exec` per render, from `<scratch>/gh303-art` (outside the repo), on codex-cli 0.167.0:

    ( cd <scratch>/gh303-art && codex exec --skip-git-repo-check -i images/IMG_02_003.png -- "$(cat <scratch>/gh303-art/prompts/<id>.sent.txt)" < /dev/null )

The `-i` path is the absolute path to the repo's style anchor. The sent text is gh#242's style-reference
prefix ("Input images: image 1 (<path>) is a STYLE REFERENCE only …"), the registry `prompt:`, then
"Save the final PNG to: <scratch>/gh303-art/renders/<id>/<id>.png".

- `build_prompts.py` builds each prompt. It reads the five Direction C template paragraphs from the
  registry and checks that there are exactly five. Each of the five hashes equal to the same paragraph in
  `IMG_03_001`'s shipped prompt. `subjects.json` holds each cover's `Subject:`.
- **The template's Color palette paragraph is stale for this category, and it was sent unchanged.** It says
  "coral (#f89880) never as a large area, because the card the art sits on is coral". The party card
  ground is now `--accent-punch` `#ff3d7f`, and this category's ground is not yet picked (K1: lilac or
  night). It was kept verbatim so the direction stays byte-identical. Each `Subject:` adds "No large lilac,
  navy or sky-blue area" instead.
- `as-sent-prompts.json` holds every `image_gen` call per render, extracted from the Codex session logs by
  `extract_as_sent.py`: Codex's rewritten prompt, `transparent_background`, whether the call carried the
  style anchor or edited Codex's own previous output, and the output sha256.
  - Every render made 2 calls, and every master is call 2, matched by sha256 (never by mtime).
  - Call 2 was an edit of call 1 (an alpha clean-up pass Codex chose to make) on seven renders. On
    `IMG_04_007` it was a fresh generation.
  - Every call passed `transparent_background: true`.
  - On `IMG_04_004` and `IMG_04_008`, no call passed the anchor to the image tool (see the content check).
  - The edit prompts are short and no longer repeat the exclusions. The content check above was run on the
    final pixels for that reason.
- Model: Codex's built-in `image_gen`, which reports no model id. That it is Images 2.6 is inferred
  (OpenAI's 2026-11-04 rollout note), not observed. gh#241 and gh#242 rendered on codex-cli 0.159.2, so
  the model under this set may differ from the one under the party set. The style sheet is the check for
  that.
- Masters: `images/IMG_04_00N.png` are the raw files Codex saved, copied byte-identical (sha256 re-checked
  after the copy).
- `render.sh`, `post.py`, `extract_as_sent.py`, `build_prompts.py` and `make_compare.py` resolve paths
  against the session scratch directory they ran from. They are a record, not a pipeline.

## Recommended set, and why

`IMG_04_001` (event, gift box), `IMG_04_003` (fireworks, rocket and lanterns), `IMG_04_005` (cards, fan)
and `IMG_04_007` (ladder, rails). All four are anchored. `IMG_04_004` would take the fireworks slot if an
anchored re-render holds its look.
- Each is one chunky subject, as every shipped party card is.
- Their dominant colours differ (red and gold, red and gold with lanterns, teal and cream, cream and red),
  so the four cards stay distinct side by side.
- The rest are out for these reasons. `IMG_04_002` repeats a red lantern next to `IMG_04_003`.
  `IMG_04_006` is busy at 1x and carries the flag reading. `IMG_04_004` and `IMG_04_008` are not
  anchored, and `IMG_04_008` also reads weakly.
- The fact that would change this pick: the K1 accent. On night `#23214d` every candidate holds. On lilac
  `#c9c2ff`, the cream parts of `IMG_04_005` and `IMG_04_007` sit at lower contrast, which favours
  `IMG_04_002` (red-dominant) for the event slot.

## Not covered

- The owner's pick, and the K1 accent decision that frames it.
- No browser render: the 251x160 slot is gh#241's proposed box, which its wiring README measured 1px off; not re-measured here.
- No 1x or 2x webp for `public/art/`: the picked masters go through `make_ship.py` and gh#250's `make_2x.py`
  when the pick is wired.
- Reproducibility: Codex rewrites the prompts and iterates on its own, so the hashes and
  `as-sent-prompts.json` are the record, not the registry text.
