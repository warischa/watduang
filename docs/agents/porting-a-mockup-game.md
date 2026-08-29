# Porting a mockup game

**Current target (ADR-0050, 2026-08-29): a port lands as a full-screen play route** — the shape
`freeze-tap`, `power-meter`, and `cannon-flag` already ship in — not a retrofit of the old game
landing page, which ADR-0050 deletes. The recipe is **run-as-is, then full assess**: the mockup is
carried into the repo whole and must run before anything is adapted; a full assessment pass against
the shared concept follows, and fixes come off that checklist. The freeze-tap (มือลั่น) mockup's dark
visual design is the design reference every port targets. The step-by-step recipe lives in
`docs/agents/play-route-recipe.md` (gh#138, written after the third port) — follow THAT for a new
port; this file stays for the stage-module method it documents, which party games no longer use.

Written after two ports — `freeze-tap` (มือลั่น) and `power-meter` (วัดพลัง) — that used deliberately
different methods so the difference could be measured. This file is the merged method, plus the
measurements that justify each choice. Games 3-10 start here.

The mockups live outside this repo, one folder per game, each a single standalone HTML file with its
logic and styles inline.

## What was measured, so nobody re-litigates it

| | freeze-tap: builder read the mockup | power-meter: builder read only a written spec |
|---|---|---|
| Thai strings | ~15 invented or reworded, cost 2 rework rounds | **55/55 byte-exact, zero paraphrases** |
| Tuning constants | not systematically checked | **41 of 42 exact** (the miss was the spec's own arithmetic) |
| Design stage | 13.2 min | 22.3 min |
| Build stage | 9.3 min | 27.9 min |
| Mutants surviving the first check | 3 | **7, plus one assertion vacuous by construction** |

So: writing a spec first wins decisively on **fidelity** and loses on **cost** and on **test quality**.
The merged method below keeps the fidelity win and removes both losses, by moving fidelity work out of
the model's hands entirely and by refusing to hand the builder a test plan.

## Two rules that cost a CI round each to learn

**Never read the mockup's companion `.md`.** Read the HTML. The `power-meter` handoff doc disagreed
with its own HTML in 11 places, the worst being a scoring model off by a factor of ten across all
seven of its test vectors — a builder trusting it ships a wrong game behind green tests. Both games'
docs also falsely claimed `prefers-reduced-motion` support that the HTML did not contain.

**"Locally green" is three commands, not two.** `npm run ci` is a long chain and `ci-probes` is *not*
in it, so the seven browser probes only run in the workflow.

```bash
npm run ci && npx astro check && npm run ci-probes
```

## Do these two things once, before game 3

### 1. Fix the test harness, not each game's tests

Four of `power-meter`'s seven surviving mutants were harness limitations, identical in every game:

| hole | what it hides |
|---|---|
| `innerHTML` stored as a plain string with no children | an `<a href>` inside any `innerHTML` constant — an ADR-0014 hazard behind a green test |
| `matchMedia().addEventListener` is a no-op stub | the reduced-motion `change` listener registers into nothing and no test notices |
| `clientWidth` is 0 | any canvas or measurement path bails, so the whole effect layer is untestable |
| the leak sweep reads a list the test already emptied | timers and listeners that survive `dispose()` |

Put a corrected fake DOM in `src/games/_template.test.mjs` together with the assertions every party
game needs anyway: buttons armed per render, no navigation target in any screen *including* inside
`innerHTML` strings, and a dispose sweep that sees every timer and listener the mount created.
This is the single highest-value item on the list — the test file is ~45% of each port's lines.

### 2. Extract strings and constants with a script, not a model

Do not ask a model to copy 132 Thai strings and 42 constants. Write the extractor once: pull every
quoted Thai span and every named numeric constant out of the mockup's HTML into a data file. It is
deterministic, it takes seconds, and it cannot paraphrase — which is the entire failure mode that cost
`freeze-tap` two rework rounds.

The extracted file then does double duty: it is the builder's input, and a conformance check can grep
the built module against it mechanically instead of a reviewer reading 900 lines.

## The per-game pipeline

**Stage 1 — extract (script, no model).** Strings and constants, mechanically, from the HTML.

**Stage 2 — design (one model pass, small).** State machine with every branch's terminal state ·
what the shell already owns and must be deleted · effects inventory as separable items with code costs ·
graphic direction as a table of element → role in the game → token, because leaving that to the
implementer means it gets improvised · what is deliberately not ported, including a wide banned-copy
sweep. **Do NOT write a test plan here.** Handing the builder a finished list of assertions makes it
satisfy the list instead of hunting for what breaks; that is the measured cause of the test-quality
regression.

**Stage 3 — owner gate (one question batch, before the build).** Which effects ship · any colour with
no token that fits · anything the design flagged as reserved. Deciding these after the build cost
`freeze-tap` 11.5 minutes of rework.

**Stage 4 — build (one model pass).** Implements from the extract plus the design. Writes its own
tests by deriving its own failure modes, on the corrected harness. Ships UNWIRED — registering the
game is the orchestrator's step.

**Stage 5 — adversarial check.** Mechanical conformance (grep the extract against the module) plus a
mutant hunt. Require the mutant, not the suspicion: for every load-bearing assertion, name a change
that should break it, plant it, confirm red, restore, confirm the hash matches.

## Wiring a finished game — the orchestrator's step, and the order matters

1. `src/games/manifest.ts` — import with the full `.ts` extension (plain node reads this file and
   cannot guess it) and add to the array.
2. `src/pages/game/[id].astro` — add the stylesheet import **in the same change** that registers the
   game. That block's own comment explains why: earlier, a sheet imported without a registered game
   shipped its rules to every game page with nothing consuming them.
3. `node scripts/make-og.mjs <id>` — must come after step 1, because it resolves the id against the
   manifest. Then **open the PNG and look at it.** Thai vowels shatter into ◌ placeholders with no
   error on this machine, and one card shipped that way already.
4. `npm run build` once. Never `npx astro build` — only the npm lifecycle runs the validate prebuild.
5. Run the dist-reading gates against that same `dist/`. Never rebuild between them.
6. Re-baseline the two pinned-count gates. **Both trip on every new game by construction:**

| gate | pins | why a new game trips it |
|---|---|---|
| `scripts/bundle-freeze-check.mjs` | the chunk basename set exactly, plus total bytes within 5% | a new chunk name, and one game's bytes exceed the band |
| `scripts/control-floor-probe.mjs` | `CONTROL_COUNT`, the `.game-btn` controls across two screens per page | a new page renders new controls |

Both demand a re-record **with the reason**. Attribute the delta before changing the number: a net +1
can hide a +2 with something else silently dropping to 0. Name which game contributes what, and confirm
no other game's module and none of the shell changed in the same commit.

7. All three verification commands. Then the pre-merge adversarial pass. Then commit.

## Constraints that are real, and one that is not

Real, each enforced: no inline script (the site's CSP would not execute it) · no `saveCheckpoint()`
outside `siamsi.ts` — a refresh restarts the round · no navigation target inside the stage ·
`armAllButtons(stage)` as a literal call in every render function that builds a button, because an
indirection defeats the static scan · the literal `matchMedia('(prefers-reduced-motion: reduce)')` in
the same file as the motion, gating it for real — a comment mentioning it does not count, and one game
shipped exactly that false comment for months · comments in English with Thai quoted inside double
quotes or backticks · every colour a token referenced by name.

**Not real, and it was briefed as a hard rule twice:** `localStorage` is *not* forbidden in a game
module. No gate forbids it and every file under `src/tools/` uses it. Only `saveCheckpoint()` is gated.
Wrap each access in try/catch and namespace the key `watduang:`.

## Two things a machine cannot close

Nobody has played either game in a real browser. The tests use a fake DOM, and the browser probes check
invariants — overflow, tap-target size, control counts — not whether the game is coherent or fun. And
the mockups' colours are neon on a dark ground while this site is a warm light one, so a palette cannot
be carried across mechanically: gold and amber measure 1.42:1 and 1.75:1 against white and cannot hold
text at any size. Both gaps are the owner's eye, not a gate's.
