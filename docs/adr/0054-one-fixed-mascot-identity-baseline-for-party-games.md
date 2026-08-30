# ADR-0054 — one fixed mascot identity baseline for party games

Date: 2026-08-29 · Status: accepted (ruling 4 superseded 2026-08-30) · Owner decision (gh#142) ·
Renumbered from 0049 on 2026-08-30, no ruling changed by the renumber

## Why this ADR carries a number it was not accepted under

The owner accepted this decision on 2026-08-29 under gh#142, and it was written to
`docs/adr/0049-one-fixed-mascot-identity-baseline-for-party-games.md` on a working branch that never
reached `main`. In the meantime the number 0049 was taken on `main` by an unrelated ADR about
docs-only pushes paying full probes. Every source comment citing "ADR-0049 ruling N" for a mascot
rule therefore resolved to the wrong document.

The rescue is a renumber and nothing else. **No ruling changed by being renumbered** — the text below
is the accepted text. The one ruling that has changed since acceptance changed for a separate reason,
by a separate owner decision, and is marked as such in place.

Amends [ADR-0040](0040-games-exist-in-one-category-only.md) — the 2–10 range becomes per-game with a
ceiling of 20. Narrowed [ADR-0039](0039-the-shared-roster-belongs-to-one-category-not-to-the-site.md)
— the shared roster stops being the identity channel for party games. **That narrowing rested
entirely on ruling 4 and lapses with it**; see the supersession note under ruling 4.

## Context

Every party game needs players before it can start, and until now each surface answered that its own
way: the shared panel offered `คนที่ 1, 2, 3…`, the tools take typed names, and the mockups ship their
own setup screens. The owner reviewed the freeze-tap (มือลั่น) mockup's setup screen in a browser on
2026-08-29 and ruled it the model for the whole party category. Neither `design/` nor any doc in this
repo defined a mascot list before this ADR — the mockup's `MASCOT_PLAYERS` array is the source.

## Decision

1. **The canonical roster is the 20-mascot list below** — Thai default name, emoji, accent color —
   taken verbatim from the freeze-tap mockup's `MASCOT_PLAYERS` array.
2. **The order is fixed and identical in every party game.** Player 1 is always แมวส้ม, player 2
   always ชิบะ, and so on down the list.
3. **Defaults are ready to play.** No party game may require typing names before starting. Rename
   stays — a player can tap their row to rename.
4. **~~Renames are local to each game.~~ SUPERSEDED by
   [ADR-0053](0053-the-shared-roster-is-the-identity-channel-for-party-games.md)** (owner reversal,
   2026-08-30, gh#164). The ruling as accepted read: *"Renames are local to each game. No cross-game
   persistence; each game owns its player list. The baseline every game must match is data — the
   list, the order, the ceiling — not a shared runtime channel."* The shared roster **is** the
   identity channel for party games; a rename made on a game's setup screen travels to the next game,
   with timebomb (ระเบิดเวลา) as the one named exception. The half of this ruling that survives is the
   data baseline — list, order, ceiling — which is rulings 1, 2 and 5 and is untouched. Kept
   readable rather than deleted: live comments still cite this ruling as the predecessor of the rule
   they now follow.
5. **Player count is per game, set by that game's design, with a site-wide ceiling of 20.**
6. **Scope: party-category games only.** ดูดวง pages and the tools have no players and are untouched.

Rulings 1, 2, 3, 5 and 6 stand as accepted.

| # | Name | Emoji | Color |
|---|---|---|---|
| 1 | แมวส้ม | 🐱 | #FF6B35 |
| 2 | ชิบะ | 🐶 | #2E86AB |
| 3 | บันนี่ | 🐰 | #8E44AD |
| 4 | ฟร็อกกี้ | 🐸 | #27AE60 |
| 5 | หมีทอง | 🐻 | #F39C12 |
| 6 | แพนด้า | 🐼 | #E84393 |
| 7 | เพนกวิน | 🐧 | #00CEC9 |
| 8 | ลูกเจี๊ยบ | 🐥 | #FDCB6E |
| 9 | หมูอ้วน | 🐷 | #FF7675 |
| 10 | สไลม์ดาว | ⭐ | #6C5CE7 |
| 11 | โคอาล่า | 🐨 | #74B9FF |
| 12 | จิ้งจอก | 🦊 | #E17055 |
| 13 | กระรอก | 🐿️ | #D63031 |
| 14 | นากน้อย | 🦦 | #A29BFE |
| 15 | สิงโต | 🦁 | #FFA502 |
| 16 | กวางน้อย | 🦌 | #B33939 |
| 17 | แฮมสเตอร์ | 🐹 | #E58E26 |
| 18 | แรคคูน | 🦝 | #57606F |
| 19 | แมวน้ำ | 🦭 | #70A1FF |
| 20 | มังกรน้อย | 🐲 | #2ED573 |

Colors are provenance, per ADR-0048's token rule: they enter stylesheets as named tokens, never as
hex literals copied into game code.

## Consequences

- The 2–10 party-size claim in visible copy changes shape; gh#89 owns re-pointing its rule and
  re-calibrating its check against the new wording.
- ADR-0039's roster remains for the tools; party games stop reading it as they move to play routes.
  **Superseded with ruling 4** — party games read the shared roster, per ADR-0053.
- ~~A renamed player in one game appearing under their default in the next game is by design, not a
  bug.~~ **Superseded with ruling 4** — the rename travels.

## The fact that would change this

If real groups visibly re-rename the same people at the start of every game, locality was the wrong
call and cross-game persistence returns as a new decision. **That is what happened**, by owner
decision on 2026-08-30 rather than by field observation; ADR-0053 is the new decision.
