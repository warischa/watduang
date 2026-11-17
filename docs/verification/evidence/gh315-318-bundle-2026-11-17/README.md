# gh#315–gh#318 integration — bundle re-pin, per-visitor cost, and the per-route gates for the four phase-2 prize-draw games

Date: 2026-11-17 · Tree: HEAD `0e15742` plus the uncommitted phase-2 batch · One local `npm run build` (n=1),
every gate below read against that same `dist/`, never rebuilt between them. Every figure is printed by a file in this directory.

## 1. Freeze re-pin (ADR-0060)

Red before (`bundle-freeze-before.txt`, exit 1, 13 `::error::` lines): four new basenames, eight new page-entry
pairs, total 1,366,516 outside [1,220,358, 1,348,816] around 1,284,587. No basename or pair was REMOVED.

| Constant | Before | After |
|---|---|---|
| `BASELINE_TOTAL_BYTES` | 1,284,587 | **1,366,516** (+81,929, +6.4%) |
| `BASELINE_BASENAMES` | 56 | +4: `prize-envelopes.js prize-flipcards.js prize-marbles.js prize-zones.js` (each game's module chunk, reached through the `[id]` page glob, not its play route) |
| `BASELINE_PAGE_ENTRIES` | 69 pairs | +8: the `PlayExit` and `play` script pair for each of `game/prize-{zones,marbles,envelopes,flipcards}/play/` |

Green after (`bundle-freeze-after.txt`, exit 0): 41 HTML, 60 basenames, 77 pairs across 41 pages, 1,366,516 within ±5%.
`--selftest` exit 0, 8 case groups. The band and every rule are untouched.

**Three totals, not two.** 1,284,587 pinned · **1,287,416** measured on a build of HEAD `0e15742` (a `git archive`
copy, same `node_modules`; `bundle-freeze-head-0e15742.txt`, HEAD's own gate green) · 1,366,516 now. So +2,829
is carry already in HEAD, in band, and the batch's delta is +79,100.

**Attribution** (`attribute.mjs.txt`, output `attribute-output.txt`). Chunks are matched across the two builds by a
label that does not depend on the hash: play entries by page, renderer entries by registry key, collapsed basenames
by their direct importers. The per-label deltas sum to the gate's own delta exactly (`MATCH`); 68 of 92 labels are byte-identical.

- **+67,850 new code**, MEASURED: renderer entries zones 10,733 · marbles 14,995 · envelopes 12,172 · flipcards 12,130;
  game-module chunks 1,862 / 2,223 / 2,043 / 2,108; play entries 562 / 564 / 566 / 566; the zones plan `plan.js`
  5,396 (also imported by the projector entry); the shared pick-final `plan.js` 1,930 (envelopes and flipcards).
- **+11,250 growth of chunks that already existed**, sizes MEASURED, causes INFERRED (no build isolates them):
  projector play entry +5,532 · `three.module.js` +3,042 · `event.js` +1,125 · `reveal.js` +890 · the `[id]` page
  script +566 · `demo.js` +95. The batch edits those modules (`git status`), the registry gained four entries, and the
  new renderers reach more of the library. Two chunks changed importers with no byte change (ladder's `plan.js`, `paint.js`).

## 2. Per-visitor cost (ADR-0068)

Command, from the repo root (`closure.mjs.txt` is the gh#305 script with the two changes its header names):

```
cp docs/verification/evidence/gh315-318-bundle-2026-11-17/closure.mjs.txt <tmp>/closure.mjs && node <tmp>/closure.mjs dist \
  game/prize-zones/play game/prize-marbles/play game/prize-envelopes/play game/prize-flipcards/play \
  game/prize-fireworks/play game/prize-cards/play game/prize-ladder/play game/prize-draw/play game/croc-bite/play
```

Positive control: on the HEAD build the original and the changed script print byte-identical output
(`closure-output-head-0e15742.txt`). Must-red for the change: on today's build the original reads `cards` out of
`flipcards:` and reports cards activated at 590,450 raw, which is flipcards' renderer (`closure-original-script-misreads-cards.txt`);
the anchored regex reads 601,496.

| Route | Initial raw / gzip | Activated raw / gzip |
|---|---|---|
| prize-zones play | 54,905 / 22,051 | 592,845 / 163,981 |
| prize-marbles play | 54,907 / 22,052 | 591,713 / 163,258 |
| prize-envelopes play | 54,909 / 22,053 | 590,496 / 162,546 |
| prize-flipcards play | 54,909 / 22,056 | 590,454 / 162,523 |
| prize-draw play (projector) | 86,639 / 35,139 | one game 618,857 (zones) to 632,904 (cards); all seven 718,241 / 217,271 |
| croc-bite play (existing user) | 607,177 / 160,670, `three` in the initial closure | same |

**The 2026-11-13 table is stale, and not because of this batch.** On the HEAD build the three gh#305 routes already
load 52,795–52,799 raw initially (37,827–37,835 recorded then); this batch adds about 2,110 to each. Projector
initial: 73,696 at HEAD, 86,639 now. croc-bite pays +3,042 raw on page load from the larger shared library chunk.

**`three` is reached lazily, through the shared host only.** `three.module` is imported statically by exactly eight
chunks: the seven renderer entries and croc-bite's play entry; `reveal.js` reaches it only by `import()`. Each of
the four new renderer chunks is named by `reveal.js` alone and by no HTML page. In the built `reveal.js` the
`"reduced-motion-entry"` fallback (offset 8503) and `"no-webgl2"` (9303) come before `loaderFor(` (9371).
`three in initial: false` on every prize route and the projector; `true` on croc-bite (the positive control).

## 3. Per-route gates, measured

- **Fit** (`fit/`): `ROUTES_ONLY=prize-zones,prize-marbles,prize-envelopes,prize-flipcards`, Chrome `--headless
  --disable-gpu --no-sandbox` (ci-probes.sh's flags), three runs, byte-identical. Every screen of every row: 0px
  clipped, 0px sideways. Eight rows read 0px to scroll → `FITS_ROWS`. **Four rows scroll and were NOT recorded:**
  zones and marbles at 320x568 (3,429px) and 390x844 (3,153px), worst screen press 1, class round, cause INFERRED as the demo's
  round field in the two-column phone layout (the same px as the prize-cards phone rows the 2026-11-14 ruling covers;
  the element that scrolls was not read). No owner has ruled on these.
  `lane/v4-fit.txt` (after the edit) reds on exactly those four; `lane/v4-fit-control.txt`: the walk invariant can fail.
- **Swiftshader** (`lane/ss-*.txt`, Chrome `--headless --no-sandbox --use-angle=swiftshader --enable-unsafe-swiftshader`,
  in-page `getContext`: webgl2 live, webgl live): fit reads the same 12 rows at 0 clipped / 0 sideways (the envelopes and
  flipcards 1440 rows read ink 12 against 15 on the no-context lane, so a different path ran: inferred to be the 3D one); top band green.
- **WebGL lane** (`webgl/`, `scripts/webgl-pixels-lane.sh` itself): run 1 with the four lists empty FAILED each route by
  name, each requesting the same eight extensions; admitted from that record; run 2 clean PASS (22 rows), stub-control
  FAIL as required. Each new row: one context (`webgl2`), one held>free pair (the exercise's own), no retry.
- **Top band** (`lane/v4-topband*.txt`): 12 screens across 4 routes green; the BREAK_BAND control reds all 4. Must-red:
  prize-zones dropped from `DEMO_ROUTES` → `prize-zones D1 1280x800: ... div.pr-bar (fixed top 2px)` (`lane/mr-tb.txt`).
- **Control floor** (`lane/v4-controlfloor*.txt`, full walk): landing `.game-btn` 6 across 6 screens, so `CONTROL_COUNT`
  stays 6 (it pins landing pages; the new games have none). Play buttons: zones 4, marbles 4, envelopes 14, flipcards 14.

Not measured: a runtime network trace, the CDN's compression, rendering quality, a CI-runner run of any lane.
