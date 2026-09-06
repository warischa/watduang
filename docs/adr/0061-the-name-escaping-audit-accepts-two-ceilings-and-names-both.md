# ADR-0061: the name-escaping audit accepts two ceilings, and an ADR that names one accepts less than it thinks

- Status: accepted
- Date: 2026-09-06
- Tickets: gh#217, gh#216, ADR-0026, ADR-0019

## Context

Player names are attacker-owned text. ADR-0026 puts the guard at the escape sink, at authorship, because the set of things a player might type is not one this repo owns. `src/play/name-escaping.test.mjs` is that guard.

gh#217 recorded that the guard's green is weaker than it reads: `auditFile` builds the full per-hole list, then filters helpers with a test that **short-circuits on the first matching hole** and never loops the rest. One escaped hole green-lights every raw hole in the same file. Reproduced against the real shipped `auditFile` — red at all-raw, green at all-escaped, green at mixed — with a runtime control injecting a genuine anchor element through the raw hole.

Before choosing a resolution, the whole set was audited. All thirteen play routes, fourteen modules (one-bomb ships two), none skipped:

- Escaped at every typed-name sink: cannon-flag, cursed-number, freeze-tap, how-close-is-near, one-bomb, pinocchio-luck, power-meter, short-stick, wire-snip-panic, zero-trigger.
- No HTML sink at all — names reach the page through `textContent` or `input.value`: bangkok-drift, dice-loser, timebomb.

The near misses are all repo-owned values, never typed text: a QA self-test label, a frozen wire-colour table, avatar, index and colour holes. A naive name-shaped predicate would red on every one of them.

The null result was controlled rather than assumed. Four differently-shaped probes were run — name-token holes, alias-assignment followed by an alias hole, bare-identifier holes with no call, and non-template sink right-hand sides — plus the sibling modules, which write only `.value` and `textContent`. All clean.

**A second ceiling was found during that audit, and it is the wider one.** `SINK_WRITE` requires a backtick immediately after the write, so markup composed away from the sink site is **never scanned at all** — not scanned and passed. Three routes are affected: pinocchio-luck writes a setup fragment through a function call, and freeze-tap and power-meter each interpolate a pre-built roster fragment. For those three the `ESCAPED` verdict is earned by other templates in the same file; their roster sinks happen to be escaped, outside the check's sight. Tier 1 behavioural coverage exists for power-meter but not for pinocchio-luck's or freeze-tap's setup rows.

Three resolutions were put to the site owner with their costs: a name-carrying predicate with a per-site exempt list; buying behavioural coverage instead via tier 1 harnesses for the eight routes without one; or an ADR accepting the ceiling.

## Decision

**Accept the ceiling, and record BOTH ceilings, not one.**

The audit is what makes this defensible now, and it was not defensible when gh#217 was filed: nothing live sits under either ceiling today.

The predicate option was declined because its exempt list is the same hand-maintained construct the guard's own header records as having rotted once already, and it would need to exempt the QA label, the wire table and the avatar, index and colour holes on day one — a set this repo does not own, which ADR-0031 says is the wrong input for a classifier.

The behavioural option was not rejected on merit. It is the better guard and it remains the upgrade path. It was not made a precondition for closing gh#217.

**The two accepted ceilings:**

1. **Per-file granularity.** `auditFile` short-circuits on the first matching hole, so one escaped hole green-lights every raw hole in the same file.
2. **Sink-adjacency.** `SINK_WRITE` requires a backtick immediately after the write, so markup composed elsewhere is never scanned. This is the wider gap and the easier one to forget, because a file in this state reads as covered.

## Consequences

A green from this guard means: **no play route was found writing a typed player name into an HTML sink unescaped, at the sinks this check can see.** It does not mean every hole in a file was checked, and it does not mean every sink in a file was read.

The risk accepted, stated plainly because an accepted ceiling is still a hole: a route added tomorrow could land a raw hole beside an escaped one, or compose its markup away from its sink, and pass. That objection was put to the owner and declined. It is recorded here rather than left in a conversation, because a gate green over a known ceiling is a carve-out only for as long as somebody can read why.

This ADR is the reason a reviewer must still read new play-route markup for name interpolation. The gate does not discharge that.

**What reopens this:** a route landing a raw typed-name hole in either blind spot, or tier 1 behavioural coverage arriving for the remaining routes and making the static ceiling moot.

**What must not happen:** this ADR being cited for the per-file ceiling alone. An ADR that accepts one gap while leaving the other undocumented is how this repo previously froze a flattened rule for months and shipped a whole category of pages with the rule silently inverted. Both ceilings, or neither.
