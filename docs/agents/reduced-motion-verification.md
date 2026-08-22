# Reduced-motion verification

Moved out of `browser-verification.md` to stay under the house doc budget. One of the three
verification tasks `CLAUDE.md` routes here for (320px, reduced-motion, refresh-and-resume) — see
that file for CDP setup, the driver scripts, and the traps that fire while driving a probe.
The traps that fire while judging what you captured — detector calibration among them — live in
`interpreting-browser-captures.md`.

## Reduced motion

`--force-prefers-reduced-motion` flips `matchMedia('(prefers-reduced-motion: reduce)')` — verified
both ways (absent → `false`, present → `true`). Run the page with and without it and compare at
runtime; do not conclude from an identical DOM dump, which is equally consistent with "handled
correctly in CSS" and "ignored entirely". A page with no animation at all is **N/A, not pass** —
recording a non-existent animation as a passing accessibility check is a lie in the tracker.
