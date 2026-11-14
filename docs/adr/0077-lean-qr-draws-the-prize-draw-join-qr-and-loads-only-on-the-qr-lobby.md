# ADR-0077 — `lean-qr` draws the prize-draw join QR, and loads only on the projector's QR lobby

Date: 2026-11-13 · Status: accepted (owner ruling 2026-11-11, popup: "one small QR library, admitted by its own ADR") ·
Relates: [ADR-0060](0060-one-renderer-for-the-site-three-is-admitted-and-the-freeze-baseline-moves-once.md) (the precedent: one library per job, pinned bare), [ADR-0076](0076-the-prize-draw-qr-join-is-a-second-function-in-the-feedback-app.md) (the join server the QR leads to), [ADR-0033](0033-a-design-value-not-in-the-canvas-is-drift.md), [ADR-0005](0005-page-js-must-never-inline.md), gh#299, gh#308

Evidence: [`docs/verification/evidence/gh308-qr-library-2026-11-11/README.md`](../verification/evidence/gh308-qr-library-2026-11-11/README.md) (candidates, the round-trip probe, the recommendation).

## Context

QR mode of the prize draw (gh#299 decision 4, gh#308): before the first round, the main screen shows a QR that a phone scans to reach the join page. The QR encodes the join link, with the event id and the PIN in the URL fragment (protocol doc, "The QR link"). The projector frame that draws it is `proj-lobby`, direction B, of `design/Gh302Projector.dc.html` (picked 2026-11-11).

The site ships no runtime framework and admits libraries one job at a time (ADR-0060 admitted `three` for 3D and no second 3D library). Encoding a QR symbol means byte-mode segments, Reed-Solomon error correction, masking and format bits. A hand-written encoder would be a second home for a standard this repo does not own, and nothing in the repo could check it except a decoder, which is also not installed.

Owner ruling 2026-11-11 (popup): the main-screen QR uses one small library, admitted by its own ADR, and this is that ADR.

## Decision

**`lean-qr` is admitted at exactly `2.7.4`, pinned bare in `dependencies` (no caret), for one job: drawing the join QR on the projector's QR lobby.** It is MIT-licensed and has no runtime dependencies. It was the smallest candidate measured (6.95 kB min / 3.65 kB gzip, measured on 2.7.2), it renders straight to a canvas, and at equal error correction it produced smaller symbols than the runner-up (33 against 37 modules at M for a 52-character URL). Fewer modules means bigger modules at the same size on screen, which matters at projector distance. Source: the evidence README.

**The pick is pinned by name.** A lookalike package, `qrcode-generator-node`, is malicious (MAL-2026-6061, recorded in the evidence README). The exact name and version are the guard. Raise the version only with a new probe run.

**One importer.** `src/play/prize-draw/lobby-qr.ts` is the only module that imports `lean-qr`. It asks for error correction M explicitly (`minCorrectionLevel: correction.M`), never the library default, which measured as L in the probe. It draws one pixel per module onto a canvas with a 4-module quiet zone, as the QR standard requires (the board's placeholder pattern drew 3), and CSS scales the canvas to the board's 536 px square with pixelated rendering. No SVG string and no markup sink is involved, so the CSP and ADR-0026's sink rule are untouched.

**It loads only on the projector, and only in QR mode.** `stage.ts` reaches `lobby-qr.ts` through `import()`, called only while a lobby record (written by the setup page in QR mode) is on screen. Astro's bundler emits that module and `lean-qr` as their own chunk. An admin-mode event, the setup page, the phone join page and every other route never fetch it. `src/play/prize-draw/lobby.test.mjs` walks the static import graph from the projector's entry and from the setup script and fails if either reaches `lean-qr` or `lobby-qr.ts`. A chunk that fails to load is asked for again with growing waits, about a minute in all, while that lobby stays on screen. The PIN and the joined count stay up meanwhile, and the QR card is hidden (its place kept) until a code is drawn on it, so an empty card never stands in for a code. There is no fallback that admits a phone: the PIN alone does not, because the join page needs the event id the QR carries. If every retry fails, the card stays hidden, and reloading the projector page starts the retries again.

**Bundle cost.** The QR chunk the projector fetches in QR mode is 7,059 B minified and 3,745 B gzip
(`lobby-qr.js`, lean-qr bundled into it; node zlib level 9), measured 2026-11-14 from one local `npm run build`.
The projector route's initial closure is 66,928 B raw / 27,984 B gzip, measured the same way as
`docs/verification/evidence/gh305-bundle-2026-11-13/` (whose 54,743 / 23,691 predates this work). That
difference is not all QR: the lobby code itself ships in the projector entry. The site-wide reachable total
moved +25,998 B (+2.1%), re-pinned in `scripts/bundle-freeze-check.mjs`.
Admin-mode cost should be zero bytes of `lean-qr`, which the import-graph test holds.

**No CSP change.** The chunk is served from `'self'`, which `script-src` already allows, and the canvas needs no `img-src` entry. `public/staticwebapp.config.json` is not touched.

**No second QR library.** As with `three` (ADR-0060): a second QR encoder needs its own ADR that retires this one.

## Rejected

- **`qr` 0.7.2** (MIT or Apache-2.0, 0 deps, 14.9 / 6.6 kB): the runner-up. It has documented byte mode and ECC, but it is about twice the size and draws larger symbols. **Switch to it** if a scan at projector distance fails with `lean-qr` where `qr` succeeds (evidence README, "Recommendation").
- **`uqr` 0.1.3**: young, and its last release fixed an SVG attribute injection, which is the sink class this repo guards.
- **`qrcode-generator` 2.0.4**: stale, with 40 open issues. **`qrcode` 1.5.4**: has 3 runtime dependencies.
- **A hand-written encoder**: a second home for a standard the repo does not own, with no installed decoder to check it against.
- **A static import in `stage.ts`**: it would ship the encoder to every admin-mode event, and that is most events.
- **Drawing the QR as an SVG string**: it would need a markup sink, and a canvas does not.

## Consequences

- The projector's QR lobby works without a network round trip for the QR itself. The symbol is encoded in the browser from the lobby record.
- `lobby.test.mjs` checks the drawn pixels against `lean-qr`'s own matrix at the same options, the payload string, and that correction M was asked for. No QR decoder is installed in this repo, so no test decodes the symbol. A camera scan of a projected image is gh#310's rehearsal (iOS Simulator, by owner ruling), and the evidence README's probe decoded each candidate's output with `jsqr` in an isolated scratch directory.
- The dependency is one more name in `package.json` and the lockfile, so a supply-chain review covers it: it has 0 runtime dependencies, and its version is pinned exactly.

## Not covered

- Scanning at real projector distance and brightness (gh#310).
- What the bundle actually weighs once built (the bundle-cost line above, which the orchestrator fills in after the build).
