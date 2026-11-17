Result: FAIL
G1 still open — `scripts/evidence-local-path-check.mjs:106`: `<hyphen-encoded home path>` remains admitted. Accepted scope decision; no delimiter-preserving fix found. base: new repo-wide exemption; RAN current helper.
G2 still open — `scripts/evidence-local-path-check.mjs:106`: digit-leading and supplied Thai inputs now red, but combining-mark accounts still escape below.
E1 closed — `src/play/prize-draw/stage.ts:161`: ready zones receives `data-field`; phone selector and marker tests pass. Browser rendering unverified.
E2 still open — `src/play/prize-zones/renderer/plan.ts:237`: prefix counterexamples are refused; Unicode line terminators remain accepted.
C1 still open — `src/play/prize-zones/renderer/plan.ts:168`: original 200-long-name geometry passes; a near-capacity seated layout still escapes below.

[spot-fix] P2 · Confirmed · `scripts/evidence-local-path-check.mjs:106` · hyphen account matcher: `<hyphen-encoded home path>` returns zero repo-wide hits because matching stops before the combining mark and reads reserved `example`.
base: new exemption; RAN current and HEAD helpers. HEAD reports a hit. Adding `\p{M}` catches this account while keeping exact placeholder paths green; scratch probe verified both.

[spot-fix] P3 · Confirmed geometry · `src/play/prize-zones/renderer/plan.ts:168` · zoneGrid: an accepted 192-person roster, with wrapped names at slots 0/4/8 per zone, produces a 328px block at scale 1. Seated bottom reaches 475.393px beyond panel bottom 475px.
base: new renderer, absent at HEAD; RAN real event construction and layout/pose computation. The fitting branch reserves no seated-drop margin.

[spot-fix] P3 · Confirmed · `src/play/prize-zones/renderer/plan.ts:237` · eventKeyOf: `048213\u2028:round1:000123` returns an event key containing U+2028; U+2029 also passes. Exclude both from segments.
base: new renderer; RAN helper counterexamples, not merely diff inspection.

Fit admission · `scripts/play-screen-fit-probe.test.mjs:2007`: no existing-row check weakened; prior px/date pins remain, and clipping/sideways rejection still passes.
Coverage RAN in `<scratch>`: `node --test scripts/play-screen-fit-probe.test.mjs src/play/prize-draw/zones-{idle,phone}.test.mjs src/play/prize-zones/renderer/{plan,layout}.test.mjs` — 125/125 passed.
Coverage RAN: `node ./scripts/evidence-local-path-check.mjs --selftest` — 44/44 calibration fixtures passed.
Coverage RAN: `node <scratch>` — counterexamples confirmed. Browser confirmation needs a permitted session: Chrome exited; connector required unavailable approval.
would change if: combining-mark accounts red with placeholders green, Unicode key terminators are refused, and seated chips remain contained for the accepted near-capacity roster.
