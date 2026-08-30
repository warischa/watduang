// Hands the shell's roster to the mockup, so a group that already typed its names once never types
// them again. Drives the mockup's OWN setup controls rather than reaching into its state —
// `docs/agents/browser-verification.md` § "Seed through the trigger, never past it" records why:
// dispatching past a control skips what the control does on the way, and the result is a state no
// player can actually produce.
//
// READS THROUGH roster.ts, never through localStorage directly. ADR-0010 makes roster.ts the sole
// writer of the roster key and scripts/roster-lock-structure-check.mjs enforces that by TEXT: spelling
// the key anywhere else reds the gate. Importing the accessor is also simply better: the key name
// stays in one place, and the try/catch every storage touch needs (issue #7) already lives in read().
import { loadGroup, loadRoster } from '../../shell/roster';
// Shared with the other play routes: the chrome's edit request, and the write-back that makes
// whatever the player finishes this setup with the group the NEXT game inherits.
import { saveOnSetupComplete, takeSetupEditRequest } from '../_setup-bridge';
// The ceiling, read from the rule rather than restated. This mockup refuses to add an eleventh seat
// and its own badge reads "N / 10", so seeding past it would silently drop names.
import { MAX_PLAYERS } from '../../games/zero-trigger';

const START = '#btn-confirm-start-game';
const NAME_INPUT = '.player-name-input';
// This setup has no count field and no stepper. A seat is added by one control and removed by a per
// row control, so growing and shrinking are two different selectors.
const ADD_SEAT = '#btn-add-player';
const REMOVE_SEAT = '.remove-player-btn';
// The route boots on the mockup's MENU screen, and this is the control that shows setup. Only the
// edit flow needs it: renderPlayerRoster() already ran during the engine's own init, so the name
// fields exist and are seedable while the setup section is still hidden.
const GOTO_SETUP = '#btn-goto-setup';

/** The group is the subset the player last ticked; the roster is everyone this device knows. */
function playingNames(): string[] {
  const group = loadGroup();
  if (group.length >= 2) return group;
  return loadRoster().names();
}

/** How many seats the setup screen is showing RIGHT NOW, read off the DOM rather than from a counter
 *  of our own: renderPlayerRoster() rebuilds this list through innerHTML on every change, so the
 *  field count is the one value that cannot drift from what the player would see. */
function seatCount(): number {
  return document.querySelectorAll(NAME_INPUT).length;
}

function seedFromRoster(): void {
  saveOnSetupComplete(START, NAME_INPUT);
  // The chrome's edit control reloads with this flag set. Same seeding, one difference: the setup
  // screen is left ON SCREEN, prefilled, instead of being started — that IS the edit screen.
  const editing = takeSetupEditRequest();
  const names = playingNames();
  // Fewer than two names is not a failure — it is a first-time device, and the mockup's own menu and
  // setup screens are exactly the right thing to show. Bail and leave them alone.
  if (names.length < 2) return;

  const target = Math.min(names.length, MAX_PLAYERS);
  // One click is one seat, so the walk is bounded by the range itself. The bound is a guard against a
  // control that stops moving (add refuses past MAX_PLAYERS, remove is not even rendered at 2 seats),
  // not a retry budget: without it a target the controls cannot reach would spin forever.
  for (let guard = 0; guard <= MAX_PLAYERS && seatCount() !== target; guard++) {
    if (target > seatCount()) {
      const add = document.querySelector<HTMLButtonElement>(ADD_SEAT);
      if (!add) return;
      add.click();
    } else {
      // The LAST row's control, so shrinking drops the tail rather than reshuffling names that are
      // about to be overwritten anyway. Re-queried every pass: each removal re-renders the list.
      const removes = document.querySelectorAll<HTMLButtonElement>(REMOVE_SEAT);
      const last = removes[removes.length - 1];
      if (!last) return;
      last.click();
    }
  }

  // Re-queried after the clicks, never before. renderPlayerRoster() rebuilds the panel through
  // innerHTML, so any field captured earlier is detached by now and writing to it updates nothing.
  const inputs = document.querySelectorAll<HTMLInputElement>(NAME_INPUT);
  if (inputs.length < 2) return;
  inputs.forEach((input, i) => {
    const name = names[i];
    if (name === undefined) return;
    // Direct .value skips the attribute's maxlength — enforce it, or a long saved name overflows.
    input.value = input.maxLength > 0 ? name.slice(0, input.maxLength) : name;
    // The mockup binds `input` on each field itself, so this does not need to bubble — it does anyway,
    // which costs nothing and survives the listener being moved to the container.
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  if (editing) {
    document.querySelector<HTMLButtonElement>(GOTO_SETUP)?.click();
    return;
  }
  document.querySelector<HTMLButtonElement>(START)?.click();
}

// `!== 'complete'`, not `=== 'loading'`, and that difference is load-bearing here. This mockup builds
// its engine inside a DOMContentLoaded listener rather than at module scope, and a bundled module
// runs while readyState is already "interactive" — so the cursed-number form of this guard would
// seed before a single control existed. Listening keeps the order: the engine registered its
// listener first, so it runs first.
if (document.readyState !== 'complete') {
  window.addEventListener('DOMContentLoaded', seedFromRoster, { once: true });
} else {
  seedFromRoster();
}
