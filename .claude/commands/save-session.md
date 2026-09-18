# /save-session — override for watduang

master is `~/.claude/commands/save-session.md` · anything this file doesn't declare uses master's default
this file holds only what this repo does differently from master, or what master tells the project to declare itself

## Home of live state is `SESSION-HANDOFF.md` at the root, not `CLAUDE.md`

**No longer an override — master converged to this, checked 2026-08-17.** Master's § State home now
declares `SESSION-HANDOFF.md` the ONE home for session state, and master's RH gives it precedence over
any leftover state section. This section used to claim master said the opposite; it did, once. Kept as
a statement of *what this repo does*, not as a deviation — re-check before treating it as either.

Reason it was worth the fight: `CLAUDE.md` gets injected into context every session; live state is the
one section that changes every round and grows fastest (once ate 3023B of 6549B and hit the ceiling twice
in a single save). Splitting them out gets two things: stable things you must know **before** acting no
longer race state for bytes, and state bytes are never paid in a session that doesn't resume.

**Price to know and guard against:** `SESSION-HANDOFF.md` is **not auto-loaded** — an agent that doesn't run
`/resume-project` sees no state at all · the guard is the line at the top of `CLAUDE.md` that says plainly
that file is state's home, not a supporting doc — **never let that go ambiguous.** Master's RH treats the
handoff doc as "pointer doc, not state" — if that line ever softens, RH will read past it.

**What never moves out of `CLAUDE.md`:** Stack · rules that must not be broken · Agent skills — must-know-before-acting
is the only reason the auto-load file exists. Moving the CSP rule or the no-bottle-image rule to a file that
isn't injected removes the guardrail.

## Window · entry format · archive

- window **N=1** · entry lives in `SESSION-HANDOFF.md` under the `## Current state` heading
- entry header is **h3** `### S<YYYY-MM-DD>#<n>`, not h2
  → `~/.claude/scripts/roll-state-window.sh` only accepts `^## S`; it will always ABORT on this repo
  **this is not format drift**, it's the declared format — fall back to a manual sed move, then confirm 3 asserts
  (block landed in the archive verbatim · source has 0 copies left · archive has 1 copy)
- roll is `SESSION-HANDOFF.md` → `docs/sessions-archive.md`, newest-first append-only · resume never reads the archive
- **tag every `next:` by class, INSIDE the line** (master rule 2026-09-18; missed at this repo's first
  save under it because this section did not carry it):
  - `next: [ ] H: <task> — <why · what to hand back>` — **owner-only**: nothing an agent can advance.
    Money, a real device, owner-reserved Thai copy, a third-party account. RH renders these as Human
    tasks, never as plan rows, so an untagged owner-only item sends the next session hunting for an
    agent slice that does not exist.
  - `next: [ ] <task> — … · Blocked · ask: <question (a/b) | owner edit>` — **agent work waiting on
    the owner**, whether for an answer or for an edit; it rides the pick rather than a separate popup.
  - untagged = agent work, ready now.
  - The two are told apart by **who acts LAST, not who acts next**: owner acts and that is the end of
    it → `H:`; owner acts and an agent still executes afterwards → `Blocked · ask:`, including an owner
    EDIT (ruling 2026-09-18). gh#102/gh#103 is the worked example — the owner edits ten cards, then the
    agent makes portraits from them.
  - `spent: queue` counts open **non-`H:`** items only — `H:` lines are not agent throughput.
  Safe by construction: `scripts/added-lineno-citation-check.mjs` labels a line by `/^([a-z]+):/`, so
  a tag sitting after `[ ]` never changes that line's verdict (probed 2026-09-18).
- **cite a section as `§ "Quoted heading"`, never bare.** An entry is ONE long physical line, so an
  unquoted `§` swallows the prose that follows it: `scripts/check-citations.mjs`'s unquoted-heading
  matcher runs to end-of-line. 2026-09-18 a `done:` clause reading ``§ Budgets excludes `.scratch` ``
  was read as a heading of that whole name, against a real heading of `## Budgets`, and the save
  committed with a dead citation that had to be amended out.
- **the `done:` · `dec:` · `next:` · `inflight:` labels are load-bearing outside this doc.**
  `scripts/added-lineno-citation-check.mjs` exempts `done:`/`dec:` as verbatim record and POLICES
  `next:`, which agents read and act on. It decides **per line**, matching the label at the start of a
  physical line, and anything it does not recognise is policed — that direction fails safe. So: a
  `done:`/`dec:` entry that WRAPS onto a second physical line has its continuation policed, and
  renaming or adding a label silently changes what the gate checks. Change the vocabulary and change
  that script in the same commit. `inflight:` is exempt today behind a named constant there.
- **`done:` and `errors:` follow master's wording verbatim (checked 2026-08-29):** `done:` carries only
  what git cannot show — committed work is cited by SHA, never re-narrated. `errors:` is optional — own
  errors this session, one clause each, class not story — omit the line when there are none.
- **a `next:` item resting on a chat ruling names where that ruling is recorded.** The tracker is the
  source of truth, so a reader checks the ticket — and an owner ruling given in chat is not there.
  On 2026-09-17 `next:` said "close gh#238 — owner answered close-after-push"; the ticket's own last
  comment carried no such wording, and the close was put to the owner as though it did. Write the home
  (`— ruling recorded here, not on the ticket`) so the next session cites it instead of the ticket.
- **a `next:` item's premise names its source — a number, a limit, or a deliverable.** Same failure as
  the bullet above, one step earlier: the premise itself is unsourced, so nobody can cheaply check it.
  On 2026-09-18 a `next:` item asserted "the hook asks for under 140 lines"; no such rule exists
  anywhere in `~/.claude`, the citable limit was already satisfied, and the popup built on it spent the
  owner's decision on work that was not owed. The same round, three `next:` items asserted ticket
  states their tickets had already retired, and one named a deliverable "held outside the repository"
  that is on no disk here. So: a number cites the file or command it came from · a claim about a
  ticket cites the comment DATE it rests on · a deliverable cites its path in the tree, and "held
  outside the repository" is not a location.
- **a `next:` item asking for a MEASUREMENT names the decision that would consume it.** The premise can
  be perfectly sourced and the item still dead, because a closed ticket already ruled on the band the
  number would land in — 2026-09-18, a clean-span item whose consuming decision gh#203 had closed on
  2026-09-05, accepting both named routes. No open decision waiting → the item is record-keeping and
  says so; "re-measure X" reads as blocking work to every later session.

## Budgets

| file | budget | why |
|---|---|---|
| `CLAUDE.md` whole file | **12KB** | auto-loaded every session |
| `SESSION-HANDOFF.md` whole file | **8KB** | read on resume |
| every other `.md` under `docs/` and `.claude/` | **12KB** | routed into an agent's context on demand |
| `docs/sessions-archive.md` · `docs/verification/**` · `.scratch/**` | **exempt** | append-only evidence records, never routed as a doc — the gate would only force splits that buy nothing |

**Master owns those numbers — read them out of `check-budgets.sh`, never trust this table.** Master moved
`SESSION-HANDOFF` 4→6→8KB on 2026-08-15; this table went on claiming 4KB "master's value" until 2026-08-16.
A ceiling copied into prose goes stale the moment master moves it, silently, because nothing re-reads it.
A repo wanting a ceiling *stricter* than master's must declare it in the doc itself — one line, `budgets: state=8KB file=20KB` — not assert it in a table the script never sees.

**Never raise the ceiling to make the ratchet gate pass** — it's been as tight as 98.8% before; the fix is
moving content out per the table below, not squeezing prose shorter, and not picking a new number.

`check-budgets.sh` looks for a section named `## Current state` — it's now split across two files, so run it twice:
`check-budgets.sh CLAUDE.md` for the file ceiling and `check-budgets.sh SESSION-HANDOFF.md` for state.

**It gates ONE file per call** — one green line proves one file, and nothing sweeps the repo. That is how two
docs sat over budget unnoticed. Sweep before saving:

```bash
cd "$(git rev-parse --show-toplevel)" && ! find . -name '*.md' \
  -not -path './node_modules/*' -not -path './.git/*' -not -path './dist/*' \
  -not -path './.scratch/*' -not -path './docs/verification/*' \
  -not -path './.claude/worktrees/*' \
  -not -name 'sessions-archive.md' \
  -exec ~/.claude/scripts/check-budgets.sh {} \; | grep -v '^PASS'
```

Silence = every doc inside its ceiling. Anything printed is a FAIL/WARN plus its heaviest sections — route it into `next:`.

**Run that block verbatim; never hand-roll a `find`.** Its `-not -path` list is not noise, it IS the
exempt column of the table above. A sweep written from scratch omits them and manufactures FAILs on
files an owner ruling already exempted — 2026-09-18 an ad-hoc `find` excluding only `node_modules`,
`.git` and `sessions-archive.md` reported 10 over-budget docs, all of them exempt, and the report went
out as a defect chip before `docs/agents/issue-tracker.md` was checked. The documented block is silent
on this repo.

**The leading `!` is load-bearing — don't drop it.** `grep -v` exits 1 when it matches *nothing*, so the raw
pipeline exits **1 when every doc is healthy and 0 when one is over budget** — exactly backwards for a `&&`
chain, and this file's own gate is "exit 1 blocks a `&&` chain". `!` flips it back. `find -exec … \;` also
swallows `check-budgets.sh`'s own exit 1, so grep's status is the only signal there is. The `cd` is load-bearing
too: the `./`-anchored exclusions stop matching from any other directory.

## Where each thing lives

| data | home | what stays in `CLAUDE.md` |
|---|---|---|
| **live state + next queue + inflight** | **`SESSION-HANDOFF.md`** | 1-line pointer at the top of the file, stating plainly that's the home |
| reasoning behind a decision | `docs/adr/NNNN-*.md` | ADR number only |
| domain vocabulary | `CONTEXT.md` | none |
| gotcha that's true across sessions | `docs/runbook.md` | 1-line trigger (symptom + condition + pointer) |
| spec · ticket · product-level reasoning | GitHub issues | issue number |
| how to work the tracker · labels · domain | `docs/agents/*.md` | 1-line pointer |
| old entries | `docs/sessions-archive.md` | none |

## Must not live in CLAUDE.md

- **live state, any form** — including a status summary line at the top of the file; this file gets only a pointer to `SESSION-HANDOFF.md`
- **reasoning** — `docs/adr/` already holds it; cite the number here
- **history of revised decisions** — the saga lives in the ADR or the archive; a revision **replaces** the old text, never appends
- **numbers countable from `gh`** e.g. issue count or sub-issue count — they rot silently and nobody comes back to fix them
  (once wrote "11 sub-issues" and left it stale until it became 18)

## Must not live in SESSION-HANDOFF.md

- **narrative** — entries are telegraphic per master, not a story
- **reasoning** — same rule as `CLAUDE.md`, cite the ADR number
- **rules you must know before acting** — this file isn't auto-loaded, that kind of thing belongs in `CLAUDE.md`

## Report

Adds one line beyond master: `homes touched:` names which homes this round wrote to besides `SESSION-HANDOFF.md`,
so it's visible whether routing actually works or everything still piles into state the same as before.
