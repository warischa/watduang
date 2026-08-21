# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

**Repo:** [`warischa/watduang`](https://github.com/warischa/watduang) (private) — created 2026-08-13

## ✅ Migrated 2026-08-13 — GitHub Issues is canonical

The map is **issue #1** (`wayfinder:map`). All 10 labels exist. Dependencies use GitHub's native issue-dependency API.

**Ticket number → issue number: add 1.** Ticket `07` is issue `#8`. The 2026-08-13 migration created tickets `01`–`11` as issues `#2`–`#12`; everything after that was filed on GitHub directly and has no ticket-number twin beyond the same +1 rule.

⚠ **Never derive the next ticket number from `gh issue list`** — it shows open issues only, and PRs share the number space. On 2026-08-17 the open list topped out at `#29` while the real highest number was `#36`; a ticket prefix computed from that list would have been wrong by seven. Create the issue first, read the number GitHub actually assigned, then set the title from it — or query `--state all` across both issues and PRs.

**Issue state is not mirrored here.** Ask GitHub:

```
gh issue list --state all --json number,state,title
```

A state table used to live in this file. It was wrong in both directions twice in a single session
(2026-08-15: ticket `07` listed open while closed, ticket `10` "corrected" to open while closed),
because a hand-maintained copy of a live source rots between the moment it is written and the next
time anyone reads it. Deriving state costs one command; trusting a stale row costs a re-litigated
decision.

### GitHub is the only copy

The pre-migration markdown originals under `.scratch/free-game/` were deleted 2026-08-13 once GitHub was confirmed a superset. There is no local copy to fall back on — `gh issue view <n>` is the source of truth.

`.scratch/free-game/research/` and `.scratch/free-game/prototypes/` are **not** duplicates — they are artifacts the issues link to. Keep them.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`
- **DoD boxes are never ticked**: an issue closes via a comment naming the evidence, and the checkboxes stay unticked as the record of what the DoD asked for.
  An unticked box is therefore not proof work is undone — read `state` from open/closed (#30/#31/#32: closed, 0/7, 0/5, 0/4 ticked).

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

### เลขใบ vs issue number

A ticket title starts with **เลขใบ**, which is not the issue number — **เลขใบ + 1 = issue number**
(เลขใบ 12 = issue #13). Computing a new เลขใบ must derive from the next issue number, never
from the last เลขใบ seen.

Never record issue counts or sub-issue counts in any doc — count them from `gh` at the moment
you need them. A recorded count rots silently and no one goes back to fix it.

### `.scratch/` — never gitignore the whole folder

The issue and map copies under `.scratch/` were deleted once the migration to GitHub landed, but
`.scratch/free-game/{research,prototypes}/` **still hold tracked files** — demand research,
ad-policy notes, legal notes, and the player-shell prototype.

Gitignoring all of `.scratch/` would drop those files out of the repo silently, with nothing
visibly breaking.

## Citations in issue bodies: symbols, never `path:line`

`scripts/added-lineno-citation-check.mjs` polices `path:line` citations a push **adds to tracked files**. It is diff-scoped per ADR-0025, and it converges, because the set it enumerates is this repo's own.

GitHub issue bodies are not in that set. `gh issue edit` fires no CI, so nothing scans them — and no scanner ever would converge, because GitHub owns that set and mutates it off-push. The one bounded set we own here is **authorship**, and this file is the chokepoint every agent routes through. So this is a ban, not advice:

**Never pin a citation to a line number** — no source path carrying a trailing colon and a line, in an issue body, an issue comment, or an acceptance criterion. Anchor to a durable symbol instead — a constant, an exported function or type, an ADR id, or a rule named in words (`LEGACY_ID`, `refusalCopy()`, ADR-0021, the absent-`gen`-reads-as-0 rule).

One exception, with a condition attached: **narrative** prose — in a body or in a comment — may cite lines if it states the commit they were pinned to (`re-verified against the tree at 29765a2`). That covers the description of a bug, and it covers a comment reporting rot, which cannot be written without quoting the rotted citation. Either way they are a record of where something was, not a pointer into the current tree. An **acceptance criterion** gets no such exception — a criterion has to stay evaluable after the tree moves, and a criterion nobody can evaluate quietly becomes a criterion nobody ticks.

Rotted body on a live ticket: re-word the criterion to a symbol, and mark the narrative historical with the commit it was written against. Do not re-anchor the description of a bug that is already fixed.

Live instances when this rule landed: #53, #29. Decision and the declined alternative: ADR-0026.

This rule states the shape rather than showing an example on purpose: `added-lineno-citation-check.mjs` cannot tell use from mention, so a literal example here fails the build.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments` then keep only `authorAssociation` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE` (drop `OWNER`/`MEMBER`/`COLLABORATOR`).
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either — resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (`gh api` on the sub-issues endpoint). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies** — the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only — the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (`gh issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me` — the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.

