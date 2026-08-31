// Hands the shell's roster to the mockup, so a group that already typed its names once never types
// them again. Runs AFTER main.js, because it drives that module's own setup controls rather than
// reaching into its state — `docs/agents/browser-verification.md` § "Seed through the trigger, never
// past it" records why: dispatching past a control skips what the control does on the way, and the
// result is a state no player can actually produce.
//
// READS THROUGH roster.ts, never through localStorage directly. ADR-0010 makes roster.ts the sole
// writer of the roster key and scripts/roster-lock-structure-check.mjs enforces that by TEXT: spelling
// the key anywhere else reds the gate. Importing the accessor is also simply better: the key name
// stays in one place, and the try/catch every storage touch needs (issue #7) already lives in read().
import { loadGroup, loadRoster } from '../../shell/roster';
// Shared with the other play routes: the chrome's edit request, and the write-back that makes
// whatever the player finishes this setup with the group the NEXT game inherits.
import { saveOnSetupComplete, takeSetupEditRequest } from '../_setup-bridge';
// The ceiling, read from the rule rather than restated: MAX_PLAYERS is also the length of the shared
// cast, so seating past it would repeat an animal.
import { MAX_PLAYERS } from '../../games/cursed-number';

const START = '#startGameBtn';
const NAME_INPUT = '.mascot-name-input';
// This setup has no numeric count field — the count is a stepper plus a row of quick pills, and both
// go through the controller's own setPlayerCount(). The steppers are the pair that can reach EVERY
// value in 2..20; the pills only offer seven of them.
const COUNT_PLUS = '#countPlusBtn';
const COUNT_MINUS = '#countMinusBtn';

/** Drives one of the mockup's own controls the way a player would.
 *
 *  main.js now arms the ghost-tap gate on the panels it reveals (ADR-0017), which ships every button
 *  on a freshly revealed panel `disabled` for 400ms. `HTMLElement.click()` on a disabled form control
 *  returns without dispatching anything and without throwing, so seeding would stop here silently and
 *  the group would be asked to type its names again. Seeding is not a tap: it is this module replaying
 *  what the player already told the device, so it clears the flag for the one call and puts it back.
 *  The gate's own timer still owns when the HUMAN may press the button. Safe on a non-button element:
 *  reading `.disabled` off one yields undefined, which is not `=== true`, so the plain-click path runs
 *  and nothing is written back. */
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
 *  of our own: renderMascotsList() rebuilds this list through innerHTML on every count change, so the
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
  // Fewer than two names is not a failure — it is a first-time device, and the mockup's own setup
  // screen is exactly the right thing to show. Bail and leave it alone.
  if (names.length < 2) return;

  const plus = document.querySelector<HTMLButtonElement>(COUNT_PLUS);
  const minus = document.querySelector<HTMLButtonElement>(COUNT_MINUS);
  if (!plus || !minus) return;

  const target = Math.min(names.length, MAX_PLAYERS);
  // One click is one seat, so the walk is bounded by the range itself. The bound is a guard against a
  // stepper that stops moving (it refuses to go past 2 or past MAX_PLAYERS by design), not a retry
  // budget: without it a target the stepper cannot reach would spin forever.
  for (let guard = 0; guard <= MAX_PLAYERS && seatCount() !== target; guard++) {
    drive(target > seatCount() ? plus : minus);
  }

  // Re-queried after the clicks, never before. renderMascotsList() rebuilds the panel through
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

  if (editing) return;
  const start = document.querySelector<HTMLButtonElement>(START);
  if (start) drive(start);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', seedFromRoster, { once: true });
} else {
  seedFromRoster();
}
