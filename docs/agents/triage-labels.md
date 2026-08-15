# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

All five triage labels above exist in the repo's live label set (`gh label list`). Edit the right-hand column only if the vocabulary changes.

## Wayfinder labels

`/wayfinder` uses a separate label namespace, unrelated to triage, also live in the repo:

| Label | Meaning |
| --- | --- |
| `wayfinder:map` | The wayfinder map issue |
| `wayfinder:research` | AFK: resolved by a research subagent |
| `wayfinder:prototype` | HITL: build something cheap to react to |
| `wayfinder:grilling` | HITL: conversation, the default case |
| `wayfinder:task` | Manual work that unblocks a decision |

## GitHub default labels

Also present in `gh label list`, unused by this project's triage flow: `bug`, `documentation`, `duplicate`, `enhancement`, `good first issue`, `help wanted`, `invalid`, `question`.

## Note

Ground truth is `gh label list` — re-run it if this doc and the live repo ever drift.
