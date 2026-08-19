# gh#46 and gh#47 — run-level calibration of four gate steps

Four CI gates were fixed in one branch. Each one's green had been claiming coverage it had not
earned, which is ADR-0019 rule 1, and each is calibrated here as its own set member rather than
once for the group — the CI-verification agent doc records a real case in this repo where a gate
calibrated both ways on one member covered 1 of 4.

## What was wrong

`no-nav-in-stage-check` and `arm-gate-coverage-check` hardcoded a seven-entry `TARGET_FILES` list, so
a seventh game shipped past both carrying the exact violations they exist to catch. Both also printed
the size of their own list as the number of modules "clean" — with an `existsSync` skip in the loop,
that number could claim seven after reading six.

The CSP allowlist check used `csp.includes(src)`, which is directive-blind: a domain moved from
`script-src` to `img-src` is still "present", so the gate stayed green while the AdSense loader was
blocked. The inline gate scanned `<script>` elements only, so a hand-written `onclick=` passed.

## What makes the green side load-bearing

All four steps run as `node <script> --selftest && node <script>`. Every both-ways selftest case
therefore executes inside CI, not only on a developer machine. The green run below is the evidence
that detection works in the real environment; each red only has to prove the YAML actually blocks,
which is the one thing a local run can never show — a `|| true`, a bad indent, or a devDependency
that never reaches CI all pass locally.

## The pairs — one variable each

Base tree for every pair: `0141d32`.

| side | head | the one variable | run id | conclusion |
|---|---|---|---|---|
| green | `0141d32` | the four fixes, nothing broken | 32236532126 | **success** |
| red 1 | `96b5b5f` | `<span onclick="void 0">` added to `src/pages/index.astro` | 32236823650 | **failure** |
| red 2 | `ee54d1f` | `*.googleadservices.com` moved `script-src` to `img-src` | 32236826180 | **failure** |
| red 3 | `cff1766` | `el('a', 'x')` appended to a game stage | 32236829426 | **failure** |
| red 4 | `0e4ed63` | `cleanup.push(armAllButtons(stage))` commented out | 32236831926 | **failure** |

Each break is one file and one line against the base, verified with
`git diff --stat 0141d32..<branch>`. Each is the real regression its gate exists to catch, not a
sabotaged assertion — a sabotaged assertion proves blocking while proving nothing about detection.

Red 4 deserves its own note. Commenting out that exact line is the bypass ADR-0019 recorded as
failing open: the assertion matched unstripped source, so the text stayed present and the gate
exited 0 with every button in that render function ungated. It now goes red, so this pair
re-proves the comment-stripping fix at run level as well as the wiring.

## Step identification is local, and that is stated rather than implied

Every break was proven locally to turn its intended gate red **and leave its sibling green** before
being pushed:

| break | intended gate | sibling |
|---|---|---|
| red 1 | `csp-inline-check` exit 1 | `csp-allowlist-check` exit 0 |
| red 2 | `csp-allowlist-check` exit 1 | `csp-inline-check` exit 0 |
| red 3 | `no-nav-in-stage-check` exit 1 | `arm-gate-coverage-check` exit 0 |
| red 4 | `arm-gate-coverage-check` exit 1 | `no-nav-in-stage-check` exit 0 |

Without that isolation a CI red could have come from an earlier step and proved nothing.

## What this does not prove

Which step went red. `/actions/runs/<id>/jobs` 404s on this repo, so per-step conclusions are
unreadable and the run-level `failure` is the whole of the observed signal. The identification above
is the local isolation table, recorded as such rather than letting four reds imply per-step verdicts
they did not earn.

It also does not prove the gates are sufficient. Each names its own ceiling in a `ponytail:` header,
pinned by a selftest so a future widening goes red before the header goes stale: the game-set glob is
flat, so a game in a subdirectory ships unscanned; the CSP pair list is a dated snapshot and
additions Google makes later never go red; the inline gate cannot see runtime-assembled attributes
or exotic embeds.

## Deploy safety

`gh api .../actions/secrets` returned `total_count: 0` immediately before every push in this session,
so no run had a deploy path and no push was a deploy. The five calibration branches were deleted
local and remote after the conclusions above were read.
