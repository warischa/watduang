# gh#308: choosing the QR encoder (2026-11-11)

Owner ruling 2026-11-11 (popup): QR on the main screen uses one small library, admitted by its own ADR (ADR-0077, reserved). This file holds the evidence that ADR cites.

## Candidates

The candidates were researched against the npm registry, bundlephobia and GitHub on 2026-11-11, by a researcher agent. Each claim had a source URL in its return. The URLs are listed in the orchestrator ledger, and the figures below were copied from it.

| package @ version | license · runtime deps | min / gzip | published | note |
|---|---|---|---|---|
| `lean-qr` 2.7.4 | MIT · 0 | 6.95 / 3.65 kB (measured on 2.7.2) | 2026-09-07 | renders straight to canvas; `get(x,y)` matrix; last commit 2026-11-10 |
| `qr` 0.7.2 | MIT or Apache-2.0 · 0 | 14.9 / 6.6 kB | 2026-09-28 | documented byte mode and ECC; boolean matrix output |
| `uqr` 0.1.3 | MIT · 0 | 11.4 / 4.4 kB | 2026-04-03 | 0.1.3 fixed an SVG attribute injection |
| `qrcode-generator` 2.0.4 | MIT · 0 | 20.2 / 7.2 kB | 2025-08-07 | stale; 40 open issues |
| `qrcode` 1.5.4 | MIT · 3 runtime deps | 23.6 / 8.8 kB | 2024-08-05 | rejected: has runtime deps |

Lookalike warning: `qrcode-generator-node` is a malicious package (MAL-2026-6061). Pin the exact name.

## Probe — ran 2026-11-11, n=1 per row

`probe.mjs` encodes two join-URL shapes (52 and 66 ASCII characters) with each library. It draws each symbol to a bitmap with a 4-module quiet zone, decodes it with `jsqr@1.4.0`, and exits non-zero on any mismatch. The must-red control inverts the top-left finder pattern, and the decode then has to fail.

- The packages were installed into an isolated scratch directory with `--ignore-scripts`, never into the repo. To re-run, install `lean-qr@2.7.4 qr@0.7.2 jsqr@1.4.0` the same way and replace `<pkgs>` with that directory.
- Output: `probe-output.txt`. Every row round-trips, the control fails to decode, and rc=0.
- `lean-qr` produced smaller symbols at equal ECC: 33 vs 37 modules at M, and 37 vs 41 at Q, for the 52-character URL. On a projector, fewer modules means bigger modules at the same on-screen size.

## Recommendation (orchestrator)

`"lean-qr": "2.7.4"`, exact pin. Set the correction level explicitly with `minCorrectionLevel: correction.M`, never the undocumented default, which measured as L. The runner-up is `qr` 0.7.2. Switch to it if a real-phone or simulator scan at projector distance fails with lean-qr where qr succeeds.

Not covered: camera scans of a projected image. The rehearsal (gh#310) covers that, on the iOS Simulator by owner ruling, since the camera itself cannot be simulated.
