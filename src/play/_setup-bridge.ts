// The two halves of the roster<->mockup contract that are IDENTICAL for all three play routes, kept
// in one module because both of them are storage writes: three copies of a write path is the thing
// that drifts, and a drifted copy loses a group's names silently.
//
// Per-game selectors stay in each roster-bridge.ts — those genuinely differ (three mockups, three
// setup DOMs) and are passed in here.
import { loadRoster, saveGroup } from '../shell/roster';
// Same visible-character predicate the roster read uses, so a name that would be dropped on read is
// never written into the group either (a group entry with no roster match is filtered by loadGroup,
// which would silently shrink the group below 2 and fall back to the whole roster).
import { hasVisibleChar } from '../tools/name-list.ts';

// sessionStorage, not localStorage: this flag must not survive the tab, and it must not travel to a
// second tab that never asked to edit. NOT the roster key — scripts/roster-lock-structure-check.mjs
// makes roster.ts the only file allowed to spell that one, and this is a different fact anyway.
const EDIT_KEY = 'watduang:edit-players';

/** The chrome's "edit players" path: mark the intent, then reload.
 *
 *  A RELOAD, not an in-page call into the mockup. Considered and rejected: an exported
 *  openSetup(names) per bridge that re-renders the mockup's setup screen in place. Each mockup is a
 *  different state machine with its own live timers, its own audio, and its own idea of which screen
 *  can be left — three reverse-engineered re-entry paths, each able to leave a half-torn-down round
 *  behind. A reload gets the setup screen from the mockup ITSELF, the way a first-time device does,
 *  on all three routes with no per-game code, and it survives every innerHTML re-render because there
 *  is nothing live to survive. The cost is the round in progress, which editing the players ends in
 *  all three mockups anyway (their setup completes into a NEW match). */
export function requestSetupEdit(): void {
  try {
    sessionStorage.setItem(EDIT_KEY, '1');
  } catch {
    // Private mode / quota: the reload still shows setup, it just re-seeds and starts as usual.
    // A failed edit that lands back in the game is a better outcome than a thrown handler.
  }
  window.location.reload();
}

/** True exactly once per requested reload — reading it clears it, so a later manual refresh goes
 *  back to the normal skip-setup path instead of trapping the device on the setup screen. */
export function takeSetupEditRequest(): boolean {
  try {
    const wanted = sessionStorage.getItem(EDIT_KEY) === '1';
    if (wanted) sessionStorage.removeItem(EDIT_KEY);
    return wanted;
  } catch {
    return false;
  }
}

/** Persists whatever the player left in the mockup's own setup fields when they finish it, so the
 *  next game inherits the edited group. Covers BOTH flows with one listener: the edit flow above and
 *  a first-time device typing its names into the mockup for the first time (which persisted nothing
 *  before — the bridges only ever read).
 *
 *  Document capture, on pointerup AND click: a real touch inside /game/cannon-flag/play/ dispatches
 *  no click at all (measured on gh#144), while the keyboard path fires only click, so either alone is
 *  dead on one input method. The signature check makes the double fire a no-op.
 *
 *  Names are read from the fields, not from the mockup's state, because the state is private to each
 *  mockup — and blanks are dropped rather than guessed: two of the three mockups substitute their own
 *  default label for an empty field, and writing that placeholder into the shared roster would put it
 *  in front of every future game. A player who leaves a field blank keeps that seat for the round and
 *  simply does not persist it. */
export function saveOnSetupComplete(startSelector: string, inputSelector: string): void {
  let lastSaved = '';

  const persist = (): void => {
    // Dedup BEFORE the 2-name floor: roster.add() dedupes but saveGroup() stores raw, so two fields
    // holding the same name would write roster=1/group=2 — the bridges then auto-start every visit
    // while the edit pill (gated on roster>=2) stays hidden, stranding the device in a match.
    const names = [
      ...new Set(
        [...document.querySelectorAll<HTMLInputElement>(inputSelector)]
          .map((input) => input.value.trim())
          .filter((name) => hasVisibleChar(name)),
      ),
    ];
    // Under two names is not a group the mockup would start either — nothing to save.
    if (names.length < 2) return;
    const signature = names.join('\u0000');
    if (signature === lastSaved) return;
    lastSaved = signature;
    void (async () => {
      const roster = loadRoster();
      // add() is the only writer of the roster key and it unions rather than overwrites, so an edited
      // name joins the device's roster without erasing the names this round does not use.
      for (const name of names) await roster.add(name);
      // AFTER the adds land: loadGroup() filters the group by the roster, so a group saved before its
      // names are in the roster reads back empty.
      saveGroup(names);
    })();
  };

  const onStart = (ev: Event): void => {
    if (ev.target instanceof Element && ev.target.closest(startSelector)) persist();
  };

  document.addEventListener('pointerup', onStart, true);
  document.addEventListener('click', onStart, true);
}
