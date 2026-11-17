# Adversarial review, 2026-11-17 — gh#315–#318 batch

Two rounds on the codex lane (gpt-6.1-sol @ xhigh), the batch's REFUTE cap. `r1/` holds round 1's four
lenses (G gates, E event and host, C cut games, F finals), `r2/` round 2's two (A gates and zones, B
finals and marbles): each lens's verdict as returned, and the judges' probes copied as `.txt` (local
paths sanitized; a few literals split so the record does not trip the gate it describes).

Two probes are NOT kept here: round 1's gate probe and round 2's lens-A probe. Their inputs are
local-path counterexamples by design, so the repo-wide local-path gate reds on any copy of them. The
same cases live, built at runtime, as must-red fixtures in the gate's own selftest
(`node scripts/evidence-local-path-check.mjs --selftest`), which is where they are enforced.

Outcome per finding: the batch commit message and the session ledger. One finding stays open by
decision: a hyphen-encoded account that begins with the reserved placeholder cannot be told from the
placeholder plus a subdirectory, and is named as a known blind spot beside the matcher.
