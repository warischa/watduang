# gh#308 QR mode — REFUTE probes, 2026-11-14

The cross-lineage reviewer's (codex gpt-6.1-sol) probe scripts for the two REFUTE rounds on the QR-mode
artifact, kept as `.txt` so repo tooling never treats them as code. Local paths are replaced by `<repo>/`,
`<judge-scratch>/` and `<local-path>`; to run one, copy it out, restore the paths, and run it with `node`.

- Round 1 (`r1-*`): nine findings — a stale tab re-creating the lobby record after the event committed, a
  late create answer replacing the projector's admin event, a server/local roster mismatch at start, a
  closed notice restoring the previous event's control over the lobby, a failed QR chunk load, and four
  tests that a source mutation left green. Each probe asserts the BUG, so after the fixes it fails its first
  assertion.
- Round 2 (`*-r2`): the final round. Statuses of round 1 plus three spot fixes — a cross-tab late create
  (`late-r2`), a stale poll swallowing a fresh session's polling (`races-r2`), and the review list's count
  going stale on resize. `import-retry-r2` is a browser probe the reviewer could not run (no browser in its
  sandbox): whether a failed dynamic `import()` is re-fetched on retry.

Every finding became a test in the repo (`src/prize-event/setup-qr.test.mjs`, `qr-event.test.mjs`,
`event-qr.test.mjs`, `src/play/prize-draw/lobby.test.mjs`), each shown red when its fix was reverted.
