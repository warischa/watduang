Result: FAIL

[spot-fix] P3 · `src/play/pinocchio-luck/overrides.css:178` · `.css-puppet .css-mouth:after`: the shortened box does alter painted output. At fallback viewports 390x844 and 1440x900, comparison of supplied crops confirms 16 changed pixels each, maximum channel delta 34/255. This needs acceptance under the no-look-change rule; “same visible shape” is not exact.
base: not run — no live HEAD render; compared supplied before/after images. The difference is new in those images.

Confirmed: supplied gauge crops are pixel-identical at 320, 390 and 1440, including their Thai marks. Other fonts and charging states remain unverified.
Confirmed: `scripts/play-screen-fit-probe.mjs:1057` ignores ≤1px, while 2px proceeds to rejection. Admission relies on existing slack but cannot make this row permanently green; it satisfies the probe’s normalized “measured 0px” rule.
Confirmed: measurement and exported gate functions match HEAD; existing keys and numeric bounds remain intact. Each selector has one target in its built route.

Coverage: six source slices; image comparisons RAN. Current tests RAN: `node --test <scratch> — 93/93. HEAD tests RAN from scratch: `node --test <scratch> — 93/93. Independent browser rendering was unavailable.

would change if: the owner explicitly accepts the documented tongue antialiasing drift, or revised crops demonstrate identical paint.
