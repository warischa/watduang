# ADR-0064 — A site-wide preference is not the checkpoint slot, and many writers are safe on it

Date: 2026-09-08 · Status: accepted · Issue: [#165](https://github.com/warischa/watduang/issues/165)

## Context

gh#165 shipped the site's first cross-route preference: `MUTED_KEY = 'watduang:muted'` in
`src/shell/audio.ts`, written by `setMuted()` and read by `isMuted()`. The owner ruled on 2026-09-08
that muting is site-wide rather than per game, defaults to sound on, and silences `boom` as well as
`tick`.

That ruling collides, on its face, with ADR-0010. ADR-0010 settled that this site keeps **one**
checkpoint slot and declined per-game keying — and the reason it could decline was that exactly one
game wrote the slot. Its own flip-fact is "a second checkpoint-writing game entering `manifest.ts`".
gh#227 is about to give the mute key eleven writers.

gh#165's sixth acceptance box asked for this to be written down before that happens, so that a later
reader does not treat ADR-0010 as forbidding it. This ADR is that record. It changes no code and
overturns nothing.

## Decision

**The mute key is site-wide, many writers are allowed on it, and ADR-0010 does not govern it.**

ADR-0010 is about the checkpoint slot — `saveCheckpoint`, `session.ts`, and a paused round. The mute
key is a different key, written through a different module, holding a different kind of value. Its
reasoning does not transfer, because what a colliding write destroys is not the same thing:

| | checkpoint slot (ADR-0010) | mute preference (this ADR) |
|---|---|---|
| what a colliding write destroys | another game's paused round — unreconstructible | the previous boolean |
| cost to the player of a wrong value | a round they were in the middle of | one tap |
| collision semantics | all four fail; see ADR-0010's table | last write wins, and that IS the intent |
| who owns the value | the game that saved it | the device |
| read-side ownership guard | required (`cp.game` compare) | none — there is nothing to disambiguate |

A checkpoint answers "whose round is this?" and needs a guard because two games can each have a
truthful claim. A preference answers "does this phone make noise?" and has exactly one truthful
answer at a time, which is why eleven writers agreeing on one key is the correct shape rather than a
collision to police.

**And the same reasoning settles what happens to the old per-route keys: nothing. They are not
migrated.** gh#227 deleted `pinocchio-sound` and `powermeter_audio` rather than reading them forward
once. A device that had one route muted comes back with sound on, and the player re-mutes in one tap
— which is the same one tap the table above already accepts as the cost of a colliding write. A
migration would be code that runs once per device, can never be tested against a device that has the
old value, and buys back exactly one tap. This is recorded here because six route files cite this ADR
for it; without this paragraph those citations pointed at reasoning that supported the decision but
never stated it.

## What this does not license

- **It is not a general-purpose slot.** Anything whose wrong value costs the player more than one tap
  does not belong here, and gets its own decision.
- **`scripts/checkpoint-writer-check.mjs` is unchanged.** It polices `saveCheckpoint` callers, not
  `localStorage` in general. The mute key deliberately does not go through `session.ts`, so that gate
  neither sees it nor should.
- **It does not reopen ADR-0010.** Per-game checkpoint keying is still declined, the owner closed
  gh#24 on that in 2026-08-19, and ADR-0010's flip-fact still names a checkpoint-writing game — not
  a preference writer.
- **It says nothing about whether the control works.** Reachability, arm-gate coverage and accessible
  naming are gh#165's own tests, ADR-0057 and gh#211 respectively.

## The fact that would change this

A preference whose wrong value costs the player something they cannot restore in one tap — a stored
roster, a purchased state, an accessibility setting a player cannot find again. At that point the
table above stops being the reason, and the new key needs its own decision rather than this one's
precedent.

## Related

- ADR-0010 — the checkpoint slot stays site-wide until a second writer exists
- ADR-0053 — the roster is the identity channel
- ADR-0056 — audible loudness is device-owned
- [#165](https://github.com/warischa/watduang/issues/165) — the control this preference was built for
- [#227](https://github.com/warischa/watduang/issues/227) — the ten existing controls that read it next
