// Hands the shell's roster to the mockup, so a group that already typed its names once never types
// them again. Runs AFTER main.js, because it drives that module's own setup controls rather than
// reaching into its state — `docs/agents/browser-verification.md` § "Seed through the trigger, never
// past it" records why: dispatching past a control skips what the control does on the way, and the
// result is a state no player can actually produce.
//
// READS THROUGH roster.ts, never through localStorage directly. ADR-0010 makes roster.ts the sole
// writer of the roster key and scripts/roster-lock-structure-check.mjs enforces that by TEXT: spelling
// the key anywhere else reds the gate. It red twice on this file — first when the key was hardcoded
// here, then again when this very comment quoted it, because a text checker cannot tell a use from a
// mention. Both were the gate working. Importing the accessor is also simply better: the key name
// stays in one place, and the try/catch every storage touch needs (issue #7) already lives in read().
import { loadGroup, loadRoster } from '../../shell/roster';
// Shared with the other two play routes: the chrome's edit request, and the write-back that makes
// whatever the player finishes this setup with the group the NEXT game inherits.
import { saveOnSetupComplete, takeSetupEditRequest } from '../_setup-bridge';
// The animal cast a first-time device opens with. One definition, read by every play route.
import { applyMascotDefaults } from '../_mascots';

const START = '#btn-start-match';
const NAME_INPUT = '.player-name-input';

/** Drives one of the mockup's own controls the way a player would.
 *
 *  main.js now arms the ghost-tap gate on the setup screen (ADR-0017), which ships every button on it
 *  `disabled` for 400ms. `HTMLElement.click()` on a disabled form control returns without dispatching
 *  anything and without throwing, so seeding would silently stop here and the group would be asked to
 *  type its names again. Seeding is not a tap: it is this module replaying what the player already
 *  told the device, so it clears the flag for the one call and puts it back. The gate's own timer
 *  still owns when the HUMAN may press the button. */
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

function seedFromRoster(): void {
  saveOnSetupComplete(START, NAME_INPUT);
  // The chrome's edit control reloads with this flag set. Same seeding, one difference: the setup is
  // left ON SCREEN, prefilled, instead of being started — that IS the edit screen, so there is no
  // second setup UI to build or keep in sync with the mockup's own.
  const editing = takeSetupEditRequest();
  const names = playingNames();
  // Fewer than two names is not a failure — it is a first-time device, and the mockup's own setup
  // screen is exactly the right thing to show. Leave the screens alone —
  // only the names they open with change, from a column of numbers to the shared cast (issue #152).
  if (names.length < 2) {
    applyMascotDefaults(NAME_INPUT);
    return;
  }

  const display = document.getElementById('display-player-count');
  const inc = document.getElementById('btn-inc-players');
  const dec = document.getElementById('btn-dec-players');
  const container = document.getElementById('player-names-container');
  const start = document.getElementById('btn-start-match');
  if (!display || !inc || !dec || !container || !start) return;

  // Walk the counter with its own buttons. Capped at 40 presses so a control that stops responding
  // ends the loop instead of spinning forever — a hang here would look like a broken game.
  const target = names.length;
  for (let i = 0; i < 40; i += 1) {
    const current = Number.parseInt(display.textContent ?? '', 10);
    if (!Number.isFinite(current) || current === target) break;
    drive(current < target ? inc : dec);
  }

  // The mockup owns its own min/max. If it clamped the count somewhere else, fill only the rows it
  // actually rendered rather than forcing a number it refused.
  const inputs = container.querySelectorAll<HTMLInputElement>(NAME_INPUT);
  inputs.forEach((input, i) => {
    if (i >= names.length) return;
    // Direct .value skips the attribute's maxlength — enforce it, or a long saved name overflows.
    input.value = input.maxLength > 0 ? names[i].slice(0, input.maxLength) : names[i];
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  if (!editing && inputs.length >= 2) drive(start);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', seedFromRoster, { once: true });
} else {
  seedFromRoster();
}
