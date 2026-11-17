# Scroll-only admissions, second batch, 2026-11-16 — measured before admitted

Owner ruling of 2026-11-16, as given in the task brief for this batch (the `SESSION-HANDOFF.md` of this tree at `4daa92b` does not carry it; its `next:` list mentions only the first batch's four rows): measure the eight remaining scroll-ruled
`KNOWN_OVERFLOW` rows and admit to `SCROLL_ONLY_ROWS` only those that read 0px clipped and 0px sideways on
every screen in n=3 runs. A row that clips is NOT admitted; its exact numbers go back to the owner.
Same procedure as `docs/verification/evidence/scroll-only-2026-11-16/` (first batch of four).

**Admitted (4):** `cursed-number 320x568`, `cursed-number 390x844`, `cursed-number 1440x900`,
`how-close-is-near 320x568`.
**Refused (4), owner questions:** `cannon-flag 320x568`, `pinocchio-luck 320x568`, `pinocchio-luck 390x844`,
`pinocchio-luck 1440x900`.

## The build these numbers describe

Fresh worktree at commit `4daa92b`: `npm ci`, then `npm run build` (37 pages), then no source edit until all 12
runs had finished. Checked, not assumed: `scripts/play-screen-fit-probe.mjs` hashed `d6f9250b2032…` during run 1
and again after the last run, and that equals the hash of the file as committed at `4daa92b` (`git show` of the
blob), so every leg ran the instrument of that commit. The edits that admit the rows were made afterwards.

## The lane, and its flags

`scripts/ci-probes.sh` narrowed, one route per run, three runs per route, **one run at a time** (12 runs, run
back to back by one driver script). The command, per run:

```bash
env -u PROBE_BASE -u PROBE_WIDTH -u ROUTES_ONLY -u BASE -u CDP_PORT -u BREAK_WALK -u NO_SEED -u NO_PRESS \
  -u NO_WEBGL -u FIT_SHARD -u FIT_SHARDS -u PROBE_OUT_JSON \
  PROBE_PORT=4333 PROBE_CDP_PORT=9333 PROBE_OUT_DIR=<tmp>/run-<route>-<n> PROBE_SCOPE=routes:<route> \
  bash scripts/ci-probes.sh
```

- **Ports:** serve 4333, Chrome CDP 9333. `lsof` on both was empty before the first run and after the last. The
  script refuses a port already listening, and tears down only the pids it started.
- **Env knobs:** twelve were unset by name (list above), covering the ones that move a measurement: base URL,
  width, CDP port, the three walk-control switches, `NO_WEBGL`, the shard pair, `PROBE_OUT_JSON`, `ROUTES_ONLY`.
  Five more are read by the probe (`CI`, `COMPOSITION_SHOTS`, `FONT_READ`, `FONT_READ_FD`, `PROBE_OUT_FIXTURE`)
  and were NOT unset: `env | grep` for all of them, and for the `PROBE_`/`CDP_` prefixes, printed nothing before
  the first run, so they were absent, not pinned. `ROUTES_ONLY` is set by the script itself, per leg. The set
  comes from the `process.env` reads in `scripts/play-screen-fit-probe.mjs` and `scripts/driver.mjs`, plus the
  script's own `unset PROBE_BASE PROBE_WIDTH`.
- **Chrome:** the lane's own `--headless --disable-gpu --no-sandbox`, profile under `<tmp>/`.
- **Viewports:** the probe's own three, 320x568 / 390x844 / 1440x900, through CDP device-metrics emulation.
- **Legs:** every run exited 0 with 0 `::error::` lines. 14 legs passed per run for `cannon-flag`,
  `cursed-number`, `how-close-is-near`; 12 for `pinocchio-luck` (its narrow plan differs). Each run includes the
  `BREAK_WALK=1` control leg, and all 12 reported `OK control: all 3 route/viewport row(s) stayed on the fresh
  screen`, so the walk invariant can fail. Leg-time sums were 318-350s per run; the fit leg 28-35s.

## Per-row readings — every screen, n=3

`clipped` and `sideways` are the per-screen columns of the probe's own `fmtScreens` emission. Scroll px is
reported because the ruling grants it; it is never gated. Screen count and press list were identical in all
three runs of every row.

| row | screens | per-screen scroll px by press (class) | max clipped | max sideways | verdict |
|---|---|---|---|---|---|
| `cursed-number 320x568` | 7 | 0: 140 (player) · 1: 0 · 2: 210 · 3: 661 · 4: 353 · 5: 210 · 6: 661 (round) | **0** | **0** | admitted |
| `cursed-number 390x844` | 7 | 0-2: 0 · 3: 289 · 4-5: 0 · 6: 289 (run 1) / 237 (runs 2, 3) | **0** | **0** | admitted |
| `cursed-number 1440x900` | 7 | 0-2: 0 · 3: 35 · 4-5: 0 · 6: 35 | **0** | **0** | admitted |
| `how-close-is-near 320x568` | 6 | 0: 60 (player) · 1: 3 · 2-4: 0 · 5: 18 (round) | **0** | **0** | admitted |
| `cannon-flag 320x568` | 3 | 0: 20 (player) · 1: 0 · 2: 0 (round) | **2** | 0 | **refused** |
| `pinocchio-luck 320x568` | 4 | 0: 270 (player) · 1: 63 · 2: 163 · 3: 49 or 82 (round) | **4** | **20** | **refused** |
| `pinocchio-luck 390x844` | 4 | 0: 170 (player) · 1: 0 · 2: 70 · 3: 0 (round) | **4** | **40** | **refused** |
| `pinocchio-luck 1440x900` | 4 | 0: 174 (player) · 1: 34 · 2: 0 · 3: 0 or 73 (round) | **4** | 0 | **refused** |

**Agreement:** the per-screen clipped and sideways columns of the four admitted rows are all 0 in all three
runs. The scroll columns are identical across runs except `cursed-number 390x844` press 6 (289 / 237 / 237),
a self-timed screen. Only the first batch's "byte-identical logs" claim does not carry over, and it was never
the gate: clipped and sideways are what the ruling names.

**Refused rows, exact (all three runs unless stated):**

- `cannon-flag 320x568`: press 2 (round) clipped **2px** by `div.power-gauge-container`, furthest below
  `div#power-gauge-text.power-lcd-text` (+1px). Same 2px at 390x844 and 1440x900 in this run (not part of this
  batch's eight). The row's reason already records this clip; it is now measured on this build.
- `pinocchio-luck` at all three viewports: presses 1, 2 and 3 (round) each clipped **4px** by `div.css-mouth`,
  every run. Sideways at 320x568: press 3 read 20px by `section#stageFrame` in run 3, 0 in runs 1 and 2. At
  390x844: press 3 read 10px in run 1, 0 in run 2, 40px in run 3, all by `section#stageFrame`. At 1440x900 no
  sideways in any run. These two rows are also members of `KNOWN_OVERFLOW_X`, a horizontal ruling that the
  vertical-only scroll grant does not cover (the pin test requires a scroll-only row to be outside that map).

**Against the recorded px** (check (iv), reported and never gated, so no px was re-recorded): `cursed-number`
reads 661 (press 3) against 689 recorded on press 1, 289 against 317, 35 against 157 — all downward.
`how-close-is-near` 60px on press 0 reproduces its reason exactly, and presses 1-5 read 3/0/0/0/18 as recorded.

## Render path — pinocchio-luck is a WebGL route

`pinocchio-luck` is the one of the four that references WebGL (the other three have no WebGL/three import under
`src/play/<id>/`, checked by grep). On this Mac `--disable-gpu` leaves no context, so it drew its no-WebGL
fallback puppet (the `div.css-mouth` the clip names is the fallback puppet's markup, and the row's reason says
the same lane). The render path was **not read in-page** in this batch: that is an inference from flags and
markup. The runner's context may be live, so these refusals are one machine's lane. They do not decide
admission, because the refusal stands on the fallback screen a player without WebGL sees.

## Instrument calibration — before any number above was trusted

The extractor (a throwaway script, not committed) reads the `::notice::` row line for `<route> <viewport>` and
the `  screen [...]` lines that follow it, taking clipped and sideways px.

- **Positive control:** the committed first-batch log `fit-short-stick-run1.txt` row `short-stick 320x568` →
  3 screens, scroll 54/114/156, clipped 0, sideways 0, as that README records. The committed
  `prize-cards 320x568` row from the gh305 evidence → 2 screens, scroll 3429, clipped 0.
- **Must-red, at a non-320 viewport:** a fabricated log with `clipped 7px by div#app [furthest below: …]` and
  `sideways 5px by div#planted` on a `390x844` row → reported 7 and 5, the next clean screen still 0 and 0.
- **Empty set:** a row the log lacks prints `NO_ROW_MATCHED` and exits 2; a row with no screen lines prints
  `NO_SCREENS` and exits 2. Unmeasured is never read as zero.

## Gate (vii) and pin test

`scripts/play-screen-fit-probe.test.mjs`, `the scroll-only rows are exactly the thirteen scroll rulings, each a
KNOWN_OVERFLOW row recorded at 0px clipped` (renamed from "nine"): it gained a second list with its own
provenance regex for `4daa92b` (the first batch's `1f57574` regex is untouched).

- **Red before the edit:** with the test extended and the probe not yet, 2 failed of 91: the pin test (set
  equality against the probe's `SCROLL_ONLY_ROWS`) and `MUST-RED REFUTE 2026-11-14: a round screen with 3429px
  CLIPPED and 0px to scroll reds on every scroll-only row`.
- **After the edit:** 91 pass / 0 fail.
- **Per-member must-red:** stripping `0px clipped, 0px sideways` from each admitted row's reason, one at a time,
  reds the pin test, 90 pass / 1 fail each, 4 of 4. Adding the unmeasured `cannon-flag 320x568` to the set
  reds its set-equality half, 90 pass / 1 fail. The probe file was restored from a copy after every mutation,
  sha256 identical.
- **Provenance regex alone:** changing only `4daa92b` to `1f57574` in the `cursed-number 390x844` clause (the
  phrase `0px clipped, 0px sideways` left intact) reds the same test, 90 pass / 1 fail, so the new regex is not
  shadowed by the generic phrase match. Restored from a copy, sha256 identical.
- The behavioural must-red above loops over the whole set, so a 3429px clip on each of the four new members
  reds with `CLIPS content away`.

## The real gate read the admitted rows

The README's 0px figures are the probe's printed, rounded px. Gate (vii) tests the raw `clippedPx > 0`, so a
sub-half-pixel clip would print `0px` and still red once the row is a member. To close that, the narrowed lane
was run once more for `cursed-number` and `how-close-is-near` on the edited probe (with the four keys in
`SCROLL_ONLY_ROWS`), same command and ports as above. Both exited 0, 14 legs passed, no `::error::`, 0 lines
`CLIPS content away`, the control leg `OK`, and the extractor again read 0 clipped and 0 sideways on every
screen (`gate-fit-<route>.txt`, `gate-legs-<route>.txt`). The three `cursed-number` rows and the `how-close-is-near`
row therefore pass gate (vii) as members, not only as log text. After this run the only change to the probe was
punctuation inside the three `cursed-number` reason strings; no behaviour moved.

## Files here

- `fit-<route>-run<n>.txt` — the clean fit leg's log, all three viewports, every screen line.
- `fit-control-<route>-run<n>.txt` — the `BREAK_WALK=1` control leg of the same run.
- `legs-<route>-run<n>.txt` — the whole narrowed run's output: leg verdicts and `LEG_SECONDS` lines.
- `gate-fit-<route>.txt`, `gate-legs-<route>.txt` — the gate-on run above, for the two admitted routes.

The logs are verbatim: the probe prints no absolute path, and every file was scanned for local-path shapes
and the account name (0 hits) before it went in.

## What this does not cover

- **One machine's lane.** `--disable-gpu` readings on this Mac. The runner's font stack can read a clip where
  this Mac reads none; the next full CI run is the runner's verdict, and a clip there reds gate (vii) by name.
- **Narrowed runs attest nothing** (`iteration only, never the deploy verdict`); no run-level check ran.
- **`evidence-local-path-check.mjs` scans tracked files only**, so on an untracked directory its green says
  nothing about these files; the shape scan above is the instrument that covered them.
- No layout was changed and no fix is measured here. The refused rows keep the rulings they have.
