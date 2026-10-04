# gh#251: body text at least 16px on phones (evidence)

Base commit `def4563`. Owner ruling 2026-10-04 (the ticket's last comment): body roles must reach
16px on phones. Body roles are taglines, tile descriptions, hub bodies, FAQ answers and tool helper text,
plus the name-entry textarea. Labels, pills, badges and breadcrumbs may stay smaller.

## Instrument

`body-font-probe.mjs` is a labeled variant of the 2026-10-04 audit probe. That probe stored only the bare
size of each sub-16 element. This one records the selector path, size, text snippet and role of every
visible element with its own text, and of every text input and textarea. The role comes from the probe's
`ROLE_MAP`, first match wins. A sub-16 element that matches no entry counts as UNCLASSIFIED. It is
reported, never passed. Empty helper notes (`.wheel-note`, `.draw-note`, `.team-note`) are measured
anyway through `FORCED`.

Role map (selector → role):

| Role | Selectors |
|---|---|
| body:tagline | `.tool-tagline`, `main > h1 + p` (the bare wheel and number taglines) |
| body:tile-description | `.featured .desc`, `.tile .desc`, `.game-card > p`, `.tool-card > p` |
| body:hub-body | `.sec-copy p` |
| body:faq-answer | `.faq-item p` |
| body:tool-helper | `.name-hint`, `.draw-note`, `.team-note`, `.wheel-note` |
| body:name-entry-textarea | `#name-input` |
| exempt:pill | `.chrome-pill`, `.pills li` |
| exempt:badge | `.badge`, `.tool-badge` |
| exempt:breadcrumb | `.breadcrumb`, `.breadcrumb a`, `.tool-back` (the tools' back-to-all-tools row) |
| exempt:label | ad labels (`.ad-slot`, `.ad-label`, `.ad-sub`, `.ad-slot-mobile`), `.tool-eyebrow`, `.wheel-mode-option`, `.draw-count`, `.team-count`, **`.kicker`, `.card-cta`, `.draw-box h3`, `.number-actions button`** |

**Owner to confirm.** The four bold label entries are my classification, not the owner's words. Kickers
are the section labels in the pop-card canvas comment. `.card-cta` is the short card call to action.
The draw-box `h3` is the caption over the chip box. The number buttons use Chrome's 13.33px UA default,
because the number page has no canvas. If any of these counts as body, the after-run reports it as body
under 16px.

The ticket's acceptance box names `ui-audit-probe.mjs`. Check that box with this probe. The old probe
counts every sub-16 element, exempt ones included, so it stays non-zero by design.

Must-red for the UNCLASSIFIED bucket: I ran a copy with an empty `ROLE_MAP` on `/tools/`. It listed all 4
tool-card bodies as UNCLASSIFIED.

## Commands

Run `npm run build`, then serve `dist/` with `npx serve -l 4381`. Use headless Chrome with
`--remote-debugging-port=9381` and a fresh `--user-data-dir`. I served the unchanged build from a copy
of `dist/` taken at `def4563`.

```
CDP_PORT=9381 W=320  OUT=before-320.json  SHOTS=<dir> node scripts/driver.mjs docs/verification/evidence/gh251/body-font-probe.mjs
CDP_PORT=9381 W=1440 OUT=before-1440.json node scripts/driver.mjs docs/verification/evidence/gh251/body-font-probe.mjs
# same two runs against the changed build -> after-320.json, after-1440.json
node docs/verification/evidence/gh251/compare-sizes.mjs before-1440.json after-1440.json
CDP_PORT=9381 node scripts/driver.mjs docs/verification/evidence/gh251/note-fit-probe.mjs
```

Every run reported `innerWidth` equal to the width I asked for.

## Results at 320 (n = 8 pages, one run each)

| Page | elements | body < 16 before | body < 16 after | UNCLASSIFIED after | exempt < 16 after |
|---|---|---|---|---|---|
| `/` | 61 | 13 | 0 | 0 | pill 3, badge 1, label 1 |
| `/c/party/` | 61 | 14 | 0 | 0 | pill 6, breadcrumb 2, label 18 |
| `/c/fortune/` | 28 | 3 | 0 | 0 | pill 6, breadcrumb 2, label 7 |
| `/tools/` | 12 | 4 | 0 | 0 | none |
| `/tool/wheel/` | 35 | 2 | 0 | 0 | label 2 |
| `/tool/number/` | 31 | 0 | 0 | 0 | label 2 |
| `/tool/draw/` | 38 | 4 | 0 | 0 | breadcrumb 1, badge 1, label 4 |
| `/tool/team/` | 36 | 4 | 0 | 0 | breadcrumb 1, badge 1, label 3 |

Before the change, 44 body-role elements were under 16px. After, there are 0. The 320 compare lists
exactly those 44 elements as the only size changes.

## Desktop at 1440

`compare-sizes.mjs` compared 310 elements on 8 pages and found 3 diffs. All three are `#name-input`
going from 15 to 16 on wheel, draw and team. The owner ruling names the textarea, and the Tool*Desktop
artboards already draw it at 16px. Every other element has the same size before and after.
`.name-hint` keeps its 12px desktop size through a `min-width: 1100px` rule.

The desktop artboards draw `.name-hint` at 13px. That gap predates this ticket, and I left it alone.

## Overflow and fit

- `scrollWidth === clientWidth` holds at 320 on all 8 pages, before and after.
- `scripts/home-page-probe.mjs` (normal-motion leg only, one Chrome) returned all verdicts true, with
  calibration "red-then-clean on all 5 widths". Output: `home-page-probe-after.json`.
- `scripts/narrow-overflow-probe.mjs` returned bad 0 of 12. Its control (`BREAK_GUARD=1` plus an
  80-character token) went red with bad 6 of 12. Outputs: `narrow-overflow-after.json`, `-control.json`.
- The draw and team notes are capped at two lines (`height: 3em`) and scroll beyond that.
  `note-fit-probe.mjs` wrote every status line into the real note box. At 16px, every line fits in two
  lines at 320 and 390, with one exception: on draw at 320, the "not enough left" line with three-digit
  counts takes a third line and scrolls inside the box. At 13px the same line fitted in two lines
  (`note-fit-before.json`). The same line with one- or two-digit counts fits. The layout does not move.
  The draw comment records the exception. The control string overflowed in every after-run.

## Not covered

- Text that appears only mid-round: team result cards (`.team-card-members`, 14px on phones; the
  ToolTeam390 canvas also draws the member lists at 14px), draw results and chips, and the wheel result.
  Team member lists are not on either owner list, so I left them unchanged. Owner to classify.
- Game pages. ADR-0050 does NOT exclude them: it takes only party-game surfaces out of ADR-0033. The
  fortune game pages keep their page shape. They were outside this run's page list and were not audited.
- `/tool/number/` has no canvas: no artboard names it and its source cites none. Its tagline is already
  16px.
- I did not render the canvases. The edits were checked by re-reading every sub-16 `font-size` left in
  each board.

## Screens

`screens/<page>-320-{before,after}.jpg`: full-page captures at 320, taken after a scroll-through so
lazy art loads. Each file is a JPEG of 150000 bytes or less, re-encoded at the highest quality that fits.
