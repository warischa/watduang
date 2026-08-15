# ADR-0009: A DoD box whose proof set we do not own is mis-scoped, and evidence outside the repo is not evidence

Status: accepted · S2026-08-14#7 · supersedes nothing · amends the verification practice in
`docs/agents/browser-verification.md`

## The problem

S2026-08-14#6 walked the four random-tool issues in a real browser and recorded **"23 PROVEN · 8
UNPROVEN · 0 FAILED"** in the handoff. The per-box verdicts and evidence paths lived in a session
scratchpad and were never committed. One session later the scratchpad was empty and the mapping was
gone — not degraded, gone. The surviving counts could not rebuild it: #15–#18 hold 59 checkboxes, 18
already ticked, so 41 were unticked, and 31 ≠ 41 while 18 + 31 ≠ 59.

Re-deriving it cost a full second walk. That is the whole cost of the defect, and it was paid twice.

## What the re-walk established

31 is not a mystery: #16 + #17 + #18 unticked = 11 + 11 + 9 = **31**. The prior session never walked
#15 at all. Re-walking those same 31 boxes yields **22 PROVEN, not 23** — the lost report was
over-counted by one, and nothing could have revealed that except doing it again.

Full re-walk of all 41: **30 PROVEN · 0 FAILED · 8 UNPROVABLE · 3 UNDECIDED**.

## Two decisions

**1. Verification evidence lives in the repo or it does not exist.**

Committed at `docs/verification/`: four per-box reports, 21 text artifacts, and the non-vacuity record.
Screenshots were deliberately **not** committed — 15 PNG files at 1024K against 21 text files at 84K,
with `.git` at 2.1M, and a check confirming **no box cites a `.png` without also citing a `.txt` or
`.json`**. So the screenshots were corroboration, never a box's sole proof. Dropped references are
annotated in place, never silently deleted, and `docs/verification/README.md` states plainly that a
screenshot-only visual regression cannot be re-checked from the committed record.

The rule is not "commit everything". It is: **the artifact that a verdict rests on is committed, and
what was dropped is named.**

**2. A box whose proof set we do not own is mis-scoped, not unprovable.**

Every checkbox implies a set its proof must enumerate. Ask who owns that set *before* walking:

| Class | Proof set | Owner | Disposition |
|---|---|---|---|
| browser behaviour | built `dist/` behaviour under our probes | **ours** | walk it; converges |
| ad-slot (4 boxes) | ad rendering under prod CSP on a live deploy | Google + a deploy that does not exist | UNPROVABLE until deploy; a `dist/` grep proves the slot *ships*, never that an ad *renders* |
| red-green history (4 boxes) | the immutable past | history that already happened | **the literal claim is false** — see below |
| owner-gated | the owner's phone, domain, credentials | not ours | bound via the checklist; never walk |

Walking harder never converges on a set we do not own. The plan must bound the real thing instead.

## The red-green boxes were false, not unprovable

Four boxes assert a test went red before it went green. `git show --stat` on `24fe2c8` and `94505f6`
shows each carries the implementation **and** its test in the same commit — no commit ever existed in
which the test was present and the fix absent. The claim is not merely unverifiable; it is untrue.

The invariant underneath it *is* ours: revert the fix, watch the test fail. Done in a worktree, that
found **3 NON-VACUOUS and 1 VACUOUS** — the random-exactly-1 clamp has no test injecting `() => 1`,
and the same gap exists in `draw.ts` and `number.ts`. A test that passes with the fix and without it
guards nothing.

So these boxes get **reworded to the non-vacuity invariant, visibly and with the owner's approval** —
never silently, which would be moving the goalposts. Reworded #15-14 still must not be ticked until
those three clamp tests exist.

## Consequence

A DoD box is written against a set we own, or it is written as explicitly owner-gated with its
unblocking event named. "Unprovable" is a verdict about ownership, not about effort. And a walk that
does not commit its evidence has not been done — it has been rehearsed.

## The fact that would change this

If committed text artifacts turn out insufficient to re-check a verdict a later session actually
disputes, then the screenshot economy was wrong and visual evidence must be committed too — accept
the repo weight. The three reduced-motion boxes are the likeliest place to find out, since they are
`UNDECIDED` precisely because the tools have no motion to suppress.

## Outcome, S2026-08-15#5

**Flip-fact not triggered — screenshot economy holds.** The prediction above named the reduced-motion
boxes as the likeliest place to discover that committed text is insufficient. `pick-loser`'s
reduced-motion axis was settled without any visual evidence: `document.getAnimations()` sampled 0
across both runs, which distinguishes *no animation exists* from *could not tell* at runtime and
yields **N/A** rather than `UNDECIDED`. Text artifacts were enough. Still untested for a box where
motion actually exists.

**Application refined, same session.** This ADR's "browser behaviour → ours → walk it; converges" was
read once as demanding a fresh capture at every HEAD that touches the wiring. That reading makes the
proof set *future development*, which never terminates — the exact mis-scoping this ADR exists to
prevent, applied to itself. The correction: a capture is pinned to its commit, and the re-trigger must
be **decidable per commit**. The seam that decides it is enumerated in
`docs/agents/browser-verification.md` § "When a committed capture goes stale — and when it does not".
Note the reason is *not* that future commits are unowned — they are ours; it is that a per-commit seam
test terminates. Evidence: [#20](https://github.com/warischa/watduang/issues/20) closed on it.

## Related

Verification practice and the traps that produced confidently wrong answers:
`docs/agents/browser-verification.md`. Party-size set-vs-location reasoning this ADR generalises:
[ADR-0007](0007-party-size-rule-constrains-the-set-not-the-location.md). Reports:
`docs/verification/README.md`. Issues: [#15](https://github.com/warischa/watduang/issues/15) ·
[#16](https://github.com/warischa/watduang/issues/16) ·
[#17](https://github.com/warischa/watduang/issues/17) ·
[#18](https://github.com/warischa/watduang/issues/18).
