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

- The prompt's condition must be **game-specific**. A `siamsi` checkpoint raising a prompt on
  `timebomb`'s page would be #23's symptom 2 in new clothes — that symptom was a game-agnostic
  condition, and the `game` field on the checkpoint envelope exists to make the correct test possible.
- `เริ่มรอบใหม่` clears the checkpoint before starting, or the fresh round inherits the stale one.
- ADR-0004 and ADR-0007 still bind across both branches: party size clamps on **use**, never on
  **store**. Starting a new round must not rewrite the saved group.
- This is a shell-level rule, not a `siamsi` one. Any future game with a resume step inherits it.

## What this does NOT cover — one silent path survives

This decision governs **starting** a round. It does not govern `ล้างกลุ่มนี้`.

Pressing that button mid-round still wipes the session, the checkpoint, and the saved group with no
question asked, and its label names the group rather than the round — so a player reaching for it to
tidy up the name list can destroy a live round without being told. It is reachable mid-round because the
button sits outside the panel that hides once a round starts.

That behaviour is **pre-existing** and was not introduced by the #23 work, but it is the same family of
failure this ADR is about, and an honest reading of the title above stops at round-start. Whether the
clear button should route through the same two-button question is a product decision the site owner
owns; it is filed as [#25](https://github.com/warischa/watduang/issues/25) rather than decided here.

## The fact that would change this

If a game ever appears whose rounds are cheap to lose — short enough that a discarded round costs
nothing — the prompt becomes friction rather than protection, and that game would earn a silent
selection-wins path. No such game exists today; both shipped games are built around passing one phone
through a full circle.

## Related

- [#23](https://github.com/warischa/watduang/issues/23) — the checkpoint-identity fix that raised this.
- [#24](https://github.com/warischa/watduang/issues/24) — one checkpoint slot site-wide. Independent of
  this decision, but it governs whether two games can hold a round each in the first place.
- [#7](https://github.com/warischa/watduang/issues/7) — the roster-state panel design this defers to.
- `docs/runbook.md` § "ก่อนเปิดคำถามใหม่ — อ่านใบที่ปิดแล้วก่อน" — why #7 was read before the owner was
  asked, rather than after.
