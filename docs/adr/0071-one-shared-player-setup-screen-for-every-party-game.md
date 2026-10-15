# ADR-0071 — one shared player-setup screen for every party game

Date: 2026-10-15 · Status: accepted (owner rulings, grilling + popups, 2026-10-15) · Owner decision ·
Supersedes: [ADR-0053](0053-the-shared-roster-is-the-identity-channel-for-party-games.md) § "The exception: timebomb keeps a local player list" ·
Amends: [ADR-0065](0065-the-party-size-range-is-per-game-not-a-property-of-the-category.md) (where the range is enforced) ·
Relates: [ADR-0054](0054-one-fixed-mascot-identity-baseline-for-party-games.md), [ADR-0033](0033-a-design-value-not-in-the-canvas-is-drift.md), [ADR-0008](0008-starting-a-round-never-resumes-or-discards-one-silently.md), [ADR-0057](0057-closing-a-modal-is-a-reveal.md), gh#264

## Context

ADR-0053 made the shared roster the identity channel for party games: a name typed in one game is that
player in the next. The roster travels; the screen that edits it does not. Each of the 14 party play
routes still renders its own setup screen, and they disagree on the one thing a วง does first — how
many of us are playing. Measured 2026-10-15 across the 14 routes: a −/+ stepper on some, count chips
on others, a seat-pill grid, a bare number field, add/remove-row lists behind a hero screen. Each also
carries its own copy of the plumbing that feeds the roster (a `roster-bridge.ts` per lifted mockup,
`saveOnSetupComplete` calls, and three per-game storage keys that predate the roster).

The owner asked for one module and one screen for every game, a ceiling of 20 with each game setting
its own maximum, the roster passed on to the next game, and a count picked first on the first game.

## Decision

**One player-setup component, mounted by every party play route, inside that route's own URL.** No
players route and no redirect: one game is still one URL, and the edit-players control in `PlayExit`
reopens the component in place instead of reloading the page.

1. **Placement.** The game's own intro (if any) → the shared screen → the game's own non-player
   options → play. The shared screen owns players only; a game's lose condition, scoring rule or
   menu stays in the game.
2. **First visit, empty roster.** A −/+ stepper, starting at **4**, clamped to the game's declared
   `players: [min, max]`. One row per seat. Names are optional: a blank row plays as its mascot.
   That is ADR-0054 ruling 3 ("no party game may require typing names"), not a new rule.
3. **Saved roster.** The same screen, pre-filled, with no stepper. Each row carries a tick (plays this
   round / sits this round out — the name stays in the roster) and an × (removes the name from the
   roster). The list ends with an add-a-player row. Two controls, two meanings: sitting out is not
   leaving the วง. An × removes at once and shows an undo bar for 4 seconds; a mis-tap costs one
   tap, not a retyped name.
4. **Roster above the game's maximum.** The first `max` rows start ticked and the วง chooses. Start is
   disabled while fewer than `min` are ticked. Nobody is dropped silently.
   *(Added 2026-10-15, owner rulings after board approval, frames 9–10.)* **Two rows showing one name
   block start** until one is changed: the roster holds each name once, so letting it through would
   merge two players into one silently. **A start refused at the ceiling says why.** When another tab
   filled the roster to 20 first, the screen re-reads it, closes the add row and names the reason in the
   limit line.
5. **No reordering in v1.** Turn order is roster order; a game that shuffles keeps shuffling itself.
6. **Edit mid-round.** Opening the screen during a round asks first, then restarts the round with the
   new players. A silent restart or a silent continue would break ADR-0008. Every close, cancel and
   confirm path of that dialog arms its region, per ADR-0057.
7. **Ceiling.** The roster holds at most 20 names. This is ADR-0054 ruling 5, not a new ruling; what
   is new is that the constant lives once, in the shared core, and a game declaring a maximum above it
   reds the build.
8. **Colour enters by name.** One structure for every game; the component reads named tokens and each
   route maps them onto its own palette (ADR-0054 / ADR-0048 token rule). The token names and the
   values are drawn on the board, `design/PlayerSetup.dc.html`, built from timebomb's shipped setup
   screen; no value ships that the board does not paint (ADR-0033).

### Data

No new player key. The roster is `watduang:roster`; who plays this round is `watduang:group`. Both
are read and written only through `src/shell/roster.ts` — the roster-lock structure gate keeps that
file the single speller of the key. `_setup-bridge.ts` and the per-route bridges retire once no
importer remains.
*(Amended 2026-10-15, REFUTE rounds 5–6.)* One bookkeeping key, spelled only in `roster.ts`,
records which settings blobs the migration has claimed, so a stale settings save from another tab
cannot bring retired players back; it holds key names, never players. The claim is written and read
back BEFORE importing and withdrawn if the import fails: a device that cannot store it does not
migrate rather than risk resurrecting removed players. Losing an import is the accepted failure mode.

**One-time migration.** When the shared roster is empty, the core imports the names stored under the
per-game keys of timebomb, dice-loser and one-bomb, then deletes those keys. When the shared roster is
not empty, it wins and the per-game keys are deleted unread.
*(Widened 2026-10-15, owner ruling during fan-out.)* freeze-tap's own list (`freeze_tap_players`)
migrates the same way. Three routes kept their players inside a blob that also held game settings —
zero-trigger (`ZERO_TRIGGER_DATA_V1`), short-stick (`short-stick-pro-v2`) and wire-snip-panic
(`wire-panic-v1`); the same rule applies to their players field; once the import is durable the migration rewrites
each blob without it, so the key ends up holding settings only. Until then a route's settings save
carries an existing players field through untouched (never reads it, never adds one), so a failed
import retries on a later mount instead of losing the names.

**Game settings are not players.** *(Owner ruling 2026-10-15.)* A route may keep storing its own
non-player settings — motion, particles, a penalty mode — under keys named in an owned per-route
allowlist in the mount gate. Ruling 1 keeps those options in the route; dropping their persistence
would have been a regression nobody asked for.

## What this supersedes

ADR-0053's exception section kept timebomb on a local list because migrating it "would drop the player
lists real users already have saved under its local key", and named the condition for closing the
exception: migration costing users nothing. **That condition is not met in full, and the owner closed
the exception anyway.** See the accepted losses. From this ADR on, timebomb reads and writes the
shared roster like every other party game, and its `buildContext` no-op `setPlayers` goes with it.

## Accepted losses

- **A device that played timebomb and another party game loses its timebomb list.** The shared roster
  is non-empty there, so the per-game list is dropped, not merged. The migration fully serves
  timebomb-only devices, and the same holds for dice-loser's and one-bomb's keys. A merge was not
  offered: two lists with no common order cannot be merged into the fixed order ADR-0054 ruling 2
  requires without inventing one.
- **Every game gets one extra tap on a return visit.** The pre-filled screen shows before play, even
  when nothing changed. That tap buys the over-maximum choice in ruling 4 and a visible check of who is
  playing.
- **Two legacy seats with one name become one roster entry.** The roster is keyed by name; a list
  that held "บอส" twice imports one บอส.
- **A game loses its own count control.** Several were designed per game (croc-bite's seat pills,
  power-meter's chips); they go. Game-specific options stay.

## What ADR-0065 keeps and what changes

The range stays per game, declared in the manifest; ADR-0065's decision is untouched. What changes is
where the range is admitted: there is one stepper and one clamp, in the shared core, instead of one
per route. `scripts/seat-cap-check.mjs` measures that shared clamp once, and each engine's own seat
limit stays measured per route. The gate's per-route stepper locators go dark when the per-route
steppers are removed, so the gate is retargeted with the first pilot route, not after fan-out.

## Enforcement

A new gate enumerates the party play routes from the manifest at runtime and reds any route that does
not mount the shared screen, or that writes a player key of its own. A route with no mount is a
failure, never a skip, so a route ported later from a mockup with its own setup screen reds on the day
it lands. A rule held only in prose would not stop that port: a mockup brings its setup screen with it.
Mounts and storage are found with the TypeScript and Astro parsers, never by matching text, so a
comment or a string cannot pose as either. Storage the route touches must be on its settings
allowlist; anything else reds. The allowlist is a set this repo owns, so the rule converges; what a
listed key holds is reviewer-owned, and that is the gate's stated ceiling.
`scripts/seat-cap-check.mjs` also runs each route's handoff: the mount's `onStart` must forward its
players unchanged to a named function, which must seat every count from the declared minimum to the
maximum (gh#265).

## The fact that would change this

If a game turns out to need a player control the shared screen cannot express — teams, seat
positions, roles assigned before play — that game needs a slot in the shared screen or its own screen
after it. Neither is licensed here. That is a new ruling, and it is the owner's, not an agent's.
