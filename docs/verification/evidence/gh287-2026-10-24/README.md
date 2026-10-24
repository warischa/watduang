# gh#287 box 1 — which play routes the CI runner renders in a non-self-hosted Thai face

Measured 2026-10-24. Answers gh#287 DoD box 1: enumerate the routes whose rendered Thai text on the runner is not in a self-hosted face, using the platform-font read, not the declared stack.

## Instrument

- `scripts/play-screen-fit-probe.mjs`, dormant knob `FONT_READ=1` (commit b7311e4). It is report-only and gates nothing, and with the knob unset its output is byte-identical to the previous probe. For every screen the fit walk measures, it reads `CSS.getPlatformFontsForNode` on each laid-out Thai text node inside the mockup root, including `visibility:hidden` text, field text, and pseudo-element content. Each element is classed by Chrome's `isCustomFont`, checked against the page's own `document.fonts`:
  - `custom`: self-hosted faces only (Sarabun, Mitr)
  - `system`: non-custom faces only
  - `mixed`: both
  - `unread`: an empty or failed read, which never counts as clean
- **at-risk** = the box the screen's fit line names (scrolling, clipping or sideways) contained a `system` element at the moment of MEASURE.
- Run on the runner by the branch-only workflow `gh287-fonts.yml` on `ci/gh287-fonts`. It is never merged and is not a `ci.yml` step. Head ffa0256 carries the same probe bytes as b7311e4.
  - Run 40065527286, Chrome 155.0.8059.39.
  - Fit lane flags `--headless --disable-gpu --no-sandbox`, `FIT_SHARDS=3`.
  - **Leg A** is the runner as it ships. **Leg B** is the same build in fresh Chromes after `apt-get install fonts-noto-core`.
- Review: two REFUTE rounds (codex) found 9 defects. All are fixed, each with a unit test that was red on the old code.

Files: `runner-a-*.txt` and `runner-b-*.txt` (`*-fonts.txt` is `fc-list ':lang=th'`; `*-shard<n>.txt` is the probe's full output). `mac-3-routes-font-read.txt` is the final code on this Mac for one-bomb, cannon-flag and zero-trigger, on the no-WebGL fallback board.

## Calibration

- `fc-list ':lang=th'`: leg A prints nothing; leg B lists Noto Sans Thai, Noto Serif Thai and Noto Looped Thai.
- `FONT_READ CAL` reads `calibration=OK` at all 3 viewports in both legs. On the system side, one-bomb's how-to-play rules read `system`, 4 of 4 li. On the custom side, `p.ps-hint` reads `custom Sarabun:48`. WebGL is live on the runner (`canvas-in-root=1`).
- Leg A has 320 FONT_READ lines and leg B 318. Both legs have 0 ANOMALY, 0 READ FAILED, and 0 at-risk `unknown` (no frozen member drifted).

## Box 1: routes with Thai in a non-self-hosted face (leg A, runner as shipped)

Distinct `system` elements, over every screen read:

| route | system elements |
|---|---|
| one-bomb | 23 |
| wire-snip-panic | 17 |
| pinocchio-luck | 13 |
| cursed-number | 11 |
| zero-trigger | 10 |
| cannon-flag | 5 |
| short-stick | 4 |
| freeze-tap | 3 |
| power-meter | 3 |

0 on bangkok-drift, croc-bite, dice-loser, how-close-is-near and timebomb. The three shell-rendered games have no play route and no fit row, so they are outside the set.

No face on the leg-A runner covers Thai (`fc-list ':lang=th'` is empty), so every one of those elements draws its Thai as tofu. The faces reported in `system` elements are Liberation Sans, DejaVu Sans, Noto Color Emoji, and the Liberation and DejaVu mono and serif faces. They carry the elements' Latin, digits and emoji. gh#286 saw Chrome attribute the Thai tofu itself to DejaVu Sans.

## Which fit rows it reaches

15 of the 18 `KNOWN_OVERFLOW` rows have at least one screen where the box the fit line names contains system-face Thai on leg A:

- cannon-flag 320x568
- cursed-number at all 3 viewports
- freeze-tap 320x568
- one-bomb 320x568
- pinocchio-luck at all 3 viewports
- power-meter at all 3 viewports
- short-stick 320x568
- wire-snip-panic 320x568
- zero-trigger 320x568

No `FITS_ROWS` row is at-risk. At-risk is containment, not cause: it says the measured box holds tofu text, not that the tofu made the pixels.

What a Thai face changes, leg A against leg B, same job. These are the rows whose row-level numbers differ (11 of 42):

| row | leg A scroll / clip / sideways | leg B |
|---|---|---|
| one-bomb 320x568 | 171 / 79 / 6 | 176 / 0 / 0 |
| cursed-number 320x568 | 703 / 0 / 0 | 651 / 0 / 0 |
| cursed-number 390x844 | 298 / 0 / 0 | 283 / 0 / 0 |
| cursed-number 1440x900 | 28 / 0 / 0 | 34 / 0 / 0 |
| pinocchio-luck 320x568 | 270 / 0 / 11 | 270 / 2 / 0 |
| zero-trigger 320x568 | 145 / 0 / 0 | 138 / 0 / 0 |
| short-stick 320x568 | 161 / 0 / 0 | 156 / 0 / 0 |
| freeze-tap 320x568 | 43 / 0 / 0 | 37 / 0 / 0 |
| wire-snip-panic 320x568 | 61 / 0 / 0 | 71 / 0 / 0 |
| cannon-flag 390x844 | 0 / 0 / 0 | 0 / 3 / 0 |
| cannon-flag 1440x900 | 0 / 0 / 0 | 0 / 3 / 0 |

The one-bomb 79px clip going to 0 reproduces gh#286's diagnostic (runs 39622359316 and 39626259353). That is the positive control for this table.

## Hand-read: `mixed` and `unread`

- **`mixed`** appears on 174 leg-A screen lines.
  - On leg A, every non-custom face inside a `mixed` element contributes at most 1 glyph: Noto Color Emoji, DejaVu Sans or Liberation Sans, i.e. an emoji, a space or punctuation. So no tofu Thai hides in `mixed` on the runner as shipped.
  - Leg B shows the read can go high: on short-stick, three elements read Sarabun plus Noto Sans Thai at up to 131 glyphs. Their stacks put a system face that covers Thai ahead of Sarabun. On a machine with no Thai face that falls through to Sarabun; on one with Noto Sans Thai, as Android ships, it does not.
  - So leg A **undercounts** system Thai against a phone for that stack shape. short-stick reads 4 system elements on leg A and 8 on leg B.
- **`unread`** appears on 9 leg-A screen lines, in these elements: `span#hud-dist` and `span#hud-speed` (bangkok-drift HUD), `div#lcd-sub-status`, an unnamed `span`, and `span#roundTag`, `h2.headline`, `p.support`, `p.locked-note` plus one more. They are counted on neither side.

## Not measured

- n=1 per leg. Self-timed and multi-draw rows (zero-trigger, pinocchio-luck, freeze-tap, wire-snip-panic) can move run to run, so a few px of leg-to-leg difference on those rows is not attributed to the face. one-bomb's 79px is attributed, because gh#286 reproduced it.
- Thai drawn into a canvas or WebGL texture, which no DOM read sees.
- Screens past `PRESS_CAP`.
- The final probe on this Mac read only 3 routes. An all-routes run of the round-0 instrument agreed on the route set, but that run is not evidence of the final code and is not kept here.
- A real phone.

## Box 3: the re-record after the owner picked a Thai face (2026-10-24)

Owner ruling 2026-10-24 (gh#287 box 2): `ci.yml` installs `fonts-noto-core` before the browser lanes (commit a164bd1). `box3-noto-rows.txt` holds the 42 fit row lines of three runs of that commit, with no exemption changed. The three runs agree on every row except cursed-number 390x844 (283 / 231 / 231px), a self-timed route.

"Affected" was read from the reason strings, not from the at-risk list above. At-risk says a measured box held tofu Thai; it does not say the recorded px came from the runner. Of the 18 `KNOWN_OVERFLOW` rows, the 2 `KNOWN_OVERFLOW_X` rows and the 3 `PLAYER_SCREEN_SCROLLS` rows, only these current readings were taken on the runner:

- **one-bomb 320x568 (`KNOWN_OVERFLOW`).** The reason's runner lane (171 / 79 / 6) was re-recorded as 176 / 0 / 0 on all three runs. Its recorded 174px is this Mac's player screen and does not move. Per screen, on all three runs: player screen (press 0) 176px to scroll; round screen (press 1) 0px on every axis. The walk reaches 2 screens, not 3, because before the font press 2 was a second reading of the clipped dialog. That runner round-screen clip is what sent this row to its `KNOWN_OVERFLOW` fallback on 2026-10-20. With it gone, that ruling's first choice is open again: `FITS_ROWS`, with the player screen excepted. That move is a reclassification, so it is left to the owner.
- **pinocchio-luck 320x568 (`KNOWN_OVERFLOW_X`, runner 11px, Mac 0).** It read 0px sideways on all three runs, so both machines are now under tolerance and the row was removed, by the deletion rule its 390x844 sibling states.

Every other recorded px is this Mac's, and a runner font does not move it. The cursed-number 320x568 drift warning (703px against a recorded 689px) stops firing, because the runner now reads 651px.
