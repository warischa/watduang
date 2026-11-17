# Clip fixes, then scroll-only admissions: cannon-flag and pinocchio-luck, 2026-11-17

Owner ruling of 2026-11-17, as given in the task brief for this change: fix the content clips that kept
four rows out of `SCROLL_ONLY_ROWS` in the 2026-11-16 second batch
(`docs/verification/evidence/scroll-only-2026-11-16b/`), in a change of their own, without changing how
either game looks, then re-measure and admit only the rows that read 0px clipped and 0px sideways on every
screen in n=3 runs.

**Admitted (2):** `cannon-flag 320x568`, `pinocchio-luck 1440x900`.
**Still refused (2):** `pinocchio-luck 320x568`, `pinocchio-luck 390x844`. Their clip is gone, but they
still read sideways overflow. That overflow is a designed clip, not a layout bug (see below).

## The two clips, and their causes (both proven in a real browser)

Both clips were empty box space, not content.

- **cannon-flag, `div.power-gauge-container`, 2px.** The gauge is 14px tall with a 1px border, so its
  padding box is 12px. The label `#power-gauge-text` is centred in it with top/left 50% and a -50%
  translate. At `line-height: normal` its line box read 16px tall (the Thai fallback face's metrics), so
  the centred box ran from -2px to 14px and hung 2px past the bottom edge. Read in-page before the fix:
  gauge `scrollHeight` 14 against `clientHeight` 12, label box 16px tall.
- **pinocchio-luck, `div.css-mouth`, 4px.** The no-WebGL fallback puppet draws its tongue as
  `.css-mouth::after`, a 20x12 ellipse at `bottom: -4px`. The mouth's `overflow: hidden` cuts off the part
  below the mouth, so the box held 4px of tongue that nobody sees. Read in-page before the fix: mouth
  `scrollHeight` 14 against `clientHeight` 10.

## The fixes (each in the route's `overrides.css`; the verbatim mockup `style.css` is untouched)

- **cannon-flag:** `.power-lcd-text { line-height: 10px; padding-top: 2px; }`. The label box is now exactly
  12px, and its baseline lands on the same device pixel as before.
  - Runner-up, rejected: `line-height: 12px` alone. It reads `scrollHeight == clientHeight` exactly, but it
    moves the label 1px up (495 pixels differ in the 320x568 crop) and pushes the Thai upper vowel further
    into the gauge's top edge.
  - **Residual, stated:** the gauge reads `scrollHeight` 13 against `clientHeight` 12. That extra 1px is the
    monospace face's descent area under the baseline, with no ink in it. The probe's `EPS` is 1px, so it
    reads 0px clipped.
  - No 12px box can keep both the glyph pixels and an exact fit. The face's content area (about 12.7px at
    11.2px) is taller than the 12px padding box.
- **pinocchio-luck:** `.css-puppet .css-mouth:after { bottom: 0; height: 8px; border-radius: 10px 10px 0 0 / 6px 6px 0 0; }`.
  This is the top 8px of the same ellipse, drawn as a box that ends at the edge of the mouth. Its bottom
  corners are square, and the mouth's rounded clip still trims them as before. The mouth now reads
  `scrollHeight == clientHeight` (10/10) at every viewport.
  - Runner-up, not taken: an 8px box with `clip-path: ellipse()`. It has the same edge-coincidence
    antialiasing, and adds a property.
  - Rejected outright: anything that swaps `overflow: hidden` for containment or clip-path while the tongue
    still overhangs. That hides the clip from the scan; it does not remove it.

## Look unchanged: before/after crops (`look-*.png`)

Screenshots came from a throwaway CDP script against the served `dist/`, in the same headless Chrome flags.
It seeds four names, presses the largest visible button (twice for cannon-flag to reach the gauge screen,
once for pinocchio-luck), and crops to the element's rect plus padding.

Calibration of the differ:
- Two before-shots of the same state differ by 0 pixels at all six route/viewport pairs.
- A planted single-pixel change of 1 level reads `diffpx=1`.

| crop | 320x568 | 390x844 | 1440x900 |
|---|---|---|---|
| cannon-flag gauge (label + bar) | 0 px differ | 0 px differ | 0 px differ |
| pinocchio-luck puppet (head, mouth, tongue) | 0 px differ | 16 px differ, max delta 34/255 | 16 px differ, max delta 34/255 |

- **Where pinocchio-luck differs:** the 16 pixels sit in a 16x2 strip on the bottom row of the tongue,
  where it meets the mouth's bottom border. The puppet sits on a fractional pixel at 390 and 1440. The
  tongue's own box edge now coincides with the mouth's clip edge, so two antialiased edges multiply where
  there used to be one.
- `look-pinocchio-luck-mouth-390x844-zoom-before-left-after-right.png` is an 8x zoom of that region:
  before on the left, after on the right. No difference is visible.
- **Full-frame diffs:** the only other differences are the routes' own random regions (the cannon-flag
  field; the pinocchio-luck panel below the stage). Two before-shots differ there by the same amount, and
  the gauge row lies outside that box.

## Repro on the unfixed build (`repro-before-fit-*.txt`)

Run before any edit, at `cac19bf`, with the probe called directly (`ROUTES_ONLY=<id>`) against a served
`dist/` and Chrome `--headless --disable-gpu --no-sandbox`:
- cannon-flag: press 2 clipped 2px by `div.power-gauge-container` at all three viewports (furthest below:
  `div#power-gauge-text`, +1px).
- pinocchio-luck: presses 1-3 clipped 4px by `div.css-mouth` at all three viewports.

That run was an iteration loop, not the narrowed lane.

**The narrowed lane on the unfixed artifact, gate on** (`repro-unfixed-gate-*.txt`):
- The pre-fix `dist/` (copied aside before any edit) was swapped in, and the lane ran once per route on the
  final probe (hash `b8e1161acdaaa279…` at start and end), with both new keys in the set.
- **cannon-flag:** exit 1. `CLIPS content away VERTICALLY: 2px clipped` names `cannon-flag` at 320x568.
- **pinocchio-luck:** exit 1. The same line names `pinocchio-luck` at 1440x900, 4px clipped. It appears on
  3 screens.
- So gate (vii) reds on the real unfixed artifact for exactly the two admitted rows.
- Afterwards the fixed `dist/` was restored from its copy. A tree hash over every file in `dist/` reads
  `774e640515b62cca` both before the swap and after the restore.
- Only reason text in the probe changed after the gate-on runs below. The pin test was re-run after that
  text change: 93/93.

## The lane after the fix: n=3 per route (`fit-*`, `fit-control-*`, `legs-*`)

Command, per run, copied from the 16b procedure with this change's ports:

```bash
env -u PROBE_BASE -u PROBE_WIDTH -u ROUTES_ONLY -u BASE -u CDP_PORT -u BREAK_WALK -u NO_SEED -u NO_PRESS \
  -u NO_WEBGL -u FIT_SHARD -u FIT_SHARDS -u PROBE_OUT_JSON \
  PROBE_PORT=4701 PROBE_CDP_PORT=9701 PROBE_OUT_DIR=<tmp>/run-<route>-<n> PROBE_SCOPE=routes:<route> \
  bash scripts/ci-probes.sh
```

- **The build:** `npm run build` of `cac19bf` plus the two `overrides.css` edits. No source edit was made
  during the six runs.
- **The instrument:** `scripts/play-screen-fit-probe.mjs` hashed `6f50f81a50da7f17…` before the first run
  and after the last. That is the file as committed at `cac19bf`, so every leg ran the unedited
  instrument. The admission edits came afterwards.
- **The environment:** before the first run, `env` held none of the probe's knobs. `lsof` on 4701 and 9701
  was empty before the first run and after the last.
- **Every run:** exited 0 with 0 `::error::` lines. 14 legs passed for cannon-flag and 12 for
  pinocchio-luck. The `BREAK_WALK=1` control leg printed `OK control` in all six.
- **The extractor:** a throwaway script that reads the `::notice::<route> <vp>` row line and the screen
  lines after it.
  - Positive control: the 16b `cursed-number 320x568` log reproduces that README's 140/0/210/661/353/210/661.
  - Known red: the 16b `pinocchio-luck 390x844` run 3 log reads clipped 4 and sideways 40.
  - Must-red: a fabricated `390x844` row with 7px clipped and 5px sideways reads 7 and 5.
  - Empty set: a missing row prints `NO_ROW_MATCHED` and exits 2.

| row | per-screen scroll px by press (class) | max clipped, 3 runs | max sideways, 3 runs | verdict |
|---|---|---|---|---|
| `cannon-flag 320x568` | 0: 20 (player) · 1: 0 · 2: 0 (round) | **0 / 0 / 0** | **0 / 0 / 0** | admitted |
| `cannon-flag 390x844` | 0-2: 0 | 0 / 0 / 0 | 0 / 0 / 0 | not a scroll-only candidate (see below) |
| `cannon-flag 1440x900` | 0-2: 0 | 0 / 0 / 0 | 0 / 0 / 0 | not a scroll-only candidate (see below) |
| `pinocchio-luck 320x568` | 0: 270 (player) · 1: 63 · 2: 163/172/135 · 3: 49/82/49 (round) | 0 / 0 / 0 | **35** / 0 / 0 | **refused** |
| `pinocchio-luck 390x844` | 0: 170 (player) · 1: 0 · 2: 70 · 3: 0 (round) | 0 / 0 / 0 | **10** / 0 / 0 | **refused** |
| `pinocchio-luck 1440x900` | 0: 174 (player) · 1: 34 · 2: 0 · 3: 0/0/73 (round) | **0 / 0 / 0** | **0 / 0 / 0** | admitted |

**cannon-flag 390x844 and 1440x900** were never scroll-ruled. They are `KNOWN_OVERFLOW` rows recorded at
the 2px gauge clip, and that clip was their whole overflow. They now read 0px everywhere, so check (iii)
prints its "move the row to FITS_ROWS" warning. Per the probe's own rule, that move waits for a CI-runner
reading as well as this Mac's. It is not made here.

## The sideways overflow on pinocchio-luck: cause proven, not fixable without changing the look

It is the no-WebGL fallback nose.
- A wrong answer sets `--fallback-nose` to 34px plus 14px per growth step. The steps are 1-10, so the
  nose can reach 174px.
- The nose eases to that width over 0.8s with an overshoot.
- Its right edge runs past `section#stageFrame`, whose `overflow: hidden` clips it on purpose. That rule
  in `overrides.css` gives the fallback the same cut the WebGL canvas makes on the 3D nose.

Read in this Chrome while playing (a throwaway loop sampling every 50ms):
- The frame's sideways px matched the nose's right edge minus the frame width, within 1px, at the first,
  last and peak sample of each press.
- A wrong answer drove the nose to 160px (170px at the overshoot), which put it 59-69px past a 306px
  frame at 320x568.
- When the turn moved on, the reading fell back to 0.

Forced to its longest drawn width, with the transition disabled:

| viewport | frame width | nose 174px (step 10) | nose 190px (a bound above the eased overshoot) |
|---|---|---|---|
| 320x568 | 306px | 73px past the frame | 89px |
| 390x844 | 376px | 34px | 50px |
| 1440x900 | 780px | **0px** | **0px** |

So the 1440x900 zeros are geometry, not luck. The intermittency at 320 and 390 comes from game RNG and
timing, not load. It needs three things at once:
- a wrong answer on the choice the walk presses,
- a large growth step,
- a measurement taken during the ease.

The measured overshoot peaked at 170px on a 160px target, so 190px is a chosen bound, not a reading. The
old reason's 79px fits the 174-190px range.

**Not fixable without a visible change.** Every box that stays inside the frame changes the look:
- A nose box ending at the frame edge paints its rounded tip and right border there, instead of a straight
  cut.
- Moving the puppet moves the drawing.
- Swapping the clip for containment hides it from the scan, and was rejected for the same reason as above.

Both `KNOWN_OVERFLOW_X` rows now carry the identified cause. Their `gh#202 open:` prefix is stale: `gh issue view 202` reads CLOSED,
closedAt 2026-09-08. The class that fits a designed clip is `owner ruling <date>:`, and only the owner can issue
it. `not a defect` is unavailable twice over: it needs an owner ruling, and it needs the same px at every
viewport, but 1440x900 reads 0.

## Gate and pin test

`scripts/play-screen-fit-probe.test.mjs` gained a third batch constant, `SCROLL_ONLY_2026_11_17`. Its
provenance regex is `re-measured 2026-11-17 on the clip-fix build \(n=3\): 0px clipped, 0px sideways`. The
build is not a commit yet, so the clause names the build rather than a hash.

| check | result |
|---|---|
| Test extended, probe not yet | 91 pass / 2 fail of 93: the set-equality pin and the 3429px clipped must-red |
| After the probe edit | 93 / 0 |
| Each new row removed from `SCROLL_ONLY_ROWS` | 91 / 2, both rows |
| `0px clipped, 0px sideways` stripped from each new clause | 92 / 1, both rows |
| Provenance changed alone (`on the clip-fix build` to `at 4daa92b`) | 92 / 1, both rows |

After every mutation, the probe was restored from a copy and its sha256 checked.

**The real gate read the admitted rows.** Gate (vii) tests the raw `clippedPx > 0`, not the printed,
rounded px. So the narrowed lane ran once more per route, on the edited probe with both keys in the set
(hash `98c0dc1d0eed9b7d…` at start and end), with the same command and ports.

| route | exit | legs passed | `::error::` lines | `CLIPS content away` lines | control leg | clipped / sideways, every screen, 3 viewports |
|---|---|---|---|---|---|---|
| cannon-flag | 0 | 14 | 0 | 0 | `OK` | 0 / 0 |
| pinocchio-luck | 0 | 12 | 0 | 0 | `OK` | 0 / 0 |

The pinocchio-luck 320 and 390 rows also read 0 sideways in this run. One more zero does not change their
verdict, which rests on the mechanism. Logs: `gate-fit-<route>.txt`, `gate-legs-<route>.txt`.

## What this does not cover

- **One machine's lane.** These are `--disable-gpu` readings on this Mac.
  - The runner draws the mono stack in Liberation Mono, which has the same metrics as Courier New
    (`docs/verification/evidence/gh287-2026-10-24/`, `FONT_READ` lines). The gauge's 1px residual should
    therefore read the same there. That is inferred, not measured.
  - The label's pixel identity holds on this Mac's fonts only.
- **Narrowed runs attest nothing** about the deploy, and no run-level check ran here.
- **Unread from the lane:** the WebGL render path. With `--disable-gpu`, the fallback puppet is what drew
  (`no-webgl` was read in-page during the loops above).
- **`evidence-local-path-check.mjs` sees tracked files only.** Every file here was scanned for home, temp
  and account-name shapes before it went in.
