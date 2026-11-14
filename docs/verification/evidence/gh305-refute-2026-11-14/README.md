# Audit picks (gh#305–#308, gh#314 frames) — REFUTE probes, 2026-11-14

The cross-lineage reviewer's (codex gpt-6.1-sol) probe scripts and notes from the two REFUTE rounds on the
audit-picks artifact (commit `5b0c901`), kept as `.txt` so repo tooling never treats them as code. Local paths
are replaced by `<repo>/`, `<judge-scratch>/`, `<local-path>` and `<tmp-path>`.

- `r2-evidence.md.txt` — round 2: every round-1 status, the clipped-content hole in the new scroll-only rows
  (fixed before commit), the wiring-test gap (accepted as a follow-up), and the band-measure hole.
- `gate-counterexamples.mjs.txt`, `band-dom.mjs.txt`, `band-measure-loader.mjs.txt` — the band-measure
  counter-example: a fixed `top:auto` box inside the band, under an overflow ancestor, passes `play-top-band`.
  It reproduces at the base commit too (pre-existing). The handoff's `next:` line for it starts here.
- `detector-*.mjs.txt`, `mutation-loader.mjs.txt` — the mutations behind the wiring-test follow-up.
- `review-evidence.md.txt` — round 1.
