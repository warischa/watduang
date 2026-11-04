# gh#292 — feedback page and links, browser proof, 2026-11-04

Built `dist/` served with `npx serve` on port 4331, headless Chrome on CDP port 9232
(`scripts/driver.mjs`, `setWidth` = a real emulated viewport). Raw readings: `page-probe.json`.

## Layout, 8 pages x 320/1024/1440 (24 readings)

- No sideways scroll on any reading (`scrollWidth` equals `innerWidth` on all 24).
- `/feedback/`: two native forms, both `post` to `/api/feedback`, kinds `feedback` and `game`.
  Cards side by side at 1440 (left 98 and 730, 612px each); stacked at 1024 and 320 (the 1099px
  reflow). Every visible control is at least 54px tall; every input and textarea computes 16px.
- `noindex`: on `/feedback/sent/`, `/feedback/failed/` and `/404.html`; absent on `/feedback/`.
- Links to `/feedback/`: home band CTA (160x56 at 1440, full width at 320 and 1024), the white
  cross-card on both category pages (460x72 at 1440), the card beside the back link on the tools hub
  (213x72), and the outline pill on the 404 page (48px tall). Every one of them is in page chrome.
  None is in a play surface.

## One real browser submission

The page's own game form at 320, typed into and submitted with `requestSubmit()`. Its action was
repointed to a local capture server (no production write). Captured `application/x-www-form-urlencoded`,
and the endpoint's own `parseSubmission` returned `store`, with the Thai name and its double quotes
intact. The message keeps its line break as CRLF, and its leading "=" gets the apostrophe in the
CSV row. The browser then landed on `/feedback/sent/`.

Must-red: an empty feedback message makes `checkValidity()` false with `valueMissing` true, so the
browser refuses it before any request.

## Looked at

Screenshots of the feedback page at 1440 and 320, the party page cross-link row at 1440, and the
home band at 320 match design A, L1 and L2 of `design/Gh292FeedbackProposals.dc.html`. The honeypot
is not visible. Full-page captures show blank bands below the first screen: that is the site's scroll
reveal, not missing content. A capture scrolled to each link shows it rendered.

## Not covered

- A real phone (gh#141 queue): iOS zoom-on-focus is inferred from the 16px reading, not observed.
- The deployed page: it is not on production yet; the endpoint itself is proven in `endpoint-proof.md`.
