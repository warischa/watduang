# ADR-0056 — A guard cannot bound a set its platform owns

Date: 2026-08-31 · Status: accepted · Related: [ADR-0045](0045-a-gate-is-audited-against-what-executes-not-what-is-declared.md), [ADR-0049](0049-docs-only-pushes-to-main-still-pay-full-probes.md), gh#171, gh#170

## Context

`scripts/run-workflow-gates.sh` exists so a local green predicts a CI green. It cannot execute every
step CI runs: one fetches an Azure deployment token, one decides whether the browser probes can add
anything. So it must partition the steps `ci.yml` declares into "runnable here" and "not", and the
partition is the whole of its trustworthiness.

The first version partitioned by accident: its extractor read only single-line `run:` commands, so
every multi-line `run: |` block was invisible. It printed `TOTAL=30 FAILS=0` on a tree whose unit
tests were red, and that red reached main (gh#171).

The obvious repair is to classify by the markers a not-runnable step happens to carry — `${{`
expressions, `$GITHUB_OUTPUT` writes. That was implemented, and it works on today's workflow. An
adversarial pass then broke it twice with edits nobody would think twice about:

- Refactor the token step to write `>> "$GITHUB_ENV"` instead of `$GITHUB_OUTPUT`. Its body now
  carries neither marker, so it classifies as runnable, and a local run executes
  `az staticwebapp secrets list` against production.
- Add `${{ matrix.something }}` to the `Unit tests` body. It classifies as not-runnable, and a red
  `npm test` exits 0 again — gh#171, restored, silently.

Both markers are **GitHub's vocabulary**. The set "steps that use a GitHub-only construct" is owned
by GitHub Actions and by whoever next edits the workflow. A guard keyed on it can never converge:
every platform release and every ordinary refactor moves the boundary, in either direction, with no
signal.

## Decision

**Classify on sets this repo owns, checked before any marker rule, and let the markers do only the
work they can do.**

Two guards, both derived from the workflow text on every run — no pinned step names, no indices, no
hand-list, because a pinned list is what rotted the original extractor:

- **Hard-deny.** A body that is credential- or cloud-shaped is not runnable here whatever its
  markers say. Deny wins over every other rule. The predicate is deliberately conservative: getting
  it wrong in the permissive direction runs a production credential fetch on a developer's laptop,
  and getting it wrong in the strict direction only refuses to run something locally.
- **Hard-require.** A body that runs the unit tests must be runnable. If one ever classifies
  otherwise, the script aborts non-zero *before* printing anything a reader could take as a verdict.
  Not a banner note — an abort. A banner disclosure is precisely what let a reader trust
  `TOTAL=30 FAILS=0`.

The marker rules stay, underneath both, because they correctly describe the steps that genuinely
cannot run locally today. What changed is that they are no longer the only thing standing between a
laptop and a production secret.

The exit code carries the consequence: exit is `failed + not-executed`, computed once as
`runnable - executed`, so no skip route can avoid the arithmetic. The expensive browser leg may be
opted out of, and opting out **costs the exit code** and prints "Do not push." A fast path exists; a
clean-looking pass while skipping does not.

## The alternative that was rejected

The adversarial pass proposed inverting the whole thing: allowlist every command CI is permitted to
run locally. Rejected, because an allowlist of every runnable command is a **second GitHub-shaped
set** — it rots on the same schedule as the markers, and its failure mode is silent under-coverage,
which is the gh#171 class exactly. The deny/require pair owns only the two consequences that matter
and leaves the rest to a mechanism that already fails loudly: `parsed != declared` aborts 98.

## What this does not prove

The guards **bound the damage; they do not prove the partition complete.** Both are text predicates
over a file this repo controls, while CI's semantics belong to GitHub.

Named, not left to be discovered:

- A cloud CLI reached through a `uses:` composite action rather than a `run:` body is invisible to a
  text rule. Not reachable today — the deploy proper is a `uses:` action and is never locally
  executed — but it is the shape that would defeat this.
- Path-prefix and wrapper-script evasions of the cloud-CLI sub-rule exist. The credential-word
  sub-rule backstops the actual `secrets list` command, which is why both sub-rules are present
  rather than one.
- The require guard recognises the unit tests by the commands that run them. A future runner that
  invokes them some other way is not recognised, and the guard silently stops applying to it.

## The fact that would change this

If a credential-shaped body stops looking credential-shaped in text — the CLI moved behind a
composite action, or the workflow generated rather than written — then the deny guard sees nothing
and inversion becomes the cheaper answer, because at that point the runnable set is the smaller and
better-known one.
