# Starting a round never resumes or discards a live one silently — the player is asked

Decided by the site owner during the [#23](https://github.com/warischa/watduang/issues/23) fix,
2026-08-14. Builds on [ADR-0007](0007-party-size-rule-constrains-the-set-not-the-location.md);
supersedes nothing.

## The problem the #23 fix created

#23 moved player identity into the checkpoint: a round in progress now resumes **from the checkpoint
itself** rather than by comparing player names against whatever the setup panel happens to show. That
removed the round-loss bug, and it created a new ambiguity in its place.

With a live checkpoint for the game being viewed, the panel still lets the group tick a different set
of names and press เริ่มรอบ. Two readings of that press are both defensible and both silent:

- **Resume wins** — the checkpointed round comes back and the tick is ignored.
- **Selection wins** — the ticked group starts a new round and the checkpointed one is gone.

## Why neither silent option was taken

**Resume wins is surprising.** Closed [#7](https://github.com/warischa/watduang/issues/7) settled that
a populated roster gets a selection grid whose whole purpose is "แตะเลือกว่าคืนนี้ใครอยู่" — tap who is
here tonight. A panel that accepts taps and then acts on a different set contradicts the affordance it
was designed around. It loses no data, but it makes the control a lie.

**Selection wins destroys a live round on one tap.** #23 names round loss as the worst failure this
product has: the group is mid-game around one phone, there is no undo and no message, and the round
simply is not there. Reintroducing that as a *feature* of the very fix meant to remove it is not a
trade-off worth making.

The failure both share is silence, not the branch they pick.

## Decision

When a checkpoint exists **for the game whose page is being viewed** and a group is ticked, pressing
เริ่มรอบ asks. Two buttons, and these are the approved strings:

- `กลับไปเล่นรอบที่ค้าง` — resume the checkpointed round; the current tick is not used **for the round**.
  It is still remembered as the group: the tick is persisted before the question is asked, so the names
  the group just picked survive for next time. Only the round's roster comes from the checkpoint.
- `เริ่มรอบใหม่` — discard the checkpointed round and start with the ticked group.

Discarding a round is acceptable **only** behind a labelled button the player pressed on purpose. The
`คนที่ 1, 2, 3…` shortcut is the second entry point into a start and reaches the same choice; it does
not get a silent path of its own.

## Consequence

- The **start** prompt's condition must be **game-specific**. A `siamsi` checkpoint raising a prompt on
  `timebomb`'s page would be #23's symptom 2 in new clothes — that symptom was a game-agnostic
  condition, and the `game` field on the checkpoint envelope exists to make the correct test possible.
  This binds a start, which only ever governs the round *this page* would begin. It does **not** bind the
  clear prompt below, whose reach is wider — see that section for why the same test would be a bug there.
- `เริ่มรอบใหม่` clears the checkpoint before starting, or the fresh round inherits the stale one.
- ADR-0004 and ADR-0007 still bind across both branches: party size clamps on **use**, never on
  **store**. Starting a new round must not rewrite the saved group.
- This is a shell-level rule, not a `siamsi` one. Any future game with a resume step inherits it.

## The other path — `ล้างกลุ่มนี้`, settled by #25

This decision was written governing **starting** a round only, and left `ล้างกลุ่มนี้` as a silent path:
pressing it mid-round wiped the session, the checkpoint, and the saved group with no question asked,
under a label that names the group rather than the round. That behaviour was pre-existing — the #23 work
did not introduce it — but it was the same family of failure, so [#25](https://github.com/warischa/watduang/issues/25)
was filed and the site owner settled it, 2026-08-14: **the clear button asks too.** With a round in
progress it raises the same shape of two-button question. Three cases exist — stranded checkpoint, live
round on this page, both at once — and `clearCopy` in `src/shell/player-select.ts` picks between them.
The owner-approved strings for all three, and the rule that the copy must name every loss the confirm
will actually cause, are in `docs/runbook.md` (#25). Owner approved the live-round and both-signals
pairs on 2026-08-17, accepting that on siamsi's own page the both-case over-names one round; it never
under-names, which was the requirement.

`ยกเลิก` — nothing happens: not the session, not the group, not even the reload. It also takes focus
when the question opens, per the same runbook entry.

Two differences from the start prompt above are load-bearing, and copying the start machinery wholesale
gets both wrong:

- **The condition is site-wide, not game-specific, and it is now two signals, not one: a stranded
  checkpoint OR a round live on this page — never `checkpoint.game === gameId`.** `session.clear()`
  empties the one slot every game shares (`src/shell/session.ts`), so a stranded checkpoint belongs to
  *any* game, not just the one on screen; a game-matched test on that signal would let a press on
  `timebomb`'s page wipe a live `siamsi` round without a word — the very failure being fixed, one page
  over. The second signal, `roundLive`, is site-local by construction: it reads `root.hidden` on the
  page itself, which `PlayerSetup.astro` sets when a round starts on *this* page and never clears back to
  `false`. So the predicate `planClear` actually implements is **"this page has started a round"**, not
  "a round is live right now" — a finished round still on screen also prompts, one extra tap on a screen
  with nothing left to lose. `planClear` takes no `gameId` argument at all: a game-matched implementation
  is not expressible through its signature, and would be wrong for the checkpoint half regardless.
  siamsi is the only checkpoint writer and writes mid-round, so on siamsi's own page both signals name
  the *same* round; the both-signals copy above reads as two rounds when there is one. It over-names
  there and under-names nowhere else — the direction this ADR already errs toward.
- **It shares no state with the start flow — but the open question is itself state.** The semantics are
  confirm/cancel, not resume-vs-fresh, and no group is held across it the way `pendingStart` holds one at
  a start, so it is a sibling of that block rather than a branch of it. It still inherits #23's
  reset-on-transition discipline, and pre-merge review found the case that proves it: because the question
  renders outside the panel, hiding the panel does not take it away. Open it, then start or resume, and it
  sits beside the live round with `ล้างและทิ้งรอบที่ค้าง` armed — a button that clears without asking again.
  One tap would destroy the round the player had just chosen to keep. Every shell-level start or resume
  therefore closes the question first. `เล่นอีกรอบ` is a second door — it mounts the next round directly
  without passing through the shell, so an open question can survive it. That path is left as it is: the
  question stays on screen and its confirm button still names exactly what it destroys, which makes it
  labelled loss, not the silent loss this ADR exists to close.

The question renders **outside `#player-setup`**, alongside the button it answers for. The panel hides
itself once a round starts (`root.hidden = true`); a question inside it would be invisible in the one
situation it exists for, leaving `ล้างกลุ่มนี้` looking like a dead control mid-round.

Tool pages are untouched: `clearsSession={false}` means the press is a no-op before the question is ever
reached, so a tool still cannot see or clear a game's round (ADR-0004). Both the button and the question
stay in the DOM on every page, `hidden` and never removed — removing either would null-deref the island
script and take the whole setup panel down with it (#23).

## Flip-fact re-evaluated 2026-08-17 — still NOT met, but the 2026-08-15 reasoning was wrong

Checked against the code: the manifest now holds six games, not the two the 2026-08-15 entry read off
it. That entry inferred safety from the manifest's *length*, which was never the load-bearing fact —
**siamsi is still the sole checkpoint writer** (the five others only call `markPlayed`, which preserves
the checkpoint), so `planClear`'s absent `gameId` remains correct and #24's resolution to keep the
site-wide slot (ADR-0010) stands. Re-evaluate when a second *writer* enters, not when a game does;
grep the `saveCheckpoint` callers rather than counting the manifest.

What the length-based reading cost: a live round in the five non-checkpoint games was destroyed with no
prompt, because the clear path asked only when a checkpoint existed. Fixed 2026-08-17 by `roundLive`
(`src/shell/player-select.ts`, fed from `PlayerSetup.astro`); see ADR-0010's corrected premise.

Separately, this ADR's invariant was found **violated in implementation** the same day and fixed in
`65d3d3c`: a stale session closure let a `#ss-draw`/`#ss-pass` click landing between `clear()` and
`location.reload()` re-write the checkpoint, after which เริ่มรอบ offered `กลับไปเล่นรอบที่ค้าง` for a
round the player had explicitly discarded — a discard that silently un-discarded. Reproduced 12/12 in
a real browser across 3 write paths with positive and negative controls, 0/12 after the fix. The
decision below was sound; the shell did not honour it.

## The fact that would change this

For the clear half: if a second game ever ships checkpoints, or [#24](https://github.com/warischa/watduang/issues/24)
resolves to per-game slots, then `planClear`'s deliberately absent `gameId` becomes over-broad — the
condition and the question's copy would both have to become game-aware. Today `session.clear()` is
site-wide and only siamsi writes a checkpoint, which is what makes the any-checkpoint predicate correct
rather than merely convenient.

For the start half: if a game ever appears whose rounds are cheap to lose — short enough that a discarded round costs
nothing — the prompt becomes friction rather than protection, and that game would earn a silent
selection-wins path. No such game exists today — the single-shot games are covered by `roundLive`, not
exempted. Permission that could be granted, never permission already held.

## Related

- [#23](https://github.com/warischa/watduang/issues/23) — the checkpoint-identity fix that raised this.
- [#24](https://github.com/warischa/watduang/issues/24) — one checkpoint slot site-wide. Independent of
  this decision, but it governs whether two games can hold a round each in the first place.
- [#7](https://github.com/warischa/watduang/issues/7) — the roster-state panel design this defers to.
- `docs/runbook.md` § "Read closed issues before opening a new question" — why #7 was read before the
  owner was asked, rather than after.
