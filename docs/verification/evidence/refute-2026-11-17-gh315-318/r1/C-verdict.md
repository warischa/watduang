Result: FAIL
1. `src/play/prize-zones/renderer/plan.ts:98` · `gridLayout` · med · [spot-fix] · **Confirmed:** wrapped names overflow their zones.
   Concrete input: 200 unique names, each four `ฒำ` clusters followed by eight binary choices of `ฒำ`/`ณำ`. `createEvent` accepts this roster. Using measured advances from the shipped Sarabun Bold font, the real renderer produces two-line chips: top-zone names span y=59.5–551.5, overlapping the header and next zone; bottom-zone names reach y=946.5, inside the result band. Grid height needs a bound; the idle CSS has the same capacity problem.
   base: new — absent from HEAD; RAN the current renderer probe, so no base version exists to run.
   Evidence: RAN `node --test <scratch>` — one counterexample confirmed.
Coverage: read the inline diff plus six bounded slices; RAN plan, mount, idle, host-fallback and arming suites successfully. No real browser/WebGL render; the probe used shipped-font measurements and inspected generated chip geometry.
would change if: the measured wrapped-name roster fits an overflow-safe layout in both the reveal and pre-draw idle view.
