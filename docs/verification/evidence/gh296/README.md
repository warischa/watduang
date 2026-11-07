# gh#296 evidence: desktop layout of the four tool pages vs their boards

Renders and measurements only; no src/design edits.

## Method
- `npm run build`, `npx serve dist/ -l 4391`; headless Chrome/156.0.8078.80 on `--remote-debugging-port=9371`
  (own `--user-data-dir` under the session scratchpad, GPU on). Ports 4321/9222 untouched.
- `capture.mjs` (raw CDP, adapted from gh263-canvas): 1280x900 and 1440x900, `mobile:false`, dsf 1, reduced motion,
  `document.fonts.ready`, scroll pass, full-page JPEG q70, sliced with `magick -crop` (`-partN`) when over 150KB.
  Boards from `file://design/Tool{Wheel,Number,Draw,Team}Desktop.dc.html`; pages from `/tool/{wheel,number,draw,team}/`
  (wheel in its initial state, no names). Every run echoes `innerWidth` = requested width (checked, all 16).
- `measurements.json`: per capture, tool area / main column rect, `sideBySideColumns` (distinct left x of the
  top-level blocks in the tool area), `scrollWidth` vs `clientWidth`, nearest computed `max-width` cap with selector,
  and the first internal multi-track grid. Board "tool area" = tallest band under `x-dc > div`; page = `main > div`.

## Verdict per tool (1440; 1280 gives the same widths)
- wheel: built page: 1 column, 544px (cap `.wheel-column` max-width 544px; wrapper 576 with padding); board: 2 columns, 940px main + 300px rail.
- number: built page: 1 column, 940px (cap `.tool-column` 940px); board: 1 column, 940px (no rail).
- draw: built page: 1 column, 940px (cap `.tool-column` 940px); board: 2 columns, 940px main + 300px rail.
- team: built page: 1 column, 940px (cap `.tool-column` 940px); board: 2 columns, 940px main + 300px rail.

## What this means
- The other three tools do NOT ship the phone column: they already ship the 940px column, with the two-track grid inside
  their tool card (number 427+427, draw 427+427, team ~431+431). Only wheel ships the 544px phone column.
- The boards' second "column" is a 300x600 dashed placeholder labelled as an ad rail pending ADR-0004 approval
  ("rail ... needs owner approval"), not tool content. No built page ships it (all four pages: 1 block column). So the
  decision for wheel is the 940px column plus the wheel card's internal two-track layout (wheel left, result/controls right);
  the rail is a separate question that applies to draw/team/wheel boards alike.
- The wheel board also contains gh#262 annotation/variant panels below the main card; they are board-only review content.
- Boards are fixed 1440 wide: at a 1280 viewport their scrollWidth is 1440 (> clientWidth 1280), expected, not a page defect.
  All built pages: scrollWidth == clientWidth at both widths.

## Visual check
Opened the 1440 wheel board part0 and the 1440 wheel page full size, and downscaled contact sheets of all the other
images (all 1440 and 1280 captures). Thai renders as glyphs everywhere (no dotted circles), no page blank, 0 broken images.
Small Thai on contact sheets was judged at reduced scale only. Boards load Mitr/Noto from Google Fonts (network);
`fonts.check` for Mitr read false on the number board's measurement only, but its Thai headings rendered in the display face.
Boards logged 1 JS exception each (wheel/draw/team; `jsErrors` in the JSON), not investigated; renders unaffected.

## Files
`capture.mjs`, `measurements.json`, `board-<tool>-<w>.jpg` / `-partN.jpg`, `page-<tool>-<w>.jpg` for tool in wheel, number, draw, team and w in 1280, 1440.
