# DoD close-out — #15–#18

What was ticked on the four `/tool/*` issues, what was withheld, and the evidence behind each.
Companion to `box-verdict-map.tsv` (the box-ID → live-checkbox join) and the four reports in
`tools-15-18/`.

## The mapping, proven three ways

The reports address boxes as `#<issue>-<NN>`. That ID is the **1-based index over every checkbox
line in the issue body** — verified independently, not assumed:

1. **Index arithmetic.** For all four issues the report's ID set equals *exactly* the set of
   unticked checkbox indices: #15 17 boxes/7 ticked, #16 14/3, #17 15/4, #18 13/4 — 59 boxes,
   18 ticked, 41 unticked, and 41 report sections.
2. **Verbatim text.** All 41 report box texts match their live checkbox text; no issue contains a
   duplicate unticked box text, so the index result cannot be a coincidence of ordering.
3. **Independent adversarial re-check** against bodies fetched live.

## Tally

Counted from the reports, not from any agent's self-report: **30 PROVEN · 0 FAILED ·
8 UNPROVABLE · 3 UNDECIDED = 41.** The 8 UNPROVABLE are two unrelated groups: 4 ad-slot boxes
(#15-09 #16-10 #17-11 #18-09) blocked on Google plus a deploy that does not exist yet, and the 4
red-green boxes below.

## Ticked: 36 of 41

| Group | Count | Basis |
|---|---|---|
| PROVEN | 29 | report verdict, minus the one withheld below |
| red-green, after rewording | 4 | #15-14 #16-13 #17-14 #18-12 — see below |
| reduced-motion, after annotation | 3 | #16-11 #17-12 #18-10 — see below |

## Withheld: 5 of 41

- **#16-08** — "มีทางกดต่อเข้าเกมโดยรายชื่อวงไหลต่อไปครบ". Verdict is PROVEN, but the pressable-path
  half has no committed artifact. Withheld deliberately. #15-07 and #17-09 make the same claim and
  *do* carry committed link evidence; #16 does not.
- **#15-09 #16-10 #17-11 #18-09** — the ad-slot boxes. Externally owned (Google + a production
  deploy). Unblocking event is named in `docs/site-owner-checklist.md` §2.

## The 4 red-green boxes: why they were reworded

Each asserted the test had been written **fail-first** — a claim about the order the work happened
in. Both commits carried fix and test together, so the claim as written was false, and it could
never become true: git history is immutable and the set it quantifies over is owned by nobody.

The reword moves the invariant off history and onto a property of the artifact that is re-checkable
forever: *revert this file's clamp and the test must fail; restore it and the test must pass.*

Every one of the four is now backed by an actual red-run, per set member — not inferred from a
sibling. This matters because `docs/runbook.md:81` records the opposite failure: a CI gate
calibrated on the wheel page while blind to the other three.

| Box | Tool | Clamp reverted | Result |
|---|---|---|---|
| #15-14 | wheel | `Math.min(names.length - 1, …)` in `wheel.ts` | new test failed, then passed on restore |
| #16-13 | draw | same clamp shape in `draw.ts` | new test failed, then passed on restore |
| #18-12 | number | same clamp shape in `number.ts` | new test failed, then passed on restore |
| #17-14 | team | `Math.min(i, …)` in the Fisher-Yates loop, `team.ts:28` | new test failed 1/10, then 10/10 on restore |

`team` was the last one measured and nearly shipped un-measured: the first pass covered wheel, draw
and number only, and reverting team's clamp left its suite fully green — the clamp had no test at
all. Team's *other* two invariants (no player lost, team sizes differ by ≤1) were separately
red-run and were already caught by existing tests.

## The 3 reduced-motion boxes: why they were annotated N/A

"เคารพการตั้งค่าลดการเคลื่อนไหว และผลลัพธ์อ่านได้จากตัวหนังสือเสมอ" — a compound box. The
readability half is PROVEN in each report. The motion half has **no referent**: only the wheel
animates, and the four DoD lists were templated from one another, so draw/team/number inherited a
clause about motion they never had.

Annotated N/A on the motion clause, ticked on the readable half, with a rider that motion added
later must honour `prefers-reduced-motion` the way `wheel.astro` already does.

Deliberately **not** cited: ADR-0009. That ADR governs proof sets we do not *own*; this set is
owned and simply empty. Citing it would invite a later dispute on a rule that does not apply.

## Correction to an earlier claim

`SESSION-HANDOFF.md` carried "`belowMin` unreachable = dead guard → own issue". That is false as
written. `belowMin` fires from the startBtn path whenever fewer names than `min` are ticked —
`PlayerSetup.astro:225` passes the raw selection to `resolveStart`, `player-select.ts:79` sets the
flag, and `tools-15-18/15.md:34` records it firing with real error text. Only the **zero-selected
branch** cannot reach it, because that branch substitutes `numberedPlayers(...)` first.

The guard is load-bearing. No issue was filed; a test in `src/shell/player-setup.test.mjs` pins the
branch-local fact instead, and its name scopes the claim to that path.
