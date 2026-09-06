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
// The animal cast a first-time device opens with. One definition, read by every play route.
import { applyMascotDefaults } from '../_mascots';
// The ceiling, read from the rule rather than restated: the mockup's stepper refuses to add an
// eleventh seat, so seeding past it would silently drop names.
import { MAX_PLAYERS } from '../../games/bangkok-drift';

const START = '#startGameBtn';
const NAME_INPUT = '.roster-input';
// This setup has a stepper, not a size grid: one click is one seat in each direction.
const ADD_SEAT = '#incPlayerBtn';
const REMOVE_SEAT = '#decPlayerBtn';

/** Drives one of the mockup's own controls the way a player would.
 *
 *  main.js arms the ghost-tap gate on every screen it reveals (ADR-0017/ADR-0057), which ships each
 *  button on a freshly revealed screen `disabled` for the arm window. `HTMLElement.click()` on a
 *  disabled form control returns without dispatching anything and without throwing, so seeding would
 *  stop here silently and the group would be asked to type its names again. Seeding is not a tap: it
 *  is this module replaying what the player already told the device, so it clears the flag for the one
 *  call and puts it back. The gate's own timer still owns when the HUMAN may press the button. */
function drive(el: HTMLElement): void {
  const btn = el as HTMLButtonElement;
  const wasDisabled = btn.disabled === true;
  if (wasDisabled) btn.disabled = false;
  el.click();
  if (wasDisabled) btn.disabled = true;
}

/** The group is the subset the player last ticked; the roster is everyone this device knows. */
function playingNames(): string[] {
  const group = loadGroup();
  if (group.length >= 2) return group;
  return loadRoster().names();
}

/** How many seats the setup screen is showing RIGHT NOW, read off the DOM rather than from a counter
 *  of our own: renderRoster() rebuilds the list on every step, so the field count is the one value
 *  that cannot drift from what the player would see. */
function seatCount(): number {
  return document.querySelectorAll(NAME_INPUT).length;
}

function seedFromRoster(): void {
  saveOnSetupComplete(START, NAME_INPUT);
  // The chrome's edit control reloads with this flag set. Same seeding, one difference: the setup
  // screen is left ON SCREEN, prefilled, instead of being started — that IS the edit screen.
  const editing = takeSetupEditRequest();
  const names = playingNames();
  // Fewer than two names is not a failure — it is a first-time device, and this mockup already boots
  // on its own setup screen, which is exactly the right thing to show. Nothing is navigated, so the
  // edit request is honoured by simply staying here; only the names the fields open with change,
  // from a column of numbers to the shared cast (issue #152, ADR-0054).
  if (names.length < 2) {
    applyMascotDefaults(NAME_INPUT);
    return;
  }

  const target = Math.min(names.length, MAX_PLAYERS);
  // One click is one seat, so the walk is bounded by the range itself. The bound is a guard against a
  // control that stops moving (the stepper refuses past its own two ends), not a retry budget:
  // without it a target the controls cannot reach would spin forever.
  for (let guard = 0; guard <= MAX_PLAYERS && seatCount() !== target; guard++) {
    const step = document.querySelector<HTMLButtonElement>(
      target > seatCount() ? ADD_SEAT : REMOVE_SEAT,
    );
    if (!step) return;
    const before = seatCount();
    drive(step);
    // A stepper that did not move is a stepper at its end. Stopping here rather than spinning out the
    // guard keeps the seeded count at whatever the control could actually reach.
    if (seatCount() === before) break;
  }

  // Re-queried after the clicks, never before: renderRoster() rebuilds the whole seat list, so any
  // field captured earlier is detached by now and writing to it updates nothing.
  const inputs = document.querySelectorAll<HTMLInputElement>(NAME_INPUT);
  if (inputs.length < 2) return;
  inputs.forEach((input, i) => {
    const name = names[i];
    if (name === undefined) return;
    // Direct .value skips the attribute's maxlength — enforce it, or a long saved name overflows.
    input.value = input.maxLength > 0 ? name.slice(0, input.maxLength) : name;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  // Editing leaves the prefilled setup screen up; that IS the edit screen, and this route needs no
  // navigation to reach it because it boots there.
  if (editing) return;
  const start = document.querySelector<HTMLButtonElement>(START);
  if (start) drive(start);
}

// This mockup wires at module-body time and calls renderRoster() on its last line, so the seat fields
// exist the moment main.js has run — main.js is imported first, so it has. The `loading` guard is only
// for the case where the document has not finished parsing.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', seedFromRoster, { once: true });
} else {
  seedFromRoster();
}
