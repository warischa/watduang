# gh#319 — the demo result screen at 320x568, measured before the owner ruling was recorded

Date: 2026-11-18 · Machine: this Mac, Chrome 157.0.8103.79 · against the existing `dist/` (nothing was
built in this measurement). Serve port 4677 (`npx serve@14 dist/ -l 4677`), CDP port 9677, profile under
`/tmp`. Every run unset `PROBE_BASE PROBE_OUT_JSON FIT_SHARD FIT_SHARDS NO_WEBGL BREAK_WALK NO_SEED
NO_PRESS` and set `BASE`/`CDP_PORT` explicitly.

Chrome as `scripts/ci-probes.sh` launches the fit lanes: `--headless --disable-gpu --no-sandbox
--remote-debugging-port=9677`.

Three consecutive runs:

```
env BASE=http://localhost:4677 CDP_PORT=9677 ROUTES_ONLY=prize-envelopes,prize-flipcards,prize-ladder node scripts/play-screen-fit-probe.mjs
```

`ROUTES_ONLY` is deliberate: rows are per route, so a narrowed walk measures the same rows; it is
iteration-only and attests nothing about the deploy verdict. Outputs: `fit-run1.txt`, `fit-run2.txt`,
`fit-run3.txt` — the three files are byte-identical (md5 `688a31d2616f6cbe8bc4364526c6492b`). Exit 1 on
all three, and the only reds are the three FITS_ROWS pins this change re-records.

## Measured, every route, every run

| Row | scrolls | scroll px | clipped | sideways | worst screen |
|---|---|---|---|---|---|
| `prize-envelopes 320x568` | YES | 109 | 0 | 0 | press 1, class round |
| `prize-flipcards 320x568` | YES | 109 | 0 | 0 | press 1, class round |
| `prize-ladder 320x568` | YES | 109 | 0 | 0 | press 1, class round |
| every 390x844 and 1440x900 row of the three routes | no | 0 | 0 | 0 | press 1, class round |

Width-fill (report-only, not pinned): 90% at 320x568, 91.8% at 390x844, 100% at 1440x900 on all three
routes.

## Red before the recording

Each `fit-run*.txt` carries one `::error::` per 320x568 row, from FITS_ROWS, e.g.:

```
::error::/game/prize-envelopes/play/ at 320x568 no longer fits VERTICALLY: 109px to scroll and 0px clipped away on a play screen (press 1). This row is pinned as fitting in FITS_ROWS from a recorded run, and the pin only ever moves toward MORE rows. ...
```

That is the state the owner ruling 2026-11-18 (popup: allow the scroll at 320x568 only) re-records: the
demo result below 640px is the readable phone result (owner picks PD-317-01 (a) / PD-318-02 (a) on
gh#319), the shared final result screen, which at 320x568 is 109px taller than the viewport. Vertical,
scroll-only: 0px clipped and 0px sideways on every screen of every run.

Green after the recording: `fit-after-recording.txt`, same command against the same `dist/`, exit 0, no
`::error::` and no `::warning::` line — 6 rows asserted to fit and the 3 rows held as recorded
exceptions, their px reported.

Not covered: this is one machine's px, and the probe walks what its controls reach — the ruling is
recorded on the rows the walk produced, not on a hand-driven walk through every demo path.