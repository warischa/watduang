# Session handoff — วัดดวง

**This is the home of live state, not a supplement** — `CLAUDE.md` no longer has a § Current state; resume reads this file as the primary source.

Format · window · budget · roll: `.claude/commands/save-session.md` · Rationale for every decision lives in GitHub issues and `docs/adr/` — **never restate it here, cite the number** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state

### S2026-08-14#8

done: **#15–#18 DoD closed out, `e8d4183`** (10 files, +302/−76) — **36 of 41 boxes ticked live**, 5 withheld: #16-08 (PROVEN but pressable-path half has no committed artifact) + ad-slot #15-09 #16-10 **#17-11** #18-09 (externally owned) · box-ID→checkbox mapping **proven, was the open unknown**: report `## #<n>-<NN>` ID set == unticked-index set on all 4 issues (59 boxes/18 ticked/41 unticked) + text match + adversarial re-check → `box-verdict-map.tsv` (41 rows, each carrying BOTH texts so a fabricated match is detectable) + `dod-closeout-15-18.md` · 4 red-green boxes **reworded + old→new comment on each issue** (body edit alone buries the change in edit history) · 3 UNDECIDED **annotated N/A, ticked on the proven readability half**, ADR-0009 deliberately NOT cited (it governs sets we don't own; this one is owned and empty) · **4th clamp test added — all 4 tools now measured per set member**; reverting `team.ts:28` had left its suite fully green · `site-owner-checklist.md` §4 domain-join added, no-ALIAS fallback = nameserver migration not registrar forwarding (which breaks the apex canonical, `astro.config.mjs:5`) · `ci.yml` + `save-session.md` Thai→English, non-comment bytes unchanged · verified: 77/77 · build 0 · tsc 0 · impl files byte-identical to `abf1167`

dec: **`belowMin` is NOT a dead guard — #7's `dec:` and ADR-0007 were false; ADR-0007 amended, result REFUTED.** `CONTEXT.md:18-19` already had the correct narrower wording the same day and the ADR cited that entry while asserting the opposite — Unreachable only from the zero-selected *branch*; fires from `startBtn` whenever fewer names than `min` are ticked (`PlayerSetup.astro:225` → `player-select.ts:79`, caught firing in `tools-15-18/15.md:34`). Owner **declined the issue**; a test pins the branch-local fact instead · red-green boxes: the old wording quantified over **immutable git history** (owned by nobody, never converges) — reworded onto a re-checkable artifact property · ticking 4 red-green boxes was **my inference from the reword, not in any option the owner read** (they approved 29 + the 3 motion) — disclosed, untick on request

next:
- [ ] #16-08 needs a committed pressable-path artifact to become tickable (#15-07/#17-09 make the same claim and already have one) — 1 box, cheapest remaining tick
- [ ] `docs/runbook.md:45-46,73-74` — Thai still in its own `Do:` blocks; agent-facing, owes English
- [ ] 4 ad-slot boxes (#15-09 #16-10 #17-11 #18-09) unblock **only** on a deploy + AdSense — checklist §2, then §4 for the domain
- [ ] #13 DoD4 real phone needs **§2 only** (a deploy) · #9 domain · Azure token (**only real CSP/AdSense proof**) — owner-gated, checklist §1/§2/§4
- [ ] [#24] one checkpoint slot site-wide — dormant until a 2nd game writes one (ADR-0008 flip-fact)
- [ ] ⚠ fork, REFUTE **and** my own doc all said `#17-13` for #17's ad-slot box; the TSV says **#17-11**. The artifact-derived write was right, the prose wrong — derive, never recall

inflight: measured at save — 3 commits on `main` (`e8d4183` work · save · this delta+ADR-0007) and **pushed** (authorized this turn) · open PRs: none · 8 subagents returned · GitHub writes: 4 issue bodies + 4 comments, executed with set-equality asserted before AND after each write (a count of 36 would have passed while ticking the wrong 36) · orchestrate ledger: session scratchpad, NOT committed — durable facts are in this entry + `dod-closeout-15-18.md`
