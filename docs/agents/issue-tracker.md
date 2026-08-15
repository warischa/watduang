# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

**Repo:** [`warischa/watduang`](https://github.com/warischa/watduang) (private) — created 2026-08-13

## ✅ Migrated 2026-08-13 — GitHub Issues is canonical

The map is **issue #1** (`wayfinder:map`) with 11 sub-issues. All 10 labels exist. Dependencies use GitHub's native issue-dependency API.

**Ticket number → issue number: add 1.** Ticket `07` is issue `#8`.

| ticket | issue | type | state |
|---|---|---|---|
| — | #1 | map | open |
| 01 | #2 | research | closed |
| 02 | #3 | research | closed |
| 03 | #4 | research | closed |
| 04 | #5 | grilling | closed |
| 05 | #6 | grilling | closed |
| 06 | #7 | prototype | closed |
| 07 | #8 | grilling | closed |
| 08 | #9 | task | **open** |
| 09 | #10 | grilling | closed |
| 10 | #11 | grilling | closed |
| 11 | #12 | task | **open** |

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

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

### เลขใบ vs เลข issue

หัวข้อของ issue ขึ้นต้นด้วย **เลขใบ** ซึ่งไม่ใช่เลข issue — **เลขใบ + 1 = เลข issue**
(ใบ 12 = issue #13) ตอนสร้างใบใหม่ต้องคำนวณจากเลข issue ถัดไป ไม่ใช่นับจากใบล่าสุด

อย่าจดจำนวน issue หรือจำนวน sub-issue ไว้ในเอกสารใดๆ — นับจาก `gh` เอาตอนที่ต้องใช้
ตัวเลขที่จดไว้จะเน่าเงียบและไม่มีใครกลับไปแก้

### `.scratch/` — อย่า gitignore ทั้งโฟลเดอร์

สำเนา issue และ map ใน `.scratch/` ถูกลบไปแล้วตอนย้ายมา GitHub แต่
`.scratch/free-game/{research,prototypes}/` **ยังมีไฟล์ที่ track อยู่** — งานวิจัย demand,
นโยบายโฆษณา, กฎหมาย, และ prototype ของ player shell

ถ้า gitignore ทั้ง `.scratch/` ของพวกนี้จะหลุดออกจาก repo เงียบๆ โดยไม่มีอะไรแตกให้เห็น

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

