# Is this ticket actually actionable?

Read this before briefing an agent onto a ticket or building a queue from one. A label and a
`state` are both signals, and both read as wider than they are — each has dispatched agents onto
finished or owner-blocked work.

Tracker mechanics — `gh` commands, เลขใบ arithmetic, the citation ban for issue bodies — live in
`docs/agents/issue-tracker.md`. Label strings live in `docs/agents/triage-labels.md`.

## `state: OPEN` is not proof work is undone either — check the artifact

`docs/agents/issue-tracker.md` says an unticked DoD box proves nothing and to read `state` instead. `state` is weaker than it looks: work lands and nobody comes back to close the ticket. A full-backlog plan on 2026-08-30 came out **42% stale** — of 19 rows, four were already shipped (gh#120's fix is commit `5bd204f`, whose message names the ticket), one had 7 of 8 boxes done, two were owner-blocked, one rested on a false premise. Two rows were genuinely undone code. Three agents were dispatched onto finished work and returned zero-file diffs, costing about 186k tokens.

**Do not try to detect this from the commit log.** That was tried and calibrated on 2026-08-30, and it fails in both directions: `git log --grep="gh#14"` matches gh#146 and gh#145 by substring; adding a word boundary returns nothing at all, because git's POSIX regex has no `\b`; and `--grep="^fix.*gh#120"` finds zero commits even though `5bd204f` is titled exactly that. A detector that silently returns nothing is worse than no detector.

**Check the artifact instead.** Take the ticket's top acceptance criterion and resolve it against `src/` and `dist/` before writing any brief. Confirming all four randomizer tools existed — source files present, built into `dist/`, and in the sitemap — took 0.006s. Budget about a minute for a whole batch. Sitemap membership matters as much as the build on this site: a page that builds but is unlisted is shipped and unfindable, which is not "done".

## A label answers the condition it was moved for, which is narrower than it reads

`ready-for-agent` does not mean an agent can start. A label is moved to discharge **one** named
condition, and the comment that moved it says which — every other blocker on the ticket survives the
move untouched.

Measured 2026-09-15: gh#103 carried `ready-for-agent`, and its last comment justified the move by
saying the ดูดวง copy **direction** was settled. Read alone, that licenses an agent to write the Thai
strings. The ticket's own body says `Blocked by: the first-ten portrait ticket, and the owner's
approval recorded there` — a chain running through gh#102 to owner-authored copy, which
`CLAUDE.md` reserves to the owner outright. Direction settled is not authorship granted. Reading
gh#101, gh#104, gh#106 and gh#109's last comments in full confirmed all four independently. `gh#102` was then found carrying the same wrong label, only because the check was run across the whole family rather than on the one ticket named.

**So: the label shortlists, the body's `Blocked by` and the last comment decide.** Read both before
briefing, and read them whole — a `ready-for-agent` row whose blocker is owner work costs a dispatch
that returns nothing, and the same session's queue had 14 of 16 rows dead behind labels that did not
say so.
