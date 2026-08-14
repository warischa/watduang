# /save-session — override for watduang

master is `~/.claude/commands/save-session.md` · anything this file doesn't declare uses master's default
this file holds only what this repo does differently from master, or what master tells the project to declare itself

## Home of live state is `SESSION-HANDOFF.md` at the root, not `CLAUDE.md`

**This directly overrides master** — master treats `SESSION-HANDOFF.md` as a fallback mode for projects
with no structure yet, and tells you to demote it to a pointer once a state section exists. **This repo does the opposite, deliberately.**

Reason: `CLAUDE.md` gets injected into context every session; live state is the one section that changes
every round and grows fastest (once ate 3023B of 6549B and hit the ceiling twice in a single save). Splitting
them out gets two things: stable things you must know **before** acting no longer race state for bytes, and
state bytes are never paid in a session that doesn't resume.

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

## Budgets

| file | budget | why |
|---|---|---|
| `CLAUDE.md` whole file | **12KB** (master's value) | auto-loaded every session |
| `SESSION-HANDOFF.md` whole file | **4KB** (master's value for this file type) | read on resume |

**Never raise the ceiling to make the ratchet gate pass** — it's been as tight as 98.8% before; the fix is
moving content out per the table below, not squeezing prose shorter, and not picking a new number · the 4KB
figure above is what master already declares for `SESSION-HANDOFF`, not a number invented to pass.

`check-budgets.sh` looks for a section named `## Current state` — it's now split across two files, so run it twice:
`check-budgets.sh CLAUDE.md` for the file ceiling and `check-budgets.sh SESSION-HANDOFF.md` for state.

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
